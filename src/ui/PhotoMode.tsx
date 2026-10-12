import { useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { useUI } from '../state/ui';
import { Button, Panel, Segmented, Slider, Toggle } from './kit';

type ThreeState = import('@react-three/fiber').RootState;
const api = { get: null as null | (() => ThreeState) };

/** Registers renderer access for screenshot capture (mounted inside the Canvas). */
export function PhotoBridge() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    api.get = get;
  }, [get]);
  return null;
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** Render at a higher pixel ratio (capped at 8192 px on the long edge) and download a PNG. */
export async function captureScreenshot(multiplier: number): Promise<{ width: number; height: number } | null> {
  const get = api.get;
  if (!get) return null;
  const st = get();
  const base = st.viewport.dpr;
  const long = Math.max(st.size.width, st.size.height);
  const dpr = Math.min(base * multiplier, 8192 / long);
  st.setDpr(dpr);
  for (let i = 0; i < 4; i++) await nextFrame();
  const canvas = st.gl.domElement;
  const url = canvas.toDataURL('image/png');
  const dims = { width: canvas.width, height: canvas.height };
  st.setDpr(base);
  const a = document.createElement('a');
  a.href = url;
  a.download = `a380-digital-twin-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
  a.click();
  return dims;
}

export function PhotoModeBar() {
  const fov = useUI((s) => s.fov);
  const exposure = useUI((s) => s.exposure);
  const set = useUI((s) => s.set);
  const [mult, setMult] = useState('2');
  const [grid, setGrid] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <>
      {grid && (
        <div className="pointer-events-none absolute inset-0 z-20">
          {[1, 2].map((i) => (
            <div key={`v${i}`} className="absolute inset-y-0 w-px bg-white/25" style={{ left: `${(i * 100) / 3}%` }} />
          ))}
          {[1, 2].map((i) => (
            <div key={`h${i}`} className="absolute inset-x-0 h-px bg-white/25" style={{ top: `${(i * 100) / 3}%` }} />
          ))}
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-[max(16px,env(safe-area-inset-bottom))] z-30 flex justify-center px-3">
        <Panel className="flex w-full max-w-[860px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
          <div className="w-40">
            <Slider label="Field of view" value={fov} min={12} max={75} step={1} onChange={(v) => set({ fov: v })} format={(v) => `${v.toFixed(0)}°`} />
          </div>
          <div className="w-40">
            <Slider label="Exposure" value={exposure} min={0.4} max={2} onChange={(v) => set({ exposure: v })} format={(v) => `${v.toFixed(2)}×`} />
          </div>
          <div className="w-36">
            <Toggle label="Thirds grid" checked={grid} onChange={setGrid} />
          </div>
          <Segmented size="sm" value={mult} onChange={setMult} label="Resolution" options={[{ value: '1', label: '1×' }, { value: '2', label: '2×' }, { value: '3', label: '3×' }]} />
          <div className="ml-auto flex items-center gap-2">
            {busy && <span className="font-mono text-[11px] text-graphite-300">{busy}</span>}
            <Button
              size="sm"
              variant="accent"
              icon="download"
              onClick={async () => {
                setBusy('Rendering…');
                const r = await captureScreenshot(Number(mult));
                setBusy(r ? `Saved ${r.width}×${r.height}` : 'Capture failed');
              }}
            >
              Capture
            </Button>
            <Button size="sm" icon="close" onClick={() => set({ photoMode: false })}>
              Exit
            </Button>
          </div>
        </Panel>
      </div>
    </>
  );
}
