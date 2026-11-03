import { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, Mail, ShieldCheck, ArrowLeft, RefreshCw, X } from 'lucide-react';
import { api, ApiError, getToken, setToken, type User } from '../lib/api';
import { useTheme, ThemeToggle } from '../lib/theme';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

const FIELD =
  'mt-2 w-full rounded-xl border border-white/12 bg-black/50 px-3.5 py-3 pr-11 text-sm text-white placeholder:text-white/25 focus:border-white/45 focus:outline-none focus:ring-0';

/** Password field with a show/hide eye so people can check what they typed. */
function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete,
  minLength,
  isLight = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete: string;
  minLength?: number;
  isLight?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const inputClass = isLight
    ? 'mt-2 w-full rounded-xl border border-[#78a48b] bg-[#82b095]/40 px-3.5 py-3 pr-11 text-sm text-slate-900 placeholder:text-slate-600 focus:border-slate-800 focus:outline-none focus:ring-0 shadow-sm'
    : FIELD;

  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        required
        minLength={minLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={inputClass}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className={`absolute inset-y-0 right-0 mt-2 flex w-11 items-center justify-center transition-colors ${
          isLight ? 'text-gray-400 hover:text-gray-800' : 'text-white/35 hover:text-white'
        }`}
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

type Mode = 'signin' | 'signup';
type Step = 'auth' | 'password';
type ForgotStep = 'email' | 'otp' | 'new-password' | 'done';

const ERROR_COPY: Record<string, string> = {
  google_off: 'Google sign-in is not configured yet. Use your email and password for now.',
  google_denied: 'Google sign-in was cancelled.',
  google_failed: 'Google could not complete the sign-in. Try again.',
  google_email: 'That Google account did not share a verified email address.',
  session: 'Your session expired. Please sign in again.',
};

function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/design';
  return value;
}

export default function Login() {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';
  const [mode, setMode] = useState<Mode>('signin');
  const [step, setStep] = useState<Step>('auth');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [account, setAccount] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [googleReady, setGoogleReady] = useState<boolean | null>(null);
  const [next, setNext] = useState('/design');

  /* Forgot password state */
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState<ForgotStep>('email');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(180);

  /* OTP Countdown Timer — Wall-clock backed, continues in background tab/app */
  useEffect(() => {
    if (!showForgotModal || forgotStep !== 'otp') return;

    const updateRemaining = () => {
      try {
        const stored = localStorage.getItem('shivnaresh_otp_expiry');
        if (!stored) {
          setOtpSecondsLeft(0);
          return 0;
        }
        const target = parseInt(stored, 10);
        const remaining = Math.max(0, Math.ceil((target - Date.now()) / 1000));
        setOtpSecondsLeft(remaining);
        return remaining;
      } catch {
        return 0;
      }
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);

    const onSync = () => {
      updateRemaining();
    };
    document.addEventListener('visibilitychange', onSync);
    window.addEventListener('focus', onSync);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onSync);
      window.removeEventListener('focus', onSync);
    };
  }, [showForgotModal, forgotStep]);

  function settle(user: User | null) {
    if (!user) {
      setToken('');
      setAccount(null);
      return;
    }
    if (!user.hasPassword) {
      setAccount(user);
      setStep('password');
      setBusy(false);
      return;
    }
    window.location.replace(next);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const target = safeNext(params.get('next') || hash.get('next'));
    setNext(target);

    const flag = params.get('error');
    if (flag) setError(ERROR_COPY[flag] || 'Sign-in failed. Try again.');

    void api
      .authConfig()
      .then((c) => setGoogleReady(c.google))
      .catch(() => setGoogleReady(false));

    const incoming = hash.get('token');
    if (incoming) {
      setToken(incoming);
      window.history.replaceState(null, '', `/login?next=${encodeURIComponent(target)}`);
      void api
        .me()
        .then(({ user }) => settle(user))
        .catch(() => {
          setToken('');
          setAccount(null);
        });
    } else if (getToken()) {
      void api
        .me()
        .then(({ user }) => {
          if (!user) {
            setToken('');
            setAccount(null);
          } else if (!user.hasPassword) {
            setAccount(user);
            setStep('password');
            setBusy(false);
          } else {
            window.location.replace(target);
          }
        })
        .catch(() => {
          setToken('');
          setAccount(null);
        });
    }
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result =
        mode === 'signin'
          ? await api.login(email.trim(), password)
          : await api.register(name.trim(), email.trim(), password);
      setToken(result.token);
      if (!result.user.hasPassword) {
        setAccount(result.user);
        setStep('password');
        setBusy(false);
        return;
      }
      window.location.replace(next);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setMode('signin');
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.setPassword(newPassword);
      window.location.replace(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the password.');
      setBusy(false);
    }
  }

  /* Forgot password actions */
  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setForgotBusy(true);
    setForgotError('');
    setForgotSuccess('');
    try {
      const res = await api.forgotPassword(forgotEmail.trim());
      if (res.emergencyOtp) {
        setForgotOtp(res.emergencyOtp);
        setForgotSuccess(`⚡ Code: ${res.emergencyOtp} (Email note: ${res.deliveryNote || 'Check Spam'})`);
      } else if (res.deliveryNote && res.deliveryNote.toLowerCase().includes('invalid')) {
        setForgotError(`⚠️ Cloud server note: ${res.deliveryNote}. Render backend deployment is pending manual trigger on dashboard.render.com (click "Manual Deploy > Deploy latest commit") to activate Brevo delivery.`);
      } else if (res.deliveryNote) {
        setForgotSuccess(`${res.message || 'OTP code generated!'} (Note: ${res.deliveryNote})`);
      } else {
        setForgotSuccess(res.message || 'OTP verification code sent! (Check Inbox & Spam folder)');
      }
      setForgotStep('otp');
      setOtpSecondsLeft(180);
    } catch (err: any) {
      setForgotError(err.message || 'Could not send verification code.');
    } finally {
      setForgotBusy(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setForgotBusy(true);
    setForgotError('');
    try {
      const res = await api.verifyOtp(forgotEmail.trim(), forgotOtp.trim());
      setResetToken(res.resetToken);
      setForgotStep('new-password');
      setForgotSuccess('OTP verified successfully! Now set your new password.');
    } catch (err: any) {
      setForgotError(err.message || 'Invalid or expired OTP.');
    } finally {
      setForgotBusy(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (forgotNewPassword !== forgotConfirmPassword) {
      setForgotError('Passwords do not match.');
      return;
    }
    if (forgotNewPassword.length < 8) {
      setForgotError('Password must be at least 8 characters.');
      return;
    }
    setForgotBusy(true);
    setForgotError('');
    try {
      const res = await api.resetPassword(resetToken, forgotNewPassword);
      setForgotStep('done');
      setForgotSuccess(res.message || 'Password reset successful!');
      setEmail(forgotEmail);
    } catch (err: any) {
      setForgotError(err.message || 'Could not reset password.');
    } finally {
      setForgotBusy(false);
    }
  }

  const field = isLight
    ? 'mt-2 w-full rounded-xl border border-[#78a48b] bg-[#82b095]/40 px-3.5 py-3 text-sm text-slate-900 placeholder:text-slate-600 focus:border-slate-800 focus:outline-none focus:ring-0 shadow-sm'
    : 'mt-2 w-full rounded-xl border border-white/12 bg-black/50 px-3.5 py-3 text-sm text-white placeholder:text-white/25 focus:border-white/45 focus:outline-none focus:ring-0';

  return (
    <div className={`relative min-h-screen overflow-hidden ${
      isLight ? 'bg-[#97c1a9] text-slate-900' : 'bg-[#08080a] text-white'
    }`}>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        aria-hidden="true"
        style={{
          backgroundImage:
            'linear-gradient(to right, #94a3b8 1px, transparent 1px), linear-gradient(to bottom, #94a3b8 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      <div
        className="pointer-events-none absolute -top-40 right-0 h-[520px] w-[520px] rounded-full blur-[120px]"
        aria-hidden="true"
        style={{ background: 'radial-gradient(circle, rgba(229,55,63,0.28), transparent 70%)' }}
      />

      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
        <a href="/" className={`flex items-center gap-2 text-[11px] font-semibold tracking-[0.2em] ${
          isLight ? 'text-gray-900 font-bold' : 'text-white'
        }`}>
          <img
            src={isLight ? '/brand-mark-black.png' : '/brand-mark-white.png'}
            alt=""
            onError={(e) => { (e.target as HTMLImageElement).src = '/brand-mark-white.png'; }}
            className="h-4 w-auto"
          />
          SHIV-NARESH
        </a>
        <div className="flex items-center gap-3">
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          <a href="/" className={`text-[11px] uppercase tracking-[0.2em] transition-colors ${
            isLight ? 'text-gray-800 hover:text-black font-semibold' : 'text-white/45 hover:text-white'
          }`}>
            Back to home
          </a>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex max-w-md flex-col px-5 pb-16 pt-6 sm:px-0 sm:pt-10">
        <div className={isLight ? 'rounded-3xl border border-[#78a48b] bg-[#8db89f]/95 p-6 sm:p-8 shadow-2xl backdrop-blur-md text-slate-900' : 'rounded-3xl border border-white/10 bg-[#0c1017]/95 p-6 sm:p-8 shadow-2xl backdrop-blur-md text-white'}>
          {step === 'password' ? (
            <>
              <h1 className="text-2xl font-semibold tracking-[-0.02em]">Create a password</h1>
              <p className={`mt-1.5 text-sm leading-relaxed ${isLight ? 'text-gray-600' : 'text-white/45'}`}>
                You signed in with {account?.provider === 'google' ? 'Google' : 'email'}, so this account has no password
                yet. Set one now and next time you can open it with just your email and password.
              </p>
              <p className={`mt-3 rounded-xl border px-3 py-2 text-[12px] ${
                isLight ? 'border-gray-200 bg-gray-50 text-gray-700' : 'border-white/10 bg-white/[0.03] text-white/55'
              }`}>
                {account?.email}
              </p>

              <form onSubmit={(e) => void savePassword(e)} className="mt-5 space-y-4">
                <label className="block">
                  <span className={`text-[10px] uppercase tracking-[0.18em] ${isLight ? 'text-gray-700 font-semibold' : 'text-white/40'}`}>New password</span>
                  <PasswordInput
                    value={newPassword}
                    onChange={setNewPassword}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    minLength={8}
                    isLight={isLight}
                  />
                </label>

                {error && (
                  <p className="rounded-xl border border-[#e5373f]/35 bg-[#e5373f]/10 px-3 py-2.5 text-[12px] leading-relaxed text-[#ff5252]">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className={`w-full rounded-full px-6 py-3 text-sm font-semibold transition enabled:hover:opacity-90 disabled:opacity-50 ${
                    isLight ? 'bg-[#e5373f] text-white shadow-md' : 'bg-white text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {busy ? 'Saving…' : 'Save password and continue'}
                </button>
              </form>

              <button
                type="button"
                onClick={() => window.location.replace(next)}
                className={`mt-4 text-center text-[11px] uppercase tracking-[0.16em] transition-colors ${
                  isLight ? 'text-gray-600 hover:text-gray-950 font-medium' : 'text-white/35 hover:text-white/70'
                }`}
              >
                Skip for now — keep using Google
              </button>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-[-0.02em]">
                {mode === 'signin' ? 'Sign in' : 'Create your account'}
              </h1>
              <p className={`mt-1.5 text-sm ${isLight ? 'text-gray-600' : 'text-white/45'}`}>
                {mode === 'signin'
                  ? 'Your designs, renders and collections — in one place.'
                  : 'Save every kit you design, then come back to it any time.'}
              </p>

              <div className={`mt-7 flex gap-1 rounded-full p-1 text-[11px] uppercase tracking-[0.14em] ${
                isLight ? 'border border-gray-300 bg-gray-100' : 'border border-white/10 bg-white/[0.03]'
              }`}>
                {(['signin', 'signup'] as const).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setMode(id);
                      setError('');
                    }}
                    className={
                      'flex-1 rounded-full px-4 py-2 transition-colors ' +
                      (mode === id
                        ? isLight
                          ? 'bg-white text-gray-900 font-bold shadow-sm'
                          : 'bg-white text-gray-900'
                        : isLight
                        ? 'text-gray-600 hover:text-gray-900'
                        : 'text-white/55 hover:text-white')
                    }
                  >
                    {id === 'signin' ? 'Sign in' : 'Create account'}
                  </button>
                ))}
              </div>

              <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-4">
                {mode === 'signup' && (
                  <>
                    <label className="block">
                      <span className={`text-[10px] uppercase tracking-[0.18em] ${isLight ? 'text-gray-700 font-semibold' : 'text-white/40'}`}>Full Name</span>
                      <input
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Ravi Jaatshab"
                        autoComplete="name"
                        className={field}
                      />
                    </label>
                    <label className="block">
                      <span className={`text-[10px] uppercase tracking-[0.18em] ${isLight ? 'text-gray-700 font-semibold' : 'text-white/40'}`}>Phone Number (Optional)</span>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="10-digit mobile number"
                        autoComplete="tel"
                        className={field}
                      />
                    </label>
                  </>
                )}

                <label className="block">
                  <span className={`text-[10px] uppercase tracking-[0.18em] ${isLight ? 'text-gray-700 font-semibold' : 'text-white/40'}`}>Email</span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@gmail.com"
                    autoComplete="email"
                    className={field}
                  />
                </label>

                <label className="block">
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] uppercase tracking-[0.18em] ${isLight ? 'text-gray-700 font-semibold' : 'text-white/40'}`}>Password</span>
                    {mode === 'signin' && (
                      <button
                        type="button"
                        onClick={() => {
                          setForgotEmail(email);
                          setForgotStep('email');
                          setForgotError('');
                          setForgotSuccess('');
                          setShowForgotModal(true);
                        }}
                        className="text-[11px] font-medium text-[#e5373f] hover:text-[#d42d35] transition-colors"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <PasswordInput
                    value={password}
                    onChange={setPassword}
                    placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    minLength={mode === 'signup' ? 8 : undefined}
                    isLight={isLight}
                  />
                </label>

                {error && (
                  <p className="rounded-xl border border-[#e5373f]/35 bg-[#e5373f]/10 px-3 py-2.5 text-[12px] leading-relaxed text-[#ff5252]">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className={`w-full rounded-full px-6 py-3 text-sm font-semibold transition enabled:hover:opacity-90 disabled:opacity-50 ${
                    isLight ? 'bg-[#e5373f] text-white shadow-md hover:bg-[#d42d35]' : 'bg-white text-gray-900 enabled:hover:bg-gray-100'
                  }`}
                >
                  {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              </form>

              <div className={`my-6 flex items-center gap-3 text-[10px] uppercase tracking-[0.18em] ${
                isLight ? 'text-gray-500' : 'text-white/25'
              }`}>
                <span className={`h-px flex-1 ${isLight ? 'bg-gray-300' : 'bg-white/10'}`} />
                or
                <span className={`h-px flex-1 ${isLight ? 'bg-gray-300' : 'bg-white/10'}`} />
              </div>

              <a
                href={`${API_BASE}/api/auth/google/start?next=${encodeURIComponent(next)}&origin=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : '')}`}
                className={`flex w-full items-center justify-center gap-3 rounded-full border px-6 py-3 text-sm font-medium transition-colors ${
                  isLight
                    ? 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50 shadow-sm'
                    : 'border-white/15 bg-white/[0.03] text-white hover:border-white/35 hover:bg-white/[0.07]'
                }`}
              >
                <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.3 17.6 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.1 24.5c0-1.6-.1-2.8-.4-4.1H24v8.4h12.5c-.3 2.1-1.6 5.2-4.6 7.3l7.6 5.9c4.5-4.2 6.6-10.3 6.6-17.5z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.4 28.7A14.6 14.6 0 0 1 9.6 24c0-1.6.3-3.2.8-4.7l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.8-6.1z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.5 0 12-2.1 16-5.9l-7.6-5.9c-2 1.4-4.7 2.4-8.4 2.4-6.4 0-11.7-3.8-13.6-9.1l-7.8 6.1C6.5 42.6 14.6 48 24 48z"
                  />
                </svg>
                Continue with Google
              </a>
              {googleReady === false && (
                <p className={`mt-2 text-center text-[11px] leading-relaxed ${isLight ? 'text-gray-500' : 'text-white/35'}`}>
                  Add a Google client ID and secret in Admin to switch this on.
                </p>
              )}

              <p className={`mt-8 text-[11px] leading-relaxed ${isLight ? 'text-gray-500' : 'text-white/30'}`}>
                By continuing you agree to us storing your account and saved designs. Your password is hashed — we never
                see it.
              </p>
            </>
          )}
        </div>
      </main>

      {/* Forgot Password OTP Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className={`relative w-full max-w-md rounded-3xl border p-7 shadow-2xl transition-all ${
            isLight ? 'border-[#76a187] bg-[#8eb8a0] text-slate-900 shadow-2xl' : 'border-white/15 bg-[#0f0f13] text-white'
          }`}>
            <button
              onClick={() => setShowForgotModal(false)}
              className={`absolute top-5 right-5 p-2 rounded-full transition-colors ${
                isLight ? 'text-gray-400 hover:text-gray-900 hover:bg-gray-100' : 'text-white/40 hover:text-white hover:bg-white/10'
              }`}
            >
              <X size={18} />
            </button>

            {forgotStep === 'email' && (
              <div>
                <div className="w-12 h-12 rounded-2xl bg-[#e5373f]/15 border border-[#e5373f]/30 flex items-center justify-center text-[#ff5252] mb-4">
                  <Mail size={22} />
                </div>
                <h3 className="text-xl font-bold tracking-tight">Forgot Password</h3>
                <p className={`mt-1 text-xs leading-relaxed ${isLight ? 'text-gray-600' : 'text-white/50'}`}>
                  Enter your registered email address. We will dispatch a secure 6-digit OTP code to verify your identity.
                </p>

                <form onSubmit={handleSendOtp} className="mt-5 space-y-4">
                  <div>
                    <label className={`text-[10px] uppercase font-bold tracking-[0.16em] ${isLight ? 'text-gray-700' : 'text-white/40'}`}>Email Address</label>
                    <input
                      type="email"
                      required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="registered@gmail.com"
                      className={field}
                    />
                  </div>

                  {forgotSuccess && (
                    <p className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-400">
                      {forgotSuccess}
                    </p>
                  )}

                  {forgotError && (
                    <p className="rounded-xl border border-[#e5373f]/35 bg-[#e5373f]/10 px-3 py-2 text-[12px] text-[#ff5252]">
                      {forgotError}
                    </p>
                  )}

                  <p className={`text-[11px] text-center leading-relaxed ${isLight ? 'text-gray-500' : 'text-white/45'}`}>
                    💡 Not in primary inbox? Please check your <b className={isLight ? 'text-gray-800' : 'text-white/80'}>Spam</b> or <b className={isLight ? 'text-gray-800' : 'text-white/80'}>Promotions</b> folder.
                  </p>

                  <button
                    type="submit"
                    disabled={forgotBusy || !forgotEmail}
                    className="w-full mt-2 rounded-full bg-[#e5373f] hover:bg-[#ff3b44] text-white font-semibold py-3 text-sm shadow-lg shadow-[#e5373f]/25 transition disabled:opacity-50"
                  >
                    {forgotBusy ? 'Sending 6-Digit OTP…' : 'Send Reset Code'}
                  </button>
                </form>
              </div>
            )}

            {forgotStep === 'otp' && (
              <div>
                <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4">
                  <KeyRound size={22} />
                </div>
                <h3 className="text-xl font-bold tracking-tight">Enter Verification Code</h3>
                <p className={`mt-1 text-xs leading-relaxed ${isLight ? 'text-gray-600' : 'text-white/50'}`}>
                  We sent a 6-digit OTP to <span className={`font-semibold ${isLight ? 'text-gray-900' : 'text-white'}`}>{forgotEmail}</span>.
                </p>

                <div className={`mt-3 flex items-center justify-between px-3.5 py-2.5 rounded-xl border ${
                  isLight ? 'border-gray-200 bg-gray-50' : 'border-white/10 bg-white/[0.03]'
                }`}>
                  <span className={`text-[11px] ${isLight ? 'text-gray-600' : 'text-white/55'}`}>Expires strictly in:</span>
                  <span className={`font-mono text-xs font-bold ${otpSecondsLeft < 30 ? 'text-[#ff5252] animate-pulse' : 'text-emerald-500'}`}>
                    ⏱️ {Math.floor(otpSecondsLeft / 60)}:{(otpSecondsLeft % 60).toString().padStart(2, '0')}
                  </span>
                </div>

                <form onSubmit={handleVerifyOtp} className="mt-5 space-y-4">
                  <div>
                    <label className={`text-[10px] uppercase font-bold tracking-[0.16em] ${isLight ? 'text-gray-700' : 'text-white/40'}`}>6-Digit OTP Code</label>
                    <input
                      type="text"
                      maxLength={6}
                      required
                      value={forgotOtp}
                      onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, ''))}
                      placeholder="••••••"
                      className={`mt-2 w-full text-center tracking-[0.5em] text-2xl font-mono rounded-xl border px-4 py-3.5 focus:border-[#ff5252] focus:outline-none ${
                        isLight ? 'border-gray-300 bg-gray-50 text-gray-900' : 'border-white/15 bg-black/60 text-white'
                      }`}
                    />
                  </div>

                  {forgotSuccess && (
                    <p className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-400">
                      {forgotSuccess}
                    </p>
                  )}

                  {forgotError && (
                    <p className="rounded-xl border border-[#e5373f]/35 bg-[#e5373f]/10 px-3 py-2 text-[12px] text-[#ff5252]">
                      {forgotError}
                    </p>
                  )}

                  <p className={`text-[11px] text-center leading-relaxed ${isLight ? 'text-gray-500' : 'text-white/45'}`}>
                    💡 Not in primary inbox? Please check your <b className={isLight ? 'text-gray-800' : 'text-white/80'}>Spam</b> or <b className={isLight ? 'text-gray-800' : 'text-white/80'}>Promotions</b> folder.
                  </p>

                  <button
                    type="submit"
                    disabled={forgotBusy || forgotOtp.length !== 6 || otpSecondsLeft <= 0}
                    className={`w-full mt-2 rounded-full font-semibold py-3 text-sm transition disabled:opacity-50 ${
                      isLight ? 'bg-[#e5373f] text-white hover:bg-[#d42d35]' : 'bg-white hover:bg-gray-100 text-gray-950'
                    }`}
                  >
                    {forgotBusy ? 'Verifying OTP…' : 'Verify Code & Proceed'}
                  </button>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => setForgotStep('email')}
                      className={`inline-flex items-center gap-1.5 text-xs transition-colors ${
                        isLight ? 'text-gray-500 hover:text-gray-900' : 'text-white/40 hover:text-white'
                      }`}
                    >
                      <ArrowLeft size={13} /> Change Email
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleSendOtp(e)}
                      disabled={forgotBusy || otpSecondsLeft > 60}
                      className="inline-flex items-center gap-1.5 text-xs text-[#ff5252] hover:text-[#ff7b7b] transition-colors disabled:opacity-30"
                    >
                      <RefreshCw size={13} className={forgotBusy ? 'animate-spin' : ''} /> Resend OTP
                    </button>
                  </div>
                </form>
              </div>
            )}

            {forgotStep === 'new-password' && (
              <div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4">
                  <ShieldCheck size={22} />
                </div>
                <h3 className="text-xl font-bold tracking-tight">Create New Password</h3>
                <p className={`mt-1 text-xs leading-relaxed ${isLight ? 'text-gray-600' : 'text-white/50'}`}>
                  Identity verified. Enter a secure new password (at least 8 characters) for your account.
                </p>

                <form onSubmit={handleResetPassword} className="mt-5 space-y-4">
                  <div>
                    <label className={`text-[10px] uppercase font-bold tracking-[0.16em] ${isLight ? 'text-gray-700' : 'text-white/40'}`}>New Password</label>
                    <PasswordInput
                      value={forgotNewPassword}
                      onChange={setForgotNewPassword}
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
                      minLength={8}
                      isLight={isLight}
                    />
                  </div>

                  <div>
                    <label className={`text-[10px] uppercase font-bold tracking-[0.16em] ${isLight ? 'text-gray-700' : 'text-white/40'}`}>Confirm Password</label>
                    <PasswordInput
                      value={forgotConfirmPassword}
                      onChange={setForgotConfirmPassword}
                      placeholder="Repeat password"
                      autoComplete="new-password"
                      minLength={8}
                      isLight={isLight}
                    />
                  </div>

                  {forgotSuccess && (
                    <p className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-400">
                      {forgotSuccess}
                    </p>
                  )}

                  {forgotError && (
                    <p className="rounded-xl border border-[#e5373f]/35 bg-[#e5373f]/10 px-3 py-2 text-[12px] text-[#ff5252]">
                      {forgotError}
                    </p>
                  )}

                  <p className={`text-[11px] text-center leading-relaxed ${isLight ? 'text-gray-500' : 'text-white/45'}`}>
                    💡 Not in primary inbox? Please check your <b className={isLight ? 'text-gray-800' : 'text-white/80'}>Spam</b> or <b className={isLight ? 'text-gray-800' : 'text-white/80'}>Promotions</b> folder.
                  </p>

                  <button
                    type="submit"
                    disabled={forgotBusy || forgotNewPassword.length < 8}
                    className="w-full mt-2 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white font-semibold py-3 text-sm shadow-lg shadow-emerald-500/25 transition disabled:opacity-50"
                  >
                    {forgotBusy ? 'Saving New Password…' : 'Save New Password'}
                  </button>
                </form>
              </div>
            )}

            {forgotStep === 'done' && (
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-3xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto mb-4">
                  <ShieldCheck size={32} />
                </div>
                <h3 className="text-xl font-bold">Password Reset Complete!</h3>
                <p className={`mt-2 text-xs leading-relaxed ${isLight ? 'text-gray-600' : 'text-white/60'}`}>
                  Your password has been securely updated. You can now log into your account with your new credentials.
                </p>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className={`mt-6 w-full rounded-full font-semibold py-3 text-sm transition ${
                    isLight ? 'bg-[#e5373f] text-white hover:bg-[#d42d35]' : 'bg-white text-gray-950 hover:bg-gray-100'
                  }`}
                >
                  Continue to Sign In
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
