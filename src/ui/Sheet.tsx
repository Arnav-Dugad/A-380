import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { useUI, type SheetSnap } from '../state/ui';
import { Icon } from './icons';
import { cx } from './kit';

/** Space reserved for the mobile navigation bar (without the safe-area inset). */
export const NAV_H = 58;
const TOP_GAP = 72;

function heights(vh: number): Record<SheetSnap, number> {
  const full = Math.max(260, vh - NAV_H - TOP_GAP);
  return {
    peek: 96,
    half: Math.min(full, Math.max(240, Math.round(vh * 0.42))),
    full,
  };
}

/**
 * Draggable bottom sheet with three snap points. Drag the grab handle (or tap it) to resize;
 * a quick flick snaps in the direction of travel.
 */
export function BottomSheet({ children, label, innerRef }: { children: ReactNode; label: string; innerRef?: Ref<HTMLDivElement> }) {
  const snap = useUI((s) => s.sheet);
  const set = useUI((s) => s.set);
  const [vh, setVh] = useState(() => window.innerHeight);
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef({
    y: 0,
    h: 0,
    t: 0,
    moved: false,
    lastY: 0,
    lastT: 0,
    v: 0,
  });

  useEffect(() => {
    const r = () => setVh(window.innerHeight);
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);

  const hs = heights(vh);
  const height = drag ?? hs[snap];

  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    start.current = {
      y: e.clientY,
      h: hs[snap],
      t: performance.now(),
      moved: false,
      lastY: e.clientY,
      lastT: performance.now(),
      v: 0,
    };
    setDrag(hs[snap]);
  };
  const onMove = (e: React.PointerEvent) => {
    if (drag === null) return;
    const st = start.current;
    const dy = e.clientY - st.y;
    if (Math.abs(dy) > 6) st.moved = true;
    const now = performance.now();
    st.v = (e.clientY - st.lastY) / Math.max(1, now - st.lastT);
    st.lastY = e.clientY;
    st.lastT = now;
    setDrag(Math.max(hs.peek - 30, Math.min(hs.full + 20, st.h - dy)));
  };
  const onUp = () => {
    if (drag === null) return;
    const st = start.current;
    let next: SheetSnap;
    if (!st.moved) next = snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'peek';
    else {
      // project the release position by the flick velocity, then take the nearest snap
      const projected = drag - st.v * 180;
      next = (Object.keys(hs) as SheetSnap[]).reduce((best, k) => (Math.abs(hs[k] - projected) < Math.abs(hs[best] - projected) ? k : best), 'half');
    }
    setDrag(null);
    set({ sheet: next });
  };

  return (
    <div
      ref={innerRef}
      className={cx(
        'pointer-events-auto absolute inset-x-2 flex flex-col overflow-hidden rounded-t-[22px] rounded-b-2xl border border-white/[0.08] bg-graphite-900/80 shadow-[0_-18px_48px_-20px_rgba(0,0,0,0.75)] backdrop-blur-xl backdrop-saturate-150',
        drag === null && 'transition-[height] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]',
      )}
      style={{
        height,
        bottom: `calc(${NAV_H}px + env(safe-area-inset-bottom) + 6px)`,
      }}
      data-sheet={snap}
      aria-label={label}
    >
      <div className="flex shrink-0 items-center justify-center">
        <button
          type="button"
          aria-label={snap === 'full' ? 'Collapse panel' : 'Expand panel'}
          className="group flex h-6 w-full touch-none cursor-grab items-center justify-center active:cursor-grabbing"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') set({ sheet: snap === 'peek' ? 'half' : 'full' });
            if (e.key === 'ArrowDown') set({ sheet: snap === 'full' ? 'half' : 'peek' });
          }}
        >
          <span className="h-1 w-10 rounded-full bg-white/20 transition-colors group-hover:bg-white/35" />
        </button>
      </div>
      <div className={cx('relative min-h-0 flex-1', snap === 'peek' && drag === null ? 'overflow-hidden [mask-image:linear-gradient(to_bottom,black_55%,transparent_92%)]' : 'flex flex-col')}>
        {children}
      </div>
      {snap === 'peek' && drag === null && (
        <button
          type="button"
          aria-label="Show more"
          onClick={() => set({ sheet: 'half' })}
          className="absolute right-3 top-7 grid h-8 w-8 place-items-center rounded-full border border-white/[0.08] bg-white/[0.05] text-graphite-300"
        >
          <Icon name="chevronUp" size={16} />
        </button>
      )}
    </div>
  );
}
