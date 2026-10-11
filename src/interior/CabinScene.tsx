/**
 * Cabin runtime: streams the cabin GLB, sets up first-person walking with collisions,
 * seat picking (instanced seats), deck changes via the staircases and cabin lighting
 * presets driven by the shared systems state.
 */
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Color, InstancedMesh, MeshStandardMaterial, type Group, type PointLight } from 'three';
import { LazyLayer } from '../aircraft/Layers';
import { getMaterials } from '../aircraft/materials';
import { CABIN_DECKS, ZONES, type CabinClass } from '../aircraft/geometry/cabin';
import { fuselagePoint, thetaAtHeight } from '../aircraft/geometry/fuselage';
import { sx, MAIN_DECK_FLOOR, UPPER_DECK_FLOOR } from '../aircraft/geometry/layout';
import { firstPerson, type FpPose, type Obstacle, type WalkBounds } from '../camera/FirstPerson';
import { goPreset } from '../camera/controls';
import { systems, type CabinLight } from '../sim/systems';
import { useUI } from '../state/ui';
import { create } from 'zustand';

export type Deck = 'main' | 'upper';

export interface Seat {
  id: string;
  deck: Deck;
  cls: CabinClass;
  row: number;
  letter: string;
  s: number;
  z: number;
  window: boolean;
  facing: 1 | -1;
}

export const useCabin = create<{ deck: Deck; seat: Seat | null; seated: boolean; seats: Seat[] }>(() => ({ deck: 'main', seat: null, seated: false, seats: [] }));

export const CLASS_NAMES: Record<CabinClass, string> = {
  first: 'First',
  business: 'Business',
  premium: 'Premium economy',
  economy: 'Economy',
};

const EYE = 1.62;

function deckBounds(deck: Deck, seats: Seat[]): WalkBounds {
  const d = CABIN_DECKS[deck];
  const obstacles: Obstacle[] = [];
  // seats (footprint by class)
  const len: Record<CabinClass, number> = { economy: 0.62, premium: 0.8, business: 1.45, first: 1.7 };
  const wid: Record<CabinClass, number> = { economy: 0.5, premium: 0.56, business: 0.66, first: 0.78 };
  for (const s of seats) {
    if (s.deck !== deck) continue;
    const x = sx(s.s);
    const L = len[s.cls];
    obstacles.push({ x0: x - L * 0.55, x1: x + L * 0.45, z0: s.z - wid[s.cls] / 2, z1: s.z + wid[s.cls] / 2 });
  }
  // monuments (galleys, lavatories, stairs) — mirror of cabin.ts layout
  const mon: [number, number, number, number][] =
    deck === 'main'
      ? [
          [10.6, 12.5, -2.4, -0.75],
          [10.6, 12.5, 0.75, 2.4],
          [19.0, 19.6, -1.2, 1.2],
          [43.9, 44.6, -1.4, 1.4],
          [42.8, 43.9, -2.6, -1.4],
          [42.8, 43.9, 1.4, 2.6],
          [57.3, 59.6, -2.2, -0.75],
          [57.3, 59.6, 0.75, 2.2],
          [56.0, 59.9, -0.55, 0.55], // aft stairs
          [9.6, 12.8, -0.55, 0.55], // forward stairs
        ]
      : [
          [13.0, 14.2, -2.0, -0.7],
          [13.0, 14.2, 0.7, 2.0],
          [36.9, 37.3, -1.2, 1.2],
          [50.0, 51.2, -2.2, -1.2],
          [50.0, 51.2, 1.2, 2.2],
          [55.8, 58.1, -2.0, -0.75],
          [55.8, 58.1, 0.75, 2.0],
        ];
  for (const [s0, s1, z0, z1] of mon) obstacles.push({ x0: sx(s1), x1: sx(s0), z0, z1 });
  const floor = deck === 'main' ? MAIN_DECK_FLOOR : UPPER_DECK_FLOOR;
  return {
    xMin: sx(d.s1 - 0.4),
    xMax: sx(d.s0 + 0.4),
    halfWidth: (x) => {
      const s = -(x - sx(0));
      const y = floor + 1.0;
      return fuselagePoint(s, thetaAtHeight(s, y, 1))[2] - 0.2;
    },
    obstacles,
    eye: floor + EYE,
  };
}

export function deckStartPose(deck: Deck): FpPose {
  return deck === 'main' ? { pos: [sx(31.9), MAIN_DECK_FLOOR + EYE, 0], yaw: Math.PI, pitch: 0.02, fov: 68 } : { pos: [sx(16.3), UPPER_DECK_FLOOR + EYE, 0], yaw: Math.PI, pitch: 0.02, fov: 68 };
}

export const cabinActions = {
  goDeck(deck: Deck) {
    const seats = useCabin.getState().seats;
    useCabin.setState({ deck, seated: false });
    firstPerson.setBounds(null);
    firstPerson.goTo(deckStartPose(deck));
    window.setTimeout(() => firstPerson.setBounds(deckBounds(deck, seats)), 1400);
  },
  sit(seat: Seat) {
    useCabin.setState({ seat, seated: true, deck: seat.deck });
    firstPerson.setBounds(null);
    const floor = seat.deck === 'main' ? MAIN_DECK_FLOOR : UPPER_DECK_FLOOR;
    const eye = floor + (seat.cls === 'economy' || seat.cls === 'premium' ? 1.18 : 1.12);
    firstPerson.goTo({ pos: [sx(seat.s) - seat.facing * 0.05, eye, seat.z], yaw: seat.facing === 1 ? 0 : Math.PI, pitch: 0.05, fov: 70 });
  },
  lookOutside() {
    const st = useCabin.getState();
    const seat = st.seat;
    if (!seat) return;
    const side = seat.z >= 0 ? 1 : -1;
    const floor = seat.deck === 'main' ? MAIN_DECK_FLOOR : UPPER_DECK_FLOOR;
    const winZ = fuselagePoint(seat.s, thetaAtHeight(seat.s, floor + 1.1, side))[2];
    firstPerson.goTo({ pos: [sx(seat.s), floor + 1.15, winZ - side * 0.42], yaw: (side * Math.PI) / 2, pitch: 0.12, fov: 55 });
    useCabin.setState({ seated: true });
  },
  standUp() {
    const st = useCabin.getState();
    const seat = st.seat;
    const deck = seat?.deck ?? st.deck;
    useCabin.setState({ seated: false });
    const aisle = seat ? (Math.abs(seat.z) < 0.7 ? 0 : seat.z > 0 ? 0.92 : -0.92) : 0;
    const floor = deck === 'main' ? MAIN_DECK_FLOOR : UPPER_DECK_FLOOR;
    firstPerson.goTo({ pos: [seat ? sx(seat.s) : sx(30), floor + EYE, aisle], yaw: Math.PI, pitch: 0.02, fov: 68 });
    window.setTimeout(() => firstPerson.setBounds(deckBounds(deck, st.seats)), 1400);
  },
};

const LIGHT_PRESETS: Record<CabinLight, { strip: string; intensity: number; window: string; windowI: number; ambient: number }> = {
  off: { strip: '#000000', intensity: 0, window: '#9fb8cc', windowI: 0.8, ambient: 0.05 },
  boarding: { strip: '#fff1dc', intensity: 2.2, window: '#cfe3f2', windowI: 1.3, ambient: 0.6 },
  day: { strip: '#f4f8ff', intensity: 2.6, window: '#d8ecff', windowI: 1.6, ambient: 0.7 },
  night: { strip: '#3a4f8a', intensity: 0.6, window: '#152033', windowI: 0.35, ambient: 0.12 },
  ambient: { strip: '#9b7bff', intensity: 1.4, window: '#5b6f8f', windowI: 0.6, ambient: 0.28 },
};

function CabinLighting({ root }: { root: Group }) {
  const [strip, win] = useMemo(() => {
    const base = getMaterials().emissiveCabin as MeshStandardMaterial;
    const a = base.clone();
    const b = base.clone();
    root.traverse((o) => {
      if (o.name.startsWith('ceiling_lights')) {
        (o as unknown as { material: MeshStandardMaterial }).material = a;
        o.userData.baseMaterial = a;
      }
      if (o.name.startsWith('windows_inner')) {
        (o as unknown as { material: MeshStandardMaterial }).material = b;
        o.userData.baseMaterial = b;
      }
    });
    return [a, b];
  }, [root]);
  const lights: (PointLight | null)[] = [];
  useFrame(() => {
    const env = useUI.getState().env;
    const p = LIGHT_PRESETS[systems.state.cabinLight];
    const powered = systems.state.elec.ac;
    strip.emissive.set(p.strip);
    strip.emissiveIntensity = powered ? p.intensity : 0;
    win.emissive.set(env === 'night' || env === 'hangar' ? '#1b2638' : env === 'golden' ? '#ffcf96' : p.window);
    win.emissiveIntensity = env === 'night' ? 0.3 : p.windowI;
    const k = powered ? p.ambient : 0.04;
    for (const l of lights) if (l) {
      l.intensity = k * 6;
      l.color = new Color(p.strip === '#000000' ? '#ffffff' : p.strip);
    }
  });
  const xs = [14, 24, 34, 44, 54];
  return (
    <>
      {xs.map((s, i) => (
        <pointLight key={`m${s}`} ref={(r) => (lights[i] = r)} position={[sx(s), MAIN_DECK_FLOOR + 2.2, 0]} distance={9} decay={1.6} intensity={2} />
      ))}
      {[22, 40].map((s, i) => (
        <pointLight key={`u${s}`} ref={(r) => (lights[xs.length + i] = r)} position={[sx(s), UPPER_DECK_FLOOR + 2.0, 0]} distance={14} decay={1.6} intensity={2} />
      ))}
    </>
  );
}

export function CabinScene() {
  const section = useUI((s) => s.section);
  const xray = useUI((s) => s.xray);
  const active = section === 'cabin';
  const showInXray = (xray.enabled || xray.clip > 0 || xray.clipVertical > 0) && xray.cabin;
  const [root, setRoot] = useState<Group | null>(null);
  const [requested, setRequested] = useState(false);
  useEffect(() => {
    if (active || showInXray) setRequested(true);
  }, [active, showInXray]);

  const onReady = useCallback((r: Group) => {
    const seats: Seat[] = ((r.children[0]?.userData.seatMap ?? r.userData.seatMap ?? []) as [string, Deck, CabinClass, number, string, number, number, number, 1 | -1][]).map(
      ([id, deck, cls, row, letter, s, z, w, facing]) => ({ id, deck, cls, row, letter, s, z, window: !!w, facing }),
    );
    useCabin.setState({ seats });
    setRoot(r);
  }, []);

  useEffect(() => {
    if (!active) return;
    const deck = useCabin.getState().deck;
    firstPerson.enter('cabin', deckStartPose(deck), null);
    const t = window.setTimeout(() => firstPerson.setBounds(deckBounds(deck, useCabin.getState().seats)), 1400);
    if (systems.state.cabinLight === 'off' && systems.state.elec.ac) systems.setCabinLight('boarding');
    return () => {
      window.clearTimeout(t);
      firstPerson.exit();
      void goPreset('home', true);
    };
  }, [active]);

  // Bounds need the seat list; set them once it has loaded.
  useEffect(() => {
    if (active && root && firstPerson.mode === 'cabin' && !useCabin.getState().seated) {
      const t = window.setTimeout(() => firstPerson.setBounds(deckBounds(useCabin.getState().deck, useCabin.getState().seats)), 1500);
      return () => window.clearTimeout(t);
    }
  }, [active, root]);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!active || e.delta > 4) return;
    const o = e.object;
    if (o instanceof InstancedMesh && e.instanceId !== undefined) {
      e.stopPropagation();
      const ids = o.userData.seatIds as string[] | undefined;
      const id = ids?.[e.instanceId];
      const seat = useCabin.getState().seats.find((s) => s.id === id) ?? null;
      useCabin.setState({ seat });
    }
  };

  if (!requested) return null;
  return (
    <group onClick={onClick}>
      <Suspense fallback={null}>
        <LazyLayer name="cabin" visible={active || showInXray} onReady={onReady} />
      </Suspense>
      {root && (active || showInXray) && <CabinLighting root={root} />}
    </group>
  );
}

export const CABIN_ZONES = ZONES;
