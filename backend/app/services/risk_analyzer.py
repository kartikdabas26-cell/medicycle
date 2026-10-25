from datetime import datetime
from typing import List, Dict, Any, Tuple
from ..models import InventoryItem, Batch
from .forecasting import calculate_demand_forecast

def analyze_item_risks(
    item: InventoryItem,
    surge_multiplier: float = 1.0,
    reference_date: datetime.date = None
) -> Dict[str, Any]:
    """
    Evaluates both stockout risk and batch expiry risk for a single inventory record.
    """
    if reference_date is None:
        reference_date = datetime.now().date()

    # Extract weekly consumption in order
    history = [c.quantity for c in sorted(item.consumption_history, key=lambda x: x.week_index)]
    forecast = calculate_demand_forecast(history, surge_multiplier=surge_multiplier)

    daily_demand = forecast["avg_daily_demand"]
    lead_time = item.supplier_lead_time_days
    current_stock = item.current_stock
    safety_stock = item.safety_stock
    lead_time_demand = round(daily_demand * lead_time, 1)

    # 1. Stockout Risk Analysis
    if daily_demand > 0.001:
        days_remaining = round(current_stock / daily_demand, 1)
    else:
        days_remaining = 999.0

    safety_shortfall = max(0.0, round(safety_stock - (current_stock - lead_time_demand), 1))

    # Risk level categorization
    if current_stock == 0:
        stockout_level = "Critical"
        stockout_reason = (
            f"Zero stock on hand. Immediate stockout impacting patients. "
            f"Supplier lead time is {lead_time} days."
        )
    elif days_remaining <= lead_time:
        stockout_level = "Critical"
        deficit = round(lead_time_demand - current_stock, 1)
        stockout_reason = (
            f"Current stock ({current_stock} units) covers only {days_remaining} days. "
            f"Supplier replenishment takes {lead_time} days (needs {lead_time_demand} units). "
            f"Projected deficit before new delivery: {deficit} units."
        )
    elif days_remaining <= (lead_time * 1.5) or current_stock < safety_stock:
        stockout_level = "High"
        stockout_reason = (
            f"Stock covers {days_remaining} days, dangerously close to lead time of {lead_time} days. "
            f"Buffer is below prescribed safety threshold ({safety_stock} units)."
        )
    elif days_remaining <= (lead_time * 2.5):
        stockout_level = "Moderate"
        stockout_reason = (
            f"Adequate for immediate needs ({days_remaining} days cover), but buffer will "
            f"erode if lead times or consumption fluctuate."
        )
    else:
        stockout_level = "Low"
        stockout_reason = f"Comfortable inventory coverage of {days_remaining} days (Safety target: {safety_stock} units)."

    # 2. Expiry Risk Analysis
    batches_summary = []
    total_wasted_units = 0
    min_days_to_expiry = 9999
    expiry_level = "Low"
    expiry_reason = "All active batches have adequate shelf life relative to forecast consumption."

    # Sort batches by expiry ascending (FIFO)
    sorted_batches = sorted(item.batches, key=lambda b: b.expiry_date)
    accumulated_demand_window = 0.0

    for batch in sorted_batches:
        try:
            b_date = datetime.strptime(batch.expiry_date, "%Y-%m-%d").date()
            days_to_exp = (b_date - reference_date).days
        except Exception:
            days_to_exp = 365

        min_days_to_expiry = min(min_days_to_expiry, days_to_exp)

        if days_to_exp <= 0:
            b_status = "Expired"
        elif days_to_exp <= 45:
            b_status = "Critical (<45d)"
        elif days_to_exp <= 90:
            b_status = "Warning (<90d)"
        elif days_to_exp <= 180:
            b_status = "Moderate (<180d)"
        else:
            b_status = "Healthy"

        # Check if local facility consumption will consume this batch before expiry
        consumable_units = max(0.0, days_to_exp * daily_demand)
        at_risk_qty = 0
        if days_to_exp > 0 and days_to_exp <= 90:
            if batch.quantity > consumable_units:
                at_risk_qty = int(round(batch.quantity - consumable_units))
                total_wasted_units += at_risk_qty

        batches_summary.append({
            "id": batch.id,
            "batch_number": batch.batch_number,
            "quantity": batch.quantity,
            "expiry_date": batch.expiry_date,
            "days_to_expiry": days_to_exp,
            "expiry_status": b_status,
            "at_risk_quantity": at_risk_qty
        })

    unit_cost = item.medicine.unit_cost if item.medicine else 1.0
    estimated_waste_cost = round(total_wasted_units * unit_cost, 2)

    if any(b["days_to_expiry"] <= 0 for b in batches_summary):
        expiry_level = "Critical"
        expiry_reason = "Contains expired batch(es) that must be quarantined immediately."
    elif total_wasted_units > 0 and min_days_to_expiry <= 45:
        expiry_level = "Critical"
        expiry_reason = (
            f"Batch {sorted_batches[0].batch_number} expires in {min_days_to_expiry} days. "
            f"Local consumption ({daily_demand:.1f}/day) can only absorb {int(min_days_to_expiry * daily_demand)} "
            f"of {sorted_batches[0].quantity} units. High risk of wasting ~{total_wasted_units} units (${estimated_waste_cost:.2f})."
        )
    elif total_wasted_units > 0 and min_days_to_expiry <= 90:
        expiry_level = "Warning"
        expiry_reason = (
            f"Projected unconsumed stock of ~{total_wasted_units} units before expiry in {min_days_to_expiry} days. "
            f"Consider prioritizing for redistribution to higher-volume facilities."
        )
    elif min_days_to_expiry <= 90:
        expiry_level = "Moderate"
        expiry_reason = f"Earliest batch expires in {min_days_to_expiry} days, but projected consumption covers quantity."

    return {
        "inventory_id": item.id,
        "facility_id": item.facility_id,
        "facility_name": item.facility.name if item.facility else item.facility_id,
        "medicine_id": item.medicine_id,
        "medicine_name": item.medicine.name if item.medicine else item.medicine_id,
        "unit": item.medicine.unit if item.medicine else "units",
        "unit_cost": unit_cost,
        "current_stock": current_stock,
        "safety_stock": safety_stock,
        "lead_time_days": lead_time,
        "lead_time_demand": lead_time_demand,
        "avg_daily_demand": daily_demand,
        "days_remaining": days_remaining,
        "safety_stock_shortfall": safety_shortfall,
        "stockout_risk_level": stockout_level,
        "stockout_reason": stockout_reason,
        "expiry_risk_level": expiry_level,
        "batches_at_risk": batches_summary,
        "projected_wasted_units": total_wasted_units,
        "estimated_waste_cost": estimated_waste_cost,
        "expiry_reason": expiry_reason,
        "forecast": forecast
    }
