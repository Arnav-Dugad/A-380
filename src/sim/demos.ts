/**
 * Demonstrations triggered from the inspector and Explore panel. They operate the aircraft
 * exclusively through the normal systems commands, so every precondition and interlock is
 * honoured — e.g. a gear swing on the ground first puts the aircraft on jacks.
 */
import { systems } from './systems';

type Demo = 'gear' | 'flaps' | 'spoilers' | 'ailerons' | 'elevators' | 'rudder' | 'engines' | 'reversers' | 'doors' | 'cargo';

const timers: number[] = [];
let token = 0;
const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
export function cancelDemos(): void {
  token++;
  while (timers.length) window.clearTimeout(timers.pop());
}

/** Run `fn` once `cond` holds (polled), so demos follow simulation state, not wall-clock time. */
function when(cond: () => boolean, fn: () => void, timeoutMs = 120_000) {
  const mine = token;
  const t0 = performance.now();
  const poll = () => {
    if (mine !== token || performance.now() - t0 > timeoutMs) return;
    if (cond()) fn();
    else timers.push(window.setTimeout(poll, 150));
  };
  poll();
}

function ensureGroundPower() {
  const s = systems.state;
  if (!s.elec.battery) systems.setBattery(true);
  if (!s.elec.ac && !s.air.airborne) systems.setExternalPower(true);
}

/** Sweep the side-stick / pedals through a smooth input profile. */
function sweep(axis: 'pitch' | 'roll' | 'yaw', seconds = 6) {
  const t0 = performance.now();
  const mine = token;
  const tick = () => {
    if (mine !== token) return;
    const t = (performance.now() - t0) / 1000;
    if (t > seconds) {
      systems.setFlightControls(0, 0, 0);
      return;
    }
    const v = Math.sin((t / seconds) * Math.PI * 2) * Math.min(1, t * 1.2);
    const c = systems.state.controls;
    systems.setFlightControls(axis === 'pitch' ? v : c.pitch, axis === 'roll' ? v : c.roll, axis === 'yaw' ? v : c.yaw);
    window.requestAnimationFrame(tick);
  };
  tick();
}

export function runDemo(d: Demo): string {
  cancelDemos();
  const s = systems.state;
  switch (d) {
    case 'gear': {
      if (s.air.airborne) {
        systems.setGearLever(s.gear.lever === 'up' ? 'down' : 'up');
        return 'Landing gear lever moved';
      }
      ensureGroundPower();
      if (!s.maintenance) systems.setMaintenance(true);
      // Retract once the jacks have taken the weight and ground hydraulics are up, extend after a pause.
      when(
        () => !systems.state.gear.wow && systems.state.hyd.green > 2500,
        () => {
          systems.setGearLever('up');
          when(
            () => systems.state.gear.position > 0.999 && systems.state.gear.doors < 0.01,
            () => {
              const t = systems.state.time;
              when(() => systems.state.time - t > 3, () => systems.setGearLever('down'));
            },
          );
        },
      );
      return 'Gear swing test: aircraft on jacks, gear retracts then extends';
    }
    case 'flaps': {
      ensureGroundPower();
      const target = s.highLift.lever === 4 ? 0 : 4;
      systems.setTimeScale(Math.max(s.timeScale, 2));
      systems.setFlapLever(target);
      return target ? 'Flap lever FULL — slats and flaps extending (time ×2)' : 'Flap lever 0 — retracting';
    }
    case 'spoilers': {
      ensureGroundPower();
      systems.setSpeedbrake(1);
      later(5000, () => systems.setSpeedbrake(0));
      return 'Speed brake lever FULL for 5 s (ground spoilers deploy 50°)';
    }
    case 'ailerons':
      ensureGroundPower();
      sweep('roll');
      return 'Side-stick roll sweep: ailerons and roll spoilers respond';
    case 'elevators':
      ensureGroundPower();
      sweep('pitch');
      return 'Side-stick pitch sweep: elevators respond';
    case 'rudder':
      ensureGroundPower();
      sweep('yaw');
      return 'Rudder pedal sweep: both rudder panels respond';
    case 'engines': {
      if (s.engines.every((e) => e.state === 'running')) {
        s.engines.forEach((_, i) => systems.setEngineMaster(i, false));
        return 'Engine masters OFF — engines spooling down';
      }
      systems.setTimeScale(4);
      systems.setBattery(true);
      later(300, () => {
        systems.setApuMaster(true);
        systems.startApu();
      });
      const waitApu = () => {
        if (systems.state.apu.state !== 'running') return later(500, waitApu);
        systems.setApuBleed(true);
        systems.setEngineMode('IGN/START');
        // Start 4, 3, 2, 1 in sequence, each once the previous one has passed 25 % N2
        const startNext = (k: number) => {
          const order = [3, 2, 1, 0];
          if (k >= order.length) {
            when(() => systems.state.engines.every((e) => e.state === 'running'), () => {
              systems.setEngineMode('NORM');
              systems.setTimeScale(1);
            });
            return;
          }
          const i = order[k]!;
          when(() => systems.state.bleedAvailable, () => {
            systems.setEngineMaster(i, true);
            when(() => systems.state.engines[i]!.n2 > 25, () => startNext(k + 1));
          });
        };
        startNext(0);
      };
      later(600, waitApu);
      return 'Engine start: APU → bleed → engines 4, 3, 2, 1 (time ×4)';
    }
    case 'reversers': {
      if (!s.engines[1]!.state.startsWith('run') || !s.engines[2]!.state.startsWith('run')) {
        return 'Start the engines first — reversers need running inboard engines and AC power';
      }
      systems.setReverse(true);
      later(6000, () => systems.setReverse(false));
      return 'Reversers on engines 2 and 3 deploy for 6 s';
    }
    case 'doors': {
      ensureGroundPower();
      const open = !Object.values(s.doors).some((x) => x.kind === 'passenger' && x.target === 1);
      for (const id of ['M1L', 'M2L', 'U1L']) {
        systems.armDoor(id, false);
        systems.setDoor(id, open);
      }
      return open ? 'Doors M1L, M2L and U1L opening' : 'Doors closing';
    }
    case 'cargo': {
      ensureGroundPower();
      const open = s.doors.FWD_CARGO!.target === 0;
      later(200, () => systems.setAllDoors(open, 'cargo'));
      return open ? 'Cargo doors opening' : 'Cargo doors closing';
    }
  }
}
