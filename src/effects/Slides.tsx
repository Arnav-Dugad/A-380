/**
 * Evacuation slides. When an armed door opens, its slide drops out of the door sill, unfolds
 * and inflates in about six seconds: two side beams, a cross tube at the sill and the toe end,
 * and the sliding bed between them (dual-lane, about 1.9 m wide). Upper-deck slides are longer
 * because the sill is 2.7 m higher. Built in the aircraft frame from the door layout.
 */
import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshPhysicalMaterial, type Object3D } from 'three';
import { DOORS, MAIN_DECK_FLOOR, UPPER_DECK_FLOOR } from '../aircraft/geometry/layout';
import { surfaceAt } from '../aircraft/geometry/fuselage';
import { systems } from '../sim/systems';

const WIDTH = 1.9;
const TUBE = 0.24;

interface SlideRig {
  id: string;
  root: Group; // at the sill, rotates about the fuselage axis
  beams: Object3D[];
  bed: Mesh;
  length: number;
  angle: number;
  side: 1 | -1;
}

function buildSlide(id: string, s: number, sill: number, side: 1 | -1, mat: MeshPhysicalMaterial, bedMat: MeshPhysicalMaterial): SlideRig {
  const root = new Group();
  const p = surfaceAt(side, s, sill + 0.02, 0.08);
  root.position.set(p[0], p[1], p[2]);
  // ground contact a little beyond the foot of the slide
  const angle = Math.atan2(sill + 0.2, sill / Math.tan((sill > 7 ? 33 : 31) * (Math.PI / 180)));
  const length = (sill + 0.2) / Math.sin(angle);
  const beams: Object3D[] = [];
  const beamGeo = new CylinderGeometry(TUBE, TUBE, 1, 18, 1);
  beamGeo.rotateZ(Math.PI / 2); // along +X, unit length
  beamGeo.translate(0.5, 0, 0);
  for (const dz of [-WIDTH / 2, WIDTH / 2]) {
    const b = new Mesh(beamGeo, mat);
    b.position.set(0, TUBE, dz);
    beams.push(b);
    root.add(b);
  }
  // cross tubes at the sill and the toe
  const cross = new CylinderGeometry(TUBE * 0.9, TUBE * 0.9, WIDTH, 16, 1);
  cross.rotateX(Math.PI / 2);
  for (const t of [0, 1]) {
    const c = new Mesh(cross, mat);
    c.position.set(t, TUBE, 0);
    c.userData.t = t;
    beams.push(c);
    root.add(c);
  }
  const bedGeo = new BoxGeometry(1, 0.04, WIDTH - TUBE * 0.6);
  bedGeo.translate(0.5, 0, 0);
  const bed = new Mesh(bedGeo, bedMat);
  bed.position.y = TUBE * 0.6;
  root.add(bed);
  // the slide's local +X points outboard; rotate it to lie across the fuselage side
  root.rotation.set(0, side === 1 ? -Math.PI / 2 : Math.PI / 2, 0, 'YXZ');
  root.visible = false;
  for (const o of [...beams, bed]) {
    o.castShadow = true;
    o.receiveShadow = true;
  }
  return { id, root, beams, bed, length, angle, side };
}

export function Slides() {
  const rigs = useMemo(() => {
    const mat = new MeshPhysicalMaterial({ color: '#e3b62f', roughness: 0.55, sheen: 0.6, sheenColor: '#fff0b0', sheenRoughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.4 });
    const bedMat = new MeshPhysicalMaterial({ color: '#c99a22', roughness: 0.75, sheen: 0.4, sheenColor: '#ffe9a0' });
    const out: SlideRig[] = [];
    for (const side of [1, -1] as const) {
      const S = side === 1 ? 'R' : 'L';
      for (const d of DOORS.main) out.push(buildSlide(`${d.id}${S}`, d.s, MAIN_DECK_FLOOR, side, mat, bedMat));
      for (const d of DOORS.upper) out.push(buildSlide(`${d.id}${S}`, d.s, UPPER_DECK_FLOOR, side, mat, bedMat));
    }
    return out;
  }, []);
  const group = useMemo(() => {
    const g = new Group();
    g.name = 'evacuation_slides';
    for (const r of rigs) g.add(r.root);
    return g;
  }, [rigs]);

  useFrame(() => {
    for (const r of rigs) {
      const d = systems.state.doors[r.id];
      const p = d?.slide ?? 0;
      r.root.visible = p > 0.001;
      if (!r.root.visible) continue;
      const ease = (t: number) => t * t * (3 - 2 * t);
      // unfold from hanging against the door to its resting angle, then lengthen and fill
      const unfold = ease(Math.min(1, p / 0.45));
      const fill = ease(Math.min(1, Math.max(0, (p - 0.15) / 0.85)));
      const len = r.length * (0.25 + 0.75 * fill);
      const tilt = -(Math.PI / 2 - 0.15) * (1 - unfold) - r.angle * unfold;
      r.root.rotation.z = tilt;
      const radius = 0.35 + 0.65 * fill;
      for (const b of r.beams) {
        if (b.userData.t !== undefined) {
          b.position.x = (b.userData.t as number) * len;
          b.scale.setScalar(radius);
        } else b.scale.set(len, radius, radius);
      }
      r.bed.scale.set(len, 1, 0.6 + 0.4 * fill);
    }
  });
  return <primitive object={group} />;
}
