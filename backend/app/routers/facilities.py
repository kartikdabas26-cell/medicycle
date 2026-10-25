from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models import Facility, InventoryItem
from ..schemas import FacilitySimple

router = APIRouter(prefix="/api/facilities", tags=["facilities"])

@router.get("", response_model=List[FacilitySimple])
def get_facilities(db: Session = Depends(get_db)):
    return db.query(Facility).all()
