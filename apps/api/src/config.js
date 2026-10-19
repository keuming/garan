import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL est requis'),
    DATABASE_SSL: bool.default('true'),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET : 32 caractères minimum'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

    CORS_ORIGINS: z.string().default('*'),
    PUBLIC_WEB_URL: z.string().url().default('http://localhost:5173'),
    API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),

    // Intégration ORZAYAH (paiement + solde). Laissées vides pour l'instant : câblage ultérieur.
    ORZAYAH_PAY_URL: z.string().url().default('https://pay.orzayah.com'),
    ORZAYAH_API_URL: z.string().default(''),
    ORZAYAH_API_KEY: z.string().default(''),
    DEFAULT_COUNTRY_CODE: z.string().regex(/^\d{1,3}$/).default('225'),
    TRIAL_DAYS: z.coerce.number().int().min(0).default(14),

    PIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    PIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(14).default(10),

    STORAGE_DRIVER: z.enum(['local', 'db', 's3']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('./storage'),
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().default('auto'),
    S3_ENDPOINT: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    UPLOAD_MAX_MB: z.coerce.number().positive().default(5),

    TRUST_PROXY: z.coerce.number().int().min(0).default(1),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info')
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER === 's3') {
      for (const key of ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) {
        if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: `${key} requis avec STORAGE_DRIVER=s3` });
      }
    }
    if (env.NODE_ENV === 'production' && env.STORAGE_DRIVER === 'local') {
      ctx.addIssue({
        code: 'custom',
        path: ['STORAGE_DRIVER'],
        message: 'Le stockage local est interdit en production (disque éphémère) : utilisez db ou s3'
      });
    }
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`Configuration invalide :\n${lines}`);
  process.exit(1);
}

export const config = Object.freeze({
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS === '*' ? '*' : parsed.data.CORS_ORIGINS.split(',').map((s) => s.trim())
});
