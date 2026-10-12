/**
 * Glass-cockpit display renderer. Each display is a 2D canvas redrawn at ~15 Hz from the
 * shared systems / flight state and used as a texture on the 3D screen (and in the 2D
 * display viewer). Formats are *inspired by* Airbus conventions for education; they are not
 * replicas of the certified A380 symbology.
 */
import { CanvasTexture, SRGBColorSpace } from 'three';
import { CONF, systems, type SystemsState } from '../sim/systems';

export type ScreenName = 'OVHD' | 'PFD_C' | 'PFD_F' | 'ND_C' | 'ND_F' | 'EWD' | 'SD' | 'MFD_C' | 'MFD_F' | 'FCU' | 'OIT_C' | 'OIT_F';
export type SdPage = 'ENG' | 'HYD' | 'ELEC' | 'WHEEL' | 'F/CTL' | 'DOOR' | 'APU';

export const SD_PAGES: SdPage[] = ['ENG', 'APU', 'HYD', 'ELEC', 'WHEEL', 'F/CTL', 'DOOR'];

const C = {
  green: '#3cf07a',
  cyan: '#2fd9f2',
  amber: '#ffb21e',
  magenta: '#ff4fe3',
  white: '#f2f4f5',
  red: '#ff4436',
  grey: '#7a828c',
  sky: '#1f7fd6',
  ground: '#8a5a2b',
  yellow: '#ffe14d',
};

export interface Autopilot {
  ap: boolean;
  athr: boolean;
  spd: number;
  hdg: number;
  alt: number;
  vs: number;
  lateral: 'HDG' | 'NAV' | 'RWY' | '';
  vertical: 'ALT' | 'V/S' | 'CLB' | 'DES' | 'SRS' | '';
}

export const autopilot: Autopilot = { ap: false, athr: false, spd: 150, hdg: 90, alt: 5000, vs: 1500, lateral: '', vertical: '' };

/** `integral`: 1 when the panel integral lighting is on (dark conditions). */
export const displayState = { sdPage: 'ENG' as SdPage, autoSd: true, brightness: 1, ndRange: 40, integral: 0 };

const SIZE: Record<ScreenName, [number, number]> = {
  PFD_C: [384, 512],
  PFD_F: [384, 512],
  ND_C: [384, 512],
  ND_F: [384, 512],
  EWD: [384, 512],
  SD: [384, 512],
  MFD_C: [384, 512],
  MFD_F: [384, 512],
  FCU: [1024, 76],
  OIT_C: [480, 368],
  OIT_F: [480, 368],
  OVHD: [512, 1024],
};

function font(px: number, w = 500) {
  return `${w} ${px}px "JetBrains Mono Variable", "DejaVu Sans Mono", monospace`;
}

function txt(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, col: string, px = 16, align: CanvasTextAlign = 'left', w = 500) {
  ctx.fillStyle = col;
  ctx.font = font(px, w);
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(t, x, y);
}

// ----------------------------------------------------------------------- PFD
function drawPFD(ctx: CanvasRenderingContext2D, w: number, _h: number, s: SystemsState) {
  const a = s.air;
  // FMA band
  ctx.strokeStyle = C.grey;
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo((w / 5) * i, 4);
    ctx.lineTo((w / 5) * i, 56);
    ctx.stroke();
  }
  const fma = [autopilot.athr ? 'SPEED' : s.engines.some((e) => e.lever > 0.95) ? 'MAN TOGA' : '', autopilot.vertical, autopilot.lateral, '', autopilot.ap ? 'AP1' : ''];
  fma.forEach((f, i) => f && txt(ctx, f, (w / 5) * (i + 0.5), 18, i === 0 && f.startsWith('MAN') ? C.white : C.green, 13, 'center'));
  txt(ctx, autopilot.athr ? 'A/THR' : '', (w / 5) * 4.5, 44, C.white, 12, 'center');
  if (autopilot.ap) txt(ctx, '1FD2', (w / 5) * 4.5, 31, C.white, 12, 'center');

  // Attitude indicator
  const cx = w / 2;
  const cy = 210;
  const R = 110;
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - R, cy - R - 20, 2 * R, 2 * R + 40);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate((-a.bank * Math.PI) / 180);
  const ppd = 5.2; // px per degree of pitch
  const off = a.pitch * ppd;
  ctx.fillStyle = C.sky;
  ctx.fillRect(-400, -400 + off, 800, 400);
  ctx.fillStyle = C.ground;
  ctx.fillRect(-400, off, 800, 400);
  ctx.strokeStyle = C.white;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-400, off);
  ctx.lineTo(400, off);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  for (let p = -30; p <= 30; p += 2.5) {
    if (p === 0) continue;
    const y = off - p * ppd;
    const len = p % 10 === 0 ? 46 : p % 5 === 0 ? 26 : 12;
    ctx.beginPath();
    ctx.moveTo(-len / 2, y);
    ctx.lineTo(len / 2, y);
    ctx.stroke();
    if (p % 10 === 0) {
      txt(ctx, String(Math.abs(p)), -len / 2 - 14, y, C.white, 11, 'center');
      txt(ctx, String(Math.abs(p)), len / 2 + 14, y, C.white, 11, 'center');
    }
  }
  ctx.restore();
  // Bank scale
  ctx.strokeStyle = C.white;
  ctx.lineWidth = 1.5;
  for (const b of [-45, -30, -20, -10, 0, 10, 20, 30, 45]) {
    const r = (b - 90) * (Math.PI / 180);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(r) * (R - 6), cy + Math.sin(r) * (R - 6));
    ctx.lineTo(cx + Math.cos(r) * (R + (b % 30 === 0 ? 6 : 2)), cy + Math.sin(r) * (R + (b % 30 === 0 ? 6 : 2)));
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-a.bank * Math.PI) / 180);
  ctx.fillStyle = C.yellow;
  ctx.beginPath();
  ctx.moveTo(0, -R + 6);
  ctx.lineTo(-7, -R + 16);
  ctx.lineTo(7, -R + 16);
  ctx.fill();
  ctx.restore();
  // Aircraft symbol
  ctx.strokeStyle = '#000';
  ctx.fillStyle = C.yellow;
  ctx.lineWidth = 1;
  ctx.fillRect(cx - 70, cy - 3, 40, 6);
  ctx.fillRect(cx + 30, cy - 3, 40, 6);
  ctx.fillRect(cx - 4, cy - 4, 8, 8);

  // Speed tape
  const tapeTop = 90;
  const tapeH = 240;
  const kpx = 3.2;
  ctx.fillStyle = '#2a2f36';
  ctx.fillRect(4, tapeTop, 64, tapeH);
  ctx.save();
  ctx.beginPath();
  ctx.rect(4, tapeTop, 64, tapeH);
  ctx.clip();
  const mid = tapeTop + tapeH / 2;
  for (let v = Math.floor((a.ias - 40) / 10) * 10; v < a.ias + 40; v += 10) {
    if (v < 30) continue;
    const y = mid - (v - a.ias) * kpx;
    ctx.strokeStyle = C.white;
    ctx.beginPath();
    ctx.moveTo(56, y);
    ctx.lineTo(68, y);
    ctx.stroke();
    if (v % 20 === 0) txt(ctx, String(v), 50, y, C.white, 14, 'right');
  }
  // VMO barber pole
  const yv = mid - (340 - a.ias) * kpx;
  ctx.fillStyle = C.red;
  for (let y = yv; y > tapeTop - 20; y -= 12) ctx.fillRect(62, y - 6, 6, 6);
  ctx.restore();
  ctx.fillStyle = C.yellow;
  ctx.fillRect(2, mid - 1, 70, 2);
  txt(ctx, a.ias < 30 ? '---' : '', 36, mid - 14, C.white, 12, 'center');
  // target speed
  const ys = mid - (autopilot.spd - a.ias) * kpx;
  if (autopilot.athr && ys > tapeTop && ys < tapeTop + tapeH) {
    ctx.fillStyle = C.magenta;
    ctx.beginPath();
    ctx.moveTo(70, ys);
    ctx.lineTo(78, ys - 6);
    ctx.lineTo(78, ys + 6);
    ctx.fill();
  }
  txt(ctx, a.mach > 0.3 ? `.${Math.round(a.mach * 1000).toString().padStart(3, '0')}` : '', 36, tapeTop + tapeH + 18, C.green, 15, 'center');

  // Altitude tape
  const ax = w - 80;
  ctx.fillStyle = '#2a2f36';
  ctx.fillRect(ax, tapeTop, 62, tapeH);
  ctx.save();
  ctx.beginPath();
  ctx.rect(ax, tapeTop, 62, tapeH);
  ctx.clip();
  const apx = 0.22;
  for (let v = Math.floor((a.altitude - 600) / 100) * 100; v < a.altitude + 600; v += 100) {
    const y = mid - (v - a.altitude) * apx;
    ctx.strokeStyle = C.white;
    ctx.beginPath();
    ctx.moveTo(ax, y);
    ctx.lineTo(ax + 8, y);
    ctx.stroke();
    if (v % 500 === 0) txt(ctx, String(Math.round(v / 100)).padStart(3, '0'), ax + 14, y, C.white, 14);
  }
  ctx.restore();
  ctx.fillStyle = '#000';
  ctx.fillRect(ax - 2, mid - 15, 70, 30);
  ctx.strokeStyle = C.yellow;
  ctx.strokeRect(ax - 2, mid - 15, 70, 30);
  txt(ctx, Math.round(a.altitude).toString().padStart(5, ' '), ax + 32, mid, C.green, 17, 'center', 600);
  txt(ctx, autopilot.ap || autopilot.vertical ? String(autopilot.alt) : '', ax + 32, tapeTop - 12, C.cyan, 14, 'center');
  // VSI
  const vx = w - 14;
  ctx.fillStyle = '#2a2f36';
  ctx.fillRect(vx - 10, tapeTop + 20, 18, tapeH - 40);
  const vy = mid - Math.max(-1, Math.min(1, a.vs / 6000)) * (tapeH / 2 - 26);
  ctx.strokeStyle = C.green;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(vx + 8, mid);
  ctx.lineTo(vx - 8, vy);
  ctx.stroke();
  if (Math.abs(a.vs) > 200) txt(ctx, String(Math.round(Math.abs(a.vs) / 100)), vx - 2, vy + (a.vs > 0 ? -10 : 10), C.green, 11, 'center');

  // Heading tape
  const hy = 370;
  ctx.fillStyle = '#2a2f36';
  ctx.fillRect(80, hy, w - 160, 34);
  ctx.save();
  ctx.beginPath();
  ctx.rect(80, hy, w - 160, 34);
  ctx.clip();
  for (let d = Math.floor(a.heading / 5) * 5 - 30; d < a.heading + 30; d += 5) {
    const x = cx + (d - a.heading) * 7;
    ctx.strokeStyle = C.white;
    ctx.beginPath();
    ctx.moveTo(x, hy);
    ctx.lineTo(x, hy + (d % 10 === 0 ? 10 : 5));
    ctx.stroke();
    if (d % 10 === 0) txt(ctx, String(((Math.round(d / 10) % 36) + 36) % 36), x, hy + 22, C.white, 13, 'center');
  }
  ctx.restore();
  ctx.fillStyle = C.yellow;
  ctx.fillRect(cx - 1, hy - 6, 2, 16);
  // Radio altitude / ground state
  if (a.radioAlt < 2500) txt(ctx, a.airborne ? String(Math.round(a.radioAlt)) : '', cx, 312, a.radioAlt < 400 ? C.amber : C.green, 18, 'center', 600);
  // Bottom: QNH / config
  txt(ctx, 'STD', w - 50, 430, C.cyan, 13, 'center');
  txt(ctx, CONF[s.highLift.conf]!.label.replace('CONF ', 'CONF '), 60, 430, C.cyan, 12, 'center');
  txt(ctx, s.gear.position < 0.01 ? 'LDG DN' : s.gear.inTransit ? 'LDG ↕' : 'LDG UP', cx, 430, s.gear.position < 0.01 ? C.green : s.gear.inTransit ? C.amber : C.grey, 12, 'center');
  // Warnings strip
  const warn = s.annunciations.find((x) => x.level === 'warning');
  if (warn) txt(ctx, warn.text, cx, 470, C.red, 14, 'center', 600);
}

// ----------------------------------------------------------------------- ND
function drawND(ctx: CanvasRenderingContext2D, w: number, _h: number, s: SystemsState) {
  const a = s.air;
  const cx = w / 2;
  const cy = 400;
  const R = 300;
  txt(ctx, `GS ${Math.round(a.gs * 1.944)}`, 10, 20, C.white, 14);
  txt(ctx, `TAS ${Math.round(a.airborne ? a.ias * (1 + a.altitude / 60000) : a.gs * 1.944)}`, 110, 20, C.white, 14);
  txt(ctx, 'ARC', w - 10, 20, C.green, 13, 'right');
  txt(ctx, `${displayState.ndRange} NM`, w - 10, 40, C.cyan, 13, 'right');
  // Compass arc
  ctx.strokeStyle = C.white;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, R, Math.PI * 1.22, Math.PI * 1.78);
  ctx.stroke();
  for (let d = -50; d <= 50; d += 5) {
    const hdg = Math.round(a.heading / 5) * 5 + d;
    const ang = ((hdg - a.heading) * Math.PI) / 180 - Math.PI / 2;
    if (Math.abs(hdg - a.heading) > 40) continue;
    const l = hdg % 10 === 0 ? 14 : 7;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
    ctx.lineTo(cx + Math.cos(ang) * (R - l), cy + Math.sin(ang) * (R - l));
    ctx.stroke();
    if (hdg % 30 === 0) txt(ctx, String(((hdg / 10) % 36 + 36) % 36), cx + Math.cos(ang) * (R - 28), cy + Math.sin(ang) * (R - 28), C.white, 15, 'center');
  }
  // Range ring
  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = '#59606a';
  ctx.beginPath();
  ctx.arc(cx, cy, R / 2, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
  ctx.setLineDash([]);
  // Lubber line & aircraft symbol
  ctx.fillStyle = C.yellow;
  ctx.fillRect(cx - 1.5, cy - R - 16, 3, 18);
  ctx.strokeStyle = C.yellow;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 20);
  ctx.lineTo(cx, cy + 12);
  ctx.moveTo(cx - 18, cy - 6);
  ctx.lineTo(cx + 18, cy - 6);
  ctx.moveTo(cx - 7, cy + 10);
  ctx.lineTo(cx + 7, cy + 10);
  ctx.stroke();
  // Selected heading bug
  if (autopilot.lateral === 'HDG') {
    const ang = ((autopilot.hdg - a.heading) * Math.PI) / 180 - Math.PI / 2;
    ctx.fillStyle = C.cyan;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  // Runway of departure (illustrative) when on ground
  if (!a.airborne) {
    ctx.strokeStyle = C.white;
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - 4, cy - 150, 8, 140);
    txt(ctx, 'RWY 09', cx + 14, cy - 140, C.white, 12);
  }
  txt(ctx, `${String(Math.round(((a.heading % 360) + 360) % 360)).padStart(3, '0')}°`, cx, 70, C.green, 16, 'center', 600);
}

// ----------------------------------------------------------------------- EWD
function dial(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, v: number, max: number, label: string, col: string, run: boolean) {
  const a0 = Math.PI * 0.8;
  const a1 = Math.PI * 2.2;
  ctx.strokeStyle = C.white;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, a0, a1);
  ctx.stroke();
  ctx.strokeStyle = C.red;
  ctx.beginPath();
  ctx.arc(x, y, r, a1 - 0.18, a1);
  ctx.stroke();
  const a = a0 + (a1 - a0) * Math.min(1.05, Math.max(0, v / max));
  ctx.strokeStyle = run ? col : C.amber;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(a) * (r - 4), y + Math.sin(a) * (r - 4));
  ctx.stroke();
  ctx.fillStyle = '#000';
  ctx.fillRect(x - 6, y + 6, r + 4, 22);
  ctx.strokeStyle = '#59606a';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 6, y + 6, r + 4, 22);
  txt(ctx, label, x + r / 2 - 4, y + 18, run ? col : C.amber, 15, 'center', 600);
}

function drawEWD(ctx: CanvasRenderingContext2D, w: number, _h: number, s: SystemsState) {
  txt(ctx, 'N1', 16, 22, C.white, 13);
  txt(ctx, '%', 16, 40, C.cyan, 12);
  s.engines.forEach((e, i) => {
    const x = 52 + i * 86;
    const run = e.state !== 'off';
    dial(ctx, x + 22, 72, 34, e.n1, 100, run ? e.n1.toFixed(1) : 'XX', C.green, run);
    // EGT bar
    ctx.fillStyle = '#2a2f36';
    ctx.fillRect(x, 140, 56, 8);
    ctx.fillStyle = e.egt > 900 ? C.amber : C.green;
    ctx.fillRect(x, 140, 56 * Math.min(1, e.egt / 1000), 8);
    txt(ctx, run ? String(Math.round(e.egt)) : 'XX', x + 28, 162, run ? C.green : C.amber, 13, 'center');
    txt(ctx, run ? e.n2.toFixed(1) : 'XX', x + 28, 186, run ? C.green : C.amber, 13, 'center');
    txt(ctx, run ? String(Math.round(e.ff / 10) * 10) : 'XX', x + 28, 210, run ? C.green : C.amber, 12, 'center');
    if (e.state === 'starting') txt(ctx, 'AVAIL', x + 28, 228, C.amber, 10, 'center');
    if (e.reverser > 0.05) txt(ctx, 'REV', x + 28, 34, e.reverser > 0.95 ? C.green : C.amber, 13, 'center', 700);
  });
  txt(ctx, 'EGT °C', 6, 162, C.white, 10);
  txt(ctx, 'N2 %', 6, 186, C.white, 10);
  txt(ctx, 'FF KG/H', 6, 210, C.white, 9);
  // Slat / flap indication
  const hl = s.highLift;
  txt(ctx, 'S', 106, 266, C.white, 13, 'center');
  txt(ctx, 'F', 276, 266, C.white, 13, 'center');
  ctx.strokeStyle = C.white;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(140, 262);
  ctx.lineTo(244, 262);
  ctx.stroke();
  ctx.strokeStyle = C.green;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(140, 262);
  ctx.lineTo(140 - (hl.slat / 23) * 26, 262 + (hl.slat / 23) * 16);
  ctx.moveTo(244, 262);
  ctx.lineTo(244 + (hl.flap / 32) * 30, 262 + (hl.flap / 32) * 22);
  ctx.stroke();
  txt(ctx, CONF[hl.conf]!.id === '0' ? '' : CONF[hl.conf]!.id, w / 2, 290, Math.abs(hl.slat - CONF[hl.conf]!.slat) + Math.abs(hl.flap - CONF[hl.conf]!.flap) > 0.5 ? C.cyan : C.green, 18, 'center', 600);
  // Memo / alerts
  ctx.strokeStyle = '#59606a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(8, 320);
  ctx.lineTo(w - 8, 320);
  ctx.stroke();
  let y = 340;
  for (const an of s.annunciations.slice(0, 8)) {
    txt(ctx, an.text, an.level === 'memo' ? w / 2 + 10 : 12, y, an.level === 'warning' ? C.red : an.level === 'caution' ? C.amber : C.green, 13);
    if (an.level !== 'memo') y += 20;
    else y += 20;
    if (y > 500) break;
  }
}

// ----------------------------------------------------------------------- SD
function page(ctx: CanvasRenderingContext2D, w: number, title: string) {
  txt(ctx, title, w / 2, 20, C.white, 16, 'center', 600);
  ctx.strokeStyle = C.white;
  ctx.beginPath();
  ctx.moveTo(w / 2 - 40, 32);
  ctx.lineTo(w / 2 + 40, 32);
  ctx.stroke();
}

function drawSD(ctx: CanvasRenderingContext2D, w: number, h: number, s: SystemsState) {
  let p = displayState.sdPage;
  if (displayState.autoSd) {
    if (s.gear.inTransit || !s.air.airborne) p = s.engines.some((e) => e.state === 'starting') ? 'ENG' : s.gear.inTransit ? 'WHEEL' : displayState.sdPage;
    if (s.apu.state === 'starting') p = 'APU';
  }
  switch (p) {
    case 'ENG':
      page(ctx, w, 'ENGINE');
      s.engines.forEach((e, i) => {
        const x = 50 + i * 90;
        txt(ctx, `ENG ${i + 1}`, x, 70, C.white, 13, 'center');
        txt(ctx, e.state.toUpperCase(), x, 92, e.state === 'running' ? C.green : e.state === 'off' ? C.grey : C.amber, 11, 'center');
        txt(ctx, `N2 ${e.n2.toFixed(0)}`, x, 120, C.green, 13, 'center');
        txt(ctx, `OIL ${e.state === 'running' ? (60 + e.n1 * 0.2).toFixed(0) : '0'}`, x, 146, e.state === 'running' ? C.green : C.amber, 12, 'center');
        txt(ctx, `VIB ${e.state === 'running' ? (0.3 + e.n1 / 300).toFixed(1) : '0.0'}`, x, 170, C.green, 12, 'center');
        // start progress bar
        ctx.fillStyle = '#2a2f36';
        ctx.fillRect(x - 30, 196, 60, 6);
        ctx.fillStyle = C.green;
        ctx.fillRect(x - 30, 196, 60 * Math.min(1, e.startProgress), 6);
      });
      txt(ctx, `START VALVES · ${s.bleedAvailable ? 'BLEED AVAIL' : 'NO BLEED'}`, w / 2, 240, s.bleedAvailable ? C.green : C.amber, 13, 'center');
      break;
    case 'APU':
      page(ctx, w, 'APU');
      txt(ctx, s.apu.state === 'running' ? 'AVAIL' : s.apu.state.toUpperCase(), w / 2, 70, s.apu.state === 'running' ? C.green : C.white, 16, 'center', 600);
      txt(ctx, `N  ${s.apu.n.toFixed(0)} %`, w / 2, 120, C.green, 16, 'center');
      txt(ctx, `EGT ${s.apu.egt.toFixed(0)} °C`, w / 2, 150, C.green, 16, 'center');
      txt(ctx, `BLEED ${s.apu.bleed ? 'OPEN' : 'CLOSED'}`, w / 2, 190, s.apu.bleed ? C.green : C.white, 14, 'center');
      txt(ctx, `GEN ${s.elec.sources.includes('APU GEN') ? 'ON LINE' : 'OFF'}`, w / 2, 216, C.green, 14, 'center');
      break;
    case 'HYD': {
      page(ctx, w, 'HYD');
      const sys = [
        ['GREEN', s.hyd.green, 'ENG 1+2'],
        ['YELLOW', s.hyd.yellow, 'ENG 3+4'],
      ] as const;
      sys.forEach(([n, v, src], i) => {
        const x = 110 + i * 170;
        txt(ctx, n, x, 70, C.white, 15, 'center', 600);
        txt(ctx, String(Math.round(v / 10) * 10), x, 104, v > 4000 ? C.green : C.amber, 22, 'center', 600);
        txt(ctx, 'PSI', x, 128, C.cyan, 11, 'center');
        ctx.strokeStyle = v > 4000 ? C.green : C.amber;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, 140);
        ctx.lineTo(x, 260);
        ctx.stroke();
        txt(ctx, src, x, 280, C.white, 12, 'center');
        txt(ctx, s.hyd.elecPumps ? 'ELEC PUMP ON' : '', x, 304, C.green, 11, 'center');
      });
      txt(ctx, 'EHA / EBHA BACKUP: ' + (s.elec.ac ? 'AVAIL' : 'NO AC'), w / 2, 350, s.elec.ac ? C.green : C.amber, 12, 'center');
      break;
    }
    case 'ELEC':
      page(ctx, w, 'ELEC AC');
      ['GEN 1', 'GEN 2', 'GEN 3', 'GEN 4'].forEach((g, i) => {
        const on = s.elec.sources.includes(g);
        ctx.strokeStyle = on ? C.green : C.white;
        ctx.strokeRect(20 + i * 88, 60, 76, 52);
        txt(ctx, g, 58 + i * 88, 76, on ? C.white : C.grey, 12, 'center');
        txt(ctx, on ? '150 KVA' : 'OFF', 58 + i * 88, 98, on ? C.green : C.amber, 11, 'center');
      });
      txt(ctx, `APU GEN ${s.elec.sources.includes('APU GEN') ? 'ON' : 'OFF'}`, 100, 160, s.elec.sources.includes('APU GEN') ? C.green : C.white, 13, 'center');
      txt(ctx, `EXT PWR ${s.elec.sources.includes('EXT') ? 'ON' : s.elec.extAvail ? 'AVAIL' : '—'}`, 280, 160, s.elec.sources.includes('EXT') ? C.green : C.white, 13, 'center');
      txt(ctx, `AC BUS ${s.elec.ac ? 'POWERED' : 'OFF'}`, w / 2, 220, s.elec.ac ? C.green : C.amber, 15, 'center', 600);
      txt(ctx, `DC BUS ${s.elec.dc ? (s.elec.ac ? 'TR' : 'BAT') : 'OFF'}`, w / 2, 250, s.elec.dc ? C.green : C.amber, 15, 'center', 600);
      txt(ctx, `BAT ${s.elec.battery ? '28 V' : 'OFF'}`, w / 2, 290, s.elec.battery ? C.green : C.white, 13, 'center');
      break;
    case 'WHEEL': {
      page(ctx, w, 'WHEEL');
      const down = s.gear.position < 0.01;
      const col = down ? C.green : s.gear.inTransit ? C.red : C.grey;
      const gearBox = (x: number, y: number, label: string) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 26, y, 52, 22);
        txt(ctx, down ? '▼▼' : s.gear.inTransit ? '' : 'UP', x, y + 11, col, 12, 'center');
        txt(ctx, label, x, y + 36, C.white, 10, 'center');
      };
      gearBox(w / 2, 60, 'NOSE');
      gearBox(90, 140, 'WING L');
      gearBox(w - 90, 140, 'WING R');
      gearBox(150, 210, 'BODY L');
      gearBox(w - 150, 210, 'BODY R');
      txt(ctx, `DOORS ${s.gear.doors > 0.02 ? 'OPEN' : 'CLOSED'}`, w / 2, 290, s.gear.doors > 0.02 ? C.amber : C.green, 13, 'center');
      txt(ctx, `BRK TEMP ${Math.round(s.brakes.temp)} °C`, w / 2, 320, s.brakes.temp > 300 ? C.amber : C.green, 13, 'center');
      txt(ctx, `PARK BRK ${s.brakes.parking ? 'ON' : 'OFF'} · A/BRK ${s.brakes.autobrake}`, w / 2, 350, C.cyan, 12, 'center');
      txt(ctx, `N/W STEER ${s.gear.steering.toFixed(0)}°`, w / 2, 380, C.green, 12, 'center');
      break;
    }
    case 'F/CTL': {
      page(ctx, w, 'F/CTL');
      const c = s.controls;
      const bar = (x: number, y: number, v: number, max: number, label: string, vertical = true) => {
        ctx.strokeStyle = C.white;
        ctx.lineWidth = 1;
        if (vertical) ctx.strokeRect(x - 4, y - 40, 8, 80);
        else ctx.strokeRect(x - 40, y - 4, 80, 8);
        ctx.fillStyle = C.green;
        const k = Math.max(-1, Math.min(1, v / max));
        if (vertical) ctx.fillRect(x - 6, y + k * 36 - 2, 12, 4);
        else ctx.fillRect(x + k * 36 - 2, y - 6, 4, 12);
        txt(ctx, label, x, y + (vertical ? 56 : 18), C.white, 10, 'center');
      };
      bar(60, 110, c.aileronL, 25, 'AIL L');
      bar(w - 60, 110, c.aileronR, 25, 'AIL R');
      bar(140, 280, c.elevator, 30, 'ELEV L');
      bar(w - 140, 280, c.elevator, 30, 'ELEV R');
      bar(w / 2, 400, c.rudder, 30, 'RUD', false);
      txt(ctx, 'SPOILERS', w / 2, 70, C.white, 11, 'center');
      for (let k = 0; k < 8; k++) {
        const up = s.spoilers.deployed + (k >= 2 ? Math.max(s.spoilers.rollLeft, s.spoilers.rollRight) : 0) > 2;
        txt(ctx, up ? '▲' : '—', w / 2 - 70 + k * 20, 92, C.green, 12, 'center');
      }
      txt(ctx, `SPD BRK ${Math.round(s.spoilers.deployed)}°`, w / 2, 130, C.green, 12, 'center');
      txt(ctx, s.hyd.green > 1500 || s.elec.ac ? 'G  Y  E' : 'NO ACTUATION POWER', w / 2, 200, s.hyd.green > 1500 || s.elec.ac ? C.green : C.amber, 13, 'center');
      break;
    }
    case 'DOOR': {
      page(ctx, w, 'DOOR');
      // fuselage outline
      ctx.strokeStyle = C.white;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(w / 2, 50);
      ctx.quadraticCurveTo(w / 2 + 70, 70, w / 2 + 70, 140);
      ctx.lineTo(w / 2 + 70, 440);
      ctx.quadraticCurveTo(w / 2, 490, w / 2 - 70, 440);
      ctx.lineTo(w / 2 - 70, 140);
      ctx.quadraticCurveTo(w / 2 - 70, 70, w / 2, 50);
      ctx.stroke();
      const doorY = (id: string) => {
        const n = Number(id[1]);
        return id.startsWith('U') ? 130 + (n - 1) * 120 : 110 + (n - 1) * 75;
      };
      for (const d of Object.values(s.doors)) {
        if (d.kind === 'cargo') {
          const y = d.id === 'FWD_CARGO' ? 170 : d.id === 'AFT_CARGO' ? 360 : 400;
          ctx.fillStyle = d.position > 0.02 ? C.amber : C.green;
          ctx.fillRect(w / 2 + 44, y, 14, 22);
          continue;
        }
        const left = d.id.endsWith('L');
        const upper = d.id.startsWith('U');
        const x = w / 2 + (left ? -1 : 1) * (upper ? 46 : 74);
        const y = doorY(d.id);
        ctx.fillStyle = d.position > 0.02 ? C.amber : C.green;
        ctx.fillRect(x - 6, y, 12, 18);
        txt(ctx, d.armed ? 'SLIDE' : '', x + (left ? -34 : 34), y + 9, C.white, 8, 'center');
      }
      txt(ctx, 'MAIN · UPPER · CARGO', w / 2, 500, C.grey, 10, 'center');
      break;
    }
  }
  // bottom permanent data
  ctx.strokeStyle = '#59606a';
  ctx.beginPath();
  ctx.moveTo(0, h - 40);
  ctx.lineTo(w, h - 40);
  ctx.stroke();
  txt(ctx, `TAT ${s.air.airborne ? Math.round(15 - s.air.altitude / 500) : 15} °C`, 12, h - 20, C.green, 12);
  txt(ctx, `GW ${(flightMass() / 1000).toFixed(0)} T`, w - 12, h - 20, C.green, 12, 'right');
}

let massProvider: () => number = () => 470000;
export function setMassProvider(fn: () => number): void {
  massProvider = fn;
}
const flightMass = () => massProvider();

// ----------------------------------------------------------------------- MFD / OIT / FCU
function drawMFD(ctx: CanvasRenderingContext2D, w: number, _h: number, s: SystemsState, side: 'C' | 'F') {
  txt(ctx, side === 'C' ? 'FMS 1' : 'FMS 2', 10, 18, C.white, 12);
  txt(ctx, 'ACTIVE / F-PLN', w / 2, 46, C.white, 15, 'center', 600);
  const rows = [
    ['DTX09', 'RWY', '---', C.green],
    ['DT01', '090°', 'FL050', C.green],
    ['DT02', '094°', 'FL180', C.green],
    ['TWINS', '101°', 'FL350', C.green],
    ['T/D', '', '', C.white],
    ['DTX27', 'ARR', '', C.white],
  ] as const;
  rows.forEach(([wp, trk, alt, col], i) => {
    const y = 90 + i * 40;
    txt(ctx, wp, 16, y, i === 1 ? C.magenta : col, 15);
    txt(ctx, trk, w / 2, y, C.white, 13, 'center');
    txt(ctx, alt, w - 16, y, C.magenta, 13, 'right');
  });
  txt(ctx, 'Fictional educational route', w / 2, 360, C.grey, 11, 'center');
  txt(ctx, `ZFW ${(flightMass() / 1000 - 60).toFixed(0)}  FOB 60.0`, w / 2, 400, C.cyan, 13, 'center');
  txt(ctx, `CG 32.5%  TRIM ${s.controls.trim.toFixed(1)}`, w / 2, 430, C.cyan, 13, 'center');
}

const CHECKLIST = [
  ['BATTERIES', (s: SystemsState) => s.elec.battery],
  ['EXT PWR or APU', (s: SystemsState) => s.elec.ac],
  ['APU BLEED', (s: SystemsState) => s.apu.bleed],
  ['BEACON', (s: SystemsState) => s.lights.beacon],
  ['ENG MODE IGN/START', (s: SystemsState) => s.engineMode === 'IGN/START' || s.engines.every((e) => e.state === 'running')],
  ['ENGINES 1-4', (s: SystemsState) => s.engines.every((e) => e.state === 'running')],
  ['FLAPS T.O', (s: SystemsState) => s.highLift.lever >= 1],
  ['GND SPLRS ARM', (s: SystemsState) => s.spoilers.armed],
  ['PARK BRK OFF', (s: SystemsState) => !s.brakes.parking],
] as const;

function drawOIT(ctx: CanvasRenderingContext2D, w: number, _h: number, s: SystemsState) {
  ctx.fillStyle = '#0d1b2a';
  ctx.fillRect(0, 0, w, 40);
  txt(ctx, 'OIS · BEFORE TAKEOFF (EDUCATIONAL)', 12, 20, C.white, 13);
  CHECKLIST.forEach(([label, done], i) => {
    const y = 64 + i * 32;
    const ok = done(s);
    txt(ctx, label, 20, y, ok ? C.green : C.white, 14);
    txt(ctx, ok ? 'DONE' : '....', w - 20, y, ok ? C.green : C.grey, 13, 'right');
  });
}

function drawFCU(ctx: CanvasRenderingContext2D, w: number, h: number, s: SystemsState) {
  const fields: [string, string][] = [
    ['SPD', autopilot.athr ? String(autopilot.spd) : '---'],
    ['HDG', autopilot.lateral === 'HDG' ? String(Math.round(autopilot.hdg)).padStart(3, '0') : '---'],
    ['ALT', String(autopilot.alt).padStart(5, '0')],
    ['V/S', autopilot.vertical === 'V/S' ? `${autopilot.vs > 0 ? '+' : ''}${(autopilot.vs / 100).toFixed(0)}oo` : '-----'],
  ];
  fields.forEach(([l, v], i) => {
    const x = 70 + i * 240;
    txt(ctx, l, x, h / 2, '#ffb21e', 22, 'center', 600);
    txt(ctx, v, x + 100, h / 2, '#ffb21e', 34, 'center', 700);
  });
  void s;
  void w;
}

/** Printed overhead legends — only for buttons that are actually operable. */
const OVHD_ROWS: [string, string[]][] = [
  ['ELEC', ['BAT 1+2', 'EXT PWR', 'APU GEN']],
  ['APU', ['MASTER', 'START', 'BLEED']],
  ['EXT LT', ['BEACON', 'NAV & LOGO', 'STROBE']],
  ['EXT LT', ['LAND', 'TAXI', 'WING']],
  ['SIGNS · INT LT', ['SEAT BELTS', 'CABIN LT', 'DOME']],
];
const LEFT_PANELS = ['ADIRS', 'F/CTL', 'EVAC', 'EMER ELEC', 'GPWS', 'RCDR', 'OXYGEN', 'CALLS', 'WIPER'];
const RIGHT_PANELS = ['CARGO SMOKE', 'VENT', 'ENG', 'FUEL', 'HYD', 'AIR', 'ANTI ICE', 'CAB PRESS', 'INT LT'];
const PB_TOP = ['FAULT', 'FAULT', 'FAULT', 'FAULT', 'LO', 'FAULT'];
const PB_BOT = ['OFF', 'ON', 'OFF', 'AUTO', 'OFF', 'ALTN'];

/**
 * Overhead panel face. The decorative switch field in the cockpit geometry is placed by a
 * seeded sequence; the same sequence is replayed here so every annunciator outline, knob scale
 * and legend sits under its physical switch. By day the legends are engraved paint; at night
 * the integral lighting makes them glow warm white, with the synoptic flow lines in green and
 * yellow, as in photographs of the A380 overhead.
 */
function drawOverhead(ctx: CanvasRenderingContext2D, w: number, h: number, s: SystemsState) {
  const night = displayState.integral;
  const sA = 4.35;
  const sB = 6.3;
  const vOf = (st: number) => 1 - (st - (sA + 0.05)) / (sB - 0.05 - (sA + 0.05));
  const X = (z: number) => (0.5 + z / 0.96) * w;
  const Y = (st: number) => (1 - vOf(st)) * h;
  const kx = w / 0.96;
  const legend = night > 0.5 ? '#ffd38a' : '#e9ebed';
  const dim = night > 0.5 ? 'rgba(255,211,138,0.35)' : 'rgba(233,235,237,0.55)';
  ctx.fillStyle = night > 0.5 ? '#15181c' : '#4a5158';
  ctx.fillRect(0, 0, w, h);
  if (night > 0.5) {
    ctx.shadowColor = 'rgba(255,190,90,0.6)';
    ctx.shadowBlur = 4;
  }
  // replay the switch-field sequence (see overheadField in the cockpit geometry)
  let seed = 17;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let row = 0; row < 9; row++) {
    const st = sA + 0.12 + ((sB - 0.12 - (sA + 0.12)) * row) / 8;
    const y = Y(st);
    for (const [side, zc] of [
      [0, -0.36],
      [1, 0.36],
    ] as const) {
      // sub-panel outline and title
      ctx.strokeStyle = night > 0.5 ? 'rgba(255,211,138,0.25)' : 'rgba(20,22,25,0.55)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(X(zc - 0.13), y - 0.09 * kx * 0.55, 0.26 * kx, 0.18 * kx * 0.55);
      txt(ctx, (side === 0 ? LEFT_PANELS : RIGHT_PANELS)[row]!, X(zc), y - 0.075 * kx * 0.55, legend, 10, 'center', 700);
      const n = 3 + Math.floor(rnd() * 3);
      const pts: number[] = [];
      for (let k = 0; k < n; k++) {
        const z = zc - 0.1 + (0.2 * k) / Math.max(1, n - 1);
        const kind = rnd();
        const x = X(z);
        pts.push(x);
        if (kind < 0.5) {
          // push-button annunciator: upper legend (fault, amber), lower legend (state)
          const b = 0.03 * kx;
          ctx.fillStyle = '#0e0f11';
          ctx.fillRect(x - b / 2, y - b / 2, b, b);
          const lit = (row * 7 + k * 3 + side) % 5;
          const powered = s.elec.ac || s.elec.dc;
          const top = PB_TOP[(row + k) % PB_TOP.length]!;
          const bot = PB_BOT[(row * 2 + k) % PB_BOT.length]!;
          txt(ctx, top, x, y - b * 0.18, powered && lit === 0 ? '#ffb21e' : 'rgba(120,120,120,0.5)', 5.5, 'center', 700);
          const botCol = !powered ? 'rgba(120,120,120,0.5)' : bot === 'ON' || bot === 'AUTO' ? (lit < 3 ? '#5ab4ff' : 'rgba(120,120,120,0.5)') : lit === 1 ? '#f2f4f6' : 'rgba(120,120,120,0.5)';
          txt(ctx, bot, x, y + b * 0.26, botCol, 5.5, 'center', 700);
          txt(ctx, ['PUMP', 'GEN', 'VALVE', 'BUS', 'XFR', 'MODE', 'SEL'][(row + k + side) % 7]!, x, y - b * 0.95, legend, 6.5, 'center', 600);
        } else if (kind < 0.8) {
          // toggle switch positions
          txt(ctx, 'ON', x, y - 0.03 * kx, dim, 6, 'center', 600);
          txt(ctx, 'OFF', x, y + 0.035 * kx, dim, 6, 'center', 600);
        } else {
          // rotary selector scale
          ctx.strokeStyle = dim;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(x, y, 0.024 * kx, Math.PI * 0.8, Math.PI * 2.2);
          ctx.stroke();
          for (let t = 0; t < 5; t++) {
            const a = Math.PI * 0.8 + (t / 4) * Math.PI * 1.4;
            ctx.beginPath();
            ctx.moveTo(x + Math.cos(a) * 0.024 * kx, y + Math.sin(a) * 0.024 * kx);
            ctx.lineTo(x + Math.cos(a) * 0.03 * kx, y + Math.sin(a) * 0.03 * kx);
            ctx.stroke();
          }
        }
      }
      // synoptic flow line through the row (hydraulic, fuel, air and electrical panels)
      if (['HYD', 'FUEL', 'AIR', 'ELEC', 'ENG', 'EMER ELEC'].includes((side === 0 ? LEFT_PANELS : RIGHT_PANELS)[row]!)) {
        ctx.strokeStyle = night > 0.5 ? (row % 2 ? '#a6ff4d' : '#ffd84d') : 'rgba(240,240,240,0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pts[0]!, y + 0.022 * kx);
        ctx.lineTo(pts[pts.length - 1]!, y + 0.022 * kx);
        for (const px of pts) {
          ctx.moveTo(px, y + 0.022 * kx);
          ctx.lineTo(px, y + 0.017 * kx);
        }
        ctx.stroke();
      }
    }
  }
  // printed legends for the operable centre-column buttons
  OVHD_ROWS.forEach(([title, labels], r) => {
    const st = sA + 0.25 + ((sB - 0.35 - (sA + 0.25)) * r) / 4;
    const y = (1 - vOf(st)) * h;
    if (r === 0 || OVHD_ROWS[r - 1]![0] !== title) {
      ctx.fillStyle = night > 0.5 ? 'rgba(255,211,138,0.3)' : 'rgba(20,22,25,0.5)';
      ctx.fillRect(X(-0.24), y - 0.115 * kx * 0.55 - 14, X(0.24) - X(-0.24), 2);
      txt(ctx, title, w / 2, y - 0.1 * kx * 0.55 - 6, legend, 13, 'center', 700);
    }
    labels.forEach((l, c) => {
      const x = (0.5 + ((c - 1) * 0.16) / 0.96) * w;
      txt(ctx, l, x, y - 26, legend, 10, 'center', 700);
    });
  });
  // engine fire handles across the forward edge, and the APU fire button
  for (let k = 0; k < 4; k++) {
    const x = X(-0.21 + k * 0.14);
    ctx.fillStyle = '#7a1414';
    ctx.fillRect(x - 18, 10, 36, 20);
    txt(ctx, `ENG ${k + 1}`, x, 21, '#ffdede', 9, 'center', 800);
  }
  ctx.shadowBlur = 0;
}

// ----------------------------------------------------------------------- suite
export class DisplaySuite {
  readonly canvases = new Map<ScreenName, HTMLCanvasElement>();
  readonly textures = new Map<ScreenName, CanvasTexture>();
  private last = 0;
  /** power-up time of each screen (ms), for the self-test sequence */
  private bootAt = new Map<ScreenName, number>();
  private wasOn = new Map<ScreenName, boolean>();

  constructor() {
    for (const name of Object.keys(SIZE) as ScreenName[]) {
      const [w, h] = SIZE[name];
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      this.canvases.set(name, c);
      const t = new CanvasTexture(c);
      t.colorSpace = SRGBColorSpace;
      t.anisotropy = 4;
      this.textures.set(name, t);
    }
  }

  /** Redraw all screens at most every 66 ms. Returns true if redrawn. */
  update(now: number, force = false): boolean {
    if (!force && now - this.last < 66) return false;
    this.last = now;
    const s = systems.state;
    const powered = s.elec.ac || s.elec.dc;
    for (const [name, c] of this.canvases) {
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = name === 'FCU' ? '#0b0b0b' : name === 'OVHD' ? '#3b4148' : '#020304';
      ctx.fillRect(0, 0, c.width, c.height);
      // Only essential displays run on battery power (educational simplification)
      const on = name === 'OVHD' || s.elec.ac || (s.elec.dc && (name === 'PFD_C' || name === 'EWD'));
      // Power-up: dark backlight, then the self test, staggered from screen to screen
      if (on && !this.wasOn.get(name) && name !== 'OVHD') this.bootAt.set(name, now + Math.random() * 1200);
      this.wasOn.set(name, on);
      const boot = on && name !== 'OVHD' ? now - (this.bootAt.get(name) ?? -1e9) : 1e9;
      if (boot < 7000) {
        ctx.fillStyle = boot < 700 ? '#000' : '#05070a';
        ctx.fillRect(0, 0, c.width, c.height);
        if (boot > 900 && name !== 'FCU') {
          txt(ctx, 'SELF TEST IN PROGRESS', c.width / 2, c.height / 2 - 14, '#f2f4f6', Math.max(14, c.width / 26), 'center', 600);
          txt(ctx, '(MAX 40 SECONDS)', c.width / 2, c.height / 2 + 18, '#f2f4f6', Math.max(12, c.width / 32), 'center', 500);
        }
        this.textures.get(name)!.needsUpdate = true;
        continue;
      }
      if (on) {
        ctx.save();
        switch (name) {
          case 'PFD_C':
          case 'PFD_F':
            drawPFD(ctx, c.width, c.height, s);
            break;
          case 'ND_C':
          case 'ND_F':
            drawND(ctx, c.width, c.height, s);
            break;
          case 'EWD':
            drawEWD(ctx, c.width, c.height, s);
            break;
          case 'SD':
            drawSD(ctx, c.width, c.height, s);
            break;
          case 'MFD_C':
            drawMFD(ctx, c.width, c.height, s, 'C');
            break;
          case 'MFD_F':
            drawMFD(ctx, c.width, c.height, s, 'F');
            break;
          case 'OIT_C':
          case 'OIT_F':
            drawOIT(ctx, c.width, c.height, s);
            break;
          case 'FCU':
            drawFCU(ctx, c.width, c.height, s);
            break;
          case 'OVHD':
            drawOverhead(ctx, c.width, c.height, s);
            break;
        }
        ctx.restore();
      } else if (powered === false && name !== 'FCU') {
        // dark screen with faint reflection gradient
        const g = ctx.createLinearGradient(0, 0, c.width, c.height);
        g.addColorStop(0, 'rgba(255,255,255,0.03)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, c.width, c.height);
      }
      this.textures.get(name)!.needsUpdate = true;
    }
    return true;
  }
}

let suite: DisplaySuite | null = null;
export function getDisplays(): DisplaySuite {
  suite ??= new DisplaySuite();
  return suite;
}
