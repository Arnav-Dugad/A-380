/**
 * On-screen controls for touch devices: a walking joystick in the cabin, and a side-stick,
 * throttle and quick actions in flight mode. They write to the same inputs as the keyboard
 * and gamepad, so the simulation does not know which device is in use.
 */
import { useEffect, useRef, useState } from 'react';
import { firstPerson } from '../camera/FirstPerson';
import { autopilot } from '../cockpit/displays';
import { toggleAP, touchInput } from '../flight/input';
import { systems } from '../sim/systems';
import { useSim } from '../state/sim';
import { useUI, type FlightCam } from '../state/ui';
import { NAV_H } from './Sheet';
import { cx } from './kit';
import { useLayout, useTouch } from './useMedia';

function Joystick({ label, size = 120, onMove, onEnd }: { label: string; size?: number; onMove: (x: number, y: number) => void; onEnd: () => void }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState<{ x: number; y: number } | null>(null);
  const r = size / 2;
  const update = (e: React.PointerEvent) => {
    const b = base.current!.getBoundingClientRect();
    let x = e.clientX - (b.left + r);
    let y = e.clientY - (b.top + r);
    const d = Math.hypot(x, y);
    const max = r - 18;
    if (d > max) {
      x *= max / d;
      y *= max / d;
    }
    setKnob({ x, y });
    onMove(x / max, y / max);
  };
  const end = () => {
    setKnob(null);
    onEnd();
  };
  return (
    <div
      ref={base}
      role="application"
      aria-label={label}
      className="pointer-events-auto relative shrink-0 touch-none select-none rounded-full border border-white/[0.12] bg-graphite-950/45 shadow-[inset_0_0_24px_rgba(0,0,0,0.5)] backdrop-blur-md"
      style={{ width: size, height: size }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => knob && update(e)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="absolute inset-[18px] rounded-full border border-dashed border-white/[0.08]" />
      <div className="absolute inset-x-0 -top-5 text-center font-mono text-[9px] uppercase tracking-[0.18em] text-paper/60 [text-shadow:0_1px_4px_rgba(0,0,0,0.9)]">{label}</div>
      <div
        className={cx(
          'absolute left-1/2 top-1/2 h-[52px] w-[52px] rounded-full border border-white/25 bg-paper/15 shadow-[0_4px_16px_rgba(0,0,0,0.5)] backdrop-blur',
          !knob && 'transition-transform duration-200',
        )}
        style={{
          transform: `translate(calc(-50% + ${knob?.x ?? 0}px), calc(-50% + ${knob?.y ?? 0}px))`,
        }}
      />
    </div>
  );
}

function Throttle() {
  const lever = useSim((s) => s.s.engines[0]!.lever);
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const set = (e: React.PointerEvent) => {
    const b = track.current!.getBoundingClientRect();
    const v = Math.max(0, Math.min(1, 1 - (e.clientY - b.top) / b.height));
    autopilot.athr = false;
    systems.setThrust(v > 0.97 ? 1 : v);
  };
  const pct = Math.round(lever * 100);
  return (
    <div className="pointer-events-auto flex shrink-0 flex-col items-center gap-1">
      <div className="font-mono text-[10.5px] font-[600] tabular-nums text-paper [text-shadow:0_1px_4px_rgba(0,0,0,0.9)]">{pct >= 100 ? 'TOGA' : `${pct}%`}</div>
      <div
        ref={track}
        role="slider"
        aria-label="Thrust levers"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className={cx('relative h-[132px] w-14 touch-none select-none overflow-hidden rounded-2xl border bg-graphite-950/60 backdrop-blur-md', active ? 'border-ice-400/50' : 'border-white/[0.12]')}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setActive(true);
          set(e);
        }}
        onPointerMove={(e) => active && set(e)}
        onPointerUp={() => setActive(false)}
        onPointerCancel={() => setActive(false)}
      >
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ice-500/35 to-ice-400/10" style={{ height: `${pct}%` }} />
        <div className="absolute inset-x-2 h-[3px] rounded-full bg-paper shadow-[0_0_10px_rgba(111,211,239,0.8)]" style={{ bottom: `calc(${pct}% - 1.5px)` }} />
        {[0.25, 0.5, 0.75].map((t) => (
          <div key={t} className="absolute inset-x-4 h-px bg-white/10" style={{ bottom: `${t * 100}%` }} />
        ))}
      </div>
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-paper/60 [text-shadow:0_1px_4px_rgba(0,0,0,0.9)]">Thrust</div>
    </div>
  );
}

const CAMS: FlightCam[] = ['chase', 'cockpit', 'wing', 'tower', 'flyby'];

function Chip({ children, onClick, active, hold, label }: { children: string; onClick?: () => void; active?: boolean; hold?: (down: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      onPointerDown={hold ? (e) => (e.currentTarget.setPointerCapture(e.pointerId), hold(true)) : undefined}
      onPointerUp={hold ? () => hold(false) : undefined}
      onPointerCancel={hold ? () => hold(false) : undefined}
      className={cx(
        'pointer-events-auto h-10 touch-none select-none whitespace-nowrap rounded-xl border px-1 font-mono text-[10px] font-[600] tracking-[0.02em] backdrop-blur-md transition-colors active:scale-[0.97]',
        active ? 'border-ice-400/50 bg-ice-400/20 text-ice-300' : 'border-white/[0.12] bg-graphite-950/55 text-paper/90',
      )}
    >
      {children}
    </button>
  );
}

const stickSize = () => (window.innerWidth < 400 ? 104 : 120);

function FlightTouch() {
  const s = useSim((x) => x.s);
  const cam = useUI((x) => x.flightCam);
  const set = useUI((x) => x.set);
  const [brake, setBrake] = useState(false);
  useEffect(
    () => () => {
      Object.assign(touchInput, { stick: false, pitch: 0, roll: 0, brake: 0 });
    },
    [],
  );
  return (
    <>
      <Joystick
        size={stickSize()}
        label="Stick"
        onMove={(x, y) => Object.assign(touchInput, { stick: true, roll: x, pitch: y })}
        onEnd={() => Object.assign(touchInput, { stick: false, roll: 0, pitch: 0 })}
      />
      <div className="grid min-w-0 max-w-[460px] flex-1 grid-cols-[repeat(auto-fit,minmax(52px,1fr))] content-end gap-1.5 self-end pb-1">
        <Chip label="Landing gear lever" active={s.gear.lever === 'up'} onClick={() => systems.setGearLever(s.gear.lever === 'down' ? 'up' : 'down')}>
          {s.gear.lever === 'down' ? 'GEAR ↑' : 'GEAR ↓'}
        </Chip>
        <Chip label="Flaps up one step" onClick={() => systems.setFlapLever(s.highLift.lever - 1)}>
          FLAP −
        </Chip>
        <Chip label="Flaps down one step" onClick={() => systems.setFlapLever(s.highLift.lever + 1)}>
          FLAP +
        </Chip>
        <Chip
          label="Wheel brakes (hold)"
          active={brake}
          hold={(d) => {
            setBrake(d);
            touchInput.brake = d ? 1 : 0;
          }}
        >
          BRAKE
        </Chip>
        <Chip label="Speed brake" active={s.spoilers.lever > 0} onClick={() => systems.setSpeedbrake(s.spoilers.lever > 0 ? 0 : 1)}>
          SPD BRK
        </Chip>
        <Chip label="Autopilot" active={autopilot.ap} onClick={() => toggleAP()}>
          AP
        </Chip>
        <Chip label="Change camera" onClick={() => set({ flightCam: CAMS[(CAMS.indexOf(cam) + 1) % CAMS.length]! })}>
          CAM
        </Chip>
      </div>
      <Throttle />
    </>
  );
}

function CabinTouch() {
  useEffect(() => () => firstPerson.setMove(0, 0), []);
  return (
    <>
      <Joystick label="Walk" onMove={(x, y) => firstPerson.setMove(-y, x)} onEnd={() => firstPerson.setMove(0, 0)} />
      <div className="mb-2 max-w-[200px] self-end text-right text-[11px] leading-snug text-paper/70 [text-shadow:0_1px_6px_rgba(0,0,0,0.8)]">Drag anywhere else to look around · pinch to zoom</div>
    </>
  );
}

export function TouchControls() {
  const touch = useTouch();
  const layout = useLayout();
  const section = useUI((s) => s.section);
  const sheet = useUI((s) => s.sheet);
  const paused = useUI((s) => s.flightPaused || s.replay);
  if (!touch || (section !== 'flight' && section !== 'cabin')) return null;
  if (layout !== 'desktop' && sheet !== 'peek') return null;
  if (section === 'flight' && paused) return null;
  const bottom = layout === 'sheet' ? `calc(${NAV_H + 96 + 18}px + env(safe-area-inset-bottom))` : layout === 'side' ? `calc(${NAV_H + 10}px + env(safe-area-inset-bottom))` : '20px';
  return (
    <div className={cx('pointer-events-none absolute z-10 flex items-end justify-between gap-2', layout === 'desktop' ? 'left-[380px] right-5' : 'inset-x-3')} style={{ bottom }}>
      {section === 'flight' ? <FlightTouch /> : <CabinTouch />}
    </div>
  );
}
