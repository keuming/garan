# gaRAN — Architecture technique

> Registre digital des ventes et rachats de téléphones par IMEI, pour les boutiques d’Afrique de l’Ouest et centrale.
> MVP prêt pour la production, conçu pour passer de quelques boutiques à des millions d’opérations sans réécriture.

---

## 1. Vue d’ensemble

```
┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────────┐
│ App Magasin (Expo)   │   │ App Superviseur(Expo)│   │ Web (Vercel, React/Vite) │
│ vente · rachat ·     │   │ magasins · comptes · │   │ back-office promoteur    │
│ stock · scan IMEI    │   │ états consolidés     │   │ + pages publiques /v /verifier
└─────────┬────────────┘   └─────────┬────────────┘   └────────────┬─────────────┘
          │  HTTPS JSON  (JWT 15 min + refresh token rotatif)       │
          └──────────────────────────┼─────────────────────────────┘
                                     ▼
                     ┌──────────────────────────────┐
                     │ API gaRAN  (Render, Node 22) │  stateless → N instances
                     │ Express 5 · zod · pino       │
                     └───────┬──────────────┬───────┘
                             │              │
              ┌──────────────▼───┐   ┌──────▼────────────────────┐
              │ PostgreSQL (Neon)│   │ Stockage objet S3/R2      │
              │ registre immuable│   │ pièces d’identité privées │
              └──────────────────┘   └───────────────────────────┘
```

| Couche | Choix | Pourquoi |
|---|---|---|
| Mobile | React Native + Expo SDK 58, expo-router | Une base de code, deux apps publiées (variante `shop` / `supervisor`), scan caméra natif, builds EAS |
| Web | React 18 + Vite + TanStack Query | Back-office rapide, cache côté client, déployé en statique sur Vercel |
| API | Node 22, Express 5 (ESM), zod, pino | Simple, sans état, validations strictes, logs JSON |
| Données | PostgreSQL 16 (Neon) | Transactions ACID indispensables (deux ventes simultanées du même IMEI impossibles) |
| Fichiers | S3 compatible (Cloudflare R2 conseillé) | Pièces d’identité hors base, privées, chiffrées |

## 2. Règles métier (le cœur du produit)

Chaque téléphone (`devices`) a **un détenteur unique** : `none`, `shop` (en stock) ou `person` (vendu).
Chaque mouvement est une ligne **immuable** de `transactions` (un trigger interdit UPDATE/DELETE).

| Opération | Autorisée si… | Effet |
|---|---|---|
| **Entrée en stock** | IMEI inconnu ou sans détenteur, non signalé | détenteur → magasin |
| **Rachat** | non signalé **et** (inconnu, ou détenu par **cette même personne** identifiée par sa pièce) | détenteur → magasin ; vendeur identifié + CNI recto/verso |
| **Vente** | non signalé **et** (inconnu, ou en stock dans l’organisation) | détenteur → acheteur ; reçu + certificat QR |

Garde-fous :
- **IMEI** : 15 chiffres + clé de Luhn (contrôlée sur l’app *et* l’API) ; double SIM gérée (un IMEI ne peut exister qu’une fois, en IMEI1 ou IMEI2).
- **Téléphone signalé** (volé/perdu/bloqué) : opération refusée **et alerte de sécurité** enregistrée (persistée même si l’opération échoue).
- **Vendeur ≠ propriétaire** au rachat : refus + alerte.
- **Pièce d’identité** : recto + verso obligatoires (ou déjà au dossier pour cette personne).
- **Verrou de ligne** (`SELECT … FOR UPDATE`) sur l’appareil pendant chaque opération.
- **Certificat de propriété** : code public de 10 caractères → `https://garan.ci/v/<code>` (QR sur le reçu). Le client prouve son achat sans le carton.
- **Déclaration de vol publique** : confirmée automatiquement si le déclarant présente la pièce du propriétaire enregistré, sinon revue par l’équipe.

## 3. Rôles et accès

| Acteur | Accès |
|---|---|
| `owner` (compte principal / grossiste) | tous les magasins de son organisation, création de magasins et de comptes agents, états consolidés |
| `agent` (vendeur d’un magasin) | opérations et états de **son** magasin uniquement |
| `superadmin` / `admin` | back-office complet (clients, abonnements, référentiel, déclarations) |
| `support` | lecture clients |
| `police` | historique IMEI complet, pièces d’identité, alertes — chaque consultation est tracée |

Isolation multi-tenant : toutes les requêtes mobiles sont filtrées par `organization_id` (et `shop_id` pour un agent), dérivés du jeton, jamais du client.

## 4. Sécurité

- PIN 4 chiffres haché **bcrypt** ; verrouillage 15 min après 5 échecs ; limitation de débit par IP.
- JWT d’accès 15 min (audience `user` ≠ `admin`) + refresh token opaque **haché en base, rotatif** (réutilisation = rejet).
- Changement de PIN / désactivation → révocation de toutes les sessions.
- Pièces d’identité : type vérifié par signature binaire (pas l’extension), clés de stockage cloisonnées par organisation, lecture uniquement via l’API (jamais d’URL publique), **journal d’audit** à chaque consultation.
- Registre immuable au niveau base, journal d’audit des actions sensibles, Helmet, CORS restreint.
- Données personnelles : déclaration à l’**ARTCI** (loi ivoirienne n° 2013-450) à effectuer avant lancement ; prévoir une politique de conservation.

## 5. Schéma de base de données

Fichiers : `apps/api/migrations/001_init.sql` (schéma) et `002_seed_catalog.sql` (14 marques, 94 modèles).

```
organizations 1─┬─n shops 1──n users (owner | agent)
                ├─n subscription_payments
                └─n transactions n──1 devices n──1 brands / models
                         │                 │
                         └──n─1 persons ◄──┘ (owner_person_id)
theft_reports n──1 devices      security_alerts n──1 devices
admins · refresh_tokens · audit_logs
```

Index clés : `(shop_id, occurred_at DESC)`, `(organization_id, occurred_at DESC)`, `(device_id, occurred_at DESC)`, IMEI uniques, pièce `(type, upper(numéro))` unique.

## 6. API REST — `/api/v1`

**Auth** — `POST /auth/register` · `POST /auth/login` · `POST /auth/admin/login` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me` · `POST /auth/me/pin`

**Magasin (mobile, JWT user)**
| Méthode | Route | Rôle |
|---|---|---|
| GET | `/catalog/brands`, `/catalog/models?brand_id&q` | référentiel (public, cacheable) |
| GET | `/devices/check/:imei` | statut, détenteur, `can_buy` / `can_sell` |
| GET | `/persons/lookup?id_doc_type&id_doc_number` | préremplissage du nom |
| POST | `/uploads/id-document` (multipart `file`) | photo de pièce → `key` |
| POST | `/transactions/stock-in` · `/transactions/purchases` · `/transactions/sales` | opérations |
| GET | `/transactions?type&q&from&to&shop_id&page` · `/transactions/:id` | historique, reçu |
| GET | `/stats/summary?type&from&to&shop_id` | totaux, par marque, par modèle, par magasin |

**Superviseur (owner)** — `GET/POST /org/shops` · `PATCH /org/shops/:id` · `GET/POST /org/users` · `PATCH /org/users/:id`

**Public** — `GET /public/imei/:imei` · `GET /public/certificates/:code` · `POST /public/theft-reports`

**Back-office** — `GET /admin/dashboard` · `GET /admin/organizations` · `GET|PATCH /admin/organizations/:id` · `POST /admin/organizations/:id/payments` · `GET /admin/devices/:imei` · `GET /admin/documents?key` · `GET|PATCH /admin/theft-reports` · `GET|PATCH /admin/alerts` · `GET|POST|PATCH /admin/catalog/brands|models` · `GET /admin/audit-logs` · `GET|POST|PATCH /admin/admins`

Erreurs : `{ "error": { "code": "OWNERSHIP_MISMATCH", "message": "…", "details": … } }` — codes stables exploités par les apps (`DEVICE_REPORTED`, `ALREADY_IN_STOCK`, `ID_PHOTOS_REQUIRED`, `SUBSCRIPTION_INACTIVE` (402), `ACCOUNT_LOCKED` (423)…).

## 7. Architecture des interfaces

**App Magasin** (`APP_VARIANT=shop`) : Connexion / Inscription → Accueil (KPI du jour, 4 actions) → *Opération* (un seul écran guidé pour vente, rachat, entrée en stock : IMEI + scan → vérification registre → modèle si inconnu → identité + CNI recto/verso → prix → enregistrement) → *Reçu* (QR certificat, PDF partageable WhatsApp) · Vérifier un IMEI · Historique · États · Mon compte.

**App Superviseur** (`APP_VARIANT=supervisor`, compte principal uniquement) : Accueil consolidé · États par magasin / marque / modèle · Magasins · Comptes vendeurs · Historique.

**Back-office web** : Tableau de bord · Clients (abonnements, paiements) · Recherche IMEI (historique + pièces) · Déclarations de vol · Alertes · Marques & modèles · Administrateurs · Journal d’audit.
**Pages publiques** : `/verifier` (statut IMEI + déclaration de vol) · `/v/:code` (certificat).

## 8. Montée en charge (feuille de route)

| Étape | Seuil indicatif | Action |
|---|---|---|
| 1 | MVP | 1 instance API Render, Neon (pooler), R2 |
| 2 | > 50 req/s | 2-4 instances API ; `rate-limit-redis` (Upstash) pour un débit partagé |
| 3 | > 10 M transactions | partitionnement mensuel de `transactions` et `audit_logs` (`PARTITION BY RANGE (occurred_at)`) |
| 4 | lectures lourdes | réplique en lecture Neon pour `/stats` et le back-office ; vues matérialisées journalières |
| 5 | multi-pays | colonne `country` déjà présente ; région Neon par zone si nécessaire |
| 6 | intégrations | webhooks vers police / opérateurs (blocage IMEI), notifications SMS (file de messages) |

Prochaines fonctionnalités : consentement du propriétaire par OTP SMS au rachat, transfert B2B entre boutiques, mode hors-ligne avec file d’attente, paiement d’abonnement par Mobile Money (ORZAYAH).
