import { useState, type ReactNode } from "react";
import type { FileChange, ProjectMap as MapData } from "../../api/types";
import { partFiles, type Entry, type Node } from "./layout";
import { QUIET, STATUS, STATUS_COLOR, bytes, fileName } from "./shared";

// The panel beside the sky. With nothing picked it sums up the branch; with a part picked
// it shows the part's numbers and lists; with a file picked it shows what changed in it.

type Props = {
  map: MapData;
  nodes: Node[];
  byId: Map<string, Node>;
  files: FileChange[];
  part: Node | null;
  file: Entry | null;
  onSelect: (id: string | null) => void;
  onSelectFile: (path: string | null) => void;
  onOpenFile: (path: string) => void;
};

type Tab = "changed" | "files" | "functions" | "uses" | "usedBy";

export default function Inspector(props: Props) {
  const { part, file } = props;
  return (
    <aside className="cn-inspector" aria-label="Details">
      {part && file ? (
        <FileView key={file.path} part={part} entry={file} onBack={() => props.onSelectFile(null)} onOpenFile={props.onOpenFile} />
      ) : part ? (
        <PartView key={part.id} {...props} part={part} />
      ) : (
        <Overview {...props} />
      )}
    </aside>
  );
}

function Overview({ map, nodes, files, onSelect }: Props) {
  const changed = nodes.filter((node) => node.changed.length > 0).sort((a, b) => b.changed.length - a.changed.length);
  const biggest = [...nodes].sort((a, b) => b.files - a.files).slice(0, 5);
  const functions = files.reduce((sum, f) => sum + f.functions.length, 0);
  const additions = files.reduce((sum, f) => sum + f.additions, 0);
  const deletions = files.reduce((sum, f) => sum + f.deletions, 0);
  return (
    <div className="cn-inspector__body">
      <header className="cn-inspector__head">
        <span className="cn-inspector__eyebrow">This branch</span>
        <h3>{changed.length ? `Changes ${changed.length} of ${nodes.length} parts` : "No parts changed yet"}</h3>
      </header>
      <dl className="cn-tiles">
        <Tile icon={ICON.changed} value={files.length} label="Files changed" tone={files.length ? "gold" : undefined} />
        <Tile icon={ICON.functions} value={functions} label="Functions changed" />
        <Tile
          icon={ICON.lines}
          value={
            <>
              <b className="cn-add">+{additions}</b> <b className="cn-del">−{deletions}</b>
            </>
          }
          label="Lines"
        />
        <Tile icon={ICON.files} value={map.total_files.toLocaleString()} label="Files in the project" />
      </dl>

      <h4>Changed parts</h4>
      {changed.length === 0 ? (
        <p className="cn-inspector__note">Nothing on this branch differs from its base yet.</p>
      ) : (
        <ul className="cn-list">
          {changed.map((node) => (
            <li key={node.id}>
              <button className="cn-list__row" onClick={() => onSelect(node.id)}>
                <i className="cn-dot cn-dot--hot" />
                <span className="cn-list__label">{node.name}</span>
                <span className="cn-badge cn-badge--gold">{node.changed.length} changed</span>
                <span className="cn-badge">
                  <b className="cn-add">+{node.added}</b> <b className="cn-del">−{node.removed}</b>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <h4>Biggest parts</h4>
      <ul className="cn-list">
        {biggest.map((node) => (
          <li key={node.id}>
            <button className="cn-list__row" onClick={() => onSelect(node.id)}>
              <i className={`cn-dot${node.changed.length ? " cn-dot--hot" : ""}`} />
              <span className="cn-list__label">{node.name}</span>
              <span className="cn-meter" title={`${Math.round((node.files / Math.max(1, map.total_files)) * 100)}% of the files`}>
                <span style={{ width: `${(node.files / Math.max(1, biggest[0].files)) * 100}%` }} />
              </span>
              <span className="cn-badge">{node.files} files</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="cn-inspector__note">Pick a part in the sky or in the list to look inside it.</p>
    </div>
  );
}

function PartView({ map, byId, part, onSelect, onSelectFile }: Props & { part: Node }) {
  const entries = partFiles(part);
  const prefix = part.path ? part.path.length + 1 : 0;
  const uses = map.edges.filter((e) => e.source === part.id && byId.has(e.target));
  const usedBy = map.edges.filter((e) => e.target === part.id && byId.has(e.source));
  const functions = part.changed.flatMap((file) => file.functions.map((fn) => ({ fn, file })));
  const [tab, setTab] = useState<Tab>(part.changed.length ? "changed" : "files");
  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "changed", label: "Changed", count: part.changed.length },
    { id: "files", label: "Files", count: part.files },
    { id: "functions", label: "Functions", count: functions.length },
    { id: "uses", label: "Uses", count: uses.length },
    { id: "usedBy", label: "Used by", count: usedBy.length },
  ];

  const fileRow = (entry: Entry) => (
    <li key={entry.path}>
      <button className={`cn-list__row${entry.change ? " cn-list__row--hot" : ""}`} onClick={() => onSelectFile(entry.path)} title={entry.path}>
        <i className="cn-dot" style={{ background: entry.change ? STATUS_COLOR[entry.change.status] : QUIET }} />
        <span className="cn-list__label cn-list__label--mono">{entry.path.slice(prefix) || entry.path}</span>
        {entry.change ? (
          <span className="cn-badge">
            <b className="cn-add">+{entry.change.additions}</b> <b className="cn-del">−{entry.change.deletions}</b>
          </span>
        ) : (
          <span className="cn-badge">{bytes(entry.bytes)}</span>
        )}
      </button>
    </li>
  );
  const partRow = (id: string, imports: number) => {
    const other = byId.get(id)!;
    return (
      <li key={id}>
        <button className="cn-list__row" onClick={() => onSelect(id)}>
          <i className={`cn-dot${other.changed.length ? " cn-dot--hot" : ""}`} />
          <span className="cn-list__label">{other.name}</span>
          <span className="cn-badge">
            {imports} import{imports === 1 ? "" : "s"}
          </span>
        </button>
      </li>
    );
  };

  let list: ReactNode;
  if (tab === "changed") list = entries.filter((e) => e.change).map(fileRow);
  else if (tab === "files") list = entries.map(fileRow);
  else if (tab === "functions")
    list = functions.map(({ fn, file }) => (
      <li key={`${file.path}:${fn.name}`}>
        <button className="cn-list__row" onClick={() => onSelectFile(file.path)} title={file.path}>
          <i className="cn-dot" style={{ background: fn.change === "added" ? STATUS_COLOR.added : fn.change === "deleted" ? STATUS_COLOR.deleted : STATUS_COLOR.modified }} />
          <span className="cn-list__label cn-list__label--mono">{fn.name}</span>
          <span className="cn-badge">{fileName(file.path)}</span>
        </button>
      </li>
    ));
  else list = (tab === "uses" ? uses.map((e) => partRow(e.target, e.imports)) : usedBy.map((e) => partRow(e.source, e.imports)));
  const empty: Record<Tab, string> = {
    changed: "This branch didn't change anything here.",
    files: "No files.",
    functions: "No functions changed here.",
    uses: "It doesn't use code from another part.",
    usedBy: "No other part uses its code.",
  };
  const hidden = tab === "files" && part.files > entries.length ? part.files - entries.length : 0;

  return (
    <div className="cn-inspector__body">
      <button className="cn-inspector__back" onClick={() => onSelect(null)}>
        ← Whole branch
      </button>
      <header className="cn-inspector__part">
        <span className={`cn-inspector__orb${part.changed.length ? " cn-inspector__orb--hot" : ""}`} />
        <div>
          <h3>{part.name}</h3>
          <code>{part.path || "Files at the top of the project"}</code>
          <p>{describe(part)}</p>
        </div>
      </header>
      <dl className="cn-tiles">
        <Tile icon={ICON.files} value={part.files} label="Files" />
        <Tile icon={ICON.size} value={bytes(part.bytes)} label="Size" />
        <Tile icon={ICON.changed} value={part.changed.length} label="Changed" tone={part.changed.length ? "gold" : undefined} />
        <Tile
          icon={ICON.lines}
          value={
            <>
              <b className="cn-add">+{part.added}</b> <b className="cn-del">−{part.removed}</b>
            </>
          }
          label="Lines"
        />
      </dl>
      <div className="cn-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`cn-tabs__tab${tab === t.id ? " cn-tabs__tab--on" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
            <span>{t.count}</span>
          </button>
        ))}
      </div>
      {Array.isArray(list) && list.length === 0 ? <p className="cn-inspector__note">{empty[tab]}</p> : <ul className="cn-list">{list}</ul>}
      {hidden > 0 && <p className="cn-inspector__note">Showing the {entries.length} biggest; {hidden} smaller files aren't listed.</p>}
    </div>
  );
}

function FileView({ part, entry, onBack, onOpenFile }: { part: Node; entry: Entry; onBack: () => void; onOpenFile: (path: string) => void }) {
  const file = entry.change;
  const folder = entry.path.split("/").slice(0, -1).join("/");
  return (
    <div className="cn-inspector__body">
      <button className="cn-inspector__back" onClick={onBack}>
        ← {part.name}
      </button>
      <header className="cn-inspector__head">
        <span className="cn-inspector__eyebrow" style={{ color: file ? STATUS_COLOR[file.status] : QUIET }}>
          {file ? `${STATUS[file.status]} on this branch` : "Not changed on this branch"}
        </span>
        <h3>{fileName(entry.path)}</h3>
        <code>{file?.old_path && file.old_path !== file.path ? `Moved from ${file.old_path}` : `in ${folder || "the top folder"}`}</code>
      </header>
      {file && (
        <button className="cn-inspector__open" onClick={() => onOpenFile(entry.path)}>
          Open in Changes
        </button>
      )}
      {file ? (
        <div className="cn-rate">
          <div>
            <span className="cn-rate__label">Lines changed</span>
            <strong>
              <b className="cn-add">+{file.additions}</b> <b className="cn-del">−{file.deletions}</b>
            </strong>
            <span className="cn-rate__sub">Bars show where in the file</span>
          </div>
          <Spark file={file} />
        </div>
      ) : (
        <p className="cn-inspector__note">Its whole history is in Commits and Branch flow.</p>
      )}
      <dl className="cn-tiles">
        <Tile icon={ICON.functions} value={file?.functions.length ?? 0} label="Functions changed" />
        <Tile icon={ICON.blocks} value={file?.hunks.length ?? 0} label="Changed blocks" />
        <Tile icon={ICON.size} value={entry.bytes ? bytes(entry.bytes) : "–"} label="Size" />
        <Tile icon={ICON.code} value={language(entry.path)} label="Kind" />
      </dl>
      {file && file.functions.length > 0 && (
        <>
          <h4>Functions changed</h4>
          <ul className="cn-list">
            {file.functions.map((fn) => (
              <li key={fn.name} className="cn-list__row cn-list__row--still">
                <span className="cn-list__label cn-list__label--mono">{fn.name}</span>
                <span className={`cn-change cn-change--${fn.change}`}>{fn.change === "modified" ? "edited" : fn.change}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {file?.uncommitted && <p className="cn-inspector__note">Has edits you haven't committed.</p>}
    </div>
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
    <div className="cn-rate__spark" aria-hidden="true">
      {counts.map((n, i) => (
        <span key={i} className={n ? "cn-rate__bar--on" : undefined} style={{ height: `${n ? 22 + (n / most) * 78 : 10}%`, animationDelay: `${i * 12}ms` }} />
      ))}
    </div>
  );
}

function Tile({ icon, value, label, tone }: { icon: string; value: ReactNode; label: string; tone?: "gold" }) {
  return (
    <div className={`cn-tiles__tile${tone ? ` cn-tiles__tile--${tone}` : ""}`}>
      <dt>{label}</dt>
      <dd>
        <Icon d={icon} />
        {value}
      </dd>
    </div>
  );
}

export function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export const ICON = {
  files: "M7 3h7l4 4v14H7zM14 3v4h4",
  changed: "M12 3l2 5 5 .5-4 3.5 1.2 5L12 14.5 7.8 17 9 12 5 8.5l5-.5z",
  functions: "M9 4c-2 0-3 1-3 3v2c0 1-1 2-2 2 1 0 2 1 2 2v2c0 2 1 3 3 3M15 4c2 0 3 1 3 3v2c0 1 1 2 2 2-1 0-2 1-2 2v2c0 2-1 3-3 3",
  lines: "M4 6h16M4 12h10M4 18h13",
  blocks: "M4 5h7v6H4zM13 13h7v6h-7z",
  size: "M4 20h16M7 16V9M12 16V4M17 16v-5",
  code: "M8 7l-5 5 5 5M16 7l5 5-5 5",
  search: "M11 11m-6 0a6 6 0 1 0 12 0a6 6 0 1 0 -12 0M20 20l-4.5-4.5",
};

function describe(part: Node) {
  if (part.role) return part.role;
  const main = [...part.languages].sort((a, b) => b.files - a.files)[0];
  return main ? `Mostly ${main.name}` : "Files";
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
