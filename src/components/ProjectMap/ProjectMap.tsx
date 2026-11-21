import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FileChange, MapArea, ProjectMap as MapData } from "../../api/types";
import "./ProjectMap.css";

// The project's main parts laid out like an architecture diagram: parts that use others
// on the left, the parts they build on to the right, each arrow a real import found in
// the code. Parts with no code links sit in their own column. Picking a part shows what
// it holds, what it uses and what this branch changed in it.

type Props = {
  map: MapData;
  files: FileChange[];
  onOpenFile: (path: string) => void;
  // Told the picked part's name, for the breadcrumb.
  onSelect?: (name: string | null) => void;
};

// One colour per language, shared by the bars and the legend.
const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#eab308",
  Python: "#3b82f6",
  CSS: "#a855f7",
  HTML: "#f97316",
  Docs: "#64748b",
  Config: "#94a3b8",
  Images: "#14b8a6",
  Go: "#06b6d4",
  Rust: "#b45309",
  Java: "#dc2626",
  Kotlin: "#8b5cf6",
  SQL: "#0ea5e9",
  Shell: "#22c55e",
  Vue: "#10b981",
  Svelte: "#f43f5e",
};
const languageColor = (name: string) => LANGUAGE_COLORS[name] ?? "#cbd5e1";

export type Part = MapArea & { changed: FileChange[]; added: number; removed: number };
type Line = { key: string; source: string; target: string; imports: number; d: string };

export default function ProjectMap({ map, files, onOpenFile, onSelect }: Props) {
  const parts = useMemo(() => mapParts(map, files), [map, files]);
  const byId = useMemo(() => new Map(parts.map((part) => [part.id, part])), [parts]);
  const { layers, loose } = useMemo(() => arrange(map, parts), [map, parts]);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const diagram = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLButtonElement>());
  const [lines, setLines] = useState<Line[]>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Start on the first part this branch changed, or else the biggest part.
  useEffect(() => {
    setSelected((current) => {
      if (current && byId.has(current)) return current;
      return (parts.find((part) => part.changed.length > 0) ?? [...parts].sort((a, b) => b.files - a.files)[0])?.id ?? null;
    });
  }, [parts, byId]);

  // Arrows are drawn between the cards where they ended up on screen.
  useLayoutEffect(() => {
    const box = diagram.current;
    if (!box) return;
    const draw = () => {
      const origin = box.getBoundingClientRect();
      const rect = (id: string) => {
        const r = cards.current.get(id)?.getBoundingClientRect();
        return r && { left: r.left - origin.left + box.scrollLeft, right: r.right - origin.left + box.scrollLeft, mid: r.top - origin.top + box.scrollTop + r.height / 2 };
      };
      // Sized from the cards, not the scroll area: the arrows' own layer would otherwise hold
      // the area at its old, wider size after the cards close up.
      let right = 0;
      let bottom = 0;
      for (const el of cards.current.values()) {
        if (!box.contains(el)) continue;
        const r = el.getBoundingClientRect();
        right = Math.max(right, r.right - origin.left + box.scrollLeft);
        bottom = Math.max(bottom, r.bottom - origin.top + box.scrollTop);
      }
      setSize({ width: Math.max(box.clientWidth, right + 8), height: Math.max(box.clientHeight, bottom + 8) });
      setLines(
        map.edges.flatMap((edge) => {
          const from = rect(edge.source);
          const to = rect(edge.target);
          if (!from || !to) return [];
          const forward = to.left >= from.right;
          const sx = forward ? from.right : from.left;
          const tx = forward ? to.left - 6 : to.right + 6;
          const bend = Math.max(40, Math.abs(tx - sx) / 2) * (forward ? 1 : -1);
          const d = `M ${sx} ${from.mid} C ${sx + bend} ${from.mid}, ${tx - bend} ${to.mid}, ${tx} ${to.mid}`;
          return [{ key: `${edge.source}>${edge.target}`, source: edge.source, target: edge.target, imports: edge.imports, d }];
        }),
      );
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(box);
    return () => observer.disconnect();
  }, [map, layers, loose]);

  const focus = hover ?? selected;
  const neighbours = new Set(
    map.edges.flatMap((edge) => (edge.source === focus ? [edge.target] : edge.target === focus ? [edge.source] : [])),
  );
  const changedParts = parts.filter((part) => part.changed.length > 0);
  const languages = totals(map.areas);
  const totalLanguageFiles = languages.reduce((sum, l) => sum + l.files, 0);
  const active = selected ? byId.get(selected) ?? null : null;
  useEffect(() => {
    onSelect?.(active?.name ?? null);
    return () => onSelect?.(null);
  }, [active?.name, onSelect]);

  const card = (part: Part) => {
    const hot = part.changed.length > 0;
    const dim = hover !== null && hover !== part.id && !neighbours.has(part.id);
    const total = part.languages.reduce((sum, l) => sum + l.files, 0);
    return (
      <button
        key={part.id}
        ref={(el) => {
          if (el) cards.current.set(part.id, el);
          else cards.current.delete(part.id);
        }}
        className={`part${hot ? " part--changed" : ""}${part.id === selected ? " part--selected" : ""}${dim ? " part--dim" : ""}`}
        onClick={() => setSelected(part.id)}
        onMouseEnter={() => setHover(part.id)}
        onMouseLeave={() => setHover(null)}
      >
        <span className="part__top">
          <span className="part__name">{part.name}</span>
          <span className="part__count">
            {part.files} file{part.files === 1 ? "" : "s"}
          </span>
        </span>
        <span className="part__role">{describe(part)}</span>
        {total > 0 && (
          <span className="part__bar">
            {part.languages.map((l) => (
              <span key={l.name} style={{ flex: l.files, background: languageColor(l.name) }} />
            ))}
          </span>
        )}
        {hot && (
          <span className="part__change">
            {part.changed.length} changed <b className="part__add">+{part.added}</b> <b className="part__del">−{part.removed}</b>
          </span>
        )}
      </button>
    );
  };

  return (
    <section className="map card">
      <div className="map__main">
        <header className="map__header">
          <p className="map__summary">
            <strong>
              {map.total_files.toLocaleString()} files in {parts.length} part{parts.length === 1 ? "" : "s"}.
            </strong>{" "}
            {sentence(changedParts)}
          </p>
          <ul className="map__legend">
            <li>
              <span className="map__legend-arrow" /> uses
            </li>
            <li>
              <span className="map__legend-glow" /> changed on this branch
            </li>
            {languages.slice(0, 4).map((language) => (
              <li key={language.name}>
                <span className="map__legend-swatch" style={{ background: languageColor(language.name) }} />
                {language.name} {Math.round((language.files / Math.max(1, totalLanguageFiles)) * 100)}%
              </li>
            ))}
          </ul>
        </header>

        <div className="map__diagram" ref={diagram}>
          <svg className="map__lines" width={size.width} height={size.height} aria-hidden="true">
            <defs>
              <marker id="map-head" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" className="map__head" />
              </marker>
              <marker id="map-head-hot" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" className="map__head map__head--hot" />
              </marker>
            </defs>
            {lines.map((line) => {
              const lit = focus !== null && (line.source === focus || line.target === focus);
              const changed = byId.get(line.source)!.changed.length > 0 || byId.get(line.target)!.changed.length > 0;
              const dim = hover !== null && !lit;
              return (
                <path
                  key={line.key}
                  d={line.d}
                  className={`map__line${lit ? " map__line--lit" : changed ? " map__line--changed" : ""}${dim ? " map__line--dim" : ""}`}
                  strokeWidth={1.5 + Math.min(3, Math.log2(1 + line.imports))}
                  markerEnd={`url(#${lit ? "map-head-hot" : "map-head"})`}
                >
                  <title>
                    {`${byId.get(line.source)!.name} uses ${byId.get(line.target)!.name}: ${line.imports} import${line.imports === 1 ? "" : "s"}`}
                  </title>
                </path>
              );
            })}
          </svg>

          {layers.map((column, i) => (
            <div className="map__column" key={i}>
              <span className="map__column-title">{columnTitle(i, layers.length)}</span>
              <div className="map__column-cards">{column.map(card)}</div>
            </div>
          ))}
          {layers.length === 0 && <div className="map__grid">{loose.map(card)}</div>}
        </div>

        {/* Parts no code links to, such as docs and settings: a row under the diagram. */}
        {layers.length > 0 && loose.length > 0 && (
          <div className="map__loose">
            <span className="map__column-title">Not linked by code</span>
            <div className="map__loose-cards">{loose.map(card)}</div>
          </div>
        )}

        <p className="map__hint">
          Arrows come from imports in the code: an arrow from one part to another means the first uses code from the second.
          {layers.length === 0 && " Looma found no imports between these parts."}
          {!map.complete && " This project is large, so only some of its imports were read."}
        </p>
      </div>

      {active && <Details part={active} map={map} byId={byId} total={map.total_files} onSelect={setSelected} onOpenFile={onOpenFile} />}
    </section>
  );
}

// Everything about one part, beside the diagram.
function Details(props: {
  part: Part;
  map: MapData;
  byId: Map<string, Part>;
  total: number;
  onSelect: (id: string) => void;
  onOpenFile: (path: string) => void;
}) {
  const { part, map, byId } = props;
  const uses = map.edges.filter((e) => e.source === part.id).map((e) => ({ part: byId.get(e.target)!, imports: e.imports }));
  const usedBy = map.edges.filter((e) => e.target === part.id).map((e) => ({ part: byId.get(e.source)!, imports: e.imports }));
  const languageFiles = part.languages.reduce((sum, l) => sum + l.files, 0);
  const prefix = part.path ? part.path.length + 1 : 0;

  const links = (list: typeof uses, empty: string) =>
    list.length === 0 ? (
      <p className="details__empty">{empty}</p>
    ) : (
      <ul className="details__links">
        {list.map(({ part: other, imports }) => (
          <li key={other.id}>
            <button onClick={() => props.onSelect(other.id)}>
              {other.name}
              <span>
                {imports} import{imports === 1 ? "" : "s"}
              </span>
            </button>
          </li>
        ))}
      </ul>
    );

  return (
    <aside className="details" aria-label={`About ${part.name}`}>
      <h3 className="details__name">{part.name}</h3>
      <code className="details__path">{part.path || "Files at the top of the project"}</code>
      <p className="details__role">{describe(part)}</p>

      <dl className="details__stats">
        <div>
          <dt>Files</dt>
          <dd>{part.files}</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{bytes(part.bytes)}</dd>
        </div>
        <div>
          <dt>Of the project</dt>
          <dd>{Math.round((part.files / Math.max(1, props.total)) * 100)}%</dd>
        </div>
      </dl>

      {languageFiles > 0 && (
        <>
          <h4>Written in</h4>
          <ul className="details__languages">
            {part.languages.map((l) => (
              <li key={l.name}>
                <span className="details__language-name">
                  <i style={{ background: languageColor(l.name) }} />
                  {l.name}
                </span>
                <span className="details__language-bar">
                  <span style={{ width: `${(l.files / languageFiles) * 100}%`, background: languageColor(l.name) }} />
                </span>
                <span className="details__language-count">{l.files}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h4>Uses</h4>
      {links(uses, "No other part of the project.")}
      <h4>Used by</h4>
      {links(usedBy, "No other part of the project.")}

      <h4>Changed on this branch</h4>
      {part.changed.length === 0 ? (
        <p className="details__empty">Nothing here changed.</p>
      ) : (
        <ul className="details__files">
          {part.changed.map((file) => (
            <li key={file.path}>
              <button onClick={() => props.onOpenFile(file.path)} title="Open in Changes">
                <span className={`details__status details__status--${file.status}`}>{STATUS[file.status]}</span>
                <span className="details__file">{file.path.slice(prefix)}</span>
                <span className="details__delta">
                  <b className="part__add">+{file.additions}</b> <b className="part__del">−{file.deletions}</b>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

const STATUS: Record<FileChange["status"], string> = { added: "New", deleted: "Gone", modified: "Edit", renamed: "Moved" };

// Each part with the changed files that fall in it, for summaries outside the map.
export function mapParts(map: MapData, files: FileChange[]): Part[] {
  const areas = map.areas;
  // Changed files land in the deepest part whose folder holds them.
  const owner = (path: string) =>
    areas.reduce<MapArea | null>(
      (best, area) =>
        (area.path === "" || path.startsWith(area.path + "/")) && (!best || area.path.length > best.path.length) ? area : best,
      null,
    );
  const changed = new Map<string, FileChange[]>();
  for (const file of files) {
    const area = owner(file.path);
    if (area) changed.set(area.id, [...(changed.get(area.id) ?? []), file]);
  }
  return areas.map((area) => {
    const list = changed.get(area.id) ?? [];
    return {
      ...area,
      changed: list,
      added: list.reduce((sum, f) => sum + f.additions, 0),
      removed: list.reduce((sum, f) => sum + f.deletions, 0),
    };
  });
}

export { languageColor, totals as languageTotals };

// Columns by how far a part is from the parts that use nothing else: those form the right
// column, and each part sits one column left of the furthest part it uses.
function arrange(map: MapData, parts: Part[]) {
  const targets = new Map<string, string[]>();
  for (const edge of map.edges) targets.set(edge.source, [...(targets.get(edge.source) ?? []), edge.target]);
  const linked = new Set(map.edges.flatMap((edge) => [edge.source, edge.target]));
  const depth = new Map<string, number>();
  const visit = (id: string, path: Set<string>): number => {
    if (depth.has(id)) return depth.get(id)!;
    // An import cycle: stop here rather than loop.
    if (path.has(id)) return 0;
    path.add(id);
    const d = Math.max(-1, ...(targets.get(id) ?? []).map((t) => visit(t, path))) + 1;
    path.delete(id);
    depth.set(id, d);
    return d;
  };
  const connected = parts.filter((part) => linked.has(part.id));
  connected.forEach((part) => visit(part.id, new Set()));
  const deepest = Math.max(-1, ...connected.map((part) => depth.get(part.id)!));
  const layers: Part[][] = Array.from({ length: deepest + 1 }, () => []);
  for (const part of connected) layers[deepest - depth.get(part.id)!].push(part);

  // Fewer crossings: the right column by size, then each column by where its links sit.
  const position = new Map<string, number>();
  for (let i = layers.length - 1; i >= 0; i--) {
    const score = (part: Part) => {
      const linkedRows = map.edges
        .filter((e) => e.source === part.id || e.target === part.id)
        .map((e) => position.get(e.source === part.id ? e.target : e.source))
        .filter((p): p is number => p !== undefined);
      return linkedRows.length ? linkedRows.reduce((a, b) => a + b, 0) / linkedRows.length : Number.MAX_SAFE_INTEGER - part.files;
    };
    layers[i].sort((a, b) => score(a) - score(b) || b.files - a.files);
    layers[i].forEach((part, row) => position.set(part.id, row));
  }
  const loose = parts.filter((part) => !linked.has(part.id)).sort((a, b) => b.files - a.files);
  return { layers: layers.filter((column) => column.length > 0), loose };
}

// Only the two ends are named: a middle column can hold parts of either kind.
function columnTitle(i: number, count: number) {
  if (i === 0) return "Uses others";
  if (i === count - 1) return "Used by others";
  return "";
}

function describe(part: Part) {
  if (part.role) return part.role;
  const main = [...part.languages].sort((a, b) => b.files - a.files)[0];
  return main ? `Mostly ${main.name}` : "Files";
}

function totals(areas: MapArea[]) {
  const counts = new Map<string, number>();
  for (const area of areas) for (const l of area.languages) counts.set(l.name, (counts.get(l.name) ?? 0) + l.files);
  return [...counts.entries()].map(([name, files]) => ({ name, files })).sort((a, b) => b.files - a.files);
}

function sentence(changed: Part[]) {
  if (changed.length === 0) return "This branch doesn't change any of them yet.";
  const names = changed.map((p) => p.name);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
  return `This branch changes ${list}.`;
}

function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
