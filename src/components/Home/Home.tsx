import { useEffect, useState, type ReactNode } from "react";
import { api } from "../../api/client";
import type {
  BranchInfo, Comparison, Digest, Flow, HomeLayout, PreferenceChange, Preferences, ProjectCard, ProjectMap,
  RecordingHealth, Repo, Widget,
} from "../../api/types";
import Agenda from "../Agenda/Agenda";
import FlowGraph from "../FlowGraph/FlowGraph";
import { languageColor, languageTotals, mapParts } from "../ProjectMap/ProjectMap";
import type { View } from "../SideMenu/SideMenu";
import "./Home.css";

// The start screen: a greeting with the one thing that most needs you, then the widgets
// the person picked, in their order (Customise moves and hides them; the layout is kept in
// their settings). AI today leads by default: what the AI changed and whether recording works.

type Props = {
  repos: Repo[];
  repoId: number | null;
  head: string | null;
  // Changes when any project might have, so the cards are read again.
  version: string;
  // The picked project's branch, flow and map; null while they load.
  comparison: Comparison | null;
  branches: BranchInfo[];
  flow: Flow | null;
  map: ProjectMap | null;
  // The saved settings, for the layout; null while they load.
  prefs: Preferences | null;
  onPrefs: (changes: PreferenceChange) => Promise<void>;
  onPick: (repoId: number) => void;
  onOpen: (repoId: number) => void;
  onHeadChange: (head: string) => void;
  onView: (view: View) => void;
  onOpenFile: (path: string) => void;
  onAdd: () => void;
  onDigest: () => void;
  // The signed-in DevDash username, for the greeting; none before a password is set.
  username?: string;
};

const WIDGET_NAMES: Record<Widget, string> = {
  ai: "AI today",
  projects: "Projects",
  branch: "Branch changes",
  flow: "Branch flow",
  map: "Project map",
  calendar: "Calendar",
};
const DEFAULT_LAYOUT: HomeLayout = { order: ["ai", "projects", "branch", "flow", "map", "calendar"], hidden: ["map", "calendar"] };

export default function Home(props: Props) {
  const { repos, repoId, version, onAdd, onDigest } = props;
  const [cards, setCards] = useState<ProjectCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Today's AI changes and whether the hooks that record them work.
  const [digest, setDigest] = useState<Digest | null>(null);
  const [health, setHealth] = useState<RecordingHealth | null>(null);
  const [editing, setEditing] = useState(false);
  // Shown at once while a change saves; the saved settings win when they arrive.
  const [layout, setLayout] = useState<HomeLayout>(props.prefs?.home ?? DEFAULT_LAYOUT);
  useEffect(() => {
    if (props.prefs) setLayout(props.prefs.home);
  }, [props.prefs]);

  useEffect(() => {
    let stale = false;
    api.home().then(
      (result) => !stale && (setCards(result), setError(null)),
      (e: Error) => !stale && setError(e.message),
    );
    api.digest().then((result) => !stale && setDigest(result), () => {});
    api.recordingHealth().then((result) => !stale && setHealth(result), () => {});
    return () => {
      stale = true;
    };
  }, [version]);

  const save = (next: HomeLayout) => {
    setLayout(next);
    props.onPrefs({ home: next }).catch(() => {});
  };
  const move = (widget: Widget, by: number) => {
    const order = [...layout.order];
    const at = order.indexOf(widget);
    const to = at + by;
    if (to < 0 || to >= order.length) return;
    [order[at], order[to]] = [order[to], order[at]];
    save({ ...layout, order });
  };
  const toggle = (widget: Widget) =>
    save({
      ...layout,
      hidden: layout.hidden.includes(widget) ? layout.hidden.filter((w) => w !== widget) : [...layout.hidden, widget],
    });
  const reset = () => api.resetHome().then((saved) => setLayout(saved.home), () => save(DEFAULT_LAYOUT));

  const uncommitted = (cards ?? []).reduce((sum, card) => sum + card.uncommitted, 0);
  const week = (cards ?? []).reduce((sum, card) => sum + card.commits_this_week, 0);
  const picked = repos.find((repo) => repo.id === repoId) ?? null;
  const moment = timeOfDay();
  // One line on what most needs you right now, from real numbers: recording that's broken,
  // then AI changes to check, then work not committed, then a quiet "all caught up".
  const risky = digest?.claude.risky ?? 0;
  const aiToday = digest?.claude.prompts ?? 0;
  const broken = (health?.problems.length ?? 0) > 0;
  const status: { text: string; tone: "risk" | "warn" | "calm"; go?: () => void } = broken
    ? { text: "AI recording needs a fix", tone: "risk" }
    : risky > 0
      ? { text: `${risky} AI ${risky === 1 ? "change needs" : "changes need"} a look`, tone: "risk", go: onDigest }
      : uncommitted > 0
        ? { text: `${uncommitted} ${uncommitted === 1 ? "file" : "files"} not committed yet`, tone: "warn" }
        : aiToday > 0
          ? { text: `${aiToday} AI ${aiToday === 1 ? "prompt" : "prompts"} today, nothing risky`, tone: "calm", go: onDigest }
          : { text: "All caught up", tone: "calm" };

  const widgets: Record<Widget, () => ReactNode> = {
    ai: () => <AiToday digest={digest} health={health} onHealth={setHealth} onDigest={onDigest} />,
    projects: () => <Projects cards={cards} error={error} repoId={repoId} onAdd={onAdd} onPick={props.onPick} onOpen={props.onOpen} />,
    branch: () => <BranchChanges {...props} project={picked?.name ?? null} />,
    flow: () =>
      props.flow && props.comparison && props.flow.commits.length > 1 ? (
        <FlowGraph
          flow={props.flow}
          head={props.comparison.head}
          branches={props.branches}
          onPick={props.onHeadChange}
          compact
          onOpen={() => props.onView("flow")}
        />
      ) : (
        <section className="card home__section">
          <header className="card__header">
            <h2 className="card__title">Branch flow</h2>
          </header>
          <p className="home__muted">{props.flow ? "Not enough history to draw yet." : "Reading the branches…"}</p>
        </section>
      ),
    map: () => <MapPreview map={props.map} comparison={props.comparison} onView={props.onView} />,
    calendar: () => <Agenda days={3} />,
  };
  const shown = layout.order.filter((w) => !layout.hidden.includes(w));

  return (
    <div className={`home${editing ? " home--editing" : ""}`}>
      <section className="home__hello">
        <div className="home__greet">
          <span className={`home__sky home__sky--${moment.part}`} aria-hidden="true">
            <SkyIcon part={moment.part} />
          </span>
          <div>
            <h2>
              {moment.words}
              {props.username && (
                <>
                  , <span className="home__name">{props.username}</span>
                </>
              )}
            </h2>
            <p className="home__sub">
              <span>{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</span>
              {cards && (
                <>
                  <span aria-hidden="true"> · </span>
                  {status.go ? (
                    <button className={`home__mood home__mood--${status.tone}`} onClick={status.go}>
                      {status.text}
                    </button>
                  ) : (
                    <span className={`home__mood home__mood--${status.tone}`}>{status.text}</span>
                  )}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="home__tools">
          <ul className="home__stats">
            <Stat value={repos.length} label={repos.length === 1 ? "project" : "projects"} />
            <Stat value={week} label={week === 1 ? "commit this week" : "commits this week"} />
            <Stat value={uncommitted} label={uncommitted === 1 ? "file not committed" : "files not committed"} warn={uncommitted > 0} />
          </ul>
          {editing && (
            <button className="home__tool" onClick={reset}>
              Reset
            </button>
          )}
          <button
            className={`home__tool${editing ? " home__tool--on" : ""}`}
            onClick={() => setEditing(!editing)}
            aria-pressed={editing}
            title="Pick which widgets Home shows, and their order"
          >
            {editing ? "Done" : "Customise"}
          </button>
        </div>
      </section>

      {shown.length === 0 && !editing && (
        <section className="card home__section widget--ai">
          <p className="home__muted">Every widget is hidden. Press Customise to bring some back.</p>
        </section>
      )}
      {layout.order.map((widget, at) => {
        const hidden = layout.hidden.includes(widget);
        if (hidden && !editing) return null;
        const bar = editing && (
          <span className="widget__bar" role="group" aria-label={`Arrange ${WIDGET_NAMES[widget]}`}>
            <button onClick={() => move(widget, -1)} disabled={at === 0} title="Move up" aria-label={`Move ${WIDGET_NAMES[widget]} up`}>
              ↑
            </button>
            <button
              onClick={() => move(widget, 1)}
              disabled={at === layout.order.length - 1}
              title="Move down"
              aria-label={`Move ${WIDGET_NAMES[widget]} down`}
            >
              ↓
            </button>
            <button onClick={() => toggle(widget)}>{hidden ? "Show" : "Hide"}</button>
          </span>
        );
        return (
          <div key={widget} className={`widget widget--${hidden ? "hidden" : widget}`} style={{ ["--i" as string]: at }}>
            {hidden ? (
              <div className="widget__ghost">
                <span>{WIDGET_NAMES[widget]} is hidden</span>
                {bar}
              </div>
            ) : (
              <>
                {bar}
                {widgets[widget]()}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// What the AI changed today, and whether the hooks that record it work. The numbers are the
// digest's, which leave out undone changes; each bar is one prompt, its height the lines it
// changed, red when it touched something risky. Any recording problem comes first, with a fix.
function AiToday({ digest, health, onHealth, onDigest }: {
  digest: Digest | null;
  health: RecordingHealth | null;
  onHealth: (health: RecordingHealth) => void;
  onDigest: () => void;
}) {
  const [repairing, setRepairing] = useState(false);
  const [repairError, setRepairError] = useState<string | null>(null);
  const repair = () => {
    setRepairing(true);
    setRepairError(null);
    api.repairRecording().then(onHealth, (e: Error) => setRepairError(e.message)).finally(() => setRepairing(false));
  };
  const claude = digest?.claude;
  const changes = [...(digest?.changes ?? [])].reverse(); // oldest first, left to right
  const most = Math.max(1, ...changes.map((c) => c.additions + c.deletions));
  const recording = (health?.tools.length ?? 0) > 0;
  const problems = health?.problems ?? [];
  const lastCall = health ? Object.values(health.last_call).sort().pop() : undefined;
  return (
    <section className="card ai">
      <header className="ai__head">
        <h2 className="card__title">AI today</h2>
        {health && (
          <span className={`ai__live${problems.length || !recording ? " ai__live--warn" : ""}`}>
            {!recording
              ? "Not recording any project"
              : problems.length
                ? "Recording needs a fix"
                : `Recording${lastCall ? ` · last hook ${ago(lastCall)}` : ""}`}
          </span>
        )}
        <button className="card__link" onClick={onDigest}>
          Every change ›
        </button>
      </header>
      {problems.length > 0 && (
        <div className="ai__problems" role="alert">
          {problems.map((problem) => (
            <p key={problem}>{problem}</p>
          ))}
          {repairError && <p>{repairError}</p>}
          {health?.repairable && (
            <button className="home__tool" onClick={repair} disabled={repairing}>
              {repairing ? "Repairing…" : "Repair the hooks"}
            </button>
          )}
        </div>
      )}
      {!claude ? (
        <p className="home__muted">Reading today's changes…</p>
      ) : (
        <>
          <ul className="ai__numbers">
            <li>
              <strong>{claude.prompts}</strong>
              <span>{claude.prompts === 1 ? "prompt that changed code" : "prompts that changed code"}</span>
            </li>
            <li>
              <strong>
                <b className="home__add">+{claude.additions.toLocaleString()}</b> <b className="home__del">−{claude.deletions.toLocaleString()}</b>
              </strong>
              <span>
                lines in {claude.files} {claude.files === 1 ? "file" : "files"}
              </span>
            </li>
            <li className={claude.risky ? "ai__risk" : undefined}>
              <strong>{claude.risky}</strong>
              <span>{claude.risky === 1 ? "needs a careful look" : "need a careful look"}</span>
            </li>
            <li>
              <strong>{claude.uncommitted}</strong>
              <span>not committed yet</span>
            </li>
          </ul>
          <div className="ai__timeline">
            {changes.length === 0 ? (
              <p className="home__muted">No AI changes recorded today yet.</p>
            ) : (
              <div className="ai__bars" aria-label="Today's prompts, oldest first">
                {changes.map((change, i) => {
                  const lines = change.additions + change.deletions;
                  return (
                    <button
                      key={change.id}
                      className={`ai__bar${change.risky ? " ai__bar--risk" : ""}${change.undone_at ? " ai__bar--undone" : ""}`}
                      onClick={onDigest}
                      style={{ ["--i" as string]: i }}
                      title={`${new Date(change.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} · ${
                        change.repo.name
                      }\n${change.prompt ?? "(prompt not captured)"}\n+${change.additions} −${change.deletions}${
                        change.risky ? " · needs a look" : ""
                      }${change.undone_at ? " · undone" : ""}`}
                    >
                      <b style={{ height: `${Math.max(4, (lines / most) * 100)}%` }} />
                    </button>
                  );
                })}
              </div>
            )}
            <ul className="ai__notes">
              {claude.watched_files > 0 && (
                <li>
                  {claude.watched_files} {claude.watched_files === 1 ? "file was" : "files were"} changed by a shell command
                  rather than the AI's edit tool, so it may include your own edits made at the same time.
                </li>
              )}
              {claude.undone > 0 && (
                <li>
                  {claude.undone} undone {claude.undone === 1 ? "change is" : "changes are"} left out of these numbers.
                </li>
              )}
              <li>Chats in the Claude app (Cowork) don't run hooks, so they show only once committed with an AI co-author.</li>
            </ul>
          </div>
        </>
      )}
    </section>
  );
}

// Every project at a glance; a click shows it on Home, a double click opens its summary.
function Projects({ cards, error, repoId, onAdd, onPick, onOpen }: {
  cards: ProjectCard[] | null;
  error: string | null;
  repoId: number | null;
  onAdd: () => void;
  onPick: (repoId: number) => void;
  onOpen: (repoId: number) => void;
}) {
  return (
    <section className="card home__projects">
      <header>
        <h3>Projects</h3>
        <button className="home__link" onClick={onAdd}>
          + Add
        </button>
      </header>
      {error && <p className="home__muted">{error}</p>}
      {!cards && !error && <p className="home__muted">Reading your projects…</p>}
      <ul>
        {(cards ?? []).map((card) => (
          <li key={card.id}>
            <button
              className={`project${card.id === repoId ? " project--current" : ""}`}
              onClick={() => onPick(card.id)}
              onDoubleClick={() => onOpen(card.id)}
              disabled={!card.exists}
              title={`${card.path}\nClick to show it here, double-click to open its summary`}
              aria-pressed={card.id === repoId}
            >
              <span className="project__top">
                <strong>{card.name}</strong>
                {card.branch && <code>{card.branch}</code>}
              </span>
              {!card.exists ? (
                <span className="project__warn">Folder missing: {card.path}</span>
              ) : (
                <>
                  <span className="project__facts">
                    {card.ahead !== null && card.base && (
                      <span>
                        {card.ahead} commit{card.ahead === 1 ? "" : "s"} ahead of {card.base}
                      </span>
                    )}
                    {card.uncommitted > 0 && (
                      <span className="project__warn">
                        {card.uncommitted} file{card.uncommitted === 1 ? "" : "s"} not committed
                      </span>
                    )}
                    <span className="project__muted">
                      {card.branches} branch{card.branches === 1 ? "" : "es"}
                    </span>
                  </span>
                  {card.last_commit ? (
                    <span className="project__last">
                      <span>{card.last_commit.subject}</span>
                      <em>
                        {card.last_commit.author}, {ago(card.last_commit.at)}
                      </em>
                    </span>
                  ) : (
                    <span className="project__muted">No commits yet</span>
                  )}
                </>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// What the picked project's branch changes, compared with its base: the size of it, the
// files (each opens in Changes) and a branch picker.
function BranchChanges({ comparison, branches, project, onHeadChange, onView, onOpenFile }: Props & { project: string | null }) {
  if (!comparison) {
    return (
      <section className="card home__section home__changes">
        <header className="card__header">
          <h2 className="card__title">Branch changes</h2>
        </header>
        <p className="home__muted">{project ? `Reading ${project}…` : "Pick a project to see its branch."}</p>
      </section>
    );
  }
  const files = comparison.files.filter((file) => !file.generated);
  const additions = files.reduce((sum, file) => sum + file.additions, 0);
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0);
  const functions = files.reduce((sum, file) => sum + file.functions.length, 0);
  const biggest = [...files].sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions));
  const most = Math.max(1, ...biggest.map((file) => file.additions + file.deletions));
  return (
    <section className="card home__section home__changes">
      <header className="card__header">
        <h2 className="card__title">Branch changes</h2>
        <button className="card__link" onClick={() => onView("overview")}>
          This branch ›
        </button>
      </header>
      <div className="home__branch">
        <select
          className="select home__picker"
          value={comparison.head}
          onChange={(event) => onHeadChange(event.target.value)}
          aria-label="Branch to show"
        >
          {branches.map((branch) => (
            <option key={branch.name} value={branch.name}>
              {branch.name}
              {branch.gone ? " · deleted on GitHub" : branch.merged ? " · merged" : ""}
            </option>
          ))}
        </select>
        <span className="home__muted">
          {project && <>{project} · </>}vs <code>{comparison.base}</code>
          {comparison.behind > 0 && <> · {comparison.behind} behind</>}
          {comparison.uncommitted && " · with uncommitted work"}
        </span>
      </div>
      <ul className="home__numbers">
        <li>
          <strong>
            <b className="home__add">+{additions.toLocaleString()}</b> <b className="home__del">−{deletions.toLocaleString()}</b>
          </strong>
          <span>lines</span>
        </li>
        <li>
          <strong>{files.length}</strong>
          <span>{files.length === 1 ? "file" : "files"}</span>
        </li>
        <li>
          <strong>{functions}</strong>
          <span>{functions === 1 ? "function" : "functions"}</span>
        </li>
        <li>
          <button onClick={() => onView("commits")}>
            <strong>{comparison.commits.length}</strong>
            <span>{comparison.commits.length === 1 ? "commit" : "commits"}</span>
          </button>
        </li>
      </ul>
      {files.length === 0 ? (
        <p className="home__muted">
          No changes compared with <code>{comparison.base}</code> yet.
        </p>
      ) : (
        <ul className="home__files">
          {biggest.map((file) => (
            <li key={file.path}>
              <button onClick={() => onOpenFile(file.path)} title={`Open ${file.path} in Changes`}>
                <i className={`home__status home__status--${file.status}`} />
                <span className="home__path">
                  {file.path.includes("/") && <em>{file.path.slice(0, file.path.lastIndexOf("/") + 1)}</em>}
                  {file.path.split("/").pop()}
                </span>
                <span className="home__bar" aria-hidden="true">
                  <b className="home__bar-add" style={{ width: `${(file.additions / most) * 100}%` }} />
                  <b className="home__bar-del" style={{ width: `${(file.deletions / most) * 100}%` }} />
                </span>
                <span className="home__lines">
                  <b className="home__add">+{file.additions}</b> <b className="home__del">−{file.deletions}</b>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button className="card__link home__all" onClick={() => onView("changes")}>
        All changes, function by function ›
      </button>
    </section>
  );
}

// The project's parts as tiles, the ones this branch changed lit up, with the mix of
// languages; each tile opens the full map.
function MapPreview({ map, comparison, onView }: { map: ProjectMap | null; comparison: Comparison | null; onView: (view: View) => void }) {
  const parts = map ? mapParts(map, comparison?.files ?? []) : [];
  const languages = map ? languageTotals(map.areas) : [];
  const total = languages.reduce((sum, l) => sum + l.files, 0);
  const sorted = [...parts].sort((a, b) => b.changed.length - a.changed.length || b.files - a.files);
  return (
    <section className="card home__section home__map">
      <header className="card__header">
        <h2 className="card__title">Project map</h2>
        <button className="card__link" onClick={() => onView("map")}>
          Full map ›
        </button>
      </header>
      {!map ? (
        <p className="home__muted">Reading the project's folders…</p>
      ) : (
        <>
          {total > 0 && (
            <div className="home__langs" title={languages.map((l) => `${l.name} ${Math.round((l.files / total) * 100)}%`).join(", ")}>
              {languages.map((l) => (
                <span key={l.name} style={{ flex: l.files, background: languageColor(l.name) }} />
              ))}
            </div>
          )}
          <ul className="home__parts">
            {sorted.map((part) => {
              const hot = part.changed.length > 0;
              return (
                <li key={part.id}>
                  <button className={`home__part${hot ? " home__part--hot" : ""}`} onClick={() => onView("map")} title={part.path || "top of the project"}>
                    <strong>{part.name}</strong>
                    <span>
                      {part.files} file{part.files === 1 ? "" : "s"}
                      {hot && <em> · {part.changed.length} changed</em>}
                    </span>
                    <i aria-hidden="true">
                      {part.languages.slice(0, 3).map((l) => (
                        <b key={l.name} style={{ flex: l.files, background: languageColor(l.name) }} />
                      ))}
                    </i>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="home__muted">
            {map.edges.length} import link{map.edges.length === 1 ? "" : "s"} between {parts.length} part{parts.length === 1 ? "" : "s"}.
          </p>
        </>
      )}
    </section>
  );
}

function Stat({ value, label, warn }: { value: number; label: string; warn?: boolean }) {
  return (
    <li className={warn ? "home__stat home__stat--warn" : "home__stat"}>
      <strong>{value}</strong>
      <span>{label}</span>
    </li>
  );
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

function ago(iso: string) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return days === 1 ? "yesterday" : `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
