import { useEffect, useState, type MouseEvent } from "react";
import { api } from "../../api/client";
import type { AiStatus, DigestChangeDetail, DigestChangeFile, DigestUnit, FunctionExplanation } from "../../api/types";
import { batch, clear, job, result, start, startBatch, stopBatch, useJobs } from "../../lib/aiJobs";
import { DiffBlock, Explanation } from "../FunctionChanges/FunctionChanges";
import "./Digest.css";

// One prompt's own changes, opened from AI changes: the prompt in full, then each file it
// changed and, inside it, each function (or the whole file, when it has none) with only
// the lines this prompt changed. Each part can be explained on its own, or all of them in
// turn; the runs live in lib/aiJobs, so they keep going when the page is left.

type Props = {
  id: string;
  // A part to scroll to once the change is read: "<path>\n<name>", or a file's path.
  focus: string | null;
  ai: AiStatus | null;
  onSignedIn: () => void;
  explain: (change: string, path: string, name: string) => Promise<FunctionExplanation>;
  onBack: () => void;
};

const BADGE = {
  added: { label: "New", tone: "add" },
  deleted: { label: "Removed", tone: "del" },
  modified: { label: "Changed", tone: "mod" },
} as const;

// Short changes show their lines at once; longer ones wait for a click.
const OPEN_LINES = 40;

export default function PromptChanges({ id, focus, ai, onSignedIn, explain, onBack }: Props) {
  const [data, setData] = useState<DigestChangeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useJobs();

  useEffect(() => {
    let stale = false;
    setData(null);
    setError(null);
    api.digestChange(id).then(
      (found) => !stale && setData(found),
      (e: Error) => !stale && setError(e.message),
    );
    return () => {
      stale = true;
    };
  }, [id]);

  // Bring the part that was clicked into view once its card is on the page.
  useEffect(() => {
    if (!data || !focus) return;
    const target = document.getElementById(anchor(focus));
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [data, focus]);

  const keyOf = (path: string, name: string) => `prompt:${id}:${path}:${name}`;
  const batchKey = `prompt:${id}`;
  const all = batch(batchKey);
  const ready = ai?.available && ai.signed_in !== false;
  const explanationOf = (path: string, unit: DigestUnit) => unit.explanation ?? result<FunctionExplanation>(keyOf(path, unit.name)) ?? null;
  const parts = (data?.files ?? []).flatMap((file) => file.units.map((unit) => ({ file, unit })));
  const left = parts.filter(({ file, unit }) => !explanationOf(file.path, unit));
  const explainAll = () =>
    startBatch(
      batchKey,
      left.map(({ file, unit }) => ({
        key: keyOf(file.path, unit.name),
        label: unit.kind === "file" ? file.path : `${unit.name} in ${file.path}`,
        run: () => explain(id, file.path, unit.name),
      })),
    );

  return (
    <div className="digest">
      <section className="card digest__head pc__head">
        <button className="pc__back" onClick={onBack}>
          ‹ All AI changes
        </button>
        {error && <p className="digest__error">{error}</p>}
        {!data && !error && (
          <p className="digest__loading" role="status">
            <span className="digest__dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            Reading this prompt's changes…
          </p>
        )}
        {data && (
          <>
            <span className="pc__eyebrow">{data.prompt_recorded ? "What the AI was asked" : "Commit message"}</span>
            <p className="digest__prompt pc__prompt">{data.prompt ?? <i>No prompt was recorded</i>}</p>
            <div className="digest__meta">
              <span className="digest__repo">{data.repo.name}</span>
              {data.branch && <code>{data.branch}</code>}
              <span>{new Date(data.at).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}</span>
              {data.tool && <span className="digest__tool">{data.tool}</span>}
              {data.undone_at ? (
                <span className="digest__undone-tag">Undone</span>
              ) : data.commit ? (
                <span className="digest__committed">
                  Committed <code>{data.commit.sha.slice(0, 7)}</code>
                </span>
              ) : (
                <span className="digest__uncommitted">Not committed yet</span>
              )}
            </div>
            <p className="digest__you">
              {data.files.length} {data.files.length === 1 ? "file" : "files"}, {parts.length}{" "}
              {parts.length === 1 ? "part" : "parts"} · <b className="digest__add">+{data.additions}</b>{" "}
              <b className="digest__del">−{data.deletions}</b> lines
            </p>
            {data.flags.length > 0 && (
              <div className="digest__flags">
                {data.flags.map((flag) => (
                  <span key={flag.kind} className="digest__flag" title={flag.reason}>
                    {flag.label}
                  </span>
                ))}
              </div>
            )}
            <nav className="pc__jump" aria-label="Files in this prompt">
              {data.files.map((file) => (
                <a key={file.path} href={`#${anchor(file.path)}`} onClick={(e) => jump(e, file.path)}>
                  {file.path.slice(file.path.lastIndexOf("/") + 1)}
                  <span>
                    +{file.additions} −{file.deletions}
                  </span>
                </a>
              ))}
            </nav>
            {ai && !ready && <p className="pc__muted">Set up an AI in Settings to have each change explained.</p>}
            {ready && (all?.running || left.length > 0) && (
              <div className="pc__all">
                {all?.running ? (
                  <>
                    <span className="pc__muted">
                      {ai!.name} is explaining {all.label}…
                    </span>
                    <button className="digest__button" onClick={() => stopBatch(batchKey)} disabled={all.stopping}>
                      {all.stopping ? "Stopping after this one…" : "Stop after this one"}
                    </button>
                  </>
                ) : (
                  <button className="pc__explain-all" onClick={explainAll}>
                    {left.length === parts.length ? `Explain all ${left.length} with ${ai!.name}` : `Explain the other ${left.length} with ${ai!.name}`}
                  </button>
                )}
              </div>
            )}
            {all?.error && <p className="digest__error">{all.error}</p>}
          </>
        )}
      </section>

      <div className="digest__list">
        {data?.files.map((file) => (
          <FileCard
            key={file.path}
            file={file}
            ai={ai}
            onSignedIn={onSignedIn}
            explanationOf={(unit) => explanationOf(file.path, unit)}
            runOf={(unit) => job(keyOf(file.path, unit.name))}
            explain={(unit) => {
              clear(keyOf(file.path, unit.name));
              return start(keyOf(file.path, unit.name), () => explain(id, file.path, unit.name)).then(() => {});
            }}
          />
        ))}
      </div>
    </div>
  );
}

function FileCard({ file, ai, onSignedIn, explanationOf, runOf, explain }: {
  file: DigestChangeFile;
  ai: AiStatus | null;
  onSignedIn: () => void;
  explanationOf: (unit: DigestUnit) => FunctionExplanation | null;
  runOf: (unit: DigestUnit) => ReturnType<typeof job>;
  explain: (unit: DigestUnit) => Promise<void>;
}) {
  return (
    <article className="card digest__change pc__file" id={anchor(file.path)}>
      <header className="digest__file-head">
        <code className="digest__path">{file.path}</code>
        {file.status !== "modified" && (
          <span className={`pill ${file.status === "added" ? "pill--add" : "pill--del"}`}>{file.status === "added" ? "new" : "deleted"}</span>
        )}
        {file.watched && (
          <span className="digest__watched" title="This file changed while the prompt ran, but not through the AI tool's own edit tools.">
            changed during this prompt
          </span>
        )}
        <b className="digest__add">+{file.additions}</b>
        <b className="digest__del">−{file.deletions}</b>
      </header>
      {file.flags.map((flag) => (
        <div key={flag.kind} className="digest__why">
          <strong>{flag.label}:</strong> {flag.reason}
        </div>
      ))}
      {file.units.map((unit) => {
        const run = runOf(unit);
        return (
          <Part
            key={unit.name}
            path={file.path}
            unit={unit}
            ai={ai}
            onSignedIn={onSignedIn}
            explanation={explanationOf(unit)}
            busy={run?.state === "working"}
            problem={run?.state === "failed" ? run.error : null}
            explain={() => explain(unit)}
          />
        );
      })}
    </article>
  );
}

function Part(props: {
  path: string;
  unit: DigestUnit;
  ai: AiStatus | null;
  onSignedIn: () => void;
  explanation: FunctionExplanation | null;
  busy: boolean;
  problem: string | null;
  explain: () => Promise<void>;
}) {
  const { unit } = props;
  const lines = unit.diff ? unit.diff.split("\n").length : 0;
  const [showCode, setShowCode] = useState(lines <= OPEN_LINES);
  const badge = BADGE[unit.change];
  return (
    <section className={`fn fn--${unit.change} pc__part`} id={anchor(`${props.path}\n${unit.name}`)}>
      <header className="fn__header">
        <span className={`fn__badge fn__badge--${badge.tone}`}>{badge.label}</span>
        <span className="fn__kind">{unit.kind === "file" ? "Whole file" : "Function"}</span>
        <h4 className="fn__name">{unit.name}</h4>
      </header>
      <Explanation
        explanation={props.explanation}
        ai={props.ai}
        onSignedIn={props.onSignedIn}
        explain={props.explain}
        busy={props.busy}
        problem={props.problem}
      />
      {lines > 0 && (
        <>
          <div className="fn__code-head">
            <button className="fns__link" onClick={() => setShowCode((open) => !open)}>
              {showCode ? "Hide the lines" : `Show the ${lines} lines this prompt changed`}
            </button>
          </div>
          {showCode && <DiffBlock diff={unit.diff} />}
        </>
      )}
    </section>
  );
}

// An id for a file's or a part's card, safe in a URL fragment.
function anchor(key: string) {
  return `pc-${key.replace(/[^\w-]+/g, "-")}`;
}

// Scrolls inside the page without touching the address bar, which names the screen.
function jump(event: MouseEvent, key: string) {
  event.preventDefault();
  document.getElementById(anchor(key))?.scrollIntoView({ behavior: "smooth", block: "start" });
}
