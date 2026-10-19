// Page vitrine rendue côté serveur pour les réseaux sociaux : renvoie l'application web
// (index.html) avec les balises Open Graph de la boutique (titre, description, image),
// pour que Facebook, WhatsApp, etc. affichent un bel aperçu au partage du lien.
const API = (process.env.GARAN_API_URL ?? 'https://garan-api.onrender.com').replace(/\/$/, '');
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fcfa = (n) => `${Number(n ?? 0).toLocaleString('fr-FR').replace(/ | /g, ' ')} FCFA`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getJson(url, ms = 6000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  const host = req.headers['x-forwarded-host'] ?? req.headers.host;
  const origin = `https://${host}`;
  const { shopId, a } = req.query ?? {};

  const shell = await fetch(`${origin}/index.html`).then((r) => r.text()).catch(() => null);
  if (!shell) {
    res.status(502).send('Service momentanément indisponible');
    return;
  }

  const data = typeof shopId === 'string' && UUID.test(shopId) ? await getJson(`${API}/api/v1/public/shops/${shopId}`) : null;
  let html = shell;
  if (data?.shop) {
    const { shop, items = [] } = data;
    const item = typeof a === 'string' ? items.find((i) => i.id === a) : null;
    const withPhoto = item?.photo_url ? item : items.find((i) => i.photo_url);
    const title = item ? `${item.title} — ${fcfa(item.price)} · ${shop.name}` : `${shop.name} — téléphones disponibles`;
    const names = items.slice(0, 3).map((i) => i.title).join(', ');
    const description = item
      ? `${item.description ? `${item.description} ` : ''}Disponible chez ${shop.name} (${shop.city}, ${shop.district}). Réservez sur WhatsApp.`
      : items.length
        ? `${items.length} ${items.length > 1 ? 'articles disponibles' : 'article disponible'} : ${names}${items.length > 3 ? '…' : ''}. ${shop.city}, ${shop.district}.`
        : `${shop.name} — ${shop.city}, ${shop.district}. Téléphones vérifiés par IMEI sur gaRAN.`;
    const image = withPhoto?.photo_url ?? `${origin}/garan-icone-512.png`;
    const url = `${origin}/boutique/${shopId}${item ? `?a=${item.id}` : ''}`;
    const tags = [
      ['og:type', 'website'],
      ['og:site_name', 'gaRAN'],
      ['og:locale', 'fr_FR'],
      ['og:title', title],
      ['og:description', description],
      ['og:image', image],
      ['og:url', url]
    ]
      .map(([k, v]) => `<meta property="${k}" content="${esc(v)}" />`)
      .concat([
        `<meta name="description" content="${esc(description)}" />`,
        `<meta name="twitter:card" content="${withPhoto ? 'summary_large_image' : 'summary'}" />`,
        `<meta name="twitter:title" content="${esc(title)}" />`,
        `<meta name="twitter:description" content="${esc(description)}" />`,
        `<meta name="twitter:image" content="${esc(image)}" />`,
        `<link rel="canonical" href="${esc(url)}" />`
      ])
      .join('\n    ');
    html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`).replace('</head>', `    ${tags}\n  </head>`);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
  res.status(200).send(html);
}
