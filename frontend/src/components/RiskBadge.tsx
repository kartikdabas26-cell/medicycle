import React from 'react';

interface RiskBadgeProps {
  level: string;
  className?: string;
  showEmoji?: boolean;
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({ level, className = '', showEmoji = true }) => {
  const norm = level.toLowerCase();

  // Transfer covered or resolved
  if (norm.includes('transfer') || norm.includes('resolved') || norm.includes('covered')) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wide transition-all ${className}`}
        style={{
          background: 'rgba(209, 250, 229, 0.75)',
          color: '#065F46',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          boxShadow: '0 2px 6px rgba(16, 185, 129, 0.1)',
        }}
      >
        {showEmoji && <span className="text-[11px]">✅</span>}
        <span>Transfer Covered</span>
      </span>
    );
  }

  // Critical stockout risk
  if (norm.includes('crit')) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wide transition-all ${className}`}
        style={{
          background: 'rgba(254, 226, 226, 0.85)',
          color: '#991B1B',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          boxShadow: '0 2px 8px rgba(239, 68, 68, 0.15)',
        }}
      >
        {showEmoji && <span className="text-[11px] animate-pulse">⚠️</span>}
        <span>CRITICAL</span>
      </span>
    );
  }

  // Expiry or near expiry
  if (norm.includes('near') || norm.includes('exp') || norm.includes('warn')) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wide transition-all ${className}`}
        style={{
          background: 'rgba(254, 243, 199, 0.85)',
          color: '#92400E',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          boxShadow: '0 2px 8px rgba(245, 158, 11, 0.12)',
        }}
      >
        {showEmoji && <span className="text-[11px]">⏳</span>}
        <span>{norm.includes('near') ? 'NEAR EXPIRY' : 'EXPIRING SOON'}</span>
      </span>
    );
  }

  // Low stock / High risk
  if (norm.includes('high') || norm.includes('low stock')) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wide transition-all ${className}`}
        style={{
          background: 'rgba(254, 243, 199, 0.85)',
          color: '#B45309',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          boxShadow: '0 2px 6px rgba(245, 158, 11, 0.1)',
        }}
      >
        {showEmoji && <span className="text-[11px]">📉</span>}
        <span>LOW STOCK</span>
      </span>
    );
  }

  // Moderate or Monitor
  if (norm.includes('mod') || norm.includes('monitor')) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wide transition-all ${className}`}
        style={{
          background: 'rgba(241, 245, 249, 0.85)',
          color: '#475569',
          border: '1px solid rgba(148, 163, 184, 0.3)',
          boxShadow: '0 2px 6px rgba(100, 116, 139, 0.08)',
        }}
      >
        {showEmoji && <span className="text-[11px]">👀</span>}
        <span>MONITOR</span>
      </span>
    );
  }

  // Healthy default
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wide transition-all ${className}`}
      style={{
        background: 'rgba(209, 250, 229, 0.8)',
        color: '#065F46',
        border: '1px solid rgba(16, 185, 129, 0.3)',
        boxShadow: '0 2px 6px rgba(16, 185, 129, 0.1)',
      }}
    >
      {showEmoji && <span className="text-[11px]">✅</span>}
      <span>HEALTHY</span>
    </span>
  );
};
