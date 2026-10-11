/**
 * Small live technical diagrams for the inspector. Each reads the shared systems snapshot,
 * so the diagram always agrees with what the 3D model is doing.
 */
import { CONF } from '../sim/systems';
import { useSim } from '../state/sim';
import { Label } from './kit';

const W = 312;

function Frame({ title, children, h = 120 }: { title: string; children: React.ReactNode; h?: number }) {
  return (
    <div className="border-t border-white/[0.06] px-5 py-3.5">
      <Label className="mb-2">{title}</Label>
      <svg viewBox={`0 0 ${W} ${h}`} className="w-full" role="img" aria-label={title}>
        <defs>
          <pattern id="dg-grid" width="12" height="12" patternUnits="userSpaceOnUse">
            <path d="M12 0H0V12" fill="none" stroke="rgba(255,255,255,0.04)" />
          </pattern>
        </defs>
        <rect width={W} height={h} rx="8" fill="url(#dg-grid)" stroke="rgba(255,255,255,0.06)" />
        {children}
      </svg>
    </div>
  );
}

function HighLiftChart() {
  const hl = useSim((s) => s.s.highLift);
  const colW = (W - 40) / CONF.length;
  return (
    <Frame title="High-lift configurations · slat / flap °" h={136}>
      {CONF.map((c, i) => {
        const x = 24 + i * colW;
        const active = hl.conf === i;
        const sh = (c.slat / 33) * 70;
        const fh = (c.flap / 33) * 70;
        return (
          <g key={c.id}>
            <rect x={x + 4} y={100 - sh} width={colW / 2 - 6} height={sh} rx="2" fill={active ? '#6fd3ef' : 'rgba(111,211,239,0.25)'} />
            <rect x={x + colW / 2} y={100 - fh} width={colW / 2 - 6} height={fh} rx="2" fill={active ? '#eef1f4' : 'rgba(238,241,244,0.22)'} />
            <text x={x + colW / 2} y={116} textAnchor="middle" fontSize="9" fill={active ? '#eef1f4' : '#6b7480'} fontFamily="JetBrains Mono Variable, monospace">
              {c.id}
            </text>
            <text x={x + colW / 2} y={128} textAnchor="middle" fontSize="8" fill="#6b7480" fontFamily="JetBrains Mono Variable, monospace">
              {c.slat}/{c.flap}
            </text>
          </g>
        );
      })}
      <text x={14} y={18} fontSize="9" fill="#959daa" fontFamily="Inter Variable, sans-serif">
        Actual: slat {hl.slat.toFixed(1)}° · flap {hl.flap.toFixed(1)}°
      </text>
      <rect x={W - 92} y={10} width="8" height="8" rx="1" fill="#6fd3ef" />
      <text x={W - 80} y={17} fontSize="8.5" fill="#959daa">slat</text>
      <rect x={W - 52} y={10} width="8" height="8" rx="1" fill="#eef1f4" />
      <text x={W - 40} y={17} fontSize="8.5" fill="#959daa">flap</text>
    </Frame>
  );
}

function GearSequence() {
  const g = useSim((s) => s.s.gear);
  const phases = [
    { label: 'Doors open', from: 0, to: 0.22 },
    { label: 'Gear transit', from: 0.22, to: 0.78 },
    { label: 'Doors close', from: 0.78, to: 1 },
  ];
  const x0 = 16;
  const span = W - 32;
  return (
    <Frame title="Gear sequence · doors → gear → doors" h={104}>
      {phases.map((p, i) => (
        <g key={p.label}>
          <rect x={x0 + p.from * span + 1} y={38} width={(p.to - p.from) * span - 2} height={14} rx="3" fill={i === 1 ? 'rgba(111,211,239,0.28)' : 'rgba(255,255,255,0.08)'} />
          <text x={x0 + ((p.from + p.to) / 2) * span} y={70} textAnchor="middle" fontSize="9" fill="#959daa">
            {p.label}
          </text>
        </g>
      ))}
      <text x={16} y={22} fontSize="10" fill="#eef1f4" fontFamily="JetBrains Mono Variable, monospace">
        LEVER {g.lever.toUpperCase()} · GEAR {(g.position * 100).toFixed(0)}% UP · DOORS {(g.doors * 100).toFixed(0)}%
      </text>
      <rect x={x0} y={84} width={span} height={3} rx="1.5" fill="rgba(255,255,255,0.08)" />
      <rect x={x0} y={84} width={span * g.position} height={3} rx="1.5" fill="#6fd3ef" />
      <text x={W - 16} y={98} textAnchor="end" fontSize="8.5" fill="#6b7480">
        {g.inTransit ? 'IN TRANSIT' : g.position < 0.01 ? 'DOWN & LOCKED' : g.position > 0.99 ? 'UP & LOCKED' : ''}
      </text>
    </Frame>
  );
}

function EngineSection() {
  const engines = useSim((s) => s.s.engines);
  return (
    <Frame title="Turbofan flow paths · live N1" h={128}>
      {/* nacelle outline */}
      <path d="M30 34 Q40 22 70 22 L200 24 Q228 26 240 40 M30 94 Q40 106 70 106 L200 104 Q228 102 240 88" fill="none" stroke="#959daa" strokeWidth="1.2" />
      <path d="M92 44 L210 48 Q230 52 262 64 Q230 76 210 80 L92 84 Z" fill="rgba(255,255,255,0.05)" stroke="#6b7480" />
      {/* fan */}
      <line x1="78" y1="28" x2="78" y2="100" stroke="#6fd3ef" strokeWidth="2" />
      <text x="78" y="118" textAnchor="middle" fontSize="8.5" fill="#959daa">fan</text>
      <text x="160" y="67" textAnchor="middle" fontSize="8.5" fill="#959daa">core · HP / IP / LP</text>
      {/* bypass flow arrows */}
      <path d="M40 36 H230" stroke="rgba(111,211,239,0.6)" strokeDasharray="4 5" />
      <path d="M40 92 H230" stroke="rgba(111,211,239,0.6)" strokeDasharray="4 5" />
      <text x="262" y="34" fontSize="8.5" fill="#6fd3ef">bypass</text>
      <text x="270" y="68" fontSize="8.5" fill="#ffb347">hot</text>
      {engines.map((e, i) => (
        <g key={i} transform={`translate(${246 + (i % 2) * 30}, ${82 + Math.floor(i / 2) * 20})`}>
          <text fontSize="8" fill="#6b7480" fontFamily="JetBrains Mono Variable, monospace">
            {i + 1}:{e.n1.toFixed(0)}
          </text>
        </g>
      ))}
    </Frame>
  );
}

function DoorMotion() {
  return (
    <Frame title="Plug-door kinematics (top view)" h={96}>
      <rect x="20" y="58" width="272" height="8" fill="rgba(255,255,255,0.08)" />
      <rect x="140" y="58" width="44" height="8" fill="#0b0d10" stroke="#6b7480" />
      <rect x="140" y="46" width="44" height="7" rx="2" fill="rgba(111,211,239,0.35)" />
      <rect x="86" y="34" width="44" height="7" rx="2" fill="#6fd3ef" />
      <path d="M162 46 V40 M160 38 L112 38" stroke="#eef1f4" strokeDasharray="3 3" />
      <text x="190" y="52" fontSize="8.5" fill="#959daa">1 · lift &amp; move outboard</text>
      <text x="20" y="30" fontSize="8.5" fill="#959daa">2 · translate forward</text>
      <text x="20" y="84" fontSize="8.5" fill="#6b7480">fuselage skin · forward ←</text>
    </Frame>
  );
}

function SurfaceGauge({ kind }: { kind: 'aileron' | 'elevator' | 'rudder' | 'spoiler' }) {
  const s = useSim((x) => x.s);
  const v = kind === 'aileron' ? s.controls.aileronR : kind === 'elevator' ? s.controls.elevator : kind === 'rudder' ? s.controls.rudder : s.spoilers.deployed;
  const max = kind === 'spoiler' ? 50 : 30;
  const a = (v / max) * 60;
  return (
    <Frame title={`${kind} deflection · live`} h={92}>
      <path d="M86 70 A70 70 0 0 1 226 70" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
      <line x1="156" y1="70" x2={156 + 66 * Math.sin((a * Math.PI) / 180)} y2={70 - 66 * Math.cos((a * Math.PI) / 180)} stroke="#6fd3ef" strokeWidth="2" strokeLinecap="round" />
      <circle cx="156" cy="70" r="3" fill="#eef1f4" />
      <text x="156" y="88" textAnchor="middle" fontSize="11" fill="#eef1f4" fontFamily="JetBrains Mono Variable, monospace">
        {v >= 0 ? '+' : ''}
        {v.toFixed(1)}°
      </text>
      <text x="80" y="88" fontSize="8" fill="#6b7480">{kind === 'spoiler' ? 'retracted' : kind === 'rudder' ? 'left' : 'TE up'}</text>
      <text x="232" y="88" textAnchor="end" fontSize="8" fill="#6b7480">{kind === 'spoiler' ? 'up 50°' : kind === 'rudder' ? 'right' : 'TE down'}</text>
    </Frame>
  );
}

export function PartDiagram({ partId }: { partId: string }) {
  switch (partId) {
    case 'slat':
    case 'droopNose':
    case 'flap':
    case 'flapTrackFairing':
      return <HighLiftChart />;
    case 'landingGear':
    case 'noseGear':
    case 'wingGear':
    case 'bodyGear':
    case 'gearDoor':
      return <GearSequence />;
    case 'engine':
    case 'engineFan':
    case 'engineCore':
    case 'engineInlet':
    case 'fanCowl':
    case 'thrustReverser':
      return <EngineSection />;
    case 'passengerDoor':
      return <DoorMotion />;
    case 'aileron':
      return <SurfaceGauge kind="aileron" />;
    case 'elevator':
      return <SurfaceGauge kind="elevator" />;
    case 'rudder':
      return <SurfaceGauge kind="rudder" />;
    case 'spoiler':
      return <SurfaceGauge kind="spoiler" />;
    default:
      return null;
  }
}
