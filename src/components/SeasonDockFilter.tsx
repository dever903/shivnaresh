import { useEffect, useRef } from 'react';

export interface SeasonTabItem {
  id: string;
  label: string;
}

interface SeasonDockFilterProps {
  tabs: SeasonTabItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  isLight: boolean;
  /** Keep try-on dark theme accent parity while swap tab uses red/white */
  variant?: 'tryon' | 'swap';
}

export function SeasonDockFilter({
  tabs,
  selectedId,
  onSelect,
  isLight,
  variant = 'tryon',
}: SeasonDockFilterProps) {
  const dockRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
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
          el.style.zIndex = '';
        }
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!pointerMq.matches || motionMq.matches) return;
      const cursorX = e.clientX;
      const cursorY = e.clientY;
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);

      rafRef.current = window.requestAnimationFrame(() => {
        for (const el of itemRefs.current) {
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const d = Math.hypot(cursorX - cx, cursorY - cy);
          const falloff = Math.max(0, 1 - d / 115);
          const scale = 1 + 0.24 * falloff;
          const lift = -((scale - 1) * 14);
          el.style.transform = `translateY(${lift.toFixed(2)}px) scale(${scale.toFixed(3)})`;
          el.style.zIndex = falloff > 0.15 ? '10' : '';
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
  }, [tabs.length]);

  return (
    <div
      ref={dockRef}
      className="mb-3.5 flex flex-wrap items-center gap-1.5 border-b pb-2.5 pt-1 border-white/10"
    >
      <span
        className={`text-[10px] font-bold uppercase tracking-wider mr-1 ${
          isLight ? 'text-gray-500' : 'text-white/40'
        }`}
      >
        Season:
      </span>
      {tabs.map((ct, idx) => {
        const isSelected = selectedId === ct.id;
        const activeClasses =
          variant === 'swap'
            ? 'bg-[#e5373f] text-white shadow-sm'
            : isLight
              ? 'bg-[#e5373f] text-white shadow-sm'
              : 'bg-[var(--accent)] text-[var(--accent-ink)] shadow-sm';
        const idleClasses =
          variant === 'swap'
            ? isLight
              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
            : isLight
              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              : 'bg-[var(--ink-2)] text-[var(--text-mid)] hover:bg-[var(--ink-3)] hover:text-[var(--text-hi)]';

        return (
          <button
            key={ct.id}
            ref={(el) => {
              itemRefs.current[idx] = el;
            }}
            type="button"
            onClick={() => onSelect(ct.id)}
            style={{
              transition:
                'transform 90ms cubic-bezier(0.22, 1, 0.36, 1), background-color 150ms ease, color 150ms ease',
            }}
            className={`relative origin-bottom will-change-transform px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
              isSelected ? activeClasses : idleClasses
            }`}
          >
            {ct.label}
          </button>
        );
      })}
    </div>
  );
}
