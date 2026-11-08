import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import { ErrorBox, Field, Modal } from '../components/ui.jsx';
import { date } from '../format.js';

const fcfa = (n) => `${new Intl.NumberFormat('fr-FR').format(Number(n) || 0)} FCFA`;

const STATUS_LABEL = { pending: 'En attente', active: 'Actif', suspended: 'Suspendu', rejected: 'Refusé' };
const STATUS_CLASS = { pending: 'info', active: 'ok', suspended: 'muted', rejected: 'danger' };
const KIND_LABEL = {
  setup_consumer: 'Mise en service usager (+250)',
  subscription_consumer: 'Abonnement usager (+25/mois)',
  setup_merchant: 'Activation marchand (+2000)'
};

const FILTERS = [
  { key: '', label: 'Tous' },
  { key: 'pending', label: 'En attente' },
  { key: 'active', label: 'Actifs' },
  { key: 'suspended', label: 'Suspendus' },
  { key: 'rejected', label: 'Refusés' }
];

export function BusinessDevelopers() {
  const [status, setStatus] = useState('');
  const [openId, setOpenId] = useState(null);
  const { data, error, isLoading } = useQuery({
    queryKey: ['bd', status],
    queryFn: () => api.get('/admin/business-developers', status ? { status } : undefined)
  });

  const list = data?.items ?? [];
  const pending = list.filter((b) => b.status === 'pending').length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Business Développeurs</h1>
          <p>Parrains certifiés : validez les demandes, suivez les gains et reversez les dûs.</p>
        </div>
      </div>

      <PayoutRequestsPanel />

      <div className="card">
        <div className="actions" style={{ justifyContent: 'flex-start', flexWrap: 'wrap', marginBottom: 12 }}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`btn small ${status === f.key ? '' : 'secondary'}`}
              onClick={() => setStatus(f.key)}
            >
              {f.label}{f.key === 'pending' && pending ? ` (${pending})` : ''}
            </button>
          ))}
        </div>

        <ErrorBox error={error} />
        {isLoading ? (
          <div className="empty">Chargement…</div>
        ) : list.length === 0 ? (
          <div className="empty">Aucun Business Développeur</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nom</th><th>Téléphone</th><th>Code promo</th>
                  <th>Usagers</th><th>Marchands</th><th>Total gagné</th><th>Dû</th><th>Statut</th><th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((b) => (
                  <tr key={b.id}>
                    <td>{b.full_name}</td>
                    <td className="mono small">{b.phone}</td>
                    <td className="mono">{b.promo_code || '—'}</td>
                    <td>{b.usagers}</td>
                    <td>{b.marchands}</td>
                    <td>{fcfa(b.total_fcfa)}</td>
                    <td><strong>{fcfa(b.due_fcfa)}</strong></td>
                    <td><span className={`badge ${STATUS_CLASS[b.status]}`}>{STATUS_LABEL[b.status]}</span></td>
                    <td><button type="button" className="btn secondary small" onClick={() => setOpenId(b.id)}>Ouvrir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {openId ? <DetailModal id={openId} onClose={() => setOpenId(null)} /> : null}
    </>
  );
}

function PayoutRequestsPanel() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['bd-payout-requests'],
    queryFn: () => api.get('/admin/bd/payout-requests', { status: 'pending' })
  });
  const decide = useMutation({
    mutationFn: ({ reqId, action }) => api.post(`/admin/bd/payout-requests/${reqId}/decide`, { action }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bd-payout-requests'] }); qc.invalidateQueries({ queryKey: ['bd'] }); }
  });
  const items = data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--warn, #A35C00)' }}>
      <h2 style={{ marginTop: 0 }}>Demandes de reversement en attente ({items.length})</h2>
      <ErrorBox error={decide.error} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nom</th><th>Code</th><th>Montant</th><th>Destination</th><th>Demandé le</th><th></th></tr></thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id}>
                <td>{r.full_name}</td>
                <td className="mono small">{r.promo_code || '—'}</td>
                <td><strong>{fcfa(r.amount_fcfa)}</strong></td>
                <td className="small">{r.method === 'orzayah' ? `ORZAYAH ${r.orzayah_account ?? ''}` : `Mobile Money ${r.mobile_money_number ?? ''}`}</td>
                <td className="small">{date(r.requested_at)}</td>
                <td>
                  <div className="actions" style={{ justifyContent: 'flex-start' }}>
                    <button className="btn small" type="button" disabled={decide.isPending} onClick={() => decide.mutate({ reqId: r.id, action: 'pay' })}>Marquer payé</button>
                    <button className="btn secondary small" type="button" disabled={decide.isPending} onClick={() => decide.mutate({ reqId: r.id, action: 'reject' })}>Refuser</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DetailModal({ id, onClose }) {
  const qc = useQueryClient();
  const [payout, setPayout] = useState(null); // { method, reference, note }
  const { data: bd, error, isLoading } = useQuery({
    queryKey: ['bd', 'detail', id],
    queryFn: () => api.get(`/admin/business-developers/${id}`)
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['bd'] });
  };

  const decide = useMutation({
    mutationFn: (action) => api.post(`/admin/business-developers/${id}/decide`, { action }),
    onSuccess: () => { refresh(); qc.invalidateQueries({ queryKey: ['bd', 'detail', id] }); }
  });

  const doPayout = useMutation({
    mutationFn: (body) => api.post(`/admin/business-developers/${id}/payout`, body),
    onSuccess: () => { setPayout(null); refresh(); qc.invalidateQueries({ queryKey: ['bd', 'detail', id] }); }
  });

  const decideRequest = useMutation({
    mutationFn: ({ reqId, action }) => api.post(`/admin/bd/payout-requests/${reqId}/decide`, { action }),
    onSuccess: () => { refresh(); qc.invalidateQueries({ queryKey: ['bd', 'detail', id] }); qc.invalidateQueries({ queryKey: ['bd-payout-requests'] }); }
  });

  return (
    <Modal title="Business Développeur" onClose={onClose}>
      {isLoading ? <div className="empty">Chargement…</div> : error ? <ErrorBox error={error} /> : bd ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <h2 style={{ margin: 0 }}>{bd.full_name} <span className={`badge ${STATUS_CLASS[bd.status]}`}>{STATUS_LABEL[bd.status]}</span></h2>
            <p className="muted small">{bd.phone}{bd.email ? ` · ${bd.email}` : ''} · demande du {date(bd.requested_at)}</p>
            {bd.promo_code ? <p>Code promo : <strong className="mono">{bd.promo_code}</strong></p> : null}
          </div>

          <div className="stat-row" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Stat label="Usagers" value={bd.usagers} />
            <Stat label="Marchands" value={bd.marchands} />
            <Stat label="Total gagné" value={fcfa(bd.total_fcfa)} />
            <Stat label="Déjà reversé" value={fcfa(bd.paid_fcfa)} />
            <Stat label="Reste dû" value={fcfa(bd.due_fcfa)} strong />
          </div>

          <ErrorBox error={decide.error || doPayout.error || decideRequest.error} />

          {bd.payout_requests?.some((r) => r.status === 'pending') ? (
            <div className="card" style={{ background: 'var(--warn-bg, #FFF4E2)' }}>
              <h3 style={{ marginTop: 0, marginBottom: 8 }}>Demandes de reversement en attente</h3>
              {bd.payout_requests.filter((r) => r.status === 'pending').map((r) => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                  <div>
                    <strong>{fcfa(r.amount_fcfa)}</strong>
                    <span className="muted small"> · {r.method === 'orzayah' ? `Compte ORZAYAH ${r.orzayah_account ?? ''}` : `Mobile Money ${r.mobile_money_number ?? ''}`} · {date(r.requested_at)}</span>
                  </div>
                  <div className="actions" style={{ justifyContent: 'flex-start' }}>
                    <button className="btn small" type="button" disabled={decideRequest.isPending} onClick={() => decideRequest.mutate({ reqId: r.id, action: 'pay' })}>Marquer payé ({fcfa(r.amount_fcfa)})</button>
                    <button className="btn secondary small" type="button" disabled={decideRequest.isPending} onClick={() => decideRequest.mutate({ reqId: r.id, action: 'reject' })}>Refuser</button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="actions" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
            {bd.status === 'pending' ? (
              <>
                <button className="btn" type="button" disabled={decide.isPending} onClick={() => decide.mutate('approve')}>Valider & générer le code</button>
                <button className="btn danger" type="button" disabled={decide.isPending} onClick={() => decide.mutate('reject')}>Refuser</button>
              </>
            ) : null}
            {bd.status === 'active' ? (
              <>
                {bd.due_fcfa > 0 ? <button className="btn" type="button" onClick={() => setPayout({ method: 'Mobile Money', reference: '', note: '' })}>Reverser le dû ({fcfa(bd.due_fcfa)})</button> : null}
                <button className="btn secondary" type="button" disabled={decide.isPending} onClick={() => decide.mutate('suspend')}>Suspendre</button>
              </>
            ) : null}
            {bd.status === 'suspended' || bd.status === 'rejected' ? (
              <button className="btn" type="button" disabled={decide.isPending} onClick={() => decide.mutate('reactivate')}>Réactiver</button>
            ) : null}
          </div>

          {payout ? (
            <form
              className="card"
              onSubmit={(e) => { e.preventDefault(); doPayout.mutate(payout); }}
              style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <strong>Reverser {fcfa(bd.due_fcfa)}</strong>
              <Field label="Moyen" id="po-method"><input id="po-method" className="input" value={payout.method} onChange={(e) => setPayout({ ...payout, method: e.target.value })} placeholder="Mobile Money, espèces…" /></Field>
              <Field label="Référence (transaction)" id="po-ref"><input id="po-ref" className="input" value={payout.reference} onChange={(e) => setPayout({ ...payout, reference: e.target.value })} /></Field>
              <Field label="Note" id="po-note"><input id="po-note" className="input" value={payout.note} onChange={(e) => setPayout({ ...payout, note: e.target.value })} /></Field>
              <div className="actions" style={{ justifyContent: 'flex-start' }}>
                <button className="btn" type="submit" disabled={doPayout.isPending}>Confirmer le reversement</button>
                <button className="btn secondary" type="button" onClick={() => setPayout(null)}>Annuler</button>
              </div>
            </form>
          ) : null}

          <div>
            <h3 style={{ marginBottom: 6 }}>Commissions récentes</h3>
            {bd.commissions?.length ? (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Type</th><th>Montant</th><th>Statut</th></tr></thead>
                  <tbody>
                    {bd.commissions.map((k, i) => (
                      <tr key={i}>
                        <td className="small">{date(k.created_at)}</td>
                        <td className="small">{KIND_LABEL[k.kind] ?? k.kind}</td>
                        <td>{fcfa(k.amount_fcfa)}</td>
                        <td>{k.payout_id ? <span className="badge ok">Reversé</span> : <span className="badge info">Dû</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="empty">Aucune commission</div>}
          </div>

          {bd.payouts?.length ? (
            <div>
              <h3 style={{ marginBottom: 6 }}>Reversements</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Montant</th><th>Moyen</th><th>Référence</th></tr></thead>
                  <tbody>
                    {bd.payouts.map((p, i) => (
                      <tr key={i}><td className="small">{date(p.created_at)}</td><td>{fcfa(p.amount_fcfa)}</td><td className="small">{p.method || '—'}</td><td className="mono small">{p.reference || '—'}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

function Stat({ label, value, strong }) {
  return (
    <div className="card" style={{ padding: '10px 14px', minWidth: 120 }}>
      <div className="muted small">{label}</div>
      <div style={{ fontSize: strong ? 20 : 17, fontWeight: strong ? 800 : 600 }}>{value}</div>
    </div>
  );
}
