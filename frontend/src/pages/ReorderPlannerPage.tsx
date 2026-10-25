import React, { useState } from 'react';
import {
  ClipboardList,
  Download,
  DollarSign,
  ShoppingCart,
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  Building2,
  Calendar,
  CheckCircle2,
  Info,
} from 'lucide-react';
import type { ReorderItem } from '../types';
import { RiskBadge } from '../components/RiskBadge';
import { CountUp } from '../components/CountUp';
import { api } from '../services/api';

interface ReorderPlannerPageProps {
  reorders: ReorderItem[];
  horizonDays: number;
  onHorizonChange: (days: number) => void;
  surgePct: number;
}

export const ReorderPlannerPage: React.FC<ReorderPlannerPageProps> = ({
  reorders,
  horizonDays,
  onHorizonChange,
  surgePct,
}) => {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const totalCost = reorders.reduce((sum, r) => sum + r.estimated_order_cost, 0);
  const totalSaved = reorders.reduce((sum, r) => sum + (r.transfer_offset_savings || 0), 0);
  const linesNeedingPurchase = reorders.filter((r) => r.suggested_order_qty > 0).length;
  const transferCoveredCount = reorders.filter(
    (r) => (r.incoming_transfer_qty || 0) > 0 && r.suggested_order_qty === 0
  ).length;

  const toggleRow = (id: string) => {
    setExpandedRow((prev) => (prev === id ? null : id));
  };

  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExportCsv = async () => {
    if (isExportingCsv) return;
    setIsExportingCsv(true);
    setExportError(null);
    try {
      await api.downloadFile(
        api.getReordersExportUrl(horizonDays, surgePct),
        `medicycle_reorder_plan_${horizonDays}d.csv`
      );
    } catch (err: any) {
      setExportError(err.message || 'Failed to export reorder CSV. Please check connection.');
    } finally {
      setIsExportingCsv(false);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto animate-fade-in-up">
      {exportError && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center justify-between">
          <span>{exportError}</span>
          <button onClick={() => setExportError(null)} className="underline hover:text-black font-semibold">
            Dismiss
          </button>
        </div>
      )}

      {/* Header and Horizon Controls */}
      <div className="glass-panel p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">📋</span>
            <h2 className="text-base font-bold text-[#0F172A] font-heading">
              Supplier Procurement & Purchase Order Planning
            </h2>
          </div>
          <p className="text-xs text-[#64748B] max-w-2xl leading-relaxed">
            Calculates commercial supplier purchase orders required after subtracting internal stock transfers to prevent double-ordering and avoid hospital overspending.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Neumorphic Horizon Selector */}
          <div className="flex items-center gap-1 bg-[#F1F5F3] p-1.5 rounded-full border border-white/80 shadow-inner text-xs">
            <span className="text-[#64748B] px-2 font-semibold">Planning Horizon:</span>
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => onHorizonChange(d)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  horizonDays === d
                    ? 'neu-button text-emerald-800 font-bold shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                {d} Days
              </button>
            ))}
          </div>

          <button
            onClick={handleExportCsv}
            disabled={isExportingCsv}
            className="neu-button-emerald px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-60"
          >
            <Download className={`h-4 w-4 ${isExportingCsv ? 'animate-bounce' : ''}`} />
            <span>{isExportingCsv ? 'Exporting...' : 'Export PO CSV'}</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Banner (4 Glass Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Lines to Purchase */}
        <div className="glass-panel p-5 space-y-1">
          <div className="text-xs text-[#64748B] font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <span>📦</span> Supplier Orders Needed
          </div>
          <div className="kpi-number text-3xl sm:text-4xl text-[#0F172A] mt-2">
            <CountUp value={linesNeedingPurchase} /> <span className="text-base font-medium text-[#64748B]">Lines</span>
          </div>
          <div className="text-xs text-emerald-700 font-semibold mt-1">
            {transferCoveredCount} satisfied via internal transfer
          </div>
        </div>

        {/* Net Purchase Value */}
        <div className="glass-panel p-5 space-y-1">
          <div className="text-xs text-[#64748B] font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <span>💵</span> Net Purchase Budget
          </div>
          <div className="kpi-number text-3xl sm:text-4xl text-emerald-800 mt-2">
            $<CountUp value={totalCost} decimals={2} />
          </div>
          <div className="text-xs text-[#64748B] font-medium mt-1">
            WHO Model Reference Catalog basis
          </div>
        </div>

        {/* Transfer Savings */}
        <div className="glass-panel p-5 space-y-1">
          <div className="text-xs text-[#64748B] font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <span>🔄</span> Transfer Savings
          </div>
          <div className="kpi-number text-3xl sm:text-4xl text-teal-700 mt-2">
            $<CountUp value={totalSaved} decimals={2} />
          </div>
          <div className="text-xs text-emerald-700 font-semibold mt-1">
            Zero-cost internal procurement
          </div>
        </div>

        {/* Planning Horizon */}
        <div className="glass-panel p-5 space-y-1">
          <div className="text-xs text-[#64748B] font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <span>⏳</span> Active Cycle Window
          </div>
          <div className="kpi-number text-3xl sm:text-4xl text-[#0F172A] mt-2">
            <CountUp value={horizonDays} /> <span className="text-base font-medium text-[#64748B]">Days</span>
          </div>
          <div className="text-xs text-[#64748B] font-medium mt-1">
            Lead-time delivery safety margin
          </div>
        </div>
      </div>

      {/* Main Glass Table of Reorder Requirements */}
      <div className="glass-panel overflow-hidden shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-emerald-50/60 text-[#0F172A] font-heading font-bold border-b border-emerald-100">
              <tr>
                <th className="py-4 px-5">Medicine Item</th>
                <th className="py-4 px-5">Facility</th>
                <th className="py-4 px-5">Current vs Target</th>
                <th className="py-4 px-5">Gross Deficit</th>
                <th className="py-4 px-5">Transfer Offset</th>
                <th className="py-4 px-5">Net PO Quantity</th>
                <th className="py-4 px-5">Est. Order Cost</th>
                <th className="py-4 px-5">Status</th>
                <th className="py-4 px-5 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-900/5 text-[#0F172A]">
              {reorders.map((item, idx) => {
                const rowKey = `${item.facility_name}-${item.medicine_name}-${idx}`;
                const isExpanded = expandedRow === rowKey;
                const isCovered = (item.incoming_transfer_qty || 0) > 0 && item.suggested_order_qty === 0;

                return (
                  <React.Fragment key={rowKey}>
                    <tr
                      onClick={() => toggleRow(rowKey)}
                      className="hover:bg-white/80 cursor-pointer transition-colors"
                    >
                      <td className="py-3.5 px-5">
                        <div className="font-bold text-[#0F172A]">{item.medicine_name}</div>
                        <span className="text-[11px] text-[#64748B] font-medium">💊 {item.category}</span>
                      </td>

                      <td className="py-3.5 px-5">
                        <div className="font-semibold text-[#0F172A]">{item.facility_name}</div>
                      </td>

                      <td className="py-3.5 px-5 font-mono">
                        <span className="font-bold text-[#0F172A]">{item.current_stock}</span>
                        <span className="text-[#64748B] font-sans"> / {item.target_stock} target</span>
                      </td>

                      <td className="py-3.5 px-5 font-mono text-[#64748B]">
                        {item.gross_suggested_qty ?? item.suggested_order_qty} {item.unit}
                      </td>

                      <td className="py-3.5 px-5 font-mono font-semibold">
                        {(item.incoming_transfer_qty || 0) > 0 ? (
                          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            -{item.incoming_transfer_qty} {item.unit}
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>

                      <td className="py-3.5 px-5 font-mono font-extrabold text-sm">
                        {item.suggested_order_qty > 0 ? (
                          <span className="text-rose-600">
                            {item.suggested_order_qty.toLocaleString()} {item.unit}
                          </span>
                        ) : (
                          <span className="text-emerald-700">0 (Covered)</span>
                        )}
                      </td>

                      <td className="py-3.5 px-5 font-mono font-bold text-xs">
                        ${item.estimated_order_cost.toFixed(2)}
                      </td>

                      <td className="py-3.5 px-5">
                        <RiskBadge level={isCovered ? 'Transfer Covered' : item.urgency} />
                      </td>

                      <td className="py-3.5 px-5 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRow(rowKey);
                          }}
                          className="neu-button p-1.5 rounded-full text-emerald-800 hover:text-emerald-950 inline-flex items-center"
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="bg-emerald-50/40">
                        <td colSpan={9} className="p-4 px-6 text-xs text-[#64748B]">
                          <div className="glass-panel p-4 space-y-2 bg-white/90">
                            <div className="font-bold text-[#0F172A] flex items-center gap-2">
                              <Info className="h-4 w-4 text-emerald-600" />
                              <span>Clinical Replenishment Justification & Deduplication Math</span>
                            </div>
                            <p className="text-[11px] leading-relaxed">
                              {item.explanation}
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-[11px] border-t border-emerald-900/5">
                              <div>Reorder Point: <strong className="text-[#0F172A]">{item.reorder_point}</strong></div>
                              <div>Lead Time Demand: <strong className="text-[#0F172A]">{item.lead_time_demand}</strong></div>
                              <div>Lead Time: <strong className="text-[#0F172A]">{item.lead_time_days}d</strong></div>
                              <div>Pricing Basis: <strong className="text-emerald-800">{item.price_basis || 'WHO Reference'}</strong></div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
