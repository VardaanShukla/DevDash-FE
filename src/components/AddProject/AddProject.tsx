import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "../../api/client";
import type { AiStatus, AiTool, AiToolId, Candidate, Repo } from "../../api/types";
import ClaudeSetup from "../ClaudeSignIn/ClaudeSetup";
import "./AddProject.css";

type Props = {
  onClose: () => void;
  onAdded: (repo: Repo) => void;
};

const NO_AI: AiTool = {
  id: "none",
  name: "No AI tool",
  available: true,
  description: "Show your own commits and branches. You can connect an AI tool later.",
};

// What's left to do in the tool itself once the project is added.
const AFTER: Record<string, string> = {
  codex: "Once it's added, open Codex and type /hooks to trust DevDash's hooks (Codex asks once). Restart Codex if it's open.",
  antigravity: "Once it's added, restart Antigravity (agy, the app or the IDE) if it's open, so it loads DevDash's hooks.",
};

export default function AddProject({ onClose, onAdded }: Props) {
  const [path, setPath] = useState("");
  const [tools, setTools] = useState<AiTool[]>([NO_AI]);
  const [ai, setAi] = useState("none");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The picked AI tool's state (installed, signed in), checked once it's picked; null while checking.
  const [status, setStatus] = useState<AiStatus | null>(null);
  const checkStatus = useCallback(() => {
    if (ai === "claude") api.ai().then(setStatus, () => {});
    else if (ai === "codex" || ai === "antigravity")
      api.aiProviders().then((list) => setStatus(list.find((item) => item.provider === ai) ?? null), () => {});
  }, [ai]);
  useEffect(() => {
    setStatus(null);
    checkStatus();
  }, [checkStatus]);

  // Projects in folders `devdash init` remembered, to pick instead of typing.
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  useEffect(() => {
    api.candidates().then(setCandidates, () => {});
    api.aiTools().then((list) => setTools([NO_AI, ...list])).catch(() => {});
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      onAdded(await api.addRepo(path, ai === "none" ? null : (ai as AiToolId)));
    } catch (e) {
      setError((e as ApiError).message);
      setSaving(false);
    }
  };

  return (
    <div className="modal" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="modal__panel card" role="dialog" aria-labelledby="add-project-title" onSubmit={submit}>
        <h2 id="add-project-title">Add a project</h2>
        <p className="modal__lead">Any folder that is a git repository. DevDash only reads it.</p>

        <label className="field">
          <span>Project folder</span>
          <input
            autoFocus
            required
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="~/Projects/MyApp"
            spellCheck={false}
          />
          <small>The full path on this computer. ~ means your home folder.</small>
        </label>

        {candidates.length > 0 && (
          <div className="candidates">
            <span className="candidates__label">Found in your folders</span>
            <div className="candidates__list">
              {candidates.map((candidate) => (
                <button
                  type="button"
                  key={candidate.path}
                  className={`candidates__item${path === candidate.path ? " candidates__item--picked" : ""}`}
                  title={candidate.path}
                  onClick={() => setPath(candidate.path)}
                >
                  {candidate.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <fieldset className="tools">
          <legend>AI tool you use here</legend>
          {tools.map((tool) => (
            <label
              key={tool.id}
              className={`tool${ai === tool.id ? " tool--selected" : ""}${tool.available ? "" : " tool--soon"}`}
            >
              <input
                type="radio"
                name="ai"
                value={tool.id}
                checked={ai === tool.id}
                disabled={!tool.available}
                onChange={() => setAi(tool.id)}
              />
              <span className="tool__name">
                {tool.name}
                {!tool.available && <span className="tool__badge">Soon</span>}
              </span>
              <span className="tool__description">{tool.description}</span>
            </label>
          ))}
        </fieldset>

        {/* Picking an AI tool: get it installed and signed in right here, if it isn't yet. */}
        {ai !== "none" && status?.signed_in !== true && <ClaudeSetup ai={status} onRefresh={checkStatus} />}
        {AFTER[ai] && <p className="modal__lead">{AFTER[ai]}</p>}

        {error && <p className="modal__error">{error}</p>}

        <div className="modal__actions">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="gradient" disabled={saving || !path.trim()}>
            {saving ? "Adding…" : "Add project"}
          </Button>
        </div>
      </form>
    </div>
  );
}
