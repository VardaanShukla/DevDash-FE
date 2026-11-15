import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { View } from "../SideMenu/SideMenu";
import "./Tour.css";

// A walkthrough for someone new, shown once after the first sign-in (until it's finished or
// skipped) and again from Help. Each step opens its screen, lights the thing it's about with a
// box, and points at it with an arrow from the tip. A step whose thing can't be found (a
// narrow window, a screen still loading) shows its tip in the middle.

type Step = {
  title: string;
  text: string;
  // The screen to open for this step.
  view?: View;
  // What to light, best first: values of data-tour attributes.
  targets?: string[];
};

const STEPS: Step[] = [
  { title: "Welcome to DevDash", text: "A one-minute look round. Use the arrow keys or the buttons, and skip any time." },
  { view: "home", targets: ["home"], title: "Home", text: "Your dashboard: this branch, what your AI changed today, recent commits and shortcuts. Edit it to show what you need." },
  { view: "digest", targets: ["digest"], title: "AI changes", text: "Every change your AI coding tool made, grouped by the request behind it, with what to check." },
  { view: "summary", targets: ["summary"], title: "Summary", text: "The whole project on one page: what it is, what it's built with, its parts and who works on it." },
  { view: "kt", targets: ["kt-action", "kt"], title: "KT", text: "A guide for a new developer: what to install, how to set it up and run it, and the major functions. Write it here, then download it as a PDF." },
  { view: "ask", targets: ["ask-box", "ask"], title: "Ask", text: "Ask anything about the project, such as what a file is for or how a flow works. It explains; it never changes code." },
  { view: "changes", targets: ["changes"], title: "Changes", text: "Every changed file and function, before and after, explained in plain words when you ask." },
  { view: "commits", targets: ["commits"], title: "Commits", text: "Each saved step on this branch, newest first." },
  { targets: ["uncommitted"], title: "Uncommitted work", text: "Turn this on to see edits you haven't committed yet, everywhere in DevDash." },
  { targets: ["project"], title: "Projects", text: "Add, switch or remove the projects DevDash watches." },
  { targets: ["settings"], title: "Settings", text: "Pick the AI that writes explanations (Claude, Ollama on this computer and more), the look and the shortcut keys." },
  { targets: ["help"], title: "Help", text: "Setup checks for this project, and this tour again whenever you want it." },
  { view: "home", title: "You're set", text: "Start with Summary or KT on your project. Everything stays on this computer." },
];

const PAD = 6; // the lit box's room around its thing
const GAP = 84; // between the lit box and the tip, for the arrow
const EDGE = 14; // the tip keeps this far from the window's edges

type Rect = { left: number; top: number; width: number; height: number };

function find(targets: string[] | undefined): Rect | null {
  for (const name of targets ?? []) {
    const found = document.querySelector<HTMLElement>(`[data-tour="${name}"]`);
    const rect = found?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight) {
      return { left: rect.left - PAD, top: rect.top - PAD, width: rect.width + 2 * PAD, height: rect.height + 2 * PAD };
    }
  }
  return null;
}

// Where the tip goes: right of the lit box, else left, below or above, whichever fits first.
function placeCard(box: Rect, card: { width: number; height: number }) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const clampX = (x: number) => Math.max(EDGE, Math.min(x, w - card.width - EDGE));
  const clampY = (y: number) => Math.max(EDGE, Math.min(y, h - card.height - EDGE));
  const middleY = box.top + box.height / 2 - card.height / 2;
  const middleX = box.left + box.width / 2 - card.width / 2;
  if (box.left + box.width + GAP + card.width + EDGE <= w) return { left: box.left + box.width + GAP, top: clampY(middleY) };
  if (box.left - GAP - card.width >= EDGE) return { left: box.left - GAP - card.width, top: clampY(middleY) };
  if (box.top + box.height + GAP + card.height + EDGE <= h) return { left: clampX(middleX), top: box.top + box.height + GAP };
  return { left: clampX(middleX), top: clampY(box.top - GAP - card.height) };
}

// A curve from the tip's nearest edge to the lit box's nearest edge.
function arrow(card: Rect, box: Rect): string {
  const cx = card.left + card.width / 2;
  const cy = card.top + card.height / 2;
  const bx = box.left + box.width / 2;
  const by = box.top + box.height / 2;
  const sideways = card.left >= box.left + box.width || card.left + card.width <= box.left;
  let from: [number, number];
  let to: [number, number];
  if (sideways) {
    const right = card.left >= box.left + box.width;
    from = [right ? card.left - 4 : card.left + card.width + 4, Math.max(card.top + 24, Math.min(by, card.top + card.height - 24))];
    to = [right ? box.left + box.width + 8 : box.left - 8, by];
  } else {
    const below = card.top >= box.top + box.height;
    from = [Math.max(card.left + 24, Math.min(bx, card.left + card.width - 24)), below ? card.top - 4 : card.top + card.height + 4];
    to = [bx, below ? box.top + box.height + 8 : box.top - 8];
  }
  const [x1, y1] = from;
  const [x2, y2] = to;
  // Bow the curve to one side, so it reads as a hand-drawn pointer rather than a rule.
  const mx = (x1 + x2) / 2 + (sideways ? 0 : (cx < bx ? -1 : 1) * 30);
  const my = (y1 + y2) / 2 + (sideways ? (cy < by ? -1 : 1) * -30 : 0);
  return `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
}

export default function Tour({ onView, onDone }: { onView: (view: View) => void; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Rect | null>(null);
  const [size, setSize] = useState({ width: 340, height: 200 });
  const card = useRef<HTMLElement>(null);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  useEffect(() => {
    if (step.view) onView(step.view);
  }, [step.view, onView]);

  // The screen behind may still be loading or moving, so the lit thing is found again often.
  const measure = useCallback(() => {
    const next = find(step.targets);
    setBox((old) =>
      old && next && Math.abs(old.left - next.left) + Math.abs(old.top - next.top) + Math.abs(old.width - next.width) + Math.abs(old.height - next.height) < 1
        ? old
        : next,
    );
    const el = card.current;
    if (el) setSize((old) => (old.width === el.offsetWidth && old.height === el.offsetHeight ? old : { width: el.offsetWidth, height: el.offsetHeight }));
  }, [step.targets]);
  useLayoutEffect(measure, [measure, index]);
  useEffect(() => {
    const timer = setInterval(measure, 200);
    window.addEventListener("resize", measure);
    return () => {
      clearInterval(timer);
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  const next = useCallback(() => (last ? onDone() : setIndex((i) => i + 1)), [last, onDone]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDone();
      else if (event.key === "ArrowRight" || event.key === "Enter") next();
      else if (event.key === "ArrowLeft") back();
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    // Captured first, so the dashboard's own shortcut keys don't act while the tour is open.
    window.addEventListener("keydown", keys, true);
    return () => window.removeEventListener("keydown", keys, true);
  }, [next, back, onDone]);

  const place = box ? placeCard(box, size) : null;
  const path = box && place ? arrow({ ...place, ...size }, box) : null;

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {box ? (
        <div key={index} className="tour__light" style={box} />
      ) : (
        <div className="tour__shade" />
      )}
      {path && (
        <svg className="tour__arrow" aria-hidden="true">
          <defs>
            <marker id="tour-head" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="12" markerHeight="12" orient="auto-start-reverse">
              <path d="M2 2 L10 6 L2 10" />
            </marker>
          </defs>
          <path key={index} d={path} markerEnd="url(#tour-head)" />
        </svg>
      )}
      <section ref={card} className={`card tour__card${place ? "" : " tour__card--middle"}`} style={place ?? undefined}>
        <span className="tour__count">
          Step {index + 1} of {STEPS.length}
        </span>
        <h2 id="tour-title">{step.title}</h2>
        <p>{step.text}</p>
        <div className="tour__bar" aria-hidden="true">
          <i style={{ width: `${((index + 1) / STEPS.length) * 100}%` }} />
        </div>
        <div className="tour__buttons">
          {!last && (
            <button className="tour__skip" onClick={onDone}>
              Skip tour
            </button>
          )}
          {index > 0 && (
            <button className="tour__back" onClick={back}>
              Back
            </button>
          )}
          <button className="tour__next" onClick={next} autoFocus>
            {index === 0 ? "Show me" : last ? "Done" : "Next"}
          </button>
        </div>
      </section>
    </div>
  );
}
