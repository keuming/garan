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

/** Fenêtre de détail : lettre prête à envoyer, routage opérateur, transmission et relance. */
function Detail({ id, onClose }) {
  const qc = useQueryClient();
  const { data, error } = useQuery({ queryKey: ['block-request', id], queryFn: () => api.get(`/admin/block-requests/${id}`) });
  const [form, setForm] = useState(null);
  const [copied, setCopied] = useState(false);
  const [flash, setFlash] = useState(null);
  const r = data;
  const f = form ?? (r ? { status: r.status, operator: r.operator ?? '', operator_reference: r.operator_reference ?? '', note: r.note ?? '' } : null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['block-requests'] });
    qc.invalidateQueries({ queryKey: ['block-requests-stats'] });
    qc.invalidateQueries({ queryKey: ['block-request', id] });
  };

  const save = useMutation({
    mutationFn: () => api.patch(`/admin/block-requests/${id}`, f),
    onSuccess: () => { invalidate(); onClose(); }
  });
  const transmit = useMutation({
    mutationFn: () => api.post(`/admin/block-requests/${id}/transmit`, { operator: (f.operator || '').trim() || undefined }),
    onSuccess: (res) => {
      invalidate();
      setForm(null);
      setFlash(res.emailed ? `Transmise par e-mail à ${res.emailed} destinataire(s).` : 'Marquée transmise. Aucun e-mail opérateur configuré — envoyez la lettre manuellement.');
    }
  });
  const remind = useMutation({
    mutationFn: () => api.post(`/admin/block-requests/${id}/remind`, {}),
    onSuccess: (res) => { invalidate(); setFlash(res.emailed ? `Relance envoyée à ${res.emailed} destinataire(s).` : 'Aucun e-mail opérateur configuré pour la relance.'); }
  });
  const busy = save.isPending || transmit.isPending || remind.isPending;

  return (
    <Modal title="Demande de blocage" onClose={onClose}>
      <ErrorBox error={error || save.error || transmit.error || remind.error} />
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

          {r.suggested_operator ? (
            <div className="alert info" style={{ marginBottom: 10 }}>
              Opérateur suggéré : <strong>{r.suggested_operator.label}</strong>{' '}
              <span className="muted small">({r.suggested_operator.source === 'sim_after_theft' ? 'SIM utilisée après le vol' : 'préfixe du numéro'})</span>
              {f.operator !== r.suggested_operator.label ? (
                <button className="btn secondary small" type="button" style={{ marginLeft: 8 }} onClick={() => setForm({ ...f, operator: r.suggested_operator.label })}>Utiliser</button>
              ) : null}
            </div>
          ) : null}
          {!r.operator_email_configured ? (
            <div className="alert warn" style={{ marginBottom: 10 }}>
              Aucune adresse e-mail d’opérateur/ARTCI n’est configurée : la transmission marquera la demande mais n’enverra pas d’e-mail. Configurez les variables <span className="mono">OPERATOR_*_EMAIL</span> / <span className="mono">ARTCI_EMAIL</span>.
            </div>
          ) : null}
          {flash ? <div className="alert success" style={{ marginBottom: 10 }}>{flash}</div> : null}

          <textarea className="input mono" readOnly rows={13} value={r.request_text} style={{ width: '100%', fontSize: 12 }} />

          <div className="actions" style={{ marginTop: 12, flexWrap: 'wrap' }}>
            {r.status !== 'blocked' ? (
              <button className="btn" type="button" onClick={() => transmit.mutate()} disabled={busy}>
                {r.status === 'transmitted' ? 'Retransmettre par e-mail' : 'Transmettre (e-mail opérateur + ARTCI)'}
              </button>
            ) : null}
            {r.status === 'transmitted' ? (
              <button className="btn secondary" type="button" onClick={() => remind.mutate()} disabled={busy}>
                Relancer{r.reminder_count ? ` (${r.reminder_count})` : ''}
              </button>
            ) : null}
          </div>
          {r.transmitted_at ? (
            <p className="muted small" style={{ marginTop: 6 }}>
              Transmise le {dateTime(r.transmitted_at)}{r.last_reminded_at ? ` · dernière relance le ${dateTime(r.last_reminded_at)}` : ''}{r.owner_notified_at ? ` · usager notifié` : ''}
            </p>
          ) : null}

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
            <button className="btn" type="button" onClick={() => save.mutate()} disabled={busy}>Enregistrer</button>
            <button className="btn secondary" type="button" onClick={onClose}>Fermer</button>
          </div>
        </>
      )}
    </Modal>
  );
}

function StatChip({ label, value, active, tone, onClick }) {
  return (
    <button type="button" className={`badge ${tone ?? 'muted'}`} aria-pressed={active}
      onClick={onClick}
      style={{ cursor: 'pointer', border: active ? '2px solid currentColor' : '2px solid transparent', fontSize: 13 }}>
      {label} : <strong>{value}</strong>
    </button>
  );
}

export function BlockRequests() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [followup, setFollowup] = useState(false);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);

  const stats = useQuery({ queryKey: ['block-requests-stats'], queryFn: () => api.get('/admin/block-requests/stats') });
  const { data, error, isLoading } = useQuery({
    queryKey: ['block-requests', status, followup, page],
    queryFn: () => api.get('/admin/block-requests', { status: status || undefined, followup: followup ? '1' : undefined, page, limit: 20 }),
    placeholderData: keepPreviousData
  });
  const create = useMutation({
    mutationFn: (imei) => api.post('/admin/block-requests', { imei }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['block-requests'] }); qc.invalidateQueries({ queryKey: ['block-requests-stats'] }); }
  });
  const canAct = can('superadmin', 'admin', 'police');

  const pickStatus = (s) => { setStatus(s); setFollowup(false); setPage(1); };
  const c = stats.data?.counts ?? {};

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Demandes de blocage opérateur</h1>
          <p>gaRAN prépare, route et suit la demande ; le blocage réseau est réalisé par les opérateurs / l’ARTCI à partir de l’IMEI.</p>
        </div>
        <div className="toolbar">
          <select className="input" style={{ width: 'auto' }} value={followup ? '' : status} onChange={(e) => pickStatus(e.target.value)} aria-label="Statut">
            <option value="">Tous les statuts</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {canAct ? (
            <button className="btn" type="button" onClick={() => { const i = window.prompt('IMEI à bloquer (15 chiffres) :'); if (i) create.mutate(i.replace(/\D/g, '')); }}>Nouvelle demande</button>
          ) : null}
        </div>
      </div>

      {stats.data ? (
        <div className="actions" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <StatChip label="À transmettre" value={c.requested ?? 0} tone="warn" active={!followup && status === 'requested'} onClick={() => pickStatus(status === 'requested' ? '' : 'requested')} />
          <StatChip label="Transmises" value={c.transmitted ?? 0} tone="info" active={!followup && status === 'transmitted'} onClick={() => pickStatus(status === 'transmitted' ? '' : 'transmitted')} />
          <StatChip label="Bloqués" value={c.blocked ?? 0} tone="ok" active={!followup && status === 'blocked'} onClick={() => pickStatus(status === 'blocked' ? '' : 'blocked')} />
          <StatChip label="Rejetées" value={c.rejected ?? 0} tone="muted" active={!followup && status === 'rejected'} onClick={() => pickStatus(status === 'rejected' ? '' : 'rejected')} />
          <StatChip label={`À relancer (>${stats.data.followup_days}j)`} value={stats.data.followup_due ?? 0} tone="danger" active={followup} onClick={() => { setFollowup((v) => !v); setStatus(''); setPage(1); }} />
        </div>
      ) : null}

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
                <td className="small">{r.operator || '—'}{r.operator_reference ? <div className="muted small mono">{r.operator_reference}</div> : null}{r.reminder_count ? <div className="muted small">{r.reminder_count} relance(s)</div> : null}</td>
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
