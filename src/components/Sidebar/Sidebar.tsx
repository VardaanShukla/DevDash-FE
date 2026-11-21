import type { Repo } from "../../api/types";
import "./Sidebar.css";

type Props = {
  repos: Repo[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onAdd: () => void;
  onRemove: (repo: Repo) => void;
};

export default function Sidebar({ repos, selectedId, onSelect, onAdd, onRemove }: Props) {
  return (
    <nav className="sidebar card" aria-label="Projects">
      <div className="sidebar__heading">
        <h2>Projects</h2>
        <span className="sidebar__count">{repos.length}</span>
      </div>
      <ul className="sidebar__list">
        {repos.map((repo) => (
          <li key={repo.id} className={`sidebar__row${repo.exists ? "" : " sidebar__row--missing"}`}>
            <button
              className={`sidebar__item${repo.id === selectedId ? " sidebar__item--active" : ""}`}
              onClick={() => onSelect(repo.id)}
              disabled={!repo.exists}
              title={repo.path}
            >
              <span className="sidebar__avatar">{repo.name.slice(0, 1).toUpperCase()}</span>
              <span className="sidebar__text">
                <span className="sidebar__name">{repo.name}</span>
                <span className="sidebar__branch">{!repo.exists ? "folder missing" : !repo.git ? "no git" : repo.branch ?? "detached"}</span>
              </span>
              {repo.ai && <span className="sidebar__ai">{repo.ai === "claude" ? "Claude" : repo.ai}</span>}
            </button>
            <button className="sidebar__remove" onClick={() => onRemove(repo)} aria-label={`Remove ${repo.name}`} title="Remove from DevDash">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
      <button className="sidebar__add" onClick={onAdd}>
        + Add project
      </button>
    </nav>
  );
}
