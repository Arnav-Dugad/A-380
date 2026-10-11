import { selectPart } from '../../aircraft/interaction';
import { PARTS } from '../../data/parts';
import { useUI, type ExplodeGroup, type SystemLayer } from '../../state/ui';
import { Group, Label, ScrollArea, SectionTitle, Segmented, Slider, Toggle, cx } from '../kit';

const LAYERS: { value: SystemLayer; label: string }[] = [
  { value: 'none', label: 'All' },
  { value: 'structure', label: 'Structure' },
  { value: 'flightControls', label: 'Controls' },
  { value: 'propulsion', label: 'Propulsion' },
  { value: 'landingGear', label: 'Gear' },
  { value: 'doors', label: 'Doors' },
];

const GROUPS: { title: string; ids: string[] }[] = [
  { title: 'Airframe', ids: ['fuselage', 'bellyFairing', 'cockpitWindows', 'cabinWindows', 'antennas', 'apu'] },
  { title: 'Wing', ids: ['wing', 'slat', 'droopNose', 'flap', 'flapTrackFairing', 'aileron', 'spoiler', 'wingtipFence'] },
  { title: 'Empennage', ids: ['htp', 'elevator', 'vtp', 'rudder'] },
  { title: 'Propulsion', ids: ['engineInlet', 'engineFan', 'fanCowl', 'thrustReverser', 'engineCore', 'pylon'] },
  { title: 'Landing gear', ids: ['noseGear', 'wingGear', 'bodyGear', 'wheel', 'brakes', 'gearDoor'] },
  { title: 'Doors', ids: ['passengerDoor', 'cargoDoor'] },
];

export function AnatomyPanel() {
  const explode = useUI((s) => s.explode);
  const explodeGroup = useUI((s) => s.explodeGroup);
  const xray = useUI((s) => s.xray);
  const isolate = useUI((s) => s.isolate);
  const selected = useUI((s) => s.selected);
  const set = useUI((s) => s.set);
  const setXRay = useUI((s) => s.setXRay);
  return (
    <ScrollArea className="max-h-full">
      <SectionTitle eyebrow="Anatomy" title="Assemblies & structure">
        Separate the major assemblies, see through the skin into the structure and cabin, or isolate one system.
      </SectionTitle>
      <Group label="Exploded view">
        <Slider label="Separation" value={explode} onChange={(v) => set({ explode: v })} format={(v) => `${Math.round(v * 100)} %`} />
        <div className="mt-2">
          <Segmented<ExplodeGroup>
            size="sm"
            value={explodeGroup}
            onChange={(v) => set({ explodeGroup: v })}
            options={[
              { value: 'all', label: 'All' },
              { value: 'wings', label: 'Wings' },
              { value: 'engines', label: 'Engines' },
              { value: 'gear', label: 'Gear' },
              { value: 'empennage', label: 'Tail' },
              { value: 'fuselage', label: 'Body' },
            ]}
          />
        </div>
      </Group>
      <Group label="X-ray & cutaway">
        <Toggle label="X-ray skin" hint="Translucent outer skin" checked={xray.enabled} onChange={(v) => setXRay({ enabled: v })} />
        <Slider label="Skin opacity" value={xray.skinOpacity} min={0.04} max={0.6} onChange={(v) => setXRay({ skinOpacity: Math.round(v * 50) / 50 })} format={(v) => `${Math.round(v * 100)} %`} disabled={!xray.enabled} />
        <Slider label="Longitudinal section" value={xray.clip} min={0} max={1} onChange={(v) => setXRay({ clip: v })} format={(v) => (v === 0 ? 'off' : `${(v * 72.72).toFixed(1)} m`)} />
        <Slider label="Horizontal section" value={xray.clipVertical} min={0} max={1} onChange={(v) => setXRay({ clipVertical: v })} format={(v) => (v === 0 ? 'off' : `${(24.09 * (1 - v)).toFixed(1)} m`)} />
        <div className="mt-1 grid grid-cols-1">
          <Toggle label="Structure (frames, spars, floors)" checked={xray.structure} onChange={(v) => setXRay({ structure: v })} />
          <Toggle label="Passenger cabin" checked={xray.cabin} onChange={(v) => setXRay({ cabin: v })} />
          <Toggle label="Cargo holds & ULDs" checked={xray.cargo} onChange={(v) => setXRay({ cargo: v })} />
        </div>
      </Group>
      <Group label="Isolate system">
        <div className="flex flex-wrap gap-1.5">
          {LAYERS.map((l) => (
            <button
              key={l.value}
              type="button"
              onClick={() => set({ isolate: l.value })}
              className={cx(
                'h-7 rounded-md border px-2.5 text-[11.5px] transition-colors',
                isolate === l.value ? 'border-ice-400/40 bg-ice-400/[0.12] text-ice-300' : 'border-white/[0.06] text-graphite-300 hover:text-paper',
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      </Group>
      <Group label="Component browser">
        <div className="space-y-3">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <Label className="mb-1 text-[9px] text-graphite-400">{g.title}</Label>
              <div className="flex flex-wrap gap-1">
                {g.ids
                  .filter((id) => PARTS[id])
                  .map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => selectPart(id)}
                      className={cx(
                        'rounded-md px-2 py-1 text-[11.5px] transition-colors',
                        selected === id ? 'bg-ice-400/[0.14] text-ice-300' : 'text-paper/75 hover:bg-white/[0.05] hover:text-paper',
                      )}
                    >
                      {PARTS[id]!.name}
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </Group>
    </ScrollArea>
  );
}
