import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { FileChange, ProjectMap as MapData } from "../../api/types";
import type { Node } from "./Constellation";
import { QUIET, STATUS, STATUS_COLOR, bezier, bytes, fileName, type Point } from "./shared";

// One part, zoomed in: the orb on the left, its numbers fanned out as cards, the picked
// card fanned out into a long list, and a file's details in a glass panel on the right.

type Props = {
  part: Node;
  // Where the part sat on screen in the sky, so the orb can glide from there.
  from: Point;
  map: MapData;
  byId: Map<string, Node>;
  size: { width: number; height: number };
  still: boolean;
  // The parts looked into on the way here, this one last.
  trail: Node[];
  // Keeps the first `depth` parts of the trail: 0 is back to the whole sky.
  onTrail: (depth: number) => void;
  onFocus: (id: string) => void;
  onOpenFile: (path: string) => void;
};

type CardId = "files" | "changed" | "functions" | "uses" | "usedBy";
type Entry = { path: string; bytes: number; change?: FileChange };
type Badge = { text: string; tone?: "add" | "del" | "gold" };
type Item = { key: string; label: string; color: string; badges: Badge[]; entry?: Entry; part?: string; fn?: string };

// Each card's name in the breadcrumb.
const CRUMB: Record<CardId, string> = { files: "Files", changed: "Changed", functions: "Functions", uses: "Uses", usedBy: "Used by" };

const ROW_H = 28;
const ROW_GAP = 5;
// Room between the rows and the curved scroll bar.
const BAR_GAP = 18;

export default function Focus(props: Props) {
  const { part, map, byId, size } = props;
  const prefix = part.path ? part.path.length + 1 : 0;
  const changedBy = new Map(part.changed.map((file) => [file.path, file]));
  const entries: Entry[] = [
    ...part.file_list.map((file) => ({ ...file, change: changedBy.get(file.path) })),
    ...part.changed.filter((file) => !part.file_list.some((f) => f.path === file.path)).map((file) => ({ path: file.path, bytes: 0, change: file })),
  ].sort((a, b) => Number(!!b.change) - Number(!!a.change) || b.bytes - a.bytes);
  const uses = map.edges.filter((e) => e.source === part.id && byId.has(e.target));
  const usedBy = map.edges.filter((e) => e.target === part.id && byId.has(e.source));
  const functions = part.changed.flatMap((file) => file.functions.map((fn) => ({ fn, file })));
  const relative = (path: string) => path.slice(prefix) || path;
  const fileItem = (entry: Entry): Item => ({
    key: entry.path,
    label: relative(entry.path),
    color: entry.change ? STATUS_COLOR[entry.change.status] : QUIET,
    badges: entry.change
      ? [
          { text: `+${entry.change.additions}`, tone: "add" },
          { text: `−${entry.change.deletions}`, tone: "del" },
        ]
      : [{ text: bytes(entry.bytes) }],
    entry,
  });
  const partItem = (id: string, imports: number): Item => {
    const other = byId.get(id)!;
    return {
      key: id,
      label: other.name,
      color: other.changed.length ? "var(--cn-hot-2)" : "var(--cn-orb-2)",
      badges: [{ text: `${imports} import${imports === 1 ? "" : "s"}` }, ...(other.changed.length ? [{ text: `${other.changed.length} changed`, tone: "gold" as const }] : [])],
      part: id,
    };
  };

  const lists: Record<CardId, Item[]> = {
    files: entries.map(fileItem),
    changed: entries.filter((entry) => entry.change).map(fileItem),
    functions: functions.map(({ fn, file }) => ({
      key: `${file.path}:${fn.name}`,
      label: fn.name,
      color: fn.change === "added" ? STATUS_COLOR.added : fn.change === "deleted" ? STATUS_COLOR.deleted : STATUS_COLOR.modified,
      badges: [{ text: fileName(file.path) }],
      entry: entries.find((entry) => entry.path === file.path),
      fn: fn.name,
    })),
    uses: uses.map((e) => partItem(e.target, e.imports)),
    usedBy: usedBy.map((e) => partItem(e.source, e.imports)),
  };
  const cards: { id: CardId; value: number; label: string; icon: ReactNode }[] = [
    { id: "files", value: part.files, label: `Files, ${bytes(part.bytes)}`, icon: <Icon d="M7 3h7l4 4v14H7zM14 3v4h4" /> },
    { id: "changed", value: part.changed.length, label: "Changed on this branch", icon: <Icon d="M12 3l2 5 5 .5-4 3.5 1.2 5L12 14.5 7.8 17 9 12 5 8.5l5-.5z" /> },
    { id: "functions", value: functions.length, label: "Functions changed", icon: <Icon d="M9 4c-2 0-3 1-3 3v2c0 1-1 2-2 2 1 0 2 1 2 2v2c0 2 1 3 3 3M15 4c2 0 3 1 3 3v2c0 1 1 2 2 2-1 0-2 1-2 2v2c0 2-1 3-3 3" /> },
    { id: "uses", value: uses.length, label: `Part${uses.length === 1 ? "" : "s"} it uses`, icon: <Icon d="M5 12h12M13 7l5 5-5 5" /> },
    { id: "usedBy", value: usedBy.length, label: `Part${usedBy.length === 1 ? "" : "s"} using it`, icon: <Icon d="M19 12H7M11 7l-5 5 5 5" /> },
  ];

  const [card, setCard] = useState<CardId | null>(entries.length ? "files" : null);
  const [item, setItem] = useState<Item | null>(null);
  const [arrived, setArrived] = useState(props.still);
  // How far a long list is scrolled, in rows, and possibly between two. The wheel and the
  // curved bar set where it's going (goal); each frame eases pos toward it, and the rows,
  // their lines and the bar's thumb are all drawn from pos, so they move as one.
  const [pos, setPos] = useState(0);
  const goal = useRef(0);
  const shown = useRef(0);
  const now = useRef(0);
  const frame = useRef(0);
  // Rows fan in one by one at first; once scrolling, they slide without waiting.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = requestAnimationFrame(() => (frame = requestAnimationFrame(() => setArrived(true))));
    return () => cancelAnimationFrame(frame);
  }, []);

  const hot = part.changed.length > 0;

  const wide = size.width >= 760;
  // Where everything sits when there is room for the fan.
  const top = 64;
  const usable = size.height - top - 24;
  const orb = { x: Math.max(130, size.width * 0.13), y: top + usable / 2 };
  const cardW = 186;
  const cardH = 60;
  const cardGap = 12;
  const cardX = orb.x + 160;
  const cardsTop = orb.y - (cards.length * cardH + (cards.length - 1) * cardGap) / 2;
  const cardMid = (i: number) => cardsTop + i * (cardH + cardGap) + cardH / 2;
  const list = card ? lists[card] : [];
  const fits = Math.max(3, Math.floor((usable + ROW_GAP) / (ROW_H + ROW_GAP)));
  // A list longer than the fan scrolls along it, with the wheel or the curved bar beside it.
  // On a phone the list is a plain column and the page scrolls instead.
  const scrolls = wide && list.length > fits;
  const lastStart = Math.max(0, list.length - fits);
  const at0 = scrolls ? Math.min(pos, lastStart) : 0;
  // Each row on show with its place k along the fan: 0 is the top slot, fits - 1 the bottom.
  // While scrolling, k runs between slots, and a row half past an end is half faded.
  const rows: { r: Item; k: number }[] = scrolls
    ? Array.from({ length: Math.ceil(at0 + fits) - Math.floor(at0) + 1 }, (_, n) => Math.floor(at0) - 1 + n)
        .filter((i) => i >= 0 && i < list.length)
        .map((i) => ({ r: list[i], k: i - at0 }))
    : (wide ? centreOut(list) : list).map((r, k) => ({ r, k }));
  const count = scrolls ? fits : list.length;
  const listX = cardX + cardW + 130;
  const rowW = 260;
  const half = Math.max(1, (count - 1) / 2);
  const rowsTop = orb.y - (count * ROW_H + (count - 1) * ROW_GAP) / 2;
  // The list bows outward in the middle, like the video's fan.
  const row = (k: number) => ({ x: listX + 70 * (1 - ((k - half) / half) ** 2), y: rowsTop + k * (ROW_H + ROW_GAP) });
  // Rows toward the ends fade, so a long list reads as a fan, not a wall; rows sliding past
  // an end fade out completely.
  const fade = (k: number) => {
    const fan = count < 8 ? 1 : 1 - 0.6 * Math.min(1, Math.abs((k - half) / half)) ** 3;
    return fan * Math.max(0, Math.min(1, k + 1, count - k));
  };
  const panelW = 340;
  const panelX = size.width - panelW - 20;
  const right = count ? listX + 70 + rowW + (scrolls ? BAR_GAP + 40 : 0) : cardX + cardW;
  // Slide everything left when the list and the panel would overlap, like a camera pan.
  const shift = Math.max(0, right + 28 - (item ? panelX : size.width - 16));
  const glide = { x: props.from.x - orb.x, y: props.from.y - orb.y };
  const at = (p: Point): CSSProperties | undefined => (wide ? { left: p.x, top: p.y } : undefined);
  const selected = card ? cards.findIndex((c) => c.id === card) : -1;
  const added = part.added;
  const removed = part.removed;

  // One step up: the open file, then the part before this one, then the whole sky.
  const depth = props.trail.length;
  const back = () => (item ? setItem(null) : props.onTrail(depth - 1));
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && back();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const pick = (next: Item) => {
    if (next.part) props.onFocus(next.part);
    else if (next.entry) setItem(next);
  };

  // One frame of the glide: close a share of the gap to the goal that depends on the time
  // since the last frame, so it feels the same at any frame rate.
  // It stops once it arrives, so an idle list costs nothing.
  const step = (time: number) => {
    const dt = now.current ? Math.min(64, time - now.current) : 16;
    now.current = time;
    const gap = goal.current - shown.current;
    shown.current = props.still || Math.abs(gap) < 0.002 ? goal.current : shown.current + gap * (1 - Math.exp(-dt / 70));
    setPos(shown.current);
    frame.current = shown.current === goal.current ? 0 : requestAnimationFrame(step);
  };
  const scrollTo = (next: number) => {
    goal.current = Math.max(0, Math.min(lastStart, next));
    setScrolled(true);
    if (!frame.current) {
      now.current = 0;
      frame.current = requestAnimationFrame(step);
    }
  };
  // The wheel anywhere over the part scrolls the list, a trackpad by fractions of a row;
  // once the wheel rests the list settles on a whole row. Added by hand: React's wheel
  // listener is passive, and the page mustn't scroll underneath.
  const scrollRef = useRef(scrollTo);
  scrollRef.current = scrollTo;
  useEffect(() => {
    const el = stage.current;
    if (!el || !scrolls) return;
    let settle = 0;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const px = event.deltaMode === 1 ? event.deltaY * ROW_H : event.deltaY;
      scrollRef.current(goal.current + px / (ROW_H + ROW_GAP));
      window.clearTimeout(settle);
      settle = window.setTimeout(() => scrollRef.current(Math.round(goal.current)), 140);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      window.clearTimeout(settle);
    };
  }, [scrolls, card]);

  // The scroll bar follows the fan's curve just right of the rows. t runs along it from the
  // first row (0) to the last (count - 1); the thumb covers the share of the list on show.
  const along = (t: number) => ({ x: row(t).x + rowW + BAR_GAP, y: row(t).y + ROW_H / 2 });
  const arc = (from: number, to: number) => {
    const steps = 24;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const p = along(from + ((to - from) * i) / steps);
      return `${i ? "L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }).join(" ");
  };
  const span = Math.max(1, count - 1);
  const thumbFrom = (at0 / list.length) * span;
  const thumbTo = ((at0 + count) / list.length) * span;
  // Pressing or dragging on the bar centres the list on that point, a whole row at a time.
  const barDrag = useRef(false);
  const onBar = (event: ReactPointerEvent<SVGPathElement>) => {
    const box = (event.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const t = (event.clientY - box.top - (rowsTop + ROW_H / 2)) / (ROW_H + ROW_GAP);
    scrollTo(Math.round((t / span) * list.length - count / 2));
  };
  const moving = scrolls && Math.abs(goal.current - pos) > 0.002;
  const lineAt = (k: number) => bezier({ x: cardX + cardW, y: cardMid(selected) }, { x: row(k).x, y: row(k).y + ROW_H / 2 });

  return (
    <div className={`cn-focus${wide ? "" : " cn-focus--narrow"}${arrived ? " cn-focus--arrived" : ""}`}>
      <nav className="cn-focus__crumbs" aria-label="Where you are">
        <button className="cn-focus__back" onClick={back} aria-label="Back one step" title="Back (Esc)">
          ←
        </button>
        <ol>
          <li>
            <button onClick={() => props.onTrail(0)}>Constellation</button>
          </li>
          {props.trail.map((node, i) => (
            <li key={node.id}>
              {i === depth - 1 && !card && !item ? (
                <span aria-current="page">{node.name}</span>
              ) : (
                <button onClick={() => (i === depth - 1 ? setItem(null) : props.onTrail(i + 1))}>{node.name}</button>
              )}
            </li>
          ))}
          {card && (
            <li>
              {item ? <button onClick={() => setItem(null)}>{CRUMB[card]}</button> : <span aria-current="page">{CRUMB[card]}</span>}
            </li>
          )}
          {item?.entry && (
            <li>
              <span aria-current="page" title={item.entry.path}>
                {fileName(item.entry.path)}
              </span>
            </li>
          )}
        </ol>
      </nav>
      <div className="cn-focus__stage" ref={stage} style={wide ? { transform: `translateX(${-shift}px)` } : undefined}>
        {wide && (
          <svg className="cn-focus__lines" width={size.width + shift} height={size.height} aria-hidden="true">
            <defs>
              <linearGradient id="cn-fan" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" style={{ stopColor: "var(--cn-fan-1)", stopOpacity: 0.85 }} />
                <stop offset="100%" style={{ stopColor: "var(--cn-fan-2)", stopOpacity: 0.35 }} />
              </linearGradient>
            </defs>
            {cards.map((c, i) => {
              const d = bezier({ x: orb.x + 62, y: orb.y }, { x: cardX, y: cardMid(i) });
              return (
                <path
                  key={c.id}
                  d={d}
                  pathLength={1}
                  className={`cn-focus__line${i === selected ? " cn-focus__line--lit" : ""}`}
                  style={{ animationDelay: `${300 + i * 70}ms` }}
                />
              );
            })}
            {selected >= 0 &&
              rows.map(({ r, k }, n) => {
                const d = lineAt(k);
                // Once scrolling, lines and tips are simply there; the draw-in is for the first fan.
                const settled = scrolled ? { animation: "none" } : undefined;
                return (
                  <g key={r.key} opacity={fade(k)}>
                    <path d={d} pathLength={1} stroke="url(#cn-fan)" className="cn-focus__line cn-focus__line--fan" style={settled ?? { animationDelay: `${150 + k * 28}ms` }} />
                    <circle cx={row(k).x} cy={row(k).y + ROW_H / 2} r={2.4} className="cn-focus__tip" style={settled ?? { animationDelay: `${450 + k * 28}ms` }} />
                    {/* Sparks ride the lines only while the list is still: a moving path would make them jump. */}
                    {!props.still && !moving && n % 2 === 0 && (
                      <circle r={1.8} className="cn-focus__spark">
                        <animateMotion dur="1.8s" begin={`${0.5 + n * 0.09}s`} repeatCount="indefinite" path={d} />
                      </circle>
                    )}
                  </g>
                );
              })}
          </svg>
        )}

        <div className={`cn-focus__orb${hot ? " cn-focus__orb--hot" : ""}`} style={wide ? ({ left: orb.x, top: orb.y, "--fx": `${glide.x}px`, "--fy": `${glide.y}px` } as CSSProperties) : undefined}>
          <div className="cn-focus__aura" />
          <div className="cn-focus__ball" />
          <div className="cn-focus__title">
            <strong>{part.name}</strong>
            <code>{part.path || "top of the project"}</code>
            <span className="cn-focus__pill">
              {hot ? `${part.changed.length} changed` : "No changes"}
              {hot && (
                <i className="cn-focus__ratio" title={`+${added} −${removed}`}>
                  <b style={{ flex: Math.max(1, added) }} />
                  <b style={{ flex: Math.max(added || removed ? 0 : 1, removed) }} />
                </i>
              )}
            </span>
          </div>
        </div>

        <div className="cn-focus__cards">
          {cards.map((c, i) => (
            <button
              key={c.id}
              className={`cn-card${c.id === card ? " cn-card--on" : ""}${c.id === "changed" && c.value ? " cn-card--hot" : ""}`}
              style={{ ...at({ x: cardX, y: cardsTop + i * (cardH + cardGap) }), width: wide ? cardW : undefined, animationDelay: `${320 + i * 70}ms` }}
              disabled={lists[c.id].length === 0}
              aria-pressed={c.id === card}
              onClick={() => {
                setCard(c.id === card ? null : c.id);
                setItem(null);
                // Another list starts from its top, fanning in again.
                cancelAnimationFrame(frame.current);
                frame.current = 0;
                goal.current = shown.current = 0;
                setPos(0);
                setScrolled(false);
              }}
            >
              <strong>
                {c.icon}
                {c.value.toLocaleString()}
              </strong>
              <span>{c.label}</span>
            </button>
          ))}
        </div>

        {card && (
          <ul className="cn-focus__list" key={card} aria-label={cards[selected].label}>
            {rows.map(({ r, k }) => (
              <li
                key={r.key}
                // Hidden rows sliding past an end can't be clicked through to.
                style={{ ...at(row(k)), width: wide ? rowW : undefined, opacity: wide ? fade(k) : undefined,
                         pointerEvents: wide && fade(k) < 0.3 ? "none" : undefined,
                         ...(scrolled ? { animation: "none" } : { animationDelay: `${200 + k * 28}ms` }) }}
              >
                <button className={`cn-row${item?.key === r.key ? " cn-row--on" : ""}${r.entry?.change ? " cn-row--hot" : ""}`} onClick={() => pick(r)} title={r.part ? "Look inside this part" : r.entry?.path}>
                  <i style={{ background: r.color, color: r.color }} />
                  <span className="cn-row__label">{r.label}</span>
                  {r.badges.map((badge) => (
                    <span key={badge.text} className={`cn-row__badge${badge.tone ? ` cn-row__badge--${badge.tone}` : ""}`}>
                      {badge.text}
                    </span>
                  ))}
                </button>
              </li>
            ))}
          </ul>
        )}

        {card && scrolls && (
          <svg className="cn-focus__bar" width={size.width + shift} height={size.height} aria-hidden="true">
            <path className="cn-focus__track" d={arc(0, span)} />
            <path className="cn-focus__thumb" d={arc(thumbFrom, thumbTo)} />
            <path
              className="cn-focus__grip"
              d={arc(0, span)}
              onPointerDown={(event) => {
                barDrag.current = true;
                event.currentTarget.setPointerCapture(event.pointerId);
                onBar(event);
              }}
              onPointerMove={(event) => barDrag.current && onBar(event)}
              onPointerUp={() => (barDrag.current = false)}
              onPointerCancel={() => (barDrag.current = false)}
            />
            <text className="cn-focus__count" x={along(span).x} y={along(span).y + 26} textAnchor="middle">
              {Math.round(at0) + 1}–{Math.round(at0) + count} of {list.length}
            </text>
          </svg>
        )}
        {card === "files" && part.files > entries.length && (
          <p className="cn-focus__note" style={at({ x: listX + 70, y: rowsTop + count * (ROW_H + ROW_GAP) + (scrolls ? 30 : 6) })}>
            The {entries.length} biggest and changed of its {part.files} files
          </p>
        )}
      </div>

      {item?.entry && (
        <FilePanel
          key={item.key}
          entry={item.entry}
          partName={part.name}
          fn={item.fn}
          style={wide ? { left: panelX, top, width: panelW, maxHeight: usable } : undefined}
          onClose={() => setItem(null)}
          onOpenFile={props.onOpenFile}
        />
      )}
    </div>
  );
}

function FilePanel(props: { entry: Entry; partName: string; fn?: string; style?: CSSProperties; onClose: () => void; onOpenFile: (path: string) => void }) {
  const { entry } = props;
  const file = entry.change;
  const folder = entry.path.split("/").slice(0, -1).join("/");
  const blocks = file?.hunks.length ?? 0;
  return (
    <aside className="cn-panel" style={props.style} aria-label={`About ${entry.path}`}>
      <button className="cn-panel__close" onClick={props.onClose} aria-label="Close">
        ×
      </button>
      <span className="cn-panel__eyebrow">
        <Icon d="M3 7h6l2 2h10v10H3z" /> {props.partName}
      </span>
      <h3>{fileName(entry.path)}</h3>
      <code className="cn-panel__path">{file?.old_path && file.old_path !== file.path ? `Moved from ${file.old_path}` : `in ${folder || "the top folder"}`}</code>
      <div className="cn-panel__actions">
        <span className="cn-panel__status" style={{ color: file ? STATUS_COLOR[file.status] : QUIET }}>
          {file ? STATUS[file.status] : "Not changed"}
        </span>
        {file && (
          <button className="cn-panel__open" onClick={() => props.onOpenFile(entry.path)}>
            Open in Changes ›
          </button>
        )}
      </div>

      {file ? (
        <div className="cn-panel__rate">
          <div>
            <span className="cn-panel__rate-label">Lines changed</span>
            <strong>
              <b className="cn__add">+{file.additions}</b> <b className="cn__del">−{file.deletions}</b>
            </strong>
            <span className="cn-panel__rate-sub">Where in the file</span>
          </div>
          <Spark file={file} />
        </div>
      ) : (
        <p className="cn-panel__note">This branch didn't touch this file. Its whole history is in Commits and Branch flow.</p>
      )}

      <dl className="cn-panel__tiles">
        <Tile icon="M9 4c-2 0-3 1-3 3v2c0 1-1 2-2 2 1 0 2 1 2 2v2c0 2 1 3 3 3M15 4c2 0 3 1 3 3v2c0 1 1 2 2 2-1 0-2 1-2 2v2c0 2-1 3-3 3" value={file?.functions.length ?? 0} label="Functions changed" />
        <Tile icon="M4 6h16M4 12h10M4 18h13" value={blocks} label="Changed blocks" />
        <Tile icon="M7 3h7l4 4v14H7zM14 3v4h4" value={entry.bytes ? bytes(entry.bytes) : "–"} label="Size" />
        <Tile icon="M8 7l-5 5 5 5M16 7l5 5-5 5" value={language(entry.path)} label="Kind" />
      </dl>

      {file && file.functions.length > 0 && (
        <>
          <h4>Functions changed</h4>
          <ul className="cn-panel__fns">
            {file.functions.map((fn) => (
              <li key={fn.name} className={fn.name === props.fn ? "cn-panel__fn--on" : undefined}>
                <code>{fn.name}</code>
                <span className={`cn-panel__change cn-panel__change--${fn.change}`}>{fn.change === "modified" ? "edited" : fn.change}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {file?.uncommitted && <p className="cn-panel__note">Has edits you haven't committed.</p>}
    </aside>
  );
}

// Where in the file the changes land: the file cut into slices, each bar as tall as the
// lines changed in that slice.
function Spark({ file }: { file: FileChange }) {
  const SLICES = 36;
  const length = Math.max(1, ...file.hunks.map((h) => Math.max(h.new_start + h.new_lines, h.old_start + h.old_lines)));
  const counts = new Array(SLICES).fill(0);
  for (const hunk of file.hunks)
    for (const line of hunk.lines) {
      if (line.kind === "context") continue;
      const at = line.new ?? line.old ?? hunk.new_start;
      counts[Math.min(SLICES - 1, Math.floor(((at - 1) / length) * SLICES))] += 1;
    }
  const most = Math.max(1, ...counts);
  return (
    <div className="cn-panel__spark" aria-hidden="true">
      {counts.map((n, i) => (
        <span key={i} className={n ? "cn-panel__spark-on" : undefined} style={{ height: `${n ? 22 + (n / most) * 78 : 10}%`, animationDelay: `${i * 12}ms` }} />
      ))}
    </div>
  );
}

function Tile({ icon, value, label }: { icon: string; value: number | string; label: string }) {
  return (
    <div className="cn-panel__tile">
      <dd>
        <Icon d={icon} />
        {value}
      </dd>
      <dt>{label}</dt>
    </div>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

// The rows that matter most sit in the bright middle of the fan, the rest toward its faded ends.
function centreOut<T>(list: T[]): T[] {
  if (list.length < 8) return list;
  const out: T[] = [];
  list.forEach((item, i) => (i % 2 ? out.unshift(item) : out.push(item)));
  return out;
}

const KINDS: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript", py: "Python", css: "CSS", scss: "CSS",
  html: "HTML", md: "Docs", json: "Config", yml: "Config", yaml: "Config", toml: "Config", sql: "SQL", sh: "Shell",
  go: "Go", rs: "Rust", java: "Java", kt: "Kotlin", svg: "Image", png: "Image",
};

function language(path: string) {
  const ext = fileName(path).split(".").pop()?.toLowerCase() ?? "";
  return KINDS[ext] ?? (ext ? ext.toUpperCase() : "File");
}
