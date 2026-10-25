from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from ..database import get_db
from ..models import InventoryItem, Facility, Medicine
from ..schemas import RiskItem, DashboardSummary
from ..services.risk_analyzer import analyze_item_risks
from ..services.transfer_optimizer import generate_transfer_recommendations

router = APIRouter(prefix="/api/risks", tags=["risks"])

@router.get("", response_model=List[RiskItem])
def get_all_risks(
    surge_pct: float = Query(0.0, ge=0.0, le=100.0),
    db: Session = Depends(get_db)
):
    items = db.query(InventoryItem).all()
    surge_multiplier = 1.0 + (surge_pct / 100.0)
    risk_results = []

    for it in items:
        r = analyze_item_risks(it, surge_multiplier=surge_multiplier)
        risk_results.append(RiskItem(**r))

    # Sort: Critical first, then High, Moderate, Low
    urgency_order = {"Critical": 0, "High": 1, "Moderate": 2, "Low": 3}
    risk_results.sort(key=lambda x: (
        min(urgency_order.get(x.stockout_risk_level, 4), urgency_order.get(x.expiry_risk_level, 4)),
        x.days_remaining
    ))
    return risk_results

@router.get("/summary", response_model=DashboardSummary)
def get_dashboard_summary(
    surge_pct: float = Query(0.0, ge=0.0, le=100.0),
    db: Session = Depends(get_db)
):
    surge_multiplier = 1.0 + (surge_pct / 100.0)
    facilities = db.query(Facility).all()
    medicines = db.query(Medicine).all()
    items = db.query(InventoryItem).all()

    stockout_critical = 0
    stockout_high = 0
    expiry_risk_count = 0
    total_surplus_transferable = 0
    total_at_risk_value = 0.0

    recent_alerts = []
    facility_risk_counts = {f.name: {"facility": f.name, "critical": 0, "high": 0, "healthy": 0} for f in facilities}
    category_counts = {}

    # Analyze all items
    for it in items:
        r = analyze_item_risks(it, surge_multiplier=surge_multiplier)
        fac_name = it.facility.name if it.facility else it.facility_id
        med_cat = it.medicine.category if it.medicine else "Other"

        category_counts[med_cat] = category_counts.get(med_cat, 0) + it.current_stock

        if r["stockout_risk_level"] == "Critical":
            stockout_critical += 1
            if fac_name in facility_risk_counts:
                facility_risk_counts[fac_name]["critical"] += 1
            recent_alerts.append({
                "id": f"ALERT-SO-{it.id}",
                "type": "Stockout",
                "severity": "Critical",
                "facility": fac_name,
                "medicine": it.medicine.name if it.medicine else it.medicine_id,
                "message": r["stockout_reason"],
                "days_cover": r["days_remaining"]
            })
        elif r["stockout_risk_level"] == "High":
            stockout_high += 1
            if fac_name in facility_risk_counts:
                facility_risk_counts[fac_name]["high"] += 1
        else:
            if fac_name in facility_risk_counts:
                facility_risk_counts[fac_name]["healthy"] += 1

        if r["expiry_risk_level"] in ["Critical", "Warning"]:
            expiry_risk_count += 1
            total_at_risk_value += r["estimated_waste_cost"]
            recent_alerts.append({
                "id": f"ALERT-EXP-{it.id}",
                "type": "Expiry Threat",
                "severity": r["expiry_risk_level"],
                "facility": fac_name,
                "medicine": it.medicine.name if it.medicine else it.medicine_id,
                "message": r["expiry_reason"],
                "wasted_units": r["projected_wasted_units"]
            })

    # Transfers
    transfers = generate_transfer_recommendations(db, surge_multiplier=surge_multiplier)
    for t in transfers:
        total_surplus_transferable += t["suggested_quantity"]

    # Category chart data
    category_chart_data = [{"category": cat, "stock": qty} for cat, qty in category_counts.items()]

    # 8-week historical aggregate demand trend chart data
    weeks_trend = [{"week": f"Week {w}", "total_consumption": 0} for w in range(1, 9)]
    for it in items:
        for c in it.consumption_history:
            if 1 <= c.week_index <= 8:
                weeks_trend[c.week_index - 1]["total_consumption"] += int(c.quantity * surge_multiplier)

    return DashboardSummary(
        total_facilities=len(facilities),
        total_medicines=len(medicines),
        total_inventory_items=len(items),
        stockout_critical_count=stockout_critical,
        stockout_high_count=stockout_high,
        expiry_risk_count=expiry_risk_count,
        total_surplus_transferable_units=total_surplus_transferable,
        feasible_transfers_count=len(transfers),
        estimated_at_risk_value_usd=round(total_at_risk_value, 2),
        surge_multiplier=surge_multiplier,
        recent_alerts=recent_alerts[:6],
        facility_risk_breakdown=list(facility_risk_counts.values()),
        category_stock_distribution=category_chart_data,
        demand_trend_data=weeks_trend
    )
