import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, ErrorBox, Field, Modal } from '../components/ui.jsx';
import { AccountFields, EMPTY_ACCOUNT, ShopFields, clean } from '../components/forms.jsx';
import { EMPTY_ORG, OrgFields } from './Organizations.jsx';
import { date, dateTime, fcfa, LABELS, num } from '../format.js';

/* ----------------------------- Formulaires ----------------------------- */

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
      <p className="muted small" style={{ margin: 0 }}>L’abonnement de ce client est activé et prolongé à partir de son échéance actuelle.</p>
      <button className="btn" type="submit" disabled={m.isPending}>Enregistrer le paiement</button>
    </form>
  );
}

/** Modifie l'entreprise, le type de client et l'abonnement. */
function OrgForm({ org, onDone }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    type: org.type, name: org.name, rccm: org.rccm ?? '', email: org.email ?? '', phone: org.phone,
    country: org.country, city: org.city, district: org.district, status: org.status, plan: org.plan,
    subscription_expires_at: org.subscription_expires_at ? org.subscription_expires_at.slice(0, 10) : ''
  });
  const m = useMutation({
    mutationFn: () =>
      api.patch(`/admin/organizations/${org.id}`, {
        ...clean(f),
        subscription_expires_at: f.subscription_expires_at ? `${f.subscription_expires_at}T23:59:59Z` : null
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['organization', org.id] });
      qc.invalidateQueries({ queryKey: ['organizations'] });
      onDone();
    }
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ErrorBox error={m.error} />
      <div className="form-row">
        <Field label="Type de client" id="f-type">
          <select id="f-type" className="input" value={f.type} onChange={set('type')}>
            {Object.entries(LABELS.orgType).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Nom" id="f-name"><input id="f-name" className="input" required value={f.name} onChange={set('name')} /></Field>
        <Field label="RCCM" id="f-rccm"><input id="f-rccm" className="input" value={f.rccm} onChange={set('rccm')} /></Field>
      </div>
      <div className="form-row">
        <Field label="Contact" id="f-phone"><input id="f-phone" className="input" type="tel" required value={f.phone} onChange={set('phone')} /></Field>
        <Field label="E-mail" id="f-email"><input id="f-email" className="input" type="email" value={f.email} onChange={set('email')} /></Field>
      </div>
      <div className="form-row">
        <Field label="Ville" id="f-city"><input id="f-city" className="input" value={f.city} onChange={set('city')} /></Field>
        <Field label="Quartier" id="f-district"><input id="f-district" className="input" value={f.district} onChange={set('district')} /></Field>
      </div>
      <h3>Abonnement</h3>
      <div className="form-row">
        <Field label="Statut" id="f-status">
          <select id="f-status" className="input" value={f.status} onChange={set('status')}>
            {Object.entries(LABELS.orgStatus).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Formule" id="f-plan"><input id="f-plan" className="input" value={f.plan} onChange={set('plan')} /></Field>
        <Field label="Échéance" id="f-exp"><input id="f-exp" className="input" type="date" value={f.subscription_expires_at} onChange={set('subscription_expires_at')} /></Field>
      </div>
      {f.status === 'suspended' && org.status !== 'suspended' ? <div className="alert warn">La suspension déconnecte immédiatement tous les comptes de ce client.</div> : null}
      <button className="btn" type="submit" disabled={m.isPending}>Enregistrer</button>
    </form>
  );
}

/** Nouveau sous-marchand : un marchand complet (boutique + compte + abonnement) rattaché au super marchand. */
function SubMerchantForm({ superId, onDone }) {
  const qc = useQueryClient();
  const [org, setOrg] = useState(EMPTY_ORG);
  const [owner, setOwner] = useState(EMPTY_ACCOUNT);
  const m = useMutation({
    mutationFn: () => api.post(`/admin/organizations/${superId}/sub-merchants`, { ...clean(org), owner }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['organization', superId] });
      qc.invalidateQueries({ queryKey: ['organizations'] });
      onDone();
    }
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ErrorBox error={m.error} />
      <p className="muted small" style={{ margin: 0 }}>Le sous-marchand est un client à part entière : il a son propre abonnement, facturé séparément.</p>
      <h3>Boutique</h3>
      <OrgFields value={org} onChange={setOrg} prefix="sm" merchantLabel="Nom de la boutique" />
      <h3>Compte de connexion (app Magasin)</h3>
      <AccountFields value={owner} onChange={setOwner} prefix="sma" />
      <button className="btn" type="submit" disabled={m.isPending}>Créer le sous-marchand</button>
    </form>
  );
}

function ShopEditForm({ shop, orgId, onDone }) {
  const qc = useQueryClient();
  const [s, setS] = useState(Object.fromEntries(Object.entries(shop).map(([k, v]) => [k, v ?? ''])));
  const m = useMutation({
    mutationFn: () => {
      const { name, phone, email, rccm, country, city, district, address } = s;
      return api.patch(`/admin/shops/${shop.id}`, clean({ name, phone, email, rccm, country, city, district, address }));
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['organization', orgId] }); onDone(); }
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ErrorBox error={m.error} />
      <ShopFields value={s} onChange={setS} prefix="es" />
      <button className="btn" type="submit" disabled={m.isPending}>Enregistrer</button>
    </form>
  );
}

/** Ajout/modification d'un compte vendeur (login, nom, PIN). */
function UserForm({ orgId, shopId, user, onDone }) {
  const qc = useQueryClient();
  const [a, setA] = useState(user ? { full_name: user.full_name, phone: user.phone, pin: '' } : EMPTY_ACCOUNT);
  const m = useMutation({
    mutationFn: () =>
      user
        ? api.patch(`/admin/users/${user.id}`, {
            full_name: a.full_name !== user.full_name ? a.full_name : undefined,
            phone: a.phone !== user.phone ? a.phone : undefined,
            pin: a.pin || undefined
          })
        : api.post(`/admin/shops/${shopId}/users`, a),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['organization', orgId] }); onDone(); }
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ErrorBox error={m.error} />
      <AccountFields value={a} onChange={setA} prefix="u" pinLabel={user ? 'Nouveau PIN (laisser vide pour garder)' : 'Code PIN (4 chiffres)'} pinRequired={!user} />
      {user ? <p className="muted small" style={{ margin: 0 }}>Changer le login ou le PIN déconnecte ce compte de tous ses appareils.</p> : null}
      <button className="btn" type="submit" disabled={m.isPending}>{user ? 'Enregistrer' : 'Créer le compte'}</button>
    </form>
  );
}

/* -------------------------------- Page -------------------------------- */

export function OrganizationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { can } = useAuth();
  const staff = can('superadmin', 'admin');
  const [modal, setModal] = useState(null);
  const [actionError, setActionError] = useState(null);
  const { data: o, error, isLoading } = useQuery({ queryKey: ['organization', id], queryFn: () => api.get(`/admin/organizations/${id}`) });

  const refresh = () => qc.invalidateQueries({ queryKey: ['organization', id] });
  const act = useMutation({
    mutationFn: ({ fn }) => fn(),
    onMutate: () => setActionError(null),
    onSuccess: (_r, { after }) => (after ? after() : refresh()),
    onError: (e) => setActionError(e)
  });
  const confirmDo = (message, fn, after) => window.confirm(message) && act.mutate({ fn, after });

  if (isLoading) return <div className="empty">Chargement…</div>;
  if (error) return <ErrorBox error={error} />;

  const isSuper = o.type === 'super_merchant';
  const close = () => setModal(null);
  const own = (type) => o.stats_30d.find((s) => s.type === type) ?? { count: 0, amount: 0 };
  const child = (type) => o.children_stats_30d.find((s) => s.type === type) ?? { count: 0, amount: 0 };
  const owner = o.users.find((u) => u.role === 'owner');
  const usersOf = (shopId) => o.users.filter((u) => u.shop_id === shopId);

  const userRow = (u) => (
    <tr key={u.id}>
      <td>
        {u.full_name}
        {u.status !== 'active' ? <span className="badge muted" style={{ marginLeft: 6 }}>Désactivé</span> : null}
        {u.locked_until && new Date(u.locked_until) > new Date() ? <span className="badge warn" style={{ marginLeft: 6 }}>Bloqué</span> : null}
      </td>
      <td className="mono">{u.phone}</td>
      <td>{u.role === 'owner' ? (isSuper ? 'Compte principal (Superviseur)' : 'Compte principal') : 'Vendeur'}</td>
      <td>{dateTime(u.last_login_at)}</td>
      {staff ? (
        <td>
          <div className="actions">
            <button className="btn link small" type="button" onClick={() => setModal({ kind: 'user', user: u })}>Modifier / PIN</button>
            {u.locked_until && new Date(u.locked_until) > new Date() ? (
              <button className="btn link small" type="button" onClick={() => act.mutate({ fn: () => api.patch(`/admin/users/${u.id}`, { unlock: true }) })}>Débloquer</button>
            ) : null}
            {u.role === 'agent' ? (
              <>
                <button className="btn link small" type="button" onClick={() => act.mutate({ fn: () => api.patch(`/admin/users/${u.id}`, { status: u.status === 'active' ? 'disabled' : 'active' }) })}>
                  {u.status === 'active' ? 'Désactiver' : 'Réactiver'}
                </button>
                <button className="btn link small danger" type="button" onClick={() => confirmDo(`Supprimer le compte de ${u.full_name} ?`, () => api.del(`/admin/users/${u.id}`))}>Supprimer</button>
              </>
            ) : null}
          </div>
        </td>
      ) : null}
    </tr>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/organisations" className="small">← Clients</Link>
          <h1 style={{ marginTop: 6 }}>{o.name} <Badge kind="orgType" value={o.type} /> <Badge kind="orgStatus" value={o.status} /></h1>
          <p>
            {o.city}, {o.district} · {o.country}
            {o.parent_id ? <> · sous-marchand de <Link to={`/organisations/${o.parent_id}`}>{o.parent_name}</Link></> : null}
          </p>
        </div>
        {staff ? (
          <div className="toolbar">
            <button className="btn secondary" type="button" onClick={() => setModal({ kind: 'org' })}>Modifier</button>
            <button className="btn" type="button" onClick={() => setModal({ kind: 'payment' })}>Enregistrer un paiement</button>
          </div>
        ) : null}
      </div>

      <ErrorBox error={actionError} />

      {isSuper ? (
        <div className="kpis">
          <div className="card kpi"><div className="label">Sous-marchands</div><div className="value">{num(o.children.length)}</div></div>
          <div className="card kpi"><div className="label">Ventes réseau 30 j</div><div className="value">{num(child('sale').count)}</div><div className="hint">{fcfa(child('sale').amount)}</div></div>
          <div className="card kpi"><div className="label">Rachats réseau 30 j</div><div className="value">{num(child('purchase').count)}</div><div className="hint">{fcfa(child('purchase').amount)}</div></div>
          <div className="card kpi"><div className="label">Échéance (abonnement propre)</div><div className="value" style={{ fontSize: 20 }}>{date(o.subscription_expires_at)}</div></div>
        </div>
      ) : (
        <div className="kpis">
          <div className="card kpi"><div className="label">Ventes 30 j</div><div className="value">{num(own('sale').count)}</div><div className="hint">{fcfa(own('sale').amount)}</div></div>
          <div className="card kpi"><div className="label">Rachats 30 j</div><div className="value">{num(own('purchase').count)}</div><div className="hint">{fcfa(own('purchase').amount)}</div></div>
          <div className="card kpi"><div className="label">Entrées stock 30 j</div><div className="value">{num(own('stock_in').count)}</div></div>
          <div className="card kpi"><div className="label">Échéance</div><div className="value" style={{ fontSize: 20 }}>{date(o.subscription_expires_at)}</div><div className="hint">Formule {o.plan}</div></div>
        </div>
      )}

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

      {owner ? (
        <div className="card">
          <h2>{isSuper ? 'Compte principal du super marchand' : 'Compte principal'}</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nom</th><th>Login</th><th>Rôle</th><th>Dernière connexion</th>{staff ? <th /> : null}</tr></thead>
              <tbody>{userRow(owner)}</tbody>
            </table>
          </div>
        </div>
      ) : null}

      {isSuper ? (
        <div className="card">
          <div className="section-head">
            <h2>Sous-marchands ({o.children.length})</h2>
            {staff ? <button className="btn small" type="button" onClick={() => setModal({ kind: 'sub' })}>Ajouter un sous-marchand</button> : null}
          </div>
          {o.children.length === 0 ? <div className="empty">Aucun sous-marchand rattaché pour l’instant</div> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Sous-marchand</th><th>Localisation</th><th>Statut</th><th>Échéance</th><th className="num">Opérations 30 j</th></tr></thead>
                <tbody>
                  {o.children.map((c) => (
                    <tr key={c.id}>
                      <td><Link to={`/organisations/${c.id}`}><strong>{c.name}</strong></Link><div className="muted small">{c.phone}</div></td>
                      <td>{c.city}, {c.district}</td>
                      <td><Badge kind="orgStatus" value={c.status} /></td>
                      <td>{date(c.subscription_expires_at)}</td>
                      <td className="num">{num(c.transactions_30d)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="card">
          <div className="section-head">
            <h2>Boutique & comptes</h2>
          </div>
          {o.shops.map((s) => (
            <div key={s.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
              <div className="section-head" style={{ marginBottom: 8 }}>
                <div>
                  <strong>{s.name}</strong>{' '}
                  <span className={`badge ${s.status === 'active' ? 'ok' : 'muted'}`}>{s.status === 'active' ? 'Active' : 'Désactivée'}</span>
                  <div className="muted small">{s.phone} · {s.city}, {s.district} · {num(s.transactions_count)} opération(s)</div>
                </div>
                {staff ? (
                  <div className="actions">
                    <button className="btn link small" type="button" onClick={() => setModal({ kind: 'shop', shop: s })}>Modifier</button>
                    <button className="btn link small" type="button" onClick={() => setModal({ kind: 'user', shopId: s.id })}>Ajouter un vendeur</button>
                    <button className="btn link small" type="button" onClick={() => s.status === 'active'
                      ? confirmDo(`Désactiver « ${s.name} » ?`, () => api.patch(`/admin/shops/${s.id}`, { status: 'disabled' }))
                      : act.mutate({ fn: () => api.patch(`/admin/shops/${s.id}`, { status: 'active' }) })}>
                      {s.status === 'active' ? 'Désactiver' : 'Réactiver'}
                    </button>
                  </div>
                ) : null}
              </div>
              {usersOf(s.id).length ? (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Nom</th><th>Login</th><th>Rôle</th><th>Dernière connexion</th>{staff ? <th /> : null}</tr></thead>
                    <tbody>{usersOf(s.id).map(userRow)}</tbody>
                  </table>
                </div>
              ) : <div className="muted small">Seul le compte principal opère cette boutique.</div>}
            </div>
          ))}
        </div>
      )}

      {can('superadmin') ? (
        <div className="card" style={{ borderColor: 'var(--danger-bg)' }}>
          <div className="section-head" style={{ marginBottom: 0 }}>
            <div>
              <h2>Supprimer ce client</h2>
              <p className="muted small" style={{ margin: '4px 0 0' }}>Possible seulement sans historique {isSuper ? 'ni sous-marchand' : 'd’opérations'}. Sinon, suspendez-le.</p>
            </div>
            <button className="btn danger" type="button" onClick={() => confirmDo(`Supprimer définitivement « ${o.name} » ?`, () => api.del(`/admin/organizations/${o.id}`), () => {
              qc.invalidateQueries({ queryKey: ['organizations'] });
              navigate('/organisations');
            })}>Supprimer</button>
          </div>
        </div>
      ) : null}

      {modal?.kind === 'payment' ? <Modal title="Enregistrer un paiement" wide={false} onClose={close}><PaymentForm orgId={o.id} onDone={close} /></Modal> : null}
      {modal?.kind === 'org' ? <Modal title="Modifier le client" onClose={close}><OrgForm org={o} onDone={close} /></Modal> : null}
      {modal?.kind === 'sub' ? <Modal title="Nouveau sous-marchand" onClose={close}><SubMerchantForm superId={o.id} onDone={close} /></Modal> : null}
      {modal?.kind === 'shop' ? <Modal title={`Modifier ${modal.shop.name}`} onClose={close}><ShopEditForm shop={modal.shop} orgId={o.id} onDone={close} /></Modal> : null}
      {modal?.kind === 'user' ? (
        <Modal title={modal.user ? `Compte de ${modal.user.full_name}` : 'Nouveau compte vendeur'} onClose={close}>
          <UserForm orgId={o.id} shopId={modal.shopId} user={modal.user} onDone={close} />
        </Modal>
      ) : null}
    </>
  );
}
