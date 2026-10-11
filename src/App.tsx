import { Viewport } from './scene/Viewport';
import { Interface } from './ui/Interface';
import { Loader } from './ui/Loader';
import { AudioEngine } from './audio/AudioEngine';
import { CinematicOverlay } from './ui/CinematicOverlay';
import { PhotoModeBar } from './ui/PhotoMode';
import { StatsOverlay } from './ui/StatsOverlay';
import { useUI } from './state/ui';

export default function App() {
  const photo = useUI((s) => s.photoMode);
  const cinematic = useUI((s) => s.cinematic);
  const stats = useUI((s) => s.showStats);
  return (
    <div className="fixed inset-0 overflow-hidden bg-graphite-950 text-paper">
      <Viewport />
      {!photo && !cinematic && <Interface />}
      {photo && <PhotoModeBar />}
      <CinematicOverlay />
      {stats && !photo && <StatsOverlay />}
      <AudioEngine />
      <Loader />
    </div>
  );
}
