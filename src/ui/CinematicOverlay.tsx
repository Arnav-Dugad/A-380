import { useEffect, useState } from 'react';
import { TOUR, tour } from '../camera/Cinematic';
import { useUI } from '../state/ui';
import { Button } from './kit';

/** Letterbox bars and shot captions for the cinematic tour. */
export function CinematicOverlay() {
  const cinematic = useUI((s) => s.cinematic);
  const set = useUI((s) => s.set);
  const [shot, setShot] = useState(0);
  useEffect(() => {
    if (!cinematic) return;
    const id = window.setInterval(() => setShot(tour.shot), 200);
    return () => window.clearInterval(id);
  }, [cinematic]);
  if (!cinematic) return null;
  const s = TOUR[Math.max(0, shot)];
  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <div className="absolute inset-x-0 top-0 h-[9vh] bg-black/90 transition-all duration-700" />
      <div className="absolute inset-x-0 bottom-0 h-[9vh] bg-black/90 transition-all duration-700" />
      {s && (
        <div key={shot} className="a380-enter absolute bottom-[12vh] left-[6vw]">
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ice-400">
            {String(shot + 1).padStart(2, '0')} / {String(TOUR.length).padStart(2, '0')}
          </div>
          <div className="mt-1 text-[30px] font-[300] tracking-[-0.02em] text-paper">{s.title}</div>
          <div className="text-[13px] text-graphite-300">{s.caption}</div>
        </div>
      )}
      <div className="pointer-events-auto absolute bottom-[2.5vh] right-[3vw]">
        <Button size="sm" variant="ghost" icon="close" onClick={() => set({ cinematic: null })}>
          End tour
        </Button>
      </div>
    </div>
  );
}
