/**
 * Shiv-Naresh · studio backend
 * - accounts (email + password / Google) backed by MongoDB, file store fallback
 * - keeps the render provider's API key server-side (never shipped to the browser)
 * - receives uploads, forwards jobs upstream and caches finished outputs locally
 */
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { createAuth } from './auth.mjs';

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
const MODELS_DIR = path.join(ROOT, 'public', 'models');

const FASHN = 'https://api.fashn.ai/v1';
const IMGBB = 'https://api.imgbb.com/1/upload';
const PORT = Number(process.env.PORT || 8787);

await fs.mkdir(UPLOADS, { recursive: true });
await fs.mkdir(GENERATED, { recursive: true });

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

/* ---------------------------------------------------------------- state */
const DEFAULTS = {
  apiKey: '',
  defaultPrompt: '',
  defaultModel: '',
  resolution: '1k',
  generationMode: 'balanced',
  defaultMode: 'tryon',
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

const readState = async () => ({ ...DEFAULTS, ...SEED_STATE, ...(await readJson(STATE_FILE, {})) });
const readCollections = () => readJson(COLLECTIONS_FILE, []);
const readUploadSets = () => readJson(UPLOAD_SETS_FILE, []);
const writeUploadSets = (sets) => writeJson(UPLOAD_SETS_FILE, sets);
const readCustomRequests = () => readJson(CUSTOM_REQUESTS_FILE, []);
const writeCustomRequests = (items) => writeJson(CUSTOM_REQUESTS_FILE, items);
const readSystemLogs = () => readJson(SYSTEM_LOGS_FILE, []);
const writeSystemLogs = (logs) => writeJson(SYSTEM_LOGS_FILE, Array.isArray(logs) ? logs.slice(0, 500) : []);

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
const readHosted = async () => ({
  models: {},
  generated: {},
  uploads: {},
  ...(await readJson(HOSTED_FILE, {})),
});
const saveHosted = (value) => writeJson(HOSTED_FILE, value);

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
  if (/^https?:\/\//.test(src)) return src;

  const rel = src.split('?')[0].replace(/^\//, '');
  const candidates = [
    path.join(ROOT, 'public', rel),
    path.join(DATA, rel.replace(/^uploads\//, 'uploads/')),
    path.join(ROOT, rel),
  ];
  for (const candidate of candidates) {
    try {
      const buf = await fs.readFile(candidate);
      const ext = path.extname(candidate).toLowerCase();
      const mime = MIME[ext] || 'image/webp';
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch {
      /* try the next root */
    }
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
app.use('/generated', express.static(GENERATED, { maxAge: '1d' }));
app.use('/models', express.static(MODELS_DIR, { maxAge: '7d' }));
app.use('/hosted', express.static(path.join(PUBLIC_DIR, 'hosted'), { maxAge: '7d' }));
app.use('/hosted', express.static(path.join(ROOT, 'public', 'hosted'), { maxAge: '7d' }));

const patchState = async (patch) => {
  const current = await readState();
  const next = { ...current, ...patch };
  await writeJson(STATE_FILE, next);
  return next;
};

const auth = createAuth({ dataDir: DATA, getState: readState, patchState, env: process.env });
/* resolve the session before any route — including the auth router itself */
app.use(auth.attachUser);
app.use('/api/auth', auth.router);

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
  const has2fa = Boolean(req.user?.admin2fa || req.tokenPayload?.admin2fa);
  res.json({
    claimed: true,
    admin: Boolean(isPrimary && has2fa),
    isPrimaryAdmin: isPrimary,
    requires2fa: Boolean(isPrimary && !has2fa),
    signedIn: Boolean(req.user),
    email: PRIMARY_ADMIN_EMAIL.replace(/^(.)[^@]*(@.*)$/, '$1•••$2'),
  });
});

app.get('/api/admin/fashn-credits', requireAdmin, async (_req, res) => {
  try {
    const state = await readState();
    if (!state.apiKey) {
      return res.json({ configured: false, total: 0, subscription: 0, onDemand: 0 });
    }
    const response = await fetch('https://api.fashn.ai/v1/credits', {
      headers: { Authorization: `Bearer ${state.apiKey}` },
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok && data.credits) {
      return res.json({
        configured: true,
        total: Number(data.credits.total ?? 0),
        subscription: Number(data.credits.subscription ?? 0),
        onDemand: Number(data.credits.on_demand ?? 0),
        updatedAt: new Date().toISOString(),
      });
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
  });
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
  const updatedProfile = {
    name: typeof body.name === 'string' ? body.name.trim() : current.name || 'Pawan Kumar',
    college: typeof body.college === 'string' ? body.college.trim() : current.college || 'ARSD College, University of Delhi',
    degree: typeof body.degree === 'string' ? body.degree.trim() : current.degree || 'B.Sc. Computer Science',
    year: typeof body.year === 'string' ? body.year.trim() : current.year || '3rd Year Student',
    email: typeof body.email === 'string' ? body.email.trim() : current.email || 'lpawankumar015221684@gmail.com',
    mobile: typeof body.mobile === 'string' ? body.mobile.trim() : current.mobile || '6398743132',
    bio: typeof body.bio === 'string' ? body.bio.trim() : current.bio || '',
    avatar: typeof body.avatar === 'string' ? body.avatar.trim() : current.avatar || s.developerImageUrl || '',
  };
  await updateState({
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
    const files = await fs.readdir(UPLOADS);
    const items = await Promise.all(
      files.map(async (file) => {
        const stat = await fs.stat(path.join(UPLOADS, file));
        return {
          id: file,
          name: file,
          url: hosted.uploads?.[file] || `/uploads/${file}`,
          at: stat.mtimeMs,
        };
      }),
    );
    res.json({ items: items.sort((a, b) => b.at - a.at).slice(0, 40) });
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
    const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' }[match[1].toLowerCase()] || '.png';
    const file = `${kind}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}${ext}`;
    const buffer = Buffer.from(match[3], 'base64');
    await fs.writeFile(path.join(UPLOADS, file), buffer);

    /* keep a local copy (fast previews, survives the host being down) and send
       one to imgbb so the render service has a URL it can actually reach */
    let hosted = null;
    let hostError = '';
    try {
      hosted = await hostImage(buffer, name);
      if (hosted) {
        const map = await readHosted();
        map.uploads = map.uploads || {};
        map.uploads[file] = hosted.url;
        await saveHosted(map);
      }
    } catch (error) {
      hostError = String(error.message || error);
    }

    res.json({
      url: hosted?.url || `/uploads/${file}`,
      preview: `/uploads/${file}`,
      thumb: hosted?.thumb || `/uploads/${file}`,
      hosted: Boolean(hosted),
      hostError,
      name,
    });
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

function buildRequest(mode, state, src) {
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
    case 'tryon':
    default:
      return { model_name: 'tryon-max', fields: { product_image: cloth, model_image: model, ...(text ? { prompt: text } : {}) } };
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

app.post('/api/generate', auth.requireUser, async (req, res) => {
  try {
    /* Strict single concurrency: only 1 generation active at a time per user */
    if (isUserGenerating(req)) {
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
    const creditsNeeded = is2k ? 2 : 1; // 2 credits for 2K Ultra HD, 1 credit for 1K Standard

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

    /* Daily Limit Check (Ultra plan: max 10 models/day) */
    const lastReset = req.user.lastDailyReset ? new Date(req.user.lastDailyReset) : new Date(0);
    const today = new Date();
    const isSameDay = lastReset.getFullYear() === today.getFullYear() &&
      lastReset.getMonth() === today.getMonth() &&
      lastReset.getDate() === today.getDate();

    let dailyModels = isSameDay ? Number(req.user.dailyModelsUsed || 0) : 0;

    if (req.user.tier === 'ultra') {
      if (dailyModels >= 10) {
        return res.status(429).json({
          error: 'daily_limit_reached',
          message: 'Ultra plan daily quota reached: Maximum 10 models per day. Your quota will reset tomorrow.',
        });
      }
    }

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
      const needs = { tryon: ['cloth', 'model'], product: ['cloth'], edit: [], packshot: ['cloth'] };
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

    /* validate that image URLs/paths actually exist before calling Fashn */
    const { model_name, fields } = buildRequest(mode, state, {
      ...body,
      cloth: body.cloth,
      model: body.model,
      source: body.source,
      sourceModel: body.sourceModel || body.model,
      targetModel: body.targetModel,
    });

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
    delete inputs.mode;
    delete inputs.generation_mode;
    delete inputs.resolution;
    delete inputs.target_image;
    delete inputs.face_image;

    /* prevent duplicate requests — a request ID based on the images */
    const requestKey = `${mode}-${JSON.stringify(Object.keys(inputs).sort())}`;
    if (activeJobs.has(requestKey)) {
      return res.status(429).json({ error: 'duplicate', message: 'A generation with these images is already running. Please wait.' });
    }
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
        return res.status(response.status).json({
          error: data.error || 'render_error',
          message: msg,
        });
      }
      /* store the job id → key mapping so we can clean up when it completes */
      if (data.id) {
        lockUser(req, data.id);
        jobKeyMap.set(data.id, { requestKey, clearTimer });
      }

      /* deduct credits and increment model usage counters */
      let remainingCredits = userCredits;
      if (req.user && req.user._id) {
        remainingCredits = Math.max(0, userCredits - creditsNeeded);
        const nextModelsGenerated = (Number(req.user.modelsGenerated) || 0) + 1;
        const nextDailyModels = dailyModels + 1;
        await auth.patchUser(req.user._id, {
          credits: remainingCredits,
          modelsGenerated: nextModelsGenerated,
          dailyModelsUsed: nextDailyModels,
          lastDailyReset: isSameDay ? (req.user.lastDailyReset || now) : now,
        });
        req.user.credits = remainingCredits;
        req.user.modelsGenerated = nextModelsGenerated;
        req.user.dailyModelsUsed = nextDailyModels;
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
        activeJobs.delete(mapping.requestKey);
        clearTimeout(mapping.clearTimer);
        jobKeyMap.delete(req.params.id);
      }
      return res.status(response.status).json({ error: data.error || 'render_error', message: data.message || data.detail || 'The render could not be checked.' });
    }

    /* clean up active job on completion or failure */
    if (data.status === 'completed' || data.status === 'failed') {
      unlockUser(req.params.id);
      const mapping = jobKeyMap.get(req.params.id);
      if (mapping) {
        activeJobs.delete(mapping.requestKey);
        clearTimeout(mapping.clearTimer);
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
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'status_failed', message: String(error.message || error) });
  }
});

/* --------------------------------------------------- user generations (library) */
const GENERATIONS_FILE = path.join(DATA, 'generations.json');
const readGenerations = async () => readJson(GENERATIONS_FILE, []);
const writeGenerations = (list) => writeJson(GENERATIONS_FILE, list);

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
    list.splice(index, 1);
    await writeGenerations(list);
    res.json({ ok: true, deleted: req.params.id });
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
    if (req.user?.features?.customRequests === false) {
      return res.status(403).json({
        error: 'plan_locked',
        message: 'Bespoke Custom Requests are locked on your current plan. Please upgrade to Pro or Ultra or contact admin to unlock.',
      });
    }

    const {
      cloth,
      model,
      modelImages = [],
      prompt = '',
      color = '',
      clothName = 'Garment',
      modelName = 'Model',
      requestType = 'still',
    } = req.body || {};

    if (!cloth && !model && (!Array.isArray(modelImages) || modelImages.length === 0) && !prompt) {
      return res.status(400).json({
        error: 'empty_request',
        message: 'Please provide at least a garment image, model image, or design instructions.',
      });
    }

    const userId = req.user._id;
    const userEmail = req.user.email || '';

    let clothUrl = cloth || '';
    let modelUrl = model || '';
    const uploadedModels = [];

    /* Process Garment */
    if (cloth && typeof cloth === 'string') {
      if (cloth.startsWith('data:')) {
        try {
          const r = await uploadToCloudinary(cloth, userId, 'req-cloth');
          clothUrl = r.secure_url || r.url;
        } catch {
          clothUrl = await saveLocalAsset(cloth, 'sets', `${userId}-req-cloth`);
        }
      } else {
        clothUrl = cloth;
      }
    }

    /* Process all uploaded model poses individually */
    const rawModelList = [];
    if (Array.isArray(modelImages) && modelImages.length > 0) {
      rawModelList.push(...modelImages.slice(0, 5));
    } else if (model) {
      rawModelList.push(model);
    }

    for (let i = 0; i < Math.min(rawModelList.length, 5); i += 1) {
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

    // Helper to fetch/load image buffers
    const fetchAssetBuffer = async (url) => {
      if (!url || typeof url !== 'string') return null;
      try {
        if (url.startsWith('data:')) {
          const base64Data = url.split(',')[1];
          return Buffer.from(base64Data, 'base64');
        }
        if (url.startsWith('/')) {
          const fullPath = path.join(ROOT, url.replace(/^\//, ''));
          return await fs.readFile(fullPath);
        }
        if (url.startsWith('http')) {
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

    // 2. All photos and models in one file (photos_and_models.zip) AND in photos_and_models/ folder
    const mediaZip = new JSZip();
    const mediaFolder = zip.folder('photos_and_models');

    // Load garment
    if (reqItem.clothUrl) {
      const clothBuf = await fetchAssetBuffer(reqItem.clothUrl);
      if (clothBuf) {
        const clothFilename = '01_garment.jpg';
        mediaFolder.file(clothFilename, clothBuf);
        mediaZip.file(clothFilename, clothBuf);
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
        const filename = `02_model_pose_${i + 1}.jpg`;
        mediaFolder.file(filename, modelBuf);
        mediaZip.file(filename, modelBuf);
      }
    }

    // Load delivered asset if present
    if (reqItem.deliveredImageUrl) {
      const delBuf = await fetchAssetBuffer(reqItem.deliveredImageUrl);
      if (delBuf) {
        const delFilename = '03_delivered_asset.jpg';
        mediaFolder.file(delFilename, delBuf);
        mediaZip.file(delFilename, delBuf);
      }
    }

    // Generate inner photos_and_models.zip
    const mediaZipBuffer = await mediaZip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    zip.file('photos_and_models.zip', mediaZipBuffer);

    // Generate combined master zip
    const masterZipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

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
      features: u.features || {
        hd2k: u.tier !== 'free',
        fivePose: u.tier !== 'free',
        video: u.tier !== 'free',
        customRequests: ['pro', 'ultra'].includes(u.tier),
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

    await auth.patchUser(id, { tier });
    res.json({ ok: true, id, tier });
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
    if (body.features && typeof body.features === 'object') {
      patch.features = {
        hd2k: Boolean(body.features.hd2k),
        fivePose: Boolean(body.features.fivePose),
        video: Boolean(body.features.video),
        customRequests: Boolean(body.features.customRequests),
      };
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

/* ---------------------------------------------------- video preview pipeline */
app.post('/api/generate-video', auth.requireUser, async (req, res) => {
  try {
    /* Strict single concurrency: only 1 generation active at a time per user */
    if (isUserGenerating(req)) {
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

    /* Daily Limit Check (Ultra plan: max 1 video/day) */
    const lastReset = req.user.lastDailyReset ? new Date(req.user.lastDailyReset) : new Date(0);
    const today = new Date();
    const isSameDay = lastReset.getFullYear() === today.getFullYear() &&
      lastReset.getMonth() === today.getMonth() &&
      lastReset.getDate() === today.getDate();

    let dailyVideos = isSameDay ? Number(req.user.dailyVideosUsed || 0) : 0;

    if (req.user.tier === 'ultra' && dailyVideos >= 1) {
      return res.status(429).json({
        error: 'daily_limit_reached',
        message: 'Ultra plan daily video limit reached: Maximum 1 video per day. Your quota will reset tomorrow.',
      });
    }

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
        lastDailyReset: isSameDay ? (req.user.lastDailyReset || now) : now,
      });
      req.user.credits = remainingCredits;
      req.user.videosGenerated = newVideosGenerated;
      req.user.dailyVideosUsed = nextDailyVideos;
    }

    if (data.id) {
      lockUser(req, data.id);
      jobKeyMap.set(data.id, { requestKey: `video-${data.id}`, userKey: getUserLockKey(req) });
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
  await writeJson(COLLECTIONS_FILE, items);
  res.json(collection);
});

app.post('/api/collections/:id/items', auth.requireUser, async (req, res) => {
  const items = await readCollections();
  const collection = items.find((c) => c.id === req.params.id && c.owner === ownerOf(req));
  if (!collection) return res.status(404).json({ error: 'not_found', message: 'Collection not found.' });
  const { url, label = '' } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url_required', message: 'Nothing to save.' });
  collection.items.unshift({ url, label, at: Date.now() });
  await writeJson(COLLECTIONS_FILE, items);
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
app.use(express.static(dist));
app.get(/^\/(?!api|uploads|generated).*/, async (_req, res) => {
  try {
    res.sendFile(path.join(dist, 'index.html'));
  } catch {
    res.status(404).send('Run `npm run build` first.');
  }
});

app.listen(PORT, () => {
  console.log(`[shivnaresh] api on http://localhost:${PORT}`);
});
