import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { PlacedWidget } from "../../api/types";
import { CATALOG, option, spec, type HomeData } from "./catalog";
import { COLUMNS, GAP, place, reading, ROW } from "./layout";
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

  useEffect(() => {
    const node = board.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const narrow = width > 0 && width < NARROW;
  const column = (width - GAP * (COLUMNS - 1)) / COLUMNS;

  const start = (event: PointerEvent, widget: PlacedWidget, mode: Drag["mode"]) => {
    if (!editing || narrow || event.button !== 0) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    before.current = widgets;
    onSelect(widget.id);
    setDrag({ id: widget.id, mode, startX: event.clientX, startY: event.clientY, from: widget, dx: 0, dy: 0 });
  };
  const follow = (event: PointerEvent) => {
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
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
        const style = narrow
          ? { ["--h" as string]: widget.h }
          : {
              gridColumn: `${widget.x + 1} / span ${widget.w}`,
              gridRow: `${widget.y + 1} / span ${widget.h}`,
              ...(moving && drag.mode === "move"
                ? { transform: `translate(${drag.dx - (widget.x - drag.from.x) * (column + GAP)}px, ${drag.dy - (widget.y - drag.from.y) * (ROW + GAP)}px)` }
                : {}),
            };
        return (
          <div
            key={widget.id}
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
              <span
                className="wf__ghost"
                aria-hidden="true"
                style={{
                  transform: `translate(${-(drag.dx - (widget.x - drag.from.x) * (column + GAP))}px, ${-(drag.dy - (widget.y - drag.from.y) * (ROW + GAP))}px)`,
                }}
              />
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
                  onClick={() => onSelect(widget.id)}
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
