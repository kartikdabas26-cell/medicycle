import React, { useState } from 'react';
import {
  RefreshCw,
  Activity,
  Bell,
  Search,
  LogOut,
} from 'lucide-react';

interface HeaderProps {
  title: string;
  subtitle: string;
  surgePct: number;
  onSurgeChange: (surge: number) => void;
  onRefresh: () => void;
  isLoading: boolean;
  onSearch?: (query: string) => void;
  networkRole?: string;
  onNetworkRoleChange?: (role: string) => void;
  onOpenNotifications?: () => void;
  notificationCount?: number;
  searchValue?: string;
  facilityName?: string | null;
  onSwitchPortal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  surgePct,
  onSurgeChange,
  onRefresh,
  isLoading,
  onSearch,
  networkRole,
  onNetworkRoleChange,
  onOpenNotifications,
  notificationCount = 0,
  searchValue,
  facilityName,
  onSwitchPortal,
}) => {
  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <div className="sticky top-0 z-30 px-6 py-3.5 backdrop-blur-md">
      {/* Floating Glass Pill Navbar */}
      <nav className="glass-pill px-6 py-2.5 flex items-center justify-between gap-4 transition-all">
        {/* Left: Pill Brand + Page Title */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5 pl-1">
            <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-[#0F2043] to-[#0EA5E9] flex items-center justify-center text-white shadow-md shadow-sky-500/25">
              <span className="text-lg">💊</span>
            </div>
            <div className="hidden sm:block">
              <div className="text-xs font-bold text-[#0F172A] flex items-center gap-1 font-heading tracking-tight">
                <span>MEDI</span>
                <span className="text-sky-600 font-extrabold">CYCLE</span>
              </div>
              <p className="text-[10px] text-sky-700/80 font-medium">Unified Medicine Network</p>
            </div>
          </div>

          <div className="h-5 w-[1px] bg-slate-200 hidden md:block" />

          {/* Current Page Context */}
          <div className="hidden md:block">
            <h1 className="text-sm font-bold text-[#0F172A] font-heading tracking-tight">
              {title}
            </h1>
            <p className="text-[11px] text-[#64748B] line-clamp-1">{subtitle}</p>
          </div>
        </div>

        {/* Center: Rounded Neumorphic Search Bar */}
        <div className="relative flex-1 max-w-xs hidden lg:block">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
          <input
            type="text"
            placeholder="Search medicines, facilities..."
            value={searchValue}
            onChange={(event) => onSearch?.(event.target.value)}
            className="w-full bg-[#F8FAF9]/80 border border-white/90 rounded-full pl-9 pr-4 py-1.5 text-xs text-[#0F172A] placeholder-[#94A3B8] shadow-inner focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:bg-white transition-all"
          />
        </div>

        {/* Right Controls: Neumorphic Surge Controls, Refresh, Bell, Avatar */}
        <div className="flex items-center gap-2.5">
          {/* Neumorphic Demand Surge Toggle */}
          {!networkRole && <div className="flex items-center gap-1 bg-[#F1F5F3] p-1 rounded-full border border-white/80 shadow-inner">
            <span className="text-[11px] font-semibold text-[#64748B] px-2 flex items-center gap-1">
              <Activity className="h-3 w-3 text-emerald-600" />
              <span className="hidden xl:inline">Demand Surge:</span>
            </span>

            {[
              { label: 'Normal', value: 0 },
              { label: '+20%', value: 20 },
              { label: '+30%', value: 30 },
            ].map(({ label, value }) => {
              const active = surgePct === value;
              return (
                <button
                  key={value}
                  onClick={() => onSurgeChange(value)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                    active
                      ? value === 0
                        ? 'neu-button-emerald text-white'
                        : value === 20
                        ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30'
                        : 'bg-rose-500 text-white shadow-md shadow-rose-500/30'
                      : 'text-[#64748B] hover:text-[#0F172A]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>}

          {/* Neumorphic Refresh Button */}
          <button
            onClick={onRefresh}
            disabled={isLoading}
            title="Recalculate & Sync"
            className="neu-button p-2 rounded-full text-[#64748B] hover:text-emerald-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>

          {/* Neumorphic Notification Bell */}
          <div className="relative">
            <button
              onClick={() => onOpenNotifications ? onOpenNotifications() : setShowNotifications(!showNotifications)}
              className="neu-button p-2 rounded-full text-[#64748B] hover:text-emerald-700 relative"
              aria-label="Open notifications"
            >
              <Bell className="h-3.5 w-3.5" />
              {(networkRole ? notificationCount > 0 : true) && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500 border border-white animate-pulse" />}
            </button>

            {/* Notification Dropdown */}
            {showNotifications && !onOpenNotifications && (
              <div className="absolute right-0 mt-3 w-72 glass-panel p-4 shadow-xl z-50 text-xs animate-fade-in-up">
                <div className="flex items-center justify-between pb-2 border-b border-emerald-900/5 mb-2 font-bold text-[#0F172A]">
                  <span>System Alerts</span>
                  <span className="text-[10px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-semibold">4 Actionable</span>
                </div>
                <div className="space-y-2">
                  <div className="p-2 rounded-xl bg-rose-50/70 border border-rose-100 flex items-start gap-2">
                    <span className="text-xs">⚠️</span>
                    <div>
                      <p className="font-semibold text-rose-900">Ceftriaxone Shortage</p>
                      <p className="text-[10px] text-rose-700">Metro General stock &lt; 7 days lead time</p>
                    </div>
                  </div>
                  <div className="p-2 rounded-xl bg-amber-50/70 border border-amber-100 flex items-start gap-2">
                    <span className="text-xs">⏳</span>
                    <div>
                      <p className="font-semibold text-amber-900">BAT-003 Expiry in 31d</p>
                      <p className="text-[10px] text-amber-700">St. Jude Regional has 245 surplus units</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* User Profile Avatar with Online Pill */}
          {networkRole && onNetworkRoleChange ? (
            <label className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 p-[2px] shadow-sm">
                <div className="h-full w-full rounded-full bg-white flex items-center justify-center font-bold text-emerald-800 text-xs">
                  {networkRole === 'Network Admin' ? 'NA' : networkRole.slice(0, 1)}
                </div>
              </div>
              <select
                aria-label="Switch demo role"
                value={networkRole}
                onChange={(event) => onNetworkRoleChange(event.target.value)}
                className="max-w-[115px] bg-transparent border-0 outline-none text-[11px] font-semibold text-[#334155]"
              >
                {['Hospital', 'Chemist', 'Supplier', 'Network Admin'].map((role) => <option key={role}>{role}</option>)}
              </select>
            </label>
          ) : <div className="flex items-center gap-2 pl-1 border-l border-slate-200">
            <div className="relative">
              <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 p-[2px] shadow-sm">
                <div className="h-full w-full rounded-full bg-white flex items-center justify-center font-bold text-emerald-800 text-xs">
                  {networkRole === 'Network Admin' ? 'NA' : networkRole?.slice(0, 1) || 'M'}
                </div>
              </div>
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
            </div>
            <div className="hidden xl:block text-left">
              <div className="text-xs font-bold text-[#0F172A] font-heading leading-tight">{facilityName || 'Network Authority'}</div>
              <div className="text-[10px] text-emerald-700/80 font-medium leading-tight">{networkRole || 'MediCycle member'}</div>
            </div>
          </div>}
          {onSwitchPortal && (
            <button onClick={onSwitchPortal} className="portal-switch-button" title="Clear session and return to Intent Gateway">
              <LogOut className="h-3.5 w-3.5" />
              <span>Log Out / Switch Portal</span>
            </button>
          )}
        </div>
      </nav>
    </div>
  );
};
