import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Columns,
  Download,
  Eraser,
  ExternalLink,
  FileArchive,
  Film,
  Folder,
  Inbox,
  Layers,
  Lock,
  Maximize2,
  MessageSquare,
  Move,
  Paintbrush,
  Paperclip,
  Plus,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Scissors,
  Send,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  Undo2,
  Unlock,
  Upload,
  User as UserIcon,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useTheme, ThemeToggle } from '../lib/theme';
import {
  api,
  ApiError,
  downloadDirectFile,
  fileToDataUrl,
  getProxiedImageUrl,
  prepareAndStandardizeImage,
  scaleToEcommerceCatalog,
  resolveImageUrl,
  getToken,
  setToken,
  type AdminDelivery,
  type CustomRequest,
  type Job,
  type ModelCategory,
  type Studio,
  type UploadSet,
  type User,
  type UserGeneration,
} from '../lib/api';
import { WatermarkRemoverContent } from './RemoveLogo';

type Pick = { url: string; name: string; preview?: string } | null;

export type GarmentRole =
  | 'top-front'
  | 'top-back'
  | 'bottom'
  | 'collar'
  | 'logo'
  | 'detail'
  | 'left-sleeve'
  | 'right-sleeve'
  | 'left-bottom'
  | 'right-bottom'
  | 'custom'
  | 'tops-front'
  | 'tops-back'
  | 'bottoms'
  | 'bottom-back'
  | 'unknown';

export type TryOnTarget = 'upper' | 'lower' | 'both';

export const GARMENT_ROLE_LABELS: Record<string, string> = {
  'top-front': '👕 Top Front',
  'top-back': '🔄 Top Back',
  'bottom': '👖 Bottom',
  'bottom-back': '🔄 Bottom Back',
  'collar': '👔 Collar / Neck',
  'logo': '🔍 Logo / Brand Close-Up',
  'detail': '✨ Fabric / Tag / Detail',
  'left-sleeve': '👈 Left Sleeve',
  'right-sleeve': '👉 Right Sleeve',
  'left-bottom': '🩳 Left Bottom',
  'right-bottom': '🩳 Right Bottom',
  'custom': '✏️ Custom View',
  'tops-front': '👕 Top Front',
  'tops-back': '🔄 Top Back',
  'bottoms': '👖 Bottom',
  'unknown': '❓ Garment Angle',
};

export function isUpperGarmentRole(role?: string, name?: string): boolean {
  const r = (role || '').toLowerCase();
  const n = (name || '').toLowerCase();
  if (/bottom|lower|pant|trouser|short|legging|trackpant|thigh|waist/i.test(r) ||
    /bottom|lower|pant|trouser|short|legging|trackpant/i.test(n)) {
    return false;
  }
  return /top|upper|shirt|tshirt|jacket|hoodie|jersey|chest|front|back|torso|arm|collar|sleeve/i.test(r) ||
    /top|upper|shirt|tshirt|jacket|hoodie|jersey|collar/i.test(n);
}

export function isLowerGarmentRole(role?: string, name?: string): boolean {
  const r = (role || '').toLowerCase();
  const n = (name || '').toLowerCase();
  return /bottom|lower|pant|trouser|short|legging|trackpant|thigh|waist/i.test(r) ||
    /bottom|lower|pant|trouser|short|legging|trackpant/i.test(n);
}

export function computeAutoTryOnTarget(list: Array<{ role?: string; name?: string }>): TryOnTarget {
  if (!list || list.length === 0) return 'upper';
  const hasUpper = list.some((g) => isUpperGarmentRole(g.role, g.name));
  const hasLower = list.some((g) => isLowerGarmentRole(g.role, g.name));
  if (hasUpper && hasLower) return 'both';
  if (hasLower && !hasUpper) return 'lower';
  return 'upper';
}

export interface ClassifiedGarment {
  url: string;
  preview?: string;
  name: string;
  role: GarmentRole;
  customLabel?: string;
}

const MODES = [
  { id: 'tryon', label: 'Try-On', needs: ['cloth', 'model'], hint: 'Fit your garment onto a studio model, preserving pose and athletic posture.' },
  { id: 'swap', label: 'Model Swap', needs: ['sourceModel', 'targetModel'], hint: 'Swap model or face in an outfit with another model or persona.' },
  { id: 'removelogo', label: 'Erase / Replace Logo', needs: [], hint: 'Select unwanted AI logos on any image to erase them or snap crisp HD vector logos.' },
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
  promptSuffix?: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  url?: string;
  jobId?: string;
  model?: Pick;
}

function sendDesktopNotification(title: string, body: string, icon?: string) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    const n = new Notification(title, { body, icon: icon || '/brand-mark-white.png', tag: 'shivnaresh-gen' });
    n.onclick = () => { window.focus(); n.close(); };
  } else if (!('Notification' in window)) {
    return;
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then((perm) => {
      if (perm === 'granted') {
        const n = new Notification(title, { body, icon: icon || '/brand-mark-white.png', tag: 'shivnaresh-gen' });
        n.onclick = () => { window.focus(); n.close(); };
      }
    });
  }
}

export const BRAND_COLOR_PRESETS = [
  { name: 'Pure White', hex: '#ffffff' },
  { name: 'Jet Black', hex: '#111111' },
  { name: 'Shiv-Naresh Red', hex: '#e5373f' },
  { name: 'Athletic Gold', hex: '#f59e0b' },
  { name: 'Cyan Blue', hex: '#00d2ff' },
  { name: 'Royal Blue', hex: '#2563eb' },
  { name: 'Neon Lime', hex: '#84cc16' },
  { name: 'Sports Orange', hex: '#f97316' },
  { name: 'Hot Pink', hex: '#ec4899' },
  { name: 'Silver Grey', hex: '#94a3b8' },
];

export interface HoodPairFormat {
  id: string;
  name: string;
  badge: string;
  icon: string;
  tagline: string;
  frontTitle: string;
  frontDesc: string;
  backTitle: string;
  backDesc: string;
  frontPrompt: string;
  backPrompt: string;
  recommendedFor: string;
  frontThumb: string;
  backThumb: string;
}

export const HOOD_PAIR_FORMATS: HoodPairFormat[] = [
  {
    id: 'pair-1',
    name: 'Format 1: Black-Red Cricket Windcheater (Hood-Down + 4cm Stand Collar)',
    badge: 'Cricket Windcheater',
    icon: '🧥',
    frontThumb: '/hood-presets/pair1-front.webp',
    backThumb: '/hood-presets/pair1-back.webp',
    tagline: '4cm Stand Collar + Pointed Kite Hood Back',
    frontTitle: 'Front: 4cm Stand Collar + Hood Folded Behind Neck',
    frontDesc: 'Zip to top, throat 3cm visible, hood bulk only behind neck. Natural athlete hair, no cap.',
    backTitle: 'Back: Pointed Kite Hood Between Shoulder Blades',
    backDesc: 'Pointed kite shape lying flat between blades, tip mid-blade, 3cm clean nape skin above collar.',
    frontPrompt: 'HEAD & HAIR: Clean athletic male haircut, neat natural trimmed hair, bare forehead and natural exposed hairline matching Image 1. FRONT COLLAR & HOOD: Front-facing sportswear catalogue pose. Model facing camera. 4 cm matte black stand collar zipped closed around throat. Attached jacket hood is folded away neatly resting behind the neck only (NOT on head, NOT on shoulders). Clean chest and front panel presentation with authentic Shiv-Naresh chest logo. ',
    backPrompt: 'HEAD & HAIR: Rear view of model head and neck. Clean natural hairline at nape. BACK COLLAR & HOOD: Attached jacket hood hanging down flat in a pointed kite shape along the center spine between shoulder blades, tip ending at mid-shoulder-blade, no fabric bunching on shoulders. Short stand collar visible at nape with clean seam. Smooth plain black back panel with no front graphics bleeding onto the back. ',
    recommendedFor: 'Windcheaters & tracksuits with foldable/draped hoods (7924 / 7925 style)',
  },
  {
    id: 'pair-2',
    name: 'Format 2: White Track Jacket Tape-Print (5cm Stand Collar, 100% Hoodless)',
    badge: '100% Hoodless',
    icon: '👔',
    frontThumb: '/hood-presets/pair2-front.webp',
    backThumb: '/hood-presets/pair2-back.webp',
    tagline: '5cm Black Stand Collar + Smooth Nape Back (NO Hood)',
    frontTitle: 'Front: 5cm Athletic Stand Collar (No Hood)',
    frontDesc: '5cm black stand collar upright, full zip closed, NO hood anywhere on garment, natural hair.',
    backTitle: 'Back: Smooth Nape Collar (No Hood)',
    backDesc: '5cm collar sitting low on nape, hairline 2cm above it, 100% hoodless with clean smooth back panel.',
    frontPrompt: 'HEAD & HAIR: Clean athletic male haircut, neat natural trimmed hair, bare forehead and natural exposed hairline matching Image 1. FRONT COLLAR: Front-facing sportswear pose. Model facing camera. 5 cm athletic stand collar standing upright around throat, full zipper closed to top of collar. Completely 100% hoodless with NO hood anywhere on this garment. Clean front neck presentation. ',
    backPrompt: 'HEAD & HAIR: Rear view of model head and neck. Clean natural hairline at nape. BACK COLLAR: Crisp 5 cm stand collar sitting low across nape of neck with clean center-back seam. 100% hoodless with completely smooth upper back panel and zero draped fabric. ',
    recommendedFor: 'Classic zippered track jackets without hoods (8625 / 8628 style)',
  },
  {
    id: 'pair-3',
    name: 'Format 3: Funnel Collar Windcheater (7cm Tall Funnel + Packable Hood Flat)',
    badge: 'Tall Funnel Collar',
    icon: '🏃‍♂️',
    frontThumb: '/hood-presets/pair3-front.webp',
    backThumb: '/hood-presets/pair3-back.webp',
    tagline: '7cm Chin Funnel Collar + Packable Hood Laid Flat Back',
    frontTitle: 'Front: 7cm Tall Funnel Collar Touching Chin',
    frontDesc: '7cm funnel collar zipped to top, touching underside of chin, throat covered, packable hood folded flat.',
    backTitle: 'Back: Packable Hood Folded Flat Down Upper Back',
    backDesc: 'Packable hood folded DOWN across upper back in soft pointed shape, 7cm funnel collar visible at nape.',
    frontPrompt: 'HEAD & HAIR: Clean athletic male haircut, neat natural trimmed hair, bare forehead and natural exposed hairline matching Image 1. FRONT COLLAR: Front-facing pose. Model facing camera. 7 cm tall funnel stand collar zipped completely to top touching underside of chin. Attached packable hood folded away flat behind neck only. ',
    backPrompt: 'HEAD & HAIR: Rear view of model head and neck. Clean natural hairline at nape. BACK COLLAR & HOOD: Packable hood folded down flat across upper back in soft pointed shape between shoulder blades. Tall funnel collar visible at nape. Plain black back panel. ',
    recommendedFor: 'Technical windcheaters with tall funnel neck & packable hood (8776 / 8777 style)',
  },
  {
    id: 'pair-4',
    name: 'Format 4: Royal Blue Tracksuit (4.5cm Collar + Flat Pointed Hood Fold)',
    badge: 'Tonal Tracksuit',
    icon: '🌧️',
    frontThumb: '/hood-presets/pair4-front.webp',
    backThumb: '/hood-presets/pair4-back.webp',
    tagline: '4.5cm Blue Stand Collar + Flat Center-Fold Hood Back',
    frontTitle: 'Front: 4.5cm Stand Collar + Hood Folded Behind Neck',
    frontDesc: '4.5cm royal blue stand collar upright, full blue zip to top, throat 3cm visible, hood folded behind.',
    backTitle: 'Back: Flat Pointed Hood Fold with Defined Center Line',
    backDesc: 'Hood flat across upper back, pointed tip at mid-blade, 4.5cm stand collar at nape, 2.5cm nape skin.',
    frontPrompt: 'HEAD & HAIR: Clean athletic male haircut, neat natural trimmed hair, bare forehead and natural exposed hairline matching Image 1. FRONT COLLAR: Front-facing pose. Model facing camera. 4.5 cm stand collar standing upright, full zipper closed to top, attached hood folded away neatly behind neck only. ',
    backPrompt: 'HEAD & HAIR: Rear view of model head and neck. Clean natural hairline at nape. BACK COLLAR & HOOD: Attached hood folded down and lying flat across upper back with defined center fold between shoulder blades. Stand collar visible at nape with clean seam. Plain back panel. ',
    recommendedFor: 'Tonal lightweight polyester tracksuits (10365 / 10366 style)',
  },
  {
    id: 'pair-5',
    name: 'Format 5: GLA University Fleece Hoodie (Thick Nape Hood Roll + Chest Drawstrings)',
    badge: 'Fleece Hoodie',
    icon: '🎽',
    frontThumb: '/hood-presets/pair5-front.webp',
    backThumb: '/hood-presets/pair5-back.webp',
    tagline: 'Rolled Inner Collar & Drawstrings + Thick Nape Hood Roll Back',
    frontTitle: 'Front: Soft Rolled Collar Well + Dual Chest Drawstrings',
    frontDesc: 'Hood is DOWN, inner lining rolled into soft 3cm collar well, 2 black drawcords hanging straight down.',
    backTitle: 'Back: Thick Fleece Hood Roll at Nape',
    backDesc: 'Thick fleece roll at nape (raised 3cm ridge), rounded tip between blades.',
    frontPrompt: 'HEAD & HAIR: Clean athletic male haircut, neat natural trimmed hair, bare forehead and natural exposed hairline matching Image 1. FRONT HOOD: Front-facing pose. Model facing camera. The hood is DOWN, inner lining rolled into soft 3 cm collar around neck forming visible well behind head, two drawcords hanging straight down onto chest. Hood is NOT worn on head. ',
    backPrompt: 'HEAD & HAIR: Rear view of model head and neck. Clean natural hairline at nape. BACK HOOD: Thick fleece hood lying down across upper back with raised roll at nape, hood tip falling into soft rounded point between shoulder blades. Smooth plain fleece back panel. ',
    recommendedFor: 'Heavy cotton-fleece pullover hoodies & sweatshirts (10627 / 10628 style)',
  },
];

export const HOOD_STYLE_OPTIONS = [
  {
    id: 'auto' as const,
    name: 'Auto Detect',
    badge: 'Smart AI',
    icon: '🪄',
    tagline: 'Automatic Hood Detection',
    description: 'AI flat-lay photo ko scan karke khud decide karega hood lagana hai ya nahi.',
    recommendedFor: 'T-Shirts, Jackets & Tracksuits',
  },
  {
    id: 'draped' as const,
    name: 'Draped (Catalog)',
    badge: 'Standard E-Com',
    icon: '🧥',
    tagline: 'Peeche Gira Hua (Shoulder Draped)',
    description: 'Hood gale ke peeche neatly folded rahega, drawstrings aage chest par hanging. 90% catalog me yahi use hota hai.',
    recommendedFor: 'Catalog Shoots (Front & Back)',
  },
  {
    id: 'on-head' as const,
    name: 'On Head (Sports)',
    badge: 'Athletic Look',
    icon: '🏃‍♂️',
    tagline: 'Sar Par Pehna Hua (Hood Up)',
    description: 'Model hood ko sar par pehnega athletic running, training aur warm-up look me.',
    recommendedFor: 'Winter Training & Running',
  },
  {
    id: 'none' as const,
    name: 'No Hood (Stand Collar)',
    badge: 'Classic Zip',
    icon: '👔',
    tagline: 'Stand-Up Zip Collar / Bina Hood',
    description: 'Clean high-zip stand collar bina kisi hood attachment ke.',
    recommendedFor: 'Classic Tracksuits, Zip Jackets',
  },
];

export function ShivNareshSvgLogo({
  color = '#ffffff',
  className = '',
  curved = true,
  curvatureDepth = 14,
  curveDirection = 'standard',
}: {
  color?: string;
  className?: string;
  curved?: boolean;
  curvatureDepth?: number;
  curveDirection?: 'standard' | 'left' | 'right';
}) {
  const curveId = useId();
  const arcPathId = `sn-arc-${curveId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const yStart = curveDirection === 'left' ? 188 : curveDirection === 'right' ? 180 : 185;
  const yMid = 185 - Math.max(0, curvatureDepth);
  const yEnd = curveDirection === 'left' ? 180 : curveDirection === 'right' ? 188 : 185;
  const emblemRot = curveDirection === 'left' ? -2.5 : curveDirection === 'right' ? +1.5 : -0.8;
  const resolvedColor = color || '#ffffff';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 360 210"
      width="100%"
      height="100%"
      className={className}
      style={{ color: resolvedColor }}
    >
      <defs>
        <path id={arcPathId} d={`M 28,${yStart} Q 180,${yMid} 332,${yEnd}`} fill="none" />
      </defs>
      <g transform={`translate(14, 15) rotate(${emblemRot}, 180, 60)`}>
        <path
          fill={resolvedColor}
          d="M 70 2 L 66 3 L 60 6 L 55 10 L 50 15 L 47 19 L 45 22 L 42 28 L 41 31 L 41 38 L 43 41 L 46 43 L 49 43 L 51 42 L 52 39 L 54 37 L 58 37 L 60 39 L 60 42 L 59 44 L 56 47 L 56 50 L 59 53 L 61 53 L 63 52 L 65 51 L 67 49 L 73 46 L 76 45 L 79 46 L 81 47 L 83 49 L 83 50 L 86 53 L 87 55 L 87 64 L 86 67 L 85 70 L 82 75 L 74 83 L 71 85 L 67 87 L 61 90 L 54 93 L 49 95 L 33 100 L 19 103 L 12 105 L 9 106 L 6 107 L 4 108 L 4 113 L 35 113 L 39 112 L 46 110 L 56 107 L 62 105 L 71 102 L 79 99 L 97 92 L 106 87 L 111 86 L 122 80 L 142 71 L 151 67 L 158 64 L 170 59 L 175 57 L 180 55 L 196 49 L 200 48 L 211 48 L 214 49 L 220 52 L 223 54 L 230 60 L 238 65 L 243 68 L 250 72 L 256 75 L 266 80 L 269 81 L 272 82 L 277 82 L 281 83 L 285 84 L 290 86 L 298 90 L 318 102 L 320 103 L 322 104 L 329 104 L 329 99 L 327 95 L 322 91 L 314 87 L 307 82 L 300 76 L 293 71 L 290 70 L 283 64 L 276 60 L 274 60 L 271 58 L 267 55 L 262 51 L 261 50 L 257 46 L 253 41 L 251 38 L 249 35 L 248 33 L 246 28 L 245 25 L 246 19 L 287 19 L 297 18 L 298 17 L 305 17 L 307 14 L 308 12 L 308 9 L 306 9 L 302 11 L 294 12 L 257 12 L 246 10 L 241 8 L 225 5 L 217 4 L 201 4 L 192 5 L 179 7 L 166 10 L 158 11 L 140 11 L 130 10 L 122 9 L 102 6 L 89 3 L 79 2 Z"
        />
      </g>
      {curved ? (
        <text
          fontFamily="-apple-system, BlinkMacSystemFont, Arial, sans-serif"
          fontSize="35"
          fontWeight="900"
          letterSpacing="4"
          fill={resolvedColor}
        >
          <textPath href={`#${arcPathId}`} startOffset="50%" textAnchor="middle">
            SHIV-NARESH
          </textPath>
        </text>
      ) : (
        <text
          x="180"
          y="180"
          textAnchor="middle"
          fontFamily="-apple-system, BlinkMacSystemFont, Arial, sans-serif"
          fontSize="36"
          fontWeight="900"
          letterSpacing="4"
          fill={resolvedColor}
        >
          SHIV-NARESH
        </text>
      )}
    </svg>
  );
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

export function safeOpenMediaInNewTab(
  mediaUrl: string,
  title = 'SHIV-NARESH Media Preview',
  targetWin?: Window | null
) {
  if (!mediaUrl) return;
  const resolved = resolveImageUrl(mediaUrl);

  // If a synchronous window reference was pre-opened (or we can open one immediately),
  // write a self-contained responsive HTML viewer that displays the high-res render with download controls.
  // This bypasses Chrome / Safari / Edge top-frame navigation restrictions on data:/blob: URLs and prevents popup blocking.
  const win = targetWin && !targetWin.closed ? targetWin : window.open('', '_blank');
  if (win) {
    try {
      win.document.open();
      win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title.replace(/</g, '&lt;')}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #0b0f17; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #f8fafc; }
    .wrapper { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16px; }
    img { max-width: 100%; max-height: 96vh; object-fit: contain; border-radius: 8px; box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.85); }
  </style>
</head>
<body>
  <div class="wrapper">
    <img id="previewImg" alt="Preview" />
  </div>
</body>
</html>`);
      win.document.close();
      const pImg = win.document.getElementById('previewImg') as HTMLImageElement | null;
      if (pImg) pImg.src = resolved;
      return;
    } catch (e) {
      console.warn('Direct document write error, navigating to URL:', e);
      try {
        win.location.href = resolved;
        return;
      } catch { }
    }
  }

  // Fallback if popup blocker suppressed window creation
  const a = document.createElement('a');
  a.href = resolved;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.title = title;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try { document.body.removeChild(a); } catch { }
  }, 1000);
}

function classifyGarmentByHeuristic(name: string): GarmentRole {
  const n = name.toLowerCase();
  if (/back.*(bottom|leg|pant|lower|short)|(bottom|pant|lower|short).*back/.test(n)) return 'bottom-back';
  if (/left.*(bottom|leg|pant)|(bottom|pant).*left/.test(n)) return 'left-bottom';
  if (/right.*(bottom|leg|pant)|(bottom|pant).*right/.test(n)) return 'right-bottom';
  if (/left.*sleeve|sleeve.*left/.test(n)) return 'left-sleeve';
  if (/right.*sleeve|sleeve.*right/.test(n)) return 'right-sleeve';
  if (/logo|badge|crest|brand|emblem|patch/.test(n)) return 'logo';
  if (/pant|trouser|short|bottom|lower|leg|waist|cargo|jean|denim|jogger/.test(n)) return 'bottom';
  if (/back|rear|behind|dorsal/.test(n)) return 'top-back';
  if (/front|chest|jacket|hoodie|shirt|tee|top|upper|jersey|coat|sweater/.test(n)) return 'top-front';
  return 'top-front';
}

/* ----------------------------------------------------------------
   Garment Photography Tour & Guidelines (DO vs DON'T Real References)
   ---------------------------------------------------------------- */
interface PhotoGuideStep {
  step: number;
  badge: string;
  title: string;
  tagline: string;
  doBadge: string;
  doImage: string;
  doHeadline: string;
  doBullets: string[];
  dontBadge: string;
  dontImage: string;
  dontHeadline: string;
  dontBullets: string[];
  whyItMatters: string;
}

const PHOTO_GUIDE_STEPS: PhotoGuideStep[] = [
  {
    step: 1,
    badge: 'Step 1 of 4',
    title: 'Surface & Background: Pure White vs Textured Turf',
    tagline: 'Clean background segmentation is the foundation of high-fidelity garment synthesis',
    doBadge: 'DO · Pure White Seamless Surface',
    doImage: '/guidelines/white-shirt-clean-bg.jpg',
    doHeadline: 'Clean white studio surface for crisp garment extraction',
    doBullets: [
      'Clean, flat white surface with high overhead lighting.',
      'Pure seamless contrast on every outer seam and cuff.',
      'Enables AI to cleanly isolate the garment without background spill.',
    ],
    dontBadge: 'AVOID · Artificial Grass, Turf, or Printed Sheets',
    dontImage: '/guidelines/hoodie-wide-turf.jpg',
    dontHeadline: 'Textured green turf & floor wrinkles',
    dontBullets: [
      'Green turf texture bleeds directly into fabric edges.',
      'Floor wrinkles and ground shadows distort silhouette outlines.',
      'Forces neural network to guess boundaries, causing messy cuts and color tinting.',
    ],
    whyItMatters:
      'Notice the contrast between the white shirt on white background vs the hoodie on green turf: textured backgrounds like artificial grass confuse AI edge segmentation, resulting in messy outlines and greenish reflections on the model.',
  },
  {
    step: 2,
    badge: 'Step 2 of 4',
    title: 'Sleeve Placement: Spread Wide at 45° (Front & Back Photos)',
    tagline: 'Lay garment completely flat with arms spread wide at 45° angles and cuffs flat',
    doBadge: 'DO · Sleeves Spread Wide at 45°',
    doImage: '/guidelines/white-shirt-45deg.jpg',
    doHeadline: 'White shirt with both sleeves spread wide at 45° angles',
    doBullets: [
      'Both sleeves extended wide at natural 45° angles.',
      'Wrist cuffs flat, armpit seams open, and collar centered.',
      'Allows AI to accurately map arm trajectory and sleeve length.',
    ],
    dontBadge: 'AVOID · Bunched Sleeves & Red Collar Tags',
    dontImage: '/guidelines/hoodie-wide-turf.jpg',
    dontHeadline: 'Garment flat-lay with bunched folds & hanging price tags',
    dontBullets: [
      'Never fold sleeves across the chest or tuck cuffs under.',
      'Red price tags near collar trick AI into hallucinating a quarter-zip zipper!',
      'Bunched fabric curves distort sleeve striping and proportions.',
    ],
    whyItMatters:
      'Notice the 45° sleeve spread of the white shirt: wide, straight arm angles give the AI accurate spatial geometry. Bunched sleeves or collar tags trick the AI into inventing unwanted zippers or twisting sleeve graphics.',
  },
  {
    step: 3,
    badge: 'Step 3 of 4',
    title: 'Chest Artwork & Small Typography Macro Zoom',
    tagline: 'Dedicated macro zoom crop centered directly on central graphics and slogans',
    doBadge: 'DO · Dedicated Macro Zoom on Artwork',
    doImage: '/guidelines/logo-zoom-right.jpg',
    doHeadline: 'High-resolution macro crop of text & icons',
    doBullets: [
      'Close-up photo focused directly on chest graphics ("CHEAT CODE // ACTIVATED").',
      'Pixel icons (dinosaur, cactus) and letterforms are sharp and flat.',
      'Zero fold creases or wrinkles cutting through typography.',
    ],
    dontBadge: 'AVOID · Distant Wide Shot (No Macro Crop)',
    dontImage: '/guidelines/hoodie-wide-turf.jpg',
    dontHeadline: 'Far-away wide shot where small text is tiny & unreadable',
    dontBullets: [
      'Relying solely on a distant wide photo where chest text is low-res.',
      'Low-resolution typography forces AI to scramble text into gibberish.',
      'Always upload an extra macro zoom photo for any logo or text print.',
    ],
    whyItMatters:
      'When AI only receives a distant wide photo of the full garment, small chest letters lack pixel resolution, causing the neural network to hallucinate scrambled letters. A dedicated macro zoom guarantees 100% sharp text.',
  },
  {
    step: 4,
    badge: 'Step 4 of 4',
    title: 'Track Pants & Lowers: Both Legs Separated',
    tagline: 'Bottoms must be laid flat showing both legs separated down to the ankle cuffs',
    doBadge: 'DO · Both Legs Separated to Ankle Cuffs',
    doImage: '/guidelines/pants-right.jpg',
    doHeadline: 'Full-length track pants laid flat with both legs open',
    doBullets: [
      'Both legs spread wide and straight down to the ankle cuffs.',
      'Waistband, pockets, and brand logo ("D Sports") fully visible.',
      'Seamless white background ensures crisp leg cutouts.',
    ],
    dontBadge: 'AVOID · Pants Folded in Half (Single Leg)',
    dontImage: '/guidelines/pants-wrong.jpg',
    dontHeadline: 'Pants folded sideways with only one leg visible',
    dontBullets: [
      'Never fold pants in half so only one leg is in view.',
      'Avoid bunching knees or shooting on green artificial grass.',
      'AI cannot detect bilateral length and may generate shorts or merged legs!',
    ],
    whyItMatters:
      'When track pants are folded sideways showing only one leg, the AI model lacks bilateral leg data and often generates knee-length shorts or asymmetric trousers.',
  },
];

function GarmentPhotoTourModal({
  isOpen,
  onClose,
  onStartUpload,
  step,
  setStep,
  alwaysShow,
  setAlwaysShow,
  isLight,
}: {
  isOpen: boolean;
  onClose: () => void;
  onStartUpload: () => void;
  step: number;
  setStep: (s: number | ((prev: number) => number)) => void;
  alwaysShow: boolean;
  setAlwaysShow: (val: boolean) => void;
  isLight: boolean;
}) {
  // Preload all guideline reference photos synchronously so step transitions have 0 latency/flicker
  useEffect(() => {
    PHOTO_GUIDE_STEPS.forEach((s) => {
      const img1 = new Image();
      img1.src = s.doImage;
      const img2 = new Image();
      img2.src = s.dontImage;
    });
  }, []);

  if (!isOpen) return null;
  const isLast = step === PHOTO_GUIDE_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 p-3 sm:p-5 backdrop-blur-md animate-in fade-in duration-150">
      <div
        className={`w-full max-w-3xl h-[88vh] max-h-[700px] rounded-2xl border shadow-2xl overflow-hidden flex flex-col select-none ${isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-[#0f0f14] border-zinc-800 text-zinc-100'
          }`}
      >
        {/* Header */}
        <div
          className={`shrink-0 px-5 py-4 border-b flex items-center justify-between ${isLight ? 'border-zinc-200 bg-zinc-50' : 'border-zinc-800/80 bg-zinc-900/40'
            }`}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-800 text-base text-zinc-200 border border-zinc-700/60 shadow-inner">
              📸
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold tracking-tight">Garment Photography Guidelines</h3>
                <span className="rounded-full bg-zinc-800 border border-zinc-700 px-2 py-0.5 text-[10px] font-medium text-zinc-300">
                  Step {step + 1} of {PHOTO_GUIDE_STEPS.length}
                </span>
              </div>
              <p className={`text-[11px] ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                Side-by-side real camera references for 100% accurate AI photoshoot synthesis
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close photo tour"
            className={`h-8 w-8 rounded-lg flex items-center justify-center transition text-sm cursor-pointer ${isLight ? 'hover:bg-zinc-200 text-zinc-600' : 'hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100'
              }`}
          >
            ✕
          </button>
        </div>

        {/* Segmented Bar (Dynamic per step count) */}
        <div
          className="shrink-0 grid gap-1.5 px-5 pt-3 pb-1"
          style={{ gridTemplateColumns: `repeat(${PHOTO_GUIDE_STEPS.length}, minmax(0, 1fr))` }}
        >
          {PHOTO_GUIDE_STEPS.map((s, idx) => (
            <button
              key={s.step}
              type="button"
              onClick={() => setStep(idx)}
              className={`h-1.5 rounded-full transition-colors duration-150 cursor-pointer ${idx === step
                ? 'bg-[#e5373f] ring-2 ring-[#e5373f]/30'
                : idx < step
                  ? 'bg-emerald-500'
                  : isLight ? 'bg-zinc-200' : 'bg-zinc-800'
                }`}
              title={`Step ${s.step}: ${s.title}`}
            />
          ))}
        </div>

        {/* Main Content Area - Pre-renders all steps into DOM so all images remain decoded with 0ms transition lag */}
        <div className="p-5 flex-1 overflow-y-auto">
          {PHOTO_GUIDE_STEPS.map((s, idx) => {
            const isCurrent = idx === step;
            return (
              <div
                key={s.step}
                className={`space-y-3.5 ${isCurrent ? 'block' : 'hidden'}`}
                style={{ display: isCurrent ? 'block' : 'none' }}
              >
                {/* Step Headline */}
                <div>
                  <h4 className="text-base font-semibold tracking-tight">{s.title}</h4>
                  <p className={`text-xs mt-0.5 ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>{s.tagline}</p>
                </div>

                {/* Real Photos DO vs DON'T Side-by-Side Comparison */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* DO Card */}
                  <div
                    className={`rounded-xl border p-3.5 flex flex-col ${isLight
                      ? 'border-emerald-300 bg-emerald-50/40 text-emerald-950'
                      : 'border-emerald-500/25 bg-emerald-950/20 text-emerald-100'
                      }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border border-emerald-500/40 bg-emerald-500/15 text-emerald-400">
                        <span className="font-bold">✓</span> {s.doBadge}
                      </span>
                    </div>
                    <div className="relative aspect-[4/3] w-full rounded-lg overflow-hidden bg-black/70 border border-emerald-500/20 mb-2.5 flex items-center justify-center">
                      <img
                        src={s.doImage}
                        alt={s.doBadge}
                        className="h-full w-full object-contain"
                        loading="eager"
                        decoding="sync"
                      />
                    </div>
                    <p className={`text-xs font-semibold mb-1.5 ${isLight ? 'text-emerald-900' : 'text-emerald-200'}`}>
                      {s.doHeadline}
                    </p>
                    <ul className="space-y-1 text-[11px] min-h-[64px]">
                      {s.doBullets.map((bullet, i) => (
                        <li key={i} className={`flex items-start gap-1.5 leading-snug ${isLight ? 'text-emerald-950' : 'text-emerald-200/80'}`}>
                          <span className="text-emerald-500 font-bold shrink-0">✓</span>
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* DON'T Card */}
                  <div
                    className={`rounded-xl border p-3.5 flex flex-col ${isLight
                      ? 'border-rose-300 bg-rose-50/40 text-rose-950'
                      : 'border-rose-500/25 bg-rose-950/20 text-rose-100'
                      }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border border-rose-500/40 bg-rose-500/15 text-rose-400">
                        <span className="font-bold">✕</span> {s.dontBadge}
                      </span>
                    </div>
                    <div className="relative aspect-[4/3] w-full rounded-lg overflow-hidden bg-black/70 border border-rose-500/20 mb-2.5 flex items-center justify-center">
                      <img
                        src={s.dontImage}
                        alt={s.dontBadge}
                        className="h-full w-full object-contain"
                        loading="eager"
                        decoding="sync"
                      />
                    </div>
                    <p className={`text-xs font-semibold mb-1.5 ${isLight ? 'text-rose-900' : 'text-rose-200'}`}>
                      {s.dontHeadline}
                    </p>
                    <ul className="space-y-1 text-[11px] min-h-[64px]">
                      {s.dontBullets.map((bullet, i) => (
                        <li key={i} className={`flex items-start gap-1.5 leading-snug ${isLight ? 'text-rose-950' : 'text-rose-200/80'}`}>
                          <span className="text-rose-500 font-bold shrink-0">✕</span>
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Technical Reason Callout */}
                <div
                  className={`rounded-xl border p-3 min-h-[52px] ${isLight
                    ? 'border-amber-200 bg-amber-50/80 text-amber-950'
                    : 'border-amber-500/20 bg-amber-950/30 text-amber-200/90'
                    }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-amber-400 text-sm font-bold shrink-0 mt-0.5">⚡</span>
                    <div className="text-[11px] leading-relaxed">
                      <strong className={`font-semibold ${isLight ? 'text-amber-900' : 'text-amber-300'}`}>Why this matters: </strong>
                      {s.whyItMatters}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Controls */}
        <div
          className={`shrink-0 px-5 py-3.5 border-t flex items-center justify-between gap-3 ${isLight ? 'border-zinc-200 bg-zinc-50' : 'border-zinc-800/80 bg-zinc-900/60'
            }`}
        >
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={alwaysShow}
              onChange={(e) => {
                setAlwaysShow(e.target.checked);
                localStorage.setItem('shivnaresh_always_photo_tour', e.target.checked ? 'true' : 'false');
              }}
              className="rounded accent-[#e5373f] h-3.5 w-3.5 cursor-pointer"
            />
            <span className={`text-[11px] ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
              Always show guidelines before upload
            </span>
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onStartUpload();
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition cursor-pointer ${isLight ? 'text-zinc-600 hover:text-zinc-900' : 'text-zinc-400 hover:text-zinc-200'
                }`}
            >
              Skip to Upload
            </button>
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((prev) => Math.max(0, prev - 1))}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${isLight
                  ? 'border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100'
                  : 'border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
                  }`}
              >
                &larr; Back
              </button>
            )}
            {!isLast ? (
              <button
                type="button"
                onClick={() => setStep((prev) => Math.min(PHOTO_GUIDE_STEPS.length - 1, prev + 1))}
                className="rounded-lg bg-[#e5373f] hover:bg-[#d42d35] text-white px-4 py-1.5 text-xs font-bold transition shadow cursor-pointer flex items-center gap-1.5"
              >
                <span>Next Guideline</span>
                <span>&rarr;</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onStartUpload();
                }}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 text-xs font-bold transition shadow cursor-pointer flex items-center gap-1.5"
              >
                <span>📸 Start Uploading Now</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
   Zoom & Macro Crop Download Modal (Exact 1807 × 3000 px Export)
   ---------------------------------------------------------------- */
function ZoomCropDownloadModal({
  isOpen,
  onClose,
  imageUrl,
  imageTitle,
  isLight,
  onUseCrop,
}: {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string | null;
  imageTitle?: string;
  isLight: boolean;
  onUseCrop?: (croppedDataUrl: string) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isExporting, setIsExporting] = useState(false);
  const [currentImage, setCurrentImage] = useState<string | null>(imageUrl);
  const [rotating, setRotating] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Reset viewport state when opening with a new image
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setIsExporting(false);
      setCurrentImage(imageUrl);
    }
  }, [isOpen, imageUrl]);

  if (!isOpen || !imageUrl) return null;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({ x: dragStartRef.current.panX + dx, y: dragStartRef.current.panY + dy });
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      isDraggingRef.current = true;
      dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, panX: pan.x, panY: pan.y };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingRef.current || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - dragStartRef.current.x;
    const dy = e.touches[0].clientY - dragStartRef.current.y;
    setPan({ x: dragStartRef.current.panX + dx, y: dragStartRef.current.panY + dy });
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.88;
    setZoom((prev) => Math.min(5.0, Math.max(1.0, Number((prev * factor).toFixed(2)))));
  };

  const handleExportCrop = async () => {
    const activeImg = resolveImageUrl(currentImage || imageUrl);
    if (!activeImg || !viewportRef.current) return;
    setIsExporting(true);
    try {
      // Load source image first to obtain its TRUE full intrinsic dimensions
      const tempImg = new Image();
      try {
        tempImg.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
          tempImg.onload = () => resolve();
          tempImg.onerror = () => reject(new Error('CORS image load failed'));
          tempImg.src = activeImg;
        });
      } catch {
        try {
          const res = await fetch(activeImg);
          const blob = await res.blob();
          const blobUrl = URL.createObjectURL(blob);
          tempImg.removeAttribute('crossorigin');
          await new Promise<void>((resolve, reject) => {
            tempImg.onload = () => resolve();
            tempImg.onerror = () => reject(new Error('Failed to load image for canvas export'));
            tempImg.src = blobUrl;
          });
          setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
        } catch {
          tempImg.removeAttribute('crossorigin');
          await new Promise<void>((resolve, reject) => {
            tempImg.onload = () => resolve();
            tempImg.onerror = () => reject(new Error('Failed to load image for canvas export'));
            tempImg.src = activeImg;
          });
        }
      }

      const viewport = viewportRef.current;
      const vRect = viewport.getBoundingClientRect();
      const V_w = vRect.width;
      const V_h = vRect.height;
      const realW = tempImg.naturalWidth || imgRef.current?.naturalWidth || imgRef.current?.width || 1807;
      const realH = tempImg.naturalHeight || imgRef.current?.naturalHeight || imgRef.current?.height || 3000;

      // Base scale that fits image inside viewport preserving aspect ratio (contains full vertical portrait)
      const baseScale = Math.min(V_w / realW, V_h / realH);
      const unscaledW = realW * baseScale;
      const unscaledH = realH * baseScale;

      // Exact on-screen rendered size & position with pan and zoom
      const screenW = unscaledW * zoom;
      const screenH = unscaledH * zoom;
      const screenX = (V_w / 2 + pan.x) - screenW / 2;
      const screenY = (V_h / 2 + pan.y) - screenH / 2;

      // Target high-resolution catalog canvas (1807x3000)
      const canvasW = 1807;
      const canvasH = 3000;
      const canvas = document.createElement('canvas');
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context not available');

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Sample image background corner color to seamlessly fill any margins without harsh borders
      try {
        const bgCanvas = document.createElement('canvas');
        bgCanvas.width = 1;
        bgCanvas.height = 1;
        const bgCtx = bgCanvas.getContext('2d');
        if (bgCtx) {
          bgCtx.drawImage(tempImg, 0, 0, 1, 1, 0, 0, 1, 1);
          const p = bgCtx.getImageData(0, 0, 1, 1).data;
          ctx.fillStyle = `rgb(${p[0]}, ${p[1]}, ${p[2]})`;
        } else {
          ctx.fillStyle = '#ffffff';
        }
      } catch {
        ctx.fillStyle = '#ffffff';
      }
      ctx.fillRect(0, 0, canvasW, canvasH);

      // Uniform projection from viewport to high-res canvas (strictly preserves natural aspect ratio and full framing)
      const projScale = canvasW / V_w;
      const destW = screenW * projScale;
      const destH = screenH * projScale;
      const destX = screenX * projScale;
      const destY = screenY * projScale;

      // Draw the full tempImg (0, 0, realW, realH) to prevent any inadvertent top-left clipping
      ctx.drawImage(
        tempImg,
        0,
        0,
        realW,
        realH,
        destX,
        destY,
        destW,
        destH
      );

      canvas.toBlob((blob) => {
        if (!blob) throw new Error('Failed to create image blob');
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        const cleanTitle = (imageTitle || 'render').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
        a.download = `shivnaresh-zoom-crop-1807x3000-${cleanTitle}-${Date.now().toString(36)}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
        setIsExporting(false);
      }, 'image/png');
    } catch (err: any) {
      console.error('[zoom-crop] Export error:', err);
      alert(`Could not export 1807×3000 crop: ${err.message || err}`);
      setIsExporting(false);
    }
  };

  const handleApplyCropForGeneration = async () => {
    const activeImg = resolveImageUrl(currentImage || imageUrl);
    if (!activeImg || !viewportRef.current || !onUseCrop) return;
    setIsExporting(true);
    try {
      const tempImg = new Image();
      try {
        tempImg.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
          tempImg.onload = () => resolve();
          tempImg.onerror = () => reject(new Error('CORS image load failed'));
          tempImg.src = activeImg;
        });
      } catch {
        try {
          const res = await fetch(activeImg);
          const blob = await res.blob();
          const blobUrl = URL.createObjectURL(blob);
          tempImg.removeAttribute('crossorigin');
          await new Promise<void>((resolve, reject) => {
            tempImg.onload = () => resolve();
            tempImg.onerror = () => reject(new Error('Failed to load image for canvas export'));
            tempImg.src = blobUrl;
          });
          setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
        } catch {
          tempImg.removeAttribute('crossorigin');
          await new Promise<void>((resolve, reject) => {
            tempImg.onload = () => resolve();
            tempImg.onerror = () => reject(new Error('Failed to load image for canvas export'));
            tempImg.src = activeImg;
          });
        }
      }

      const viewport = viewportRef.current;
      const vRect = viewport.getBoundingClientRect();
      const V_w = vRect.width;
      const V_h = vRect.height;
      const realW = tempImg.naturalWidth || imgRef.current?.naturalWidth || imgRef.current?.width || 1024;
      const realH = tempImg.naturalHeight || imgRef.current?.naturalHeight || imgRef.current?.height || 1700;

      const baseScale = Math.min(V_w / realW, V_h / realH);
      const unscaledW = realW * baseScale;
      const unscaledH = realH * baseScale;

      const screenW = unscaledW * zoom;
      const screenH = unscaledH * zoom;
      const screenX = (V_w / 2 + pan.x) - screenW / 2;
      const screenY = (V_h / 2 + pan.y) - screenH / 2;

      const targetW = 1024;
      const targetH = Math.round((1024 * V_h) / V_w);
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context not available');

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetW, targetH);

      // Sample image background corner color
      try {
        const bgCanvas = document.createElement('canvas');
        bgCanvas.width = 1;
        bgCanvas.height = 1;
        const bgCtx = bgCanvas.getContext('2d');
        if (bgCtx) {
          bgCtx.drawImage(tempImg, 0, 0, 1, 1, 0, 0, 1, 1);
          const p = bgCtx.getImageData(0, 0, 1, 1).data;
          ctx.fillStyle = `rgb(${p[0]}, ${p[1]}, ${p[2]})`;
          ctx.fillRect(0, 0, targetW, targetH);
        }
      } catch { }

      const projScale = targetW / V_w;
      const destW = screenW * projScale;
      const destH = screenH * projScale;
      const destX = screenX * projScale;
      const destY = screenY * projScale;

      ctx.drawImage(
        tempImg,
        0,
        0,
        realW,
        realH,
        destX,
        destY,
        destW,
        destH
      );

      const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.95);
      onUseCrop(croppedDataUrl);
      onClose();
    } catch (err: any) {
      console.error('[zoom-crop] Apply crop error:', err);
      alert(`Could not apply crop: ${err.message || err}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[135] flex items-center justify-center bg-black/85 p-3 sm:p-5 backdrop-blur-md animate-in fade-in duration-150">
      <div
        className={`w-full max-w-4xl max-h-[94vh] rounded-2xl border shadow-2xl overflow-hidden flex flex-col select-none ${isLight ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-[#0e0e12] border-zinc-800 text-zinc-100'
          }`}
      >
        {/* Header */}
        <div
          className={`shrink-0 px-5 py-3.5 border-b flex items-center justify-between ${isLight ? 'border-zinc-200 bg-zinc-50' : 'border-zinc-800/80 bg-zinc-900/40'
            }`}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-800 text-base text-zinc-200 border border-zinc-700/60 shadow-inner">
              <Maximize2 size={16} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold tracking-tight">Zoom & Macro Crop Download</h3>
                <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                  1807 × 3000 px
                </span>
              </div>
              <p className={`text-[11px] ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                Drag and pan across any detail (logo, sleeves, collar, cuffs) and export a high-resolution 1807×3000 portrait crop.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className={`h-8 w-8 rounded-lg flex items-center justify-center transition text-sm cursor-pointer ${isLight ? 'hover:bg-zinc-200 text-zinc-600' : 'hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100'
              }`}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 flex-1 overflow-y-auto flex flex-col lg:flex-row gap-6 items-center lg:items-start justify-center">
          {/* Interactive Viewport (1807:3000 Portrait Frame) */}
          <div className="flex flex-col items-center">
            <div
              ref={viewportRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onWheel={handleWheel}
              style={{
                width: 'min(330px, calc(66vh * 1807 / 3000))',
                height: 'min(calc(330px * 3000 / 1807), 66vh)',
                aspectRatio: '1807 / 3000',
              }}
              className={`relative rounded-xl overflow-hidden border shadow-inner flex items-center justify-center cursor-grab active:cursor-grabbing bg-black select-none ${isLight ? 'border-zinc-300 ring-1 ring-zinc-200' : 'border-zinc-700/70 ring-1 ring-white/10'
                }`}
            >
              {/* Scaled & Panned Image */}
              <img
                ref={imgRef}
                src={resolveImageUrl(currentImage || imageUrl)}
                alt="Zoom Preview"
                draggable={false}
                crossOrigin="anonymous"
                onError={(e) => {
                  const el = e.currentTarget;
                  if (el.crossOrigin) {
                    el.removeAttribute('crossorigin');
                    el.src = resolveImageUrl(currentImage || imageUrl);
                  }
                }}
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: 'center center',
                  transition: isDraggingRef.current ? 'none' : 'transform 0.08s ease-out',
                }}
                className="max-h-full max-w-full object-contain pointer-events-none select-none"
              />

              {/* Viewport Framing Guides */}
              <div className="absolute inset-0 pointer-events-none border border-white/20 rounded-xl" />
              <div className="absolute top-2 left-2 pointer-events-none rounded bg-black/60 backdrop-blur-md px-1.5 py-0.5 text-[9px] font-bold text-white/80 border border-white/10">
                1807 × 3000 Frame
              </div>
              <div className="absolute bottom-2 inset-x-2 pointer-events-none flex items-center justify-between text-[9px] text-white/60 bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10">
                <span>Drag to Pan</span>
                <span>{Math.round(zoom * 100)}%</span>
                <span>Wheel to Zoom</span>
              </div>
            </div>
            <p className={`text-[10px] mt-2 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
              Click & drag anywhere inside frame to reposition crop
            </p>
          </div>

          {/* Controls Side Panel */}
          <div className="w-full lg:w-72 flex flex-col gap-4">
            {/* Zoom Slider Control */}
            <div className={`rounded-xl border p-3.5 space-y-2 ${isLight ? 'border-zinc-200 bg-zinc-50' : 'border-zinc-800 bg-zinc-900/40'}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold flex items-center gap-1.5">
                  <ZoomIn size={14} className="text-emerald-500" />
                  <span>Zoom Level</span>
                </span>
                <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                  {Math.round(zoom * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="1.0"
                max="5.0"
                step="0.05"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="w-full accent-[#e5373f] cursor-pointer h-1.5 bg-zinc-700 rounded-lg"
              />
              {/* Quick Presets */}
              <div className="grid grid-cols-4 gap-1.5 pt-1">
                {[
                  { label: '1x Fit', val: 1.0 },
                  { label: '1.8x', val: 1.8 },
                  { label: '3x Macro', val: 3.0 },
                  { label: '5x Max', val: 5.0 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setZoom(preset.val)}
                    className={`py-1 text-[10px] font-bold rounded-lg border transition cursor-pointer ${Math.abs(zoom - preset.val) < 0.1
                      ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                      : isLight
                        ? 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100'
                        : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                      }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* View Alignment Controls */}
            <div className={`rounded-xl border p-3 flex items-center justify-between ${isLight ? 'border-zinc-200 bg-zinc-50' : 'border-zinc-800 bg-zinc-900/40'}`}>
              <span className="text-xs font-semibold flex items-center gap-1.5">
                <Move size={13} className="text-zinc-400" />
                <span>Pan Position</span>
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPan({ x: 0, y: 0 })}
                  className={`px-2.5 py-1 text-[10px] font-semibold rounded-lg border transition cursor-pointer ${isLight ? 'border-zinc-300 bg-white hover:bg-zinc-100' : 'border-zinc-700 bg-zinc-800 hover:bg-zinc-700'
                    }`}
                  title="Center pan position"
                >
                  Center
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                  className={`px-2.5 py-1 text-[10px] font-semibold rounded-lg border transition cursor-pointer flex items-center gap-1 ${isLight ? 'border-zinc-300 bg-white hover:bg-zinc-100' : 'border-zinc-700 bg-zinc-800 hover:bg-zinc-700'
                    }`}
                  title="Reset zoom and pan"
                >
                  <RotateCcw size={10} />
                  <span>Reset</span>
                </button>
              </div>
            </div>

            {/* Rotate Image Control */}
            <div className={`rounded-xl border p-3 flex items-center justify-between ${isLight ? 'border-zinc-200 bg-zinc-50' : 'border-zinc-800 bg-zinc-900/40'}`}>
              <span className="text-xs font-semibold flex items-center gap-1.5">
                <RotateCw size={13} className="text-zinc-400" />
                <span>Orientation</span>
              </span>
              <button
                type="button"
                disabled={rotating}
                onClick={async () => {
                  const targetImg = currentImage || imageUrl;
                  if (!targetImg) return;
                  setRotating(true);
                  try {
                    const rot = await rotateImage(targetImg, 90);
                    setCurrentImage(rot.dataUrl);
                  } finally {
                    setRotating(false);
                  }
                }}
                className={`px-2.5 py-1 text-[10px] font-semibold rounded-lg border transition cursor-pointer flex items-center gap-1.5 ${isLight ? 'border-zinc-300 bg-white hover:bg-zinc-100 text-zinc-800' : 'border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                  }`}
                title="Rotate 90° clockwise"
              >
                <RotateCw size={11} className={rotating ? 'animate-spin' : ''} />
                <span>{rotating ? 'Rotating…' : 'Rotate 90°'}</span>
              </button>
            </div>

            {/* Export Specifications Box */}
            <div className={`rounded-xl border p-3 text-[11px] space-y-1.5 ${isLight ? 'border-zinc-200 bg-zinc-50' : 'border-zinc-800 bg-zinc-900/40'}`}>
              <div className="flex items-center justify-between text-zinc-400">
                <span>Output Resolution:</span>
                <span className="font-bold text-zinc-200">1807 × 3000 px</span>
              </div>
              <div className="flex items-center justify-between text-zinc-400">
                <span>Aspect Ratio:</span>
                <span className="font-bold text-zinc-200">~1 : 1.66 (Portrait)</span>
              </div>
              <div className="flex items-center justify-between text-zinc-400">
                <span>Interpolation:</span>
                <span className="font-bold text-emerald-400">Bicubic High-Res</span>
              </div>
            </div>

            {/* Action Buttons */}
            {onUseCrop && (
              <button
                type="button"
                disabled={isExporting}
                onClick={() => void handleApplyCropForGeneration()}
                className="w-full rounded-xl bg-[#e5373f] hover:bg-[#c92a32] text-white py-3 px-4 text-xs font-bold uppercase tracking-wider transition shadow-lg cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <span>✂️ Use This Zoomed View for Generation</span>
              </button>
            )}

            <button
              type="button"
              disabled={isExporting}
              onClick={() => void handleExportCrop()}
              className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white py-3 px-4 text-xs font-bold uppercase tracking-wider transition shadow-lg cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isExporting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Rendering 1807×3000 Crop…</span>
                </>
              ) : (
                <>
                  <Download size={14} />
                  <span>Download Zoomed Crop</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
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
        className={`w-full max-w-md rounded-3xl border p-7 shadow-2xl transition-colors ${isLight ? 'bg-white border-gray-200 text-gray-900' : 'bg-[#121217] border-white/20 text-white'
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
            className={`rounded-full p-2 transition-colors ${isLight ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-white/10 hover:bg-white/20 text-white'
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
            <div className="mt-1.5 flex flex-wrap gap-1.5 items-center">
              <span className={`rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase border ${isLight ? 'bg-amber-100 text-amber-950 border-amber-300' : 'bg-amber-500/15 border-amber-500/30 text-amber-500'
                }`}>
                {user.credits} credits
              </span>
              <span className="rounded-full bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 text-[9px] font-bold text-purple-500 uppercase">
                {user.tier || 'Free'} Tier
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase border ${isLight ? 'bg-cyan-100 text-cyan-950 border-cyan-300' : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
                }`}>
                {Math.floor((user.modelsGenerated || 0) / 6)} / {user.photoshoots || user.maxModels || 20} Photoshoots
              </span>
            </div>
            <p className="mt-1 text-[9px] opacity-60">
              1 photoshoot = 6 poses. All generated poses (including test/imperfect) count toward quota ({user.modelsGenerated || 0}/{(user.photoshoots || user.maxModels || 20) * 6} poses).
            </p>
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
              className={`w-full rounded-xl border p-2.5 focus:outline-none transition-colors ${isLight
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
              className={`w-full rounded-xl border p-2.5 opacity-60 cursor-not-allowed ${isLight ? 'border-gray-200 bg-gray-100 text-gray-600' : 'border-white/5 bg-black/20 text-white/50'
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
                className={`w-full rounded-xl border p-2.5 pl-12 focus:outline-none transition-colors ${isLight
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
export function getBestGenUrl(g: UserGeneration): string {
  const clean = [g.url, g.highResUrl, g.outputUrl, g.remoteUrl]
    .filter(Boolean)
    .find((u) => typeof u === 'string' && !u.includes('ibb.co') && !u.includes('imgbb.com'));
  if (clean) return clean;
  return g.url || g.highResUrl || g.remoteUrl || '';
}

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
  onZoomCrop,
  onAddLogo,
  onEditLogo,
  onBatchAddLogo,
  isBatchBranding,
  batchBrandProgress,
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
  onZoomCrop?: (url: string, title: string) => void;
  onAddLogo?: (gen: UserGeneration) => void;
  onEditLogo?: (gen: UserGeneration) => void;
  onBatchAddLogo?: (targets: UserGeneration[]) => Promise<void>;
  isBatchBranding?: boolean;
  batchBrandProgress?: { current: number; total: number } | null;
  isLight: boolean;
}) {
  const [filter, setFilter] = useState<'all' | 'images' | 'videos' | 'sets'>('all');
  const [showInstructions, setShowInstructions] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedGenIds, setSelectedGenIds] = useState<string[]>([]);
  const [zipping, setZipping] = useState(false);
  const [pendingCloth, setPendingCloth] = useState<{ file: File; preview: string } | null>(null);
  const [pendingModel, setPendingModel] = useState<{ file: File; preview: string } | null>(null);
  const [confirming, setConfirming] = useState<{ kind: 'cloth' | 'model'; file: File; preview: string } | null>(null);
  const [setPromptText, setSetPromptText] = useState('');
  const batchUploadMySetsRef = useRef<HTMLInputElement>(null);
  const [mySetsUploading, setMySetsUploading] = useState(false);
  const [mySetsUploadProgress, setMySetsUploadProgress] = useState<{ current: number; total: number } | null>(null);

  const handleBatchUploadToMySets = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fileArr = Array.from(files);
    e.target.value = '';

    setMySetsUploading(true);
    setMySetsUploadProgress({ current: 0, total: fileArr.length });

    try {
      let completed = 0;
      const processOne = async (file: File) => {
        const standardized = await prepareAndStandardizeImage(file);
        const uploaded = await api.upload(standardized.dataUrl, 'cloth', file.name);
        await api.saveUserGeneration({
          type: 'image',
          url: uploaded.url,
          title: file.name,
          prompt: `Manual Upload · ${file.name}`,
          resolution: '2k',
          isManualUpload: true,
        });
        completed++;
        setMySetsUploadProgress({ current: completed, total: fileArr.length });
      };

      let index = 0;
      const workers = Array(Math.min(3, fileArr.length)).fill(0).map(async () => {
        while (index < fileArr.length) {
          const i = index++;
          await processOne(fileArr[i]);
        }
      });
      await Promise.all(workers);
      refreshGenerations();
      refreshSets();
    } catch (err: any) {
      setError(err?.message || 'Failed to upload images to My Sets');
    } finally {
      setMySetsUploading(false);
      setMySetsUploadProgress(null);
    }
  };

  async function handleDownloadZip() {
    if (selectedGenIds.length === 0) return;
    setZipping(true);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const folder = zip.folder('shivnaresh-catalog-ready');
      const selectedGens = generations.filter((g) => selectedGenIds.includes(g.id));
      let addedFilesCount = 0;

      for (let i = 0; i < selectedGens.length; i++) {
        const g = selectedGens[i];
        try {
          const rawUrl = getBestGenUrl(g);
          if (!rawUrl) continue;
          const isVideo = rawUrl.endsWith('.mp4') || rawUrl.includes('.mp4');
          if (isVideo) {
            const res = await fetch(getProxiedImageUrl(rawUrl));
            const blob = await res.blob();
            const fileName = `render-${i + 1}-${g.id.slice(0, 6)}.mp4`;
            zip.file(fileName, blob);
            folder?.file(fileName, blob);
            addedFilesCount++;
          } else {
            // Standardize every catalog image to exact Width 1807px, Height 3000px
            const fileName = `catalog-1807x3000-${i + 1}-${g.id.slice(0, 6)}.png`;
            const blob = await scaleToEcommerceCatalog(rawUrl, 1807, 3000, fileName);
            zip.file(fileName, blob);
            folder?.file(fileName, blob);
            addedFilesCount++;
          }
        } catch (itemErr) {
          console.warn(`[zip] Skipping render ${g.id}:`, itemErr);
        }
      }

      if (addedFilesCount === 0) {
        throw new Error('No images could be packed into the ZIP archive. Please verify that the selected images are still accessible.');
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const objectUrl = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `shivnaresh-catalog-1807x3000-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
    } catch (err) {
      setError('Failed to create ZIP: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setZipping(false);
    }
  }
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [deletingSetId, setDeletingSetId] = useState('');
  const [deletingGenId, setDeletingGenId] = useState('');
  const [batchDeleting, setBatchDeleting] = useState(false);

  const clothRef = useRef<HTMLInputElement>(null);
  const modelRef = useRef<HTMLInputElement>(null);

  const imageGenerations = generations.filter((g) => g.type !== 'video' && Boolean(getBestGenUrl(g)));
  const videoGenerations = generations.filter((g) => g.type === 'video' && (Boolean(g.url) || Boolean(g.highResUrl)));

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
    if (!confirm('Move this item to the Admin Recycle Bin? (Admin can restore it anytime or permanently delete it)')) return;
    setDeletingGenId(id);
    try {
      onDeleteGeneration(id);
      await api.deleteUserGeneration(id);
      refreshGenerations();
    } catch (e) {
      refreshGenerations();
      setError(e instanceof Error ? e.message : 'Could not delete item');
    } finally {
      setDeletingGenId('');
    }
  }

  async function handleBatchDelete() {
    if (selectedGenIds.length === 0) return;
    const count = selectedGenIds.length;
    const confirmed = window.confirm(
      `Are you sure you want to delete ${count} selected image${count > 1 ? 's' : ''}?\n\nThey will be safely moved to the Admin Recycle Bin where admin can view, restore, or permanently delete them.`
    );
    if (!confirmed) return;

    setBatchDeleting(true);
    const idsToDelete = [...selectedGenIds];
    // Immediate optimistic removal from screen
    idsToDelete.forEach((id) => onDeleteGeneration(id));
    setSelectedGenIds([]);

    try {
      await api.batchDeleteUserGenerations(idsToDelete);
      refreshGenerations();
    } catch {
      try {
        await Promise.allSettled(idsToDelete.map((id) => api.deleteUserGeneration(id)));
        refreshGenerations();
      } catch (e: any) {
        refreshGenerations();
        setError(e?.message || 'Could not delete selected items');
      }
    } finally {
      setBatchDeleting(false);
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
          <input
            ref={batchUploadMySetsRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleBatchUploadToMySets}
          />
          <button
            type="button"
            disabled={mySetsUploading}
            onClick={() => batchUploadMySetsRef.current?.click()}
            className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Upload any number of images simultaneously to your My Sets library"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>{mySetsUploading ? 'Uploading…' : '+ Upload to My Sets'}</span>
          </button>
          <button
            type="button"
            onClick={() => { refreshSets(); refreshGenerations(); }}
            className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-semibold transition ${isLight ? 'border-gray-300 hover:bg-gray-100 text-gray-700' : 'border-white/15 hover:bg-white/10 text-white/70'
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

      {/* Real-time Simultaneous Upload Progress Bar */}
      {mySetsUploadProgress && (
        <div className="mt-4 p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-emerald-400">Uploading photos to My Sets simultaneously…</span>
            <span className="font-bold text-white">
              {Math.round((mySetsUploadProgress.current / (mySetsUploadProgress.total || 1)) * 100)}%
            </span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-emerald-500 h-full transition-all duration-300"
              style={{ width: `${Math.round((mySetsUploadProgress.current / (mySetsUploadProgress.total || 1)) * 100)}%` }}
            />
          </div>
          <p className="text-[10px] opacity-60">Uploaded {mySetsUploadProgress.current} of {mySetsUploadProgress.total} photos</p>
        </div>
      )}

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
            className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all ${filter === tab.id
              ? 'bg-[#e5373f] text-white shadow-md'
              : isLight
                ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
              }`}
          >
            {tab.label}
          </button>
        ))}
        {(loadingSets || loadingGenerations) && (uploadSets.length > 0 || generations.length > 0) && (
          <span className="text-[10px] opacity-60 flex items-center gap-1.5 ml-auto animate-pulse font-medium">
            <RefreshCw className="h-3 w-3 animate-spin text-[#e5373f]" />
            <span>Updating media…</span>
          </span>
        )}
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
                className={`flex aspect-[4/3] w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed p-4 text-center transition ${isLight ? 'border-gray-300 bg-gray-50 hover:border-gray-400' : 'border-white/20 bg-black/40 hover:border-white/40'
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
                className={`flex aspect-[4/3] w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed p-4 text-center transition ${isLight ? 'border-gray-300 bg-gray-50 hover:border-gray-400' : 'border-white/20 bg-black/40 hover:border-white/40'
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
              className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-xs focus:outline-none ${isLight ? 'border-gray-300 bg-gray-50 text-gray-900 focus:bg-white' : 'border-white/10 bg-black/50 text-white focus:border-white/40'
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
      {(loadingSets || loadingGenerations) && uploadSets.length === 0 && generations.length === 0 ? (
        <div className="py-24 text-center text-sm opacity-50 flex flex-col items-center justify-center gap-3">
          <RefreshCw className="h-6 w-6 animate-spin text-[#e5373f]" />
          <span>Loading archive media…</span>
        </div>
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
                    className={`flex flex-col justify-between rounded-2xl border p-4 shadow-sm transition-all ${isLight ? 'border-gray-200 bg-white' : 'border-white/10 bg-black/50'
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
                        onClick={() => safeOpenMediaInNewTab(gen.highResUrl || gen.url, `shivnaresh-video-${gen.id.slice(0, 6)}`)}
                        className={`rounded-full border p-2 text-xs transition ${isLight ? 'border-gray-300 text-gray-700 hover:bg-gray-100' : 'border-white/15 text-white hover:bg-white/10'
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
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <Camera className="h-4 w-4 text-current/70" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider">Generated studio images ({imageGenerations.length})</h3>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedGenIds.length === imageGenerations.length) {
                        setSelectedGenIds([]);
                      } else {
                        setSelectedGenIds(imageGenerations.map((g) => g.id));
                      }
                    }}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${isLight ? 'border-gray-200 bg-white hover:bg-gray-50' : 'border-white/10 bg-black/40 hover:bg-white/10'
                      }`}
                  >
                    {selectedGenIds.length === imageGenerations.length ? 'Deselect All' : 'Select All'}
                  </button>

                  {/* Batch Add HD Logo Action */}
                  {onBatchAddLogo && (
                    <button
                      type="button"
                      onClick={() => {
                        const targets = selectedGenIds.length > 0
                          ? imageGenerations.filter((g) => selectedGenIds.includes(g.id))
                          : imageGenerations;
                        void onBatchAddLogo(targets);
                      }}
                      disabled={isBatchBranding || imageGenerations.length === 0}
                      className="rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black px-3 py-1 text-[11px] font-bold shadow transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      title="Automatically stamp official HD vector Shiv-Naresh logo onto all generated images or selected images"
                    >
                      <Sparkles className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        {isBatchBranding
                          ? `Branding (${batchBrandProgress?.current || 0}/${batchBrandProgress?.total || 0})…`
                          : selectedGenIds.length > 0
                            ? `✨ Add HD Logo on Selected (${selectedGenIds.length})`
                            : `✨ Add HD Logo on All (${imageGenerations.length})`}
                      </span>
                    </button>
                  )}

                  {selectedGenIds.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleDownloadZip()}
                        disabled={zipping || batchDeleting || isBatchBranding}
                        className="rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 text-[11px] font-bold shadow transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {zipping ? 'Compressing ZIP…' : `⬇️ Download Selected (${selectedGenIds.length}) as ZIP`}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleBatchDelete()}
                        disabled={batchDeleting || zipping || isBatchBranding}
                        className="rounded-lg bg-red-600 hover:bg-red-500 text-white px-3 py-1 text-[11px] font-bold shadow transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        title="Move all selected images to Admin Recycle Bin"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>{batchDeleting ? 'Moving to Bin…' : `🗑️ Delete Selected (${selectedGenIds.length})`}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {imageGenerations.map((gen) => (
                  <div
                    key={gen.id}
                    className={`flex flex-col justify-between rounded-2xl border p-4 shadow-sm transition-all ${isLight ? 'border-gray-200 bg-white' : 'border-white/10 bg-black/50'
                      }`}
                  >
                    <div>
                      <div
                        className="relative rounded-xl overflow-hidden bg-black/60 aspect-[3/4] cursor-pointer group"
                      >
                        {(() => {
                          const primary = getBestGenUrl(gen);
                          if (!primary) return null;
                          return (
                            <img
                              src={resolveImageUrl(primary)}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-cover"
                              onClick={() => safeOpenMediaInNewTab(primary, gen.prompt || 'Shiv-Naresh Render')}
                              onError={(e) => {
                                const el = e.currentTarget;
                                const curSrc = el.src || '';
                                if (!curSrc.includes('/api/proxy-image') && primary.startsWith('http')) {
                                  const rawBase = (import.meta.env.VITE_API_URL || '').trim();
                                  const apiBase = rawBase.includes('shivnaresh-api.onrender.com') ? '' : rawBase.replace(/\/+$/, '');
                                  el.src = `${apiBase}/api/proxy-image?url=${encodeURIComponent(primary)}`;
                                  return;
                                }
                                el.style.display = 'none';
                                const parent = el.parentElement;
                                if (parent && !parent.querySelector('.broken-img-placeholder')) {
                                  const ph = document.createElement('div');
                                  ph.className = 'broken-img-placeholder absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-zinc-900/90 text-zinc-400 select-none';
                                  ph.innerHTML = '<span class="text-3xl mb-1">🖼️</span><span class="text-xs font-semibold text-zinc-200">Image Expired or Incomplete</span><span class="text-[10px] text-zinc-400 mt-1">Click trash icon below to move to Recycle Bin</span>';
                                  parent.appendChild(ph);
                                }
                              }}
                            />
                          );
                        })()}
                        {/* EDITED Badge Sticker */}
                        {Boolean(gen.isEdited || gen.type === 'edit' || (gen.prompt && /\b(edit|edited|option b)\b/i.test(gen.prompt))) && (
                          <span className="absolute top-2 right-2 rounded-md bg-amber-400 text-black px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider shadow-md z-10 border border-amber-300">
                            ✏️ EDITED
                          </span>
                        )}
                        <label
                          onClick={(e) => e.stopPropagation()}
                          className="absolute top-2 left-2 z-10 flex items-center justify-center h-5 w-5 rounded bg-black/70 border border-white/40 cursor-pointer transition hover:bg-black"
                          title="Select for batch ZIP download or delete"
                        >
                          <input
                            type="checkbox"
                            checked={selectedGenIds.includes(gen.id)}
                            onChange={(e) => {
                              setSelectedGenIds((prev) =>
                                e.target.checked ? [...prev, gen.id] : prev.filter((id) => id !== gen.id)
                              );
                            }}
                            className="h-3 w-3 accent-[#e5373f] cursor-pointer"
                          />
                        </label>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-[10px] opacity-60">
                        <span className="font-mono">{new Date(gen.createdAt).toLocaleDateString()}</span>
                        {gen.isManualUpload && (
                          <span className="px-2 py-0.5 rounded text-[9px] font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30">
                            Uploaded Asset
                          </span>
                        )}
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

                    <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                      {/* Primary Download Action: Full-width premium catalog button (never overflows) */}
                      <button
                        type="button"
                        onClick={() => {
                          const primary = getBestGenUrl(gen);
                          const targetUrl = resolveImageUrl(primary);
                          if (targetUrl) void downloadDirectFile(targetUrl, `shivnaresh-studio-1807x3000-${gen.id.slice(0, 6)}.png`);
                        }}
                        className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white text-center py-2 px-3 text-xs font-bold tracking-wide transition-all shadow-md hover:shadow-emerald-500/25 cursor-pointer flex items-center justify-center gap-2 border border-emerald-400/30"
                        title="Download high-resolution catalog standard image (1807 × 3000 px)"
                      >
                        <Download className="h-4 w-4 shrink-0" />
                        <span>Download 1807 × 3000 px</span>
                      </button>

                      {/* Logo Actions: Add HD Logo & Edit / Erase */}
                      <div className="grid grid-cols-2 gap-1.5">
                        {onAddLogo && (
                          <button
                            type="button"
                            onClick={() => onAddLogo(gen)}
                            className="w-full rounded-lg bg-emerald-500/15 hover:bg-emerald-500 text-emerald-300 hover:text-white border border-emerald-500/30 py-1.5 px-2 text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                            title="Add official HD Vector Shiv-Naresh branding to this image in Studio"
                          >
                            <Sparkles className="h-3 w-3 shrink-0 text-amber-300" />
                            <span className="truncate">Add HD Logo</span>
                          </button>
                        )}
                        {onEditLogo && (
                          <button
                            type="button"
                            onClick={() => onEditLogo(gen)}
                            className="w-full rounded-lg bg-amber-500/15 hover:bg-amber-500 text-amber-300 hover:text-black border border-amber-500/30 py-1.5 px-2 text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                            title="Open in Logo Eraser Studio to erase unwanted AI logos or select Canva area"
                          >
                            <Eraser className="h-3 w-3 shrink-0" />
                            <span className="truncate">Edit / Erase</span>
                          </button>
                        )}
                      </div>

                      {/* Secondary Utility Actions (Zoom, View, Delete) */}
                      <div className="flex items-center gap-1.5">
                        {onZoomCrop && (
                          <button
                            type="button"
                            onClick={() => {
                              const primary = getBestGenUrl(gen);
                              const targetUrl = resolveImageUrl(primary);
                              if (targetUrl) onZoomCrop(targetUrl, `studio-${gen.id.slice(0, 6)}`);
                            }}
                            className={`flex-1 min-w-0 rounded-lg border py-1.5 px-2 text-[11px] font-semibold transition cursor-pointer flex items-center justify-center gap-1 ${isLight
                              ? 'border-gray-200 text-slate-700 hover:bg-gray-100'
                              : 'border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
                              }`}
                            title="Open interactive Zoom & Macro Crop Studio (1807×3000 px)"
                          >
                            <Maximize2 className="h-3 w-3 text-emerald-400 shrink-0" />
                            <span className="truncate">Zoom</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const primary = getBestGenUrl(gen);
                            if (primary) safeOpenMediaInNewTab(primary, gen.prompt || 'Shiv-Naresh Render');
                          }}
                          className={`rounded-lg border p-1.5 text-xs transition cursor-pointer shrink-0 flex items-center justify-center ${isLight
                            ? 'border-gray-200 text-slate-700 hover:bg-gray-100'
                            : 'border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
                            }`}
                          title="Open full image in new tab"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteGen(gen.id)}
                          disabled={deletingGenId === gen.id}
                          className="rounded-lg border border-red-500/20 p-1.5 text-xs text-red-400 hover:bg-red-500/10 hover:border-red-500/40 transition cursor-pointer disabled:opacity-50 shrink-0 flex items-center justify-center"
                          title="Delete image from My Sets (moves safely to Admin Recycle Bin)"
                        >
                          {deletingGenId === gen.id ? '…' : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </div>
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
                    className={`flex flex-col justify-between rounded-2xl border p-5 shadow-sm ${isLight ? 'border-gray-200 bg-white' : 'border-white/10 bg-black/50'
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
                        onClick={() => safeOpenMediaInNewTab(set.clothUrl || set.modelUrl, set.clothName || 'Outfit Set')}
                        className={`rounded-full border p-2 text-xs transition ${isLight ? 'border-gray-300 text-gray-700 hover:bg-gray-100' : 'border-white/15 text-white hover:bg-white/10'
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

          {/* Empty state for Saved Sets */}
          {filter === 'sets' && uploadSets.length === 0 && (
            <div className={`rounded-2xl border p-12 text-center ${isLight ? 'border-gray-200 bg-white' : 'border-white/10 bg-white/[0.01]'}`}>
              <Folder className="h-8 w-8 mx-auto mb-2 text-current/30" />
              <p className="text-sm font-semibold">No saved outfit sets found.</p>
              <p className="text-xs opacity-50 mt-1 max-w-sm mx-auto mb-4">
                Save your favorite paired combinations of garments and models for quick 1-click loading.
              </p>
              <button
                type="button"
                onClick={() => setFormOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#e5373f] text-white text-xs font-semibold hover:bg-[#d42d35] transition shadow-xs cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>+ Create First Outfit Set</span>
              </button>
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

/* Fast client-side image compression helper to ensure instant, reliable uploads */
async function compressForUpload(file: File, maxDim = 1600, quality = 0.85): Promise<string> {
  if (!file.type.startsWith('image/') || file.size < 250 * 1024) {
    return fileToDataUrl(file);
  }
  return new Promise<string>((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } else {
        fileToDataUrl(file).then(resolve);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      fileToDataUrl(file).then(resolve);
    };
    img.src = url;
  });
}

/** Universal client-side image rotator: rotates any image URL, Data URL, or File by degrees (default 90 deg) and returns new dataUrl + File */
async function rotateImage(imageSource: string | File, degrees = 90): Promise<{ dataUrl: string; file: File }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const srcUrl = typeof imageSource === 'string' ? imageSource : URL.createObjectURL(imageSource);

    img.onload = () => {
      if (typeof imageSource !== 'string') URL.revokeObjectURL(srcUrl);
      const normDeg = ((degrees % 360) + 360) % 360;
      const rad = (normDeg * Math.PI) / 180;
      const isSwapped = normDeg === 90 || normDeg === 270;
      const origW = img.naturalWidth || img.width;
      const origH = img.naturalHeight || img.height;
      const w = isSwapped ? origH : origW;
      const h = isSwapped ? origW : origH;

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas 2D context not available'));

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.translate(w / 2, h / 2);
      ctx.rotate(rad);
      ctx.drawImage(img, -origW / 2, -origH / 2);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      canvas.toBlob((blob) => {
        const file = new File([blob || ''], `rotated-${Date.now()}.jpg`, { type: 'image/jpeg' });
        resolve({ dataUrl, file });
      }, 'image/jpeg', 0.95);
    };

    img.onerror = (err) => {
      if (typeof imageSource !== 'string') URL.revokeObjectURL(srcUrl);
      reject(err);
    };

    img.src = srcUrl;
  });
}

/* ----------------------------------------------------------------
   Custom Requests Tab Component (24-48h SLA & Admin Replies)
   ---------------------------------------------------------------- */
function CustomRequestsPanel({
  requests,
  loading,
  onRefresh,
  creditsLocked,
  customRequestsLocked: _customRequestsLocked,
  isLight = false,
  onUnreadCleared,
  initialTab = 'send',
  onUseAsset,
}: {
  requests: CustomRequest[];
  loading: boolean;
  onRefresh: () => void;
  creditsLocked?: boolean;
  customRequestsLocked?: boolean;
  isLight?: boolean;
  onUnreadCleared?: () => void;
  initialTab?: 'send' | 'receive';
  onUseAsset?: (url: string, role?: 'cloth' | 'model') => void;
}) {
  const [panelTab, setPanelTab] = useState<'send' | 'receive'>(initialTab);
  const [deliveries, setDeliveries] = useState<AdminDelivery[]>(() => {
    try {
      const cached = localStorage.getItem('cached_user_deliveries');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [unreadDeliveriesCount, setUnreadDeliveriesCount] = useState(0);

  const [selectedMediaUrls, setSelectedMediaUrls] = useState<Array<{ url: string; name: string }>>([]);
  const [batchDownloading, setBatchDownloading] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomRotation, setZoomRotation] = useState(0);
  const [uploadProgressState, setUploadProgressState] = useState<{ current: number; total: number } | null>(null);
  const [savingToMySets, setSavingToMySets] = useState(false);
  const [saveToSetsNotice, setSaveToSetsNotice] = useState('');
  const [expandedDeliveryIds, setExpandedDeliveryIds] = useState<Set<string>>(new Set());

  const [brokenImageUrls, setBrokenImageUrls] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('sn_broken_urls');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const markGlobalBrokenUrl = useCallback((url: string) => {
    if (!url) return;
    setBrokenImageUrls((prev) => {
      const next = new Set(prev);
      next.add(url);
      try {
        localStorage.setItem('sn_broken_urls', JSON.stringify(Array.from(next)));
      } catch { }
      return next;
    });
  }, []);

  const toggleDeliveryExpand = (id: string) => {
    setExpandedDeliveryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const loadDeliveries = useCallback(async () => {
    setDeliveriesLoading(true);
    try {
      const res = await api.getUserDeliveries();
      setDeliveries(res.items || []);
      setUnreadDeliveriesCount(res.unreadCount || 0);
      try {
        localStorage.setItem('cached_user_deliveries', JSON.stringify(res.items || []));
      } catch { }
    } catch (e) {
      console.warn('Failed to load user deliveries:', e);
    } finally {
      setDeliveriesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDeliveries();
  }, [loadDeliveries]);

  const handleSelectReceiveTab = useCallback(async () => {
    setPanelTab('receive');
    try {
      await api.markUserDeliveriesRead();
      setUnreadDeliveriesCount(0);
      setDeliveries((prev) => prev.map((d) => ({ ...d, readByUser: true })));
      onUnreadCleared?.();
    } catch (e) {
      console.warn('Error marking deliveries read:', e);
    }
  }, [onUnreadCleared]);

  useEffect(() => {
    if (initialTab) {
      setPanelTab(initialTab);
      if (initialTab === 'receive') {
        void handleSelectReceiveTab();
      }
    }
  }, [initialTab, handleSelectReceiveTab]);

  const handleDeleteRequest = async (id: string) => {
    if (!window.confirm('Delete this custom request? It will be moved to the studio recycle bin.')) return;
    try {
      await api.deleteCustomRequest(id);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to delete custom request');
    }
  };

  const handleDeleteDelivery = async (id: string) => {
    if (!window.confirm('Remove this delivery from your dashboard? It will be moved to the studio recycle bin.')) return;
    try {
      await api.deleteUserDelivery(id);
      setDeliveries((prev) => prev.filter((d) => d.id !== id));
      void loadDeliveries();
    } catch (err: any) {
      alert(err.message || 'Failed to remove delivery');
    }
  };

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
      const allItems = [
        ...pendingClothes.map((c) => ({ file: c.file, kind: 'cloth' as const })),
        ...pendingModels.map((m) => ({ file: m.file, kind: 'model' as const })),
      ];
      const totalFiles = allItems.length;
      let completedCount = 0;
      setUploadProgressState({ current: 0, total: totalFiles });

      const uploadSingle = async (item: { file: File; kind: 'cloth' | 'model' }) => {
        const compressed = await compressForUpload(item.file);
        const upRes = await api.upload(compressed, item.kind, item.file.name);
        completedCount++;
        setUploadProgressState({ current: completedCount, total: totalFiles });
        return upRes.url || compressed;
      };

      // Concurrency pool of 3
      const results: string[] = [];
      let workerIdx = 0;
      const workers = Array(Math.min(3, allItems.length || 1)).fill(0).map(async () => {
        while (workerIdx < allItems.length) {
          const i = workerIdx++;
          results[i] = await uploadSingle(allItems[i]);
        }
      });
      await Promise.all(workers);

      const clothImages = results.slice(0, pendingClothes.length);
      const modelImages = results.slice(pendingClothes.length);

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
      setUploadProgressState(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      {lightboxImg && (
        <div
          className="fixed inset-0 z-[150] flex flex-col items-center justify-center bg-black/95 p-3 sm:p-6 backdrop-blur-md"
          onClick={() => {
            setLightboxImg(null);
            setZoomScale(1);
            setZoomRotation(0);
          }}
        >
          {/* Top Control Bar */}
          <div
            className="flex items-center justify-between w-full max-w-4xl px-4 py-2.5 mb-2 rounded-2xl bg-black/75 border border-white/10 text-white z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-[#e5373f] text-white">
                Studio HD 1807 × 3000
              </span>
              <span className="text-xs opacity-60 font-mono">
                {Math.round(zoomScale * 100)}%
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setZoomScale((s) => Math.min(4, Number((s + 0.25).toFixed(2))))}
                className="p-1.5 rounded-lg border border-white/10 hover:bg-white/10 transition cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoomScale((s) => Math.max(0.5, Number((s - 0.25).toFixed(2))))}
                className="p-1.5 rounded-lg border border-white/10 hover:bg-white/10 transition cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoomRotation((r) => (r + 90) % 360)}
                className="p-1.5 rounded-lg border border-white/10 hover:bg-white/10 transition cursor-pointer"
                title="Rotate 90° Clockwise"
              >
                <RotateCw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoomScale(1);
                  setZoomRotation(0);
                }}
                className="px-2 py-1 text-[11px] rounded-lg border border-white/10 hover:bg-white/10 transition cursor-pointer"
                title="Reset Zoom"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => {
                  setLightboxImg(null);
                  setZoomScale(1);
                  setZoomRotation(0);
                }}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition cursor-pointer ml-2"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Central Image Canvas with Sharp Rendering */}
          <div
            className="relative flex-1 flex items-center justify-center overflow-hidden w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxImg}
              alt="Preview"
              style={{
                transform: `scale(${zoomScale}) rotate(${zoomRotation}deg)`,
                transformOrigin: 'center center',
                transition: 'transform 0.15s ease-out',
                imageRendering: 'auto',
                maxHeight: '75vh',
                maxWidth: '85vw',
                objectFit: 'contain',
              }}
              className="rounded-2xl shadow-2xl select-none"
            />
          </div>

          {/* Bottom Action Footer */}
          <div
            className="flex items-center justify-center gap-3 w-full max-w-4xl px-4 py-3 mt-2 rounded-2xl bg-black/75 border border-white/10 text-white z-10 flex-wrap"
            onClick={(e) => e.stopPropagation()}
          >
            {onUseAsset && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onUseAsset(lightboxImg, 'cloth');
                    setLightboxImg(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-[#e5373f] hover:bg-[#d42d35] text-white text-xs font-bold flex items-center gap-1.5 transition shadow cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Use in Try-On / Generate</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onUseAsset(lightboxImg, 'model');
                    setLightboxImg(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-white/20 hover:bg-white/10 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Use as Model Pose</span>
                </button>
              </>
            )}

            <button
              type="button"
              disabled={savingToMySets}
              onClick={async () => {
                setSavingToMySets(true);
                try {
                  await api.saveUserGeneration({
                    type: 'image',
                    url: lightboxImg,
                    prompt: 'Saved from Delivery',
                    resolution: '2k',
                    isManualUpload: true,
                  });
                  setSaveToSetsNotice('✓ Saved to My Sets!');
                  setTimeout(() => setSaveToSetsNotice(''), 3000);
                } catch (err: any) {
                  alert(err.message || 'Failed to save to My Sets');
                } finally {
                  setSavingToMySets(false);
                }
              }}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow cursor-pointer"
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>{savingToMySets ? 'Saving…' : saveToSetsNotice || 'Save to My Sets'}</span>
            </button>

            <button
              type="button"
              onClick={() => void downloadDirectFile(lightboxImg, 'shivnaresh-1807x3000.png')}
              className="px-4 py-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Ultra-HD (1807 × 3000)</span>
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
            <h1 className={`text-2xl font-bold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>Bespoke Custom Requests & Deliveries</h1>
            <span className="rounded-full bg-[#e5373f]/20 border border-[#e5373f]/40 px-2.5 py-0.5 text-[9px] font-bold text-[#e5373f] uppercase tracking-wider">
              24–48h Delivery Guarantee
            </span>
          </div>
          <p className={`mt-1 text-xs ${isLight ? 'text-slate-800' : 'text-white/50'}`}>
            Submit custom garments & poses to studio designers, and receive high-res photos, videos, and production folders.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              onRefresh();
              void loadDeliveries();
            }}
            className={`rounded-full border px-4 py-2 text-xs font-semibold transition cursor-pointer ${isLight ? 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50' : 'border-white/15 text-white/60 hover:text-white'
              }`}
          >
            Refresh
          </button>
          {panelTab === 'send' && (
            <button
              type="button"
              onClick={() => setFormOpen(!formOpen)}
              className="rounded-full bg-[#e5373f] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#d42d35] transition-colors cursor-pointer"
            >
              {formOpen ? 'Cancel' : '+ New Custom Request'}
            </button>
          )}
        </div>
      </div>

      {/* 2 Working Tabs: Send & Receive */}
      <div className="flex items-center gap-3 mt-6 border-b pb-4 border-white/10">
        <button
          type="button"
          onClick={() => setPanelTab('send')}
          className={`flex items-center gap-2 rounded-full px-5 py-2 text-xs font-bold uppercase tracking-wider transition cursor-pointer ${panelTab === 'send'
            ? isLight
              ? 'bg-gray-900 text-white shadow-sm'
              : 'bg-white text-gray-900 shadow-sm'
            : isLight
              ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
            }`}
        >
          <Send className="w-3.5 h-3.5" />
          <span>Send Request</span>
          <span className="text-[10px] opacity-75">({requests.length})</span>
        </button>

        <button
          type="button"
          onClick={handleSelectReceiveTab}
          className={`relative flex items-center gap-2 rounded-full px-5 py-2 text-xs font-bold uppercase tracking-wider transition cursor-pointer ${panelTab === 'receive'
            ? isLight
              ? 'bg-gray-900 text-white shadow-sm'
              : 'bg-white text-gray-900 shadow-sm'
            : isLight
              ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
            }`}
        >
          <Inbox className="w-3.5 h-3.5" />
          <span>Receive Deliveries</span>
          {unreadDeliveriesCount > 0 ? (
            <span className="rounded-full bg-[#e5373f] px-2 py-0.5 text-[10px] font-bold text-white animate-pulse">
              {unreadDeliveriesCount} New
            </span>
          ) : deliveries.length > 0 ? (
            <span className="text-[10px] opacity-75">({deliveries.length})</span>
          ) : null}
        </button>
      </div>

      {panelTab === 'send' ? (
        <>
          {/* Prominent Photoshoot Quota & Upload Allowance Info Card */}
          <div className={`mt-5 p-4 rounded-3xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${isLight ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950 shadow-sm' : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
            }`}>
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <Camera className="w-5 h-5" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                  <span>Photoshoot Quota &amp; Upload Allowance</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 font-mono text-emerald-300">
                    Unlimited Photos Allowed
                  </span>
                </p>
                <p className="text-xs mt-0.5 opacity-80">
                  You can upload any number of garment photos per request. Atelier master tailors stitch and render high-resolution 1807×3000 multi-angle photoshoot sets.
                </p>
              </div>
            </div>
            {!formOpen && (
              <button
                type="button"
                onClick={() => setFormOpen(true)}
                className="px-4 py-2 rounded-xl bg-[#e5373f] hover:bg-[#d42d35] text-white text-xs font-bold tracking-wider uppercase transition shadow cursor-pointer shrink-0"
              >
                + Create Request
              </button>
            )}
          </div>

          {/* Submission Form */}
          {formOpen && (
            <div className={`mt-6 rounded-3xl border p-7 shadow-lg backdrop-blur-md ${isLight ? 'border-gray-200 bg-white text-gray-900 shadow-sm' : 'border-white/15 bg-white/[0.03]'
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
                      className={`rounded-2xl border p-3 text-left transition-all ${requestType === t.id
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
                        <div key={idx} className={`group relative aspect-[3/4] overflow-hidden rounded-xl border ${isLight ? 'border-gray-200 bg-gray-50' : 'border-white/20 bg-black/60'
                          }`}>
                          <img src={c.preview} alt={`Garment ${idx + 1}`} className="h-full w-full object-cover" />
                          <span className="absolute top-1 left-1 rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-bold text-white">
                            Garment {idx + 1}
                          </span>
                          <div className="absolute top-1 right-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                const rot = await rotateImage(c.file, 90);
                                setPendingClothes((prev) =>
                                  prev.map((item, i) => (i === idx ? { ...item, file: rot.file, preview: rot.dataUrl } : item))
                                );
                              }}
                              className="rounded-full bg-black/80 p-1 text-white hover:bg-black transition-colors"
                              title="Rotate 90° clockwise"
                            >
                              <RotateCw className="h-2.5 w-2.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeCloth(idx)}
                              className="rounded-full bg-red-600/90 p-1 text-white hover:bg-red-700 transition-colors"
                              title="Remove garment"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => clothRef.current?.click()}
                        className={`flex aspect-[3/4] flex-col items-center justify-center rounded-xl border border-dashed p-2 text-center transition-colors ${isLight
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
                        className={`flex-1 rounded-lg border px-2.5 py-1 text-xs focus:outline-none ${isLight
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
                      <div key={idx} className={`group relative aspect-[3/4] overflow-hidden rounded-xl border ${isLight ? 'border-gray-200 bg-gray-50' : 'border-white/20 bg-black/60'
                        }`}>
                        <img src={m.preview} alt={`Pose ${idx + 1}`} className="h-full w-full object-cover" />
                        <span className="absolute top-1 left-1 rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-bold text-white">
                          Pose {idx + 1}
                        </span>
                        <div className="absolute top-1 right-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              const rot = await rotateImage(m.file, 90);
                              setPendingModels((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, file: rot.file, preview: rot.dataUrl } : item))
                              );
                            }}
                            className="rounded-full bg-black/80 p-1 text-white hover:bg-black transition-colors"
                            title="Rotate 90° clockwise"
                          >
                            <RotateCw className="h-2.5 w-2.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeModel(idx)}
                            className="rounded-full bg-red-600/90 p-1 text-white hover:bg-red-700 transition-colors"
                            title="Remove pose"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => multiModelRef.current?.click()}
                      className={`flex aspect-[3/4] flex-col items-center justify-center rounded-xl border border-dashed p-2 text-center transition-colors ${isLight
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
                  className={`mt-2 w-full rounded-2xl border p-3.5 text-xs focus:outline-none ${isLight
                    ? 'border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:border-[#e5373f]'
                    : 'border-white/10 bg-black/50 text-white placeholder:text-white/25 focus:border-white/40'
                    }`}
                />
              </div>

              {uploadProgressState && (
                <div className="mt-4 p-3 rounded-2xl bg-white/5 border border-white/10 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-emerald-400">Uploading photos simultaneously…</span>
                    <span className="font-bold text-white">
                      {Math.round((uploadProgressState.current / (uploadProgressState.total || 1)) * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-[#e5373f] h-full transition-all duration-300"
                      style={{ width: `${Math.round((uploadProgressState.current / (uploadProgressState.total || 1)) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] opacity-60">Uploaded {uploadProgressState.current} of {uploadProgressState.total} photos</p>
                </div>
              )}

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
            <div className={`mt-12 rounded-3xl border p-12 text-center ${isLight ? 'border-gray-200 bg-white text-gray-900 shadow-sm' : 'border-white/10 bg-white/[0.01]'
              }`}>
              <p className={`text-sm ${isLight ? 'text-slate-900 font-medium' : 'text-white/40'}`}>No custom studio orders yet. Click "+ New Custom Request" above.</p>
            </div>
          ) : (
            <div className="mt-8 space-y-6">
              {requests.map((req) => (
                <div
                  key={req.id}
                  className={`rounded-3xl border p-6 backdrop-blur-sm shadow-md ${isLight ? 'border-gray-200 bg-white text-gray-900 shadow-sm' : 'border-white/10 bg-white/[0.02]'
                    }`}
                >
                  {/* Status Header */}
                  <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b pb-4 ${isLight ? 'border-[#78a48b]' : 'border-white/5'
                    }`}>
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ${req.status === 'delivered'
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
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] uppercase font-semibold ${isLight ? 'bg-[#78a48b] border border-[#6b997e] text-slate-900' : 'bg-white/5 border border-white/10 text-white/70'
                          }`}>
                          {req.requestType === 'both' ? 'Stills + Video' : req.requestType === 'video' ? 'Video' : '2K Stills'}
                        </span>
                      )}
                      {req.color && (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono ${isLight ? 'bg-[#78a48b] border border-[#6b997e] text-slate-900' : 'bg-white/5 border border-white/10 text-white/70'
                          }`}>
                          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: req.color }} />
                          {req.color}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={isLight ? 'text-slate-800' : 'text-white/40'}>24–48h SLA:</span>
                      {req.status === 'delivered' ? (
                        <span className="font-semibold text-emerald-600">Delivered Successfully</span>
                      ) : (
                        <LiveCountdownTimer createdAt={req.createdAt} deadlineHours={req.deadlineHours || 48} />
                      )}
                      <button
                        type="button"
                        onClick={() => void handleDeleteRequest(req.id)}
                        className="ml-2 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[10px] font-semibold text-red-500 hover:bg-red-500 hover:text-white transition flex items-center gap-1 cursor-pointer"
                        title="Delete request (moves to recycle bin)"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>

                  {/* Sent Assets & Instructions */}
                  <div className="mt-5 grid gap-6 md:grid-cols-2">
                    <div>
                      <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${isLight ? 'text-slate-900' : 'text-white/40'}`}>What You Sent</p>
                      <div className="flex flex-wrap gap-2.5">
                        {req.clothUrl && (
                          <div
                            className={`overflow-hidden rounded-xl border w-24 cursor-pointer transition ${isLight ? 'border-gray-200 bg-gray-50 hover:border-gray-400' : 'border-white/10 bg-white/5 hover:border-white/30'
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
                              className={`overflow-hidden rounded-xl border w-20 cursor-pointer transition ${isLight ? 'border-gray-200 bg-gray-50 hover:border-gray-400' : 'border-white/10 bg-white/5 hover:border-white/30'
                                }`}
                              onClick={() => setLightboxImg(mUrl)}
                            >
                              <img src={mUrl} alt={`Pose ${mIdx + 1}`} className="aspect-[3/4] w-full object-cover" />
                              <p className={`text-[9px] text-center py-0.5 ${isLight ? 'text-slate-800' : 'text-white/40'}`}>Pose {mIdx + 1}</p>
                            </div>
                          ))
                        ) : req.modelUrl ? (
                          <div
                            className={`overflow-hidden rounded-xl border w-24 cursor-pointer transition ${isLight ? 'border-gray-200 bg-gray-50 hover:border-gray-400' : 'border-white/10 bg-white/5 hover:border-white/30'
                              }`}
                            onClick={() => setLightboxImg(req.modelUrl || null)}
                          >
                            <img src={req.modelUrl} alt="Model" className="aspect-[3/4] w-full object-cover" />
                            <p className={`text-[9px] text-center py-0.5 truncate ${isLight ? 'text-slate-800' : 'text-white/40'}`}>{req.modelName || 'Model'}</p>
                          </div>
                        ) : null}
                      </div>
                      {req.prompt && (
                        <div className={`mt-3 rounded-2xl border p-3 text-xs italic ${isLight ? 'border-gray-200 bg-gray-50 text-gray-900' : 'border-white/5 bg-black/40 text-white/70'
                          }`}>
                          "{req.prompt}"
                        </div>
                      )}
                    </div>

                    {/* Admin Delivery & Reply */}
                    <div className={`rounded-2xl border p-5 ${isLight ? 'border-gray-200 bg-gray-50 text-gray-900' : 'border-white/10 bg-black/40'
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
                            <p className={`text-xs leading-relaxed rounded-xl p-2.5 ${isLight ? 'bg-white/60 text-slate-900' : 'bg-white/5 text-white/80'
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
                              className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${isLight ? 'border-[#78a48b] bg-[#78a48b] text-slate-900 hover:bg-[#6b997e]' : 'border-white/20 text-white hover:bg-white/10'
                                }`}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              <span>Open in new tab</span>
                            </button>
                          </div>
                        </div>
                      ) : req.adminReply ? (
                        <div className="space-y-2">
                          <p className={`text-xs leading-relaxed rounded-xl border p-3 ${isLight ? 'bg-blue-100 border-blue-300 text-blue-950' : 'bg-blue-950/40 border-blue-900/40 text-blue-200'
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
        </>
      ) : (
        /* ============= RECEIVE DELIVERIES VIEW ============= */
        <div className="mt-6 space-y-6">
          {/* 24-Hour Review Window Notice & Disclaimer */}
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-start gap-3 text-xs shadow-sm">
            <ShieldCheck className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-amber-500 text-xs">
                Client Verification &amp; Responsibility Notice (24-Hour Review Window)
              </p>
              <p className="text-[11px] opacity-80 leading-relaxed">
                All files, photos, videos, and zip files sent by Admin must be checked and approved by the user before use or printing. Shiv-Naresh is not responsible for any printing, fabric, or business loss if the user uses the files without checking. Any correction must be reported within 24 hours of delivery.
              </p>
            </div>
          </div>

          {/* Batch Selection Action Bar */}
          {selectedMediaUrls.length > 0 && (
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 flex items-center justify-between gap-3 text-xs shadow-md animate-in fade-in">
              <div className="flex items-center gap-2">
                <span className="font-bold text-emerald-400">
                  {selectedMediaUrls.length} {selectedMediaUrls.length === 1 ? 'file' : 'files'} selected
                </span>
                <span className="opacity-50">&middot;</span>
                <span className="text-[11px] opacity-75">Click below to bundle into a single ZIP</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={batchDownloading}
                  onClick={async () => {
                    setBatchDownloading(true);
                    try {
                      const JSZip = (await import('jszip')).default;
                      const zip = new JSZip();
                      for (let i = 0; i < selectedMediaUrls.length; i++) {
                        const it = selectedMediaUrls[i];
                        try {
                          const resp = await fetch(it.url);
                          if (resp.ok) {
                            const blob = await resp.blob();
                            zip.file(it.name || `received-photo-${i + 1}.png`, blob);
                          }
                        } catch { }
                      }
                      const zipBlob = await zip.generateAsync({ type: 'blob' });
                      const blobUrl = URL.createObjectURL(zipBlob);
                      const link = document.createElement('a');
                      link.href = blobUrl;
                      link.download = `shivnaresh-deliveries-${Date.now()}.zip`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                    } catch (err) {
                      console.error('Batch ZIP creation failed:', err);
                    } finally {
                      setBatchDownloading(false);
                    }
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 transition shadow cursor-pointer text-xs"
                >
                  <FileArchive className="w-3.5 h-3.5" />
                  <span>{batchDownloading ? 'Bundling ZIP…' : 'Download All as ZIP'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMediaUrls([])}
                  className="px-3 py-1.5 rounded-xl border border-white/20 hover:bg-white/10 text-white text-xs transition cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className={`text-base font-bold ${isLight ? 'text-gray-900' : 'text-white'}`}>
                Studio Deliveries & Dispatched Assets
              </h2>
              <p className={`text-xs ${isLight ? 'text-gray-600' : 'text-slate-400'}`}>
                Photos, high-definition videos, folders, ZIP archives, and custom assets sent directly to you by the studio director.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadDeliveries()}
              className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition cursor-pointer ${isLight ? 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50' : 'border-white/15 text-white/60 hover:text-white'
                }`}
            >
              Refresh Deliveries
            </button>
          </div>

          {deliveriesLoading && deliveries.length === 0 ? (
            <div className={`py-20 text-center text-sm ${isLight ? 'text-slate-800' : 'text-white/40'}`}>
              <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent mb-2" />
              Loading your deliveries...
            </div>
          ) : deliveries.length === 0 ? (
            <div className={`mt-8 rounded-3xl border p-12 text-center ${isLight ? 'border-gray-200 bg-white text-gray-900 shadow-sm' : 'border-white/10 bg-white/[0.01]'
              }`}>
              <Inbox className="w-12 h-12 mx-auto mb-3 opacity-30 text-amber-500" />
              <h3 className={`text-base font-bold ${isLight ? 'text-gray-900' : 'text-white'}`}>No Deliveries Received Yet</h3>
              <p className={`text-xs mt-1 max-w-md mx-auto ${isLight ? 'text-gray-500' : 'text-slate-400'}`}>
                When the studio administrator dispatches custom photos, videos, ZIP archives, or messages to your account, they will appear here with instant download links.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {deliveries.map((delivery) => {
                const isPhoto = delivery.type === 'photo';
                const isVideo = delivery.type === 'video';
                const isZip = delivery.type === 'zip';
                const isFolder = delivery.type === 'folder';
                const isText = delivery.type === 'text';

                return (
                  <div
                    key={delivery.id}
                    className={`rounded-3xl border p-6 backdrop-blur-sm shadow-md transition-all ${isLight ? 'border-gray-200 bg-white text-gray-900 shadow-sm' : 'border-white/10 bg-white/[0.02]'
                      }`}
                  >
                    {/* Header */}
                    <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b pb-4 ${isLight ? 'border-gray-200' : 'border-white/10'
                      }`}>
                      <div className="flex items-center gap-3">
                        <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${isPhoto
                          ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                          : isVideo
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            : isZip
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : isFolder
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                          }`}>
                          {isPhoto && <Camera className="w-4 h-4" />}
                          {isVideo && <Film className="w-4 h-4" />}
                          {isZip && <FileArchive className="w-4 h-4" />}
                          {isFolder && <Folder className="w-4 h-4" />}
                          {isText && <MessageSquare className="w-4 h-4" />}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className={`text-sm font-bold ${isLight ? 'text-gray-900' : 'text-white'}`}>
                              {delivery.title}
                            </h3>
                            {!delivery.readByUser && (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#e5373f] text-white">
                                New
                              </span>
                            )}
                          </div>
                          <p className={`text-[10px] ${isLight ? 'text-gray-500' : 'opacity-60'}`}>
                            Sent by Shiv-Naresh Tailoring Studio &middot;{' '}
                            {new Date(delivery.createdAt).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {delivery.assets && delivery.assets.length > 0 ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300">
                            📦 {delivery.assets.length} Production Assets
                          </span>
                        ) : isPhoto ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300">
                            📷 {delivery.mediaUrls?.length || (delivery.fileUrl ? 1 : 0)} Photos
                          </span>
                        ) : null}
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${isPhoto
                          ? 'bg-purple-500/20 text-purple-300'
                          : isVideo
                            ? 'bg-blue-500/20 text-blue-300'
                            : isZip
                              ? 'bg-amber-500/20 text-amber-300'
                              : isFolder
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-slate-500/20 text-slate-300'
                          }`}>
                          {delivery.type}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleDeliveryExpand(delivery.id)}
                          className={`px-3 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border ${expandedDeliveryIds.has(delivery.id)
                            ? 'bg-[#e5373f] text-white border-[#e5373f] shadow-sm'
                            : isLight ? 'bg-gray-100 hover:bg-gray-200 text-gray-800 border-gray-300' : 'bg-white/10 hover:bg-white/20 text-white border-white/15'
                            }`}
                        >
                          <span>{expandedDeliveryIds.has(delivery.id) ? 'Collapse' : 'Inspect Assets'}</span>
                          {expandedDeliveryIds.has(delivery.id) ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteDelivery(delivery.id)}
                          className="p-1 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition cursor-pointer"
                          title="Delete delivery (moves to recycle bin)"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Collapsed State: Neat Compact Strip */}
                    {!expandedDeliveryIds.has(delivery.id) ? (
                      <div className="mt-3 pt-3 flex items-center justify-between gap-3 flex-wrap">
                        {delivery.assets && delivery.assets.length > 0 ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            {delivery.assets.filter(a => a.type === 'photo' || a.mimeType?.startsWith('image/')).slice(0, 4).map((ast, aIdx) => (
                              <img
                                key={aIdx}
                                src={ast.url}
                                alt={ast.name}
                                className="w-12 h-12 rounded-xl object-cover border border-white/10 bg-black cursor-pointer hover:opacity-80 transition"
                                onClick={() => {
                                  toggleDeliveryExpand(delivery.id);
                                  setLightboxImg(ast.url);
                                }}
                              />
                            ))}
                            <div className="flex items-center gap-1.5 text-xs">
                              {delivery.assets.some(a => a.type === 'video') && (
                                <span className="px-2 py-0.5 rounded-lg bg-blue-500/20 text-blue-300 text-[10px] font-semibold">
                                  🎬 {delivery.assets.filter(a => a.type === 'video').length} Video(s)
                                </span>
                              )}
                              {delivery.assets.some(a => a.type === 'zip') && (
                                <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 text-[10px] font-semibold">
                                  📦 {delivery.assets.filter(a => a.type === 'zip').length} ZIP(s)
                                </span>
                              )}
                              {delivery.assets.some(a => a.type === 'folder') && (
                                <span className="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold">
                                  📁 {delivery.assets.filter(a => a.type === 'folder').length} Folder(s)
                                </span>
                              )}
                            </div>
                          </div>
                        ) : isPhoto && delivery.mediaUrls && delivery.mediaUrls.filter((u) => !brokenImageUrls.has(u)).length > 0 ? (
                          <div className="flex items-center gap-2">
                            {delivery.mediaUrls.filter((u) => !brokenImageUrls.has(u)).slice(0, 4).map((url, uIdx) => (
                              <img
                                key={uIdx}
                                src={url}
                                alt="Thumb"
                                onError={(e) => {
                                  markGlobalBrokenUrl(url);
                                  (e.currentTarget as HTMLElement).style.display = 'none';
                                }}
                                className="w-12 h-12 rounded-xl object-cover border border-white/10 bg-black cursor-pointer hover:opacity-80 transition"
                                onClick={() => {
                                  toggleDeliveryExpand(delivery.id);
                                  setLightboxImg(url);
                                }}
                              />
                            ))}
                            {delivery.mediaUrls.filter((u) => !brokenImageUrls.has(u)).length > 4 && (
                              <span className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-bold text-white/70">
                                +{delivery.mediaUrls.filter((u) => !brokenImageUrls.has(u)).length - 4}
                              </span>
                            )}
                          </div>
                        ) : delivery.fileUrl && isPhoto && !brokenImageUrls.has(delivery.fileUrl) ? (
                          <img
                            src={delivery.fileUrl}
                            alt="Thumb"
                            onError={(e) => {
                              markGlobalBrokenUrl(delivery.fileUrl || '');
                              (e.currentTarget as HTMLElement).style.display = 'none';
                            }}
                            className="w-12 h-12 rounded-xl object-cover border border-white/10 bg-black cursor-pointer hover:opacity-80 transition"
                            onClick={() => {
                              toggleDeliveryExpand(delivery.id);
                              setLightboxImg(delivery.fileUrl || null);
                            }}
                          />
                        ) : (
                          <p className="text-xs opacity-60 italic">
                            {isZip ? '📦 ZIP archive package ready for download' : isVideo ? '🎬 Video render file ready' : 'Assets received from studio atelier'}
                          </p>
                        )}

                        <button
                          type="button"
                          onClick={() => toggleDeliveryExpand(delivery.id)}
                          className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ml-auto"
                        >
                          <span>Open &amp; Inspect Assets</span>
                          <ChevronDown className="w-3.5 h-3.5 text-[#e5373f]" />
                        </button>
                      </div>
                    ) : (
                      /* Media / File Content */
                      <div className="mt-4 space-y-4">
                        {/* If multi-asset delivery, show download all button */}
                        {delivery.assets && delivery.assets.length > 1 && (
                          <div className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10">
                            <span className="text-xs font-semibold">
                              Attached Collection ({delivery.assets.length} items)
                            </span>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const JSZip = (await import('jszip')).default;
                                  const zip = new JSZip();
                                  for (let i = 0; i < (delivery.assets?.length || 0); i++) {
                                    const ast = delivery.assets![i];
                                    try {
                                      const resp = await fetch(ast.url);
                                      if (resp.ok) {
                                        const blob = await resp.blob();
                                        zip.file(ast.name || `asset-${i + 1}`, blob);
                                      }
                                    } catch { }
                                  }
                                  const zipBlob = await zip.generateAsync({ type: 'blob' });
                                  const blobUrl = URL.createObjectURL(zipBlob);
                                  const link = document.createElement('a');
                                  link.href = blobUrl;
                                  link.download = `${delivery.title.replace(/[^a-zA-Z0-9_-]/g, '_')}-package.zip`;
                                  document.body.appendChild(link);
                                  link.click();
                                  document.body.removeChild(link);
                                  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                                } catch (err) {
                                  console.error('ZIP download failed:', err);
                                }
                              }}
                              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow cursor-pointer transition"
                            >
                              <FileArchive className="w-3.5 h-3.5" />
                              <span>Download All {delivery.assets.length} Assets as ZIP</span>
                            </button>
                          </div>
                        )}

                        {/* 1. Photos Section */}
                        {(() => {
                          const photos = delivery.assets && delivery.assets.length > 0
                            ? delivery.assets.filter(a => a.type === 'photo' || a.mimeType?.startsWith('image/')).map(a => a.url)
                            : (isPhoto ? (delivery.mediaUrls?.length ? delivery.mediaUrls : (delivery.fileUrl ? [delivery.fileUrl] : [])) : []);
                          const validPhotos = photos.filter((u) => !brokenImageUrls.has(u));
                          if (validPhotos.length === 0) return null;

                          return (
                            <div className="space-y-2">
                              <p className="text-[11px] font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1">
                                <Camera className="w-3.5 h-3.5" />
                                <span>Photos ({validPhotos.length})</span>
                              </p>
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                {validPhotos.map((url, uIdx) => {
                                  const selected = selectedMediaUrls.some((a) => a.url === url);
                                  return (
                                    <div
                                      key={uIdx}
                                      className={`relative group aspect-square rounded-2xl overflow-hidden border transition cursor-pointer ${selected ? 'border-emerald-500 ring-2 ring-emerald-500/50' : 'border-white/10 hover:border-white/30'
                                        } bg-black`}
                                      onClick={() => setLightboxImg(url)}
                                    >
                                      <img
                                        src={url}
                                        alt={`Photo ${uIdx + 1}`}
                                        onError={(e) => {
                                          markGlobalBrokenUrl(url);
                                          (e.currentTarget.closest('.group') as HTMLElement)?.style.setProperty('display', 'none');
                                        }}
                                        className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                                      />
                                      {/* Selection Checkbox */}
                                      <div
                                        className="absolute top-2 left-2 z-10"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedMediaUrls((prev) =>
                                            prev.some((a) => a.url === url)
                                              ? prev.filter((a) => a.url !== url)
                                              : [...prev, { url, name: `photo-${delivery.id}-${uIdx + 1}.png` }]
                                          );
                                        }}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={selected}
                                          onChange={() => { }}
                                          className="w-4 h-4 rounded border-gray-400 text-emerald-600 focus:ring-0 cursor-pointer"
                                        />
                                      </div>
                                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition flex items-center justify-center">
                                        <span className="text-white text-xs opacity-0 group-hover:opacity-100 font-semibold flex items-center gap-1 bg-black/60 px-2 py-1 rounded-lg">
                                          <ZoomIn className="w-3.5 h-3.5" /> Inspect
                                        </span>
                                      </div>
                                      <div className="absolute bottom-1.5 inset-x-1.5 opacity-0 group-hover:opacity-100 flex items-center justify-between gap-1 transition">
                                        {onUseAsset && (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              onUseAsset(url, 'cloth');
                                            }}
                                            className="px-2 py-1 rounded-lg bg-[#e5373f] hover:bg-[#d42d35] text-white text-[10px] font-bold shadow cursor-pointer"
                                            title="Use in Try-On Studio"
                                          >
                                            Use in Studio
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); void downloadDirectFile(url, `photo-${uIdx + 1}.jpg`); }}
                                          className="p-1 rounded-lg bg-black/70 hover:bg-black text-white transition ml-auto"
                                          title="Download"
                                        >
                                          <Download className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}

                        {/* 2. Videos Section */}
                        {(() => {
                          const videos = delivery.assets && delivery.assets.length > 0
                            ? delivery.assets.filter(a => a.type === 'video' || a.mimeType?.startsWith('video/') || /\.(mp4|mov|webm|mkv)$/i.test(a.name))
                            : (isVideo && delivery.fileUrl ? [{ url: delivery.fileUrl, name: delivery.fileName || 'video.mp4', size: delivery.fileSize || 0 }] : []);
                          if (videos.length === 0) return null;

                          return (
                            <div className="space-y-3">
                              <p className="text-[11px] font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1">
                                <Film className="w-3.5 h-3.5" />
                                <span>Videos ({videos.length})</span>
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {videos.map((vid, vIdx) => (
                                  <div key={vIdx} className="space-y-2 rounded-2xl border border-white/10 p-3 bg-black/40">
                                    <video
                                      src={vid.url}
                                      controls
                                      className="w-full rounded-xl border border-white/10 bg-black max-h-72"
                                    />
                                    <div className="flex items-center justify-between text-xs pt-1">
                                      <span className="font-semibold truncate max-w-[200px]">{vid.name}</span>
                                      <button
                                        type="button"
                                        onClick={() => void downloadDirectFile(vid.url, vid.name || `video-${vIdx + 1}.mp4`)}
                                        className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                                      >
                                        <Download className="w-3.5 h-3.5" />
                                        <span>Download Video</span>
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}

                        {/* 3. ZIP Archives Section */}
                        {(() => {
                          const zips = delivery.assets && delivery.assets.length > 0
                            ? delivery.assets.filter(a => a.type === 'zip' || a.mimeType?.includes('zip') || /\.(zip|rar|tar\.gz|7z)$/i.test(a.name))
                            : (isZip && delivery.fileUrl ? [{ url: delivery.fileUrl, name: delivery.fileName || 'Studio-Package.zip', size: delivery.fileSize || 0 }] : []);
                          if (zips.length === 0) return null;

                          return (
                            <div className="space-y-2">
                              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                                <FileArchive className="w-3.5 h-3.5" />
                                <span>ZIP Archives ({zips.length})</span>
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {zips.map((zip, zIdx) => (
                                  <div
                                    key={zIdx}
                                    className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${isLight ? 'bg-amber-50/60 border-amber-200' : 'bg-amber-500/10 border-amber-500/25'
                                      }`}
                                  >
                                    <div className="flex items-center gap-3 truncate">
                                      <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
                                        <FileArchive className="w-5 h-5" />
                                      </div>
                                      <div className="truncate">
                                        <p className="text-xs font-bold text-amber-500 truncate">{zip.name}</p>
                                        {zip.size ? (
                                          <p className="text-[10px] opacity-60">
                                            Size: {(zip.size / (1024 * 1024)).toFixed(2)} MB
                                          </p>
                                        ) : null}
                                      </div>
                                    </div>
                                    <a
                                      href={zip.url}
                                      download={zip.name}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition shadow cursor-pointer shrink-0"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                      <span>Download ZIP</span>
                                    </a>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}

                        {/* 4. Folders / Other Assets Section */}
                        {(() => {
                          const folders = delivery.assets && delivery.assets.length > 0
                            ? delivery.assets.filter(a => a.type === 'folder' || (!['photo', 'video', 'zip'].includes(a.type) && !/\.(png|jpe?g|webp|mp4|mov|zip|rar)$/i.test(a.name)))
                            : (isFolder ? [{ url: delivery.fileUrl || '', name: delivery.fileName || 'Folder-Assets.zip' }] : []);
                          if (folders.length === 0) return null;

                          return (
                            <div className="space-y-2">
                              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                                <Folder className="w-3.5 h-3.5" />
                                <span>Folder Assets ({folders.length})</span>
                              </p>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {folders.map((f, fIdx) => (
                                  <a
                                    key={fIdx}
                                    href={f.url}
                                    download={f.name}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="p-2.5 rounded-xl border border-white/10 bg-black/40 hover:bg-black/60 flex items-center justify-between text-xs truncate text-slate-300 transition"
                                  >
                                    <span className="truncate">{f.name}</span>
                                    <Download className="w-3.5 h-3.5 shrink-0 opacity-60 ml-1" />
                                  </a>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
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
  const [videoImages, setVideoImages] = useState<string[]>([]);
  const [primaryImgIdx, setPrimaryImgIdx] = useState<number>(0);
  const [uploadingFiles, setUploadingFiles] = useState<boolean>(false);
  const videoImg = videoImages[primaryImgIdx] || videoImages[0] || null;
  const isSubmittingRef = useRef<boolean>(false);
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

  /* Video credit consumption: strictly fixed 5s = 6 credits; 10s = 12 credits regardless of image count */
  const videoCreditCost = duration === 10 ? 12 : 6;
  const userCredits = user ? user.credits : 10;
  const hasEnoughCredits = userCredits >= videoCreditCost;
  const isLocked = Boolean(user?.creditsLocked);

  /* User video quota */
  const maxVideos = typeof user?.maxVideos === 'number' ? user.maxVideos : 15;
  const videosGenerated = typeof user?.videosGenerated === 'number' ? user.videosGenerated : 0;
  const isLimitReached = maxVideos > 0 && videosGenerated >= maxVideos;

  const isBusy = busy || isGlobalBusy;

  async function handleMultipleVideoFiles(files: FileList | File[] | null | undefined) {
    if (!files) return;
    const fileArr = Array.isArray(files) ? files : Array.from(files);
    if (fileArr.length === 0) return;

    setUploadingFiles(true);
    setError('');
    try {
      const newUrls: string[] = [];
      for (const f of fileArr) {
        try {
          const std = await prepareAndStandardizeImage(f, 'model');
          if (std.dataUrl) {
            newUrls.push(std.dataUrl);
          }
        } catch (imgErr) {
          console.warn('Could not compress video frame:', imgErr);
        }
      }
      if (newUrls.length > 0) {
        setVideoImages((prev) => [...prev, ...newUrls].slice(0, 20));
      }
    } catch {
      setError('Could not process some uploaded images.');
    } finally {
      setUploadingFiles(false);
      if (fileRef.current) {
        fileRef.current.value = '';
      }
    }
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
          }).catch(() => { });
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
      setError('Please upload at least one garment or model image first.');
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
    if (isBusy || isSubmittingRef.current) {
      setError('Another generation is currently in progress. At one time only one generation is allowed.');
      return;
    }
    setError('');
    setShowConfirmModal(true);
  }

  async function runActualVideoGeneration() {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
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

    const primarySrc = (isEditingVideo && videoEditRefImage) ? videoEditRefImage : (videoImg || undefined);
    const allImages = (isEditingVideo && videoEditRefImage) ? [videoEditRefImage] : (videoImages.length > 0 ? videoImages : (primarySrc ? [primarySrc] : undefined));

    try {
      const res = await api.generateVideo({
        image: primarySrc,
        images: allImages,
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
    } finally {
      isSubmittingRef.current = false;
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
                {videoImages.length > 1 && (
                  <div className="flex justify-between text-white/60">
                    <span>Uploaded Angles:</span>
                    <span className="font-bold text-emerald-400">{videoImages.length} Images (Included at no extra charge)</span>
                  </div>
                )}
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
      <div className={`relative overflow-hidden rounded-3xl border p-8 ${isLight
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
      <div className={`mt-6 rounded-2xl border p-5 transition-all ${isLimitReached
        ? isLight ? 'border-red-300 bg-red-50 text-red-950' : 'border-rose-500/40 bg-rose-950/20 text-rose-200'
        : isLight ? 'border-gray-200 bg-white shadow-sm' : 'border-white/10 bg-white/[0.02]'
        }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Film className="h-4 w-4 text-current/70" />
              <h3 className="text-sm font-semibold">Monthly Video Quota</h3>
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ${isLimitReached
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
          {/* Step 1: Base Images (Upload Any Number) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={`text-xs font-semibold uppercase tracking-wider ${isLight ? 'text-gray-500' : 'text-white/50'}`}>
                1 &middot; Source Garment / Model Images (Upload Any Number)
              </label>
              {videoImages.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setVideoImages([]);
                    setPrimaryImgIdx(0);
                  }}
                  className="text-[10px] font-semibold text-rose-500 hover:underline cursor-pointer"
                >
                  Clear all ({videoImages.length})
                </button>
              )}
            </div>

            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
              onChange={(e) => void handleMultipleVideoFiles(e.target.files)}
            />

            {/* Drop / Click Upload Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer.files) {
                  void handleMultipleVideoFiles(e.dataTransfer.files);
                }
              }}
              onClick={() => fileRef.current?.click()}
              className={`mt-1.5 rounded-2xl border-2 border-dashed p-4 text-center transition-all cursor-pointer ${isLight
                ? 'border-gray-300 bg-gray-50/70 hover:border-gray-400 hover:bg-gray-100/60'
                : 'border-white/20 bg-black/40 hover:border-white/40 hover:bg-black/60'
                }`}
            >
              {uploadingFiles ? (
                <div className="flex flex-col items-center justify-center py-6">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#e5373f] border-t-transparent mb-2" />
                  <p className={`text-xs font-semibold ${isLight ? 'text-gray-900' : 'text-white'}`}>
                    Optimizing & standardizing images…
                  </p>
                  <p className={`text-[10px] ${isLight ? 'text-gray-500' : 'text-white/40'}`}>
                    Compressing for ultra-fast GPU upload
                  </p>
                </div>
              ) : videoImages.length === 0 ? (
                <div className="py-4">
                  <Film className="h-8 w-8 mx-auto mb-2 opacity-40 text-[#e5373f]" />
                  <span className={`block text-xs font-bold ${isLight ? 'text-gray-900' : 'text-white'}`}>
                    Click or drop any number of images here
                  </span>
                  <span className={`block text-[10px] mt-1 ${isLight ? 'text-gray-500' : 'text-white/40'}`}>
                    Upload single garment/pose, or multiple angles (front, back, close-up details) at once
                  </span>
                  <span className="inline-block mt-2 text-[10px] font-semibold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
                    Fixed {videoCreditCost} credits — Upload unlimited images with zero extra charge
                  </span>
                </div>
              ) : (
                <div>
                  {/* Large Primary Preview */}
                  <div className="relative mx-auto max-w-xs overflow-hidden rounded-xl border border-white/20 bg-black/40">
                    <img
                      src={videoImg || videoImages[0]}
                      alt="Primary Base Frame"
                      className="h-44 w-full object-contain"
                    />
                    <span className="absolute top-2 left-2 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-bold text-white shadow flex items-center gap-1">
                      <Check className="w-3 h-3" /> Start Frame (Pose #{primaryImgIdx + 1})
                    </span>
                  </div>
                  <p className={`mt-2 text-[11px] font-medium ${isLight ? 'text-gray-600' : 'text-white/60'}`}>
                    {videoImages.length} image{videoImages.length > 1 ? 's' : ''} loaded. Click "+ Add More" or select another as Start Frame below.
                  </p>
                </div>
              )}
            </div>

            {/* Thumbnail Gallery Strip */}
            {videoImages.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className={`font-semibold ${isLight ? 'text-gray-700' : 'text-white/70'}`}>
                    Uploaded Angles ({videoImages.length}):
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileRef.current?.click();
                    }}
                    className="text-xs font-semibold text-[#e5373f] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={13} />
                    <span>Add More Images</span>
                  </button>
                </div>

                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-44 overflow-y-auto p-1.5 rounded-xl border border-white/10 bg-black/20">
                  {videoImages.map((imgUrl, idx) => {
                    const isPrimary = idx === primaryImgIdx;
                    return (
                      <div
                        key={idx}
                        onClick={() => setPrimaryImgIdx(idx)}
                        className={`group relative rounded-lg border overflow-hidden transition-all cursor-pointer flex flex-col ${isPrimary
                          ? 'border-emerald-500 ring-2 ring-emerald-500/50 shadow-md scale-[1.02]'
                          : isLight
                            ? 'border-gray-200 bg-white hover:border-gray-400'
                            : 'border-white/10 bg-white/5 hover:border-white/30'
                          }`}
                        title={isPrimary ? 'Current Start Frame' : 'Click to set as Start Frame'}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const next = videoImages.filter((_, i) => i !== idx);
                            setVideoImages(next);
                            if (primaryImgIdx >= next.length) {
                              setPrimaryImgIdx(Math.max(0, next.length - 1));
                            }
                          }}
                          className="absolute top-1 right-1 z-10 h-4 w-4 rounded-full bg-red-600/90 text-white flex items-center justify-center text-[9px] font-bold opacity-0 group-hover:opacity-100 transition cursor-pointer"
                          title="Remove image"
                        >
                          ✕
                        </button>
                        <img
                          src={imgUrl}
                          alt={`Angle ${idx + 1}`}
                          className="aspect-[3/4] w-full object-cover"
                        />
                        <div className={`p-1 text-center text-[9px] font-semibold truncate ${isPrimary ? 'bg-emerald-600 text-white font-bold' : (isLight ? 'bg-gray-100 text-gray-700' : 'bg-black/60 text-white/70')
                          }`}>
                          {isPrimary ? '★ Start Frame' : `#${idx + 1}`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Step 2: Instructions & Smart Motion Presets */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={`text-xs font-semibold uppercase tracking-wider ${isLight ? 'text-gray-500' : 'text-white/50'}`}>
                2 &middot; Runway Motion Instructions (Prompt)
              </label>
              <span className={`text-[10px] ${isLight ? 'text-gray-400' : 'text-white/30'}`}>
                Shiv-Naresh branding auto-preserved
              </span>
            </div>
            <textarea
              value={videoPrompt}
              onChange={(e) => setVideoPrompt(e.target.value)}
              rows={3}
              placeholder="e.g. Model walks briskly down an athletic runway, cinematic tracking shot, dynamic camera orbit, highlighting jersey fabric and logo"
              className={`w-full rounded-2xl border p-3 text-xs focus:outline-none transition-colors ${isLight
                ? 'border-gray-300 bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-gray-400'
                : 'border-white/10 bg-black/50 text-white placeholder:text-white/25 focus:border-white/40'
                }`}
            />

            {/* Smart Motion Preset Pills */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                { label: '🏃 Dynamic Track Sprint', text: 'Athlete in full dynamic sprint, powerful strides down track, dynamic low tracking camera' },
                { label: '🚶 Fashion Runway Walk', text: 'Model walks briskly down fashion runway, graceful turn at edge, crisp fabric drape' },
                { label: '🔄 360° Studio Orbit', text: 'Smooth 360-degree camera orbit revealing front, back, and athletic details seamlessly' },
                { label: '🔍 Logo & Insignia Zoom', text: 'Smooth steady camera glide zooming in on the chest Shiv-Naresh insignia and technical activewear stitching' },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setVideoPrompt(preset.text)}
                  className={`text-[10px] font-medium rounded-lg px-2 py-1 transition cursor-pointer border ${isLight
                    ? 'border-gray-200 bg-gray-100 text-gray-700 hover:bg-gray-200'
                    : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
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
                    className={`rounded-2xl border p-3 text-left transition-all ${active
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
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${active ? 'bg-[#e5373f] text-white' : (isLight ? 'bg-gray-200 text-gray-700' : 'bg-white/10 text-white/60')
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
                className={`rounded-xl py-2.5 px-3 text-xs font-semibold transition-all text-center ${duration === 5
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
                className={`rounded-xl py-2.5 px-3 text-xs font-semibold transition-all text-center ${duration === 10
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
          <div className={`rounded-xl border p-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs ${isLight ? 'border-gray-200 bg-gray-50 text-gray-700' : 'border-white/10 bg-black/40 text-white/70'
            }`}>
            <div>
              <span>Account balance: <strong className={isLight ? 'text-amber-950 font-semibold' : 'text-amber-500'}>{userCredits} credits</strong></span>
              <span className="block text-[10px] text-emerald-500 font-medium mt-0.5">
                ✓ Fixed price: {videoCreditCost} credits only. Zero extra charge for multiple angles.
              </span>
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
            className={`w-full rounded-full py-3 text-xs font-semibold uppercase tracking-wider transition-all shadow-sm ${isBusy
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
                    : `Generate ${duration}s fashion video (${videoCreditCost} credits fixed)`}
          </button>

          {error && (
            <p className={`rounded-xl border p-3 text-center text-xs ${isLight ? 'border-red-300 bg-red-50 text-red-700' : 'border-red-500/30 bg-red-500/10 text-red-400'
              }`}>
              {error}
            </p>
          )}
        </div>

        {/* Video Preview Canvas */}
        <div className={`flex flex-col items-center justify-center rounded-3xl border p-8 text-center ${isLight ? 'border-gray-200 bg-white shadow-sm' : 'border-white/10 bg-black/50'
          }`}>
          {videoResult ? (
            <div className="space-y-4 w-full max-w-sm">
              <video
                src={videoResult}
                controls
                autoPlay
                loop
                playsInline
                className={`w-full rounded-2xl object-cover shadow-2xl border border-white/20 mx-auto ${aspectRatio === '16:9' ? 'aspect-[16/9]' : aspectRatio === '1:1' ? 'aspect-square' : aspectRatio === '4:5' ? 'aspect-[4/5]' : 'aspect-[9/16]'
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
                  className={`inline-flex items-center justify-center gap-2 rounded-full border px-6 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all shadow-sm ${isVideoEditOpen
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
                <div className={`mt-4 rounded-2xl border p-4 text-left space-y-3 transition-all ${isLight ? 'border-gray-200 bg-gray-50 text-gray-900' : 'border-white/10 bg-black/60 text-white'
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
                      className={`w-full rounded-xl border p-2.5 text-xs focus:outline-none transition-colors ${isLight
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
                        className={`w-full rounded-xl border border-dashed p-2 text-center text-xs transition ${isLight ? 'border-gray-300 bg-white hover:border-gray-400 text-gray-700' : 'border-white/20 bg-black/20 hover:border-white/40 text-white/70'
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
            <div className={`relative w-64 overflow-hidden rounded-2xl border border-white/15 bg-black/80 flex items-center justify-center shadow-2xl ${aspectRatio === '16:9' ? 'aspect-[16/9]' : aspectRatio === '1:1' ? 'aspect-square' : aspectRatio === '4:5' ? 'aspect-[4/5]' : 'aspect-[9/16]'
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
   Split Compare Studio (Synchronized Dual 1807×3000 Viewer & Curtain Slider)
   ================================================================ */
function CompareStudio({
  cloth,
  selectedClothes,
  classifiedGarments,
  previousGarments = [],
  userGenerations,
  fivePoseItems,
  isLight,
  onClose,
  onSetCloth,
}: {
  cloth: Pick;
  selectedClothes: Array<{ url: string; preview?: string; name: string }>;
  classifiedGarments: ClassifiedGarment[];
  previousGarments?: Array<{ url: string; name: string }>;
  userGenerations: UserGeneration[];
  fivePoseItems: PoseItem[];
  isLight: boolean;
  onClose: () => void;
  onSetCloth?: (c: Pick) => void;
}) {
  const refCandidates: Array<{ url: string; name: string; label: string }> = [];
  if (cloth?.url) {
    refCandidates.push({ url: cloth.preview || cloth.url, name: cloth.name || 'Active Garment', label: 'Active Reference' });
  }
  selectedClothes.forEach((c, idx) => {
    const u = c.preview || c.url;
    if (u && !refCandidates.some((r) => r.url === u)) {
      refCandidates.push({ url: u, name: c.name || `Garment ${idx + 1}`, label: `Garment ${idx + 1}` });
    }
  });
  classifiedGarments.forEach((g) => {
    const u = g.preview || g.url;
    if (u && !refCandidates.some((r) => r.url === u)) {
      refCandidates.push({ url: u, name: g.name || g.role, label: `${g.role}` });
    }
  });
  if (Array.isArray(previousGarments)) {
    previousGarments.forEach((pg, idx) => {
      if (pg.url && !refCandidates.some((r) => r.url === pg.url)) {
        refCandidates.push({
          url: pg.url,
          name: pg.name || `Garment Library #${idx + 1}`,
          label: pg.name ? pg.name.slice(0, 20) : `Library #${idx + 1}`,
        });
      }
    });
  }

  const renderCandidates: Array<{ url: string; name: string; label: string }> = [];
  fivePoseItems.filter((p) => p.status === 'completed' && p.url).forEach((p, idx) => {
    renderCandidates.push({ url: p.url!, name: p.id || `Studio Render ${idx + 1}`, label: `Pose #${idx + 1}` });
  });
  userGenerations.forEach((g, idx) => {
    const targetUrl = g.outputUrl || g.url || g.highResUrl;
    if (targetUrl && !renderCandidates.some((r) => r.url === targetUrl)) {
      renderCandidates.push({
        url: targetUrl,
        name: g.title || g.prompt || `My Set #${idx + 1}`,
        label: g.isManualUpload ? 'Uploaded Asset' : (g.prompt ? g.prompt.slice(0, 24) : `My Set #${idx + 1}`),
      });
    }
  });

  const [brokenUrls, setBrokenUrls] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('sn_broken_urls');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const markUrlBroken = (url: string) => {
    if (!url) return;
    setBrokenUrls((prev) => {
      const next = new Set(prev);
      next.add(url);
      try {
        localStorage.setItem('sn_broken_urls', JSON.stringify(Array.from(next)));
      } catch { }
      return next;
    });
    // Immediately auto-advance if current selection failed
    if (leftUrl === url) {
      const next = refCandidates.find((c) => c.url !== url && !brokenUrls.has(c.url));
      if (next) {
        setLeftUrl(next.url);
        setLeftName(next.name);
      }
    }
    if (rightUrl === url) {
      const next = renderCandidates.find((c) => c.url !== url && !brokenUrls.has(c.url));
      if (next) {
        setRightUrl(next.url);
        setRightName(next.name);
      }
    }
  };

  const visibleRefCandidates = refCandidates.filter((c) => !brokenUrls.has(c.url));
  const visibleRenderCandidates = renderCandidates.filter((c) => !brokenUrls.has(c.url));

  const [leftUrl, setLeftUrl] = useState<string>(() => visibleRefCandidates[0]?.url || (refCandidates[0]?.url || (userGenerations[0]?.url || '')));
  const [leftName, setLeftName] = useState<string>(() => visibleRefCandidates[0]?.name || (refCandidates[0]?.name || 'Reference Garment'));
  const [rightUrl, setRightUrl] = useState<string>(() => visibleRenderCandidates[0]?.url || (renderCandidates[0]?.url || (refCandidates[1]?.url || '')));
  const [rightName, setRightName] = useState<string>(() => visibleRenderCandidates[0]?.name || (renderCandidates[0]?.name || 'Generated Render'));

  useEffect(() => {
    if (leftUrl && brokenUrls.has(leftUrl)) {
      const next = visibleRefCandidates[0];
      if (next) {
        setLeftUrl(next.url);
        setLeftName(next.name);
      }
    }
  }, [leftUrl, brokenUrls, visibleRefCandidates]);

  useEffect(() => {
    if (rightUrl && brokenUrls.has(rightUrl)) {
      const next = visibleRenderCandidates[0];
      if (next) {
        setRightUrl(next.url);
        setRightName(next.name);
      }
    }
  }, [rightUrl, brokenUrls, visibleRenderCandidates]);

  const [compareMode, setCompareMode] = useState<'split' | 'curtain'>('split');
  const [curtainPos, setCurtainPos] = useState<number>(50); // percentage 0-100%

  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isSynced, setIsSynced] = useState<boolean>(false);

  const [leftPan, setLeftPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [rightPan, setRightPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [leftZoom, setLeftZoom] = useState<number>(1.0);
  const [rightZoom, setRightZoom] = useState<number>(1.0);

  const [leftRotation, setLeftRotation] = useState<number>(0);
  const [rightRotation, setRightRotation] = useState<number>(0);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const refUploadInputRef = useRef<HTMLInputElement>(null);
  const renderUploadInputRef = useRef<HTMLInputElement>(null);
  const curtainContainerRef = useRef<HTMLDivElement>(null);

  const isDraggingRef = useRef<boolean>(false);
  const dragPaneRef = useRef<'left' | 'right' | 'curtain' | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({ x: 0, y: 0, panX: 0, panY: 0 });

  const activeLeftZoom = isSynced ? zoom : leftZoom;
  const activeRightZoom = isSynced ? zoom : rightZoom;
  const activeLeftPan = isSynced ? pan : leftPan;
  const activeRightPan = isSynced ? pan : rightPan;

  const setSynchronizedZoom = (val: number) => {
    const bounded = Math.min(5.0, Math.max(1.0, Number(val.toFixed(2))));
    setZoom(bounded);
    setLeftZoom(bounded);
    setRightZoom(bounded);
  };

  const handleMouseDown = (e: React.MouseEvent, pane: 'left' | 'right' | 'curtain') => {
    e.preventDefault();
    isDraggingRef.current = true;
    dragPaneRef.current = pane;
    const basePan = isSynced || pane === 'curtain' ? pan : (pane === 'left' ? leftPan : rightPan);
    dragStartRef.current = { x: e.clientX, y: e.clientY, panX: basePan.x, panY: basePan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    const nextPan = { x: dragStartRef.current.panX + dx, y: dragStartRef.current.panY + dy };

    if (isSynced || dragPaneRef.current === 'curtain') {
      setPan(nextPan);
      setLeftPan(nextPan);
      setRightPan(nextPan);
    } else if (dragPaneRef.current === 'left') {
      setLeftPan(nextPan);
    } else if (dragPaneRef.current === 'right') {
      setRightPan(nextPan);
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    dragPaneRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent, pane?: 'left' | 'right') => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.88;
    if (isSynced || !pane) {
      setZoom((prev) => {
        const next = Math.min(5.0, Math.max(1.0, Number((prev * factor).toFixed(2))));
        setLeftZoom(next);
        setRightZoom(next);
        return next;
      });
    } else if (pane === 'left') {
      setLeftZoom((prev) => Math.min(5.0, Math.max(1.0, Number((prev * factor).toFixed(2)))));
    } else {
      setRightZoom((prev) => Math.min(5.0, Math.max(1.0, Number((prev * factor).toFixed(2)))));
    }
  };

  const handleTouchStart = (e: React.TouchEvent, pane: 'left' | 'right' | 'curtain') => {
    if (e.touches.length === 1) {
      isDraggingRef.current = true;
      dragPaneRef.current = pane;
      const basePan = isSynced || pane === 'curtain' ? pan : (pane === 'left' ? leftPan : rightPan);
      dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, panX: basePan.x, panY: basePan.y };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingRef.current || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - dragStartRef.current.x;
    const dy = e.touches[0].clientY - dragStartRef.current.y;
    const nextPan = { x: dragStartRef.current.panX + dx, y: dragStartRef.current.panY + dy };
    if (isSynced || dragPaneRef.current === 'curtain') {
      setPan(nextPan);
      setLeftPan(nextPan);
      setRightPan(nextPan);
    } else if (dragPaneRef.current === 'left') {
      setLeftPan(nextPan);
    } else if (dragPaneRef.current === 'right') {
      setRightPan(nextPan);
    }
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
    dragPaneRef.current = null;
  };

  const handleManualRefUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const standardized = await prepareAndStandardizeImage(file);
      setLeftUrl(standardized.dataUrl);
      setLeftName(`Upload: ${file.name}`);
      if (onSetCloth) {
        onSetCloth({ url: standardized.dataUrl, preview: standardized.dataUrl, name: file.name });
      }
    } catch {
      const reader = new FileReader();
      reader.onload = (evt) => {
        if (typeof evt.target?.result === 'string') {
          setLeftUrl(evt.target.result);
          setLeftName(`Upload: ${file.name}`);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleManualRenderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const standardized = await prepareAndStandardizeImage(file);
      setRightUrl(standardized.dataUrl);
      setRightName(`Upload: ${file.name}`);
    } catch {
      const reader = new FileReader();
      reader.onload = (evt) => {
        if (typeof evt.target?.result === 'string') {
          setRightUrl(evt.target.result);
          setRightName(`Upload: ${file.name}`);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleResetZoomPan = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
    setLeftZoom(1.0);
    setRightZoom(1.0);
    setLeftPan({ x: 0, y: 0 });
    setRightPan({ x: 0, y: 0 });
    setLeftRotation(0);
    setRightRotation(0);
    setCurtainPos(50);
  };

  const handleExportComparison = async () => {
    if (!leftUrl && !rightUrl) return;
    setIsExporting(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 3614;
      canvas.height = 3000;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D unavailable');

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 3614, 3000);

      const loadImage = (src: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('Image load failed'));
          img.src = src;
        });

      if (leftUrl) {
        try {
          const imgL = await loadImage(leftUrl);
          ctx.drawImage(imgL, 0, 0, 1807, 3000);
        } catch { }
      }
      if (rightUrl) {
        try {
          const imgR = await loadImage(rightUrl);
          ctx.drawImage(imgR, 1807, 0, 1807, 3000);
        } catch { }
      }

      ctx.strokeStyle = '#e5373f';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(1807, 0);
      ctx.lineTo(1807, 3000);
      ctx.stroke();

      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `shivnaresh-split-comparison-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }, 'image/png');
    } catch (err: any) {
      alert(err?.message || 'Export comparison failed');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      className="mx-auto max-w-6xl px-4 sm:px-6 py-6 space-y-5"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header Bar */}
      <div className={`p-4 rounded-3xl border transition shadow-sm flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 ${isLight ? 'bg-white border-gray-200' : 'bg-white/[0.03] border-white/10'
        }`}>
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#e5373f]/15 text-[#e5373f]">
              <Columns className="w-4 h-4" />
            </span>
            <h2 className={`text-base font-bold tracking-tight ${isLight ? 'text-gray-900' : 'text-white'}`}>
              Compare Studio &middot; Precision Inspection
            </h2>
            <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
              1807×3000 Ultra-HD
            </span>
          </div>
          <p className={`text-xs mt-0.5 ${isLight ? 'text-gray-500' : 'text-white/60'}`}>
            Dual fabric texture, seam stitching, and leaping athlete logo fidelity inspection with synchronized zoom &amp; pan.
          </p>
        </div>

        {/* Global Toolbar Controls */}
        <div className="flex items-center gap-2 flex-wrap w-full lg:w-auto justify-end">
          {/* Comparison Mode Selector */}
          <div className="flex items-center rounded-xl border p-0.5 border-white/10 bg-white/5">
            <button
              type="button"
              onClick={() => setCompareMode('split')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${compareMode === 'split' ? 'bg-[#e5373f] text-white shadow' : 'text-white/60 hover:text-white'
                }`}
              title="Side-by-Side Dual 1807×3000 Viewports"
            >
              Dual Split View
            </button>
            <button
              type="button"
              onClick={() => setCompareMode('curtain')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${compareMode === 'curtain' ? 'bg-[#e5373f] text-white shadow' : 'text-white/60 hover:text-white'
                }`}
              title="Before / After Sliding Curtain Divider"
            >
              Curtain Slider
            </button>
          </div>

          {/* Sync Lock Toggle */}
          <button
            type="button"
            onClick={() => setIsSynced((s) => !s)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${isSynced
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
              : isLight
                ? 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200'
                : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
              }`}
            title={isSynced ? 'Simultaneous zoom & pan enabled across both viewports' : 'Independent zoom & pan enabled'}
          >
            {isSynced ? <Lock className="w-3.5 h-3.5 text-emerald-400" /> : <Unlock className="w-3.5 h-3.5 text-amber-400" />}
            <span>{isSynced ? 'Synced Zoom' : 'Independent'}</span>
          </button>

          {/* Clean Dead Cache Button */}
          <button
            type="button"
            onClick={async () => {
              try {
                localStorage.removeItem('sn_broken_urls');
                setBrokenUrls(new Set());
                await api.cleanBrokenCache().catch(() => { });
                alert('Dead image cache purged successfully.');
              } catch {
                alert('Cache refreshed.');
              }
            }}
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${isLight ? 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200' : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
              }`}
            title="Clean dead image links & purge cache"
          >
            <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Clean Cache</span>
          </button>

          {/* Synchronized Zoom Slider & Controls */}
          <div className={`flex items-center rounded-xl border px-2.5 py-1 gap-2 ${isLight ? 'border-gray-200 bg-gray-50' : 'border-white/10 bg-white/5'
            }`}>
            <button
              type="button"
              onClick={() => setSynchronizedZoom(activeLeftZoom - 0.25)}
              className="p-1 rounded text-white/70 hover:text-white transition cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <input
              type="range"
              min="100"
              max="500"
              step="10"
              value={Math.round(activeLeftZoom * 100)}
              onChange={(e) => setSynchronizedZoom(Number(e.target.value) / 100)}
              className="w-20 sm:w-28 accent-[#e5373f] cursor-pointer"
              title="Simultaneous Zoom Slider (100% to 500%)"
            />
            <span className="font-mono text-xs font-bold w-12 text-center text-emerald-400">
              {Math.round(activeLeftZoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setSynchronizedZoom(activeLeftZoom + 0.25)}
              className="p-1 rounded text-white/70 hover:text-white transition cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleResetZoomPan}
              className="p-1 rounded text-white/50 hover:text-white transition cursor-pointer ml-0.5"
              title="Reset Zoom & Pan to 100%"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Zoom Presets */}
          <div className="hidden sm:flex items-center gap-1">
            {[1, 1.5, 2, 3].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setSynchronizedZoom(val)}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer ${Math.abs(activeLeftZoom - val) < 0.05
                  ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                  : 'border-white/10 text-white/60 hover:text-white hover:bg-white/5'
                  }`}
              >
                {val * 100}%
              </button>
            ))}
          </div>

          {/* Export Comparison Button */}
          <button
            type="button"
            disabled={isExporting}
            onClick={handleExportComparison}
            className="px-3.5 py-1.5 rounded-xl bg-[#e5373f] hover:bg-[#d42d35] text-white text-xs font-bold flex items-center gap-1.5 transition shadow cursor-pointer disabled:opacity-50"
            title="Download full 3614×3000 side-by-side comparison proof sheet"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isExporting ? 'Exporting…' : 'Export'}</span>
          </button>

          {/* Close Studio Button */}
          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl border transition cursor-pointer ${isLight ? 'border-gray-300 bg-gray-100 hover:bg-gray-200 text-gray-700' : 'border-white/10 bg-white/5 hover:bg-white/10 text-white'
              }`}
            title="Return to Studio Canvas"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Candidate Selectors: Visual Thumbnail Strips */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* LEFT SELECTOR: Reference Garments (Visual Thumbnails) */}
        <div className={`p-3.5 rounded-3xl border transition shadow-sm space-y-2 ${isLight ? 'bg-white border-gray-200' : 'bg-white/[0.02] border-white/10'
          }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-400" />
              <span className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-gray-900' : 'text-white'}`}>
                1. Reference Garment ({visibleRefCandidates.length})
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                ref={refUploadInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleManualRefUpload}
              />
              <button
                type="button"
                onClick={() => refUploadInputRef.current?.click()}
                className={`px-2.5 py-1 rounded-lg border text-xs flex items-center gap-1 transition cursor-pointer ${isLight ? 'border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-700' : 'border-white/10 bg-white/5 hover:bg-white/10 text-white'
                  }`}
                title="Upload manual reference photo"
              >
                <Upload className="w-3 h-3 text-[#e5373f]" />
                <span className="text-[10px] font-semibold">+ Upload Photo</span>
              </button>
              <button
                type="button"
                onClick={() => setLeftRotation((r) => (r + 90) % 360)}
                className={`p-1.5 rounded-lg border text-xs transition cursor-pointer ${isLight ? 'border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-700' : 'border-white/10 bg-white/5 hover:bg-white/10 text-white'
                  }`}
                title="Rotate 90° clockwise"
              >
                <RotateCw className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Visual Cards Strip */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
            {visibleRefCandidates.map((c, idx) => (
              <button
                key={c.url || idx}
                type="button"
                onClick={() => { setLeftUrl(c.url); setLeftName(c.name); }}
                className={`shrink-0 w-16 h-22 sm:w-20 sm:h-28 rounded-xl border overflow-hidden relative group transition-all text-left cursor-pointer ${leftUrl === c.url
                  ? 'border-purple-500 ring-2 ring-purple-500/60 shadow-lg scale-105'
                  : isLight ? 'border-gray-200 bg-white hover:border-purple-400' : 'border-white/10 bg-black/40 hover:border-white/30'
                  }`}
                title={c.name}
              >
                <img
                  src={c.url}
                  alt={c.name}
                  onError={(e) => {
                    markUrlBroken(c.url);
                    (e.currentTarget.closest('button') as HTMLElement)?.style.setProperty('display', 'none');
                  }}
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent p-1 pt-3">
                  <p className="text-[9px] font-bold text-white truncate leading-tight text-center">{c.label}</p>
                </div>
                {leftUrl === c.url && (
                  <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-purple-600 text-white flex items-center justify-center text-[10px] font-bold shadow">
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* RIGHT SELECTOR: AI Renders / My Sets (Visual Thumbnails) */}
        <div className={`p-3.5 rounded-3xl border transition shadow-sm space-y-2 ${isLight ? 'bg-white border-gray-200' : 'bg-white/[0.02] border-white/10'
          }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-gray-900' : 'text-white'}`}>
                2. AI Render / My Sets ({visibleRenderCandidates.length})
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                ref={renderUploadInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleManualRenderUpload}
              />
              <button
                type="button"
                onClick={() => renderUploadInputRef.current?.click()}
                className={`px-2.5 py-1 rounded-lg border text-xs flex items-center gap-1 transition cursor-pointer ${isLight ? 'border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-700' : 'border-white/10 bg-white/5 hover:bg-white/10 text-white'
                  }`}
                title="Upload manual render photo"
              >
                <Upload className="w-3 h-3 text-[#e5373f]" />
                <span className="text-[10px] font-semibold">+ Upload Photo</span>
              </button>
              <button
                type="button"
                onClick={() => setRightRotation((r) => (r + 90) % 360)}
                className={`p-1.5 rounded-lg border text-xs transition cursor-pointer ${isLight ? 'border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-700' : 'border-white/10 bg-white/5 hover:bg-white/10 text-white'
                  }`}
                title="Rotate 90° clockwise"
              >
                <RotateCw className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Visual Cards Strip */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
            {visibleRenderCandidates.map((c, idx) => (
              <button
                key={c.url || idx}
                type="button"
                onClick={() => { setRightUrl(c.url); setRightName(c.name); }}
                className={`shrink-0 w-16 h-22 sm:w-20 sm:h-28 rounded-xl border overflow-hidden relative group transition-all text-left cursor-pointer ${rightUrl === c.url
                  ? 'border-emerald-500 ring-2 ring-emerald-500/60 shadow-lg scale-105'
                  : isLight ? 'border-gray-200 bg-white hover:border-emerald-400' : 'border-white/10 bg-black/40 hover:border-white/30'
                  }`}
                title={c.name}
              >
                <img
                  src={c.url}
                  alt={c.name}
                  onError={(e) => {
                    markUrlBroken(c.url);
                    (e.currentTarget.closest('button') as HTMLElement)?.style.setProperty('display', 'none');
                  }}
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent p-1 pt-3">
                  <p className="text-[9px] font-bold text-white truncate leading-tight text-center">{c.label}</p>
                </div>
                {rightUrl === c.url && (
                  <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold shadow">
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Comparison Viewport */}
      {compareMode === 'split' ? (
        /* DUAL SPLIT VIEWPORTS (Side by Side 1807×3000) */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* LEFT VIEWPORT: Reference Garment */}
          <div className={`p-4 rounded-3xl border transition shadow-sm space-y-3 ${isLight ? 'bg-white border-gray-200' : 'bg-white/[0.02] border-white/10'
            }`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-bold text-purple-400">Reference: {leftName}</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="range"
                  min="100"
                  max="500"
                  step="10"
                  value={Math.round(activeLeftZoom * 100)}
                  onChange={(e) => {
                    const z = Number(e.target.value) / 100;
                    setLeftZoom(z);
                    if (isSynced) setZoom(z);
                  }}
                  className="w-16 sm:w-24 accent-purple-500 cursor-pointer"
                  title="Garment Zoom (100% to 500%)"
                />
                <button
                  type="button"
                  onClick={() => {
                    const z = Math.max(1.0, Number((activeLeftZoom - 0.25).toFixed(2)));
                    setLeftZoom(z);
                    if (isSynced) setZoom(z);
                  }}
                  className="p-1 rounded bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold cursor-pointer"
                  title="Zoom Out Reference Garment"
                >
                  <ZoomOut className="w-3 h-3" />
                </button>
                <span className="text-[10px] font-mono font-bold text-purple-400 w-11 text-center">
                  {Math.round(activeLeftZoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const z = Math.min(5.0, Number((activeLeftZoom + 0.25).toFixed(2)));
                    setLeftZoom(z);
                    if (isSynced) setZoom(z);
                  }}
                  className="p-1 rounded bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold cursor-pointer"
                  title="Zoom In Reference Garment"
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => { setLeftZoom(1.0); setLeftPan({ x: 0, y: 0 }); }}
                  className="p-1 rounded bg-white/10 hover:bg-white/20 text-white/60 hover:text-white text-[10px] cursor-pointer"
                  title="Reset Reference Zoom & Pan"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            </div>
            <div
              className="relative w-full aspect-[1807/3000] rounded-2xl overflow-hidden border border-white/10 bg-black/60 flex items-center justify-center select-none cursor-grab active:cursor-grabbing"
              onMouseDown={(e) => handleMouseDown(e, 'left')}
              onTouchStart={(e) => handleTouchStart(e, 'left')}
              onWheel={(e) => handleWheel(e, 'left')}
            >
              {leftUrl ? (
                <img
                  src={leftUrl}
                  alt={leftName}
                  onError={() => markUrlBroken(leftUrl)}
                  draggable={false}
                  style={{
                    transform: `translate(${activeLeftPan.x}px, ${activeLeftPan.y}px) scale(${activeLeftZoom}) rotate(${leftRotation}deg)`,
                    transformOrigin: 'center center',
                    transition: isDraggingRef.current ? 'none' : 'transform 0.08s ease-out',
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                  }}
                />
              ) : (
                <div className="text-center p-6 space-y-2 opacity-50">
                  <Camera className="w-8 h-8 mx-auto" />
                  <p className="text-xs">No reference image selected.</p>
                </div>
              )}
              <div className="absolute top-2 left-2 flex items-center gap-1.5 pointer-events-none">
                <span className="rounded-full bg-black/75 backdrop-blur-sm px-2.5 py-1 text-[10px] font-bold text-white truncate max-w-[200px]">
                  {leftName}
                </span>
                <span className="rounded-full bg-black/75 backdrop-blur-sm px-2 py-0.5 text-[9px] font-mono text-white/80">
                  {Math.round(activeLeftZoom * 100)}%
                </span>
              </div>
              <div className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-[9px] font-mono text-white/60 pointer-events-none">
                1807 × 3000
              </div>
            </div>
          </div>

          {/* RIGHT VIEWPORT: Generated Render */}
          <div className={`p-4 rounded-3xl border transition shadow-sm space-y-3 ${isLight ? 'bg-white border-gray-200' : 'bg-white/[0.02] border-white/10'
            }`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-bold text-emerald-400">Model Render: {rightName}</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="range"
                  min="100"
                  max="500"
                  step="10"
                  value={Math.round(activeRightZoom * 100)}
                  onChange={(e) => {
                    const z = Number(e.target.value) / 100;
                    setRightZoom(z);
                    if (isSynced) setZoom(z);
                  }}
                  className="w-16 sm:w-24 accent-emerald-500 cursor-pointer"
                  title="Model Render Zoom (100% to 500%)"
                />
                <button
                  type="button"
                  onClick={() => {
                    const z = Math.max(1.0, Number((activeRightZoom - 0.25).toFixed(2)));
                    setRightZoom(z);
                    if (isSynced) setZoom(z);
                  }}
                  className="p-1 rounded bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold cursor-pointer"
                  title="Zoom Out Model Render"
                >
                  <ZoomOut className="w-3 h-3" />
                </button>
                <span className="text-[10px] font-mono font-bold text-emerald-400 w-11 text-center">
                  {Math.round(activeRightZoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const z = Math.min(5.0, Number((activeRightZoom + 0.25).toFixed(2)));
                    setRightZoom(z);
                    if (isSynced) setZoom(z);
                  }}
                  className="p-1 rounded bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold cursor-pointer"
                  title="Zoom In Model Render"
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => { setRightZoom(1.0); setRightPan({ x: 0, y: 0 }); }}
                  className="p-1 rounded bg-white/10 hover:bg-white/20 text-white/60 hover:text-white text-[10px] cursor-pointer"
                  title="Reset Model Render Zoom & Pan"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            </div>
            <div
              className="relative w-full aspect-[1807/3000] rounded-2xl overflow-hidden border border-white/10 bg-black/60 flex items-center justify-center select-none cursor-grab active:cursor-grabbing"
              onMouseDown={(e) => handleMouseDown(e, 'right')}
              onTouchStart={(e) => handleTouchStart(e, 'right')}
              onWheel={(e) => handleWheel(e, 'right')}
            >
              {rightUrl ? (
                <img
                  src={rightUrl}
                  alt={rightName}
                  onError={() => markUrlBroken(rightUrl)}
                  draggable={false}
                  style={{
                    transform: `translate(${activeRightPan.x}px, ${activeRightPan.y}px) scale(${activeRightZoom}) rotate(${rightRotation}deg)`,
                    transformOrigin: 'center center',
                    transition: isDraggingRef.current ? 'none' : 'transform 0.08s ease-out',
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                  }}
                />
              ) : (
                <div className="text-center p-6 space-y-2 opacity-50">
                  <Film className="w-8 h-8 mx-auto" />
                  <p className="text-xs">No render image selected.</p>
                </div>
              )}
              <div className="absolute top-2 left-2 flex items-center gap-1.5 pointer-events-none">
                <span className="rounded-full bg-black/75 backdrop-blur-sm px-2.5 py-1 text-[10px] font-bold text-white truncate max-w-[200px]">
                  {rightName}
                </span>
                <span className="rounded-full bg-black/75 backdrop-blur-sm px-2 py-0.5 text-[9px] font-mono text-white/80">
                  {Math.round(activeRightZoom * 100)}%
                </span>
              </div>
              <div className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-[9px] font-mono text-white/60 pointer-events-none">
                1807 × 3000
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* BEFORE / AFTER SPLIT CURTAIN SLIDER VIEW (Synchronized Overlay) */
        <div className={`p-5 rounded-3xl border transition shadow-sm space-y-3 ${isLight ? 'bg-white border-gray-200' : 'bg-white/[0.02] border-white/10'
          }`}>
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-purple-400">&larr; Drag Left for Reference Garment</span>
            <span className="text-white/60 font-mono">Curtain: {Math.round(curtainPos)}% &middot; Zoom: {Math.round(activeLeftZoom * 100)}%</span>
            <span className="text-emerald-400">Drag Right for AI Render &rarr;</span>
          </div>

          <div
            ref={curtainContainerRef}
            className="relative w-full max-w-lg mx-auto aspect-[1807/3000] rounded-3xl overflow-hidden border border-white/20 bg-black/80 flex items-center justify-center select-none cursor-grab active:cursor-grabbing shadow-2xl"
            onMouseDown={(e) => handleMouseDown(e, 'curtain')}
            onTouchStart={(e) => handleTouchStart(e, 'curtain')}
            onWheel={(e) => handleWheel(e)}
          >
            {/* Bottom Layer: AI Render (Right Image) */}
            {rightUrl && (
              <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                <img
                  src={rightUrl}
                  alt={rightName}
                  draggable={false}
                  style={{
                    transform: `translate(${activeRightPan.x}px, ${activeRightPan.y}px) scale(${activeRightZoom}) rotate(${rightRotation}deg)`,
                    transformOrigin: 'center center',
                    transition: isDraggingRef.current ? 'none' : 'transform 0.08s ease-out',
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                  }}
                />
              </div>
            )}

            {/* Top Layer: Reference Garment (Left Image, Clipped) */}
            {leftUrl && (
              <div
                className="absolute inset-0 flex items-center justify-center overflow-hidden"
                style={{
                  clipPath: `polygon(0 0, ${curtainPos}% 0, ${curtainPos}% 100%, 0 100%)`,
                }}
              >
                <img
                  src={leftUrl}
                  alt={leftName}
                  draggable={false}
                  style={{
                    transform: `translate(${activeLeftPan.x}px, ${activeLeftPan.y}px) scale(${activeLeftZoom}) rotate(${leftRotation}deg)`,
                    transformOrigin: 'center center',
                    transition: isDraggingRef.current ? 'none' : 'transform 0.08s ease-out',
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                  }}
                />
              </div>
            )}

            {/* Interactive Draggable Curtain Handle */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-[#e5373f] shadow-[0_0_12px_rgba(229,55,63,0.9)] cursor-ew-resize z-20 flex items-center justify-center"
              style={{ left: `${curtainPos}%` }}
              onMouseDown={(e) => {
                e.stopPropagation();
                const handleMove = (ev: MouseEvent) => {
                  if (!curtainContainerRef.current) return;
                  const rect = curtainContainerRef.current.getBoundingClientRect();
                  const pct = Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100));
                  setCurtainPos(pct);
                };
                const handleUp = () => {
                  window.removeEventListener('mousemove', handleMove);
                  window.removeEventListener('mouseup', handleUp);
                };
                window.addEventListener('mousemove', handleMove);
                window.addEventListener('mouseup', handleUp);
              }}
            >
              <div className="w-8 h-8 rounded-full bg-[#e5373f] text-white flex items-center justify-center shadow-2xl border-2 border-white text-xs font-bold cursor-ew-resize select-none">
                &harr;
              </div>
            </div>

            {/* Floating Labels */}
            <div className="absolute top-3 left-3 rounded-full bg-black/80 backdrop-blur-sm px-3 py-1 text-[10px] font-bold text-purple-300 pointer-events-none">
              Reference: {leftName}
            </div>
            <div className="absolute top-3 right-3 rounded-full bg-black/80 backdrop-blur-sm px-3 py-1 text-[10px] font-bold text-emerald-300 pointer-events-none">
              Render: {rightName}
            </div>
            <div className="absolute bottom-3 right-3 rounded-full bg-black/80 px-2.5 py-0.5 text-[9px] font-mono text-white/70 pointer-events-none">
              1807 × 3000 Ultra-HD
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================
   Main Design page
   ================================================================ */
export default function Design() {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const cached = localStorage.getItem('cached_current_user');
      if (cached) return JSON.parse(cached);
    } catch { }
    return null;
  });
  const [showPhotoshootQueryBox, setShowPhotoshootQueryBox] = useState(false);
  const [photoshootQueryText, setPhotoshootQueryText] = useState('');
  const [photoshootResponding, setPhotoshootResponding] = useState(false);
  const [showAllGarmentsModal, setShowAllGarmentsModal] = useState(false);
  const [garmentSearchQuery, setGarmentSearchQuery] = useState('');

  const handlePhotoshootResponse = async (action: 'agree' | 'query') => {
    if (action === 'query' && !photoshootQueryText.trim()) {
      alert('Please enter your query or question before sending.');
      return;
    }
    setPhotoshootResponding(true);
    try {
      const res = await api.respondPhotoshootOffer(action, photoshootQueryText);
      if (action === 'agree') {
        setUser((prev) => prev ? {
          ...prev,
          photoshoots: res.photoshoots || prev.photoshoots,
          photoshootOffer: prev.photoshootOffer ? { ...prev.photoshootOffer, status: 'agreed' } : null,
        } : null);
        alert('Photoshoot quota agreed and applied successfully!');
      } else {
        setUser((prev) => prev ? {
          ...prev,
          photoshootOffer: prev.photoshootOffer ? { ...prev.photoshootOffer, status: 'queried', userQuery: photoshootQueryText } : null,
        } : null);
        setShowPhotoshootQueryBox(false);
        setPhotoshootQueryText('');
        alert('Your query has been submitted to the admin team.');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to submit response.');
    } finally {
      setPhotoshootResponding(false);
    }
  };
  const [settings, setSettings] = useState<Studio | null>(null);
  const [categories, setCategories] = useState<ModelCategory[]>(() => {
    try {
      const cached = localStorage.getItem('cached_studio_models');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.filter((g) => Boolean(getBestGenUrl(g)));
        }
      }
    } catch { }
    return [];
  });
  const [modelCategoryFilter, setModelCategoryFilter] = useState<'all' | 'summer' | 'winter' | string>('all');
  const [availableSeasons, setAvailableSeasons] = useState<string[]>(['Summer', 'Winter']);

  const filteredCategories = useMemo(() => {
    if (modelCategoryFilter === 'all') {
      return categories;
    }
    const targetSeason = modelCategoryFilter.toLowerCase();
    return categories
      .map((cat) => {
        const matchingItems = cat.items.filter((item) => {
          // If admin has not put model in any season (empty, 'all', or 'all seasons'), show across all seasons!
          if (!item.season || item.season.toLowerCase() === 'all' || item.season.toLowerCase() === 'all seasons') {
            return true;
          }
          return item.season.toLowerCase() === targetSeason;
        });
        return { ...cat, items: matchingItems };
      })
      .filter((cat) => cat.items.length > 0);
  }, [categories, modelCategoryFilter]);

  const modelCategoryTabs = useMemo(() => {
    const defaultTabs: Array<{ id: string; label: string }> = [
      { id: 'all', label: 'All Seasons' },
    ];
    for (const s of availableSeasons) {
      const icon = s.toLowerCase() === 'summer' ? '☀️ ' : s.toLowerCase() === 'winter' ? '❄️ ' : '🏷️ ';
      defaultTabs.push({ id: s.toLowerCase(), label: `${icon}${s}` });
    }
    return defaultTabs;
  }, [availableSeasons]);
  const [uploads, setUploads] = useState<{ id: string; name: string; url: string; kind?: string; at?: number }[]>([]);
  const [uploadSets, setUploadSets] = useState<UploadSet[]>(() => {
    try {
      const cached = localStorage.getItem('cached_upload_sets');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.filter((g) => Boolean(getBestGenUrl(g)));
        }
      }
    } catch { }
    return [];
  });
  const [loadingSets, setLoadingSets] = useState(false);
  const [userGenerations, setUserGenerations] = useState<UserGeneration[]>(() => {
    try {
      const cached = localStorage.getItem('cached_user_generations');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.filter((g) => Boolean(getBestGenUrl(g)));
        }
      }
    } catch { }
    return [];
  });
  const [loadingGenerations, setLoadingGenerations] = useState(false);

  const [brokenImageUrls, setBrokenImageUrls] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('sn_broken_urls');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const markGlobalBrokenUrl = useCallback((url: string) => {
    if (!url) return;
    setBrokenImageUrls((prev) => {
      const next = new Set(prev);
      next.add(url);
      try {
        localStorage.setItem('sn_broken_urls', JSON.stringify(Array.from(next)));
      } catch { }
      return next;
    });
  }, []);

  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';

  const [customRequests, setCustomRequests] = useState<CustomRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [deliveriesUnreadCount, setDeliveriesUnreadCount] = useState(0);

  /* Page view tabs */
  const [pageView, setPageView] = useState<'studio' | 'my-sets' | 'custom-requests' | 'deliveries' | 'video' | 'watermark' | 'compare'>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab === 'watermark' || window.location.hash === '#watermark') return 'watermark';
      if (tab === 'video') return 'video';
      if (tab === 'my-sets') return 'my-sets';
      if (tab === 'custom-requests') return 'custom-requests';
      if (tab === 'deliveries') return 'deliveries';
      if (tab === 'compare') return 'compare';
    } catch { }
    return 'studio';
  });

  const [mode, setMode] = useState<ModeId>('tryon');
  const [quality, setQuality] = useState<'1k' | '2k'>('1k');
  const [show2kConfirmModal, setShow2kConfirmModal] = useState(false);
  const [showHdLogoOverlay, setShowHdLogoOverlay] = useState(false);
  const [showPantLogo, setShowPantLogo] = useState(false);
  const [cleanResultBackup, setCleanResultBackup] = useState<string | null>(null);
  const [activeRenderOption, setActiveRenderOption] = useState<'a' | 'b'>('b');
  const [activeLogoTarget, setActiveLogoTarget] = useState<'chest' | 'pant'>('chest');
  const [hdLogoColor, setHdLogoColor] = useState<string>('#ffffff');
  const [isOptionBDirty, setIsOptionBDirty] = useState(false);

  const getAutoContrastColor = useCallback((colorStr: string) => {
    if (!colorStr) return '#ffffff';
    const lower = colorStr.toLowerCase();
    if (
      lower.includes('white') ||
      lower.includes('optic') ||
      lower.includes('cream') ||
      lower.includes('ivory') ||
      lower.includes('yellow') ||
      lower.includes('lime') ||
      lower.includes('light grey') ||
      lower.includes('light gray')
    ) {
      return '#111111';
    }
    const hexMatch = colorStr.match(/#([0-9a-f]{6})/i);
    if (hexMatch) {
      const hex = hexMatch[1];
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      return lum > 165 ? '#111111' : '#ffffff';
    }
    return '#ffffff';
  }, []);
  const customLogoUrl: string | null = null;
  // Chest logo: default 48px width, x=43.5% (right on chest pocket area), y=20.5%
  const [hdLogoScale, setHdLogoScale] = useState<number>(() => {
    try {
      const v = localStorage.getItem('shivnaresh_chest_logo_scale');
      if (v) {
        const n = Number(v);
        if (n >= 6) return n;
      }
    } catch { }
    return 48;
  });
  const [hdLogoX, setHdLogoX] = useState<number>(() => {
    try {
      const v = localStorage.getItem('shivnaresh_chest_logo_x');
      if (v) return Number(v);
    } catch { }
    return 43.5;
  });
  const [hdLogoY, setHdLogoY] = useState<number>(() => {
    try {
      const v = localStorage.getItem('shivnaresh_chest_logo_y');
      if (v) return Number(v);
    } catch { }
    return 20.5;
  });
  // Pant thigh logo: default 36px width, x=63%, y=61%
  const [pantLogoScale, setPantLogoScale] = useState<number>(() => {
    try {
      const v = localStorage.getItem('shivnaresh_pant_logo_scale');
      if (v) {
        const n = Number(v);
        if (n >= 6) return n;
      }
    } catch { }
    return 36;
  });
  const [pantLogoX, setPantLogoX] = useState<number>(() => {
    try {
      const v = localStorage.getItem('shivnaresh_pant_logo_x');
      if (v) return Number(v);
    } catch { }
    return 63;
  });
  const [pantLogoY, setPantLogoY] = useState<number>(() => {
    try {
      const v = localStorage.getItem('shivnaresh_pant_logo_y');
      if (v) return Number(v);
    } catch { }
    return 61;
  });

  // Track last erased area specs for automatic 1:1 scale & position deduction
  const lastErasedSpecRef = useRef<{ scale: number; x: number; y: number; target: 'chest' | 'pant' } | null>(null);

  // Logo rotation, fabric curvature, and 3D torso perspective states
  const [hdLogoAngle, setHdLogoAngle] = useState<number>(() => {
    try {
      const v = localStorage.getItem('shivnaresh_chest_logo_angle');
      if (v) return Number(v);
    } catch { }
    return -2.5;
  });
  const [hdLogoCurvature, setHdLogoCurvature] = useState<number>(14);
  const [hdLogoCurveDirection, setHdLogoCurveDirection] = useState<'standard' | 'left' | 'right'>('standard');
  const [hdLogoPerspective, setHdLogoPerspective] = useState<number>(0.94);

  const [pantLogoAngle, setPantLogoAngle] = useState<number>(() => {
    try {
      const v = localStorage.getItem('shivnaresh_pant_logo_angle');
      if (v) return Number(v);
    } catch { }
    return -1.0;
  });
  const [pantLogoPerspective, setPantLogoPerspective] = useState<number>(0.96);

  const autoSaveTriggerRef = useRef<((img?: string, label?: string) => void) | null>(null);

  const updateChestScale = (val: number) => {
    setHdLogoScale(val);
    setIsOptionBDirty(true);
    try { localStorage.setItem('shivnaresh_chest_logo_scale', String(val)); } catch { }
  };
  const updateChestX = (val: number) => {
    setHdLogoX(val);
    setIsOptionBDirty(true);
    try { localStorage.setItem('shivnaresh_chest_logo_x', String(val)); } catch { }
  };
  const updateChestY = (val: number) => {
    setHdLogoY(val);
    setIsOptionBDirty(true);
    try { localStorage.setItem('shivnaresh_chest_logo_y', String(val)); } catch { }
  };
  const updateChestAngle = (val: number) => {
    setHdLogoAngle(val);
    setIsOptionBDirty(true);
    try { localStorage.setItem('shivnaresh_chest_logo_angle', String(val)); } catch { }
  };
  const updatePantScale = (val: number) => {
    setPantLogoScale(val);
    setIsOptionBDirty(true);
    try { localStorage.setItem('shivnaresh_pant_logo_scale', String(val)); } catch { }
  };
  const updatePantX = (val: number) => {
    setPantLogoX(val);
    setIsOptionBDirty(true);
    try { localStorage.setItem('shivnaresh_pant_logo_x', String(val)); } catch { }
  };
  const updatePantY = (val: number) => {
    setPantLogoY(val);
    setIsOptionBDirty(true);
    try { localStorage.setItem('shivnaresh_pant_logo_y', String(val)); } catch { }
  };
  const updatePantAngle = (val: number) => {
    setPantLogoAngle(val);
    setIsOptionBDirty(true);
    try { localStorage.setItem('shivnaresh_pant_logo_angle', String(val)); } catch { }
  };

  const applyPoseContour = (preset: 'front' | 'angled-left' | 'angled-right') => {
    setIsOptionBDirty(true);
    if (preset === 'front') {
      setHdLogoAngle(-2.5);
      setHdLogoPerspective(1.0);
      setHdLogoCurvature(12);
      setHdLogoCurveDirection('standard');
      setPantLogoAngle(-1.0);
      setPantLogoPerspective(1.0);
    } else if (preset === 'angled-left') {
      // Model turned towards their left (athlete turned in 3/4 pose like user's photo!)
      setHdLogoAngle(-7.0);
      setHdLogoPerspective(0.92);
      setHdLogoCurvature(18);
      setHdLogoCurveDirection('left');
      setPantLogoAngle(-3.0);
      setPantLogoPerspective(0.94);
    } else if (preset === 'angled-right') {
      // Model turned towards their right
      setHdLogoAngle(+5.5);
      setHdLogoPerspective(0.92);
      setHdLogoCurvature(18);
      setHdLogoCurveDirection('right');
      setPantLogoAngle(+2.5);
      setPantLogoPerspective(0.94);
    }
  };

  const [draggingLogo, setDraggingLogo] = useState<'chest' | 'pant' | null>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const imageWrapperRef = useRef<HTMLDivElement>(null);

  const getImageElementRect = () => {
    const img = document.getElementById('rendered-main-img') as HTMLImageElement | null;
    if (img && img.naturalWidth && img.naturalHeight) {
      const rect = img.getBoundingClientRect();
      if (rect.width > 10 && rect.height > 10) {
        const scale = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
        const renderW = img.naturalWidth * scale;
        const renderH = img.naturalHeight * scale;
        const left = rect.left + (rect.width - renderW) / 2;
        const top = rect.top + (rect.height - renderH) / 2;
        return { left, top, width: renderW, height: renderH };
      }
    }
    const wrapper = imageWrapperRef.current;
    if (wrapper) {
      const wRect = wrapper.getBoundingClientRect();
      if (wRect.width > 10 && wRect.height > 10) return wRect;
    }
    return previewContainerRef.current?.getBoundingClientRect() || null;
  };

  const handleStartDragLogo = (e: React.MouseEvent | React.TouchEvent, target: 'chest' | 'pant') => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingLogo(target);
    setActiveLogoTarget(target);
    setIsOptionBDirty(true);

    const handleMove = (moveEvt: MouseEvent | TouchEvent) => {
      const rect = getImageElementRect();
      if (!rect || rect.width === 0 || rect.height === 0) return;

      const clientX = 'touches' in moveEvt ? moveEvt.touches[0].clientX : moveEvt.clientX;
      const clientY = 'touches' in moveEvt ? moveEvt.touches[0].clientY : moveEvt.clientY;

      const rawX = ((clientX - rect.left) / rect.width) * 100;
      const rawY = ((clientY - rect.top) / rect.height) * 100;

      const clampedX = Math.max(3, Math.min(97, Math.round(rawX * 10) / 10));
      const clampedY = Math.max(3, Math.min(97, Math.round(rawY * 10) / 10));

      if (target === 'chest') {
        updateChestX(clampedX);
        updateChestY(clampedY);
      } else {
        updatePantX(clampedX);
        updatePantY(clampedY);
      }
    };

    const handleEnd = () => {
      setDraggingLogo(null);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
      autoSaveTriggerRef.current?.();
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
  };

  /* Area-Selective AI Logo Eraser State & Handlers (Canva-Style Brush & Area Selection) */
  type RubPoint = { x: number; y: number };
  type RubStroke = RubPoint[];

  const [isEraseMode, setIsEraseMode] = useState(false);
  const [eraseTool, setEraseTool] = useState<'brush' | 'area'>('brush');
  const [brushScalePercent, setBrushScalePercent] = useState<number>(10);
  const brushRadius = Math.max(2, Math.min(45, Math.round((brushScalePercent / 100) * 35)));
  const [eraseBox, setEraseBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [isDrawingEraseBox, setIsDrawingEraseBox] = useState(false);
  const [rubStrokes, setRubStrokes] = useState<RubStroke[]>([]);
  const rubStrokesRef = useRef<RubStroke[]>([]);
  const currentStrokeRef = useRef<RubPoint[]>([]);
  const [isRubbing, setIsRubbing] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const rubCanvasRef = useRef<HTMLCanvasElement>(null);
  const [eraseUndoStack, setEraseUndoStack] = useState<string[]>([]);
  const [isErasing, setIsErasing] = useState(false);
  const [isSeamProtect, setIsSeamProtect] = useState(true);
  const [renderedImgAspect, setRenderedImgAspect] = useState<number | null>(null);
  const [eraseCanvasZoom, setEraseCanvasZoom] = useState<number>(1.0);

  const handleSwitchEraseTool = (tool: 'brush' | 'area') => {
    setEraseTool(tool);
    handleClearStrokes();
  };

  const computeRubBoundingBox = (strokes: RubStroke[], radius: number, rectW: number, rectH: number) => {
    if (!strokes || strokes.length === 0) return null;
    let minX = 100, maxX = 0, minY = 100, maxY = 0, total = 0;
    for (const s of strokes) {
      for (const pt of s) {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
        total++;
      }
    }
    if (total === 0) return null;

    const padX = ((radius + 2) / (rectW || 380)) * 100;
    const padY = ((radius + 2) / (rectH || 500)) * 100;

    const boxX = Math.max(0, minX - padX);
    const boxY = Math.max(0, minY - padY);
    const boxW = Math.min(100 - boxX, Math.max(1, (maxX - minX) + padX * 2));
    const boxH = Math.min(100 - boxY, Math.max(1, (maxY - minY) + padY * 2));

    return {
      x: Math.round(boxX * 10) / 10,
      y: Math.round(boxY * 10) / 10,
      width: Math.round(boxW * 10) / 10,
      height: Math.round(boxH * 10) / 10,
    };
  };

  const redrawRubCanvas = (strokes: RubStroke[], activeRadius = brushRadius) => {
    const canvas = rubCanvasRef.current;
    if (!canvas) return;
    const curRect = getImageElementRect();
    if (curRect && curRect.width > 0 && curRect.height > 0) {
      const targetW = Math.round(curRect.width);
      const targetH = Math.round(curRect.height);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!strokes || strokes.length === 0) return;

    ctx.strokeStyle = 'rgba(239, 68, 68, 0.45)';
    ctx.fillStyle = 'rgba(239, 68, 68, 0.45)';
    ctx.lineWidth = activeRadius * 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const s of strokes) {
      if (s.length === 0) continue;
      ctx.beginPath();
      for (let i = 0; i < s.length; i++) {
        const px = (s[i].x / 100) * canvas.width;
        const py = (s[i].y / 100) * canvas.height;
        if (i === 0) {
          ctx.moveTo(px, py);
          ctx.arc(px, py, activeRadius, 0, Math.PI * 2);
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
    }
  };

  const handleClearStrokes = () => {
    setRubStrokes([]);
    rubStrokesRef.current = [];
    currentStrokeRef.current = [];
    setEraseBox(null);
    setIsDrawingEraseBox(false);
    setIsRubbing(false);
    const canvas = rubCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const handleStartEraseSelect = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isEraseMode) return;
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = getImageElementRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;

    const startClientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const startClientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const startX = Math.max(0, Math.min(100, ((startClientX - rect.left) / rect.width) * 100));
    const startY = Math.max(0, Math.min(100, ((startClientY - rect.top) / rect.height) * 100));

    if (eraseTool === 'area') {
      // Area Selection Mode (Canva Area style)
      setIsDrawingEraseBox(true);
      setEraseBox({ x: startX, y: startY, width: 0, height: 0 });

      const handleMove = (moveEvt: MouseEvent | TouchEvent) => {
        const curRect = getImageElementRect();
        if (!curRect || curRect.width === 0 || curRect.height === 0) return;
        const clientX = 'touches' in moveEvt ? moveEvt.touches[0].clientX : moveEvt.clientX;
        const clientY = 'touches' in moveEvt ? moveEvt.touches[0].clientY : moveEvt.clientY;

        const currX = Math.max(0, Math.min(100, ((clientX - curRect.left) / curRect.width) * 100));
        const currY = Math.max(0, Math.min(100, ((clientY - curRect.top) / curRect.height) * 100));

        const boxX = Math.min(startX, currX);
        const boxY = Math.min(startY, currY);
        const boxW = Math.abs(currX - startX);
        const boxH = Math.abs(currY - startY);

        setEraseBox({
          x: Math.round(boxX * 10) / 10,
          y: Math.round(boxY * 10) / 10,
          width: Math.round(boxW * 10) / 10,
          height: Math.round(boxH * 10) / 10,
        });
      };

      const handleEnd = () => {
        setIsDrawingEraseBox(false);
        setEraseBox((prev) => {
          if (!prev || prev.width < 0.5 || prev.height < 0.5) return null;
          const curRect = getImageElementRect();
          const dispW = (curRect && curRect.width > 20) ? curRect.width : 380;
          const autoScale = Math.max(14, Math.min(80, Math.round((dispW * prev.width) / 100)));
          const centerX = Math.round((prev.x + prev.width / 2) * 10) / 10;
          const centerY = Math.round((prev.y + prev.height / 2) * 10) / 10;
          const target = centerY > 50 ? 'pant' : 'chest';
          lastErasedSpecRef.current = { scale: autoScale, x: centerX, y: centerY, target };
          return prev;
        });
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleEnd);
        window.removeEventListener('touchmove', handleMove);
        window.removeEventListener('touchend', handleEnd);
      };

      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleEnd);
      window.addEventListener('touchmove', handleMove, { passive: false });
      window.addEventListener('touchend', handleEnd);
      return;
    }

    // Brush (Rubbing) Mode
    const newStroke: RubPoint[] = [{ x: startX, y: startY }];
    currentStrokeRef.current = newStroke;
    setIsRubbing(true);
    setIsDrawingEraseBox(true);
    setCursorPos({ x: startClientX - rect.left, y: startClientY - rect.top });
    redrawRubCanvas([...rubStrokesRef.current, newStroke], brushRadius);

    const handleMove = (moveEvt: MouseEvent | TouchEvent) => {
      const curRect = getImageElementRect();
      if (!curRect || curRect.width === 0 || curRect.height === 0) return;
      const clientX = 'touches' in moveEvt ? moveEvt.touches[0].clientX : moveEvt.clientX;
      const clientY = 'touches' in moveEvt ? moveEvt.touches[0].clientY : moveEvt.clientY;

      const currX = Math.max(0, Math.min(100, ((clientX - curRect.left) / curRect.width) * 100));
      const currY = Math.max(0, Math.min(100, ((clientY - curRect.top) / curRect.height) * 100));

      newStroke.push({ x: currX, y: currY });
      setCursorPos({ x: clientX - curRect.left, y: clientY - curRect.top });
      redrawRubCanvas([...rubStrokesRef.current, newStroke], brushRadius);
    };

    const handleEnd = () => {
      setIsRubbing(false);
      setIsDrawingEraseBox(false);
      if (newStroke.length > 0) {
        const next = [...rubStrokesRef.current, newStroke];
        rubStrokesRef.current = next;
        setRubStrokes(next);
        const curRect = getImageElementRect();
        const bbox = computeRubBoundingBox(next, brushRadius, curRect?.width || 380, curRect?.height || 500);
        setEraseBox(bbox);
        if (bbox) {
          const autoScale = Math.max(14, Math.min(80, Math.round(((curRect?.width || 380) * bbox.width) / 100)));
          const centerX = Math.round((bbox.x + bbox.width / 2) * 10) / 10;
          const centerY = Math.round((bbox.y + bbox.height / 2) * 10) / 10;
          const target = centerY > 50 ? 'pant' : 'chest';
          lastErasedSpecRef.current = { scale: autoScale, x: centerX, y: centerY, target };
        }
      }
      currentStrokeRef.current = [];
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
  };

  const eraseUploadInputRef = useRef<HTMLInputElement>(null);
  const [eraseSearchQuery, setEraseSearchQuery] = useState('');
  const [showAllMySetsInEraser, setShowAllMySetsInEraser] = useState(false);

  const handleLoadImageForEraser = (imageUrl: string) => {
    setResult(imageUrl);
    setCleanResultBackup(imageUrl);
    setRenderedImgAspect(null);
    setIsEraseMode(true);
    setEraseBox(null);
    setActiveRenderOption('a');
    setShowHdLogoOverlay(false);
    setShowPantLogo(false);
    setIsOptionBDirty(false);
  };

  const handleFileUploadForEraser = async (file: File) => {
    try {
      const dataUrl = await fileToDataUrl(file);
      handleLoadImageForEraser(dataUrl);
    } catch (e: any) {
      alert('Could not load image: ' + (e?.message || e));
    }
  };
  const [showTierLockModal, setShowTierLockModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  /* Try-on inputs */
  const [cloth, setCloth] = useState<Pick>(null);
  const [selectedClothes, setSelectedClothes] = useState<Array<{ url: string; preview?: string; name: string }>>([]);
  /* Smart garment classification */
  const [classifiedGarments, setClassifiedGarments] = useState<ClassifiedGarment[]>([]);
  const [tryOnTarget, setTryOnTarget] = useState<TryOnTarget>(() => {
    try {
      const saved = localStorage.getItem('shivnaresh_tryon_target');
      if (saved === 'both' || saved === 'lower' || saved === 'upper') return saved;
    } catch { }
    return 'both';
  });

  const handleSetTryOnTarget = (target: TryOnTarget) => {
    setTryOnTarget(target);
    try {
      localStorage.setItem('shivnaresh_tryon_target', target);
    } catch { }
    if (target === 'upper') {
      setActiveLogoTarget('chest');
    } else if (target === 'lower') {
      setActiveLogoTarget('pant');
    }
  };

  const syncAutoTarget = (list: ClassifiedGarment[]) => {
    const auto = computeAutoTryOnTarget(list);
    setTryOnTarget(auto);
    if (auto === 'lower') {
      setShowHdLogoOverlay(false);
      setShowPantLogo(true);
      setActiveLogoTarget('pant');
    } else if (auto === 'upper') {
      setShowHdLogoOverlay(true);
      setShowPantLogo(false);
      setActiveLogoTarget('chest');
    } else {
      setShowHdLogoOverlay(true);
      setShowPantLogo(true);
    }
    try { localStorage.setItem('shivnaresh_tryon_target', auto); } catch { }
  };

  function removeSelectedCloth(index: number) {
    setSelectedClothes((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (cloth && cloth.url === prev[index]?.url) {
        setCloth(next[0] || null);
      }
      return next;
    });
  }

  function addClassifiedGarment(garment: { url: string; preview?: string; name: string }, explicitRole?: GarmentRole) {
    const role = explicitRole || classifyGarmentByHeuristic(garment.name);
    setClassifiedGarments((prev) => {
      const exists = prev.some((g) => g.url === garment.url);
      if (exists) return prev;
      if (prev.length >= 5) {
        alert('You can upload a maximum of 5 garment reference views.');
        return prev;
      }
      const next = [...prev, { ...garment, role }];
      syncAutoTarget(next);
      return next;
    });
  }

  function updateGarmentRole(url: string, newRole: GarmentRole) {
    setClassifiedGarments((prev) => {
      const next = prev.map((g) => (g.url === url ? { ...g, role: newRole } : g));
      syncAutoTarget(next);
      return next;
    });
  }

  function updateGarmentCustomLabel(url: string, customLabel: string) {
    setClassifiedGarments((prev) => prev.map((g) => g.url === url ? { ...g, customLabel } : g));
  }

  function swapTopAndBottomGarments() {
    setClassifiedGarments((prev) => {
      if (prev.length < 2) return prev;
      const next = [...prev];
      const temp = next[0];
      next[0] = next[1];
      next[1] = temp;
      const remapped = next.map((g, idx) => ({
        ...g,
        role: idx === 0 ? 'top-front' : idx === 1 ? 'bottom' : g.role,
      }));
      syncAutoTarget(remapped);
      return remapped;
    });
  }

  function removeClassifiedGarment(url: string) {
    setClassifiedGarments((prev) => {
      const next = prev.filter((g) => g.url !== url);
      syncAutoTarget(next);
      return next;
    });
    // Also remove from selectedClothes and active cloth
    const idx = selectedClothes.findIndex((c) => c.url === url);
    if (idx !== -1) removeSelectedCloth(idx);
    setCloth((c) => (c?.url === url ? null : c));
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
    const pickItem = { url: item.url, preview: item.url, name: item.name };
    setSelectedModels((prev) => {
      const isSelected = prev.some((p) => p && p.url === item.url);
      if (isSelected) {
        const next = prev.filter((p) => p.url !== item.url);
        if (model?.url === item.url) {
          setModel(next[next.length - 1] || null);
        }
        return next;
      } else {
        if (prev.length >= 10) {
          alert('You can select a maximum of 10 model poses.');
          return prev;
        }
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

  const handleModelSelect = toggleModelSelection;
  const [prompt, setPrompt] = useState('');
  const [garmentColor, setGarmentColor] = useState('');
  const [isAutoLogoColor, setIsAutoLogoColor] = useState(true);

  useEffect(() => {
    if (isAutoLogoColor && garmentColor) {
      setHdLogoColor(getAutoContrastColor(garmentColor));
    }
  }, [garmentColor, isAutoLogoColor, getAutoContrastColor]);

  /* Model Swap inputs (Slot 1: Kis Model ko change karna hai; Slot 2: Kis Model ke sath change karna hai) */
  interface SwapDraft {
    id: string;
    source: Pick | null;
    target: Pick | null;
    prompt?: string;
  }
  const [swapDrafts, setSwapDrafts] = useState<SwapDraft[]>([
    { id: 'draft-1', source: null, target: null, prompt: '' },
  ]);
  const [activeSwapDraftIndex, setActiveSwapDraftIndex] = useState<number>(0);
  const [swapSource, setSwapSource] = useState<Pick>(null);
  const [swapTarget, setSwapTarget] = useState<Pick>(null);
  const [swapPrompt, setSwapPrompt] = useState('');
  const [swapTab, setSwapTab] = useState<'library' | 'uploads'>('library');
  const [cancellingJob, setCancellingJob] = useState(false);
  const swapSourceInput = useRef<HTMLInputElement>(null);
  const swapTargetInput = useRef<HTMLInputElement>(null);

  function addSwapDraft() {
    if (swapDrafts.length >= 5) return;
    const newIdx = swapDrafts.length;
    setSwapDrafts((prev) => [...prev, { id: `draft-${newIdx + 1}`, source: null, target: null, prompt: '' }]);
    setActiveSwapDraftIndex(newIdx);
    setSwapSource(null);
    setSwapTarget(null);
  }

  function removeSwapDraft(idx: number) {
    setSwapDrafts((prev) => {
      if (prev.length <= 1) {
        setSwapSource(null);
        setSwapTarget(null);
        return [{ id: 'draft-1', source: null, target: null, prompt: '' }];
      }
      const next = prev.filter((_, i) => i !== idx);
      const newActive = Math.min(activeSwapDraftIndex, next.length - 1);
      setActiveSwapDraftIndex(newActive);
      setSwapSource(next[newActive]?.source || null);
      setSwapTarget(next[newActive]?.target || null);
      return next;
    });
  }

  function selectSwapSource(item: Pick | null) {
    setSwapSource(item);
    setSwapDrafts((prev) =>
      prev.map((d, i) => (i === activeSwapDraftIndex ? { ...d, source: item } : d))
    );
  }

  function selectSwapTarget(item: Pick | null) {
    setSwapTarget(item);
    setSwapDrafts((prev) =>
      prev.map((d, i) => (i === activeSwapDraftIndex ? { ...d, target: item } : d))
    );
  }

  function switchSwapDraft(idx: number) {
    setActiveSwapDraftIndex(idx);
    const d = swapDrafts[idx];
    if (d) {
      setSwapSource(d.source);
      setSwapTarget(d.target);
      if (typeof d.prompt === 'string') setSwapPrompt(d.prompt);
    }
  }

  async function handleCancelGeneration() {
    if (!job?.id) return;
    setCancellingJob(true);
    try {
      const res = await api.cancelJob(job.id);
      if (res.refunded && typeof res.refundedCredits === 'number') {
        setUser((prev) => (prev ? { ...prev, credits: prev.credits + res.refundedCredits } : null));
      }
      void api.unlockUser().catch(() => { });
      activePoseIndexRef.current = -1;
      batchPayloadRef.current = null;
      setJob(null);
      setBusy(false);
      generatingRef.current = false;
      setProgress(0);
      setProgressLabel('');
      setError(res.message || 'Generation cancelled and credits refunded.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel generation');
    } finally {
      setCancellingJob(false);
    }
  }

  async function handleDeleteOrCancelPose(idx: number, poseId: string) {
    const targetPose = fivePoseItems[idx];
    if (!targetPose) return;

    // 1. If currently generating on GPU: cancel immediately & refund
    if (targetPose.status === 'generating') {
      if (job?.id) {
        await handleCancelGeneration();
      }
      return;
    }

    // 2. If queued / pending: mark cancelled in ref so backend NEVER receives it
    if (targetPose.status === 'pending') {
      if (batchPayloadRef.current) {
        batchPayloadRef.current.items = batchPayloadRef.current.items.map((item) =>
          item.id === poseId ? { ...item, cancelled: true } : item
        );
      }
    }

    // 3. Remove visually from sequence
    setFivePoseItems((prev) => prev.filter((_, pIdx) => pIdx !== idx));
    if (selectedPoseIndex === idx) {
      setSelectedPoseIndex(Math.max(0, idx - 1));
    }
  }

  function handleCancelRemainingQueue() {
    if (batchPayloadRef.current) {
      batchPayloadRef.current.items = batchPayloadRef.current.items.map((item) => {
        const match = fivePoseItems.find((p) => p.id === item.id);
        if (match && match.status === 'pending') {
          return { ...item, cancelled: true };
        }
        return item;
      });
    }
    setFivePoseItems((prev) => prev.filter((p) => p.status !== 'pending'));
    setProgressLabel('Pending queue cancelled. Remaining poses skipped.');
  }

  /* Photo guidelines interactive tour state */
  const [showPhotoTour, setShowPhotoTour] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [alwaysShowTour, setAlwaysShowTour] = useState(() => {
    return localStorage.getItem('shivnaresh_always_photo_tour') === 'true';
  });
  // Whenever the user opens the website, tour shows on their first cloth upload of the session
  const [tourShownThisSession, setTourShownThisSession] = useState(false);

  useEffect(() => {
    try {
      localStorage.removeItem('shivnaresh_photo_tour_completed');
    } catch {
      // ignore
    }
  }, []);

  const handleInitiateClothUpload = useCallback(() => {
    const isAlways = localStorage.getItem('shivnaresh_always_photo_tour') === 'true';
    if (!tourShownThisSession || isAlways) {
      setTourStep(0);
      setShowPhotoTour(true);
    } else {
      clothInput.current?.click();
    }
  }, [tourShownThisSession]);

  const handleTourProceedToUpload = useCallback(() => {
    setTourShownThisSession(true);
    setShowPhotoTour(false);
    setTimeout(() => {
      clothInput.current?.click();
    }, 60);
  }, []);

  const handleTourDismiss = useCallback(() => {
    setTourShownThisSession(true);
    setShowPhotoTour(false);
  }, []);

  /* Zoom & Macro Crop Download state (Exact 1807×3000 Export) */
  const [showZoomCropModal, setShowZoomCropModal] = useState(false);
  const [zoomCropImage, setZoomCropImage] = useState<string | null>(null);
  const [zoomCropTitle, setZoomCropTitle] = useState('photoshoot-crop');
  const [zoomCropOnUse, setZoomCropOnUse] = useState<((url: string) => void) | null>(null);

  function openZoomCropForGarment(g: ClassifiedGarment | { url: string; preview?: string; name: string }) {
    setZoomCropImage(g.preview ?? g.url);
    setZoomCropTitle(g.name || 'garment-crop');
    setZoomCropOnUse(() => (croppedUrl: string) => {
      setClassifiedGarments((prev) =>
        prev.map((item) => (item.url === g.url ? { ...item, url: croppedUrl, preview: croppedUrl } : item))
      );
      setSelectedClothes((prev) =>
        prev.map((item) => (item.url === g.url ? { ...item, url: croppedUrl, preview: croppedUrl } : item))
      );
      setCloth((prev) => (prev && prev.url === g.url ? { ...prev, url: croppedUrl, preview: croppedUrl } : prev));
    });
    setShowZoomCropModal(true);
  }

  function openZoomCropForModel(item: { url: string; preview?: string; name: string }, idx?: number) {
    setZoomCropImage(item.preview ?? item.url);
    setZoomCropTitle(item.name || 'model-crop');
    setZoomCropOnUse(() => (croppedUrl: string) => {
      setSelectedModels((prev) =>
        prev.map((m, i) => (typeof idx === 'number' ? i === idx : m.url === item.url) ? { ...m, url: croppedUrl, preview: croppedUrl } : m)
      );
      setModel((prev) => (prev && prev.url === item.url ? { ...prev, url: croppedUrl, preview: croppedUrl } : prev));
    });
    setShowZoomCropModal(true);
  }

  /* Edit Render Panel (underneath generated image in result canvas) */
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const [editRefImage, setEditRefImage] = useState<Pick>(null);
  const [isEditingRender, setIsEditingRender] = useState(false);
  const editRefInput = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<'library' | 'uploads' | 'sets'>('library');
  const [job, setJob] = useState<Job | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [videoBusy, setVideoBusy] = useState(false);
  const isGlobalBusy = busy || videoBusy;

  /* Auto-detect high-contrast logo color from background fabric luminance */
  const autoDetectContrastColor = useCallback((imgUrl?: string | null) => {
    const targetUrl = imgUrl || result || userGenerations[0]?.url;
    if (!targetUrl) return;
    try {
      const proxied = getProxiedImageUrl(resolveImageUrl(targetUrl));
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.min(img.naturalWidth || 500, 500);
          canvas.height = Math.min(img.naturalHeight || 500, 500);
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const px = Math.floor((canvas.width * (activeLogoTarget === 'chest' ? hdLogoX : pantLogoX)) / 100);
          const py = Math.floor((canvas.height * (activeLogoTarget === 'chest' ? hdLogoY : pantLogoY)) / 100);
          const pData = ctx.getImageData(Math.max(0, px - 6), Math.max(0, py - 6), 12, 12).data;
          let rTot = 0, gTot = 0, bTot = 0, count = 0;
          for (let i = 0; i < pData.length; i += 4) {
            rTot += pData[i];
            gTot += pData[i + 1];
            bTot += pData[i + 2];
            count++;
          }
          if (count > 0) {
            const lum = 0.2126 * (rTot / count) + 0.7152 * (gTot / count) + 0.0722 * (bTot / count);
            setHdLogoColor(lum > 125 ? '#111111' : '#ffffff');
          }
        } catch {
          // Cross-origin fallback
        }
      };
      img.onerror = () => { };
      img.src = proxied;
    } catch { }
  }, [result, userGenerations, activeLogoTarget, hdLogoX, hdLogoY, pantLogoX, pantLogoY]);

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
      sourceModel?: Pick;
      targetModel?: Pick;
      promptSuffix?: string;
      cancelled?: boolean;
    }>;
  } | null>(null);

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
  const effectiveModels = selectedModels.length > 0 ? selectedModels : (model ? [model] : []);
  // Smart garment role selectors — strictly separated by role
  const bottomGarment: Pick | null = (() => {
    const lower = classifiedGarments.filter((g) => isLowerGarmentRole(g.role, g.name));
    if (lower.length > 0) {
      return { url: lower[0].url, preview: lower[0].preview, name: lower[0].name };
    }
    return null;
  })();

  const topFrontGarment: Pick | null = (() => {
    const upper = classifiedGarments.filter((g) => isUpperGarmentRole(g.role, g.name));
    if (upper.length > 0) {
      const front = upper.find((g) => g.role === 'top-front' || g.role === 'tops-front') || upper[0];
      return { url: front.url, preview: front.preview, name: front.name };
    }
    return null;
  })();

  const topBackGarment: Pick | null = (() => {
    const upper = classifiedGarments.filter((g) => isUpperGarmentRole(g.role, g.name));
    if (upper.length > 0) {
      const back = upper.find((g) => g.role === 'top-back' || g.role === 'tops-back') || upper.find((g) => g.role === 'top-front' || g.role === 'tops-front') || upper[0];
      return { url: back.url, preview: back.preview, name: back.name };
    }
    return null;
  })();
  const hasClassifiedGarments = classifiedGarments.length > 0;
  const multiBatchCount = (mode === 'tryon' && effectiveModels.length > 1)
    ? effectiveModels.length
    : 1;

  const validSwapDrafts = swapDrafts.filter((d) => Boolean(d.source?.url && d.target?.url));

  const totalRequiredCredits = mode === 'swap'
    ? (validSwapDrafts.length > 1 ? validSwapDrafts.length * creditCost : creditCost)
    : (multiBatchCount > 1 ? (multiBatchCount * creditCost) : creditCost);

  const previousGarmentsList = (() => {
    const map = new Map<string, { url: string; name: string; at: number }>();
    uploads.forEach((u) => {
      const isModel = u.kind === 'model' || u.id?.startsWith('model-') || u.url?.includes('model-');
      if (!isModel && !brokenImageUrls.has(u.url)) {
        map.set(u.url, { url: u.url, name: u.name || 'Garment', at: u.at || 0 });
      }
    });
    uploadSets.forEach((s) => {
      if (s.clothUrl && !map.has(s.clothUrl) && !brokenImageUrls.has(s.clothUrl)) {
        map.set(s.clothUrl, { url: s.clothUrl, name: s.clothName || 'Saved Garment', at: s.createdAt || 0 });
      }
    });
    // Sort descending by timestamp: newest / most recently uploaded image is ALWAYS FIRST!
    return Array.from(map.values()).sort((a, b) => (b.at || 0) - (a.at || 0));
  })();

  const previousModelsList = (() => {
    const map = new Map<string, { url: string; name: string; at: number }>();
    uploads.forEach((u) => {
      const isModel = u.kind === 'model' || u.id?.startsWith('model-') || u.url?.includes('model-');
      if (isModel && !brokenImageUrls.has(u.url)) {
        const rawName = u.name || '';
        const cleanName = rawName.replace(/\.[^/.]+$/, '').trim().toLowerCase();
        // Deduplicate identical model poses (e.g. repeated uploads of 01_three-quarter_hand-at-hip)
        const key = cleanName && !/^custom model|model|upload$/i.test(cleanName) ? cleanName : u.url;
        const existing = map.get(key);
        if (!existing || (u.at || 0) > (existing.at || 0)) {
          map.set(key, { url: u.url, name: u.name || 'Custom Model', at: u.at || 0 });
        }
      }
    });
    uploadSets.forEach((s) => {
      if (s.modelUrl && !brokenImageUrls.has(s.modelUrl)) {
        const rawName = s.modelName || '';
        const cleanName = rawName.replace(/\.[^/.]+$/, '').trim().toLowerCase();
        const key = cleanName && !/^custom model|model|upload$/i.test(cleanName) ? cleanName : s.modelUrl;
        const existing = map.get(key);
        if (!existing || (s.createdAt || 0) > (existing.at || 0)) {
          map.set(key, { url: s.modelUrl, name: s.modelName || 'Studio Model', at: s.createdAt || 0 });
        }
      }
    });
    // Sort descending by timestamp: newest / most recently uploaded model is ALWAYS FIRST!
    return Array.from(map.values()).sort((a, b) => (b.at || 0) - (a.at || 0));
  })();

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    // Preload guideline images so first-time upload tour opens instantly with 0 latency
    PHOTO_GUIDE_STEPS.forEach((s) => {
      const img1 = new Image();
      img1.src = s.doImage;
      const img2 = new Image();
      img2.src = s.dontImage;
    });
  }, []);

  const loadUploads = useCallback(async () => {
    try {
      const res = await api.uploads();
      setUploads(res.items);
    } catch {
      /* non-fatal */
    }
  }, []);

  const loadUploadSets = useCallback(async () => {
    setLoadingSets(true);
    try {
      const res = await api.uploadSets();
      const items = res.items || [];
      setUploadSets(items);
      try {
        const light = items.slice(0, 30).map((s) => ({
          ...s,
          clothUrl: s.clothUrl && s.clothUrl.length > 150000 ? '' : s.clothUrl,
          modelUrl: s.modelUrl && s.modelUrl.length > 150000 ? '' : s.modelUrl,
        }));
        localStorage.setItem('cached_upload_sets', JSON.stringify(light));
      } catch { }
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

  const [userDeliveriesCount, setUserDeliveriesCount] = useState<number>(0);

  const loadDeliveriesUnread = useCallback(async () => {
    try {
      const res = await api.getUserDeliveries();
      setDeliveriesUnreadCount(res.unreadCount || 0);
      setUserDeliveriesCount((res.items || []).length);
    } catch {
      /* non-fatal */
    }
  }, []);

  const loadUserGenerations = useCallback(async () => {
    setLoadingGenerations(true);
    try {
      const res = await api.userGenerations();
      const items = (res.items || []).filter((g) => Boolean(getBestGenUrl(g)));
      setUserGenerations((prev) => {
        const itemIds = new Set(items.map((it) => it.id));
        const recentOptimistic = prev.filter(
          (p) => !itemIds.has(p.id) && !p.deleted && !p.isDeleted && Date.now() - (p.createdAt || 0) < 60000 && Boolean(getBestGenUrl(p))
        );
        return [...recentOptimistic, ...items];
      });
      try {
        const light = items.slice(0, 50).map((g) => ({
          ...g,
          url: g.url && g.url.length > 150000 ? '' : g.url,
          highResUrl: g.highResUrl && g.highResUrl.length > 150000 ? '' : g.highResUrl,
        }));
        localStorage.setItem('cached_user_generations', JSON.stringify(light));
      } catch { }
    } catch {
      /* non-fatal */
    } finally {
      setLoadingGenerations(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 0. Pre-fetch archive media immediately in background if session token exists
      if (getToken()) {
        void Promise.allSettled([
          loadUploadSets(),
          loadUserGenerations(),
          loadUploads(),
          loadCustomRequests(),
          loadDeliveriesUnread(),
        ]);
      }

      // 1. Immediately fetch models & studio settings in parallel
      void Promise.allSettled([
        api.studio().catch(() => null),
        api.models().catch(() => ({ categories: [] as ModelCategory[], seasons: [] as string[] })),
      ]).then(([sRes, mRes]) => {
        if (cancelled) return;
        const s = sRes.status === 'fulfilled' ? sRes.value : null;
        const m = mRes.status === 'fulfilled' ? mRes.value : null;
        if (s) {
          setSettings(s);
          setPrompt((prev) => prev || s.defaultPrompt || '');
          if (s.defaultMode) setMode(s.defaultMode as ModeId);
          if (s.defaultModel && m?.categories) {
            const found = m.categories.flatMap((c) => c.items).find((i) => i.id === s.defaultModel);
            if (found) setModel({ url: found.url, name: found.name });
          }
        }
        if (m?.categories && m.categories.length > 0) {
          setCategories(m.categories);
          try {
            localStorage.setItem('cached_studio_models', JSON.stringify(m.categories));
          } catch { }
        }
        if (m && 'seasons' in m && Array.isArray(m.seasons) && m.seasons.length > 0) {
          setAvailableSeasons(m.seasons);
        }
      });

      // 2. Resilient session check with automatic retry for server waking up
      let me: User | null = null;
      let backendReached = false;

      for (let attempt = 0; attempt < 5; attempt += 1) {
        if (cancelled) return;
        try {
          const res = await api.me();
          backendReached = true;
          me = res.user;
          break;
        } catch (e: any) {
          if (e instanceof ApiError && e.status === 401) {
            window.location.replace('/login?next=%2Fdesign');
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 500 : 1200));
        }
      }

      if (cancelled) return;

      if (!backendReached) {
        setError('Studio connecting… Please refresh if it does not load automatically.');
        return;
      }
      if (!me) {
        window.location.replace('/login?next=%2Fdesign');
        return;
      }

      setError('');
      setUser(me);
      try {
        localStorage.setItem('cached_current_user', JSON.stringify(me));
      } catch { }
      void api.unlockUser().catch(() => { });

      // Always default to 1K Standard across all plans (including Ultra)
      setQuality('1k');

      // Secondary panels loaded concurrently
      void Promise.allSettled([
        loadUploads(),
        loadUploadSets(),
        loadCustomRequests(),
        loadDeliveriesUnread(),
        loadUserGenerations(),
      ]);
    })();

    return () => {
      cancelled = true;
    };
  }, [loadUploadSets, loadCustomRequests, loadDeliveriesUnread, loadUserGenerations, loadUploads]);

  /* Poll unread deliveries in background every 15s */
  useEffect(() => {
    const pollTimer = setInterval(() => {
      void loadDeliveriesUnread();
    }, 15000);
    return () => clearInterval(pollTimer);
  }, [loadDeliveriesUnread]);

  /* Poll job */
  useEffect(() => {
    if (!job || job.status === 'completed' || job.status === 'failed') return;

    const timer = setInterval(async () => {
      try {
        const next = await api.job(job.id);

        const isBatchRunning = activePoseIndexRef.current >= 0 && Boolean(batchPayloadRef.current);

        const stage = PROGRESS_STAGES[next.status] || { label: next.status, percent: 30 };
        setProgressLabel(stage.label);

        if (next.status === 'processing') {
          setProgress((prev) => Math.min(92, prev + 2.5));
        } else {
          setProgress(stage.percent);
        }

        if (next.status === 'completed' && next.output?.[0]) {
          const imgUrl = next.output[0];

          if (isBatchRunning && batchPayloadRef.current) {
            const currentIdx = activePoseIndexRef.current;
            const batchCtx = batchPayloadRef.current;
            const currentItem = batchCtx.items[currentIdx];

            // Mark current item completed
            setFivePoseItems((prev) =>
              prev.map((p, idx) => (idx === currentIdx ? { ...p, status: 'completed', url: imgUrl, jobId: next.id } : p))
            );
            setResult(imgUrl);
            setCleanResultBackup(imgUrl);
            setActiveRenderOption('b');
            setShowHdLogoOverlay(true);
            setShowPantLogo(true);
            setIsEraseMode(false);
            autoDetectContrastColor(imgUrl);
            setSelectedPoseIndex(currentIdx);
            const saveBatchGen = async () => {
              const payload = {
                id: next.id,
                jobId: next.id,
                type: 'image' as const,
                url: imgUrl,
                prompt: prompt.trim() || `${currentItem?.name || 'Studio Render'} (${currentIdx + 1}/${batchCtx.total})`,
                resolution: quality,
              };
              try {
                const res = await api.saveUserGeneration(payload);
                if (res) {
                  setUserGenerations((prev) => [res, ...prev.filter((g) => g.id !== res.id && g.url !== imgUrl)]);
                  void loadUserGenerations();
                }
              } catch {
                try {
                  const res = await api.saveUserGeneration(payload);
                  if (res) {
                    setUserGenerations((prev) => [res, ...prev.filter((g) => g.id !== res.id && g.url !== imgUrl)]);
                    void loadUserGenerations();
                  }
                } catch (saveErr) {
                  console.warn('[generations] Auto-save failed after retry:', saveErr);
                }
              }
            };
            void saveBatchGen();

            // Find next uncancelled pending item in batch sequence
            let nextItemIdx = -1;
            for (let i = currentIdx + 1; i < batchCtx.items.length; i++) {
              const candidate = batchCtx.items[i];
              if (!candidate.cancelled) {
                nextItemIdx = i;
                break;
              }
            }

            if (nextItemIdx !== -1) {
              // Advance to next uncancelled item in sequence
              activePoseIndexRef.current = nextItemIdx;
              const nextItem = batchCtx.items[nextItemIdx];
              setFivePoseItems((prev) =>
                prev.map((p, idx) => (idx === nextItemIdx ? { ...p, status: 'generating' } : p))
              );
              setProgress(Math.round(((currentIdx + 1) / batchCtx.total) * 100));
              setProgressLabel(`Completed ${currentIdx + 1}/${batchCtx.total}! Cooling down 2s before ${nextItem.name}…`);

              // Delay between consecutive batch requests to eliminate 409 concurrency lock collision
              await new Promise((resolve) => setTimeout(resolve, 2000));

              // Check if cancelled during the delay
              if (!batchPayloadRef.current || batchPayloadRef.current.items[nextItemIdx]?.cancelled) {
                activePoseIndexRef.current = -1;
                batchPayloadRef.current = null;
                setBusy(false);
                generatingRef.current = false;
                setJob(next);
                return;
              }

              const nextIsBack = /back|rear|behind|reverse|peche|dorsal/i.test(`${nextItem.model?.name || ''} ${nextItem.model?.url || ''} ${nextItem.promptSuffix || ''}`);

              const nextPayload: Record<string, unknown> = {
                ...batchCtx.payload,
                poseAngle: nextIsBack ? 'back' : 'front',
                ...(nextItem.model?.url ? { model: nextItem.model.url } : {}),
                ...(tryOnTarget === 'both' ? (
                  (bottomGarment?.url && (topFrontGarment?.url || cloth?.url)) ? {
                    mode: 'outfit',
                    topCloth: (nextIsBack && topBackGarment?.url) ? topBackGarment.url : (topFrontGarment?.url || cloth?.url),
                    bottomCloth: bottomGarment.url,
                    category: 'one-pieces',
                  } : bottomGarment?.url ? {
                    mode: 'tryon',
                    cloth: bottomGarment.url,
                    source: bottomGarment.url,
                    category: 'bottoms',
                  } : {
                    mode: 'tryon',
                    cloth: (nextIsBack && topBackGarment?.url) ? topBackGarment.url : (topFrontGarment?.url || cloth?.url),
                    source: (nextIsBack && topBackGarment?.url) ? topBackGarment.url : (topFrontGarment?.url || cloth?.url),
                    category: 'tops',
                  }
                ) : tryOnTarget === 'lower' ? {
                  mode: 'tryon',
                  category: 'bottoms',
                  cloth: bottomGarment?.url || nextItem.cloth?.url || cloth?.url,
                  source: bottomGarment?.url || nextItem.cloth?.url || cloth?.url,
                } : {
                  mode: 'tryon',
                  category: 'tops',
                  cloth: (nextIsBack && topBackGarment?.url) ? topBackGarment.url : (topFrontGarment?.url || nextItem.cloth?.url || cloth?.url),
                  source: (nextIsBack && topBackGarment?.url) ? topBackGarment.url : (topFrontGarment?.url || nextItem.cloth?.url || cloth?.url),
                }),
                ...(nextItem.sourceModel?.url ? { sourceModel: nextItem.sourceModel.url, source: nextItem.sourceModel.url } : {}),
                ...(nextItem.targetModel?.url ? { targetModel: nextItem.targetModel.url, model: nextItem.targetModel.url } : {}),
              };
              nextPayload.prompt = `${batchCtx.basePrompt} ${nextItem.promptSuffix || ''}`.trim();

              // Resilient launch with auto-unlock and up to 3 retries
              let nextRes: { id: string; credits?: number } | null = null;
              let lastErr: unknown = null;
              for (let attempt = 0; attempt < 3; attempt++) {
                try {
                  await api.unlockUser().catch(() => { });
                  const genRes = await api.generate(nextPayload);
                  if (genRes && genRes.id) {
                    nextRes = genRes;
                    break;
                  }
                } catch (err: unknown) {
                  lastErr = err;
                  console.warn(`[Batch] Attempt ${attempt + 1} for ${nextItem.name} failed:`, err);
                  if (attempt < 2) {
                    await new Promise((r) => setTimeout(r, 2000));
                  }
                }
              }

              if (nextRes && nextRes.id) {
                if (typeof nextRes.credits === 'number') {
                  setUser((prev) => (prev ? { ...prev, credits: nextRes.credits! } : null));
                }
                setJob({ id: nextRes.id, status: 'starting' });
              } else {
                const errMsg = lastErr instanceof Error ? lastErr.message : 'Error starting next render in sequence';
                setError(`Pose ${nextItem.name} failed: ${errMsg}`);
                void api.reportClientError({ title: 'Batch Render Sequence Error', message: errMsg, details: lastErr });
                setFivePoseItems((prev) =>
                  prev.map((p, idx) => (idx === nextItemIdx ? { ...p, status: 'failed' } : p))
                );

                // Check for subsequent uncancelled item in batch sequence
                let subIdx = -1;
                for (let i = nextItemIdx + 1; i < batchCtx.items.length; i++) {
                  if (!batchCtx.items[i].cancelled) {
                    subIdx = i;
                    break;
                  }
                }
                if (subIdx !== -1) {
                  activePoseIndexRef.current = subIdx;
                  setJob({ id: job.id, status: 'processing' });
                } else {
                  activePoseIndexRef.current = -1;
                  batchPayloadRef.current = null;
                  setBusy(false);
                  generatingRef.current = false;
                  setJob(next);
                }
              }
            } else {
              // All active/uncancelled items finished
              const totalDone = batchCtx.items.filter((it) => !it.cancelled).length;
              activePoseIndexRef.current = -1;
              batchPayloadRef.current = null;
              setProgress(100);
              setProgressLabel(`Batch Finished! Generated ${totalDone} active poses (cancelled poses skipped).`);
              setBusy(false);
              generatingRef.current = false;
              setJob(next);
              sendDesktopNotification(
                `Batch Finished`,
                `All active fashion renders are ready in your studio.`,
                imgUrl
              );
            }
          } else {
            // Standard single generation
            setJob(next);
            setResult(imgUrl);
            setCleanResultBackup(imgUrl);
            setActiveRenderOption('b');
            setShowHdLogoOverlay(true);
            setShowPantLogo(true);
            setIsEraseMode(false);
            autoDetectContrastColor(imgUrl);
            const activeSingleModel = model || effectiveModels[0];
            setFivePoseItems((prev) =>
              prev.length > 0
                ? prev.map((p, idx) => (idx === 0 ? { ...p, status: 'completed', url: imgUrl, jobId: next.id } : p))
                : [{
                  id: 'pose-1',
                  name: activeSingleModel?.name || 'Model Pose 1',
                  angle: tryOnTarget === 'both' ? 'Full Outfit' : tryOnTarget === 'lower' ? 'Lower (Pants)' : 'Upper Only',
                  icon: '👕',
                  promptSuffix: '',
                  model: activeSingleModel,
                  status: 'completed',
                  url: imgUrl,
                  jobId: next.id,
                }]
            );
            setProgress(100);
            setProgressLabel('Complete!');
            setBusy(false);
            generatingRef.current = false;
            const wasEdit = isEditingRender;
            setIsEditingRender(false);
            sendDesktopNotification('Render Complete', wasEdit ? 'Your edited sportswear render is ready.' : 'Your virtual try-on render is ready.', imgUrl);
            const saveSingleGen = async () => {
              const payload = {
                id: next.id,
                jobId: next.id,
                type: 'image' as const,
                isEdited: wasEdit,
                url: imgUrl,
                prompt: wasEdit ? (editPrompt.trim() || 'Studio Sportswear Edit') : (prompt.trim() || (mode === 'swap' ? 'Model Swap' : 'Virtual Try-On')),
                resolution: quality,
              };
              try {
                const res = await api.saveUserGeneration(payload);
                if (res) {
                  setUserGenerations((prev) => [{ ...res, isEdited: wasEdit || res.isEdited }, ...prev.filter((g) => g.id !== res.id && g.url !== imgUrl)]);
                  void loadUserGenerations();
                }
              } catch {
                try {
                  const res = await api.saveUserGeneration(payload);
                  if (res) {
                    setUserGenerations((prev) => [{ ...res, isEdited: wasEdit || res.isEdited }, ...prev.filter((g) => g.id !== res.id && g.url !== imgUrl)]);
                    void loadUserGenerations();
                  }
                } catch (saveErr) {
                  console.warn('[generations] Auto-save failed after retry:', saveErr);
                }
              }
            };
            void saveSingleGen();
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

      let completed = 0;
      const orderedPicks: Array<{ url: string; preview: string; name: string } | null> = Array(fileArr.length).fill(null);

      const processOne = async (file: File, i: number) => {
        try {
          // Fast standardized compression: preserves natural portrait aspect ratio for models
          const standardized = await prepareAndStandardizeImage(file, kind);
          const uploaded = await api.upload(standardized.dataUrl, kind, standardized.name);
          completed++;
          setUploadProgress({ current: completed, total: fileArr.length, kind });
          orderedPicks[i] = {
            url: uploaded.url,
            preview: standardized.dataUrl || uploaded.preview || uploaded.url,
            name: file.name,
          };
        } catch (err) {
          console.warn(`[upload] Error uploading ${file.name}:`, err);
        }
      };

      let workerIdx = 0;
      const workers = Array(Math.min(4, fileArr.length)).fill(0).map(async () => {
        while (workerIdx < fileArr.length) {
          const idx = workerIdx++;
          await processOne(fileArr[idx], idx);
        }
      });
      await Promise.all(workers);

      const successfulPicks = orderedPicks.filter(Boolean) as Array<{ url: string; preview: string; name: string }>;
      if (successfulPicks.length === 0) {
        throw new Error('Could not upload selected images. Please check file formats and try again.');
      }

      // Prepend all successful uploads immediately to uploads state
      const newUploadItems = successfulPicks.map((p) => ({
        id: p.url,
        name: p.name,
        url: p.url,
        kind,
        at: Date.now(),
      }));
      setUploads((prev) => [
        ...newUploadItems,
        ...prev.filter((item) => !successfulPicks.some((p) => p.url === item.url)),
      ]);

      if (kind === 'cloth') {
        successfulPicks.forEach((pick, i) => {
          const heuristicRole = classifyGarmentByHeuristic(pick.name);
          let assignedRole = heuristicRole;
          if (heuristicRole === 'top-front' && successfulPicks.length > 1) {
            const batchAngleRoles: GarmentRole[] = ['top-front', 'top-back', 'logo', 'left-sleeve', 'right-sleeve', 'bottom'];
            assignedRole = batchAngleRoles[i] || 'top-front';
          }
          addClassifiedGarment(pick, assignedRole);
        });

        setSelectedClothes((prev) => {
          const existingUrls = new Set(prev.map((p) => p?.url));
          const additions = successfulPicks.filter((p) => !existingUrls.has(p.url));
          return [...prev, ...additions];
        });

        if (successfulPicks[0]) {
          setCloth(successfulPicks[0]);
        }
      } else {
        // Models: Deterministically set all uploaded models in the exact order selected!
        setSelectedModels((prev) => {
          if (successfulPicks.length >= 2) {
            // User uploaded a multi-pose collection (e.g. 5 poses): preserve all 5 in exact order!
            return successfulPicks.slice(0, 10);
          }
          const existingUrls = new Set(prev.map((p) => p?.url));
          const additions = successfulPicks.filter((p) => !existingUrls.has(p.url));
          return [...prev, ...additions].slice(0, 10);
        });

        // Set the very first model (e.g. 01_three-quarter_hand-at-hip) as the active model
        if (successfulPicks[0]) {
          setModel(successfulPicks[0]);
        }
        setTab('uploads');
      }

      await loadUploads();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload failed';
      setError(msg);
      void api.reportClientError({ title: 'Design Image Upload Error', message: msg, details: e });
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }



  /* Helper: composite 100% vector-sharp Shiv-Naresh brand logo stamp onto canvas */
  async function stampHdLogoOntoImage(
    baseImgUrl: string,
    options?: {
      color?: string;
      scale?: number;
      x?: number;
      y?: number;
      customLogo?: string | null;
      includePantLogo?: boolean;
      pantX?: number;
      pantY?: number;
      pantScale?: number;
      targetWidth?: number;
      targetHeight?: number;
    }
  ): Promise<string> {
    const color = options?.color || hdLogoColor || '#ffffff';
    const scale = options?.scale ?? hdLogoScale;
    const x = options?.x ?? hdLogoX;
    const y = options?.y ?? hdLogoY;
    const activeCustom = options?.customLogo !== undefined ? options.customLogo : customLogoUrl;
    const stampPant = options?.includePantLogo !== undefined ? options.includePantLogo : showPantLogo;
    const pX = options?.pantX ?? pantLogoX;
    const pY = options?.pantY ?? pantLogoY;
    const pScale = options?.pantScale ?? pantLogoScale;

    const resolvedBaseUrl = getProxiedImageUrl(resolveImageUrl(baseImgUrl));
    const baseImg = new Image();
    baseImg.crossOrigin = 'anonymous';
    try {
      await new Promise<void>((resolve, reject) => {
        baseImg.onload = () => resolve();
        baseImg.onerror = () => reject(new Error('CORS image load failed'));
        baseImg.src = resolvedBaseUrl;
      });
    } catch {
      try {
        const res = await fetch(resolvedBaseUrl);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        await new Promise<void>((resolve, reject) => {
          baseImg.onload = () => resolve();
          baseImg.onerror = () => reject(new Error('Failed to load base image from blob'));
          baseImg.src = blobUrl;
        });
        setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
      } catch {
        try {
          const directProxy = `/api/proxy-image?url=${encodeURIComponent(baseImgUrl)}`;
          const pRes = await fetch(directProxy);
          const pBlob = await pRes.blob();
          const pBlobUrl = URL.createObjectURL(pBlob);
          await new Promise<void>((resolve, reject) => {
            baseImg.onload = () => resolve();
            baseImg.onerror = () => reject(new Error('Failed to load image via fallback proxy'));
            baseImg.src = pBlobUrl;
          });
          setTimeout(() => URL.revokeObjectURL(pBlobUrl), 3000);
        } catch {
          baseImg.removeAttribute('crossorigin');
          await new Promise<void>((resolve, reject) => {
            baseImg.onload = () => resolve();
            baseImg.onerror = () => reject(new Error('Failed to load base image'));
            baseImg.src = resolvedBaseUrl;
          });
        }
      }
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return baseImgUrl;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (options?.targetWidth && options?.targetHeight) {
      canvas.width = options.targetWidth;
      canvas.height = options.targetHeight;
      const srcW = baseImg.naturalWidth || 1024;
      const srcH = baseImg.naturalHeight || 1024;
      const sRatio = Math.max(canvas.width / srcW, canvas.height / srcH);
      const renderW = Math.round(srcW * sRatio);
      const renderH = Math.round(srcH * sRatio);
      const offX = Math.round((canvas.width - renderW) / 2);
      const offY = Math.round((canvas.height - renderH) / 2);
      ctx.drawImage(baseImg, offX, offY, renderW, renderH);
    } else {
      // High-res vector stamping: if base image is low-res, scale canvas proportionally (at least 1800px width)
      // so vector logo paths render with razor-sharp micro detail without pixelation when zooming
      const rawW = baseImg.naturalWidth || 1024;
      const rawH = baseImg.naturalHeight || 1024;
      const scaleFactor = Math.max(1, Math.min(4, Math.ceil(1800 / rawW)));
      canvas.width = rawW * scaleFactor;
      canvas.height = rawH * scaleFactor;
      ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);
    }

    // Get displayed width of preview image on screen to calculate exact 1:1 physical scale
    const dispRect = getImageElementRect();
    const imgElem = document.getElementById('rendered-main-img') as HTMLImageElement | null;
    const dispW = Math.max(260, dispRect?.width || imgElem?.clientWidth || 380);

    // Direct proportional scale matching on-screen preview 1:1 (supports ultra-small minimum logos)
    const chestRatio = Math.max(0.005, Math.min(0.60, scale / dispW));
    const pantRatio = Math.max(0.005, Math.min(0.60, pScale / dispW));

    const logoImg = new Image();
    logoImg.crossOrigin = 'anonymous';

    let blobUrl = '';
    if (activeCustom) {
      logoImg.src = activeCustom;
    } else {
      const cleanColor = color.replace(/[<>"'&]/g, '');
      const yStart = hdLogoCurveDirection === 'left' ? 188 : hdLogoCurveDirection === 'right' ? 180 : 185;
      const yMid = 185 - Math.max(0, hdLogoCurvature);
      const yEnd = hdLogoCurveDirection === 'left' ? 180 : hdLogoCurveDirection === 'right' ? 188 : 185;
      const emblemRot = hdLogoCurveDirection === 'left' ? -2.5 : hdLogoCurveDirection === 'right' ? +1.5 : -0.8;
      const svgMarkup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 210" width="1440" height="840">
        <defs>
          <path id="sn-curve-arc" d="M 28,${yStart} Q 180,${yMid} 332,${yEnd}" fill="none" />
        </defs>
        <g transform="translate(14, 15) rotate(${emblemRot}, 180, 60)">
          <path fill="${cleanColor}" d="M 70 2 L 66 3 L 60 6 L 55 10 L 50 15 L 47 19 L 45 22 L 42 28 L 41 31 L 41 38 L 43 41 L 46 43 L 49 43 L 51 42 L 52 39 L 54 37 L 58 37 L 60 39 L 60 42 L 59 44 L 56 47 L 56 50 L 59 53 L 61 53 L 63 52 L 65 51 L 67 49 L 73 46 L 76 45 L 79 46 L 81 47 L 83 49 L 83 50 L 86 53 L 87 55 L 87 64 L 86 67 L 85 70 L 82 75 L 74 83 L 71 85 L 67 87 L 61 90 L 54 93 L 49 95 L 33 100 L 19 103 L 12 105 L 9 106 L 6 107 L 4 108 L 4 113 L 35 113 L 39 112 L 46 110 L 56 107 L 62 105 L 71 102 L 79 99 L 97 92 L 106 87 L 111 86 L 122 80 L 142 71 L 151 67 L 158 64 L 170 59 L 175 57 L 180 55 L 196 49 L 200 48 L 211 48 L 214 49 L 220 52 L 223 54 L 230 60 L 238 65 L 243 68 L 250 72 L 256 75 L 266 80 L 269 81 L 272 82 L 277 82 L 281 83 L 285 84 L 290 86 L 298 90 L 318 102 L 320 103 L 322 104 L 329 104 L 329 99 L 327 95 L 322 91 L 314 87 L 307 82 L 300 76 L 293 71 L 290 70 L 283 64 L 276 60 L 274 60 L 271 58 L 267 55 L 262 51 L 261 50 L 257 46 L 253 41 L 251 38 L 249 35 L 248 33 L 246 28 L 245 25 L 246 19 L 287 19 L 297 18 L 298 17 L 305 17 L 307 14 L 308 12 L 308 9 L 306 9 L 302 11 L 294 12 L 257 12 L 246 10 L 241 8 L 225 5 L 217 4 L 201 4 L 192 5 L 179 7 L 166 10 L 158 11 L 140 11 L 130 10 L 122 9 L 102 6 L 89 3 L 79 2 Z" />
        </g>
        <text font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="35" font-weight="900" letter-spacing="4" fill="${cleanColor}">
          <textPath href="#sn-curve-arc" startOffset="50%" text-anchor="middle">SHIV-NARESH</textPath>
        </text>
      </svg>`;
      const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
      blobUrl = URL.createObjectURL(blob);
      logoImg.src = blobUrl;
    }

    try {
      await new Promise<void>((resolve, reject) => {
        logoImg.onload = () => resolve();
        logoImg.onerror = () => reject(new Error('Failed to load logo image'));
      });
    } catch {
      if (!activeCustom) {
        logoImg.src = '/brand-logo-2k-white.png';
        await new Promise<void>((resolve, reject) => {
          logoImg.onload = () => resolve();
          logoImg.onerror = () => reject(new Error('Failed to load raster logo'));
        });
      }
    }

    // 1. Stamp Chest Logo (if enabled)
    if (showHdLogoOverlay) {
      const logoW = Math.round(canvas.width * chestRatio);
      const logoH = Math.round((logoW * 210) / 360);
      const centerX = (canvas.width * x) / 100;
      const centerY = (canvas.height * y) / 100;
      const angleRad = (hdLogoAngle * Math.PI) / 180;

      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(angleRad);
      ctx.scale(hdLogoPerspective, 1.0);
      ctx.globalAlpha = 0.96;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.42)';
      ctx.shadowBlur = Math.max(1, Math.round(logoW * 0.025));
      ctx.shadowOffsetY = Math.max(1, Math.round(logoW * 0.015));
      ctx.drawImage(logoImg, -logoW / 2, -logoH / 2, logoW, logoH);
      ctx.restore();
    }

    // 2. Stamp Pant Thigh Logo (if enabled)
    if (stampPant) {
      const pLogoW = Math.round(canvas.width * pantRatio);
      const pLogoH = Math.round((pLogoW * 210) / 360);
      const pCenterX = (canvas.width * pX) / 100;
      const pCenterY = (canvas.height * pY) / 100;
      const pAngleRad = (pantLogoAngle * Math.PI) / 180;

      ctx.save();
      ctx.translate(pCenterX, pCenterY);
      ctx.rotate(pAngleRad);
      ctx.scale(pantLogoPerspective, 1.0);
      ctx.globalAlpha = 0.96;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.42)';
      ctx.shadowBlur = Math.max(1, Math.round(pLogoW * 0.025));
      ctx.shadowOffsetY = Math.max(1, Math.round(pLogoW * 0.015));
      ctx.drawImage(logoImg, -pLogoW / 2, -pLogoH / 2, pLogoW, pLogoH);
      ctx.restore();
    }

    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
    }

    try {
      try {
        const webp = canvas.toDataURL('image/webp', 0.85);
        if (webp && webp.startsWith('data:image/webp') && webp.length > 100) return webp;
      } catch { }
      return canvas.toDataURL('image/jpeg', 0.85);
    } catch (exportErr) {
      console.warn('[stampHdLogoOntoImage] Canvas export failed, returning base url:', exportErr);
      return baseImgUrl;
    }
  }

  const [isBatchBranding, setIsBatchBranding] = useState(false);
  const [batchBrandProgress, setBatchBrandProgress] = useState<{ current: number; total: number } | null>(null);

  async function handleBatchAddLogo(targetGens: UserGeneration[]) {
    if (!targetGens || targetGens.length === 0) return;
    const ok = window.confirm(
      `Apply crisp HD Vector Shiv-Naresh branding to ${targetGens.length} image${targetGens.length > 1 ? 's' : ''} in high resolution (1807×3000)?\n\nBranded images will be permanently saved to My Sets with the EDITED badge.`
    );
    if (!ok) return;

    setIsBatchBranding(true);
    setBatchBrandProgress({ current: 0, total: targetGens.length });

    let completed = 0;
    try {
      for (const gen of targetGens) {
        const rawUrl = getBestGenUrl(gen);
        if (!rawUrl) continue;
        try {
          const stampedDataUrl = await stampHdLogoOntoImage(rawUrl, {
            targetWidth: 1807,
            targetHeight: 3000,
          });

          const newGenId = `sn-hd-${gen.id.slice(0, 8)}-${Date.now()}`;
          const savePayload = {
            id: newGenId,
            jobId: gen.jobId || gen.id,
            type: 'image' as const,
            isEdited: true,
            isNewSnapshot: true,
            url: stampedDataUrl,
            prompt: `${gen.prompt || 'Studio Sportswear'} [Option B HD Vector Brand]`,
            resolution: '1807x3000',
          };

          await api.saveUserGeneration(savePayload);
        } catch (itemErr) {
          console.warn(`[Batch Brand] Error for gen ${gen.id}:`, itemErr);
        }
        completed++;
        setBatchBrandProgress({ current: completed, total: targetGens.length });
      }

      await loadUserGenerations();
      alert(`✅ HD Vector Branding successfully applied to ${completed} image${completed > 1 ? 's' : ''}! They are now available in My Sets.`);
    } catch (err: any) {
      alert('Batch branding error: ' + (err?.message || err));
    } finally {
      setIsBatchBranding(false);
      setBatchBrandProgress(null);
    }
  }

  /* Helper: inpaint and seamlessly erase unwanted AI logo / artifact while preserving natural background fabric and crease lines */
  async function inpaintEraseArea(
    baseImgUrl: string,
    box: { x: number; y: number; width: number; height: number },
    mode: 'erase_logo' | 'repair_seam' = 'erase_logo',
    strokes?: RubStroke[],
    brushRadiusPx?: number
  ): Promise<{ url: string; detected?: { x: number; y: number; scale: number } }> {
    const resolvedUrl = getProxiedImageUrl(resolveImageUrl(baseImgUrl));

    // Always convert to data URL first — remote URLs cause canvas CORS taint on getImageData()
    let safeUrl = resolvedUrl;
    if (!resolvedUrl.startsWith('data:')) {
      try {
        const resp = await fetch(resolvedUrl, { mode: 'cors' });
        const blob = await resp.blob();
        safeUrl = await new Promise<string>((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result as string);
          reader.onerror = rej;
          reader.readAsDataURL(blob);
        });
      } catch {
        // shortcut: if fetch fails (blocked CORS), canvas taint will prevent getImageData; falls through
        safeUrl = resolvedUrl;
      }
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('Image load failed: ' + safeUrl.slice(0, 60)));
      img.src = safeUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 1024;
    canvas.height = img.naturalHeight || 1024;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Could not get 2d canvas context');

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Convert percentage coordinates to canvas coordinates
    const bx = Math.max(0, Math.min(canvas.width - 2, Math.round((box.x / 100) * canvas.width)));
    const by = Math.max(0, Math.min(canvas.height - 2, Math.round((box.y / 100) * canvas.height)));
    const bw = Math.max(2, Math.min(canvas.width - bx, Math.round((box.width / 100) * canvas.width)));
    const bh = Math.max(2, Math.min(canvas.height - by, Math.round((box.height / 100) * canvas.height)));

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    const w = canvas.width;
    const h = canvas.height;

    const getPixel = (px: number, py: number) => {
      const cx = Math.max(0, Math.min(w - 1, px));
      const cy = Math.max(0, Math.min(h - 1, py));
      const idx = (cy * w + cx) * 4;
      return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
    };

    // 1. Sample clean 2-pixel perimeter borders outside the box (Top, Bottom, Left, Right)
    // to build exact Dirichlet boundary conditions with gradient preservation
    const topBorder: number[][] = [];
    const botBorder: number[][] = [];
    const leftBorder: number[][] = [];
    const rightBorder: number[][] = [];

    const allBorderSamples: number[][] = [];
    for (let c = 0; c < bw; c++) {
      const p1 = getPixel(bx + c, by - 1);
      const p2 = getPixel(bx + c, by - 2);
      const avg = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, (p1[2] + p2[2]) / 2];
      topBorder.push(avg);
      allBorderSamples.push(avg);

      const pb1 = getPixel(bx + c, by + bh);
      const pb2 = getPixel(bx + c, by + bh + 1);
      const avgB = [(pb1[0] + pb2[0]) / 2, (pb1[1] + pb2[1]) / 2, (pb1[2] + pb2[2]) / 2];
      botBorder.push(avgB);
      allBorderSamples.push(avgB);
    }

    for (let r = 0; r < bh; r++) {
      const pl1 = getPixel(bx - 1, by + r);
      const pl2 = getPixel(bx - 2, by + r);
      const avgL = [(pl1[0] + pl2[0]) / 2, (pl1[1] + pl2[1]) / 2, (pl1[2] + pl2[2]) / 2];
      leftBorder.push(avgL);
      allBorderSamples.push(avgL);

      const pr1 = getPixel(bx + bw, by + r);
      const pr2 = getPixel(bx + bw + 1, by + r);
      const avgR = [(pr1[0] + pr2[0]) / 2, (pr1[1] + pr2[1]) / 2, (pr1[2] + pr2[2]) / 2];
      rightBorder.push(avgR);
      allBorderSamples.push(avgR);
    }

    if (allBorderSamples.length === 0) return { url: canvas.toDataURL('image/png') };

    // 1. Dominant garment fabric color estimation via 16-bin quantization clustering
    // Correctly isolates true garment fabric even when borders touch the model's skin, hands, or gray studio background
    const binCounts = new Map<string, { count: number; samples: number[][] }>();
    for (const p of allBorderSamples) {
      const key = `${Math.floor(p[0] / 16)}_${Math.floor(p[1] / 16)}_${Math.floor(p[2] / 16)}`;
      let entry = binCounts.get(key);
      if (!entry) {
        entry = { count: 0, samples: [] };
        binCounts.set(key, entry);
      }
      entry.count++;
      entry.samples.push(p);
    }

    let dominantBinSamples = allBorderSamples;
    let maxBinCount = 0;
    for (const entry of binCounts.values()) {
      if (entry.count > maxBinCount) {
        maxBinCount = entry.count;
        dominantBinSamples = entry.samples;
      }
    }

    // Compute median of dominant garment fabric cluster
    const fabricRList = dominantBinSamples.map((p) => p[0]).sort((a, b) => a - b);
    const fabricGList = dominantBinSamples.map((p) => p[1]).sort((a, b) => a - b);
    const fabricBList = dominantBinSamples.map((p) => p[2]).sort((a, b) => a - b);
    const midIdx = Math.floor(dominantBinSamples.length / 2);
    const medFabricR = fabricRList[midIdx];
    const medFabricG = fabricGList[midIdx];
    const medFabricB = fabricBList[midIdx];
    const dominantFabric = [medFabricR, medFabricG, medFabricB];

    // Compute standard deviation of dominant cluster
    const clusterDists = dominantBinSamples.map((p) => Math.hypot(p[0] - medFabricR, p[1] - medFabricG, p[2] - medFabricB)).sort((a, b) => a - b);
    const fabricStd = Math.max(2.0, clusterDists[Math.floor(clusterDists.length / 2)] || 2.0);
    // Strict outlier cutoff: any border point > max(16, 2.5 * fabricStd) is non-fabric (background wall, hand/skin, zipper)
    const outlierThreshold = Math.max(16, fabricStd * 2.5);

    // Sanitize borders: replace non-fabric points with clean garment fabric
    const sanitizeBorder = (arr: number[][]) => {
      for (let i = 0; i < arr.length; i++) {
        const dist = Math.hypot(arr[i][0] - medFabricR, arr[i][1] - medFabricG, arr[i][2] - medFabricB);
        if (dist > outlierThreshold) {
          let cleanNeighbor: number[] | null = null;
          for (let offset = 1; offset < arr.length; offset++) {
            if (i - offset >= 0 && Math.hypot(arr[i - offset][0] - medFabricR, arr[i - offset][1] - medFabricG, arr[i - offset][2] - medFabricB) <= outlierThreshold) {
              cleanNeighbor = arr[i - offset];
              break;
            }
            if (i + offset < arr.length && Math.hypot(arr[i + offset][0] - medFabricR, arr[i + offset][1] - medFabricG, arr[i + offset][2] - medFabricB) <= outlierThreshold) {
              cleanNeighbor = arr[i + offset];
              break;
            }
          }
          arr[i] = [...(cleanNeighbor || dominantFabric)];
        }
      }
    };
    sanitizeBorder(topBorder);
    sanitizeBorder(botBorder);
    sanitizeBorder(leftBorder);
    sanitizeBorder(rightBorder);

    // Compute corners for Coons Patch bilinear blend
    const TL = [(topBorder[0][0] + leftBorder[0][0]) / 2, (topBorder[0][1] + leftBorder[0][1]) / 2, (topBorder[0][2] + leftBorder[0][2]) / 2];
    const TR = [(topBorder[bw - 1][0] + rightBorder[0][0]) / 2, (topBorder[bw - 1][1] + rightBorder[0][1]) / 2, (topBorder[bw - 1][2] + rightBorder[0][2]) / 2];
    const BL = [(botBorder[0][0] + leftBorder[bh - 1][0]) / 2, (botBorder[0][1] + leftBorder[bh - 1][1]) / 2, (botBorder[0][2] + leftBorder[bh - 1][2]) / 2];
    const BR = [(botBorder[bw - 1][0] + rightBorder[bh - 1][0]) / 2, (botBorder[bw - 1][1] + rightBorder[bh - 1][1]) / 2, (botBorder[bw - 1][2] + rightBorder[bh - 1][2]) / 2];

    const lums = allBorderSamples.map((p) => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]).sort((a, b) => a - b);
    const medLum = lums[Math.floor(lums.length / 2)];

    // 2. Coons Patch Harmonic Inpaint: Bilinear boundary interpolation
    // Guarantees C^0 continuity on all 4 boundaries with zero directional streaks
    const bufR = new Float32Array(bw * bh);
    const bufG = new Float32Array(bw * bh);
    const bufB = new Float32Array(bw * bh);

    for (let r = 0; r < bh; r++) {
      const v = bh > 1 ? r / (bh - 1) : 0.5;
      const leftP = leftBorder[r];
      const rightP = rightBorder[r];

      for (let c = 0; c < bw; c++) {
        const u = bw > 1 ? c / (bw - 1) : 0.5;
        const topP = topBorder[c];
        const botP = botBorder[c];
        const idx = r * bw + c;

        for (let ch = 0; ch < 3; ch++) {
          const vertVal = (1 - v) * topP[ch] + v * botP[ch];
          const horizVal = (1 - u) * leftP[ch] + u * rightP[ch];
          const cornerVal = (1 - u) * (1 - v) * TL[ch] + u * (1 - v) * TR[ch] + (1 - u) * v * BL[ch] + u * v * BR[ch];
          const val = vertVal + horizVal - cornerVal;
          if (ch === 0) bufR[idx] = val;
          else if (ch === 1) bufG[idx] = val;
          else bufB[idx] = val;
        }
      }
    }

    // 3. Dirichlet Laplace Relaxation (20 iterations) to blend subtle fabric folds & tension lines
    for (let iter = 0; iter < 20; iter++) {
      for (let r = 0; r < bh; r++) {
        for (let c = 0; c < bw; c++) {
          const idx = r * bw + c;
          const topR = r > 0 ? bufR[idx - bw] : topBorder[c][0];
          const botR = r < bh - 1 ? bufR[idx + bw] : botBorder[c][0];
          const leftR = c > 0 ? bufR[idx - 1] : leftBorder[r][0];
          const rightR = c < bw - 1 ? bufR[idx + 1] : rightBorder[r][0];

          const topG = r > 0 ? bufG[idx - bw] : topBorder[c][1];
          const botG = r < bh - 1 ? bufG[idx + bw] : botBorder[c][1];
          const leftG = c > 0 ? bufG[idx - 1] : leftBorder[r][1];
          const rightG = c < bw - 1 ? bufG[idx + 1] : rightBorder[r][1];

          const topB = r > 0 ? bufB[idx - bw] : topBorder[c][2];
          const botB = r < bh - 1 ? bufB[idx + bw] : botBorder[c][2];
          const leftB = c > 0 ? bufB[idx - 1] : leftBorder[r][2];
          const rightB = c < bw - 1 ? bufB[idx + 1] : rightBorder[r][2];

          bufR[idx] = 0.25 * (topR + botR + leftR + rightR);
          bufG[idx] = 0.25 * (topG + botG + leftG + rightG);
          bufB[idx] = 0.25 * (topB + botB + leftB + rightB);
        }
      }
    }

    // Check whether user rubbed strokes (Brush mode) or drew a tight box (Canva Area mode)
    const hasRubStrokes = Boolean(strokes && strokes.length > 0);

    const getBorderLum = (p: number[]) => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
    const topLums = topBorder.map(getBorderLum);
    const botLums = botBorder.map(getBorderLum);

    let detectedSpec: { x: number; y: number; scale: number } | undefined;

    if (mode === 'repair_seam') {
      // 4A. REPAIR SEAM MODE: Reconnect and restore vertical crease line through a blurred gap
      for (let r = 0; r < bh; r++) {
        const v = bh > 1 ? r / (bh - 1) : 0.5;
        for (let c = 0; c < bw; c++) {
          const pixelIdx = ((by + r) * w + (bx + c)) * 4;
          const topSeamOffset = topLums[c] - medLum;
          const botSeamOffset = botLums[c] - medLum;
          const seamOffset = (1 - v) * topSeamOffset + v * botSeamOffset;

          const edgeDist = Math.min(c, bw - 1 - c, r, bh - 1 - r);
          const falloff = Math.min(1.0, edgeDist / 3.0);

          if (Math.abs(seamOffset) > 2) {
            data[pixelIdx] = Math.max(0, Math.min(255, Math.round(data[pixelIdx] + seamOffset * 0.95 * falloff)));
            data[pixelIdx + 1] = Math.max(0, Math.min(255, Math.round(data[pixelIdx + 1] + seamOffset * 0.95 * falloff)));
            data[pixelIdx + 2] = Math.max(0, Math.min(255, Math.round(data[pixelIdx + 2] + seamOffset * 0.95 * falloff)));
          }
        }
      }
    } else {
      // 4B. ERASE LOGO MODE: Zero-Blur Real Fabric Texture Synthesis
      const dispRect = getImageElementRect();
      const dispW = (dispRect && dispRect.width > 20) ? dispRect.width : 380;

      // Build pixel-accurate mask from user's rubbed brush strokes if present
      const rubMask = new Uint8Array(bw * bh);
      if (hasRubStrokes && strokes) {
        const strokeCanvas = document.createElement('canvas');
        strokeCanvas.width = bw;
        strokeCanvas.height = bh;
        const sctx = strokeCanvas.getContext('2d');
        if (sctx) {
          sctx.fillStyle = '#000000';
          sctx.fillRect(0, 0, bw, bh);
          sctx.fillStyle = '#ffffff';
          sctx.strokeStyle = '#ffffff';
          const canvasRadius = Math.max(4, Math.round(((brushRadiusPx || 20) / dispW) * canvas.width));
          sctx.lineWidth = canvasRadius * 2;
          sctx.lineCap = 'round';
          sctx.lineJoin = 'round';

          for (const strk of strokes) {
            if (strk.length === 0) continue;
            sctx.beginPath();
            for (let i = 0; i < strk.length; i++) {
              const cx = (strk[i].x / 100) * canvas.width - bx;
              const cy = (strk[i].y / 100) * canvas.height - by;
              if (i === 0) {
                sctx.moveTo(cx, cy);
                sctx.arc(cx, cy, canvasRadius, 0, Math.PI * 2);
                sctx.moveTo(cx, cy);
              } else {
                sctx.lineTo(cx, cy);
              }
            }
            sctx.stroke();
          }
          const sdata = sctx.getImageData(0, 0, bw, bh).data;
          for (let i = 0; i < bw * bh; i++) {
            rubMask[i] = sdata[i * 4] > 40 ? 1 : 0;
          }
        }
      }

      const rawMask = new Uint8Array(bw * bh);
      let minInkX = bw;
      let maxInkX = 0;
      let minInkY = bh;
      let maxInkY = 0;
      let inkPixelCount = 0;

      // Pass 1: Identify ink pixels
      // In Brush mode: every pixel rubbed by user is targeted for complete erasure.
      // In Area mode: identify any pixel differing from clean fabric by more than natural fabric variance.
      for (let r = 0; r < bh; r++) {
        for (let c = 0; c < bw; c++) {
          const idx = r * bw + c;
          if (hasRubStrokes) {
            if (rubMask[idx]) {
              rawMask[idx] = 1;
              minInkX = Math.min(minInkX, c);
              maxInkX = Math.max(maxInkX, c);
              minInkY = Math.min(minInkY, r);
              maxInkY = Math.max(maxInkY, r);
              inkPixelCount++;
            }
          } else {
            const pixelIdx = ((by + r) * w + (bx + c)) * 4;
            const origR = data[pixelIdx];
            const origG = data[pixelIdx + 1];
            const origB = data[pixelIdx + 2];
            const synthR = bufR[idx];
            const synthG = bufG[idx];
            const synthB = bufB[idx];
            const colorDist = Math.hypot(origR - synthR, origG - synthG, origB - synthB);
            const fabricDist = Math.hypot(origR - medFabricR, origG - medFabricG, origB - medFabricB);
            if (colorDist > Math.max(6, fabricStd * 1.5) || fabricDist > Math.max(8, fabricStd * 1.8)) {
              rawMask[idx] = 1;
              minInkX = Math.min(minInkX, c);
              maxInkX = Math.max(maxInkX, c);
              minInkY = Math.min(minInkY, r);
              maxInkY = Math.max(maxInkY, r);
              inkPixelCount++;
            }
          }
        }
      }

      // If user selected an area box over a low-contrast/dark-on-dark logo, inpaint all interior pixels
      if (inkPixelCount < 10) {
        for (let r = 0; r < bh; r++) {
          for (let c = 0; c < bw; c++) {
            const idx = r * bw + c;
            if (hasRubStrokes ? rubMask[idx] : (c >= 1 && c < bw - 1 && r >= 1 && r < bh - 1)) {
              rawMask[idx] = 1;
              minInkX = Math.min(minInkX, c);
              maxInkX = Math.max(maxInkX, c);
              minInkY = Math.min(minInkY, r);
              maxInkY = Math.max(maxInkY, r);
              inkPixelCount++;
            }
          }
        }
      }

      // Pass 2: Dilate mask by 2px so anti-aliased edge halos and embroidery shadow fringes are 100% cleared
      const finalMask = new Uint8Array(bw * bh);
      for (let r = 0; r < bh; r++) {
        for (let c = 0; c < bw; c++) {
          const idx = r * bw + c;
          if (rawMask[idx]) {
            finalMask[idx] = 255;
          } else {
            let isNear = false;
            for (let dy = -2; dy <= 2 && !isNear; dy++) {
              for (let dx = -2; dx <= 2 && !isNear; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nr = r + dy;
                const nc = c + dx;
                if (nr >= 0 && nr < bh && nc >= 0 && nc < bw) {
                  if (rawMask[nr * bw + nc]) isNear = true;
                }
              }
            }
            if (isNear) {
              finalMask[idx] = 255;
            }
          }
        }
      }

      // Calculate real garment micro-texture grain residuals from dominant fabric cluster (Zero-Blur!)
      const grainResiduals = dominantBinSamples.map((p) => [p[0] - medFabricR, p[1] - medFabricG, p[2] - medFabricB]);
      const grainStdR = Math.max(1.0, Math.min(5.0, Math.hypot(...grainResiduals.map((gr) => gr[0])) / Math.sqrt(grainResiduals.length || 1)));
      const grainStdG = Math.max(1.0, Math.min(5.0, Math.hypot(...grainResiduals.map((gr) => gr[1])) / Math.sqrt(grainResiduals.length || 1)));
      const grainStdB = Math.max(1.0, Math.min(5.0, Math.hypot(...grainResiduals.map((gr) => gr[2])) / Math.sqrt(grainResiduals.length || 1)));

      // Pass 3: Reconstruct clean fabric with matching lighting gradient and real yarn weave grain
      for (let r = 0; r < bh; r++) {
        for (let c = 0; c < bw; c++) {
          const idx = r * bw + c;
          const maskVal = finalMask[idx];
          if (maskVal === 0) continue; // Original clean garment untouched!

          const pixelIdx = ((by + r) * w + (bx + c)) * 4;
          const origR = data[pixelIdx];
          const origG = data[pixelIdx + 1];
          const origB = data[pixelIdx + 2];

          const synthR = bufR[idx];
          const synthG = bufG[idx];
          const synthB = bufB[idx];

          // High-frequency pseudo-random weave texture matching physical cloth yarn standard deviation
          const seed = ((bx + c) * 374761393 + (by + r) * 668265263) >>> 0;
          const n1 = (((seed ^ (seed >>> 13)) * 1274126177 & 0x7fffffff) / 0x7fffffff) - 0.5;
          const n2 = ((((seed + 1) ^ ((seed + 1) >>> 13)) * 1274126177 & 0x7fffffff) / 0x7fffffff) - 0.5;
          const n3 = ((((seed + 2) ^ ((seed + 2) >>> 13)) * 1274126177 & 0x7fffffff) / 0x7fffffff) - 0.5;

          const grainR = n1 * grainStdR * 2.2;
          const grainG = n2 * grainStdG * 2.2;
          const grainB = n3 * grainStdB * 2.2;

          const finalR = Math.max(0, Math.min(255, Math.round(synthR + grainR)));
          const finalG = Math.max(0, Math.min(255, Math.round(synthG + grainG)));
          const finalB = Math.max(0, Math.min(255, Math.round(synthB + grainB)));

          // Smooth 2px transition boundary with surrounding original fabric
          const edgeDist = Math.min(c, bw - 1 - c, r, bh - 1 - r);
          const eraseWeight = Math.min(1.0, edgeDist / 2.0);

          data[pixelIdx] = Math.round((1 - eraseWeight) * origR + eraseWeight * finalR);
          data[pixelIdx + 1] = Math.round((1 - eraseWeight) * origG + eraseWeight * finalG);
          data[pixelIdx + 2] = Math.round((1 - eraseWeight) * origB + eraseWeight * finalB);
          data[pixelIdx + 3] = 255;
        }
      }

      if (inkPixelCount >= 8 && maxInkX >= minInkX && maxInkY >= minInkY) {
        const inkCanvasW = maxInkX - minInkX + 1;
        const inkCanvasMidX = bx + minInkX + inkCanvasW / 2;
        const inkCanvasMidY = by + minInkY + (maxInkY - minInkY + 1) / 2;
        const detectedScale = Math.max(14, Math.min(75, Math.round((inkCanvasW / canvas.width) * dispW * 1.15)));
        const detectedX = Math.round(((inkCanvasMidX / canvas.width) * 100) * 10) / 10;
        const detectedY = Math.round(((inkCanvasMidY / canvas.height) * 100) * 10) / 10;
        detectedSpec = { x: detectedX, y: detectedY, scale: detectedScale };
      }
    }

    ctx.putImageData(imgData, 0, 0);
    let outUrl = canvas.toDataURL('image/png');
    try {
      const webp = canvas.toDataURL('image/webp', 0.98);
      if (webp && webp.startsWith('data:image/webp') && webp.length > 100) outUrl = webp;
    } catch { }
    return { url: outUrl, detected: detectedSpec };
  }

  const handleExecuteErase = async (snapVector = false, isSeamRepair = false) => {
    const curRect = getImageElementRect();
    const curBox = eraseBox || computeRubBoundingBox(rubStrokes, brushRadius, curRect?.width || 380, curRect?.height || 500);
    if (!curBox || !result) return;
    try {
      setIsErasing(true);
      const currentImg = result;
      const strokesToPass = eraseTool === 'brush' && rubStrokes.length > 0 ? rubStrokes : undefined;
      const { url: inpainted, detected } = await inpaintEraseArea(
        currentImg,
        curBox,
        isSeamRepair ? 'repair_seam' : 'erase_logo',
        strokesToPass,
        brushRadius
      );

      // Save to undo stack (max 5)
      setEraseUndoStack((prev) => [currentImg, ...prev.slice(0, 4)]);
      setResult(inpainted);
      setCleanResultBackup(inpainted);
      setFivePoseItems((prev) =>
        prev.map((p, i) => (i === selectedPoseIndex ? { ...p, url: inpainted } : p))
      );

      const dispRect = getImageElementRect();
      const dispW = (dispRect && dispRect.width > 20) ? dispRect.width : 380;
      const autoScale = detected?.scale || Math.max(14, Math.min(80, Math.round((dispW * curBox.width) / 100)));
      const centerX = detected?.x ?? Math.round((curBox.x + curBox.width / 2) * 10) / 10;
      const centerY = detected?.y ?? Math.round((curBox.y + curBox.height / 2) * 10) / 10;
      const isPant = centerY > 50 || activeLogoTarget === 'pant';
      const target = isPant ? 'pant' : 'chest';

      lastErasedSpecRef.current = { scale: autoScale, x: centerX, y: centerY, target };

      if (snapVector) {
        if (isPant) {
          updatePantX(centerX);
          updatePantY(centerY);
          updatePantScale(autoScale);
          setShowPantLogo(true);
          setActiveLogoTarget('pant');
        } else {
          updateChestX(centerX);
          updateChestY(centerY);
          updateChestScale(autoScale);
          setShowHdLogoOverlay(true);
          setActiveLogoTarget('chest');
        }
        setActiveRenderOption('b');
        setIsOptionBDirty(true);
      } else if (!isSeamRepair) {
        // User clicked "Erase Logo" -> Turn off vector overlay on that spot so it doesn't block the erased area
        const centerY = curBox.y + curBox.height / 2;
        if (centerY > 50) {
          setShowPantLogo(false);
        } else {
          setShowHdLogoOverlay(false);
        }
        if (centerY <= 55) {
          setShowHdLogoOverlay(false);
        }
        setActiveRenderOption('a');
        setIsOptionBDirty(false);
      }

      handleClearStrokes();
      if (snapVector) {
        setIsEraseMode(false);
        setEraseCanvasZoom(1.0);
      }
      autoSaveTriggerRef.current?.(inpainted, snapVector ? 'Option B (HD Vector Brand Applied)' : 'Edited & Erased');
    } catch (err: any) {
      alert('Erase failed: ' + (err?.message || err));
    } finally {
      setIsErasing(false);
    }
  };

  const handleUndoErase = () => {
    if (eraseUndoStack.length === 0) return;
    const [previous, ...rest] = eraseUndoStack;
    setEraseUndoStack(rest);
    setResult(previous);
    setCleanResultBackup(previous);
    setFivePoseItems((prev) =>
      prev.map((p, i) => (i === selectedPoseIndex ? { ...p, url: previous } : p))
    );
    handleClearStrokes();
    setIsEraseMode(true);
    autoSaveTriggerRef.current?.(previous, 'Step Back (Undone Erase)');
  };

  const [autoSaveStatus, setAutoSaveStatus] = useState<string>('');
  const autoSaveTimerRef = useRef<any>(null);
  const lastSavedUrlRef = useRef<string>('');
  const currentEditGenIdRef = useRef<string>('');

  const triggerAutoSaveToMySets = useCallback((_overrideImg?: string, _customLabel?: string) => {
    // User chooses when to save edited / HD logo images to My Sets via "Save to My Sets" button
    setIsOptionBDirty(true);
  }, []);

  useEffect(() => {
    autoSaveTriggerRef.current = triggerAutoSaveToMySets;
  }, [triggerAutoSaveToMySets]);

  const handleSaveToMySets = async () => {
    if (!result) return;
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    try {
      setBusy(true);
      setAutoSaveStatus('Saving…');
      let finalImg = result;
      let promptLabel = 'Studio Sportswear';
      const wasEdited = Boolean(eraseUndoStack.length > 0 || isOptionBDirty || activeRenderOption === 'b');

      if (activeRenderOption === 'b' && (showHdLogoOverlay || showPantLogo)) {
        const baseToUse = cleanResultBackup || result;
        try {
          finalImg = await stampHdLogoOntoImage(baseToUse);
        } catch (stampErr) {
          console.warn('[handleSaveToMySets] Logo stamping fallback:', stampErr);
          finalImg = baseToUse;
        }
        setResult(finalImg);
        setCleanResultBackup(baseToUse);
        setFivePoseItems((prev) =>
          prev.map((p, i) => (i === selectedPoseIndex ? { ...p, url: finalImg } : p))
        );
        setIsOptionBDirty(false);
        promptLabel = `Option B (HD Vector Brand Applied) · ${prompt.trim() || 'Studio Sportswear'}`;
      } else {
        const baseToUse = result;
        setCleanResultBackup(baseToUse);
        promptLabel = `Edited & Erased · ${prompt.trim() || 'Clean Fabric Studio'}`;
      }

      lastSavedUrlRef.current = finalImg;

      // Always generate a fresh unique ID so each save/edit creates a distinct card in My Sets!
      const newGenId = crypto.randomUUID();
      currentEditGenIdRef.current = newGenId;

      const savePayload = {
        id: newGenId,
        type: 'image' as const,
        url: finalImg,
        isEdited: wasEdited,
        isNewSnapshot: true,
        prompt: promptLabel,
        resolution: quality || '2k',
      };

      // 1. Optimistic insertion: immediately display the new card in My Sets (<10ms)
      const optimisticGen: UserGeneration = {
        id: newGenId,
        type: 'image',
        url: finalImg,
        highResUrl: finalImg,
        isEdited: wasEdited,
        prompt: promptLabel,
        resolution: quality || '2k',
        createdAt: Date.now(),
        status: 'completed',
      };
      setUserGenerations((prev) => [optimisticGen, ...prev.filter((g) => g.id !== newGenId)]);

      let savedGen: UserGeneration | null = null;
      try {
        savedGen = await api.saveUserGeneration(savePayload);
      } catch (saveErr) {
        // Fast fallback check if connection reset right at save commit
        try {
          const fresh = await api.userGenerations();
          const found = fresh.items?.find((g) => g.id === newGenId);
          if (found) {
            savedGen = found;
          }
        } catch { }

        if (!savedGen) {
          // Retry once with a clean request
          try {
            savedGen = await api.saveUserGeneration(savePayload);
          } catch (retryErr) {
            try {
              const fresh2 = await api.userGenerations();
              const found2 = fresh2.items?.find((g) => g.id === newGenId);
              if (found2) {
                savedGen = found2;
              }
            } catch { }
            if (!savedGen) throw retryErr;
          }
        }
      }

      if (savedGen) {
        setUserGenerations((prev) => [savedGen!, ...prev.filter((g) => g.id !== savedGen!.id && g.id !== newGenId)]);
      }
      void loadUserGenerations();
      setAutoSaveStatus('Saved to My Sets');
      setTimeout(() => setAutoSaveStatus(''), 3000);
      alert('✅ Saved! The edited image is now permanently saved to My Sets with the EDITED badge.');
    } catch (e: any) {
      setAutoSaveStatus('');
      alert('Could not save to My Sets: ' + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };



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
      setError(`Insufficient credits. You need ${totalRequiredCredits} credits for ${multiBatchCount} model renders, but currently have ${user?.credits ?? 0} credits.`);
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
      // Proactively clear any lingering lock from a previously completed or interrupted render
      await api.unlockUser().catch(() => { });

      let effectivePrompt = mode === 'swap' ? swapPrompt.trim() : prompt.trim();
      if (garmentColor.trim() && mode !== 'swap') {
        const colorNote = `Exact fabric color: ${garmentColor.trim()}. Preserve true athletic garment dye and athlete kit tones with accurate color matching.`;
        effectivePrompt = effectivePrompt ? `${effectivePrompt} · ${colorNote}` : colorNote;
      }
      const payload: Record<string, unknown> = {
        mode,
        prompt: effectivePrompt,
        resolution: quality,
        color: garmentColor.trim(),
        tryOnTarget,
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
        // Multi-view garment references
        if (hasClassifiedGarments) {
          const garmentViews = classifiedGarments.map((g, idx) => ({
            url: g.url,
            role: g.role,
            label: (g.role === 'custom' && g.customLabel?.trim())
              ? g.customLabel.trim()
              : (GARMENT_ROLE_LABELS[g.role] || `View ${idx + 1}`),
          }));
          payload.garmentViews = garmentViews;

          const activeModelItem = model || effectiveModels[0];
          const hasUpper = classifiedGarments.some((g) => isUpperGarmentRole(g.role, g.name));
          const hasLower = classifiedGarments.some((g) => isLowerGarmentRole(g.role, g.name));
          const effectiveTarget: TryOnTarget = (hasUpper && hasLower) ? 'both' : (hasLower ? 'lower' : (hasUpper ? 'upper' : tryOnTarget));

          if (effectiveTarget === 'lower') {
            payload.mode = 'tryon';
            payload.tryOnTarget = 'lower';
            payload.category = 'bottoms';
            payload.cloth = bottomGarment?.url || classifiedGarments.find((g) => isLowerGarmentRole(g.role, g.name))?.url || classifiedGarments[0]?.url;
            if (activeModelItem?.url) payload.model = activeModelItem.url;
            payload.source = payload.cloth;
            delete payload.topCloth;
            delete payload.bottomCloth;
          } else if (effectiveTarget === 'upper') {
            payload.mode = 'tryon';
            payload.tryOnTarget = 'upper';
            payload.category = 'tops';
            payload.cloth = topFrontGarment?.url || classifiedGarments.find((g) => isUpperGarmentRole(g.role, g.name))?.url || classifiedGarments[0]?.url;
            if (activeModelItem?.url) payload.model = activeModelItem.url;
            payload.source = payload.cloth;
            delete payload.topCloth;
            delete payload.bottomCloth;
          } else {
            // Both = full outfit chaining when both top and bottom exist
            if (bottomGarment?.url && topFrontGarment?.url) {
              payload.mode = 'outfit';
              payload.tryOnTarget = 'both';
              payload.category = 'one-pieces';
              payload.topCloth = topFrontGarment.url;
              payload.bottomCloth = bottomGarment.url;
              if (activeModelItem?.url) payload.model = activeModelItem.url;
            } else if (bottomGarment?.url) {
              payload.mode = 'tryon';
              payload.tryOnTarget = 'lower';
              payload.category = 'bottoms';
              payload.cloth = bottomGarment.url;
              if (activeModelItem?.url) payload.model = activeModelItem.url;
              payload.source = payload.cloth;
            } else {
              payload.mode = 'tryon';
              payload.tryOnTarget = 'upper';
              payload.category = 'tops';
              payload.cloth = topFrontGarment?.url || classifiedGarments[0]?.url;
              if (activeModelItem?.url) payload.model = activeModelItem.url;
              payload.source = payload.cloth;
            }
          }
        } else {
          const activeModelItem = model || effectiveModels[0];
          const activeClothItem = cloth || topFrontGarment || classifiedGarments[0];
          payload.mode = 'tryon';
          if (activeClothItem?.url) payload.cloth = activeClothItem.url;
          if (activeModelItem?.url) payload.model = activeModelItem.url;
          payload.source = activeClothItem?.url;
          payload.category = tryOnTarget === 'lower' ? 'bottoms' : 'tops';
        }
      }

      /* Batch Execution (multi-model/pose batch or multi-swap batch) */
      const isSwapBatch = mode === 'swap' && validSwapDrafts.length > 1;
      const isMultiModelBatch = (effectiveModels.length > 1 || selectedModels.length > 1) && mode === 'tryon';

      if ((isMultiModelBatch || isSwapBatch) && !isEditingRender) {
        let batchItems: Array<{
          id: string;
          name: string;
          angle: string;
          icon: string;
          model?: Pick;
          cloth?: Pick;
          sourceModel?: Pick;
          targetModel?: Pick;
          promptSuffix?: string;
        }> = [];

        if (isSwapBatch) {
          batchItems = validSwapDrafts.map((d, i) => ({
            id: `swap-${i + 1}`,
            name: `Swap ${i + 1}`,
            angle: `Swap Pair ${i + 1} of ${validSwapDrafts.length}`,
            icon: `#${i + 1}`,
            sourceModel: d.source,
            targetModel: d.target,
            promptSuffix: d.prompt || '',
          }));
        } else {
          // Multi-model/pose batch: generate images equal to the number of uploaded/selected models (up to 10)
          const targetModels = effectiveModels.slice(0, 10);
          batchItems = targetModels.map((m, i) => {
            const isBack = /back|rear|behind|reverse|peche|dorsal/i.test(`${m?.name || ''} ${m?.url || ''}`);
            const angleLabel = isBack ? `Back Pose ${i + 1} of ${targetModels.length}` : `Front Pose ${i + 1} of ${targetModels.length}`;
            return {
              id: `pose-${i + 1}`,
              name: m?.name || `Pose ${i + 1}`,
              angle: tryOnTarget === 'both' ? `Full Outfit on ${angleLabel}` : angleLabel,
              icon: isBack ? '🔄' : '👕',
              model: m,
              cloth: isBack && topBackGarment ? topBackGarment : (topFrontGarment || cloth),
              promptSuffix: isBack ? 'Back angle view' : 'Front angle view',
            };
          });
        }

        const initialPoses: PoseItem[] = batchItems.map((spec, i) => ({
          id: spec.id,
          name: spec.name,
          angle: spec.angle,
          icon: spec.icon,
          promptSuffix: spec.promptSuffix || '',
          model: spec.model || spec.targetModel,
          status: i === 0 ? 'generating' : 'pending',
        }));

        setFivePoseItems(initialPoses);
        setSelectedPoseIndex(0);
        activePoseIndexRef.current = 0;
        batchPayloadRef.current = {
          isFivePose: false,
          total: batchItems.length,
          payload,
          basePrompt: mode === 'swap' ? swapPrompt.trim() : prompt.trim(),
          items: batchItems,
        };

        const firstItem = batchItems[0];
        setProgress(5);
        setProgressLabel(
          isSwapBatch
            ? `Starting Swap 1 of ${validSwapDrafts.length}…`
            : `Starting Pose 1 of ${batchItems.length} (${firstItem.name})…`
        );

        const firstIsBack = /(?:^|[\s_/-])(back|rear|reverse|peche|dorsal)(?:[\s_/-]|$)/i.test(
          `${firstItem.model?.name || ''} ${firstItem.model?.url || ''}`
        );

        const firstPayload: Record<string, unknown> = {
          ...payload,
          poseAngle: firstIsBack ? 'back' : 'front',
          ...(firstItem.model?.url ? { model: firstItem.model.url } : {}),
          ...(tryOnTarget === 'both' ? (
            (bottomGarment?.url && (topFrontGarment?.url || cloth?.url)) ? {
              mode: 'outfit',
              topCloth: (firstIsBack && topBackGarment?.url) ? topBackGarment.url : (topFrontGarment?.url || cloth?.url),
              bottomCloth: bottomGarment.url,
              category: 'one-pieces',
            } : bottomGarment?.url ? {
              mode: 'tryon',
              cloth: bottomGarment.url,
              source: bottomGarment.url,
              category: 'bottoms',
            } : {
              mode: 'tryon',
              cloth: (firstIsBack && topBackGarment?.url) ? topBackGarment.url : (topFrontGarment?.url || cloth?.url),
              source: (firstIsBack && topBackGarment?.url) ? topBackGarment.url : (topFrontGarment?.url || cloth?.url),
              category: 'tops',
            }
          ) : tryOnTarget === 'lower' ? {
            mode: 'tryon',
            category: 'bottoms',
            cloth: bottomGarment?.url || firstItem.cloth?.url || cloth?.url,
            source: bottomGarment?.url || firstItem.cloth?.url || cloth?.url,
          } : {
            mode: 'tryon',
            category: 'tops',
            cloth: (firstIsBack && topBackGarment?.url) ? topBackGarment.url : (topFrontGarment?.url || firstItem.cloth?.url || cloth?.url),
            source: (firstIsBack && topBackGarment?.url) ? topBackGarment.url : (topFrontGarment?.url || firstItem.cloth?.url || cloth?.url),
          }),
          ...(firstItem.sourceModel?.url ? { sourceModel: firstItem.sourceModel.url, source: firstItem.sourceModel.url } : {}),
          ...(firstItem.targetModel?.url ? { targetModel: firstItem.targetModel.url, model: firstItem.targetModel.url } : {}),
        };
        firstPayload.prompt = `${effectivePrompt} ${firstItem.promptSuffix || ''}`.trim();

        const res1 = await api.generate(firstPayload);
        if (res1.credits !== undefined && user) {
          setUser({ ...user, credits: res1.credits });
        }
        setJob({ id: res1.id, status: 'starting' });
      } else {
        const singleModel = model || effectiveModels[0];
        const singleInitialPose: PoseItem = {
          id: 'pose-1',
          name: singleModel?.name || 'Model Pose 1',
          angle: tryOnTarget === 'both' ? 'Full Outfit' : tryOnTarget === 'lower' ? 'Lower (Pants)' : 'Upper Only',
          icon: '👕',
          promptSuffix: '',
          model: singleModel,
          status: 'generating',
        };
        setFivePoseItems([singleInitialPose]);
        setSelectedPoseIndex(0);
        activePoseIndexRef.current = -1;
        batchPayloadRef.current = null;
        setProgress(5);
        setProgressLabel(isEditingRender ? 'Applying AI edits to render…' : 'Initiating GPU render…');

        const singleCloth = topFrontGarment || cloth || classifiedGarments[0];
        const singlePayload: Record<string, unknown> = {
          ...payload,
          ...(singleModel?.url ? { model: singleModel.url } : {}),
          ...(singleCloth?.url && !payload.cloth ? { cloth: singleCloth.url, source: singleCloth.url } : {}),
        };
        const singleIsBack = /(?:^|[\s_/-])(back|rear|reverse|peche|dorsal)(?:[\s_/-]|$)/i.test(
          `${singleModel?.name || ''} ${singleModel?.url || ''}`
        );
        singlePayload.poseAngle = singleIsBack ? 'back' : 'front';
        singlePayload.prompt = effectivePrompt;

        if (mode === 'swap') {
          const activeDraft = validSwapDrafts[0] || swapDrafts[activeSwapDraftIndex] || { source: swapSource, target: swapTarget };
          if (activeDraft.source?.url) {
            singlePayload.sourceModel = activeDraft.source.url;
            singlePayload.source = activeDraft.source.url;
          }
          if (activeDraft.target?.url) {
            singlePayload.targetModel = activeDraft.target.url;
            singlePayload.model = activeDraft.target.url;
          }
        }

        const res = await api.generate(singlePayload);
        if (res.credits !== undefined && user) {
          setUser({ ...user, credits: res.credits });
        }
        setJob({ id: res.id, status: 'starting' });
      }
    } catch (e) {
      let msg = e instanceof Error ? e.message : 'Generation failed';
      if (msg.toLowerCase().includes('rendering is off') || msg.toLowerCase().includes('no render key')) {
        msg = 'The render service key was rejected. Please contact support or try again later.';
      } else if (msg.toLowerCase().includes('failed to fetch')) {
        msg = 'Connection to the studio server was momentarily interrupted. Please click Generate again.';
      } else if (msg.toLowerCase().includes('in progress') || msg.toLowerCase().includes('concurrency')) {
        void api.unlockUser().catch(() => { });
        msg = 'Studio was momentarily busy. Ready now — please click Generate again.';
      }
      setError(msg);
      void api.reportClientError({ title: 'Studio Generation Error', message: msg, details: e });
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
    const curDraft = swapDrafts[activeSwapDraftIndex] || swapDrafts[0];
    const hasAnyComplete = validSwapDrafts.length > 0;
    if (!hasAnyComplete) {
      if (!curDraft?.source && !swapSource) swapMissing.push('source model (Kis Model ko change karna hai)');
      if (!curDraft?.target && !swapTarget) swapMissing.push('target model (Kis Model ke sath change karna hai)');
    }
  }
  const tryonMissing: string[] = [];
  if (mode === 'tryon') {
    const hasGarment = hasClassifiedGarments || Boolean(cloth?.url);
    const hasModel = effectiveModels.length > 0 || Boolean(model?.url);
    const needsBottom = tryOnTarget === 'lower' && !bottomGarment && !cloth;
    if (!hasGarment) tryonMissing.push('garment');
    if (!hasModel) tryonMissing.push('model');
    if (needsBottom) tryonMissing.push('bottom garment (pants/lower)');
  }
  const missing = isSwapMode ? swapMissing : tryonMissing;
  const isUltraUser = Boolean(user?.tier === 'ultra' || user?.features?.hd2k);
  const isLocked = Boolean(user?.creditsLocked);
  const canRun = ready && !isGlobalBusy && missing.length === 0 && !uploading && !isLocked;

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className={`min-h-screen selection:bg-[#e5373f] selection:text-white font-sans antialiased transition-colors ${isLight ? 'bg-[#97c1a9] text-gray-900' : 'bg-[#08080a] text-white'
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

      {/* 2K Ultra HD Confirmation Modal */}
      {show2kConfirmModal && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-in fade-in duration-150">
          <div className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl transition-colors ${isLight ? 'border-gray-200 bg-white text-gray-900' : 'border-purple-500/30 bg-[#121217] text-white'
            }`}>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30">
                <Sparkles className="h-6 w-6" />
              </div>
              <div>
                <h3 className={`text-base font-bold ${isLight ? 'text-gray-900' : 'text-white'}`}>
                  Change to 2K Ultra HD?
                </h3>
                <p className={`text-xs ${isLight ? 'text-gray-600' : 'text-purple-300/80'}`}>
                  Ultra Plan High-Resolution Render Mode
                </p>
              </div>
            </div>

            <div className={`mt-4 rounded-xl border p-4 text-xs leading-relaxed space-y-2.5 ${isLight ? 'border-gray-200 bg-gray-50 text-gray-700' : 'border-white/10 bg-black/50 text-white/70'
              }`}>
              <p>
                Are you sure you want to change render quality from <strong className={isLight ? 'text-gray-900' : 'text-white'}>1K Standard</strong> to <strong className="text-purple-400">2K Ultra HD</strong>?
              </p>
              <div className={`rounded-lg p-2.5 flex items-start gap-2 text-xs border ${isLight ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                }`}>
                <span className="font-bold">⚡ Notice:</span>
                <span>2K Ultra HD consumes <strong className="underline">3 credits</strong> per generation photoshoot instead of 1 credit.</span>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShow2kConfirmModal(false)}
                className={`flex-1 rounded-full border py-2.5 text-xs font-semibold transition-colors ${isLight
                  ? 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                  : 'border-white/20 bg-transparent text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
              >
                Cancel (Keep 1K)
              </button>
              <button
                type="button"
                onClick={() => {
                  setQuality('2k');
                  setShow2kConfirmModal(false);
                }}
                className="flex-1 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-purple-500/25 hover:from-purple-500 hover:to-indigo-500 transition-all"
              >
                Yes, Change to 2K
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Garment Photography Guidelines Tour Modal */}
      <GarmentPhotoTourModal
        isOpen={showPhotoTour}
        onClose={handleTourDismiss}
        onStartUpload={handleTourProceedToUpload}
        step={tourStep}
        setStep={setTourStep}
        alwaysShow={alwaysShowTour}
        setAlwaysShow={setAlwaysShowTour}
        isLight={isLight}
      />

      {/* Zoom & Macro Crop Download Modal (Exact 1807×3000 Output) */}
      <ZoomCropDownloadModal
        isOpen={showZoomCropModal}
        onClose={() => {
          setShowZoomCropModal(false);
          setZoomCropOnUse(null);
        }}
        imageUrl={zoomCropImage}
        imageTitle={zoomCropTitle}
        isLight={isLight}
        onUseCrop={zoomCropOnUse || undefined}
      />

      {/* "Are You Sure?" Generation Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-2xl border border-white/20 bg-[#121217] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-semibold text-white">
                {isEditingRender
                  ? 'Confirm image edit'
                  : mode === 'swap'
                    ? `Confirm model swap (${validSwapDrafts.length > 1 ? `${validSwapDrafts.length} drafts` : '1 draft'})`
                    : multiBatchCount > 1
                      ? `Confirm ${multiBatchCount} model renders`
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
                  : multiBatchCount > 1
                    ? `Are you sure you want to generate ${multiBatchCount} images for all selected models (${totalRequiredCredits} credits)?`
                    : mode === 'swap'
                      ? `Are you sure you want to proceed with ${validSwapDrafts.length > 1 ? `${validSwapDrafts.length} Model Swaps (${totalRequiredCredits} credits)` : 'this Model Swap'}?`
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
                ) : mode === 'swap' && validSwapDrafts.length > 1 ? (
                  <>
                    <div className="flex justify-between text-white/60">
                      <span>Batch:</span>
                      <span className="font-semibold text-white">Multi-Swap Batch Generation</span>
                    </div>
                    <div className="flex justify-between text-white/60">
                      <span>Total Swaps:</span>
                      <span className="font-semibold text-amber-400">{validSwapDrafts.length} Configured Drafts ({totalRequiredCredits} Credits Total)</span>
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
      <header className={`sticky top-0 z-40 border-b backdrop-blur-md transition-colors ${isLight ? 'border-gray-200 bg-white/95' : 'border-white/10 bg-[#08080a]/90'
        }`}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8">
          <div className="flex items-center gap-3">
            <a href="/" className={`flex items-center gap-2 text-xs font-semibold tracking-[0.2em] ${isLight ? 'text-gray-900' : 'text-white'}`}>
              <img src="/brand-mark-white.png" alt="Shiv-Naresh" className={`h-4 w-auto ${isLight ? 'invert' : ''}`} />
              SHIV-NARESH
            </a>
            <span className={`hidden sm:inline-block rounded-full px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest ${isLight ? 'bg-gray-100 text-gray-500' : 'bg-white/5 text-white/50'
              }`}>
              STUDIO
            </span>
          </div>

          <div className="flex items-center gap-3 sm:gap-4 text-xs">
            {/* Theme Toggle */}
            <ThemeToggle theme={theme} toggleTheme={toggleTheme} />

            {/* Photoshoot Counter Pill */}
            {user && (() => {
              const totalQuota = user.photoshoots || user.maxModels || 20;
              const doneCount = typeof user.photoshootsDone === 'number' ? user.photoshootsDone : Math.floor((user.modelsGenerated || 0) / 5);
              const leftCount = Math.max(0, totalQuota - doneCount);
              return (
                <span
                  className={`hidden md:inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${isLight ? 'border-gray-300 bg-gray-50 text-gray-700' : 'border-white/10 bg-white/5 text-slate-300'
                    }`}
                  title={`${doneCount} delivered by studio, ${leftCount} remaining out of ${totalQuota}`}
                >
                  <Camera className="w-3.5 h-3.5 text-[#e5373f]" />
                  <span>
                    📸 {doneCount} / {totalQuota} Photoshoots Done ({leftCount} Left)
                  </span>
                </span>
              );
            })()}

            {/* Top Right Credit Status Pill — Visible Across ALL Tabs */}
            <a
              href="/pricing"
              className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1.5 text-xs font-semibold text-amber-500 hover:border-amber-400 hover:bg-amber-500/20 transition-all shadow-sm"
              title={user?.tier === 'ultra' ? 'Ultra Active Plan' : 'Click to view pricing & upgrade credits'}
            >
              <span>{user ? `${user.credits} credits` : '...'}</span>
              {user?.tier && (
                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.2 rounded-full ${user.tier === 'ultra' || user.tier === 'enterprise'
                  ? 'bg-purple-500/30 text-purple-400'
                  : user.tier === 'pro'
                    ? 'bg-blue-500/30 text-blue-400'
                    : isLight ? 'bg-gray-200 text-gray-700' : 'bg-white/10 text-white/60'
                  }`}>
                  {user.tier}
                </span>
              )}
              {user?.tier !== 'ultra' && (
                <span className="text-[10px] font-semibold uppercase text-[#facc15] bg-black/40 px-1.5 py-0.5 rounded-full ml-1">
                  + Upgrade
                </span>
              )}
            </a>

            {/* User Profile Button */}
            {user && (
              <button
                type="button"
                onClick={() => setShowProfileModal(true)}
                className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition-all ${isLight
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
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-all duration-200 shadow-sm ${isLight
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
              {
                id: 'custom-requests',
                label: 'Send Request',
              },
              {
                id: 'deliveries',
                label: 'Receive Deliveries' + (userDeliveriesCount ? ` (${userDeliveriesCount})` : ''),
                unread: deliveriesUnreadCount,
              },
              { id: 'video', label: 'Video Studio' },
              { id: 'watermark', label: 'Remove Watermark' },
              { id: 'compare', label: 'Split Compare' },
            ].map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => {
                  setPageView(v.id as typeof pageView);
                  if (v.id === 'custom-requests') {
                    void loadCustomRequests();
                    void loadDeliveriesUnread();
                    api.me().then((res) => { if (res.user) setUser(res.user); }).catch(() => { });
                  } else if (v.id === 'deliveries') {
                    void loadCustomRequests();
                    void loadDeliveriesUnread();
                    void api.markUserDeliveriesRead().catch(() => { });
                    setDeliveriesUnreadCount(0);
                    api.me().then((res) => { if (res.user) setUser(res.user); }).catch(() => { });
                  }
                }}
                className={`border-b-2 px-4 py-3 text-xs font-medium tracking-normal transition-colors whitespace-nowrap flex items-center gap-1.5 ${pageView === v.id
                  ? 'border-[#e5373f] ' + (isLight ? 'text-gray-900' : 'text-white')
                  : 'border-transparent ' + (isLight ? 'text-gray-500 hover:text-gray-900' : 'text-white/40 hover:text-white/80')
                  }`}
              >
                <span>{v.label}</span>
                {Boolean(v.unread && v.unread > 0) && (
                  <span className="rounded-full bg-[#e5373f] px-2 py-0.5 text-[9px] font-bold text-white animate-pulse">
                    {v.unread} New
                  </span>
                )}
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

      {/* Photoshoot Quota Offer Notification */}
      {user?.photoshootOffer && user.photoshootOffer.status === 'pending' && (
        <div className="border-b border-amber-500/40 bg-amber-500/15 py-3.5">
          <div className="mx-auto max-w-6xl px-5 sm:px-8 space-y-2">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <Camera className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <p className="font-bold text-amber-400 text-sm">
                    Photoshoot Quota Offer from Studio Director
                  </p>
                  <p className="opacity-90 text-[11px] mt-0.5">
                    The studio administrator has proposed updating your photoshoot quota from <strong>{user.photoshootOffer.oldQuota}</strong> to <strong>{user.photoshootOffer.newQuota} photoshoots</strong>.
                    {user.photoshootOffer.note && <span className="block mt-0.5 italic opacity-80">Note: "{user.photoshootOffer.note}"</span>}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={photoshootResponding}
                  onClick={() => handlePhotoshootResponse('agree')}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition shadow cursor-pointer text-xs"
                >
                  Agree &amp; Apply
                </button>
                <button
                  type="button"
                  disabled={photoshootResponding}
                  onClick={() => setShowPhotoshootQueryBox(!showPhotoshootQueryBox)}
                  className="px-3 py-1.5 rounded-xl border border-white/20 hover:bg-white/10 text-white font-semibold transition cursor-pointer text-xs"
                >
                  {showPhotoshootQueryBox ? 'Cancel' : 'Ask Query'}
                </button>
              </div>
            </div>

            {showPhotoshootQueryBox && (
              <div className="rounded-2xl border border-white/10 bg-black/60 p-3.5 space-y-2 mt-2">
                <label className="text-xs font-semibold text-slate-300">
                  Have a question or request regarding this photoshoot quota increment?
                </label>
                <textarea
                  value={photoshootQueryText}
                  onChange={(e) => setPhotoshootQueryText(e.target.value)}
                  placeholder="Type your question or proposal for the admin..."
                  rows={2}
                  className="w-full rounded-xl border border-white/10 bg-black/40 p-2.5 text-xs text-white placeholder:text-white/40 focus:outline-none"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={photoshootResponding}
                    onClick={() => handlePhotoshootResponse('query')}
                    className="px-4 py-1.5 rounded-xl bg-[#e5373f] hover:bg-[#d42d35] text-white text-xs font-bold transition cursor-pointer"
                  >
                    Submit Query to Admin
                  </button>
                </div>
              </div>
            )}
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
          onZoomCrop={(url, title) => {
            setZoomCropImage(url);
            setZoomCropTitle(title);
            setShowZoomCropModal(true);
          }}
          onAddLogo={(gen) => {
            const targetUrl = getBestGenUrl(gen);
            if (!targetUrl) return;
            setResult(targetUrl);
            setCleanResultBackup(targetUrl);
            setActiveRenderOption('b');
            setShowHdLogoOverlay(true);
            setShowPantLogo(true);
            setIsEraseMode(false);
            setHdLogoScale((prev) => (prev && prev >= 6 ? prev : 48));
            setPantLogoScale((prev) => (prev && prev >= 6 ? prev : 36));
            autoDetectContrastColor(targetUrl);
            currentEditGenIdRef.current = gen.id;
            setIsOptionBDirty(true);
            setPageView('studio');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onEditLogo={(gen) => {
            const targetUrl = getBestGenUrl(gen);
            if (!targetUrl) return;
            setResult(targetUrl);
            setCleanResultBackup(targetUrl);
            setMode('removelogo');
            setIsEraseMode(true);
            setEraseBox(null);
            setRubStrokes([]);
            setActiveRenderOption('a');
            setShowHdLogoOverlay(false);
            setShowPantLogo(false);
            setIsOptionBDirty(false);
            currentEditGenIdRef.current = gen.id;
            setPageView('studio');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onBatchAddLogo={handleBatchAddLogo}
          isBatchBranding={isBatchBranding}
          batchBrandProgress={batchBrandProgress}
          isLight={isLight}
        />
      )}

      {/* ============= CUSTOM REQUESTS & DELIVERIES VIEW ============= */}
      {(pageView === 'custom-requests' || pageView === 'deliveries') && (
        <CustomRequestsPanel
          requests={customRequests}
          loading={loadingRequests}
          initialTab={pageView === 'deliveries' ? 'receive' : 'send'}
          onRefresh={() => {
            void loadCustomRequests();
            void loadDeliveriesUnread();
            api.me().then((res) => { if (res.user) setUser(res.user); }).catch(() => { });
          }}
          creditsLocked={isLocked}
          customRequestsLocked={
            !(user?.tier === 'ultra' || user?.features?.customRequests === true)
          }
          isLight={isLight}
          onUnreadCleared={() => setDeliveriesUnreadCount(0)}
          onUseAsset={(url, role) => {
            if (role === 'model') {
              setModel({ url, name: 'Received Model Asset' });
            } else {
              setCloth({ url, name: 'Received Garment Asset' });
            }
            setPageView('studio');
          }}
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

      {/* ============= SPLIT COMPARE VIEW ============= */}
      {pageView === 'compare' && (
        <CompareStudio
          cloth={cloth}
          selectedClothes={selectedClothes}
          classifiedGarments={classifiedGarments}
          previousGarments={previousGarmentsList}
          userGenerations={userGenerations}
          fivePoseItems={fivePoseItems}
          isLight={isLight}
          onClose={() => setPageView('studio')}
          onSetCloth={setCloth}
        />
      )}

      {/* ============= WATERMARK REMOVER VIEW ============= */}
      {pageView === 'watermark' && (
        <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
          <WatermarkRemoverContent user={user} isLight={isLight} />
        </div>
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
                    className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition-all ${active
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
            <div className={`rounded-2xl border p-4 flex flex-wrap items-center justify-between gap-4 ${isLight ? 'border-gray-200 bg-white text-gray-900 shadow-sm' : 'border-white/10 bg-white/[0.02]'
              }`}>
              <div>
                <span className={`text-[10px] font-bold uppercase tracking-wider block mb-1 ${isLight ? 'text-slate-900' : 'text-white/40'}`}>
                  Render Quality
                </span>
                <div className={`inline-flex rounded-full border p-1 ${isLight ? 'border-gray-200 bg-gray-100' : 'border-white/15 bg-black/40'}`}>
                  <button
                    type="button"
                    onClick={() => setQuality('1k')}
                    className={`rounded-full px-3.5 py-1 text-xs font-semibold transition-colors ${quality === '1k'
                      ? isLight ? 'bg-white text-slate-900 font-bold shadow-sm' : 'bg-white text-gray-900'
                      : isLight ? 'text-slate-800 hover:text-slate-950 font-medium' : 'text-white/60 hover:text-white'
                      }`}
                  >
                    1K Standard
                  </button>
                  {isUltraUser ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (quality === '1k') {
                          setShow2kConfirmModal(true);
                        }
                      }}
                      className={`rounded-full px-3.5 py-1 text-xs font-semibold transition-colors flex items-center gap-1.5 ${quality === '2k'
                        ? isLight ? 'bg-white text-slate-900 font-bold shadow-sm' : 'bg-white text-gray-900'
                        : isLight ? 'text-slate-800 hover:text-slate-950 font-medium' : 'text-white/60 hover:text-white'
                        }`}
                      title="Switch to 2K Ultra HD (3 Credits per generation)"
                    >
                      <span>2K Ultra HD</span>
                      <span className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold border ${isLight ? 'bg-purple-100 text-purple-900 border-purple-300' : 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                        }`}>
                        Ultra
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowTierLockModal(true)}
                      className={`rounded-full px-3.5 py-1 text-xs font-semibold transition-colors flex items-center gap-1.5 opacity-60 hover:opacity-100 ${isLight ? 'text-slate-600 hover:text-slate-900' : 'text-white/50 hover:text-white'
                        }`}
                      title="2K Ultra HD locked (Requires Ultra Tier)"
                    >
                      <Lock className="h-3 w-3 text-amber-400" />
                      <span>2K Ultra HD</span>
                      <span className="rounded-full px-1.5 py-0.2 text-[9px] font-bold border border-amber-500/30 bg-amber-500/10 text-amber-400">
                        Locked
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Official Shiv-Naresh HD Vector Branding Engine Setup Card */}
            <div className={`rounded-2xl border p-4 ${isLight ? 'border-gray-200 bg-white text-gray-900 shadow-sm' : 'border-emerald-500/20 bg-emerald-950/10'}`}>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-500 flex items-center gap-1.5">
                    <span>✨ Shiv-Naresh HD Vector Branding Engine</span>
                  </span>
                  <span className="rounded-full px-2 py-0.5 text-[9px] font-bold border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                    Official Company Mark (100% Vector)
                  </span>
                </div>
              </div>

              {/* 2 Big Mode Selector Cards: Option A vs Option B */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => {
                    setActiveRenderOption('a');
                    setShowHdLogoOverlay(false);
                    setShowPantLogo(false);
                  }}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${activeRenderOption === 'a' || (!showHdLogoOverlay && !showPantLogo)
                    ? isLight
                      ? 'border-gray-900 bg-gray-50 ring-1 ring-gray-900 shadow-xs'
                      : 'border-emerald-500 bg-emerald-950/40 ring-1 ring-emerald-500/60 shadow-xs'
                    : isLight
                      ? 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700'
                      : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05] text-white/70'
                    }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <span>👕 Option A: Garment Original Logo</span>
                    </span>
                    {(activeRenderOption === 'a' || (!showHdLogoOverlay && !showPantLogo)) && (
                      <span className="text-[9px] font-bold text-emerald-400">✓ Active</span>
                    )}
                  </div>
                  <p className={`text-[10px] leading-tight ${isLight ? 'text-gray-500' : 'text-white/50'}`}>
                    Use authentic logo from reference photos. Zero duplicates, natural fabric drape.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveRenderOption('b');
                    setShowHdLogoOverlay(true);
                    setShowPantLogo(true);
                    setIsEraseMode(false);
                    setHdLogoScale((prev) => (prev && prev >= 6 ? prev : 48));
                    setPantLogoScale((prev) => (prev && prev >= 6 ? prev : 36));
                  }}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${activeRenderOption === 'b' || (showHdLogoOverlay || showPantLogo)
                    ? isLight
                      ? 'border-gray-900 bg-gray-50 ring-1 ring-gray-900 shadow-xs'
                      : 'border-emerald-500 bg-emerald-950/40 ring-1 ring-emerald-500/60 shadow-xs'
                    : isLight
                      ? 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700'
                      : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05] text-white/70'
                    }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <span>✨ Option B: Vector Replace (Cover-Up)</span>
                    </span>
                    {(activeRenderOption === 'b' || (showHdLogoOverlay || showPantLogo)) && (
                      <span className="text-[9px] font-bold text-emerald-400">✓ Active</span>
                    )}
                  </div>
                  <p className={`text-[10px] leading-tight ${isLight ? 'text-gray-500' : 'text-white/50'}`}>
                    Replace blurry AI logo with 100% crisp vector SVG. Scaled to cover edges without reflection.
                  </p>
                </button>
              </div>

              {(showHdLogoOverlay || showPantLogo) && (
                <div className="space-y-3.5 pt-1">
                  {/* Brand Mode Selector: Both | Upper Only | Bottom Only */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[10px] font-bold uppercase tracking-wider mr-1 ${isLight ? 'text-slate-600' : 'text-white/40'}`}>
                      Targets:
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowHdLogoOverlay(true);
                        setShowPantLogo(true);
                        setHdLogoX(43.5); setHdLogoY(20.5); setHdLogoScale(24);
                        setPantLogoX(63); setPantLogoY(61); setPantLogoScale(20);
                      }}
                      className={`px-3 py-1 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer ${showHdLogoOverlay && showPantLogo
                        ? isLight ? 'bg-gray-900 text-white font-bold' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 font-bold'
                        : isLight ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-white/5 text-white/70 hover:bg-white/10'
                        }`}
                    >
                      🥋 Both (Chest + Pant)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowHdLogoOverlay(true);
                        setShowPantLogo(false);
                        setActiveLogoTarget('chest');
                        setHdLogoX(43.5); setHdLogoY(20.5); setHdLogoScale(22);
                      }}
                      className={`px-3 py-1 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer ${showHdLogoOverlay && !showPantLogo
                        ? isLight ? 'bg-gray-900 text-white font-bold' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 font-bold'
                        : isLight ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-white/5 text-white/70 hover:bg-white/10'
                        }`}
                    >
                      👕 Upper Only (Chest)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowHdLogoOverlay(false);
                        setShowPantLogo(true);
                        setActiveLogoTarget('pant');
                        setPantLogoX(63); setPantLogoY(61); setPantLogoScale(18);
                      }}
                      className={`px-3 py-1 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer ${!showHdLogoOverlay && showPantLogo
                        ? isLight ? 'bg-gray-900 text-white font-bold' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 font-bold'
                        : isLight ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-white/5 text-white/70 hover:bg-white/10'
                        }`}
                    >
                      👖 Bottom Only (Pant)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowHdLogoOverlay(false);
                        setShowPantLogo(false);
                      }}
                      className={`px-3 py-1 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer ${!showHdLogoOverlay && !showPantLogo
                        ? isLight ? 'bg-gray-900 text-white font-bold' : 'bg-white/20 text-white font-bold'
                        : isLight ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-white/5 text-white/70 hover:bg-white/10'
                        }`}
                    >
                      Off
                    </button>
                  </div>

                  {/* 1. Color Selection: Auto-Detect + 10 Sports Presets + 16.7M Color Wheel + Hex Input */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-800' : 'text-white/60'}`}>
                          Logo Color (16.7M Colors)
                        </span>
                        <button
                          type="button"
                          onClick={() => autoDetectContrastColor()}
                          className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 cursor-pointer"
                          title="Automatically detect high-contrast color from garment fabric"
                        >
                          <span>🤖 Auto Match Fabric Contrast</span>
                        </button>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-400 font-bold">{hdLogoColor}</span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {BRAND_COLOR_PRESETS.map((p) => (
                          <button
                            key={p.hex}
                            type="button"
                            onClick={() => setHdLogoColor(p.hex)}
                            title={`${p.name} (${p.hex})`}
                            className={`w-5 h-5 rounded-full border transition-all cursor-pointer ${hdLogoColor.toLowerCase() === p.hex.toLowerCase()
                              ? 'ring-2 ring-emerald-500 scale-110 border-white'
                              : 'border-white/30 opacity-80 hover:opacity-100 hover:scale-105'
                              }`}
                            style={{ backgroundColor: p.hex }}
                          />
                        ))}
                      </div>

                      {/* Native Color Wheel + Hex input */}
                      <div className={`flex items-center gap-1.5 border rounded-full px-2.5 py-0.5 ${isLight ? 'border-gray-300 bg-gray-50' : 'border-emerald-500/30 bg-black/40'}`}>
                        <input
                          type="color"
                          value={hdLogoColor.startsWith('#') && hdLogoColor.length === 7 ? hdLogoColor : '#ffffff'}
                          onChange={(e) => setHdLogoColor(e.target.value)}
                          className="w-4 h-4 rounded-full cursor-pointer border-0 bg-transparent p-0"
                          title="Click for full 16.7M Color Wheel + Browser Eyedropper"
                        />
                        <input
                          type="text"
                          value={hdLogoColor}
                          onChange={(e) => setHdLogoColor(e.target.value)}
                          placeholder="#ffffff"
                          className={`w-16 bg-transparent text-[10px] font-mono outline-none ${isLight ? 'text-gray-800' : 'text-white'}`}
                          maxLength={7}
                        />
                      </div>
                    </div>
                  </div>

                  {/* 2. Position Target Tabs & Flexible Placement Controls */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-800' : 'text-white/60'}`}>
                        Logo Positioning & Calibration:
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveLogoTarget('chest');
                            setShowHdLogoOverlay(true);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${activeLogoTarget === 'chest'
                            ? 'bg-emerald-500 text-white shadow-xs'
                            : isLight ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-white/10 text-white/60 hover:bg-white/15'
                            }`}
                        >
                          👕 Chest Logo {showHdLogoOverlay ? '✓' : '(Off)'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveLogoTarget('pant');
                            setShowPantLogo(true);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${activeLogoTarget === 'pant'
                            ? 'bg-emerald-500 text-white shadow-xs'
                            : isLight ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-white/10 text-white/60 hover:bg-white/15'
                            }`}
                        >
                          👖 Pant Logo {showPantLogo ? '✓' : '(Off)'}
                        </button>
                      </div>
                    </div>

                    {/* Horizontal Side Presets */}
                    <div className="flex items-center gap-2 flex-wrap text-[10px]">
                      <span className={`text-[9px] uppercase font-bold shrink-0 ${isLight ? 'text-gray-500' : 'text-white/40'}`}>
                        Side:
                      </span>
                      {activeLogoTarget === 'chest' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => { setHdLogoX(43.5); setShowHdLogoOverlay(true); }}
                            className={`px-2.5 py-0.5 rounded-full border transition-all cursor-pointer ${hdLogoX <= 45
                              ? 'bg-emerald-500 text-white border-emerald-500 font-bold'
                              : isLight ? 'border-gray-200 bg-white text-gray-700' : 'border-white/10 bg-white/5 text-white/70'
                              }`}
                          >
                            👈 Left Chest
                          </button>
                          <button
                            type="button"
                            onClick={() => { setHdLogoX(50.0); setShowHdLogoOverlay(true); }}
                            className={`px-2.5 py-0.5 rounded-full border transition-all cursor-pointer ${hdLogoX > 45 && hdLogoX < 55
                              ? 'bg-emerald-500 text-white border-emerald-500 font-bold'
                              : isLight ? 'border-gray-200 bg-white text-gray-700' : 'border-white/10 bg-white/5 text-white/70'
                              }`}
                          >
                            🎯 Center
                          </button>
                          <button
                            type="button"
                            onClick={() => { setHdLogoX(58.5); setShowHdLogoOverlay(true); }}
                            className={`px-2.5 py-0.5 rounded-full border transition-all cursor-pointer ${hdLogoX >= 55
                              ? 'bg-emerald-500 text-white border-emerald-500 font-bold'
                              : isLight ? 'border-gray-200 bg-white text-gray-700' : 'border-white/10 bg-white/5 text-white/70'
                              }`}
                          >
                            👉 Right Chest
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => { setPantLogoX(63.0); setShowPantLogo(true); }}
                            className={`px-2.5 py-0.5 rounded-full border transition-all cursor-pointer ${pantLogoX >= 50
                              ? 'bg-emerald-500 text-white border-emerald-500 font-bold'
                              : isLight ? 'border-gray-200 bg-white text-gray-700' : 'border-white/10 bg-white/5 text-white/70'
                              }`}
                          >
                            👈 Left Thigh
                          </button>
                          <button
                            type="button"
                            onClick={() => { setPantLogoX(37.0); setShowPantLogo(true); }}
                            className={`px-2.5 py-0.5 rounded-full border transition-all cursor-pointer ${pantLogoX < 50
                              ? 'bg-emerald-500 text-white border-emerald-500 font-bold'
                              : isLight ? 'border-gray-200 bg-white text-gray-700' : 'border-white/10 bg-white/5 text-white/70'
                              }`}
                          >
                            👉 Right Thigh
                          </button>
                        </>
                      )}
                    </div>

                    {/* Vertical Height Presets */}
                    <div className="flex items-center gap-2 flex-wrap text-[10px]">
                      <span className={`text-[9px] uppercase font-bold shrink-0 ${isLight ? 'text-gray-500' : 'text-white/40'}`}>
                        Height:
                      </span>
                      {activeLogoTarget === 'chest' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setHdLogoY(17.0)}
                            className={`px-2.5 py-0.5 rounded-full border transition-all cursor-pointer ${hdLogoY <= 18
                              ? 'bg-emerald-500 text-white border-emerald-500 font-bold'
                              : isLight ? 'border-gray-200 bg-white text-gray-700' : 'border-white/10 bg-white/5 text-white/70'
                              }`}
                          >
                            ⬆️ High (Collar)
                          </button>
                          <button
                            type="button"
                            onClick={() => setHdLogoY(21.5)}
                            className={`px-2.5 py-0.5 rounded-full border transition-all cursor-pointer ${hdLogoY > 18 && hdLogoY < 24
                              ? 'bg-emerald-500 text-white border-emerald-500 font-bold'
                              : isLight ? 'border-gray-200 bg-white text-gray-700' : 'border-white/10 bg-white/5 text-white/70'
                              }`}
                          >
                            ⏺️ Mid (Standard)
                          </button>
                          <button
                            type="button"
                            onClick={() => setHdLogoY(26.0)}
                            className={`px-2.5 py-0.5 rounded-full border transition-all cursor-pointer ${hdLogoY >= 24
                              ? 'bg-emerald-500 text-white border-emerald-500 font-bold'
                              : isLight ? 'border-gray-200 bg-white text-gray-700' : 'border-white/10 bg-white/5 text-white/70'
                              }`}
                          >
                            ⬇️ Low (Lower Chest)
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setPantLogoY(55.0)}
                            className={`px-2.5 py-0.5 rounded-full border transition-all cursor-pointer ${pantLogoY <= 57
                              ? 'bg-emerald-500 text-white border-emerald-500 font-bold'
                              : isLight ? 'border-gray-200 bg-white text-gray-700' : 'border-white/10 bg-white/5 text-white/70'
                              }`}
                          >
                            ⬆️ High Thigh
                          </button>
                          <button
                            type="button"
                            onClick={() => setPantLogoY(61.0)}
                            className={`px-2.5 py-0.5 rounded-full border transition-all cursor-pointer ${pantLogoY > 57 && pantLogoY < 65
                              ? 'bg-emerald-500 text-white border-emerald-500 font-bold'
                              : isLight ? 'border-gray-200 bg-white text-gray-700' : 'border-white/10 bg-white/5 text-white/70'
                              }`}
                          >
                            ⏺️ Mid Thigh (Standard)
                          </button>
                          <button
                            type="button"
                            onClick={() => setPantLogoY(68.0)}
                            className={`px-2.5 py-0.5 rounded-full border transition-all cursor-pointer ${pantLogoY >= 65
                              ? 'bg-emerald-500 text-white border-emerald-500 font-bold'
                              : isLight ? 'border-gray-200 bg-white text-gray-700' : 'border-white/10 bg-white/5 text-white/70'
                              }`}
                          >
                            ⬇️ Lower Thigh
                          </button>
                        </>
                      )}
                    </div>

                    {/* Precision 1% Nudge Buttons + Size Controls */}
                    <div className={`p-2 rounded-xl border flex items-center justify-between flex-wrap gap-2 ${isLight ? 'border-gray-200 bg-gray-50' : 'border-white/10 bg-black/30'
                      }`}>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[9px] font-bold uppercase tracking-wider ${isLight ? 'text-gray-500' : 'text-white/40'}`}>
                          Nudge 1%:
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (activeLogoTarget === 'chest') setHdLogoY((y) => Math.max(2, Math.round((y - 1) * 10) / 10));
                            else setPantLogoY((y) => Math.max(2, Math.round((y - 1) * 10) / 10));
                          }}
                          className={`w-6 h-6 rounded-md border flex items-center justify-center text-xs cursor-pointer ${isLight ? 'bg-white border-gray-300 text-gray-800 hover:bg-gray-100' : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
                            }`}
                          title="Move Up 1%"
                        >
                          ⬆️
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (activeLogoTarget === 'chest') setHdLogoY((y) => Math.min(98, Math.round((y + 1) * 10) / 10));
                            else setPantLogoY((y) => Math.min(98, Math.round((y + 1) * 10) / 10));
                          }}
                          className={`w-6 h-6 rounded-md border flex items-center justify-center text-xs cursor-pointer ${isLight ? 'bg-white border-gray-300 text-gray-800 hover:bg-gray-100' : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
                            }`}
                          title="Move Down 1%"
                        >
                          ⬇️
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (activeLogoTarget === 'chest') setHdLogoX((x) => Math.max(2, Math.round((x - 1) * 10) / 10));
                            else setPantLogoX((x) => Math.max(2, Math.round((x - 1) * 10) / 10));
                          }}
                          className={`w-6 h-6 rounded-md border flex items-center justify-center text-xs cursor-pointer ${
... [truncated for diff preview]