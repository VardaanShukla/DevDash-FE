import { useEffect, useState } from "react";
import type { AiStatus } from "../../api/types";
import ClaudeSignIn from "./ClaudeSignIn";
import "./ClaudeSignIn.css";

// Getting Claude ready, wherever DevDash asks for it (first run, adding a project,
// Settings): installing Claude Code with the official installer for this computer, then
// signing in with one click. Signing in is what lets DevDash write plain-English
// explanations; recording Claude's changes works without it.

type Props = {
  // null while it's being checked.
  ai: AiStatus | null;
  onRefresh: () => void;
};

export default function ClaudeSetup({ ai, onRefresh }: Props) {
  const [checking, setChecking] = useState(false);
  useEffect(() => setChecking(false), [ai]);

  if (ai === null) {
    return (
      <div className="claude-setup">
        <span className="claude-setup__spinner" aria-hidden="true" />
        <span className="claude-setup__line">Checking for Claude on this computer…</span>
      </div>
    );
  }

  if (!ai.available) {
    const commands = ai.install ?? [];
    return (
      <div className="signin claude-setup--install">
        <strong className="signin__title">Install Claude Code</strong>
        <p>It isn't on this computer yet. Installing takes a minute, with Claude's own installer:</p>
        <ol className="signin__steps">
          <li>
            Open {commands.length > 1 ? "PowerShell (or Command Prompt)" : "a terminal"} and paste
            {commands.length > 1 ? " the line for it" : " this"}:
            {commands.map((c) => (
              <Command key={c.shell} shell={commands.length > 1 ? c.shell : null} command={c.command} />
            ))}
          </li>
          <li>When it finishes, press Check again here, then sign in.</li>
        </ol>
        <p className="claude-setup__note">You need a Claude Pro, Max, Team or Enterprise plan, or a Console account.</p>
        <button
          type="button"
          className="signin__button"
          onClick={() => {
            setChecking(true);
            onRefresh();
          }}
          disabled={checking}
        >
          {checking ? "Checking…" : "Check again"}
        </button>
      </div>
    );
  }

  if (ai.signed_in) {
    return (
      <div className="claude-setup claude-setup--done">
        <span className="claude-setup__tick" aria-hidden="true">
          ✓
        </span>
        <span>
          <strong>Signed in to Claude{ai.account ? ` as ${ai.account}` : ""}</strong>
          <span className="claude-setup__line">DevDash can explain changes in plain English.</span>
        </span>
      </div>
    );
  }

  return (
    <ClaudeSignIn
      onSignedIn={onRefresh}
      title="Sign in to Claude"
      intro="Claude Code is installed. One click opens Claude's sign-in page in your browser; sign in there and DevDash notices by itself. It's what lets DevDash explain changes in plain English."
    />
  );
}

// One install line, with a button that copies it.
function Command({ shell, command }: { shell: string | null; command: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    navigator.clipboard?.writeText(command).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  return (
    <span className="claude-setup__command">
      {shell && <em>{shell}</em>}
      <code>{command}</code>
      {navigator.clipboard && (
        <button type="button" onClick={copy}>
          {copied ? "Copied ✓" : "Copy"}
        </button>
      )}
    </span>
  );
}
