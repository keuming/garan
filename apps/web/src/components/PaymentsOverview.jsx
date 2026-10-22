import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { ErrorBox } from './ui.jsx';

const nf = new Intl.NumberFormat('fr-FR');
const fcfa = (n) => `${nf.format(Math.round(Number(n) || 0))} FCFA`;
const num = (n) => nf.format(Number(n) || 0);

const PURPOSE = { subscription_consumer: 'Abonnement usager', subscription_merchant: 'Abonnement marchand' };
const SUBJECT = { consumer: 'Usager', organization: 'Marchand' };
const METHOD = { cash: 'Espèces', mobile_money: 'Mobile Money', bank: 'Banque', other: 'Autre' };
const TONE = { ok: '#0f8a5f', warn: '#a35c00', danger: '#c4282d', info: '#1565f0' };

function Tile({ label, value, hint, tone }) {
  return (
    <div className="card" style={{ borderLeft: `4px solid ${TONE[tone] ?? '#8aa096'}`, minWidth: 0 }}>
      <div className="muted small">{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.2, margin: '4px 0' }}>{value}</div>
      {hint ? <div className="muted small">{hint}</div> : null}
    </div>
  );
}

const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 16 };

/**
 * Abonnements et paiements : comptes payés / non payés (usagers et marchands),
 * encaissements, paiements ORZAYAH par nature de frais, solde du compte ORZAYAH.
 * Réservé aux rôles superadmin et admin (l'API refuse les autres).
 */
export function PaymentsOverview() {
  const { data, error } = useQuery({
    queryKey: ['payments-overview'],
    queryFn: () => api.get('/admin/payments/overview'),
    refetchInterval: 60_000
  });
  const { data: bal } = useQuery({
    queryKey: ['orzayah-balance'],
    queryFn: () => api.get('/admin/orzayah/balance'),
    refetchInterval: 120_000
  });

  if (error) return <ErrorBox error={error} />;
  if (!data) return <div className="empty">Chargement des paiements…</div>;

  const a = data.accounts;
  const t = data.totals;
  const notCredited = data.payments.reduce((s, p) => s + p.paid_not_credited, 0);
  const consumerUnpaid = a.consumers_total - a.consumers_paid;
  const orgUnpaid = a.orgs_trial + a.orgs_expired;

  return (
    <section style={{ marginTop: 28 }}>
      <div className="section-head">
        <h2>Abonnements et paiements</h2>
        <span className="muted small">Mis à jour toutes les minutes</span>
      </div>

      {notCredited > 0 ? (
        <div className="card" style={{ borderLeft: `4px solid ${TONE.danger}`, marginBottom: 12 }}>
          <strong>{notCredited} paiement(s) confirmé(s) chez ORZAYAH mais non crédité(s).</strong>{' '}
          <span className="small">L’abonnement sera crédité à la prochaine ouverture de l’application du client.</span>
        </div>
      ) : null}

      <div style={grid}>
        <Tile
          label="Solde du compte ORZAYAH gaRAN"
          value={bal?.configured ? fcfa(bal.balance) : 'Non disponible'}
          hint={bal?.configured ? (bal.is_frozen ? 'Compte gelé' : 'Encaissements d’abonnements et de ventes') : 'Clé API ORZAYAH non configurée ou service injoignable'}
          tone={bal?.configured ? 'ok' : 'warn'}
        />
        <Tile label="Frais d’abonnement encaissés (total)" value={fcfa(t.collected_fcfa)} hint="Marchands (tous modes) + usagers (ORZAYAH)" tone="ok" />
        <Tile label="Encaissé ce mois (marchands)" value={fcfa(data.merchant_revenue.month_fcfa)} hint={`${num(data.merchant_revenue.count)} paiement(s) enregistré(s) au total`} tone="info" />
        <Tile label="En attente de paiement" value={fcfa(t.pending_fcfa)} hint={`${num(t.pending_count)} lien(s) / demande(s) non réglé(s)`} tone="warn" />
      </div>

      <h3>Usagers</h3>
      <div style={grid}>
        <Tile label="Comptes usagers" value={num(a.consumers_total)} />
        <Tile label="Abonnement payé (actif)" value={num(a.consumers_paid)} hint={`${num(a.consumers_expiring)} expire(nt) sous 7 jours`} tone="ok" />
        <Tile label="Abonnement non payé" value={num(consumerUnpaid)} hint={`${num(a.consumers_never)} jamais abonné(s) · ${num(a.consumers_expired)} expiré(s)`} tone="danger" />
        <Tile label="Paiement en cours" value={num(a.consumers_pending)} hint="Comptes avec un paiement non encore confirmé" tone="warn" />
      </div>

      <h3>Marchands</h3>
      <div style={grid}>
        <Tile label="Comptes marchands" value={num(a.orgs_total)} />
        <Tile label="Abonnement payé (actif)" value={num(a.orgs_active)} hint={`${num(a.orgs_expiring)} expire(nt) sous 7 jours`} tone="ok" />
        <Tile label="Abonnement non payé" value={num(orgUnpaid)} hint={`${num(a.orgs_trial)} en essai gratuit · ${num(a.orgs_expired)} expiré(s)`} tone="danger" />
        <Tile label="Suspendus" value={num(a.orgs_suspended)} tone="warn" />
        <Tile label="Paiement en cours" value={num(a.orgs_pending)} hint="Comptes avec un paiement non encore confirmé" tone="warn" />
      </div>

      <h3>Paiements ORZAYAH par nature de frais</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Nature</th><th>Payés</th><th>En attente</th><th>Échoués</th><th>Confirmés non crédités</th><th>Encaissé</th><th>En attente (montant)</th></tr>
          </thead>
          <tbody>
            {data.payments.map((p) => (
              <tr key={`${p.purpose}-${p.subject_type}`}>
                <td>{PURPOSE[p.purpose] ?? p.purpose}<div className="muted small">{SUBJECT[p.subject_type] ?? p.subject_type}</div></td>
                <td>{num(p.paid)}</td>
                <td>{num(p.pending)}</td>
                <td>{num(p.failed)}</td>
                <td>{p.paid_not_credited ? <span className="badge danger">{num(p.paid_not_credited)}</span> : 0}</td>
                <td>{fcfa(p.collected_fcfa)}</td>
                <td>{fcfa(p.pending_fcfa)}</td>
              </tr>
            ))}
            {!data.payments.length ? <tr><td colSpan={7} className="empty">Aucun paiement ORZAYAH enregistré</td></tr> : null}
          </tbody>
        </table>
      </div>

      <h3 style={{ marginTop: 16 }}>Encaissements marchands enregistrés, par mode</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Mode</th><th>Paiements</th><th>Montant</th></tr></thead>
          <tbody>
            {data.merchant_revenue.by_method.map((m) => (
              <tr key={m.method}><td>{METHOD[m.method] ?? m.method}</td><td>{num(m.count)}</td><td>{fcfa(m.total_fcfa)}</td></tr>
            ))}
            {!data.merchant_revenue.by_method.length ? <tr><td colSpan={3} className="empty">Aucun encaissement</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
