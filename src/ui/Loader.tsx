import { useProgress } from '@react-three/drei';
import { useEffect, useState } from 'react';
import { onRig } from '../aircraft/rig';
import { flyTo, goPreset } from '../camera/controls';
import { useUI } from '../state/ui';
import { Button, Label, cx } from './kit';

/** Loading screen and cinematic introduction. */
export function Loader() {
  const { progress, active } = useProgress();
  const introDone = useUI((s) => s.introDone);
  const set = useUI((s) => s.set);
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => onRig((r) => r && setReady(true)), []);

  useEffect(() => {
    if (!ready || introDone) return;
    // Cinematic reveal: start low off the nose, glide to the hero three-quarter view.
    void flyTo([118, 3.2, 26], [10, 7, 0], false, true).then(() => {
      window.setTimeout(() => void goPreset('home', true), 250);
    });
  }, [ready, introDone]);

  const start = () => {
    set({ introDone: true });
    window.setTimeout(() => setHidden(true), 700);
  };

  useEffect(() => {
    if (!ready || introDone) return;
    const t = window.setTimeout(start, 5200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, introDone]);

  if (hidden || (introDone && ready)) return null;
  const pct = ready ? 100 : Math.round(progress);
  return (
    <div className={cx('pointer-events-none absolute inset-0 z-40 transition-opacity duration-700', introDone && 'opacity-0')}>
      <div className={cx('absolute inset-0 bg-graphite-950 transition-opacity duration-[1400ms]', ready ? 'opacity-0' : 'opacity-100')} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(11,13,16,0.85))]" />
      <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-graphite-950 via-graphite-950/70 to-transparent" />
      <div className="absolute inset-x-0 bottom-[max(10%,env(safe-area-inset-bottom))] flex flex-col items-center px-6 text-center">
        <Label className="text-ice-400">Airbus A380-800 · Educational digital twin</Label>
        <h1 className="mt-3 text-[clamp(34px,6vw,64px)] font-[300] leading-none tracking-[-0.03em] text-paper [text-wrap:balance]">
          A380 <span className="text-graphite-400">—</span> The Digital Twin
        </h1>
        <p className="mt-4 max-w-[560px] text-[13px] leading-relaxed text-graphite-300 [text-wrap:balance]">
          Every control surface, door and wheel articulated. A live flight deck, a two-deck cabin you can walk and a flight model you can fly.
        </p>
        <div className="mt-6 h-px w-64 overflow-hidden bg-white/10">
          <div className="h-full bg-ice-400 transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-graphite-400">
          {ready ? 'Aircraft ready' : active ? `Streaming geometry · ${pct}%` : 'Preparing'}
        </div>
        {ready && !introDone && (
          <Button variant="solid" icon="chevronRight" className="pointer-events-auto mt-6 h-11 rounded-xl px-5 text-[13.5px] shadow-[0_8px_32px_-8px_rgba(111,211,239,0.45)] a380-enter" onClick={start}>
            Begin exploring
          </Button>
        )}
      </div>
    </div>
  );
}
