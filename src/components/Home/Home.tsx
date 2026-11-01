import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../../api/client";
import type {
  AiStatus, BranchInfo, Comparison, Digest, Flow, PlacedWidget, PreferenceChange, Preferences, ProjectCard, ProjectMap,
  RecordingHealth, Repo, WidgetAccent, WidgetStyle, WidgetType,
} from "../../api/types";
import type { View } from "../SideMenu/SideMenu";
import { spec, type HomeData } from "../Widgets/catalog";
import Grid from "../Widgets/Grid";
import { compact, freeSpot, place } from "../Widgets/layout";
import { ACCENTS, AddWidget, STYLES, WidgetSettings } from "../Widgets/WidgetEditor";
import "./Home.css";

// The start screen: the person's widgets on a grid (see Widgets/Grid). It opens as the
// greeting and the project on show, today's AI work, the branch's size beside today's
// activity, then the latest commit beside the branches. Edit Home moves, resizes, restyles,
// adds and removes widgets; the layout is kept in the person's settings.

type Props = {
  repos: Repo[];
  repoId: number | null;
  // Changes when any project might have, so today's numbers are read again.
  version: string;
  // The picked project's branch, flow and map; null while they load.
  comparison: Comparison | null;
  branches: BranchInfo[];
  // The branch checked out in the project's folder.
  checkedOut: string | null;
  flow: Flow | null;
  map: ProjectMap | null;
  // The AI picked in Settings, the one that explains changes; null while it loads.
  ai: AiStatus | null;
  // The saved settings, for the layout and the shortcut keys; null while they load.
  prefs: Preferences | null;
  onPrefs: (changes: PreferenceChange) => Promise<void>;
  onHeadChange: (head: string) => void;
  onView: (view: View) => void;
  onOpenFile: (path: string) => void;
  onDigest: () => void;
  // Opens one prompt's own changes in AI changes.
  onOpenChange: (id: string) => void;
  onAdd: () => void;
  onSync: () => void;
  // The signed-in DevDash username, for the greeting; none before a password is set.
  username?: string;
  // Shown above the widgets, such as the team strip once DevDash is in an organisation.
  banner?: ReactNode;
};

export default function Home(props: Props) {
  const { repos, repoId, version, prefs } = props;
  const [digest, setDigest] = useState<Digest | null>(null);
  const [health, setHealth] = useState<RecordingHealth | null>(null);
  const [cards, setCards] = useState<ProjectCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Shown at once while a change saves; the saved settings win when they arrive.
  const [widgets, setWidgets] = useState<PlacedWidget[] | null>(prefs?.home.widgets ?? null);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saving = useRef(0);

  useEffect(() => {
    // Not while a save is on its way, or the old layout would flash back.
    if (prefs && saving.current === 0) setWidgets(prefs.home.widgets);
  }, [prefs]);

  useEffect(() => {
    let stale = false;
    api.digest().then(
      (result) => !stale && (setDigest(result), setError(null)),
      (e: Error) => !stale && setError(e.message),
    );
    api.recordingHealth().then((result) => !stale && setHealth(result), () => {});
    api.home().then((result) => !stale && setCards(result), () => {});
    return () => {
      stale = true;
    };
  }, [version]);

  // Saves a little after the last change, so typing a title or a note doesn't save each key.
  const timer = useRef<number | undefined>(undefined);
  const update = (next: PlacedWidget[], save = true) => {
    setWidgets(next);
    if (!save) return;
    window.clearTimeout(timer.current);
    saving.current += 1;
    timer.current = window.setTimeout(() => {
      props.onPrefs({ home: { widgets: next } }).then(
        () => setSaveError(null),
        (e: Error) => setSaveError(`Couldn't save Home: ${e.message}`),
      ).finally(() => (saving.current = 0));
    }, 400);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const add = (type: WidgetType) => {
    if (!widgets) return;
    const about = spec(type);
    const spot = freeSpot(widgets, about.size.w, about.size.h);
    const widget: PlacedWidget = {
      id: newId(type, widgets), type, ...spot, ...about.size, style: about.style ?? "glass", accent: "", title: "", options: {},
    };
    update(compact([...widgets, widget]));
    setAdding(false);
    setSelected(widget.id);
  };
  const change = (widget: PlacedWidget) => {
    if (!widgets) return;
    const old = widgets.find((w) => w.id === widget.id)!;
    const resized = old.w !== widget.w || old.h !== widget.h;
    const next = widgets.map((w) => (w.id === widget.id ? widget : w));
    update(resized ? place(next, widget.id, { w: widget.w, h: widget.h }, spec(widget.type).min) : next);
  };
  const duplicate = (widget: PlacedWidget) => {
    if (!widgets) return;
    const copy = { ...widget, id: newId(widget.type, widgets), y: widget.y + widget.h };
    update(place([...widgets, copy], copy.id, { y: copy.y }, spec(copy.type).min));
    setSelected(copy.id);
  };
  const remove = (widget: PlacedWidget) => {
    if (!widgets) return;
    update(compact(widgets.filter((w) => w.id !== widget.id)));
    setSelected(null);
  };
  // One look for every widget at once.
  const restyle = (changes: { style?: WidgetStyle; accent?: WidgetAccent }) => {
    if (widgets) update(widgets.map((w) => ({ ...w, ...changes })));
  };
  const reset = () =>
    api.resetHome().then((saved) => setWidgets(saved.home.widgets), (e: Error) => setSaveError(`Couldn't reset Home: ${e.message}`));
  const finish = () => {
    setEditing(false);
    setSelected(null);
    setAdding(false);
  };

  const data: HomeData = {
    repos,
    picked: repos.find((repo) => repo.id === repoId) ?? null,
    comparison: props.comparison,
    branches: props.branches,
    checkedOut: props.checkedOut,
    flow: props.flow,
    map: props.map,
    ai: props.ai,
    digest,
    health,
    onHealth: setHealth,
    cards,
    error,
    shortcuts: prefs?.shortcuts ?? {},
    username: props.username,
    onHeadChange: props.onHeadChange,
    onView: props.onView,
    onOpenFile: props.onOpenFile,
    onDigest: props.onDigest,
    onOpenChange: props.onOpenChange,
    onAdd: props.onAdd,
    onSync: props.onSync,
  };
  const picked = widgets?.find((w) => w.id === selected) ?? null;
  const panel = editing && (adding || picked);

  return (
    <div className={`home${panel ? " home--panel" : ""}`}>
      <div className="home__main">
        {props.banner}
        <div className={`home__bar${editing ? " home__bar--editing" : ""}`} role="toolbar" aria-label="Arrange Home">
          {editing ? (
            <>
              <p className="home__hint">Drag a widget by its bar to move it, or by its corner to resize it.</p>
              <button className="home__tool" onClick={() => (setAdding(true), setSelected(null))}>
                Add a widget
              </button>
              <span className="home__all">
                <select className="select" value="" aria-label="Style for every widget"
                        onChange={(event) => event.target.value && restyle({ style: event.target.value as WidgetStyle })}>
                  <option value="">Style all…</option>
                  {STYLES.map((style) => (
                    <option key={style.id} value={style.id}>
                      {style.label}
                    </option>
                  ))}
                </select>
                <select className="select" value="-" aria-label="Accent for every widget"
                        onChange={(event) => event.target.value !== "-" && restyle({ accent: event.target.value as WidgetAccent })}>
                  <option value="-">Accent all…</option>
                  {ACCENTS.map((accent) => (
                    <option key={accent.id || "theme"} value={accent.id}>
                      {accent.label}
                    </option>
                  ))}
                </select>
              </span>
              <button className="home__tool" onClick={reset} title="Put back the widgets Home starts with">
                Reset
              </button>
              <button className="home__tool home__tool--on" onClick={finish}>
                Done
              </button>
            </>
          ) : (
            <button className="home__tool home__tool--quiet" onClick={() => setEditing(true)} title="Move, resize, restyle, add or remove widgets">
              Edit Home
            </button>
          )}
        </div>
        {saveError && (
          <p className="home__error" role="alert">
            {saveError}
          </p>
        )}
        {!widgets ? (
          <p className="home__loading">Reading your Home layout…</p>
        ) : (
          <Grid
            widgets={widgets}
            data={data}
            editing={editing}
            selected={selected}
            onChange={update}
            onSelect={(id) => (setSelected(id), setAdding(false))}
          />
        )}
      </div>
      {editing && adding && <AddWidget onAdd={add} onClose={() => setAdding(false)} />}
      {editing && !adding && picked && (
        <WidgetSettings
          widget={picked}
          onChange={change}
          onDuplicate={() => duplicate(picked)}
          onRemove={() => remove(picked)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function newId(type: WidgetType, widgets: PlacedWidget[]) {
  let n = 1;
  while (widgets.some((w) => w.id === `${type}-${n}`)) n++;
  return `${type}-${n}`;
}
