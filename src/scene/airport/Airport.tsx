/**
 * Procedural airport: runway with ICAO-style markings built from geometry (crisp at any
 * distance), parallel taxiway and connectors, apron with stand markings, terminal with
 * glazed facade, control tower, three A380 boarding bridges, ground support equipment and
 * instanced airfield lighting. Everything is generated at runtime — no downloads.
 */
import { useMemo } from 'react';
import { BoxGeometry, CanvasTexture, Color, InstancedMesh, LinearSRGBColorSpace, Matrix4, MeshStandardMaterial, PlaneGeometry, RepeatWrapping, SRGBColorSpace, Quaternion, Vector3, type BufferGeometry, type Texture } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildGse } from './gse';
import { BeltBags, JetBridges, useFleetVisible } from './GroundOps';
import { APRON, RWY, STAND, TERMINAL, TOWER, TWY_CONNECTORS, TWY_Z } from './layout';

function noiseTex(base: [number, number, number], amp: number, size = 512, streaks = false): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < size * size; i++) {
    const n = (rnd() - 0.5) * amp;
    img.data[i * 4] = base[0] + n;
    img.data[i * 4 + 1] = base[1] + n;
    img.data[i * 4 + 2] = base[2] + n;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  if (streaks) {
    // tyre rubber deposits / slab joints
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, rnd() * size, size, 1 + rnd() * 3);
    }
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = '#000';
    for (let k = 0; k < size; k += size / 4) {
      ctx.beginPath();
      ctx.moveTo(k, 0);
      ctx.lineTo(k, size);
      ctx.stroke();
    }
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function textTexture(text: string): Texture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 256, 512);
  ctx.fillStyle = '#fff';
  ctx.font = '700 300px "Inter Variable", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(128, 256);
  ctx.scale(0.62, 1.55);
  ctx.fillText(text, 0, 0);
  ctx.restore();
  const t = new CanvasTexture(c);
  t.colorSpace = LinearSRGBColorSpace;
  return t;
}

/** Flat quad lying on the ground (XZ), centred at (x, z), size along X (w) and Z (d). */
function flat(x: number, z: number, w: number, d: number, y = 0.05, rotY = 0): BufferGeometry {
  const g = new PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

function box(x: number, y: number, z: number, w: number, h: number, d: number): BufferGeometry {
  const g = new BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  return g;
}

function runwayMarkings(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const { length: L, width: W } = RWY;
  // Threshold "piano keys" (16 stripes) at both ends
  for (const end of [0, L]) {
    const dir = end === 0 ? 1 : -1;
    for (let i = 0; i < 16; i++) {
      const z = -W / 2 + 3 + i * ((W - 6) / 15) + (i >= 8 ? 1.5 : -1.5);
      parts.push(flat(end + dir * 36, z, 30, 1.8));
    }
    // Aiming point markings (two large blocks at 400 m)
    for (const z of [-10, 10]) parts.push(flat(end + dir * 420, z, 60, 9));
    // Touchdown zone bars (pairs)
    for (const d of [150, 300, 600, 750, 900]) for (const z of [-17, -13, 13, 17]) parts.push(flat(end + dir * d, z, 22.5, 1.8));
  }
  // Centreline: 30 m dashes with 20 m gaps
  for (let x = 120; x < L - 120; x += 50) parts.push(flat(x, 0, 30, 0.9));
  // Edge lines
  parts.push(flat(L / 2, -W / 2 + 0.6, L, 0.9), flat(L / 2, W / 2 - 0.6, L, 0.9));
  return mergeGeometries(parts.map((p) => p.toNonIndexed()));
}

function taxiwayGeometry(): { pave: BufferGeometry; lines: BufferGeometry } {
  const pave: BufferGeometry[] = [];
  const lines: BufferGeometry[] = [];
  pave.push(flat(RWY.length / 2, TWY_Z, RWY.length, 23, 0.01));
  lines.push(flat(RWY.length / 2, TWY_Z, RWY.length, 0.3, 0.025));
  for (const x of TWY_CONNECTORS) {
    pave.push(flat(x, TWY_Z / 2, 23, Math.abs(TWY_Z) - RWY.width / 2 + 4, 0.012));
    lines.push(flat(x, TWY_Z / 2, 0.3, Math.abs(TWY_Z) - 10, 0.026));
  }
  // Apron link
  pave.push(flat((APRON.x0 + APRON.x1) / 2, (TWY_Z + APRON.z0) / 2, 120, Math.abs(APRON.z0 - TWY_Z), 0.011));
  return { pave: mergeGeometries(pave.map((p) => p.toNonIndexed())), lines: mergeGeometries(lines.map((p) => p.toNonIndexed())) };
}

function standMarkings(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  // lead-in line from taxilane to stop bar (aircraft nose-in heading north)
  parts.push(flat(STAND.x, (APRON.z0 + STAND.z) / 2 + 20, 0.35, Math.abs(STAND.z - APRON.z0) - 40, 0.06));
  parts.push(flat(STAND.x, STAND.z - 36.5, 4, 0.4, 0.06)); // stop bar at the nose position
  // safety envelope (red) – A380 code F stand ~ 80 × 80 m
  const e = 42;
  for (const [x, z, w, d] of [
    [STAND.x, STAND.z - e, 2 * e, 0.3],
    [STAND.x, STAND.z + e, 2 * e, 0.3],
    [STAND.x - e, STAND.z, 0.3, 2 * e],
    [STAND.x + e, STAND.z, 0.3, 2 * e],
  ] as const)
    parts.push(flat(x, z, w, d, 0.06));
  // taxilane along the apron
  parts.push(flat((APRON.x0 + APRON.x1) / 2, APRON.z0 - 25, APRON.x1 - APRON.x0, 0.35, 0.06));
  return mergeGeometries(parts.map((p) => p.toNonIndexed()));
}

function terminal(): { body: BufferGeometry; glass: BufferGeometry; roof: BufferGeometry } {
  const T = TERMINAL;
  const body = mergeGeometries([box((T.x0 + T.x1) / 2, 0, T.z - T.depth / 2, T.x1 - T.x0, 4, T.depth), box((T.x0 + T.x1) / 2, 4, T.z - T.depth / 2 - 6, T.x1 - T.x0, T.height - 4, T.depth - 12)].map((g) => g.toNonIndexed()));
  const glassG = new PlaneGeometry(T.x1 - T.x0 - 20, T.height - 8);
  glassG.translate((T.x0 + T.x1) / 2, 4 + (T.height - 8) / 2 + 1, T.z + 0.2 - 6);
  const roof = box((T.x0 + T.x1) / 2, T.height, T.z - T.depth / 2, T.x1 - T.x0 + 30, 1.6, T.depth + 24);
  return { body, glass: glassG, roof };
}

function tower(): BufferGeometry {
  return mergeGeometries([box(TOWER.x, 0, TOWER.z, 9, 52, 9), box(TOWER.x, 52, TOWER.z, 16, 7, 16), box(TOWER.x, 59, TOWER.z, 13, 1.2, 13), box(TOWER.x, 60.2, TOWER.z, 1, 8, 1)].map((g) => g.toNonIndexed()));
}

/** Instanced airfield lights: runway edge (white), centreline, thresholds (green/red), taxiway edges (blue). */
function lightInstances(): { pos: Vector3; color: Color }[] {
  const out: { pos: Vector3; color: Color }[] = [];
  const white = new Color('#fff4d6');
  const green = new Color('#3cff7a');
  const red = new Color('#ff3b30');
  const blue = new Color('#3b7bff');
  for (let x = 0; x <= RWY.length; x += 60) {
    out.push({ pos: new Vector3(x, 0.3, -RWY.width / 2 - 1.5), color: white });
    out.push({ pos: new Vector3(x, 0.3, RWY.width / 2 + 1.5), color: white });
  }
  for (let x = 0; x <= RWY.length; x += 15) out.push({ pos: new Vector3(x, 0.1, 0.8), color: x > RWY.length - 900 ? red : white });
  for (let z = -RWY.width / 2; z <= RWY.width / 2; z += 3) {
    out.push({ pos: new Vector3(-1, 0.3, z), color: green });
    out.push({ pos: new Vector3(RWY.length + 1, 0.3, z), color: red });
  }
  for (let x = 0; x <= RWY.length; x += 45) {
    out.push({ pos: new Vector3(x, 0.3, TWY_Z - 13), color: blue });
    out.push({ pos: new Vector3(x, 0.3, TWY_Z + 13), color: blue });
  }
  // Approach lighting system west of runway 09 (900 m)
  for (let x = -900; x < -30; x += 30) for (const z of [-6, -3, 0, 3, 6]) out.push({ pos: new Vector3(x, 0.8, z), color: white });
  return out;
}

export function Airport({ night }: { night: boolean }) {
  const data = useMemo(() => {
    const asphalt = noiseTex([58, 60, 64], 20, 512, true);
    asphalt.repeat.set(40, 1);
    const concrete = noiseTex([150, 150, 146], 18, 512, true);
    concrete.repeat.set(18, 6);
    const tw = taxiwayGeometry();
    const term = terminal();
    const g = buildGse();
    const lights = lightInstances();
    const lightGeo = new BoxGeometry(0.5, 0.25, 0.5);
    const lightMat = new MeshStandardMaterial({ color: '#111', emissive: '#ffffff', emissiveIntensity: 3, toneMapped: false });
    const lm = new InstancedMesh(lightGeo, lightMat, lights.length);
    const m = new Matrix4();
    lights.forEach((l, i) => {
      m.compose(l.pos, new Quaternion(), new Vector3(1, 1, 1));
      lm.setMatrixAt(i, m);
      lm.setColorAt(i, l.color);
    });
    lm.frustumCulled = false;
    const num09 = textTexture('09');
    const num27 = textTexture('27');
    return { asphalt, concrete, tw, term, g, lm, lightMat, num09, num27, markings: runwayMarkings(), stand: standMarkings(), tower: tower() };
  }, []);

  data.lightMat.emissiveIntensity = night ? 4 : 0.6;
  const fleetVisible = useFleetVisible();
  return (
    <group name="airport">
      {/* Runway */}
      <mesh position={[RWY.length / 2, 0.005, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[RWY.length + 120, RWY.width + 14]} />
        <meshStandardMaterial map={data.asphalt} roughness={0.92} color="#9aa0a8" polygonOffset polygonOffsetFactor={2} polygonOffsetUnits={2} />
      </mesh>
      <mesh geometry={data.markings} receiveShadow>
        <meshStandardMaterial color="#e9ecef" roughness={0.75} />
      </mesh>
      {[
        { t: data.num09, x: 110, rot: -Math.PI / 2 },
        { t: data.num27, x: RWY.length - 110, rot: Math.PI / 2 },
      ].map(({ t, x, rot }) => (
        <mesh key={x} position={[x, 0.03, 0]} rotation={[-Math.PI / 2, 0, rot]}>
          <planeGeometry args={[18, 36]} />
          <meshStandardMaterial alphaMap={t} transparent color="#e9ecef" roughness={0.75} depthWrite={false} />
        </mesh>
      ))}
      {/* Taxiways & apron */}
      <mesh geometry={data.tw.pave} receiveShadow>
        <meshStandardMaterial map={data.asphalt} color="#8d939b" roughness={0.93} polygonOffset polygonOffsetFactor={3} polygonOffsetUnits={3} />
      </mesh>
      <mesh geometry={data.tw.lines}>
        <meshStandardMaterial color="#f2c230" roughness={0.7} emissive="#f2c230" emissiveIntensity={night ? 0.25 : 0} />
      </mesh>
      <mesh position={[(APRON.x0 + APRON.x1) / 2, 0.02, (APRON.z0 + APRON.z1) / 2]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[APRON.x1 - APRON.x0, Math.abs(APRON.z1 - APRON.z0)]} />
        <meshStandardMaterial map={data.concrete} roughness={0.85} color="#c9cbc9" polygonOffset polygonOffsetFactor={2} polygonOffsetUnits={2} />
      </mesh>
      <mesh geometry={data.stand}>
        <meshStandardMaterial color="#f2c230" roughness={0.7} />
      </mesh>
      {/* Terminal */}
      <mesh geometry={data.term.body} castShadow receiveShadow>
        <meshStandardMaterial color="#d7d9db" roughness={0.6} metalness={0.1} />
      </mesh>
      <mesh geometry={data.term.roof} castShadow receiveShadow>
        <meshStandardMaterial color="#9aa1a8" roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh geometry={data.term.glass}>
        <meshPhysicalMaterial color="#20313f" roughness={0.08} metalness={0.4} emissive="#ffd9a0" emissiveIntensity={night ? 0.55 : 0} />
      </mesh>
      <mesh geometry={data.tower} castShadow>
        <meshStandardMaterial color="#cfd3d6" roughness={0.6} />
      </mesh>
      <JetBridges />
      <BeltBags />
      {/* Ground support equipment, one draw call per material (driven away for a pushback) */}
      <group visible={fleetVisible}>
      <mesh geometry={data.g.body} castShadow receiveShadow>
        <meshPhysicalMaterial color="#eef0f2" roughness={0.32} clearcoat={0.6} clearcoatRoughness={0.2} />
      </mesh>
      <mesh geometry={data.g.hivis} castShadow receiveShadow>
        <meshPhysicalMaterial color="#f2b705" roughness={0.38} clearcoat={0.5} clearcoatRoughness={0.25} />
      </mesh>
      <mesh geometry={data.g.chassis} castShadow receiveShadow>
        <meshStandardMaterial color="#2b2e33" roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh geometry={data.g.glass}>
        <meshPhysicalMaterial color="#0d1418" roughness={0.05} clearcoat={1} envMapIntensity={1.6} />
      </mesh>
      <mesh geometry={data.g.rubber} castShadow>
        <meshStandardMaterial color="#17181a" roughness={0.85} />
      </mesh>
      <mesh geometry={data.g.alu} castShadow receiveShadow>
        <meshStandardMaterial color="#c5c9ce" roughness={0.35} metalness={1} />
      </mesh>
      </group>
      <primitive object={data.lm} />
    </group>
  );
}
