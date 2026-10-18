import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Badge, ErrorBox, Pager } from '../components/ui.jsx';
import { date, num } from '../format.js';

export function Organizations() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data, error, isLoading } = useQuery({
    queryKey: ['organizations', search, status, page],
    queryFn: () => api.get('/admin/organizations', { q: search, status, page, limit: 20 }),
    placeholderData: keepPreviousData
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Clients</h1>
          <p>Boutiques et grossistes abonnés à gaRAN</p>
        </div>
      </div>

      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSearch(q);
        }}
      >
        <input className="input" placeholder="Nom, téléphone, RCCM, ville…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" />
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
            <tr>
              <th>Client</th>
              <th>Localisation</th>
              <th>Statut</th>
              <th>Échéance</th>
              <th className="num">Magasins</th>
              <th className="num">Opérations 30 j</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="empty">Chargement…</td></tr>
            ) : data?.items.length ? (
              data.items.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link to={`/organisations/${o.id}`}><strong>{o.name}</strong></Link>
                    <div className="muted small">{o.phone} · RCCM {o.rccm || '—'}</div>
                  </td>
                  <td>{o.city}, {o.district}<div className="muted small">{o.country}</div></td>
                  <td><Badge kind="orgStatus" value={o.status} /></td>
                  <td>{date(o.subscription_expires_at)}</td>
                  <td className="num">{num(o.shops_count)} / {num(o.max_shops)}</td>
                  <td className="num">{num(o.transactions_30d)}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={6} className="empty">Aucun client trouvé</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {data ? <Pager page={data.page} limit={data.limit} total={data.total} onPage={setPage} /> : null}
    </>
  );
}
