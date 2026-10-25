import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { CountUp } from './CountUp';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  emoji?: string;
  variant?: 'default' | 'danger' | 'warning' | 'teal' | 'success';
  trend?: string;
  trendDirection?: 'up' | 'down' | 'neutral';
  sparkline?: number[];
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  emoji,
  variant = 'default',
  trend,
  trendDirection = 'up',
  sparkline,
}) => {
  // Theme variants
  const variantConfig = {
    default: {
      accent: '#10B981',
      bgGlow: 'rgba(16, 185, 129, 0.08)',
      iconBg: 'bg-emerald-50 text-emerald-600 border-emerald-200/60',
      sparklineColor: '#10B981',
      trendBadge: 'bg-emerald-100/70 text-emerald-800 border-emerald-200',
    },
    danger: {
      accent: '#EF4444',
      bgGlow: 'rgba(239, 68, 68, 0.08)',
      iconBg: 'bg-rose-50 text-rose-600 border-rose-200/60',
      sparklineColor: '#EF4444',
      trendBadge: 'bg-rose-100/70 text-rose-800 border-rose-200',
    },
    warning: {
      accent: '#F59E0B',
      bgGlow: 'rgba(245, 158, 11, 0.08)',
      iconBg: 'bg-amber-50 text-amber-600 border-amber-200/60',
      sparklineColor: '#F59E0B',
      trendBadge: 'bg-amber-100/70 text-amber-800 border-amber-200',
    },
    teal: {
      accent: '#059669',
      bgGlow: 'rgba(5, 150, 105, 0.08)',
      iconBg: 'bg-teal-50 text-teal-600 border-teal-200/60',
      sparklineColor: '#059669',
      trendBadge: 'bg-teal-100/70 text-teal-800 border-teal-200',
    },
    success: {
      accent: '#10B981',
      bgGlow: 'rgba(16, 185, 129, 0.08)',
      iconBg: 'bg-emerald-50 text-emerald-600 border-emerald-200/60',
      sparklineColor: '#10B981',
      trendBadge: 'bg-emerald-100/70 text-emerald-800 border-emerald-200',
    },
  };

  const theme = variantConfig[variant];

  // Default sparklines if none provided
  const sparkData = sparkline || (
    variant === 'danger'
      ? [15, 20, 28, 22, 35, 45, 40]
      : variant === 'warning'
      ? [10, 12, 18, 15, 22, 19, 25]
      : [30, 42, 38, 55, 48, 60, 68]
  );

  // SVG path calculation for mini sparkline
  const minVal = Math.min(...sparkData);
  const maxVal = Math.max(...sparkData);
  const range = maxVal - minVal || 1;
  const width = 110;
  const height = 32;

  const points = sparkData.map((val, idx) => {
    const x = (idx / (sparkData.length - 1)) * width;
    const y = height - ((val - minVal) / range) * (height - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const pathD = `M ${points.join(' L ')}`;
  const areaD = `${pathD} L ${width},${height} L 0,${height} Z`;

  // Parse numeric value for CountUp if possible
  const numValue = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]+/g, ''));
  const isNumeric = !isNaN(numValue) && typeof numValue === 'number';

  return (
    <div
      className="glass-panel glass-card-hover p-6 relative overflow-hidden flex flex-col justify-between"
      style={{
        boxShadow: `0 10px 30px -5px ${theme.bgGlow}, 0 2px 8px rgba(15, 23, 42, 0.04)`,
      }}
    >
      {/* Decorative top accent glow */}
      <div
        className="absolute top-0 left-6 right-6 h-[2px] rounded-full opacity-70"
        style={{
          background: `linear-gradient(90deg, transparent, ${theme.accent}, transparent)`,
        }}
      />

      {/* Top Header Row */}
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {emoji && (
              <span className="p-1.5 rounded-xl bg-white/80 border border-white shadow-xs text-base">
                {emoji}
              </span>
            )}
            <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
              {title}
            </span>
          </div>

          {Icon && (
            <div className={`p-2 rounded-xl border ${theme.iconBg} shadow-xs`}>
              <Icon className="h-4 w-4" />
            </div>
          )}
        </div>

        {/* Big Tabular Number (48px) */}
        <div className="mt-4 flex items-baseline gap-2">
          <div className="kpi-number text-4xl sm:text-5xl text-[#0F172A] leading-none">
            {isNumeric ? <CountUp value={numValue} /> : value}
          </div>
        </div>

        {subtitle && (
          <p className="mt-2 text-xs text-[#64748B] font-medium leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>

      {/* Bottom Sparkline and Trend Indicator */}
      <div className="mt-5 pt-3 border-t border-emerald-900/5 flex items-center justify-between gap-3">
        {/* Trend Pill */}
        {trend ? (
          <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${theme.trendBadge} shadow-2xs`}>
            {trendDirection === 'up' ? (
              <TrendingUp className="h-3 w-3" />
            ) : trendDirection === 'down' ? (
              <TrendingDown className="h-3 w-3" />
            ) : (
              <Minus className="h-3 w-3" />
            )}
            <span>{trend}</span>
          </div>
        ) : (
          <span className="text-[11px] text-emerald-700/80 font-medium">Real-time sync</span>
        )}

        {/* Mini Sparkline Chart */}
        <div className="w-[110px] h-[32px] overflow-visible">
          <svg width={width} height={height} className="overflow-visible">
            <defs>
              <linearGradient id={`grad-${variant}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={theme.sparklineColor} stopOpacity={0.25} />
                <stop offset="100%" stopColor={theme.sparklineColor} stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <path d={areaD} fill={`url(#grad-${variant})`} />
            <path
              d={pathD}
              fill="none"
              stroke={theme.sparklineColor}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Pulsing endpoint dot */}
            <circle
              cx={points[points.length - 1].split(',')[0]}
              cy={points[points.length - 1].split(',')[1]}
              r={3}
              fill={theme.sparklineColor}
              className="animate-pulse"
            />
          </svg>
        </div>
      </div>
    </div>
  );
};
