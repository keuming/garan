import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { ErrorBox } from '../components/ui.jsx';
import { dateTime } from '../format.js';

const KIND = { stolen: 'Volé', lost: 'Perdu' };

/** Back-office : registre des téléphones déclarés volés/perdus (même liste que la page publique). */
export function RegistreVoles() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const { data, error } = useQuery({
    queryKey: ['registre-voles', query],
    queryFn: () => api.public(`/public/stolen-devices${query ? `?q=${encodeURIComponent(query)}` : ''}`),
    placeholderData: keepPreviousData
  });
  const items = data?.items ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Registre des volés</h1>
          <p>Téléphones déclarés volés ou perdus, visibles publiquement sur le réseau gaRAN (page publique : <code>/voles</code>).</p>
        </div>
      </div>
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setQuery(q.replace(/\D/g, '')); }}>
        <input className="input mono" inputMode="numeric" maxLength={20} placeholder="Rechercher un IMEI" value={q} onChange={(e) => setQ(e.target.value)} aria-label="IMEI" />
        <button className="btn" type="submit">Rechercher</button>
        {query ? <button className="btn secondary" type="button" onClick={() => { setQ(''); setQuery(''); }}>Tout voir</button> : null}
      </form>
      <ErrorBox error={error} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>IMEI</th><th>Appareil</th><th>Statut</th><th>Signalé le</th></tr></thead>
          <tbody>
            {items.map((d, i) => (
              <tr key={i}>
                <td><Link className="mono" to={`/imei/${d.imei1}`}>{d.imei1}</Link>{d.imei2 ? <div className="muted small mono">{d.imei2}</div> : null}</td>
                <td className="small">{[d.brand, d.model].filter(Boolean).join(' ') || '—'}</td>
                <td><span className="badge danger">{KIND[d.kind] ?? d.kind}</span></td>
                <td className="small">{d.reported_at ? dateTime(d.reported_at) : '—'}</td>
              </tr>
            ))}
            {data && !items.length ? (
              <tr><td colSpan={4} className="empty">Aucun téléphone signalé{query ? ' pour cette recherche' : ''}.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
