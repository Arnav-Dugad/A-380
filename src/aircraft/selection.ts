/**
 * Component selection and highlighting. A click resolves to a *selection unit*: the
 * articulated pivot that owns the mesh (a single slat, door or wheel), or — for aggregate
 * parts such as the wing box — every mesh of that part within the same side group.
 */
import { Mesh, type Object3D } from 'three';
import { PARTS } from '../data/parts';
import { getRig, type AircraftRig } from './rig';

export interface SelectionUnit {
  partId: string;
  node: Object3D;
  meshes: Mesh[];
}

const SIDE_GROUPS = /^(wing_[LR]|htp|vtp|airframe|gear|engines|eng\d)$/;

export function resolveSelection(mesh: Object3D, rig: AircraftRig | null = getRig()): SelectionUnit | null {
  const partId = mesh.userData.partId as string | undefined;
  if (!partId) return null;
  const info = PARTS[partId];
  // 1. articulated owner (slat, flap, door panel, wheel…)
  let p: Object3D | null = mesh;
  while (p) {
    if (p.userData.articulation && p.userData.partId === partId) break;
    p = p.parent;
  }
  if (p && !info?.aggregate) return { partId, node: p, meshes: meshesUnder(p) };
  // 2. aggregate parts: all meshes of this part inside the same side group
  if (info?.aggregate) {
    let g: Object3D | null = mesh.parent;
    while (g && !SIDE_GROUPS.test(g.name)) g = g.parent;
    const root = g ?? mesh;
    const meshes = meshesUnder(root).filter((m) => m.userData.partId === partId);
    return { partId, node: root, meshes };
  }
  // 3. engine sub-assemblies select the specific engine's component; otherwise the mesh.
  void rig;
  return { partId, node: mesh, meshes: [mesh as Mesh] };
}

export function meshesUnder(o: Object3D): Mesh[] {
  const out: Mesh[] = [];
  o.traverse((c) => {
    if (c instanceof Mesh) out.push(c);
  });
  return out;
}

/** Find a selection unit by scene node name (used to restore selection after LOD swaps). */
export function unitByNode(name: string, partId: string): SelectionUnit | null {
  const rig = getRig();
  const node = rig?.nodes.get(name);
  if (!node) return null;
  const m = meshesUnder(node).find((x) => x.userData.partId === partId) ?? meshesUnder(node)[0];
  return m ? resolveSelection(m, rig) : null;
}

/** Human-readable instance label from a node name, e.g. slat_R3 → "No. 3 · right wing". */
export function instanceLabel(name: string | null | undefined): string | null {
  if (!name) return null;
  const side = /_R\d|_R$|_R_|R$/.test(name) ? 'right' : /_L\d|_L$|_L_|L$/.test(name) ? 'left' : null;
  const num = name.match(/(\d+)(?!.*\d)/)?.[1];
  const eng = name.match(/^eng(\d)/)?.[1];
  if (eng) return `Engine ${eng} · ${Number(eng) <= 2 ? 'left' : 'right'} wing`;
  const door = name.match(/^door_([MU]\d)([LR])/);
  if (door) return `Door ${door[1]}${door[2]} · ${door[1]!.startsWith('U') ? 'upper' : 'main'} deck, ${door[2] === 'L' ? 'left' : 'right'} side`;
  if (name.startsWith('door_')) return name.replace('door_', '').replace('_panel', '').replace('_', ' ').toLowerCase();
  if (name.startsWith('wing_') || name === 'htp' || name === 'vtp' || name === 'airframe') return side ? `${side} side` : null;
  if (/gear_(wing|body)_[LR]/.test(name)) return `${side} side`;
  if (num && side) return `No. ${num} · ${side} ${name.startsWith('elevator') ? 'stabiliser' : 'wing'}`;
  if (name.includes('rudder')) return name.includes('upper') ? 'upper panel' : 'lower panel';
  return side ? `${side} side` : null;
}
