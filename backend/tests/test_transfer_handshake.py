from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.database import Base, get_db
from backend.app.main import app
from backend.app.models import (
    Batch,
    Facility,
    InventoryItem,
    Medicine,
    NetworkAuditLog,
    PurchaseOrder,
    TransferRequest,
)


@pytest.fixture
def handshake_env():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = session_factory()
    session.add_all([
        Facility(id="NET-H01", name="Central Civil Hospital", facility_type="Hospital", location="Central"),
        Facility(id="NET-C01", name="Apollo Chemist", facility_type="Chemist", location="Central"),
        Facility(id="NET-C02", name="MedLife Pharmacy", facility_type="Chemist", location="East"),
        Facility(id="NET-S01", name="Apex Pharma Logistics", facility_type="Supplier", location="Central"),
        Medicine(
            id="NET-M11", name="Atorvastatin 20mg", generic_name="Atorvastatin",
            category="Chronic / Cardio", dosage_form="Tablet", unit="tablets", unit_cost=0.11,
        ),
    ])
    session.flush()
    inventories = [
        InventoryItem(id="recipient", facility_id="NET-H01", medicine_id="NET-M11", current_stock=0,
                      safety_stock=80, supplier_lead_time_days=5),
        InventoryItem(id="donor-primary", facility_id="NET-C01", medicine_id="NET-M11", current_stock=220,
                      safety_stock=20, supplier_lead_time_days=5),
        InventoryItem(id="donor-secondary", facility_id="NET-C02", medicine_id="NET-M11", current_stock=200,
                      safety_stock=20, supplier_lead_time_days=5),
    ]
    session.add_all(inventories)
    session.flush()
    for item_id, quantity in (("recipient", 0), ("donor-primary", 220), ("donor-secondary", 200)):
        session.add(Batch(
            id=f"batch-{item_id}",
            inventory_item_id=item_id,
            batch_number=f"B-{item_id}",
            quantity=quantity,
            expiry_date="2099-12-31",
        ))
    session.commit()
    session.close()

    def override_get_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as client:
            yield client, session_factory
    finally:
        app.dependency_overrides.pop(get_db, None)
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


def login(client: TestClient, role: str, facility_id: str | None = None) -> dict[str, str]:
    response = client.post(
        "/api/network/auth/demo",
        json={"role": role, "facility_id": facility_id},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_donor_consent_dispatch_and_reconciliation(handshake_env):
    client, session_factory = handshake_env
    donor_auth = login(client, "Chemist", "NET-C01")
    recipient_auth = login(client, "Hospital", "NET-H01")

    pending = client.get("/api/transfers/pending-requests", headers=donor_auth)
    assert pending.status_code == 200, pending.text
    request = pending.json()[0]
    created = datetime.fromisoformat(request["created_at"])
    expires = datetime.fromisoformat(request["expires_at"])
    assert expires - created == timedelta(minutes=10)
    assert request["donor_stock_after_release"] >= request["safety_reserve"]
    assert client.post(
        f"/api/transfers/{request['id']}/respond",
        json={"action": "accept"},
        headers=recipient_auth,
    ).status_code == 403

    accepted = client.post(
        f"/api/transfers/{request['id']}/respond",
        json={"action": "accept"},
        headers=donor_auth,
    )
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["status"] == "IN_TRANSIT"
    manifest_id = accepted.json()["manifest_id"]
    assert manifest_id.startswith("MC-")
    db = session_factory()
    assert db.get(InventoryItem, "donor-primary").current_stock == 140
    assert db.get(InventoryItem, "recipient").current_stock == 0
    db.close()

    verification = client.get(f"/api/transfers/{request['id']}/manifest/verify")
    assert verification.status_code == 200
    assert verification.json() == {"manifest_id": manifest_id, "valid": True}
    manifest = client.get(f"/api/transfers/{request['id']}/manifest.pdf", headers=donor_auth)
    assert manifest.status_code == 200
    assert manifest.headers["content-type"] == "application/pdf"

    received = client.post(f"/api/transfers/{request['id']}/receive", headers=recipient_auth)
    assert received.status_code == 200, received.text
    assert received.json()["status"] == "DELIVERED"
    db = session_factory()
    assert db.get(InventoryItem, "recipient").current_stock == 80
    db.close()


def test_donor_decline_fails_over_then_creates_supplier_po(handshake_env):
    client, session_factory = handshake_env
    admin_auth = login(client, "Network Admin")
    admin_pending = client.get("/api/transfers/pending-requests", headers=admin_auth)
    assert admin_pending.status_code == 200, admin_pending.text
    primary = admin_pending.json()[0]
    primary_role = "Chemist"
    primary_auth = login(client, primary_role, primary["donor_facility_id"])
    declined = client.post(
        f"/api/transfers/{primary['id']}/respond",
        json={"action": "decline", "reason": "Local emergency reserve"},
        headers=primary_auth,
    )
    assert declined.status_code == 200, declined.text
    secondary = declined.json()["next_request"]
    assert secondary["status"] == "PENDING_DONOR_CONSENT"
    assert secondary["donor_facility_id"] != primary["donor_facility_id"]

    secondary_auth = login(client, "Chemist", secondary["donor_facility_id"])
    failed_over = client.post(
        f"/api/transfers/{secondary['id']}/respond",
        json={"action": "decline", "reason": "Insufficient local stock"},
        headers=secondary_auth,
    )
    assert failed_over.status_code == 200, failed_over.text
    fallback = failed_over.json()["next_request"]
    assert fallback["status"] == "SUPPLIER_FALLBACK"
    assert fallback["failover_level"] == "Supplier PO"
    db = session_factory()
    assert db.query(TransferRequest).filter_by(status="DONOR_DECLINED").count() == 2
    emergency_order = db.query(PurchaseOrder).filter_by(status="Pending Approval").one()
    assert emergency_order.id.startswith("PO-EMG-")
    assert db.query(NetworkAuditLog).filter_by(
        entity_id=emergency_order.id,
        action="purchase_order.approved",
    ).count() == 1
    order_id = emergency_order.id
    db.close()

    supplier_auth = login(client, "Supplier", "NET-S01")
    status_url = f"/api/network/purchase-orders/{order_id}/status"
    for status in ("Dispatched", "In-Transit", "Delivered & Reconciled"):
        response = client.patch(status_url, json={"status": status}, headers=supplier_auth)
        assert response.status_code == 200, response.text
    ledger = client.get("/api/transfers/ledger", headers=admin_auth)
    delivered = next(row for row in ledger.json() if row["id"] == fallback["id"])
    assert delivered["status"] == "DELIVERED"
    assert client.get(
        f"/api/transfers/{fallback['id']}/manifest/verify",
    ).json()["valid"] is True
    db = session_factory()
    assert db.get(InventoryItem, "recipient").current_stock == 80
    db.close()


def test_ten_minute_timeout_triggers_secondary_offer(handshake_env):
    client, session_factory = handshake_env
    admin_auth = login(client, "Network Admin")
    pending = client.get("/api/transfers/pending-requests", headers=admin_auth)
    assert pending.status_code == 200, pending.text
    first = pending.json()[0]
    db = session_factory()
    row = db.get(TransferRequest, first["id"])
    row.expires_at = datetime.now() - timedelta(seconds=1)
    db.commit()
    db.close()

    donor_auth = login(client, "Chemist", first["donor_facility_id"])
    requests = client.get("/api/transfers/pending-requests", headers=donor_auth)
    assert requests.status_code == 200, requests.text
    assert all(item["id"] != first["id"] for item in requests.json())
    late_response = client.post(
        f"/api/transfers/{first['id']}/respond",
        json={"action": "accept"},
        headers=donor_auth,
    )
    assert late_response.status_code == 400
    assert "10-minute window" in late_response.json()["detail"]
    ledger = client.get("/api/transfers/ledger", headers=admin_auth)
    assert ledger.status_code == 200
    assert any(item["id"] == first["id"] and item["status"] == "EXPIRED_TIMEOUT" for item in ledger.json())
    assert any(item["status"] == "PENDING_DONOR_CONSENT" for item in ledger.json())
