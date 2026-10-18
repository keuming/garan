import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.NODE_ENV === 'test' ? 'silent' : config.LOG_LEVEL,
  base: { service: 'garan-api' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.pin',
      '*.password',
      '*.refresh_token',
      '*.id_doc_number'
    ],
    censor: '[masqué]'
  }
});
