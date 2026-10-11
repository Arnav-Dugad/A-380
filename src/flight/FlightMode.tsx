/**
 * Flight mode runtime: owns the fixed-step flight model while the Flight section is open,
 * moves the aircraft with a floating origin, drives the five flight cameras and records a
 * replay buffer of the last three minutes.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { MathUtils, Quaternion, Vector3, type PerspectiveCamera } from 'three';
import { sx } from '../aircraft/geometry/layout';
import { getControls } from '../camera/controls';
import { firstPerson } from '../camera/FirstPerson';
import { COCKPIT_VIEWS } from '../interior/CockpitScene';
import { TOWER } from '../scene/airport/layout';
import { weatherParams } from '../scene/World';
import { worldFrame } from '../scene/worldFrame';
import { AC, flight } from '../sim/flight';
import { addStepper, setPaused } from '../sim/loop';
import { systems } from '../sim/systems';
import { useUI } from '../state/ui';
import { attachInput, sampleInput } from './input';
import { applyScenario } from './scenarios';

/** CG location in model coordinates. */
export const CG_MODEL = new Vector3(sx(36.3), AC.cgHeight, 0);

interface Sample {
  t: number;
  pos: [number, number, number];
  q: [number, number, number, number];
  gear: number;
  doors: number;
  slat: number;
  flap: number;
  spoiler: number;
  elev: number;
  ailL: number;
  ailR: number;
  rud: number;
  n1: number[];
  rev: number;
  steer: number;
}

export const replay = {
  samples: [] as Sample[],
  cursor: 0,
  lastRecord: -1,
};

function record() {
  const s = flight.state;
  if (s.t - replay.lastRecord < 0.1) return;
  replay.lastRecord = s.t;
  const sys = systems.state;
  replay.samples.push({
    t: s.t,
    pos: [s.pos.x, s.pos.y, s.pos.z],
    q: [s.q.x, s.q.y, s.q.z, s.q.w],
    gear: sys.gear.position,
    doors: sys.gear.doors,
    slat: sys.highLift.slat,
    flap: sys.highLift.flap,
    spoiler: sys.spoilers.deployed,
    elev: sys.controls.elevator,
    ailL: sys.controls.aileronL,
    ailR: sys.controls.aileronR,
    rud: sys.controls.rudder,
    n1: sys.engines.map((e) => e.n1),
    rev: sys.engines[1]!.reverser,
    steer: sys.gear.steering,
  });
  if (replay.samples.length > 1800) replay.samples.shift();
}

function applySample(a: Sample, b: Sample, k: number) {
  const s = flight.state;
  const L = MathUtils.lerp;
  s.pos.set(L(a.pos[0], b.pos[0], k), L(a.pos[1], b.pos[1], k), L(a.pos[2], b.pos[2], k));
  s.q.set(...a.q).slerp(new Quaternion(...b.q), k);
  const sys = systems.state;
  sys.gear.position = L(a.gear, b.gear, k);
  sys.gear.doors = L(a.doors, b.doors, k);
  sys.highLift.slat = L(a.slat, b.slat, k);
  sys.highLift.flap = L(a.flap, b.flap, k);
  sys.spoilers.deployed = L(a.spoiler, b.spoiler, k);
  sys.controls.elevator = L(a.elev, b.elev, k);
  sys.controls.aileronL = L(a.ailL, b.ailL, k);
  sys.controls.aileronR = L(a.ailR, b.ailR, k);
  sys.controls.rudder = L(a.rud, b.rud, k);
  sys.engines.forEach((e, i) => (e.n1 = L(a.n1[i]!, b.n1[i]!, k)));
  sys.engines[1]!.reverser = sys.engines[2]!.reverser = L(a.rev, b.rev, k);
  sys.gear.steering = L(a.steer, b.steer, k);
  flight.publish();
}

let saved: { flight: typeof flight.state; sys: string } | null = null;
export function startReplay(): boolean {
  if (replay.samples.length < 20) return false;
  saved = { flight: { ...flight.state, pos: flight.state.pos.clone(), vel: flight.state.vel.clone(), q: flight.state.q.clone(), w: flight.state.w.clone() }, sys: JSON.stringify(systems.state) };
  replay.cursor = replay.samples[0]!.t;
  useUI.getState().set({ replay: true });
  return true;
}
export function stopReplay(): void {
  if (saved) {
    flight.state = saved.flight;
    Object.assign(systems.state, JSON.parse(saved.sys));
    saved = null;
  }
  useUI.getState().set({ replay: false });
}

export function resetFlight(): void {
  replay.samples = [];
  replay.lastRecord = -1;
  applyScenario(useUI.getState().flightScenario);
  useUI.getState().set({ flightPaused: false, replay: false });
}

const tmpQ = new Quaternion();
const fwd = new Vector3();
const flyby = { pos: new Vector3(), valid: false };

export function FlightMode() {
  const section = useUI((s) => s.section);
  const cam = useUI((s) => s.flightCam);
  const paused = useUI((s) => s.flightPaused);
  const replaying = useUI((s) => s.replay);
  const weather = useUI((s) => s.weather);
  const active = section === 'flight';
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const lastUser = useRef(0);

  // Enter / leave flight mode
  useEffect(() => {
    if (!active) return;
    resetFlight();
    const detach = attachInput();
    const remove = addStepper((dt) => flight.step(dt));
    const c = getControls();
    const onStart = () => (lastUser.current = performance.now());
    c?.addEventListener('controlstart', onStart);
    if (c) {
      c.minDistance = 30;
      c.maxDistance = 1500;
      c.maxPolarAngle = Math.PI * 0.62;
    }
    camera.near = 1;
    camera.far = 80000;
    camera.updateProjectionMatrix();
    return () => {
      remove();
      detach();
      setPaused(false);
      c?.removeEventListener('controlstart', onStart);
      if (c) {
        c.minDistance = 2;
        c.maxDistance = 900;
        c.maxPolarAngle = Math.PI / 2 - 0.02;
        c.enabled = true;
      }
      firstPerson.exit();
      camera.near = 0.4;
      camera.far = 60000;
      camera.updateProjectionMatrix();
      // Put the aircraft back on its stand
      const a = worldFrame.aircraft;
      if (a) {
        a.position.set(0, 0, 0);
        a.quaternion.identity();
      }
      worldFrame.origin.set(0, 0, 0);
      worldFrame.aircraftRenderPos.set(0, AC.cgHeight, 0);
      Object.assign(systems.state.air, { ias: 0, gs: 0, altitude: 0, radioAlt: 0, vs: 0, mach: 0, pitch: 0, bank: 0, heading: 0, aoa: 0, airborne: false });
      systems.state.gear.wow = true;
      if (systems.state.gear.position > 0) {
        systems.state.gear.position = 0;
        systems.state.gear.lever = 'down';
      }
      void c?.setLookAt(58, 14, 64, 2, 6, 0, true);
    };
  }, [active, camera]);

  // Weather → flight model wind and turbulence
  useEffect(() => {
    const w = weatherParams[weather];
    flight.weather = { windFrom: 270, windKt: w.wind, gustKt: w.gust, turbulence: w.turb };
  }, [weather]);

  useEffect(() => {
    setPaused(active && (paused || replaying));
  }, [active, paused, replaying]);

  // Camera mode changes
  useEffect(() => {
    if (!active) return;
    const c = getControls();
    if (cam === 'cockpit') firstPerson.enter('cockpit', COCKPIT_VIEWS.captain!.pose);
    else if (cam === 'wing') firstPerson.enter('cockpit', { pos: [sx(31), 9.4, -3.9], yaw: -Math.PI / 2 - 0.62, pitch: 0.28, fov: 58 });
    else {
      firstPerson.exit();
      if (c) c.enabled = cam === 'chase';
      if (cam === 'chase' && c) {
        const p = worldFrame.aircraftRenderPos;
        void c.setLookAt(p.x - 90, p.y + 22, p.z + 30, p.x, p.y, p.z, false);
      }
      flyby.valid = false;
    }
  }, [cam, active]);

  useFrame((_, dtRaw) => {
    if (!active) return;
    const dt = Math.min(dtRaw, 0.1);
    const ui = useUI.getState();
    if (!ui.replay && !ui.flightPaused) {
      sampleInput(dt);
      record();
    }
    if (ui.replay && replay.samples.length > 1) {
      replay.cursor += dt;
      const samples = replay.samples;
      let i = samples.findIndex((s) => s.t > replay.cursor);
      if (i <= 0) {
        if (i === -1) {
          stopReplay();
          return;
        }
        i = 1;
      }
      const a = samples[i - 1]!;
      const b = samples[i]!;
      applySample(a, b, (replay.cursor - a.t) / Math.max(1e-6, b.t - a.t));
    }
    // Floating origin: horizontal position follows the aircraft
    const s = flight.state;
    worldFrame.origin.set(s.pos.x, 0, s.pos.z);
    const a = worldFrame.aircraft;
    if (a) {
      a.quaternion.copy(s.q);
      const off = CG_MODEL.clone().applyQuaternion(s.q);
      a.position.set(-off.x, s.pos.y - off.y, -off.z);
    }
    worldFrame.aircraftRenderPos.set(0, s.pos.y, 0);
    const target = worldFrame.aircraftRenderPos;

    const c = getControls();
    if (cam === 'chase' && c) {
      // keep the orbit centred on the aircraft; drift behind it unless the user is orbiting
      const tg = c.getTarget(new Vector3());
      c.moveTo(target.x, target.y, target.z, false);
      void tg;
      if (performance.now() - lastUser.current > 2500) {
        fwd.set(1, 0, 0).applyQuaternion(s.q);
        const desired = Math.atan2(-fwd.x, -fwd.z);
        let diff = desired - c.azimuthAngle;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        c.azimuthAngle += diff * Math.min(1, dt * 0.8);
      }
    } else if (cam === 'tower') {
      const tower = new Vector3(TOWER.x - worldFrame.origin.x, 62, TOWER.z - worldFrame.origin.z);
      camera.position.copy(tower);
      camera.lookAt(target);
      const d = tower.distanceTo(target);
      camera.fov = MathUtils.clamp((Math.atan(70 / d) * 360) / Math.PI, 2, 50);
      camera.updateProjectionMatrix();
    } else if (cam === 'flyby') {
      const vel = s.vel.clone();
      const speed = vel.length();
      const rel = flyby.pos.clone().sub(new Vector3(s.pos.x, s.pos.y, s.pos.z));
      const ahead = speed > 1 ? rel.dot(vel.clone().normalize()) : 0;
      if (!flyby.valid || ahead < -350 || rel.length() > 2500) {
        const dir = speed > 5 ? vel.clone().normalize() : new Vector3(1, 0, 0).applyQuaternion(s.q);
        const side = new Vector3(-dir.z, 0, dir.x).normalize();
        flyby.pos.set(s.pos.x, s.pos.y, s.pos.z).addScaledVector(dir, Math.max(250, speed * 5)).addScaledVector(side, 45);
        flyby.pos.y = Math.max(3, s.pos.y - 8);
        flyby.valid = true;
      }
      camera.position.set(flyby.pos.x - worldFrame.origin.x, flyby.pos.y, flyby.pos.z - worldFrame.origin.z);
      camera.lookAt(target);
      const d = camera.position.distanceTo(target);
      camera.fov = MathUtils.clamp((Math.atan(60 / d) * 360) / Math.PI, 8, 60);
      camera.updateProjectionMatrix();
    }
    void tmpQ;
  });
  return null;
}
