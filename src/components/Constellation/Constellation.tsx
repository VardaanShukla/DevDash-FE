import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { FileChange, ProjectMap as MapData } from "../../api/types";
import { mapParts, type Part } from "../ProjectMap/ProjectMap";
import Focus from "./Focus";
import { QUIET, STATUS, STATUS_COLOR, seeded, trim, useReducedMotion, useSize, type Point } from "./shared";
import "./Constellation.css";

// The project as a constellation: the project is the sun in the middle, its parts orbit it,
// and each part grows a little tree of its folders and files, the ones this branch changed
// lit up. Light runs along the real imports between parts. Scroll or use the buttons to
// zoom, drag to move. Picking a part dives into it (see Focus).

type Props = {
  map: MapData;
  files: FileChange[];
  project: string;
  onOpenFile: (path: string) => void;
};

export type Node = Part & { x: number; y: number; r: number; angle: number; twigs: Twig[] };
// One dot in a part's tree: a folder inside the part, or a file.
type Twig = { key: string; x: number; y: number; from: Point; r: number; color: string; label?: string; title: string; lit: boolean };
type View = { k: number; x: number; y: number };

// A part's tree shows at most this many branches, and a folder this many files.
const BRANCHES = 7;
const LEAVES = 4;
// Room kept at the bottom for the stats bar, which wraps onto more lines on a phone.
const bar = (width: number) => (width < 760 ? 132 : 92);
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;

export default function Constellation({ map, files, project, onOpenFile }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const size = useSize(box);
  const parts = useMemo(() => mapParts(map, files), [map, files]);
  const nodes = useMemo(() => layout(parts, map, size.width, size.height), [parts, map, size.width, size.height]);
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const [hover, setHover] = useState<string | null>(null);
  // The parts looked into, in order: the breadcrumb runs Constellation › first › … › the one on screen.
  const [trail, setTrail] = useState<string[]>([]);
  const focus = trail.length ? trail[trail.length - 1] : null;
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; view: View; moved: boolean } | null>(null);
  const still = useReducedMotion();
  const core = centre(size.width, size.height);

  // A mouse wheel zooms toward the pointer; a trackpad's two-finger scroll moves the map and
  // its pinch (which browsers send as a wheel with Ctrl) zooms. React's wheel listener is
  // passive, so this one is added by hand.
  useEffect(() => {
    const el = box.current;
    if (!el || focus) return;
    const onWheel = (event: WheelEvent) => {
      if ((event.target as HTMLElement).closest(".cn__bar, .cn__legend, .cn__tools")) return;
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const at = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      // Trackpads scroll in small pixel steps, often sideways too; wheels in lines or big notches.
      const trackpad = event.deltaMode === 0 && (event.deltaX !== 0 || Math.abs(event.deltaY) < 50);
      if (event.ctrlKey) setView((v) => zoomAt(v, at, Math.exp(-event.deltaY * 0.01)));
      else if (trackpad) setView((v) => ({ ...v, x: v.x - event.deltaX, y: v.y - event.deltaY }));
      else setView((v) => zoomAt(v, at, Math.exp(-event.deltaY * 0.0015)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [focus]);

  const onPointerDown = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    drag.current = { x: event.clientX, y: event.clientY, view, moved: false };
  };
  const onPointerMove = (event: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) (event.currentTarget as Element).setPointerCapture(event.pointerId);
    d.moved = true;
    setView({ ...d.view, x: d.view.x + dx, y: d.view.y + dy });
  };
  const onPointerUp = () => {
    // A drag that ends on a part isn't a click on it.
    window.setTimeout(() => (drag.current = null));
  };
  const open = (id: string) => {
    if (drag.current?.moved) return;
    setHover(null);
    setTrail([id]);
  };
  // Going to a part already in the trail steps back to it rather than adding it again.
  const dive = (id: string) => setTrail((t) => (t.includes(id) ? t.slice(0, t.indexOf(id) + 1) : [...t, id]));

  const neighbours = new Set(
    map.edges.flatMap((edge) => (edge.source === hover ? [edge.target] : edge.target === hover ? [edge.source] : [])),
  );
  const changed = files.length;
  const functions = files.reduce((sum, file) => sum + file.functions.length, 0);
  const additions = files.reduce((sum, file) => sum + file.additions, 0);
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0);
  const focused = focus ? byId.get(focus) ?? null : null;
  // The sky dives toward the part that was picked.
  const origin = focused ? `${focused.x * view.k + view.x}px ${focused.y * view.k + view.y}px` : undefined;

  return (
    <section className={`cn${focused ? " cn--focused" : ""}`} ref={box} aria-label="Project constellation">
      {size.width > 0 && (
        <>
          <svg
            className="cn__graph"
            width={size.width}
            height={size.height}
            style={{ transformOrigin: origin }}
            aria-hidden={focused ? true : undefined}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <Defs />
            <Stars width={size.width} height={size.height} />
            <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
              <g className="cn__drift" style={{ transformOrigin: `${core.x}px ${core.y}px` }}>
                <Dust core={core} still={still} />

                {/* Gold beams from the sun to every part. */}
                {nodes.map((node, i) => {
                  const hot = node.changed.length > 0;
                  const d = `M ${core.x} ${core.y} L ${node.x} ${node.y}`;
                  return (
                    <g key={`beam-${node.id}`} className={hover && hover !== node.id ? "cn__dim" : undefined}>
                      <path d={d} pathLength={1} className={`cn__beam-glow${hot ? " cn__beam-glow--hot" : ""}`} style={{ animationDelay: `${450 + i * 45}ms` }} />
                      <path d={d} pathLength={1} className={`cn__beam${hot ? " cn__beam--hot" : ""}`} style={{ animationDelay: `${450 + i * 45}ms` }} />
                      {!still && hot && <Comet path={d} begin={1.2 + i * 0.4} dur={2.4} gold />}
                    </g>
                  );
                })}

                {/* Imports between parts: light runs from the part that uses to the part it uses. */}
                {map.edges.map((edge, i) => {
                  const from = byId.get(edge.source);
                  const to = byId.get(edge.target);
                  if (!from || !to) return null;
                  const d = curve(from, to, core);
                  const lit = hover === edge.source || hover === edge.target;
                  const width = 0.8 + Math.min(2.2, Math.log2(1 + edge.imports) * 0.6);
                  return (
                    <g key={`${edge.source}>${edge.target}`} className={hover && !lit ? "cn__dim" : undefined}>
                      <path d={d} pathLength={1} className={`cn__edge${lit ? " cn__edge--lit" : ""}`} strokeWidth={width} style={{ animationDelay: `${1300 + i * 40}ms` }}>
                        <title>{`${from.name} uses ${to.name}: ${edge.imports} import${edge.imports === 1 ? "" : "s"}`}</title>
                      </path>
                      {!still && <Comet path={d} begin={1.6 + (i % 7) * 0.41} dur={2.8 + (i % 5) * 0.5} />}
                    </g>
                  );
                })}

                <Sun core={core} name={project} files={map.total_files} />

                {nodes.map((node, i) => {
                  const hot = node.changed.length > 0;
                  const dim = hover !== null && hover !== node.id && !neighbours.has(node.id);
                  const below = Math.sin(node.angle) < 0.55;
                  const share = Math.max(1, Math.round((node.files / Math.max(1, map.total_files)) * 100));
                  const style = {
                    "--fx": `${core.x - node.x}px`,
                    "--fy": `${core.y - node.y}px`,
                    animationDelay: `${350 + i * 55}ms`,
                  } as CSSProperties;
                  return (
                    <g key={node.id} transform={`translate(${node.x} ${node.y})`} className={dim ? "cn__dim" : undefined}>
                      <g
                        className={`cn__node${hot ? " cn__node--hot" : ""}`}
                        style={style}
                        role="button"
                        tabIndex={focused ? -1 : 0}
                        aria-label={`${node.name}: ${node.files} files${hot ? `, ${node.changed.length} changed` : ""}. Look inside`}
                        onClick={() => open(node.id)}
                        onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && (event.preventDefault(), open(node.id))}
                        onMouseEnter={() => setHover(node.id)}
                        onMouseLeave={() => setHover(null)}
                      >
                        <g className="cn__tree" style={{ animationDelay: `${900 + i * 55}ms` }}>
                          {node.twigs.map((twig) => (
                            <line key={`l-${twig.key}`} x1={twig.from.x} y1={twig.from.y} x2={twig.x} y2={twig.y} className={`cn__twig${twig.lit ? " cn__twig--lit" : ""}`} />
                          ))}
                          {node.twigs.map((twig, k) => (
                            <g key={twig.key}>
                              <circle cx={twig.x} cy={twig.y} r={twig.r} filter={twig.lit ? "url(#cn-glow)" : undefined} className="cn__leaf" style={{ fill: twig.color, animationDelay: `${(k % 5) * 0.6}s` }}>
                                <title>{twig.title}</title>
                              </circle>
                              {twig.label && (
                                <text x={twig.x + twig.r + 3} y={twig.y - twig.r - 1} className={`cn__twig-label${twig.lit ? " cn__twig-label--lit" : ""}`}>
                                  {twig.label}
                                </text>
                              )}
                            </g>
                          ))}
                        </g>
                        <circle r={node.r * 2.4} fill={hot ? "url(#cn-halo)" : "url(#cn-halo-cool)"} className="cn__halo" />
                        <circle r={node.r + 5} className={`cn__node-ring${hot ? " cn__node-ring--hot" : ""}`} />
                        <circle r={node.r} fill={hot ? "url(#cn-orb-hot)" : "url(#cn-orb)"} className="cn__orb" />
                        <ellipse cx={-node.r * 0.32} cy={-node.r * 0.38} rx={node.r * 0.32} ry={node.r * 0.2} className="cn__shine" />
                        <text y={below ? node.r + 17 : -node.r - 24} className="cn__name">
                          {trim(node.name, 20)}
                        </text>
                        <g transform={`translate(0 ${below ? node.r + 30 : -node.r - 11})`}>
                          <rect x={-17} y={-9} width={34} height={13} rx={4} className={`cn__share${hot ? " cn__share--hot" : ""}`} />
                          <text y={1} className="cn__share-text">
                            {share}%
                          </text>
                        </g>
                      </g>
                    </g>
                  );
                })}
              </g>
            </g>
          </svg>

          <div className="cn__tools" role="toolbar" aria-label="Zoom">
            <button onClick={() => setView((v) => zoomAt(v, core, 1 / 1.25))} aria-label="Zoom out" title="Zoom out">
              −
            </button>
            <span>{Math.round(view.k * 100)}%</span>
            <button onClick={() => setView((v) => zoomAt(v, core, 1.25))} aria-label="Zoom in" title="Zoom in">
              +
            </button>
            <button onClick={() => setView({ k: 1, x: 0, y: 0 })} aria-label="Fit" title="Fit the whole sky" disabled={view.k === 1 && view.x === 0 && view.y === 0}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
              </svg>
            </button>
          </div>

          {size.width >= 1150 && (
            <ul className="cn__legend" aria-label="Legend">
              <li className="cn__legend-title">Legend</li>
              <li>
                <i className="cn__key cn__key--sun" /> The project
              </li>
              <li>
                <i className="cn__key cn__key--orb" /> A part, % of all files
              </li>
              <li>
                <i className="cn__key cn__key--hot" /> Part changed on this branch
              </li>
              <li>
                <i className="cn__key cn__key--dot" style={{ background: QUIET }} /> Folder or file, number of files
              </li>
              <li>
                <i className="cn__key cn__key--dot" style={{ background: STATUS_COLOR.modified }} />
                <i className="cn__key cn__key--dot" style={{ background: STATUS_COLOR.added }} />
                <i className="cn__key cn__key--dot" style={{ background: STATUS_COLOR.deleted }} /> Edited, new, gone
              </li>
              <li>
                <i className="cn__key cn__key--line" /> Uses: light runs to what's used
              </li>
            </ul>
          )}

          <div className="cn__bar">
            <Stat icon="parts" value={parts.length} label="Parts" />
            <Stat icon="files" value={map.total_files} label="Files" />
            <Stat icon="changed" value={changed} label="Changed" tone={changed ? "gold" : undefined} />
            <Stat icon="functions" value={functions} label="Functions" />
            <div className="cn__stat">
              <span className="cn__stat-label">Lines changed</span>
              <strong>
                <b className="cn__add">+{additions.toLocaleString()}</b> <b className="cn__del">−{deletions.toLocaleString()}</b>
              </strong>
            </div>
            <p className="cn__hint">{map.edges.length ? "Pick a part to look inside" : "No imports found between these parts"}</p>
          </div>

          {focused && (
            <Focus
              key={focused.id}
              part={focused}
              from={{ x: focused.x * view.k + view.x, y: focused.y * view.k + view.y }}
              map={map}
              byId={byId}
              size={size}
              still={still}
              trail={trail.map((id) => byId.get(id)).filter((node): node is Node => !!node)}
              onTrail={(depth) => setTrail((t) => t.slice(0, depth))}
              onFocus={dive}
              onOpenFile={onOpenFile}
            />
          )}
        </>
      )}
    </section>
  );
}

// A gradient stop coloured by a theme variable. SVG's own stop-color attribute can't read
// CSS variables; its style can.
function Stop({ at, color, opacity }: { at: string; color: string; opacity?: string }) {
  return <stop offset={at} style={{ stopColor: `var(${color})`, stopOpacity: opacity }} />;
}

function Defs() {
  return (
    <defs>
      {/* Colours come from the theme (Constellation.css), so day and night each get their own sky. */}
      <radialGradient id="cn-core" cx="40%" cy="36%" r="65%">
        <Stop at="0%" color="--cn-core-1" />
        <Stop at="40%" color="--cn-core-2" />
        <Stop at="100%" color="--cn-core-3" />
      </radialGradient>
      <radialGradient id="cn-orb" cx="38%" cy="35%" r="70%">
        <Stop at="0%" color="--cn-orb-1" />
        <Stop at="45%" color="--cn-orb-2" />
        <Stop at="100%" color="--cn-orb-3" />
      </radialGradient>
      <radialGradient id="cn-orb-hot" cx="38%" cy="35%" r="70%">
        <Stop at="0%" color="--cn-hot-1" />
        <Stop at="45%" color="--cn-hot-2" />
        <Stop at="100%" color="--cn-hot-3" />
      </radialGradient>
      <radialGradient id="cn-halo">
        <Stop at="0%" color="--cn-halo" opacity="var(--cn-halo-strength)" />
        <Stop at="100%" color="--cn-halo" opacity="0" />
      </radialGradient>
      <radialGradient id="cn-halo-cool">
        <Stop at="0%" color="--cn-halo-cool" opacity="var(--cn-halo-cool-strength)" />
        <Stop at="100%" color="--cn-halo-cool" opacity="0" />
      </radialGradient>
      <radialGradient id="cn-sun-halo">
        <Stop at="0%" color="--cn-sun-halo-1" opacity="0.65" />
        <Stop at="35%" color="--cn-sun-halo-2" opacity="0.22" />
        <Stop at="100%" color="--cn-sun-halo-2" opacity="0" />
      </radialGradient>
      <filter id="cn-glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2.4" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="cn-beam" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" />
      </filter>
    </defs>
  );
}

// The project in the middle: a gold sun with a ring of fine rays, like a seal.
function Sun({ core, name, files }: { core: Point; name: string; files: number }) {
  const ticks = Array.from({ length: 84 }, (_, i) => (i / 84) * Math.PI * 2);
  return (
    <g className="cn__core" transform={`translate(${core.x} ${core.y})`}>
      <circle r={110} fill="url(#cn-sun-halo)" className="cn__core-halo" />
      <g className="cn__core-ticks">
        {ticks.map((a, i) => {
          const inner = 30;
          const outer = 30 + (i % 3 === 0 ? 9 : 5);
          return <line key={i} x1={Math.cos(a) * inner} y1={Math.sin(a) * inner} x2={Math.cos(a) * outer} y2={Math.sin(a) * outer} />;
        })}
      </g>
      <circle r={44} className="cn__core-ring" />
      <circle r={25} fill="url(#cn-core)" filter="url(#cn-glow)" className="cn__core-ball" />
      <text x={52} y={-2} className="cn__core-name">
        {trim(name, 24)}
      </text>
      <text x={52} y={14} className="cn__core-count">
        {files.toLocaleString()} files
      </text>
    </g>
  );
}

// A light with a short tail, running along a line again and again.
function Comet({ path, begin, dur, gold }: { path: string; begin: number; dur: number; gold?: boolean }) {
  return (
    <g className={gold ? "cn__comet cn__comet--gold" : "cn__comet"}>
      {[0, 0.05, 0.1, 0.15].map((lag, i) => (
        <circle key={i} r={2.6 - i * 0.55} opacity={1 - i * 0.24} filter={i === 0 ? "url(#cn-glow)" : undefined}>
          <animateMotion dur={`${dur}s`} begin={`${begin - lag}s`} repeatCount="indefinite" path={path} />
        </circle>
      ))}
    </g>
  );
}

// Dust thrown out when the sun bursts open, gone after a second or two.
function Dust({ core, still }: { core: Point; still: boolean }) {
  const grains = useMemo(() => {
    const random = seeded(11);
    return Array.from({ length: 90 }, () => {
      const a = random() * Math.PI * 2;
      const reach = 40 + random() ** 0.6 * 260;
      return { dx: Math.cos(a) * reach, dy: Math.sin(a) * reach, r: 0.6 + random() * 1.6, delay: random() * 260, gold: random() > 0.45 };
    });
  }, []);
  if (still) return null;
  return (
    <g className="cn__dust" transform={`translate(${core.x} ${core.y})`}>
      {grains.map((g, i) => (
        <circle
          key={i}
          r={g.r}
          className={g.gold ? "cn__grain cn__grain--gold" : "cn__grain"}
          style={{ "--dx": `${g.dx}px`, "--dy": `${g.dy}px`, animationDelay: `${120 + g.delay}ms` } as CSSProperties}
        />
      ))}
      {Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2 + 0.2;
        const long = 110 + ((i * 37) % 90);
        return <line key={i} x2={Math.cos(a) * long} y2={Math.sin(a) * long} className="cn__ray" style={{ animationDelay: `${(i % 4) * 40}ms` }} />;
      })}
    </g>
  );
}

type IconName = "parts" | "files" | "changed" | "functions";

function Stat({ icon, value, label, tone }: { icon: IconName; value: number; label: string; tone?: "gold" }) {
  return (
    <div className={`cn__stat${tone ? ` cn__stat--${tone}` : ""}`}>
      <span className="cn__stat-label">{label}</span>
      <strong>
        <StatIcon name={icon} />
        {value.toLocaleString()}
      </strong>
    </div>
  );
}

function StatIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, string> = {
    parts: "M12 12m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0M5 6l5 4.5M19 6l-5 4.5M12 21v-6.5",
    files: "M7 3h7l4 4v14H7zM14 3v4h4",
    changed: "M12 3l2 5 5 .5-4 3.5 1.2 5L12 14.5 7.8 17 9 12 5 8.5l5-.5z",
    functions: "M9 4c-2 0-3 1-3 3v2c0 1-1 2-2 2 1 0 2 1 2 2v2c0 2 1 3 3 3M15 4c2 0 3 1 3 3v2c0 1 1 2 2 2-1 0-2 1-2 2v2c0 2-1 3-3 3",
  };
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

// A few hundred faint stars, the same ones every time for a given size.
function Stars({ width, height }: { width: number; height: number }) {
  const stars = useMemo(() => {
    const random = seeded(7);
    return Array.from({ length: Math.round((width * height) / 8000) }, () => ({
      x: random() * width,
      y: random() * height,
      r: random() * 0.9 + 0.2,
      o: random() * 0.5 + 0.1,
    }));
  }, [width, height]);
  return (
    <g className="cn__stars">
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} opacity={s.o} />
      ))}
    </g>
  );
}

function zoomAt(view: View, at: Point, factor: number): View {
  const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.k * factor));
  const ratio = k / view.k;
  return { k, x: at.x - (at.x - view.x) * ratio, y: at.y - (at.y - view.y) * ratio };
}

function centre(width: number, height: number): Point {
  return { x: width / 2, y: (height - bar(width)) / 2 + 14 };
}

// Parts around the sun, linked parts next to each other so lines stay short.
function layout(parts: Part[], map: MapData, width: number, height: number): Node[] {
  if (width === 0 || parts.length === 0) return [];
  const core = centre(width, height);
  const narrow = width < 760;
  const ring = narrow ? (height - bar(width)) / 2 - 70 : Math.max(120, Math.min(width / 2 - 150, (height - bar(width)) / 2 - 90));
  const links = (a: string, b: string) =>
    map.edges.filter((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a)).reduce((sum, e) => sum + e.imports, 0);
  const degree = (id: string) => map.edges.filter((e) => e.source === id || e.target === id).length;
  const left = [...parts].sort((a, b) => degree(b.id) - degree(a.id) || b.files - a.files);
  const order: Part[] = [left.shift()!];
  while (left.length) {
    const last = order[order.length - 1];
    left.sort((a, b) => links(last.id, b.id) - links(last.id, a.id) || degree(b.id) - degree(a.id) || b.files - a.files);
    order.push(left.shift()!);
  }
  const most = Math.max(1, ...parts.map((p) => p.files));
  // A short ring looks lopsided, so stretch it to the screen's shape.
  const rx = narrow ? width / 2 - 70 : Math.min(width / 2 - 150, ring * 1.4);
  return order.map((part, i) => {
    // Alternate a little in and out, so neighbours' trees don't collide.
    const wobble = order.length > 6 ? (i % 2 ? 0.86 : 1) : 1;
    const angle = -Math.PI / 2 + (i / order.length) * Math.PI * 2;
    const r = 9 + 14 * Math.sqrt(part.files / most);
    return {
      ...part,
      angle,
      r,
      x: core.x + Math.cos(angle) * rx * wobble,
      y: core.y + Math.sin(angle) * ring * wobble,
      twigs: grow(part, angle, r, narrow ? 0.7 : 1),
    };
  });
}

// A part's tree: its folders as dots with their file count, each with a few of its files,
// and its loose files. Changed files always make it in, so the branch's work is visible.
function grow(part: Part, angle: number, r: number, scale: number): Twig[] {
  const prefix = part.path ? part.path.length + 1 : 0;
  const changed = new Map(part.changed.map((file) => [file.path, file]));
  const all = new Map<string, { path: string; bytes: number; change?: FileChange }>();
  for (const file of part.file_list) all.set(file.path, { ...file, change: changed.get(file.path) });
  for (const file of part.changed) if (!all.has(file.path)) all.set(file.path, { path: file.path, bytes: 0, change: file });

  const folders = new Map<string, (typeof all extends Map<string, infer V> ? V : never)[]>();
  const loose: (typeof all extends Map<string, infer V> ? V : never)[] = [];
  for (const file of all.values()) {
    const rest = file.path.slice(prefix);
    const slash = rest.indexOf("/");
    if (slash > 0) folders.set(rest.slice(0, slash), [...(folders.get(rest.slice(0, slash)) ?? []), file]);
    else loose.push(file);
  }
  const rank = (a: { change?: FileChange; bytes: number }, b: { change?: FileChange; bytes: number }) =>
    Number(!!b.change) - Number(!!a.change) || b.bytes - a.bytes;
  loose.sort(rank);
  const folderList = [...folders.entries()].sort(
    (a, b) => Number(b[1].some((f) => f.change)) - Number(a[1].some((f) => f.change)) || b[1].length - a[1].length,
  );
  const shownFolders = folderList.slice(0, Math.min(4, BRANCHES));
  const shownLoose = loose.slice(0, BRANCHES - shownFolders.length);
  const branches = [
    ...shownFolders.map(([name, list]) => ({ kind: "folder" as const, name, list })),
    ...shownLoose.map((file) => ({ kind: "file" as const, file })),
  ];
  // Mix folders and files so the tree looks even.
  branches.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "folder" ? -1 : 1));
  const spread = Math.min(1.9, 0.42 * branches.length);
  const twigs: Twig[] = [];
  const at = (a: number, d: number): Point => ({ x: Math.cos(a) * d, y: Math.sin(a) * d });
  const order = interleave(branches);
  order.forEach((branch, k) => {
    const a = angle + (order.length === 1 ? 0 : (k / (order.length - 1) - 0.5) * spread);
    const reach = (r + 30 + (k % 2) * 16) * scale + (1 - scale) * r;
    const point = at(a, reach);
    if (branch.kind === "file") {
      const change = branch.file.change;
      twigs.push({
        key: branch.file.path,
        ...point,
        from: { x: 0, y: 0 },
        r: change ? 3.4 : 2.4,
        color: change ? STATUS_COLOR[change.status] : QUIET,
        label: change ? `+${change.additions}` : undefined,
        title: `${branch.file.path}${change ? ` (${STATUS[change.status].toLowerCase()})` : ""}`,
        lit: !!change,
      });
      return;
    }
    const lit = branch.list.some((f) => f.change);
    twigs.push({
      key: `${part.id}/${branch.name}/`,
      ...point,
      from: { x: 0, y: 0 },
      r: 4.2,
      color: lit ? STATUS_COLOR.modified : "var(--cn-twig)",
      label: String(branch.list.length),
      title: `${part.path ? `${part.path}/` : ""}${branch.name}: ${branch.list.length} file${branch.list.length === 1 ? "" : "s"}`,
      lit,
    });
    const leaves = [...branch.list].sort(rank).slice(0, LEAVES);
    leaves.forEach((file, j) => {
      const b = a + (leaves.length === 1 ? 0 : (j / (leaves.length - 1) - 0.5) * 0.7);
      const tip = { x: point.x + Math.cos(b) * 24 * scale, y: point.y + Math.sin(b) * 24 * scale };
      twigs.push({
        key: file.path,
        ...tip,
        from: point,
        r: file.change ? 3 : 1.8,
        color: file.change ? STATUS_COLOR[file.change.status] : QUIET,
        title: `${file.path}${file.change ? ` (${STATUS[file.change.status].toLowerCase()})` : ""}`,
        lit: !!file.change,
      });
    });
  });
  return twigs;
}

// Folders spread through the fan rather than bunched on one side.
function interleave<T extends { kind: string }>(list: T[]): T[] {
  const folders = list.filter((b) => b.kind === "folder");
  const files = list.filter((b) => b.kind !== "folder");
  const out: T[] = [];
  while (folders.length || files.length) {
    if (files.length) out.push(files.shift()!);
    if (folders.length) out.push(folders.shift()!);
  }
  return out;
}

// Lines between parts bow toward the sun, like the strands of a web.
function curve(from: Point, to: Point, core: Point) {
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const q = { x: mid.x + (core.x - mid.x) * 0.38, y: mid.y + (core.y - mid.y) * 0.38 };
  return `M ${from.x} ${from.y} Q ${q.x} ${q.y} ${to.x} ${to.y}`;
}
