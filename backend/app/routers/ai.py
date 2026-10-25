from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Facility, Medicine, InventoryItem
from ..schemas import AIExplainRequest
from ..services.risk_analyzer import analyze_item_risks
from ..services.transfer_optimizer import generate_transfer_recommendations
from ..services.reorder_planner import generate_reorder_plan
from ..services.ai_explainer import generate_ai_explanation

router = APIRouter(prefix="/api/ai", tags=["ai"])

@router.post("/ask")
def ask_ai_assistant(request: AIExplainRequest, db: Session = Depends(get_db)):
    # Build complete ground-truth context
    facilities = db.query(Facility).all()
    medicines = db.query(Medicine).all()
    items = db.query(InventoryItem).all()

    risk_list = [analyze_item_risks(it) for it in items]
    transfers = generate_transfer_recommendations(db)
    reorders = generate_reorder_plan(db)

    context_data = {
        "total_facilities": len(facilities),
        "total_medicines": len(medicines),
        "risks": risk_list,
        "transfers": transfers,
        "reorders": reorders
    }

    result = generate_ai_explanation(request.question, context_data)
    return result
