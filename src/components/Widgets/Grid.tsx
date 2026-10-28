import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { PlacedWidget } from "../../api/types";
import { CATALOG, option, spec, type HomeData } from "./catalog";
import { COLUMNS, GAP, MAX_ROWS, place, reading, ROW } from "./layout";
import "./Widgets.css";

// Home's widgets on a 12-column grid. While editing, a widget is dragged by its bar to move it
// and by its corner to resize it, the others making room as it goes; with the keyboard, the
// bar's arrows move it and Shift with an arrow resizes it. Below NARROW pixels the widgets
// stack in reading order, one per row, at their own heights, and can't be arranged.

const NARROW = 720;

type Drag = {
  id: string;
  mode: "move" | "resize";
  // Where the pointer started, and the widget's place then.
  startX: number;
  startY: number;
  from: PlacedWidget;
  // The pointer's offset so far, in pixels, for the widget to follow it.
  dx: number;
  dy: number;
};

export default function Grid({ widgets, data, editing, selected, onChange, onSelect }: {
  widgets: PlacedWidget[];
  data: HomeData;
  editing: boolean;
  selected: string | null;
  // Every change while dragging is shown; `done` is true once the widget is let go, to save.
  onChange: (widgets: PlacedWidget[], done: boolean) => void;
  onSelect: (id: string | null) => void;
}) {
  const board = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [said, setSaid] = useState("");
  // The layout as the drag began, so each step is worked out from it, not from the last step.
  const before = useRef<PlacedWidget[]>(widgets);
  // Whether the pointer went anywhere, so letting go after a drag doesn't count as a click.
  const moved = useRef(false);

  useEffect(() => {
    const node = board.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const narrow = width > 0 && width < NARROW;
  useGlide(board, widgets, drag?.id ?? null);
  const column = (width - GAP * (COLUMNS - 1)) / COLUMNS;
  // How many pixels n cells take, gaps between them included.
  const across = (n: number) => n * column + (n - 1) * GAP;
  const down = (n: number) => n * ROW + (n - 1) * GAP;

  const start = (event: PointerEvent, widget: PlacedWidget, mode: Drag["mode"]) => {
    if (!editing || narrow || event.button !== 0) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    before.current = widgets;
    moved.current = false;
    // Settings open on a click, not here: the panel would narrow the board under the pointer.
    setDrag({ id: widget.id, mode, startX: event.clientX, startY: event.clientY, from: widget, dx: 0, dy: 0 });
  };
  const follow = (event: PointerEvent) => {
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
    const cols = Math.round(dx / (column + GAP));
    const rows = Math.round(dy / (ROW + GAP));
    const box = drag.mode === "move"
      ? { x: drag.from.x + cols, y: drag.from.y + rows }
      : { w: drag.from.w + cols, h: drag.from.h + rows };
    onChange(place(before.current, drag.id, box, spec(drag.from.type).min), false);
    setDrag({ ...drag, dx, dy });
  };
  const end = () => {
    if (!drag) return;
    setDrag(null);
    onChange(widgets, true);
  };

  // Arrows move the widget a cell; with Shift they make it wider, narrower, taller or shorter.
  const key = (event: KeyboardEvent, widget: PlacedWidget) => {
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!step) return;
    event.preventDefault();
    const [cols, rows] = step;
    const box = event.shiftKey ? { w: widget.w + cols, h: widget.h + rows } : { x: widget.x + cols, y: widget.y + rows };
    const next = place(widgets, widget.id, box, spec(widget.type).min);
    const now = next.find((w) => w.id === widget.id)!;
    setSaid(`${name(widget)}: column ${now.x + 1}, row ${now.y + 1}, ${now.w} wide, ${now.h} tall`);
    onChange(next, true);
  };

  const shown = narrow ? reading(widgets) : widgets;
  return (
    <div
      ref={board}
      className={`board${editing ? " board--editing" : ""}${narrow ? " board--narrow" : ""}${drag ? " board--dragging" : ""}`}
      style={{ ["--row" as string]: `${ROW}px`, ["--gap" as string]: `${GAP}px` }}
      onPointerMove={follow}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {shown.map((widget) => {
        const about = spec(widget.type);
        const moving = drag?.id === widget.id;
        const title = widget.title || about.name;
        // While dragged, the widget follows the pointer pixel by pixel, moved or stretched, and
        // the ghost marks the cells it will snap to when let go.
        const min = about.min;
        const trail = moving && drag.mode === "move"
          ? { transform: `translate(${drag.dx - (widget.x - drag.from.x) * (column + GAP)}px, ${drag.dy - (widget.y - drag.from.y) * (ROW + GAP)}px)` }
          : moving
            ? {
                width: `${Math.min(across(COLUMNS - widget.x), Math.max(across(min.w), across(drag.from.w) + drag.dx))}px`,
                height: `${Math.min(down(MAX_ROWS), Math.max(down(min.h), down(drag.from.h) + drag.dy))}px`,
              }
            : {};
        const ghost = moving && drag.mode === "move"
          ? { transform: `translate(${-(drag.dx - (widget.x - drag.from.x) * (column + GAP))}px, ${-(drag.dy - (widget.y - drag.from.y) * (ROW + GAP))}px)` }
          : { inset: "0 auto auto 0", width: `${across(widget.w)}px`, height: `${down(widget.h)}px` };
        const style = narrow
          ? { ["--h" as string]: widget.h }
          : { gridColumn: `${widget.x + 1} / span ${widget.w}`, gridRow: `${widget.y + 1} / span ${widget.h}`, ...trail };
        return (
          <div
            key={widget.id}
            data-widget={widget.id}
            className={[
              "wf",
              `wf--${widget.type}`,
              `wf--${widget.style}`,
              widget.accent && `wf--accent-${widget.accent}`,
              about.ownCard && "wf--own",
              moving && "wf--moving",
              editing && selected === widget.id && "wf--selected",
            ].filter(Boolean).join(" ")}
            style={style}
          >
            {moving && !narrow && (
              <span className="wf__ghost" aria-hidden="true" style={ghost} />
            )}
            {about.ownCard ? (
              about.render({ data, widget, title, o: (key) => option(widget, key) })
            ) : (
              <section className="card wf__panel" aria-label={title}>
                {about.render({ data, widget, title, o: (key) => option(widget, key) })}
              </section>
            )}
            {editing && (
              <div className="wf__edit">
                <button
                  className="wf__grip"
                  onPointerDown={(event) => start(event, widget, "move")}
                  onKeyDown={(event) => key(event, widget)}
                  onClick={() => moved.current || onSelect(widget.id)}
                  aria-label={`${title}. Drag, or use the arrow keys, to move it; Shift and an arrow to resize it`}
                  title="Drag to move. Arrow keys move it; Shift and an arrow resize it."
                  disabled={narrow}
                >
                  <GripIcon />
                  <span>{title}</span>
                </button>
                <button className="wf__settings" onClick={() => onSelect(widget.id)} aria-label={`Settings for ${title}`} title="Settings">
                  <GearIcon />
                </button>
                {!narrow && (
                  <span
                    className="wf__corner"
                    onPointerDown={(event) => start(event, widget, "resize")}
                    title="Drag to resize"
                    aria-hidden="true"
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
      {widgets.length === 0 && (
        <p className="board__empty">Home is empty. Press Edit Home, then Add a widget, to fill it.</p>
      )}
      <span className="board__said" aria-live="polite">
        {said}
      </span>
    </div>
  );
}

// Widgets glide from where they were to where the layout puts them, rather than jumping:
// the others making room while one is dragged or resized, one let go settling into its
// cell at its new size, the rest closing up after one is removed. A new widget fades in.
// Where each widget was is read while React renders, before the page changes, so a widget
// still gliding starts again from where it is on screen. Reduced motion turns it off.
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

function useGlide(board: React.RefObject<HTMLDivElement | null>, widgets: PlacedWidget[], held: string | null) {
  const last = useRef<PlacedWidget[]>(widgets);
  const lastHeld = useRef<string | null>(held);
  const from = useRef(new Map<string, DOMRect>());
  const still = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if ((last.current !== widgets || lastHeld.current !== held) && board.current && !still) {
    from.current = new Map();
    for (const node of board.current.querySelectorAll<HTMLElement>("[data-widget]")) {
      from.current.set(node.dataset.widget!, node.getBoundingClientRect());
    }
  }
  useLayoutEffect(() => {
    const changed = last.current !== widgets || lastHeld.current !== held;
    const before = last.current;
    last.current = widgets;
    lastHeld.current = held;
    if (!changed || still || !board.current) return;
    for (const node of board.current.querySelectorAll<HTMLElement>("[data-widget]")) {
      const id = node.dataset.widget!;
      // The widget under the pointer follows it; it glides once it's let go.
      if (id === held) continue;
      const was = from.current.get(id);
      node.getAnimations().forEach((animation) => animation.cancel());
      if (!was) {
        if (before.length && !before.some((w) => w.id === id)) {
          node.animate([{ opacity: 0, transform: "scale(0.96)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: EASE });
        }
        continue;
      }
      const now = node.getBoundingClientRect();
      const dx = was.left - now.left;
      const dy = was.top - now.top;
      const resized = Math.abs(was.width - now.width) >= 1 || Math.abs(was.height - now.height) >= 1;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && !resized) continue;
      node.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)`, ...(resized && { width: `${was.width}px`, height: `${was.height}px` }) },
          { transform: "none", ...(resized && { width: `${now.width}px`, height: `${now.height}px` }) },
        ],
        { duration: 280, easing: EASE },
      );
    }
  }, [widgets, held, still, board]);
}

function name(widget: PlacedWidget) {
  return widget.title || CATALOG.find((s) => s.type === widget.type)!.name;
}

function GripIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
      <circle cx="5.5" cy="4" r="1.3" />
      <circle cx="10.5" cy="4" r="1.3" />
      <circle cx="5.5" cy="8" r="1.3" />
      <circle cx="10.5" cy="8" r="1.3" />
      <circle cx="5.5" cy="12" r="1.3" />
      <circle cx="10.5" cy="12" r="1.3" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}
