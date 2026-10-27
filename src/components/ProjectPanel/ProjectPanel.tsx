import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "../../api/client";
import type { AiTool, AiToolId, Repo } from "../../api/types";
import "./ProjectPanel.css";

type Props = {
  repo: Repo;
  onRepoChange: (repo: Repo) => void;
  onRemove: () => void;
};

const NAMES: Record<AiToolId, string> = { claude: "Claude Code", codex: "ChatGPT Codex", antigravity: "Gemini Antigravity" };

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
      <button className="panel__remove" onClick={onRemove}>
        Remove project from DevDash
      </button>
    </section>
  );
}
