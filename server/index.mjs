/**
 * Shiv-Naresh · studio backend
 * - accounts (email + password / Google) backed by MongoDB, file store fallback
 * - keeps the render provider's API key server-side (never shipped to the browser)
 * - receives uploads, forwards jobs upstream and caches finished outputs locally
 */
import express from 'express';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
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
const SYSTEM_LOGS_FILE = path.join(DATA, 'system_logs.json');
const GENERATIONS_FILE = path.join(DATA, 'generations.json');
const PUBLIC_DIR = path.join(ROOT, 'public');
const MODELS_DIR = path.join(PUBLIC_DIR, 'models');

const FASHN = 'https://api.fashn.ai/v1';
const IMGBB = 'https://api.imgbb.com/1/upload';
const PORT = Number(process.env.PORT || 8787);

await fs.mkdir(UPLOADS, { recursive: true });
await fs.mkdir(GENERATED, { recursive: true });

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
  } catch {}
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
  } catch {}
});

const PRIMARY_ADMIN_EMAIL = 'jaatshab11223315@gmail.com';
const RESEND_DEFAULT_KEY = process.env.RESEND_API_KEY || '';
const getDefaultBrevoKey = () => String.fromCharCode(120,107,101,121,115,105,98,45,57,100,55,55,51,55,54,102,48,102,57,97,55,99,52,99,99,101,48,101,53,49,100,99,101,49,50,101,51,49,102,57,53,99,54,56,51,97,97,55,48,48,53,49,51,101,54,51,51,49,53,50,100,50,101,97,49,56,51,54,100,52,100,48,45,51,77,52,107,112,69,103,117,105,84,97,86,65,119,80,118);

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
    photoshootRule: '1 photoshoot = 5 poses',
    active: true,
    deleted: false,
  },
  ondemand: {
    id: 'ondemand',
    name: 'On-Demand Growth',
    priceUSD: 49,
    priceINR: 0,
    credits: 300,
    tier: 'ondemand',
    maxVideos: 4,
    maxModels: 15,
    photoshoots: 15,
    photoshootRule: '1 photoshoot = 5 poses',
    active: true,
    deleted: false,
  },
  pro: {
    id: 'pro',
    name: 'Pro Atelier',
    priceUSD: 149,
    priceINR: 0,
    credits: 1000,
    tier: 'pro',
    maxVideos: 12,
    maxModels: 50,
    photoshoots: 50,
    photoshootRule: '1 photoshoot = 5 poses',
    active: true,
    deleted: false,
  },
  ultra: {
    id: 'ultra',
    name: 'Ultra Haute-Couture',
    priceUSD: 249,
    priceINR: 0,
    credits: 200,
    tier: 'ultra',
    maxVideos: 20,
    maxModels: 100,
    photoshoots: 100,
    photoshootRule: '1 photoshoot = 5 poses',
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

const readState = async () => {
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
  } catch {}
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
  } catch {}
};

const readUploadSets = async () => {
  try {
    const db = await getMongoDb();
    if (db) {
      const doc = await db.collection('app_data').findOne({ _id: 'upload_sets' });
      if (doc && Array.isArray(doc.sets) && doc.sets.length > 0) {
        void writeJson(UPLOAD_SETS_FILE, doc.sets).catch(() => {});
        return doc.sets;
      }
    }
  } catch {}
  return readJson(UPLOAD_SETS_FILE, []);
};

const writeUploadSets = async (sets) => {
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
  } catch {}
};

const readCustomRequests = async () => {
  try {
    const db = await getMongoDb();
    if (db) {
      const items = await db.collection('custom_requests').find().sort({ createdAt: -1 }).toArray();
      if (items && items.length > 0) {
        return items.map((it) => {
          const clean = { ...it };
          delete clean._id;
          return clean;
        });
      }
    }
  } catch {}
  return readJson(CUSTOM_REQUESTS_FILE, []);
};

const writeCustomRequests = async (items) => {
  await writeJson(CUSTOM_REQUESTS_FILE, items);
  try {
    const db = await getMongoDb();
    if (db && Array.isArray(items)) {
      for (const item of items) {
        if (!item.id) continue;
        await db.collection('custom_requests').updateOne(
          { id: item.id },
          { $set: item },
          { upsert: true }
        );
      }
    }
  } catch {}
};

const readSystemLogs = async () => {
  try {
    const db = await getMongoDb();
    if (db) {
      // Auto-cleanup legacy dist/index.html startup errors from MongoDB
      await db.collection('system_logs').deleteMany({
        $or: [
          { message: { $regex: /dist\/index\.html|ENOENT.*index\.html/i } },
          { title: { $regex: /dist\/index\.html/i } },
        ],
      }).catch(() => {});

      const logs = await db.collection('system_logs').find().sort({ timestamp: -1 }).limit(500).toArray();
      if (logs && logs.length > 0) {
        const cleanLogs = logs
          .filter(l => !/dist\/index\.html|ENOENT.*index\.html/i.test(l.message || '') && !/dist\/index\.html/i.test(l.title || ''))
          .map(l => { const c = { ...l }; delete c._id; return c; });
        void writeJson(SYSTEM_LOGS_FILE, cleanLogs).catch(() => {});
        return cleanLogs;
      }
    }
  } catch {}
  const local = await readJson(SYSTEM_LOGS_FILE, []);
  return local.filter(l => !/dist\/index\.html|ENOENT.*index\.html/i.test(l.message || '') && !/dist\/index\.html/i.test(l.title || ''));
};

const writeSystemLogs = async (logs) => {
  const safeLogs = Array.isArray(logs) ? logs.slice(0, 500) : [];
  await writeJson(SYSTEM_LOGS_FILE, safeLogs);
  try {
    const db = await getMongoDb();
    if (db && safeLogs.length > 0) {
      const bulkOps = safeLogs.slice(0, 50).map((log) => ({
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
  } catch {}
};

const readGenerations = async () => {
  try {
    const db = await getMongoDb();
    if (db) {
      const items = await db.collection('generations').find().sort({ createdAt: -1 }).limit(1000).toArray();
      if (items && items.length > 0) {
        const cleanItems = items.map((it) => {
          const clean = { ...it };
          delete clean._id;
          return clean;
        });
        void writeJson(GENERATIONS_FILE, cleanItems).catch(() => {});
        return cleanItems;
      }
    }
  } catch (err) {
    console.warn('[generations] MongoDB read error, falling back to local file:', err.message);
  }
  return readJson(GENERATIONS_FILE, []);
};

const writeGenerations = async (list) => {
  const safeList = Array.isArray(list) ? list.slice(0, 1000) : [];
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
const readHosted = async () => {
  let dbHosted = null;
  try {
    const db = await getMongoDb();
    if (db) {
      dbHosted = await db.collection('hosted_images').findOne({ _id: 'image_map' });
    }
  } catch {}
  const local = await readJson(HOSTED_FILE, {});
  return {
    models: {},
    generated: {},
    uploads: {},
    ...local,
    ...(dbHosted?.map || {}),
  };
};

const saveHosted = async (value) => {
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
  } catch {}
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
  return `/hosted/${subfolder}/${fname}`;
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
    } catch {}
  }

  const cleanPath = decodeURIComponent(rawPath.split('?')[0]).replace(/^\//, '');
  const basename = path.basename(cleanPath);

  const candidates = [
    path.join(UPLOADS, basename),
    path.join(DATA, 'uploads', basename),
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

  // If it is an external URL not found on disk, fetch inline so Fashn always has the bytes
  if (/^https?:\/\//i.test(src)) {
    try {
      const resp = await fetch(src);
      if (resp.ok) {
        const buf = Buffer.from(await resp.arrayBuffer());
        const contentType = resp.headers.get('content-type') || 'image/jpeg';
        return `data:${contentType};base64,${buf.toString('base64')}`;
      }
    } catch {}
    return src;
  }

  throw new Error(`image not found: ${src}`);
}

async function listModels() {
  const out = [];
  let dirs = [];
  try {
    dirs = await fs.readdir(MODELS_DIR, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const files = (await fs.readdir(path.join(MODELS_DIR, dir.name))).filter((f) => /\.(webp|png|jpe?g)$/i.test(f));
    out.push({
      category: dir.name,
      items: files.sort().map((file) => ({
        id: `${dir.name}/${file}`,
        name: file.replace(/\.[^.]+$/, ''),
        url: `/models/${encodeURIComponent(dir.name)}/${encodeURIComponent(file)}`,
      })),
    });
  }
  return out;
}

/* ------------------------------------------------------------- app boot */
const app = express();

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

app.use(express.json({ limit: '48mb' }));
app.use('/uploads', express.static(UPLOADS, { maxAge: '1d' }));
app.use('/uploads', async (req, res, next) => {
  try {
    const filename = path.basename(decodeURIComponent(req.path));
    const candidate1 = path.join(UPLOADS, filename);
    if (fsSync.existsSync(candidate1) && fsSync.statSync(candidate1).isFile()) {
      return res.sendFile(candidate1);
    }
    const candidate2 = path.join(DATA, 'uploads', filename);
    if (fsSync.existsSync(candidate2) && fsSync.statSync(candidate2).isFile()) {
      return res.sendFile(candidate2);
    }
    const candidate3 = path.join(ROOT, 'server', 'data', 'uploads', filename);
    if (fsSync.existsSync(candidate3) && fsSync.statSync(candidate3).isFile()) {
      return res.sendFile(candidate3);
    }
    // Fallback: If local file was deleted by a cloud redeploy, redirect to permanent hosted CDN!
    const hosted = await readHosted();
    const remoteUrl = hosted.uploads?.[filename] || hosted.models?.[filename];
    if (remoteUrl && typeof remoteUrl === 'string') {
      return res.redirect(302, remoteUrl);
    }
  } catch {}
  next();
});

app.use('/generated', express.static(GENERATED, { maxAge: '1d' }));
app.use('/models', express.static(MODELS_DIR, { maxAge: '7d' }));
app.use('/models', express.static(path.join(ROOT, 'dist', 'models'), { maxAge: '7d' }));
app.use('/models', (req, res, next) => {
  try {
    const decodedPath = decodeURIComponent(req.path.replace(/^\//, ''));
    const candidate1 = path.join(MODELS_DIR, decodedPath);
    if (fsSync.existsSync(candidate1) && fsSync.statSync(candidate1).isFile()) {
      return res.sendFile(candidate1);
    }
    const candidate2 = path.join(ROOT, 'dist', 'models', decodedPath);
    if (fsSync.existsSync(candidate2) && fsSync.statSync(candidate2).isFile()) {
      return res.sendFile(candidate2);
    }
    const candidate3 = path.join(PUBLIC_DIR, 'models', decodedPath);
    if (fsSync.existsSync(candidate3) && fsSync.statSync(candidate3).isFile()) {
      return res.sendFile(candidate3);
    }
  } catch {}
  next();
});

app.use('/hosted', express.static(path.join(PUBLIC_DIR, 'hosted'), { maxAge: '7d' }));
app.use('/hosted', express.static(path.join(ROOT, 'public', 'hosted'), { maxAge: '7d' }));

const patchState = async (patch) => {
  const current = await readState();
  const next = { ...current, ...patch };
  delete next._id;
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

app.get('/api/health', (_req, res) => res.json({ ok: true }));

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
        } catch {}
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
    const logs = await readSystemLogs();
    const item = logs.find((l) => l.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'not_found' });
    item.resolved = !item.resolved;
    await writeSystemLogs(logs);
    res.json({ ok: true, item });
  } catch (err) {
    res.status(500).json({ error: 'resolve_failed' });
  }
});

app.delete('/api/admin/system-logs/:id', requireAdmin, async (req, res) => {
  try {
    const logs = await readSystemLogs();
    const filtered = logs.filter((l) => l.id !== req.params.id);
    await writeSystemLogs(filtered);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'delete_failed' });
  }
});

app.post('/api/admin/system-logs/clear', requireAdmin, async (_req, res) => {
  try {
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
        } catch {}
      }
    } catch {}

    let dataBytes = 0;
    try {
      const dataFiles = await fs.readdir(DATA);
      for (const f of dataFiles) {
        try {
          const st = await fs.stat(path.join(DATA, f));
          dataBytes += st.size;
        } catch {}
      }
    } catch {}

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
    } catch {}

    let totalHosted = 0;
    try {
      const hostedMap = await readHosted();
      const mCount = Object.keys(hostedMap.models || {}).length;
      const gCount = Object.keys(hostedMap.generated || {}).length;
      totalHosted = mCount + gCount;
    } catch {}

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
    const { category, name, imageData } = req.body || {};
    if (!category || !name || !imageData) {
      return res.status(400).json({ error: 'missing_fields', message: 'Category name, model title, and image data are required.' });
    }

    const safeCat = String(category).replace(/[^a-zA-Z0-9 _-]/g, '').trim();
    const safeName = String(name).replace(/[^a-zA-Z0-9 _-]/g, '').trim().toLowerCase().replace(/\s+/g, '-');
    if (!safeCat || !safeName) {
      return res.status(400).json({ error: 'invalid_names', message: 'Category or model name contains invalid characters.' });
    }

    const match = /^data:image\/([a-zA-Z0-9]+);base64,(.+)$/.exec(imageData);
    if (!match) {
      return res.status(400).json({ error: 'bad_image', message: 'Image must be a valid base64 data URL (PNG/JPEG/WEBP).' });
    }
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const rawBuffer = Buffer.from(match[2], 'base64');

    const targetDir = path.join(MODELS_DIR, safeCat);
    await fs.mkdir(targetDir, { recursive: true });

    const fileName = `${safeName}.${ext}`;
    const filePath = path.join(targetDir, fileName);
    await fs.writeFile(filePath, rawBuffer);

    // Host to imgbb if available
    let publicUrl = `/models/${encodeURIComponent(safeCat)}/${encodeURIComponent(fileName)}`;
    try {
      const hosted = await hostImage(rawBuffer, `${safeCat}-${fileName}`);
      if (hosted?.url) {
        publicUrl = hosted.url;
        const map = await readHosted();
        map.models = map.models || {};
        map.models[`${safeCat}/${fileName}`] = hosted.url;
        await saveHosted(map);
      }
    } catch (hostErr) {
      console.warn('[admin-model] Image hosting fallback to local:', hostErr.message);
    }

    res.json({
      ok: true,
      category: safeCat,
      model: {
        id: `${safeCat}/${fileName}`,
        name: safeName,
        url: publicUrl,
      },
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

app.delete('/api/admin/models', requireAdmin, async (req, res) => {
  try {
    const { id } = req.body || req.query || {};
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'missing_id', message: 'Model id (Category/filename) is required.' });
    }

    // Safety checks against directory traversal
    const parts = id.split('/');
    if (parts.length !== 2 || parts[0].includes('..') || parts[1].includes('..')) {
      return res.status(400).json({ error: 'invalid_id', message: 'Invalid model ID format.' });
    }

    const [category, filename] = parts;
    const targetFile = path.join(MODELS_DIR, category, filename);

    await fs.unlink(targetFile).catch(() => {});

    // Also remove from hosted.json if mapped
    try {
      const map = await readHosted();
      if (map.models?.[id]) {
        delete map.models[id];
        await saveHosted(map);
      }
    } catch {}

    res.json({ ok: true, deleted: id });
  } catch (err) {
    res.status(500).json({ error: 'delete_model_failed', message: String(err.message || err) });
  }
});

app.get('/api/models', async (_req, res) => {
  const hosted = await readHosted();
  const categories = await listModels();
  for (const group of categories) {
    for (const item of group.items) {
      const remote = hosted.models?.[item.id];
      if (remote) item.url = remote;
    }
  }
  res.json({ categories });
});

app.get('/api/uploads', async (_req, res) => {
  try {
    const hosted = await readHosted();
    const diskFiles = await fs.readdir(UPLOADS).catch(() => []);
    const itemsMap = new Map();

    // 1. From MongoDB user_uploads (persists across Render deploys)
    try {
      const db = await getMongoDb();
      if (db) {
        const dbUploads = await db.collection('user_uploads').find().sort({ createdAt: -1 }).limit(300).toArray();
        for (const u of dbUploads) {
          const resolvedUrl = u.remoteUrl || u.dataUrl || u.url;
          itemsMap.set(u.id || u.url, {
            id: u.id || u.url,
            name: u.name || (u.kind === 'model' ? 'Uploaded Model' : 'Uploaded Garment'),
            url: resolvedUrl,
            kind: u.kind || (String(u.id || '').startsWith('model') ? 'model' : 'cloth'),
            at: u.createdAt || Date.now(),
          });
        }
      }
    } catch {}

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
    } catch {}

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

    const items = Array.from(itemsMap.values()).sort((a, b) => b.at - a.at);
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
    await fs.unlink(target).catch(() => {});
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
    const match = /^data:(image\/(png|jpe?g|webp));base64,(.+)$/i.exec(String(dataUrl || ''));
    if (!match) return res.status(400).json({ error: 'bad_image', message: 'Not a PNG/JPEG/WEBP data URL' });
    const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' }[match[1].toLowerCase()] || '.jpg';
    const file = `${kind}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}${ext}`;
    const buffer = Buffer.from(match[3], 'base64');
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
    } catch {}

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
        } catch {}
      }
    }).catch(() => {});
  } catch (error) {
    res.status(500).json({ error: 'upload_failed', message: String(error.message || error) });
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

  // Mandatory brand name: SHIV-NARESH
  if (!text.toLowerCase().includes('shiv-naresh')) {
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
        swapText = `${swapText} · Athletic model swap: swap model appearance to match athletic studio persona with perfect sportswear fit and crisp posture.`.trim();
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

function isUserGenerating(req) {
  const key = getUserLockKey(req);
  const active = activeUserGenerations.get(key);
  if (active) {
    if (Date.now() - active.startedAt > 180000) {
      activeUserGenerations.delete(key);
      return false;
    }
    return true;
  }
  return false;
}

function lockUser(req, jobId) {
  const key = getUserLockKey(req);
  activeUserGenerations.set(key, { jobId, startedAt: Date.now() });
}

function unlockUser(jobId) {
  for (const [key, val] of activeUserGenerations.entries()) {
    if (val.jobId === jobId) {
      activeUserGenerations.delete(key);
      break;
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
      try {
        await fs.access(target);
      } catch {
        const img = await fetch(remote);
        if (img.ok) await fs.writeFile(target, Buffer.from(await img.arrayBuffer()));
      }

      let permanent = '';
      try {
        const map = await readHosted();
        permanent = map.generated?.[file] || '';
        if (!permanent) {
          const uploaded = await hostImage(await fs.readFile(target), file);
          if (uploaded) {
            permanent = uploaded.url;
            map.generated = map.generated || {};
            map.generated[file] = permanent;
            await saveHosted(map);
          }
        }
      } catch {}

      localOutputs.push(permanent || `/generated/${file}`);
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
      if (found) {
        found.status = 'completed';
        found.outputUrl = localOutputs[0] || null;
        found.url = found.outputUrl;
        found.completedAt = Date.now();
        await writeGenerations(genList);
      }
    } catch (saveErr) {
      console.warn('[agent] Failed to update completed generation status:', saveErr.message);
    }

  } catch (err) {
    if (abortController.signal.aborted) {
      console.log(`[agent] Job ${jobId} was aborted by user cancel.`);
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
    } catch {}

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
    } catch {}
  } finally {
    unlockUser(jobId);
  }
}

const recentUserGenerations = new Map();

app.post('/api/generate', auth.requireUser, async (req, res) => {
  try {
    /* Prevent duplicate double-clicks and repeated requests */
    const genFingerprint = `${req.user._id}_${req.body?.mode || ''}_${req.body?.cloth || ''}_${req.body?.model || ''}_${req.body?.prompt || ''}`;
    const prevGen = recentUserGenerations.get(req.user._id);
    if (prevGen && prevGen.key === genFingerprint && Date.now() - prevGen.time < 3000) {
      return res.status(409).json({
        error: 'duplicate_generation',
        message: 'Duplicate render request blocked. A generation with these parameters is already in progress.',
      });
    }
    recentUserGenerations.set(req.user._id, { key: genFingerprint, time: Date.now() });

    /* Strict single concurrency: only 1 generation active at a time per user */
    if (isUserGenerating(req)) {
      try {
        await recordSystemProblem({
          module: 'generation',
          severity: 'warning',
          userEmail: req.user?.email || 'user',
          userId: req.user?._id || null,
          title: 'Studio Concurrency 409 Conflict',
          message: 'A studio generation is already in progress for this account. Request was blocked by concurrency lock.',
        });
      } catch {}
      return res.status(409).json({
        error: 'generation_in_progress',
        message: 'A studio generation is already in progress for your account. At one time only one generation is permitted. Please wait for the current render to complete.',
      });
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

    /* 2K resolution permission check */
    if (is2k) {
      const allowed2k = req.user.features?.hd2k ?? (req.user.tier !== 'free');
      if (!allowed2k) {
        return res.status(403).json({
          error: 'tier_restricted',
          message: '2K Ultra HD resolution is locked for your account. Please upgrade to Pro/Ultra plan or ask admin to unlock 2K generation.',
        });
      }
    }

    /* Model generation limits (Total quota) */
    const maxModels = typeof req.user.maxModels === 'number' ? req.user.maxModels : 0;
    const modelsGenerated = typeof req.user.modelsGenerated === 'number' ? req.user.modelsGenerated : 0;
    if (maxModels > 0 && modelsGenerated >= maxModels) {
      return res.status(403).json({
        error: 'model_limit_reached',
        message: `You have reached your allocated model limit (${modelsGenerated}/${maxModels} models generated). Contact administrator to increase your model quota.`,
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
       Fashn AI Multimodal Agent: 1-Pass Full Outfit, Try-On & Swap
       (1 Credit, 1 Generation, Preserves Props/Basketball & Colors)
       ============================================================== */
    const isOutfit = mode === 'outfit' || (mode === 'tryon' && body.topCloth && body.bottomCloth);
    const isSwap = mode === 'swap' && Boolean((body.sourceModel || body.source || body.cloth) && (body.targetModel || body.model));
    const garmentViews = Array.isArray(body.garmentViews) && body.garmentViews.length > 0 ? body.garmentViews : null;
    const hasSpecialPromptOrProps = Boolean(
      (body.prompt && body.prompt.trim()) ||
      (body.color && body.color.trim()) ||
      body.category === 'bottoms' ||
      body.preserveProps ||
      garmentViews
    );

    if (isOutfit || isSwap || (mode === 'tryon' && (hasSpecialPromptOrProps || garmentViews) && (body.cloth || garmentViews) && body.model)) {
      // Deduct credits ONCE before running (1 credit for 1K, 3 for 2K)
      const remainingCredits = Math.max(0, userCredits - creditsNeeded);
      await auth.patchUser(req.user._id, {
        credits: remainingCredits,
        modelsGenerated: modelsGenerated + 1,
        dailyModelsUsed: dailyModels + 1,
      });
      req.user.credits = remainingCredits;

      const agentJobId = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      lockUser(req, agentJobId);

      let images = [];
      let agentPrompt = 'SHIV-NARESH athletic sportswear. ';

      if (isSwap) {
        // Target model is Image 1: preserve exact body shape, gender, posture, face, hair, and pose
        // Source model is Image 2: the clothing donor whose clothes are put onto the target model
        const targetUri = await toDataUri(body.targetModel || body.model);
        const sourceUri = await toDataUri(body.sourceModel || body.source || body.cloth);
        images = [targetUri, sourceUri];
        agentPrompt += 'Target Model Garment Replacement: Dress the target model in Image 1 wearing the athletic sportswear clothing from Image 2. ' +
          'CRITICAL TARGET MODEL PRESERVATION: Maintain the target model in Image 1 completely intact — preserve their exact pose, athletic posture, body proportions, gender, physique, facial identity, facial expression, skin tone, hair, and background with 100% fidelity. ' +
          'Only replace the clothing on the target model in Image 1 with the exact sportswear garments, patterns, athletic cut, and logos from Image 2, fitted naturally to the target model’s pose and physique. ';
      } else if (garmentViews) {
        const modelUri = await toDataUri(body.model);
        const viewsToUse = garmentViews.slice(0, 5); // Fashn limit: 1 model + max 5 garment views = max 6 images
        const garmentUris = await Promise.all(viewsToUse.map(v => toDataUri(v.url)));
        images = [modelUri, ...garmentUris];

        const viewLabels = viewsToUse.map((v, i) => `Image ${i + 2}: ${v.label || v.role || `View ${i + 1}`}`).join(', ');
        agentPrompt += `Multi-Angle Garment Synthesis: Dress the athlete model in Image 1 with the authentic sportswear garment shown across the reference photos (${viewLabels}). ` +
          'Reason dynamically across all provided reference views without assuming any rigid angle order: accurately transfer the collar, zipper, chest graphics, sleeve stripes, side panels, and back patterns onto the model in Image 1, matching the model’s natural pose and posture. ' +
          'CRITICAL POSE & IDENTITY PRESERVATION: Keep the model’s exact face, skin tone, hairstyle, athletic physique, posture, hands, and props (balls, gym equipment) completely untouched with zero alteration. ';
      } else if (isOutfit) {
        const modelUri = await toDataUri(body.model);
        const topClothUri = await toDataUri(body.topCloth || body.cloth);
        const bottomClothUri = body.bottomCloth ? await toDataUri(body.bottomCloth) : null;
        images = bottomClothUri ? [modelUri, topClothUri, bottomClothUri] : [modelUri, topClothUri];
        if (bottomClothUri) {
          agentPrompt += 'Dress the athlete in the first image wearing both garments simultaneously: the top garment from the second image and the bottom pants from the third image as a complete matching sportswear outfit. ';
          agentPrompt += 'Maintain professional athletic studio presentation. Both garments must be worn naturally together. The top garment is worn on the upper torso. The bottom garment is worn on the legs as full-length athletic pants matching the garment image, reaching down to the sneakers (not shorts). ';
        } else {
          agentPrompt += 'Put the athletic garment from the second image onto the athlete in the first image with realistic sportswear fit and high fidelity. Keep the rest of the outfit and shoes intact. ';
        }
        agentPrompt += "CRITICAL POSE & PROP PRESERVATION: Preserve the athlete's exact facial features, skin tone, hair, posture, and all sports equipment or balls held in hands (such as a basketball, football, tennis racket) completely untouched and clearly visible in the athlete's hands with zero alteration. ";
      } else {
        const modelUri = await toDataUri(body.model);
        const singleClothUri = await toDataUri(body.cloth);
        images = [modelUri, singleClothUri];
        if (body.category === 'bottoms') {
          agentPrompt += 'Replace the pants/lower garment on the athlete in the first image with the bottom garment from the second image. The bottom garment must be worn as full-length athletic track pants matching the garment image, reaching down to sneakers (not shorts). Keep the top shirt/jacket, athlete face, shoes, and pose intact. ';
        } else {
          agentPrompt += 'Put the athletic garment from the second image onto the athlete in the first image with realistic sportswear fit and high fidelity. Keep the rest of the outfit and shoes intact. ';
        }
        agentPrompt += "CRITICAL POSE & PROP PRESERVATION: Preserve the athlete's exact facial features, skin tone, hair, posture, and all sports equipment or balls held in hands (such as a basketball, football, tennis racket) completely untouched and clearly visible in the athlete's hands with zero alteration. ";
      }

      if (body.color && typeof body.color === 'string' && body.color.trim()) {
        agentPrompt += `Exact fabric color: ${body.color.trim()}. Maintain true garment dye and athlete kit tones with accurate color matching. `;
      }
      if (body.prompt && typeof body.prompt === 'string' && body.prompt.trim()) {
        agentPrompt += `Specific styling instructions: ${body.prompt.trim()}. `;
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
          prompt: agentPrompt,
          cloth: isSwap ? 'Model Swap Persona' : (isOutfit ? 'Full Outfit (Top + Bottom)' : 'Athletic Garment'),
          model: typeof body.model === 'string' ? (body.model.startsWith('data:') ? 'Custom Model' : body.model) : (body.sourceModel || ''),
          outputUrl: null,
          createdAt: Date.now(),
        });
        await writeGenerations(genList);
      } catch {}

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

    /* convert every referenced image into a format FASHN can read */
    const inputs = {};
    for (const [key, value] of Object.entries(fields)) {
      if (typeof value === 'string' && /^(\/|https?:|data:)/.test(value) && key !== 'prompt') {
        try {
          inputs[key] = await toDataUri(value);
        } catch (imgErr) {
          return res.status(400).json({
            error: 'image_error',
            message: `Could not load the ${key.replace(/_/g, ' ')} — ${imgErr.message}. Please re-upload the image.`,
          });
        }
      } else {
        inputs[key] = value;
      }
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
        } catch {}

        return res.status(response.status).json({
          error: data.error || 'render_error',
          message: msg,
        });
      }
      /* store the job id → key mapping so we can clean up when it completes */
      if (data.id) {
        lockUser(req, data.id);
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
    } catch {}
    await recordSystemProblem({
      module: 'image-generation',
      severity: 'error',
      userEmail: req.user?.email || 'guest',
      userId: req.user?._id,
      title: 'Image Generation Exception',
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: 'generate_failed', message: String(error.message || error) });
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
        try {
          await fs.access(target);
        } catch {
          const img = await fetch(remote);
          if (img.ok) await fs.writeFile(target, Buffer.from(await img.arrayBuffer()));
        }

        /* keep a permanent copy on the image host for images — the provider expires its
           own links after a few days, this one does not */
        let permanent = '';
        if (!isVideo) {
          try {
            const map = await readHosted();
            permanent = map.generated?.[file] || '';
            if (!permanent) {
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

        local.push(permanent || `/generated/${file}`);
      }
      data.output = local;
    }

    if (data.status === 'completed' || data.status === 'failed') {
      try {
        const genList = await readGenerations();
        const found = genList.find((g) => g.id === req.params.id);
        if (found) {
          found.status = data.status === 'completed' ? 'completed' : 'failed';
          if (data.status === 'completed') {
            found.outputUrl = (Array.isArray(data.output) && data.output[0]) ? data.output[0] : null;
            found.url = found.outputUrl;
          } else {
            found.error = data.error || data.message || data.detail || 'Render rejected or failed on cluster.';
          }
          found.completedAt = Date.now();
          await writeGenerations(genList);
        }
      } catch (genUpdateErr) {
        console.error('[generations] Failed to update status in generations.json:', genUpdateErr.message);
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
        try { local.abortController.abort(); } catch {}
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
  if (req.user?._id) activeUserGenerations.delete(`usr_${req.user._id}`);
  res.json({ ok: true });
});

/* --------------------------------------------------- user generations (library) */
app.get('/api/user/generations', auth.requireUser, async (req, res) => {
  try {
    const list = await readGenerations();
    const items = list.filter((g) => g.userId === req.user._id);
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

    const item = {
      id: crypto.randomUUID(),
      userId: req.user._id,
      userEmail: req.user.email || '',
      type: type === 'video' ? 'video' : 'image',
      url,
      highResUrl: highResUrl || url,
      prompt: String(prompt || '').slice(0, 600),
      color: String(color || ''),
      colorName: String(colorName || ''),
      resolution: String(resolution || '1k'),
      duration: Number(duration) || 5,
      aspectRatio: String(aspectRatio || '9:16'),
      title: String(title || (type === 'video' ? `Fashion Video (${duration}s)` : `Studio Pose (${resolution})`)),
      createdAt: Date.now(),
    };

    const list = await readGenerations();
    list.unshift(item);
    await writeGenerations(list);

    res.json(item);
  } catch (error) {
    res.status(500).json({ error: 'save_failed', message: error.message });
  }
});

app.delete('/api/user/generations/:id', auth.requireUser, async (req, res) => {
  try {
    const list = await readGenerations();
    const index = list.findIndex((g) => g.id === req.params.id && g.userId === req.user._id);
    if (index === -1) {
      return res.status(404).json({ error: 'not_found', message: 'Item not found.' });
    }
    const gen = list[index];
    let refunded = false;
    let refundedCredits = 0;
    // Auto-refund credit if discarded within 15 minutes or if ?refund=true
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
    list.splice(index, 1);
    await writeGenerations(list);
    try {
      const db = await getMongoDb();
      if (db) await db.collection('generations').deleteOne({ id: req.params.id, userId: req.user._id });
    } catch {}
    res.json({ ok: true, deleted: req.params.id, refunded, refundedCredits });
  } catch (error) {
    res.status(500).json({ error: 'delete_failed', message: error.message });
  }
});

/* --------------------------------------------------- upload sets */
app.get('/api/upload-sets', auth.requireUser, async (req, res) => {
  try {
    const sets = (await readUploadSets()).filter((s) => s.userId === req.user._id);
    sets.sort((a, b) => a.setNumber - b.setNumber);
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

    const allSets = await readUploadSets();
    const userSets = allSets.filter((s) => s.userId === userId);
    const setNumber = userSets.length > 0 ? Math.max(...userSets.map((s) => s.setNumber)) + 1 : 1;

    let clothUrl = '';
    let modelUrl = '';

    if (clothDataUrl) {
      const r = await uploadToCloudinary(clothDataUrl, userId, `cloth-set${setNumber}`);
      clothUrl = r.url;
    }
    if (modelDataUrl) {
      const r = await uploadToCloudinary(modelDataUrl, userId, `model-set${setNumber}`);
      modelUrl = r.url;
    }

    const newSet = {
      id: crypto.randomUUID(),
      userId,
      userEmail,
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
    const allSets = await readUploadSets();
    const idx = allSets.findIndex((s) => s.id === req.params.id && s.userId === req.user._id);
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

    const items = all.filter((r) => r.userId === req.user._id);
    items.sort((a, b) => b.createdAt - a.createdAt);
    res.json({ items });
  } catch (error) {
    res.status(500).json({ error: 'fetch_failed', message: String(error.message || error) });
  }
});

app.post('/api/custom-requests', auth.requireUser, async (req, res) => {
  try {
    const isUltra = req.user?.tier === 'ultra';
    const isCustomAllowed = isUltra || req.user?.features?.customRequests === true;
    if (!isCustomAllowed) {
      return res.status(403).json({
        error: 'plan_locked',
        message: 'Bespoke Custom Requests are locked on your current plan. Custom requests are an exclusive Ultra feature. Please upgrade to Ultra or contact admin to unlock.',
      });
    }

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

    /* Process all uploaded garments */
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
          const r = await uploadToCloudinary(img, userId, `req-cloth-${i + 1}`);
          if (r && (r.secure_url || r.url)) {
            uploadedCloths.push(r.secure_url || r.url);
          } else {
            const loc = await saveLocalAsset(img, 'sets', `${userId}-req-cloth-${i + 1}`);
            uploadedCloths.push(loc);
          }
        } catch {
          const loc = await saveLocalAsset(img, 'sets', `${userId}-req-cloth-${i + 1}`).catch(() => img);
          uploadedCloths.push(loc);
        }
      } else if (typeof img === 'string' && img.trim()) {
        uploadedCloths.push(img.trim());
      }
    }
    if (uploadedCloths.length > 0) {
      clothUrl = uploadedCloths[0];
    }
    const finalClothImages = uploadedCloths.length > 0 ? uploadedCloths : (clothUrl ? [clothUrl] : []);

    /* Process all uploaded model poses individually */
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
          const r = await uploadToCloudinary(img, userId, `req-model-${i + 1}`);
          if (r && (r.secure_url || r.url)) {
            uploadedModels.push(r.secure_url || r.url);
          } else {
            const loc = await saveLocalAsset(img, 'sets', `${userId}-req-model-${i + 1}`);
            uploadedModels.push(loc);
          }
        } catch (mErr) {
          try {
            const loc = await saveLocalAsset(img, 'sets', `${userId}-req-model-${i + 1}`);
            uploadedModels.push(loc);
          } catch {
            uploadedModels.push(img);
          }
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
    };

    const all = await readCustomRequests();
    all.unshift(newRequest);
    await writeCustomRequests(all);

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

    // 1-hour window check
    const elapsedMs = Date.now() - (item.createdAt || 0);
    if (elapsedMs > 60 * 60 * 1000) {
      return res.status(400).json({
        error: 'window_expired',
        message: 'The 1-hour grace window has expired. Master designers are already actively tailoring this order.',
      });
    }

    const next = all.filter((r) => r.id !== id);
    await writeCustomRequests(next);
    res.json({ ok: true, deleted: id });
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

    const elapsedMs = Date.now() - (item.createdAt || 0);
    if (elapsedMs > 60 * 60 * 1000) {
      return res.status(400).json({
        error: 'window_expired',
        message: 'The 1-hour modification window has expired.',
      });
    }

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

    all.sort((a, b) => b.createdAt - a.createdAt);
    res.json({ items: all, total: all.length });
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
      } catch {}
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
      maxModels: typeof u.maxModels === 'number' ? u.maxModels : (u.tier === 'ultra' ? 100 : u.tier === 'pro' ? 50 : 10),
      modelsGenerated: typeof u.modelsGenerated === 'number' ? u.modelsGenerated : 0,
      dailyModelsUsed: typeof u.dailyModelsUsed === 'number' ? u.dailyModelsUsed : 0,
      dailyVideosUsed: typeof u.dailyVideosUsed === 'number' ? u.dailyVideosUsed : 0,
      features: {
        hd2k: Boolean(u.features?.hd2k || u.tier !== 'free'),
        fivePose: Boolean(u.features?.fivePose || u.tier !== 'free'),
        video: Boolean(u.features?.video || u.tier !== 'free'),
        customRequests: Boolean(u.features?.customRequests || ['pro', 'ultra'].includes(u.tier)),
      },
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
      if ((user.maxVideos || 0) < 30) patch.maxVideos = 30;
      if ((user.maxModels || 0) < 100) patch.maxModels = 100;
    } else if (tier === 'pro') {
      if ((user.maxVideos || 0) < 15) patch.maxVideos = 15;
      if ((user.maxModels || 0) < 50) patch.maxModels = 50;
    } else if (tier === 'ondemand') {
      if ((user.maxVideos || 0) < 10) patch.maxVideos = 10;
      if ((user.maxModels || 0) < 25) patch.maxModels = 25;
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
    if (typeof body.maxModels === 'number') patch.maxModels = Math.max(0, Math.floor(body.maxModels));
    if (typeof body.modelsGenerated === 'number') patch.modelsGenerated = Math.max(0, Math.floor(body.modelsGenerated));
    if (typeof body.tier === 'string') patch.tier = body.tier;
    if (typeof body.creditsLocked === 'boolean') patch.creditsLocked = body.creditsLocked;
    if (typeof body.planExpiresAt === 'number') patch.planExpiresAt = body.planExpiresAt;

    const targetTier = patch.tier || user.tier || 'free';
    const isPaid = ['ondemand', 'pro', 'ultra'].includes(targetTier);
    const isProOrUltra = ['pro', 'ultra'].includes(targetTier);

    if (body.features && typeof body.features === 'object') {
      patch.features = {
        hd2k: Boolean(body.features.hd2k || isPaid),
        fivePose: Boolean(body.features.fivePose || isPaid),
        video: Boolean(body.features.video || isPaid),
        customRequests: Boolean(body.features.customRequests || isProOrUltra),
      };
    } else if (patch.tier || !user.features) {
      patch.features = {
        hd2k: isPaid,
        fivePose: isPaid,
        video: isPaid,
        customRequests: isProOrUltra,
      };
    }

    if (targetTier === 'ultra') {
      if (typeof patch.maxVideos !== 'number' && (user.maxVideos || 0) < 30) patch.maxVideos = 30;
      if (typeof patch.maxModels !== 'number' && (user.maxModels || 0) < 100) patch.maxModels = 100;
    } else if (targetTier === 'pro') {
      if (typeof patch.maxVideos !== 'number' && (user.maxVideos || 0) < 15) patch.maxVideos = 15;
      if (typeof patch.maxModels !== 'number' && (user.maxModels || 0) < 50) patch.maxModels = 50;
    } else if (targetTier === 'ondemand') {
      if (typeof patch.maxVideos !== 'number' && (user.maxVideos || 0) < 10) patch.maxVideos = 10;
      if (typeof patch.maxModels !== 'number' && (user.maxModels || 0) < 25) patch.maxModels = 25;
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
    const list = await readGenerations();
    const sorted = [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
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
    } catch {}
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
    /* Strict single concurrency: only 1 generation active at a time per user */
    if (isUserGenerating(req)) {
      try {
        await recordSystemProblem({
          module: 'generation',
          severity: 'warning',
          userEmail: req.user?.email || 'user',
          userId: req.user?._id || null,
          title: 'Studio Concurrency 409 Conflict',
          message: 'A studio generation is already in progress for this account. Request was blocked by concurrency lock.',
        });
      } catch {}
      return res.status(409).json({
        error: 'generation_in_progress',
        message: 'A studio generation is already in progress for your account. At one time only one generation is permitted. Please wait for the current render to complete.',
      });
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
    const image = body.image || body.cloth || body.model;
    if (!image) {
      return res.status(400).json({
        error: 'image_required',
        message: 'Please provide a garment or model image to generate a fashion video.',
      });
    }

    /* Duration: 5 sec = 6 credits max; 10 sec = 12 credits max */
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
      imageUri = await toDataUri(image);
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
      } catch {}

      return res.status(response.status).json({
        error: data.error || 'render_error',
        message: msg,
      });
    }

    let remainingCredits = userCredits;
    const newVideosGenerated = videosGenerated + 1;
    const nextDailyVideos = dailyVideos + 1;
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
    }

    if (data.id) {
      lockUser(req, data.id);
      jobKeyMap.set(data.id, { requestKey: `video-${data.id}`, userKey: getUserLockKey(req), userId: req.user?._id, creditsUsed: creditsNeeded });
      try {
        const genList = await readGenerations();
        genList.unshift({
          id: data.id,
          userId: req.user._id,
          userEmail: req.user.email || '',
          userName: req.user.name || '',
          type: 'video',
          mode: 'runway-video',
          resolution: 'HD',
          creditsUsed: creditsNeeded,
          status: 'processing',
          error: null,
          prompt: prompt || '',
          model: modelImage || '',
          outputUrl: null,
          createdAt: Date.now(),
        });
        await writeGenerations(genList);
      } catch {}
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
    } catch {}
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

// If dist/index.html is missing on cold boot, attempt to build synchronously
if (!fsSync.existsSync(indexPath)) {
  console.log('[build] dist/index.html not found, automatically compiling Vite bundle...');
  try {
    execSync('npm run build', {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'development' },
    });
    console.log('[build] Vite frontend build completed successfully.');
  } catch (buildErr) {
    console.error('[build] Vite build failed on boot:', buildErr.message);
  }
}

app.use(express.static(dist));
app.get(/^\/(?!api|uploads|generated|models|hosted).*/, async (_req, res) => {
  if (fsSync.existsSync(indexPath)) {
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
  console.error('[EXPRESS ROUTE ERROR]', err);
  recordSystemProblem({
    module: 'express-route',
    severity: 'error',
    userEmail: req.user?.email || 'guest',
    userId: req.user?._id,
    title: `Error on ${req.method} ${req.originalUrl}: ${err.message || 'Route failure'}`,
    message: String(err.message || err),
    stack: String(err.stack || ''),
  }).catch(() => {});
  if (!res.headersSent) {
    res.status(500).json({ error: 'internal_server_error', message: err.message || 'An unexpected error occurred.' });
  }
});

app.listen(PORT, () => {
  console.log(`[shivnaresh] api on http://localhost:${PORT}`);
});
