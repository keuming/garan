import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { Layout } from './components/Layout.jsx';
import { Login } from './pages/Login.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { Organizations } from './pages/Organizations.jsx';
import { OrganizationDetail } from './pages/OrganizationDetail.jsx';
import { ImeiSearch } from './pages/ImeiSearch.jsx';
import { TheftReports } from './pages/TheftReports.jsx';
import { Alerts } from './pages/Alerts.jsx';
import { Catalog } from './pages/Catalog.jsx';
import { Admins } from './pages/Admins.jsx';
import { AuditLog } from './pages/AuditLog.jsx';
import { Profile } from './pages/Profile.jsx';
import { Sales } from './pages/Sales.jsx';
import { PublicCertificate } from './pages/PublicCertificate.jsx';
import { PublicCheck } from './pages/PublicCheck.jsx';

const READERS = ['superadmin', 'admin', 'support'];
const INVESTIGATORS = ['superadmin', 'admin', 'police'];

function Protected({ roles, children }) {
  const { admin, ready, can } = useAuth();
  const location = useLocation();
  if (!ready) return <div className="empty">Chargement…</div>;
  if (!admin) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && !can(...roles)) return <div className="empty">Accès réservé.</div>;
  return children;
}

export function App() {
  return (
    <Routes>
      {/* Pages publiques */}
      <Route path="/v/:code" element={<PublicCertificate />} />
      <Route path="/verifier" element={<PublicCheck />} />
      <Route path="/login" element={<Login />} />

      {/* Back-office */}
      <Route element={<Protected><Layout /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="profil" element={<Profile />} />
        <Route path="organisations" element={<Protected roles={READERS}><Organizations /></Protected>} />
        <Route path="organisations/:id" element={<Protected roles={READERS}><OrganizationDetail /></Protected>} />
        <Route path="imei" element={<Protected roles={INVESTIGATORS}><ImeiSearch /></Protected>} />
        <Route path="imei/:imei" element={<Protected roles={INVESTIGATORS}><ImeiSearch /></Protected>} />
        <Route path="ventes" element={<Protected roles={INVESTIGATORS}><Sales /></Protected>} />
        <Route path="declarations" element={<TheftReports />} />
        <Route path="alertes" element={<Protected roles={INVESTIGATORS}><Alerts /></Protected>} />
        <Route path="catalogue" element={<Catalog />} />
        <Route path="administrateurs" element={<Protected roles={['superadmin']}><Admins /></Protected>} />
        <Route path="journal" element={<Protected roles={['superadmin']}><AuditLog /></Protected>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
