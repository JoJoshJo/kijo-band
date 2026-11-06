"use client";

// Decorative scrolling pulse line (demo animation — NOT an ECG). One beat per cycle; speed follows HR.
const BEAT_W = 60;
const BEATS = 8; // enough to cover a tile + one cycle of scroll

const beat = (x: number) =>
  `L${x + 14} 20 Q${x + 17} 16 ${x + 20} 20 L${x + 26} 20 L${x + 29} 23 L${x + 32} 4 L${x + 35} 28 ` +
  `L${x + 38} 20 L${x + 44} 20 Q${x + 48} 15 ${x + 52} 20 L${x + 60} 20`;

const PATH = "M0 20 " + Array.from({ length: BEATS }, (_, i) => beat(i * BEAT_W)).join(" ");

export default function PulseLine({
  heartRate,
  color,
  height = 32,
}: {
  heartRate: number;
  color: string;
  height?: number;
}) {
  const hr = Math.min(220, Math.max(30, heartRate || 60));
  return (
    <div className="w-full overflow-hidden" style={{ height }} aria-hidden>
      <svg
        width={BEAT_W * BEATS}
        height={height}
        viewBox={`0 0 ${BEAT_W * BEATS} 32`}
        preserveAspectRatio="none"
        className="kijo-pulse-scroll"
        style={{ animationDuration: `${60 / hr}s`, ["--kijo-beat" as string]: `-${BEAT_W}px` }}
      >
        <path
          d={PATH}
          fill="none"
          style={{ stroke: color }}
          strokeWidth={height > 32 ? 2.5 : 1.75}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          opacity={0.9}
        />
      </svg>
    </div>
  );
}
