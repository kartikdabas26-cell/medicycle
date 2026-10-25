import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Download, FileDown, ShieldCheck, Truck, X } from 'lucide-react';
import { downloadCsv } from '../../utils/csv';
import { downloadPdfFile } from '../../utils/pdf';

type PortalRole = 'Hospital' | 'Chemist' | 'Supplier' | 'Network Admin';
type Handshake = {
  id: string;
  requisition_key: string;
  donor_facility_id: string;
  donor_facility_name: string;
  recipient_facility_id: string;
  recipient_facility_name: string;
  medicine_name: string;
  quantity: number;
  donor_stock_before: number;
  projected_30_day_demand: number;
  donor_stock_after_release: number;
  safety_reserve: number;
  days_to_expiry: number;
  route: string[];
  status: string;
  failover_level: string;
  decline_reason: string | null;
  expires_at: string;
  manifest_id: string | null;
};

const API = '/api/transfers';
const terminalException = new Set(['DONOR_DECLINED', 'EXPIRED_TIMEOUT', 'REROUTED', 'SUPPLIER_FALLBACK', 'CANCELLED']);

export function TransferHandshakePanel({ role, facilityId, token }: {
  role: PortalRole; facilityId: string | null; token: string | null;
}) {
  const [requests, setRequests] = useState<Handshake[]>([]);
  const [pending, setPending] = useState<Handshake[]>([]);
  const [now, setNow] = useState(Date.now());
  const [busyId, setBusyId] = useState('');
  const [downloadingPdf, setDownloadingPdf] = useState('');
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const isAdmin = role === 'Network Admin';

  const api = useCallback(async (path: string, options: RequestInit = {}) => {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
    const payload = response.headers.get('content-type')?.includes('application/json')
      ? await response.json() as { detail?: string }
      : null;
    if (!response.ok) throw new Error(payload?.detail || `Transfer request failed (${response.status})`);
    return payload;
  }, [token]);

  const reload = useCallback(async () => {
    if (!token) return;
    try {
      const [ledger, incoming] = await Promise.all([
        api(isAdmin ? '/ledger' : '/tracking') as Promise<Handshake[]>,
        role === 'Hospital' || role === 'Chemist' || isAdmin
          ? api('/pending-requests') as Promise<Handshake[]>
          : Promise.resolve([] as Handshake[]),
      ]);
      setRequests(ledger);
      setPending(incoming);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Transfer workflow could not be loaded');
    }
  }, [api, isAdmin, role, token]);

  useEffect(() => {
    void reload();
    const refreshId = window.setInterval(() => void reload(), 8000);
    const clockId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(refreshId);
      window.clearInterval(clockId);
    };
  }, [reload]);

  const exceptions = useMemo(
    () => requests.filter((request) => terminalException.has(request.status)),
    [requests],
  );
  const repeatDonors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const request of exceptions) {
      if (request.status === 'DONOR_DECLINED' || request.status === 'EXPIRED_TIMEOUT') {
        counts.set(request.donor_facility_id, (counts.get(request.donor_facility_id) || 0) + 1);
      }
    }
    return counts;
  }, [exceptions]);

  const respond = async (request: Handshake, action: 'accept' | 'decline') => {
    setBusyId(request.id);
    setError('');
    try {
      const result = await api(`/${encodeURIComponent(request.id)}/respond`, {
        method: 'POST',
        body: JSON.stringify({ action, reason: action === 'decline' ? 'Donor declined in facility portal' : null }),
      }) as { manifest_id?: string };
      await reload();
      if (action === 'accept' && result?.manifest_id) await downloadManifest(request.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not respond to transfer');
      await reload();
    } finally {
      setBusyId('');
    }
  };

  const override = async (request: Handshake, action: 'accept' | 'reroute' | 'cancel') => {
    setBusyId(request.id);
    setError('');
    try {
      await api('/admin/override', {
        method: 'POST',
        body: JSON.stringify({ transfer_id: request.id, action, reason: `NOC ${action} override` }),
      });
      await reload();
      if (action === 'accept') await downloadManifest(request.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not apply the NOC override');
      await reload();
    } finally {
      setBusyId('');
    }
  };

  const downloadManifest = async (transferId: string) => {
    setDownloadingPdf(transferId);
    setError('');
    try {
    const response = await fetch(`${API}/${encodeURIComponent(transferId)}/manifest.pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => null) as { detail?: string } | null;
      throw new Error(failure?.detail || 'Transfer dispatched, but its manifest could not be downloaded');
    }
    if (!response.headers.get('content-type')?.toLowerCase().includes('application/pdf')) {
      throw new Error('The server response was not a PDF manifest.');
    }
    const blob = await response.blob();
    if (blob.size < 5 || new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer()) !== '%PDF-') {
      throw new Error('The server returned an invalid or empty PDF manifest.');
    }
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `medicycle-manifest-${transferId}.pdf`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Manifest download failed');
    } finally {
      setDownloadingPdf('');
    }
  };

  const downloadTransferReport = async () => {
    setDownloadingPdf('report');
    setError('');
    try {
      await downloadPdfFile(
        `${API}/export/pdf`,
        `medicycle-transfer-report-${new Date().toISOString().slice(0, 10)}.pdf`,
        token,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Transfer PDF report download failed');
    } finally {
      setDownloadingPdf('');
    }
  };

  const receive = async (request: Handshake) => {
    setBusyId(request.id);
    setError('');
    try {
      await api(`/${encodeURIComponent(request.id)}/receive`, { method: 'POST' });
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reconcile transfer delivery');
      await reload();
    } finally {
      setBusyId('');
    }
  };

  const secondsRemaining = (request: Handshake) =>
    Math.max(0, Math.ceil((new Date(request.expires_at).getTime() - now) / 1000));
  const formatCountdown = (seconds: number) =>
    `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;

  if (role === 'Supplier') {
    const emergencyOrders = requests.filter((request) => request.status === 'SUPPLIER_FALLBACK');
    return <section className="mc-handshake-panel">
      <div className="mc-handshake-heading">
        <span className="mc-handshake-icon"><Truck size={18} /></span>
        <div><span className="mc-eyebrow">EMERGENCY PROCUREMENT</span><h2>Supplier fallback requests</h2></div>
        <button type="button" className="mc-btn-dark mc-handshake-export" disabled={downloadingPdf !== ''}
          onClick={() => void downloadTransferReport()}>
          <FileDown size={15} /> {downloadingPdf === 'report' ? 'Preparing PDF…' : 'Download PDF report'}
        </button>
      </div>
      {error && <div className="mc-handshake-error" role="alert"><AlertTriangle size={15} />{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={14} /></button></div>}
      {emergencyOrders.length ? emergencyOrders.map((request) => <article className="mc-handshake-row" key={request.id}>
        <div><strong>{request.medicine_name} · {request.quantity} units</strong><small>{request.recipient_facility_name} · {request.failover_level}</small></div>
        <span className="mc-handshake-status">{request.status}</span>
      </article>) : <p className="mc-handshake-empty">No emergency supplier purchase orders are awaiting fulfillment.</p>}
    </section>;
  }

  const facilityPending = pending.filter((request) => isAdmin || request.donor_facility_id === facilityId);
  const recipientRows = isAdmin ? [] : requests.filter((request) => request.recipient_facility_id === facilityId);
  const ledgerRows = isAdmin ? requests : recipientRows;
  const filteredLedgerRows = isAdmin && statusFilter !== 'All statuses'
    ? ledgerRows.filter((request) => request.status === statusFilter)
    : ledgerRows;

  return <section className="mc-handshake-panel">
    <div className="mc-handshake-heading">
      <span className="mc-handshake-icon"><ShieldCheck size={18} /></span>
      <div><span className="mc-eyebrow">{isAdmin ? 'NETWORK OPERATIONS CENTER' : 'BILATERAL TRANSFER HANDSHAKE'}</span>
        <h2>{isAdmin ? 'Transfer ledger & exception desk' : 'Incoming dispatch requests'}</h2></div>
      <span className="mc-handshake-live"><i /> 10-MINUTE WINDOW</span>
      <div className="mc-handshake-export-actions">
      <button type="button" className="mc-btn-dark mc-handshake-export" disabled={downloadingPdf !== ''}
        onClick={() => void downloadTransferReport()}>
        <FileDown size={14} /> {downloadingPdf === 'report' ? 'Preparing PDF…' : 'Download PDF report'}
      </button>
      <button type="button" className="mc-btn-secondary mc-handshake-export" disabled={!requests.length}
        aria-label={`Export ${requests.length} transfer records as CSV`}
        onClick={() => downloadCsv(
          `medicycle-transfers-${facilityId || 'network'}-${new Date().toISOString().slice(0, 10)}.csv`,
          ['Request ID', 'Requisition', 'Medicine', 'Quantity', 'Donor Facility', 'Recipient Facility', 'Status', 'Failover Level', 'Expires At', 'Manifest ID', 'Reason'],
          requests.map((request) => [
            request.id, request.requisition_key, request.medicine_name, request.quantity,
            request.donor_facility_name, request.recipient_facility_name, request.status,
            request.failover_level, request.expires_at, request.manifest_id || '', request.decline_reason || '',
          ]),
        )}>
        <FileDown size={14} /> Export CSV
      </button>
      </div>
    </div>
    {error && <div className="mc-handshake-error" role="alert"><AlertTriangle size={15} />{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={14} /></button></div>}

    {facilityPending.length > 0 && <div className="mc-handshake-offers">{facilityPending.map((request) => {
      const remaining = secondsRemaining(request);
      const timerClass = remaining < 120 ? 'urgent' : remaining < 300 ? 'warning' : 'safe';
      return <article className="mc-handshake-request" key={request.id}>
        <div className="mc-handshake-request-top">
          <div><span className="mc-handshake-level">{request.failover_level} donor match</span><h3>{request.medicine_name}</h3>
            <p>{request.donor_facility_name} → {request.recipient_facility_name}</p></div>
          <span className={`mc-handshake-countdown ${timerClass}`} aria-label={`${formatCountdown(remaining)} remaining`}>
            <Clock3 size={14} />{formatCountdown(remaining)}
          </span>
        </div>
        <div className="mc-handshake-proof">
          <span>Current stock <b>{request.donor_stock_before} units</b></span>
          <span>Projected 30-day demand <b>{request.projected_30_day_demand} units</b></span>
          <span>Release <b>{request.quantity} units</b></span>
          <span>Remaining / safety reserve <b>{request.donor_stock_after_release} / {request.safety_reserve} units</b></span>
        </div>
        <p className="mc-handshake-route">Route: {request.route.join(' → ')} · Expires {new Date(request.expires_at).toLocaleTimeString()}</p>
        <div className="mc-handshake-actions">
          {isAdmin ? <>
            <button className="mc-btn-dark" disabled={busyId === request.id} onClick={() => void override(request, 'accept')}><CheckCircle2 size={15} /> Force approve</button>
            <button className="mc-btn-secondary" disabled={busyId === request.id} onClick={() => void override(request, 'reroute')}>Reroute</button>
            <button className="mc-btn-secondary" disabled={busyId === request.id} onClick={() => void override(request, 'cancel')}>Cancel</button>
          </> : <>
            <button className="mc-btn-dark" disabled={busyId === request.id || remaining === 0} onClick={() => void respond(request, 'accept')}><Truck size={15} /> Accept & dispatch</button>
            <button className="mc-btn-secondary" disabled={busyId === request.id || remaining === 0} onClick={() => void respond(request, 'decline')}>Decline request</button>
          </>}
        </div>
      </article>;
    })}</div>}

    {isAdmin && <div className="mc-handshake-exceptions">
      <h3><AlertTriangle size={15} /> Exception & escalation desk <span>{exceptions.length}</span></h3>
      {exceptions.length ? exceptions.slice(0, 6).map((request) => <div className="mc-handshake-row" key={request.id}>
        <div><strong>{request.medicine_name} · {request.status.replaceAll('_', ' ')}</strong>
          <small>{request.donor_facility_name} → {request.recipient_facility_name} · {request.failover_level}</small>
          {((repeatDonors.get(request.donor_facility_id) || 0) >= 2 || /insulin|epinephrine|morphine|fentanyl|heparin/i.test(request.medicine_name))
            && <small className="mc-handshake-flag">{(repeatDonors.get(request.donor_facility_id) || 0) >= 2 ? 'Repeated donor rejection / timeout' : 'High-risk medication escalation'}</small>}
        </div>
        <small>{request.decline_reason || request.id}</small>
      </div>) : <p className="mc-handshake-empty">No donor rejections, timeouts or supplier escalations recorded.</p>}
    </div>}

    <div className="mc-handshake-tracking">
      <div className="mc-handshake-ledger-heading"><h3>{isAdmin ? 'Full lifecycle ledger' : 'Recipient transfer tracking'}</h3>
        {isAdmin && <label><span className="sr-only">Filter transfer ledger by status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option>All statuses</option>
            {[...new Set(requests.map((request) => request.status))].sort().map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}
          </select>
        </label>}
      </div>
      {filteredLedgerRows.length ? filteredLedgerRows.slice(0, isAdmin ? 10 : 5).map((request) => <article className="mc-handshake-row" key={request.id}>
        <div><strong>{request.medicine_name} · {request.quantity} units</strong>
          <small>{request.donor_facility_name} → {request.recipient_facility_name} · {request.failover_level}</small>
          {request.status === 'PENDING_DONOR_CONSENT' && <small>Awaiting donor confirmation · {formatCountdown(secondsRemaining(request))} remaining</small>}
        </div>
        <span className={`mc-handshake-status ${request.status === 'IN_TRANSIT' ? 'transit' : ''}`}>{request.status.replaceAll('_', ' ')}</span>
        {request.manifest_id && <button type="button" className="mc-btn-secondary mc-handshake-manifest-download"
          title={`Download manifest ${request.manifest_id}`} aria-label={`Download manifest PDF ${request.manifest_id}`}
          disabled={downloadingPdf === request.id} onClick={() => void downloadManifest(request.id)}>
          <Download size={14} /> {downloadingPdf === request.id ? 'Preparing…' : 'Manifest PDF'}
        </button>}
        {!isAdmin && request.status === 'IN_TRANSIT' && request.recipient_facility_id === facilityId
          && <button className="mc-btn-dark mc-handshake-receive" disabled={busyId === request.id} onClick={() => void receive(request)}>Receive & reconcile</button>}
      </article>) : <p className="mc-handshake-empty">{facilityPending.length ? 'Donor requests are shown above.' : 'No transfer attempts are currently assigned to this facility.'}</p>}
    </div>
  </section>;
}
