import { useState, useEffect } from 'react';
import { ArrowLeft, Building2, CheckCircle2, ChevronRight, Hospital, KeyRound, Lock, Mail, Pill, RefreshCw, ShieldAlert, ShieldCheck, Sparkles, Truck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export type InstitutionalDomain = 'hospital' | 'chemist' | 'supplier';

interface DomainConfig {
  domain: InstitutionalDomain;
  title: string;
  subtitle: string;
  badge: string;
  icon: typeof Hospital;
  colorName: string;
  gradient: string;
  buttonGradient: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  ringColor: string;
  demoCreds: {
    facilityId: string;
    email: string;
    password: string;
    facilityName: string;
  };
}

const DOMAIN_CONFIGS: Record<InstitutionalDomain, DomainConfig> = {
  hospital: {
    domain: 'hospital',
    title: 'Hospital Supply Command',
    subtitle: 'Two-step authenticated access for ward-level stock, ICU reserves, and urgent bilateral transfers.',
    badge: 'Clinical Healthcare Portal',
    icon: Hospital,
    colorName: 'teal',
    gradient: 'from-teal-500 to-emerald-600',
    buttonGradient: 'from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 shadow-teal-600/20',
    badgeBg: 'bg-teal-50',
    badgeText: 'text-teal-800',
    badgeBorder: 'border-teal-200',
    ringColor: 'focus:ring-teal-500',
    demoCreds: {
      facilityId: 'FAC-001',
      facilityName: 'Apex Central Hospital',
      email: 'pharmacy@centralhospital.org',
      password: 'Hospital@2026',
    },
  },
  chemist: {
    domain: 'chemist',
    title: 'Community Chemist Workspace',
    subtitle: 'Dual-verified portal for retail dispensary inventory, short-dated salvage, and peer restocking.',
    badge: 'Licensed Pharmacy Portal',
    icon: Pill,
    colorName: 'amber',
    gradient: 'from-amber-500 to-orange-600',
    buttonGradient: 'from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 shadow-amber-600/20',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-800',
    badgeBorder: 'border-amber-200',
    ringColor: 'focus:ring-amber-500',
    demoCreds: {
      facilityId: 'FAC-003',
      facilityName: 'Valley Community Clinic',
      email: 'dispensary@apollochemist.com',
      password: 'Chemist@2026',
    },
  },
  supplier: {
    domain: 'supplier',
    title: 'Medical Supplier Desk',
    subtitle: 'Wholesale order fulfillment, distributor catalog management, and delivery SLA reconciliation.',
    badge: 'Distributor Logistics Portal',
    icon: Truck,
    colorName: 'indigo',
    gradient: 'from-indigo-600 to-purple-600',
    buttonGradient: 'from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-indigo-600/20',
    badgeBg: 'bg-indigo-50',
    badgeText: 'text-indigo-800',
    badgeBorder: 'border-indigo-200',
    ringColor: 'focus:ring-indigo-500',
    demoCreds: {
      facilityId: 'FAC-006',
      facilityName: 'Harbor Medical Center / Apex Logistics',
      email: 'orders@apexdistributors.com',
      password: 'Supplier@2026',
    },
  },
};

export function InstitutionalLoginPage({ domain }: { domain: InstitutionalDomain }) {
  const cfg = DOMAIN_CONFIGS[domain];
  const { loginInstitutionalStep1, confirmInstitutionalCode } = useAuth();

  // Step 1 Form States
  const [facilityId, setFacilityId] = useState(cfg.demoCreds.facilityId);
  const [email, setEmail] = useState(cfg.demoCreds.email);
  const [password, setPassword] = useState(cfg.demoCreds.password);

  // Step 2 Verification States
  const [step, setStep] = useState<1 | 2>(1);
  const [code, setCode] = useState('849201');
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);

  // Feedback States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [demoBanner, setDemoBanner] = useState('');

  // 60-second countdown timer for step 2
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (step === 2 && countdown > 0) {
      timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    } else if (step === 2 && countdown === 0) {
      setCanResend(true);
    }
    return () => clearTimeout(timer);
  }, [step, countdown]);

  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  // Auto-fill demo credentials
  const fillDemoCreds = () => {
    setFacilityId(cfg.demoCreds.facilityId);
    setEmail(cfg.demoCreds.email);
    setPassword(cfg.demoCreds.password);
    setError('');
    setDemoBanner(`Applied demo credentials for ${cfg.demoCreds.facilityName} (${cfg.demoCreds.facilityId}).`);
  };

  // Step 1 Handler: Credential Verification
  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!facilityId.trim() || !email.trim() || !password) {
      setError('Please provide Facility ID, Official Email, and Password.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const res = await loginInstitutionalStep1(domain, facilityId.trim(), email.trim(), password);
      setStep(2);
      setCode(res.demo_code || '849201');
      setCountdown(60);
      setCanResend(false);
      setDemoBanner(`Email Verification Code Generated: ${res.demo_code || '849201'} (sent to ${email.trim()})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Institutional credential verification failed.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2 Handler: Code Confirmation
  const handleStep2Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || code.length !== 6) {
      setError('Please enter the 6-digit confirmation code.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      await confirmInstitutionalCode(domain, facilityId.trim(), email.trim(), code.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid verification code.');
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!canResend) return;
    setLoading(true);
    setError('');
    try {
      const res = await loginInstitutionalStep1(domain, facilityId.trim(), email.trim(), password);
      setCode(res.demo_code || '849201');
      setCountdown(60);
      setCanResend(false);
      setDemoBanner(`New Code Dispatched: ${res.demo_code || '849201'}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend code.');
    } finally {
      setLoading(false);
    }
  };

  const Icon = cfg.icon;

  return (
    <main className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4 sm:p-6 font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Top Banner Navigation */}
      <div className="w-full max-w-md flex items-center justify-between mb-4">
        <button
          onClick={() => navigateTo('/portal')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 transition-colors bg-white/90 backdrop-blur px-3 py-1.5 rounded-full border border-slate-200 shadow-sm"
        >
          <ArrowLeft size={14} /> Back to Portals
        </button>
        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${cfg.badgeBg} ${cfg.badgeText} ${cfg.badgeBorder}`}>
          <ShieldCheck size={13} /> {cfg.badge}
        </span>
      </div>

      {/* Main Login Card */}
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl shadow-slate-900/5 border border-slate-200 p-6 sm:p-8 relative overflow-hidden">
        {/* Step Indicator Header */}
        <div className="flex items-center justify-between mb-5 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-xl bg-gradient-to-tr ${cfg.gradient} text-white flex items-center justify-center shadow-md`}>
              <Icon size={17} strokeWidth={2.2} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">{cfg.title}</h2>
              <p className="text-[11px] text-slate-500">2-Step Dual Verification Enforcement</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 1 ? 'bg-slate-900 text-white' : 'bg-emerald-500 text-white'}`}>
              {step === 2 ? '✓' : '1'}
            </span>
            <span className="text-slate-300">―</span>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 2 ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'}`}>
              2
            </span>
          </div>
        </div>

        {/* Demo Helper Banner */}
        {demoBanner && (
          <div className="mb-4 p-3 bg-amber-50/80 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
            <Sparkles size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 font-semibold leading-relaxed">{demoBanner}</div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium flex items-center gap-2" role="alert">
            <ShieldAlert size={15} className="shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* STEP 1: CREDENTIAL VERIFICATION */}
        {step === 1 ? (
          <form onSubmit={handleStep1Submit} className="space-y-4">
            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs text-slate-600 mb-2">
              Step 1 verifies your Facility ID, Institutional Password, and Official Registered Email on file.
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Building2 size={13} className="text-slate-400" /> Assigned Facility ID
              </label>
              <input
                type="text"
                value={facilityId}
                onChange={(e) => setFacilityId(e.target.value)}
                placeholder="e.g. FAC-001"
                required
                className={`w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 ${cfg.ringColor} text-sm text-slate-900 font-mono`}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Mail size={13} className="text-slate-400" /> Registered Official Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. pharmacy@centralhospital.org"
                required
                className={`w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 ${cfg.ringColor} text-sm text-slate-900`}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Lock size={13} className="text-slate-400" /> Institutional Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                className={`w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 ${cfg.ringColor} text-sm text-slate-900`}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 px-4 bg-gradient-to-r ${cfg.buttonGradient} text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-60`}
            >
              {loading ? 'Verifying Credentials…' : 'Proceed to Step 2 Verification'}
              <ChevronRight size={16} />
            </button>
          </form>
        ) : (
          /* STEP 2: EMAIL HANDSHAKE PIN CONFIRMATION */
          <form onSubmit={handleStep2Submit} className="space-y-4">
            <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs text-emerald-900">
              <p className="font-bold flex items-center gap-1 mb-1">
                <CheckCircle2 size={14} className="text-emerald-600" /> Step 1 Passed: Credentials Confirmed
              </p>
              <p className="text-[11px] text-emerald-700">
                A 6-digit confirmation code was sent to <b>{email}</b>.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <KeyRound size={13} className="text-slate-400" /> 6-Digit Email Verification PIN
                </label>
                <span className="text-[11px] font-mono text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded font-semibold">
                  Demo code: 849201
                </span>
              </div>
              <input
                type="text"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="849201"
                required
                className={`w-full tracking-[0.4em] text-center text-xl font-bold py-3 px-4 rounded-xl border border-emerald-300 focus:outline-none focus:ring-2 ${cfg.ringColor} bg-emerald-50/20 text-slate-900 font-mono`}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 py-1">
              <span>Code expires in 10 minutes</span>
              <span>
                {countdown > 0 ? (
                  <span className="font-mono text-slate-600">Resend in {countdown}s</span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={loading}
                    className="text-teal-700 hover:text-teal-900 font-semibold inline-flex items-center gap-1"
                  >
                    <RefreshCw size={12} /> Resend Code
                  </button>
                )}
              </span>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 px-4 bg-gradient-to-r ${cfg.buttonGradient} text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-60`}
            >
              {loading ? 'Confirming PIN…' : 'Issue 12-Hour Session & Enter'}
              <CheckCircle2 size={16} />
            </button>

            <button
              type="button"
              onClick={() => {
                setStep(1);
                setError('');
              }}
              className="w-full text-center text-xs text-slate-500 hover:text-slate-800 font-medium pt-1"
            >
              ← Back to credential inputs
            </button>
          </form>
        )}

        {/* Demo Fast-Fill Helper */}
        <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-between">
          <button
            type="button"
            onClick={fillDemoCreds}
            className="w-full py-2 px-3 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors flex items-center justify-center gap-1.5"
          >
            <Sparkles size={13} className="text-amber-600" />
            Use Seeded Demo Credentials ({cfg.demoCreds.facilityId})
          </button>
        </div>
      </div>
    </main>
  );
}
