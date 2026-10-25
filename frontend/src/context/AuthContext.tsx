import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type PortalRole = 'patient' | 'hospital' | 'chemist' | 'supplier' | 'admin';
export type FacilityProfile = { id: string; name: string };

export const FACILITY_PROFILES: Record<Exclude<PortalRole, 'patient' | 'admin'>, FacilityProfile[]> = {
  hospital: [
    { id: 'FAC-001', name: 'Apex Central Hospital' },
    { id: 'NET-H01', name: 'Central Civil Hospital' },
    { id: 'NET-H02', name: 'Metro Specialty' },
  ],
  chemist: [
    { id: 'FAC-003', name: 'Valley Community Clinic' },
    { id: 'NET-C01', name: 'Apollo Chemist' },
    { id: 'NET-C02', name: 'MedLife Pharmacy' },
    { id: 'NET-C03', name: 'City Care Meds' },
  ],
  supplier: [
    { id: 'FAC-006', name: 'Apex Distributors / Harbor Logistics' },
    { id: 'NET-S01', name: 'Apex Pharma Logistics' },
    { id: 'NET-S02', name: 'Zenith Drug Distributors' },
  ],
};

export type UserSession = {
  id?: number | string;
  identifier?: string;
  email?: string;
  phone?: string;
  domain?: PortalRole;
  name?: string;
  isVerified?: boolean;
};

export type AuthContextValue = {
  user: UserSession | null;
  currentRole: PortalRole | null;
  facilityId: string | null;
  facilityName: string | null;
  token: string | null;
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  loginPatient: (type: 'email' | 'phone' | 'google', identifier?: string, code?: string) => Promise<void>;
  loginInstitutionalStep1: (domain: 'hospital' | 'chemist' | 'supplier', facilityId: string, email: string, password: string) => Promise<{ demo_code: string; facility_name?: string }>;
  confirmInstitutionalCode: (domain: 'hospital' | 'chemist' | 'supplier', facilityId: string, email: string, code: string) => Promise<void>;
  loginAdmin: (email: string, password: string, pin: string) => Promise<void>;
  login: (role: PortalRole, facilityId?: string | null) => Promise<void>;
  logout: () => void;
  isDonorFor: (transfer: { donor_facility_id?: string }) => boolean;
  isAdmin: () => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const ROLE_PATH: Record<PortalRole, string> = {
  patient: '/patient',
  hospital: '/hospital',
  chemist: '/chemist',
  supplier: '/supplier',
  admin: '/admin',
};

function parseJwt(token: string): { role?: string; domain?: string; facility_id?: string; is_superadmin?: boolean; email?: string } | null {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      window.atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

function restoreSession(): {
  user: UserSession | null;
  currentRole: PortalRole | null;
  facilityId: string | null;
  facilityName: string | null;
  token: string | null;
  isSuperAdmin: boolean;
} {
  const role = localStorage.getItem('medicycle_role') as PortalRole | null;
  const token = localStorage.getItem('medicycle_token');
  const facilityId = localStorage.getItem('medicycle_facility_id');
  const facilityName = localStorage.getItem('medicycle_facility_name');
  const savedUser = localStorage.getItem('medicycle_user');

  if (!role || !['patient', 'hospital', 'chemist', 'supplier', 'admin'].includes(role)) {
    return { user: null, currentRole: null, facilityId: null, facilityName: null, token: null, isSuperAdmin: false };
  }

  // Parse claims if token is present
  let isSuperAdmin = false;
  if (token) {
    const claims = parseJwt(token);
    if (claims?.is_superadmin) {
      isSuperAdmin = true;
    }
  }

  let user: UserSession | null = null;
  if (savedUser) {
    try {
      user = JSON.parse(savedUser);
    } catch {
      user = null;
    }
  }

  return {
    user,
    currentRole: role,
    facilityId: facilityId || null,
    facilityName: facilityName || null,
    token: token || null,
    isSuperAdmin,
  };
}

function profileName(role: PortalRole | null, facilityId: string | null, customName: string | null) {
  if (customName) return customName;
  if (!role || !facilityId || role === 'patient' || role === 'admin') return null;
  return FACILITY_PROFILES[role]?.find((facility) => facility.id === facilityId)?.name ?? facilityId;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(restoreSession);

  const navigateTo = (path: string) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  // 1. Patient Login (Google 1-click or Email/Phone OTP)
  const loginPatient = useCallback(async (type: 'email' | 'phone' | 'google', identifier?: string, code?: string) => {
    let result: { access_token: string; role: string; user?: UserSession };

    if (type === 'google') {
      const res = await fetch('/api/auth/patient/google-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: identifier || 'patient.demo@gmail.com', name: 'Verified Patient' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Google Sign-In failed' }));
        throw new Error(err.detail || 'Google Sign-In failed');
      }
      result = await res.json();
    } else {
      if (!identifier || !code) throw new Error('Identifier and 6-digit OTP code are required.');
      const res = await fetch('/api/auth/patient/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, code, type }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'OTP verification failed' }));
        throw new Error(err.detail || 'Invalid or expired OTP code.');
      }
      result = await res.json();
    }

    const token = result.access_token;
    const user = result.user || { identifier, domain: 'patient' };

    localStorage.setItem('medicycle_token', token);
    localStorage.setItem('medicycle_role', 'patient');
    localStorage.removeItem('medicycle_facility_id');
    localStorage.removeItem('medicycle_facility_name');
    localStorage.setItem('medicycle_user', JSON.stringify(user));

    setSession({
      user,
      currentRole: 'patient',
      facilityId: null,
      facilityName: null,
      token,
      isSuperAdmin: false,
    });

    navigateTo('/patient');
  }, []);

  // 2. Institutional Login Step 1: Credential Verification
  const loginInstitutionalStep1 = useCallback(async (
    domain: 'hospital' | 'chemist' | 'supplier',
    facilityId: string,
    email: string,
    password: string
  ) => {
    const res = await fetch('/api/auth/institutional/step1-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facility_id: facilityId, email, password, domain }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Credential verification failed' }));
      throw new Error(err.detail || 'Institutional credentials rejected. Check Facility ID, Password, and Email.');
    }

    const data = await res.json();
    return { demo_code: data.demo_code, facility_name: data.facility_name };
  }, []);

  // 3. Institutional Login Step 2: Email Handshake Confirmation
  const confirmInstitutionalCode = useCallback(async (
    domain: 'hospital' | 'chemist' | 'supplier',
    facilityId: string,
    email: string,
    code: string
  ) => {
    const res = await fetch('/api/auth/institutional/step2-confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facility_id: facilityId, email, code }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Verification code rejected' }));
      throw new Error(err.detail || 'Invalid 6-digit verification code.');
    }

    const data = await res.json();
    const token = data.access_token;
    const facilityName = data.facility_name || facilityId;
    const user: UserSession = { email, domain, identifier: email };

    localStorage.setItem('medicycle_token', token);
    localStorage.setItem('medicycle_role', domain);
    localStorage.setItem('medicycle_facility_id', facilityId);
    localStorage.setItem('medicycle_facility_name', facilityName);
    localStorage.setItem('medicycle_user', JSON.stringify(user));

    setSession({
      user,
      currentRole: domain,
      facilityId,
      facilityName,
      token,
      isSuperAdmin: false,
    });

    navigateTo(ROLE_PATH[domain]);
  }, []);

  // 4. Master Admin Login
  const loginAdmin = useCallback(async (email: string, password: string, pin: string) => {
    const res = await fetch('/api/auth/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, pin }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Platform Owner challenge failed' }));
      throw new Error(err.detail || 'Access Denied: Master Admin credentials or PIN invalid.');
    }

    const data = await res.json();
    const token = data.access_token;
    const user: UserSession = { email, domain: 'admin', identifier: email, isVerified: true };

    localStorage.setItem('medicycle_token', token);
    localStorage.setItem('medicycle_role', 'admin');
    localStorage.removeItem('medicycle_facility_id');
    localStorage.setItem('medicycle_facility_name', 'Network Operations Center');
    localStorage.setItem('medicycle_user', JSON.stringify(user));

    setSession({
      user,
      currentRole: 'admin',
      facilityId: null,
      facilityName: 'Network Operations Center',
      token,
      isSuperAdmin: true,
    });

    navigateTo('/admin');
  }, []);

  // 5. Legacy / Demo Quick Login Fallback
  const login = useCallback(async (role: PortalRole, facilityId: string | null = null) => {
    if (role === 'patient') {
      await loginPatient('google');
      return;
    }
    if (role === 'admin') {
      await loginAdmin('admin@medicycle.gov', 'AdminMaster@2026', '990011');
      return;
    }

    // Default institutional demo sign-in
    const credsMap: Record<'hospital' | 'chemist' | 'supplier', { fid: string; email: string; pass: string }> = {
      hospital: { fid: facilityId || 'FAC-001', email: 'pharmacy@centralhospital.org', pass: 'Hospital@2026' },
      chemist: { fid: facilityId || 'FAC-003', email: 'dispensary@apollochemist.com', pass: 'Chemist@2026' },
      supplier: { fid: facilityId || 'FAC-006', email: 'orders@apexdistributors.com', pass: 'Supplier@2026' },
    };

    const target = credsMap[role];
    const s1 = await loginInstitutionalStep1(role, target.fid, target.email, target.pass);
    await confirmInstitutionalCode(role, target.fid, target.email, s1.demo_code);
  }, [loginPatient, loginAdmin, loginInstitutionalStep1, confirmInstitutionalCode]);

  // Logout / Switch Portal
  const logout = useCallback(() => {
    localStorage.removeItem('medicycle_token');
    localStorage.removeItem('medicycle_role');
    localStorage.removeItem('medicycle_facility_id');
    localStorage.removeItem('medicycle_facility_name');
    localStorage.removeItem('medicycle_user');
    localStorage.removeItem('medicycle-network-token');
    localStorage.removeItem('medicycle-network-role');

    setSession({
      user: null,
      currentRole: null,
      facilityId: null,
      facilityName: null,
      token: null,
      isSuperAdmin: false,
    });

    navigateTo('/portal');
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user: session.user,
    currentRole: session.currentRole,
    facilityId: session.facilityId,
    facilityName: profileName(session.currentRole, session.facilityId, session.facilityName),
    token: session.token,
    isAuthenticated: Boolean(session.currentRole && (session.currentRole === 'patient' || session.token)),
    isSuperAdmin: session.isSuperAdmin,
    loginPatient,
    loginInstitutionalStep1,
    confirmInstitutionalCode,
    loginAdmin,
    login,
    logout,
    isDonorFor: (transfer) => ['hospital', 'chemist'].includes(session.currentRole || '')
      && transfer.donor_facility_id === session.facilityId,
    isAdmin: () => session.currentRole === 'admin' || session.isSuperAdmin,
  }), [session, loginPatient, loginInstitutionalStep1, confirmInstitutionalCode, loginAdmin, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
