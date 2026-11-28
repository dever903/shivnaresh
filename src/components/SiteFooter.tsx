import { useEffect, useRef } from 'react';
import {
  Camera,
  CreditCard,
  Film,
  Info,
  Mail,
  MessageCircle,
  Sparkles,
} from 'lucide-react';
import { useTheme } from '../lib/theme';

const DOCK_ITEMS = [
  { href: '/design', label: 'Try-On', icon: Sparkles, cursor: 'TRY ON' },
  { href: '/design?tab=5pose', label: '5-Pose', icon: Camera, cursor: 'OPEN' },
  { href: '/design?tab=video', label: 'Runway', icon: Film, cursor: 'VIEW' },
  { href: '/pricing', label: 'Pricing', icon: CreditCard, cursor: 'VIEW' },
  { href: '/about', label: 'About', icon: Info, cursor: 'OPEN' },
  { href: '/contact', label: 'Contact', icon: MessageCircle, cursor: 'OPEN' },
  { href: 'mailto:lpawankumar015221684@gmail.com', label: 'Email', icon: Mail, cursor: 'OPEN' },
] as const;

function TextSwapLink({
  href,
  label,
  className = '',
  target,
  rel,
}: {
  href: string;
  label: string;
  className?: string;
  target?: string;
  rel?: string;
}) {
  return (
    <a
      href={href}
      target={target}
      rel={rel}
      className={`link-border-draw rounded-sm focus-visible:outline-none ${className}`}
    >
      <span className="text-swap">
        <span className="text-swap-primary">{label}</span>
        <span className="text-swap-secondary"aria-hidden="true">
          {label}
        </span>
      </span>
    </a>
  );
}

export default function SiteFooter() {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const dockRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const dock = dockRef.current;
    if (!dock || typeof window === 'undefined') return;

    const pointerMq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const motionMq = window.matchMedia('(prefers-reduced-motion: reduce)');

    const resetDock = () => {
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      for (const el of itemRefs.current) {
        if (el) {
          el.style.transform = 'translateY(0px) scale(1)';
        }
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!pointerMq.matches || motionMq.matches) return;
      const cursorX = e.clientX;
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);

      rafRef.current = window.requestAnimationFrame(() => {
        for (const el of itemRefs.current) {
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          const itemCentreX = rect.left + rect.width / 2;
          const d = Math.abs(cursorX - itemCentreX);
          const scale = 1 + 0.6 * Math.max(0, 1 - d / 140);
          const lift = -((scale - 1) * 10);
          el.style.transform = `translateY(${lift.toFixed(2)}px) scale(${scale.toFixed(3)})`;
        }
      });
    };

    dock.addEventListener('mousemove', onMouseMove, { passive: true });
    dock.addEventListener('mouseleave', resetDock);
    window.addEventListener('blur', resetDock);

    return () => {
      dock.removeEventListener('mousemove', onMouseMove);
      dock.removeEventListener('mouseleave', resetDock);
      window.removeEventListener('blur', resetDock);
      resetDock();
    };
  }, []);

  return (
    <footer
      className={`border-t border-[var(--line-1)] bg-[var(--ink-0)] text-[var(--text-mid)] transition-colors ${
        isLight ? '' : 'edge-light'
      }`}
    >
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4 lg:grid-cols-5">
          {/* Brand Col */}
          <div className="md:col-span-2 space-y-3">
            <a
              href="/"
              className="inline-flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent)] text-xs font-semibold text-[var(--accent-ink)]">
                SN
              </span>
              <span className="text-sm font-semibold tracking-wider text-[var(--text-hi)]">
                Shiv-Naresh
              </span>
              <span className="rounded border border-[var(--line-2)] bg-[var(--ink-2)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--accent)]">
                Studio
              </span>
            </a>
            <p className="text-xs leading-relaxed max-w-sm text-[var(--text-mid)]">
              Technical athletic fashion and virtual try-on studio engineered for sportswear teams, apparel manufacturers, and modern digital merchants.
            </p>
            <div className="pt-2 text-xs">
              <p className="font-medium text-xs text-[var(--text-hi)]">Developer &amp; engineering:</p>
              <p className="text-[11px] text-[var(--text-mid)]">
                Pawan Kumar &middot; ARSD College (University of Delhi), B.Sc. CS 3rd Year
              </p>
              <p className="text-[11px] text-[var(--text-low)] mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <span>Contact:</span>
                <TextSwapLink
                  href="tel:+916398743132"
                  label="+91 6398743132"
                  className="text-[var(--accent)]"
                />
                <span>&middot;</span>
                <TextSwapLink
                  href="mailto:lpawankumar015221684@gmail.com"
                  label="lpawankumar015221684@gmail.com"
                  className="text-[var(--text-mid)]"
                />
              </p>
            </div>
          </div>

          {/* Studio Navigation */}
          <div>
            <h3 className="text-xs font-semibold text-[var(--text-hi)]">Platform</h3>
            <ul className="mt-3 space-y-2 text-xs">
              <li>
                <TextSwapLink href="/design"label="Virtual try-on" />
              </li>
              <li>
                <TextSwapLink href="/design?tab=5pose"label="5-Pose sequence" />
              </li>
              <li>
                <TextSwapLink href="/design?tab=video"label="Video runway studio" />
              </li>
              <li>
                <TextSwapLink href="/design?tab=custom"label="Custom requests (24-48h)" />
              </li>
              <li>
                <TextSwapLink href="/pricing"label="Pricing & plans" />
              </li>
            </ul>
          </div>

          {/* Company & Developer */}
          <div>
            <h3 className="text-xs font-semibold text-[var(--text-hi)]">About &amp; support</h3>
            <ul className="mt-3 space-y-2 text-xs">
              <li>
                <TextSwapLink href="/about"label="About & background" />
              </li>
              <li>
                <TextSwapLink href="/contact"label="Contact & WhatsApp" />
              </li>
              <li>
                <TextSwapLink href="/terms"label="Terms & conditions" />
              </li>
              <li>
                <TextSwapLink
                  href="https://wa.me/916398743132?text=Hello%20Pawan,%20I%20have%20an%20inquiry%20regarding%20Shiv-Naresh%20AI%20Studio"
                  target="_blank"
                  rel="noreferrer"
                  label="WhatsApp: +91 6398743132"
                  className="text-[var(--accent)] font-medium"
                />
              </li>
            </ul>
          </div>

          {/* Security & Policies */}
          <div>
            <h3 className="text-xs font-semibold text-[var(--text-hi)]">Policy</h3>
            <div className="mt-3 space-y-2 text-xs text-[var(--text-mid)] leading-relaxed">
              <p>
                No-refund policy applies once computational rendering clusters are provisioned.
              </p>
              <p className="text-[11px] text-[var(--text-low)]">
                Orders are backed by our master tailor fulfillment window.
              </p>
              <div className="pt-1.5">
                <span className="inline-block rounded-md border border-[var(--line-2)] bg-[var(--ink-2)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                  SLA fulfillment window
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 6.1 Quick-Links / Icon Dock */}
        <div className="mt-10 flex flex-col items-center gap-3 border-t border-[var(--line-1)] pt-8">
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-low)]">
            Studio Quick Dock
          </span>
          <div
            ref={dockRef}
            className="inline-flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-[var(--line-1)] bg-[var(--ink-1)] px-3 py-2 shadow-[var(--shadow-l2)]"
          >
            {DOCK_ITEMS.map((item, idx) => {
              const Icon = item.icon;
              return (
                <a
                  key={item.label}
                  ref={(el) => {
                    itemRefs.current[idx] = el;
                  }}
                  href={item.href}
                  data-cursor={item.cursor}
                  aria-label={item.label}
                  title={item.label}
                  style={{ transformOrigin: 'bottom center' }}
                  className="group flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--line-1)] bg-[var(--ink-2)] text-[var(--text-mid)] transition-colors duration-[160ms] hover:border-[var(--accent)] hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  <Icon className="h-4 w-4"aria-hidden="true" />
                </a>
              );
            })}
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-[var(--line-1)] pt-6 text-xs text-[var(--text-low)]">
          <p>
            &copy; {new Date().getFullYear()} Shiv-Naresh AI Studio. Built with passion by Pawan Kumar (ARSD College, DU).
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
            <TextSwapLink href="/terms"label="Terms of Service" />
            <TextSwapLink href="/contact"label="Help Center" />
            <TextSwapLink href="/admin"label="Admin Access"className="text-[11px] opacity-80" />
          </div>
        </div>
      </div>
    </footer>
  );
}
