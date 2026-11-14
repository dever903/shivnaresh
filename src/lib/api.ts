export type ModelCategory = { category: string; items: { id: string; name: string; url: string }[] };

/** Everything the customer-facing studio is allowed to know. */
export type Studio = {
  ready: boolean;
  defaultPrompt: string;
  defaultModel: string;
  resolution: string;
  generationMode: string;
  defaultMode: string;
};

export type PlanConfig = {
  id: string;
  name: string;
  priceUSD: number;
  priceINR?: number;
  credits: number;
  tier?: string;
  maxVideos?: number;
  maxModels?: number;
  photoshoots?: number;
  photoshootsDone?: number;
  photoshootsLeft?: number;
  photoshootRule?: string;
  active?: boolean;
  deleted?: boolean;
};

/** Provider keys and account wiring — admin only. */
export type AdminSettings = {
  apiKeySet: boolean;
  apiKeyMasked: string;
  mongoSet: boolean;
  mongoMasked: string;
  mongoFromEnv: boolean;
  storage: 'mongodb' | 'local';
  googleClientId: string;
  googleSecretSet: boolean;
  imgbbSet: boolean;
  imgbbMasked: string;
  imgbbFromEnv: boolean;
  cloudinaryCloudName: string;
  cloudinaryApiKeySet: boolean;
  cloudinaryApiKeyMasked: string;
  cloudinaryApiSecretSet: boolean;
  resendApiKeySet?: boolean;
  resendApiKeyMasked?: string;
  resendFromEmail?: string;
  brevoApiKeySet?: boolean;
  brevoApiKeyMasked?: string;
  admin2faEnabled?: boolean;
  developerImageUrl?: string;
  defaultPrompt: string;
  defaultModel: string;
  resolution: string;
  generationMode: string;
  defaultMode: string;
  plans?: Record<string, PlanConfig>;
};

export type Job = {
  id: string;
  status: 'starting' | 'in_queue' | 'processing' | 'completed' | 'failed';
  output?: string[];
  error?: { name?: string; message?: string } | null;
};

export type Collection = { id: string; name: string; createdAt: number; items: { url: string; label?: string; at: number }[] };

export type UploadSet = {
  id: string;
  userId: string;
  userEmail: string;
  setNumber: number;
  clothUrl: string;
  clothName: string;
  modelUrl: string;
  modelName: string;
  prompt: string;
  createdAt: number;
};

export type PhotoshootOffer = {
  newQuota: number;
  oldQuota: number;
  note?: string;
  offeredAt: number;
  status: 'pending' | 'agreed' | 'queried';
  userQuery?: string;
  agreedAt?: number;
  queriedAt?: number;
};

export type User = {
  id: string;
  email: string;
  name: string;
  phone?: string;
  avatar?: string;
  provider: string;
  /** false for Google-only accounts until they set one */
  hasPassword: boolean;
  createdAt: string | null;
  credits: number;
  creditsLocked?: boolean;
  tier?: string;
  maxVideos?: number;
  videosGenerated?: number;
  photoshoots?: number;
  photoshootsDone?: number;
  photoshootsLeft?: number;
  maxModels?: number;
  modelsGenerated?: number;
  photoshootOffer?: PhotoshootOffer | null;
  features?: {
    hd2k?: boolean;
    fivePose?: boolean;
    video?: boolean;
    customRequests?: boolean;
  };
};

export type CustomRequest = {
  id: string;
  userId: string;
  userEmail: string;
  clothUrl: string;
  clothName?: string;
  modelUrl: string;
  modelName?: string;
  modelImages?: string[];
  color?: string;
  requestType?: string;
  prompt: string;
  status: 'queued' | 'in_progress' | 'delivered';
  createdAt: number;
  deadlineHours: number;
  readByAdmin?: boolean;
  adminReply?: string;
  deliveredImageUrl?: string;
  deliveredFileUrl?: string;
  deliveredFileName?: string;
  deliveredFileType?: string;
  deliveredFileSize?: number;
  deliveredAt?: number | null;
  deleted?: boolean;
  deletedAt?: number;
  deletedBy?: string;
};

export type AdminDelivery = {
  id: string;
  recipientUserId: string;
  recipientEmail: string;
  recipientName?: string;
  senderEmail: string;
  type: 'photo' | 'video' | 'zip' | 'folder' | 'text';
  title: string;
  textMessage?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  mediaUrls?: string[];
  readByUser?: boolean;
  deleted?: boolean;
  deletedAt?: number;
  deletedBy?: string;
  createdAt: number;
};

export type UserGeneration = {
  id: string;
  jobId?: string;
  userId: string;
  userEmail: string;
  type: 'image' | 'video';
  url: string;
  highResUrl: string;
  remoteUrl?: string;
  outputUrl?: string;
  prompt: string;
  color?: string;
  colorName?: string;
  resolution?: string;
  duration?: number;
  aspectRatio?: string;
  title: string;
  isManualUpload?: boolean;
  createdAt: number;
};

export type AdminGeneration = {
  id: string;
  jobId?: string;
  userId: string;
  userEmail: string;
  userName?: string;
  type: string;
  mode?: string;
  resolution?: string;
  creditsUsed: number;
  status: 'completed' | 'processing' | 'failed' | 'refunded';
  error?: string | null;
  prompt?: string;
  cloth?: string;
  model?: string;
  sourceModel?: string;
  targetModel?: string;
  outputUrl?: string | null;
  url?: string;
  remoteUrl?: string;
  highResUrl?: string;
  isManualUpload?: boolean;
  createdAt: number;
  completedAt?: number;
};

export type FashnCredits = {
  configured: boolean;
  total: number;
  subscription: number;
  onDemand: number;
  error?: string;
  updatedAt?: string;
};

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  phone?: string;
  avatar?: string;
  provider: string;
  credits: number;
  creditsLocked?: boolean;
  tier?: string;
  maxVideos?: number;
  maxModels?: number;
  photoshoots?: number;
  photoshootsDone?: number;
  photoshootsLeft?: number;
  maxGenerations?: number;
  videosGenerated?: number;
  modelsGenerated?: number;
  photoshootOffer?: PhotoshootOffer | null;
  features?: {
    hd2k?: boolean;
    fivePose?: boolean;
    video?: boolean;
    customRequests?: boolean;
  };
  createdAt: string | null;
};

export type AdminAccess = {
  claimed: boolean;
  admin: boolean;
  signedIn: boolean;
  email: string;
  requires2fa?: boolean;
  isPrimaryAdmin?: boolean;
};

export type SystemLog = {
  id: string;
  timestamp: number;
  isoTime: string;
  module: string;
  severity: 'error' | 'warning' | 'info';
  userEmail: string;
  userId: string | null;
  title: string;
  message: string;
  details?: string;
  stack?: string;
  resolved: boolean;
};

/** How much of the image library has been mirrored to imgbb. */
export type HostStatus = {
  running: boolean;
  total: number;
  done: number;
  failed: number;
  message: string;
  finishedAt: number;
  models: { total: number; hosted: number };
  generated: { total: number; hosted: number };
};

export type GatewayConfig = {
  ok: boolean;
  upiId: string;
  payeeName: string;
  bankDetails: {
    accountHolder: string;
    accountNumber: string;
    ifsc: string;
    bankName: string;
    accountType?: string;
  };
  accounts: {
    id: string;
    provider: string;
    label: string;
    upi_id?: string;
    payee_name?: string;
    is_default: boolean;
    is_hosted: boolean;
  }[];
  externalGatewayConfigured: boolean;
  plans?: Record<string, PlanConfig>;
};

export type GatewayOrder = {
  id: string;
  order_no: string;
  client_order_id: string;
  plan_id: string;
  plan_name: string;
  amount: number;
  currency: string;
  status: 'pending' | 'review' | 'paid' | 'expired' | 'failed';
  payment_method: 'upi' | 'bank';
  payment_account_id?: string;
  customer_name?: string;
  customer_email?: string;
  customer_mobile?: string;
  user_id?: string | null;
  note?: string;
  redirect_url?: string;
  upi_intent?: string;
  qr_data_url?: string;
  payment_url?: string;
  utr?: string | null;
  customer_utr?: string | null;
  utr_attempts?: number;
  provider_txn_id?: string | null;
  provider_response?: any;
  verified_by?: string | null;
  review_note?: string | null;
  rejection_reason?: string | null;
  paid_at?: string | null;
  expires_at?: string | null;
  invoice_no?: string;
  invoice_date?: string;
  invoice_generated?: boolean;
  created_at: string;
};

const TOKEN_KEY = 'sn_token';

export const getToken = (): string => {
  try {
    return window.localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
};

export const setToken = (token: string): void => {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode — session simply won't persist */
  }
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const targetUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
  const response = await fetch(targetUrl, { ...init, headers });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (data && (data.message || data.error)) || `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }
  return data as T;
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  /* accounts */
  authConfig: () => request<{ google: boolean; storage: 'mongodb' | 'local' }>('/api/auth/config'),
  me: () => request<{ user: User | null }>('/api/auth/me'),
  updateProfile: (body: { name?: string; phone?: string; avatar?: string }) =>
    request<{ ok: boolean; user: User }>('/api/auth/profile', { ...json(body), method: 'PATCH' }),
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>('/api/auth/login', json({ email, password })),
  register: (name: string, email: string, password: string) =>
    request<{ token: string; user: User }>('/api/auth/register', json({ name, email, password })),
  setPassword: (password: string) => request<{ ok: boolean; user: User }>('/api/auth/set-password', json({ password })),
  forgotPassword: (email: string) =>
    request<{ ok: boolean; message: string; deliveryNote?: string; emergencyOtp?: string; delivered?: boolean }>('/api/auth/forgot-password', json({ email })),
  verifyOtp: (email: string, otp: string) =>
    request<{ ok: boolean; resetToken: string; message?: string }>('/api/auth/verify-otp', json({ email, otp })),
  resetPassword: (resetToken: string, newPassword: string) =>
    request<{ ok: boolean; message: string }>('/api/auth/reset-password', json({ resetToken, newPassword })),

  /* customer studio */
  studio: () => request<Studio>('/api/studio'),
  models: () => request<{ categories: ModelCategory[] }>('/api/models'),
  uploads: () => request<{ items: { id: string; name: string; url: string; kind?: string; at?: number }[] }>('/api/uploads'),
  upload: (dataUrl: string, kind: 'cloth' | 'model', name: string) =>
    request<{
      url: string;
      preview: string;
      thumb: string;
      hosted: boolean;
      hostError?: string;
      name: string;
    }>('/api/upload', json({ dataUrl, kind, name })),
  generate: (body: Record<string, unknown>) =>
    request<{ id: string; mode: string; credits?: number; creditsUsed?: number }>('/api/generate', json(body)),
  job: (id: string) => request<Job>(`/api/job/${id}`),
  cancelJob: (id: string) =>
    request<{ ok: boolean; cancelled: boolean; refunded: boolean; refundedCredits: number; message: string }>(
      `/api/job/${id}/cancel`,
      { method: 'POST' }
    ),
  unlockUser: () => request<{ ok: boolean }>('/api/user/unlock', { method: 'POST' }),
  deleteUpload: (id: string) => request<{ ok: boolean; deleted: string }>(`/api/uploads/${id}`, { method: 'DELETE' }),
  collections: () => request<{ items: Collection[] }>('/api/collections'),
  createCollection: (name: string) => request<Collection>('/api/collections', json({ name })),
  addToCollection: (id: string, url: string, label = '') =>
    request<Collection>(`/api/collections/${id}/items`, json({ url, label })),

  /* custom requests */
  customRequests: () => request<{ items: CustomRequest[] }>('/api/custom-requests'),
  createCustomRequest: (body: {
    cloth?: string;
    clothImages?: string[];
    model?: string;
    modelImages?: string[];
    prompt: string;
    color?: string;
    clothName?: string;
    modelName?: string;
    requestType?: string;
  }) => request<CustomRequest>('/api/custom-requests', json(body)),
  deleteCustomRequest: (id: string) =>
    request<{ ok: boolean; deleted: string }>(`/api/custom-requests/${id}`, { method: 'DELETE' }),
  updateCustomRequest: (id: string, body: { prompt?: string; color?: string; requestType?: string }) =>
    request<CustomRequest>(`/api/custom-requests/${id}`, { ...json(body), method: 'PUT' }),
  adminCustomRequests: () => request<{ items: CustomRequest[]; total: number }>('/api/admin/custom-requests'),
  updateAdminCustomRequest: (
    id: string,
    body: {
      status?: 'queued' | 'in_progress' | 'delivered';
      adminReply?: string;
      deliveredImageUrl?: string;
      deliveredFile?: string;
      deliveredFileName?: string;
      deliveredFileType?: string;
      deliveredFileSize?: number;
    },
  ) => request<CustomRequest>(`/api/admin/custom-requests/${id}`, { ...json(body), method: 'PUT' }),
  markAdminRequestsRead: () => request<{ ok: boolean }>('/api/admin/custom-requests/mark-read', { method: 'POST' }),

  /* custom studio deliveries & dispatch */
  getUserDeliveries: () => request<{ items: AdminDelivery[]; unreadCount: number }>('/api/user/deliveries'),
  markUserDeliveriesRead: () => request<{ ok: boolean }>('/api/user/deliveries/mark-read', { method: 'POST' }),
  getAdminDeliveries: () => request<{ items: AdminDelivery[]; total: number }>('/api/admin/deliveries'),
  createAdminDelivery: (body: {
    recipientUserId?: string;
    recipientEmail: string;
    recipientName?: string;
    type: 'photo' | 'video' | 'zip' | 'folder' | 'text';
    title?: string;
    textMessage?: string;
    file?: string;
    fileName?: string;
    fileType?: string;
    fileSize?: number;
    mediaUrls?: string[];
  }) => request<AdminDelivery>('/api/admin/deliveries', json(body)),
  deleteAdminDelivery: (id: string) =>
    request<{ ok: boolean; message: string }>(`/api/admin/deliveries/${id}`, { method: 'DELETE' }),
  deleteUserDelivery: (id: string) =>
    request<{ ok: boolean; message: string }>(`/api/user/deliveries/${id}`, { method: 'DELETE' }),
  deleteAdminCustomRequest: (id: string) =>
    request<{ ok: boolean; message: string }>(`/api/admin/custom-requests/${id}`, { method: 'DELETE' }),

  /* Admin Recycle Bin */
  getAdminBin: () =>
    request<{ requests: CustomRequest[]; deliveries: AdminDelivery[]; total: number }>('/api/admin/bin'),
  restoreBinItem: (type: 'request' | 'delivery', id: string) =>
    request<{ ok: boolean; item?: any }>('/api/admin/bin/restore', json({ type, id })),
  permanentlyDeleteBinItem: (type: 'request' | 'delivery', id: string) =>
    request<{ ok: boolean; message: string }>(`/api/admin/bin/${type}/${id}`, { method: 'DELETE' }),
  emptyAdminBin: () =>
    request<{ ok: boolean; purged: number }>('/api/admin/bin/empty', { method: 'POST' }),

  /* developer profile */
  developerProfile: () =>
    request<{
      name: string;
      college: string;
      degree: string;
      year: string;
      email: string;
      mobile: string;
      avatar: string;
      bio: string;
    }>('/api/developer-profile'),
  updateDeveloperProfile: (body: {
    name?: string;
    college?: string;
    degree?: string;
    year?: string;
    email?: string;
    mobile?: string;
    avatar?: string;
    bio?: string;
  }) => request<{ ok: boolean; profile: Record<string, string> }>('/api/admin/developer-profile', { ...json(body), method: 'PUT' }),

  /* user generations library (images & videos in My Sets) */
  userGenerations: () => request<{ items: UserGeneration[] }>('/api/user/generations'),
  saveUserGeneration: (body: Partial<UserGeneration>) =>
    request<UserGeneration>('/api/user/generations', json(body)),
  deleteUserGeneration: (id: string, refund = false) =>
    request<{ ok: boolean; deleted: string; refunded?: boolean; refundedCredits?: number }>(
      `/api/user/generations/${id}${refund ? '?refund=true' : ''}`,
      { method: 'DELETE' }
    ),

  /* admin user management */
  adminUsers: () => request<{ items: AdminUser[]; total: number }>('/api/admin/users'),
  adminSaveUser: (id: string, body: Partial<AdminUser>) =>
    request<{ ok: boolean; user: AdminUser }>(`/api/admin/users/${id}`, { ...json(body), method: 'PUT' }),
  updateUserCredits: (id: string, credits: number) =>
    request<{ ok: boolean; id: string; credits: number }>(`/api/admin/users/${id}/credits`, json({ credits })),
  toggleUserLock: (id: string) =>
    request<{ ok: boolean; id: string; creditsLocked: boolean }>(`/api/admin/users/${id}/lock`, { method: 'POST' }),
  updateUserTier: (id: string, tier: string) =>
    request<{ ok: boolean; id: string; tier: string }>(`/api/admin/users/${id}/tier`, json({ tier })),
  updateUserVideoLimit: (id: string, maxVideos: number) =>
    request<{ ok: boolean; id: string; maxVideos: number }>(`/api/admin/users/${id}/video-limit`, json({ maxVideos })),
  updateUserPhotoshoots: (id: string, photoshoots: number, note?: string) =>
    request<{ ok: boolean; id: string; photoshootOffer: PhotoshootOffer }>(`/api/admin/users/${id}/photoshoots`, json({ photoshoots, note })),
  updateUserPhotoshootsProgress: (id: string, photoshootsDone: number, photoshoots?: number, email?: string) =>
    request<{ ok: boolean; id: string; photoshootsDone: number; photoshoots: number; photoshootsLeft: number }>(
      `/api/admin/users/${encodeURIComponent(id || email || '')}/photoshoots-progress`,
      json({ photoshootsDone, photoshoots, email })
    ),
  cleanBrokenCache: () => request<{ ok: boolean; message: string }>('/api/admin/clean-broken-cache', { method: 'POST' }),
  cleanUserCache: () => request<{ ok: boolean; message: string }>('/api/user/clean-cache', { method: 'POST' }),
  respondPhotoshootOffer: (action: 'agree' | 'query', queryText?: string) =>
    request<{ ok: boolean; status: string; photoshoots?: number; userQuery?: string }>('/api/user/photoshoot-response', json({ action, queryText })),
  deleteUser: (id: string) =>
    request<{ ok: boolean; id: string }>(`/api/admin/users/${id}`, { method: 'DELETE' }),

  /* admin all generations */
  adminGenerations: () =>
    request<{
      items: AdminGeneration[];
      total: number;
      totalCreditsDeducted: number;
      successCount: number;
      failedCount: number;
      processingCount: number;
    }>('/api/admin/generations'),
  adminDeleteGeneration: (id: string) =>
    request<{ ok: boolean; deleted: string }>(`/api/admin/generations/${id}`, { method: 'DELETE' }),
  adminRefundGeneration: (id: string) =>
    request<{ ok: boolean; refundedCredits: number; userEmail: string; newBalance: number }>(
      `/api/admin/generations/${id}/refund`,
      { method: 'POST' },
    ),

  /* video */
  generateVideo: (body: { image?: string; prompt?: string; duration?: 5 | 10; aspect_ratio?: string }) =>
    request<{
      ok?: boolean;
      id?: string;
      duration?: number;
      aspect_ratio?: string;
      credits?: number;
      creditsUsed?: number;
      videosGenerated?: number;
      maxVideos?: number;
      status?: string;
      message?: string;
    }>('/api/generate-video', json(body)),

  /* upload sets */
  uploadSets: () => request<{ items: UploadSet[] }>('/api/upload-sets'),
  createUploadSet: (body: {
    clothDataUrl?: string; clothName?: string;
    modelDataUrl?: string; modelName?: string;
    prompt: string;
  }) => request<UploadSet>('/api/upload-sets', json(body)),
  deleteUploadSet: (id: string) => request<{ ok: boolean }>(`/api/upload-sets/${id}`, { method: 'DELETE' }),
  adminUploadSets: () => request<{ items: UploadSet[]; total: number }>('/api/admin/upload-sets'),

  /* admin studio models */
  uploadAdminModel: (body: { category: string; name?: string; imageData?: string; models?: { name: string; imageData: string }[] }) =>
    request<{ ok: boolean; category: string; count?: number; model?: { id: string; name: string; url: string }; models?: { id: string; name: string; url: string }[] }>(
      '/api/admin/models',
      json(body),
    ),
  deleteAdminModel: (id: string) =>
    request<{ ok: boolean; deleted: string }>(`/api/admin/models?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() =>
      // Graceful fallback to POST endpoint if client/proxy strips DELETE
      request<{ ok: boolean; deleted: string }>('/api/admin/models/delete', json({ id }))
    ),
  moveAdminModel: (body: { id: string; targetCategory: string }) =>
    request<{ ok: boolean; oldId: string; newId: string; targetCategory: string }>('/api/admin/models/move', json(body)),

  /* admin system problem logs */
  systemLogs: () => request<{ logs: SystemLog[]; unresolvedCount: number; total: number }>('/api/admin/system-logs'),
  toggleResolveLog: (id: string) =>
    request<{ ok: boolean; item: SystemLog }>(`/api/admin/system-logs/${id}/resolve`, { method: 'POST' }),
  deleteSystemLog: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/system-logs/${id}`, { method: 'DELETE' }),
  clearSystemLogs: () => request<{ ok: boolean }>('/api/admin/system-logs/clear', { method: 'POST' }),
  reportClientError: (body: { title?: string; message: string; module?: string; details?: unknown; stack?: string }) =>
    request<{ ok: boolean }>('/api/client-error', json(body)),

  /* admin */
  adminAccess: () => request<AdminAccess>('/api/admin/access'),
  claimAdmin: () => request<{ ok: boolean; admin: boolean }>('/api/admin/claim', { method: 'POST' }),
  adminSettings: () => request<AdminSettings>('/api/admin/settings'),
  adminFashnCredits: () => request<FashnCredits>('/api/admin/fashn-credits'),
  adminSendOtp: () =>
    request<{ ok: boolean; requires2fa: boolean; message: string; emergencyOtp?: string; deliveryNote?: string; delivered?: boolean }>(
      '/api/auth/admin/send-otp',
      { method: 'POST' }
    ),
  adminLoginStep1: (body: { email: string; password: string }) =>
    request<{ ok: boolean; requires2fa: boolean; token?: string; user?: User; message: string; deliveryNote?: string; emergencyOtp?: string; delivered?: boolean }>(
      '/api/auth/admin/login-step1',
      json(body)
    ),
  adminLoginStep2: (body: { email: string; otp: string }) =>
    request<{ ok: boolean; token: string; user: User; message: string }>('/api/auth/admin/login-step2', json(body)),
  adminTestEmail: () =>
    request<{ ok: boolean; message: string; provider?: string; id?: string; error?: string }>('/api/admin/test-email', { method: 'POST' }),
  hostStatus: () => request<HostStatus>('/api/admin/host'),
  startHostSync: () => request<{ started: boolean; running: boolean }>('/api/admin/host', { method: 'POST' }),
  saveAdminSettings: (patch: Record<string, unknown>) =>
    request<{ ok: boolean }>('/api/admin/settings', { ...json(patch), method: 'PUT' }),
  plans: () => request<{ ok: boolean; plans: Record<string, PlanConfig> }>('/api/plans'),
  adminUpdatePlans: (plans: Record<string, Partial<PlanConfig>>) =>
    request<{ ok: boolean; message: string; plans: Record<string, PlanConfig> }>('/api/admin/plans', {
      ...json({ plans }),
      method: 'PUT',
    }),

  /* upi gateway (compatible with mynkdev-21/upi-gateway) */
  gatewayConfig: () => request<GatewayConfig>('/api/upi-gateway/config'),
  createGatewayOrder: (body: {
    amount: number;
    plan_id: string;
    customer_name?: string;
    customer_email?: string;
    customer_mobile?: string;
    payment_method?: 'upi' | 'bank';
    note?: string;
    redirect_url?: string;
  }) => request<{ success: boolean; data: GatewayOrder }>('/api/upi-gateway/orders', json(body)),
  getGatewayOrder: (orderNo: string) =>
    request<{ success: boolean; data: GatewayOrder }>(`/api/upi-gateway/orders/${encodeURIComponent(orderNo)}`),
  getGatewayOrderStatus: (orderNo: string) =>
    request<{ success: boolean; status: string; paid: boolean; utr?: string; redirect?: string }>(
      `/api/upi-gateway/orders/${encodeURIComponent(orderNo)}/status`
    ),
  submitGatewayUtr: (orderNo: string, utr: string) =>
    request<{ success: boolean; message: string; data: GatewayOrder }>(
      `/api/upi-gateway/orders/${encodeURIComponent(orderNo)}/submit-utr`,
      json({ utr })
    ),
  verifyGatewayCode: (orderNo: string, code: string) =>
    request<{ success: boolean; message: string; paid: boolean; invoice_generated?: boolean; data: GatewayOrder }>(
      `/api/upi-gateway/orders/${encodeURIComponent(orderNo)}/verify-code`,
      json({ code })
    ),
  adminGatewayOrders: () =>
    request<{
      success: boolean;
      stats: { totalOrders: number; totalRevenue: number; reviewCount: number; paidCount: number; pendingCount: number };
      orders: GatewayOrder[];
      accounts: any[];
    }>('/api/upi-gateway/admin/orders'),
  adminApproveGatewayOrder: (orderNo: string, body?: { bank_utr?: string; note?: string }) =>
    request<{ success: boolean; message: string; data: GatewayOrder }>(
      `/api/upi-gateway/orders/${encodeURIComponent(orderNo)}/approve`,
      json(body || {})
    ),
  adminRejectGatewayOrder: (orderNo: string, reason?: string) =>
    request<{ success: boolean; message: string; data: GatewayOrder }>(
      `/api/upi-gateway/orders/${encodeURIComponent(orderNo)}/reject`,
      json({ reason })
    ),
  adminUpdateGatewayOrder: (orderNo: string, patch: Record<string, any>) =>
    request<{ success: boolean; message: string; data: GatewayOrder }>(
      `/api/upi-gateway/orders/${encodeURIComponent(orderNo)}`,
      { ...json(patch), method: 'PUT' }
    ),
  adminDeleteGatewayOrder: (orderNo: string) =>
    request<{ success: boolean; message: string }>(
      `/api/upi-gateway/orders/${encodeURIComponent(orderNo)}`,
      { method: 'DELETE' }
    ),
  adminGatewaySettings: () =>
    request<{
      success: boolean;
      upiId: string;
      payeeName: string;
      paytmMid: string;
      paytmMidMasked: string;
      upiGatewayUrl: string;
      upiGatewayApiKey: string;
      upiGatewayApiKeyMasked: string;
      accounts: any[];
    }>('/api/upi-gateway/admin/settings'),
  saveAdminGatewaySettings: (patch: Record<string, unknown>) =>
    request<{ success: boolean; message: string }>('/api/upi-gateway/admin/settings', { ...json(patch), method: 'PUT' }),

  getAdminStorageStatus: () =>
    request<{
      disk: {
        generatedCount: number;
        generatedHuman: string;
        dataHuman: string;
      };
      database: {
        connected: boolean;
        dataSizeHuman: string;
        storageSizeHuman: string;
        collections: number;
      };
      hosted: {
        totalHostedImages: number;
      };
    }>('/api/admin/storage-status'),
};

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.readAsDataURL(file);
  });
}

/**
 * High-fidelity client standardizer:
 * Enforces square dimensions between 1000px and 3000px without compromising image quality.
 * Prevents "Dimensions must be between 1000x1000px and 3000x3000px / Some images too small" errors.
 */
export function prepareAndStandardizeImage(file: File): Promise<{ dataUrl: string; name: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image format'));
      img.onload = () => {
        const { naturalWidth: w, naturalHeight: h } = img;

        // Target square dimension: between 1024px and 2400px square
        // 1600px JPEG at 0.92 quality is crystal-sharp on logos and stitching,
        // but produces a lightweight ~240KB payload (uploads in <50ms instead of 15 seconds)!
        const maxSide = Math.max(w, h);
        const targetSide = Math.min(2400, Math.max(1024, maxSide));

        const canvas = document.createElement('canvas');
        canvas.width = targetSide;
        canvas.height = targetSide;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ dataUrl: String(reader.result), name: file.name });
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Clean white studio backdrop
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetSide, targetSide);

        // Center proportionally with zero distortion or crop
        const scale = Math.min(targetSide / w, targetSide / h);
        const renderW = Math.round(w * scale);
        const renderH = Math.round(h * scale);
        const offsetX = Math.round((targetSide - renderW) / 2);
        const offsetY = Math.round((targetSide - renderH) / 2);

        ctx.drawImage(img, offsetX, offsetY, renderW, renderH);

        // High-efficiency JPEG at 0.92 quality: instant network upload with pristine quality
        const standardizedUrl = canvas.toDataURL('image/jpeg', 0.92);
        resolve({ dataUrl: standardizedUrl, name: file.name.replace(/\.[^.]+$/, '') + '.jpg' });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Automatically proxies cross-origin URLs through the backend image proxy
 * to prevent CORS restrictions and canvas tainting during export.
 */
export function getProxiedImageUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('/')) {
    return url;
  }
  try {
    const parsed = new URL(url);
    if (typeof window !== 'undefined' && parsed.origin === window.location.origin) {
      return url;
    }
    return `/api/proxy-image?url=${encodeURIComponent(url)}`;
  } catch {
    return url;
  }
}

/**
 * Ensures any studio render or export is 100% compliant with e-commerce product catalogs:
 * 1. Aspect ratio: Exactly 1:1 Square (width === height).
 * 2. Dimensions: Between 1000px and 3000px (defaults to high-res 2400x2400px square).
 * 3. Proportional model/garment centering with zero stretching, distortion, or cropping.
 * 4. Pure studio backdrop padding (#ffffff or seamless corner match).
 * 5. Solves "Dimensions must be between 1000x1000 and 3000x3000 / Only square images allowed" errors.
 */
export async function formatCatalogSquare(
  imageSource: string | Blob,
  targetDim = 2400,
  filename = 'render.png'
): Promise<Blob> {
  let blob: Blob;
  if (imageSource instanceof Blob) {
    blob = imageSource;
  } else {
    const fetchUrl = getProxiedImageUrl(imageSource);
    let res: Response;
    try {
      res = await fetch(fetchUrl);
    } catch {
      // Direct fetch fallback if local proxy unreachable
      res = await fetch(imageSource);
    }
    if (!res.ok) throw new Error(`Failed to fetch image: HTTP ${res.status}`);
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('html') || contentType.includes('json') || contentType.includes('text')) {
      throw new Error(`Server returned non-image content-type: ${contentType}`);
    }
    blob = await res.blob();
  }

  // Reject empty or HTML/JSON payloads
  if (blob.size < 200) {
    throw new Error('Image data is too small to be a valid file');
  }
  if (blob.type.includes('html') || blob.type.includes('json') || blob.type.includes('text')) {
    throw new Error(`Invalid blob type: ${blob.type}`);
  }

  // Validate magic bytes: ensure not '<' (0x3c) or '{' (0x7b)
  const headerBuf = await blob.slice(0, 4).arrayBuffer();
  const header = new Uint8Array(headerBuf);
  if (header[0] === 0x3c || header[0] === 0x7b) {
    throw new Error('Response payload is an HTML/JSON error page, not an image');
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    // Note: Do not set img.crossOrigin on local blob URLs (causes browser CORS failure)
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Invalid image format for catalog squaring'));
      img.src = objectUrl;
    });

    const w = img.naturalWidth || 1000;
    const h = img.naturalHeight || 1000;

    // Enforce dimension strictly between 1000px and 3000px as strictly required by the catalog
    const dim = Math.min(3000, Math.max(1000, Math.max(w, h, targetDim)));

    const canvas = document.createElement('canvas');
    canvas.width = dim;
    canvas.height = dim;
    const ctx = canvas.getContext('2d');
    if (!ctx) return blob;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Studio clean white backdrop
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, dim, dim);

    // Keep aspect ratio 100% intact — zero distortion, zero squishing
    const scale = Math.min(dim / w, dim / h);
    const renderW = Math.round(w * scale);
    const renderH = Math.round(h * scale);
    const offsetX = Math.round((dim - renderW) / 2);
    const offsetY = Math.round((dim - renderH) / 2);

    ctx.drawImage(img, offsetX, offsetY, renderW, renderH);

    const isJpg = /\.jpe?g$/i.test(filename);
    const mime = isJpg ? 'image/jpeg' : 'image/png';
    const quality = isJpg ? 0.95 : undefined;

    return await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => {
        if (b && b.size > 200) {
          resolve(b);
        } else {
          resolve(blob);
        }
      }, mime, quality);
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Scales any fashion image to catalog resolution of exactly Width: 1807 px and Height: 3000 px.
 */
export async function scaleToEcommerceCatalog(
  imageSource: string | Blob,
  targetW = 1807,
  targetH = 3000,
  filename = 'render.png'
): Promise<Blob> {
  let blob: Blob;
  if (imageSource instanceof Blob) {
    blob = imageSource;
  } else {
    const candidates = [
      getProxiedImageUrl(imageSource),
      `/api/download-proxy?url=${encodeURIComponent(imageSource)}&filename=${encodeURIComponent(filename)}`,
      imageSource
    ];
    let loadedBlob: Blob | null = null;
    for (const cand of candidates) {
      try {
        const res = await fetch(cand);
        if (!res.ok) continue;
        const cType = (res.headers.get('content-type') || '').toLowerCase();
        if (cType.includes('html') || cType.includes('json') || cType.includes('text')) continue;
        const b = await res.blob();
        if (b.size >= 200) {
          const header = new Uint8Array(await b.slice(0, 4).arrayBuffer());
          if (header[0] !== 0x3c && header[0] !== 0x7b) {
            loadedBlob = b;
            break;
          }
        }
      } catch {}
    }
    if (!loadedBlob) {
      throw new Error('Could not fetch valid image data for catalog scaling');
    }
    blob = loadedBlob;
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Invalid image format for catalog scaling'));
      img.src = objectUrl;
    });

    const w = img.naturalWidth || 616;
    const h = img.naturalHeight || 1024;

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return blob;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Sample corner pixel from original image to fill any fractional letterboxing seamlessly
    try {
      const sampleCanvas = document.createElement('canvas');
      sampleCanvas.width = 1;
      sampleCanvas.height = 1;
      const sCtx = sampleCanvas.getContext('2d');
      if (sCtx) {
        sCtx.drawImage(img, 0, 0, 1, 1, 0, 0, 1, 1);
        const p = sCtx.getImageData(0, 0, 1, 1).data;
        ctx.fillStyle = `rgb(${p[0]}, ${p[1]}, ${p[2]})`;
      } else {
        ctx.fillStyle = '#6e6e73';
      }
    } catch {
      ctx.fillStyle = '#6e6e73';
    }
    ctx.fillRect(0, 0, targetW, targetH);

    // Center and scale proportionally to fit 1807x3000
    const scale = Math.max(targetW / w, targetH / h);
    const renderW = Math.round(w * scale);
    const renderH = Math.round(h * scale);
    const offsetX = Math.round((targetW - renderW) / 2);
    const offsetY = Math.round((targetH - renderH) / 2);

    ctx.drawImage(img, offsetX, offsetY, renderW, renderH);

    const isJpg = /\.jpe?g$/i.test(filename);
    const mime = isJpg ? 'image/jpeg' : 'image/png';
    const quality = isJpg ? 0.95 : undefined;

    return await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => {
        if (b && b.size > 200) {
          resolve(b);
        } else {
          resolve(blob);
        }
      }, mime, quality);
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 3000);
}

/**
 * Triggers direct browser download via Blob and Object URL,
 * avoiding browser cross-origin redirects to a new tab.
 * Validates file integrity to prevent downloading corrupt HTML 404 pages as images.
 */
export async function downloadDirectFile(
  url: string,
  filename: string,
  _options?: { catalogSquare?: boolean; targetDim?: number }
): Promise<void> {
  if (!url || typeof url !== 'string') {
    alert('Download failed: Invalid or missing file URL.');
    return;
  }

  const isVideo = url.endsWith('.mp4') || url.includes('.mp4');

  // Scale every non-video downloaded image to exact Width 1807 x Height 3000 pixels
  if (!isVideo) {
    try {
      const catalogBlob = await scaleToEcommerceCatalog(url, 1807, 3000, filename);
      if (catalogBlob && catalogBlob.size >= 200) {
        triggerBlobDownload(catalogBlob, filename);
        return;
      }
    } catch (err) {
      console.warn('[download] scaleToEcommerceCatalog failed, falling back to direct download:', err);
    }
  }

  // Handle data: and blob: URLs directly
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  }

  // Multi-tier candidate fetch for remote and server images
  const candidates = [
    url,
    `/api/download-proxy?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`,
    isVideo ? url : getProxiedImageUrl(url)
  ];

  for (const testUrl of candidates) {
    try {
      const res = await fetch(testUrl);
      if (!res.ok) continue;

      const cType = (res.headers.get('content-type') || '').toLowerCase();
      if (cType.includes('html') || cType.includes('json') || cType.includes('text')) {
        continue;
      }

      const candidateBlob = await res.blob();
      if (candidateBlob.size < 200) continue;
      if (candidateBlob.type.includes('html') || candidateBlob.type.includes('json')) continue;

      // Magic byte check (avoid saving 404 HTML / 500 JSON error as .png)
      const header = new Uint8Array(await candidateBlob.slice(0, 4).arrayBuffer());
      if (header[0] === 0x3c || header[0] === 0x7b) continue; // '<' or '{'

      triggerBlobDownload(candidateBlob, filename);
      return;
    } catch (e) {
      console.warn(`[download] Candidate fetch failed for ${testUrl}:`, e);
    }
  }

  // Relative /generated/ URL fallback: recover live upstream URL from job
  if (url.startsWith('/generated/') || url.startsWith('generated/')) {
    try {
      const clean = url.replace(/^\/?generated\//, '');
      const jId = clean.replace(/-\d+\.[^.]+$/, '');
      if (jId && jId.length > 5) {
        const jobRes = await fetch(`/api/job/${jId}`).then((r) => r.json()).catch(() => null);
        const upstream = (Array.isArray(jobRes?.output) && jobRes.output[0]) || jobRes?.remoteUrl || jobRes?.highResUrl;
        if (upstream && typeof upstream === 'string' && /^https?:/.test(upstream)) {
          try {
            const upRes = await fetch(upstream);
            if (upRes.ok) {
              const upBlob = await upRes.blob();
              if (upBlob.size >= 200) {
                triggerBlobDownload(upBlob, filename);
                return;
              }
            }
          } catch {}
          window.open(upstream, '_blank');
          return;
        }
      }
    } catch (recoverErr) {
      console.warn('[download] Live upstream recovery failed:', recoverErr);
    }
  }

  // External URL fallback: open in new tab so user can save directly
  if (url.startsWith('http://') || url.startsWith('https://')) {
    window.open(url, '_blank');
    return;
  }

  alert('Unable to download: The image file is currently unavailable on the server. Please try regenerating the render.');
}

