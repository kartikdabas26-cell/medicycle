import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Download,
  Upload,
  Edit2,
  Package,
  Layers,
  Building2,
  Calendar,
  FileText,
} from 'lucide-react';
import type { InventoryItem } from '../types';
import { RiskBadge } from '../components/RiskBadge';
import { api } from '../services/api';
import { downloadPdfFile } from '../utils/pdf';

interface InventoryPageProps {
  inventory: InventoryItem[];
  onSelectItem: (item: InventoryItem) => void;
  onOpenImport: () => void;
  surgePct: number;
}

export const InventoryPage: React.FC<InventoryPageProps> = ({
  inventory,
  onSelectItem,
  onOpenImport,
  surgePct,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFacility, setSelectedFacility] = useState('All');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedRisk, setSelectedRisk] = useState('All');

  // Extract distinct facilities and categories
  const facilities = useMemo(() => {
    const list = Array.from(new Set(inventory.map((i) => i.facility_name)));
    return ['All', ...list];
  }, [inventory]);

  const categories = useMemo(() => {
    const list = Array.from(new Set(inventory.map((i) => i.category)));
    return ['All', ...list];
  }, [inventory]);

  const filteredItems = useMemo(() => {
    return inventory.filter((item) => {
      const matchSearch =
        item.medicine_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.facility_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase());

      const matchFacility = selectedFacility === 'All' || item.facility_name === selectedFacility;
      const matchCategory = selectedCategory === 'All' || item.category === selectedCategory;
      const matchRisk =
        selectedRisk === 'All' ||
        item.stockout_risk_level === selectedRisk ||
        item.expiry_risk_level === selectedRisk;

      return matchSearch && matchFacility && matchCategory && matchRisk;
    });
  }, [inventory, searchQuery, selectedFacility, selectedCategory, selectedRisk]);

  const [isExporting, setIsExporting] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExportCsv = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportError(null);
    try {
      await api.downloadFile(api.getInventoryExportUrl(surgePct), 'medicycle_inventory.csv');
    } catch (err: any) {
      setExportError(err.message || 'Failed to export inventory CSV. Please check connection.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    setExportError(null);
    try {
      const url = api.getInventoryPdfUrl({
        facility_id: selectedFacility !== 'All' ? selectedFacility : undefined,
        category: selectedCategory !== 'All' ? selectedCategory : undefined,
        risk_level: selectedRisk !== 'All' ? selectedRisk : undefined,
        surge_pct: surgePct,
      });
      const token = localStorage.getItem('medicycle_token');
      await downloadPdfFile(url, `medicycle_inventory_${new Date().toISOString().slice(0, 10)}.pdf`, token);
    } catch (err: any) {
      setExportError(err.message || 'Failed to export inventory PDF. Please check connection.');
    } finally {
      setIsExportingPdf(false);
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

      {/* Top Glass Control Bar: Search & Action Buttons */}
      <div className="glass-panel p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search Input with Neumorphic Inset */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by medicine, facility, or clinical category..."
            className="w-full bg-[#F8FAF9] border border-white/90 rounded-full pl-10 pr-4 py-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] shadow-inner focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:bg-white transition-all"
          />
        </div>

        {/* Action Buttons: Neumorphic Import & Emerald Export */}
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenImport}
            className="neu-button px-4 py-2 rounded-full text-xs font-semibold text-[#0F172A] flex items-center gap-2 hover:text-emerald-700 transition-all"
          >
            <Upload className="h-4 w-4 text-emerald-600" />
            <span>Import CSV</span>
          </button>

          <button
            onClick={handleExportCsv}
            disabled={isExporting}
            className="neu-button px-4 py-2 rounded-full text-xs font-semibold text-[#0F172A] flex items-center gap-2 hover:text-emerald-700 transition-all disabled:opacity-60"
          >
            <Download className={`h-4 w-4 ${isExporting ? 'animate-bounce' : ''}`} />
            <span>{isExporting ? 'Exporting...' : 'Export CSV'}</span>
          </button>

          <button
            onClick={handleExportPdf}
            disabled={isExportingPdf}
            className="neu-button-emerald px-5 py-2 rounded-full text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-60"
          >
            <FileText className={`h-4 w-4 ${isExportingPdf ? 'animate-bounce' : ''}`} />
            <span>{isExportingPdf ? 'Generating PDF...' : 'Export Inventory PDF'}</span>
          </button>
        </div>
      </div>

      {/* Filter Glass Pill Bar */}
      <div className="glass-panel p-4 flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5 text-emerald-900 font-bold pl-1">
          <Filter className="h-4 w-4 text-emerald-600" />
          <span>Filters:</span>
        </div>

        {/* Facility Filter */}
        <select
          value={selectedFacility}
          onChange={(e) => setSelectedFacility(e.target.value)}
          className="bg-white/80 border border-emerald-100 rounded-full px-3.5 py-1.5 text-xs text-[#0F172A] font-medium shadow-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        >
          {facilities.map((f) => (
            <option key={f} value={f}>
              🏥 Facility: {f}
            </option>
          ))}
        </select>

        {/* Category Filter */}
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="bg-white/80 border border-emerald-100 rounded-full px-3.5 py-1.5 text-xs text-[#0F172A] font-medium shadow-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              💊 Category: {c}
            </option>
          ))}
        </select>

        {/* Risk Filter */}
        <select
          value={selectedRisk}
          onChange={(e) => setSelectedRisk(e.target.value)}
          className="bg-white/80 border border-emerald-100 rounded-full px-3.5 py-1.5 text-xs text-[#0F172A] font-medium shadow-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        >
          <option value="All">All Health Statuses</option>
          <option value="Critical">⚠️ Critical Shortage</option>
          <option value="High">📉 Low Stock</option>
          <option value="Moderate">👀 Monitor</option>
          <option value="Low">✅ Healthy</option>
        </select>

        <span className="text-[#64748B] ml-auto text-xs font-semibold pr-2">
          Showing <span className="text-emerald-700 font-bold">{filteredItems.length}</span> of {inventory.length} medicines
        </span>
      </div>

      {/* Main Glass Table */}
      <div className="glass-panel overflow-hidden shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-emerald-50/60 text-[#0F172A] font-heading font-bold border-b border-emerald-100">
              <tr>
                <th className="py-4 px-5">Medicine Item</th>
                <th className="py-4 px-5">Facility</th>
                <th className="py-4 px-5">Stock Level & Buffer</th>
                <th className="py-4 px-5">Safety Target</th>
                <th className="py-4 px-5">Lead Time</th>
                <th className="py-4 px-5">Daily Burn Rate</th>
                <th className="py-4 px-5">Days of Supply</th>
                <th className="py-4 px-5">Stock Status</th>
                <th className="py-4 px-5">Expiry Threat</th>
                <th className="py-4 px-5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-900/5 text-[#0F172A]">
              {filteredItems.length > 0 ? (
                filteredItems.map((item) => {
                  // Calculate glass progress bar percentage
                  const targetDouble = item.safety_stock * 2 || 1;
                  const stockPercent = Math.min(Math.round((item.current_stock / targetDouble) * 100), 100);
                  const isCrit = item.days_of_supply <= item.supplier_lead_time_days;
                  const isLow = !isCrit && item.days_of_supply <= item.supplier_lead_time_days * 1.5;

                  const barColor = isCrit
                    ? 'bg-rose-500'
                    : isLow
                    ? 'bg-amber-500'
                    : 'bg-emerald-500';

                  return (
                    <tr
                      key={item.id}
                      onClick={() => onSelectItem(item)}
                      className="hover:bg-white/80 cursor-pointer transition-colors group"
                    >
                      <td className="py-3.5 px-5">
                        <div className="font-bold text-[#0F172A] group-hover:text-emerald-700 transition-colors">
                          {item.medicine_name}
                        </div>
                        <span className="text-[11px] text-[#64748B] font-medium flex items-center gap-1 mt-0.5">
                          <span>💊</span> {item.category}
                        </span>
                      </td>

                      <td className="py-3.5 px-5">
                        <div className="font-semibold text-[#0F172A]">{item.facility_name}</div>
                        <span className="text-[10px] text-emerald-800/80 font-medium">{item.facility_type}</span>
                      </td>

                      {/* Stock Level with Glass Progress Bar */}
                      <td className="py-3.5 px-5 min-w-[150px]">
                        <div className="flex items-center justify-between font-mono font-bold text-xs mb-1">
                          <span>{item.current_stock.toLocaleString()}</span>
                          <span className="text-[10px] text-[#64748B] font-sans font-normal">{item.unit}</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-200/70 overflow-hidden p-[1px] border border-white">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                            style={{ width: `${Math.max(stockPercent, 6)}%` }}
                          />
                        </div>
                      </td>

                      <td className="py-3.5 px-5 font-mono text-[#64748B]">
                        {item.safety_stock.toLocaleString()}
                      </td>

                      <td className="py-3.5 px-5 font-medium text-[#64748B]">
                        {item.supplier_lead_time_days} days
                      </td>

                      <td className="py-3.5 px-5 font-mono font-semibold text-emerald-800">
                        {item.avg_daily_demand.toFixed(1)} /day
                      </td>

                      <td className="py-3.5 px-5 font-mono font-extrabold">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs ${
                            isCrit
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : isLow
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {item.days_of_supply.toFixed(1)} d
                        </span>
                      </td>

                      <td className="py-3.5 px-5">
                        <RiskBadge level={item.stockout_risk_level} />
                      </td>

                      <td className="py-3.5 px-5">
                        <RiskBadge level={item.expiry_risk_level} />
                      </td>

                      <td className="py-3.5 px-5 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectItem(item);
                          }}
                          className="neu-button px-3 py-1.5 rounded-full text-[11px] font-bold text-emerald-800 hover:text-emerald-950 inline-flex items-center gap-1.5 transition-all"
                        >
                          <Edit2 className="h-3 w-3 text-emerald-600" />
                          <span>Inspect</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-[#64748B] text-xs">
                    No medicine inventory records matched your selected criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
