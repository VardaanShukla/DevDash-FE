import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { AiProvider, SignIn } from "../../api/types";
import "./ClaudeSignIn.css";

// Signs in to an AI from the page, so nobody has to open a terminal. The backend runs the
// tool's own sign-in (`claude auth login`, `codex login`), which opens its sign-in page in
// the browser; when Claude's page shows a code instead of finishing by itself, it's pasted here.

const NAMES: Record<AiProvider, string> = { claude: "Claude", codex: "ChatGPT", ollama: "Ollama", antigravity: "Antigravity" };

type Props = {
  onSignedIn: () => void;
  // Which AI; Claude unless given.
  provider?: AiProvider;
  // Wording for where it's shown; by default it's the prompt for a sign-in that ran out.
  title?: string;
  intro?: string;
};

export default function ClaudeSignIn({ onSignedIn, provider = "claude", title, intro }: Props) {
  const [signIn, setSignIn] = useState<SignIn | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const waiting = signIn?.state === "waiting";
  const name = NAMES[provider];

  // The browser can finish the sign-in by itself; notice when it has.
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => {
      api.signInStatus().then(setSignIn, () => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [waiting]);

  useEffect(() => {
    if (signIn?.state === "signed_in") onSignedIn();
  }, [signIn?.state, onSignedIn]);

  const start = () => {
    setBusy(true);
    setError(null);
    api.signIn(provider).then(setSignIn, (e: Error) => setError(e.message)).finally(() => setBusy(false));
  };

  // Not a form of its own: it can sit inside one (adding a project), where forms can't nest.
  const finish = () => {
    if (busy || !code.trim()) return;
    setBusy(true);
    api
      .signInCode(code)
      .then((result) => {
        setSignIn(result);
        if (result.state === "waiting") setError("That code didn't finish signing in yet. Check it and try again.");
      }, (e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  };

  return (
    <div className="signin">
      <strong className="signin__title">{title ?? `Sign in to ${name} to get explanations`}</strong>
      {!waiting ? (
        <>
          <p>
            {signIn?.state === "failed"
              ? `Signing in didn't work${signIn.detail ? ` (${signIn.detail})` : ""}. Try again.`
              : intro ?? `DevDash asks your ${name} account. Your sign-in has run out or was never made on this computer.`}
          </p>
          <button type="button" className="signin__button" onClick={start} disabled={busy}>
            {busy ? "Opening the sign-in page…" : `Sign in to ${name}`}
          </button>
        </>
      ) : (
        <>
          <ol className="signin__steps">
            <li>
              Sign in on the page that opened in your browser.
              {signIn?.url && (
                <>
                  {" "}
                  Didn't open?{" "}
                  <a href={signIn.url} target="_blank" rel="noreferrer">
                    Open the sign-in page
                  </a>
                  .
                </>
              )}
            </li>
            <li>
              {provider === "claude"
                ? "If the page then shows a code, paste it here. Otherwise this finishes by itself."
                : "This finishes by itself once you've signed in."}
            </li>
          </ol>
          {/* Only Claude's sign-in page can end with a code to bring back here. */}
          {provider === "claude" && (
          <div className="signin__code" role="group" aria-label="Finish signing in">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  finish();
                }
              }}
              placeholder="Paste the code"
              aria-label="Code from the sign-in page"
              spellCheck={false}
              autoComplete="off"
            />
            <button type="button" className="signin__button" onClick={finish} disabled={busy || !code.trim()}>
              {busy ? "Signing in…" : "Finish"}
            </button>
          </div>
          )}
        </>
      )}
      {error && <p className="signin__error">{error}</p>}
    </div>
  );
}
