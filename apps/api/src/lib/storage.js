import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config.js';
import { notFound } from './errors.js';

/**
 * Stockage des pièces d'identité.
 * - local : disque (développement / tests uniquement)
 * - s3    : tout service compatible S3 (Cloudflare R2, AWS S3, Backblaze B2…),
 *           chiffrement côté serveur, objets privés.
 */

const KEY_RE = /^[a-z0-9-]+(\/[A-Za-z0-9._-]+)+$/;

function assertKey(key) {
  if (!KEY_RE.test(key) || key.includes('..')) throw notFound('Document introuvable');
}

class LocalStorage {
  constructor(dir) {
    this.dir = path.resolve(dir);
  }

  async put(key, buffer) {
    assertKey(key);
    const file = path.join(this.dir, key);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, buffer, { mode: 0o600 });
  }

  async getStream(key) {
    assertKey(key);
    const file = path.join(this.dir, key);
    if (!fs.existsSync(file)) throw notFound('Document introuvable');
    return fs.createReadStream(file);
  }
}

class S3Storage {
  constructor() {
    this.bucket = config.S3_BUCKET;
    this.client = new S3Client({
      region: config.S3_REGION,
      endpoint: config.S3_ENDPOINT || undefined,
      forcePathStyle: Boolean(config.S3_ENDPOINT),
      credentials: { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY }
    });
  }

  async put(key, buffer, contentType) {
    assertKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ServerSideEncryption: config.S3_ENDPOINT ? undefined : 'AES256'
      })
    );
  }

  async getStream(key) {
    assertKey(key);
    try {
      const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return out.Body;
    } catch (err) {
      if (err?.name === 'NoSuchKey') throw notFound('Document introuvable');
      throw err;
    }
  }
}

export const storage = config.STORAGE_DRIVER === 's3' ? new S3Storage() : new LocalStorage(config.STORAGE_LOCAL_DIR);
