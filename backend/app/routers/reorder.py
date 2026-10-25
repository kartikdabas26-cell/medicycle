from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.orm import Session
from typing import List
import io
import csv
from datetime import datetime

from ..database import get_db
from ..schemas import ReorderItem
from ..services.reorder_planner import generate_reorder_plan

router = APIRouter(prefix="/api/reorder", tags=["reorder"])

@router.get("", response_model=List[ReorderItem])
def get_reorder_plan(
    horizon_days: int = Query(14, ge=7, le=60),
    surge_pct: float = Query(0.0, ge=0.0, le=100.0),
    db: Session = Depends(get_db)
):
    surge_multiplier = 1.0 + (surge_pct / 100.0)
    plan = generate_reorder_plan(db, planning_horizon_days=horizon_days, surge_multiplier=surge_multiplier)
    return plan

@router.get("/export/csv")
def export_reorder_csv(
    horizon_days: int = Query(14, ge=7, le=60),
    surge_pct: float = Query(0.0, ge=0.0, le=100.0),
    db: Session = Depends(get_db)
):
    surge_multiplier = 1.0 + (surge_pct / 100.0)
    plan = generate_reorder_plan(db, planning_horizon_days=horizon_days, surge_multiplier=surge_multiplier)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Facility", "Medicine", "Category", "Current_Stock", "Safety_Stock",
        "Lead_Time_Days", "Lead_Time_Demand", "Reorder_Point", "Target_Stock",
        "Gross_Deficit_Qty", "Incoming_Transfer_Offset", "Net_Purchase_Qty",
        "Unit", "Unit_Price_USD", "Net_Cost_USD", "Transfer_Savings_USD",
        "Urgency", "Catalog_Basis", "Clinical_Reason"
    ])

    for p in plan:
        writer.writerow([
            p["facility_name"],
            p["medicine_name"],
            p["category"],
            p["current_stock"],
            p["safety_stock"],
            p["lead_time_days"],
            p["lead_time_demand"],
            p["reorder_point"],
            p["target_stock"],
            p.get("gross_suggested_qty", p["suggested_order_qty"]),
            p.get("incoming_transfer_qty", 0),
            p["suggested_order_qty"],
            p["unit"],
            p.get("unit_cost", 0.0),
            p["estimated_order_cost"],
            p.get("transfer_offset_savings", 0.0),
            p["urgency"],
            p.get("price_basis", "WHO Catalog"),
            p["explanation"]
        ])

    csv_bytes = output.getvalue().encode("utf-8")
    filename = f"medicycle_reorder_plan_{datetime.now().strftime('%Y%m%d')}.csv"
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
