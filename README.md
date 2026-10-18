# gaRAN — Registre digital des téléphones · IMEI

Monorepo du MVP gaRAN (ORZAYAH Services).

```
garan/
├── apps/
│   ├── api/        API Node 22 / Express 5 / PostgreSQL  → Render
│   │   ├── migrations/      001_init.sql, 002_seed_catalog.sql (Neon)
│   │   ├── src/
│   │   │   ├── app.js, server.js, config.js, db.js, logger.js
│   │   │   ├── lib/         errors, validate, imei, phone, security, storage, audit
│   │   │   ├── middleware/  auth (rôles, abonnement, portée magasin), rateLimit
│   │   │   └── modules/     auth, catalog, registry (cœur métier), org, public, admin
│   │   ├── scripts/         migrate.js, create-admin.js
│   │   └── test/            api.test.js (15 scénarios de bout en bout)
│   ├── web/        Back-office React + pages publiques     → Vercel
│   │   └── src/pages/       Dashboard, Organizations, ImeiSearch, TheftReports, Alerts,
│   │                        Catalog, Admins, AuditLog, PublicCheck (/verifier), PublicCertificate (/v/:code)
│   └── mobile/     Expo SDK 58 — apps Magasin et Superviseur → EAS
│       ├── app/             (auth)/login, register · (app)/home, operation, check,
│       │                    receipt/[id], history, stats, shops, users, account
│       └── src/             components (ImeiField + scan, IdPhotoField, BrandModelPicker, ui), lib
├── docs/ARCHITECTURE.md
└── render.yaml
```

## 1. Base de données (Neon)

Dans l’éditeur SQL de Neon, exécutez dans l’ordre `apps/api/migrations/001_init.sql` puis `002_seed_catalog.sql`
(ou `npm run migrate` depuis `apps/api`, qui les applique une seule fois et les trace dans `schema_migrations`).

## 2. API

```bash
cd apps/api
cp .env.example .env          # renseigner DATABASE_URL (URL « pooled » Neon) et JWT_ACCESS_SECRET
npm install
npm run migrate:local
npm run create-admin -- vous@orzayah.com "Votre Nom" "MotDePasseTrèsFort" superadmin
npm run dev                   # http://localhost:4000/health
```

Tests (base jetable, réinitialisée à chaque exécution) :
```bash
TEST_DATABASE_URL=postgres://user@localhost:5432/garan_test npm test
```

Production (Render) : `render.yaml` crée le service ; renseignez `DATABASE_URL` et les variables `S3_*`
(Cloudflare R2 conseillé). Les migrations s’exécutent avant chaque déploiement.

## 3. Back-office web

```bash
cd apps/web
npm install
npm run dev                   # http://localhost:5173 (relaie /api vers :4000)
```
Vercel : racine `apps/web`, build `npm run build`, sortie `dist`. Mettez l’URL de votre API dans `vercel.json`
(réécriture `/api/*`) ou définissez `VITE_API_URL`.

## 4. Apps mobiles

```bash
cd apps/mobile
npm install && npx expo install --fix
EXPO_PUBLIC_API_URL=http://<IP-de-votre-machine>:4000 npx expo start            # app Magasin
APP_VARIANT=supervisor EXPO_PUBLIC_API_URL=http://<IP>:4000 npx expo start     # app Superviseur
```
Publication : `eas build --profile shop` et `eas build --profile supervisor` (deux fiches Play Store / App Store).

## 5. Avant le lancement

- Déclaration du traitement de données personnelles (pièces d’identité) auprès de l’ARTCI.
- Domaine et certificat : `garan.ci` (pages publiques et QR des certificats) — à adapter dans `PUBLIC_WEB_URL`.
- Créer le bucket R2 privé et ses clés d’accès.
