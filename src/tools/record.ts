/**
 * Video capture of the 3D canvas with MediaRecorder: free recording, or a turntable that
 * orbits once around the current target. WebM (VP9/VP8) where supported, MP4 on Safari.
 */
import { canvasRef } from '../render/output';
import { useTools } from './toolsState';

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];

function pickType(): { mime: string; ext: string } | null {
  const types = [
    { mime: 'video/webm;codecs=vp9', ext: 'webm' },
    { mime: 'video/webm;codecs=vp8', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' },
    { mime: 'video/mp4;codecs=avc1', ext: 'mp4' },
    { mime: 'video/mp4', ext: 'mp4' },
  ];
  if (typeof MediaRecorder === 'undefined') return null;
  return types.find((t) => MediaRecorder.isTypeSupported(t.mime)) ?? null;
}

export const recordingSupported = (): boolean => !!pickType() && typeof HTMLCanvasElement.prototype.captureStream === 'function';

export function startRecording(opts: { fps?: number; mbps?: number; turntable?: number } = {}): boolean {
  const canvas = canvasRef.el;
  const type = pickType();
  if (!canvas || !type || recorder) return false;
  const stream = canvas.captureStream(opts.fps ?? 60);
  chunks = [];
  recorder = new MediaRecorder(stream, { mimeType: type.mime, videoBitsPerSecond: (opts.mbps ?? 20) * 1e6 });
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: type.mime.split(';')[0] });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `a380-${opts.turntable ? 'turntable' : 'capture'}-${new Date().toISOString().replace(/[:.]/g, '-')}.${type.ext}`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    stream.getTracks().forEach((t) => t.stop());
    recorder = null;
    useTools.getState().set({ recording: false });
  };
  recorder.start(250);
  const t = useTools.getState();
  t.set({ recording: true, turntable: opts.turntable ? { active: true, seconds: opts.turntable, t: 0 } : { ...t.turntable, active: false } });
  if (opts.turntable) {
    // stop when the orbit completes
    const unsub = useTools.subscribe((s) => {
      if (!s.turntable.active) {
        unsub();
        stopRecording();
      }
    });
  }
  return true;
}

export function stopRecording(): void {
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  const t = useTools.getState();
  if (t.turntable.active) t.set({ turntable: { ...t.turntable, active: false } });
}
