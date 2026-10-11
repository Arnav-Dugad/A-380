/**
 * The rig indexes a loaded aircraft scene graph: named nodes, articulated pivots (with their
 * rest pose) and meshes grouped by part id. Animation controllers drive the rig imperatively
 * every frame, so mechanical motion never triggers React re-renders.
 */
import { Mesh, Quaternion, Vector3, type Material, type Object3D } from 'three';
import type { Articulation } from './geometry/parts';

export interface Articulated {
  node: Object3D;
  art: Articulation;
  basePos: Vector3;
  baseQuat: Quaternion;
  axis: Vector3;
  travel: Vector3;
}

const tmpQ = new Quaternion();

export class AircraftRig {
  readonly nodes = new Map<string, Object3D>();
  readonly articulated = new Map<string, Articulated>();
  readonly partMeshes = new Map<string, Mesh[]>();
  readonly meshes: Mesh[] = [];
  readonly originalMaterials = new Map<Mesh, Material | Material[]>();

  constructor(readonly roots: Object3D[]) {
    for (const r of roots) this.index(r);
    for (const r of extraRoots) this.index(r);
  }

  /** Rebuild all indices (after attaching / detaching an extra root). */
  reindex(): void {
    this.nodes.clear();
    this.articulated.clear();
    this.partMeshes.clear();
    this.meshes.length = 0;
    for (const r of this.roots) this.index(r);
    for (const r of extraRoots) this.index(r);
  }

  private index(root: Object3D) {
    root.traverse((o) => {
      if (o.name) this.nodes.set(o.name, o);
      const art = o.userData.articulation as Articulation | undefined;
      if (art) {
        this.articulated.set(o.name, {
          node: o,
          art,
          basePos: o.position.clone(),
          baseQuat: o.quaternion.clone(),
          axis: new Vector3(...(art.axis ?? [1, 0, 0])).normalize(),
          travel: new Vector3(...(art.travel ?? [0, 0, 0])),
        });
      }
      if (o instanceof Mesh) {
        this.meshes.push(o);
        const id = (o.userData.partId as string | undefined) ?? partIdOf(o);
        if (id) {
          o.userData.partId = id;
          const list = this.partMeshes.get(id) ?? [];
          list.push(o);
          this.partMeshes.set(id, list);
        }
      }
    });
  }

  get(name: string): Articulated | undefined {
    return this.articulated.get(name);
  }

  /** Rotate a hinge to `deg` degrees (clamped to limits) and optionally slide `t` of its travel. */
  hinge(name: string, deg: number, travelFraction = 0): void {
    const a = this.articulated.get(name);
    if (!a) return;
    const lo = a.art.min ?? -180;
    const hi = a.art.max ?? 180;
    const d = Math.min(hi, Math.max(lo, deg));
    tmpQ.setFromAxisAngle(a.axis, (d * Math.PI) / 180);
    a.node.quaternion.copy(a.baseQuat).premultiply(tmpQ);
    a.node.position.copy(a.basePos).addScaledVector(a.travel, travelFraction);
  }

  slide(name: string, t: number): void {
    const a = this.articulated.get(name);
    if (!a) return;
    a.node.position.copy(a.basePos).addScaledVector(a.travel, t);
  }

  /** Two-phase plug-door motion: outward first, then forward along the fuselage. */
  door(name: string, t: number): void {
    const a = this.articulated.get(name);
    if (!a) return;
    const out = Math.min(1, t / 0.25);
    const fwd = Math.max(0, (t - 0.2) / 0.8);
    a.node.position.set(
      a.basePos.x + a.travel.x * fwd,
      a.basePos.y + a.travel.y * Math.min(1, t * 3),
      a.basePos.z + a.travel.z * out,
    );
  }

  spin(name: string, angle: number): void {
    const a = this.articulated.get(name);
    if (!a) return;
    tmpQ.setFromAxisAngle(a.axis, angle);
    a.node.quaternion.copy(a.baseQuat).premultiply(tmpQ);
    a.node.position.copy(a.basePos);
  }

  /** Reset every articulated node to its rest pose. */
  reset(): void {
    for (const a of this.articulated.values()) {
      a.node.position.copy(a.basePos);
      a.node.quaternion.copy(a.baseQuat);
    }
  }
}

function partIdOf(o: Object3D): string | undefined {
  let p: Object3D | null = o;
  while (p) {
    if (p.userData.partId) return p.userData.partId as string;
    p = p.parent;
  }
  return undefined;
}

// --- extra scene roots (structure, cabin, cockpit) indexed by every rig
const extraRoots = new Set<Object3D>();
export function attachRoot(root: Object3D): void {
  extraRoots.add(root);
  current?.reindex();
  for (const l of listeners) l(current);
}
export function detachRoot(root: Object3D): void {
  extraRoots.delete(root);
  current?.reindex();
  for (const l of listeners) l(current);
}

// --- global registry so non-React systems (controllers, camera, selection) can reach the rig
let current: AircraftRig | null = null;
const listeners = new Set<(r: AircraftRig | null) => void>();
export function setRig(r: AircraftRig | null): void {
  current = r;
  for (const l of listeners) l(r);
}
export function getRig(): AircraftRig | null {
  return current;
}
export function onRig(fn: (r: AircraftRig | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
