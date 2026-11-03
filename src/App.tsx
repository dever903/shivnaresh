import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Menu, X } from 'lucide-react';
import Design from './pages/Design';
import Admin from './pages/Admin';
import Login from './pages/Login';
import Pricing from './pages/Pricing';
import About from './pages/About';
import Contact from './pages/Contact';
import Terms from './pages/Terms';
import SiteFooter from './components/SiteFooter';
import { useTheme, ThemeToggle } from './lib/theme';

/* ------------------------------------------------------------------ */
/*  Assets                                                             */
/*  Portraits mirrored into /public so the build never depends on the  */
/*  image proxy. Originals:                                            */
/*    BG_IMAGE_1 https://images.higgs.ai/?...hf_20260609_125121_...png */
/*    BG_IMAGE_2 https://images.higgs.ai/?...hf_20260609_135737_...png */
/* ------------------------------------------------------------------ */
const BG_IMAGE_1 = "url('/hero-base.webp')";
const BG_IMAGE_2 = "url('/hero-reveal.webp')";

const BRAND_MARK = '/brand-mark-white.png';

const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Design', href: '/design' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
  { label: 'Terms', href: '/terms' },
] as const;

/* Chest branding — wearer's left chest, in *image* coordinates.
   Percentages resolve against the 16:9 stage below, not the viewport, so the
   mark stays on the pectoral however `cover` crops the portrait. */
const CHEST = { left: '62.5%', top: '92%' };

/* Intro reveal: the whole face goes cyberpunk for a beat, then falls back to
   the cursor spotlight. Seconds, matched by the sound design below. */
const INTRO = { grow: 1.7, hold: 3.2, out: 4.8 };

/* A box that always matches what `background-size: cover` would show, so that
   anything anchored inside it moves with the photograph, not the viewport. */
const STAGE: CSSProperties = {
  width: 'max(100%, calc(100dvh * 16 / 9))',
  aspectRatio: '16 / 9',
};

/* ------------------------------------------------------------------ */
/*  Brand                                                              */
/* ------------------------------------------------------------------ */
function Brand({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const mark = size === 'sm' ? 'h-[13px]' : 'h-[16px]';
  const label = size === 'sm' ? 'text-[10px]' : 'text-[11px]';
  return (
    <span className="flex items-center gap-2">
      <img src={BRAND_MARK} alt="" className={`${mark} w-auto`} draggable={false} />
      <span className={`${label} font-semibold tracking-[0.2em] text-white`}>SHIV-NARESH</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Navbar — two panels only                                           */
/* ------------------------------------------------------------------ */
function NavBar() {
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const active = typeof window === 'undefined' ? '/' : window.location.pathname.replace(/\/$/, '') || '/';

  return (
    <>
      <nav className="nav-drop fixed top-0 left-0 right-0 z-50 flex items-center justify-between md:justify-center p-4 sm:p-5">
        {/* Desktop: one centered pill */}
        <div className="hidden md:flex items-center gap-1 bg-black/60 backdrop-blur-md rounded-full pl-3 pr-2 py-2">
          <a href="/" className="flex items-center rounded-full pr-3">
            <Brand />
          </a>
          <span className="mr-1 h-4 w-px bg-white/20" aria-hidden="true" />
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              aria-current={active === (link.href === '/' ? '/' : link.href) ? 'page' : undefined}
              className={
                active === (link.href === '/' ? '/' : link.href)
                  ? 'text-white text-sm font-medium px-3 py-1.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70'
                  : 'text-gray-300 text-sm font-medium px-3 py-1.5 rounded-full hover:bg-white/10 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70'
              }
            >
              {link.label}
            </a>
          ))}
          <a
            href="/design"
            className="bg-white text-gray-900 text-sm font-semibold px-5 py-1.5 rounded-full hover:bg-gray-100 ml-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/60"
          >
            Start design
          </a>
          <div className="ml-2">
            <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          </div>
        </div>

        {/* Mobile: brand pill */}
        <a href="#home" className="md:hidden flex items-center bg-black/60 backdrop-blur-md rounded-full px-3 py-2.5">
          <Brand size="sm" />
        </a>

        {/* Mobile: toggle pill */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          className="md:hidden flex items-center justify-center bg-black/60 backdrop-blur-md rounded-full p-2.5 text-white"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>

      {open && (
        <div className="nav-drop fixed top-0 left-0 right-0 z-40 w-full bg-white pt-16 pb-6 px-5 shadow-lg md:hidden">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block w-full text-left text-gray-800 py-3 border-b border-gray-100"
            >
              {link.label}
            </a>
          ))}
          <a
            href="/design"
            onClick={() => setOpen(false)}
            className="mt-5 block w-full text-center bg-gray-900 text-white text-sm font-semibold px-5 py-3 rounded-full"
          >
            Start design
          </a>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Stats on fading arc                                                */
/* ------------------------------------------------------------------ */
const ARC_CENTER = { x: -110, y: 300 };
const RAD = Math.PI / 180;

type ArcSpec = { r: number; from: number; to: number; dot: number; value: string; label: string };

const ARCS: ArcSpec[] = [
  { r: 330, from: -92, to: 16, dot: -46, value: '10+', label: 'YEARS KITTING' },
  { r: 395, from: -56, to: 60, dot: 2, value: '40+', label: 'KIT TEMPLATES' },
  { r: 460, from: -14, to: 72, dot: 44, value: '95%', label: 'REPEAT CLUBS' },
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
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
                <stop offset="22%" stopColor="#ffffff" stopOpacity="0.5" />
                <stop offset="55%" stopColor="#ffffff" stopOpacity="0.5" />
                <stop offset="85%" stopColor="#ffffff" stopOpacity="0.1" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
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
/*  Chest branding                                                     */
/* ------------------------------------------------------------------ */
function ChestBadge() {
  // Below `lg` the portrait is cropped so tight that the chest sits behind the
  // headline — the nav carries the brand there instead.
  return (
    <div className="pointer-events-none absolute inset-0 z-40 hidden select-none lg:block" aria-hidden="true">
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={STAGE}>
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
              className="font-semibold uppercase leading-none text-[clamp(7px,0.82vw,11px)] tracking-[0.2em] drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]"
              style={{ paddingRight: '0.2em' }}
            >
              Shiv-Naresh
            </span>
          </div>
          <div className="mt-[5px] h-px w-full bg-white/35" style={{ transform: 'skewX(-18deg)' }} />
          <p
            className="mt-[4px] text-[clamp(5px,0.56vw,7.5px)] font-medium uppercase leading-none tracking-[0.2em] text-white/65 drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]"
            style={{ paddingRight: '0.2em' }}
          >
            Clothes Customization
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Panel 01 — Home                                                    */
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

  // `isolate` keeps the hero's z-50 layers underneath the fixed nav (z-50)
  // and the mobile dropdown (z-40), which live in the root stacking context.
  return (
    <section id="home" className="relative isolate h-[100dvh] w-full overflow-hidden bg-black">
      {/* 1 — grid */}
      <div className="absolute inset-0 z-0" aria-hidden="true">
        <svg className="h-full w-full" style={{ opacity: 0.1 }}>
          <defs>
            <pattern
              ref={patternRef}
              id="hero-grid"
              width="48"
              height="48"
              patternUnits="userSpaceOnUse"
            >
              <path d="M 48 0 L 0 0 L 0 48" fill="none" stroke="#64748b" strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hero-grid)" />
        </svg>
      </div>

      {/* 2 — base portrait */}
      <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden="true">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={STAGE}>
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
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={STAGE}>
          <div
            className="animate-ken-burns absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: BG_IMAGE_2 }}
          />
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

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
      <div className="absolute bottom-12 sm:bottom-16 md:bottom-24 left-5 sm:left-8 md:left-12 max-w-[300px] sm:max-w-md z-50">
        <p
          className="hero-rise text-[11px] sm:text-xs font-semibold tracking-[0.12em] text-white/90"
          style={{ animationDelay: '0.15s' }}
        >
          Custom sportswear <span className="italic">for your club</span>
        </p>

        <h1
          className="hero-rise mt-3 text-4xl sm:text-5xl md:text-6xl leading-[1.05] tracking-[-0.08em] text-white"
          style={{ animationDelay: '0.3s' }}
        >
          Your crest.
          <br />
          Your colours.
          <br />
          Your fit.
        </h1>

        <p
          className="hero-rise mt-4 text-sm sm:text-base text-white/90 leading-relaxed"
          style={{ animationDelay: '0.5s' }}
        >
          Sublimated team kits, training sets and club apparel — drawn with you,
          sampled before a stitch, cut to your squad’s measurements.
        </p>

        <div className="hero-rise mt-6 flex items-center gap-4" style={{ animationDelay: '0.7s' }}>
          <a
            href="/design"
            className="group relative isolate inline-block overflow-hidden bg-white text-gray-900 text-sm sm:text-base font-semibold px-7 sm:px-8 py-3 sm:py-3.5 rounded-full shadow-lg shadow-black/20 transition-transform duration-300 hover:scale-[1.04] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-black/50"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-black/15 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
            />
            <span className="relative">Design your kit</span>
          </a>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  App                                                                */
/* ------------------------------------------------------------------ */
export default function App() {
  const path = typeof window === "undefined" ? "/" : window.location.pathname.replace(/\/$/, "") || "/";

  if (path === "/design" || path.startsWith("/design/")) return <Design />;
  if (path === "/admin" || path.startsWith("/admin/")) return <Admin />;
  if (path === "/login" || path.startsWith("/login/")) return <Login />;
  if (path === "/pricing" || path.startsWith("/pricing/")) return <Pricing />;
  if (path === "/about" || path.startsWith("/about/")) return <About />;
  if (path === "/contact" || path.startsWith("/contact/")) return <Contact />;
  if (path === "/terms" || path.startsWith("/terms/")) return <Terms />;

  return (
    <div
      className="min-h-screen bg-[#070709] text-white tracking-[-0.02em] flex flex-col justify-between"
      style={{ fontFamily: "'JetBrains Mono', monospace" }}
    >
      <NavBar />
      <main className="flex-1">
        <Hero />
      </main>
      <SiteFooter />
    </div>
  );
}
