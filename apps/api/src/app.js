import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';
import { logger } from './logger.js';
import { pool } from './db.js';
import { errorHandler, notFoundHandler } from './lib/errors.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { authRouter } from './modules/auth.routes.js';
import { catalogRouter } from './modules/catalog.routes.js';
import { registryRouter } from './modules/registry.routes.js';
import { orgRouter } from './modules/org.routes.js';
import { publicRouter } from './modules/public.routes.js';
import { adminRouter } from './modules/admin.routes.js';
import { adminClientsRouter } from './modules/admin-clients.routes.js';
import { consumerRouter } from './modules/consumer.routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins, maxAge: 600 }));
  app.use(express.json({ limit: '200kb' }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/health' },
      customProps: (req) => ({ actor: req.auth ? `${req.auth.typ}:${req.auth.sub}` : undefined })
    })
  );

  app.get('/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', db: 'ok', time: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'degraded', db: 'down' });
    }
  });

  const v1 = express.Router();
  v1.use(globalLimiter);
  v1.use('/auth', authRouter);
  v1.use('/catalog', catalogRouter);
  v1.use('/public', publicRouter);
  v1.use('/org', orgRouter);
  v1.use('/admin', adminClientsRouter);
  v1.use('/admin', adminRouter);
  v1.use('/consumer', consumerRouter);
  v1.use('/', registryRouter); // /devices, /persons, /uploads, /transactions, /stats
  app.use('/api/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
