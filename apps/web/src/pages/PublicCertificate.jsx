import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { Wordmark } from '../components/ui.jsx';
import { date, LABELS } from '../format.js';

/** Page ouverte par le QR code du reçu : prouve l'achat sans le carton du téléphone. */
export function PublicCertificate() {
  const { code } = useParams();
  const { data: c, error, isLoading } = useQuery({
    queryKey: ['certificate', code],
    queryFn: () => api.public(`/public/certificates/${encodeURIComponent(code)}`),
    retry: false
  });

  return (
    <div className="public">
      <header>
        <img src="/garan-icone-192.png" alt="" />
        <div>
          <Wordmark style={{ fontSize: 28 }} />
          <div className="muted small">Certificat de propriété</div>
        </div>
      </header>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {isLoading ? <div className="empty">Vérification…</div> : null}
        {error ? (
          <div className="verdict danger">
            <div><strong>Certificat introuvable</strong>Ce code ne correspond à aucune vente enregistrée dans gaRAN.</div>
          </div>
        ) : null}
        {c ? (
          <>
            <div className={`verdict ${c.device.status === 'active' ? 'ok' : 'danger'}`}>
              <div>
                <strong>{c.device.status === 'active' ? 'Vente authentique' : 'Attention : téléphone signalé'}</strong>
                {c.is_current_owner ? 'L’acheteur ci-dessous est le propriétaire actuel enregistré.' : 'Ce téléphone a changé de propriétaire depuis cette vente.'}
              </div>
            </div>
            <dl className="dl">
              <dt>Téléphone</dt><dd>{c.device.brand} {c.device.model}</dd>
              <dt>IMEI</dt><dd className="mono">{c.device.imei}</dd>
              <dt>État à la vente</dt><dd>{LABELS.condition[c.condition]}</dd>
              <dt>Date de vente</dt><dd>{date(c.sold_at)}</dd>
              <dt>Boutique</dt><dd>{c.shop.name} — {c.shop.city}, {c.shop.district}</dd>
              <dt>Acheteur</dt><dd>{c.buyer}</dd>
              <dt>N° de reçu</dt><dd className="mono">{c.receipt_number}</dd>
            </dl>
          </>
        ) : null}
      </div>
      <Link to="/verifier">Vérifier un autre téléphone ou déclarer un vol</Link>
    </div>
  );
}
