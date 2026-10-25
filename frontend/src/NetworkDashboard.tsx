import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight, ArrowLeftRight, ArrowRight, Bell, Building2, Check,
  CheckCircle2, ChevronDown, CircleAlert, Clock3, FileDown, FileText, Filter, Hospital,
  Pill, Search, ShieldCheck, ShoppingCart, Truck,
  Wallet, X, type LucideIcon,
} from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { RiskMatrix } from './components/redistribution/RiskMatrix';
import { ManifestGenerator, TransferOptimizer } from './components/redistribution/TransferOptimizer';
import { RoleDashboard } from './components/network/RoleDashboard';
import { TransferHandshakePanel } from './components/network/TransferHandshakePanel';
import { WasteAnalyticsDashboard } from './components/network/WasteAnalyticsDashboard';
import { useAppContext } from './context/AppContext';
import { useAuth } from './context/AuthContext';
import { downloadCsv } from './utils/csv';
import { downloadPdfFile } from './utils/pdf';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';

type Role = 'Hospital' | 'Chemist' | 'Supplier' | 'Network Admin';
type Page = 'overview' | 'inventory' | 'transfers' | 'marketplace' | 'orders' | 'analytics' | 'alerts';
type InventoryRow = {
  inventory_id: string; facility_id: string; facility_name: string; facility_type: string;
  medicine_id: string; drug_name: string; generic_name: string; category: string;
  batch_id: string; batch_number: string; quantity: number; current_quantity: number; unit: string;
  unit_cost: number; expiry_date: string; days_to_expiry: number; expiry_band: string;
  risk_status: string; daily_consumption: number; safety_stock: number;
};
type Suggestion = {
  id: string; medicine_id: string; medicine_name: string; category: string; unit: string;
  batch_id: string; batch_number: string; source_inventory_id: string; destination_inventory_id: string;
  source_facility_name: string; destination_facility_name: string; quantity: number;
  expiry_date: string; days_to_expiry: number; estimated_savings_usd: number;
  priority_score: number; eta_hours: number; route: string[]; reason: string;
};
type Facility = { id: string; name: string; type: string; location: string };
type Medicine = { id: string; name: string; category: string; unit: string; unit_cost: number };
type Order = {
  id: string; facility_name: string; supplier_name: string; medicine_id: string;
  medicine_name: string;   quantity: number; unit_price: number; status: string; created_at: string; approved?: boolean;
};
type AuditEvent = { id: number; actor_role: string; action: string; entity_id: string; details: Record<string, unknown>; created_at: string };
type Transfer = {
  id: string; manifest_id: string; medicine_name: string; source: string; destination: string;
  quantity: number; savings_usd: number; status: string; route: string[]; created_at: string;
};
type CatalogOffer = {
  medicine_id: string; medicine_name: string; category: string; supplier_name: string;
  unit_price: number; moq: number; reliability: number; lead_time_hours: number;
};
type Notice = { id: string; kind: string; title: string; description: string; time: string };
type Analytics = {
  waste_averted_usd: number; stockouts_prevented: number; redistribution_units: number;
  average_transit_hours: number; category_volume: { category: string; units: number }[];
  monthly_savings: { month: string; savings: number; potential_loss: number }[];
  leaderboard: { facility: string; saved_usd: number }[];
};
type Bootstrap = {
  facilities: Facility[]; medicines: Medicine[]; inventory: InventoryRow[];
  suggestions: Suggestion[]; transfers: Transfer[]; orders: Order[];
};
type Voucher = { manifest: string; medicine: string; quantity: number; unit: string; source: string; destination: string; route: string[]; dispatchedAt: string };

const API = '/api/network';
const ROLE_COPY: Record<Role, { heading: string; text: string }> = {
  Hospital: { heading: 'Hospital supply command', text: 'Coordinate ward-level stock, urgent requisitions and bulk transfers across the care network.' },
  Chemist: { heading: 'Community pharmacy operations', text: 'Salvage short-dated retail stock, serve local demand and compare distributor offers.' },
  Supplier: { heading: 'Supplier fulfillment desk', text: 'Track network purchase orders, dispatch commitments and delivery reconciliation.' },
  'Network Admin': { heading: 'Network oversight', text: 'Monitor network-wide availability, waste prevention, redistribution compliance and audit activity.' },
};
const ROLE_HOME: Record<Role, string> = {
  Hospital: '/hospital', Chemist: '/chemist', Supplier: '/supplier', 'Network Admin': '/admin',
};
const ROLE_TABS: Record<Role, Page[]> = {
  Hospital: ['overview', 'inventory', 'transfers', 'marketplace', 'orders'],
  Chemist: ['overview', 'inventory', 'transfers', 'marketplace', 'orders'],
  Supplier: ['overview', 'marketplace', 'orders'],
  'Network Admin': ['overview', 'inventory', 'transfers', 'marketplace', 'orders', 'analytics', 'alerts'],
};
const PAGE_PATH: Partial<Record<Page, string>> = {
  inventory: '/inventory',
  transfers: '/redistribution',
  marketplace: '/marketplace',
  orders: '/orders',
  analytics: '/analytics',
  alerts: '/alerts',
};
const pageFromPath = (path: string): Page =>
  path === '/network' || Object.values(ROLE_HOME).includes(path)
    ? 'overview'
    : (Object.entries(PAGE_PATH).find(([, route]) => route === path)?.[0] as Page | undefined) ?? 'overview';
const money = (value: number) => `$${value.toLocaleString('en-US', {
  minimumFractionDigits: value > 0 && value < 100 ? 2 : 0,
  maximumFractionDigits: 2,
})}`;

export function NetworkDashboard() {
  const { resetDemoState, subscriptions } = useAppContext();
  const { currentRole, facilityId, facilityName, token, logout } = useAuth();
  const role: Role = currentRole === 'hospital' ? 'Hospital'
    : currentRole === 'chemist' ? 'Chemist'
      : currentRole === 'supplier' ? 'Supplier' : 'Network Admin';
  const [page, setPageState] = useState<Page>(() => {
    const requestedPage = pageFromPath(window.location.pathname);
    return ROLE_TABS[role].includes(requestedPage) ? requestedPage : 'overview';
  });
  const [data, setData] = useState<Bootstrap | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [catalog, setCatalog] = useState<CatalogOffer[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [facilityFilter, setFacilityFilter] = useState('All facility types');
  const [riskFilter, setRiskFilter] = useState('All risks');
  const [selectedMedicine, setSelectedMedicine] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState('Apex Pharma Logistics');
  const [orderQuantity, setOrderQuantity] = useState(100);
  const [pendingPo, setPendingPo] = useState<{ medicine_id: string; facility_id: string; supplier_name: string; quantity: number } | null>(null);
  const [pendingDraftId, setPendingDraftId] = useState<string | null>(null);
  const [poWarnings, setPoWarnings] = useState<{ facility_name: string; quantity: number; unit: string; days_to_expiry: number; message: string }[]>([]);
  const [pendingTransfer, setPendingTransfer] = useState<Suggestion | null>(null);
  const [clinicalConfirmed, setClinicalConfirmed] = useState(false);
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const navigateToPage = useCallback((nextPage: Page) => {
    if (!ROLE_TABS[role].includes(nextPage)) return;
    setPageState(nextPage);
    const path = nextPage === 'overview' ? ROLE_HOME[role] : PAGE_PATH[nextPage];
    if (!path) return;
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
  }, [role]);

  useEffect(() => {
    const handleNavigation = () => {
      const requestedPage = pageFromPath(window.location.pathname);
      if (ROLE_TABS[role].includes(requestedPage)) {
        setPageState(requestedPage);
      } else {
        setPageState('overview');
        window.history.replaceState({}, '', ROLE_HOME[role]);
      }
    };
    window.addEventListener('popstate', handleNavigation);
    return () => window.removeEventListener('popstate', handleNavigation);
  }, [role]);

  const apiFetch = useCallback(async (path: string, options: RequestInit = {}) => {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}`, ...options.headers },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.detail || `Request failed (${response.status})`);
    }
    return response.json();
  }, [token]);

  const reload = useCallback(async () => {
    if (!token) return;
    try {
      const [bootstrap, metrics, offers, alerts, audit] = await Promise.all([
        apiFetch('/bootstrap'), apiFetch('/analytics'), apiFetch('/catalog'), apiFetch('/notifications'),
        role === 'Network Admin' ? apiFetch('/audit') : Promise.resolve([]),
      ]) as [Bootstrap, Analytics, CatalogOffer[], Notice[], AuditEvent[]];
      setError('');
      setData(bootstrap);
      setAnalytics(metrics);
      setCatalog(offers);
      setNotices(alerts);
      setAuditLogs(audit);
      setSelectedMedicine((previous) => previous || bootstrap.medicines[0]?.id || '');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load network data';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, role, token]);

  useEffect(() => { void reload(); }, [reload]);

  const facilityTypes = useMemo(() => [...new Set((data?.facilities || []).map((facility) => facility.type))], [data]);
  const visibleInventory = useMemo(() => (data?.inventory || []).filter((item) => {
    const query = search.trim().toLowerCase();
    return (!query || `${item.drug_name} ${item.generic_name} ${item.batch_number} ${item.facility_name}`.toLowerCase().includes(query))
      && (role === 'Network Admin' || item.facility_id === facilityId)
      && (facilityFilter === 'All facility types' || item.facility_type === facilityFilter)
      && (riskFilter === 'All risks' || item.risk_status === riskFilter);
  }), [data, facilityFilter, facilityId, riskFilter, role, search]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 4500);
  };

  const approveTransfer = (recommendation: Suggestion) => {
    setPendingTransfer(recommendation);
    setClinicalConfirmed(false);
  };

  const dispatchTransfer = async (recommendation: Suggestion) => {
    setPendingTransfer(null);
    try {
      const result = await apiFetch('/transfers/approve', {
        method: 'POST', body: JSON.stringify({ recommendation_id: recommendation.id }),
      }) as { manifest_id: string; route: string[]; quantity: number };
      setVoucher({
        manifest: result.manifest_id, medicine: recommendation.medicine_name,
        quantity: result.quantity, unit: recommendation.unit, source: recommendation.source_facility_name,
        destination: recommendation.destination_facility_name, route: result.route, dispatchedAt: new Date().toLocaleString(),
      });
      showToast(`Transfer dispatched · ${result.manifest_id}`);
      await reload();
      window.setTimeout(() => window.print(), 300);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Transfer dispatch failed');
    }
  };

  const submitPurchaseOrder = async (forceConfirm = false, saveAsDraft = false) => {
    if (!data || !selectedMedicine) return;
    const orderFacilityId = role === 'Network Admin' ? data.facilities.find((facility) => facility.type !== 'Supplier')?.id : facilityId;
    if (!orderFacilityId) return;
    const payload = {
      facility_id: orderFacilityId, medicine_id: selectedMedicine, supplier_name: selectedSupplier,
      quantity: orderQuantity, force_confirm: forceConfirm, save_as_draft: saveAsDraft,
    };
    try {
      const result = await apiFetch('/purchase-orders', { method: 'POST', body: JSON.stringify(payload) }) as {
        requires_confirmation: boolean; warnings?: typeof poWarnings; order_id?: string;
      };
      if (result.requires_confirmation) {
        setPendingPo(payload);
        setPoWarnings(result.warnings || []);
        return;
      }
      setPendingPo(null);
      setPoWarnings([]);
      showToast(saveAsDraft ? `Purchase order ${result.order_id} saved as a draft` : `Purchase order ${result.order_id} submitted for approval`);
      navigateToPage('orders');
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Purchase order could not be submitted');
    }
  };

  const submitDraft = async (order: Order, forceConfirm = false) => {
    try {
      const result = await apiFetch(`/purchase-orders/${order.id}/submit`, {
        method: 'POST', body: JSON.stringify({ force_confirm: forceConfirm }),
      }) as { requires_confirmation: boolean; warnings?: typeof poWarnings; order_id?: string };
      if (result.requires_confirmation) {
        setPendingDraftId(order.id);
        setPoWarnings(result.warnings || []);
        return;
      }
      setPendingDraftId(null);
      setPoWarnings([]);
      showToast(`Purchase order ${order.id} submitted for approval`);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Draft submission failed');
    }
  };

  const moveOrder = async (order: Order) => {
    const status = order.status === 'Pending Approval' ? 'Dispatched'
      : order.status === 'Dispatched' ? 'In-Transit' : 'Delivered & Reconciled';
    try {
      await apiFetch(`/purchase-orders/${order.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      showToast(`${order.id} moved to ${status}`);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Order update failed');
    }
  };

  const receiveTransfer = async (transfer: Transfer) => {
    try {
      await apiFetch(`/transfers/${transfer.id}/status`, { method: 'PATCH' });
      showToast(`${transfer.manifest_id} received and reconciled`);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Transfer receipt failed');
    }
  };

  const approvePurchaseOrder = async (order: Order) => {
    try {
      await apiFetch(`/purchase-orders/${order.id}/approve`, { method: 'POST' });
      showToast(`${order.id} approved for supplier dispatch`);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Purchase order approval failed');
    }
  };

  const currentFacility = data?.facilities.find((facility) => facility.id === facilityId);
  const pageTitle: Record<Page, string> = {
    overview: 'Network overview', inventory: 'Live network inventory',
    transfers: 'Redistribution engine', marketplace: 'Supplier marketplace', orders: 'Purchase order pipeline',
    analytics: 'Waste & savings analytics', alerts: 'Network alerts',
  };
  const suggestions = data?.suggestions || [];
  const currentFacilityName = currentFacility?.name || facilityName;
  const scopedData: Bootstrap | null = data ? {
    ...data,
    facilities: role === 'Network Admin' ? data.facilities : data.facilities.filter((item) => item.id === facilityId),
    inventory: role === 'Network Admin' ? data.inventory : data.inventory.filter((item) => item.facility_id === facilityId),
    suggestions: role === 'Network Admin' ? suggestions : suggestions.filter((item) =>
      item.source_inventory_id.startsWith(`NETINV-${facilityId}-`)
      || item.destination_inventory_id.startsWith(`NETINV-${facilityId}-`)),
    transfers: role === 'Network Admin' ? data.transfers : data.transfers.filter((item) =>
      item.source === currentFacilityName || item.destination === currentFacilityName),
    orders: role === 'Network Admin' ? data.orders : data.orders.filter((item) =>
      role === 'Supplier' ? item.supplier_name === currentFacilityName : item.facility_name === currentFacilityName),
  } : null;
  const roleTitle = page === 'overview' ? ROLE_COPY[role].heading : pageTitle[page];
  const roleSubtitle = page === 'overview' ? ROLE_COPY[role].text
    : 'Live network inventory, approvals and supply chain coordination.';

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-gradient-to-br from-[#F8FAF9] via-[#F0FDF4] to-[#ECFDF5] font-sans text-[#64748B]">
      <div className="fixed -top-24 -left-24 w-96 h-96 bg-emerald-300/30 rounded-full blur-3xl pointer-events-none blob-1 z-0" />
      <div className="fixed top-1/3 -right-32 w-[480px] h-[480px] bg-teal-200/35 rounded-full blur-3xl pointer-events-none blob-2 z-0" />
      <div className="fixed -bottom-24 left-1/3 w-[520px] h-[520px] bg-emerald-200/30 rounded-full blur-3xl pointer-events-none blob-3 z-0" />

      <Sidebar
        currentTab={page}
        onSelectTab={(tab) => { if (ROLE_TABS[role].includes(tab as Page)) navigateToPage(tab as Page); }}
        visibleTabs={ROLE_TABS[role]}
        onResetDemo={async () => {
          setLoading(true);
          try {
            const response = await fetch('/api/demo/reset', { method: 'POST' });
            if (!response.ok) throw new Error(`Demo reset failed (${response.status})`);
            resetDemoState();
            showToast('Healthcare network demo data restored');
            await reload();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not reset demo data');
            setLoading(false);
          }
        }}
        onOpenAI={() => navigateToPage(role === 'Network Admin' ? 'alerts' : 'overview')}
        showAdminTools={role === 'Network Admin'}
        isResetting={loading}
        criticalCount={data?.inventory.filter((item) => item.risk_status === 'CRITICAL_SHORTAGE').length || 0}
        transferCount={suggestions.length}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
        <Header
          title={roleTitle}
          subtitle={roleSubtitle}
          surgePct={0}
          onSurgeChange={() => {}}
          onRefresh={() => void reload()}
          isLoading={loading}
          networkRole={role}
          facilityName={currentFacilityName}
          onSwitchPortal={logout}
          onOpenNotifications={() => setDrawerOpen(true)}
          notificationCount={notices.length}
          searchValue={search}
          onSearch={(value) => setSearch(value)}
        />
        <main className="flex-1 overflow-y-auto pb-24 md:pb-8">
          <section className="mc-content">
          <div className="mc-network-context">
            <span className="mc-role-context">{role === 'Network Admin' ? 'NETWORK ADMIN' : `${role.toUpperCase()} VIEW`}{currentFacility ? ` · ${currentFacility.name.toUpperCase()}` : ''}</span>
            <span className="mc-network-live"><i /> LIVE NETWORK</span>
          </div>
          {error && <div className="mc-error"><CircleAlert size={17} /><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={15} /></button></div>}
          {loading && !data ? <div className="mc-loading"><span className="mc-spinner" /> Connecting to the supply network…</div> : scopedData && (
            <>
              {page === 'overview' && analytics && (
                <Overview role={role} data={scopedData} analytics={analytics} notices={notices} onNavigate={navigateToPage} facilityId={facilityId} token={token} />
              )}
              {page === 'inventory' && (
                <InventoryPage rows={visibleInventory} search={search} onSearch={setSearch}
                  facilityFilter={facilityFilter} onFacilityFilter={setFacilityFilter}
                  riskFilter={riskFilter} onRiskFilter={setRiskFilter} facilityTypes={facilityTypes}
                  onExport={() => {
                    if (!visibleInventory.length) {
                      setError('There are no inventory rows matching the current filters to export.');
                      return;
                    }
                    const csvHeaders = [
                      'Facility', 'Facility ID', 'Facility Type', 'Medicine', 'Generic Name', 'Category',
                      'Batch Number', 'Current Quantity', 'Unit', 'Unit Cost', 'Expiry Date',
                      'Days to Expiry', 'Expiry Band', 'Risk Status', 'Daily Consumption', 'Safety Stock',
                    ];
                    const csvRows = visibleInventory.map((row) => [
                      row.facility_name, row.facility_id, row.facility_type, row.drug_name, row.generic_name,
                      row.category, row.batch_number, row.current_quantity, row.unit, row.unit_cost,
                      row.expiry_date, row.days_to_expiry, row.expiry_band, row.risk_status,
                      row.daily_consumption, row.safety_stock,
                    ]);
                    const suffix = facilityId || 'network';
                    downloadCsv(`medicycle-inventory-${suffix}-${new Date().toISOString().slice(0, 10)}.csv`, csvHeaders, csvRows);
                    showToast(`Exported ${csvRows.length} visible inventory rows`);
                  }}
                  onExportPdf={async () => {
                    if (!visibleInventory.length) {
                      setError('There are no inventory rows matching the current filters to export.');
                      return;
                    }
                    try {
                      const suffix = facilityId || 'network';
                      const params = new URLSearchParams();
                      if (facilityId) params.set('facility_id', facilityId);
                      if (riskFilter !== 'All risks') params.set('risk_level', riskFilter);
                      const url = `/api/inventory/export/pdf${params.toString() ? `?${params.toString()}` : ''}`;
                      await downloadPdfFile(url, `medicycle-inventory-${suffix}-${new Date().toISOString().slice(0, 10)}.pdf`, token);
                      showToast(`Exported ${visibleInventory.length} inventory items as official PDF`);
                    } catch (err: any) {
                      setError(err.message || 'Failed to export inventory PDF');
                    }
                  }}
                />
              )}
              {page === 'transfers' && (
                <TransfersPage suggestions={scopedData.suggestions} transfers={scopedData.transfers} role={role}
                  onApprove={approveTransfer} onReceive={receiveTransfer} token={token} facilityId={facilityId} />
              )}
              {page === 'marketplace' && (
                <MarketplacePage catalog={catalog} medicines={scopedData.medicines} offers={catalog}
                  selectedMedicine={selectedMedicine} onMedicineChange={setSelectedMedicine}
                  selectedSupplier={selectedSupplier} onSupplierChange={setSelectedSupplier}
                  quantity={orderQuantity} onQuantityChange={setOrderQuantity}
                  canOrder={role !== 'Supplier'} onSubmit={() => void submitPurchaseOrder()}
                  onSaveDraft={() => void submitPurchaseOrder(false, true)} />
              )}
              {page === 'orders' && (
                <OrdersPage orders={scopedData.orders} role={role} onAdvance={moveOrder} onApprove={approvePurchaseOrder}
                  onSubmitDraft={(order) => void submitDraft(order)} />
              )}
              {page === 'analytics' && analytics && <WasteAnalyticsDashboard analytics={analytics} auditLogs={auditLogs} showAudit={role === 'Network Admin'} activeSubscriptions={subscriptions.filter((item) => item.active).length} />}
              {page === 'alerts' && <AlertsPage notices={notices} />}
            </>
          )}
          </section>
        </main>
      </div>

      {drawerOpen && <div className="mc-drawer-backdrop" onClick={() => setDrawerOpen(false)}>
        <aside className="mc-drawer" onClick={(event) => event.stopPropagation()}>
          <div className="mc-drawer-heading"><div><span className="mc-eyebrow">ACTION CENTER</span><h2>Notifications <span>{notices.length}</span></h2></div><button className="mc-icon-button" onClick={() => setDrawerOpen(false)} aria-label="Close notifications"><X size={18} /></button></div>
          <AlertsPage notices={notices} compact />
        </aside>
      </div>}

      {pendingTransfer && <div className="mc-modal-backdrop">
        <section className="mc-modal" role="dialog" aria-modal="true" aria-labelledby="transfer-confirm-title">
          <div className="mc-modal-icon"><ShieldCheck size={22} /></div>
          <span className="mc-eyebrow">CLINICAL & LOGISTICS REVIEW</span>
          <h2 id="transfer-confirm-title">Confirm inter-facility transfer</h2>
          <p>Verify medicine identity, batch expiry, recipient demand and transport plan before dispatch.</p>
          <div className="mc-warning-list">
            <div><span><strong>{pendingTransfer.medicine_name} · Batch {pendingTransfer.batch_number}</strong><small>Expiry in {pendingTransfer.days_to_expiry} days · Priority {pendingTransfer.priority_score}</small></span><b>{pendingTransfer.quantity.toLocaleString()} {pendingTransfer.unit}</b></div>
            <div><span><strong>{pendingTransfer.source_facility_name} → {pendingTransfer.destination_facility_name}</strong><small>Route: {pendingTransfer.route.join(' → ')}</small></span><b>{pendingTransfer.eta_hours}h ETA</b></div>
            <div><span><strong>Calculation & clinical fit</strong><small>{pendingTransfer.reason}</small></span><b>{money(pendingTransfer.estimated_savings_usd)} saved</b></div>
          </div>
          <label className="mc-clinical-confirm"><input type="checkbox" checked={clinicalConfirmed} onChange={(event) => setClinicalConfirmed(event.target.checked)} />
            I confirm the proposed batch, quantity, destination, shelf life and handling plan are appropriate.
          </label>
          <div className="mc-modal-actions">
            <button className="mc-btn-secondary" onClick={() => setPendingTransfer(null)}>Cancel</button>
            <button className="mc-btn-dark" disabled={!clinicalConfirmed} onClick={() => void dispatchTransfer(pendingTransfer)}>
              <Truck size={15} /> Confirm & dispatch
            </button>
          </div>
        </section>
      </div>}

      {poWarnings.length > 0 && (pendingPo || pendingDraftId) && <div className="mc-modal-backdrop">
        <section className="mc-modal" role="dialog" aria-modal="true" aria-labelledby="po-warning-title">
          <div className="mc-modal-icon amber"><CircleAlert size={22} /></div>
          <button className="mc-modal-close" onClick={() => { setPoWarnings([]); setPendingPo(null); }} aria-label="Close"><X size={18} /></button>
          <span className="mc-eyebrow">ANTI-DOUBLE BUYING CHECK</span>
          <h2 id="po-warning-title">Network stock can cover this need</h2>
          <p>Before placing an external order, these facilities have available surplus stock for a free or discounted transfer:</p>
          <div className="mc-warning-list">{poWarnings.map((warning) => <div key={warning.facility_name}>
            <span><strong>{warning.facility_name}</strong><small>{warning.days_to_expiry} days to expiry · transfer eligible</small></span>
            <b>{warning.quantity.toLocaleString()} {warning.unit}</b>
          </div>)}</div>
          <div className="mc-modal-actions"><button className="mc-btn-secondary" onClick={() => { setPoWarnings([]); setPendingPo(null); setPendingDraftId(null); }}>Review network stock</button><button className="mc-btn-dark" onClick={() => {
            if (pendingDraftId) {
              const draft = data?.orders.find((order) => order.id === pendingDraftId);
              if (draft) void submitDraft(draft, true);
            } else {
              void submitPurchaseOrder(true);
            }
          }}>Continue with supplier PO</button></div>
        </section>
      </div>}

      {toast && <div role="status" className="mc-toast"><CheckCircle2 size={17} />{toast}<button onClick={() => setToast('')} aria-label="Dismiss"><X size={14} /></button></div>}
      <div className="mc-print-area">
        {voucher && <ManifestGenerator
          manifest={voucher.manifest}
          medicine={voucher.medicine}
          quantity={voucher.quantity}
          unit={voucher.unit}
          source={voucher.source}
          destination={voucher.destination}
          route={voucher.route}
          dispatchedAt={voucher.dispatchedAt}
        />}
      </div>
    </div>
  );
}

function Overview({ role, data, analytics, notices, onNavigate, facilityId, token }: {
  role: Role; data: Bootstrap; analytics: Analytics; notices: Notice[]; onNavigate: (page: Page) => void; facilityId: string | null; token: string | null;
}) {
  const hospitalCount = data.facilities.filter((facility) => facility.type !== 'Supplier').length;
  const critical = data.inventory.filter((item) => item.risk_status === 'CRITICAL_SHORTAGE').length;
  const expiring = data.inventory.filter((item) => item.days_to_expiry > 0 && item.days_to_expiry <= 45).length;
  const cards = [
    { label: 'WASTE AVERTED', value: money(analytics.waste_averted_usd), note: 'network savings ledger', icon: Wallet, change: '+12.8%' },
    { label: 'STOCKOUTS PREVENTED', value: analytics.stockouts_prevented.toLocaleString(), note: 'clinical needs covered', icon: ShieldCheck, change: 'This quarter' },
    { label: 'REDISTRIBUTION VOLUME', value: `${analytics.redistribution_units.toLocaleString()}`, note: 'units moved through network', icon: ArrowLeftRight, change: '+8.4%' },
    { label: 'FACILITIES CONNECTED', value: String(hospitalCount), note: 'care sites + 2 distributors', icon: Building2, change: `${data.medicines.length} medicines` },
  ];
  const roleSummary: Record<Role, string> = {
    Hospital: 'Critical-care stock outlook · requisitions · ward replenishment',
    Chemist: 'Retail stock balance · short-dated salvage · peer transfers',
    Supplier: 'Open purchase orders · committed ETAs · dispatch manifests',
    'Network Admin': 'Network-wide inventory · savings ledger · compliance audit',
  };
  if (role !== 'Network Admin') {
    const localCritical = data.inventory.filter((item) => item.risk_status === 'CRITICAL_SHORTAGE').length;
    const localExpiring = data.inventory.filter((item) => item.days_to_expiry > 0 && item.days_to_expiry <= 45).length;
    return <>
      <div className="mc-role-banner"><div className="mc-role-banner-icon"><Hospital size={20} /></div><div><strong>{role} operations snapshot</strong><span>{roleSummary[role]}</span></div><span className="mc-role-banner-live"><i /> FACILITY</span></div>
      <RoleDashboard role={role} data={data} onNavigate={onNavigate} facilityId={facilityId} />
      <div className="mc-kpi-grid">
        <LocalMetric label="FACILITY STOCK LINES" value={data.inventory.length} note="Only your facility" icon={Building2} />
        <LocalMetric label="CRITICAL SHORTAGES" value={localCritical} note="Review replenishment buffer" icon={CircleAlert} />
        <LocalMetric label="NEAR-EXPIRY BATCHES" value={localExpiring} note="Expiring within 45 days" icon={Clock3} />
        <LocalMetric label={role === 'Supplier' ? 'ORDERS TO FULFILL' : 'FACILITY ORDERS'} value={data.orders.length} note="Your assigned order flow" icon={Truck} />
      </div>
      <section className="mc-panel mc-shortcuts"><div className="mc-panel-heading"><div><span className="mc-eyebrow">YOUR WORKSPACE</span><h2>Role-specific actions</h2></div></div><div className="mc-shortcut-grid">
        {role !== 'Supplier' && <button onClick={() => onNavigate('inventory')}><span className="shortcut-icon green"><Hospital size={18} /></span><span><b>Review facility inventory</b><small>{data.inventory.length} stock lines · {localCritical} critical</small></span><ArrowRight size={16} /></button>}
        {role !== 'Supplier' && <button onClick={() => onNavigate('transfers')}><span className="shortcut-icon blue"><ArrowLeftRight size={18} /></span><span><b>Review transfer requests</b><small>{data.suggestions.length} matched opportunities</small></span><ArrowRight size={16} /></button>}
        <button onClick={() => onNavigate('marketplace')}><span className="shortcut-icon amber"><ShoppingCart size={18} /></span><span><b>{role === 'Supplier' ? 'Manage wholesale catalog' : 'Check supply before buying'}</b><small>Network stock check on every requisition</small></span><ArrowRight size={16} /></button>
        <button onClick={() => onNavigate('orders')}><span className="shortcut-icon blue"><Truck size={18} /></span><span><b>{role === 'Supplier' ? 'Dispatch & track orders' : 'Manage requisitions'}</b><small>{data.orders.length} open order records</small></span><ArrowRight size={16} /></button>
      </div></section>
    </>;
  }
  return <>
    <div className="mc-role-banner"><div className="mc-role-banner-icon"><Hospital size={20} /></div><div><strong>{role} operations snapshot</strong><span>{roleSummary[role]}</span></div><span className="mc-role-banner-live"><i /> LIVE</span></div>
    <RoleDashboard role={role} data={data} onNavigate={onNavigate} />
    <TransferHandshakePanel role={role} facilityId={facilityId} token={token} />
    <div className="mc-kpi-grid">{cards.map(({ label, value, note, icon: Icon, change }) => <article key={label} className="mc-kpi-card">
      <div className="mc-kpi-top"><span>{label}</span><span className="mc-kpi-icon"><Icon size={17} /></span></div>
      <strong className="mc-kpi-value">{value}</strong><div className="mc-kpi-foot"><span>{note}</span><b>{change}</b></div>
    </article>)}</div>
    <div className="mc-chart-grid">
      <section className="mc-panel mc-chart-panel"><div className="mc-panel-heading"><div><span className="mc-eyebrow">NETWORK PERFORMANCE</span><h2>Savings vs. potential expiry loss</h2></div><span className="mc-chart-legend"><i className="legend-savings" /> Savings <i className="legend-loss" /> Avoided waste</span></div>
        <div className="mc-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={analytics.monthly_savings} margin={{ top: 10, right: 5, left: -18, bottom: 0 }}>
          <defs><linearGradient id="savingsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#377866" stopOpacity={0.22} /><stop offset="100%" stopColor="#377866" stopOpacity={0.01} /></linearGradient></defs>
          <CartesianGrid stroke="#edf0eb" vertical={false} /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#87918b', fontSize: 11 }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#87918b', fontSize: 10 }} tickFormatter={(value: number) => `$${value / 1000}k`} />
          <Tooltip formatter={(value) => money(Number(value))} contentStyle={{ borderRadius: 12, border: '1px solid #e8ebe5', fontSize: 12 }} />
          <Area type="monotone" dataKey="potential_loss" name="Expiry loss prevented" stroke="#b7905f" strokeWidth={2} fill="transparent" strokeDasharray="4 4" />
          <Area type="monotone" dataKey="savings" name="Realized savings" stroke="#377866" strokeWidth={2.5} fill="url(#savingsFill)" />
        </AreaChart></ResponsiveContainer></div>
      </section>
      <section className="mc-panel mc-snapshot-panel"><div className="mc-panel-heading"><div><span className="mc-eyebrow">INVENTORY HEALTH</span><h2>Network stock status</h2></div><button className="mc-text-button" onClick={() => onNavigate('inventory')}>View inventory <ArrowRight size={14} /></button></div>
        <div className="mc-stock-summary">{[
          { label: 'Optimal stock', value: data.inventory.filter((item) => item.risk_status === 'OPTIMAL').length, color: '#347b69' },
          { label: 'Surplus available', value: data.inventory.filter((item) => item.risk_status === 'SURPLUS').length, color: '#86a994' },
          { label: 'Critical shortage', value: critical, color: '#c36557' },
          { label: 'Near expiry salvage', value: data.inventory.filter((item) => item.risk_status === 'NEAR_EXPIRY_SALVAGE').length, color: '#c3914c' },
        ].map((item) => <div key={item.label}><i style={{ background: item.color }} /><span>{item.label}</span><strong>{item.value}</strong></div>)}</div>
        <div className="mc-snapshot-foot"><span><Clock3 size={14} /> Avg transfer turnaround</span><strong>{analytics.average_transit_hours} hrs</strong></div>
      </section>
    </div>
    <div className="mc-bottom-grid">
      <section className="mc-panel mc-shortcuts"><div className="mc-panel-heading"><div><span className="mc-eyebrow">QUICK ACTIONS</span><h2>Supply chain workspace</h2></div></div><div className="mc-shortcut-grid">
        <button onClick={() => onNavigate('transfers')}><span className="shortcut-icon green"><ArrowLeftRight size={18} /></span><span><b>Review transfer matches</b><small>{data.suggestions.length} optimized routes ready</small></span><ArrowRight size={16} /></button>
        <button onClick={() => onNavigate('marketplace')}><span className="shortcut-icon blue"><ShoppingCart size={18} /></span><span><b>Compare supplier pricing</b><small>{data.medicines.length} catalog items · 2 distributors</small></span><ArrowRight size={16} /></button>
        <button onClick={() => onNavigate('alerts')}><span className="shortcut-icon amber"><Bell size={18} /></span><span><b>Resolve network alerts</b><small>{critical} critical · {expiring} expiring soon</small></span><ArrowRight size={16} /></button>
      </div></section>
      <section className="mc-panel mc-alert-panel"><div className="mc-panel-heading"><div><span className="mc-eyebrow">ATTENTION REQUIRED</span><h2>Latest network alerts</h2></div><button className="mc-text-button" onClick={() => onNavigate('alerts')}>All alerts <ArrowRight size={14} /></button></div>
        <div className="mc-alert-list">{notices.slice(0, 3).map((notice) => <div key={notice.id} className="mc-alert-row"><span className={`mc-alert-type ${notice.kind}`}><CircleAlert size={15} /></span><span><b>{notice.title}</b><small>{notice.description}</small></span><small>{notice.time}</small></div>)}
          {notices.length === 0 && <div className="mc-empty-inline"><CheckCircle2 size={17} /> No actionable alerts</div>}</div>
      </section>
    </div>
  </>;
}

function LocalMetric({ label, value, note, icon: Icon }: {
  label: string; value: number; note: string; icon: LucideIcon;
}) {
  return <article className="mc-kpi-card"><div className="mc-kpi-top"><span>{label}</span><span className="mc-kpi-icon"><Icon size={17} /></span></div>
    <strong className="mc-kpi-value">{value.toLocaleString()}</strong><div className="mc-kpi-foot"><span>{note}</span></div></article>;
}

function InventoryPage({ rows, search, onSearch, facilityFilter, onFacilityFilter, riskFilter, onRiskFilter, facilityTypes, onExport, onExportPdf }: {
  rows: InventoryRow[]; search: string; onSearch: (value: string) => void; facilityFilter: string; onFacilityFilter: (value: string) => void;
  riskFilter: string; onRiskFilter: (value: string) => void; facilityTypes: string[]; onExport: () => void; onExportPdf?: () => void;
}) {
  const [exportingPdf, setExportingPdf] = useState(false);
  const handlePdfClick = async () => {
    if (!onExportPdf || exportingPdf) return;
    setExportingPdf(true);
    try {
      await onExportPdf();
    } finally {
      setExportingPdf(false);
    }
  };

  return <section className="mc-panel mc-table-panel">
    <div className="mc-table-heading">
      <div><span className="mc-eyebrow">EXPIRY & AVAILABILITY MATRIX</span><h2>Facility stock by batch</h2><p>Batch-level visibility with weighted consumption and expiry risk.</p></div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button type="button" className="mc-btn-secondary" onClick={onExport} disabled={!rows.length} aria-label={`Export ${rows.length} visible inventory rows as CSV`}><FileDown size={15} /> Export CSV</button>
        {onExportPdf && (
          <button type="button" className="mc-btn-dark" onClick={handlePdfClick} disabled={!rows.length || exportingPdf} aria-label={`Export ${rows.length} visible inventory rows as official PDF`}>
            <FileText size={15} /> {exportingPdf ? 'Exporting PDF…' : 'Export PDF'}
          </button>
        )}
      </div>
    </div>
    <div className="mc-filter-row"><label className="mc-search"><Search size={16} /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search medicine, molecule, batch…" /></label>
      <label className="mc-select-filter"><Filter size={14} /><select value={facilityFilter} onChange={(event) => onFacilityFilter(event.target.value)}><option>All facility types</option>{facilityTypes.map((type) => <option key={type}>{type}</option>)}</select><ChevronDown size={13} /></label>
      <label className="mc-select-filter"><select value={riskFilter} onChange={(event) => onRiskFilter(event.target.value)}><option value="All risks">All risk statuses</option><option value="SURPLUS">Surplus</option><option value="OPTIMAL">Optimal</option><option value="CRITICAL_SHORTAGE">Critical shortage</option><option value="NEAR_EXPIRY_SALVAGE">Near expiry salvage</option><option value="EXPIRED_QUARANTINE">Expired · quarantine</option></select><ChevronDown size={13} /></label>
      <span className="mc-results-count">{rows.length} batches</span>
    </div>
    <RiskMatrix rows={rows} />
  </section>;
}

function TransfersPage({ suggestions, transfers, role, onApprove, onReceive, token, facilityId }: {
  suggestions: Suggestion[]; transfers: Transfer[]; role: Role;
  onApprove: (suggestion: Suggestion) => void; onReceive: (transfer: Transfer) => void;
  token: string | null; facilityId: string | null;
}) {
  return <>
    <TransferHandshakePanel role={role} facilityId={facilityId} token={token} />
    {transfers.length > 0 && <section className="mc-panel mc-manifest-panel"><div className="mc-panel-heading"><div><span className="mc-eyebrow">MANIFEST TRACKING</span><h2>Recent inter-facility transfers</h2></div><span className="mc-live-status"><i /> LIVE</span></div>
      <div className="mc-manifest-list">{transfers.slice(0, 8).map((transfer) => <div className="mc-manifest-row" key={transfer.id}>
        <span className={`mc-manifest-icon ${transfer.status === 'In-Transit' ? 'in-transit' : ''}`}><Truck size={16} /></span>
        <span className="mc-manifest-details"><b>{transfer.medicine_name} · {transfer.quantity} units</b><small>{transfer.source} <ArrowRight size={11} /> {transfer.destination}</small></span>
        <span className="mc-manifest-number">{transfer.manifest_id}</span>
        <span className={`mc-manifest-status ${transfer.status === 'In-Transit' ? 'moving' : ''}`}>{transfer.status}</span>
        {transfer.status === 'In-Transit' && role !== 'Supplier' && <button className="mc-receive-btn" onClick={() => onReceive(transfer)}>Receive & reconcile <Check size={12} /></button>}
      </div>)}</div>
    </section>}
    <TransferOptimizer
      suggestions={suggestions}
      canApprove={false}
      onApprove={onApprove}
    />
  </>;
}

function MarketplacePage({ catalog, medicines, offers, selectedMedicine, onMedicineChange, selectedSupplier, onSupplierChange, quantity, onQuantityChange, canOrder, onSubmit, onSaveDraft }: {
  catalog: CatalogOffer[]; medicines: Medicine[]; offers: CatalogOffer[]; selectedMedicine: string; onMedicineChange: (value: string) => void;
  selectedSupplier: string; onSupplierChange: (value: string) => void; quantity: number; onQuantityChange: (value: number) => void;
  canOrder: boolean; onSubmit: () => void; onSaveDraft: () => void;
}) {
  const selectedOffers = catalog.filter((offer) => offer.medicine_id === selectedMedicine);
  const selected = medicines.find((medicine) => medicine.id === selectedMedicine);
  const chosenOffer = selectedOffers.find((offer) => offer.supplier_name === selectedSupplier);
  return <>
    <section className="mc-panel mc-market-intro"><div><span className="mc-eyebrow">NETWORK BUYING POWER</span><h2>Compare verified distributor offers</h2><p>Review landed unit price, supplier reliability and promised lead time before raising a purchase order.</p></div>
      <label className="mc-select-filter mc-medicine-select"><Pill size={15} /><select value={selectedMedicine} onChange={(event) => onMedicineChange(event.target.value)}>{medicines.map((medicine) => <option key={medicine.id} value={medicine.id}>{medicine.name}</option>)}</select><ChevronDown size={13} /></label>
    </section>
    <div className="mc-offer-grid">{selectedOffers.map((offer) => <article key={`${offer.medicine_id}-${offer.supplier_name}`} className={`mc-offer-card ${selectedSupplier === offer.supplier_name ? 'selected' : ''}`} onClick={() => onSupplierChange(offer.supplier_name)}>
      <div className="mc-offer-top"><span className="mc-supplier-avatar">{offer.supplier_name.startsWith('Apex') ? 'AP' : 'ZD'}</span><span className="mc-reliability"><ShieldCheck size={14} />{offer.reliability}%</span></div>
      <h3>{offer.supplier_name}</h3><p>{offer.lead_time_hours === 24 ? 'Priority network delivery' : 'Standard distribution'}</p>
      <div className="mc-offer-price">{money(offer.unit_price)}<small> / {selected?.unit || 'unit'}</small></div>
      <div className="mc-offer-details"><span>Minimum order</span><b>{offer.moq} units</b><span>Committed lead time</span><b>{offer.lead_time_hours} hours</b></div>
      <div className="mc-offer-select">{selectedSupplier === offer.supplier_name ? <><Check size={14} /> Selected supplier</> : 'Select supplier'}</div>
    </article>)}</div>
    {canOrder && <section className="mc-panel mc-po-create"><div><span className="mc-eyebrow">CREATE PURCHASE ORDER</span><h2>{selected?.name || 'Select a medicine'}</h2><p>Network stock is checked automatically before an external order can be submitted.</p></div>
      <div className="mc-po-fields"><label>Order quantity<input type="number" min={chosenOffer?.moq || 1} value={quantity} onChange={(event) => onQuantityChange(Math.max(1, Number(event.target.value)))} /><small>MOQ {chosenOffer?.moq || 1} units</small></label>
        <button className="mc-btn-secondary" disabled={!selectedMedicine || offers.length === 0 || quantity < (chosenOffer?.moq || 1)} onClick={onSaveDraft}>Save draft</button>
        <button className="mc-btn-dark" disabled={!selectedMedicine || offers.length === 0 || quantity < (chosenOffer?.moq || 1)} onClick={onSubmit}><ShoppingCart size={16} /> Check & submit PO</button></div>
    </section>}
  </>;
}

function OrdersPage({ orders, role, onAdvance, onApprove, onSubmitDraft }: {
  orders: Order[]; role: Role; onAdvance: (order: Order) => void;
  onApprove: (order: Order) => void; onSubmitDraft: (order: Order) => void;
}) {
  const stages = ['Draft', 'Pending Approval', 'Dispatched', 'In-Transit', 'Delivered & Reconciled'];
  return <div className="mc-kanban">{stages.map((stage, index) => {
    const stageOrders = orders.filter((order) => order.status === stage);
    return <section className="mc-kanban-column" key={stage}><div className="mc-kanban-heading"><span><i className={`stage-dot stage-${index}`} />{stage}</span><b>{stageOrders.length}</b></div>
      {stageOrders.map((order) => <article className="mc-order-card" key={order.id}><div className="mc-order-id">{order.id}<span>{order.created_at.slice(0, 10)}</span></div><h3>{order.medicine_name}</h3><p>{order.facility_name}</p><div className="mc-order-divider" /><div className="mc-order-bottom"><span>{order.quantity.toLocaleString()} units</span><b>{money(order.quantity * order.unit_price)}</b></div><small className="mc-order-supplier"><Truck size={13} />{order.supplier_name}</small>
        {stage === 'Draft' && (role === 'Hospital' || role === 'Chemist' || role === 'Network Admin') &&
          <button className="mc-order-advance" onClick={() => onSubmitDraft(order)}>Check network & submit <ArrowRight size={13} /></button>}
        {stage === 'Pending Approval' && (role === 'Hospital' || role === 'Chemist' || role === 'Network Admin') &&
          <button className="mc-order-advance" disabled={order.approved} onClick={() => onApprove(order)}>{order.approved ? 'Approved · awaiting supplier' : 'Approve requisition'} {!order.approved && <Check size={13} />}</button>}
        {stage === 'Pending Approval' && role === 'Supplier' && order.approved &&
          <button className="mc-order-advance" onClick={() => onAdvance(order)}>Dispatch approved order <Truck size={13} /></button>}
        {stage !== 'Pending Approval' && role === 'Supplier' && stage !== 'Delivered & Reconciled' &&
          <button className="mc-order-advance" onClick={() => onAdvance(order)}>Advance to {stages[index + 1]} <ArrowRight size={13} /></button>}
        {role === 'Supplier' && stage === 'Pending Approval' && !order.approved && <small className="mc-order-supplier">Awaiting facility approval</small>}
      </article>)}
      {stageOrders.length === 0 && <div className="mc-kanban-empty">No orders at this stage</div>}
    </section>;
  })}</div>;
}

function AlertsPage({ notices, compact = false }: { notices: Notice[]; compact?: boolean }) {
  return <section className={compact ? 'mc-alerts-compact' : 'mc-panel mc-full-alerts'}>
    {!compact && <div className="mc-table-heading"><div><span className="mc-eyebrow">LIVE NETWORK FEED</span><h2>Actionable supply alerts</h2><p>Stock threshold, transfer sign-off and near-expiry salvage opportunities.</p></div></div>}
    {notices.length === 0 ? <div className="mc-empty-state"><CheckCircle2 size={29} /><h3>You're all caught up</h3><p>No current stock or procurement alerts require action.</p></div> : notices.map((notice) => <article className="mc-notice-card" key={notice.id}>
      <span className={`mc-notice-icon ${notice.kind}`}>{notice.kind === 'approval' ? <ShieldCheck size={18} /> : notice.kind === 'expiry' ? <Clock3 size={18} /> : <ArrowDownRight size={18} />}</span>
      <div><strong>{notice.title}</strong><p>{notice.description}</p></div><span className="mc-notice-time">{notice.time}</span>
    </article>)}
  </section>;
}
