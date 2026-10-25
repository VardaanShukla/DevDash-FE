import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "../../api/client";
import type { Repo } from "../../api/types";
import "../AddProject/AddProject.css";
import "./RemoveProject.css";

type Props = {
  repo: Repo;
  onClose: () => void;
  onRemoved: (repoId: number) => void;
};

// Asks before removing, and says plainly what goes and what stays.
export default function RemoveProject({ repo, onClose, onRemoved }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const remove = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.removeRepo(repo.id);
      onRemoved(repo.id);
    } catch (e) {
      setError((e as ApiError).message);
      setSaving(false);
    }
  };

  return (
    <div className="modal" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal__panel card" role="alertdialog" aria-labelledby="remove-project-title">
        <h2 id="remove-project-title">Remove {repo.name} from DevDash?</h2>
        <p className="modal__lead remove__path">{repo.path}</p>
        <ul className="remove__list">
          <li>Your files, branches and git history stay exactly as they are.</li>
          {repo.ai ? (
            <li>DevDash stops recording AI changes here and deletes the AI requests it recorded for this project.</li>
          ) : (
            <li>DevDash just stops showing it.</li>
          )}
          <li>You can add it again any time.</li>
        </ul>
        {error && <p className="modal__error">{error}</p>}
        <div className="modal__actions">
          <Button variant="ghost" onClick={onClose} autoFocus>
            Cancel
          </Button>
          <Button variant="danger" onClick={remove} disabled={saving}>
            {saving ? "Removing…" : "Remove project"}
          </Button>
        </div>
      </section>
    </div>
  );
}
