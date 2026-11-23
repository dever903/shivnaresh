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
  Image as ImageIcon,
} from 'lucide-react';
import type { UserGeneration } from '../lib/api';
import { resolveImageUrl, getProxiedImageUrl } from '../lib/api';
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
  // Navigation sub-tabs: Swap vs Palette/Eyedropper
  const [subTab, setSubTab] = useState<'swap' | 'palette'>('swap');

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

  // Keep live canvas restored when returning from Palette subtab to Swap subtab
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

  /* ----------------------------------------------------------------
     Core Recolor Algorithm — Garment-Only Precision
     Multi-layer protection & authentic optical fabric transfer:
       1. BFS flood-fill background mask from image borders (studio wall & floor).
       2. YCbCr + RGB skin classifier (model face, neck, nape, arms).
       3. Hair tone protection (upper head region).
       4. Shiv-Naresh HD Logo protection (white/reflective/red embroidery preserved).
       5. 3D Luminance & Texture preservation:
          - Deep Dark / Carbon Black: preserves 3D creases & satin sheen at true tL (~0.09)
          - Pure White: preserves realistic shading without turning muddy grey
          - Saturated Colors: transfers full vivid saturation (Shiv-Naresh Red, Navy, Gold)
     ---------------------------------------------------------------- */
  const recolorCanvas = (
    sourceImg: HTMLImageElement,
    srcHex: string,
    tgtHex: string,
    tol: number,
    lOff: number,
    sMult: number
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

    // Sample studio backdrop color (corners and borders with outlier rejection)
    const bgInfo = getStudioBackgroundColor(data, W, H);
    const { r: bgR, g: bgG, b: bgB, l: bgL } = bgInfo;

    // Outer edge boundary guard (skip 3% margin to protect studio backdrop edge artifacts)
    const zoneLeft = Math.round(W * 0.03);
    const zoneRight = Math.round(W * 0.97);
    const zoneTop = Math.round(H * 0.03);
    const zoneBottom = Math.round(H * 0.97);

    const [srcR, srcG, srcB] = hexToRgb(srcHex);
    const [tgtR, tgtG, tgtB] = hexToRgb(tgtHex);
    const { h: sH, s: sS, l: sL } = rgbToHsl(srcR, srcG, srcB);
    const { h: tH, s: tS, l: tL } = rgbToHsl(tgtR, tgtG, tgtB);
    const srcYcc = toYCbCr(srcR, srcG, srcB);

    const isSrcSkin = isSkinPixel(srcR, srcG, srcB);
    const isSrcNeutral = sS < 0.22;
    const maxChromDist = Math.max(10, tol * 0.42);

    const garmentMask = new Uint8Array(W * H);
    const logoMask = new Uint8Array(W * H);

    // Pre-pass: Detect Shiv-Naresh HD Logo embroidery seeds & dilate to preserve full vector strokes
    if (protectLogos) {
      const seeds: number[] = [];
      const logoZoneTop = Math.round(H * 0.05);
      const logoZoneBottom = Math.round(H * 0.65);
      const logoZoneLeft = Math.round(W * 0.10);
      const logoZoneRight = Math.round(W * 0.90);

      for (let y = logoZoneTop; y < logoZoneBottom; y++) {
        for (let x = logoZoneLeft; x < logoZoneRight; x++) {
          const pIdx = y * W + x;
          const i = pIdx * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const { h: pH, s: pS, l: pL } = rgbToHsl(r, g, b);

          const isWhiteSeed =
            sL > 0.50
              ? pL > 0.88 && pL > sL + 0.04 && pS < 0.16
              : pL > 0.72 && pS < 0.20;
          const isRedSeed = sS < 0.40 && pS > 0.65 && (pH > 340 || pH < 20);

          if (isWhiteSeed || isRedSeed) {
            logoMask[pIdx] = 1;
            seeds.push(pIdx);
          }
        }
      }

      let currentSeeds = seeds;
      for (let pass = 0; pass < 2 && currentSeeds.length > 0; pass++) {
        const nextSeeds: number[] = [];
        for (const pIdx of currentSeeds) {
          const cy = Math.floor(pIdx / W);
          const cx = pIdx % W;
          for (let dy = -1; dy <= 1; dy++) {
            const ny = cy + dy;
            if (ny < logoZoneTop || ny >= logoZoneBottom) continue;
            for (let dx = -1; dx <= 1; dx++) {
              if (dy === 0 && dx === 0) continue;
              const nx = cx + dx;
              if (nx < logoZoneLeft || nx >= logoZoneRight) continue;
              const nIdx = ny * W + nx;
              if (logoMask[nIdx] !== 0) continue;

              const ni = nIdx * 4;
              const nr = data[ni];
              const ng = data[ni + 1];
              const nb = data[ni + 2];
              const { l: npL, s: npS } = rgbToHsl(nr, ng, nb);

              if (npL > sL - 0.02 && npS < 0.20) {
                logoMask[nIdx] = 1;
                nextSeeds.push(nIdx);
              }
            }
          }
        }
        currentSeeds = nextSeeds;
      }
    }

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const a = data[i + 3];
        if (a < 50) continue;

        // Skip outer frame borders
        if (x < zoneLeft || x > zoneRight || y < zoneTop || y > zoneBottom) continue;

        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const { h: pH, s: pS, l: pL } = rgbToHsl(r, g, b);
        const pYcc = toYCbCr(r, g, b);
        const warmth = pYcc.cr - pYcc.cb; // positive for warm fabrics (beige/tan/skin), neutral/negative for cool studio cyclorama grey

        // 1. Studio Background Guard (Accurately protects studio wall, floor, hand gaps & leg gaps without leaking into garments)
        if (protectBackground) {
          const dBg = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2);
          if (pS <= 0.045 && warmth <= 1.8 && Math.abs(pL - bgL) <= 0.30) continue;
          if (dBg <= 18 && pS < 0.05) continue;
        }

        // 2. Skin Guard: Never recolor face, neck, nape, ears, arms
        if (protectSkin && !isSrcSkin && isSkinPixel(r, g, b)) continue;

        // 3. Hair Guard: Protect natural dark hair across all poses (both torso crops and full-length)
        if (sL > 0.40 && pL < 0.38 && r > b) {
          continue;
        }

        // 4. Pants / Lower Garment Guard:
        // Protect dark pants / leggings across all poses
        if (sL > 0.40 && pL < 0.22) continue;

        // 5. Shiv-Naresh HD Logo Guard & Vector Clarity:
        if (protectLogos && logoMask[y * W + x] === 1) {
          data[i] = 252;
          data[i + 1] = 252;
          data[i + 2] = 255;
          garmentMask[y * W + x] = 2; // Protected logo marker
          continue;
        }

        let matchStrength = 0;

        if (!isSrcNeutral) {
          // Saturated garment fabric (Red, Olympic Navy, Royal Blue, Olive Green, Gold, etc.)
          const dh = Math.abs(pH - sH);
          const hueDist = Math.min(dh, 360 - dh);
          if (hueDist < tol && pS > 0.08) {
            matchStrength = hueDist < tol * 0.70 ? 1.0 : Math.max(0, (tol - hueDist) / (tol * 0.30));
          }
        } else {
          // Neutral garment fabric (Beige, Grey, Silver, White, Off-white)
          // Uses YCbCr chrominance distance + fabric warmth classification
          const chromDist = Math.sqrt((pYcc.cb - srcYcc.cb) ** 2 + (pYcc.cr - srcYcc.cr) ** 2);
          const srcWarmth = srcYcc.cr - srcYcc.cb;

          if (srcWarmth >= 2.0) {
            // Warm neutral fabric (Beige, Khaki, Camel, Tan, Cream, Off-white, Peach):
            // Smoothly match fabric including all sleeve edges, cuffs, folds & seams down to warmth >= 0.2
            if (warmth >= 0.2 && chromDist < maxChromDist * 1.35 && Math.abs(pL - sL) < 0.58) {
              const wScore = Math.min(1.0, Math.max(0.0, (warmth - 0.1) / 0.6));
              const cScore = Math.min(1.0, Math.max(0.0, (maxChromDist * 1.35 - chromDist) / (maxChromDist * 0.35)));
              matchStrength = Math.max(0.20, wScore * cScore);
            }
          } else {
            // Cool neutral fabric (Heather Grey, Silver Grey, Charcoal):
            if (chromDist < maxChromDist && pS < 0.25 && Math.abs(pL - sL) < 0.38) {
              matchStrength = chromDist < maxChromDist * 0.70 ? 1.0 : Math.max(0, (maxChromDist - chromDist) / (maxChromDist * 0.30));
            }
          }
        }

        if (matchStrength > 0.02) {
          garmentMask[y * W + x] = 1;

          // 6. Photorealistic Fabric Texture, Crease & Zipper Luminance Transfer
          const pY = 0.299 * r + 0.587 * g + 0.114 * b;
          const sY = 0.299 * srcR + 0.587 * srcG + 0.114 * srcB;
          const deltaY = (pY - sY) / Math.max(10.0, sY); // Relative high-frequency contrast signal [-0.6 .. +0.6]

          let newL: number;
          if (tL < 0.22) {
            // Deep Dark / Carbon Black spectrum:
            // Base drops to authentic rich athletic black (~0.12..0.15, matching physical cloth)
            // Fold creases (deltaY < 0) drop to deep shadow (~0.06..0.11, RGB 15..28)
            // Fabric sheen, seams, and zipper teeth (deltaY > 0) rise with specular clarity (~0.20..0.48, RGB 50..125)
            const lBase = Math.max(0.11, tL * 1.15);
            if (deltaY <= 0) {
              newL = lBase * (1.0 + deltaY * 0.70) + lOff;
            } else {
              const specularBoost = Math.pow(Math.max(0, deltaY - 0.15), 1.25) * 0.45;
              newL = lBase + deltaY * 0.55 + specularBoost + lOff;
            }
          } else if (tL > 0.78) {
            // Pure White spectrum:
            // Base rises to clean athletic white (~0.91..0.95), preserving fold depth without turning muddy
            const lBase = Math.min(0.93, 0.88 + tL * 0.06);
            if (deltaY <= 0) {
              newL = lBase + deltaY * 0.65 + lOff;
            } else {
              newL = lBase + deltaY * 0.15 + lOff;
            }
          } else {
            // Midtone spectrum (Athletic Red, Olympic Navy, Royal Blue, Olive Green, Canary Gold, Orange, Maroon):
            // Flat cloth precisely hits target color, folds reflect natural light, zipper teeth stay sharp
            if (deltaY <= 0) {
              newL = tL + deltaY * Math.min(0.85, tL * 1.2) + lOff;
            } else {
              const specular = Math.pow(Math.max(0, deltaY - 0.20), 1.2) * 0.35;
              newL = tL + deltaY * (1.0 - tL * 0.55) + specular + lOff;
            }
          }
          newL = Math.min(0.96, Math.max(0.04, newL));

          // Specular Rolloff: High metallic/sheen glints (zipper teeth, nylon reflection)
          // naturally reflect white studio softbox light, smoothly desaturating instead of harsh speckled dots
          const specRolloff = Math.min(1.0, Math.max(0.0, (pL - 0.78) / 0.18));
          const newS = Math.max(0.0, Math.min(1.0, tS * sMult * (1.0 - specRolloff * 0.65)));
          const newH = tH;

          const [resR, resG, resB] = hslToRgb(newH, newS, newL);
          data[i] = Math.round(r * (1 - matchStrength) + resR * matchStrength);
          data[i + 1] = Math.round(g * (1 - matchStrength) + resG * matchStrength);
          data[i + 2] = Math.round(b * (1 - matchStrength) + resB * matchStrength);
        }
      }
    }

    // =========================================================================
    // PASS 2: BOUNDARY DEFRINGING (ELIMINATING LAST COLOR ON BORDERS)
    // =========================================================================
    // Strictly 1-pixel boundary defringing without mutating the garment mask (prevents background flood cascade)
    const [defR, defG, defB] = hslToRgb(tH, Math.max(tS, 0.12), tL < 0.22 ? 0.13 : tL);
    const defringeIndices: number[] = [];

    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const pIdx = y * W + x;
        if (garmentMask[pIdx] !== 0) continue;

        const i = pIdx * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Never defringe skin or pure background
        if (isSkinPixel(r, g, b)) continue;
        const dBg = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2);
        if (dBg <= 16) continue;

        // Check if directly neighboring an original recolored garment pixel
        const hasGarmentNeighbor =
          garmentMask[pIdx - 1] === 1 ||
          garmentMask[pIdx + 1] === 1 ||
          garmentMask[pIdx - W] === 1 ||
          garmentMask[pIdx + W] === 1;

        if (!hasGarmentNeighbor) continue;

        // Verify this boundary pixel actually carries residual warm fabric tint
        const pYcc = toYCbCr(r, g, b);
        const warmth = pYcc.cr - pYcc.cb;
        const chromDist = Math.sqrt((pYcc.cb - srcYcc.cb) ** 2 + (pYcc.cr - srcYcc.cr) ** 2);

        if (warmth >= 0.2 && chromDist < maxChromDist * 1.5) {
          defringeIndices.push(pIdx);
        }
      }
    }

    for (const pIdx of defringeIndices) {
      const i = pIdx * 4;
      data[i] = Math.round(bgR * 0.35 + defR * 0.65);
      data[i + 1] = Math.round(bgG * 0.35 + defG * 0.65);
      data[i + 2] = Math.round(bgB * 0.35 + defB * 0.65);
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
        setProgressMsg(`Swapping color for ${item.title} (${i + 1} of ${itemsToProcess.length})…`);

        const loadedImg = await loadSafeCanvasImage(item.url);
        const recoloredDataUrl = recolorCanvas(
          loadedImg,
          sourceHex,
          targetHex,
          tolerance,
          lightnessOffset,
          saturationMult
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

        {/* Sub-Tabs: Swap vs Palette */}
        <div className={`inline-flex rounded-xl p-1 border ${isLight ? 'border-gray-300 bg-gray-100' : 'border-zinc-800 bg-zinc-900/80'}`}>
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
              PERSISTENT CANVAS — always rendered, hidden via CSS when on
              Palette tab so canvas content survives tab switches (no black).
              ---------------------------------------------------------------- */}
          <div className={`rounded-2xl border p-4 ${subTab === 'palette' ? 'hidden' : ''} ${isLight ? 'border-gray-200 bg-white shadow-sm' : 'border-zinc-800 bg-[#0e0e12]'}`}>
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

              <div className="flex items-center gap-2">
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
                            className="py-1 px-2.5 rounded-lg text-[10px] font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 cursor-pointer"
                            title="Save into Edited sub-tab"
                          >
                            💾 Edited
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
          ) : (
            /* ----------------------------------------------------------------
               SUB-TAB 2: Canva Eyedropper & Palette Generator
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
