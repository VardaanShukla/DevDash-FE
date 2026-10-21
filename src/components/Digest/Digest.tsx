import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { Digest as DigestData, DigestChange, DigestFile, DigestFlag } from "../../api/types";
import "./Digest.css";

// The daily digest: what Claude changed on one day across every connected project, prompt
// by prompt. Changes that touch sign-in, payments, the database, tests or look like a secret
// come first, under "Needs a look". The flags come from plain rules, not AI. Each change
// can be undone in your files, and put back, without committing anything.

type Props = {
  // How many projects are connected to Claude: only those are recorded.
  connected: number;
  // Changes when git changes underneath, so the day is read again.
  version: string;
  onConnect: () => void;
};

const RISKY = new Set(["auth", "payments", "database", "tests", "secret"]);

export default function Digest({ connected, version, onConnect }: Props) {
  const [day, setDay] = useState(today);
  const [data, setData] = useState<DigestData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Prompts finish, and cloud sessions push, in any project, not only the one on screen, so
  // look again every 15 seconds while the page is visible.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => document.visibilityState === "visible" && setTick((n) => n + 1), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  // A request is out: the bar along the top of the day card moves while it is.
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stale = false;
    setBusy(true);
    api
      .digest(day)
      .then(
        (result) => !stale && (setData(result), setError(null)),
        (e: Error) => !stale && setError(e.message),
      )
      .finally(() => !stale && setBusy(false));
    return () => {
      stale = true;
    };
  }, [day, version, tick]);
  // Nothing to show for this day yet (the first load, or another day picked): placeholders
  // stand in for the counts and cards. A refresh of the day on screen keeps it showing.
  const loading = !error && (data === null || data.date !== day);

  const mark = (id: string, undone_at: string | null) =>
    setData((current) => current && { ...current, changes: current.changes.map((c) => (c.id === id ? { ...c, undone_at } : c)) });

  const shown = loading ? [] : data?.changes ?? [];
  const risky = shown.filter((change) => change.risky);
  const rest = shown.filter((change) => !change.risky);
  const isToday = day === today();

  return (
    <div className="digest">
      <section className="card digest__head" aria-busy={busy}>
        <span className={`digest__progress${busy ? " digest__progress--on" : ""}`} aria-hidden="true" />
        <div className="digest__title">
          <div>
            <h2>{label(day)}</h2>
            <span>{longDate(day)}</span>
          </div>
          <div className="digest__days" role="group" aria-label="Day">
            <button onClick={() => setDay(shift(day, -1))} aria-label="Day before">‹</button>
            <button onClick={() => setDay(today())} disabled={isToday}>Today</button>
            <button onClick={() => setDay(shift(day, 1))} disabled={isToday} aria-label="Day after">›</button>
          </div>
        </div>
        {error && <p className="digest__error">{error}</p>}
        {loading && (
          <>
            <ul className="digest__stats" aria-hidden="true">
              {[64, 78, 52, 88, 96].map((width, i) => (
                <li key={i} className="digest__stat digest__skeleton" style={{ width, animationDelay: `${i * 90}ms` }} />
              ))}
            </ul>
            <p className="digest__loading" role="status">
              <span className="digest__dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              Reading {day === today() ? "today's" : "the day's"} changes…
            </p>
          </>
        )}
        {data && !loading && (
          <>
            <ul className="digest__stats">
              <Stat value={data.claude.prompts} label={data.claude.prompts === 1 ? "prompt" : "prompts"} />
              <Stat value={data.claude.functions} label={data.claude.functions === 1 ? "function" : "functions"} />
              <Stat value={data.claude.files} label={data.claude.files === 1 ? "file" : "files"} />
              <Stat value={data.claude.risky} label="need a look" tone={data.claude.risky ? "risk" : undefined} />
              <Stat value={data.claude.uncommitted} label="not committed" tone={data.claude.uncommitted ? "warn" : undefined} />
            </ul>
            <p className="digest__you">
              {data.claude.prompts > 0 && (
                <>
                  AI: <b className="digest__add">+{data.claude.additions}</b> <b className="digest__del">−{data.claude.deletions}</b> lines.{" "}
                </>
              )}
              You: {data.you.files} {data.you.files === 1 ? "file" : "files"} in {data.you.commits}{" "}
              {data.you.commits === 1 ? "commit" : "commits"}
              {data.you.files > 0 && (
                <>
                  , <b className="digest__add">+{data.you.additions}</b> <b className="digest__del">−{data.you.deletions}</b> lines
                </>
              )}
              .
            </p>
          </>
        )}
      </section>

      <div className="digest__list">
        {loading && <Placeholders />}
        {data && !loading && data.changes.length === 0 && (
          <section className="card digest__empty">
            {connected === 0 ? (
              <>
                <h3>No project is recording AI changes yet</h3>
                <p>DevDash records AI changes only in projects connected to your AI coding tool. Connect one, then restart any coding session that's open.</p>
                <button className="digest__button" onClick={onConnect}>Open Projects</button>
              </>
            ) : (
              <>
                <h3>{isToday ? "Your AI hasn't changed anything today" : "Your AI didn't change anything this day"}</h3>
                <p>
                  Changes show here as soon as a prompt to your AI coding tool finishes in one of your {connected} connected{" "}
                  {connected === 1 ? "project" : "projects"}, or a commit with an AI co-author, from a cloud session
                  for example, reaches one of your branches.
                </p>
              </>
            )}
          </section>
        )}

        {risky.length > 0 && (
          <section className="digest__group">
            <h3 className="digest__group-title digest__group-title--risk">Needs a look</h3>
            {risky.map((change) => <Change key={change.id} change={change} onUndone={mark} />)}
          </section>
        )}
        {rest.length > 0 && (
          <section className="digest__group">
            {risky.length > 0 && <h3 className="digest__group-title">Everything else</h3>}
            {rest.map((change) => <Change key={change.id} change={change} onUndone={mark} />)}
          </section>
        )}
        {data && !loading && data.changes.length > 0 && (
          <p className="digest__note">
            Flags come from simple rules on file names and changed lines, so treat them as a reason to look, not a verdict.
          </p>
        )}
      </div>
    </div>
  );
}

// Cards shaped like prompts, shimmering while the day is read.
function Placeholders() {
  return (
    <div className="digest__placeholders" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <section key={i} className="card digest__change digest__ghost" style={{ animationDelay: `${i * 120}ms` }}>
          <span className="digest__skeleton digest__ghost-title" style={{ width: `${68 - i * 14}%` }} />
          <div className="digest__ghost-meta">
            <span className="digest__skeleton" style={{ width: 70 }} />
            <span className="digest__skeleton" style={{ width: 90 }} />
            <span className="digest__skeleton" style={{ width: 120 }} />
          </div>
          <span className="digest__skeleton digest__ghost-line" style={{ width: `${44 + i * 10}%` }} />
        </section>
      ))}
    </div>
  );
}

function Change({ change, onUndone }: { change: DigestChange; onUndone: (id: string, at: string | null) => void }) {
  const [open, setOpen] = useState(change.risky);
  const [whole, setWhole] = useState(false);
  // Undo asks once, inside the card, before it touches any file.
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const run = (put: boolean) => {
    setBusy(true);
    setProblem(null);
    (put ? api.putBackChange(change.id) : api.undoChange(change.id)).then(
      (result) => {
        setBusy(false);
        setConfirming(false);
        onUndone(change.id, result.undone_at);
      },
      (e: Error) => {
        setBusy(false);
        setProblem(e.message);
      },
    );
  };
  const functions = change.files.reduce((sum, file) => sum + file.functions.length, 0);
  const long = (change.prompt ?? "").length > 220;
  return (
    <article className={`card digest__change${change.risky ? " digest__change--risk" : ""}${change.undone_at ? " digest__change--undone" : ""}`}>
      <header className="digest__change-head">
        <p className={`digest__prompt${long && !whole ? " digest__prompt--clamped" : ""}`}>
          {change.prompt ?? <i>No prompt was recorded</i>}
        </p>
        {long && (
          <button className="digest__link" onClick={() => setWhole((v) => !v)}>
            {whole ? "Less" : "Whole prompt"}
          </button>
        )}
        <div className="digest__meta">
          <span className="digest__repo">{change.repo.name}</span>
          {change.branch && <code>{change.branch}</code>}
          <span>{time(change.at)}</span>
          {change.tool && <span className="digest__tool">{change.tool}</span>}
          {change.origin === "cloud" ? (
            <span className="digest__cloud" title="A commit with an AI co-author, found on this branch. No hook saw it being made, so the commit message stands in for the prompt.">
              From a cloud session
            </span>
          ) : (
            !change.prompt_recorded && <span>from a commit marked as made with AI</span>
          )}
          {change.undone_at && <span className="digest__undone-tag">Undone</span>}
          {change.undone_at ? null : change.commit ? (
            <span className="digest__committed" title={change.commit.sha}>
              Committed: {change.commit.message} <code>{change.commit.sha.slice(0, 7)}</code>
              {change.commit.count > 1 && ` and ${change.commit.count - 1} more`}
            </span>
          ) : (
            <span className="digest__uncommitted">Not committed yet</span>
          )}
        </div>
        {change.flags.length > 0 && (
          <div className="digest__flags">
            {change.flags.map((flag) => <FlagChip key={flag.kind} flag={flag} />)}
          </div>
        )}
      </header>
      <button className="digest__toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>{open ? "▾" : "▸"}</span>
        {change.files.length} {change.files.length === 1 ? "file" : "files"}
        {functions > 0 && `, ${functions} ${functions === 1 ? "function" : "functions"}`}
        <b className="digest__add">+{change.additions}</b>
        <b className="digest__del">−{change.deletions}</b>
      </button>
      {open && (
        <ul className="digest__files">
          {change.files.map((file) => <File key={file.path} file={file} />)}
        </ul>
      )}
      <div className="digest__undo">
        {change.undone_at ? (
          <>
            <p>
              Undone at {time(change.undone_at)}. Those files are back to how they were before this prompt, not committed
              yet: check them and commit when you're happy.
            </p>
            <button className="digest__button" onClick={() => run(true)} disabled={busy}>
              {busy ? "Putting back…" : "Put it back"}
            </button>
          </>
        ) : confirming ? (
          <>
            <p>
              This changes {change.files.length} {change.files.length === 1 ? "file" : "files"} in {change.repo.name} back to
              how {change.files.length === 1 ? "it was" : "they were"} before this prompt. Nothing is committed, and you can put
              it back.
            </p>
            <button className="digest__button digest__button--danger" onClick={() => run(false)} disabled={busy}>
              {busy ? "Undoing…" : "Undo"}
            </button>
            <button className="digest__button" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </button>
          </>
        ) : (
          <button className="digest__link" onClick={() => setConfirming(true)}>
            Undo this change
          </button>
        )}
        {problem && (
          <p className="digest__error" role="alert">
            {problem}
          </p>
        )}
      </div>
    </article>
  );
}

function File({ file }: { file: DigestFile }) {
  return (
    <li className="digest__file">
      <div className="digest__file-head">
        <code className="digest__path">{file.path}</code>
        {file.status !== "modified" && <span className={`pill ${file.status === "added" ? "pill--add" : "pill--del"}`}>{file.status === "added" ? "new" : "deleted"}</span>}
        {file.watched && (
          <span
            className="digest__watched"
            title="This file changed while the prompt ran, but not through the AI tool's own edit tools: it may have used a shell command, or you edited it at the same time. Check it's the AI's before undoing."
          >
            changed during this prompt
          </span>
        )}
        <b className="digest__add">+{file.additions}</b>
        <b className="digest__del">−{file.deletions}</b>
      </div>
      {file.functions.length > 0 && (
        <div className="digest__functions">
          {file.functions.map((fn) => (
            <span key={fn.name} className={`digest__fn digest__fn--${fn.change}`} title={fn.change}>
              {fn.change === "added" ? "+ " : fn.change === "deleted" ? "− " : ""}
              {fn.name}
            </span>
          ))}
        </div>
      )}
      {file.flags.map((flag) => (
        <div key={flag.kind} className={`digest__why${RISKY.has(flag.kind) ? " digest__why--risk" : ""}`}>
          <strong>{flag.label}:</strong> {flag.reason}
          {flag.line && <code>{flag.line}</code>}
        </div>
      ))}
    </li>
  );
}

function FlagChip({ flag }: { flag: DigestFlag }) {
  return (
    <span className={`digest__flag${RISKY.has(flag.kind) ? " digest__flag--risk" : ""}`} title={flag.reason}>
      {flag.label}
    </span>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: "risk" | "warn" }) {
  return (
    <li className={`digest__stat${tone ? ` digest__stat--${tone}` : ""}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </li>
  );
}

function today() {
  return local(new Date());
}

function local(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function shift(day: string, days: number) {
  const [y, m, d] = day.split("-").map(Number);
  return local(new Date(y, m - 1, d + days));
}

function label(day: string) {
  if (day === today()) return "Today";
  if (day === shift(today(), -1)) return "Yesterday";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

function longDate(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function time(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
