/**
 * Optional synthesised sound (Web Audio, no downloaded files): turbofan whine and roar that
 * follow N1, APU hum, gear-motor and airflow noise. Off by default; enabled in Settings.
 */
import { useEffect } from 'react';
import { systems } from '../sim/systems';
import { useUI } from '../state/ui';

export function AudioEngine() {
  const enabled = useUI((s) => s.audio);
  useEffect(() => {
    if (!enabled) return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    // noise buffer
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = (freq: number, q = 0.7) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(master);
      src.start();
      return { f, g };
    };
    const roar = noise(400);
    const air = noise(1200, 0.4);
    const gearN = noise(220, 4);
    const whine = ctx.createOscillator();
    whine.type = 'sawtooth';
    const wf = ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.Q.value = 6;
    const wg = ctx.createGain();
    wg.gain.value = 0;
    whine.connect(wf).connect(wg).connect(master);
    whine.start();
    const apu = ctx.createOscillator();
    apu.type = 'triangle';
    const ag = ctx.createGain();
    ag.gain.value = 0;
    apu.connect(ag).connect(master);
    apu.start();
    const id = window.setInterval(() => {
      const s = systems.state;
      const t = ctx.currentTime;
      const n1 = s.engines.reduce((m, e) => m + e.n1, 0) / 400;
      const n2 = s.engines.reduce((m, e) => m + e.n2, 0) / 400;
      roar.g.gain.setTargetAtTime(Math.pow(n1, 1.6) * 0.9, t, 0.3);
      roar.f.frequency.setTargetAtTime(250 + n1 * 900, t, 0.3);
      whine.frequency.setTargetAtTime(400 + n2 * 2600, t, 0.4);
      wf.frequency.setTargetAtTime(500 + n2 * 2800, t, 0.4);
      wg.gain.setTargetAtTime(n2 > 0.05 ? 0.035 + n2 * 0.05 : 0, t, 0.4);
      apu.frequency.setTargetAtTime(110 + (s.apu.n / 100) * 90, t, 0.5);
      ag.gain.setTargetAtTime(s.apu.n > 5 ? 0.025 * (s.apu.n / 100) : 0, t, 0.5);
      air.g.gain.setTargetAtTime(Math.min(0.5, (s.air.ias / 300) ** 2 * 0.5), t, 0.5);
      gearN.g.gain.setTargetAtTime(s.gear.inTransit ? 0.25 : 0, t, 0.2);
    }, 100);
    return () => {
      window.clearInterval(id);
      void ctx.close();
    };
  }, [enabled]);
  return null;
}
