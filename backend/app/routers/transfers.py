from fastapi import APIRouter, Depends, Query, HTTPException, Body
from fastapi.responses import StreamingResponse, Response
from sqlalchemy import text
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Literal
import io
import csv
import hashlib
import hmac
import math
import uuid
from datetime import date, datetime, timedelta
from pydantic import BaseModel, Field

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
from .network import (
    JWT_SECRET,
    SUPPLIER_NAMES,
    _current_identity,
    _inventory_rows,
    _recommendations,
)
from ..schemas import TransferRecommendation
from ..services.transfer_optimizer import generate_transfer_recommendations, execute_transfer_approval
from ..services.pdf_generator import generate_transfers_pdf

router = APIRouter(prefix="/api/transfers", tags=["transfers"])
HANDSHAKE_WINDOW = timedelta(minutes=10)
NETWORK_TRANSFER_FACILITIES = {"NET-H01", "NET-H02", "NET-C01", "NET-C02", "NET-C03"}


class TransferResponse(BaseModel):
    action: Literal["accept", "decline"]
    reason: str | None = Field(default=None, max_length=500)


class TransferOverride(BaseModel):
    transfer_id: str
    action: Literal["accept", "reroute", "cancel"]
    reason: str | None = Field(default=None, max_length=500)


def _audit(db: Session, role: str, action: str, request: TransferRequest, details: dict) -> None:
    db.add(NetworkAuditLog(
        actor_role=role,
        action=action,
        entity_id=request.id,
        details={"requisition_key": request.requisition_key, **details},
    ))


def _serialize_request(request: TransferRequest, db: Session) -> dict:
    donor = db.get(Facility, request.donor_facility_id)
    recipient = db.get(Facility, request.recipient_facility_id)
    medicine = db.get(Medicine, request.medicine_id)
    return {
        "id": request.id,
        "requisition_key": request.requisition_key,
        "recommendation_id": request.recommendation_id,
        "donor_facility_id": request.donor_facility_id,
        "donor_facility_name": donor.name if donor else request.donor_facility_id,
        "recipient_facility_id": request.recipient_facility_id,
        "recipient_facility_name": recipient.name if recipient else request.recipient_facility_id,
        "donor_inventory_id": request.donor_inventory_id,
        "recipient_inventory_id": request.recipient_inventory_id,
        "medicine_id": request.medicine_id,
        "medicine_name": medicine.name if medicine else request.medicine_id,
        "batch_id": request.batch_id,
        "quantity": request.quantity,
        "donor_stock_before": request.donor_stock_before,
        "projected_30_day_demand": request.projected_30_day_demand,
        "donor_stock_after_release": request.donor_stock_after_release,
        "safety_reserve": request.safety_reserve,
        "days_to_expiry": request.days_to_expiry,
        "route": request.route_json,
        "eta_hours": request.eta_hours,
        "priority_score": request.priority_score,
        "failover_level": request.failover_level,
        "status": request.status,
        "decline_reason": request.decline_reason,
        "expires_at": request.expires_at.isoformat(),
        "created_at": request.created_at.isoformat(),
        "manifest_id": request.manifest_id,
        "supplier_order_id": request.supplier_order_id,
    }


def _is_supported_facility(db: Session, facility_id: str) -> bool:
    return facility_id in NETWORK_TRANSFER_FACILITIES and db.get(Facility, facility_id) is not None


def _handshake_recommendations(db: Session) -> list[dict]:
    recommendations = []
    for suggestion in _recommendations(db):
        donor = db.get(InventoryItem, suggestion["source_inventory_id"])
        recipient = db.get(InventoryItem, suggestion["destination_inventory_id"])
        if (
            donor and recipient
            and _is_supported_facility(db, donor.facility_id)
            and _is_supported_facility(db, recipient.facility_id)
        ):
            recommendations.append(suggestion)
    return recommendations


def _candidate_details(db: Session, suggestion: dict) -> tuple[InventoryItem, InventoryItem, Batch, int, float, int] | None:
    donor = db.get(InventoryItem, suggestion["source_inventory_id"])
    recipient = db.get(InventoryItem, suggestion["destination_inventory_id"])
    batch = db.get(Batch, suggestion["batch_id"])
    if not donor or not recipient or not batch or batch.quantity <= 0:
        return None
    history = db.query(WeeklyConsumption).filter(
        WeeklyConsumption.inventory_item_id == donor.id,
    ).order_by(WeeklyConsumption.week_index).all()
    recent = history[-4:]
    weights = range(1, len(recent) + 1)
    weighted_weekly = (
        sum(row.quantity * weight for row, weight in zip(recent, weights, strict=True)) / sum(weights)
        if recent else 0.0
    )
    daily_demand = weighted_weekly / 7
    reserve = math.ceil(donor.safety_stock + daily_demand * (donor.supplier_lead_time_days + 14))
    available_surplus = max(0, donor.current_stock - reserve)
    quantity = min(suggestion["quantity"], batch.quantity, available_surplus)
    if quantity <= 0:
        return None
    return donor, recipient, batch, quantity, daily_demand, reserve


def _create_offer(db: Session, suggestion: dict, level: str) -> TransferRequest | None:
    details = _candidate_details(db, suggestion)
    if details is None:
        return None
    donor, recipient, batch, quantity, daily_demand, reserve = details
    now = datetime.now()
    request = TransferRequest(
        id=f"HR-{uuid.uuid4().hex[:12].upper()}",
        requisition_key=f"{recipient.id}:{recipient.medicine_id}",
        recommendation_id=suggestion["id"],
        donor_facility_id=donor.facility_id,
        recipient_facility_id=recipient.facility_id,
        donor_inventory_id=donor.id,
        recipient_inventory_id=recipient.id,
        medicine_id=recipient.medicine_id,
        batch_id=batch.id,
        quantity=quantity,
        donor_stock_before=donor.current_stock,
        projected_30_day_demand=round(daily_demand * 30, 2),
        donor_stock_after_release=donor.current_stock - quantity,
        safety_reserve=reserve,
        days_to_expiry=(date.fromisoformat(batch.expiry_date) - date.today()).days,
        route_json=suggestion["route"],
        eta_hours=suggestion["eta_hours"],
        priority_score=suggestion["priority_score"],
        failover_level=level,
        status="PENDING_DONOR_CONSENT",
        expires_at=now + HANDSHAKE_WINDOW,
        created_at=now,
        updated_at=now,
    )
    db.add(request)
    db.flush()
    _audit(db, "Network System", "transfer.consent_requested", request, {
        "level": level,
        "quantity": quantity,
        "expires_at": request.expires_at.isoformat(),
    })
    return request


def _create_supplier_fallback(db: Session, requisition_key: str, candidates: list[dict], attempts: int) -> TransferRequest | None:
    previous = db.query(TransferRequest).filter_by(
        requisition_key=requisition_key,
    ).order_by(TransferRequest.created_at.desc()).first()
    suggestion = candidates[0] if candidates else None
    details = _candidate_details(db, suggestion) if suggestion else None
    recipient_id = suggestion["destination_inventory_id"] if suggestion else (
        previous.recipient_inventory_id if previous else None
    )
    recipient = db.get(InventoryItem, recipient_id) if recipient_id else None
    if not recipient:
        return None
    medicine = db.get(Medicine, recipient.medicine_id)
    if not medicine:
        return None
    supplier = SUPPLIER_NAMES[0]
    supplier_facility = db.query(Facility).filter(Facility.facility_type == "Supplier").order_by(Facility.id).first()
    if not supplier_facility:
        raise HTTPException(status_code=503, detail="No verified supplier is configured for emergency fallback")
    quantity = max(1, recipient.safety_stock - recipient.current_stock)
    order = PurchaseOrder(
        id=f"PO-EMG-{uuid.uuid4().hex[:10].upper()}",
        facility_id=recipient.facility_id,
        facility_name=recipient.facility.name,
        supplier_name=supplier,
        medicine_id=medicine.id,
        medicine_name=medicine.name,
        quantity=quantity,
        unit_price=medicine.unit_cost,
        status="Pending Approval",
        created_at=datetime.now(),
    )
    db.add(order)
    db.flush()
    db.add(NetworkAuditLog(
        actor_role="Network System",
        action="purchase_order.approved",
        entity_id=order.id,
        details={"facility": recipient.facility.name, "supplier": supplier, "emergency_fallback": True},
    ))
    donor = details[0] if details else None
    now = datetime.now()
    request = TransferRequest(
        id=f"HR-{uuid.uuid4().hex[:12].upper()}",
        requisition_key=requisition_key,
        recommendation_id=suggestion["id"] if suggestion else previous.recommendation_id,
        donor_facility_id=supplier_facility.id,
        recipient_facility_id=recipient.facility_id,
        donor_inventory_id=donor.id if donor else recipient.id,
        recipient_inventory_id=recipient.id,
        medicine_id=medicine.id,
        batch_id=None,
        quantity=quantity,
        donor_stock_before=donor.current_stock if donor else 0,
        projected_30_day_demand=0,
        donor_stock_after_release=donor.current_stock if donor else 0,
        safety_reserve=recipient.safety_stock,
        days_to_expiry=0,
        route_json=[supplier_facility.name, recipient.facility.name],
        eta_hours=72,
        priority_score=suggestion["priority_score"] if suggestion else previous.priority_score,
        failover_level="Supplier PO",
        status="SUPPLIER_FALLBACK",
        expires_at=now,
        supplier_order_id=order.id,
        created_at=now,
        updated_at=now,
    )
    db.add(request)
    db.flush()
    _audit(db, "Network System", "transfer.supplier_fallback_created", request, {
        "supplier": supplier,
        "purchase_order_id": order.id,
        "attempted_donors": attempts,
    })
    return request


def _offer_next_donor(db: Session, requisition_key: str) -> TransferRequest | None:
    active_offer = db.query(TransferRequest).filter(
        TransferRequest.requisition_key == requisition_key,
        TransferRequest.status == "PENDING_DONOR_CONSENT",
    ).first()
    if active_offer:
        return active_offer
    destination_id, medicine_id = requisition_key.split(":", 1)
    suggestions = [
        suggestion for suggestion in _handshake_recommendations(db)
        if suggestion["destination_inventory_id"] == destination_id
        and suggestion["medicine_id"] == medicine_id
    ]
    attempted = {
        row.donor_facility_id for row in db.query(TransferRequest).filter(
            TransferRequest.requisition_key == requisition_key,
            TransferRequest.failover_level != "Supplier PO",
        ).all()
    }
    attempted.intersection_update(NETWORK_TRANSFER_FACILITIES)
    for suggestion in suggestions:
        donor = db.get(InventoryItem, suggestion["source_inventory_id"])
        if donor and donor.facility_id not in attempted:
            request = _create_offer(db, suggestion, "Primary" if not attempted else "Secondary")
            if request:
                return request
            attempted.add(donor.facility_id)
    return _create_supplier_fallback(db, requisition_key, suggestions, len(attempted))


def _ensure_initial_offers(db: Session) -> None:
    dialect = db.get_bind().dialect.name
    if dialect == "sqlite":
        db.execute(text("BEGIN IMMEDIATE"))
    elif dialect == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(73120419)"))
    else:
        raise RuntimeError(f"Unsupported database dialect for transfer offer locking: {dialect}")
    open_requests = db.query(TransferRequest).filter(
        TransferRequest.status == "PENDING_DONOR_CONSENT",
    ).order_by(TransferRequest.created_at).all()
    active_keys = set()
    for request in open_requests:
        if (
            not _is_supported_facility(db, request.donor_facility_id)
            or not _is_supported_facility(db, request.recipient_facility_id)
        ):
            request.status = "REROUTED"
            request.decline_reason = "Facility is outside the role-authenticated network"
            request.updated_at = datetime.now()
            _audit(db, "Network System", "transfer.unsupported_facility_rerouted", request, {})
        elif request.requisition_key in active_keys:
            request.status = "REROUTED"
            request.decline_reason = "Duplicate active offer consolidated into the earliest request"
            request.updated_at = datetime.now()
            _audit(db, "Network System", "transfer.duplicate_offer_consolidated", request, {})
        else:
            active_keys.add(request.requisition_key)
    db.flush()
    active_keys.update({
        row.requisition_key for row in db.query(TransferRequest).filter(
            TransferRequest.status.in_(["PENDING_DONOR_CONSENT", "IN_TRANSIT", "SUPPLIER_FALLBACK"]),
        ).all()
    })
    suggestions = _handshake_recommendations(db)
    seen = set()
    for suggestion in suggestions:
        recipient = db.get(InventoryItem, suggestion["destination_inventory_id"])
        if not recipient:
            continue
        key = f"{recipient.id}:{recipient.medicine_id}"
        if key in active_keys or key in seen:
            continue
        seen.add(key)
        _offer_next_donor(db, key)


def _process_expired(db: Session) -> None:
    now = datetime.now()
    expired = db.query(TransferRequest).filter(
        TransferRequest.status == "PENDING_DONOR_CONSENT",
        TransferRequest.expires_at <= now,
    ).with_for_update().all()
    for request in expired:
        supported = (
            _is_supported_facility(db, request.donor_facility_id)
            and _is_supported_facility(db, request.recipient_facility_id)
        )
        request.status = "EXPIRED_TIMEOUT" if supported else "REROUTED"
        request.decline_reason = (
            "Donor did not respond within the 10-minute window"
            if supported else "Facility is outside the role-authenticated network"
        )
        request.updated_at = now
        _audit(
            db,
            "Network System",
            "transfer.donor_timeout" if supported else "transfer.unsupported_facility_rerouted",
            request,
            {"expired_at": now.isoformat()},
        )
        if supported:
            db.flush()
            _offer_next_donor(db, request.requisition_key)
    db.commit()


def process_expired_handshakes(db: Session) -> None:
    _process_expired(db)


def _accept_request(db: Session, request: TransferRequest, role: str, actor: str) -> dict:
    donor = db.query(InventoryItem).filter(
        InventoryItem.id == request.donor_inventory_id,
    ).with_for_update().first()
    batch = db.query(Batch).filter(Batch.id == request.batch_id).with_for_update().first()
    recipient = db.get(InventoryItem, request.recipient_inventory_id)
    if not donor or not batch or not recipient:
        raise HTTPException(status_code=409, detail="Transfer inventory is no longer available")
    if donor.current_stock < request.quantity or batch.quantity < request.quantity:
        raise HTTPException(status_code=409, detail="Donor stock changed and can no longer fulfill this request")
    donor.current_stock -= request.quantity
    batch.quantity -= request.quantity
    manifest_data = (
        f"{request.id}|{request.donor_facility_id}|{request.recipient_facility_id}|"
        f"{request.medicine_id}|{request.batch_id}|{request.quantity}|{request.expires_at.isoformat()}"
    )
    manifest_id = "MC-" + hmac.new(
        JWT_SECRET.encode(), manifest_data.encode(), hashlib.sha256,
    ).hexdigest()[:32].upper()
    request.status = "IN_TRANSIT"
    request.manifest_id = manifest_id
    request.updated_at = datetime.now()
    _audit(db, role, "transfer.accepted_and_dispatched", request, {
        "actor_facility_id": actor,
        "manifest_id": manifest_id,
        "quantity": request.quantity,
    })
    donor_facility = db.get(Facility, request.donor_facility_id)
    recipient_facility = db.get(Facility, request.recipient_facility_id)
    medicine = db.get(Medicine, request.medicine_id)
    db.add(NetworkTransfer(
        id=request.id,
        manifest_id=manifest_id,
        medicine_id=request.medicine_id,
        medicine_name=medicine.name,
        batch_id=request.batch_id,
        source_inventory_id=donor.id,
        destination_inventory_id=recipient.id,
        source_facility_name=donor_facility.name,
        destination_facility_name=recipient_facility.name,
        quantity=request.quantity,
        savings_usd=round(request.quantity * medicine.unit_cost, 2),
        route_json=request.route_json,
        status="In-Transit",
        approved_by_role=role,
        created_at=datetime.now(),
    ))
    db.commit()
    return _serialize_request(request, db)


@router.get("/pending-requests")
def get_pending_requests(identity: dict = Depends(_current_identity), db: Session = Depends(get_db)):
    role, facility_id = identity["role"], identity["facility_id"]
    if role not in {"Hospital", "Chemist", "Network Admin"}:
        raise HTTPException(status_code=403, detail="This role cannot receive facility transfer requests")
    _process_expired(db)
    _ensure_initial_offers(db)
    db.commit()
    query = db.query(TransferRequest).filter(TransferRequest.status == "PENDING_DONOR_CONSENT")
    if role == "Network Admin":
        rows = query.order_by(TransferRequest.expires_at).all()
    else:
        if not facility_id:
            raise HTTPException(status_code=403, detail="A facility-scoped session is required")
        rows = query.filter(TransferRequest.donor_facility_id == facility_id).order_by(
            TransferRequest.expires_at,
        ).all()
    return [_serialize_request(row, db) for row in rows]


@router.get("/tracking")
def get_transfer_tracking(identity: dict = Depends(_current_identity), db: Session = Depends(get_db)):
    role, facility_id = identity["role"], identity["facility_id"]
    _process_expired(db)
    _ensure_initial_offers(db)
    db.commit()
    query = db.query(TransferRequest)
    if role != "Network Admin":
        if role not in {"Hospital", "Chemist", "Supplier"} or not facility_id:
            raise HTTPException(status_code=403, detail="A facility-scoped network session is required")
        if role == "Supplier":
            query = query.filter(TransferRequest.status == "SUPPLIER_FALLBACK")
            query = query.filter(TransferRequest.donor_facility_id == facility_id)
        else:
            query = query.filter(
                (TransferRequest.recipient_facility_id == facility_id)
                | (TransferRequest.donor_facility_id == facility_id)
            )
            query = query.filter(
                TransferRequest.donor_facility_id.in_(NETWORK_TRANSFER_FACILITIES),
                TransferRequest.recipient_facility_id.in_(NETWORK_TRANSFER_FACILITIES),
            )
    rows = query.order_by(TransferRequest.created_at.desc()).limit(250).all()
    return [_serialize_request(row, db) for row in rows]


@router.get("/ledger")
def get_transfer_ledger(identity: dict = Depends(_current_identity), db: Session = Depends(get_db)):
    if identity["role"] != "Network Admin":
        raise HTTPException(status_code=403, detail="Only Network Admin can access the network transfer ledger")
    _process_expired(db)
    _ensure_initial_offers(db)
    db.commit()
    rows = db.query(TransferRequest).order_by(TransferRequest.created_at.desc()).limit(500).all()
    return [_serialize_request(row, db) for row in rows]


@router.post("/{transfer_id}/respond")
def respond_to_transfer(
    transfer_id: str,
    payload: TransferResponse,
    identity: dict = Depends(_current_identity),
    db: Session = Depends(get_db),
):
    role, facility_id = identity["role"], identity["facility_id"]
    if role not in {"Hospital", "Chemist"} or not facility_id:
        raise HTTPException(status_code=403, detail="Only a facility Hospital or Chemist can respond")
    _process_expired(db)
    request = db.query(TransferRequest).filter_by(id=transfer_id).with_for_update().first()
    if not request:
        raise HTTPException(status_code=404, detail="Transfer request not found")
    if request.donor_facility_id != facility_id:
        raise HTTPException(status_code=403, detail="Only the requested donor facility may respond")
    if request.status == "EXPIRED_TIMEOUT":
        raise HTTPException(
            status_code=400,
            detail="Transfer offer expired after 10-minute window. Auto-rerouted to fallback.",
        )
    if request.status != "PENDING_DONOR_CONSENT":
        raise HTTPException(status_code=409, detail=f"Transfer request is {request.status}")
    if request.expires_at <= datetime.now():
        request.status = "EXPIRED_TIMEOUT"
        request.decline_reason = "Donor did not respond within the 10-minute window"
        _audit(db, "Network System", "transfer.donor_timeout", request, {})
        db.flush()
        _offer_next_donor(db, request.requisition_key)
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="Transfer offer expired after 10-minute window. Auto-rerouted to fallback.",
        )
    if payload.action == "accept":
        return _accept_request(db, request, role, facility_id)
    request.status = "DONOR_DECLINED"
    request.decline_reason = payload.reason or "Donor declined the transfer request"
    request.updated_at = datetime.now()
    _audit(db, role, "transfer.donor_declined", request, {
        "actor_facility_id": facility_id,
        "reason": request.decline_reason,
    })
    db.flush()
    next_offer = _offer_next_donor(db, request.requisition_key)
    if next_offer is None:
        request.status = "REROUTED"
    db.commit()
    return {
        "request": _serialize_request(request, db),
        "next_request": _serialize_request(next_offer, db) if next_offer else None,
        "fallback": next_offer.status == "SUPPLIER_FALLBACK" if next_offer else True,
    }


@router.post("/admin/override")
def override_transfer(
    payload: TransferOverride,
    identity: dict = Depends(_current_identity),
    db: Session = Depends(get_db),
):
    if identity.get("role") != "Network Admin" or not identity.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Only Master Super-Admin can override a transfer")
    _process_expired(db)
    request = db.query(TransferRequest).filter_by(id=payload.transfer_id).with_for_update().first()
    if not request:
        raise HTTPException(status_code=404, detail="Transfer request not found")
    if request.status != "PENDING_DONOR_CONSENT":
        raise HTTPException(status_code=409, detail=f"Transfer request is {request.status}")
    if payload.action == "accept":
        return _accept_request(db, request, "Network Admin", "NOC")
    if payload.action == "cancel":
        request.status = "CANCELLED"
        request.decline_reason = payload.reason or "Cancelled by Network Admin"
        request.updated_at = datetime.now()
        _audit(db, "Network Admin", "transfer.admin_cancelled", request, {"reason": request.decline_reason})
        db.commit()
        return _serialize_request(request, db)
    request.status = "REROUTED"
    request.decline_reason = payload.reason or "Emergency NOC reroute"
    request.updated_at = datetime.now()
    _audit(db, "Network Admin", "transfer.admin_rerouted", request, {"reason": request.decline_reason})
    db.flush()
    next_offer = _offer_next_donor(db, request.requisition_key)
    db.commit()
    return {
        "request": _serialize_request(request, db),
        "next_request": _serialize_request(next_offer, db) if next_offer else None,
        "fallback": next_offer.status == "SUPPLIER_FALLBACK" if next_offer else True,
    }


@router.post("/{transfer_id}/receive")
def receive_transfer(
    transfer_id: str,
    identity: dict = Depends(_current_identity),
    db: Session = Depends(get_db),
):
    role, facility_id = identity["role"], identity["facility_id"]
    if role not in {"Hospital", "Chemist"} or not facility_id:
        raise HTTPException(status_code=403, detail="Only a recipient Hospital or Chemist can reconcile delivery")
    request = db.query(TransferRequest).filter_by(id=transfer_id).with_for_update().first()
    if not request:
        raise HTTPException(status_code=404, detail="Transfer request not found")
    if request.recipient_facility_id != facility_id:
        raise HTTPException(status_code=403, detail="Only the recipient facility may reconcile this transfer")
    if request.status != "IN_TRANSIT":
        raise HTTPException(status_code=409, detail=f"Transfer request is {request.status}")
    recipient = db.query(InventoryItem).filter_by(id=request.recipient_inventory_id).with_for_update().first()
    batch = db.get(Batch, request.batch_id) if request.batch_id else None
    if not recipient:
        raise HTTPException(status_code=409, detail="Receiving inventory record no longer exists")
    recipient.current_stock += request.quantity
    if batch:
        db.add(Batch(
            id=f"{recipient.id}-RCV-{uuid.uuid4().hex[:8].upper()}",
            inventory_item_id=recipient.id,
            batch_number=batch.batch_number,
            quantity=request.quantity,
            expiry_date=batch.expiry_date,
            created_at=datetime.now(),
        ))
    request.status = "DELIVERED"
    request.updated_at = datetime.now()
    transfer = db.query(NetworkTransfer).filter_by(id=request.id).first()
    if transfer:
        transfer.status = "Delivered & Reconciled"
    _audit(db, role, "transfer.delivered_and_reconciled", request, {"recipient_facility_id": facility_id})
    db.commit()
    return _serialize_request(request, db)


@router.get("/{transfer_id}/manifest.pdf")
def export_transfer_manifest(
    transfer_id: str,
    identity: dict = Depends(_current_identity),
    db: Session = Depends(get_db),
):
    request = db.query(TransferRequest).filter_by(id=transfer_id).first()
    if not request or not request.manifest_id:
        raise HTTPException(status_code=404, detail="Dispatched transfer manifest not found")
    if identity["role"] != "Network Admin" and identity["facility_id"] not in {
        request.donor_facility_id, request.recipient_facility_id,
    }:
        raise HTTPException(status_code=403, detail="This manifest is outside your facility scope")
    from reportlab.lib.pagesizes import landscape, letter
    from reportlab.pdfgen import canvas

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=landscape(letter))
    width, height = landscape(letter)
    pdf.setTitle(f"MediCycle Consignment Manifest {request.manifest_id}")
    pdf.setFont("Helvetica-Bold", 22)
    pdf.drawString(48, height - 58, "MEDICYCLE CONSIGNMENT MANIFEST")
    pdf.setFont("Helvetica", 11)
    lines = [
        f"Manifest ID: {request.manifest_id}",
        f"Medicine: {db.get(Medicine, request.medicine_id).name}",
        f"Quantity: {request.quantity}",
        f"Batch ID: {request.batch_id or 'Supplier procurement'}",
        f"Donor: {db.get(Facility, request.donor_facility_id).name}",
        f"Recipient: {db.get(Facility, request.recipient_facility_id).name}",
        f"Route: {' -> '.join(request.route_json)}",
        f"Dispatched: {request.updated_at.isoformat()}",
        f"Verification: /api/transfers/{request.id}/manifest/verify",
    ]
    for index, line in enumerate(lines):
        pdf.drawString(54, height - 105 - index * 24, line)
    pdf.setFont("Helvetica-Oblique", 9)
    pdf.drawString(54, 42, "Digitally verifiable MediCycle manifest. Signature is validated by the MediCycle API.")
    pdf.showPage()
    pdf.save()
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{request.manifest_id}.pdf"'},
    )


@router.get("/{transfer_id}/manifest/verify")
def verify_transfer_manifest(transfer_id: str, db: Session = Depends(get_db)):
    request = db.query(TransferRequest).filter_by(id=transfer_id).first()
    if not request or not request.manifest_id:
        raise HTTPException(status_code=404, detail="Dispatched transfer manifest not found")
    manifest_data = (
        f"{request.id}|{request.donor_facility_id}|{request.recipient_facility_id}|"
        f"{request.medicine_id}|{request.batch_id}|{request.quantity}|{request.expires_at.isoformat()}"
    )
    expected = "MC-" + hmac.new(
        JWT_SECRET.encode(), manifest_data.encode(), hashlib.sha256,
    ).hexdigest()[:32].upper()
    return {"manifest_id": request.manifest_id, "valid": hmac.compare_digest(expected, request.manifest_id)}

@router.get("", response_model=List[TransferRecommendation])
def get_transfers(
    surge_pct: float = Query(0.0, ge=0.0, le=100.0),
    db: Session = Depends(get_db)
):
    surge_multiplier = 1.0 + (surge_pct / 100.0)
    recs = generate_transfer_recommendations(db, surge_multiplier=surge_multiplier)
    return recs

@router.post("/approve")
def approve_transfer(
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """
    Approves and applies the transfer, deducting units from source and adding to destination.
    """
    required_fields = (
        "source_facility_id",
        "dest_facility_id",
        "medicine_id",
        "suggested_quantity",
        "source_facility_name",
        "dest_facility_name",
    )
    missing_fields = [field for field in required_fields if field not in payload]
    if missing_fields:
        raise HTTPException(
            status_code=422,
            detail=f"Missing required transfer fields: {', '.join(missing_fields)}",
        )
    if any(not isinstance(payload[field], str) or not payload[field].strip()
           for field in required_fields if field != "suggested_quantity"):
        raise HTTPException(status_code=422, detail="Transfer facility and medicine fields must be non-empty strings")
    quantity = payload["suggested_quantity"]
    if isinstance(quantity, bool) or not isinstance(quantity, int) or quantity <= 0:
        raise HTTPException(status_code=422, detail="suggested_quantity must be a positive integer")

    res = execute_transfer_approval(db, payload)
    if res["status"] == "error":
        raise HTTPException(status_code=400, detail=res["message"])
    return res

@router.get("/export/csv")
def export_transfers_csv(
    surge_pct: float = Query(0.0, ge=0.0, le=100.0),
    db: Session = Depends(get_db)
):
    surge_multiplier = 1.0 + (surge_pct / 100.0)
    recs = generate_transfer_recommendations(db, surge_multiplier=surge_multiplier)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Recommendation_ID", "Urgency", "Medicine", "Quantity", "Source_Facility",
        "Destination_Facility", "Source_Remaining_Stock", "Dest_Days_Cover_Before",
        "Dest_Days_Cover_After", "Donor_Coverage_Days_Post", "Clinical_Justification"
    ])

    for r in recs:
        writer.writerow([
            r["id"],
            r["urgency"],
            r["medicine_name"],
            f"{r['suggested_quantity']} {r.get('unit', '')}",
            r["source_facility_name"],
            r["dest_facility_name"],
            r["source_stock_remaining"],
            r["dest_days_cover_before"],
            r["dest_days_cover_after"],
            r["donor_coverage_days_post_transfer"],
            r["reason"]
        ])

    csv_bytes = output.getvalue().encode("utf-8")
    filename = f"medicycle_transfers_{datetime.now().strftime('%Y%m%d')}.csv"
    return Response(
        content=csv_bytes,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(csv_bytes)),
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )

@router.get("/export/pdf")
def export_transfers_pdf(
    surge_pct: float = Query(0.0, ge=0.0, le=100.0),
    db: Session = Depends(get_db)
):
    """
    Generates and downloads a clean, professional hospital-style PDF report of transfer recommendations.
    """
    try:
        surge_multiplier = 1.0 + (surge_pct / 100.0)
        recs = generate_transfer_recommendations(db, surge_multiplier=surge_multiplier)
        pdf_bytes = generate_transfers_pdf(recs, surge_pct=surge_pct)
        filename = f"medicycle_transfer_report_{datetime.now().strftime('%Y%m%d')}.pdf"

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Length": str(len(pdf_bytes)),
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate transfer PDF report: {str(e)}")
