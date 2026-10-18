import { query } from '../db.js';
import { verifyAccessToken } from '../lib/security.js';
import { AppError, badRequest, forbidden, unauthorized } from '../lib/errors.js';

function bearer(req) {
  const h = req.headers.authorization ?? '';
  const [scheme, token] = h.split(' ');
  if (scheme !== 'Bearer' || !token) throw unauthorized();
  return token;
}

/** Authentifie un utilisateur mobile (owner ou agent) et charge son organisation. */
export async function requireUser(req, _res, next) {
  const claims = verifyAccessToken(bearer(req), 'user');
  const { rows } = await query(
    `SELECT u.id, u.role, u.status, u.full_name, u.phone, u.organization_id, u.shop_id,
            o.name AS org_name, o.status AS org_status, o.subscription_expires_at, o.max_shops
     FROM users u JOIN organizations o ON o.id = u.organization_id
     WHERE u.id = $1`,
    [claims.sub]
  );
  const u = rows[0];
  if (!u || u.status !== 'active') throw unauthorized('Compte désactivé');
  if (u.org_status === 'suspended') throw new AppError(403, 'ORG_SUSPENDED', 'Compte suspendu : contactez gaRAN');
  req.auth = { typ: 'user', sub: u.id, role: u.role, orgId: u.organization_id, shopId: u.shop_id };
  req.user = u;
  next();
}

/** Restreint aux propriétaires (compte principal / superviseur). */
export function requireOwner(req, _res, next) {
  if (req.auth?.role !== 'owner') throw forbidden('Réservé au compte principal');
  next();
}

/** Bloque les opérations d'écriture si l'abonnement n'est plus valide. */
export function requireActiveSubscription(req, _res, next) {
  const u = req.user;
  const expired = u.subscription_expires_at && new Date(u.subscription_expires_at) < new Date();
  if (!['trial', 'active'].includes(u.org_status) || expired) {
    throw new AppError(
      402,
      'SUBSCRIPTION_INACTIVE',
      'Votre abonnement gaRAN a expiré. Renouvelez-le pour enregistrer de nouvelles opérations.'
    );
  }
  next();
}

/** Authentifie un administrateur du back-office ; `roles` restreint l'accès. */
export function requireAdmin(...roles) {
  return async (req, _res, next) => {
    const claims = verifyAccessToken(bearer(req), 'admin');
    const { rows } = await query(`SELECT id, email, full_name, role, status FROM admins WHERE id = $1`, [claims.sub]);
    const a = rows[0];
    if (!a || a.status !== 'active') throw unauthorized('Compte désactivé');
    if (roles.length && !roles.includes(a.role)) throw forbidden();
    req.auth = { typ: 'admin', sub: a.id, role: a.role };
    req.admin = a;
    next();
  };
}

/**
 * Détermine le magasin concerné par l'opération :
 * - agent : toujours son magasin ;
 * - owner : le magasin demandé (de son organisation), ou l'unique magasin actif.
 */
export async function resolveShopId(req, requestedShopId, client = { query }) {
  if (req.auth.role === 'agent') {
    if (requestedShopId && requestedShopId !== req.auth.shopId) throw forbidden('Magasin non autorisé');
    return req.auth.shopId;
  }
  if (requestedShopId) {
    const { rows } = await client.query(
      `SELECT id FROM shops WHERE id = $1 AND organization_id = $2 AND status = 'active'`,
      [requestedShopId, req.auth.orgId]
    );
    if (!rows[0]) throw forbidden('Magasin non autorisé');
    return rows[0].id;
  }
  const { rows } = await client.query(
    `SELECT id FROM shops WHERE organization_id = $1 AND status = 'active' ORDER BY created_at LIMIT 2`,
    [req.auth.orgId]
  );
  if (rows.length === 1) return rows[0].id;
  if (rows.length === 0) throw badRequest('NO_ACTIVE_SHOP', 'Aucun magasin actif');
  throw badRequest('SHOP_REQUIRED', 'Précisez le magasin (shop_id)');
}

/** Filtre de portée pour les lectures : agent -> son magasin ; owner -> organisation (ou un magasin). */
export async function readScope(req, requestedShopId) {
  if (req.auth.role === 'agent') return { orgId: req.auth.orgId, shopId: req.auth.shopId };
  if (requestedShopId) {
    const { rows } = await query(`SELECT id FROM shops WHERE id = $1 AND organization_id = $2`, [
      requestedShopId,
      req.auth.orgId
    ]);
    if (!rows[0]) throw forbidden('Magasin non autorisé');
    return { orgId: req.auth.orgId, shopId: requestedShopId };
  }
  return { orgId: req.auth.orgId, shopId: null };
}
