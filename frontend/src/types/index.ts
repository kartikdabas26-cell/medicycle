export interface BatchItem {
  id: string;
  batch_number: string;
  quantity: number;
  expiry_date: string;
  days_to_expiry: number;
  expiry_status: string;
  at_risk_quantity?: number;
}

export interface InventoryItem {
  id: string;
  facility_id: string;
  facility_name: string;
  facility_type: string;
  medicine_id: string;
  medicine_name: string;
  category: string;
  unit: string;
  unit_cost: number;
  current_stock: number;
  safety_stock: number;
  supplier_lead_time_days: number;
  min_order_quantity: number;
  storage_condition: string;
  batches: BatchItem[];
  weekly_consumption: number[];
  avg_daily_demand: number;
  days_of_supply: number;
  lead_time_demand: number;
  stockout_risk_level: 'Critical' | 'High' | 'Moderate' | 'Low';
  expiry_risk_level: 'Critical' | 'Warning' | 'Moderate' | 'Low';
  stockout_reason?: string;
  expiry_risk_reason?: string;
}

export interface ForecastItem {
  inventory_id: string;
  facility_id: string;
  facility_name: string;
  medicine_id: string;
  medicine_name: string;
  unit: string;
  history_weeks: number[];
  avg_weekly_demand: number;
  avg_daily_demand: number;
  forecast_method: string;
  confidence_interval: string;
  projected_7d_demand: number;
  projected_30d_demand: number;
  surge_multiplier: number;
  explanation: string;
  data_limitation_note?: string;
}

export interface RiskAlert {
  id: string;
  type: string;
  severity: string;
  facility: string;
  medicine: string;
  message: string;
  days_cover?: number;
  wasted_units?: number;
}

export interface RiskItem {
  inventory_id: string;
  facility_id: string;
  facility_name: string;
  medicine_id: string;
  medicine_name: string;
  category?: string;
  unit?: string;
  current_stock: number;
  avg_daily_demand: number;
  days_remaining: number;
  lead_time_days: number;
  lead_time_demand: number;
  safety_stock: number;
  safety_stock_shortfall: number;
  stockout_risk_level: 'Critical' | 'High' | 'Moderate' | 'Low';
  stockout_reason: string;
  expiry_risk_level: 'Critical' | 'Warning' | 'Moderate' | 'Low';
  batches_at_risk: BatchItem[];
  projected_wasted_units: number;
  estimated_waste_cost: number;
  expiry_reason: string;
}

export interface TransferRecommendation {
  id: string;
  medicine_id: string;
  medicine_name: string;
  category?: string;
  unit?: string;
  source_facility_id: string;
  source_facility_name: string;
  dest_facility_id: string;
  dest_facility_name: string;
  suggested_quantity: number;
  urgency: 'Critical' | 'High' | 'Moderate';
  reason: string;
  source_stock_before: number;
  source_stock_remaining: number;
  dest_stock_before: number;
  dest_days_cover_before: number;
  dest_days_cover_after: number;
  donor_coverage_days_post_transfer: number;
  expiry_guard_note: string;
  status: string;
}

export interface ReorderItem {
  inventory_id: string;
  facility_id: string;
  facility_name: string;
  medicine_id: string;
  medicine_name: string;
  category: string;
  unit: string;
  unit_cost: number;
  current_stock: number;
  safety_stock: number;
  lead_time_days: number;
  lead_time_demand: number;
  reorder_point: number;
  target_stock: number;
  suggested_order_qty: number;
  gross_suggested_qty?: number;
  incoming_transfer_qty?: number;
  net_order_qty?: number;
  estimated_order_cost: number;
  gross_estimated_cost?: number;
  transfer_offset_savings?: number;
  currency?: string;
  price_basis?: string;
  urgency: 'Critical' | 'High' | 'Moderate' | 'Transfer Covered' | string;
  explanation: string;
}

export interface FacilityBreakdown {
  facility: string;
  critical: number;
  high: number;
  healthy: number;
}

export interface DashboardSummary {
  total_facilities: number;
  total_medicines: number;
  total_inventory_items: number;
  stockout_critical_count: number;
  stockout_high_count: number;
  expiry_risk_count: number;
  total_surplus_transferable_units: number;
  feasible_transfers_count: number;
  estimated_at_risk_value_usd: number;
  surge_multiplier: number;
  recent_alerts: RiskAlert[];
  facility_risk_breakdown: FacilityBreakdown[];
  category_stock_distribution: { category: string; stock: number }[];
  demand_trend_data: { week: string; total_consumption: number }[];
}

export interface Facility {
  id: string;
  name: string;
  facility_type: string;
  location: string;
}

export type FacilityType = 'Hospital' | 'Chemist' | 'Supplier';

export interface Drug {
  id: string;
  name: string;
  generic_name: string;
  category: string;
  strength: string;
  dosage_form: string;
  unit: string;
  unit_cost: number;
  patient_price: number;
  brand_name: string;
}

export interface DrugBatch {
  id: string;
  medicine_id: string;
  facility_id: string;
  batch_number: string;
  quantity: number;
  safety_stock: number;
  expiry_date: string;
  unit_cost: number;
}

export interface FacilityStock {
  facility_id: string;
  medicine_id: string;
  batch_id: string;
  quantity: number;
  safety_stock: number;
  daily_consumption: number;
  weekly_consumption: number[];
  transit_days: number;
}

export interface NetworkFacility extends Facility {
  facility_type: FacilityType;
  distance_km: number;
  open_24_hours: boolean;
  licensed: boolean;
}

export interface TransferOrder {
  id: string;
  manifest_id: string;
  medicine_id: string;
  source_facility_id: string;
  destination_facility_id: string;
  batch_id: string;
  quantity: number;
  status: 'Pending Approval' | 'Approved' | 'Dispatched' | 'In-Transit' | 'Delivered & Reconciled';
  created_at: string;
}

export interface PurchaseOrder {
  id: string;
  facility_id: string;
  supplier_id: string;
  medicine_id: string;
  quantity: number;
  unit_price: number;
  status: 'Draft' | 'Pending Approval' | 'Dispatched' | 'In-Transit' | 'Delivered & Reconciled';
  created_at: string;
}

export interface PatientOrder {
  id: string;
  items: MarketplaceCartLine[];
  total: number;
  fulfillment: 'Delivery' | 'Pickup';
  created_at: string;
  status: 'Confirmed' | 'Ready for pickup' | 'Out for delivery' | 'Delivered';
}

export interface RefillSubscription {
  id: string;
  medicine_id: string;
  patient_name: string;
  frequency: 'Monthly' | 'Every 2 months' | 'Quarterly';
  next_refill_date: string;
  quantity: number;
  active: boolean;
}

export interface MarketplaceCartLine {
  medicine_id: string;
  facility_id: string;
  quantity: number;
  fulfillment: 'Delivery' | 'Pickup';
  option: 'Generic' | 'Brand';
}

export interface NetworkNotification {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical' | 'success';
  created_at: string;
  read: boolean;
}

export interface EmergencyRestockRequest {
  id: string;
  medicine_id: string;
  facility_ids: string[];
  created_at: string;
  status: 'Requested' | 'No nearby stock';
}

export interface PatientOffer {
  medicine: Drug;
  facility: NetworkFacility;
  batch: DrugBatch;
  days_to_expiry: number;
  generic_price: number;
  brand_price: number;
  available_quantity: number;
}
