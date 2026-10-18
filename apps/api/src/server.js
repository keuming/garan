import { config } from './config.js';
import { logger } from './logger.js';
import { pool } from './db.js';
import { createApp } from './app.js';

const app = createApp();
const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, 'gaRAN API démarrée');
});

// Arrêt propre : termine les requêtes en cours puis ferme le pool (déploiements sans coupure)
let closing = false;
function shutdown(signal) {
  if (closing) return;
  closing = true;
  logger.info({ signal }, 'Arrêt en cours');
  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 15_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => logger.error({ err }, 'Promesse rejetée non gérée'));
