import React from 'react';
import {
  LayoutDashboard,
  Package,
  TrendingUp,
  AlertTriangle,
  ArrowLeftRight,
  ClipboardList,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  ShoppingCart,
  Truck,
  BarChart3,
  Bell,
  HeartPulse,
} from 'lucide-react';

export type NavigationTab =
  | 'overview'
  | 'patient'
  | 'inventory'
  | 'forecast'
  | 'risks'
  | 'transfers'
  | 'reorder'
  | 'marketplace'
  | 'orders'
  | 'analytics'
  | 'alerts';

interface SidebarProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  onResetDemo: () => void;
  onOpenAI: () => void;
  isResetting: boolean;
  criticalCount?: number;
  transferCount?: number;
  visibleTabs?: NavigationTab[];
  showAdminTools?: boolean;
}

interface NavItem {
  id: NavigationTab;
  label: string;
  icon: any;
  emoji: string;
  badge?: string | number;
  badgeColor?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  onResetDemo,
  onOpenAI,
  isResetting,
  criticalCount = 0,
  transferCount = 0,
  visibleTabs,
  showAdminTools = true,
}) => {
  const navItems: NavItem[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard, emoji: '🏥' },
    { id: 'patient', label: 'Patient Direct', icon: HeartPulse, emoji: '💙' },
    { id: 'inventory', label: 'Inventory', icon: Package, emoji: '📦' },
    { id: 'forecast', label: 'Forecasts', icon: TrendingUp, emoji: '📈' },
    {
      id: 'risks',
      label: 'Risk Alerts',
      icon: AlertTriangle,
      emoji: '⚠️',
      badge: criticalCount > 0 ? criticalCount : undefined,
      badgeColor: 'bg-rose-100 text-rose-700 border-rose-200',
    },
    {
      id: 'transfers',
      label: 'Redistribution',
      icon: ArrowLeftRight,
      emoji: '🔄',
      badge: transferCount > 0 ? `${transferCount} ready` : undefined,
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    },
    { id: 'reorder', label: 'Reorder Plan', icon: ClipboardList, emoji: '📋' },
    { id: 'marketplace', label: 'Supplier Marketplace', icon: ShoppingCart, emoji: '🛒' },
    { id: 'orders', label: 'Order Pipeline', icon: Truck, emoji: '🚚' },
    { id: 'analytics', label: 'Waste & Savings', icon: BarChart3, emoji: '📊' },
    {
      id: 'alerts',
      label: 'Network Alerts',
      icon: Bell,
      emoji: '🔔',
      badge: criticalCount > 0 ? criticalCount : undefined,
      badgeColor: 'bg-rose-100 text-rose-700 border-rose-200',
    },
  ];
  const visibleNavItems = visibleTabs ? navItems.filter((item) => visibleTabs.includes(item.id)) : navItems;

  return (
    <>
      {/* Desktop Floating Glass Sidebar */}
      <aside className="hidden md:flex w-64 flex-col justify-between p-4 flex-shrink-0 z-20 select-none">
        <div className="glass-panel p-4 space-y-4">
          {/* Logo & Clinical Brand */}
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-[#0F2043] to-[#0EA5E9] flex items-center justify-center text-white shadow-lg shadow-sky-600/20">
              <span className="text-xl">💊</span>
            </div>
            <div>
              <div className="font-extrabold text-base tracking-tight text-[#0F172A] font-heading flex items-center gap-1">
                <span>MEDI</span>
                <span className="text-sky-600">CYCLE</span>
              </div>
              <p className="text-[11px] font-medium text-sky-800/70">
                Unified Healthcare OS
              </p>
            </div>
          </div>

          <div className="h-[1px] bg-gradient-to-r from-transparent via-emerald-200 to-transparent" />

          {/* Nav Items */}
          <nav className="space-y-1.5">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-all group ${
                    isActive
                      ? 'bg-[#0F2043] text-white shadow-lg shadow-sky-900/20 scale-[1.02]'
                      : 'text-[#64748B] hover:text-[#0F172A] hover:bg-white/80'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm">{item.emoji}</span>
                    <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-[#64748B] group-hover:text-emerald-600 transition-colors'}`} />
                    <span>{item.label}</span>
                  </div>

                  {item.badge && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                        isActive ? 'bg-white/20 text-white border-white/30' : item.badgeColor
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer Card */}
        {showAdminTools && <div className="glass-panel p-4 space-y-2.5 mt-3">
          {/* Neumorphic Clinical Assistant Button */}
          <button
            onClick={onOpenAI}
            className="w-full neu-button flex items-center justify-center gap-2 px-3 py-2.5 rounded-2xl text-xs font-bold text-emerald-800 hover:text-emerald-950 transition-all"
          >
            <Sparkles className="h-4 w-4 text-emerald-600" />
            <span>AI Supply Copilot</span>
          </button>

          {/* Neumorphic Reset Demo Button */}
          <button
            onClick={onResetDemo}
            disabled={isResetting}
            className="w-full neu-button flex items-center justify-center gap-2 px-3 py-2 rounded-2xl text-[11px] font-semibold text-[#64748B] hover:text-[#0F172A] transition-all disabled:opacity-50"
          >
            <RotateCcw className={`h-3.5 w-3.5 text-emerald-600 ${isResetting ? 'animate-spin' : ''}`} />
            <span>{isResetting ? 'Resetting Data...' : 'Reset Demo State'}</span>
          </button>

          {/* Engine Status Pill */}
          <div className="p-2 rounded-xl bg-emerald-50/70 border border-emerald-100 flex items-center gap-2 text-[10px] text-emerald-800">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
            <div className="leading-tight">
              <span className="font-bold">Offline Deterministic</span>
              <span className="text-emerald-600 block">Verified WHO clinical logic</span>
            </div>
          </div>
        </div>}
      </aside>

      {/* Mobile Bottom Glass Navigation Bar */}
      <div className="md:hidden fixed bottom-3 left-3 right-3 z-40 glass-pill px-3 py-2 flex items-center justify-around shadow-2xl mc-mobile-navigation">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`flex flex-col items-center justify-center p-1.5 rounded-xl transition-all relative ${
                isActive ? 'text-emerald-600 scale-110' : 'text-[#64748B]'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[9px] font-semibold mt-0.5">{item.label.split(' ')[0]}</span>
              {item.badge && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500 border border-white" />
              )}
            </button>
          );
        })}
      </div>
    </>
  );
};
