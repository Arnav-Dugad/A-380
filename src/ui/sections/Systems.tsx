import { useState, type ReactNode } from 'react';
import { CONF, FLAP_LEVER, LIGHT_NAMES, systems, type Autobrake, type LightKey, type Scenario } from '../../sim/systems';
import { useSim } from '../../state/sim';
import { Button, Group, Label, ScrollArea, SectionTitle, Segmented, Slider, Toggle, cx } from '../kit';

type Tab = 'power' | 'engines' | 'gear' | 'controls' | 'doors' | 'lights';

const SCENARIOS: { id: Scenario; label: string }[] = [
  { id: 'coldDark', label: 'Cold & dark' },
  { id: 'turnaround', label: 'Turnaround' },
  { id: 'apuStart', label: 'APU running' },
  { id: 'taxi', label: 'Ready to taxi' },
];

/** Overhead-style push button with annunciator. */
function PushButton({ label, on, onClick, fault, sub }: { label: string; on: boolean; onClick: () => void; fault?: boolean; sub?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="group flex flex-col items-center gap-1.5 rounded-lg border border-white/[0.06] bg-black/25 px-1.5 py-2 transition-colors hover:border-white/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-400/70"
    >
      <span className="flex h-7 w-12 flex-col items-center justify-center rounded-[4px] border border-white/10 bg-[#0d1013] font-mono text-[8px] leading-tight shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <span className={cx(fault ? 'text-amber-warn' : 'text-transparent')}>FAULT</span>
        <span className={cx(on ? 'text-ice-300 [text-shadow:0_0_8px_rgba(111,211,239,0.7)]' : 'text-white/15')}>{sub ?? 'ON'}</span>
      </span>
      <span className="text-center text-[10px] leading-tight text-graphite-300 group-hover:text-paper">{label}</span>
    </button>
  );
}

function Gauge({ label, value, max, unit, tone = 'ice' }: { label: string; value: number; max: number; unit: string; tone?: 'ice' | 'green' | 'amber' }) {
  const pct = Math.max(0, Math.min(1, value / max));
  const col = tone === 'green' ? '#59d98e' : tone === 'amber' ? '#ffb347' : '#6fd3ef';
  const a = -120 + pct * 240;
  const r = 22;
  const x = 28 + r * Math.sin((a * Math.PI) / 180);
  const y = 28 - r * Math.cos((a * Math.PI) / 180);
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 56 44" className="h-11 w-14">
        <path d="M8.95 39 A22 22 0 1 1 47.05 39" fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="3" />
        <path d={`M8.95 39 A22 22 0 ${a > 60 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}`} fill="none" stroke={col} strokeWidth="3" strokeLinecap="round" opacity={pct > 0.005 ? 1 : 0} />
        <text x="28" y="32" textAnchor="middle" fontSize="10" fill="#eef1f4" fontFamily="JetBrains Mono Variable, monospace">
          {value >= 100 ? value.toFixed(0) : value.toFixed(1)}
        </text>
      </svg>
      <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-graphite-400">
        {label} <span className="text-graphite-500">{unit}</span>
      </span>
    </div>
  );
}

function Readout({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between border-b border-white/[0.04] py-1 last:border-0">
      <span className="text-[11.5px] text-graphite-400">{label}</span>
      <span className="font-mono text-[11.5px] tabular-nums text-paper">{children}</span>
    </div>
  );
}

function PowerTab() {
  const s = useSim((x) => x.s);
  return (
    <>
      <Group label="Electrical">
        <div className="grid grid-cols-4 gap-1.5">
          <PushButton label="Battery" on={s.elec.battery} onClick={() => systems.setBattery(!s.elec.battery)} />
          <PushButton label="Ext power" sub={s.elec.extOn ? 'ON' : 'AVAIL'} on={s.elec.extOn || s.elec.extAvail} onClick={() => systems.setExternalPower(!s.elec.extOn)} />
          <PushButton label="APU master" on={s.apu.master} onClick={() => systems.setApuMaster(!s.apu.master)} />
          <PushButton label="APU start" sub={s.apu.state === 'running' ? 'AVAIL' : 'ON'} on={s.apu.state === 'starting' || s.apu.state === 'running'} onClick={() => systems.startApu()} />
        </div>
        <div className="mt-3">
          <Readout label="AC network">{s.elec.ac ? s.elec.sources.join(' + ') : 'UNPOWERED'}</Readout>
          <Readout label="DC network">{s.elec.dc ? (s.elec.ac ? 'TR units' : 'BATTERY') : 'OFF'}</Readout>
        </div>
      </Group>
      <Group label="APU & bleed">
        <div className="flex items-center justify-around">
          <Gauge label="APU N" value={s.apu.n} max={100} unit="%" tone={s.apu.state === 'running' ? 'green' : 'ice'} />
          <Gauge label="APU EGT" value={s.apu.egt} max={900} unit="°C" tone="amber" />
          <PushButton label="APU bleed" on={s.apu.bleed} onClick={() => systems.setApuBleed(!s.apu.bleed)} />
        </div>
        <Readout label="Bleed air for engine start">{s.bleedAvailable ? 'AVAILABLE' : '—'}</Readout>
      </Group>
      <Group label="Hydraulics · 5,000 psi">
        <div className="flex justify-around">
          <Gauge label="Green" value={s.hyd.green / 1000} max={5.5} unit="kpsi" tone="green" />
          <Gauge label="Yellow" value={s.hyd.yellow / 1000} max={5.5} unit="kpsi" tone="amber" />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-graphite-400">Green is pressurised by engines 1 & 2, Yellow by engines 3 & 4. Electro-hydrostatic actuators keep flight controls powered from AC.</p>
      </Group>
    </>
  );
}

function EnginesTab() {
  const s = useSim((x) => x.s);
  const lever = s.engines[0]!.lever;
  return (
    <>
      <Group label="Start panel">
        <Segmented value={s.engineMode} onChange={(v) => systems.setEngineMode(v)} options={[{ value: 'CRANK', label: 'Crank' }, { value: 'NORM', label: 'Norm' }, { value: 'IGN/START', label: 'Ign / Start' }]} />
        <div className="mt-2.5 grid grid-cols-4 gap-1.5">
          {s.engines.map((e, i) => (
            <PushButton key={i} label={`Master ${i + 1}`} sub={e.state === 'starting' ? 'START' : 'ON'} on={e.master} fault={e.state === 'starting' && e.startProgress < 0.2} onClick={() => systems.setEngineMaster(i, !e.master)} />
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-graphite-400">
          <span>Simulation speed</span>
          <Segmented size="sm" value={String(s.timeScale)} onChange={(v) => systems.setTimeScale(Number(v))} options={[{ value: '1', label: '1×' }, { value: '2', label: '2×' }, { value: '4', label: '4×' }]} />
        </div>
      </Group>
      <Group label="Engine display">
        <div className="grid grid-cols-4 gap-1">
          {s.engines.map((e, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <Gauge label={`N1 ${i + 1}`} value={e.n1} max={105} unit="%" tone={e.state === 'running' ? 'green' : 'ice'} />
              <span className="font-mono text-[10px] text-graphite-400">EGT {e.egt.toFixed(0)}</span>
              <span className="font-mono text-[10px] text-graphite-500">N2 {e.n2.toFixed(0)}</span>
              <span className={cx('font-mono text-[9px] uppercase', e.state === 'running' ? 'text-green-ok' : e.state === 'starting' ? 'text-amber-warn' : 'text-graphite-500')}>{e.state}</span>
            </div>
          ))}
        </div>
      </Group>
      <Group label="Thrust levers">
        <Slider label="All engines" value={lever} onChange={(v) => systems.setThrust(v)} format={(v) => (v < 0.02 ? 'IDLE' : v > 0.98 ? 'TOGA' : `${Math.round(v * 100)} %`)} />
        <div className="mt-1 flex gap-1.5">
          <Button size="sm" active={s.engines[1]!.reverseCmd} onClick={() => systems.setReverse(!s.engines[1]!.reverseCmd)}>
            Reverse (eng 2 & 3)
          </Button>
          <span className="self-center font-mono text-[10.5px] text-graphite-400">REV {Math.round(s.engines[1]!.reverser * 100)} %</span>
        </div>
      </Group>
    </>
  );
}

function GearTab() {
  const s = useSim((x) => x.s);
  const g = s.gear;
  const ab: Autobrake[] = ['DISARM', 'LO', '2', '3', 'HI', 'RTO'];
  return (
    <>
      <Group label="Landing gear">
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              aria-label={`Gear lever ${g.lever}`}
              onClick={() => systems.setGearLever(g.lever === 'down' ? 'up' : 'down')}
              className="relative h-24 w-11 rounded-full border border-white/10 bg-black/30 transition-colors hover:border-white/20"
            >
              <span className={cx('absolute left-1/2 h-9 w-9 -translate-x-1/2 rounded-full border border-white/20 bg-gradient-to-b from-[#e9edf0] to-[#9aa3ad] shadow-lg transition-[top] duration-500', g.lever === 'up' ? 'top-1' : 'top-[52px]')} />
            </button>
            <span className="font-mono text-[10px] text-graphite-300">{g.lever.toUpperCase()}</span>
          </div>
          <div className="flex-1">
            <div className="mb-2 flex gap-1.5">
              {['NOSE', 'WING', 'BODY'].map((k) => (
                <span key={k} className={cx('flex-1 rounded border py-1 text-center font-mono text-[9.5px]', g.position < 0.01 ? 'border-green-ok/40 text-green-ok' : g.inTransit ? 'border-red-warn/40 text-red-warn' : 'border-white/10 text-graphite-500')}>
                  {k}
                </span>
              ))}
            </div>
            <Readout label="Gear position">{(g.position * 100).toFixed(0)} % up</Readout>
            <Readout label="Doors">{(g.doors * 100).toFixed(0)} % open</Readout>
            <Readout label="Weight on wheels">{g.wow ? 'YES' : 'NO'}</Readout>
          </div>
        </div>
        <Toggle label="Maintenance jacks" hint="Lifts the aircraft so the gear can be swung on the ground" checked={s.maintenance} onChange={(v) => systems.setMaintenance(v)} />
        <Button size="sm" className="mt-1" onClick={() => systems.gravityExtension()}>
          Gravity extension
        </Button>
      </Group>
      <Group label="Brakes & steering">
        <Toggle label="Parking brake" checked={s.brakes.parking} onChange={(v) => systems.setParkingBrake(v)} />
        <Label className="mb-1.5 mt-2">Autobrake</Label>
        <Segmented size="sm" value={s.brakes.autobrake} onChange={(v) => systems.setAutobrake(v)} options={ab.map((a) => ({ value: a, label: a === 'DISARM' ? 'OFF' : a }))} />
        <Slider label="Nose-wheel tiller" value={s.controls.tiller} min={-1} max={1} onChange={(v) => systems.setTiller(v)} format={() => `${s.gear.steering.toFixed(0)}°`} />
        <Readout label="Brake temperature">{s.brakes.temp.toFixed(0)} °C</Readout>
      </Group>
    </>
  );
}

function ControlsTab() {
  const s = useSim((x) => x.s);
  const c = s.controls;
  return (
    <>
      <Group label="Flaps & slats">
        <div className="flex gap-1">
          {FLAP_LEVER.map((l, i) => (
            <button
              key={l}
              type="button"
              onClick={() => systems.setFlapLever(i)}
              className={cx('h-8 flex-1 rounded-md border font-mono text-[11px] transition-colors', s.highLift.lever === i ? 'border-ice-400/50 bg-ice-400/[0.14] text-ice-300' : 'border-white/[0.07] text-graphite-300 hover:text-paper')}
            >
              {l}
            </button>
          ))}
        </div>
        <Readout label="Configuration">{CONF[s.highLift.conf]!.label}</Readout>
        <Readout label="Slats / flaps">
          {s.highLift.slat.toFixed(1)}° / {s.highLift.flap.toFixed(1)}°
        </Readout>
      </Group>
      <Group label="Speed brake & spoilers">
        <Slider label="Speed brake lever" value={s.spoilers.lever} onChange={(v) => systems.setSpeedbrake(v)} format={(v) => (v < 0.02 ? 'RET' : `${Math.round(v * 100)} %`)} />
        <Toggle label="Ground spoilers armed" checked={s.spoilers.armed} onChange={(v) => systems.armSpoilers(v)} />
      </Group>
      <Group label="Side-stick & pedals">
        <SideStick />
        <Slider label="Rudder pedals" value={c.yaw} min={-1} max={1} onChange={(v) => systems.setFlightControls(c.pitch, c.roll, v)} format={() => `${c.rudder.toFixed(1)}°`} />
        <div className="mt-1 grid grid-cols-2 gap-x-4">
          <Readout label="Elevator">{c.elevator.toFixed(1)}°</Readout>
          <Readout label="Rudder">{c.rudder.toFixed(1)}°</Readout>
          <Readout label="Aileron L">{c.aileronL.toFixed(1)}°</Readout>
          <Readout label="Aileron R">{c.aileronR.toFixed(1)}°</Readout>
        </div>
      </Group>
    </>
  );
}

/** Drag pad standing in for the side-stick (springs back to neutral on release). */
function SideStick() {
  const c = useSim((x) => x.s.controls);
  const [drag, setDrag] = useState(false);
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 2 - 1;
    const y = ((e.clientY - r.top) / r.height) * 2 - 1;
    systems.setFlightControls(Math.max(-1, Math.min(1, y)), Math.max(-1, Math.min(1, x)), systems.state.controls.yaw);
  };
  const release = () => {
    setDrag(false);
    systems.setFlightControls(0, 0, systems.state.controls.yaw);
  };
  return (
    <div className="flex items-center gap-4">
      <div
        role="slider"
        aria-label="Side-stick: drag to command pitch and roll"
        aria-valuenow={Math.round(c.pitch * 100)}
        tabIndex={0}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag(true);
          move(e);
        }}
        onPointerMove={move}
        onPointerUp={release}
        onPointerCancel={release}
        className="a380-grid relative h-28 w-28 cursor-grab touch-none rounded-xl border border-white/[0.08] bg-black/30 active:cursor-grabbing"
      >
        <div className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
        <div className="absolute inset-y-0 left-1/2 w-px bg-white/10" />
        <div
          className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ice-300 bg-ice-400/30 shadow-[0_0_12px_rgba(111,211,239,0.5)]"
          style={{ left: `${50 + c.roll * 45}%`, top: `${50 + c.pitch * 45}%` }}
        />
      </div>
      <p className="flex-1 text-[11px] leading-relaxed text-graphite-400">Drag to deflect: pull back for nose-up (elevators trailing-edge up), sideways to roll (ailerons and outboard spoilers). Releases to neutral.</p>
    </div>
  );
}

function DoorsTab() {
  const doors = useSim((x) => x.s.doors);
  const pax = Object.values(doors).filter((d) => d.kind === 'passenger');
  const cargo = Object.values(doors).filter((d) => d.kind === 'cargo');
  const order = (id: string) => (id.startsWith('U') ? 10 : 0) + Number(id[1]);
  return (
    <>
      <Group label="Passenger doors" aside={<span className="font-mono text-[10px] text-graphite-500">open · slide</span>}>
        {(['L', 'R'] as const).map((side) => (
          <div key={side} className="mb-2">
            <Label className="mb-1 text-[9px]">{side === 'L' ? 'Left side' : 'Right side'}</Label>
            <div className="grid grid-cols-4 gap-1">
              {pax
                .filter((d) => d.id.endsWith(side))
                .sort((a, b) => order(a.id) - order(b.id))
                .map((d) => (
                  <div key={d.id} className="flex items-center gap-1 rounded-md border border-white/[0.06] bg-black/20 p-1">
                    <button type="button" onClick={() => systems.setDoor(d.id, d.target === 0)} className={cx('flex-1 rounded px-1 py-1 font-mono text-[10.5px] transition-colors', d.position > 0.02 ? 'text-amber-warn' : 'text-paper/80 hover:text-paper')} title={`Open/close ${d.id}`}>
                      {d.id.slice(0, 2)}
                    </button>
                    <button type="button" onClick={() => systems.armDoor(d.id, !d.armed)} className={cx('h-4 w-4 rounded-sm border text-[8px]', d.armed ? 'border-ice-400/60 bg-ice-400/30' : 'border-white/15')} aria-label={`${d.armed ? 'Disarm' : 'Arm'} slide ${d.id}`} title={`${d.armed ? 'Disarm' : 'Arm'} slide`} />
                  </div>
                ))}
            </div>
          </div>
        ))}
        <div className="flex gap-1.5">
          <Button size="sm" onClick={() => Object.keys(doors).forEach((id) => doors[id]!.kind === 'passenger' && systems.armDoor(id, true))}>
            Arm all slides
          </Button>
          <Button size="sm" onClick={() => Object.keys(doors).forEach((id) => doors[id]!.kind === 'passenger' && systems.armDoor(id, false))}>
            Disarm all
          </Button>
        </div>
      </Group>
      <Group label="Cargo doors (right side)">
        <div className="grid grid-cols-3 gap-1.5">
          {cargo.map((d) => (
            <Button key={d.id} size="sm" active={d.target === 1} onClick={() => systems.setDoor(d.id, d.target === 0)}>
              {d.id === 'FWD_CARGO' ? 'Forward' : d.id === 'AFT_CARGO' ? 'Aft' : 'Bulk'} {Math.round(d.position * 100)}%
            </Button>
          ))}
        </div>
      </Group>
    </>
  );
}

function LightsTab() {
  const s = useSim((x) => x.s);
  return (
    <>
      <Group label="Exterior lights">
        {(Object.keys(LIGHT_NAMES) as LightKey[]).map((k) => (
          <Toggle key={k} label={LIGHT_NAMES[k]} checked={s.lights[k]} onChange={(v) => systems.setLight(k, v)} hint={!s.elec.dc && s.lights[k] ? 'No electrical power' : undefined} />
        ))}
      </Group>
      <Group label="Cabin">
        <Segmented size="sm" value={s.cabinLight} onChange={(v) => systems.setCabinLight(v)} options={[{ value: 'off', label: 'Off' }, { value: 'boarding', label: 'Boarding' }, { value: 'day', label: 'Day' }, { value: 'night', label: 'Night' }, { value: 'ambient', label: 'Ambient' }]} />
        <Toggle label="Seat-belt signs" checked={s.seatbelt} onChange={(v) => systems.setSeatbelt(v)} />
      </Group>
    </>
  );
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'power', label: 'Power' },
  { id: 'engines', label: 'Engines' },
  { id: 'gear', label: 'Gear' },
  { id: 'controls', label: 'Controls' },
  { id: 'doors', label: 'Doors' },
  { id: 'lights', label: 'Lights' },
];

export function SystemsPanel() {
  const [tab, setTab] = useState<Tab>('power');
  const ann = useSim((x) => x.s.annunciations);
  return (
    <div className="flex max-h-full min-h-0 flex-col">
      <SectionTitle eyebrow="Systems" title="Aircraft systems">
        A shared, deterministic systems model drives the 3D aircraft, cockpit displays and this panel. Interlocks are enforced: try starting an engine without bleed air.
      </SectionTitle>
      <div className="px-5 pb-3">
        <div className="mb-2 flex flex-wrap gap-1">
          {SCENARIOS.map((sc) => (
            <button key={sc.id} type="button" onClick={() => systems.applyScenario(sc.id)} className="rounded-md border border-white/[0.06] px-2 py-1 text-[11px] text-graphite-300 transition-colors hover:border-white/[0.14] hover:text-paper">
              {sc.label}
            </button>
          ))}
        </div>
        <div role="tablist" className="flex gap-0.5 rounded-lg border border-white/[0.07] bg-black/20 p-0.5">
          {TABS.map((t) => (
            <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={cx('h-7 flex-1 rounded-md text-[11px] font-[500] transition-colors', tab === t.id ? 'bg-white/[0.09] text-paper' : 'text-graphite-400 hover:text-paper/90')}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <ScrollArea className="flex-1">
        {tab === 'power' && <PowerTab />}
        {tab === 'engines' && <EnginesTab />}
        {tab === 'gear' && <GearTab />}
        {tab === 'controls' && <ControlsTab />}
        {tab === 'doors' && <DoorsTab />}
        {tab === 'lights' && <LightsTab />}
        <Group label="ECAM memo & alerts">
          {ann.length === 0 ? (
            <p className="font-mono text-[11px] text-graphite-500">NO ALERTS</p>
          ) : (
            <ul className="space-y-0.5">
              {ann.map((a) => (
                <li key={a.id} className={cx('font-mono text-[11px]', a.level === 'warning' ? 'text-red-warn' : a.level === 'caution' ? 'text-amber-warn' : 'text-green-ok')}>
                  {a.text}
                </li>
              ))}
            </ul>
          )}
        </Group>
      </ScrollArea>
    </div>
  );
}
