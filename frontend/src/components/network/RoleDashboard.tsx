import { ArrowRight, Hospital, Pill, ShieldCheck, Truck } from 'lucide-react';

export type NetworkRole = 'Hospital' | 'Chemist' | 'Supplier' | 'Network Admin';
type Destination = 'inventory' | 'orders' | 'analytics';

interface WorkspaceSnapshot {
  inventory: {
    facility_id: string;
    risk_status: string;
    drug_name: string;
    days_to_expiry: number;
    batch_id: string;
    current_quantity: number;
    unit: string;
  }[];
  orders: { status: string }[];
  transfers: { status: string }[];
  facilities: { id: string }[];
}

export function RoleDashboard({ role, data, onNavigate, facilityId }: {
  role: NetworkRole;
  data: WorkspaceSnapshot;
  onNavigate: (page: Destination) => void;
  facilityId?: string | null;
}) {
  if (role === 'Hospital') {
    const wardNeeds = data.inventory.filter((item) => item.facility_id === (facilityId || 'NET-H01')
      && (item.risk_status === 'CRITICAL_SHORTAGE' || /insulin|ceftriaxone|epinephrine|oxytocin/i.test(item.drug_name)))
      .slice(0, 3);
    return <section className="mc-focus-module"><div className="mc-focus-symbol hospital"><Hospital size={17} /></div>
      <div className="mc-focus-copy"><span className="mc-eyebrow">INPATIENT WARD & ICU STOCK WATCH</span><strong>Critical medication needs</strong><small>Review ward-level resupply buffers and high-acuity medicines at your clinical center.</small></div>
      <div className="mc-focus-tags">{wardNeeds.map((item) => <span key={item.batch_id}>{item.drug_name}<b>{item.risk_status === 'CRITICAL_SHORTAGE' ? 'Replenish' : `${item.current_quantity} ${item.unit}`}</b></span>)}</div>
      <button onClick={() => onNavigate('inventory')}>Ward stock <ArrowRight size={13} /></button>
    </section>;
  }
  if (role === 'Chemist') {
    const salvage = data.inventory.filter((item) => item.facility_id === (facilityId || 'NET-C01') && item.days_to_expiry > 0 && item.days_to_expiry <= 45)
      .sort((a, b) => a.days_to_expiry - b.days_to_expiry).slice(0, 3);
    return <section className="mc-focus-module"><div className="mc-focus-symbol chemist"><Pill size={17} /></div>
      <div className="mc-focus-copy"><span className="mc-eyebrow">RETAIL SALVAGE DESK</span><strong>{salvage.length} short-dated batches to review</strong><small>Offer suitable stock to nearby care facilities before it expires.</small></div>
      <div className="mc-focus-tags">{salvage.map((item) => <span key={item.batch_id}>{item.drug_name}<b>{item.days_to_expiry} days</b></span>)}</div>
      <button onClick={() => onNavigate('inventory')}>Review salvage <ArrowRight size={13} /></button>
    </section>;
  }
  if (role === 'Supplier') {
    const pending = data.orders.filter((order) => order.status === 'Pending Approval').length;
    const dispatched = data.orders.filter((order) => order.status === 'Dispatched' || order.status === 'In-Transit').length;
    return <section className="mc-focus-module"><div className="mc-focus-symbol supplier"><Truck size={17} /></div>
      <div className="mc-focus-copy"><span className="mc-eyebrow">FULFILLMENT PIPELINE</span><strong>Network commitments & dispatch</strong><small>Track inbound orders and promised network lead times.</small></div>
      <div className="mc-focus-tags"><span>Awaiting approval<b>{pending} orders</b></span><span>Dispatch / transit<b>{dispatched} orders</b></span><span>Catalog reliability<b>94% average</b></span></div>
      <button onClick={() => onNavigate('orders')}>Open pipeline <ArrowRight size={13} /></button>
    </section>;
  }
  const inTransit = data.transfers.filter((transfer) => transfer.status === 'In-Transit').length;
  return <section className="mc-focus-module"><div className="mc-focus-symbol admin"><ShieldCheck size={17} /></div>
    <div className="mc-focus-copy"><span className="mc-eyebrow">COMPLIANCE CONTROL CENTER</span><strong>Transfer accountability & reconciliation</strong><small>Review approval records, signed manifests and unreconciled deliveries.</small></div>
    <div className="mc-focus-tags"><span>Verified transfer ledger<b>{data.transfers.length} manifests</b></span><span>Awaiting receipt<b>{inTransit} in transit</b></span><span>Connected members<b>{data.facilities.length} facilities</b></span></div>
    <button onClick={() => onNavigate('analytics')}>View audit trail <ArrowRight size={13} /></button>
  </section>;
}
