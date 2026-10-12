/**
 * Exterior lighting driven by the systems model: navigation (red/green/white), anti-collision
 * strobes (double flash), red beacons, landing, taxi, logo and wing-inspection lights. Light
 * sources keep a constant count (intensity → 0 when off) so switching never recompiles shaders.
 */
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { AdditiveBlending, BufferAttribute, Color, ConeGeometry, Mesh, MeshBasicMaterial, Object3D, Quaternion, Vector3, type PointLight, type SpotLight } from 'three';
import { flexAt } from '../effects/deform';
import { systems } from '../sim/systems';
import { useUI } from '../state/ui';
import { WING, sx } from '../aircraft/geometry/layout';
import { wingLE, wingPlaneY } from '../aircraft/geometry/wing';

const tipY = wingPlaneY(WING.tipZ) + 0.05;
const tipX = sx(wingLE(WING.tipZ) + 1.2);
const P = {
  navL: [tipX, tipY, -WING.tipZ - 0.05],
  navR: [tipX, tipY, WING.tipZ + 0.05],
  tail: [sx(72.75), 7.95, 0],
  beaconTop: [sx(34), 10.48, 0],
  beaconBot: [sx(34), 1.66, 0],
  landL: [sx(26.5), 3.6, -3.75],
  landR: [sx(26.5), 3.6, 3.75],
  taxi: [sx(5.6), 1.75, 0],
  logoL: [sx(64), 8.4, -6],
  logoR: [sx(64), 8.4, 6],
  wingL: [sx(24), 6.9, -3.6],
  wingR: [sx(24), 6.9, 3.6],
} as const;

/** Additive light beam: a long open cone whose brightness fades from the lamp outward. */
function beam(from: readonly number[], to: [number, number, number], length: number, radius: number): Mesh {
  const g = new ConeGeometry(radius, length, 28, 12, true);
  g.translate(0, -length / 2, 0); // apex at the origin, opening along −Y
  const p = g.getAttribute('position');
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const d = -p.getY(i) / length; // 0 at the lamp, 1 at the far end
    const k = Math.pow(1 - d, 2.2) * Math.min(1, d * 12);
    col.set([k, k * 0.97, k * 0.9], i * 3);
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  const m = new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0, toneMapped: false, side: 2 });
  const mesh = new Mesh(g, m);
  mesh.position.set(from[0]!, from[1]!, from[2]!);
  const dir = new Vector3(to[0] - from[0]!, to[1] - from[1]!, to[2] - from[2]!).normalize();
  mesh.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, -1, 0), dir));
  mesh.userData.noPathTrace = true;
  mesh.renderOrder = 5;
  return mesh;
}

function Bulb({ pos, color, name }: { pos: readonly number[]; color: string; name: string }) {
  return (
    <mesh position={pos as [number, number, number]} name={name}>
      <sphereGeometry args={[0.09, 12, 8]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

export function AircraftLights() {
  const env = useUI((s) => s.env);
  const section = useUI((s) => s.section);
  const timeOfDay = useUI((s) => s.timeOfDay);
  const dark = env === 'night' || env === 'hangar' || (section === 'flight' && (timeOfDay < 6.5 || timeOfDay > 18.5)) || env === 'golden';
  const group = useRef<Object3D>(null);
  const spots = useRef<Record<string, SpotLight | null>>({});
  const points = useRef<Record<string, PointLight | null>>({});
  const targets = useMemo(() => {
    const t: Record<string, Object3D> = {};
    const mk = (k: string, p: [number, number, number]) => {
      const o = new Object3D();
      o.position.set(...p);
      t[k] = o;
    };
    mk('landL', [P.landL[0] + 60, -4, -12]);
    mk('landR', [P.landR[0] + 60, -4, 12]);
    mk('taxi', [P.taxi[0] + 40, -2, 0]);
    mk('logoL', [sx(60), 17, 0]);
    mk('logoR', [sx(60), 17, 0]);
    mk('wingL', [sx(40), 4.5, -22]);
    mk('wingR', [sx(40), 4.5, 22]);
    return t;
  }, []);
  const beams = useMemo(
    () => ({
      landL: beam(P.landL, [P.landL[0] + 60, -4, -12], 75, 7.5),
      landR: beam(P.landR, [P.landR[0] + 60, -4, 12], 75, 7.5),
      taxi: beam(P.taxi, [P.taxi[0] + 40, -2, 0], 42, 9),
    }),
    [],
  );

  useFrame((st) => {
    const s = systems.state;
    const pw = s.elec.dc;
    const g = group.current;
    if (!g) return;
    const t = st.clock.elapsedTime;
    const strobe = s.lights.strobe && pw && (t % 1.2 < 0.06 || (t % 1.2 > 0.14 && t % 1.2 < 0.2));
    // wing-tip lights ride the bending wing
    for (const [name, base, z] of [
      ['navL', P.navL[1], P.navL[2]],
      ['navR', P.navR[1], P.navR[2]],
      ['strobeL', P.navL[1], P.navL[2]],
      ['strobeR', P.navR[1], P.navR[2]],
    ] as const) {
      const o = g.getObjectByName(name);
      if (o) o.position.y = base + flexAt(z);
    }
    if (points.current.navL) points.current.navL.position.y = P.navL[1] + flexAt(P.navL[2]);
    if (points.current.navR) points.current.navR.position.y = P.navR[1] + flexAt(P.navR[2]);
    // visible beams in the dark (haze makes them read even on a clear night)
    const beamK = dark ? (env === 'night' ? 0.55 : 0.32) : 0;
    (beams.landL.material as MeshBasicMaterial).opacity = s.lights.landing && pw ? beamK : 0;
    (beams.landR.material as MeshBasicMaterial).opacity = s.lights.landing && pw ? beamK : 0;
    (beams.taxi.material as MeshBasicMaterial).opacity = s.lights.taxi && pw && s.gear.position < 0.1 ? beamK * 0.8 : 0;
    for (const b of Object.values(beams)) b.visible = (b.material as MeshBasicMaterial).opacity > 0.001;
    const beacon = s.lights.beacon && pw && t % 1.0 < 0.12;
    const set = (name: string, on: boolean, col: string) => {
      const m = g.getObjectByName(name) as unknown as { material: MeshBasicMaterial } | undefined;
      if (m) m.material.color = new Color(on ? col : '#222');
    };
    set('navL', s.lights.nav && pw, '#ff2a2a');
    set('navR', s.lights.nav && pw, '#2aff6a');
    set('tail', (s.lights.nav && pw) || strobe, '#ffffff');
    set('strobeL', strobe, '#ffffff');
    set('strobeR', strobe, '#ffffff');
    set('beaconTop', beacon, '#ff2020');
    set('beaconBot', beacon, '#ff2020');
    set('landL', s.lights.landing && pw, '#fff8e8');
    set('landR', s.lights.landing && pw, '#fff8e8');
    set('taxi', s.lights.taxi && pw && s.gear.position < 0.1, '#fff8e8');
    const k = dark ? 1 : 0.15;
    const sp = spots.current;
    const on = (name: string, v: boolean, i: number) => {
      const l = sp[name];
      if (l) l.intensity = v ? i * k : 0;
    };
    on('landL', s.lights.landing && pw, 9000);
    on('landR', s.lights.landing && pw, 9000);
    on('taxi', s.lights.taxi && pw && s.gear.position < 0.1, 5000);
    on('logoL', s.lights.logo && pw, 1400);
    on('logoR', s.lights.logo && pw, 1400);
    on('wingL', s.lights.wing && pw, 2200);
    on('wingR', s.lights.wing && pw, 2200);
    const pt = points.current;
    if (pt.navL) pt.navL.intensity = s.lights.nav && pw ? 6 * k : 0;
    if (pt.navR) pt.navR.intensity = s.lights.nav && pw ? 6 * k : 0;
    if (pt.strobe) pt.strobe.intensity = strobe ? 120 * k : 0;
    if (pt.beacon) pt.beacon.intensity = beacon ? 40 * k : 0;
  });

  const spot = (name: string, pos: readonly number[], angle: number) => (
    <spotLight
      key={name}
      ref={(l) => {
        spots.current[name] = l;
        if (l) l.target = targets[name]!;
      }}
      position={pos as [number, number, number]}
      angle={angle}
      penumbra={0.5}
      distance={name.startsWith('land') || name === 'taxi' ? 260 : 40}
      decay={1.6}
      intensity={0}
      color="#fff3df"
    />
  );

  return (
    <group ref={group} name="aircraftLights">
      {Object.values(targets).map((o, i) => (
        <primitive key={i} object={o} />
      ))}
      <primitive object={beams.landL} />
      <primitive object={beams.landR} />
      <primitive object={beams.taxi} />
      <Bulb pos={P.navL} color="#222" name="navL" />
      <Bulb pos={P.navR} color="#222" name="navR" />
      <Bulb pos={P.tail} color="#222" name="tail" />
      <Bulb pos={[P.navL[0] - 0.4, P.navL[1], P.navL[2]]} color="#222" name="strobeL" />
      <Bulb pos={[P.navR[0] - 0.4, P.navR[1], P.navR[2]]} color="#222" name="strobeR" />
      <Bulb pos={P.beaconTop} color="#222" name="beaconTop" />
      <Bulb pos={P.beaconBot} color="#222" name="beaconBot" />
      <Bulb pos={P.landL} color="#222" name="landL" />
      <Bulb pos={P.landR} color="#222" name="landR" />
      <Bulb pos={P.taxi} color="#222" name="taxi" />
      {spot('landL', P.landL, 0.22)}
      {spot('landR', P.landR, 0.22)}
      {spot('taxi', P.taxi, 0.45)}
      {spot('logoL', P.logoL, 0.5)}
      {spot('logoR', P.logoR, 0.5)}
      {spot('wingL', P.wingL, 0.35)}
      {spot('wingR', P.wingR, 0.35)}
      <pointLight ref={(l) => (points.current.navL = l)} position={P.navL as unknown as [number, number, number]} color="#ff2a2a" distance={14} decay={2} intensity={0} />
      <pointLight ref={(l) => (points.current.navR = l)} position={P.navR as unknown as [number, number, number]} color="#2aff6a" distance={14} decay={2} intensity={0} />
      <pointLight ref={(l) => (points.current.strobe = l)} position={P.tail as unknown as [number, number, number]} color="#ffffff" distance={40} decay={2} intensity={0} />
      <pointLight ref={(l) => (points.current.beacon = l)} position={P.beaconBot as unknown as [number, number, number]} color="#ff2020" distance={30} decay={2} intensity={0} />
    </group>
  );
}
