import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { LightTile, SEAM } from "./LoomaTile";
import "./Splash.css";

// A warp-speed reveal, timed and coloured from a reference video. Black, then a warm glow
// swells at one point and the screen floods with cream and peach light, soft rays pouring
// into a pinch at the middle in a bow-tie that leans up and to the right, like light falling
// into a black hole, with points of light streaming in along them. The light
// reddens from the corners through rose to crimson as the speed climbs, the rays pull in
// along the lean of the bow-tie, and everything drains to black around one white-hot slash.
// The slash settles, a faint reflection appears on the floor under it, and a glass tile
// pops into place around it with a beam of light above and sparks adrift. The slash lands
// on the tile's seam and splits into the two strokes of an "L" drawn in the same light,
// swinging apart from the corner; the code tag draws itself last, then the name lights up
// under the tile.
//
// Leaving, the splash fades to the dashboard underneath.
//
// When this browser has to sign in, the sign-in panel slides in from the right and the tile
// moves into the left half. Click or press any key to skip ahead.

// Milliseconds from the start. The CSS holds the same times for the tile and the name.
const COLLAPSE = [2450, 3130]; // the rays pull in and the light drains to black
const SLASH_IN = [2250, 3030]; // the slash swells
const SLASH_SETTLE = [3030, 3600]; // it eases to the size of the tile
const FLOOR = [3450, 3700]; // the reflection on the floor
const BEAM = [3550, 4300]; // the tile pops in (CSS) and the beam above it shines
const SEAM_AT = [3550, 4100]; // the slash travels to the logo's seam
const MELT = [3780, 4400]; // the slash splits into the two strokes of the L
const MOTES = [3800, 4700]; // the sparks drift in
const READY_AT = 4900; // the name is in: wait here for signing in, if needed
const LINGER_MS = 650; // how long it stays when there's no signing in
const SPLIT_MS = 750; // the sign-in panel slides in or out
// Milliseconds from the start of the exit, once the panel is out: the splash fades to the
// dashboard underneath.
const EXIT_MS = 700;
const NAME = "LOOMA";
// The slash's lean, up to the right: the same as the seam of the logo (radians).
const AXIS = -0.653;

// The colour of the flood over time, measured from the reference: at the middle, a little
// out from it, and out at the edges. Black, a brown glow, cream and peach, rose, crimson,
// then black again.
type Rgb = [number, number, number];
const FLOOD: [number, Rgb, Rgb, Rgb][] = [
  [0, [6, 4, 7], [6, 4, 7], [6, 4, 7]],
  [100, [30, 15, 13], [24, 13, 11], [26, 12, 13]],
  [200, [107, 60, 41], [72, 36, 28], [72, 36, 28]],
  [330, [214, 167, 105], [183, 121, 78], [172, 104, 74]],
  [400, [236, 191, 131], [213, 164, 104], [198, 131, 90]],
  [500, [239, 201, 139], [229, 183, 123], [205, 141, 94]],
  [1000, [238, 201, 141], [225, 184, 125], [195, 126, 85]],
  [1400, [240, 208, 157], [231, 193, 136], [186, 112, 82]],
  [1800, [241, 215, 170], [229, 191, 134], [165, 85, 72]],
  [2000, [244, 219, 178], [231, 190, 136], [154, 66, 67]],
  [2230, [244, 224, 190], [216, 162, 113], [121, 43, 50]],
  [2430, [247, 225, 192], [191, 108, 82], [94, 30, 41]],
  [2630, [248, 230, 198], [157, 64, 55], [75, 22, 35]],
  [2830, [254, 243, 230], [149, 53, 60], [68, 19, 33]],
  [2930, [254, 247, 239], [128, 45, 53], [53, 17, 28]],
  [3030, [254, 249, 243], [97, 35, 43], [21, 9, 14]],
  [3130, [254, 243, 234], [6, 4, 7], [6, 4, 7]],
];

type Phase = "intro" | "ready" | "holding" | "exit";

// A ray of light: a soft wedge out of the pinch at the middle, with an angle, a width, and
// where along its run it sits.
type Ray = { a: number; axis: number; da: number; r0: number; v: number; len: number; half: number; b: number; hue: number; phase: number };
type Mote = { a: number; r: number; size: number; phase: number; drift: number };
// A point of light falling toward the middle along a ray.
type Fall = { axis: number; da: number; r0: number; v: number; size: number };

const clamp01 = (k: number) => Math.min(1, Math.max(0, k));
const span = (t: number, [from, to]: number[]) => clamp01((t - from) / (to - from));
const easeOutCubic = (k: number) => 1 - (1 - k) ** 3;
const easeInOutCubic = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.6;
const wrap = (angle: number) => ((((angle + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
const rgb = (c: number[], a = 1) => `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${a})`;

// The flood's three colours at story time `t`.
function floodAt(t: number): [Rgb, Rgb, Rgb] {
  let i = 0;
  while (i < FLOOD.length - 2 && t > FLOOD[i + 1][0]) i++;
  const [t0, ...from] = FLOOD[i];
  const [t1, ...to] = FLOOD[i + 1];
  const k = clamp01((t - t0) / (t1 - t0));
  return [0, 1, 2].map((n) => [0, 1, 2].map((c) => mix(from[n][c], to[n][c], k))) as [Rgb, Rgb, Rgb];
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
  const slotRef = useRef<HTMLDivElement>(null);
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
    // When the exit started (the panel then has to leave first) and when the tile went.
    let exitAt = -1;
    let leaveAt = -1;
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

    // Where the pointer is, -1 to 1 across the screen, and where the scene has eased to.
    const pointer = { x: 0, y: 0 };
    const lean = { x: 0, y: 0 };
    const onPointer = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onPointer);

    let width = 0;
    let height = 0;
    let rays: Ray[] = [];
    let darkRays: Ray[] = [];
    let motes: Mote[] = [];
    let falling: Fall[] = [];
    // The rays are drawn at a third of the size and scaled up, which is what makes them soft;
    // the beam is drawn smaller still.
    const lightRays = document.createElement("canvas");
    const lightCtx = lightRays.getContext("2d")!;
    const shadeRays = document.createElement("canvas");
    const shadeCtx = shadeRays.getContext("2d")!;
    const column = document.createElement("canvas");
    const columnCtx = column.getContext("2d")!;
    // Film grain: a tile of noise, laid over the picture at a new offset every frame.
    const grain = document.createElement("canvas");
    grain.width = grain.height = 160;
    {
      const g = grain.getContext("2d")!;
      const data = g.createImageData(160, 160);
      for (let i = 0; i < data.data.length; i += 4) {
        const v = Math.random() * 255;
        data.data[i] = v;
        data.data[i + 1] = v * 0.9;
        data.data[i + 2] = v * 0.85;
        data.data[i + 3] = 255;
      }
      g.putImageData(data, 0, 0);
    }
    const grainPattern = ctx.createPattern(grain, "repeat");
    const makeRay = (): Ray => {
      // Most rays run along the bow-tie's axis, in both directions, so the flood has the
      // slash's lean in it before it collapses to the slash.
      const along = Math.random() < 0.64;
      const a = along ? AXIS + (Math.random() < 0.5 ? 0 : Math.PI) + gauss() * 0.4 : Math.random() * Math.PI * 2;
      const d1 = wrap(a - AXIS);
      const d2 = wrap(a - AXIS - Math.PI);
      const near = Math.abs(d1) < Math.abs(d2);
      return {
        a,
        axis: near ? AXIS : AXIS + Math.PI,
        da: near ? d1 : d2,
        r0: Math.random() * 0.4,
        v: 0.3 + Math.random(),
        len: 0.3 + Math.random() * 0.65,
        half: 0.004 + Math.random() ** 2 * 0.05,
        b: 0.35 + Math.random() * 0.65,
        hue: Math.random(),
        phase: Math.random() * Math.PI * 2,
      };
    };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lightRays.width = shadeRays.width = Math.max(1, Math.round(width / 3));
      lightRays.height = shadeRays.height = Math.max(1, Math.round(height / 3));
      column.width = Math.max(1, Math.round(width / 4));
      column.height = Math.max(1, Math.round(height / 4));
      falling = Array.from({ length: 240 }, () => {
        const r = makeRay();
        return { axis: r.axis, da: r.da, r0: Math.random(), v: 0.4 + Math.random() * 1.1, size: 0.8 + Math.random() * 1.4 };
      });
      rays = Array.from({ length: 560 }, makeRay);
      darkRays = Array.from({ length: 300 }, makeRay);
      motes = Array.from({ length: 70 }, () => ({
        a: Math.random() * Math.PI * 2,
        r: 0.5 + Math.random() * 1.1,
        size: 0.5 + Math.random() * 0.8,
        phase: Math.random() * Math.PI * 2,
        drift: (Math.random() - 0.5) * 0.0001,
      }));
    };
    resize();
    window.addEventListener("resize", resize);

    // The tile's slot on screen (it doesn't move while the tile inside it pops in), the
    // point the rays come from, and where the logo's seam falls.
    const geometry = () => {
      const box = slotRef.current?.getBoundingClientRect();
      const size = box?.width || 200;
      const left = box ? box.left : width / 2 - size / 2;
      const top = box ? box.top : height / 2 - size / 2;
      return {
        size,
        left,
        top,
        cx: left + size / 2,
        cy: top + size / 2,
        bottom: top + size,
        seamX: left + SEAM.x * size,
        seamY: top + SEAM.y * size,
      };
    };

    // A round bloom of warm white light.
    const bloom = (x: number, y: number, radius: number, strength: number) => {
      if (strength <= 0 || radius <= 0) return;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, `rgba(255, 247, 238, ${0.95 * strength})`);
      glow.addColorStop(0.14, `rgba(255, 176, 140, ${0.55 * strength})`);
      glow.addColorStop(0.45, `rgba(214, 72, 72, ${0.2 * strength})`);
      glow.addColorStop(1, "rgba(214, 72, 72, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    };

    // One ray as a soft wedge on a small canvas: wide at the far end, fading in and out
    // along its run.
    const wedge = (target: CanvasRenderingContext2D, q: number, cx: number, cy: number, angle: number, r1: number, r2: number, half: number, color: Rgb, alpha: number) => {
      if (alpha < 0.004 || r2 <= r1) return;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const w1 = r1 * Math.tan(half) + 0.4;
      const w2 = r2 * Math.tan(half) + 0.4;
      const x1 = cx * q + dx * r1 * q;
      const y1 = cy * q + dy * r1 * q;
      const x2 = cx * q + dx * r2 * q;
      const y2 = cy * q + dy * r2 * q;
      const grad = target.createLinearGradient(x1, y1, x2, y2);
      // Bright at the end nearest the middle, where the light is heading.
      grad.addColorStop(0, rgb(color, alpha * 0.7));
      grad.addColorStop(0.14, rgb(color, alpha));
      grad.addColorStop(0.6, rgb(color, alpha * 0.45));
      grad.addColorStop(1, rgb(color, 0));
      target.fillStyle = grad;
      target.beginPath();
      target.moveTo(x1 - dy * w1 * q, y1 + dx * w1 * q);
      target.lineTo(x2 - dy * w2 * q, y2 + dx * w2 * q);
      target.lineTo(x2 + dy * w2 * q, y2 - dx * w2 * q);
      target.lineTo(x1 + dy * w1 * q, y1 - dx * w1 * q);
      target.closePath();
      target.fill();
    };

    // Points of light falling in toward the middle along the rays, quickening and brightening
    // as they go, until the pinch swallows them.
    const fall = (t: number, cx: number, cy: number, rmax: number, speed: number, strength: number) => {
      if (strength <= 0) return;
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (const f of falling) {
        const frac = (((f.r0 - f.v * warpPos * 0.5) % 1) + 1) % 1;
        const r = frac ** 1.5 * rmax;
        const angle = f.axis + f.da * (1 - 0.94 * easeInOutCubic(span(t, COLLAPSE)));
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const tail = 6 + 60 * f.v * speed * (1 - frac);
        const alpha = strength * (0.18 + 0.82 * (1 - frac) ** 1.4);
        ctx.strokeStyle = `rgba(255, 240, 220, ${alpha})`;
        ctx.lineWidth = f.size * (0.6 + 0.8 * (1 - frac));
        ctx.beginPath();
        ctx.moveTo(cx + dx * r, cy + dy * r);
        ctx.lineTo(cx + dx * (r + tail), cy + dy * (r + tail));
        ctx.stroke();
      }
    };

    // The flood and the rays across it, at story time `t`.
    let time = 0;
    let warpPos = 0;
    const warp = (t: number, dt: number, cx: number, cy: number) => {
      if (t >= COLLAPSE[1]) return;
      const diag = Math.hypot(width, height);
      const [inner, mid, edge] = floodAt(t);
      // The wash: opaque, in the three measured colours.
      const wash = ctx.createRadialGradient(cx, cy, 0, cx, cy, diag * 0.62);
      wash.addColorStop(0, rgb(inner));
      wash.addColorStop(0.14, rgb(mid));
      wash.addColorStop(0.36, rgb(edge));
      wash.addColorStop(1, rgb(edge));
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, width, height);
      if (t < 280) return;

      const pull = easeInOutCubic(span(t, COLLAPSE));
      const gain = (0.35 + 0.65 * span(t, [1200, 2900])) * span(t, [280, 520]) * (1 - span(t, [2900, 3130]));
      const deepen = span(t, [1500, 2700]);
      warpPos += (dt / 1000) * (0.3 + 0.7 * span(t, [300, 1200])) * (1 - pull * 0.9);
      const q = lightRays.width / width;
      const rmax = diag * 0.62;
      lightCtx.globalCompositeOperation = "source-over";
      lightCtx.clearRect(0, 0, lightRays.width, lightRays.height);
      shadeCtx.clearRect(0, 0, shadeRays.width, shadeRays.height);
      lightCtx.globalCompositeOperation = "lighter";

      const place = (ray: Ray) => {
        // As the light drains, each ray swings in toward the axis and stretches along it.
        const angle = ray.axis + ray.da * (1 - 0.94 * pull);
        // The rays slide in toward the pinch and come round again at the far end.
        const start = ((((ray.r0 - ray.v * warpPos * 0.12) % 0.42) + 0.42) % 0.42) * rmax;
        const run = ray.len * rmax * (1 + 1.5 * pull);
        const flicker = 0.8 + 0.2 * Math.sin(time * 0.0018 * ray.v + ray.phase);
        const onAxis = Math.exp(-((ray.da / 0.45) ** 2));
        const offAxis = 1 - pull * Math.min(1, Math.abs(ray.da) * 2.4);
        return { angle, start, run, half: ray.half * (1 - 0.65 * pull), strength: flicker * (1 + 1.4 * onAxis) * offAxis };
      };
      for (const ray of darkRays) {
        const p = place(ray);
        wedge(shadeCtx, q, cx, cy, p.angle, p.start, p.start + p.run, p.half * 1.6, [92, 24, 40], 0.3 * ray.b * span(t, [1500, 2300]) * p.strength * (1 - span(t, [2900, 3130])));
      }
      for (const ray of rays) {
        const p = place(ray);
        // Cream at first, then peach and rose as the light deepens.
        const k = ray.hue * deepen;
        const color: Rgb = [255, mix(240, 170, k), mix(212, 138, k)];
        wedge(lightCtx, q, cx, cy, p.angle, p.start, p.start + p.run, p.half, color, 0.16 * gain * ray.b * p.strength * (1 - 0.7 * pull));
      }
      ctx.imageSmoothingEnabled = true;
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(shadeRays, 0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";
      ctx.drawImage(lightRays, 0, 0, width, height);

      fall(t, cx, cy, rmax, 0.4 + 0.6 * span(t, [300, 1500]), span(t, [500, 1000]) * (1 - span(t, [2800, 3130])));
      // The pinch the rays pour into, and glitter around it.
      bloom(cx, cy, 70 + 220 * span(t, [300, 900]), 0.5 * gain * (1 - span(t, [2750, 3130])));
      if (t > 900 && t < 2950) {
        const env = easeInOutCubic(span(t, [900, 1400])) * (1 - span(t, [2650, 2950]));
        for (let i = 0; i < 90; i++) {
          const r = Math.random() ** 2 * Math.min(width, height) * 0.15;
          const a = Math.random() * Math.PI * 2;
          ctx.fillStyle = `rgba(255, 246, 236, ${(0.25 + Math.random() * 0.6) * env})`;
          ctx.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.6, 1.6);
        }
      }
    };

    // The slash of light, centred on (x, y) and leaning along AXIS: long thin tails like a
    // cinema lens flare, a salmon glow, and a white-hot spindle at its heart.
    const slash = (x: number, y: number, core: number, tail: number, strength: number) => {
      if (strength <= 0) return;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(AXIS);
      ctx.globalCompositeOperation = "lighter";
      for (const [lineWidth, alpha] of [[16, 0.08], [5, 0.28], [1.6, 0.8]]) {
        const line = ctx.createLinearGradient(-tail, 0, tail, 0);
        line.addColorStop(0, "rgba(255, 130, 110, 0)");
        line.addColorStop(0.5, `rgba(255, 170, 150, ${alpha * strength})`);
        line.addColorStop(1, "rgba(255, 130, 110, 0)");
        ctx.strokeStyle = line;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-tail, 0);
        ctx.lineTo(tail, 0);
        ctx.stroke();
      }
      // The glow, a wide ellipse squashed along the axis.
      ctx.save();
      ctx.scale(1, 0.24);
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, core * 1.7);
      glow.addColorStop(0, `rgba(255, 120, 108, ${0.5 * strength})`);
      glow.addColorStop(0.5, `rgba(214, 62, 72, ${0.2 * strength})`);
      glow.addColorStop(1, "rgba(214, 62, 72, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(-core * 1.7, -core * 1.7, core * 3.4, core * 3.4);
      ctx.restore();
      // The spindle.
      const half = core;
      const thick = core * 0.22;
      const body = ctx.createLinearGradient(-half, 0, half, 0);
      body.addColorStop(0, "rgba(255, 150, 130, 0)");
      body.addColorStop(0.3, `rgba(255, 214, 196, ${0.85 * strength})`);
      body.addColorStop(0.5, `rgba(255, 250, 244, ${strength})`);
      body.addColorStop(0.7, `rgba(255, 214, 196, ${0.85 * strength})`);
      body.addColorStop(1, "rgba(255, 150, 130, 0)");
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(-half, 0);
      ctx.quadraticCurveTo(0, -thick, half, 0);
      ctx.quadraticCurveTo(0, thick, -half, 0);
      ctx.fill();
      ctx.restore();
      bloom(x, y, core * 0.42, 0.7 * strength);
    };

    // The reflection on the floor under the tile: a thin glowing line, with a wider haze.
    const floorLight = (cx: number, y: number, size: number, strength: number) => {
      if (strength <= 0) return;
      ctx.save();
      ctx.translate(cx, y);
      for (const [ry, alpha] of [[0.14, 0.12], [0.04, 0.5]]) {
        ctx.save();
        ctx.scale(1, ry);
        const r = size * 1.05;
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        g.addColorStop(0, `rgba(255, 190, 170, ${alpha * strength})`);
        g.addColorStop(0.45, `rgba(240, 100, 100, ${alpha * 0.5 * strength})`);
        g.addColorStop(1, "rgba(214, 62, 72, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(-r, -r, r * 2, r * 2);
        ctx.restore();
      }
      ctx.restore();
    };

    // The soft beam above the tile, wide at its foot and narrowing as it climbs, leaning a
    // little to the right.
    const beam = (x: number, top: number, base: number, size: number, strength: number) => {
      if (strength <= 0) return;
      const w = column.width;
      const h = column.height;
      const q = w / width;
      const shift = base * 0.1 * q;
      columnCtx.globalCompositeOperation = "source-over";
      columnCtx.clearRect(0, 0, w, h);
      const foot = size * 0.6 * q;
      const tip = size * 0.1 * q;
      const body = columnCtx.createLinearGradient(x * q - foot, 0, x * q + foot, 0);
      body.addColorStop(0, "rgba(255, 120, 100, 0)");
      body.addColorStop(0.4, "rgba(255, 150, 120, 0.24)");
      body.addColorStop(0.5, "rgba(255, 214, 192, 0.5)");
      body.addColorStop(0.6, "rgba(255, 150, 120, 0.24)");
      body.addColorStop(1, "rgba(255, 120, 100, 0)");
      columnCtx.fillStyle = body;
      columnCtx.beginPath();
      columnCtx.moveTo(x * q - tip + shift, 0);
      columnCtx.lineTo(x * q + tip + shift, 0);
      columnCtx.lineTo(x * q + foot, base * q);
      columnCtx.lineTo(x * q - foot, base * q);
      columnCtx.closePath();
      columnCtx.fill();
      columnCtx.globalCompositeOperation = "destination-in";
      const fade = columnCtx.createLinearGradient(0, 0, 0, base * q);
      const peak = clamp01(top / base);
      fade.addColorStop(0, "rgba(0, 0, 0, 0)");
      fade.addColorStop(peak * 0.7, "rgba(0, 0, 0, 0.55)");
      fade.addColorStop(peak, "rgba(0, 0, 0, 1)");
      fade.addColorStop(1, "rgba(0, 0, 0, 0)");
      columnCtx.fillStyle = fade;
      columnCtx.fillRect(0, 0, w, h);
      ctx.globalAlpha = strength;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(column, 0, 0, width, height);
      ctx.globalAlpha = 1;
    };

    // Sparks adrift around the tile, twinkling.
    const adrift = (cx: number, cy: number, size: number, strength: number) => {
      if (strength <= 0) return;
      for (const mote of motes) {
        const a = mote.a + time * mote.drift;
        const x = cx + Math.cos(a) * mote.r * size * 1.3 - lean.x * 10 * mote.size;
        const y = cy + Math.sin(a) * mote.r * size * 0.95 - Math.sin(time * 0.0004 + mote.phase) * 6;
        const twinkle = 0.45 + 0.55 * Math.sin(time * 0.0022 + mote.phase * 3);
        ctx.fillStyle = `rgba(255, 222, 208, ${strength * twinkle * 0.6})`;
        ctx.beginPath();
        ctx.arc(x, y, mote.size, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    // The whole picture at story time `t`, `out` milliseconds into the exit (or -1), after
    // `dt` milliseconds more.
    const draw = (t: number, out: number, dt: number) => {
      const m = geometry();
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "source-over";

      if (out < 0) {
        warp(t, dt, m.cx, m.cy);
        ctx.globalCompositeOperation = "lighter";

        // The slash: it swells, settles to the size of the tile, travels to the logo's seam
        // and gives way to the logo.
        const swell = easeOutCubic(span(t, SLASH_IN));
        const settle = easeInOutCubic(span(t, SLASH_SETTLE));
        const melt = 1 - easeInOutCubic(span(t, MELT)) * 0.95;
        const strength = swell * (1 - settle * 0.4) * melt;
        const core = mix(width * 0.17, m.size * 0.82, settle) * (0.3 + 0.7 * swell);
        const tail = mix(width * 0.7, m.size * 1.7, easeInOutCubic(span(t, [3030, 3700]))) * swell;
        const travel = easeInOutCubic(span(t, SEAM_AT));
        slash(mix(m.cx, m.seamX, travel), mix(m.cy, m.seamY, travel), core, tail, strength);
        // The blaze as the light drains into the slash.
        const blaze = span(t, [2700, 3030]) * (1 - span(t, [3030, 3300]));
        bloom(m.cx, m.cy, Math.min(width, height) * 0.3, 0.45 * blaze);

        floorLight(m.cx, m.bottom + m.size * 0.38, m.size, easeOutCubic(span(t, FLOOR)));
        // The beam is brightest as the tile pops in and has all but gone by the time it rests.
        const beamK = easeOutCubic(span(t, BEAM)) * (1 - 0.85 * easeInOutCubic(span(t, [4300, 5200])));
        beam(m.cx, m.top - m.size * 0.5, m.cy, m.size, 0.9 * beamK);
        adrift(m.cx, m.cy, m.size, easeOutCubic(span(t, MOTES)));
      } else {
        // Leaving: the floor light and the sparks fade out with the rest.
        floorLight(m.cx, m.bottom + m.size * 0.38, m.size, 1 - easeInOutCubic(span(out, [0, 500])));
        adrift(m.cx, m.cy, m.size, 1 - easeInOutCubic(span(out, [0, 400])));
      }


      // The grain, faint, over everything.
      if (grainPattern) {
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 0.05;
        ctx.save();
        ctx.translate(Math.random() * 160, Math.random() * 160);
        ctx.fillStyle = grainPattern;
        ctx.fillRect(-160, -160, width + 320, height + 320);
        ctx.restore();
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = "source-over";
      return { m };
    };

    const cleanup = () => {
      finished = true;
      cancelAnimationFrame(frame);
      timers.forEach(clearTimeout);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
      root.removeEventListener("pointerdown", skip);
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // No motion: the tile in place with its floor light, the panel simply there until
      // signed in, then a quick fade.
      time = 6000;
      const still = () => draw(READY_AT + 2000, -1, 0);
      timers.push(window.setTimeout(still, 30));
      window.addEventListener("resize", still);
      const check = () => {
        if (finished) return;
        story = READY_AT;
        if (holdRef.current === true) {
          setSplit(1);
          still();
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
      return () => {
        window.removeEventListener("resize", still);
        cleanup();
      };
    }

    let last = performance.now();
    const tick = (now: number) => {
      if (finished) return;
      const dt = Math.min(now - last, 32);
      last = now;
      time += dt;
      // The scene follows the pointer with a lag, as a heavy thing would.
      const ease = 1 - Math.exp(-dt / 300);
      lean.x += (pointer.x - lean.x) * ease;
      lean.y += (pointer.y - lean.y) * ease;
      root.style.setProperty("--lean-x", lean.x.toFixed(3));
      root.style.setProperty("--lean-y", lean.y.toFixed(3));
      const hold = holdRef.current;

      // The panel slides towards where it should be.
      const wantSplit = story >= READY_AT && hold === true && exitAt < 0 ? 1 : 0;
      if (split !== wantSplit) {
        setSplit(wantSplit > split ? Math.min(1, split + dt / SPLIT_MS) : Math.max(0, split - dt / SPLIT_MS));
      }
      // The story waits at READY_AT until it's known whether to sign in, and while signing in.
      if (story < READY_AT || hold === false) story += dt;
      if (exitAt < 0 && hold === false && story >= READY_AT + (split > 0 ? 0 : LINGER_MS)) exitAt = now;
      // The tile goes once the panel is out of the way.
      if (exitAt >= 0 && leaveAt < 0 && split === 0) {
        leaveAt = now;
        moveTo("exit");
      }
      if (exitAt < 0) moveTo(story < READY_AT ? "intro" : split === 1 ? "holding" : "ready");

      const out = leaveAt >= 0 ? now - leaveAt : -1;
      draw(Math.min(story, READY_AT + 4000), out, dt);
      if (out >= EXIT_MS) {
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
        {/* The slot holds the tile's place while the tile pops into it. */}
        <div ref={slotRef} className="splash__slot">
          <div className="splash__rise">
            <div className="splash__sway">
              <LightTile />
            </div>
          </div>
          <div className="splash__words">
            <h1 className="splash__name" aria-label="Looma">
              {[...NAME].map((letter, i) => (
                <span key={i} className="splash__letter" style={{ "--i": i, "--r": NAME.length - 1 - i } as CSSProperties} aria-hidden="true">
                  {letter}
                </span>
              ))}
            </h1>
            <p className="splash__tagline">Every project, change and plan in one place</p>
          </div>
        </div>
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
