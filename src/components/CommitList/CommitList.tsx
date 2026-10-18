import type { Commit } from "../../api/types";
import "./CommitList.css";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function ago(iso: string) {
  const elapsed = Date.now() - new Date(iso).getTime();
  if (elapsed < HOUR) return `${Math.max(1, Math.round(elapsed / MINUTE))} min ago`;
  if (elapsed < DAY) return `${Math.round(elapsed / HOUR)} h ago`;
  if (elapsed < 30 * DAY) return `${Math.round(elapsed / DAY)} days ago`;
  return new Date(iso).toLocaleDateString();
}

export default function CommitList({ commits, base }: { commits: Commit[]; base: string }) {
  return (
    <section className="card commits">
      <h2 className="commits__title">Commits on this branch</h2>
      {commits.length === 0 ? (
        <p className="commits__empty">No commits ahead of {base} yet.</p>
      ) : (
        <ol className="commits__list">
          {commits.map((commit) => (
            <li key={commit.sha} className="commit">
              <span className={`commit__dot${commit.ai ? " commit__dot--ai" : ""}`} />
              <div className="commit__body">
                <span className="commit__subject">{commit.subject}</span>
                <span className="commit__meta">
                  {commit.author} · {ago(commit.authored_at)} · <code>{commit.short_sha}</code>
                  {commit.ai && <span className="commit__ai">AI</span>}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
