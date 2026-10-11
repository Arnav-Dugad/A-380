/**
 * Directed cinematic tour. Each shot is a short camera move defined by eased Catmull-Rom
 * paths for camera position and look target, with optional environment changes and an
 * interior beat. Orbit controls are suspended while the tour runs; Esc or the button stops it.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { CatmullRomCurve3, MathUtils, Vector3, type PerspectiveCamera } from 'three';
import { cabinActions, useCabin } from '../interior/CabinScene';
import { systems } from '../sim/systems';
import { useUI, type EnvPreset } from '../state/ui';
import { getControls } from './controls';

export interface Shot {
  title: string;
  caption: string;
  duration: number;
  cam: [number, number, number][];
  target: [number, number, number][];
  fov?: [number, number];
  env?: EnvPreset;
  interior?: boolean;
  onStart?: () => void;
}

export const TOUR: Shot[] = [
  { title: 'Airbus A380-800', caption: 'Guided orbit', duration: 10, cam: [[80, 12, 70], [20, 18, 95], [-60, 16, 70], [-90, 12, 10]], target: [[0, 7, 0], [0, 7, 0], [0, 7, 0], [0, 7, 0]], fov: [32, 30] },
  { title: 'The nose', caption: 'Flight deck between two passenger decks', duration: 7, cam: [[56, 7.5, 26], [44, 8.2, 13], [40.5, 8.1, 8]], target: [[30, 7, 0], [31, 7.2, 0], [32, 7.4, 0]], fov: [30, 26] },
  {
    title: 'Four Trent 900s',
    caption: '2.95 m fans, 24 swept wide-chord blades',
    duration: 9,
    cam: [[22, 2.6, -40], [22, 2.8, -12], [22, 2.8, 12], [22, 2.6, 40]],
    target: [[0, 3.5, -26], [0, 3.5, -10], [0, 3.5, 10], [0, 3.5, 26]],
    fov: [36, 36],
    onStart: () => {
      if (!systems.state.engines.some((e) => e.state === 'running')) {
        systems.applyScenario('taxi');
        systems.setParkingBrake(true);
      }
    },
  },
  { title: 'Wing', caption: '845 m² · 33.5° sweep · slats, flaps, spoilers', duration: 8, cam: [[-2, 13, 6], [-6, 14, 18], [-12, 15, 30]], target: [[-8, 6, 14], [-10, 6.5, 24], [-16, 7, 36]], fov: [42, 40], onStart: () => systems.setFlapLever(3) },
  { title: 'Landing gear', caption: '22 wheels — nose, wing and body gears', duration: 8, cam: [[14, 1.0, 13], [2, 0.9, 11], [-10, 1.0, 9]], target: [[0, 1.4, 4], [-2, 1.4, 3], [-6, 1.5, 2]], fov: [40, 38], onStart: () => systems.setFlapLever(0) },
  { title: 'Underside', caption: 'Belly fairing and gear bays', duration: 7, cam: [[24, 0.5, 2], [6, 0.45, 0.5], [-14, 0.5, -1]], target: [[10, 4, 0], [-6, 4, 0], [-26, 4, 0]], fov: [50, 50] },
  { title: 'Empennage', caption: 'Fin 24.09 m above the ground', duration: 7, cam: [[-80, 3, 12], [-70, 12, 26], [-58, 22, 30]], target: [[-30, 10, 0], [-30, 13, 0], [-30, 15, 0]], fov: [34, 34] },
  { title: 'Upper deck', caption: 'Looking out from a window seat', duration: 6, cam: [[0, 9, 9], [0, 9, 9]], target: [[0, 9, 0], [0, 9, 0]], interior: true },
  { title: 'Golden hour', caption: 'Runway at sunset', duration: 11, env: 'golden', cam: [[70, 4, -50], [30, 6, -80], [-40, 7, -75]], target: [[0, 7, 0], [0, 7, 0], [0, 7, 0]], fov: [30, 28] },
];

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const tour = { shot: -1, t: 0, prevEnv: null as EnvPreset | null };

export function Cinematic() {
  const cinematic = useUI((s) => s.cinematic);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const curves = useRef<{ c: CatmullRomCurve3; t: CatmullRomCurve3 }[]>([]);

  useEffect(() => {
    if (!cinematic) return;
    curves.current = TOUR.map((s) => ({ c: new CatmullRomCurve3(s.cam.map((p) => new Vector3(...p)), false, 'centripetal'), t: new CatmullRomCurve3(s.target.map((p) => new Vector3(...p)), false, 'centripetal') }));
    tour.shot = 0;
    tour.t = 0;
    tour.prevEnv = useUI.getState().env;
    const c = getControls();
    if (c) c.enabled = false;
    useUI.getState().select(null);
    TOUR[0]!.onStart?.();
    return () => {
      const ui = useUI.getState();
      if (tour.prevEnv) ui.set({ env: tour.prevEnv });
      if (ui.section === 'cabin') ui.set({ section: 'explore' });
      tour.shot = -1;
      const ctl = getControls();
      if (ctl) {
        ctl.enabled = true;
        const dir = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        void ctl.setLookAt(camera.position.x, camera.position.y, camera.position.z, camera.position.x + dir.x * 40, camera.position.y + dir.y * 40, camera.position.z + dir.z * 40, false).then(() => ctl.setLookAt(58, 14, 64, 2, 6, 0, true));
      }
      camera.fov = ui.fov;
      camera.updateProjectionMatrix();
    };
  }, [cinematic, camera]);

  useFrame((_, dt) => {
    if (!cinematic || tour.shot < 0) return;
    const shot = TOUR[tour.shot]!;
    tour.t += Math.min(dt, 0.1);
    const k = Math.min(1, tour.t / shot.duration);
    const ui = useUI.getState();
    if (shot.env && ui.env !== shot.env) ui.set({ env: shot.env });
    if (shot.interior) {
      // Interior beat: sit at an upper-deck window seat
      if (ui.section !== 'cabin') {
        ui.set({ section: 'cabin' });
        window.setTimeout(() => {
          const seat = useCabin.getState().seats.find((s) => s.deck === 'upper' && s.window && s.cls === 'premium');
          if (seat) {
            useCabin.setState({ seat });
            cabinActions.lookOutside();
          }
        }, 1600);
      }
    } else {
      if (ui.section === 'cabin') ui.set({ section: 'explore' });
      const c = curves.current[tour.shot]!;
      const e = ease(k);
      camera.position.copy(c.c.getPoint(e));
      camera.lookAt(c.t.getPoint(e));
      if (shot.fov) {
        camera.fov = MathUtils.lerp(shot.fov[0], shot.fov[1], e);
        camera.updateProjectionMatrix();
      }
      const ctl = getControls();
      if (ctl && ctl.enabled) ctl.enabled = false;
    }
    if (k >= 1) {
      tour.shot++;
      tour.t = 0;
      if (tour.shot >= TOUR.length) {
        ui.set({ cinematic: null });
        return;
      }
      TOUR[tour.shot]!.onStart?.();
    }
  });
  return null;
}
