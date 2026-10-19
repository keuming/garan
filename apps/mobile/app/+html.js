import { ScrollViewStyleReset } from 'expo-router/html';

/**
 * Enveloppe HTML de la version web (PWA). Ajoute le manifeste, les icônes Apple
 * (pour « Ajouter à l'écran d'accueil » sur iPhone) et enregistre le service worker.
 */
const SW_REGISTER = `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').then(function (reg) {
      setInterval(function () { reg.update(); }, 60 * 60 * 1000);
    }).catch(function () {});
  });
}`;

export default function Root({ children }) {
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <meta name="theme-color" content="#00D27A" />
        <meta name="description" content="Registre digital des téléphones par IMEI" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/icon-192.png" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="gaRAN" />
        <title>gaRAN</title>
        <ScrollViewStyleReset />
        <script dangerouslySetInnerHTML={{ __html: SW_REGISTER }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
