import { useEffect, useMemo, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { ProjectMap as MapData } from "../../api/types";
import { curve, type Node } from "./layout";
import { seeded, trim, type Point } from "./shared";

// The sky itself: the project as a gold sun, its parts as orbs on beams, each orb's tree of
// folders and files, and light running along the imports. Scroll to zoom, drag to move.

export type View = { k: number; x: number; y: number };

type Props = {
  box: RefObject<HTMLDivElement | null>;
  map: MapData;
  nodes: Node[];
  core: Point;
  size: { width: number; height: number };
  project: string;
  view: View;
  // The camera is gliding to a part, so the move is animated rather than instant.
  flying: boolean;
  selected: string | null;
  file: string | null;
  hover: string | null;
  showImports: boolean;
  onlyChanged: boolean;
  still: boolean;
  onView: (view: View) => void;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onSelectFile: (part: string, path: string) => void;
  onBackground: () => void;
};

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.5;

export default function Sky(props: Props) {
  const { map, nodes, core, size, view, selected, hover, still } = props;
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const drag = useRef<{ x: number; y: number; view: View; moved: boolean } | null>(null);
  const moved = useRef(false);

  // Zoom toward the pointer. React's wheel listener is passive, so this one is added by hand.
  const { box, onView } = props;
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      onView(zoomAt(viewRef.current, { x: event.clientX - rect.left, y: event.clientY - rect.top }, Math.exp(-event.deltaY * 0.0015)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [box, onView]);

  const onPointerDown = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    moved.current = false;
    drag.current = { x: event.clientX, y: event.clientY, view, moved: false };
  };
  const onPointerMove = (event: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) (event.currentTarget as Element).setPointerCapture(event.pointerId);
    d.moved = moved.current = true;
    onView({ ...d.view, x: d.view.x + dx, y: d.view.y + dy });
  };
  const onPointerUp = () => (drag.current = null);
  // A drag that ends on a part isn't a click on it.
  const click = (action: () => void) => () => !moved.current && action();

  const related = new Set(
    map.edges.flatMap((edge) => (edge.source === (hover ?? selected) ? [edge.target] : edge.target === (hover ?? selected) ? [edge.source] : [])),
  );
  const faded = (node: Node) =>
    (props.onlyChanged && node.changed.length === 0) ||
    (hover !== null && hover !== node.id && !related.has(node.id)) ||
    (hover === null && selected !== null && selected !== node.id && !related.has(node.id));

  return (
    <svg
      className="cn-sky"
      width={size.width}
      height={size.height}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={(event) => event.target === event.currentTarget && click(props.onBackground)()}
    >
      <Defs />
      <Stars width={size.width} height={size.height} onClick={click(props.onBackground)} />
      <g className={`cn-sky__world${props.flying ? " cn-sky__world--fly" : ""}`} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, "--k": view.k } as CSSProperties}>
        <g className="cn-sky__drift" style={{ transformOrigin: `${core.x}px ${core.y}px` }}>
          <Dust core={core} still={still} />

          {/* Gold beams from the project to every part. */}
          {nodes.map((node, i) => {
            const hot = node.changed.length > 0;
            const d = `M ${core.x} ${core.y} L ${node.x} ${node.y}`;
            return (
              <g key={`beam-${node.id}`} className={faded(node) ? "cn-sky__faded" : undefined}>
                <path d={d} pathLength={1} className={`cn-sky__beam-glow${hot ? " cn-sky__beam-glow--hot" : ""}`} style={{ animationDelay: `${450 + i * 45}ms` }} />
                <path d={d} pathLength={1} className={`cn-sky__beam${hot ? " cn-sky__beam--hot" : ""}`} style={{ animationDelay: `${450 + i * 45}ms` }} />
                {!still && hot && <Comet path={d} begin={1.2 + i * 0.4} dur={2.4} gold />}
              </g>
            );
          })}

          {/* Imports between parts: light runs from the part that uses to the part it uses. */}
          {props.showImports &&
            map.edges.map((edge, i) => {
              const from = byId.get(edge.source);
              const to = byId.get(edge.target);
              if (!from || !to) return null;
              const d = curve(from, to, core);
              const focus = hover ?? selected;
              const lit = focus === edge.source || focus === edge.target;
              return (
                <g key={`${edge.source}>${edge.target}`} className={focus && !lit ? "cn-sky__faded" : undefined}>
                  <path
                    d={d}
                    pathLength={1}
                    className={`cn-sky__edge${lit ? " cn-sky__edge--lit" : ""}`}
                    strokeWidth={0.8 + Math.min(2.2, Math.log2(1 + edge.imports) * 0.6)}
                    style={{ animationDelay: `${1300 + i * 40}ms` }}
                  />
                  {!still && <Comet path={d} begin={1.6 + (i % 7) * 0.41} dur={2.8 + (i % 5) * 0.5} />}
                </g>
              );
            })}

          <Sun core={core} name={props.project} files={map.total_files} onClick={click(props.onBackground)} />

          {nodes.map((node, i) => {
            const hot = node.changed.length > 0;
            const open = node.id === selected;
            const below = Math.sin(node.angle) < 0.55;
            const share = Math.max(1, Math.round((node.files / Math.max(1, map.total_files)) * 100));
            const style = { "--fx": `${core.x - node.x}px`, "--fy": `${core.y - node.y}px`, animationDelay: `${350 + i * 55}ms` } as CSSProperties;
            return (
              <g key={node.id} transform={`translate(${node.x} ${node.y})`} className={faded(node) ? "cn-sky__faded" : undefined}>
                <g
                  className={`cn-sky__node${hot ? " cn-sky__node--hot" : ""}${open ? " cn-sky__node--open" : ""}`}
                  style={style}
                  role="button"
                  tabIndex={0}
                  aria-pressed={open}
                  aria-label={`${node.name}: ${node.files} files${hot ? `, ${node.changed.length} changed` : ""}`}
                  onClick={click(() => props.onSelect(node.id))}
                  onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && (event.preventDefault(), props.onSelect(node.id))}
                  onMouseEnter={() => props.onHover(node.id)}
                  onMouseLeave={() => props.onHover(null)}
                >
                  <g key={open ? "open" : "shut"} className={`cn-sky__tree${open ? " cn-sky__tree--open" : ""}`} style={{ animationDelay: open ? "0ms" : `${900 + i * 55}ms` }}>
                    {(open ? node.openTwigs : node.twigs).map((twig) => (
                      <line key={`l-${twig.key}`} x1={twig.from.x} y1={twig.from.y} x2={twig.x} y2={twig.y} className={`cn-sky__twig${twig.lit ? " cn-sky__twig--lit" : ""}`} />
                    ))}
                    {(open ? node.openTwigs : node.twigs).map((twig, k) => {
                      const picked = twig.path !== undefined && twig.path === props.file;
                      return (
                        <g
                          key={twig.key}
                          className={twig.path ? "cn-sky__leaf-hit" : undefined}
                          onClick={
                            twig.path
                              ? (event) => {
                                  event.stopPropagation();
                                  click(() => props.onSelectFile(node.id, twig.path!))();
                                }
                              : undefined
                          }
                        >
                          {twig.path && <circle cx={twig.x} cy={twig.y} r={8} className="cn-sky__leaf-pad" />}
                          {picked && <circle cx={twig.x} cy={twig.y} r={twig.r + 4} className="cn-sky__leaf-ring" />}
                          <circle cx={twig.x} cy={twig.y} r={twig.r} fill={twig.color} filter={twig.lit ? "url(#cn-glow)" : undefined} className="cn-sky__leaf" style={{ animationDelay: `${(k % 5) * 0.6}s` }}>
                            <title>{twig.title}</title>
                          </circle>
                          {(open || twig.count) && (
                            <text
                              x={twig.x + (Math.cos(node.angle) < -0.2 ? -(twig.r + 3) : twig.r + 3)}
                              y={twig.y - twig.r - 1}
                              className={`cn-sky__twig-label${twig.lit ? " cn-sky__twig-label--lit" : ""}${open ? " cn-sky__twig-label--open" : ""}`}
                              textAnchor={Math.cos(node.angle) < -0.2 ? "end" : "start"}
                            >
                              {open ? `${trim(twig.name, 22)}${twig.count ? ` ${twig.count}` : ""}` : twig.count}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </g>
                  <circle r={node.r * 2.4} fill={hot ? "url(#cn-halo)" : "url(#cn-halo-cool)"} />
                  <circle r={node.r + 5} className={`cn-sky__ring${hot ? " cn-sky__ring--hot" : ""}`} />
                  <circle r={node.r} fill={hot ? "url(#cn-orb-hot)" : "url(#cn-orb)"} className="cn-sky__orb" />
                  <ellipse cx={-node.r * 0.32} cy={-node.r * 0.38} rx={node.r * 0.32} ry={node.r * 0.2} className="cn-sky__shine" />
                  <text y={below ? node.r + 17 : -node.r - 24} className="cn-sky__name">
                    {trim(node.name, 20)}
                  </text>
                  <g transform={`translate(0 ${below ? node.r + 30 : -node.r - 11})`}>
                    <rect x={-17} y={-9} width={34} height={13} rx={4} className={`cn-sky__share${hot ? " cn-sky__share--hot" : ""}`} />
                    <text y={1} className="cn-sky__share-text">
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
  );
}

export function zoomAt(view: View, at: Point, factor: number): View {
  const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.k * factor));
  const ratio = k / view.k;
  return { k, x: at.x - (at.x - view.x) * ratio, y: at.y - (at.y - view.y) * ratio };
}

function Defs() {
  return (
    <defs>
      <radialGradient id="cn-core" cx="40%" cy="36%" r="65%">
        <stop offset="0%" stopColor="#fffbea" />
        <stop offset="40%" stopColor="#f7d488" />
        <stop offset="100%" stopColor="#9b6a1c" />
      </radialGradient>
      <radialGradient id="cn-orb" cx="38%" cy="35%" r="70%">
        <stop offset="0%" stopColor="#fbe9ff" />
        <stop offset="45%" stopColor="#c69ae8" />
        <stop offset="100%" stopColor="#5a3a8f" />
      </radialGradient>
      <radialGradient id="cn-orb-hot" cx="38%" cy="35%" r="70%">
        <stop offset="0%" stopColor="#fff0f4" />
        <stop offset="45%" stopColor="#e58aa8" />
        <stop offset="100%" stopColor="#7a2a4c" />
      </radialGradient>
      <radialGradient id="cn-halo">
        <stop offset="0%" stopColor="#f5c76b" stopOpacity="0.5" />
        <stop offset="100%" stopColor="#f5c76b" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="cn-halo-cool">
        <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.32" />
        <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="cn-sun-halo">
        <stop offset="0%" stopColor="#ffe6a6" stopOpacity="0.65" />
        <stop offset="35%" stopColor="#f5c76b" stopOpacity="0.22" />
        <stop offset="100%" stopColor="#f5c76b" stopOpacity="0" />
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
function Sun({ core, name, files, onClick }: { core: Point; name: string; files: number; onClick: () => void }) {
  const ticks = Array.from({ length: 84 }, (_, i) => (i / 84) * Math.PI * 2);
  return (
    <g className="cn-sky__sun" transform={`translate(${core.x} ${core.y})`} onClick={onClick}>
      <circle r={110} fill="url(#cn-sun-halo)" className="cn-sky__sun-halo" />
      <g className="cn-sky__sun-ticks">
        {ticks.map((a, i) => {
          const outer = 30 + (i % 3 === 0 ? 9 : 5);
          return <line key={i} x1={Math.cos(a) * 30} y1={Math.sin(a) * 30} x2={Math.cos(a) * outer} y2={Math.sin(a) * outer} />;
        })}
      </g>
      <circle r={44} className="cn-sky__sun-ring" />
      <circle r={25} fill="url(#cn-core)" filter="url(#cn-glow)" className="cn-sky__sun-ball" />
      <text x={52} y={-2} className="cn-sky__sun-name">
        {trim(name, 24)}
      </text>
      <text x={52} y={14} className="cn-sky__sun-count">
        {files.toLocaleString()} files
      </text>
    </g>
  );
}

// A light with a short tail, running along a line again and again.
function Comet({ path, begin, dur, gold }: { path: string; begin: number; dur: number; gold?: boolean }) {
  return (
    <g className={gold ? "cn-sky__comet cn-sky__comet--gold" : "cn-sky__comet"}>
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
    <g className="cn-sky__dust" transform={`translate(${core.x} ${core.y})`}>
      {grains.map((g, i) => (
        <circle
          key={i}
          r={g.r}
          className={g.gold ? "cn-sky__grain cn-sky__grain--gold" : "cn-sky__grain"}
          style={{ "--dx": `${g.dx}px`, "--dy": `${g.dy}px`, animationDelay: `${120 + g.delay}ms` } as CSSProperties}
        />
      ))}
      {Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2 + 0.2;
        const long = 110 + ((i * 37) % 90);
        return <line key={i} x2={Math.cos(a) * long} y2={Math.sin(a) * long} className="cn-sky__ray" style={{ animationDelay: `${(i % 4) * 40}ms` }} />;
      })}
    </g>
  );
}

// A few hundred faint stars, the same ones every time for a given size.
function Stars({ width, height, onClick }: { width: number; height: number; onClick: () => void }) {
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
    <g className="cn-sky__stars" onClick={onClick}>
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} opacity={s.o} />
      ))}
    </g>
  );
}
