/** Hand-drawn 24px line icon set (1.5px stroke) for a consistent, quiet visual language. */
import type { SVGProps } from 'react';

const P = {
  explore: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18Zm0 0c2.5 2.4 3.8 5.4 3.8 9s-1.3 6.6-3.8 9M12 3c-2.5 2.4-3.8 5.4-3.8 9s1.3 6.6 3.8 9M3.6 9h16.8M3.6 15h16.8',
  anatomy: 'M12 3 3 7.5l9 4.5 9-4.5L12 3ZM3 12l9 4.5 9-4.5M3 16.5 12 21l9-4.5',
  systems: 'M3 12h3.5l2.5-6 4 12 2.5-6H21',
  cockpit: 'M4 15a8 8 0 0 1 16 0M12 15l3.5-4.5M7 19h10M12 15h.01',
  cabin: 'M7 4v9a2 2 0 0 0 2 2h7l2 5M7 9h5M5 20h8',
  flight: 'M10.5 20.5 12 17l1.5 3.5M12 3c.8 0 1.3.9 1.3 2.2V9.5l7.2 4.3v1.7l-7.2-2.2V17H10.7v-3.7L3.5 15.5v-1.7l7.2-4.3V5.2C10.7 3.9 11.2 3 12 3Z',
  specs: 'M7 3h7l4 4v14H7V3Zm7 0v4h4M10 12h5M10 15.5h5M10 9h2',
  settings: 'M4 6h10M18 6h2M4 12h3M11 12h9M4 18h12M20 18h0M14 4v4M7 10v4M16 16v4',
  camera: 'M4 8h3l1.5-2.5h7L17 8h3v11H4V8Zm8 2.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 0-7Z',
  help: 'M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18Zm-2.4-11.6A2.6 2.6 0 0 1 12 7.8c1.5 0 2.6 1 2.6 2.3 0 1.9-2.6 2-2.6 3.9M12 16.6h.01',
  close: 'M6 6l12 12M18 6 6 18',
  sun: 'M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17m10-10 1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z',
  studio: 'M4 20h16M6 20l2-12h8l2 12M9 8l1-4h4l1 4',
  airport: 'M3 20h18M5 20V10l7-4 7 4v10M9 20v-5h6v5',
  hangar: 'M3 20V10a9 7 0 0 1 18 0v10M3 20h18M8 20v-6h8v6',
  sunset: 'M3 17h18M6 21h12M7 17a5 5 0 0 1 10 0M12 4v4M5 9l1.5 1.5M19 9l-1.5 1.5',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Zm9.5-3a3 3 0 1 0 0 6a3 3 0 0 0 0-6Z',
  play: 'M8 5.5v13l10-6.5-10-6.5Z',
  pause: 'M8 5v14M16 5v14',
  reset: 'M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4',
  target: 'M12 3v4m0 10v4M3 12h4m10 0h4M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8Z',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  xray: 'M3 8V4h4M21 8V4h-4M3 16v4h4M21 16v4h-4M7 12h10M12 7v10',
  wheel: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18Zm0 5a4 4 0 1 0 0 8a4 4 0 0 0 0-8Zm0 3.2a.8.8 0 1 0 0 1.6a.8.8 0 0 0 0-1.6Z',
  door: 'M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21M4 21h16M14.5 12h.01',
  fan: 'M12 10.5a1.5 1.5 0 1 0 0 3a1.5 1.5 0 0 0 0-3Zm0 0C11 6 13 3 16 4c-.5 3-2.5 5-4 6.5Zm1.4 2.4c3.5 2.7 4 6.4 1.6 8.1-2-2.3-2.6-5-1.6-8.1Zm-2.8 0c-4.3 1.7-7.6.3-7.6-2.6 3-.6 5.6.3 7.6 2.6Z',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z',
  info: 'M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18Zm0-10v6m0-9h.01',
  download: 'M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 20h14',
  keyboard: 'M3 7h18v11H3V7Zm4 7h10M6.5 10.5h.01M9.5 10.5h.01M12.5 10.5h.01M15.5 10.5h.01',
  chevronRight: 'M9 5l7 7-7 7',
  chevronDown: 'M5 9l7 7 7-7',
  chevronUp: 'M5 15l7-7 7 7',
  chevronLeft: 'M15 5l-7 7 7 7',
  ruler: 'M3 16 16 3l5 5L8 21l-5-5Zm4-1 2 2m1-5 2 2m1-5 2 2',
  users: 'M9 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7Zm-6 9a6 6 0 0 1 12 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.5a6 6 0 0 1 3 5.5',
  weight: 'M6.5 8h11l2.5 12H4L6.5 8ZM12 8a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5Z',
  range: 'M3 18c3-8 6-12 9-12s6 4 9 12M3 18h18M12 6v2',
  layers: 'M12 4 3 8.5l9 4.5 9-4.5L12 4Z',
  explode: 'M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3',
  walk: 'M13 4.5a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3ZM9 21l2.5-6.5L14 17v4M10.5 9.5 13 7l3 3 3 1M11.5 14.5l1-5.5M8 12l2.5-2.5',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  power: 'M12 3v8M6.3 6.5a8 8 0 1 0 11.4 0',
  grid: 'M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z',
  film: 'M4 5h16v14H4V5Zm4 0v14m8-14v14M4 9h4m8 0h4M4 15h4m8 0h4',
  stairs: 'M4 20h4v-4h4v-4h4V8h4',
  seat: 'M8 4v8a2 2 0 0 0 2 2h6M8 9h5M6 20l2-6M18 20l-2-6',
  gamepad: 'M7 9h10a4 4 0 0 1 3.9 4.8l-.7 3.4a2 2 0 0 1-3.5.8L15 16H9l-1.7 2a2 2 0 0 1-3.5-.8l-.7-3.4A4 4 0 0 1 7 9Zm1 3v3m-1.5-1.5h3M15.5 13h.01M17.5 14.5h.01',
} satisfies Record<string, string>;

export type IconName = keyof typeof P;

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={P[name]} />
    </svg>
  );
}
