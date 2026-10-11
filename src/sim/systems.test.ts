import { describe, expect, it } from 'vitest';
import { AircraftSystems, IDLE_N1 } from './systems';

const run = (sys: AircraftSystems, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 120) sys.step(1 / 120);
};

describe('aircraft systems', () => {
  it('starts cold and dark', () => {
    const s = new AircraftSystems();
    run(s, 1);
    expect(s.state.elec.ac).toBe(false);
    expect(s.state.elec.dc).toBe(false);
    expect(s.state.engines.every((e) => e.state === 'off')).toBe(true);
  });

  it('requires DC power before the APU master', () => {
    const s = new AircraftSystems();
    expect(s.setApuMaster(true).ok).toBe(false);
    s.setBattery(true);
    run(s, 0.1);
    expect(s.setApuMaster(true).ok).toBe(true);
  });

  it('runs a full APU and engine start sequence', () => {
    const s = new AircraftSystems();
    s.setBattery(true);
    run(s, 0.1);
    s.setApuMaster(true);
    s.startApu();
    run(s, 50);
    expect(s.state.apu.state).toBe('running');
    expect(s.state.elec.ac).toBe(true);
    expect(s.setEngineMaster(0, true).ok).toBe(false); // no bleed, mode NORM
    s.setApuBleed(true);
    s.setEngineMode('IGN/START');
    run(s, 0.1);
    expect(s.setEngineMaster(0, true).ok).toBe(true);
    run(s, 70);
    const e = s.state.engines[0]!;
    expect(e.state).toBe('running');
    expect(e.n1).toBeGreaterThan(IDLE_N1 - 1);
    expect(s.state.hyd.green).toBeGreaterThan(4500);
  });

  it('inhibits gear retraction on the ground but allows a gear swing on jacks', () => {
    const s = new AircraftSystems();
    run(s, 0.1);
    expect(s.setGearLever('up').ok).toBe(false);
    expect(s.setMaintenance(true).ok).toBe(true);
    run(s, 4);
    expect(s.setGearLever('up').ok).toBe(true);
    run(s, 20);
    expect(s.state.gear.position).toBeCloseTo(1, 3);
    expect(s.state.gear.doors).toBeLessThan(0.01); // doors close after retraction
    expect(s.setMaintenance(false).ok).toBe(false); // gear must be down first
  });

  it('extends slats and flaps to the selected configuration', () => {
    const s = new AircraftSystems();
    s.applyScenario('taxi');
    s.setFlapLever(4);
    run(s, 60);
    expect(s.state.highLift.slat).toBeCloseTo(23, 3);
    expect(s.state.highLift.flap).toBeCloseTo(32, 3);
    s.setFlapLever(1);
    run(s, 60);
    expect(s.state.highLift.flap).toBeCloseTo(8, 3); // CONF 1+F on the ground
  });

  it('protects armed doors and doors in flight', () => {
    const s = new AircraftSystems();
    s.applyScenario('taxi');
    expect(s.setDoor('M1L', true).ok).toBe(false);
    s.armDoor('M1L', false);
    expect(s.setDoor('M1L', true).ok).toBe(true);
    run(s, 10);
    expect(s.state.doors.M1L!.position).toBeCloseTo(1, 3);
    s.state.air.airborne = true;
    expect(s.setDoor('M2L', true).ok).toBe(false);
  });

  it('is deterministic for identical command sequences', () => {
    const make = () => {
      const s = new AircraftSystems();
      s.applyScenario('apuStart');
      s.setEngineMode('IGN/START');
      s.setEngineMaster(2, true);
      run(s, 23.4);
      s.setThrust(0.6);
      run(s, 7.7);
      return s.state;
    };
    expect(make().engines).toEqual(make().engines);
  });

  it('raises a configuration warning for take-off thrust with the parking brake set', () => {
    const s = new AircraftSystems();
    s.applyScenario('taxi');
    s.setParkingBrake(true);
    s.setThrust(1);
    run(s, 0.5);
    expect(s.state.annunciations.some((a) => a.id === 'pkbrk')).toBe(true);
  });
});
