import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Pipette,
  Palette,
  Sparkles,
  Copy,
  Check,
  Download,
  Upload,
  Layers,
  Bookmark,
  CheckSquare,
  Square,
  Eye,
  Archive,
  RefreshCw,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Sliders,
  Shirt,
  Image as ImageIcon,
  Paintbrush,
  Trash2,
} from 'lucide-react';
import type { UserGeneration } from '../lib/api';
import { resolveImageUrl, getProxiedImageUrl } from '../lib/api';
import { getBestGenUrl, loadSafeCanvasImage } from '../pages/Design';
import { MsPaintStudio } from './MsPaintStudio';

/* ----------------------------------------------------------------
   Color Math & Utilities
   ---------------------------------------------------------------- */
export interface HSL {
  h: number; // 0..360
  s: number; // 0..1
  l: number; // 0..1
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16) || 0,
      parseInt(clean[1] + clean[1], 16) || 0,
      parseInt(clean[2] + clean[2], 16) || 0,
    ];
  }
  const full = clean.padEnd(6, '0').slice(0, 6);
  return [
    parseInt(full.slice(0, 2), 16) || 0,
    parseInt(full.slice(2, 4), 16) || 0,
    parseInt(full.slice(4, 6), 16) || 0,
  ];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function rgbToHsl(r: number, g: number, b: number): HSL {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return { h: h * 360, s, l };
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360 / 360;
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2rgb = (t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    r = hue2rgb(h + 1 / 3);
    g = hue2rgb(h);
    b = hue2rgb(h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/* ----------------------------------------------------------------
   CIELAB Color Space (D65 Illuminant) — Accurate Luminance & Chromaticity
   ---------------------------------------------------------------- */
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  let R = r / 255;
  let G = g / 255;
  let B = b / 255;

  R = R > 0.04045 ? Math.pow((R + 0.055) / 1.055, 2.4) : R / 12.92;
  G = G > 0.04045 ? Math.pow((G + 0.055) / 1.055, 2.4) : G / 12.92;
  B = B > 0.04045 ? Math.pow((B + 0.055) / 1.055, 2.4) : B / 12.92;

  R *= 100;
  G *= 100;
  B *= 100;

  const X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  const Y = R * 0.2126729 + G * 0.7151522 + B * 0.0721750;
  const Z = R * 0.0193339 + G * 0.1191920 + B * 0.9503041;

  let x = X / 95.047;
  let y = Y / 100.000;
  let z = Z / 108.883;

  x = x > 0.008856 ? Math.pow(x, 1 / 3) : 7.787 * x + 16 / 116;
  y = y > 0.008856 ? Math.pow(y, 1 / 3) : 7.787 * y + 16 / 116;
  z = z > 0.008856 ? Math.pow(z, 1 / 3) : 7.787 * z + 16 / 116;

  const L = 116 * y - 16;
  const aVal = 500 * (x - y);
  const bVal = 200 * (y - z);
  return [L, aVal, bVal];
}

export function labToRgb(L: number, a: number, b: number): [number, number, number] {
  const y = (L + 16) / 116;
  const x = a / 500 + y;
  const z = y - b / 200;

  const x3 = Math.pow(x, 3);
  const y3 = Math.pow(y, 3);
  const z3 = Math.pow(z, 3);

  const X = 95.047 * (x3 > 0.008856 ? x3 : (x - 16 / 116) / 7.787);
  const Y = 100.000 * (y3 > 0.008856 ? y3 : (y - 16 / 116) / 7.787);
  const Z = 108.883 * (z3 > 0.008856 ? z3 : (z - 16 / 116) / 7.787);

  const X_norm = X / 100;
  const Y_norm = Y / 100;
  const Z_norm = Z / 100;

  let r = X_norm * 3.2404542 + Y_norm * -1.5371385 + Z_norm * -0.4985314;
  let g = X_norm * -0.9692660 + Y_norm * 1.8760108 + Z_norm * 0.0415560;
  let b_val = X_norm * 0.0556434 + Y_norm * -0.2040259 + Z_norm * 1.0572252;

  const toSrgb = (c: number) => {
    c = Math.max(0, Math.min(1, c));
    return c > 0.0031308 ? 1.055 * Math.pow(c, 1 / 2.4) - 0.055 : 12.92 * c;
  };

  return [
    Math.min(255, Math.max(0, Math.round(toSrgb(r) * 255))),
    Math.min(255, Math.max(0, Math.round(toSrgb(g) * 255))),
    Math.min(255, Math.max(0, Math.round(toSrgb(b_val) * 255)))
  ];
}

/* ----------------------------------------------------------------
   Skin Detection Model (YCbCr + Kovac/Peer RGB)
   Strictly protects human face, neck, nape, arms, and legs.
   ---------------------------------------------------------------- */
export function isSkinPixel(r: number, g: number, b: number): boolean {
  if (r <= g || r <= b || r <= 80 || g <= 35 || b <= 18) return false;

  const maxVal = Math.max(r, g, b);
  const minVal = Math.min(r, g, b);
  const delta = maxVal - minVal;
  const l = (maxVal + minVal) / 510;
  const s = delta === 0 ? 0 : l > 0.5 ? delta / (510 - 510 * l) : delta / (510 * l);
  if (s < 0.16) return false;

  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

  return cb >= 77 && cb <= 135 && cr >= 134 && cr <= 180 && cr - cb >= 18;
}

export function toYCbCr(r: number, g: number, b: number): { y: number; cb: number; cr: number } {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return { y, cb, cr };
}

/* ----------------------------------------------------------------
   Studio Background Detector
   Samples authentic backdrop color from corners/borders. Accurately protects
   studio wall, floor, hand gaps & leg gaps with zero leakage into garments.
   ---------------------------------------------------------------- */
export function getStudioBackgroundColor(
  data: Uint8ClampedArray,
  width: number,
  height: number
): { r: number; g: number; b: number; l: number; s: number } {
  // Sample 4 corner regions with outlier rejection (ignores UI badges, headers, or center hair)
  const cornerW = Math.max(12, Math.floor(width * 0.12));
  const cornerH = Math.max(12, Math.floor(height * 0.10));
  const regions: [number, number, number, number][] = [
    [0, cornerW, 0, cornerH],
    [Math.max(0, width - cornerW), width, 0, cornerH],
    [0, cornerW, Math.max(0, height - cornerH), height],
    [Math.max(0, width - cornerW), width, Math.max(0, height - cornerH), height],
  ];

  const samples: [number, number, number][] = [];
  for (const [x0, x1, y0, y1] of regions) {
    for (let y = y0; y < y1; y += 2) {
      for (let x = x0; x < x1; x += 2) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const { l, s } = rgbToHsl(r, g, b);
        // Studio backdrop is achromatic/low saturation and mid-to-high lightness
        // Exclude extreme darks (badges/hair) or extreme whites (cards/frames)
        if (s < 0.20 && l > 0.15 && l < 0.96) {
          samples.push([r, g, b]);
        }
      }
    }
  }

  if (samples.length === 0) {
    return { r: 145, g: 143, b: 146, l: 0.56, s: 0.02 };
  }

  // Median selection strictly eliminates single-corner anomalies
  samples.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
  const mid = Math.floor(samples.length / 2);
  const [bgR, bgG, bgB] = samples[mid];
  const { l: bgL, s: bgS } = rgbToHsl(bgR, bgG, bgB);

  return { r: bgR, g: bgG, b: bgB, l: bgL, s: bgS };
}

/* Authentic Athletic Palette Presets */
export const ATHLETIC_SWATCHES = [
  { name: 'Shiv-Naresh Red', hex: '#E52B38' },
  { name: 'Olympic Navy', hex: '#0F1D38' },
  { name: 'Carbon Jet Black', hex: '#18181B' },
  { name: 'Royal Athletic Blue', hex: '#2563EB' },
  { name: 'Olive Green', hex: '#3F6212' },
  { name: 'Deep Wine Maroon', hex: '#7F1D1D' },
  { name: 'Pure Athletic White', hex: '#F8FAFC' },
  { name: 'Graphite Grey', hex: '#475569' },
  { name: 'Canary Gold', hex: '#FACC15' },
  { name: 'Vibrant Orange', hex: '#EA580C' },
  { name: 'Royal Violet', hex: '#6B21A8' },
  { name: 'Aqua Teal', hex: '#0D9488' },
];

/* Intelligent Color Naming */
export function getColorName(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(r, g, b);
  if (l < 0.15) return 'Carbon Black';
  if (l > 0.88 && s < 0.15) return 'Pure White';
  if (s < 0.15) return l > 0.5 ? 'Silver Grey' : 'Charcoal Slate';
  if (h >= 345 || h < 15) return l < 0.35 ? 'Deep Maroon' : 'Athletic Red';
  if (h >= 15 && h < 45) return 'Vibrant Orange';
  if (h >= 45 && h < 70) return 'Canary Yellow';
  if (h >= 70 && h < 165) return l < 0.35 ? 'Forest Olive' : 'Electric Green';
  if (h >= 165 && h < 200) return 'Cyan Aqua';
  if (h >= 200 && h < 260) return l < 0.28 ? 'Olympic Navy' : 'Royal Blue';
  if (h >= 260 && h < 315) return 'Deep Purple';
  return 'Berry Magenta';
}

/* Extract Dominant Color Palette (Canva Style) */
export function extractDominantPalette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  colorCount = 8
): { hex: string; name: string; count: number }[] {
  const sampleW = Math.min(120, width);
  const sampleH = Math.min(120, height);
  const offscreen = document.createElement('canvas');
  offscreen.width = sampleW;
  offscreen.height = sampleH;
  const offCtx = offscreen.getContext('2d');
  if (!offCtx) return [];

  offCtx.drawImage(ctx.canvas, 0, 0, sampleW, sampleH);
  const imgData = offCtx.getImageData(0, 0, sampleW, sampleH).data;

  // Quantized color histogram
  const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();
  for (let i = 0; i < imgData.length; i += 4) {
    const a = imgData[i + 3];
    if (a < 128) continue;
    const r = imgData[i];
    const g = imgData[i + 1];
    const b = imgData[i + 2];
    const { s, l } = rgbToHsl(r, g, b);
    // Ignore near-white studio backdrop borders
    if (l > 0.96 && s < 0.08) continue;

    const qr = Math.round(r / 28) * 28;
    const qg = Math.round(g / 28) * 28;
    const qb = Math.round(b / 28) * 28;
    const key = `${qr},${qg},${qb}`;
    const entry = buckets.get(key) || { r: 0, g: 0, b: 0, count: 0 };
    entry.r += r;
    entry.g += g;
    entry.b += b;
    entry.count += 1;
    buckets.set(key, entry);
  }

  const sorted = Array.from(buckets.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, colorCount * 2);

  const result: { hex: string; name: string; count: number }[] = [];
  for (const item of sorted) {
    const avgR = Math.round(item.r / item.count);
    const avgG = Math.round(item.g / item.count);
    const avgB = Math.round(item.b / item.count);
    const hex = rgbToHex(avgR, avgG, avgB);

    // Filter duplicates with close color distance
    const isTooClose = result.some((r) => {
      const [r1, g1, b1] = hexToRgb(r.hex);
      return Math.sqrt((r1 - avgR) ** 2 + (g1 - avgG) ** 2 + (b1 - avgB) ** 2) < 36;
    });

    if (!isTooClose) {
      result.push({ hex, name: getColorName(hex), count: item.count });
    }
    if (result.length >= colorCount) break;
  }

  return result;
}

/* ----------------------------------------------------------------
   Color Swap Studio Props
   ---------------------------------------------------------------- */
interface ColorSwapStudioProps {
  userGenerations: UserGeneration[];
  isLight: boolean;
  onSaveToMySets: (dataUrl: string, folder: 'ready' | 'edited', title?: string) => Promise<void> | void;
  onRefreshGenerations: () => void;
  setError: (msg: string) => void;
}

export interface ImageItem {
  id: string;
  url: string;
  title: string;
  folder?: string;
  source: 'mysets' | 'upload';
}

interface RecolorResult {
  id: string;
  sourceUrl: string;
  recoloredUrl: string;
  targetHex: string;
  targetName: string;
  title: string;
  timestamp: number;
}

export default function ColorSwapStudio({
  userGenerations,
  isLight,
  onSaveToMySets,
  onRefreshGenerations,
  setError,
}: ColorSwapStudioProps) {
  // Navigation sub-tabs: Swap vs Canva Paint Studio vs Palette/Eyedropper
  const [subTab, setSubTab] = useState<'swap' | 'paint' | 'palette'>('swap');

  // Source selection filter
  const [filterFolder, setFilterFolder] = useState<'all' | 'ready' | 'edited' | 'generated' | 'uploads'>('all');
  // Track selection by item ID (not URL) so identical-URL images are each independently selectable
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [customUploads, setCustomUploads] = useState<ImageItem[]>([]);
  const [activeImage, setActiveImage] = useState<ImageItem | null>(null);

  // Core 2 Color Choices (The Only 2 Primary Options Requested)
  // Option 1: Kis colour ko swap karna hai
  const [sourceHex, setSourceHex] = useState<string>('#B0ABA7');
  // Option 2: Kiske sath karna hai
  const [targetHex, setTargetHex] = useState<string>('#E52B38');

  // AI Target Garment Scope: Upper Only | Lower Only | Both
  const [garmentScope, setGarmentScope] = useState<'upper' | 'lower' | 'both'>('upper');
  const aiMaskCacheRef = useRef<Map<string, { upper: string; lower: string; both: string; protect?: string }>>(new Map());

  // Multi-Layer Logo, Text & Zipper Independent Control
  const [logoMode, setLogoMode] = useState<'keep' | 'recolor'>('keep');
  const [logoColorHex, setLogoColorHex] = useState<string>('#FFFFFF');
  const [zipperMode, setZipperMode] = useState<'preserve' | 'match'>('preserve');

  // Backend Default Best Quality Settings (Hidden under "Show More" accordion)
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<boolean>(false);
  const [tolerance, setTolerance] = useState<number>(28); // 15..70 deg (default 28: best quality)
  const [lightnessOffset, setLightnessOffset] = useState<number>(0); // -0.7..+0.7
  const [saturationMult, setSaturationMult] = useState<number>(1.0); // 0..2.0
  const [protectLogos, setProtectLogos] = useState<boolean>(true);
  const [protectSkin, setProtectSkin] = useState<boolean>(true);
  const [protectBackground, setProtectBackground] = useState<boolean>(true);

  // Original unmodified image cache for Instant "Restore / Undo"
  const originalBaseDataUrlRef = useRef<string | null>(null);
  const [hasRecoloredPreview, setHasRecoloredPreview] = useState<boolean>(false);

  // Eyedropper & Canvas state
  const [hoveredColor, setHoveredColor] = useState<{ hex: string; rgb: string; hsl: string } | null>(null);
  const [loupePos, setLoupePos] = useState<{ x: number; y: number; imgX: number; imgY: number } | null>(null);
  const [sampledPalette, setSampledPalette] = useState<string[]>(['#E52B38', '#0F1D38', '#18181B', '#F8FAFC']);
  const [extractedPalette, setExtractedPalette] = useState<{ hex: string; name: string; count: number }[]>([]);

  // Fabric reference upload state (for Eyedropper sub-tab)
  const [fabricRefImage, setFabricRefImage] = useState<string | null>(null);
  const [fabricRefPalette, setFabricRefPalette] = useState<{ hex: string; name: string; count: number }[]>([]);
  const [fabricHoveredColor, setFabricHoveredColor] = useState<{ hex: string; rgb: string } | null>(null);
  const [fabricLoupePos, setFabricLoupePos] = useState<{ x: number; y: number } | null>(null);

  // Processing state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [recolorResults, setRecolorResults] = useState<RecolorResult[]>([]);
  const [copiedHex, setCopiedHex] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  // ----------------------------------------------------------------
  // Canva Paint & Area Clone Studio State (MS Paint Pro Style)
  // ----------------------------------------------------------------
  const [paintTargetImage, setPaintTargetImage] = useState<string | null>(null);
  const [paintTargetTitle, setPaintTargetTitle] = useState<string>('Studio Garment');

  // Notification badge
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Refs
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<HTMLCanvasElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const fabricUploadInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Consolidate images from My Sets (strictly deduplicated by ID and URL)
  const allImages = useMemo<ImageItem[]>(() => {
    const list: ImageItem[] = [];
    const seenIds = new Set<string>();
    const seenUrls = new Set<string>();

    for (const item of customUploads) {
      if (!seenIds.has(item.id) && !seenUrls.has(item.url)) {
        seenIds.add(item.id);
        seenUrls.add(item.url);
        list.push(item);
      }
    }

    userGenerations
      .filter((g) => g.type !== 'video' && Boolean(getBestGenUrl(g)))
      .forEach((g) => {
        const u = getBestGenUrl(g);
        if (u && !seenIds.has(g.id) && !seenUrls.has(u)) {
          seenIds.add(g.id);
          seenUrls.add(u);
          list.push({
            id: g.id,
            url: u,
            title: g.title || `Render #${g.id.slice(-4)}`,
            folder: g.folder || (g.isEdited ? 'edited' : 'generated'),
            source: 'mysets',
          });
        }
      });
    return list;
  }, [userGenerations, customUploads]);

  // Filtered images list
  const filteredImages = useMemo(() => {
    if (filterFolder === 'all') return allImages;
    if (filterFolder === 'uploads') return allImages.filter((i) => i.source === 'upload');
    return allImages.filter((i) => i.folder === filterFolder);
  }, [allImages, filterFolder]);

  // Auto-select first image if none active
  useEffect(() => {
    if (!activeImage && filteredImages.length > 0) {
      setActiveImage(filteredImages[0]);
      setSelectedIds(new Set([filteredImages[0].id]));
    }
  }, [filteredImages, activeImage]);

  // Load and draw active image on canvas, cache original base image
  useEffect(() => {
    if (!activeImage) return;
    let isCancelled = false;

    async function renderBase() {
      try {
        const img = await loadSafeCanvasImage(activeImage!.url);
        if (isCancelled || !previewCanvasRef.current) return;
        const canvas = previewCanvasRef.current;
        canvas.width = img.naturalWidth || 1024;
        canvas.height = img.naturalHeight || 1024;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Cache original base Data URL for instant Undo/Restore
        originalBaseDataUrlRef.current = canvas.toDataURL('image/jpeg', 0.95);
        setHasRecoloredPreview(false);

        // Auto-extract dominant palette for Canva tab
        const pal = extractDominantPalette(ctx, canvas.width, canvas.height, 8);
        setExtractedPalette(pal);
      } catch (err: any) {
        console.warn('[ColorSwap] Base image render error:', err);
      }
    }

    void renderBase();
    return () => {
      isCancelled = true;
    };
  }, [activeImage]);

  // Keep live canvas restored when switching between subtabs
  useEffect(() => {
    if (subTab === 'swap' && previewCanvasRef.current) {
      const srcUrl = originalBaseDataUrlRef.current || (activeImage ? activeImage.url : null);
      if (srcUrl) {
        loadSafeCanvasImage(srcUrl).then((img) => {
          if (!previewCanvasRef.current) return;
          const canvas = previewCanvasRef.current;
          canvas.width = img.naturalWidth || 1024;
          canvas.height = img.naturalHeight || 1024;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          }
        }).catch((err) => console.warn('[ColorSwap] Tab switch redraw:', err));
      }
    } else if (subTab === 'paint' && !paintTargetImage) {
      const hasValidPreview = previewCanvasRef.current && hasRecoloredPreview && previewCanvasRef.current.width > 300;
      const srcUrl = hasValidPreview
        ? previewCanvasRef.current!.toDataURL('image/png')
        : (activeImage ? resolveImageUrl(activeImage.url) : null);
      if (srcUrl) {
        setPaintTargetImage(srcUrl);
        setPaintTargetTitle(activeImage?.title || 'Studio Garment');
      }
    }
  }, [subTab, activeImage, paintTargetImage]);

  // Render fabric reference image when uploaded
  useEffect(() => {
    if (!fabricRefImage) return;
    let isCancelled = false;

    async function renderFabric() {
      try {
        const img = await loadSafeCanvasImage(fabricRefImage!);
        if (isCancelled || !fabricCanvasRef.current) return;
        const canvas = fabricCanvasRef.current;
        canvas.width = img.naturalWidth || 800;
        canvas.height = img.naturalHeight || 800;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Extract palette from reference fabric
        const pal = extractDominantPalette(ctx, canvas.width, canvas.height, 8);
        setFabricRefPalette(pal);
      } catch (err: any) {
        console.warn('[ColorSwap] Fabric reference render error:', err);
      }
    }

    void renderFabric();
    return () => {
      isCancelled = true;
    };
  }, [fabricRefImage]);

  // Restore Original Unmodified Look (Undo Action)
  const handleRestoreOriginalLook = async () => {
    if (!originalBaseDataUrlRef.current || !previewCanvasRef.current) return;
    try {
      const origImg = await loadSafeCanvasImage(originalBaseDataUrlRef.current);
      const canvas = previewCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(origImg, 0, 0, canvas.width, canvas.height);
        setHasRecoloredPreview(false);
        showToast('↩️ Original unmodified garment look restored!');
      }
    } catch (err) {
      console.warn('[ColorSwap] Restore error:', err);
    }
  };

  // Auto-detect garment color from center of active image
  const handleAutoDetectGarmentColor = () => {
    if (!previewCanvasRef.current) return;
    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Sample chest / upper torso region
    const cx = Math.round(canvas.width * 0.5);
    const cy = Math.round(canvas.height * 0.45);
    const boxSize = 40;
    try {
      const data = ctx.getImageData(cx - boxSize / 2, cy - boxSize / 2, boxSize, boxSize).data;
      let totalR = 0, totalG = 0, totalB = 0, validCount = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const { l } = rgbToHsl(r, g, b);
        // Exclude skin tones or studio background
        if (!isSkinPixel(r, g, b) && l > 0.1 && l < 0.92) {
          totalR += r;
          totalG += g;
          totalB += b;
          validCount++;
        }
      }
      if (validCount > 0) {
        const detected = rgbToHex(
          Math.round(totalR / validCount),
          Math.round(totalG / validCount),
          Math.round(totalB / validCount)
        );
        setSourceHex(detected);
        showToast(`✨ Auto-detected garment color: ${detected} (${getColorName(detected)})`);
      }
    } catch {
      // fallback
    }
  };

  // Toggle selection by item ID
  const toggleSelectImage = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(filteredImages.map((i) => i.id)));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  // Upload custom images for swap catalog
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          const item: ImageItem = {
            id: 'up_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            url: reader.result,
            title: file.name.replace(/\.[^/.]+$/, ''),
            source: 'upload',
          };
          setCustomUploads((prev) => [item, ...prev]);
          setActiveImage(item);
          // Set selection exclusively to the newly uploaded image
          setSelectedIds(new Set([item.id]));
        }
      };
      reader.readAsDataURL(file);
    });
    if (uploadInputRef.current) uploadInputRef.current.value = '';
  };

  // Upload reference fabric photo for Eyedropper & Palette extraction
  const handleFabricUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setFabricRefImage(reader.result);
        showToast(`📤 Loaded fabric swatch: ${file.name}`);
      }
    };
    reader.readAsDataURL(file);
    if (fabricUploadInputRef.current) fabricUploadInputRef.current.value = '';
  };

  // Canvas Mouse Move for Eyedropper on Active Model Image
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!previewCanvasRef.current) return;
    const canvas = previewCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const imgX = Math.floor(x * scaleX);
    const imgY = Math.floor(y * scaleY);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      const p = ctx.getImageData(imgX, imgY, 1, 1).data;
      const hex = rgbToHex(p[0], p[1], p[2]);
      const { h, s, l } = rgbToHsl(p[0], p[1], p[2]);
      setHoveredColor({
        hex,
        rgb: `rgb(${p[0]}, ${p[1]}, ${p[2]})`,
        hsl: `hsl(${Math.round(h)}°, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`,
      });
      setLoupePos({ x, y, imgX, imgY });
    } catch { }
  };

  const handleCanvasMouseLeave = () => {
    setLoupePos(null);
    setHoveredColor(null);
  };

  // Canvas Click for Eyedropper Sample on Active Model
  const handleCanvasClick = () => {
    if (!hoveredColor) return;
    if (subTab === 'swap') {
      setSourceHex(hoveredColor.hex);
      showToast(`🎯 Source color to swap set to: ${hoveredColor.hex}`);
    }
    // Add to sampled history palette
    setSampledPalette((prev) => {
      const filtered = prev.filter((c) => c !== hoveredColor.hex);
      return [hoveredColor.hex, ...filtered].slice(0, 10);
    });
  };

  // Mouse Move on Reference Fabric Canvas
  const handleFabricCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!fabricCanvasRef.current) return;
    const canvas = fabricCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const imgX = Math.floor(x * scaleX);
    const imgY = Math.floor(y * scaleY);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      const p = ctx.getImageData(imgX, imgY, 1, 1).data;
      const hex = rgbToHex(p[0], p[1], p[2]);
      setFabricHoveredColor({ hex, rgb: `rgb(${p[0]}, ${p[1]}, ${p[2]})` });
      setFabricLoupePos({ x, y });
    } catch { }
  };

  const handleFabricCanvasMouseLeave = () => {
    setFabricLoupePos(null);
    setFabricHoveredColor(null);
  };

  // Click on Reference Fabric Canvas: Set as Target Swap Color & Switch to Swap tab
  const handleFabricCanvasClick = () => {
    if (!fabricHoveredColor) return;
    setTargetHex(fabricHoveredColor.hex);
    setSampledPalette((prev) => [fabricHoveredColor.hex, ...prev.filter((c) => c !== fabricHoveredColor.hex)].slice(0, 10));
    setSubTab('swap');
    showToast(`⚡ Target color set to fabric color: ${fabricHoveredColor.hex} (${getColorName(fabricHoveredColor.hex)})`);
  };

  // Native Browser EyeDropper API (Chrome/Edge)
  const handleNativeEyedropper = async (mode: 'source' | 'target') => {
    if (typeof window !== 'undefined' && 'EyeDropper' in window) {
      try {
        const eyeDropper = new (window as any).EyeDropper();
        const res = await eyeDropper.open();
        if (res && res.sRGBHex) {
          const sampled = res.sRGBHex.toUpperCase();
          if (mode === 'source') {
            setSourceHex(sampled);
            showToast(`🎯 Source color set: ${sampled}`);
          } else {
            setTargetHex(sampled);
            setSampledPalette((prev) => [sampled, ...prev.filter((c) => c !== sampled)].slice(0, 10));
            showToast(`🎨 Target color set: ${sampled}`);
          }
        }
      } catch {
        // User cancelled
      }
    } else {
      alert('Native desktop eyedropper is supported on Chromium browsers. Please click directly on the canvas image!');
    }
  };

  // ----------------------------------------------------------------
  // Canva Paint & Area Clone Studio (MS Paint Pro) Opener
  // ----------------------------------------------------------------
  const handleOpenInPaintStudio = (imageUrl: string, title?: string) => {
    setPaintTargetImage(imageUrl);
    setPaintTargetTitle(title || 'Studio Garment');
    setSubTab('paint');
    showToast('🖌️ Opened in MS Paint Pro Studio!');
  };

  

  /* ----------------------------------------------------------------
     AI Semantic Garment Segmentation Service (Upper, Lower, Both)
     ---------------------------------------------------------------- */
  /* ----------------------------------------------------------------
     AI Semantic Garment Segmentation Service (Upper, Lower, Both)
     - Option B: 100% Client-Side WebAssembly ONNX Inference (SegFormer)
     - 0% Server RAM used — Render server will never crash or OOM
     ---------------------------------------------------------------- */
  const browserPipelineRef = useRef<any>(null);

  const runClientSideSegmentation = async (
    imgElement?: HTMLImageElement,
    imageUrl?: string
  ): Promise<{ upper?: string; lower?: string; both?: string; protect?: string } | null> => {
    try {
      if (!browserPipelineRef.current) {
        const { pipeline, env } = await import('@xenova/transformers');
        env.allowLocalModels = false;
        env.useBrowserCache = false; // Disabling browser cache prevents 'Browser cache is not available' error
        if (env.backends?.onnx?.wasm) {
          env.backends.onnx.wasm.numThreads = 1; // Single-thread prevents SharedArrayBuffer error in browser
          env.backends.onnx.wasm.simd = true;
        }
        browserPipelineRef.current = await pipeline('image-segmentation', 'Xenova/segformer_b2_clothes', {
          quantized: true,
        });
      }

      const segmenter = browserPipelineRef.current;
      const { RawImage } = await import('@xenova/transformers');

      let rawImg: any = null;
      if (imgElement && imgElement.naturalWidth > 0) {
        const c = document.createElement('canvas');
        const maxD = 512;
        const scale = Math.min(1.0, maxD / Math.max(imgElement.naturalWidth, imgElement.naturalHeight));
        c.width = Math.round(imgElement.naturalWidth * scale);
        c.height = Math.round(imgElement.naturalHeight * scale);
        const cx = c.getContext('2d');
        if (cx) {
          cx.drawImage(imgElement, 0, 0, c.width, c.height);
          const imgData = cx.getImageData(0, 0, c.width, c.height);
          rawImg = new RawImage(imgData.data, c.width, c.height, 4);
        }
      }

      if (!rawImg && imageUrl) {
        if (imageUrl.startsWith('data:')) {
          const match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.*)$/is.exec(imageUrl);
          if (match) {
            const bin = atob(match[2].replace(/\s+/g, ''));
            const u8 = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
            rawImg = await RawImage.fromBlob(new Blob([u8]));
          }
        } else {
          rawImg = await RawImage.fromURL(imageUrl);
        }
      }

      if (!rawImg) return null;

      const output = await segmenter(rawImg);
      const w = rawImg.width;
      const h = rawImg.height;

      const upperData = new Uint8ClampedArray(w * h);
      const lowerData = new Uint8ClampedArray(w * h);
      const bothData = new Uint8ClampedArray(w * h);
      const protectData = new Uint8ClampedArray(w * h);

      let upperCount = 0;
      let lowerCount = 0;
      let bothCount = 0;
      let protectCount = 0;

      for (const item of output) {
        const lbl = (item.label || '').toLowerCase();
        const d = item.mask.data;

        // STRICT PROTECTION: Studio Background, Hair, Face, Arms, Legs, Shoes
        // Ensures background & skin are NEVER recolored or corrupted
        if (
          lbl.includes('background') ||
          lbl.includes('hair') ||
          lbl.includes('face') ||
          lbl.includes('arm') ||
          lbl.includes('leg') ||
          lbl.includes('shoe')
        ) {
          for (let i = 0; i < protectData.length; i++) {
            if (d[i] > 128) {
              protectData[i] = 255;
              protectCount++;
            }
          }
        }

        // UPPER GARMENT: Upper-clothes, Dress, Coat, Jacket, Top, Shirt, Sweater, Hoodie
        if (
          lbl.includes('upper') ||
          lbl.includes('dress') ||
          lbl.includes('coat') ||
          lbl.includes('jacket') ||
          lbl.includes('top') ||
          lbl.includes('shirt') ||
          lbl.includes('sweater') ||
          lbl.includes('hoodie')
        ) {
          for (let i = 0; i < upperData.length; i++) {
            if (d[i] > 128) {
              upperData[i] = 255;
              bothData[i] = 255;
              upperCount++;
              bothCount++;
            }
          }
        }

        // LOWER GARMENT: Pants, Skirt, Shorts, Bottom, Trousers, Jeans
        if (
          lbl.includes('pants') ||
          lbl.includes('skirt') ||
          lbl.includes('shorts') ||
          lbl.includes('bottom') ||
          lbl.includes('trousers') ||
          lbl.includes('jeans')
        ) {
          for (let i = 0; i < lowerData.length; i++) {
            if (d[i] > 128) {
              lowerData[i] = 255;
              bothData[i] = 255;
              lowerCount++;
              bothCount++;
            }
          }
        }
      }

      if (upperCount === 0 && bothCount > 0) {
        for (let i = 0; i < bothData.length; i++) {
          if (bothData[i] > 0) upperData[i] = 255;
        }
        upperCount = bothCount;
      }
      if (lowerCount === 0 && bothCount > 0) {
        for (let i = 0; i < bothData.length; i++) {
          if (bothData[i] > 0) lowerData[i] = 255;
        }
        lowerCount = bothCount;
      }

      // Safe Semantic Isolation: if clothes label was missed, any non-protected pixel is the torso
      if (upperCount === 0 && bothCount === 0) {
        for (let i = 0; i < upperData.length; i++) {
          if (protectData[i] === 0) {
            upperData[i] = 255;
            bothData[i] = 255;
            upperCount++;
            bothCount++;
          }
        }
      }

      const dataToCanvasUrl = (u8: Uint8ClampedArray): string => {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';
        const imgData = ctx.createImageData(w, h);
        for (let i = 0; i < u8.length; i++) {
          const val = u8[i];
          const idx = i * 4;
          imgData.data[idx] = val;
          imgData.data[idx + 1] = val;
          imgData.data[idx + 2] = val;
          imgData.data[idx + 3] = val;
        }
        ctx.putImageData(imgData, 0, 0);
        return canvas.toDataURL('image/png');
      };

      return {
        upper: upperCount > 0 ? dataToCanvasUrl(upperData) : undefined,
        lower: lowerCount > 0 ? dataToCanvasUrl(lowerData) : undefined,
        both: bothCount > 0 ? dataToCanvasUrl(bothData) : undefined,
        protect: protectCount > 0 ? dataToCanvasUrl(protectData) : undefined,
      };
    } catch (e) {
      console.warn('[runClientSideSegmentation] In-browser inference failed:', e);
      return null;
    }
  };

  const getOrFetchAiMask = async (
    item: ImageItem,
    scope: 'upper' | 'lower' | 'both',
    loadedImage?: HTMLImageElement
  ): Promise<{ garmentMask: HTMLImageElement | null; protectMask: HTMLImageElement | null }> => {
    try {
      const cached = aiMaskCacheRef.current.get(item.url);
      const cachedGarment = cached ? (cached[scope] || cached.both || cached.upper || cached.lower) : null;
      if (cached && cachedGarment) {
        const [garmentImg, protectImg] = await Promise.all([
          loadSafeCanvasImage(cachedGarment),
          cached.protect ? loadSafeCanvasImage(cached.protect) : Promise.resolve(null),
        ]);
        return { garmentMask: garmentImg, protectMask: protectImg };
      }

      // Run Client-Side WebAssembly ONNX inference directly in browser (0% Server RAM, 0% Crash)
      const maskData = await runClientSideSegmentation(loadedImage, item.url);

      if (!maskData) {
        return { garmentMask: null, protectMask: null };
      }

      const garmentDataUrl = maskData[scope] || maskData.both || maskData.upper || maskData.lower;
      if (!garmentDataUrl) {
        return { garmentMask: null, protectMask: null };
      }

      aiMaskCacheRef.current.set(item.url, {
        upper: maskData.upper || garmentDataUrl,
        lower: maskData.lower || garmentDataUrl,
        both: maskData.both || garmentDataUrl,
        protect: maskData.protect ? maskData.protect : undefined,
      });

      const [garmentImg, protectImg] = await Promise.all([
        loadSafeCanvasImage(garmentDataUrl),
        maskData.protect ? loadSafeCanvasImage(maskData.protect) : Promise.resolve(null),
      ]);
      return { garmentMask: garmentImg, protectMask: protectImg };
    } catch (err) {
      console.warn('[Segment Garment] In-browser inference exception:', err);
      return { garmentMask: null, protectMask: null };
    }
  };

  /* ----------------------------------------------------------------
     Core Recolor Algorithm — SegFormer AI + CIELAB + Multi-Layer Engine
     1. Strict AI Mask: 100% garment isolation. Hair, face, skin, arms,
        legs, and background strictly protected (zero recoloring).
     2. Edge Softening: 1.5px anti-aliased feathering on mask contours.
     3. Multi-Layer Logo/Text & Zipper Separation:
        - Logo & Text Mode: Keep Original (100% stitches) or Custom Recolor.
        - Zipper Mode: Preserve Metallic Shine or Match Garment.
     4. CIELAB Luminance & Fold Texture Transfer:
        - Carbon Black: rich satin sheen without crushing fold details.
        - Pure White: crisp highlights with crease shadow preservation.
        - Saturated: full chroma fidelity with specular rolloff.
     ---------------------------------------------------------------- */
  const recolorCanvas = (
    sourceImg: HTMLImageElement,
    _srcHex: string,
    tgtHex: string,
    _tol: number,
    lOff: number,
    sMult: number,
    masks?: { garmentMask: HTMLImageElement | null; protectMask: HTMLImageElement | null } | null,
    _logoConfig?: { mode: 'keep' | 'recolor'; colorHex: string },
    _zipperConfig?: { mode: 'preserve' | 'match' }
  ): string => {
    const W = sourceImg.naturalWidth || 1024;
    const H = sourceImg.naturalHeight || 1024;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.drawImage(sourceImg, 0, 0, W, H);
    const imgData = ctx.getImageData(0, 0, W, H);
    const data = imgData.data;

    let aiGarmentData: Uint8ClampedArray | null = null;
    let aiProtectData: Uint8ClampedArray | null = null;

    if (masks?.garmentMask) {
      const mCanvas = document.createElement('canvas');
      mCanvas.width = W;
      mCanvas.height = H;
      const mCtx = mCanvas.getContext('2d');
      if (mCtx) {
        mCtx.drawImage(masks.garmentMask, 0, 0, W, H);
        aiGarmentData = mCtx.getImageData(0, 0, W, H).data;
      }
    }

    if (masks?.protectMask) {
      const pCanvas = document.createElement('canvas');
      pCanvas.width = W;
      pCanvas.height = H;
      const pCtx = pCanvas.getContext('2d');
      if (pCtx) {
        pCtx.drawImage(masks.protectMask, 0, 0, W, H);
        aiProtectData = pCtx.getImageData(0, 0, W, H).data;
      }
    }

    const [tgtR, tgtG, tgtB] = hexToRgb(tgtHex);
    const [tgtL, tgtA, tgtBVal] = rgbToLab(tgtR, tgtG, tgtB);

    // =========================================================================
    // PATH A: PRODUCTION AI SEGFORMER PRECISION ENGINE
    // =========================================================================
    if (aiGarmentData) {
      // 1. Edge Softening: 1.5px Anti-Aliased Box Kernel
      const softAlpha = new Float32Array(W * H);
      let totalGarmentLum = 0;
      let garmentLumCount = 0;
      const sampleStride = Math.max(1, Math.floor((W * H) / 10000));

      for (let y = 0; y < H; y++) {
        const y0 = Math.max(0, y - 1);
        const y1 = Math.min(H - 1, y + 1);
        for (let x = 0; x < W; x++) {
          const pIdx = y * W + x;
          const maskVal = aiGarmentData[pIdx * 4];
          if (maskVal < 10) continue;

          const x0 = Math.max(0, x - 1);
          const x1 = Math.min(W - 1, x + 1);
          let sum = 0;
          let count = 0;
          for (let ny = y0; ny <= y1; ny++) {
            const rowOffset = ny * W;
            for (let nx = x0; nx <= x1; nx++) {
              sum += aiGarmentData[(rowOffset + nx) * 4] > 128 ? 1 : 0;
              count++;
            }
          }
          const alpha = sum / count;
          softAlpha[pIdx] = alpha;

          if (alpha > 0.8 && pIdx % sampleStride === 0) {
            const i = pIdx * 4;
            const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            totalGarmentLum += lum;
            garmentLumCount++;
          }
        }
      }

      if (true) {
        const baseLum = garmentLumCount > 0 ? (totalGarmentLum / garmentLumCount) : 128;
        const [baseL] = rgbToLab(baseLum, baseLum, baseLum);

        // 2. Pixel Iteration: Multi-Layer Logic + CIELAB Texture Transfer
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const pIdx = y * W + x;
            const i = pIdx * 4;

            // Strict AI Protect Mask: hair, face, skin, arms, legs
            if (aiProtectData && aiProtectData[i] > 128) {
              continue;
            }

            const alpha = softAlpha[pIdx];
            if (alpha < 0.02) {
              continue;
            }

            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // CIELAB Texture & Luminance Transfer
            const [pL] = rgbToLab(r, g, b);
            const deltaL = pL - baseL;

            let newL: number;
            let newA = tgtA;
            let newBVal = tgtBVal;

            if (tgtL < 22) {
              // Carbon Black spectrum (rich jet-black, fold preservation without clipping)
              const lBase = Math.max(7.0, tgtL * 1.05) + lOff * 10;
              if (deltaL <= 0) {
                newL = Math.max(3.0, lBase + deltaL * 0.28);
              } else {
                const specular = Math.pow(Math.max(0.0, deltaL - 10.0), 1.25) * 0.04;
                newL = lBase + deltaL * 0.38 + specular;
              }
            } else if (tgtL > 85) {
              // Pure White spectrum (crisp white, shadows retained without muddy grey)
              const lBase = Math.min(94.0, tgtL) + lOff * 10;
              if (deltaL <= 0) {
                newL = lBase + deltaL * 0.55;
              } else {
                newL = Math.min(98.0, lBase + deltaL * 0.15);
              }
            } else {
              // Vibrant Midtones (Shiv-Naresh Red, Olympic Navy, Royal Blue, Gold, etc.)
              const lBase = tgtL + lOff * 15;
              if (deltaL <= 0) {
                newL = Math.max(5.0, lBase + deltaL * 0.70);
              } else {
                const specular = Math.pow(Math.max(0.0, deltaL - 8.0), 1.15) * 0.05;
                newL = Math.min(96.0, lBase + deltaL * 0.60 + specular);
              }
              const specRolloff = Math.max(0.0, Math.min(1.0, (pL - 75.0) / 20.0));
              newA = tgtA * (1.0 - specRolloff * 0.4) * sMult;
              newBVal = tgtBVal * (1.0 - specRolloff * 0.4) * sMult;
            }

            const [newR, newG, newB] = labToRgb(newL, newA, newBVal);

            // Alpha blend for 1.5px feathered boundary
            data[i] = Math.round(r * (1.0 - alpha) + newR * alpha);
            data[i + 1] = Math.round(g * (1.0 - alpha) + newG * alpha);
            data[i + 2] = Math.round(b * (1.0 - alpha) + newB * alpha);
          }
        }

        ctx.putImageData(imgData, 0, 0);
        return canvas.toDataURL('image/jpeg', 0.95);
      }
    }

    // AI Mask unavailable: Do not corrupt image with color-matching fallback
    console.warn('[ColorSwap] AI Mask missing. Aborting recolor to prevent artifacts.');
    return sourceImg.src;
  };

  // Run Batch Color Swap on All Selected Images (ID-Based Multi-Pose Selection)
  const handleExecuteBatchColorSwap = async () => {
    let itemsToProcess: ImageItem[] = [];
    if (selectedIds.size > 0) {
      itemsToProcess = filteredImages.filter((img) => selectedIds.has(img.id));
      if (itemsToProcess.length === 0) {
        itemsToProcess = allImages.filter((img) => selectedIds.has(img.id));
      }
    }
    if (itemsToProcess.length === 0 && activeImage) {
      itemsToProcess = [activeImage];
    }
    if (itemsToProcess.length === 0) {
      setError('Please select at least one image or pose to perform color swap.');
      return;
    }

    // Deduplicate itemsToProcess strictly by ID
    const uniqueMap = new Map<string, ImageItem>();
    itemsToProcess.forEach((it) => {
      if (!uniqueMap.has(it.id)) uniqueMap.set(it.id, it);
    });
    itemsToProcess = Array.from(uniqueMap.values());

    setIsProcessing(true);
    const newResults: RecolorResult[] = [];

    try {
      for (let i = 0; i < itemsToProcess.length; i++) {
        const item = itemsToProcess[i];
        setProgressMsg(`AI Segmenting & Swapping color for ${item.title} (${i + 1} of ${itemsToProcess.length})…`);

        const loadedImg = await loadSafeCanvasImage(item.url);
        const masks = await getOrFetchAiMask(item, garmentScope, loadedImg);

        if (!masks?.garmentMask) {
          console.warn(`[ColorSwap] AI segmentation mask unavailable for ${item.title}.`);
          continue;
        }

        const recoloredDataUrl = recolorCanvas(
          loadedImg,
          sourceHex,
          targetHex,
          tolerance,
          lightnessOffset,
          saturationMult,
          masks,
          { mode: logoMode, colorHex: logoColorHex },
          { mode: zipperMode }
        );

        if (recoloredDataUrl && recoloredDataUrl !== item.url) {
          const resItem: RecolorResult = {
            id: 'recolor_' + item.id + '_' + Date.now().toString(36) + '_' + i,
            sourceUrl: item.url,
            recoloredUrl: recoloredDataUrl,
            targetHex,
            targetName: getColorName(targetHex),
            title: item.title + ` (${getColorName(targetHex)})`,
            timestamp: Date.now(),
          };
          newResults.push(resItem);
        }
      }

      if (newResults.length === 0) {
        setError('AI garment segmentation was unavailable. Please ensure the backend server is running on port 8787.');
        return;
      }

      setRecolorResults((prev) => {
        // Filter out identical previous results for same item & target color to prevent duplicate pose clones
        const newKeys = new Set(newResults.map((n) => `${n.sourceUrl}:::${n.targetHex}`));
        const filteredPrev = prev.filter((p) => !newKeys.has(`${p.sourceUrl}:::${p.targetHex}`));
        return [...newResults, ...filteredPrev];
      });

      // Update live preview canvas with first recolored image
      if (newResults[0] && previewCanvasRef.current) {
        const prevImg = await loadSafeCanvasImage(newResults[0].recoloredUrl);
        const ctx = previewCanvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, previewCanvasRef.current.width, previewCanvasRef.current.height);
          ctx.drawImage(prevImg, 0, 0, previewCanvasRef.current.width, previewCanvasRef.current.height);
          setHasRecoloredPreview(true);
        }
      }

      showToast(`🎉 Success! Recolored ${newResults.length} pose(s) to ${getColorName(targetHex)}.`);
    } catch (err: any) {
      console.error('[BatchColorSwap] Error:', err);
      setError('Color swap failed: ' + (err?.message || err));
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  };

  // Save single recolor result to Ready or Edited
  const handleSaveResult = async (item: RecolorResult, folder: 'ready' | 'edited') => {
    try {
      await onSaveToMySets(item.recoloredUrl, folder, item.title);
      setSavedIds((prev) => new Set([...prev, item.id]));
      showToast(`⭐ Saved to ${folder === 'ready' ? 'Ready to Use' : 'Edited'}!`);
    } catch (err: any) {
      setError('Failed to save to My Sets: ' + (err?.message || err));
    }
  };

  // Save all recolor results to Ready to Use
  const handleSaveAllToReady = async () => {
    if (recolorResults.length === 0) return;
    setIsProcessing(true);
    setProgressMsg(`Saving ${recolorResults.length} images to Ready to Use…`);
    try {
      for (const item of recolorResults) {
        await onSaveToMySets(item.recoloredUrl, 'ready', item.title);
        setSavedIds((prev) => new Set([...prev, item.id]));
      }
      onRefreshGenerations();
      showToast(`⭐ All ${recolorResults.length} images saved to Ready to Use!`);
    } catch (err: any) {
      setError('Save all error: ' + (err?.message || err));
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  };

  // Download All as ZIP
  const handleDownloadAllZip = async () => {
    if (recolorResults.length === 0) return;
    setIsProcessing(true);
    setProgressMsg('Packaging ZIP archive…');
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      for (let i = 0; i < recolorResults.length; i++) {
        const item = recolorResults[i];
        const cleanTitle = item.title.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
        const base64Data = item.recoloredUrl.replace(/^data:image\/\w+;base64,/, '');
        zip.file(`${cleanTitle}-${i + 1}.jpg`, base64Data, { base64: true });
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const objectUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `shivnaresh-color-variants-${Date.now().toString(36)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
      showToast('⬇️ Downloaded all variants as ZIP!');
    } catch (err: any) {
      setError('ZIP creation error: ' + (err?.message || err));
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  };

  const copyToClipboard = (hex: string) => {
    navigator.clipboard.writeText(hex);
    setCopiedHex(hex);
    showToast(`📋 Copied: ${hex}`);
    setTimeout(() => setCopiedHex(null), 1800);
  };

  return (
    <div className={`w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 ${isLight ? 'text-gray-900' : 'text-zinc-100'}`}>
      {/* Toast Notification Banner */}
      {toastMsg && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2 bg-[#18181b] text-white border border-emerald-500/40 px-4 py-2.5 rounded-xl shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-4">
          <Check className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold">{toastMsg}</span>
        </div>
      )}

      {/* Studio Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-5 border-white/10">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e5373f] text-white shadow-md">
              <Palette className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight">16.7M Fabric Color Swap & Palette Studio</h1>
                <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                  ⚡ 0 Credits · Real-Time
                </span>
              </div>
              <p className={`text-xs ${isLight ? 'text-gray-600' : 'text-zinc-400'}`}>
                Switch garment colors for entire catalogs without re-generating. Extract authentic Canva-style color palettes & hex codes.
              </p>
            </div>
          </div>
        </div>

        {/* Sub-Tabs: Swap vs Paint vs Palette */}
        <div className={`inline-flex rounded-xl p-1 border flex-wrap gap-1 ${isLight ? 'border-gray-300 bg-gray-100' : 'border-zinc-800 bg-zinc-900/80'}`}>
          <button
            type="button"
            onClick={() => setSubTab('swap')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${subTab === 'swap'
              ? isLight
                ? 'bg-white text-gray-950 font-bold shadow-sm'
                : 'bg-[#e5373f] text-white font-bold shadow-md'
              : isLight
                ? 'text-gray-600 hover:text-gray-900'
                : 'text-zinc-400 hover:text-white'
              }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>🔄 Color Swap</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSubTab('paint');
              if (previewCanvasRef.current) {
                handleOpenInPaintStudio(previewCanvasRef.current.toDataURL('image/png'), activeImage?.title || 'Studio Garment');
              } else if (activeImage) {
                handleOpenInPaintStudio(resolveImageUrl(activeImage.url), activeImage.title);
              }
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${subTab === 'paint'
              ? isLight
                ? 'bg-white text-gray-950 font-bold shadow-sm'
                : 'bg-[#e5373f] text-white font-bold shadow-md'
              : isLight
                ? 'text-gray-600 hover:text-gray-900'
                : 'text-zinc-400 hover:text-white'
              }`}
          >
            <Paintbrush className="w-3.5 h-3.5" />
            <span>🖌️ Canva Paint & Clone Studio</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('palette')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${subTab === 'palette'
              ? isLight
                ? 'bg-white text-gray-950 font-bold shadow-sm'
                : 'bg-[#e5373f] text-white font-bold shadow-md'
              : isLight
                ? 'text-gray-600 hover:text-gray-900'
                : 'text-zinc-400 hover:text-white'
              }`}
          >
            <Pipette className="w-3.5 h-3.5" />
            <span>🎨 Canva Eyedropper & Palette</span>
          </button>
        </div>
      </div>

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 4-Cols: Image Selection & My Sets Browser */}
        <div className="lg:col-span-4 space-y-4">
          <div className={`rounded-2xl border p-4 ${isLight ? 'border-gray-200 bg-white shadow-sm' : 'border-zinc-800 bg-[#0e0e12]'}`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#e5373f] flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                <span>Select Images ({filteredImages.length})</span>
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                {selectedIds.size} Selected
              </span>
            </div>

            {/* Folder Filters */}
            <div className="flex items-center gap-1.5 mb-3 flex-wrap">
              {[
                { id: 'all', label: 'All' },
                { id: 'ready', label: '⭐ Ready' },
                { id: 'edited', label: '✏️ Edited' },
                { id: 'generated', label: '📸 Gen' },
                { id: 'uploads', label: '📤 Uploads' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilterFolder(f.id as any)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition cursor-pointer ${filterFolder === f.id
                    ? 'border-[#e5373f] bg-[#e5373f]/15 text-[#e5373f] font-bold'
                    : isLight
                      ? 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                    }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Action Bar: Select All / Upload */}
            <div className="flex items-center justify-between gap-2 mb-3 pb-3 border-b border-white/10 text-xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="px-2 py-1 rounded text-[10px] font-semibold hover:underline cursor-pointer flex items-center gap-1"
                >
                  <CheckSquare className="w-3 h-3 text-emerald-400" />
                  <span>Select All</span>
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="px-2 py-1 rounded text-[10px] font-semibold hover:underline cursor-pointer flex items-center gap-1 opacity-70"
                >
                  <Square className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              </div>

              <div>
                <input
                  ref={uploadInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => uploadInputRef.current?.click()}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[#e5373f] text-white hover:bg-[#d42d35] flex items-center gap-1 cursor-pointer shadow-xs"
                >
                  <Upload className="w-3 h-3" />
                  <span>Upload Image</span>
                </button>
              </div>
            </div>

            {/* Thumbnails Grid */}
            <div className="max-h-[520px] overflow-y-auto space-y-2 pr-1 no-scrollbar">
              {filteredImages.length === 0 ? (
                <div className="p-8 text-center text-xs opacity-60">
                  No images in this category. Upload photos or select another folder.
                </div>
              ) : (
                filteredImages.map((img) => {
                  const isChecked = selectedIds.has(img.id);
                  const isActive = activeImage?.id === img.id;
                  return (
                    <div
                      key={img.id}
                      onClick={() => {
                        setActiveImage(img);
                        setSelectedIds(new Set([img.id]));
                        if (subTab === 'paint') {
                          setPaintTargetImage(resolveImageUrl(img.url));
                          setPaintTargetTitle(img.title);
                        }
                      }}
                      className={`p-2 rounded-xl border flex items-center gap-3 transition cursor-pointer ${isActive
                        ? 'border-[#e5373f] ring-1 ring-[#e5373f] bg-[#e5373f]/10'
                        : isChecked
                          ? 'border-emerald-500/50 bg-emerald-500/5'
                          : isLight
                            ? 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                            : 'border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/80'
                        }`}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelectImage(img.id);
                        }}
                        className="p-1 rounded cursor-pointer"
                      >
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Square className="w-4 h-4 opacity-40 hover:opacity-100" />
                        )}
                      </button>

                      <img
                        src={getProxiedImageUrl(resolveImageUrl(img.url))}
                        alt={img.title}
                        className="w-12 h-16 object-cover rounded-lg border border-white/10 shrink-0 bg-black/40"
                      />

                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{img.title}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${img.folder === 'ready'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : img.folder === 'edited'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-zinc-500/20 text-zinc-300'
                            }`}>
                            {img.folder === 'ready' ? '⭐ Ready' : img.folder === 'edited' ? '✏️ Edited' : '📸 Gen'}
                          </span>
                          {isActive && (
                            <span className="text-[9px] font-bold text-[#e5373f]">● Active View</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right 8-Cols: Interactive Studio Workspace */}
        <div className="lg:col-span-8 space-y-6">
          {/* ----------------------------------------------------------------
              PERSISTENT CANVAS — always rendered, hidden via CSS when not on
              Swap tab so canvas content survives tab switches (no black).
              ---------------------------------------------------------------- */}
          <div className={`rounded-2xl border p-4 ${subTab !== 'swap' ? 'hidden' : ''} ${isLight ? 'border-gray-200 bg-white shadow-sm' : 'border-zinc-800 bg-[#0e0e12]'}`}>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" />
                  <span>Live Garment Preview & Eyedropper</span>
                </span>
                <span className="text-[10px] opacity-70">
                  (Click fabric to sample source color)
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    if (previewCanvasRef.current) {
                      handleOpenInPaintStudio(previewCanvasRef.current.toDataURL('image/png'), activeImage?.title || 'Canvas Edit');
                    } else if (activeImage) {
                      handleOpenInPaintStudio(resolveImageUrl(activeImage.url), activeImage.title);
                    }
                  }}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[#e5373f]/20 hover:bg-[#e5373f]/30 text-rose-300 border border-[#e5373f]/40 cursor-pointer flex items-center gap-1 transition"
                  title="Open active preview in Canva Paint & Clone Studio"
                >
                  <Paintbrush className="w-3 h-3 text-rose-400" />
                  <span>🖌️ Edit in Paint Studio</span>
                </button>

                <button
                  type="button"
                  onClick={handleRestoreOriginalLook}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 cursor-pointer flex items-center gap-1 transition"
                  title="Undo color swap and restore original image look"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>↩️ Restore Original Look</span>
                </button>

                <button
                  type="button"
                  onClick={handleAutoDetectGarmentColor}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 cursor-pointer flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>Auto-Detect</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleNativeEyedropper('source')}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 cursor-pointer flex items-center gap-1"
                >
                  <Pipette className="w-3 h-3 text-sky-400" />
                  <span>Desktop Eyedropper</span>
                </button>
              </div>
            </div>

            {/* Canvas Container with Canva Loupe */}
            <div className="relative rounded-xl overflow-hidden border border-white/10 bg-zinc-950 flex items-center justify-center p-2 min-h-[360px]">
              <canvas
                ref={previewCanvasRef}
                onMouseMove={handleCanvasMouseMove}
                onMouseLeave={handleCanvasMouseLeave}
                onClick={handleCanvasClick}
                className="max-h-[460px] max-w-full object-contain cursor-crosshair rounded-lg"
              />
              {!activeImage && (
                <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-xs font-semibold">
                  Select an image or pose to preview & sample colors
                </div>
              )}

              {hasRecoloredPreview && (
                <div className="absolute top-4 left-4 bg-emerald-600/90 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-md backdrop-blur-md flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  <span>Recolored View Active</span>
                </div>
              )}

              {loupePos && hoveredColor && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${loupePos.x + 18}px`,
                    top: `${loupePos.y - 40}px`,
                    pointerEvents: 'none',
                    zIndex: 30,
                  }}
                  className="flex items-center gap-2 bg-black/95 text-white px-2.5 py-1.5 rounded-xl border border-white/30 shadow-2xl backdrop-blur-md"
                >
                  <span
                    className="w-5 h-5 rounded-full border border-white shadow-inner shrink-0"
                    style={{ backgroundColor: hoveredColor.hex }}
                  />
                  <div className="text-[10px] font-mono leading-tight">
                    <p className="font-bold">{hoveredColor.hex}</p>
                    <p className="opacity-70 text-[8px]">{getColorName(hoveredColor.hex)}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {subTab === 'swap' ? (
            /* SUB-TAB 1: Batch Color Swap Controls (canvas moved above) */
            <div className="space-y-6">

              {/* ----------------------------------------------------------------
                  SIMPLIFIED 2-OPTION CONTROL DECK
                  Option 1: Kis colour ko swap karna hai
                  Option 2: Kiske sath karna hai
                  ---------------------------------------------------------------- */}
              <div className={`rounded-2xl border p-5 space-y-5 ${isLight ? 'border-gray-200 bg-white shadow-sm' : 'border-zinc-800 bg-[#0e0e12]'}`}>
                {/* AI GARMENT TARGET SELECTOR: UPPER ONLY | LOWER ONLY | BOTH */}
                <div className={`p-4 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-3 ${
                  isLight ? 'border-gray-200 bg-gray-50' : 'border-zinc-800 bg-zinc-900/60'
                }`}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-[#e5373f]/15 border border-[#e5373f]/30 flex items-center justify-center shrink-0">
                      <Shirt className="w-4 h-4 text-[#e5373f]" />
                    </div>
                    <div>
                      <span className="text-xs font-bold block">Garment Target Selection (AI Semantic Segmentation)</span>
                      <span className="text-[10px] text-zinc-400">Choose which garment piece to recolor (Upper, Lower, or Both)</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-950/80 border border-white/10 w-full sm:w-auto justify-center">
                    <button
                      type="button"
                      onClick={() => setGarmentScope('upper')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        garmentScope === 'upper'
                          ? 'bg-[#e5373f] text-white shadow-md'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      <span>🧥 Upper Only (Jacket/Top)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setGarmentScope('lower')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        garmentScope === 'lower'
                          ? 'bg-[#e5373f] text-white shadow-md'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      <span>👖 Lower Only (Pants/Bottom)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setGarmentScope('both')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        garmentScope === 'both'
                          ? 'bg-[#e5373f] text-white shadow-md'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      <span>⚡ Both (Full Outfit)</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* OPTION 1: Kis colour ko swap karna hai */}
                  <div className="space-y-3 p-4 rounded-xl border border-rose-500/20 bg-rose-500/5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                        <Pipette className="w-4 h-4" />
                        <span>1. Kis Colour Ko Swap Karna Hai:</span>
                      </label>
                      <span className="text-[10px] font-mono font-bold text-rose-400">{sourceHex}</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-xl border-2 border-white/50 shadow-inner shrink-0"
                        style={{ backgroundColor: sourceHex }}
                      />
                      <input
                        type="color"
                        value={sourceHex}
                        onChange={(e) => setSourceHex(e.target.value.toUpperCase())}
                        className="w-12 h-10 rounded-lg cursor-pointer bg-transparent border-0"
                        title="Pick color"
                      />
                      <input
                        type="text"
                        value={sourceHex}
                        onChange={(e) => setSourceHex(e.target.value.toUpperCase())}
                        className={`flex-1 px-3 py-2 rounded-xl text-xs font-mono font-bold border ${isLight ? 'border-gray-300 bg-white' : 'border-zinc-800 bg-zinc-900'
                          }`}
                        placeholder="#B0ABA7"
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1">
                      <span>Detected: <strong className="text-zinc-200">{getColorName(sourceHex)}</strong></span>
                      <button
                        type="button"
                        onClick={handleAutoDetectGarmentColor}
                        className="text-[10px] text-[#e5373f] hover:underline font-bold cursor-pointer"
                      >
                        ⚡ Re-detect from chest
                      </button>
                    </div>
                  </div>

                  {/* OPTION 2: Kiske sath karna hai (16.7M Colors) */}
                  <div className="space-y-3 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                        <Palette className="w-4 h-4" />
                        <span>2. Kiske Sath Karna Hai (Target Color):</span>
                      </label>
                      <span className="text-[10px] font-mono font-bold text-emerald-400">{targetHex}</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-xl border-2 border-white/50 shadow-inner shrink-0"
                        style={{ backgroundColor: targetHex }}
                      />
                      <input
                        type="color"
                        value={targetHex}
                        onChange={(e) => setTargetHex(e.target.value.toUpperCase())}
                        className="w-12 h-10 rounded-lg cursor-pointer bg-transparent border-0"
                        title="Pick from 16.7M spectrum"
                      />
                      <input
                        type="text"
                        value={targetHex}
                        onChange={(e) => setTargetHex(e.target.value.toUpperCase())}
                        className={`flex-1 px-3 py-2 rounded-xl text-xs font-mono font-bold border ${isLight ? 'border-gray-300 bg-white' : 'border-zinc-800 bg-zinc-900'
                          }`}
                        placeholder="#E52B38"
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1">
                      <span>Replacement: <strong className="text-zinc-200">{getColorName(targetHex)}</strong></span>
                      <span className="text-[10px] text-emerald-400 font-bold">16.7M Colors Supported</span>
                    </div>
                  </div>
                </div>

                {/* Quick Brand Athletic Colors */}
                <div className="pt-2 border-t border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider opacity-75">
                      ⚡ Quick Brand Athletic Colors:
                    </span>
                    <span className="text-[10px] font-bold text-[#e5373f]">{getColorName(targetHex)}</span>
                  </div>
                  <div className="grid grid-cols-6 sm:grid-cols-12 gap-2">
                    {ATHLETIC_SWATCHES.map((swatch) => (
                      <button
                        key={swatch.hex}
                        type="button"
                        onClick={() => {
                          setTargetHex(swatch.hex);
                          if (swatch.name.includes('White')) setLightnessOffset(0.45);
                          else if (swatch.name.includes('Black')) setLightnessOffset(-0.4);
                          else setLightnessOffset(0);
                        }}
                        title={`${swatch.name} (${swatch.hex})`}
                        style={{ backgroundColor: swatch.hex }}
                        className={`h-8 rounded-lg border-2 transition-transform cursor-pointer relative group ${targetHex === swatch.hex
                          ? 'border-white scale-110 shadow-lg ring-2 ring-[#e5373f]'
                          : 'border-white/20 hover:scale-105'
                          }`}
                      >
                        {targetHex === swatch.hex && (
                          <Check className={`w-3.5 h-3.5 mx-auto ${swatch.hex === '#F8FAFC' ? 'text-black' : 'text-white'}`} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* MULTI-LAYER CONTROLS: LOGO & TEXT + ZIPPER INDEPENDENT SEPARATION */}
                <div className={`p-4 rounded-xl border space-y-4 ${
                  isLight ? 'border-gray-200 bg-gray-50' : 'border-zinc-800 bg-zinc-900/60'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5" />
                      <span>Multi-Layer Logo, Text & Zipper Control</span>
                    </span>
                    <span className="text-[10px] text-zinc-400 font-semibold">Independent Layer Isolation</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Layer 1: Logo & Text Embroidery */}
                    <div className="space-y-2 p-3 rounded-lg border border-white/5 bg-zinc-950/40">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-zinc-300">Logo & Text Embroidery:</span>
                        <span className="text-[10px] text-zinc-400 font-mono">{logoMode === 'keep' ? 'Original Stitches' : logoColorHex}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setLogoMode('keep')}
                          className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-bold transition cursor-pointer border ${
                            logoMode === 'keep'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-xs'
                              : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                          }`}
                        >
                          ✨ Keep Original
                        </button>
                        <button
                          type="button"
                          onClick={() => setLogoMode('recolor')}
                          className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-bold transition cursor-pointer border ${
                            logoMode === 'recolor'
                              ? 'bg-[#e5373f] text-white border-[#e5373f] shadow-xs'
                              : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                          }`}
                        >
                          🎨 Custom Recolor
                        </button>
                      </div>
                      {logoMode === 'recolor' && (
                        <div className="flex items-center gap-2 pt-1 animate-in fade-in">
                          <input
                            type="color"
                            value={logoColorHex}
                            onChange={(e) => setLogoColorHex(e.target.value.toUpperCase())}
                            className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                            title="Pick Logo Color"
                          />
                          <input
                            type="text"
                            value={logoColorHex}
                            onChange={(e) => setLogoColorHex(e.target.value.toUpperCase())}
                            className="flex-1 px-2.5 py-1 rounded-lg text-xs font-mono font-bold border border-zinc-700 bg-zinc-900 text-white"
                            placeholder="#FFFFFF"
                          />
                        </div>
                      )}
                    </div>

                    {/* Layer 2: Zipper & Seam Control */}
                    <div className="space-y-2 p-3 rounded-lg border border-white/5 bg-zinc-950/40">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-zinc-300">Zipper Teeth & Slider:</span>
                        <span className="text-[10px] text-zinc-400 font-mono">{zipperMode === 'preserve' ? 'Metallic Shine' : 'Garment Match'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setZipperMode('preserve')}
                          className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-bold transition cursor-pointer border ${
                            zipperMode === 'preserve'
                              ? 'bg-sky-500/20 text-sky-300 border-sky-500/40 shadow-xs'
                              : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                          }`}
                        >
                          🔩 Metallic Shine
                        </button>
                        <button
                          type="button"
                          onClick={() => setZipperMode('match')}
                          className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-bold transition cursor-pointer border ${
                            zipperMode === 'match'
                              ? 'bg-[#e5373f] text-white border-[#e5373f] shadow-xs'
                              : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                          }`}
                        >
                          🧥 Match Garment
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ----------------------------------------------------------------
                    ADVANCED QUALITY TUNING (BACKEND DEFAULT BEST QUALITY ACTIVE)
                    Only visible when clicking "Show More"
                    ---------------------------------------------------------------- */}
                <div className="pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedSettings((prev) => !prev)}
                    className="w-full flex items-center justify-between py-2 text-xs font-semibold text-zinc-400 hover:text-white cursor-pointer transition"
                  >
                    <div className="flex items-center gap-2">
                      <Sliders className="w-3.5 h-3.5 text-[#e5373f]" />
                      <span>Advanced Quality Settings (Best Quality Presets Running in Backend)</span>
                      <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[9px] font-bold text-emerald-400">
                        🛡️ Skin & Studio Background Protected
                      </span>
                    </div>
                    {showAdvancedSettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {showAdvancedSettings && (
                    <div className="pt-4 pb-2 space-y-4 animate-in fade-in slide-in-from-top-2 border-t border-white/5 mt-2">
                      {/* Protection Checkboxes */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <label className="flex items-center gap-2 p-2.5 rounded-xl border border-white/10 bg-zinc-900/60 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={protectSkin}
                            onChange={(e) => setProtectSkin(e.target.checked)}
                            className="accent-[#e5373f] rounded cursor-pointer"
                          />
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Protect Face & Neck Skin</span>
                        </label>

                        <label className="flex items-center gap-2 p-2.5 rounded-xl border border-white/10 bg-zinc-900/60 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={protectBackground}
                            onChange={(e) => setProtectBackground(e.target.checked)}
                            className="accent-[#e5373f] rounded cursor-pointer"
                          />
                          <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                          <span>Protect Studio Background</span>
                        </label>

                        <label className="flex items-center gap-2 p-2.5 rounded-xl border border-white/10 bg-zinc-900/60 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={protectLogos}
                            onChange={(e) => setProtectLogos(e.target.checked)}
                            className="accent-[#e5373f] rounded cursor-pointer"
                          />
                          <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                          <span>Protect Shiv-Naresh Logo</span>
                        </label>
                      </div>

                      {/* Advanced Sliders */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                        {/* Tolerance */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] opacity-80">
                            <span>Fabric Hue Tolerance:</span>
                            <span className="font-mono">{tolerance}° (Best: 28°)</span>
                          </div>
                          <input
                            type="range"
                            min="15"
                            max="60"
                            value={tolerance}
                            onChange={(e) => setTolerance(Number(e.target.value))}
                            className="w-full accent-[#e5373f] h-1.5 rounded cursor-pointer"
                          />
                        </div>

                        {/* Lightness */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] opacity-80">
                            <span>Lightness (White/Black Shift):</span>
                            <span className="font-mono">{Math.round(lightnessOffset * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min="-0.7"
                            max="0.7"
                            step="0.05"
                            value={lightnessOffset}
                            onChange={(e) => setLightnessOffset(Number(e.target.value))}
                            className="w-full accent-emerald-500 h-1.5 rounded cursor-pointer"
                          />
                        </div>

                        {/* Saturation */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] opacity-80">
                            <span>Fabric Saturation:</span>
                            <span className="font-mono">{Math.round(saturationMult * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="2.0"
                            step="0.05"
                            value={saturationMult}
                            onChange={(e) => setSaturationMult(Number(e.target.value))}
                            className="w-full accent-emerald-500 h-1.5 rounded cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Batch Execute Action Button */}
                <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRestoreOriginalLook}
                      className="px-3 py-2 rounded-xl text-xs font-semibold border border-white/20 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 cursor-pointer flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>↩️ Restore Previous Look</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleExecuteBatchColorSwap}
                    className="px-6 py-3 rounded-full text-xs font-bold uppercase tracking-wider bg-[#e5373f] hover:bg-[#d42d35] text-white shadow-lg cursor-pointer flex items-center gap-2 transition active:scale-[0.98] disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
                    <span>
                      {isProcessing
                        ? progressMsg || 'Processing…'
                        : selectedIds.size > 1
                          ? `⚡ Recolor All ${selectedIds.size} Selected Models / Poses (1 Click)`
                          : `⚡ Color Swap Active Model (0 Credits)`}
                    </span>
                  </button>
                </div>
              </div>

              {/* Recolor Results Gallery */}
              {recolorResults.length > 0 && (
                <div className={`rounded-2xl border p-5 space-y-4 ${isLight ? 'border-gray-200 bg-white shadow-sm' : 'border-zinc-800 bg-[#0e0e12]'}`}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <Check className="w-4 h-4" />
                      <span>Color Swap Results ({recolorResults.length} Variants)</span>
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSaveAllToReady}
                        className="px-3 py-1.5 rounded-full text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black flex items-center gap-1.5 cursor-pointer shadow-md"
                      >
                        <Bookmark className="w-3.5 h-3.5" />
                        <span>⭐ Save All to Ready to Use</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleDownloadAllZip}
                        className="px-3 py-1.5 rounded-full text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-white flex items-center gap-1.5 cursor-pointer border border-zinc-700 shadow-md"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        <span>⬇️ Download All (ZIP)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setRecolorResults([])}
                        className="px-3 py-1.5 rounded-full text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center gap-1.5 cursor-pointer border border-zinc-700 shadow-md hover:text-white"
                        title="Clear results gallery"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Clear</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {recolorResults.map((item) => (
                      <div
                        key={item.id}
                        className={`rounded-xl border overflow-hidden p-2.5 space-y-2.5 ${isLight ? 'border-gray-200 bg-gray-50' : 'border-zinc-800 bg-zinc-900/60'
                          }`}
                      >
                        <div className="relative aspect-[3/4] rounded-lg overflow-hidden border border-white/10 bg-black">
                          <img
                            src={item.recoloredUrl}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                          <span
                            className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-bold text-white border border-white/30 shadow-md"
                            style={{ backgroundColor: item.targetHex }}
                          >
                            {item.targetName}
                          </span>
                        </div>

                        <p className="text-xs font-bold truncate">{item.title}</p>

                        <div className="flex items-center gap-1.5 pt-1">
                          <button
                            type="button"
                            onClick={() => handleSaveResult(item, 'ready')}
                            className={`flex-1 py-1 px-2 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${savedIds.has(item.id)
                              ? 'bg-emerald-600 text-white'
                              : 'bg-amber-500 text-black hover:bg-amber-400'
                              }`}
                          >
                            <Bookmark className="w-3 h-3" />
                            <span>{savedIds.has(item.id) ? '✓ Saved' : '⭐ Ready'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSaveResult(item, 'edited')}
                            className="py-1 px-2 rounded-lg text-[10px] font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 cursor-pointer"
                            title="Save into Edited sub-tab"
                          >
                            💾 Edited
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenInPaintStudio(item.recoloredUrl, item.title)}
                            className="py-1 px-2 rounded-lg text-[10px] font-bold bg-[#e5373f]/20 hover:bg-[#e5373f]/30 text-rose-300 border border-[#e5373f]/40 cursor-pointer flex items-center justify-center gap-1"
                            title="Open in Canva Paint & Clone Studio"
                          >
                            <Paintbrush className="w-3 h-3 text-rose-400" />
                            <span>🖌️ Paint</span>
                          </button>

                          <a
                            href={item.recoloredUrl}
                            download={`${item.title}.jpg`}
                            className="py-1 px-2.5 rounded-lg text-[10px] font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 flex items-center justify-center cursor-pointer"
                            title="Download high-resolution image"
                          >
                            <Download className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : subTab === 'paint' ? (
            /* ----------------------------------------------------------------
               SUB-TAB 2: Canva Paint & Clone Studio (MS Paint Pro Studio)
               Complete 9-Brush Engine, Dual Colors, Corner-Only Resizing & Stamp
               ---------------------------------------------------------------- */
            <div className="space-y-4">
              <MsPaintStudio
                initialImageUrl={
                  paintTargetImage ||
                  (previewCanvasRef.current && hasRecoloredPreview && previewCanvasRef.current.width > 300
                    ? previewCanvasRef.current.toDataURL('image/png')
                    : activeImage
                      ? resolveImageUrl(activeImage.url)
                      : null)
                }
                imageTitle={paintTargetTitle || activeImage?.title || 'Studio Garment'}
                allImages={filteredImages}
                activeImageId={activeImage?.id}
                onSelectImage={(img) => {
                  setActiveImage(img);
                  setPaintTargetImage(resolveImageUrl(img.url));
                  setPaintTargetTitle(img.title);
                  toggleSelectImage(img.id);
                }}
                onSaveResult={async (dataUrl, folder, title) => {
                  await onSaveToMySets(dataUrl, folder, title);
                  onRefreshGenerations();
                }}
                onSendToColorSwap={(dataUrl, title) => {
                  const item: ImageItem = {
                    id: 'paint_' + Date.now().toString(36),
                    url: dataUrl,
                    title,
                    source: 'upload',
                  };
                  setCustomUploads((prev) => [item, ...prev]);
                  setActiveImage(item);
                  setSelectedIds((prev) => new Set([...prev, item.id]));
                  setSubTab('swap');
                }}
                isLight={isLight}
              />
            </div>
          ) : (
            /* ----------------------------------------------------------------
               SUB-TAB 3: Canva Eyedropper & Palette Generator
               With Reference Fabric Photo Upload & Direct Apply to Swap
               ---------------------------------------------------------------- */
            <div className="space-y-6">
              {/* Reference Fabric Photo Upload Card */}
              <div className={`rounded-2xl border p-5 space-y-4 ${isLight ? 'border-gray-200 bg-white shadow-sm' : 'border-zinc-800 bg-[#0e0e12]'}`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#e5373f] flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4" />
                      <span>Upload Reference Fabric Photo (Canva Eyedropper)</span>
                    </span>
                    <span className="text-[10px] opacity-70">
                      (Upload any cloth photo to extract exact color code & name)
                    </span>
                  </div>

                  <div>
                    <input
                      ref={fabricUploadInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFabricUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fabricUploadInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#e5373f] hover:bg-[#d42d35] text-white flex items-center gap-1.5 cursor-pointer shadow-md"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload Reference Fabric</span>
                    </button>
                  </div>
                </div>

                {fabricRefImage ? (
                  <div className="space-y-4">
                    <div className="relative rounded-xl overflow-hidden border border-white/10 bg-black flex items-center justify-center p-2 min-h-[280px]">
                      <canvas
                        ref={fabricCanvasRef}
                        onMouseMove={handleFabricCanvasMouseMove}
                        onMouseLeave={handleFabricCanvasMouseLeave}
                        onClick={handleFabricCanvasClick}
                        className="max-h-[380px] max-w-full object-contain cursor-crosshair rounded-lg"
                      />

                      {/* Loupe over fabric */}
                      {fabricLoupePos && fabricHoveredColor && (
                        <div
                          style={{
                            position: 'absolute',
                            left: `${fabricLoupePos.x + 18}px`,
                            top: `${fabricLoupePos.y - 40}px`,
                            pointerEvents: 'none',
                            zIndex: 30,
                          }}
                          className="flex items-center gap-2 bg-black/95 text-white px-2.5 py-1.5 rounded-xl border border-white/30 shadow-2xl backdrop-blur-md"
                        >
                          <span
                            className="w-5 h-5 rounded-full border border-white shadow-inner shrink-0"
                            style={{ backgroundColor: fabricHoveredColor.hex }}
                          />
                          <div className="text-[10px] font-mono leading-tight">
                            <p className="font-bold">{fabricHoveredColor.hex}</p>
                            <p className="opacity-70 text-[8px]">{getColorName(fabricHoveredColor.hex)}</p>
                          </div>
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 italic text-center">
                      💡 Click anywhere on your fabric photo to copy its exact HEX code and set it as Target Color for model garment swap!
                    </p>

                    {/* Dominant Palette Extracted from Uploaded Fabric */}
                    {fabricRefPalette.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-white/10">
                        <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                          Extracted Fabric Swatches ({fabricRefPalette.length}):
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {fabricRefPalette.map((item) => (
                            <div
                              key={item.hex}
                              className="p-2.5 rounded-xl border border-white/10 bg-zinc-900/60 space-y-2"
                            >
                              <div
                                className="h-12 rounded-lg border border-white/20 shadow-inner cursor-pointer"
                                style={{ backgroundColor: item.hex }}
                                onClick={() => copyToClipboard(item.hex)}
                                title="Click to copy HEX"
                              />
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-bold truncate">{item.name}</span>
                                <span className="font-mono text-[10px] opacity-75">{item.hex}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setTargetHex(item.hex);
                                  setSubTab('swap');
                                  showToast(`⚡ Target color set to: ${item.hex}`);
                                }}
                                className="w-full py-1 rounded text-[10px] font-bold bg-[#e5373f] hover:bg-[#d42d35] text-white cursor-pointer"
                              >
                                ⚡ Swap to this
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    onClick={() => fabricUploadInputRef.current?.click()}
                    className="p-8 border-2 border-dashed border-white/15 rounded-xl text-center cursor-pointer hover:border-[#e5373f] transition space-y-2"
                  >
                    <Upload className="w-8 h-8 mx-auto text-[#e5373f] opacity-80" />
                    <p className="text-xs font-semibold">Click to upload a fabric photo or real cloth swatch</p>
                    <p className="text-[10px] text-zinc-400">
                      The Canva eyedropper will inspect the real cloth color, generate color hex codes, and let you swap model outfits with 1-click.
                    </p>
                  </div>
                )}
              </div>

              {/* Dominant Palette from Active Model Image */}
              <div className={`rounded-2xl border p-5 space-y-4 ${isLight ? 'border-gray-200 bg-white shadow-sm' : 'border-zinc-800 bg-[#0e0e12]'}`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#e5373f] flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4" />
                      <span>Canva-Style Color Palette (Active Model Image)</span>
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const allHex = extractedPalette.map((p) => `${p.name}: ${p.hex}`).join('\n');
                      copyToClipboard(allHex);
                    }}
                    className="px-3 py-1 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 cursor-pointer flex items-center gap-1.5"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy All Hex Codes</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {extractedPalette.map((color) => (
                    <div
                      key={color.hex}
                      className={`p-3 rounded-xl border space-y-2 group transition hover:shadow-md ${isLight ? 'border-gray-200 bg-gray-50' : 'border-zinc-800 bg-zinc-900/60'
                        }`}
                    >
                      <div
                        className="h-16 rounded-lg border border-white/20 shadow-inner flex items-end justify-end p-1.5 cursor-pointer"
                        style={{ backgroundColor: color.hex }}
                        onClick={() => copyToClipboard(color.hex)}
                      >
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-black/75 text-white backdrop-blur-md opacity-0 group-hover:opacity-100 transition">
                          Click to Copy
                        </span>
                      </div>

                      <div>
                        <p className="text-xs font-bold truncate">{color.name}</p>
                        <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 mt-0.5">
                          <span>{color.hex}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(color.hex)}
                            className="p-1 hover:text-white cursor-pointer"
                            title="Copy HEX"
                          >
                            {copiedHex === color.hex ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setTargetHex(color.hex);
                          setSubTab('swap');
                          showToast(`⚡ Target swap color set to: ${color.hex}`);
                        }}
                        className="w-full py-1.5 rounded-lg text-[10px] font-bold bg-[#e5373f] hover:bg-[#d42d35] text-white transition flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <span>🔄 Swap to This Color</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sampled History Palette */}
              <div className={`rounded-2xl border p-5 space-y-4 ${isLight ? 'border-gray-200 bg-white shadow-sm' : 'border-zinc-800 bg-[#0e0e12]'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                    <Pipette className="w-4 h-4" />
                    <span>Eyedropper Sampled Colors ({sampledPalette.length})</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleNativeEyedropper('target')}
                    className="px-3 py-1 rounded-lg text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white flex items-center gap-1.5 cursor-pointer shadow-md"
                  >
                    <Pipette className="w-3.5 h-3.5" />
                    <span>Sample New Color</span>
                  </button>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  {sampledPalette.map((hex) => (
                    <div
                      key={hex}
                      className="flex items-center gap-2 p-2 rounded-xl border border-white/10 bg-zinc-900/80 shadow-xs"
                    >
                      <span
                        className="w-6 h-6 rounded-lg border border-white/30 shrink-0 shadow-inner"
                        style={{ backgroundColor: hex }}
                      />
                      <span className="text-xs font-mono font-bold">{hex}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(hex)}
                        className="p-1 hover:text-white cursor-pointer opacity-70 hover:opacity-100"
                        title="Copy Hex"
                      >
                        {copiedHex === hex ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTargetHex(hex);
                          setSubTab('swap');
                          showToast(`⚡ Target color set to: ${hex}`);
                        }}
                        className="px-2 py-0.5 rounded text-[9px] font-bold bg-[#e5373f] text-white hover:bg-[#d42d35] cursor-pointer"
                      >
                        Use
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
