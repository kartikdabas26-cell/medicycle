import React, { useState } from 'react';
import {
  Calculator,
  ChevronRight,
  Info,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Activity,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import type { ForecastItem, InventoryItem } from '../types';

interface ForecastPageProps {
  forecasts: ForecastItem[];
  inventory?: InventoryItem[];
  surgePct: number;
  onSurgeChange: (val: number) => void;
}

export const ForecastPage: React.FC<ForecastPageProps> = ({
  forecasts,
  inventory = [],
  surgePct,
  onSurgeChange,
}) => {
  const [selectedForecast, setSelectedForecast] = useState<ForecastItem | null>(
    forecasts.length > 0 ? forecasts[0] : null
  );
  const [showFormula, setShowFormula] = useState<boolean>(false);

  // Cross-reference matched inventory item to compare stock vs forecast
  const matchedInventory = selectedForecast
    ? inventory.find((i) => i.id === selectedForecast.inventory_id)
    : null;

  const currentStock = matchedInventory?.current_stock ?? 0;
  const leadTimeDays = matchedInventory?.supplier_lead_time_days ?? 7;
  const safetyStock = matchedInventory?.safety_stock ?? 0;
  const daysOfSupply = matchedInventory?.days_of_supply ?? (
    selectedForecast && selectedForecast.avg_daily_demand > 0
      ? currentStock / selectedForecast.avg_daily_demand
      : 0
  );

  // Chart data: 8 historical weeks + Projected 7-day and 30-day milestones
  const chartData = selectedForecast
    ? [
        ...(selectedForecast.history_weeks || []).map((qty: number, idx: number) => ({
          name: `Wk ${idx + 1}`,
          actual: qty,
          projected: null as number | null,
        })),
        {
          name: 'Next 7d',
          actual: null as number | null,
          projected: Math.round(selectedForecast.projected_7d_demand),
        },
        {
          name: 'Next 30d',
          actual: null as number | null,
          projected: Math.round(selectedForecast.projected_30d_demand / 4.2), // weekly normalized
        },
      ]
    : [];

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto animate-fade-in-up">
      {/* Top Glass Banner */}
      <div className="glass-panel p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">📈</span>
            <h2 className="text-base font-bold text-[#0F172A] font-heading">
              Medicine Demand Projections & Consumption Analytics
            </h2>
          </div>
          <p className="text-xs text-[#64748B] max-w-2xl leading-relaxed">
            Blends Single Exponential Smoothing ($\alpha = 0.35$) with a 4-week Weighted Moving Average over 8-week dispensary logs to forecast short-term 7-day and 30-day replenishment thresholds.
          </p>
        </div>

        {/* Formula Accordion Toggle */}
        <button
          onClick={() => setShowFormula(!showFormula)}
          className="neu-button px-4 py-2 rounded-full text-xs font-semibold text-emerald-800 hover:text-emerald-950 flex items-center gap-2 transition-all self-start md:self-auto"
        >
          <Calculator className="h-4 w-4 text-emerald-600" />
          <span>{showFormula ? 'Hide Formula Details' : 'View Formula Logic'}</span>
          {showFormula ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Expandable Mathematical Model Accordion */}
      {showFormula && (
        <div className="glass-panel p-5 text-xs text-[#64748B] space-y-3 animate-fade-in-up border border-emerald-200">
          <h4 className="font-bold text-[#0F172A] font-heading flex items-center gap-2">
            <Info className="h-4 w-4 text-emerald-600" />
            Mathematical Smoothing Formulation
          </h4>
          <p className="text-[11px] leading-relaxed">
            The predicted daily demand is computed using an adaptive blend:
          </p>
          <div className="p-3 bg-white/80 rounded-2xl border border-emerald-100 font-mono text-[11px] text-emerald-950 space-y-1">
            <div>Predicted Demand = 0.65 × SES(t) + 0.35 × WMA(4-week)</div>
            <div>Where SES(t) = 0.35 × Y(t) + 0.65 × SES(t-1)</div>
          </div>
          <p className="text-[11px] text-[#64748B]">
            This ensures rapid reaction to unexpected localized consumption jumps while dampening one-off dispensing noise.
          </p>
        </div>
      )}

      {/* Main Grid: Forecast Selection List + Detailed Forecast Chart & Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Forecast Items List (1 col) */}
        <div className="glass-panel p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-emerald-900/5 pb-2.5">
            <span className="text-xs font-bold text-[#0F172A] font-heading">
              Select Medicine ({forecasts.length})
            </span>
            <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              Active Run-Rates
            </span>
          </div>

          <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
            {forecasts.map((f) => {
              const isSelected = selectedForecast?.inventory_id === f.inventory_id;
              return (
                <div
                  key={f.inventory_id}
                  onClick={() => setSelectedForecast(f)}
                  className={`p-3.5 rounded-2xl cursor-pointer transition-all border ${
                    isSelected
                      ? 'bg-gradient-to-r from-emerald-50 to-white border-emerald-300 shadow-sm scale-[1.01]'
                      : 'bg-white/60 border-transparent hover:bg-white hover:border-emerald-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-xs text-[#0F172A] flex items-center gap-1.5">
                      <span>💊</span>
                      <span>{f.medicine_name}</span>
                    </div>
                    <ChevronRight className={`h-3.5 w-3.5 text-emerald-600 transition-transform ${isSelected ? 'translate-x-1' : ''}`} />
                  </div>

                  <div className="text-[11px] text-[#64748B] mt-1 flex items-center justify-between">
                    <span>{f.facility_name}</span>
                    <span className="font-mono font-bold text-emerald-800">
                      {f.avg_daily_demand.toFixed(1)}/day
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Detailed Forecast Chart & Position Comparison (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {selectedForecast ? (
            <div className="glass-panel p-6 space-y-5">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-900/5 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      🏥 {selectedForecast.facility_name}
                    </span>
                    <span className="text-xs text-[#64748B]">({matchedInventory?.facility_type || 'Regional Center'})</span>
                  </div>
                  <h3 className="text-lg font-bold text-[#0F172A] font-heading mt-1">
                    {selectedForecast.medicine_name}
                  </h3>
                </div>

                <div className="text-right">
                  <span className="text-xs text-[#64748B] font-medium">Daily Burn Velocity</span>
                  <div className="kpi-number text-2xl text-emerald-800">
                    {selectedForecast.avg_daily_demand.toFixed(1)}{' '}
                    <span className="text-xs font-normal text-[#64748B]">{selectedForecast.unit}/day</span>
                  </div>
                </div>
              </div>

              {/* 3 Horizon Projection Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-2xl bg-white/70 border border-emerald-100 space-y-1">
                  <div className="text-[11px] text-[#64748B] font-semibold uppercase tracking-wider">
                    7-Day Demand
                  </div>
                  <div className="text-xl font-extrabold text-[#0F172A] font-heading">
                    {Math.round(selectedForecast.projected_7d_demand).toLocaleString()}{' '}
                    <span className="text-xs font-normal text-[#64748B]">{selectedForecast.unit}</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/70 border border-emerald-100 space-y-1">
                  <div className="text-[11px] text-[#64748B] font-semibold uppercase tracking-wider">
                    30-Day Demand
                  </div>
                  <div className="text-xl font-extrabold text-[#0F172A] font-heading">
                    {Math.round(selectedForecast.projected_30d_demand).toLocaleString()}{' '}
                    <span className="text-xs font-normal text-[#64748B]">{selectedForecast.unit}</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-1">
                  <div className="text-[11px] text-emerald-800 font-semibold uppercase tracking-wider">
                    Current Coverage
                  </div>
                  <div className="text-xl font-extrabold text-emerald-900 font-heading">
                    {daysOfSupply.toFixed(1)} <span className="text-xs font-normal text-emerald-700">days</span>
                  </div>
                </div>
              </div>

              {/* Area Chart: History vs Future Projection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-[#0F172A]">
                  <span>8-Week Dispensary Logs vs Short-Term Projections</span>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="flex items-center gap-1 text-emerald-700">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Past Actual
                    </span>
                    <span className="flex items-center gap-1 text-teal-700">
                      <span className="w-2.5 h-2.5 rounded-full bg-teal-400" /> Projected
                    </span>
                  </div>
                </div>

                <div className="h-64 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="foreFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(16, 185, 129, 0.12)" vertical={false} />
                      <XAxis dataKey="name" stroke="#94A3B8" tick={{ fontSize: 11, fill: '#64748B' }} />
                      <YAxis stroke="#94A3B8" tick={{ fontSize: 11, fill: '#64748B' }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgba(255, 255, 255, 0.94)',
                          backdropFilter: 'blur(12px)',
                          borderColor: 'rgba(16, 185, 129, 0.3)',
                          borderRadius: '16px',
                          fontSize: '12px',
                          color: '#0F172A',
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="actual"
                        name="Historical Consumption"
                        stroke="#10B981"
                        strokeWidth={2.5}
                        fill="url(#foreFill)"
                      />
                      <Area
                        type="monotone"
                        dataKey="projected"
                        name="Projected Forecast"
                        stroke="#0D9488"
                        strokeWidth={2.5}
                        strokeDasharray="4 4"
                        fill="rgba(13, 148, 136, 0.15)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Stock Comparison Callout */}
              <div className="p-4 rounded-2xl bg-white/80 border border-emerald-100 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-[#0F172A]">Stock Buffer Status: </span>
                  <span className="text-[#64748B]">
                    Current stock ({currentStock.toLocaleString()} units) vs 7-day demand ({Math.round(selectedForecast.projected_7d_demand)} units).
                  </span>
                </div>
                <span
                  className={`px-3 py-1 rounded-full font-bold ${
                    currentStock >= selectedForecast.projected_7d_demand
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {currentStock >= selectedForecast.projected_7d_demand ? '✅ Adequate Buffer' : '⚠️ Immediate Deficit'}
                </span>
              </div>
            </div>
          ) : (
            <div className="glass-panel p-12 text-center text-xs text-[#64748B]">
              Select a medicine item to inspect demand forecasts.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
