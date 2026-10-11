/**
 * Low-frequency snapshot of the shared systems state for React UI. The 3D scene reads the
 * live state directly every frame; panels re-render at most ~12 times per second.
 */
import { create } from 'zustand';
import { systems, type SystemsState } from '../sim/systems';

interface SimSnapshot {
  s: SystemsState;
  log: typeof systems.log;
  version: number;
}

const snap = (): Pick<SimSnapshot, 's' | 'log'> => ({ s: structuredClone(systems.state), log: [...systems.log] });

export const useSim = create<SimSnapshot>(() => ({ ...snap(), version: 0 }));

let last = 0;
export function publishSnapshot(now: number, force = false): void {
  if (!force && now - last < 80) return;
  last = now;
  useSim.setState((p) => ({ ...snap(), version: p.version + 1 }));
}

systems.subscribe(() => publishSnapshot(performance.now(), true));
