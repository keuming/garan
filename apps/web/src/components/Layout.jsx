import { NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { LABELS } from '../format.js';
import { Wordmark } from './ui.jsx';

export function Layout() {
  const { admin, logout, can } = useAuth();
  const { data: dash } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get('/admin/dashboard'), refetchInterval: 60_000 });

  const links = [
    { to: '/', label: 'Tableau de bord', end: true, show: true },
    { to: '/organisations', label: 'Clients', show: can('superadmin', 'admin', 'support') },
    { to: '/imei', label: 'Recherche IMEI', show: can('superadmin', 'admin', 'police') },
    { to: '/ventes', label: 'Téléphones vendus', show: can('superadmin', 'admin', 'police') },
    { to: '/declarations', label: 'Déclarations de vol', count: dash?.theft_reports_pending, show: true },
    { to: '/alertes', label: 'Alertes', count: dash?.alerts_open, show: can('superadmin', 'admin', 'police') },
    { to: '/catalogue', label: 'Marques & modèles', show: true },
    { to: '/administrateurs', label: 'Administrateurs', show: can('superadmin') },
    { to: '/journal', label: 'Journal d’audit', show: can('superadmin') }
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/garan-icone-192.png" alt="" />
          <Wordmark />
        </div>
        <nav className="nav" aria-label="Navigation principale">
          {links
            .filter((l) => l.show)
            .map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end}>
                {l.label}
                {l.count ? <span className="count">{l.count}</span> : null}
              </NavLink>
            ))}
        </nav>
        <div className="me">
          <NavLink to="/profil" style={{ color: '#fff', textDecoration: 'none' }}>
            <strong>{admin.full_name}</strong>
          </NavLink>
          {LABELS.role[admin.role]} · <NavLink to="/profil" style={{ color: '#c9d4ea' }}>Mon profil</NavLink>
          <div style={{ marginTop: 8 }}>
            <button className="btn secondary small" type="button" onClick={logout}>
              Se déconnecter
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
