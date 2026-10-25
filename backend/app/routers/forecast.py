from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import InventoryItem
from ..schemas import ForecastResult
from ..services.forecasting import calculate_demand_forecast

router = APIRouter(prefix="/api/forecasts", tags=["forecasts"])

@router.get("", response_model=List[ForecastResult])
def get_all_forecasts(
    surge_pct: float = Query(0.0, ge=0.0, le=100.0),
    facility_id: Optional[str] = None,
    medicine_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(InventoryItem)
    if facility_id:
        query = query.filter(InventoryItem.facility_id == facility_id)
    if medicine_id:
        query = query.filter(InventoryItem.medicine_id == medicine_id)

    items = query.all()
    surge_multiplier = 1.0 + (surge_pct / 100.0)
    results = []

    for it in items:
        history = [c.quantity for c in sorted(it.consumption_history, key=lambda x: x.week_index)]
        f = calculate_demand_forecast(history, surge_multiplier=surge_multiplier)

        res = ForecastResult(
            inventory_id=it.id,
            facility_id=it.facility_id,
            facility_name=it.facility.name if it.facility else it.facility_id,
            medicine_id=it.medicine_id,
            medicine_name=it.medicine.name if it.medicine else it.medicine_id,
            unit=it.medicine.unit if it.medicine else "units",
            history_weeks=history,
            avg_weekly_demand=f["avg_weekly_demand"],
            avg_daily_demand=f["avg_daily_demand"],
            forecast_method=f["forecast_method"],
            confidence_interval=f["confidence_interval"],
            projected_7d_demand=f["projected_7d_demand"],
            projected_30d_demand=f["projected_30d_demand"],
            surge_multiplier=surge_multiplier,
            explanation=f["explanation"],
            data_limitation_note=f["data_limitation_note"]
        )
        results.append(res)

    # Sort by highest weekly demand
    results.sort(key=lambda x: -x.avg_weekly_demand)
    return results
