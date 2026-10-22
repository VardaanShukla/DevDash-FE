import { useEffect, useRef, useState, type ReactNode } from "react";
import "./Splash.css";

// A funnel of fine, glowing threads turns slowly in the dark, each thread a ring of tiny
// points that drifts and wavers, and the name rises into view in the middle of it. The camera
// starts above the funnel and settles in front of it. Click or press any key to skip ahead.
//
// When this browser has to sign in, the sign-in panel slides in from the right and the name
// moves into the left half, the funnel following it. After signing in the panel slides back
// out, the name returns to the middle and lifts away, the threads draw tight into the centre,
// and the screen opens from that point onto the dashboard.

// Milliseconds from the start.
const FADE_IN_MS = 1800; // the funnel comes into view and the camera settles
const READY_AT = 1900; // the name is in: wait here for signing in, if needed
const LINGER_MS = 900; // how long the name stays when there's no signing in
const SPLIT_MS = 750; // the sign-in panel slides in or out
// Milliseconds from the start of the exit, once the panel is out.
const WIND_AT = 150; // the threads start drawing into the centre
const WIND_MS = 900;
const OPEN_AT = 850; // the screen opens from the centre
const OPEN_MS = 750;
const THREADS = 46;
const TILT = 1.12; // the camera looks down into the funnel
const START_TILT = 0.45; // and starts from further above
// Below this width the sign-in panel covers the lower part and the name sits above it.
const NARROW = 760;
const NAME = "DevDash";

type Phase = "intro" | "ready" | "holding" | "exit";

// The colours of the points, from the theme: [r, g, b] triples and how they blend.
type Palette = { dots: number[][]; blend: GlobalCompositeOperation; strength: number };

const PALETTES: Record<"light" | "dark", Palette> = {
  // Indigo and blue light on near black, the points adding up where threads cross.
  dark: { dots: [[88, 92, 236], [118, 128, 255], [150, 160, 255], [196, 204, 255]], blend: "lighter", strength: 1 },
  // Coffee ink on the latte page, a few teal.
  light: { dots: [[92, 60, 32], [120, 82, 48], [64, 42, 24], [11, 95, 89]], blend: "source-over", strength: 0.8 },
};

// One thread of the funnel: a wavering ring of points.
type Thread = {
  ring: number; // 0 at the narrow end of the funnel, 1 at the rim
  wobble: number; // how far it wavers, so threads cross and part
  phase: number;
  lean: number; // its plane tips a little, so the threads weave
  speed: number; // drift along the thread per millisecond
  color: number;
};

type Dot = {
  thread: Thread;
  a: number; // angle around the thread
  jitter: number; // a hair off the thread
  color: number;
  size: number;
  bokeh: boolean; // a few soft, out-of-focus points
};

const random = (min: number, max: number) => min + Math.random() * (max - min);
const easeInOutCubic = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const easeInCubic = (k: number) => k * k * k;
const clamp01 = (k: number) => Math.min(1, Math.max(0, k));

// Most threads crowd into a band part way up the funnel, the way the reference's light does.
function makeThreads(): Thread[] {
  return Array.from({ length: THREADS }, () => {
    const band = Math.random() < 0.75;
    return {
      ring: band ? 0.5 + (Math.random() + Math.random() - 1) * 0.22 : random(0.15, 1),
      wobble: random(0.02, 0.09),
      phase: random(0, Math.PI * 2),
      lean: random(-0.14, 0.14),
      speed: random(0.00005, 0.00012) * (Math.random() < 0.7 ? 1 : -0.5),
      color: Math.random() < 0.3 ? 2 : Math.random() < 0.5 ? 1 : 0,
    };
  });
}

function makeDots(width: number, height: number, threads: Thread[]): Dot[] {
  const count = Math.round(Math.min(9000, Math.max(4000, (width * height) / 140)));
  return Array.from({ length: count }, () => {
    const thread = threads[Math.floor(Math.random() * threads.length)];
    const bright = Math.random();
    return {
      thread,
      a: random(0, Math.PI * 2),
      jitter: (Math.random() - 0.5) * 0.014,
      color: bright > 0.95 ? 3 : Math.max(thread.color, bright > 0.7 ? 2 : 1),
      size: bright > 0.95 ? random(1.4, 2) : random(0.9, 1.4),
      bokeh: Math.random() < 0.012,
    };
  });
}

type Props = {
  // Whether to wait for signing in once the name is in: null while not known yet (it
  // waits), true to show the panel, false to carry on (after signing in, too).
  hold: boolean | null;
  // The sign-in form, shown in the panel on the right.
  panel?: ReactNode;
  onDone: () => void;
};

export default function Splash({ hold, panel, onDone }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [skipped, setSkipped] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const holdRef = useRef(hold);
  holdRef.current = hold;
  // The form stays in the panel while it slides back out after signing in.
  const kept = useRef(panel);
  if (panel) kept.current = panel;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const root = rootRef.current!;
    let finished = false;
    let frame = 0;
    const timers: number[] = [];

    // How far the panel is in, 0 to 1, and how far along the story is, in milliseconds.
    // The story pauses at READY_AT while waiting to sign in.
    let split = 0;
    let story = 0;
    // When the exit started (the panel then has to leave first) and when the name lifted.
    let exitAt = -1;
    let liftAt = -1;
    let phaseNow: Phase = "intro";
    const moveTo = (next: Phase) => {
      if (phaseNow === next) return;
      phaseNow = next;
      setPhase(next);
    };
    const setSplit = (value: number) => {
      split = value;
      root.style.setProperty("--split", String(easeInOutCubic(split)));
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      onDoneRef.current();
    };
    // Skipping jumps to the next resting point: the sign-in panel, or the dashboard.
    const skip = (event: Event) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      if (story < READY_AT) {
        story = READY_AT;
        setSkipped(true);
      } else if (holdRef.current === false && split === 0) finish();
    };
    window.addEventListener("keydown", skip);
    root.addEventListener("pointerdown", skip);

    let width = 0;
    let height = 0;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const threads = makeThreads();
    const dots = makeDots(width, height, threads);

    // Where the funnel sits and how big it is: centred, or beside (or above) the panel.
    const place = () => {
      const along = easeInOutCubic(split);
      const narrow = width < NARROW;
      const cx = narrow ? width / 2 : width / 2 - (width / 4) * along;
      const cy = narrow ? height / 2 - height * 0.3 * along : height / 2 + height * 0.02;
      const radius = Math.max(width * 0.5, height * 0.8) * (1 - 0.25 * along);
      return { cx, cy, radius };
    };

    // The whole picture at a moment. `intro` (0 to 1) brings the camera down from above,
    // `wind` (0 to 1) draws every thread into the centre.
    let turn = 0;
    const draw = (intro: number, wind: number) => {
      const theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
      const palette = PALETTES[theme];
      const fills = palette.dots.map(([r, g, b]) => `rgb(${r}, ${g}, ${b})`);
      const { cx, cy: restY } = place();
      const settle = easeInOutCubic(intro);
      const tilt = START_TILT + (TILT - START_TILT) * settle;
      // Seen from above at first, the funnel sits low on the screen.
      const cy = restY + height * 0.22 * (1 - settle);
      const pull = easeInCubic(wind);
      const R = place().radius * (0.8 + 0.2 * settle) * (1 - 0.96 * pull);
      const fade = clamp01(intro * 1.6);
      const camera = 2.6;
      const cosT = Math.cos(tilt);
      const sinT = Math.sin(tilt);
      // Where a point on a thread lands on the screen, and how sharp it is there.
      const project = (thread: Thread, angle: number, jitter: number) => {
        // The thread wavers in and out and up and down as the waves travel round it.
        const wave = Math.sin(angle * 3 + thread.phase + turn * 0.0005);
        const r = (0.16 + 0.84 * thread.ring) * (1 + thread.wobble * wave) + jitter;
        const x = Math.cos(angle) * r;
        const z = Math.sin(angle) * r;
        // A funnel: the narrow end sinks away below the rim.
        const y =
          -0.55 * (1 - thread.ring) ** 1.6 + thread.lean * Math.sin(angle) * r +
          thread.wobble * 0.4 * Math.cos(angle * 2 + thread.phase + turn * 0.0003);
        const ty = y * cosT - z * sinT;
        const tz = y * sinT + z * cosT;
        const depth = camera / (camera + tz);
        // In focus around the middle distance; nearer and farther points fade off.
        const focus = 1 / (1 + Math.abs(tz) * 1.8);
        return { x: cx + x * R * depth, y: cy - ty * R * depth, depth, focus };
      };
      const spinOf = (thread: Thread) => thread.speed * turn * (1 + 6 * pull);
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = palette.blend;

      // Each thread as a hairline, so the points read as strung along it.
      ctx.lineWidth = 0.6;
      for (const thread of threads) {
        const spin = spinOf(thread);
        ctx.strokeStyle = fills[thread.color];
        ctx.globalAlpha = Math.min(1, palette.strength * fade * 0.16 * (1 + wind));
        ctx.beginPath();
        for (let i = 0; i <= 120; i++) {
          const point = project(thread, spin + (i / 120) * Math.PI * 2, 0);
          if (i === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        }
        ctx.stroke();
      }

      for (const dot of dots) {
        const point = project(dot.thread, dot.a + spinOf(dot.thread), dot.jitter);
        if (point.x < -30 || point.x > width + 30 || point.y < -30 || point.y > height + 30) continue;
        const alpha = palette.strength * fade * (0.25 + 0.75 * point.focus) * (1 + wind);
        ctx.fillStyle = fills[dot.color];
        if (dot.bokeh) {
          ctx.globalAlpha = Math.min(1, alpha * 0.12);
          ctx.beginPath();
          ctx.arc(point.x, point.y, (2 + 7 * (1 - point.focus)) * point.depth, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.globalAlpha = Math.min(1, alpha);
          const size = dot.size * point.depth;
          ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size);
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      if (wind > 0) {
        // The point everything draws into glows as it fills.
        const [r, g, b] = palette.dots[theme === "light" ? 3 : 2];
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 40 + 160 * wind);
        glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.55 * pull})`);
        glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, width, height);
      }
      return { cx, cy };
    };

    const cleanup = () => {
      finished = true;
      cancelAnimationFrame(frame);
      timers.forEach(clearTimeout);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("resize", resize);
      root.removeEventListener("pointerdown", skip);
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // No motion: a still funnel, the panel simply there until signed in, then a quick fade.
      turn = 4000;
      draw(1, 0);
      const check = () => {
        if (finished) return;
        story = READY_AT;
        if (holdRef.current === true) {
          setSplit(1);
          draw(1, 0);
          moveTo("holding");
        } else if (holdRef.current === false) {
          setSplit(0);
          moveTo("exit");
          timers.push(window.setTimeout(finish, 400));
          return;
        }
        timers.push(window.setTimeout(check, 100));
      };
      check();
      return cleanup;
    }

    // A head start, so the threads are already wavering when they come into view.
    turn = 3000;
    let last = performance.now();

    const tick = (now: number) => {
      if (finished) return;
      const dt = Math.min(now - last, 32);
      last = now;
      const hold = holdRef.current;

      // The panel slides towards where it should be.
      const wantSplit = story >= READY_AT && hold === true && exitAt < 0 ? 1 : 0;
      if (split !== wantSplit) {
        setSplit(wantSplit > split ? Math.min(1, split + dt / SPLIT_MS) : Math.max(0, split - dt / SPLIT_MS));
      }
      // The story waits at READY_AT until it's known whether to sign in, and while signing in.
      if (story < READY_AT || hold === false) story += dt;
      if (exitAt < 0 && hold === false && story >= READY_AT + (split > 0 ? 0 : LINGER_MS)) exitAt = now;
      // The name lifts once the panel is out of the way.
      if (exitAt >= 0 && liftAt < 0 && split === 0) {
        liftAt = now;
        moveTo("exit");
      }
      if (exitAt < 0) moveTo(story < READY_AT ? "intro" : split === 1 ? "holding" : "ready");

      const intro = clamp01(story / FADE_IN_MS);
      const out = liftAt >= 0 ? now - liftAt : 0;
      const wind = clamp01((out - WIND_AT) / WIND_MS);
      turn += dt;
      const { cx, cy } = draw(intro, wind);

      // The screen opens from the centre onto the dashboard underneath.
      const open = clamp01((out - OPEN_AT) / OPEN_MS);
      if (open > 0) {
        const hole = easeInCubic(open) * Math.hypot(width, height);
        const mask = `radial-gradient(circle at ${cx}px ${cy}px, transparent ${hole}px, #000 ${hole + 80}px)`;
        root.style.setProperty("mask-image", mask);
        root.style.setProperty("-webkit-mask-image", mask);
      }
      if (open >= 1) {
        finish();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return cleanup;
  }, []);

  // The form takes the keyboard once the panel is in.
  useEffect(() => {
    if (phase === "holding") panelRef.current?.querySelector("input")?.focus();
  }, [phase]);

  return (
    <div ref={rootRef} className={`splash splash--${phase}${skipped ? " splash--skipped" : ""}`}>
      <canvas ref={canvasRef} className="splash__canvas" aria-hidden="true" />
      <div className="splash__title">
        <h1 className="splash__name" aria-label={NAME}>
          {[...NAME].map((letter, i) => (
            <span
              key={i}
              className={`splash__letter${i >= 3 ? " splash__letter--dash" : ""}`}
              style={{ "--i": i } as React.CSSProperties}
              aria-hidden="true"
            >
              {letter}
            </span>
          ))}
        </h1>
        <span className="splash__rule" aria-hidden="true" />
        <p className="splash__tagline">Every project, change and plan in one place</p>
      </div>
      <p className="splash__hint">Click or press any key to skip</p>
      {kept.current && (
        <div ref={panelRef} className="splash__panel" inert={phase !== "holding" ? true : undefined}>
          {kept.current}
        </div>
      )}
    </div>
  );
}
