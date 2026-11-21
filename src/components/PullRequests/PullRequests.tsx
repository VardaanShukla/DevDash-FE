import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { PullRequests as Found } from "../../api/types";
import "./PullRequests.css";

// The project's open pull requests on GitHub or CodeCommit, under the branch's commits.

export default function PullRequests({ repoId }: { repoId: number }) {
  const [found, setFound] = useState<Found | null>(null);
  const [drafts, setDrafts] = useState(true);
  useEffect(() => {
    let stale = false;
    setFound(null);
    api.pulls(repoId).then(
      (result) => !stale && setFound(result),
      () => !stale && setFound({ repo: null, connected: false, pulls: [], error: "Couldn't read the pull requests." }),
    );
    return () => {
      stale = true;
    };
  }, [repoId]);
  const pulls = (found?.pulls ?? []).filter((pull) => drafts || !pull.draft);
  return (
    <section className="card pulls-card">
      <header className="pulls-card__head">
        <h2 className="pulls-card__title">Open pull requests</h2>
        {found?.repo && <span className="pulls-card__repo">{found.repo}</span>}
        {found?.connected && (found.pulls.some((pull) => pull.draft)) && (
          <label className="pulls-card__toggle">
            <input type="checkbox" checked={drafts} onChange={(event) => setDrafts(event.target.checked)} /> Drafts
          </label>
        )}
      </header>
      {!found ? (
        <p className="pulls-card__muted">Reading pull requests…</p>
      ) : found.error ? (
        <p className="pulls-card__muted">{found.error}</p>
      ) : !found.connected ? (
        <p className="pulls-card__muted">Connect {found.host === "codecommit" ? "CodeCommit" : "GitHub"} in Settings to see pull requests.</p>
      ) : pulls.length === 0 ? (
        <p className="pulls-card__muted">No open pull requests.</p>
      ) : (
        <ol className="pulls">
          {pulls.map((pull) => (
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
    </section>
  );
}

function ago(iso: string) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}
