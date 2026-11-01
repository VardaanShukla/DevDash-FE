import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import { organisation, team, type LinkStatus, type TeamOverview } from "../../api/team";
import type { View } from "../SideMenu/SideMenu";
import "./TeamView.css";

// The team inside DevDash, once it's linked to an organisation: your teams and teammates, the
// projects you can see with who has each (and whether it's on this computer), and the
// explanations of changes teammates shared. Read from the team server; nothing here is code.

export function useTeamOverview(link: LinkStatus | null) {
  const [overview, setOverview] = useState<TeamOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const linked = link?.mode === "org" && link.connected;
  useEffect(() => {
    if (!linked) return;
    let stale = false;
    const read = () => organisation.overview().then(
      (found) => !stale && (setOverview(found), setError(null)),
      (e: Error) => !stale && setError(e.message),
    );
    read();
    // Teammates share while you work: read again every minute.
    const timer = window.setInterval(read, 60_000);
    return () => {
      stale = true;
      window.clearInterval(timer);
    };
  }, [linked]);
  return { overview: linked ? overview : null, error: linked ? error : null };
}

function when(iso: string) {
  const date = new Date(iso);
  const days = Math.round((Date.now() - date.getTime()) / 86_400_000);
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return days === 0 ? `today, ${time}` : days === 1 ? `yesterday, ${time}` : date.toLocaleDateString([], { day: "numeric", month: "short" });
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("") || "?";
}

const CLONE_FOLDER = "devdash:clone-folder";

function savedCloneFolder(): string {
  try {
    return localStorage.getItem(CLONE_FOLDER) || "~/Projects";
  } catch {
    return "~/Projects";
  }
}

// A project given to you that isn't on this computer yet: cloned from its repo with your own
// GitHub or CodeCommit login (so the host still decides what you can read), then linked.
function CloneProject({ repo, onDone }: { repo: string; onDone: (link: LinkStatus) => void }) {
  const [folder, setFolder] = useState(savedCloneFolder);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, name] = [repo.slice(0, repo.indexOf(":")), repo.slice(repo.indexOf(":") + 1)];
  const clone = () => {
    setBusy(true);
    setError(null);
    try {
      localStorage.setItem(CLONE_FOLDER, folder);
    } catch {
      // Only remembers the folder for next time.
    }
    (kind === "github" ? api.githubClone(name, folder) : api.codecommitClone(name, folder))
      .then((made) => team.linkProject(made.id))
      .then(onDone, (e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  };
  if (!open) return <button className="settings__button settings__button--quiet" onClick={() => setOpen(true)}>Clone</button>;
  return (
    <div className="teamv__clone">
      <label>
        <span>Into folder</span>
        <input value={folder} onChange={(e) => setFolder(e.target.value)} spellCheck={false} />
      </label>
      <button className="settings__button" onClick={clone} disabled={busy}>{busy ? "Cloning…" : `Clone with my ${kind === "github" ? "GitHub" : "CodeCommit"} login`}</button>
      {error && <p className="settings__message settings__message--error">{error} (Settings → {kind === "github" ? "GitHub" : "CodeCommit"} connects your login.)</p>}
    </div>
  );
}

export default function TeamView({ link, onView, onLink }: {
  link: LinkStatus;
  onView: (view: View) => void;
  // After a project is cloned and linked here.
  onLink?: (link: LinkStatus) => void;
}) {
  const { overview, error } = useTeamOverview(link);
  const [project, setProject] = useState<number | "all">("all");
  // Server project id → whether it's linked on this computer.
  const here = useMemo(() => new Set(Object.values(link.projects ?? {}).map((p) => p.id)), [link.projects]);

  if (error) return <section className="card teamv"><p className="settings__message settings__message--error">{error}</p></section>;
  if (!overview) return <section className="card teamv"><p className="settings__note">Reading your team…</p></section>;
  const mates = new Map<number, { id: number; name: string; role: string; teams: string[] }>();
  for (const t of overview.teams) {
    for (const p of t.people) {
      const found = mates.get(p.id) ?? { ...p, teams: [] };
      found.teams.push(t.name);
      mates.set(p.id, found);
    }
  }
  const shared = overview.shared.filter((s) => project === "all" || s.project_id === project);
  const names = new Map(overview.projects.map((p) => [p.id, p.name]));
  return (
    <div className="teamv">
      <header className="card teamv__head">
        <div>
          <span className="teamv__eyebrow">Your organisation</span>
          <h1>{overview.org.name}</h1>
          <p>
            {overview.teams.filter((t) => t.mine).map((t) => t.name).join(", ") || "Not in a team yet"} · you're{" "}
            {overview.org.role === "member" ? "a member" : `an ${overview.org.role}`}
          </p>
        </div>
        {overview.org.role !== "member" && (
          <button className="settings__button" onClick={() => onView("settings")}>Manage organisation</button>
        )}
      </header>

      <div className="teamv__col">
      <section className="card teamv__section">
        <h2>Teammates</h2>
        {mates.size === 0 ? <p className="settings__note">Nobody is in a team yet.</p> : (
          <ul className="teamv__people">
            {[...mates.values()].map((m) => (
              <li key={m.id}>
                <span className="teamv__avatar" aria-hidden="true">{initials(m.name)}</span>
                <span>
                  <strong>{m.name}{m.id === overview.me.id ? " (you)" : ""}</strong>
                  <span className="settings__note">{m.teams.join(", ")}{m.role !== "member" ? ` · ${m.role}` : ""}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card teamv__section">
        <h2>Projects</h2>
        {overview.projects.length === 0 ? (
          <p className="settings__note">No project yet. An admin gives you projects, through your team or to you on your own.</p>
        ) : (
          <ul className="teamv__projects">
            {overview.projects.map((p) => (
              <li key={p.id}>
                <div>
                  <strong>{p.name}</strong>
                  {p.repo && <span className="settings__note">{p.repo}</span>}
                </div>
                <div className="teamv__who">
                  {p.teams.map((t) => <span key={`t${t.id}`} className="teamv__tag">{t.name}</span>)}
                  {p.people.map((q) => <span key={`p${q.id}`} className="teamv__tag teamv__tag--person">{q.name}</span>)}
                </div>
                {here.has(p.id) ? (
                  <span className="teamv__here is-on">On this computer</span>
                ) : p.repo ? (
                  <CloneProject repo={p.repo} onDone={(next) => onLink?.(next)} />
                ) : (
                  <span className="teamv__here">Not on this computer</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="settings__note">Link a project you have here in Settings → Organisation to share its explanations.</p>
      </section>
      </div>

      <section className="card teamv__section teamv__shared">
        <div className="teamv__row">
          <h2>Shared changes</h2>
          {overview.projects.length > 1 && (
            <select className="select" value={project} onChange={(e) => setProject(e.target.value === "all" ? "all" : Number(e.target.value))}
                    aria-label="Project">
              <option value="all">Every project</option>
              {overview.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>
        {shared.length === 0 ? (
          <p className="settings__note">Nothing shared yet. Under any explanation in Changes or AI changes, press Share with team.</p>
        ) : (
          <ul className="teamv__feed">
            {shared.map((s) => (
              <li key={s.id} className="teamv__item">
                <header>
                  <span className="teamv__avatar teamv__avatar--small" aria-hidden="true">{initials(s.person)}</span>
                  <span><strong>{s.person}</strong> explained <code>{s.subject}</code> in {names.get(s.project_id)}</span>
                  <span className="settings__note">{when(s.shared_at)}</span>
                </header>
                <p className="teamv__summary">{s.explanation.summary}</p>
                {s.explanation.change && <p>{s.explanation.change}</p>}
                <div className="teamv__lists">
                  {s.explanation.improves.length > 0 && (
                    <div className="teamv__good"><h4>Improves</h4><ul>{s.explanation.improves.map((t) => <li key={t}>{t}</li>)}</ul></div>
                  )}
                  {s.explanation.tradeoffs.length > 0 && (
                    <div className="teamv__warn"><h4>Trade-offs</h4><ul>{s.explanation.tradeoffs.map((t) => <li key={t}>{t}</li>)}</ul></div>
                  )}
                </div>
                {s.explanation.check && <p className="settings__note"><strong>To check:</strong> {s.explanation.check}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// On Home: the team in one line, and the latest things teammates shared.
export function TeamStrip({ link, onView }: { link: LinkStatus; onView: (view: View) => void }) {
  const { overview } = useTeamOverview(link);
  if (!overview) return null;
  const week = Date.now() - 7 * 86_400_000;
  const recent = overview.shared.filter((s) => new Date(s.shared_at).getTime() > week);
  const mates = new Set(overview.teams.flatMap((t) => t.people.map((p) => p.id)));
  const names = new Map(overview.projects.map((p) => [p.id, p.name]));
  return (
    <section className="card teamv__strip">
      <button className="teamv__strip-head" onClick={() => onView("team")}>
        <span className="teamv__eyebrow">Team</span>
        <strong>{overview.org.name}</strong>
        <span className="settings__note">
          {mates.size} {mates.size === 1 ? "person" : "people"} · {overview.projects.length} {overview.projects.length === 1 ? "project" : "projects"} ·{" "}
          {recent.length} shared this week
        </span>
      </button>
      {overview.shared.slice(0, 3).map((s) => (
        <button key={s.id} className="teamv__strip-item" onClick={() => onView("team")}>
          <span className="teamv__avatar teamv__avatar--small" aria-hidden="true">{initials(s.person)}</span>
          <span><strong>{s.person}</strong> · <code>{s.subject}</code> in {names.get(s.project_id)}: {s.explanation.summary}</span>
        </button>
      ))}
    </section>
  );
}

// Once, the first time DevDash is linked to an organisation: what just opened up.
const UNLOCKED_KEY = "devdash:team-unlocked";

export function TeamUnlock({ link, onOpen }: { link: LinkStatus; onOpen: () => void }) {
  const key = `${UNLOCKED_KEY}:${link.url}:${link.org}`;
  const [shown, setShown] = useState(() => {
    try {
      return localStorage.getItem(key) !== "1";
    } catch {
      return false;
    }
  });
  if (!shown || link.mode !== "org" || !link.connected) return null;
  const close = (open: boolean) => {
    try {
      localStorage.setItem(key, "1");
    } catch {
      // Only means it may show once more.
    }
    setShown(false);
    if (open) onOpen();
  };
  return (
    <div className="unlock" role="dialog" aria-modal="true" aria-labelledby="unlock-title">
      <div className="unlock__card">
        <div className="unlock__lock" aria-hidden="true">
          <svg viewBox="0 0 64 64" width="72" height="72">
            <rect className="unlock__body" x="14" y="28" width="36" height="28" rx="6" />
            <path className="unlock__shackle" d="M22 28v-8a10 10 0 0 1 20 0v8" fill="none" strokeWidth="5" strokeLinecap="round" />
            <circle className="unlock__keyhole" cx="32" cy="41" r="4" />
          </svg>
          <span className="unlock__ring" />
        </div>
        <h2 id="unlock-title">Team unlocked</h2>
        <p>You're in <strong>{link.org}</strong>. New in DevDash:</p>
        <ul>
          <li>A <strong>Team</strong> screen: your teammates, who has which project, and the changes they shared</li>
          <li>Your team on <strong>Home</strong>, with the latest shared changes</li>
          <li><strong>Share with team</strong> under every explanation, in projects you've linked</li>
        </ul>
        <div className="unlock__actions">
          <button className="settings__button" onClick={() => close(true)}>Open Team</button>
          <button className="settings__button settings__button--quiet" onClick={() => close(false)}>Later</button>
        </div>
      </div>
    </div>
  );
}
