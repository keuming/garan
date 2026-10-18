import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, ErrorBox, Field, Modal } from '../components/ui.jsx';
import { AccountFields, EMPTY_ACCOUNT, EMPTY_SHOP, LocationFields, ShopFields, clean } from '../components/forms.jsx';
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
      <p className="muted small" style={{ margin: 0 }}>L’abonnement est activé et prolongé à partir de l’échéance actuelle (ou d’aujourd’hui si elle est dépassée).</p>
      <button className="btn" type="submit" disabled={m.isPending}>Enregistrer le paiement</button>
    </form>
  );
}

/** Informations de l'entreprise, type de client et abonnement. */
function OrgForm({ org, onDone }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    type: org.type,
    name: org.name,
    rccm: org.rccm ?? '',
    email: org.email ?? '',
    phone: org.phone,
    country: org.country,
    city: org.city,
    district: org.district,
    status: org.status,
    plan: org.plan,
    max_shops: String(org.max_shops),
    subscription_expires_at: org.subscription_expires_at ? org.subscription_expires_at.slice(0, 10) : ''
  });
  const m = useMutation({
    mutationFn: () =>
      api.patch(`/admin/organizations/${org.id}`, {
        ...clean(f),
        max_shops: f.type === 'super_merchant' ? Number(f.max_shops) : undefined,
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
      <LocationFields value={f} onChange={setF} prefix="f" />
      <h3>Abonnement</h3>
      <div className="form-row">
        <Field label="Statut" id="f-status">
          <select id="f-status" className="input" value={f.status} onChange={set('status')}>
            {Object.entries(LABELS.orgStatus).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Formule" id="f-plan"><input id="f-plan" className="input" value={f.plan} onChange={set('plan')} /></Field>
        {f.type === 'super_merchant' ? (
          <Field label="Boutiques autorisées" id="f-max"><input id="f-max" className="input" type="number" min="1" value={f.max_shops} onChange={set('max_shops')} /></Field>
        ) : null}
        <Field label="Échéance" id="f-exp"><input id="f-exp" className="input" type="date" value={f.subscription_expires_at} onChange={set('subscription_expires_at')} /></Field>
      </div>
      {f.status === 'suspended' && org.status !== 'suspended' ? (
        <div className="alert warn">La suspension déconnecte immédiatement tous les comptes de ce client.</div>
      ) : null}
      <button className="btn" type="submit" disabled={m.isPending}>Enregistrer</button>
    </form>
  );
}

/** Nouveau sous-compte CLIENT : une boutique et son compte de connexion. */
function ClientForm({ orgId, onDone }) {
  const qc = useQueryClient();
  const [shop, setShop] = useState(EMPTY_SHOP);
  const [account, setAccount] = useState(EMPTY_ACCOUNT);
  const m = useMutation({
    mutationFn: () => api.post(`/admin/organizations/${orgId}/clients`, { shop: clean(shop), account }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['organization', orgId] });
      onDone();
    }
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ErrorBox error={m.error} />
      <h3>Boutique</h3>
      <ShopFields value={shop} onChange={setShop} prefix="c" />
      <h3>Compte de connexion (app gaRAN Magasin)</h3>
      <AccountFields value={account} onChange={setAccount} prefix="ca" />
      <button className="btn" type="submit" disabled={m.isPending}>Créer le sous-compte</button>
    </form>
  );
}

function ShopEditForm({ shop, orgId, onDone }) {
  const qc = useQueryClient();
  const [s, setS] = useState({ ...EMPTY_SHOP, ...Object.fromEntries(Object.entries(shop).map(([k, v]) => [k, v ?? ''])) });
  const m = useMutation({
    mutationFn: () => {
      const { name, phone, email, rccm, country, city, district, address } = s;
      return api.patch(`/admin/shops/${shop.id}`, clean({ name, phone, email, rccm, country, city, district, address }));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['organization', orgId] });
      onDone();
    }
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ErrorBox error={m.error} />
      <ShopFields value={s} onChange={setS} prefix="es" />
      <button className="btn" type="submit" disabled={m.isPending}>Enregistrer</button>
    </form>
  );
}

/** Ajout d'un compte vendeur à une boutique, ou modification d'un compte existant (login, nom, PIN). */
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['organization', orgId] });
      onDone();
    }
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

  const stat = (type) => o.stats_30d.find((s) => s.type === type) ?? { count: 0, amount: 0 };
  const isSuper = o.type === 'super_merchant';
  const activeShops = o.shops.filter((s) => s.status === 'active').length;
  const owner = o.users.find((u) => u.role === 'owner');
  const usersOf = (shopId) => o.users.filter((u) => u.shop_id === shopId);
  const close = () => setModal(null);

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
                <button className="btn link small danger" type="button" onClick={() => confirmDo(`Supprimer définitivement le compte de ${u.full_name} ?`, () => api.del(`/admin/users/${u.id}`))}>
                  Supprimer
                </button>
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
          <h1 style={{ marginTop: 6 }}>
            {o.name} <Badge kind="orgType" value={o.type} /> <Badge kind="orgStatus" value={o.status} />
          </h1>
          <p>{o.city}, {o.district} · {o.country}</p>
        </div>
        {staff ? (
          <div className="toolbar">
            <button className="btn secondary" type="button" onClick={() => setModal({ kind: 'org' })}>Modifier</button>
            <button className="btn" type="button" onClick={() => setModal({ kind: 'payment' })}>Enregistrer un paiement</button>
          </div>
        ) : null}
      </div>

      <ErrorBox error={actionError} />

      <div className="kpis">
        <div className="card kpi"><div className="label">Ventes 30 j</div><div className="value">{num(stat('sale').count)}</div><div className="hint">{fcfa(stat('sale').amount)}</div></div>
        <div className="card kpi"><div className="label">Rachats 30 j</div><div className="value">{num(stat('purchase').count)}</div><div className="hint">{fcfa(stat('purchase').amount)}</div></div>
        <div className="card kpi"><div className="label">Boutiques actives</div><div className="value">{num(activeShops)} / {num(o.max_shops)}</div><div className="hint">{isSuper ? 'Sous-comptes CLIENT' : 'Marchand simple'}</div></div>
        <div className="card kpi"><div className="label">Échéance</div><div className="value" style={{ fontSize: 20 }}>{date(o.subscription_expires_at)}</div><div className="hint">Formule {o.plan}</div></div>
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

      <div className="card">
        <div className="section-head">
          <h2>{isSuper ? `Sous-comptes CLIENT (${o.shops.length})` : `Boutique (${o.shops.length})`}</h2>
          {staff ? (
            <button
              className="btn small"
              type="button"
              disabled={activeShops >= o.max_shops}
              title={activeShops >= o.max_shops ? 'Limite de boutiques atteinte : modifiez l’abonnement' : undefined}
              onClick={() => setModal({ kind: 'client' })}
            >
              {isSuper ? 'Ajouter un client' : 'Ajouter une boutique'}
            </button>
          ) : null}
        </div>
        {!isSuper && activeShops >= o.max_shops && staff ? (
          <p className="muted small">Pour ajouter des sous-comptes, passez ce client en « Super marchand » via « Modifier ».</p>
        ) : null}
        {o.shops.length === 0 ? <div className="empty">Aucun sous-compte pour l’instant</div> : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {o.shops.map((s) => (
            <div key={s.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 14 }}>
              <div className="section-head" style={{ marginBottom: 8 }}>
                <div>
                  <strong>{s.name}</strong>{' '}
                  <span className={`badge ${s.status === 'active' ? 'ok' : 'muted'}`}>{s.status === 'active' ? 'Active' : 'Désactivée'}</span>
                  <div className="muted small">
                    {s.phone} · {s.city}, {s.district} · RCCM {s.rccm || '—'} · {num(s.transactions_count)} opération(s)
                  </div>
                </div>
                {staff ? (
                  <div className="actions">
                    <button className="btn link small" type="button" onClick={() => setModal({ kind: 'shop', shop: s })}>Modifier</button>
                    <button className="btn link small" type="button" onClick={() => setModal({ kind: 'user', shopId: s.id })}>Ajouter un compte</button>
                    <button
                      className="btn link small"
                      type="button"
                      onClick={() =>
                        s.status === 'active'
                          ? confirmDo(`Désactiver « ${s.name} » ? Ses comptes ne pourront plus se connecter.`, () => api.patch(`/admin/shops/${s.id}`, { status: 'disabled' }))
                          : act.mutate({ fn: () => api.patch(`/admin/shops/${s.id}`, { status: 'active' }) })
                      }
                    >
                      {s.status === 'active' ? 'Désactiver' : 'Réactiver'}
                    </button>
                    <button className="btn link small danger" type="button" onClick={() => confirmDo(`Supprimer définitivement « ${s.name} » et ses comptes ?`, () => api.del(`/admin/shops/${s.id}`))}>
                      Supprimer
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
              ) : (
                <div className="muted small">Aucun compte vendeur : seul le compte principal peut opérer cette boutique.</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {can('superadmin') ? (
        <div className="card" style={{ borderColor: 'var(--danger-bg)' }}>
          <div className="section-head" style={{ marginBottom: 0 }}>
            <div>
              <h2>Supprimer ce client</h2>
              <p className="muted small" style={{ margin: '4px 0 0' }}>Possible uniquement s’il n’a encore aucune opération ni paiement. Sinon, suspendez-le.</p>
            </div>
            <button
              className="btn danger"
              type="button"
              onClick={() => confirmDo(`Supprimer définitivement « ${o.name} », ses boutiques et tous ses comptes ?`, () => api.del(`/admin/organizations/${o.id}`), () => {
                qc.invalidateQueries({ queryKey: ['organizations'] });
                navigate('/organisations');
              })}
            >
              Supprimer
            </button>
          </div>
        </div>
      ) : null}

      {modal?.kind === 'payment' ? <Modal title="Enregistrer un paiement" wide={false} onClose={close}><PaymentForm orgId={o.id} onDone={close} /></Modal> : null}
      {modal?.kind === 'org' ? <Modal title="Modifier le client" onClose={close}><OrgForm org={o} onDone={close} /></Modal> : null}
      {modal?.kind === 'client' ? <Modal title={isSuper ? 'Nouveau sous-compte CLIENT' : 'Nouvelle boutique'} onClose={close}><ClientForm orgId={o.id} onDone={close} /></Modal> : null}
      {modal?.kind === 'shop' ? <Modal title={`Modifier ${modal.shop.name}`} onClose={close}><ShopEditForm shop={modal.shop} orgId={o.id} onDone={close} /></Modal> : null}
      {modal?.kind === 'user' ? (
        <Modal title={modal.user ? `Compte de ${modal.user.full_name}` : 'Nouveau compte vendeur'} onClose={close}>
          <UserForm orgId={o.id} shopId={modal.shopId} user={modal.user} onDone={close} />
        </Modal>
      ) : null}
    </>
  );
}
