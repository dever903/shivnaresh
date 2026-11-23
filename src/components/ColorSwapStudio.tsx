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
export function extractDominantPalette(ctx: CanvasRenderingContext2D, width: number, height: number, colorCount = 6): { hex: string; name: string; count: number }[] {
  const sampleW = Math.min(120, width);
  const sampleH = Math.min(120, height);
  const offscreen = document.createElement('canvas');
  offscreen.width = sampleW;
  offscreen.height = sampleH;
  const offCtx = offscreen.getContext('2d');
  if (!offCtx) return [];

  offCtx.drawImage(ctx.canvas, 0, 0, sampleW, sampleH);
  const imgData = offCtx.getImageData(0, 0, sampleW, sampleH).data;

  // Bucket colors by reduced quantization (step of 32)
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
      return Math.sqrt((r1 - avgR) ** 2 + (g1 - avgG) ** 2 + (b1 - avgB) ** 2) < 38;
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
  // Navigation sub-tabs
  const [subTab, setSubTab] = useState<'swap' | 'palette'>('swap');

  // Source selection filter
  const [filterFolder, setFilterFolder] = useState<'all' | 'ready' | 'edited' | 'generated' | 'uploads'>('all');
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [customUploads, setCustomUploads] = useState<ImageItem[]>([]);
  const [activeImage, setActiveImage] = useState<ImageItem | null>(null);

  // Recolor settings
  const [sourceHex, setSourceHex] = useState<string>('#E52B38');
  const [targetHex, setTargetHex] = useState<string>('#0F1D38');
  const [tolerance, setTolerance] = useState<number>(38); // 15..70 deg
  const [lightnessOffset, setLightnessOffset] = useState<number>(0); // -0.8..+0.8
  const [saturationMult, setSaturationMult] = useState<number>(1.0); // 0..2.0
  const [protectLogos, setProtectLogos] = useState<boolean>(true);

  // Eyedropper & Canvas state
  const [hoveredColor, setHoveredColor] = useState<{ hex: string; rgb: string; hsl: string } | null>(null);
  const [loupePos, setLoupePos] = useState<{ x: number; y: number; imgX: number; imgY: number } | null>(null);
  const [sampledPalette, setSampledPalette] = useState<string[]>(['#E52B38', '#0F1D38', '#FFFFFF', '#18181B']);
  const [extractedPalette, setExtractedPalette] = useState<{ hex: string; name: string; count: number }[]>([]);

  // Processing state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [recolorResults, setRecolorResults] = useState<RecolorResult[]>([]);
  const [copiedHex, setCopiedHex] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  // Refs
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

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
      setSelectedUrls(new Set([filteredImages[0].url]));
    }
  }, [filteredImages, activeImage]);

  // Load and draw active image on canvas, extract palette
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

        // Auto-extract dominant palette for Canva tab
        const pal = extractDominantPalette(ctx, canvas.width, canvas.height, 7);
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

  // Auto-detect garment color from center of active image
  const handleAutoDetectGarmentColor = () => {
    if (!previewCanvasRef.current) return;
    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Sample a 50x50 region near center chest / upper torso
    const cx = Math.round(canvas.width * 0.5);
    const cy = Math.round(canvas.height * 0.42);
    const boxSize = 40;
    try {
      const data = ctx.getImageData(cx - boxSize / 2, cy - boxSize / 2, boxSize, boxSize).data;
      let totalR = 0, totalG = 0, totalB = 0, validCount = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const { s, l } = rgbToHsl(r, g, b);
        // Exclude skin tones or studio background
        if (s > 0.15 && l > 0.1 && l < 0.9) {
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
      }
    } catch {
      // fallback
    }
  };

  // Toggle selection
  const toggleSelectImage = (url: string) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedUrls(new Set(filteredImages.map((i) => i.url)));
  };

  const handleDeselectAll = () => {
    setSelectedUrls(new Set());
  };

  // Upload custom images
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
          setSelectedUrls((prev) => new Set([...prev, item.url]));
        }
      };
      reader.readAsDataURL(file);
    });
    if (uploadInputRef.current) uploadInputRef.current.value = '';
  };

  // Canvas Mouse Move for Eyedropper
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
    } catch {}
  };

  const handleCanvasMouseLeave = () => {
    setLoupePos(null);
    setHoveredColor(null);
  };

  // Canvas Click for Eyedropper Sample
  const handleCanvasClick = () => {
    if (!hoveredColor) return;
    if (subTab === 'swap') {
      setSourceHex(hoveredColor.hex);
    }
    // Add to sampled palette
    setSampledPalette((prev) => {
      const filtered = prev.filter((c) => c !== hoveredColor.hex);
      return [hoveredColor.hex, ...filtered].slice(0, 10);
    });
  };

  // Native Browser EyeDropper API (Chrome/Edge/Opera)
  const handleNativeEyedropper = async () => {
    if (typeof window !== 'undefined' && 'EyeDropper' in window) {
      try {
        const eyeDropper = new (window as any).EyeDropper();
        const res = await eyeDropper.open();
        if (res && res.sRGBHex) {
          const sampled = res.sRGBHex.toUpperCase();
          if (subTab === 'swap') {
            setSourceHex(sampled);
          } else {
            setSampledPalette((prev) => [sampled, ...prev.filter((c) => c !== sampled)].slice(0, 10));
          }
        }
      } catch {
        // User cancelled eyedropper
      }
    } else {
      alert('Native desktop eyedropper is supported on Chromium browsers. Please use the on-screen canvas eyedropper!');
    }
  };

  // Core Recolor Algorithm: Shifts hue/chroma while strictly preserving fabric folds & luminance
  const recolorCanvas = (sourceImg: HTMLImageElement, srcHex: string, tgtHex: string, tol: number, lOff: number, sMult: number): string => {
    const canvas = document.createElement('canvas');
    canvas.width = sourceImg.naturalWidth || 1024;
    canvas.height = sourceImg.naturalHeight || 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.drawImage(sourceImg, 0, 0, canvas.width, canvas.height);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    const [srcR, srcG, srcB] = hexToRgb(srcHex);
    const [tgtR, tgtG, tgtB] = hexToRgb(tgtHex);
    const { h: sH, s: sS, l: sL } = rgbToHsl(srcR, srcG, srcB);
    const { h: tH, s: tS, l: tL } = rgbToHsl(tgtR, tgtG, tgtB);

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 50) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const { h: pH, s: pS, l: pL } = rgbToHsl(r, g, b);

      // Check match confidence
      const dh = Math.abs(pH - sH);
      const hueDist = Math.min(dh, 360 - dh);
      let match = 0;

      if (sS > 0.15) {
        if (hueDist < tol && pS > 0.12) {
          match = Math.max(0, 1 - hueDist / tol);
        }
      } else {
        // For neutral fabrics (black, grey, white)
        const dDist = Math.sqrt(0.3 * (r - srcR) ** 2 + 0.59 * (g - srcG) ** 2 + 0.11 * (b - srcB) ** 2);
        if (dDist < tol * 2.2) {
          match = Math.max(0, 1 - dDist / (tol * 2.2));
        }
      }

      if (match > 0) {
        // Compute new HSL preserving 3D shadow & highlight folds
        const newH = tH;
        const newS = tS === 0 ? 0 : Math.min(1, Math.max(0, tS * (pS / Math.max(0.18, sS)) * sMult));
        const newL = Math.min(1, Math.max(0, pL + (tL - sL) * 0.75 + lOff));

        const [resR, resG, resB] = hslToRgb(newH, newS, newL);
        // Alpha blend to feather boundary
        data[i] = Math.round(r * (1 - match) + resR * match);
        data[i + 1] = Math.round(g * (1 - match) + resG * match);
        data[i + 2] = Math.round(b * (1 - match) + resB * match);
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.95);
  };

  // Run Batch Color Swap on All Selected Images
  const handleExecuteBatchColorSwap = async () => {
    const urlsToProcess = selectedUrls.size > 0 ? Array.from(selectedUrls) : activeImage ? [activeImage.url] : [];
    if (urlsToProcess.length === 0) {
      setError('Please select at least one image to perform color swap.');
      return;
    }

    setIsProcessing(true);
    const newResults: RecolorResult[] = [];

    try {
      for (let i = 0; i < urlsToProcess.length; i++) {
        const currentUrl = urlsToProcess[i];
        const item = allImages.find((img) => img.url === currentUrl);
        setProgressMsg(`Color swapping ${i + 1} of ${urlsToProcess.length}…`);

        const loadedImg = await loadSafeCanvasImage(currentUrl);
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
            id: 'recolor_' + Date.now().toString(36) + '_' + i,
            sourceUrl: currentUrl,
            recoloredUrl: recoloredDataUrl,
            targetHex,
            targetName: getColorName(targetHex),
            title: (item?.title || 'Garment') + ` (${getColorName(targetHex)})`,
            timestamp: Date.now(),
          };
          newResults.push(resItem);
        }
      }

      setRecolorResults((prev) => [...newResults, ...prev]);
      // Update preview canvas with first recolored result
      if (newResults[0] && previewCanvasRef.current) {
        const prevImg = await loadSafeCanvasImage(newResults[0].recoloredUrl);
        const ctx = previewCanvasRef.current.getContext('2d');
        if (ctx) ctx.drawImage(prevImg, 0, 0, previewCanvasRef.current.width, previewCanvasRef.current.height);
      }
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
    setTimeout(() => setCopiedHex(null), 1800);
  };

  return (
    <div className={`w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 ${isLight ? 'text-gray-900' : 'text-zinc-100'}`}>
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
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              subTab === 'swap'
                ? isLight
                  ? 'bg-white text-gray-950 font-bold shadow-sm'
                  : 'bg-[#e5373f] text-white font-bold shadow-md'
                : isLight
                ? 'text-gray-600 hover:text-gray-900'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>🔄 Batch Color Swap</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('palette')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              subTab === 'palette'
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
                <span>1. Select Images ({filteredImages.length})</span>
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                {selectedUrls.size} Selected
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
                  className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition cursor-pointer ${
                    filterFolder === f.id
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
                  const isChecked = selectedUrls.has(img.url);
                  const isActive = activeImage?.url === img.url;
                  return (
                    <div
                      key={img.id}
                      onClick={() => {
                        setActiveImage(img);
                      }}
                      className={`p-2 rounded-xl border flex items-center gap-3 transition cursor-pointer ${
                        isActive
                          ? 'border-[#e5373f] ring-1 ring-[#e5373f] bg-[#e5373f]/10'
                          : isLight
                          ? 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                          : 'border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/80'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelectImage(img.url);
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
                          <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                            img.folder === 'ready'
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
          {subTab === 'swap' ? (
            /* SUB-TAB 1: Batch Color Swap Engine */
            <div className="space-y-6">
              {/* Interactive Canvas & Eyedropper Workspace */}
              <div className={`rounded-2xl border p-4 ${isLight ? 'border-gray-200 bg-white shadow-sm' : 'border-zinc-800 bg-[#0e0e12]'}`}>
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5" />
                      <span>Live Garment Preview & Eyedropper</span>
                    </span>
                    <span className="text-[10px] opacity-70">
                      (Click on fabric to sample source color)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAutoDetectGarmentColor}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 cursor-pointer flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      <span>Auto-Detect Fabric</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleNativeEyedropper}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 cursor-pointer flex items-center gap-1"
                    >
                      <Pipette className="w-3 h-3 text-sky-400" />
                      <span>Desktop Eyedropper</span>
                    </button>
                  </div>
                </div>

                {/* Canvas Container with Canva Loupe */}
                <div className="relative rounded-xl overflow-hidden border border-white/10 bg-black flex items-center justify-center p-2 min-h-[360px]">
                  <canvas
                    ref={previewCanvasRef}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseLeave={handleCanvasMouseLeave}
                    onClick={handleCanvasClick}
                    className="max-h-[460px] max-w-full object-contain cursor-crosshair rounded-lg"
                  />

                  {/* Canva Magnifying Loupe Following Cursor */}
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

              {/* Color Control Deck: Source vs Target */}
              <div className={`rounded-2xl border p-5 space-y-5 ${isLight ? 'border-gray-200 bg-white shadow-sm' : 'border-zinc-800 bg-[#0e0e12]'}`}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Source Garment Color */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                        <Pipette className="w-3.5 h-3.5" />
                        <span>Source Garment Color (To Swap):</span>
                      </label>
                      <span className="text-[10px] font-mono font-bold">{sourceHex}</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-xl border-2 border-white/40 shadow-inner shrink-0"
                        style={{ backgroundColor: sourceHex }}
                      />
                      <input
                        type="color"
                        value={sourceHex}
                        onChange={(e) => setSourceHex(e.target.value.toUpperCase())}
                        className="w-12 h-10 rounded-lg cursor-pointer bg-transparent border-0"
                      />
                      <input
                        type="text"
                        value={sourceHex}
                        onChange={(e) => setSourceHex(e.target.value.toUpperCase())}
                        className={`flex-1 px-3 py-2 rounded-xl text-xs font-mono font-bold border ${
                          isLight ? 'border-gray-300 bg-gray-50' : 'border-zinc-800 bg-zinc-900'
                        }`}
                        placeholder="#E52B38"
                      />
                    </div>

                    {/* Tolerance Slider */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] opacity-80">
                        <span>Fabric Hue Range Tolerance:</span>
                        <span className="font-mono">{tolerance}°</span>
                      </div>
                      <input
                        type="range"
                        min="15"
                        max="70"
                        value={tolerance}
                        onChange={(e) => setTolerance(Number(e.target.value))}
                        className="w-full accent-[#e5373f] h-1.5 rounded cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Target Replacement Color (16.7M Colors) */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                        <Palette className="w-3.5 h-3.5" />
                        <span>Target Color (16.7M Spectrum):</span>
                      </label>
                      <span className="text-[10px] font-mono font-bold">{targetHex}</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-xl border-2 border-white/40 shadow-inner shrink-0"
                        style={{ backgroundColor: targetHex }}
                      />
                      <input
                        type="color"
                        value={targetHex}
                        onChange={(e) => setTargetHex(e.target.value.toUpperCase())}
                        className="w-12 h-10 rounded-lg cursor-pointer bg-transparent border-0"
                      />
                      <input
                        type="text"
                        value={targetHex}
                        onChange={(e) => setTargetHex(e.target.value.toUpperCase())}
                        className={`flex-1 px-3 py-2 rounded-xl text-xs font-mono font-bold border ${
                          isLight ? 'border-gray-300 bg-gray-50' : 'border-zinc-800 bg-zinc-900'
                        }`}
                        placeholder="#0F1D38"
                      />
                    </div>

                    {/* Lightness / Black & White Slider */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] opacity-80">
                        <span>Fabric Lightness (White / Black Shift):</span>
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

                    {/* Saturation Intensity Slider */}
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

                {/* Pre-built Brand Swatches */}
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
                        className={`h-8 rounded-lg border-2 transition-transform cursor-pointer relative group ${
                          targetHex === swatch.hex
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

                {/* Batch Execute Action Button */}
                <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="protect-logo"
                      checked={protectLogos}
                      onChange={(e) => setProtectLogos(e.target.checked)}
                      className="accent-[#e5373f] rounded cursor-pointer"
                    />
                    <label htmlFor="protect-logo" className="text-xs cursor-pointer select-none">
                      🛡️ Preserve & Protect Shiv-Naresh Vector Branding
                    </label>
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
                        : selectedUrls.size > 1
                        ? `⚡ Recolor All ${selectedUrls.size} Selected Images (1 Click)`
                        : `⚡ Color Swap Active Image (0 Credits)`}
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
                        className={`rounded-xl border overflow-hidden p-2.5 space-y-2.5 ${
                          isLight ? 'border-gray-200 bg-gray-50' : 'border-zinc-800 bg-zinc-900/60'
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
                            className={`flex-1 py-1 px-2 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                              savedIds.has(item.id)
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
            /* SUB-TAB 2: Canva Eyedropper & Color Palette Generator */
            <div className="space-y-6">
              {/* Canva Style Dominant Palette Generator */}
              <div className={`rounded-2xl border p-5 space-y-4 ${isLight ? 'border-gray-200 bg-white shadow-sm' : 'border-zinc-800 bg-[#0e0e12]'}`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#e5373f] flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4" />
                      <span>Canva-Style Color Palette Generator</span>
                    </span>
                    <span className="text-[10px] opacity-70">
                      (Extracted automatically from photo)
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
                      className={`p-3 rounded-xl border space-y-2 group transition hover:shadow-md ${
                        isLight ? 'border-gray-200 bg-gray-50' : 'border-zinc-800 bg-zinc-900/60'
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
                    onClick={handleNativeEyedropper}
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
