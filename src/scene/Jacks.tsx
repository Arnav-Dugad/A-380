/** Maintenance jacks shown while the aircraft is on jacks for a gear swing test. */
import { useSim } from '../state/sim';
import { sx } from '../aircraft/geometry/layout';
import { useUI } from '../state/ui';

const JACKS: [number, number, number][] = [
  [sx(8.5), 2.18, 0],
  [sx(33), 4.05, -11],
  [sx(33), 4.05, 11],
  [sx(61), 4.6, 0],
];

export function Jacks() {
  const on = useSim((s) => s.s.maintenance);
  const section = useUI((s) => s.section);
  if (!on || section === 'flight') return null;
  return (
    <group name="jacks">
      {JACKS.map(([x, h, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, h / 2, 0]} castShadow>
            <cylinderGeometry args={[0.12, 0.18, h, 12]} />
            <meshStandardMaterial color="#d0a52a" roughness={0.4} metalness={0.5} />
          </mesh>
          {[0, 1, 2].map((k) => (
            <mesh key={k} position={[Math.cos((k * Math.PI * 2) / 3) * 0.55, 0.35, Math.sin((k * Math.PI * 2) / 3) * 0.55]} rotation={[0, (-k * Math.PI * 2) / 3, 0.9]} castShadow>
              <boxGeometry args={[0.12, 1.1, 0.12]} />
              <meshStandardMaterial color="#c4931f" roughness={0.5} metalness={0.4} />
            </mesh>
          ))}
          <mesh position={[0, h + 0.03, 0]}>
            <cylinderGeometry args={[0.22, 0.22, 0.06, 16]} />
            <meshStandardMaterial color="#222" />
          </mesh>
        </group>
      ))}
    </group>
  );
}
