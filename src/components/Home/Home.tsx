import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { Digest, ProjectCard, Repo, Todo } from "../../api/types";
import Agenda from "../Agenda/Agenda";
import Todos from "../Todos/Todos";
import "./Home.css";

// The start screen: every connected project at a glance, beside the to-do list and what's
// on the calendar. Picking a project opens its summary.

type Props = {
  repos: Repo[];
  todos: Todo[];
  onTodos: (update: (items: Todo[]) => Todo[]) => void;
  repoId: number | null;
  head: string | null;
  // Changes when any project might have, so the cards are read again.
  version: string;
  onOpen: (repoId: number) => void;
  onAdd: () => void;
  onDigest: () => void;
};

export default function Home({ repos, todos, onTodos, repoId, head, version, onOpen, onAdd, onDigest }: Props) {
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
                    ? `of Claude's ${digest.claude.prompts} changes today need a look`
                    : `Claude ${digest.claude.prompts === 1 ? "change" : "changes"} today`}
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
                onClick={() => onOpen(card.id)}
                disabled={!card.exists}
                title={card.path}
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

      <div className="home__todos">
        <Todos items={todos} onItems={onTodos} repos={repos} repoId={repoId} head={head} initialScope="all" />
      </div>
      <div className="home__calendar">
        <Agenda days={3} />
      </div>
    </div>
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
