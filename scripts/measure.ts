/** Measures the generated geometry against published dimensions (used by docs/ACCURACY.md and tests). */
import { Box3 } from 'three';
import { buildAsset } from '../src/aircraft/geometry/aircraft';
import { planformArea } from '../src/aircraft/geometry/wing';
import { engineFrames } from '../src/aircraft/geometry/engine';
import { NACELLE } from '../src/aircraft/geometry/layout';

const box = new Box3();
for (const a of ['airframe', 'wings', 'empennage', 'engines', 'gear'] as const) box.union(new Box3().setFromObject(buildAsset(a, 0.5)));
const size = box.getSize(new (box.min.constructor as new () => typeof box.min)());
console.log(JSON.stringify({
  length: +size.x.toFixed(2),
  span: +size.z.toFixed(2),
  height: +box.max.y.toFixed(2),
  wingArea: +planformArea().toFixed(1),
  engines: engineFrames().map((f) => ({ id: f.id, z: f.z, axisY: +f.origin[1].toFixed(2), nacelleBottom: +(f.origin[1] - NACELLE.maxRadius).toFixed(2) })),
}, null, 1));
