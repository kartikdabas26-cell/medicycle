import base64
import hashlib
import hmac
import json
import time
import uuid
from datetime import date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import (
    Batch,
    Facility,
    InventoryItem,
    Medicine,
    NetworkAuditLog,
    NetworkTransfer,
    PurchaseOrder,
    TransferRequest,
    WeeklyConsumption,
)
from ..services.security import JWT_SECRET

router = APIRouter(prefix="/api/network", tags=["network-v2"])
ROLES = {"Hospital", "Chemist", "Supplier", "Network Admin", "patient"}

NETWORK_FACILITIES = [
    ("NET-H01", "Central Civil Hospital", "Hospital", "Central District"),
    ("NET-H02", "Metro Specialty", "Hospital", "Metro District"),
    ("NET-C01", "Apollo Chemist", "Chemist", "Central District"),
    ("NET-C02", "MedLife Pharmacy", "Chemist", "East District"),
    ("NET-C03", "City Care Meds", "Chemist", "West District"),
    ("NET-S01", "Apex Pharma Logistics", "Supplier", "Central Distribution Hub"),
    ("NET-S02", "Zenith Drug Distributors", "Supplier", "East Distribution Hub"),
]
NETWORK_MEDICINES = [
    ("NET-M11", "Atorvastatin 20mg", "Atorvastatin", "Chronic / Cardio", "tablets", 0.11),
    ("NET-M12", "Azithromycin 250mg", "Azithromycin", "Antibiotics", "tablets", 0.24),
    ("NET-M13", "Pantoprazole 40mg", "Pantoprazole", "Chronic / Cardio", "tablets", 0.09),
    ("NET-M14", "Paracetamol 650mg", "Paracetamol", "Analgesics", "tablets", 0.06),
    ("NET-M15", "Insulin Regular 100 IU/ml", "Human insulin", "Emergency", "vials", 8.40),
    ("NET-M16", "Hydroxyurea 500mg", "Hydroxycarbamide", "Oncology", "capsules", 0.31),
]
SUPPLIER_NAMES = ("Apex Pharma Logistics", "Zenith Drug Distributors")


class DemoLogin(BaseModel):
    role: Literal["Hospital", "Chemist", "Supplier", "Network Admin"]
    facility_id: str | None = None


class PurchaseOrderRequest(BaseModel):
    facility_id: str
    medicine_id: str
    supplier_name: str
    quantity: int = Field(gt=0, le=1000000)
    force_confirm: bool = False
    save_as_draft: bool = False


class PurchaseOrderSubmission(BaseModel):
    force_confirm: bool = False


class TransferApproval(BaseModel):
    recommendation_id: str


class OrderStatusUpdate(BaseModel):
    status: Literal["Dispatched", "In-Transit", "Delivered & Reconciled"]


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _issue_token(role: str, facility_id: str | None = None) -> str:
    now = int(time.time())
    header = _b64url(b'{"alg":"HS256","typ":"JWT"}')
    payload = _b64url(json.dumps(
        {
            "sub": f"demo-{role.lower().replace(' ', '-')}",
            "role": role,
            "facility_id": facility_id,
            "is_superadmin": role == "Network Admin",
            "iat": now,
            "exp": now + 43200,
        },
        separators=(",", ":"),
    ).encode("utf-8"))
    message = f"{header}.{payload}".encode("ascii")
    signature = _b64url(hmac.new(JWT_SECRET.encode("utf-8"), message, hashlib.sha256).digest())
    return f"{header}.{payload}.{signature}"


def _current_identity(authorization: str | None = Header(default=None)) -> dict[str, str | None]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="A valid demo access token is required")
    token = authorization.removeprefix("Bearer ")
    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(status_code=401, detail="Invalid access token")
    message = f"{parts[0]}.{parts[1]}".encode("ascii")
    expected = _b64url(hmac.new(JWT_SECRET.encode("utf-8"), message, hashlib.sha256).digest())
    if not hmac.compare_digest(expected, parts[2]):
        raise HTTPException(status_code=401, detail="Invalid access token signature")
    try:
        payload = json.loads(base64.urlsafe_b64decode(parts[1] + "=" * (-len(parts[1]) % 4)))
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=401, detail="Invalid access token payload") from exc
    if payload.get("exp", 0) <= int(time.time()):
        raise HTTPException(status_code=401, detail="Access token expired")
    raw_role = payload.get("role", "")
    normalized_role = raw_role if raw_role in ROLES else (raw_role.title() if raw_role.title() in ROLES else None)
    if not normalized_role:
        raise HTTPException(status_code=401, detail="Role is invalid")
    facility_id = payload.get("facility_id")
    if facility_id is not None and not isinstance(facility_id, str):
        raise HTTPException(status_code=401, detail="Invalid facility claim")
    if normalized_role not in {"Network Admin", "patient"} and not facility_id:
        raise HTTPException(status_code=401, detail="A facility-scoped session is required")
    is_superadmin = payload.get("is_superadmin", normalized_role == "Network Admin")
    return {
        "role": normalized_role,
        "facility_id": facility_id,
        "is_superadmin": bool(is_superadmin),
        "email": payload.get("email"),
        "domain": payload.get("domain", normalized_role.lower()),
    }


def _current_role(authorization: str | None = Header(default=None)) -> str:
    return str(_current_identity(authorization)["role"])


def _require_role(role: str, *allowed: str) -> None:
    if role not in allowed:
        raise HTTPException(status_code=403, detail=f"{role} role cannot perform this action")


def _facility_for_identity(identity: dict, db: Session, allowed_types: set[str] | None = None) -> Facility | None:
    facility_id = identity.get("facility_id")
    if not facility_id:
        return None
    facility = db.get(Facility, facility_id)
    if not facility:
        raise HTTPException(status_code=403, detail="Facility claim does not identify a network facility")
    if allowed_types and facility.facility_type not in allowed_types:
        raise HTTPException(status_code=403, detail="Facility type is not authorized for this action")
    return facility


def _ensure_order_facility_access(identity: dict, order: PurchaseOrder) -> None:
    facility_id = identity.get("facility_id")
    if facility_id and identity["role"] != "Network Admin" and facility_id != order.facility_id:
        raise HTTPException(status_code=403, detail="Purchase order is outside your facility scope")


def seed_network_data(db: Session) -> None:
    """Add V2 facilities and medicines without changing the existing V1 demo data."""
    existing_facilities = {f.id for f in db.query(Facility.id).all()}
    for facility_id, name, facility_type, location in NETWORK_FACILITIES:
        if facility_id not in existing_facilities:
            db.add(Facility(
                id=facility_id,
                name=name,
                facility_type=facility_type,
                location=location,
                contact_email=f"operations@{facility_id.lower()}.medicycle.demo",
            ))
    existing_medicines = {m.id for m in db.query(Medicine.id).all()}
    for medicine_id, name, generic_name, category, unit, cost in NETWORK_MEDICINES:
        if medicine_id not in existing_medicines:
            db.add(Medicine(
                id=medicine_id,
                name=name,
                generic_name=generic_name,
                category=category,
                dosage_form="Tablet" if unit == "tablets" else "Injection",
                unit=unit,
                unit_cost=cost,
            ))
    db.flush()

    healthcare_facilities = db.query(Facility).filter(Facility.facility_type != "Supplier").all()
    medicines = db.query(Medicine).all()
    existing_items = {
        (item.facility_id, item.medicine_id)
        for item in db.query(InventoryItem.facility_id, InventoryItem.medicine_id).all()
    }
    today = date.today()
    for facility_index, facility in enumerate(healthcare_facilities):
        for medicine_index, medicine in enumerate(medicines):
            if (facility.id, medicine.id) in existing_items:
                continue
            stock = 220 + ((facility_index * 131 + medicine_index * 79) % 1150)
            safety = max(60, int(stock * 0.32))
            daily = 3 + ((facility_index * 5 + medicine_index * 3) % 16)
            expiry_days = (18, 38, 76, 108, 210, 360)[(facility_index + medicine_index) % 6]
            expiry = today + timedelta(days=expiry_days)
            if medicine.id == "MED-001" and facility.id == "NET-H01":
                stock, safety, daily, expiry = 1900, 300, 28, today + timedelta(days=300)
            elif medicine.id == "MED-001" and facility.id == "NET-C01":
                stock, safety, daily, expiry = 75, 220, 18, today + timedelta(days=250)
            elif medicine.id == "MED-003" and facility.id == "NET-H02":
                stock, safety, daily, expiry = 490, 120, 6, today + timedelta(days=32)
            elif medicine.id == "MED-003" and facility.id == "NET-C02":
                stock, safety, daily, expiry = 50, 160, 9, today + timedelta(days=210)

            inventory_id = f"NETINV-{facility.id}-{medicine.id}"
            db.add(InventoryItem(
                id=inventory_id,
                facility_id=facility.id,
                medicine_id=medicine.id,
                current_stock=stock,
                safety_stock=safety,
                supplier_lead_time_days=2 + (facility_index % 6),
                min_order_quantity=100,
                storage_condition="Cold Chain (2-8°C)" if "Insulin" in medicine.name else "Room Temp (15-25°C)",
            ))
            db.add(Batch(
                id=f"{inventory_id}-B1",
                inventory_item_id=inventory_id,
                batch_number=f"MC{today:%y%m}-{facility_index:02d}{medicine_index:02d}",
                quantity=stock,
                expiry_date=expiry.isoformat(),
            ))
            for week in range(1, 9):
                db.add(WeeklyConsumption(
                    inventory_item_id=inventory_id,
                    week_index=week,
                    quantity=daily * 7 * (95 + ((week + facility_index) % 11)) // 100,
                ))
            existing_items.add((facility.id, medicine.id))
    db.commit()

    if db.query(NetworkTransfer).count() == 0:
        history = [
            ("NET-MOVE-001", "MC-HIST-20261002-01", "MED-001", "Amoxicillin 500mg", "NET-H01", "NET-C01", "Central Civil Hospital", "Apollo Chemist", 320, 38.4, ["Central Civil Hospital", "Apollo Chemist"], 15),
            ("NET-MOVE-002", "MC-HIST-20261005-02", "MED-005", "Metformin 500mg", "NET-H02", "NET-C02", "Metro Specialty", "MedLife Pharmacy", 600, 48.0, ["Metro Specialty", "MedLife Pharmacy"], 12),
            ("NET-MOVE-003", "MC-HIST-20261009-03", "MED-003", "Ceftriaxone 1g", "NET-H02", "NET-C03", "Metro Specialty", "City Care Meds", 45, 171.0, ["Metro Specialty", "City Care Meds"], 25),
        ]
        for index, record in enumerate(history):
            transfer_id, manifest, medicine_id, name, source_id, dest_id, source, dest, quantity, savings, route, days_ago = record
            db.add(NetworkTransfer(
                id=transfer_id,
                manifest_id=manifest,
                medicine_id=medicine_id,
                medicine_name=name,
                source_inventory_id=f"NETINV-{source_id}-{medicine_id}",
                destination_inventory_id=f"NETINV-{dest_id}-{medicine_id}",
                source_facility_name=source,
                destination_facility_name=dest,
                quantity=quantity,
                savings_usd=savings,
                route_json=route,
                status="Delivered & Reconciled",
                approved_by_role="Network Admin",
                created_at=datetime.now() - timedelta(days=days_ago),
            ))
            db.add(NetworkAuditLog(
                actor_role="Network Admin",
                action="transfer.delivered_and_reconciled",
                entity_id=manifest,
                details={"quantity": quantity, "medicine": name, "seeded_demo_history": True, "sequence": index + 1},
                created_at=datetime.now() - timedelta(days=days_ago),
            ))
        db.commit()


def _inventory_rows(db: Session) -> list[dict]:
    now = date.today()
    rows = db.query(InventoryItem).options(
        joinedload(InventoryItem.facility),
        joinedload(InventoryItem.medicine),
        joinedload(InventoryItem.batches),
        joinedload(InventoryItem.consumption_history),
    ).all()
    result = []
    for item in rows:
        history = sorted(item.consumption_history, key=lambda record: record.week_index)
        recent = history[-4:]
        weights = range(1, len(recent) + 1)
        weekly_avg = (
            sum(record.quantity * weight for record, weight in zip(recent, weights, strict=True)) / sum(weights)
            if recent else 0
        )
        daily = weekly_avg / 7
        for batch in item.batches:
            expiry = date.fromisoformat(batch.expiry_date)
            days = (expiry - now).days
            if days < 0:
                risk = "EXPIRED_QUARANTINE"
            elif item.current_stock <= item.safety_stock:
                risk = "CRITICAL_SHORTAGE"
            elif days <= 120 and batch.quantity > daily * days:
                risk = "NEAR_EXPIRY_SALVAGE"
            elif item.current_stock >= item.safety_stock * 1.6:
                risk = "SURPLUS"
            else:
                risk = "OPTIMAL"
            result.append({
                "inventory_id": item.id,
                "facility_id": item.facility_id,
                "facility_name": item.facility.name,
                "facility_type": item.facility.facility_type,
                "medicine_id": item.medicine_id,
                "drug_name": item.medicine.name,
                "generic_name": item.medicine.generic_name,
                "category": item.medicine.category,
                "batch_id": batch.id,
                "batch_number": batch.batch_number,
                "quantity": batch.quantity,
                "current_quantity": item.current_stock,
                "unit": item.medicine.unit,
                "unit_cost": item.medicine.unit_cost,
                "expiry_date": batch.expiry_date,
                "days_to_expiry": days,
                "expiry_band": "red" if days < 60 else ("yellow" if days <= 120 else "green"),
                "risk_status": risk,
                "daily_consumption": round(daily, 2),
                "safety_stock": item.safety_stock,
            })
    return result


def _recommendations(db: Session) -> list[dict]:
    inventory_rows = _inventory_rows(db)
    suggestions: list[dict] = []
    items = {
        item.id: item for item in db.query(InventoryItem).options(
            joinedload(InventoryItem.facility), joinedload(InventoryItem.medicine), joinedload(InventoryItem.batches)
        ).all()
    }
    for recipient_row in inventory_rows:
        if recipient_row["risk_status"] != "CRITICAL_SHORTAGE":
            continue
        recipient = items[recipient_row["inventory_id"]]
        donors = [
            row for row in inventory_rows
            if row["medicine_id"] == recipient.medicine_id
            and row["facility_id"] != recipient.facility_id
            and row["risk_status"] in {"SURPLUS", "NEAR_EXPIRY_SALVAGE"}
            and row["days_to_expiry"] > 0
        ]
        for donor_row in donors:
            donor = items[donor_row["inventory_id"]]
            donor_batch = next((b for b in donor.batches if b.id == donor_row["batch_id"]), None)
            if donor_batch is None:
                continue
            quantity = min(
                max(0, donor.current_stock - donor.safety_stock),
                donor_batch.quantity,
                max(1, recipient.safety_stock - recipient.current_stock),
            )
            if quantity <= 0:
                continue
            days_cover = recipient.current_stock / max(recipient_row["daily_consumption"], 0.1)
            days_to_expiry = donor_row["days_to_expiry"]
            if days_to_expiry < quantity / max(recipient_row["daily_consumption"], 0.1):
                continue
            distance = abs(
                sum(ord(char) for char in donor.facility.location)
                - sum(ord(char) for char in recipient.facility.location)
            ) % 90 + 8
            eta = max(1, round(distance / 32))
            route = [donor.facility.name]
            if distance > 60:
                hubs = db.query(Facility).filter(Facility.facility_type == "Hospital").order_by(Facility.name).all()
                if hubs:
                    route.append(hubs[0].name)
            route.append(recipient.facility.name)
            medicine = donor.medicine
            savings = quantity * medicine.unit_cost
            score = round(
                min(100, max(0, 55 + (45 / (eta + 1)) + min(days_to_expiry, 120) / 12 - days_cover * 1.5 + min(10, savings / 10))),
                1,
            )
            recommendation_id = f"TR-{hashlib.sha1(f'{donor.id}:{donor_batch.id}:{recipient.id}'.encode()).hexdigest()[:10].upper()}"
            suggestions.append({
                "id": recommendation_id,
                "medicine_id": medicine.id,
                "medicine_name": medicine.name,
                "category": medicine.category,
                "unit": medicine.unit,
                "batch_id": donor_batch.id,
                "batch_number": donor_batch.batch_number,
                "source_inventory_id": donor.id,
                "destination_inventory_id": recipient.id,
                "source_facility_name": donor.facility.name,
                "destination_facility_name": recipient.facility.name,
                "quantity": quantity,
                "expiry_date": donor_batch.expiry_date,
                "days_to_expiry": days_to_expiry,
                "estimated_savings_usd": round(savings, 2),
                "priority_score": score,
                "eta_hours": eta * 8,
                "route": route,
                "reason": f"{recipient.facility.name} is below its safety buffer; donor stock can be dispensed within {days_to_expiry} days.",
            })
    return sorted(suggestions, key=lambda suggestion: (-suggestion["priority_score"], suggestion["eta_hours"]))


@router.post("/auth/demo")
def demo_login(payload: DemoLogin):
    matching_facilities = {
        "Hospital": {"NET-H01", "NET-H02"},
        "Chemist": {"NET-C01", "NET-C02", "NET-C03"},
        "Supplier": {"NET-S01", "NET-S02"},
        "Network Admin": set(),
    }
    if payload.facility_id and payload.facility_id not in matching_facilities[payload.role]:
        raise HTTPException(status_code=422, detail="Facility does not belong to the selected demo role")
    if payload.role != "Network Admin" and not payload.facility_id:
        raise HTTPException(status_code=422, detail="Select a facility for this portal")
    if payload.role == "Network Admin" and payload.facility_id:
        raise HTTPException(status_code=422, detail="Network Admin sessions are not facility-scoped")
    return {
        "access_token": _issue_token(payload.role, payload.facility_id),
        "token_type": "bearer",
        "role": payload.role,
        "facility_id": payload.facility_id,
        "expires_in": 43200,
    }


@router.get("/bootstrap")
def bootstrap(identity: dict = Depends(_current_identity), db: Session = Depends(get_db)):
    role = identity["role"]
    facility = _facility_for_identity(identity, db)
    all_facilities = db.query(Facility).order_by(Facility.name).all()
    inventory = _inventory_rows(db)
    if facility:
        facilities = [facility]
        inventory = [row for row in inventory if row["facility_id"] == facility.id]
        inventory_ids = {row["inventory_id"] for row in inventory}
        medicine_ids = {row["medicine_id"] for row in inventory}
        suggestions = [
            suggestion for suggestion in _recommendations(db)
            if suggestion["source_inventory_id"] in inventory_ids
            or suggestion["destination_inventory_id"] in inventory_ids
        ]
        transfers_query = db.query(NetworkTransfer).filter(
            (NetworkTransfer.source_inventory_id.in_(inventory_ids))
            | (NetworkTransfer.destination_inventory_id.in_(inventory_ids))
        ) if inventory_ids else db.query(NetworkTransfer).filter(False)
        orders_query = db.query(PurchaseOrder).filter(
            PurchaseOrder.supplier_name == facility.name
        ) if role == "Supplier" else db.query(PurchaseOrder).filter(
            PurchaseOrder.facility_id == facility.id
        )
        meds = db.query(Medicine).filter(Medicine.id.in_(medicine_ids)).order_by(Medicine.name).all() if medicine_ids else []
    else:
        facilities = all_facilities
        meds = db.query(Medicine).order_by(Medicine.name).all()
        suggestions = _recommendations(db)
        transfers_query = db.query(NetworkTransfer)
        orders_query = db.query(PurchaseOrder)
    transfers = transfers_query.order_by(NetworkTransfer.created_at.desc()).limit(40).all()
    orders = orders_query.order_by(PurchaseOrder.created_at.desc()).limit(40).all()
    order_ids = {order.id for order in orders}
    approved_orders = {
        row.entity_id for row in db.query(NetworkAuditLog.entity_id).filter(
            NetworkAuditLog.action == "purchase_order.approved",
            NetworkAuditLog.entity_id.in_(order_ids) if order_ids else False,
        ).all()
    }
    return {
        "role": role,
        "facilities": [{"id": f.id, "name": f.name, "type": f.facility_type, "location": f.location} for f in facilities],
        "medicines": [{"id": m.id, "name": m.name, "category": m.category, "unit": m.unit, "unit_cost": m.unit_cost} for m in meds],
        "inventory": inventory,
        "suggestions": suggestions,
        "transfers": [{
            "id": t.id, "manifest_id": t.manifest_id, "medicine_name": t.medicine_name,
            "source": t.source_facility_name, "destination": t.destination_facility_name,
            "quantity": t.quantity, "savings_usd": t.savings_usd, "status": t.status,
            "route": t.route_json, "created_at": t.created_at.isoformat(),
        } for t in transfers],
        "orders": [{
            "id": order.id, "facility_name": order.facility_name, "supplier_name": order.supplier_name,
            "medicine_id": order.medicine_id, "medicine_name": order.medicine_name,
            "quantity": order.quantity, "unit_price": order.unit_price, "status": order.status,
            "created_at": order.created_at.isoformat(), "approved": order.id in approved_orders,
        } for order in orders],
    }


@router.get("/analytics")
def analytics(identity: dict = Depends(_current_identity), db: Session = Depends(get_db)):
    role = identity["role"]
    facility = _facility_for_identity(identity, db)
    inventory = _inventory_rows(db)
    if facility:
        inventory = [row for row in inventory if row["facility_id"] == facility.id]
        inventory_ids = {row["inventory_id"] for row in inventory}
        transfers = db.query(NetworkTransfer).filter(
            (NetworkTransfer.source_inventory_id.in_(inventory_ids))
            | (NetworkTransfer.destination_inventory_id.in_(inventory_ids))
        ).all() if inventory_ids else []
    else:
        transfers = db.query(NetworkTransfer).all()
    category_totals: dict[str, int] = {
        "Antibiotics": 0, "Chronic / Cardio": 0, "Oncology": 0, "Emergency": 0,
    }
    for transfer in transfers:
        medicine = db.query(Medicine).filter(Medicine.id == transfer.medicine_id).first()
        category = medicine.category if medicine else "Other"
        if "antibiotic" in category.lower():
            category = "Antibiotics"
        elif "chronic" in category.lower() or "cardio" in category.lower():
            category = "Chronic / Cardio"
        elif "emergency" in category.lower():
            category = "Emergency"
        category_totals[category] = category_totals.get(category, 0) + transfer.quantity
    waste_averted = sum(t.savings_usd for t in transfers)
    if facility:
        months = []
        today = date.today()
        for offset in range(5, -1, -1):
            month_index = today.month - 1 - offset
            year = today.year + month_index // 12
            month = month_index % 12 + 1
            label = date(year, month, 1).strftime("%b")
            value = round(sum(
                transfer.savings_usd for transfer in transfers
                if transfer.created_at.year == year and transfer.created_at.month == month
            ), 2)
            months.append({"month": label, "savings": value, "potential_loss": 0})
        leaderboard = [{"facility": facility.name, "saved_usd": round(waste_averted, 2)}]
    else:
        months = [
            {"month": "May", "savings": 11200, "potential_loss": 16400},
            {"month": "Jun", "savings": 14800, "potential_loss": 18900},
            {"month": "Jul", "savings": 13700, "potential_loss": 17200},
            {"month": "Aug", "savings": 19500, "potential_loss": 21300},
            {"month": "Sep", "savings": 22100, "potential_loss": 23500},
            {"month": "Oct", "savings": waste_averted + 18420, "potential_loss": 26800},
        ]
        leaderboard = [
            {"facility": name, "saved_usd": value} for name, value in [
                ("Central Civil Hospital", 6840), ("Apollo Chemist", 5120), ("Metro Specialty", 4380),
                ("MedLife Pharmacy", 3270), ("City Care Meds", 2890),
            ]
        ]
    return {
        "waste_averted_usd": round(waste_averted, 2),
        "stockouts_prevented": len(transfers),
        "redistribution_units": sum(t.quantity for t in transfers),
        "average_transit_hours": round(sum(max(1, len(t.route_json) * 6) for t in transfers) / max(1, len(transfers)), 1) if transfers else 18.4,
        "category_volume": [{"category": key, "units": value} for key, value in category_totals.items()],
        "monthly_savings": months,
        "leaderboard": leaderboard,
        "inventory_rows": len(inventory),
    }


@router.get("/catalog")
def supplier_catalog(role: str = Depends(_current_role), db: Session = Depends(get_db)):
    medicines = db.query(Medicine).order_by(Medicine.name).all()
    catalog = []
    for index, medicine in enumerate(medicines):
        for supplier_index, supplier in enumerate(SUPPLIER_NAMES):
            unit_price = round(medicine.unit_cost * (1.0 + (0.11 if supplier_index else 0.0) + (index % 4) * 0.018), 2)
            catalog.append({
                "medicine_id": medicine.id,
                "medicine_name": medicine.name,
                "category": medicine.category,
                "supplier_name": supplier,
                "unit_price": unit_price,
                "moq": 100 if supplier_index == 0 else 50,
                "reliability": 98 - supplier_index * 4 - index % 3,
                "lead_time_hours": 24 if supplier_index == 0 else 72,
            })
    return catalog


@router.get("/notifications")
def notifications(identity: dict = Depends(_current_identity), db: Session = Depends(get_db)):
    role = identity["role"]
    facility = _facility_for_identity(identity, db)
    inventory = _inventory_rows(db)
    if facility:
        inventory = [row for row in inventory if row["facility_id"] == facility.id]
    alerts = []
    for row in inventory:
        if row["risk_status"] == "EXPIRED_QUARANTINE":
            alerts.append({
                "id": f"expired-{row['batch_id']}",
                "kind": "expiry",
                "title": f"{row['drug_name']} batch requires quarantine",
                "description": f"{row['facility_name']} · expired {abs(row['days_to_expiry'])} days ago",
                "time": "Immediate action",
            })
        elif row["risk_status"] == "CRITICAL_SHORTAGE":
            alerts.append({
                "id": f"stock-{row['inventory_id']}",
                "kind": "shortage",
                "title": f"{row['drug_name']} below safe buffer",
                "description": row["facility_name"],
                "time": "Action required",
            })
        elif row["days_to_expiry"] <= 45 and row["days_to_expiry"] > 0:
            alerts.append({
                "id": f"expiry-{row['batch_id']}",
                "kind": "expiry",
                "title": f"{row['drug_name']} salvage window",
                "description": f"{row['facility_name']} · {row['days_to_expiry']} days remaining",
                "time": "Near expiry",
            })
    pending_query = db.query(PurchaseOrder).filter(PurchaseOrder.status == "Pending Approval")
    if facility and role == "Supplier":
        pending_query = pending_query.filter(PurchaseOrder.supplier_name == facility.name)
    elif facility:
        pending_query = pending_query.filter(PurchaseOrder.facility_id == facility.id)
    pending = pending_query.count()
    if pending:
        alerts.insert(0, {"id": "orders-pending", "kind": "approval", "title": f"{pending} purchase order(s) need sign-off", "description": "Review procurement queue", "time": "Pending"})
    return alerts[:30]


@router.get("/audit")
def audit_trail(role: str = Depends(_current_role), db: Session = Depends(get_db)):
    _require_role(role, "Network Admin")
    records = db.query(NetworkAuditLog).order_by(NetworkAuditLog.created_at.desc()).limit(100).all()
    return [{
        "id": record.id,
        "actor_role": record.actor_role,
        "action": record.action,
        "entity_id": record.entity_id,
        "details": record.details,
        "created_at": record.created_at.isoformat(),
    } for record in records]


@router.post("/transfers/approve")
def approve_transfer(
    payload: TransferApproval,
    identity: dict = Depends(_current_identity),
    db: Session = Depends(get_db),
):
    role = identity["role"]
    _require_role(role, "Hospital", "Chemist", "Network Admin")
    recommendation = next((r for r in _recommendations(db) if r["id"] == payload.recommendation_id), None)
    if recommendation is None:
        raise HTTPException(status_code=409, detail="Transfer recommendation is no longer available")
    donor = db.query(InventoryItem).options(joinedload(InventoryItem.batches)).filter_by(id=recommendation["source_inventory_id"]).with_for_update().first()
    recipient = db.query(InventoryItem).filter_by(id=recommendation["destination_inventory_id"]).with_for_update().first()
    batch = db.query(Batch).filter_by(id=recommendation["batch_id"]).with_for_update().first()
    if donor is None or recipient is None or batch is None or donor.current_stock < recommendation["quantity"] or batch.quantity < recommendation["quantity"]:
        raise HTTPException(status_code=409, detail="Stock changed; refresh recommendations before dispatch")
    if identity["facility_id"] and identity["facility_id"] != donor.facility_id:
        raise HTTPException(status_code=403, detail="Only the matched donor facility can dispatch this transfer")
    quantity = recommendation["quantity"]
    donor.current_stock -= quantity
    batch.quantity -= quantity
    manifest = f"MC-{datetime.now():%Y%m%d}-{uuid.uuid4().hex[:6].upper()}"
    transfer = NetworkTransfer(
        id=uuid.uuid4().hex,
        manifest_id=manifest,
        medicine_id=recommendation["medicine_id"],
        medicine_name=recommendation["medicine_name"],
        batch_id=batch.id,
        source_inventory_id=donor.id,
        destination_inventory_id=recipient.id,
        source_facility_name=recommendation["source_facility_name"],
        destination_facility_name=recommendation["destination_facility_name"],
        quantity=quantity,
        savings_usd=recommendation["estimated_savings_usd"],
        route_json=recommendation["route"],
        status="In-Transit",
        approved_by_role=role,
    )
    db.add(transfer)
    db.add(NetworkAuditLog(
        actor_role=role, action="transfer.approved_and_dispatched", entity_id=manifest,
        details={"quantity": quantity, "medicine": recommendation["medicine_name"], "route": recommendation["route"]},
    ))
    db.commit()
    return {"status": "success", "manifest_id": manifest, "transfer_id": transfer.id, "route": transfer.route_json, "quantity": quantity}


@router.patch("/transfers/{transfer_id}/status")
def receive_transfer(
    transfer_id: str,
    identity: dict = Depends(_current_identity),
    db: Session = Depends(get_db),
):
    role = identity["role"]
    _require_role(role, "Hospital", "Chemist", "Network Admin")
    transfer = db.query(NetworkTransfer).filter_by(id=transfer_id).with_for_update().first()
    if transfer is None:
        raise HTTPException(status_code=404, detail="Transfer manifest not found")
    if transfer.status != "In-Transit":
        raise HTTPException(status_code=409, detail="Only in-transit transfers can be reconciled")
    recipient = db.query(InventoryItem).filter_by(id=transfer.destination_inventory_id).with_for_update().first()
    source_batch = db.query(Batch).filter_by(id=transfer.batch_id).first()
    if recipient is None or source_batch is None:
        raise HTTPException(status_code=409, detail="Transfer destination or source batch is unavailable")
    if identity["facility_id"] and identity["facility_id"] != recipient.facility_id:
        raise HTTPException(status_code=403, detail="Only the matched recipient facility can reconcile delivery")
    recipient.current_stock += transfer.quantity
    db.add(Batch(
        id=f"{recipient.id}-XFER-{uuid.uuid4().hex[:8].upper()}",
        inventory_item_id=recipient.id,
        batch_number=f"XFER-{source_batch.batch_number}",
        quantity=transfer.quantity,
        expiry_date=source_batch.expiry_date,
    ))
    transfer.status = "Delivered & Reconciled"
    db.add(NetworkAuditLog(
        actor_role=role,
        action="transfer.delivered_and_reconciled",
        entity_id=transfer.manifest_id,
        details={"quantity": transfer.quantity, "medicine": transfer.medicine_name, "destination": transfer.destination_facility_name},
    ))
    db.commit()
    return {"id": transfer.id, "manifest_id": transfer.manifest_id, "status": transfer.status}


@router.post("/purchase-orders")
def create_purchase_order(
    payload: PurchaseOrderRequest,
    identity: dict = Depends(_current_identity),
    db: Session = Depends(get_db),
):
    role = identity["role"]
    _require_role(role, "Hospital", "Chemist", "Network Admin")
    facility = db.query(Facility).filter_by(id=payload.facility_id).first()
    medicine = db.query(Medicine).filter_by(id=payload.medicine_id).first()
    if facility is None or medicine is None:
        raise HTTPException(status_code=404, detail="Facility or medicine not found")
    if identity["facility_id"] and identity["facility_id"] != facility.id:
        raise HTTPException(status_code=403, detail="Purchase orders can only be created for your assigned facility")
    if identity["facility_id"] and facility.facility_type not in {"Hospital", "Chemist"}:
        raise HTTPException(status_code=403, detail="Only a Hospital or Chemist can create purchase orders")
    inventory = _inventory_rows(db)
    surplus = [
        row for row in inventory
        if row["medicine_id"] == medicine.id and row["facility_id"] != facility.id
        and row["risk_status"] in {"SURPLUS", "NEAR_EXPIRY_SALVAGE"} and row["days_to_expiry"] > 0
    ]
    if surplus and not payload.force_confirm and not payload.save_as_draft:
        return {
            "requires_confirmation": True,
            "warnings": [{
                "facility_name": row["facility_name"],
                "quantity": row["quantity"],
                "unit": row["unit"],
                "days_to_expiry": row["days_to_expiry"],
                "message": f"{row['quantity']} units can be sourced from {row['facility_name']} via network transfer.",
            } for row in surplus[:5]],
        }
    if payload.supplier_name not in SUPPLIER_NAMES:
        raise HTTPException(status_code=422, detail="Supplier is not present in the network catalog")
    catalog = supplier_catalog(role, db)
    quote = next((offer for offer in catalog if offer["medicine_id"] == medicine.id and offer["supplier_name"] == payload.supplier_name), None)
    if quote is None:
        raise HTTPException(status_code=404, detail="Supplier quote is unavailable")
    if payload.quantity < quote["moq"]:
        raise HTTPException(status_code=422, detail=f"Minimum order quantity for {payload.supplier_name} is {quote['moq']} units")
    order = PurchaseOrder(
        id=f"PO-{uuid.uuid4().hex[:8].upper()}",
        facility_id=facility.id,
        facility_name=facility.name,
        supplier_name=payload.supplier_name,
        medicine_id=medicine.id,
        medicine_name=medicine.name,
        quantity=payload.quantity,
        unit_price=quote["unit_price"],
        status="Draft" if payload.save_as_draft else "Pending Approval",
    )
    db.add(order)
    db.add(NetworkAuditLog(
        actor_role=role, action="purchase_order.created", entity_id=order.id,
        details={"medicine": medicine.name, "quantity": payload.quantity, "supplier": payload.supplier_name},
    ))
    db.commit()
    return {"requires_confirmation": False, "order_id": order.id, "status": order.status}


@router.post("/purchase-orders/{order_id}/submit")
def submit_purchase_order(
    order_id: str,
    payload: PurchaseOrderSubmission,
    identity: dict = Depends(_current_identity),
    db: Session = Depends(get_db),
):
    role = identity["role"]
    _require_role(role, "Hospital", "Chemist", "Network Admin")
    order = db.query(PurchaseOrder).filter_by(id=order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    _ensure_order_facility_access(identity, order)
    if order.status != "Draft":
        raise HTTPException(status_code=409, detail="Only draft purchase orders can be submitted")
    inventory = _inventory_rows(db)
    surplus = [
        row for row in inventory
        if row["medicine_id"] == order.medicine_id and row["facility_id"] != order.facility_id
        and row["risk_status"] in {"SURPLUS", "NEAR_EXPIRY_SALVAGE"} and row["days_to_expiry"] > 0
    ]
    if surplus and not payload.force_confirm:
        return {
            "requires_confirmation": True,
            "warnings": [{
                "facility_name": row["facility_name"],
                "quantity": row["quantity"],
                "unit": row["unit"],
                "days_to_expiry": row["days_to_expiry"],
                "message": f"{row['quantity']} units can be sourced from {row['facility_name']} via network transfer.",
            } for row in surplus[:5]],
        }
    order.status = "Pending Approval"
    db.add(NetworkAuditLog(
        actor_role=role,
        action="purchase_order.submitted",
        entity_id=order.id,
        details={"force_confirmed_network_surplus": bool(surplus), "quantity": order.quantity},
    ))
    db.commit()
    return {"requires_confirmation": False, "order_id": order.id, "status": order.status}


@router.patch("/purchase-orders/{order_id}/status")
def update_order_status(
    order_id: str,
    payload: OrderStatusUpdate,
    identity: dict = Depends(_current_identity),
    db: Session = Depends(get_db),
):
    role = identity["role"]
    _require_role(role, "Supplier", "Network Admin")
    order = db.query(PurchaseOrder).filter_by(id=order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if role == "Supplier" and identity["facility_id"]:
        supplier_facility = db.get(Facility, identity["facility_id"])
        if not supplier_facility or supplier_facility.name != order.supplier_name:
            raise HTTPException(status_code=403, detail="This supplier order is outside your facility scope")
    allowed = {
        "Pending Approval": {"Dispatched"},
        "Dispatched": {"In-Transit"},
        "In-Transit": {"Delivered & Reconciled"},
        "Delivered & Reconciled": set(),
    }
    if payload.status not in allowed[order.status]:
        raise HTTPException(status_code=409, detail=f"Cannot move order from {order.status} to {payload.status}")
    if order.status == "Pending Approval":
        approved = db.query(NetworkAuditLog.id).filter_by(
            entity_id=order.id, action="purchase_order.approved",
        ).first()
        if approved is None:
            raise HTTPException(status_code=409, detail="Facility approval is required before supplier dispatch")
    if payload.status == "Delivered & Reconciled":
        inventory_item = db.query(InventoryItem).filter_by(
            facility_id=order.facility_id, medicine_id=order.medicine_id,
        ).with_for_update().first()
        if inventory_item is None:
            raise HTTPException(status_code=409, detail="Receiving facility has no inventory record for this medicine")
        inventory_item.current_stock += order.quantity
        received_batch = Batch(
            id=f"{inventory_item.id}-PO-{uuid.uuid4().hex[:8].upper()}",
            inventory_item_id=inventory_item.id,
            batch_number=order.id,
            quantity=order.quantity,
            expiry_date=(date.today() + timedelta(days=365)).isoformat(),
        )
        db.add(received_batch)
    else:
        received_batch = None
    handshake = db.query(TransferRequest).filter_by(supplier_order_id=order.id).first()
    if handshake and payload.status == "Dispatched":
        manifest_data = (
            f"{handshake.id}|{handshake.donor_facility_id}|{handshake.recipient_facility_id}|"
            f"{handshake.medicine_id}|{handshake.batch_id}|{handshake.quantity}|{handshake.expires_at.isoformat()}"
        )
        handshake.manifest_id = "MC-" + hmac.new(
            JWT_SECRET.encode(), manifest_data.encode(), hashlib.sha256,
        ).hexdigest()[:32].upper()
        handshake.updated_at = datetime.now()
        db.add(NetworkAuditLog(
            actor_role=role,
            action="transfer.supplier_manifest_issued",
            entity_id=handshake.id,
            details={"manifest_id": handshake.manifest_id, "purchase_order_id": order.id},
        ))
    if handshake and payload.status == "Delivered & Reconciled":
        handshake.status = "DELIVERED"
        handshake.updated_at = datetime.now()
        db.add(NetworkAuditLog(
            actor_role=role,
            action="transfer.supplier_fallback_delivered",
            entity_id=handshake.id,
            details={"purchase_order_id": order.id, "batch_id": received_batch.id},
        ))
    order.status = payload.status
    db.add(NetworkAuditLog(
        actor_role=role, action="purchase_order.status_changed", entity_id=order.id,
        details={"status": payload.status},
    ))
    db.commit()
    return {"id": order.id, "status": order.status}


@router.post("/purchase-orders/{order_id}/approve")
def approve_purchase_order(
    order_id: str,
    identity: dict = Depends(_current_identity),
    db: Session = Depends(get_db),
):
    role = identity["role"]
    _require_role(role, "Hospital", "Chemist", "Network Admin")
    order = db.query(PurchaseOrder).filter_by(id=order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    _ensure_order_facility_access(identity, order)
    if order.status != "Pending Approval":
        raise HTTPException(status_code=409, detail="Only pending purchase orders can be approved")
    already_approved = db.query(NetworkAuditLog.id).filter_by(
        entity_id=order.id, action="purchase_order.approved",
    ).first()
    if already_approved:
        raise HTTPException(status_code=409, detail="Purchase order already has facility approval")
    db.add(NetworkAuditLog(
        actor_role=role,
        action="purchase_order.approved",
        entity_id=order.id,
        details={"facility": order.facility_name, "supplier": order.supplier_name},
    ))
    db.commit()
    return {"id": order.id, "status": order.status, "approved": True}
