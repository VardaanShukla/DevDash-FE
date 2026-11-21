import { useEffect, useState } from "react";
import type { AiStatus } from "../../api/types";
import ClaudeSignIn from "./ClaudeSignIn";
import "./ClaudeSignIn.css";

// Getting an AI ready to write explanations, wherever Looma asks for it (first run,
// adding a project, Settings, an explanation that can't run): installing it with its
// official installer for this computer, starting it or downloading a model (Ollama), and
// signing in, with one click where the tool allows it. Started with Claude, hence the name.

type Props = {
  // null while it's being checked.
  ai: AiStatus | null;
  onRefresh: () => void;
};

export default function ClaudeSetup({ ai, onRefresh }: Props) {
  const [checking, setChecking] = useState(false);
  useEffect(() => setChecking(false), [ai]);
  const checkAgain = (
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
  );

  if (ai === null) {
    return (
      <div className="claude-setup">
        <span className="claude-setup__spinner" aria-hidden="true" />
        <span className="claude-setup__line">Checking for the AI on this computer…</span>
      </div>
    );
  }

  // A model on your own server is connected in Settings → AI, by pasting its curl command.
  if (ai.provider === "hosted" && (!ai.available || ai.signed_in === false)) {
    return (
      <div className="signin claude-setup--install">
        <strong className="signin__title">{ai.server ? "Can't use your server's model" : "Connect your server's model"}</strong>
        <p>{ai.server ? ai.detail : "Paste the curl command that reaches your model in Settings → AI."}</p>
        {ai.server && <p className="claude-setup__note">Is the server running? Change its address or key in Settings → AI.</p>}
        {checkAgain}
      </div>
    );
  }

  if (!ai.available) {
    const commands = ai.install ?? [];
    const several = commands.length > 1;
    const links = commands.every((c) => c.command.startsWith("https://"));
    return (
      <div className="signin claude-setup--install">
        <strong className="signin__title">{ai.detail ?? `Install ${ai.name}`}</strong>
        <p>{intro(ai)}</p>
        <ol className="signin__steps">
          <li>
            {links ? "Download and install it from:" : `Open ${several ? "a terminal (on Windows, PowerShell)" : "a terminal"} and paste ${several ? "one of these" : "this"}:`}
            {commands.map((c) => (
              <Command key={c.shell + c.command} label={several ? c.shell : null} command={c.command} />
            ))}
            {ai.login_command && ai.login === "none" && <span className="claude-setup__line">{ai.login_command}</span>}
          </li>
          <li>When it's done, press Check again{ai.provider === "claude" || ai.provider === "codex" ? ", then sign in" : ""}.</li>
        </ol>
        {needs(ai) && <p className="claude-setup__note">{needs(ai)}</p>}
        {checkAgain}
      </div>
    );
  }

  if (ai.signed_in === false && ai.login === "button") {
    return (
      <ClaudeSignIn
        provider={ai.provider}
        onSignedIn={onRefresh}
        title={`Sign in to ${ai.name}`}
        intro={`${ai.name} is installed. One click opens its sign-in page in your browser; sign in there and Looma notices by itself.`}
      />
    );
  }

  if (ai.signed_in === false && ai.login === "terminal") {
    return (
      <div className="signin">
        <strong className="signin__title">Sign in to {ai.name}</strong>
        <p>{ai.name} signs in from a terminal. Run this once, sign in when it asks (with your Google account), then come back:</p>
        <Command label={null} command={ai.login_command ?? ""} />
        {checkAgain}
      </div>
    );
  }

  return (
    <div className="claude-setup claude-setup--done">
      <span className="claude-setup__tick" aria-hidden="true">
        ✓
      </span>
      <span>
        <strong>
          {ai.name} is ready
          {ai.account && ai.provider === "hosted" ? ` · on ${ai.account}` : ""}
          {ai.account && ai.provider !== "ollama" && ai.provider !== "hosted" ? ` · signed in${ai.account.includes("@") ? ` as ${ai.account}` : ` with your ${ai.account}`}` : ""}
        </strong>
        <span className="claude-setup__line">
          {ai.signed_in === null
            ? `Looma couldn't check its sign-in; the first explanation will tell. If it asks, run ${ai.login_command ?? "it"} in a terminal once.`
            : ai.provider === "ollama"
              ? "Runs on this computer: free and private, though slower than the online ones."
              : ai.provider === "hosted"
                ? "Runs on your own server: your code goes there, and nowhere else."
              : "Looma can explain changes in plain English."}
        </span>
      </span>
    </div>
  );
}

function intro(ai: AiStatus) {
  if (ai.provider === "ollama") {
    if (ai.detail === "Start Ollama") return "Ollama is installed but not running.";
    if (ai.detail === "Download a model") return "Ollama is running but has no model yet. A small one is enough for explanations:";
    return "Ollama runs AI models on this computer: free and private, no account needed.";
  }
  return `${ai.name} isn't on this computer yet. Installing takes a minute, with its official installer:`;
}

// What account each needs, so nobody installs one they can't use.
function needs(ai: AiStatus) {
  if (ai.provider === "claude") return "You need a Claude Pro, Max, Team or Enterprise plan, or a Console account.";
  if (ai.provider === "codex") return "Sign in with a ChatGPT plan that includes Codex (Plus, Pro, Business, Edu or Enterprise), or an API key.";
  if (ai.provider === "antigravity") return "Sign in with your Google account.";
  return null;
}

// One command (or download link), with a button that copies it.
function Command({ label, command }: { label: string | null; command: string }) {
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
      {label && <em>{label}</em>}
      {command.startsWith("https://") ? (
        <a href={command} target="_blank" rel="noreferrer">
          <code>{command}</code>
        </a>
      ) : (
        <code>{command}</code>
      )}
      {navigator.clipboard && (
        <button type="button" onClick={copy}>
          {copied ? "Copied ✓" : "Copy"}
        </button>
      )}
    </span>
  );
}
