import { useState } from 'react';
import { ArrowRight, Building2, HeartPulse, Hospital, Lock, Pill, ShieldCheck, Sparkles, Truck } from 'lucide-react';
import { FACILITY_PROFILES, type PortalRole, useAuth } from '../context/AuthContext';

interface PortalCardItem {
  role: PortalRole;
  title: string;
  badge: string;
  description: string;
  icon: typeof Hospital;
  accent: string;
  loginPath: string;
  isLocked?: boolean;
}

const PORTALS: PortalCardItem[] = [
  {
    role: 'patient',
    title: 'Patient & Family',
    badge: 'Direct Care Access',
    description: 'Find trusted nearby medicine stock, compare generic prices, voice search, and manage verified refills.',
    icon: HeartPulse,
    accent: 'patient',
    loginPath: '/login/patient',
  },
  {
    role: 'hospital',
    title: 'Hospital & Clinical Ward',
    badge: 'Clinical Command',
    description: 'Monitor ward & ICU buffers, review incoming salvage redistributions, and submit protected requisitions.',
    icon: Hospital,
    accent: 'hospital',
    loginPath: '/login/hospital',
  },
  {
    role: 'chemist',
    title: 'Retail Chemist & Dispensary',
    badge: 'Licensed Pharmacy',
    description: 'Manage shelf inventory, route short-dated batches before expiration, and coordinate peer transfers.',
    icon: Pill,
    accent: 'chemist',
    loginPath: '/login/chemist',
  },
  {
    role: 'supplier',
    title: 'Medical Supplier & Logistics',
    badge: 'Distributor Gateway',
    description: 'Manage wholesale purchase orders, published catalog offers, dispatch tracking, and delivery SLAs.',
    icon: Truck,
    accent: 'supplier',
    loginPath: '/login/supplier',
  },
  {
    role: 'admin',
    title: 'Master Admin (Platform Owner)',
    badge: 'Locked Gate',
    description: 'Central Network Operations Center, 10-minute failover desk, emergency override controls, and district analytics.',
    icon: ShieldCheck,
    accent: 'admin',
    loginPath: '/login/admin',
    isLocked: true,
  },
];

export function PortalSelectPage() {
  const { login } = useAuth();
  const [selectedRole, setSelectedRole] = useState<PortalRole>('patient');
  const [facilityId, setFacilityId] = useState('FAC-001');
  const [error, setError] = useState('');
  const [entering, setEntering] = useState(false);

  const selectedPortal = PORTALS.find((portal) => portal.role === selectedRole)!;
  const facilities = selectedRole !== 'patient' && selectedRole !== 'admin' ? FACILITY_PROFILES[selectedRole] : [];

  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const handleQuickDemoEnter = async () => {
    setError('');
    setEntering(true);
    try {
      await login(selectedRole, selectedRole === 'patient' || selectedRole === 'admin' ? null : facilityId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open this portal.');
      setEntering(false);
    }
  };

  return (
    <main className="portal-gateway">
      <div className="portal-gateway-glow portal-glow-one" />
      <div className="portal-gateway-glow portal-glow-two" />
      
      <header className="portal-gateway-brand">
        <span className="portal-brand-mark"><Pill size={22} /></span>
        <span><b>MEDI<span>CYCLE</span></b><small>AI-Powered Essential Medicine Supply Optimization</small></span>
      </header>

      <section className="portal-gateway-content">
        <div className="portal-gateway-intro">
          <span className="portal-eyebrow"><Building2 size={14} /> DOMAIN-ISOLATED HEALTHCARE NETWORK</span>
          <h1>How will you use <em>MediCycle</em> today?</h1>
          <p>Select your dedicated stakeholder domain. Each workspace enforces domain-specific authentication and security isolation.</p>
        </div>

        {/* 5 Distinct Intent Entry Cards */}
        <div className="portal-card-grid">
          {PORTALS.map(({ role, title, badge, description, icon: Icon, accent, loginPath, isLocked }) => (
            <div
              key={role}
              className={`portal-choice-card portal-${accent}${selectedRole === role ? ' selected' : ''}`}
              onClick={() => {
                setSelectedRole(role);
                if (role !== 'patient' && role !== 'admin') {
                  setFacilityId(FACILITY_PROFILES[role][0].id);
                }
                setError('');
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setSelectedRole(role);
                  if (role !== 'patient' && role !== 'admin') setFacilityId(FACILITY_PROFILES[role][0].id);
                }
              }}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="portal-choice-icon"><Icon size={22} /></span>
                {isLocked ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider uppercase text-amber-900 bg-amber-100/90 border border-amber-300 px-2 py-0.5 rounded-full">
                    <Lock size={10} /> {badge}
                  </span>
                ) : (
                  <span className="text-[10px] font-bold tracking-wider uppercase text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    {badge}
                  </span>
                )}
              </div>

              <span className="portal-choice-copy">
                <strong>{title}</strong>
                <small>{description}</small>
              </span>

              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between w-full">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigateTo(loginPath);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-700 hover:text-teal-900 transition-colors"
                >
                  Enter via {title.split(' ')[0]} Login <ArrowRight size={13} />
                </button>
                <span className="text-[11px] text-slate-400 font-mono">
                  {loginPath}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Selected Workspace Launchpad */}
        <section className="portal-entry-bar" aria-live="polite">
          <div className="portal-entry-profile">
            <span className="portal-entry-icon"><selectedPortal.icon size={19} /></span>
            <span>
              <small>SELECTED DOMAIN GATEWAY</small>
              <strong>{selectedPortal.title}</strong>
            </span>
          </div>

          {facilities.length > 1 && (
            <label className="portal-facility-picker">
              Facility
              <select value={facilityId} onChange={(event) => setFacilityId(event.target.value)}>
                {facilities.map((facility) => (
                  <option key={facility.id} value={facility.id}>
                    {facility.name} ({facility.id})
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="portal-enter-button"
              onClick={() => navigateTo(selectedPortal.loginPath)}
            >
              Go to {selectedPortal.title.split(' ')[0]} Login <ArrowRight size={16} />
            </button>
            <button
              type="button"
              onClick={handleQuickDemoEnter}
              disabled={entering}
              title="Fast 1-click evaluation bypass"
              className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors border border-slate-200 flex items-center gap-1.5"
            >
              <Sparkles size={14} className="text-amber-500" />
              {entering ? 'Loading…' : 'Quick Demo'}
            </button>
          </div>
        </section>

        {error && <p className="portal-gateway-error" role="alert">{error}</p>}
        <p className="portal-gateway-footnote">
          MediCycle enforces multi-domain security isolation. Select any domain card to access its dedicated, branded authentication gateway.
        </p>
      </section>
    </main>
  );
}
