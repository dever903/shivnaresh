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
  Eraser,
  Scissors,
  Move,
  RotateCw,
  Undo,
  Redo,
  FlipHorizontal,
  FlipVertical,
  Stamp,
  MousePointer,
  Maximize2,
  Trash2,
} from 'lucide-react';
import type { UserGeneration } from '../lib/api';
import { resolveImageUrl, getProxiedImageUrl, getApiUrl } from '../lib/api';
import { getBestGenUrl, loadSafeCanvasImage } from '../pages/Design';

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

interface ImageItem {
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
  const [paintTool, setPaintTool] = useState<'brush' | 'eyedropper' | 'extract' | 'move_patch'>('brush');
  const [brushType, setBrushType] = useState<'solid' | 'soft' | 'chisel' | 'stipple' | 'highlighter' | 'eraser'>('solid');
  const [brushColor, setBrushColor] = useState<string>('#E52B38');
  const [brushSize, setBrushSize] = useState<number>(24);
  const [brushOpacity, setBrushOpacity] = useState<number>(100);

  // Undo / Redo History Stack (up to 20 states)
  const [paintHistory, setPaintHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Active Area Clone Patch
  const [activePatch, setActivePatch] = useState<{
    canvas: HTMLCanvasElement;
    dataUrl: string;
    origW: number;
    origH: number;
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
    flipH: boolean;
    flipV: boolean;
    opacity: number;
  } | null>(null);
  const [selectionBox, setSelectionBox] = useState<{
    startX: number;
    startY: number;
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  // Target image for Paint Studio
  const [paintImageSource, setPaintImageSource] = useState<string | null>(null);
  const [paintImageTitle, setPaintImageTitle] = useState<string>('Studio Garment');

  // Paint Canvas Refs
  const paintCanvasRef = useRef<HTMLCanvasElement>(null);
  const paintOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const cleanPaintImageRef = useRef<HTMLImageElement | null>(null);
  const isPaintingRef = useRef<boolean>(false);
  const lastPaintPosRef = useRef<{ x: number; y: number } | null>(null);
  const isSelectingRef = useRef<boolean>(false);
  const isDraggingPatchRef = useRef<boolean>(false);
  const patchDragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

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

  // Consolidate images from My Sets
  const allImages = useMemo<ImageItem[]>(() => {
    const list: ImageItem[] = [];
    userGenerations
      .filter((g) => g.type !== 'video' && Boolean(getBestGenUrl(g)))
      .forEach((g) => {
        const u = getBestGenUrl(g);
        list.push({
          id: g.id,
          url: u,
          title: g.title || `Render #${g.id.slice(-4)}`,
          folder: g.folder || (g.isEdited ? 'edited' : 'generated'),
          source: 'mysets',
        });
      });
    return [...customUploads, ...list];
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
    } else if (subTab === 'paint' && paintCanvasRef.current && (!cleanPaintImageRef.current || paintHistory.length === 0)) {
      const srcUrl = previewCanvasRef.current?.toDataURL('image/png') || (activeImage ? activeImage.url : null);
      if (srcUrl) {
        handleOpenInPaintStudio(srcUrl, activeImage?.title || 'Studio Garment');
      }
    }
  }, [subTab]);

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
          setSelectedIds((prev) => new Set([...prev, item.id]));
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
  // Canva Paint & Area Clone Studio Methods
  // ----------------------------------------------------------------
  const handleOpenInPaintStudio = async (imageUrl: string, title?: string) => {
    try {
      setPaintImageSource(imageUrl);
      setPaintImageTitle(title || 'Studio Garment');
      setSubTab('paint');
      setActivePatch(null);
      setSelectionBox(null);
      setPaintTool('brush');

      const img = await loadSafeCanvasImage(imageUrl);
      cleanPaintImageRef.current = img;

      if (paintCanvasRef.current && paintOverlayCanvasRef.current) {
        const c = paintCanvasRef.current;
        const o = paintOverlayCanvasRef.current;
        const W = img.naturalWidth || 1024;
        const H = img.naturalHeight || 1024;
        c.width = W;
        c.height = H;
        o.width = W;
        o.height = H;
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, W, H);
          ctx.drawImage(img, 0, 0, W, H);
          const initialUrl = c.toDataURL('image/png');
          setPaintHistory([initialUrl]);
          setHistoryIndex(0);
        }
        const oCtx = o.getContext('2d');
        if (oCtx) oCtx.clearRect(0, 0, W, H);
      }
      showToast('🖌️ Opened in Canva Paint & Clone Studio!');
    } catch (err: any) {
      console.warn('[PaintStudio] Error opening image:', err);
      setError('Could not load image into Paint Studio.');
    }
  };

  // Redraw floating patch and selection box on overlay canvas
  const redrawPaintOverlay = (
    curPatch: typeof activePatch = activePatch,
    curBox: typeof selectionBox = selectionBox
  ) => {
    const overlay = paintOverlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    // 1. Draw Active Floating Patch if present
    if (curPatch) {
      const targetW = curPatch.origW * curPatch.scaleX;
      const targetH = curPatch.origH * curPatch.scaleY;

      ctx.save();
      ctx.translate(curPatch.x, curPatch.y);
      ctx.rotate((curPatch.rotation * Math.PI) / 180);
      ctx.scale(curPatch.flipH ? -1 : 1, curPatch.flipV ? -1 : 1);
      ctx.globalAlpha = curPatch.opacity;
      ctx.drawImage(curPatch.canvas, -targetW / 2, -targetH / 2, targetW, targetH);
      ctx.restore();

      // Bounding Box & Sizing Handles
      ctx.save();
      ctx.translate(curPatch.x, curPatch.y);
      ctx.rotate((curPatch.rotation * Math.PI) / 180);
      ctx.strokeStyle = '#e5373f';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(-targetW / 2, -targetH / 2, targetW, targetH);

      ctx.setLineDash([]);
      ctx.fillStyle = '#ffffff';
      const handleSize = 8;
      const handles = [
        [-targetW / 2, -targetH / 2],
        [targetW / 2, -targetH / 2],
        [targetW / 2, targetH / 2],
        [-targetW / 2, targetH / 2],
        [0, -targetH / 2], // top center
        [0, targetH / 2],  // bottom center
        [-targetW / 2, 0], // left center
        [targetW / 2, 0],  // right center
      ];
      for (const [hx, hy] of handles) {
        ctx.fillRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize);
        ctx.strokeRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize);
      }
      ctx.restore();
    }

    // 2. Draw Selection Box when selecting area
    if (curBox && curBox.w > 0 && curBox.h > 0) {
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(curBox.x, curBox.y, curBox.w, curBox.h);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
      ctx.fillRect(curBox.x, curBox.y, curBox.w, curBox.h);

      // Dimension Tag
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(curBox.x, Math.max(0, curBox.y - 24), 110, 20);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`${Math.round(curBox.w)} × ${Math.round(curBox.h)} px`, curBox.x + 6, Math.max(14, curBox.y - 10));
      ctx.restore();
    }
  };

  // Push Canvas Snapshot to Undo History Stack
  const pushPaintHistory = () => {
    if (!paintCanvasRef.current) return;
    const dataUrl = paintCanvasRef.current.toDataURL('image/png');
    setPaintHistory((prev) => {
      const sliced = prev.slice(0, historyIndex + 1);
      const next = [...sliced, dataUrl];
      if (next.length > 20) next.shift();
      return next;
    });
    setHistoryIndex((prev) => Math.min(19, prev + 1));
  };

  const handleUndoPaint = async () => {
    if (historyIndex <= 0 || !paintCanvasRef.current) return;
    const targetIdx = historyIndex - 1;
    const targetUrl = paintHistory[targetIdx];
    const img = await loadSafeCanvasImage(targetUrl);
    const ctx = paintCanvasRef.current.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, paintCanvasRef.current.width, paintCanvasRef.current.height);
      ctx.drawImage(img, 0, 0);
      setHistoryIndex(targetIdx);
      showToast('↩️ Undo');
    }
  };

  const handleRedoPaint = async () => {
    if (historyIndex >= paintHistory.length - 1 || !paintCanvasRef.current) return;
    const targetIdx = historyIndex + 1;
    const targetUrl = paintHistory[targetIdx];
    const img = await loadSafeCanvasImage(targetUrl);
    const ctx = paintCanvasRef.current.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, paintCanvasRef.current.width, paintCanvasRef.current.height);
      ctx.drawImage(img, 0, 0);
      setHistoryIndex(targetIdx);
      showToast('↪️ Redo');
    }
  };

  const handleClearPaint = async () => {
    if (!cleanPaintImageRef.current || !paintCanvasRef.current) return;
    const ctx = paintCanvasRef.current.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, paintCanvasRef.current.width, paintCanvasRef.current.height);
      ctx.drawImage(cleanPaintImageRef.current, 0, 0);
      pushPaintHistory();
      showToast('🧹 Cleared all brush strokes to original image!');
    }
  };

  // Draw Paint Dab at center (cx, cy)
  const drawPaintDab = (ctx: CanvasRenderingContext2D, cx: number, cy: number) => {
    const radius = Math.max(1, brushSize / 2);
    const alpha = Math.max(0.05, Math.min(1.0, brushOpacity / 100));
    const [r, g, b] = hexToRgb(brushColor);

    if (brushType === 'solid') {
      ctx.save();
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (brushType === 'soft') {
      ctx.save();
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
      grad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${alpha * 0.45})`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (brushType === 'chisel') {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.fillRect(-radius, -radius * 0.25, radius * 2, radius * 0.5);
      ctx.restore();
    } else if (brushType === 'stipple') {
      ctx.save();
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      const dotSpacing = Math.max(5, Math.round(brushSize * 0.28));
      const dotR = Math.max(1.2, brushSize * 0.055);
      for (let ox = -radius; ox <= radius; ox += dotSpacing) {
        for (let oy = -radius; oy <= radius; oy += dotSpacing) {
          if (ox * ox + oy * oy <= radius * radius) {
            ctx.beginPath();
            ctx.arc(cx + ox, cy + oy, dotR, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.restore();
    } else if (brushType === 'highlighter') {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.35})`;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (brushType === 'eraser') {
      if (cleanPaintImageRef.current) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(cleanPaintImageRef.current, 0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.restore();
      }
    }
  };

  const drawPaintSegment = (ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) => {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const step = Math.max(1, brushSize * 0.18);
    const count = Math.ceil(dist / step);
    for (let i = 0; i <= count; i++) {
      const t = count === 0 ? 0 : i / count;
      const cx = x0 + (x1 - x0) * t;
      const cy = y0 + (y1 - y0) * t;
      drawPaintDab(ctx, cx, cy);
    }
  };

  // Area Extract / Copy (Clone Patch)
  const handleExtractSelectedArea = () => {
    if (!selectionBox || selectionBox.w < 5 || selectionBox.h < 5 || !paintCanvasRef.current) {
      setError('Please drag a selection box over the garment area you want to copy.');
      return;
    }
    const canvas = paintCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imgData = ctx.getImageData(selectionBox.x, selectionBox.y, selectionBox.w, selectionBox.h);
    const patchCanvas = document.createElement('canvas');
    patchCanvas.width = selectionBox.w;
    patchCanvas.height = selectionBox.h;
    const pCtx = patchCanvas.getContext('2d');
    if (!pCtx) return;
    pCtx.putImageData(imgData, 0, 0);

    const patch = {
      canvas: patchCanvas,
      dataUrl: patchCanvas.toDataURL('image/png'),
      origW: selectionBox.w,
      origH: selectionBox.h,
      x: selectionBox.x + selectionBox.w / 2,
      y: selectionBox.y + selectionBox.h / 2,
      scaleX: 1.0,
      scaleY: 1.0,
      rotation: 0,
      flipH: false,
      flipV: false,
      opacity: 1.0,
    };

    setActivePatch(patch);
    setSelectionBox(null);
    setPaintTool('move_patch');
    redrawPaintOverlay(patch, null);
    showToast(`✂️ Area extracted (${selectionBox.w}×${selectionBox.h}px)! Drag & rotate anywhere on garment.`);
  };

  const handleStampPatchToCanvas = () => {
    if (!activePatch || !paintCanvasRef.current) return;
    const ctx = paintCanvasRef.current.getContext('2d');
    if (!ctx) return;

    const targetW = activePatch.origW * activePatch.scaleX;
    const targetH = activePatch.origH * activePatch.scaleY;

    ctx.save();
    ctx.translate(activePatch.x, activePatch.y);
    ctx.rotate((activePatch.rotation * Math.PI) / 180);
    ctx.scale(activePatch.flipH ? -1 : 1, activePatch.flipV ? -1 : 1);
    ctx.globalAlpha = activePatch.opacity;
    ctx.drawImage(activePatch.canvas, -targetW / 2, -targetH / 2, targetW, targetH);
    ctx.restore();

    pushPaintHistory();
    showToast('📌 Patch stamped onto image! You can drag and stamp it again, or click Done.');
  };

  const handleDiscardPatch = () => {
    setActivePatch(null);
    setSelectionBox(null);
    setPaintTool('brush');
    redrawPaintOverlay(null, null);
  };

  // Pointer event handlers for Paint Canvas
  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = paintOverlayCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) * (canvas.width / rect.width));
    const y = Math.round((e.clientY - rect.top) * (canvas.height / rect.height));
    return { x, y };
  };

  const handlePaintPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch { }
    const { x, y } = getCanvasCoords(e);

    if (paintTool === 'eyedropper') {
      if (paintCanvasRef.current) {
        const ctx = paintCanvasRef.current.getContext('2d');
        if (ctx) {
          const p = ctx.getImageData(x, y, 1, 1).data;
          const hex = rgbToHex(p[0], p[1], p[2]);
          setBrushColor(hex);
          setPaintTool('brush');
          showToast(`🎯 Eyedropper: Picked ${hex} (${getColorName(hex)})`);
        }
      }
      return;
    }

    if (paintTool === 'brush') {
      isPaintingRef.current = true;
      lastPaintPosRef.current = { x, y };
      if (paintCanvasRef.current) {
        const ctx = paintCanvasRef.current.getContext('2d');
        if (ctx) drawPaintDab(ctx, x, y);
      }
      return;
    }

    if (paintTool === 'extract') {
      isSelectingRef.current = true;
      const newBox = { startX: x, startY: y, x, y, w: 0, h: 0 };
      setSelectionBox(newBox);
      redrawPaintOverlay(activePatch, newBox);
      return;
    }

    if (paintTool === 'move_patch' && activePatch) {
      isDraggingPatchRef.current = true;
      patchDragOffsetRef.current = { x: x - activePatch.x, y: y - activePatch.y };
      return;
    }
  };

  const handlePaintPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e);

    if (isPaintingRef.current && paintTool === 'brush') {
      if (lastPaintPosRef.current && paintCanvasRef.current) {
        const ctx = paintCanvasRef.current.getContext('2d');
        if (ctx) {
          drawPaintSegment(ctx, lastPaintPosRef.current.x, lastPaintPosRef.current.y, x, y);
        }
      }
      lastPaintPosRef.current = { x, y };
      return;
    }

    if (isSelectingRef.current && paintTool === 'extract' && selectionBox) {
      const startX = selectionBox.startX;
      const startY = selectionBox.startY;
      const newBox = {
        startX,
        startY,
        x: Math.min(startX, x),
        y: Math.min(startY, y),
        w: Math.abs(x - startX),
        h: Math.abs(y - startY),
      };
      setSelectionBox(newBox);
      redrawPaintOverlay(activePatch, newBox);
      return;
    }

    if (isDraggingPatchRef.current && activePatch) {
      const nextPatch = {
        ...activePatch,
        x: x - patchDragOffsetRef.current.x,
        y: y - patchDragOffsetRef.current.y,
      };
      setActivePatch(nextPatch);
      redrawPaintOverlay(nextPatch, null);
      return;
    }
  };

  const handlePaintPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch { }

    if (isPaintingRef.current) {
      isPaintingRef.current = false;
      lastPaintPosRef.current = null;
      pushPaintHistory();
      return;
    }

    if (isSelectingRef.current) {
      isSelectingRef.current = false;
      return;
    }

    if (isDraggingPatchRef.current) {
      isDraggingPatchRef.current = false;
      return;
    }
  };

  const handleSavePaintResult = async (folder: 'ready' | 'edited') => {
    if (!paintCanvasRef.current) return;
    try {
      const dataUrl = paintCanvasRef.current.toDataURL('image/jpeg', 0.95);
      await onSaveToMySets(dataUrl, folder, paintImageTitle + ' (Custom Edit)');
      onRefreshGenerations();
      showToast(`⭐ Saved custom painted image to ${folder === 'ready' ? 'Ready to Use' : 'Edited'}!`);
    } catch (err: any) {
      setError('Save error: ' + (err?.message || err));
    }
  };

  const handleDownloadPaintCanvas = () => {
    if (!paintCanvasRef.current) return;
    const a = document.createElement('a');
    a.href = paintCanvasRef.current.toDataURL('image/png');
    a.download = `${paintImageTitle.replace(/[^a-z0-9_-]/gi, '-')}-custom-edit.png`;
    a.click();
    showToast('⬇️ Downloaded custom edited image!');
  };

  const handleSendBackToColorSwap = () => {
    if (!paintCanvasRef.current) return;
    const dataUrl = paintCanvasRef.current.toDataURL('image/jpeg', 0.95);
    const item: ImageItem = {
      id: 'paint_' + Date.now().toString(36),
      url: dataUrl,
      title: paintImageTitle + ' (Edited)',
      source: 'upload',
    };
    setCustomUploads((prev) => [item, ...prev]);
    setActiveImage(item);
    setSelectedIds((prev) => new Set([...prev, item.id]));
    setSubTab('swap');
    showToast('🔄 Sent edited garment back to Color Swap Studio!');
  };

  /* ----------------------------------------------------------------
     AI Semantic Garment Segmentation Service (Upper, Lower, Both)
     ---------------------------------------------------------------- */
  const getOrFetchAiMask = async (
    item: ImageItem,
    scope: 'upper' | 'lower' | 'both'
  ): Promise<{ garmentMask: HTMLImageElement | null; protectMask: HTMLImageElement | null }> => {
    try {
      const cached = aiMaskCacheRef.current.get(item.url);
      if (cached && cached[scope] && cached.protect) {
        const [garmentImg, protectImg] = await Promise.all([
          loadSafeCanvasImage(cached[scope]),
          loadSafeCanvasImage(cached.protect),
        ]);
        return { garmentMask: garmentImg, protectMask: protectImg };
      }

      const isDataUrl = item.url.startsWith('data:');
      const payload = isDataUrl ? { dataUrl: item.url } : { url: item.url };

      const targetUrl = getApiUrl('/api/segment-garment');
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch((_err: any) => null);

      if (!res || !res.ok) {
        return { garmentMask: null, protectMask: null };
      }

      const data = await res.json().catch(() => null);
      if (!data || !data.success || !data[scope]) {
        return { garmentMask: null, protectMask: null };
      }

      aiMaskCacheRef.current.set(item.url, {
        upper: data.upper,
        lower: data.lower,
        both: data.both,
        protect: data.protect,
      });

      const [garmentImg, protectImg] = await Promise.all([
        loadSafeCanvasImage(data[scope]),
        data.protect ? loadSafeCanvasImage(data.protect) : Promise.resolve(null),
      ]);
      return { garmentMask: garmentImg, protectMask: protectImg };
    } catch (err) {
      console.warn('[Segment Garment] Fetch exception, falling back to precision engine:', err);
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
    srcHex: string,
    tgtHex: string,
    tol: number,
    lOff: number,
    sMult: number,
    masks?: { garmentMask: HTMLImageElement | null; protectMask: HTMLImageElement | null } | null,
    logoConfig?: { mode: 'keep' | 'recolor'; colorHex: string },
    zipperConfig?: { mode: 'preserve' | 'match' }
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

    const [srcR, srcG, srcB] = hexToRgb(srcHex);
    const [tgtR, tgtG, tgtB] = hexToRgb(tgtHex);
    const [tgtL, tgtA, tgtBVal] = rgbToLab(tgtR, tgtG, tgtB);

    const logoModeChoice = logoConfig?.mode || 'keep';
    const [logoR, logoG, logoB] = hexToRgb(logoConfig?.colorHex || '#FFFFFF');
    const [logoL, logoA, logoBVal] = rgbToLab(logoR, logoG, logoB);

    const zipperModeChoice = zipperConfig?.mode || 'preserve';

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

      const baseLum = garmentLumCount > 0 ? totalGarmentLum / garmentLumCount : 128;
      const [baseL] = rgbToLab(baseLum, baseLum, baseLum);

      // 2. Pixel Iteration: Multi-Layer Logic + CIELAB Texture Transfer
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const pIdx = y * W + x;
          const i = pIdx * 4;

          // Strict AI Protect Mask: hair, face, skin, arms, legs, background
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

          // Layer 1: Logo & Text Embroidery Separation (Upper chest & collar region)
          if (y > 0.05 * H && y < 0.42 * H && x > 0.12 * W && x < 0.88 * W) {
            const isWhiteEmbroidery =
              r > 170 && g > 170 && b > 170 && Math.abs(r - g) < 22 && Math.abs(g - b) < 22;
            const isContrastingThread =
              Math.abs((0.299 * r + 0.587 * g + 0.114 * b) - baseLum) > 55;

            if (isWhiteEmbroidery || isContrastingThread) {
              if (logoModeChoice === 'keep') {
                continue; // 100% preserve authentic embroidered threads and stitches!
              } else {
                // Custom recolor logo
                const [pL] = rgbToLab(r, g, b);
                const deltaLogoL = pL - baseL;
                const newLogoL = Math.min(98, Math.max(10, logoL + deltaLogoL * 0.4));
                const [nr, ng, nb] = labToRgb(newLogoL, logoA, logoBVal);
                data[i] = Math.round(r * (1 - alpha) + nr * alpha);
                data[i + 1] = Math.round(g * (1 - alpha) + ng * alpha);
                data[i + 2] = Math.round(b * (1 - alpha) + nb * alpha);
                continue;
              }
            }
          }

          // Layer 2: Zipper Teeth & Slider Separation (Center seam)
          if (Math.abs(x - W * 0.5) < W * 0.11) {
            const isMetallicSpec =
              Math.abs(r - g) < 18 && Math.abs(g - b) < 18 && (r > 140 || (r > 100 && baseL < 30));
            if (isMetallicSpec && zipperModeChoice === 'preserve') {
              continue; // 100% preserve metallic teeth shine!
            }
          }

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

    // =========================================================================
    // PATH B: HEURISTIC SAFE FALLBACK (NO DEFRINGING LOOP)
    // =========================================================================
    const bgInfo = getStudioBackgroundColor(data, W, H);
    const { r: bgR, g: bgG, b: bgB } = bgInfo;
    const { h: sH, s: sS } = rgbToHsl(srcR, srcG, srcB);
    const srcYcc = toYCbCr(srcR, srcG, srcB);
    const isSrcSkin = isSkinPixel(srcR, srcG, srcB);
    const isSrcNeutral = sS < 0.22;
    const maxChromDist = Math.max(10, tol * 0.42);

    for (let y = Math.round(H * 0.03); y < Math.round(H * 0.97); y++) {
      for (let x = Math.round(W * 0.03); x < Math.round(W * 0.97); x++) {
        const i = (y * W + x) * 4;
        const a = data[i + 3];
        if (a < 50) continue;

        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const { h: pH, s: pS } = rgbToHsl(r, g, b);
        if (pH >= 10 && pH <= 48 && pS >= 0.35 && r > b + 30) continue;

        if (protectBackground) {
          const dBg = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2);
          if (dBg <= 18 && pS < 0.05) continue;
        }

        if (protectSkin && !isSrcSkin && isSkinPixel(r, g, b)) continue;

        let matchStrength = 0;
        if (!isSrcNeutral) {
          const dh = Math.abs(pH - sH);
          const hueDist = Math.min(dh, 360 - dh);
          if (hueDist < tol && pS > 0.08) {
            matchStrength = hueDist < tol * 0.70 ? 1.0 : Math.max(0, (tol - hueDist) / (tol * 0.30));
          }
        } else {
          const pYcc = toYCbCr(r, g, b);
          const chromDist = Math.sqrt((pYcc.cb - srcYcc.cb) ** 2 + (pYcc.cr - srcYcc.cr) ** 2);
          if (chromDist < maxChromDist * 2.1 && pS < 0.38) {
            matchStrength = Math.min(1.0, Math.max(0.2, (maxChromDist * 2.1 - chromDist) / (maxChromDist * 0.9)));
          }
        }

        if (matchStrength > 0.05) {
          const [pL] = rgbToLab(r, g, b);
          const [baseL] = rgbToLab(srcR, srcG, srcB);
          const deltaL = pL - baseL;
          const newL = tgtL < 22 ? Math.max(4, tgtL + deltaL * 0.35) : Math.min(96, Math.max(5, tgtL + deltaL * 0.7));
          const [nr, ng, nb] = labToRgb(newL, tgtA, tgtBVal);
          data[i] = Math.round(r * (1 - matchStrength) + nr * matchStrength);
          data[i + 1] = Math.round(g * (1 - matchStrength) + ng * matchStrength);
          data[i + 2] = Math.round(b * (1 - matchStrength) + nb * matchStrength);
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.95);
  };

  // Run Batch Color Swap on All Selected Images (ID-Based Multi-Pose Selection)
  const handleExecuteBatchColorSwap = async () => {
    let itemsToProcess: ImageItem[] = [];
    if (selectedIds.size > 0) {
      itemsToProcess = allImages.filter((img) => selectedIds.has(img.id));
    }
    if (itemsToProcess.length === 0 && activeImage) {
      itemsToProcess = [activeImage];
    }
    if (itemsToProcess.length === 0) {
      setError('Please select at least one image or pose to perform color swap.');
      return;
    }

    setIsProcessing(true);
    const newResults: RecolorResult[] = [];

    try {
      for (let i = 0; i < itemsToProcess.length; i++) {
        const item = itemsToProcess[i];
        setProgressMsg(`AI Segmenting & Swapping color for ${item.title} (${i + 1} of ${itemsToProcess.length})…`);

        const [loadedImg, masks] = await Promise.all([
          loadSafeCanvasImage(item.url),
          getOrFetchAiMask(item, garmentScope),
        ]);

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

        if (recoloredDataUrl) {
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

      setRecolorResults((prev) => {
        // Filter out identical previous results for same item & target color to prevent duplicate pose clones
        const filtered = prev.filter(
          (p) => !newResults.some((n) => n.sourceUrl === p.sourceUrl && n.targetHex === p.targetHex)
        );
        return [...newResults, ...filtered];
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
              if (previewCanvasRef.current && (!cleanPaintImageRef.current || paintHistory.length === 0)) {
                handleOpenInPaintStudio(previewCanvasRef.current.toDataURL('image/png'), activeImage?.title || 'Studio Garment');
              } else if (activeImage && (!cleanPaintImageRef.current || paintHistory.length === 0)) {
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
                        toggleSelectImage(img.id);
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
               SUB-TAB 2: Canva Paint & Area Clone Studio (MS Paint Pro Style)
               Multi-Brush, Eyedropper, Extract Area, Rotate & Free Transform
               ---------------------------------------------------------------- */
            <div className="space-y-5">
              {/* Top Studio Bar: Title, Active Image & Action Controls */}
              <div className={`rounded-2xl border p-4 ${isLight ? 'border-gray-200 bg-white shadow-sm' : 'border-zinc-800 bg-[#0e0e12]'}`}>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#e5373f]/15 border border-[#e5373f]/30 flex items-center justify-center">
                      <Paintbrush className="w-5 h-5 text-[#e5373f]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold flex items-center gap-2">
                        <span>Canva Paint & Clone Studio</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono font-medium border border-emerald-500/30">
                          Pro Mode
                        </span>
                      </h3>
                      <p className="text-[11px] opacity-70">
                        Editing: <span className="font-semibold text-zinc-300">{paintImageTitle}</span>
                        {paintImageSource && <span className="ml-2 text-[9px] text-zinc-500">({paintCanvasRef.current ? `${paintCanvasRef.current.width}×${paintCanvasRef.current.height}px` : 'Active'})</span>}
                      </p>
                    </div>
                  </div>

                  {/* Actions: Undo, Redo, Clear, Send to Color Swap, Save, Download */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      disabled={historyIndex <= 0}
                      onClick={handleUndoPaint}
                      className="p-2 rounded-lg text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition"
                      title="Undo stroke or stamp (Ctrl+Z)"
                    >
                      <Undo className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={historyIndex >= paintHistory.length - 1}
                      onClick={handleRedoPaint}
                      className="p-2 rounded-lg text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition"
                      title="Redo stroke or stamp (Ctrl+Y)"
                    >
                      <Redo className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleClearPaint}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 cursor-pointer flex items-center gap-1 transition"
                      title="Reset canvas back to original"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                      <span>Reset</span>
                    </button>

                    <div className="h-5 w-px bg-zinc-700 mx-1" />

                    <button
                      type="button"
                      onClick={handleSendBackToColorSwap}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 cursor-pointer flex items-center gap-1.5 transition"
                      title="Send this edited canvas into Color Swap to change colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
                      <span>🔄 Send to Color Swap</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSavePaintResult('ready')}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black cursor-pointer flex items-center gap-1.5 shadow-sm transition"
                    >
                      <Bookmark className="w-3.5 h-3.5" />
                      <span>⭐ Ready</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSavePaintResult('edited')}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 cursor-pointer flex items-center gap-1"
                    >
                      <span>💾 Edited</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadPaintCanvas}
                      className="p-2 rounded-lg text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 cursor-pointer"
                      title="Download PNG"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Tool Selection Tabs Bar */}
              <div className={`rounded-2xl border p-3 flex flex-wrap items-center justify-between gap-3 ${isLight ? 'border-gray-200 bg-white shadow-sm' : 'border-zinc-800 bg-[#0e0e12]'}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 mr-1 flex items-center gap-1">
                    <MousePointer className="w-3.5 h-3.5" />
                    <span>Mode:</span>
                  </span>

                  <button
                    type="button"
                    onClick={() => { setPaintTool('brush'); if (brushType === 'eraser') setBrushType('solid'); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      paintTool === 'brush' && brushType !== 'eraser'
                        ? 'bg-[#e5373f] text-white shadow-md'
                        : isLight ? 'bg-gray-100 hover:bg-gray-200 text-gray-800' : 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300'
                    }`}
                  >
                    <Paintbrush className="w-3.5 h-3.5" />
                    <span>🖌️ Multi-Brush</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setPaintTool('brush'); setBrushType('eraser'); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      paintTool === 'brush' && brushType === 'eraser'
                        ? 'bg-[#e5373f] text-white shadow-md'
                        : isLight ? 'bg-gray-100 hover:bg-gray-200 text-gray-800' : 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300'
                    }`}
                  >
                    <Eraser className="w-3.5 h-3.5" />
                    <span>🧹 Fabric Eraser</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaintTool('eyedropper')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      paintTool === 'eyedropper'
                        ? 'bg-sky-600 text-white shadow-md'
                        : isLight ? 'bg-gray-100 hover:bg-gray-200 text-gray-800' : 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300'
                    }`}
                  >
                    <Pipette className="w-3.5 h-3.5" />
                    <span>🧪 Canva Eyedropper</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaintTool('extract')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      paintTool === 'extract'
                        ? 'bg-amber-600 text-white shadow-md'
                        : isLight ? 'bg-gray-100 hover:bg-gray-200 text-gray-800' : 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300'
                    }`}
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    <span>✂️ Extract / Copy Area</span>
                  </button>

                  {activePatch && (
                    <button
                      type="button"
                      onClick={() => setPaintTool('move_patch')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        paintTool === 'move_patch'
                          ? 'bg-emerald-600 text-white shadow-md animate-pulse'
                          : isLight ? 'bg-gray-100 hover:bg-gray-200 text-gray-800' : 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300'
                      }`}
                    >
                      <Move className="w-3.5 h-3.5" />
                      <span>✋ Move Active Patch</span>
                    </button>
                  )}
                </div>

                {/* If selection box is active in extract mode, show Extract button right away */}
                {paintTool === 'extract' && selectionBox && selectionBox.w > 5 && selectionBox.h > 5 && (
                  <button
                    type="button"
                    onClick={handleExtractSelectedArea}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black flex items-center gap-1.5 cursor-pointer shadow-md animate-bounce"
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    <span>✂️ Extract ({selectionBox.w}×{selectionBox.h}px)</span>
                  </button>
                )}
              </div>

              {/* BRUSH OPTIONS DECK (Visible when tool is brush) */}
              {paintTool === 'brush' && brushType !== 'eraser' && (
                <div className={`rounded-2xl border p-4 space-y-4 ${isLight ? 'border-gray-200 bg-white shadow-sm' : 'border-zinc-800 bg-[#0e0e12]'}`}>
                  {/* Brush Type Selector (MS Paint Pro Style) */}
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2 block">
                      Choose Brush Type (MS Paint Pro Studio Styles)
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                      {[
                        { type: 'solid', name: 'Solid Round', icon: '🖌️', desc: 'Opaque crisp line for logos & edges' },
                        { type: 'soft', name: 'Soft Airbrush', icon: '💨', desc: 'Feathered edges for shadows & folds' },
                        { type: 'chisel', name: 'Chisel Nib', icon: '✒️', desc: 'Angled ribbon for stripes & zip' },
                        { type: 'stipple', name: 'Fabric Mesh', icon: '⁝⁝', desc: 'Micro-dot vents & sleeve perforations' },
                        { type: 'highlighter', name: 'Glaze Wash', icon: '🖍️', desc: 'Translucent color wash with fabric grain' },
                      ].map((b) => (
                        <button
                          key={b.type}
                          type="button"
                          onClick={() => setBrushType(b.type as any)}
                          className={`p-2.5 rounded-xl border text-left cursor-pointer transition ${
                            brushType === b.type
                              ? 'border-[#e5373f] bg-[#e5373f]/15 shadow-sm'
                              : isLight ? 'border-gray-200 bg-gray-50 hover:bg-gray-100' : 'border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-sm">{b.icon}</span>
                            <span className="text-xs font-bold text-zinc-200">{b.name}</span>
                          </div>
                          <p className="text-[10px] text-zinc-400 leading-tight">{b.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Size & Opacity Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div className={`p-3 rounded-xl border ${isLight ? 'border-gray-200 bg-gray-50' : 'border-zinc-800 bg-zinc-900/60'}`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-zinc-300">Brush Size</span>
                        <span className="text-xs font-mono font-bold text-[#e5373f]">{brushSize}px</span>
                      </div>
                      <input
                        type="range"
                        min="2"
                        max="120"
                        step="1"
                        value={brushSize}
                        onChange={(e) => setBrushSize(Number(e.target.value))}
                        className="w-full accent-[#e5373f] cursor-pointer"
                      />
                    </div>

                    <div className={`p-3 rounded-xl border ${isLight ? 'border-gray-200 bg-gray-50' : 'border-zinc-800 bg-zinc-900/60'}`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-zinc-300">Brush Opacity</span>
                        <span className="text-xs font-mono font-bold text-emerald-400">{brushOpacity}%</span>
                      </div>
                      <input
                        type="range"
                        min="5"
                        max="100"
                        step="1"
                        value={brushOpacity}
                        onChange={(e) => setBrushOpacity(Number(e.target.value))}
                        className="w-full accent-emerald-500 cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Paint Color Palette & Eyedropper */}
                  <div className={`p-3.5 rounded-xl border space-y-2.5 ${isLight ? 'border-gray-200 bg-gray-50' : 'border-zinc-800 bg-zinc-900/60'}`}>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-300">Selected Brush Color:</span>
                        <span
                          className="w-5 h-5 rounded-md border border-white/40 shadow-inner inline-block"
                          style={{ backgroundColor: brushColor }}
                        />
                        <span className="text-xs font-mono font-bold">{brushColor}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPaintTool('eyedropper')}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 cursor-pointer flex items-center gap-1"
                        >
                          <Pipette className="w-3.5 h-3.5 text-sky-400" />
                          <span>Sample from Canvas</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleNativeEyedropper('source')}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 cursor-pointer flex items-center gap-1"
                        >
                          <Pipette className="w-3.5 h-3.5 text-amber-400" />
                          <span>Screen Eyedropper</span>
                        </button>
                        <input
                          type="color"
                          value={brushColor}
                          onChange={(e) => setBrushColor(e.target.value)}
                          className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                          title="Custom Color Picker"
                        />
                      </div>
                    </div>

                    {/* Quick Garment Swatches */}
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      {[
                        { hex: '#000000', name: 'Carbon Black' },
                        { hex: '#FFFFFF', name: 'Pure White' },
                        { hex: '#E52B38', name: 'Crimson Red' },
                        { hex: '#1C3144', name: 'Royal Navy' },
                        { hex: '#D4AF37', name: 'Gold / Brass' },
                        { hex: '#2A5A3B', name: 'Forest Green' },
                        { hex: '#708090', name: 'Slate Grey' },
                        { hex: '#FF6B35', name: 'Neon Orange' },
                        { hex: '#7B2CBF', name: 'Deep Purple' },
                        { hex: '#A8DADC', name: 'Sage Mint' },
                      ].map((swatch) => (
                        <button
                          key={swatch.hex}
                          type="button"
                          onClick={() => setBrushColor(swatch.hex)}
                          className={`w-7 h-7 rounded-lg border flex items-center justify-center cursor-pointer transition hover:scale-110 shadow-xs ${
                            brushColor.toLowerCase() === swatch.hex.toLowerCase()
                              ? 'border-white scale-110 ring-2 ring-[#e5373f]'
                              : 'border-white/20'
                          }`}
                          style={{ backgroundColor: swatch.hex }}
                          title={`${swatch.name} (${swatch.hex})`}
                        >
                          {brushColor.toLowerCase() === swatch.hex.toLowerCase() && (
                            <Check className={`w-3.5 h-3.5 ${swatch.hex === '#FFFFFF' ? 'text-black' : 'text-white'}`} />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ERASER CONTROLS (Visible when eraser is chosen) */}
              {paintTool === 'brush' && brushType === 'eraser' && (
                <div className={`rounded-2xl border p-4 space-y-3 ${isLight ? 'border-gray-200 bg-gray-50' : 'border-zinc-800 bg-zinc-900/60'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                      <Eraser className="w-4 h-4 text-rose-400" />
                      <span>Fabric Eraser Active (Restores original garment underneath)</span>
                    </span>
                    <span className="text-xs font-mono font-bold text-rose-400">{brushSize}px</span>
                  </div>
                  <input
                    type="range"
                    min="4"
                    max="100"
                    step="1"
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    className="w-full accent-rose-500 cursor-pointer"
                  />
                </div>
              )}

              {/* EXTRACT & TRANSFORM CONTROLS (Active Patch Deck) */}
              {activePatch && (
                <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-4 shadow-lg backdrop-blur-md">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                        <Scissors className="w-4 h-4 text-amber-400" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-amber-300">
                          Extracted Area Active ({activePatch.origW} × {activePatch.origH}px)
                        </h4>
                        <p className="text-[10px] text-zinc-300">
                          Original region is untouched. Drag patch to place anywhere, rotate, or stretch from any side!
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleStampPatchToCanvas}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer flex items-center gap-1.5 shadow-md transition"
                        title="Permanently stamp patch onto canvas"
                      >
                        <Stamp className="w-4 h-4" />
                        <span>Stamp to Canvas (Apply)</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleDiscardPatch}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 cursor-pointer flex items-center gap-1"
                        title="Discard extracted patch"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                        <span>Discard</span>
                      </button>
                    </div>
                  </div>

                  {/* Transformation Controls: Rotation & Multi-Area Sizing */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                    {/* 1. Rotation Slider & Quick Buttons */}
                    <div className="p-3 rounded-xl border border-white/10 bg-black/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-zinc-300 flex items-center gap-1">
                          <RotateCw className="w-3 h-3 text-amber-400" />
                          <span>Rotate Angle</span>
                        </span>
                        <span className="text-[11px] font-mono font-bold text-amber-400">{Math.round(activePatch.rotation)}°</span>
                      </div>
                      <input
                        type="range"
                        min="-180"
                        max="180"
                        step="1"
                        value={activePatch.rotation}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setActivePatch((prev) => {
                            if (!prev) return null;
                            const next = { ...prev, rotation: val };
                            redrawPaintOverlay(next);
                            return next;
                          });
                        }}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                      <div className="flex items-center gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setActivePatch((prev) => {
                              if (!prev) return null;
                              const next = { ...prev, rotation: (prev.rotation - 90) % 360 };
                              redrawPaintOverlay(next);
                              return next;
                            });
                          }}
                          className="flex-1 py-0.5 rounded text-[10px] font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer"
                        >
                          -90°
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActivePatch((prev) => {
                              if (!prev) return null;
                              const next = { ...prev, rotation: 0 };
                              redrawPaintOverlay(next);
                              return next;
                            });
                          }}
                          className="flex-1 py-0.5 rounded text-[10px] font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer"
                        >
                          0°
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActivePatch((prev) => {
                              if (!prev) return null;
                              const next = { ...prev, rotation: (prev.rotation + 90) % 360 };
                              redrawPaintOverlay(next);
                              return next;
                            });
                          }}
                          className="flex-1 py-0.5 rounded text-[10px] font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer"
                        >
                          +90°
                        </button>
                      </div>
                    </div>

                    {/* 2. Stretch Width (Scale X from sides) */}
                    <div className="p-3 rounded-xl border border-white/10 bg-black/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-zinc-300 flex items-center gap-1">
                          <Maximize2 className="w-3 h-3 text-sky-400" />
                          <span>Stretch Width (X)</span>
                        </span>
                        <span className="text-[11px] font-mono font-bold text-sky-400">{activePatch.scaleX.toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="4.0"
                        step="0.05"
                        value={activePatch.scaleX}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setActivePatch((prev) => {
                            if (!prev) return null;
                            const next = { ...prev, scaleX: val };
                            redrawPaintOverlay(next);
                            return next;
                          });
                        }}
                        className="w-full accent-sky-500 cursor-pointer"
                      />
                      <p className="text-[9px] text-zinc-400">Make wider/narrower from sides</p>
                    </div>

                    {/* 3. Stretch Height (Scale Y from top/bottom) */}
                    <div className="p-3 rounded-xl border border-white/10 bg-black/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-zinc-300 flex items-center gap-1">
                          <Maximize2 className="w-3 h-3 text-emerald-400" />
                          <span>Stretch Height (Y)</span>
                        </span>
                        <span className="text-[11px] font-mono font-bold text-emerald-400">{activePatch.scaleY.toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="4.0"
                        step="0.05"
                        value={activePatch.scaleY}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setActivePatch((prev) => {
                            if (!prev) return null;
                            const next = { ...prev, scaleY: val };
                            redrawPaintOverlay(next);
                            return next;
                          });
                        }}
                        className="w-full accent-emerald-500 cursor-pointer"
                      />
                      <p className="text-[9px] text-zinc-400">Make taller/shorter from top/bottom</p>
                    </div>

                    {/* 4. Flip & Opacity */}
                    <div className="p-3 rounded-xl border border-white/10 bg-black/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-zinc-300">Flip & Blend</span>
                        <span className="text-[11px] font-mono font-bold text-zinc-300">{Math.round(activePatch.opacity * 100)}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setActivePatch((prev) => {
                              if (!prev) return null;
                              const next = { ...prev, flipH: !prev.flipH };
                              redrawPaintOverlay(next);
                              return next;
                            });
                          }}
                          className={`flex-1 py-1 rounded text-[10px] font-bold border cursor-pointer flex items-center justify-center gap-1 ${
                            activePatch.flipH
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                          }`}
                        >
                          <FlipHorizontal className="w-3 h-3" />
                          <span>Flip H</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActivePatch((prev) => {
                              if (!prev) return null;
                              const next = { ...prev, flipV: !prev.flipV };
                              redrawPaintOverlay(next);
                              return next;
                            });
                          }}
                          className={`flex-1 py-1 rounded text-[10px] font-bold border cursor-pointer flex items-center justify-center gap-1 ${
                            activePatch.flipV
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                          }`}
                        >
                          <FlipVertical className="w-3 h-3" />
                          <span>Flip V</span>
                        </button>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="1.0"
                        step="0.05"
                        value={activePatch.opacity}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setActivePatch((prev) => {
                            if (!prev) return null;
                            const next = { ...prev, opacity: val };
                            redrawPaintOverlay(next);
                            return next;
                          });
                        }}
                        className="w-full accent-zinc-400 cursor-pointer"
                        title="Patch Opacity"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* DUAL-LAYER PAINT CANVAS VIEWPORT */}
              <div className={`rounded-2xl border p-4 space-y-3 ${isLight ? 'border-gray-200 bg-white shadow-sm' : 'border-zinc-800 bg-[#0e0e12]'}`}>
                <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-zinc-200">
                      {paintTool === 'brush' && (brushType === 'eraser' ? '🧹 Eraser Mode' : `🖌️ ${brushType.toUpperCase()} Brush (${brushSize}px, ${brushOpacity}%)`)}
                      {paintTool === 'eyedropper' && '🧪 Canvas Eyedropper — Click anywhere to sample color'}
                      {paintTool === 'extract' && '✂️ Extract Area Mode — Drag a box to copy region'}
                      {paintTool === 'move_patch' && '✋ Move Patch Mode — Drag to place, use sliders to transform'}
                    </span>
                  </div>
                  <span className="text-[10px] opacity-70">
                    Use pointer to draw or drag directly on garment
                  </span>
                </div>

                <div className="relative rounded-xl overflow-hidden border border-white/10 bg-zinc-950 flex items-center justify-center p-2 min-h-[420px] select-none">
                  {/* Base Paint Canvas */}
                  <canvas
                    ref={paintCanvasRef}
                    className="max-h-[520px] max-w-full object-contain rounded-lg shadow-2xl block"
                  />
                  {/* Overlay Canvas for floating patch, marquee box, and pointer interaction */}
                  <canvas
                    ref={paintOverlayCanvasRef}
                    onPointerDown={handlePaintPointerDown}
                    onPointerMove={handlePaintPointerMove}
                    onPointerUp={handlePaintPointerUp}
                    className={`absolute inset-0 max-h-[520px] max-w-full m-auto object-contain rounded-lg ${
                      paintTool === 'eyedropper'
                        ? 'cursor-crosshair'
                        : paintTool === 'extract'
                          ? 'cursor-cell'
                          : paintTool === 'move_patch'
                            ? 'cursor-move'
                            : 'cursor-crosshair'
                    }`}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1 pt-1">
                  <span>
                    💡 <strong className="text-zinc-200">Tip:</strong> For sleeve micro-perforations (shown in user photo), choose <strong>Fabric Mesh (⁝⁝)</strong>. To duplicate a logo or zipper tooth, use <strong>Extract / Copy Area (✂️)</strong>.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (paintTool === 'extract' && selectionBox) {
                        handleExtractSelectedArea();
                      } else {
                        setPaintTool('extract');
                        showToast('✂️ Drag a box over any garment area to copy it!');
                      }
                    }}
                    className="text-[#e5373f] hover:underline font-semibold cursor-pointer shrink-0 ml-2"
                  >
                    Quick Copy Region →
                  </button>
                </div>
              </div>
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
