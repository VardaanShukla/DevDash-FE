import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "../../api/client";
import type { AiTool, AiToolId, PullRequests, Repo } from "../../api/types";
import "./ProjectPanel.css";

type Props = {
  repo: Repo;
  onRepoChange: (repo: Repo) => void;
  onRemove: () => void;
};

const NAMES: Record<AiToolId, string> = { claude: "Claude Code", codex: "ChatGPT Codex", antigravity: "Gemini Antigravity" };

// The project's open pull requests, when it has a GitHub or CodeCommit remote and that account
// is connected (Settings → GitHub or CodeCommit).
function Pulls({ repoId }: { repoId: number }) {
  const [found, setFound] = useState<PullRequests | null>(null);
  useEffect(() => {
    let stale = false;
    setFound(null);
    api.pulls(repoId).then((result) => !stale && setFound(result), () => {});
    return () => {
      stale = true;
    };
  }, [repoId]);
  if (!found?.repo) return null;
  return (
    <div className="panel__pulls">
      <h3>Open pull requests on {found.repo}</h3>
      {!found.connected ? (
        <p className="panel__note">
          {found.host === "codecommit" ? <a href="#settings/codecommit">Connect CodeCommit</a> : <a href="#settings/github">Connect GitHub</a>}{" "}
          in Settings to see them here.
        </p>
      ) : found.error ? (
        <p className="panel__note">{found.error}</p>
      ) : found.pulls.length === 0 ? (
        <p className="panel__note">None open.</p>
      ) : (
        <ul>
          {found.pulls.map((pull) => (
            <li key={pull.number}>
              <a href={pull.url} target="_blank" rel="noreferrer">
                #{pull.number} {pull.title}
              </a>
              <span className="panel__note">
                {pull.draft ? "Draft · " : ""}
                {pull.author ? `${found.host === "codecommit" ? "" : "@"}${pull.author} · ` : ""}
                <code>{pull.branch}</code> into <code>{pull.base}</code>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// The selected project: where it lives and which AI tool is recorded. Setup steps are
// in the Help popup.
export default function ProjectPanel({ repo, onRepoChange, onRemove }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tools, setTools] = useState<AiTool[]>([]);
  useEffect(() => {
    api.aiTools().then((list) => setTools(list.filter((tool) => tool.available)), () => {});
  }, []);

  const choose = async (ai: AiToolId | null) => {
    setBusy(true);
    setError(null);
    try {
      onRepoChange(await api.setAi(repo.id, ai));
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
        <dd>{repo.ai ? `${NAMES[repo.ai]}, recording each request` : "None, your changes only"}</dd>
      </dl>
      {tools.length > 1 && (
        <fieldset className="panel__tools" disabled={busy}>
          <legend>{repo.ai ? "Record a different AI tool" : "Record an AI tool's changes"}</legend>
          {tools.map((tool) => (
            <label key={tool.id} className={`panel__tool${repo.ai === tool.id ? " panel__tool--on" : ""}`}>
              <input
                type="radio"
                name={`ai-tool-${repo.id}`}
                value={tool.id}
                checked={repo.ai === tool.id}
                onChange={() => choose(tool.id as AiToolId)}
              />
              <span className="panel__tool-name">{tool.name}</span>
              <span className="panel__tool-state">{repo.ai === tool.id ? "Recording" : "Use this"}</span>
            </label>
          ))}
        </fieldset>
      )}
      {repo.ai ? (
        <Button variant="outline" onClick={() => choose(null)} disabled={busy}>
          {busy ? "Saving…" : "Stop recording AI changes"}
        </Button>
      ) : (
        tools.length <= 1 && (
          <Button variant="gradient" onClick={() => choose("claude")} disabled={busy}>
            {busy ? "Saving…" : "Record AI changes"}
          </Button>
        )
      )}
      {repo.ai === "codex" && <p className="panel__note">In Codex, type /hooks once and trust DevDash's hooks.</p>}
      {repo.ai && <p className="panel__note">Stopping keeps everything already recorded.</p>}
      {error && <p className="panel__error">{error}</p>}
      <Pulls repoId={repo.id} />
      <button className="panel__remove" onClick={onRemove}>
        Remove project from DevDash
      </button>
    </section>
  );
}
