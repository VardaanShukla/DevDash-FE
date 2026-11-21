import type { BranchInfo, Comparison, Flow, ProjectMap } from "../../api/types";
import Pill from "../Pill/Pill";
import type { View } from "../SideMenu/SideMenu";
import FlowGraph from "../FlowGraph/FlowGraph";
import { languageColor, languageTotals, mapParts } from "../ProjectMap/ProjectMap";
import "./Overview.css";

// The first screen, laid out like a car's dashboard: the branch and its dials on the
// left, how big the change is in the middle, where it sits in the project on the right.
// Every card links to the view with the full detail.

// "merged", "deleted on GitHub", with when Looma stops showing it; "" for an open branch.
export function branchNote(branch: BranchInfo): string {
  const state = branch.gone ? "deleted on GitHub" : branch.merged ? "merged" : "";
  if (!state || !branch.removes_at) return state;
  const at = new Date(branch.removes_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${state} · hidden at ${at}`;
}

type Props = {
  comparison: Comparison;
  branches: BranchInfo[];
  flow: Flow | null;
  map: ProjectMap | null;
  onHeadChange: (head: string) => void;
  onView: (view: View) => void;
  onOpenFile: (path: string) => void;
};

// Review size by lines changed, like a gear selector.
export const SIZES = [
  { id: "S", label: "Small change", until: 50 },
  { id: "M", label: "Medium change", until: 300 },
  { id: "L", label: "Large change", until: 1000 },
  { id: "XL", label: "Very large change", until: Infinity },
];

export default function Overview({ comparison, branches, flow, map, onHeadChange, onView, onOpenFile }: Props) {
  const files = comparison.files.filter((file) => !file.generated);
  const additions = files.reduce((sum, file) => sum + file.additions, 0);
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0);
  const lines = additions + deletions;
  const functions = files.flatMap((file) => file.functions);
  const newFunctions = functions.filter((fn) => fn.change === "added").length;
  const newFiles = files.filter((file) => file.status === "added").length;
  const commits = comparison.commits;
  const aiCommits = commits.filter((commit) => commit.ai).length;
  const parts = map ? mapParts(map, comparison.files) : [];
  const changedParts = parts.filter((part) => part.changed.length > 0);
  const size = SIZES.find((s) => lines < s.until)!;
  const shown = branches.find((branch) => branch.name === comparison.head);

  return (
    <div className="overview">
      <div className="overview__col">
        <section className="card ov-branch">
          <span className="ov-eyebrow">Branch</span>
          <h1 className="ov-branch__name" title={comparison.head}>
            {comparison.head}
          </h1>
          <p className="ov-branch__base">
            compared with <code>{comparison.base}</code>
            {comparison.base_ref !== comparison.base && " (latest from GitHub)"}
          </p>
          <select
            className="select ov-branch__picker"
            value={comparison.head}
            onChange={(event) => onHeadChange(event.target.value)}
            aria-label="Branch to show"
          >
            {branches.map((branch) => (
              <option key={branch.name} value={branch.name}>
                {branch.name}
                {branchNote(branch) && ` · ${branchNote(branch)}`}
              </option>
            ))}
          </select>
          {shown && (shown.merged || shown.gone) && (
            <p className="ov-branch__done">
              {shown.merged ? `Already merged into ${comparison.base}.` : "Deleted on GitHub."}
              {shown.removes_at &&
                ` Looma stops showing it at ${new Date(shown.removes_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`}{" "}
              You can remove it with <code>git branch {shown.merged ? "-d" : "-D"} {comparison.head}</code>
            </p>
          )}
          {comparison.uncommitted && <span className="ov-branch__tag">Includes uncommitted work</span>}
        </section>

        <section className="card ov-dials">
          <Dial
            value={commits.length ? aiCommits / commits.length : 0}
            text={commits.length ? `${Math.round((aiCommits / commits.length) * 100)}%` : "—"}
            label="Made with AI"
            detail={`${aiCommits} of ${commits.length} commits`}
          />
          <Dial
            value={parts.length ? changedParts.length / parts.length : 0}
            text={parts.length ? `${changedParts.length}/${parts.length}` : "—"}
            label="Parts touched"
            detail="of the project"
            tone="blue"
          />
          <div className="ov-behind">
            <span>
              {comparison.behind > 0 ? `${comparison.behind} commits behind ${comparison.base}` : `Up to date with ${comparison.base}`}
            </span>
            <span className="ov-behind__track">
              <span
                className={`ov-behind__fill${comparison.behind > 0 ? " ov-behind__fill--warn" : ""}`}
                style={{ width: `${comparison.behind > 0 ? Math.min(100, 12 + comparison.behind * 8) : 100}%` }}
              />
            </span>
          </div>
        </section>

        <section className="card ov-commits">
          <header className="card__header">
            <h2 className="card__title">Latest commits</h2>
            <button className="card__link" onClick={() => onView("commits")}>
              All {commits.length} ›
            </button>
          </header>
          {commits.length === 0 ? (
            <p className="ov-empty">No commits ahead of {comparison.base} yet.</p>
          ) : (
            <ol className="ov-commits__list">
              {commits.slice(0, 6).map((commit) => (
                <li key={commit.sha}>
                  <span className={`ov-commits__dot${commit.ai ? " ov-commits__dot--ai" : ""}`} />
                  <span className="ov-commits__subject">{commit.subject}</span>
                  <span className="ov-commits__meta">
                    {commit.author} · {commit.short_sha}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className="card ov-gauge">
        <GaugeDial lines={lines} additions={additions} deletions={deletions} size={size.id} />
        <div className="ov-gears" aria-label={size.label}>
          {SIZES.map((s) => (
            <span key={s.id} className={s.id === size.id ? "is-on" : ""}>
              {s.id}
            </span>
          ))}
        </div>
        <p className="ov-gauge__label">{size.label}</p>
        <div className="ov-stats">
          <button className="ov-stat" onClick={() => onView("changes")}>
            <span>Files</span>
            <strong>{files.length}</strong>
            {newFiles > 0 ? <Pill tone="add">+{newFiles} new</Pill> : <em>edited</em>}
          </button>
          <button className="ov-stat" onClick={() => onView("changes")}>
            <span>Functions</span>
            <strong>{functions.length}</strong>
            {newFunctions > 0 ? <Pill tone="add">{newFunctions} new</Pill> : <em>none new</em>}
          </button>
          <button className="ov-stat" onClick={() => onView("commits")}>
            <span>Commits</span>
            <strong>{commits.length}</strong>
            <em>on this branch</em>
          </button>
        </div>
      </section>

      <div className="overview__col">
        {flow && flow.commits.length > 1 ? (
          <FlowGraph
            flow={flow}
            head={comparison.head}
            branches={branches}
            onPick={onHeadChange}
            compact
            onOpen={() => onView("flow")}
          />
        ) : (
          <section className="card">
            <h2 className="card__title">Branch flow</h2>
            <p className="ov-empty">Not enough history to draw yet.</p>
          </section>
        )}

        <section className="card ov-parts">
          <header className="card__header">
            <h2 className="card__title">Project parts</h2>
            <button className="card__link" onClick={() => onView("map")}>
              Map ›
            </button>
          </header>
          {map && <LanguageBar map={map} />}
          <ul className="ov-parts__list">
            {[...parts]
              .sort((a, b) => b.changed.length - a.changed.length || b.files - a.files)
              .map((part) => (
                <li key={part.id}>
                  <button
                    className={`ov-part${part.changed.length ? " ov-part--hot" : ""}`}
                    onClick={() => (part.changed.length ? onOpenFile(part.changed[0].path) : onView("map"))}
                    title={part.path || "Files at the top of the project"}
                  >
                    <span className="ov-part__name">{part.name}</span>
                    <span className="ov-part__role">{part.role ?? `${part.files} files`}</span>
                    {part.changed.length > 0 ? (
                      <span className="ov-part__badge">
                        {part.changed.length} · +{part.added} −{part.removed}
                      </span>
                    ) : (
                      <span className="ov-part__files">{part.files}</span>
                    )}
                  </button>
                </li>
              ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

// Up to 9,999 the count shows in full; past that it shortens (17.1k, 1.2M) so it stays
// inside the dial. The full number is in the tooltip.
export function compactCount(n: number) {
  if (n < 10_000) return n.toLocaleString();
  const [value, unit] = n < 1_000_000 ? [n / 1000, "k"] : [n / 1_000_000, "M"];
  return `${value < 100 ? value.toFixed(1).replace(/\.0$/, "") : Math.round(value)}${unit}`;
}

// The speedometer with its readout in the middle. The readout's size follows the dial's
// width and how many characters it has, so a long count shrinks rather than crossing the arc.
export function GaugeDial({ lines, additions, deletions, size }: { lines: number; additions: number; deletions: number; size: string }) {
  const text = compactCount(lines);
  const split = `+${compactCount(additions)} −${compactCount(deletions)}`;
  return (
    <div className="ov-gauge__dial">
      <Gauge lines={lines} size={size} />
      <div className="ov-gauge__center" title={`${lines.toLocaleString()} lines changed: +${additions.toLocaleString()} −${deletions.toLocaleString()}`}>
        <strong style={{ ["--chars" as string]: Math.max(3, text.length) }}>{text}</strong>
        <span>lines changed</span>
        <span className="ov-gauge__split" style={{ ["--chars" as string]: split.length }}>
          <span className="ov-add">+{compactCount(additions)}</span>
          <span className="ov-del">−{compactCount(deletions)}</span>
        </span>
      </div>
    </div>
  );
}

// A 240° speedometer arc. Lines changed run on a log scale up to 2,000, so both a
// ten-line fix and a large feature land somewhere readable.
export function Gauge({ lines, size }: { lines: number; size: string }) {
  const max = 2000;
  const fraction = Math.min(1, Math.log10(1 + lines) / Math.log10(1 + max));
  const r = 132;
  const cx = 170;
  const cy = 170;
  const sweep = 240;
  const start = 150;
  const point = (angle: number, radius = r) => {
    const rad = (angle * Math.PI) / 180;
    return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)] as const;
  };
  const arc = (from: number, to: number, radius = r) => {
    const [x1, y1] = point(from, radius);
    const [x2, y2] = point(to, radius);
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const marks = [0, 10, 50, 200, 1000, 2000];
  const at = (value: number) => start + sweep * (Math.log10(1 + value) / Math.log10(1 + max));
  const end = start + sweep * Math.max(fraction, 0.004);
  const [nx, ny] = point(end);

  return (
    <svg className={`gauge gauge--${size}`} viewBox="0 0 340 300" role="img" aria-label={`${lines} lines changed`}>
      <defs>
        <linearGradient id="gauge-fill" x1="0" x2="1" y1="1" y2="0">
          <stop offset="0" stopColor="var(--dd-blue)" />
          <stop offset="0.55" stopColor="var(--dd-accent)" />
          <stop offset="1" stopColor="#a3e635" />
        </linearGradient>
        <filter id="gauge-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      <path d={arc(start, start + sweep)} className="gauge__track" />
      {Array.from({ length: 41 }, (_, i) => {
        const angle = start + (sweep * i) / 40;
        const [x1, y1] = point(angle, r - 22);
        const [x2, y2] = point(angle, r - (i % 5 === 0 ? 32 : 27));
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="gauge__tick" />;
      })}
      {marks.map((value) => {
        const [x, y] = point(at(value), r - 46);
        return (
          <text key={value} x={x} y={y + 4} textAnchor="middle" className="gauge__mark">
            {value >= 1000 ? `${value / 1000}k` : value}
          </text>
        );
      })}
      <path d={arc(start, end)} className="gauge__glow" filter="url(#gauge-glow)" pathLength={1} />
      <path d={arc(start, end)} className="gauge__value" pathLength={1} />
      <circle cx={nx} cy={ny} r={7} className="gauge__needle" />
    </svg>
  );
}

function Dial({ value, text, label, detail, tone = "accent" }: { value: number; text: string; label: string; detail: string; tone?: "accent" | "blue" }) {
  const r = 30;
  const length = 2 * Math.PI * r * 0.75;
  return (
    <div className={`dial dial--${tone}`}>
      <svg viewBox="0 0 80 80" aria-hidden="true">
        <circle cx="40" cy="40" r={r} className="dial__track" strokeDasharray={`${length} 999`} transform="rotate(135 40 40)" />
        <circle
          cx="40"
          cy="40"
          r={r}
          className="dial__value"
          strokeDasharray={`${length * Math.min(1, Math.max(0, value))} 999`}
          transform="rotate(135 40 40)"
        />
      </svg>
      <strong className="dial__text">{text}</strong>
      <span className="dial__label">{label}</span>
      <span className="dial__detail">{detail}</span>
    </div>
  );
}

function LanguageBar({ map }: { map: ProjectMap }) {
  const languages = languageTotals(map.areas);
  const total = languages.reduce((sum, l) => sum + l.files, 0);
  if (!total) return null;
  return (
    <div className="ov-langs">
      <div className="ov-langs__bar">
        {languages.map((l) => (
          <span key={l.name} style={{ flex: l.files, background: languageColor(l.name) }} title={`${l.name}: ${l.files} files`} />
        ))}
      </div>
      <ul>
        {languages.slice(0, 4).map((l) => (
          <li key={l.name}>
            <span style={{ background: languageColor(l.name) }} />
            {l.name} {Math.round((l.files / total) * 100)}%
          </li>
        ))}
      </ul>
    </div>
  );
}
