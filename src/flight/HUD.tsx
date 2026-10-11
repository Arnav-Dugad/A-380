/**
 * Flight HUD overlay (screen space): speed and altitude tapes, pitch ladder with flight-path
 * vector, heading scale, vertical speed, thrust, configuration, autopilot modes and alerts.
 * Drawn on a 2D canvas at display refresh, independent of React renders.
 */
import { useEffect, useRef } from 'react';
import { autopilot } from '../cockpit/displays';
import { FT, KT, flight } from '../sim/flight';
import { CONF, systems } from '../sim/systems';
import { useUI } from '../state/ui';
import { resetFlight, stopReplay } from './FlightMode';
import { Button } from '../ui/kit';
import { useSim } from '../state/sim';

const G = '#7dffb0';
const C = '#6fd3ef';
const A = '#ffb347';
const R = '#ff5a4f';

export function FlightHUD() {
  const ref = useRef<HTMLCanvasElement>(null);
  const replaying = useUI((s) => s.replay);
  const paused = useUI((s) => s.flightPaused);
  const cam = useUI((s) => s.flightCam);
  useSim((s) => s.version);
  const crashed = flight.state.crashed;

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = ref.current;
      if (!c) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (c.width !== w * dpr || c.height !== h * dpr) {
        c.width = w * dpr;
        c.height = h * dpr;
      }
      const ctx = c.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const s = flight.state;
      const sys = systems.state;
      const a = sys.air;
      const cx = w / 2;
      const cy = h * 0.46;
      ctx.lineWidth = 1.5;
      ctx.font = '600 13px "JetBrains Mono Variable", monospace';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 4;
      const ppd = Math.min(h, 900) / 60; // px per degree
      // Pitch ladder (screen-fixed, rolls with bank)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((-a.bank * Math.PI) / 180);
      ctx.strokeStyle = G;
      ctx.fillStyle = G;
      for (let p = -20; p <= 30; p += 5) {
        const y = (a.pitch - p) * ppd;
        if (Math.abs(y) > h * 0.3) continue;
        const half = p === 0 ? 220 : 70;
        ctx.setLineDash(p < 0 ? [8, 6] : []);
        ctx.beginPath();
        ctx.moveTo(-half, y);
        ctx.lineTo(-24, y);
        ctx.moveTo(24, y);
        ctx.lineTo(half, y);
        ctx.stroke();
        if (p !== 0) {
          ctx.textAlign = 'right';
          ctx.fillText(String(p), -half - 8, y);
        }
      }
      ctx.setLineDash([]);
      ctx.restore();
      // Flight path vector (γ relative to pitch, drift from β)
      const gamma = (Math.asin(Math.max(-1, Math.min(1, s.vel.y / Math.max(1, s.vel.length())))) * 180) / Math.PI;
      const fpvY = cy + (a.pitch - gamma) * ppd * (a.gs > 15 ? 1 : 0);
      const fpvX = cx + ((-s.beta * 180) / Math.PI) * ppd;
      ctx.strokeStyle = G;
      ctx.beginPath();
      ctx.arc(fpvX, fpvY, 8, 0, Math.PI * 2);
      ctx.moveTo(fpvX - 22, fpvY);
      ctx.lineTo(fpvX - 8, fpvY);
      ctx.moveTo(fpvX + 8, fpvY);
      ctx.lineTo(fpvX + 22, fpvY);
      ctx.moveTo(fpvX, fpvY - 8);
      ctx.lineTo(fpvX, fpvY - 16);
      ctx.stroke();
      // Boresight
      ctx.beginPath();
      ctx.moveTo(cx - 12, cy);
      ctx.lineTo(cx - 4, cy + 6);
      ctx.lineTo(cx + 4, cy + 6);
      ctx.lineTo(cx + 12, cy);
      ctx.stroke();
      // Speed tape (left)
      const tapeH = Math.min(320, h * 0.42);
      const lx = cx - Math.min(360, w * 0.3);
      ctx.strokeStyle = 'rgba(125,255,176,0.5)';
      ctx.strokeRect(lx - 34, cy - tapeH / 2, 68, tapeH);
      ctx.save();
      ctx.beginPath();
      ctx.rect(lx - 34, cy - tapeH / 2, 68, tapeH);
      ctx.clip();
      ctx.fillStyle = G;
      ctx.textAlign = 'right';
      for (let v = Math.floor((a.ias - 60) / 10) * 10; v < a.ias + 60; v += 10) {
        const y = cy - (v - a.ias) * 2.6;
        ctx.fillRect(lx + 22, y, 12, 1.5);
        if (v % 20 === 0 && v >= 0) ctx.fillText(String(v), lx + 16, y);
      }
      // stall and VMO bands
      const conf = sys.highLift.conf;
      const vsKt = [158, 128, 120, 116, 112, 107][conf]! * Math.sqrt(s.mass / 450000);
      const ys = cy - (vsKt - a.ias) * 2.6;
      ctx.fillStyle = 'rgba(255,90,79,0.8)';
      ctx.fillRect(lx + 30, ys, 4, tapeH);
      ctx.fillRect(lx + 30, cy - (340 - a.ias) * 2.6 - tapeH, 4, tapeH);
      ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(lx - 44, cy - 15, 64, 30);
      ctx.fillStyle = a.ias < vsKt * 1.1 ? R : G;
      ctx.font = '700 17px "JetBrains Mono Variable", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(Math.round(a.ias).toString(), lx - 12, cy);
      ctx.font = '600 12px "JetBrains Mono Variable", monospace';
      ctx.fillStyle = G;
      ctx.fillText(`M ${a.mach.toFixed(2)}`, lx, cy + tapeH / 2 + 16);
      ctx.fillText(`GS ${Math.round(a.gs * KT)}`, lx, cy + tapeH / 2 + 32);
      if (autopilot.athr) {
        ctx.fillStyle = C;
        ctx.fillText(`SPD ${autopilot.spd}`, lx, cy - tapeH / 2 - 14);
      }
      // Altitude tape (right)
      const rx = cx + Math.min(360, w * 0.3);
      ctx.strokeStyle = 'rgba(125,255,176,0.5)';
      ctx.strokeRect(rx - 40, cy - tapeH / 2, 80, tapeH);
      ctx.save();
      ctx.beginPath();
      ctx.rect(rx - 40, cy - tapeH / 2, 80, tapeH);
      ctx.clip();
      ctx.fillStyle = G;
      ctx.textAlign = 'left';
      for (let v = Math.floor((a.altitude - 600) / 100) * 100; v < a.altitude + 600; v += 100) {
        const y = cy - (v - a.altitude) * 0.26;
        ctx.fillRect(rx - 40, y, 10, 1.5);
        if (v % 500 === 0) ctx.fillText(String(v), rx - 24, y);
      }
      ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(rx - 30, cy - 15, 84, 30);
      ctx.fillStyle = G;
      ctx.font = '700 17px "JetBrains Mono Variable", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(Math.round(a.altitude).toString(), rx + 12, cy);
      ctx.font = '600 12px "JetBrains Mono Variable", monospace';
      ctx.fillText(`${a.vs >= 0 ? '+' : ''}${Math.round(a.vs / 10) * 10} fpm`, rx, cy + tapeH / 2 + 16);
      if (a.radioAlt < 2500) ctx.fillText(`RA ${Math.round(a.radioAlt)}`, rx, cy + tapeH / 2 + 32);
      if (autopilot.ap) {
        ctx.fillStyle = C;
        ctx.fillText(`ALT ${autopilot.alt}`, rx, cy - tapeH / 2 - 14);
      }
      // Heading scale (top)
      const hy = 92;
      ctx.fillStyle = G;
      ctx.strokeStyle = G;
      for (let d = Math.floor(a.heading / 5) * 5 - 30; d <= a.heading + 30; d += 5) {
        const x = cx + (d - a.heading) * 7;
        ctx.beginPath();
        ctx.moveTo(x, hy);
        ctx.lineTo(x, hy + (d % 10 === 0 ? 10 : 5));
        ctx.stroke();
        if (d % 10 === 0) {
          ctx.textAlign = 'center';
          ctx.fillText(String(((d % 360) + 360) % 360).padStart(3, '0'), x, hy + 22);
        }
      }
      ctx.beginPath();
      ctx.moveTo(cx, hy - 2);
      ctx.lineTo(cx - 6, hy - 10);
      ctx.lineTo(cx + 6, hy - 10);
      ctx.closePath();
      ctx.fill();
      // Bottom strip: thrust, config, gear, spoilers, AP modes, g
      const by = h - 120;
      ctx.textAlign = 'left';
      const n1 = sys.engines.reduce((m, e) => m + e.n1, 0) / 4;
      const lever = sys.engines[0]!.lever;
      const items: [string, string][] = [
        [`THR ${Math.round(lever * 100)}%  N1 ${n1.toFixed(0)}`, lever > 0.97 ? A : G],
        [CONF[sys.highLift.conf]!.label, sys.highLift.lever ? C : G],
        [sys.gear.position < 0.01 ? 'GEAR DN' : sys.gear.position > 0.99 ? 'GEAR UP' : 'GEAR ↕', sys.gear.inTransit ? A : G],
        [sys.spoilers.deployed > 2 ? `SPLR ${Math.round(sys.spoilers.deployed)}°` : sys.spoilers.armed ? 'SPLR ARM' : 'SPLR RET', sys.spoilers.deployed > 2 ? A : G],
        [`${autopilot.ap ? 'AP ' : ''}${autopilot.athr ? 'A/THR ' : ''}${autopilot.ap ? autopilot.lateral + ' ' + autopilot.vertical : ''}`.trim() || 'MANUAL', autopilot.ap ? C : G],
        [`${s.nz.toFixed(2)} G  α ${((s.alpha * 180) / Math.PI).toFixed(1)}°`, G],
        [sys.brakes.parking ? 'PARK BRK' : sys.brakes.autobrake !== 'DISARM' ? `A/BRK ${sys.brakes.autobrake}` : '', sys.brakes.parking ? A : G],
      ];
      let x = Math.max(20, cx - 470);
      for (const [t, col] of items) {
        if (!t) continue;
        ctx.fillStyle = col;
        ctx.fillText(t, x, by);
        x += ctx.measureText(t).width + 26;
      }
      // Alerts
      const warn = [...sys.annunciations.filter((x) => x.level === 'warning'), ...flight.events.filter((e) => s.t - e.t < 4).map((e) => ({ text: e.text, level: 'warning' }))];
      if (warn.length) {
        ctx.font = '700 18px "JetBrains Mono Variable", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? R : '#ff9b93';
        ctx.fillText(warn[0]!.text, cx, cy - tapeH / 2 - 30);
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      <canvas ref={ref} className={`pointer-events-none absolute inset-0 h-full w-full ${cam === 'cockpit' ? 'opacity-60' : ''}`} aria-hidden="true" />
      {(crashed || replaying || paused) && (
        <div className="pointer-events-auto absolute left-1/2 top-[22%] -translate-x-1/2 rounded-2xl border border-white/10 bg-graphite-900/85 px-6 py-4 text-center backdrop-blur-xl">
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-graphite-300">{crashed ? 'Simulation stopped' : replaying ? 'Replay' : 'Paused'}</div>
          <div className="mt-1 text-[15px] text-paper">{crashed ?? (replaying ? 'Playing back the last three minutes' : 'Press Space to resume')}</div>
          <div className="mt-3 flex justify-center gap-2">
            {crashed && (
              <Button size="sm" variant="accent" onClick={resetFlight}>
                Reset scenario
              </Button>
            )}
            {replaying && (
              <Button size="sm" onClick={stopReplay}>
                End replay
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export { FT };
