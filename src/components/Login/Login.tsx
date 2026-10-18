import { useState } from "react";
import { api } from "../../api/client";
import "./Login.css";

// The sign-in form, shown in the panel that slides in over the splash. The first time, it
// asks for a username and a new password instead. The splash plays the bang once it's right.

type Props = {
  // No password yet: ask for a username and a new password instead.
  setup: boolean;
  // Signed in: the splash carries on into the dashboard.
  onSignedIn: () => void;
};

export default function Login({ setup, onSignedIn }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (setup && password !== again) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    (setup ? api.setPassword(username.trim(), password) : api.logIn(username.trim(), password)).then(
      () => {
        setDone(true);
        onSignedIn();
      },
      (e: Error) => {
        setError(e.message);
        setBusy(false);
      },
    );
  };

  return (
    <form className={`login${done ? " login--done" : ""}`} onSubmit={submit}>
      <h1>{setup ? "Make your account" : "Welcome back"}</h1>
      <p className="login__lead">
        {setup
          ? "Only you will be able to open this dashboard. Pick a username and a password of at least 8 characters."
          : "Sign in to open your dashboard."}
      </p>
      <label className="login__field">
        <span>Username</span>
        <div className="login__input">
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={40}
            disabled={done}
          />
        </div>
      </label>
      <label className="login__field">
        <span>{setup ? "New password" : "Password"}</span>
        <div className="login__input">
          <input
            type={show ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={setup ? "new-password" : "current-password"}
            disabled={done}
          />
          <button type="button" className="login__show" onClick={() => setShow((v) => !v)} aria-pressed={show}>
            {show ? "Hide" : "Show"}
          </button>
        </div>
      </label>
      {setup && (
        <label className="login__field">
          <span>Type it again</span>
          <div className="login__input">
            <input
              type={show ? "text" : "password"}
              value={again}
              onChange={(event) => setAgain(event.target.value)}
              autoComplete="new-password"
              disabled={done}
            />
          </div>
        </label>
      )}
      {error && (
        <p className="login__error" role="alert">
          {error}
        </p>
      )}
      <button className="login__submit" disabled={busy || !username.trim() || !password || (setup && !again)}>
        {busy ? (setup ? "Saving…" : "Checking…") : setup ? "Create and enter" : "Sign in"}
      </button>
      <p className="login__hint">
        {setup ? "Forget it later? " : "Forgot it? "}
        Run <code>devdash password</code> in a terminal to set a new one.
      </p>
    </form>
  );
}
