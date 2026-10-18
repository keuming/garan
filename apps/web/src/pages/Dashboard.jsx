import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorBox } from '../components/ui.jsx';
import { fcfa, num } from '../format.js';

function Kpi({ label, value, hint, to }) {
  const body = (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
  return to ? <Link to={to} style={{ textDecoration: 'none', color: 'inherit' }}>{body}</Link> : body;
}

export function Dashboard() {
  const { data: d, error, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get('/admin/dashboard') });
  if (isLoading) return <div className="empty">Chargement…</div>;
  if (error) return <ErrorBox error={error} />;

  const max = Math.max(1, ...d.daily.map((x) => x.sales + x.purchases));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tableau de bord</h1>
          <p>Activité du réseau gaRAN</p>
        </div>
      </div>

      <div className="kpis">
        <Kpi label="Clients" value={num(d.organizations)} hint={`${num(d.organizations_active)} actif(s) · ${num(d.organizations_trial)} en essai`} to="/organisations" />
        <Kpi label="Magasins actifs" value={num(d.shops)} />
        <Kpi label="Abonnements à échéance (7 j)" value={num(d.expiring_soon)} to="/organisations" />
        <Kpi label="Encaissements du mois" value={fcfa(d.revenue_month)} />
        <Kpi label="Téléphones enregistrés" value={num(d.devices)} hint={`${num(d.devices_reported)} signalés`} />
        <Kpi label="Opérations aujourd’hui" value={num(d.transactions_today)} hint={`${num(d.transactions_30d)} sur 30 jours`} />
        <Kpi label="Ventes (30 j)" value={fcfa(d.sales_amount_30d)} hint="Montant déclaré par les boutiques" />
        <Kpi label="À traiter" value={num(d.theft_reports_pending + d.alerts_open)} hint={`${num(d.theft_reports_pending)} déclarations · ${num(d.alerts_open)} alertes`} to="/declarations" />
      </div>

      <div className="card">
        <h2>Opérations des 14 derniers jours</h2>
        <div className="bars" role="img" aria-label="Ventes et rachats par jour sur 14 jours">
          {d.daily.map((x) => (
            <div className="col" key={x.day} title={`${x.day} : ${x.sales} ventes, ${x.purchases} rachats`}>
              <div className="stack" style={{ height: `${((x.sales + x.purchases) / max) * 100}%` }}>
                <div className="s" style={{ flex: x.sales }} />
                <div className="p" style={{ flex: x.purchases }} />
              </div>
              <span className="d">{x.day.slice(8)}</span>
            </div>
          ))}
        </div>
        <div className="legend">
          <span><i style={{ background: 'var(--blue)' }} />Ventes</span>
          <span><i style={{ background: 'var(--navy)' }} />Rachats</span>
        </div>
      </div>
    </>
  );
}
