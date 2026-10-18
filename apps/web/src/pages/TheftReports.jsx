import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, ErrorBox, Pager } from '../components/ui.jsx';
import { dateTime, LABELS } from '../format.js';

export function TheftReports() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const { data, error, isLoading } = useQuery({
    queryKey: ['theft-reports', status, page],
    queryFn: () => api.get('/admin/theft-reports', { status, page, limit: 20 }),
    placeholderData: keepPreviousData
  });
  const review = useMutation({
    mutationFn: ({ id, status: s, note }) => api.patch(`/admin/theft-reports/${id}`, { status: s, review_note: note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['theft-reports'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    }
  });
  const canReview = can('superadmin', 'admin', 'police');
  const canInvestigate = can('superadmin', 'admin', 'police');

  function act(r, s) {
    const note = window.prompt(s === 'rejected' ? 'Motif du rejet :' : 'Note (facultatif) :') ?? '';
    if (s === 'rejected' && !note) return;
    review.mutate({ id: r.id, status: s, note });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Déclarations de vol et de perte</h1>
          <p>Déclarations faites par les propriétaires. Une déclaration confirmée bloque le téléphone dans tout le réseau.</p>
        </div>
        <select className="input" style={{ width: 'auto' }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Statut">
          {Object.entries(LABELS.reportStatus).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <ErrorBox error={error || review.error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Date</th><th>IMEI</th><th>Déclarant</th><th>Pièce</th><th>PV</th><th>Statut</th>{canReview ? <th /> : null}</tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td colSpan={7} className="empty">Chargement…</td></tr> : null}
            {data?.items.map((r) => (
              <tr key={r.id}>
                <td>{dateTime(r.created_at)}<div className="muted small">{r.kind === 'lost' ? 'Perte' : 'Vol'}{r.auto_confirmed ? ' · confirmée automatiquement' : ''}</div></td>
                <td>
                  {canInvestigate ? <Link className="mono" to={`/imei/${r.imei}`}>{r.imei}</Link> : <span className="mono">{r.imei}</span>}
                  <div className="muted small">{r.brand_name ?? 'Non enregistré'} {r.model_name ?? ''}</div>
                </td>
                <td>{r.reporter_name}<div className="muted small">{r.reporter_phone}</div></td>
                <td className="small">{LABELS.docType[r.id_doc_type] ?? r.id_doc_type} <span className="mono">{r.id_doc_number}</span></td>
                <td>{r.police_report_number || '—'}</td>
                <td><Badge kind="reportStatus" value={r.status} />{r.review_note ? <div className="muted small">{r.review_note}</div> : null}</td>
                {canReview ? (
                  <td>
                    <div className="toolbar">
                      {r.status === 'pending' ? (
                        <>
                          <button className="btn danger small" type="button" onClick={() => act(r, 'confirmed')}>Confirmer</button>
                          <button className="btn secondary small" type="button" onClick={() => act(r, 'rejected')}>Rejeter</button>
                        </>
                      ) : null}
                      {r.status === 'confirmed' ? (
                        <button className="btn secondary small" type="button" onClick={() => act(r, 'resolved')}>Retrouvé</button>
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
            {data && !data.items.length ? <tr><td colSpan={7} className="empty">Aucune déclaration</td></tr> : null}
          </tbody>
        </table>
      </div>
      {data ? <Pager page={data.page} limit={data.limit} total={data.total} onPage={setPage} /> : null}
    </>
  );
}
