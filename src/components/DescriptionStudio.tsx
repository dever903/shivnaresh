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
  Key,
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
}

const DEFAULT_PROMPT = `Analyze the sportswear garment (from the provided images and/or instructions) and generate the best high-converting e-commerce listing in authentic Shiv-Naresh athletic style:

### 🏷️ 1. SUGGESTED PRODUCT NAMES & TITLES (Top 5-8 Best Names)
- Provide 5 to 8 high-converting, premium athletic product titles (e.g., "Shiv-Naresh AeroShield Dry-Fit Track Jacket | Pro Athletic Edition", "Shiv-Naresh CoreFlex Pro Training Shorts"). Include options for Amazon, Flipkart, and catalog booklets.

### ⚡ 2. SHORT DESCRIPTION (2-3 Lines Quick Summary)
- Write a punchy, high-impact 2-3 line elevator pitch highlighting the primary look, fabric comfort, and athletic silhouette for catalog cards, WhatsApp, and social media.

### 📖 3. BEST IN-DEPTH PRODUCT DESCRIPTION
- Comprehensive, engaging marketing copy highlighting authentic Indian athletic heritage, modern sports aesthetic, dynamic motion fit, and all-weather durability.

### 🧵 4. FABRIC & MATERIAL SPECIFICATIONS
- Detailed composition (e.g. 100% moisture-wicking micro-poly, 4-way stretch spandex blend, GSM weight estimate, breathability, durability).

### 📐 5. DESIGN & KEY FEATURES
- Cut/pattern, neck/collar style (stand collar, crew, hoodie), sleeve design, pocket placement, zipper specs, reflective piping, high-definition embroidery or logo branding.

### 🏃 6. ATHLETIC PERFORMANCE & USE CASES
- Specific sports (running, cricket, football, marathon training, badminton, leisure/travel wear).

### 📏 7. SIZING & FIT GUIDANCE
- Athletic taper, relaxed fit, chest/waist sizing advice.

### 🧼 8. WASH & DURABILITY CARE
- Machine wash guidelines, temperature, do's & don'ts to preserve fabric elasticity and print.

### 🔍 9. SEO & E-COMMERCE TAGS
- Top 10 high-search-volume keywords separated by commas.`;

export default function DescriptionStudio({
  user: _user,
  isLight = false,
  userGenerations = [],
}: DescriptionStudioProps) {
  // State
  const [images, setImages] = useState<{ id: string; url: string; name: string }[]>([]);
  const [prompt, setPrompt] = useState<string>('');
  const [defaultPrompt, setDefaultPrompt] = useState<string>('');
  const [hasServerKey, setHasServerKey] = useState<boolean>(true);
  const [customApiKey, setCustomApiKey] = useState<string>(() => {
    try {
      return localStorage.getItem('sn_custom_gemini_key') || '';
    } catch {
      return '';
    }
  });
  const [showKeyConfig, setShowKeyConfig] = useState<boolean>(false);
  const [showMySetsDrawer, setShowMySetsDrawer] = useState<boolean>(false);

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
          setPrompt((prev) => (prev ? prev : sysDefault));
          setHasServerKey(res.hasGoogleKey);
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

  // Handle local file uploads
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          const item = {
            id: 'up_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            url: reader.result,
            name: file.name,
          };
          setImages((prev) => [...prev, item]);
        }
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
    showToast(`Added ${files.length} photo(s)`);
  };

  // Remove single image
  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  // Toggle selection from My Sets
  const toggleMySetImage = (gen: UserGeneration) => {
    const url = getBestGenUrl(gen);
    if (!url) return;
    const exists = images.some((img) => img.id === gen.id || img.url === url);
    if (exists) {
      setImages((prev) => prev.filter((img) => img.id !== gen.id && img.url !== url));
    } else {
      setImages((prev) => [
        ...prev,
        {
          id: gen.id,
          url: resolveImageUrl(url),
          name: gen.title || `Render #${gen.id.slice(-4)}`,
        },
      ]);
    }
  };

  // Submit generation request (supports: Images Only, Prompt Only, or Both)
  const handleGenerate = async () => {
    if (images.length === 0 && !prompt.trim()) {
      setErrorMsg('Please upload at least 1 garment photo or enter prompt instructions.');
      return;
    }
    setErrorMsg(null);
    setIsGenerating(true);

    try {
      const imageUrls = images.map((img) => img.url);
      const effectivePrompt = prompt.trim() || defaultPrompt || DEFAULT_PROMPT;
      const res = await api.generateDescription({
        images: imageUrls,
        prompt: effectivePrompt,
        apiKey: customApiKey.trim() || undefined,
      });

      if (res.ok && res.text) {
        setGeneratedResult(res.text);
        setActiveTitle(res.item?.title || 'Product Description');
        showToast('🎉 Description generated successfully!');
        void loadHistory();
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
    showToast('📋 Copied full description to clipboard!');
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

        {/* Google API Key Status / Toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          <div
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
              hasServerKey || customApiKey
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                hasServerKey || customApiKey ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span>
              {customApiKey
                ? 'Custom Gemini Key Active'
                : hasServerKey
                  ? 'Studio Google Key Active'
                  : 'No Google Key Found'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowKeyConfig((prev) => !prev)}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 flex items-center gap-1.5 cursor-pointer transition"
            title="Configure or override Google Gemini API key"
          >
            <Key className="w-3.5 h-3.5" />
            <span>API Key</span>
          </button>
        </div>
      </div>

      {/* Custom Key Accordion (Optional) */}
      {showKeyConfig && (
        <div className={`p-4 rounded-2xl border space-y-3 animate-in fade-in ${isLight ? 'bg-gray-50 border-gray-200' : 'bg-zinc-900/80 border-white/10'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
              <Key className="w-4 h-4 text-amber-400" />
              <span>Custom Google Gemini API Key (Optional Override)</span>
            </span>
            <span className="text-[10px] text-zinc-400">
              By default, the studio uses the server's Google API Key.
            </span>
          </div>

          <div className="flex gap-2">
            <input
              type="password"
              value={customApiKey}
              onChange={(e) => {
                setCustomApiKey(e.target.value);
                try {
                  localStorage.setItem('sn_custom_gemini_key', e.target.value.trim());
                } catch {
                  // ignore
                }
              }}
              placeholder="Paste Google AI Studio API Key (AIzaSy...)"
              className={`flex-1 rounded-xl border px-3 py-2 text-xs font-mono focus:outline-none ${
                isLight ? 'border-gray-300 bg-white text-gray-900' : 'border-white/15 bg-black/60 text-white'
              }`}
            />
            {customApiKey && (
              <button
                type="button"
                onClick={() => {
                  setCustomApiKey('');
                  try {
                    localStorage.removeItem('sn_custom_gemini_key');
                  } catch {
                    // ignore
                  }
                  showToast('Reverted to studio Google Key');
                }}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (Images & Prompt Form) */}
        <div className="lg:col-span-5 space-y-5">
          {/* 1. Garment Photo Upload Card */}
          <div className={`rounded-2xl border p-4 space-y-3 ${isLight ? 'border-gray-200 bg-white shadow-sm' : 'border-zinc-800 bg-[#0e0e12]'}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#e5373f] flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Product Images ({images.length})</span>
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowMySetsDrawer((prev) => !prev)}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 flex items-center gap-1 cursor-pointer transition"
                  title="Pick images from your My Sets library"
                >
                  <Archive className="w-3 h-3 text-amber-400" />
                  <span>Pick from My Sets</span>
                </button>

                {images.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setImages([])}
                    className="text-[10px] text-zinc-400 hover:text-rose-400 cursor-pointer transition"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />

            {/* Drop / Upload Button Area */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="p-5 border-2 border-dashed border-white/15 rounded-xl text-center cursor-pointer hover:border-[#e5373f] transition space-y-1.5 bg-black/20"
            >
              <Upload className="w-6 h-6 mx-auto text-[#e5373f] opacity-80" />
              <p className="text-xs font-semibold">Click or drag & drop garment photos here</p>
              <p className="text-[10px] text-zinc-400">
                Upload front, back, close-up fabric texture, collar, or embroidery shots (JPEG, PNG, WebP)
              </p>
            </div>

            {/* Selected Images Grid */}
            {images.length > 0 && (
              <div className="space-y-1.5 pt-2">
                <span className="text-[10px] font-bold uppercase text-zinc-400">
                  Ready for AI Inspection ({images.length}):
                </span>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-[220px] overflow-y-auto pr-1 no-scrollbar">
                  {images.map((img) => (
                    <div
                      key={img.id}
                      className="relative group rounded-xl overflow-hidden border border-white/15 bg-black aspect-[3/4]"
                    >
                      <img
                        src={img.url}
                        alt={img.name}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeImage(img.id);
                        }}
                        className="absolute top-1 right-1 p-1 rounded-full bg-black/80 hover:bg-rose-600 text-white opacity-0 group-hover:opacity-100 transition cursor-pointer shadow-md"
                        title="Remove image"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
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
          <div className={`rounded-2xl border p-4 space-y-3 ${isLight ? 'border-gray-200 bg-white shadow-sm' : 'border-zinc-800 bg-[#0e0e12]'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#e5373f] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Description Prompt</span>
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
                💡 <span className="opacity-80">Flexible: Send <b>Images only</b>, <b>Prompt only</b>, or <b>Both</b></span>
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
              onClick={handleGenerate}
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
                  <p className="text-xs font-semibold">Gemini AI Multimodal Analysis in Progress...</p>
                  <p className="text-[11px] text-zinc-400 max-w-sm mx-auto">
                    Inspecting fabric weave, stitching quality, collar design, logos, and athletic silhouette across your photos.
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
                    Upload your product photos on the left and click "Generate Product Description" to start.
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
                          showToast('📋 Copied description!');
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
