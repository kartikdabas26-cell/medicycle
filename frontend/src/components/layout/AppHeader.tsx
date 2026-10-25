import { useState } from 'react';
import { ArrowLeftRight, Bell, HeartPulse, LogOut, Pill } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAppContext } from '../../context/AppContext';

const PORTAL_LABELS = {
  patient: 'PATIENT DIRECT',
  hospital: 'HOSPITAL & CLINICAL PORTAL',
  chemist: 'RETAIL CHEMIST PORTAL',
  supplier: 'SUPPLIER & DISTRIBUTOR PORTAL',
  admin: 'HEALTH AUTHORITY CORE',
} as const;

export function AppHeader({ notificationCount = 0 }: { notificationCount?: number }) {
  const { currentRole, facilityId, facilityName, user, isSuperAdmin, logout } = useAuth();
  const { notifications } = useAppContext();
  const [showNotifications, setShowNotifications] = useState(false);
  if (!currentRole) return null;

  const profileBadge = isSuperAdmin
    ? 'Platform Owner (Master Admin)'
    : facilityId
    ? `${facilityId} (${facilityName || 'Institutional'})`
    : user?.identifier
    ? `Patient (${user.identifier})`
    : 'Patient & Family';

  return (
    <header className="portal-app-header">
      <a className="portal-brand" href={`/${currentRole}`} aria-label="MediCycle home">
        <span className="portal-brand-mark"><Pill size={20} /></span>
        <span><b>MEDI<span>CYCLE</span></b><small>{PORTAL_LABELS[currentRole]}</small></span>
      </a>
      <nav className="portal-header-nav" aria-label={`${currentRole} portal navigation`}>
        {currentRole === 'patient' ? (
          <a href="/patient"><HeartPulse size={16} /> Medicine access</a>
        ) : currentRole === 'admin' ? (
          <>
            <a href="/admin">Command center</a><a href="/redistribution"><ArrowLeftRight size={15} /> Transfers</a><a href="/analytics">Savings</a>
          </>
        ) : currentRole === 'supplier' ? (
          <>
            <a href="/supplier">Workspace</a><a href="/orders">Orders</a><a href="/marketplace">Catalog</a>
          </>
        ) : (
          <>
            <a href={`/${currentRole}`}>Workspace</a><a href="/inventory">My inventory</a>
            <a href="/redistribution"><ArrowLeftRight size={15} /> Transfers</a>
            <a href="/orders">Orders</a>
          </>
        )}
      </nav>
      <div className="portal-header-actions">
        <div className="portal-notification-wrap">
          <button className="portal-notification" aria-label={`${notificationCount} notifications`} aria-expanded={showNotifications}
            onClick={() => setShowNotifications((isOpen) => !isOpen)}><Bell size={17} />{notificationCount > 0 && <i>{notificationCount}</i>}</button>
          {showNotifications && <aside className="portal-notification-menu" aria-label="Patient notifications">
            <strong>Medicine care alerts</strong>
            {notifications.slice(0, 4).map((notification) => <article key={notification.id}>
              <span className={`portal-alert-dot ${notification.severity}`} />
              <div><b>{notification.title}</b><small>{notification.message}</small></div>
            </article>)}
            {notifications.length === 0 && <p>No new alerts.</p>}
          </aside>}
        </div>
        <span className="portal-profile" title={profileBadge}>{profileBadge}</span>
        <button className="portal-switch-button" onClick={logout} title="Clear session and return to Intent Gateway">
          <LogOut size={15} />
          <span>Log Out / Switch Portal</span>
        </button>
      </div>
    </header>
  );
}
