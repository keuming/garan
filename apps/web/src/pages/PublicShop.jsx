import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';

const GREEN = '#00B368';
const INK = '#0f172a';
const fcfa = (n) => `${Number(n ?? 0).toLocaleString('fr-FR')} FCFA`;

/** Numéro WhatsApp international (chiffres seuls) ; un numéro local à 10 chiffres est supposé ivoirien. */
function waNumber(phone) {
  const raw = String(phone ?? '').trim();
  let d = raw.replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  else if (!raw.startsWith('+') && d.length === 10 && d.startsWith('0')) d = `225${d}`;
  return d;
}

/** Vignette produit : image couvrante, avec repli propre si l'image ne charge pas. */
function ProductImage({ src, alt }) {
  const [failed, setFailed] = useState(false);
  const wrap = { aspectRatio: '1 / 1', background: '#eef2f7', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' };
  if (!src || failed) return <div style={wrap}><span style={{ fontSize: 46 }}>📱</span></div>;
  return (
    <div style={wrap}>
      <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
    </div>
  );
}

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
  const wa = waNumber(shop?.phone);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (shop) document.title = `${shop.name} — téléphones disponibles | gaRAN`;
  }, [shop]);

  async function shareItem(it) {
    const text = `📱 ${it.title} — ${fcfa(it.price)}, disponible chez ${shop.name}. Voir et réserver :`;
    const itemUrl = `${window.location.origin}/boutique/${shopId}?a=${it.id}`;
    try {
      if (navigator.share) { await navigator.share({ title: it.title, text, url: itemUrl }); return; }
    } catch { return; }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${itemUrl}`)}`, '_blank', 'noopener');
  }

  function copyLink() {
    try { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  }

  const page = { maxWidth: 1040, margin: '0 auto', padding: '20px 16px 48px', color: INK, fontFamily: 'Sora, system-ui, -apple-system, Segoe UI, Roboto, sans-serif' };
  const btn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '11px 16px', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none', cursor: 'pointer', border: '1px solid transparent' };
  const btnPrimary = { ...btn, background: GREEN, color: '#fff' };
  const btnGhost = { ...btn, background: '#fff', color: INK, borderColor: '#d9e1ec' };

  return (
    <div style={page}>
      <style>{`
        .gr-card{background:#fff;border:1px solid #e7edf5;border-radius:16px;box-shadow:0 1px 2px rgba(15,23,42,.04)}
        .gr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px}
        @media(max-width:520px){.gr-grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}}
        .gr-prod{overflow:hidden;display:flex;flex-direction:column;transition:box-shadow .15s,transform .15s}
        .gr-prod:hover{box-shadow:0 8px 24px rgba(15,23,42,.10);transform:translateY(-2px)}
      `}</style>

      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <img src="/garan-icone-192.png" alt="" width={42} height={42} style={{ borderRadius: 10 }} />
        <div style={{ lineHeight: 1.15 }}>
          <div style={{ fontSize: 24, fontWeight: 800 }}>ga<span style={{ color: GREEN }}>RAN</span></div>
          <div style={{ fontSize: 12, color: '#64748b' }}>Boutique vérifiée · registre IMEI</div>
        </div>
      </header>

      {isLoading ? <div className="gr-card" style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Chargement…</div> : null}
      {error ? <div className="gr-card" style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Boutique introuvable ou indisponible.</div> : null}

      {shop ? (
        <>
          <section className="gr-card" style={{ padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#e8f8f0', color: '#047a52', fontWeight: 700, fontSize: 12, padding: '4px 10px', borderRadius: 999, marginBottom: 10 }}>
              ✓ Boutique sur le réseau gaRAN
            </div>
            <h1 style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 800 }}>{shop.name}</h1>
            <div style={{ color: '#64748b', fontSize: 14 }}>{shop.city}{shop.district ? `, ${shop.district}` : ''}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
              {wa ? <a style={btnPrimary} href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">💬 Contacter sur WhatsApp</a> : null}
              <a style={btnGhost} href={`tel:${shop.phone}`}>📞 Appeler</a>
              <a style={btnGhost} href={`https://wa.me/?text=${shareText}%20${shareUrl}`} target="_blank" rel="noreferrer">Partager</a>
              <button type="button" style={btnGhost} onClick={copyLink}>{copied ? 'Lien copié ✓' : 'Copier le lien'}</button>
            </div>
          </section>

          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>
            {items.length ? `${items.length} article${items.length > 1 ? 's' : ''} disponible${items.length > 1 ? 's' : ''}` : 'Catalogue'}
          </h2>

          {items.length === 0 ? (
            <div className="gr-card" style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Aucun article disponible pour le moment.</div>
          ) : (
            <div className="gr-grid">
              {items.map((it) => (
                <article key={it.id} className="gr-card gr-prod">
                  <ProductImage src={it.photo_url} alt={it.title} />
                  <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
                    <strong style={{ fontSize: 15, lineHeight: 1.25 }}>{it.title}</strong>
                    <span style={{ fontSize: 18, fontWeight: 800, color: GREEN }}>{fcfa(it.price)}</span>
                    {it.description ? <span style={{ fontSize: 13, color: '#64748b', flex: 1 }}>{it.description}</span> : <span style={{ flex: 1 }} />}
                    <a
                      style={{ ...btnPrimary, justifyContent: 'center', marginTop: 2 }}
                      href={`https://wa.me/${wa}?text=${encodeURIComponent(`Bonjour, le ${it.title} à ${fcfa(it.price)} est-il toujours disponible ?`)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Réserver sur WhatsApp
                    </a>
                    <button type="button" style={{ ...btnGhost, justifyContent: 'center' }} onClick={() => shareItem(it)}>Partager</button>
                  </div>
                </article>
              ))}
            </div>
          )}

          <p style={{ textAlign: 'center', marginTop: 28, color: '#94a3b8', fontSize: 12.5, lineHeight: 1.5 }}>
            Chaque téléphone vendu par cette boutique est enregistré dans gaRAN avec son IMEI.<br />
            Avant d’acheter d’occasion, vérifiez l’IMEI sur <a href="/verifier" style={{ color: GREEN, fontWeight: 600 }}>gaRAN</a>.
          </p>
        </>
      ) : null}
    </div>
  );
}
