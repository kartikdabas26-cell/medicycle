import pytest
from datetime import datetime, timedelta
from backend.app.services.forecasting import calculate_demand_forecast
from backend.app.services.risk_analyzer import analyze_item_risks
from backend.app.services.transfer_optimizer import generate_transfer_recommendations, execute_transfer_approval
from backend.app.services.reorder_planner import generate_reorder_plan
from backend.app.services.pdf_generator import generate_transfers_pdf, generate_inventory_pdf
from backend.app.seed_data import seed_database
from backend.app.database import SessionLocal, Base, engine
from backend.app.models import InventoryItem, Facility, Medicine

@pytest.fixture(scope="module")
def setup_db():
    seed_database(reset=True)
    yield
    # Teardown if needed

def test_demand_forecast_with_history():
    history = [100, 110, 105, 115, 120, 110, 125, 130]
    forecast = calculate_demand_forecast(history, surge_multiplier=1.0)
    assert forecast["avg_weekly_demand"] > 100
    assert forecast["avg_daily_demand"] > 14
    assert forecast["projected_7d_demand"] > 0
    assert "Exponential Smoothing" in forecast["forecast_method"]

def test_demand_forecast_missing_history():
    forecast = calculate_demand_forecast([], surge_multiplier=1.0)
    assert forecast["avg_weekly_demand"] == 0.0
    assert forecast["avg_daily_demand"] == 0.0
    assert forecast["data_limitation_note"] is not None

def test_demand_surge_calculation():
    history = [100, 100, 100, 100]
    base_forecast = calculate_demand_forecast(history, surge_multiplier=1.0)
    surge_forecast = calculate_demand_forecast(history, surge_multiplier=1.2)
    assert round(surge_forecast["avg_weekly_demand"], 1) == round(base_forecast["avg_weekly_demand"] * 1.2, 1)

def test_stockout_and_expiry_risk_detection(setup_db):
    db = SessionLocal()
    try:
        # Check Valley Community Clinic (FAC-003) for Amoxicillin (MED-001)
        valley_amox = db.query(InventoryItem).filter(
            InventoryItem.facility_id == "FAC-003",
            InventoryItem.medicine_id == "MED-001"
        ).first()
        assert valley_amox is not None

        risk = analyze_item_risks(valley_amox)
        # Should be Critical due to low stock (80 units vs ~25 daily demand, lead time 10 days)
        assert risk["stockout_risk_level"] == "Critical"
        assert risk["days_remaining"] < valley_amox.supplier_lead_time_days

        # Check St. Jude Regional (FAC-004) for Ceftriaxone (MED-003) which has batch expiring in 32 days
        stjude_ceft = db.query(InventoryItem).filter(
            InventoryItem.facility_id == "FAC-004",
            InventoryItem.medicine_id == "MED-003"
        ).first()
        assert stjude_ceft is not None

        ceft_risk = analyze_item_risks(stjude_ceft)
        assert ceft_risk["expiry_risk_level"] in ["Critical", "Warning"]
        assert ceft_risk["projected_wasted_units"] > 0
        assert ceft_risk["estimated_waste_cost"] > 0
    finally:
        db.close()

def test_transfer_optimizer_recommendations(setup_db):
    db = SessionLocal()
    try:
        recs = generate_transfer_recommendations(db)
        assert len(recs) > 0

        # There must be a transfer from Apex Central (FAC-001) to Valley Community (FAC-003) for Amoxicillin
        amox_transfers = [r for r in recs if r["medicine_id"] == "MED-001" and r["dest_facility_id"] == "FAC-003"]
        assert len(amox_transfers) > 0
        rec = amox_transfers[0]
        assert rec["source_facility_id"] == "FAC-001"
        assert rec["suggested_quantity"] > 0
        # Donor post-transfer stock must be safe
        assert rec["source_stock_remaining"] > 2000
        assert rec["donor_coverage_days_post_transfer"] > 30

        # There must also be an expiry salvage transfer for Ceftriaxone from St. Jude (FAC-004)
        ceft_transfers = [r for r in recs if r["medicine_id"] == "MED-003" and r["source_facility_id"] == "FAC-004"]
        assert len(ceft_transfers) > 0
    finally:
        db.close()

def test_atomic_transfer_execution(setup_db):
    db = SessionLocal()
    try:
        # Find Amoxicillin items for Apex and Valley
        apex = db.query(InventoryItem).filter(InventoryItem.facility_id == "FAC-001", InventoryItem.medicine_id == "MED-001").first()
        valley = db.query(InventoryItem).filter(InventoryItem.facility_id == "FAC-003", InventoryItem.medicine_id == "MED-001").first()

        apex_before = apex.current_stock
        valley_before = valley.current_stock

        rec_payload = {
            "source_facility_id": "FAC-001",
            "source_facility_name": "Apex Central Hospital",
            "dest_facility_id": "FAC-003",
            "dest_facility_name": "Valley Community Clinic",
            "medicine_id": "MED-001",
            "suggested_quantity": 100
        }

        result = execute_transfer_approval(db, rec_payload)
        assert result["status"] == "success"

        db.refresh(apex)
        db.refresh(valley)
        assert apex.current_stock == apex_before - 100
        assert valley.current_stock == valley_before + 100
    finally:
        db.close()

def test_reorder_planner_calculations(setup_db):
    db = SessionLocal()
    try:
        reorders = generate_reorder_plan(db, planning_horizon_days=14)
        assert len(reorders) > 0
        for r in reorders:
            # Reorders should only be triggered if current stock <= reorder point
            assert r["current_stock"] <= r["reorder_point"]
            assert r["suggested_order_qty"] >= 0
            assert r["target_stock"] > r["current_stock"]
            assert len(r["explanation"]) > 0
            assert "incoming_transfer_qty" in r
            assert "gross_suggested_qty" in r
            assert r["currency"] == "USD"
            assert r["gross_suggested_qty"] >= r["suggested_order_qty"]
    finally:
        db.close()

def test_pdf_report_generation(setup_db):
    db = SessionLocal()
    try:
        # 1. Test PDF with active recommendations and surge
        recs = generate_transfer_recommendations(db, surge_multiplier=1.2)
        assert len(recs) > 0
        pdf_bytes = generate_transfers_pdf(recs, surge_pct=20.0)
        assert isinstance(pdf_bytes, bytes)
        assert len(pdf_bytes) > 2000
        assert pdf_bytes.startswith(b'%PDF')

        # 2. Test PDF with empty recommendations (graceful empty state)
        empty_pdf = generate_transfers_pdf([], surge_pct=0.0)
        assert isinstance(empty_pdf, bytes)
        assert len(empty_pdf) > 1000
        assert empty_pdf.startswith(b'%PDF')
    finally:
        db.close()


def test_inventory_pdf_generation(setup_db):
    db = SessionLocal()
    try:
        items = db.query(InventoryItem).all()
        assert len(items) > 0
        items_data = [
            {
                "id": it.id,
                "facility_name": it.facility.name if it.facility else it.facility_id,
                "facility_type": it.facility.facility_type if it.facility else "",
                "medicine_name": it.medicine.name if it.medicine else it.medicine_id,
                "category": it.medicine.category if it.medicine else "General",
                "current_stock": it.current_stock,
                "safety_stock": it.safety_stock,
                "unit": it.medicine.unit if it.medicine else "units",
                "days_of_supply": 14.2,
                "avg_daily_demand": 25.0,
                "stockout_risk_level": "Low",
                "expiry_risk_level": "Low",
                "unit_cost": float(it.medicine.unit_cost) if it.medicine and it.medicine.unit_cost else 1.0,
                "storage_condition": it.storage_condition or "Room Temp",
            }
            for it in items
        ]
        pdf_bytes = generate_inventory_pdf(items_data, surge_pct=15.0, facility_name="St. Jude Memorial Hospital")
        assert isinstance(pdf_bytes, bytes)
        assert len(pdf_bytes) > 2000
        assert pdf_bytes.startswith(b'%PDF')

        # Test empty inventory items
        empty_pdf = generate_inventory_pdf([], surge_pct=0.0)
        assert isinstance(empty_pdf, bytes)
        assert len(empty_pdf) > 1000
        assert empty_pdf.startswith(b'%PDF')
    finally:
        db.close()


