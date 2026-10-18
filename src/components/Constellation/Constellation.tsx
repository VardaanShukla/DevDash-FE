import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileChange, ProjectMap as MapData } from "../../api/types";
import { mapParts } from "../ProjectMap/ProjectMap";
import Inspector, { ICON, Icon } from "./Inspector";
import { centre, layout, partFiles, type Node } from "./layout";
import Sky, { zoomAt, type View } from "./Sky";
import { useReducedMotion, useSize } from "./shared";
import "./Constellation.css";

// The project as a constellation, laid out like a tool: the parts in a list on the left,
// the sky in the middle, and a panel on the right that explains whatever is picked.
// Picking a part, in the list or the sky, flies the camera to it and opens its tree.

type Props = {
  map: MapData;
  files: FileChange[];
  project: string;
  onOpenFile: (path: string) => void;
};

const FIT: View = { k: 1, x: 0, y: 0 };
const CLOSE_UP = 1.7;

export default function Constellation({ map, files, project, onOpenFile }: Props) {
  const skyBox = useRef<HTMLDivElement>(null);
  const size = useSize(skyBox);
  const parts = useMemo(() => mapParts(map, files), [map, files]);
  const nodes = useMemo(() => layout(parts, map, size.width, size.height), [parts, map, size.width, size.height]);
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const core = centre(size.width, size.height);
  const still = useReducedMotion();

  const [selected, setSelected] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [showImports, setShowImports] = useState(true);
  const [railOpen, setRailOpen] = useState(false);
  const [view, setView] = useState<View>(FIT);
  const [flying, setFlying] = useState(false);
  const flight = useRef<number | undefined>(undefined);

  // Camera moves from a click glide; drags and scrolls follow the pointer at once.
  const fly = useCallback((next: View) => {
    setFlying(true);
    setView(next);
    window.clearTimeout(flight.current);
    flight.current = window.setTimeout(() => setFlying(false), 850);
  }, []);
  const closeUp = useCallback(
    (node: Node): View => {
      // Aim a little past the orb, so its tree is in the middle of the picture too. A phone
      // has less room, so it zooms less and aims further out along the tree.
      const narrow = size.width < 560;
      const k = narrow ? 1.15 : CLOSE_UP;
      const past = narrow ? 70 : 34;
      const aim = { x: node.x + Math.cos(node.angle) * past, y: node.y + Math.sin(node.angle) * past };
      return { k, x: size.width / 2 - aim.x * k, y: size.height / 2 - aim.y * k };
    },
    [size.width, size.height],
  );
  const select = useCallback(
    (id: string | null) => {
      setSelected(id);
      setFilePath(null);
      setRailOpen(false);
      const node = id ? byId.get(id) : null;
      fly(node ? closeUp(node) : FIT);
    },
    [byId, closeUp, fly],
  );
  const selectFile = (part: string, path: string | null) => {
    if (part !== selected) select(part);
    setFilePath(path);
  };

  // Keep the picked part in view when the window changes size.
  useEffect(() => {
    const node = selected ? byId.get(selected) : null;
    setView(node ? closeUp(node) : FIT);
    // Only on resize, not on every pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || (event.target as HTMLElement).tagName === "INPUT") return;
      if (filePath) setFilePath(null);
      else if (selected) select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filePath, selected, select]);

  const part = selected ? byId.get(selected) ?? null : null;
  const entry = part && filePath ? partFiles(part).find((e) => e.path === filePath) ?? null : null;
  const hovered = hover ? byId.get(hover) ?? null : null;
  const changedParts = nodes.filter((node) => node.changed.length > 0).length;

  return (
    <section className={`cn${railOpen ? " cn--rail-open" : ""}`} aria-label="Project constellation">
      <Rail
        nodes={nodes}
        selected={selected}
        hover={hover}
        query={query}
        onlyChanged={onlyChanged}
        changedParts={changedParts}
        onQuery={setQuery}
        onOnlyChanged={setOnlyChanged}
        onHover={setHover}
        onSelect={select}
        onSelectFile={selectFile}
      />

      <div className="cn-stage" ref={skyBox}>
        {size.width > 0 && (
          <Sky
            box={skyBox}
            map={map}
            nodes={nodes}
            core={core}
            size={size}
            project={project}
            view={view}
            flying={flying}
            selected={selected}
            file={filePath}
            hover={hover}
            showImports={showImports}
            onlyChanged={onlyChanged}
            still={still}
            onView={setView}
            onHover={setHover}
            onSelect={select}
            onSelectFile={selectFile}
            onBackground={() => selected && select(null)}
          />
        )}

        <div className="cn-tools" role="toolbar" aria-label="Sky controls">
          <button className="cn-tools__parts" onClick={() => setRailOpen((open) => !open)} aria-expanded={railOpen}>
            <Icon d={ICON.search} /> Parts
          </button>
          <div className="cn-tools__group">
            <button onClick={() => setView((v) => zoomAt(v, core, 1 / 1.25))} aria-label="Zoom out" title="Zoom out">
              −
            </button>
            <span>{Math.round(view.k * 100)}%</span>
            <button onClick={() => setView((v) => zoomAt(v, core, 1.25))} aria-label="Zoom in" title="Zoom in">
              +
            </button>
            <button onClick={() => select(null)} aria-label="Show everything" title="Show everything">
              <Icon d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            </button>
          </div>
          <div className="cn-tools__group">
            <button className={`cn-chip${showImports ? " cn-chip--on" : ""}`} aria-pressed={showImports} onClick={() => setShowImports((v) => !v)}>
              Imports
            </button>
            <button
              className={`cn-chip${onlyChanged ? " cn-chip--on" : ""}`}
              aria-pressed={onlyChanged}
              onClick={() => setOnlyChanged((v) => !v)}
              disabled={changedParts === 0}
            >
              Changed only
            </button>
          </div>
          <p className="cn-hint">{selected ? "Click a dot to see that file · Esc to go back" : "Scroll to zoom · drag to move · click a part"}</p>
        </div>

        {hovered && hovered.id !== selected && <HoverCard node={hovered} view={view} map={map} width={size.width} />}

        <ul className="cn-legend" aria-label="Legend">
          <li>
            <i className="cn-dot cn-dot--sun" /> Project
          </li>
          <li>
            <i className="cn-dot" /> Part
          </li>
          <li>
            <i className="cn-dot cn-dot--hot" /> Changed part
          </li>
          <li>
            <i className="cn-dot cn-dot--file" /> File or folder
          </li>
          <li>
            <i className="cn-legend__line" /> Import
          </li>
        </ul>
      </div>

      <Inspector
        map={map}
        nodes={nodes}
        byId={byId}
        files={files}
        part={part}
        file={entry}
        onSelect={select}
        onSelectFile={(path) => (selected ? selectFile(selected, path) : undefined)}
        onOpenFile={onOpenFile}
      />
    </section>
  );
}

// The parts as a list, with a search that also finds files by name.
function Rail(props: {
  nodes: Node[];
  selected: string | null;
  hover: string | null;
  query: string;
  onlyChanged: boolean;
  changedParts: number;
  onQuery: (query: string) => void;
  onOnlyChanged: (on: boolean) => void;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onSelectFile: (part: string, path: string) => void;
}) {
  const q = props.query.trim().toLowerCase();
  const sorted = [...props.nodes].sort((a, b) => b.changed.length - a.changed.length || b.files - a.files);
  const shown = sorted.filter((node) => (!props.onlyChanged || node.changed.length > 0) && (!q || `${node.name} ${node.path}`.toLowerCase().includes(q)));
  const found = q
    ? props.nodes.flatMap((node) => partFiles(node).filter((e) => e.path.toLowerCase().includes(q)).map((e) => ({ node, entry: e }))).slice(0, 30)
    : [];
  return (
    <nav className="cn-rail" aria-label="Parts">
      <label className="cn-search">
        <Icon d={ICON.search} />
        <input value={props.query} onChange={(event) => props.onQuery(event.target.value)} placeholder="Find a part or file" aria-label="Find a part or file" />
      </label>
      <div className="cn-rail__filters" role="group" aria-label="Show">
        <button className={`cn-chip${!props.onlyChanged ? " cn-chip--on" : ""}`} onClick={() => props.onOnlyChanged(false)}>
          All {props.nodes.length}
        </button>
        <button className={`cn-chip${props.onlyChanged ? " cn-chip--on" : ""}`} onClick={() => props.onOnlyChanged(true)} disabled={props.changedParts === 0}>
          Changed {props.changedParts}
        </button>
      </div>
      <h4>Parts</h4>
      <ul className="cn-list">
        {shown.map((node) => (
          <li key={node.id}>
            <button
              className={`cn-list__row${node.id === props.selected ? " cn-list__row--on" : ""}${node.id === props.hover ? " cn-list__row--hover" : ""}`}
              onClick={() => props.onSelect(node.id)}
              onMouseEnter={() => props.onHover(node.id)}
              onMouseLeave={() => props.onHover(null)}
            >
              <i className={`cn-dot${node.changed.length ? " cn-dot--hot" : ""}`} />
              <span className="cn-list__text">
                <span className="cn-list__label">{node.name}</span>
                <span className="cn-list__sub">{node.path || "top of the project"}</span>
              </span>
              {node.changed.length > 0 ? <span className="cn-badge cn-badge--gold">{node.changed.length}</span> : <span className="cn-badge">{node.files}</span>}
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="cn-inspector__note">No part matches.</li>}
      </ul>
      {found.length > 0 && (
        <>
          <h4>Files</h4>
          <ul className="cn-list">
            {found.map(({ node, entry }) => (
              <li key={entry.path}>
                <button className="cn-list__row" onClick={() => props.onSelectFile(node.id, entry.path)} title={entry.path}>
                  <i className={`cn-dot cn-dot--file${entry.change ? " cn-dot--lit" : ""}`} />
                  <span className="cn-list__text">
                    <span className="cn-list__label cn-list__label--mono">{entry.path.split("/").pop()}</span>
                    <span className="cn-list__sub">{node.name}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </nav>
  );
}

// A small card by the part under the pointer.
function HoverCard({ node, view, map, width }: { node: Node; view: View; map: MapData; width: number }) {
  const x = node.x * view.k + view.x;
  const y = node.y * view.k + view.y;
  const left = x > width - 260;
  const uses = map.edges.filter((e) => e.source === node.id).length;
  const usedBy = map.edges.filter((e) => e.target === node.id).length;
  return (
    <div className={`cn-hover${left ? " cn-hover--left" : ""}`} style={{ left: x + (left ? -(node.r * view.k + 16) : node.r * view.k + 16), top: y }} role="tooltip">
      <strong>{node.name}</strong>
      <span className="cn-hover__path">{node.path || "top of the project"}</span>
      <span>
        {node.files} files · uses {uses} · used by {usedBy}
      </span>
      {node.changed.length > 0 && (
        <span className="cn-hover__hot">
          {node.changed.length} changed <b className="cn-add">+{node.added}</b> <b className="cn-del">−{node.removed}</b>
        </span>
      )}
      <em>Click to look inside</em>
    </div>
  );
}
