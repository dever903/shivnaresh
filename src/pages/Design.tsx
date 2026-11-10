import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Clock,
  ExternalLink,
  Film,
  Folder,
  Layers,
  Lock,
  Paperclip,
  RefreshCw,
  Sliders,
  Trash2,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useTheme, ThemeToggle } from '../lib/theme';
import {
  api,
  ApiError,
  fileToDataUrl,
  setToken,
  type Collection,
  type CustomRequest,
  type Job,
  type ModelCategory,
  type Studio,
  type UploadSet,
  type User,
  type UserGeneration,
} from '../lib/api';

type Pick = { url: string; name: string; preview?: string } | null;

type GarmentRole = 'tops-front' | 'tops-back' | 'bottoms' | 'unknown';
type TryOnTarget = 'upper' | 'lower' | 'both';

interface ClassifiedGarment {
  url: string;
  preview?: string;
  name: string;
  role: GarmentRole;
}

const MODES = [
  { id: 'tryon', label: 'Try-On', needs: ['cloth', 'model'], hint: 'Fit your garment onto a studio model, preserving pose and athletic posture.' },
  { id: 'swap', label: 'Model Swap', needs: ['sourceModel', 'targetModel'], hint: 'Swap model or face in an outfit with another model or persona.' },
] as const;

type ModeId = (typeof MODES)[number]['id'] | 'edit';

const PROGRESS_STAGES: Record<string, { label: string; percent: number }> = {
  starting: { label: 'Starting render cluster…', percent: 8 },
  in_queue: { label: 'In GPU queue…', percent: 20 },
  processing: { label: 'Generating studio image…', percent: 65 },
  completed: { label: 'Complete!', percent: 100 },
  failed: { label: 'Failed', percent: 0 },
};

/* ----------------------------------------------------------------
   5-Pose Multi-Angle Engine Configuration
   ---------------------------------------------------------------- */
export interface PoseItem {
  id: string;
  name: string;
  angle: string;
  icon: string;
  promptSuffix: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  url?: string;
  jobId?: string;
}

export const FIVE_POSES_SPECS: Omit<PoseItem, 'status'>[] = [
  { id: 'front', name: 'Front View', angle: '0° Center', icon: '0°', promptSuffix: 'front full-body standing fashion editorial catalog pose, direct camera gaze, symmetrical athletic posture' },
  { id: 'three_quarter', name: '3/4 Turn', angle: '45° Dynamic', icon: '45°', promptSuffix: 'three-quarter 45 degree dynamic fashion perspective angle pose, natural catalog lighting' },
  { id: 'profile', name: 'Side Profile', angle: '90° Silhouette', icon: '90°', promptSuffix: 'full side profile 90 degree fashion silhouette pose, athletic posture highlighting garment fit and trim' },
  { id: 'back', name: 'Back View', angle: '180° Rear', icon: '180°', promptSuffix: 'back view 180 degree catalog showcase pose, crisp focus on garment rear design, typography, and athletic cut' },
  { id: 'action', name: 'Athletic Motion', angle: 'Sport Action', icon: 'Motion', promptSuffix: 'dynamic athletic active motion pose, fluid sports movement showcasing active sportswear fabric movement' },
];

function sendDesktopNotification(title: string, body: string, icon?: string) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    const n = new Notification(title, { body, icon: icon || '/brand-mark-white.png', tag: 'shivnaresh-gen' });
    n.onclick = () => { window.focus(); n.close(); };
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then((perm) => {
      if (perm === 'granted') {
        const n = new Notification(title, { body, icon: icon || '/brand-mark-white.png', tag: 'shivnaresh-gen' });
        n.onclick = () => { window.focus(); n.close(); };
      }
    });
  }
}

/* ----------------------------------------------------------------
   Image confirmation popup — shown after the user selects a file
   ---------------------------------------------------------------- */
function ImageConfirmPopup({
  preview,
  kind,
  onConfirm,
  onCancel,
}: {
  preview: string;
  kind: 'cloth' | 'model';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-3xl border border-white/20 bg-[#111116] p-6 shadow-2xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/50">
          Confirm {kind === 'cloth' ? 'Garment' : 'Model'} Image
        </p>
        <div className="mt-4 flex justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/40">
          <img
            src={preview}
            alt="Preview"
            className="max-h-64 w-auto rounded-xl object-contain shadow-lg"
          />
        </div>
        <p className="mt-4 text-center text-xs text-white/70">
          Ensure the image is sharp and properly lit. Click <strong className="text-white">OK</strong> to accept.
        </p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-full border border-white/20 py-2.5 text-xs font-semibold text-white/60 hover:border-white/40 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-full bg-white py-2.5 text-xs font-bold uppercase tracking-wider text-gray-900 hover:bg-gray-100 transition-colors"
          >
            OK, Use This
          </button>
        </div>
      </div>
    </div>
  );
}

export function safeOpenMediaInNewTab(mediaUrl: string, title = 'SHIV-NARESH Media Preview') {
  if (!mediaUrl) return;
  if (mediaUrl.startsWith('data:')) {
    try {
      const arr = mediaUrl.split(',');
      const mimeMatch = arr[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/png';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      const blob = new Blob([u8arr], { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      const win = window.open(blobUrl, '_blank');
      if (!win) {
        window.location.href = blobUrl;
      }
      return;
    } catch {
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>body{margin:0;background:#08080a;display:flex;justify-content:center;align-items:center;min-height:100vh;}img{max-width:98vw;max-height:98vh;object-fit:contain;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.8);}</style></head><body><img src="${mediaUrl}" alt="${title}" /></body></html>`);
        win.document.close();
        return;
      }
    }
  }
  window.open(mediaUrl, '_blank', 'noopener,noreferrer');
}

function classifyGarmentByHeuristic(name: string): GarmentRole {
  const n = name.toLowerCase();
  // Check for bottoms keywords
  if (/pant|trouser|short|bottom|lower|leg|waist|cargo|jean|denim|jogger/.test(n)) return 'bottoms';
  // Check for back keywords
  if (/back|rear|behind|dorsal/.test(n)) return 'tops-back';
  // Check for front/top keywords
  if (/front|chest|jacket|hoodie|shirt|tee|top|upper|sleeve|jersey|coat|sweater/.test(n)) return 'tops-front';
  // Default to tops-front (most common upload)
  return 'tops-front';
}

/* ----------------------------------------------------------------
   SLA 24-48h Confirmation Popup for Custom Requests
   ---------------------------------------------------------------- */
function RequestSubmittedPopup({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111116] p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e5373f]/10 text-[#e5373f]">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Custom studio order placed</h3>
            <p className="text-xs text-white/50">Transferred to master tailor queue</p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-black/40 p-4">
          <p className="text-xs leading-relaxed text-white/80">
            Your custom garment and styling instructions have been received by our studio team.
          </p>
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-300 border border-amber-500/20">
            <Clock className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Delivery within <strong>24–48 hours</strong></span>
          </div>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-white/50">
          You can track status and review completed deliveries in your <strong>Custom Requests</strong> tab anytime.
        </p>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-lg bg-white py-2.5 text-xs font-semibold text-gray-900 hover:bg-gray-100 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
   Live Countdown Timer Component (24-48h SLA)
   ---------------------------------------------------------------- */
function LiveCountdownTimer({ createdAt, deadlineHours }: { createdAt: number; deadlineHours: number }) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [timeLeft, setTimeLeft] = useState<{ hours: number; minutes: number; seconds: number; isExpired: boolean }>({
    hours: deadlineHours,
    minutes: 0,
    seconds: 0,
    isExpired: false,
  });

  useEffect(() => {
    const targetMs = createdAt + deadlineHours * 60 * 60 * 1000;

    const tick = () => {
      const now = Date.now();
      const diff = targetMs - now;
      if (diff <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0, isExpired: true });
        return;
      }
      const totalSec = Math.floor(diff / 1000);
      const hours = Math.floor(totalSec / 3600);
      const minutes = Math.floor((totalSec % 3600) / 60);
      const seconds = totalSec % 60;
      setTimeLeft({ hours, minutes, seconds, isExpired: false });
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [createdAt, deadlineHours]);

  if (timeLeft.isExpired) {
    return <span className={`font-mono font-bold ${isLight ? 'text-emerald-950 font-black' : 'text-emerald-400'}`}>Delivery Window Met</span>;
  }

  return (
    <span className={`font-mono font-bold ${isLight ? 'text-amber-950 font-black' : 'text-amber-300'}`}>
      {String(timeLeft.hours).padStart(2, '0')}h : {String(timeLeft.minutes).padStart(2, '0')}m :{' '}
      {String(timeLeft.seconds).padStart(2, '0')}s left
    </span>
  );
}

/* ----------------------------------------------------------------
   Instruction popup — shown before the first upload in My Sets
   ---------------------------------------------------------------- */
function InstructionPopup({ onGotIt }: { onGotIt: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111114] p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white">
            <Camera className="h-5 w-5" />
          </div>
          <h3 className="text-sm font-semibold text-white">How upload sets work</h3>
        </div>
        <ul className="mt-5 space-y-3 text-xs text-white/70">
          <li className="flex items-start gap-2">
            <span className="text-[#e5373f] font-bold">1.</span>
            <span>Upload a <strong className="text-white">garment image</strong> (flat lay or worn &mdash; PNG, JPEG, WEBP).</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#e5373f] font-bold">2.</span>
            <span>Upload a <strong className="text-white">model image</strong> (optional).</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#e5373f] font-bold">3.</span>
            <span>Add custom <strong className="text-white">styling instructions</strong>.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#e5373f] font-bold">4.</span>
            <span>Press <strong className="text-white">Save Set</strong>. Stored on Cloudinary permanently in your account.</span>
          </li>
        </ul>
        <button
          type="button"
          onClick={onGotIt}
          className="mt-6 w-full rounded-full bg-white py-3 text-xs font-bold uppercase tracking-wider text-gray-900 hover:bg-gray-100"
        >
          Got it &mdash; Let's Upload &rarr;
        </button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
   Avatar Crop & Position Adjuster Modal
   ---------------------------------------------------------------- */
function AvatarCropModal({
  imageUrl,
  onCancel,
  onApplyCrop,
}: {
  imageUrl: string;
  onCancel: () => void;
  onApplyCrop: (croppedDataUrl: string) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      drawCanvas();
    };
    img.src = imageUrl;
  }, [imageUrl]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const size = canvas.width;
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();

    const baseScale = Math.max(size / img.width, size / img.height);
    const scale = baseScale * zoom;
    const w = img.width * scale;
    const h = img.height * scale;
    const x = (size - w) / 2 + panX;
    const y = (size - h) / 2 + panY;

    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
  };

  useEffect(() => {
    drawCanvas();
  }, [zoom, panX, panY]);

  const handleApply = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    onApplyCrop(dataUrl);
  };

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-3xl border border-white/20 bg-[#121217] p-6 text-white shadow-2xl">
        <h3 className="text-base font-bold">Crop & Position Profile Picture</h3>
        <p className="text-xs text-white/50 mt-1">Adjust zoom and alignment for your avatar</p>

        <div className="my-5 flex justify-center">
          <div className="relative rounded-full overflow-hidden border-2 border-[#e5373f] shadow-xl w-44 h-44 bg-black">
            <canvas ref={canvasRef} width={256} height={256} className="w-full h-full" />
          </div>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <div className="flex justify-between text-white/60 mb-1">
              <span>Zoom</span>
              <span>{zoom.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-full accent-[#e5373f]"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[10px] uppercase text-white/50 block mb-1">Pan Horizontal</span>
              <input
                type="range"
                min="-60"
                max="60"
                value={panX}
                onChange={(e) => setPanX(parseInt(e.target.value))}
                className="w-full accent-[#e5373f]"
              />
            </div>
            <div>
              <span className="text-[10px] uppercase text-white/50 block mb-1">Pan Vertical</span>
              <input
                type="range"
                min="-60"
                max="60"
                value={panY}
                onChange={(e) => setPanY(parseInt(e.target.value))}
                className="w-full accent-[#e5373f]"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-full border border-white/20 py-2.5 text-xs font-semibold text-white/60 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="flex-1 rounded-full bg-[#e5373f] hover:bg-[#d42d35] py-2.5 text-xs font-bold uppercase tracking-wider text-white"
          >
            Crop & Apply
          </button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
   User Profile Modal (View & Edit Name, 10-digit Phone, Avatar)
   ---------------------------------------------------------------- */
function UserProfileModal({
  user,
  onClose,
  onUserUpdated,
  isLight,
}: {
  user: User;
  onClose: () => void;
  onUserUpdated: (u: User) => void;
  isLight: boolean;
}) {
  const [name, setName] = useState(user.name || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [avatar, setAvatar] = useState(user.avatar || '');
  const [tempCropImage, setTempCropImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const avatarFileRef = useRef<HTMLInputElement>(null);

  async function handleAvatarSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setTempCropImage(dataUrl);
    } catch {
      setError('Could not process avatar image.');
    }
  }

  async function handleSave() {
    setError('');
    setSuccess('');
    const cleanPhone = phone.trim().replace(/\D/g, '');
    if (cleanPhone.length > 0 && cleanPhone.length !== 10) {
      setError('Phone number must be exactly 10 digits (e.g. 9876543210).');
      return;
    }
    if (!name.trim()) {
      setError('Please enter your full name.');
      return;
    }
    setSaving(true);
    try {
      const res = await api.updateProfile({
        name: name.trim(),
        phone: cleanPhone,
        avatar,
      });
      onUserUpdated(res.user);
      setSuccess('Profile updated successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      {tempCropImage && (
        <AvatarCropModal
          imageUrl={tempCropImage}
          onCancel={() => setTempCropImage(null)}
          onApplyCrop={(croppedUrl) => {
            setAvatar(croppedUrl);
            setTempCropImage(null);
          }}
        />
      )}
      <div
        className={`w-full max-w-md rounded-3xl border p-7 shadow-2xl transition-colors ${
          isLight ? 'bg-white border-gray-200 text-gray-900' : 'bg-[#121217] border-white/20 text-white'
        }`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between border-b pb-4 ${isLight ? 'border-gray-200' : 'border-white/10'}`}>
          <div className="flex items-center gap-2.5">
            <UserIcon className="h-5 w-5 text-current/70" />
            <div>
              <h2 className="text-base font-bold">User Profile</h2>
              <p className="text-xs opacity-60">Manage your identity and contact details</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-full p-2 transition-colors ${
              isLight ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Profile Avatar & Tier Banner */}
        <div className="mt-5 flex items-center gap-4">
          <div className="relative">
            {avatar ? (
              <img
                src={avatar}
                alt="Profile"
                className="h-20 w-20 rounded-full object-cover border-2 border-[#e5373f] shadow-md"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#e5373f] text-2xl font-bold text-white shadow-md">
                {name ? name[0].toUpperCase() : <UserIcon className="h-8 w-8 text-white" />}
              </div>
            )}
            <input
              ref={avatarFileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleAvatarSelected}
            />
            <button
              type="button"
              onClick={() => avatarFileRef.current?.click()}
              className="absolute bottom-0 right-0 rounded-full bg-[#e5373f] p-2 text-white shadow hover:bg-[#d42d35]"
              title="Change Profile Picture (Crop & Adjust)"
            >
              <Camera className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold truncate">{name || 'Studio Member'}</h3>
            <p className="text-xs opacity-60 truncate">{user.email}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <span className={`rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase border ${
                isLight ? 'bg-amber-100 text-amber-950 border-amber-300' : 'bg-amber-500/15 border-amber-500/30 text-amber-500'
              }`}>
                {user.credits} credits
              </span>
              <span className="rounded-full bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 text-[9px] font-bold text-purple-500 uppercase">
                {user.tier || 'Free'} Tier
              </span>
            </div>
          </div>
        </div>

        {/* Inputs Form */}
        <div className="mt-5 space-y-3.5 text-xs">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider opacity-60 mb-1">
              Full Name (Editable)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ravi Jaatshab"
              className={`w-full rounded-xl border p-2.5 focus:outline-none transition-colors ${
                isLight
                  ? 'border-gray-300 bg-gray-50 text-gray-900 focus:bg-white focus:border-gray-500'
                  : 'border-white/10 bg-black/50 text-white focus:border-white/40'
              }`}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider opacity-60 mb-1">
              Email Address (Account Identity &middot; Read Only)
            </label>
            <input
              type="email"
              value={user.email}
              disabled
              className={`w-full rounded-xl border p-2.5 opacity-60 cursor-not-allowed ${
                isLight ? 'border-gray-200 bg-gray-100 text-gray-600' : 'border-white/5 bg-black/20 text-white/50'
              }`}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider opacity-60 mb-1">
              10-Digit Mobile / Phone Number (Editable)
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs opacity-50">+91</span>
              <input
                type="tel"
                maxLength={10}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="9876543210"
                className={`w-full rounded-xl border p-2.5 pl-12 focus:outline-none transition-colors ${
                  isLight
                    ? 'border-gray-300 bg-gray-50 text-gray-900 focus:bg-white focus:border-gray-500'
                    : 'border-white/10 bg-black/50 text-white focus:border-white/40'
                }`}
              />
            </div>
            <p className="mt-1 text-[10px] opacity-40">Enter 10 numeric digits for studio updates and alerts.</p>
          </div>
        </div>

        {error && (
          <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-500">
            {error}
          </p>
        )}
        {success && (
          <p className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-500">
            {success}
          </p>
        )}

        <div className={`mt-6 flex items-center justify-end gap-3 border-t pt-4 ${isLight ? 'border-gray-200' : 'border-white/10'}`}>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-5 py-2 text-xs opacity-60 hover:opacity-100"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-full bg-[#e5373f] px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#d42d35] disabled:opacity-50 transition-colors shadow-md"
          >
            {saving ? 'Saving Profile…' : 'Save Profile'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
   My Sets panel — Production Archive & Generated Media Gallery
   ---------------------------------------------------------------- */
function MySetsPanel({
  uploadSets,
  loadingSets,
  generations,
  loadingGenerations,
  setError,
  onUseSet,
  refreshSets,
  refreshGenerations,
  onDeleteGeneration,
  isLight,
}: {
  uploadSets: UploadSet[];
  loadingSets: boolean;
  generations: UserGeneration[];
  loadingGenerations: boolean;
  setError: (msg: string) => void;
  onUseSet: (set: UploadSet) => void;
  refreshSets: () => void;
  refreshGenerations: () => void;
  onDeleteGeneration: (id: string) => void;
  isLight: boolean;
}) {
  const [filter, setFilter] = useState<'all' | 'images' | 'videos' | 'sets'>('all');
  const [showInstructions, setShowInstructions] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [pendingCloth, setPendingCloth] = useState<{ file: File; preview: string } | null>(null);
  const [pendingModel, setPendingModel] = useState<{ file: File; preview: string } | null>(null);
  const [confirming, setConfirming] = useState<{ kind: 'cloth' | 'model'; file: File; preview: string } | null>(null);
  const [setPromptText, setSetPromptText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [deletingSetId, setDeletingSetId] = useState('');
  const [deletingGenId, setDeletingGenId] = useState('');

  const clothRef = useRef<HTMLInputElement>(null);
  const modelRef = useRef<HTMLInputElement>(null);

  const imageGenerations = generations.filter((g) => g.type === 'image');
  const videoGenerations = generations.filter((g) => g.type === 'video');

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>, kind: 'cloth' | 'model') {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = () => {
      setConfirming({ kind, file, preview: String(reader.result) });
    };
    reader.readAsDataURL(file);
  }

  function confirmImage() {
    if (!confirming) return;
    if (confirming.kind === 'cloth') setPendingCloth({ file: confirming.file, preview: confirming.preview });
    else setPendingModel({ file: confirming.file, preview: confirming.preview });
    setConfirming(null);
  }

  async function saveSet() {
    if (!pendingCloth && !pendingModel) {
      setSaveError('Please upload at least one image (garment or model).');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const clothDataUrl = pendingCloth ? await fileToDataUrl(pendingCloth.file) : undefined;
      const modelDataUrl = pendingModel ? await fileToDataUrl(pendingModel.file) : undefined;

      await api.createUploadSet({
        clothDataUrl,
        clothName: pendingCloth?.file.name,
        modelDataUrl,
        modelName: pendingModel?.file.name,
        prompt: setPromptText.trim(),
      });

      setPendingCloth(null);
      setPendingModel(null);
      setSetPromptText('');
      setFormOpen(false);
      refreshSets();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function deleteSet(id: string) {
    if (!confirm('Are you sure you want to delete this saved outfit set?')) return;
    setDeletingSetId(id);
    try {
      await api.deleteUploadSet(id);
      refreshSets();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeletingSetId('');
    }
  }

  async function handleDeleteGen(id: string) {
    if (!confirm('Are you sure you want to delete this generation from your archive?')) return;
    setDeletingGenId(id);
    try {
      await api.deleteUserGeneration(id);
      onDeleteGeneration(id);
      refreshGenerations();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete item');
    } finally {
      setDeletingGenId('');
    }
  }

  const totalCount = generations.length + uploadSets.length;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      {showInstructions && <InstructionPopup onGotIt={() => { setShowInstructions(false); setFormOpen(true); }} />}
      {confirming && (
        <ImageConfirmPopup
          preview={confirming.preview}
          kind={confirming.kind}
          onConfirm={confirmImage}
          onCancel={() => setConfirming(null)}
        />
      )}

      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-6 border-white/10">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight">My Sets & Production Archive</h1>
            <span className="rounded-full bg-[#e5373f]/20 border border-[#e5373f]/40 px-2.5 py-0.5 text-[10px] font-bold text-[#ff9aa0]">
              {totalCount} Total Items
            </span>
          </div>
          <p className={`mt-1 text-xs ${isLight ? 'text-gray-500' : 'text-white/50'}`}>
            All previous generated images, 1080p fashion videos, and custom saved sets are permanently preserved here.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => { refreshSets(); refreshGenerations(); }}
            className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-semibold transition ${
              isLight ? 'border-gray-300 hover:bg-gray-100 text-gray-700' : 'border-white/15 hover:bg-white/10 text-white/70'
            }`}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (!formOpen && uploadSets.length === 0) setShowInstructions(true);
              else setFormOpen(!formOpen);
            }}
            className="rounded-full bg-[#e5373f] px-5 py-2 text-xs font-semibold uppercase tracking-wider text-white hover:bg-[#d42d35] transition shadow-md"
          >
            {formOpen ? 'Close form' : '+ New wardrobe set'}
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="mt-6 flex flex-wrap items-center gap-2 border-b pb-4 border-white/10">
        {[
          { id: 'all', label: `All archive (${totalCount})` },
          { id: 'images', label: `Images (${imageGenerations.length})` },
          { id: 'videos', label: `Videos (${videoGenerations.length})` },
          { id: 'sets', label: `Saved outfits (${uploadSets.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id as typeof filter)}
            className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all ${
              filter === tab.id
                ? 'bg-[#e5373f] text-white shadow-md'
                : isLight
                  ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {formOpen && (
        <div className={`mt-6 rounded-3xl border p-6 backdrop-blur-md ${isLight ? 'border-gray-200 bg-white shadow-md' : 'border-white/15 bg-white/[0.03]'}`}>
          <h3 className={`text-xs font-semibold uppercase tracking-wider ${isLight ? 'text-gray-700' : 'text-white/60'}`}>
            Save pair to permanent archive
          </h3>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className={`text-[11px] font-semibold uppercase tracking-wider mb-1 ${isLight ? 'text-gray-500' : 'text-white/40'}`}>1 &middot; Garment Image</p>
              <input ref={clothRef} type="file" accept="image/*,.png,.jpg,.jpeg,.webp" className="hidden" onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} onChange={(e) => handleFileSelected(e, 'cloth')} />
              <button
                type="button"
                onClick={() => clothRef.current?.click()}
                className={`flex aspect-[4/3] w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed p-4 text-center transition ${
                  isLight ? 'border-gray-300 bg-gray-50 hover:border-gray-400' : 'border-white/20 bg-black/40 hover:border-white/40'
                }`}
              >
                {pendingCloth ? (
                  <img src={pendingCloth.preview} alt="Garment" className="h-full w-auto object-contain" />
                ) : (
                  <>
                    <Layers className="h-6 w-6 mb-1 text-current/40" />
                    <span className={`text-xs font-semibold ${isLight ? 'text-gray-900' : 'text-white'}`}>Select garment image</span>
                    <span className={`text-[10px] mt-0.5 ${isLight ? 'text-gray-500' : 'text-white/35'}`}>Click to preview and confirm</span>
                  </>
                )}
              </button>
            </div>

            <div>
              <p className={`text-[11px] font-semibold uppercase tracking-wider mb-1 ${isLight ? 'text-gray-500' : 'text-white/40'}`}>2 &middot; Model Image</p>
              <input ref={modelRef} type="file" accept="image/*,.png,.jpg,.jpeg,.webp" className="hidden" onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} onChange={(e) => handleFileSelected(e, 'model')} />
              <button
                type="button"
                onClick={() => modelRef.current?.click()}
                className={`flex aspect-[4/3] w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed p-4 text-center transition ${
                  isLight ? 'border-gray-300 bg-gray-50 hover:border-gray-400' : 'border-white/20 bg-black/40 hover:border-white/40'
                }`}
              >
                {pendingModel ? (
                  <img src={pendingModel.preview} alt="Model" className="h-full w-auto object-contain" />
                ) : (
                  <>
                    <UserIcon className="h-6 w-6 mb-1 text-current/40" />
                    <span className={`text-xs font-semibold ${isLight ? 'text-gray-900' : 'text-white'}`}>Select model image</span>
                    <span className={`text-[10px] mt-0.5 ${isLight ? 'text-gray-500' : 'text-white/35'}`}>Click to preview and confirm</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="mt-4">
            <label className={`text-[11px] font-semibold uppercase tracking-wider ${isLight ? 'text-gray-600' : 'text-white/40'}`}>Custom Prompt / Instructions</label>
            <input
              type="text"
              value={setPromptText}
              onChange={(e) => setSetPromptText(e.target.value)}
              placeholder="e.g. Athletic runner pose, high stadium contrast lighting"
              className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-xs focus:outline-none ${
                isLight ? 'border-gray-300 bg-gray-50 text-gray-900 focus:bg-white' : 'border-white/10 bg-black/50 text-white focus:border-white/40'
              }`}
            />
          </div>

          {saveError && <p className="mt-3 text-xs text-red-500 font-semibold">{saveError}</p>}

          <div className="mt-5 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className={`rounded-full px-4 py-2 text-xs ${isLight ? 'text-gray-500' : 'text-white/50'}`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void saveSet()}
              disabled={saving}
              className="rounded-full bg-[#e5373f] px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#d42d35] disabled:opacity-50 shadow-md"
            >
              {saving ? 'Saving Set…' : 'Save Set to Cloud'}
            </button>
          </div>
        </div>
      )}

      {/* Main Grid */}
      {loadingSets || loadingGenerations ? (
        <div className="py-24 text-center text-sm opacity-50">Loading archive media…</div>
      ) : (
        <div className="mt-8 space-y-10">
          {/* Section A: Generated Videos */}
          {(filter === 'all' || filter === 'videos') && videoGenerations.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Film className="h-4 w-4 text-current/70" />
                <h3 className="text-xs font-semibold uppercase tracking-wider">Generated fashion videos ({videoGenerations.length})</h3>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {videoGenerations.map((gen) => (
                  <div
                    key={gen.id}
                    className={`flex flex-col justify-between rounded-2xl border p-4 shadow-sm transition-all ${
                      isLight ? 'border-gray-200 bg-white' : 'border-white/10 bg-black/50'
                    }`}
                  >
                    <div>
                      <div className="relative rounded-xl overflow-hidden bg-black/80 aspect-[9/16] max-h-80 mx-auto">
                        <video src={gen.url} controls loop playsInline className="h-full w-full object-cover" />
                      </div>
                      <div className="mt-3 flex items-center justify-between text-[10px] opacity-60">
                        <span className="font-mono">{new Date(gen.createdAt).toLocaleDateString()}</span>
                        <span className={`font-semibold ${isLight ? 'text-amber-950 font-bold' : 'text-amber-400'}`}>{gen.duration || 5}s &middot; {gen.aspectRatio || '9:16'}</span>
                      </div>
                      {gen.prompt && (
                        <p className={`mt-2 text-xs line-clamp-2 ${isLight ? 'text-gray-600' : 'text-white/60'}`}>
                          "{gen.prompt}"
                        </p>
                      )}
                    </div>

                    <div className="mt-4 flex items-center gap-2 pt-3 border-t border-white/5">
                      <a
                        href={gen.highResUrl || gen.url}
                        download={`shivnaresh-video-${gen.id.slice(0, 6)}.mp4`}
                        className="flex-1 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-center py-2 text-xs font-semibold transition"
                      >
                        Download
                      </a>
                      <button
                        type="button"
                        onClick={() => window.open(gen.highResUrl || gen.url, '_blank')}
                        className={`rounded-full border p-2 text-xs transition ${
                          isLight ? 'border-gray-300 text-gray-700 hover:bg-gray-100' : 'border-white/15 text-white hover:bg-white/10'
                        }`}
                        title="Open full video in new tab"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteGen(gen.id)}
                        disabled={deletingGenId === gen.id}
                        className="rounded-full border border-red-500/30 p-2 text-xs text-red-400 hover:bg-red-500/10 transition"
                        title="Delete video"
                      >
                        {deletingGenId === gen.id ? '…' : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section B: Generated Images */}
          {(filter === 'all' || filter === 'images') && imageGenerations.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Camera className="h-4 w-4 text-current/70" />
                <h3 className="text-xs font-semibold uppercase tracking-wider">Generated studio images ({imageGenerations.length})</h3>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {imageGenerations.map((gen) => (
                  <div
                    key={gen.id}
                    className={`flex flex-col justify-between rounded-2xl border p-4 shadow-sm transition-all ${
                      isLight ? 'border-gray-200 bg-white' : 'border-white/10 bg-black/50'
                    }`}
                  >
                    <div>
                      <div
                        className="relative rounded-xl overflow-hidden bg-black/60 aspect-[3/4] cursor-pointer group"
                        onClick={() => window.open(gen.highResUrl || gen.url, '_blank')}
                      >
                        <img src={gen.url} alt="" className="h-full w-full object-cover" />
                        <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-white uppercase tracking-wider">
                          {gen.resolution || '1K'}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-[10px] opacity-60">
                        <span className="font-mono">{new Date(gen.createdAt).toLocaleDateString()}</span>
                        {gen.color && (
                          <span className="flex items-center gap-1 font-medium text-emerald-400">
                            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: gen.color }} />
                            <span>{gen.colorName || gen.color}</span>
                          </span>
                        )}
                      </div>
                      {gen.prompt && (
                        <p className={`mt-2 text-xs line-clamp-2 ${isLight ? 'text-gray-600' : 'text-white/60'}`}>
                          "{gen.prompt}"
                        </p>
                      )}
                    </div>

                    <div className="mt-4 flex items-center gap-1.5 pt-3 border-t border-white/5">
                      <a
                        href={gen.highResUrl || gen.url}
                        download={`shivnaresh-studio-${gen.id.slice(0, 6)}.png`}
                        className="flex-1 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-center py-2 text-xs font-semibold transition"
                      >
                        Download
                      </a>
                      <button
                        type="button"
                        onClick={() => window.open(gen.highResUrl || gen.url, '_blank')}
                        className={`rounded-full border p-2 text-xs transition ${
                          isLight ? 'border-gray-300 text-gray-700 hover:bg-gray-100' : 'border-white/15 text-white hover:bg-white/10'
                        }`}
                        title="Open full image in new tab"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteGen(gen.id)}
                        disabled={deletingGenId === gen.id}
                        className="rounded-full border border-red-500/30 p-2 text-xs text-red-400 hover:bg-red-500/10 transition"
                        title="Delete image"
                      >
                        {deletingGenId === gen.id ? '…' : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section C: Saved Outfits / Sets */}
          {(filter === 'all' || filter === 'sets') && uploadSets.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Folder className="h-4 w-4 text-current/70" />
                <h3 className="text-xs font-semibold uppercase tracking-wider">Saved outfit sets ({uploadSets.length})</h3>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {uploadSets.map((set) => (
                  <div
                    key={set.id}
                    className={`flex flex-col justify-between rounded-2xl border p-5 shadow-sm ${
                      isLight ? 'border-gray-200 bg-white' : 'border-white/10 bg-black/50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="rounded-full bg-[#e5373f]/20 border border-[#e5373f]/40 px-3 py-0.5 text-xs font-semibold text-[#ff9aa0]">
                          Set {set.setNumber}
                        </span>
                        <span className="text-[10px] opacity-40 font-mono">
                          {new Date(set.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="overflow-hidden rounded-xl bg-black/40">
                          {set.clothUrl ? (
                            <img src={set.clothUrl} alt="Garment" className="aspect-[3/4] w-full object-cover" />
                          ) : (
                            <div className="flex aspect-[3/4] w-full items-center justify-center text-xl opacity-20">
                              <Layers className="h-5 w-5" />
                            </div>
                          )}
                          <p className="text-center text-[9px] opacity-50 py-1 truncate px-1">{set.clothName || 'Garment'}</p>
                        </div>

                        <div className="overflow-hidden rounded-xl bg-black/40">
                          {set.modelUrl ? (
                            <img src={set.modelUrl} alt="Model" className="aspect-[3/4] w-full object-cover" />
                          ) : (
                            <div className="flex aspect-[3/4] w-full items-center justify-center text-xl opacity-20">
                              <UserIcon className="h-5 w-5" />
                            </div>
                          )}
                          <p className="text-center text-[9px] opacity-50 py-1 truncate px-1">{set.modelName || 'Model'}</p>
                        </div>
                      </div>

                      {set.prompt && (
                        <p className={`mt-3 rounded-xl p-2 text-[10px] line-clamp-2 ${isLight ? 'bg-gray-100 text-gray-700' : 'bg-white/5 text-white/60'}`}>
                          "{set.prompt}"
                        </p>
                      )}
                    </div>

                    <div className="mt-5 flex gap-2 border-t border-white/5 pt-3">
                      <button
                        type="button"
                        onClick={() => onUseSet(set)}
                        className="flex-1 rounded-full bg-[#e5373f] hover:bg-[#d42d35] text-white py-2 text-xs font-semibold uppercase tracking-wider transition shadow-sm"
                      >
                        Use in studio
                      </button>
                      <button
                        type="button"
                        onClick={() => window.open(set.clothUrl || set.modelUrl, '_blank')}
                        className={`rounded-full border p-2 text-xs transition ${
                          isLight ? 'border-gray-300 text-gray-700 hover:bg-gray-100' : 'border-white/15 text-white hover:bg-white/10'
                        }`}
                        title="Open images in new tab"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteSet(set.id)}
                        disabled={deletingSetId === set.id}
                        className="rounded-full border border-red-500/20 p-2 text-xs text-red-400 hover:bg-red-500/10 transition"
                      >
                        {deletingSetId === set.id ? '…' : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state if nothing matches filter */}
          {totalCount === 0 && (
            <div className={`rounded-2xl border p-12 text-center ${isLight ? 'border-gray-200 bg-white' : 'border-white/10 bg-white/[0.01]'}`}>
              <Layers className="h-8 w-8 mx-auto mb-2 text-current/30" />
              <p className="text-sm font-semibold">Your wardrobe archive is empty.</p>
              <p className="text-xs opacity-50 mt-1 max-w-sm mx-auto">
                Generate images and fashion videos in the studio or click "+ New wardrobe set" above to store your first combination.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------
   Custom Requests Tab Component (24-48h SLA & Admin Replies)
   ---------------------------------------------------------------- */
function CustomRequestsPanel({
  requests,
  loading,
  onRefresh,
  creditsLocked,
  customRequestsLocked,
  isLight = false,
}: {
  requests: CustomRequest[];
  loading: boolean;
  onRefresh: () => void;
  creditsLocked?: boolean;
  customRequestsLocked?: boolean;
  isLight?: boolean;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [pendingClothes, setPendingClothes] = useState<Array<{ file: File; preview: string; name: string }>>([]);
  const [pendingModels, setPendingModels] = useState<Array<{ file: File; preview: string; name: string }>>([]);
  const [garmentColor, setGarmentColor] = useState('');
  const [requestType, setRequestType] = useState<'stills' | 'video' | 'both'>('stills');
  const [confirming, setConfirming] = useState<{ kind: 'cloth' | 'model'; file: File; preview: string } | null>(null);
  const [promptText, setPromptText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  const clothRef = useRef<HTMLInputElement>(null);
  const multiModelRef = useRef<HTMLInputElement>(null);

  function handleClothSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = '';
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setPendingClothes((prev) => [
          ...prev,
          { file, preview: String(reader.result), name: file.name },
        ]);
      };
      reader.readAsDataURL(file);
    });
  }

  function handleModelSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = '';
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setPendingModels((prev) => [
          ...prev,
          { file, preview: String(reader.result), name: file.name },
        ]);
      };
      reader.readAsDataURL(file);
    });
  }

  function confirmImage() {
    if (!confirming) return;
    if (confirming.kind === 'cloth') {
      setPendingClothes((prev) => [
        ...prev,
        { file: confirming.file, preview: confirming.preview, name: confirming.file.name },
      ]);
    } else {
      setPendingModels((prev) => [
        ...prev,
        { file: confirming.file, preview: confirming.preview, name: confirming.file.name },
      ]);
    }
    setConfirming(null);
  }

  function removeCloth(index: number) {
    setPendingClothes((prev) => prev.filter((_, i) => i !== index));
  }

  function removeModel(index: number) {
    setPendingModels((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmitRequest() {
    if (creditsLocked) {
      setError('Your account credits are locked by an administrator. Custom order creation is disabled.');
      return;
    }
    if (pendingClothes.length === 0 && pendingModels.length === 0 && !promptText.trim()) {
      setError('Please provide at least a garment image, at least one model pose, or design instructions.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const clothImages: string[] = [];
      for (const c of pendingClothes) {
        clothImages.push(await fileToDataUrl(c.file));
      }
      const modelImages: string[] = [];
      for (const m of pendingModels) {
        modelImages.push(await fileToDataUrl(m.file));
      }

      await api.createCustomRequest({
        cloth: clothImages[0] || undefined,
        clothName: pendingClothes[0]?.name || undefined,
        clothImages: clothImages.length > 0 ? clothImages : undefined,
        model: modelImages[0] || undefined,
        modelName: pendingModels[0]?.name || undefined,
        modelImages: modelImages.length > 0 ? modelImages : undefined,
        color: garmentColor.trim() || undefined,
        requestType,
        prompt: promptText.trim(),
      });

      setPendingClothes([]);
      setPendingModels([]);
      setGarmentColor('');
      setRequestType('stills');
      setPromptText('');
      setFormOpen(false);
      setShowSuccessPopup(true);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      {lightboxImg && (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md"
          onClick={() => setLightboxImg(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]">
            <img src={lightboxImg} alt="Preview" className="max-h-[85vh] max-w-[85vw] rounded-2xl object-contain shadow-2xl" />
            <button
              type="button"
              onClick={() => setLightboxImg(null)}
              className="absolute -top-3 -right-3 h-8 w-8 rounded-full bg-white text-black flex items-center justify-center font-bold shadow-lg"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {showSuccessPopup && <RequestSubmittedPopup onClose={() => setShowSuccessPopup(false)} />}
      {confirming && (
        <ImageConfirmPopup
          preview={confirming.preview}
          kind={confirming.kind}
          onConfirm={confirmImage}
          onCancel={() => setConfirming(null)}
        />
      )}

      {/* Header */}
      <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-6 ${isLight ? 'border-gray-200' : 'border-white/10'}`}>
        <div>
          <div className="flex items-center gap-2">
            <h1 className={`text-2xl font-bold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>Bespoke Custom Requests</h1>
            <span className="rounded-full bg-[#e5373f]/20 border border-[#e5373f]/40 px-2.5 py-0.5 text-[9px] font-bold text-[#e5373f] uppercase tracking-wider">
              24–48h Delivery Guarantee
            </span>
          </div>
          <p className={`mt-1 text-xs ${isLight ? 'text-slate-800' : 'text-white/50'}`}>
            Submit complex athletic team kits, custom embroidery, or up to 5 model poses directly to our master designers.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onRefresh}
            className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
              isLight ? 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50' : 'border-white/15 text-white/60 hover:text-white'
            }`}
          >
            Refresh
          </button>
          <button
            type="button"
            disabled={customRequestsLocked}
            onClick={() => setFormOpen(!formOpen)}
            className="rounded-full bg-[#e5373f] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#d42d35] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {formOpen ? 'Cancel' : '+ New Custom Request'}
          </button>
        </div>
      </div>

      {/* Plan Upgrade Lock Banner if Custom Requests Locked by Admin */}
      {customRequestsLocked && (
        <div className={`mt-6 rounded-3xl border p-7 backdrop-blur-md text-center ${
          isLight ? 'border-amber-400 bg-amber-100 text-amber-900' : 'border-amber-500/40 bg-amber-500/10'
        }`}>
          <Lock className="h-8 w-8 mx-auto mb-3 text-amber-500" />
          <h3 className={`text-base font-semibold ${isLight ? 'text-amber-900' : 'text-amber-300'}`}>Bespoke custom orders locked</h3>
          <p className={`mt-2 text-xs max-w-lg mx-auto leading-relaxed ${isLight ? 'text-amber-800' : 'text-amber-200/80'}`}>
            Direct custom requests to our master tailors are available on Pro and Ultra plans or accounts enabled by the administrator. Upgrade your plan to access bespoke team kits, embroidery, and custom 5-pose photoshoots.
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <a
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-full bg-[#e5373f] px-6 py-2.5 text-xs font-semibold uppercase tracking-wider text-white hover:bg-[#d42d35] shadow-sm transition"
            >
              View pricing and plans
            </a>
          </div>
        </div>
      )}

      {/* Submission Form */}
      {formOpen && (
        <div className={`mt-6 rounded-3xl border p-7 shadow-lg backdrop-blur-md ${
          isLight ? 'border-gray-200 bg-white text-gray-900 shadow-sm' : 'border-white/15 bg-white/[0.03]'
        }`}>
          <div className="flex items-center justify-between">
            <h3 className={`text-sm font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>Submit design request to studio tailors</h3>
            <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-3 py-1 text-[10px] font-semibold text-emerald-800">
              Ultra Plan: Included with membership
            </span>
          </div>
          <p className={`text-xs mt-1 ${isLight ? 'text-slate-800' : 'text-white/50'}`}>
            Our team will craft your bespoke model renders and return them directly to this dashboard within 24–48 hours.
          </p>

          {/* Request Type Selector */}
          <div className="mt-5">
            <p className={`text-[11px] font-medium uppercase tracking-wider mb-2 ${isLight ? 'text-slate-900' : 'text-white/40'}`}>Delivery Output Type</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'stills', label: '2K Stills (up to 5 poses)', sub: 'High-res multi-angle renders' },
                { id: 'video', label: '1080p Video (5–10s)', sub: 'Cinematic runway motion video' },
                { id: 'both', label: 'Complete Suite (Stills + Video)', sub: 'Full catalog production pack' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setRequestType(t.id as 'stills' | 'video' | 'both')}
                  className={`rounded-2xl border p-3 text-left transition-all ${
                    requestType === t.id
                      ? 'border-[#e5373f] bg-[#e5373f]/15 ring-1 ring-[#e5373f]'
                      : isLight
                        ? 'border-gray-300 bg-gray-50/70 hover:bg-gray-100 hover:border-gray-400'
                        : 'border-white/10 bg-black/40 hover:border-white/20'
                  }`}
                >
                  <p className={`text-xs font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{t.label}</p>
                  <p className={`text-[10px] mt-0.5 ${isLight ? 'text-slate-700' : 'text-white/40'}`}>{t.sub}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {/* Garment Upload & Color */}
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className={`text-[11px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-900' : 'text-white/40'}`}>
                    Garment Assets ({pendingClothes.length} Uploaded)
                  </p>
                  <button
                    type="button"
                    onClick={() => clothRef.current?.click()}
                    className="text-[11px] font-bold text-[#e5373f] hover:underline"
                  >
                    + Add Garment {pendingClothes.length + 1}
                  </button>
                </div>
                <input
                  ref={clothRef}
                  type="file"
                  multiple
                  accept="image/*,.png,.jpg,.jpeg,.webp"
                  className="hidden"
                  onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
                  onChange={handleClothSelected}
                />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {pendingClothes.map((c, idx) => (
                    <div key={idx} className={`group relative aspect-[3/4] overflow-hidden rounded-xl border ${
                      isLight ? 'border-gray-200 bg-gray-50' : 'border-white/20 bg-black/60'
                    }`}>
                      <img src={c.preview} alt={`Garment ${idx + 1}`} className="h-full w-full object-cover" />
                      <span className="absolute top-1 left-1 rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-bold text-white">
                        Garment {idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeCloth(idx)}
                        className="absolute top-1 right-1 rounded-full bg-red-600/90 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove garment"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => clothRef.current?.click()}
                    className={`flex aspect-[3/4] flex-col items-center justify-center rounded-xl border border-dashed p-2 text-center transition-colors ${
                      isLight
                        ? 'border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400'
                        : 'border-white/20 bg-black/30 hover:border-white/40 hover:bg-black/50'
                    }`}
                  >
                    <span className={`text-xl mb-1 ${isLight ? 'text-slate-800' : 'text-white/40'}`}>+</span>
                    <span className={`text-[10px] font-semibold ${isLight ? 'text-slate-900' : 'text-white/70'}`}>
                      {pendingClothes.length === 0 ? 'Upload Garments' : `Add Garment ${pendingClothes.length + 1}`}
                    </span>
                    <span className={`text-[9px] ${isLight ? 'text-slate-700' : 'text-white/30'}`}>Select 3-4 or any number</span>
                  </button>
                </div>
              </div>

              {/* Fabric Color Input */}
              <div className={`rounded-2xl border p-3 ${isLight ? 'border-gray-200 bg-gray-50' : 'border-white/10 bg-black/40'}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-medium uppercase tracking-wider ${isLight ? 'text-slate-900' : 'text-white/60'}`}>
                    Fabric Color / Dye Code
                  </span>
                  {garmentColor && (
                    <button type="button" onClick={() => setGarmentColor('')} className="text-[10px] text-red-500 font-bold hover:underline">
                      Clear
                    </button>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="color"
                    value={garmentColor.startsWith('#') && garmentColor.length === 7 ? garmentColor : '#e5373f'}
                    onChange={(e) => setGarmentColor(e.target.value)}
                    className="h-7 w-7 cursor-pointer rounded-lg border-0 bg-transparent p-0"
                  />
                  <input
                    type="text"
                    value={garmentColor}
                    onChange={(e) => setGarmentColor(e.target.value)}
                    placeholder="e.g. #E5373F or Crimson Red, Deep Navy..."
                    className={`flex-1 rounded-lg border px-2.5 py-1 text-xs focus:outline-none ${
                      isLight
                        ? 'border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:border-[#e5373f]'
                        : 'border-white/10 bg-black/50 text-white placeholder:text-white/30'
                    }`}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {['#E5373F', '#0A192F', '#111111', '#FFFFFF', '#1D4ED8', '#84CC16', '#EAB308'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setGarmentColor(c)}
                      className="h-5 w-5 rounded-full border border-black/20 hover:ring-2 hover:ring-offset-1 hover:ring-slate-400 transition-all"
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Target Photoshoot (1 Photoshoot = 5 Poses) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className={`text-[11px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-900' : 'text-white/40'}`}>
                  Photoshoot Poses ({pendingModels.length} Uploaded · 1 Photoshoot = 5 Poses)
                </p>
                <button
                  type="button"
                  onClick={() => multiModelRef.current?.click()}
                  className="text-[11px] font-bold text-[#e5373f] hover:underline"
                >
                  + Add Pose {pendingModels.length + 1}
                </button>
              </div>
              <input
                ref={multiModelRef}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleModelSelected}
              />

              <div className="grid grid-cols-3 gap-2">
                {pendingModels.map((m, idx) => (
                  <div key={idx} className={`group relative aspect-[3/4] overflow-hidden rounded-xl border ${
                    isLight ? 'border-gray-200 bg-gray-50' : 'border-white/20 bg-black/60'
                  }`}>
                    <img src={m.preview} alt={`Pose ${idx + 1}`} className="h-full w-full object-cover" />
                    <span className="absolute top-1 left-1 rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-bold text-white">
                      Pose {idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeModel(idx)}
                      className="absolute top-1 right-1 rounded-full bg-red-600/90 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove pose"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => multiModelRef.current?.click()}
                  className={`flex aspect-[3/4] flex-col items-center justify-center rounded-xl border border-dashed p-2 text-center transition-colors ${
                    isLight
                      ? 'border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400'
                      : 'border-white/20 bg-black/30 hover:border-white/40 hover:bg-black/50'
                  }`}
                >
                  <span className={`text-xl mb-1 ${isLight ? 'text-slate-800' : 'text-white/40'}`}>+</span>
                  <span className={`text-[10px] font-semibold ${isLight ? 'text-slate-900' : 'text-white/70'}`}>Add Pose {pendingModels.length + 1}</span>
                  <span className={`text-[9px] ${isLight ? 'text-slate-700' : 'text-white/30'}`}>Upload any angle</span>
                </button>
              </div>
              <p className={`mt-2 text-[10px] ${isLight ? 'text-slate-700' : 'text-white/40'}`}>
                Upload any number of model images (front, 3/4 angle, profile side, back view, action shots).
              </p>
            </div>
          </div>

          <div className="mt-5">
            <label className={`text-[11px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-900' : 'text-white/40'}`}>
              Detailed Tailoring Notes & Instructions
            </label>
            <textarea
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              rows={3}
              placeholder="e.g. Ensure the athletic logo sits precisely 2 inches below the collar. We need athletic poses with dynamic running motion. Keep jersey color exact."
              className={`mt-2 w-full rounded-2xl border p-3.5 text-xs focus:outline-none ${
                isLight
                  ? 'border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:border-[#e5373f]'
                  : 'border-white/10 bg-black/50 text-white placeholder:text-white/25 focus:border-white/40'
              }`}
            />
          </div>

          {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-full px-5 py-2 text-xs text-white/50 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSubmitRequest()}
              disabled={submitting}
              className="rounded-full bg-[#e5373f] px-7 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#d42d35] disabled:opacity-50"
            >
              {submitting ? 'Submitting to Studio…' : 'Submit for 24–48h Delivery'}
            </button>
          </div>
        </div>
      )}

      {/* Requests History List */}
      {loading ? (
        <div className={`py-20 text-center text-sm ${isLight ? 'text-slate-800' : 'text-white/40'}`}>Loading custom orders…</div>
      ) : requests.length === 0 ? (
        <div className={`mt-12 rounded-3xl border p-12 text-center ${
          isLight ? 'border-gray-200 bg-white text-gray-900 shadow-sm' : 'border-white/10 bg-white/[0.01]'
        }`}>
          <p className={`text-sm ${isLight ? 'text-slate-900 font-medium' : 'text-white/40'}`}>No custom studio orders yet. Click "+ New Custom Request" above.</p>
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {requests.map((req) => (
            <div
              key={req.id}
              className={`rounded-3xl border p-6 backdrop-blur-sm shadow-md ${
                isLight ? 'border-gray-200 bg-white text-gray-900 shadow-sm' : 'border-white/10 bg-white/[0.02]'
              }`}
            >
              {/* Status Header */}
              <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b pb-4 ${
                isLight ? 'border-[#78a48b]' : 'border-white/5'
              }`}>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                      req.status === 'delivered'
                        ? isLight ? 'bg-emerald-100 text-emerald-950 border border-emerald-300' : 'bg-emerald-950 text-emerald-300 border border-emerald-800/40'
                        : req.status === 'in_progress'
                          ? isLight ? 'bg-blue-100 text-blue-950 border border-blue-300' : 'bg-blue-950 text-blue-300 border border-blue-800/40'
                          : isLight ? 'bg-amber-100 text-amber-950 border border-amber-300' : 'bg-amber-950 text-amber-300 border border-amber-800/40'
                    }`}
                  >
                    {req.status === 'delivered'
                      ? 'Delivered'
                      : req.status === 'in_progress'
                        ? 'In progress'
                        : 'Queued'}
                  </span>
                  <span className={`text-xs ${isLight ? 'text-slate-800' : 'text-white/40'}`}>
                    Ordered {new Date(req.createdAt).toLocaleDateString()}
                  </span>
                  {req.requestType && (
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] uppercase font-semibold ${
                      isLight ? 'bg-[#78a48b] border border-[#6b997e] text-slate-900' : 'bg-white/5 border border-white/10 text-white/70'
                    }`}>
                      {req.requestType === 'both' ? 'Stills + Video' : req.requestType === 'video' ? 'Video' : '2K Stills'}
                    </span>
                  )}
                  {req.color && (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono ${
                      isLight ? 'bg-[#78a48b] border border-[#6b997e] text-slate-900' : 'bg-white/5 border border-white/10 text-white/70'
                    }`}>
                      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: req.color }} />
                      {req.color}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {Date.now() - new Date(req.createdAt).getTime() <= 60 * 60 * 1000 && req.status !== 'delivered' && (
                    <div className="inline-flex items-center gap-1.5">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                        isLight ? 'bg-amber-100 text-amber-950 border-amber-300' : 'text-amber-500 bg-amber-500/10 border-amber-500/30'
                      }`}>
                        1h edit window
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm('Cancel and delete this custom request? This will permanently remove it from the studio queue.')) return;
                          try {
                            await api.deleteCustomRequest(req.id);
                            onRefresh();
                          } catch (err: any) {
                            alert(err.message || 'Could not delete request');
                          }
                        }}
                        className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-[10px] font-medium text-red-500 hover:bg-red-500 hover:text-white transition"
                        title="Cancel within 1 hour grace window"
                      >
                        Cancel order
                      </button>
                    </div>
                  )}
                  <span className={isLight ? 'text-slate-800' : 'text-white/40'}>24–48h SLA:</span>
                  {req.status === 'delivered' ? (
                    <span className="font-semibold text-emerald-600">Delivered Successfully</span>
                  ) : (
                    <LiveCountdownTimer createdAt={req.createdAt} deadlineHours={req.deadlineHours || 48} />
                  )}
                </div>
              </div>

              {/* Sent Assets & Instructions */}
              <div className="mt-5 grid gap-6 md:grid-cols-2">
                <div>
                  <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${isLight ? 'text-slate-900' : 'text-white/40'}`}>What You Sent</p>
                  <div className="flex flex-wrap gap-2.5">
                    {req.clothUrl && (
                      <div
                        className={`overflow-hidden rounded-xl border w-24 cursor-pointer transition ${
                          isLight ? 'border-gray-200 bg-gray-50 hover:border-gray-400' : 'border-white/10 bg-white/5 hover:border-white/30'
                        }`}
                        onClick={() => setLightboxImg(req.clothUrl || null)}
                      >
                        <img src={req.clothUrl} alt="Cloth" className="aspect-[3/4] w-full object-cover" />
                        <p className={`text-[9px] text-center py-0.5 truncate ${isLight ? 'text-slate-800' : 'text-white/40'}`}>{req.clothName || 'Garment'}</p>
                      </div>
                    )}
                    {/* Multi-pose models strip */}
                    {req.modelImages && req.modelImages.length > 0 ? (
                      req.modelImages.map((mUrl, mIdx) => (
                        <div
                          key={mIdx}
                          className={`overflow-hidden rounded-xl border w-20 cursor-pointer transition ${
                            isLight ? 'border-gray-200 bg-gray-50 hover:border-gray-400' : 'border-white/10 bg-white/5 hover:border-white/30'
                          }`}
                          onClick={() => setLightboxImg(mUrl)}
                        >
                          <img src={mUrl} alt={`Pose ${mIdx + 1}`} className="aspect-[3/4] w-full object-cover" />
                          <p className={`text-[9px] text-center py-0.5 ${isLight ? 'text-slate-800' : 'text-white/40'}`}>Pose {mIdx + 1}</p>
                        </div>
                      ))
                    ) : req.modelUrl ? (
                      <div
                        className={`overflow-hidden rounded-xl border w-24 cursor-pointer transition ${
                          isLight ? 'border-gray-200 bg-gray-50 hover:border-gray-400' : 'border-white/10 bg-white/5 hover:border-white/30'
                        }`}
                        onClick={() => setLightboxImg(req.modelUrl || null)}
                      >
                        <img src={req.modelUrl} alt="Model" className="aspect-[3/4] w-full object-cover" />
                        <p className={`text-[9px] text-center py-0.5 truncate ${isLight ? 'text-slate-800' : 'text-white/40'}`}>{req.modelName || 'Model'}</p>
                      </div>
                    ) : null}
                  </div>
                  {req.prompt && (
                    <div className={`mt-3 rounded-2xl border p-3 text-xs italic ${
                      isLight ? 'border-gray-200 bg-gray-50 text-gray-900' : 'border-white/5 bg-black/40 text-white/70'
                    }`}>
                      "{req.prompt}"
                    </div>
                  )}
                </div>

                {/* Admin Delivery & Reply */}
                <div className={`rounded-2xl border p-5 ${
                  isLight ? 'border-gray-200 bg-gray-50 text-gray-900' : 'border-white/10 bg-black/40'
                }`}>
                  <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${isLight ? 'text-slate-900' : 'text-white/40'}`}>
                    Studio Delivery & Admin Response
                  </p>

                  {req.status === 'delivered' && req.deliveredImageUrl ? (
                    <div className="space-y-3">
                      <div className="overflow-hidden rounded-2xl border border-emerald-500/30">
                        <img
                          src={req.deliveredImageUrl}
                          alt="Delivered render"
                          className="max-h-56 w-full object-contain bg-black/60 cursor-pointer"
                          onClick={() => setLightboxImg(req.deliveredImageUrl || null)}
                        />
                      </div>
                      {req.adminReply && (
                        <p className={`text-xs leading-relaxed rounded-xl p-2.5 ${
                          isLight ? 'bg-white/60 text-slate-900' : 'bg-white/5 text-white/80'
                        }`}>
                          <strong className="text-emerald-500 font-bold">Admin Note:</strong> {req.adminReply}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={req.deliveredImageUrl}
                          download={`shivnaresh-custom-${req.id}.png`}
                          className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2 text-xs font-semibold uppercase tracking-wider text-white hover:bg-emerald-500 transition-colors"
                        >
                          Download high-res render
                        </a>
                        <button
                          type="button"
                          onClick={() => safeOpenMediaInNewTab(req.deliveredImageUrl || '', `Bespoke Custom Request #${req.id} Render`)}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                            isLight ? 'border-[#78a48b] bg-[#78a48b] text-slate-900 hover:bg-[#6b997e]' : 'border-white/20 text-white hover:bg-white/10'
                          }`}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span>Open in new tab</span>
                        </button>
                      </div>
                    </div>
                  ) : req.adminReply ? (
                    <div className="space-y-2">
                      <p className={`text-xs leading-relaxed rounded-xl border p-3 ${
                        isLight ? 'bg-blue-100 border-blue-300 text-blue-950' : 'bg-blue-950/40 border-blue-900/40 text-blue-200'
                      }`}>
                        <strong className={isLight ? 'text-blue-800' : 'text-blue-400'}>Master Tailor Update:</strong> {req.adminReply}
                      </p>
                      <p className={`text-[11px] ${isLight ? 'text-slate-800' : 'text-white/40'}`}>Render generation in progress within SLA countdown.</p>
                    </div>
                  ) : (
                    <div className="py-8 text-center">
                      <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent mb-2" />
                      <p className={`text-xs ${isLight ? 'text-slate-800' : 'text-white/50'}`}>Master designers are processing this order.</p>
                      <p className="text-[10px] text-white/30 mt-1">Delivery guaranteed within the countdown window.</p>
                    </div>
                  )}

                  {/* Attached File Download (Any file format: ZIP, PDF, Video, Image, etc.) */}
                  {req.deliveredFileName && (
                    <div className="mt-3 rounded-xl border border-blue-500/30 bg-blue-500/10 p-2.5 text-xs flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 truncate">
                        <Paperclip className="h-3.5 w-3.5 text-blue-400" />
                        <span className="font-semibold text-blue-300 truncate">{req.deliveredFileName}</span>
                      </div>
                      {req.deliveredFileUrl && (
                        <a
                          href={req.deliveredFileUrl}
                          download={req.deliveredFileName}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-blue-500 transition-colors"
                        >
                          Download attachment
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------
   Video Studio Panel (with Aspect Ratios, Purposes & Confirmation Modal)
   ---------------------------------------------------------------- */
const ASPECT_RATIOS = [
  { id: '9:16', label: '9:16 Vertical Reel', icon: '9:16', purpose: 'Instagram Reels, Stories, TikTok & Shorts' },
  { id: '16:9', label: '16:9 Landscape', icon: '16:9', purpose: 'YouTube, Desktop Web & Lookbooks' },
  { id: '1:1', label: '1:1 Square', icon: '1:1', purpose: 'Instagram Grid & Carousel Feeds' },
  { id: '4:5', label: '4:5 Social Portrait', icon: '4:5', purpose: 'Facebook & Instagram Feed Ads' },
] as const;

function VideoStudioPanel({
  user,
  setUser,
  isLight,
  isGlobalBusy,
  setIsGlobalBusy,
  onGenerationSaved,
}: {
  user: User | null;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  isLight: boolean;
  isGlobalBusy: boolean;
  setIsGlobalBusy: (busy: boolean) => void;
  onGenerationSaved?: (gen: UserGeneration) => void;
}) {
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoImg, setVideoImg] = useState<string | null>(null);
  const [duration, setDuration] = useState<5 | 10>(5);
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9' | '1:1' | '4:5'>('9:16');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [videoResult, setVideoResult] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [genStartTime, setGenStartTime] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  /* Video Edit State */
  const [isVideoEditOpen, setIsVideoEditOpen] = useState(false);
  const [videoEditPrompt, setVideoEditPrompt] = useState('');
  const [videoEditRefImage, setVideoEditRefImage] = useState<string | null>(null);
  const [isEditingVideo, setIsEditingVideo] = useState(false);
  const videoEditFileInput = useRef<HTMLInputElement>(null);

  /* Video credit consumption: 5s = 6 credits max; 10s = 12 credits max */
  const videoCreditCost = duration === 10 ? 12 : 6;
  const userCredits = user ? user.credits : 10;
  const hasEnoughCredits = userCredits >= videoCreditCost;
  const isLocked = Boolean(user?.creditsLocked);

  /* User video quota */
  const maxVideos = typeof user?.maxVideos === 'number' ? user.maxVideos : 15;
  const videosGenerated = typeof user?.videosGenerated === 'number' ? user.videosGenerated : 0;
  const isLimitReached = maxVideos > 0 && videosGenerated >= maxVideos;

  const isBusy = busy || isGlobalBusy;

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setVideoImg(String(reader.result));
    reader.readAsDataURL(file);
  }

  /* Poll video job */
  useEffect(() => {
    if (!job || job.status === 'completed' || job.status === 'failed') return;

    const timer = setInterval(async () => {
      try {
        const next = await api.job(job.id);
        setJob(next);

        if (next.status === 'processing') {
          setProgress((prev) => Math.min(94, prev + 3));
          setProgressLabel('Synthesizing motion frames…');
        } else if (next.status === 'in_queue') {
          setProgress(25);
          setProgressLabel('In neural video cluster queue…');
        } else if (next.status === 'starting') {
          setProgress(12);
          setProgressLabel('Initializing runway motion generator…');
        }

        if (next.status === 'completed' && next.output?.[0]) {
          const vidUrl = next.output[0];
          setVideoResult(vidUrl);
          setProgress(100);
          setProgressLabel('Complete!');
          setBusy(false);
          setIsGlobalBusy(false);
          sendDesktopNotification('Video Render Complete', `Your ${duration}s fashion video is ready.`, videoImg || undefined);
          void api.saveUserGeneration({
            type: 'video',
            url: vidUrl,
            prompt: videoPrompt.trim() || 'AI Fashion Runway Video',
            duration,
            aspectRatio,
          }).then((res) => {
            onGenerationSaved?.(res);
          }).catch(() => {});
        }

        if (next.status === 'failed') {
          setError(next.error?.message || 'Video generation failed — please try again.');
          setProgress(0);
          setBusy(false);
          setIsGlobalBusy(false);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Video polling failed');
        setBusy(false);
        setIsGlobalBusy(false);
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [job, duration, videoImg, setIsGlobalBusy]);

  /* Elapsed timer */
  useEffect(() => {
    if (!busy || !genStartTime) return;
    const timer = setInterval(() => {
      setElapsedSec(Math.round((Date.now() - genStartTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [busy, genStartTime]);

  function handleInitiateClick(isEdit = false) {
    setIsEditingVideo(isEdit);
    const sourceImg = isEdit ? (videoEditRefImage || videoImg) : videoImg;
    if (!sourceImg && !isEdit) {
      setError('Please upload a source garment or model image first.');
      return;
    }
    if (isLocked) {
      setError('Your account generation credits are locked by an administrator.');
      return;
    }
    if (isLimitReached) {
      setError(`You have reached your allocated monthly video limit (${videosGenerated}/${maxVideos} videos). Please buy credits or upgrade your plan.`);
      return;
    }
    if (!hasEnoughCredits) {
      setError(`Insufficient credits. You need ${videoCreditCost} credits for a ${duration}-second video, but have ${userCredits} credits. Please upgrade your plan.`);
      return;
    }
    if (isBusy) {
      setError('Another generation is currently in progress. At one time only one generation is allowed.');
      return;
    }
    setError('');
    setShowConfirmModal(true);
  }

  async function runActualVideoGeneration() {
    setShowConfirmModal(false);
    setError('');
    setBusy(true);
    setIsGlobalBusy(true);
    if (!isEditingVideo) {
      setVideoResult(null);
    }
    setJob(null);
    setProgress(8);
    const promptToSend = isEditingVideo ? (videoEditPrompt.trim() || videoPrompt) : videoPrompt;
    setProgressLabel(`Submitting ${duration}-second video (${aspectRatio}) to GPU cluster…`);
    setGenStartTime(Date.now());
    setElapsedSec(0);

    try {
      const res = await api.generateVideo({
        image: (isEditingVideo && videoEditRefImage) ? videoEditRefImage : (videoImg || undefined),
        prompt: promptToSend,
        duration,
        aspect_ratio: aspectRatio,
      });

      if (res.credits !== undefined && user) {
        setUser({
          ...user,
          credits: res.credits,
          videosGenerated: res.videosGenerated ?? ((user.videosGenerated || 0) + 1),
        });
      }

      if (res.id) {
        setJob({ id: res.id, status: 'starting' });
      } else if (res.message) {
        setError(res.message);
        setBusy(false);
        setIsGlobalBusy(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Video generation failed');
      setBusy(false);
      setIsGlobalBusy(false);
    }
  }

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
      {/* "Are You Sure?" Video Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl border border-white/20 bg-[#121217] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-bold text-white">
                {isEditingVideo ? 'Confirm Video Edit Generation' : 'Confirm Video Generation'}
              </h3>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="text-white/40 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <p className="text-xs text-white/80 leading-relaxed">
                Are you sure you want to proceed with {isEditingVideo ? 'generating this video edit' : 'generating this runway fashion video'}?
              </p>

              <div className="rounded-2xl border border-white/10 bg-black/50 p-3.5 space-y-2 text-xs">
                <div className="flex justify-between text-white/60">
                  <span>Selected Duration:</span>
                  <span className="font-bold text-white uppercase">{duration} Seconds ({videoCreditCost} Credits)</span>
                </div>
                <div className="flex justify-between text-white/60">
                  <span>Aspect Ratio:</span>
                  <span className="font-bold text-white uppercase">{aspectRatio} ({ASPECT_RATIOS.find((a) => a.id === aspectRatio)?.label})</span>
                </div>
                <div className="flex justify-between text-white/60">
                  <span>Current Balance:</span>
                  <span className="font-mono text-amber-300">{userCredits} credits</span>
                </div>
                <div className="flex justify-between border-t border-white/5 pt-2 text-white/60">
                  <span>Balance After:</span>
                  <span className="font-mono text-emerald-400 font-bold">
                    {Math.max(0, userCredits - videoCreditCost)} credits
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 rounded-full border border-white/20 py-2.5 text-xs font-semibold text-white/60 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void runActualVideoGeneration()}
                className="flex-1 rounded-full bg-[#e5373f] py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#d42d35]"
              >
                Yes, {isEditingVideo ? 'Generate Edit' : 'Generate Video'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Banner */}
      <div className={`relative overflow-hidden rounded-3xl border p-8 ${
        isLight
          ? 'border-red-200 bg-red-50/50 shadow-sm'
          : 'border-[#e5373f]/30 bg-[#e5373f]/10'
      }`}>
        <div className="max-w-2xl">
          <span className="inline-block rounded-full bg-[#e5373f] px-3.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
            Runway motion &middot; 60fps
          </span>
          <h1 className={`mt-4 text-3xl font-semibold tracking-tight sm:text-4xl ${isLight ? 'text-gray-900' : 'text-white'}`}>
            Fashion Video Studio
          </h1>
          <p className={`mt-3 text-xs leading-relaxed sm:text-sm ${isLight ? 'text-gray-600' : 'text-white/70'}`}>
            Generate cinematic motion videos in <strong>5-second</strong> or <strong>10-second</strong> durations with smooth 60fps runway physics.
            Branding and athletic typography (such as SHIV-NARESH) are automatically preserved with high clarity.
          </p>
        </div>
      </div>

      {/* Monthly Video Quota Banner */}
      <div className={`mt-6 rounded-2xl border p-5 transition-all ${
        isLimitReached
          ? isLight ? 'border-red-300 bg-red-50 text-red-950' : 'border-rose-500/40 bg-rose-950/20 text-rose-200'
          : isLight ? 'border-gray-200 bg-white shadow-sm' : 'border-white/10 bg-white/[0.02]'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Film className="h-4 w-4 text-current/70" />
              <h3 className="text-sm font-semibold">Monthly Video Quota</h3>
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ${
                isLimitReached
                  ? 'bg-rose-500 text-white'
                  : isLight ? 'bg-gray-100 text-gray-700' : 'bg-white/10 text-white/70'
              }`}>
                {videosGenerated} of {maxVideos > 0 ? maxVideos : 'Unlimited'} Videos Used
              </span>
            </div>
            <p className="mt-1 text-xs opacity-60">
              Each user plan receives a dedicated monthly quota of generated videos alongside credit balances.
            </p>
          </div>

          <div className="sm:text-right">
            <span className="text-xs font-mono font-bold">
              {maxVideos > 0 ? `${Math.max(0, maxVideos - videosGenerated)} Videos Left` : 'Unlimited'}
            </span>
            <div className={`mt-1.5 h-2 w-44 overflow-hidden rounded-full ${isLight ? 'bg-gray-200' : 'bg-white/10'}`}>
              <div
                className={`h-full rounded-full transition-all duration-500 ${isLimitReached ? 'bg-rose-500' : 'bg-[#e5373f]'}`}
                style={{ width: `${Math.min(100, maxVideos > 0 ? (videosGenerated / maxVideos) * 100 : 0)}%` }}
              />
            </div>
          </div>
        </div>

        {isLimitReached && (
          <div className="mt-4 pt-4 border-t border-rose-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs font-medium text-rose-400">
              Your monthly video quota has reached its limit. Buy credits or upgrade your plan for more video generations.
            </p>
            <a
              href="/pricing"
              className="inline-flex items-center justify-center rounded-full bg-[#e5373f] hover:bg-[#d42d35] text-white px-5 py-2 text-xs font-semibold uppercase tracking-wider shadow-sm transition"
            >
              Buy credits / upgrade &rarr;
            </a>
          </div>
        )}
      </div>

      {/* Form Interface */}
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div className={`rounded-3xl border p-6 space-y-5 ${isLight ? 'border-gray-200 bg-white shadow-sm' : 'border-white/10 bg-white/[0.02]'}`}>
          {/* Step 1: Base Image */}
          <div>
            <label className={`text-xs font-semibold uppercase tracking-wider ${isLight ? 'text-gray-500' : 'text-white/50'}`}>
              1 &middot; Source Garment / Model Image
            </label>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleFile} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={`mt-2 flex aspect-[16/9] w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed p-4 transition-colors ${
                isLight
                  ? 'border-gray-300 bg-gray-50 hover:border-gray-400'
                  : 'border-white/20 bg-black/40 hover:border-white/40'
              }`}
            >
              {videoImg ? (
                <img src={videoImg} alt="Source" className="h-full w-auto object-contain" />
              ) : (
                <>
                  <Film className="h-8 w-8 mb-2 opacity-40" />
                  <span className={`text-xs font-semibold ${isLight ? 'text-gray-900' : 'text-white'}`}>Upload base image for video</span>
                  <span className={`text-[10px] mt-0.5 ${isLight ? 'text-gray-500' : 'text-white/35'}`}>High-contrast athletic photos work best</span>
                </>
              )}
            </button>
          </div>

          {/* Step 2: Instructions */}
          <div>
            <label className={`text-xs font-semibold uppercase tracking-wider ${isLight ? 'text-gray-500' : 'text-white/50'}`}>
              2 &middot; Runway Motion Instructions (Optional)
            </label>
            <textarea
              value={videoPrompt}
              onChange={(e) => setVideoPrompt(e.target.value)}
              rows={3}
              placeholder="e.g. Model walks briskly down an asphalt track, dynamic camera tracking shot, zoom in on jersey logo"
              className={`mt-2 w-full rounded-2xl border p-3 text-xs focus:outline-none ${
                isLight
                  ? 'border-gray-300 bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-gray-400'
                  : 'border-white/10 bg-black/50 text-white placeholder:text-white/25 focus:border-white/40'
              }`}
            />
          </div>

          {/* Step 3: Aspect Ratio / Size Options with Purposes */}
          <div>
            <label className={`text-[11px] uppercase tracking-wider block mb-1.5 ${isLight ? 'text-gray-500' : 'text-white/40'}`}>
              3 &middot; Aspect Ratio & Format Purpose
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ASPECT_RATIOS.map((item) => {
                const active = aspectRatio === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setAspectRatio(item.id as typeof aspectRatio)}
                    className={`rounded-2xl border p-3 text-left transition-all ${
                      active
                        ? isLight
                          ? 'border-[#e5373f] bg-red-50/60 ring-2 ring-[#e5373f]/20'
                          : 'border-[#e5373f] bg-[#e5373f]/10 ring-2 ring-[#e5373f]/30'
                        : isLight
                          ? 'border-gray-200 bg-gray-50 hover:border-gray-300'
                          : 'border-white/10 bg-black/40 hover:border-white/25'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-base">{item.icon}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        active ? 'bg-[#e5373f] text-white' : (isLight ? 'bg-gray-200 text-gray-700' : 'bg-white/10 text-white/60')
                      }`}>
                        {item.id}
                      </span>
                    </div>
                    <p className={`mt-1.5 text-xs font-bold ${isLight ? 'text-gray-900' : 'text-white'}`}>{item.label}</p>
                    <p className={`mt-0.5 text-[10px] leading-tight ${isLight ? 'text-gray-500' : 'text-white/40'}`}>{item.purpose}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 4: Duration & Credit Consumption Selector */}
          <div>
            <label className={`text-[11px] uppercase tracking-wider block mb-1.5 ${isLight ? 'text-gray-500' : 'text-white/40'}`}>
              4 &middot; Duration (Credit Consumption)
            </label>
            <div className={`grid grid-cols-2 gap-2 rounded-2xl border p-1 ${isLight ? 'border-gray-200 bg-gray-100' : 'border-white/10 bg-black/50'}`}>
              <button
                type="button"
                onClick={() => setDuration(5)}
                className={`rounded-xl py-2.5 px-3 text-xs font-semibold transition-all text-center ${
                  duration === 5
                    ? isLight ? 'bg-white text-gray-900 shadow-sm font-bold ring-1 ring-gray-300' : 'bg-white text-gray-900 font-bold'
                    : isLight ? 'text-gray-600 hover:text-gray-900' : 'text-white/60 hover:text-white'
                }`}
              >
                <span className="block text-xs font-bold">5 Seconds</span>
                <span className="inline-block mt-0.5 text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  Standard Clip
                </span>
              </button>
              <button
                type="button"
                onClick={() => setDuration(10)}
                className={`rounded-xl py-2.5 px-3 text-xs font-semibold transition-all text-center ${
                  duration === 10
                    ? isLight ? 'bg-white text-gray-900 shadow-sm font-bold ring-1 ring-gray-300' : 'bg-white text-gray-900 font-bold'
                    : isLight ? 'text-gray-600 hover:text-gray-900' : 'text-white/60 hover:text-white'
                }`}
              >
                <span className="block text-xs font-bold">10 Seconds</span>
                <span className="inline-block mt-0.5 text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  Extended Runway
                </span>
              </button>
            </div>
            <p className={`mt-1.5 text-[10px] ${isLight ? 'text-gray-500' : 'text-white/40'}`}>
              High-definition motion synthesis: technical activewear and brand typography preservation guaranteed.
            </p>
          </div>

          {/* Credit & Quota Status */}
          <div className={`rounded-xl border p-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs ${
            isLight ? 'border-gray-200 bg-gray-50 text-gray-700' : 'border-white/10 bg-black/40 text-white/70'
          }`}>
            <div>
              <span>Account balance: <strong className={isLight ? 'text-amber-950 font-semibold' : 'text-amber-500'}>{userCredits} credits</strong></span>
            </div>
            <span className="rounded-full bg-purple-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-purple-600 border border-purple-500/20">
              Video quota: {videosGenerated} / {maxVideos > 0 ? maxVideos : 'Unlimited'}
            </span>
          </div>

          {/* Primary Generate Button in Video Section */}
          <button
            type="button"
            onClick={() => handleInitiateClick(false)}
            disabled={isBusy || isLocked || isLimitReached || !hasEnoughCredits}
            className={`w-full rounded-full py-3 text-xs font-semibold uppercase tracking-wider transition-all shadow-sm ${
              isBusy
                ? isLight ? 'cursor-wait bg-gray-300 text-gray-700' : 'cursor-wait bg-gray-700 text-white opacity-80'
                : isLocked
                  ? isLight ? 'cursor-not-allowed bg-rose-100 text-rose-700 border border-rose-300' : 'cursor-not-allowed bg-rose-600/30 text-rose-300 border border-rose-500/30'
                  : isLimitReached
                    ? isLight ? 'cursor-not-allowed bg-purple-100 text-purple-700 border border-purple-300' : 'cursor-not-allowed bg-purple-600/30 text-purple-300 border border-purple-500/30'
                    : !hasEnoughCredits
                      ? isLight ? 'cursor-not-allowed bg-amber-100 text-amber-800 border border-amber-400 font-bold' : 'cursor-not-allowed bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-[#e5373f] text-white shadow-[#e5373f]/25 hover:bg-[#d42d35]'
            }`}
          >
            {isBusy
              ? 'Generation in progress…'
              : isLocked
                ? 'Credits locked by administrator'
                : isLimitReached
                  ? `Monthly video quota reached (${videosGenerated}/${maxVideos})`
                  : !hasEnoughCredits
                    ? `Insufficient credits (requires ${videoCreditCost})`
                    : `Generate ${duration}s fashion video (${videoCreditCost} credits)`}
          </button>

          {error && (
            <p className={`rounded-xl border p-3 text-center text-xs ${
              isLight ? 'border-red-300 bg-red-50 text-red-700' : 'border-red-500/30 bg-red-500/10 text-red-400'
            }`}>
              {error}
            </p>
          )}
        </div>

        {/* Video Preview Canvas */}
        <div className={`flex flex-col items-center justify-center rounded-3xl border p-8 text-center ${
          isLight ? 'border-gray-200 bg-white shadow-sm' : 'border-white/10 bg-black/50'
        }`}>
          {videoResult ? (
            <div className="space-y-4 w-full max-w-sm">
              <video
                src={videoResult}
                controls
                autoPlay
                loop
                playsInline
                className={`w-full rounded-2xl object-cover shadow-2xl border border-white/20 mx-auto ${
                  aspectRatio === '16:9' ? 'aspect-[16/9]' : aspectRatio === '1:1' ? 'aspect-square' : aspectRatio === '4:5' ? 'aspect-[4/5]' : 'aspect-[9/16]'
                }`}
              />
              <div className="flex flex-col gap-2">
                <a
                  href={videoResult}
                  download={`shivnaresh-${duration}s-video.mp4`}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-2.5 text-xs font-semibold uppercase tracking-wider text-white hover:bg-emerald-500 shadow-sm transition-all"
                >
                  Download 1080p MP4
                </a>
                <button
                  type="button"
                  onClick={() => setIsVideoEditOpen(!isVideoEditOpen)}
                  className={`inline-flex items-center justify-center gap-2 rounded-full border px-6 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all shadow-sm ${
                    isVideoEditOpen
                      ? 'bg-[#e5373f] text-white border-[#e5373f]'
                      : isLight
                        ? 'border-[#e5373f] text-[#e5373f] hover:bg-[#e5373f] hover:text-white'
                        : 'border-[#e5373f]/60 text-[#ff9aa0] hover:border-[#e5373f] hover:text-white'
                  }`}
                >
                  {isVideoEditOpen ? 'Close video edit' : 'Edit this video'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVideoResult(null);
                    setIsVideoEditOpen(false);
                  }}
                  className={`text-[11px] underline ${isLight ? 'text-gray-500 hover:text-gray-900' : 'text-white/40 hover:text-white'}`}
                >
                  Generate another clip
                </button>
              </div>

              {/* POST-VIDEO EDIT PANEL */}
              {isVideoEditOpen && (
                <div className={`mt-4 rounded-2xl border p-4 text-left space-y-3 transition-all ${
                  isLight ? 'border-gray-200 bg-gray-50 text-gray-900' : 'border-white/10 bg-black/60 text-white'
                }`}>
                  <div className="flex items-center justify-between border-b pb-2 border-current/10">
                    <div className="flex items-center gap-2">
                      <Film className="h-4 w-4 text-current/70" />
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider">Video edit studio</h4>
                        <p className="text-[10px] opacity-60">
                          Takes generated video as reference ({duration}s · {videoCreditCost} credits)
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsVideoEditOpen(false)}
                      className="text-xs opacity-50 hover:opacity-100 p-1"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider opacity-60 mb-1">
                      Video Modification Instructions (Prompt)
                    </label>
                    <textarea
                      value={videoEditPrompt}
                      onChange={(e) => setVideoEditPrompt(e.target.value)}
                      rows={2}
                      placeholder="e.g. Add subtle camera orbit, enhance stadium lighting on track, highlight brand insignia"
                      className={`w-full rounded-xl border p-2.5 text-xs focus:outline-none transition-colors ${
                        isLight
                          ? 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-gray-500'
                          : 'bg-black/50 border-white/10 text-white placeholder:text-white/30 focus:border-white/40'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider opacity-60 mb-1">
                      Optional: Upload Replacement Garment / Overlay Image
                    </label>
                    <input
                      ref={videoEditFileInput}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const dataUrl = await fileToDataUrl(file);
                        setVideoEditRefImage(dataUrl);
                      }}
                    />
                    {videoEditRefImage ? (
                      <div className="flex items-center justify-between rounded-xl border border-white/10 p-2 bg-black/20">
                        <div className="flex items-center gap-2">
                          <img src={videoEditRefImage} alt="Ref" className="h-10 w-8 rounded object-cover" />
                          <span className="text-xs text-emerald-400 font-semibold">Overlay image loaded</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setVideoEditRefImage(null)}
                          className="text-xs text-rose-400 hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => videoEditFileInput.current?.click()}
                        className={`w-full rounded-xl border border-dashed p-2 text-center text-xs transition ${
                          isLight ? 'border-gray-300 bg-white hover:border-gray-400 text-gray-700' : 'border-white/20 bg-black/20 hover:border-white/40 text-white/70'
                        }`}
                      >
                        + Add Overlay / Reference Image (Optional)
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleInitiateClick(true)}
                    disabled={isBusy || isLocked || isLimitReached || !hasEnoughCredits}
                    className="w-full rounded-full bg-[#e5373f] hover:bg-[#d42d35] text-white py-2.5 text-xs font-semibold uppercase tracking-wider transition shadow-sm disabled:opacity-50"
                  >
                    Generate video edit ({duration}s &middot; {videoCreditCost} credits)
                  </button>
                </div>
              )}
            </div>
          ) : busy ? (
            <div className="w-full max-w-sm p-6 text-center">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-3 border-rose-500/20 border-t-rose-500 mb-4" />
              <p className={`text-sm font-bold ${isLight ? 'text-gray-900' : 'text-white'}`}>{progressLabel || 'Rendering Video…'}</p>
              <p className={`text-xs mt-1 font-mono ${isLight ? 'text-gray-500' : 'text-white/40'}`}>Elapsed: {fmtTime(elapsedSec)}</p>
              <div className={`mt-4 h-2 w-full overflow-hidden rounded-full ${isLight ? 'bg-gray-100' : 'bg-white/10'}`}>
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out bg-[#e5373f]"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : (
            <div className={`relative w-64 overflow-hidden rounded-2xl border border-white/15 bg-black/80 flex items-center justify-center shadow-2xl ${
              aspectRatio === '16:9' ? 'aspect-[16/9]' : aspectRatio === '1:1' ? 'aspect-square' : aspectRatio === '4:5' ? 'aspect-[4/5]' : 'aspect-[9/16]'
            }`}>
              {videoImg ? (
                <img src={videoImg} alt="Preview" className="h-full w-full object-cover opacity-60" />
              ) : (
                <div className="text-white/30 text-center p-4">
                  <Film className="h-8 w-8 mx-auto mb-2 text-white/30" />
                  <span className="text-xs">Video Canvas ({aspectRatio})</span>
                </div>
              )}
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]">
                <span className="rounded-full bg-white/20 p-3 text-white text-xs">▶</span>
                <p className="mt-3 text-xs font-bold text-white uppercase tracking-wider">Preview Reel</p>
                <p className="text-[10px] text-amber-300 mt-1 font-semibold">{duration}s &middot; {videoCreditCost} Credits ({aspectRatio})</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   Main Design page
   ================================================================ */
export default function Design() {
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<Studio | null>(null);
  const [categories, setCategories] = useState<ModelCategory[]>([]);
  const [uploads, setUploads] = useState<{ id: string; name: string; url: string }[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [uploadSets, setUploadSets] = useState<UploadSet[]>([]);
  const [loadingSets, setLoadingSets] = useState(false);
  const [userGenerations, setUserGenerations] = useState<UserGeneration[]>([]);
  const [loadingGenerations, setLoadingGenerations] = useState(false);

  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';

  const [customRequests, setCustomRequests] = useState<CustomRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  /* Page view tabs */
  const [pageView, setPageView] = useState<'studio' | 'my-sets' | 'custom-requests' | 'video'>('studio');

  const [mode, setMode] = useState<ModeId>('tryon');
  const [quality, setQuality] = useState<'1k' | '2k'>('1k');
  const [poseMode, setPoseMode] = useState<'single' | '5-pose'>('single');
  const [showTierLockModal, setShowTierLockModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  /* Try-on inputs */
  const [cloth, setCloth] = useState<Pick>(null);
  const [selectedClothes, setSelectedClothes] = useState<Array<{ url: string; preview?: string; name: string }>>([]);
  /* Smart garment classification */
  const [classifiedGarments, setClassifiedGarments] = useState<ClassifiedGarment[]>([]);
  const [tryOnTarget, setTryOnTarget] = useState<TryOnTarget>('upper');

  function removeSelectedCloth(index: number) {
    setSelectedClothes((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (cloth && cloth.url === prev[index]?.url) {
        setCloth(next[0] || null);
      }
      return next;
    });
  }

  function addClassifiedGarment(garment: { url: string; preview?: string; name: string }) {
    const role = classifyGarmentByHeuristic(garment.name);
    setClassifiedGarments((prev) => {
      const exists = prev.some((g) => g.url === garment.url);
      if (exists) return prev;
      return [...prev, { ...garment, role }];
    });
  }

  function updateGarmentRole(url: string, newRole: GarmentRole) {
    setClassifiedGarments((prev) => prev.map((g) => g.url === url ? { ...g, role: newRole } : g));
  }

  function removeClassifiedGarment(url: string) {
    setClassifiedGarments((prev) => prev.filter((g) => g.url !== url));
    // Also remove from selectedClothes if present
    const idx = selectedClothes.findIndex((c) => c.url === url);
    if (idx !== -1) removeSelectedCloth(idx);
  }
  const [model, setModel] = useState<Pick>(null);
  const [selectedModels, setSelectedModels] = useState<Array<{ url: string; preview?: string; name: string }>>([]);

  function removeSelectedModel(index: number) {
    setSelectedModels((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (model && model.url === prev[index]?.url) {
        setModel(next[0] || null);
      }
      return next;
    });
  }

  function toggleModelSelection(item: { url: string; name: string }) {
    if (poseMode === '5-pose') {
      selectPoseForSlot(item);
    } else {
      const pickItem = { url: item.url, preview: item.url, name: item.name };
      setSelectedModels((prev) => {
        const isSelected = prev.some((p) => p && p.url === item.url);
        if (isSelected) {
          const next = prev.filter((p) => p.url !== item.url);
          if (model?.url === item.url) {
            setModel(next[0] || null);
          }
          return next;
        } else {
          let base = [...prev];
          if (base.length === 0 && model && model.url !== item.url) {
            base = [{ url: model.url, preview: model.preview || model.url, name: model.name }];
          }
          const next = [...base, pickItem];
          setModel(pickItem);
          return next;
        }
      });
    }
  }
  const [prompt, setPrompt] = useState('');
  const [garmentColor, setGarmentColor] = useState('');

  /* Model Swap inputs (Slot 1: Kis Model ko change karna hai; Slot 2: Kis Model ke sath change karna hai) */
  const [swapSource, setSwapSource] = useState<Pick>(null);
  const [swapTarget, setSwapTarget] = useState<Pick>(null);
  const [swapPrompt, setSwapPrompt] = useState('');
  const [swapTab, setSwapTab] = useState<'library' | 'uploads'>('library');
  const swapSourceInput = useRef<HTMLInputElement>(null);
  const swapTargetInput = useRef<HTMLInputElement>(null);

  /* Edit Render Panel (underneath generated image in result canvas) */
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const [editRefImage, setEditRefImage] = useState<Pick>(null);
  const [isEditingRender, setIsEditingRender] = useState(false);
  const editRefInput = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<'library' | 'uploads'>('library');
  const [job, setJob] = useState<Job | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [videoBusy, setVideoBusy] = useState(false);
  const isGlobalBusy = busy || videoBusy;

  /* Batch Engine State (5-Pose Multi-Angle or Multi-Model / Multi-Garment) */
  const [fivePoseItems, setFivePoseItems] = useState<PoseItem[]>([]);
  const [selectedPoseIndex, setSelectedPoseIndex] = useState<number>(0);
  const activePoseIndexRef = useRef<number>(-1);
  const batchPayloadRef = useRef<{
    isFivePose: boolean;
    total: number;
    payload: Record<string, unknown>;
    basePrompt: string;
    items: Array<{
      id: string;
      name: string;
      angle: string;
      icon: string;
      model?: Pick;
      cloth?: Pick;
      promptSuffix?: string;
    }>;
  } | null>(null);

  /* 5-Pose Selection Slots State (User can choose up to 5 models from library/uploads) */
  const [selectedPoses, setSelectedPoses] = useState<Pick[]>([]);
  const [activeSlotIndex, setActiveSlotIndex] = useState<number>(0);

  function selectPoseForSlot(item: { url: string; name: string }) {
    if (poseMode === '5-pose') {
      setSelectedPoses((prev) => {
        const next = [...prev];
        const targetSlot = (activeSlotIndex >= 0 && activeSlotIndex < 5) ? activeSlotIndex : next.length;
        if (targetSlot < 5) {
          next[targetSlot] = item;
          if (targetSlot < 4) setActiveSlotIndex(targetSlot + 1);
        }
        return next;
      });
      if (!model || activeSlotIndex === 0) setModel(item);
    } else {
      setModel(item);
    }
  }

  function removePoseSlot(slotIdx: number) {
    setSelectedPoses((prev) => {
      const next = [...prev];
      next.splice(slotIdx, 1);
      return next;
    });
    setActiveSlotIndex(slotIdx);
  }

  const [newCollection, setNewCollection] = useState('');
  const [savedTo, setSavedTo] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; kind: 'cloth' | 'model' } | null>(null);

  /* Generation confirmation modal */
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  /* Progress tracking */
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [genStartTime, setGenStartTime] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);

  const generatingRef = useRef(false);
  const clothInput = useRef<HTMLInputElement>(null);
  const modelInput = useRef<HTMLInputElement>(null);

  const activeMode = MODES.find((m) => m.id === mode)!;
  const creditCost = quality === '2k' ? 3 : 1;
  const isFivePoseBatch = poseMode === '5-pose' && mode === 'tryon';
  const effectiveModels = selectedModels.length > 0 ? selectedModels : (model ? [model] : []);
  const effectiveClothes = selectedClothes.length > 0 ? selectedClothes : (cloth ? [cloth] : []);
  // Smart garment role selectors — computed from classifiedGarments
  const topFrontGarment: Pick | null = (() => {
    const g = classifiedGarments.find((g) => g.role === 'tops-front') ?? classifiedGarments.find((g) => g.role === 'unknown');
    return g ? { url: g.url, preview: g.preview, name: g.name } : null;
  })();
  const topBackGarment: Pick | null = (() => {
    const g = classifiedGarments.find((g) => g.role === 'tops-back') ?? classifiedGarments.find((g) => g.role === 'tops-front') ?? classifiedGarments.find((g) => g.role === 'unknown');
    return g ? { url: g.url, preview: g.preview, name: g.name } : null;
  })();
  const bottomGarment: Pick | null = (() => {
    const g = classifiedGarments.find((g) => g.role === 'bottoms');
    return g ? { url: g.url, preview: g.preview, name: g.name } : null;
  })();
  const hasClassifiedGarments = classifiedGarments.length > 0;
  const multiBatchCount = mode === 'tryon' && !isFivePoseBatch && (effectiveModels.length > 1 || effectiveClothes.length > 1)
    ? Math.max(effectiveModels.length, effectiveClothes.length)
    : 1;
  const totalRequiredCredits = isFivePoseBatch
    ? (5 * creditCost)
    : (multiBatchCount > 1 ? (multiBatchCount * creditCost) : creditCost);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const loadCollections = useCallback(async () => {
    try {
      setCollections((await api.collections()).items);
    } catch {
      /* non-fatal */
    }
  }, []);

  const loadUploads = useCallback(async () => {
    try {
      setUploads((await api.uploads()).items);
    } catch {
      /* non-fatal */
    }
  }, []);

  const loadUploadSets = useCallback(async () => {
    setLoadingSets(true);
    try {
      setUploadSets((await api.uploadSets()).items);
    } catch {
      /* non-fatal */
    } finally {
      setLoadingSets(false);
    }
  }, []);

  const loadCustomRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      setCustomRequests((await api.customRequests()).items);
    } catch {
      /* non-fatal */
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  const loadUserGenerations = useCallback(async () => {
    setLoadingGenerations(true);
    try {
      setUserGenerations((await api.userGenerations()).items);
    } catch {
      /* non-fatal */
    } finally {
      setLoadingGenerations(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      let me: User | null = null;
      let backendReached = false;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          const res = await api.me();
          backendReached = true;
          me = res.user;
          break;
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) {
            window.location.replace('/login?next=%2Fdesign');
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      if (!backendReached) {
        setError('Studio unreachable. Please run `npm run api`, then refresh.');
        return;
      }
      if (!me) {
        window.location.replace('/login?next=%2Fdesign');
        return;
      }

      setUser(me);

      try {
        const [s, m] = await Promise.all([api.studio(), api.models()]);
        setSettings(s);
        setCategories(m.categories);
        setPrompt(s.defaultPrompt || '');
        if (s.resolution === '2k' && me.tier && me.tier !== 'free') {
          setQuality('2k');
        } else {
          setQuality('1k');
        }
        if (s.defaultMode) setMode(s.defaultMode as ModeId);
        if (s.defaultModel) {
          const found = m.categories.flatMap((c) => c.items).find((i) => i.id === s.defaultModel);
          if (found) setModel({ url: found.url, name: found.name });
        }
      } catch {
        /* non-fatal */
      }

      void loadUploads();
      void loadCollections();
      void loadUploadSets();
      void loadCustomRequests();
      void loadUserGenerations();
    })();
  }, [loadUploadSets, loadCustomRequests, loadUserGenerations, loadUploads, loadCollections]);

  /* Poll job */
  useEffect(() => {
    if (!job || job.status === 'completed' || job.status === 'failed') return;

    const timer = setInterval(async () => {
      try {
        const next = await api.job(job.id);
        setJob(next);

        const stage = PROGRESS_STAGES[next.status] || { label: next.status, percent: 30 };
        setProgressLabel(stage.label);

        if (next.status === 'processing') {
          setProgress((prev) => Math.min(92, prev + 2.5));
        } else {
          setProgress(stage.percent);
        }

        if (next.status === 'completed' && next.output?.[0]) {
          const imgUrl = next.output[0];

          if (activePoseIndexRef.current >= 0 && batchPayloadRef.current) {
            const currentIdx = activePoseIndexRef.current;
            const nextIdx = currentIdx + 1;
            const batchCtx = batchPayloadRef.current;
            const currentItem = batchCtx.items[currentIdx];

            // Mark current item completed
            setFivePoseItems((prev) =>
              prev.map((p, idx) => (idx === currentIdx ? { ...p, status: 'completed', url: imgUrl, jobId: next.id } : p))
            );
            setResult(imgUrl);
            setSelectedPoseIndex(currentIdx);
            void api.saveUserGeneration({
              type: 'image',
              url: imgUrl,
              prompt: prompt.trim() || `${currentItem?.name || 'Studio Render'} (${currentIdx + 1}/${batchCtx.total})`,
              resolution: quality,
            }).then((res) => {
              setUserGenerations((prev) => [res, ...prev.filter((g) => g.id !== res.id)]);
            }).catch(() => {});

            if (nextIdx < batchCtx.total) {
              // Advance to next item in sequence
              activePoseIndexRef.current = nextIdx;
              const nextItem = batchCtx.items[nextIdx];
              setFivePoseItems((prev) =>
                prev.map((p, idx) => (idx === nextIdx ? { ...p, status: 'generating' } : p))
              );
              setProgress(Math.round(((currentIdx + 1) / batchCtx.total) * 100));
              setProgressLabel(`Completed ${currentIdx + 1}/${batchCtx.total}! Starting ${nextItem.name} (${nextIdx + 1}/${batchCtx.total})…`);

              try {
                const nextPayload: Record<string, unknown> = {
                  ...batchCtx.payload,
                  ...(nextItem.model?.url ? { model: nextItem.model.url } : {}),
                  ...(nextItem.cloth?.url ? { cloth: nextItem.cloth.url, source: nextItem.cloth.url } : {}),
                };
                if (batchCtx.isFivePose && nextItem.promptSuffix) {
                  nextPayload.prompt = `${batchCtx.basePrompt} · ${nextItem.promptSuffix}`.trim();
                }
                const nextRes = await api.generate(nextPayload);
                if (typeof nextRes.credits === 'number') {
                  setUser((prev) => (prev ? { ...prev, credits: nextRes.credits! } : null));
                }
                setJob({ id: nextRes.id, status: 'starting' });
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Error starting next render in sequence');
                setFivePoseItems((prev) =>
                  prev.map((p, idx) => (idx === nextIdx ? { ...p, status: 'failed' } : p))
                );
                setBusy(false);
                generatingRef.current = false;
                activePoseIndexRef.current = -1;
                batchPayloadRef.current = null;
              }
            } else {
              // All items finished
              const totalDone = batchCtx.total;
              const is5 = batchCtx.isFivePose;
              activePoseIndexRef.current = -1;
              batchPayloadRef.current = null;
              setProgress(100);
              setProgressLabel(`All ${totalDone} ${is5 ? 'Poses' : 'Models'} Completed Successfully!`);
              setBusy(false);
              generatingRef.current = false;
              sendDesktopNotification(
                `${is5 ? '5-Pose Suite' : `${totalDone} Models`} Ready`,
                `All ${totalDone} fashion renders are ready in your studio.`,
                imgUrl
              );
            }
          } else {
            // Standard single generation
            setResult(imgUrl);
            setProgress(100);
            setProgressLabel('Complete!');
            setBusy(false);
            generatingRef.current = false;
            setIsEditingRender(false);
            sendDesktopNotification('Render Complete', 'Your virtual try-on render is ready.', imgUrl);
            void api.saveUserGeneration({
              type: 'image',
              url: imgUrl,
              prompt: prompt.trim() || (mode === 'swap' ? 'Model Swap' : 'Virtual Try-On'),
              resolution: quality,
            }).then((res) => {
              setUserGenerations((prev) => [res, ...prev.filter((g) => g.id !== res.id)]);
            }).catch(() => {});
          }
        }

        if (next.status === 'failed') {
          if (activePoseIndexRef.current >= 0) {
            const currentIdx = activePoseIndexRef.current;
            setFivePoseItems((prev) =>
              prev.map((p, idx) => (idx === currentIdx ? { ...p, status: 'failed' } : p))
            );
            activePoseIndexRef.current = -1;
            batchPayloadRef.current = null;
          }
          const msg = next.error?.message || 'Generation failed — please try again.';
          setError(msg);
          setProgress(0);
          setProgressLabel('Failed');
          setBusy(false);
          generatingRef.current = false;
          setIsEditingRender(false);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Polling failed');
        setBusy(false);
        generatingRef.current = false;
        activePoseIndexRef.current = -1;
        batchPayloadRef.current = null;
        setIsEditingRender(false);
      }
    }, 1500);

    return () => clearInterval(timer);
  }, [job]);

  /* Elapsed timer */
  useEffect(() => {
    if (!busy || !genStartTime) return;
    const timer = setInterval(() => {
      setElapsedSec(Math.round((Date.now() - genStartTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [busy, genStartTime]);

  async function handleMultipleFiles(files: FileList | null | File[] | undefined, kind: 'cloth' | 'model') {
    if (!files) return;
    const fileArr = Array.isArray(files) ? files : Array.from(files);
    if (fileArr.length === 0) return;

    try {
      setError('');
      setUploading(true);
      setUploadProgress({ current: 0, total: fileArr.length, kind });

      let slotOffset = activeSlotIndex;

      for (let i = 0; i < fileArr.length; i++) {
        const file = fileArr[i];
        setUploadProgress({ current: i + 1, total: fileArr.length, kind });
        const dataUrl = await fileToDataUrl(file);
        const uploaded = await api.upload(dataUrl, kind, file.name);
        const pick = { url: uploaded.url, preview: uploaded.preview || dataUrl, name: file.name };

        if (kind === 'cloth') {
          // Add to selected clothes list so multiple garments can be chosen
          setSelectedClothes((prev) => {
            const exists = prev.some((p) => p && p.url === pick.url);
            return exists ? prev : [...prev, pick];
          });
          // Also classify and add to smart garments
          addClassifiedGarment(pick);
          // Set as active cloth
          setCloth(pick);
        } else {
          // Add to selected models list so multiple models can be chosen
          setSelectedModels((prev) => {
            const exists = prev.some((p) => p && p.url === pick.url);
            return exists ? prev : [...prev, pick];
          });
          // Set as active model
          setModel(pick);
          if (poseMode === '5-pose') {
            setSelectedPoses((prev) => {
              const next = [...prev];
              if (slotOffset < 5) {
                next[slotOffset] = pick;
                slotOffset++;
              }
              return next;
            });
          }
        }
      }

      if (kind === 'model') {
        setTab('uploads');
      }

      await loadUploads();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }



  /* ------------------------------------------------
     Unified Execution Function (runs after user clicks Yes in confirmation)
     ------------------------------------------------ */
  async function runActualGeneration() {
    if (user?.creditsLocked) {
      setError('Your account generation credits are locked by an administrator.');
      return;
    }
    if (generatingRef.current || isGlobalBusy) return;
    setShowConfirmModal(false);

    if ((user?.credits ?? 0) < totalRequiredCredits) {
      setError(`Insufficient credits. You need ${totalRequiredCredits} credits for ${isFivePoseBatch ? 'the 5-pose sequence' : `${multiBatchCount} model renders`}, but currently have ${user?.credits ?? 0} credits.`);
      return;
    }

    generatingRef.current = true;
    setBusy(true);
    setError('');
    if (!isEditingRender) setResult(null);
    setJob(null);
    setGenStartTime(Date.now());
    setElapsedSec(0);

    try {
      let effectivePrompt = mode === 'swap' ? swapPrompt.trim() : prompt.trim();
      if (garmentColor.trim() && mode !== 'swap') {
        const colorNote = `Exact fabric color: ${garmentColor.trim()}. Preserve true athletic garment dye and athlete kit tones with accurate color matching.`;
        effectivePrompt = effectivePrompt ? `${effectivePrompt} · ${colorNote}` : colorNote;
      }
      const payload: Record<string, unknown> = {
        mode,
        prompt: effectivePrompt,
        resolution: quality,
      };

      if (isEditingRender) {
        payload.mode = 'edit';
        payload.source = result;
        payload.prompt = editPrompt.trim() || 'Enhance style and athletic garment fit';
        if (editRefImage?.url) payload.cloth = editRefImage.url;
      } else if (mode === 'swap') {
        payload.mode = 'swap';
        payload.sourceModel = swapSource?.url;
        payload.targetModel = swapTarget?.url;
        payload.source = swapSource?.url;
        payload.model = swapTarget?.url;
      } else {
        // Smart garment routing based on tryOnTarget and classifiedGarments
        if (hasClassifiedGarments) {
          if (tryOnTarget === 'upper') {
            payload.mode = 'tryon';
            payload.cloth = topFrontGarment?.url || cloth?.url;
            if (model?.url) payload.model = model.url;
            payload.source = payload.cloth;
          } else if (tryOnTarget === 'lower') {
            payload.mode = 'tryon';
            payload.cloth = bottomGarment?.url || cloth?.url;
            if (model?.url) payload.model = model.url;
            payload.source = payload.cloth;
            payload.category = 'bottoms';
          } else {
            // Both = full outfit chaining — backend handles 2 sequential calls
            payload.mode = 'outfit';
            payload.topCloth = topFrontGarment?.url || cloth?.url;
            payload.bottomCloth = bottomGarment?.url;
            if (model?.url) payload.model = model.url;
          }
        } else {
          payload.mode = 'tryon';
          if (cloth?.url) payload.cloth = cloth.url;
          if (model?.url) payload.model = model.url;
          payload.source = cloth?.url;
        }
      }

      /* Batch Execution (5-pose sequence or multi-model batch) */
      if ((isFivePoseBatch || multiBatchCount > 1) && !isEditingRender) {
        let batchItems: Array<{
          id: string;
          name: string;
          angle: string;
          icon: string;
          model?: Pick;
          cloth?: Pick;
          promptSuffix?: string;
        }> = [];

        if (isFivePoseBatch) {
          batchItems = FIVE_POSES_SPECS.map((spec, i) => {
            // Smart angle matching: back pose gets back garment photo
            const isBackAngle = spec.id === 'back' || spec.angle.toLowerCase().includes('180') || spec.angle.toLowerCase().includes('rear');
            const smartCloth = hasClassifiedGarments
              ? (isBackAngle ? (topBackGarment || topFrontGarment || cloth) : (topFrontGarment || cloth))
              : cloth;
            return {
              id: spec.id,
              name: spec.name,
              angle: spec.angle,
              icon: spec.icon,
              promptSuffix: spec.promptSuffix,
              model: selectedPoses[i] || selectedPoses[0] || model,
              cloth: smartCloth,
            };
          });
        } else {
          // Multi-model batch: generate images equal to the number of uploaded/selected models
          batchItems = Array.from({ length: multiBatchCount }, (_, i) => {
            const m = effectiveModels[i % effectiveModels.length] || model;
            const c = effectiveClothes[i % effectiveClothes.length] || effectiveClothes[0] || cloth;
            return {
              id: `model-${i + 1}`,
              name: m?.name || `Model ${i + 1}`,
              angle: `Model ${i + 1} of ${multiBatchCount}`,
              icon: `#${i + 1}`,
              model: m,
              cloth: c,
            };
          });
        }

        const initialPoses: PoseItem[] = batchItems.map((spec, i) => ({
          id: spec.id,
          name: spec.name,
          angle: spec.angle,
          icon: spec.icon,
          promptSuffix: spec.promptSuffix || '',
          status: i === 0 ? 'generating' : 'pending',
        }));

        setFivePoseItems(initialPoses);
        setSelectedPoseIndex(0);
        activePoseIndexRef.current = 0;
        batchPayloadRef.current = {
          isFivePose: isFivePoseBatch,
          total: batchItems.length,
          payload,
          basePrompt: prompt.trim(),
          items: batchItems,
        };

        const firstItem = batchItems[0];
        setProgress(5);
        setProgressLabel(`Starting ${isFivePoseBatch ? `Pose 1 of 5 (${FIVE_POSES_SPECS[0].name})` : `Model 1 of ${multiBatchCount} (${firstItem.name})`}…`);

        const firstPayload: Record<string, unknown> = {
          ...payload,
          ...(firstItem.model?.url ? { model: firstItem.model.url } : {}),
          ...(firstItem.cloth?.url ? { cloth: firstItem.cloth.url, source: firstItem.cloth.url } : {}),
        };
        if (isFivePoseBatch && firstItem.promptSuffix) {
          firstPayload.prompt = `${prompt.trim()} · ${firstItem.promptSuffix}`.trim();
        }

        const res1 = await api.generate(firstPayload);
        if (res1.credits !== undefined && user) {
          setUser({ ...user, credits: res1.credits });
        }
        setJob({ id: res1.id, status: 'starting' });
      } else {
        setFivePoseItems([]);
        activePoseIndexRef.current = -1;
        batchPayloadRef.current = null;
        setProgress(5);
        setProgressLabel(isEditingRender ? 'Applying AI edits to render…' : 'Initiating GPU render…');

        const res = await api.generate(payload);
        if (res.credits !== undefined && user) {
          setUser({ ...user, credits: res.credits });
        }
        setJob({ id: res.id, status: 'starting' });
      }
    } catch (e) {
      let msg = e instanceof Error ? e.message : 'Generation failed';
      if (msg.toLowerCase().includes('rendering is off') || msg.toLowerCase().includes('no render key')) {
        msg = 'The render service key was rejected. Please contact support or try again later.';
      }
      setError(msg);
      setBusy(false);
      setProgress(0);
      setProgressLabel('');
      generatingRef.current = false;
      activePoseIndexRef.current = -1;
      batchPayloadRef.current = null;
      setIsEditingRender(false);
    }
  }

  function handleUseSet(set: UploadSet) {
    if (set.clothUrl) setCloth({ url: set.clothUrl, name: set.clothName || 'Set Garment' });
    if (set.modelUrl) setModel({ url: set.modelUrl, name: set.modelName || 'Set Model' });
    if (set.prompt) setPrompt(set.prompt);
    setPageView('studio');
  }

  const ready = Boolean(settings?.ready);
  const isSwapMode = mode === 'swap';
  const swapMissing: string[] = [];
  if (isSwapMode) {
    if (!swapSource) swapMissing.push('source model (Kis Model ko change karna hai)');
    if (!swapTarget) swapMissing.push('target model (Kis Model ke sath change karna hai)');
  }
  const tryonMissing: string[] = [];
  if (mode === 'tryon') {
    const hasGarment = hasClassifiedGarments || !!cloth;
    const needsBottom = hasClassifiedGarments && tryOnTarget !== 'upper' && !bottomGarment;
    if (!hasGarment) tryonMissing.push('garment');
    if (!model) tryonMissing.push('model');
    if (needsBottom) tryonMissing.push('bottom garment (pants/lower)');
  }
  const missing = isSwapMode ? swapMissing : tryonMissing;
  const isFreeUser = !user?.tier || user?.tier === 'free';
  const isLocked = Boolean(user?.creditsLocked);
  const canRun = ready && !isGlobalBusy && missing.length === 0 && !uploading && !isLocked;

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className={`min-h-screen selection:bg-[#e5373f] selection:text-white font-sans antialiased transition-colors ${
      isLight ? 'bg-[#97c1a9] text-gray-900' : 'bg-[#08080a] text-white'
    }`}>
      {/* 2K Resolution Tier Lock Modal */}
      {showTierLockModal && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl border border-amber-500/40 bg-[#121217] p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">2K Ultra HD locked</h3>
                <p className="text-xs text-amber-300/80">Starter accounts are limited to 1K Standard resolution</p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-black/50 p-4 text-xs leading-relaxed text-white/70 space-y-2">
              <p>
                New and Free Starter accounts can generate in <strong className="text-white">1K Standard Quality</strong>.
              </p>
              <p>
                <strong className="text-amber-300">2K Ultra HD & 4K Studio Renders</strong> are available on On-Demand, Pro, and Ultra membership tiers with dedicated neural GPU allocations.
              </p>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowTierLockModal(false)}
                className="flex-1 rounded-full border border-white/20 py-2 text-xs font-semibold text-white/60 hover:text-white"
              >
                Keep 1K resolution
              </button>
              <a
                href="/pricing"
                className="flex-1 text-center rounded-full bg-amber-500 py-2 text-xs font-semibold uppercase tracking-wider text-black hover:bg-amber-400 transition-colors"
              >
                View plans & upgrade &rarr;
              </a>
            </div>
          </div>
        </div>
      )}

      {/* "Are You Sure?" Generation Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-2xl border border-white/20 bg-[#121217] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-semibold text-white">
                {isEditingRender
                  ? 'Confirm image edit'
                  : isFivePoseBatch
                    ? 'Confirm 5-pose sequence'
                    : mode === 'swap'
                      ? 'Confirm model swap'
                      : 'Confirm virtual try-on'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmModal(false);
                  setIsEditingRender(false);
                }}
                className="text-white/40 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <p className="text-xs text-white/80 leading-relaxed">
                {isEditingRender
                  ? 'Are you sure you want to apply this AI edit to your generated image?'
                  : isFivePoseBatch
                    ? 'Are you sure you want to proceed with this 5-pose multi-angle sequence?'
                    : multiBatchCount > 1
                      ? `Are you sure you want to generate ${multiBatchCount} images for all selected models?`
                      : mode === 'swap'
                        ? 'Are you sure you want to proceed with this Model Swap?'
                        : 'Are you sure you want to proceed with this render?'}
              </p>

              <div className="rounded-xl border border-white/10 bg-black/50 p-3.5 space-y-2 text-xs">
                {isEditingRender ? (
                  <>
                    <div className="flex justify-between text-white/60">
                      <span>Task:</span>
                      <span className="font-semibold text-white">Image Edit</span>
                    </div>
                    <div className="flex justify-between text-white/60">
                      <span>Base Reference:</span>
                      <span className="font-semibold text-emerald-400">Current Studio Render</span>
                    </div>
                    <div className="flex justify-between text-white/60">
                      <span>Selected Quality:</span>
                      <span className="font-semibold text-white uppercase">{quality} ({creditCost} Credit{creditCost > 1 ? 's' : ''})</span>
                    </div>
                  </>
                ) : isFivePoseBatch ? (
                  <>
                    <div className="flex justify-between text-white/60">
                      <span>Batch:</span>
                      <span className="font-semibold text-white">5-Pose Sequence (Front, 3/4, Profile, Back, Action)</span>
                    </div>
                    <div className="flex justify-between text-white/60">
                      <span>Total Poses:</span>
                      <span className="font-semibold text-amber-400">5 Distinct Studio Angles</span>
                    </div>
                  </>
                ) : multiBatchCount > 1 ? (
                  <>
                    <div className="flex justify-between text-white/60">
                      <span>Batch:</span>
                      <span className="font-semibold text-white">Multi-Model Studio Generation</span>
                    </div>
                    <div className="flex justify-between text-white/60">
                      <span>Total Models:</span>
                      <span className="font-semibold text-amber-400">{multiBatchCount} Models ({totalRequiredCredits} Credits Total)</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between text-white/60">
                      <span>Mode:</span>
                      <span className="font-semibold text-white">{mode === 'swap' ? 'Model Swap' : activeMode.label}</span>
                    </div>
                    <div className="flex justify-between text-white/60">
                      <span>Selected Quality:</span>
                      <span className="font-semibold text-white uppercase">{quality === '1k' ? '1K Standard (1 Credit)' : '2K Ultra HD (3 Credits)'}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-white/60">
                  <span>Engine Pipeline:</span>
                  <span className="font-semibold text-emerald-400">SHIV-NARESH Neural Atelier</span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowConfirmModal(false);
                  setIsEditingRender(false);
                }}
                className="flex-1 rounded-full border border-white/20 py-2.5 text-xs font-semibold text-white/60 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void runActualGeneration()}
                className="flex-1 rounded-full bg-[#e5373f] py-2.5 text-xs font-semibold uppercase tracking-wider text-white hover:bg-[#d42d35]"
              >
                Yes, {isEditingRender ? 'Generate Edit' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Profile Modal */}
      {showProfileModal && user && (
        <UserProfileModal
          user={user}
          onClose={() => setShowProfileModal(false)}
          onUserUpdated={(u) => setUser(u)}
          isLight={isLight}
        />
      )}

      {/* Main Studio Header */}
      <header className={`sticky top-0 z-40 border-b backdrop-blur-md transition-colors ${
        isLight ? 'border-gray-200 bg-white/95' : 'border-white/10 bg-[#08080a]/90'
      }`}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8">
          <div className="flex items-center gap-3">
            <a href="/" className={`flex items-center gap-2 text-xs font-semibold tracking-[0.2em] ${isLight ? 'text-gray-900' : 'text-white'}`}>
              <img src="/brand-mark-white.png" alt="Shiv-Naresh" className={`h-4 w-auto ${isLight ? 'invert' : ''}`} />
              SHIV-NARESH
            </a>
            <span className={`hidden sm:inline-block rounded-full px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest ${
              isLight ? 'bg-gray-100 text-gray-500' : 'bg-white/5 text-white/50'
            }`}>
              STUDIO
            </span>
          </div>

          <div className="flex items-center gap-3 sm:gap-4 text-xs">
            {/* Theme Toggle */}
            <ThemeToggle theme={theme} toggleTheme={toggleTheme} />

            {/* Top Right Credit Status Pill — Visible Across ALL Tabs */}
            <a
              href="/pricing"
              className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1.5 text-xs font-semibold text-amber-500 hover:border-amber-400 hover:bg-amber-500/20 transition-all shadow-sm"
              title="Click to view pricing & upgrade credits"
            >
              <span>{user ? user.credits : 10} credits</span>
              {user?.tier && (
                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.2 rounded-full ${
                  user.tier === 'enterprise'
                    ? 'bg-purple-500/30 text-purple-400'
                    : user.tier === 'pro'
                      ? 'bg-blue-500/30 text-blue-400'
                      : isLight ? 'bg-gray-200 text-gray-700' : 'bg-white/10 text-white/60'
                }`}>
                  {user.tier}
                </span>
              )}
              <span className="text-[10px] font-semibold uppercase text-[#facc15] bg-black/40 px-1.5 py-0.5 rounded-full ml-1">
                + Upgrade
              </span>
            </a>

            {/* User Profile Button */}
            {user && (
              <button
                type="button"
                onClick={() => setShowProfileModal(true)}
                className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
                  isLight
                    ? 'border-gray-300 bg-gray-50 text-gray-800 hover:bg-gray-100 hover:border-gray-400 shadow-sm'
                    : 'border-white/15 bg-white/5 text-white hover:bg-white/10 hover:border-white/30'
                }`}
                title="View & Edit Profile"
              >
                {user.avatar ? (
                  <img src={user.avatar} alt="Profile" className="h-5 w-5 rounded-full object-cover ring-1 ring-[#e5373f]" />
                ) : (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#e5373f] text-[10px] font-bold text-white">
                    {user.name ? user.name[0].toUpperCase() : <UserIcon className="h-3 w-3 text-white" />}
                  </span>
                )}
                <span className="hidden md:inline-block max-w-[100px] truncate">{user.name || 'Profile'}</span>
              </button>
            )}

            <div className={`h-4 w-px hidden sm:block ${isLight ? 'bg-gray-200' : 'bg-white/10'}`} />

            <a href="/pricing" className={`hidden sm:inline-block transition-colors ${isLight ? 'text-gray-500 hover:text-gray-900' : 'text-white/50 hover:text-white'}`}>
              Pricing
            </a>

            <button
              type="button"
              onClick={() => {
                setToken('');
                window.location.replace('/login');
              }}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-all duration-200 shadow-sm ${
                isLight
                  ? 'border-red-200 bg-red-50/70 text-red-700 hover:border-red-400 hover:bg-red-100 hover:text-red-900'
                  : 'border-red-500/30 bg-red-500/10 text-red-400 hover:border-red-500/60 hover:bg-red-500/20 hover:text-red-300'
              }`}
              title="Sign out of your account"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Sign out</span>
            </button>
          </div>
        </div>

        {/* Studio Sub-Navigation Tabs */}
        <div className={`border-t transition-colors ${isLight ? 'border-gray-200 bg-gray-50/80' : 'border-white/[0.06] bg-black/30'}`}>
          <div className="mx-auto flex max-w-6xl px-5 sm:px-8 gap-1 overflow-x-auto no-scrollbar">
            {[
              { id: 'studio', label: 'Studio Canvas' },
              { id: 'my-sets', label: 'My Sets' + (uploadSets.length ? ` (${uploadSets.length})` : '') },
              { id: 'custom-requests', label: 'Custom Requests' + (customRequests.length ? ` (${customRequests.length})` : '') },
              { id: 'video', label: 'Video Studio' },
            ].map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => {
                  setPageView(v.id as typeof pageView);
                  if (v.id === 'custom-requests') {
                    void loadCustomRequests();
                    api.me().then((res) => { if (res.user) setUser(res.user); }).catch(() => {});
                  }
                }}
                className={`border-b-2 px-4 py-3 text-xs font-medium tracking-normal transition-colors whitespace-nowrap ${
                  pageView === v.id
                    ? 'border-[#e5373f] ' + (isLight ? 'text-gray-900' : 'text-white')
                    : 'border-transparent ' + (isLight ? 'text-gray-500 hover:text-gray-900' : 'text-white/40 hover:text-white/80')
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Warning banner if credits locked by admin */}
      {user?.creditsLocked && (
        <div className="border-b border-rose-500/40 bg-rose-500/15 py-3">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 text-xs text-rose-300 sm:px-8 font-medium">
            <Lock className="h-4 w-4" />
            <span>
              <strong>Account Credits Locked by Admin:</strong> Your ability to generate new renders or submit custom orders has been restricted. Please contact support.
            </span>
          </div>
        </div>
      )}

      {/* Warning banner if API key missing */}
      {settings && !settings.ready && (
        <div className="border-b border-[#ff6b6b]/30 bg-[#ff6b6b]/10">
          <div className="mx-auto max-w-6xl px-5 py-2.5 text-xs text-[#ff9aa0] sm:px-8">
            Rendering engine is initializing. If generation is not ready, please contact support.
          </div>
        </div>
      )}

      {/* ============= MY SETS VIEW ============= */}
      {pageView === 'my-sets' && (
        <MySetsPanel
          uploadSets={uploadSets}
          loadingSets={loadingSets}
          generations={userGenerations}
          loadingGenerations={loadingGenerations}
          setError={setError}
          onUseSet={handleUseSet}
          refreshSets={loadUploadSets}
          refreshGenerations={loadUserGenerations}
          onDeleteGeneration={(id) => setUserGenerations((prev) => prev.filter((g) => g.id !== id))}
          isLight={isLight}
        />
      )}

      {/* ============= CUSTOM REQUESTS VIEW ============= */}
      {pageView === 'custom-requests' && (
        <CustomRequestsPanel
          requests={customRequests}
          loading={loadingRequests}
          onRefresh={() => {
            void loadCustomRequests();
            api.me().then((res) => { if (res.user) setUser(res.user); }).catch(() => {});
          }}
          creditsLocked={isLocked}
          customRequestsLocked={
            !(user?.tier === 'pro' || user?.tier === 'ultra' || user?.features?.customRequests === true)
          }
          isLight={isLight}
        />
      )}

      {/* ============= VIDEO VIEW ============= */}
      {pageView === 'video' && (
        <VideoStudioPanel
          user={user}
          setUser={setUser}
          isLight={isLight}
          isGlobalBusy={isGlobalBusy}
          setIsGlobalBusy={setVideoBusy}
          onGenerationSaved={(gen) => setUserGenerations((prev) => [gen, ...prev.filter((g) => g.id !== gen.id)])}
        />
      )}

      {/* ============= STUDIO VIEW ============= */}
      {pageView === 'studio' && (
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_400px]">
          {/* Main Controls Form */}
          <section className="space-y-6">
            <div>
              <h1 className={`text-2xl font-bold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>Virtual Try-On Studio</h1>
              <p className={`mt-1 text-xs ${isLight ? 'text-slate-800' : 'text-white/50'}`}>
                Fit your garments onto studio models or swap outfits seamlessly.
              </p>
            </div>

            {/* Mode Selector */}
            <div className="flex flex-wrap gap-2">
              {MODES.map((m) => {
                const active = mode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMode(m.id)}
                    className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition-all ${
                      active
                        ? isLight
                          ? 'bg-[#78a48b] text-slate-900 font-bold shadow-md ring-1 ring-[#6b997e]'
                          : 'bg-white text-gray-900 shadow-md ring-1 ring-white'
                        : isLight
                          ? 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300'
                          : 'border border-white/10 bg-white/[0.03] text-white/60 hover:border-white/30 hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>

            {/* Resolution / Quality & 5-Pose Mode Pickers */}
            <div className={`rounded-2xl border p-4 flex flex-wrap items-center justify-between gap-4 ${
              isLight ? 'border-gray-200 bg-white text-gray-900 shadow-sm' : 'border-white/10 bg-white/[0.02]'
            }`}>
              <div>
                <span className={`text-[10px] font-bold uppercase tracking-wider block mb-1 ${isLight ? 'text-slate-900' : 'text-white/40'}`}>
                  Render Quality
                </span>
                <div className={`inline-flex rounded-full border p-1 ${isLight ? 'border-gray-200 bg-gray-100' : 'border-white/15 bg-black/40'}`}>
                  <button
                    type="button"
                    onClick={() => setQuality('1k')}
                    className={`rounded-full px-3.5 py-1 text-xs font-semibold transition-colors ${
                      quality === '1k'
                        ? isLight ? 'bg-white text-slate-900 font-bold shadow-sm' : 'bg-white text-gray-900'
                        : isLight ? 'text-slate-800 hover:text-slate-950 font-medium' : 'text-white/60 hover:text-white'
                    }`}
                  >
                    1K Standard
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (isFreeUser) {
                        setShowTierLockModal(true);
                      } else {
                        setQuality('2k');
                      }
                    }}
                    className={`rounded-full px-3.5 py-1 text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                      quality === '2k'
                        ? isLight ? 'bg-white text-slate-900 font-bold shadow-sm' : 'bg-white text-gray-900'
                        : isFreeUser
                          ? isLight ? 'text-slate-600 hover:text-slate-800' : 'text-white/40 hover:text-white/60'
                          : isLight ? 'text-slate-800 hover:text-slate-950 font-medium' : 'text-white/60 hover:text-white'
                    }`}
                    title={isFreeUser ? '2K Ultra HD is locked for Free/Starter accounts. Upgrade to Pro/Enterprise.' : 'Switch to 2K Ultra HD'}
                  >
                    {isFreeUser && <Lock className="h-3 w-3" />}
                    <span>2K Ultra HD</span>
                    {isFreeUser && (
                      <span className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold border ${
                        isLight ? 'bg-amber-100 text-amber-950 border-amber-300' : 'bg-amber-500/20 text-amber-500 border border-amber-500/30'
                      }`}>
                        Pro
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {mode === 'tryon' && (
                <div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider block mb-1 ${isLight ? 'text-slate-900' : 'text-white/40'}`}>
                    Multi-Angle Batch
                  </span>
                  <div className={`inline-flex rounded-full border p-1 ${isLight ? 'border-gray-200 bg-gray-100' : 'border-white/15 bg-black/40'}`}>
                    <button
                      type="button"
                      onClick={() => setPoseMode('single')}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                        poseMode === 'single'
                          ? isLight ? 'bg-white text-slate-900 font-bold shadow-sm' : 'bg-white text-gray-900'
                          : isLight ? 'text-slate-800 hover:text-slate-950 font-medium' : 'text-white/60 hover:text-white'
                      }`}
                    >
                      Single Pose
                    </button>
                    <button
                      type="button"
                      onClick={() => setPoseMode('5-pose')}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                        poseMode === '5-pose' ? 'bg-[#e5373f] text-white shadow-sm' : isLight ? 'text-slate-800 hover:text-slate-950 font-medium' : 'text-white/60 hover:text-white'
                      }`}
                    >
                      5-Pose Sequence
                    </button>
                  </div>
                </div>
              )}
            </div>
            {/* MAIN CONTROLS: MODEL SWAP (2 SLOTS) OR TRY-ON */}
            {mode === 'swap' ? (
              <>
                {/* SLOT 1: Kis Model ko change karna hai (Source Model / Original Outfit) */}
                <div className={`rounded-2xl border p-5 ${isLight ? 'border-gray-200 bg-white text-gray-900 shadow-sm' : 'border-white/10 bg-white/[0.02]'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className={`text-[11px] font-bold uppercase tracking-[0.18em] ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        1 &middot; Kis Model ko change karna hai
                      </h2>
                      <p className={`text-[10px] mt-0.5 ${isLight ? 'text-slate-800' : 'text-white/40'}`}>
                        Upload the photo/model whose body or outfit you want to keep while replacing the model/face
                      </p>
                    </div>
                    {swapSource && (
                      <button
                        type="button"
                        onClick={() => setSwapSource(null)}
                        className={`text-[11px] uppercase tracking-[0.14em] font-semibold ${isLight ? 'text-rose-700 hover:text-rose-900' : 'text-rose-400 hover:text-rose-300'}`}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <input
                    ref={swapSourceInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const dataUrl = await fileToDataUrl(file);
                      setSwapSource({ url: dataUrl, name: file.name });
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => swapSourceInput.current?.click()}
                    className={`mt-4 flex w-full items-center gap-4 rounded-xl border border-dashed p-4 text-left transition ${
                      isLight
                        ? 'border-gray-300 bg-gray-50/70 hover:bg-gray-100 hover:border-gray-400'
                        : 'border-white/15 hover:border-white/35'
                    }`}
                  >
                    {swapSource ? (
                      <img src={swapSource.preview ?? swapSource.url} alt="Source Model" className="h-20 w-16 rounded-lg object-cover border-2 border-[#e5373f]" />
                    ) : (
                      <span className={`grid h-20 w-16 place-items-center rounded-lg text-2xl ${isLight ? 'bg-gray-100 text-gray-500' : 'bg-white/5 text-white/30'}`}>+</span>
                    )}
                    <span className="text-sm">
                      <span className={`block font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        {swapSource ? swapSource.name : 'Choose Source Model (Kis Model ko change karna hai)'}
                      </span>
                      <span className={`mt-1 block text-[11px] ${isLight ? 'text-slate-800' : 'text-white/40'}`}>
                        PNG, JPEG or WEBP &middot; Click to browse or replace photo
                      </span>
                    </span>
                  </button>
                </div>

                {/* SLOT 2: Kis Model ke sath change karna hai (Target Model / Persona) */}
                <div className={`rounded-2xl border p-5 ${isLight ? 'border-gray-200 bg-white text-gray-900 shadow-sm' : 'border-white/10 bg-white/[0.02]'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className={`text-[11px] font-bold uppercase tracking-[0.18em] ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        2 &middot; Kis Model ke sath change karna hai
                      </h2>
                      <p className={`text-[10px] mt-0.5 ${isLight ? 'text-slate-800' : 'text-white/40'}`}>
                        Choose from library or upload the new model / face persona to swap in
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.14em]">
                      <button
                        type="button"
                        onClick={() => setSwapTab('library')}
                        className={swapTab === 'library' ? (isLight ? 'text-slate-900 font-bold underline' : 'text-white font-bold') : (isLight ? 'text-slate-700 hover:text-slate-900' : 'text-white/40 hover:text-white')}
                      >
                        Library
                      </button>
                      <button
                        type="button"
                        onClick={() => setSwapTab('uploads')}
                        className={swapTab === 'uploads' ? (isLight ? 'text-slate-900 font-bold underline' : 'text-white font-bold') : (isLight ? 'text-slate-700 hover:text-slate-900' : 'text-white/40 hover:text-white')}
                      >
                        Uploads
                      </button>
                      <button
                        type="button"
                        onClick={() => swapTargetInput.current?.click()}
                        className="text-[#e5373f] hover:underline font-semibold"
                      >
                        + Upload Target
                      </button>
                    </div>
                  </div>
                  <input
                    ref={swapTargetInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const dataUrl = await fileToDataUrl(file);
                      setSwapTarget({ url: dataUrl, name: file.name });
                    }}
                  />

                  {swapTarget && (
                    <div className={`mt-4 flex items-center justify-between rounded-xl border p-2.5 ${isLight ? 'border-gray-200 bg-gray-50' : 'border-white/15 bg-white/[0.04]'}`}>
                      <div className="flex items-center gap-3">
                        <img src={swapTarget.preview ?? swapTarget.url} alt="Target Model" className="h-14 w-11 rounded-md object-cover border-2 border-[#e5373f]" />
                        <div className="text-xs">
                          <p className={`font-semibold ${isLight ? 'text-gray-900' : 'text-white'}`}>Target Model Persona</p>
                          <p className={isLight ? 'text-gray-500' : 'text-white/40'}>{swapTarget.name}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSwapTarget(null)}
                        className={`text-xs px-2.5 py-1 rounded-lg ${isLight ? 'text-rose-600 hover:bg-rose-50' : 'text-rose-400 hover:bg-rose-950/40'}`}
                      >
                        Remove
                      </button>
                    </div>
                  )}

                  <div className="mt-4 max-h-[360px] overflow-y-auto pr-1">
                    {swapTab === 'library' &&
                      categories.map((group) => (
                        <div key={group.category} className="mb-4">
                          <p className={`mb-2 text-[10px] uppercase tracking-[0.18em] ${isLight ? 'text-gray-400' : 'text-white/35'}`}>{group.category}</p>
                          <div className="grid grid-cols-6 gap-2">
                            {group.items.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => setSwapTarget({ url: item.url, name: item.name })}
                                className={`overflow-hidden rounded-md border transition ${
                                  swapTarget?.url === item.url ? 'border-[#e5373f] ring-1 ring-[#e5373f]' : (isLight ? 'border-gray-200 hover:border-gray-400' : 'border-transparent hover:border-white/30')
                                }`}
                              >
                                <img src={item.url} alt={item.name} loading="lazy" className="aspect-[3/4] w-full object-cover" />
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}

                    {swapTab === 'uploads' &&
                      (uploads.length ? (
                        <div className="grid grid-cols-6 gap-2">
                          {uploads.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setSwapTarget({ url: item.url, name: item.name })}
                              className={`overflow-hidden rounded-md border transition ${
                                swapTarget?.url === item.url ? 'border-[#e5373f]' : (isLight ? 'border-gray-200 hover:border-gray-400' : 'border-transparent hover:border-white/30')
                              }`}
                            >
                              <img src={item.url} alt="" className="aspect-[3/4] w-full object-cover" />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className={`py-6 text-center text-xs ${isLight ? 'text-gray-400' : 'text-white/35'}`}>No custom models uploaded yet.</p>
                      ))}
                  </div>
                </div>

                {/* SLOT 3: Instructions */}
                <div className={`rounded-2xl border p-5 ${isLight ? 'border-gray-200 bg-white text-gray-900 shadow-sm' : 'border-white/10 bg-white/[0.02]'}`}>
                  <div className="flex items-center justify-between">
                    <h2 className={`text-[11px] font-bold uppercase tracking-[0.2em] ${isLight ? 'text-slate-900' : 'text-white/60'}`}>
                      3 &middot; Swap Instructions (Optional)
                    </h2>
                  </div>
                  <textarea
                    value={swapPrompt}
                    onChange={(e) => setSwapPrompt(e.target.value)}
                    rows={3}
                    placeholder="e.g. Preserve garment texture and athletic posture, blend lighting naturally, high fidelity face swap"
                    className={`mt-3 w-full resize-y rounded-xl border p-3 text-xs focus:outline-none transition-colors ${
                      isLight
                        ? 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-[#e5373f]'
                        : 'bg-black/40 border-white/10 text-white placeholder:text-white/25 focus:border-white/40'
                    }`}
                  />
                </div>
              </>
            ) : (
              <>
                {/* Smart Garment Upload Block */}
                <div className={`rounded-2xl border p-5 ${isLight ? 'border-gray-200 bg-white text-gray-900 shadow-sm' : 'border-white/10 bg-white/[0.02]'}`}>
                  <div className="flex items-center justify-between">
                    <h2 className={`text-[11px] font-bold uppercase tracking-[0.2em] ${isLight ? 'text-slate-900' : 'text-white/60'}`}>
                      1 · Garments
                    </h2>
                    {(classifiedGarments.length > 0 || cloth) && (
                      <button
                        type="button"
                        onClick={() => {
                          setCloth(null);
                          setSelectedClothes([]);
                          setClassifiedGarments([]);
                        }}
                        className={`text-[11px] uppercase tracking-[0.14em] font-semibold ${isLight ? 'text-rose-700 hover:text-rose-900' : 'text-white/40 hover:text-white'}`}
                      >
                        Clear All
                      </button>
                    )}
                  </div>

                  {/* Try-On Target Selector */}
                  <div className="mt-4 mb-3">
                    <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${isLight ? 'text-slate-600' : 'text-white/40'}`}>
                      What to Change?
                    </p>
                    <div className={`inline-flex rounded-xl border p-1 w-full ${isLight ? 'border-gray-200 bg-gray-100' : 'border-white/10 bg-black/40'}`}>
                      {([
                        { id: 'upper', label: '👕 Upper Only', hint: 'Jacket, shirt, hoodie' },
                        { id: 'lower', label: '👖 Lower Only', hint: 'Pants, shorts' },
                        { id: 'both', label: '✨ Full Outfit', hint: 'Top + Bottom together' },
                      ] as { id: TryOnTarget; label: string; hint: string }[]).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setTryOnTarget(opt.id)}
                          title={opt.hint}
                          className={`flex-1 rounded-lg py-2 px-1 text-[10px] font-semibold transition-all text-center ${
                            tryOnTarget === opt.id
                              ? isLight ? 'bg-white text-slate-900 shadow-sm font-bold ring-1 ring-gray-200' : 'bg-white text-gray-900 font-bold shadow-sm'
                              : isLight ? 'text-gray-600 hover:text-gray-900' : 'text-white/50 hover:text-white'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {tryOnTarget === 'both' && (
                      <p className={`mt-1.5 text-[10px] leading-relaxed ${isLight ? 'text-blue-700' : 'text-blue-300'}`}>
                        ✨ Full outfit: upload top + bottom garments. 1 credit per final image (backend chains 2 API calls automatically).
                      </p>
                    )}
                  </div>

                  <input
                    ref={clothInput}
                    type="file"
                    multiple
                    accept="image/*,.png,.jpg,.jpeg,.webp"
                    className="hidden"
                    onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
                    onChange={(e) => void handleMultipleFiles(e.target.files, 'cloth')}
                  />

                  {/* Classified Garments Grid */}
                  {classifiedGarments.length > 0 ? (
                    <div className="mt-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className={`text-[11px] font-semibold ${isLight ? 'text-slate-700' : 'text-white/60'}`}>
                          {classifiedGarments.length} Garment{classifiedGarments.length > 1 ? 's' : ''} Uploaded · Auto-Classified
                        </span>
                        <button
                          type="button"
                          onClick={() => clothInput.current?.click()}
                          disabled={uploading}
                          className="text-[11px] font-bold text-[#e5373f] hover:underline"
                        >
                          + Add More
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {classifiedGarments.map((garment) => {
                          return (
                            <div key={garment.url} className={`group relative rounded-xl border overflow-hidden ${
                              isLight ? 'border-gray-200 bg-gray-50' : 'border-white/15 bg-black/40'
                            }`}>
                              <div className="aspect-[3/4] relative">
                                <img src={garment.preview ?? garment.url} alt={garment.name} className="h-full w-full object-cover" />
                                <button
                                  type="button"
                                  onClick={() => removeClassifiedGarment(garment.url)}
                                  className="absolute top-1 right-1 rounded-full bg-red-600/90 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Remove"
                                >
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </div>
                              {/* Role badge + dropdown */}
                              <div className="p-1.5">
                                <p className="text-[9px] text-center truncate text-white/70 mb-1">{garment.name}</p>
                                <select
                                  value={garment.role}
                                  onChange={(e) => updateGarmentRole(garment.url, e.target.value as GarmentRole)}
                                  className={`w-full rounded-lg border text-[9px] font-bold py-0.5 px-1 cursor-pointer ${
                                    isLight ? 'border-gray-200 bg-white text-gray-800' : 'border-white/10 bg-black/60 text-white'
                                  }`}
                                  title="Auto-detected category — click to change if wrong"
                                >
                                  <option value="tops-front">👕 Top Front</option>
                                  <option value="tops-back">🔄 Top Back</option>
                                  <option value="bottoms">👖 Bottom</option>
                                  <option value="unknown">❓ Unknown</option>
                                </select>
                              </div>
                            </div>
                          );
                        })}

                        <button
                          type="button"
                          onClick={() => clothInput.current?.click()}
                          disabled={uploading}
                          className={`flex aspect-[3/4] flex-col items-center justify-center rounded-xl border border-dashed p-2 text-center transition-colors ${
                            isLight ? 'border-gray-300 bg-gray-50/70 hover:bg-gray-100 hover:border-gray-400' : 'border-white/20 bg-black/30 hover:border-white/40 hover:bg-black/50'
                          }`}
                        >
                          <span className={`text-xl mb-1 ${isLight ? 'text-slate-800' : 'text-white/40'}`}>+</span>
                          <span className={`text-[10px] font-semibold ${isLight ? 'text-slate-900' : 'text-white/70'}`}>Add More</span>
                          <span className={`text-[9px] ${isLight ? 'text-slate-600' : 'text-white/30'}`}>Any order/angle</span>
                        </button>
                      </div>

                      {/* Smart role info */}
                      {tryOnTarget === 'both' && (
                        <div className={`rounded-xl border p-2.5 text-[10px] leading-relaxed ${
                          isLight ? 'border-blue-200 bg-blue-50 text-blue-900' : 'border-blue-500/30 bg-blue-500/10 text-blue-300'
                        }`}>
                          <strong>Full Outfit Smart Routing:</strong>
                          <br />
                          • <strong>Top</strong>: {topFrontGarment ? topFrontGarment.name : '⚠ No top garment detected'}
                          <br />
                          • <strong>Bottom</strong>: {bottomGarment ? bottomGarment.name : '⚠ No bottom/pants detected — upload pants image'}
                        </div>
                      )}
                      {tryOnTarget === 'upper' && topBackGarment && topBackGarment.url !== topFrontGarment?.url && (
                        <p className={`text-[10px] ${isLight ? 'text-indigo-700' : 'text-indigo-300'}`}>
                          🔄 Back photo detected — will auto-use for back-angle poses in 5-Pose Sequence mode.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        void handleMultipleFiles(e.dataTransfer.files, 'cloth');
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => clothInput.current?.click()}
                        disabled={uploading}
                        className={`mt-4 flex w-full items-center gap-4 rounded-xl border border-dashed p-4 text-left transition disabled:opacity-50 ${
                          isLight ? 'border-gray-300 bg-gray-50/70 hover:bg-gray-100 hover:border-gray-400' : 'border-white/15 hover:border-white/35'
                        }`}
                      >
                        {uploading && uploadProgress?.kind === 'cloth' ? (
                          <div className="flex items-center gap-3 w-full py-1">
                            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#e5373f] border-t-transparent" />
                            <div>
                              <span className={`block font-semibold text-xs ${isLight ? 'text-slate-900' : 'text-white'}`}>
                                Uploading {uploadProgress.current} of {uploadProgress.total} garments...
                              </span>
                              <span className={`block text-[11px] ${isLight ? 'text-slate-600' : 'text-white/50'}`}>
                                Auto-classifying each garment
                              </span>
                            </div>
                          </div>
                        ) : (
                          <>
                            <span className={`grid h-20 w-16 place-items-center rounded-lg text-2xl ${isLight ? 'bg-gray-100 text-gray-500' : 'bg-white/5 text-white/30'}`}>+</span>
                            <span className="text-sm">
                              <span className={`block font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                                Upload garment photos (any number, any order)
                              </span>
                              <span className={`mt-1 block text-[11px] ${isLight ? 'text-slate-800' : 'text-white/40'}`}>
                                Front, back, top, bottom — upload all photos, system auto-classifies · PNG, JPEG, WEBP
                              </span>
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* Precision Garment Color Matching */}
                <div className={`rounded-2xl border p-4 ${isLight ? 'border-gray-200 bg-white text-gray-900 shadow-sm' : 'border-white/10 bg-white/[0.02]'}`}>
                  <div className="flex items-center justify-between">
                    <h2 className={`text-xs font-medium tracking-normal ${isLight ? 'text-slate-900' : 'text-white/70'}`}>
                      Fabric Color / Dye Code
                    </h2>
                    {garmentColor && (
                      <button
                        type="button"
                        onClick={() => setGarmentColor('')}
                        className="text-[10px] font-bold text-red-400 hover:underline"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  <p className={`mt-0.5 text-[10px] ${isLight ? 'text-slate-800' : 'text-white/40'}`}>
                    Match exact kit shade to prevent color distortion or bleeding during generation.
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="color"
                      value={garmentColor.startsWith('#') && garmentColor.length === 7 ? garmentColor : '#e5373f'}
                      onChange={(e) => setGarmentColor(e.target.value)}
                      className="h-8 w-8 cursor-pointer rounded-lg border-0 bg-transparent p-0"
                      title="Pick exact fabric color"
                    />
                    <input
                      type="text"
                      value={garmentColor}
                      onChange={(e) => setGarmentColor(e.target.value)}
                      placeholder="e.g. #E5373F or Crimson Red, Navy Blue..."
                      className={`flex-1 rounded-xl border px-3 py-1.5 text-xs focus:outline-none ${
                        isLight
                          ? 'border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:border-[#e5373f]'
                          : 'border-white/10 bg-black/40 text-white placeholder:text-white/30'
                      }`}
                    />
                  </div>
                  {/* Athletic Quick Swatches */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {[
                      { name: 'Crimson Red', hex: '#E5373F' },
                      { name: 'Deep Navy', hex: '#0A192F' },
                      { name: 'Jet Black', hex: '#111111' },
                      { name: 'Optic White', hex: '#FFFFFF' },
                      { name: 'Royal Blue', hex: '#1D4ED8' },
                      { name: 'Neon Lime', hex: '#84CC16' },
                      { name: 'Gold', hex: '#EAB308' },
                      { name: 'Orange', hex: '#EA580C' },
                    ].map((sw) => (
                      <button
                        key={sw.name}
                        type="button"
                        onClick={() => setGarmentColor(`${sw.name} (${sw.hex})`)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] transition-all ${
                          garmentColor.includes(sw.hex)
                            ? 'border-[#e5373f] bg-[#e5373f]/20 font-bold'
                            : isLight
                              ? 'border-gray-300 bg-white text-gray-900 hover:border-gray-400'
                              : 'border-white/10 bg-black/30 text-white/70 hover:border-white/30'
                        }`}
                      >
                        <span className="h-2.5 w-2.5 rounded-full border border-black/20" style={{ backgroundColor: sw.hex }} />
                        <span>{sw.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Model Selection Block */}
                <div className={`rounded-2xl border p-5 ${isLight ? 'border-gray-200 bg-white text-gray-900 shadow-sm' : 'border-white/10 bg-white/[0.02]'}`}>
                  <div className="flex items-center justify-between">
                    <h2 className={`text-[11px] font-bold uppercase tracking-[0.2em] ${isLight ? 'text-slate-900' : 'text-white/60'}`}>2 &middot; Model</h2>
                    <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.14em]">
                      {(model || selectedModels.length > 0 || selectedPoses.length > 0) && (
                        <button
                          type="button"
                          onClick={() => {
                            setModel(null);
                            setSelectedModels([]);
                            setSelectedPoses([]);
                          }}
                          className={`font-semibold hover:underline ${isLight ? 'text-rose-700 hover:text-rose-900' : 'text-white/40 hover:text-white'}`}
                        >
                          Clear All
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setTab('library')}
                        className={tab === 'library' ? (isLight ? 'text-slate-900 font-bold underline' : 'text-white font-bold') : (isLight ? 'text-slate-700 hover:text-slate-900' : 'text-white/40 hover:text-white')}
                      >
                        Library
                      </button>
                      <button
                        type="button"
                        onClick={() => setTab('uploads')}
                        className={tab === 'uploads' ? (isLight ? 'text-slate-900 font-bold underline' : 'text-white font-bold') : (isLight ? 'text-slate-700 hover:text-slate-900' : 'text-white/40 hover:text-white')}
                      >
                        Uploads
                      </button>
                      <button
                        type="button"
                        onClick={() => modelInput.current?.click()}
                        disabled={uploading}
                        className="text-[#e5373f] hover:underline disabled:opacity-30 font-semibold"
                      >
                        + Upload Models
                      </button>
                    </div>
                  </div>
                  <input
                    ref={modelInput}
                    type="file"
                    multiple
                    accept="image/*,.png,.jpg,.jpeg,.webp"
                    className="hidden"
                    onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
                    onChange={(e) => void handleMultipleFiles(e.target.files, 'model')}
                  />

                  {uploading && uploadProgress?.kind === 'model' && (
                    <div className="mt-3 flex items-center gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-500">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent shrink-0" />
                      <span>Uploading {uploadProgress.current} of {uploadProgress.total} model images...</span>
                    </div>
                  )}

                  {/* Multi-Model Selector Grid (when multiple models uploaded or selected) */}
                  {selectedModels.length > 1 ? (
                    <div className="mt-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className={`text-[11px] font-semibold ${isLight ? 'text-slate-800' : 'text-white/70'}`}>
                          {selectedModels.length} Models Selected &middot; Click to set Active Try-On
                        </span>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedModels([]);
                              setModel(null);
                            }}
                            className={`text-[11px] font-medium hover:underline ${isLight ? 'text-slate-500 hover:text-slate-700' : 'text-white/50 hover:text-white'}`}
                          >
                            Clear All
                          </button>
                          <button
                            type="button"
                            onClick={() => modelInput.current?.click()}
                            disabled={uploading}
                            className="text-[11px] font-bold text-[#e5373f] hover:underline"
                          >
                            + Add More Models
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {selectedModels.map((item, idx) => {
                          const isCurrent = model?.url === item.url;
                          return (
                            <div
                              key={idx}
                              onClick={() => setModel(item)}
                              className={`group relative aspect-[3/4] overflow-hidden rounded-xl border transition-all cursor-pointer ${
                                isCurrent
                                  ? 'border-[#e5373f] ring-2 ring-[#e5373f] shadow-md scale-[1.02]'
                                  : isLight
                                    ? 'border-gray-200 bg-gray-50 hover:border-gray-400'
                                    : 'border-white/15 bg-black/40 hover:border-white/30'
                              }`}
                            >
                              <img src={item.preview ?? item.url} alt={item.name} className="h-full w-full object-cover" />
                              <span className={`absolute top-1.5 left-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold ${
                                isCurrent ? 'bg-[#e5373f] text-white shadow' : 'bg-black/75 text-white/90'
                              }`}>
                                {isCurrent ? 'Active Try-On' : `Model ${idx + 1}`}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeSelectedModel(idx);
                                }}
                                className="absolute top-1.5 right-1.5 rounded-full bg-red-600/90 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Remove model"
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                              <p className="absolute bottom-0 inset-x-0 bg-black/80 px-1.5 py-1 text-[9px] text-white truncate text-center font-medium">
                                {item.name}
                              </p>
                            </div>
                          );
                        })}

                        <button
                          type="button"
                          onClick={() => modelInput.current?.click()}
                          disabled={uploading}
                          className={`flex aspect-[3/4] flex-col items-center justify-center rounded-xl border border-dashed p-2 text-center transition-colors ${
                            isLight
                              ? 'border-gray-300 bg-gray-50/70 hover:bg-gray-100 hover:border-gray-400'
                              : 'border-white/20 bg-black/30 hover:border-white/40 hover:bg-black/50'
                          }`}
                        >
                          <span className={`text-xl mb-1 ${isLight ? 'text-slate-800' : 'text-white/40'}`}>+</span>
                          <span className={`text-[10px] font-semibold ${isLight ? 'text-slate-900' : 'text-white/70'}`}>+ Add More</span>
                          <span className={`text-[9px] ${isLight ? 'text-slate-700' : 'text-white/30'}`}>Models</span>
                        </button>
                      </div>
                    </div>
                  ) : model ? (
                    <div className={`mt-4 flex items-center justify-between rounded-xl border p-2.5 ${isLight ? 'border-gray-200 bg-gray-50' : 'border-white/15 bg-white/[0.04]'}`}>
                      <div className="flex items-center gap-3">
                        <img src={model.preview ?? model.url} alt="" className="h-14 w-11 rounded-md object-cover" />
                        <div className="text-xs">
                          <p className={`font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>Selected Model</p>
                          <p className={isLight ? 'text-slate-800' : 'text-white/40'}>{model.name}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setModel(null);
                          setSelectedModels([]);
                        }}
                        className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-500 transition-colors"
                        title="Deselect model"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}

                  {/* 5-Pose Selection Suite (Visible in 5-pose mode so user clearly sees and chooses all 5 poses) */}
                  {poseMode === '5-pose' && (
                    <div className={`mt-4 rounded-2xl border p-4 ${isLight ? 'border-amber-400 bg-amber-100/90 shadow-sm' : 'border-amber-500/40 bg-amber-500/10'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold ${isLight ? 'text-amber-950' : 'text-amber-400'}`}>
                            1 Photoshoot = 5 Poses (Multi-Angle Sequence)
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[9px] border ${
                            isLight ? 'bg-amber-200/90 text-amber-950 border-amber-400 font-black' : 'bg-amber-500/20 text-amber-300 border-amber-500/30 font-bold'
                          }`}>
                            {selectedPoses.filter(Boolean).length}/5 Poses Active
                          </span>
                        </div>
                        <span className={`text-[10px] ${isLight ? 'text-amber-950 font-bold' : 'text-amber-300/80 font-medium'}`}>Click slot then pick model below</span>
                      </div>

                      <div className="grid grid-cols-5 gap-2">
                        {FIVE_POSES_SPECS.map((spec, idx) => {
                          const poseItem = selectedPoses[idx] || (idx === 0 && selectedPoses.length === 0 ? model : null);
                          const isActiveSlot = activeSlotIndex === idx;
                          return (
                            <div
                              key={spec.id}
                              onClick={() => setActiveSlotIndex(idx)}
                              className={`relative rounded-xl border p-2 flex flex-col items-center text-center cursor-pointer transition ${
                                isActiveSlot
                                  ? 'border-[#e5373f] bg-[#e5373f]/15 ring-2 ring-[#e5373f] shadow-lg'
                                  : poseItem
                                    ? isLight ? 'border-amber-400 bg-black/75 shadow-sm' : 'border-amber-500/50 bg-black/60 shadow-sm'
                                    : isLight ? 'border-amber-300/60 bg-black/60 hover:border-amber-400' : 'border-white/10 bg-black/30 hover:border-white/30'
                              }`}
                            >
                              <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-black/80 mb-1.5 flex items-center justify-center border border-white/10">
                                {poseItem ? (
                                  <img
                                    src={poseItem.preview ?? poseItem.url}
                                    alt={spec.name}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <span className="text-xl opacity-60">{spec.icon}</span>
                                )}
                                <span className="absolute top-1 left-1 rounded bg-black/80 px-1 py-0.2 text-[8px] font-bold text-amber-400">
                                  #{idx + 1}
                                </span>
                                {poseItem && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removePoseSlot(idx);
                                    }}
                                    className="absolute top-1 right-1 rounded-full bg-red-600/90 text-white w-4 h-4 flex items-center justify-center hover:bg-red-500"
                                    title="Remove this pose"
                                  >
                                    <X className="h-2.5 w-2.5" />
                                  </button>
                                )}
                              </div>
                              <span className="text-[10px] font-bold truncate max-w-full text-white">{poseItem ? poseItem.name : spec.name}</span>
                              <span className="text-[9px] opacity-80 font-mono text-amber-200">{spec.angle}</span>
                            </div>
                          );
                        })}
                      </div>
                      <p className={`mt-2.5 text-[10px] leading-relaxed text-center ${isLight ? 'text-amber-950 font-bold' : 'text-amber-300/90'}`}>
                        Click any of the 5 pose slots above, then choose a model below to assign that angle.
                      </p>
                    </div>
                  )}

                  <div className="mt-4 max-h-[380px] overflow-y-auto pr-1">
                    {tab === 'library' &&
                      categories.map((group) => (
                        <div key={group.category} className="mb-4">
                          <p className={`mb-2 text-[10px] uppercase tracking-[0.18em] ${isLight ? 'text-gray-400' : 'text-white/35'}`}>{group.category}</p>
                          <div className="grid grid-cols-6 gap-2">
                            {group.items.map((item) => {
                              const isSelected =
                                (poseMode === '5-pose' && selectedPoses.some((p) => p?.url === item.url)) ||
                                selectedModels.some((p) => p && p.url === item.url) ||
                                model?.url === item.url;
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => toggleModelSelection({ url: item.url, name: item.name })}
                                  className={`group relative overflow-hidden rounded-md border transition ${
                                    isSelected
                                      ? 'border-[#e5373f] ring-2 ring-[#e5373f]'
                                      : isLight
                                        ? 'border-gray-200 hover:border-gray-400'
                                        : 'border-transparent hover:border-white/30'
                                  }`}
                                >
                                  <img src={item.url} alt={item.name} loading="lazy" className="aspect-[3/4] w-full object-cover" />
                                  {isSelected && (
                                    <span className="absolute top-1 right-1 rounded-full bg-[#e5373f] text-white w-4 h-4 flex items-center justify-center text-[10px] font-bold shadow">
                                      ✓
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}

                    {tab === 'uploads' &&
                      (uploads.length ? (
                        <div className="grid grid-cols-6 gap-2">
                          {uploads.map((item) => {
                            const isSelected =
                              (poseMode === '5-pose' && selectedPoses.some((p) => p?.url === item.url)) ||
                              selectedModels.some((p) => p && p.url === item.url) ||
                              model?.url === item.url;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => toggleModelSelection({ url: item.url, name: item.name })}
                                className={`group relative overflow-hidden rounded-md border transition ${
                                  isSelected
                                    ? 'border-[#e5373f] ring-2 ring-[#e5373f]'
                                    : isLight
                                      ? 'border-gray-200 hover:border-gray-400'
                                      : 'border-transparent hover:border-white/30'
                                }`}
                              >
                                <img src={item.url} alt="" className="aspect-[3/4] w-full object-cover" />
                                {isSelected && (
                                  <span className="absolute top-1 right-1 rounded-full bg-[#e5373f] text-white w-4 h-4 flex items-center justify-center text-[10px] font-bold shadow">
                                    ✓
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className={`py-6 text-center text-xs ${isLight ? 'text-gray-400' : 'text-white/35'}`}>No custom models uploaded yet.</p>
                      ))}
                  </div>
                </div>

                {/* Instructions Block */}
                <div className={`rounded-2xl border p-5 ${isLight ? 'border-gray-200 bg-white text-gray-900 shadow-sm' : 'border-white/10 bg-white/[0.02]'}`}>
                  <div className="flex items-center justify-between">
                    <h2 className={`text-[11px] font-bold uppercase tracking-[0.2em] ${isLight ? 'text-slate-900' : 'text-white/60'}`}>3 &middot; Instructions</h2>
                    {settings?.defaultPrompt && (
                      <button
                        type="button"
                        onClick={() => setPrompt(settings.defaultPrompt)}
                        className={`text-[11px] uppercase tracking-[0.14em] font-semibold ${isLight ? 'text-slate-700 hover:text-slate-950' : 'text-white/40 hover:text-white'}`}
                      >
                        Use default
                      </button>
                    )}
                  </div>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={3}
                    placeholder={settings?.defaultPrompt || 'e.g. tuck in the shirt, open jacket, athletic stadium lighting'}
                    className={`mt-3 w-full resize-y rounded-xl border p-3 text-xs focus:outline-none transition-colors ${
                      isLight
                        ? 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-[#e5373f]'
                        : 'bg-black/40 border-white/10 text-white placeholder:text-white/25 focus:border-white/40'
                    }`}
                  />
                </div>
              </>
            )}

            {/* Generate Trigger Button — Opens Confirmation Modal */}
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => {
                  if (isLocked) {
                    setError('Your account generation credits have been locked by an administrator.');
                    return;
                  }
                  if (isGlobalBusy) {
                    setError('Another generation is currently in progress. At one time only one generation is allowed.');
                    return;
                  }
                  if (canRun) setShowConfirmModal(true);
                }}
                disabled={!canRun || isGlobalBusy}
                className={`rounded-full px-8 py-3.5 text-xs font-semibold uppercase tracking-wider transition-all ${
                  isLocked
                    ? isLight ? 'cursor-not-allowed bg-rose-100 text-rose-700 border border-rose-300' : 'cursor-not-allowed bg-rose-600/20 text-rose-300 border border-rose-500/40'
                    : isGlobalBusy
                    ? isLight ? 'cursor-not-allowed bg-amber-100 text-amber-800 border border-amber-300' : 'cursor-not-allowed bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : canRun
                    ? isLight
                      ? 'bg-gray-900 text-white shadow-sm hover:bg-black'
                      : 'bg-white text-gray-900 shadow-sm hover:bg-gray-100'
                    : isLight
                    ? 'cursor-not-allowed bg-gray-200 text-gray-400'
                    : 'cursor-not-allowed bg-white/20 text-white/40'
                }`}
              >
                {isLocked
                  ? 'Credits locked by administrator'
                  : isGlobalBusy
                  ? 'Generation in Progress (Please wait)…'
                  : `Generate ${mode === 'swap' ? 'Swap' : ''} (${quality.toUpperCase()} · ${totalRequiredCredits} Credit${totalRequiredCredits > 1 ? 's' : ''}${multiBatchCount > 1 && !isFivePoseBatch ? ` for ${multiBatchCount} Models` : ''})`}
              </button>
              {isLocked ? (
                <p className="max-w-xs text-xs leading-relaxed text-rose-500">
                  Credits locked. Contact administrator to re-enable generations.
                </p>
              ) : error ? (
                <p className={`max-w-xs text-xs leading-relaxed ${isLight ? 'text-red-600' : 'text-[#ff9aa0]'}`}>{error}</p>
              ) : missing.length ? (
                <p className={`text-xs ${isLight ? 'text-amber-800 font-medium' : 'text-[#ffb3b7]'}`}>
                  Add {missing.join(' and ')} to start.
                </p>
              ) : !ready ? (
                <p className={`text-xs ${isLight ? 'text-amber-800' : 'text-[#ffb3b7]'}`}>No render API key configured. <a href="/admin" className="underline font-bold">Set it up &rarr;</a></p>
              ) : null}
            </div>
          </section>

          {/* Result Aside Canvas */}
          <aside className="space-y-5">
            <div className={`overflow-hidden rounded-3xl border ${isLight ? 'border-gray-200 bg-white text-gray-900 shadow-sm' : 'border-white/10 bg-white/[0.02]'}`}>
              <div className={`flex items-center justify-between border-b px-4 py-3 ${isLight ? 'border-gray-200 bg-gray-50 text-gray-900' : 'border-white/10'}`}>
                <span className={`text-[11px] font-bold uppercase tracking-[0.2em] ${isLight ? 'text-slate-900' : 'text-white/60'}`}>Result Canvas</span>
                <div className="flex items-center gap-3">
                  {busy && <span className={`text-[10px] ${isLight ? 'text-slate-700' : 'text-white/40'}`}>{fmtTime(elapsedSec)}</span>}
                  {job && <span className={`text-[10px] uppercase tracking-[0.16em] ${isLight ? 'text-slate-900 font-bold' : 'text-white/40'}`}>{job.status.replace('_', ' ')}</span>}
                </div>
              </div>

              {busy && (
                <div className={`border-b px-4 py-3 ${isLight ? 'border-gray-200' : 'border-white/10'}`}>
                  <div className={`flex items-center justify-between text-[11px] ${isLight ? 'text-slate-900 font-bold' : 'text-white/60'}`}>
                    <span>{progressLabel}</span>
                    <span className="font-mono">{Math.round(progress)}%</span>
                  </div>
                  <div className={`mt-2 h-1.5 overflow-hidden rounded-full ${isLight ? 'bg-[#78a48b]' : 'bg-white/10'}`}>
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: `${progress}%`,
                        background: progress >= 100 ? '#22c55e' : '#e5373f',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Batch Renders Strip (5-Pose or Multi-Model) */}
              {fivePoseItems.length > 0 && (
                <div className={`border-b p-3 ${isLight ? 'border-gray-200 bg-gray-50' : 'border-white/10 bg-black/30'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-900' : 'text-white/60'}`}>
                      {poseMode === '5-pose'
                        ? `5 Studio Angles (${fivePoseItems.filter(p => p.status === 'completed').length}/5 Completed)`
                        : `${fivePoseItems.length} Model Renders (${fivePoseItems.filter(p => p.status === 'completed').length}/${fivePoseItems.length} Completed)`}
                    </span>
                    <span className={`text-[10px] font-bold ${isLight ? 'text-amber-950 font-black' : 'text-amber-500'}`}>{creditCost} Credit / Render</span>
                  </div>
                  <div className={`grid gap-1.5 ${fivePoseItems.length <= 4 ? 'grid-cols-4' : 'grid-cols-5'}`}>
                    {fivePoseItems.map((pose, idx) => {
                      const isSelected = selectedPoseIndex === idx;
                      return (
                        <button
                          key={pose.id}
                          type="button"
                          onClick={() => {
                            setSelectedPoseIndex(idx);
                            if (pose.url) setResult(pose.url);
                          }}
                          className={`rounded-xl p-1.5 flex flex-col items-center justify-center text-center transition-all border ${
                            isSelected
                              ? 'border-[#e5373f] bg-[#e5373f]/15 ring-1 ring-[#e5373f]'
                              : isLight
                                ? 'border-gray-300 bg-white hover:bg-gray-50'
                                : 'border-white/10 bg-black/40 hover:border-white/20'
                          }`}
                        >
                          <span className="text-sm">{pose.icon}</span>
                          <span className={`text-[9px] font-bold truncate max-w-full mt-0.5 ${isLight ? 'text-slate-900' : 'text-white'}`}>{pose.name}</span>
                          <span className={`text-[8px] truncate ${isLight ? 'text-slate-700' : 'text-white/40'}`}>{pose.angle}</span>
                          <div className="mt-1">
                            {pose.status === 'completed' && <span className="text-[9px] text-emerald-600 font-medium">Ready</span>}
                            {pose.status === 'generating' && <span className={`text-[9px] font-medium ${isLight ? 'text-amber-950 font-bold' : 'text-amber-400'}`}>Active</span>}
                            {pose.status === 'pending' && <span className={`text-[9px] ${isLight ? 'text-slate-600' : 'text-white/40'}`}>Queue</span>}
                            {pose.status === 'failed' && <span className="text-[9px] text-rose-600 font-medium">Error</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className={`grid min-h-[360px] place-items-center p-4 ${isLight ? 'bg-gray-50' : 'bg-black/40'}`}>
                {result ? (
                  <img src={result} alt="Generated" className="max-h-[520px] w-full rounded-xl object-contain shadow-2xl" />
                ) : busy ? (
                  <div className="text-center">
                    <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                    <p className={`mt-3 text-xs ${isLight ? 'text-slate-900 font-medium' : 'text-white/50'}`}>{progressLabel || 'Rendering image…'}</p>
                    <p className={`mt-1 text-[10px] ${isLight ? 'text-slate-700' : 'text-white/30'}`}>Elapsed: {fmtTime(elapsedSec)}</p>
                  </div>
                ) : (
                  <p className={`max-w-[240px] text-center text-xs leading-relaxed ${isLight ? 'text-slate-800 font-medium' : 'text-white/30'}`}>
                    Your rendered fashion image appears here. Select quality and click Generate.
                  </p>
                )}
              </div>

              {result && (
                <div className={`flex flex-wrap gap-2 border-t p-3 ${isLight ? 'border-gray-200 bg-gray-50' : 'border-white/10'}`}>
                  <a
                    href={result}
                    download={`shivnaresh-${fivePoseItems[selectedPoseIndex]?.id || 'render'}.png`}
                    className={`rounded-full border px-4 py-1.5 text-xs transition-colors font-semibold ${
                      isLight
                        ? 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
                        : 'border-white/20 text-white/80 hover:text-white hover:border-white/50'
                    }`}
                  >
                    Download {poseMode === '5-pose' ? 'Current Angle' : 'Current Render'}
                  </a>
                  {fivePoseItems.filter(p => p.status === 'completed').length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        fivePoseItems.forEach((p, i) => {
                          if (p.url) {
                            const a = document.createElement('a');
                            a.href = p.url;
                            a.download = `shivnaresh-${p.id || `render-${i + 1}`}.png`;
                            a.target = '_blank';
                            setTimeout(() => a.click(), i * 350);
                          }
                        });
                      }}
                      className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-3.5 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-500/30"
                    >
                      ⬇️ Download All {fivePoseItems.length} {poseMode === '5-pose' ? 'Angles' : 'Renders'}
                    </button>
                  )}
                  <a
                    href={result}
                    target="_blank"
                    rel="noreferrer"
                    className={`rounded-full border px-4 py-1.5 text-xs transition-colors font-semibold ${
                      isLight
                        ? 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
                        : 'border-white/20 text-white/80 hover:text-white hover:border-white/50'
                    }`}
                  >
                    Open New Tab
                  </a>
                  <button
                    type="button"
                    onClick={() => setIsEditOpen((prev) => !prev)}
                    className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition-all ${
                      isEditOpen
                        ? 'bg-[#e5373f] text-white border-[#e5373f]'
                        : isLight
                          ? 'border-[#e5373f] text-[#e5373f] hover:bg-[#e5373f] hover:text-white'
                          : 'border-[#e5373f]/60 text-[#ff9aa0] hover:border-[#e5373f] hover:text-white'
                    }`}
                  >
                    {isEditOpen ? 'Close edit' : 'Edit render'}
                  </button>
                </div>
              )}

              {/* EDIT PANEL (Placed underneath generated image in Result Canvas) */}
              {result && isEditOpen && (
                <div className={`border-t p-4 transition-all ${
                  isLight ? 'border-gray-200 bg-gray-50 text-gray-900' : 'border-white/10 bg-black/40 text-white'
                }`}>
                  <div className="flex items-center justify-between border-b pb-2 mb-3 border-current/10">
                    <div className="flex items-center gap-2">
                      <Sliders className="h-4 w-4 text-current/70" />
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider">Edit Studio</h4>
                        <p className={`text-[10px] ${isLight ? 'text-gray-500' : 'text-white/50'}`}>
                          Takes current render as reference &middot; ({quality.toUpperCase()} · {creditCost} Credit{creditCost > 1 ? 's' : ''})
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsEditOpen(false)}
                      className="text-xs opacity-50 hover:opacity-100 p-1"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="space-y-3 text-xs">
                    {/* Base reference badge */}
                    <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 p-2 bg-emerald-500/10">
                      <img src={result} alt="Base" className="h-12 w-10 rounded-md object-cover border border-emerald-500/40" />
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wider block">Current render locked as base</span>
                        <p className={`text-[10px] truncate ${isLight ? 'text-gray-600' : 'text-white/60'}`}>Modifications will apply on this base image</p>
                      </div>
                    </div>

                    {/* Optional Reference Upload */}
                    <div>
                      <label className={`block text-[10px] font-semibold uppercase tracking-wider mb-1 ${isLight ? 'text-gray-600' : 'text-white/60'}`}>
                        Optional: Upload Reference Garment / Detail
                      </label>
                      <input
                        ref={editRefInput}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          const dataUrl = await fileToDataUrl(f);
                          setEditRefImage({ url: dataUrl, name: f.name });
                        }}
                      />
                      {editRefImage ? (
                        <div className={`flex items-center justify-between rounded-xl border p-2 ${isLight ? 'border-gray-200 bg-gray-50 text-gray-900' : 'border-white/10 bg-black/30'}`}>
                          <div className="flex items-center gap-2 min-w-0">
                            <img src={editRefImage.url} alt="Ref" className="h-10 w-8 rounded object-cover" />
                            <span className="text-xs truncate">{editRefImage.name}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setEditRefImage(null)}
                            className="text-xs text-rose-500 font-semibold hover:underline"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => editRefInput.current?.click()}
                          className={`w-full rounded-xl border border-dashed p-2 text-center text-xs transition ${
                            isLight ? 'border-gray-300 bg-white hover:bg-gray-50 text-gray-800 font-medium' : 'border-white/20 bg-black/20 hover:border-white/40 text-white/70'
                          }`}
                        >
                          + Add Reference Image (Optional)
                        </button>
                      )}
                    </div>

                    {/* Edit Prompt Instructions */}
                    <div>
                      <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${isLight ? 'text-slate-900' : 'text-white/60'}`}>
                        What changes would you like to make? (Instructions)
                      </label>
                      <textarea
                        value={editPrompt}
                        onChange={(e) => setEditPrompt(e.target.value)}
                        rows={2}
                        placeholder="e.g. Change jersey color to navy blue with red accents, adjust sleeve length, athletic studio lighting"
                        className={`w-full rounded-xl border p-2.5 text-xs focus:outline-none transition-colors ${
                          isLight
                            ? 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-[#e5373f]'
                            : 'bg-black/50 border-white/10 text-white placeholder:text-white/30 focus:border-white/40'
                        }`}
                      />
                    </div>

                    {/* Trigger Edit Button */}
                    <button
                      type="button"
                      onClick={() => {
                        if (isLocked) {
                          setError('Your account generation credits are locked by an administrator.');
                          return;
                        }
                        if (isGlobalBusy) {
                          setError('Another generation is currently in progress. Please wait.');
                          return;
                        }
                        setIsEditingRender(true);
                        setShowConfirmModal(true);
                      }}
                      disabled={isGlobalBusy || isLocked}
                      className="w-full rounded-full bg-[#e5373f] py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#d42d35] disabled:opacity-50 transition-colors shadow-md"
                    >
                      Generate Edit ({quality.toUpperCase()} &middot; {creditCost} Credit{creditCost > 1 ? 's' : ''}) &rarr;
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Collections Drawer */}
            <div className={`rounded-3xl border p-4 ${isLight ? 'border-gray-200 bg-white text-gray-900 shadow-sm' : 'border-white/10 bg-white/[0.02]'}`}>
              <h3 className={`text-[11px] font-bold uppercase tracking-[0.2em] ${isLight ? 'text-slate-900' : 'text-white/60'}`}>
                Saved Collections
              </h3>
              <div className="mt-3 space-y-2">
                {collections.length === 0 && <p className={`text-xs ${isLight ? 'text-slate-700' : 'text-white/30'}`}>No collections yet.</p>}
                {collections.map((c) => (
                  <div key={c.id} className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
                    isLight ? 'border-gray-200 bg-white text-gray-900' : 'border-white/5 bg-black/40'
                  }`}>
                    <span className={`truncate text-xs ${isLight ? 'text-slate-900 font-medium' : 'text-white/80'}`}>{c.name} ({c.items.length})</span>
                    <button
                      type="button"
                      disabled={!result}
                      onClick={async () => {
                        if (!result) return;
                        await api.addToCollection(c.id, result);
                        setSavedTo(c.id);
                        void loadCollections();
                        setTimeout(() => setSavedTo(''), 2000);
                      }}
                      className={`text-[10px] uppercase font-bold disabled:opacity-30 ${
                        isLight ? 'text-slate-900 hover:text-black' : 'text-white/60 hover:text-white'
                      }`}
                    >
                      {savedTo === c.id ? 'Saved!' : '+ Add'}
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  value={newCollection}
                  onChange={(e) => setNewCollection(e.target.value)}
                  placeholder="New collection name"
                  className={`min-w-0 flex-1 rounded-xl border px-3 py-1.5 text-xs focus:outline-none transition-colors ${
                    isLight
                      ? 'border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:border-[#e5373f]'
                      : 'border-white/10 bg-black/50 text-white placeholder:text-white/25 focus:border-white/40'
                  }`}
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!newCollection.trim()) return;
                    await api.createCollection(newCollection.trim());
                    setNewCollection('');
                    void loadCollections();
                  }}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    isLight
                      ? 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
                      : 'border-white/20 text-white/70 hover:text-white'
                  }`}
                >
                  Create
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
