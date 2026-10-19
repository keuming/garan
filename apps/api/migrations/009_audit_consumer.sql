-- 009 — Autorise les acteurs "consumer" dans le journal d'audit.
-- Les abonnements usager écrivaient actor_type='consumer', rejeté par la contrainte d'origine
-- (qui ne connaissait que user/admin/public/system) → erreur 23514 à chaque initiation.
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_actor_type_check;
ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_actor_type_check
  CHECK (actor_type IN ('user', 'admin', 'consumer', 'public', 'system'));
