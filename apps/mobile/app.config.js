/**
 * Une seule base de code, deux applications publiées :
 *  - APP_VARIANT=shop        → « gaRAN Magasin »     (ventes, rachats, entrées en stock)
 *  - APP_VARIANT=supervisor  → « gaRAN Superviseur » (grossiste : magasins, comptes, états consolidés)
 */
const variant = process.env.APP_VARIANT === 'supervisor' ? 'supervisor' : 'shop';
const isSupervisor = variant === 'supervisor';

export default {
  expo: {
    name: isSupervisor ? 'gaRAN Superviseur' : 'gaRAN Magasin',
    slug: isSupervisor ? 'garan-superviseur' : 'garan-magasin',
    scheme: isSupervisor ? 'garansup' : 'garan',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    splash: { image: './assets/splash.png', resizeMode: 'contain', backgroundColor: '#1463F3' },
    ios: {
      bundleIdentifier: isSupervisor ? 'com.orzayah.garan.supervisor' : 'com.orzayah.garan.shop',
      supportsTablet: true,
      infoPlist: {
        NSCameraUsageDescription: 'La caméra sert à scanner l’IMEI et à photographier la pièce d’identité du client.'
      }
    },
    android: {
      package: isSupervisor ? 'com.orzayah.garan.supervisor' : 'com.orzayah.garan.shop',
      adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#1463F3' },
      permissions: ['CAMERA']
    },
    plugins: [
      'expo-router',
      'expo-secure-store',
      ['expo-camera', { cameraPermission: 'La caméra sert à scanner l’IMEI et à photographier la pièce d’identité du client.' }],
      ['expo-image-picker', { cameraPermission: 'La caméra sert à photographier la pièce d’identité du client.' }]
    ],
    experiments: { typedRoutes: false },
    extra: {
      variant,
      apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'https://garan-api.onrender.com',
      publicWebUrl: process.env.EXPO_PUBLIC_WEB_URL ?? 'https://garan.ci',
      eas: { projectId: process.env.EAS_PROJECT_ID }
    }
  }
};
