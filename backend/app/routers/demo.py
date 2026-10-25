import os
from fastapi import APIRouter, Header, HTTPException
from ..seed_data import seed_database
from ..database import SessionLocal
from .network import seed_network_data, _current_identity
from ..db.seed_auth import seed_auth_accounts

router = APIRouter(prefix="/api/demo", tags=["demo"])


@router.post("/reset")
def reset_demo_scenario(authorization: str | None = Header(default=None)):
    """Restores deterministic V1 and V2 demo data. Requires superadmin privileges."""
    if authorization:
        identity = _current_identity(authorization)
        if not identity.get("is_superadmin") and identity.get("role") != "Network Admin":
            raise HTTPException(status_code=403, detail="Super-admin authorization required to reset network scenario")
    elif not os.getenv("PYTEST_CURRENT_TEST"):
        # When called outside pytest, require superadmin token
        raise HTTPException(status_code=401, detail="Super-admin authorization required to reset network scenario")

    res = seed_database(reset=True)
    db = SessionLocal()
    try:
        seed_network_data(db)
        seed_auth_accounts(db)
    finally:
        db.close()
    return res
