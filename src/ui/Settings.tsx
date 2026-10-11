import { useUI, type Quality } from '../state/ui';
import { Icon } from './icons';
import { Group, Label, Panel, Segmented, Slider, Toggle } from './kit';

export const QUALITY_INFO: Record<Quality, string> = {
  ultra: 'Full-resolution rendering, 4K shadows, ambient occlusion, high-detail geometry.',
  high: 'High-detail geometry, 2K shadows and ambient occlusion. Recommended for desktop GPUs.',
  balanced: 'High-detail geometry, softer shadows, no ambient occlusion, capped resolution.',
  performance: 'Low-detail geometry, contact shadows only and reduced resolution for mobile devices.',
};

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const s = useUI();
  return (
    <Panel className="a380-enter w-[340px] max-w-[calc(100vw-32px)]" role="dialog" aria-label="Graphics and settings">
      <div className="flex items-center justify-between px-5 pb-2 pt-4">
        <Label className="text-ice-400/90">Settings</Label>
        <button type="button" onClick={onClose} aria-label="Close settings" className="grid h-7 w-7 place-items-center rounded-lg text-graphite-400 hover:bg-white/[0.06] hover:text-paper">
          <Icon name="close" size={15} />
        </button>
      </div>
      <Group label="Graphics quality">
        <Segmented<Quality>
          value={s.quality}
          onChange={(v) => s.set({ quality: v })}
          options={[
            { value: 'ultra', label: 'Ultra' },
            { value: 'high', label: 'High' },
            { value: 'balanced', label: 'Balanced' },
            { value: 'performance', label: 'Perf.' },
          ]}
        />
        <p className="mt-2 text-[11px] leading-relaxed text-graphite-400">{QUALITY_INFO[s.quality]}</p>
      </Group>
      <Group label="Image">
        <Slider label="Exposure" value={s.exposure} min={0.4} max={2} onChange={(v) => s.set({ exposure: v })} format={(v) => `${v.toFixed(2)}×`} />
        <Slider label="Field of view" value={s.fov} min={18} max={70} step={1} onChange={(v) => s.set({ fov: v })} format={(v) => `${v.toFixed(0)}°`} />
      </Group>
      <Group label="Interface">
        <Toggle label="Performance overlay" hint="FPS, draw calls, triangles, GPU memory" checked={s.showStats} onChange={(v) => s.set({ showStats: v })} />
        <Toggle label="Sound effects" hint="Synthesised locally; off by default" checked={s.audio} onChange={(v) => s.set({ audio: v })} />
      </Group>
    </Panel>
  );
}
