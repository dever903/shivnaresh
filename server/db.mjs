import { MongoClient } from 'mongodb';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let cachedClient = null;
let cachedDb = null;
let lastFailedAt = 0;

async function resolveMongoUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI.trim();
  try {
    const text = await fs.readFile(path.join(ROOT, '.env'), 'utf8');
    const match = /MONGODB_URI\s*=\s*(.+)/i.exec(text);
    if (match) {
      const val = match[1].trim().replace(/^["']|["']$/g, '');
      if (val) return val;
    }
  } catch {}
  return '';
}

export async function getMongoDb(uriOverride) {
  let uri = String(uriOverride || '').trim();
  if (!uri) {
    uri = await resolveMongoUri();
  }
  if (!uri) return null;
  if (cachedDb && cachedClient) return cachedDb;
  if (Date.now() - lastFailedAt < 15_000) return null;

  try {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      maxPoolSize: 10,
      minPoolSize: 1,
    });
    await client.connect();
    const dbName = process.env.MONGODB_DB || 'shivnaresh';
    const db = client.db(dbName);

    // Ensure collections and unique indexes exist
    await Promise.allSettled([
      db.collection('users').createIndex({ email: 1 }, { unique: true }),
      db.collection('app_state').createIndex({ _id: 1 }),
      db.collection('custom_requests').createIndex({ id: 1 }, { unique: true }),
      db.collection('gateway_orders').createIndex({ order_no: 1 }, { unique: true }),
      db.collection('hosted_images').createIndex({ file: 1 }, { unique: true }),
    ]);

    cachedClient = client;
    cachedDb = db;
    lastFailedAt = 0;
    return db;
  } catch (err) {
    lastFailedAt = Date.now();
    console.warn('[db] MongoDB Atlas connection warning:', err.message);
    return null;
  }
}
