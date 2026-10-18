import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, ErrorBox, Field, Modal } from '../components/ui.jsx';
import { date, dateTime, fcfa, LABELS, num } from '../format.js';

function PaymentForm({ orgId, onDone }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ amount: '', months: '1', method: 'mobile_money', reference: '' });
  const m = useMutation({
    mutationFn: () => api.post(`/admin/organizations/${orgId}/payments`, { ...form, amount: Number(form.amount), months: Number(form.months) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['organization', orgId] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onDone();
    }
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ErrorBox error={m.error} />
      <div className="form-row">
        <Field label="Montant (FCFA)" id="amount"><input id="amount" className="input" inputMode="numeric" required value={form.amount} onChange={set('amount')} /></Field>
        <Field label="Durée (mois)" id="months"><input id="months" className="input" type="number" min="1" max="36" required value={form.months} onChange={set('months')} /></Field>
      </div>
      <div className="form-row">
        <Field label="Moyen de paiement" id="method">
          <select id="method" className="input" value={form.method} onChange={set('method')}>
            {Object.entries(LABELS.method).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Référence" id="reference"><input id="reference" className="input" value={form.reference} onChange={set('reference')} /></Field>
      </div>
      <p className="muted small" style={{ margin: 0 }}>L’abonnement est activé et prolongé à partir de l’échéance actuelle (ou d’aujourd’hui si elle est dépassée).</p>
      <button className="btn" type="submit" disabled={m.isPending}>{m.isPending ? 'Enregistrement…' : 'Enregistrer le paiement'}</button>
    </form>
  );
}

function SettingsForm({ org, onDone }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    status: org.status,
    plan: org.plan,
    max_shops: String(org.max_shops),
    subscription_expires_at: org.subscription_expires_at ? org.subscription_expires_at.slice(0, 10) : ''
  });
  const m = useMutation({
    mutationFn: () =>
      api.patch(`/admin/organizations/${org.id}`, {
        status: form.status,
        plan: form.plan,
        max_shops: Number(form.max_shops),
        subscription_expires_at: form.subscription_expires_at ? `${form.subscription_expires_at}T23:59:59Z` : null
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['organization', org.id] });
      onDone();
    }
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ErrorBox error={m.error} />
      <div className="form-row">
        <Field label="Statut" id="status">
          <select id="status" className="input" value={form.status} onChange={set('status')}>
            {Object.entries(LABELS.orgStatus).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Formule" id="plan"><input id="plan" className="input" value={form.plan} onChange={set('plan')} /></Field>
      </div>
      <div className="form-row">
        <Field label="Magasins autorisés" id="max_shops"><input id="max_shops" className="input" type="number" min="1" value={form.max_shops} onChange={set('max_shops')} /></Field>
        <Field label="Échéance" id="exp"><input id="exp" className="input" type="date" value={form.subscription_expires_at} onChange={set('subscription_expires_at')} /></Field>
      </div>
      <button className="btn" type="submit" disabled={m.isPending}>Enregistrer</button>
    </form>
  );
}

export function OrganizationDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const [modal, setModal] = useState(null);
  const { data: o, error, isLoading } = useQuery({ queryKey: ['organization', id], queryFn: () => api.get(`/admin/organizations/${id}`) });

  if (isLoading) return <div className="empty">Chargement…</div>;
  if (error) return <ErrorBox error={error} />;

  const stat = (type) => o.stats_30d.find((s) => s.type === type) ?? { count: 0, amount: 0 };
  const staff = can('superadmin', 'admin');

  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/organisations" className="small">← Clients</Link>
          <h1 style={{ marginTop: 6 }}>{o.name} <Badge kind="orgStatus" value={o.status} /></h1>
          <p>{o.city}, {o.district} · {o.country}</p>
        </div>
        {staff ? (
          <div className="toolbar">
            <button className="btn secondary" type="button" onClick={() => setModal('settings')}>Modifier l’abonnement</button>
            <button className="btn" type="button" onClick={() => setModal('payment')}>Enregistrer un paiement</button>
          </div>
        ) : null}
      </div>

      <div className="kpis">
        <div className="card kpi"><div className="label">Ventes 30 j</div><div className="value">{num(stat('sale').count)}</div><div className="hint">{fcfa(stat('sale').amount)}</div></div>
        <div className="card kpi"><div className="label">Rachats 30 j</div><div className="value">{num(stat('purchase').count)}</div><div className="hint">{fcfa(stat('purchase').amount)}</div></div>
        <div className="card kpi"><div className="label">Entrées en stock 30 j</div><div className="value">{num(stat('stock_in').count)}</div></div>
        <div className="card kpi"><div className="label">Échéance</div><div className="value" style={{ fontSize: 20 }}>{date(o.subscription_expires_at)}</div><div className="hint">Formule {o.plan} · {o.max_shops} magasin(s)</div></div>
      </div>

      <div className="two-col">
        <div className="card">
          <h2>Informations</h2>
          <dl className="dl">
            <dt>Téléphone</dt><dd>{o.phone}</dd>
            <dt>E-mail</dt><dd>{o.email || '—'}</dd>
            <dt>RCCM</dt><dd>{o.rccm || '—'}</dd>
            <dt>Inscrit le</dt><dd>{dateTime(o.created_at)}</dd>
          </dl>
        </div>
        <div className="card">
          <h2>Paiements</h2>
          {o.payments.length ? (
            <table>
              <tbody>
                {o.payments.map((p) => (
                  <tr key={p.id}>
                    <td>{date(p.paid_at)}<div className="muted small">{LABELS.method[p.method]} {p.reference ? `· ${p.reference}` : ''}</div></td>
                    <td className="num">{fcfa(p.amount)}<div className="muted small">{p.months} mois</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="empty">Aucun paiement</div>}
        </div>
      </div>

      <div className="card">
        <h2>Magasins ({o.shops.length})</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Magasin</th><th>Contact</th><th>Localisation</th><th>Statut</th></tr></thead>
            <tbody>
              {o.shops.map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong><div className="muted small">RCCM {s.rccm || '—'}</div></td>
                  <td>{s.phone}<div className="muted small">{s.email || ''}</div></td>
                  <td>{s.city}, {s.district}</td>
                  <td><span className={`badge ${s.status === 'active' ? 'ok' : 'muted'}`}>{s.status === 'active' ? 'Actif' : 'Désactivé'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Comptes utilisateurs ({o.users.length})</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nom</th><th>Identifiant</th><th>Rôle</th><th>Magasin</th><th>Dernière connexion</th></tr></thead>
            <tbody>
              {o.users.map((u) => (
                <tr key={u.id}>
                  <td>{u.full_name} {u.status !== 'active' ? <span className="badge muted">Désactivé</span> : null}</td>
                  <td className="mono">{u.phone}</td>
                  <td>{u.role === 'owner' ? 'Compte principal' : 'Agent'}</td>
                  <td>{u.shop_name || 'Tous'}</td>
                  <td>{dateTime(u.last_login_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal === 'payment' ? <Modal title="Enregistrer un paiement" onClose={() => setModal(null)}><PaymentForm orgId={o.id} onDone={() => setModal(null)} /></Modal> : null}
      {modal === 'settings' ? <Modal title="Abonnement" onClose={() => setModal(null)}><SettingsForm org={o} onDone={() => setModal(null)} /></Modal> : null}
    </>
  );
}
