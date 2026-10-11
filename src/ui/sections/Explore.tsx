import { useState } from 'react';
import { PRESETS, goPreset } from '../../camera/controls';
import { runDemo } from '../../sim/demos';
import { systems } from '../../sim/systems';
import { useSim } from '../../state/sim';
import { useUI } from '../../state/ui';
import { ENVIRONMENTS } from '../TopBar';
import { Button, Group, ScrollArea, SectionTitle, cx } from '../kit';
import { Icon } from '../icons';

export function ExplorePanel() {
  const env = useUI((s) => s.env);
  const set = useUI((s) => s.set);
  const cinematic = useUI((s) => s.cinematic);
  const maintenance = useSim((s) => s.s.maintenance);
  const lightsOn = useSim((s) => s.s.lights.nav && s.s.lights.beacon);
  const [msg, setMsg] = useState<string | null>(null);
  const demo = (d: Parameters<typeof runDemo>[0]) => setMsg(runDemo(d));
  return (
    <ScrollArea className="max-h-full">
      <SectionTitle eyebrow="Explore" title="Airbus A380-800">
        The world's largest passenger airliner: two full-length decks, four Trent 900 engines and a 79.75 m wing. Drag to orbit, scroll to zoom, click any component to inspect it.
      </SectionTitle>
      <Group label="Camera">
        <div className="grid grid-cols-3 gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => void goPreset(p.id)}
              className="h-8 rounded-lg border border-white/[0.06] bg-white/[0.025] text-[11.5px] text-paper/80 transition-colors hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-paper"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-1.5">
          <Button size="sm" icon={cinematic ? 'pause' : 'film'} active={!!cinematic} onClick={() => set({ cinematic: cinematic ? null : 'grand' })} className="flex-1">
            {cinematic ? 'Stop tour' : 'Cinematic tour'}
          </Button>
          <Button size="sm" icon="walk" onClick={() => set({ section: 'cabin' })} className="flex-1">
            Walk the cabin
          </Button>
        </div>
      </Group>
      <Group label="Bring it to life">
        <div className="grid grid-cols-2 gap-1.5">
          <Button size="sm" icon="wheel" onClick={() => demo('gear')}>
            Gear swing
          </Button>
          <Button size="sm" icon="layers" onClick={() => demo('flaps')}>
            Flaps & slats
          </Button>
          <Button size="sm" icon="fan" onClick={() => demo('engines')}>
            Engines
          </Button>
          <Button size="sm" icon="door" onClick={() => demo('doors')}>
            Passenger doors
          </Button>
          <Button size="sm" icon="door" onClick={() => demo('cargo')}>
            Cargo doors
          </Button>
          <Button
            size="sm"
            icon="bulb"
            active={lightsOn}
            onClick={() => {
              if (!systems.state.elec.dc) systems.setBattery(true);
              for (const k of ['nav', 'beacon', 'strobe', 'logo', 'wing'] as const) systems.setLight(k, !lightsOn);
            }}
          >
            Exterior lights
          </Button>
        </div>
        {maintenance && (
          <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11.5px] text-graphite-300">
            <span>Aircraft on maintenance jacks</span>
            <button type="button" className="text-ice-300 hover:underline" onClick={() => setMsg(systems.setMaintenance(false).message)}>
              Lower
            </button>
          </div>
        )}
        {msg && <p className="mt-2.5 text-[11.5px] leading-relaxed text-graphite-300">{msg}</p>}
        <button type="button" onClick={() => { systems.applyScenario('coldDark'); setMsg('Aircraft reset to cold & dark'); }} className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-graphite-400 hover:text-paper">
          <Icon name="reset" size={13} /> Reset aircraft state
        </button>
      </Group>
      <Group label="Environment">
        <div className="grid grid-cols-5 gap-1.5">
          {ENVIRONMENTS.map((e) => (
            <button
              key={e.id}
              type="button"
              title={e.label}
              aria-label={e.label}
              onClick={() => set({ env: e.id })}
              className={cx(
                'flex h-14 flex-col items-center justify-center gap-1 rounded-lg border text-[9.5px] transition-colors',
                env === e.id ? 'border-ice-400/40 bg-ice-400/[0.1] text-ice-300' : 'border-white/[0.06] bg-white/[0.02] text-graphite-400 hover:text-paper',
              )}
            >
              <Icon name={e.icon} size={17} />
              {e.label.split(' ')[0]}
            </button>
          ))}
        </div>
      </Group>
    </ScrollArea>
  );
}
