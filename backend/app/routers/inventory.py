from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.orm import Session
from typing import List, Optional
import io
import csv
from datetime import datetime

from ..database import get_db
from ..models import InventoryItem, Facility, Medicine, Batch, WeeklyConsumption
from ..schemas import InventoryItemDetail, InventoryUpdateRequest
from ..services.risk_analyzer import analyze_item_risks
from ..services.pdf_generator import generate_inventory_pdf

router = APIRouter(prefix="/api/inventory", tags=["inventory"])

@router.get("", response_model=List[InventoryItemDetail])
def get_inventory(
    facility_id: Optional[str] = None,
    medicine_id: Optional[str] = None,
    category: Optional[str] = None,
    risk_level: Optional[str] = None,
    surge_pct: float = 0.0,
    db: Session = Depends(get_db)
):
    query = db.query(InventoryItem)
    if facility_id:
        query = query.filter(InventoryItem.facility_id == facility_id)
    if medicine_id:
        query = query.filter(InventoryItem.medicine_id == medicine_id)

    items = query.all()
    results = []
    surge_multiplier = 1.0 + (surge_pct / 100.0)

    for item in items:
        if category and item.medicine and item.medicine.category != category:
            continue

        risk = analyze_item_risks(item, surge_multiplier=surge_multiplier)

        if risk_level:
            if risk_level in ["Critical", "High", "Moderate", "Low"] and risk["stockout_risk_level"] != risk_level:
                continue

        history = [c.quantity for c in sorted(item.consumption_history, key=lambda x: x.week_index)]
        batches_formatted = risk["batches_at_risk"]

        detail = InventoryItemDetail(
            id=item.id,
            facility_id=item.facility_id,
            facility_name=item.facility.name if item.facility else item.facility_id,
            facility_type=item.facility.facility_type if item.facility else "",
            medicine_id=item.medicine_id,
            medicine_name=item.medicine.name if item.medicine else item.medicine_id,
            category=item.medicine.category if item.medicine else "",
            unit=item.medicine.unit if item.medicine else "units",
            unit_cost=item.medicine.unit_cost if item.medicine else 1.0,
            current_stock=item.current_stock,
            safety_stock=item.safety_stock,
            supplier_lead_time_days=item.supplier_lead_time_days,
            min_order_quantity=item.min_order_quantity,
            storage_condition=item.storage_condition or "Room Temp",
            batches=batches_formatted,
            weekly_consumption=history,
            avg_daily_demand=risk["avg_daily_demand"],
            days_of_supply=risk["days_remaining"],
            lead_time_demand=risk["lead_time_demand"],
            stockout_risk_level=risk["stockout_risk_level"],
            expiry_risk_level=risk["expiry_risk_level"],
            stockout_reason=risk["stockout_reason"],
            expiry_risk_reason=risk["expiry_reason"]
        )
        results.append(detail)

    return results

@router.get("/{item_id}", response_model=InventoryItemDetail)
def get_inventory_item(item_id: str, surge_pct: float = 0.0, db: Session = Depends(get_db)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    surge_multiplier = 1.0 + (surge_pct / 100.0)
    risk = analyze_item_risks(item, surge_multiplier=surge_multiplier)
    history = [c.quantity for c in sorted(item.consumption_history, key=lambda x: x.week_index)]

    return InventoryItemDetail(
        id=item.id,
        facility_id=item.facility_id,
        facility_name=item.facility.name if item.facility else item.facility_id,
        facility_type=item.facility.facility_type if item.facility else "",
        medicine_id=item.medicine_id,
        medicine_name=item.medicine.name if item.medicine else item.medicine_id,
        category=item.medicine.category if item.medicine else "",
        unit=item.medicine.unit if item.medicine else "units",
        unit_cost=item.medicine.unit_cost if item.medicine else 1.0,
        current_stock=item.current_stock,
        safety_stock=item.safety_stock,
        supplier_lead_time_days=item.supplier_lead_time_days,
        min_order_quantity=item.min_order_quantity,
        storage_condition=item.storage_condition or "Room Temp",
        batches=risk["batches_at_risk"],
        weekly_consumption=history,
        avg_daily_demand=risk["avg_daily_demand"],
        days_of_supply=risk["days_remaining"],
        lead_time_demand=risk["lead_time_demand"],
        stockout_risk_level=risk["stockout_risk_level"],
        expiry_risk_level=risk["expiry_risk_level"],
        stockout_reason=risk["stockout_reason"],
        expiry_risk_reason=risk["expiry_reason"]
    )

@router.put("/{item_id}")
def update_inventory_item(item_id: str, update: InventoryUpdateRequest, db: Session = Depends(get_db)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    if update.current_stock is not None:
        if update.current_stock < 0:
            raise HTTPException(status_code=400, detail="Current stock cannot be negative")
        item.current_stock = update.current_stock

    if update.safety_stock is not None:
        if update.safety_stock < 0:
            raise HTTPException(status_code=400, detail="Safety stock cannot be negative")
        item.safety_stock = update.safety_stock

    if update.supplier_lead_time_days is not None:
        if update.supplier_lead_time_days <= 0:
            raise HTTPException(status_code=400, detail="Lead time must be at least 1 day")
        item.supplier_lead_time_days = update.supplier_lead_time_days

    db.commit()
    db.refresh(item)
    return {"status": "success", "message": "Inventory updated successfully", "current_stock": item.current_stock}

@router.get("/export/csv")
def export_inventory_csv(surge_pct: float = 0.0, db: Session = Depends(get_db)):
    items = db.query(InventoryItem).all()
    surge_multiplier = 1.0 + (surge_pct / 100.0)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Inventory_ID", "Facility_ID", "Facility_Name", "Medicine_ID", "Medicine_Name",
        "Category", "Current_Stock", "Safety_Stock", "Lead_Time_Days", "Avg_Daily_Demand",
        "Days_Of_Supply", "Stockout_Risk", "Expiry_Risk", "Unit", "Unit_Cost_USD"
    ])

    for it in items:
        risk = analyze_item_risks(it, surge_multiplier=surge_multiplier)
        writer.writerow([
            it.id,
            it.facility_id,
            it.facility.name if it.facility else "",
            it.medicine_id,
            it.medicine.name if it.medicine else "",
            it.medicine.category if it.medicine else "",
            it.current_stock,
            it.safety_stock,
            it.supplier_lead_time_days,
            risk["avg_daily_demand"],
            risk["days_remaining"],
            risk["stockout_risk_level"],
            risk["expiry_risk_level"],
            it.medicine.unit if it.medicine else "",
            it.medicine.unit_cost if it.medicine else 0
        ])

    csv_bytes = output.getvalue().encode("utf-8")
    filename = f"medicycle_inventory_{datetime.now().strftime('%Y%m%d')}.csv"
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
def export_inventory_pdf(
    facility_id: Optional[str] = None,
    category: Optional[str] = None,
    risk_level: Optional[str] = None,
    surge_pct: float = Query(0.0, ge=0.0, le=100.0),
    db: Session = Depends(get_db)
):
    """
    Generates and downloads a hospital-grade landscape PDF report of clinical inventory and stock valuation.
    """
    try:
        surge_multiplier = 1.0 + (surge_pct / 100.0)
        query = db.query(InventoryItem)

        facility_display_name = None
        if facility_id and facility_id != "All":
            matched_fac = db.query(Facility).filter(
                (Facility.id == facility_id) | (Facility.name == facility_id)
            ).first()
            if matched_fac:
                query = query.filter(InventoryItem.facility_id == matched_fac.id)
                facility_display_name = f"{matched_fac.name} ({matched_fac.facility_type})"
            else:
                query = query.filter(InventoryItem.facility_id == facility_id)
                facility_display_name = facility_id

        items = query.all()
        items_data = []

        for it in items:
            if category and category != "All" and it.medicine and it.medicine.category != category:
                continue

            risk = analyze_item_risks(it, surge_multiplier=surge_multiplier)

            if risk_level and risk_level not in ["All", "All risks"]:
                s_risk = risk.get("stockout_risk_level", "Low")
                e_risk = risk.get("expiry_risk_level", "Low")
                rl_upper = risk_level.upper()
                if rl_upper in ["CRITICAL_SHORTAGE", "CRITICAL"]:
                    if s_risk != "Critical" and e_risk != "Critical":
                        continue
                elif rl_upper in ["HIGH"]:
                    if s_risk != "High" and e_risk != "High":
                        continue
                elif rl_upper in ["SURPLUS", "OPTIMAL", "LOW"]:
                    if s_risk not in ["Low", "Moderate"] and e_risk not in ["Low", "Moderate"]:
                        continue
                elif rl_upper in ["NEAR_EXPIRY_SALVAGE"]:
                    if e_risk not in ["Critical", "High"]:
                        continue
                elif s_risk != risk_level and e_risk != risk_level:
                    continue

            items_data.append({
                "id": it.id,
                "facility_id": it.facility_id,
                "facility_name": it.facility.name if it.facility else it.facility_id,
                "facility_type": it.facility.facility_type if it.facility else "",
                "medicine_id": it.medicine_id,
                "medicine_name": it.medicine.name if it.medicine else it.medicine_id,
                "category": it.medicine.category if it.medicine else "General",
                "unit": it.medicine.unit if it.medicine else "units",
                "unit_cost": float(it.medicine.unit_cost) if it.medicine and it.medicine.unit_cost else 0.0,
                "current_stock": it.current_stock,
                "safety_stock": it.safety_stock,
                "storage_condition": it.storage_condition or "Room Temp",
                "avg_daily_demand": risk.get("avg_daily_demand", 0.0),
                "days_of_supply": risk.get("days_remaining", 0.0),
                "stockout_risk_level": risk.get("stockout_risk_level", "Low"),
                "expiry_risk_level": risk.get("expiry_risk_level", "Low"),
                "lead_time_days": it.supplier_lead_time_days,
            })

        pdf_bytes = generate_inventory_pdf(
            items=items_data,
            surge_pct=surge_pct,
            facility_name=facility_display_name,
            category_filter=category,
            risk_filter=risk_level,
            generated_at=datetime.now()
        )
        filename = f"medicycle_inventory_{datetime.now().strftime('%Y%m%d')}.pdf"

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
        raise HTTPException(status_code=500, detail=f"Failed to generate inventory PDF: {str(e)}")

@router.get("/template/csv")
def download_inventory_template():
    """Generates a clean CSV template with standard headers and sample rows for upload."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Inventory_ID", "Facility_ID", "Medicine_ID", "Current_Stock",
        "Safety_Stock", "Lead_Time_Days", "Batch_Number", "Expiry_Date"
    ])
    writer.writerow([
        "INV-FAC-001-MED-001", "FAC-001", "MED-001", "800", "120", "7", "BAT-2026-X1", "2027-06-30"
    ])
    writer.writerow([
        "INV-FAC-003-MED-001", "FAC-003", "MED-001", "40", "50", "7", "BAT-2026-V1", "2026-12-15"
    ])
    writer.writerow([
        "INV-FAC-002-MED-002", "FAC-002", "MED-002", "150", "60", "10", "BAT-2026-C2", "2026-11-20"
    ])

    csv_bytes = output.getvalue().encode("utf-8")
    return Response(
        content=csv_bytes,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="medicycle_inventory_template.csv"',
            "Content-Length": str(len(csv_bytes)),
            "Cache-Control": "no-cache, no-store, must-revalidate"
        }
    )

@router.post("/import/csv")
async def import_inventory_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Imports or updates inventory items via CSV.
    Validates file format, required headers, non-negative quantities, positive lead times, and date formats.
    Preserves existing inventory and performs safe non-destructive updates.
    """
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Uploaded file must be a .csv file.")

    content = await file.read()
    if not content or len(content.strip()) == 0:
        raise HTTPException(status_code=400, detail="Uploaded CSV file is empty.")

    try:
        decoded = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            decoded = content.decode("latin-1")
        except Exception:
            raise HTTPException(status_code=400, detail="Unable to decode CSV text. Please ensure valid UTF-8 encoding.")

    reader = list(csv.DictReader(io.StringIO(decoded)))
    if not reader or len(reader) == 0:
        raise HTTPException(status_code=400, detail="CSV file contains headers but no data rows.")

    # Validate required headers
    headers = set(reader[0].keys())
    has_stock = any(h in headers for h in ["Current_Stock", "current_stock", "Stock", "stock"])
    has_inv_id = any(h in headers for h in ["Inventory_ID", "inventory_id", "id", "ID"])
    has_fac_med = (
        any(h in headers for h in ["Facility_ID", "facility_id"]) and
        any(h in headers for h in ["Medicine_ID", "medicine_id"])
    )

    if not has_stock:
        raise HTTPException(
            status_code=400,
            detail="Missing required column 'Current_Stock'. Please use the official CSV template."
        )

    if not (has_inv_id or has_fac_med):
        raise HTTPException(
            status_code=400,
            detail="Missing identification columns. CSV must contain either 'Inventory_ID' or both 'Facility_ID' and 'Medicine_ID'."
        )

    updated_count = 0
    created_count = 0
    errors = []

    for row_idx, row in enumerate(reader, start=1):
        try:
            # 1. Resolve Inventory Item ID
            inv_id = (
                row.get("Inventory_ID") or
                row.get("inventory_id") or
                row.get("id") or
                row.get("ID") or ""
            ).strip()

            f_id = (row.get("Facility_ID") or row.get("facility_id") or "").strip()
            m_id = (row.get("Medicine_ID") or row.get("medicine_id") or "").strip()

            if not inv_id and (f_id and m_id):
                inv_id = f"INV-{f_id}-{m_id}"

            if not inv_id:
                errors.append(f"Row {row_idx}: Missing Inventory_ID and Facility_ID/Medicine_ID pair.")
                continue

            # 2. Validate Current_Stock
            stock_raw = row.get("Current_Stock") or row.get("current_stock") or row.get("Stock") or row.get("stock")
            if stock_raw is None or str(stock_raw).strip() == "":
                errors.append(f"Row {row_idx} ({inv_id}): Current_Stock is required and cannot be empty.")
                continue

            try:
                stock_val = int(float(str(stock_raw).strip()))
                if stock_val < 0:
                    errors.append(f"Row {row_idx} ({inv_id}): Current_Stock cannot be negative ({stock_val}).")
                    continue
            except ValueError:
                errors.append(f"Row {row_idx} ({inv_id}): Invalid numeric value for Current_Stock ('{stock_raw}').")
                continue

            # 3. Validate Safety_Stock (optional)
            safety_val = None
            safety_raw = row.get("Safety_Stock") or row.get("safety_stock")
            if safety_raw is not None and str(safety_raw).strip() != "":
                try:
                    safety_val = int(float(str(safety_raw).strip()))
                    if safety_val < 0:
                        errors.append(f"Row {row_idx} ({inv_id}): Safety_Stock cannot be negative ({safety_val}).")
                        continue
                except ValueError:
                    errors.append(f"Row {row_idx} ({inv_id}): Invalid numeric value for Safety_Stock ('{safety_raw}').")
                    continue

            # 4. Validate Lead_Time_Days (optional)
            lead_time_val = None
            lead_raw = row.get("Lead_Time_Days") or row.get("lead_time_days")
            if lead_raw is not None and str(lead_raw).strip() != "":
                try:
                    lead_time_val = int(float(str(lead_raw).strip()))
                    if lead_time_val <= 0:
                        errors.append(f"Row {row_idx} ({inv_id}): Lead_Time_Days must be greater than 0 ({lead_time_val}).")
                        continue
                except ValueError:
                    errors.append(f"Row {row_idx} ({inv_id}): Invalid numeric value for Lead_Time_Days ('{lead_raw}').")
                    continue

            # 5. Validate Expiry Date if provided (optional)
            expiry_date_val = None
            expiry_raw = row.get("Expiry_Date") or row.get("expiry_date")
            if expiry_raw is not None and str(expiry_raw).strip() != "":
                expiry_str = str(expiry_raw).strip()
                try:
                    datetime.strptime(expiry_str, "%Y-%m-%d")
                    expiry_date_val = expiry_str
                except ValueError:
                    errors.append(f"Row {row_idx} ({inv_id}): Expiry_Date must be formatted as YYYY-MM-DD (found '{expiry_str}').")
                    continue

            batch_number_val = (row.get("Batch_Number") or row.get("batch_number") or "").strip()

            # 6. Apply database update or create
            item = db.query(InventoryItem).filter(InventoryItem.id == inv_id).first()
            if not item:
                # Creation requires valid facility and medicine
                if not f_id or not m_id:
                    # Try parsing from inv_id if format is INV-{facility}-{medicine}
                    parts = inv_id.split("-")
                    if len(parts) >= 4 and parts[0] == "INV":
                        f_id = f"{parts[1]}-{parts[2]}"
                        m_id = f"{parts[3]}-{parts[4]}" if len(parts) >= 5 else parts[3]

                facility = db.query(Facility).filter(Facility.id == f_id).first()
                medicine = db.query(Medicine).filter(Medicine.id == m_id).first()

                if not facility or not medicine:
                    errors.append(f"Row {row_idx} ({inv_id}): Cannot create new item - Facility '{f_id}' or Medicine '{m_id}' not found.")
                    continue

                item = InventoryItem(
                    id=inv_id,
                    facility_id=f_id,
                    medicine_id=m_id,
                    current_stock=stock_val,
                    safety_stock=safety_val if safety_val is not None else 50,
                    supplier_lead_time_days=lead_time_val if lead_time_val is not None else 7
                )
                db.add(item)
                db.flush()

                # Add default historical consumption if creating new
                for w in range(1, 9):
                    db.add(WeeklyConsumption(
                        inventory_item_id=inv_id,
                        week_index=w,
                        quantity=max(10, int(round(stock_val / 8.0)))
                    ))

                created_count += 1
            else:
                # Update existing item
                item.current_stock = stock_val
                if safety_val is not None:
                    item.safety_stock = safety_val
                if lead_time_val is not None:
                    item.supplier_lead_time_days = lead_time_val
                updated_count += 1

            # 7. Add or update batch if batch information provided
            if batch_number_val and expiry_date_val:
                batch = db.query(Batch).filter(
                    Batch.inventory_item_id == inv_id,
                    Batch.batch_number == batch_number_val
                ).first()
                if batch:
                    batch.expiry_date = expiry_date_val
                    batch.quantity = stock_val
                else:
                    new_batch = Batch(
                        id=f"BAT-{inv_id}-{batch_number_val}",
                        inventory_item_id=inv_id,
                        batch_number=batch_number_val,
                        quantity=stock_val,
                        expiry_date=expiry_date_val
                    )
                    db.add(new_batch)

        except Exception as e:
            errors.append(f"Row {row_idx}: Unexpected processing error: {str(e)}")

    db.commit()

    total_success = updated_count + created_count
    return {
        "status": "success" if total_success > 0 else "error",
        "updated_records": updated_count,
        "created_records": created_count,
        "total_processed": total_success,
        "errors": errors if errors else None,
        "message": (
            f"Successfully updated {updated_count} record(s)" +
            (f" and created {created_count} record(s)." if created_count > 0 else ".") +
            (f" ({len(errors)} warning/error lines skipped.)" if errors else "")
        )
    }
