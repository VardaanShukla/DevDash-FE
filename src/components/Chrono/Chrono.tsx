import { useEffect, useRef } from "react";
import "./Chrono.css";

// An analog chronograph in the splash's light: a dark face, white hour and minute hands, and
// the brand's orange for the sweeping seconds hand. Two subdials, running seconds at nine and
// the hour of the day (24) at three, and the date in a window at six. The hands are moved
// straight on the SVG each frame, so the clock never re-renders React; with reduced motion
// they step once a second.

const C = 100;

function Ticks({ cx = C, cy = C, count, inner, outer, every, longer, className }: {
  cx?: number; cy?: number; count: number; inner: number; outer: number; every?: number; longer?: number; className: string;
}) {
  return (
    <g className={className}>
      {Array.from({ length: count }, (_, i) => {
        const big = every !== undefined && i % every === 0;
        const rad = ((i * 360) / count - 90) * (Math.PI / 180);
        const r1 = big && longer ? longer : inner;
        return (
          <line
            key={i}
            x1={cx + r1 * Math.cos(rad)}
            y1={cy + r1 * Math.sin(rad)}
            x2={cx + outer * Math.cos(rad)}
            y2={cy + outer * Math.sin(rad)}
            className={big ? "is-big" : undefined}
          />
        );
      })}
    </g>
  );
}

export default function Chrono({ size = 112 }: { size?: number }) {
  const hour = useRef<SVGGElement>(null);
  const minute = useRef<SVGGElement>(null);
  const second = useRef<SVGGElement>(null);
  const small = useRef<SVGGElement>(null);
  const day = useRef<SVGGElement>(null);
  const date = useRef<SVGTextElement>(null);

  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let timer = 0;
    const turn = (el: SVGGElement | null, angle: number, cx = C, cy = C) =>
      el?.setAttribute("transform", `rotate(${angle} ${cx} ${cy})`);
    const draw = () => {
      const now = new Date();
      const s = now.getSeconds() + (still ? 0 : now.getMilliseconds() / 1000);
      const m = now.getMinutes() + s / 60;
      const h = (now.getHours() % 12) + m / 60;
      turn(hour.current, h * 30);
      turn(minute.current, m * 6);
      turn(second.current, s * 6);
      turn(small.current, s * 6, 62, 100);
      turn(day.current, (now.getHours() + m / 60) * 15, 138, 100);
      if (date.current) date.current.textContent = String(now.getDate());
    };
    draw();
    if (still) timer = window.setInterval(draw, 1000);
    else {
      const loop = () => {
        draw();
        frame = requestAnimationFrame(loop);
      };
      frame = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
    };
  }, []);

  const label = new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return (
    <svg className="chrono" width={size} height={size} viewBox="0 0 200 200" role="img" aria-label={`Clock, ${label}`}>
      <defs>
        <radialGradient id="chrono-face" cx="50%" cy="38%" r="70%">
          <stop offset="0" className="chrono__face-top" />
          <stop offset="1" className="chrono__face-bottom" />
        </radialGradient>
        <filter id="chrono-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
      </defs>

      <circle cx={C} cy={C} r={97} className="chrono__bezel" />
      <circle cx={C} cy={C} r={89} fill="url(#chrono-face)" className="chrono__face" />
      <Ticks count={60} inner={82} outer={86} every={5} longer={74} className="chrono__ticks" />

      {/* Subdials: running seconds at nine, the hour of the day at three. */}
      <circle cx={62} cy={100} r={19} className="chrono__sub" />
      <Ticks cx={62} cy={100} count={12} inner={15} outer={18} every={3} longer={12} className="chrono__subticks" />
      <circle cx={138} cy={100} r={19} className="chrono__sub" />
      <Ticks cx={138} cy={100} count={24} inner={16} outer={18} every={6} longer={12} className="chrono__subticks" />

      {/* The date, in a window at six. */}
      <rect x={88} y={136} width={24} height={17} rx={3} className="chrono__window" />
      <text ref={date} x={100} y={148.5} className="chrono__date" textAnchor="middle" />
      <text x={100} y={64} className="chrono__mark" textAnchor="middle">LOOMA</text>

      <g ref={small} className="chrono__subhand">
        <line x1={62} y1={104} x2={62} y2={84} />
      </g>
      <g ref={day} className="chrono__subhand">
        <line x1={138} y1={104} x2={138} y2={84} />
      </g>

      <g ref={hour} className="chrono__hand chrono__hand--hour">
        <path d={`M ${C - 3.5} ${C + 10} L ${C - 2.6} ${C - 46} L ${C} ${C - 50} L ${C + 2.6} ${C - 46} L ${C + 3.5} ${C + 10} Z`} />
      </g>
      <g ref={minute} className="chrono__hand chrono__hand--minute">
        <path d={`M ${C - 2.6} ${C + 12} L ${C - 1.8} ${C - 72} L ${C} ${C - 76} L ${C + 1.8} ${C - 72} L ${C + 2.6} ${C + 12} Z`} />
      </g>
      <g ref={second} className="chrono__hand chrono__hand--second">
        <line x1={C} y1={C + 22} x2={C} y2={C - 84} className="chrono__second-glow" filter="url(#chrono-glow)" />
        <line x1={C} y1={C + 22} x2={C} y2={C - 84} />
        <circle cx={C} cy={C + 18} r={3.5} />
      </g>
      <circle cx={C} cy={C} r={5} className="chrono__cap" />
      <circle cx={C} cy={C} r={2} className="chrono__pin" />
    </svg>
  );
}
