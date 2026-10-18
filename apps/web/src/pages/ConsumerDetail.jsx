import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, ErrorBox } from '../components/ui.jsx';
import { date, dateTime } from '../format.js';

/** Ouvre une pièce jointe (reçu, photo du carton) via l'API authentifiée. */
function DocButton({ docKey, label }) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
  if (!docKey) return <span className="muted small">{label} : absent</span>;
  if (!url) {
    return (
      <button
        className="btn secondary small"
        type="button"
        onClick={async () => {
          try {
            setUrl(URL.createObjectURL(await api.blob('/admin/documents', { key: docKey })));
          } catch (e) {
            setError(e);
          }
        }}
      >
        Voir {label.toLowerCase()}
      </button>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="btn secondary small">
      Ouvrir {label.toLowerCase()} ↗{error ? ` (${error.message})` : ''}
    </a>
  );
}

export function ConsumerDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { can } = useAuth();
  const { data: c, error, isLoading } = useQuery({ queryKey: ['consumer', id], queryFn: () => api.get(`/admin/consumers/${id}`) });
  const toggle = useMutation({
    mutationFn: (status) => api.patch(`/admin/consumers/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consumer', id] })
  });

  if (isLoading) return <div className="empty">Chargement…</div>;
  if (error) return <ErrorBox error={error} />;

  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/usagers" className="small">← Usagers</Link>
          <h1 style={{ marginTop: 6 }}>{c.full_name} <span className={`badge ${c.status === 'active' ? 'ok' : 'muted'}`}>{c.status === 'active' ? 'Actif' : 'Désactivé'}</span></h1>
          <p>{c.phone}{c.email ? ` · ${c.email}` : ''} · inscrit le {dateTime(c.created_at)}</p>
        </div>
        {can('superadmin', 'admin') ? (
          <button className="btn secondary" type="button" onClick={() => toggle.mutate(c.status === 'active' ? 'disabled' : 'active')} disabled={toggle.isPending}>
            {c.status === 'active' ? 'Désactiver le compte' : 'Réactiver le compte'}
          </button>
        ) : null}
      </div>
      <ErrorBox error={toggle.error} />

      <div className="card">
        <h2>Téléphones enregistrés ({c.devices.length})</h2>
        {c.devices.length === 0 ? <div className="empty">Aucun téléphone enregistré</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {c.devices.map((d) => (
              <div key={d.registration_id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 14 }}>
                <div className="section-head" style={{ marginBottom: 6 }}>
                  <div>
                    <strong>{d.brand} {d.model}</strong>{' '}
                    <span className={`badge ${d.status === 'active' ? 'ok' : 'muted'}`}>{d.status === 'active' ? 'Lié' : 'Délié'}</span>
                    {d.device_status !== 'active' ? <Badge kind="deviceStatus" value={d.device_status} /> : null}
                    <div className="mono small"><Link to={`/imei/${d.imei1}`}>{d.imei1}</Link>{d.imei2 ? ` · ${d.imei2}` : ''}</div>
                  </div>
                  <div className="muted small" style={{ textAlign: 'right' }}>
                    Lié le {date(d.acquired_at)}{d.released_at ? ` · délié le ${date(d.released_at)}` : ''}
                  </div>
                </div>
                <dl className="dl">
                  <dt>Lieu d’achat</dt><dd>{d.purchase_place || '—'}</dd>
                  <dt>Marchand déclaré</dt><dd>{d.merchant_name || '—'}</dd>
                  <dt>N° de reçu</dt><dd>{d.receipt_number || '—'}</dd>
                </dl>
                <div className="actions" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
                  <DocButton docKey={d.receipt_key} label="Reçu" />
                  <DocButton docKey={d.box_photo_key} label="Photo du carton" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
