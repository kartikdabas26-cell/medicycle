import {
  InventoryItem,
  ForecastItem,
  RiskItem,
  TransferRecommendation,
  ReorderItem,
  DashboardSummary,
  Facility
} from '../types';

const BASE_URL = '/api';

export const api = {
  // Facilities
  async getFacilities(): Promise<Facility[]> {
    const res = await fetch(`${BASE_URL}/facilities`);
    if (!res.ok) throw new Error('Failed to fetch facilities');
    return res.json();
  },

  // Dashboard summary
  async getDashboardSummary(surgePct: number = 0): Promise<DashboardSummary> {
    const res = await fetch(`${BASE_URL}/risks/summary?surge_pct=${surgePct}`);
    if (!res.ok) throw new Error('Failed to fetch dashboard summary');
    return res.json();
  },

  // Inventory
  async getInventory(params?: {
    facility_id?: string;
    medicine_id?: string;
    category?: string;
    risk_level?: string;
    surge_pct?: number;
  }): Promise<InventoryItem[]> {
    const searchParams = new URLSearchParams();
    if (params?.facility_id) searchParams.set('facility_id', params.facility_id);
    if (params?.medicine_id) searchParams.set('medicine_id', params.medicine_id);
    if (params?.category) searchParams.set('category', params.category);
    if (params?.risk_level) searchParams.set('risk_level', params.risk_level);
    if (params?.surge_pct !== undefined) searchParams.set('surge_pct', params.surge_pct.toString());

    const res = await fetch(`${BASE_URL}/inventory?${searchParams.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch inventory');
    return res.json();
  },

  async updateInventoryItem(itemId: string, data: { current_stock?: number; safety_stock?: number; supplier_lead_time_days?: number }) {
    const res = await fetch(`${BASE_URL}/inventory/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to update inventory' }));
      throw new Error(err.detail || 'Failed to update inventory');
    }
    return res.json();
  },

  async importInventoryCSV(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${BASE_URL}/inventory/import/csv`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'CSV Import failed. Please check format.' }));
      throw new Error(err.detail || 'CSV Import failed. Please check format.');
    }
    return res.json();
  },

  getInventoryExportUrl(surgePct: number = 0): string {
    return `${BASE_URL}/inventory/export/csv?surge_pct=${surgePct}`;
  },

  getInventoryPdfUrl(params?: { facility_id?: string; category?: string; risk_level?: string; surge_pct?: number }): string {
    const searchParams = new URLSearchParams();
    if (params?.facility_id && params.facility_id !== 'All') searchParams.set('facility_id', params.facility_id);
    if (params?.category && params.category !== 'All') searchParams.set('category', params.category);
    if (params?.risk_level && params.risk_level !== 'All' && params.risk_level !== 'All risks') searchParams.set('risk_level', params.risk_level);
    if (params?.surge_pct !== undefined) searchParams.set('surge_pct', params.surge_pct.toString());
    const qs = searchParams.toString();
    return `${BASE_URL}/inventory/export/pdf${qs ? `?${qs}` : ''}`;
  },

  getInventoryTemplateUrl(): string {
    return `${BASE_URL}/inventory/template/csv`;
  },

  async downloadFile(url: string, defaultFilename: string): Promise<void> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Download failed with status ${res.status}`);
    }
    const disposition = res.headers.get('Content-Disposition');
    let filename = defaultFilename;
    if (disposition) {
      const match = disposition.match(/filename=["']?([^"']+)["']?/);
      if (match && match[1]) filename = match[1];
    }
    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
  },

  // Forecasts
  async getForecasts(surgePct: number = 0, facilityId?: string): Promise<ForecastItem[]> {
    const params = new URLSearchParams({ surge_pct: surgePct.toString() });
    if (facilityId) params.set('facility_id', facilityId);
    const res = await fetch(`${BASE_URL}/forecasts?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch forecasts');
    return res.json();
  },

  // Risks
  async getRisks(surgePct: number = 0): Promise<RiskItem[]> {
    const res = await fetch(`${BASE_URL}/risks?surge_pct=${surgePct}`);
    if (!res.ok) throw new Error('Failed to fetch risks');
    return res.json();
  },

  // Transfers
  async getTransfers(surgePct: number = 0): Promise<TransferRecommendation[]> {
    const res = await fetch(`${BASE_URL}/transfers?surge_pct=${surgePct}`);
    if (!res.ok) throw new Error('Failed to fetch transfer recommendations');
    return res.json();
  },

  async approveTransfer(recommendation: TransferRecommendation) {
    const res = await fetch(`${BASE_URL}/transfers/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recommendation),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Transfer execution failed' }));
      throw new Error(err.detail || 'Transfer execution failed');
    }
    return res.json();
  },

  getTransfersExportUrl(surgePct: number = 0): string {
    return `${BASE_URL}/transfers/export/csv?surge_pct=${surgePct}`;
  },

  getTransfersPdfUrl(surgePct: number = 0): string {
    return `${BASE_URL}/transfers/export/pdf?surge_pct=${surgePct}`;
  },

  // Reorder
  async getReorders(horizonDays: number = 14, surgePct: number = 0): Promise<ReorderItem[]> {
    const res = await fetch(`${BASE_URL}/reorder?horizon_days=${horizonDays}&surge_pct=${surgePct}`);
    if (!res.ok) throw new Error('Failed to fetch reorder plan');
    return res.json();
  },

  getReordersExportUrl(horizonDays: number = 14, surgePct: number = 0): string {
    return `${BASE_URL}/reorder/export/csv?horizon_days=${horizonDays}&surge_pct=${surgePct}`;
  },

  // Demo Reset
  async resetDemoData() {
    const token = localStorage.getItem('medicycle_token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${BASE_URL}/demo/reset`, { method: 'POST', headers });
    if (!res.ok) throw new Error('Failed to reset demo scenario');
    return res.json();
  },

  // AI Assistant
  async askAI(question: string) {
    const res = await fetch(`${BASE_URL}/ai/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    if (!res.ok) throw new Error('Failed to query AI Assistant');
    return res.json();
  }
};
