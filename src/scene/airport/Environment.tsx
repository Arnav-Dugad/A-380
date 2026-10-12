/**
 * Apron realism: jointed concrete slabs with sealant lines, tone variation, tyre tracks and oil
 * stains; puddles that appear in rain; a terminal curtain wall with mullions and lit interiors;
 * other airliners parked at neighbouring stands; and ground crew in hi-vis vests.
 */
import { useMemo } from 'react';
import {
  BoxGeometry,
  CanvasTexture,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  DataTexture,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  Object3D,
  RepeatWrapping,
  RGBAFormat,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  type BufferGeometry,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { APRON, STAND, TERMINAL } from './layout';

const rng = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

/**
 * Concrete slab tile: 8 × 8 slabs of 5 m. Colour, a normal map from the joint height field and
 * roughness (sealed joints and rubber are smoother, worn concrete rougher).
 */
function slabTextures(): { map: Texture; normal: Texture; rough: Texture } {
  const S = 1024;
  const n = 8;
  const cell = S / n;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  const rnd = rng(17);
  // per-slab tone
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const v = 160 + (rnd() - 0.5) * 22;
      x.fillStyle = `rgb(${v},${v - 1},${v - 5})`;
      x.fillRect(i * cell, j * cell, cell, cell);
    }
  // aggregate speckle and fine cracks
  const img = x.getImageData(0, 0, S, S);
  for (let p = 0; p < S * S; p++) {
    const d = (rnd() - 0.5) * 26;
    img.data[p * 4]! += d;
    img.data[p * 4 + 1]! += d;
    img.data[p * 4 + 2]! += d;
  }
  x.putImageData(img, 0, 0);
  x.strokeStyle = 'rgba(70,70,68,0.35)';
  x.lineWidth = 1;
  for (let k = 0; k < 26; k++) {
    let px = rnd() * S;
    let py = rnd() * S;
    x.beginPath();
    x.moveTo(px, py);
    for (let s = 0; s < 8; s++) {
      px += (rnd() - 0.5) * 30;
      py += (rnd() - 0.5) * 30;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  // weathered blotches
  for (let k = 0; k < 60; k++) {
    const r = 10 + rnd() * 60;
    const g = x.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgba(${rnd() > 0.5 ? '90,88,84' : '205,204,198'},0.12)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.save();
    x.translate(rnd() * S, rnd() * S);
    x.fillStyle = g;
    x.fillRect(-r, -r, 2 * r, 2 * r);
    x.restore();
  }
  // sealant joints
  x.fillStyle = '#2b2b2a';
  for (let i = 0; i <= n; i++) {
    x.fillRect(i * cell - 2, 0, 4, S);
    x.fillRect(0, i * cell - 2, S, 4);
  }
  const map = new CanvasTexture(c);
  map.colorSpace = SRGBColorSpace;
  // height: joints recessed, slab edges slightly chamfered
  const h = new Float32Array(S * S);
  for (let yy = 0; yy < S; yy++)
    for (let xx = 0; xx < S; xx++) {
      const dx = Math.min(xx % cell, cell - (xx % cell));
      const dy = Math.min(yy % cell, cell - (yy % cell));
      const d = Math.min(dx, dy);
      h[yy * S + xx] = d < 2.5 ? -6 : d < 5 ? -6 + (d - 2.5) * 2.4 : (rnd() - 0.5) * 0.6;
    }
  const nrm = new Uint8Array(S * S * 4);
  const rough = new Uint8Array(S * S * 4);
  for (let yy = 0; yy < S; yy++)
    for (let xx = 0; xx < S; xx++) {
      const at = (a: number, b: number) => h[((b + S) % S) * S + ((a + S) % S)]!;
      const gx = (at(xx + 1, yy) - at(xx - 1, yy)) * 0.25;
      const gy = (at(xx, yy + 1) - at(xx, yy - 1)) * 0.25;
      const l = Math.hypot(gx, gy, 1);
      const o = (yy * S + xx) * 4;
      nrm[o] = (-gx / l) * 127 + 128;
      nrm[o + 1] = (gy / l) * 127 + 128;
      nrm[o + 2] = (1 / l) * 127 + 128;
      nrm[o + 3] = 255;
      const joint = h[yy * S + xx]! < -3;
      rough[o] = 255;
      rough[o + 1] = joint ? 150 : 225 + (rnd() - 0.5) * 30;
      rough[o + 2] = 0;
      rough[o + 3] = 255;
    }
  const mk = (data: Uint8Array) => {
    const t = new DataTexture(data, S, S, RGBAFormat);
    t.colorSpace = NoColorSpace;
    t.generateMipmaps = true;
    t.minFilter = LinearMipmapLinearFilter;
    t.magFilter = LinearFilter;
    t.needsUpdate = true;
    return t;
  };
  const normal = mk(nrm);
  const roughT = mk(rough);
  for (const t of [map, normal, roughT]) {
    t.wrapS = t.wrapT = RepeatWrapping;
    t.anisotropy = 8;
  }
  return { map, normal, rough: roughT };
}

/** Soft decal sheet: tyre tracks along the lead-in line and oil stains on the stand. */
function stainTexture(): Texture {
  const W = 512;
  const H = 1024;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d')!;
  const rnd = rng(23);
  // nose-wheel and main-gear tracks running up the stand centreline
  for (const [cx, w, a] of [
    [W / 2, 14, 0.22],
    [W / 2 - 92, 26, 0.16],
    [W / 2 + 92, 26, 0.16],
    [W / 2 - 34, 22, 0.12],
    [W / 2 + 34, 22, 0.12],
  ] as const) {
    const g = x.createLinearGradient(cx - w, 0, cx + w, 0);
    g.addColorStop(0, 'rgba(20,20,20,0)');
    g.addColorStop(0.5, `rgba(20,20,20,${a})`);
    g.addColorStop(1, 'rgba(20,20,20,0)');
    x.fillStyle = g;
    x.fillRect(cx - w, 0, 2 * w, H);
  }
  for (let k = 0; k < 40; k++) {
    const r = 6 + rnd() * 40;
    const g = x.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgba(30,26,20,${0.12 + rnd() * 0.2})`);
    g.addColorStop(1, 'rgba(30,26,20,0)');
    x.save();
    x.translate(W / 2 + (rnd() - 0.5) * 300, rnd() * H);
    x.scale(1, 0.6 + rnd());
    x.fillStyle = g;
    x.fillRect(-r, -r, 2 * r, 2 * r);
    x.restore();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function puddleAlpha(): Texture {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d')!;
  x.fillStyle = '#000';
  x.fillRect(0, 0, S, S);
  const rnd = rng(31);
  for (let k = 0; k < 22; k++) {
    const cx = rnd() * S;
    const cy = rnd() * S;
    for (let b = 0; b < 5; b++) {
      const r = 8 + rnd() * 34;
      const g = x.createRadialGradient(0, 0, r * 0.4, 0, 0, r);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.save();
      x.translate(cx + (rnd() - 0.5) * 40, cy + (rnd() - 0.5) * 30);
      x.scale(1, 0.5 + rnd() * 0.6);
      x.fillStyle = g;
      x.beginPath();
      x.arc(0, 0, r, 0, Math.PI * 2);
      x.fill();
      x.restore();
    }
  }
  const t = new CanvasTexture(c);
  t.colorSpace = NoColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

export function ApronSurface({ wet }: { wet: number }) {
  const data = useMemo(() => {
    const slab = slabTextures();
    const w = APRON.x1 - APRON.x0;
    const d = Math.abs(APRON.z1 - APRON.z0);
    for (const t of [slab.map, slab.normal, slab.rough]) t.repeat.set(w / 40, d / 40);
    const mat = new MeshStandardMaterial({ map: slab.map, normalMap: slab.normal, normalScale: new Vector2(0.6, 0.6), roughnessMap: slab.rough, roughness: 1, color: '#d9dad6', polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
    const stains = new MeshStandardMaterial({ map: stainTexture(), transparent: true, depthWrite: false, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const puddleTex = puddleAlpha();
    puddleTex.repeat.set(w / 60, d / 60);
    const puddles = new MeshPhysicalMaterial({ color: '#4a4c50', roughness: 0.03, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, alphaMap: puddleTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    return { mat, stains, puddles, w, d };
  }, []);
  data.mat.roughness = 1 - wet * 0.55;
  data.puddles.opacity = Math.min(1, wet * 1.6);
  return (
    <group>
      <mesh position={[(APRON.x0 + APRON.x1) / 2, 0.02, (APRON.z0 + APRON.z1) / 2]} rotation-x={-Math.PI / 2} receiveShadow material={data.mat}>
        <planeGeometry args={[data.w, data.d]} />
      </mesh>
      <mesh position={[STAND.x, 0.045, STAND.z + 10]} rotation-x={-Math.PI / 2} receiveShadow material={data.stains}>
        <planeGeometry args={[40, 110]} />
      </mesh>
      {wet > 0.05 && (
        <mesh position={[(APRON.x0 + APRON.x1) / 2, 0.05, (APRON.z0 + APRON.z1) / 2]} rotation-x={-Math.PI / 2} receiveShadow material={data.puddles}>
          <planeGeometry args={[data.w, data.d]} />
        </mesh>
      )}
    </group>
  );
}

/** Curtain wall: mullion grid in front of glazing, warm interior glow at night. */
export function TerminalFacade({ night }: { night: boolean }) {
  const geo = useMemo(() => {
    const T = TERMINAL;
    const parts: BufferGeometry[] = [];
    const z = T.z - 6 + 0.45;
    const y0 = 4.5;
    const y1 = T.height - 3.5;
    for (let x = T.x0 + 10; x <= T.x1 - 10; x += 3) {
      const g = new BoxGeometry(0.14, y1 - y0, 0.3);
      g.translate(x, (y0 + y1) / 2, z);
      parts.push(g);
    }
    for (let y = y0; y <= y1; y += 2.4) {
      const g = new BoxGeometry(T.x1 - T.x0 - 20, 0.12, 0.26);
      g.translate((T.x0 + T.x1) / 2, y, z);
      parts.push(g);
    }
    // canopy over the apron-level doors
    const canopy = new BoxGeometry(T.x1 - T.x0 - 20, 0.35, 4.5);
    canopy.translate((T.x0 + T.x1) / 2, 4.2, T.z + 1.5);
    parts.push(canopy);
    return mergeGeometries(parts.map((g) => g.toNonIndexed()));
  }, []);
  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial color={night ? '#4d5560' : '#8e979f'} roughness={0.35} metalness={0.8} />
    </mesh>
  );
}

/**
 * Generic twin-engine widebodies at the neighbouring stands (low-poly silhouettes, plain
 * fictional liveries): context and scale for the A380.
 */
export function OtherAircraft() {
  const meshes = useMemo(() => {
    const body: BufferGeometry[] = [];
    const dark: BufferGeometry[] = [];
    const one = (cx: number, cz: number, len: number, tailColor: BufferGeometry[]) => {
      // aircraft nose-in, heading north (−Z); fuselage along Z
      const r = len * 0.045;
      const fus = new CapsuleGeometry(r, len - 2 * r, 8, 24);
      fus.rotateX(Math.PI / 2);
      fus.translate(cx, r + 2.6, cz);
      body.push(fus);
      const span = len * 0.95;
      const wing = new BoxGeometry(span, 0.45, len * 0.13);
      wing.translate(cx, r + 1.6, cz + len * 0.04);
      body.push(wing);
      const stab = new BoxGeometry(span * 0.34, 0.3, len * 0.07);
      stab.translate(cx, r * 2 + 2.2, cz + len * 0.44);
      body.push(stab);
      const fin = new BoxGeometry(0.4, len * 0.17, len * 0.1);
      fin.translate(cx, r * 2 + 2.6 + len * 0.085, cz + len * 0.42);
      tailColor.push(fin);
      for (const sx of [-1, 1]) {
        const eng = new CylinderGeometry(r * 0.55, r * 0.5, len * 0.08, 20);
        eng.rotateX(Math.PI / 2);
        eng.translate(cx + sx * span * 0.17, r + 0.7, cz - len * 0.03);
        body.push(eng);
        const gearG = new CylinderGeometry(0.55, 0.55, 0.5, 14);
        gearG.rotateZ(Math.PI / 2);
        gearG.translate(cx + sx * 4.5, 0.55, cz + len * 0.06);
        dark.push(gearG);
      }
      const nose = new CylinderGeometry(0.45, 0.45, 0.35, 12);
      nose.rotateZ(Math.PI / 2);
      nose.translate(cx, 0.45, cz - len * 0.38);
      dark.push(nose);
      // cockpit windows band
      const cw = new BoxGeometry(r * 1.4, 0.35, 0.8);
      cw.translate(cx, r * 1.55 + 2.6, cz - len / 2 + r * 0.9);
      dark.push(cw);
    };
    const tailA: BufferGeometry[] = [];
    const tailB: BufferGeometry[] = [];
    one(STAND.x - 95, STAND.z + 4, 64, tailA);
    one(STAND.x + 95, STAND.z + 2, 70, tailB);
    one(STAND.x - 190, STAND.z + 6, 58, tailB);
    one(STAND.x + 185, STAND.z + 4, 64, tailA);
    const m = (list: BufferGeometry[]) => mergeGeometries(list.map((g) => g.toNonIndexed()));
    return { body: m(body), tailA: m(tailA), tailB: m(tailB), dark: m(dark) };
  }, []);
  return (
    <group name="otherAircraft">
      <mesh geometry={meshes.body} castShadow receiveShadow>
        <meshPhysicalMaterial color="#eceef0" roughness={0.3} clearcoat={0.6} />
      </mesh>
      <mesh geometry={meshes.tailA} castShadow>
        <meshPhysicalMaterial color="#7a2632" roughness={0.3} clearcoat={0.6} />
      </mesh>
      <mesh geometry={meshes.tailB} castShadow>
        <meshPhysicalMaterial color="#244a6b" roughness={0.3} clearcoat={0.6} />
      </mesh>
      <mesh geometry={meshes.dark}>
        <meshStandardMaterial color="#141618" roughness={0.6} />
      </mesh>
    </group>
  );
}

/** Ground crew in hi-vis vests around the stand (instanced, five draw calls). */
export function GroundCrew() {
  const data = useMemo(() => {
    const zs = (s: number) => STAND.z - (36.0 - s);
    const people: [number, number, number][] = [
      [STAND.x + 0.5, zs(-14), Math.PI], // marshaller ahead of the nose
      [STAND.x + 6, zs(17.2) + 2.5, -Math.PI / 2], // loaders at the forward hold
      [STAND.x + 9.5, zs(17.2) - 1.5, -Math.PI / 2],
      [STAND.x + 6.5, zs(50.5) + 1.8, -Math.PI / 2],
      [STAND.x + 18.5, zs(33) - 4, Math.PI / 2], // refueller
      [STAND.x + 4.5, zs(3.5) + 1.5, 0], // ground power
      [STAND.x - 6.5, zs(40), Math.PI / 2], // walk-around
      [STAND.x + 14, zs(6) + 2, Math.PI],
    ];
    const n = people.length;
    const legs = new InstancedMesh(new CapsuleGeometry(0.13, 0.62, 4, 8), new MeshStandardMaterial({ color: '#23272e', roughness: 0.8 }), n * 2);
    const torso = new InstancedMesh(new CapsuleGeometry(0.2, 0.42, 4, 10), new MeshStandardMaterial({ color: '#f2b705', roughness: 0.55, emissive: new Color('#3a2a00') }), n);
    const stripe = new InstancedMesh(new CylinderGeometry(0.215, 0.215, 0.05, 12), new MeshStandardMaterial({ color: '#dfe3e6', roughness: 0.3, metalness: 0.6 }), n);
    const head = new InstancedMesh(new SphereGeometry(0.12, 12, 10), new MeshStandardMaterial({ color: '#b98b6a', roughness: 0.7 }), n);
    const ear = new InstancedMesh(new SphereGeometry(0.135, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new MeshStandardMaterial({ color: '#e64a19', roughness: 0.5 }), n);
    const o = new Object3D();
    people.forEach(([x, z, yaw], i) => {
      for (const s of [-1, 1]) {
        o.position.set(x + Math.cos(yaw) * 0.11 * s, 0.45, z - Math.sin(yaw) * 0.11 * s);
        o.rotation.set(0, yaw, 0);
        o.updateMatrix();
        legs.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), o.matrix);
      }
      o.position.set(x, 1.2, z);
      o.updateMatrix();
      torso.setMatrixAt(i, o.matrix);
      o.position.set(x, 1.14, z);
      o.updateMatrix();
      stripe.setMatrixAt(i, o.matrix);
      o.position.set(x, 1.66, z);
      o.updateMatrix();
      head.setMatrixAt(i, o.matrix);
      ear.setMatrixAt(i, o.matrix); // ear defenders / cap
    });
    const all = [legs, torso, stripe, head, ear];
    for (const m of all) {
      m.castShadow = true;
      m.instanceMatrix.needsUpdate = true;
    }
    return all;
  }, []);
  return (
    <group name="groundCrew">
      {data.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  );
}

