import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { Wordmark } from '../components/ui.jsx';

const GREEN = '#00B368';
const fcfa = (n) => `${Number(n ?? 0).toLocaleString('fr-FR')} FCFA`;

/** Vitrine publique d'une boutique : articles disponibles, partageable sur les réseaux. */
export function PublicShop() {
  const { shopId } = useParams();
  const url = typeof window !== 'undefined' ? window.location.href : '';
  const { data, error, isLoading } = useQuery({
    queryKey: ['public-shop', shopId],
    queryFn: () => api.public(`/public/shops/${shopId}`)
  });

  const shop = data?.shop;
  const items = data?.items ?? [];
  const title = shop ? `Téléphones disponibles chez ${shop.name}` : 'Boutique gaRAN';
  const shareText = encodeURIComponent(`🛍️ ${title} — voir et réserver :`);
  const shareUrl = encodeURIComponent(url);

  function copyLink() {
    try {
      navigator.clipboard.writeText(url);
      alert('Lien copié. Partagez-le sur vos réseaux.');
    } catch {
      /* clipboard indisponible */
    }
  }

  return (
    <div className="public" style={{ maxWidth: 1040, margin: '0 auto', padding: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <img src="/garan-icone-192.png" alt="" width={40} height={40} />
        <div>
          <Wordmark style={{ fontSize: 26 }} />
          <div className="muted small">Registre digital des téléphones · IMEI</div>
        </div>
      </header>

      {isLoading ? <div className="empty">Chargement…</div> : null}
      {error ? <div className="empty">Boutique introuvable ou indisponible.</div> : null}

      {shop ? (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <h1 style={{ margin: '0 0 4px', fontSize: 22 }}>{shop.name}</h1>
            <div className="muted">{shop.org_name} · {shop.city}, {shop.district}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              <a className="btn" href={`tel:${shop.phone}`} style={{ background: GREEN, borderColor: GREEN }}>📞 Appeler la boutique</a>
              <a className="btn secondary" href={`https://wa.me/?text=${shareText}%20${shareUrl}`} target="_blank" rel="noreferrer">Partager sur WhatsApp</a>
              <a className="btn secondary" href={`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`} target="_blank" rel="noreferrer">Facebook</a>
              <button className="btn secondary" type="button" onClick={copyLink}>Copier le lien</button>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="empty">Aucun article disponible pour le moment.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
              {items.map((it) => (
                <article key={it.id} className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ aspectRatio: '1 / 1', background: '#eef2f8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {it.photo_url ? (
                      <img src={it.photo_url} alt={it.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                    ) : (
                      <span style={{ fontSize: 40 }}>📱</span>
                    )}
                  </div>
                  <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                    <strong style={{ fontSize: 15 }}>{it.title}</strong>
                    <span style={{ fontSize: 17, fontWeight: 800, color: GREEN }}>{fcfa(it.price)}</span>
                    {it.description ? <span className="muted small" style={{ flex: 1 }}>{it.description}</span> : null}
                    <a
                      className="btn"
                      href={`https://wa.me/?text=${encodeURIComponent(`Bonjour, le ${it.title} à ${fcfa(it.price)} est-il toujours disponible ?`)}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ background: GREEN, borderColor: GREEN, textAlign: 'center', marginTop: 4 }}
                    >
                      Réserver / Demander
                    </a>
                  </div>
                </article>
              ))}
            </div>
          )}

          <p className="muted small" style={{ textAlign: 'center', marginTop: 24 }}>
            Chaque téléphone vendu par cette boutique est enregistré dans gaRAN avec son IMEI. Avant d’acheter d’occasion, vérifiez l’IMEI sur gaRAN.
          </p>
        </>
      ) : null}
    </div>
  );
}
