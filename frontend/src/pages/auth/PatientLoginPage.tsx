import { useState } from 'react';
import { ArrowLeft, CheckCircle2, ChevronRight, HeartPulse, Mail, MessageSquare, Phone, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export function PatientLoginPage() {
  const { loginPatient } = useAuth();
  const [authMode, setAuthMode] = useState<'email' | 'phone'>('email');
  const [identifier, setIdentifier] = useState('patient.demo@gmail.com');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await loginPatient('google', 'patient.demo@gmail.com');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google authentication failed.');
      setLoading(false);
    }
  };

  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!identifier.trim()) {
      setError(`Please enter your ${authMode === 'email' ? 'email address' : 'mobile number'}.`);
      return;
    }

    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/patient/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: authMode, identifier: identifier.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not send verification OTP.');

      setOtpSent(true);
      setOtpCode(data.demo_otp || '123456');
      setToastMessage(`Demo Verification OTP: ${data.demo_otp || '123456'} sent to ${identifier}!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.length !== 6) {
      setError('Please enter the 6-digit OTP code.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      await loginPatient(authMode, identifier.trim(), otpCode.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid OTP code.');
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#F0FDFA] flex flex-col items-center justify-center p-4 sm:p-6 font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Top Banner Navigation */}
      <div className="w-full max-w-md flex items-center justify-between mb-4">
        <button
          onClick={() => navigateTo('/portal')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-800 hover:text-teal-950 transition-colors bg-white/80 backdrop-blur px-3 py-1.5 rounded-full border border-teal-200/60 shadow-sm"
        >
          <ArrowLeft size={14} /> Back to Portals
        </button>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 bg-teal-100/70 px-2.5 py-1 rounded-full border border-teal-300/50">
          <ShieldCheck size={13} className="text-teal-600" /> Patient Domain
        </span>
      </div>

      {/* Main Login Card */}
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl shadow-teal-900/5 border border-teal-100 p-6 sm:p-8 relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute -top-16 -right-16 w-36 h-36 bg-cyan-200/40 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-36 h-36 bg-teal-200/40 rounded-full blur-2xl pointer-events-none" />

        {/* Brand Header */}
        <div className="text-center mb-6 relative">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-500 to-teal-500 text-white shadow-lg shadow-teal-500/25 mb-3">
            <HeartPulse size={30} strokeWidth={2.2} />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Patient & Family Access</h1>
          <p className="text-sm text-slate-600 mt-1">Find nearby stock, voice search medicines, and request prescriptions with guaranteed 180+ days shelf life.</p>
        </div>

        {/* Demo Helper Toast */}
        {toastMessage && (
          <div className="mb-4 p-3 bg-teal-50 border border-teal-300 rounded-xl flex items-center gap-2.5 text-xs text-teal-900 animate-fadeIn">
            <Sparkles size={16} className="text-teal-600 shrink-0" />
            <span className="font-semibold">{toastMessage}</span>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium" role="alert">
            {error}
          </div>
        )}

        {/* 1-Click Google Sign-In */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold rounded-2xl shadow-sm hover:shadow transition-all disabled:opacity-60 mb-5 text-sm"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
          </svg>
          Continue with Google (1-Click)
        </button>

        <div className="relative flex items-center justify-center my-4">
          <div className="border-t border-slate-200 w-full" />
          <span className="bg-white px-3 text-xs text-slate-400 uppercase font-medium tracking-wider">or sign in with OTP</span>
        </div>

        {/* Tab Switcher: Email / Phone */}
        <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl mb-4">
          <button
            type="button"
            onClick={() => {
              setAuthMode('email');
              setIdentifier('patient.demo@gmail.com');
              setOtpSent(false);
              setError('');
            }}
            className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${
              authMode === 'email' ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Mail size={14} /> Email Address
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMode('phone');
              setIdentifier('5550198234');
              setOtpSent(false);
              setError('');
            }}
            className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${
              authMode === 'phone' ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Phone size={14} /> Mobile Phone
          </button>
        </div>

        {/* Step 1: Identifier Input */}
        {!otpSent ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                {authMode === 'email' ? 'Registered Email' : '10-Digit Mobile Number'}
              </label>
              <div className="relative">
                <input
                  type={authMode === 'email' ? 'email' : 'tel'}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={authMode === 'email' ? 'you@gmail.com' : '5550198234'}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm text-slate-800 font-medium"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white font-bold rounded-xl shadow-md shadow-teal-600/20 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-60"
            >
              {loading ? 'Sending Code…' : 'Send 6-Digit OTP'}
              <ChevronRight size={16} />
            </button>
          </form>
        ) : (
          /* Step 2: OTP Verification */
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="p-3 bg-teal-50/70 border border-teal-200/80 rounded-xl flex items-center justify-between text-xs">
              <span className="text-teal-900 font-medium">OTP sent to: <b>{identifier}</b></span>
              <button
                type="button"
                onClick={() => setOtpSent(false)}
                className="text-teal-700 hover:text-teal-900 font-semibold underline text-[11px]"
              >
                Change
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  6-Digit Verification OTP
                </label>
                <span className="text-[11px] font-semibold text-teal-700 bg-teal-100 px-2 py-0.5 rounded">Demo code: 123456</span>
              </div>
              <input
                type="text"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder="123456"
                required
                className="w-full tracking-[0.4em] text-center text-xl font-bold py-3 px-4 rounded-xl border border-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-teal-50/30 text-teal-950 font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white font-bold rounded-xl shadow-md shadow-teal-600/20 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-60"
            >
              {loading ? 'Verifying…' : 'Verify & Enter Patient Portal'}
              <CheckCircle2 size={16} />
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => handleSendOtp()}
                disabled={loading}
                className="text-xs text-slate-500 hover:text-teal-700 font-semibold transition-colors"
              >
                Didn't receive code? Resend OTP
              </button>
            </div>
          </form>
        )}

        {/* Demo Fast Fill Shortcuts */}
        <div className="mt-6 pt-5 border-t border-slate-100">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <MessageSquare size={12} /> Instant Evaluation Shortcuts
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setAuthMode('email');
                setIdentifier('patient.demo@gmail.com');
                setOtpCode('123456');
                setOtpSent(true);
              }}
              className="text-[11px] bg-slate-100 hover:bg-teal-50 hover:text-teal-800 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200 transition-colors font-medium"
            >
              👤 Demo Email (patient.demo@gmail.com)
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('phone');
                setIdentifier('5550198234');
                setOtpCode('123456');
                setOtpSent(true);
              }}
              className="text-[11px] bg-slate-100 hover:bg-teal-50 hover:text-teal-800 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200 transition-colors font-medium"
            >
              📱 Demo Phone (5550198234)
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
