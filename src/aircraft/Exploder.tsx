/**
 * Exploded-view controller. Offsets are hierarchical and direction-aware: whole assemblies
 * separate from the fuselage, then their sub-components separate along their natural
 * motion axes (slats forward, flaps aft, nacelle modules along the engine axis…), so the
 * layout stays legible and every motion is reversible.
 */
import { useFrame } from '@react-three/fiber';
import { Vector3, type Object3D } from 'three';
import { useUI, type ExplodeGroup } from '../state/ui';
import { getRig, onRig } from './rig';

type Rule = { test: RegExp; group: Exclude<ExplodeGroup, 'all'>; offset: (name: string, o: Object3D) => [number, number, number]; stage: 1 | 2 };

const side = (name: string): number => (/_L(\d|_|$)|_L$/.test(name) ? -1 : 1);
const engSide = (name: string): number => (Number(name.match(/eng(\d)/)?.[1] ?? 3) <= 2 ? -1 : 1);

const RULES: Rule[] = [
  // Stage 1 — whole assemblies
  { test: /^wing_[LR]$/, group: 'wings', stage: 1, offset: (n) => [0, 1.2, side(n) * 9] },
  { test: /^eng\d$/, group: 'engines', stage: 1, offset: (n) => [7, -3.2, engSide(n) * 3] },
  { test: /^pylon_eng\d$/, group: 'engines', stage: 1, offset: (n) => [3, -1.4, engSide(n) * 3] },
  { test: /^htp$/, group: 'empennage', stage: 1, offset: () => [-7, 0, 0] },
  { test: /^vtp$/, group: 'empennage', stage: 1, offset: () => [-4, 6, 0] },
  { test: /^gear_nose$/, group: 'gear', stage: 1, offset: () => [3, -0.2, 0] },
  { test: /^gear_(wing|body)_[LR]$/, group: 'gear', stage: 1, offset: (n) => [n.includes('wing') ? 2 : -2, -0.1, side(n) * (n.includes('wing') ? 5 : 3)] },
  { test: /^gdoor_/, group: 'gear', stage: 1, offset: () => [0, -1.2, 0] },
  { test: /^belly_fairing_[LR]$/, group: 'fuselage', stage: 1, offset: (n) => [0, -2.4, side(n) * 1.2] },
  { test: /^antennas$/, group: 'fuselage', stage: 1, offset: () => [0, 1.6, 0] },
  { test: /^cockpit_window/, group: 'fuselage', stage: 1, offset: () => [1.6, 0.4, 0] },
  // Stage 2 — sub-components within an assembly
  { test: /^slat_|^droop_/, group: 'wings', stage: 2, offset: () => [2.2, 0.2, 0] },
  { test: /^flap_/, group: 'wings', stage: 2, offset: () => [-3.2, -0.6, 0] },
  { test: /^aileron_/, group: 'wings', stage: 2, offset: () => [-2.4, 0, 0] },
  { test: /^spoiler_/, group: 'wings', stage: 2, offset: () => [0, 1.6, 0] },
  { test: /^fairing_/, group: 'wings', stage: 2, offset: () => [0, -1.4, 0] },
  { test: /^tipfence_/, group: 'wings', stage: 2, offset: (n) => [0, 0, side(n) * 1.8] },
  { test: /^elevator_/, group: 'empennage', stage: 2, offset: () => [-2.2, 0, 0] },
  { test: /^rudder_/, group: 'empennage', stage: 2, offset: () => [-2.2, 0, 0] },
  { test: /^eng\d_inlet$/, group: 'engines', stage: 2, offset: () => [3.2, 0, 0] },
  { test: /^eng\d_fan$/, group: 'engines', stage: 2, offset: () => [1.6, 0, 0] },
  { test: /^eng\d_stator$/, group: 'engines', stage: 2, offset: () => [0.6, 0, 0] },
  { test: /^eng\d_reverser$|^eng[14]_sleeve$/, group: 'engines', stage: 2, offset: () => [-1.8, 0, 0] },
  { test: /^eng\d_cascade$/, group: 'engines', stage: 2, offset: () => [-1.0, 0, 0] },
  { test: /^eng\d_core$/, group: 'engines', stage: 2, offset: () => [-3.6, 0, 0] },
  { test: /^eng\d_plug$/, group: 'engines', stage: 2, offset: () => [-5.6, 0, 0] },
  { test: /_bogie$/, group: 'gear', stage: 2, offset: () => [0, -1.2, 0] },
  { test: /^door_.*_panel$/, group: 'fuselage', stage: 2, offset: (_n, o) => [0, 0, Math.sign(o.position.z || 1) * 1.6] },
];

interface Bound {
  node: Object3D;
  base: Vector3;
  offset: Vector3;
  group: Rule['group'];
  stage: 1 | 2;
  articulated: boolean;
}

let bound: Bound[] = [];
function bind() {
  for (const b of bound) if (!b.articulated) b.node.position.copy(b.base);
  bound = [];
  const rig = getRig();
  if (!rig) return;
  for (const [name, node] of rig.nodes) {
    const r = RULES.find((x) => x.test.test(name));
    if (!r) continue;
    bound.push({ node, base: node.position.clone(), offset: new Vector3(...r.offset(name, node)), group: r.group, stage: r.stage, articulated: rig.articulated.has(name) });
  }
}
onRig(bind);

let current = 0;
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export function Exploder() {
  useFrame((_, dt) => {
    const { explode, explodeGroup } = useUI.getState();
    if (getRig() && bound.length === 0) bind();
    current += (explode - current) * (1 - Math.exp(-dt * 6));
    if (Math.abs(current - explode) < 1e-4) current = explode;
    // Stage 1 uses the first 60 % of the slider, stage 2 the remaining travel.
    const s1 = ease(Math.min(1, current / 0.6));
    const s2 = ease(Math.max(0, (current - 0.35) / 0.65));
    for (const b of bound) {
      const on = explodeGroup === 'all' || explodeGroup === b.group;
      const k = on ? (b.stage === 1 ? s1 : s2) : 0;
      // Articulated nodes are re-posed every frame by the animator; add our offset on top.
      if (b.articulated) b.node.position.addScaledVector(b.offset, k);
      else b.node.position.copy(b.base).addScaledVector(b.offset, k);
    }
  });
  return null;
}
