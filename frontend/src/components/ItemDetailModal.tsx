import React, { useState } from 'react';
import { X, Save, AlertCircle, Calendar, PackageCheck, TrendingUp, CheckCircle2 } from 'lucide-react';
import type { InventoryItem } from '../types';
import { RiskBadge } from './RiskBadge';
import { api } from '../services/api';

interface ItemDetailModalProps {
  item: InventoryItem | null;
  onClose: () => void;
  onUpdated: () => void;
}

export const ItemDetailModal: React.FC<ItemDetailModalProps> = ({ item, onClose, onUpdated }) => {
  if (!item) return null;
  return <ItemDetailModalContent item={item} onClose={onClose} onUpdated={onUpdated} />;
};

const ItemDetailModalContent: React.FC<Omit<ItemDetailModalProps, 'item'> & { item: InventoryItem }> = ({
  item,
  onClose,
  onUpdated,
}) => {
  const [stockVal, setStockVal] = useState<number>(item.current_stock);
  const [safetyVal, setSafetyVal] = useState<number>(item.safety_stock);
  const [leadTimeVal, setLeadTimeVal] = useState<number>(item.supplier_lead_time_days);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await api.updateInventoryItem(item.id, {
        current_stock: stockVal,
        safety_stock: safetyVal,
        supplier_lead_time_days: leadTimeVal,
      });
      setSuccessMsg('Inventory telemetry updated! Recalculating network balance...');
      setTimeout(() => {
        onUpdated();
        onClose();
      }, 700);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update item parameters');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in-up">
      <div className="glass-modal w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-emerald-900/5 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                💊 {item.medicine_id}
              </span>
              <span className="text-xs text-[#64748B] font-medium">{item.category}</span>
            </div>
            <h2 className="text-lg font-bold text-[#0F172A] font-heading mt-1">
              {item.medicine_name}
            </h2>
            <p className="text-xs text-[#64748B]">
              Hospital: <strong className="text-[#0F172A]">{item.facility_name}</strong> ({item.facility_type})
            </p>
          </div>

          <button
            onClick={onClose}
            className="neu-button p-2 rounded-full text-[#64748B] hover:text-[#0F172A]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="space-y-5">
          {/* Status Metric Cards */}
          <div className="grid grid-cols-2 gap-3.5">
            <div className="glass-panel p-4 space-y-1.5 bg-white/60">
              <span className="text-[11px] text-[#64748B] font-semibold uppercase tracking-wider">
                Stockout Risk Assessment
              </span>
              <div className="flex items-center gap-2 pt-1">
                <RiskBadge level={item.stockout_risk_level} />
                <span className="text-xs font-bold text-[#0F172A]">
                  {item.days_of_supply.toFixed(1)} Days left
                </span>
              </div>
            </div>

            <div className="glass-panel p-4 space-y-1.5 bg-white/60">
              <span className="text-[11px] text-[#64748B] font-semibold uppercase tracking-wider">
                Expiry Risk Status
              </span>
              <div className="flex items-center gap-2 pt-1">
                <RiskBadge level={item.expiry_risk_level} />
                <span className="text-xs text-[#64748B] font-medium">
                  {item.batches.length} Tracked Batch(es)
                </span>
              </div>
            </div>
          </div>

          {/* Clinical Rationale Box */}
          <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-100 text-xs text-[#0F172A] space-y-1 leading-relaxed">
            <div className="font-bold text-emerald-900 flex items-center gap-1.5">
              <span>🩺 Clinical Status:</span>
            </div>
            <p>{item.stockout_reason || item.expiry_risk_reason}</p>
          </div>

          {/* Quick Adjustment Form */}
          <div className="glass-panel p-5 bg-white/70 space-y-4">
            <h4 className="text-xs font-bold text-[#0F172A] font-heading flex items-center gap-1.5">
              <span>⚙️ Adjust On-Hand & Safety Buffer Parameters</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block text-[#64748B] font-semibold mb-1">Usable Stock ({item.unit})</label>
                <input
                  type="number"
                  value={stockVal}
                  onChange={(e) => setStockVal(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full bg-[#F8FAF9] border border-emerald-100 rounded-xl px-3 py-2 font-mono font-bold text-[#0F172A] shadow-inner focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>

              <div>
                <label className="block text-[#64748B] font-semibold mb-1">Safety Buffer Target</label>
                <input
                  type="number"
                  value={safetyVal}
                  onChange={(e) => setSafetyVal(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full bg-[#F8FAF9] border border-emerald-100 rounded-xl px-3 py-2 font-mono font-bold text-[#0F172A] shadow-inner focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>

              <div>
                <label className="block text-[#64748B] font-semibold mb-1">Supplier Lead Time (d)</label>
                <input
                  type="number"
                  value={leadTimeVal}
                  onChange={(e) => setLeadTimeVal(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-[#F8FAF9] border border-emerald-100 rounded-xl px-3 py-2 font-mono font-bold text-[#0F172A] shadow-inner focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>
            </div>
          </div>

          {/* Feedback Alerts */}
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-emerald-900/5">
          <button
            onClick={onClose}
            className="neu-button px-4 py-2 rounded-full text-xs font-semibold text-[#64748B] hover:text-[#0F172A]"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="neu-button-emerald px-5 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            <span>{isSaving ? 'Updating...' : 'Save Adjustments'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
