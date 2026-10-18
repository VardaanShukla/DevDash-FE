import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, SIGNED_OUT } from "./api/client";
import type { AiStatus, AuthStatus, Branches, Comparison, Flow, ProjectMap as MapData, Repo, Summary as SummaryData, Sync, Todo } from "./api/types";
import AddProject from "./components/AddProject/AddProject";
import Agenda from "./components/Agenda/Agenda";
import Digest from "./components/Digest/Digest";
import CommitList from "./components/CommitList/CommitList";
import FileChanges from "./components/FileChanges/FileChanges";
import FlowGraph from "./components/FlowGraph/FlowGraph";
import Help, { useSetup } from "./components/Help/Help";
import Home from "./components/Home/Home";
import Login from "./components/Login/Login";
import Overview from "./components/Overview/Overview";
import Constellation from "./components/Constellation/Constellation";
import ProjectMap from "./components/ProjectMap/ProjectMap";
import ProjectPanel from "./components/ProjectPanel/ProjectPanel";
import RemoveProject from "./components/RemoveProject/RemoveProject";
import SideMenu, { VIEWS, type View } from "./components/SideMenu/SideMenu";
import Sidebar from "./components/Sidebar/Sidebar";
import Summary from "./components/Summary/Summary";
import Todos from "./components/Todos/Todos";
import Splash from "./components/Splash/Splash";
import "./App.css";

type Theme = "light" | "dark";

// The view in the address bar (#changes), so a refresh or a shared link keeps it.
function viewFromHash(): View {
  const id = window.location.hash.slice(1);
  return VIEWS.some((item) => item.id === id) ? (id as View) : "home";
}

// Remembered per browser; a blocked storage just means the default each time.
function savedTheme(): Theme {
  try {
    const value = localStorage.getItem("devdash-theme");
    if (value === "light" || value === "dark") return value;
  } catch {
    /* storage unavailable */
  }
  // The dashboard is designed dark first.
  return "dark";
}

// The splash, with the sign-in panel sliding in once its globe has formed when a password is
// set (or the first time, to set one), then the dashboard.
export default function App() {
  const [splashDone, setSplashDone] = useState(false);
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  // Bumped on signing out, to play the splash again with the sign-in panel.
  const [round, setRound] = useState(0);

  useEffect(() => {
    document.documentElement.dataset.theme = savedTheme();
    // When the backend can't be reached, the dashboard says so.
    api.auth().then(setAuth, () => setAuth({ password_set: true, signed_in: true }));
    const signedOut = () => {
      setAuth({ password_set: true, signed_in: false });
      setSplashDone(false);
      setRound((n) => n + 1);
    };
    window.addEventListener(SIGNED_OUT, signedOut);
    return () => window.removeEventListener(SIGNED_OUT, signedOut);
  }, []);

  const signOut = () => api.logOut().finally(() => window.dispatchEvent(new Event(SIGNED_OUT)));
  // The dashboard loads under the splash once signed in, and shows as the splash fades.
  return (
    <>
      {auth?.signed_in && <Dashboard onSignOut={auth.password_set ? signOut : undefined} />}
      {!splashDone && (
        <Splash
          key={round}
          hold={auth ? !auth.signed_in : null}
          panel={
            auth &&
            !auth.signed_in && (
              <Login setup={!auth.password_set} onSignedIn={() => setAuth({ password_set: true, signed_in: true })} />
            )
          }
          onDone={() => setSplashDone(true)}
        />
      )}
    </>
  );
}

function Dashboard({ onSignOut }: { onSignOut?: () => void }) {
  const [view, setView] = useState<View>(viewFromHash);
  const [theme, setTheme] = useState<Theme>(savedTheme);
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [repoId, setRepoId] = useState<number | null>(null);
  const [branches, setBranches] = useState<Branches | null>(null);
  const [head, setHead] = useState<string | null>(null);
  // Only set when the project has no usual base branch and the user picked one.
  const [base, setBase] = useState<string | null>(null);
  const [uncommitted, setUncommitted] = useState(false);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [map, setMap] = useState<MapData | null>(null);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  // The to-do list, for My day and the count on its menu item.
  const [todos, setTodos] = useState<Todo[]>([]);
  // Whether Claude Code is installed and signed in, to explain functions and the project.
  const [ai, setAi] = useState<AiStatus | null>(null);
  const refreshAi = useCallback(() => {
    api.ai().then(setAi).catch(() => setAi(null));
  }, []);
  // Claude Code answers 424 when its sign-in has run out: offer signing in instead.
  const watchSignIn = useCallback(<T,>(promise: Promise<T>) =>
    promise.catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 424) setAi((current) => current && { ...current, signed_in: false });
      throw e;
    }), []);
  // A file to show in What changed, picked from the project map; count re-picks the same.
  const [focus, setFocus] = useState<{ path: string; count: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Repo | null>(null);
  // Bumped whenever git changes underneath the page, to reload without a refresh.
  const [revision, setRevision] = useState(0);
  const branchesRef = useRef<Branches | null>(null);
  const [sync, setSync] = useState<(Sync & { running: boolean }) | null>(null);
  const syncNow = useRef<() => void>(() => {});
  branchesRef.current = branches;

  // Everything shown belongs to one project, so switching clears it in the same render;
  // otherwise one request would go out with the old project's branch names.
  const selectRepo = (id: number | null) => {
    setRepoId(id);
    setBranches(null);
    setHead(null);
    setBase(null);
    setComparison(null);
    setFlow(null);
    setMap(null);
    setSummary(null);
    setError(null);
  };

  useEffect(() => {
    if (window.location.hash.slice(1) !== view) history.replaceState(null, "", `#${view}`);
    const onHash = () => setView(viewFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [view]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("devdash-theme", theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);

  useEffect(() => {
    api
      .repos()
      .then((list) => {
        setRepos(list);
        selectRepo(list.find((repo) => repo.exists)?.id ?? null);
      })
      .catch((e: ApiError) => setError(e.message));
  }, []);


  useEffect(() => {
    if (repoId === null) return;
    let stale = false;
    api
      .branches(repoId)
      .then((result) => {
        if (stale) return;
        const previous = branchesRef.current;
        setBranches(result);
        // Follow a checkout when the page was showing the checked-out branch, and fall
        // back to it when the shown branch was deleted; otherwise keep the user's pick.
        setHead((shown) =>
          shown === null || shown === previous?.current || !result.branches.includes(shown)
            ? result.current ?? result.branches[0] ?? null
            : shown,
        );
      })
      .catch((e: ApiError) => !stale && setError(e.message));
    return () => {
      stale = true;
    };
  }, [repoId, revision]);

  // The branch flow: reloaded with everything else when git changes.
  useEffect(() => {
    if (repoId === null) return;
    let stale = false;
    api
      .flow(repoId)
      .then((result) => !stale && setFlow(result))
      .catch(() => !stale && setFlow(null));
    return () => {
      stale = true;
    };
  }, [repoId, revision]);

  // The project map for the branch on screen, from its committed files.
  useEffect(() => {
    if (repoId === null || head === null) return;
    let stale = false;
    api
      .map(repoId, head)
      .then((result) => !stale && setMap(result))
      .catch(() => !stale && setMap(null));
    return () => {
      stale = true;
    };
  }, [repoId, head, revision]);

  // The project summary for the branch on screen.
  useEffect(() => {
    if (repoId === null || head === null) return;
    let stale = false;
    api
      .summary(repoId, head)
      .then((result) => !stale && setSummary(result))
      .catch(() => !stale && setSummary(null));
    return () => {
      stale = true;
    };
  }, [repoId, head, revision]);

  useEffect(refreshAi, [refreshAi]);

  useEffect(() => {
    api.todos().then(setTodos).catch(() => setTodos([]));
  }, []);

  // Fetch from GitHub now and then, so merges and branches deleted there show up here.
  // Only remote-tracking refs change; the watcher below notices and reloads.
  useEffect(() => {
    if (repoId === null) return;
    let stopped = false;
    let lastAttempt = 0;
    setSync(null);
    const run = async (force = false) => {
      const now = Date.now();
      if (stopped || document.visibilityState !== "visible" || (!force && now - lastAttempt < 15_000)) return;
      lastAttempt = now;
      setSync((previous) => ({ synced_at: previous?.synced_at ?? null, error: previous?.error ?? null, running: true }));
      try {
        const result = await api.sync(repoId);
        if (!stopped) setSync({ ...result, running: false });
      } catch (e) {
        if (!stopped) setSync((previous) => ({ synced_at: previous?.synced_at ?? null, error: (e as ApiError).message, running: false }));
      }
    };
    run(true);
    const timer = window.setInterval(() => run(true), 60_000);
    const onFocus = () => run();
    window.addEventListener("focus", onFocus);
    syncNow.current = () => run(true);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [repoId]);

  // Uncommitted work exists only on the checked-out branch.
  const canIncludeUncommitted = branches !== null && head === branches.current;
  const watchUncommitted = uncommitted && canIncludeUncommitted;

  // Watch git while the page is visible: a new branch, commit, checkout or (when shown)
  // an edit changes the fingerprint, and only then is anything reloaded.
  useEffect(() => {
    if (repoId === null) return;
    let last: string | null = null;
    let stopped = false;
    const check = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const signature = await api.state(repoId, watchUncommitted);
        if (stopped) return;
        if (last !== null && signature !== last) {
          setRevision((n) => n + 1);
          api.repos().then((list) => !stopped && setRepos(list)).catch(() => {});
        }
        last = signature;
      } catch {
        /* the backend is down; the next check tries again */
      }
    };
    check();
    const timer = window.setInterval(check, 2000);
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, [repoId, watchUncommitted]);

  useEffect(() => {
    if (repoId === null || head === null || branches === null) return;
    if (!base && !branches.default_base) return;
    let stale = false;
    setLoading(true);
    setError(null);
    api
      .compare(repoId, { head, base: base ?? undefined, uncommitted: watchUncommitted })
      .then((result) => !stale && setComparison(result))
      .catch((e: ApiError) => !stale && setError(e.message))
      .finally(() => !stale && setLoading(false));
    return () => {
      stale = true;
    };
  }, [repoId, head, base, watchUncommitted, branches]);

  const repo = repos?.find((item) => item.id === repoId) ?? null;
  const setup = useSetup(repo);

  const replaceRepo = (updated: Repo) =>
    setRepos((list) => {
      const others = (list ?? []).filter((item) => item.id !== updated.id);
      return [...others, updated].sort((a, b) => a.name.localeCompare(b.name));
    });

  const removed = (id: number) => {
    const rest = (repos ?? []).filter((item) => item.id !== id);
    setRepos(rest);
    if (id === repoId) selectRepo(rest.find((item) => item.exists)?.id ?? null);
    setRemoving(null);
  };

  const added = (newRepo: Repo) => {
    replaceRepo(newRepo);
    selectRepo(newRepo.id);
    setAdding(false);
  };

  const openFile = (path: string) => {
    setFocus((f) => ({ path, count: (f?.count ?? 0) + 1 }));
    setView("changes");
  };
  const details = branches?.details ?? [];

  const content = () => {
    if (error && !repos) return <Notice title="Something needs attention">{error}</Notice>;
    if (repos && repos.length === 0) return <Welcome onAdd={() => setAdding(true)} />;
    if (view === "help" && repo) return <Help repo={repo} steps={setup.steps} error={setup.error} />;
    if (view === "home" && repos) {
      return (
        <Home
          repos={repos}
          todos={todos}
          onTodos={setTodos}
          repoId={repoId}
          head={head}
          version={`${repos.length}:${repoId}:${revision}`}
          onOpen={(id) => {
            selectRepo(id);
            setView("summary");
          }}
          onAdd={() => setAdding(true)}
          onDigest={() => setView("digest")}
        />
      );
    }
    if (view === "digest" && repos) {
      return (
        <Digest
          connected={repos.filter((item) => item.claude).length}
          version={`${repos.length}:${revision}`}
          onConnect={() => setView("project")}
        />
      );
    }
    if (view === "project" && repos) {
      return (
        <div className="projects">
          <Sidebar
            repos={repos}
            selectedId={repoId}
            onSelect={(id) => id !== repoId && selectRepo(id)}
            onAdd={() => setAdding(true)}
            onRemove={setRemoving}
          />
          {repo && <ProjectPanel repo={repo} onRepoChange={replaceRepo} onRemove={() => setRemoving(repo)} />}
        </div>
      );
    }
    if (error) return <Notice title="Something needs attention">{error}</Notice>;
    if (repoId === null) {
      return <Notice title="Pick a project">None of your projects' folders can be found. Add one, or remove the missing ones.</Notice>;
    }
    if (view === "planner") {
      return (
        <div className="planner">
          <Todos items={todos} onItems={setTodos} repos={repos ?? []} repoId={repoId} head={head} />
          <Agenda />
        </div>
      );
    }
    if (view === "summary") {
      return summary && repoId !== null && head !== null ? (
        <Summary
          key={`${repoId}:${head}`}
          summary={summary}
          ai={ai}
          explain={() => watchSignIn(api.explainProject(repoId, head))}
          onSignedIn={refreshAi}
          onOpenMap={() => setView("map")}
        />
      ) : (
        <Notice title="Loading">Reading the project…</Notice>
      );
    }
    if (branches && !branches.default_base && !base) return <BasePicker branches={branches} head={head} onPick={setBase} />;
    if (!comparison) return <Notice title="Loading">Reading your branch from git…</Notice>;

    const compareOptions = { base: base ?? undefined, head: comparison.head, uncommitted: comparison.uncommitted };
    switch (view) {
      case "overview":
        return (
          <Overview
            comparison={comparison}
            branches={details}
            flow={flow}
            map={map}
            onHeadChange={setHead}
            onView={setView}
            onOpenFile={openFile}
          />
        );
      case "flow":
        return (
          <div className="flow-view">
            {flow && flow.commits.length > 1 ? (
              <FlowGraph flow={flow} head={comparison.head} branches={details} onPick={setHead} fill />
            ) : (
              <Notice title="Branch flow">Not enough history to draw yet.</Notice>
            )}
            <BranchTable branches={details} current={branches?.current ?? null} shown={comparison.head} onPick={setHead} />
          </div>
        );
      case "map":
        return map && map.areas.length > 0 ? (
          <ProjectMap map={map} files={comparison.files} onOpenFile={openFile} />
        ) : (
          <Notice title="Project map">Reading the project's folders…</Notice>
        );
      case "constellation":
        return map && map.areas.length > 0 ? (
          <Constellation map={map} files={comparison.files} project={repo?.name ?? "Project"} onOpenFile={openFile} />
        ) : (
          <Notice title="Constellation">Reading the project's folders…</Notice>
        );
      case "changes":
        return comparison.files.length === 0 ? (
          <Notice title="Nothing changed yet">
            <code>{comparison.head}</code> has no changes compared with <code>{comparison.base}</code>.
            {canIncludeUncommitted && !uncommitted && " Turn on “Include uncommitted work” to see edits you haven't committed."}
          </Notice>
        ) : (
          <FileChanges
            files={comparison.files}
            focus={focus}
            version={`${comparison.head}:${comparison.base}:${comparison.uncommitted}:${revision}`}
            loadFunctions={(file) => api.functions(repoId, file, compareOptions)}
            explainFunction={(file, name) => watchSignIn(api.explainFunction(repoId, file, name, compareOptions))}
            ai={ai}
            onSignedIn={refreshAi}
          />
        );
      case "commits":
        return <CommitList commits={comparison.commits} base={comparison.base} />;
    }
  };

  const current = VIEWS.find((item) => item.id === view)!;

  return (
    <div className="app">
      {repos && repos.length > 0 && (
        <SideMenu
          view={view}
          onView={setView}
          badges={{
            changes: comparison?.files.length,
            commits: comparison?.commits.length,
            planner: todos.filter((item) => !item.done_at && item.repo_id === repoId).length,
            help: setup.todo,
          }}
          project={
            <>
              <span className="switcher__label">Project</span>
              <div className="switcher">
                <select
                  className="select switcher__select"
                  value={repoId ?? ""}
                  onChange={(event) => selectRepo(Number(event.target.value))}
                  aria-label="Project"
                >
                  {repoId === null && <option value="">Pick a project</option>}
                  {repos.map((item) => (
                    <option key={item.id} value={item.id} disabled={!item.exists}>
                      {item.name}
                      {item.exists ? "" : " (folder missing)"}
                    </option>
                  ))}
                </select>
                <button className="switcher__add" onClick={() => setAdding(true)} title="Add a project" aria-label="Add a project">
                  +
                </button>
              </div>
            </>
          }
        />
      )}

      <div className="main">
        <header className="topbar">
          {repos && repos.length > 0 ? (
            <div className="topbar__title">
              <h1>{current.label}</h1>
              <p>
                {current.hint}
                {repo && comparison && view !== "home" && view !== "digest" && view !== "project" && view !== "help" && (
                  <>
                    {" "}
                    · <code>{comparison.head}</code> in {repo.name}
                  </>
                )}
              </p>
            </div>
          ) : (
            <span className="brand" aria-label="DevDash">
              <span className="brand__dev">Dev</span>
              <span className="brand__tag">&lt;/&gt;</span>
              <span className="brand__dash">Dash</span>
            </span>
          )}
          <div className="topbar__controls">
            <Clock />
            {sync && <SyncStatus sync={sync} onSync={() => syncNow.current()} />}
            <label
              className={`toggle${canIncludeUncommitted ? "" : " toggle--disabled"}`}
              title={canIncludeUncommitted ? "Also show edits you haven't committed yet" : "Only for the branch that is checked out"}
            >
              <input
                type="checkbox"
                checked={uncommitted && canIncludeUncommitted}
                disabled={!canIncludeUncommitted}
                onChange={(event) => setUncommitted(event.target.checked)}
              />
              Uncommitted work
            </label>
            <button className="theme-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? "Light" : "Dark"}
            </button>
            {onSignOut && (
              <button className="theme-button" onClick={onSignOut} title="Sign out of DevDash">
                Sign out
              </button>
            )}
          </div>
        </header>

        <main className={`screen screen--${view}${loading ? " screen--loading" : ""}`}>{content()}</main>
      </div>

      {adding && <AddProject onClose={() => setAdding(false)} onAdded={added} />}
      {removing && <RemoveProject repo={removing} onClose={() => setRemoving(null)} onRemoved={removed} />}
    </div>
  );
}

// Like a car's clock in the status bar.
function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);
  return <span className="clock">{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>;
}

// Every local branch and where it stands, beside the flow graph.
function BranchTable(props: { branches: Branches["details"]; current: string | null; shown: string; onPick: (name: string) => void }) {
  return (
    <section className="card branches">
      <h2 className="card__title">Branches on this computer</h2>
      <ul className="branches__list">
        {props.branches.map((branch) => (
          <li key={branch.name}>
            <button
              className={`branches__item${branch.name === props.shown ? " branches__item--shown" : ""}`}
              onClick={() => props.onPick(branch.name)}
            >
              <span className="branches__name">{branch.name}</span>
              {branch.name === props.current && <span className="branches__tag branches__tag--current">checked out</span>}
              {branch.gone ? (
                <span className="branches__tag branches__tag--done">deleted on GitHub</span>
              ) : branch.merged ? (
                <span className="branches__tag branches__tag--done">merged</span>
              ) : (
                <span className="branches__tag">open</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SyncStatus({ sync, onSync }: { sync: Sync & { running: boolean }; onSync: () => void }) {
  const label = sync.running
    ? "Syncing with GitHub…"
    : sync.error
      ? "Couldn't sync with GitHub"
      : sync.synced_at
        ? `Synced ${new Date(sync.synced_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
        : "Not synced yet";
  return (
    <button
      className={`sync${sync.error && !sync.running ? " sync--error" : ""}`}
      onClick={onSync}
      disabled={sync.running}
      title={sync.error ?? "Fetch the latest branches from GitHub"}
    >
      <span className={`sync__dot${sync.running ? " sync__dot--running" : ""}`} />
      {label}
    </button>
  );
}

// Most projects merge into main, master, develop or dev and DevDash finds it. For any
// other name, the user says which branch work is merged into.
function BasePicker({ branches, head, onPick }: { branches: Branches; head: string | null; onPick: (base: string) => void }) {
  const others = branches.branches.filter((name) => name !== head);
  return (
    <section className="card notice">
      <h2>Which branch do you merge into?</h2>
      <p>
        This project has no main, master, develop or dev branch, so DevDash doesn't know what to compare{" "}
        {head ? <code>{head}</code> : "this branch"} with.
      </p>
      {others.length === 0 ? (
        <p>It has only one branch, so there is nothing to compare with yet.</p>
      ) : (
        <select className="select" defaultValue="" onChange={(event) => event.target.value && onPick(event.target.value)} aria-label="Branch to compare with">
          <option value="" disabled>
            Pick a branch
          </option>
          {others.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      )}
    </section>
  );
}

function Welcome({ onAdd }: { onAdd: () => void }) {
  return (
    <section className="card welcome">
      <h1>See what changed in your code</h1>
      <p>DevDash turns your branches and commits into a page anyone can read. Start by adding a project.</p>
      <ol className="welcome__steps">
        <li>
          <strong>Add a project</strong>
          <span>Point DevDash at any git folder on this computer.</span>
        </li>
        <li>
          <strong>Pick your AI tool</strong>
          <span>Optional. With Claude connected, each change also shows the request behind it.</span>
        </li>
        <li>
          <strong>Open a branch</strong>
          <span>See every file and function it changed compared with main.</span>
        </li>
      </ol>
      <button className="button" onClick={onAdd}>
        + Add your first project
      </button>
    </section>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card notice">
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  );
}
