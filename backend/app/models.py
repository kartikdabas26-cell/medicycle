from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Text, JSON, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

class Facility(Base):
    __tablename__ = "facilities"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    facility_type = Column(String, nullable=False)  # Tertiary, District, Community, Rural
    location = Column(String, nullable=False)
    contact_email = Column(String, nullable=True)
    phone = Column(String, nullable=True)

    inventory_items = relationship("InventoryItem", back_populates="facility", cascade="all, delete-orphan")


class Medicine(Base):
    __tablename__ = "medicines"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    generic_name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    dosage_form = Column(String, nullable=False)  # e.g., Capsule, Tablet, Injection
    unit = Column(String, nullable=False)         # e.g., capsules, vials, ampoules
    unit_cost = Column(Float, default=1.0)        # in USD for inventory valuation
    essential_tier = Column(String, default="WHO Core")

    inventory_items = relationship("InventoryItem", back_populates="medicine", cascade="all, delete-orphan")


class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id = Column(String, primary_key=True, index=True)
    facility_id = Column(String, ForeignKey("facilities.id"), nullable=False)
    medicine_id = Column(String, ForeignKey("medicines.id"), nullable=False)
    current_stock = Column(Integer, default=0)
    safety_stock = Column(Integer, default=50)
    supplier_lead_time_days = Column(Integer, default=7)
    min_order_quantity = Column(Integer, default=100)
    storage_condition = Column(String, default="Room Temp (15-25°C)")
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    facility = relationship("Facility", back_populates="inventory_items")
    medicine = relationship("Medicine", back_populates="inventory_items")
    batches = relationship("Batch", back_populates="inventory_item", cascade="all, delete-orphan")
    consumption_history = relationship("WeeklyConsumption", back_populates="inventory_item", cascade="all, delete-orphan")


class Batch(Base):
    __tablename__ = "batches"

    id = Column(String, primary_key=True, index=True)
    inventory_item_id = Column(String, ForeignKey("inventory_items.id"), nullable=False)
    batch_number = Column(String, nullable=False)
    quantity = Column(Integer, nullable=False)
    expiry_date = Column(String, nullable=False)  # ISO Date YYYY-MM-DD
    created_at = Column(DateTime, default=datetime.now)

    inventory_item = relationship("InventoryItem", back_populates="batches")


class WeeklyConsumption(Base):
    __tablename__ = "weekly_consumption"

    id = Column(Integer, primary_key=True, autoincrement=True)
    inventory_item_id = Column(String, ForeignKey("inventory_items.id"), nullable=False)
    week_index = Column(Integer, nullable=False)  # 1 to 8 (1 = 8 weeks ago, 8 = last week)
    quantity = Column(Integer, nullable=False)

    inventory_item = relationship("InventoryItem", back_populates="consumption_history")


class TransferRecord(Base):
    __tablename__ = "transfer_records"

    id = Column(String, primary_key=True, index=True)
    medicine_id = Column(String, nullable=False)
    medicine_name = Column(String, nullable=False)
    source_facility_id = Column(String, nullable=False)
    source_facility_name = Column(String, nullable=False)
    dest_facility_id = Column(String, nullable=False)
    dest_facility_name = Column(String, nullable=False)
    suggested_quantity = Column(Integer, nullable=False)
    urgency = Column(String, nullable=False)  # Critical, High, Moderate
    reason = Column(Text, nullable=False)
    source_stock_remaining = Column(Integer, nullable=False)
    dest_days_cover_before = Column(Float, nullable=False)
    dest_days_cover_after = Column(Float, nullable=False)
    status = Column(String, default="Proposed")  # Proposed, Approved, Completed, Dismissed
    created_at = Column(DateTime, default=datetime.now)


class NetworkTransfer(Base):
    __tablename__ = "network_transfers"

    id = Column(String, primary_key=True, index=True)
    manifest_id = Column(String, unique=True, nullable=False, index=True)
    medicine_id = Column(String, nullable=False)
    medicine_name = Column(String, nullable=False)
    batch_id = Column(String, nullable=True)
    source_inventory_id = Column(String, ForeignKey("inventory_items.id"), nullable=False)
    destination_inventory_id = Column(String, ForeignKey("inventory_items.id"), nullable=False)
    source_facility_name = Column(String, nullable=False)
    destination_facility_name = Column(String, nullable=False)
    quantity = Column(Integer, nullable=False)
    savings_usd = Column(Float, nullable=False, default=0)
    route_json = Column(JSON, nullable=False)
    status = Column(String, nullable=False, default="In-Transit")
    approved_by_role = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.now, nullable=False)


class TransferRequest(Base):
    __tablename__ = "transfer_requests"

    id = Column(String, primary_key=True, index=True)
    requisition_key = Column(String, nullable=False, index=True)
    recommendation_id = Column(String, nullable=False)
    donor_facility_id = Column(String, ForeignKey("facilities.id"), nullable=False, index=True)
    recipient_facility_id = Column(String, ForeignKey("facilities.id"), nullable=False, index=True)
    donor_inventory_id = Column(String, ForeignKey("inventory_items.id"), nullable=False)
    recipient_inventory_id = Column(String, ForeignKey("inventory_items.id"), nullable=False)
    medicine_id = Column(String, ForeignKey("medicines.id"), nullable=False)
    batch_id = Column(String, ForeignKey("batches.id"), nullable=True)
    quantity = Column(Integer, nullable=False)
    donor_stock_before = Column(Integer, nullable=False)
    projected_30_day_demand = Column(Float, nullable=False)
    donor_stock_after_release = Column(Integer, nullable=False)
    safety_reserve = Column(Integer, nullable=False)
    days_to_expiry = Column(Integer, nullable=False)
    route_json = Column(JSON, nullable=False, default=list)
    eta_hours = Column(Integer, nullable=False, default=0)
    priority_score = Column(Float, nullable=False, default=0)
    failover_level = Column(String, nullable=False, default="Primary")
    status = Column(String, nullable=False, default="PENDING_DONOR_CONSENT", index=True)
    decline_reason = Column(Text, nullable=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    manifest_id = Column(String, unique=True, nullable=True, index=True)
    supplier_order_id = Column(String, ForeignKey("purchase_orders.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.now, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now, nullable=False)


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id = Column(String, primary_key=True, index=True)
    facility_id = Column(String, ForeignKey("facilities.id"), nullable=False)
    facility_name = Column(String, nullable=False)
    supplier_name = Column(String, nullable=False)
    medicine_id = Column(String, ForeignKey("medicines.id"), nullable=False)
    medicine_name = Column(String, nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Float, nullable=False)
    status = Column(String, nullable=False, default="Pending Approval")
    created_at = Column(DateTime, default=datetime.now, nullable=False)


class NetworkAuditLog(Base):
    __tablename__ = "network_audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    actor_role = Column(String, nullable=False)
    action = Column(String, nullable=False)
    entity_id = Column(String, nullable=False)
    details = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime, default=datetime.now, nullable=False)


class UserAccount(Base):
    __tablename__ = "user_accounts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    domain = Column(String, nullable=False, index=True)  # 'patient', 'hospital', 'chemist', 'supplier', 'admin'
    facility_id = Column(String, nullable=True, index=True)  # 'FAC-001', 'FAC-003', 'FAC-006'
    email = Column(String, unique=True, nullable=True, index=True)
    phone = Column(String, nullable=True, index=True)
    hashed_password = Column(String, nullable=True)
    pin = Column(String, nullable=True)  # For master admin
    is_verified = Column(Boolean, default=False, nullable=False)
    is_superadmin = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.now, nullable=False)


class AuthVerificationToken(Base):
    __tablename__ = "auth_verification_tokens"

    id = Column(Integer, primary_key=True, autoincrement=True)
    identifier = Column(String, nullable=False, index=True)  # email or phone
    code = Column(String, nullable=False, index=True)  # 6-digit code
    token_type = Column(String, nullable=False, index=True)  # 'patient_otp', 'institutional_email_verify'
    expires_at = Column(DateTime, nullable=False)
    is_used = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.now, nullable=False)

