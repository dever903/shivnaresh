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
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Play,
  Pause,
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
  const [regionMode, setRegionMode] = useState<'auto' | 'bottom-right' | 'mid-star' | 'landscape' | 'bottom-left' | 'top-right' | 'custom'>('auto');
  const [customRegion, setCustomRegion] = useState('');
  const [viewTab, setViewTab] = useState<'clean' | 'original'>('clean');

  /* Interactive visual watermark box */
  const [videoMeta, setVideoMeta] = useState<{ width: number; height: number } | null>(null);
  const [targetBox, setTargetBox] = useState<{ x: number; y: number; w: number; h: number }>({
    x: 0.77,
    y: 0.69,
    w: 0.075,
    h: 0.045,
  });
  const [boxSize, setBoxSize] = useState<'tight' | 'standard' | 'wide'>('tight');
  const [interactiveBox, setInteractiveBox] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
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
    setDuration(v.duration || 0);
    if (regionMode === 'auto') {
      if (h > w * 1.2) {
        // Vertical portrait video (Reels/Shorts) - place tight target on star
        setTargetBox({ x: 0.77, y: 0.69, w: 0.075, h: 0.045 });
      } else if (w >= h * 1.2) {
        setTargetBox({ x: 0.82, y: 0.82, w: 0.08, h: 0.06 });
      } else {
        setTargetBox({ x: 0.78, y: 0.82, w: 0.08, h: 0.06 });
      }
    }
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (v) {
      setCurrentTime(v.currentTime);
      setDuration(v.duration || 0);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (v) {
      const time = Number(e.target.value);
      v.currentTime = time;
      setCurrentTime(time);
    }
  };

  const applyPreset = (mode: 'auto' | 'bottom-right' | 'mid-star' | 'landscape' | 'bottom-left' | 'top-right') => {
    setRegionMode(mode);
    const isVert = videoMeta ? videoMeta.height > videoMeta.width * 1.2 : true;
    let tb = { x: 0.77, y: 0.69, w: 0.075, h: 0.045 };
    if (mode === 'bottom-right') {
      tb = { x: 0.78, y: 0.83, w: 0.075, h: 0.045 };
    } else if (mode === 'mid-star') {
      tb = { x: 0.77, y: 0.69, w: 0.075, h: 0.045 };
    } else if (mode === 'auto') {
      tb = isVert ? { x: 0.77, y: 0.69, w: 0.075, h: 0.045 } : { x: 0.82, y: 0.82, w: 0.08, h: 0.06 };
      setCustomRegion('');
    } else if (mode === 'landscape') {
      tb = { x: 0.82, y: 0.82, w: 0.08, h: 0.06 };
    } else if (mode === 'bottom-left') {
      tb = { x: 0.03, y: 0.83, w: 0.075, h: 0.045 };
    } else if (mode === 'top-right') {
      tb = { x: 0.77, y: 0.03, w: 0.075, h: 0.045 };
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

  const nudgeBox = (dx: number, dy: number) => {
    const newBox = {
      ...targetBox,
      x: Math.max(0.005, Math.min(targetBox.x + dx, 0.995 - targetBox.w)),
      y: Math.max(0.005, Math.min(targetBox.y + dy, 0.995 - targetBox.h)),
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
      setCustomRegion(`${Math.round(newBox.x * 100)}%,${Math.round(newBox.y * 100)}%,${Math.round(newBox.w * 100)}%,${Math.round(newBox.h * 100)}%`);
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

    let bw = 0.075;
    let bh = 0.045;
    if (boxSize === 'tight') {
      bw = 0.065;
      bh = 0.04;
    } else if (boxSize === 'wide') {
      bw = 0.11;
      bh = 0.07;
    } else if (boxSize === 'standard') {
      bw = 0.085;
      bh = 0.055;
    }

    const leftNorm = Math.max(0.005, Math.min(normX - bw / 2, 0.995 - bw));
    const topNorm = Math.max(0.005, Math.min(normY - bh / 2, 0.995 - bh));

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

  const changeBoxSize = (size: 'tight' | 'standard' | 'wide') => {
    setBoxSize(size);
    let bw = 0.065;
    let bh = 0.04;
    if (size === 'standard') {
      bw = 0.085;
      bh = 0.055;
    } else if (size === 'wide') {
      bw = 0.11;
      bh = 0.07;
    }
    const newBox = {
      ...targetBox,
      w: bw,
      h: bh,
      x: Math.min(targetBox.x, 0.995 - bw),
      y: Math.min(targetBox.y, 0.995 - bh),
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
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setTargetBox({ x: 0.77, y: 0.69, w: 0.075, h: 0.045 });
    setBoxSize('tight');
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
    } else if (regionMode === 'bottom-right') {
      formData.append('region', 'bottom-right');
    } else if (regionMode === 'mid-star') {
      formData.append('region', 'mid-star');
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
      let lastAdvanceTime = Date.now();

      pollIntervalRef.current = setInterval(async () => {
        try {
          const now = Date.now();
          // Dynamic stall watchdog: only times out if NO progress has been made for 6 minutes,
          // OR if total job time exceeds 25 minutes.
          if (now - lastAdvanceTime > 360000 || now - pollStart > 1500000) {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setStatus('error');
            setErrorMsg('Watermark removal took longer than expected. Please click "Remove Logo & Watermark"to retry or try a shorter clip.');
            return;
          }

          const poll: any = await api.watermarkJobStatus(newJobId);
          if (poll) {
            consecutiveErrors = 0;

            if (poll.status === 'processing') {
              const rawPct = typeof poll.progress === 'number' ? poll.progress : 15;
              const targetPct = Math.max(lastProgress, Math.min(99, Math.round(rawPct)));
              if (targetPct > lastProgress) {
                lastProgress = targetPct;
                lastAdvanceTime = Date.now();
              } else if (lastProgress < 95) {
                // Gently advance progress so UI stays responsive while the server encodes frames
                lastProgress = Math.min(95, lastProgress + 1);
              }
              setProgress(lastProgress);
              setStatusMessage(`Rendering clean frames… ${lastProgress}%`);
            } else if (poll.status === 'queued') {
              if (lastProgress < 15) {
                lastProgress += 1;
                setProgress(lastProgress);
              }
              setStatusMessage('Inpainting clean frame buffer…');
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
          // Tolerate up to 20 consecutive polling ticks (60 seconds) to accommodate dyno initialization or MongoDB replication
          if (consecutiveErrors >= 20) {
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
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setTargetBox({ x: 0.77, y: 0.69, w: 0.075, h: 0.045 });
    setBoxSize('tight');
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
        <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest border ${
          isLight
            ? 'bg-emerald-900/10 text-emerald-950 border-emerald-900/25'
            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
        }`}>
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
              role="button"
              tabIndex={0}
              aria-label="Upload video or image file"
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  inputRef.current?.click();
                }
              }}
              className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-8 sm:p-14 text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 motion-reduce:transition-none ${
                dragActive
                  ? 'border-emerald-500 bg-emerald-500/10 scale-[1.01] motion-reduce:scale-100'
                  : isLight
                  ? 'border-gray-500/60 bg-white/75 hover:bg-white/95 hover:border-gray-700'
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
              <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full mb-4 border ${
                isLight ? 'bg-emerald-600/15 text-emerald-800 border-emerald-700/25' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              }`}>
                <UploadCloud size={32} />
              </div>
              <h3 className="text-base sm:text-lg font-semibold tracking-tight">
                Drag & drop video here, or <span className={`underline underline-offset-4 ${isLight ? 'text-emerald-800' : 'text-emerald-400'}`}>browse</span>
              </h3>
              <p className="mt-2 text-xs opacity-70">
                Supports MP4, MOV, WEBM, MKV (up to 400 MB). Resolution and audio tracks are 100% preserved.
              </p>
            </div>
          ) : (
            /* Selected Video / Progress / Result View */
            <div
              className={`rounded-2xl border p-4 sm:p-8 space-y-6 transition-colors ${
                isLight ? 'border-gray-300 bg-white/90 shadow-sm' : 'border-white/10 bg-white/[0.03]'
              }`}
            >
              {/* File Info Bar */}
              <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b ${
                isLight ? 'border-gray-200' : 'border-white/10'
              }`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                    <FileVideo size={20} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs sm:text-sm font-semibold truncate max-w-[200px] sm:max-w-md">
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
                      className={`key-press flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                        showOptions
                          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600'
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
                    className={`key-press rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                      isLight ? 'border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100' : 'border-white/10 bg-white/5 text-white/70 hover:text-white'
                    }`}
                  >
                    Change Video
                  </button>
                </div>
              </div>

              {/* Collapsible Quality / Region Settings */}
              {showOptions && status === 'idle' && (
                <div className={`p-4 rounded-xl border space-y-4 text-xs ${isLight ? 'bg-gray-50 border-gray-200' : 'edge-light bg-[var(--ink-1,#141418)] border-white/10'}`}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-semibold mb-1 opacity-80">Watermark Position / Preset</label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => applyPreset('bottom-right')}
                          className={`key-press py-1.5 px-2 rounded-lg border text-[11px] font-medium transition text-center ${
                            regionMode === 'bottom-right' || regionMode === 'auto'
                              ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/40 font-bold'
                              : 'opacity-60 border-transparent hover:opacity-100'
                          }`}
                        >
                          ⭐ Bottom-Right Star
                        </button>
                        <button
                          type="button"
                          onClick={() => applyPreset('mid-star')}
                          className={`key-press py-1.5 px-2 rounded-lg border text-[11px] font-medium transition text-center ${
                            regionMode === 'mid-star'
                              ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/40 font-bold'
                              : 'opacity-60 border-transparent hover:opacity-100'
                          }`}
                        >
                           Mid-Lower Star
                        </button>
                        <button
                          type="button"
                          onClick={() => applyPreset('landscape')}
                          className={`key-press py-1.5 px-2 rounded-lg border text-[11px] font-medium transition text-center ${
                            regionMode === 'landscape'
                              ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/40 font-bold'
                              : 'opacity-60 border-transparent hover:opacity-100'
                          }`}
                        >
                           16:9 Corner
                        </button>
                        <button
                          type="button"
                          onClick={() => applyPreset('bottom-left')}
                          className={`key-press py-1.5 px-2 rounded-lg border text-[11px] font-medium transition text-center ${
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
                          className={`key-press py-1.5 px-2 rounded-lg border text-[11px] font-medium transition text-center ${
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
                          className={`key-press py-1.5 px-2 rounded-lg border text-[11px] font-medium transition text-center ${
                            regionMode === 'custom'
                              ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/40 font-bold'
                              : 'opacity-60 border-transparent hover:opacity-100'
                          }`}
                        >
                           Manual Box
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
                  <div className="flex flex-wrap items-center gap-2">
                    <Crosshair size={15} className="text-emerald-400 shrink-0" />
                    <span className="font-semibold text-white/90">
                      Target Watermark:
                    </span>
                    <button
                      type="button"
                      onClick={() => applyPreset('bottom-right')}
                      className={`key-press px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                        regionMode === 'bottom-right' || regionMode === 'auto'
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-sm'
                          : 'bg-white/5 text-white/70 border-white/10 hover:text-white'
                      }`}
                    >
                      ⭐ Bottom-Right Star
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('mid-star')}
                      className={`key-press px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                        regionMode === 'mid-star'
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-sm'
                          : 'bg-white/5 text-white/70 border-white/10 hover:text-white'
                      }`}
                    >
                       Mid-Lower Star
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] opacity-60">Box Size:</span>
                    <div className="inline-flex rounded-lg p-0.5 bg-black/60 border border-white/10">
                      <button
                        type="button"
                        onClick={() => changeBoxSize('tight')}
                        className={`key-press px-2.5 py-1 rounded text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                          boxSize === 'tight' ? 'bg-emerald-600 text-white shadow-sm font-bold' : 'text-white/60 hover:text-white'
                        }`}
                      >
                        ⭐ Tight (Zero Blur)
                      </button>
                      <button
                        type="button"
                        onClick={() => changeBoxSize('standard')}
                        className={`key-press px-2.5 py-1 rounded text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                          boxSize === 'standard' ? 'bg-emerald-600 text-white shadow-sm font-bold' : 'text-white/60 hover:text-white'
                        }`}
                      >
                        Standard
                      </button>
                      <button
                        type="button"
                        onClick={() => changeBoxSize('wide')}
                        className={`key-press px-2.5 py-1 rounded text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                          boxSize === 'wide' ? 'bg-emerald-600 text-white shadow-sm font-bold' : 'text-white/60 hover:text-white'
                        }`}
                      >
                        Wide
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setInteractiveBox(!interactiveBox)}
                      className={`key-press ml-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                        interactiveBox ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-white/5 text-white/50 border-white/10'
                      }`}
                    >
                      {interactiveBox ? 'Target Box: Visible' : 'Target Box: Hidden'}
                    </button>
                  </div>
                </div>
              )}

              {/* Video Preview Player (Controls removed from video so buttons NEVER overlap the watermark) */}
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
                      controls={false}
                      playsInline
                      onLoadedMetadata={handleLoadedMetadata}
                      onTimeUpdate={handleTimeUpdate}
                      onEnded={() => setIsPlaying(false)}
                      className="max-h-[480px] max-w-full w-auto h-auto block rounded-lg object-contain cursor-crosshair"
                    />

                    {/* Interactive Watermark Bounding Box Overlay with ZERO bottom dead-zone */}
                    {status === 'idle' && interactiveBox && (
                      <div
                        onClick={handleVideoClick}
                        className="absolute inset-0 cursor-crosshair z-10 select-none overflow-hidden group"
                        title="Click directly on the watermark / star in the video to target it"
                      >
                        {/* Crisp interactive crosshair lock frame */}
                        <div
                          style={{
                            left: `${targetBox.x * 100}%`,
                            top: `${targetBox.y * 100}%`,
                            width: `${targetBox.w * 100}%`,
                            height: `${targetBox.h * 100}%`,
                          }}
                          className="absolute border-2 border-dashed border-emerald-400 bg-emerald-500/20 rounded pointer-events-none flex flex-col items-center justify-center shadow-[0_0_16px_rgba(16,185,129,0.55)] transition-all duration-150 motion-reduce:transition-none"
                        >
                          <span className="pointer-events-none absolute -top-1 -left-1 h-2 w-2 border-t-2 border-l-2 border-white"aria-hidden="true" />
                          <span className="pointer-events-none absolute -top-1 -right-1 h-2 w-2 border-t-2 border-r-2 border-white"aria-hidden="true" />
                          <span className="pointer-events-none absolute -bottom-1 -left-1 h-2 w-2 border-b-2 border-l-2 border-white"aria-hidden="true" />
                          <span className="pointer-events-none absolute -bottom-1 -right-1 h-2 w-2 border-b-2 border-r-2 border-white"aria-hidden="true" />
                          <span className="text-[10px] font-bold text-white bg-emerald-600/95 px-1.5 py-0.5 rounded shadow whitespace-nowrap">
                            Target Lock
                          </span>
                        </div>

                        {/* Top floating instruction pill */}
                        <div className="absolute top-2 left-1/2 -translate-x-1/2 max-w-[calc(100%-1rem)] truncate bg-black/85 backdrop-blur-md border border-white/20 text-white/90 text-[11px] px-3 py-1 rounded-full pointer-events-none shadow-md flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition">
                          <Crosshair size={12} className="text-emerald-400 shrink-0" />
                          <span className="truncate">Click directly on watermark to lock box.</span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}

                {status === 'processing' && (
                  <div className="absolute inset-0 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-20">
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

              {/* Clean External Video Playback Bar (Zero overlap on video pixels) */}
              {status === 'idle' && previewUrl && (
                <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-black/60 border border-white/10 text-xs">
                  <div className="flex items-center gap-2.5 flex-1 min-w-[200px]">
                    <button
                      type="button"
                      onClick={togglePlay}
                      className="flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition shrink-0 shadow-md"
                      title={isPlaying ? 'Pause' : 'Play video'}
                    >
                      {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                    <span className="font-mono text-[11px] opacity-75 shrink-0 min-w-[70px]">
                      {Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, '0')} / {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={duration || 100}
                      step={0.05}
                      value={currentTime}
                      onChange={handleSeek}
                      className="flex-1 accent-emerald-500 cursor-pointer h-1.5 rounded bg-white/20"
                      title="Scrub video timeline"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[11px] opacity-60 mr-1 hidden sm:inline">Nudge Target Box:</span>
                    <div className="flex items-center gap-1 bg-white/5 p-1 rounded-lg border border-white/10">
                      <button
                        type="button"
                        onClick={() => nudgeBox(-0.02, 0)}
                        className="h-6 w-6 flex items-center justify-center rounded bg-white/10 hover:bg-white/20 text-white transition"
                        title="Nudge box Left"
                      >
                        <ArrowLeft size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => nudgeBox(0, -0.02)}
                        className="h-6 w-6 flex items-center justify-center rounded bg-white/10 hover:bg-white/20 text-white transition"
                        title="Nudge box Up"
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => nudgeBox(0, 0.02)}
                        className="h-6 w-6 flex items-center justify-center rounded bg-white/10 hover:bg-white/20 text-white transition"
                        title="Nudge box Down"
                      >
                        <ArrowDown size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => nudgeBox(0.02, 0)}
                        className="h-6 w-6 flex items-center justify-center rounded bg-white/10 hover:bg-white/20 text-white transition"
                        title="Nudge box Right"
                      >
                        <ArrowRight size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

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
                    className="key-press w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-8 py-3 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors disabled:opacity-50 shadow-lg shadow-emerald-600/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
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
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    api.me().then((res) => setMe(res.user)).catch(() => {});
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const items = Array.from(document.querySelectorAll<HTMLElement>('.stagger-item'));
    if (!items.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || typeof IntersectionObserver === 'undefined') {
      items.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08 }
    );
    items.forEach((el, idx) => {
      el.style.transitionDelay = `${idx * 45}ms`;
      obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  return (
    <div
      className={`min-h-screen overflow-x-hidden flex flex-col justify-between tracking-[-0.02em] transition-colors ${
        isLight ? 'bg-[#B1A38E] text-[#F5F2EC]' : 'bg-[var(--ink-0,#0C0C0E)] text-[var(--text-hi,#F5F2EC)]'
      }`}
    >
      {/* Top Navbar */}
      <header
        className={`sticky top-0 z-50 border-b transition-all duration-200 ${
          isLight
            ? scrolled
              ? 'border-gray-400/70 bg-white/92 backdrop-blur-xl shadow-sm'
              : 'border-gray-300/80 bg-white/80 backdrop-blur-md'
            : scrolled
            ? 'edge-light border-white/20 bg-[var(--ink-0,#0C0C0E)]/92 backdrop-blur-xl shadow-lg'
            : 'edge-light border-white/10 bg-[var(--ink-0,#0C0C0E)]/80 backdrop-blur-md'
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <a
              href="/"
              data-cursor="OPEN"
              className="flex items-center gap-2 group shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent,#C9A468)]"
            >
              <img
                src={isLight ? '/brand-mark-black.png' : '/brand-mark-white.png'}
                alt=""
                onError={(e) => {
                  const img = e.currentTarget;
                  if (img.src.endsWith('/brand-mark-black.png')) {
                    img.src = '/brand-mark.png';
                  } else {
                    img.src = '/brand-mark-white.png';
                  }
                }}
                className="h-4 w-auto shrink-0"
              />
              <span className={`whitespace-nowrap text-[11px] sm:text-xs font-semibold tracking-[0.14em] sm:tracking-[0.2em] ${isLight ? 'text-gray-900' : 'text-[var(--text-hi,#F5F2EC)]'}`}>
                SHIV-NARESH
              </span>
            </a>
            <span className={`hidden sm:inline-block h-4 w-px shrink-0 ${isLight ? 'bg-gray-300' : 'bg-white/20'}`} aria-hidden="true" />
            <span className={`shrink-0 whitespace-nowrap rounded px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider border ${
              isLight ? 'text-[#e5373f] bg-[#e5373f]/10 border-[#e5373f]/20' : 'text-[var(--accent,#C9A468)] bg-[var(--accent,#C9A468)]/10 border-[var(--accent,#C9A468)]/25'
            }`}>
              Logo Remover
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <a
              href="/design"
              data-cursor="DESIGN"
              className={`link-border-draw hidden sm:inline-block text-xs font-medium px-3 py-1.5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent,#C9A468)] ${
                isLight ? 'text-slate-800 hover:bg-black/5' : 'text-gray-300 hover:bg-white/10'
              }`}
            >
              Studio
            </a>
            <a
              href="/pricing"
              data-cursor="OPEN"
              className={`link-border-draw hidden sm:inline-block text-xs font-medium px-3 py-1.5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent,#C9A468)] ${
                isLight ? 'text-slate-800 hover:bg-black/5' : 'text-gray-300 hover:bg-white/10'
              }`}
            >
              Pricing
            </a>
            <button
              type="button"
              onClick={toggleTheme}
              className={`key-press rounded-full border p-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent,#C9A468)] ${
                isLight ? 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100' : 'border-white/10 bg-white/5 text-white/70 hover:text-white'
              }`}
              title="Toggle theme"
            >
              {isLight ? <Moon size={14} /> : <Sun size={14} />}
            </button>
            <a
              href="/"
              data-cursor="OPEN"
              className={`btn-fill-swipe key-press flex items-center gap-1.5 rounded-full px-3 sm:px-4 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent,#C9A468)] ${
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
      <main className="stagger-item mx-auto max-w-4xl px-4 sm:px-6 py-12 flex-1 w-full">
        <WatermarkRemoverContent user={me} isLight={isLight} />
      </main>

      <SiteFooter />
    </div>
  );
}
