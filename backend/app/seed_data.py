from datetime import datetime, timedelta
from .models import Facility, Medicine, InventoryItem, Batch, WeeklyConsumption
from .database import Base, engine, SessionLocal

FACILITIES_DATA = [
    {
        "id": "FAC-001",
        "name": "Apex Central Hospital",
        "facility_type": "Tertiary Referral Hub",
        "location": "Central Metro District",
        "contact_email": "pharmacy@apexcentral.health",
        "phone": "+1-555-0101"
    },
    {
        "id": "FAC-002",
        "name": "Metro General Hospital",
        "facility_type": "District Hospital",
        "location": "East Urban Sector",
        "contact_email": "supply@metrogeneral.org",
        "phone": "+1-555-0102"
    },
    {
        "id": "FAC-003",
        "name": "Valley Community Clinic",
        "facility_type": "Primary Health Clinic",
        "location": "South Valley Peri-Urban",
        "contact_email": "clinic@valleycommunity.org",
        "phone": "+1-555-0103"
    },
    {
        "id": "FAC-004",
        "name": "St. Jude Regional Hospital",
        "facility_type": "Regional Secondary Hospital",
        "location": "West Riverside District",
        "contact_email": "stores@stjuderegional.org",
        "phone": "+1-555-0104"
    },
    {
        "id": "FAC-005",
        "name": "Highland Health Post",
        "facility_type": "Rural Health Outpost",
        "location": "Northern Mountain Ridge",
        "contact_email": "nurse-incharge@highlandpost.org",
        "phone": "+1-555-0105"
    },
    {
        "id": "FAC-006",
        "name": "Harbor Medical Center",
        "facility_type": "Suburban Clinic & Urgent Care",
        "location": "Coastal Harbor Basin",
        "contact_email": "inventory@harbormed.org",
        "phone": "+1-555-0106"
    }
]

MEDICINES_DATA = [
    {
        "id": "MED-001",
        "name": "Amoxicillin 500mg",
        "generic_name": "Amoxicillin Trihydrate",
        "category": "Antibiotic",
        "dosage_form": "Capsule",
        "unit": "capsules",
        "unit_cost": 0.12,
        "essential_tier": "WHO Core EML"
    },
    {
        "id": "MED-002",
        "name": "Paracetamol 500mg",
        "generic_name": "Acetaminophen",
        "category": "Analgesic / Antipyretic",
        "dosage_form": "Tablet",
        "unit": "tablets",
        "unit_cost": 0.05,
        "essential_tier": "WHO Core EML"
    },
    {
        "id": "MED-003",
        "name": "Ceftriaxone 1g",
        "generic_name": "Ceftriaxone Sodium",
        "category": "Critical Injectable Antibiotic",
        "dosage_form": "Vial for Injection",
        "unit": "vials",
        "unit_cost": 3.80,
        "essential_tier": "WHO Watch Group"
    },
    {
        "id": "MED-004",
        "name": "Artemether-Lumefantrine 20/120mg",
        "generic_name": "Artemether + Lumefantrine",
        "category": "Antimalarial",
        "dosage_form": "Tablet (Blister of 24)",
        "unit": "courses",
        "unit_cost": 2.20,
        "essential_tier": "WHO Core EML"
    },
    {
        "id": "MED-005",
        "name": "Metformin 500mg",
        "generic_name": "Metformin Hydrochloride",
        "category": "Chronic Disease - Antidiabetic",
        "dosage_form": "Tablet",
        "unit": "tablets",
        "unit_cost": 0.08,
        "essential_tier": "WHO Core EML"
    },
    {
        "id": "MED-006",
        "name": "Oxytocin 10 IU/ml",
        "generic_name": "Oxytocin Injection",
        "category": "Maternal Health / Emergency",
        "dosage_form": "Ampoule 1ml",
        "unit": "ampoules",
        "unit_cost": 1.50,
        "essential_tier": "WHO Core EML Life-Saving"
    },
    {
        "id": "MED-007",
        "name": "Salbutamol 100mcg",
        "generic_name": "Albuterol Inhaler",
        "category": "Respiratory",
        "dosage_form": "Metered Dose Inhaler",
        "unit": "inhalers",
        "unit_cost": 4.50,
        "essential_tier": "WHO Core EML"
    },
    {
        "id": "MED-008",
        "name": "Insulin Glargine 100 IU/ml",
        "generic_name": "Insulin Glargine Long-Acting",
        "category": "Cold-Chain Antidiabetic",
        "dosage_form": "Vial 10ml (1000 IU)",
        "unit": "vials",
        "unit_cost": 16.00,
        "essential_tier": "WHO Complementary EML"
    },
    {
        "id": "MED-009",
        "name": "Epinephrine 1mg/ml (1:1000)",
        "generic_name": "Adrenaline",
        "category": "Emergency Resuscitation",
        "dosage_form": "Ampoule 1ml",
        "unit": "ampoules",
        "unit_cost": 2.80,
        "essential_tier": "WHO Core Life-Saving"
    },
    {
        "id": "MED-010",
        "name": "Doxycycline 100mg",
        "generic_name": "Doxycycline Hyclate",
        "category": "Antibiotic",
        "dosage_form": "Capsule",
        "unit": "capsules",
        "unit_cost": 0.18,
        "essential_tier": "WHO Core EML"
    }
]

def generate_inventory_seed():
    """
    Creates inventory items with purposeful scenarios:
    1. Shortage & Transfer match:
       - FAC-003 (Valley Community Clinic) has ONLY 80 units of MED-001 (Amoxicillin).
         Consumes ~25/day. Lead time is 10 days. Coverage: 3.2 days! (CRITICAL SHORTAGE)
       - FAC-001 (Apex Central) has 3,200 units of MED-001. Consumes ~45/day. Lead time 5 days.
         Safety stock 400. Coverage: ~71 days. (LARGE SURPLUS -> PERFECT DONOR!)
    2. Expiry Risk & Waste Prevention Transfer:
       - FAC-004 (St. Jude Regional) has 420 units of MED-003 (Ceftriaxone) in a batch expiring in 32 days!
         St. Jude only consumes 3 vials/day. It will only use ~96 vials before expiry, wasting 324 vials ($1,231)!
       - FAC-002 (Metro General) consumes 16 vials/day and has low stock (110 vials, ~6.8 days cover).
         Metro General can absorb 300 vials and use them in 18 days well before expiry!
    3. Reorder Planner demonstration:
       - FAC-002 (Metro General) has Oxytocin 10 IU (MED-006): stock 35 ampoules.
         Consumes 12/day. Lead time 7 days. Demand during lead time is 84. Safety stock is 60.
         No other facility has surplus. Target stock = 84 + 60 = 144. Order = 110 ampoules!
    4. Highland Health Post (FAC-005):
       - Low stock on Artemether-Lumefantrine (MED-004) with long lead time (14 days)
         in malaria season.
    """
    today = datetime.now().date()

    # Pre-calculated items matrix: (fac_id, med_id, current_stock, safety_stock, lead_time_days, min_order, storage, batches, weekly_history)
    items = [
        # --- FAC-001: Apex Central Hospital (Hub) ---
        (
            "FAC-001", "MED-001", 3200, 450, 5, 500, "Room Temp (15-25°C)",
            [
                ("BAT-001-A", 1200, (today + timedelta(days=280)).isoformat()),
                ("BAT-001-B", 2000, (today + timedelta(days=450)).isoformat()),
            ],
            [310, 325, 290, 315, 330, 305, 320, 335]  # ~45/day
        ),
        (
            "FAC-001", "MED-002", 5000, 800, 4, 1000, "Room Temp (15-25°C)",
            [
                ("BAT-002-A", 5000, (today + timedelta(days=360)).isoformat())
            ],
            [480, 510, 490, 520, 530, 500, 515, 540]  # ~73/day
        ),
        (
            "FAC-001", "MED-003", 650, 150, 5, 100, "Room Temp (15-25°C)",
            [
                ("BAT-003-A", 650, (today + timedelta(days=210)).isoformat())
            ],
            [110, 125, 115, 130, 120, 125, 118, 122]  # ~17/day
        ),
        (
            "FAC-001", "MED-006", 240, 60, 6, 100, "Cold Chain (2-8°C)",
            [
                ("BAT-006-A", 240, (today + timedelta(days=190)).isoformat())
            ],
            [40, 42, 38, 45, 41, 44, 43, 42]  # ~6/day
        ),
        (
            "FAC-001", "MED-008", 180, 40, 5, 50, "Cold Chain (2-8°C)",
            [
                ("BAT-008-A", 180, (today + timedelta(days=160)).isoformat())
            ],
            [32, 35, 30, 34, 33, 36, 35, 34]  # ~5/day
        ),

        # --- FAC-002: Metro General Hospital ---
        (
            "FAC-002", "MED-001", 1200, 300, 6, 400, "Room Temp (15-25°C)",
            [
                ("BAT-001-C", 1200, (today + timedelta(days=320)).isoformat())
            ],
            [210, 220, 205, 230, 215, 225, 218, 222]  # ~31/day
        ),
        (
            "FAC-002", "MED-003", 110, 80, 7, 100, "Room Temp (15-25°C)",
            [
                ("BAT-003-B", 110, (today + timedelta(days=140)).isoformat())
            ],
            [105, 112, 110, 115, 108, 114, 112, 116]  # ~16/day (coverage: 6.8 days! needs stock)
        ),
        (
            "FAC-002", "MED-006", 35, 60, 7, 100, "Cold Chain (2-8°C)",
            [
                ("BAT-006-B", 35, (today + timedelta(days=180)).isoformat())
            ],
            [80, 85, 82, 88, 84, 86, 85, 87]  # ~12.2/day (coverage: 2.8 days! Urgent Reorder needed)
        ),
        (
            "FAC-002", "MED-009", 90, 30, 6, 50, "Protected from Light",
            [
                ("BAT-009-A", 90, (today + timedelta(days=240)).isoformat())
            ],
            [14, 16, 15, 18, 16, 15, 17, 16]  # ~2.3/day
        ),

        # --- FAC-003: Valley Community Clinic (Vulnerable to shortages) ---
        (
            "FAC-003", "MED-001", 80, 120, 10, 200, "Room Temp (15-25°C)",
            [
                ("BAT-001-D", 80, (today + timedelta(days=180)).isoformat())
            ],
            [165, 175, 170, 180, 172, 178, 174, 180]  # ~25/day (coverage: 3.2 days! Critical stockout imminent!)
        ),
        (
            "FAC-003", "MED-002", 950, 200, 8, 300, "Room Temp (15-25°C)",
            [
                ("BAT-002-B", 950, (today + timedelta(days=300)).isoformat())
            ],
            [140, 150, 145, 155, 148, 152, 150, 154]  # ~21/day
        ),
        (
            "FAC-003", "MED-005", 850, 150, 8, 200, "Room Temp (15-25°C)",
            [
                ("BAT-005-A", 850, (today + timedelta(days=365)).isoformat())
            ],
            [100, 105, 98, 110, 102, 106, 104, 108]  # ~15/day
        ),
        (
            "FAC-003", "MED-007", 45, 30, 9, 50, "Room Temp (15-25°C)",
            [
                ("BAT-007-A", 45, (today + timedelta(days=220)).isoformat())
            ],
            [28, 32, 30, 34, 31, 33, 32, 35]  # ~4.7/day (coverage: 9.5 days, close to lead time)
        ),

        # --- FAC-004: St. Jude Regional Hospital (Has Expiring Surplus!) ---
        (
            "FAC-004", "MED-003", 420, 50, 8, 100, "Room Temp (15-25°C)",
            [
                # Batch expiring in 32 days! Consumes only 3/day (21/week) -> will only consume 96 before expiry!
                ("BAT-003-EXP", 340, (today + timedelta(days=32)).isoformat()),
                ("BAT-003-SAFE", 80, (today + timedelta(days=260)).isoformat())
            ],
            [20, 22, 19, 21, 23, 20, 21, 22]  # ~3/day (EXPIRY THREAT: 340 units at risk!)
        ),
        (
            "FAC-004", "MED-004", 380, 100, 7, 150, "Dry Place (<30°C)",
            [
                ("BAT-004-A", 380, (today + timedelta(days=190)).isoformat())
            ],
            [60, 65, 58, 64, 62, 66, 63, 65]  # ~9/day
        ),
        (
            "FAC-004", "MED-005", 2100, 300, 6, 400, "Room Temp (15-25°C)",
            [
                ("BAT-005-B", 2100, (today + timedelta(days=400)).isoformat())
            ],
            [180, 190, 185, 195, 188, 192, 190, 194]  # ~27/day (Surplus available)
        ),

        # --- FAC-005: Highland Health Post (Remote Outpost) ---
        (
            "FAC-005", "MED-004", 25, 40, 14, 60, "Dry Place (<30°C)",
            [
                ("BAT-004-B", 25, (today + timedelta(days=110)).isoformat())
            ],
            [35, 38, 36, 40, 42, 39, 41, 42]  # ~5.8/day (coverage 4.3 days! Lead time is 14 days! Critical!)
        ),
        (
            "FAC-005", "MED-001", 150, 60, 14, 100, "Room Temp (15-25°C)",
            [
                ("BAT-001-E", 150, (today + timedelta(days=150)).isoformat())
            ],
            [45, 48, 42, 50, 47, 49, 48, 50]  # ~7/day
        ),
        (
            "FAC-005", "MED-009", 12, 15, 14, 20, "Protected from Light",
            [
                ("BAT-009-B", 12, (today + timedelta(days=95)).isoformat())
            ],
            [3, 4, 3, 5, 4, 3, 4, 4]  # ~0.5/day
        ),

        # --- FAC-006: Harbor Medical Center ---
        (
            "FAC-006", "MED-004", 450, 80, 6, 100, "Dry Place (<30°C)",
            [
                ("BAT-004-C", 450, (today + timedelta(days=240)).isoformat())
            ],
            [40, 44, 42, 46, 43, 45, 44, 46]  # ~6.3/day (surplus can assist Highland Health Post!)
        ),
        (
            "FAC-006", "MED-007", 120, 30, 6, 50, "Room Temp (15-25°C)",
            [
                ("BAT-007-B", 120, (today + timedelta(days=310)).isoformat())
            ],
            [25, 27, 26, 28, 27, 29, 28, 30]  # ~4/day
        ),
        (
            "FAC-006", "MED-010", 650, 100, 6, 150, "Room Temp (15-25°C)",
            [
                ("BAT-010-A", 650, (today + timedelta(days=340)).isoformat())
            ],
            [70, 75, 72, 78, 74, 76, 75, 77]  # ~11/day
        )
    ]
    return items

def seed_database(reset: bool = True):
    """Initializes or resets database with deterministic demo data."""
    if reset:
        Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # Check if already seeded
        if db.query(Facility).first():
            return {"status": "already_seeded", "message": "Database already contains data"}

        # 1. Add Facilities
        for f in FACILITIES_DATA:
            fac = Facility(**f)
            db.add(fac)

        # 2. Add Medicines
        for m in MEDICINES_DATA:
            med = Medicine(**m)
            db.add(med)
        db.commit()

        # 3. Add Inventory Items, Batches, and Consumption
        inventory_items = generate_inventory_seed()
        for idx, item in enumerate(inventory_items):
            fac_id, med_id, stock, safety, lead_time, min_ord, storage, batches, history = item
            inv_id = f"INV-{fac_id}-{med_id}"
            inv_item = InventoryItem(
                id=inv_id,
                facility_id=fac_id,
                medicine_id=med_id,
                current_stock=stock,
                safety_stock=safety,
                supplier_lead_time_days=lead_time,
                min_order_quantity=min_ord,
                storage_condition=storage
            )
            db.add(inv_item)

            # Batches
            for b_idx, (b_num, b_qty, b_exp) in enumerate(batches):
                batch_obj = Batch(
                    id=f"{inv_id}-B{b_idx+1}",
                    inventory_item_id=inv_id,
                    batch_number=b_num,
                    quantity=b_qty,
                    expiry_date=b_exp
                )
                db.add(batch_obj)

            # Weekly Consumption (weeks 1 to 8)
            for w_idx, q in enumerate(history):
                cons_obj = WeeklyConsumption(
                    inventory_item_id=inv_id,
                    week_index=w_idx + 1,
                    quantity=q
                )
                db.add(cons_obj)

        db.commit()
        return {"status": "success", "message": "Demo scenario initialized successfully"}
    finally:
        db.close()
