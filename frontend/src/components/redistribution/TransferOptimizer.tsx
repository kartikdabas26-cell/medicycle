import { Activity, ArrowRight, PackageCheck, ShieldCheck, Truck } from 'lucide-react';

export interface OptimizedTransfer {
  id: string;
  medicine_id: string;
  priority_score: number;
  days_to_expiry: number;
  medicine_name: string;
  category: string;
  unit: string;
  batch_id: string;
  batch_number: string;
  source_inventory_id: string;
  destination_inventory_id: string;
  source_facility_name: string;
  destination_facility_name: string;
  expiry_date: string;
  quantity: number;
  estimated_savings_usd: number;
  eta_hours: number;
  route: string[];
  reason: string;
}

const money = (value: number) => `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

export function TransferOptimizer({ suggestions, canApprove, onApprove }: {
  suggestions: OptimizedTransfer[];
  canApprove: boolean;
  onApprove: (suggestion: OptimizedTransfer) => void;
}) {
  return <>
    <div className="mc-transfer-summary"><div><span className="mc-eyebrow">OPTIMIZER STATUS</span><strong>{suggestions.length} validated transfer matches</strong><small>Weighted consumption, expiry window, safety buffer and transit time applied.</small></div><span className="mc-optimizer-chip"><Activity size={15} /> ROUTE ENGINE ACTIVE</span></div>
    {suggestions.length ? <div className="mc-suggestion-grid">{suggestions.slice(0, 24).map((suggestion) => <article className="mc-suggestion-card" key={suggestion.id}>
      <div className="mc-suggestion-head"><span className="mc-priority">PRIORITY {suggestion.priority_score}</span><span className={`mc-risk-badge ${suggestion.days_to_expiry < 60 ? 'near_expiry_salvage' : 'surplus'}`}><i />{suggestion.days_to_expiry}d shelf life</span></div>
      <h3>{suggestion.medicine_name}</h3><span className="mc-suggestion-category">{suggestion.category} · Batch {suggestion.batch_number}</span>
      <div className="mc-route"><div className="mc-route-point"><i className="donor" /><span><small>DONOR</small><b>{suggestion.source_facility_name}</b></span></div>
        {suggestion.route.length > 2 && <div className="mc-route-hub">{suggestion.route.slice(1, -1).join(' → ')} <span>HUB</span></div>}
        <div className="mc-route-line"><span /></div><div className="mc-route-point"><i className="recipient" /><span><small>RECIPIENT</small><b>{suggestion.destination_facility_name}</b></span></div>
      </div>
      <p className="mc-suggestion-reason">{suggestion.reason}</p>
      <div className="mc-suggestion-metrics"><span><b>{suggestion.quantity.toLocaleString()}</b><small>{suggestion.unit}</small></span><span><b>{suggestion.eta_hours}h</b><small>estimated transit</small></span><span><b>{money(suggestion.estimated_savings_usd)}</b><small>waste averted</small></span></div>
      <details className="mc-calculation-disclosure">
        <summary>How this was calculated</summary>
        <ul>
          <li>Priority score: {suggestion.priority_score}</li>
          <li>Expiry window: {suggestion.days_to_expiry} days remaining</li>
          <li>Transit estimate: {suggestion.eta_hours} hours via {suggestion.route.join(' → ')}</li>
          <li>Estimated waste value averted: {money(suggestion.estimated_savings_usd)}</li>
          <li>{suggestion.reason}</li>
        </ul>
      </details>
      {canApprove
        ? <button className="mc-dispatch-btn" onClick={() => onApprove(suggestion)}><Truck size={16} /> Approve & dispatch <ArrowRight size={15} /></button>
        : <div className="mc-role-locked"><ShieldCheck size={14} /> Facility approval required to dispatch</div>}
    </article>)}</div> : <div className="mc-empty-state"><PackageCheck size={30} /><h3>No safe transfers available</h3><p>There are no current donor and shortage pairs that pass the expiry and consumption checks.</p></div>}
  </>;
}

export function ManifestGenerator({ manifest, medicine, quantity, unit, source, destination, route, dispatchedAt }: {
  manifest: string; medicine: string; quantity: number; unit: string; source: string;
  destination: string; route: string[]; dispatchedAt: string;
}) {
  return <section className="mc-print-voucher">
    <div className="mc-print-brand">MEDICYCLE <span>· CONSIGNMENT VOUCHER</span></div>
    <h1>Inter-facility transfer manifest</h1>
    <div className="mc-print-manifest">{manifest}</div>
    <div className="v3-manifest-qr-placeholder" role="img" aria-label={`QR code placeholder for manifest ${manifest}`}>QR<span>VERIFY</span></div>
    <dl><dt>Medicine</dt><dd>{medicine}</dd><dt>Quantity</dt><dd>{quantity} {unit}</dd>
      <dt>Donor facility</dt><dd>{source}</dd><dt>Recipient facility</dt><dd>{destination}</dd>
      <dt>Logistics route</dt><dd>{route.join(' → ')}</dd><dt>Dispatched</dt><dd>{dispatchedAt}</dd></dl>
    <p>Batch chain of custody must be maintained at each hand-off. Verify temperature and expiry before receipt.</p>
    <div className="mc-print-signatures"><span>Released by / signature</span><span>Received by / signature</span></div>
  </section>;
}
