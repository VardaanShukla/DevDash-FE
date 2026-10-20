import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../../api/client";
import type { AiProvider, AiStatus, PreferenceChange, Preferences } from "../../api/types";
import ClaudeSetup from "../ClaudeSignIn/ClaudeSetup";
import { FIXED, SHORTCUTS, keyLabel, keyName } from "../../shortcuts";
import "./Settings.css";

// Settings: how DevDash looks, whether uncommitted work shows from the start, the account
// (password and signing out) and the keyboard shortcuts. Saved by the backend, so every
// browser you sign in from gets the same.

type Props = {
  prefs: Preferences;
  onPrefs: (changes: PreferenceChange) => Promise<void>;
  onResetShortcuts: () => Promise<void>;
  username?: string;
  passwordSet: boolean;
  onSignOut?: () => void;
  // After setting or changing the password, so the account details are read again.
  onPasswordSet: () => void;
  // The AI picked for explanations: installed, signed in, and as whom; null while checked.
  ai: AiStatus | null;
  onAiRefresh: () => void;
};

export default function Settings({ prefs, onPrefs, onResetShortcuts, username, passwordSet, onSignOut, onPasswordSet, ai, onAiRefresh }: Props) {
  // An AI can be installed, signed in or out outside DevDash: look again on opening Settings.
  useEffect(() => onAiRefresh(), [onAiRefresh]);

  return (
    <div className="settings">
      <div className="settings__column">
        <section className="card settings__section">
          <h2>Appearance</h2>
          <p className="settings__note">How DevDash looks in every browser you sign in from.</p>
          <div className="settings__themes" role="radiogroup" aria-label="Theme">
            {(["dark", "light"] as const).map((theme) => (
              <button
                key={theme}
                role="radio"
                aria-checked={prefs.theme === theme}
                className={`settings__theme settings__theme--${theme}${prefs.theme === theme ? " settings__theme--on" : ""}`}
                onClick={() => onPrefs({ theme })}
              >
                <span className="settings__preview" aria-hidden="true">
                  <i />
                  <b />
                  <b />
                  <b />
                </span>
                <strong>{theme === "dark" ? "Dark" : "Light"}</strong>
                <span>{theme === "dark" ? "Deep navy, glowing night sky" : "Latte and cream, sunlit sky"}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="card settings__section">
          <h2>Changes</h2>
          <label className="settings__switch">
            <input
              type="checkbox"
              checked={prefs.uncommitted === true}
              onChange={(event) => onPrefs({ uncommitted: event.target.checked })}
            />
            <span className="settings__track" aria-hidden="true" />
            <span>
              <strong>Show uncommitted work from the start</strong>
              <span className="settings__note">
                Changes, This branch and the map include edits you haven't committed yet, every time DevDash opens. You
                can still turn it on or off for a while with Uncommitted work at the top.
              </span>
            </span>
          </label>
        </section>

        <Account username={username} passwordSet={passwordSet} onSignOut={onSignOut} onPasswordSet={onPasswordSet} />

        <section className="card settings__section">
          <h2>AI for explanations</h2>
          <p className="settings__note">
            Pick the AI that writes DevDash's plain-English explanations, and its model. Smaller models use fewer tokens:
            each AI starts on its cheapest model. Explanations are saved, so each is asked for once.
            Recording what your AI coding tool changes is separate: connect it per project under Projects.
          </p>
          <AiPicker prefs={prefs} onPrefs={onPrefs} onActiveChange={onAiRefresh} active={ai} />
        </section>
      </div>

      <Shortcuts prefs={prefs} onPrefs={onPrefs} onReset={onResetShortcuts} />
    </div>
  );
}

// What each AI is, in a line.
const BLURB: Record<AiProvider, string> = {
  claude: "Anthropic's Claude Code. Uses your Claude plan.",
  codex: "OpenAI's Codex CLI. Uses your ChatGPT plan.",
  ollama: "A model running on this computer. Free and private, but slower.",
  antigravity: "Google's Antigravity CLI. Uses your Google account.",
};
const ORDER: AiProvider[] = ["claude", "codex", "ollama", "antigravity"];

// Choosing the AI that writes explanations: each with whether it's ready, the setup steps
// for the one picked (install, sign in), and its model. Also on the first-run screen.
export function AiPicker({ prefs, onPrefs, onActiveChange, active }: {
  prefs: Preferences;
  onPrefs: (changes: PreferenceChange) => Promise<void>;
  // The AI in use changed, or may have (signed in, installed): read it again.
  onActiveChange: () => void;
  // The AI in use, as the dashboard last read it; refreshes the list when it changes.
  active?: AiStatus | null;
}) {
  const [list, setList] = useState<AiStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api.aiProviders().then(
      (found) => (setList(found), setError(null)),
      (e: Error) => setError(e.message),
    );
  }, []);
  useEffect(load, [load, active]);

  const chosen = prefs.ai.provider;
  const current = list?.find((p) => p.provider === chosen) ?? null;
  const pick = (provider: AiProvider) =>
    onPrefs({ ai: { provider } }).then(onActiveChange, (e: Error) => setError(e.message));
  const refresh = () => {
    load();
    onActiveChange();
  };

  return (
    <div className="ai-picker">
      <div className="ai-picker__options" role="radiogroup" aria-label="AI for explanations">
        {ORDER.map((id) => {
          const p = list?.find((item) => item.provider === id);
          const state = !p ? "checking" : !p.available ? "setup" : p.signed_in === false ? "signin" : "ready";
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={chosen === id}
              className={`ai-picker__option${chosen === id ? " ai-picker__option--on" : ""}`}
              onClick={() => chosen !== id && pick(id)}
            >
              <span className="ai-picker__top">
                <strong>{p?.name ?? id}</strong>
                <span className={`ai-picker__state ai-picker__state--${state}`}>
                  {state === "checking" ? "Checking…" : state === "ready" ? "Ready" : state === "signin" ? "Sign in" : p?.detail?.replace(/^Install the /, "Install ") ?? "Set up"}
                </span>
              </span>
              <span className="ai-picker__blurb">{BLURB[id]}</span>
            </button>
          );
        })}
      </div>
      {error && <p className="settings__message settings__message--error">{error}</p>}
      <ClaudeSetup ai={current} onRefresh={refresh} />
      {current?.available && (
        <ModelPicker
          key={current.provider}
          ai={current}
          chosen={prefs.ai.models[chosen] ?? ""}
          onPick={(model) => onPrefs({ ai: { models: { [chosen]: model } } }).then(refresh, (e: Error) => setError(e.message))}
        />
      )}
    </div>
  );
}

// The model for the AI picked: its models cheapest first, or any name typed in.
function ModelPicker({ ai, chosen, onPick }: { ai: AiStatus; chosen: string; onPick: (model: string) => void }) {
  const known = ai.models.some((m) => m.id === chosen);
  const [typing, setTyping] = useState(Boolean(chosen) && !known);
  const [text, setText] = useState(known ? "" : chosen);
  const shown = typing ? "__other" : chosen || ai.default_model || "";
  const note = ai.models.find((m) => m.id === (chosen || ai.default_model))?.note;
  const save = () => text.trim() !== chosen && onPick(text.trim());

  return (
    <div className="ai-picker__model">
      <label>
        <span>Model</span>
        <select
          className="select"
          value={shown}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "__other") return setTyping(true);
            setTyping(false);
            // The default is stored as no choice, so a later, cheaper default reaches it.
            onPick(value === ai.default_model ? "" : value);
          }}
        >
          {ai.provider === "antigravity" && <option value="">Antigravity's own choice</option>}
          {ai.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
              {m.id === ai.default_model ? " · default, fewest tokens" : ""}
            </option>
          ))}
          <option value="__other">Another model (type its name)…</option>
        </select>
      </label>
      {typing && (
        <input
          className="ai-picker__custom"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => event.key === "Enter" && save()}
          placeholder={ai.provider === "ollama" ? "e.g. llama3.2:3b" : ai.provider === "antigravity" ? "a model name, as agy's /model shows it" : "model name"}
          spellCheck={false}
          autoFocus
        />
      )}
      <p className="settings__note">
        {!typing && note ? `${note} ` : ""}
        {ai.provider === "ollama"
          ? "Local models use no tokens; smaller ones answer faster."
          : "Smaller models use fewer tokens; bigger ones explain tricky code better."}
      </p>
    </div>
  );
}

function Account({ username, passwordSet, onSignOut, onPasswordSet }: {
  username?: string;
  passwordSet: boolean;
  onSignOut?: () => void;
  onPasswordSet: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [name, setName] = useState("");
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (password !== again) return setMessage({ ok: false, text: "The two new passwords don't match." });
    setBusy(true);
    api.setPassword(passwordSet ? undefined : name.trim(), password, passwordSet ? current : undefined).then(
      () => {
        setMessage({ ok: true, text: passwordSet ? "Password changed. Other browsers are signed out." : "Password set. DevDash now asks for it." });
        setCurrent("");
        setPassword("");
        setAgain("");
        setBusy(false);
        onPasswordSet();
      },
      (e: Error) => {
        setMessage({ ok: false, text: e.message });
        setBusy(false);
      },
    );
  };

  return (
    <section className="card settings__section">
      <div className="settings__head">
        <h2>Account</h2>
        {onSignOut && (
          <button className="settings__button settings__button--quiet" onClick={onSignOut}>
            Sign out
          </button>
        )}
      </div>
      <p className="settings__note">
        {passwordSet ? (
          <>
            Signed in{username ? <> as <b>{username}</b></> : null}. Signing in lasts 30 days on each browser.
          </>
        ) : (
          "No password yet: anyone who can open this computer's DevDash address can use it. Set one to lock it."
        )}
      </p>
      <form className="settings__form" onSubmit={submit}>
        {!passwordSet && (
          <label>
            <span>Username</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" />
          </label>
        )}
        {passwordSet && (
          <label>
            <span>Current password</span>
            <input type={show ? "text" : "password"} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </label>
        )}
        <label>
          <span>New password</span>
          <input type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </label>
        <label>
          <span>New password again</span>
          <input type={show ? "text" : "password"} value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
        </label>
        <div className="settings__form-end">
          <label className="settings__check">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show
          </label>
          <button
            className="settings__button"
            disabled={busy || !password || !again || (passwordSet ? !current : !name.trim())}
          >
            {passwordSet ? "Change password" : "Set password"}
          </button>
        </div>
        {message && <p className={`settings__message${message.ok ? "" : " settings__message--error"}`}>{message.text}</p>}
        <p className="settings__note">Forgot it? Run <code>devdash password</code> in a terminal to set a new one.</p>
      </form>
    </section>
  );
}

function Shortcuts({ prefs, onPrefs, onReset }: { prefs: Preferences; onPrefs: Props["onPrefs"]; onReset: () => Promise<void> }) {
  // The action waiting for its new key, if any.
  const [listening, setListening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!listening) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape") return setListening(null);
      // Backspace or Delete turns the shortcut off.
      const key = event.key === "Backspace" || event.key === "Delete" ? "" : keyName(event);
      if (key === null) return setError("That key can't be a shortcut. Try a letter, a number or a function key.");
      const action = listening;
      setListening(null);
      onPrefs({ shortcuts: { [action]: key } }).then(
        () => setError(null),
        (e: Error) => setError(e.message),
      );
    };
    // Capture, so the key isn't also taken as a shortcut while choosing it.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening, onPrefs]);

  const groups = [...new Set(SHORTCUTS.map((s) => s.group))];
  return (
    <section className="card settings__section settings__keys">
      <div className="settings__head">
        <h2>Shortcut keys</h2>
        <button className="settings__button settings__button--quiet" onClick={() => onReset().then(() => setError(null))}>
          Reset to defaults
        </button>
      </div>
      <p className="settings__note">
        Click a key to change it, then press the new one. Backspace turns a shortcut off, Esc keeps the old key. Shortcuts
        don't fire while you're typing in a box.
      </p>
      {error && <p className="settings__message settings__message--error">{error}</p>}
      <div className="settings__groups">
        {groups.map((group) => (
          <div key={group} className="settings__group">
            <h3>{group}</h3>
            <ul>
              {SHORTCUTS.filter((s) => s.group === group).map((s) => {
                const key = prefs.shortcuts[s.id];
                return (
                  <li key={s.id}>
                    <span>{s.label}</span>
                    <button
                      className={`settings__key${listening === s.id ? " settings__key--listening" : ""}${key ? "" : " settings__key--off"}`}
                      onClick={() => setListening(listening === s.id ? null : s.id)}
                      aria-label={`${s.label}: ${key ? keyLabel(key) : "no shortcut"}. Change`}
                    >
                      {listening === s.id ? "Press a key…" : key ? <kbd>{keyLabel(key)}</kbd> : "None"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <div className="settings__group">
          <h3>Always</h3>
          <ul>
            {FIXED.map((f) => (
              <li key={f.label}>
                <span>{f.label}</span>
                <span className="settings__key settings__key--fixed">
                  <kbd>{f.keys}</kbd>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
