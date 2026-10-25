import React, { useState } from 'react';
import {
  Building2,
  Pill,
  AlertTriangle,
  Clock,
  ArrowLeftRight,
  ArrowRight,
  ShieldAlert,
  Activity,
  CheckCircle2,
  TrendingUp,
  Package,
  Layers,
  Sparkles,
  Check,
  X,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import type { DashboardSummary, TransferRecommendation } from '../types';
import { MetricCard } from '../components/MetricCard';
import { RiskBadge } from '../components/RiskBadge';
import type { NavigationTab } from '../components/Sidebar';
import { api } from '../services/api';

interface OverviewPageProps {
  summary: DashboardSummary | null;
  transfers: TransferRecommendation[];
  onNavigate: (tab: NavigationTab) => void;
  surgePct: number;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({
  summary,
  transfers,
  onNavigate,
  surgePct,
}) => {
  const [dismissedTransfers, setDismissedTransfers] = useState<Record<string, boolean>>({});
  const [acceptedTransfers, setAcceptedTransfers] = useState<Record<string, boolean>>({});
  const [isProcessingId, setIsProcessingId] = useState<string | null>(null);

  if (!summary) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        {/* Mint Skeleton Shimmer Loading State */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-panel p-6 h-44 mint-skeleton" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="glass-panel p-8 h-80 mint-skeleton" />
          <div className="glass-panel p-8 h-80 mint-skeleton" />
        </div>
      </div>
    );
  }

  // Calculate total network stock units
  const totalStock = summary.category_stock_distribution.reduce((acc, c) => acc + c.stock, 0);

  // Handle rapid Accept of AI recommendation card
  const handleAcceptTransfer = async (rec: TransferRecommendation) => {
    setIsProcessingId(rec.id);
    try {
      await api.approveTransfer(rec);
      setAcceptedTransfers((prev) => ({ ...prev, [rec.id]: true }));
    } catch (err) {
      console.error('Failed to accept transfer recommendation:', err);
    } finally {
      setIsProcessingId(null);
    }
  };

  const handleDismissTransfer = (recId: string) => {
    setDismissedTransfers((prev) => ({ ...prev, [recId]: true }));
  };

  const activeTransfers = transfers.filter((t) => !dismissedTransfers[t.id]);

  return (
    <div className="p-6 md:p-8 space-y-7 max-w-7xl mx-auto animate-fade-in-up">
      {/* Active Demand Surge Alert Banner */}
      {surgePct > 0 && (
        <div className="glass-panel p-4 border border-amber-300/80 bg-amber-50/70 shadow-sm flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-2xl bg-amber-100 text-amber-800 text-base shadow-xs">
              ⚡
            </span>
            <div>
              <div className="text-xs font-bold text-amber-900 font-heading">
                Active Stress Test: +{surgePct}% Emergency Demand Surge
              </div>
              <div className="text-[11px] text-amber-800/80">
                Buffer days and replenishment lead times recalibrated dynamically across all regional healthcare centers.
              </div>
            </div>
          </div>
          <button
            onClick={() => onNavigate('transfers')}
            className="neu-button px-3.5 py-1.5 rounded-full text-xs font-bold text-amber-900 flex items-center gap-1.5"
          >
            <span>Review Surge Actions</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 4 Primary Glass KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* 1. Total Stock */}
        <MetricCard
          title="Total Stock"
          value={totalStock}
          subtitle="Essential medicine units across network"
          emoji="📦"
          variant="default"
          trend="+4.2% vs past cycle"
          trendDirection="up"
          sparkline={[4200, 4800, 5100, 4900, 5600, 6100, 6400]}
        />

        {/* 2. Shortage Risk */}
        <MetricCard
          title="Shortage Risk"
          value={summary.stockout_critical_count}
          subtitle="Facilities below supplier lead time"
          emoji="⚠️"
          variant="danger"
          trend={`${summary.stockout_critical_count} Critical Alert(s)`}
          trendDirection="down"
          sparkline={[8, 7, 6, 5, 4, 4, summary.stockout_critical_count]}
        />

        {/* 3. Expiring Soon */}
        <MetricCard
          title="Expiring Soon"
          value={summary.expiry_risk_count}
          subtitle={`$${summary.estimated_at_risk_value_usd.toLocaleString()} at-risk value`}
          emoji="⏳"
          variant="warning"
          trend="Batches < 90 days"
          trendDirection="neutral"
          sparkline={[3, 2, 2, 1, 2, 1, summary.expiry_risk_count]}
        />

        {/* 4. Suggested Transfers */}
        <MetricCard
          title="Internal Transfers"
          value={summary.feasible_transfers_count}
          subtitle={`${summary.total_surplus_transferable_units.toLocaleString()} salvageable units`}
          emoji="🔄"
          variant="teal"
          trend="Immediate Resolution"
          trendDirection="up"
          sparkline={[1, 2, 3, 3, 4, 4, summary.feasible_transfers_count]}
        />
      </div>

      {/* AI Recommendation Cards Section */}
      <div className="glass-panel p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-emerald-900/5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-700">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#0F172A] font-heading">
                AI Inter-Facility Redistribution Recommendations
              </h2>
              <p className="text-[11px] text-[#64748B]">
                Optimized pairings: transfer surplus medicine from donor hubs to avert recipient stockouts with zero purchase expense
              </p>
            </div>
          </div>

          <button
            onClick={() => onNavigate('transfers')}
            className="text-xs font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1"
          >
            <span>View All ({transfers.length})</span>
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        {/* List of AI Transfer Cards with Neumorphic Accept/Dismiss */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeTransfers.slice(0, 3).map((t) => {
            const isAccepted = acceptedTransfers[t.id];
            const isBusy = isProcessingId === t.id;

            return (
              <div
                key={t.id}
                className="glass-panel p-4 flex flex-col justify-between border border-emerald-100 hover:border-emerald-300 transition-all shadow-xs"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <RiskBadge level={t.urgency} />
                    <span className="text-[11px] font-mono font-semibold text-emerald-800 bg-emerald-50/80 px-2 py-0.5 rounded-full border border-emerald-200">
                      {t.suggested_quantity} {t.unit || 'units'}
                    </span>
                  </div>

                  <div className="text-xs font-bold text-[#0F172A] leading-snug">
                    <span className="text-base mr-1">🔄</span>
                    Transfer <span className="text-emerald-700">{t.suggested_quantity} {t.unit} of {t.medicine_name}</span>
                  </div>

                  <div className="text-[11px] text-[#64748B] flex items-center gap-1.5 font-medium">
                    <span className="text-slate-800 font-semibold">{t.source_facility_name}</span>
                    <span className="text-emerald-600 font-bold">→</span>
                    <span className="text-slate-800 font-semibold">{t.dest_facility_name}</span>
                  </div>

                  <p className="text-[11px] text-[#64748B] bg-white/60 p-2.5 rounded-xl border border-emerald-900/5 leading-relaxed">
                    {t.reason}
                  </p>
                </div>

                {/* Neumorphic Accept / Dismiss Buttons */}
                <div className="mt-4 pt-3 border-t border-emerald-900/5 flex items-center justify-between gap-2">
                  {isAccepted ? (
                    <div className="w-full py-1.5 px-3 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold text-center flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span>Approved & In Transit</span>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => handleDismissTransfer(t.id)}
                        className="neu-button px-3 py-1.5 rounded-full text-xs font-semibold text-[#64748B] hover:text-rose-600 flex items-center gap-1 transition-all"
                      >
                        <X className="h-3.5 w-3.5 text-rose-500" />
                        <span>Dismiss</span>
                      </button>

                      <button
                        onClick={() => handleAcceptTransfer(t)}
                        disabled={isBusy}
                        className="neu-button-emerald px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5 text-white" />
                        <span>{isBusy ? 'Approving...' : 'Accept Transfer'}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {activeTransfers.length === 0 && (
            <div className="col-span-full p-6 text-center text-xs text-[#64748B] bg-white/40 rounded-2xl border border-emerald-100">
              ✅ All pending inter-facility transfers have been executed or reviewed.
            </div>
          )}
        </div>
      </div>

      {/* Two Premium Charts: Demand Consumption Trend + Risk Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Medicine Consumption Trends Area Chart */}
        <div className="glass-panel p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">📈</span>
              <div>
                <h3 className="text-sm font-bold text-[#0F172A] font-heading">
                  8-Week Network Consumption Trends
                </h3>
                <p className="text-[11px] text-[#64748B]">
                  Dispensed medicine velocity across all member hospitals
                </p>
              </div>
            </div>
            <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100/80 px-2.5 py-1 rounded-full border border-emerald-200">
              Verified Run-Rate
            </span>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={summary.demand_trend_data}>
                <defs>
                  <linearGradient id="emeraldFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(16, 185, 129, 0.12)" vertical={false} />
                <XAxis dataKey="week" stroke="#94A3B8" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis stroke="#94A3B8" tick={{ fontSize: 11, fill: '#64748B' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.92)',
                    backdropFilter: 'blur(12px)',
                    borderColor: 'rgba(16, 185, 129, 0.3)',
                    borderRadius: '16px',
                    fontSize: '12px',
                    color: '#0F172A',
                    boxShadow: '0 10px 25px -4px rgba(16, 185, 129, 0.2)',
                  }}
                  itemStyle={{ color: '#059669', fontWeight: 600 }}
                />
                <Area
                  type="monotone"
                  dataKey="total_consumption"
                  name="Units Dispensed"
                  stroke="#10B981"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#emeraldFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-100 text-[11px] text-emerald-900 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            <span>
              <strong>Clinical Assessment:</strong> Aggregated medicine run-rate is stable with ~2,400 units weekly across regional dispensaries.
            </span>
          </div>
        </div>

        {/* Facility Risk Breakdown Rounded Bar Chart */}
        <div className="glass-panel p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">🏥</span>
              <div>
                <h3 className="text-sm font-bold text-[#0F172A] font-heading">
                  Facility Stock Balance & Risk Distribution
                </h3>
                <p className="text-[11px] text-[#64748B]">
                  Critical stockout vs low buffer positions by healthcare center
                </p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('risks')}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1"
            >
              <span>View Triage</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.facility_risk_breakdown} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(16, 185, 129, 0.12)" vertical={false} />
                <XAxis
                  dataKey="facility"
                  stroke="#94A3B8"
                  tick={{ fontSize: 10, fill: '#64748B' }}
                  interval={0}
                  angle={-10}
                  textAnchor="end"
                  height={42}
                />
                <YAxis stroke="#94A3B8" tick={{ fontSize: 11, fill: '#64748B' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.92)',
                    backdropFilter: 'blur(12px)',
                    borderColor: 'rgba(16, 185, 129, 0.3)',
                    borderRadius: '16px',
                    fontSize: '12px',
                    color: '#0F172A',
                    boxShadow: '0 10px 25px -4px rgba(0, 0, 0, 0.1)',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
                <Bar dataKey="critical" name="Critical Shortage" fill="#EF4444" radius={[6, 6, 0, 0]} />
                <Bar dataKey="high" name="Low Stock" fill="#F59E0B" radius={[6, 6, 0, 0]} />
                <Bar dataKey="healthy" name="Adequate Stock" fill="#10B981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-100 text-[11px] text-emerald-900 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            <span>
              <strong>Network Dynamics:</strong> Central facilities hold excess reserves; peripheral clinics experience lead-time delays treatable via transfer.
            </span>
          </div>
        </div>
      </div>

      {/* Action Guidance & Critical Triage */}
      <div className="glass-panel p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-emerald-900/5 pb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-rose-600" />
            <h2 className="text-sm font-bold text-[#0F172A] font-heading">
              Priority Clinical Attention Items
            </h2>
          </div>
          <button
            onClick={() => onNavigate('risks')}
            className="text-xs font-bold text-emerald-700 hover:text-emerald-900"
          >
            All Alerts ({summary.recent_alerts.length}) →
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {summary.recent_alerts.slice(0, 4).map((alert) => (
            <div
              key={alert.id}
              className="p-4 rounded-2xl bg-white/70 border border-emerald-900/5 hover:border-emerald-300 transition-all space-y-2.5 shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RiskBadge level={alert.severity} />
                  <span className="text-xs font-bold text-[#0F172A]">{alert.facility}</span>
                </div>
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  {alert.medicine}
                </span>
              </div>

              <p className="text-xs text-[#64748B] leading-relaxed">
                {alert.message}
              </p>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => onNavigate('transfers')}
                  className="neu-button-emerald px-3 py-1 rounded-full text-[11px] font-bold flex items-center gap-1"
                >
                  <span>Resolve via Transfer</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
                <button
                  onClick={() => onNavigate('reorder')}
                  className="neu-button px-3 py-1 rounded-full text-[11px] font-semibold text-[#64748B] hover:text-[#0F172A]"
                >
                  Procure
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
