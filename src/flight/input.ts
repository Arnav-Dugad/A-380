/**
 * Flight input: keyboard with smoothed, spring-centred stick axes, and the standard
 * Gamepad API mapping (left stick pitch/roll, right stick yaw, RT thrust up, LT brakes).
 */
import { flight } from '../sim/flight';
import { systems } from '../sim/systems';
import { autopilot } from '../cockpit/displays';
import { useUI, type FlightCam } from '../state/ui';

const keys = new Set<string>();
let attached = false;
const CAMS: FlightCam[] = ['chase', 'cockpit', 'wing', 'tower', 'flyby'];
let prevButtons: boolean[] = [];

export const inputState = { gamepad: false, pitch: 0, roll: 0, yaw: 0 };

function onDown(e: KeyboardEvent) {
  if (useUI.getState().section !== 'flight') return;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
  const k = e.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  if (keys.has(k)) return;
  keys.add(k);
  const s = systems.state;
  switch (k) {
    case 'g':
      systems.setGearLever(s.gear.lever === 'down' ? 'up' : 'down');
      break;
    case 'f':
      systems.setFlapLever(s.highLift.lever + 1);
      break;
    case 'v':
      systems.setFlapLever(s.highLift.lever - 1);
      break;
    case 'k':
      systems.setParkingBrake(!s.brakes.parking);
      break;
    case '/':
      systems.setSpeedbrake(s.spoilers.lever > 0 ? 0 : 1);
      break;
    case 'y':
      systems.armSpoilers(!s.spoilers.armed);
      break;
    case 't':
      systems.setReverse(!s.engines[1]!.reverseCmd);
      break;
    case 'u':
      toggleAP();
      break;
    case 'j':
      autopilot.athr = !autopilot.athr;
      if (autopilot.athr) autopilot.spd = Math.round(s.air.ias);
      break;
    case 'c': {
      const ui = useUI.getState();
      ui.set({ flightCam: CAMS[(CAMS.indexOf(ui.flightCam) + 1) % CAMS.length]! });
      break;
    }
    case ' ':
      useUI.getState().set({ flightPaused: !useUI.getState().flightPaused });
      break;
  }
}
function onUp(e: KeyboardEvent) {
  keys.delete(e.key.toLowerCase());
}

export function toggleAP(): void {
  const s = systems.state;
  autopilot.ap = !autopilot.ap;
  if (autopilot.ap) {
    autopilot.alt = Math.round(s.air.altitude / 100) * 100;
    autopilot.hdg = Math.round(s.air.heading);
    autopilot.vertical = 'ALT';
    autopilot.lateral = 'HDG';
  }
}

export function attachInput(): () => void {
  if (attached) return () => {};
  attached = true;
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  const blur = () => keys.clear();
  window.addEventListener('blur', blur);
  return () => {
    attached = false;
    keys.clear();
    window.removeEventListener('keydown', onDown);
    window.removeEventListener('keyup', onUp);
    window.removeEventListener('blur', blur);
  };
}

const approach = (v: number, target: number, rate: number, dt: number) => v + Math.max(-rate * dt, Math.min(rate * dt, target - v));
const dz = (v: number, d = 0.12) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));

/** Sample devices once per rendered frame and write inputs to the flight model / systems. */
export function sampleInput(dt: number): void {
  const has = (k: string) => keys.has(k);
  let pitchT = (has('s') || has('arrowdown') ? 1 : 0) - (has('w') || has('arrowup') ? 1 : 0);
  let rollT = (has('d') || has('arrowright') ? 1 : 0) - (has('a') || has('arrowleft') ? 1 : 0);
  let yawT = (has('e') ? 1 : 0) - (has('q') ? 1 : 0);
  let brake = has('b') ? 1 : 0;
  let thrDelta = (has('shift') || has('pageup') || has('+') || has('=') ? 1 : 0) - (has('control') || has('pagedown') || has('-') ? 1 : 0);

  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = Array.from(pads ?? []).find((p) => p && p.connected) ?? null;
  inputState.gamepad = !!gp;
  if (gp) {
    const ax = gp.axes;
    if (Math.abs(dz(ax[0] ?? 0)) > 0) rollT = dz(ax[0] ?? 0);
    if (Math.abs(dz(ax[1] ?? 0)) > 0) pitchT = dz(ax[1] ?? 0);
    if (Math.abs(dz(ax[2] ?? 0)) > 0) yawT = dz(ax[2] ?? 0);
    const rt = gp.buttons[7]?.value ?? 0;
    const lt = gp.buttons[6]?.value ?? 0;
    if (rt > 0.05) thrDelta = rt;
    if (lt > 0.05) brake = lt;
    const pressed = gp.buttons.map((b) => b.pressed);
    const edge = (i: number) => pressed[i] && !prevButtons[i];
    const s = systems.state;
    if (edge(0)) systems.setGearLever(s.gear.lever === 'down' ? 'up' : 'down');
    if (edge(1)) systems.setFlapLever(s.highLift.lever + 1);
    if (edge(2)) systems.setFlapLever(s.highLift.lever - 1);
    if (edge(3)) systems.setSpeedbrake(s.spoilers.lever > 0 ? 0 : 1);
    if (edge(4)) thrDelta = -1;
    if (edge(9)) toggleAP();
    prevButtons = pressed;
  }
  // keyboard axes ramp in and spring back; gamepad axes are absolute
  inputState.pitch = gp && Math.abs(pitchT) > 0 ? pitchT : approach(inputState.pitch, pitchT, pitchT === 0 ? 3 : 1.6, dt);
  inputState.roll = gp && Math.abs(rollT) > 0 ? rollT : approach(inputState.roll, rollT, rollT === 0 ? 4 : 2.2, dt);
  inputState.yaw = gp && Math.abs(yawT) > 0 ? yawT : approach(inputState.yaw, yawT, yawT === 0 ? 3 : 2, dt);
  flight.inputs.pitch = inputState.pitch;
  flight.inputs.roll = inputState.roll;
  flight.inputs.yaw = inputState.yaw;
  flight.inputs.brake = brake;
  systems.setTiller(systems.state.gear.wow && systems.state.air.gs < 25 ? inputState.roll : 0);
  if (thrDelta !== 0) {
    if (autopilot.athr) autopilot.athr = false;
    const cur = systems.state.engines[0]!.lever;
    systems.setThrust(cur + thrDelta * 0.45 * dt);
  }
}
