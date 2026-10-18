import { useState } from "react";
import { api } from "../../api/client";
import type { Repo, Todo } from "../../api/types";
import "./Todos.css";

// A to-do list. Each item is for this branch, for the whole project, or for anything, so
// the work left before a branch merges sits next to the branch.

type Scope = "branch" | "project" | "all";

type Props = {
  items: Todo[];
  onItems: (update: (items: Todo[]) => Todo[]) => void;
  repos: Repo[];
  repoId: number | null;
  head: string | null;
  // The tab to start on; by default the branch on screen.
  initialScope?: Scope;
};

export default function Todos({ items, onItems, repos, repoId, head, initialScope }: Props) {
  const [scope, setScope] = useState<Scope>(initialScope ?? (head ? "branch" : "project"));
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const inScope = (item: Todo, which: Scope) =>
    which === "all" ||
    (item.repo_id === repoId && (which === "project" || (item.branch === head && head !== null)));
  const count = (which: Scope) => items.filter((item) => !item.done_at && inScope(item, which)).length;
  const shown = items.filter((item) => inScope(item, scope));
  const open = shown.filter((item) => !item.done_at);
  const done = shown.filter((item) => item.done_at);
  const names = new Map(repos.map((repo) => [repo.id, repo.name]));

  const fail = (e: Error) => setError(e.message);
  const replace = (item: Todo) => onItems((all) => all.map((other) => (other.id === item.id ? item : other)));

  const add = (event: React.FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    const forRepo = scope === "all" ? null : repoId;
    const forBranch = scope === "branch" ? head : null;
    api.addTodo(text, forRepo, forBranch).then((item) => {
      onItems((all) => [...all, item]);
      setText("");
      setError(null);
    }, fail);
  };

  const toggle = (item: Todo) => api.changeTodo(item.id, { done: !item.done_at }).then(replace, fail);
  const rename = (item: Todo, text: string) => api.changeTodo(item.id, { text }).then(replace, fail);
  const remove = (item: Todo) =>
    api.removeTodo(item.id).then(() => onItems((all) => all.filter((other) => other.id !== item.id)), fail);

  const where = (item: Todo) => {
    if (item.repo_id === null) return scope === "all" ? "Anything" : null;
    const parts = [];
    if (scope === "all" || item.repo_id !== repoId) parts.push(names.get(item.repo_id) ?? "Removed project");
    if (item.branch && scope !== "branch") parts.push(item.branch);
    return parts.length ? parts.join(" · ") : null;
  };

  const scopes: { id: Scope; label: string }[] = [
    ...(head ? [{ id: "branch" as const, label: "This branch" }] : []),
    { id: "project", label: "This project" },
    { id: "all", label: "Everything" },
  ];

  return (
    <section className="card todos">
      <header className="todos__head">
        <h2>To-dos</h2>
        <div className="segmented" role="tablist" aria-label="Which to-dos">
          {scopes.map((item) => (
            <button
              key={item.id}
              role="tab"
              aria-selected={scope === item.id}
              className={scope === item.id ? "is-on" : undefined}
              onClick={() => setScope(item.id)}
            >
              {item.label}
              {count(item.id) > 0 && <span className="todos__count">{count(item.id)}</span>}
            </button>
          ))}
        </div>
      </header>

      <form className="todos__add" onSubmit={add}>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={
            scope === "branch" ? `Something to do before ${head} merges` : scope === "project" ? "Something to do in this project" : "Anything to do"
          }
          aria-label="New to-do"
          maxLength={500}
        />
        <button disabled={!text.trim()}>Add</button>
      </form>
      {error && <p className="todos__error">{error}</p>}

      <div className="todos__list">
        {open.length === 0 ? (
          <p className="todos__empty">
            {done.length ? "All done here." : scope === "branch" ? "Nothing to do on this branch yet." : "Nothing to do yet."}
          </p>
        ) : (
          <ul>
            {open.map((item) => (
              <Row key={item.id} item={item} where={where(item)} onToggle={toggle} onRename={rename} onRemove={remove} />
            ))}
          </ul>
        )}
        {done.length > 0 && (
          <>
            <button className="todos__done-toggle" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
              {showDone ? "▾" : "▸"} Finished ({done.length})
            </button>
            {showDone && (
              <ul>
                {done.map((item) => (
                  <Row key={item.id} item={item} where={where(item)} onToggle={toggle} onRename={rename} onRemove={remove} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}

type RowProps = {
  item: Todo;
  where: string | null;
  onToggle: (item: Todo) => void;
  onRename: (item: Todo, text: string) => void;
  onRemove: (item: Todo) => void;
};

function Row({ item, where, onToggle, onRename, onRemove }: RowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);

  const save = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== item.text) onRename(item, draft);
    else setDraft(item.text);
  };

  return (
    <li className={`todo${item.done_at ? " todo--done" : ""}`}>
      <button
        className="todo__check"
        onClick={() => onToggle(item)}
        aria-label={item.done_at ? `Mark "${item.text}" as not done` : `Mark "${item.text}" as done`}
      >
        {item.done_at && (
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      {editing ? (
        <input
          className="todo__edit"
          value={draft}
          autoFocus
          maxLength={500}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Enter") save();
            if (event.key === "Escape") {
              setDraft(item.text);
              setEditing(false);
            }
          }}
          aria-label="Edit to-do"
        />
      ) : (
        <span className="todo__text" onDoubleClick={() => !item.done_at && setEditing(true)} title={item.done_at ? undefined : "Double-click to edit"}>
          {item.text}
        </span>
      )}
      {where && <span className="todo__where">{where}</span>}
      <button className="todo__remove" onClick={() => onRemove(item)} aria-label={`Delete "${item.text}"`} title="Delete">
        ×
      </button>
    </li>
  );
}
