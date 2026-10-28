import { useEffect, useMemo, useState } from "react";
import type { AiStatus, FileExplanation, KnowledgeTransfer, KtFile, ProjectExplanation, Summary as SummaryData } from "../../api/types";
import { languageColor } from "../ProjectMap/ProjectMap";
import ClaudeSetup from "../ClaudeSignIn/ClaudeSetup";
import { batch, clear, job, result, start, startBatch, stopBatch, useJobs } from "../../lib/aiJobs";
import "./Summary.css";

// The whole project on one screen: what it is, how it works, what it's built with, its
// parts, how to run it and who has worked on it. The facts come from the project's own
// files and git history; the plain-English description is the picked AI's (Settings), on request.
// The Full KT tab is the knowledge transfer: every file explained, function by function.

type Props = {
  summary: SummaryData;
  // The project and branch, naming the explanations that run in the background: they keep
  // going when the page is left, and show when it's opened again.
  scope: string;
  ai: AiStatus | null;
  // fresh: write it again, from the file notes written since.
  explain: (fresh?: boolean) => Promise<ProjectExplanation>;
  loadKt: () => Promise<KnowledgeTransfer>;
  explainFile: (path: string) => Promise<FileExplanation>;
  onSignedIn: () => void;
  onOpenMap: () => void;
};

export default function Summary(props: Props) {
  const [tab, setTab] = useState<"overview" | "kt">("overview");
  useJobs();
  // Shared by both tabs, so a description written on one shows on the other: the newest
  // rewrite, else one asked for here, else the one saved with the summary.
  const saved = props.summary.explanation?.overview?.trim() ? props.summary.explanation : null;
  const explanation = result<ProjectExplanation>(`project-fresh:${props.scope}`) ?? result<ProjectExplanation>(`project:${props.scope}`) ?? saved;
  return (
    <div className="summary-page">
      <div className="segmented summary-page__tabs" role="tablist" aria-label="Project">
        <button role="tab" aria-selected={tab === "overview"} className={tab === "overview" ? "is-on" : ""} onClick={() => setTab("overview")}>
          Overview
        </button>
        <button role="tab" aria-selected={tab === "kt"} className={tab === "kt" ? "is-on" : ""} onClick={() => setTab("kt")}>
          Full KT
        </button>
      </div>
      {tab === "overview" ? (
        <Overview {...props} explanation={explanation} onOpenKt={() => setTab("kt")} />
      ) : (
        <FullKt {...props} explanation={explanation} />
      )}
    </div>
  );
}

type Shared = Props & {
  explanation: ProjectExplanation | null;
};

function Overview({ summary, scope, ai, explain, onSignedIn, onOpenMap, explanation, onOpenKt }: Shared & { onOpenKt: () => void }) {
  const describing = job(`project:${scope}`);
  const state = describing?.state === "working" ? "working" : describing?.state === "failed" ? describing.error : "idle";
  const history = summary.history;
  const languageFiles = summary.languages.reduce((sum, l) => sum + l.files, 0);
  const names = new Map(summary.parts.map((part) => [part.id, part.name]));
  const partWhat = new Map((explanation?.parts ?? []).map((part) => [part.name, part.what]));

  const run = () => {
    clear(`project:${scope}`);
    // An answer with no overview would leave the box empty: treated as a failure, so it can be asked again.
    start(`project:${scope}`, () =>
      explain().then((answer) => {
        if (!answer.overview?.trim()) throw new Error("The AI's answer left out the description. Try again, or pick another model in Settings.");
        return answer;
      }),
    ).catch(() => {});
  };

  return (
    <div className="summary">
      <section className="card summary__hero">
        <span className="summary__eyebrow">Project</span>
        <h2 className="summary__name">{summary.name}</h2>
        {summary.description && <p className="summary__description">{summary.description}</p>}
        {languageFiles > 0 && (
          <div className="summary__languages">
            <div className="summary__language-bar">
              {summary.languages.map((l) => (
                <span key={l.name} style={{ flex: l.files, background: languageColor(l.name) }} title={`${l.name}: ${l.files} files`} />
              ))}
            </div>
            <ul>
              {summary.languages.map((l) => (
                <li key={l.name}>
                  <i style={{ background: languageColor(l.name) }} />
                  {l.name} {Math.round((l.files / languageFiles) * 100)}%
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="summary__about">
          {explanation ? (
            <>
              <span className="summary__ai-label">About this project, in plain English</span>
              <p className="summary__overview">{explanation.overview}</p>
              {explanation.state && <p className="summary__state">{explanation.state}</p>}
              <button className="summary__link" onClick={onOpenKt}>
                Every file and function, explained ›
              </button>
            </>
          ) : summary.readme?.intro ? (
            <>
              <span className="summary__ai-label summary__ai-label--plain">From the readme</span>
              <p className="summary__overview">{summary.readme.intro}</p>
            </>
          ) : (
            <p className="summary__muted">
              This project has no readme that says what it is
              {summary.revision === "(not committed yet)" ? ", and nothing is committed yet: this is read from its folder." : "."}
            </p>
          )}
          {!explanation && ai && (!ai.available || ai.signed_in === false) && <ClaudeSetup ai={ai} onRefresh={onSignedIn} />}
          {!explanation && ai?.available && ai.signed_in !== false && (
            <div className="summary__ask">
              <button onClick={run} disabled={state === "working"}>
                {state === "working" ? `${ai.name} is reading the project…` : `Describe it with ${ai.name}`}
              </button>
              <span>
                {state !== "idle" && state !== "working"
                  ? state
                  : "A plain-English overview, how the parts work together, and what each part is for."}
              </span>
            </div>
          )}
        </div>
      </section>

      <section className="card summary__stats" aria-label="Numbers">
        <Stat label="Files" value={summary.files.toLocaleString()} />
        <Stat label="Size" value={bytes(summary.bytes)} />
        <Stat label="Commits" value={history.commits.toLocaleString()} />
        <Stat label="People" value={String(history.people.length)} />
        <Stat label="Branches" value={String(history.branches)} />
        <Stat label="Started" value={history.first ? ago(history.first) : "—"} />
        <div className="summary__activity">
          <span className="summary__stat-label">Commits per week, last 12 weeks</span>
          <div className="summary__weeks" role="img" aria-label={`Commits per week: ${history.weeks.join(", ")}`}>
            {history.weeks.map((count, i) => (
              <span
                key={i}
                style={{ height: `${(count / Math.max(1, ...history.weeks)) * 100}%` }}
                title={`${count} commit${count === 1 ? "" : "s"}, ${12 - i} week${12 - i === 1 ? "" : "s"} ago`}
              />
            ))}
          </div>
          <span className="summary__muted">Last change {history.last ? ago(history.last) : "never"}</span>
        </div>
      </section>

      <section className="card summary__how">
        <h3>How it works</h3>
        {explanation?.how_it_works.length ? (
          <ol className="summary__steps">
            {explanation.how_it_works.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        ) : summary.links.length > 0 ? (
          <>
            <p className="summary__muted">From the imports in the code:</p>
            <ul className="summary__links">
              {summary.links.slice(0, 8).map((link) => (
                <li key={`${link.source}>${link.target}`}>
                  <strong>{names.get(link.source)}</strong> uses <strong>{names.get(link.target)}</strong>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="summary__muted">DevDash found no code links between the parts.</p>
        )}
        {explanation?.flows?.map((flow) => (
          <div key={flow.name} className="summary__flow">
            <h4>{flow.name}</h4>
            <ol className="summary__steps">
              {flow.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        ))}
        {explanation?.start_here?.length ? (
          <>
            <h4>Read these first</h4>
            <ul className="summary__files summary__start">
              {explanation.start_here.map((file) => (
                <li key={file.path}>
                  <code>{file.path}</code>
                  <span>{file.why}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {summary.entry_points.length > 0 && (
          <>
            <h4>Where it starts</h4>
            <ul className="summary__files">
              {summary.entry_points.map((path) => (
                <li key={path}>
                  <code>{path}</code>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="card summary__parts">
        <header>
          <h3>Parts</h3>
          <button className="summary__link" onClick={onOpenMap}>
            Map ›
          </button>
        </header>
        <ul>
          {summary.parts.map((part) => (
            <li key={part.id}>
              <div>
                <strong>{part.name}</strong>
                <span>{partWhat.get(part.name) ?? part.role ?? (part.languages[0] ? `Mostly ${part.languages[0].name}` : "Files")}</span>
              </div>
              <em>
                {part.files} file{part.files === 1 ? "" : "s"}
              </em>
            </li>
          ))}
        </ul>
      </section>

      <section className="card summary__tech">
        <h3>Built with</h3>
        {summary.tech.length === 0 ? (
          <p className="summary__muted">No well-known tools found in its package files.</p>
        ) : (
          <ul>
            {summary.tech.map((tech) => (
              <li key={tech.name}>
                <code>{tech.name}</code>
                <span>{tech.what}</span>
              </li>
            ))}
          </ul>
        )}
        {summary.other_dependencies > 0 && (
          <p className="summary__muted">
            And {summary.other_dependencies} other package{summary.other_dependencies === 1 ? "" : "s"}.
          </p>
        )}
        {summary.run.length > 0 && (
          <>
            <h4>Commands</h4>
            <ul className="summary__commands">
              {summary.run.map((command) => (
                <li key={`${command.where}:${command.name}`} title={command.where}>
                  <code>{command.name}</code>
                  <span>{command.command}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {history.people.length > 0 && (
          <>
            <h4>People</h4>
            <ul className="summary__people">
              {history.people.map((person) => (
                <li key={person.name}>
                  <span className="summary__avatar">{person.name.slice(0, 1).toUpperCase()}</span>
                  {person.name}
                  <em>{person.commits}</em>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

// The knowledge transfer: the project's overview, how its main jobs flow through the files,
// what to read first, and every file with its purpose and each of its functions. Files are
// explained one at a time, so even a small local model only ever reads one file; the notes
// are saved, and only a changed file is asked about again.
function FullKt({ summary, scope, ai, explain, loadKt, explainFile, onSignedIn, explanation }: Shared) {
  const [loaded, setKt] = useState<KnowledgeTransfer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const fileKey = (path: string) => `file:${scope}:${path}`;
  const freshKey = `project-fresh:${scope}`;
  const batchKey = `kt:${scope}`;
  const files = batch(batchKey);
  const rewriting = job(freshKey)?.state === "working";
  // A file being read on its own, outside Explain all.
  const single = loaded?.files.find((f) => job(fileKey(f.path))?.state === "working")?.path ?? null;
  const running: "files" | "overview" | null = rewriting ? "overview" : files?.running || single ? "files" : null;
  const current = files?.running && files.current !== freshKey ? files.label : single;
  const failed = loaded?.files.map((f) => job(fileKey(f.path))).find((j) => j?.state === "failed");
  const problem = error ?? files?.error ?? (failed?.state === "failed" ? failed.error : null);

  useEffect(() => {
    let stale = false;
    loadKt().then(
      (result) => !stale && setKt(result),
      (e: Error) => !stale && setError(e.message),
    );
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Notes written while the page was off screen, or from Changes, show here too.
  const merged = loaded?.files.map((f) => ({ ...f, explanation: f.explanation ?? result<FileExplanation>(fileKey(f.path)) ?? null }));
  const kt: KnowledgeTransfer | null = merged ? { files: merged, explained: merged.filter((f) => f.explanation).length } : null;

  const groups = useMemo(() => {
    const words = filter.trim().toLowerCase();
    const shown = (kt?.files ?? []).filter(
      (f) => !words || f.path.toLowerCase().includes(words) || f.explanation?.purpose.toLowerCase().includes(words),
    );
    const byPart = new Map<string, KtFile[]>();
    for (const file of shown) byPart.set(file.part, [...(byPart.get(file.part) ?? []), file]);
    return [...byPart.entries()];
  }, [kt, filter]);

  if (error && !kt) return <p className="summary__muted">{error}</p>;
  if (!kt) return <p className="summary__muted">Listing the project's files…</p>;

  const ready = ai?.available && ai.signed_in !== false;
  const left = kt.files.filter((f) => !f.explanation);

  const explainOne = (path: string) => {
    setError(null);
    clear(fileKey(path));
    start(fileKey(path), () => explainFile(path)).then(
      () => setOpen((was) => new Set(was).add(path)),
      () => {},
    );
  };

  // One file at a time: each is its own AI run, and notes show as they come. The overview
  // is rewritten from the notes once the files are done.
  const explainAll = () => {
    setError(null);
    startBatch(batchKey, [
      ...left.map((file) => ({ key: fileKey(file.path), label: file.path, run: () => explainFile(file.path) })),
      { key: freshKey, label: "The overview", run: () => explain(true), again: true },
    ]);
  };

  const rewriteOverview = () => {
    setError(null);
    start(freshKey, () => explain(true), true).catch((e: Error) => setError(e.message));
  };

  const toggle = (path: string) =>
    setOpen((was) => {
      const next = new Set(was);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  return (
    <div className="kt">
      <section className="card kt__head">
        <div>
          <span className="summary__eyebrow">Knowledge transfer</span>
          <h2 className="summary__name">{summary.name}</h2>
          <p className="summary__muted">
            {kt.explained} of {kt.files.length} file{kt.files.length === 1 ? "" : "s"} explained
            {running === "files" && current ? `. Reading ${current}…` : ""}
            {running === "overview" ? ". Writing the overview from the file notes…" : ""}
          </p>
          <div className="kt__progress" role="progressbar" aria-valuemin={0} aria-valuemax={kt.files.length} aria-valuenow={kt.explained}>
            <span style={{ width: `${kt.files.length ? (kt.explained / kt.files.length) * 100 : 0}%` }} />
          </div>
        </div>
        <div className="kt__actions">
          {ai && !ready && <ClaudeSetup ai={ai} onRefresh={onSignedIn} />}
          {ready && running === "files" && files?.running && (
            <button className="kt__button kt__button--quiet" onClick={() => stopBatch(batchKey)} disabled={files?.stopping}>
              {files?.stopping ? "Stopping after this file…" : "Stop after this file"}
            </button>
          )}
          {ready && running !== "files" && left.length > 0 && (
            <button className="kt__button" onClick={explainAll} disabled={running !== null}>
              {left.length === 1
                ? `Explain the last file with ${ai!.name}`
                : `Explain ${left.length === kt.files.length ? "all" : "the remaining"} ${left.length} files with ${ai!.name}`}
            </button>
          )}
          {ready && kt.explained > 0 && (
            <button className="kt__button kt__button--quiet" onClick={rewriteOverview} disabled={running !== null}>
              {explanation ? "Rewrite the overview" : "Write the overview"}
            </button>
          )}
          <button className="kt__button kt__button--quiet" onClick={() => download(summary, explanation, kt)}>
            Download as Markdown
          </button>
        </div>
        {problem && <p className="kt__error">{problem}</p>}
      </section>

      {explanation && (
        <section className="card kt__overview">
          <h3>What it is</h3>
          <p className="summary__overview">{explanation.overview}</p>
          {explanation.state && <p className="summary__state">{explanation.state}</p>}
          {explanation.start_here?.length ? (
            <>
              <h4>Read these first</h4>
              <ol className="summary__steps">
                {explanation.start_here.map((f) => (
                  <li key={f.path}>
                    <code>{f.path}</code> {f.why}
                  </li>
                ))}
              </ol>
            </>
          ) : null}
          {explanation.how_it_works.length > 0 && (
            <>
              <h4>How it works</h4>
              <ol className="summary__steps">
                {explanation.how_it_works.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </>
          )}
          {explanation.flows?.map((flow) => (
            <div key={flow.name}>
              <h4>{flow.name}</h4>
              <ol className="summary__steps">
                {flow.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      )}

      <section className="card kt__files">
        <header className="kt__files-head">
          <h3>Every file</h3>
          <input
            className="kt__filter"
            type="search"
            placeholder="Find a file or what it does"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Find a file"
          />
        </header>
        {kt.files.length === 0 && <p className="summary__muted">No text files to explain.</p>}
        {groups.map(([part, files]) => (
          <div key={part} className="kt__part">
            <h4>
              {part} <em>{files.length}</em>
            </h4>
            <ul>
              {files.map((file) => (
                <KtRow
                  key={file.path}
                  file={file}
                  open={open.has(file.path)}
                  onToggle={() => toggle(file.path)}
                  busy={current === file.path}
                  onExplain={ready && running === null && current === null ? () => explainOne(file.path) : undefined}
                />
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}

function KtRow({ file, open, onToggle, busy, onExplain }: {
  file: KtFile;
  open: boolean;
  onToggle: () => void;
  busy: boolean;
  onExplain?: () => void;
}) {
  const note = file.explanation;
  return (
    <li className={`kt__file${note ? " kt__file--done" : ""}`}>
      <button className="kt__file-head" onClick={onToggle} aria-expanded={open} disabled={!note}>
        <code>{file.path}</code>
        <span className="kt__file-purpose">{note ? note.purpose : busy ? "Reading…" : "Not explained yet"}</span>
        <span className="kt__file-meta">
          {file.language}
          {note && note.functions.length > 0 ? ` · ${note.functions.length} function${note.functions.length === 1 ? "" : "s"}` : ""}
        </span>
      </button>
      {!note && onExplain && !busy && (
        <button className="kt__explain" onClick={onExplain}>
          Explain
        </button>
      )}
      {note && open && (
        <div className="kt__note">
          {note.functions.length > 0 && (
            <dl className="kt__functions">
              {note.functions.map((fn) => (
                <div key={fn.name}>
                  <dt>
                    <code>{fn.name}</code>
                  </dt>
                  <dd>{fn.what}</dd>
                </div>
              ))}
            </dl>
          )}
          {note.connects && (
            <p>
              <strong>Connects to:</strong> {note.connects}
            </p>
          )}
          {note.notes.length > 0 && (
            <ul className="kt__watch">
              {note.notes.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

export type FileNoteProps = {
  path: string;
  note: FileExplanation | null;
  ai: AiStatus | null;
  onSignedIn: () => void;
  explain: () => void;
  busy: boolean;
  problem: string | null;
};

// What one file is for, from the knowledge transfer, shown where the file itself is shown
// (Changes, a prompt's changes), with a button to ask for it when it isn't written yet.
export function FileNote({ path, note, ai, onSignedIn, explain, busy, problem }: FileNoteProps) {
  const [open, setOpen] = useState(false);
  const ready = ai?.available && ai.signed_in !== false;
  const name = path.slice(path.lastIndexOf("/") + 1);
  if (!note) {
    if (!ai) return null;
    return (
      <section className="filenote filenote--empty">
        <span className="filenote__label">About {name}</span>
        {ready ? (
          <div className="filenote__ask">
            <button onClick={explain} disabled={busy}>
              {busy ? `${ai.name} is reading the file…` : `What is this file for? Ask ${ai.name}`}
            </button>
            <span>{problem ?? "Its purpose, what each function does, and what it connects to. Saved in the project's Full KT."}</span>
          </div>
        ) : (
          <ClaudeSetup ai={ai} onRefresh={onSignedIn} />
        )}
      </section>
    );
  }
  const more = note.functions.length > 0 || note.connects || note.notes.length > 0;
  return (
    <section className="filenote">
      <span className="filenote__label">About {name}</span>
      <p className="filenote__purpose">{note.purpose}</p>
      {more && (
        <button className="filenote__more" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? "Less" : note.functions.length > 1 ? `Each of its ${note.functions.length} functions, and what it connects to` : note.functions.length === 1 ? "Its function, and what it connects to" : "What it connects to"}
        </button>
      )}
      {open && (
        <div className="kt__note">
          {note.functions.length > 0 && (
            <dl className="kt__functions">
              {note.functions.map((fn) => (
                <div key={fn.name}>
                  <dt>
                    <code>{fn.name}</code>
                  </dt>
                  <dd>{fn.what}</dd>
                </div>
              ))}
            </dl>
          )}
          {note.connects && (
            <p>
              <strong>Connects to:</strong> {note.connects}
            </p>
          )}
          {note.notes.length > 0 && (
            <ul className="kt__watch">
              {note.notes.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

// The whole KT as one Markdown file, to keep in the repo or hand to someone.
function download(summary: SummaryData, explanation: ProjectExplanation | null, kt: KnowledgeTransfer) {
  const lines: string[] = [`# ${summary.name}: knowledge transfer`, ""];
  if (summary.description) lines.push(summary.description, "");
  if (explanation) {
    lines.push("## What it is", "", explanation.overview, "");
    if (explanation.state) lines.push(explanation.state, "");
    if (explanation.start_here?.length) {
      lines.push("## Read these first", "", ...explanation.start_here.map((f, i) => `${i + 1}. \`${f.path}\`: ${f.why}`), "");
    }
    if (explanation.how_it_works.length) {
      lines.push("## How it works", "", ...explanation.how_it_works.map((s, i) => `${i + 1}. ${s}`), "");
    }
    for (const flow of explanation.flows ?? []) lines.push(`### ${flow.name}`, "", ...flow.steps.map((s, i) => `${i + 1}. ${s}`), "");
    if (explanation.parts.length) lines.push("## Parts", "", ...explanation.parts.map((p) => `- **${p.name}**: ${p.what}`), "");
  }
  if (summary.tech.length) lines.push("## Built with", "", ...summary.tech.map((t) => `- \`${t.name}\`: ${t.what}`), "");
  if (summary.run.length) lines.push("## Commands", "", ...summary.run.map((r) => `- \`${r.name}\` (${r.where}): \`${r.command}\``), "");
  lines.push("## Files", "");
  let part = "";
  for (const file of kt.files) {
    if (file.part !== part) {
      part = file.part;
      lines.push(`### ${part}`, "");
    }
    const note = file.explanation;
    lines.push(`#### \`${file.path}\``, "", note ? note.purpose : "_Not explained yet._", "");
    if (note) {
      if (note.functions.length) lines.push(...note.functions.map((fn) => `- \`${fn.name}\`: ${fn.what}`), "");
      if (note.connects) lines.push(`Connects to: ${note.connects}`, "");
      if (note.notes.length) lines.push("Watch out for:", ...note.notes.map((n) => `- ${n}`), "");
    }
  }
  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${summary.name.replace(/[^\w.-]+/g, "-")}-KT.md`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary__stat">
      <span className="summary__stat-label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function ago(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  if (days < 60) return `${days} days ago`;
  if (days < 730) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}
