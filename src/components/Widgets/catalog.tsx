import { useEffect, useState, type ReactNode } from "react";
import { api } from "../../api/client";
import type {
  AiStatus, BranchInfo, Comparison, Digest, DigestChange, Flow, FlowCommit, PlacedWidget, ProjectCard, ProjectMap,
  PullRequests, RecordingHealth, Repo, WidgetStyle, WidgetType,
} from "../../api/types";
import Agenda from "../Agenda/Agenda";
import FlowGraph from "../FlowGraph/FlowGraph";
import { branchNote, GaugeDial, SIZES } from "../Overview/Overview";
import { languageColor, languageTotals, mapParts } from "../ProjectMap/ProjectMap";
import { VIEWS, type View } from "../SideMenu/SideMenu";

// Every widget Home can show. Each reads what Home already loaded (HomeData), draws its own
// heading and body, and has options the person sets in the widget's settings; its size and
// place on the grid, style, accent and title are the same for every kind (see Grid).

export type HomeData = {
  repos: Repo[];
  picked: Repo | null;
  comparison: Comparison | null;
  branches: BranchInfo[];
  checkedOut: string | null;
  flow: Flow | null;
  map: ProjectMap | null;
  ai: AiStatus | null;
  // Today's AI changes in every project, and whether recording works; null while they load.
  digest: Digest | null;
  health: RecordingHealth | null;
  onHealth: (health: RecordingHealth) => void;
  // Every project at a glance; null while it loads.
  cards: ProjectCard[] | null;
  error: string | null;
  shortcuts: Record<string, string>;
  username?: string;
  onHeadChange: (head: string) => void;
  onView: (view: View) => void;
  onOpenFile: (path: string) => void;
  onDigest: () => void;
  onOpenChange: (id: string) => void;
  onAdd: () => void;
  onSync: () => void;
};

type Value = string | number | boolean;
export type OptionSpec = {
  key: string;
  label: string;
  kind: "toggle" | "choice" | "number" | "text";
  default: Value;
  choices?: { value: string; label: string }[];
  min?: number;
  max?: number;
};
type WidgetProps = { data: HomeData; widget: PlacedWidget; title: string; o: (key: string) => Value };
export type WidgetSpec = {
  type: WidgetType;
  name: string;
  description: string;
  // Its size when added, and the smallest it can be made, in columns and rows.
  size: { w: number; h: number };
  min: { w: number; h: number };
  style?: WidgetStyle;
  // Draws its own panel (the flow graph, the calendar), so the frame adds none.
  ownCard?: boolean;
  options: OptionSpec[];
  render: (props: WidgetProps) => ReactNode;
};

const toggle = (key: string, label: string, value = true): OptionSpec => ({ key, label, kind: "toggle", default: value });
const count = (key: string, label: string, value: number, min: number, max: number): OptionSpec =>
  ({ key, label, kind: "number", default: value, min, max });
const choice = (key: string, label: string, choices: [string, string][], value?: string): OptionSpec =>
  ({ key, label, kind: "choice", default: value ?? choices[0][0], choices: choices.map(([v, l]) => ({ value: v, label: l })) });

// What the One number widget can show.
const NUMBERS: { id: string; label: string; value: (data: HomeData) => number | null; view?: View }[] = [
  { id: "lines", label: "Lines changed on the branch", value: (d) => (d.comparison ? branchTotals(d.comparison).lines : null), view: "overview" },
  { id: "files", label: "Files changed on the branch", value: (d) => (d.comparison ? branchTotals(d.comparison).files.length : null), view: "changes" },
  { id: "functions", label: "Functions changed on the branch", value: (d) => (d.comparison ? branchTotals(d.comparison).functions : null), view: "changes" },
  { id: "commits", label: "Commits on the branch", value: (d) => d.comparison?.commits.length ?? null, view: "commits" },
  { id: "behind", label: "Commits behind the base", value: (d) => d.comparison?.behind ?? null, view: "overview" },
  { id: "branches", label: "Branches", value: (d) => (d.branches.length ? d.branches.length : null), view: "flow" },
  { id: "today", label: "Commits today", value: (d) => (d.flow ? todaysCommits(d.flow).length : null) },
  { id: "people", label: "People who committed today", value: (d) => (d.flow ? new Set(todaysCommits(d.flow).map((c) => c.author)).size : null) },
  { id: "prompts", label: "AI prompts today in this project", value: (d) => (d.digest ? kept(projectChanges(d)).length : null), view: "digest" },
  { id: "ai-lines", label: "Lines the AI changed today in this project", value: (d) => (d.digest ? kept(projectChanges(d)).reduce((s, c) => s + c.additions + c.deletions, 0) : null), view: "digest" },
  { id: "uncommitted", label: "Files not committed, every project", value: (d) => (d.cards ? d.cards.reduce((s, c) => s + c.uncommitted, 0) : null) },
  { id: "week", label: "Commits this week, every project", value: (d) => (d.cards ? d.cards.reduce((s, c) => s + c.commits_this_week, 0) : null) },
  { id: "projects", label: "Projects", value: (d) => d.repos.length, view: "project" },
];

export const CATALOG: WidgetSpec[] = [
  {
    type: "greeting", name: "Greeting", description: "Good morning with your name, the date and what most needs you.",
    size: { w: 8, h: 2 }, min: { w: 3, h: 2 }, style: "bare",
    options: [toggle("sky", "Show the sky for the time of day"), toggle("date", "Show the date"), toggle("status", "Show what needs you")],
    render: (p) => <Greeting {...p} />,
  },
  {
    type: "project", name: "Project on show", description: "The project picked in the menu, and its branch. Opens its summary.",
    size: { w: 4, h: 2 }, min: { w: 2, h: 2 }, style: "bare",
    options: [toggle("branch", "Show the branch"), toggle("path", "Show the folder", false)],
    render: (p) => <ProjectName {...p} />,
  },
  {
    type: "ai-today", name: "AI today", description: "The AI picked in Settings and what AI tools changed in this project today.",
    size: { w: 12, h: 2 }, min: { w: 4, h: 2 },
    options: [toggle("ai", "Show the AI picked in Settings"), toggle("bars", "Show one bar per prompt")],
    render: (p) => <AiToday {...p} />,
  },
  {
    type: "total-changes", name: "Total changes", description: "How much this branch changes compared with its base.",
    size: { w: 5, h: 8 }, min: { w: 2, h: 2 },
    options: [choice("view", "Show it as", [["dial", "A dial"], ["number", "A big number"], ["bar", "A bar of added and removed"]]),
              toggle("counts", "Show files, functions and commits")],
    render: (p) => <TotalChanges {...p} />,
  },
  {
    type: "activity", name: "Today's activity", description: "Who committed to this project today, on any branch, and when.",
    size: { w: 7, h: 8 }, min: { w: 3, h: 3 },
    options: [toggle("day", "Show each person's day")],
    render: (p) => <Activity {...p} />,
  },
  {
    type: "latest-commit", name: "Latest commit", description: "The newest commit on the branch on show, with the ones before it.",
    size: { w: 5, h: 6 }, min: { w: 3, h: 3 },
    options: [count("earlier", "Earlier commits to list", 4, 0, 10)],
    render: (p) => <LatestCommit {...p} />,
  },
  {
    type: "branches", name: "Branches", description: "Every branch; pick one to show it across the dashboard.",
    size: { w: 7, h: 6 }, min: { w: 3, h: 3 },
    options: [toggle("merged", "List merged and deleted branches")],
    render: (p) => <Branches {...p} />,
  },
  {
    type: "changed-files", name: "Changed files", description: "The branch's files, biggest change first; each opens in Changes.",
    size: { w: 6, h: 6 }, min: { w: 3, h: 3 },
    options: [count("count", "Files to list", 12, 3, 50), choice("sort", "Order", [["size", "Biggest change first"], ["name", "By name"]])],
    render: (p) => <ChangedFiles {...p} />,
  },
  {
    type: "commits", name: "Branch commits", description: "The commits this branch adds to its base, newest first.",
    size: { w: 6, h: 6 }, min: { w: 3, h: 3 },
    options: [count("count", "Commits to list", 8, 3, 40), toggle("author", "Show who wrote each")],
    render: (p) => <Commits {...p} />,
  },
  {
    type: "branch-flow", name: "Branch flow", description: "How the branches split off and merge back, as a graph.",
    size: { w: 12, h: 6 }, min: { w: 6, h: 4 }, ownCard: true, options: [],
    render: (p) => <BranchFlow {...p} />,
  },
  {
    type: "project-map", name: "Project map", description: "The project's parts as tiles, the ones this branch changed lit up.",
    size: { w: 8, h: 6 }, min: { w: 4, h: 3 },
    options: [toggle("languages", "Show the mix of languages")],
    render: (p) => <MapTiles {...p} />,
  },
  {
    type: "languages", name: "Languages", description: "Which languages the project is written in, by files.",
    size: { w: 4, h: 4 }, min: { w: 2, h: 2 },
    options: [count("count", "Languages to list", 6, 1, 12)],
    render: (p) => <Languages {...p} />,
  },
  {
    type: "ai-prompts", name: "AI prompts today", description: "Today's prompts that changed code, newest first; each opens its changes.",
    size: { w: 6, h: 5 }, min: { w: 3, h: 3 },
    options: [count("count", "Prompts to list", 6, 1, 30), toggle("risky", "Only the ones that need a look", false),
              toggle("all", "From every project", false)],
    render: (p) => <AiPrompts {...p} />,
  },
  {
    type: "needs-a-look", name: "Needs a look", description: "How many of today's AI changes touched something risky.",
    size: { w: 3, h: 3 }, min: { w: 2, h: 2 },
    options: [toggle("all", "Count every project", false)],
    render: (p) => <NeedsALook {...p} />,
  },
  {
    type: "recording", name: "Recording", description: "Whether the AI hooks record, when they last ran, and a repair.",
    size: { w: 4, h: 3 }, min: { w: 3, h: 2 }, options: [],
    render: (p) => <Recording {...p} />,
  },
  {
    type: "projects", name: "Projects", description: "Every project: its branch, commits this week and work not committed.",
    size: { w: 6, h: 5 }, min: { w: 3, h: 3 },
    options: [toggle("busy", "Only projects with uncommitted work", false)],
    render: (p) => <Projects {...p} />,
  },
  {
    type: "uncommitted", name: "Not committed", description: "Files changed but not committed, across every project.",
    size: { w: 3, h: 3 }, min: { w: 2, h: 2 }, options: [],
    render: (p) => <Uncommitted {...p} />,
  },
  {
    type: "commit-days", name: "Commits by day", description: "Commits to this project per day, on any branch.",
    size: { w: 6, h: 4 }, min: { w: 3, h: 3 },
    options: [choice("days", "Days", [["7", "Last 7 days"], ["14", "Last 14 days"], ["30", "Last 30 days"]], "14")],
    render: (p) => <CommitDays {...p} />,
  },
  {
    type: "jump-to", name: "Jump to", description: "The screens one press away, with their shortcut keys.",
    size: { w: 4, h: 6 }, min: { w: 2, h: 3 },
    options: [toggle("keys", "Show shortcut keys")],
    render: (p) => <JumpTo {...p} />,
  },
  {
    type: "calendar", name: "Calendar", description: "The days ahead from your calendar.",
    size: { w: 4, h: 6 }, min: { w: 3, h: 4 }, ownCard: true,
    options: [choice("days", "Days ahead", [["1", "Today"], ["3", "3 days"], ["7", "A week"]], "3")],
    render: (p) => <Agenda days={Number(p.o("days"))} />,
  },
  {
    type: "clock", name: "Clock", description: "The time and date on this computer.",
    size: { w: 3, h: 2 }, min: { w: 2, h: 2 },
    options: [toggle("seconds", "Show seconds", false), toggle("h24", "24-hour clock", false), toggle("date", "Show the date")],
    render: (p) => <Clock {...p} />,
  },
  {
    type: "pull-requests", name: "Pull requests", description: "Open pull requests on GitHub or CodeCommit for this project.",
    size: { w: 6, h: 4 }, min: { w: 3, h: 3 },
    options: [count("count", "Pull requests to list", 5, 1, 20), toggle("drafts", "List drafts")],
    render: (p) => <PullRequestList {...p} />,
  },
  {
    type: "note", name: "Note", description: "Your own words: a reminder, a checklist, today's plan.",
    size: { w: 3, h: 3 }, min: { w: 2, h: 2 }, style: "tinted",
    options: [{ key: "text", label: "Text", kind: "text", default: "" }, choice("size", "Text size", [["normal", "Normal"], ["large", "Large"]])],
    render: (p) => <Note {...p} />,
  },
  {
    type: "number", name: "One number", description: "A single number you pick: lines, files, commits, prompts and more.",
    size: { w: 3, h: 2 }, min: { w: 2, h: 2 },
    options: [choice("metric", "Number", NUMBERS.map((n) => [n.id, n.label]), "lines")],
    render: (p) => <OneNumber {...p} />,
  },
];

export function spec(type: WidgetType): WidgetSpec {
  return CATALOG.find((s) => s.type === type)!;
}

// The widget's option, or its default when the person hasn't set it.
export function option(widget: PlacedWidget, key: string): Value {
  const found = spec(widget.type).options.find((o) => o.key === key);
  const value = widget.options[key];
  return value === undefined || (found && typeof value !== typeof found.default) ? found?.default ?? "" : value;
}

// --- Shared pieces --------------------------------------------------------------------------

function Head({ title, link, aside }: { title: string; link?: { label: string; go: () => void }; aside?: ReactNode }) {
  return (
    <header className="wf__head">
      <h2 className="wf__title">{title}</h2>
      {aside && <span className="wf__aside">{aside}</span>}
      {link && (
        <button className="wf__link" onClick={link.go}>
          {link.label} ›
        </button>
      )}
    </header>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <p className="wf__muted">{children}</p>;
}

const projectChanges = (data: HomeData, all = false) =>
  (data.digest?.changes ?? []).filter((change) => all || change.repo.id === data.picked?.id);
const kept = (changes: DigestChange[]) => changes.filter((change) => !change.undone_at);

function branchTotals(comparison: Comparison) {
  const files = comparison.files.filter((file) => !file.generated);
  const additions = files.reduce((sum, file) => sum + file.additions, 0);
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0);
  const functions = files.reduce((sum, file) => sum + file.functions.length, 0);
  return { files, additions, deletions, lines: additions + deletions, functions };
}

function todaysCommits(flow: Flow | null) {
  const today = new Date().toDateString();
  return (flow?.commits ?? []).filter((commit) => new Date(commit.authored_at).toDateString() === today);
}

// --- The widgets ----------------------------------------------------------------------------

function Greeting({ data, o }: WidgetProps) {
  const moment = timeOfDay();
  const risky = kept(projectChanges(data)).filter((change) => change.risky).length;
  const broken = (data.health?.problems.length ?? 0) > 0;
  const status: { text: string; tone: "risk" | "calm"; go?: () => void } = broken
    ? { text: "AI recording needs a fix", tone: "risk" }
    : risky > 0
      ? { text: `${risky} AI ${risky === 1 ? "change needs" : "changes need"} a look`, tone: "risk", go: data.onDigest }
      : { text: "All caught up", tone: "calm" };
  return (
    <div className="greet">
      {o("sky") && (
        <span className={`greet__sky greet__sky--${moment.part}`} aria-hidden="true">
          <SkyIcon part={moment.part} />
        </span>
      )}
      <div className="greet__text">
        <h1>
          {moment.words}
          {data.username && <>, {data.username}</>}
        </h1>
        {(o("date") || o("status")) && (
          <p className="greet__sub">
            {o("date") && <span>{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</span>}
            {o("date") && o("status") && <span aria-hidden="true">·</span>}
            {o("status") &&
              (data.error ? (
                <span className="greet__mood greet__mood--risk">{data.error}</span>
              ) : status.go ? (
                <button className={`greet__mood greet__mood--${status.tone}`} onClick={status.go}>
                  {status.text}
                </button>
              ) : (
                <span className={`greet__mood greet__mood--${status.tone}`}>{status.text}</span>
              ))}
          </p>
        )}
      </div>
    </div>
  );
}

function ProjectName({ data, title, widget, o }: WidgetProps) {
  const picked = data.picked;
  if (!picked) return <Muted>Pick a project in the menu.</Muted>;
  return (
    <button className="onshow" onClick={() => data.onView("summary")} title={`${picked.path}\nOpen its summary`}>
      <span className="onshow__label">{widget.title ? title : "Viewing"}</span>
      <strong>{picked.name}</strong>
      {o("branch") && data.comparison && <code>{data.comparison.head}</code>}
      {o("path") && <span className="onshow__path">{picked.path}</span>}
    </button>
  );
}

function AiToday({ data, title, o }: WidgetProps) {
  const [repairing, setRepairing] = useState(false);
  const [repairError, setRepairError] = useState<string | null>(null);
  const repair = () => {
    setRepairing(true);
    setRepairError(null);
    api.repairRecording().then(data.onHealth, (e: Error) => setRepairError(e.message)).finally(() => setRepairing(false));
  };
  const changes = projectChanges(data);
  const done = kept(changes);
  const additions = done.reduce((sum, change) => sum + change.additions, 0);
  const deletions = done.reduce((sum, change) => sum + change.deletions, 0);
  const files = new Set(done.flatMap((change) => change.files.map((file) => file.path))).size;
  const bars = [...changes].reverse(); // oldest first, left to right
  const most = Math.max(1, ...bars.map((c) => c.additions + c.deletions));
  const problems = data.health?.problems ?? [];
  const ai = data.ai;
  const ready = ai ? ai.available && ai.signed_in !== false : false;
  return (
    <div className="band">
      <div className="band__who">
        <h2 className="wf__title">{title}</h2>
        {o("ai") &&
          (ai ? (
            <button className="band__ai" onClick={() => data.onView("settings")} title="Pick another AI in Settings">
              <i className={`band__state${ready ? "" : " band__state--off"}`} aria-hidden="true" />
              <strong>{ai.name}</strong>
              <span>{!ai.available ? "not installed" : ai.signed_in === false ? "signed out" : ai.model}</span>
            </button>
          ) : (
            <Muted>Checking…</Muted>
          ))}
      </div>
      <div className="band__today">
        {!data.digest ? (
          <Muted>Reading today's AI changes…</Muted>
        ) : done.length === 0 ? (
          <p className="band__none">No AI changes to this project today.</p>
        ) : (
          <p className="band__numbers">
            <span>
              <strong>{done.length}</strong> {done.length === 1 ? "prompt" : "prompts"} changed
            </span>
            <span>
              <b className="wf__add">+{additions.toLocaleString()}</b> <b className="wf__del">−{deletions.toLocaleString()}</b> lines
            </span>
            <span>
              in <strong>{files}</strong> {files === 1 ? "file" : "files"}
            </span>
          </p>
        )}
        {o("bars") && bars.length > 0 && (
          <div className="band__bars" aria-label="Today's prompts in this project, oldest first">
            {bars.map((change, i) => (
              <button
                key={change.id}
                className={`band__bar${change.risky ? " band__bar--risk" : ""}${change.undone_at ? " band__bar--undone" : ""}`}
                onClick={() => data.onOpenChange(change.id)}
                style={{ ["--i" as string]: i }}
                title={promptTitle(change)}
              >
                <b style={{ height: `${Math.max(10, ((change.additions + change.deletions) / most) * 100)}%` }} />
              </button>
            ))}
          </div>
        )}
      </div>
      <button className="band__more" onClick={data.onDigest}>
        Know more
      </button>
      {problems.length > 0 && (
        <div className="band__problems" role="alert">
          {problems.map((problem) => (
            <p key={problem}>{problem}</p>
          ))}
          {repairError && <p>{repairError}</p>}
          {data.health?.repairable && (
            <button className="wf__button" onClick={repair} disabled={repairing}>
              {repairing ? "Repairing…" : "Repair the hooks"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TotalChanges({ data, title, o }: WidgetProps) {
  const comparison = data.comparison;
  if (!comparison) {
    return (
      <>
        <Head title={title} />
        <Muted>{data.picked ? `Reading ${data.picked.name}…` : "Pick a project to see its branch."}</Muted>
      </>
    );
  }
  const { files, additions, deletions, lines, functions } = branchTotals(comparison);
  const size = SIZES.find((s) => lines < s.until)!;
  const view = o("view");
  return (
    <>
      <Head
        title={title}
        aside={
          <>
            <code>{comparison.head}</code> vs <code>{comparison.base}</code>
            {comparison.behind > 0 && `, ${comparison.behind} behind`}
          </>
        }
        link={{ label: "This branch", go: () => data.onView("overview") }}
      />
      {view === "dial" ? (
        <>
          <button className="total__stage" onClick={() => data.onView("overview")} aria-label={`${lines} lines changed. Open This branch`}>
            <span className="total__bezel">
              <GaugeDial lines={lines} additions={additions} deletions={deletions} size={size.id} />
            </span>
          </button>
          <div className="total__gears" aria-label={size.label}>
            {SIZES.map((s) => (
              <span key={s.id} className={s.id === size.id ? "is-on" : ""}>
                {s.id}
              </span>
            ))}
            <em>{size.label}</em>
          </div>
          {/* In place of the dial when the widget is too small to draw it. */}
          <button className="big total__small" onClick={() => data.onView("overview")}>
            <strong>{lines.toLocaleString()}</strong>
            <span>
              lines, <b className="wf__add">+{additions.toLocaleString()}</b> <b className="wf__del">−{deletions.toLocaleString()}</b>
            </span>
          </button>
        </>
      ) : view === "number" ? (
        <button className="big" onClick={() => data.onView("overview")}>
          <strong>{lines.toLocaleString()}</strong>
          <span>
            lines changed, <b className="wf__add">+{additions.toLocaleString()}</b> <b className="wf__del">−{deletions.toLocaleString()}</b>
          </span>
          <em>{size.label}</em>
        </button>
      ) : (
        <div className="split">
          <div className="split__bar" role="img" aria-label={`${additions} lines added, ${deletions} removed`}>
            <b className="split__add" style={{ flex: Math.max(additions, 1) }} />
            <b className="split__del" style={{ flex: Math.max(deletions, additions + deletions ? deletions : 1) }} />
          </div>
          <p>
            <b className="wf__add">+{additions.toLocaleString()}</b> added, <b className="wf__del">−{deletions.toLocaleString()}</b> removed.{" "}
            {size.label}.
          </p>
        </div>
      )}
      {o("counts") && (
        <div className="total__counts">
          <button onClick={() => data.onView("changes")}>
            <strong>{files.length.toLocaleString()}</strong>
            <span>{files.length === 1 ? "file" : "files"}</span>
          </button>
          <button onClick={() => data.onView("changes")}>
            <strong>{functions.toLocaleString()}</strong>
            <span>{functions === 1 ? "function" : "functions"}</span>
          </button>
          <button onClick={() => data.onView("commits")}>
            <strong>{comparison.commits.length.toLocaleString()}</strong>
            <span>{comparison.commits.length === 1 ? "commit" : "commits"}</span>
          </button>
        </div>
      )}
    </>
  );
}

// Who committed today, from git's own author names. Teammates show up as soon as their
// commits reach this computer (Sync GitHub fetches them).
function Activity({ data, title, o }: WidgetProps) {
  const people = new Map<string, { commits: number; last: string; hours: number[] }>();
  for (const commit of todaysCommits(data.flow)) {
    const at = new Date(commit.authored_at);
    const person = people.get(commit.author) ?? { commits: 0, last: commit.authored_at, hours: [] };
    person.commits += 1;
    person.hours.push(at.getHours() + at.getMinutes() / 60);
    if (commit.authored_at > person.last) person.last = commit.authored_at;
    people.set(commit.author, person);
  }
  const rows = [...people.entries()].sort((a, b) => b[1].commits - a[1].commits || b[1].last.localeCompare(a[1].last));
  const total = rows.reduce((sum, [, person]) => sum + person.commits, 0);
  const now = new Date();
  const hourNow = now.getHours() + now.getMinutes() / 60;
  const day = Boolean(o("day"));
  return (
    <>
      <Head
        title={title}
        aside={total > 0 && `${total} ${total === 1 ? "commit" : "commits"} by ${rows.length} ${rows.length === 1 ? "person" : "people"}`}
      />
      {!data.flow ? (
        <Muted>Reading today's commits…</Muted>
      ) : rows.length === 0 ? (
        <Muted>Nobody has committed to this project today yet.</Muted>
      ) : (
        <ol className={`people${day ? "" : " people--plain"}`}>
          {rows.map(([name, person]) => (
            <li key={name}>
              <span className="people__avatar" style={{ ["--hue" as string]: hue(name) }} aria-hidden="true">
                {initials(name)}
              </span>
              <span className="people__name">
                <strong>{name}</strong>
                <span>last commit {ago(person.last)}</span>
              </span>
              {day && (
                <span className="people__day" aria-hidden="true" style={{ ["--now" as string]: `${(hourNow / 24) * 100}%` }}>
                  {person.hours.map((hour, i) => (
                    <b key={i} style={{ left: `${(hour / 24) * 100}%` }} />
                  ))}
                </span>
              )}
              <span className="people__count">
                {person.commits} {person.commits === 1 ? "commit" : "commits"}
              </span>
            </li>
          ))}
          {day && (
            <li className="people__axis" aria-hidden="true">
              <span>
                <i>0:00</i>
                <i>6:00</i>
                <i>12:00</i>
                <i>18:00</i>
              </span>
            </li>
          )}
        </ol>
      )}
      {rows.length === 1 && <p className="wf__foot">Teammates appear here once their commits reach this project.</p>}
    </>
  );
}

function LatestCommit({ data, title, o }: WidgetProps) {
  const comparison = data.comparison;
  const line = comparison ? branchLine(data.flow, comparison, 1 + Number(o("earlier"))) : [];
  const [latest, ...earlier] = line;
  return (
    <>
      <Head title={title} link={latest && { label: "All commits", go: () => data.onView("commits") }} />
      {!comparison ? (
        <Muted>Reading the branch…</Muted>
      ) : !latest ? (
        <Muted>
          No commits on <code>{comparison.head}</code> yet.
        </Muted>
      ) : (
        <>
          <article className="latest__top">
            <p className="latest__subject" title={latest.subject}>
              {latest.subject}
            </p>
            <p className="latest__meta">
              {latest.ai && (
                <span className="latest__ai" title="Written with an AI">
                  AI co-author
                </span>
              )}
              <span>{latest.author}</span>
              <span>{ago(latest.authored_at)}</span>
              <code>{latest.short_sha}</code>
            </p>
          </article>
          {earlier.length > 0 && <CommitLines commits={earlier} label="Earlier commits" />}
        </>
      )}
    </>
  );
}

function CommitLines({ commits, label, author }: { commits: { sha: string; subject: string; author: string; authored_at: string; ai: boolean }[]; label: string; author?: boolean }) {
  return (
    <ol className="lines" aria-label={label}>
      {commits.map((commit) => (
        <li key={commit.sha}>
          <span className={`lines__dot${commit.ai ? " lines__dot--ai" : ""}`} title={commit.ai ? "Written with an AI" : undefined} />
          <span className="lines__text" title={commit.subject}>
            {commit.subject}
            {author && <em> {commit.author}</em>}
          </span>
          <span className="lines__when">{ago(commit.authored_at)}</span>
        </li>
      ))}
    </ol>
  );
}

function Branches({ data, title, o }: WidgetProps) {
  const shown = data.comparison?.head ?? null;
  const branches = o("merged") ? data.branches : data.branches.filter((b) => !(b.merged || b.gone) || b.name === shown);
  return (
    <>
      <Head title={title} aside={data.branches.length > 0 && String(branches.length)} />
      {data.branches.length === 0 ? (
        <Muted>Reading the branches…</Muted>
      ) : (
        <ul className="picker" role="radiogroup" aria-label="Branch to show">
          {branches.map((branch) => {
            const on = branch.name === shown;
            const note = branchNote(branch);
            return (
              <li key={branch.name}>
                <button role="radio" aria-checked={on} className={`picker__item${on ? " is-on" : ""}`} onClick={() => !on && data.onHeadChange(branch.name)}>
                  <i aria-hidden="true" />
                  <code>{branch.name}</code>
                  {branch.name === data.checkedOut && <span className="picker__tag">checked out</span>}
                  {note && <span className="picker__note">{note}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function ChangedFiles({ data, title, o }: WidgetProps) {
  const comparison = data.comparison;
  if (!comparison) {
    return (
      <>
        <Head title={title} />
        <Muted>Reading the branch…</Muted>
      </>
    );
  }
  const { files } = branchTotals(comparison);
  const sorted = [...files].sort((a, b) =>
    o("sort") === "name" ? a.path.localeCompare(b.path) : b.additions + b.deletions - (a.additions + a.deletions));
  const shown = sorted.slice(0, Number(o("count")));
  const most = Math.max(1, ...files.map((file) => file.additions + file.deletions));
  return (
    <>
      <Head title={title} aside={`${files.length} ${files.length === 1 ? "file" : "files"}`} link={{ label: "Changes", go: () => data.onView("changes") }} />
      {files.length === 0 ? (
        <Muted>
          No changes compared with <code>{comparison.base}</code> yet.
        </Muted>
      ) : (
        <ul className="files">
          {shown.map((file) => (
            <li key={file.path}>
              <button onClick={() => data.onOpenFile(file.path)} title={`Open ${file.path} in Changes`}>
                <i className={`files__status files__status--${file.status}`} />
                <span className="files__path">
                  {file.path.includes("/") && <em>{file.path.slice(0, file.path.lastIndexOf("/") + 1)}</em>}
                  {file.path.split("/").pop()}
                </span>
                <span className="files__bar" aria-hidden="true">
                  <b className="files__add" style={{ width: `${(file.additions / most) * 100}%` }} />
                  <b className="files__del" style={{ width: `${(file.deletions / most) * 100}%` }} />
                </span>
                <span className="files__lines">
                  <b className="wf__add">+{file.additions}</b> <b className="wf__del">−{file.deletions}</b>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Commits({ data, title, o }: WidgetProps) {
  const commits = data.comparison?.commits ?? [];
  return (
    <>
      <Head title={title} aside={data.comparison && String(commits.length)} link={commits.length > 0 ? { label: "Commits", go: () => data.onView("commits") } : undefined} />
      {!data.comparison ? (
        <Muted>Reading the branch…</Muted>
      ) : commits.length === 0 ? (
        <Muted>
          No commits ahead of <code>{data.comparison.base}</code> yet.
        </Muted>
      ) : (
        <CommitLines commits={commits.slice(0, Number(o("count")))} label="Commits on this branch" author={Boolean(o("author"))} />
      )}
    </>
  );
}

function BranchFlow({ data, title }: WidgetProps) {
  if (data.flow && data.comparison && data.flow.commits.length > 1) {
    return (
      <FlowGraph flow={data.flow} head={data.comparison.head} branches={data.branches} onPick={data.onHeadChange} compact fill
                 onOpen={() => data.onView("flow")} />
    );
  }
  return (
    <section className="card wf__panel">
      <Head title={title} />
      <Muted>{data.flow ? "Not enough history to draw yet." : "Reading the branches…"}</Muted>
    </section>
  );
}

function MapTiles({ data, title, o }: WidgetProps) {
  const map = data.map;
  const parts = map ? mapParts(map, data.comparison?.files ?? []) : [];
  const languages = map ? languageTotals(map.areas) : [];
  const total = languages.reduce((sum, l) => sum + l.files, 0);
  const sorted = [...parts].sort((a, b) => b.changed.length - a.changed.length || b.files - a.files);
  return (
    <>
      <Head title={title} link={{ label: "Full map", go: () => data.onView("map") }} />
      {!map ? (
        <Muted>Reading the project's folders…</Muted>
      ) : (
        <>
          {o("languages") && total > 0 && (
            <div className="langbar" title={languages.map((l) => `${l.name} ${Math.round((l.files / total) * 100)}%`).join(", ")}>
              {languages.map((l) => (
                <span key={l.name} style={{ flex: l.files, background: languageColor(l.name) }} />
              ))}
            </div>
          )}
          <ul className="tiles">
            {sorted.map((part) => {
              const hot = part.changed.length > 0;
              return (
                <li key={part.id}>
                  <button className={`tiles__part${hot ? " tiles__part--hot" : ""}`} onClick={() => data.onView("map")} title={part.path || "top of the project"}>
                    <strong>{part.name}</strong>
                    <span>
                      {part.files} file{part.files === 1 ? "" : "s"}
                      {hot && <em> · {part.changed.length} changed</em>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}

function Languages({ data, title, o }: WidgetProps) {
  const languages = data.map ? languageTotals(data.map.areas) : [];
  const total = languages.reduce((sum, l) => sum + l.files, 0);
  return (
    <>
      <Head title={title} />
      {!data.map ? (
        <Muted>Reading the project's files…</Muted>
      ) : total === 0 ? (
        <Muted>No source files found.</Muted>
      ) : (
        <>
          <div className="langbar">
            {languages.map((l) => (
              <span key={l.name} style={{ flex: l.files, background: languageColor(l.name) }} />
            ))}
          </div>
          <ul className="langs">
            {languages.slice(0, Number(o("count"))).map((l) => (
              <li key={l.name}>
                <i style={{ background: languageColor(l.name) }} aria-hidden="true" />
                <span>{l.name}</span>
                <b>{Math.round((l.files / total) * 100)}%</b>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function AiPrompts({ data, title, o }: WidgetProps) {
  const changes = projectChanges(data, Boolean(o("all"))).filter((change) => !o("risky") || change.risky);
  return (
    <>
      <Head title={title} aside={data.digest && String(changes.length)} link={{ label: "AI changes", go: data.onDigest }} />
      {!data.digest ? (
        <Muted>Reading today's AI changes…</Muted>
      ) : changes.length === 0 ? (
        <Muted>{o("risky") ? "Nothing risky from the AI today." : "No AI changes today yet."}</Muted>
      ) : (
        <ol className="prompts">
          {changes.slice(0, Number(o("count"))).map((change) => (
            <li key={change.id}>
              <button className={change.undone_at ? "is-undone" : undefined} onClick={() => data.onOpenChange(change.id)} title={promptTitle(change)}>
                <span className="prompts__text">
                  {change.risky && <i className="prompts__risk">Needs a look</i>}
                  {change.prompt ?? "(prompt not captured)"}
                </span>
                <span className="prompts__meta">
                  {time(change.at)}
                  {o("all") && ` · ${change.repo.name}`} · <b className="wf__add">+{change.additions}</b> <b className="wf__del">−{change.deletions}</b>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function NeedsALook({ data, title, o }: WidgetProps) {
  const risky = kept(projectChanges(data, Boolean(o("all")))).filter((change) => change.risky);
  return (
    <>
      <Head title={title} />
      {!data.digest ? (
        <Muted>Reading…</Muted>
      ) : (
        <button className={`big${risky.length ? " big--risk" : ""}`} onClick={data.onDigest}>
          <strong>{risky.length}</strong>
          <span>{risky.length === 0 ? "Nothing risky from the AI today" : `AI ${risky.length === 1 ? "change touches" : "changes touch"} something risky`}</span>
        </button>
      )}
    </>
  );
}

function Recording({ data, title }: WidgetProps) {
  const [repairing, setRepairing] = useState(false);
  const [repairError, setRepairError] = useState<string | null>(null);
  const health = data.health;
  const repair = () => {
    setRepairing(true);
    setRepairError(null);
    api.repairRecording().then(data.onHealth, (e: Error) => setRepairError(e.message)).finally(() => setRepairing(false));
  };
  const lastCall = health ? Object.values(health.last_call).sort().pop() : undefined;
  const recording = (health?.tools.length ?? 0) > 0;
  const problems = health?.problems ?? [];
  return (
    <>
      <Head title={title} />
      {!health ? (
        <Muted>Checking the hooks…</Muted>
      ) : (
        <>
          <p className={`rec${problems.length || !recording ? " rec--warn" : ""}`}>
            {!recording ? "Not recording any project" : problems.length ? "Needs a fix" : "Recording"}
          </p>
          <p className="wf__muted">
            {recording && `${health.tools.join(", ")}. `}
            {lastCall ? `Last hook ${ago(lastCall)}.` : "No hook has run yet."}
            {health.errors > 0 && ` ${health.errors} errors in ${health.days} days.`}
          </p>
          {problems.map((problem) => (
            <p key={problem} className="rec__problem">
              {problem}
            </p>
          ))}
          {repairError && <p className="rec__problem">{repairError}</p>}
          {health.repairable && (
            <button className="wf__button" onClick={repair} disabled={repairing}>
              {repairing ? "Repairing…" : "Repair the hooks"}
            </button>
          )}
        </>
      )}
    </>
  );
}

function Projects({ data, title, o }: WidgetProps) {
  const cards = (data.cards ?? []).filter((card) => !o("busy") || card.uncommitted > 0);
  return (
    <>
      <Head title={title} aside={data.cards && String(cards.length)} link={{ label: "Projects", go: () => data.onView("project") }} />
      {!data.cards ? (
        <Muted>Reading your projects…</Muted>
      ) : cards.length === 0 ? (
        <Muted>{o("busy") ? "Every project is committed." : "No projects yet."}</Muted>
      ) : (
        <ul className="cards">
          {cards.map((card) => (
            <li key={card.id} className={card.id === data.picked?.id ? "is-on" : undefined}>
              <strong>{card.name}</strong>
              <code>{card.branch ?? "no branch"}</code>
              <span>
                {card.commits_this_week} this week
                {card.uncommitted > 0 && <em>, {card.uncommitted} not committed</em>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Uncommitted({ data, title }: WidgetProps) {
  const cards = data.cards ?? [];
  const files = cards.reduce((sum, card) => sum + card.uncommitted, 0);
  const projects = cards.filter((card) => card.uncommitted > 0).length;
  return (
    <>
      <Head title={title} />
      {!data.cards ? (
        <Muted>Reading…</Muted>
      ) : (
        <div className={`big${files ? " big--warn" : ""}`}>
          <strong>{files}</strong>
          <span>{files === 0 ? "Everything is committed" : `${files === 1 ? "file" : "files"} in ${projects} ${projects === 1 ? "project" : "projects"}`}</span>
        </div>
      )}
    </>
  );
}

function CommitDays({ data, title, o }: WidgetProps) {
  const days = Number(o("days"));
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const buckets = Array.from({ length: days }, (_, i) => {
    const day = new Date(start);
    day.setDate(day.getDate() - (days - 1 - i));
    return { day, count: 0 };
  });
  for (const commit of data.flow?.commits ?? []) {
    const at = new Date(commit.authored_at);
    at.setHours(0, 0, 0, 0);
    const bucket = buckets.find((b) => b.day.getTime() === at.getTime());
    if (bucket) bucket.count += 1;
  }
  const most = Math.max(1, ...buckets.map((b) => b.count));
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  return (
    <>
      <Head title={title} aside={data.flow && `${total} in ${days} days`} />
      {!data.flow ? (
        <Muted>Reading the history…</Muted>
      ) : (
        <div className="days" role="img" aria-label={buckets.map((b) => `${b.day.toLocaleDateString()}: ${b.count}`).join(", ")}>
          {buckets.map((b, i) => (
            <span key={i} title={`${b.day.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}: ${b.count}`}>
              <b style={{ height: `${(b.count / most) * 100}%` }} className={b.count ? undefined : "is-empty"} />
              {(i === 0 || i === buckets.length - 1 || days <= 7) && (
                <i>{b.day.toLocaleDateString(undefined, days <= 7 ? { weekday: "narrow" } : { day: "numeric", month: "short" })}</i>
              )}
            </span>
          ))}
        </div>
      )}
      {data.flow?.truncated && <p className="wf__foot">Counts the newest commits DevDash reads, not the whole history.</p>}
    </>
  );
}

const KEY_VIEWS: View[] = ["changes", "commits", "summary", "digest", "map", "flow", "project"];

function JumpTo({ data, title, o }: WidgetProps) {
  const caps: { id: string; label: string; icon: ReactNode; legend?: string; go: () => void }[] = [
    ...KEY_VIEWS.map((id) => {
      const view = VIEWS.find((item) => item.id === id)!;
      return { id, label: view.label, icon: view.icon, legend: data.shortcuts[`view:${id}`], go: () => data.onView(id) };
    }),
    { id: "sync", label: "Sync GitHub", icon: <SyncIcon />, legend: data.shortcuts.sync, go: data.onSync },
    { id: "add", label: "Add project", icon: <PlusIcon />, go: data.onAdd },
  ];
  return (
    <>
      <Head title={title} />
      <div className="keys">
        {caps.map((cap) => (
          <button key={cap.id} className="keycap" onClick={cap.go} title={cap.legend ? `${cap.label} (key ${cap.legend.toUpperCase()})` : cap.label}>
            <span className="keycap__top">
              {o("keys") && cap.legend && <kbd className="keycap__legend">{cap.legend.toUpperCase()}</kbd>}
              <span className="keycap__icon" aria-hidden="true">
                {cap.icon}
              </span>
              <span className="keycap__label">{cap.label}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

function Clock({ o }: WidgetProps) {
  const seconds = Boolean(o("seconds"));
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), seconds ? 1000 : 15_000);
    return () => clearInterval(timer);
  }, [seconds]);
  return (
    <div className="clockface">
      <strong>
        {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: seconds ? "2-digit" : undefined, hour12: !o("h24") })}
      </strong>
      {o("date") && <span>{now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</span>}
    </div>
  );
}

function PullRequestList({ data, title, o }: WidgetProps) {
  const repoId = data.picked?.id ?? null;
  const [found, setFound] = useState<PullRequests | null>(null);
  useEffect(() => {
    if (repoId === null) return;
    let stale = false;
    setFound(null);
    api.pulls(repoId).then((result) => !stale && setFound(result), () => !stale && setFound({ repo: null, connected: false, pulls: [], error: "Couldn't read the pull requests." }));
    return () => {
      stale = true;
    };
  }, [repoId]);
  const pulls = (found?.pulls ?? []).filter((pull) => o("drafts") || !pull.draft);
  return (
    <>
      <Head title={title} aside={found?.repo ?? undefined} />
      {!found ? (
        <Muted>Reading pull requests…</Muted>
      ) : found.error ? (
        <Muted>{found.error}</Muted>
      ) : !found.connected ? (
        <Muted>Connect {found.host === "codecommit" ? "CodeCommit" : "GitHub"} in Settings to see pull requests.</Muted>
      ) : pulls.length === 0 ? (
        <Muted>No open pull requests.</Muted>
      ) : (
        <ol className="pulls">
          {pulls.slice(0, Number(o("count"))).map((pull) => (
            <li key={pull.number}>
              <a href={pull.url} target="_blank" rel="noreferrer">
                <span className="pulls__title">
                  <b>#{pull.number}</b> {pull.title}
                  {pull.draft && <em> draft</em>}
                </span>
                <span className="pulls__meta">
                  {pull.author ?? "someone"}
                  {pull.branch && (
                    <>
                      {" "}
                      on <code>{pull.branch}</code>
                    </>
                  )}
                  {pull.updated_at && `, ${ago(pull.updated_at)}`}
                </span>
              </a>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function Note({ widget, title, o }: WidgetProps) {
  const text = String(o("text"));
  return (
    <>
      {widget.title && <Head title={title} />}
      {text ? (
        <p className={`note${o("size") === "large" ? " note--large" : ""}`}>{text}</p>
      ) : (
        <Muted>An empty note. Press Edit Home, then this note's settings, to write in it.</Muted>
      )}
    </>
  );
}

function OneNumber({ data, widget, o }: WidgetProps) {
  const metric = NUMBERS.find((n) => n.id === o("metric")) ?? NUMBERS[0];
  const value = metric.value(data);
  const content = (
    <>
      <strong>{value === null ? "…" : value.toLocaleString()}</strong>
      <span>{widget.title || metric.label}</span>
    </>
  );
  return metric.view ? (
    <button className="big big--tile" onClick={() => data.onView(metric.view!)}>
      {content}
    </button>
  ) : (
    <div className="big big--tile">{content}</div>
  );
}

// --- Helpers --------------------------------------------------------------------------------

// The branch's newest commits, newest first: from its tip in the flow down its first
// parents, or the commits ahead of the base when the flow hasn't loaded.
function branchLine(flow: Flow | null, comparison: Comparison, most: number): (FlowCommit | Comparison["commits"][number])[] {
  if (flow) {
    const bySha = new Map(flow.commits.map((commit) => [commit.sha, commit]));
    let at = flow.commits.find((commit) => commit.branches.includes(comparison.head));
    const line: FlowCommit[] = [];
    while (at && line.length < most) {
      line.push(at);
      at = at.parents[0] ? bySha.get(at.parents[0]) : undefined;
    }
    if (line.length) return line;
  }
  return comparison.commits.slice(0, most);
}

function promptTitle(change: DigestChange) {
  return `${time(change.at)}${change.tool ? ` · ${change.tool}` : ""}\n${change.prompt ?? "(prompt not captured)"}\n+${change.additions} −${
    change.deletions
  }${change.risky ? " · needs a look" : ""}${change.undone_at ? " · undone" : ""}`;
}

function time(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function initials(name: string) {
  const words = name.trim().split(/\s+/);
  return ((words[0]?.[0] ?? "?") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

// A steady colour per person, so the same name always gets the same avatar.
function hue(name: string) {
  let sum = 0;
  for (const char of name) sum = (sum * 31 + char.charCodeAt(0)) % 9973;
  return Math.round((sum * 137.5) % 360);
}

type Part = "night" | "morning" | "afternoon" | "evening";

// The greeting for the hour on this computer's clock.
function timeOfDay(): { part: Part; words: string } {
  const hour = new Date().getHours();
  if (hour < 5 || hour >= 22) return { part: "night", words: "Working late" };
  if (hour < 12) return { part: "morning", words: "Good morning" };
  if (hour < 17) return { part: "afternoon", words: "Good afternoon" };
  return { part: "evening", words: "Good evening" };
}

// A small picture of the sky beside the greeting: rising sun, sun, setting sun, moon.
function SkyIcon({ part }: { part: Part }) {
  const props = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8,
                  strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (part === "night") {
    return (
      <svg {...props}>
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
        <path d="M17 3.5v2M16 4.5h2" />
      </svg>
    );
  }
  if (part === "afternoon") {
    return (
      <svg {...props}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
      </svg>
    );
  }
  // Morning and evening: the sun on the horizon, rising or setting.
  return (
    <svg {...props}>
      <path d="M7 17a5 5 0 0 1 10 0" />
      <path d="M3 17h18M12 7v2M5.6 10.6l1.4 1.4M18.4 10.6L17 12M3.5 21h17" />
      <path d={part === "morning" ? "M10 4.5l2-2 2 2" : "M10 2.5l2 2 2-2"} />
    </svg>
  );
}

function SyncIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" />
      <path d="M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" />
      <path d="M20 20v-4h-4" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

export function ago(iso: string) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return days === 1 ? "yesterday" : `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
