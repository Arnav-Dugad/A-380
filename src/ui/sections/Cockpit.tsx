import { useEffect, useRef, useState } from 'react';
import { SD_PAGES, displayState, getDisplays, type ScreenName, type SdPage } from '../../cockpit/displays';
import { firstPerson } from '../../camera/FirstPerson';
import { COCKPIT_VIEWS, CONTROL_LABELS, cockpitLights, operate } from '../../interior/CockpitScene';
import { useSim } from '../../state/sim';
import { Button, Group, Label, ScrollArea, SectionTitle, Toggle, cx } from '../kit';

/** Mirrors a live display canvas into the 2D panel for close reading. */
function ScreenMirror({ name, className }: { name: ScreenName; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const suite = getDisplays();
    const src = suite.canvases.get(name)!;
    const id = window.setInterval(() => {
      suite.update(performance.now());
      const c = ref.current;
      if (!c) return;
      c.width = src.width;
      c.height = src.height;
      c.getContext('2d')!.drawImage(src, 0, 0);
    }, 100);
    return () => window.clearInterval(id);
  }, [name]);
  return <canvas ref={ref} className={cx('w-full rounded-md border border-white/[0.08] bg-black', className)} aria-label={`${name} display`} />;
}

const PANEL_CONTROLS = ['BAT', 'EXT_PWR', 'APU_MASTER', 'APU_START', 'APU_BLEED', 'ENG_START', 'ENG_MASTER_1', 'ENG_MASTER_2', 'ENG_MASTER_3', 'ENG_MASTER_4', 'THRUST_1', 'FLAPS', 'SPEEDBRAKE', 'GEAR', 'AUTOBRAKE', 'PARK_BRAKE', 'LT_BEACON', 'LT_NAV', 'LT_STROBE', 'LT_LAND', 'SEAT_BELTS', 'CABIN_LT'];

export function CockpitPanel() {
  const [view, setView] = useState('captain');
  const [screen, setScreen] = useState<ScreenName>('PFD_C');
  const [page, setPage] = useState<SdPage>(displayState.sdPage);
  const [msg, setMsg] = useState<string | null>(null);
  const [dome, setDome] = useState(cockpitLights.dome);
  useSim((s) => s.version); // re-render with state changes
  return (
    <ScrollArea className="max-h-full">
      <SectionTitle eyebrow="Cockpit" title="Flight deck">
        Eight identical displays, side-sticks and a centre pedestal. Drag to look around, scroll to zoom; hover a control to identify it and click to operate it.
      </SectionTitle>
      <Group label="Viewpoint">
        <div className="grid grid-cols-3 gap-1.5">
          {Object.entries(COCKPIT_VIEWS).map(([id, v]) => (
            <Button
              key={id}
              size="sm"
              active={view === id}
              onClick={() => {
                setView(id);
                firstPerson.goTo(v.pose);
              }}
            >
              {v.label}
            </Button>
          ))}
        </div>
      </Group>
      <Group label="Displays">
        <div className="mb-2 flex flex-wrap gap-1">
          {(['PFD_C', 'ND_C', 'EWD', 'SD', 'MFD_C', 'OIT_C'] as ScreenName[]).map((n) => (
            <button key={n} type="button" onClick={() => setScreen(n)} className={cx('rounded-md px-2 py-1 font-mono text-[10.5px] transition-colors', screen === n ? 'bg-ice-400/[0.14] text-ice-300' : 'text-graphite-300 hover:text-paper')}>
              {n.replace('_C', '')}
            </button>
          ))}
        </div>
        <ScreenMirror name={screen} />
        {screen === 'SD' && (
          <div className="mt-2">
            <Label className="mb-1.5">System display page</Label>
            <div className="flex flex-wrap gap-1">
              {SD_PAGES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    displayState.sdPage = p;
                    displayState.autoSd = false;
                    setPage(p);
                  }}
                  className={cx('rounded border px-2 py-0.5 font-mono text-[10.5px]', page === p ? 'border-ice-400/50 text-ice-300' : 'border-white/[0.08] text-graphite-300 hover:text-paper')}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
      </Group>
      <Group label="Controls">
        <p className="mb-2 text-[11px] leading-relaxed text-graphite-400">The same actions as clicking the 3D controls — keyboard accessible.</p>
        <div className="grid grid-cols-2 gap-1">
          {PANEL_CONTROLS.map((id) => (
            <button key={id} type="button" onClick={() => setMsg(operate(id))} className="truncate rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 text-left text-[11px] text-paper/80 transition-colors hover:border-white/[0.14] hover:text-paper">
              {id === 'THRUST_1' ? 'Thrust levers (all)' : CONTROL_LABELS[id]}
            </button>
          ))}
        </div>
        {msg && <p className="mt-2 font-mono text-[11px] text-ice-300">{msg}</p>}
        <div className="mt-2">
          <Toggle
            label="Night lighting (flood lights)"
            checked={dome}
            onChange={(v) => {
              cockpitLights.dome = v;
              setDome(v);
            }}
          />
        </div>
      </Group>
      <Group label="Fidelity">
        <p className="text-[11px] leading-relaxed text-graphite-400">Display formats are inspired by Airbus conventions for education; they are not certified A380 symbology or logic.</p>
      </Group>
    </ScrollArea>
  );
}
