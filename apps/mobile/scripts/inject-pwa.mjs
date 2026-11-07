// Post-traitement de l'export web Expo (mode 'single').
// En mode 'single', Expo ignore app/+html.js : on réinjecte donc dans dist/index.html
//  - les balises PWA (manifeste, icônes Apple, thème, meta « add to home screen » iOS),
//  - la coque web (colonne mobile centrée sur grand écran, look identique au téléphone),
//  - l'enregistrement du service worker (mises à jour sans réinstallation).
import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('dist/index.html');
let html = fs.readFileSync(file, 'utf8');

if (!html.includes('garan-web-shell')) {
  html = html.replace('<html lang="en">', '<html lang="fr">');

  const headInject = `
    <link rel="manifest" href="/manifest.json" />
    <link rel="icon" href="/icon-192.png" />
    <link rel="apple-touch-icon" href="/icon-192.png" />
    <meta name="theme-color" content="#00C271" />
    <meta name="description" content="Registre digital des téléphones par IMEI" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="gaRAN" />
    <style id="garan-web-shell">
      html, body { margin: 0; padding: 0; height: 100%; background: #0C2F23; }
      #root { width: 100%; max-width: 480px; margin: 0 auto; min-height: 100vh; background: #F3F8F5; box-shadow: 0 0 60px rgba(0,0,0,0.35); }
    </style>
`;
  html = html.replace('</head>', `${headInject}  </head>`);

  const swScript = `<script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').then(function(reg){setInterval(function(){reg.update();},3600000);}).catch(function(){});});}</script>`;
  html = html.replace('</body>', `${swScript}</body>`);

  fs.writeFileSync(file, html);
  console.log('[inject-pwa] Balises PWA + coque web + service worker injectés dans dist/index.html');
} else {
  console.log('[inject-pwa] Déjà injecté, rien à faire.');
}
