import { useState } from 'react';
import { ArrowLeft, CheckCircle2, KeyRound, Lock, Mail, ShieldAlert, ShieldCheck, Sparkles, Terminal } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export function AdminLoginPage() {
  const { loginAdmin } = useAuth();
  const [email, setEmail] = useState('admin@medicycle.gov');
  const [password, setPassword] = useState('AdminMaster@2026');
  const [pin, setPin] = useState('990011');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState('');

  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password || !pin.trim()) {
      setError('Master Admin Email, Password, and 6-Digit PIN are strictly required.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      await loginAdmin(email.trim(), password, pin.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Master Admin security challenge rejected.');
      setLoading(false);
    }
  };

  const autofillPlatformOwner = () => {
    setEmail('admin@medicycle.gov');
    setPassword('AdminMaster@2026');
    setPin('990011');
    setError('');
    setBanner('Master Owner security credentials loaded. Click "Authenticate Master Session".');
  };

  return (
    <main className="min-h-screen bg-[#090D16] text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 font-['Plus_Jakarta_Sans',sans-serif] relative overflow-hidden">
      {/* Background Cyber Grid / Ambient Glow */}
      <div className="absolute top-1/4 -left-20 w-80 h-80 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Banner Navigation */}
      <div className="w-full max-w-md flex items-center justify-between mb-4 z-10">
        <button
          onClick={() => navigateTo('/portal')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors bg-slate-900/80 backdrop-blur px-3 py-1.5 rounded-full border border-slate-800 shadow-sm"
        >
          <ArrowLeft size={14} /> Back to Portals
        </button>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wider uppercase text-cyan-400 bg-cyan-950/60 px-3 py-1 rounded-full border border-cyan-800/80">
          <Terminal size={13} /> Strict Lockdown
        </span>
      </div>

      {/* Main Admin Card */}
      <div className="w-full max-w-md bg-[#0F172A]/90 backdrop-blur-xl rounded-3xl shadow-2xl shadow-cyan-950/40 border border-slate-800/80 p-6 sm:p-8 relative z-10">
        {/* Glow Border Accent */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500 to-transparent" />

        {/* Security Gate Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-600 to-emerald-600 text-white shadow-lg shadow-cyan-500/20 mb-3 border border-cyan-400/30">
            <ShieldCheck size={32} strokeWidth={2.2} />
          </div>
          <h1 className="text-xl font-extrabold text-white tracking-tight flex items-center justify-center gap-2">
            Master Admin Domain
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Platform Owner & Central Health Authority Operations Gate. Unlocks the Network Operations Center, 10-minute failover desk, and district override controls.
          </p>
        </div>

        {/* Clearance Notice */}
        <div className="mb-4 p-2.5 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center gap-2 text-[11px] text-slate-400">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
          <span>Restricted clearance required. All attempts are cryptographically audited.</span>
        </div>

        {/* Banner Message */}
        {banner && (
          <div className="mb-4 p-3 bg-cyan-950/60 border border-cyan-700/60 rounded-xl text-xs text-cyan-300 font-semibold flex items-center gap-2">
            <Sparkles size={15} className="shrink-0 text-cyan-400" />
            <span>{banner}</span>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 bg-rose-950/60 border border-rose-800 rounded-xl text-xs text-rose-300 font-semibold flex items-center gap-2">
            <ShieldAlert size={15} className="shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Hardened Authentication Gate Form */}
        <form onSubmit={handleAdminLogin} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Mail size={13} className="text-cyan-400" /> Master Admin Identifier
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@medicycle.gov"
              required
              className="w-full px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-950/80 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-sm font-medium"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Lock size={13} className="text-cyan-400" /> Master Admin Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              className="w-full px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-950/80 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-sm"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <KeyRound size={13} className="text-cyan-400" /> 6-Digit Owner Security PIN
              </label>
              <span className="text-[10px] font-mono font-bold text-cyan-400 bg-cyan-950/80 border border-cyan-800/80 px-2 py-0.5 rounded">
                Owner PIN: 990011
              </span>
            </div>
            <input
              type="text"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="990011"
              required
              className="w-full tracking-[0.4em] text-center text-xl font-bold py-2.5 px-4 rounded-xl border border-cyan-800/80 bg-slate-950 text-cyan-400 font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-cyan-600/30 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-60 border border-cyan-400/30"
          >
            {loading ? 'Authenticating Clearance…' : 'Authenticate Master Session'}
            <CheckCircle2 size={16} />
          </button>
        </form>

        {/* Demo Fast-Fill Platform Owner Button */}
        <div className="mt-6 pt-5 border-t border-slate-800">
          <button
            type="button"
            onClick={autofillPlatformOwner}
            className="w-full py-2.5 px-3 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-700 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <Sparkles size={14} className="text-cyan-400" />
            Unlock as Platform Owner (Demo Autofill)
          </button>
        </div>
      </div>
    </main>
  );
}
