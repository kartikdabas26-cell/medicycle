from typing import List, Dict, Any
from sqlalchemy.orm import Session
from ..models import InventoryItem
from .risk_analyzer import analyze_item_risks
from .transfer_optimizer import generate_transfer_recommendations

def generate_reorder_plan(
    db: Session,
    planning_horizon_days: int = 14,
    surge_multiplier: float = 1.0
) -> List[Dict[str, Any]]:
    """
    Computes precise procurement reorder quantities when internal stock or redistribution
    is insufficient to maintain target inventory levels.
    Cross-references active transfer recommendations to avoid double-ordering stock
    already scheduled for inter-facility delivery.
    """
    items = db.query(InventoryItem).all()
    reorder_list = []

    # Calculate active transfer recommendations to determine incoming inter-facility stock
    try:
        transfers = generate_transfer_recommendations(db, surge_multiplier=surge_multiplier)
    except Exception:
        transfers = []

    # Map of (dest_facility_id, medicine_id) -> total incoming transfer units
    incoming_transfers_map = {}
    for t in transfers:
        key = (t["dest_facility_id"], t["medicine_id"])
        incoming_transfers_map[key] = incoming_transfers_map.get(key, 0) + t["suggested_quantity"]

    for item in items:
        risk = analyze_item_risks(item, surge_multiplier=surge_multiplier)
        daily_demand = risk["avg_daily_demand"]
        current_stock = item.current_stock
        safety_stock = item.safety_stock
        lead_time = item.supplier_lead_time_days
        min_order = item.min_order_quantity
        unit_cost = item.medicine.unit_cost if item.medicine else 1.0

        # Target inventory calculation:
        # Target Stock = (Demand during Lead Time) + Safety Stock + (Demand during Planning Cycle)
        lead_time_demand = daily_demand * lead_time
        cycle_demand = daily_demand * planning_horizon_days
        target_stock = int(round(lead_time_demand + safety_stock + cycle_demand))

        # Reorder trigger point: current stock <= lead_time_demand + safety_stock
        reorder_point = int(round(lead_time_demand + safety_stock))

        # Only recommend reorder if current stock is at or below the reorder point
        if current_stock <= reorder_point:
            raw_deficit = target_stock - current_stock
            if raw_deficit <= 0:
                continue

            # Ensure min order quantity and batch packaging
            gross_qty = max(min_order, raw_deficit)
            if gross_qty > 50:
                gross_qty = int(((gross_qty + 9) // 10) * 10)

            # Check incoming transfer offset
            key = (item.facility_id, item.medicine_id)
            incoming_transfer = incoming_transfers_map.get(key, 0)

            # Net order quantity deducting incoming transfers
            net_qty = max(0, gross_qty - incoming_transfer)
            if net_qty > 50:
                net_qty = int(((net_qty + 9) // 10) * 10)

            gross_cost = round(gross_qty * unit_cost, 2)
            net_cost = round(net_qty * unit_cost, 2)
            savings = round(min(gross_qty, incoming_transfer) * unit_cost, 2)

            # Determine urgency
            days_remaining = risk["days_remaining"]
            if net_qty == 0:
                urgency = "Transfer Covered"
            elif days_remaining <= lead_time:
                urgency = "Critical"
            elif days_remaining <= (lead_time * 1.5):
                urgency = "High"
            else:
                urgency = "Moderate"

            if incoming_transfer > 0 and net_qty == 0:
                explanation = (
                    f"Gross replenishment requirement ({gross_qty} {item.medicine.unit}) is fully covered by an incoming "
                    f"recommended transfer ({incoming_transfer} {item.medicine.unit}). External supplier purchase averted, saving ${savings:.2f}."
                )
            elif incoming_transfer > 0:
                explanation = (
                    f"Gross deficit of {gross_qty} {item.medicine.unit} is partially offset by {incoming_transfer} incoming transferred units. "
                    f"Net purchase reduced to {net_qty} {item.medicine.unit} (${net_cost:.2f}), saving ${savings:.2f} in procurement expenditure."
                )
            else:
                explanation = (
                    f"Current stock ({current_stock} {item.medicine.unit}) is below reorder point of {reorder_point}. "
                    f"With lead time of {lead_time} days (expected consumption {lead_time_demand:.1f}) and safety stock "
                    f"of {safety_stock}, placing an order for {net_qty} units restores optimal stock target of {target_stock}."
                )

            reorder_list.append({
                "inventory_id": item.id,
                "facility_id": item.facility_id,
                "facility_name": item.facility.name,
                "medicine_id": item.medicine_id,
                "medicine_name": item.medicine.name,
                "category": item.medicine.category,
                "unit": item.medicine.unit,
                "unit_cost": unit_cost,
                "current_stock": current_stock,
                "safety_stock": safety_stock,
                "lead_time_days": lead_time,
                "lead_time_demand": round(lead_time_demand, 1),
                "reorder_point": reorder_point,
                "target_stock": target_stock,
                "suggested_order_qty": net_qty,
                "gross_suggested_qty": gross_qty,
                "incoming_transfer_qty": incoming_transfer,
                "net_order_qty": net_qty,
                "estimated_order_cost": net_cost,
                "gross_estimated_cost": gross_cost,
                "transfer_offset_savings": savings,
                "currency": "USD",
                "price_basis": "WHO Model List / Regional Catalog Reference Price",
                "urgency": urgency,
                "explanation": explanation
            })

    # Sort: Critical first, then High, Moderate, and Transfer Covered last
    urgency_map = {"Critical": 0, "High": 1, "Moderate": 2, "Transfer Covered": 3}
    reorder_list.sort(key=lambda x: (urgency_map.get(x["urgency"], 4), -x["suggested_order_qty"]))

    return reorder_list
