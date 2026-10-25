import { Building2 } from 'lucide-react';

export interface RiskMatrixRow {
  batch_id: string;
  drug_name: string;
  category: string;
  batch_number: string;
  facility_name: string;
  facility_type: string;
  current_quantity: number;
  unit: string;
  unit_cost: number;
  expiry_date: string;
  days_to_expiry: number;
  expiry_band: string;
  risk_status: string;
}

const riskLabels: Record<string, string> = {
  SURPLUS: 'Surplus',
  OPTIMAL: 'Optimal',
  CRITICAL_SHORTAGE: 'Shortage',
  NEAR_EXPIRY_SALVAGE: 'Near expiry',
  EXPIRED_QUARANTINE: 'Expired · quarantine',
};
const money = (value: number) => `$${value.toFixed(2)}`;
const formatDate = (value: string) => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T00:00:00`));

export function RiskMatrix({ rows }: { rows: RiskMatrixRow[] }) {
  return <>
    <div className="mc-table-scroll"><table className="mc-table"><thead><tr>
      <th>MEDICINE / CATEGORY</th><th>BATCH #</th><th>FACILITY</th><th>QUANTITY</th>
      <th>UNIT COST</th><th>EXPIRY DATE</th><th>DAYS TO EXPIRY</th><th>RISK STATUS</th>
    </tr></thead><tbody>
      {rows.slice(0, 150).map((row) => <tr key={row.batch_id}>
        <td><strong>{row.drug_name}</strong><small>{row.category}</small></td>
        <td className="mc-mono">{row.batch_number}</td>
        <td><span className="mc-facility-cell"><Building2 size={14} />{row.facility_name}<small>{row.facility_type}</small></span></td>
        <td><strong>{row.current_quantity.toLocaleString()}</strong><small>{row.unit}</small></td>
        <td>{money(row.unit_cost)}</td>
        <td>{formatDate(row.expiry_date)}</td>
        <td><span className={`mc-expiry-value ${row.expiry_band}`}>{row.days_to_expiry < 0 ? `Expired ${Math.abs(row.days_to_expiry)}d` : `${row.days_to_expiry} days`}</span></td>
        <td><span className={`mc-risk-badge ${row.risk_status.toLowerCase()}`}><i />{riskLabels[row.risk_status] || row.risk_status}</span></td>
      </tr>)}
      {rows.length === 0 && <tr><td colSpan={8} className="mc-empty-cell">No inventory matches the selected filters.</td></tr>}
    </tbody></table></div>
    <div className="mc-table-legend"><span><i className="legend-red" /> &lt;60 days</span><span><i className="legend-yellow" /> 60–120 days</span><span><i className="legend-green" /> 120+ days</span><small>Showing up to 150 batch records</small></div>
  </>;
}
