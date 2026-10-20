import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { BranchInfo, Comparison, Digest, Flow, ProjectCard, ProjectMap, Repo, Todo } from "../../api/types";
import Agenda from "../Agenda/Agenda";
import FlowGraph from "../FlowGraph/FlowGraph";
import { languageColor, languageTotals, mapParts } from "../ProjectMap/ProjectMap";
import type { View } from "../SideMenu/SideMenu";
import Todos from "../Todos/Todos";
import "./Home.css";

// The start screen and the project's dashboard: every project at a glance; for the one
// picked, what its branch changes, how its branches flow and the map of its parts; then
// the to-do list and the calendar. Each section opens its full screen.

type Props = {
  repos: Repo[];
  todos: Todo[];
  onTodos: (update: (items: Todo[]) => Todo[]) => void;
  repoId: number | null;
  head: string | null;
  // Changes when any project might have, so the cards are read again.
  version: string;
  // The picked project's branch, flow and map; null while they load.
  comparison: Comparison | null;
  branches: BranchInfo[];
  flow: Flow | null;
  map: ProjectMap | null;
  onPick: (repoId: number) => void;
  onOpen: (repoId: number) => void;
  onHeadChange: (head: string) => void;
  onView: (view: View) => void;
  onOpenFile: (path: string) => void;
  onAdd: () => void;
  onDigest: () => void;
};

export default function Home(props: Props) {
  const { repos, todos, onTodos, repoId, head, version, onAdd, onDigest } = props;
  const [cards, setCards] = useState<ProjectCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Today's Claude changes, for a line that leads to the digest.
  const [digest, setDigest] = useState<Digest | null>(null);

  useEffect(() => {
    let stale = false;
    api.home().then(
      (result) => !stale && (setCards(result), setError(null)),
      (e: Error) => !stale && setError(e.message),
    );
    api.digest().then((result) => !stale && setDigest(result), () => {});
    return () => {
      stale = true;
    };
  }, [version]);

  const open = todos.filter((item) => !item.done_at);
  const openFor = (id: number) => open.filter((item) => item.repo_id === id).length;
  const uncommitted = (cards ?? []).reduce((sum, card) => sum + card.uncommitted, 0);
  const week = (cards ?? []).reduce((sum, card) => sum + card.commits_this_week, 0);
  const picked = repos.find((repo) => repo.id === repoId) ?? null;

  return (
    <div className="home">
      <section className="home__hello">
        <div>
          <h2>{greeting()}</h2>
          <span>{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</span>
        </div>
        <ul className="home__stats">
          <Stat value={repos.length} label={repos.length === 1 ? "project" : "projects"} />
          <Stat value={open.length} label={open.length === 1 ? "to-do open" : "to-dos open"} />
          <Stat value={week} label={week === 1 ? "commit this week" : "commits this week"} />
          <Stat value={uncommitted} label={uncommitted === 1 ? "file not committed" : "files not committed"} warn={uncommitted > 0} />
          {digest && digest.claude.prompts > 0 && (
            <li>
              <button className={`home__stat home__claude${digest.claude.risky ? " home__claude--risk" : ""}`} onClick={onDigest}>
                <strong>{digest.claude.risky || digest.claude.prompts}</strong>
                <span>
                  {digest.claude.risky
                    ? `of today's ${digest.claude.prompts} AI changes need a look`
                    : `AI ${digest.claude.prompts === 1 ? "change" : "changes"} today`}
                </span>
              </button>
            </li>
          )}
        </ul>
      </section>

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
                // One click shows the project here; a double click opens its summary.
                onClick={() => props.onPick(card.id)}
                onDoubleClick={() => props.onOpen(card.id)}
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
                      {openFor(card.id) > 0 && (
                        <span className="project__todo">
                          {openFor(card.id)} to-do{openFor(card.id) === 1 ? "" : "s"}
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

      <BranchChanges {...props} project={picked?.name ?? null} />

      <div className="home__flow">
        {props.flow && props.comparison && props.flow.commits.length > 1 ? (
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
        )}
      </div>

      <MapPreview map={props.map} comparison={props.comparison} onView={props.onView} />

      <div className="home__todos">
        <Todos items={todos} onItems={onTodos} repos={repos} repoId={repoId} head={head} initialScope="all" />
      </div>
      <div className="home__calendar">
        <Agenda days={3} />
      </div>
    </div>
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
        <span className="home__links">
          <button className="card__link" onClick={() => onView("constellation")}>
            Constellation ›
          </button>
          <button className="card__link" onClick={() => onView("map")}>
            Full map ›
          </button>
        </span>
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

function greeting() {
  const hour = new Date().getHours();
  return hour < 5 ? "Working late" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
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
