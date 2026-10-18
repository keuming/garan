import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, ErrorBox, Field, Modal, Pager } from '../components/ui.jsx';
import { AccountFields, EMPTY_ACCOUNT, LocationFields, clean } from '../components/forms.jsx';
import { date, num } from '../format.js';

/** Champs d'une entreprise cliente (réutilisé pour marchand, super marchand, sous-marchand). */
export function OrgFields({ value, onChange, prefix = 'o', merchantLabel = 'Nom' }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  return (
    <>
      <div className="form-row">
        <Field label={merchantLabel} id={`${prefix}-name`}><input id={`${prefix}-name`} className="input" required value={value.name} onChange={set('name')} /></Field>
        <Field label="RCCM" id={`${prefix}-rccm`}><input id={`${prefix}-rccm`} className="input" required value={value.rccm} onChange={set('rccm')} /></Field>
      </div>
      <div className="form-row">
        <Field label="Contact" id={`${prefix}-phone`}><input id={`${prefix}-phone`} className="input" type="tel" required value={value.phone} onChange={set('phone')} /></Field>
        <Field label="E-mail" id={`${prefix}-email`}><input id={`${prefix}-email`} className="input" type="email" required value={value.email} onChange={set('email')} /></Field>
      </div>
      <LocationFields value={value} onChange={onChange} prefix={prefix} />
      <Field label="Statut initial" id={`${prefix}-status`}>
        <select id={`${prefix}-status`} className="input" value={value.status} onChange={set('status')}>
          <option value="trial">Période d’essai</option>
          <option value="active">Actif</option>
        </select>
      </Field>
    </>
  );
}

export const EMPTY_ORG = { name: '', rccm: '', email: '', phone: '', country: "Côte d'Ivoire", city: 'Abidjan', district: '', status: 'trial' };

/** Création d'un client autonome : super marchand (grossiste) ou marchand simple. */
function CreateClient({ onDone }) {
  const qc = useQueryClient();
  const [type, setType] = useState('merchant');
  const [org, setOrg] = useState(EMPTY_ORG);
  const [owner, setOwner] = useState(EMPTY_ACCOUNT);

  const m = useMutation({
    mutationFn: () => api.post('/admin/organizations', { ...clean(org), type, owner }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['organizations'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onDone(r.organization.id);
    }
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ErrorBox error={m.error} />
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <legend className="small muted" style={{ marginBottom: 8 }}>Type de client</legend>
        {[
          ['merchant', 'Marchand', 'Une boutique, un abonnement'],
          ['super_merchant', 'Super marchand', 'Grossiste qui regroupe plusieurs marchands (sous-marchands)']
        ].map(([v, l, d]) => (
          <label key={v} className="card" style={{ padding: 12, flex: '1 1 200px', cursor: 'pointer', borderColor: type === v ? 'var(--blue)' : undefined, boxShadow: 'none' }}>
            <input type="radio" name="type" value={v} checked={type === v} onChange={() => setType(v)} style={{ marginRight: 8 }} />
            <strong>{l}</strong>
            <div className="muted small">{d}</div>
          </label>
        ))}
      </fieldset>

      <h3>{type === 'super_merchant' ? 'Entreprise du grossiste' : 'Boutique'}</h3>
      <OrgFields value={org} onChange={setOrg} merchantLabel={type === 'super_merchant' ? 'Raison sociale' : 'Nom de la boutique'} />

      <h3>{type === 'super_merchant' ? 'Compte principal (app Superviseur)' : 'Compte de connexion (app Magasin)'}</h3>
      <AccountFields value={owner} onChange={setOwner} prefix="own" />
      {type === 'super_merchant' ? (
        <p className="muted small" style={{ margin: 0 }}>Les sous-marchands (chacun sa boutique, son compte et son abonnement) s’ajoutent ensuite depuis la fiche du super marchand.</p>
      ) : null}
      <button className="btn" type="submit" disabled={m.isPending}>{m.isPending ? 'Création…' : 'Créer le client'}</button>
    </form>
  );
}

const TABS = [
  { key: 'merchant', label: 'Marchands' },
  { key: 'super_merchant', label: 'Super marchands' }
];

export function Organizations() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('merchant');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const { data, error, isLoading } = useQuery({
    queryKey: ['organizations', tab, search, status, page],
    queryFn: () => api.get('/admin/organizations', { type: tab, q: search, status, page, limit: 20 }),
    placeholderData: keepPreviousData
  });

  const isSuper = tab === 'super_merchant';
  const reset = (fn) => { fn(); setPage(1); };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Clients</h1>
          <p>Marchands et super marchands (grossistes) abonnés à gaRAN</p>
        </div>
        {can('superadmin', 'admin') ? <button className="btn" type="button" onClick={() => setCreating(true)}>Nouveau client</button> : null}
      </div>

      <div className="segment" role="tablist" style={{ maxWidth: 360 }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`segment-item${tab === t.key ? ' active' : ''}`} onClick={() => reset(() => { setTab(t.key); })}>
            {t.label}
          </button>
        ))}
      </div>

      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); reset(() => setSearch(q)); }}>
        <input className="input" placeholder="Nom, téléphone, RCCM, ville…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" />
        <select className="input" style={{ minWidth: 160, flex: '0 0 auto' }} value={status} onChange={(e) => reset(() => setStatus(e.target.value))} aria-label="Statut">
          <option value="">Tous les statuts</option>
          <option value="trial">Essai</option>
          <option value="active">Actif</option>
          <option value="expired">Expiré</option>
          <option value="suspended">Suspendu</option>
        </select>
        <button className="btn" type="submit">Rechercher</button>
      </form>

      <ErrorBox error={error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Client</th>
              {isSuper ? <th className="num">Sous-marchands</th> : <th>Rattaché à</th>}
              <th>Localisation</th>
              <th>Statut</th>
              <th>Échéance</th>
              <th className="num">Opérations 30 j</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td colSpan={6} className="empty">Chargement…</td></tr> : null}
            {data?.items.map((o) => (
              <tr key={o.id}>
                <td>
                  <Link to={`/organisations/${o.id}`}><strong>{o.name}</strong></Link>
                  <div className="muted small">{o.phone} · RCCM {o.rccm || '—'}</div>
                </td>
                {isSuper ? (
                  <td className="num">{num(o.sub_merchants_count)}</td>
                ) : (
                  <td>{o.parent_name ? <Link to={`/organisations/${o.parent_id}`}>{o.parent_name}</Link> : <span className="muted">— indépendant</span>}</td>
                )}
                <td>{o.city}, {o.district}<div className="muted small">{o.country}</div></td>
                <td><Badge kind="orgStatus" value={o.status} /></td>
                <td>{date(o.subscription_expires_at)}</td>
                <td className="num">{num(o.transactions_30d)}</td>
              </tr>
            ))}
            {data && !data.items.length ? <tr><td colSpan={6} className="empty">Aucun {isSuper ? 'super marchand' : 'marchand'} trouvé</td></tr> : null}
          </tbody>
        </table>
      </div>
      {data ? <Pager page={data.page} limit={data.limit} total={data.total} onPage={setPage} /> : null}

      {creating ? (
        <Modal title="Nouveau client" onClose={() => setCreating(false)}>
          <CreateClient onDone={(id) => { setCreating(false); navigate(`/organisations/${id}`); }} />
        </Modal>
      ) : null}
    </>
  );
}
