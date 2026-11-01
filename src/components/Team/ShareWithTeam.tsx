import { useEffect, useState } from "react";
import { team, type LinkStatus } from "../../api/team";
import type { FunctionExplanation } from "../../api/types";
import "./Team.css";

// The Share with team button under an explanation: shown only when DevDash is linked to a
// team server and the project is linked to it. Sends the explanation and the function's
// name, nothing else.

// Read once per page load and shared by every button, so a long list asks once.
let linkStatus: Promise<LinkStatus> | null = null;
function linked(): Promise<LinkStatus> {
  linkStatus ??= team.status().then((found) => found.link, () => ({ connected: false, pending: null }));
  return linkStatus;
}

// After linking or unlinking in Settings, so the buttons ask again.
export function forgetTeamLink() {
  linkStatus = null;
}

export default function ShareWithTeam({ repoId, subject, shareRef, explanation }: {
  repoId: number;
  subject: string;
  // This DevDash's own id for the explanation, so sharing it again updates it on the server.
  shareRef: string;
  explanation: FunctionExplanation;
}) {
  const [project, setProject] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [result, setResult] = useState<{ project: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    linked().then((link) => !stale && setProject(link.connected ? link.projects?.[String(repoId)]?.name ?? null : null));
    return () => {
      stale = true;
    };
  }, [repoId]);

  if (!project) return null;
  const share = () => {
    setState("busy");
    setError(null);
    team.share(repoId, subject, shareRef, explanation).then(
      (found) => (setResult(found), setState("done")),
      (e: Error) => (setError(e.message), setState("idle")),
    );
  };
  return (
    <div className="team__share">
      {state === "done" && result ? (
        <span>
          Shared with {result.project}'s teams.{" "}
          <a href={result.url} target="_blank" rel="noreferrer">See it</a>
        </span>
      ) : (
        <button className="team__share-button" onClick={share} disabled={state === "busy"}
                title="Sends this explanation and the function's name to the team server. No code, file paths or prompts.">
          {state === "busy" ? "Sharing…" : "Share with team"}
        </button>
      )}
      {error && <span className="team__share-error">{error}</span>}
    </div>
  );
}
