import { useEffect, useRef, useState } from 'react';
import {
  UploadCloud,
  CheckCircle2,
  Download,
  RefreshCw,
  AlertCircle,
  Sparkles,
  ShieldAlert,
  Sliders,
  FileVideo,
  Sun,
  Moon,
  ArrowLeft,
  Play,
  Eye,
  Crosshair,
} from 'lucide-react';
import { useTheme } from '../lib/theme';
import { api, type User } from '../lib/api';
import SiteFooter from '../components/SiteFooter';

export function WatermarkRemoverContent({
  user,
  isLight = false,
}: {
  user?: User | null;
  isLight?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  /* Processing States: idle | uploading | processing | done | error */
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [outputMeta, setOutputMeta] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  /* Advanced options */
  const [showOptions, setShowOptions] = useState(false);
  const [crf, setCrf] = useState(18); // 18 is visually lossless master quality
  const [regionMode, setRegionMode] = useState<'auto' | 'landscape' | 'bottom-left' | 'top-right' | 'custom'>('auto');
  const [customRegion, setCustomRegion] = useState('');
  const [viewTab, setViewTab] = useState<'clean' | 'original'>('clean');

  /* Interactive visual watermark box */
  const [videoMeta, setVideoMeta] = useState<{ width: number; height: number } | null>(null);
  const [targetBox, setTargetBox] = useState<{ x: number; y: number; w: number; h: number }>({
    x: 0.76,
    y: 0.69,
    w: 0.22,
    h: 0.125,
  });
  const [boxSize, setBoxSize] = useState<'compact' | 'standard' | 'large'>('standard');
  const [interactiveBox, setInteractiveBox] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    const w = v.videoWidth || 1920;
    const h = v.videoHeight || 1080;
    setVideoMeta({ width: w, height: h });
    if (regionMode === 'auto') {
      if (h > w * 1.2) {
        setTargetBox({ x: 0.76, y: 0.69, w: 0.22, h: 0.125 });
      } else if (w >= h * 1.2) {
        setTargetBox({ x: 0.82, y: 0.80, w: 0.16, h: 0.16 });
      } else {
        setTargetBox({ x: 0.78, y: 0.78, w: 0.18, h: 0.18 });
      }
    }
  };

  const applyPreset = (mode: 'auto' | 'landscape' | 'bottom-left' | 'top-right') => {
    setRegionMode(mode);
    const isVert = videoMeta ? videoMeta.height > videoMeta.width * 1.2 : true;
    let tb = { x: 0.76, y: 0.69, w: 0.22, h: 0.125 };
    if (mode === 'auto') {
      tb = isVert ? { x: 0.76, y: 0.69, w: 0.22, h: 0.125 } : { x: 0.82, y: 0.80, w: 0.16, h: 0.16 };
      setCustomRegion('');
    } else if (mode === 'landscape') {
      tb = { x: 0.82, y: 0.82, w: 0.16, h: 0.15 };
    } else if (mode === 'bottom-left') {
      tb = isVert ? { x: 0.04, y: 0.69, w: 0.22, h: 0.125 } : { x: 0.04, y: 0.80, w: 0.22, h: 0.16 };
    } else if (mode === 'top-right') {
      tb = { x: 0.76, y: 0.04, w: 0.22, h: 0.12 };
    }
    setTargetBox(tb);
    if (mode !== 'auto' && videoMeta) {
      const pxX = Math.round(tb.x * videoMeta.width);
      const pxY = Math.round(tb.y * videoMeta.height);
      const pxW = Math.round(tb.w * videoMeta.width);
      const pxH = Math.round(tb.h * videoMeta.height);
      setCustomRegion(`${pxX},${pxY},${pxW},${pxH}`);
    }
  };

  const handleVideoClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (status !== 'idle' || !interactiveBox) return;
    const wrapperRect = e.currentTarget.parentElement?.getBoundingClientRect() || e.currentTarget.getBoundingClientRect();
    if (wrapperRect.width <= 0 || wrapperRect.height <= 0) return;

    const clickX = e.clientX - wrapperRect.left;
    const clickY = e.clientY - wrapperRect.top;

    const normX = clickX / wrapperRect.width;
    const normY = clickY / wrapperRect.height;

    let bw = 0.22;
    let bh = 0.125;
    if (boxSize === 'compact') {
      bw = 0.16;
      bh = 0.09;
    } else if (boxSize === 'large') {
      bw = 0.28;
      bh = 0.16;
    } else if (videoMeta && videoMeta.width > videoMeta.height * 1.2) {
      bw = 0.18;
      bh = 0.16;
    }

    const leftNorm = Math.max(0.01, Math.min(normX - bw / 2, 0.99 - bw));
    const topNorm = Math.max(0.01, Math.min(normY - bh / 2, 0.99 - bh));

    const newBox = { x: leftNorm, y: topNorm, w: bw, h: bh };
    setTargetBox(newBox);
    setRegionMode('custom');

    if (videoMeta) {
      const pxX = Math.round(leftNorm * videoMeta.width);
      const pxY = Math.round(topNorm * videoMeta.height);
      const pxW = Math.round(bw * videoMeta.width);
      const pxH = Math.round(bh * videoMeta.height);
      setCustomRegion(`${pxX},${pxY},${pxW},${pxH}`);
    } else {
      setCustomRegion(`${Math.round(leftNorm * 100)}%,${Math.round(topNorm * 100)}%,${Math.round(bw * 100)}%,${Math.round(bh * 100)}%`);
    }
  };

  const changeBoxSize = (size: 'compact' | 'standard' | 'large') => {
    setBoxSize(size);
    let bw = 0.22;
    let bh = 0.125;
    if (size === 'compact') {
      bw = 0.16;
      bh = 0.09;
    } else if (size === 'large') {
      bw = 0.28;
      bh = 0.16;
    } else if (videoMeta && videoMeta.width > videoMeta.height * 1.2) {
      bw = 0.18;
      bh = 0.16;
    }
    const newBox = {
      ...targetBox,
      w: bw,
      h: bh,
      x: Math.min(targetBox.x, 0.99 - bw),
      y: Math.min(targetBox.y, 0.99 - bh),
    };
    setTargetBox(newBox);
    setRegionMode('custom');
    if (videoMeta) {
      const pxX = Math.round(newBox.x * videoMeta.width);
      const pxY = Math.round(newBox.y * videoMeta.height);
      const pxW = Math.round(newBox.w * videoMeta.width);
      const pxH = Math.round(newBox.h * videoMeta.height);
      setCustomRegion(`${pxX},${pxY},${pxW},${pxH}`);
    } else {
      setCustomRegion(`${Math.round(newBox.x * 100)}%,${Math.round(newBox.y * 100)}%,${Math.round(bw * 100)}%,${Math.round(bh * 100)}%`);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      selectFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      selectFile(e.target.files[0]);
    }
  };

  const selectFile = (selected: File) => {
    const ext = selected.name.substring(selected.name.lastIndexOf('.')).toLowerCase();
    const allowed = ['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.png', '.jpg', '.jpeg', '.webp'];
    if (!allowed.includes(ext)) {
      setErrorMsg(`Unsupported file type (${ext}). Please select an MP4, MOV, WEBM, MKV, or image file.`);
      return;
    }
    if (selected.size > 400 * 1024 * 1024) {
      setErrorMsg(`File size exceeds 400 MB maximum limit.`);
      return;
    }

    setFile(selected);
    setErrorMsg(null);
    setStatus('idle');
    setProgress(0);
    setJobId(null);
    setOutputMeta(null);
    setVideoMeta(null);
    setTargetBox({ x: 0.76, y: 0.69, w: 0.22, h: 0.125 });
    setCustomRegion('');
    setRegionMode('auto');

    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(URL.createObjectURL(selected));
  };

  const startRemoval = async () => {
    if (!file) return;

    setStatus('uploading');
    setProgress(5);
    setStatusMessage('Uploading video to processing engine…');
    setErrorMsg(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('mode', 'delogo');
    formData.append('crf', String(crf));
    if (regionMode === 'custom' && customRegion.trim()) {
      formData.append('region', customRegion.trim());
    } else if (regionMode === 'landscape') {
      formData.append('region', 'landscape-corner');
    } else if (regionMode === 'bottom-left') {
      formData.append('region', 'bottom-left');
    } else if (regionMode === 'top-right') {
      formData.append('region', 'top-right');
    } else {
      formData.append('region', 'auto');
    }

    try {
      const res = await api.watermarkRemove(formData);
      const newJobId = res?.job_id || (res as any)?.id || (res as any)?.jobId;
      if (!newJobId) {
        setStatus('error');
        setErrorMsg('Failed to initialize processing job. Please try uploading again.');
        return;
      }
      setJobId(newJobId);
      setStatus('processing');
      setStatusMessage('Detecting logo & inpainting clean frames without quality loss…');

      /* Poll job progress with watchdog and consecutive-error recovery */
      let consecutiveErrors = 0;
      const pollStart = Date.now();
      let lastProgress = 12;

      pollIntervalRef.current = setInterval(async () => {
        try {
          // Hard client-side timeout after 5 minutes
          if (Date.now() - pollStart > 300000) {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setStatus('error');
            setErrorMsg('Watermark removal timed out after 5 minutes. Please try again with a smaller file or different preset.');
            return;
          }

          const poll: any = await api.watermarkJobStatus(newJobId);
          if (poll) {
            consecutiveErrors = 0;

            if (poll.status === 'processing') {
              const rawPct = typeof poll.progress === 'number' ? poll.progress : 15;
              lastProgress = Math.max(lastProgress, Math.max(12, Math.min(99, Math.round(rawPct))));
              setProgress(lastProgress);
              setStatusMessage(`Rendering clean frames… ${lastProgress}%`);
            } else if (poll.status === 'queued') {
              setStatusMessage('Processing queue: Inpainting clean frame buffer…');
            } else if (poll.status === 'done') {
              if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
              setProgress(100);
              setStatus('done');
              setStatusMessage('Watermark removed successfully!');
              setOutputMeta(poll.meta || null);
            } else if (poll.status === 'error' || poll.error) {
              if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
              setStatus('error');
              setErrorMsg(poll.error || 'Failed to remove watermark. Please try again.');
            }
          }
        } catch (err: any) {
          // If transient 429 rate limit happens, simply back off and wait for the next poll
          if (err?.status === 429 || String(err?.message || '').includes('429')) {
            return;
          }
          consecutiveErrors++;
          // Tolerate up to 12 consecutive polling ticks (36 seconds) to accommodate dyno initialization or MongoDB replication
          if (consecutiveErrors >= 12) {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setStatus('error');
            setErrorMsg(err?.message || 'Server connection interrupted while processing. Please try again.');
          }
        }
      }, 3000);
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message || 'Failed to start watermark removal service.');
    }
  };

  const resetAll = () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setFile(null);
    setPreviewUrl(null);
    setStatus('idle');
    setProgress(0);
    setJobId(null);
    setOutputMeta(null);
    setErrorMsg(null);
    setVideoMeta(null);
    setTargetBox({ x: 0.76, y: 0.69, w: 0.22, h: 0.125 });
    setCustomRegion('');
    setRegionMode('auto');
    if (inputRef.current) inputRef.current.value = '';
  };

  const downloadCleanVideo = () => {
    if (!jobId) return;
    const url = api.watermarkDownloadUrl(jobId);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clean_${file?.name || 'video.mp4'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const isAccessBlocked = user && user.watermarkAccess === false;

  return (
    <div className="space-y-6 w-full">
      {/* Title Header */}
      <div className="text-center space-y-3 mb-8">
        <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
          <Sparkles size={13} />
          0 Credits Used · 100% Free · Lossless Video Inpainting
        </div>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-medium tracking-tight">
          Remove Video Logo & Watermark
        </h1>
        <p className="mx-auto max-w-2xl text-xs sm:text-sm leading-relaxed opacity-75">
          Upload video in any format (MP4, MOV, MKV, WEBM). Runs on high-speed dedicated FFmpeg without consuming any account credits, Fashn.ai limits, or degrading original 100% resolution, framerate, or audio.
        </p>
      </div>

      {/* Access Restricted Banner if disabled by Admin */}
      {isAccessBlocked ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-8 text-center space-y-4 max-w-lg mx-auto">
          <ShieldAlert size={40} className="mx-auto text-red-500" />
          <h2 className="text-lg font-bold text-red-400">Access Restricted by Administrator</h2>
          <p className="text-xs leading-relaxed opacity-80">
            The Logo Remover feature is currently disabled for your account. Please reach out to your administrator to request activation.
          </p>
          <a
            href="/contact"
            className="inline-flex items-center justify-center rounded-full bg-red-600 px-6 py-2.5 text-xs font-semibold text-white hover:bg-red-500 transition-colors"
          >
            Contact Support
          </a>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Upload Box / Drag & Drop */}
          {!file ? (
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-10 sm:p-14 text-center transition-all ${
                dragActive
                  ? 'border-emerald-500 bg-emerald-500/10 scale-[1.01]'
                  : isLight
                  ? 'border-gray-400/60 bg-white/60 hover:bg-white/90 hover:border-gray-600'
                  : 'border-white/15 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/30'
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept="video/*,image/*,.mp4,.mov,.m4v,.mkv,.webm"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 mb-4 border border-emerald-500/20">
                <UploadCloud size={32} />
              </div>
              <h3 className="text-base sm:text-lg font-semibold tracking-tight">
                Drag & drop video here, or <span className="text-emerald-500 underline underline-offset-4">browse</span>
              </h3>
              <p className="mt-2 text-xs opacity-60">
                Supports MP4, MOV, WEBM, MKV (up to 400 MB). Resolution and audio tracks are 100% preserved.
              </p>
            </div>
          ) : (
            /* Selected Video / Progress / Result View */
            <div
              className={`rounded-2xl border p-6 sm:p-8 space-y-6 transition-colors ${
                isLight ? 'border-gray-300 bg-white/90 shadow-sm' : 'border-white/10 bg-white/[0.03]'
              }`}
            >
              {/* File Info Bar */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    <FileVideo size={20} />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-semibold truncate max-w-[280px] sm:max-w-md">
                      {file.name}
                    </h4>
                    <p className="text-[11px] opacity-60">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB • {file.type || 'Video'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {status === 'idle' && (
                    <button
                      type="button"
                      onClick={() => setShowOptions(!showOptions)}
                      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                        showOptions
                          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-500'
                          : isLight
                          ? 'border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100'
                          : 'border-white/10 bg-white/5 text-white/70 hover:text-white'
                      }`}
                    >
                      <Sliders size={13} />
                      Settings
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={resetAll}
                    disabled={status === 'uploading' || status === 'processing'}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
                      isLight ? 'border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100' : 'border-white/10 bg-white/5 text-white/70 hover:text-white'
                    }`}
                  >
                    Change Video
                  </button>
                </div>
              </div>

              {/* Collapsible Quality / Region Settings */}
              {showOptions && status === 'idle' && (
                <div className={`p-4 rounded-xl border space-y-4 text-xs ${isLight ? 'bg-gray-50 border-gray-200' : 'bg-black/30 border-white/10'}`}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-semibold mb-1 opacity-80">Watermark Position / Preset</label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => applyPreset('auto')}
                          className={`py-1.5 px-2 rounded-lg border text-[11px] font-medium transition text-center ${
                            regionMode === 'auto'
                              ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/40 font-bold'
                              : 'opacity-60 border-transparent hover:opacity-100'
                          }`}
                        >
                          ✨ Auto (AI Star)
                        </button>
                        <button
                          type="button"
                          onClick={() => applyPreset('landscape')}
                          className={`py-1.5 px-2 rounded-lg border text-[11px] font-medium transition text-center ${
                            regionMode === 'landscape'
                              ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/40 font-bold'
                              : 'opacity-60 border-transparent hover:opacity-100'
                          }`}
                        >
                          📐 16:9 Corner
                        </button>
                        <button
                          type="button"
                          onClick={() => applyPreset('bottom-left')}
                          className={`py-1.5 px-2 rounded-lg border text-[11px] font-medium transition text-center ${
                            regionMode === 'bottom-left'
                              ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/40 font-bold'
                              : 'opacity-60 border-transparent hover:opacity-100'
                          }`}
                        >
                          ↙️ Bottom-Left
                        </button>
                        <button
                          type="button"
                          onClick={() => applyPreset('top-right')}
                          className={`py-1.5 px-2 rounded-lg border text-[11px] font-medium transition text-center ${
                            regionMode === 'top-right'
                              ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/40 font-bold'
                              : 'opacity-60 border-transparent hover:opacity-100'
                          }`}
                        >
                          ↗️ Top-Right
                        </button>
                        <button
                          type="button"
                          onClick={() => setRegionMode('custom')}
                          className={`py-1.5 px-2 rounded-lg border text-[11px] font-medium transition text-center col-span-2 ${
                            regionMode === 'custom'
                              ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/40 font-bold'
                              : 'opacity-60 border-transparent hover:opacity-100'
                          }`}
                        >
                          ⚙️ Manual Box (x,y,w,h)
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block font-semibold mb-1 opacity-80">Output Video Quality (CRF)</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="14"
                          max="24"
                          step="1"
                          value={crf}
                          onChange={(e) => setCrf(Number(e.target.value))}
                          className="flex-1 accent-emerald-500"
                        />
                        <span className="font-mono text-emerald-500 font-bold">{crf} {crf <= 18 ? '(Master)' : '(Compact)'}</span>
                      </div>
                    </div>
                  </div>

                  {regionMode === 'custom' && (
                    <div>
                      <label className="block font-semibold mb-1 opacity-80">Coordinates: x, y, width, height (e.g. 370,600,105,95)</label>
                      <input
                        type="text"
                        value={customRegion}
                        onChange={(e) => setCustomRegion(e.target.value)}
                        placeholder="x, y, width, height"
                        className={`w-full rounded-lg px-3 py-1.5 border text-xs font-mono ${
                          isLight ? 'bg-white border-gray-300' : 'bg-black/60 border-white/20'
                        }`}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* View Toggle Bar (Clean Preview vs Original) */}
              {status === 'done' && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
                  <div className="inline-flex items-center rounded-xl p-1 bg-black/40 border border-white/10 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setViewTab('clean')}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition ${
                        viewTab === 'clean'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-white/70 hover:text-white'
                      }`}
                    >
                      <Sparkles size={13} />
                      Clean Video Preview (Watermark Removed)
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewTab('original')}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                        viewTab === 'original'
                          ? 'bg-white/20 text-white shadow-sm'
                          : 'text-white/70 hover:text-white'
                      }`}
                    >
                      <Eye size={13} />
                      Original Video
                    </button>
                  </div>
                  <span className="text-[11px] font-mono text-emerald-400 inline-flex items-center gap-1">
                    <CheckCircle2 size={13} /> Ready to preview and download
                  </span>
                </div>
              )}

              {/* Visual Watermark Target Control Bar (only when idle and file selected) */}
              {status === 'idle' && (
                <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-black/40 border border-white/10 text-xs">
                  <div className="flex items-center gap-2">
                    <Crosshair size={15} className="text-emerald-400 shrink-0" />
                    <span className="font-semibold text-white/90">
                      Watermark Target:
                    </span>
                    <span className="text-[11px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      {regionMode === 'auto' ? '✨ Auto Star Target' : `Box at ${Math.round(targetBox.x * 100)}%, ${Math.round(targetBox.y * 100)}%`}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] opacity-60">Box Size:</span>
                    <div className="inline-flex rounded-lg p-0.5 bg-black/60 border border-white/10">
                      <button
                        type="button"
                        onClick={() => changeBoxSize('compact')}
                        className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                          boxSize === 'compact' ? 'bg-emerald-600 text-white shadow-sm' : 'text-white/60 hover:text-white'
                        }`}
                      >
                        Compact
                      </button>
                      <button
                        type="button"
                        onClick={() => changeBoxSize('standard')}
                        className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                          boxSize === 'standard' ? 'bg-emerald-600 text-white shadow-sm' : 'text-white/60 hover:text-white'
                        }`}
                      >
                        Standard (Star)
                      </button>
                      <button
                        type="button"
                        onClick={() => changeBoxSize('large')}
                        className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                          boxSize === 'large' ? 'bg-emerald-600 text-white shadow-sm' : 'text-white/60 hover:text-white'
                        }`}
                      >
                        Wide
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setInteractiveBox(!interactiveBox)}
                      className={`ml-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition ${
                        interactiveBox ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-white/5 text-white/50 border-white/10'
                      }`}
                    >
                      {interactiveBox ? 'Target Box: Visible' : 'Target Box: Hidden'}
                    </button>
                  </div>
                </div>
              )}

              {/* Video Preview Player */}
              <div className="relative w-full max-h-[520px] min-h-[300px] rounded-xl bg-black/95 flex items-center justify-center p-2 sm:p-3 border border-white/10 shadow-xl overflow-hidden">
                {status === 'done' && jobId ? (
                  viewTab === 'clean' ? (
                    <video
                      key={`clean-video-${jobId}`}
                      src={api.watermarkPreviewUrl(jobId)}
                      controls
                      autoPlay
                      playsInline
                      className="max-h-[480px] max-w-full w-auto h-auto rounded-lg object-contain shadow-2xl block"
                    />
                  ) : previewUrl ? (
                    <video
                      key="original-video-compare"
                      src={previewUrl}
                      controls
                      playsInline
                      className="max-h-[480px] max-w-full w-auto h-auto rounded-lg object-contain shadow-2xl block"
                    />
                  ) : null
                ) : previewUrl ? (
                  <div className="relative inline-flex items-center justify-center max-h-[480px] max-w-full overflow-hidden rounded-lg shadow-2xl">
                    <video
                      ref={videoRef}
                      src={previewUrl}
                      controls
                      playsInline
                      onLoadedMetadata={handleLoadedMetadata}
                      className="max-h-[480px] max-w-full w-auto h-auto block rounded-lg object-contain"
                    />

                    {/* Interactive Watermark Bounding Box Overlay */}
                    {status === 'idle' && interactiveBox && (
                      <div
                        onClick={handleVideoClick}
                        className="absolute inset-x-0 top-0 bottom-11 cursor-crosshair z-10 select-none overflow-hidden group"
                        title="Click directly on the watermark / star in the video to target it"
                      >
                        {/* Target Box with green dashed animated border */}
                        <div
                          style={{
                            left: `${targetBox.x * 100}%`,
                            top: `${targetBox.y * 100}%`,
                            width: `${targetBox.w * 100}%`,
                            height: `${targetBox.h * 100}%`,
                          }}
                          className="absolute border-2 border-dashed border-emerald-400 bg-emerald-500/25 rounded pointer-events-none flex flex-col items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.7)] transition-all duration-150 animate-pulse"
                        >
                          <span className="text-[10px] font-bold text-white bg-emerald-600/90 px-1.5 py-0.5 rounded shadow whitespace-nowrap">
                            ✨ Target Watermark
                          </span>
                        </div>

                        {/* Top floating instruction pill */}
                        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/85 backdrop-blur-md border border-white/20 text-white/90 text-[11px] px-3 py-1 rounded-full pointer-events-none shadow-md flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition whitespace-nowrap">
                          <Crosshair size={12} className="text-emerald-400" />
                          Target box is set on star. Click anywhere on video to reposition.
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}

                {status === 'processing' && (
                  <div className="absolute inset-0 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
                    <RefreshCw size={36} className="text-emerald-500 animate-spin mb-4" />
                    <h4 className="text-base font-semibold text-white">{statusMessage}</h4>
                    <p className="text-xs text-white/60 mt-1 max-w-sm">
                      Preserving 100% video resolution and audio stream...
                    </p>
                    <div className="w-full max-w-xs mt-4 bg-white/10 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full transition-all duration-300 ease-out"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono font-bold text-emerald-400 mt-2">{progress}%</span>
                    <button
                      type="button"
                      onClick={resetAll}
                      className="mt-4 px-4 py-1.5 rounded-full border border-white/20 text-[11px] font-medium text-white/70 hover:text-white hover:border-white/40 bg-white/5 transition"
                    >
                      Cancel Processing
                    </button>
                  </div>
                )}
              </div>

              {/* Status / Output Meta */}
              {outputMeta && (
                <div className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-4 text-xs font-mono ${isLight ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-500" />
                    <span>Resolution: {outputMeta.width}×{outputMeta.height}</span>
                  </div>
                  <span>FPS: {Math.round(outputMeta.fps || 30)}</span>
                  <span>Duration: {Number(outputMeta.duration || 0).toFixed(1)}s</span>
                  <span>Cleaned Box: [{outputMeta.region?.w}×{outputMeta.region?.h}px]</span>
                </div>
              )}

              {/* Error Banner */}
              {errorMsg && (
                <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-500 flex items-center gap-3 text-xs">
                  <AlertCircle size={18} className="shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Primary Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
                {status === 'done' ? (
                  <>
                    <button
                      type="button"
                      onClick={resetAll}
                      className={`w-full sm:w-auto rounded-full border px-5 py-2.5 text-xs font-semibold transition-colors ${
                        isLight ? 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100' : 'border-white/15 bg-white/5 text-white/70 hover:text-white'
                      }`}
                    >
                      Process Another Video
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setViewTab('clean');
                        const v = document.querySelector('video');
                        if (v) v.play().catch(() => {});
                      }}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-5 py-2.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                    >
                      <Play size={14} />
                      Preview Clean Video
                    </button>
                    <button
                      type="button"
                      onClick={downloadCleanVideo}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-7 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-600/20"
                    >
                      <Download size={14} />
                      Download Clean Video
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={startRemoval}
                    disabled={status === 'uploading' || status === 'processing'}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-8 py-3 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors disabled:opacity-50 shadow-lg shadow-emerald-600/20"
                  >
                    {status === 'uploading' || status === 'processing' ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        Processing…
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} />
                        Remove Logo & Watermark
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function RemoveLogo() {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';
  const [me, setMe] = useState<User | null>(null);

  useEffect(() => {
    api.me().then((res) => setMe(res.user)).catch(() => {});
  }, []);

  return (
    <div
      className={`min-h-screen flex flex-col justify-between tracking-[-0.02em] transition-colors ${
        isLight ? 'bg-[#97c1a9] text-slate-900' : 'bg-[#070709] text-white'
      }`}
      style={{ fontFamily: "'JetBrains Mono', monospace" }}
    >
      {/* Top Navbar */}
      <header
        className={`sticky top-0 z-50 border-b backdrop-blur-md transition-colors ${
          isLight ? 'border-gray-300/80 bg-white/80' : 'border-white/10 bg-[#070709]/80'
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-2 group">
              <img src="/brand-mark-white.png" alt="" className="h-4 w-auto" />
              <span className={`text-xs font-semibold tracking-[0.2em] ${isLight ? 'text-gray-900' : 'text-white'}`}>
                SHIV-NARESH
              </span>
            </a>
            <span className="h-4 w-px bg-white/20" aria-hidden="true" />
            <span className="rounded px-2 py-0.5 text-[10px] font-semibold text-[#e5373f] bg-[#e5373f]/10 border border-[#e5373f]/20 uppercase tracking-wider">
              Logo Remover
            </span>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/design"
              className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                isLight ? 'text-slate-800 hover:bg-black/5' : 'text-gray-300 hover:bg-white/10'
              }`}
            >
              Studio
            </a>
            <a
              href="/pricing"
              className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                isLight ? 'text-slate-800 hover:bg-black/5' : 'text-gray-300 hover:bg-white/10'
              }`}
            >
              Pricing
            </a>
            <button
              type="button"
              onClick={toggleTheme}
              className={`rounded-full border p-2 text-xs transition-colors ${
                isLight ? 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100' : 'border-white/10 bg-white/5 text-white/70 hover:text-white'
              }`}
              title="Toggle theme"
            >
              {isLight ? <Moon size={14} /> : <Sun size={14} />}
            </button>
            <a
              href="/"
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                isLight ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-white text-gray-900 hover:bg-gray-100'
              }`}
            >
              <ArrowLeft size={13} />
              Home
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-12 flex-1 w-full">
        <WatermarkRemoverContent user={me} isLight={isLight} />
      </main>

      <SiteFooter />
    </div>
  );
}
