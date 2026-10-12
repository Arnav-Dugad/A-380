import { CameraControls, ContactShadows, PerformanceMonitor } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { setAtlasQuality } from '../aircraft/materials';
import { useRender } from '../render/renderState';
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
import { ViewInsetRig } from '../camera/ViewInsetRig';
import { PathTracer, ShadingModes } from '../render/Shading';
import { ToolsLayer } from '../tools/ToolsLayer';
import { Slides } from '../effects/Slides';
import { PushbackTug, resetPushback } from './airport/GroundOps';
import { FlightFX } from '../effects/FlightFX';

const DPR: Record<string, [number, number]> = { ultra: [1, 2], high: [1, 1.75], balanced: [0.85, 1.25], performance: [0.6, 1] };

export function Viewport() {
  const quality = useUI((s) => s.quality);
  const fov = useUI((s) => s.fov);
  const env = useUI((s) => s.env);
  const section = useUI((s) => s.section);
  const aircraft = useRef<Group>(null);
  const dpr = DPR[quality]!;
  // a pushback only makes sense on the apron; any change of scene puts the aircraft back on stand
  useEffect(() => resetPushback(), [env, section]);
  // full-resolution skin atlases are painted in a worker once the first frames are up
  useEffect(() => {
    let resync = 0;
    const t = window.setTimeout(() => {
      void setAtlasQuality(quality, () => {
        // several atlases arrive in quick succession: rebuild a path-traced snapshot once
        window.clearTimeout(resync);
        resync = window.setTimeout(() => {
          const r = useRender.getState();
          if (r.shading === 'rendered') r.resync();
        }, 1500);
      });
    }, 400);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(resync);
    };
  }, [quality]);
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
        <AircraftModel detail={quality === 'performance' ? 'lo' : quality === 'balanced' ? 'hi' : 'ultra'} />
        <StructureLayer />
        <CockpitScene />
        <CabinScene />
        <AircraftLights />
        <Slides />
        <PushbackTug visible={env === 'apron' && section !== 'flight'} />
      </group>
      <AircraftAnimator />
      <Exploder />
      <SectionPlanes />
      <FirstPersonRig />
      <FlightMode />
      <Jacks />
      {/* Shadow maps ground the aircraft on the other presets; a per-frame contact-shadow pass would re-render the whole scene again */}
      {env === 'studio' && section !== 'flight' && quality === 'performance' && <ContactShadows position={[0, 0.02, 0]} scale={150} blur={2.6} far={14} opacity={0.7} resolution={1024} frames={1} />}
      <CameraControls ref={setControls} makeDefault minDistance={2} maxDistance={900} maxPolarAngle={Math.PI / 2 - 0.02} />
      <Cinematic />
      <ViewInsetRig />
      <PhotoBridge />
      <ShadingModes />
      <Effects />
      <PathTracer />
      <FlightFX />
      <ToolsLayer />
      <PerfProbe />
    </Canvas>
  );
}
