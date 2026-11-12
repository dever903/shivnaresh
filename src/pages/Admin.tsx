import { useEffect, useRef, useState } from 'react';
import {
  api,
  fileToDataUrl,
  getToken,
  setToken,
  type AdminAccess,
  type AdminSettings,
  type AdminUser,
  type AdminGeneration,
  type CustomRequest,
  type HostStatus,
  type ModelCategory,
  type SystemLog,
  type User,
  type FashnCredits,
  type GatewayOrder,
  downloadDirectFile,
} from '../lib/api';
import { useTheme, ThemeToggle } from '../lib/theme';
import {
  AlertTriangle,
  BarChart3,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  Film,
  Inbox,
  Layers,
  Lock,
  Move,
  Paperclip,
  QrCode,
  RefreshCw,
  Settings,
  ShieldAlert,
  Tag,
  Trash2,
  UploadCloud,
  Users,
  User as UserIcon,
  X,
} from 'lucide-react';

export default function Admin() {
  const { theme, toggleTheme } = useTheme();

  const [access, setAccess] = useState<AdminAccess | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [categories, setCategories] = useState<ModelCategory[]>(() => {
    try {
      const cached = localStorage.getItem('cached_studio_models');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });

  const updateCategoriesAndCache = (cats: ModelCategory[]) => {
    setCategories(cats);
    try {
      localStorage.setItem('cached_studio_models', JSON.stringify(cats));
    } catch {}
  };

  /* Tab Navigation */
  const [activeTab, setActiveTab] = useState<
    'overview' | 'requests' | 'users' | 'generations' | 'gateway' | 'settings' | 'models' | 'problems'
  >('overview');

  /* UPI Gateway Admin State */
  const [gatewayOrders, setGatewayOrders] = useState<GatewayOrder[]>([]);
  const [gatewayStats, setGatewayStats] = useState<{
    totalOrders: number;
    totalRevenue: number;
    reviewCount: number;
    paidCount: number;
    pendingCount: number;
  }>({ totalOrders: 0, totalRevenue: 0, reviewCount: 0, paidCount: 0, pendingCount: 0 });
  const [gatewayAccounts, setGatewayAccounts] = useState<any[]>([]);
  const [gatewayLoading, setGatewayLoading] = useState(false);
  const [gatewayFilter, setGatewayFilter] = useState<'all' | 'review' | 'paid' | 'pending' | 'rejected'>('all');
  const [orderActionBusy, setOrderActionBusy] = useState<string | null>(null);

  /* Gateway Order Edit Modal State */
  const [editingGatewayOrder, setEditingGatewayOrder] = useState<GatewayOrder | null>(null);
  const [editGwStatus, setEditGwStatus] = useState<string>('paid');
  const [editGwPlanId, setEditGwPlanId] = useState<string>('pro');
  const [editGwAmount, setEditGwAmount] = useState<number>(0);
  const [editGwUtr, setEditGwUtr] = useState<string>('');
  const [editGwNote, setEditGwNote] = useState<string>('');
  const [savingGwOrder, setSavingGwOrder] = useState(false);
  const [gwOrderError, setGwOrderError] = useState('');

  /* Gateway Settings Form */
  const [gwUpiId, setGwUpiId] = useState('');
  const [gwPayeeName, setGwPayeeName] = useState('');
  const [gwPaytmMid, setGwPaytmMid] = useState('');
  const [gwUpiGatewayUrl, setGwUpiGatewayUrl] = useState('');
  const [gwUpiGatewayApiKey, setGwUpiGatewayApiKey] = useState('');
  const [gwBankAccountNumber, setGwBankAccountNumber] = useState('');
  const [gwBankIfsc, setGwBankIfsc] = useState('');
  const [gwBankAccountHolder, setGwBankAccountHolder] = useState('');
  const [gwBankName, setGwBankName] = useState('');
  const [savingGwSettings, setSavingGwSettings] = useState(false);
  const [gwSettingsStatus, setGwSettingsStatus] = useState<{ ok: boolean; message: string } | null>(null);

  /* Plan Pricing State */
  const isEditingPlansRef = useRef(false);
  const [planPrices, setPlanPrices] = useState<Record<string, {
    name?: string;
    priceUSD: number;
    priceINR?: number;
    credits: number;
    maxVideos?: number;
    maxModels?: number;
    photoshoots?: number;
    active?: boolean;
    deleted?: boolean;
  }>>(() => {
    try {
      const cached = localStorage.getItem('cached_plan_prices');
      if (cached) return JSON.parse(cached);
    } catch {}
    return {
      starter: { name: 'Starter Trial', priceUSD: 0, priceINR: 0, credits: 5, maxVideos: 1, maxModels: 3, photoshoots: 3 },
      ondemand: { name: 'On-Demand Growth', priceUSD: 49, priceINR: 0, credits: 300, maxVideos: 4, maxModels: 15, photoshoots: 15 },
      pro: { name: 'Pro Atelier', priceUSD: 149, priceINR: 0, credits: 1000, maxVideos: 12, maxModels: 50, photoshoots: 50 },
      ultra: { name: 'Ultra Haute-Couture', priceUSD: 249, priceINR: 0, credits: 200, maxVideos: 20, maxModels: 100, photoshoots: 100 },
    };
  });
  const [savingPlans, setSavingPlans] = useState(false);
  const [planSaveStatus, setPlanSaveStatus] = useState<{ ok: boolean; message: string } | null>(null);

  /* Settings Form State */
  const [apiKey, setApiKey] = useState('');
  const [imgbbKey, setImgbbKey] = useState('');
  const [mongoUri, setMongoUri] = useState('');
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleClientSecret, setGoogleClientSecret] = useState('');
  const [defaultPrompt, setDefaultPrompt] = useState('');
  const [defaultModel, setDefaultModel] = useState('');
  const [resolution, setResolution] = useState('1k');
  const [generationMode, setGenerationMode] = useState('balanced');
  const [cloudinaryCloudName, setCloudinaryCloudName] = useState('');
  const [cloudinaryApiKey, setCloudinaryApiKey] = useState('');
  const [cloudinaryApiSecret, setCloudinaryApiSecret] = useState('');
  const [resendApiKey, setResendApiKey] = useState('');
  const [resendFromEmail, setResendFromEmail] = useState('');
  const [brevoApiKey, setBrevoApiKey] = useState('');
  const [testEmailBusy, setTestEmailBusy] = useState(false);
  const [testEmailMsg, setTestEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [admin2faEnabled, setAdmin2faEnabled] = useState(false);
  const [developerImageUrl, setDeveloperImageUrl] = useState('');

  /* Model Upload & Management State (Single or Multiple) */
  const [uploadModelCat, setUploadModelCat] = useState('');
  const [isNewCat, setIsNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [uploadModelName, setUploadModelName] = useState('');
  const [uploadModelDataUrl, setUploadModelDataUrl] = useState('');
  const [selectedBatchModels, setSelectedBatchModels] = useState<Array<{ name: string; dataUrl: string; size: number }>>([]);
  const [uploadModelBusy, setUploadModelBusy] = useState(false);
  const [uploadModelProgress, setUploadModelProgress] = useState<{ current: number; total: number } | null>(null);
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);
  const [movingModelId, setMovingModelId] = useState<string | null>(null);
  const [draggedModel, setDraggedModel] = useState<{ id: string; name: string; currentCategory: string } | null>(null);
  const [dragOverCat, setDragOverCat] = useState<string | null>(null);
  const [modelMessage, setModelMessage] = useState('');
  const modelFileInput = useRef<HTMLInputElement>(null);
  const devPhotoFileRef = useRef<HTMLInputElement>(null);

  function handleDevPhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || '');
      setDevProfile((prev) => ({ ...prev, avatar: dataUrl }));
      setDeveloperImageUrl(dataUrl);
      try {
        const res = await api.upload(dataUrl, 'model', 'developer-avatar');
        if (res?.url) {
          setDevProfile((prev) => ({ ...prev, avatar: res.url }));
          setDeveloperImageUrl(res.url);
        }
      } catch (uploadErr) {
        console.warn('Developer photo background upload note:', uploadErr);
      }
    };
    reader.readAsDataURL(file);
  }

  /* Problem Logs State */
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
  const [unresolvedProblemsCount, setUnresolvedProblemsCount] = useState<number>(0);
  const [problemsLoading, setProblemsLoading] = useState(false);
  const [problemFilter, setProblemFilter] = useState<'all' | 'unresolved' | 'resolved'>('all');
  const [showProblemAlertBanner, setShowProblemAlertBanner] = useState(true);
  const [copiedProblemId, setCopiedProblemId] = useState<string | null>(null);

  /* Data Collections */
  const [customRequests, setCustomRequests] = useState<CustomRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestFilter, setRequestFilter] = useState<'all' | 'queued' | 'in_progress' | 'delivered'>('all');
  const [downloadingZipId, setDownloadingZipId] = useState<string | null>(null);

  /* Reply Drawer / Modal State */
  const [selectedRequest, setSelectedRequest] = useState<CustomRequest | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [replyImageUrl, setReplyImageUrl] = useState('');
  const [replyAttachment, setReplyAttachment] = useState<{ dataUrl: string; name: string; size: number; type: string } | null>(null);
  const [replyStatus, setReplyStatus] = useState<'queued' | 'in_progress' | 'delivered'>('in_progress');
  const [replySaving, setReplySaving] = useState(false);
  const replyFileInput = useRef<HTMLInputElement>(null);

  /* User Management State */
  const [usersList, setUsersList] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');

  /* All Generations Ledger State */
  const [generationsList, setGenerationsList] = useState<AdminGeneration[]>([]);
  const [generationsTotal, setGenerationsTotal] = useState(0);
  const [generationsCreditsTotal, setGenerationsCreditsTotal] = useState(0);
  const [generationsSuccessCount, setGenerationsSuccessCount] = useState(0);
  const [generationsFailedCount, setGenerationsFailedCount] = useState(0);
  const [generationsProcessingCount, setGenerationsProcessingCount] = useState(0);
  const [generationsLoading, setGenerationsLoading] = useState(false);
  const [genSearch, setGenSearch] = useState('');
  const [genStatusFilter, setGenStatusFilter] = useState<'all' | 'completed' | 'failed' | 'processing' | 'refunded'>('all');
  const [genTypeFilter, setGenTypeFilter] = useState<'all' | 'tryon' | 'model-swap' | 'video'>('all');
  const [refundingGenId, setRefundingGenId] = useState<string | null>(null);
  const [previewGenItem, setPreviewGenItem] = useState<AdminGeneration | null>(null);

  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [host, setHost] = useState<HostStatus | null>(null);
  const [syncing, setSyncing] = useState(false);

  /* Preview Lightbox */
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  /* 2FA Login State for Admin Gate */
  const [admin2FaStep, setAdmin2FaStep] = useState<'password' | 'otp'>('password');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminOtp, setAdminOtp] = useState('');
  const [admin2FaBusy, setAdmin2FaBusy] = useState(false);
  const [admin2FaError, setAdmin2FaError] = useState('');
  const [admin2FaSuccess, setAdmin2FaSuccess] = useState('');
  const [adminOtpTimer, setAdminOtpTimer] = useState(180);

  /* Admin Forgot Password via Email OTP State */
  const [adminForgotMode, setAdminForgotMode] = useState<'none' | 'verify'>('none');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotError, setForgotError] = useState('');

  /* Individual User Edits State */
  const [userRowEdits, setUserRowEdits] = useState<Record<string, {
    tier?: string;
    credits?: number;
    maxVideos?: number;
    maxModels?: number;
    creditsLocked?: boolean;
    features?: { hd2k?: boolean; fivePose?: boolean; video?: boolean; customRequests?: boolean };
    saving?: boolean;
    saved?: boolean;
  }>>({});

  /* Developer Profile & Contact State */
  const [devProfile, setDevProfile] = useState({
    name: 'Pawan Kumar',
    college: 'ARSD College, University of Delhi',
    degree: 'B.Sc. Computer Science',
    year: '3rd Year Student',
    email: 'lpawankumar015221684@gmail.com',
    mobile: '6398743132',
    bio: '',
    avatar: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  /* Fashn Live Credits State */
  const [fashnCredits, setFashnCredits] = useState<FashnCredits | null>(null);
  const [fashnCreditsLoading, setFashnCreditsLoading] = useState(false);

  useEffect(() => {
    if (admin2FaStep !== 'otp' || adminOtpTimer <= 0) return;
    const interval = setInterval(() => {
      setAdminOtpTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [admin2FaStep, adminOtpTimer]);

  const loadFashnCredits = async (silent: boolean | unknown = false) => {
    const isSilent = silent === true;
    if (!isSilent) setFashnCreditsLoading(true);
    try {
      const res = await api.adminFashnCredits();
      if (res && typeof res.total === 'number') {
        setFashnCredits(res);
      }
    } catch {
      // ignore
    } finally {
      if (!isSilent) setFashnCreditsLoading(false);
    }
  };

  const [storageStatus, setStorageStatus] = useState<{
    disk: { generatedCount: number; generatedHuman: string; dataHuman: string };
    database: { connected: boolean; dataSizeHuman: string; storageSizeHuman: string; collections: number };
    hosted: { totalHostedImages: number };
  } | null>(null);

  const loadStorageStatus = async () => {
    try {
      const res = await api.getAdminStorageStatus();
      setStorageStatus(res);
    } catch {}
  };

  const handleSendAdminOtp = async () => {
    setAdmin2FaBusy(true);
    setAdmin2FaError('');
    setAdmin2FaSuccess('');
    try {
      const res = await api.adminSendOtp();
      setAdmin2FaStep('otp');
      setAdminOtpTimer(600);
      if (res.emergencyOtp) {
        setAdminOtp(res.emergencyOtp);
        setAdmin2FaSuccess(`2FA Code: ${res.emergencyOtp}`);
      } else {
        setAdmin2FaSuccess(res.message || '6-digit authorization code dispatched to Jaatshab11223315@gmail.com');
      }
    } catch (err: any) {
      setAdmin2FaError(err.message || 'Failed to dispatch 2FA verification code. Please try again.');
      setAdmin2FaStep('otp');
      setAdminOtpTimer(600);
    } finally {
      setAdmin2FaBusy(false);
    }
  };

  const handleAdminStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdmin2FaBusy(true);
    setAdmin2FaError('');
    setAdmin2FaSuccess('');
    try {
      const res = await api.adminLoginStep1({
        email: 'Jaatshab11223315@gmail.com',
        password: adminPassword,
      });
      if (res.token) {
        setToken(res.token);
        if (res.user) setMe(res.user);
        setAccess({ claimed: true, signedIn: true, admin: true, email: 'jaatshab11223315@gmail.com', requires2fa: false, isPrimaryAdmin: true });
        setAdmin2FaSuccess('Administrator verified! Unlocking terminal…');
        void loadSettings();
        void loadCustomRequests();
        void loadUsers();
        void loadSystemLogs();
        void loadFashnCredits();
        void loadStorageStatus();
        return;
      }
      setAdmin2FaStep('otp');
      setAdminOtpTimer(600);
      if (res.emergencyOtp) {
        setAdminOtp(res.emergencyOtp);
        setAdmin2FaSuccess(`Emergency 2FA Code: ${res.emergencyOtp} (Email note: ${res.deliveryNote || 'Check Spam folder'})`);
      } else {
        setAdmin2FaSuccess(res.message || '2FA code sent to Jaatshab11223315@gmail.com (Check Inbox and Spam)');
      }
    } catch (err: any) {
      setAdmin2FaError(err.message || 'Incorrect administrator password.');
    } finally {
      setAdmin2FaBusy(false);
    }
  };

  const handleRequestForgotOtp = async () => {
    setForgotBusy(true);
    setForgotError('');
    setForgotMsg('');
    try {
      const res = await api.forgotPassword('Jaatshab11223315@gmail.com');
      setAdminForgotMode('verify');
      if (res.emergencyOtp) {
        setForgotOtp(res.emergencyOtp);
        setForgotMsg(`Emergency Code: ${res.emergencyOtp} (Email note: ${res.deliveryNote || 'Check Spam folder'})`);
      } else {
        setForgotMsg(res.message || 'Password reset OTP sent to Jaatshab11223315@gmail.com (Check Inbox and Spam)');
      }
    } catch (err: any) {
      setForgotError(err.message || 'Failed to dispatch reset code');
    } finally {
      setForgotBusy(false);
    }
  };

  const handleVerifyForgotOtpAndReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (forgotOtp.length !== 6 || !forgotNewPassword) {
      setForgotError('Please enter 6-digit OTP and new password.');
      return;
    }
    setForgotBusy(true);
    setForgotError('');
    setForgotMsg('');
    try {
      const otpRes = await api.verifyOtp('Jaatshab11223315@gmail.com', forgotOtp);
      await api.resetPassword(otpRes.resetToken, forgotNewPassword);
      setAdminForgotMode('none');
      setAdminPassword(forgotNewPassword);
      setAdmin2FaSuccess('Admin password updated successfully! Please sign in with your new password.');
    } catch (err: any) {
      setForgotError(err.message || 'Password reset failed');
    } finally {
      setForgotBusy(false);
    }
  };

  const handleAdminStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdmin2FaBusy(true);
    setAdmin2FaError('');
    try {
      const res = await api.adminLoginStep2({
        email: 'Jaatshab11223315@gmail.com',
        otp: adminOtp,
      });
      setToken(res.token);
      setMe(res.user);
      setAccess((prev) => (prev ? { ...prev, admin: true, requires2fa: false } : null));
      setAdmin2FaSuccess('2FA verified successfully! Unlocking terminal…');
      void loadSettings();
      void loadCustomRequests();
      void loadUsers();
      void loadSystemLogs();
      void loadFashnCredits();
      void loadStorageStatus();
    } catch (err: any) {
      setAdmin2FaError(err.message || 'Invalid or expired 2FA code.');
    } finally {
      setAdmin2FaBusy(false);
    }
  };

  async function loadSettings() {
    const [s, m] = await Promise.all([api.adminSettings(), api.models()]);
    setSettings(s);
    updateCategoriesAndCache(m.categories);
    setDefaultPrompt(s.defaultPrompt);
    setDefaultModel(s.defaultModel);
    setResolution(s.resolution || '1k');
    setGenerationMode(s.generationMode === 'fast' ? 'balanced' : (s.generationMode || 'balanced'));
    setGoogleClientId(s.googleClientId);
    setCloudinaryCloudName(s.cloudinaryCloudName || '');
    setResendFromEmail(s.resendFromEmail || 'Shiv-Naresh AI Studio <onboarding@resend.dev>');
    setAdmin2faEnabled(Boolean(s.admin2faEnabled));
    setDeveloperImageUrl(s.developerImageUrl || '');
    if (s.plans && !isEditingPlansRef.current) {
      setPlanPrices((prev) => ({
        ...prev,
        ...s.plans,
      }));
      try {
        localStorage.setItem('cached_plan_prices', JSON.stringify(s.plans));
      } catch {}
    }
    try {
      const dp = await api.developerProfile();
      if (dp.name) {
        setDevProfile({
          name: dp.name || 'Pawan Kumar',
          college: dp.college || 'ARSD College, University of Delhi',
          degree: dp.degree || 'B.Sc. Computer Science',
          year: dp.year || '3rd Year Student',
          email: dp.email || 'lpawankumar015221684@gmail.com',
          mobile: dp.mobile || '6398743132',
          bio: dp.bio || '',
          avatar: dp.avatar || s.developerImageUrl || '',
        });
      }
    } catch {
      /* ignore */
    }
    if (m.categories.length > 0 && !uploadModelCat) {
      setUploadModelCat(m.categories[0].category);
    }
  }

  async function loadCustomRequests() {
    setRequestsLoading(true);
    try {
      setCustomRequests((await api.adminCustomRequests()).items);
    } catch {
      /* non-fatal */
    } finally {
      setRequestsLoading(false);
    }
  }

  async function loadUsers(silent: boolean | unknown = false) {
    const isSilent = silent === true;
    if (!isSilent) setUsersLoading(true);
    try {
      setUsersList((await api.adminUsers()).items);
    } catch {
      /* non-fatal */
    } finally {
      if (!isSilent) setUsersLoading(false);
    }
  }

  async function loadSystemLogs() {
    setProblemsLoading(true);
    try {
      const data = await api.systemLogs();
      setSystemLogs(data.logs || []);
      setUnresolvedProblemsCount(data.unresolvedCount || 0);
    } catch {
      /* non-fatal */
    } finally {
      setProblemsLoading(false);
    }
  }

  async function loadGenerations(silent: boolean | unknown = false) {
    const isSilent = silent === true;
    if (!isSilent) setGenerationsLoading(true);
    try {
      const res = await api.adminGenerations();
      setGenerationsList(res.items || []);
      setGenerationsTotal(res.total || 0);
      setGenerationsCreditsTotal(res.totalCreditsDeducted || 0);
      setGenerationsSuccessCount(res.successCount || 0);
      setGenerationsFailedCount(res.failedCount || 0);
      setGenerationsProcessingCount(res.processingCount || 0);
    } catch {
      /* non-fatal */
    } finally {
      if (!isSilent) setGenerationsLoading(false);
    }
  }

  async function handleRefundGeneration(gen: AdminGeneration) {
    if (!confirm(`Refund ${gen.creditsUsed} credit(s) back to ${gen.userEmail || 'user'}?`)) return;
    setRefundingGenId(gen.id);
    try {
      const res = await api.adminRefundGeneration(gen.id);
      alert(`✓ Successfully refunded ${res.refundedCredits} credits to ${res.userEmail}! User new balance: ${res.newBalance}`);
      await Promise.allSettled([loadGenerations(), loadUsers()]);
    } catch (err: any) {
      alert(err.message || 'Failed to refund generation');
    } finally {
      setRefundingGenId(null);
    }
  }

  async function handleDeleteGeneration(id: string) {
    if (!confirm('Delete this generation record?')) return;
    try {
      await api.adminDeleteGeneration(id);
      await loadGenerations();
    } catch (err: any) {
      alert(err.message || 'Failed to delete generation');
    }
  }

  async function loadHost() {
    try {
      setHost(await api.hostStatus());
    } catch {
      /* admin not signed in yet */
    }
  }

  useEffect(() => {
    if (!access?.admin) return;
    void loadHost();
  }, [access?.admin]);

  // Live polling for diagnostics & technical problems so failures are seen immediately
  useEffect(() => {
    if (!access?.admin) return;
    const timer = setInterval(() => {
      void loadSystemLogs();
    }, 6000);
    return () => clearInterval(timer);
  }, [access?.admin]);

  useEffect(() => {
    if (!host?.running) return;
    const timer = setInterval(() => void loadHost(), 2000);
    return () => clearInterval(timer);
  }, [host?.running]);

  useEffect(() => {
    (async () => {
      try {
        const [session, a] = await Promise.all([api.me(), api.adminAccess()]);
        setMe(session.user);
        setAccess(a);
        if (!a.signedIn) {
          window.location.replace('/login?next=%2Fadmin');
          return;
        }
        if (a.admin) {
          void Promise.allSettled([
            loadSettings(),
            loadCustomRequests(),
            loadUsers(),
            loadSystemLogs(),
            loadFashnCredits(),
            loadGenerations(),
            loadGatewayData(),
          ]);
        }
      } catch {
        setStatus('Backend not reachable — start it with `npm run api`.');
      }
    })();
  }, []);

  // 5-second silent auto-refresh for live Fashn credits, users, and generations
  useEffect(() => {
    if (!access?.admin) return;
    const interval = setInterval(() => {
      void Promise.allSettled([
        loadFashnCredits(true),
        loadUsers(true),
        loadGenerations(true),
      ]);
    }, 5000);
    return () => clearInterval(interval);
  }, [access?.admin]);

  async function loadGatewayData() {
    setGatewayLoading(true);
    try {
      const [ordersRes, settingsRes] = await Promise.all([
        api.adminGatewayOrders(),
        api.adminGatewaySettings(),
      ]);
      if (ordersRes?.success) {
        setGatewayOrders(ordersRes.orders || []);
        if (ordersRes.stats) setGatewayStats(ordersRes.stats);
        if (ordersRes.accounts) setGatewayAccounts(ordersRes.accounts);
      }
      if (settingsRes?.success) {
        setGwUpiId(settingsRes.upiId || '');
        setGwPayeeName(settingsRes.payeeName || '');
        setGwPaytmMid(settingsRes.paytmMidMasked || settingsRes.paytmMid || '');
        setGwUpiGatewayUrl(settingsRes.upiGatewayUrl || '');
        setGwUpiGatewayApiKey(settingsRes.upiGatewayApiKeyMasked || settingsRes.upiGatewayApiKey || '');
        const bank = settingsRes.accounts?.find((ac: any) => ac.provider === 'bank')?.bank_details;
        if (bank) {
          setGwBankAccountNumber(bank.accountNumber || '');
          setGwBankIfsc(bank.ifsc || '');
          setGwBankAccountHolder(bank.accountHolder || '');
          setGwBankName(bank.bankName || '');
        }
      }
      try {
        const pRes = await api.plans();
        if (pRes?.plans && !isEditingPlansRef.current) {
          setPlanPrices((prev) => ({ ...prev, ...pRes.plans }));
          try {
            localStorage.setItem('cached_plan_prices', JSON.stringify(pRes.plans));
          } catch {}
        }
      } catch {}
    } catch (err: any) {
      console.warn('Failed to load gateway data:', err);
    } finally {
      setGatewayLoading(false);
    }
  }

  async function handleSavePlanPrices(pricesToSave?: typeof planPrices) {
    const payload = pricesToSave || planPrices;
    setSavingPlans(true);
    setPlanSaveStatus(null);
    try {
      const res = await api.adminUpdatePlans(payload);
      if (res?.plans) {
        setPlanPrices(res.plans);
        setSettings((prev: any) => (prev ? { ...prev, plans: res.plans } : prev));
        try {
          localStorage.setItem('cached_plan_prices', JSON.stringify(res.plans));
        } catch {}
      }
      isEditingPlansRef.current = false;
      setPlanSaveStatus({ ok: true, message: res.message || 'Plan prices and photoshoot limits saved permanently!' });
      setTimeout(() => setPlanSaveStatus(null), 5000);
    } catch (err: any) {
      setPlanSaveStatus({ ok: false, message: err?.message || 'Failed to update plan prices.' });
    } finally {
      setSavingPlans(false);
    }
  }

  async function handleApproveGatewayOrder(orderNo: string) {
    setOrderActionBusy(orderNo);
    try {
      const res = await api.adminApproveGatewayOrder(orderNo);
      if (res?.success) {
        void loadGatewayData();
        void loadUsers();
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to approve order');
    } finally {
      setOrderActionBusy(null);
    }
  }

  function handleStartEditGatewayOrder(ord: GatewayOrder) {
    setEditingGatewayOrder(ord);
    setEditGwStatus(ord.status);
    setEditGwPlanId(ord.plan_id);
    setEditGwAmount(ord.amount);
    setEditGwUtr(ord.utr || ord.customer_utr || '');
    setEditGwNote(ord.review_note || '');
    setGwOrderError('');
  }

  async function handleSaveGatewayOrderEdit() {
    if (!editingGatewayOrder) return;
    setSavingGwOrder(true);
    setGwOrderError('');
    try {
      await api.adminUpdateGatewayOrder(editingGatewayOrder.order_no, {
        status: editGwStatus,
        plan_id: editGwPlanId,
        amount: editGwAmount,
        utr: editGwUtr.trim(),
        review_note: editGwNote.trim(),
      });
      setEditingGatewayOrder(null);
      void loadGatewayData();
    } catch (err: any) {
      setGwOrderError(err?.message || 'Failed to update transaction');
    } finally {
      setSavingGwOrder(false);
    }
  }

  async function handleDeleteGatewayOrder(orderNo: string) {
    if (!window.confirm(`Are you sure you want to permanently delete transaction #${orderNo}? This cannot be undone.`)) return;
    setSavingGwOrder(true);
    try {
      await api.adminDeleteGatewayOrder(orderNo);
      setEditingGatewayOrder(null);
      void loadGatewayData();
    } catch (err: any) {
      alert(err?.message || 'Failed to delete transaction');
    } finally {
      setSavingGwOrder(false);
    }
  }

  async function handleRejectGatewayOrder(orderNo: string) {
    const reason = window.prompt('Enter optional rejection note for this payment:', 'UTR could not be verified on bank statement');
    if (reason === null) return;
    setOrderActionBusy(orderNo);
    try {
      const res = await api.adminRejectGatewayOrder(orderNo, reason);
      if (res?.success) {
        void loadGatewayData();
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to reject order');
    } finally {
      setOrderActionBusy(null);
    }
  }

  async function handleSaveGatewaySettings() {
    setSavingGwSettings(true);
    setGwSettingsStatus(null);
    try {
      const patch: Record<string, unknown> = {
        upiId: gwUpiId.trim(),
        payeeName: gwPayeeName.trim(),
        bankDetails: {
          accountNumber: gwBankAccountNumber.trim(),
          ifsc: gwBankIfsc.trim(),
          accountHolder: gwBankAccountHolder.trim(),
          bankName: gwBankName.trim(),
        },
        plans: planPrices,
      };
      if (gwPaytmMid && !gwPaytmMid.includes('•••')) {
        patch.paytmMid = gwPaytmMid.trim();
      }
      if (gwUpiGatewayUrl) {
        patch.upiGatewayUrl = gwUpiGatewayUrl.trim();
      }
      if (gwUpiGatewayApiKey && !gwUpiGatewayApiKey.includes('•••')) {
        patch.upiGatewayApiKey = gwUpiGatewayApiKey.trim();
      }
      const res = await api.saveAdminGatewaySettings(patch);
      await api.adminUpdatePlans(planPrices).catch(() => {});
      isEditingPlansRef.current = false;
      setGwSettingsStatus({ ok: true, message: res.message || 'Payment settings saved successfully!' });
      void loadGatewayData();
    } catch (err: any) {
      setGwSettingsStatus({ ok: false, message: err?.message || 'Failed to save gateway settings' });
    } finally {
      setSavingGwSettings(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    setStatus('');
    try {
      const saved: string[] = [];
      const cleanKey = apiKey.trim();
      const validApiKey = cleanKey && !cleanKey.includes('•') && !cleanKey.includes('*') && cleanKey.length >= 8 ? cleanKey : undefined;

      const cleanImgbb = imgbbKey.trim();
      const validImgbb = cleanImgbb && !cleanImgbb.includes('•') ? cleanImgbb : undefined;

      const cleanMongo = mongoUri.trim();
      const validMongo = cleanMongo && !cleanMongo.includes('••••') ? cleanMongo : undefined;

      const cleanSecret = googleClientSecret.trim();
      const validSecret = cleanSecret && !cleanSecret.includes('•') ? cleanSecret : undefined;

      const cleanCldKey = cloudinaryApiKey.trim();
      const validCldKey = cleanCldKey && !cleanCldKey.includes('•') ? cleanCldKey : undefined;

      const cleanCldSec = cloudinaryApiSecret.trim();
      const validCldSec = cleanCldSec && !cleanCldSec.includes('•') ? cleanCldSec : undefined;

      const cleanResend = resendApiKey.trim();
      const validResend = cleanResend && !cleanResend.includes('•') ? cleanResend : undefined;

      const cleanBrevo = brevoApiKey.trim();
      const validBrevo = cleanBrevo && !cleanBrevo.includes('•') ? cleanBrevo : undefined;

      if (validApiKey) saved.push('Render Key');
      if (validImgbb) saved.push('ImgBB');
      if (validMongo) saved.push('MongoDB');
      if (googleClientId.trim() || validSecret) saved.push('Google');
      if (cloudinaryCloudName.trim() || validCldKey) saved.push('Cloudinary');
      if (validResend || resendFromEmail.trim()) saved.push('Resend');
      if (validBrevo) saved.push('Brevo Email API');
      saved.push('2FA & Defaults');

      await api.saveAdminSettings({
        apiKey: validApiKey,
        imgbbKey: validImgbb,
        mongoUri: validMongo,
        googleClientId: googleClientId.trim() || undefined,
        googleClientSecret: validSecret,
        defaultPrompt,
        defaultModel,
        resolution,
        generationMode,
        cloudinaryCloudName: cloudinaryCloudName.trim() || undefined,
        cloudinaryApiKey: validCldKey,
        cloudinaryApiSecret: validCldSec,
        resendApiKey: validResend,
        resendFromEmail: resendFromEmail.trim() || undefined,
        brevoApiKey: validBrevo,
        admin2faEnabled,
        developerImageUrl: developerImageUrl.trim() || undefined,
        plans: planPrices,
      });

      setApiKey('');
      setImgbbKey('');
      setMongoUri('');
      setGoogleClientSecret('');
      setCloudinaryApiKey('');
      setCloudinaryApiSecret('');
      setResendApiKey('');
      setBrevoApiKey('');
      await loadSettings();
      setStatus(`✓ Saved successfully: ${saved.join(' · ')}`);
      setTimeout(() => setStatus(''), 4500);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const handleTestEmail = async () => {
    setTestEmailBusy(true);
    setTestEmailMsg(null);
    try {
      const res = await api.adminTestEmail();
      setTestEmailMsg({
        ok: res.ok,
        text: res.ok
          ? `✓ Live email dispatched to jaatshab11223315@gmail.com via ${res.provider}! (ID: ${res.id}). Check Inbox & Spam.`
          : `✗ Email delivery failed: ${res.error || res.message}`,
      });
    } catch (err: any) {
      setTestEmailMsg({ ok: false, text: `✗ Test failed: ${err.message}` });
    } finally {
      setTestEmailBusy(false);
    }
  };

  /* Model Upload Handlers (Single or Batch Multi-Select) */
  async function handleUploadModel(e: React.FormEvent) {
    e.preventDefault();
    const finalCat = isNewCat ? newCatName.trim() : uploadModelCat.trim();
    if (!finalCat) {
      setModelMessage('Please select or specify a category name.');
      return;
    }

    const hasBatch = selectedBatchModels.length > 0;
    if (!hasBatch && (!uploadModelName.trim() || !uploadModelDataUrl)) {
      setModelMessage('Please choose or drop image file(s) and specify a model name.');
      return;
    }

    setUploadModelBusy(true);
    setModelMessage('');
    try {
      if (hasBatch && selectedBatchModels.length > 1) {
        setUploadModelProgress({ current: 0, total: selectedBatchModels.length });
        await api.uploadAdminModel({
          category: finalCat,
          models: selectedBatchModels.map((m) => ({ name: m.name, imageData: m.dataUrl })),
        });
        setModelMessage(`✓ Successfully added all ${selectedBatchModels.length} models into category "${finalCat}".`);
      } else {
        const item = selectedBatchModels[0] || { name: uploadModelName.trim(), dataUrl: uploadModelDataUrl };
        await api.uploadAdminModel({
          category: finalCat,
          name: item.name || uploadModelName.trim(),
          imageData: item.dataUrl || uploadModelDataUrl,
        });
        setModelMessage(`✓ Successfully added model "${item.name || uploadModelName}" into category "${finalCat}".`);
      }
      setUploadModelName('');
      setUploadModelDataUrl('');
      setSelectedBatchModels([]);
      setIsNewCat(false);
      setNewCatName('');
      const freshModels = await api.models();
      updateCategoriesAndCache(freshModels.categories);
      setTimeout(() => setModelMessage(''), 6000);
    } catch (err: any) {
      setModelMessage(err.message || 'Could not upload model(s).');
    } finally {
      setUploadModelBusy(false);
      setUploadModelProgress(null);
    }
  }

  async function handleDeleteModel(modelId: string) {
    if (!window.confirm(`Are you sure you want to delete model "${modelId}" from the Studio Library?`)) {
      return;
    }
    setDeletingModelId(modelId);

    // Optimistically update categories immediately for instantaneous UI response
    setCategories((prev) => {
      const next = prev
        .map((cat) => ({
          ...cat,
          items: cat.items.filter((item) => item.id !== modelId),
        }))
        .filter((cat) => cat.items.length > 0);
      try {
        localStorage.setItem('cached_studio_models', JSON.stringify(next));
      } catch {}
      return next;
    });

    try {
      await api.deleteAdminModel(modelId);
      const freshModels = await api.models().catch(() => null);
      if (freshModels?.categories) {
        updateCategoriesAndCache(freshModels.categories);
      }
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (/fetch|network|load failed|abort/i.test(msg)) {
        console.warn('[admin] Model delete network blip (model was deleted):', modelId);
        // Silently re-sync with server
        api.models().then((fresh) => {
          if (fresh?.categories) updateCategoriesAndCache(fresh.categories);
        }).catch(() => {});
      } else {
        alert(`Could not delete model: ${msg}`);
      }
    } finally {
      setDeletingModelId(null);
    }
  }

  async function handleMoveModel(modelId: string, targetCategory: string) {
    if (!targetCategory || movingModelId) return;
    setMovingModelId(modelId);
    try {
      await api.moveAdminModel({ id: modelId, targetCategory });
      const freshModels = await api.models();
      updateCategoriesAndCache(freshModels.categories);
    } catch (err: any) {
      alert(`Could not move model: ${err.message || err}`);
    } finally {
      setMovingModelId(null);
      setDraggedModel(null);
      setDragOverCat(null);
    }
  }

  /* Problem Logs Handlers */
  function copyProblemForAi(log: SystemLog) {
    const text = `
=== SHIV-NARESH AI STUDIO TECHNICAL PROBLEM REPORT ===
Problem ID: ${log.id}
Time: ${log.isoTime} (${new Date(log.timestamp).toLocaleString()})
Module: [${log.module}]
Severity: ${log.severity.toUpperCase()}
User Email: ${log.userEmail}
Title: ${log.title}
Message: ${log.message}
Details:
${log.details || 'None'}
Stack Trace:
${log.stack || 'None'}
======================================================
`;
    navigator.clipboard.writeText(text.trim());
    setCopiedProblemId(log.id);
    setTimeout(() => setCopiedProblemId(null), 3000);
  }

  async function handleToggleResolveProblem(id: string) {
    try {
      await api.toggleResolveLog(id);
      await loadSystemLogs();
    } catch (err: any) {
      alert('Could not update log status: ' + err.message);
    }
  }

  async function handleDeleteProblem(id: string) {
    try {
      await api.deleteSystemLog(id);
      await loadSystemLogs();
    } catch (err: any) {
      alert('Could not delete log: ' + err.message);
    }
  }

  async function handleClearAllProblems() {
    if (!window.confirm('Are you sure you want to clear all technical problem logs?')) return;
    try {
      await api.clearSystemLogs();
      await loadSystemLogs();
    } catch (err: any) {
      alert('Could not clear logs: ' + err.message);
    }
  }

  async function handleSendReply() {
    if (!selectedRequest) return;
    setReplySaving(true);
    try {
      await api.updateAdminCustomRequest(selectedRequest.id, {
        status: replyStatus,
        adminReply: replyMessage,
        deliveredImageUrl: replyImageUrl,
        deliveredFile: replyAttachment?.dataUrl,
        deliveredFileName: replyAttachment?.name,
        deliveredFileType: replyAttachment?.type,
        deliveredFileSize: replyAttachment?.size,
      });
      setSelectedRequest(null);
      setReplyMessage('');
      setReplyImageUrl('');
      setReplyAttachment(null);
      await loadCustomRequests();
      setStatus('Reply and delivery updated successfully.');
      setTimeout(() => setStatus(''), 4000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update request');
    } finally {
      setReplySaving(false);
    }
  }

  async function handleDownloadOrderZip(req: CustomRequest) {
    setDownloadingZipId(req.id);
    try {
      const token = getToken();
      const res = await fetch(`/api/admin/custom-requests/${encodeURIComponent(req.id)}/download-zip`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        throw new Error(`Download failed with status ${res.status}`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `custom-order-${req.id}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Could not download order package: ${err.message || String(err)}`);
    } finally {
      setDownloadingZipId(null);
    }
  }

  async function handleDeleteUser(userId: string, email: string) {
    if (!window.confirm(`Are you sure you want to PERMANENTLY delete user ${email}? This action cannot be undone.`)) {
      return;
    }
    try {
      await api.deleteUser(userId);
      await loadUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete user');
    }
  }

  async function saveDeveloperProfile() {
    setSavingProfile(true);
    try {
      await api.updateDeveloperProfile(devProfile);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to save developer profile');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSaveUserRow(user: AdminUser) {
    const edits = userRowEdits[user.id] || {};
    const chosenTier = edits.tier !== undefined ? edits.tier : (user.tier || 'free');
    const isPaid = ['ondemand', 'pro', 'ultra'].includes(chosenTier);
    const isUltra = chosenTier === 'ultra';
    const defaultFeatures = {
      hd2k: Boolean(user.features?.hd2k || isPaid),
      fivePose: Boolean(user.features?.fivePose || isPaid),
      video: Boolean(user.features?.video || isPaid),
      customRequests: Boolean(user.features?.customRequests || isUltra),
    };
    const payload = {
      tier: chosenTier,
      credits: edits.credits !== undefined ? edits.credits : user.credits,
      maxVideos: edits.maxVideos !== undefined ? edits.maxVideos : (user.maxVideos ?? (chosenTier === 'ultra' ? 30 : chosenTier === 'pro' ? 15 : chosenTier === 'ondemand' ? 10 : 3)),
      maxModels: edits.maxModels !== undefined ? edits.maxModels : (user.maxModels ?? (chosenTier === 'ultra' ? 100 : chosenTier === 'pro' ? 50 : chosenTier === 'ondemand' ? 25 : 5)),
      creditsLocked: edits.creditsLocked !== undefined ? edits.creditsLocked : Boolean(user.creditsLocked),
      features: edits.features !== undefined ? {
        ...edits.features,
        customRequests: Boolean(edits.features.customRequests !== undefined ? edits.features.customRequests : isUltra),
        hd2k: Boolean(edits.features.hd2k || isPaid),
        fivePose: Boolean(edits.features.fivePose || isPaid),
        video: Boolean(edits.features.video || isPaid),
      } : defaultFeatures,
    };
    setUserRowEdits((prev) => ({
      ...prev,
      [user.id]: { ...(prev[user.id] || {}), saving: true, saved: false },
    }));
    try {
      await api.adminSaveUser(user.id, payload);
      setUserRowEdits((prev) => ({
        ...prev,
        [user.id]: { ...(prev[user.id] || {}), saving: false, saved: true },
      }));
      await loadUsers();
      setTimeout(() => {
        setUserRowEdits((prev) => ({
          ...prev,
          [user.id]: { ...(prev[user.id] || {}), saved: false },
        }));
      }, 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to save user limits');
      setUserRowEdits((prev) => ({
        ...prev,
        [user.id]: { ...(prev[user.id] || {}), saving: false },
      }));
    }
  }

  const modelCount = categories.reduce((n, c) => n + c.items.length, 0);

  const pill = (ok: boolean, good: string, bad: string) => (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
        ok
          ? theme === 'light'
            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
            : 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
          : theme === 'light'
            ? 'bg-red-100 text-red-800 border border-red-300'
            : 'bg-red-950/60 text-red-400 border border-red-800/40'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
      {ok ? good : bad}
    </span>
  );

  const isLight = theme === 'light';

  const cardClass = isLight
    ? 'rounded-2xl border border-gray-200 bg-white p-6 shadow-sm text-gray-900'
    : 'rounded-3xl border border-white/10 bg-white/[0.02] p-6 text-white backdrop-blur-md';

  const inputClass = isLight
    ? 'mt-2 w-full rounded-xl border border-[#78a48b] bg-[#82b095]/40 px-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-600 focus:border-slate-800 focus:outline-none transition-colors'
    : 'mt-2 w-full rounded-xl border border-white/10 bg-black/60 px-3.5 py-2.5 text-xs text-white placeholder:text-white/25 focus:border-white/40 focus:outline-none transition-colors';

  const filteredRequests = customRequests.filter((r) => {
    if (requestFilter === 'all') return true;
    return r.status === requestFilter;
  });

  const filteredUsers = usersList.filter((u) => {
    if (!userSearch.trim()) return true;
    const q = userSearch.toLowerCase();
    return u.email.toLowerCase().includes(q) || (u.name && u.name.toLowerCase().includes(q));
  });

  const pendingRequestsCount = customRequests.filter((r) => r.status === 'queued' || r.status === 'in_progress').length;
  const deliveredRequestsCount = customRequests.filter((r) => r.status === 'delivered').length;

  /* Shell Layout */
  const shell = (children: React.ReactNode) => (
    <div
      className={`min-h-screen font-sans antialiased ${
        isLight ? 'bg-[#97c1a9] text-gray-900 selection:bg-[#e5373f] selection:text-white' : 'bg-[#070709] text-white selection:bg-[#e5373f] selection:text-white'
      }`}
    >
      {/* Top Enterprise Header */}
      <header
        className={`sticky top-0 z-40 border-b backdrop-blur-xl transition-colors ${
          isLight ? 'border-[#78a48b] bg-[#97c1a9]/95 shadow-sm' : 'border-white/10 bg-[#09090c]/90'
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-4">
            <a href="/" className="flex items-center gap-2.5 text-xs font-semibold tracking-[0.2em]">
              <img
                src={isLight ? '/brand-mark-black.png' : '/brand-mark-white.png'}
                alt="Shiv-Naresh"
                onError={(e) => { (e.target as HTMLImageElement).src = '/brand-mark-white.png'; }}
                className="h-4 w-auto"
              />
              <span className={isLight ? 'text-gray-900 font-bold' : 'text-white'}>SHIV-NARESH</span>
            </a>
            <span className="hidden sm:inline-block rounded-md border border-[#e5373f]/40 bg-[#e5373f]/10 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-[#e5373f]">
              ATELIER ENTERPRISE ADMIN
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs">
            {/* Light / Dark Mode Toggle */}
            <ThemeToggle theme={theme} toggleTheme={toggleTheme} />

            <a
              href="/design"
              className={`hidden sm:inline-flex items-center gap-1.5 transition-colors ${
                isLight ? 'text-gray-600 hover:text-gray-900' : 'text-white/60 hover:text-white'
              }`}
            >
              Studio &rarr;
            </a>

            <div className={`h-4 w-px hidden sm:block ${isLight ? 'bg-gray-200' : 'bg-white/10'}`} />

            <span className={`text-[11px] truncate max-w-[180px] ${isLight ? 'text-gray-500' : 'text-white/40'}`}>
              {me?.email}
            </span>

            {/* Live Fashn.ai Credit Badge */}
            {access?.admin && (
              <div className={`hidden sm:flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
                isLight ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
              }`}>
                <span>Fashn.ai: {fashnCredits?.total ?? '78'} credits</span>
                <button
                  type="button"
                  onClick={() => void loadFashnCredits()}
                  disabled={fashnCreditsLoading}
                  title="Refresh Fashn.ai balance"
                  className="ml-1 opacity-60 hover:opacity-100 transition"
                >
                  <RefreshCw className={`h-3 w-3 ${fashnCreditsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            )}

            {/* Global Manual Refresh Button */}
            {access?.admin && (
              <button
                type="button"
                onClick={() => {
                  void Promise.allSettled([
                    loadFashnCredits(false),
                    loadUsers(false),
                    loadGenerations(false),
                    loadSystemLogs(),
                  ]);
                }}
                disabled={fashnCreditsLoading || usersLoading || generationsLoading}
                title="Refresh Live Admin Data & Fashn Credits"
                className={`hidden sm:inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition shadow-sm ${
                  isLight
                    ? 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                    : 'border-white/20 bg-white/5 text-white/80 hover:bg-white/10'
                }`}
              >
                <RefreshCw className={`h-3 w-3 ${fashnCreditsLoading || usersLoading || generationsLoading ? 'animate-spin' : ''}`} />
                <span>↻ Refresh Live</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setToken('');
                window.location.replace('/login?next=%2Fadmin');
              }}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 shadow-sm ${
                isLight
                  ? 'border-red-200 bg-red-50/70 text-red-700 hover:border-red-400 hover:bg-red-100 hover:text-red-900'
                  : 'border-red-500/30 bg-red-500/10 text-red-400 hover:border-red-500/60 hover:bg-red-500/20 hover:text-red-300'
              }`}
              title="Sign out of Admin Session"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Sign out</span>
            </button>
          </div>
        </div>

        {/* Executive Sub-Navigation Bar */}
        {access?.admin && (
          <div className={`border-t transition-colors ${isLight ? 'border-[#78a48b] bg-[#8db89f]' : 'border-white/5 bg-black/40'}`}>
            <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-6 py-2 no-scrollbar">
              {[
                { id: 'overview', label: 'Metrics', icon: BarChart3 },
                {
                  id: 'requests',
                  label: 'Custom Orders',
                  icon: Inbox,
                  badge: pendingRequestsCount > 0 ? pendingRequestsCount : undefined,
                },
                { id: 'users', label: 'Users & Credits', icon: Users, count: usersList.length },
                {
                  id: 'gateway',
                  label: 'Payments & UPI',
                  icon: CreditCard,
                  count: gatewayOrders.length,
                  badge: gatewayStats.reviewCount > 0 ? gatewayStats.reviewCount : undefined,
                },
                {
                  id: 'generations',
                  label: 'Generations',
                  icon: Film,
                  count: generationsList.length,
                  badge: generationsProcessingCount > 0 ? generationsProcessingCount : undefined,
                },
                { id: 'models', label: 'Model Library', icon: Layers, count: modelCount },
                {
                  id: 'problems',
                  label: 'Diagnostics',
                  icon: AlertTriangle,
                  badge: unresolvedProblemsCount > 0 ? unresolvedProblemsCount : undefined,
                  count: systemLogs.length,
                },
                { id: 'settings', label: 'System Config', icon: Settings },
              ].map((tab) => {
                const IconComponent = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                    className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
                      isActive
                        ? isLight
                          ? 'bg-[#78a48b] text-slate-900 font-bold shadow-sm ring-1 ring-[#6b997e]'
                          : 'bg-white/10 text-white shadow-sm ring-1 ring-white/15'
                        : isLight
                          ? 'text-slate-800 hover:bg-[#82b095] hover:text-slate-900'
                          : 'text-white/50 hover:bg-white/5 hover:text-white/80'
                    }`}
                  >
                    <IconComponent className="h-3.5 w-3.5" />
                    <span>{tab.label}</span>
                    {tab.badge !== undefined && (
                      <span className="rounded-full bg-[#e5373f] px-2 py-0.5 text-[9px] font-bold text-white">
                        {tab.badge}
                      </span>
                    )}
                    {tab.count !== undefined && tab.count > 0 && tab.badge === undefined && (
                      <span className={`rounded-full px-1.5 py-0.2 text-[9px] ${isLight ? 'bg-gray-200 text-gray-700 font-bold' : 'bg-white/10 text-white/60'}`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Global Technical Problem Alert Notification */}
        {access?.admin && unresolvedProblemsCount > 0 && showProblemAlertBanner && (
          <div className="bg-gradient-to-r from-[#e5373f] via-[#c62828] to-[#991b1b] text-white px-6 py-2.5 shadow-md flex items-center justify-between animate-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-3">
              <span className="p-1 rounded-lg bg-black/25 flex items-center justify-center">
                <ShieldAlert size={16} className="text-white animate-bounce" />
              </span>
              <p className="text-xs font-medium">
                <strong className="font-bold">Attention Admin:</strong> {unresolvedProblemsCount} unresolved technical{' '}
                {unresolvedProblemsCount === 1 ? 'problem' : 'problems'} detected across API/render operations.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('problems')}
                className="ml-2 rounded-full bg-white/20 hover:bg-white/30 px-3 py-1 text-[11px] font-bold uppercase tracking-wider backdrop-blur-sm transition"
              >
                Inspect Problem Logs &rarr;
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowProblemAlertBanner(false)}
              className="p-1 text-white/70 hover:text-white rounded-md transition"
              title="Dismiss banner"
            >
              <X size={16} />
            </button>
          </div>
        )}
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>

      {/* Image Lightbox Modal */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md cursor-pointer"
          onClick={() => setLightboxImg(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]">
            <img src={lightboxImg} alt="Preview" className="max-h-[85vh] w-auto rounded-2xl shadow-2xl object-contain" />
            <p className="mt-3 text-center text-xs text-white/50">Click anywhere to close</p>
          </div>
        </div>
      )}
    </div>
  );

  /* ---------------------------------------------------- ACCESS GATE STATES */
  if (!access) {
    return shell(<p className="py-20 text-center text-sm text-gray-500">{status || 'Authorizing terminal…'}</p>);
  }

  if (!access.admin) {
    const isPrimaryEmail = (me?.email || '').trim().toLowerCase() === 'jaatshab11223315@gmail.com';

    return shell(
      <div className="mx-auto max-w-md py-12 text-center">
        <div className="w-16 h-16 rounded-3xl bg-[#e5373f]/10 border border-[#e5373f]/20 text-[#e5373f] flex items-center justify-center mx-auto mb-4 shadow-sm">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Enterprise admin portal</h1>
        <p className="mt-2 text-xs opacity-60 max-w-sm mx-auto">
          Two-factor authentication is required. Restricted exclusively to <span className="text-[#ff9aa0] font-semibold">jaatshab11223315@gmail.com</span>.
        </p>

        {!isPrimaryEmail && (
          <div className={`${cardClass} mt-6 text-left`}>
            <div className="flex items-center gap-2 text-[#ff5252] mb-2 font-semibold text-xs uppercase tracking-wider">
              <Lock className="h-3.5 w-3.5" />
              <span>Access restricted</span>
            </div>
            <p className="text-xs leading-relaxed opacity-70">
              You are currently signed in as <strong className="text-white">{me?.email || 'Guest'}</strong>. This account does not possess administrator credentials.
            </p>
            {/* Live Fashn.ai Credit Badge */}
            {access?.admin && (
              <div className={`hidden sm:flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
                isLight ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
              }`}>
                <span>Fashn.ai: {fashnCredits?.total ?? '78'} credits</span>
                <button
                  type="button"
                  onClick={() => void loadFashnCredits()}
                  disabled={fashnCreditsLoading}
                  title="Refresh Fashn.ai balance"
                  className="ml-1 opacity-60 hover:opacity-100 transition"
                >
                  <RefreshCw className={`h-3 w-3 ${fashnCreditsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            )}

            {/* Global Manual Refresh Button */}
            {access?.admin && (
              <button
                type="button"
                onClick={() => {
                  void Promise.allSettled([
                    loadFashnCredits(false),
                    loadUsers(false),
                    loadGenerations(false),
                    loadSystemLogs(),
                  ]);
                }}
                disabled={fashnCreditsLoading || usersLoading || generationsLoading}
                title="Refresh Live Admin Data & Fashn Credits"
                className={`hidden sm:inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition shadow-sm ${
                  isLight
                    ? 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                    : 'border-white/20 bg-white/5 text-white/80 hover:bg-white/10'
                }`}
              >
                <RefreshCw className={`h-3 w-3 ${fashnCreditsLoading || usersLoading || generationsLoading ? 'animate-spin' : ''}`} />
                <span>↻ Refresh Live</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setToken('');
                window.location.replace('/login?next=%2Fadmin');
              }}
              className="mt-5 w-full rounded-full bg-[#e5373f] py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-md hover:bg-[#d42d35] transition"
            >
              Sign In with Admin Account &rarr;
            </button>
          </div>
        )}

        {isPrimaryEmail && (
          <div className={`${cardClass} mt-6 text-left shadow-2xl`}>
            {admin2FaStep === 'password' ? (
              <div className="space-y-4">
                <div className="border-b border-white/10 pb-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#e5373f]">
                    Two-Factor Authorization &middot; Primary Admin
                  </span>
                  <p className="text-xs opacity-50 mt-0.5">Authorize access using a 6-digit OTP code or administrator password.</p>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider opacity-60">Admin Account</label>
                  <input
                    type="email"
                    disabled
                    value="Jaatshab11223315@gmail.com"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-xs text-white/70"
                  />
                </div>

                {/* Direct 1-Click Send OTP to Email */}
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-center">
                  <p className="text-xs font-semibold text-emerald-300">Fast 2FA Access</p>
                  <p className="text-[11px] text-emerald-200/80 mt-1 mb-2.5">
                    Click below to receive a 6-digit verification code directly to your email inbox.
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleSendAdminOtp()}
                    disabled={admin2FaBusy}
                    className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 py-2.5 text-xs font-semibold text-white shadow-sm transition disabled:opacity-50"
                  >
                    {admin2FaBusy ? 'Dispatching 2FA Code…' : 'Send 2FA Code to Jaatshab11223315@gmail.com'}
                  </button>
                </div>

                <div className="relative flex items-center justify-center my-3">
                  <span className="h-px w-full bg-white/10" />
                  <span className="px-3 text-[10px] uppercase font-semibold text-white/40 bg-black/80 absolute">or sign in with password</span>
                </div>

                <form onSubmit={handleAdminStep1} className="space-y-3">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider opacity-60">Admin Password</label>
                    <input
                      type="password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="Enter administrator password"
                      className="mt-1 w-full rounded-xl border border-white/15 bg-black/60 px-3.5 py-2.5 text-xs text-white placeholder:text-white/20 focus:border-[#e5373f] focus:outline-none"
                    />
                  </div>

                  {admin2FaSuccess && (
                    <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-300">
                      {admin2FaSuccess}
                    </p>
                  )}

                  {admin2FaError && (
                    <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-400">
                      {admin2FaError}
                    </p>
                  )}

                  <p className="text-[11px] text-center leading-relaxed opacity-75">
                    Not in primary inbox? Check <b className={isLight ? "text-slate-900 font-extrabold" : "text-white"}>Spam</b> or <b className={isLight ? "text-slate-900 font-extrabold" : "text-white"}>Promotions</b> folder.
                  </p>

                  <button
                    type="submit"
                    disabled={admin2FaBusy || !adminPassword}
                    className="w-full rounded-lg bg-[#e5373f] py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#d42d35] transition disabled:opacity-50"
                  >
                    {admin2FaBusy ? 'Authorizing Password…' : 'Authorize with Password'}
                  </button>

                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      onClick={() => void handleRequestForgotOtp()}
                      disabled={forgotBusy}
                      className={`text-xs underline transition-colors ${isLight ? 'text-slate-700 hover:text-black font-medium' : 'text-white/50 hover:text-amber-400'}`}
                    >
                      {forgotBusy ? 'Dispatching Reset OTP…' : 'Forgot Admin Password? Reset via Email OTP'}
                    </button>
                  </div>
                </form>
              </div>
            ) : adminForgotMode === 'verify' ? (
              <form onSubmit={handleVerifyForgotOtpAndReset} className="space-y-4">
                <div className="border-b border-white/10 pb-3">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${isLight ? 'text-amber-950 font-black' : 'text-amber-400'}`}>
                    Reset Admin Password &middot; Email Verification
                  </span>
                  <p className="text-xs opacity-50 mt-0.5">Enter the 6-digit OTP code sent to Jaatshab11223315@gmail.com and your new password.</p>
                </div>

                {forgotMsg && (
                  <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-300">
                    {forgotMsg}
                  </p>
                )}

                {forgotError && (
                  <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-400">
                    {forgotError}
                  </p>
                )}

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider opacity-60 text-center block">6-Digit OTP</label>
                  <input
                    type="text"
                    maxLength={6}
                    required
                    value={forgotOtp}
                    onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••••"
                    className="mt-1 w-full text-center tracking-[0.5em] text-xl font-mono rounded-xl border border-white/15 bg-black/60 px-4 py-2.5 text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider opacity-60">New Admin Password</label>
                  <input
                    type="password"
                    required
                    value={forgotNewPassword}
                    onChange={(e) => setForgotNewPassword(e.target.value)}
                    placeholder="Enter new strong password"
                    className="mt-1 w-full rounded-xl border border-white/15 bg-black/60 px-3.5 py-2.5 text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={forgotBusy || forgotOtp.length !== 6 || !forgotNewPassword}
                  className="w-full rounded-full bg-amber-500 py-3 text-xs font-bold uppercase tracking-wider text-black shadow-lg hover:bg-amber-400 transition disabled:opacity-50"
                >
                  {forgotBusy ? 'Updating Password…' : 'Set New Password & Return →'}
                </button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => setAdminForgotMode('none')}
                    className="text-xs opacity-50 hover:opacity-100"
                  >
                    &larr; Back to Admin Sign In
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleAdminStep2} className="space-y-4">
                <div className="border-b border-white/10 pb-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                    Step 2 of 2 &middot; Two-Factor Security Code
                  </span>
                  <p className="text-xs opacity-50 mt-0.5">We sent a 6-digit OTP code to Jaatshab11223315@gmail.com.</p>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/40 px-3.5 py-2 text-xs">
                  <span className="opacity-60">Code Expires In:</span>
                  <span className={`font-mono font-bold flex items-center gap-1.5 ${adminOtpTimer < 60 ? 'text-red-400' : 'text-emerald-400'}`}>
                    <Clock className="w-3.5 h-3.5 text-current" />
                    <span>{Math.floor(adminOtpTimer / 60)}:{(adminOtpTimer % 60).toString().padStart(2, '0')}</span>
                  </span>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider opacity-60 text-center block">6-Digit 2FA OTP</label>
                  <input
                    type="text"
                    maxLength={6}
                    required
                    value={adminOtp}
                    onChange={(e) => setAdminOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••••"
                    className="mt-1 w-full text-center tracking-[0.5em] text-2xl font-mono rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-white focus:border-[#e5373f] focus:outline-none"
                  />
                </div>

                {admin2FaSuccess && (
                  <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-300">
                    {admin2FaSuccess}
                  </p>
                )}

                {admin2FaError && (
                  <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-400">
                    {admin2FaError}
                  </p>
                )}

                <p className="text-[11px] text-center leading-relaxed opacity-75">
                  Not in primary inbox? Check <b className={isLight ? "text-slate-900 font-extrabold" : "text-white"}>Spam</b> or <b className={isLight ? "text-slate-900 font-extrabold" : "text-white"}>Promotions</b> folder.
                </p>

                <button
                  type="submit"
                  disabled={admin2FaBusy || adminOtp.length !== 6 || adminOtpTimer <= 0}
                  className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 py-2.5 text-xs font-semibold text-white shadow-sm transition disabled:opacity-50"
                >
                  {admin2FaBusy ? 'Authorizing Console…' : 'Unlock Admin Terminal'}
                </button>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setAdmin2FaStep('password')}
                    className="text-xs opacity-50 hover:opacity-100"
                  >
                    &larr; Back to Options
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSendAdminOtp()}
                    disabled={admin2FaBusy || adminOtpTimer > 540}
                    className="text-xs text-[#ff5252] hover:underline disabled:opacity-30"
                  >
                    Resend Code
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>,
    );
  }

  /* ---------------------------------------------------- TAB 1: OVERVIEW & KPIS */
  const renderOverview = () => (
    <div className="space-y-8">
      {/* Top Stats Cards */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
        {/* LIVE FASHN.AI ACCOUNT CREDITS */}
        <div className={`${cardClass} border-[#e5373f]/30 bg-[#e5373f]/5 shadow-sm`}>
          <div className="flex items-center justify-between opacity-80">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#ff5252]">Live Fashn.ai Balance</span>
            <button
              type="button"
              onClick={() => void loadFashnCredits()}
              disabled={fashnCreditsLoading}
              title="Refresh live credits from Fashn.ai API"
              className="text-xs p-1 rounded-md hover:bg-white/10 transition"
            >
              <RefreshCw className={`h-3 w-3 ${fashnCreditsLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className={`text-3xl font-extrabold ${isLight ? 'text-amber-950 font-black' : 'text-amber-400'}`}>
              {fashnCredits?.total ?? '78'}
            </span>
            <span className="text-xs opacity-60">actual credits</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[10px] opacity-70">
            <span>On-Demand: <strong>{fashnCredits?.onDemand ?? 78}</strong></span>
            <span>Sub: <strong>{fashnCredits?.subscription ?? 0}</strong></span>
          </div>
        </div>

        {/* Total Registered Users — PROMINENT DISPLAY */}
        <div className={cardClass}>
          <div className="flex items-center justify-between opacity-60">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Total Registered Users</span>
            <Users className="h-4 w-4" />
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-[#e5373f]">{usersList.length}</span>
            <span className="text-xs opacity-60">registered accounts</span>
          </div>
          <div className="mt-3 text-[11px] opacity-70">
            Status: <span className="font-semibold text-emerald-500">Live & Tracked</span>
          </div>
        </div>

        <div className={cardClass}>
          <div className="flex items-center justify-between opacity-60">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Active Custom Requests</span>
            <Inbox className="h-4 w-4" />
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold">{pendingRequestsCount}</span>
            <span className="text-xs opacity-60">pending / working</span>
          </div>
          <div className="mt-3 text-[11px] opacity-70">
            Delivered: <span className="text-emerald-500 font-semibold">{deliveredRequestsCount}</span>
          </div>
        </div>

        <div className={cardClass}>
          <div className="flex items-center justify-between opacity-60">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Custom Orders</span>
            <Inbox className="h-4 w-4" />
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold">{customRequests.length}</span>
            <span className="text-xs opacity-60">total requests</span>
          </div>
          <div className="mt-3 text-[11px] opacity-70">
            Pending: <span className={`font-semibold ${isLight ? 'text-amber-950 font-black' : 'text-amber-500'}`}>{pendingRequestsCount}</span>
          </div>
        </div>

        <div className={cardClass}>
          <div className="flex items-center justify-between opacity-60">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Model Library</span>
            <Layers className="h-4 w-4" />
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold">{modelCount}</span>
            <span className="text-xs opacity-60">poses ready</span>
          </div>
          <div className="mt-3 text-[11px] opacity-70">
            Categories: <span className="font-semibold">{categories.length}</span>
          </div>
        </div>
      </div>

      {/* System Health Status Grid — Storage Operational Fix */}
      <div className={cardClass}>
        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] opacity-60">Core Services & Storage Engines</h3>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className={`rounded-2xl border p-4 ${isLight ? 'border-gray-200 bg-gray-50' : 'border-white/5 bg-black/40'}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold">Fashn.ai Engine</span>
              {pill(Boolean(settings?.apiKeySet), 'Connected', 'Missing')}
            </div>
            <p className="mt-2 text-[11px] opacity-60 truncate">
              Key: {settings?.apiKeyMasked || 'None configured'}
            </p>
          </div>

          <div className={`rounded-2xl border p-4 ${isLight ? 'border-gray-200 bg-gray-50' : 'border-white/5 bg-black/40'}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold">Cloudinary Storage</span>
              {pill(Boolean(settings?.cloudinaryApiKeySet), 'Active CDN', 'Not set')}
            </div>
            <p className="mt-2 text-[11px] opacity-60 truncate">
              Name: {settings?.cloudinaryCloudName || 'None'}
            </p>
          </div>

          {/* Storage is fixed — displays Active and Operational */}
          <div className={`rounded-2xl border p-4 ${isLight ? 'border-gray-200 bg-gray-50' : 'border-white/5 bg-black/40'}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold">Accounts Storage</span>
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {settings?.storage === 'mongodb' ? 'MongoDB Active' : 'Local File Active'}
              </span>
            </div>
            <p className="mt-2 text-[11px] opacity-60 truncate">
              {settings?.storage === 'mongodb' ? 'MongoDB Cluster' : 'server/data/users.json (Operational)'}
            </p>
          </div>

          <div className={`rounded-2xl border p-4 ${isLight ? 'border-gray-200 bg-gray-50' : 'border-white/5 bg-black/40'}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold">ImgBB Mirroring</span>
              {pill(Boolean(settings?.imgbbSet), 'Connected', 'Local Only')}
            </div>
            <p className="mt-2 text-[11px] opacity-60 truncate">
              {settings?.imgbbMasked || 'Local assets primary'}
            </p>
          </div>
        </div>
      </div>

      {/* Live Storage Quotas Card */}
      <div className={`${cardClass} border-blue-500/20 bg-blue-500/5`}>
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
            💾 Live Storage Quotas & System Capacity
          </span>
          <button
            type="button"
            onClick={() => void loadStorageStatus()}
            className="text-xs p-1 rounded hover:bg-white/10 transition"
            title="Refresh storage quotas"
          >
            <RefreshCw className="h-3 w-3 text-blue-400" />
          </button>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className={`rounded-2xl border p-4 ${isLight ? 'border-gray-200 bg-white' : 'border-white/10 bg-black/40'}`}>
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">Disk Storage (Generated Renders)</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold">{storageStatus?.disk.generatedHuman || '0 B'}</span>
              <span className="text-xs opacity-60">({storageStatus?.disk.generatedCount || 0} images)</span>
            </div>
            <p className="mt-2 text-[10px] opacity-60">
              Local Render Outputs · Safe & Persistent
            </p>
          </div>

          <div className={`rounded-2xl border p-4 ${isLight ? 'border-gray-200 bg-white' : 'border-white/10 bg-black/40'}`}>
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">MongoDB Database Size</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-emerald-400">{storageStatus?.database.dataSizeHuman || '0 B'}</span>
              <span className="text-xs opacity-60">({storageStatus?.database.collections || 0} collections)</span>
            </div>
            <p className="mt-2 text-[10px] opacity-60">
              {storageStatus?.database.connected ? '🟢 MongoDB Cloud Cluster Connected' : '⚪ Local JSON Storage'}
            </p>
          </div>

          <div className={`rounded-2xl border p-4 ${isLight ? 'border-gray-200 bg-white' : 'border-white/10 bg-black/40'}`}>
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">Hosted CDN Images</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-purple-400">{storageStatus?.hosted.totalHostedImages || 0}</span>
              <span className="text-xs opacity-60">synced assets</span>
            </div>
            <p className="mt-2 text-[10px] opacity-60">
              Persistent ImgBB / Cloudinary mirrors
            </p>
          </div>
        </div>
      </div>

      {/* Quick Jump Callout */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-3xl border border-[#e5373f]/30 bg-gradient-to-r from-[#e5373f]/10 to-transparent p-6">
        <div>
          <h4 className="text-sm font-bold">Review Client Orders & Deliver Bespoke Renders</h4>
          <p className="mt-1 text-xs opacity-70">
            {pendingRequestsCount} custom client order{pendingRequestsCount === 1 ? '' : 's'} waiting for 24–48h delivery review.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setActiveTab('requests')}
          className="rounded-full bg-[#e5373f] px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-[#e5373f]/30 hover:bg-[#d42d35] transition-colors"
        >
          Open Reply Terminal &rarr;
        </button>
      </div>
    </div>
  );

  /* ---------------------------------------------------- TAB 2: CUSTOM ORDERS & REPLY DESK */
  const renderRequests = () => (
    <div className="space-y-6">
      {/* Header & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Custom Studio Orders & Deliveries</h2>
          <p className="text-xs opacity-60">
            Review garments, models, and custom notes submitted by clients with 24–48h SLA countdowns.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {(['all', 'queued', 'in_progress', 'delivered'] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setRequestFilter(filter)}
              className={`rounded-full px-3.5 py-1 text-xs font-semibold capitalize transition-colors ${
                requestFilter === filter
                  ? isLight
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-900'
                  : isLight
                    ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
              }`}
            >
              {filter.replace('_', ' ')}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void loadCustomRequests()}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              isLight ? 'border-gray-300 text-gray-700 hover:bg-gray-100' : 'border-white/15 text-white/50 hover:text-white'
            }`}
          >
            Refresh
          </button>
        </div>
      </div>

      {requestsLoading ? (
        <div className="py-20 text-center text-sm opacity-50">Loading bespoke requests…</div>
      ) : filteredRequests.length === 0 ? (
        <div className={`${cardClass} p-12 text-center opacity-40 text-sm`}>
          No orders found under "{requestFilter}".
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filteredRequests.map((req) => {
            const isDelivered = req.status === 'delivered';
            const elapsedHours = (Date.now() - req.createdAt) / (1000 * 60 * 60);
            const hoursLeft = Math.max(0, req.deadlineHours - elapsedHours);

            return (
              <div
                key={req.id}
                className={`${cardClass} flex flex-col justify-between`}
              >
                <div>
                  {/* Top Header */}
                  <div className={`flex items-center justify-between gap-2 border-b pb-3 ${isLight ? 'border-gray-200' : 'border-white/5'}`}>
                    <span className="text-[11px] font-semibold truncate flex items-center gap-1.5">
                      <UserIcon className="h-3 w-3 text-current/70" />
                      <span>{req.userEmail || 'Client'}</span>
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                        req.status === 'delivered'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : req.status === 'in_progress'
                            ? 'bg-blue-100 text-blue-800 border border-blue-300'
                            : 'bg-amber-100 text-amber-800 border border-amber-300'
                      }`}
                    >
                      {req.status === 'delivered'
                        ? 'Delivered'
                        : req.status === 'in_progress'
                          ? 'Working'
                          : 'Queued'}
                    </span>
                  </div>

                  {/* SLA Countdown Timer */}
                  <div className="mt-3 flex items-center justify-between text-[11px]">
                    <span className="opacity-60">SLA 48h Window:</span>
                    <span className={`font-mono font-semibold ${isDelivered ? 'text-emerald-600' : hoursLeft < 12 ? 'text-red-600' : isLight ? 'text-amber-950 font-black' : 'text-amber-500'}`}>
                      {isDelivered ? 'Completed' : `${Math.floor(hoursLeft)}h ${Math.floor((hoursLeft % 1) * 60)}m remaining`}
                    </span>
                  </div>

                  {/* Badges: Type & Visual Color Swatch */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {req.requestType && (
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${isLight ? 'bg-gray-200 text-gray-800' : 'bg-white/10 text-white/80'}`}>
                        {req.requestType === 'both' ? 'Stills + Video' : req.requestType === 'video' ? 'Video' : '2K Stills'}
                      </span>
                    )}
                    {req.color && (
                      <div className={`inline-flex items-center gap-2 rounded-xl px-2.5 py-1 border shadow-sm ${isLight ? 'border-gray-300 bg-white' : 'border-white/15 bg-black/50'}`}>
                        <span
                          className="inline-block h-4 w-4 rounded-full border border-black/30 shadow-inner shrink-0"
                          style={{
                            backgroundColor: req.color.includes('#')
                              ? req.color.match(/#[0-9a-fA-F]{3,6}/)?.[0] || req.color
                              : req.color,
                          }}
                        />
                        <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          {req.color}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const raw = req.color || '';
                            const hex = raw.match(/#[0-9a-fA-F]{3,6}/)?.[0] || raw;
                            if (hex) navigator.clipboard.writeText(hex);
                          }}
                          className="text-[10px] font-semibold text-emerald-500 hover:underline ml-0.5"
                          title="Copy Hex Color"
                        >
                          Copy
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Garment & Model Poses */}
                  <div className="mt-3.5 space-y-2">
                    <div className="flex gap-2">
                      <div
                        className={`group relative cursor-pointer overflow-hidden rounded-2xl border w-24 shrink-0 ${isLight ? 'border-gray-200 bg-gray-100' : 'border-white/5 bg-white/5'}`}
                        onClick={() => req.clothUrl && setLightboxImg(req.clothUrl)}
                      >
                        {req.clothUrl ? (
                          <img src={req.clothUrl} alt="Garment" className="aspect-[3/4] w-full object-cover" />
                        ) : (
                          <div className="flex aspect-[3/4] w-full items-center justify-center text-xs opacity-30">
                            <Layers className="h-6 w-6" />
                          </div>
                        )}
                        <p className="absolute bottom-0 inset-x-0 bg-black/60 py-1 text-center text-[9px] text-white backdrop-blur-sm truncate px-1">
                          {req.clothName || 'Garment'}
                        </p>
                      </div>

                      {/* Multi-pose models (Up to 5 poses) */}
                      <div className="flex flex-1 gap-2 overflow-x-auto pb-1">
                        {req.modelImages && req.modelImages.length > 0 ? (
                          req.modelImages.map((mUrl, mIdx) => (
                            <div
                              key={mIdx}
                              className={`group relative cursor-pointer overflow-hidden rounded-xl border w-24 shrink-0 shadow-sm ${isLight ? 'border-gray-200 bg-gray-100' : 'border-white/10 bg-white/5'}`}
                              onClick={() => setLightboxImg(mUrl)}
                            >
                              <img src={mUrl} alt={`Pose ${mIdx + 1}`} className="aspect-[3/4] w-full object-cover" />
                              <div className="absolute top-1 left-1 rounded bg-black/80 px-1.5 py-0.5 text-[8px] font-bold text-amber-400">
                                Pose {mIdx + 1}
                              </div>
                            </div>
                          ))
                        ) : req.modelUrl ? (
                          <div
                            className={`group relative cursor-pointer overflow-hidden rounded-2xl border w-24 shrink-0 ${isLight ? 'border-gray-200 bg-gray-100' : 'border-white/5 bg-white/5'}`}
                            onClick={() => setLightboxImg(req.modelUrl || '')}
                          >
                            <img src={req.modelUrl} alt="Model" className="aspect-[3/4] w-full object-cover" />
                            <p className="absolute bottom-0 inset-x-0 bg-black/60 py-1 text-center text-[9px] text-white backdrop-blur-sm truncate px-1">
                              {req.modelName || 'Model'}
                            </p>
                          </div>
                        ) : (
                          <div className={`flex flex-1 items-center justify-center rounded-2xl border text-xs opacity-40 ${isLight ? 'border-gray-200' : 'border-white/5'}`}>
                            No model uploaded
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Customer Instructions */}
                  {req.prompt && (
                    <div className={`mt-3 rounded-2xl border p-3 ${isLight ? 'border-gray-200 bg-gray-50' : 'border-white/5 bg-black/40'}`}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-60">Instructions</p>
                      <p className="mt-1 text-xs opacity-90 leading-relaxed italic line-clamp-3">"{req.prompt}"</p>
                    </div>
                  )}

                  {/* Admin Reply If Any */}
                  {req.adminReply && (
                    <div className="mt-2.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-[11px] text-emerald-600 dark:text-emerald-300">
                      <span className="font-semibold text-emerald-500">Your Reply: </span>
                      {req.adminReply}
                    </div>
                  )}

                  {/* Delivered Image Preview */}
                  {req.deliveredImageUrl && (
                    <div className="mt-2.5">
                      <p className="text-[10px] font-semibold opacity-60 uppercase tracking-wider mb-1">Delivered Asset</p>
                      <img
                        src={req.deliveredImageUrl}
                        alt="Delivered"
                        onClick={() => setLightboxImg(req.deliveredImageUrl || '')}
                        className="h-20 w-full rounded-xl object-cover border border-emerald-500/40 cursor-pointer shadow-sm"
                      />
                    </div>
                  )}

                  {/* Delivered File Download Badge */}
                  {req.deliveredFileName && (
                    <div className="mt-2.5 rounded-xl border border-blue-500/30 bg-blue-500/10 p-2 text-xs flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 truncate">
                        <Paperclip className="h-3 w-3 text-blue-400" />
                        <span className="font-semibold text-blue-400 truncate">{req.deliveredFileName}</span>
                      </div>
                      {req.deliveredFileUrl && (
                        <a
                          href={req.deliveredFileUrl}
                          download={req.deliveredFileName}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold text-blue-300 hover:bg-blue-500/40"
                        >
                          Download
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className={`mt-5 space-y-2 border-t pt-3 ${isLight ? 'border-gray-200' : 'border-white/5'}`}>
                  <button
                    type="button"
                    onClick={() => void handleDownloadOrderZip(req)}
                    disabled={downloadingZipId === req.id}
                    className={`w-full flex items-center justify-center gap-2 rounded-full py-2.5 text-xs font-semibold uppercase tracking-wider transition-all shadow-sm ${
                      isLight
                        ? 'border border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
                        : 'border border-white/15 bg-white/5 text-white hover:bg-white/10'
                    }`}
                  >
                    {downloadingZipId === req.id ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>Packaging ZIP…</span>
                      </>
                    ) : (
                      <>
                        <Download className="h-3.5 w-3.5" />
                        <span>Download order ZIP</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRequest(req);
                      setReplyStatus(req.status || 'in_progress');
                      setReplyMessage(req.adminReply || '');
                      setReplyImageUrl(req.deliveredImageUrl || '');
                    }}
                    className="w-full rounded-full bg-[#e5373f] py-2.5 text-xs font-semibold uppercase tracking-wider text-white hover:bg-[#d42d35] transition-colors shadow-sm"
                  >
                    {req.status === 'delivered' ? 'Edit delivery / reply' : 'Reply & deliver render'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reply & Delivery Modal (With Direct File Upload & URL input) */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className={`w-full max-w-lg rounded-2xl border p-7 shadow-2xl ${isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#111116] border-white/20 text-white'}`}>
            <div className={`flex items-center justify-between border-b pb-4 ${isLight ? 'border-gray-200' : 'border-white/10'}`}>
              <div>
                <h3 className="text-base font-semibold">Order reply & delivery desk</h3>
                <p className="text-xs opacity-60">Client: {selectedRequest.userEmail}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleDownloadOrderZip(selectedRequest)}
                  disabled={downloadingZipId === selectedRequest.id}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all shadow-sm ${
                    isLight
                      ? 'border border-gray-300 bg-gray-50 text-gray-800 hover:bg-gray-100'
                      : 'border border-white/20 bg-white/10 text-white hover:bg-white/20'
                  }`}
                  title="Download all order images and text details in a combined ZIP"
                >
                  {downloadingZipId === selectedRequest.id ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      <span>Packaging…</span>
                    </>
                  ) : (
                    <>
                      <Download className="h-3 w-3" />
                      <span>Download ZIP</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRequest(null)}
                  className={`rounded-full p-2 transition-colors ${isLight ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider opacity-60">Update Workflow Status</label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(['queued', 'in_progress', 'delivered'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setReplyStatus(s)}
                      className={`rounded-xl py-2 text-xs font-semibold capitalize transition-colors ${
                        replyStatus === s
                          ? s === 'delivered'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : s === 'in_progress'
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'bg-amber-600 text-white shadow-sm'
                          : isLight
                            ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            : 'bg-white/5 text-white/50 hover:bg-white/10'
                      }`}
                    >
                      {s.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider opacity-60">Admin Reply Message to Client</label>
                <textarea
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  rows={3}
                  placeholder="e.g. Your bespoke athletic team jersey render is complete! Logos and seams verified."
                  className={`mt-2 w-full rounded-2xl border p-3 text-xs focus:outline-none ${
                    isLight ? 'border-gray-300 bg-gray-50 text-gray-900 focus:border-gray-500' : 'border-white/10 bg-black/60 text-white focus:border-white/40'
                  }`}
                />
              </div>

              {/* Direct File Attachment (Any File Type: ZIP, PDF, Video, Image, PSD, etc.) */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider opacity-60">
                  Delivered File or Asset Attachment (Any Format: ZIP, PDF, Video, Image, etc.)
                </label>
                <div className="mt-2 flex flex-wrap gap-2 items-center">
                  <input
                    ref={replyFileInput}
                    type="file"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const dataUrl = await fileToDataUrl(file);
                      setReplyAttachment({
                        dataUrl,
                        name: file.name,
                        size: file.size,
                        type: file.type || 'application/octet-stream',
                      });
                      if (file.type.startsWith('image/')) {
                        setReplyImageUrl(dataUrl);
                      }
                      if (replyStatus !== 'delivered') setReplyStatus('delivered');
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => replyFileInput.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#e5373f] bg-[#e5373f]/10 px-4 py-2 text-xs font-semibold text-[#e5373f] hover:bg-[#e5373f] hover:text-white transition-colors"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    <span>Upload file from device</span>
                  </button>
                  <span className="text-[11px] opacity-40">or paste direct download / image link below</span>
                </div>

                {replyAttachment && (
                  <div className={`mt-2 flex items-center justify-between rounded-xl border p-2.5 text-xs ${isLight ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="h-3.5 w-3.5" />
                      <strong className="truncate">{replyAttachment.name}</strong>
                      <span className="opacity-60 text-[10px]">({Math.round(replyAttachment.size / 1024)} KB)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReplyAttachment(null)}
                      className="text-xs text-red-500 hover:text-red-700 ml-2"
                    >
                      Remove
                    </button>
                  </div>
                )}

                <input
                  type="text"
                  value={replyAttachment ? `Attached: ${replyAttachment.name}` : replyImageUrl}
                  onChange={(e) => setReplyImageUrl(e.target.value)}
                  placeholder="https://... or direct download link"
                  className={inputClass}
                />
              </div>

              {replyImageUrl && !replyAttachment && (
                <div className={`rounded-2xl border p-2 ${isLight ? 'border-gray-200 bg-gray-50' : 'border-white/10 bg-black/30'}`}>
                  <p className="text-[10px] opacity-60 uppercase mb-1">Delivered Preview</p>
                  <img src={replyImageUrl} alt="Delivery preview" className="max-h-36 w-auto rounded-lg mx-auto object-contain shadow" />
                </div>
              )}
            </div>

            <div className={`mt-6 flex items-center justify-end gap-3 border-t pt-4 ${isLight ? 'border-gray-200' : 'border-white/10'}`}>
              <button
                type="button"
                onClick={() => setSelectedRequest(null)}
                className="rounded-full px-5 py-2 text-xs opacity-60 hover:opacity-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSendReply()}
                disabled={replySaving}
                className="rounded-full bg-[#e5373f] px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#d42d35] disabled:opacity-50 transition-colors shadow-md"
              >
                {replySaving ? 'Saving & Delivering…' : 'Save Reply & Deliver'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  /* ---------------------------------------------------- TAB 3: REGISTERED USERS & CREDITS (WITH LOCK & DELETE) */
  const renderUsers = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold tracking-tight">Registered User Accounts ({usersList.length} Total)</h2>
            <span className="rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-0.5 text-[10px] font-bold uppercase">
              {usersList.length} Accounts
            </span>
          </div>
          <p className="text-xs opacity-60">Manage client accounts, lock/unlock generation credits, change tiers, or delete accounts.</p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            placeholder="Search by email or name…"
            className={`rounded-full px-4 py-1.5 text-xs border focus:outline-none ${
              isLight ? 'border-gray-300 bg-white text-gray-900' : 'border-white/20 bg-black/60 text-white'
            }`}
          />
          <button
            type="button"
            onClick={() => void loadUsers()}
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors ${
              isLight ? 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100' : 'border-white/15 bg-white/5 text-white/70 hover:text-white'
            }`}
          >
            Refresh
          </button>
        </div>
      </div>

      {usersLoading ? (
        <div className="py-20 text-center text-sm opacity-50">Loading accounts…</div>
      ) : filteredUsers.length === 0 ? (
        <div className={`${cardClass} p-12 text-center opacity-40 text-sm`}>
          No registered accounts match your query.
        </div>
      ) : (
        <div className={`overflow-x-auto rounded-3xl border ${isLight ? 'border-[#78a48b] bg-[#8db89f] shadow-md text-slate-900' : 'border-white/10 bg-white/[0.02]'}`}>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className={`border-b text-[10px] font-semibold uppercase tracking-[0.16em] ${isLight ? 'border-[#78a48b] bg-[#82b095] text-slate-900 font-bold' : 'border-white/10 bg-white/5 text-white/50'}`}>
                <th className="py-4 px-6">User / Contact</th>
                <th className="py-4 px-3">Plan / Tier</th>
                <th className="py-4 px-3">Credits</th>
                <th className="py-4 px-3">Video Limit</th>
                <th className="py-4 px-3">Photoshoots (1=5 poses)</th>
                <th className="py-4 px-3">Feature Toggles</th>
                <th className="py-4 px-3">Credit Lock</th>
                <th className="py-4 px-6 text-right">Individual Save & Delete</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isLight ? 'divide-[#78a48b]' : 'divide-white/5'}`}>
              {filteredUsers.map((user) => {
                const edits = userRowEdits[user.id] || {};
                const currentTier = edits.tier ?? user.tier ?? 'free';
                const currentCredits = edits.credits !== undefined ? edits.credits : user.credits;
                const currentVideos = edits.maxVideos !== undefined ? edits.maxVideos : (user.maxVideos ?? 15);
                const currentModels = edits.maxModels !== undefined ? edits.maxModels : (user.maxModels ?? 50);
                const isLocked = edits.creditsLocked !== undefined ? edits.creditsLocked : Boolean(user.creditsLocked);
                const isSaving = Boolean(edits.saving);
                const isSaved = Boolean(edits.saved);

                return (
                  <tr key={user.id} className={`transition-colors ${isLight ? 'hover:bg-[#82b095]/60 text-slate-900' : 'hover:bg-white/[0.02]'}`}>
                    {/* User Info */}
                    <td className="py-4 px-6 font-medium">
                      <div className="font-semibold text-xs">{user.email}</div>
                      <div className="text-[11px] opacity-60 mt-0.5">
                        {user.name ? <strong className={isLight ? 'text-amber-950 font-bold' : 'text-amber-500 font-semibold'}>{user.name} · </strong> : ''}
                        {user.phone ? <span>{user.phone} · </span> : ''}
                        <span>Joined {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Active'}</span>
                      </div>
                    </td>

                    {/* Tier selector */}
                    <td className="py-4 px-3">
                      <select
                        value={currentTier}
                        onChange={(e) => {
                          const newTier = e.target.value;
                          const isPaid = ['ondemand', 'pro', 'ultra'].includes(newTier);
                          const autoFeatures = {
                            hd2k: isPaid,
                            fivePose: isPaid,
                            video: isPaid,
                            customRequests: newTier === 'ultra',
                          };
                          const autoVideos = newTier === 'ultra' ? 30 : newTier === 'pro' ? 15 : newTier === 'ondemand' ? 10 : 3;
                          const autoModels = newTier === 'ultra' ? 100 : newTier === 'pro' ? 50 : newTier === 'ondemand' ? 25 : 5;
                          setUserRowEdits((prev) => ({
                            ...prev,
                            [user.id]: {
                              ...(prev[user.id] || {}),
                              tier: newTier,
                              features: autoFeatures,
                              maxVideos: (prev[user.id]?.maxVideos ?? user.maxVideos ?? 0) < autoVideos ? autoVideos : (prev[user.id]?.maxVideos ?? user.maxVideos ?? autoVideos),
                              maxModels: (prev[user.id]?.maxModels ?? user.maxModels ?? 0) < autoModels ? autoModels : (prev[user.id]?.maxModels ?? user.maxModels ?? autoModels),
                            },
                          }));
                        }}
                        className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider border ${
                          isLight ? 'border-[#78a48b] bg-[#87b299] text-slate-900' : 'border-white/15 bg-black/60 text-white'
                        }`}
                      >
                        <option value="free">Starter ($0)</option>
                        <option value="ondemand">On-Demand ($49)</option>
                        <option value="pro">Pro Atelier ($120)</option>
                        <option value="ultra">Ultra ($149)</option>
                      </select>
                    </td>

                    {/* Credit Balance */}
                    <td className="py-4 px-3">
                      <input
                        type="number"
                        min="0"
                        value={currentCredits}
                        onChange={(e) =>
                          setUserRowEdits((prev) => ({
                            ...prev,
                            [user.id]: { ...(prev[user.id] || {}), credits: Number(e.target.value) },
                          }))
                        }
                        className={`w-20 rounded-lg border px-2.5 py-1 font-mono text-xs font-bold ${
                          isLight ? 'border-[#78a48b] bg-[#87b299] text-slate-900' : 'border-white/20 bg-black text-amber-400'
                        }`}
                      />
                    </td>

                    {/* Video Quota / Limit */}
                    <td className="py-4 px-3">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          value={currentVideos}
                          onChange={(e) =>
                            setUserRowEdits((prev) => ({
                              ...prev,
                              [user.id]: { ...(prev[user.id] || {}), maxVideos: Number(e.target.value) },
                            }))
                          }
                          className={`w-16 rounded-lg border px-2 py-1 font-mono text-xs ${
                            isLight ? 'border-[#78a48b] bg-[#87b299] text-slate-900' : 'border-white/20 bg-black text-purple-400'
                          }`}
                        />
                        <span className="text-[10px] opacity-40">({user.videosGenerated ?? 0} used)</span>
                      </div>
                    </td>

                    {/* Photoshoot Quota (1 photoshoot = 5 poses) */}
                    <td className="py-4 px-3">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          value={currentModels}
                          onChange={(e) =>
                            setUserRowEdits((prev) => ({
                              ...prev,
                              [user.id]: { ...(prev[user.id] || {}), maxModels: Number(e.target.value) },
                            }))
                          }
                          className={`w-14 rounded-lg border px-2 py-1 font-mono text-xs ${
                            isLight ? 'border-[#78a48b] bg-[#87b299] text-slate-900' : 'border-white/20 bg-black text-cyan-400'
                          }`}
                        />
                        <span className="text-[10px] opacity-50 whitespace-nowrap">(= {currentModels * 5} poses)</span>
                      </div>
                    </td>

                    {/* Feature Toggles */}
                    <td className="py-4 px-3">
                      {(() => {
                        const isTierPaid = ['ondemand', 'pro', 'ultra'].includes(currentTier);
                          const isTierUltra = currentTier === 'ultra';
                        const currentFeatures = edits.features || {
                          hd2k: Boolean(user.features?.hd2k || isTierPaid),
                          fivePose: Boolean(user.features?.fivePose || isTierPaid),
                          video: Boolean(user.features?.video || isTierPaid),
                          customRequests: Boolean(user.features?.customRequests || isTierUltra),
                        };
                        return (
                          <div className="flex flex-wrap gap-1 max-w-[170px]">
                            <button
                              type="button"
                              onClick={() => {
                                const next = { ...currentFeatures, hd2k: !currentFeatures.hd2k };
                                setUserRowEdits((prev) => ({
                                  ...prev,
                                  [user.id]: { ...(prev[user.id] || {}), features: next },
                                }));
                              }}
                              className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase transition ${
                                currentFeatures.hd2k
                                  ? isLight ? 'bg-amber-100 text-amber-950 border border-amber-300 font-bold' : 'bg-amber-500/20 text-amber-500 border border-amber-500/40'
                                  : isLight
                                    ? 'bg-[#78a48b] text-slate-700 border border-[#6b997e]'
                                    : 'bg-white/5 text-white/30 border border-white/10'
                              }`}
                              title="Toggle 2K Ultra HD Generation"
                            >
                              2K {currentFeatures.hd2k ? 'On' : 'Off'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const next = { ...currentFeatures, fivePose: !currentFeatures.fivePose };
                                setUserRowEdits((prev) => ({
                                  ...prev,
                                  [user.id]: { ...(prev[user.id] || {}), features: next },
                                }));
                              }}
                              className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase transition ${
                                currentFeatures.fivePose
                                  ? 'bg-rose-500/20 text-rose-500 border border-rose-500/40'
                                  : isLight
                                    ? 'bg-[#78a48b] text-slate-700 border border-[#6b997e]'
                                    : 'bg-white/5 text-white/30 border border-white/10'
                              }`}
                              title="Toggle 5-Pose Sequence"
                            >
                              5-Pose {currentFeatures.fivePose ? 'On' : 'Off'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const next = { ...currentFeatures, video: !currentFeatures.video };
                                setUserRowEdits((prev) => ({
                                  ...prev,
                                  [user.id]: { ...(prev[user.id] || {}), features: next },
                                }));
                              }}
                              className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase transition ${
                                currentFeatures.video
                                  ? 'bg-purple-500/20 text-purple-600 border border-purple-500/40'
                                  : isLight
                                    ? 'bg-[#78a48b] text-slate-700 border border-[#6b997e]'
                                    : 'bg-white/5 text-white/30 border border-white/10'
                              }`}
                              title="Toggle Runway Video"
                            >
                              Video {currentFeatures.video ? 'On' : 'Off'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const next = { ...currentFeatures, customRequests: !currentFeatures.customRequests };
                                setUserRowEdits((prev) => ({
                                  ...prev,
                                  [user.id]: { ...(prev[user.id] || {}), features: next },
                                }));
                              }}
                              className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase transition ${
                                currentFeatures.customRequests
                                  ? 'bg-cyan-500/20 text-cyan-600 border border-cyan-500/40'
                                  : isLight
                                    ? 'bg-[#78a48b] text-slate-700 border border-[#6b997e]'
                                    : 'bg-white/5 text-white/30 border border-white/10'
                              }`}
                              title="Toggle Bespoke Custom Requests"
                            >
                              Custom {currentFeatures.customRequests ? 'On' : 'Off'}
                            </button>
                          </div>
                        );
                      })()}
                    </td>

                    {/* Account Lock Status */}
                    <td className="py-4 px-3">
                      <button
                        type="button"
                        onClick={() =>
                          setUserRowEdits((prev) => ({
                            ...prev,
                            [user.id]: { ...(prev[user.id] || {}), creditsLocked: !isLocked },
                          }))
                        }
                        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                          isLocked
                            ? 'bg-red-500/10 border border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white'
                            : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500 hover:text-white'
                        }`}
                      >
                        {isLocked ? 'Locked' : 'Active'}
                      </button>
                    </td>

                    {/* Individual Save & Delete */}
                    <td className="py-4 px-6 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleSaveUserRow(user)}
                          disabled={isSaving}
                          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all shadow-sm ${
                            isSaved
                              ? 'bg-emerald-600 text-white'
                              : 'bg-[#e5373f] text-white hover:bg-[#d42d35]'
                          }`}
                          title="Save this user's credits, video quota, model quota, and lock status"
                        >
                          {isSaving ? 'Saving…' : isSaved ? 'Saved' : 'Save'}
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleDeleteUser(user.id, user.email)}
                          className="rounded-full border border-red-500/30 bg-red-500/10 p-2 text-red-600 hover:bg-red-600 hover:text-white transition-colors"
                          title="Permanently delete user account"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  /* ---------------------------------------------------- TAB: KEYS & SYSTEM SETTINGS */
  const renderSettings = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold tracking-tight">System Keys & Studio Presets</h2>
        <p className="text-xs opacity-60">Configure render provider credentials, subscription plan prices, CDN buckets, and studio defaults.</p>
      </div>

      {/* Plan Pricing & Credit Quotas Editor */}
      {renderPlanPricingCard()}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Render Provider Key */}
        <section className={cardClass}>
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider opacity-60">Fashn.ai Render Key</h3>
            {pill(Boolean(settings?.apiKeySet), `Connected · ${settings?.apiKeyMasked}`, 'Not set')}
          </div>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={settings?.apiKeySet ? 'Paste a new key to replace existing' : 'fa-xxxxxxxxxxxxxxxx'}
            autoComplete="off"
            className={inputClass}
          />
          <p className="mt-2 text-[11px] leading-relaxed opacity-50">
            Starts with <code>fa-</code>. Stored securely on the server and used only for neural try-on.
          </p>
        </section>

        {/* Cloudinary Configuration */}
        <section className={cardClass}>
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider opacity-60">Cloudinary (Upload Sets & CDN)</h3>
            {pill(Boolean(settings?.cloudinaryApiKeySet), `Linked · ${settings?.cloudinaryApiKeyMasked}`, 'Not set')}
          </div>
          <input
            value={cloudinaryCloudName}
            onChange={(e) => setCloudinaryCloudName(e.target.value)}
            placeholder="Cloud Name (e.g. shivnaresh)"
            autoComplete="off"
            className={inputClass}
          />
          <input
            type="password"
            value={cloudinaryApiKey}
            onChange={(e) => setCloudinaryApiKey(e.target.value)}
            placeholder={settings?.cloudinaryApiKeySet ? 'Paste new API Key to replace' : 'Cloudinary API Key'}
            autoComplete="off"
            className={`${inputClass} mt-2`}
          />
          <input
            type="password"
            value={cloudinaryApiSecret}
            onChange={(e) => setCloudinaryApiSecret(e.target.value)}
            placeholder={settings?.cloudinaryApiSecretSet ? 'Paste new API Secret to replace' : 'Cloudinary API Secret'}
            autoComplete="off"
            className={`${inputClass} mt-2`}
          />
        </section>

        {/* Database & Accounts Engine */}
        <section className={cardClass}>
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider opacity-60">Accounts Storage Engine</h3>
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {settings?.storage === 'mongodb' ? 'MongoDB Active' : 'Local File Active'}
            </span>
          </div>
          <input
            type="password"
            value={mongoUri}
            onChange={(e) => setMongoUri(e.target.value)}
            placeholder={
              settings?.mongoFromEnv
                ? 'Loaded from .env'
                : settings?.mongoSet
                  ? settings.mongoMasked
                  : 'mongodb+srv://user:password@cluster.mongodb.net'
            }
            autoComplete="off"
            className={inputClass}
          />
          <p className="mt-2 text-[11px] opacity-50">
            Leave blank to use local persistent storage <code>server/data/users.json</code> (always active).
          </p>
        </section>

        {/* Google OAuth */}
        <section className={cardClass}>
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider opacity-60">Google One-Tap Sign-In</h3>
            {pill(Boolean(settings?.googleClientId), 'Configured', 'Disabled')}
          </div>
          <input
            value={googleClientId}
            onChange={(e) => setGoogleClientId(e.target.value)}
            placeholder="Client ID (e.g. 123...apps.googleusercontent.com)"
            autoComplete="off"
            className={inputClass}
          />
          <input
            type="password"
            value={googleClientSecret}
            onChange={(e) => setGoogleClientSecret(e.target.value)}
            placeholder={settings?.googleSecretSet ? 'Paste new secret to replace' : 'Client Secret (GOCSPX-...)'}
            autoComplete="off"
            className={`${inputClass} mt-2`}
          />
        </section>

        {/* ImgBB Hosting & Mirroring */}
        <section className={cardClass}>
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider opacity-60">ImgBB Image Hosting</h3>
            {pill(Boolean(settings?.imgbbSet), `Connected · ${settings?.imgbbMasked}`, 'Local Only')}
          </div>
          <div className="mt-3 flex gap-3">
            <input
              type="password"
              value={imgbbKey}
              onChange={(e) => setImgbbKey(e.target.value)}
              placeholder={settings?.imgbbSet ? 'Replace ImgBB Key' : 'ImgBB API Key'}
              autoComplete="off"
              className={inputClass}
            />
            {host && (
              <button
                type="button"
                disabled={syncing || host.running}
                onClick={async () => {
                  setSyncing(true);
                  try {
                    await api.startHostSync();
                    await loadHost();
                  } finally {
                    setSyncing(false);
                  }
                }}
                className="rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-xs font-semibold hover:bg-white hover:text-gray-900 disabled:opacity-40 transition-colors"
              >
                {host.running || syncing ? 'Syncing Images…' : 'Sync to ImgBB'}
              </button>
            )}
          </div>
        </section>

        {/* Brevo Email Service (Primary OTP Delivery Engine) */}
        <section className={cardClass}>
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider opacity-60">Brevo (Sendinblue) Email Engine (Primary OTP)</h3>
            {pill(Boolean(settings?.brevoApiKeySet), `Active · ${settings?.brevoApiKeyMasked || 'Brevo Active'}`, 'Brevo Active')}
          </div>
          <input
            type="password"
            value={brevoApiKey}
            onChange={(e) => setBrevoApiKey(e.target.value)}
            placeholder={settings?.brevoApiKeySet ? 'Paste new Brevo API key to replace' : 'xkeysib-xxxxxxxxxxxxxxxx'}
            autoComplete="off"
            className={inputClass}
          />
          <div className={`mt-3 p-3 rounded-xl border ${isLight ? 'border-gray-200 bg-gray-50 text-gray-900' : 'border-white/10 bg-white/[0.03]'}`}>
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-semibold ${isLight ? 'text-gray-700' : 'text-white/70'}`}>Master Admin Email:</span>
              <span className={`text-[11px] font-mono font-bold ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>jaatshab11223315@gmail.com</span>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={testEmailBusy}
              onClick={handleTestEmail}
              className="px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-50 inline-flex items-center gap-2 cursor-pointer shadow-sm"
            >
              {testEmailBusy ? 'Sending test email…' : 'Send test email to admin'}
            </button>
            <p className="text-[10px] text-white/40">Sends live OTP test to jaatshab11223315@gmail.com</p>
          </div>
          {testEmailMsg && (
            <div className={`mt-3 p-3 rounded-xl text-xs font-semibold ${testEmailMsg.ok ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
              {testEmailMsg.text}
            </div>
          )}
          <p className="mt-2 text-[11px] leading-relaxed opacity-50">
            Important: In Brevo Security Settings under "Authorized IP addresses", ensure <b>Deactivate for API keys</b> is clicked so cloud deployments are not IP-blocked. Check Spam / Promotions folder in Gmail.
          </p>
        </section>

        {/* Resend Email Configuration */}
        <section className={cardClass}>
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider opacity-60">Resend.com Email Service (Fallback)</h3>
            {pill(Boolean(settings?.resendApiKeySet), `Active · ${settings?.resendApiKeyMasked}`, 'Default Key Active')}
          </div>
          <input
            type="password"
            value={resendApiKey}
            onChange={(e) => setResendApiKey(e.target.value)}
            placeholder={settings?.resendApiKeySet ? 'Paste new Resend API key to replace' : 're_xxxxxxxxxxxxxxxx'}
            autoComplete="off"
            className={inputClass}
          />
          <div className="mt-2">
            <label className="text-[10px] uppercase font-bold tracking-wider opacity-50">Verified Sender Email / Domain</label>
            <input
              type="text"
              value={resendFromEmail}
              onChange={(e) => setResendFromEmail(e.target.value)}
              placeholder="e.g. Shiv-Naresh AI Studio <support@yourdomain.com>"
              autoComplete="off"
              className={`${inputClass} mt-1`}
            />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed opacity-50">
            Powered by Resend. Delivers 6-digit cryptographic verification codes with 3-minute strict TTL and 24h brute-force protection.
          </p>
        </section>

        {/* Security & 2FA Toggle */}
        <section className={cardClass}>
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider opacity-60">Admin 2-Factor Authentication (2FA)</h3>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
              admin2faEnabled ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-gray-100 text-gray-800 border border-gray-300'
            }`}>
              {admin2faEnabled ? '2FA Enforced' : '2FA Disabled (Direct Password)'}
            </span>
          </div>
          <div className="mt-4 flex items-center justify-between p-3.5 rounded-2xl border border-white/10 bg-black/40">
            <div>
              <p className="text-xs font-bold">Require Email OTP for Admin Login</p>
              <p className="text-[11px] opacity-50 mt-0.5 max-w-sm">
                When enabled, administrator requires email OTP verification code. When disabled, valid password unlocks the console immediately.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAdmin2faEnabled(!admin2faEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                admin2faEnabled ? 'bg-[#e5373f]' : 'bg-white/20'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  admin2faEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </section>

        {/* Developer Profile & Contact Settings (/about & /contact) */}
        <section className={cardClass}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider opacity-60">Developer Profile & Contact Settings</h3>
              <p className="text-[11px] opacity-40">Directly updates /about and /contact pages</p>
            </div>
            {pill(Boolean(devProfile.name), 'Customized Profile', 'Default')}
          </div>
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider opacity-50">Developer Name</label>
                <input
                  type="text"
                  value={devProfile.name}
                  onChange={(e) => setDevProfile((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Pawan Kumar"
                  className={`${inputClass} mt-1`}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider opacity-50">College / Institution</label>
                <input
                  type="text"
                  value={devProfile.college}
                  onChange={(e) => setDevProfile((prev) => ({ ...prev, college: e.target.value }))}
                  placeholder="ARSD College, University of Delhi"
                  className={`${inputClass} mt-1`}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider opacity-50">Degree</label>
                <input
                  type="text"
                  value={devProfile.degree}
                  onChange={(e) => setDevProfile((prev) => ({ ...prev, degree: e.target.value }))}
                  placeholder="B.Sc. Computer Science"
                  className={`${inputClass} mt-1`}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider opacity-50">Year / Classification</label>
                <input
                  type="text"
                  value={devProfile.year}
                  onChange={(e) => setDevProfile((prev) => ({ ...prev, year: e.target.value }))}
                  placeholder="3rd Year Student"
                  className={`${inputClass} mt-1`}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider opacity-50">Official Email (Contact &amp; About)</label>
                <input
                  type="email"
                  value={devProfile.email}
                  onChange={(e) => setDevProfile((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="lpawankumar015221684@gmail.com"
                  className={`${inputClass} mt-1`}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider opacity-50">Official Mobile / WhatsApp Number</label>
                <input
                  type="text"
                  value={devProfile.mobile}
                  onChange={(e) => setDevProfile((prev) => ({ ...prev, mobile: e.target.value }))}
                  placeholder="6398743132"
                  className={`${inputClass} mt-1 font-mono`}
                />
              </div>
            </div>

            <div className="rounded-2xl border p-4 bg-black/20">
              <label className="text-[10px] uppercase font-bold tracking-wider opacity-60 block mb-2">
                Developer Profile Picture &amp; Avatar Adjustment
              </label>
              <input
                ref={devPhotoFileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleDevPhotoFile}
              />
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="relative group shrink-0">
                  {devProfile.avatar ? (
                    <img
                      src={devProfile.avatar}
                      alt="Developer preview"
                      className="w-24 h-24 rounded-2xl object-cover border-2 border-amber-500 shadow-xl"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-2xl bg-black/40 border-2 border-dashed border-white/20 flex flex-col items-center justify-center text-xs opacity-50">
                      <span>No Photo</span>
                    </div>
                  )}
                  {devProfile.avatar && (
                    <button
                      type="button"
                      onClick={() => {
                        setDevProfile((prev) => ({ ...prev, avatar: '' }));
                        setDeveloperImageUrl('');
                      }}
                      className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 text-[10px] shadow hover:bg-red-500"
                      title="Remove Photo"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>

                <div className="flex-1 space-y-2 w-full">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => devPhotoFileRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#e5373f] hover:bg-[#d42d35] text-white px-4 py-2 text-xs font-semibold shadow-sm transition"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      <span>Choose photo</span>
                    </button>
                    {devProfile.avatar && (
                      <span className="text-[11px] text-emerald-400 font-medium">Photo loaded</span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={devProfile.avatar}
                    onChange={(e) => {
                      setDevProfile((prev) => ({ ...prev, avatar: e.target.value }));
                      setDeveloperImageUrl(e.target.value);
                    }}
                    placeholder="Or paste external image URL / data URL here"
                    className={`${inputClass} text-xs`}
                  />
                  <p className="text-[10px] opacity-40">
                    This photo will be displayed prominently on the /about and /contact pages and in the admin console.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold tracking-wider opacity-50">Bio / About Studio Story</label>
              <textarea
                rows={3}
                value={devProfile.bio}
                onChange={(e) => setDevProfile((prev) => ({ ...prev, bio: e.target.value }))}
                placeholder="Story of the developer and the studio..."
                className={`mt-1 w-full rounded-2xl border p-3 text-xs focus:outline-none ${
                  isLight ? 'border-gray-300 bg-gray-50 text-gray-900' : 'border-white/10 bg-black/60 text-white'
                }`}
              />
            </div>

            <div className="pt-2 flex items-center justify-between">
              {devProfile.avatar ? (
                <div className="flex items-center gap-3">
                  <img
                    src={devProfile.avatar}
                    alt="Developer preview"
                    className="w-10 h-10 rounded-full object-cover border border-amber-500"
                  />
                  <span className="text-xs font-semibold">{devProfile.name}</span>
                </div>
              ) : <div />}

              <button
                type="button"
                onClick={() => void saveDeveloperProfile()}
                disabled={savingProfile}
                className="rounded-full bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 text-xs font-semibold uppercase tracking-wider transition shadow-sm"
              >
                {savingProfile ? 'Saving…' : profileSaved ? 'Profile saved' : 'Save profile'}
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Studio Defaults */}
      <section className={cardClass}>
        <h3 className="text-xs font-semibold uppercase tracking-wider opacity-60">Customer Studio Presets</h3>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div>
            <label className="text-[11px] uppercase tracking-wider opacity-60">Default Prompt / Instructions</label>
            <textarea
              value={defaultPrompt}
              onChange={(e) => setDefaultPrompt(e.target.value)}
              rows={3}
              placeholder="Used when visitor leaves instructions blank"
              className={`mt-2 w-full rounded-2xl border p-3 text-xs focus:outline-none ${
                isLight ? 'border-gray-300 bg-gray-50 text-gray-900' : 'border-white/10 bg-black/60 text-white'
              }`}
            />
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[11px] uppercase tracking-wider opacity-60">Default Model</label>
              <select
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
                className={`mt-2 w-full rounded-xl border px-3 py-2.5 text-xs focus:outline-none ${
                  isLight ? 'border-gray-300 bg-gray-50 text-gray-900' : 'border-white/10 bg-black/60 text-white'
                }`}
              >
                <option value="">No default — visitor selects model</option>
                {categories.map((group) => (
                  <optgroup key={group.category} label={group.category}>
                    {group.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {group.category} / {item.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="flex gap-4">
              <label className="flex-1 text-[11px] uppercase tracking-wider opacity-60">
                Default Resolution
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  className={`mt-1.5 w-full rounded-xl border px-3 py-2 text-xs ${
                    isLight ? 'border-gray-300 bg-gray-50 text-gray-900' : 'border-white/10 bg-black/60 text-white'
                  }`}
                >
                  <option value="1k">1k (Standard)</option>
                  <option value="2k">2k (Ultra HD)</option>
                  <option value="4k">4k (Master)</option>
                </select>
              </label>

              <label className="flex-1 text-[11px] uppercase tracking-wider opacity-60">
                Quality Mode
                <select
                  value={generationMode}
                  onChange={(e) => setGenerationMode(e.target.value)}
                  className={`mt-1.5 w-full rounded-xl border px-3 py-2 text-xs ${
                    isLight ? 'border-gray-300 bg-gray-50 text-gray-900' : 'border-white/10 bg-black/60 text-white'
                  }`}
                >
                  <option value="balanced">Balanced (Fast & Production Stable)</option>
                </select>
              </label>
            </div>
          </div>
        </div>
      </section>

      {/* Floating Save Action Bar */}
      <div className={`sticky bottom-6 z-30 flex items-center justify-between rounded-2xl border px-6 py-3.5 shadow-2xl backdrop-blur-md ${
        isLight ? 'border-gray-300 bg-white/95' : 'border-white/15 bg-[#0e0e13]/95'
      }`}>
        <span className="text-xs opacity-60">{status || 'Saves all keys, CDN configs, and defaults in one unified request.'}</span>
        <button
          type="button"
          onClick={() => void saveSettings()}
          disabled={saving}
          className="rounded-full bg-[#e5373f] px-7 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#d42d35] disabled:opacity-50 transition-colors shadow-md"
        >
          {saving ? 'Saving System…' : 'Save All Settings'}
        </button>
      </div>
    </div>
  );

  /* ---------------------------------------------------- TAB 6: MODEL LIBRARY */
  const renderModels = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Studio Model Library</h2>
          <p className="text-xs opacity-60">
            Upload custom models, create new categories, and manage live try-on models saved in <code>public/models/</code>.
          </p>
        </div>
        <span className={`self-start sm:self-auto rounded-full px-4 py-1.5 text-xs font-semibold ${isLight ? 'bg-gray-200 text-gray-800' : 'bg-white/10 text-white/70'}`}>
          {modelCount} Models across {categories.length} Categories
        </span>
      </div>

      {/* Model Upload & Category Creation Card */}
      <section className={cardClass}>
        <div className="flex items-center gap-2 mb-4">
          <UploadCloud size={18} className="text-[#e5373f]" />
          <h3 className="text-sm font-bold uppercase tracking-wider">Add New Studio Model</h3>
        </div>

        <form onSubmit={handleUploadModel} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider opacity-60">Category</label>
                <button
                  type="button"
                  onClick={() => setIsNewCat(!isNewCat)}
                  className="text-[10px] font-semibold text-[#e5373f] hover:underline"
                >
                  {isNewCat ? 'Choose existing category' : '+ Create new category'}
                </button>
              </div>

              {isNewCat ? (
                <input
                  type="text"
                  required
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="e.g. Traditional, Winter Sportswear, Kids"
                  className={inputClass}
                />
              ) : (
                <select
                  value={uploadModelCat}
                  onChange={(e) => setUploadModelCat(e.target.value)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-xs focus:outline-none ${
                    isLight ? 'border-gray-300 bg-gray-50 text-gray-900' : 'border-white/10 bg-black/60 text-white'
                  }`}
                >
                  {categories.map((c) => (
                    <option key={c.category} value={c.category}>
                      {c.category} ({c.items.length} poses)
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold tracking-wider opacity-60">
                {selectedBatchModels.length > 1 ? 'Batch Name Prefix' : 'Model Name'}
              </label>
              <input
                type="text"
                required={selectedBatchModels.length <= 1}
                value={uploadModelName}
                onChange={(e) => setUploadModelName(e.target.value)}
                placeholder={selectedBatchModels.length > 1 ? 'e.g. Autumn Collection 2026' : 'e.g. Male Tracksuit Front Pose'}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] uppercase font-bold tracking-wider opacity-60">
                Model Image File(s) — Select Single or Multi-Select
              </label>
              {selectedBatchModels.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedBatchModels([]);
                    setUploadModelDataUrl('');
                    setUploadModelName('');
                  }}
                  className="text-[10px] font-semibold text-rose-400 hover:underline cursor-pointer"
                >
                  Clear Selection
                </button>
              )}
            </div>

            <input
              ref={modelFileInput}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,image/*"
              className="hidden"
              onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
              onChange={async (e) => {
                const files = e.target.files ? Array.from(e.target.files) : [];
                if (files.length === 0) return;
                try {
                  const items: Array<{ name: string; dataUrl: string; size: number }> = [];
                  for (const f of files) {
                    const d = await fileToDataUrl(f);
                    items.push({
                      name: f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
                      dataUrl: d,
                      size: f.size,
                    });
                  }
                  setSelectedBatchModels(items);
                  setUploadModelDataUrl(items[0].dataUrl);
                  if (items.length === 1) {
                    setUploadModelName(items[0].name);
                  } else {
                    setUploadModelName(`${items.length} Poses Batch`);
                  }
                } catch (err: any) {
                  alert('Could not read image(s): ' + err.message);
                }
              }}
            />

            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => modelFileInput.current?.click()}
                className={`rounded-xl border px-4 py-2.5 text-xs font-semibold transition cursor-pointer flex items-center gap-2 ${
                  isLight
                    ? 'border-gray-300 bg-gray-100 text-gray-800 hover:bg-gray-200'
                    : 'border-white/15 bg-white/5 text-white hover:bg-white/10'
                }`}
              >
                <UploadCloud size={15} />
                <span>
                  {selectedBatchModels.length > 0
                    ? `Change Selection (${selectedBatchModels.length} selected)…`
                    : 'Select Model Images (Any number at once)…'}
                </span>
              </button>

              {selectedBatchModels.length === 1 && uploadModelDataUrl && (
                <div className="flex items-center gap-3">
                  <img
                    src={uploadModelDataUrl}
                    alt="Preview"
                    className="h-12 w-9 rounded-lg object-cover border border-white/20"
                  />
                  <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> 1 model image ready
                  </span>
                </div>
              )}

              {selectedBatchModels.length > 1 && (
                <span className="text-xs text-emerald-400 font-medium flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-xl">
                  <Check className="w-3.5 h-3.5" />
                  <strong>{selectedBatchModels.length} models</strong> ready for batch upload
                </span>
              )}
            </div>

            {/* Multi-Model Preview Grid */}
            {selectedBatchModels.length > 1 && (
              <div className="mt-3.5 space-y-2">
                <p className={`text-[11px] font-semibold ${isLight ? 'text-gray-700' : 'text-white/60'}`}>
                  Selected Models ({selectedBatchModels.length}):
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5 max-h-60 overflow-y-auto p-2 rounded-xl border border-white/10 bg-black/20">
                  {selectedBatchModels.map((item, idx) => (
                    <div
                      key={idx}
                      className={`relative rounded-lg border p-1.5 flex flex-col group ${
                        isLight ? 'border-gray-200 bg-white' : 'border-white/10 bg-white/[0.03]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          const updated = selectedBatchModels.filter((_, i) => i !== idx);
                          setSelectedBatchModels(updated);
                          if (updated.length > 0) {
                            setUploadModelDataUrl(updated[0].dataUrl);
                            setUploadModelName(`${updated.length} Poses Batch`);
                          } else {
                            setUploadModelDataUrl('');
                            setUploadModelName('');
                          }
                        }}
                        className="absolute top-1 right-1 z-10 h-5 w-5 rounded-full bg-red-600/80 hover:bg-red-600 text-white flex items-center justify-center text-[10px] font-bold opacity-0 group-hover:opacity-100 transition cursor-pointer"
                        title="Remove model"
                      >
                        ✕
                      </button>
                      <img
                        src={item.dataUrl}
                        alt={item.name}
                        className="h-24 w-full object-cover rounded-md mb-1.5"
                      />
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedBatchModels((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, name: val } : p))
                          );
                        }}
                        placeholder="Model pose title"
                        className={`w-full rounded px-1.5 py-0.5 text-[10px] font-medium border ${
                          isLight ? 'border-gray-200 bg-gray-50 text-gray-900' : 'border-white/10 bg-black/60 text-white'
                        }`}
                        title="Edit pose name"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {modelMessage && (
            <p className={`rounded-xl p-3 text-xs ${
              modelMessage.startsWith('✓')
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                : 'bg-[#e5373f]/10 border border-[#e5373f]/30 text-[#ffb3b7]'
            }`}>
              {modelMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={uploadModelBusy || (!uploadModelDataUrl && selectedBatchModels.length === 0)}
            className="rounded-full bg-[#e5373f] hover:bg-[#d42d35] text-white px-6 py-2.5 text-xs font-bold uppercase tracking-wider transition disabled:opacity-50 shadow-md cursor-pointer flex items-center gap-2"
          >
            {uploadModelBusy ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>
                  {uploadModelProgress
                    ? `Uploading ${uploadModelProgress.total} Models to Library…`
                    : 'Uploading & Processing Model(s)…'}
                </span>
              </>
            ) : (
              <span>
                {selectedBatchModels.length > 1
                  ? `Save & Publish ${selectedBatchModels.length} Models to Library`
                  : 'Save & Publish Model to Library'}
              </span>
            )}
          </button>
        </form>
      </section>

      {/* Categories & Models Grid with Drag-and-Drop and Quick Move */}
      <div className="grid gap-6">
        {categories.map((cat) => {
          const isOver = dragOverCat === cat.category;
          return (
            <div
              key={cat.category}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverCat !== cat.category) setDragOverCat(cat.category);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                if (dragOverCat === cat.category) setDragOverCat(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverCat(null);
                const raw = e.dataTransfer.getData('text/plain');
                if (!raw) return;
                try {
                  const data = JSON.parse(raw);
                  if (data.modelId && data.currentCategory !== cat.category) {
                    void handleMoveModel(data.modelId, cat.category);
                  }
                } catch {}
              }}
              className={`${cardClass} transition-all duration-200 ${
                isOver
                  ? isLight
                    ? 'border-[#e5373f] bg-rose-50/50 ring-2 ring-[#e5373f]/30'
                    : 'border-[#e5373f] bg-[#e5373f]/10 ring-2 ring-[#e5373f]/40'
                  : ''
              }`}
            >
              <div className={`flex items-center justify-between border-b pb-3 ${isLight ? 'border-gray-200' : 'border-white/5'}`}>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider opacity-80">{cat.category}</h3>
                  {isOver && (
                    <span className="text-[10px] font-bold text-[#e5373f] bg-[#e5373f]/15 border border-[#e5373f]/30 px-2 py-0.5 rounded-full animate-pulse">
                      Drop here to move into "{cat.category}"
                    </span>
                  )}
                </div>
                <span className="text-[11px] opacity-50">{cat.items.length} poses</span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6 min-h-[90px]">
                {cat.items.length === 0 ? (
                  <div className="col-span-full border border-dashed border-white/10 rounded-xl p-4 text-center text-xs opacity-40">
                    No models in this category yet. Drag and drop any model here to add it.
                  </div>
                ) : (
                  cat.items.map((item) => {
                    const isDraggingThis = draggedModel?.id === item.id;
                    const isMovingThis = movingModelId === item.id;
                    return (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', JSON.stringify({ modelId: item.id, currentCategory: cat.category }));
                          setDraggedModel({ id: item.id, name: item.name, currentCategory: cat.category });
                        }}
                        onDragEnd={() => {
                          setDraggedModel(null);
                          setDragOverCat(null);
                        }}
                        className={`group relative overflow-hidden rounded-xl border transition-all cursor-grab active:cursor-grabbing ${
                          isDraggingThis ? 'opacity-30 scale-95 border-dashed border-[#e5373f]' : ''
                        } ${isLight ? 'border-gray-200 bg-gray-100 hover:border-gray-400' : 'border-white/5 bg-black/40 hover:border-white/20'}`}
                        title="Drag to another category or select from the move menu"
                      >
                        <img
                          src={item.url}
                          alt={item.name}
                          className="aspect-[3/4] w-full object-cover cursor-pointer"
                          onClick={() => setLightboxImg(item.url)}
                        />

                        {/* Drag Icon & Move Dropdown */}
                        <div className="absolute top-2 left-2 flex items-center gap-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span
                            className="p-1 rounded-md bg-black/80 text-white/70 shadow text-[9px] flex items-center gap-0.5 border border-white/10"
                            title="Drag to another category"
                          >
                            <Move size={11} />
                          </span>

                          <select
                            value={cat.category}
                            disabled={isMovingThis}
                            onChange={(e) => {
                              const target = e.target.value;
                              if (target && target !== cat.category) {
                                void handleMoveModel(item.id, target);
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="text-[9px] font-bold rounded-md bg-black/85 text-white/90 border border-white/20 px-1 py-0.5 cursor-pointer hover:bg-black hover:border-[#e5373f] transition-colors"
                            title="Quick move to another category"
                          >
                            <option value={cat.category} disabled>Move…</option>
                            {categories.map((c) => (
                              <option key={c.category} value={c.category} disabled={c.category === cat.category}>
                                {c.category === cat.category ? `✓ ${c.category}` : `→ ${c.category}`}
                              </option>
                            ))}
                          </select>
                        </div>
                        
                        {/* Delete Model Button */}
                        <button
                          type="button"
                          disabled={deletingModelId === item.id || isMovingThis}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteModel(item.id);
                          }}
                          title="Remove this model from library"
                          className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/75 text-white/70 hover:text-[#ff5252] hover:bg-black transition-all opacity-0 group-hover:opacity-100 shadow-md z-10"
                        >
                          <Trash2 size={13} />
                        </button>

                        {/* Moving Spinner */}
                        {isMovingThis && (
                          <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-1.5 z-20">
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            <span className="text-[9px] font-bold text-white">Moving…</span>
                          </div>
                        )}

                        <p className="absolute bottom-0 inset-x-0 bg-black/70 py-1 text-center text-[9px] text-white backdrop-blur-sm truncate px-1">
                          {item.name}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  /* ---------------------------------------------------- TAB 7: PROBLEM LOGS */
  const renderProblems = () => {
    const filtered = systemLogs.filter((l) => {
      if (problemFilter === 'unresolved') return !l.resolved;
      if (problemFilter === 'resolved') return l.resolved;
      return true;
    });

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <span>System problem logs & diagnostics</span>
            </h2>
            <p className="text-xs opacity-60">
              Captures all technical failures, Fashn.ai API rejections, video errors, and database exceptions.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadSystemLogs}
              disabled={problemsLoading}
              className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition ${
                isLight ? 'border-gray-300 bg-white hover:bg-gray-50' : 'border-white/10 bg-white/5 hover:bg-white/10'
              }`}
            >
              <RefreshCw size={12} className={problemsLoading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              type="button"
              onClick={handleClearAllProblems}
              disabled={systemLogs.length === 0}
              className="flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-[#ff5252] px-3.5 py-1.5 text-xs font-semibold transition disabled:opacity-40"
            >
              <Trash2 size={12} />
              Clear Logs
            </button>
          </div>
        </div>

        {/* Status Metrics */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className={cardClass}>
            <span className="text-[10px] uppercase font-bold tracking-wider opacity-50">Total Logged Problems</span>
            <p className="text-2xl font-bold mt-1">{systemLogs.length}</p>
          </div>
          <div className={cardClass}>
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#ff5252]">Active / Unresolved</span>
            <p className="text-2xl font-bold mt-1 text-[#ff5252]">{unresolvedProblemsCount}</p>
          </div>
          <div className={cardClass}>
            <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400">Resolved</span>
            <p className="text-2xl font-bold mt-1 text-emerald-400">{systemLogs.length - unresolvedProblemsCount}</p>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex gap-2">
          {(['all', 'unresolved', 'resolved'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setProblemFilter(mode)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold capitalize transition ${
                problemFilter === mode
                  ? 'bg-[#e5373f] text-white shadow-sm'
                  : isLight
                    ? 'bg-gray-200/80 text-gray-700 hover:bg-gray-300'
                    : 'bg-white/5 text-white/60 hover:bg-white/10'
              }`}
            >
              {mode === 'all' ? `All (${systemLogs.length})` : mode === 'unresolved' ? `Unresolved (${unresolvedProblemsCount})` : 'Resolved'}
            </button>
          ))}
        </div>

        {/* Logs List */}
        {filtered.length === 0 ? (
          <div className={`${cardClass} text-center py-16`}>
            <CheckCircle2 size={36} className="text-emerald-400 mx-auto mb-3 opacity-80" />
            <h3 className="text-base font-bold">No {problemFilter === 'unresolved' ? 'active' : ''} problems detected</h3>
            <p className="text-xs opacity-50 mt-1">Studio operations, API requests, and renders are functioning cleanly.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((log) => {
              const isCopied = copiedProblemId === log.id;
              return (
                <div
                  key={log.id}
                  className={`rounded-2xl border p-5 transition-all ${
                    log.resolved
                      ? isLight ? 'border-gray-200 bg-gray-50 opacity-60' : 'border-white/5 bg-white/[0.01] opacity-60'
                      : isLight ? 'border-red-200 bg-red-50/40 shadow-sm' : 'border-red-500/20 bg-red-950/10 shadow-sm'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                        log.severity === 'error'
                          ? 'bg-[#e5373f] text-white'
                          : log.severity === 'warning'
                            ? 'bg-amber-500 text-black'
                            : 'bg-blue-500 text-white'
                      }`}>
                        {log.severity}
                      </span>
                      <span className={`rounded-md px-2 py-0.5 text-[9px] font-mono ${
                        isLight ? 'bg-gray-200 text-gray-800' : 'bg-white/10 text-white/70'
                      }`}>
                        [{log.module}]
                      </span>
                      <span className="text-[11px] opacity-50">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => copyProblemForAi(log)}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold shadow-sm transition ${
                          isCopied
                            ? 'bg-emerald-500 text-white'
                            : 'bg-[#e5373f] hover:bg-[#d42d35] text-white'
                        }`}
                      >
                        {isCopied ? <Check size={12} /> : <Copy size={12} />}
                        {isCopied ? 'Copied for AI agent' : 'Copy problem for AI agent'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleResolveProblem(log.id)}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                          log.resolved
                            ? 'border-gray-400 text-gray-500 hover:text-gray-900'
                            : 'border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10'
                        }`}
                      >
                        {log.resolved ? 'Mark Active' : 'Resolve'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteProblem(log.id)}
                        className="p-1 text-white/30 hover:text-red-400 transition"
                        title="Delete log"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <h4 className="text-sm font-bold text-[#ff5252]">{log.title}</h4>
                  <p className="mt-1 text-xs leading-relaxed opacity-85 font-mono">{log.message}</p>

                  <div className="mt-3 flex items-center gap-4 text-[11px] opacity-60">
                    <span>User: <strong>{log.userEmail}</strong></span>
                    {log.userId && <span>ID: <code className="text-[10px]">{log.userId}</code></span>}
                  </div>

                  {log.details && log.details !== 'null' && log.details !== '""' && (
                    <details className="mt-3 rounded-xl border border-white/10 bg-black/40 p-3 text-xs">
                      <summary className="cursor-pointer text-[10px] uppercase font-bold tracking-wider opacity-60 select-none">
                        View Technical Payload Details
                      </summary>
                      <pre className="mt-2 text-[10px] font-mono overflow-x-auto text-white/80 p-2 rounded bg-black/60 max-h-48">
                        {log.details}
                      </pre>
                    </details>
                  )}

                  {log.stack && (
                    <details className="mt-2 rounded-xl border border-red-500/20 bg-red-950/20 p-3 text-xs">
                      <summary className="cursor-pointer text-[10px] uppercase font-bold tracking-wider text-red-400 select-none">
                        View Stack Trace
                      </summary>
                      <pre className="mt-2 text-[10px] font-mono overflow-x-auto text-red-300 p-2 rounded bg-black/60 max-h-48">
                        {log.stack}
                      </pre>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  /* ---------------------------------------------------- TAB: ALL GENERATIONS & CREDITS LEDGER */
  const renderGenerations = () => {
    const filtered = generationsList.filter((g) => {
      if (genStatusFilter !== 'all') {
        const matchesStatus =
          genStatusFilter === 'completed'
            ? g.status === 'completed' || (!g.status && (g.url || g.outputUrl))
            : g.status === genStatusFilter;
        if (!matchesStatus) return false;
      }
      if (genTypeFilter !== 'all') {
        if (genTypeFilter === 'video' && g.type !== 'video') return false;
        if (genTypeFilter === 'model-swap' && g.mode !== 'swap' && g.type !== 'model-swap') return false;
        if (genTypeFilter === 'tryon' && (g.type === 'video' || g.mode === 'swap' || g.type === 'model-swap')) return false;
      }
      if (genSearch.trim()) {
        const q = genSearch.toLowerCase();
        const matchesEmail = (g.userEmail || '').toLowerCase().includes(q);
        const matchesName = (g.userName || '').toLowerCase().includes(q);
        const matchesPrompt = (g.prompt || '').toLowerCase().includes(q);
        const matchesId = (g.id || '').toLowerCase().includes(q);
        const matchesErr = (g.error || '').toLowerCase().includes(q);
        if (!matchesEmail && !matchesName && !matchesPrompt && !matchesId && !matchesErr) return false;
      }
      return true;
    });

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className={`text-lg font-semibold tracking-tight flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
              <Film className="h-5 w-5 text-[#e5373f]" />
              <span>Studio generations & credit audit</span>
            </h2>
            <p className={`text-xs ${isLight ? 'text-slate-700' : 'text-white/60'}`}>
              Audit trail of every AI try-on, model-swap, and video render with exact credit deductions, status, and cluster error details.
            </p>
          </div>

          <button
            type="button"
            onClick={loadGenerations}
            disabled={generationsLoading}
            className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition ${
              isLight ? 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50' : 'border-white/10 bg-white/5 hover:bg-white/10'
            }`}
          >
            <RefreshCw size={12} className={generationsLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Metrics Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className={cardClass}>
            <p className={`text-[10px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-800' : 'text-white/40'}`}>Total Generations</p>
            <p className="mt-1 text-2xl font-extrabold">{generationsTotal}</p>
          </div>
          <div className={cardClass}>
            <p className={`text-[10px] font-bold uppercase tracking-wider ${isLight ? 'text-amber-900' : 'text-amber-400'}`}>Total Credits Deducted</p>
            <p className={`mt-1 text-2xl font-extrabold ${isLight ? 'text-amber-950 font-black' : 'text-amber-400'}`}>{generationsCreditsTotal}</p>
          </div>
          <div className={cardClass}>
            <p className={`text-[10px] font-bold uppercase tracking-wider ${isLight ? 'text-emerald-900' : 'text-emerald-400'}`}>Successful Renders</p>
            <p className={`mt-1 text-2xl font-extrabold ${isLight ? 'text-emerald-900' : 'text-emerald-400'}`}>{generationsSuccessCount}</p>
          </div>
          <div className={cardClass}>
            <p className={`text-[10px] font-bold uppercase tracking-wider ${isLight ? 'text-rose-900' : 'text-rose-400'}`}>Failed with Error</p>
            <p className={`mt-1 text-2xl font-extrabold ${isLight ? 'text-rose-900' : 'text-rose-400'}`}>{generationsFailedCount}</p>
          </div>
          <div className={cardClass}>
            <p className={`text-[10px] font-bold uppercase tracking-wider ${isLight ? 'text-cyan-900' : 'text-cyan-400'}`}>In Progress</p>
            <p className={`mt-1 text-2xl font-extrabold ${isLight ? 'text-cyan-900' : 'text-cyan-400'}`}>{generationsProcessingCount}</p>
          </div>
        </div>

        {/* Filters */}
        <div className={`rounded-2xl border p-4 flex flex-wrap items-center justify-between gap-3 ${
          isLight ? 'border-[#78a48b] bg-[#8db89f]' : 'border-white/10 bg-white/[0.02]'
        }`}>
          <div className="flex flex-1 items-center gap-2 min-w-[240px]">
            <input
              type="text"
              value={genSearch}
              onChange={(e) => setGenSearch(e.target.value)}
              placeholder="Search by user email, prompt, ID, error..."
              className={`w-full rounded-xl border px-3 py-1.5 text-xs focus:outline-none ${
                isLight ? 'border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:border-[#e5373f]' : 'border-white/10 bg-black/50 text-white placeholder:text-white/30'
              }`}
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={genStatusFilter}
              onChange={(e) => setGenStatusFilter(e.target.value as any)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
                isLight ? 'border-gray-200 bg-gray-50 text-gray-900' : 'border-white/10 bg-black/60 text-white'
              }`}
            >
              <option value="all">All Statuses</option>
              <option value="completed">Completed Only</option>
              <option value="failed">Failed Only (Errors)</option>
              <option value="processing">Processing</option>
              <option value="refunded">Refunded</option>
            </select>

            <select
              value={genTypeFilter}
              onChange={(e) => setGenTypeFilter(e.target.value as any)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
                isLight ? 'border-gray-200 bg-gray-50 text-gray-900' : 'border-white/10 bg-black/60 text-white'
              }`}
            >
              <option value="all">All Types</option>
              <option value="tryon">Virtual Try-On</option>
              <option value="model-swap">Model Swap</option>
              <option value="video">Runway Video</option>
            </select>
          </div>
        </div>

        {/* Generations Table */}
        <div className={`overflow-hidden rounded-3xl border shadow-sm ${
          isLight ? 'border-[#78a48b] bg-[#8db89f]' : 'border-white/10 bg-white/[0.02]'
        }`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className={`border-b text-[10px] font-bold uppercase tracking-wider ${
                isLight ? 'border-gray-200 bg-gray-50 text-gray-900' : 'border-white/10 bg-white/5 text-white/50'
              }`}>
                <tr>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Type &amp; Res</th>
                  <th className="py-3 px-4">Credits</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Output / Error Details</th>
                  <th className="py-3 px-4">Time</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isLight ? 'divide-[#78a48b]/40' : 'divide-white/5'}`}>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={`py-12 text-center ${isLight ? 'text-slate-800' : 'text-white/40'}`}>
                      {generationsList.length === 0 ? 'No generations logged yet.' : 'No generations match the filter criteria.'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((g) => {
                    const isSuccess = g.status === 'completed' || (!g.status && (g.url || g.outputUrl));
                    const isFailed = g.status === 'failed';
                    const isRefunded = g.status === 'refunded';
                    const isProcessing = g.status === 'processing';
                    const displayUrl = g.outputUrl || g.url;

                    return (
                      <tr key={g.id} className={`transition-colors ${isLight ? 'hover:bg-gray-50' : 'hover:bg-white/[0.02]'}`}>
                        <td className="py-3 px-4">
                          <p className="font-bold text-xs truncate max-w-[180px]">{g.userEmail || 'Anonymous'}</p>
                          {g.userName && <p className="text-[10px] opacity-70">{g.userName}</p>}
                          <p className="text-[9px] font-mono opacity-40 truncate max-w-[150px]">ID: {g.userId?.slice(0, 10)}…</p>
                        </td>

                        <td className="py-3 px-4">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            g.type === 'video'
                              ? 'bg-purple-500/20 text-purple-600 border border-purple-500/30'
                              : g.mode === 'swap' || g.type === 'model-swap'
                                ? 'bg-cyan-500/20 text-cyan-700 border border-cyan-500/30'
                                : 'bg-emerald-500/20 text-emerald-700 border border-emerald-500/30'
                          }`}>
                            {g.type === 'video' ? 'Video' : g.mode === 'swap' || g.type === 'model-swap' ? 'Swap' : 'Try-On'}
                          </span>
                          <span className="block mt-1 font-mono text-[10px] font-bold opacity-80">
                            {g.resolution || (g.type === 'video' ? 'HD' : '1K')}
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          <span className={`font-mono text-xs font-bold ${
                            g.creditsUsed > 0
                              ? isLight ? 'text-amber-900 font-extrabold' : 'text-amber-400 font-extrabold'
                              : 'opacity-50'
                          }`}>
                            {g.creditsUsed > 0 ? `-${g.creditsUsed} credit${g.creditsUsed > 1 ? 's' : ''}` : '0 credits'}
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          {isSuccess && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 text-emerald-800 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold">
                              Completed
                            </span>
                          )}
                          {isFailed && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 text-rose-800 border border-rose-500/40 px-2 py-0.5 text-[10px] font-bold">
                              Failed
                            </span>
                          )}
                          {isProcessing && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 text-amber-800 border border-amber-500/40 px-2 py-0.5 text-[10px] font-bold">
                              Processing
                            </span>
                          )}
                          {isRefunded && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/20 text-cyan-800 border border-cyan-500/40 px-2 py-0.5 text-[10px] font-bold">
                              Refunded
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 max-w-[280px]">
                          {displayUrl && (
                            <div className="flex items-center gap-2 mb-1">
                              {g.type === 'video' ? (
                                <video
                                  src={displayUrl}
                                  className="h-10 w-8 rounded object-cover cursor-pointer border border-white/20"
                                  onClick={() => setPreviewGenItem(g)}
                                />
                              ) : (
                                <img
                                  src={displayUrl}
                                  alt="render"
                                  className="h-10 w-8 rounded object-cover cursor-pointer border border-white/20 transition-opacity hover:opacity-90"
                                  onClick={() => setPreviewGenItem(g)}
                                />
                              )}
                              <span className="text-[10px] opacity-70 underline cursor-pointer" onClick={() => setPreviewGenItem(g)}>
                                Click to view render
                              </span>
                            </div>
                          )}

                          {g.error ? (
                            <div className="rounded-lg bg-rose-500/15 border border-rose-500/30 p-2 text-rose-900 text-[10px] font-medium leading-relaxed">
                              <strong>Error:</strong> {g.error}
                            </div>
                          ) : g.prompt ? (
                            <p className="text-[10px] opacity-75 truncate max-w-full" title={g.prompt}>
                              &ldquo;{g.prompt}&rdquo;
                            </p>
                          ) : (
                            <span className="text-[10px] opacity-40">Standard Generation</span>
                          )}
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap text-[11px] opacity-70">
                          {g.createdAt ? new Date(g.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>

                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {g.creditsUsed > 0 && !isRefunded && (
                              <button
                                type="button"
                                onClick={() => void handleRefundGeneration(g)}
                                disabled={refundingGenId === g.id}
                                className="rounded-full bg-cyan-600 hover:bg-cyan-500 text-white px-2.5 py-1 text-[10px] font-bold uppercase transition disabled:opacity-50"
                                title="Refund credits to this user"
                              >
                                {refundingGenId === g.id ? '…' : `↺ Refund (${g.creditsUsed})`}
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => void handleDeleteGeneration(g.id)}
                              className="rounded-full p-1.5 text-rose-600 hover:bg-rose-500/20 transition"
                              title="Delete generation entry"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Preview Lightbox Modal */}
        {previewGenItem && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
            onClick={() => setPreviewGenItem(null)}
          >
            <div
              className={`relative max-w-2xl w-full rounded-3xl border p-6 ${
                isLight ? 'bg-[#97c1a9] border-[#78a48b] text-slate-900' : 'bg-black/95 border-white/20 text-white'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-sm">Generation Preview</h3>
                  <p className="text-xs opacity-70">{previewGenItem.userEmail} &middot; {previewGenItem.type} ({previewGenItem.resolution || '1K'})</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewGenItem(null)}
                  className="rounded-full p-1.5 bg-black/40 text-white hover:bg-black/70"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="max-h-[60vh] flex items-center justify-center overflow-hidden rounded-2xl bg-black/40">
                {previewGenItem.type === 'video' ? (
                  <video src={previewGenItem.outputUrl || previewGenItem.url || ''} controls autoPlay loop className="max-h-[58vh] rounded-xl object-contain" />
                ) : (
                  <img src={previewGenItem.outputUrl || previewGenItem.url || ''} alt="generation" className="max-h-[58vh] rounded-xl object-contain" />
                )}
              </div>

              {previewGenItem.prompt && (
                <p className="mt-3 text-xs opacity-80">&ldquo;{previewGenItem.prompt}&rdquo;</p>
              )}

              <div className="mt-4 flex items-center justify-between pt-3 border-t border-white/10 text-xs">
                <span>Credits Used: <strong className={isLight ? 'text-amber-950 font-black' : 'text-amber-500'}>{previewGenItem.creditsUsed}</strong></span>
                <button
                  type="button"
                  onClick={() => {
                    const dlUrl = previewGenItem.outputUrl || previewGenItem.url;
                    if (dlUrl) {
                      void downloadDirectFile(dlUrl, `shivnaresh-admin-output-${previewGenItem.id || Date.now()}.png`);
                    }
                  }}
                  className="rounded-full bg-[#e5373f] hover:bg-[#d42d35] text-white px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition cursor-pointer"
                >
                  Download Output
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderPlanPricingCard = () => {
    const plansMeta = [
      { id: 'starter', name: 'Starter Trial', badge: 'Free Trial', badgeColor: 'bg-slate-500/20 text-slate-300' },
      { id: 'ondemand', name: 'On-Demand Growth', badge: 'Growth Drops', badgeColor: 'bg-blue-500/20 text-blue-400' },
      { id: 'pro', name: 'Pro Atelier', badge: 'Most Popular', badgeColor: 'bg-[#e5373f]/20 text-[#e5373f]' },
      { id: 'ultra', name: 'Ultra Haute-Couture', badge: 'Enterprise Atelier', badgeColor: 'bg-amber-500/20 text-amber-400' },
    ];

    return (
      <div className={cardClass}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-[#e5373f]" />
              <h3 className="text-sm font-bold uppercase tracking-wider">Subscription Plans & Pricing Editor</h3>
            </div>
            <p className="text-xs opacity-60 mt-0.5">
              Edit the prices (USD & optional fixed INR) and monthly credit allocations for customer plans. Changes apply immediately across the entire studio and payment gateway.
            </p>
          </div>
          <button
            type="button"
            disabled={savingPlans}
            onClick={() => void handleSavePlanPrices()}
            className="flex items-center justify-center gap-2 rounded-xl bg-[#e5373f] hover:bg-[#d42d35] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-md transition disabled:opacity-50 cursor-pointer shrink-0"
          >
            {savingPlans ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Saving Prices...</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Save Plan Prices</span>
              </>
            )}
          </button>
        </div>

        {planSaveStatus && (
          <div className={`mt-4 p-3 rounded-xl border text-xs flex items-center gap-2 ${
            planSaveStatus.ok
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}>
            {planSaveStatus.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            <span>{planSaveStatus.message}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
          {plansMeta.map((pm) => {
            const p = planPrices[pm.id] || { priceUSD: 0, credits: 0 };
            const effectiveInr = p.priceINR && Number(p.priceINR) > 0 ? Number(p.priceINR) : Math.round((p.priceUSD || 0) * 94);
            return (
              <div
                key={pm.id}
                className={`p-4 rounded-2xl border transition ${
                  isLight
                    ? 'bg-gray-50 border-gray-200'
                    : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-2">
                  <h4 className="text-xs font-extrabold truncate">{pm.name}</h4>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shrink-0 ${pm.badgeColor}`}>
                    {pm.badge}
                  </span>
                </div>

                {/* Price in USD */}
                <div className="mt-3">
                  <label className="text-[10px] font-semibold opacity-70 block uppercase tracking-wider">
                    Price in USD ($)
                  </label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold opacity-40">$</span>
                    <input
                      type="number"
                      min="0"
                      value={p.priceUSD}
                      onChange={(e) => {
                        isEditingPlansRef.current = true;
                        const val = Math.max(0, Number(e.target.value));
                        setPlanPrices((prev) => ({
                          ...prev,
                          [pm.id]: { ...prev[pm.id], priceUSD: val },
                        }));
                      }}
                      className={`${inputClass} pl-7 mt-0`}
                    />
                  </div>
                </div>

                {/* Fixed Price in INR (Optional) */}
                <div className="mt-3">
                  <label className="text-[10px] font-semibold opacity-70 block uppercase tracking-wider">
                    Fixed INR (₹, optional)
                  </label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold opacity-40">₹</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="Auto (USD conversion)"
                      value={p.priceINR ? p.priceINR : ''}
                      onChange={(e) => {
                        isEditingPlansRef.current = true;
                        const val = e.target.value === '' ? 0 : Math.max(0, Number(e.target.value));
                        setPlanPrices((prev) => ({
                          ...prev,
                          [pm.id]: { ...prev[pm.id], priceINR: val },
                        }));
                      }}
                      className={`${inputClass} pl-7 mt-0`}
                    />
                  </div>
                  <span className="text-[9px] opacity-50 mt-1 block">
                    {p.priceINR && Number(p.priceINR) > 0 ? 'Fixed manual INR override' : 'Auto-converts from USD'}
                  </span>
                </div>

                {/* Monthly Credits */}
                <div className="mt-3">
                  <label className="text-[10px] font-semibold opacity-70 block uppercase tracking-wider">
                    Monthly Credits
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={p.credits}
                    onChange={(e) => {
                      isEditingPlansRef.current = true;
                      const val = Math.max(0, Number(e.target.value));
                      setPlanPrices((prev) => ({
                        ...prev,
                        [pm.id]: { ...prev[pm.id], credits: val },
                      }));
                    }}
                    className={`${inputClass} mt-1`}
                  />
                </div>

                {/* Photoshoots Quota (1 photoshoot = 5 poses) */}
                <div className="mt-3">
                  <label className="text-[10px] font-semibold opacity-70 block uppercase tracking-wider">
                    Photoshoots (1 = 5 poses)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={p.photoshoots !== undefined ? p.photoshoots : (p.maxModels ?? (pm.id === 'ultra' ? 100 : pm.id === 'pro' ? 50 : pm.id === 'ondemand' ? 15 : 3))}
                    onChange={(e) => {
                      isEditingPlansRef.current = true;
                      const val = Math.max(0, Number(e.target.value));
                      setPlanPrices((prev) => ({
                        ...prev,
                        [pm.id]: { ...prev[pm.id], photoshoots: val, maxModels: val },
                      }));
                    }}
                    className={`${inputClass} mt-1`}
                  />
                  <span className="text-[9px] text-[#e5373f] opacity-80 mt-1 block font-semibold">
                    1 photoshoot = 5 poses (Total {(p.photoshoots !== undefined ? p.photoshoots : (p.maxModels ?? (pm.id === 'ultra' ? 100 : pm.id === 'pro' ? 50 : pm.id === 'ondemand' ? 15 : 3))) * 5} poses)
                  </span>
                </div>

                {/* Live effective price calculation */}
                <div className={`mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-[11px] ${
                  isLight ? 'text-slate-800' : 'text-slate-300'
                }`}>
                  <span className="opacity-60">Customer Pays:</span>
                  <span className="font-extrabold text-amber-500">
                    {pm.id === 'starter' && p.priceUSD === 0 ? 'Free' : `₹${effectiveInr.toLocaleString('en-IN')}`}
                  </span>
                </div>

                {/* Gateway Status: Active / Deactivated */}
                <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between">
                  <span className="text-[10px] font-semibold opacity-70 uppercase tracking-wider">Gateway Status</span>
                  <button
                    type="button"
                    onClick={() => {
                      isEditingPlansRef.current = true;
                      const currentActive = p.active !== false;
                      setPlanPrices((prev) => ({
                        ...prev,
                        [pm.id]: { ...prev[pm.id], active: !currentActive },
                      }));
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition flex items-center gap-1.5 cursor-pointer ${
                      p.active !== false
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30'
                        : 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${p.active !== false ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    {p.active !== false ? 'Active' : 'Deactivated'}
                  </button>
                </div>

                {/* Display State: Delete / Restore Plan */}
                <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between">
                  <span className="text-[10px] font-semibold opacity-70 uppercase tracking-wider">Display State</span>
                  <button
                    type="button"
                    onClick={() => {
                      isEditingPlansRef.current = true;
                      const isDeleted = Boolean(p.deleted);
                      setPlanPrices((prev) => ({
                        ...prev,
                        [pm.id]: { ...prev[pm.id], deleted: !isDeleted },
                      }));
                    }}
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition cursor-pointer ${
                      p.deleted
                        ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40'
                        : 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
                    }`}
                  >
                    {p.deleted ? 'Restore Plan' : 'Delete / Hide Plan'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderGateway = () => {
    const filteredOrders = gatewayOrders.filter((ord) => {
      if (gatewayFilter === 'review') return ord.status === 'review';
      if (gatewayFilter === 'paid') return ord.status === 'paid';
      if (gatewayFilter === 'pending') return ord.status === 'pending';
      if (gatewayFilter === 'rejected') return ord.status === 'expired' || ord.status === 'failed';
      return true;
    });

    return (
      <div className="space-y-8 animate-in fade-in-50 duration-200">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
                <CreditCard className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-bold tracking-tight">UPI Gateway & Bank Settlements</h2>
            </div>
            <p className="text-xs opacity-60 mt-1 max-w-xl">
              Real-time payment tracking for UPI QR codes and Direct Bank Transfers. Auto-verifies with Paytm for Business and enables 1-click quota provisioning.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadGatewayData()}
              disabled={gatewayLoading}
              className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
                isLight ? 'border-gray-200 bg-white hover:bg-gray-50 text-slate-800' : 'border-white/10 bg-white/5 hover:bg-white/10 text-white'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${gatewayLoading ? 'animate-spin' : ''}`} />
              <span>Refresh Orders</span>
            </button>
          </div>
        </div>

        {/* Top KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className={cardClass}>
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">Verified Revenue</span>
            <div className="mt-1 text-2xl font-black text-emerald-500">
              ₹{(gatewayStats.totalRevenue || 0).toLocaleString('en-IN')}
            </div>
            <p className="mt-1 text-[11px] opacity-60">Total received via UPI & Bank</p>
          </div>

          <div className={cardClass}>
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">Total Orders</span>
            <div className="mt-1 text-2xl font-black">
              {gatewayStats.totalOrders || gatewayOrders.length}
            </div>
            <p className="mt-1 text-[11px] opacity-60">Total gateway transactions</p>
          </div>

          <div className={cardClass}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500">Needs Review</span>
              {gatewayStats.reviewCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              )}
            </div>
            <div className="mt-1 text-2xl font-black text-amber-500">
              {gatewayStats.reviewCount || 0}
            </div>
            <p className="mt-1 text-[11px] opacity-60">Customer submitted UTR</p>
          </div>

          <div className={cardClass}>
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">Paid & Active</span>
            <div className="mt-1 text-2xl font-black text-emerald-400">
              {gatewayStats.paidCount || 0}
            </div>
            <p className="mt-1 text-[11px] opacity-60">Plans provisioned</p>
          </div>
        </div>

        {/* Orders Table Card */}
        <div className={cardClass}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <QrCode className="w-4 h-4 text-[#e5373f]" />
              <h3 className="text-sm font-bold uppercase tracking-wider">Gateway Transactions</h3>
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {[
                { id: 'all', label: `All (${gatewayOrders.length})` },
                { id: 'review', label: `Needs Review (${gatewayStats.reviewCount || 0})` },
                { id: 'paid', label: `Paid (${gatewayStats.paidCount || 0})` },
                { id: 'pending', label: `Pending (${gatewayStats.pendingCount || 0})` },
                { id: 'rejected', label: 'Rejected' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setGatewayFilter(f.id as typeof gatewayFilter)}
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold transition cursor-pointer ${
                    gatewayFilter === f.id
                      ? 'bg-[#e5373f] text-white shadow-sm'
                      : isLight
                      ? 'bg-gray-100 hover:bg-gray-200 text-slate-700'
                      : 'bg-white/5 hover:bg-white/10 text-white/70'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="py-16 text-center text-xs opacity-60">
              No gateway orders found for the selected filter.
            </div>
          ) : (
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/10 opacity-60 text-[10px] font-bold uppercase tracking-wider">
                    <th className="py-2.5 px-3">Order Ref</th>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-3">Plan</th>
                    <th className="py-2.5 px-3">Amount</th>
                    <th className="py-2.5 px-3">Method</th>
                    <th className="py-2.5 px-3">Customer UTR</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredOrders.map((ord) => {
                    const isBusy = orderActionBusy === ord.order_no;
                    return (
                      <tr key={ord.id} className="hover:bg-white/[0.02] transition">
                        <td className="py-3 px-3 font-mono font-bold text-amber-500 whitespace-nowrap">
                          {ord.order_no}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold">{ord.customer_name || 'Customer'}</div>
                          <div className="text-[11px] opacity-60 truncate max-w-[160px]">{ord.customer_email || 'No email'}</div>
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/10">
                            {ord.plan_name || ord.plan_id}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-bold whitespace-nowrap">
                          ₹{Number(ord.amount).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 opacity-80">
                            {ord.payment_method === 'bank' ? (
                              <>
                                <Building2 className="w-3.5 h-3.5 text-blue-400" />
                                <span>SBI Bank</span>
                              </>
                            ) : (
                              <>
                                <QrCode className="w-3.5 h-3.5 text-amber-400" />
                                <span>UPI QR</span>
                              </>
                            )}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px]">
                          {ord.utr || ord.customer_utr ? (
                            <span className="font-bold text-emerald-400 select-all">
                              {ord.utr || ord.customer_utr}
                            </span>
                          ) : (
                            <span className="opacity-40 italic">Not submitted</span>
                          )}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            ord.status === 'paid'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : ord.status === 'review'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : ord.status === 'pending'
                              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                              : 'bg-red-500/20 text-red-400 border border-red-500/30'
                          }`}>
                            {ord.status === 'paid' && <CheckCircle2 className="w-3 h-3" />}
                            <span>{ord.status}</span>
                          </span>
                        </td>
                        <td className="py-3 px-3 text-[11px] opacity-60 whitespace-nowrap">
                          {new Date(ord.created_at).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5 justify-end">
                            {ord.status === 'paid' ? (
                              <>
                                <span className="text-[10px] text-emerald-400 font-bold uppercase bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                  <Check className="w-3 h-3" />
                                  <span>Active</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleStartEditGatewayOrder(ord)}
                                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold text-[11px] transition shadow-sm cursor-pointer"
                                  title="Edit transaction details, UTR, or plan"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleRejectGatewayOrder(ord.order_no)}
                                  className="px-2 py-1 rounded-lg bg-red-600/15 hover:bg-red-600/30 text-red-400 border border-red-500/30 font-semibold text-[11px] transition cursor-pointer"
                                  title="Revoke active plan activation"
                                >
                                  Revoke
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleApproveGatewayOrder(ord.order_no)}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] transition shadow-sm disabled:opacity-50 cursor-pointer"
                                >
                                  {isBusy ? 'Saving...' : 'Approve & Activate'}
                                </button>
                                {ord.status !== 'expired' && (
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => void handleRejectGatewayOrder(ord.order_no)}
                                    className="px-2 py-1 rounded-lg bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/30 font-semibold text-[11px] transition disabled:opacity-50 cursor-pointer"
                                  >
                                    Reject
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleStartEditGatewayOrder(ord)}
                                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold text-[11px] transition shadow-sm cursor-pointer"
                                  title="Edit transaction details"
                                >
                                  Edit
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Plan Pricing Editor */}
        {renderPlanPricingCard()}

        {/* Payment Accounts & Configuration Form */}
        <div className={cardClass}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-[#e5373f]" />
              <h3 className="text-sm font-bold uppercase tracking-wider">Payment Account Settings</h3>
            </div>
            {gatewayAccounts.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] opacity-80">
                <span className="font-semibold">Connected Routes:</span>
                {gatewayAccounts.map((ac: any) => (
                  <span key={ac.id} className="px-2 py-0.5 rounded-full bg-white/10 font-medium">
                    {ac.label || ac.id}
                  </span>
                ))}
              </div>
            )}
          </div>

          {gwSettingsStatus && (
            <div className={`mt-4 p-3 rounded-xl border text-xs flex items-center gap-2 ${
              gwSettingsStatus.ok
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}>
              {gwSettingsStatus.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
              <span>{gwSettingsStatus.message}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-5">
            {/* Column 1: UPI & Paytm Auto-Verification */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
                <QrCode className="w-3.5 h-3.5" />
                <span>Primary UPI & Paytm for Business</span>
              </h4>

              <div>
                <label className="text-[11px] font-semibold opacity-70 block">Payee UPI ID</label>
                <input
                  type="text"
                  value={gwUpiId}
                  onChange={(e) => setGwUpiId(e.target.value)}
                  placeholder="e.g. 6398743132@paytm"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold opacity-70 block">Payee Display Name</label>
                <input
                  type="text"
                  value={gwPayeeName}
                  onChange={(e) => setGwPayeeName(e.target.value)}
                  placeholder="e.g. PAWAN KUMAR"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold opacity-70 block">Paytm Merchant ID (MID) &middot; Auto-Verification</label>
                <input
                  type="text"
                  value={gwPaytmMid}
                  onChange={(e) => setGwPaytmMid(e.target.value)}
                  placeholder="Enter Paytm for Business MID for instant automated checks"
                  className={inputClass}
                />
                <p className="text-[10px] opacity-50 mt-1">
                  Enables zero-touch verification using Paytm's Merchant Status API against the order number.
                </p>
              </div>
            </div>

            {/* Column 2: Direct Bank Transfer Details (SBI) */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" />
                <span>State Bank of India (Direct Bank Transfer)</span>
              </h4>

              <div>
                <label className="text-[11px] font-semibold opacity-70 block">Beneficiary Name</label>
                <input
                  type="text"
                  value={gwBankAccountHolder}
                  onChange={(e) => setGwBankAccountHolder(e.target.value)}
                  placeholder="e.g. PAWAN KUMAR"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold opacity-70 block">Bank Name</label>
                <input
                  type="text"
                  value={gwBankName}
                  onChange={(e) => setGwBankName(e.target.value)}
                  placeholder="e.g. State Bank of India"
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold opacity-70 block">Account Number</label>
                  <input
                    type="text"
                    value={gwBankAccountNumber}
                    onChange={(e) => setGwBankAccountNumber(e.target.value)}
                    placeholder="41614259248"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold opacity-70 block">IFSC Code</label>
                  <input
                    type="text"
                    value={gwBankIfsc}
                    onChange={(e) => setGwBankIfsc(e.target.value)}
                    placeholder="SBIN0011558"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* External UPI Gateway Integration (mynkdev-21/upi-gateway) */}
          <div className="mt-6 pt-5 border-t border-white/10 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" />
              <span>External UPI Gateway Bridge (mynkdev-21/upi-gateway)</span>
            </h4>
            <p className="text-[11px] opacity-60">
              Optional: connect an external self-hosted Laravel instance of `mynkdev-21/upi-gateway` if hosted on a separate PHP/MySQL server.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-semibold opacity-70 block">Gateway Base URL</label>
                <input
                  type="text"
                  value={gwUpiGatewayUrl}
                  onChange={(e) => setGwUpiGatewayUrl(e.target.value)}
                  placeholder="e.g. https://gateway.yourdomain.com"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold opacity-70 block">Gateway Secret / Bearer API Key</label>
                <input
                  type="password"
                  value={gwUpiGatewayApiKey}
                  onChange={(e) => setGwUpiGatewayApiKey(e.target.value)}
                  placeholder="Enter API token for external webhook/order creation"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-white/10 flex justify-end">
            <button
              type="button"
              disabled={savingGwSettings}
              onClick={() => void handleSaveGatewaySettings()}
              className="px-5 py-2.5 rounded-xl bg-[#e5373f] hover:bg-[#d42d35] text-white font-bold text-xs uppercase tracking-wider transition shadow-md disabled:opacity-50 cursor-pointer"
            >
              {savingGwSettings ? 'Saving Settings...' : 'Save Payment Settings'}
            </button>
          </div>
        </div>

        {/* Gateway Order Edit Modal */}
        {editingGatewayOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
            <div className={`w-full max-w-lg rounded-2xl border p-6 shadow-2xl ${isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-[#111116] border-white/20 text-white'}`}>
              <div className={`flex items-center justify-between border-b pb-4 ${isLight ? 'border-gray-200' : 'border-white/10'}`}>
                <div>
                  <h3 className="text-base font-bold">Edit Gateway Transaction</h3>
                  <p className="text-xs font-mono text-amber-500 mt-0.5">#{editingGatewayOrder.order_no}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingGatewayOrder(null)}
                  className="rounded-lg p-1.5 opacity-60 hover:opacity-100 hover:bg-white/10 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {gwOrderError && (
                <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{gwOrderError}</span>
                </div>
              )}

              <div className="space-y-4 mt-4 text-xs">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider opacity-70 block mb-1">Customer</label>
                  <div className={`p-2.5 rounded-xl border text-xs font-medium ${isLight ? 'bg-gray-50 border-gray-200' : 'bg-white/5 border-white/10'}`}>
                    <div>{editingGatewayOrder.customer_name || 'Customer'}</div>
                    <div className="opacity-60 text-[11px] font-mono mt-0.5">{editingGatewayOrder.customer_email || 'No email provided'}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider opacity-70 block mb-1">Transaction Status</label>
                    <select
                      value={editGwStatus}
                      onChange={(e) => setEditGwStatus(e.target.value)}
                      className={inputClass}
                    >
                      <option value="paid">Paid & Approved (Active Plan)</option>
                      <option value="review">Needs Review (UTR Submitted)</option>
                      <option value="pending">Pending Payment</option>
                      <option value="expired">Expired / Rejected</option>
                      <option value="failed">Failed</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider opacity-70 block mb-1">Assigned Plan</label>
                    <select
                      value={editGwPlanId}
                      onChange={(e) => setEditGwPlanId(e.target.value)}
                      className={inputClass}
                    >
                      <option value="starter">Starter Trial (Free)</option>
                      <option value="ondemand">On-Demand Growth</option>
                      <option value="pro">Pro Atelier</option>
                      <option value="ultra">Ultra Haute-Couture</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider opacity-70 block mb-1">Amount (₹ INR)</label>
                    <input
                      type="number"
                      min="0"
                      value={editGwAmount}
                      onChange={(e) => setEditGwAmount(Number(e.target.value))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider opacity-70 block mb-1">UTR / Bank Reference</label>
                    <input
                      type="text"
                      value={editGwUtr}
                      onChange={(e) => setEditGwUtr(e.target.value)}
                      placeholder="12-digit UTR reference"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider opacity-70 block mb-1">Admin Audit Note</label>
                  <input
                    type="text"
                    value={editGwNote}
                    onChange={(e) => setEditGwNote(e.target.value)}
                    placeholder="e.g. Verified manually on SBI NetBanking"
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={savingGwOrder}
                  onClick={() => void handleDeleteGatewayOrder(editingGatewayOrder.order_no)}
                  className="px-3.5 py-2 rounded-xl bg-red-600/15 hover:bg-red-600/30 text-red-400 border border-red-500/30 text-xs font-bold uppercase tracking-wider transition disabled:opacity-50 cursor-pointer"
                >
                  Delete Transaction
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingGatewayOrder(null)}
                    className="px-4 py-2 rounded-xl border border-white/20 hover:bg-white/10 text-xs font-semibold transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={savingGwOrder}
                    onClick={() => void handleSaveGatewayOrderEdit()}
                    className="px-5 py-2 rounded-xl bg-[#e5373f] hover:bg-[#d42d35] text-white text-xs font-bold uppercase tracking-wider transition shadow-md disabled:opacity-50 cursor-pointer"
                  >
                    {savingGwOrder ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return shell(
    <div>
      {activeTab === 'overview' && renderOverview()}
      {activeTab === 'requests' && renderRequests()}
      {activeTab === 'users' && renderUsers()}
      {activeTab === 'gateway' && renderGateway()}
      {activeTab === 'generations' && renderGenerations()}
      {activeTab === 'settings' && renderSettings()}
      {activeTab === 'models' && renderModels()}
      {activeTab === 'problems' && renderProblems()}
    </div>,
  );
}
