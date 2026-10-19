/**
 * Application gaRAN unique (un seul APK). Le profil — marchand, super marchand
 * ou usager — est choisi à l'inscription et à la connexion, pas au build.
 */
const allowCleartext = process.env.ALLOW_CLEARTEXT === 'true'; // APK de test sur réseau local (http://)

// ID du projet EAS. Après `eas init`, collez l'identifiant affiché entre les quotes ci-dessous
// (ex. '12345678-abcd-...'), ou laissez `eas init` le renseigner automatiquement.
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID ?? 'fbd41f42-d764-40bf-a13e-6abc2e602848';

export default {
  expo: {
    name: 'gaRAN',
    slug: 'garan',
    scheme: 'garan',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    splash: { image: './assets/splash.png', resizeMode: 'contain', backgroundColor: '#00D27A' },
    ios: {
      bundleIdentifier: 'com.orzayah.garan',
      supportsTablet: true,
      infoPlist: { NSCameraUsageDescription: 'La caméra sert à scanner l’IMEI et à photographier les pièces (reçu, carton, pièce d’identité).' }
    },
    android: {
      package: 'com.orzayah.garan',
      adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#00D27A' },
      permissions: ['CAMERA']
    },
    plugins: [
      'expo-router',
      'expo-secure-store',
      ['expo-camera', { cameraPermission: 'La caméra sert à scanner l’IMEI et à photographier les pièces.' }],
      ['expo-image-picker', { cameraPermission: 'La caméra sert à photographier les pièces (reçu, carton, pièce d’identité).' }],
      ['expo-build-properties', { android: { usesCleartextTraffic: allowCleartext } }]
    ],
    experiments: { typedRoutes: false },
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'https://garan-api.onrender.com',
      publicWebUrl: process.env.EXPO_PUBLIC_WEB_URL ?? 'https://garan.orzayah.com',
      eas: { projectId: EAS_PROJECT_ID || undefined }
    }
  }
};
