import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Paintbrush,
  Eraser,
  Pipette,
  Scissors,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Undo,
  Redo,
  Download,
  Bookmark,
  RefreshCw,
  Upload,
  Square,
  Circle,
  Star,
  ChevronDown,
  Layers,
  Sparkles,
} from 'lucide-react';
import { resolveImageUrl, getProxiedImageUrl } from '../lib/api';
import { loadSafeCanvasImage } from '../pages/Design';
import type { ImageItem } from './ColorSwapStudio';

// ============================================================================
// Types & Definitions
// ============================================================================

export type PaintBrushType =
  | 'brush'
  | 'calligraphy1'
  | 'calligraphy2'
  | 'airbrush'
  | 'oil'
  | 'crayon'
  | 'marker'
  | 'natural_pencil'
  | 'watercolor';

export type ShapeType = 'rectangle' | 'circle' | 'star' | null;

export type StudioTool = 'brush' | 'eraser' | 'eyedropper' | 'select' | 'shape';

export interface MsPaintStudioProps {
  initialImageUrl?: string | null;
  imageTitle?: string;
  allImages?: ImageItem[];
  activeImageId?: string;
  onSelectImage?: (img: ImageItem) => void;
  onSaveResult?: (dataUrl: string, folder: 'ready' | 'edited', title: string) => Promise<void>;
  onSendToColorSwap?: (dataUrl: string, title: string) => void;
  isLight?: boolean;
}

// Preset stroke thicknesses
const SIZE_PRESETS = [
  { label: 'Fine (2px)', value: 2 },
  { label: 'Medium (6px)', value: 6 },
  { label: 'Thick (12px)', value: 12 },
  { label: 'Extra Thick (24px)', value: 24 },
];

// Classic MS Paint 20-Color Palette
const CLASSIC_PALETTE_ROWS = [
  [
    { hex: '#000000', name: 'Black' },
    { hex: '#7F7F7F', name: 'Gray' },
    { hex: '#880015', name: 'Dark Red' },
    { hex: '#ED1C24', name: 'Red' },
    { hex: '#FF7F27', name: 'Orange' },
    { hex: '#FFF200', name: 'Yellow' },
    { hex: '#22B14C', name: 'Green' },
    { hex: '#00A2E8', name: 'Turquoise' },
    { hex: '#3F48CC', name: 'Indigo' },
    { hex: '#A349A4', name: 'Purple' },
  ],
  [
    { hex: '#FFFFFF', name: 'White' },
    { hex: '#C3C3C3', name: 'Light Gray' },
    { hex: '#B97A57', name: 'Brown' },
    { hex: '#FFAEC9', name: 'Rose' },
    { hex: '#FFC90E', name: 'Gold' },
    { hex: '#EFE4B0', name: 'Light Yellow' },
    { hex: '#B5E61D', name: 'Lime' },
    { hex: '#99D9EA', name: 'Light Turquoise' },
    { hex: '#7092BE', name: 'Blue Gray' },
    { hex: '#C8BFE7', name: 'Lavender' },
  ],
];

// 9 Brush Metadata for MS Paint Ribbon 3x3 Grid
const BRUSH_DEFS: {
  id: PaintBrushType;
  name: string;
  desc: string;
  iconBg: string;
}[] = [
  {
    id: 'brush',
    name: 'Brush',
    desc: 'Simple yet clean, bit thicker than pencil tool. Round solid stroke.',
    iconBg: '#E5373F',
  },
  {
    id: 'calligraphy1',
    name: 'Calligraphy 1',
    desc: 'Angled flat nib 45° right. Thin down-left, thick down-right.',
    iconBg: '#4A5568',
  },
  {
    id: 'calligraphy2',
    name: 'Calligraphy 2',
    desc: 'Angled flat nib 45° left. Thin down-right, thick down-left.',
    iconBg: '#4A5568',
  },
  {
    id: 'airbrush',
    name: 'Airbrush',
    desc: 'Fine mist spray. Holding mouse builds up density continuously.',
    iconBg: '#3182CE',
  },
  {
    id: 'oil',
    name: 'Oil Brush',
    desc: 'Thick multi-bristle stroke that runs out of paint over distance.',
    iconBg: '#D69E2E',
  },
  {
    id: 'crayon',
    name: 'Crayon',
    desc: 'Rough, grainy waxy texture with porous gaps for texture.',
    iconBg: '#DD6B20',
  },
  {
    id: 'marker',
    name: 'Marker',
    desc: 'Semi-transparent chisel nib. Overlapping strokes darken and blend.',
    iconBg: '#38A169',
  },
  {
    id: 'natural_pencil',
    name: 'Natural Pencil',
    desc: 'Fine graphite line with authentic tooth, grain, and friction.',
    iconBg: '#718096',
  },
  {
    id: 'watercolor',
    name: 'Watercolor',
    desc: 'Translucent watery wash with feathered edges that fades gracefully.',
    iconBg: '#805AD5',
  },
];

// Helper: RGB/HEX conversions
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
}

// ============================================================================
// Main MsPaintStudio Component
// ============================================================================

export const MsPaintStudio: React.FC<MsPaintStudioProps> = ({
  initialImageUrl,
  imageTitle = 'Garment Canvas',
  allImages = [],
  activeImageId,
  onSelectImage,
  onSaveResult,
  onSendToColorSwap,
  isLight = false,
}) => {
  // Tools & Brushes State
  const [activeTool, setActiveTool] = useState<StudioTool>('brush');
  const [activeBrush, setActiveBrush] = useState<PaintBrushType>('brush');
  const [brushDropdownOpen, setBrushDropdownOpen] = useState<boolean>(false);

  // Size Preset & Granular Size
  const [brushSize, setBrushSize] = useState<number>(6);
  const [sizeDropdownOpen, setSizeDropdownOpen] = useState<boolean>(false);

  // Dual Colors: Color 1 (Foreground) & Color 2 (Background)
  const [color1, setColor1] = useState<string>('#000000');
  const [color2, setColor2] = useState<string>('#FFFFFF');
  const [activeColorSlot, setActiveColorSlot] = useState<1 | 2>(1);

  // Shapes & Outline Textures
  const [activeShape, setActiveShape] = useState<ShapeType>(null);
  const [shapeOutlineBrush, setShapeOutlineBrush] = useState<PaintBrushType>('brush');
  const [shapeFillMode, setShapeFillMode] = useState<'none' | 'color2'>('none');
  const [shapeDropdownOpen, setShapeDropdownOpen] = useState<boolean>(false);

  // Selection & Corner-Only Resizing Transform Box
  const [transparentSelection, setTransparentSelection] = useState<boolean>(true);
  const [activeSelection, setActiveSelection] = useState<{
    canvas: HTMLCanvasElement;
    x: number;
    y: number;
    w: number;
    h: number;
    origW: number;
    origH: number;
  } | null>(null);

  // Zoom & Viewport
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  // History Stack (Undo / Redo)
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Image Selector Drawer State
  const [showImageDrawer, setShowImageDrawer] = useState<boolean>(false);
  const [imageCategoryFilter, setImageCategoryFilter] = useState<string>('all');

  // Eyedropper Loupe Floating State
  const [eyedropperLoupe, setEyedropperLoupe] = useState<{
    visible: boolean;
    screenX: number;
    screenY: number;
    colorHex: string;
    rgb: string;
  } | null>(null);

  // Toast Banner
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage((cur) => (cur === msg ? null : cur)), 2800);
  };

  // Canvas Refs
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Runtime State for Drawing
  const isMouseDownRef = useRef<boolean>(false);
  const mouseButtonRef = useRef<number>(0); // 0 = left (Color 1), 2 = right (Color 2)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const strokeDistanceRef = useRef<number>(0); // for Oil and Watercolor fade
  const airbrushTimerRef = useRef<number | null>(null);
  const currentPointerPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Selection Drag / Transform State
  const isSelectingBoxRef = useRef<boolean>(false);
  const selectionStartPointRef = useRef<{ x: number; y: number } | null>(null);
  const selectionDraftRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const activeResizeHandleRef = useRef<'nw' | 'ne' | 'sw' | 'se' | 'move' | null>(null);
  const resizeStartPosRef = useRef<{ x: number; y: number; rect: { x: number; y: number; w: number; h: number } }>({
    x: 0,
    y: 0,
    rect: { x: 0, y: 0, w: 0, h: 0 },
  });

  // Shape Drag State
  const isDrawingShapeRef = useRef<boolean>(false);
  const shapeStartPointRef = useRef<{ x: number; y: number } | null>(null);
  const shapeDraftRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  // --------------------------------------------------------------------------
  // History Helpers
  // --------------------------------------------------------------------------
  const pushHistory = useCallback(() => {
    const canvas = baseCanvasRef.current;
    if (!canvas) return;
    try {
      const dataUrl = canvas.toDataURL('image/png');
      setHistory((prev) => {
        const sliced = prev.slice(0, historyIndex + 1);
        return [...sliced.slice(-25), dataUrl];
      });
      setHistoryIndex((prev) => Math.min(prev + 1, 25));
    } catch (e) {
      console.warn('[History] Canvas export warning:', e);
    }
  }, [historyIndex]);

  const handleUndo = useCallback(() => {
    if (historyIndex <= 0) return;
    const newIdx = historyIndex - 1;
    const dataUrl = history[newIdx];
    if (!dataUrl || !baseCanvasRef.current) return;
    const img = new Image();
    if (!dataUrl.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = baseCanvasRef.current;
      if (!c) return;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      setHistoryIndex(newIdx);
      redrawOverlay();
    };
    img.src = dataUrl;
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const newIdx = historyIndex + 1;
    const dataUrl = history[newIdx];
    if (!dataUrl || !baseCanvasRef.current) return;
    const img = new Image();
    if (!dataUrl.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = baseCanvasRef.current;
      if (!c) return;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      setHistoryIndex(newIdx);
      redrawOverlay();
    };
    img.src = dataUrl;
  }, [history, historyIndex]);

  // --------------------------------------------------------------------------
  // Initial Image Loading
  // --------------------------------------------------------------------------
  const loadCanvasImage = useCallback(async (url: string) => {
    if (!url) return;
    try {
      const img = await loadSafeCanvasImage(url);
      const base = baseCanvasRef.current;
      const overlay = overlayCanvasRef.current;
      if (!base || !overlay) return;
      const W = img.naturalWidth || 1024;
      const H = img.naturalHeight || 1024;
      base.width = W;
      base.height = H;
      overlay.width = W;
      overlay.height = H;

      const container = canvasContainerRef.current;
      const vH = container ? container.clientHeight : 540;
      const vW = container ? container.clientWidth : 750;
      const fitZoom = Math.min(1.0, Math.min((vW - 48) / W, (vH - 48) / H));
      setZoomLevel(Math.max(0.15, Number(fitZoom.toFixed(2))));

      const ctx = base.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, W, H);
        ctx.drawImage(img, 0, 0, W, H);
        try {
          const dataUrl = base.toDataURL('image/png');
          setHistory([dataUrl]);
          setHistoryIndex(0);
        } catch {
          // ignore canvas taint on initial history push
        }
      }
      const oCtx = overlay.getContext('2d');
      if (oCtx) oCtx.clearRect(0, 0, W, H);
      setActiveSelection(null);
    } catch (err) {
      console.warn('[MsPaintStudio] Safe load fallback triggered:', err);
      const fallbackImg = new Image();
      fallbackImg.crossOrigin = 'anonymous';
      fallbackImg.onload = () => {
        const base = baseCanvasRef.current;
        const overlay = overlayCanvasRef.current;
        if (!base || !overlay) return;
        const W = fallbackImg.naturalWidth || 1024;
        const H = fallbackImg.naturalHeight || 1024;
        base.width = W;
        base.height = H;
        overlay.width = W;
        overlay.height = H;
        const ctx = base.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, W, H);
          ctx.drawImage(fallbackImg, 0, 0, W, H);
          try {
            const dataUrl = base.toDataURL('image/png');
            setHistory([dataUrl]);
            setHistoryIndex(0);
          } catch {
            // ignore
          }
        }
      };
      fallbackImg.onerror = () => {
        const proxied = getProxiedImageUrl(resolveImageUrl(url));
        if (proxied && proxied !== fallbackImg.src) {
          const pImg = new Image();
          pImg.crossOrigin = 'anonymous';
          pImg.onload = () => {
            const base = baseCanvasRef.current;
            const overlay = overlayCanvasRef.current;
            if (!base || !overlay) return;
            const W = pImg.naturalWidth || 1024;
            const H = pImg.naturalHeight || 1024;
            base.width = W;
            base.height = H;
            overlay.width = W;
            overlay.height = H;
            const ctx = base.getContext('2d');
            if (ctx) {
              ctx.fillStyle = '#FFFFFF';
              ctx.fillRect(0, 0, W, H);
              ctx.drawImage(pImg, 0, 0, W, H);
              try {
                const dataUrl = base.toDataURL('image/png');
                setHistory([dataUrl]);
                setHistoryIndex(0);
              } catch {
                // ignore
              }
            }
          };
          pImg.src = proxied;
        }
      };
      fallbackImg.src = resolveImageUrl(url);
    }
  }, []);

  useEffect(() => {
    if (initialImageUrl) {
      loadCanvasImage(initialImageUrl);
    }
  }, [initialImageUrl, loadCanvasImage]);

  // Keyboard Shortcuts (Ctrl + / Ctrl -, Ctrl Z, Ctrl Y)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          setBrushSize((s) => Math.min(64, s + 2));
          showToast(`Brush Size: ${Math.min(64, brushSize + 2)}px`);
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          setBrushSize((s) => Math.max(1, s - 2));
          showToast(`Brush Size: ${Math.max(1, brushSize - 2)}px`);
        } else if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          handleUndo();
        } else if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          handleRedo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [brushSize, handleUndo, handleRedo]);

  // --------------------------------------------------------------------------
  // Coordinate Mapping
  // --------------------------------------------------------------------------
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.PointerEvent<HTMLCanvasElement>) => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return { x: 0, y: 0 };
    const rect = overlay.getBoundingClientRect();
    const scaleX = overlay.width / rect.width;
    const scaleY = overlay.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  // --------------------------------------------------------------------------
  // The 9 Classic MS Paint Brush Rendering Algorithms
  // --------------------------------------------------------------------------

  // 1. Standard Brush: Smooth round solid stroke
  const drawStandardBrush = (ctx: CanvasRenderingContext2D, p0: { x: number; y: number }, p1: { x: number; y: number }, color: string, size: number) => {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
    ctx.restore();
  };

  // 2. Calligraphy Brush 1: Slanted 45° to the right (thin down-left, thick down-right)
  const drawCalligraphy1 = (ctx: CanvasRenderingContext2D, p0: { x: number; y: number }, p1: { x: number; y: number }, color: string, size: number) => {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const steps = Math.max(1, Math.ceil(dist));
    // 45 degrees slant
    const angle = Math.PI / 4;
    const halfLen = size * 0.7;
    const dx = Math.cos(angle) * halfLen;
    const dy = -Math.sin(angle) * halfLen;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = p0.x + (p1.x - p0.x) * t;
      const y = p0.y + (p1.y - p0.y) * t;
      ctx.beginPath();
      ctx.moveTo(x - dx, y - dy);
      ctx.lineTo(x + dx, y + dy);
      ctx.stroke();
    }
    ctx.restore();
  };

  // 3. Calligraphy Brush 2: Slanted 45° to the left (thin down-right, thick down-left)
  const drawCalligraphy2 = (ctx: CanvasRenderingContext2D, p0: { x: number; y: number }, p1: { x: number; y: number }, color: string, size: number) => {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const steps = Math.max(1, Math.ceil(dist));
    // -45 degrees slant
    const angle = -Math.PI / 4;
    const halfLen = size * 0.7;
    const dx = Math.cos(angle) * halfLen;
    const dy = -Math.sin(angle) * halfLen;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = p0.x + (p1.x - p0.x) * t;
      const y = p0.y + (p1.y - p0.y) * t;
      ctx.beginPath();
      ctx.moveTo(x - dx, y - dy);
      ctx.lineTo(x + dx, y + dy);
      ctx.stroke();
    }
    ctx.restore();
  };

  // 4. Airbrush Spray Dab (Generates randomized mist cluster)
  const sprayAirbrushDab = (ctx: CanvasRenderingContext2D, pos: { x: number; y: number }, color: string, size: number) => {
    ctx.save();
    ctx.fillStyle = color;
    const radius = Math.max(8, size * 1.5);
    const dotCount = Math.max(12, Math.round(size * 1.6));
    for (let i = 0; i < dotCount; i++) {
      const r = radius * Math.sqrt(Math.random());
      const theta = Math.random() * 2 * Math.PI;
      const x = pos.x + r * Math.cos(theta);
      const y = pos.y + r * Math.sin(theta);
      ctx.globalAlpha = 0.18 + Math.random() * 0.22;
      ctx.fillRect(Math.round(x), Math.round(y), 1.5, 1.5);
    }
    ctx.restore();
  };

  // 5. Oil Brush: Multi-bristle stroke that runs out of paint
  const drawOilBrush = (ctx: CanvasRenderingContext2D, p0: { x: number; y: number }, p1: { x: number; y: number }, color: string, size: number) => {
    ctx.save();
    const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    strokeDistanceRef.current += dist;
    // Paint runs out gradually over 1000px distance
    const maxCapacity = 900 + size * 15;
    const capacityRatio = Math.max(0.04, 1.0 - strokeDistanceRef.current / maxCapacity);

    const bristleCount = Math.max(6, Math.round(size * 0.7));
    const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    const perpAngle = angle + Math.PI / 2;

    ctx.lineCap = 'round';
    ctx.strokeStyle = color;

    for (let b = 0; b < bristleCount; b++) {
      const offset = ((b / (bristleCount - 1)) - 0.5) * size;
      const bx0 = p0.x + Math.cos(perpAngle) * offset;
      const by0 = p0.y + Math.sin(perpAngle) * offset;
      const bx1 = p1.x + Math.cos(perpAngle) * offset;
      const by1 = p1.y + Math.sin(perpAngle) * offset;

      ctx.lineWidth = Math.max(1, (size / bristleCount) * 1.2);
      ctx.globalAlpha = capacityRatio * (0.45 + (b % 3) * 0.18);
      ctx.beginPath();
      ctx.moveTo(bx0, by0);
      ctx.lineTo(bx1, by1);
      ctx.stroke();
    }
    ctx.restore();
  };

  // 6. Crayon: Rough, grainy waxy texture with porous gaps
  const drawCrayon = (ctx: CanvasRenderingContext2D, p0: { x: number; y: number }, p1: { x: number; y: number }, color: string, size: number) => {
    ctx.save();
    ctx.fillStyle = color;
    const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const steps = Math.max(1, Math.ceil(dist / 2));
    const radius = Math.max(2, size / 2);

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = p0.x + (p1.x - p0.x) * t;
      const cy = p0.y + (p1.y - p0.y) * t;

      const particles = Math.round(size * 1.8);
      for (let p = 0; p < particles; p++) {
        // Skip 35% of particles to produce porous waxy paper gaps
        if (Math.random() < 0.35) continue;
        const r = radius * Math.sqrt(Math.random());
        const theta = Math.random() * 2 * Math.PI;
        const px = cx + r * Math.cos(theta);
        const py = cy + r * Math.sin(theta);
        ctx.globalAlpha = 0.3 + Math.random() * 0.5;
        ctx.fillRect(Math.round(px), Math.round(py), 1.8, 1.8);
      }
    }
    ctx.restore();
  };

  // 7. Marker: Semi-transparent flat chisel tip that blends and darkens
  const drawMarker = (ctx: CanvasRenderingContext2D, p0: { x: number; y: number }, p1: { x: number; y: number }, color: string, size: number) => {
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.28;
    const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const steps = Math.max(1, Math.ceil(dist / 1.5));
    const width = size * 0.7;
    const height = size * 1.5;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = p0.x + (p1.x - p0.x) * t;
      const y = p0.y + (p1.y - p0.y) * t;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-Math.PI / 6); // 30 deg slant
      ctx.fillRect(-width / 2, -height / 2, width, height);
      ctx.restore();
    }
    ctx.restore();
  };

  // 8. Natural Pencil: Thin textured graphite line with subtle grain
  const drawNaturalPencil = (ctx: CanvasRenderingContext2D, p0: { x: number; y: number }, p1: { x: number; y: number }, color: string, size: number) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    const pencilWidth = Math.max(1.5, Math.min(size * 0.4, 4));
    ctx.lineWidth = pencilWidth;
    ctx.globalAlpha = 0.65;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();

    // Subtle graphite tooth / specks
    const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const grainCount = Math.round(dist * 0.8);
    for (let i = 0; i < grainCount; i++) {
      const t = Math.random();
      const x = p0.x + (p1.x - p0.x) * t + (Math.random() - 0.5) * pencilWidth * 1.6;
      const y = p0.y + (p1.y - p0.y) * t + (Math.random() - 0.5) * pencilWidth * 1.6;
      ctx.globalAlpha = 0.2 + Math.random() * 0.4;
      ctx.fillRect(Math.round(x), Math.round(y), 1.2, 1.2);
    }
    ctx.restore();
  };

  // 9. Watercolor Brush: Soft translucent wash with feathered edges that fades
  const drawWatercolor = (ctx: CanvasRenderingContext2D, p0: { x: number; y: number }, p1: { x: number; y: number }, color: string, size: number) => {
    ctx.save();
    const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    strokeDistanceRef.current += dist;
    const fade = Math.max(0.18, 1.0 - strokeDistanceRef.current / 1400);

    const rgb = hexToRgb(color);
    const radius = Math.max(6, size * 1.2);
    const steps = Math.max(1, Math.ceil(dist / (radius * 0.35)));

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = p0.x + (p1.x - p0.x) * t;
      const y = p0.y + (p1.y - p0.y) * t;

      const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
      grad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.22 * fade})`);
      grad.addColorStop(0.65, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.14 * fade})`);
      grad.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.restore();
  };

  // Dispatcher for the 9 Brushes
  const renderBrushSegment = (
    ctx: CanvasRenderingContext2D,
    p0: { x: number; y: number },
    p1: { x: number; y: number },
    brushType: PaintBrushType,
    color: string,
    size: number
  ) => {
    switch (brushType) {
      case 'brush':
        drawStandardBrush(ctx, p0, p1, color, size);
        break;
      case 'calligraphy1':
        drawCalligraphy1(ctx, p0, p1, color, size);
        break;
      case 'calligraphy2':
        drawCalligraphy2(ctx, p0, p1, color, size);
        break;
      case 'airbrush':
        sprayAirbrushDab(ctx, p1, color, size);
        break;
      case 'oil':
        drawOilBrush(ctx, p0, p1, color, size);
        break;
      case 'crayon':
        drawCrayon(ctx, p0, p1, color, size);
        break;
      case 'marker':
        drawMarker(ctx, p0, p1, color, size);
        break;
      case 'natural_pencil':
        drawNaturalPencil(ctx, p0, p1, color, size);
        break;
      case 'watercolor':
        drawWatercolor(ctx, p0, p1, color, size);
        break;
    }
  };

  // --------------------------------------------------------------------------
  // Shape Border Rendering (Applying any brush texture to shape outlines)
  // --------------------------------------------------------------------------
  const renderShapeOnCanvas = (
    ctx: CanvasRenderingContext2D,
    shape: ShapeType,
    rect: { x: number; y: number; w: number; h: number },
    brushType: PaintBrushType,
    fgColor: string,
    bgColor: string,
    size: number,
    fillMode: 'none' | 'color2'
  ) => {
    if (!shape || rect.w <= 0 || rect.h <= 0) return;
    const { x, y, w, h } = rect;

    // Optional Fill
    if (fillMode === 'color2') {
      ctx.save();
      ctx.fillStyle = bgColor;
      ctx.beginPath();
      if (shape === 'rectangle') {
        ctx.fillRect(x, y, w, h);
      } else if (shape === 'circle') {
        ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 2 * Math.PI);
        ctx.fill();
      } else if (shape === 'star') {
        drawStarPath(ctx, x + w / 2, y + h / 2, 5, w / 2, w / 4);
        ctx.fill();
      }
      ctx.restore();
    }

    // Outline textured with the selected brush algorithm
    if (shape === 'rectangle') {
      renderBrushSegment(ctx, { x, y }, { x: x + w, y }, brushType, fgColor, size);
      renderBrushSegment(ctx, { x: x + w, y }, { x: x + w, y: y + h }, brushType, fgColor, size);
      renderBrushSegment(ctx, { x: x + w, y: y + h }, { x, y: y + h }, brushType, fgColor, size);
      renderBrushSegment(ctx, { x, y: y + h }, { x, y }, brushType, fgColor, size);
    } else if (shape === 'circle') {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const rx = w / 2;
      const ry = h / 2;
      const perimeter = 2 * Math.PI * Math.sqrt((rx * rx + ry * ry) / 2);
      const steps = Math.max(24, Math.round(perimeter / 3));
      let lastP = { x: cx + rx, y: cy };
      for (let i = 1; i <= steps; i++) {
        const theta = (i / steps) * 2 * Math.PI;
        const curP = { x: cx + rx * Math.cos(theta), y: cy + ry * Math.sin(theta) };
        renderBrushSegment(ctx, lastP, curP, brushType, fgColor, size);
        lastP = curP;
      }
    } else if (shape === 'star') {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const outerR = Math.min(w, h) / 2;
      const innerR = outerR * 0.45;
      const points: { x: number; y: number }[] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = -Math.PI / 2 + (i / 10) * 2 * Math.PI;
        points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
      }
      for (let i = 0; i < points.length; i++) {
        const p0 = points[i];
        const p1 = points[(i + 1) % points.length];
        renderBrushSegment(ctx, p0, p1, brushType, fgColor, size);
      }
    }
  };

  const drawStarPath = (ctx: CanvasRenderingContext2D, cx: number, cy: number, spikes: number, outerR: number, innerR: number) => {
    let rot = (Math.PI / 2) * 3;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerR);
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerR;
      y = cy + Math.sin(rot) * outerR;
      ctx.lineTo(x, y);
      rot += step;
      x = cx + Math.cos(rot) * innerR;
      y = cy + Math.sin(rot) * innerR;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerR);
    ctx.closePath();
  };

  // --------------------------------------------------------------------------
  // Selection Bounding Box & 4 Corner Handles Rendering
  // --------------------------------------------------------------------------
  const redrawOverlay = useCallback(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    // 1. Draw Selection in progress (drag marquee)
    if (selectionDraftRectRef.current && isSelectingBoxRef.current) {
      const r = selectionDraftRectRef.current;
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = '#0078D7';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = 'rgba(0, 120, 215, 0.12)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.restore();
    }

    // 2. Draw Active Selection & 4 Corner-Only Handles
    if (activeSelection) {
      const { x, y, w, h, canvas } = activeSelection;
      ctx.save();
      // Draw extracted image smoothly scaled
      ctx.drawImage(canvas, x, y, w, h);

      // Dashed boundary
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#0078D7';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, w, h);

      // Draw ONLY 4 Corner Handles (Square Handles) - NO side handles!
      const handleSize = 8;
      const half = handleSize / 2;
      const corners = [
        { id: 'nw', cx: x, cy: y },
        { id: 'ne', cx: x + w, cy: y },
        { id: 'sw', cx: x, cy: y + h },
        { id: 'se', cx: x + w, cy: y + h },
      ];

      corners.forEach((c) => {
        ctx.setLineDash([]);
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.fillRect(c.cx - half, c.cy - half, handleSize, handleSize);
        ctx.strokeRect(c.cx - half, c.cy - half, handleSize, handleSize);
      });
      ctx.restore();
    }

    // 3. Draw Shape in Progress
    if (isDrawingShapeRef.current && shapeDraftRectRef.current && activeShape) {
      const base = baseCanvasRef.current;
      if (base) {
        ctx.save();
        renderShapeOnCanvas(
          ctx,
          activeShape,
          shapeDraftRectRef.current,
          shapeOutlineBrush,
          color1,
          color2,
          brushSize,
          shapeFillMode
        );
        // Dashed bounding box before finalizing
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = '#22B14C';
        ctx.lineWidth = 1;
        ctx.strokeRect(
          shapeDraftRectRef.current.x,
          shapeDraftRectRef.current.y,
          shapeDraftRectRef.current.w,
          shapeDraftRectRef.current.h
        );
        ctx.restore();
      }
    }
  }, [activeSelection, activeShape, shapeOutlineBrush, color1, color2, brushSize, shapeFillMode]);

  // --------------------------------------------------------------------------
  // Area Extraction & Selection Finalize
  // --------------------------------------------------------------------------
  const extractAreaIntoSelection = (rect: { x: number; y: number; w: number; h: number }) => {
    const base = baseCanvasRef.current;
    if (!base || rect.w < 4 || rect.h < 4) return;
    const baseCtx = base.getContext('2d');
    if (!baseCtx) return;

    const offCanvas = document.createElement('canvas');
    offCanvas.width = rect.w;
    offCanvas.height = rect.h;
    const offCtx = offCanvas.getContext('2d');
    if (!offCtx) return;

    // Grab original pixels
    offCtx.drawImage(base, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);

    // Transparent Selection handling: ignore Color 2 background
    if (transparentSelection) {
      const imgData = offCtx.getImageData(0, 0, rect.w, rect.h);
      const data = imgData.data;
      const bgRgb = hexToRgb(color2);
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const dist = Math.abs(r - bgRgb.r) + Math.abs(g - bgRgb.g) + Math.abs(b - bgRgb.b);
        if (dist < 40) {
          data[i + 3] = 0; // Transparent
        }
      }
      offCtx.putImageData(imgData, 0, 0);
    }

    setActiveSelection({
      canvas: offCanvas,
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      origW: rect.w,
      origH: rect.h,
    });
    showToast('✂️ Area extracted! Drag corner handles to scale, or drag inside to move.');
  };

  const commitSelectionToCanvas = () => {
    if (!activeSelection || !baseCanvasRef.current) return;
    const base = baseCanvasRef.current;
    const ctx = base.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(activeSelection.canvas, activeSelection.x, activeSelection.y, activeSelection.w, activeSelection.h);
    setActiveSelection(null);
    redrawOverlay();
    pushHistory();
    showToast('📌 Area stamped onto canvas!');
  };

  // Stamp continuous copy when holding Shift while dragging selection (Classic MS Paint)
  const stampSelectionAtPoint = (x: number, y: number) => {
    if (!activeSelection || !baseCanvasRef.current) return;
    const ctx = baseCanvasRef.current.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(activeSelection.canvas, x, y, activeSelection.w, activeSelection.h);
  };

  // --------------------------------------------------------------------------
  // Pointer Events (Mouse Down, Move, Up)
  // --------------------------------------------------------------------------
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch { }

    const coords = getCanvasCoords(e);
    isMouseDownRef.current = true;
    mouseButtonRef.current = e.button; // 0 = Left (Color 1), 2 = Right (Color 2)
    lastPointRef.current = coords;
    strokeDistanceRef.current = 0;
    currentPointerPosRef.current = coords;

    const activeColor = e.button === 2 ? color2 : color1;

    // 1. EYEDROPPER TOOL
    if (activeTool === 'eyedropper') {
      const base = baseCanvasRef.current;
      if (base) {
        const ctx = base.getContext('2d');
        if (ctx) {
          const pixel = ctx.getImageData(Math.round(coords.x), Math.round(coords.y), 1, 1).data;
          const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
          if (e.button === 2) {
            setColor2(hex);
            showToast(`Color 2 (Background) set to: ${hex}`);
          } else {
            setColor1(hex);
            showToast(`Color 1 (Foreground) set to: ${hex}`);
          }
          setEyedropperLoupe(null);
          setActiveTool('brush');
        }
      }
      isMouseDownRef.current = false;
      return;
    }

    // 2. SELECTION / TRANSFORM BOX
    if (activeTool === 'select') {
      if (activeSelection) {
        const { x, y, w, h } = activeSelection;
        const handleThreshold = 10;
        // Check 4 Corner Handles ONLY
        if (Math.hypot(coords.x - x, coords.y - y) <= handleThreshold) {
          activeResizeHandleRef.current = 'nw';
        } else if (Math.hypot(coords.x - (x + w), coords.y - y) <= handleThreshold) {
          activeResizeHandleRef.current = 'ne';
        } else if (Math.hypot(coords.x - x, coords.y - (y + h)) <= handleThreshold) {
          activeResizeHandleRef.current = 'sw';
        } else if (Math.hypot(coords.x - (x + w), coords.y - (y + h)) <= handleThreshold) {
          activeResizeHandleRef.current = 'se';
        } else if (coords.x >= x && coords.x <= x + w && coords.y >= y && coords.y <= y + h) {
          activeResizeHandleRef.current = 'move';
        } else {
          // Clicked outside -> Commit selection and start fresh select
          commitSelectionToCanvas();
          isSelectingBoxRef.current = true;
          selectionStartPointRef.current = coords;
          selectionDraftRectRef.current = { x: coords.x, y: coords.y, w: 0, h: 0 };
        }

        if (activeResizeHandleRef.current) {
          resizeStartPosRef.current = {
            x: coords.x,
            y: coords.y,
            rect: { ...activeSelection },
          };
        }
        return;
      } else {
        // Start dragging selection marquee
        isSelectingBoxRef.current = true;
        selectionStartPointRef.current = coords;
        selectionDraftRectRef.current = { x: coords.x, y: coords.y, w: 0, h: 0 };
        return;
      }
    }

    // 3. SHAPE DRAWING
    if (activeTool === 'shape' && activeShape) {
      isDrawingShapeRef.current = true;
      shapeStartPointRef.current = coords;
      shapeDraftRectRef.current = { x: coords.x, y: coords.y, w: 0, h: 0 };
      return;
    }

    // 4. BRUSH / ERASER DRAWING
    if (activeTool === 'brush' || activeTool === 'eraser') {
      const base = baseCanvasRef.current;
      if (!base) return;
      const ctx = base.getContext('2d');
      if (!ctx) return;

      const paintColor = activeTool === 'eraser' ? color2 : activeColor;
      const brushToUse = activeTool === 'eraser' ? 'brush' : activeBrush;

      // Initial single dab
      renderBrushSegment(ctx, coords, coords, brushToUse, paintColor, brushSize);

      // Start continuous airbrush spray timer if airbrush is active
      if (brushToUse === 'airbrush') {
        airbrushTimerRef.current = window.setInterval(() => {
          if (isMouseDownRef.current && baseCanvasRef.current) {
            const c = baseCanvasRef.current.getContext('2d');
            if (c) {
              sprayAirbrushDab(c, currentPointerPosRef.current, paintColor, brushSize);
            }
          }
        }, 22);
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e);
    currentPointerPosRef.current = coords;

    // Eyedropper Magnification Loupe Update
    if (activeTool === 'eyedropper' && baseCanvasRef.current) {
      const ctx = baseCanvasRef.current.getContext('2d');
      if (ctx && coords.x >= 0 && coords.y >= 0 && coords.x < baseCanvasRef.current.width && coords.y < baseCanvasRef.current.height) {
        const pixel = ctx.getImageData(Math.round(coords.x), Math.round(coords.y), 1, 1).data;
        const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
        setEyedropperLoupe({
          visible: true,
          screenX: e.clientX,
          screenY: e.clientY,
          colorHex: hex,
          rgb: `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`,
        });
      }
    }

    if (!isMouseDownRef.current) return;

    // 1. SELECTION / TRANSFORM CORNER RESIZING
    if (activeTool === 'select') {
      if (isSelectingBoxRef.current && selectionStartPointRef.current) {
        const p0 = selectionStartPointRef.current;
        const x = Math.min(p0.x, coords.x);
        const y = Math.min(p0.y, coords.y);
        const w = Math.abs(coords.x - p0.x);
        const h = Math.abs(coords.y - p0.y);
        selectionDraftRectRef.current = { x, y, w, h };
        redrawOverlay();
        return;
      }

      if (activeSelection && activeResizeHandleRef.current) {
        const handle = activeResizeHandleRef.current;
        const { x: startX, y: startY, rect: init } = resizeStartPosRef.current;
        const dx = coords.x - startX;
        const dy = coords.y - startY;

        let newX = init.x;
        let newY = init.y;
        let newW = init.w;
        let newH = init.h;

        // Smooth Corner-Only Scaling
        if (handle === 'se') {
          newW = Math.max(10, init.w + dx);
          newH = Math.max(10, init.h + dy);
        } else if (handle === 'sw') {
          newW = Math.max(10, init.w - dx);
          newH = Math.max(10, init.h + dy);
          newX = init.x + (init.w - newW);
        } else if (handle === 'ne') {
          newW = Math.max(10, init.w + dx);
          newH = Math.max(10, init.h - dy);
          newY = init.y + (init.h - newH);
        } else if (handle === 'nw') {
          newW = Math.max(10, init.w - dx);
          newH = Math.max(10, init.h - dy);
          newX = init.x + (init.w - newW);
          newY = init.y + (init.h - newH);
        } else if (handle === 'move') {
          newX = init.x + dx;
          newY = init.y + dy;
          // Holding Shift continuously stamps like a custom brush!
          if (e.shiftKey) {
            stampSelectionAtPoint(newX, newY);
          }
        }

        setActiveSelection((prev) => (prev ? { ...prev, x: newX, y: newY, w: newW, h: newH } : null));
        return;
      }
    }

    // 2. SHAPE DRAWING IN PROGRESS
    if (activeTool === 'shape' && isDrawingShapeRef.current && shapeStartPointRef.current) {
      const p0 = shapeStartPointRef.current;
      const x = Math.min(p0.x, coords.x);
      const y = Math.min(p0.y, coords.y);
      const w = Math.abs(coords.x - p0.x);
      const h = Math.abs(coords.y - p0.y);
      shapeDraftRectRef.current = { x, y, w, h };
      redrawOverlay();
      return;
    }

    // 3. BRUSH / ERASER DRAWING
    if (activeTool === 'brush' || activeTool === 'eraser') {
      const base = baseCanvasRef.current;
      if (!base || !lastPointRef.current) return;
      const ctx = base.getContext('2d');
      if (!ctx) return;

      const activeColor = mouseButtonRef.current === 2 ? color2 : color1;
      const paintColor = activeTool === 'eraser' ? color2 : activeColor;
      const brushToUse = activeTool === 'eraser' ? 'brush' : activeBrush;

      renderBrushSegment(ctx, lastPointRef.current, coords, brushToUse, paintColor, brushSize);
      lastPointRef.current = coords;
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch { }

    if (airbrushTimerRef.current) {
      clearInterval(airbrushTimerRef.current);
      airbrushTimerRef.current = null;
    }

    // 1. Finalize Selection Draft
    if (isSelectingBoxRef.current && selectionDraftRectRef.current) {
      isSelectingBoxRef.current = false;
      const r = selectionDraftRectRef.current;
      selectionDraftRectRef.current = null;
      if (r.w > 5 && r.h > 5) {
        extractAreaIntoSelection(r);
      }
      redrawOverlay();
      isMouseDownRef.current = false;
      return;
    }

    // 2. Finalize Shape
    if (isDrawingShapeRef.current && shapeDraftRectRef.current && activeShape) {
      isDrawingShapeRef.current = false;
      const r = shapeDraftRectRef.current;
      shapeDraftRectRef.current = null;
      if (r.w > 4 && r.h > 4 && baseCanvasRef.current) {
        const ctx = baseCanvasRef.current.getContext('2d');
        if (ctx) {
          renderShapeOnCanvas(
            ctx,
            activeShape,
            r,
            shapeOutlineBrush,
            color1,
            color2,
            brushSize,
            shapeFillMode
          );
          pushHistory();
        }
      }
      redrawOverlay();
      isMouseDownRef.current = false;
      return;
    }

    // 3. Selection Transform Commit
    if (activeResizeHandleRef.current) {
      activeResizeHandleRef.current = null;
      pushHistory();
    }

    // 4. Brush / Eraser Commit
    if (activeTool === 'brush' || activeTool === 'eraser') {
      pushHistory();
    }

    isMouseDownRef.current = false;
    lastPointRef.current = null;
    redrawOverlay();
  };

  // Re-draw overlay whenever active selection or shape state changes
  useEffect(() => {
    redrawOverlay();
  }, [redrawOverlay]);

  // --------------------------------------------------------------------------
  // Save, Clear, Download & Color Swap Integration
  // --------------------------------------------------------------------------
  const handleClearCanvas = () => {
    const base = baseCanvasRef.current;
    if (!base) return;
    const ctx = base.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = color2;
    ctx.fillRect(0, 0, base.width, base.height);
    setActiveSelection(null);
    redrawOverlay();
    pushHistory();
    showToast('Canvas cleared!');
  };

  const handleDownload = () => {
    const base = baseCanvasRef.current;
    if (!base) return;
    const a = document.createElement('a');
    a.href = base.toDataURL('image/png');
    a.download = `${imageTitle.replace(/[^a-z0-9_-]/gi, '-')}-mspaint.png`;
    a.click();
    showToast('⬇️ Downloaded custom edited image!');
  };

  const handleSaveToFolder = async (folder: 'ready' | 'edited') => {
    const base = baseCanvasRef.current;
    if (!base || !onSaveResult) return;
    try {
      const dataUrl = base.toDataURL('image/jpeg', 0.95);
      await onSaveResult(dataUrl, folder, `${imageTitle} (MS Paint Edit)`);
      showToast(`⭐ Saved to ${folder === 'ready' ? 'Ready to Use' : 'Edited'}!`);
    } catch (err: any) {
      showToast(`Error saving: ${err?.message || err}`);
    }
  };

  const handleSendToSwap = () => {
    const base = baseCanvasRef.current;
    if (!base || !onSendToColorSwap) return;
    const dataUrl = base.toDataURL('image/jpeg', 0.95);
    onSendToColorSwap(dataUrl, `${imageTitle} (Painted)`);
    showToast('🔄 Sent to Color Swap as active pose!');
  };

  const handleLocalImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        loadCanvasImage(result);
        showToast('📸 Loaded uploaded image into canvas!');
      }
    };
    reader.readAsDataURL(file);
  };

  // Filter images for in-studio selector drawer
  const filteredAllImages = allImages.filter((img) => {
    if (imageCategoryFilter === 'all') return true;
    return img.folder === imageCategoryFilter;
  });

  // Current active brush metadata
  const currentBrushDef = BRUSH_DEFS.find((b) => b.id === activeBrush) || BRUSH_DEFS[0];

  // ==========================================================================
  // Render
  // ==========================================================================
  return (
    <div className={`space-y-4 ${isLight ? 'text-gray-900' : 'text-zinc-100'}`}>
      {/* Toast Banner */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 bg-black/90 text-white text-xs font-bold px-4 py-2.5 rounded-xl border border-white/20 shadow-2xl backdrop-blur-md flex items-center gap-2 animate-fade-in">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ----------------------------------------------------------------------
          MS PAINT RIBBON TOOLBAR
          ---------------------------------------------------------------------- */}
      <div className={`rounded-2xl border p-3 select-none ${isLight ? 'border-gray-200 bg-white shadow-sm' : 'border-zinc-800 bg-[#0e0e12]'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
          {/* Top Left: Title & Quick Status */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#e5373f]/15 border border-[#e5373f]/30 flex items-center justify-center">
              <Paintbrush className="w-4 h-4 text-[#e5373f]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold tracking-tight">MS Paint Pro Studio</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-mono border border-emerald-500/30">
                  Classic 9 Brushes
                </span>
              </div>
              <p className="text-[10px] text-zinc-400 truncate max-w-[280px]">
                Active: <span className="text-zinc-200 font-semibold">{imageTitle}</span>
              </p>
            </div>
          </div>

          {/* Top Right: Undo, Redo, Zoom, Clear & Image Drawer Toggle */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setShowImageDrawer((v) => !v)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                showImageDrawer
                  ? 'bg-[#e5373f] text-white shadow-sm'
                  : isLight
                    ? 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
              }`}
              title="Show / Hide Models and Image Catalog"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Select Images ({allImages.length})</span>
            </button>

            <div className="h-5 w-px bg-zinc-700 mx-1" />

            <button
              type="button"
              disabled={historyIndex <= 0}
              onClick={handleUndo}
              className="p-1.5 rounded-lg text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition"
              title="Undo (Ctrl+Z)"
            >
              <Undo className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={historyIndex >= history.length - 1}
              onClick={handleRedo}
              className="p-1.5 rounded-lg text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition"
              title="Redo (Ctrl+Y)"
            >
              <Redo className="w-3.5 h-3.5" />
            </button>

            {/* Zoom Controls */}
            <div className="flex items-center gap-1 bg-zinc-800/80 rounded-lg p-0.5 border border-zinc-700">
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(0.15, Number((z - 0.15).toFixed(2))))}
                className="p-1 hover:text-white cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-3 h-3" />
              </button>
              <span className="text-[10px] font-mono px-1 font-bold">{Math.round(zoomLevel * 100)}%</span>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(3.0, Number((z + 0.15).toFixed(2))))}
                className="p-1 hover:text-white cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const base = baseCanvasRef.current;
                  if (!base) return;
                  const container = canvasContainerRef.current;
                  const vH = container ? container.clientHeight : 540;
                  const vW = container ? container.clientWidth : 750;
                  const fit = Math.min(1.0, Math.min((vW - 48) / base.width, (vH - 48) / base.height));
                  setZoomLevel(Math.max(0.15, Number(fit.toFixed(2))));
                }}
                className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-zinc-700/80 hover:bg-zinc-600 text-emerald-400 cursor-pointer"
                title="Fit full garment in viewport"
              >
                Fit
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel(1)}
                className="text-[9px] px-1 font-bold text-zinc-400 hover:text-white cursor-pointer"
                title="Reset Zoom 100%"
              >
                1:1
              </button>
            </div>

            <button
              type="button"
              onClick={handleClearCanvas}
              className="px-2 py-1.5 rounded-lg text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 cursor-pointer flex items-center gap-1 transition"
              title="Clear Canvas with Background Color"
            >
              <RotateCcw className="w-3 h-3 text-rose-400" />
              <span>Clear</span>
            </button>

            {onSendToColorSwap && (
              <button
                type="button"
                onClick={handleSendToSwap}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 cursor-pointer flex items-center gap-1 transition"
                title="Send edited canvas to Color Swap"
              >
                <RefreshCw className="w-3 h-3 text-sky-400" />
                <span>🔄 Color Swap</span>
              </button>
            )}

            {onSaveResult && (
              <>
                <button
                  type="button"
                  onClick={() => handleSaveToFolder('ready')}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black cursor-pointer flex items-center gap-1 shadow-sm transition"
                  title="Save to Ready"
                >
                  <Bookmark className="w-3 h-3" />
                  <span>⭐ Ready</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveToFolder('edited')}
                  className="px-2 py-1.5 rounded-lg text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 cursor-pointer"
                  title="Save to Edited"
                >
                  💾 Edited
                </button>
              </>
            )}

            <button
              type="button"
              onClick={handleDownload}
              className="p-1.5 rounded-lg text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 cursor-pointer"
              title="Download PNG"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ------------------------------------------------------------------
            MS PAINT RIBBON CONTROLS ROW:
            Tools | Brushes (3x3) | Size | Dual Colors | Palette
            ------------------------------------------------------------------ */}
        <div className="flex flex-wrap items-center gap-3 pt-3">
          {/* 1. BASIC TOOLS (Select, Eraser, Eyedropper) */}
          <div className="flex items-center gap-1 border-r border-white/10 pr-3">
            <button
              type="button"
              onClick={() => {
                setActiveTool('select');
                setActiveShape(null);
              }}
              className={`p-2 rounded-lg text-xs font-semibold flex flex-col items-center gap-0.5 transition cursor-pointer ${
                activeTool === 'select'
                  ? 'bg-[#0078D7] text-white shadow-sm'
                  : isLight ? 'bg-gray-100 hover:bg-gray-200 text-gray-800' : 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300'
              }`}
              title="Select Tool: Drag box to extract. Drag 4 corners to scale. Shift+Drag to stamp!"
            >
              <Scissors className="w-4 h-4" />
              <span className="text-[9px]">Select</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTool('eraser');
                setActiveShape(null);
              }}
              className={`p-2 rounded-lg text-xs font-semibold flex flex-col items-center gap-0.5 transition cursor-pointer ${
                activeTool === 'eraser'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : isLight ? 'bg-gray-100 hover:bg-gray-200 text-gray-800' : 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300'
              }`}
              title="Eraser (Right-click or erase to Color 2 background)"
            >
              <Eraser className="w-4 h-4" />
              <span className="text-[9px]">Eraser</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTool('eyedropper');
                setActiveShape(null);
              }}
              className={`p-2 rounded-lg text-xs font-semibold flex flex-col items-center gap-0.5 transition cursor-pointer ${
                activeTool === 'eyedropper'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : isLight ? 'bg-gray-100 hover:bg-gray-200 text-gray-800' : 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300'
              }`}
              title="Eyedropper: Click on canvas to sample color. Left-click for Color 1, Right-click for Color 2."
            >
              <Pipette className="w-4 h-4" />
              <span className="text-[9px]">Color Picker</span>
            </button>
          </div>

          {/* 2. BRUSHES DROPDOWN (3x3 Grid of 9 Brushes with Classic Icons) */}
          <div className="relative border-r border-white/10 pr-3">
            <button
              type="button"
              onClick={() => {
                setActiveTool('brush');
                setActiveShape(null);
                setBrushDropdownOpen((o) => !o);
              }}
              className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 transition cursor-pointer ${
                activeTool === 'brush'
                  ? 'border-[#e5373f] bg-[#e5373f]/15 text-zinc-100 ring-1 ring-[#e5373f]'
                  : isLight ? 'border-gray-200 bg-gray-100 hover:bg-gray-200 text-gray-800' : 'border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300'
              }`}
              title="Click to open 3x3 menu of all 9 MS Paint Brushes"
            >
              <div
                className="w-5 h-5 rounded flex items-center justify-center text-white"
                style={{ backgroundColor: currentBrushDef.iconBg }}
              >
                <Paintbrush className="w-3.5 h-3.5" />
              </div>
              <div className="text-left">
                <span className="text-xs font-bold block leading-none">Brushes</span>
                <span className="text-[9px] text-[#e5373f] block leading-none mt-0.5 font-semibold">
                  {currentBrushDef.name}
                </span>
              </div>
              <ChevronDown className="w-3 h-3 ml-0.5 opacity-70" />
            </button>

            {/* Visual 3x3 Grid Menu of the 9 Brush Types */}
            {brushDropdownOpen && (
              <div className="absolute top-full left-0 mt-2 z-50 w-72 rounded-2xl border border-white/20 bg-zinc-950 p-3 shadow-2xl backdrop-blur-xl animate-fade-in">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    MS Paint Brushes (9 Styles)
                  </span>
                  <span className="text-[10px] text-zinc-500">Select texture</span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {BRUSH_DEFS.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => {
                        setActiveBrush(b.id);
                        setActiveTool('brush');
                        setActiveShape(null);
                        setBrushDropdownOpen(false);
                        showToast(`Brush switched to: ${b.name}`);
                      }}
                      className={`p-2 rounded-xl border flex flex-col items-center text-center cursor-pointer transition ${
                        activeBrush === b.id
                          ? 'border-[#e5373f] bg-[#e5373f]/20 ring-1 ring-[#e5373f]'
                          : 'border-white/10 bg-zinc-900/60 hover:bg-zinc-800'
                      }`}
                      title={`${b.name}: ${b.desc}`}
                    >
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white mb-1 shadow-sm"
                        style={{ backgroundColor: b.iconBg }}
                      >
                        <Paintbrush className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] font-bold leading-tight truncate w-full text-zinc-200">
                        {b.name}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="mt-2.5 pt-2 border-t border-white/10 text-[10px] text-zinc-400 italic">
                  💡 {currentBrushDef.desc}
                </div>
              </div>
            )}
          </div>

          {/* 3. SIZE SELECTOR DROPDOWN (4 Presets + Shortcuts) */}
          <div className="relative border-r border-white/10 pr-3">
            <button
              type="button"
              onClick={() => setSizeDropdownOpen((o) => !o)}
              className={`px-2.5 py-1.5 rounded-xl border flex items-center gap-2 cursor-pointer transition ${
                isLight ? 'border-gray-200 bg-gray-100 hover:bg-gray-200 text-gray-800' : 'border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300'
              }`}
              title="Stroke Size (Ctrl + / Ctrl -)"
            >
              <div className="flex flex-col items-center justify-center w-4 h-4">
                <span className="w-full bg-current rounded-full" style={{ height: Math.min(6, Math.max(1, brushSize / 4)) }} />
              </div>
              <div className="text-left">
                <span className="text-xs font-bold block leading-none">Size</span>
                <span className="text-[9px] font-mono text-zinc-400 leading-none mt-0.5">{brushSize}px</span>
              </div>
              <ChevronDown className="w-3 h-3 opacity-70" />
            </button>

            {sizeDropdownOpen && (
              <div className="absolute top-full left-0 mt-2 z-50 w-48 rounded-xl border border-white/20 bg-zinc-950 p-2 shadow-2xl backdrop-blur-xl">
                <div className="space-y-1">
                  {SIZE_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => {
                        setBrushSize(preset.value);
                        setSizeDropdownOpen(false);
                      }}
                      className={`w-full p-2 rounded-lg flex items-center justify-between text-xs cursor-pointer transition ${
                        brushSize === preset.value
                          ? 'bg-[#e5373f] text-white font-bold'
                          : 'hover:bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      <span>{preset.label}</span>
                      <span
                        className="rounded-full bg-current"
                        style={{ width: preset.value, height: preset.value }}
                      />
                    </button>
                  ))}
                </div>
                <div className="mt-2 pt-2 border-t border-white/10">
                  <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1">
                    <span>Custom px:</span>
                    <span className="font-mono font-bold text-zinc-200">{brushSize}px</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="64"
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    className="w-full accent-[#e5373f] cursor-pointer"
                  />
                  <p className="text-[9px] text-zinc-500 mt-1">Shortcuts: Ctrl + / Ctrl -</p>
                </div>
              </div>
            )}
          </div>

          {/* 4. BASIC SHAPES & OUTLINE SELECTOR */}
          <div className="relative border-r border-white/10 pr-3">
            <button
              type="button"
              onClick={() => setShapeDropdownOpen((o) => !o)}
              className={`px-2.5 py-1.5 rounded-xl border flex items-center gap-1.5 cursor-pointer transition ${
                activeTool === 'shape'
                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                  : isLight ? 'border-gray-200 bg-gray-100 hover:bg-gray-200 text-gray-800' : 'border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300'
              }`}
              title="Shapes: Rectangle, Circle, Star with brush-textured outlines"
            >
              <div className="flex items-center gap-1">
                <Square className="w-3.5 h-3.5" />
                <Circle className="w-3.5 h-3.5" />
                <Star className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-bold">Shapes</span>
              <ChevronDown className="w-3 h-3 opacity-70" />
            </button>

            {shapeDropdownOpen && (
              <div className="absolute top-full left-0 mt-2 z-50 w-64 rounded-xl border border-white/20 bg-zinc-950 p-3 shadow-2xl backdrop-blur-xl space-y-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1.5">
                    Select Shape
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'rectangle', label: 'Rectangle', icon: <Square className="w-4 h-4" /> },
                      { id: 'circle', label: 'Circle', icon: <Circle className="w-4 h-4" /> },
                      { id: 'star', label: 'Star', icon: <Star className="w-4 h-4" /> },
                    ].map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setActiveTool('shape');
                          setActiveShape(s.id as ShapeType);
                          setShapeDropdownOpen(false);
                          showToast(`Shape selected: ${s.label}. Drag to draw on canvas.`);
                        }}
                        className={`p-2 rounded-lg border flex flex-col items-center gap-1 text-xs cursor-pointer ${
                          activeShape === s.id && activeTool === 'shape'
                            ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300 font-bold'
                            : 'border-white/10 hover:bg-zinc-800 text-zinc-300'
                        }`}
                      >
                        {s.icon}
                        <span className="text-[10px]">{s.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Outline Brush Texture Selector */}
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                    Outline Texture (Brush Style)
                  </span>
                  <select
                    value={shapeOutlineBrush}
                    onChange={(e) => setShapeOutlineBrush(e.target.value as PaintBrushType)}
                    className="w-full text-xs p-1.5 rounded-lg border border-white/10 bg-zinc-900 text-zinc-200 cursor-pointer"
                  >
                    {BRUSH_DEFS.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} Outline
                      </option>
                    ))}
                  </select>
                </div>

                {/* Fill Mode */}
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                    Shape Fill
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShapeFillMode('none')}
                      className={`flex-1 py-1 rounded text-[10px] font-bold border cursor-pointer ${
                        shapeFillMode === 'none'
                          ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                          : 'border-white/10 text-zinc-400'
                      }`}
                    >
                      No Fill
                    </button>
                    <button
                      type="button"
                      onClick={() => setShapeFillMode('color2')}
                      className={`flex-1 py-1 rounded text-[10px] font-bold border cursor-pointer ${
                        shapeFillMode === 'color2'
                          ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                          : 'border-white/10 text-zinc-400'
                      }`}
                    >
                      Solid (Color 2)
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 5. DUAL COLOR BOXES: Color 1 (Foreground) & Color 2 (Background) */}
          <div className="flex items-center gap-2 border-r border-white/10 pr-3">
            {/* Color 1 */}
            <div
              onClick={() => setActiveColorSlot(1)}
              className={`p-1.5 rounded-xl border flex flex-col items-center cursor-pointer transition ${
                activeColorSlot === 1
                  ? 'border-[#0078D7] ring-2 ring-[#0078D7]/40 bg-[#0078D7]/10'
                  : 'border-white/10 hover:border-white/30'
              }`}
              title="Color 1 (Foreground / Left-Click)"
            >
              <span
                className="w-7 h-7 rounded-lg border border-white/40 shadow-inner block"
                style={{ backgroundColor: color1 }}
              />
              <span className="text-[9px] font-bold mt-1">Color 1</span>
            </div>

            {/* Color 2 */}
            <div
              onClick={() => setActiveColorSlot(2)}
              className={`p-1.5 rounded-xl border flex flex-col items-center cursor-pointer transition ${
                activeColorSlot === 2
                  ? 'border-[#0078D7] ring-2 ring-[#0078D7]/40 bg-[#0078D7]/10'
                  : 'border-white/10 hover:border-white/30'
              }`}
              title="Color 2 (Background / Right-Click)"
            >
              <span
                className="w-7 h-7 rounded-lg border border-white/40 shadow-inner block"
                style={{ backgroundColor: color2 }}
              />
              <span className="text-[9px] font-bold mt-1">Color 2</span>
            </div>
          </div>

          {/* 6. CLASSIC COLOR PALETTE GRID (Left-Click = Color 1, Right-Click = Color 2) */}
          <div className="space-y-1">
            {CLASSIC_PALETTE_ROWS.map((row, rowIdx) => (
              <div key={rowIdx} className="flex items-center gap-1">
                {row.map((item) => (
                  <button
                    key={item.hex}
                    type="button"
                    onClick={() => {
                      if (activeColorSlot === 1) setColor1(item.hex);
                      else setColor2(item.hex);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setColor2(item.hex);
                      showToast(`Color 2 set to: ${item.hex}`);
                    }}
                    className={`w-5 h-5 rounded border cursor-pointer transition hover:scale-110 shadow-xs relative ${
                      color1.toLowerCase() === item.hex.toLowerCase()
                        ? 'ring-2 ring-[#0078D7] border-white z-10'
                        : 'border-white/20'
                    }`}
                    style={{ backgroundColor: item.hex }}
                    title={`${item.name} (${item.hex}) - Left: Color 1, Right: Color 2`}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Custom Color Input */}
          <div className="flex items-center gap-1.5 pl-1">
            <input
              type="color"
              value={activeColorSlot === 1 ? color1 : color2}
              onChange={(e) => {
                if (activeColorSlot === 1) setColor1(e.target.value);
                else setColor2(e.target.value);
              }}
              className="w-7 h-7 rounded-lg cursor-pointer bg-transparent border-0"
              title="Edit Color with Full RGB Spectrum"
            />
            <span className="text-[10px] font-mono text-zinc-400">
              {activeColorSlot === 1 ? color1 : color2}
            </span>
          </div>

          {/* Transparent Selection Toggle */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-white/10">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={transparentSelection}
                onChange={(e) => setTransparentSelection(e.target.checked)}
                className="accent-[#0078D7] rounded cursor-pointer"
              />
              <span className="text-[11px] text-zinc-300">Transparent Selection</span>
            </label>
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------------
          IN-STUDIO IMAGE SELECTOR DRAWER (Fixes: "Select Images are not show in Canva Paint & Clone Studio")
          ---------------------------------------------------------------------- */}
      {showImageDrawer && allImages.length > 0 && (
        <div className={`rounded-2xl border p-4 animate-fade-in ${isLight ? 'border-gray-200 bg-white shadow-sm' : 'border-zinc-800 bg-[#0e0e12]'}`}>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#e5373f] flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                <span>Select Garment Image to Paint & Edit ({filteredAllImages.length})</span>
              </span>
              <span className="text-[10px] text-zinc-400">
                (Click any image to immediately load it onto the canvas)
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Category Filter Pills */}
              <div className="flex items-center gap-1">
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
                    onClick={() => setImageCategoryFilter(f.id)}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border cursor-pointer transition ${
                      imageCategoryFilter === f.id
                        ? 'border-[#e5373f] bg-[#e5373f]/20 text-[#e5373f]'
                        : 'border-white/10 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLocalImageUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[#e5373f] text-white hover:bg-[#d42d35] flex items-center gap-1 cursor-pointer"
                >
                  <Upload className="w-3 h-3" />
                  <span>Upload</span>
                </button>
              </div>
            </div>
          </div>

          {/* Horizontal Scrollable Thumbnails Strip */}
          <div className="flex items-center gap-3 overflow-x-auto pb-2 no-scrollbar">
            {filteredAllImages.map((img) => {
              const isSelected = activeImageId === img.id;
              const fullUrl = getProxiedImageUrl(resolveImageUrl(img.url));
              return (
                <div
                  key={img.id}
                  onClick={() => {
                    loadCanvasImage(fullUrl);
                    if (onSelectImage) onSelectImage(img);
                    showToast(`Loaded: ${img.title}`);
                  }}
                  className={`w-20 shrink-0 p-1 rounded-xl border flex flex-col items-center text-center cursor-pointer transition hover:scale-105 ${
                    isSelected
                      ? 'border-[#e5373f] ring-2 ring-[#e5373f] bg-[#e5373f]/10'
                      : 'border-white/10 bg-zinc-900/60 hover:bg-zinc-800'
                  }`}
                  title={`Click to edit ${img.title}`}
                >
                  <img
                    src={fullUrl}
                    alt={img.title}
                    className="w-16 h-20 object-cover rounded-lg bg-black/40 mb-1"
                  />
                  <span className="text-[9px] font-semibold truncate w-full px-0.5">
                    {img.title}
                  </span>
                  {isSelected && (
                    <span className="text-[8px] font-bold text-[#e5373f] mt-0.5">● Active</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------------
          CANVAS WORKSPACE VIEWPORT (Dual Stack: Base Canvas + Overlay Canvas)
          Supports Scrolling, Zooming, Corner-Only Resizing & Eyedropper Loupe
          ---------------------------------------------------------------------- */}
      <div className={`rounded-2xl border p-4 select-none ${isLight ? 'border-gray-200 bg-white shadow-sm' : 'border-zinc-800 bg-[#0e0e12]'}`}>
        {/* Status Bar */}
        <div className="flex items-center justify-between text-xs text-zinc-400 px-1 mb-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-200">
              {activeTool === 'brush' && `🖌️ ${currentBrushDef.name} (${brushSize}px) — Left-click: Color 1, Right-click: Color 2`}
              {activeTool === 'eraser' && `🧹 Eraser (${brushSize}px) — Erases to Color 2 Background`}
              {activeTool === 'select' &&
                (activeSelection
                  ? `✂️ Area Selected (${activeSelection.w}×${activeSelection.h}px) — Drag 4 corners to scale. Hold Shift to stamp!`
                  : `✂️ Select Tool — Drag a box over any garment area to extract it`)}
              {activeTool === 'shape' && `📐 ${activeShape?.toUpperCase()} with ${shapeOutlineBrush} texture`}
              {activeTool === 'eyedropper' && `🧪 Eyedropper Active — Click anywhere on garment to sample color`}
            </span>
          </div>

          <div className="flex items-center gap-3 text-[11px]">
            {activeSelection && (
              <button
                type="button"
                onClick={commitSelectionToCanvas}
                className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-sm transition"
              >
                ✓ Stamp / Commit Selection
              </button>
            )}
            <span>Zoom: {Math.round(zoomLevel * 100)}%</span>
            <span>Dimensions: {baseCanvasRef.current ? `${baseCanvasRef.current.width}×${baseCanvasRef.current.height}px` : '1024×1024'}</span>
          </div>
        </div>

        {/* Scrollable Viewport Container for Canvas */}
        <div
          ref={canvasContainerRef}
          className="relative rounded-xl overflow-auto border border-white/10 bg-zinc-950 p-6 min-h-[500px] max-h-[76vh] flex"
        >
          <div
            style={{
              transform: `scale(${zoomLevel})`,
              transformOrigin: 'top center',
              transition: 'transform 0.1s ease-out',
            }}
            className="relative shadow-2xl m-auto shrink-0"
          >
            {/* Base Drawing Canvas */}
            <canvas
              ref={baseCanvasRef}
              width={1024}
              height={1024}
              className="rounded-lg block shadow-2xl bg-white"
            />

            {/* Overlay Canvas for floating selection marquee, 4 corner handles, and shapes */}
            <canvas
              ref={overlayCanvasRef}
              width={1024}
              height={1024}
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className={`absolute inset-0 rounded-lg ${
                activeTool === 'eyedropper'
                  ? 'cursor-crosshair'
                  : activeTool === 'select'
                    ? 'cursor-crosshair'
                    : 'cursor-crosshair'
              }`}
            />
          </div>

          {/* Floating Magnification Loupe (Eyedropper) */}
          {activeTool === 'eyedropper' && eyedropperLoupe?.visible && (
            <div
              style={{
                position: 'fixed',
                left: `${eyedropperLoupe.screenX + 16}px`,
                top: `${eyedropperLoupe.screenY - 48}px`,
                pointerEvents: 'none',
                zIndex: 9999,
              }}
              className="flex items-center gap-2 bg-black/95 text-white px-3 py-1.5 rounded-xl border border-white/30 shadow-2xl backdrop-blur-md"
            >
              <span
                className="w-5 h-5 rounded-full border border-white shadow-inner shrink-0"
                style={{ backgroundColor: eyedropperLoupe.colorHex }}
              />
              <div className="text-[10px] font-mono leading-tight">
                <p className="font-bold">{eyedropperLoupe.colorHex}</p>
                <p className="opacity-70 text-[8px]">{eyedropperLoupe.rgb}</p>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Helper Bar */}
        <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1 pt-2">
          <span>
            💡 <strong>MS Paint Pro Tips:</strong> Drag 4 corner handles to scale extracted area smoothly. Hold <strong>Shift</strong> while dragging selection to continuously stamp a repeating pattern across fabric. Right-click with any brush to paint with <strong>Color 2</strong>.
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-mono">Shortcuts: Ctrl + / Ctrl - for Brush Size | Ctrl+Z Undo</span>
          </div>
        </div>
      </div>
    </div>
  );
};
