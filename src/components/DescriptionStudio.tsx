import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Sparkles,
  Upload,
  Copy,
  Check,
  Trash2,
  Download,
  RefreshCw,
  Archive,
  X,
  RotateCcw,
  BookOpen,
} from 'lucide-react';
import { api, type DescriptionHistoryItem, type UserGeneration, resolveImageUrl, getProxiedImageUrl } from '../lib/api';
import { getBestGenUrl } from '../pages/Design';

interface DescriptionStudioProps {
  user?: any;
  isLight?: boolean;
  userGenerations?: UserGeneration[];
  preselectedImages?: { id: string; url: string; name: string }[];
  onClearPreselected?: () => void;
}

const DEFAULT_PROMPT = `Look carefully at the sportswear garment in the image(s). Check the fabric look, stitching, collar, sleeves, pockets, zipper, logos, colours and overall fit. Then write a professional e-commerce listing for it.

Follow these rules strictly:

Use only simple, clean, point-wise formatting. Do not use asterisks (**), emojis, markdown symbols, tables or decorative lines.
Use proper, universal product names (for example "Men's Colourblock Zip-Up Track Jacket"). Do not use any company or brand name in the titles or text, unless I give you one.
Write only what you can see in the image. If something cannot be confirmed (such as exact fabric or GSM), write "Suggested"next to it.
Keep the language simple, attractive and easy to read. Avoid exaggerated or filler words.

Give the output in exactly this order:

PRODUCT TITLES
Give 6 titles in a numbered list. Each title should be 12 to 18 words and include gender, garment type, key feature and use. Make 2 for Amazon, 2 for Flipkart and 2 for catalogue or social media.
SHORT DESCRIPTION
Write exactly 3 lines. Cover the look, comfort and fit in a punchy way.
KEY FEATURES
Write 7 to 8 points. Each point should be one line, start with a short feature name followed by a colon, and then describe the benefit in an impressive but simple way.
Example: Breathable Fabric: Lightweight material keeps you cool and dry during long workouts.
FABRIC AND MATERIAL
Write 4 to 5 short points covering composition, weight, stretch and finish (mark as "Suggested"if not visible).
DESIGN DETAILS
Write 5 to 6 short points covering collar, sleeves, pockets, zipper, logo or print, and cuffs and hem.
BEST USE
Write 1 line each for sports use, daily wear and season or weather.
SIZE AND FIT
Write 3 to 4 short points covering fit type, sizing advice and model details if visible.
WASH AND CARE
Write 5 short points with clear do's and don'ts.
SEO KEYWORDS
Give 10 keywords separated by commas, with no brand name.`;

type AiStudioMode = 'listing' | 'blank';

const AI_STUDIO_MODES: { id: AiStudioMode; label: string; hint: string }[] = [
  { id: 'listing', label: 'Default (Product Description)', hint: 'Uses the preset e-commerce sportswear listing prompt' },
  { id: 'blank', label: 'Blank (Ask AI Anything)', hint: 'Start blank — ask AI anything with real-time date/info or attach images' },
];

export default function DescriptionStudio({
  user = null,
  isLight = false,
  userGenerations = [],
  preselectedImages,
  onClearPreselected,
}: DescriptionStudioProps) {
  // State
  const [aiMode, setAiMode] = useState<AiStudioMode>('listing');
  const [images, setImages] = useState<{ id: string; url: string; name: string }[]>([]);
  const [isFromMySets, setIsFromMySets] = useState<boolean>(false);
  const [prompt, setPrompt] = useState<string>(DEFAULT_PROMPT);
  const [defaultPrompt, setDefaultPrompt] = useState<string>(DEFAULT_PROMPT);
  const [showMySetsDrawer, setShowMySetsDrawer] = useState<boolean>(false);
  const preselectedHandledRef = useRef<string>('');

  // Helper to convert any image URL (local/remote/blob) into a base64 Data URL for Gemini multimodal AI
  const optimizeImageUrl = async (
    rawUrl: string,
    name: string,
    id?: string
  ): Promise<{ id: string; url: string; name: string }> => {
    const fallbackId = id || 'img_'+ Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    if (!rawUrl) return { id: fallbackId, url: '', name };
    if (rawUrl.startsWith('data:')) return { id: fallbackId, url: rawUrl, name };

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      const timer = setTimeout(() => {
        resolve({ id: fallbackId, url: rawUrl, name });
      }, 4000);

      img.onload = () => {
        clearTimeout(timer);
        try {
          const maxDim = 1024;
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            resolve({ id: fallbackId, url: dataUrl, name });
            return;
          }
        } catch (e) {
          console.warn('[optimizeImageUrl] canvas export failed:', e);
        }
        resolve({ id: fallbackId, url: rawUrl, name });
      };

      img.onerror = () => {
        clearTimeout(timer);
        fetch(getProxiedImageUrl(rawUrl))
          .then((r) => r.blob())
          .then((blob) => {
            const reader = new FileReader();
            reader.onload = () => resolve({ id: fallbackId, url: reader.result as string, name });
            reader.onerror = () => resolve({ id: fallbackId, url: rawUrl, name });
            reader.readAsDataURL(blob);
          })
          .catch(() => resolve({ id: fallbackId, url: rawUrl, name }));
      };

      img.src = getProxiedImageUrl(rawUrl);
    });
  };

  // Synchronize preselected images from My Sets & Automatically Trigger AI Description
  useEffect(() => {
    if (preselectedImages && preselectedImages.length > 0) {
      const key = preselectedImages.map((p) => p.id || p.url).join(',');
      if (preselectedHandledRef.current === key) return;
      preselectedHandledRef.current = key;

      setIsFromMySets(true);
      setErrorMsg(null);
      setImages(preselectedImages);

      void (async () => {
        showToast(`Taking selected garment from My Sets...`);
        // Convert to base64 Data URL so Gemini AI directly receives the multimodal image
        const optimized = await Promise.all(
          preselectedImages.map((p) => optimizeImageUrl(p.url, p.name, p.id))
        );
        const valid = optimized.filter((item) => item.url);
        if (valid.length > 0) {
          setImages(valid);
        }
        const activePrompt = (prompt && prompt.trim()) ? prompt.trim() : (defaultPrompt || DEFAULT_PROMPT);
        showToast(`Analyzing garment with Shiv-Naresh AI...`);

        // Automatically trigger generation with verified base64 image data
        void handleGenerate(valid.length > 0 ? valid : preselectedImages, activePrompt);
      })();

      if (onClearPreselected) onClearPreselected();
    }
  }, [preselectedImages, onClearPreselected, prompt, defaultPrompt]);

  // Generation state
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatedResult, setGeneratedResult] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // History state
  const [historyItems, setHistoryItems] = useState<DescriptionHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // 1. Fetch Description Settings & Default Prompt on mount
  useEffect(() => {
    let cancelled = false;

    api
      .getDescriptionSettings()
      .then((res) => {
        if (!cancelled && res.ok) {
          const sysDefault = res.defaultPrompt || DEFAULT_PROMPT;
          setDefaultPrompt(sysDefault);
          setPrompt((prev) => (!prev || prev === DEFAULT_PROMPT ? sysDefault : prev));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDefaultPrompt(DEFAULT_PROMPT);
          setPrompt((prev) => (prev ? prev : DEFAULT_PROMPT));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Reset prompt back to default
  const handleResetPrompt = () => {
    setPrompt(defaultPrompt || DEFAULT_PROMPT);
    showToast('↺ Reset to default prompt');
  };

  // 2. Load History
  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await api.getDescriptionHistory();
      if (res.ok && Array.isArray(res.items)) {
        setHistoryItems(res.items);
      }
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    void loadHistory();
  }, []);

  // Helper to downsample & optimize images (max 1024px) for blazing fast upload & AI inspection
  const optimizeImageFile = (file: File): Promise<{ id: string; url: string; name: string }> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const src = e.target?.result;
        if (typeof src !== 'string') {
          resolve({
            id: 'up_'+ Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            url: '',
            name: file.name,
          });
          return;
        }

        const img = new Image();
        img.onload = () => {
          const maxDim = 1024;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
            const optimizedUrl = canvas.toDataURL('image/jpeg', 0.82);
            resolve({
              id: 'up_'+ Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
              url: optimizedUrl,
              name: file.name,
            });
            return;
          }
          resolve({
            id: 'up_'+ Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            url: src,
            name: file.name,
          });
        };
        img.onerror = () => {
          resolve({
            id: 'up_'+ Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            url: src,
            name: file.name,
          });
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    });
  };

  // Handle local file uploads with instant optimization
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    const optimized = await Promise.all(fileList.map((f) => optimizeImageFile(f)));
    const valid = optimized.filter((item) => item.url);
    setImages((prev) => [...prev, ...valid]);

    if (fileInputRef.current) fileInputRef.current.value = '';
    showToast(`Added ${valid.length} photo(s)`);
  };

  // Remove single image
  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  // Toggle selection from My Sets
  const toggleMySetImage = async (gen: UserGeneration) => {
    const url = getBestGenUrl(gen);
    if (!url) return;
    const exists = images.some((img) => img.id === gen.id || img.url === url);
    if (exists) {
      setImages((prev) => prev.filter((img) => img.id !== gen.id && img.url !== url));
    } else {
      setIsFromMySets(true);
      showToast('Loading image from My Sets...');
      const opt = await optimizeImageUrl(resolveImageUrl(url), gen.title || `Render #${gen.id.slice(-4)}`, gen.id);
      setImages((prev) => [...prev, opt]);
    }
  };

  // Submit generation request (supports: Images Only, Prompt Only, or Both)
  const handleGenerate = async (
    customImages?: { id: string; url: string; name: string }[],
    customPrompt?: string
  ) => {
    if (!user) {
      window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname + window.location.search);
      return;
    }
    const targetImages = customImages && customImages.length > 0 ? customImages : images;
    const effectivePrompt = (customPrompt || prompt).trim() || (aiMode === 'listing' ? (defaultPrompt || DEFAULT_PROMPT) : '');

    if (targetImages.length === 0 && !effectivePrompt) {
      setErrorMsg('Please upload at least 1 garment photo or enter prompt instructions.');
      return;
    }
    setErrorMsg(null);
    setIsGenerating(true);

    try {
      const preparedImages = await Promise.all(
        targetImages.map(async (img) => {
          if (!img.url || img.url.startsWith('data:')) return img;
          return optimizeImageUrl(img.url, img.name, img.id);
        })
      );
      const imageUrls = preparedImages.map((img) => img.url).filter(Boolean);

      if (aiMode === 'listing') {
        const res = await api.generateDescription({
          images: imageUrls,
          prompt: effectivePrompt || DEFAULT_PROMPT,
        });
        if (res.ok && res.text) {
          setGeneratedResult(res.text);
          setActiveTitle(res.item?.title || targetImages[0]?.name || 'Product Description');
          showToast('Description generated successfully!');
          void loadHistory();
        }
      } else {
        const modeMeta = AI_STUDIO_MODES.find((m) => m.id === aiMode);
        const res = await api.aiAssist({
          action: aiMode === 'blank' ? 'custom' : aiMode,
          prompt: effectivePrompt || modeMeta?.hint || 'Analyze the garment.',
          images: imageUrls,
        });
        if (res.ok && res.text) {
          setGeneratedResult(res.text);
          setActiveTitle(modeMeta?.label || 'AI Studio Output');
          showToast(`${modeMeta?.label || 'AI Output'} ready!`);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to generate product description from Gemini AI.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Copy result to clipboard
  const handleCopy = () => {
    if (!generatedResult) return;
    navigator.clipboard.writeText(generatedResult);
    setCopied(true);
    showToast('Copied full description to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  // Download result as text file
  const handleDownload = () => {
    if (!generatedResult) return;
    const blob = new Blob([generatedResult], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(activeTitle || 'sportswear-description').replace(/[^a-z0-9_-]/gi, '_')}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('⬇️ Downloaded description file');
  };

  // Delete history item
  const handleDeleteHistory = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.deleteDescriptionHistory(id);
      setHistoryItems((prev) => prev.filter((item) => item.id !== id));
      showToast('Deleted item from history');
    } catch {
      // ignore
    }
  };

  return (
    <div className={`mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6 ${isLight ? 'text-gray-900' : 'text-zinc-100'}`}>
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2 bg-[#18181b] text-white border border-emerald-500/40 px-4 py-2.5 rounded-xl shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-4">
          <Check className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold">{toastMsg}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-5 border-white/10">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e5373f] text-white shadow-md">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight">AI Product Description & Catalog Studio</h1>
                <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                  Multimodal Google Gemini
                </span>
              </div>
              <p className={`text-xs ${isLight ? 'text-gray-600' : 'text-zinc-400'} mt-0.5`}>
                Upload any number of product photos and generate full e-commerce listings, fabric specifications, wash care, and SEO copy instantly.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (Images & Prompt Form) */}
        <div className="lg:col-span-5 space-y-5">
          {/* 1. Garment Photo Selection & Upload Card */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              const files = e.dataTransfer.files;
              if (!files || files.length === 0) return;
              const fileList = Array.from(files);
              const optimized = await Promise.all(fileList.map((f) => optimizeImageFile(f)));
              const valid = optimized.filter((item) => item.url);
              setImages((prev) => [...prev, ...valid]);
              showToast(`Added ${valid.length} photo(s)`);
            }}
            className={`rounded-2xl border p-4 space-y-3 ${isLight ? 'border-[#C9A468]/35 bg-[#263B32] text-[#F5F0E7] shadow-sm' : 'border-zinc-800 bg-[#0e0e12]'}`}
          >
            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />

            {images.length > 0 ? (
              /* When images ARE selected (from My Sets or uploaded): show prominent preview & confirmation, NO manual upload box needed! */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>
                      {isFromMySets ? 'Garment Selected from My Sets' : `Garment Photos Loaded (${images.length})`}
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowMySetsDrawer((prev) => !prev)}
                      className="px-2 py-1 rounded-lg text-[10px] font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 flex items-center gap-1 cursor-pointer transition"
                      title="Switch or add more from My Sets"
                    >
                      <Archive className="w-3 h-3 text-amber-400" />
                      <span>My Sets</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-2 py-1 rounded-lg text-[10px] font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 flex items-center gap-1 cursor-pointer transition"
                      title="Upload extra detail shots"
                    >
                      <Upload className="w-3 h-3 text-[#e5373f]" />
                      <span>+ Add More</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setImages([]);
                        setIsFromMySets(false);
                      }}
                      className="text-[10px] text-zinc-400 hover:text-rose-400 cursor-pointer transition ml-1"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {/* Selected Images Grid */}
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                  {images.map((img) => (
                    <div
                      key={img.id}
                      className="relative group rounded-xl overflow-hidden border-2 border-emerald-500/50 bg-black aspect-[3/4] shadow-md"
                    >
                      <img
                        src={img.url}
                        alt={img.name}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-1.5 pt-4">
                        <p className="text-[10px] font-bold text-white truncate">{img.name}</p>
                        <span className="text-[8px] text-emerald-400 font-semibold uppercase">✓ Active for AI</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeImage(img.id);
                        }}
                        className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/80 hover:bg-rose-600 text-white opacity-0 group-hover:opacity-100 transition cursor-pointer shadow-md"
                        title="Remove image"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-2 text-xs text-emerald-300 font-medium">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    {images.length === 1
                      ? `Image "${images[0].name}"is actively selected from My Sets. No manual upload needed!`
                      : `${images.length} images are actively selected and ready. No manual upload needed!`}
                  </span>
                </div>
              </div>
            ) : (
              /* When NO images are selected: user opened Description Studio directly, ask for image or prompt */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#e5373f] flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Product Photo</span>
                  </span>

                  <button
                    type="button"
                    onClick={() => setShowMySetsDrawer((prev) => !prev)}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 flex items-center gap-1 cursor-pointer transition"
                    title="Pick images from your My Sets library"
                  >
                    <Archive className="w-3 h-3 text-amber-400" />
                    <span>Pick from My Sets</span>
                  </button>
                </div>

                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const files = e.dataTransfer.files;
                    if (!files || files.length === 0) return;
                    const fileList = Array.from(files);
                    const optimized = await Promise.all(fileList.map((f) => optimizeImageFile(f)));
                    const valid = optimized.filter((item) => item.url);
                    setImages((prev) => [...prev, ...valid]);
                    showToast(`Added ${valid.length} photo(s)`);
                  }}
                  className="p-6 border-2 border-dashed border-white/15 rounded-xl text-center cursor-pointer hover:border-[#e5373f] transition space-y-2 bg-black/20"
                >
                  <Upload className="w-7 h-7 mx-auto text-[#e5373f] opacity-80" />
                  <p className="text-xs font-semibold">Upload product photos or enter prompt to generate listing</p>
                  <p className="text-[10px] text-zinc-400">
                    Upload garment photos here, or click "Pick from My Sets"above
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* My Sets Quick Selector Drawer (Expandable) */}
          {showMySetsDrawer && (
            <div className={`p-4 rounded-2xl border space-y-3 animate-in fade-in ${isLight ? 'bg-gray-50 border-gray-200' : 'bg-[#0e0e12] border-zinc-800'}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Archive className="w-3.5 h-3.5" />
                  <span>Choose from My Sets & Wardrobe ({userGenerations.length})</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowMySetsDrawer(false)}
                  className="text-xs text-zinc-400 hover:text-white"
                >
                  Close
                </button>
              </div>

              {userGenerations.length === 0 ? (
                <p className="text-xs text-zinc-400 py-3 text-center">No generated sets found in your archive.</p>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-[240px] overflow-y-auto pr-1 no-scrollbar">
                  {userGenerations.map((gen) => {
                    const u = getBestGenUrl(gen);
                    if (!u) return null;
                    const isSelected = images.some((img) => img.id === gen.id || img.url === resolveImageUrl(u));
                    return (
                      <div
                        key={gen.id}
                        onClick={() => toggleMySetImage(gen)}
                        className={`relative rounded-xl overflow-hidden border cursor-pointer transition aspect-[3/4] ${
                          isSelected
                            ? 'border-[#e5373f] ring-2 ring-[#e5373f]'
                            : 'border-white/10 hover:border-white/40'
                        }`}
                      >
                        <img
                          src={getProxiedImageUrl(resolveImageUrl(u))}
                          alt={gen.title || 'Render'}
                          className="w-full h-full object-cover"
                        />
                        {isSelected && (
                          <div className="absolute top-1 right-1 p-0.5 rounded-full bg-[#e5373f] text-white">
                            <Check className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 2. Prompt Configuration Card */}
          <div className={`rounded-2xl border p-4 space-y-3 ${isLight ? 'border-[#C9A468]/35 bg-[#263B32] text-[#F5F0E7] shadow-sm' : 'border-zinc-800 bg-[#0e0e12]'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#e5373f] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Gemini AI Studio Mode</span>
              </span>

              <button
                type="button"
                onClick={handleResetPrompt}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 flex items-center gap-1.5 cursor-pointer transition active:scale-95"
                title="Reset back to default prompt"
              >
                <RotateCcw className="w-3 h-3 text-zinc-400" />
                <span>Reset to Default</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {AI_STUDIO_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  title={m.hint}
                  onClick={() => {
                    setAiMode(m.id);
                    if (m.id !== 'listing' && prompt === DEFAULT_PROMPT) {
                      setPrompt('');
                    } else if (m.id === 'listing' && !prompt.trim()) {
                      setPrompt(defaultPrompt || DEFAULT_PROMPT);
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                    aiMode === m.id
                      ? 'bg-[#e5373f] text-white shadow-sm'
                      : 'bg-white/5 text-white/75 hover:bg-white/10 hover:text-white border border-white/10'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] opacity-65">
              {AI_STUDIO_MODES.find((m) => m.id === aiMode)?.hint}
            </p>

            {/* Prompt Textarea */}
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={8}
              placeholder="Edit prompt instructions here..."
              className={`w-full rounded-xl border p-3 text-xs leading-relaxed focus:outline-none transition ${
                isLight ? 'border-gray-300 bg-gray-50 text-gray-900 focus:border-[#e5373f]' : 'border-white/15 bg-black/60 text-white focus:border-[#e5373f]'
              }`}
            />

            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <span className="flex items-center gap-1">
                 <span className="opacity-80">Flexible: Send <b>Images only</b>, <b>Prompt only</b>, or <b>Both</b></span>
              </span>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-400 font-medium">
                {errorMsg}
              </div>
            )}

            {/* Submit Generate Button */}
            <button
              type="button"
              disabled={isGenerating || (images.length === 0 && !prompt.trim())}
              onClick={() => void handleGenerate()}
              className="w-full py-3 rounded-xl text-xs font-bold uppercase tracking-wider bg-[#e5373f] hover:bg-[#d42d35] active:scale-[0.98] text-white flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-lg transition"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Google Gemini Generating Description...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {images.length > 0 && prompt.trim()
                      ? `Generate AI Description (${images.length} Image${images.length !== 1 ? 's' : ''} + Prompt)`
                      : images.length > 0
                        ? `Generate AI Description (${images.length} Image${images.length !== 1 ? 's' : ''})`
                        : 'Generate AI Description (Prompt Only)'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column (Results View & History) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Active Generation Result Card */}
          <div className={`rounded-2xl border p-5 space-y-4 min-h-[460px] flex flex-col ${isLight ? 'border-gray-200 bg-white shadow-sm' : 'border-zinc-800 bg-[#0e0e12]'}`}>
            <div className="flex items-center justify-between border-b pb-3 border-white/10 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  {activeTitle || 'Generated Product Description'}
                </span>
              </div>

              {generatedResult && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#e5373f] hover:bg-[#d42d35] text-white flex items-center gap-1.5 cursor-pointer shadow-md transition"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied!' : 'Copy Text'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownload}
                    className="p-1.5 rounded-lg text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 cursor-pointer"
                    title="Download as .md file"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Result Content */}
            <div className="flex-1">
              {isGenerating ? (
                <div className="py-20 text-center space-y-3">
                  <RefreshCw className="w-8 h-8 mx-auto text-[#e5373f] animate-spin opacity-80" />
                  <p className="text-xs font-semibold flex items-center justify-center gap-1.5">
                    <span></span>
                    <span>High-Speed AI Multimodal Inspection in Progress...</span>
                  </p>
                  <p className="text-[11px] text-zinc-400 max-w-sm mx-auto">
                    Inspecting fabric weave, stitching quality, collar design, logos, and athletic silhouette.
                  </p>
                </div>
              ) : generatedResult ? (
                <div className="space-y-4 leading-relaxed text-xs">
                  <div
                    className={`p-4 rounded-xl border whitespace-pre-wrap font-sans text-xs leading-relaxed select-text ${
                      isLight ? 'bg-gray-50 border-gray-200 text-gray-800' : 'bg-black/40 border-white/10 text-zinc-200'
                    }`}
                  >
                    {generatedResult}
                  </div>
                </div>
              ) : (
                <div className="py-24 text-center space-y-2 opacity-60">
                  <FileText className="w-10 h-10 mx-auto text-zinc-500 opacity-50" />
                  <p className="text-xs font-medium">No description generated yet.</p>
                  <p className="text-[10px] text-zinc-400 max-w-xs mx-auto">
                    Upload your product photos on the left and click "Generate Product Description"to start.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Previous Descriptions History */}
          <div className={`rounded-2xl border p-5 space-y-3 ${isLight ? 'border-gray-200 bg-white shadow-sm' : 'border-zinc-800 bg-[#0e0e12]'}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Archive className="w-3.5 h-3.5" />
                <span>Description History ({historyItems.length})</span>
              </span>

              {historyItems.length > 0 && (
                <button
                  type="button"
                  onClick={loadHistory}
                  className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingHistory ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              )}
            </div>

            {historyItems.length === 0 ? (
              <p className="text-xs text-zinc-400 py-3 text-center">No previous descriptions saved yet.</p>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 no-scrollbar">
                {historyItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      setGeneratedResult(item.text);
                      setActiveTitle(item.title);
                      showToast(`Loaded: ${item.title}`);
                    }}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition ${
                      isLight
                        ? 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                        : 'border-white/10 bg-zinc-900/50 hover:bg-zinc-800/80'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate text-white">{item.title}</p>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-400">
                        <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                        <span>•</span>
                        <span>{item.imagesCount} photo(s)</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(item.text);
                          showToast('Copied description!');
                        }}
                        className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                        title="Copy text"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleDeleteHistory(item.id, e)}
                        className="p-1.5 rounded-lg bg-zinc-800 hover:bg-rose-600 text-zinc-400 hover:text-white"
                        title="Delete from history"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
