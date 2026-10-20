import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ErrorBox, Modal, Pager } from '../components/ui.jsx';
import { dateTime } from '../format.js';

const STATUS = {
  requested: 'À transmettre',
  transmitted: 'Transmise',
  blocked: 'Bloqué',
  rejected: 'Rejetée'
};
const STATUS_CLASS = { requested: 'warn', transmitted: 'info', blocked: 'ok', rejected: 'muted' };

function StatusBadge({ value }) {
  return <span className={`badge ${STATUS_CLASS[value] ?? 'muted'}`}>{STATUS[value] ?? value}</span>;
}

/** Fenêtre de détail : texte prêt à envoyer aux opérateurs + mise à jour du statut. */
function Detail({ id, onClose }) {
  const qc = useQueryClient();
  const { data, error } = useQuery({ queryKey: ['block-request', id], queryFn: () => api.get(`/admin/block-requests/${id}`) });
  const [form, setForm] = useState(null);
  const [copied, setCopied] = useState(false);
  const r = data;
  const f = form ?? (r ? { status: r.status, operator: r.operator ?? '', operator_reference: r.operator_reference ?? '', note: r.note ?? '' } : null);

  const save = useMutation({
    mutationFn: () => api.patch(`/admin/block-requests/${id}`, f),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['block-requests'] });
      qc.invalidateQueries({ queryKey: ['block-request', id] });
      onClose();
    }
  });

  return (
    <Modal title="Demande de blocage" onClose={onClose}>
      <ErrorBox error={error || save.error} />
      {!r ? <div className="empty">Chargement…</div> : (
        <>
          <div className="actions" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <StatusBadge value={r.status} />
            <button
              className="btn secondary small"
              type="button"
              onClick={async () => { try { await navigator.clipboard.writeText(r.request_text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ } }}
            >
              {copied ? 'Copié ✓' : 'Copier le texte'}
            </button>
          </div>
          <textarea className="input mono" readOnly rows={14} value={r.request_text} style={{ width: '100%', fontSize: 12 }} />

          <h3 style={{ marginTop: 16 }}>Mettre à jour le suivi</h3>
          <div className="dl">
            <label>Statut
              <select className="input" value={f.status} onChange={(e) => setForm({ ...f, status: e.target.value })}>
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>Opérateur
              <input className="input" value={f.operator} onChange={(e) => setForm({ ...f, operator: e.target.value })} placeholder="Orange CI, MTN CI, Moov…" />
            </label>
            <label>Référence opérateur
              <input className="input" value={f.operator_reference} onChange={(e) => setForm({ ...f, operator_reference: e.target.value })} placeholder="Réf. dossier opérateur" />
            </label>
            <label>Note
              <input className="input" value={f.note} onChange={(e) => setForm({ ...f, note: e.target.value })} />
            </label>
          </div>
          <div className="actions" style={{ marginTop: 12 }}>
            <button className="btn" type="button" onClick={() => save.mutate()} disabled={save.isPending}>Enregistrer</button>
            <button className="btn secondary" type="button" onClick={onClose}>Fermer</button>
          </div>
        </>
      )}
    </Modal>
  );
}

export function BlockRequests() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const { data, error, isLoading } = useQuery({
    queryKey: ['block-requests', status, page],
    queryFn: () => api.get('/admin/block-requests', { status: status || undefined, page, limit: 20 }),
    placeholderData: keepPreviousData
  });
  const create = useMutation({
    mutationFn: (imei) => api.post('/admin/block-requests', { imei }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['block-requests'] })
  });
  const canAct = can('superadmin', 'admin', 'police');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Demandes de blocage opérateur</h1>
          <p>gaRAN prépare et suit la demande ; le blocage réseau est réalisé par les opérateurs / l’ARTCI à partir de l’IMEI.</p>
        </div>
        <div className="toolbar">
          <select className="input" style={{ width: 'auto' }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Statut">
            <option value="">Tous les statuts</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {canAct ? (
            <button className="btn" type="button" onClick={() => { const i = window.prompt('IMEI à bloquer (15 chiffres) :'); if (i) create.mutate(i.replace(/\D/g, '')); }}>Nouvelle demande</button>
          ) : null}
        </div>
      </div>
      <ErrorBox error={error || create.error} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>IMEI</th><th>Appareil</th><th>Propriétaire</th><th>PV</th><th>Opérateur</th><th>Statut</th><th /></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={8} className="empty">Chargement…</td></tr> : null}
            {data?.items.map((r) => (
              <tr key={r.id}>
                <td className="small">{dateTime(r.created_at)}</td>
                <td><Link className="mono" to={`/imei/${r.imei}`}>{r.imei}</Link></td>
                <td className="small">{[r.brand_label, r.model_label].filter(Boolean).join(' ') || '—'}</td>
                <td className="small">{r.owner_name || '—'}<div className="muted small">{r.owner_phone || ''}</div></td>
                <td className="small">{r.police_report_number || '—'}</td>
                <td className="small">{r.operator || '—'}{r.operator_reference ? <div className="muted small mono">{r.operator_reference}</div> : null}</td>
                <td><StatusBadge value={r.status} /></td>
                <td><button className="btn secondary small" type="button" onClick={() => setOpen(r.id)}>Voir / Envoyer</button></td>
              </tr>
            ))}
            {data && !data.items.length ? <tr><td colSpan={8} className="empty">Aucune demande de blocage</td></tr> : null}
          </tbody>
        </table>
      </div>
      {data ? <Pager page={data.page ?? page} limit={data.limit ?? 20} total={data.total ?? 0} onPage={setPage} /> : null}
      {open ? <Detail id={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}
