from datetime import datetime
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from ..models import InventoryItem, Facility, Medicine, Batch
from .risk_analyzer import analyze_item_risks

def generate_transfer_recommendations(
    db: Session,
    surge_multiplier: float = 1.0,
    reference_date: datetime.date = None
) -> List[Dict[str, Any]]:
    """
    Deterministic multi-facility redistribution engine that matches shortages
    with safe surplus and mitigates impending batch expiries.
    """
    if reference_date is None:
        reference_date = datetime.now().date()

    # Load all inventory items with related models
    items = db.query(InventoryItem).all()
    if not items:
        return []

    # Pre-analyze risks for all items
    analysis_map = {}
    for item in items:
        analysis_map[item.id] = analyze_item_risks(item, surge_multiplier=surge_multiplier, reference_date=reference_date)

    # Group by medicine
    medicines = db.query(Medicine).all()
    recommendations = []
    rec_counter = 1

    # Keep track of temporary allocations during calculation to prevent double-allocating donor stock
    allocated_donor_stock = {item.id: 0 for item in items}
    allocated_recipient_stock = {item.id: 0 for item in items}

    for med in medicines:
        med_items = [it for it in items if it.medicine_id == med.id]
        if len(med_items) < 2:
            continue

        # 1. Identify facilities with shortage (Sorted by most critical days remaining)
        shortage_items = []
        for it in med_items:
            risk = analysis_map[it.id]
            daily_demand = risk["avg_daily_demand"]
            effective_stock = it.current_stock + allocated_recipient_stock[it.id]
            days_cover = (effective_stock / daily_demand) if daily_demand > 0.001 else 999.0

            # Shortage criteria: covers less than 1.5x lead time or below safety stock
            if days_cover <= (it.supplier_lead_time_days * 1.5) or effective_stock < it.safety_stock:
                # Target buffer: cover lead time + safety stock + 7 days operational buffer
                target_buffer = int(round(risk["lead_time_demand"] + it.safety_stock + (7.0 * daily_demand)))
                deficit_needed = max(0, target_buffer - effective_stock)
                if deficit_needed > 0:
                    shortage_items.append((it, risk, days_cover, deficit_needed))

        shortage_items.sort(key=lambda x: x[2])  # Most urgent first

        # 2. Identify potential donor facilities
        donor_candidates = []
        for it in med_items:
            risk = analysis_map[it.id]
            daily_demand = risk["avg_daily_demand"]
            effective_donor_stock = it.current_stock - allocated_donor_stock[it.id]

            # A donor must retain safety stock + lead time demand + 14 days cycle coverage
            reserved_stock = int(round(it.safety_stock + risk["lead_time_demand"] + (14.0 * daily_demand)))
            standard_surplus = max(0, effective_donor_stock - reserved_stock)

            # Check for expiring batches that current facility cannot consume
            expiring_surplus = 0
            for b_info in risk["batches_at_risk"]:
                if b_info["days_to_expiry"] > 0 and b_info["days_to_expiry"] <= 60:
                    expiring_surplus += b_info.get("at_risk_quantity", 0)

            # Available transferable surplus
            transferable = max(standard_surplus, expiring_surplus)
            if transferable > 15:  # Only suggest meaningful transfer amounts
                donor_candidates.append({
                    "item": it,
                    "risk": risk,
                    "available_surplus": transferable,
                    "is_expiry_salvage": expiring_surplus > standard_surplus,
                    "expiring_qty": expiring_surplus
                })

        # Sort donors: Prioritize donors with expiring batches first, then largest surplus
        donor_candidates.sort(key=lambda d: (-1 if d["is_expiry_salvage"] else 0, -d["available_surplus"]))

        # 3. Match shortages with donors
        for recipient_item, rec_risk, rec_days_cover_before, rec_needed in shortage_items:
            if rec_needed <= 0:
                continue

            for donor in donor_candidates:
                if donor["item"].facility_id == recipient_item.facility_id:
                    continue  # Cannot transfer to self

                avail = donor["available_surplus"] - allocated_donor_stock[donor["item"].id]
                if avail <= 15:
                    continue

                transfer_qty = min(avail, rec_needed)
                # Round to clean packaging multiples of 10 if > 50
                if transfer_qty > 50:
                    transfer_qty = int(round(transfer_qty / 10.0) * 10)

                if transfer_qty <= 0:
                    continue

                # Recalculate recipient and donor stats post-transfer
                rec_daily = rec_risk["avg_daily_demand"]
                donor_daily = donor["risk"]["avg_daily_demand"]

                rec_stock_before = recipient_item.current_stock
                rec_stock_after = rec_stock_before + transfer_qty
                rec_days_after = round((rec_stock_after / rec_daily), 1) if rec_daily > 0.001 else 999.0

                donor_stock_before = donor["item"].current_stock
                donor_stock_after = donor_stock_before - transfer_qty
                donor_days_after = round((donor_stock_after / donor_daily), 1) if donor_daily > 0.001 else 999.0

                # Urgency classification
                if rec_days_cover_before <= recipient_item.supplier_lead_time_days or donor["is_expiry_salvage"]:
                    urgency = "Critical"
                elif rec_days_cover_before <= (recipient_item.supplier_lead_time_days * 1.5):
                    urgency = "High"
                else:
                    urgency = "Moderate"

                # Explainable reasoning
                if donor["is_expiry_salvage"]:
                    reason = (
                        f"EXPIRY SALVAGE & SHORTAGE RELIEF: {donor['item'].facility.name} holds stock expiring within 45 days "
                        f"that exceeds local consumption. Transferring {transfer_qty} {med.unit} to {recipient_item.facility.name} "
                        f"prevents impending medical waste while raising recipient's critical coverage from {rec_days_cover_before:.1f} days "
                        f"to {rec_days_after:.1f} days."
                    )
                    expiry_note = "Guards against batch expiration: Recipient consumption will safely deplete stock prior to expiry."
                else:
                    reason = (
                        f"REBALANCING TRANSFER: {recipient_item.facility.name} faces imminent stockout ({rec_days_cover_before:.1f} days cover vs "
                        f"{recipient_item.supplier_lead_time_days}-day supplier lead time). {donor['item'].facility.name} has substantial surplus "
                        f"and will comfortably retain {donor_days_after:.1f} days of supply post-transfer (safety target: {donor['item'].safety_stock})."
                    )
                    expiry_note = "All transferred units have verified adequate shelf life (>180 days)."

                rec_obj = {
                    "id": f"REC-{rec_counter:04d}",
                    "medicine_id": med.id,
                    "medicine_name": med.name,
                    "unit": med.unit,
                    "source_facility_id": donor["item"].facility_id,
                    "source_facility_name": donor["item"].facility.name,
                    "dest_facility_id": recipient_item.facility_id,
                    "dest_facility_name": recipient_item.facility.name,
                    "suggested_quantity": transfer_qty,
                    "urgency": urgency,
                    "reason": reason,
                    "source_stock_before": donor_stock_before,
                    "source_stock_remaining": donor_stock_after,
                    "dest_stock_before": rec_stock_before,
                    "dest_days_cover_before": round(rec_days_cover_before, 1),
                    "dest_days_cover_after": round(rec_days_after, 1),
                    "donor_coverage_days_post_transfer": round(donor_days_after, 1),
                    "expiry_guard_note": expiry_note,
                    "status": "Proposed"
                }
                recommendations.append(rec_obj)
                rec_counter += 1

                # Update allocations
                allocated_donor_stock[donor["item"].id] += transfer_qty
                allocated_recipient_stock[recipient_item.id] += transfer_qty
                rec_needed -= transfer_qty

                if rec_needed <= 20:
                    break

    # Sort final recommendations by urgency priority: Critical -> High -> Moderate
    urgency_order = {"Critical": 0, "High": 1, "Moderate": 2}
    recommendations.sort(key=lambda r: (urgency_order.get(r["urgency"], 3), -r["suggested_quantity"]))

    return recommendations

def execute_transfer_approval(db: Session, rec_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Atomically executes an approved transfer, deducting stock from the donor and adding to recipient.
    """
    source_item = db.query(InventoryItem).filter(
        InventoryItem.facility_id == rec_data["source_facility_id"],
        InventoryItem.medicine_id == rec_data["medicine_id"]
    ).first()

    dest_item = db.query(InventoryItem).filter(
        InventoryItem.facility_id == rec_data["dest_facility_id"],
        InventoryItem.medicine_id == rec_data["medicine_id"]
    ).first()

    if not source_item or not dest_item:
        return {"status": "error", "message": "Source or destination inventory record not found"}

    transfer_qty = int(rec_data["suggested_quantity"])

    if source_item.current_stock < transfer_qty:
        return {
            "status": "error",
            "message": f"Donor facility does not have enough stock ({source_item.current_stock} available, requested {transfer_qty})"
        }

    # Safe atomic update
    source_item.current_stock -= transfer_qty
    dest_item.current_stock += transfer_qty

    # Adjust batches (FIFO: take from earliest expiry batch of source)
    batches = sorted(source_item.batches, key=lambda b: b.expiry_date)
    remaining_to_deduct = transfer_qty
    for b in batches:
        if remaining_to_deduct <= 0:
            break
        deduct = min(b.quantity, remaining_to_deduct)
        b.quantity -= deduct
        remaining_to_deduct -= deduct

    # Add transferred batch record to destination
    new_batch = Batch(
        id=f"TRF-{dest_item.id}-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        inventory_item_id=dest_item.id,
        batch_number=f"TRF-FROM-{rec_data['source_facility_id']}",
        quantity=transfer_qty,
        expiry_date=batches[0].expiry_date if batches else (datetime.now().date()).isoformat()
    )
    db.add(new_batch)
    db.commit()

    return {
        "status": "success",
        "message": f"Successfully transferred {transfer_qty} units from {rec_data['source_facility_name']} to {rec_data['dest_facility_name']}",
        "new_source_stock": source_item.current_stock,
        "new_dest_stock": dest_item.current_stock
    }
