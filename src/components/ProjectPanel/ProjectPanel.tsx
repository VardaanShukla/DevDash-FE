import { useState } from "react";
import { api, ApiError } from "../../api/client";
import type { Repo } from "../../api/types";
import "./ProjectPanel.css";

type Props = {
  repo: Repo;
  onRepoChange: (repo: Repo) => void;
  onRemove: () => void;
};

// The selected project: where it lives and which AI tool is recorded. Setup steps are
// in the Help popup.
export default function ProjectPanel({ repo, onRepoChange, onRemove }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleClaude = async () => {
    setBusy(true);
    setError(null);
    try {
      onRepoChange(await api.setAi(repo.id, repo.ai === "claude" ? null : "claude"));
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card panel">
      <h2 className="panel__title">This project</h2>
      <dl className="panel__facts">
        <dt>Folder</dt>
        <dd className="panel__path">{repo.path}</dd>
        <dt>AI tool</dt>
        <dd>{repo.ai === "claude" ? "Claude Code, recording each request" : "None, your changes only"}</dd>
      </dl>
      <button className={`button${repo.ai ? " button--ghost button--outline" : ""}`} onClick={toggleClaude} disabled={busy}>
        {busy ? "Saving…" : repo.ai === "claude" ? "Stop recording AI changes" : "Record AI changes"}
      </button>
      {repo.ai === "claude" && <p className="panel__note">Stopping keeps everything already recorded.</p>}
      {error && <p className="panel__error">{error}</p>}
      <button className="panel__remove" onClick={onRemove}>
        Remove project from DevDash
      </button>
    </section>
  );
}
