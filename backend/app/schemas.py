from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class BatchSchema(BaseModel):
    id: str
    batch_number: str
    quantity: int
    expiry_date: str
    days_to_expiry: Optional[int] = None
    expiry_status: Optional[str] = None  # Expired, Critical (<60d), Warning (<120d), Healthy

    class Config:
        from_attributes = True

class FacilitySimple(BaseModel):
    id: str
    name: str
    facility_type: str
    location: str

    class Config:
        from_attributes = True

class MedicineSimple(BaseModel):
    id: str
    name: str
    generic_name: str
    category: str
    dosage_form: str
    unit: str
    unit_cost: float
    essential_tier: str

    class Config:
        from_attributes = True

class InventoryItemDetail(BaseModel):
    id: str
    facility_id: str
    facility_name: str
    facility_type: str
    medicine_id: str
    medicine_name: str
    category: str
    unit: str
    unit_cost: float
    current_stock: int
    safety_stock: int
    supplier_lead_time_days: int
    min_order_quantity: int
    storage_condition: str
    batches: List[BatchSchema] = []
    weekly_consumption: List[int] = []
    avg_daily_demand: float = 0.0
    days_of_supply: float = 0.0
    lead_time_demand: float = 0.0
    stockout_risk_level: str = "Low"  # Critical, High, Moderate, Low
    expiry_risk_level: str = "Low"
    stockout_reason: Optional[str] = None
    expiry_risk_reason: Optional[str] = None

    class Config:
        from_attributes = True

class InventoryUpdateRequest(BaseModel):
    current_stock: Optional[int] = None
    safety_stock: Optional[int] = None
    supplier_lead_time_days: Optional[int] = None

class ForecastResult(BaseModel):
    inventory_id: str
    facility_id: str
    facility_name: str
    medicine_id: str
    medicine_name: str
    unit: str
    history_weeks: List[int]
    avg_weekly_demand: float
    avg_daily_demand: float
    forecast_method: str  # Exponential Smoothing (alpha=0.3) / Weighted Moving Average
    confidence_interval: str
    projected_7d_demand: float
    projected_30d_demand: float
    surge_multiplier: float
    explanation: str
    data_limitation_note: Optional[str] = None

class RiskItem(BaseModel):
    inventory_id: str
    facility_id: str
    facility_name: str
    medicine_id: str
    medicine_name: str
    current_stock: int
    avg_daily_demand: float
    days_remaining: float
    lead_time_days: int
    lead_time_demand: float
    safety_stock: int
    safety_stock_shortfall: float
    stockout_risk_level: str
    stockout_reason: str
    expiry_risk_level: str
    batches_at_risk: List[BatchSchema] = []
    projected_wasted_units: int = 0
    estimated_waste_cost: float = 0.0
    expiry_reason: str

class TransferRecommendation(BaseModel):
    id: str
    medicine_id: str
    medicine_name: str
    source_facility_id: str
    source_facility_name: str
    dest_facility_id: str
    dest_facility_name: str
    suggested_quantity: int
    urgency: str  # Critical, High, Moderate
    reason: str
    source_stock_before: int
    source_stock_remaining: int
    dest_stock_before: int
    dest_days_cover_before: float
    dest_days_cover_after: float
    donor_coverage_days_post_transfer: float
    expiry_guard_note: str
    status: str = "Proposed"

class ReorderItem(BaseModel):
    inventory_id: str
    facility_id: str
    facility_name: str
    medicine_id: str
    medicine_name: str
    current_stock: int
    safety_stock: int
    lead_time_days: int
    lead_time_demand: float
    target_stock: int
    reorder_point: int
    suggested_order_qty: int
    gross_suggested_qty: Optional[int] = None
    incoming_transfer_qty: int = 0
    net_order_qty: Optional[int] = None
    unit: str
    unit_cost: float
    estimated_order_cost: float
    gross_estimated_cost: Optional[float] = None
    transfer_offset_savings: float = 0.0
    currency: str = "USD"
    price_basis: str = "WHO Reference Catalog"
    urgency: str
    explanation: str

class DashboardSummary(BaseModel):
    total_facilities: int
    total_medicines: int
    total_inventory_items: int
    stockout_critical_count: int
    stockout_high_count: int
    expiry_risk_count: int
    total_surplus_transferable_units: int
    feasible_transfers_count: int
    estimated_at_risk_value_usd: float
    surge_multiplier: float
    recent_alerts: List[dict]
    facility_risk_breakdown: List[dict]
    category_stock_distribution: List[dict]
    demand_trend_data: List[dict]

class SimulationParams(BaseModel):
    surge_percentage: float = Field(default=0.0, ge=0.0, le=100.0, description="Demand surge percentage (e.g. 20 for +20%)")

class TransferActionRequest(BaseModel):
    transfer_id: str
    action: str = Field(..., description="'approve', 'dismiss', or 'complete'")

class AIExplainRequest(BaseModel):
    question: str
    context_type: Optional[str] = "general"  # general, transfer, risk, reorder
    item_id: Optional[str] = None
