import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { ErrorBox, Wordmark } from '../components/ui.jsx';
import { dateTime } from '../format.js';

const KIND = { stolen: 'Volé', lost: 'Perdu' };

/** Page publique : registre des téléphones déclarés volés/perdus, consultable par tous. */
export function PublicStolen() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const { data, error, isFetching } = useQuery({
    queryKey: ['public-stolen', query],
    queryFn: () => api.public(`/public/stolen-devices${query ? `?q=${encodeURIComponent(query)}` : ''}`),
    placeholderData: keepPreviousData
  });
  const items = data?.items ?? [];

  return (
    <div className="public">
      <header>
        <img src="/garan-icone-192.png" alt="" />
        <div>
          <Wordmark style={{ fontSize: 28 }} />
          <div className="muted small">Registre public des téléphones volés</div>
        </div>
      </header>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2>Téléphones déclarés volés ou perdus</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Alerte réseau gaRAN. N’achetez jamais un téléphone présent dans cette liste. Pour vérifier un IMEI précis, utilisez la page{' '}
          <Link to="/verifier">Vérifier un téléphone</Link>.
        </p>
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
                  <td className="mono">{d.imei1}{d.imei2 ? <div className="muted small">{d.imei2}</div> : null}</td>
                  <td>{[d.brand, d.model].filter(Boolean).join(' ') || '—'}</td>
                  <td><span className="badge danger">{KIND[d.kind] ?? d.kind}</span></td>
                  <td className="small">{d.reported_at ? dateTime(d.reported_at) : '—'}</td>
                </tr>
              ))}
              {!items.length && !isFetching ? (
                <tr><td colSpan={4} className="empty">Aucun téléphone signalé{query ? ' pour cette recherche' : ''}.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="muted small" style={{ margin: 0 }}>Les 200 signalements confirmés les plus récents. Un téléphone retrouvé ou régularisé n’apparaît plus ici.</p>
      </div>
    </div>
  );
}
