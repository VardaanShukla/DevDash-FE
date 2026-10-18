import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { SignIn } from "../../api/types";
import "./ClaudeSignIn.css";

// Signs in to Claude Code from the page, so nobody has to open a terminal. The backend runs
// `claude auth login`, which opens the sign-in page in the browser; when that page shows a
// code instead of finishing by itself, it's pasted here.

type Props = { onSignedIn: () => void };

export default function ClaudeSignIn({ onSignedIn }: Props) {
  const [signIn, setSignIn] = useState<SignIn | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const waiting = signIn?.state === "waiting";

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
    api.signIn().then(setSignIn, (e: Error) => setError(e.message)).finally(() => setBusy(false));
  };

  const finish = (event: React.FormEvent) => {
    event.preventDefault();
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
      <strong className="signin__title">Sign in to Claude to get explanations</strong>
      {!waiting ? (
        <>
          <p>
            {signIn?.state === "failed"
              ? `Signing in didn't work${signIn.detail ? ` (${signIn.detail})` : ""}. Try again.`
              : "DevDash asks your Claude account. Your sign-in has run out or was never made on this computer."}
          </p>
          <button className="signin__button" onClick={start} disabled={busy}>
            {busy ? "Opening the sign-in page…" : "Sign in to Claude"}
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
            <li>If the page then shows a code, paste it here. Otherwise this finishes by itself.</li>
          </ol>
          <form className="signin__code" onSubmit={finish}>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Paste the code"
              aria-label="Code from the sign-in page"
              spellCheck={false}
              autoComplete="off"
            />
            <button className="signin__button" disabled={busy || !code.trim()}>
              {busy ? "Signing in…" : "Finish"}
            </button>
          </form>
        </>
      )}
      {error && <p className="signin__error">{error}</p>}
    </div>
  );
}
