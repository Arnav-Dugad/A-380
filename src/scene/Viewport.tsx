import { CameraControls, ContactShadows, PerformanceMonitor } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useRef } from 'react';
import { NeutralToneMapping, type Group } from 'three';
import { StructureLayer } from '../aircraft/AircraftLayers';
import { AircraftModel } from '../aircraft/AircraftModel';
import { Exploder } from '../aircraft/Exploder';
import { SectionPlanes } from '../aircraft/SectionPlanes';
import { AircraftAnimator } from '../animation/AircraftAnimator';
import { setControls } from '../camera/controls';
import { FirstPersonRig } from '../camera/FirstPerson';
import { FlightMode } from '../flight/FlightMode';
import { CabinScene } from '../interior/CabinScene';
import { CockpitScene } from '../interior/CockpitScene';
import { useUI } from '../state/ui';
import { AircraftLights } from './AircraftLights';
import { Effects } from './Effects';
import { Jacks } from './Jacks';
import { PerfProbe } from '../perf/PerfProbe';
import { World } from './World';
import { Cinematic } from '../camera/Cinematic';
import { PhotoBridge } from '../ui/PhotoMode';
import { worldFrame } from './worldFrame';

const DPR: Record<string, [number, number]> = { ultra: [1, 2], high: [1, 1.75], balanced: [0.85, 1.25], performance: [0.6, 1] };

export function Viewport() {
  const quality = useUI((s) => s.quality);
  const fov = useUI((s) => s.fov);
  const env = useUI((s) => s.env);
  const section = useUI((s) => s.section);
  const aircraft = useRef<Group>(null);
  const dpr = DPR[quality]!;
  return (
    <Canvas
      shadows={quality !== 'performance'}
      dpr={dpr}
      gl={{ antialias: quality !== 'ultra', toneMapping: NeutralToneMapping, preserveDrawingBuffer: true, powerPreference: 'high-performance' }}
      camera={{ fov, near: 0.4, far: 60000, position: [62, 16, 62] }}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true;
      }}
    >
      <PerformanceMonitor flipflops={3} onDecline={() => useUI.getState().quality === 'ultra' && useUI.getState().set({ quality: 'high' })} />
      <World />
      <group
        ref={(g) => {
          aircraft.current = g;
          worldFrame.aircraft = g;
        }}
        name="aircraftRoot"
      >
        <AircraftModel highDetail={quality !== 'performance'} />
        <StructureLayer />
        <CockpitScene />
        <CabinScene />
        <AircraftLights />
      </group>
      <AircraftAnimator />
      <Exploder />
      <SectionPlanes />
      <FirstPersonRig />
      <FlightMode />
      <Jacks />
      {env === 'studio' && section !== 'flight' && <ContactShadows position={[0, 0.02, 0]} scale={150} blur={2.6} far={14} opacity={0.7} resolution={1024} frames={quality === 'performance' ? 1 : Infinity} />}
      <CameraControls ref={setControls} makeDefault minDistance={2} maxDistance={900} maxPolarAngle={Math.PI / 2 - 0.02} />
      <Cinematic />
      <PhotoBridge />
      <Effects />
      <PerfProbe />
    </Canvas>
  );
}
