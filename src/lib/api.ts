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
  adminReply?: string;
  deliveredImageUrl?: string;
  deliveredFileUrl?: string;
  deliveredFileName?: string;
  deliveredFileType?: string;
  deliveredFileSize?: number;
  deliveredAt?: number | null;
};

export type UserGeneration = {
  id: string;
  userId: string;
  userEmail: string;
  type: 'image' | 'video';
  url: string;
  highResUrl: string;
  prompt: string;
  color?: string;
  colorName?: string;
  resolution?: string;
  duration?: number;
  aspectRatio?: string;
  title: string;
  createdAt: number;
};

export type AdminGeneration = {
  id: string;
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
  videosGenerated?: number;
  modelsGenerated?: number;
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
  rejection_reason?: string | null;
  paid_at?: string | null;
  expires_at?: string | null;
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
  uploads: () => request<{ items: { id: string; name: string; url: string }[] }>('/api/uploads'),
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
  deleteUpload: (id: string) => request<{ ok: boolean; deleted: string }>(`/api/uploads/${id}`, { method: 'DELETE' }),
  collections: () => request<{ items: Collection[] }>('/api/collections'),
  createCollection: (name: string) => request<Collection>('/api/collections', json({ name })),
  addToCollection: (id: string, url: string, label = '') =>
    request<Collection>(`/api/collections/${id}/items`, json({ url, label })),

  /* custom requests */
  customRequests: () => request<{ items: CustomRequest[] }>('/api/custom-requests'),
  createCustomRequest: (body: {
    cloth?: string;
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
  deleteUserGeneration: (id: string) =>
    request<{ ok: boolean; deleted: string }>(`/api/user/generations/${id}`, { method: 'DELETE' }),

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
  uploadAdminModel: (body: { category: string; name: string; imageData: string }) =>
    request<{ ok: boolean; category: string; model: { id: string; name: string; url: string } }>(
      '/api/admin/models',
      json(body),
    ),
  deleteAdminModel: (id: string) =>
    request<{ ok: boolean; deleted: string }>('/api/admin/models', { ...json({ id }), method: 'DELETE' }),

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
};

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.readAsDataURL(file);
  });
}
