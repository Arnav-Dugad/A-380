import { useSyncExternalStore } from 'react';

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export type Layout = 'desktop' | 'sheet' | 'side';

/**
 * - `desktop`: side panels and a top navigation bar (≥ 1024 px wide).
 * - `sheet`: phones and small tablets in portrait; bottom navigation and a draggable sheet.
 * - `side`: phones in landscape; bottom navigation and a narrow side panel.
 */
export function useLayout(): Layout {
  const desktop = useMedia('(min-width: 1024px)');
  const short = useMedia('(orientation: landscape) and (max-height: 540px)');
  return desktop ? 'desktop' : short ? 'side' : 'sheet';
}

/** True on touch-first devices (no hover, coarse pointer). */
export function useTouch(): boolean {
  return useMedia('(hover: none) and (pointer: coarse)');
}

export const isTouchDevice = (): boolean => typeof window !== 'undefined' && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
