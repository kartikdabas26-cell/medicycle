from sqlalchemy.orm import Session
from ..models import UserAccount, Facility
from ..services.security import hash_password

SEEDED_ACCOUNTS = [
    # Master Admin (Platform Owner)
    {
        "domain": "admin",
        "facility_id": None,
        "email": "admin@medicycle.gov",
        "phone": "+1-555-0199",
        "password": "AdminMaster@2026",
        "pin": "990011",
        "is_verified": True,
        "is_superadmin": True,
    },
    # Hospital Workplace (Primary FAC-001 and Net NET-H01)
    {
        "domain": "hospital",
        "facility_id": "FAC-001",
        "email": "pharmacy@centralhospital.org",
        "phone": "+1-555-0101",
        "password": "Hospital@2026",
        "pin": None,
        "is_verified": True,
        "is_superadmin": False,
    },
    {
        "domain": "hospital",
        "facility_id": "NET-H01",
        "email": "hospital@centralcivil.org",
        "phone": "+1-555-0101",
        "password": "Hospital@2026",
        "pin": None,
        "is_verified": True,
        "is_superadmin": False,
    },
    # Retail Chemist Workplace (Primary FAC-003 and Net NET-C01)
    {
        "domain": "chemist",
        "facility_id": "FAC-003",
        "email": "dispensary@apollochemist.com",
        "phone": "+1-555-0103",
        "password": "Chemist@2026",
        "pin": None,
        "is_verified": True,
        "is_superadmin": False,
    },
    {
        "domain": "chemist",
        "facility_id": "NET-C01",
        "email": "chemist@apollopharmacy.com",
        "phone": "+1-555-0103",
        "password": "Chemist@2026",
        "pin": None,
        "is_verified": True,
        "is_superadmin": False,
    },
    # Medical Supplier Workplace (Primary FAC-006 and Net NET-S01)
    {
        "domain": "supplier",
        "facility_id": "FAC-006",
        "email": "orders@apexdistributors.com",
        "phone": "+1-555-0106",
        "password": "Supplier@2026",
        "pin": None,
        "is_verified": True,
        "is_superadmin": False,
    },
    {
        "domain": "supplier",
        "facility_id": "NET-S01",
        "email": "logistics@apexpharma.com",
        "phone": "+1-555-0106",
        "password": "Supplier@2026",
        "pin": None,
        "is_verified": True,
        "is_superadmin": False,
    },
]


def seed_auth_accounts(db: Session) -> None:
    """Seeds the production domain-isolated authentication credentials if not present."""
    # Ensure facilities table has FAC-001, FAC-003, FAC-006 records
    for acc in SEEDED_ACCOUNTS:
        existing = db.query(UserAccount).filter(UserAccount.email == acc["email"]).first()
        if not existing:
            new_acc = UserAccount(
                domain=acc["domain"],
                facility_id=acc["facility_id"],
                email=acc["email"],
                phone=acc["phone"],
                hashed_password=hash_password(acc["password"]),
                pin=acc["pin"],
                is_verified=acc["is_verified"],
                is_superadmin=acc["is_superadmin"],
            )
            db.add(new_acc)
        else:
            # Refresh password hash and pin to guarantee exact specified credentials
            existing.hashed_password = hash_password(acc["password"])
            existing.pin = acc["pin"]
            existing.is_superadmin = acc["is_superadmin"]
            existing.facility_id = acc["facility_id"]
            existing.domain = acc["domain"]

    db.commit()
