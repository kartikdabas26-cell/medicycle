import React, { useState } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  Clock,
  ArrowRight,
  ArrowLeftRight,
  ShoppingCart,
  Eye,
  PackageX,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import type { RiskItem } from '../types';
import { RiskBadge } from '../components/RiskBadge';
import type { NavigationTab } from '../components/Sidebar';

interface RiskAlertsPageProps {
  risks: RiskItem[];
  onSelectItem: (inventoryId: string) => void;
  onNavigate?: (tab: NavigationTab) => void;
}

export const RiskAlertsPage: React.FC<RiskAlertsPageProps> = ({
  risks,
  onSelectItem,
  onNavigate,
}) => {
  const [activeFilter, setActiveFilter] = useState<
    'all' | 'stockout_zero' | 'projected' | 'low_buffer' | 'expiry'
  >('all');

  // Strict clinical categorization
  const stockoutZero = risks.filter((r) => r.current_stock === 0);
  const projectedShortages = risks.filter(
    (r) => r.current_stock > 0 && r.days_remaining <= r.lead_time_days
  );
  const lowBuffer = risks.filter(
    (r) => r.days_remaining > r.lead_time_days && r.days_remaining <= r.lead_time_days * 1.5
  );
  const expiringItems = risks.filter(
    (r) => r.expiry_risk_level === 'Critical' || r.expiry_risk_level === 'Warning'
  );

  const displayedItems = (() => {
    switch (activeFilter) {
      case 'stockout_zero':
        return stockoutZero;
      case 'projected':
        return projectedShortages;
      case 'low_buffer':
        return lowBuffer;
      case 'expiry':
        return expiringItems;
      default:
        return risks;
    }
  })();

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto animate-fade-in-up">
      {/* Header & Filter Pill Tabs */}
      <div className="glass-panel p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
            ⚠️
          </div>
          <div>
            <h2 className="text-base font-bold text-[#0F172A] font-heading">
              Clinical Supply Risk Assessment & Triage
            </h2>
            <p className="text-xs text-[#64748B]">
              Classifies zero-stock positions, lead-time replenishment deficits, and upcoming batch expirations.
            </p>
          </div>
        </div>

        {/* Neumorphic Filter Pill Tabs */}
        <div className="flex items-center gap-1.5 bg-[#F1F5F3] p-1.5 rounded-full border border-white/80 shadow-inner flex-wrap">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
              activeFilter === 'all'
                ? 'neu-button text-[#0F172A] font-bold'
                : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            All Items ({risks.length})
          </button>
          <button
            onClick={() => setActiveFilter('stockout_zero')}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
              activeFilter === 'stockout_zero'
                ? 'bg-rose-500 text-white shadow-xs font-bold'
                : 'text-[#64748B] hover:text-rose-700'
            }`}
          >
            0 Stock ({stockoutZero.length})
          </button>
          <button
            onClick={() => setActiveFilter('projected')}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
              activeFilter === 'projected'
                ? 'bg-rose-500 text-white shadow-xs font-bold'
                : 'text-[#64748B] hover:text-rose-700'
            }`}
          >
            &lt; Lead Time ({projectedShortages.length})
          </button>
          <button
            onClick={() => setActiveFilter('low_buffer')}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
              activeFilter === 'low_buffer'
                ? 'bg-amber-500 text-white shadow-xs font-bold'
                : 'text-[#64748B] hover:text-amber-700'
            }`}
          >
            Low Buffer ({lowBuffer.length})
          </button>
          <button
            onClick={() => setActiveFilter('expiry')}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
              activeFilter === 'expiry'
                ? 'bg-amber-500 text-white shadow-xs font-bold'
                : 'text-[#64748B] hover:text-amber-700'
            }`}
          >
            Expiring ({expiringItems.length})
          </button>
        </div>
      </div>

      {/* Risk Alert Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {displayedItems.map((r) => {
          const isZero = r.current_stock === 0;
          const isCrit = isZero || r.days_remaining <= r.lead_time_days;

          return (
            <div
              key={r.inventory_id}
              className={`glass-panel p-5 space-y-3.5 border transition-all glass-card-hover ${
                isCrit
                  ? 'border-rose-200/90 shadow-sm'
                  : 'border-white hover:border-emerald-300'
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <RiskBadge level={r.stockout_risk_level} />
                    {r.expiry_risk_level !== 'Low' && (
                      <RiskBadge level={r.expiry_risk_level} />
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-[#0F172A] font-heading mt-1 flex items-center gap-1.5">
                    <span>💊</span>
                    <span>{r.medicine_name}</span>
                  </h3>
                  <div className="text-xs text-[#64748B] flex items-center gap-1.5">
                    <span>🏥 {r.facility_name}</span>
                    <span className="text-slate-300">•</span>
                    <span>{r.category}</span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[10px] text-[#64748B] font-semibold uppercase tracking-wider">
                    Days of Supply
                  </div>
                  <div
                    className={`kpi-number text-2xl font-bold ${
                      isCrit ? 'text-rose-600' : 'text-emerald-700'
                    }`}
                  >
                    {r.days_remaining.toFixed(1)}d
                  </div>
                </div>
              </div>

              {/* Stock and Lead Time Metric Row */}
              <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-white/70 border border-emerald-900/5 text-center text-xs">
                <div>
                  <span className="text-[10px] text-[#64748B] block">Usable Stock</span>
                  <span className="font-mono font-bold text-[#0F172A]">
                    {r.current_stock.toLocaleString()} {r.unit}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#64748B] block">Lead Time</span>
                  <span className="font-mono font-bold text-[#0F172A]">
                    {r.lead_time_days} days
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#64748B] block">Deficit Status</span>
                  <span
                    className={`font-mono font-bold ${
                      r.safety_stock_shortfall > 0 ? 'text-rose-600' : 'text-emerald-700'
                    }`}
                  >
                    {r.safety_stock_shortfall > 0 ? `-${r.safety_stock_shortfall} units` : 'Buffer Ok'}
                  </span>
                </div>
              </div>

              {/* Clinical Reason Explanation */}
              <div className="p-3 rounded-2xl bg-emerald-50/50 border border-emerald-100 text-xs text-[#0F172A] leading-relaxed">
                {r.stockout_reason || r.expiry_reason}
              </div>

              {/* Actions Footer */}
              <div className="flex items-center justify-between pt-2 border-t border-emerald-900/5">
                <button
                  onClick={() => onSelectItem(r.inventory_id)}
                  className="neu-button px-3 py-1.5 rounded-full text-xs font-semibold text-[#0F172A] hover:text-emerald-700 flex items-center gap-1.5"
                >
                  <Eye className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Inspect Item</span>
                </button>

                <div className="flex items-center gap-2">
                  {onNavigate && (
                    <>
                      <button
                        onClick={() => onNavigate('transfers')}
                        className="neu-button-emerald px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1"
                      >
                        <ArrowLeftRight className="h-3.5 w-3.5 text-white" />
                        <span>Transfer</span>
                      </button>

                      <button
                        onClick={() => onNavigate('reorder')}
                        className="neu-button px-3 py-1.5 rounded-full text-xs font-semibold text-[#64748B] hover:text-[#0F172A]"
                      >
                        Reorder
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
