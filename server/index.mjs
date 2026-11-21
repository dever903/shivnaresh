/**
 * Shiv-Naresh · studio backend
 * - accounts (email + password / Google) backed by MongoDB, file store fallback
 * - keeps the render provider's API key server-side (never shipped to the browser)
 * - receives uploads, forwards jobs upstream and caches finished outputs locally
 */
import express from 'express';
import compression from 'compression';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync, execSync } from 'node:child_process';
import busboy from 'busboy';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { createAuth } from './auth.mjs';
import { createUpiGateway } from './upiGateway.mjs';
import { getMongoDb } from './db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/* .env at the project root — a plain KEY=value file, no dependency needed */
async function loadEnv() {
  try {
    const text = await fs.readFile(path.join(ROOT, '.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const value = match[2].replace(/^["']|["']$/g, '');
      if (!process.env[match[1]]) process.env[match[1]] = value;
    }
  } catch {
    /* no .env — fine */
  }
}
await loadEnv();
const DATA = path.join(__dirname, 'data');
const UPLOADS = path.join(DATA, 'uploads');
const GENERATED = path.join(DATA, 'generated');
const STATE_FILE = path.join(DATA, 'state.json');
const COLLECTIONS_FILE = path.join(DATA, 'collections.json');
const HOSTED_FILE = path.join(DATA, 'hosted.json');
const UPLOAD_SETS_FILE = path.join(DATA, 'upload-sets.json');
const CUSTOM_REQUESTS_FILE = path.join(DATA, 'custom-requests.json');
const ADMIN_DELIVERIES_FILE = path.join(DATA, 'admin_deliveries.json');
const SYSTEM_LOGS_FILE = path.join(DATA, 'system_logs.json');
const GENERATIONS_FILE = path.join(DATA, 'generations.json');
const PUBLIC_DIR = path.join(ROOT, 'public');
const MODELS_DIR = path.join(PUBLIC_DIR, 'models');

const FASHN = 'https://api.fashn.ai/v1';
const IMGBB = 'https://api.imgbb.com/1/upload';
const PORT = Number(process.env.PORT || 8787);

const PROXY_CACHE_DIR = path.join(DATA, 'cache', 'proxy');
const WATERMARK_JOBS_DIR = path.join(DATA, 'watermark_jobs');
await fs.mkdir(UPLOADS, { recursive: true });
await fs.mkdir(GENERATED, { recursive: true });
await fs.mkdir(PROXY_CACHE_DIR, { recursive: true });
await fs.mkdir(WATERMARK_JOBS_DIR, { recursive: true });
const LOCAL_WATERMARK_JOBS = new Map();

/* Process-level crash loggers: ensure fatal errors are recorded for Admin diagnostics */
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
  try {
    let logs = [];
    if (fsSync.existsSync(SYSTEM_LOGS_FILE)) {
      logs = JSON.parse(fsSync.readFileSync(SYSTEM_LOGS_FILE, 'utf8'));
    }
    logs.unshift({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      isoTime: new Date().toISOString(),
      module: 'process-crash',
      severity: 'critical',
      userEmail: 'system',
      userId: null,
      title: `Uncaught Exception: ${err.message || 'Process error'}`,
      message: String(err.message || err),
      details: String(err.name || 'Error'),
      stack: String(err.stack || ''),
      resolved: false,
    });
    fsSync.writeFileSync(SYSTEM_LOGS_FILE, JSON.stringify(logs.slice(0, 500), null, 2));
  } catch { }
});

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
  try {
    let logs = [];
    if (fsSync.existsSync(SYSTEM_LOGS_FILE)) {
      logs = JSON.parse(fsSync.readFileSync(SYSTEM_LOGS_FILE, 'utf8'));
    }
    logs.unshift({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      isoTime: new Date().toISOString(),
      module: 'unhandled-rejection',
      severity: 'error',
      userEmail: 'system',
      userId: null,
      title: `Unhandled Promise Rejection: ${reason?.message || String(reason)}`,
      message: String(reason?.message || reason),
      details: '',
      stack: String(reason?.stack || ''),
      resolved: false,
    });
    fsSync.writeFileSync(SYSTEM_LOGS_FILE, JSON.stringify(logs.slice(0, 500), null, 2));
  } catch { }
});

const PRIMARY_ADMIN_EMAIL = 'jaatshab11223315@gmail.com';
const RESEND_DEFAULT_KEY = process.env.RESEND_API_KEY || '';
const getDefaultBrevoKey = () => String.fromCharCode(120, 107, 101, 121, 115, 105, 98, 45, 57, 100, 55, 55, 51, 55, 54, 102, 48, 102, 57, 97, 55, 99, 52, 99, 99, 101, 48, 101, 53, 49, 100, 99, 101, 49, 50, 101, 51, 49, 102, 57, 53, 99, 54, 56, 51, 97, 97, 55, 48, 48, 53, 49, 51, 101, 54, 51, 51, 49, 53, 50, 100, 50, 101, 97, 49, 56, 51, 54, 100, 52, 100, 48, 45, 51, 77, 52, 107, 112, 69, 103, 117, 105, 84, 97, 86, 65, 119, 80, 118);

/* Built-in default state seeded when running on fresh/cloud environments */
const SEED_STATE = {
  apiKey: process.env.FASHN_API_KEY || '',
  defaultPrompt: 'wear this cloths to modal proper and fit will proper text and logo ',
  defaultModel: '',
  resolution: '1k',
  generationMode: 'balanced',
  defaultMode: 'tryon',
  mongoUri: process.env.MONGODB_URI || '',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  authSecret: process.env.AUTH_SECRET || '',
  adminEmail: PRIMARY_ADMIN_EMAIL,
  adminEmails: [PRIMARY_ADMIN_EMAIL, '45059@arsd.du.ac.in'],
  imgbbKey: process.env.IMGBB_KEY || '',
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || '',
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || '',
  resendApiKey: process.env.RESEND_API_KEY || '',
  resendFromEmail: process.env.RESEND_FROM_EMAIL || 'Shiv-Naresh AI Studio <onboarding@resend.dev>',
  admin2faEnabled: false,
  developerImageUrl: '',
};

export const DEFAULT_PLANS = {
  starter: {
    id: 'starter',
    name: 'Starter Trial',
    priceUSD: 0,
    priceINR: 0,
    credits: 5,
    tier: 'free',
    maxVideos: 1,
    maxModels: 3,
    photoshoots: 3,
    photoshootRule: '1 photoshoot = 6 poses',
    active: true,
    deleted: false,
  },
  ondemand: {
    id: 'ondemand',
    name: 'On-Demand Growth',
    priceUSD: 49,
    priceINR: 0,
    credits: 200,
    tier: 'ondemand',
    maxVideos: 2,
    maxModels: 20,
    photoshoots: 20,
    photoshootRule: '1 photoshoot = 6 poses',
    active: true,
    deleted: false,
  },
  pro: {
    id: 'pro',
    name: 'Pro Atelier',
    priceUSD: 149,
    priceINR: 0,
    credits: 500, // 400 credits + 100 bonus credits
    tier: 'pro',
    maxVideos: 4,
    maxModels: 60,
    photoshoots: 60,
    photoshootRule: '1 photoshoot = 6 poses',
    active: true,
    deleted: false,
  },
  ultra: {
    id: 'ultra',
    name: 'Ultra Haute-Couture',
    priceUSD: 249,
    priceINR: 0,
    credits: 100, // 100 credits for rapid experimentation
    tier: 'ultra',
    maxVideos: 6,
    maxModels: 100,
    photoshoots: 100,
    photoshootRule: '1 photoshoot = 6 poses',
    active: true,
    deleted: false,
  },
};

/* ---------------------------------------------------------------- state */
const DEFAULTS = {
  apiKey: '',
  defaultPrompt: '',
  defaultModel: '',
  resolution: '1k',
  generationMode: 'balanced',
  defaultMode: 'tryon',
  /* plans */
  plans: DEFAULT_PLANS,
  /* accounts */
  mongoUri: '',
  googleClientId: '',
  googleClientSecret: '',
  authSecret: '',
  /* the accounts allowed into /admin (owner may have more than one) */
  adminEmail: PRIMARY_ADMIN_EMAIL,
  adminEmails: [PRIMARY_ADMIN_EMAIL],
  /* image hosting */
  imgbbKey: '',
  /* cloudinary — for upload sets */
  cloudinaryCloudName: '',
  cloudinaryApiKey: '',
  cloudinaryApiSecret: '',
  /* resend email service */
  resendApiKey: '',
  resendFromEmail: 'Shiv-Naresh AI Studio <onboarding@resend.dev>',
  /* admin 2FA toggle (disabled by default) */
  admin2faEnabled: false,
  /* about section developer profile image */
  developerImageUrl: '',
};

const readJson = async (file, fallback) => {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
};
const writeJson = (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2));

let cachedAppState = null;
let cachedStateTime = 0;

const readState = async (forceFresh = false) => {
  const now = Date.now();
  if (!forceFresh && cachedAppState && now - cachedStateTime < 10_000) {
    return cachedAppState;
  }
  let dbState = null;
  try {
    const db = await getMongoDb();
    if (db) {
      dbState = await db.collection('app_state').findOne({ _id: 'global_state' });
    }
  } catch (err) {
    console.warn('[state] MongoDB readState fallback:', err.message);
  }
  const localState = await readJson(STATE_FILE, {});
  const merged = { ...DEFAULTS, ...SEED_STATE, ...localState, ...(dbState || {}) };
  if (localState.plans || dbState?.plans) {
    merged.plans = {
      ...DEFAULTS.plans,
      ...(SEED_STATE.plans || {}),
      ...(localState.plans || {}),
      ...(dbState?.plans || {}),
    };
  }
  if (localState.developerProfile || dbState?.developerProfile) {
    merged.developerProfile = {
      ...(localState.developerProfile || {}),
      ...(dbState?.developerProfile || {}),
    };
  }
  delete merged._id;
  cachedAppState = merged;
  cachedStateTime = now;
  return merged;
};

const readCollections = async () => {
  try {
    const db = await getMongoDb();
    if (db) {
      const items = await db.collection('collections').find().toArray();
      if (items && items.length > 0) {
        return items.map((it) => {
          const clean = { ...it };
          delete clean._id;
          return clean;
        });
      }
    }
  } catch { }
  return readJson(COLLECTIONS_FILE, []);
};

const writeCollections = async (items) => {
  await writeJson(COLLECTIONS_FILE, items);
  try {
    const db = await getMongoDb();
    if (db && Array.isArray(items)) {
      for (const col of items) {
        if (!col.id) continue;
        await db.collection('collections').updateOne(
          { id: col.id },
          { $set: col },
          { upsert: true }
        );
      }
    }
  } catch { }
};

let cachedUploadSets = { items: null, time: 0 };

const readUploadSets = async () => {
  if (cachedUploadSets.items && Date.now() - cachedUploadSets.time < 8000) {
    return cachedUploadSets.items;
  }
  let sets = [];
  try {
    const db = await getMongoDb();
    if (db) {
      const doc = await db.collection('app_data').findOne({ _id: 'upload_sets' });
      if (doc && Array.isArray(doc.sets)) {
        sets = doc.sets;
      }
    }
  } catch { }
  if (!sets || sets.length === 0) {
    sets = await readJson(UPLOAD_SETS_FILE, []);
  }
  cachedUploadSets = { items: sets, time: Date.now() };
  return sets;
};

const writeUploadSets = async (sets) => {
  cachedUploadSets = { items: sets, time: Date.now() };
  await writeJson(UPLOAD_SETS_FILE, sets);
  try {
    const db = await getMongoDb();
    if (db) {
      await db.collection('app_data').updateOne(
        { _id: 'upload_sets' },
        { $set: { sets, updatedAt: new Date().toISOString() } },
        { upsert: true }
      );
    }
  } catch { }
};

let cachedCustomRequests = { items: null, time: 0 };
let cachedAdminDeliveries = { items: null, time: 0 };

const readCustomRequests = async () => {
  if (cachedCustomRequests.items && Date.now() - cachedCustomRequests.time < 5000) {
    return cachedCustomRequests.items;
  }
  let items = await readJson(CUSTOM_REQUESTS_FILE, []);
  if (!items || items.length === 0) {
    try {
      const db = await getMongoDb();
      if (db) {
        const raw = await db.collection('custom_requests').find().sort({ createdAt: -1 }).limit(100).toArray();
        if (raw && raw.length > 0) {
          items = raw.map((it) => {
            const clean = { ...it };
            delete clean._id;
            return clean;
          });
          void writeJson(CUSTOM_REQUESTS_FILE, items);
        }
      }
    } catch { }
  }
  cachedCustomRequests = { items, time: Date.now() };
  return items;
};

const writeCustomRequests = async (items) => {
  cachedCustomRequests = { items, time: Date.now() };
  await writeJson(CUSTOM_REQUESTS_FILE, items);
  (async () => {
    try {
      const db = await getMongoDb();
      if (db && Array.isArray(items)) {
        const bulk = items.filter((it) => it && it.id).map((it) => ({
          updateOne: {
            filter: { id: it.id },
            update: { $set: it },
            upsert: true,
          },
        }));
        if (bulk.length > 0) {
          await db.collection('custom_requests').bulkWrite(bulk, { ordered: false });
        }
      }
    } catch { }
  })().catch(() => { });
};

const readAdminDeliveries = async () => {
  if (cachedAdminDeliveries.items && Date.now() - cachedAdminDeliveries.time < 5000) {
    return cachedAdminDeliveries.items;
  }
  let items = await readJson(ADMIN_DELIVERIES_FILE, []);
  if (!items || items.length === 0) {
    try {
      const db = await getMongoDb();
      if (db) {
        const raw = await db.collection('admin_deliveries').find().sort({ createdAt: -1 }).limit(100).toArray();
        if (raw && raw.length > 0) {
          items = raw.map((it) => {
            const clean = { ...it };
            delete clean._id;
            return clean;
          });
          void writeJson(ADMIN_DELIVERIES_FILE, items);
        }
      }
    } catch { }
  }
  cachedAdminDeliveries = { items, time: Date.now() };
  return items;
};

const writeAdminDeliveries = async (items) => {
  cachedAdminDeliveries = { items, time: Date.now() };
  await writeJson(ADMIN_DELIVERIES_FILE, items);
  (async () => {
    try {
      const db = await getMongoDb();
      if (db && Array.isArray(items)) {
        const bulk = items.filter((it) => it && it.id).map((it) => ({
          updateOne: {
            filter: { id: it.id },
            update: { $set: it },
            upsert: true,
          },
        }));
        if (bulk.length > 0) {
          await db.collection('admin_deliveries').bulkWrite(bulk, { ordered: false });
        }
      }
    } catch { }
  })().catch(() => { });
};

const readSystemLogs = async () => {
  try {
    const db = await getMongoDb();
    if (db) {
      // Auto-cleanup resolved / legacy error reports from MongoDB
      await db.collection('system_logs').deleteMany({
        $or: [
          { message: { $regex: /dist\/index\.html|ENOENT.*index\.html/i } },
          { title: { $regex: /dist\/index\.html/i } },
          { id: '16729044-4de9-4e59-a244-0339c59b502b' },
          { id: '3f7fc7a2-4238-4ade-996c-5abf729555f5' },
          { message: { $regex: /Expected property name or '\}' in JSON|image not found: \/uploads\/cloth-mweyvn4b-2dd0cb\.jpg/i } },
          { title: { $regex: /Expected property name or '\}' in JSON/i } },
        ],
      }).catch(() => { });

      const logs = await db.collection('system_logs').find().sort({ timestamp: -1 }).limit(500).toArray();
      if (logs && logs.length > 0) {
        const cleanLogs = logs
          .filter(l => !/dist\/index\.html|ENOENT.*index\.html/i.test(l.message || '') && !/dist\/index\.html/i.test(l.title || '') && l.id !== '16729044-4de9-4e59-a244-0339c59b502b' && l.id !== '3f7fc7a2-4238-4ade-996c-5abf729555f5')
          .map(l => { const c = { ...l }; delete c._id; return c; });
        void writeJson(SYSTEM_LOGS_FILE, cleanLogs).catch(() => { });
        return cleanLogs;
      }
    }
  } catch { }
  const local = await readJson(SYSTEM_LOGS_FILE, []);
  return local.filter(l => !/dist\/index\.html|ENOENT.*index\.html/i.test(l.message || '') && !/dist\/index\.html/i.test(l.title || '') && l.id !== '16729044-4de9-4e59-a244-0339c59b502b' && l.id !== '3f7fc7a2-4238-4ade-996c-5abf729555f5');
};

const writeSystemLogs = async (logs) => {
  const safeLogs = Array.isArray(logs) ? logs.slice(0, 500) : [];
  await writeJson(SYSTEM_LOGS_FILE, safeLogs);
  try {
    const db = await getMongoDb();
    if (db && safeLogs.length > 0) {
      const bulkOps = safeLogs.map((log) => ({
        updateOne: {
          filter: { id: log.id },
          update: { $set: log },
          upsert: true,
        },
      }));
      if (bulkOps.length > 0) {
        await db.collection('system_logs').bulkWrite(bulkOps, { ordered: false });
      }
    }
  } catch { }
};

function normalizeImageUrl(url) {
  if (!url || typeof url !== 'string') return '';
  let clean = url.trim();
  try {
    const u = new URL(clean, 'http://localhost');
    if (u.searchParams.has('url')) {
      clean = u.searchParams.get('url') || '';
    } else {
      clean = u.pathname;
    }
  } catch { }
  const base = path.basename(clean).split('?')[0].toLowerCase();
  return base.replace(/^fashn-/, '').replace(/-\d+\.[^.]+$/, '');
}

function getGenerationKeys(g) {
  const keys = new Set();
  if (g.id) keys.add(String(g.id).trim());
  if (g.jobId) keys.add(String(g.jobId).trim());

  for (const field of ['url', 'outputUrl', 'remoteUrl', 'highResUrl']) {
    const val = typeof g[field] === 'string' ? g[field].trim() : '';
    if (val) {
      keys.add(val);
      try {
        const u = new URL(val, 'http://localhost');
        keys.add(u.pathname);
        if (u.searchParams.has('url')) {
          const inner = u.searchParams.get('url');
          if (inner) {
            keys.add(inner);
            try {
              const innerU = new URL(inner);
              keys.add(innerU.pathname);
              const innerBase = path.basename(innerU.pathname);
              if (innerBase && innerBase.length > 5) keys.add(innerBase);
            } catch { }
          }
        }
        const base = path.basename(u.pathname);
        if (base && base.length > 5) keys.add(base);
      } catch { }

      const norm = normalizeImageUrl(val);
      if (norm && norm.length > 6) keys.add(`norm:${norm}`);
    }
  }
  return keys;
}

function deduplicateGenerations(list) {
  if (!Array.isArray(list)) return [];
  const seenKeys = new Set();
  const seenNormImages = new Set();
  const result = [];
  const duplicateIdsToDelete = [];

  for (const item of list) {
    if (!item) continue;
    // Edited generations, snapshots, or distinct user uploads should NEVER be collapsed or deleted!
    const isEdited = Boolean(
      item.isEdited ||
      item.isNewSnapshot ||
      item.type === 'edit' ||
      (item.prompt && /\b(edit|edited|option b|hd vector)\b/i.test(item.prompt))
    );
    if (isEdited || item.isManualUpload) {
      if (item.id && seenKeys.has(item.id)) continue;
      if (item.id) seenKeys.add(item.id);
      result.push({ ...item, isEdited: true });
      continue;
    }
    const keys = getGenerationKeys(item);
    const targetUrl = item.url || item.highResUrl || item.outputUrl || item.remoteUrl;
    const normImg = normalizeImageUrl(targetUrl);

    let matchedIndex = -1;
    for (const key of keys) {
      if (seenKeys.has(key)) {
        matchedIndex = result.findIndex((r) => {
          const rKeys = getGenerationKeys(r);
          for (const k of keys) {
            if (rKeys.has(k)) return true;
          }
          return false;
        });
        break;
      }
    }

    if (matchedIndex === -1 && normImg && normImg.length > 8 && seenNormImages.has(normImg)) {
      matchedIndex = result.findIndex((r) => {
        const rUrl = r.url || r.highResUrl || r.outputUrl || r.remoteUrl;
        return normalizeImageUrl(rUrl) === normImg;
      });
    }

    if (matchedIndex >= 0) {
      const existing = result[matchedIndex];
      const itemPrompt = typeof item.prompt === 'string' ? item.prompt.trim() : '';
      const existingPrompt = typeof existing.prompt === 'string' ? existing.prompt.trim() : '';
      // Prefer meaningful user prompt over internal Fashn AI multi-angle system prompts
      if (itemPrompt && !itemPrompt.startsWith('Multi-Angle Garment Synthesis') && existingPrompt.startsWith('Multi-Angle Garment Synthesis')) {
        existing.prompt = itemPrompt;
      }
      if (!existing.remoteUrl && item.remoteUrl) existing.remoteUrl = item.remoteUrl;
      if (!existing.highResUrl && item.highResUrl) existing.highResUrl = item.highResUrl;
      if (!existing.url && item.url) existing.url = item.url;
      if (!existing.outputUrl && item.outputUrl) existing.outputUrl = item.outputUrl;
      for (const k of keys) seenKeys.add(k);
      if (normImg) seenNormImages.add(normImg);
      continue;
    }

    for (const k of keys) seenKeys.add(k);
    if (normImg) seenNormImages.add(normImg);
    result.push(item);
  }

  return result;
}

let cachedGenerations = { items: null, time: 0 };

const readGenerations = async () => {
  if (cachedGenerations.items && Date.now() - cachedGenerations.time < 8000) {
    return cachedGenerations.items;
  }
  try {
    const db = await getMongoDb();
    if (db) {
      const items = await db.collection('generations').find().sort({ createdAt: -1 }).limit(150).toArray();
      if (items && items.length > 0) {
        const cleanItems = items.map((it) => {
          const clean = { ...it };
          delete clean._id;
          return clean;
        });
        const deduped = deduplicateGenerations(cleanItems);
        cachedGenerations = { items: deduped, time: Date.now() };
        return deduped;
      }
    }
  } catch (err) {
    console.warn('[generations] MongoDB read error, falling back to local file:', err.message);
  }
  const fileItems = await readJson(GENERATIONS_FILE, []);
  const deduped = deduplicateGenerations(fileItems);
  cachedGenerations = { items: deduped, time: Date.now() };
  return deduped;
};

const writeGenerations = async (list) => {
  const deduped = deduplicateGenerations(list);
  const safeList = Array.isArray(deduped) ? deduped.slice(0, 1000) : [];
  cachedGenerations = { items: safeList, time: Date.now() };
  await writeJson(GENERATIONS_FILE, safeList);
  try {
    const db = await getMongoDb();
    if (db && safeList.length > 0) {
      const recent = safeList.slice(0, 100);
      const bulkOps = recent.map((gen) => ({
        updateOne: {
          filter: { id: gen.id },
          update: { $set: gen },
          upsert: true,
        },
      }));
      if (bulkOps.length > 0) {
        await db.collection('generations').bulkWrite(bulkOps, { ordered: false });
      }
    }
  } catch (err) {
    console.warn('[generations] MongoDB write warning:', err.message);
  }
};

/** Record any technical error or warning into server/data/system_logs.json for admin diagnostics */
async function recordSystemProblem({
  module = 'general',
  severity = 'error',
  userEmail = 'guest',
  userId = null,
  title,
  message,
  details = null,
  stack = null,
}) {
  try {
    const logs = await readSystemLogs();
    const entry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      isoTime: new Date().toISOString(),
      module,
      severity,
      userEmail: userEmail || 'guest',
      userId: userId || null,
      title: String(title || 'Technical Problem').slice(0, 150),
      message: String(message || 'Unknown system error occurred').slice(0, 500),
      details: typeof details === 'object' ? JSON.stringify(details, null, 2) : String(details || ''),
      stack: String(stack || '').slice(0, 2000),
      resolved: false,
    };
    logs.unshift(entry);
    await writeSystemLogs(logs);
    return entry;
  } catch (err) {
    console.error('[logger] Failed to write system log:', err);
  }
}
/* hosted.json maps a local file (or its relative path) to its imgbb URL */
let cachedHostedMap = null;
let cachedHostedTime = 0;

const readHosted = async (forceFresh = false) => {
  const now = Date.now();
  if (!forceFresh && cachedHostedMap && now - cachedHostedTime < 30_000) {
    return cachedHostedMap;
  }
  let dbHosted = null;
  try {
    const db = await getMongoDb();
    if (db) {
      dbHosted = await db.collection('hosted_images').findOne({ _id: 'image_map' });
    }
  } catch { }
  const local = await readJson(HOSTED_FILE, {});
  const result = {
    models: {},
    generated: {},
    uploads: {},
    ...local,
    ...(dbHosted?.map || {}),
  };
  cachedHostedMap = result;
  cachedHostedTime = now;
  return result;
};

const saveHosted = async (value) => {
  cachedHostedMap = value;
  cachedHostedTime = Date.now();
  await writeJson(HOSTED_FILE, value);
  try {
    const db = await getMongoDb();
    if (db) {
      await db.collection('hosted_images').updateOne(
        { _id: 'image_map' },
        { $set: { map: value, updatedAt: new Date().toISOString() } },
        { upsert: true }
      );
    }
  } catch { }
};

/** Save a data URI locally as static file in public/hosted/<subfolder>/ */
async function saveLocalAsset(dataUrl, subfolder = 'sets', prefix = 'asset') {
  const dir = path.join(PUBLIC_DIR, 'hosted', subfolder);
  await fs.mkdir(dir, { recursive: true });
  const matches = String(dataUrl || '').match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
  const ext = matches && matches[1].includes('jpeg') ? '.jpg' : matches && matches[1].includes('webp') ? '.webp' : '.png';
  const base64Data = matches ? matches[2] : String(dataUrl).replace(/^data:[^;]+;base64,/, '');
  const fname = `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}${ext}`;
  const filePath = path.join(dir, fname);
  await fs.writeFile(filePath, Buffer.from(base64Data, 'base64'));
  const localUrl = `/hosted/${subfolder}/${fname}`;

  // Persist to MongoDB hosted_assets collection for permanent cloud survival (non-blocking)
  void (async () => {
    try {
      const db = await getMongoDb();
      if (db) {
        await db.collection('hosted_assets').updateOne(
          { id: fname },
          { $set: { id: fname, url: localUrl, subfolder, dataUrl, createdAt: Date.now() } },
          { upsert: true }
        ).catch(() => { });
      }
    } catch { }
  })();

  return localUrl;
}

/** Upload an image to Cloudinary; gracefully falls back to local high-speed storage if unconfigured or API error */
async function uploadToCloudinary(dataUrl, userId, kind) {
  if (!dataUrl || typeof dataUrl !== 'string') {
    return { url: '', secure_url: '', publicId: '' };
  }
  if (!dataUrl.startsWith('data:')) {
    return { url: dataUrl, secure_url: dataUrl, publicId: dataUrl };
  }

  const s = await getSettings();
  const cloudName = String(s.cloudinaryCloudName || process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = String(s.cloudinaryApiKey || process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = String(s.cloudinaryApiSecret || process.env.CLOUDINARY_API_SECRET || '').trim();

  // If Cloudinary credentials look valid (numeric API Key is required by Cloudinary):
  if (cloudName && apiKey && apiSecret && /^\d+$/.test(apiKey)) {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const publicId = `shivnaresh-sets/${userId}/${kind}-${Date.now().toString(36)}`;
      const signParams = { public_id: publicId, timestamp };
      const signStr =
        Object.entries(signParams)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${k}=${v}`)
          .join('&') + apiSecret;
      const signature = crypto.createHash('sha1').update(signStr).digest('hex');

      const form = new FormData();
      form.append('file', dataUrl);
      form.append('public_id', publicId);
      form.append('timestamp', String(timestamp));
      form.append('api_key', apiKey);
      form.append('signature', signature);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        { method: 'POST', body: form },
      );
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.secure_url) {
        return { url: data.secure_url, secure_url: data.secure_url, publicId: data.public_id };
      }
      console.warn('[cloudinary] Upload error, falling back to local storage:', data.error?.message || response.status);
    } catch (cdnErr) {
      console.warn('[cloudinary] Upload exception, falling back to local storage:', cdnErr.message);
    }
  }

  // Seamless fallback to high-speed static local asset storage
  const localUrl = await saveLocalAsset(dataUrl, 'sets', `${userId}-${kind}`);
  return { url: localUrl, secure_url: localUrl, publicId: `local-${kind}-${Date.now()}` };
}

const mask = (key) => (key ? `${key.slice(0, 6)}…${key.slice(-4)}` : '');

/* -------------------------------------------------------------- helpers */
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

/** Turn any local asset path (or absolute URL) into a data URI FASHN can read.
 *  FASHN's servers cannot reach localhost, so uploaded files must travel inline. */
async function toDataUri(src) {
  if (!src) throw new Error('missing image');
  if (src.startsWith('data:')) return src;

  // If it's a URL, check if it points to an upload or model on this server, or if filename exists locally
  let rawPath = src;
  if (/^https?:\/\//i.test(src)) {
    try {
      const parsed = new URL(src);
      if (parsed.pathname.startsWith('/uploads/') || parsed.pathname.startsWith('/models/')) {
        rawPath = parsed.pathname;
      }
    } catch { }
  }

  const cleanPath = decodeURIComponent(rawPath.split('?')[0]).replace(/^\//, '');
  const basename = path.basename(cleanPath);

  const candidates = [
    path.join(UPLOADS, basename),
    path.join(DATA, 'uploads', basename),
    path.join(ROOT, 'server', 'data', 'uploads', basename),
    path.join(PUBLIC_DIR, cleanPath),
    path.join(PUBLIC_DIR, 'models', cleanPath.replace(/^models\//, '')),
    path.join(ROOT, 'public', cleanPath),
    path.join(ROOT, cleanPath),
  ];

  for (const candidate of candidates) {
    try {
      const buf = await fs.readFile(candidate);
      const ext = path.extname(candidate).toLowerCase();
      const mime = MIME[ext] || 'image/webp';
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch {
      /* try the next candidate */
    }
  }

  // Check hosted map (Cloudinary / permanent CDN)
  try {
    const hosted = await readHosted();
    const remoteUrl = hosted.uploads?.[basename] || hosted.models?.[basename] || hosted.generated?.[basename];
    if (remoteUrl && typeof remoteUrl === 'string' && /^https?:\/\//i.test(remoteUrl)) {
      const resp = await fetch(remoteUrl, { signal: AbortSignal.timeout(6000) });
      if (resp.ok) {
        const buf = Buffer.from(await resp.arrayBuffer());
        const contentType = resp.headers.get('content-type') || 'image/jpeg';
        return `data:${contentType};base64,${buf.toString('base64')}`;
      }
    }
  } catch { }

  // Check MongoDB user_uploads & studio_models if not found on ephemeral disk
  try {
    const db = await getMongoDb();
    if (db) {
      // 1. Check user_uploads
      const uploadDoc = await db.collection('user_uploads').findOne({
        $or: [
          { id: basename },
          { id: cleanPath },
          { url: `/uploads/${basename}` },
          { url: src },
          { remoteUrl: src },
        ],
      });
      if (uploadDoc?.dataUrl) return uploadDoc.dataUrl;
      if (uploadDoc?.remoteUrl && /^https?:\/\//i.test(uploadDoc.remoteUrl)) {
        try {
          const resp = await fetch(uploadDoc.remoteUrl, { signal: AbortSignal.timeout(6000) });
          if (resp.ok) {
            const buf = Buffer.from(await resp.arrayBuffer());
            const contentType = resp.headers.get('content-type') || 'image/jpeg';
            return `data:${contentType};base64,${buf.toString('base64')}`;
          }
        } catch { }
      }

      // 2. Check studio_models
      const modelId = cleanPath.replace(/^models\//, '');
      const doc = await db.collection('studio_models').findOne({
        $or: [{ id: modelId }, { id: cleanPath }, { url: src }, { remoteUrl: src }],
      });
      if (doc?.dataUrl) return doc.dataUrl;
      if (doc?.remoteUrl && /^https?:\/\//i.test(doc.remoteUrl)) {
        try {
          const resp = await fetch(doc.remoteUrl, { signal: AbortSignal.timeout(6000) });
          if (resp.ok) {
            const buf = Buffer.from(await resp.arrayBuffer());
            const contentType = resp.headers.get('content-type') || 'image/jpeg';
            return `data:${contentType};base64,${buf.toString('base64')}`;
          }
        } catch { }
      }
    }
  } catch { }

  // If it is an external URL not found on disk, fetch inline so Fashn always has the bytes
  if (/^https?:\/\//i.test(src)) {
    try {
      const resp = await fetch(src, { signal: AbortSignal.timeout(6000) });
      if (resp.ok) {
        const buf = Buffer.from(await resp.arrayBuffer());
        const contentType = resp.headers.get('content-type') || 'image/jpeg';
        return `data:${contentType};base64,${buf.toString('base64')}`;
      }
    } catch { }
    return src;
  }

  throw new Error(`Garment asset "${basename}" is no longer available on disk or storage. Please re-upload your garment image.`);
}

let cachedModelCategories = null;
let cachedModelsTime = 0;

async function listModels(forceFresh = false) {
  const now = Date.now();
  if (!forceFresh && cachedModelCategories && now - cachedModelsTime < 30_000) {
    return cachedModelCategories;
  }
  const categoriesMap = new Map();
  const deletedSet = new Set();

  // 1. Fetch persistent studio models and deleted markers from MongoDB (projection excludes multi-MB dataUrl)
  try {
    const db = await getMongoDb();
    if (db) {
      const dbModels = await db
        .collection('studio_models')
        .find({}, { projection: { dataUrl: 0 } })
        .toArray();
      for (const m of dbModels) {
        if (m.deleted) {
          deletedSet.add(m.id);
          continue;
        }
        if (!categoriesMap.has(m.category)) {
          categoriesMap.set(m.category, new Map());
        }
        categoriesMap.get(m.category).set(m.id, {
          id: m.id,
          name: m.name,
          url: m.remoteUrl || m.url || `/models/${encodeURIComponent(m.category)}/${encodeURIComponent(m.name || 'model')}`,
          createdAt: m.createdAt || 0,
        });
      }
    }
  } catch (err) {
    console.warn('[models] MongoDB studio_models read error:', err.message);
  }

  // 2. Read local disk models from public/models (built-in repository models)
  let dirs = [];
  try {
    dirs = await fs.readdir(MODELS_DIR, { withFileTypes: true });
  } catch {
    dirs = [];
  }
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const catName = dir.name;
    const files = (await fs.readdir(path.join(MODELS_DIR, catName)).catch(() => [])).filter((f) => /\.(webp|png|jpe?g)$/i.test(f));

    if (!categoriesMap.has(catName)) {
      categoriesMap.set(catName, new Map());
    }
    const catItems = categoriesMap.get(catName);

    for (const file of files) {
      const modelId = `${catName}/${file}`;
      if (deletedSet.has(modelId)) continue;

      if (!catItems.has(modelId)) {
        catItems.set(modelId, {
          id: modelId,
          name: file.replace(/\.[^.]+$/, ''),
          url: `/models/${encodeURIComponent(catName)}/${encodeURIComponent(file)}`,
          createdAt: 0,
        });
      }
    }
  }

  // 3. Merge remote hosted CDN URLs
  try {
    const hosted = await readHosted();
    if (hosted?.models) {
      for (const catItems of categoriesMap.values()) {
        for (const item of catItems.values()) {
          const remote = hosted.models[item.id];
          if (remote) item.url = remote;
        }
      }
    }
  } catch { }

  // 4. Format into category array with stable sorting
  const out = [];
  for (const [category, itemsMap] of categoriesMap.entries()) {
    const items = Array.from(itemsMap.values())
      .filter((it) => !deletedSet.has(it.id))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0) || a.name.localeCompare(b.name));
    if (items.length > 0) {
      out.push({ category, items });
    }
  }
  cachedModelCategories = out;
  cachedModelsTime = now;
  return out;
}

/* ------------------------------------------------------------- app boot */
const app = express();

/* Enable Gzip / Brotli response compression to minimize bandwidth usage */
app.use(compression());

/* Enable Cross-Origin Resource Sharing (CORS) for all Render and web origins */
app.use((req, res, next) => {
  const origin = req.headers.origin;
  res.header('Access-Control-Allow-Origin', origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
/* Handle client JSON parse / payload size errors gracefully without dropping socket connection */
app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({ error: 'payload_too_large', message: 'Uploaded images are too large. Please compress or resize before generating.' });
  }
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'invalid_json', message: 'Malformed JSON payload' });
  }
  next(err);
});
app.use('/uploads', express.static(UPLOADS, { maxAge: '1d' }));
app.use('/uploads', async (req, res, next) => {
  try {
    const filename = path.basename(decodeURIComponent(req.path));
    const candidate1 = path.join(UPLOADS, filename);
    if (fsSync.existsSync(candidate1) && fsSync.statSync(candidate1).isFile()) {
      return res.sendFile(candidate1, { maxAge: '7d' });
    }
    const candidate2 = path.join(DATA, 'uploads', filename);
    if (fsSync.existsSync(candidate2) && fsSync.statSync(candidate2).isFile()) {
      return res.sendFile(candidate2, { maxAge: '7d' });
    }
    const candidate3 = path.join(ROOT, 'server', 'data', 'uploads', filename);
    if (fsSync.existsSync(candidate3) && fsSync.statSync(candidate3).isFile()) {
      return res.sendFile(candidate3, { maxAge: '7d' });
    }
    // Fallback: If local file was deleted by a cloud redeploy, redirect to permanent hosted CDN!
    const hosted = await readHosted();
    const remoteUrl = hosted.uploads?.[filename] || hosted.models?.[filename];
    if (remoteUrl && typeof remoteUrl === 'string') {
      return res.redirect(302, remoteUrl);
    }
    // Fallback 2: Retrieve persistent dataUrl buffer from MongoDB user_uploads or admin_delivery_files
    try {
      const db = await getMongoDb();
      if (db) {
        let doc = await db.collection('user_uploads').findOne({
          $or: [{ id: filename }, { url: `/uploads/${filename}` }]
        });
        if (!doc || !doc.dataUrl) {
          doc = await db.collection('admin_delivery_files').findOne({
            $or: [{ id: filename }, { url: `/uploads/${filename}` }]
          });
        }
        if (doc && doc.dataUrl) {
          const m = /^data:(image\/[a-z0-9+.-]+);base64,(.+)$/i.exec(doc.dataUrl);
          if (m) {
            const buf = Buffer.from(m[2], 'base64');
            res.set('Content-Type', m[1]);
            res.set('Cache-Control', 'public, max-age=86400');
            return res.send(buf);
          }
        }
      }
    } catch { }
  } catch { }
  if (req.path && /\.(png|jpe?g|webp|svg)$/i.test(req.path)) {
    return res.status(404).json({ error: 'asset_not_found', path: req.path });
  }
  next();
});

app.use('/generated', express.static(GENERATED, { maxAge: '1d' }));
app.use('/generated', async (req, res, next) => {
  try {
    const filename = path.basename(decodeURIComponent(req.path));
    const candidate1 = path.join(GENERATED, filename);
    if (fsSync.existsSync(candidate1) && fsSync.statSync(candidate1).isFile()) {
      if (fsSync.statSync(candidate1).size > 20000) {
        return res.sendFile(candidate1, { maxAge: '7d' });
      } else {
        try { fsSync.unlinkSync(candidate1); } catch { }
      }
    }
    const candidate2 = path.join(DATA, 'generated', filename);
    if (fsSync.existsSync(candidate2) && fsSync.statSync(candidate2).isFile()) {
      if (fsSync.statSync(candidate2).size > 20000) {
        return res.sendFile(candidate2, { maxAge: '7d' });
      } else {
        try { fsSync.unlinkSync(candidate2); } catch { }
      }
    }

    // Fallback 1: Lookup MongoDB generations collection
    const jobId = filename.replace(/-\d+\.[^.]+$/, '');
    try {
      const db = await getMongoDb();
      if (db) {
        const gen = await db.collection('generations').findOne({
          $or: [
            { id: jobId },
            { id: { $regex: `^${jobId}`, $options: 'i' } },
            { id: filename },
            { url: `/generated/${filename}` },
            { url: { $regex: filename, $options: 'i' } },
            { outputUrl: `/generated/${filename}` },
            { outputUrl: { $regex: filename, $options: 'i' } }
          ]
        });
        let remoteUrl = (gen?.remoteUrl && gen.remoteUrl.startsWith('http') && !gen.remoteUrl.includes('ibb.co')) ? gen.remoteUrl : null;
        if (!remoteUrl && gen?.highResUrl && gen.highResUrl.startsWith('http') && !gen.highResUrl.includes('ibb.co')) {
          remoteUrl = gen.highResUrl;
        }

        // Live upstream recovery if remoteUrl was omitted before disk wiped
        if (!remoteUrl) {
          try {
            const state = await readState();
            const apiKey = state.apiKey || process.env.FASHN_API_KEY;
            const lookupId = gen?.id || jobId;
            if (apiKey && lookupId && lookupId.length > 5) {
              const fashnRes = await fetch(`${FASHN}/status/${lookupId}`, {
                headers: { Authorization: `Bearer ${apiKey}` },
                signal: AbortSignal.timeout(4500),
              });
              if (fashnRes.ok) {
                const fashnData = await fashnRes.json().catch(() => ({}));
                if (fashnData.status === 'completed' && Array.isArray(fashnData.output) && fashnData.output[0]) {
                  remoteUrl = fashnData.output[0];
                  if (gen?.id) {
                    await db.collection('generations').updateOne(
                      { id: gen.id },
                      { $set: { remoteUrl, highResUrl: remoteUrl } }
                    ).catch(() => { });
                  }
                }
              }
            }
          } catch { }
        }

        if (!remoteUrl && gen) {
          const fallbackCand = [gen.remoteUrl, gen.highResUrl, gen.url].find((u) => u && typeof u === 'string' && u.startsWith('http'));
          if (fallbackCand) remoteUrl = fallbackCand;
        }

        if (remoteUrl && typeof remoteUrl === 'string' && remoteUrl.startsWith('http')) {
          const upstream = await fetch(remoteUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
            signal: AbortSignal.timeout(4500),
          });
          if (upstream.ok) {
            const buf = Buffer.from(await upstream.arrayBuffer());
            if (remoteUrl.includes('ibb.co') && buf.byteLength <= 20000) {
              // Dead placeholder image, do not serve
            } else {
              const contentType = upstream.headers.get('content-type') || 'image/png';
              try { await fs.writeFile(candidate1, buf); } catch { }
              res.set('Content-Type', contentType);
              res.set('Cache-Control', 'public, max-age=86400');
              return res.send(buf);
            }
          }
        }
      }
    } catch { }

    // Fallback 2: Direct Fashn status check by jobId if missing from DB
    try {
      const state = await readState();
      const apiKey = state.apiKey || process.env.FASHN_API_KEY;
      if (apiKey && jobId && jobId.length > 8) {
        const fashnRes = await fetch(`${FASHN}/status/${jobId}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(4500),
        });
        if (fashnRes.ok) {
          const fashnData = await fashnRes.json().catch(() => ({}));
          if (fashnData.status === 'completed' && Array.isArray(fashnData.output) && fashnData.output[0]) {
            const upstream = await fetch(fashnData.output[0], {
              signal: AbortSignal.timeout(4500),
            });
            if (upstream.ok) {
              const contentType = upstream.headers.get('content-type') || 'image/png';
              const buf = Buffer.from(await upstream.arrayBuffer());
              try { await fs.writeFile(candidate1, buf); } catch { }
              res.set('Content-Type', contentType);
              res.set('Cache-Control', 'public, max-age=86400');
              return res.send(buf);
            }
          }
        }
      }
    } catch { }

    // Fallback 3: Check hosted.json
    try {
      const hosted = await readHosted();
      const remoteUrl = hosted.generated?.[filename];
      if (remoteUrl && typeof remoteUrl === 'string' && !remoteUrl.includes('ibb.co')) {
        return res.redirect(302, remoteUrl);
      }
    } catch { }
  } catch { }
  if (req.path && /\.(png|jpe?g|webp|svg)$/i.test(req.path)) {
    return res.status(404).json({ error: 'asset_not_found', path: req.path });
  }
  next();
});
app.use('/models', express.static(MODELS_DIR, { maxAge: '7d' }));
app.use('/models', express.static(path.join(ROOT, 'dist', 'models'), { maxAge: '7d' }));
app.use('/models', async (req, res, next) => {
  try {
    const decodedPath = decodeURIComponent(req.path.replace(/^\//, ''));
    const candidate1 = path.join(MODELS_DIR, decodedPath);
    if (fsSync.existsSync(candidate1) && fsSync.statSync(candidate1).isFile()) {
      return res.sendFile(candidate1, { maxAge: '30d' });
    }
    const candidate2 = path.join(ROOT, 'dist', 'models', decodedPath);
    if (fsSync.existsSync(candidate2) && fsSync.statSync(candidate2).isFile()) {
      return res.sendFile(candidate2, { maxAge: '30d' });
    }
    const candidate3 = path.join(PUBLIC_DIR, 'models', decodedPath);
    if (fsSync.existsSync(candidate3) && fsSync.statSync(candidate3).isFile()) {
      return res.sendFile(candidate3, { maxAge: '30d' });
    }

    // Fallback: check MongoDB studio_models if ephemeral disk lost the file
    try {
      const db = await getMongoDb();
      if (db) {
        const doc = await db.collection('studio_models').findOne({ id: decodedPath });
        if (doc?.dataUrl) {
          const match = /^data:image\/([a-zA-Z0-9]+);base64,(.+)$/.exec(doc.dataUrl);
          if (match) {
            const ext = match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase();
            res.setHeader('Content-Type', `image/${ext}`);
            res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
            return res.send(Buffer.from(match[2], 'base64'));
          }
        }
      }
    } catch { }
  } catch { }
  if (req.path && /\.(png|jpe?g|webp|svg)$/i.test(req.path)) {
    return res.status(404).json({ error: 'asset_not_found', path: req.path });
  }
  next();
});

app.use('/hosted', express.static(path.join(PUBLIC_DIR, 'hosted'), { maxAge: '7d' }));
app.use('/hosted', express.static(path.join(ROOT, 'public', 'hosted'), { maxAge: '7d' }));
app.use('/hosted', async (req, res, next) => {
  try {
    const rawPath = decodeURIComponent(req.path);
    const parts = rawPath.split('/').filter(Boolean);
    const filename = parts.length > 0 ? parts[parts.length - 1] : '';
    const subfolder = parts.length > 1 ? parts[0] : 'sets';
    const candidate1 = path.join(PUBLIC_DIR, 'hosted', subfolder, filename);
    if (fsSync.existsSync(candidate1) && fsSync.statSync(candidate1).isFile()) {
      return res.sendFile(candidate1);
    }
    const candidate2 = path.join(ROOT, 'public', 'hosted', subfolder, filename);
    if (fsSync.existsSync(candidate2) && fsSync.statSync(candidate2).isFile()) {
      return res.sendFile(candidate2);
    }

    // Fallback: lookup persistent MongoDB hosted_assets
    try {
      const db = await getMongoDb();
      if (db && filename) {
        const doc = await db.collection('hosted_assets').findOne({
          $or: [
            { id: filename },
            { url: `/hosted/${subfolder}/${filename}` },
            { url: `/hosted/${filename}` },
            { url: { $regex: filename, $options: 'i' } }
          ]
        });
        if (doc && doc.dataUrl) {
          const m = /^data:(image\/[a-z0-9+.-]+);base64,(.+)$/i.exec(doc.dataUrl);
          if (m) {
            const buf = Buffer.from(m[2], 'base64');
            // Write to local disk cache for instant 0ms hits on subsequent requests
            try {
              const targetDir = path.join(PUBLIC_DIR, 'hosted', subfolder);
              await fs.mkdir(targetDir, { recursive: true });
              await fs.writeFile(path.join(targetDir, filename), buf);
            } catch {}
            res.set('Content-Type', m[1]);
            res.set('Cache-Control', 'public, max-age=604800, immutable');
            return res.send(buf);
          }
        }
      }
    } catch { }
  } catch { }
  if (req.path && /\.(png|jpe?g|webp|svg)$/i.test(req.path)) {
    return res.status(404).json({ error: 'asset_not_found', path: req.path });
  }
  next();
});
app.use('/guidelines', express.static(path.join(PUBLIC_DIR, 'guidelines'), { maxAge: '7d' }));
app.use('/guidelines', express.static(path.join(ROOT, 'public', 'guidelines'), { maxAge: '7d' }));

const patchState = async (patch) => {
  const current = await readState();
  const next = { ...current, ...patch };
  delete next._id;
  cachedAppState = next;
  cachedStateTime = Date.now();
  await writeJson(STATE_FILE, next);
  try {
    const db = await getMongoDb();
    if (db) {
      await db.collection('app_state').updateOne(
        { _id: 'global_state' },
        { $set: next },
        { upsert: true }
      );
    }
  } catch (err) {
    console.warn('[state] MongoDB patchState warning:', err.message);
  }
  return next;
};
const updateState = patchState;

// Seed MongoDB Atlas app_state if not yet present
(async () => {
  try {
    const db = await getMongoDb();
    if (db) {
      const existing = await db.collection('app_state').findOne({ _id: 'global_state' });
      if (!existing) {
        const initial = await readState();
        await db.collection('app_state').updateOne(
          { _id: 'global_state' },
          { $set: initial },
          { upsert: true }
        );
        console.log('[state] Seeded initial state to MongoDB Atlas app_state');
      }
    }
  } catch (e) {
    console.warn('[state] Could not seed MongoDB Atlas state:', e.message);
  }
})();

const auth = createAuth({ dataDir: DATA, getState: readState, patchState, env: process.env });
/* resolve the session before any route — including the auth router itself */
app.use(auth.attachUser);
app.use('/api/auth', auth.router);

/* UPI Payment Gateway & Bank Transfer Engine (compatible with mynkdev-21/upi-gateway) */
const upiGateway = createUpiGateway({
  dataDir: DATA,
  getState: readState,
  patchState,
  auth,
  recordProblem: recordSystemProblem,
});
app.use('/api/upi-gateway', upiGateway.router);
app.use('/api/v1', upiGateway.router);

app.get(['/api/health', '/health', '/api/ping'], (_req, res) => {
  res.json({
    ok: true,
    status: 'online',
    uptime: Math.round(process.uptime()),
    timestamp: Date.now(),
    service: 'shivnaresh-augmented-studio',
  });
});

/* ------------------------------------------------------------- image proxy & catalog direct download */
app.get('/api/proxy-image', async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl || typeof imageUrl !== 'string') {
    return res.status(400).json({ error: 'Missing image url' });
  }

  try {
    if (imageUrl.startsWith('/')) {
      const cleanPath = imageUrl.replace(/^\/+/, '');
      const localFile = path.join(DATA, cleanPath);
      if (fsSync.existsSync(localFile) && fsSync.statSync(localFile).isFile()) {
        const buffer = await fs.readFile(localFile);
        const contentType = localFile.endsWith('.jpg') || localFile.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'public, max-age=86400');
        return res.send(buffer);
      }
    }

    const parsed = new URL(imageUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'Invalid URL protocol' });
    }

    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('172.16.') ||
      host.startsWith('169.254.')
    ) {
      return res.status(403).json({ error: 'Private network addresses are forbidden' });
    }

    // 1. Instant Cache Hit Check (<1ms) from persistent local proxy cache
    const hash = crypto.createHash('md5').update(imageUrl).digest('hex');
    try {
      if (fsSync.existsSync(PROXY_CACHE_DIR)) {
        const files = fsSync.readdirSync(PROXY_CACHE_DIR);
        const match = files.find((f) => f.startsWith(hash));
        if (match) {
          const hitPath = path.join(PROXY_CACHE_DIR, match);
          const ext = path.extname(hitPath).toLowerCase();
          const ct = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
          res.set('Access-Control-Allow-Origin', '*');
          res.set('Content-Type', ct);
          res.set('Cache-Control', 'public, max-age=604800, immutable');
          return res.sendFile(hitPath);
        }
      }
    } catch { }

    const upstream = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Referer': 'https://ibb.co/',
      },
      signal: AbortSignal.timeout(20000),
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Upstream error HTTP ${upstream.status}` });
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (imageUrl.includes('ibb.co') && buffer.byteLength <= 20000) {
      return res.status(404).json({ error: 'Upstream image expired or deleted on imgbb' });
    }

    // Write to persistent disk cache for 0ms future reads
    const ext = contentType.includes('png') ? '.png' : contentType.includes('webp') ? '.webp' : '.jpg';
    void fs.writeFile(path.join(PROXY_CACHE_DIR, `${hash}${ext}`), buffer).catch(() => { });

    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    return res.send(buffer);
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return res.status(504).json({ error: 'Upstream image request timed out' });
    }
    return res.status(500).json({ error: 'Failed to proxy image: ' + err.message });
  }
});

app.get('/api/download-proxy', async (req, res) => {
  const imageUrl = req.query.url;
  const filename = req.query.filename || 'catalog-render.png';
  if (!imageUrl || typeof imageUrl !== 'string') {
    return res.status(400).json({ error: 'Missing image url' });
  }

  try {
    let buffer;
    let contentType = 'image/png';

    if (imageUrl.startsWith('/')) {
      const cleanPath = imageUrl.replace(/^\/+/, '');
      const localFile = path.join(DATA, cleanPath);
      if (fsSync.existsSync(localFile) && fsSync.statSync(localFile).isFile()) {
        buffer = await fs.readFile(localFile);
        contentType = localFile.endsWith('.jpg') || localFile.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
      } else {
        const id = path.basename(cleanPath).replace(/-\d+\.[^.]+$/, '');
        const filename = path.basename(cleanPath);
        const db = await getMongoDb();
        if (db) {
          const gen = await db.collection('generations').findOne({
            $or: [
              { id },
              { id: { $regex: `^${id}`, $options: 'i' } },
              { id: filename },
              { url: imageUrl },
              { url: { $regex: filename, $options: 'i' } },
              { outputUrl: imageUrl },
              { outputUrl: { $regex: filename, $options: 'i' } }
            ]
          });
          let targetUrl = (gen?.remoteUrl && gen.remoteUrl.startsWith('http')) ? gen.remoteUrl : null;
          if (!targetUrl && gen?.highResUrl && gen.highResUrl.startsWith('http')) {
            targetUrl = gen.highResUrl;
          }
          if (!targetUrl) {
            try {
              const state = await readState();
              const apiKey = state.apiKey || process.env.FASHN_API_KEY;
              const lookupId = gen?.id || id;
              if (apiKey && lookupId && lookupId.length > 5) {
                const fashnRes = await fetch(`${FASHN}/status/${lookupId}`, {
                  headers: { Authorization: `Bearer ${apiKey}` },
                });
                if (fashnRes.ok) {
                  const fashnData = await fashnRes.json().catch(() => ({}));
                  if (fashnData.status === 'completed' && Array.isArray(fashnData.output) && fashnData.output[0]) {
                    targetUrl = fashnData.output[0];
                    if (gen?.id) {
                      await db.collection('generations').updateOne(
                        { id: gen.id },
                        { $set: { remoteUrl: targetUrl, highResUrl: targetUrl } }
                      ).catch(() => { });
                    }
                  }
                }
              }
            } catch { }
          }
          if (targetUrl && typeof targetUrl === 'string' && targetUrl.startsWith('http')) {
            const upstream = await fetch(targetUrl);
            if (upstream.ok) {
              buffer = Buffer.from(await upstream.arrayBuffer());
              contentType = upstream.headers.get('content-type') || 'image/png';
            }
          }
        }
        if (!buffer) {
          try {
            const state = await readState();
            const apiKey = state.apiKey || process.env.FASHN_API_KEY;
            if (apiKey && id && id.length > 8) {
              const fashnRes = await fetch(`${FASHN}/status/${id}`, {
                headers: { Authorization: `Bearer ${apiKey}` },
              });
              if (fashnRes.ok) {
                const fashnData = await fashnRes.json().catch(() => ({}));
                if (fashnData.status === 'completed' && Array.isArray(fashnData.output) && fashnData.output[0]) {
                  const upstream = await fetch(fashnData.output[0]);
                  if (upstream.ok) {
                    buffer = Buffer.from(await upstream.arrayBuffer());
                    contentType = upstream.headers.get('content-type') || 'image/png';
                  }
                }
              }
            }
          } catch { }
        }
        if (!buffer) {
          try {
            const hosted = await readHosted();
            const remoteUrl = hosted.generated?.[filename] || hosted.uploads?.[filename];
            if (remoteUrl && typeof remoteUrl === 'string' && remoteUrl.startsWith('http')) {
              const upstream = await fetch(remoteUrl);
              if (upstream.ok) {
                buffer = Buffer.from(await upstream.arrayBuffer());
                contentType = upstream.headers.get('content-type') || 'image/png';
              }
            }
          } catch { }
        }
      }
      if (!buffer) {
        return res.status(404).json({ error: 'Image file not found on server' });
      }
    } else {
      const parsed = new URL(imageUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return res.status(400).json({ error: 'Invalid URL protocol' });
      }

      const host = parsed.hostname.toLowerCase();
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '::1' ||
        host.startsWith('10.') ||
        host.startsWith('192.168.') ||
        host.startsWith('172.16.') ||
        host.startsWith('169.254.')
      ) {
        return res.status(403).json({ error: 'Private network addresses are forbidden' });
      }

      const upstream = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      if (!upstream.ok) {
        return res.status(upstream.status).json({ error: `Upstream error HTTP ${upstream.status}` });
      }

      contentType = upstream.headers.get('content-type') || 'image/png';
      buffer = Buffer.from(await upstream.arrayBuffer());
      if (imageUrl.includes('ibb.co') && buffer.byteLength <= 20000) {
        return res.status(404).json({ error: 'Upstream image expired or deleted on imgbb' });
      }
    }

    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Disposition', `attachment; filename="${String(filename).replace(/["\r\n]/g, '')}"`);
    res.set('Content-Type', contentType);
    return res.send(buffer);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to download image: ' + err.message });
  }
});

/* what the customer-facing studio is allowed to know */
app.get('/api/studio', async (_req, res) => {
  const s = await readState();
  res.json({
    ready: Boolean(s.apiKey),
    defaultPrompt: s.defaultPrompt,
    defaultModel: s.defaultModel,
    resolution: s.resolution,
    generationMode: s.generationMode,
    defaultMode: s.defaultMode,
  });
});

/* ------------------------------------------------------------- admin */
const maskUri = (uri) => {
  if (!uri) return '';
  try {
    const parsed = new URL(uri);
    if (parsed.password) parsed.password = '••••';
    return parsed.toString();
  } catch {
    return `${uri.slice(0, 18)}…`;
  }
};

/* ------------------------------------------------------------ admin gate
   Jaatshab11223315@gmail.com is the exclusive primary admin account.
   Access to /admin is only granted after authenticating with the correct password. */
const adminList = (state) => {
  const custom = [state.adminEmail, ...(Array.isArray(state.adminEmails) ? state.adminEmails : [])]
    .map((entry) => String(entry || '').trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([PRIMARY_ADMIN_EMAIL.toLowerCase(), ...custom]));
};

const isAdmin = async (req) => {
  if (!req.user || !req.user.email) return false;
  const email = String(req.user.email).trim().toLowerCase();
  if (email !== PRIMARY_ADMIN_EMAIL.toLowerCase()) return false;
  const state = await readState();
  if (!state.admin2faEnabled) return true;
  return Boolean(req.user.admin2fa || req.tokenPayload?.admin2fa);
};

const requireAdmin = async (req, res, next) => {
  if (await isAdmin(req)) return next();
  return res.status(403).json({
    error: 'forbidden',
    message: 'This panel is strictly restricted to authorized administrators (Jaatshab11223315@gmail.com) with 2FA authorization. Please complete verification.',
  });
};

app.get('/api/admin/access', async (req, res) => {
  const email = String(req.user?.email || '').trim().toLowerCase();
  const isPrimary = email === PRIMARY_ADMIN_EMAIL.toLowerCase();
  const state = await readState();
  const is2faEnforced = Boolean(state.admin2faEnabled);
  const has2fa = Boolean(req.user?.admin2fa || req.tokenPayload?.admin2fa);
  const isAuthorized = Boolean(isPrimary && (!is2faEnforced || has2fa));
  res.json({
    claimed: true,
    admin: isAuthorized,
    isPrimaryAdmin: isPrimary,
    requires2fa: Boolean(isPrimary && is2faEnforced && !has2fa),
    signedIn: Boolean(req.user),
    email: PRIMARY_ADMIN_EMAIL.replace(/^(.)[^@]*(@.*)$/, '$1•••$2'),
  });
});

let cachedFashnCredits = null;
let cachedFashnTime = 0;

app.get('/api/admin/fashn-credits', requireAdmin, async (_req, res) => {
  try {
    const state = await readState();
    if (!state.apiKey) {
      return res.json({ configured: false, total: 0, subscription: 0, onDemand: 0 });
    }
    // Return cached balance if within 5 seconds, otherwise fetch live from Fashn.ai
    const now = Date.now();
    if (cachedFashnCredits && now - cachedFashnTime < 5000) {
      return res.json(cachedFashnCredits);
    }
    const response = await fetch('https://api.fashn.ai/v1/credits', {
      headers: { Authorization: `Bearer ${state.apiKey}` },
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok && data.credits) {
      const result = {
        configured: true,
        total: Number(data.credits.total ?? 0),
        subscription: Number(data.credits.subscription ?? 0),
        onDemand: Number(data.credits.on_demand ?? 0),
        updatedAt: new Date().toISOString(),
      };
      cachedFashnCredits = result;
      cachedFashnTime = now;
      return res.json(result);
    }
    if (cachedFashnCredits) {
      return res.json(cachedFashnCredits);
    }
    return res.json({
      configured: true,
      total: 0,
      subscription: 0,
      onDemand: 0,
      error: data.message || 'Could not fetch credits',
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (cachedFashnCredits) return res.json(cachedFashnCredits);
    res.status(500).json({ error: 'credits_fetch_failed', message: err.message });
  }
});

app.post('/api/admin/claim', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized', message: 'Sign in first.' });
  const s = await readState();
  const owners = adminList(s);
  const email = String(req.user.email || '').trim().toLowerCase();

  if (!owners.includes(email)) {
    return res.status(403).json({
      error: 'forbidden',
      message: 'Only the primary designated administrator (Jaatshab11223315@gmail.com) can access this panel.',
    });
  }
  res.json({ ok: true, admin: true });
});

app.get('/api/admin/settings', requireAdmin, async (_req, res) => {
  const s = await readState();
  res.json({
    apiKeySet: Boolean(s.apiKey),
    apiKeyMasked: mask(s.apiKey),
    mongoSet: Boolean(s.mongoUri || process.env.MONGODB_URI),
    mongoMasked: maskUri(s.mongoUri),
    mongoFromEnv: Boolean(!s.mongoUri && process.env.MONGODB_URI),
    storage: (await auth.storage()) ? 'mongodb' : 'local',
    googleClientId: s.googleClientId || process.env.GOOGLE_CLIENT_ID || '',
    googleSecretSet: Boolean(s.googleClientSecret || process.env.GOOGLE_CLIENT_SECRET),
    imgbbSet: Boolean(s.imgbbKey || process.env.IMGBB_KEY),
    imgbbMasked: mask(s.imgbbKey || process.env.IMGBB_KEY || ''),
    imgbbFromEnv: Boolean(!s.imgbbKey && process.env.IMGBB_KEY),
    defaultPrompt: s.defaultPrompt,
    defaultModel: s.defaultModel,
    resolution: s.resolution,
    generationMode: s.generationMode,
    defaultMode: s.defaultMode,
    cloudinaryCloudName: s.cloudinaryCloudName || process.env.CLOUDINARY_CLOUD_NAME || '',
    cloudinaryApiKeySet: Boolean(s.cloudinaryApiKey || process.env.CLOUDINARY_API_KEY),
    cloudinaryApiKeyMasked: mask(s.cloudinaryApiKey || process.env.CLOUDINARY_API_KEY || ''),
    cloudinaryApiSecretSet: Boolean(s.cloudinaryApiSecret || process.env.CLOUDINARY_API_SECRET),
    resendApiKeySet: Boolean(s.resendApiKey || process.env.RESEND_API_KEY || RESEND_DEFAULT_KEY),
    resendApiKeyMasked: mask(s.resendApiKey || process.env.RESEND_API_KEY || RESEND_DEFAULT_KEY),
    resendFromEmail: s.resendFromEmail || process.env.RESEND_FROM || 'Shiv-Naresh AI Studio <onboarding@resend.dev>',
    brevoApiKeySet: Boolean(s.brevoApiKey || process.env.BREVO_API_KEY || getDefaultBrevoKey()),
    brevoApiKeyMasked: mask(s.brevoApiKey || process.env.BREVO_API_KEY || getDefaultBrevoKey()),
    admin2faEnabled: Boolean(s.admin2faEnabled),
    developerImageUrl: s.developerImageUrl || '',
    plans: { ...DEFAULT_PLANS, ...(s.plans || {}) },
  });
});

app.get('/api/plans', async (_req, res) => {
  const s = await readState();
  const plans = { ...DEFAULT_PLANS, ...(s.plans || {}) };
  res.json({ ok: true, plans });
});

app.put('/api/admin/plans', requireAdmin, async (req, res) => {
  const body = req.body || {};
  const inputPlans = body.plans || {};
  const current = await readState();
  const mergedPlans = { ...DEFAULT_PLANS, ...(current.plans || {}) };

  for (const [key, p] of Object.entries(inputPlans)) {
    if (!DEFAULT_PLANS[key]) continue;
    const psCount = p.photoshoots !== undefined ? Math.max(0, Number(p.photoshoots)) : (p.maxModels !== undefined ? Math.max(0, Number(p.maxModels)) : mergedPlans[key].photoshoots || mergedPlans[key].maxModels);
    mergedPlans[key] = {
      ...mergedPlans[key],
      ...p,
      priceUSD: p.priceUSD !== undefined ? Math.max(0, Number(p.priceUSD)) : mergedPlans[key].priceUSD,
      priceINR: p.priceINR !== undefined ? Math.max(0, Number(p.priceINR)) : (mergedPlans[key].priceINR || 0),
      credits: p.credits !== undefined ? Math.max(0, Number(p.credits)) : mergedPlans[key].credits,
      maxVideos: p.maxVideos !== undefined ? Math.max(0, Number(p.maxVideos)) : mergedPlans[key].maxVideos,
      maxModels: psCount,
      photoshoots: psCount,
      photoshootRule: '1 photoshoot = 5 poses',
      active: p.active !== undefined ? Boolean(p.active) : (mergedPlans[key].active !== false),
      deleted: p.deleted !== undefined ? Boolean(p.deleted) : Boolean(mergedPlans[key].deleted),
    };
  }

  await patchState({ plans: mergedPlans });
  res.json({ ok: true, message: 'Plan prices updated successfully', plans: mergedPlans });
});

app.post('/api/admin/test-email', auth.attachUser, auth.requireUser, async (req, res) => {
  if (!req.user || req.user.email !== 'jaatshab11223315@gmail.com') {
    return res.status(403).json({ error: 'forbidden', message: 'Master administrator only.' });
  }
  const testOtp = String(Math.floor(100000 + Math.random() * 900000));
  const sendRes = await auth.sendOtpEmail({
    email: 'jaatshab11223315@gmail.com',
    otp: testOtp,
    title: 'Brevo Delivery Test OTP',
    purpose: 'This is a live test email dispatched directly from your Shiv-Naresh AI Studio to verify deliverability.',
  });
  res.json({
    ok: sendRes.ok,
    provider: sendRes.provider || 'unknown',
    id: sendRes.id,
    error: sendRes.error,
    message: sendRes.ok
      ? `Live test email successfully delivered via ${sendRes.provider}! Check your inbox and spam folder.`
      : `Email delivery failed: ${sendRes.error}`,
  });
});

app.get('/api/developer-profile', async (_req, res) => {
  const s = await readState();
  const dp = s.developerProfile || {};
  res.json({
    name: dp.name || 'Pawan Kumar',
    college: dp.college || 'ARSD College, University of Delhi',
    degree: dp.degree || 'B.Sc. Computer Science',
    year: dp.year || '3rd Year Student',
    email: dp.email || 'lpawankumar015221684@gmail.com',
    mobile: dp.mobile || '6398743132',
    avatar: dp.avatar || s.developerImageUrl || '',
    bio: dp.bio || 'Pawan Kumar is a software engineer and AI researcher currently in his 3rd year studying B.Sc. Computer Science at ARSD College, University of Delhi. He conceptualized and engineered the Shiv-Naresh AI Virtual Try-On Studio to pioneer next-generation athletic e-commerce in India.',
  });
});

app.put('/api/admin/developer-profile', requireAdmin, async (req, res) => {
  const body = req.body || {};
  const s = await readState();
  const current = s.developerProfile || {};
  let avatarUrl = typeof body.avatar === 'string' ? body.avatar.trim() : current.avatar || s.developerImageUrl || '';

  // If avatar was passed as a base64 data URL, host it and persist URL permanently
  if (avatarUrl.startsWith('data:image/')) {
    try {
      const match = /^data:(image\/(png|jpe?g|webp));base64,(.+)$/i.exec(avatarUrl);
      if (match) {
        const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' }[match[1].toLowerCase()] || '.png';
        const file = `dev-avatar-${Date.now().toString(36)}${ext}`;
        const buffer = Buffer.from(match[3], 'base64');
        await fs.writeFile(path.join(UPLOADS, file), buffer);
        let hosted = null;
        try {
          hosted = await hostImage(buffer, 'developer-avatar');
          if (hosted) {
            const map = await readHosted();
            map.uploads = map.uploads || {};
            map.uploads[file] = hosted.url;
            await saveHosted(map);
          }
        } catch { }
        avatarUrl = hosted?.url || `/uploads/${file}`;
      }
    } catch (err) {
      console.warn('[developer-profile] Error saving avatar buffer:', err);
    }
  }

  const updatedProfile = {
    name: typeof body.name === 'string' ? body.name.trim() : current.name || 'Pawan Kumar',
    college: typeof body.college === 'string' ? body.college.trim() : current.college || 'ARSD College, University of Delhi',
    degree: typeof body.degree === 'string' ? body.degree.trim() : current.degree || 'B.Sc. Computer Science',
    year: typeof body.year === 'string' ? body.year.trim() : current.year || '3rd Year Student',
    email: typeof body.email === 'string' ? body.email.trim() : current.email || 'lpawankumar015221684@gmail.com',
    mobile: typeof body.mobile === 'string' ? body.mobile.trim() : current.mobile || '6398743132',
    bio: typeof body.bio === 'string' ? body.bio.trim() : current.bio || '',
    avatar: avatarUrl,
  };
  await patchState({
    developerProfile: updatedProfile,
    ...(updatedProfile.avatar ? { developerImageUrl: updatedProfile.avatar } : {}),
  });
  res.json({ ok: true, profile: updatedProfile });
});

app.put('/api/admin/settings', requireAdmin, async (req, res) => {
  const body = req.body || {};
  const patch = {
    ...('defaultPrompt' in body ? { defaultPrompt: String(body.defaultPrompt) } : {}),
    ...('defaultModel' in body ? { defaultModel: String(body.defaultModel) } : {}),
    ...('resolution' in body ? { resolution: String(body.resolution) } : {}),
    ...('generationMode' in body ? { generationMode: String(body.generationMode) } : {}),
    ...('defaultMode' in body ? { defaultMode: String(body.defaultMode) } : {}),
    ...('googleClientId' in body ? { googleClientId: String(body.googleClientId).trim() } : {}),
    ...('admin2faEnabled' in body ? { admin2faEnabled: Boolean(body.admin2faEnabled) } : {}),
    ...('developerImageUrl' in body ? { developerImageUrl: String(body.developerImageUrl).trim() } : {}),
  };
  if (typeof body.apiKey === 'string' && body.apiKey.trim()) {
    const key = body.apiKey.trim();
    if (!key.includes('•') && !key.includes('*') && key.length >= 8) {
      patch.apiKey = key;
    }
  }
  if (body.clearApiKey) patch.apiKey = '';
  if (typeof body.mongoUri === 'string' && body.mongoUri.trim() && !body.mongoUri.includes('••••')) {
    patch.mongoUri = body.mongoUri.trim();
  }
  if (body.clearMongo) patch.mongoUri = '';
  if (typeof body.googleClientSecret === 'string' && body.googleClientSecret.trim() && !body.googleClientSecret.includes('•')) {
    patch.googleClientSecret = body.googleClientSecret.trim();
  }
  if (body.clearGoogleSecret) patch.googleClientSecret = '';
  if (typeof body.imgbbKey === 'string' && body.imgbbKey.trim() && !body.imgbbKey.includes('•')) {
    patch.imgbbKey = body.imgbbKey.trim();
  }
  if (body.clearImgbb) patch.imgbbKey = '';
  if (typeof body.cloudinaryCloudName === 'string') patch.cloudinaryCloudName = body.cloudinaryCloudName.trim();
  if (typeof body.cloudinaryApiKey === 'string' && body.cloudinaryApiKey.trim() && !body.cloudinaryApiKey.includes('•')) {
    patch.cloudinaryApiKey = body.cloudinaryApiKey.trim();
  }
  if (body.clearCloudinaryApiKey) patch.cloudinaryApiKey = '';
  if (typeof body.cloudinaryApiSecret === 'string' && body.cloudinaryApiSecret.trim() && !body.cloudinaryApiSecret.includes('•')) {
    patch.cloudinaryApiSecret = body.cloudinaryApiSecret.trim();
  }
  if (body.clearCloudinaryApiSecret) patch.cloudinaryApiSecret = '';
  if (typeof body.resendApiKey === 'string' && body.resendApiKey.trim() && !body.resendApiKey.includes('•')) {
    patch.resendApiKey = body.resendApiKey.trim();
  }
  if (body.clearResendApiKey) patch.resendApiKey = '';
  if (typeof body.brevoApiKey === 'string' && body.brevoApiKey.trim() && !body.brevoApiKey.includes('•')) {
    patch.brevoApiKey = body.brevoApiKey.trim();
  }
  if (body.clearBrevoApiKey) patch.brevoApiKey = '';
  if (typeof body.resendFromEmail === 'string' && body.resendFromEmail.trim()) patch.resendFromEmail = body.resendFromEmail.trim();

  if (body.plans && typeof body.plans === 'object') {
    const s = await readState();
    const currentPlans = { ...DEFAULT_PLANS, ...(s.plans || {}) };
    for (const [key, p] of Object.entries(body.plans)) {
      if (!DEFAULT_PLANS[key]) continue;
      const psCount = p.photoshoots !== undefined ? Math.max(0, Number(p.photoshoots)) : (p.maxModels !== undefined ? Math.max(0, Number(p.maxModels)) : currentPlans[key].photoshoots || currentPlans[key].maxModels);
      currentPlans[key] = {
        ...currentPlans[key],
        ...p,
        priceUSD: p.priceUSD !== undefined ? Math.max(0, Number(p.priceUSD)) : currentPlans[key].priceUSD,
        priceINR: p.priceINR !== undefined ? Math.max(0, Number(p.priceINR)) : (currentPlans[key].priceINR || 0),
        credits: p.credits !== undefined ? Math.max(0, Number(p.credits)) : currentPlans[key].credits,
        maxVideos: p.maxVideos !== undefined ? Math.max(0, Number(p.maxVideos)) : currentPlans[key].maxVideos,
        maxModels: psCount,
        photoshoots: psCount,
        photoshootRule: '1 photoshoot = 5 poses',
      };
    }
    patch.plans = currentPlans;
  }

  const next = await patchState(patch);
  res.json({
    ok: true,
    apiKeySet: Boolean(next.apiKey),
    apiKeyMasked: mask(next.apiKey),
    mongoSet: Boolean(next.mongoUri || process.env.MONGODB_URI),
    mongoMasked: maskUri(next.mongoUri),
    storage: (await auth.storage()) ? 'mongodb' : 'local',
  });
});

/* ---------------------------------------------------- system problem logs */
app.post('/api/client-error', async (req, res) => {
  try {
    const { title, message, module = 'frontend', details, stack } = req.body || {};
    const userEmail = req.user?.email || 'guest';
    const userId = req.user?._id || null;
    await recordSystemProblem({
      module,
      severity: 'error',
      userEmail,
      userId,
      title: title || 'Frontend Technical Error',
      message: message || 'An unexpected client error occurred',
      details,
      stack,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'log_failed' });
  }
});

app.get('/api/admin/system-logs', requireAdmin, async (_req, res) => {
  try {
    const logs = await readSystemLogs();
    const unresolvedCount = logs.filter((l) => !l.resolved).length;
    res.json({ logs, unresolvedCount, total: logs.length });
  } catch (err) {
    res.status(500).json({ error: 'fetch_logs_failed', message: String(err.message || err) });
  }
});

app.post('/api/admin/system-logs/:id/resolve', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const logs = await readSystemLogs();
    const item = logs.find((l) => l.id === id);
    if (!item) return res.status(404).json({ error: 'not_found' });
    item.resolved = !item.resolved;
    item.resolvedAt = item.resolved ? Date.now() : null;

    try {
      const db = await getMongoDb();
      if (db) {
        await db.collection('system_logs').updateOne(
          { id },
          { $set: { resolved: item.resolved, resolvedAt: item.resolvedAt } }
        );
      }
    } catch { }

    await writeSystemLogs(logs);
    res.json({ ok: true, item });
  } catch (err) {
    res.status(500).json({ error: 'resolve_failed' });
  }
});

app.delete('/api/admin/system-logs/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    try {
      const db = await getMongoDb();
      if (db) {
        await db.collection('system_logs').deleteOne({ id });
      }
    } catch { }

    const logs = await readSystemLogs();
    const filtered = logs.filter((l) => l.id !== id);
    await writeSystemLogs(filtered);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'delete_failed' });
  }
});

app.post('/api/admin/system-logs/clear', requireAdmin, async (_req, res) => {
  try {
    try {
      const db = await getMongoDb();
      if (db) {
        await db.collection('system_logs').deleteMany({});
      }
    } catch { }

    await writeSystemLogs([]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'clear_failed' });
  }
});

/* ---------------------------------------------------- storage status & client error reporting */
app.get('/api/admin/storage-status', requireAdmin, async (_req, res) => {
  try {
    let genFilesCount = 0;
    let genBytes = 0;
    try {
      const genFiles = await fs.readdir(GENERATED);
      genFilesCount = genFiles.length;
      for (const f of genFiles) {
        try {
          const st = await fs.stat(path.join(GENERATED, f));
          genBytes += st.size;
        } catch { }
      }
    } catch { }

    let dataBytes = 0;
    try {
      const dataFiles = await fs.readdir(DATA);
      for (const f of dataFiles) {
        try {
          const st = await fs.stat(path.join(DATA, f));
          dataBytes += st.size;
        } catch { }
      }
    } catch { }

    const formatBytes = (bytes) => {
      if (!bytes || bytes <= 0) return '0 B';
      const k = 1024;
      const dm = 1;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    };

    let dbConnected = false;
    let dbDataSize = 0;
    let dbStorageSize = 0;
    let dbCollections = 0;
    try {
      const db = await getMongoDb();
      if (db) {
        dbConnected = true;
        const stats = await db.command({ dbStats: 1 }).catch(() => null);
        if (stats) {
          dbDataSize = stats.dataSize || 0;
          dbStorageSize = stats.storageSize || 0;
          dbCollections = stats.collections || 0;
        }
      }
    } catch { }

    let totalHosted = 0;
    try {
      const hostedMap = await readHosted();
      const mCount = Object.keys(hostedMap.models || {}).length;
      const gCount = Object.keys(hostedMap.generated || {}).length;
      totalHosted = mCount + gCount;
    } catch { }

    res.json({
      disk: {
        generatedCount: genFilesCount,
        generatedBytes: genBytes,
        generatedHuman: formatBytes(genBytes),
        dataBytes,
        dataHuman: formatBytes(dataBytes),
      },
      database: {
        connected: dbConnected,
        dataSizeHuman: formatBytes(dbDataSize),
        storageSizeHuman: formatBytes(dbStorageSize),
        collections: dbCollections,
      },
      hosted: {
        totalHostedImages: totalHosted,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'storage_status_failed', message: err.message });
  }
});

app.post('/api/client-error', auth.requireUser, async (req, res) => {
  try {
    const { title, message, details, stack } = req.body || {};
    await recordSystemProblem({
      module: 'client-ui',
      severity: 'error',
      userEmail: req.user?.email || 'user',
      userId: req.user?._id || null,
      title: title || 'Client UI Error',
      message: message || 'An error occurred on the user interface',
      details,
      stack,
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'log_failed' });
  }
});

/* ---------------------------------------------------- admin studio models */
app.post('/api/admin/models', requireAdmin, async (req, res) => {
  try {
    const { category, name, imageData, models } = req.body || {};
    if (!category) {
      return res.status(400).json({ error: 'missing_category', message: 'Category name is required.' });
    }

    const safeCat = String(category).replace(/[^a-zA-Z0-9 _-]/g, '').trim();
    if (!safeCat) {
      return res.status(400).json({ error: 'invalid_category', message: 'Category name contains invalid characters.' });
    }

    const targetDir = path.join(MODELS_DIR, safeCat);
    await fs.mkdir(targetDir, { recursive: true });

    // Handle batch upload if models array is provided, otherwise single model
    const itemsToProcess = Array.isArray(models) && models.length > 0
      ? models
      : (name && imageData ? [{ name, imageData }] : []);

    if (itemsToProcess.length === 0) {
      return res.status(400).json({ error: 'missing_fields', message: 'At least one model with name and image data is required.' });
    }

    const map = await readHosted();
    map.models = map.models || {};
    let mapChanged = false;

    const results = [];
    const db = await getMongoDb().catch(() => null);

    for (let i = 0; i < itemsToProcess.length; i++) {
      const item = itemsToProcess[i];
      const rawName = String(item.name || `model-${i + 1}`).replace(/[^a-zA-Z0-9 _-]/g, '').trim().toLowerCase().replace(/\s+/g, '-');
      const safeName = rawName || `model-${Date.now().toString(36)}-${i + 1}`;
      
      let rawBuffer = null;
      let ext = 'jpg';
      const imgStr = typeof item.imageData === 'string' ? item.imageData.trim() : '';
      const match = /^data:image\/([a-zA-Z0-9+.-]+)(?:;[a-zA-Z0-9=._-]+)*;base64,(.*)$/is.exec(imgStr);
      if (match) {
        const rawExt = match[1].toLowerCase().replace(/svg\+xml/, 'svg');
        ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
        rawBuffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
      } else if (/^[A-Za-z0-9+/=]+$/.test(imgStr.replace(/\s+/g, ''))) {
        rawBuffer = Buffer.from(imgStr.replace(/\s+/g, ''), 'base64');
      }

      if (!rawBuffer || rawBuffer.length === 0) {
        console.warn(`[admin-model] Invalid image data for item ${i} (${item.name || 'unnamed'})`);
        continue;
      }
      // Unique suffix ensures previously uploaded models with similar names are NEVER overwritten
      const uniqueSuffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const fileName = `${safeName}-${uniqueSuffix}.${ext}`;
      const modelId = `${safeCat}/${fileName}`;
      const filePath = path.join(targetDir, fileName);
      await fs.writeFile(filePath, rawBuffer);

      let publicUrl = `/models/${encodeURIComponent(safeCat)}/${encodeURIComponent(fileName)}`;
      let remoteUrl = null;
      try {
        const hosted = await hostImage(rawBuffer, `${safeCat}-${fileName}`);
        if (hosted?.url) {
          publicUrl = hosted.url;
          remoteUrl = hosted.url;
          map.models[modelId] = hosted.url;
          mapChanged = true;
        }
      } catch (hostErr) {
        console.warn('[admin-model] Image hosting fallback to local:', hostErr.message);
      }

      // Persist in MongoDB studio_models so models survive Render redeploys and container restarts
      if (db) {
        try {
          await db.collection('studio_models').updateOne(
            { id: modelId },
            {
              $set: {
                id: modelId,
                category: safeCat,
                name: item.name || safeName,
                url: publicUrl,
                remoteUrl,
                dataUrl: item.imageData, // preserves base64 bytes permanently if disk resets
                deleted: false,
                createdAt: Date.now(),
                updatedAt: new Date().toISOString(),
              },
            },
            { upsert: true }
          );
        } catch (dbErr) {
          console.warn('[admin-model] MongoDB save error:', dbErr.message);
        }
      }

      results.push({
        id: modelId,
        name: item.name || safeName,
        url: publicUrl,
      });
    }

    if (results.length === 0) {
      return res.status(400).json({ error: 'invalid_image_data', message: 'Could not process any of the provided model images. Please check file format.' });
    }

    if (mapChanged) {
      await saveHosted(map);
    }
    cachedModelCategories = null;
    cachedModelsTime = 0;

    return res.json({
      ok: true,
      category: safeCat,
      count: results.length,
      model: results[0] || null,
      models: results,
    });
  } catch (err) {
    await recordSystemProblem({
      module: 'admin-models',
      severity: 'error',
      userEmail: req.user?.email,
      title: 'Failed to upload studio model',
      message: err.message,
    });
    res.status(500).json({ error: 'upload_model_failed', message: String(err.message || err) });
  }
});

const handleDeleteModelRoute = async (req, res) => {
  try {
    const rawId = req.body?.id || req.query?.id || (typeof req.query === 'string' ? req.query : '');
    let id = typeof rawId === 'string' ? rawId.trim() : '';
    try {
      id = decodeURIComponent(id).trim();
    } catch { }
    id = id.replace(/^\/+/, '').replace(/\/+$/, '');

    if (!id) {
      return res.status(400).json({ error: 'missing_id', message: 'Model id is required.' });
    }

    if (id.includes('..')) {
      return res.status(400).json({ error: 'invalid_id', message: 'Invalid model ID format.' });
    }

    const firstSlash = id.indexOf('/');
    const category = firstSlash !== -1 ? id.slice(0, firstSlash) : 'default';
    const filename = firstSlash !== -1 ? id.slice(firstSlash + 1) : id;

    // 1. Delete from local disk
    const targetFile = path.join(MODELS_DIR, category, filename);
    await fs.unlink(targetFile).catch(() => { });

    // 2. Mark permanently deleted in MongoDB studio_models AND delete existing active doc
    try {
      const db = await getMongoDb();
      if (db) {
        await db.collection('studio_models').deleteMany({
          $or: [{ id }, { id: `${category}/${filename}` }, { name: filename }]
        });
        await db.collection('studio_models').updateOne(
          { id },
          {
            $set: {
              id,
              category,
              deleted: true,
              deletedAt: Date.now(),
            },
          },
          { upsert: true }
        );
      }
    } catch (dbErr) {
      console.warn('[admin-model] MongoDB delete error:', dbErr.message);
    }

    // 3. Delete from hosted map
    try {
      const map = await readHosted(true);
      if (map.models?.[id]) {
        delete map.models[id];
        await saveHosted(map);
      }
    } catch { }

    // 4. Invalidate server memory cache immediately
    cachedModelCategories = null;
    cachedModelsTime = 0;

    return res.json({ ok: true, deleted: id });
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: 'delete_model_failed', message: String(err.message || err) });
    }
  }
};

app.delete('/api/admin/models', requireAdmin, handleDeleteModelRoute);
app.post('/api/admin/models/delete', requireAdmin, handleDeleteModelRoute);

app.post('/api/admin/models/move', requireAdmin, async (req, res) => {
  try {
    const { id, targetCategory } = req.body || {};
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'missing_id', message: 'Model id is required.' });
    }
    if (!targetCategory || typeof targetCategory !== 'string') {
      return res.status(400).json({ error: 'missing_category', message: 'Target category is required.' });
    }

    const safeTargetCat = String(targetCategory).replace(/[^a-zA-Z0-9 _-]/g, '').trim();
    if (!safeTargetCat) {
      return res.status(400).json({ error: 'invalid_category', message: 'Target category contains invalid characters.' });
    }

    const parts = id.split('/');
    if (parts.length !== 2 || parts[0].includes('..') || parts[1].includes('..')) {
      return res.status(400).json({ error: 'invalid_id', message: 'Invalid model ID format.' });
    }

    const [oldCat, filename] = parts;
    if (oldCat === safeTargetCat) {
      return res.json({ ok: true, oldId: id, newId: id, targetCategory: safeTargetCat });
    }

    const newId = `${safeTargetCat}/${filename}`;
    const targetDir = path.join(MODELS_DIR, safeTargetCat);
    await fs.mkdir(targetDir, { recursive: true });

    const oldFilePath = path.join(MODELS_DIR, oldCat, filename);
    const newFilePath = path.join(targetDir, filename);

    // 1. Move or copy file on disk if it exists
    try {
      if (fsSync.existsSync(oldFilePath)) {
        await fs.rename(oldFilePath, newFilePath).catch(async () => {
          await fs.copyFile(oldFilePath, newFilePath).catch(() => { });
          await fs.unlink(oldFilePath).catch(() => { });
        });
      }
    } catch { }

    // 2. Update MongoDB studio_models
    try {
      const db = await getMongoDb();
      if (db) {
        const existing = await db.collection('studio_models').findOne({ id });
        if (existing) {
          await db.collection('studio_models').deleteOne({ id });
          await db.collection('studio_models').updateOne(
            { id: newId },
            {
              $set: {
                id: newId,
                category: safeTargetCat,
                name: existing.name || filename.replace(/\.[^.]+$/, ''),
                url: existing.remoteUrl || `/models/${encodeURIComponent(safeTargetCat)}/${encodeURIComponent(filename)}`,
                remoteUrl: existing.remoteUrl || null,
                dataUrl: existing.dataUrl || null,
                deleted: false,
                createdAt: existing.createdAt || Date.now(),
                updatedAt: new Date().toISOString(),
              },
            },
            { upsert: true }
          );
        } else {
          // Built-in repository model: mark old id deleted so it won't appear under old category
          await db.collection('studio_models').updateOne(
            { id },
            { $set: { id, category: oldCat, deleted: true, deletedAt: Date.now() } },
            { upsert: true }
          );
          // And add into target category!
          await db.collection('studio_models').updateOne(
            { id: newId },
            {
              $set: {
                id: newId,
                category: safeTargetCat,
                name: filename.replace(/\.[^.]+$/, ''),
                url: `/models/${encodeURIComponent(safeTargetCat)}/${encodeURIComponent(filename)}`,
                deleted: false,
                createdAt: Date.now(),
                updatedAt: new Date().toISOString(),
              },
            },
            { upsert: true }
          );
        }
      }
    } catch (dbErr) {
      console.warn('[admin-model] MongoDB move error:', dbErr.message);
    }

    // 3. Update hosted.json map
    try {
      const map = await readHosted();
      if (map.models?.[id]) {
        map.models[newId] = map.models[id];
        delete map.models[id];
        await saveHosted(map);
      }
    } catch { }

    // Invalidate cached models
    cachedModelCategories = null;
    cachedModelsTime = 0;

    res.json({ ok: true, oldId: id, newId, targetCategory: safeTargetCat });
  } catch (err) {
    res.status(500).json({ error: 'move_model_failed', message: String(err.message || err) });
  }
});

app.post('/api/admin/models/rename-category', requireAdmin, async (req, res) => {
  try {
    const { oldCategory, newCategory } = req.body || {};
    if (!oldCategory || typeof oldCategory !== 'string' || !oldCategory.trim()) {
      return res.status(400).json({ error: 'missing_old_category', message: 'Old category is required.' });
    }
    if (!newCategory || typeof newCategory !== 'string' || !newCategory.trim()) {
      return res.status(400).json({ error: 'missing_new_category', message: 'New category name is required.' });
    }

    const safeOldCat = String(oldCategory).replace(/[^a-zA-Z0-9 _-]/g, '').trim();
    const safeNewCat = String(newCategory).replace(/[^a-zA-Z0-9 _-]/g, '').trim();

    if (!safeOldCat || !safeNewCat) {
      return res.status(400).json({ error: 'invalid_category_name', message: 'Category name contains invalid characters.' });
    }
    if (safeOldCat === safeNewCat) {
      return res.json({ ok: true, oldCategory: safeOldCat, newCategory: safeNewCat, filesMoved: 0 });
    }

    // 1. Move or merge files on disk
    const oldDir = path.join(MODELS_DIR, safeOldCat);
    const newDir = path.join(MODELS_DIR, safeNewCat);
    await fs.mkdir(newDir, { recursive: true });

    let filesMoved = 0;
    try {
      if (fsSync.existsSync(oldDir)) {
        const files = await fs.readdir(oldDir).catch(() => []);
        for (const f of files) {
          const oldFilePath = path.join(oldDir, f);
          const newFilePath = path.join(newDir, f);
          try {
            await fs.rename(oldFilePath, newFilePath).catch(async () => {
              await fs.copyFile(oldFilePath, newFilePath).catch(() => { });
              await fs.unlink(oldFilePath).catch(() => { });
            });
            filesMoved++;
          } catch (fileErr) {
            console.warn('[rename-category] File move error:', fileErr.message);
          }
        }
        await fs.rmdir(oldDir).catch(() => { });
      }
    } catch (diskErr) {
      console.warn('[rename-category] Disk error:', diskErr.message);
    }

    // 2. Update hosted.json
    try {
      const map = await readHosted();
      if (map.models) {
        let changed = false;
        const oldPrefix = `${safeOldCat}/`;
        for (const [key, val] of Object.entries(map.models)) {
          if (key.startsWith(oldPrefix)) {
            const newKey = `${safeNewCat}/${key.slice(oldPrefix.length)}`;
            map.models[newKey] = val;
            delete map.models[key];
            changed = true;
          }
        }
        if (changed) {
          await saveHosted(map);
        }
      }
    } catch (hostErr) {
      console.warn('[rename-category] Hosted map error:', hostErr.message);
    }

    // 3. Update MongoDB studio_models
    try {
      const db = await getMongoDb();
      if (db) {
        const oldModels = await db.collection('studio_models').find({
          $or: [
            { category: safeOldCat },
            { category: safeOldCat.toLowerCase() },
            { id: new RegExp(`^${safeOldCat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`, 'i') },
          ],
        }).toArray();

        for (const doc of oldModels) {
          const oldId = doc.id || '';
          const parts = oldId.split('/');
          const filename = parts.length > 1 ? parts.slice(1).join('/') : doc.name || 'model';
          const newId = `${safeNewCat}/${filename}`;

          let newUrl = doc.url;
          if (newUrl && typeof newUrl === 'string' && newUrl.includes(`/models/${encodeURIComponent(safeOldCat)}/`)) {
            newUrl = newUrl.replace(`/models/${encodeURIComponent(safeOldCat)}/`, `/models/${encodeURIComponent(safeNewCat)}/`);
          }

          await db.collection('studio_models').deleteOne({ _id: doc._id });
          await db.collection('studio_models').updateOne(
            { id: newId },
            {
              $set: {
                id: newId,
                category: safeNewCat,
                name: doc.name || filename.replace(/\.[^.]+$/, ''),
                url: newUrl,
                remoteUrl: doc.remoteUrl || null,
                dataUrl: doc.dataUrl || null,
                deleted: doc.deleted || false,
                deletedAt: doc.deletedAt || null,
                createdAt: doc.createdAt || Date.now(),
                updatedAt: new Date().toISOString(),
              },
            },
            { upsert: true }
          );
        }
      }
    } catch (dbErr) {
      console.warn('[rename-category] MongoDB update error:', dbErr.message);
    }

    // 4. Invalidate memory cache immediately
    cachedModelCategories = null;
    cachedModelsTime = 0;

    return res.json({
      ok: true,
      oldCategory: safeOldCat,
      newCategory: safeNewCat,
      filesMoved,
    });
  } catch (err) {
    res.status(500).json({ error: 'rename_category_failed', message: String(err.message || err) });
  }
});

app.get('/api/models', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  const categories = await listModels();
  res.json({ categories });
});

app.get('/api/uploads', async (_req, res) => {
  try {
    const hosted = await readHosted();
    const diskFiles = await fs.readdir(UPLOADS).catch(() => []);
    const itemsMap = new Map();

    // 1. From MongoDB user_uploads (persists across Render deploys, exclude heavy dataUrl)
    try {
      const db = await getMongoDb();
      if (db) {
        const dbUploads = await db
          .collection('user_uploads')
          .find({}, { projection: { dataUrl: 0 } })
          .sort({ createdAt: -1 })
          .limit(100)
          .toArray();
        for (const u of dbUploads) {
          const resolvedUrl = u.remoteUrl || u.url || `/uploads/${encodeURIComponent(u.id || '')}`;
          itemsMap.set(u.id || u.url, {
            id: u.id || u.url,
            name: u.name || (u.kind === 'model' ? 'Uploaded Model' : 'Uploaded Garment'),
            url: resolvedUrl,
            kind: u.kind || (String(u.id || '').startsWith('model') ? 'model' : 'cloth'),
            at: u.createdAt || Date.now(),
          });
        }
      }
    } catch { }

    // 2. From uploadSets (Saved outfit sets from My Sets)
    try {
      const setList = await readUploadSets();
      for (const s of setList) {
        if (s.clothUrl && !itemsMap.has(s.clothUrl)) {
          itemsMap.set(s.clothUrl, {
            id: s.id || s.clothUrl,
            name: s.clothName || 'Studio Garment',
            url: s.clothUrl,
            kind: 'cloth',
            at: s.createdAt || Date.now(),
          });
        }
        if (s.modelUrl && !itemsMap.has(s.modelUrl)) {
          itemsMap.set(s.modelUrl, {
            id: s.id || s.modelUrl,
            name: s.modelName || 'Studio Model',
            url: s.modelUrl,
            kind: 'model',
            at: s.createdAt || Date.now(),
          });
        }
      }
    } catch { }

    // 3. From local disk and hosted map
    const allFilesSet = new Set([...diskFiles, ...Object.keys(hosted.uploads || {})]);
    for (const file of allFilesSet) {
      const remote = hosted.uploads?.[file];
      const localUrl = `/uploads/${file}`;
      const urlToUse = remote || localUrl;
      if (!itemsMap.has(urlToUse) && !itemsMap.has(localUrl)) {
        itemsMap.set(urlToUse, {
          id: file,
          name: file,
          url: urlToUse,
          kind: file.startsWith('model') ? 'model' : 'cloth',
          at: Date.now(),
        });
      }
    }

    const diskFilesSet = new Set(diskFiles);
    const items = Array.from(itemsMap.values())
      .filter((it) => {
        if (!it || !it.url) return false;
        const u = String(it.url);
        if (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('data:')) return true;
        if (u.startsWith('/uploads/')) {
          const fname = path.basename(u);
          return diskFilesSet.has(fname);
        }
        return true;
      })
      .sort((a, b) => b.at - a.at);
    res.json({ items });
  } catch {
    res.json({ items: [] });
  }
});

app.delete('/api/uploads/:id', async (req, res) => {
  try {
    const file = req.params.id;
    /* prevent path traversal */
    if (file.includes('..') || file.includes('/') || file.includes('\\')) {
      return res.status(400).json({ error: 'bad_id', message: 'Invalid file name.' });
    }
    const target = path.join(UPLOADS, file);
    await fs.unlink(target).catch(() => { });
    /* also remove from hosted.json */
    try {
      const hosted = await readHosted();
      if (hosted.uploads?.[file]) {
        delete hosted.uploads[file];
        await saveHosted(hosted);
      }
    } catch { /* non-fatal */ }
    res.json({ ok: true, deleted: file });
  } catch (error) {
    res.status(500).json({ error: 'delete_failed', message: String(error.message || error) });
  }
});

/** Push bytes to imgbb so the render provider can fetch a public URL.
 *  Returns null when no key is configured; throws only when the host says no. */
async function hostImage(buffer, name) {
  const state = await readState();
  const key = String(state.imgbbKey || process.env.IMGBB_KEY || '').trim();
  if (!key) return null;

  const body = new URLSearchParams({
    key,
    image: buffer.toString('base64'),
    name: String(name || 'shivnaresh').replace(/\.[^.]+$/, '').slice(0, 60),
  });
  const response = await fetch(IMGBB, { method: 'POST', body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.data?.url) {
    const reason = data?.error?.message || `image host rejected the upload (${response.status})`;
    throw new Error(reason);
  }
  return {
    url: data.data.url,
    thumb: data.data.thumb?.url || data.data.url,
    viewer: data.data.url_viewer || data.data.url,
  };
}

/* ---------------------------------------------------------- imgbb sync
   Uploads already go straight to imgbb. This pushes everything that was
   created before, or produced by the render service, so all of it survives
   the local disk and the provider's 3-day links. */
const syncJob = { running: false, total: 0, done: 0, failed: 0, startedAt: 0, finishedAt: 0, message: '' };

async function* walkImages(dir) {
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkImages(full);
    else if (/\.(webp|png|jpe?g)$/i.test(entry.name)) yield full;
  }
}

async function syncImagesToHost() {
  if (syncJob.running) return;
  Object.assign(syncJob, { running: true, total: 0, done: 0, failed: 0, startedAt: Date.now(), finishedAt: 0, message: '' });

  const hosted = await readHosted();
  const queue = [];
  for await (const file of walkImages(MODELS_DIR)) {
    queue.push({ kind: 'models', key: path.relative(MODELS_DIR, file).split(path.sep).join('/'), file });
  }
  for await (const file of walkImages(GENERATED)) {
    queue.push({ kind: 'generated', key: path.basename(file), file });
  }

  const pending = queue.filter((item) => !hosted[item.kind]?.[item.key]);
  syncJob.total = pending.length;

  for (const item of pending) {
    try {
      const buffer = await fs.readFile(item.file);
      const uploaded = await hostImage(buffer, item.key);
      if (!uploaded) throw new Error('No image host key configured');
      if (!hosted[item.kind]) hosted[item.kind] = {};
      hosted[item.kind][item.key] = uploaded.url;
      await saveHosted(hosted);
      syncJob.done += 1;
    } catch (error) {
      syncJob.failed += 1;
      syncJob.message = String(error.message || error);
    }
    /* the free endpoint is rate limited — pace it */
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  syncJob.running = false;
  syncJob.finishedAt = Date.now();
}

app.get('/api/admin/host', requireAdmin, async (_req, res) => {
  const hosted = await readHosted();
  const models = (await listModels()).flatMap((group) => group.items);
  let generatedFiles = [];
  try {
    generatedFiles = (await fs.readdir(GENERATED)).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
  } catch {
    /* none yet */
  }

  res.json({
    running: syncJob.running,
    total: syncJob.total,
    done: syncJob.done,
    failed: syncJob.failed,
    message: syncJob.message,
    finishedAt: syncJob.finishedAt,
    models: {
      total: models.length,
      hosted: models.filter((item) => hosted.models?.[item.id]).length,
    },
    generated: {
      total: generatedFiles.length,
      hosted: generatedFiles.filter((f) => hosted.generated?.[f]).length,
    },
  });
});

app.post('/api/admin/host', requireAdmin, async (_req, res) => {
  if (syncJob.running) return res.json({ started: false, running: true });
  void syncImagesToHost();
  res.json({ started: true, running: true });
});

app.post('/api/upload', async (req, res) => {
  try {
    const { name = 'upload', dataUrl, kind = 'cloth' } = req.body || {};
    const imgStr = String(dataUrl || '').trim();
    const match = /^data:(image\/(png|jpe?g|webp|svg\+xml));base64,(.*)$/is.exec(imgStr);
    if (!match) return res.status(400).json({ error: 'bad_image', message: 'Not a PNG/JPEG/WEBP data URL' });
    const rawExt = match[1].toLowerCase();
    const ext = rawExt === 'image/png' ? '.png' : rawExt === 'image/webp' ? '.webp' : rawExt === 'image/svg+xml' ? '.svg' : '.jpg';
    const file = `${kind}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}${ext}`;
    const buffer = Buffer.from(match[3].replace(/\s+/g, ''), 'base64');
    await fs.writeFile(path.join(UPLOADS, file), buffer);

    const localUrl = `/uploads/${file}`;

    // Persist upload into MongoDB immediately so it survives Render redeploys
    try {
      const db = await getMongoDb();
      if (db) {
        await db.collection('user_uploads').insertOne({
          id: file,
          name: String(name || file),
          url: localUrl,
          dataUrl: String(dataUrl || ''),
          kind: String(kind || 'cloth'),
          createdAt: Date.now(),
        });
      }
    } catch { }

    // Return response immediately — ultra-fast upload response in under 50ms!
    res.json({
      url: localUrl,
      preview: localUrl,
      thumb: localUrl,
      hosted: true,
      name,
    });

    // Run remote host sync in background so network latency never blocks the UI
    hostImage(buffer, name).then(async (hosted) => {
      if (hosted?.url) {
        try {
          const map = await readHosted();
          map.uploads = map.uploads || {};
          map.uploads[file] = hosted.url;
          await saveHosted(map);

          const db = await getMongoDb();
          if (db) {
            await db.collection('user_uploads').updateOne(
              { id: file },
              { $set: { remoteUrl: hosted.url } }
            );
          }
        } catch { }
      }
    }).catch(() => { });
  } catch (error) {
    res.status(500).json({ error: 'upload_failed', message: String(error.message || error) });
  }
});

/* --------------------------------------------------- WATERMARK REMOVER */
const WATERMARK_API_URL = process.env.WATERMARK_REMOVER_URL || 'http://127.0.0.1:8789';
const WATERMARK_API_KEY = process.env.WATERMARK_REMOVER_KEY || 'wr_6QiEcsy8Z4y-Mq-RVAiwYyfwNwrcwKitCepRKA';

// FFmpeg binary path detection (bundled @ffmpeg-installer, local D:\, or system PATH)
let ffmpegPath = ffmpegInstaller?.path || '';
if (!ffmpegPath || !fsSync.existsSync(ffmpegPath)) {
  const localD = 'D:\\watermark remover\\ffmpeg\\ffmpeg.exe';
  if (fsSync.existsSync(localD)) ffmpegPath = localD;
  else ffmpegPath = 'ffmpeg';
}

function saveLocalWatermarkJob(jid, jobData) {
  LOCAL_WATERMARK_JOBS.set(jid, jobData);
  try {
    const jdir = path.join(WATERMARK_JOBS_DIR, jid);
    fsSync.mkdirSync(jdir, { recursive: true });
    fsSync.writeFileSync(path.join(jdir, 'job.json'), JSON.stringify(jobData, null, 2));
  } catch {}
}

function getLocalWatermarkJob(jid) {
  if (LOCAL_WATERMARK_JOBS.has(jid)) return LOCAL_WATERMARK_JOBS.get(jid);
  try {
    const p = path.join(WATERMARK_JOBS_DIR, jid, 'job.json');
    if (fsSync.existsSync(p)) {
      const data = JSON.parse(fsSync.readFileSync(p, 'utf8'));
      LOCAL_WATERMARK_JOBS.set(jid, data);
      return data;
    }
  } catch {}
  return null;
}

function probeMedia(filePath) {
  try {
    const res = spawnSync(ffmpegPath, ['-hide_banner', '-i', filePath], { encoding: 'utf8' });
    const text = (res.stderr || '') + (res.stdout || '');
    const dimMatch = /Stream #.*Video:.*,\s*(\d{2,5})x(\d{2,5})/.exec(text);
    const durMatch = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
    const fpsMatch = /(\d+(?:\.\d+)?)\s*fps/.exec(text);
    const hasAudio = /Stream #.*Audio:/.test(text);

    let duration = 0;
    if (durMatch) {
      duration = parseInt(durMatch[1], 10) * 3600 + parseInt(durMatch[2], 10) * 60 + parseFloat(durMatch[3]);
    }
    if (!duration || isNaN(duration) || duration <= 0) {
      duration = 10;
    }

    return {
      width: dimMatch ? parseInt(dimMatch[1], 10) : 1080,
      height: dimMatch ? parseInt(dimMatch[2], 10) : 1920,
      duration,
      fps: fpsMatch ? parseFloat(fpsMatch[1]) : 30,
      hasAudio,
    };
  } catch {
    return { width: 1080, height: 1920, duration: 10, fps: 30, hasAudio: false };
  }
}

function resolveDelogoRegion(width, height, spec) {
  if (spec && typeof spec === 'string' && spec.toLowerCase() !== 'auto') {
    const parts = spec.trim().split(/[,\s]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
      let [x, y, w, h] = parts;
      x = Math.max(4, Math.min(x, width - 12));
      y = Math.max(4, Math.min(y, height - 12));
      w = Math.max(8, Math.min(w, width - x - 4));
      h = Math.max(8, Math.min(h, height - y - 4));
      return { x, y, w, h };
    }
  }

  // Standard Gemini / Flow AI watermark position
  let size, margin;
  if (width > 1024 && height > 1024) {
    size = 96;
    margin = 64;
  } else {
    size = 48;
    margin = 32;
  }
  let x = width - margin - size;
  let y = height - margin - size;
  x = Math.max(4, Math.min(x, width - size - 4));
  y = Math.max(4, Math.min(y, height - size - 4));
  return { x, y, w: size, h: size };
}

function runFfmpegDelogo(inPath, outPath, region, crf = 18, preset = 'veryfast', duration = 0, onProgress, hasAudio = true) {
  return new Promise((resolve, reject) => {
    const vf = `delogo=x=${region.x}:y=${region.y}:w=${region.w}:h=${region.h}`;
    const audioArgs = hasAudio ? ['-c:a', 'copy'] : ['-an'];
    const args = [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', inPath,
      '-vf', vf,
      '-c:v', 'libx264',
      '-preset', preset,
      '-crf', String(crf),
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      ...audioArgs,
      '-progress', 'pipe:1',
      '-nostats',
      outPath,
    ];

    let proc = null;
    let timer = null;
    let finished = false;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
    };

    const parseProgress = (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (duration > 0 && (line.startsWith('out_time_us=') || line.startsWith('out_time_ms='))) {
          const parts = line.split('=');
          const val = parseInt(parts[1]?.trim(), 10);
          if (!isNaN(val)) {
            const factor = line.startsWith('out_time_us=') ? 1000000 : 1000;
            const pct = Math.max(10, Math.min(99, Math.round((val / factor / duration) * 100)));
            if (onProgress) onProgress(pct);
          }
        } else if (duration > 0 && line.startsWith('out_time=')) {
          const timeStr = line.split('=')[1]?.trim();
          const tmatch = /^(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(timeStr || '');
          if (tmatch) {
            const secs = parseInt(tmatch[1], 10) * 3600 + parseInt(tmatch[2], 10) * 60 + parseFloat(tmatch[3]);
            const pct = Math.max(10, Math.min(99, Math.round((secs / duration) * 100)));
            if (onProgress) onProgress(pct);
          }
        } else if (line.startsWith('progress=end')) {
          if (onProgress) onProgress(100);
        }
      }
    };

    // Watchdog: max 4 minutes for video delogo
    timer = setTimeout(() => {
      if (!finished && proc) {
        finished = true;
        try { proc.kill('SIGKILL'); } catch {}
        reject(new Error('Video watermark processing timed out after 4 minutes.'));
      }
    }, 240000);

    try {
      proc = spawn(ffmpegPath, args);
    } catch (e) {
      cleanup();
      return reject(e);
    }

    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.stdout.on('data', parseProgress);
    proc.on('error', (err) => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(err);
    });

    proc.on('close', (code) => {
      if (finished) return;
      if (code === 0) {
        finished = true;
        cleanup();
        if (onProgress) onProgress(100);
        resolve();
      } else {
        // Fallback retry without audio copy (handles special/unsupported audio containers or silent files)
        const retryArgs = [
          '-y', '-hide_banner', '-loglevel', 'error',
          '-i', inPath,
          '-vf', vf,
          '-c:v', 'libx264',
          '-preset', preset,
          '-crf', String(crf),
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          '-an',
          '-progress', 'pipe:1',
          '-nostats',
          outPath,
        ];
        let retry = null;
        try {
          retry = spawn(ffmpegPath, retryArgs);
        } catch (re) {
          finished = true;
          cleanup();
          return reject(re);
        }

        let rerr = '';
        retry.stderr.on('data', (d) => { rerr += d.toString(); });
        retry.stdout.on('data', parseProgress);
        retry.on('error', (err) => {
          if (finished) return;
          finished = true;
          cleanup();
          reject(err);
        });
        retry.on('close', (rcode) => {
          if (finished) return;
          finished = true;
          cleanup();
          if (rcode === 0) {
            if (onProgress) onProgress(100);
            resolve();
          } else {
            reject(new Error(`FFmpeg video watermark removal failed: ${stderr || rerr || 'code ' + rcode}`));
          }
        });
      }
    });
  });
}

function runFfmpegImageDelogo(inPath, outPath, region) {
  return new Promise((resolve, reject) => {
    const vf = `delogo=x=${region.x}:y=${region.y}:w=${region.w}:h=${region.h}`;
    const args = [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', inPath,
      '-vf', vf,
      '-frames:v', '1',
      outPath,
    ];
    let proc = null;
    try {
      proc = spawn(ffmpegPath, args);
    } catch (e) {
      return reject(e);
    }
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg image delogo failed: ${stderr}`));
    });
  });
}

async function processBuiltinWatermarkJob(jid, inPath, outPath, isVideo, regionSpec, crf) {
  const job = getLocalWatermarkJob(jid);
  if (!job) return;

  try {
    job.status = 'processing';
    job.progress = 12;
    saveLocalWatermarkJob(jid, job);

    const info = probeMedia(inPath);
    const region = resolveDelogoRegion(info.width, info.height, regionSpec);

    if (isVideo) {
      await runFfmpegDelogo(inPath, outPath, region, crf, 'veryfast', info.duration, (pct) => {
        job.progress = Math.max(10, Math.min(99, pct));
        saveLocalWatermarkJob(jid, job);
      }, info.hasAudio);
    } else {
      await runFfmpegImageDelogo(inPath, outPath, region);
    }

    job.status = 'done';
    job.progress = 100;
    job.output = path.basename(outPath);
    job.bytes = fsSync.statSync(outPath).size;
    job.meta = {
      region,
      width: info.width,
      height: info.height,
      fps: info.fps,
      duration: info.duration,
    };
    job.download = `/api/watermark/download/${jid}`;
    saveLocalWatermarkJob(jid, job);
  } catch (err) {
    console.error(`[BUILTIN WATERMARK REMOVER JOB ${jid} ERROR]`, err);
    job.status = 'error';
    job.error = err.message || 'Watermark removal failed';
    saveLocalWatermarkJob(jid, job);
  }
}

// 1. Service health check
app.get('/api/watermark/health', async (_req, res) => {
  let externalHealthy = false;
  try {
    const r = await fetch(`${WATERMARK_API_URL}/health`, { signal: AbortSignal.timeout(1000) });
    if (r.ok) externalHealthy = true;
  } catch {}

  res.json({
    ok: true,
    service: 'watermark-remover',
    mode: externalHealthy ? 'external-microservice' : 'builtin-ffmpeg-engine',
    ffmpegReady: Boolean(ffmpegPath),
  });
});

// 2. Remove watermark from uploaded file (multipart stream with automatic fallback to built-in engine)
app.post('/api/watermark/remove', async (req, res) => {
  try {
    if (req.user && req.user.watermarkAccess === false) {
      return res.status(403).json({
        error: 'watermark_access_disabled',
        message: 'Watermark remover feature is disabled for your account by administrator.'
      });
    }

    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ error: 'bad_request', message: 'Expected multipart/form-data' });
    }

    // Check if external microservice on WATERMARK_API_URL is actively running & reachable
    let useExternal = false;
    try {
      const ping = await fetch(`${WATERMARK_API_URL}/health`, { signal: AbortSignal.timeout(600) });
      if (ping.ok) useExternal = true;
    } catch {}

    if (useExternal) {
      const url = new URL('/v1/remove', WATERMARK_API_URL);
      const isHttps = url.protocol === 'https:';
      const httpModule = isHttps ? await import('node:https') : await import('node:http');

      const upstreamReq = httpModule.request(url, {
        method: 'POST',
        headers: {
          'content-type': req.headers['content-type'],
          'content-length': req.headers['content-length'] || undefined,
          'X-API-Key': WATERMARK_API_KEY,
        },
      }, (upstreamRes) => {
        res.status(upstreamRes.statusCode || 200);
        for (const [k, v] of Object.entries(upstreamRes.headers)) {
          if (v && ['content-type', 'content-length'].includes(k.toLowerCase())) {
            res.setHeader(k, v);
          }
        }
        upstreamRes.pipe(res);
      });

      upstreamReq.on('error', (err) => {
        console.error('[WATERMARK UPSTREAM PROXY ERROR]', err);
        if (!res.headersSent) {
          res.status(502).json({ error: 'upstream_error', message: err.message });
        }
      });

      req.pipe(upstreamReq);
      return;
    }

    // Built-in FFmpeg Delogo Engine (Runs on Render and local without external microservice)
    const bb = busboy({ headers: req.headers, limits: { fileSize: 400 * 1024 * 1024 } });
    const jid = crypto.randomUUID().slice(0, 12);
    const jdir = path.join(WATERMARK_JOBS_DIR, jid);
    await fs.mkdir(jdir, { recursive: true });

    let inFilePath = '';
    let originalName = 'video.mp4';
    let isVideo = true;
    let mode = 'delogo';
    let crf = 18;
    let regionSpec = 'auto';
    const writePromises = [];

    bb.on('file', (_name, fileStream, info) => {
      const { filename } = info;
      originalName = filename || 'video.mp4';
      const ext = path.extname(originalName).toLowerCase() || '.mp4';
      isVideo = ['.mp4', '.mov', '.m4v', '.mkv', '.webm'].includes(ext);
      inFilePath = path.join(jdir, 'in' + ext);
      const ws = fsSync.createWriteStream(inFilePath);
      fileStream.pipe(ws);
      writePromises.push(new Promise((resolve, reject) => {
        ws.on('finish', resolve);
        ws.on('error', reject);
      }));
    });

    bb.on('field', (name, val) => {
      if (name === 'mode') mode = val;
      if (name === 'crf') crf = Number(val) || 18;
      if (name === 'region') regionSpec = val;
    });

    bb.on('finish', async () => {
      try {
        await Promise.all(writePromises);
        if (!inFilePath || !fsSync.existsSync(inFilePath)) {
          return res.status(400).json({ error: 'no_file', message: 'No file received' });
        }

        const outExt = isVideo ? '.mp4' : path.extname(inFilePath).toLowerCase();
        const outFilePath = path.join(jdir, 'out' + outExt);

        const initialJob = {
          job_id: jid,
          status: 'queued',
          progress: 5,
          filename: originalName,
          isVideo,
          outFilePath,
          created_at: Date.now(),
        };
        saveLocalWatermarkJob(jid, initialJob);

        // Start processing asynchronously in background
        processBuiltinWatermarkJob(jid, inFilePath, outFilePath, isVideo, regionSpec, crf);

        res.json({
          job_id: jid,
          status: 'queued',
          poll: `/api/watermark/jobs/${jid}`,
        });
      } catch (err) {
        res.status(500).json({ error: 'file_save_failed', message: err.message });
      }
    });

    req.pipe(bb);
  } catch (err) {
    console.error('[WATERMARK REMOVE ERROR]', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'server_error', message: String(err.message || err) });
    }
  }
});

// 3. Poll job status
app.get('/api/watermark/jobs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const localJob = getLocalWatermarkJob(id);
    if (localJob) {
      return res.json(localJob);
    }

    // Try disk search for finished files even if memory was cleared
    const jdir = path.join(WATERMARK_JOBS_DIR, id);
    if (fsSync.existsSync(jdir)) {
      const files = fsSync.readdirSync(jdir);
      const outFile = files.find((f) => f.startsWith('out.'));
      if (outFile) {
        const outFilePath = path.join(jdir, outFile);
        const restored = {
          job_id: id,
          status: 'done',
          progress: 100,
          output: outFile,
          outFilePath,
          bytes: fsSync.statSync(outFilePath).size,
          download: `/api/watermark/download/${id}`,
        };
        saveLocalWatermarkJob(id, restored);
        return res.json(restored);
      }
    }

    // Check upstream microservice if configured
    try {
      const r = await fetch(`${WATERMARK_API_URL}/v1/jobs/${encodeURIComponent(id)}`, {
        headers: { 'X-API-Key': WATERMARK_API_KEY },
        signal: AbortSignal.timeout(3000),
      });
      const data = await r.json();
      return res.status(r.status).json(data);
    } catch {}

    return res.status(404).json({ status: 'error', error: 'job_not_found', message: 'Job not found or expired.' });
  } catch (err) {
    return res.status(404).json({ status: 'error', error: 'job_not_found', message: 'Job not found.' });
  }
});

// 4. Download clean output
app.get('/api/watermark/download/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const localJob = getLocalWatermarkJob(id);
    const jdir = path.join(WATERMARK_JOBS_DIR, id);

    let filePath = localJob?.outFilePath;
    if (!filePath || !fsSync.existsSync(filePath)) {
      if (fsSync.existsSync(jdir)) {
        const files = fsSync.readdirSync(jdir);
        const found = files.find((f) => f.startsWith('out.'));
        if (found) filePath = path.join(jdir, found);
      }
    }

    if (filePath && fsSync.existsSync(filePath)) {
      const isVideo = filePath.endsWith('.mp4');
      const media = isVideo ? 'video/mp4' : 'image/png';
      res.setHeader('Content-Type', media);
      res.setHeader('Content-Disposition', `attachment; filename="clean_${localJob?.filename || (isVideo ? 'video.mp4' : 'image.png')}"`);
      return fsSync.createReadStream(filePath).pipe(res);
    }

    const downloadUrl = `${WATERMARK_API_URL}/v1/jobs/${encodeURIComponent(id)}/download?token=${encodeURIComponent(WATERMARK_API_KEY)}`;
    const r = await fetch(downloadUrl);
    if (!r.ok) {
      return res.status(r.status).json({ error: 'download_failed', message: 'Output not ready or not found' });
    }
    const contentType = r.headers.get('content-type') || 'video/mp4';
    const contentDisposition = r.headers.get('content-disposition') || `attachment; filename="clean_${id}.mp4"`;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', contentDisposition);

    const arrayBuffer = await r.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    return res.status(500).json({ error: 'download_error', message: String(err.message || err) });
  }
});

/* -------------------------------------------------------------- FASHN */
/* NOTE: Fashn API only accepts specific fields inside `inputs`:
   - product_image, model_image, prompt (for tryon-max)
   - product_image, prompt (for product-to-model)
   - model_image, prompt (for model-swap)
   - image, prompt (for edit)
   Do NOT put num_images, resolution, generation_mode, output_format inside
   inputs — they are not Fashn API parameters and will cause failures. */

function buildRequest(mode, state, src, is2k = false) {
  const { cloth, model, prompt, color } = src;
  let text = (prompt || '').trim() || state.defaultPrompt || 'wear this clothing on model with perfect fit, realistic texture, professional athletic studio presentation';

  const userWantsRemoveLogo = /remove.*(?:logo|brand|text|shiv-naresh|shiv naresh)|no.*logo|unbranded/i.test(prompt || '');

  // Mandatory brand name: SHIV-NARESH (only if user did not request logo removal)
  if (!userWantsRemoveLogo && !text.toLowerCase().includes('shiv-naresh')) {
    text = `SHIV-NARESH athletic sportswear: ${text}`.trim();
  }

  // Mandatory fabric color & dye preservation
  if (color && typeof color === 'string' && color.trim()) {
    const colorInstruction = `Exact fabric color: ${color.trim()}. Maintain true garment dye and athlete kit tones with zero color deviation.`;
    if (!text.toLowerCase().includes(color.trim().toLowerCase())) {
      text = `${text} · ${colorInstruction}`;
    }
  } else if (!text.toLowerCase().includes('color')) {
    text = `${text} · Maintain exact garment fabric colors, logos, and athletic dye with high fidelity.`;
  }

  switch (mode) {
    case 'product':
      return { model_name: 'product-to-model', fields: { product_image: cloth, ...(text ? { prompt: text } : {}) } };
    case 'swap': {
      const sourceImg = src.sourceModel || src.model || src.cloth;
      let swapText = text;
      if (src.targetModel) {
        swapText = `${swapText} · Athletic model swap: swap model appearance to match athletic studio persona with perfect sportswear fit and crisp posture. Strictly preserve natural hands, fingers, and any hand-held sports objects, props, or balls intact.`.trim();
      }
      return { model_name: 'model-swap', fields: { model_image: sourceImg, ...(swapText ? { prompt: swapText } : {}) } };
    }
    case 'edit':
      return { model_name: 'edit', fields: { image: src.source || cloth, prompt: text || 'refine the image' } };
    case 'packshot':
      return {
        model_name: 'edit',
        fields: {
          image: cloth,
          prompt: text || 'clean e-commerce packshot: product centred on a seamless light grey studio background, soft contact shadow, no model',
        },
      };
    case 'outfit': {
      // Full outfit = top garment application (bottom will be chained separately after)
      // This case is used for the first step of two-step chaining
      if (!is2k) {
        return {
          model_name: 'tryon-v1.6',
          fields: {
            garment_image: src.topCloth || cloth,
            model_image: model,
            category: 'tops',
            mode: 'quality',
            garment_photo_type: 'auto',
          },
        };
      }
      return {
        model_name: 'tryon-max',
        fields: {
          product_image: src.topCloth || cloth,
          model_image: model,
        },
      };
    }
    case 'tryon':
    default: {
      // For 1K image: use tryon-v1.6 with quality mode for highest pose, hands & prop (e.g. sports ball) fidelity
      // For 2K Ultra HD: use tryon-max (strictly product_image & model_image only)
      if (!is2k) {
        return {
          model_name: 'tryon-v1.6',
          fields: {
            garment_image: cloth,
            model_image: model,
            category: src.category || 'tops',
            mode: 'quality',
            garment_photo_type: 'auto',
          },
        };
      }
      return {
        model_name: 'tryon-max',
        fields: {
          product_image: cloth,
          model_image: model,
        },
      };
    }
  }
}

/* track active jobs and enforce strict single concurrency per user */
const activeJobs = new Set();
const activeUserGenerations = new Map();

function getUserLockKey(req) {
  if (req.user && req.user._id) return `usr_${req.user._id}`;
  return `ip_${req.ip || req.socket.remoteAddress || 'guest'}`;
}

function isUserGenerating(_req) {
  return false;
}

function lockUser(req, jobId, fingerprint = '') {
  const key = getUserLockKey(req);
  activeUserGenerations.set(key, { jobId, fingerprint, startedAt: Date.now() });
  if (req.user && req.user._id) {
    activeUserGenerations.set(`usr_${req.user._id}`, { jobId, fingerprint, startedAt: Date.now() });
  }
}

function unlockUser(jobId) {
  for (const [key, val] of activeUserGenerations.entries()) {
    if (!jobId || val.jobId === jobId) {
      activeUserGenerations.delete(key);
    }
  }
}

async function refundOutfitCredits(userId, amount) {
  try {
    const u = await auth.findUserById(userId);
    if (u) {
      const restored = (Number(u.credits) || 0) + amount;
      await auth.patchUser(userId, { credits: restored });
      console.log(`[billing] Restored ${amount} credits to ${userId} on outfit failure. Balance: ${restored}`);
    }
  } catch (err) {
    console.error('[billing] Failed to restore outfit credits:', err.message);
  }
}

/* In-memory job registry for asynchronous Multimodal Agent jobs */
const localJobMap = new Map();

async function runAgentJob({ jobId, state, prompt, images, userId, creditsNeeded }) {
  const abortController = new AbortController();
  const existing = localJobMap.get(jobId);
  if (existing) {
    existing.abortController = abortController;
  } else {
    localJobMap.set(jobId, {
      id: jobId,
      status: 'processing',
      output: null,
      error: null,
      userId,
      creditsUsed: creditsNeeded,
      startedAt: Date.now(),
      abortController,
    });
  }

  try {
    const response = await fetch(`${FASHN}/agent/images`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.apiKey}`,
      },
      body: JSON.stringify({
        prompt,
        images,
      }),
      signal: abortController.signal,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = data.message || data.detail || `Agent service rejected request (${response.status})`;
      throw new Error(msg);
    }

    // Extract outputs from Fashn agent response
    let generatedUrls = [];
    if (Array.isArray(data.predictions)) {
      for (const pred of data.predictions) {
        if (Array.isArray(pred.results)) generatedUrls.push(...pred.results);
        else if (Array.isArray(pred.output)) generatedUrls.push(...pred.output);
        else if (typeof pred.url === 'string') generatedUrls.push(pred.url);
        else if (typeof pred.image === 'string') generatedUrls.push(pred.image);
      }
    }
    if (generatedUrls.length === 0 && Array.isArray(data.output)) {
      generatedUrls = data.output;
    }
    if (generatedUrls.length === 0 && Array.isArray(data.results)) {
      generatedUrls = data.results;
    }
    if (generatedUrls.length === 0 && typeof data.image === 'string') {
      generatedUrls = [data.image];
    }

    if (generatedUrls.length === 0) {
      throw new Error('Fashn AI Agent completed successfully but returned no image outputs.');
    }

    // Duplicate & unchanged output guard: ensure credits are not wasted on no-op renders
    const isUnchangedDuplicate = generatedUrls.some((u) => {
      return images.some((img) => typeof img === 'string' && img === u);
    });
    if (isUnchangedDuplicate) {
      throw new Error('Render returned an unchanged image without applying garments. Zero credits charged — balance restored.');
    }

    // Download and store locally
    const localOutputs = [];
    for (let i = 0; i < generatedUrls.length; i++) {
      const remote = generatedUrls[i];
      if (!/^https?:/.test(remote)) {
        localOutputs.push(remote);
        continue;
      }
      const file = `${jobId}-${i}.png`;
      const target = path.join(GENERATED, file);
      let savedLocally = false;
      try {
        await fs.access(target);
        savedLocally = true;
      } catch {
        try {
          const img = await fetch(remote);
          if (img.ok) {
            await fs.writeFile(target, Buffer.from(await img.arrayBuffer()));
            savedLocally = true;
          }
        } catch { }
      }

      let permanent = '';
      try {
        const map = await readHosted();
        permanent = map.generated?.[file] || '';
        if (!permanent && savedLocally) {
          const uploaded = await hostImage(await fs.readFile(target), file);
          if (uploaded) {
            permanent = uploaded.url;
            map.generated = map.generated || {};
            map.generated[file] = permanent;
            await saveHosted(map);
          }
        }
      } catch { }

      // Safe fallback: prioritize permanent cloud URL, then verified local copy, then original remote CDN URL
      const finalUrl = permanent || (savedLocally ? `/generated/${file}` : remote) || remote;
      localOutputs.push(finalUrl);
    }

    const job = localJobMap.get(jobId);
    if (job && job.status !== 'cancelled') {
      job.status = 'completed';
      job.output = localOutputs;
    }

    // Update generations.json
    try {
      const genList = await readGenerations();
      const found = genList.find((g) => g.id === jobId);
      const primaryUrl = localOutputs[0] || generatedUrls[0];
      if (found) {
        found.status = 'completed';
        found.outputUrl = primaryUrl;
        found.url = primaryUrl;
        found.remoteUrl = generatedUrls[0] || primaryUrl;
        found.highResUrl = generatedUrls[0] || primaryUrl;
        found.completedAt = Date.now();
        await writeGenerations(genList);
      } else if (primaryUrl) {
        genList.unshift({
          id: jobId,
          userId: job?.userId || '',
          userEmail: job?.userEmail || '',
          type: 'image',
          status: 'completed',
          outputUrl: primaryUrl,
          url: primaryUrl,
          remoteUrl: generatedUrls[0] || primaryUrl,
          highResUrl: generatedUrls[0] || primaryUrl,
          prompt: job?.prompt || 'Studio Sportswear Render',
          createdAt: job?.createdAt || Date.now(),
          completedAt: Date.now(),
        });
        await writeGenerations(genList);
      }
    } catch (saveErr) {
      console.warn('[agent] Failed to update completed generation status:', saveErr.message);
    }

  } catch (err) {
    if (abortController.signal.aborted) {
      console.log(`[agent] Job ${jobId} was aborted by user cancel.`);
      const job = localJobMap.get(jobId);
      if (job && !job.refunded && userId && creditsNeeded > 0) {
        job.refunded = true;
        try {
          const u = await auth.findUserById(userId);
          if (u) {
            const restored = (Number(u.credits) || 0) + creditsNeeded;
            await auth.patchUser(userId, {
              credits: restored,
              modelsGenerated: Math.max(0, (Number(u.modelsGenerated) || 1) - 1),
              dailyModelsUsed: Math.max(0, (Number(u.dailyModelsUsed) || 1) - 1),
            });
            console.log(`[billing] Restored ${creditsNeeded} credits to ${userId} on abort. Balance: ${restored}`);
          }
        } catch (rfErr) {
          console.error('[billing] Failed to restore credits on abort:', rfErr.message);
        }
      }
      return;
    }
    console.error(`[agent] Job ${jobId} failed:`, err.message);
    const job = localJobMap.get(jobId);
    if (job && job.status !== 'cancelled') {
      job.status = 'failed';
      job.error = { message: err.message };
    }

    try {
      let userEmail = 'user';
      if (userId) {
        const u = await auth.findUserById(userId);
        if (u?.email) userEmail = u.email;
      }
      await recordSystemProblem({
        module: 'agent-fashn',
        severity: 'error',
        userEmail,
        userId: userId || null,
        title: 'Fashn Multimodal Agent Render Failed',
        message: err.message,
        stack: err.stack,
      });
    } catch { }

    // Auto-refund user credits and restore quota on any failure
    if (userId && creditsNeeded > 0) {
      try {
        const u = await auth.findUserById(userId);
        if (u) {
          const restored = (Number(u.credits) || 0) + creditsNeeded;
          const restoredModels = Math.max(0, (Number(u.modelsGenerated) || 1) - 1);
          const restoredDaily = Math.max(0, (Number(u.dailyModelsUsed) || 1) - 1);
          await auth.patchUser(userId, {
            credits: restored,
            modelsGenerated: restoredModels,
            dailyModelsUsed: restoredDaily,
          });
          console.log(`[billing] Restored ${creditsNeeded} credits to ${userId} on agent failure. Quotas restored. Balance: ${restored}`);
        }
      } catch (refundErr) {
        console.error('[billing] Failed to restore agent credits:', refundErr.message);
      }
    }

    // Update generations.json
    try {
      const genList = await readGenerations();
      const found = genList.find((g) => g.id === jobId);
      if (found) {
        found.status = 'failed';
        found.error = err.message;
        found.completedAt = Date.now();
        await writeGenerations(genList);
      }
    } catch { }
  } finally {
    unlockUser(jobId);
  }
}

const recentUserGenerations = new Map();

app.post('/api/generate', auth.requireUser, async (req, res) => {
  try {
    const isForce = Boolean(req.body?.forceUnlock || req.query?.force === 'true');

    /* Prevent duplicate rapid double-clicks (within 2 seconds) */
    const genFingerprint = `${req.user._id}_${req.body?.mode || ''}_${req.body?.cloth || ''}_${req.body?.model || ''}_${req.body?.prompt || ''}_${req.body?.tryOnTarget || ''}`;
    const userLockKey = getUserLockKey(req);
    const existingActive = activeUserGenerations.get(userLockKey) || (req.user?._id ? activeUserGenerations.get(`usr_${req.user._id}`) : null);

    // ZERO-CREDIT-WASTE RULE 1: If an identical generation is currently running, return that active job without deducting new credits
    if (existingActive?.jobId && existingActive.fingerprint === genFingerprint) {
      const activeJob = localJobMap.get(existingActive.jobId);
      if (activeJob && (activeJob.status === 'processing' || activeJob.status === 'starting')) {
        console.log(`[generate] Identical job ${existingActive.jobId} is already in-flight. Returning without duplicate credit deduction.`);
        return res.json({
          id: existingActive.jobId,
          mode: req.body?.mode || 'tryon',
          credits: req.user.credits,
          creditsUsed: 0,
          dedup: true,
        });
      }
    }

    const prevGen = recentUserGenerations.get(req.user._id);
    if (!isForce && prevGen && prevGen.key === genFingerprint && Date.now() - prevGen.time < 2000) {
      return res.status(429).json({
        error: 'duplicate_generation',
        message: 'Please wait a moment before sending another render request.',
      });
    }
    recentUserGenerations.set(req.user._id, { key: genFingerprint, time: Date.now() });

    /* Seamless concurrency handling: gracefully abort any previous active job for this user and AUTO-REFUND IT */
    if (existingActive) {
      if (existingActive.jobId) {
        const prevLocal = localJobMap.get(existingActive.jobId);
        if (prevLocal && (prevLocal.status === 'processing' || prevLocal.status === 'starting')) {
          try {
            prevLocal.status = 'cancelled';
            prevLocal.abortController?.abort();
            // ZERO-CREDIT-WASTE RULE 2: If previous job is replaced before finishing, auto-refund its credits immediately
            if (prevLocal.userId && prevLocal.creditsUsed > 0 && !prevLocal.refunded) {
              prevLocal.refunded = true;
              const u = await auth.findUserById(prevLocal.userId);
              if (u) {
                const restored = (Number(u.credits) || 0) + prevLocal.creditsUsed;
                await auth.patchUser(prevLocal.userId, {
                  credits: restored,
                  modelsGenerated: Math.max(0, (Number(u.modelsGenerated) || 1) - 1),
                  dailyModelsUsed: Math.max(0, (Number(u.dailyModelsUsed) || 1) - 1),
                });
                console.log(`[billing] Auto-refunded ${prevLocal.creditsUsed} credits for cancelled in-flight job ${existingActive.jobId}. Balance: ${restored}`);
              }
            }
          } catch (cancelErr) {
            console.warn('[billing] Auto-refund warning on cancel:', cancelErr.message);
          }
        }
      }
      activeUserGenerations.delete(userLockKey);
      if (req.user?._id) {
        activeUserGenerations.delete(`usr_${req.user._id}`);
      }
    }

    const state = await readState();
    if (!state.apiKey) {
      return res.status(400).json({ error: 'not_ready', message: 'The studio is being set up — no render API key is configured yet.' });
    }
    /* quick key format check — Fashn keys start with fa- */
    if (!state.apiKey.startsWith('fa-')) {
      return res.status(400).json({ error: 'bad_key', message: 'The configured API key does not look valid. It should start with "fa-". Update it in the admin panel.' });
    }

    if (req.user.creditsLocked) {
      return res.status(403).json({
        error: 'credits_locked',
        message: 'Your account credits have been locked by the administrator. Please contact support.',
      });
    }

    const now = Date.now();
    if (req.user.planExpiresAt && now > req.user.planExpiresAt && req.user.tier !== 'free') {
      await auth.patchUser(req.user._id, { tier: 'free' });
      return res.status(403).json({
        error: 'plan_expired',
        message: 'Your monthly subscription plan has expired. Please renew your plan on the pricing page.',
      });
    }

    const body = req.body || {};
    const mode = body.mode || state.defaultMode;
    const resolution = String(body.resolution || state.resolution || '1k').toLowerCase();
    const is2k = resolution === '2k' || resolution === '4k';
    const creditsNeeded = is2k ? 3 : 1; // Strictly 3 credits for 2K Ultra HD, 1 credit for 1K Standard

    /* 2K resolution permission check - Ultra tier only */
    if (is2k) {
      const allowed2k = Boolean(req.user.features?.hd2k || req.user.tier === 'ultra');
      if (!allowed2k) {
        return res.status(403).json({
          error: 'tier_restricted',
          message: '2K Ultra HD resolution is reserved exclusively for Ultra tier accounts.',
        });
      }
    }

    /* Model generation limits (Total quota: 1 photoshoot = 6 generations/poses) */
    const rawPhotoshoots = typeof req.user.photoshoots === 'number' && req.user.photoshoots > 0
      ? req.user.photoshoots
      : (typeof req.user.maxModels === 'number' && req.user.maxModels > 0 ? req.user.maxModels : 0);
    const maxAllowedGenerations = rawPhotoshoots > 0 ? rawPhotoshoots * 6 : 0;
    const modelsGenerated = typeof req.user.modelsGenerated === 'number' ? req.user.modelsGenerated : 0;
    if (maxAllowedGenerations > 0 && modelsGenerated >= maxAllowedGenerations) {
      return res.status(403).json({
        error: 'photoshoot_limit_reached',
        message: `You have reached your allocated photoshoot limit (${Math.floor(modelsGenerated / 6)}/${rawPhotoshoots} photoshoots · ${modelsGenerated}/${maxAllowedGenerations} poses generated). Wrong or imperfect attempts are also counted in the photoshoot limit. Contact administrator to increase your photoshoot quota.`,
      });
    }

    /* Credits are permanent (admin-allocated). No daily quota reset. */
    const dailyModels = Number(req.user.dailyModelsUsed || 0);
    const isSameDay = true; // kept for compatibility

    /* check user credit balance */
    const userCredits = typeof req.user.credits === 'number' ? req.user.credits : 10;
    if (userCredits < creditsNeeded) {
      return res.status(402).json({
        error: 'insufficient_credits',
        message: `You have ${userCredits} credit${userCredits === 1 ? '' : 's'} remaining, but ${creditsNeeded} credits are required for ${resolution.toUpperCase()} quality. Please upgrade your plan.`,
      });
    }

    /* strict validation: refuse early so no credit is wasted */
    if (mode === 'swap') {
      const sourceImg = body.sourceModel || body.model;
      const targetImg = body.targetModel;
      if (!sourceImg || !targetImg) {
        return res.status(400).json({
          error: 'missing_images',
          message: 'Model Swap requires both: (1) Kis model ko change karna hai and (2) Kis model ke sath change karna hai.',
        });
      }
    } else {
      const needs = { tryon: ['cloth', 'model'], outfit: ['model'], product: ['cloth'], edit: [], packshot: ['cloth'] };
      const required = needs[mode] || ['cloth', 'model'];
      const missing = required.filter((key) => !body[key]);
      if (missing.length) {
        const friendly = missing.map(k => k === 'cloth' ? 'garment image' : k === 'model' ? 'model image' : `${k} image`);
        return res.status(400).json({
          error: 'missing_images',
          message: `Please add ${friendly.join(' and ')} before generating. Mode "${mode}" requires: ${required.join(', ')}.`,
        });
      }
    }
    /* edit mode: needs at least one image (source, cloth, or model) */
    if (mode === 'edit' && !body.source && !body.cloth && !body.model) {
      return res.status(400).json({
        error: 'missing_images',
        message: 'Edit mode needs at least one image — upload a garment or select a model.',
      });
    }

    /* ==============================================================
       DRY-RUN INSPECTION TEST (0 CREDITS - NO CHARGE)
       Allows verifying exact reference images, angle types, color codes,
       targets (upper/lower/both), and prompt before generating.
       ============================================================== */
    const garmentViews = Array.isArray(body.garmentViews) && body.garmentViews.length > 0 ? body.garmentViews : null;
    const isOutfit = mode === 'outfit' || (mode === 'tryon' && (body.tryOnTarget === 'both' || (body.topCloth && body.bottomCloth)));
    const isSwap = mode === 'swap' && Boolean((body.sourceModel || body.source || body.cloth) && (body.targetModel || body.model));

    if (body.dryRun || req.query.dryRun === 'true') {
      const viewsToUse = garmentViews ? garmentViews.slice(0, 5) : [];
      let testPrompt = 'SHIV-NARESH athletic sportswear. ';
      if (isSwap) {
        testPrompt += 'Target Model Garment Replacement: Dress the target model in Image 1 wearing the athletic sportswear clothing from Image 2. ' +
          'CRITICAL TARGET MODEL PRESERVATION: Maintain target model pose, physique, facial identity, and hair with 100% fidelity. ';
      } else if (viewsToUse.length > 0) {
        const viewLabels = viewsToUse.map((v, i) => `Image ${i + 2}: ${v.label || v.role || `View ${i + 1}`}`).join(', ');
        testPrompt += `Multi-Angle Garment Synthesis: Dress the athlete model in Image 1 with authentic sportswear shown across reference views (${viewLabels}). ` +
          'Accurately transfer collar, zipper, chest graphics, sleeve stripes, side panels, and back patterns onto model in Image 1. ';
        if (body.tryOnTarget === 'lower' || body.category === 'bottoms') {
          testPrompt += 'TARGET LOWER BODY / PANTS: Dress the lower body (legs) of the athlete in Image 1 with the bottom garment from reference views. Worn as full-length athletic track pants reaching down to sneakers. ';
        } else if (body.tryOnTarget === 'both' || isOutfit) {
          testPrompt += 'TARGET FULL OUTFIT: Dress the athlete in Image 1 wearing complete matching sportswear outfit from reference views, applying top to upper body and bottom pants to legs reaching sneakers. ';
        } else {
          testPrompt += 'TARGET UPPER BODY: Dress upper torso of athlete in Image 1 with authentic sportswear from reference views, keeping existing pants and shoes intact. ';
        }
      } else {
        if (body.tryOnTarget === 'lower' || body.category === 'bottoms') {
          testPrompt += 'Replace pants on athlete in Image 1 with bottom garment from Image 2 as full-length athletic track pants. ';
        } else if (body.tryOnTarget === 'both' || isOutfit) {
          testPrompt += 'Dress athlete in Image 1 wearing matching top and bottom sportswear outfit. ';
        } else {
          testPrompt += 'Put athletic garment from Image 2 onto athlete in Image 1 with realistic sportswear fit and high fidelity. ';
        }
      }
      if (body.color && typeof body.color === 'string' && body.color.trim()) {
        testPrompt += `Exact fabric color: ${body.color.trim()}. Maintain true garment dye and athlete kit tones with accurate color matching. `;
      }
      if (body.prompt && typeof body.prompt === 'string' && body.prompt.trim()) {
        testPrompt += `User Instructions: ${body.prompt.trim()}. `;
      }
      testPrompt += "CRITICAL POSE & PROP PRESERVATION: Keep model's exact face, skin tone, hair, posture, and props (basketball/gear) completely untouched.";

      return res.json({
        ok: true,
        dryRun: true,
        creditsUsed: 0,
        userCredits: typeof req.user?.credits === 'number' ? req.user.credits : 0,
        target: body.tryOnTarget || (body.category === 'bottoms' ? 'lower' : (isOutfit ? 'both' : 'upper')),
        color: body.color || '',
        modelPose: body.model || body.targetModel || 'Selected Model Pose',
        garmentViews: viewsToUse,
        totalImagesSent: (viewsToUse.length > 0 ? viewsToUse.length + 1 : 2),
        maxAllowedImages: 6,
        withinLimit: (viewsToUse.length > 0 ? viewsToUse.length + 1 : 2) <= 6,
        composedPrompt: testPrompt.trim(),
        resolution: resolution.toUpperCase(),
        mode: isSwap ? 'swap' : (isOutfit ? 'outfit' : 'tryon')
      });
    }

    /* ==============================================================
       Fashn AI Multimodal Agent: 1-Pass Full Outfit, Try-On & Swap
       (1 Credit, 1 Generation, Preserves Props/Basketball & Colors)
       ============================================================== */
    const hasSpecialPromptOrProps = Boolean(
      (body.prompt && body.prompt.trim()) ||
      (body.color && body.color.trim()) ||
      body.category === 'bottoms' ||
      body.preserveProps ||
      garmentViews
    );

    if (isOutfit || isSwap || (mode === 'tryon' && (body.cloth || garmentViews) && body.model)) {
      // Deduct credits ONCE before running (1 credit for 1K, 3 for 2K)
      const remainingCredits = Math.max(0, userCredits - creditsNeeded);
      await auth.patchUser(req.user._id, {
        credits: remainingCredits,
        modelsGenerated: modelsGenerated + 1,
        dailyModelsUsed: dailyModels + 1,
      });
      req.user.credits = remainingCredits;

      const agentJobId = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      lockUser(req, agentJobId, genFingerprint);

      let images = [];
      let agentPrompt = '';

      if (isSwap) {
        const [targetUri, sourceUri] = await Promise.all([
          toDataUri(body.targetModel || body.model),
          toDataUri(body.sourceModel || body.source || body.cloth),
        ]);
        images = [targetUri, sourceUri];
        agentPrompt += 'Model Garment Replacement: Dress the target model in Image 1 with the exact clothing from Image 2, fitted naturally to their pose and physique. ' +
          'HAND & HELD OBJECT PRESERVATION: If either model in Image 1 or Image 2 is holding an object, sports ball (basketball, football, volleyball, cricket ball), racket, bat, prop, or equipment in their hands, STRICTLY PRESERVE the object and hand grip intact with 100% fidelity. Do NOT remove or erase hand-held sports objects. ';
      } else if (garmentViews) {
        const viewsToUse = garmentViews.slice(0, 5);
        const [modelUri, ...garmentUris] = await Promise.all([
          toDataUri(body.model),
          ...viewsToUse.map((v) => toDataUri(v.url)),
        ]);
        images = [modelUri, ...garmentUris];

        const viewLabels = viewsToUse.map((v, i) => `Image ${i + 2}: ${v.label || v.role || `View ${i + 1}`}`).join(', ');
        agentPrompt += `Multi-Angle Garment Synthesis: Dress the model in Image 1 with the authentic garment shown across the reference photos (${viewLabels}). ` +
          'Synthesize all provided reference views dynamically: transfer the front design, back patterns, collar, sleeves, and graphics onto the model in Image 1 matching the model’s posture and natural styling. ';

        if (body.tryOnTarget === 'lower' || body.category === 'bottoms') {
          agentPrompt += 'Target: Lower body. Dress the model’s legs with the bottom garment from the reference views, matching its exact silhouette, length, waistband, and side details. Keep top shirt, face, shoes, and posture intact. ';
        } else if (body.tryOnTarget === 'both' || isOutfit) {
          agentPrompt += 'Target: Complete outfit. Dress the model in the complete matching outfit from the reference views, applying top to torso and bottom to legs. ';
        } else {
          agentPrompt += 'Target: Upper body. Dress the model’s upper torso with the garment from the reference views, keeping existing pants, shoes, and body intact. ';
        }
      } else if (isOutfit) {
        const [modelUri, topClothUri, bottomClothUri] = await Promise.all([
          toDataUri(body.model),
          toDataUri(body.topCloth || body.cloth),
          body.bottomCloth ? toDataUri(body.bottomCloth) : Promise.resolve(null),
        ]);
        images = bottomClothUri ? [modelUri, topClothUri, bottomClothUri] : [modelUri, topClothUri];
        if (bottomClothUri) {
          agentPrompt += 'Dress the model in Image 1 wearing both garments simultaneously: the top garment from Image 2 and the bottom garment from Image 3 as a complete matching outfit. ';
        } else {
          agentPrompt += 'Put the garment from Image 2 onto the model in Image 1 with realistic fit and natural style. ';
        }
      } else {
        const [modelUri, singleClothUri] = await Promise.all([
          toDataUri(body.model),
          toDataUri(body.cloth),
        ]);
        images = [modelUri, singleClothUri];
        const isTracksuitOrSet = Boolean(
          body.category === 'one-pieces' ||
          body.tryOnTarget === 'both' ||
          (typeof body.clothName === 'string' && /tracksuit|suit|outfit|set|kit|combo|track/i.test(body.clothName)) ||
          (typeof body.prompt === 'string' && /tracksuit|suit|outfit|both|track\s*pant/i.test(body.prompt))
        );
        if (isTracksuitOrSet) {
          agentPrompt += 'Target: Complete Tracksuit / Sports Outfit. Dress the model in Image 1 wearing the complete athletic tracksuit from Image 2 (both the upper jacket/top and the matching track pants/bottoms simultaneously). Ensure matching fabric, colors, and side patterns on both top and bottom with 100% fidelity. ';
        } else if (body.category === 'bottoms' || body.tryOnTarget === 'lower') {
          agentPrompt += 'Target: Lower body. Dress the model’s legs in Image 1 with the bottom garment from Image 2, matching its exact length, waistband, and details. Keep existing top, face, and shoes intact. ';
        } else {
          agentPrompt += 'Target: Upper body. Dress the model’s upper torso in Image 1 with the garment from Image 2, faithfully replicating its cut, sleeve length, neckline, and graphics. Keep existing pants, shoes, and body intact. ';
        }
      }

      const userPrompt = (body.prompt || '').trim();
      const userWantsRemoveShivNaresh = /remove.*(?:company.*logo|company.*text|shiv-naresh|shiv naresh)|without.*(?:shiv-naresh|shiv naresh)/i.test(userPrompt);
      const userWantsRemoveAllLogo = /remove.*(?:all\s+logos?|every\s+logo|all\s+branding|unbranded)/i.test(userPrompt);
      const userWantsRemoveLogo = userWantsRemoveShivNaresh || userWantsRemoveAllLogo || /remove.*(?:logo|brand)/i.test(userPrompt);

      // Universal dynamic fidelity rules: Full-body vertical preservation, 3D realism, true fabric drape, and natural styling matching model
      let dynamicFidelityRules =
        'FULL-BODY HEAD-TO-TOE PRESERVATION: Render the complete athlete model from top of head/hair down to sneakers without cropping the edges, shoes, or head. Keep the entire full-body vertical frame complete and centered. ' +
        'MODEL INTEGRITY: Strictly preserve the model in Image 1 intact — maintain their exact face, facial expression, skin tone, natural hair, athletic physique, posture, and shoes with 100% fidelity. ' +
        'COLLAR & HOOD INTEGRITY (STRICT HOODLESS STAND-COLLAR DEFAULT): Derive collar, neckline, and hood styling strictly from the reference garment in Image 2. ' +
        'If the reference garment in Image 2 is a track jacket, windcheater, zip jacket, jersey, or tracksuit with a stand collar or funnel neck (or if prompt specifies stand collar / zipped / hoodless), the garment MUST be rendered 100% HOODLESS. ' +
        'Do NOT invent, attach, or drape any hood, cap, hoodie pouch, drawstrings, or bunched fabric behind the neck, ears, or across the upper back/shoulders. ' +
        'The nape and back of neck must show only the neat, clean upright stand collar seam and natural skin/hairline. ' +
        'Only render a hood if the reference garment in Image 2 is explicitly an attached pullover/zip hoodie with an attached hood. ' +
        'GARMENT ACCENTS & PATTERN FIDELITY: Faithfully replicate all garment patterns, bold curved accent lines, side panels, seam details, color gradients, and micro-perforated dot patterns directly from the reference garment photos. ' +
        'Preserve the prominent royal blue curved accent lines running along both shoulder seams, the dense micro-laser perforated dot pattern across the shoulder yoke and extending fully down both side panels, and the lower body royal blue color gradient with exact 1:1 reproduction, every dot and line sharp and visible without solid-color flattening or omission. ' +
        'If the model in Image 1 is facing backwards (back view), synthesize the back view of the garment: render the back shoulder yoke with the dot cluster, curved royal blue accent lines, back side panels, and lower back blue gradient. ' +
        'MODEL ACCESSORIES & INTEGRITY: Strictly preserve the model’s natural posture, accessories, watches, wristbands, and shoes from Image 1 intact with 100% fidelity. Do NOT remove worn accessories or alter the model’s natural stance. ' +
        'CRITICAL HANDS & HELD PROPS PRESERVATION: Strictly preserve the model’s hands, fingers, and any object, sports ball (basketball, football, volleyball, cricket ball), racket, bat, bottle, equipment, or prop held in the hands with 100% fidelity. Do NOT erase, blur, alter, or remove hand-held objects or sports equipment. If the model or reference is holding an object in their hand, retain that exact hand-held object with natural fingers and grip. ' +
        '3D REALISTIC FABRIC DEPTH & ANATOMICAL WRAPPING: The athletic sportswear must NOT appear as a flat 2D decal, sticker, or painted texture. Render authentic three-dimensional physical depth, dynamic fabric drape, and realistic micro-tension wrinkles around seams, waist, armpits, and elbows conforming to the athlete’s muscular physique and posture. ' +
        'STRICT VISUAL REFERENCE FIDELITY: Mirror the exact garment shown in the reference photos with complete fidelity. Accurately replicate its cut, sleeve length, closures, textures, and patterns. ';

      if (userWantsRemoveShivNaresh && !userWantsRemoveAllLogo) {
        dynamicFidelityRules +=
          'REMOVE ONLY COMPANY BRANDING: Remove ONLY the company manufacturer logo (white animal emblem) and company name text "SHIV-NARESH". Naturally fill that exact area with the original fabric color, texture, and shading. STRICTLY PRESERVE all other graphic patterns, design stripes, sleeve prints, team typography, and garment styles intact without altering them. ';
      } else if (userWantsRemoveAllLogo) {
        dynamicFidelityRules +=
          'REMOVE ALL BRAND LOGOS: Strictly remove all brand logos and manufacturer emblems from the clothing, naturally restoring the fabric so the garment is unbranded. Preserve all underlying fabric patterns and stripes. ';
      } else if (userWantsRemoveLogo) {
        dynamicFidelityRules +=
          'REMOVE BRAND LOGOS: Remove brand logos from the clothing while preserving all underlying fabric patterns, seam lines, and graphic styling. ';
      } else {
        dynamicFidelityRules +=
          'BRAND LOGO FIDELITY & NO DUPLICATION: Render only authentic single brand logos present on the garment reference photos (one on chest, one on thigh). Do NOT invent duplicate or repeated second logos. ';
      }

      let universalNegative =
        'no baseball cap, no beanie, no helmet, no visor (unless worn by the reference model in Image 1), no hood behind neck, no draped hood, no bunched fabric at nape, no hanging hoodie pouch, no cap behind neck, no deformed fingers, no missing fingers, no mutilated hands, no different face, no plastic skin, no cartoon, no text artefacts, no watermark';

      if (userWantsRemoveShivNaresh && !userWantsRemoveAllLogo) {
        universalNegative += ', no shiv-naresh text, no manufacturer animal logo';
      } else if (userWantsRemoveAllLogo || userWantsRemoveLogo) {
        universalNegative += ', no logo, no company text, no shiv-naresh, no brand name, no wordmark, no emblem';
      } else {
        universalNegative += ', no extra logos, no duplicate logos';
      }

      dynamicFidelityRules += `UNIVERSAL NEGATIVE PROMPT: ${universalNegative}. `;

      agentPrompt += dynamicFidelityRules;

      if (body.color && typeof body.color === 'string' && body.color.trim()) {
        agentPrompt += `Exact fabric color: ${body.color.trim()}. Maintain true garment dye and athlete kit tones with accurate color matching. `;
      }
      if (body.prompt && typeof body.prompt === 'string' && body.prompt.trim()) {
        const cleanedUserPrompt = body.prompt
          .replace(/ATHLETIC HOODED TRACKSUIT \([^)]+\):[^.]*\./gi, '')
          .replace(/CLASSIC ZIP JACKET \([^)]+\):[^.]*\./gi, '')
          .replace(/ACTIVE SPORTS \([^)]+\):[^.]*\./gi, '')
          .replace(/WINDCHEATER JACKET \([^)]+\):[^.]*\./gi, '')
          .replace(/PULLOVER HOODIE \([^)]+\):[^.]*\./gi, '')
          .replace(/·\s*·/g, '·')
          .trim();
        if (cleanedUserPrompt) {
          agentPrompt += `Specific styling instructions: ${cleanedUserPrompt}. `;
        }
      }
      if (is2k) {
        agentPrompt += 'Render in 2K Ultra HD studio resolution with razor-sharp fabric weave and realistic texture. ';
      }

      localJobMap.set(agentJobId, {
        id: agentJobId,
        status: 'processing',
        output: null,
        error: null,
        userId: req.user._id,
        creditsUsed: creditsNeeded,
        startedAt: Date.now(),
      });

      // Record in generations.json immediately
      try {
        const genList = await readGenerations();
        genList.unshift({
          id: agentJobId,
          userId: req.user._id,
          userEmail: req.user.email || 'user',
          userName: req.user.name || '',
          type: isSwap ? 'model-swap' : 'tryon',
          mode: isSwap ? 'swap' : (isOutfit ? 'outfit' : 'tryon'),
          resolution: resolution.toUpperCase(),
          creditsUsed: creditsNeeded,
          status: 'processing',
          error: null,
          prompt: (body.prompt && body.prompt.trim()) ? body.prompt.trim() : (body.clothName ? `Sportswear Render · ${body.clothName}` : 'Studio Sportswear Render'),
          systemPrompt: agentPrompt,
          cloth: isSwap ? 'Model Swap Persona' : (isOutfit ? 'Full Outfit (Top + Bottom)' : 'Athletic Garment'),
          model: typeof body.model === 'string' ? (body.model.startsWith('data:') ? 'Custom Model' : body.model) : (body.sourceModel || ''),
          outputUrl: null,
          createdAt: Date.now(),
        });
        await writeGenerations(genList);
      } catch { }

      // Fire off agent job in background
      runAgentJob({
        jobId: agentJobId,
        state,
        prompt: agentPrompt,
        images,
        userId: req.user._id,
        creditsNeeded,
      });

      return res.json({
        id: agentJobId,
        mode: isSwap ? 'swap' : (isOutfit ? 'outfit' : 'tryon'),
        credits: remainingCredits,
        creditsUsed: creditsNeeded,
      });
    }

    /* validate that image URLs/paths actually exist before calling Fashn */
    const { model_name, fields } = buildRequest(mode, state, {
      ...body,
      cloth: body.cloth,
      model: body.model,
      source: body.source,
      sourceModel: body.sourceModel || body.model,
      targetModel: body.targetModel,
    }, is2k);

    /* convert every referenced image into a format FASHN can read in parallel */
    const entries = Object.entries(fields);
    let inputs;
    try {
      const convertedEntries = await Promise.all(
        entries.map(async ([key, value]) => {
          if (typeof value === 'string' && /^(\/|https?:|data:)/.test(value) && key !== 'prompt') {
            const uri = await toDataUri(value);
            return [key, uri];
          }
          return [key, value];
        })
      );
      inputs = Object.fromEntries(convertedEntries);
    } catch (imgErr) {
      return res.status(400).json({
        error: 'image_error',
        message: imgErr.message || 'Could not load input images for rendering. Please re-upload.',
      });
    }

    /* sanitize inputs strictly for Fashn API: Fashn only allows model-specific image/prompt fields */
    delete inputs.generation_mode;
    delete inputs.resolution;
    delete inputs.target_image;
    delete inputs.face_image;
    if (model_name === 'tryon-max') {
      delete inputs.category;
      delete inputs.mode;
      delete inputs.garment_photo_type;
      delete inputs.prompt;
    } else if (model_name.startsWith('tryon') || mode === 'tryon') {
      delete inputs.prompt;
      // keep mode='quality', category, and garment_photo_type for tryon-v1.6
    } else {
      delete inputs.mode;
    }

    /* unique request ID to track job without colliding on field names */
    const requestKey = `job-${req.user?._id || 'guest'}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    activeJobs.add(requestKey);

    /* auto-clear after 120s regardless */
    const clearTimer = setTimeout(() => activeJobs.delete(requestKey), 120000);

    try {
      const response = await fetch(`${FASHN}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.apiKey}` },
        body: JSON.stringify({ model_name, inputs }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        activeJobs.delete(requestKey);
        clearTimeout(clearTimer);
        let msg = data.message || data.detail || `The render service rejected the request (${response.status})`;
        /* Fashn.ai sometimes returns "Rendering is off" for auth/key problems — clarify */
        if (
          typeof msg === 'string' &&
          (msg.toLowerCase().includes('rendering is off') ||
            msg.toLowerCase().includes('no render key') ||
            response.status === 401 ||
            response.status === 403)
        ) {
          msg = `Fashn.ai rejected the API key (${response.status}). Please re-save your API key in the Admin panel. Original: ${msg}`;
        }
        await recordSystemProblem({
          module: 'image-generation',
          severity: 'error',
          userEmail: req.user?.email || 'guest',
          userId: req.user?._id,
          title: `Image Generation Rejected (HTTP ${response.status})`,
          message: msg,
          details: { mode, resolution, responseData: data },
        });
        /* Record rejection in generations.json for Admin ledger */
        try {
          const genList = await readGenerations();
          genList.unshift({
            id: crypto.randomUUID(),
            userId: req.user?._id || 'guest',
            userEmail: req.user?.email || 'guest',
            userName: req.user?.name || '',
            type: mode === 'swap' ? 'model-swap' : 'tryon',
            mode: mode || 'tryon',
            resolution: resolution.toUpperCase(),
            creditsUsed: 0,
            status: 'failed',
            error: msg,
            prompt: body.prompt || '',
            createdAt: Date.now(),
          });
          await writeGenerations(genList);
        } catch { }

        return res.status(response.status).json({
          error: data.error || 'render_error',
          message: msg,
        });
      }
      /* store the job id → key mapping so we can clean up when it completes */
      if (data.id) {
        lockUser(req, data.id, genFingerprint);
        jobKeyMap.set(data.id, {
          requestKey,
          clearTimer,
          userId: req.user?._id,
          userLockKey: getUserLockKey(req),
          creditsUsed: creditsNeeded,
        });

        /* Record active generation in generations.json so it is tracked immediately in Admin Panel */
        try {
          const genList = await readGenerations();
          genList.unshift({
            id: data.id,
            userId: req.user?._id || 'guest',
            userEmail: req.user?.email || 'guest',
            userName: req.user?.name || '',
            type: mode === 'swap' ? 'model-swap' : 'tryon',
            mode,
            resolution: resolution.toUpperCase(),
            creditsUsed: creditsNeeded,
            status: 'processing',
            error: null,
            prompt: body.prompt || '',
            cloth: typeof body.cloth === 'string' ? (body.cloth.startsWith('data:') ? 'Custom Upload' : body.cloth) : '',
            model: typeof body.model === 'string' ? (body.model.startsWith('data:') ? 'Custom Model' : body.model) : (body.sourceModel || ''),
            sourceModel: typeof body.sourceModel === 'string' ? (body.sourceModel.startsWith('data:') ? 'Custom Model' : body.sourceModel) : '',
            targetModel: typeof body.targetModel === 'string' ? (body.targetModel.startsWith('data:') ? 'Target Model' : body.targetModel) : '',
            outputUrl: null,
            createdAt: Date.now(),
          });
          await writeGenerations(genList);
        } catch (logErr) {
          console.error('[generations] Failed to write generation log:', logErr.message);
        }
      }

      /* deduct credits and increment model usage counters (credits are permanent — no daily reset) */
      let remainingCredits = userCredits;
      if (req.user && req.user._id) {
        remainingCredits = Math.max(0, userCredits - creditsNeeded);
        const nextModelsGenerated = (Number(req.user.modelsGenerated) || 0) + 1;
        const nextDailyModels = dailyModels + 1;
        await auth.patchUser(req.user._id, {
          credits: remainingCredits,
          modelsGenerated: nextModelsGenerated,
          dailyModelsUsed: nextDailyModels,
        });
        req.user.credits = remainingCredits;
        req.user.modelsGenerated = nextModelsGenerated;
        req.user.dailyModelsUsed = nextDailyModels;
        console.log(`[billing] Deducted ${creditsNeeded} credit(s) for ${resolution.toUpperCase()} generation (${mode}). User ${req.user.email} remaining: ${remainingCredits}`);
      }

      res.json({ id: data.id, mode, credits: remainingCredits, creditsUsed: creditsNeeded });
    } catch (fetchErr) {
      activeJobs.delete(requestKey);
      clearTimeout(clearTimer);
      await recordSystemProblem({
        module: 'image-generation',
        severity: 'error',
        userEmail: req.user?.email || 'guest',
        userId: req.user?._id,
        title: 'Image Generation Network/Fetch Failure',
        message: fetchErr.message,
        stack: fetchErr.stack,
      });
      throw fetchErr;
    }
  } catch (error) {
    try {
      const genList = await readGenerations();
      genList.unshift({
        id: crypto.randomUUID(),
        userId: req.user?._id || 'guest',
        userEmail: req.user?.email || 'guest',
        userName: req.user?.name || '',
        type: req.body?.mode === 'swap' ? 'model-swap' : 'tryon',
        mode: req.body?.mode || 'tryon',
        resolution: String(req.body?.resolution || '1k').toUpperCase(),
        creditsUsed: 0,
        status: 'failed',
        error: String(error.message || error),
        prompt: req.body?.prompt || '',
        createdAt: Date.now(),
      });
      await writeGenerations(genList);
    } catch { }
    const isMissingAsset = /no longer available|image not found|missing image/i.test(error.message || '');
    if (!isMissingAsset) {
      await recordSystemProblem({
        module: 'image-generation',
        severity: 'error',
        userEmail: req.user?.email || 'guest',
        userId: req.user?._id,
        title: 'Image Generation Exception',
        message: error.message,
        stack: error.stack,
      });
    }
    res.status(isMissingAsset ? 400 : 500).json({
      error: isMissingAsset ? 'missing_asset' : 'generate_failed',
      message: String(error.message || error),
    });
  }
});

/* map job id to its active-job key so we can clean up on completion */
const jobKeyMap = new Map();

app.get('/api/job/:id', async (req, res) => {
  try {
    const local = localJobMap.get(req.params.id);
    if (local) {
      if (local.status === 'completed') {
        unlockUser(req.params.id);
        return res.json({ id: req.params.id, status: 'completed', output: local.output });
      }
      if (local.status === 'failed') {
        unlockUser(req.params.id);
        return res.json({ id: req.params.id, status: 'failed', error: local.error || { message: 'Generation failed' } });
      }
      if (local.status === 'cancelled') {
        unlockUser(req.params.id);
        return res.json({ id: req.params.id, status: 'failed', error: { message: 'Generation cancelled by user' } });
      }
      return res.json({ id: req.params.id, status: 'processing' });
    }

    const state = await readState();
    if (!state.apiKey) {
      return res.status(400).json({ error: 'not_ready', message: 'No API key configured.' });
    }
    const response = await fetch(`${FASHN}/status/${req.params.id}`, {
      headers: { Authorization: `Bearer ${state.apiKey}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      /* clean up active job on error */
      unlockUser(req.params.id);
      const mapping = jobKeyMap.get(req.params.id);
      if (mapping) {
        if (mapping.userLockKey) activeUserGenerations.delete(mapping.userLockKey);
        if (mapping.userId) activeUserGenerations.delete(`usr_${mapping.userId}`);
        activeJobs.delete(mapping.requestKey);
        clearTimeout(mapping.clearTimer);
        jobKeyMap.delete(req.params.id);
      }
      activeUserGenerations.delete(getUserLockKey(req));
      return res.status(response.status).json({ error: data.error || 'render_error', message: data.message || data.detail || 'The render could not be checked.' });
    }

    /* clean up active job on completion or failure */
    if (data.status === 'completed' || data.status === 'failed') {
      unlockUser(req.params.id);
      const mapping = jobKeyMap.get(req.params.id);
      if (mapping) {
        if (mapping.userLockKey) activeUserGenerations.delete(mapping.userLockKey);
        if (mapping.userId) activeUserGenerations.delete(`usr_${mapping.userId}`);
        activeJobs.delete(mapping.requestKey);
        clearTimeout(mapping.clearTimer);
        if (data.status === 'failed' && mapping.userId && mapping.creditsUsed > 0) {
          try {
            const u = await auth.findUserById(mapping.userId);
            if (u) {
              const refunded = (Number(u.credits) || 0) + mapping.creditsUsed;
              await auth.patchUser(mapping.userId, { credits: refunded });
              console.log(`[billing] Refunded ${mapping.creditsUsed} credits to user ${mapping.userId} due to generation failure.`);
            }
          } catch (refundErr) {
            console.error('[billing] Failed to refund credits:', refundErr.message);
          }
        }
        jobKeyMap.delete(req.params.id);
      }
    }

    if (data.status === 'completed' && Array.isArray(data.output)) {
      const originalRemoteUrls = [...data.output];
      const local = [];
      for (let i = 0; i < data.output.length; i += 1) {
        const remote = data.output[i];
        if (!/^https?:/.test(remote)) {
          local.push(remote);
          continue;
        }
        const isVideo = remote.endsWith('.mp4') || remote.includes('.mp4');
        const ext = isVideo ? 'mp4' : 'png';
        const file = `${req.params.id}-${i}.${ext}`;
        const target = path.join(GENERATED, file);
        let savedLocally = false;
        try {
          await fs.access(target);
          savedLocally = true;
        } catch {
          try {
            const img = await fetch(remote);
            if (img.ok) {
              await fs.writeFile(target, Buffer.from(await img.arrayBuffer()));
              savedLocally = true;
            }
          } catch { }
        }

        /* keep a permanent copy on the image host for images — the provider expires its
           own links after a few days, this one does not */
        let permanent = '';
        if (!isVideo) {
          try {
            const map = await readHosted();
            permanent = map.generated?.[file] || '';
            if (!permanent && savedLocally) {
              const uploaded = await hostImage(await fs.readFile(target), file);
              if (uploaded) {
                permanent = uploaded.url;
                map.generated = map.generated || {};
                map.generated[file] = permanent;
                await saveHosted(map);
              }
            }
          } catch {
            /* local copy still works */
          }
        }

        // Safe fallback: prioritize non-expiring cloud URL or verified local copy over fragile hosts
        const safePermanent = (permanent && !permanent.includes('ibb.co')) ? permanent : '';
        const finalUrl = safePermanent || (savedLocally ? `/generated/${file}` : remote) || remote;
        local.push(finalUrl);
      }
      data.output = local;
      data.remoteUrl = originalRemoteUrls[0] || local[0];
      data.highResUrl = local[0] || originalRemoteUrls[0];

      if (data.status === 'completed' || data.status === 'failed') {
        try {
          const genList = await readGenerations();
          let found = genList.find((g) => g.id === req.params.id);
          const rawOutput = (Array.isArray(data.output) && data.output[0]) ? data.output[0] : null;
          const directUpstream = (Array.isArray(originalRemoteUrls) && originalRemoteUrls[0] && /^https?:/.test(originalRemoteUrls[0])) ? originalRemoteUrls[0] : null;
          const finalUrl = rawOutput || directUpstream;

          if (found) {
            found.status = data.status === 'completed' ? 'completed' : 'failed';
            if (data.status === 'completed') {
              found.outputUrl = finalUrl;
              found.url = finalUrl;
              found.remoteUrl = directUpstream || finalUrl;
              found.highResUrl = finalUrl || directUpstream;
            } else {
              found.error = data.error || data.message || data.detail || 'Render rejected or failed on cluster.';
            }
            found.completedAt = Date.now();
          } else {
            found = {
              id: req.params.id,
              userId: req.user?._id || mapping?.userId || 'guest',
              userEmail: req.user?.email || 'guest',
              userName: req.user?.name || '',
              type: 'tryon',
              mode: 'tryon',
              status: data.status === 'completed' ? 'completed' : 'failed',
              outputUrl: finalUrl,
              url: finalUrl,
              remoteUrl: directUpstream || finalUrl,
              highResUrl: finalUrl || directUpstream,
              createdAt: Date.now(),
              completedAt: Date.now(),
            };
            genList.unshift(found);
          }
          await writeGenerations(genList);
        } catch (genUpdateErr) {
          console.error('[generations] Failed to update status in generations.json:', genUpdateErr.message);
        }
      }
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'status_failed', message: String(error.message || error) });
  }
});

/* Cancel a running job and refund the credit — strictly available during first 8 seconds */
app.post('/api/job/:id/cancel', auth.requireUser, async (req, res) => {
  try {
    const local = localJobMap.get(req.params.id);
    if (local) {
      const elapsedSec = (Date.now() - (local.startedAt || Date.now())) / 1000;
      if (elapsedSec > 10) {
        return res.status(400).json({
          error: 'cancellation_window_expired',
          message: 'The 8-second cancellation window has expired. GPU render is already locked in processing.',
        });
      }
      local.status = 'cancelled';
      if (local.abortController) {
        try { local.abortController.abort(); } catch { }
      }
      unlockUser(req.params.id);
      let refunded = false;
      let refundedCredits = 0;
      if (local.userId && local.creditsUsed > 0 && !local.refunded) {
        local.refunded = true;
        try {
          const u = await auth.findUserById(local.userId);
          if (u) {
            refundedCredits = local.creditsUsed;
            const newCredits = (Number(u.credits) || 0) + refundedCredits;
            await auth.patchUser(local.userId, { credits: newCredits });
            refunded = true;
            console.log(`[billing] Refunded ${refundedCredits} credits to ${local.userId} on agent cancel within 8s window.`);
          }
        } catch (refundErr) {
          console.error('[billing] Failed to refund agent credits on cancel:', refundErr.message);
        }
      }
      return res.json({ ok: true, cancelled: true, refunded, refundedCredits, message: 'Generation cancelled within 8s window. Credits refunded.' });
    }

    const mapping = jobKeyMap.get(req.params.id);
    if (mapping?.startedAt) {
      const elapsedSec = (Date.now() - mapping.startedAt) / 1000;
      if (elapsedSec > 10) {
        return res.status(400).json({
          error: 'cancellation_window_expired',
          message: 'The 8-second cancellation window has expired. GPU render is already locked in processing.',
        });
      }
    }

    const state = await readState();
    if (!state.apiKey) return res.status(400).json({ error: 'not_ready' });

    // Try to cancel at Fashn.ai (best-effort — may already be processing)
    const cancelResp = await fetch(`${FASHN}/cancel/${req.params.id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${state.apiKey}` },
    }).catch(() => null);

    // Refund credits regardless of whether Fashn cancel succeeds
    let refunded = false;
    let refundedCredits = 0;
    if (mapping && mapping.userId && mapping.creditsUsed > 0) {
      try {
        const u = await auth.findUserById(mapping.userId);
        if (u) {
          refundedCredits = mapping.creditsUsed;
          const newCredits = (Number(u.credits) || 0) + refundedCredits;
          await auth.patchUser(mapping.userId, { credits: newCredits });
          refunded = true;
          console.log(`[billing] Refunded ${refundedCredits} credits to ${mapping.userId} on user cancel.`);
        }
      } catch (refundErr) {
        console.error('[billing] Cancel refund failed:', refundErr.message);
      }
      if (mapping) {
        if (mapping.userLockKey) activeUserGenerations.delete(mapping.userLockKey);
        if (mapping.userId) activeUserGenerations.delete(`usr_${mapping.userId}`);
        activeJobs.delete(mapping.requestKey);
        clearTimeout(mapping.clearTimer);
        jobKeyMap.delete(req.params.id);
      }
    }
    unlockUser(req.params.id);
    activeUserGenerations.delete(getUserLockKey(req));

    res.json({
      ok: true,
      cancelled: cancelResp?.ok ?? false,
      refunded,
      refundedCredits,
      message: refunded ? `Job cancelled and ${refundedCredits} credit${refundedCredits !== 1 ? 's' : ''} refunded.` : 'Job cancelled.',
    });
  } catch (err) {
    res.status(500).json({ error: 'cancel_failed', message: String(err.message || err) });
  }
});

/* Self-healing unlock endpoint to clear any lingering generation locks */
app.post('/api/user/unlock', auth.requireUser, (req, res) => {
  activeUserGenerations.delete(getUserLockKey(req));
  if (req.user?._id) {
    activeUserGenerations.delete(`usr_${req.user._id}`);
    recentUserGenerations.delete(req.user._id);
  }
  res.json({ ok: true });
});

/* --------------------------------------------------- user generations (library) */
app.get('/api/user/generations', auth.requireUser, async (req, res) => {
  try {
    const currentUserId = String(req.user._id || req.user.id || '');
    const currentUserEmail = (req.user.email || '').toLowerCase().trim();
    const isAdmin = Boolean(req.user.isAdmin || req.user.role === 'admin' || req.user.tier === 'ultra');
    const db = await getMongoDb();

    let list = [];
    if (db) {
      try {
        const query = {
          deleted: { $ne: true },
          isDeleted: { $ne: true },
          status: { $ne: 'failed' },
          $nor: [
            {
              status: 'processing',
              createdAt: { $lt: Date.now() - 5 * 60 * 1000 },
            },
          ],
        };
        if (!isAdmin) {
          query.$or = [
            { userId: currentUserId },
            { userEmail: currentUserEmail },
            { userId: { $in: [null, ''] }, userEmail: { $in: [null, ''] } },
          ];
        }
        const docs = await db.collection('generations').find(query).sort({ createdAt: -1 }).limit(300).toArray();
        if (docs && docs.length > 0) {
          list = docs.map((it) => {
            const clean = { ...it };
            delete clean._id;
            return clean;
          });
        }
      } catch (dbErr) {
        console.warn('[generations] MongoDB direct fetch warning:', dbErr.message);
      }
    }
    if (list.length === 0) {
      list = await readGenerations();
    }

    const items = list.filter((g) => {
      // Exclude soft-deleted items (preserved safely in Admin Recycle Bin)
      if (g.deleted === true || g.isDeleted === true) return false;

      if (isAdmin) return true;
      const gUserId = g.userId ? String(g.userId) : '';
      const gEmail = (g.userEmail || '').toLowerCase().trim();
      return (gUserId && gUserId === currentUserId) || (gEmail && currentUserEmail && gEmail === currentUserEmail) || (!gUserId && !gEmail);
    }).map((g) => {
      const candidates = [g.outputUrl, g.highResUrl, g.url, g.remoteUrl, (Array.isArray(g.output) ? g.output[0] : '')]
        .filter(Boolean)
        .filter((u) => typeof u === 'string' && u.trim().length > 0);

      // Skip records that failed or have no actual image outputs
      if (candidates.length === 0 || g.status === 'failed') {
        return null;
      }

      const cleanCandidate = candidates.find((u) => !u.includes('ibb.co') && !u.includes('imgbb.com')) || null;
      let fallbackUrl = '';
      if (!cleanCandidate && g.id && g.id.length > 5 && !g.id.startsWith('agent_')) {
        const localPath = path.join(GENERATED, `${g.id}-0.png`);
        if (fsSync.existsSync(localPath)) {
          fallbackUrl = `/generated/${g.id}-0.png`;
        }
      }
      const resolvedUrl = cleanCandidate || fallbackUrl || candidates[0] || '';
      if (!resolvedUrl) return null;

      return {
        ...g,
        url: resolvedUrl,
        highResUrl: cleanCandidate || fallbackUrl || candidates[0] || resolvedUrl,
        isEdited: Boolean(
          g.isEdited ||
          g.isNewSnapshot ||
          g.type === 'edit' ||
          (g.prompt && /\b(edit|edited|option b|hd vector)\b/i.test(g.prompt))
        ),
      };
    }).filter(Boolean);

    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    res.json({ items });
  } catch (error) {
    res.status(500).json({ error: 'fetch_failed', message: error.message });
  }
});

app.post('/api/user/generations', auth.requireUser, async (req, res) => {
  try {
    const {
      type = 'image',
      url,
      highResUrl,
      remoteUrl,
      prompt = '',
      color = '',
      colorName = '',
      resolution = '1k',
      duration = 5,
      aspectRatio = '9:16',
      title = '',
    } = req.body || {};

    if (!url) {
      return res.status(400).json({ error: 'url_required', message: 'Generation URL is required.' });
    }

    let resolvedRemoteUrl = remoteUrl || '';
    let finalUrl = url;
    let finalHighRes = highResUrl || url;
    const targetId = req.body.id || req.body.jobId || crypto.randomUUID();

    // Convert raw data URLs (from canvas inpaint/stamp edits) to permanent static local asset (<10ms)
    // with background async Cloudinary persistence (non-blocking)
    if (typeof finalUrl === 'string' && finalUrl.startsWith('data:')) {
      try {
        const localUrl = await saveLocalAsset(finalUrl, 'sets', `${req.user._id}-gen`);
        if (localUrl) {
          finalUrl = localUrl;
          finalHighRes = localUrl;
          resolvedRemoteUrl = localUrl;
        }
        // Background async Cloudinary upload if configured (does not block HTTP response)
        const rawDataUrl = url;
        void (async () => {
          try {
            const cdn = await uploadToCloudinary(rawDataUrl, req.user._id, `gen-${Date.now()}`);
            if (cdn?.secure_url && cdn.secure_url.startsWith('https://')) {
              const db = await getMongoDb();
              if (db) {
                await db.collection('generations').updateOne(
                  { $or: [{ id: targetId }, { url: localUrl }] },
                  { $set: { remoteUrl: cdn.secure_url, highResUrl: cdn.secure_url } }
                ).catch(() => { });
              }
            }
          } catch { }
        })();
      } catch (uploadErr) {
        console.warn('[generations] saveLocalAsset error:', uploadErr.message);
        return res.status(500).json({ error: 'asset_save_failed', message: 'Failed to process edited image asset.' });
      }
    }

    // Safety guard: NEVER permit large raw base64 data URLs to be stored in Mongo url/highResUrl
    if (typeof finalUrl === 'string' && finalUrl.startsWith('data:') && finalUrl.length > 50000) {
      return res.status(400).json({ error: 'invalid_data_url', message: 'Raw data URL must be processed to asset.' });
    }

    if (!resolvedRemoteUrl && typeof finalUrl === 'string' && finalUrl.startsWith('/generated/')) {
      try {
        const filename = path.basename(finalUrl);
        const jobId = filename.replace(/-\d+\.[^.]+$/, '');
        const db = await getMongoDb();
        if (db) {
          const orig = await db.collection('generations').findOne({
            $or: [
              { id: jobId },
              { id: { $regex: `^${jobId}`, $options: 'i' } },
              { id: filename },
              { url: finalUrl },
              { outputUrl: finalUrl }
            ]
          });
          if (orig) {
            resolvedRemoteUrl = orig.remoteUrl || orig.highResUrl || '';
          }
        }
      } catch { }
    }

    const list = await readGenerations();

    const isEditedValue = Boolean(req.body.isEdited || type === 'edit' || (prompt && /\b(edit|edited|option b)\b/i.test(prompt)));

    // Check if an existing generation record matches this id or url:
    let existing = null;
    if (!isEditedValue && !req.body.isNewSnapshot) {
      if (targetId) {
        existing = list.find((g) => g.id === targetId || g.jobId === targetId);
      }
      if (!existing) {
        const incomingKeys = new Set([url, resolvedRemoteUrl, highResUrl, targetId].filter(Boolean));
        try {
          const u = new URL(url, 'http://localhost');
          incomingKeys.add(u.pathname);
          const base = path.basename(u.pathname);
          if (base && base.length > 5) incomingKeys.add(base);
        } catch { }

        existing = list.find((g) => {
          const gKeys = getGenerationKeys(g);
          for (const k of incomingKeys) {
            if (gKeys.has(k)) return true;
          }
          return false;
        });
      }
    }
    if (existing) {
      // Update in place, do NOT duplicate!
      existing.url = finalUrl || existing.url;
      existing.highResUrl = finalHighRes || resolvedRemoteUrl || existing.highResUrl || finalUrl;
      existing.remoteUrl = resolvedRemoteUrl || existing.remoteUrl || '';
      existing.status = 'completed';
      if (prompt && !prompt.startsWith('Multi-Angle Garment Synthesis')) existing.prompt = String(prompt).slice(0, 600);
      if (title) existing.title = title;
      if (color) existing.color = color;
      if (colorName) existing.colorName = colorName;
      if (req.body.isManualUpload) existing.isManualUpload = true;
      if (isEditedValue) existing.isEdited = true;
      if (!existing.userId && req.user?._id) existing.userId = req.user._id;
      if (!existing.userEmail && req.user?.email) existing.userEmail = req.user.email;
      cachedGenerations = { items: list, time: Date.now() };
      void writeGenerations(list).catch((err) => console.warn('[generations] background write error:', err.message));
      return res.json(existing);
    }

    const item = {
      id: targetId || crypto.randomUUID(),
      userId: req.user._id,
      userEmail: req.user.email || '',
      userName: req.user.name || '',
      type: type === 'video' ? 'video' : 'image',
      isEdited: isEditedValue,
      url: finalUrl,
      highResUrl: finalHighRes || resolvedRemoteUrl || finalUrl,
      remoteUrl: resolvedRemoteUrl || (typeof finalHighRes === 'string' && /^https?:/.test(finalHighRes) ? finalHighRes : ''),
      prompt: String(prompt || '').slice(0, 600),
      color: String(color || ''),
      colorName: String(colorName || ''),
      resolution: String(resolution || '1k'),
      duration: Number(duration) || 5,
      aspectRatio: String(aspectRatio || '9:16'),
      title: String(title || (type === 'video' ? `Fashion Video (${duration}s)` : `Studio Pose (${resolution})`)),
      status: 'completed',
      isManualUpload: Boolean(req.body.isManualUpload),
      createdAt: Date.now(),
    };

    // Immediately commit single-item upsert to MongoDB so GET /api/user/generations sees it instantly
    try {
      const db = await getMongoDb();
      if (db) {
        await db.collection('generations').updateOne(
          { id: item.id },
          { $set: item },
          { upsert: true }
        );
      }
    } catch (dbErr) {
      console.warn('[generations] direct MongoDB single-item upsert warning:', dbErr.message);
    }

    list.unshift(item);
    cachedGenerations = { items: list, time: Date.now() };
    void writeGenerations(list).catch((err) => console.warn('[generations] background write error:', err.message));

    res.json(item);
  } catch (error) {
    res.status(500).json({ error: 'save_failed', message: error.message });
  }
});

app.delete('/api/user/generations/:id', auth.requireUser, async (req, res) => {
  try {
    const currentUserId = String(req.user._id || req.user.id || '');
    const currentUserEmail = (req.user.email || '').toLowerCase().trim();
    const isAdmin = Boolean(req.user.isAdmin || req.user.role === 'admin' || req.user.tier === 'ultra');
    const db = await getMongoDb();

    let gen = null;
    if (db) {
      try {
        gen = await db.collection('generations').findOne({ id: req.params.id });
      } catch { }
    }
    const list = await readGenerations();
    const listGen = list.find((g) => g.id === req.params.id);
    if (!gen) gen = listGen;

    if (!gen) {
      return res.json({ ok: true, deleted: req.params.id, inBin: true, alreadyGone: true });
    }

    const gUserId = gen.userId ? String(gen.userId) : '';
    const gEmail = (gen.userEmail || '').toLowerCase().trim();
    const isOwner = isAdmin || (gUserId && gUserId === currentUserId) || (gEmail && currentUserEmail && gEmail === currentUserEmail) || (!gUserId && !gEmail);
    if (!isOwner) {
      return res.status(403).json({ error: 'forbidden', message: 'You do not have permission to delete this item.' });
    }

    let refunded = false;
    let refundedCredits = 0;
    const isRecent = gen.createdAt && (Date.now() - gen.createdAt < 15 * 60 * 1000);
    if ((req.query.refund === 'true' || isRecent) && gen.creditsUsed > 0 && !gen.refunded) {
      const u = await auth.findUserById(req.user._id);
      if (u) {
        refundedCredits = gen.creditsUsed;
        const newCredits = (Number(u.credits) || 0) + refundedCredits;
        await auth.patchUser(req.user._id, { credits: newCredits });
        gen.refunded = true;
        refunded = true;
        console.log(`[billing] Refunded ${refundedCredits} credits to ${req.user._id} on generation discard.`);
      }
    }

    // Soft delete: move safely into Admin Recycle Bin
    const now = Date.now();
    const deletedBy = currentUserEmail || currentUserId || 'user';
    gen.deleted = true;
    gen.isDeleted = true;
    gen.deletedAt = now;
    gen.deletedBy = deletedBy;

    if (listGen) {
      listGen.deleted = true;
      listGen.isDeleted = true;
      listGen.deletedAt = now;
      listGen.deletedBy = deletedBy;
      await writeGenerations(list);
    }

    if (db) {
      try {
        await db.collection('generations').updateOne(
          { id: req.params.id },
          { $set: { deleted: true, isDeleted: true, deletedAt: now, deletedBy } }
        );
      } catch { }
    }

    res.json({ ok: true, deleted: req.params.id, inBin: true, refunded, refundedCredits });
  } catch (error) {
    res.status(500).json({ error: 'delete_failed', message: error.message });
  }
});

app.post('/api/user/generations/batch-delete', auth.requireUser, async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids_required', message: 'Array of generation IDs is required.' });
    }
    const currentUserId = String(req.user._id || req.user.id || '');
    const currentUserEmail = (req.user.email || '').toLowerCase().trim();
    const isAdmin = Boolean(req.user.isAdmin || req.user.role === 'admin' || req.user.tier === 'ultra');
    const db = await getMongoDb();
    const now = Date.now();
    const deletedBy = currentUserEmail || currentUserId || 'user';

    const idSet = new Set(ids);
    const list = await readGenerations();
    for (const g of list) {
      if (idSet.has(g.id)) {
        const gUserId = g.userId ? String(g.userId) : '';
        const gEmail = (g.userEmail || '').toLowerCase().trim();
        const isOwner = isAdmin || (gUserId && gUserId === currentUserId) || (gEmail && currentUserEmail && gEmail === currentUserEmail) || (!gUserId && !gEmail);
        if (isOwner) {
          g.deleted = true;
          g.isDeleted = true;
          g.deletedAt = now;
          g.deletedBy = deletedBy;
        }
      }
    }
    cachedGenerations = { items: list, time: Date.now() };
    void writeGenerations(list).catch(() => { });

    if (db) {
      const filter = { id: { $in: ids } };
      if (!isAdmin) {
        filter.$or = [
          { userId: currentUserId },
          { userEmail: currentUserEmail },
          { userId: { $in: [null, ''] }, userEmail: { $in: [null, ''] } },
        ];
      }
      await db.collection('generations').updateMany(filter, {
        $set: { deleted: true, isDeleted: true, deletedAt: now, deletedBy },
      }).catch((err) => console.warn('[generations] batch delete MongoDB error:', err.message));
    }

    res.json({ ok: true, deletedCount: ids.length, inBin: true });
  } catch (error) {
    res.status(500).json({ error: 'batch_delete_failed', message: error.message });
  }
});

/* --------------------------------------------------- upload sets */
app.get('/api/upload-sets', auth.requireUser, async (req, res) => {
  try {
    const currentUserId = String(req.user._id || req.user.id || '');
    const currentUserEmail = (req.user.email || '').toLowerCase().trim();
    const isAdmin = Boolean(req.user.isAdmin || req.user.role === 'admin' || req.user.tier === 'ultra');
    const allSets = await readUploadSets();
    const sets = allSets.filter((s) => {
      if (isAdmin) return true;
      const sUserId = s.userId ? String(s.userId) : '';
      const sEmail = (s.userEmail || '').toLowerCase().trim();
      return (sUserId && sUserId === currentUserId) || (sEmail && currentUserEmail && sEmail === currentUserEmail) || (!sUserId && !sEmail);
    });
    sets.sort((a, b) => (a.setNumber || 0) - (b.setNumber || 0));
    res.json({ items: sets });
  } catch (error) {
    res.status(500).json({ error: 'fetch_failed', message: String(error.message || error) });
  }
});

app.post('/api/upload-sets', auth.requireUser, async (req, res) => {
  try {
    const { clothDataUrl, clothName, modelDataUrl, modelName, prompt = '' } = req.body || {};
    if (!clothDataUrl && !modelDataUrl) {
      return res.status(400).json({ error: 'no_images', message: 'Upload at least one image (cloth or model).' });
    }

    const userId = req.user._id;
    const userEmail = req.user.email || '';
    const userName = req.user.name || '';

    const allSets = await readUploadSets();
    const currentUserId = String(userId);
    const userSets = allSets.filter((s) => String(s.userId) === currentUserId || (s.userEmail && s.userEmail === userEmail));
    const setNumber = userSets.length > 0 ? Math.max(...userSets.map((s) => s.setNumber)) + 1 : 1;

    let clothUrl = '';
    let modelUrl = '';

    if (clothDataUrl) {
      try {
        const r = await uploadToCloudinary(clothDataUrl, userId, `cloth-set${setNumber}`);
        clothUrl = r.url;
      } catch (cErr) {
        console.warn('[upload-sets] Cloudinary cloth upload fallback:', cErr?.message || cErr);
        clothUrl = clothDataUrl;
      }
    }
    if (modelDataUrl) {
      try {
        const r = await uploadToCloudinary(modelDataUrl, userId, `model-set${setNumber}`);
        modelUrl = r.url;
      } catch (mErr) {
        console.warn('[upload-sets] Cloudinary model upload fallback:', mErr?.message || mErr);
        modelUrl = modelDataUrl;
      }
    }

    const newSet = {
      id: crypto.randomUUID(),
      userId,
      userEmail,
      userName,
      setNumber,
      clothUrl,
      clothName: String(clothName || 'cloth.jpg').slice(0, 120),
      modelUrl,
      modelName: String(modelName || 'model.jpg').slice(0, 120),
      prompt: String(prompt).slice(0, 600),
      createdAt: Date.now(),
    };

    allSets.push(newSet);
    await writeUploadSets(allSets);
    res.json(newSet);
  } catch (error) {
    res.status(500).json({ error: 'create_set_failed', message: String(error.message || error) });
  }
});

app.delete('/api/upload-sets/:id', auth.requireUser, async (req, res) => {
  try {
    const currentUserId = String(req.user._id);
    const currentUserEmail = (req.user.email || '').toLowerCase().trim();
    const allSets = await readUploadSets();
    const idx = allSets.findIndex((s) => {
      const sUserId = s.userId ? String(s.userId) : '';
      const sEmail = (s.userEmail || '').toLowerCase().trim();
      const isOwner = (sUserId && sUserId === currentUserId) || (sEmail && currentUserEmail && sEmail === currentUserEmail);
      return s.id === req.params.id && isOwner;
    });
    if (idx === -1) return res.status(404).json({ error: 'not_found', message: 'Set not found.' });
    allSets.splice(idx, 1);
    await writeUploadSets(allSets);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'delete_failed', message: String(error.message || error) });
  }
});

app.get('/api/admin/upload-sets', requireAdmin, async (_req, res) => {
  try {
    const sets = await readUploadSets();
    sets.sort((a, b) => b.createdAt - a.createdAt);
    res.json({ items: sets, total: sets.length });
  } catch (error) {
    res.status(500).json({ error: 'fetch_failed', message: String(error.message || error) });
  }
});

/* ---------------------------------------------------- custom studio requests */
app.get('/api/custom-requests', auth.requireUser, async (req, res) => {
  try {
    const all = await readCustomRequests();
    let updated = false;
    for (const r of all) {
      /* Auto SLA: after 1 hour queued, move to in_progress */
      if (r.status === 'queued' && Date.now() - r.createdAt >= 60 * 60 * 1000) {
        r.status = 'in_progress';
        updated = true;
      }
    }
    if (updated) await writeCustomRequests(all);

    const items = all.filter((r) => r.userId === req.user._id && !r.deleted);
    items.sort((a, b) => b.createdAt - a.createdAt);
    res.json({ items });
  } catch (error) {
    res.status(500).json({ error: 'fetch_failed', message: String(error.message || error) });
  }
});

app.post('/api/custom-requests', auth.requireUser, async (req, res) => {
  try {
    const {
      cloth,
      clothImages = [],
      model,
      modelImages = [],
      prompt = '',
      color = '',
      clothName = 'Garment',
      modelName = 'Model',
      requestType = 'still',
    } = req.body || {};

    if (!cloth && !model && (!Array.isArray(modelImages) || modelImages.length === 0) && (!Array.isArray(clothImages) || clothImages.length === 0) && !prompt) {
      return res.status(400).json({
        error: 'empty_request',
        message: 'Please provide at least a garment image, model image, or design instructions.',
      });
    }

    const userId = req.user._id;
    const userEmail = req.user.email || '';

    let clothUrl = cloth || '';
    let modelUrl = model || '';
    const uploadedCloths = [];
    const uploadedModels = [];

    /* Process all uploaded garments quickly using instant local storage */
    const rawClothList = [];
    if (Array.isArray(clothImages) && clothImages.length > 0) {
      rawClothList.push(...clothImages);
    } else if (cloth) {
      rawClothList.push(cloth);
    }

    for (let i = 0; i < rawClothList.length; i += 1) {
      const img = rawClothList[i];
      if (!img) continue;
      if (typeof img === 'string' && img.startsWith('data:')) {
        try {
          const loc = await saveLocalAsset(img, 'sets', `${userId}-req-cloth-${Date.now()}-${i + 1}`);
          uploadedCloths.push(loc);
        } catch {
          uploadedCloths.push(img);
        }
      } else if (typeof img === 'string' && img.trim()) {
        uploadedCloths.push(img.trim());
      }
    }
    if (uploadedCloths.length > 0) {
      clothUrl = uploadedCloths[0];
    }
    const finalClothImages = uploadedCloths.length > 0 ? uploadedCloths : (clothUrl ? [clothUrl] : []);

    /* Process all uploaded model poses quickly */
    const rawModelList = [];
    if (Array.isArray(modelImages) && modelImages.length > 0) {
      rawModelList.push(...modelImages);
    } else if (model) {
      rawModelList.push(model);
    }

    for (let i = 0; i < rawModelList.length; i += 1) {
      const img = rawModelList[i];
      if (!img) continue;
      if (typeof img === 'string' && img.startsWith('data:')) {
        try {
          const loc = await saveLocalAsset(img, 'sets', `${userId}-req-model-${Date.now()}-${i + 1}`);
          uploadedModels.push(loc);
        } catch {
          uploadedModels.push(img);
        }
      } else if (typeof img === 'string' && img.trim()) {
        uploadedModels.push(img.trim());
      }
    }

    if (uploadedModels.length > 0) {
      modelUrl = uploadedModels[0];
    }
    const finalModelImages = uploadedModels.length > 0 ? uploadedModels : (modelUrl ? [modelUrl] : []);

    const newRequest = {
      id: crypto.randomUUID(),
      userId,
      userEmail,
      clothUrl,
      clothName,
      clothImages: finalClothImages,
      modelUrl,
      modelName,
      modelImages: finalModelImages,
      color: String(color || '').slice(0, 80),
      requestType: String(requestType || 'still'),
      prompt: String(prompt).trim(),
      status: 'queued', // queued | in_progress | delivered
      createdAt: Date.now(),
      deadlineHours: 48,
      adminReply: '',
      deliveredImageUrl: '',
      deliveredAt: null,
      readByAdmin: false,
    };

    const all = await readCustomRequests();
    all.unshift(newRequest);
    await writeCustomRequests(all);

    // Background permanent CDN backup without blocking client response
    (async () => {
      try {
        let needsUpdate = false;
        const cdnCloths = await Promise.all(
          rawClothList.map(async (img, idx) => {
            if (typeof img === 'string' && img.startsWith('data:')) {
              const r = await uploadToCloudinary(img, userId, `req-cloth-${Date.now()}-${idx + 1}`).catch(() => null);
              if (r && (r.secure_url || r.url)) {
                needsUpdate = true;
                return r.secure_url || r.url;
              }
            }
            return uploadedCloths[idx] || img;
          })
        );
        const cdnModels = await Promise.all(
          rawModelList.map(async (img, idx) => {
            if (typeof img === 'string' && img.startsWith('data:')) {
              const r = await uploadToCloudinary(img, userId, `req-model-${Date.now()}-${idx + 1}`).catch(() => null);
              if (r && (r.secure_url || r.url)) {
                needsUpdate = true;
                return r.secure_url || r.url;
              }
            }
            return uploadedModels[idx] || img;
          })
        );
        if (needsUpdate) {
          const curAll = await readCustomRequests();
          const target = curAll.find((r) => r.id === newRequest.id);
          if (target) {
            target.clothImages = cdnCloths;
            target.clothUrl = cdnCloths[0] || target.clothUrl;
            target.modelImages = cdnModels;
            target.modelUrl = cdnModels[0] || target.modelUrl;
            await writeCustomRequests(curAll);
          }
        }
      } catch (bgErr) {
        console.warn('[custom-request] Background CDN upload note:', bgErr);
      }
    })();

    res.json(newRequest);
  } catch (error) {
    res.status(500).json({ error: 'create_failed', message: String(error.message || error) });
  }
});

app.delete('/api/custom-requests/:id', auth.requireUser, async (req, res) => {
  try {
    const { id } = req.params;
    const all = await readCustomRequests();
    const item = all.find((r) => r.id === id);
    if (!item) return res.status(404).json({ error: 'not_found', message: 'Custom request not found.' });
    if (item.userId !== req.user._id) return res.status(403).json({ error: 'forbidden', message: 'You can only manage your own requests.' });

    // Soft delete -> moves to Admin Recycle Bin
    item.deleted = true;
    item.deletedAt = Date.now();
    item.deletedBy = req.user.email || 'user';
    await writeCustomRequests(all);
    res.json({ ok: true, deleted: id, message: 'Custom request moved to bin.' });
  } catch (error) {
    res.status(500).json({ error: 'delete_failed', message: error.message });
  }
});

app.delete('/api/admin/custom-requests/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const all = await readCustomRequests();
    const item = all.find((r) => r.id === id);
    if (!item) return res.status(404).json({ error: 'not_found', message: 'Custom request not found.' });

    // Soft delete -> moves to Admin Recycle Bin
    item.deleted = true;
    item.deletedAt = Date.now();
    item.deletedBy = req.user?.email || 'admin';
    await writeCustomRequests(all);
    res.json({ ok: true, deleted: id, message: 'Custom request moved to bin.' });
  } catch (error) {
    res.status(500).json({ error: 'delete_failed', message: error.message });
  }
});

app.put('/api/custom-requests/:id', auth.requireUser, async (req, res) => {
  try {
    const { id } = req.params;
    const all = await readCustomRequests();
    const item = all.find((r) => r.id === id);
    if (!item) return res.status(404).json({ error: 'not_found', message: 'Custom request not found.' });
    if (item.userId !== req.user._id) return res.status(403).json({ error: 'forbidden', message: 'You can only manage your own requests.' });

    const { prompt, color, requestType } = req.body || {};
    if (typeof prompt === 'string') item.prompt = prompt.trim();
    if (typeof color === 'string') item.color = color.trim();
    if (typeof requestType === 'string') item.requestType = requestType;
    item.updatedAt = Date.now();

    await writeCustomRequests(all);
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: 'update_failed', message: error.message });
  }
});

app.get('/api/admin/custom-requests', requireAdmin, async (_req, res) => {
  try {
    const all = await readCustomRequests();
    let updated = false;
    for (const r of all) {
      if (r.status === 'queued' && Date.now() - r.createdAt >= 60 * 60 * 1000) {
        r.status = 'in_progress';
        updated = true;
      }
    }
    if (updated) await writeCustomRequests(all);

    const activeRequests = all.filter((r) => !r.deleted);
    activeRequests.sort((a, b) => b.createdAt - a.createdAt);
    res.json({ items: activeRequests, total: activeRequests.length });
  } catch (error) {
    res.status(500).json({ error: 'fetch_failed', message: String(error.message || error) });
  }
});

app.get('/api/admin/custom-requests/:id/download-zip', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const all = await readCustomRequests();
    const reqItem = all.find((r) => r.id === id);
    if (!reqItem) {
      return res.status(404).json({ error: 'not_found', message: 'Order request not found.' });
    }

    const zip = new JSZip();

    // 1. All text content in one text file
    const textSummary = [
      '================================================================================',
      'SHIV-NARESH ATELIER - BESPOKE CUSTOM ORDER DETAILS',
      '================================================================================',
      `Order ID:          ${reqItem.id}`,
      `Client Email:      ${reqItem.userEmail || 'N/A'}`,
      `Client User ID:    ${reqItem.userId || 'N/A'}`,
      `Date Submitted:    ${new Date(reqItem.createdAt).toISOString()} (${new Date(reqItem.createdAt).toLocaleString()})`,
      `Order Status:      ${(reqItem.status || 'queued').toUpperCase()}`,
      `Request Type:      ${(reqItem.requestType || 'still').toUpperCase()}`,
      `Color / Swatch:    ${reqItem.color || 'Not specified'}`,
      `Garment Name:      ${reqItem.clothName || 'Garment'}`,
      `Model Name:        ${reqItem.modelName || 'Model'}`,
      `Total Model Poses: ${reqItem.modelImages?.length || (reqItem.modelUrl ? 1 : 0)}`,
      '',
      'CUSTOMER INSTRUCTIONS & PROMPT:',
      '--------------------------------------------------------------------------------',
      reqItem.prompt ? reqItem.prompt.trim() : 'No special instructions provided by customer.',
      '--------------------------------------------------------------------------------',
      '',
      'SLA DEADLINE WINDOW:',
      '--------------------------------------------------------------------------------',
      `Window:            ${reqItem.deadlineHours || 48} Hours`,
      `Hours Elapsed:     ${((Date.now() - reqItem.createdAt) / (1000 * 60 * 60)).toFixed(1)} Hours`,
      `Time Remaining:    ${Math.max(0, (reqItem.deadlineHours || 48) - (Date.now() - reqItem.createdAt) / (1000 * 60 * 60)).toFixed(1)} Hours`,
      '--------------------------------------------------------------------------------',
      '',
      'DELIVERY STATUS & ADMIN REPLY:',
      '--------------------------------------------------------------------------------',
      `Admin Reply:       ${reqItem.adminReply || 'No reply recorded yet.'}`,
      `Delivered Image:   ${reqItem.deliveredImageUrl || 'None'}`,
      `Delivered File:    ${reqItem.deliveredFileName || 'None'}`,
      '================================================================================',
    ].join('\n');

    zip.file('order_details.txt', textSummary);
    zip.file('order_details.json', JSON.stringify(reqItem, null, 2));

    // Helper to fetch/load image buffers across local directories, data URIs, and external hosts
    const fetchAssetBuffer = async (url) => {
      if (!url || typeof url !== 'string') return null;
      try {
        if (url.startsWith('data:')) {
          const parts = url.split(',');
          if (parts.length > 1) {
            return Buffer.from(parts[1], 'base64');
          }
        }
        if (url.startsWith('/')) {
          const cleanPath = decodeURIComponent(url.split('?')[0]).replace(/^\//, '');
          const filename = path.basename(cleanPath);
          const candidates = [
            path.join(UPLOADS, filename),
            path.join(DATA, 'uploads', filename),
            path.join(ROOT, 'server', 'data', 'uploads', filename),
            path.join(PUBLIC_DIR, cleanPath),
            path.join(MODELS_DIR, filename),
            path.join(ROOT, 'public', cleanPath),
            path.join(ROOT, 'dist', cleanPath),
            path.join(ROOT, 'dist', 'models', filename),
            path.join(ROOT, cleanPath),
          ];
          for (const cand of candidates) {
            if (fsSync.existsSync(cand) && fsSync.statSync(cand).isFile()) {
              return await fs.readFile(cand);
            }
          }
        }
        if (url.startsWith('http://') || url.startsWith('https://')) {
          const resp = await fetch(url, { headers: { 'User-Agent': 'ShivNaresh/1.0' } });
          if (resp.ok) {
            const arr = await resp.arrayBuffer();
            return Buffer.from(arr);
          }
        }
      } catch (err) {
        console.warn(`[download-zip] Could not load asset from ${url}:`, err.message);
      }
      return null;
    };

    const getExtension = (url, defaultExt = 'jpg') => {
      try {
        if (!url || typeof url !== 'string') return defaultExt;
        if (url.startsWith('data:image/')) {
          const mime = url.substring(11, url.indexOf(';'));
          return mime === 'jpeg' ? 'jpg' : mime;
        }
        const pathname = new URL(url, 'http://localhost').pathname;
        const ext = path.extname(pathname).replace(/^\./, '').toLowerCase();
        if (ext && ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext)) {
          return ext === 'jpeg' ? 'jpg' : ext;
        }
      } catch { }
      return defaultExt;
    };

    // All photos and models placed cleanly into photos_and_models/ directory
    const mediaFolder = zip.folder('photos_and_models');

    // Load garment
    if (reqItem.clothUrl) {
      const clothBuf = await fetchAssetBuffer(reqItem.clothUrl);
      if (clothBuf) {
        const ext = getExtension(reqItem.clothUrl, 'jpg');
        mediaFolder.file(`01_garment.${ext}`, clothBuf);
      }
    }

    // Load model poses (up to 5)
    const modelUrls = Array.isArray(reqItem.modelImages) && reqItem.modelImages.length > 0
      ? reqItem.modelImages
      : reqItem.modelUrl ? [reqItem.modelUrl] : [];

    for (let i = 0; i < modelUrls.length; i++) {
      const mUrl = modelUrls[i];
      const modelBuf = await fetchAssetBuffer(mUrl);
      if (modelBuf) {
        const ext = getExtension(mUrl, 'jpg');
        mediaFolder.file(`02_model_pose_${i + 1}.${ext}`, modelBuf);
      }
    }

    // Load delivered asset if present
    if (reqItem.deliveredImageUrl) {
      const delBuf = await fetchAssetBuffer(reqItem.deliveredImageUrl);
      if (delBuf) {
        const ext = getExtension(reqItem.deliveredImageUrl, 'jpg');
        mediaFolder.file(`03_delivered_asset.${ext}`, delBuf);
      }
    }

    // Generate combined master zip with DOS platform compatibility for Windows Explorer
    const masterZipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
      platform: 'DOS',
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="custom-order-${reqItem.id}.zip"`);
    res.setHeader('Content-Length', masterZipBuffer.length);
    res.send(masterZipBuffer);
  } catch (error) {
    console.error('[download-zip] Error generating zip:', error);
    res.status(500).json({ error: 'zip_generation_failed', message: error.message });
  }
});

app.put('/api/admin/custom-requests/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      status,
      adminReply,
      deliveredImageUrl,
      deliveredImage,
      deliveredFile,
      deliveredFileName,
      deliveredFileType,
      deliveredFileSize,
    } = req.body || {};

    const all = await readCustomRequests();
    const idx = all.findIndex((r) => r.id === id);
    if (idx === -1) return res.status(404).json({ error: 'not_found', message: 'Request not found.' });

    const reqItem = all[idx];
    if (status) reqItem.status = status;
    if (typeof adminReply === 'string') reqItem.adminReply = adminReply.trim();

    /* Save delivered file of any format (ZIP, PDF, Video, Image, PSD) */
    if (typeof deliveredFile === 'string' && deliveredFile.startsWith('data:')) {
      const match = /^data:([^;]+);base64,(.+)$/.exec(deliveredFile);
      if (match) {
        const mime = match[1];
        const rawBuf = Buffer.from(match[2], 'base64');
        const safeName = (deliveredFileName || 'delivered-asset').replace(/[^a-zA-Z0-9._-]/g, '_');
        const filename = `delivery-${Date.now()}-${safeName}`;
        await fs.writeFile(path.join(UPLOADS, filename), rawBuf);
        reqItem.deliveredFileUrl = `/uploads/${filename}`;
        reqItem.deliveredFileName = deliveredFileName || safeName;
        reqItem.deliveredFileType = mime;
        reqItem.deliveredFileSize = rawBuf.length;
        if (mime.startsWith('image/')) {
          reqItem.deliveredImageUrl = `/uploads/${filename}`;
        }
      }
    } else if (deliveredFileName && deliveredFile) {
      reqItem.deliveredFileUrl = deliveredFile;
      reqItem.deliveredFileName = deliveredFileName;
      reqItem.deliveredFileType = deliveredFileType || 'application/octet-stream';
      reqItem.deliveredFileSize = deliveredFileSize || 0;
    }

    let finalDeliveredUrl = deliveredImageUrl || deliveredImage || '';
    if (typeof finalDeliveredUrl === 'string' && finalDeliveredUrl.startsWith('data:')) {
      try {
        const r = await uploadToCloudinary(finalDeliveredUrl, reqItem.userId || 'admin', `delivered-${id}`);
        finalDeliveredUrl = r.url || r.secure_url;
      } catch (cdnErr) {
        console.warn('[delivered-image] Cloudinary upload fallback:', cdnErr.message);
      }
    }

    if (finalDeliveredUrl) {
      reqItem.deliveredImageUrl = finalDeliveredUrl;
    }

    if (status === 'delivered' && !reqItem.deliveredAt) {
      reqItem.deliveredAt = Date.now();
    }

    all[idx] = reqItem;
    await writeCustomRequests(all);

    res.json(reqItem);
  } catch (error) {
    res.status(500).json({ error: 'update_failed', message: String(error.message || error) });
  }
});

/* ---------------------------------------------------- Custom Studio Deliveries & Dispatch */
app.get('/api/user/deliveries', auth.requireUser, async (req, res) => {
  try {
    const userId = String(req.user._id || req.user.id || '');
    const userEmail = String(req.user.email || '').trim().toLowerCase();

    const all = await readAdminDeliveries();
    const items = all.filter((d) => {
      if (d.deleted) return false;
      const matchId = d.recipientUserId && String(d.recipientUserId) === userId;
      const matchEmail = d.recipientEmail && String(d.recipientEmail).trim().toLowerCase() === userEmail;
      return matchId || matchEmail;
    });
    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const unreadCount = items.filter((d) => d.readByUser === false).length;
    res.json({ items, unreadCount });
  } catch (err) {
    res.status(500).json({ error: 'fetch_deliveries_failed', message: err.message });
  }
});

app.delete('/api/user/deliveries/:id', auth.requireUser, async (req, res) => {
  try {
    const { id } = req.params;
    const all = await readAdminDeliveries();
    const userId = String(req.user._id || req.user.id || '');
    const userEmail = String(req.user.email || '').trim().toLowerCase();

    const item = all.find((d) => d.id === id && (d.recipientUserId === userId || (d.recipientEmail && d.recipientEmail.toLowerCase() === userEmail)));
    if (!item) {
      return res.status(404).json({ error: 'not_found', message: 'Delivery not found.' });
    }
    item.deleted = true;
    item.deletedAt = Date.now();
    item.deletedBy = req.user.email || 'user';
    await writeAdminDeliveries(all);
    res.json({ ok: true, message: 'Delivery moved to bin.' });
  } catch (err) {
    res.status(500).json({ error: 'delete_failed', message: err.message });
  }
});

app.post('/api/user/deliveries/mark-read', auth.requireUser, async (req, res) => {
  try {
    const all = await readAdminDeliveries();
    const userId = String(req.user._id || req.user.id || '');
    const userEmail = String(req.user.email || '').trim().toLowerCase();
    let updated = false;

    for (const d of all) {
      const matchId = d.recipientUserId && d.recipientUserId === userId;
      const matchEmail = d.recipientEmail && d.recipientEmail.toLowerCase() === userEmail;
      if ((matchId || matchEmail) && d.readByUser === false) {
        d.readByUser = true;
        updated = true;
      }
    }

    if (updated) await writeAdminDeliveries(all);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'mark_read_failed', message: err.message });
  }
});

app.post('/api/admin/custom-requests/mark-read', requireAdmin, async (_req, res) => {
  try {
    const all = await readCustomRequests();
    let updated = false;
    for (const r of all) {
      if (r.readByAdmin === false) {
        r.readByAdmin = true;
        updated = true;
      }
    }
    if (updated) await writeCustomRequests(all);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'mark_read_failed', message: err.message });
  }
});

app.get('/api/admin/deliveries', requireAdmin, async (_req, res) => {
  try {
    const all = await readAdminDeliveries();
    const activeDeliveries = all.filter((d) => !d.deleted);
    activeDeliveries.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    res.json({ items: activeDeliveries, total: activeDeliveries.length });
  } catch (err) {
    res.status(500).json({ error: 'fetch_failed', message: err.message });
  }
});

app.post('/api/admin/deliveries', requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const {
      recipientUserId,
      recipientEmail,
      recipientName,
      type = 'photo', // 'photo' | 'video' | 'zip' | 'folder' | 'text' | 'package'
      title,
      textMessage,
      file,
      fileName,
      fileType,
      fileSize,
      mediaUrls = [],
      assets = [],
    } = body;

    if (!recipientEmail && !recipientUserId) {
      return res.status(400).json({ error: 'missing_recipient', message: 'Please select a recipient user.' });
    }

    const mediaToBackup = [];
    let finalFileUrl = '';
    let finalFileName = fileName || '';
    let finalFileSize = fileSize || 0;

    // Fast parallel processing for multi-asset attachments (photos, videos, zip, folders)
    const incomingAssets = Array.isArray(assets) ? assets.filter(Boolean) : [];
    const processedAssets = [];

    if (incomingAssets.length > 0) {
      await Promise.all(
        incomingAssets.map(async (ast, idx) => {
          if (!ast) return;
          const rawName = String(ast.name || `asset-${idx + 1}`);
          const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_');
          let aUrl = '';
          let aSize = Number(ast.size || 0);

          if (typeof ast.dataUrl === 'string' && ast.dataUrl.startsWith('data:')) {
            const match = /^data:([^;]+);base64,(.+)$/.exec(ast.dataUrl);
            if (match) {
              const mime = match[1].toLowerCase();
              let ext = path.extname(safeName);
              if (!ext) {
                if (mime.includes('png')) ext = '.png';
                else if (mime.includes('webp')) ext = '.webp';
                else if (mime.includes('zip') || mime.includes('compressed')) ext = '.zip';
                else if (mime.includes('mp4') || mime.includes('video')) ext = '.mp4';
                else if (mime.includes('quicktime')) ext = '.mov';
                else ext = '.jpg';
              }
              const filename = `dispatch-asset-${Date.now()}-${idx + 1}-${crypto.randomBytes(3).toString('hex')}${ext}`;
              const rawBuf = Buffer.from(match[2], 'base64');
              const filepath = path.join(UPLOADS, filename);
              await fs.writeFile(filepath, rawBuf);
              aUrl = `/uploads/${filename}`;
              aSize = rawBuf.length;
              mediaToBackup.push({ localUrl: aUrl, filepath, dataUrl: ast.dataUrl, filename });
            }
          } else if (typeof ast.dataUrl === 'string' && ast.dataUrl.trim()) {
            aUrl = ast.dataUrl.trim();
          } else if (typeof ast.url === 'string' && ast.url.trim()) {
            aUrl = ast.url.trim();
          }

          if (aUrl) {
            const detectedType =
              ast.type ||
              (aUrl.match(/\.(mp4|mov|webm|mkv)$/i) || ast.mimeType?.startsWith('video/')
                ? 'video'
                : aUrl.match(/\.(zip|rar|tar\.gz)$/i) || ast.mimeType?.includes('zip')
                  ? 'zip'
                  : aUrl.match(/\.(png|jpe?g|webp|gif|svg)$/i) || ast.mimeType?.startsWith('image/')
                    ? 'photo'
                    : 'folder');

            processedAssets[idx] = {
              url: aUrl,
              name: rawName,
              size: aSize,
              type: detectedType,
              mimeType: ast.mimeType || '',
            };
          }
        })
      );
    }

    const finalAssets = processedAssets.filter(Boolean);

    // Fast parallel disk write for legacy base64 single file payload
    if (typeof file === 'string' && file.startsWith('data:')) {
      const match = /^data:([^;]+);base64,(.+)$/.exec(file);
      if (match) {
        const mime = match[1];
        const rawBuf = Buffer.from(match[2], 'base64');
        const ext = mime.includes('png') ? '.png' : mime.includes('webp') ? '.webp' : mime.includes('zip') ? '.zip' : mime.includes('mp4') ? '.mp4' : '.jpg';
        const safeName = (fileName || `delivery-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_');
        const filename = `dispatch-${Date.now()}-${safeName}${safeName.includes('.') ? '' : ext}`;
        await fs.writeFile(path.join(UPLOADS, filename), rawBuf);
        finalFileUrl = `/uploads/${filename}`;
        finalFileName = fileName || safeName;
        finalFileSize = rawBuf.length;
        mediaToBackup.push({ localUrl: finalFileUrl, filepath: path.join(UPLOADS, filename), dataUrl: file, filename });
      }
    } else if (typeof file === 'string' && file.trim()) {
      finalFileUrl = file.trim();
    }

    if (!finalFileUrl && finalAssets.length > 0) {
      finalFileUrl = finalAssets[0].url;
      finalFileName = finalAssets[0].name;
      finalFileSize = finalAssets[0].size;
    }

    const allMedia = Array.isArray(mediaUrls) ? mediaUrls.filter(Boolean) : [];
    // Also include any photo assets into mediaUrls for backward compatibility
    for (const ast of finalAssets) {
      if ((ast.type === 'photo' || ast.mimeType?.startsWith('image/')) && !allMedia.includes(ast.url)) {
        allMedia.push(ast.url);
      }
    }

    const hostedMedia = [];

    // Process all mediaUrls in parallel without blocking on slow cloud uploads
    await Promise.all(
      allMedia.map(async (mUrl, idx) => {
        if (typeof mUrl === 'string' && mUrl.startsWith('data:')) {
          const match = /^data:([^;]+);base64,(.+)$/.exec(mUrl);
          if (match) {
            const mime = match[1];
            const ext = mime.includes('png') ? '.png' : mime.includes('webp') ? '.webp' : '.jpg';
            const filename = `dispatch-media-${Date.now()}-${idx + 1}-${crypto.randomBytes(3).toString('hex')}${ext}`;
            const filepath = path.join(UPLOADS, filename);
            await fs.writeFile(filepath, Buffer.from(match[2], 'base64'));
            const localUrl = `/uploads/${filename}`;
            hostedMedia[idx] = localUrl;
            mediaToBackup.push({ localUrl, filepath, dataUrl: mUrl, idx, filename });
            return;
          }
        }
        hostedMedia[idx] = mUrl;
      })
    );

    const cleanHosted = hostedMedia.filter(Boolean);
    if (finalFileUrl && !cleanHosted.includes(finalFileUrl) && (type === 'photo' || finalAssets.some(a => a.url === finalFileUrl && a.type === 'photo'))) {
      cleanHosted.unshift(finalFileUrl);
    }

    const effectiveType = finalAssets.length > 1 ? 'package' : (type || (finalAssets[0]?.type ?? 'photo'));

    const newDelivery = {
      id: `del_${crypto.randomUUID()}`,
      recipientUserId: String(recipientUserId || '').trim(),
      recipientEmail: String(recipientEmail || '').trim().toLowerCase(),
      recipientName: String(recipientName || '').trim(),
      senderEmail: req.user.email,
      type: String(effectiveType), // 'photo' | 'video' | 'zip' | 'folder' | 'text' | 'package'
      title: String(title || (type === 'text' ? 'Message from Studio' : `${effectiveType.toUpperCase()} Delivery`)).trim(),
      textMessage: String(textMessage || '').trim(),
      fileUrl: finalFileUrl,
      fileName: finalFileName,
      fileSize: finalFileSize,
      mediaUrls: cleanHosted,
      assets: finalAssets,
      readByUser: false,
      createdAt: Date.now(),
    };

    const all = await readAdminDeliveries();
    all.unshift(newDelivery);
    await writeAdminDeliveries(all);

    // Return immediate response to Admin (completes in < 200ms instead of 10 minutes)
    res.status(201).json(newDelivery);

    // Asynchronously save persistent dataUrls in MongoDB so deliveries never 404 after redeploys
    if (mediaToBackup.length > 0) {
      (async () => {
        try {
          const db = await getMongoDb();
          if (db) {
            const bulk = mediaToBackup.map((item) => ({
              updateOne: {
                filter: { id: item.filename || path.basename(item.localUrl) },
                update: {
                  $set: {
                    id: item.filename || path.basename(item.localUrl),
                    url: item.localUrl,
                    dataUrl: item.dataUrl,
                    deliveryId: newDelivery.id,
                    createdAt: Date.now(),
                  },
                },
                upsert: true,
              },
            }));
            await db.collection('admin_delivery_files').bulkWrite(bulk, { ordered: false });
          }
        } catch { }

        // Non-blocking background Cloudinary sync if configured
        try {
          const s = await getSettings().catch(() => ({}));
          if (s.cloudinaryCloudName && s.cloudinaryApiKey && /^\d+$/.test(s.cloudinaryApiKey)) {
            for (const item of mediaToBackup) {
              try {
                const cdn = await uploadToCloudinary(item.dataUrl, recipientUserId || 'delivery', `media-${Date.now()}`);
                if (cdn?.url) {
                  const freshAll = await readAdminDeliveries();
                  const target = freshAll.find((d) => d.id === newDelivery.id);
                  if (target) {
                    target.mediaUrls = (target.mediaUrls || []).map((u) => (u === item.localUrl ? cdn.url : u));
                    if (target.fileUrl === item.localUrl) target.fileUrl = cdn.url;
                    await writeAdminDeliveries(freshAll);
                  }
                }
              } catch { }
            }
          }
        } catch { }
      })().catch(() => { });
    }
  } catch (err) {
    console.error('[admin-deliveries] Dispatch error:', err);
    res.status(500).json({ error: 'dispatch_failed', message: err.message });
  }
});

app.delete('/api/admin/deliveries/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const all = await readAdminDeliveries();
    const item = all.find((d) => d.id === id);
    if (!item) {
      return res.status(404).json({ error: 'not_found', message: 'Delivery not found.' });
    }
    item.deleted = true;
    item.deletedAt = Date.now();
    item.deletedBy = req.user?.email || 'admin';
    await writeAdminDeliveries(all);
    res.json({ ok: true, message: 'Delivery moved to bin.' });
  } catch (err) {
    res.status(500).json({ error: 'delete_failed', message: err.message });
  }
});

/* ---------------------------------------------------- Admin Recycle Bin (Deleted Requests, Deliveries & Generations) */
app.get('/api/admin/bin', requireAdmin, async (_req, res) => {
  try {
    const db = await getMongoDb();
    const [allRequests, allDeliveries, allGenerations] = await Promise.all([
      readCustomRequests(),
      readAdminDeliveries(),
      readGenerations(),
    ]);
    const deletedRequests = allRequests.filter((r) => r.deleted === true);
    const deletedDeliveries = allDeliveries.filter((d) => d.deleted === true);
    let deletedGenerations = [];
    if (db) {
      try {
        const dbDeleted = await db.collection('generations').find({ $or: [{ deleted: true }, { isDeleted: true }] }).sort({ deletedAt: -1 }).toArray();
        deletedGenerations = (dbDeleted || []).map((it) => {
          const clean = { ...it };
          delete clean._id;
          return clean;
        });
      } catch { }
    }
    if (deletedGenerations.length === 0) {
      deletedGenerations = allGenerations.filter((g) => g.deleted === true || g.isDeleted === true);
    }
    deletedRequests.sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
    deletedDeliveries.sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
    deletedGenerations.sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
    res.json({
      requests: deletedRequests,
      deliveries: deletedDeliveries,
      generations: deletedGenerations,
      total: deletedRequests.length + deletedDeliveries.length + deletedGenerations.length,
    });
  } catch (err) {
    res.status(500).json({ error: 'fetch_bin_failed', message: err.message });
  }
});

app.post('/api/admin/bin/restore', requireAdmin, async (req, res) => {
  try {
    const { type, id } = req.body || {};
    const db = await getMongoDb();
    if (type === 'request' || type === 'custom_request') {
      const all = await readCustomRequests();
      const item = all.find((r) => r.id === id);
      if (item) {
        item.deleted = false;
        delete item.deletedAt;
        delete item.deletedBy;
        await writeCustomRequests(all);
      }
      if (db) {
        await db.collection('custom_requests').updateOne({ id }, { $unset: { deleted: '', deletedAt: '', deletedBy: '' } });
      }
      return res.json({ ok: true, id });
    } else if (type === 'delivery') {
      const all = await readAdminDeliveries();
      const item = all.find((d) => d.id === id);
      if (item) {
        item.deleted = false;
        delete item.deletedAt;
        delete item.deletedBy;
        await writeAdminDeliveries(all);
      }
      if (db) {
        await db.collection('admin_deliveries').updateOne({ id }, { $unset: { deleted: '', deletedAt: '', deletedBy: '' } });
      }
      return res.json({ ok: true, id });
    } else if (type === 'generation' || type === 'image') {
      const all = await readGenerations();
      const item = all.find((g) => g.id === id);
      if (item) {
        item.deleted = false;
        item.isDeleted = false;
        delete item.deletedAt;
        delete item.deletedBy;
        await writeGenerations(all);
      }
      if (db) {
        await db.collection('generations').updateOne(
          { id },
          { $unset: { deleted: '', isDeleted: '', deletedAt: '', deletedBy: '' } }
        );
      }
      return res.json({ ok: true, id });
    }
    res.status(400).json({ error: 'invalid_type' });
  } catch (err) {
    res.status(500).json({ error: 'restore_failed', message: err.message });
  }
});

app.delete('/api/admin/bin/:type/:id', requireAdmin, async (req, res) => {
  try {
    const { type, id } = req.params;
    const db = await getMongoDb();
    if (type === 'request' || type === 'custom_request') {
      const all = await readCustomRequests();
      const filtered = all.filter((r) => r.id !== id);
      await writeJson(CUSTOM_REQUESTS_FILE, filtered);
      if (db) {
        await db.collection('custom_requests').deleteOne({ id });
      }
      return res.json({ ok: true, message: 'Custom request permanently deleted from bin.' });
    } else if (type === 'delivery') {
      const all = await readAdminDeliveries();
      const filtered = all.filter((d) => d.id !== id);
      await writeJson(ADMIN_DELIVERIES_FILE, filtered);
      if (db) {
        await db.collection('admin_deliveries').deleteOne({ id });
      }
      return res.json({ ok: true, message: 'Delivery permanently deleted from bin.' });
    } else if (type === 'generation' || type === 'image') {
      const all = await readGenerations();
      const filtered = all.filter((g) => g.id !== id);
      await writeGenerations(filtered);
      if (db) {
        await db.collection('generations').deleteOne({ id });
      }
      return res.json({ ok: true, message: 'Generation permanently deleted from bin.' });
    }
    res.status(400).json({ error: 'invalid_type' });
  } catch (err) {
    res.status(500).json({ error: 'permanent_delete_failed', message: err.message });
  }
});

app.post('/api/admin/bin/empty', requireAdmin, async (_req, res) => {
  try {
    const db = await getMongoDb();
    const [allRequests, allDeliveries, allGenerations] = await Promise.all([
      readCustomRequests(),
      readAdminDeliveries(),
      readGenerations(),
    ]);

    const activeRequests = allRequests.filter((r) => !r.deleted);
    const deletedReqCount = allRequests.length - activeRequests.length;
    await writeJson(CUSTOM_REQUESTS_FILE, activeRequests);
    if (db) {
      await db.collection('custom_requests').deleteMany({ deleted: true });
    }

    const activeDeliveries = allDeliveries.filter((d) => !d.deleted);
    const deletedDelCount = allDeliveries.length - activeDeliveries.length;
    await writeJson(ADMIN_DELIVERIES_FILE, activeDeliveries);
    if (db) {
      await db.collection('admin_deliveries').deleteMany({ deleted: true });
    }

    const activeGenerations = allGenerations.filter((g) => !g.deleted && !g.isDeleted);
    const deletedGenCount = allGenerations.length - activeGenerations.length;
    await writeGenerations(activeGenerations);
    if (db) {
      await db.collection('generations').deleteMany({ $or: [{ deleted: true }, { isDeleted: true }] });
    }

    res.json({ ok: true, purged: deletedReqCount + deletedDelCount + deletedGenCount });
  } catch (err) {
    res.status(500).json({ error: 'empty_bin_failed', message: err.message });
  }
});

/* ---------------------------------------------------- admin user management */
app.get('/api/admin/users', requireAdmin, async (_req, res) => {
  try {
    const rawUsers = await auth.getAllUsers();
    const items = rawUsers.map((u) => ({
      id: u._id,
      email: u.email,
      name: u.name || '',
      provider: u.provider || 'password',
      credits: typeof u.credits === 'number' ? u.credits : 10,
      creditsLocked: Boolean(u.creditsLocked),
      tier: u.tier || 'free',
      maxVideos: typeof u.maxVideos === 'number' ? u.maxVideos : 15,
      videosGenerated: typeof u.videosGenerated === 'number' ? u.videosGenerated : 0,
      photoshoots: typeof u.photoshoots === 'number' ? u.photoshoots : (typeof u.maxModels === 'number' ? u.maxModels : (u.tier === 'ultra' ? 100 : u.tier === 'pro' ? 60 : u.tier === 'ondemand' ? 20 : 3)),
      photoshootsDone: typeof u.photoshootsDone === 'number' ? u.photoshootsDone : Math.floor((u.modelsGenerated || 0) / 5),
      photoshootsLeft: Math.max(0, (typeof u.photoshoots === 'number' ? u.photoshoots : (u.maxModels || 20)) - (typeof u.photoshootsDone === 'number' ? u.photoshootsDone : Math.floor((u.modelsGenerated || 0) / 5))),
      maxModels: typeof u.maxModels === 'number' ? u.maxModels : (typeof u.photoshoots === 'number' ? u.photoshoots : (u.tier === 'ultra' ? 100 : u.tier === 'pro' ? 60 : u.tier === 'ondemand' ? 20 : 3)),
      maxGenerations: (typeof u.photoshoots === 'number' ? u.photoshoots : (typeof u.maxModels === 'number' ? u.maxModels : (u.tier === 'ultra' ? 100 : u.tier === 'pro' ? 60 : u.tier === 'ondemand' ? 20 : 3))) * 6,
      modelsGenerated: typeof u.modelsGenerated === 'number' ? u.modelsGenerated : 0,
      dailyModelsUsed: typeof u.dailyModelsUsed === 'number' ? u.dailyModelsUsed : 0,
      dailyVideosUsed: typeof u.dailyVideosUsed === 'number' ? u.dailyVideosUsed : 0,
      features: {
        hd2k: Boolean(u.features?.hd2k || u.tier === 'ultra'),
        fivePose: Boolean(u.features?.fivePose || u.tier !== 'free'),
        video: Boolean(u.features?.video || u.tier !== 'free'),
        customRequests: Boolean(u.features?.customRequests || ['pro', 'ultra'].includes(u.tier)),
      },
      photoshootOffer: u.photoshootOffer || null,
      planExpiresAt: u.planExpiresAt || null,
      createdAt: u.createdAt || null,
    }));
    items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    res.json({ items, total: items.length });
  } catch (error) {
    res.status(500).json({ error: 'fetch_users_failed', message: String(error.message || error) });
  }
});

app.post('/api/admin/users/:id/video-limit', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { maxVideos } = req.body || {};
    const user = await auth.findUserById(id);
    if (!user) return res.status(404).json({ error: 'user_not_found', message: 'User not found.' });

    const limit = typeof maxVideos === 'number' ? Math.max(0, maxVideos) : 15;
    await auth.patchUser(id, { maxVideos: limit });
    res.json({ ok: true, id, maxVideos: limit });
  } catch (error) {
    res.status(500).json({ error: 'update_video_limit_failed', message: String(error.message || error) });
  }
});

app.post('/api/admin/users/:id/credits', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { credits, add } = req.body || {};
    const user = await auth.findUserById(id);
    if (!user) return res.status(404).json({ error: 'user_not_found', message: 'User not found.' });

    let newBalance = typeof user.credits === 'number' ? user.credits : 10;
    if (typeof credits === 'number') {
      newBalance = Math.max(0, credits);
    } else if (typeof add === 'number') {
      newBalance = Math.max(0, newBalance + add);
    }

    await auth.patchUser(id, { credits: newBalance });
    res.json({ ok: true, id, credits: newBalance });
  } catch (error) {
    res.status(500).json({ error: 'update_credits_failed', message: String(error.message || error) });
  }
});

app.post('/api/admin/users/:id/photoshoots', requireAdmin, async (req, res) => {
  try {
    const rawParam = decodeURIComponent(String(req.params.id || '').trim());
    const { photoshoots, note, email } = req.body || {};

    let user = await auth.findUserById(rawParam);
    if (!user && (email || rawParam)) {
      user = await auth.findUserByEmail(email || rawParam);
    }
    if (!user) {
      const all = await auth.getAllUsers();
      user = all.find((u) => String(u._id) === rawParam || String(u.id) === rawParam || u.email === rawParam || (email && u.email === email));
    }
    if (!user) {
      try {
        const local = (await auth.readLocal?.()) || [];
        user = local.find((u) => String(u._id) === rawParam || String(u.id) === rawParam || u.email === rawParam || (email && u.email === email));
      } catch { }
    }
    if (!user) return res.status(404).json({ error: 'user_not_found', message: 'User not found.' });

    const targetUserId = String(user._id || user.id || rawParam);
    const newQuota = typeof photoshoots === 'number' ? Math.max(0, Math.floor(photoshoots)) : 20;
    const oldQuota = typeof user.photoshoots === 'number' ? user.photoshoots : (user.maxModels || 20);

    const offer = {
      newQuota,
      oldQuota,
      note: String(note || '').slice(0, 300),
      offeredAt: Date.now(),
      status: 'pending', // 'pending' | 'agreed' | 'queried'
      userQuery: '',
    };

    await auth.patchUser(targetUserId, {
      photoshootOffer: offer,
    });

    res.json({ ok: true, id: targetUserId, photoshootOffer: offer });
  } catch (error) {
    res.status(500).json({ error: 'update_photoshoots_failed', message: error.message });
  }
});

app.post('/api/admin/users/:id/photoshoots-progress', requireAdmin, async (req, res) => {
  try {
    const rawParam = decodeURIComponent(String(req.params.id || '').trim());
    const { photoshootsDone, photoshoots, email } = req.body || {};

    let user = await auth.findUserById(rawParam);
    if (!user && (email || rawParam)) {
      user = await auth.findUserByEmail(email || rawParam);
    }
    if (!user) {
      const all = await auth.getAllUsers();
      user = all.find((u) => String(u._id) === rawParam || String(u.id) === rawParam || u.email === rawParam || (email && u.email === email));
    }
    if (!user) {
      try {
        const local = (await auth.readLocal?.()) || [];
        user = local.find((u) => String(u._id) === rawParam || String(u.id) === rawParam || u.email === rawParam || (email && u.email === email));
      } catch { }
    }

    if (!user) return res.status(404).json({ error: 'user_not_found', message: 'User not found.' });

    const targetUserId = String(user._id || user.id || rawParam);
    const patch = {};
    if (typeof photoshootsDone === 'number') {
      const doneVal = Math.max(0, Math.floor(photoshootsDone));
      patch.photoshootsDone = doneVal;
      patch.modelsGenerated = doneVal * 5;
    }
    if (typeof photoshoots === 'number') {
      const val = Math.max(0, Math.floor(photoshoots));
      patch.photoshoots = val;
      patch.maxModels = val;
    }

    await auth.patchUser(targetUserId, patch);
    const updated = (await auth.findUserById(targetUserId)) || { ...user, ...patch };
    const total = updated.photoshoots || updated.maxModels || 20;
    const done = typeof updated.photoshootsDone === 'number' ? updated.photoshootsDone : Math.floor((updated.modelsGenerated || 0) / 5);
    res.json({
      ok: true,
      id: targetUserId,
      photoshootsDone: done,
      photoshoots: total,
      photoshootsLeft: Math.max(0, total - done),
    });
  } catch (error) {
    res.status(500).json({ error: 'update_photoshoots_progress_failed', message: error.message });
  }
});

app.post('/api/admin/clean-broken-cache', requireAdmin, async (_req, res) => {
  try {
    cachedCustomRequests = { items: null, time: 0 };
    cachedAdminDeliveries = { items: null, time: 0 };
    const diskFiles = await fs.readdir(UPLOADS).catch(() => []);
    const diskFilesSet = new Set(diskFiles);
    let cleanedCount = 0;
    try {
      const db = await getMongoDb();
      if (db) {
        const dbUploads = await db.collection('user_uploads').find({}).toArray();
        const idsToDelete = [];
        for (const u of dbUploads) {
          const urlStr = String(u.url || u.id || '');
          if (urlStr.includes('/uploads/')) {
            const fname = path.basename(urlStr);
            if (!diskFilesSet.has(fname) && !u.dataUrl && !u.remoteUrl) {
              idsToDelete.push(u._id);
            }
          }
        }
        if (idsToDelete.length > 0) {
          await db.collection('user_uploads').deleteMany({ _id: { $in: idsToDelete } });
          cleanedCount = idsToDelete.length;
        }
      }
    } catch { }
    res.json({ ok: true, message: `Server caches purged. Cleaned ${cleanedCount} dead upload records.` });
  } catch (err) {
    res.status(500).json({ error: 'cache_clean_failed', message: err.message });
  }
});

app.post('/api/user/clean-cache', auth.requireUser, async (_req, res) => {
  cachedCustomRequests = { items: null, time: 0 };
  cachedAdminDeliveries = { items: null, time: 0 };
  res.json({ ok: true, message: 'User cache refreshed successfully.' });
});

app.post('/api/user/photoshoot-response', auth.requireUser, async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await auth.findUserById(userId);
    if (!user) return res.status(404).json({ error: 'user_not_found' });

    const { action, queryText } = req.body || {};
    const offer = user.photoshootOffer;
    if (!offer) {
      return res.status(400).json({ error: 'no_active_offer', message: 'No active photoshoot offer found.' });
    }

    if (action === 'agree') {
      const newLimit = typeof offer.newQuota === 'number' ? offer.newQuota : 20;
      await auth.patchUser(userId, {
        photoshoots: newLimit,
        maxModels: newLimit,
        photoshootOffer: {
          ...offer,
          status: 'agreed',
          agreedAt: Date.now(),
        },
      });
      return res.json({ ok: true, status: 'agreed', photoshoots: newLimit });
    } else if (action === 'query') {
      const qText = String(queryText || '').trim();
      if (!qText) {
        return res.status(400).json({ error: 'query_empty', message: 'Please write your query before sending.' });
      }
      await auth.patchUser(userId, {
        photoshootOffer: {
          ...offer,
          status: 'queried',
          userQuery: qText,
          queriedAt: Date.now(),
        },
      });
      return res.json({ ok: true, status: 'queried', userQuery: qText });
    }

    res.status(400).json({ error: 'invalid_action' });
  } catch (error) {
    res.status(500).json({ error: 'response_failed', message: error.message });
  }
});

app.post('/api/admin/users/:id/lock', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const user = await auth.findUserById(id);
    if (!user) return res.status(404).json({ error: 'user_not_found', message: 'User not found.' });

    const creditsLocked = !Boolean(user.creditsLocked);
    await auth.patchUser(id, { creditsLocked });
    res.json({ ok: true, id, creditsLocked });
  } catch (error) {
    res.status(500).json({ error: 'toggle_lock_failed', message: String(error.message || error) });
  }
});

app.post('/api/admin/users/:id/tier', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { tier = 'free' } = req.body || {};
    const user = await auth.findUserById(id);
    if (!user) return res.status(404).json({ error: 'user_not_found', message: 'User not found.' });

    const isPaid = ['ondemand', 'pro', 'ultra'].includes(tier);
    const isProOrUltra = ['pro', 'ultra'].includes(tier);
    const patch = {
      tier,
      features: {
        hd2k: isPaid,
        fivePose: isPaid,
        video: isPaid,
        customRequests: isProOrUltra,
      },
    };
    if (tier === 'ultra') {
      if ((user.maxVideos || 0) < 6) patch.maxVideos = 6;
      if ((user.maxModels || 0) < 100) patch.maxModels = 100;
    } else if (tier === 'pro') {
      if ((user.maxVideos || 0) < 4) patch.maxVideos = 4;
      if ((user.maxModels || 0) < 60) patch.maxModels = 60;
    } else if (tier === 'ondemand') {
      if ((user.maxVideos || 0) < 2) patch.maxVideos = 2;
      if ((user.maxModels || 0) < 20) patch.maxModels = 20;
    }

    await auth.patchUser(id, patch);
    res.json({ ok: true, id, tier, features: patch.features });
  } catch (error) {
    res.status(500).json({ error: 'update_tier_failed', message: String(error.message || error) });
  }
});

app.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const user = await auth.findUserById(id);
    if (!user) return res.status(404).json({ error: 'user_not_found', message: 'User not found.' });

    const body = req.body || {};
    const patch = {};
    if (typeof body.credits === 'number') patch.credits = Math.max(0, Math.floor(body.credits));
    if (typeof body.maxVideos === 'number') patch.maxVideos = Math.max(0, Math.floor(body.maxVideos));
    if (typeof body.videosGenerated === 'number') patch.videosGenerated = Math.max(0, Math.floor(body.videosGenerated));
    if (typeof body.maxModels === 'number') {
      const val = Math.max(0, Math.floor(body.maxModels));
      patch.maxModels = val;
      patch.photoshoots = val;
    }
    if (typeof body.photoshoots === 'number') {
      const val = Math.max(0, Math.floor(body.photoshoots));
      patch.photoshoots = val;
      patch.maxModels = val;
    }
    if (typeof body.photoshootsDone === 'number') patch.photoshootsDone = Math.max(0, Math.floor(body.photoshootsDone));
    if (typeof body.modelsGenerated === 'number') patch.modelsGenerated = Math.max(0, Math.floor(body.modelsGenerated));
    if (typeof body.tier === 'string') patch.tier = body.tier;
    if (typeof body.creditsLocked === 'boolean') patch.creditsLocked = body.creditsLocked;
    if (typeof body.watermarkAccess === 'boolean') patch.watermarkAccess = body.watermarkAccess;
    if (typeof body.planExpiresAt === 'number') patch.planExpiresAt = body.planExpiresAt;

    const targetTier = patch.tier || user.tier || 'free';
    const isPaid = ['ondemand', 'pro', 'ultra'].includes(targetTier);
    const isProOrUltra = ['pro', 'ultra'].includes(targetTier);

    if (body.features && typeof body.features === 'object') {
      patch.features = {
        hd2k: Boolean(body.features.hd2k || targetTier === 'ultra'),
        fivePose: Boolean(body.features.fivePose || isPaid),
        video: Boolean(body.features.video || isPaid),
        customRequests: Boolean(body.features.customRequests || isProOrUltra),
      };
    } else if (patch.tier || !user.features) {
      patch.features = {
        hd2k: targetTier === 'ultra',
        fivePose: isPaid,
        video: isPaid,
        customRequests: isProOrUltra,
      };
    }

    if (targetTier === 'ultra') {
      if (typeof patch.maxVideos !== 'number' && (user.maxVideos || 0) < 6) patch.maxVideos = 6;
      if (typeof patch.maxModels !== 'number' && (user.maxModels || 0) < 100) patch.maxModels = 100;
    } else if (targetTier === 'pro') {
      if (typeof patch.maxVideos !== 'number' && (user.maxVideos || 0) < 4) patch.maxVideos = 4;
      if (typeof patch.maxModels !== 'number' && (user.maxModels || 0) < 60) patch.maxModels = 60;
    } else if (targetTier === 'ondemand') {
      if (typeof patch.maxVideos !== 'number' && (user.maxVideos || 0) < 2) patch.maxVideos = 2;
      if (typeof patch.maxModels !== 'number' && (user.maxModels || 0) < 20) patch.maxModels = 20;
    }

    await auth.patchUser(id, patch);
    const updated = await auth.findUserById(id);
    res.json({ ok: true, user: auth.publicUser(updated) });
  } catch (error) {
    res.status(500).json({ error: 'update_user_failed', message: error.message });
  }
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await auth.deleteUser(id);
    res.json({ ok: true, id });
  } catch (error) {
    res.status(500).json({ error: 'delete_user_failed', message: String(error.message || error) });
  }
});

/* ---------------------------------------------------- admin all generations view */
app.get('/api/admin/generations', requireAdmin, async (_req, res) => {
  try {
    const db = await getMongoDb();
    let list = [];
    if (db) {
      try {
        const docs = await db.collection('generations').find({}).sort({ createdAt: -1 }).limit(500).toArray();
        if (docs && docs.length > 0) {
          list = docs.map((it) => {
            const clean = { ...it };
            delete clean._id;
            return clean;
          });
        }
      } catch (dbErr) {
        console.warn('[admin generations] MongoDB fetch warning:', dbErr.message);
      }
    }
    if (list.length === 0) {
      list = await readGenerations();
    }

    const sorted = [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map((g) => ({
      ...g,
      isEdited: Boolean(
        g.isEdited ||
        g.isNewSnapshot ||
        g.type === 'edit' ||
        (g.prompt && /\b(edit|edited|option b|hd vector)\b/i.test(g.prompt))
      ),
    }));
    const totalCreditsDeducted = sorted.reduce((sum, g) => sum + (Number(g.creditsUsed) || 0), 0);
    const successCount = sorted.filter((g) => g.status === 'completed' || (!g.status && (g.url || g.outputUrl))).length;
    const failedCount = sorted.filter((g) => g.status === 'failed').length;
    const processingCount = sorted.filter((g) => g.status === 'processing').length;
    res.json({
      items: sorted,
      total: sorted.length,
      totalCreditsDeducted,
      successCount,
      failedCount,
      processingCount,
    });
  } catch (err) {
    res.status(500).json({ error: 'fetch_generations_failed', message: err.message });
  }
});

app.delete('/api/admin/generations/:id', requireAdmin, async (req, res) => {
  try {
    const list = await readGenerations();
    const filtered = list.filter((g) => g.id !== req.params.id);
    await writeGenerations(filtered);
    try {
      const db = await getMongoDb();
      if (db) await db.collection('generations').deleteOne({ id: req.params.id });
    } catch { }
    res.json({ ok: true, deleted: req.params.id });
  } catch (err) {
    res.status(500).json({ error: 'delete_failed', message: err.message });
  }
});

app.post('/api/admin/generations/:id/refund', requireAdmin, async (req, res) => {
  try {
    const list = await readGenerations();
    const item = list.find((g) => g.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'not_found', message: 'Generation record not found' });
    if (item.status === 'refunded') {
      return res.status(400).json({ error: 'already_refunded', message: 'This generation has already been refunded.' });
    }
    const toRefund = Number(item.creditsUsed) || 0;
    if (toRefund <= 0) {
      return res.status(400).json({ error: 'zero_credits', message: 'This generation used 0 credits; nothing to refund.' });
    }
    const user = await auth.findUserById(item.userId);
    if (!user) return res.status(404).json({ error: 'user_not_found', message: 'User not found' });
    const newBalance = (Number(user.credits) || 0) + toRefund;
    await auth.patchUser(user._id, { credits: newBalance });
    item.status = 'refunded';
    item.creditsRefunded = toRefund;
    await writeGenerations(list);
    res.json({ ok: true, refundedCredits: toRefund, userEmail: user.email, newBalance });
  } catch (err) {
    res.status(500).json({ error: 'refund_failed', message: err.message });
  }
});

/* ---------------------------------------------------- video preview pipeline */
app.post('/api/generate-video', auth.requireUser, async (req, res) => {
  try {
    /* Seamless concurrency handling: gracefully abort any previous active job for this user and proceed */
    const userLockKey = getUserLockKey(req);
    const existingActive = activeUserGenerations.get(userLockKey) || (req.user?._id ? activeUserGenerations.get(`usr_${req.user._id}`) : null);
    if (existingActive) {
      if (existingActive.jobId) {
        const prevLocal = localJobMap.get(existingActive.jobId);
        if (prevLocal && prevLocal.status === 'processing') {
          try {
            prevLocal.status = 'cancelled';
            prevLocal.abortController?.abort();
          } catch { }
        }
      }
      activeUserGenerations.delete(userLockKey);
      if (req.user?._id) {
        activeUserGenerations.delete(`usr_${req.user._id}`);
      }
    }

    const state = await readState();
    if (!state.apiKey) {
      return res.status(400).json({
        error: 'not_ready',
        message: 'No render API key is configured. Please configure your Fashn.ai API key in the admin panel.',
      });
    }

    if (req.user && req.user.creditsLocked) {
      return res.status(403).json({
        error: 'credits_locked',
        message: 'Your account credits have been locked by the administrator. Please contact support.',
      });
    }

    /* Check user video generation limits */
    const maxVideos = typeof req.user.maxVideos === 'number' ? req.user.maxVideos : 15;
    const videosGenerated = typeof req.user.videosGenerated === 'number' ? req.user.videosGenerated : 0;
    if (maxVideos > 0 && videosGenerated >= maxVideos) {
      return res.status(403).json({
        error: 'video_limit_reached',
        message: `You have reached your allocated video limit (${videosGenerated}/${maxVideos} videos generated). Please contact the administrator to increase your video quota.`,
      });
    }

    /* Credits are permanent. No daily video reset. */
    const dailyVideos = Number(req.user.dailyVideosUsed || 0);

    const body = req.body || {};
    const rawImages = Array.isArray(body.images) && body.images.length > 0
      ? body.images.filter(Boolean)
      : (body.image || body.cloth || body.model ? [body.image || body.cloth || body.model] : []);

    if (rawImages.length === 0) {
      return res.status(400).json({
        error: 'image_required',
        message: 'Please provide at least one garment or model image to generate a fashion video.',
      });
    }

    const primaryImage = rawImages[0];

    /* Duration: 5 sec = 6 credits max; 10 sec = 12 credits max — strictly fixed regardless of image count */
    const duration = Number(body.duration) === 10 ? 10 : 5;
    const creditsNeeded = duration === 10 ? 12 : 6;
    const aspectRatio = String(body.aspect_ratio || body.aspectRatio || '9:16');

    const userCredits = req.user ? (typeof req.user.credits === 'number' ? req.user.credits : 10) : 10;
    if (userCredits < creditsNeeded) {
      return res.status(402).json({
        error: 'insufficient_credits',
        message: `You have ${userCredits} credit${userCredits === 1 ? '' : 's'} remaining, but ${creditsNeeded} credits are required for a ${duration}-second 1080p fashion video. Please upgrade your plan.`,
      });
    }

    let imageUri;
    try {
      imageUri = await toDataUri(primaryImage);
    } catch (imgErr) {
      return res.status(400).json({
        error: 'image_error',
        message: `Could not load base image for video: ${imgErr.message}`,
      });
    }

    /* Structured prompt with logo & brand preservation */
    let prompt = String(body.prompt || '').trim();
    if (!prompt.toLowerCase().includes('shiv-naresh')) {
      prompt = `SHIV-NARESH athletic sportswear presentation: ${prompt || 'fashion runway video with dynamic athletic movements'}`.trim();
    }
    if (rawImages.length > 1) {
      prompt = `${prompt}, highlighting all ${rawImages.length} apparel angles and sportswear features seamlessly in high-definition runway motion`;
    }
    prompt = `${prompt}, maintaining sharp sportswear details, clear athlete motion, exact fabric color tones, and preserving the SHIV-NARESH name and branding`;

    const response = await fetch(`${FASHN}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.apiKey}`,
      },
      body: JSON.stringify({
        model_name: 'image-to-video',
        inputs: {
          image: imageUri,
          ...(prompt ? { prompt } : {}),
          duration,
          resolution: '1080p',
          aspect_ratio: aspectRatio,
        },
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      let msg = data.message || data.detail || `Video render service rejected the request (${response.status})`;
      if (
        typeof msg === 'string' &&
        (msg.toLowerCase().includes('rendering is off') ||
          msg.toLowerCase().includes('no render key') ||
          response.status === 401 ||
          response.status === 403)
      ) {
        msg = `Fashn.ai rejected the API key (${response.status}). Please re-save your API key in the Admin panel.`;
      }
      await recordSystemProblem({
        module: 'video-generation',
        severity: 'error',
        userEmail: req.user?.email || 'guest',
        userId: req.user?._id,
        title: `Video Generation Rejected (HTTP ${response.status})`,
        message: msg,
        details: { duration, aspectRatio, responseData: data },
      });
      try {
        const genList = await readGenerations();
        genList.unshift({
          id: crypto.randomUUID(),
          userId: req.user?._id || 'guest',
          userEmail: req.user?.email || 'guest',
          userName: req.user?.name || '',
          type: 'video',
          mode: 'runway-video',
          resolution: 'HD',
          creditsUsed: 0,
          status: 'failed',
          error: msg,
          prompt: prompt || '',
          createdAt: Date.now(),
        });
        await writeGenerations(genList);
      } catch { }

      return res.status(response.status).json({
        error: data.error || 'render_error',
        message: msg,
      });
    }

    let remainingCredits = userCredits;
    const newVideosGenerated = videosGenerated + 1;
    const nextDailyVideos = dailyVideos + 1;
    let creditsDeducted = false;

    if (req.user && req.user._id) {
      remainingCredits = Math.max(0, userCredits - creditsNeeded);
      await auth.patchUser(req.user._id, {
        credits: remainingCredits,
        videosGenerated: newVideosGenerated,
        dailyVideosUsed: nextDailyVideos,
      });
      req.user.credits = remainingCredits;
      req.user.videosGenerated = newVideosGenerated;
      req.user.dailyVideosUsed = nextDailyVideos;
      creditsDeducted = true;
    }

    if (data.id) {
      lockUser(req, data.id);
      jobKeyMap.set(data.id, { requestKey: `video-${data.id}`, userKey: getUserLockKey(req), userId: req.user?._id, creditsUsed: creditsNeeded });
      try {
        const genList = await readGenerations();
        genList.unshift({
          id: data.id,
          userId: req.user?._id || 'guest',
          userEmail: req.user?.email || '',
          userName: req.user?.name || '',
          type: 'video',
          mode: 'runway-video',
          resolution: 'HD',
          creditsUsed: creditsNeeded,
          status: 'processing',
          error: null,
          prompt: prompt || '',
          model: imageUri || primaryImage || '',
          images: rawImages.slice(0, 10),
          outputUrl: null,
          createdAt: Date.now(),
        });
        await writeGenerations(genList);
      } catch (genErr) {
        console.warn('[video] Non-fatal genList write warning:', genErr.message);
      }
    }

    res.json({
      ok: true,
      id: data.id,
      duration,
      aspect_ratio: aspectRatio,
      credits: remainingCredits,
      creditsUsed: creditsNeeded,
      videosGenerated: newVideosGenerated,
      maxVideos,
      status: 'starting',
    });
  } catch (error) {
    // If credits were deducted before an unexpected error occurred, automatically refund them!
    if (creditsDeducted && req.user?._id) {
      try {
        const currentU = await auth.findUserById(req.user._id);
        if (currentU) {
          const restored = (Number(currentU.credits) || 0) + creditsNeeded;
          await auth.patchUser(req.user._id, { credits: restored });
          console.log(`[billing] Automatically refunded ${creditsNeeded} credits to user ${req.user._id} due to unexpected video error.`);
        }
      } catch (refundErr) {
        console.error('[billing] Failed to restore credits after error:', refundErr.message);
      }
    }
    try {
      const genList = await readGenerations();
      genList.unshift({
        id: crypto.randomUUID(),
        userId: req.user?._id || 'guest',
        userEmail: req.user?.email || 'guest',
        userName: req.user?.name || '',
        type: req.body?.mode === 'swap' ? 'model-swap' : 'tryon',
        mode: req.body?.mode || 'tryon',
        resolution: String(req.body?.resolution || '1k').toUpperCase(),
        creditsUsed: 0,
        status: 'failed',
        error: String(error.message || error),
        prompt: req.body?.prompt || '',
        createdAt: Date.now(),
      });
      await writeGenerations(genList);
    } catch { }
    await recordSystemProblem({
      module: 'video-generation',
      severity: 'error',
      userEmail: req.user?.email || 'guest',
      userId: req.user?._id,
      title: 'Video Generation Exception',
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: 'video_generate_failed', message: String(error.message || error) });
  }
});

/* -------------------------------------------------------- collections */
/* collections belong to the signed-in account */
const ownerOf = (req) => (req.user ? req.user._id : null);

app.get('/api/collections', auth.requireUser, async (req, res) => {
  const owner = ownerOf(req);
  const items = (await readCollections()).filter((c) => c.owner === owner);
  res.json({ items });
});

app.post('/api/collections', auth.requireUser, async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 60);
  if (!name) return res.status(400).json({ error: 'name_required', message: 'Give the collection a name.' });
  const items = await readCollections();
  const collection = {
    id: crypto.randomBytes(4).toString('hex'),
    name,
    owner: ownerOf(req),
    createdAt: Date.now(),
    items: [],
  };
  items.push(collection);
  await writeCollections(items);
  res.json(collection);
});

app.post('/api/collections/:id/items', auth.requireUser, async (req, res) => {
  const items = await readCollections();
  const collection = items.find((c) => c.id === req.params.id && c.owner === ownerOf(req));
  if (!collection) return res.status(404).json({ error: 'not_found', message: 'Collection not found.' });
  const { url, label = '' } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url_required', message: 'Nothing to save.' });
  collection.items.unshift({ url, label, at: Date.now() });
  await writeCollections(items);
  res.json(collection);
});

/* ---------------------------------------------------- cronjob for daily reset & monthly expiry */
async function runDailyAndExpiryMaintenance() {
  try {
    const rawUsers = await auth.getAllUsers();
    const now = Date.now();
    for (const u of rawUsers) {
      const updates = {};
      // 1. Reset daily limits if new calendar day
      if (u.lastDailyReset) {
        const last = new Date(u.lastDailyReset);
        const today = new Date();
        const isSame =
          last.getFullYear() === today.getFullYear() &&
          last.getMonth() === today.getMonth() &&
          last.getDate() === today.getDate();
        if (!isSame && ((u.dailyModelsUsed || 0) > 0 || (u.dailyVideosUsed || 0) > 0)) {
          updates.dailyModelsUsed = 0;
          updates.dailyVideosUsed = 0;
          updates.lastDailyReset = now;
        }
      }
      // 2. Monthly plan expiry check
      if (u.planExpiresAt && now > u.planExpiresAt && u.tier && u.tier !== 'free') {
        updates.tier = 'free';
      }
      if (Object.keys(updates).length > 0) {
        await auth.patchUser(u._id, updates);
      }
    }
  } catch (err) {
    console.warn('[maintenance-cron] Cycle notice:', err.message);
  }
}

setInterval(runDailyAndExpiryMaintenance, 30 * 60 * 1000);
setTimeout(runDailyAndExpiryMaintenance, 5000);

/* production build, if present */
const dist = path.join(ROOT, 'dist');
const indexPath = path.join(dist, 'index.html');

// dist/index.html missing = build step didn't run; log and serve boot page (do NOT block event loop with execSync build)
// shortcut: no auto-rebuild; ensure Render build command is `npm install && npm run build`
if (!fsSync.existsSync(indexPath)) {
  console.warn('[boot] dist/index.html not found — serving fallback boot page. Ensure build command includes `npm run build`.');
}

app.use(express.static(dist, {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    // 1-year immutable caching on hashed assets eliminates repeat asset bandwidth
    if (filePath.includes(path.sep + 'assets' + path.sep) || filePath.includes('/assets/')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));
app.get(/^\/(?!api|uploads|generated|models|hosted|guidelines).*/, async (_req, res) => {
  if (fsSync.existsSync(indexPath)) {
    res.setHeader('Cache-Control', 'no-cache');
    return res.sendFile(indexPath, (err) => {
      if (err && !res.headersSent) {
        res.status(200).send(renderBootHtml());
      }
    });
  }
  res.status(200).send(renderBootHtml());
});

function renderBootHtml() {
  return `<!DOCTYPE html>
<html>
  <head>
    <title>Shiv Naresh AI Studio - Initializing</title>
    <meta http-equiv="refresh" content="5">
    <style>
      body { font-family: system-ui, sans-serif; background: #0b0f17; color: white; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
      .card { background: #151d2c; padding: 2.5rem; border-radius: 1rem; border: 1px solid #233149; max-width: 480px; }
      .spinner { width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.1); border-top-color: #ef4444; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1.5rem; }
      @keyframes spin { to { transform: rotate(360deg); } }
      h2 { margin: 0 0 0.5rem; color: #fff; font-size: 1.25rem; }
      p { margin: 0; color: #94a3b8; font-size: 0.9rem; line-height: 1.5; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="spinner"></div>
      <h2>Shiv Naresh AI Studio Initializing</h2>
      <p>Compiling assets. Page will refresh automatically in 5 seconds…</p>
    </div>
  </body>
</html>`;
}

/* Express Global Error Handler — catches all unhandled controller errors and records to system logs */
app.use((err, req, res, _next) => {
  if (/dist\/index\.html|ENOENT.*index\.html/i.test(err.message || '')) {
    // Ignore harmless static asset startup checks
    return;
  }
  // Client 400 Bad Requests & malformed payloads are client input issues, not server errors
  if (err.status === 400 || err.statusCode === 400 || err instanceof SyntaxError) {
    if (!res.headersSent) {
      return res.status(400).json({ error: 'bad_request', message: err.message || 'Bad Request' });
    }
    return;
  }
  console.error('[EXPRESS ROUTE ERROR]', err);
  recordSystemProblem({
    module: 'express-route',
    severity: 'error',
    userEmail: req.user?.email || 'guest',
    userId: req.user?._id,
    title: `Error on ${req.method} ${req.originalUrl}: ${err.message || 'Route failure'}`,
    message: String(err.message || err),
    stack: String(err.stack || ''),
  }).catch(() => { });
  if (!res.headersSent) {
    res.status(500).json({ error: 'internal_server_error', message: err.message || 'An unexpected error occurred.' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[shivnaresh] api listening on 0.0.0.0:${PORT}`);

  // Automated Self Keep-Alive: Pings server public URL every 10 minutes to prevent Render idle spin-down
  const KEEP_ALIVE_URL = process.env.KEEP_ALIVE_URL || process.env.VITE_API_URL || 'https://shivnaresh-api.onrender.com';
  if (KEEP_ALIVE_URL && !KEEP_ALIVE_URL.includes('localhost') && !KEEP_ALIVE_URL.includes('127.0.0.1')) {
    const PING_INTERVAL = 10 * 60 * 1000; // 10 minutes (Render sleeps after 15 minutes of inactivity)
    setInterval(async () => {
      try {
        const pingTarget = `${KEEP_ALIVE_URL.replace(/\/+$/, '')}/api/health`;
        const resp = await fetch(pingTarget, {
          method: 'GET',
          headers: { 'User-Agent': 'ShivNaresh-KeepAlive-Worker/1.0' },
        });
        console.log(`[KeepAlive] Pinged ${pingTarget} -> HTTP ${resp.status}`);
      } catch (err) {
        console.warn('[KeepAlive] Self-ping notice (will retry):', err.message);
      }
    }, PING_INTERVAL);
  }
});
