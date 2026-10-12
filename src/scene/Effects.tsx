/**
 * Restrained post-processing: ambient occlusion (high/ultra), gentle bloom for light sources
 * only (threshold above 1), SMAA and a faint vignette. Disabled entirely in Performance mode.
 */
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useRender, type ToneMap } from '../render/renderState';
import { useUI } from '../state/ui';
import { useTools } from '../tools/toolsState';
import { HeatHaze } from '../effects/HeatHaze';
import { useSim } from '../state/sim';

const MODES: Record<ToneMap, ToneMappingMode> = { neutral: ToneMappingMode.NEUTRAL, agx: ToneMappingMode.AGX, aces: ToneMappingMode.ACES_FILMIC };

export function Effects() {
  const quality = useUI((s) => s.quality);
  const section = useUI((s) => s.section);
  const photo = useUI((s) => s.photoMode);
  const shading = useRender((s) => s.shading);
  const tone = useRender((s) => s.toneMapping);
  const xr = useTools((s) => s.xr);
  const running = useSim((s) => s.s.engines.some((e) => e.n1 > 12));
  // the other shading modes are diagnostic views; Rendered mode owns the canvas itself
  if (quality === 'performance' || shading !== 'material' || xr !== 'none') return null;
  const ao = (quality === 'ultra' || quality === 'high') && section !== 'cabin' && section !== 'cockpit';
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <>{running && section !== 'cabin' && section !== 'cockpit' && <HeatHaze />}</>
      <>{ao && <N8AO aoRadius={2.2} intensity={2.2} distanceFalloff={0.6} quality={quality === 'ultra' ? 'high' : 'medium'} halfRes={quality !== 'ultra'} />}</>
      <Bloom mipmapBlur luminanceThreshold={1.05} luminanceSmoothing={0.2} intensity={0.55} radius={0.6} />
      <ToneMapping mode={MODES[tone]} />
      <SMAA />
      <>{!photo && <Vignette eskil={false} offset={0.28} darkness={0.42} />}</>
    </EffectComposer>
  );
}
