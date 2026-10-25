import pytest
from fastapi.testclient import TestClient

from backend.app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def token_for(client: TestClient, role: str, facility_id: str | None = None) -> dict[str, str]:
    if facility_id is None:
        facility_id = {
            "Hospital": "NET-H01",
            "Chemist": "NET-C01",
            "Supplier": "NET-S01",
        }.get(role)
    response = client.post(
        "/api/network/auth/demo",
        json={"role": role, "facility_id": facility_id},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_demo_portal_token_includes_selected_facility(client: TestClient):
    import base64
    import json

    response = client.post(
        "/api/network/auth/demo",
        json={"role": "Hospital", "facility_id": "NET-H02"},
    )
    assert response.status_code == 200
    encoded_payload = response.json()["access_token"].split(".")[1]
    claims = json.loads(base64.urlsafe_b64decode(encoded_payload + "=" * (-len(encoded_payload) % 4)))
    assert claims["role"] == "Hospital"
    assert claims["facility_id"] == "NET-H02"
    assert client.post("/api/network/auth/demo", json={"role": "Hospital"}).status_code == 422
    assert client.post(
        "/api/network/auth/demo",
        json={"role": "Hospital", "facility_id": "NET-C01"},
    ).status_code == 422


def test_network_seed_and_role_protected_endpoints(client: TestClient):
    assert client.get("/api/network/bootstrap").status_code == 401
    headers = token_for(client, "Network Admin")
    response = client.get("/api/network/bootstrap", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body["facilities"]) >= 7
    assert len(body["medicines"]) >= 12
    assert body["inventory"] and body["suggestions"]
    expired_batches = {
        item["batch_id"] for item in body["inventory"]
        if item["risk_status"] == "EXPIRED_QUARANTINE"
    }
    assert all(item["batch_id"] not in expired_batches for item in body["suggestions"])
    assert client.get("/api/network/audit", headers=token_for(client, "Chemist")).status_code == 403
    assert client.get("/api/network/audit", headers=headers).status_code == 200


def test_facility_sessions_are_scoped_at_api_boundary(client: TestClient):
    hospital = token_for(client, "Hospital", "NET-H02")
    bootstrap = client.get("/api/network/bootstrap", headers=hospital)
    assert bootstrap.status_code == 200
    body = bootstrap.json()
    assert [facility["id"] for facility in body["facilities"]] == ["NET-H02"]
    assert {item["facility_id"] for item in body["inventory"]} == {"NET-H02"}
    analytics = client.get("/api/network/analytics", headers=hospital)
    assert analytics.status_code == 200
    assert {row["facility"] for row in analytics.json()["leaderboard"]} == {"Metro Specialty"}

    cross_facility_order = client.post(
        "/api/network/purchase-orders",
        headers=hospital,
        json={
            "facility_id": "NET-C01",
            "medicine_id": "NET-M11",
            "supplier_name": "Apex Pharma Logistics",
            "quantity": 100,
            "save_as_draft": True,
        },
    )
    assert cross_facility_order.status_code == 403

    admin = token_for(client, "Network Admin")
    recommendations = client.get("/api/network/bootstrap", headers=admin).json()["suggestions"]
    another_facility_donor = next(
        item for item in recommendations
        if not item["source_inventory_id"].startswith("NETINV-NET-H02-")
    )
    cross_facility_transfer = client.post(
        "/api/network/transfers/approve",
        headers=hospital,
        json={"recommendation_id": another_facility_donor["id"]},
    )
    assert cross_facility_transfer.status_code == 403


def test_anti_double_buy_and_purchase_approval_pipeline(client: TestClient):
    hospital = token_for(client, "Chemist", "NET-C01")
    supplier = token_for(client, "Supplier")
    order = {
        "facility_id": "NET-C01",
        "medicine_id": "MED-001",
        "supplier_name": "Apex Pharma Logistics",
        "quantity": 100,
    }
    inventory_before = client.get("/api/network/bootstrap", headers=hospital).json()["inventory"]
    chemist_stock_before = next(row["current_quantity"] for row in inventory_before if row["inventory_id"] == "NETINV-NET-C01-MED-001")
    warning = client.post("/api/network/purchase-orders", json=order, headers=hospital)
    assert warning.status_code == 200
    assert warning.json()["requires_confirmation"] is True
    assert warning.json()["warnings"]
    below_moq = client.post(
        "/api/network/purchase-orders",
        json={**order, "quantity": 10, "force_confirm": True},
        headers=hospital,
    )
    assert below_moq.status_code == 422

    draft = client.post(
        "/api/network/purchase-orders",
        json={**order, "save_as_draft": True},
        headers=hospital,
    )
    assert draft.status_code == 200
    order_id = draft.json()["order_id"]
    assert draft.json()["status"] == "Draft"
    submit_warning = client.post(f"/api/network/purchase-orders/{order_id}/submit", json={}, headers=hospital)
    assert submit_warning.status_code == 200
    assert submit_warning.json()["requires_confirmation"] is True
    submitted = client.post(
        f"/api/network/purchase-orders/{order_id}/submit",
        json={"force_confirm": True},
        headers=hospital,
    )
    assert submitted.status_code == 200
    assert submitted.json()["status"] == "Pending Approval"
    status_url = f"/api/network/purchase-orders/{order_id}/status"
    blocked = client.patch(status_url, json={"status": "Dispatched"}, headers=supplier)
    assert blocked.status_code == 409

    approved = client.post(f"/api/network/purchase-orders/{order_id}/approve", headers=hospital)
    assert approved.status_code == 200
    dispatched = client.patch(status_url, json={"status": "Dispatched"}, headers=supplier)
    assert dispatched.status_code == 200
    assert client.patch(status_url, json={"status": "In-Transit"}, headers=supplier).status_code == 200
    delivered = client.patch(status_url, json={"status": "Delivered & Reconciled"}, headers=supplier)
    assert delivered.status_code == 200
    inventory_after = client.get("/api/network/bootstrap", headers=hospital).json()["inventory"]
    chemist_stock_after = next(row["current_quantity"] for row in inventory_after if row["inventory_id"] == "NETINV-NET-C01-MED-001")
    assert chemist_stock_after == chemist_stock_before + 100


def test_transfer_dispatch_returns_manifest_and_audit(client: TestClient):
    admin = token_for(client, "Network Admin")
    recommendations = client.get("/api/network/bootstrap", headers=admin).json()["suggestions"]
    recommendation = recommendations[0]
    before_rows = client.get("/api/network/bootstrap", headers=admin).json()["inventory"]
    stock_before = next(row["current_quantity"] for row in before_rows if row["inventory_id"] == recommendation["destination_inventory_id"])
    response = client.post(
        "/api/network/transfers/approve",
        json={"recommendation_id": recommendation["id"]},
        headers=admin,
    )
    assert response.status_code == 200, response.text
    assert response.json()["manifest_id"].startswith("MC-")
    assert response.json()["quantity"] > 0
    after_dispatch = client.get("/api/network/bootstrap", headers=admin).json()["inventory"]
    stock_in_transit = next(row["current_quantity"] for row in after_dispatch if row["inventory_id"] == recommendation["destination_inventory_id"])
    assert stock_in_transit == stock_before
    received = client.patch(f"/api/network/transfers/{response.json()['transfer_id']}/status", headers=admin)
    assert received.status_code == 200
    after_receipt = client.get("/api/network/bootstrap", headers=admin).json()["inventory"]
    stock_received = next(row["current_quantity"] for row in after_receipt if row["inventory_id"] == recommendation["destination_inventory_id"])
    assert stock_received == stock_before + response.json()["quantity"]
    audit = client.get("/api/network/audit", headers=admin).json()
    assert any(entry["entity_id"] == response.json()["manifest_id"] for entry in audit)


def test_full_demo_reset_reseeds_v2_data(client: TestClient):
    reset = client.post("/api/demo/reset")
    assert reset.status_code == 200
    bootstrap = client.get("/api/network/bootstrap", headers=token_for(client, "Network Admin"))
    assert bootstrap.status_code == 200
    assert len(bootstrap.json()["facilities"]) >= 13
    assert len(bootstrap.json()["medicines"]) >= 16
    assert any(item["status"] == "Delivered & Reconciled" for item in bootstrap.json()["transfers"])
