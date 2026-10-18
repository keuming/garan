import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Badge, ErrorBox, Pager } from '../components/ui.jsx';
import { dateTime, fcfa, LABELS } from '../format.js';

/** Registre des téléphones vendus : IMEI, acquéreur (nom, contact, CNI), boutique. */
export function Sales() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, error, isLoading } = useQuery({
    queryKey: ['sales', search, page],
    queryFn: () => api.get('/admin/sales', { q: search, page, limit: 25 }),
    placeholderData: keepPreviousData
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Téléphones vendus</h1>
          <p>Chaque téléphone vendu, lié à son acquéreur par l’IMEI. Données confidentielles — accès tracé.</p>
        </div>
      </div>

      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(q); }}>
        <input className="input" placeholder="IMEI, n° de CNI, nom ou n° de reçu…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" />
        <button className="btn" type="submit">Rechercher</button>
      </form>

      <ErrorBox error={error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Date</th><th>Téléphone / IMEI</th><th>Acquéreur</th><th>Pièce (CNI)</th><th>Boutique</th><th className="num">Prix</th></tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td colSpan={6} className="empty">Chargement…</td></tr> : null}
            {data?.items.map((s) => (
              <tr key={s.id}>
                <td>{dateTime(s.occurred_at)}<div className="muted small mono">{s.receipt_number}</div></td>
                <td>
                  {s.brand} {s.model}
                  <div className="mono small"><Link to={`/imei/${s.imei1}`}>{s.imei1}</Link>{s.imei2 ? ` · ${s.imei2}` : ''}</div>
                  {s.device_status !== 'active' ? <Badge kind="deviceStatus" value={s.device_status} /> : null}
                </td>
                <td>
                  {s.buyer_name}
                  {s.is_current_owner ? <span className="badge ok" style={{ marginLeft: 6 }}>Propriétaire actuel</span> : <span className="badge muted" style={{ marginLeft: 6 }}>Revendu depuis</span>}
                  <div className="muted small mono">{s.buyer_phone1}{s.buyer_phone2 ? ` / ${s.buyer_phone2}` : ''}</div>
                </td>
                <td className="small">{LABELS.docType[s.buyer_id_doc_type] ?? s.buyer_id_doc_type}<div className="mono">{s.buyer_id_doc_number}</div></td>
                <td>{s.shop_name}<div className="muted small">{s.organization_name}</div></td>
                <td className="num">{fcfa(s.price)}</td>
              </tr>
            ))}
            {data && !data.items.length ? <tr><td colSpan={6} className="empty">Aucune vente trouvée</td></tr> : null}
          </tbody>
        </table>
      </div>
      {data ? <Pager page={data.page} limit={data.limit} total={data.total} onPage={setPage} /> : null}
    </>
  );
}
