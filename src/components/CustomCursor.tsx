import { useEffect, useRef, useState } from 'react';

/**
 * 6.10 Dot + Lagging Ring Cursor.
 * Desktop-only (fine pointer + hover, and not prefers-reduced-motion).
 */
export function CustomCursor() {
  const [enabled, setEnabled] = useState(false);
  const [visible, setVisible] = useState(false);
  const [label, setLabel] = useState('');

  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const pointerMq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const motionMq = window.matchMedia('(prefers-reduced-motion: reduce)');

    const syncCapability = () => {
      const active = pointerMq.matches && !motionMq.matches;
      setEnabled(active);
      if (!active) {
        setVisible(false);
        setLabel('');
        document.body.classList.remove('has-cursor');
      }
    };

    syncCapability();
    pointerMq.addEventListener('change', syncCapability);
    motionMq.addEventListener('change', syncCapability);

    return () => {
      pointerMq.removeEventListener('change', syncCapability);
      motionMq.removeEventListener('change', syncCapability);
      document.body.classList.remove('has-cursor');
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    document.body.classList.add('has-cursor');

    let targetX = -100;
    let targetY = -100;
    let ringX = -100;
    let ringY = -100;
    let rafId = 0;
    let hasMoved = false;
    let isVis = false;
    let lastLabel = '';

    const lerp = 0.38;

    const tick = () => {
      ringX += (targetX - ringX) * lerp;
      ringY += (targetY - ringY) * lerp;

      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;
      }
      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${ringX}px, ${ringY}px, 0)`;
      }

      rafId = window.requestAnimationFrame(tick);
    };

    const resetCursor = () => {
      isVis = false;
      lastLabel = '';
      setVisible(false);
      setLabel('');
    };

    const onMouseMove = (e: MouseEvent) => {
      targetX = e.clientX;
      targetY = e.clientY;
      if (!hasMoved) {
        hasMoved = true;
        ringX = targetX;
        ringY = targetY;
      }
      if (!isVis) {
        isVis = true;
        setVisible(true);
      }

      const target = e.target as Element | null;
      const cursorEl = target?.closest?.('[data-cursor]');
      const nextLabel = cursorEl?.getAttribute('data-cursor')?.trim().toUpperCase() || '';
      if (nextLabel !== lastLabel) {
        lastLabel = nextLabel;
        setLabel(nextLabel);
      }
    };

    const onTouchStart = () => {
      setEnabled(false);
      resetCursor();
      document.body.classList.remove('has-cursor');
    };

    rafId = window.requestAnimationFrame(tick);
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    document.addEventListener('mouseleave', resetCursor);
    window.addEventListener('blur', resetCursor);
    window.addEventListener('resize', resetCursor);
    window.addEventListener('touchstart', onTouchStart, { passive: true });

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseleave', resetCursor);
      window.removeEventListener('blur', resetCursor);
      window.removeEventListener('resize', resetCursor);
      window.removeEventListener('touchstart', onTouchStart);
      document.body.classList.remove('has-cursor');
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div aria-hidden="true"style={{ opacity: visible ? 1 : 0 }}>
      <div ref={dotRef} className="custom-cursor-dot" />
      <div
        ref={ringRef}
        className={`custom-cursor-ring${label ? 'is-active' : ''}`}
      >
        <div className="custom-cursor-ring-circle" />
        {label && <span className="custom-cursor-ring-label">{label}</span>}
      </div>
    </div>
  );
}

export default CustomCursor;
