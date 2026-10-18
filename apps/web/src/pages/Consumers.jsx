import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorBox, Pager } from '../components/ui.jsx';
import { dateTime, num } from '../format.js';

/** Usagers : propriétaires finaux inscrits via l'app grand public. */
export function Consumers() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, isLoading } = useQuery({
    queryKey: ['consumers', search, page],
    queryFn: () => api.get('/admin/consumers', { q: search, page, limit: 25 }),
    placeholderData: keepPreviousData
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Usagers</h1>
          <p>Propriétaires finaux ayant enregistré leur téléphone via l’application gaRAN.</p>
        </div>
      </div>

      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(q); }}>
        <input className="input" placeholder="Nom, téléphone ou e-mail…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" />
        <button className="btn" type="submit">Rechercher</button>
      </form>

      <ErrorBox error={error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Usager</th><th>Contact</th><th className="num">Téléphones actifs</th><th className="num">Total</th><th>Inscrit le</th><th>Statut</th></tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td colSpan={6} className="empty">Chargement…</td></tr> : null}
            {data?.items.map((c) => (
              <tr key={c.id}>
                <td><Link to={`/usagers/${c.id}`}><strong>{c.full_name}</strong></Link></td>
                <td>{c.phone}<div className="muted small">{c.email || ''}</div></td>
                <td className="num">{num(c.active_devices)}</td>
                <td className="num">{num(c.total_devices)}</td>
                <td>{dateTime(c.created_at)}</td>
                <td><span className={`badge ${c.status === 'active' ? 'ok' : 'muted'}`}>{c.status === 'active' ? 'Actif' : 'Désactivé'}</span></td>
              </tr>
            ))}
            {data && !data.items.length ? <tr><td colSpan={6} className="empty">Aucun usager trouvé</td></tr> : null}
          </tbody>
        </table>
      </div>
      {data ? <Pager page={data.page} limit={data.limit} total={data.total} onPage={setPage} /> : null}
    </>
  );
}
