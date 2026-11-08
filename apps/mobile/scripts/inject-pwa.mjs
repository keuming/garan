// Post-traitement de l'export web Expo (mode 'single').
// En mode 'single', Expo ignore app/+html.js : on réinjecte donc dans dist/index.html
//  - les balises PWA (manifeste, icônes Apple, thème, meta « add to home screen » iOS),
//  - la coque web (colonne mobile centrée sur grand écran, look identique au téléphone),
//  - l'enregistrement du service worker (mises à jour sans réinstallation).
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// Identifiant de build unique : horodatage + court SHA git si disponible.
// Il est tamponné dans dist/sw.js pour que le fichier diffère d'octets à chaque
// déploiement — sans quoi le navigateur ne détecte jamais de nouvelle version.
let gitSha = '';
try { gitSha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* hors dépôt */ }
const BUILD_ID = `${Date.now()}${gitSha ? '-' + gitSha : ''}`;

// 1) Tamponner le service worker.
const swFile = path.resolve('dist/sw.js');
if (fs.existsSync(swFile)) {
  let sw = fs.readFileSync(swFile, 'utf8');
  if (sw.includes('__BUILD_ID__')) {
    sw = sw.split('__BUILD_ID__').join(BUILD_ID);
  } else if (!sw.includes('/* build:')) {
    // Filet de sécurité si le token a disparu : un commentaire suffit à changer les octets.
    sw = `/* build: ${BUILD_ID} */\n${sw}`;
  }
  fs.writeFileSync(swFile, sw);
  console.log(`[inject-pwa] Service worker versionné (build ${BUILD_ID}).`);
}

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
      /* Coque adaptable : plein écran sur téléphone, canevas centré plus large
         sur tablette et ordinateur (la largeur du contenu est gérée par l'app). */
      html, body { margin: 0; padding: 0; min-height: 100%; background: #0C2F23; }
      #root { width: 100%; margin: 0 auto; min-height: 100vh; background: #F3F8F5; }
      @media (min-width: 760px) {
        #root { max-width: 1120px; box-shadow: 0 0 60px rgba(0,0,0,0.25); }
      }
    </style>
`;
  html = html.replace('</head>', `${headInject}  </head>`);

  // Enregistrement du service worker + vérifications de mise à jour.
  // updateViaCache:'none' force le navigateur à re-télécharger sw.js depuis le réseau
  // à chaque reg.update() (sinon il peut servir l'ancien sw.js depuis son cache HTTP).
  // On vérifie au chargement, au retour sur l'onglet, et toutes les 30 min.
  const swScript = `<script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(function(reg){function u(){try{reg.update();}catch(e){}}u();setInterval(u,1800000);document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')u();});}).catch(function(){});});}</script>`;
  html = html.replace('</body>', `${swScript}</body>`);

  fs.writeFileSync(file, html);
  console.log('[inject-pwa] Balises PWA + coque web + service worker injectés dans dist/index.html');
} else {
  console.log('[inject-pwa] Déjà injecté, rien à faire.');
}
