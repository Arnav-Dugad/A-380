import { useState } from 'react';
import { autopilot } from '../../cockpit/displays';
import { SCENARIOS } from '../../flight/scenarios';
import { resetFlight, startReplay } from '../../flight/FlightMode';
import { inputState, toggleAP } from '../../flight/input';
import { flight } from '../../sim/flight';
import { useSim } from '../../state/sim';
import { useUI, type FlightCam, type Weather } from '../../state/ui';
import { Button, Group, Kbd, Label, ScrollArea, SectionTitle, Segmented, Slider, cx } from '../kit';
import { useTouch } from '../useMedia';

const WEATHER: { value: Weather; label: string }[] = [
  { value: 'clear', label: 'Clear' },
  { value: 'overcast', label: 'Overcast' },
  { value: 'lightRain', label: 'Light rain' },
  { value: 'heavyRain', label: 'Heavy rain' },
  { value: 'fog', label: 'Fog' },
  { value: 'windy', label: 'Windy' },
];

function Stepper({ label, value, onChange, step, fmt }: { label: string; value: number; onChange: (v: number) => void; step: number; fmt?: (v: number) => string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-2 py-1">
      <span className="font-mono text-[10px] text-graphite-400">{label}</span>
      <div className="flex items-center gap-1">
        <button type="button" aria-label={`Decrease ${label}`} className="h-5 w-5 rounded text-graphite-300 hover:bg-white/[0.08]" onClick={() => onChange(value - step)}>
          −
        </button>
        <span className="w-14 text-center font-mono text-[11.5px] text-ice-300">{fmt ? fmt(value) : value}</span>
        <button type="button" aria-label={`Increase ${label}`} className="h-5 w-5 rounded text-graphite-300 hover:bg-white/[0.08]" onClick={() => onChange(value + step)}>
          +
        </button>
      </div>
    </div>
  );
}

export function FlightPanel() {
  const ui = useUI();
  const touch = useTouch();
  useSim((s) => s.version);
  const [, force] = useState(0);
  const upd = () => force((n) => n + 1);
  const scen = SCENARIOS.find((s) => s.id === ui.flightScenario)!;
  return (
    <ScrollArea className="max-h-full">
      <SectionTitle eyebrow="Flight" title="Simplified flight model">
        Six-degree-of-freedom educational model at a fixed 120 Hz step with an Airbus-style protected control law. Not a certified simulation.
      </SectionTitle>
      <Group label="Scenario">
        <div className="grid grid-cols-2 gap-1">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                ui.set({ flightScenario: s.id });
                window.setTimeout(resetFlight, 0);
              }}
              className={cx('rounded-md border px-2 py-1.5 text-left text-[11.5px] transition-colors', ui.flightScenario === s.id ? 'border-ice-400/40 bg-ice-400/[0.12] text-ice-300' : 'border-white/[0.06] text-paper/80 hover:border-white/[0.14]')}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-graphite-400">{scen.hint}</p>
        <div className="mt-2 flex gap-1.5">
          <Button size="sm" icon="reset" onClick={resetFlight}>
            Reset
          </Button>
          <Button size="sm" icon={ui.flightPaused ? 'play' : 'pause'} onClick={() => ui.set({ flightPaused: !ui.flightPaused })}>
            {ui.flightPaused ? 'Resume' : 'Pause'}
          </Button>
          <Button size="sm" icon="film" onClick={() => startReplay()}>
            Replay
          </Button>
        </div>
      </Group>
      <Group label="Camera">
        <Segmented<FlightCam>
          size="sm"
          value={ui.flightCam}
          onChange={(v) => ui.set({ flightCam: v })}
          options={[
            { value: 'chase', label: 'Chase' },
            { value: 'cockpit', label: 'Cockpit' },
            { value: 'wing', label: 'Wing' },
            { value: 'tower', label: 'Tower' },
            { value: 'flyby', label: 'Fly-by' },
          ]}
        />
      </Group>
      <Group label="Autopilot (FCU)">
        <div className="mb-2 flex gap-1.5">
          <Button size="sm" active={autopilot.ap} onClick={() => (toggleAP(), upd())}>
            AP
          </Button>
          <Button
            size="sm"
            active={autopilot.athr}
            onClick={() => {
              autopilot.athr = !autopilot.athr;
              if (autopilot.athr) autopilot.spd = Math.max(140, Math.round(flight.state.ias * 1.944));
              upd();
            }}
          >
            A/THR
          </Button>
          <Button
            size="sm"
            active={autopilot.vertical === 'V/S'}
            onClick={() => {
              autopilot.vertical = autopilot.vertical === 'V/S' ? 'ALT' : 'V/S';
              upd();
            }}
          >
            V/S
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-1">
          <Stepper label="SPD" value={autopilot.spd} step={5} onChange={(v) => ((autopilot.spd = Math.max(120, Math.min(340, v))), upd())} />
          <Stepper label="HDG" value={autopilot.hdg} step={5} fmt={(v) => String(((v % 360) + 360) % 360).padStart(3, '0')} onChange={(v) => ((autopilot.hdg = ((v % 360) + 360) % 360), (autopilot.lateral = 'HDG'), upd())} />
          <Stepper label="ALT" value={autopilot.alt} step={500} onChange={(v) => ((autopilot.alt = Math.max(0, Math.min(43000, v))), upd())} />
          <Stepper label="V/S" value={autopilot.vs} step={500} onChange={(v) => ((autopilot.vs = Math.max(-6000, Math.min(6000, v))), upd())} />
        </div>
      </Group>
      <Group label="Flight control law">
        <Segmented
          size="sm"
          value={flight.law}
          onChange={(v) => ((flight.law = v), upd())}
          options={[
            { value: 'normal', label: 'Normal (protected)' },
            { value: 'direct', label: 'Direct (unprotected)' },
          ]}
        />
      </Group>
      <Group label="Weather & time">
        <div className="flex flex-wrap gap-1">
          {WEATHER.map((w) => (
            <button key={w.value} type="button" onClick={() => ui.set({ weather: w.value })} className={cx('rounded-md border px-2 py-1 text-[11px] transition-colors', ui.weather === w.value ? 'border-ice-400/40 bg-ice-400/[0.12] text-ice-300' : 'border-white/[0.06] text-graphite-300 hover:text-paper')}>
              {w.label}
            </button>
          ))}
        </div>
        <Slider label="Time of day" value={ui.timeOfDay} min={4} max={22} step={0.25} onChange={(v) => ui.set({ timeOfDay: v })} format={(v) => `${Math.floor(v).toString().padStart(2, '0')}:${String(Math.round((v % 1) * 60)).padStart(2, '0')}`} />
      </Group>
      {touch && (
        <Group label="Touch controls">
          <ul className="space-y-1 text-[11.5px] leading-relaxed text-paper/80">
            <li>Left stick: pitch and roll (steers the nose wheel below 25 kt).</li>
            <li>Right slider: thrust levers; slide to the top for TOGA.</li>
            <li>Buttons: gear, flaps, wheel brakes (hold), speed brake, autopilot and camera.</li>
          </ul>
        </Group>
      )}
      <Group label="Controls" className={touch ? 'hidden' : undefined} aside={<span className="font-mono text-[10px] text-graphite-500">{inputState.gamepad ? 'gamepad connected' : 'keyboard'}</span>}>
        <dl className="grid grid-cols-[86px_1fr] gap-y-1 text-[11.5px]">
          {[
            ['W / S', 'Pitch down / up'],
            ['A / D', 'Roll (tiller on ground)'],
            ['Q / E', 'Rudder'],
            ['Shift / Ctrl', 'Thrust up / down'],
            ['B · K', 'Brakes · parking brake'],
            ['G · F / V', 'Gear · flaps down / up'],
            ['/ · Y · T', 'Speed brake · arm · reverse'],
            ['U · J', 'Autopilot · autothrust'],
            ['C · Space', 'Camera · pause'],
          ].map(([k, d]) => (
            <div key={k} className="contents">
              <dt>
                <Kbd>{k}</Kbd>
              </dt>
              <dd className="text-paper/80">{d}</dd>
            </div>
          ))}
        </dl>
        <Label className="mt-2.5 text-[9px] text-graphite-500">Gamepad: left stick pitch/roll · right stick rudder · RT thrust · LT brakes · A gear · B/X flaps · Y speed brake</Label>
      </Group>
    </ScrollArea>
  );
}
