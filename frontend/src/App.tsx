import { useEffect, useState } from 'react';
import { AppProvider, useAppContext } from './context/AppContext';
import { AuthProvider, useAuth, type PortalRole } from './context/AuthContext';
import { AppHeader } from './components/layout/AppHeader';
import { PatientMarketplace } from './components/patient/PatientMarketplace';
import { PortalSelectPage } from './pages/PortalSelectPage';
import { PatientLoginPage } from './pages/auth/PatientLoginPage';
import { InstitutionalLoginPage } from './pages/auth/InstitutionalLoginPage';
import { AdminLoginPage } from './pages/auth/AdminLoginPage';
import { NetworkDashboard } from './NetworkDashboard';

const ROLE_HOME: Record<PortalRole, string> = {
  patient: '/patient',
  hospital: '/hospital',
  chemist: '/chemist',
  supplier: '/supplier',
  admin: '/admin',
};

const ROLE_ROUTES: Record<PortalRole, string[]> = {
  patient: ['/patient'],
  hospital: ['/hospital', '/inventory', '/redistribution', '/marketplace', '/orders'],
  chemist: ['/chemist', '/inventory', '/redistribution', '/marketplace', '/orders'],
  supplier: ['/supplier', '/marketplace', '/orders'],
  admin: ['/admin', '/inventory', '/redistribution', '/marketplace', '/orders', '/analytics', '/alerts'],
};

function PortalRouter() {
  const { currentRole, facilityId, isSuperAdmin } = useAuth();
  const { notifications } = useAppContext();
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const updatePath = () => setPath(window.location.pathname);
    window.addEventListener('popstate', updatePath);
    return () => window.removeEventListener('popstate', updatePath);
  }, []);

  // Public Dedicated Authentication Gateways
  if (path === '/login/patient') return <PatientLoginPage />;
  if (path === '/login/hospital') return <InstitutionalLoginPage domain="hospital" />;
  if (path === '/login/chemist') return <InstitutionalLoginPage domain="chemist" />;
  if (path === '/login/supplier') return <InstitutionalLoginPage domain="supplier" />;
  if (path === '/login/admin') return <AdminLoginPage />;
  if (path === '/portal') return <PortalSelectPage />;

  // Protected Route Guards
  // 1. Not Authenticated
  if (!currentRole) {
    if (path === '/patient') return <PatientLoginPage />;
    if (path === '/hospital') return <InstitutionalLoginPage domain="hospital" />;
    if (path === '/chemist') return <InstitutionalLoginPage domain="chemist" />;
    if (path === '/supplier') return <InstitutionalLoginPage domain="supplier" />;
    if (path === '/admin') return <AdminLoginPage />;
    return <PortalSelectPage />;
  }

  // 2. Master Admin Portal Guard: strictly requires isSuperAdmin === true
  if (currentRole === 'admin') {
    if (!isSuperAdmin) {
      return <AdminLoginPage />;
    }
  }

  // 3. Institutional or Patient Role Routing Guards
  if (currentRole === 'patient') {
    if (path !== '/patient') {
      window.history.replaceState({}, '', '/patient');
    }
    return (
      <div className="patient-portal-shell">
        <AppHeader notificationCount={notifications.filter((notification) => !notification.read).length} />
        <main className="patient-portal-content">
          <PatientMarketplace />
        </main>
      </div>
    );
  }

  // Institutional or Admin Role
  const allowedRoutes = ROLE_ROUTES[currentRole];
  if (!allowedRoutes.includes(path) && path !== '/') {
    window.history.replaceState({}, '', ROLE_HOME[currentRole]);
  }

  return <NetworkDashboard key={`${currentRole}:${facilityId || 'network'}`} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <PortalRouter />
      </AppProvider>
    </AuthProvider>
  );
}
