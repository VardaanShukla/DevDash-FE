import { useEffect, useRef, useState, type ReactNode } from "react";
import "./Splash.css";

// Code symbols spiral in from all over the screen and lock into a spinning globe, a
// glowing lattice like a newly made element. The globe squeezes into a bright star, then
// bursts outward as the logo pops in. Click or press any key to skip.
//
// When this browser has to sign in, the story pauses once the globe has formed: the screen
// splits, the sign-in panel slides in from the right and the globe moves into the dark left
// half, still turning. After signing in the panel slides back out, the globe returns to the
// middle, and the squeeze and the bang carry on into the dashboard.

const GLYPHS = [
  "</>", "{ }", "( )", "[ ]", "=>", ";", "&&", "||", "===", "!=", "+=", "++",
  "0", "1", "#", "$", "//", "/*", "<>", "fn", "if", "def", "const", "%", "*", "?", ":", "@",
];

// Milliseconds from the start.
const GATHER_MS = 1500; // symbols reach the globe
const HOLD_AT = 1900; // the globe has formed: wait here for signing in, if needed
const SPLIT_MS = 750; // the sign-in panel slides in or out
const SQUEEZE_AT = 2400; // globe starts squeezing into a star
const BANG_AT = 2850; // star bursts, logo appears
const BURST_MS = 1200; // burst fades out
const LEAVE_AT = 4500; // splash starts fading
const DONE_AT = 4900;
const MAX_DELAY = 450; // symbols set off at slightly different times
const SWIRL = Math.PI * 1.6; // how far each symbol turns around the centre on its way in
const NODES = 110; // symbols joined by the lattice lines
const LINKS_PER_NODE = 3;
const TILT = 0.42; // globe leans towards the viewer
const BLUE_RGB = "79, 195, 247";
// The splash is always night sky, whatever the dashboard's theme.
const INK = "#f1f5f9";
const MUTED = "#64748b";
// Below this width the sign-in panel covers the lower part and the globe sits above it.
const NARROW = 760;

type Phase = "gather" | "holding" | "bang" | "leaving";

type Particle = {
  glyph: string;
  color: string;
  size: number;
  // Start, in polar coordinates around the centre.
  r0: number;
  a0: number;
  // Place on the globe, as a point on the unit sphere.
  ux: number;
  uy: number;
  uz: number;
  turn: number;
  delay: number;
  spin: number;
  // Where it was drawn last, and how far towards the viewer (-1 to 1).
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
};

const random = (min: number, max: number) => min + Math.random() * (max - min);
const easeInOutCubic = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const easeOutCubic = (k: number) => 1 - (1 - k) ** 3;
const clamp01 = (k: number) => Math.min(1, Math.max(0, k));

function makeParticles(width: number, height: number, colors: string[]): Particle[] {
  const count = Math.round(Math.min(480, Math.max(260, (width * height) / 3500)));
  const reach = Math.hypot(width, height) / 2;
  // Spread evenly over the sphere (a Fibonacci lattice).
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, i) => {
    const uy = 1 - (2 * (i + 0.5)) / count;
    const ring = Math.sqrt(1 - uy * uy);
    return {
    ux: Math.cos(golden * i) * ring,
    uy,
    uz: Math.sin(golden * i) * ring,
    glyph: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
    color: colors[Math.floor(Math.random() * colors.length)],
    size: random(7, 13),
    // Anywhere from the middle of the screen to just past its corners.
    r0: reach * random(0.3, 1.15),
    a0: random(0, Math.PI * 2),
    turn: SWIRL * random(0.8, 1.2),
    delay: random(0, MAX_DELAY),
    spin: random(-4, 4),
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    rot: 0,
    vr: 0,
    };
  });
}

// Each lattice node joins its nearest neighbours on the sphere.
function makeLinks(particles: Particle[]): [Particle, Particle][] {
  // Nodes are spread through the list, so they cover the whole sphere.
  const step = Math.max(1, Math.floor(particles.length / NODES));
  const nodes = particles.filter((_, i) => i % step === 0);
  const seen = new Set<string>();
  const links: [Particle, Particle][] = [];
  nodes.forEach((a, i) => {
    nodes
      .map((b, j) => ({ j, dot: a.ux * b.ux + a.uy * b.uy + a.uz * b.uz }))
      .filter(({ j }) => j !== i)
      .sort((m, n) => n.dot - m.dot)
      .slice(0, LINKS_PER_NODE)
      .forEach(({ j }) => {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (!seen.has(key)) {
          seen.add(key);
          links.push([a, nodes[j]]);
        }
      });
  });
  return links;
}

type Props = {
  // Whether to wait for signing in once the globe has formed: null while not known yet
  // (it waits), true to show the panel, false to carry on (after signing in, too).
  hold: boolean | null;
  // The sign-in form, shown in the panel on the right.
  panel?: ReactNode;
  onDone: () => void;
};

export default function Splash({ hold, panel, onDone }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("gather");
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
    let finished = false;
    let frame = 0;
    const timers: number[] = [];

    const root = rootRef.current!;
    // How far the panel is in, 0 to 1, and how far along the story is, in milliseconds.
    // The story pauses at HOLD_AT while waiting to sign in and while the panel moves.
    let split = 0;
    let story = 0;
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
      if (holdRef.current === false && split === 0) finish();
      else if (story < HOLD_AT) {
        story = HOLD_AT;
        if (holdRef.current) setSplit(1);
      }
    };
    window.addEventListener("keydown", skip);
    root.addEventListener("pointerdown", skip);
    const cleanup = () => {
      finished = true;
      cancelAnimationFrame(frame);
      timers.forEach(clearTimeout);
      window.removeEventListener("keydown", skip);
      root.removeEventListener("pointerdown", skip);
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // No motion: the panel is simply there until signed in, then the logo, then the dashboard.
      let waited = false;
      const check = () => {
        if (finished) return;
        if (holdRef.current === true) {
          waited = true;
          setSplit(1);
          setPhase("holding");
        } else if (holdRef.current === false) {
          setSplit(0);
          setPhase("bang");
          timers.push(window.setTimeout(() => setPhase("leaving"), waited ? 500 : 900));
          timers.push(window.setTimeout(finish, waited ? 900 : 1300));
          return;
        }
        timers.push(window.setTimeout(check, 100));
      };
      check();
      return cleanup;
    }

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

    const blue = getComputedStyle(document.documentElement).getPropertyValue("--dd-blue").trim();
    // No red here: red is kept for the logo's </>.
    const particles = makeParticles(width, height, [blue, blue, INK, MUTED]);

    const links = makeLinks(particles);

    // Rotates a point on the unit sphere and projects it, with a little perspective.
    const project = (ux: number, uy: number, uz: number, spin: number, radius: number, cx: number, cy: number) => {
      const x1 = ux * Math.cos(spin) - uz * Math.sin(spin);
      const z1 = ux * Math.sin(spin) + uz * Math.cos(spin);
      const y2 = uy * Math.cos(TILT) - z1 * Math.sin(TILT);
      const z2 = uy * Math.sin(TILT) + z1 * Math.cos(TILT);
      const depth = 1 / (1 - z2 * 0.3);
      return { x: cx + x1 * radius * depth, y: cy + y2 * radius * depth, z: z2, depth };
    };

    // An orbit ring around the globe: a circle on a tilted plane, sampled and projected.
    const orbit = (
      cx: number, cy: number, radius: number, spin: number, lean: number, alpha: number, width: number,
    ) => {
      ctx.save();
      ctx.strokeStyle = `rgba(${BLUE_RGB}, ${alpha})`;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let i = 0; i <= 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        const point = project(Math.cos(a), Math.sin(a) * Math.sin(lean), Math.sin(a) * Math.cos(lean), spin, radius, cx, cy);
        if (i === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
      ctx.restore();
    };

    const lattice = (alpha: number) => {
      // A wide faint stroke under a thin bright one reads as a glow, without costly blur.
      for (const [width, strength] of [[5, 0.15], [1.2, 0.85]] as const) {
        ctx.save();
        ctx.lineWidth = width;
        for (const front of [false, true]) {
          ctx.strokeStyle = `rgba(${BLUE_RGB}, ${alpha * strength * (front ? 1 : 0.4)})`;
          ctx.beginPath();
          for (const [a, b] of links) {
            if (a.z + b.z > 0 !== front) continue;
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
          }
          ctx.stroke();
        }
        ctx.restore();
      }
    };

    // The glowing triangle at the heart of the element.
    const core = (cx: number, cy: number, size: number, rotation: number, alpha: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);
      for (const [width, strength] of [[8, 0.18], [2, 0.9]] as const) {
        ctx.strokeStyle = `rgba(${BLUE_RGB}, ${alpha * strength})`;
        ctx.lineWidth = width;
        ctx.lineJoin = "round";
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
          if (i === 0) ctx.moveTo(Math.cos(a) * size, Math.sin(a) * size);
          else ctx.lineTo(Math.cos(a) * size, Math.sin(a) * size);
        }
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    };

    // Each symbol and colour is drawn once to a small image and then stamped, which is far
    // cheaper than laying out hundreds of strings of text every frame.
    const SPRITE_SIZE = 40;
    const sprites = new Map<string, HTMLCanvasElement>();
    const sprite = (glyph: string, fill: string) => {
      const key = `${glyph}|${fill}`;
      let image = sprites.get(key);
      if (!image) {
        image = document.createElement("canvas");
        const scale = Math.min(2, window.devicePixelRatio || 1);
        const font = `700 ${SPRITE_SIZE}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
        ctx.font = font;
        const textWidth = Math.ceil(ctx.measureText(glyph).width) + 8;
        image.width = textWidth * scale;
        image.height = SPRITE_SIZE * 1.4 * scale;
        const sctx = image.getContext("2d")!;
        sctx.scale(scale, scale);
        sctx.font = font;
        sctx.fillStyle = fill;
        sctx.textAlign = "center";
        sctx.textBaseline = "middle";
        sctx.fillText(glyph, textWidth / 2, SPRITE_SIZE * 0.7);
        sprites.set(key, image);
      }
      return image;
    };

    const drawGlyph = (p: Particle, x: number, y: number, rot: number, alpha: number, size = p.size) => {
      const image = sprite(p.glyph, p.color);
      const scale = size / SPRITE_SIZE / Math.min(2, window.devicePixelRatio || 1);
      const w = image.width * scale;
      const h = image.height * scale;
      const dpr = window.devicePixelRatio || 1;
      ctx.globalAlpha = alpha;
      ctx.setTransform(dpr * Math.cos(rot), dpr * Math.sin(rot), -dpr * Math.sin(rot), dpr * Math.cos(rot), dpr * x, dpr * y);
      ctx.drawImage(image, -w / 2, -h / 2, w, h);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1;
    };

    const glow = (cx: number, cy: number, radius: number, alpha: number, hot = 0) => {
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      // A white-hot centre, so the star reads as bright even on the light background.
      if (hot > 0) gradient.addColorStop(0, `rgba(255, 255, 255, ${hot})`);
      gradient.addColorStop(hot > 0 ? 0.18 : 0, `rgba(${BLUE_RGB}, ${alpha})`);
      gradient.addColorStop(1, `rgba(${BLUE_RGB}, 0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    };

    // Eight tapered rays, long on the axes and short on the diagonals.
    const rays = (cx: number, cy: number, length: number, width: number, alpha: number, rotation: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);
      for (let i = 0; i < 8; i++) {
        const ray = i % 2 === 0 ? length : length * 0.5;
        const gradient = ctx.createLinearGradient(0, 0, ray, 0);
        gradient.addColorStop(0, `rgba(${BLUE_RGB}, ${alpha})`);
        gradient.addColorStop(1, `rgba(${BLUE_RGB}, 0)`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(0, -width);
        ctx.lineTo(ray, 0);
        ctx.lineTo(0, width);
        ctx.closePath();
        ctx.fill();
        ctx.rotate(Math.PI / 4);
      }
      ctx.restore();
    };

    const start = performance.now();
    let last = start;
    let phaseRef: Phase = "gather";
    // Whether the sign-in panel came in, this time.
    let held = false;
    let banged = false;
    let left = false;

    const tick = (now: number) => {
      if (finished) return;
      const dt = Math.min(now - last, 32);
      last = now;

      // The panel slides towards where it should be; the story waits at HOLD_AT for it.
      const wantSplit = story >= HOLD_AT && holdRef.current === true ? 1 : 0;
      if (split !== wantSplit) {
        setSplit(wantSplit > split ? Math.min(1, split + dt / SPLIT_MS) : Math.max(0, split - dt / SPLIT_MS));
      }
      const waiting = holdRef.current !== false || split > 0;
      if (waiting && split > 0) held = true;
      // Straight into the squeeze once the panel is out: the globe has turned long enough.
      if (!waiting && held && story < SQUEEZE_AT - 100) story = SQUEEZE_AT - 100;
      if (story < HOLD_AT || !waiting) story = waiting ? Math.min(HOLD_AT, story + dt) : story + dt;
      const holding = story >= HOLD_AT && split === 1;
      if (holding !== (phaseRef === "holding") && story < BANG_AT) {
        phaseRef = holding ? "holding" : "gather";
        setPhase(phaseRef);
      }

      // The real clock keeps the globe turning while the story waits.
      const clock = now - start;
      const t = story;
      const along = easeInOutCubic(split);
      const narrow = width < NARROW;
      const globeRadius = Math.min(220, Math.max(100, Math.min(width, height) * 0.27));
      // Centred, or in the middle of the dark part beside (or above) the panel.
      const cx = narrow ? width / 2 : width / 2 - (width / 4) * along;
      const cy = narrow ? height / 2 - (height / 2 - height * 0.18) * along : height / 2;
      const fitted = narrow ? Math.min(globeRadius, height * 0.1) : Math.min(globeRadius, (width / 4) * 0.62);
      const sized = globeRadius + (fitted - globeRadius) * along;
      ctx.clearRect(0, 0, width, height);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      if (t < BANG_AT) {
        // Lattice fades in as the symbols lock into place; the squeeze then crushes the globe.
        const formed = clamp01((t - GATHER_MS * 0.8) / 600);
        const squeeze = clamp01((t - SQUEEZE_AT) / (BANG_AT - SQUEEZE_AT));
        const pressed = easeInOutCubic(squeeze);
        const twinkle = 1 + 0.12 * Math.sin(clock / 35);
        // Spins steadily, then faster and faster while it is squeezed.
        const spin = clock * 0.0011 + pressed * pressed * 4;
        const radius = sized * (1 - 0.97 * pressed);
        const wire = formed * (1 - pressed);

        glow(cx, cy, radius * 1.5 + 40 + pressed * 90 * twinkle, 0.12 + formed * 0.12 + pressed * 0.5, formed * 0.5);
        for (const p of particles) {
          const k = easeInOutCubic(clamp01((t - p.delay) / (GATHER_MS - p.delay)));
          const target = project(p.ux, p.uy, p.uz, spin, radius, cx, cy);
          // Spiral in: the radius shrinks while the angle turns onto the symbol's globe spot.
          const tr = Math.hypot(target.x - cx, target.y - cy);
          const ta = Math.atan2(target.y - cy, target.x - cx);
          const r = p.r0 + (tr - p.r0) * k;
          const a = ta - p.turn * (1 - k);
          p.x = cx + Math.cos(a) * r;
          p.y = cy + Math.sin(a) * r;
          p.z = target.z * k;
          p.rot = p.spin * (1 - k);
        }
        if (wire > 0) {
          orbit(cx, cy, radius * 1.3, spin * 1.8, 1.25, 0.15 * wire, 6);
          orbit(cx, cy, radius * 1.3, spin * 1.8, 1.25, 0.7 * wire, 1.6);
          orbit(cx, cy, radius * 1.18, -spin * 1.4 + 1, 0.5, 0.15 * wire, 5);
          orbit(cx, cy, radius * 1.18, -spin * 1.4 + 1, 0.5, 0.6 * wire, 1.2);
          orbit(cx, cy, radius, spin, Math.PI / 2, 0.35 * wire, 1);
          lattice(wire);
          core(cx, cy, radius * 0.38, -spin * 0.8, wire);
        }
        // Back of the globe first, so nearer symbols cover farther ones.
        particles.sort((m, n) => m.z - n.z);
        for (const p of particles) {
          const k = clamp01((t - p.delay) / (GATHER_MS - p.delay));
          const near = 0.15 + 0.85 * ((p.z + 1) / 2);
          const alpha = Math.min(1, 0.15 + k * 5) * (1 - formed * (1 - near)) * (1 - 0.6 * pressed);
          const size = p.size * (1 - 0.35 * formed + 0.25 * formed * p.z) * (1 - 0.7 * pressed);
          drawGlyph(p, p.x, p.y, p.rot, alpha, size);
        }
        if (squeeze > 0) {
          // The star sits on top: rays, a second thinner set for sparkle, and a white-hot core.
          rays(cx, cy, pressed * 260 * twinkle, 1 + pressed * 3, pressed, t / 900);
          rays(cx, cy, pressed * 120 * (2 - twinkle), 0.5 + pressed, pressed * 0.7, t / 900 + Math.PI / 8);
          glow(cx, cy, 16 + pressed * 26 * twinkle, 0.9 * pressed, pressed);
        }
      } else {
        if (!banged) {
          banged = true;
          setPhase("bang");
          for (const p of particles) {
            const angle = Math.atan2(p.y - cy, p.x - cx) + random(-0.5, 0.5);
            const speed = random(0.5, 2.2);
            p.vx = Math.cos(angle) * speed;
            p.vy = Math.sin(angle) * speed;
            p.vr = random(-0.012, 0.012);
          }
        }
        const s = (t - BANG_AT) / BURST_MS;
        if (s < 1) {
          // Flash, then a shockwave ring.
          const flash = clamp01((t - BANG_AT) / 260);
          if (flash < 1) glow(cx, cy, 80 + flash * 260, 0.7 * (1 - flash), 1 - flash);
          ctx.save();
          ctx.globalAlpha = 1 - s;
          ctx.strokeStyle = blue;
          ctx.lineWidth = 3 * (1 - s) + 0.5;
          ctx.beginPath();
          ctx.arc(cx, cy, easeOutCubic(s) * Math.hypot(width, height) * 0.55, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();

          const friction = 0.9965 ** dt;
          for (const p of particles) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vx *= friction;
            p.vy *= friction;
            p.rot += p.vr * dt;
            // They leave the star small and grow to full size as they fly.
            const grow = 0.3 + 0.7 * easeOutCubic(clamp01((t - BANG_AT) / 250));
            drawGlyph(p, p.x, p.y, p.rot, 1 - easeOutCubic(s) * 0.85 - s * 0.15, p.size * grow);
          }
        }
        if (t >= LEAVE_AT && !left) {
          left = true;
          setPhase("leaving");
        }
        if (t >= DONE_AT) {
          finish();
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cleanup();
      window.removeEventListener("resize", resize);
    };
  }, []);

  // The form takes the keyboard once the panel is in.
  useEffect(() => {
    if (phase === "holding") panelRef.current?.querySelector("input")?.focus();
  }, [phase]);

  return (
    <div ref={rootRef} className={`splash splash--${phase}`}>
      <canvas ref={canvasRef} className="splash__canvas" aria-hidden="true" />
      <h1 className="splash__logo" aria-label="DevDash">
        <span className="splash__dev">Dev</span>
        <span className="splash__tag">&lt;/&gt;</span>
        <span className="splash__dash">Dash</span>
      </h1>
      <div className="splash__brand" aria-hidden="true">
        <span className="splash__dev">Dev</span>
        <span className="splash__tag">&lt;/&gt;</span>
        <span className="splash__dash">Dash</span>
        <p>Every project, change and plan in one place.</p>
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
