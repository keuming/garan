import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { Badge, ErrorBox } from '../components/ui.jsx';
import { dateTime, fcfa, LABELS } from '../format.js';

/** Affiche une pièce d'identité récupérée via l'API (authentifiée, consultation tracée). */
function IdDoc({ docKey, label }) {
  const [url, setUrl] = useState(null);
  const [show, setShow] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
  if (!docKey) return <span className="muted small">{label} : absent</span>;
  if (!show) {
    return (
      <button
        className="btn secondary small"
        type="button"
        onClick={async () => {
          setShow(true);
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
  if (error) return <ErrorBox error={error} />;
  return url ? <img src={url} alt={`Pièce d’identité — ${label}`} /> : <span className="muted small">Chargement…</span>;
}

function PersonCard({ p }) {
  return (
    <div>
      <strong>{p.full_name}</strong>
      <div className="small">
        {LABELS.docType[p.id_doc_type] ?? p.id_doc_type} <span className="mono">{p.id_doc_number}</span> · {p.phone1} / {p.phone2}
        {p.email ? ` · ${p.email}` : ''}
      </div>
      <div className="docs">
        <IdDoc docKey={p.id_doc_front_key} label="Recto" />
        <IdDoc docKey={p.id_doc_back_key} label="Verso" />
      </div>
    </div>
  );
}

export function ImeiSearch() {
  const { imei } = useParams();
  const navigate = useNavigate();
  const [value, setValue] = useState(imei ?? '');
  const { data, error, isFetching } = useQuery({
    queryKey: ['device', imei],
    queryFn: () => api.get(`/admin/devices/${imei}`),
    enabled: Boolean(imei)
  });
  const d = data?.device;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Recherche IMEI</h1>
          <p>Historique complet d’un téléphone : propriétaires, boutiques, déclarations. Chaque consultation est tracée.</p>
        </div>
      </div>
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); navigate(`/imei/${value.replace(/\D/g, '')}`); }}>
        <input className="input mono" inputMode="numeric" maxLength={20} placeholder="IMEI à 15 chiffres" value={value} onChange={(e) => setValue(e.target.value)} aria-label="IMEI" />
        <button className="btn" type="submit">Rechercher</button>
      </form>

      {isFetching ? <div className="empty">Recherche…</div> : null}
      <ErrorBox error={error} />

      {data && !isFetching ? (
        <>
          <div className="two-col">
            <div className="card">
              <h2>Appareil</h2>
              {d ? (
                <dl className="dl">
                  <dt>Statut</dt><dd><Badge kind="deviceStatus" value={d.status} /></dd>
                  <dt>Modèle</dt><dd>{d.brand_name ?? '—'} {d.model_name ?? ''}</dd>
                  <dt>IMEI 1</dt><dd className="mono">{d.imei1}</dd>
                  <dt>IMEI 2</dt><dd className="mono">{d.imei2 ?? '—'}</dd>
                  <dt>Détenteur</dt>
                  <dd>{d.owner_type === 'shop' ? `Stock : ${d.owner_shop_name}` : d.owner_type === 'person' ? d.owner_person.full_name : 'Aucun'}</dd>
                  <dt>Premier enregistrement</dt><dd>{dateTime(d.created_at)}</dd>
                </dl>
              ) : <div className="empty">IMEI inconnu du registre</div>}
            </div>
            {d?.owner_person ? (
              <div className="card"><h2>Propriétaire actuel</h2><PersonCard p={d.owner_person} /></div>
            ) : null}
          </div>

          <div className="card">
            <h2>Propriétaires successifs ({data.owners?.length ?? 0})</h2>
            {data.owners?.length ? (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>#</th><th>Nom et prénoms</th><th>Téléphone</th><th>Pièce</th><th>Depuis</th><th>Origine</th><th /></tr></thead>
                  <tbody>
                    {data.owners.map((o, i) => (
                      <tr key={i} style={o.current ? { background: 'var(--ok-bg)' } : undefined}>
                        <td>{i + 1}</td>
                        <td><strong>{o.name}</strong></td>
                        <td className="mono">{o.phone}</td>
                        <td className="small">{o.id_doc || '—'}</td>
                        <td>{dateTime(o.at)}</td>
                        <td className="small">{o.source}</td>
                        <td>{o.current ? <span className="badge ok">Propriétaire actuel</span> : <span className="badge muted">Ancien</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="empty">Aucun propriétaire enregistré</div>}
          </div>

          <div className="card">
            <h2>Historique des opérations ({data.history.length})</h2>
            {data.history.length ? (
              <ul className="timeline">
                {data.history.map((h) => (
                  <li key={h.id} className={h.type}>
                    <div><strong>{LABELS.txType[h.type]}</strong> · {dateTime(h.occurred_at)} · {fcfa(h.price)} · {LABELS.condition[h.condition]}</div>
                    <div className="small muted">
                      {h.shop_name} ({h.organization_name}) — {h.shop_city}, {h.shop_district} · {h.shop_phone} · saisi par {h.recorded_by} · reçu <span className="mono">{h.receipt_number}</span>
                    </div>
                    {h.supplier_name ? <div className="small">Fournisseur : {h.supplier_name}</div> : null}
                    {h.person ? (
                      <div style={{ marginTop: 8 }}>
                        <div className="small muted">{h.type === 'sale' ? 'Acheteur' : 'Vendeur'}</div>
                        <PersonCard p={h.person} />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : <div className="empty">Aucune opération</div>}
          </div>

          {data.theft_reports.length || data.alerts.length ? (
            <div className="two-col">
              <div className="card">
                <h2>Déclarations</h2>
                {!data.theft_reports.length ? <div className="muted">Aucune déclaration</div> : null}
                {data.theft_reports.map((r) => (
                  <div key={r.id} style={{ marginBottom: 10 }}>
                    <Badge kind="reportStatus" value={r.status} /> {dateTime(r.created_at)} — {r.reporter_name} ({r.reporter_phone}) {r.police_report_number ? `· PV ${r.police_report_number}` : ''}
                  </div>
                ))}
              </div>
              <div className="card">
                <h2>Alertes</h2>
                {!data.alerts.length ? <div className="muted">Aucune alerte</div> : null}
                {data.alerts.map((a) => (
                  <div key={a.id} style={{ marginBottom: 10 }}>
                    <span className="badge danger">{LABELS.alertType[a.type]}</span> {dateTime(a.created_at)} — {a.shop_name}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {d ? (
            <>
              <div className="card">
                <h2>Cartes SIM vues ({data.sim_events?.length ?? 0})</h2>
                <p className="muted small">Les SIM apparues <strong>après</strong> une déclaration de vol sont surlignées.</p>
                {!data.sim_events?.length ? <div className="empty">Aucune carte SIM signalée</div> : (
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Date</th><th>Numéro</th><th>Opérateur</th><th>Usager</th><th>IP</th><th>Contexte</th></tr></thead>
                      <tbody>
                        {data.sim_events.map((s) => (
                          <tr key={s.id} style={s.after_theft ? { background: 'var(--danger-bg, #fde8e8)' } : undefined}>
                            <td className="small">{dateTime(s.created_at)}</td>
                            <td className="mono">{s.phone_number || '—'}<div className="muted small">{s.sim_id}</div></td>
                            <td className="small">{s.operator || '—'}</td>
                            <td className="small">{s.consumer_name || '—'}<div className="muted small">{s.consumer_phone || ''}</div></td>
                            <td className="mono small">{s.ip || '—'}</td>
                            <td>{s.after_theft ? <span className="badge danger">Après vol</span> : <span className="badge muted">Normal</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="card">
                <h2>Adresses de connexion ({data.connections?.length ?? 0})</h2>
                {!data.connections?.length ? <div className="empty">Aucune connexion enregistrée</div> : (
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Date</th><th>Usager</th><th>Action</th><th>Adresse IP</th></tr></thead>
                      <tbody>
                        {data.connections.map((l, i) => (
                          <tr key={i}>
                            <td className="small">{dateTime(l.created_at)}</td>
                            <td className="small">{l.full_name || '—'}<div className="muted small">{l.phone || ''}{l.email ? ` · ${l.email}` : ''}</div></td>
                            <td className="mono small">{l.action}</td>
                            <td className="mono small">{l.ip || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {data.block_requests?.length ? (
                <div className="card">
                  <h2>Demandes de blocage opérateur ({data.block_requests.length})</h2>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Date</th><th>Statut</th><th>Opérateur</th><th>PV</th></tr></thead>
                      <tbody>
                        {data.block_requests.map((b) => (
                          <tr key={b.id}>
                            <td className="small">{dateTime(b.created_at)}</td>
                            <td className="small">{b.status}</td>
                            <td className="small">{b.operator || '—'}{b.operator_reference ? <div className="muted small mono">{b.operator_reference}</div> : null}</td>
                            <td className="small">{b.police_report_number || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}
