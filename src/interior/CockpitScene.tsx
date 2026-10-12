/**
 * Flight-deck runtime: streams the cockpit GLB, binds live display textures, animates the
 * levers/knobs from the shared systems state and turns clicks on controls into systems
 * commands. Every operable control maps to a real state change.
 */
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Color, Euler, Mesh, MeshBasicMaterial, MeshStandardMaterial, Quaternion, type Group, type Object3D } from 'three';
import { getRig } from '../aircraft/rig';
import { LazyLayer } from '../aircraft/Layers';
import { EYE_CAPTAIN, EYE_FO } from '../aircraft/geometry/cockpit';
import { getDisplays, autopilot, displayState, type ScreenName } from '../cockpit/displays';
import { firstPerson, type FpPose } from '../camera/FirstPerson';
import { systems, type Autobrake, type SystemsState } from '../sim/systems';
import { useUI } from '../state/ui';
import { goPreset } from '../camera/controls';

export const COCKPIT_VIEWS: Record<string, { label: string; pose: FpPose }> = {
  captain: { label: 'Captain', pose: { pos: EYE_CAPTAIN, yaw: 0.06, pitch: 0.12, fov: 62 } },
  fo: { label: 'First officer', pose: { pos: EYE_FO, yaw: -0.06, pitch: 0.12, fov: 62 } },
  panel: { label: 'Main panel', pose: { pos: [EYE_CAPTAIN[0] + 0.25, EYE_CAPTAIN[1] - 0.05, -0.22], yaw: 0.25, pitch: 0.45, fov: 46 } },
  pedestal: { label: 'Pedestal', pose: { pos: [EYE_CAPTAIN[0] + 0.05, EYE_CAPTAIN[1], -0.3], yaw: 0.45, pitch: 0.95, fov: 50 } },
  overhead: { label: 'Overhead', pose: { pos: [EYE_CAPTAIN[0] - 0.1, EYE_CAPTAIN[1], -0.3], yaw: 0.4, pitch: -1.05, fov: 55 } },
  wide: { label: 'Jump seat', pose: { pos: [EYE_CAPTAIN[0] - 1.6, EYE_CAPTAIN[1] + 0.15, 0], yaw: 0, pitch: 0.18, fov: 72 } },
};

export const CONTROL_LABELS: Record<string, string> = {
  THRUST_1: 'Thrust lever 1',
  THRUST_2: 'Thrust lever 2',
  THRUST_3: 'Thrust lever 3',
  THRUST_4: 'Thrust lever 4',
  ENG_MASTER_1: 'Engine master 1',
  ENG_MASTER_2: 'Engine master 2',
  ENG_MASTER_3: 'Engine master 3',
  ENG_MASTER_4: 'Engine master 4',
  ENG_START: 'Engine mode selector',
  FLAPS: 'Flap lever',
  SPEEDBRAKE: 'Speed-brake lever',
  PARK_BRAKE: 'Parking brake',
  GEAR: 'Landing-gear lever',
  AUTOBRAKE: 'Autobrake selector',
  SIDESTICK: 'Side-stick (drag)',
  BAT: 'Batteries',
  EXT_PWR: 'External power',
  APU_GEN: 'APU generator',
  APU_MASTER: 'APU master switch',
  APU_START: 'APU start',
  APU_BLEED: 'APU bleed',
  LT_BEACON: 'Beacon light',
  LT_NAV: 'Navigation & logo lights',
  LT_STROBE: 'Strobe lights',
  LT_LAND: 'Landing lights',
  LT_TAXI: 'Taxi lights',
  LT_WING: 'Wing inspection lights',
  SEAT_BELTS: 'Seat-belt signs',
  CABIN_LT: 'Cabin lighting',
  DOME_LT: 'Flight-deck dome / flood lights',
};

const DETENTS = [0, 0.55, 0.85, 1];
const AB: Autobrake[] = ['DISARM', 'LO', '2', '3', 'HI', 'RTO'];
const MODES: SystemsState['engineMode'][] = ['CRANK', 'NORM', 'IGN/START'];
const CABIN = ['off', 'boarding', 'day', 'night', 'ambient'] as const;

export const cockpitLights = { dome: false };

/** Execute a control action; returns the resulting message. */
export function operate(id: string, s = systems.state): string {
  const m = (r: { message: string }) => r.message;
  const thr = id.match(/^THRUST_(\d)$/);
  if (thr) {
    const i = Number(thr[1]) - 1;
    const cur = s.engines[i]!.lever;
    const next = DETENTS.find((d) => d > cur + 0.01) ?? 0;
    systems.setThrust(next, [i]);
    return `Thrust lever ${i + 1}: ${next === 0 ? 'IDLE' : next === 1 ? 'TOGA' : next > 0.8 ? 'FLX/MCT' : 'CL'}`;
  }
  const em = id.match(/^ENG_MASTER_(\d)$/);
  if (em) return m(systems.setEngineMaster(Number(em[1]) - 1, !s.engines[Number(em[1]) - 1]!.master));
  switch (id) {
    case 'ENG_START':
      return m(systems.setEngineMode(MODES[(MODES.indexOf(s.engineMode) + 1) % MODES.length]!));
    case 'FLAPS':
      return m(systems.setFlapLever(s.highLift.lever >= 4 ? 0 : s.highLift.lever + 1));
    case 'SPEEDBRAKE': {
      if (!s.spoilers.armed && s.spoilers.lever === 0) return m(systems.armSpoilers(true));
      if (s.spoilers.armed) {
        systems.armSpoilers(false);
        systems.setSpeedbrake(0.5);
        return 'Speed brake ½';
      }
      if (s.spoilers.lever < 0.9) {
        systems.setSpeedbrake(1);
        return 'Speed brake FULL';
      }
      systems.setSpeedbrake(0);
      return 'Speed brake RET';
    }
    case 'PARK_BRAKE':
      return m(systems.setParkingBrake(!s.brakes.parking));
    case 'GEAR':
      return m(systems.setGearLever(s.gear.lever === 'down' ? 'up' : 'down'));
    case 'AUTOBRAKE':
      return m(systems.setAutobrake(AB[(AB.indexOf(s.brakes.autobrake) + 1) % AB.length]!));
    case 'BAT':
      return m(systems.setBattery(!s.elec.battery));
    case 'EXT_PWR':
      return m(systems.setExternalPower(!s.elec.extOn));
    case 'APU_GEN':
      s.elec.apuGen = !s.elec.apuGen;
      return `APU generator ${s.elec.apuGen ? 'ON' : 'OFF'}`;
    case 'APU_MASTER':
      return m(systems.setApuMaster(!s.apu.master));
    case 'APU_START':
      return m(systems.startApu());
    case 'APU_BLEED':
      return m(systems.setApuBleed(!s.apu.bleed));
    case 'LT_BEACON':
      return m(systems.setLight('beacon', !s.lights.beacon));
    case 'LT_NAV':
      systems.setLight('logo', !s.lights.nav);
      return m(systems.setLight('nav', !s.lights.nav));
    case 'LT_STROBE':
      return m(systems.setLight('strobe', !s.lights.strobe));
    case 'LT_LAND':
      return m(systems.setLight('landing', !s.lights.landing));
    case 'LT_TAXI':
      return m(systems.setLight('taxi', !s.lights.taxi));
    case 'LT_WING':
      return m(systems.setLight('wing', !s.lights.wing));
    case 'SEAT_BELTS':
      return m(systems.setSeatbelt(!s.seatbelt));
    case 'CABIN_LT':
      return m(systems.setCabinLight(CABIN[(CABIN.indexOf(s.cabinLight) + 1) % CABIN.length]!));
    case 'DOME_LT':
      cockpitLights.dome = !cockpitLights.dome;
      return `Flight-deck flood lights ${cockpitLights.dome ? 'ON' : 'OFF'}`;
    case 'SIDESTICK':
      return 'Drag the side-stick to command pitch and roll';
  }
  return '';
}

/** Annunciator state for an overhead button. */
function lit(id: string, s: SystemsState): 'on' | 'fault' | 'avail' | 'off' {
  switch (id) {
    case 'BAT':
      return s.elec.battery ? 'on' : 'off';
    case 'EXT_PWR':
      return s.elec.extOn ? 'on' : s.elec.extAvail ? 'avail' : 'off';
    case 'APU_GEN':
      return s.elec.apuGen ? 'on' : 'fault';
    case 'APU_MASTER':
      return s.apu.master ? 'on' : 'off';
    case 'APU_START':
      return s.apu.state === 'running' ? 'avail' : s.apu.state === 'starting' ? 'on' : 'off';
    case 'APU_BLEED':
      return s.apu.bleed ? 'on' : 'off';
    case 'LT_BEACON':
      return s.lights.beacon ? 'on' : 'off';
    case 'LT_NAV':
      return s.lights.nav ? 'on' : 'off';
    case 'LT_STROBE':
      return s.lights.strobe ? 'on' : 'off';
    case 'LT_LAND':
      return s.lights.landing ? 'on' : 'off';
    case 'LT_TAXI':
      return s.lights.taxi ? 'on' : 'off';
    case 'LT_WING':
      return s.lights.wing ? 'on' : 'off';
    case 'SEAT_BELTS':
      return s.seatbelt ? 'on' : 'off';
    case 'CABIN_LT':
      return s.cabinLight !== 'off' ? 'on' : 'off';
    case 'DOME_LT':
      return cockpitLights.dome ? 'on' : 'off';
  }
  return 'off';
}

const COLORS = { on: new Color('#6fd3ef'), avail: new Color('#3cf07a'), fault: new Color('#ffb21e'), off: new Color('#000000') };

function CockpitBinder({ root }: { root: Group }) {
  const caps = useRef<{ mesh: Mesh; id: string; mat: MeshStandardMaterial }[]>([]);
  const nodes = useRef<Record<string, Object3D>>({});
  useEffect(() => {
    const suite = getDisplays();
    caps.current = [];
    root.traverse((o) => {
      if (o.name.startsWith('ctl_') && !(o instanceof Mesh)) nodes.current[o.name] = o;
      if (!(o instanceof Mesh)) return;
      const screen = o.userData.screen as ScreenName | undefined;
      if (screen) {
        const tex = suite.textures.get(screen);
        if (tex) o.material = new MeshBasicMaterial({ map: tex, toneMapped: false });
        o.userData.baseMaterial = o.material;
      }
      const ann = o.userData.annunciator as string | undefined;
      if (ann) {
        const mat = new MeshStandardMaterial({ color: '#0c0e10', emissive: new Color('#000'), emissiveIntensity: 2.2, roughness: 0.3 });
        o.material = mat;
        o.userData.baseMaterial = mat;
        caps.current.push({ mesh: o, id: ann, mat });
      }
    });
  }, [root]);

  useFrame(() => {
    const s = systems.state;
    // panel integral lighting comes on in dark conditions (and with the dome light off)
    const ui = useUI.getState();
    const dark = ui.env === 'night' || ui.env === 'hangar' || (ui.section === 'flight' && (ui.timeOfDay < 6.5 || ui.timeOfDay > 18.5));
    displayState.integral = dark && (s.elec.ac || s.elec.dc) ? 1 : 0;
    getDisplays().update(performance.now());
    for (const c of caps.current) c.mat.emissive.copy(COLORS[lit(c.id, s)]);
    const rig = getRig();
    if (!rig) return;
    const deg = (n: string, d: number) => rig.hinge(n, d);
    s.engines.forEach((e, i) => deg(`ctl_thrust${i + 1}`, 15 - e.lever * 35));
    s.engines.forEach((e, i) => deg(`ctl_engmaster${i + 1}`, e.master ? 22 : -12));
    deg('ctl_flaps', 15 - s.highLift.lever * 7.5);
    deg('ctl_speedbrake', s.spoilers.armed ? -16 : -10 + s.spoilers.lever * 30);
    deg('ctl_gear', s.gear.lever === 'up' ? -28 : 28);
    deg('ctl_parkbrake', s.brakes.parking ? -90 : 0);
    deg('ctl_autobrake', (AB.indexOf(s.brakes.autobrake) - 2.5) * 30);
    deg('ctl_engstart', (MODES.indexOf(s.engineMode) - 1) * 45);
    for (const n of ['ctl_sidestick_C', 'ctl_sidestick_F']) {
      const a = rig.get(n);
      if (a) a.node.quaternion.copy(a.baseQuat).multiply(new Quaternion().setFromEuler(new Euler(s.controls.roll * 0.3, 0, -s.controls.pitch * 0.3)));
    }
  });
  return null;
}

const tooltip = { el: null as HTMLDivElement | null };
function showTip(text: string | null, x = 0, y = 0) {
  if (!tooltip.el) {
    const d = document.createElement('div');
    d.className = 'pointer-events-none fixed z-50 rounded-md border border-white/10 bg-graphite-900/90 px-2 py-1 font-mono text-[11px] text-paper backdrop-blur-md';
    d.setAttribute('role', 'tooltip');
    document.body.appendChild(d);
    tooltip.el = d;
  }
  tooltip.el.style.display = text ? 'block' : 'none';
  if (text) {
    tooltip.el.textContent = text;
    tooltip.el.style.left = `${x + 14}px`;
    tooltip.el.style.top = `${y + 14}px`;
  }
}

function controlOf(o: Object3D | null): string | null {
  while (o) {
    if (o.userData.control) return o.userData.control as string;
    o = o.parent;
  }
  return null;
}

export function CockpitScene() {
  const section = useUI((s) => s.section);
  const flightCam = useUI((s) => s.flightCam);
  const active = section === 'cockpit';
  const visible = active || (section === 'flight' && flightCam === 'cockpit');
  const [root, setRoot] = useState<Group | null>(null);
  const [requested, setRequested] = useState(false);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (visible) setRequested(true);
  }, [visible]);

  useEffect(() => {
    if (!active) return;
    // At the stand the ground power unit is connected, so the displays come alive; the battery
    // and APU switches stay with the user.
    if (!systems.state.elec.ac && !systems.state.air.airborne) systems.setExternalPower(true);
    cockpitLights.dome = true;
    firstPerson.enter('cockpit', COCKPIT_VIEWS.captain!.pose);
    return () => {
      firstPerson.exit();
      showTip(null);
      void goPreset('nose', true);
    };
  }, [active]);

  const onReady = useCallback((r: Group) => setRoot(r), []);

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!visible) return;
    e.stopPropagation();
    const id = controlOf(e.object);
    document.body.style.cursor = id ? 'pointer' : '';
    showTip(id ? CONTROL_LABELS[id] ?? id : null, e.nativeEvent.clientX, e.nativeEvent.clientY);
  };
  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (!visible) return;
    const id = controlOf(e.object);
    if (id === 'SIDESTICK') {
      e.stopPropagation();
      drag.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
      const mv = (ev: PointerEvent) => {
        if (!drag.current) return;
        const dx = (ev.clientX - drag.current.x) / 120;
        const dy = (ev.clientY - drag.current.y) / 120;
        systems.setFlightControls(Math.max(-1, Math.min(1, dy)), Math.max(-1, Math.min(1, dx)), systems.state.controls.yaw);
      };
      const upFn = () => {
        drag.current = null;
        systems.setFlightControls(0, 0, systems.state.controls.yaw);
        window.removeEventListener('pointermove', mv);
        window.removeEventListener('pointerup', upFn);
      };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', upFn);
    }
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!visible || e.delta > 4) return;
    const id = controlOf(e.object);
    if (!id || id === 'SIDESTICK') return;
    e.stopPropagation();
    operate(id);
  };

  if (!requested) return null;
  return (
    <group onPointerMove={onMove} onPointerOut={() => showTip(null)} onPointerDown={onDown} onClick={onClick}>
      <Suspense fallback={null}>
        <LazyLayer name="cockpit" visible={visible} onReady={onReady} />
      </Suspense>
      {root && <CockpitBinder root={root} />}
      {visible && <CockpitLighting />}
    </group>
  );
}

function CockpitLighting() {
  const flood = useRef<THREE_PointLight>(null);
  useFrame(() => {
    if (flood.current) flood.current.intensity = cockpitLights.dome ? 14 : 2.5;
  });
  return (
    <>
      <pointLight ref={flood} position={[EYE_CAPTAIN[0] - 0.2, EYE_CAPTAIN[1] + 0.9, 0]} color="#ffe2b8" intensity={2.5} distance={5} decay={2} />
      <pointLight position={[EYE_CAPTAIN[0] + 0.6, EYE_CAPTAIN[1] - 0.2, 0]} color="#bcd8ff" intensity={2} distance={3} decay={2} />
      <hemisphereLight args={['#dfe9f5', '#2a2f36', 0.8]} />
    </>
  );
}
type THREE_PointLight = import('three').PointLight;

export { autopilot };
