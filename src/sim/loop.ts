/**
 * Fixed-timestep simulation clock. Rendering frame rate never changes simulation results:
 * the accumulator advances the systems (and the flight model, when active) in 1/120 s steps.
 */
import { systems } from './systems';

export const SIM_DT = 1 / 120;
const MAX_STEPS = 24; // avoid a spiral of death after a long frame / tab switch

type Stepper = (dt: number) => void;
const steppers = new Set<Stepper>();
let acc = 0;
let paused = false;

export function addStepper(fn: Stepper): () => void {
  steppers.add(fn);
  return () => steppers.delete(fn);
}
export function setPaused(p: boolean): void {
  paused = p;
}
export function isPaused(): boolean {
  return paused;
}

/** Called once per rendered frame with the real elapsed time; returns interpolation alpha. */
export function advance(frameDt: number): number {
  if (paused) return 0;
  acc += Math.min(frameDt, 0.25);
  let n = 0;
  while (acc >= SIM_DT && n < MAX_STEPS) {
    for (const s of steppers) s(SIM_DT);
    systems.step(SIM_DT);
    acc -= SIM_DT;
    n++;
  }
  if (n === MAX_STEPS) acc = 0;
  return acc / SIM_DT;
}
