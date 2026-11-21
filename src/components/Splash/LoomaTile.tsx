import { useId } from "react";

// The Looma mark, the way the reference video ends: a dark glass tile with crimson light
// pooling in it and an "L" drawn in light, beside a code tag. Each stroke of the L is a
// spindle like the splash's slash, white-hot at its heart with a salmon glow and a crimson
// haze. Both start from the corner where the tile's seam begins, one standing up and one
// lying along, either side of the slash's lean, so the slash can split into them. The
// tile's parts are classed so the splash can animate them; elsewhere it sits still.

export const TILE_BOX = 996;
// Where the seam's middle sits in the tile, as a fraction of its width and height.
export const SEAM = { x: (453 - 128) / TILE_BOX, y: (787 - 128) / TILE_BOX };
export const CORNER = { x: 332, y: 882 };
const STAND_TIP = { x: 470, y: 330 };
const FLAT_TIP = { x: 900, y: 800 };

type Props = {
  className?: string;
  // How heavy the strokes are; small tiles need them heavier to read.
  weight?: number;
};

type Point = { x: number; y: number };

// A spindle from `a` to `b`: `start` thick at `a`, swelling to `swell` a third of the way
// along, and drawn to a point at `b`, with a round end at `a`.
function spindle(a: Point, b: Point, start: number, swell: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len;
  const ny = dx / len;
  const m = { x: a.x + dx * 0.35, y: a.y + dy * 0.35 };
  const f = (n: number) => n.toFixed(1);
  return [
    `M${f(a.x + nx * start)} ${f(a.y + ny * start)}`,
    `Q${f(m.x + nx * swell * 1.5)} ${f(m.y + ny * swell * 1.5)} ${f(b.x)} ${f(b.y)}`,
    `Q${f(m.x - nx * swell * 1.5)} ${f(m.y - ny * swell * 1.5)} ${f(a.x - nx * start)} ${f(a.y - ny * start)}`,
    `A${start} ${start} 0 0 0 ${f(a.x + nx * start)} ${f(a.y + ny * start)}Z`,
  ].join("");
}

export function LightTile({ className = "", weight = 1 }: Props) {
  const id = useId().replace(/:/g, "");
  const ref = (name: string) => `${name}-${id}`;
  const url = (name: string) => `url(#${ref(name)})`;
  const stroke = (name: string, tip: Point) => (
    <g className={`tile__${name}`}>
      <path d={spindle(CORNER, tip, 36 * weight, 40 * weight)} fill="#c8323e" opacity="0.5" filter={url("haze")} />
      <path d={spindle(CORNER, tip, 21 * weight, 23 * weight)} fill="#ff8f78" opacity="0.75" filter={url("soft")} />
      <path d={spindle(CORNER, tip, 13 * weight, 13 * weight)} fill={url(`${name}Core`)} />
    </g>
  );
  return (
    <svg className={`tile tile--light ${className}`} viewBox="128 128 996 996" role="img" aria-label="Looma">
      <defs>
        <radialGradient id={ref("glow")} cx="0.42" cy="0.66" r="0.62">
          <stop offset="0" stopColor="#b5303c" stopOpacity="0.4" />
          <stop offset="0.6" stopColor="#5a1622" stopOpacity="0.16" />
          <stop offset="1" stopColor="#5a1622" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={ref("sheen")} cx="0.12" cy="0.06" r="0.55">
          <stop offset="0" stopColor="#ffd2b8" stopOpacity="0.1" />
          <stop offset="1" stopColor="#ffd2b8" stopOpacity="0" />
        </radialGradient>
        {[
          ["standCore", STAND_TIP],
          ["flatCore", FLAT_TIP],
        ].map(([name, tip]) => (
          <linearGradient key={name as string} id={ref(name as string)} gradientUnits="userSpaceOnUse" x1={CORNER.x} y1={CORNER.y} x2={(tip as Point).x} y2={(tip as Point).y}>
            <stop offset="0" stopColor="#fffaf4" />
            <stop offset="0.55" stopColor="#ffe0cc" />
            <stop offset="1" stopColor="#ff9a82" stopOpacity="0.4" />
          </linearGradient>
        ))}
        <radialGradient id={ref("spark")}>
          <stop offset="0" stopColor="#fffaf4" stopOpacity="0.95" />
          <stop offset="0.35" stopColor="#ffb08c" stopOpacity="0.5" />
          <stop offset="1" stopColor="#d6404a" stopOpacity="0" />
        </radialGradient>
        <filter id={ref("haze")} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="26" />
        </filter>
        <filter id={ref("soft")} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      <g className="tile__body">
        <rect x="128" y="128" width="996" height="996" rx="290" fill="#0d0709" fillOpacity="0.86" />
        <rect x="128" y="128" width="996" height="996" rx="290" fill={url("glow")} />
        <rect x="128" y="128" width="996" height="996" rx="290" fill={url("sheen")} />
        <rect x="129.5" y="129.5" width="993" height="993" rx="288.5" fill="none" stroke="#ffd2b8" strokeOpacity="0.24" strokeWidth="3" />
      </g>
      {stroke("stand", STAND_TIP)}
      {stroke("flat", FLAT_TIP)}
      {/* Where the two strokes meet, the hottest point. */}
      <circle className="tile__spark" cx={CORNER.x} cy={CORNER.y} r="70" fill={url("spark")} />
      <g className="tile__code" fill="none" stroke="#ffc9a8" strokeWidth={22 * Math.min(weight, 1.6)} strokeLinecap="round" strokeLinejoin="round">
        <path d="M768 464 L720 508 L763 548" pathLength={1} />
        <path d="M851 443 L797 574" pathLength={1} />
        <path d="M880 466 L922 506 L878 546" pathLength={1} />
      </g>
    </svg>
  );
}
