import { useEffect, useRef, useState } from 'react';
import { useSim } from '../state/sim';
import { cx } from './kit';

interface Toast {
  id: number;
  text: string;
  level: 'info' | 'caution' | 'warning';
}

/** Surfaces system feedback (command results, interlocks) as brief, unobtrusive toasts. */
export function Toasts() {
  const log = useSim((s) => s.log);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seen = useRef(0);
  const counter = useRef(0);
  useEffect(() => {
    const fresh = log.length >= seen.current ? log.slice(seen.current) : log.slice(-1);
    seen.current = log.length;
    if (!fresh.length) return;
    const add = fresh.slice(-3).map((l) => ({ id: ++counter.current, text: l.text, level: l.level }));
    setToasts((t) => [...t, ...add].slice(-3));
    const timer = window.setTimeout(() => setToasts((t) => t.filter((x) => !add.some((a) => a.id === x.id))), 3600);
    return () => window.clearTimeout(timer);
  }, [log]);
  return (
    <div aria-live="polite" className="pointer-events-none flex flex-col items-center gap-1.5">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            'a380-enter rounded-full border px-3.5 py-1.5 text-[12px] backdrop-blur-xl',
            t.level === 'info' ? 'border-white/[0.08] bg-graphite-900/80 text-paper/90' : 'border-amber-warn/30 bg-[#2a2113]/85 text-amber-warn',
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
