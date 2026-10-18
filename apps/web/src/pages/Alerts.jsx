import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorBox, Pager } from '../components/ui.jsx';
import { dateTime, LABELS } from '../format.js';

export function Alerts() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('open');
  const [page, setPage] = useState(1);
  const { data, error } = useQuery({
    queryKey: ['alerts', status, page],
    queryFn: () => api.get('/admin/alerts', { status, page, limit: 20 }),
    placeholderData: keepPreviousData
  });
  const handle = useMutation({
    mutationFn: (id) => api.patch(`/admin/alerts/${id}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    }
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Alertes de sécurité</h1>
          <p>Tentatives de rachat ou de vente d’un téléphone signalé, et vendeurs différents du propriétaire enregistré.</p>
        </div>
        <select className="input" style={{ width: 'auto' }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Statut">
          <option value="open">À traiter</option>
          <option value="handled">Traitées</option>
        </select>
      </div>
      <ErrorBox error={error || handle.error} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>IMEI</th><th>Boutique</th><th>Personne présentée</th><th /></tr></thead>
          <tbody>
            {data?.items.map((a) => (
              <tr key={a.id}>
                <td>{dateTime(a.created_at)}</td>
                <td><span className="badge danger">{LABELS.alertType[a.type]}</span></td>
                <td><Link className="mono" to={`/imei/${a.imei}`}>{a.imei}</Link></td>
                <td>{a.shop_name}<div className="muted small">{a.shop_phone} · {a.shop_city} · {a.user_name}</div></td>
                <td className="small">
                  {a.details?.seller ? (
                    <>
                      {a.details.seller.full_name}<div className="muted">{a.details.seller.phone1} · {a.details.seller.id_doc_type} {a.details.seller.id_doc_number}</div>
                    </>
                  ) : '—'}
                </td>
                <td>{a.status === 'open' ? <button className="btn secondary small" type="button" onClick={() => handle.mutate(a.id)}>Marquer traitée</button> : <span className="badge ok">Traitée</span>}</td>
              </tr>
            ))}
            {data && !data.items.length ? <tr><td colSpan={6} className="empty">Aucune alerte</td></tr> : null}
          </tbody>
        </table>
      </div>
      {data ? <Pager page={data.page} limit={data.limit} total={data.total} onPage={setPage} /> : null}
    </>
  );
}
