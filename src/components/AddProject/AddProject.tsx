import { useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import type { AiTool, AiToolId, Repo } from "../../api/types";
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

export default function AddProject({ onClose, onAdded }: Props) {
  const [path, setPath] = useState("");
  const [tools, setTools] = useState<AiTool[]>([NO_AI]);
  const [ai, setAi] = useState("none");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

        {error && <p className="modal__error">{error}</p>}

        <div className="modal__actions">
          <button type="button" className="button button--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button" disabled={saving || !path.trim()}>
            {saving ? "Adding…" : "Add project"}
          </button>
        </div>
      </form>
    </div>
  );
}
