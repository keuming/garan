import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, ErrorBox, Field, Modal, Pager } from '../components/ui.jsx';
import { AccountFields, EMPTY_ACCOUNT, LocationFields, clean } from '../components/forms.jsx';
import { date, num } from '../format.js';

/** Création d'un compte client : marchand simple ou super marchand (grossiste). */
function CreateClient({ onDone }) {
  const qc = useQueryClient();
  const [type, setType] = useState('super_merchant');
  const [org, setOrg] = useState({ name: '', rccm: '', email: '', phone: '', country: "Côte d'Ivoire", city: 'Abidjan', district: '', max_shops: '5', status: 'trial' });
  const [owner, setOwner] = useState(EMPTY_ACCOUNT);
  const set = (k) => (e) => setOrg({ ...org, [k]: e.target.value });

  const m = useMutation({
    mutationFn: () =>
      api.post('/admin/organizations', {
        ...clean(org),
        type,
        max_shops: type === 'super_merchant' ? Number(org.max_shops) : undefined,
        owner
      }),
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
          ['super_merchant', 'Super marchand', 'Grossiste avec plusieurs boutiques (sous-comptes CLIENT)'],
          ['merchant', 'Marchand', 'Une seule boutique']
        ].map(([v, l, d]) => (
          <label key={v} className="card" style={{ padding: 12, flex: '1 1 200px', cursor: 'pointer', borderColor: type === v ? 'var(--blue)' : undefined, boxShadow: 'none' }}>
            <input type="radio" name="type" value={v} checked={type === v} onChange={() => setType(v)} style={{ marginRight: 8 }} />
            <strong>{l}</strong>
            <div className="muted small">{d}</div>
          </label>
        ))}
      </fieldset>

      <h3>Entreprise</h3>
      <div className="form-row">
        <Field label={type === 'merchant' ? 'Nom de la boutique' : 'Raison sociale'} id="o-name"><input id="o-name" className="input" required value={org.name} onChange={set('name')} /></Field>
        <Field label="RCCM" id="o-rccm"><input id="o-rccm" className="input" required value={org.rccm} onChange={set('rccm')} /></Field>
      </div>
      <div className="form-row">
        <Field label="Contact" id="o-phone"><input id="o-phone" className="input" type="tel" required value={org.phone} onChange={set('phone')} /></Field>
        <Field label="E-mail" id="o-email"><input id="o-email" className="input" type="email" required value={org.email} onChange={set('email')} /></Field>
      </div>
      <LocationFields value={org} onChange={setOrg} prefix="o" />
      <div className="form-row">
        <Field label="Statut initial" id="o-status">
          <select id="o-status" className="input" value={org.status} onChange={set('status')}>
            <option value="trial">Période d’essai</option>
            <option value="active">Actif</option>
          </select>
        </Field>
        {type === 'super_merchant' ? (
          <Field label="Boutiques autorisées" id="o-max"><input id="o-max" className="input" type="number" min="1" max="1000" value={org.max_shops} onChange={set('max_shops')} /></Field>
        ) : null}
      </div>

      <h3>{type === 'super_merchant' ? 'Compte principal (app Superviseur)' : 'Compte de connexion de la boutique'}</h3>
      <AccountFields value={owner} onChange={setOwner} prefix="own" />
      {type === 'super_merchant' ? (
        <p className="muted small" style={{ margin: 0 }}>Les sous-comptes CLIENT (une boutique et son login chacun) s’ajoutent ensuite depuis la fiche du super marchand.</p>
      ) : null}
      <button className="btn" type="submit" disabled={m.isPending}>{m.isPending ? 'Création…' : 'Créer le client'}</button>
    </form>
  );
}

export function Organizations() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const { data, error, isLoading } = useQuery({
    queryKey: ['organizations', search, status, type, page],
    queryFn: () => api.get('/admin/organizations', { q: search, status, type, page, limit: 20 }),
    placeholderData: keepPreviousData
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Clients</h1>
          <p>Marchands et super marchands (grossistes) abonnés à gaRAN</p>
        </div>
        {can('superadmin', 'admin') ? <button className="btn" type="button" onClick={() => setCreating(true)}>Nouveau client</button> : null}
      </div>

      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(q); }}>
        <input className="input" placeholder="Nom, téléphone, RCCM, ville…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" />
        <select className="input" style={{ minWidth: 160, flex: '0 0 auto' }} value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Type">
          <option value="">Tous les types</option>
          <option value="super_merchant">Super marchands</option>
          <option value="merchant">Marchands</option>
        </select>
        <select className="input" style={{ minWidth: 160, flex: '0 0 auto' }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Statut">
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
            <tr><th>Client</th><th>Type</th><th>Localisation</th><th>Statut</th><th>Échéance</th><th className="num">Boutiques</th><th className="num">Opérations 30 j</th></tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td colSpan={7} className="empty">Chargement…</td></tr> : null}
            {data?.items.map((o) => (
              <tr key={o.id}>
                <td>
                  <Link to={`/organisations/${o.id}`}><strong>{o.name}</strong></Link>
                  <div className="muted small">{o.phone} · RCCM {o.rccm || '—'}</div>
                </td>
                <td><Badge kind="orgType" value={o.type} /></td>
                <td>{o.city}, {o.district}<div className="muted small">{o.country}</div></td>
                <td><Badge kind="orgStatus" value={o.status} /></td>
                <td>{date(o.subscription_expires_at)}</td>
                <td className="num">{num(o.shops_count)} / {num(o.max_shops)}</td>
                <td className="num">{num(o.transactions_30d)}</td>
              </tr>
            ))}
            {data && !data.items.length ? <tr><td colSpan={7} className="empty">Aucun client trouvé</td></tr> : null}
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
