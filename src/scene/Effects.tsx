/**
 * Restrained post-processing: ambient occlusion (high/ultra), gentle bloom for light sources
 * only (threshold above 1), SMAA and a faint vignette. Disabled entirely in Performance mode.
 */
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useUI } from '../state/ui';

export function Effects() {
  const quality = useUI((s) => s.quality);
  const section = useUI((s) => s.section);
  const photo = useUI((s) => s.photoMode);
  if (quality === 'performance') return null;
  const ao = (quality === 'ultra' || quality === 'high') && section !== 'cabin' && section !== 'cockpit';
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <>{ao && <N8AO aoRadius={2.2} intensity={2.2} distanceFalloff={0.6} quality={quality === 'ultra' ? 'high' : 'medium'} halfRes={quality !== 'ultra'} />}</>
      <Bloom mipmapBlur luminanceThreshold={1.05} luminanceSmoothing={0.2} intensity={0.55} radius={0.6} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <SMAA />
      <>{!photo && <Vignette eskil={false} offset={0.28} darkness={0.42} />}</>
    </EffectComposer>
  );
}
