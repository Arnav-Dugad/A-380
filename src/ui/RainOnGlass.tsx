/**
 * Rain on the windshield, for flight-deck views in rain: droplets bead on the glass, run back
 * with the airflow at speed, and are cleared by each wiper stroke (synchronised with the
 * wiper arms on the model). Drawn on a 2D canvas over the 3D view.
 */
import { useEffect, useRef } from 'react';
import { wiperState } from '../animation/AircraftAnimator';
import { systems } from '../sim/systems';
import { useUI } from '../state/ui';

interface Drop {
  x: number;
  y: number;
  r: number;
  vy: number;
  vx: number;
}

export function RainOnGlass() {
  const weather = useUI((s) => s.weather);
  const section = useUI((s) => s.section);
  const flightCam = useUI((s) => s.flightCam);
  const active = (weather === 'lightRain' || weather === 'heavyRain') && (section === 'cockpit' || (section === 'flight' && flightCam === 'cockpit'));
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    const drops: Drop[] = [];
    let raf = 0;
    let last = performance.now();
    const heavy = weather === 'heavyRain';
    const resize = () => {
      c.width = Math.round(c.clientWidth * Math.min(2, devicePixelRatio));
      c.height = Math.round(c.clientHeight * Math.min(2, devicePixelRatio));
    };
    resize();
    window.addEventListener('resize', resize);
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const W = c.width;
      const H = c.height;
      const speed = systems.state.air.ias; // m/s
      // new impacts
      const rate = (heavy ? 260 : 90) * dt * (1 + speed / 60);
      for (let i = 0; i < rate; i++) drops.push({ x: Math.random() * W, y: Math.random() * H * 0.95, r: (1.2 + Math.random() * (heavy ? 3.4 : 2.4)) * (W / 1600), vx: 0, vy: 0 });
      // airflow pushes beads up and outward; gravity pulls large beads down when slow
      for (const d of drops) {
        const flow = Math.max(0, speed - 20) / 90;
        d.vy += (-flow * 900 + (speed < 20 && d.r > 3 ? 40 : 0)) * dt * (d.r / 3);
        d.vx += (d.x < W / 2 ? -1 : 1) * flow * 200 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
      }
      // wiper strokes: arms hinge at the lower corners and sweep inboard
      const sweep = wiperState.angle;
      const arms = [
        { px: W * 0.08, py: H * 1.02, dir: 1 },
        { px: W * 0.92, py: H * 1.02, dir: -1 },
      ];
      const len = H * 0.95;
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i]!;
        let wiped = d.y < -20 || d.x < -20 || d.x > W + 20 || d.y > H + 20;
        for (const a of arms) {
          const dx = (d.x - a.px) * a.dir;
          const dy = a.py - d.y;
          const ang = Math.atan2(dy, dx);
          if (sweep > 0.02 && Math.hypot(dx, dy) < len && ang < sweep * Math.PI * 0.62) wiped = true;
        }
        if (wiped) drops.splice(i, 1);
      }
      if (drops.length > 1400) drops.splice(0, drops.length - 1400);
      ctx.clearRect(0, 0, W, H);
      for (const d of drops) {
        const g = ctx.createRadialGradient(d.x - d.r * 0.3, d.y - d.r * 0.3, d.r * 0.1, d.x, d.y, d.r);
        g.addColorStop(0, 'rgba(255,255,255,0.32)');
        g.addColorStop(0.6, 'rgba(200,215,230,0.08)');
        g.addColorStop(1, 'rgba(10,15,20,0.32)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(d.x, d.y, d.r, d.r * (1 + Math.min(2, Math.abs(d.vy) / 400)), 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // the wiper arms crossing the view
      if (sweep > 0.02) {
        ctx.strokeStyle = 'rgba(12,13,15,0.92)';
        ctx.lineCap = 'round';
        for (const a of arms) {
          const ang = sweep * Math.PI * 0.62;
          ctx.lineWidth = W * 0.008;
          ctx.beginPath();
          ctx.moveTo(a.px, a.py);
          ctx.lineTo(a.px + Math.cos(ang) * len * a.dir, a.py - Math.sin(ang) * len);
          ctx.stroke();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [active, weather]);

  if (!active) return null;
  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 z-[4] h-full w-full" />;
}
