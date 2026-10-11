import { beforeEach, describe, expect, it } from 'vitest';
import { autopilot } from '../cockpit/displays';
import { AC, FT, FlightModel, KT, isa } from './flight';
import { systems } from './systems';

const DT = 1 / 120;
function run(fm: FlightModel, seconds: number, each?: (t: number) => void) {
  for (let t = 0; t < seconds; t += DT) {
    each?.(t);
    fm.step(DT);
    systems.step(DT);
  }
}

describe('ISA atmosphere', () => {
  it('matches standard sea-level and tropopause values', () => {
    expect(isa(0).rho).toBeCloseTo(1.225, 2);
    expect(isa(11000).T).toBeCloseTo(216.65, 1);
    expect(isa(0).a).toBeCloseTo(340.3, 0);
  });
});

describe('flight model', () => {
  let fm: FlightModel;
  beforeEach(() => {
    fm = new FlightModel();
    autopilot.ap = false;
    autopilot.athr = false;
    systems.applyScenario('taxi');
    systems.setParkingBrake(true);
  });

  it('rests on its gear without drifting', () => {
    fm.place({ x: 0, z: 0, alt: AC.cgHeight, heading: 90, speedKt: 0 });
    run(fm, 10);
    expect(fm.state.pos.y).toBeGreaterThan(4.8);
    expect(fm.state.pos.y).toBeLessThan(5.2);
    expect(Math.hypot(fm.state.pos.x, fm.state.pos.z)).toBeLessThan(0.5);
    expect(fm.state.onGround).toBe(true);
    expect(Math.abs(fm.attitude().pitch)).toBeLessThan(1);
  });

  it('accelerates, rotates and climbs away at TOGA in CONF 1+F', () => {
    fm.place({ x: 0, z: 0, alt: AC.cgHeight, heading: 90, speedKt: 0, mass: 480_000 });
    systems.setParkingBrake(false);
    systems.setThrust(1);
    let rotated = -1;
    let liftoffX = -1;
    run(fm, 90, (t) => {
      const ias = fm.state.ias * KT;
      if (ias > 150 && rotated < 0) rotated = t;
      // rotate at ~3°/s towards a 12.5° climb attitude, then release (flight-path hold)
      fm.inputs.pitch = rotated >= 0 && fm.attitude().pitch < 12.5 && t - rotated < 12 ? 0.9 : 0;
      if (!fm.state.onGround && liftoffX < 0 && fm.state.pos.y > 8) liftoffX = fm.state.pos.x;
      if (fm.state.pos.y * FT > 400 && systems.state.gear.lever === 'down') systems.setGearLever('up');
    });
    expect(fm.state.crashed).toBeNull();
    expect(rotated).toBeGreaterThan(20);
    expect(liftoffX).toBeGreaterThan(1200);
    expect(liftoffX).toBeLessThan(3800);
    expect(fm.state.pos.y * FT).toBeGreaterThan(1000);
    expect(fm.state.vel.y).toBeGreaterThan(0);
  });

  it('holds altitude in cruise with the autopilot and autothrust', () => {
    systems.applyScenario('cruise');
    fm.place({ x: 0, z: 0, alt: 35000 / FT, heading: 90, speedKt: 490, pitch: 2.2, mass: 450_000 });
    autopilot.ap = true;
    autopilot.athr = true;
    autopilot.alt = 35000;
    autopilot.vertical = 'ALT';
    autopilot.lateral = 'HDG';
    autopilot.hdg = 90;
    autopilot.spd = 270;
    run(fm, 120);
    expect(fm.state.crashed).toBeNull();
    expect(Math.abs(fm.state.pos.y * FT - 35000)).toBeLessThan(300);
    expect(fm.state.mach).toBeGreaterThan(0.75);
    expect(fm.state.mach).toBeLessThan(0.92);
  });

  it('turns onto a selected heading', () => {
    systems.applyScenario('cruise');
    fm.place({ x: 0, z: 0, alt: 10000 / FT, heading: 90, speedKt: 330, pitch: 3, mass: 420_000 });
    autopilot.ap = true;
    autopilot.athr = true;
    autopilot.alt = 10000;
    autopilot.vertical = 'ALT';
    autopilot.lateral = 'HDG';
    autopilot.hdg = 180;
    autopilot.spd = 280;
    run(fm, 150);
    expect(Math.abs(fm.attitude().heading - 180)).toBeLessThan(6);
  });

  it('stalls in direct law with idle thrust and full back stick', () => {
    systems.applyScenario('cruise');
    systems.setThrust(0);
    fm.law = 'direct';
    fm.place({ x: 0, z: 0, alt: 15000 / FT, heading: 90, speedKt: 230, pitch: 3, mass: 450_000 });
    let maxAoa = 0;
    run(fm, 40, () => {
      fm.inputs.pitch = 1;
      maxAoa = Math.max(maxAoa, systems.state.air.aoa);
    });
    expect(maxAoa).toBeGreaterThan(14);
  });

  it('is deterministic for identical inputs (with turbulence)', () => {
    const go = () => {
      const f = new FlightModel();
      systems.applyScenario('cruise');
      f.weather = { windFrom: 300, windKt: 25, gustKt: 15, turbulence: 0.6 };
      f.place({ x: 0, z: 0, alt: 3000, heading: 90, speedKt: 280, pitch: 2 });
      run(f, 20, (t) => (f.inputs.roll = Math.sin(t)));
      return [f.state.pos.x, f.state.pos.y, f.state.pos.z];
    };
    expect(go()).toEqual(go());
  });
});

describe('flight scenarios', () => {
  it.each(['climb', 'cruise', 'descent', 'approach', 'landing', 'free'] as const)('%s starts trimmed and stays stable', async (id) => {
    const { applyScenario } = await import('../flight/scenarios');
    const { flight } = await import('./flight');
    applyScenario(id);
    let maxDev = 0;
    for (let t = 0; t < 20; t += DT) {
      flight.step(DT);
      systems.step(DT);
      maxDev = Math.max(maxDev, Math.abs(flight.state.nz - 1));
    }
    expect(flight.state.crashed).toBeNull();
    expect(maxDev).toBeLessThan(0.35);
  });
});
