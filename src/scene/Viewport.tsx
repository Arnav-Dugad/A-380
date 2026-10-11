import { CameraControls, ContactShadows, Environment, Lightformer } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { NeutralToneMapping } from 'three';
import { AircraftModel } from '../aircraft/AircraftModel';
import { AircraftAnimator } from '../animation/AircraftAnimator';
import { StructureLayer } from '../aircraft/AircraftLayers';
import { Exploder } from '../aircraft/Exploder';
import { SectionPlanes } from '../aircraft/SectionPlanes';
import { useUI } from '../state/ui';
import { setControls } from '../camera/controls';

export function Viewport() {
  const quality = useUI((s) => s.quality);
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, toneMapping: NeutralToneMapping, preserveDrawingBuffer: true }}
      camera={{ fov: 35, near: 0.4, far: 6000, position: [62, 16, 62] }}
    >
      <color attach="background" args={['#0d1014']} />
      <Environment resolution={256}>
        <Lightformer intensity={2.2} position={[0, 30, 0]} rotation-x={Math.PI / 2} scale={[80, 30, 1]} />
        <Lightformer intensity={1.2} position={[-60, 10, 0]} rotation-y={Math.PI / 2} scale={[60, 12, 1]} />
        <Lightformer intensity={1.2} position={[60, 10, 0]} rotation-y={-Math.PI / 2} scale={[60, 12, 1]} />
        <Lightformer intensity={0.6} position={[0, 6, 60]} scale={[80, 6, 1]} color="#bfe9ff" />
      </Environment>
      <directionalLight position={[40, 60, 30]} intensity={2.4} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-50} shadow-camera-right={50} shadow-camera-top={50} shadow-camera-bottom={-50} shadow-bias={-0.0004} shadow-normalBias={0.04} />
      <ambientLight intensity={0.15} />
      <AircraftModel highDetail={quality !== 'performance'} />
      <AircraftAnimator />
      <Exploder />
      <SectionPlanes />
      <StructureLayer />
      <ContactShadows position={[0, 0.01, 0]} scale={140} blur={2.4} far={14} opacity={0.65} resolution={1024} />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[300, 64]} />
        <meshStandardMaterial color="#1a1e23" roughness={0.9} />
      </mesh>
      <CameraControls ref={setControls} makeDefault minDistance={4} maxDistance={400} maxPolarAngle={Math.PI / 2 - 0.02} />
    </Canvas>
  );
}
