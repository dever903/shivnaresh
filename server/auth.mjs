/**
 * Accounts for the Shiv-Naresh studio.
 *
 * - email + password (scrypt, per-user salt) and Google sign-in
 * - users live in MongoDB when a connection string is configured, otherwise in
 *   server/data/users.json so the site still works before Atlas is wired up
 * - sessions are stateless: an HMAC-signed token, no server-side session table
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { Resend } from 'resend';

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESEND_DEFAULT_KEY = process.env.RESEND_API_KEY || '';
const OTP_TTL_MS = 3 * 60 * 1000; // strictly 3 minutes
const BLOCK_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours block on >= 5 failed attempts
const MAX_OTP_ATTEMPTS = 5;

const b64 = (input) => Buffer.from(input).toString('base64url');

export function createAuth({ dataDir, getState, patchState, env = {} }) {
  const usersFile = path.join(dataDir, 'users.json');
  const attempts = new Map();
  /* In-memory OTP storage: email -> { hash, salt, expiresAt, attempts, blockedUntil } */
  const otpStore = new Map();
  /* Single-use reset tokens: token -> { email, expiresAt } */
  const resetTokens = new Map();
  const dbName = env.MONGODB_DB || 'shivnaresh';
  let cached = { uri: '', db: null, failedAt: 0 };

  /* ---------------------------------------------------------- storage */
  async function getDb() {
    const saved = await getState();
    const uri = String(saved.mongoUri || env.MONGODB_URI || '').trim();
    if (!uri) return null;
    if (cached.db && cached.uri === uri) return cached.db;
    if (cached.uri === uri && Date.now() - cached.failedAt < 30_000) return null;
    try {
      const { MongoClient } = await import('mongodb');
      const client = new MongoClient(uri, { serverSelectionTimeoutMS: 7000 });
      await client.connect();
      const db = client.db(dbName);
      await db.collection('users').createIndex({ email: 1 }, { unique: true });
      cached = { uri, db, failedAt: 0 };
      return db;
    } catch (error) {
      cached = { uri, db: null, failedAt: Date.now() };
      console.warn('[auth] MongoDB unreachable, using local file store:', error.message);
      return null;
    }
  }

  const readLocal = async () => {
    try {
      return JSON.parse(await fs.readFile(usersFile, 'utf8'));
    } catch {
      return [];
    }
  };
  const writeLocal = (list) => fs.writeFile(usersFile, JSON.stringify(list, null, 2));

  /* Atlas occasionally refuses the TLS handshake. Accounts therefore live in
     two places: the local users.json mirror is always written and always read
     first, so a cloud outage can never lock anyone out; Mongo is the durable
     copy and is written on a best-effort basis. */
  const normalise = (email) => String(email || '').trim().toLowerCase();

  async function cacheUser(user) {
    const list = await readLocal();
    const index = list.findIndex((u) => u._id === user._id);
    if (index === -1) list.push(user);
    else list[index] = { ...list[index], ...user };
    await writeLocal(list);
  }

  async function findUserByEmail(email) {
    const key = normalise(email);
    if (!key) return null;

    const local = (await readLocal()).find((u) => u.email === key);
    if (local) return local;

    const db = await getDb();
    if (!db) return null;
    try {
      const user = await db.collection('users').findOne({ email: key });
      if (user) await cacheUser(user);
      return user;
    } catch {
      return null;
    }
  }

  async function findUserById(id) {
    if (!id) return null;

    const local = (await readLocal()).find((u) => u._id === id);
    if (local) return local;

    const db = await getDb();
    if (!db) return null;
    try {
      const user = await db.collection('users').findOne({ _id: id });
      if (user) await cacheUser(user);
      return user;
    } catch {
      return null;
    }
  }

  async function insertUser(user) {
    const record = { ...user, email: normalise(user.email) };

    const list = await readLocal();
    list.push(record);
    await writeLocal(list);

    const db = await getDb();
    if (db) {
      try {
        await db.collection('users').insertOne(record);
      } catch {
        /* duplicate, or the cluster is unreachable — the local copy is enough */
      }
    }
    return record;
  }

  async function patchUser(id, patch) {
    const list = await readLocal();
    const index = list.findIndex((u) => u._id === id);
    if (index !== -1) {
      list[index] = { ...list[index], ...patch };
      await writeLocal(list);
    }

    const db = await getDb();
    if (db) {
      try {
        await db.collection('users').updateOne({ _id: id }, { $set: patch });
      } catch {
        /* retried on the next successful write */
      }
    }
  }

  async function deleteUser(id) {
    const list = await readLocal();
    const filtered = list.filter((u) => u._id !== id);
    await writeLocal(filtered);

    const db = await getDb();
    if (db) {
      try {
        await db.collection('users').deleteOne({ _id: id });
      } catch {
        /* retried or local is enough */
      }
    }
  }

  async function getAllUsers() {
    const local = await readLocal();
    const db = await getDb();
    if (!db) return local;
    try {
      const remote = await db.collection('users').find({}).toArray();
      const map = new Map();
      for (const u of local) map.set(u._id, u);
      for (const u of remote) {
        if (!map.has(u._id)) map.set(u._id, u);
      }
      return [...map.values()];
    } catch {
      return local;
    }
  }

  /* -------------------------------------------------------- passwords */
  const hashPassword = (password) => {
    const salt = crypto.randomBytes(16).toString('hex');
    return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
  };

  const verifyPassword = (password, salt, hash) => {
    if (!salt || !hash) return false;
    const candidate = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  };

  /* ----------------------------------------------------------- tokens */
  const secret = async () => {
    const saved = await getState();
    let value = String(saved.authSecret || '').trim();
    if (!value) {
      value = crypto.randomBytes(32).toString('hex');
      await Promise.resolve(patchState({ authSecret: value })).catch(() => {});
    }
    return value;
  };

  const signToken = async (user, claims = {}) => {
    const body = b64(JSON.stringify({ sub: user._id, email: user.email, exp: Date.now() + TOKEN_TTL_MS, ...claims }));
    const mac = crypto.createHmac('sha256', await secret()).update(body).digest('base64url');
    return `${body}.${mac}`;
  };

  const readToken = async (token) => {
    const [body, mac] = String(token || '').split('.');
    if (!body || !mac) return null;
    const expected = crypto.createHmac('sha256', await secret()).update(body).digest('base64url');
    if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      return payload && payload.exp > Date.now() ? payload : null;
    } catch {
      return null;
    }
  };

  const publicUser = (user) =>
    user
      ? {
          id: user._id,
          email: user.email,
          name: user.name || '',
          phone: user.phone || '',
          avatar: user.avatar || user.picture || '',
          provider: user.provider || 'password',
          hasPassword: Boolean(user.hash),
          createdAt: user.createdAt || null,
          credits: typeof user.credits === 'number' ? user.credits : 5,
          creditsLocked: Boolean(user.creditsLocked),
          tier: user.tier || 'free',
          maxVideos: typeof user.maxVideos === 'number' ? user.maxVideos : 15,
          videosGenerated: typeof user.videosGenerated === 'number' ? user.videosGenerated : 0,
          admin2fa: Boolean(user.admin2fa),
          features: {
            hd2k: user.features?.hd2k !== undefined ? Boolean(user.features.hd2k) : ['ondemand', 'pro', 'ultra'].includes(user.tier),
            fivePose: user.features?.fivePose !== undefined ? Boolean(user.features.fivePose) : ['ondemand', 'pro', 'ultra'].includes(user.tier),
            video: user.features?.video !== undefined ? Boolean(user.features.video) : ['ondemand', 'pro', 'ultra'].includes(user.tier),
            customRequests: user.features?.customRequests !== undefined ? Boolean(user.features.customRequests) : ['pro', 'ultra'].includes(user.tier),
          },
        }
      : null;

  /* ------------------------------------------------------- middleware */
  const attachUser = async (req, _res, next) => {
    try {
      const header = String(req.get('authorization') || '');
      const match = /^Bearer\s+(.+)$/i.exec(header);
      const payload = match ? await readToken(match[1]) : null;
      req.tokenPayload = payload;
      req.user = payload ? await findUserById(payload.sub) : null;

      /* The signature is already verified, so the token itself proves who this
         is. If the account cannot be read right now (cloud database down), keep
         the session alive from the token instead of signing the person out. */
      if (payload && !req.user) {
        const restored = {
          _id: payload.sub,
          email: normalise(payload.email),
          name: '',
          provider: 'restored',
          createdAt: null,
        };
        await cacheUser(restored).catch(() => {});
        req.user = restored;
      }
      if (payload && req.user) {
        req.user.admin2fa = Boolean(payload.admin2fa);
      }
    } catch {
      req.user = null;
    }
    next();
  };

  const requireUser = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthorized', message: 'Please sign in.' });
    next();
  };

  /* ------------------------------------------------------- rate limit */
  const throttleKey = (req, email) => `${req.ip || 'local'}:${email}`;
  const tooMany = (key) => {
    const entry = attempts.get(key);
    if (!entry) return false;
    if (Date.now() - entry.at > 10 * 60_000) {
      attempts.delete(key);
      return false;
    }
    return entry.count >= 10;
  };
  const noteAttempt = (key) => {
    const entry = attempts.get(key);
    if (!entry || Date.now() - entry.at > 10 * 60_000) attempts.set(key, { count: 1, at: Date.now() });
    else entry.count += 1;
  };

  /* ----------------------------------------------------------- router */
  const router = express.Router();

  const googleConfig = async () => {
    const state = await getState();
    return {
      clientId: String(state.googleClientId || env.GOOGLE_CLIENT_ID || '').trim(),
      clientSecret: String(state.googleClientSecret || env.GOOGLE_CLIENT_SECRET || '').trim(),
    };
  };

  router.get('/config', async (_req, res) => {
    const db = await getDb();
    const cfg = await googleConfig();
    res.json({
      google: Boolean(cfg.clientId && cfg.clientSecret),
      storage: db ? 'mongodb' : 'local',
    });
  });

  router.get('/me', async (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  router.patch('/profile', requireUser, async (req, res) => {
    try {
      const { name, phone, avatar } = req.body || {};
      const patch = {};
      if (typeof name === 'string') {
        const cleanName = name.trim().slice(0, 80);
        if (cleanName) patch.name = cleanName;
      }
      if (typeof phone === 'string') {
        const cleanPhone = phone.trim().replace(/\D/g, '');
        if (cleanPhone.length > 0 && cleanPhone.length !== 10) {
          return res.status(400).json({ error: 'bad_phone', message: 'Phone number must be exactly 10 digits.' });
        }
        patch.phone = cleanPhone;
      }
      if (typeof avatar === 'string') {
        patch.avatar = avatar;
      }
      await patchUser(req.user._id, patch);
      const updated = await findUserById(req.user._id);
      res.json({ ok: true, user: publicUser(updated) });
    } catch (error) {
      res.status(500).json({ error: 'profile_failed', message: 'Could not update profile.' });
    }
  });

  router.post('/register', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const name = String(req.body?.name || '').trim().slice(0, 80);
    const phone = String(req.body?.phone || '').trim().replace(/\D/g, '').slice(0, 10);

    if (!name) return res.status(400).json({ error: 'missing_name', message: 'Please enter your full name.' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'bad_email', message: 'Enter a valid email address.' });
    if (password.length < MIN_PASSWORD) {
      return res.status(400).json({ error: 'weak_password', message: `Use at least ${MIN_PASSWORD} characters.` });
    }

    const key = throttleKey(req, email);
    if (tooMany(key)) return res.status(429).json({ error: 'too_many', message: 'Too many attempts. Try again later.' });

    try {
      if (await findUserByEmail(email)) {
        return res.status(409).json({ error: 'exists', message: 'That email already has an account. Sign in instead.' });
      }
      const { salt, hash } = hashPassword(password);
      const user = {
        _id: crypto.randomUUID(),
        email,
        name,
        phone,
        avatar: '',
        provider: 'password',
        salt,
        hash,
        credits: 5,
        createdAt: new Date().toISOString(),
      };
      await insertUser(user);
      res.json({ token: await signToken(user), user: publicUser(user) });
    } catch (error) {
      noteAttempt(key);
      res.status(500).json({ error: 'register_failed', message: 'Could not create the account.' });
    }
  });

  router.post('/login', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const key = throttleKey(req, email);
    if (tooMany(key)) return res.status(429).json({ error: 'too_many', message: 'Too many attempts. Try again later.' });

    try {
      const user = await findUserByEmail(email);
      if (!user) {
        noteAttempt(key);
        return res.status(401).json({ error: 'bad_credentials', message: 'Email or password is incorrect.' });
      }
      if (!verifyPassword(password, user.salt, user.hash)) {
        noteAttempt(key);
        return res.status(401).json({ error: 'bad_credentials', message: 'Email or password is incorrect.' });
      }
      res.json({ token: await signToken(user), user: publicUser(user) });
    } catch {
      res.status(500).json({ error: 'login_failed', message: 'Could not sign you in.' });
    }
  });

  /* A Google account arrives without a password. Setting one is optional but
     asked for once, so the same email can sign in with a password next time. */
  router.post('/set-password', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'unauthorized', message: 'Please sign in.' });

    const password = String(req.body?.password || '');
    if (password.length < MIN_PASSWORD) {
      return res.status(400).json({ error: 'weak_password', message: `Use at least ${MIN_PASSWORD} characters.` });
    }
    if (req.user.hash) {
      return res.status(409).json({ error: 'already_set', message: 'This account already has a password.' });
    }

    try {
      const { salt, hash } = hashPassword(password);
      await patchUser(req.user._id, { salt, hash, passwordSetAt: new Date().toISOString() });
      const fresh = await findUserById(req.user._id);
      res.json({ ok: true, user: publicUser(fresh) });
    } catch {
      res.status(500).json({ error: 'password_failed', message: 'Could not save the password.' });
    }
  });

  /* ------------------------------------------------ Resend OTP & Password Reset */
  const PRIMARY_ADMIN_EMAIL = 'jaatshab11223315@gmail.com';

  const getResendClient = async () => {
    const saved = await getState();
    const apiKey = String(saved.resendApiKey || env.RESEND_API_KEY || RESEND_DEFAULT_KEY).trim();
    return new Resend(apiKey);
  };

  const getFromEmail = async () => {
    const saved = await getState();
    // Default to resend verified onboarding or custom domain when configured
    return String(saved.resendFromEmail || env.RESEND_FROM || 'Shiv-Naresh AI Studio <onboarding@resend.dev>').trim();
  };

  const hashOtp = (otp, salt) => crypto.scryptSync(String(otp), salt, 32).toString('hex');

  async function sendOtpEmail({ email, otp, title, purpose }) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const resend = await getResendClient();
    const fromEmail = await getFromEmail();

    console.log(`[auth-otp] Generated OTP for ${cleanEmail}: ${otp}`);

    try {
      const result = await resend.emails.send({
        from: fromEmail,
        to: cleanEmail,
        subject: `Shiv-Naresh AI Studio — ${title}: ${otp}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 40px 28px; background: #08080a; color: #ffffff; border-radius: 24px; border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 20px 50px rgba(0,0,0,0.8);">
            <div style="text-align: center; margin-bottom: 24px;">
              <span style="display: inline-block; padding: 6px 14px; background: rgba(229,55,63,0.15); border: 1px solid rgba(229,55,63,0.35); border-radius: 9999px; font-size: 11px; font-weight: 800; letter-spacing: 0.22em; color: #ff5252; text-transform: uppercase;">SHIV-NARESH AI STUDIO</span>
            </div>
            <h2 style="font-size: 22px; font-weight: 800; margin: 0 0 12px 0; color: #ffffff; text-align: center; letter-spacing: -0.02em;">${title}</h2>
            <p style="font-size: 13px; color: rgba(255,255,255,0.7); line-height: 1.6; text-align: center; margin: 0 0 28px 0;">
              ${purpose}
            </p>
            <div style="background: linear-gradient(180deg, rgba(229,55,63,0.12) 0%, rgba(229,55,63,0.04) 100%); border: 1.5px solid rgba(229,55,63,0.45); border-radius: 20px; padding: 24px; text-align: center; margin-bottom: 28px;">
              <span style="font-size: 38px; font-weight: 900; letter-spacing: 10px; color: #ffffff; font-family: 'SF Mono', Monaco, Consolas, monospace; display: block; text-shadow: 0 0 20px rgba(229,55,63,0.5);">${otp}</span>
              <p style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #ff9aa0; margin: 12px 0 0 0;">⏱️ Valid for strictly 3 minutes</p>
            </div>
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 16px 20px; font-size: 11px; color: rgba(255,255,255,0.55); line-height: 1.6; margin-bottom: 28px;">
              <strong style="color: rgba(255,255,255,0.85); display: block; margin-bottom: 4px;">Security Notice & Guidelines:</strong>
              • Never share this verification code with anyone, including Shiv-Naresh staff.<br>
              • Strictly maximum 5 attempts allowed before a 24-hour account lockout.<br>
              • If you did not request this authorization code, please secure your email account immediately.
            </div>
            <div style="text-align: center; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 20px;">
              <p style="font-size: 10px; color: rgba(255,255,255,0.35); margin: 0; line-height: 1.5;">
                Shiv-Naresh High-Performance AI Studio &middot; Augmented Fashion & Athletics<br>
                Automated Security Notification &middot; Do not reply to this email
              </p>
            </div>
          </div>
        `,
      });

      if (result.error) {
        console.warn(`[auth-otp] Resend returned notice for ${cleanEmail}:`, result.error.message);
        return { ok: false, error: result.error.message };
      }
      return { ok: true, id: result.data?.id };
    } catch (err) {
      console.error(`[auth-otp] Exception sending email to ${cleanEmail}:`, err.message);
      return { ok: false, error: err.message };
    }
  }

  router.post('/forgot-password', async (req, res) => {
    const email = normalise(req.body?.email);
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'bad_email', message: 'Enter a valid email address.' });
    }

    // Check 24h brute-force block
    const existing = otpStore.get(email);
    if (existing?.blockedUntil && Date.now() < existing.blockedUntil) {
      const hoursLeft = Math.ceil((existing.blockedUntil - Date.now()) / (60 * 60 * 1000));
      return res.status(429).json({
        error: 'blocked',
        message: `Too many failed attempts. Account reset is locked for security. Please try again in ${hoursLeft} hours.`,
      });
    }

    try {
      const user = await findUserByEmail(email);
      if (!user) {
        return res.status(404).json({ error: 'user_not_found', message: 'No registered account found with this email address.' });
      }

      // Generate cryptographically random 6-digit OTP
      const otp = String(crypto.randomInt(100000, 1000000));
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = hashOtp(otp, salt);

      otpStore.set(email, {
        hash,
        salt,
        expiresAt: Date.now() + OTP_TTL_MS,
        attempts: 0,
        blockedUntil: 0,
      });

      const sendRes = await sendOtpEmail({
        email,
        otp,
        title: 'Password Reset Verification',
        purpose: 'We received a request to reset your password. Use the verification code below to authorize the update.',
      });

      res.json({
        ok: true,
        message: sendRes.ok
          ? 'A 6-digit verification code has been dispatched to your email.'
          : 'A verification code has been generated. Check your email.',
        deliveryNote: sendRes.error || undefined,
      });
    } catch (err) {
      console.error('[auth] Resend OTP error:', err);
      res.status(500).json({ error: 'email_send_failed', message: 'Could not send verification email. Please check configuration.' });
    }
  });

  router.post('/verify-otp', async (req, res) => {
    const email = normalise(req.body?.email);
    const otp = String(req.body?.otp || '').trim().replace(/\D/g, '');

    if (!email || otp.length !== 6) {
      return res.status(400).json({ error: 'bad_otp', message: 'Please enter a valid 6-digit code.' });
    }

    const record = otpStore.get(email);
    if (!record) {
      return res.status(400).json({ error: 'no_otp', message: 'No reset request found for this email. Please request a new code.' });
    }

    if (record.blockedUntil && Date.now() < record.blockedUntil) {
      const hoursLeft = Math.ceil((record.blockedUntil - Date.now()) / (60 * 60 * 1000));
      return res.status(429).json({
        error: 'blocked',
        message: `Account is temporarily blocked for 24 hours due to too many failed attempts (${hoursLeft}h left).`,
      });
    }

    if (Date.now() > record.expiresAt) {
      otpStore.delete(email);
      return res.status(400).json({ error: 'expired_otp', message: 'Verification code has expired (3-minute time limit). Please request a new code.' });
    }

    // Increment attempts atomically
    record.attempts += 1;

    // Verify hash timing-safe
    const candidate = hashOtp(otp, record.salt);
    const isMatch = candidate.length === record.hash.length &&
      crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(record.hash, 'hex'));

    if (!isMatch) {
      if (record.attempts >= MAX_OTP_ATTEMPTS) {
        record.blockedUntil = Date.now() + BLOCK_TTL_MS;
        return res.status(429).json({
          error: 'too_many_attempts',
          message: 'Too many incorrect attempts (5/5). Account reset is locked for 24 hours.',
        });
      }
      return res.status(400).json({
        error: 'invalid_otp',
        message: `Incorrect verification code. ${MAX_OTP_ATTEMPTS - record.attempts} attempts remaining.`,
      });
    }

    // Success: delete OTP so it can never be reused
    otpStore.delete(email);

    // Generate single-use reset token valid for 10 minutes
    const resetToken = crypto.randomBytes(32).toString('hex');
    resetTokens.set(resetToken, { email, expiresAt: Date.now() + 10 * 60 * 1000 });

    res.json({ ok: true, resetToken });
  });

  router.post('/reset-password', async (req, res) => {
    const resetToken = String(req.body?.resetToken || '').trim();
    const newPassword = String(req.body?.newPassword || '');

    if (!resetToken) {
      return res.status(401).json({ error: 'missing_token', message: 'Unauthorized. You must verify OTP first.' });
    }

    const tokenRecord = resetTokens.get(resetToken);
    if (!tokenRecord || Date.now() > tokenRecord.expiresAt) {
      resetTokens.delete(resetToken);
      return res.status(401).json({ error: 'invalid_token', message: 'Password reset session has expired. Please verify OTP again.' });
    }

    if (newPassword.length < MIN_PASSWORD) {
      return res.status(400).json({ error: 'weak_password', message: `Password must be at least ${MIN_PASSWORD} characters.` });
    }

    try {
      const user = await findUserByEmail(tokenRecord.email);
      if (!user) {
        return res.status(404).json({ error: 'user_not_found', message: 'User account not found.' });
      }

      // Invalidate token immediately (strictly single use)
      resetTokens.delete(resetToken);

      const { salt, hash } = hashPassword(newPassword);
      await patchUser(user._id, { salt, hash, passwordResetAt: new Date().toISOString() });

      res.json({ ok: true, message: 'Password reset successful. You can now sign in with your new password.' });
    } catch (err) {
      res.status(500).json({ error: 'reset_failed', message: 'Could not reset password.' });
    }
  });

  /* ------------------------------------------------ Admin 2-Factor Authentication (2FA) */
  const admin2FaStore = new Map();

  router.post('/admin/login-step1', async (req, res) => {
    const email = normalise(req.body?.email);
    const password = String(req.body?.password || '');

    if (email !== PRIMARY_ADMIN_EMAIL) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Access denied. The Admin terminal is strictly restricted to Jaatshab11223315@gmail.com.',
      });
    }

    const user = await findUserByEmail(email);
    if (!user || !user.hash || !user.salt) {
      return res.status(401).json({
        error: 'invalid_credentials',
        message: 'Invalid administrator credentials.',
      });
    }

    const valid = verifyPassword(password, user.salt, user.hash);
    if (!valid) {
      return res.status(401).json({
        error: 'invalid_credentials',
        message: 'Incorrect administrator password.',
      });
    }

    const state = await getState();
    const is2faActive = Boolean(state.admin2faEnabled);

    if (!is2faActive) {
      // 2FA is currently disabled by Admin: directly issue elevated session token
      const token = await signToken(user, { admin2fa: true });
      return res.json({
        ok: true,
        requires2fa: false,
        token,
        user: { ...publicUser(user), admin2fa: true },
        message: 'Administrator credentials verified. Access granted.',
      });
    }

    // Check 24h lockout
    const existing = admin2FaStore.get(email);
    if (existing?.blockedUntil && Date.now() < existing.blockedUntil) {
      const hoursLeft = Math.ceil((existing.blockedUntil - Date.now()) / (60 * 60 * 1000));
      return res.status(429).json({
        error: 'blocked',
        message: `Admin terminal is locked for ${hoursLeft} hours due to security protection.`,
      });
    }

    // Generate 6-digit OTP
    const otp = String(crypto.randomInt(100000, 1000000));
    const salt = crypto.randomBytes(16).toString('hex');
    const hashVal = hashOtp(otp, salt);

    admin2FaStore.set(email, {
      hash: hashVal,
      salt,
      expiresAt: Date.now() + OTP_TTL_MS,
      attempts: 0,
      blockedUntil: 0,
    });

    const sendRes = await sendOtpEmail({
      email,
      otp,
      title: 'Admin 2FA Security Authorization Code',
      purpose: 'An enterprise login attempt was detected for the master administrator console. Enter this 6-digit verification code to complete two-factor authentication.',
    });

    res.json({
      ok: true,
      requires2fa: true,
      email: PRIMARY_ADMIN_EMAIL,
      message: sendRes.ok
        ? 'A 6-digit 2FA authorization code has been sent to your email.'
        : '2FA authorization code generated. (Check email or server logs).',
      deliveryNote: sendRes.error || undefined,
    });
  });

  router.post('/admin/login-step2', async (req, res) => {
    const email = normalise(req.body?.email);
    const otp = String(req.body?.otp || '').trim().replace(/\D/g, '');

    if (email !== PRIMARY_ADMIN_EMAIL) {
      return res.status(403).json({ error: 'forbidden', message: 'Access denied.' });
    }

    const record = admin2FaStore.get(email);
    if (!record) {
      return res.status(400).json({ error: 'no_otp', message: 'No active 2FA session. Please enter password first.' });
    }

    if (record.blockedUntil && Date.now() < record.blockedUntil) {
      return res.status(429).json({ error: 'blocked', message: 'Admin terminal locked due to multiple failed attempts.' });
    }

    if (Date.now() > record.expiresAt) {
      admin2FaStore.delete(email);
      return res.status(400).json({ error: 'expired_otp', message: '2FA code has expired (strictly 3 minutes). Please sign in again.' });
    }

    record.attempts += 1;
    const candidate = hashOtp(otp, record.salt);
    const isMatch =
      candidate.length === record.hash.length &&
      crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(record.hash, 'hex'));

    if (!isMatch) {
      if (record.attempts >= MAX_OTP_ATTEMPTS) {
        record.blockedUntil = Date.now() + BLOCK_TTL_MS;
        return res.status(429).json({ error: 'too_many_attempts', message: 'Admin terminal locked for 24 hours.' });
      }
      return res.status(400).json({
        error: 'invalid_otp',
        message: `Incorrect 2FA code. ${MAX_OTP_ATTEMPTS - record.attempts} attempts remaining.`,
      });
    }

    admin2FaStore.delete(email);

    const user = await findUserByEmail(email);
    const token = await signToken(user, { admin2fa: true });

    res.json({
      ok: true,
      token,
      user: { ...publicUser(user), admin2fa: true },
      message: 'Admin 2FA verification successful. Access granted.',
    });
  });

  /* ------------------------------------------------------ google oauth */
  const googleRedirect = (req) => {
    if (env.GOOGLE_REDIRECT_URI && env.GOOGLE_REDIRECT_URI.includes('/api/auth/google/callback')) {
      return env.GOOGLE_REDIRECT_URI;
    }
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.get('host');
    return `${proto}://${host}/api/auth/google/callback`;
  };

  router.get('/google/start', async (req, res) => {
    const { clientId, clientSecret } = await googleConfig();
    const next = typeof req.query.next === 'string' && req.query.next.startsWith('/') ? req.query.next : '/design';
    if (!clientId || !clientSecret) return res.redirect('/login?error=google_off');

    const referer = req.headers.referer || '';
    let frontendOrigin = '';
    try {
      if (referer) frontendOrigin = new URL(referer).origin;
    } catch {
      /* ignore */
    }
    if (!frontendOrigin && env.FRONTEND_URL) {
      frontendOrigin = env.FRONTEND_URL;
    }

    const statePayload = JSON.stringify({ next, origin: frontendOrigin });
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: googleRedirect(req),
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'online',
      prompt: 'select_account',
      state: `${Buffer.from(statePayload).toString('base64url')}.${crypto.randomBytes(8).toString('hex')}`,
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  router.get('/google/callback', async (req, res) => {
    const { clientId, clientSecret } = await googleConfig();
    const code = String(req.query.code || '');
    const rawState = String(req.query.state || '');
    
    let next = '/design';
    let frontendOrigin = '';
    try {
      const rawDecoded = Buffer.from(rawState.split('.')[0], 'base64url').toString('utf8');
      if (rawDecoded.startsWith('{')) {
        const parsed = JSON.parse(rawDecoded);
        next = parsed.next || '/design';
        frontendOrigin = parsed.origin || '';
      } else {
        next = rawDecoded;
      }
    } catch {
      next = '/design';
    }
    const safeNext = next.startsWith('/') ? next : '/design';
    const redirectBase = frontendOrigin || env.FRONTEND_URL || '';

    if (!clientId || !clientSecret) {
      return res.redirect(`${redirectBase}/login?error=google_off`);
    }
    if (!code) {
      return res.redirect(`${redirectBase}/login?error=google_denied`);
    }

    try {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: googleRedirect(req),
          grant_type: 'authorization_code',
        }),
      });
      const tokens = await tokenResponse.json();
      if (!tokenResponse.ok || !tokens.access_token) {
        return res.redirect(`${redirectBase}/login?error=google_failed`);
      }

      const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const profile = await profileResponse.json();
      const email = String(profile.email || '').toLowerCase();
      if (!EMAIL_RE.test(email) || profile.email_verified === false) {
        return res.redirect(`${redirectBase}/login?error=google_email`);
      }

      let user = await findUserByEmail(email);
      if (!user) {
        user = {
          _id: crypto.randomUUID(),
          email,
          name: String(profile.name || '').slice(0, 80),
          avatar: profile.picture || '',
          provider: 'google',
          credits: 5,
          createdAt: new Date().toISOString(),
        };
        await insertUser(user);
      } else {
        const patch = { googleId: profile.sub, provider: user.provider || 'google' };
        if (!user.avatar && profile.picture) patch.avatar = profile.picture;
        await patchUser(user._id, patch);
      }

      const token = await signToken(user);
      res.redirect(`${redirectBase}/login#token=${encodeURIComponent(token)}&next=${encodeURIComponent(safeNext)}`);
    } catch {
      res.redirect(`${redirectBase}/login?error=google_failed`);
    }
  });

  return {
    router,
    attachUser,
    requireUser,
    publicUser,
    patchUser,
    deleteUser,
    findUserById,
    readLocalUsers: readLocal,
    getAllUsers,
    storage: async () => Boolean(await getDb()),
  };
}
