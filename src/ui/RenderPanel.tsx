import { useState } from 'react';
import { saveRender } from '../render/output';
import { SHADING_INFO, useRender, type RenderBackground, type RenderSize, type Shading, type ToneMap } from '../render/renderState';
import { useUI } from '../state/ui';
import { Icon, type IconName } from './icons';
import { Button, Group, Panel, Segmented, Slider, Toggle, cx } from './kit';

export const SHADING_MODES: { id: Shading; icon: IconName; key: string }[] = [
  { id: 'wireframe', icon: 'wire', key: 'Shift+Z' },
  { id: 'solid', icon: 'solid', key: 'Z' },
  { id: 'material', icon: 'material', key: 'Z' },
  { id: 'rendered', icon: 'aperture', key: 'Z' },
];

/** Blender-style viewport shading switch (wireframe, solid, material preview, rendered). */
export function ShadingSwitch({ compact = false }: { compact?: boolean }) {
  const shading = useRender((s) => s.shading);
  const set = useRender((s) => s.set);
  const [open, setOpen] = useState(false);
  if (compact) {
    const cur = SHADING_MODES.find((m) => m.id === shading) ?? SHADING_MODES[2]!;
    return (
      <div className="relative">
        <button
          type="button"
          aria-label={`Viewport shading: ${SHADING_INFO[shading].label}`}
          onClick={() => setOpen((o) => !o)}
          className={cx('pointer-events-auto grid h-9 w-9 place-items-center rounded-xl text-graphite-300 hover:bg-white/[0.06] hover:text-paper', (open || shading !== 'material') && 'bg-ice-400/[0.12] text-ice-300')}
        >
          <Icon name={cur.icon} />
        </button>
        {open && (
          <Panel className="a380-enter absolute right-0 top-11 z-30 w-60 p-1.5">
            {(Object.keys(SHADING_INFO) as Shading[]).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  set({ shading: id });
                  setOpen(false);
                }}
                className={cx('flex w-full flex-col rounded-lg px-2.5 py-2 text-left transition-colors', id === shading ? 'bg-white/[0.07] text-paper' : 'text-graphite-300 hover:bg-white/[0.04] hover:text-paper')}
              >
                <span className="text-[12.5px]">{SHADING_INFO[id].label}</span>
                <span className="text-[10.5px] text-graphite-400">{SHADING_INFO[id].hint}</span>
              </button>
            ))}
          </Panel>
        )}
      </div>
    );
  }
  return (
    <div role="radiogroup" aria-label="Viewport shading" className="flex items-center gap-0.5 rounded-xl bg-black/20 p-0.5">
      {SHADING_MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          role="radio"
          aria-checked={shading === m.id}
          aria-label={SHADING_INFO[m.id].label}
          title={`${SHADING_INFO[m.id].label}: ${SHADING_INFO[m.id].hint}`}
          onClick={() => set({ shading: m.id })}
          className={cx(
            'pointer-events-auto grid h-8 w-8 place-items-center rounded-lg transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-400/70',
            shading === m.id ? 'bg-ice-400/[0.14] text-ice-300 shadow-[inset_0_0_0_1px_rgba(111,211,239,0.25)]' : 'text-graphite-400 hover:bg-white/[0.06] hover:text-paper',
          )}
        >
          <Icon name={m.icon} size={16} />
        </button>
      ))}
    </div>
  );
}

const STATUS: Record<string, string> = { idle: 'Idle', building: 'Building BVH', compiling: 'Compiling shaders', rendering: 'Rendering', done: 'Converged', error: 'Error' };

function fmtTime(s: number): string {
  if (s < 60) return `${s.toFixed(1)} s`;
  return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

/** Controls and progress for the path-traced Rendered mode. */
export function RenderPanel({ compact = false }: { compact?: boolean }) {
  const r = useRender();
  const exposure = useUI((s) => s.exposure);
  const setUI = useUI((s) => s.set);
  const [open, setOpen] = useState(!compact);
  const [saved, setSaved] = useState<string | null>(null);
  const pct = r.status === 'building' ? r.progress : Math.min(1, r.samples / r.maxSamples);
  const fstops = [0.7, 1, 1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22];
  const fIndex = Math.max(0, fstops.findIndex((f) => f >= r.fStop - 1e-6));

  const header = (
    <div className="px-4 pb-3 pt-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon name="aperture" size={15} className="text-ice-400" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ice-400/90">Path tracer</span>
        </div>
        <div className="flex items-center gap-1">
          <span className={cx('font-mono text-[10.5px]', r.status === 'error' ? 'text-red-300' : r.status === 'done' ? 'text-emerald-300' : 'text-graphite-300')}>{STATUS[r.status]}</span>
          {compact && (
            <button type="button" aria-label={open ? 'Collapse render settings' : 'Expand render settings'} onClick={() => setOpen((o) => !o)} className="grid h-7 w-7 place-items-center rounded-lg text-graphite-300 hover:text-paper">
              <Icon name={open ? 'chevronUp' : 'chevronDown'} size={15} />
            </button>
          )}
        </div>
      </div>
      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/[0.06]" role="progressbar" aria-label="Render progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)}>
        <div className="h-full rounded-full bg-gradient-to-r from-ice-500 to-ice-300 transition-[width] duration-200" style={{ width: `${pct * 100}%` }} />
      </div>
      <div className="mt-2 flex items-baseline justify-between font-mono text-[10.5px] tabular-nums text-graphite-400">
        <span>
          <span className="text-paper/90">{r.samples}</span> / {r.maxSamples >= 100000 ? '∞' : r.maxSamples} spp
        </span>
        <span>{r.status === 'building' ? `${Math.round(r.progress * 100)}%` : fmtTime(r.elapsed)}</span>
        <span>{r.triangles ? `${(r.triangles / 1e6).toFixed(2)}M tris` : '—'}</span>
      </div>
      {r.error && <p className="mt-2 text-[11px] text-red-300">{r.error}</p>}
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant="accent"
          icon="download"
          className="flex-1"
          disabled={r.status === 'building' || r.status === 'error'}
          onClick={() => {
            const d = saveRender();
            setSaved(d ? `Saved ${d.width}×${d.height}` : 'Save failed');
          }}
        >
          Save PNG
        </Button>
        <Button size="sm" icon="reset" onClick={r.resync} title="Rebuild from the live scene (after animations or changes)">
          Re-sync
        </Button>
      </div>
      {saved && <p className="mt-1.5 font-mono text-[10.5px] text-graphite-400">{saved}</p>}
    </div>
  );

  return (
    <Panel className={cx('flex flex-col overflow-hidden', compact ? 'w-full' : 'max-h-full w-[300px]')} role="region" aria-label="Render settings">
      {header}
      {open && (
        <div className="a380-scroll min-h-0 flex-1 overflow-y-auto border-t border-white/[0.05]">
          <Group label="Sampling">
            <Segmented<string>
              size="sm"
              label="Samples"
              value={String(r.maxSamples)}
              onChange={(v) => r.set({ maxSamples: Number(v) })}
              options={[
                { value: '128', label: '128' },
                { value: '512', label: '512' },
                { value: '2048', label: '2048' },
                { value: '100000', label: '∞' },
              ]}
            />
            <Slider label="Light bounces" value={r.bounces} min={1} max={16} step={1} onChange={(v) => r.set({ bounces: v })} format={(v) => v.toFixed(0)} />
            <Slider label="Glossy filter" value={r.glossyFilter} min={0} max={1} onChange={(v) => r.set({ glossyFilter: v })} format={(v) => (v === 0 ? 'off' : v.toFixed(2))} />
            <Toggle label="Denoise" hint="Edge-aware filter, eases off as samples converge" checked={r.denoise} onChange={(v) => r.set({ denoise: v })} />
            {r.denoise && <Slider label="Denoise strength" value={r.denoiseStrength} min={0.1} max={1} onChange={(v) => r.set({ denoiseStrength: v })} format={(v) => `${Math.round(v * 100)}%`} />}
          </Group>
          <Group label="Camera">
            <Toggle label="Depth of field" hint="Thin-lens aperture with polygonal bokeh" checked={r.dof} onChange={(v) => r.set({ dof: v })} />
            <Slider label="Aperture" value={fIndex} min={0} max={fstops.length - 1} step={1} disabled={!r.dof} onChange={(v) => r.set({ fStop: fstops[v]! })} format={() => `f/${r.fStop}`} />
            <div className="flex items-center justify-between gap-2 py-1.5">
              <span className="text-[12.5px] text-paper/90">Focus</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[11px] text-graphite-300">{r.focusDistance > 0 ? `${r.focusDistance.toFixed(1)} m` : 'orbit target'}</span>
                <Button size="sm" icon="target" active={r.pickFocus} onClick={() => r.set({ pickFocus: !r.pickFocus })}>
                  {r.pickFocus ? 'Click model…' : 'Pick'}
                </Button>
                {r.focusDistance > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => r.set({ focusDistance: 0 })}>
                    Auto
                  </Button>
                )}
              </div>
            </div>
          </Group>
          <Group label="Image">
            <Segmented<ToneMap>
              size="sm"
              label="Tone mapping"
              value={r.toneMapping}
              onChange={(v) => r.set({ toneMapping: v })}
              options={[
                { value: 'neutral', label: 'Neutral' },
                { value: 'agx', label: 'AgX' },
                { value: 'aces', label: 'ACES' },
              ]}
            />
            <Slider label="Exposure" value={exposure} min={0.4} max={2} onChange={(v) => setUI({ exposure: v })} format={(v) => `${v.toFixed(2)}×`} />
            <div className="pt-1.5">
              <div className="mb-1.5 text-[12.5px] text-paper/90">Background</div>
              <Segmented<RenderBackground>
                size="sm"
                label="Background"
                value={r.background}
                onChange={(v) => r.set({ background: v })}
                options={[
                  { value: 'auto', label: 'Auto' },
                  { value: 'environment', label: 'HDRI' },
                  { value: 'color', label: 'Colour' },
                  { value: 'transparent', label: 'Alpha' },
                ]}
              />
            </div>
          </Group>
          <Group label="Output">
            <div className="mb-1.5 text-[12.5px] text-paper/90">Sampling resolution</div>
            <Segmented<string>
              size="sm"
              label="Sampling resolution"
              value={String(r.renderScale)}
              onChange={(v) => r.set({ renderScale: Number(v) })}
              options={[
                { value: '0.5', label: '50%' },
                { value: '0.75', label: '75%' },
                { value: '1', label: '100%' },
              ]}
            />
            <div className="mb-1.5 mt-3 text-[12.5px] text-paper/90">Image size</div>
            <Segmented<RenderSize>
              size="sm"
              label="Image size"
              value={r.size}
              onChange={(v) => r.set({ size: v })}
              options={[
                { value: 'screen', label: 'Screen' },
                { value: '2x', label: '2×' },
                { value: '4k', label: '4K' },
              ]}
            />
            <p className="mt-2 text-[10.5px] leading-relaxed text-graphite-400">The path tracer snapshots the scene: moving parts hold still. Re-sync after changing gear, flaps or doors.</p>
          </Group>
        </div>
      )}
    </Panel>
  );
}
