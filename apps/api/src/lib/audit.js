import { query } from '../db.js';
import { logger } from '../logger.js';

/**
 * Trace une action sensible dans audit_logs. N'interrompt jamais la requête en cas d'échec.
 * @param {object} req  requête Express (pour l'acteur et l'IP) ou null
 */
export async function audit(req, action, { entity = null, entityId = null, meta = {}, client = null } = {}) {
  const actor = req?.auth
    ? { type: ['user', 'admin', 'consumer', 'public', 'system'].includes(req.auth.typ) ? req.auth.typ : 'user', id: req.auth.sub }
    : { type: req ? 'public' : 'system', id: null };
  try {
    await (client ?? { query }).query(
      `INSERT INTO audit_logs (actor_type, actor_id, action, entity, entity_id, ip, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [actor.type, actor.id, action, entity, entityId ? String(entityId) : null, req?.ip ?? null, meta]
    );
  } catch (err) {
    logger.error({ err, action }, "Échec d'écriture du journal d'audit");
  }
}
