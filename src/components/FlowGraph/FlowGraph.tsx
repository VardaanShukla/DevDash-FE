import { useEffect, useMemo, useRef, useState } from "react";
import type { BranchInfo, Flow, FlowCommit } from "../../api/types";
import "./FlowGraph.css";

// How the project's branches fork off the base and merge back, oldest on the left.
// Each lane is a branch line; the base branch always runs along the top lane, and the
// branch on screen is drawn brighter with a pulse travelling from where it forked.

type Props = {
  flow: Flow;
  head: string;
  branches: BranchInfo[];
  onPick: (branch: string) => void;
  // A small version for the overview: title and graph only, with a link to the full view.
  compact?: boolean;
  onOpen?: () => void;
  // The full view: the graph grows to fill the card, both wide and tall.
  fill?: boolean;
};

// Horizontal gap between commits: stretched to fill the card, within these bounds. The
// full view squeezes harder so a long history fits without scrolling.
const MIN_STEP = 34;
const MIN_STEP_FILL = 16;
const MAX_STEP = 64;
// Space right of the newest commit for its branch name.
const LABEL_ROOM = 200;
// Gap between branch lines; the full view spreads them over the card's height.
const LANE = 34;
const MAX_LANE = 76;
// Room under the graph for the dates.
const AXIS = 26;
const PAD_X = 28;
const PAD_TOP = 40;
const PAD_BOTTOM = 18;
// Lane colours after the base lane, which is always the brand blue.
const PALETTE = ["#14b8a6", "#a855f7", "#f59e0b", "#22c55e", "#ec4899", "#6366f1", "#06b6d4"];

// seg: which branch line a commit or edge belongs to. Lanes are reused once a branch
// has merged, so colour and highlighting follow the line, not the lane.
type Node = { commit: FlowCommit; row: number; lane: number; seg: number; x: number; y: number };
type Edge = { d: string; seg: number; key: string; x: number };

export default function FlowGraph({ flow, head, branches, onPick, compact, onOpen, fill }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Node | null>(null);
  const [available, setAvailable] = useState({ width: 0, height: 0 });
  const count = flow.commits.length;
  const step = Math.min(
    MAX_STEP,
    Math.max(fill ? MIN_STEP_FILL : MIN_STEP, (available.width - PAD_X * 2 - LABEL_ROOM) / Math.max(1, count - 1)),
  );
  const { nodes, edges, lanes, width, height, headPath, headSeg, lane } = useMemo(() => {
    const first = layout(flow, head, step, LANE);
    if (!fill || first.lanes < 2) return { ...first, lane: LANE };
    const room = available.height - PAD_TOP - PAD_BOTTOM - AXIS - 16;
    const lane = Math.min(MAX_LANE, Math.max(LANE, room / (first.lanes - 1)));
    return { ...layout(flow, head, step, lane), lane };
  }, [flow, head, step, fill, available.height]);
  const svgHeight = fill ? height + AXIS : height;

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setAvailable({ width: el.clientWidth, height: el.clientHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const merged = new Set(branches.filter((b) => b.merged || b.gone).map((b) => b.name));
  const local = new Set(branches.map((b) => b.name));

  // Newest work is on the right; start there.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [width]);

  if (nodes.length === 0) return null;

  const color = (seg: number) => (seg === 0 ? "var(--dd-blue-strong)" : PALETTE[(seg - 1) % PALETTE.length]);
  // Lines draw in from left to right, in about 1.6 seconds whatever the width.
  const delay = (x: number) => `${((x / width) * 1.6).toFixed(2)}s`;

  return (
    <section className={`flow card${compact ? " flow--compact" : ""}${fill ? " flow--fill" : ""}`}>
      {compact ? (
        <header className="flow__header">
          <h2 className="flow__title">Branch flow</h2>
          {onOpen && (
            <button className="card__link" onClick={onOpen}>
              Open ›
            </button>
          )}
        </header>
      ) : (
        <header className="flow__header">
          <div>
            {/* The full view's page title already says Branch flow. */}
            {!fill && <h2 className="flow__title">Branch flow</h2>}
            <p className="flow__subtitle">
              How work splits off <code>{flow.base ?? "the main branch"}</code> and comes back. Newest on the right.
            </p>
          </div>
          <ul className="flow__legend">
            <li>
              <span className="flow__swatch" style={{ background: "var(--dd-blue-strong)" }} />
              {flow.base ?? "base"}
            </li>
            <li>
              <span className="flow__swatch flow__swatch--glow" style={{ background: color(Math.max(0, headSeg)) }} />
              {head}
            </li>
            <li>
              <span className="flow__dot flow__dot--merge" /> merge
            </li>
            <li>
              <span className="flow__dot flow__dot--ai" /> made with AI
            </li>
          </ul>
        </header>
      )}

      <div className="flow__scroller" ref={scroller}>
        <svg
          key={`${flow.commits[0]?.sha}-${head}`}
          className="flow__svg"
          width={width}
          height={svgHeight}
          viewBox={`0 0 ${width} ${svgHeight}`}
          role="img"
          aria-label={`Branch flow of the last ${nodes.length} commits`}
        >
          <defs>
            <filter id="flow-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          </defs>

          {Array.from({ length: lanes }, (_, i) => (
            <line
              key={i}
              className="flow__track"
              x1={0}
              x2={width}
              y1={PAD_TOP + i * lane}
              y2={PAD_TOP + i * lane}
            />
          ))}

          {flow.truncated && (
            <text className="flow__older" x={6} y={PAD_TOP - 18}>
              ← older
            </text>
          )}

          {edges.map((edge) => (
            <path
              key={edge.key}
              d={edge.d}
              pathLength={1}
              className={`flow__edge${edge.seg === headSeg ? " flow__edge--head" : ""}`}
              stroke={color(edge.seg)}
              style={{ animationDelay: delay(edge.x) }}
            />
          ))}

          {headPath && (
            <>
              <path d={headPath} className="flow__head-glow" stroke={color(Math.max(0, headSeg))} filter="url(#flow-glow)" />
              <circle r={5} className="flow__pulse" fill={color(Math.max(0, headSeg))}>
                <animateMotion dur="3.2s" repeatCount="indefinite" path={headPath} begin="1.8s" />
              </circle>
            </>
          )}

          {nodes.map((node) => {
            const isMerge = node.commit.parents.length > 1;
            return (
              <g
                key={node.commit.sha}
                className="flow__node"
                style={{ animationDelay: delay(node.x) }}
                onMouseEnter={() => setHover(node)}
                onMouseLeave={() => setHover((h) => (h === node ? null : h))}
              >
                <circle cx={node.x} cy={node.y} r={12} fill="transparent" />
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={isMerge ? 6.5 : 5}
                  className={`flow__commit${isMerge ? " flow__commit--merge" : ""}`}
                  stroke={color(node.seg)}
                  fill={isMerge ? "var(--dd-card)" : color(node.seg)}
                />
                {node.commit.ai && <circle cx={node.x + 5} cy={node.y - 5} r={2.6} className="flow__ai" />}
              </g>
            );
          })}

          {placeLabels(nodes, head, merged, height).map(({ node, name, text, left, y, w }) => {
            const clickable = local.has(name) && name !== head;
            return (
              <g
                key={name}
                className={`flow__label${name === head ? " flow__label--head" : ""}${clickable ? " flow__label--link" : ""}`}
                onClick={clickable ? () => onPick(name) : undefined}
                style={{ animationDelay: `${(parseFloat(delay(node.x)) + 0.3).toFixed(2)}s` }}
              >
                <title>{clickable ? `Open ${name}` : name}</title>
                {y !== node.y && <line className="flow__label-tie" x1={node.x} y1={node.y} x2={left} y2={y} stroke={color(node.seg)} />}
                <rect x={left} y={y - 9} width={w} height={18} rx={9} stroke={color(node.seg)} />
                <text x={left + w / 2} y={y + 4} textAnchor="middle">
                  {text}
                </text>
              </g>
            );
          })}
          {fill &&
            dateTicks(nodes).map((tick) => (
              <g key={tick.x} className="flow__date">
                <line x1={tick.x} x2={tick.x} y1={height - 6} y2={height + 2} />
                <text x={tick.x} y={height + 16} textAnchor="middle">
                  {tick.label}
                </text>
              </g>
            ))}
        </svg>

        {hover && (
          <div
            className="flow__tip"
            style={{ left: Math.min(hover.x + 14, width - 250), top: hover.y + 14 }}
            role="tooltip"
          >
            <strong>{hover.commit.subject}</strong>
            <span>
              {hover.commit.author} · {ago(hover.commit.authored_at)} · {hover.commit.short_sha}
            </span>
            {hover.commit.branches.length > 0 && (
              <span>
                Tip of {hover.commit.branches.map((name) => (merged.has(name) ? `${name} (finished)` : name)).join(", ")}
              </span>
            )}
            {hover.commit.parents.length > 1 && <span className="flow__tip-tag">Merge</span>}
            {hover.commit.ai && <span className="flow__tip-tag flow__tip-tag--ai">Made with AI</span>}
          </div>
        )}
      </div>
      {!compact && <p className="flow__hint">Point at a dot to see the commit. Click a branch name to open it.</p>}
    </section>
  );
}

// A date under the first commit of each day, skipping any that would crowd the last one.
type Placed = { node: Node; name: string; text: string; left: number; y: number; w: number };

// Branch names sit right of their newest commit. Finished branches (merged, or deleted on
// GitHub) are named only in the dot's tooltip, to keep it calm. A name that would cover
// another moves up or down a row, tied to its dot by a line; with no free row it's left to
// the dot's tooltip, so names never overlap.
function placeLabels(nodes: Node[], head: string, merged: Set<string>, height: number): Placed[] {
  const placed: Placed[] = [];
  const overlaps = (left: number, y: number, w: number) =>
    placed.some((p) => left < p.left + p.w + 4 && p.left < left + w + 4 && Math.abs(p.y - y) < 20);
  for (const node of nodes) {
    let x = node.x + 12;
    for (const name of node.commit.branches.filter((n) => n === head || !merged.has(n))) {
      const text = name.length > 24 ? `${name.slice(0, 23)}…` : name;
      const w = text.length * 6.6 + 16;
      const y = [0, -22, 22, -44, 44]
        .map((offset) => node.y + offset)
        .find((row) => row >= 10 && row <= height - 10 && !overlaps(x, row, w));
      if (y !== undefined) {
        placed.push({ node, name, text, left: x, y, w });
        if (y === node.y) x += w + 4;
      }
    }
  }
  return placed;
}

function dateTicks(nodes: Node[]) {
  const ticks: { x: number; label: string }[] = [];
  let lastDay = "";
  for (const node of [...nodes].sort((a, b) => a.x - b.x)) {
    const date = new Date(node.commit.authored_at);
    const day = date.toDateString();
    if (day === lastDay) continue;
    lastDay = day;
    if (ticks.length && node.x - ticks[ticks.length - 1].x < 64) continue;
    ticks.push({ x: node.x, label: date.toLocaleDateString([], { day: "numeric", month: "short" }) });
  }
  return ticks;
}

function layout(flow: Flow, head: string, step: number, laneGap: number) {
  const commits = flow.commits;
  const n = commits.length;
  const rowOf = new Map(commits.map((c, i) => [c.sha, i] as const));
  const tipOf = (name: string | null) => (name ? commits.find((c) => c.branches.includes(name)) : undefined);
  const baseTip = tipOf(flow.base);

  // The classic git-graph walk: each lane waits for the next commit of its line.
  const waiting: (string | null)[] = [];
  if (baseTip) waiting[0] = baseTip.sha;
  const laneOf = new Map<string, number>();
  const segOf = new Map<string, number>();
  const laneSeg: number[] = [0];
  let nextSeg = 1;
  const free = () => {
    const i = waiting.findIndex((sha, lane) => sha == null && (lane > 0 || !baseTip));
    return i === -1 ? Math.max(waiting.length, baseTip ? 1 : 0) : i;
  };
  for (const commit of commits) {
    let lane = waiting.indexOf(commit.sha);
    if (lane === -1) {
      lane = free();
      laneSeg[lane] = nextSeg++;
    }
    waiting.forEach((sha, other) => {
      if (other !== lane && sha === commit.sha) waiting[other] = null;
    });
    laneOf.set(commit.sha, lane);
    segOf.set(commit.sha, laneSeg[lane] ?? 0);
    waiting[lane] = commit.parents[0] ?? null;
    for (const parent of commit.parents.slice(1)) {
      if (!waiting.includes(parent)) {
        const lane = free();
        waiting[lane] = parent;
        laneSeg[lane] = nextSeg++;
      }
    }
  }

  const x = (row: number) => PAD_X + (n - 1 - row) * step;
  const y = (lane: number) => PAD_TOP + lane * laneGap;
  const nodes: Node[] = commits.map((commit, row) => {
    const lane = laneOf.get(commit.sha) ?? 0;
    return { commit, row, lane, seg: segOf.get(commit.sha) ?? 0, x: x(row), y: y(lane) };
  });
  const lanes = Math.max(1, ...nodes.map((node) => node.lane + 1));

  const edges: Edge[] = [];
  for (const node of nodes) {
    node.commit.parents.forEach((parent, k) => {
      const prow = rowOf.get(parent);
      const key = `${node.commit.sha}-${parent}`;
      if (prow === undefined) {
        // The parent is older than the history shown: run the line off the left edge.
        edges.push({ key, seg: node.seg, x: 0, d: `M ${node.x} ${node.y} L 0 ${node.y}` });
        return;
      }
      const p = nodes[prow];
      if (p.lane === node.lane) {
        edges.push({ key, seg: node.seg, x: p.x, d: `M ${p.x} ${p.y} L ${node.x} ${node.y}` });
      } else if (k === 0) {
        // A branch's first commit: it leaves the parent's lane right after the parent.
        const bend = p.x + step;
        edges.push({
          key,
          seg: node.seg,
          x: p.x,
          d: `M ${p.x} ${p.y} C ${p.x + step / 2} ${p.y}, ${p.x + step / 2} ${node.y}, ${bend} ${node.y} L ${node.x} ${node.y}`,
        });
      } else {
        // A merge: the merged line runs along its own lane and joins just before the merge.
        const bend = node.x - step;
        edges.push({
          key,
          seg: p.seg,
          x: p.x,
          d: `M ${p.x} ${p.y} L ${bend} ${p.y} C ${node.x - step / 2} ${p.y}, ${node.x - step / 2} ${node.y}, ${node.x} ${node.y}`,
        });
      }
    });
  }

  // The branch on screen: from its tip back along its own lane to where it forked.
  const headTip = tipOf(head);
  let headPath: string | null = null;
  let headSeg = -1;
  if (headTip) {
    const tip = nodes[rowOf.get(headTip.sha)!];
    headSeg = tip.seg;
    const points: Node[] = [tip];
    let current = tip;
    while (current.commit.parents[0] !== undefined) {
      const prow = rowOf.get(current.commit.parents[0]);
      if (prow === undefined) break;
      const parent = nodes[prow];
      points.push(parent);
      if (parent.lane !== tip.lane) break;
      current = parent;
    }
    if (points.length > 1) {
      points.reverse();
      headPath = points
        .map((point, i) => {
          if (i === 0) return `M ${point.x} ${point.y}`;
          const prev = points[i - 1];
          if (prev.y === point.y) return `L ${point.x} ${point.y}`;
          const bend = prev.x + step;
          return `C ${prev.x + step / 2} ${prev.y}, ${prev.x + step / 2} ${point.y}, ${bend} ${point.y} L ${point.x} ${point.y}`;
        })
        .join(" ");
    }
  }

  const width = PAD_X * 2 + Math.max(0, n - 1) * step + LABEL_ROOM;
  const height = PAD_TOP + (lanes - 1) * laneGap + PAD_BOTTOM + 10;
  return { nodes, edges, lanes, width, height, headPath, headSeg };
}

function ago(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(iso).toLocaleDateString();
}
