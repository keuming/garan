import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { ErrorBox } from '../components/ui.jsx';
import { dateTime } from '../format.js';

export function AuditLog() {
  const [action, setAction] = useState('');
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const { data, error } = useQuery({
    queryKey: ['audit', filter, page],
    queryFn: () => api.get('/admin/audit-logs', { action: filter, page, limit: 50 }),
    placeholderData: keepPreviousData
  });
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Journal d’audit</h1>
          <p>Toutes les actions sensibles, y compris chaque consultation de pièce d’identité.</p>
        </div>
      </div>
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setPage(1); setFilter(action); }}>
        <input className="input" placeholder="Filtrer par action (ex. admin.document, transaction.sale)" value={action} onChange={(e) => setAction(e.target.value)} aria-label="Action" />
        <button className="btn" type="submit">Filtrer</button>
      </form>
      <ErrorBox error={error} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Acteur</th><th>Action</th><th>Objet</th><th>IP</th></tr></thead>
          <tbody>
            {data?.items.map((l) => (
              <tr key={l.id}>
                <td className="small">{dateTime(l.created_at)}</td>
                <td>{l.actor_name ?? l.actor_type}<div className="muted small">{l.actor_type}{l.actor_phone ? ` · ${l.actor_phone}` : ''}{l.actor_email ? ` · ${l.actor_email}` : ''}</div></td>
                <td className="mono">{l.action}</td>
                <td className="small">{l.entity} <span className="mono muted">{l.entity_id}</span></td>
                <td className="mono small">{l.ip}</td>
              </tr>
            ))}
            {data && !data.items.length ? <tr><td colSpan={5} className="empty">Aucune entrée</td></tr> : null}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <button className="btn secondary small" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Précédent</button>
        <span>Page {page}</span>
        <button className="btn secondary small" type="button" disabled={(data?.items.length ?? 0) < 50} onClick={() => setPage(page + 1)}>Suivant</button>
      </div>
    </>
  );
}
