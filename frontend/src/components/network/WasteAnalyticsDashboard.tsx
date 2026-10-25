import { ArrowLeftRight, CalendarDays, CheckCircle2, Clock3, ShieldCheck, Users, Wallet, type LucideIcon } from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';

export interface NetworkAnalytics {
  waste_averted_usd: number;
  stockouts_prevented: number;
  redistribution_units: number;
  average_transit_hours: number;
  category_volume: { category: string; units: number }[];
  monthly_savings: { month: string; savings: number; potential_loss: number }[];
  leaderboard: { facility: string; saved_usd: number }[];
}
export interface NetworkAuditEvent {
  id: number;
  actor_role: string;
  action: string;
  entity_id: string;
  created_at: string;
}

const colors = ['#0ea5e9', '#10b981', '#3975a3', '#69c5d9', '#0f2043'];
const money = (value: number) => `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

export function WasteAnalyticsDashboard({ analytics, auditLogs, showAudit, activeSubscriptions }: {
  analytics: NetworkAnalytics; auditLogs: NetworkAuditEvent[]; showAudit: boolean; activeSubscriptions: number;
}) {
  const maximumSavings = Math.max(1, ...analytics.leaderboard.map((item) => item.saved_usd));
  return <>
    <div className="mc-kpi-grid mc-analytics-kpis">
      <Kpi label="TOTAL VALUE SAVED" value={money(analytics.waste_averted_usd)} icon={Wallet} note="Verified savings ledger" />
      <Kpi label="CRITICAL STOCKOUTS AVERTED" value={analytics.stockouts_prevented.toLocaleString()} icon={ShieldCheck} note="Through network intervention" />
      <Kpi label="DRUG WASTAGE PREVENTED" value={analytics.redistribution_units.toLocaleString()} icon={ArrowLeftRight} note="Units rescued through transfers" />
      <Kpi label="AVG TURNAROUND" value={`${analytics.average_transit_hours}h`} icon={Clock3} note="Transfer transit & close" />
      <Kpi label="ACTIVE SUBSCRIPTIONS" value={activeSubscriptions.toLocaleString()} icon={CalendarDays} note="Patient refill reminders" />
    </div>
    <div className="mc-chart-grid">
      <section className="mc-panel mc-chart-panel"><div className="mc-panel-heading"><div><span className="mc-eyebrow">BY CATEGORY</span><h2>Redistribution volume</h2></div></div><div className="mc-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={analytics.category_volume} margin={{ left: -14, bottom: 35 }}><CartesianGrid stroke="#edf0eb" vertical={false} /><XAxis dataKey="category" interval={0} angle={-12} textAnchor="end" axisLine={false} tickLine={false} tick={{ fill: '#617289', fontSize: 10 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#617289', fontSize: 10 }} /><Tooltip /><Bar dataKey="units" name="Redistributed units" radius={[5, 5, 0, 0]}>{analytics.category_volume.map((entry, index) => <Cell key={entry.category} fill={colors[index % colors.length]} />)}</Bar></BarChart></ResponsiveContainer></div></section>
      <section className="mc-panel mc-chart-panel"><div className="mc-panel-heading"><div><span className="mc-eyebrow">MONTHLY TREND</span><h2>Savings & potential losses</h2></div></div><div className="mc-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={analytics.monthly_savings} margin={{ top: 12, right: 4, left: -16, bottom: 0 }}><CartesianGrid stroke="#edf0eb" vertical={false} /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#617289', fontSize: 10 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#617289', fontSize: 10 }} tickFormatter={(value: number) => `$${value / 1000}k`} /><Tooltip formatter={(value) => money(Number(value))} /><Area type="monotone" dataKey="potential_loss" name="Potential expiry loss" stroke="#0ea5e9" fill="#eaf8ff" /><Area type="monotone" dataKey="savings" name="Savings realized" stroke="#10b981" fill="#e6f8ef" /></AreaChart></ResponsiveContainer></div></section>
    </div>
    <section className="mc-panel mc-leaderboard"><div className="mc-panel-heading"><div><span className="mc-eyebrow">NETWORK LEADERBOARD</span><h2>Facilities reducing medicine waste</h2></div><Users size={18} color="#0f2043" /></div>
      {analytics.leaderboard.map((item, index) => <div className="mc-leader-row" key={item.facility}><span className="mc-leader-rank">{String(index + 1).padStart(2, '0')}</span><span className="mc-leader-medal">{index === 0 ? '★' : '•'}</span><strong>{item.facility}</strong><div className="mc-leader-bar"><i style={{ width: `${Math.max(9, item.saved_usd / maximumSavings * 100)}%` }} /></div><b>{money(item.saved_usd)}</b></div>)}
    </section>
    {showAudit && <section className="mc-panel mc-audit-panel"><div className="mc-panel-heading"><div><span className="mc-eyebrow">COMPLIANCE & GOVERNANCE</span><h2>Recent audit trail</h2></div><ShieldCheck size={18} color="#0f2043" /></div>
      <div className="mc-audit-list">{auditLogs.slice(0, 12).map((event) => <div className="mc-audit-row" key={event.id}><span className="mc-audit-check"><CheckCircle2 size={14} /></span><span><b>{event.action.replaceAll('.', ' ')}</b><small>{event.actor_role} · {event.entity_id}</small></span><time>{event.created_at.replace('T', ' ').slice(0, 16)}</time></div>)}
        {auditLogs.length === 0 && <p className="mc-empty-inline">No audit events recorded yet.</p>}</div>
    </section>}
  </>;
}

function Kpi({ label, value, icon: Icon, note }: { label: string; value: string; icon: LucideIcon; note: string }) {
  return <article className="mc-kpi-card"><div className="mc-kpi-top"><span>{label}</span><span className="mc-kpi-icon"><Icon size={17} /></span></div><strong className="mc-kpi-value">{value}</strong><div className="mc-kpi-foot"><span>{note}</span></div></article>;
}
