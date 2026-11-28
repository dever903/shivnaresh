import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Design from './pages/Design';
import RemoveLogo from './pages/RemoveLogo';
import Admin from './pages/Admin';
import Login from './pages/Login';
import Pricing from './pages/Pricing';
import About from './pages/About';
import Contact from './pages/Contact';
import Terms from './pages/Terms';
import SiteFooter from './components/SiteFooter';
import { CustomCursor } from './components/CustomCursor';
import { useTheme, ThemeToggle } from './lib/theme';
import { api } from './lib/api';

/* ------------------------------------------------------------------ */
/* Assets                                                             */
/* Portraits mirrored into /public so the build never depends on the  */
/* image proxy. Originals:                                            */
/* BG_IMAGE_1 https://images.higgs.ai/?...hf_20260609_125121_...png */
/* BG_IMAGE_2 https://images.higgs.ai/?...hf_20260609_135737_...png */
/* ------------------------------------------------------------------ */
const BG_IMAGE_1 = "url('/hero-base.jpg')";
const BG_IMAGE_2 = "url('/hero-reveal.jpg')";

const BRAND_MARK = '/brand-mark-white.png';

const NAV_LINKS = [
  { key: 'home', label: 'Home', href: '/' },
  { key: 'design', label: 'Design', href: '/design' },
  { key: 'removeLogo', label: 'Remove Logo', href: '/remove-logo' },
  { key: 'pricing', label: 'Pricing', href: '/pricing' },
  { key: 'about', label: 'About', href: '/about' },
  { key: 'contact', label: 'Contact', href: '/contact' },
  { key: 'terms', label: 'Terms', href: '/terms' },
] as const;

/* Chest branding — wearer's left chest, in *image* coordinates.
   Percentages resolve against the 16:9 stage below, not the viewport, so the
   mark stays on the pectoral however `cover`crops the portrait. */
const CHEST = { left: '62.5%', top: '92%' };

/* Intro reveal: the whole face goes cyberpunk for a beat, then falls back to
   the cursor spotlight. Seconds, matched by the sound design below. */
const INTRO = { grow: 1.7, hold: 3.2, out: 4.8 };

/* A box that always matches what `background-size: cover`would show, so that
   anything anchored inside it moves with the photograph, not the viewport. */
const STAGE: CSSProperties = {
  width: 'max(100%, calc(100dvh * 16 / 9))',
  aspectRatio: '16 / 9',
};

/* ------------------------------------------------------------------ */
/* Brand                                                              */
/* ------------------------------------------------------------------ */
function Brand({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const mark = size === 'sm' ? 'h-[13px]' : 'h-[16px]';
  const label = size === 'sm' ? 'text-[10px]' : 'text-[11px]';
  return (
    <span className="flex items-center gap-2">
      <img src={BRAND_MARK} alt=""className={`${mark} w-auto`} draggable={false} />
      <span className={`${label} font-semibold tracking-[0.2em] text-white`}>SHIV-NARESH</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Navbar — two panels only                                           */
/* ------------------------------------------------------------------ */
function NavBar() {
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const active = typeof window === 'undefined' ? '/' : window.location.pathname.replace(/\/$/, '') || '/';
  const navGroupRef = useRef<HTMLDivElement | null>(null);
  const linkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  const [headerLinks, setHeaderLinks] = useState<Record<string, boolean>>(() => {
    try {
      const cached = localStorage.getItem('cached_header_links');
      if (cached) return JSON.parse(cached);
    } catch { }
    return { home: true, design: true, removeLogo: true, pricing: true, about: true, contact: true, terms: true, startDesign: true };
  });

  useEffect(() => {
    api.studio().then((s) => {
      if (s?.headerLinks && typeof s.headerLinks === 'object') {
        setHeaderLinks(s.headerLinks);
        try { localStorage.setItem('cached_header_links', JSON.stringify(s.headerLinks)); } catch { }
      }
    }).catch(() => { });
  }, []);

  const visibleNavLinks = NAV_LINKS.filter((l) => headerLinks[l.key] !== false);
  const showStartDesign = headerLinks.startDesign !== false;

  useEffect(() => {
    const updateIndicator = () => {
      const group = navGroupRef.current;
      const activeEl = linkRefs.current[active];
      if (!group || !activeEl) {
        setIndicator(null);
        return;
      }
      setIndicator({
        left: activeEl.offsetLeft,
        width: activeEl.offsetWidth,
      });
    };
    updateIndicator();
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [active]);

  return (
    <>
      <nav className="nav-drop fixed top-0 left-0 right-0 z-50 flex items-center justify-between lg:justify-center p-4 sm:p-5">
        {/* Desktop: one centered pill */}
        <div className="hidden lg:flex items-center gap-1 bg-black/60 backdrop-blur-md rounded-full pl-3 pr-2 py-2">
          <a href="/"className="flex items-center rounded-full pr-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
            <Brand />
          </a>
          <span className="mr-1 h-4 w-px bg-white/20"aria-hidden="true" />
          <div ref={navGroupRef} className="relative flex items-center gap-1">
            {indicator && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 rounded-full bg-white/15 transition-all duration-300 ease-[cubic-bezier(.22,.61,.36,1)] motion-reduce:transition-none"
                style={{ left: indicator.left, width: indicator.width }}
              />
            )}
            {visibleNavLinks.map((link) => {
              const isCurrent = active === (link.href === '/' ? '/' : link.href);
              return (
                <a
                  key={link.label}
                  ref={(el) => { linkRefs.current[link.href] = el; }}
                  href={link.href}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={
                    isCurrent
                      ? 'relative z-10 text-[#F5F0E7] text-sm font-semibold px-3 py-1.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent,#C9A468)]'
                      : 'relative z-10 text-[#F5F0E7]/85 text-sm font-medium px-3 py-1.5 rounded-full hover:bg-white/10 hover:text-[#E7CFA4] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent,#C9A468)]'
                  }
                >
                  <span className="text-swap">
                    <span className="text-swap-primary">{link.label}</span>
                    <span className="text-swap-secondary"aria-hidden="true">{link.label}</span>
                  </span>
                </a>
              );
            })}
          </div>
          {showStartDesign && (
            <a
              href="/design"
              className={`btn-fill-swipe text-sm font-semibold px-5 py-1.5 rounded-full ml-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent,#C9A468)] ${
                theme === 'light' ? 'bg-[#F5F0E7] text-[#1A1408]' : 'bg-[var(--text-hi,#F5F2EC)] text-[var(--ink-0,#0C0C0E)]'
              }`}
            >
              Start design
            </a>
          )}
          <div className="ml-2">
            <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          </div>
        </div>

        {/* Mobile: brand pill */}
        <a href="#home"className="lg:hidden flex items-center bg-black/60 backdrop-blur-md rounded-full px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent,#C9A468)]">
          <Brand size="sm" />
        </a>

        {/* Mobile: toggle pill (6.15 Icon morph) */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          className="lg:hidden flex items-center justify-center bg-black/60 backdrop-blur-md rounded-full p-2.5 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent,#C9A468)]"
        >
          <span className={`icon-morph-bars ${open ? 'is-open' : ''}`} aria-hidden="true">
            <span className="icon-morph-bar" />
            <span className="icon-morph-bar" />
            <span className="icon-morph-bar" />
          </span>
        </button>
      </nav>

      {open && (
        <div className={`nav-drop fixed top-0 left-0 right-0 z-40 w-full pt-16 pb-6 px-5 shadow-lg md:hidden ${
          theme === 'light' ? 'bg-[#263B32] text-[#F5F0E7] border-b border-[#C9A468]/30' : 'edge-light bg-[var(--ink-1,#141418)] text-[var(--text-hi,#F5F2EC)] border-b border-white/10'
        }`}>
          {visibleNavLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              aria-current={active === (link.href === '/' ? '/' : link.href) ? 'page' : undefined}
              onClick={() => setOpen(false)}
              className={`block w-full text-left py-3 border-b transition-colors focus-visible:outline-none focus-visible:ring-2 ${
                theme === 'light'
                  ? 'text-slate-900 border-slate-900/15 hover:text-black focus-visible:ring-slate-900'
                  : 'text-white/90 border-white/10 hover:text-white focus-visible:ring-white/70'
              }`}
            >
              {link.label}
            </a>
          ))}
          {showStartDesign && (
            <a
              href="/design"
              onClick={() => setOpen(false)}
              className="mt-5 block w-full text-center bg-gray-900 text-white text-sm font-semibold px-5 py-3 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Start design
            </a>
          )}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Stats on fading arc                                                */
/* ------------------------------------------------------------------ */
const ARC_CENTER = { x: -110, y: 300 };
const RAD = Math.PI / 180;

type ArcSpec = { r: number; from: number; to: number; dot: number; value: string; label: string };

const ARCS: ArcSpec[] = [
  { r: 330, from: -92, to: 16, dot: -46, value: '10+', label: 'Years kitting' },
  { r: 395, from: -56, to: 60, dot: 2, value: '40+', label: 'Kit templates' },
  { r: 460, from: -14, to: 72, dot: 44, value: '95%', label: 'Repeat clubs' },
];

const polar = (r: number, deg: number) => ({
  x: ARC_CENTER.x + r * Math.cos(deg * RAD),
  y: ARC_CENTER.y + r * Math.sin(deg * RAD),
});

function StatsArc() {
  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 z-50 hidden sm:block">
      <svg
        viewBox="0 0 380 700"
        preserveAspectRatio="xMaxYMid meet"
        className="h-full w-auto max-w-[52vw]"
        aria-hidden="true"
      >
        <defs>
          {ARCS.map((arc, i) => {
            const start = polar(arc.r, arc.from);
            const end = polar(arc.r, arc.to);
            return (
              <linearGradient
                key={`grad-${i}`}
                id={`arc-grad-${i}`}
                gradientUnits="userSpaceOnUse"
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
              >
                <stop offset="0%"stopColor="#ffffff"stopOpacity="0" />
                <stop offset="22%"stopColor="#ffffff"stopOpacity="0.5" />
                <stop offset="55%"stopColor="#ffffff"stopOpacity="0.5" />
                <stop offset="85%"stopColor="#ffffff"stopOpacity="0.1" />
                <stop offset="100%"stopColor="#ffffff"stopOpacity="0" />
              </linearGradient>
            );
          })}
        </defs>

        {/* Arcs */}
        {ARCS.map((arc, i) => {
          const start = polar(arc.r, arc.from);
          const end = polar(arc.r, arc.to);
          const len = arc.r * ((arc.to - arc.from) * RAD);
          const style = {
            '--len': len.toFixed(2),
            animationDelay: `${(0.4 + i * 0.22).toFixed(2)}s`,
          } as CSSProperties;
          return (
            <path
              key={`arc-${i}`}
              className="arc-line"
              style={style}
              d={`M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${arc.r} ${arc.r} 0 0 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`}
              fill="none"
              stroke={`url(#arc-grad-${i})`}
              strokeWidth={1.1}
            />
          );
        })}

        {/* Marks + readouts */}
        {ARCS.map((arc, i) => {
          const p = polar(arc.r, arc.dot);
          const lineDelay = 0.4 + i * 0.22;
          const markDelay = lineDelay + 0.9;
          const match = arc.value.match(/^([\d.]+)(.*)$/);
          const digits = match?.[1] ?? arc.value;
          const suffix = match?.[2] ?? '';

          return (
            <g key={`mark-${i}`}>
              <circle
                className="arc-dot"
                style={{ animationDelay: `${markDelay.toFixed(2)}s` }}
                cx={p.x}
                cy={p.y}
                r={3.4}
                fill="#ffffff"
              />
              <circle
                className="arc-ring"
                style={{ animationDelay: `${(markDelay + 0.3).toFixed(2)}s` }}
                cx={p.x}
                cy={p.y}
                r={7}
                fill="none"
                stroke="#ffffff"
                strokeOpacity={0.35}
                strokeWidth={1}
              />
              <text
                className="arc-text"
                style={{ animationDelay: `${(markDelay + 0.15).toFixed(2)}s` }}
                x={p.x + 16}
                y={p.y + 4}
                fill="#ffffff"
                fontSize={32}
                letterSpacing={-1}
              >
                {digits}
                {suffix ? (
                  <tspan fontSize={19} dy={-10}>
                    {suffix}
                  </tspan>
                ) : null}
              </text>
              <text
                className="arc-text"
                style={{ animationDelay: `${(markDelay + 0.3).toFixed(2)}s` }}
                x={p.x + 18}
                y={p.y + 22}
                fill="#ffffff"
                fillOpacity={0.8}
                fontSize={8.5}
                fontWeight={600}
                letterSpacing={2}
              >
                {arc.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chest branding                                                     */
/* ------------------------------------------------------------------ */
function ChestBadge() {
  // Below `lg`the portrait is cropped so tight that the chest sits behind the
  // headline — the nav carries the brand there instead.
  return (
    <div className="pointer-events-none absolute inset-0 z-40 hidden select-none lg:block"aria-hidden="true">
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"style={STAGE}>
        <div
          className="absolute"
          style={{
            left: CHEST.left,
            top: CHEST.top,
            transform: 'translate(-50%, -50%) rotate(-1.2deg)',
          }}
        >
          <div className="flex items-center gap-[6px] text-white/90">
            <img
              src={BRAND_MARK}
              alt=""
              className="h-[clamp(9px,0.95vw,13px)] w-auto opacity-90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]"
              draggable={false}
            />
            <span
              className="font-medium leading-none text-[clamp(7px,0.82vw,11px)] tracking-wider drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]"
              style={{ paddingRight: '0.1em' }}
            >
              Shiv-Naresh
            </span>
          </div>
          <div className="mt-[5px] h-px w-full bg-white/20" />
          <p
            className="mt-[4px] text-[clamp(5px,0.56vw,7.5px)] font-normal leading-none tracking-wider text-white/70"
          >
            Custom sportswear
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 6.9 Scramble / decode micro-label (400ms settle)                   */
/* ------------------------------------------------------------------ */
const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function ScrambleLabel({ text }: { text: string }) {
  const [display, setDisplay] = useState(text);
  const rafRef = useRef<number>(0);

  const trigger = () => {
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(text);
      return;
    }
    window.cancelAnimationFrame(rafRef.current);
    const start = performance.now();
    const duration = 400;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const settled = Math.floor(progress * text.length);
      let next = '';
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === ' ' || i < settled) {
          next += ch;
        } else {
          next += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
        }
      }
      setDisplay(next);
      if (progress < 1) {
        rafRef.current = window.requestAnimationFrame(tick);
      } else {
        setDisplay(text);
      }
    };

    rafRef.current = window.requestAnimationFrame(tick);
  };

  useEffect(() => {
    trigger();
    return () => window.cancelAnimationFrame(rafRef.current);
  }, [text]);

  return (
    <span
      onMouseEnter={trigger}
      onFocus={trigger}
      className="inline-block font-mono tracking-[0.04em] text-[var(--accent,#C9A468)]"
    >
      {display}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Panel 01 — Home                                                    */
/* ------------------------------------------------------------------ */
function Hero() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const patternRef = useRef<SVGPatternElement | null>(null);
  const revealRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const pattern = patternRef.current;
    const reveal = revealRef.current;
    if (!canvas || !pattern || !reveal) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    /* The mask bitmap is painted at 1/4 resolution: a soft radial gradient
       survives the upscale (mask-size 100% 100%) but the per-frame PNG
       encode gets ~16x cheaper. */
    const SCALE = 0.25;
    const RADIUS = 260;
    /* px/second that reads as a full-speed swipe */
    const MAX_SPEED = 2600;

    const target = { x: -999, y: -999 };
    const smooth = { x: -999, y: -999 };
    const grid = { x: 0, y: 0, tx: 0, ty: 0 };
    /* -Infinity (not NaN) so the very first frame passes the dirty check and
       paints an empty mask — otherwise the reveal layer stays fully visible. */
    const lastMask = { x: -Infinity, y: -Infinity };
    let lastRadius = -1;
    let raf = 0;

    /* the intro reveal only runs when motion is welcome */
    const introRun = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const startedAt = performance.now();
    let introAlphaPrev = 0;

    /* pointer speed drives the size of the reveal:
       0 = parked, 1 = a fast swipe across the frame. */
    let speed = 0;
    let radius = RADIUS;
    let lastMoveAt = performance.now();
    let lastX = -999;
    let lastY = -999;

    const resize = () => {
      canvas.width = Math.max(1, Math.round(window.innerWidth * SCALE));
      canvas.height = Math.max(1, Math.round(window.innerHeight * SCALE));
      /* force a repaint at the new bitmap size on the next frame */
      lastMask.x = -Infinity;
      lastMask.y = -Infinity;
    };
    resize();

    const onMove = (event: PointerEvent) => {
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      const now = performance.now();

      /* instantaneous pointer velocity → smoothed 0..1 intensity.
         The very first sample has no previous point: treating the jump from
         off-screen as motion used to slam the reveal open the instant the
         pointer entered. */
      if (lastX === -999) {
        lastMoveAt = now;
        lastX = event.clientX;
        lastY = event.clientY;
      } else {
        const dt = Math.max(8, now - lastMoveAt);
        const dist = Math.hypot(event.clientX - lastX, event.clientY - lastY);
        const instant = Math.min(2500, (dist / dt) * 1000);
        /* attack quicker than release, but eased — no snap */
        speed += (instant - speed) * (instant > speed ? 0.3 : 0.12);
        lastMoveAt = now;
        lastX = event.clientX;
        lastY = event.clientY;
      }

      target.x = event.clientX;
      target.y = event.clientY;
      grid.tx = (event.clientX / w - 0.5) * 16;
      grid.ty = (event.clientY / h - 0.5) * 16;

    };

    const frame = () => {
      /* pointer parks → intensity bleeds away, so the reveal contracts back to
         the plain spotlight and the loop fades out on its own */
      if (performance.now() - lastMoveAt > 90) speed *= 0.9;
      const intensity = Math.min(1, speed / MAX_SPEED);
      /* the reveal lags the hand on purpose: the disc glides open and closed
         instead of snapping to the current speed */
      const targetRadius = RADIUS + intensity * 560;
      radius += (targetRadius - radius) * 0.05;

      /* cursor smoothing */
      smooth.x += (target.x - smooth.x) * 0.1;
      smooth.y += (target.y - smooth.y) * 0.1;

      /* grid parallax */
      grid.x += (grid.tx - grid.x) * 0.06;
      grid.y += (grid.ty - grid.y) * 0.06;
      pattern.setAttribute('x', grid.x.toFixed(2));
      pattern.setAttribute('y', grid.y.toFixed(2));

      /* intro: the whole frame goes cyberpunk, then dissolves back */
      const elapsed = (performance.now() - startedAt) / 1000;
      let introR = 0;
      let introA = 0;
      if (introRun && elapsed < INTRO.out) {
        if (elapsed < INTRO.grow) {
          const k = elapsed / INTRO.grow;
          introR = Math.hypot(canvas.width, canvas.height) * 0.85 * (1 - Math.pow(1 - k, 3));
          introA = Math.min(1, elapsed / 0.3);
        } else if (elapsed < INTRO.hold) {
          introR = Math.hypot(canvas.width, canvas.height) * 0.85;
          introA = 1;
        } else {
          introR = Math.hypot(canvas.width, canvas.height) * 0.85;
          introA = Math.max(0, 1 - (elapsed - INTRO.hold) / (INTRO.out - INTRO.hold));
        }
      }
      const introPrev = introAlphaPrev;
      introAlphaPrev = introA;

      const moved = Math.abs(smooth.x - lastMask.x) > 0.3 || Math.abs(smooth.y - lastMask.y) > 0.3;
      /* the radius eases, so an out-of-date bitmap also has to be repainted */
      const ramping = Math.abs(radius - lastRadius) > 0.6;

      /* spotlight mask — only re-encode while something is actually changing */
      if (moved || ramping || introA > 0 || introPrev > 0) {
        lastMask.x = smooth.x;
        lastMask.y = smooth.y;
        lastRadius = radius;

        const cx = smooth.x * SCALE;
        const cy = smooth.y * SCALE;
        /* 260px parked → ~900px at full speed, i.e. the whole face */
        const r = radius * SCALE;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        /* full-frame reveal, growing out of the face */
        if (introA > 0.002) {
          const fx = canvas.width * 0.5;
          const fy = canvas.height * 0.34;
          const disc = ctx.createRadialGradient(fx, fy, introR * 0.72, fx, fy, Math.max(introR, 1));
          disc.addColorStop(0, `rgba(255,255,255,${introA})`);
          disc.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = disc;
          ctx.beginPath();
          ctx.arc(fx, fy, Math.max(introR, 1), 0, Math.PI * 2);
          ctx.fill();
        }

        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.4, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.6, 'rgba(255,255,255,0.75)');
        gradient.addColorStop(0.75, 'rgba(255,255,255,0.4)');
        gradient.addColorStop(0.88, 'rgba(255,255,255,0.12)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        const url = `url(${canvas.toDataURL()})`;
        reveal.style.setProperty('mask-image', url);
        reveal.style.setProperty('-webkit-mask-image', url);
        reveal.style.setProperty('mask-size', '100% 100%');
        reveal.style.setProperty('-webkit-mask-size', '100% 100%');
      }

      raf = window.requestAnimationFrame(frame);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('resize', resize);
    raf = window.requestAnimationFrame(frame);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('resize', resize);
      window.cancelAnimationFrame(raf);
    };
  }, []);

  // `isolate`keeps the hero's z-50 layers underneath the fixed nav (z-50)
  // and the mobile dropdown (z-40), which live in the root stacking context.
  return (
    <section id="home"className="relative isolate h-[100dvh] w-full overflow-hidden bg-black">
      {/* 1 — grid */}
      <div className="absolute inset-0 z-0"aria-hidden="true">
        <svg className="h-full w-full"style={{ opacity: 0.1 }}>
          <defs>
            <pattern
              ref={patternRef}
              id="hero-grid"
              width="48"
              height="48"
              patternUnits="userSpaceOnUse"
            >
              <path d="M 48 0 L 0 0 L 0 48"fill="none"stroke="#64748b"strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect width="100%"height="100%"fill="url(#hero-grid)" />
        </svg>
      </div>

      {/* 2 — base portrait */}
      <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden"aria-hidden="true">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"style={STAGE}>
          <div
            className="animate-ken-burns absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: BG_IMAGE_1 }}
          />
        </div>
      </div>

      {/* 3 — cursor spotlight reveal.
             The mask lives on the untransformed, viewport-sized wrapper so the
             intro scale never drags the spotlight away from the real cursor. */}
      <div
        ref={revealRef}
        className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"style={STAGE}>
          <div
            className="animate-ken-burns absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: BG_IMAGE_2 }}
          />
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden"aria-hidden="true" />

      {/* scanner sweep that rides the intro reveal */}
      <div
        className="scan-line pointer-events-none absolute inset-x-0 top-0 z-[32] h-[200px]"
        aria-hidden="true"
        style={{
          background:
            'linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,0.05) 55%, rgba(255,255,255,0.22) 94%, rgba(255,255,255,0.75) 99.4%, rgba(255,255,255,0) 100%)',
        }}
      />

      {/* readability scrim (white type over red imagery) */}
      <div
        className="pointer-events-none absolute inset-0 z-[35]"
        aria-hidden="true"
        style={{
          background:
            'linear-gradient(to top, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.22) 34%, rgba(0,0,0,0) 62%), radial-gradient(100% 85% at 0% 100%, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.24) 45%, rgba(0,0,0,0) 78%)',
        }}
      />

      {/* chest branding */}
      <ChestBadge />

      {/* 4 — stats arc */}
      <StatsArc />

      {/* 5 — hero copy */}
      <div className="absolute bottom-12 sm:bottom-16 md:bottom-24 left-5 sm:left-8 md:left-12 max-w-[320px] sm:max-w-md z-50">
        <p
          className="stagger-item hero-rise text-xs font-medium text-[var(--accent,#C9A468)]"
          style={{ animationDelay: '0.15s' }}
        >
          <ScrambleLabel text="Custom sportswear for athletic squads" />
        </p>

        <h1
          className="stagger-item hero-rise mt-3 text-4xl sm:text-5xl md:text-6xl font-medium leading-[1.08] tracking-[-0.03em] text-[var(--text-hi,#F5F2EC)]"
          style={{ animationDelay: '0.3s' }}
        >
          Your crest.
          <br />
          Your colours.
          <br />
          Your fit.
        </h1>

        <p
          className="stagger-item hero-rise mt-4 text-sm sm:text-base text-white/80 leading-relaxed"
          style={{ animationDelay: '0.5s' }}
        >
          Sublimated team kits, training sets and club apparel, sampled before a stitch and cut to your squad’s measurements.
        </p>

        <div className="stagger-item hero-rise mt-6 flex items-center gap-4"style={{ animationDelay: '0.7s' }}>
          <a
            href="/design"
            className="btn-fill-swipe inline-flex items-center justify-center bg-[var(--text-hi,#F5F2EC)] text-[var(--ink-0,#0C0C0E)] text-sm font-semibold px-6 py-3 rounded-full active:scale-[0.98] transition-[transform,color] duration-[320ms] ease-[cubic-bezier(.22,.61,.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent,#C9A468)] motion-reduce:transition-none"
          >
            Design your kit
          </a>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* App                                                                */
/* ------------------------------------------------------------------ */
export default function App() {
  const { theme } = useTheme();
  const path = typeof window === "undefined" ? "/" : window.location.pathname.replace(/\/$/, "") || "/";

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
  }, [path]);

  const renderPage = () => {
    if (path === "/design" || path.startsWith("/design/")) return <Design />;
    if (path === "/remove-logo" || path.startsWith("/remove-logo/")) return <RemoveLogo />;
    if (path === "/admin" || path.startsWith("/admin/")) return <Admin />;
    if (path === "/login" || path.startsWith("/login/")) return <Login />;
    if (path === "/pricing" || path.startsWith("/pricing/")) return <Pricing />;
    if (path === "/about" || path.startsWith("/about/")) return <About />;
    if (path === "/contact" || path.startsWith("/contact/")) return <Contact />;
    if (path === "/terms" || path.startsWith("/terms/")) return <Terms />;

    return (
      <div
        className={`min-h-screen tracking-[-0.02em] flex flex-col justify-between transition-colors ${
          theme === 'light' ? 'bg-[#756357] text-[#F5F2EC]' : 'bg-[var(--ink-0,#0C0C0E)] text-[var(--text-hi,#F5F2EC)]'
        }`}
      >
        <NavBar />
        <main className="flex-1">
          <Hero />
        </main>
        <SiteFooter />
      </div>
    );
  };

  return (
    <>
      <CustomCursor />
      <div className="grain-overlay"aria-hidden="true" />
      {renderPage()}
    </>
  );
}
