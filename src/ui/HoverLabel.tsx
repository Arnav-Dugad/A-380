import { useEffect, useRef } from 'react';
import { PARTS } from '../data/parts';
import { useUI } from '../state/ui';

/** Small label that follows the pointer and names the component under it (desktop only). */
export function HoverLabel() {
  const hovered = useUI((s) => s.hovered);
  const selected = useUI((s) => s.selected);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const el = ref.current;
      if (el) el.style.transform = `translate(${e.clientX + 16}px, ${e.clientY + 18}px)`;
    };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, []);
  const part = hovered ? PARTS[hovered] : undefined;
  return (
    <div ref={ref} className="pointer-events-none fixed left-0 top-0 z-50" aria-hidden="true">
      {part && (
        <div key={hovered} className="a380-fade flex items-center gap-2 rounded-lg border border-white/10 bg-graphite-900/85 px-2.5 py-1.5 shadow-lg backdrop-blur-md">
          <span className="h-1.5 w-1.5 rounded-full bg-ice-400" />
          <span className="text-[12px] text-paper">{part.name}</span>
          {selected !== hovered && <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-graphite-400">click</span>}
        </div>
      )}
    </div>
  );
}
