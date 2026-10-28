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
  const { file: fileKey, fresh: freshKey, batch: batchKey } = ktKeys(scope);
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
  const kt: KnowledgeTransfer | null = loaded ? withNewNotes(scope, loaded) : null;

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
    writeKt(scope, kt, explain, explainFile);
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
          <button className="kt__button kt__button--quiet" onClick={() => downloadKt(summary, explanation, kt)}>
            Download as PDF
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

// The KT's runs, named the same wherever they start (here, or from Ask), so each screen
// shows the other's progress and a file is never explained twice at once.
export function ktKeys(scope: string) {
  return { file: (path: string) => `file:${scope}:${path}`, fresh: `project-fresh:${scope}`, batch: `kt:${scope}` };
}

// The notes kept with the files, plus any written since they were read.
export function withNewNotes(scope: string, kt: KnowledgeTransfer): KnowledgeTransfer {
  const keys = ktKeys(scope);
  const files = kt.files.map((f) => ({ ...f, explanation: f.explanation ?? result<FileExplanation>(keys.file(f.path)) ?? null }));
  return { files, explained: files.filter((f) => f.explanation).length };
}

// Explains the files without notes, one at a time, then rewrites the overview from the notes.
export function writeKt(scope: string, kt: KnowledgeTransfer, explain: (fresh?: boolean) => Promise<ProjectExplanation>, explainFile: (path: string) => Promise<FileExplanation>) {
  const keys = ktKeys(scope);
  return startBatch(keys.batch, [
    ...kt.files.filter((f) => !f.explanation).map((file) => ({ key: keys.file(file.path), label: file.path, run: () => explainFile(file.path) })),
    { key: keys.fresh, label: "The overview", run: () => explain(true), again: true },
  ]);
}

// The whole KT as a PDF, to keep or hand to someone: a cover block, the overview, how it
// works, what it's built with, then every file grouped by part. Written by hand with the
// PDF's own fonts (Helvetica and Courier), so it needs no library and no print dialog.
export function downloadKt(summary: SummaryData, explanation: ProjectExplanation | null, kt: KnowledgeTransfer) {
  const pdf = new KtPdf(`${summary.name} · Knowledge transfer`);
  pdf.title(summary.name, "Knowledge transfer");
  const date = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  pdf.para(`Written by DevDash on ${date}. ${kt.explained} of ${kt.files.length} files explained.`, { size: 9.5, color: MUTED });
  if (summary.description) pdf.para(summary.description, { gap: 4 });
  if (explanation) {
    pdf.heading("What it is");
    pdf.para(explanation.overview);
    if (explanation.state) pdf.para(explanation.state, { font: "I", color: MUTED });
    if (explanation.start_here?.length) {
      pdf.heading("Read these first");
      explanation.start_here.forEach((f, i) => pdf.para(`\`${f.path}\` ${f.why}`, { bullet: `${i + 1}.` }));
    }
    if (explanation.how_it_works.length) {
      pdf.heading("How it works");
      explanation.how_it_works.forEach((step, i) => pdf.para(step, { bullet: `${i + 1}.` }));
    }
    for (const flow of explanation.flows ?? []) {
      pdf.subheading(flow.name);
      flow.steps.forEach((step, i) => pdf.para(step, { bullet: `${i + 1}.` }));
    }
    if (explanation.parts.length) {
      pdf.heading("Parts");
      for (const part of explanation.parts) pdf.para(`**${part.name}** ${part.what}`, { bullet: "•" });
    }
  }
  if (summary.tech.length) {
    pdf.heading("Built with");
    for (const t of summary.tech) pdf.para(`\`${t.name}\` ${t.what}`, { bullet: "•" });
  }
  if (summary.run.length) {
    pdf.heading("Commands");
    for (const r of summary.run) pdf.para(`**${r.name}** (${r.where}): \`${r.command}\``, { bullet: "•" });
  }
  pdf.heading("Files");
  let part = "";
  for (const file of kt.files) {
    if (file.part !== part) {
      part = file.part;
      pdf.subheading(part);
    }
    const note = file.explanation;
    pdf.file(file.path);
    if (!note) {
      pdf.para("Not explained yet.", { font: "I", color: MUTED });
      continue;
    }
    pdf.para(note.purpose);
    for (const fn of note.functions) pdf.para(`\`${fn.name}\` ${fn.what}`, { bullet: "•" });
    if (note.connects) pdf.para(`**Connects to:** ${note.connects}`);
    if (note.notes.length) {
      pdf.para("**Watch out for**", { gap: 2 });
      for (const n of note.notes) pdf.para(n, { bullet: "•" });
    }
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(pdf.blob());
  link.download = `${summary.name.replace(/[^\w.-]+/g, "-")}-KT.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

type Font = "R" | "B" | "I" | "M" | "MB";
type Rgb = [number, number, number];
const INK: Rgb = [0.13, 0.12, 0.11];
const MUTED: Rgb = [0.42, 0.39, 0.36];
const ACCENT: Rgb = [0.04, 0.37, 0.35];
const CODE: Rgb = [0.01, 0.37, 0.56];
const PAGE = { w: 595.28, h: 841.89, x: 56, top: 64, bottom: 64 };
const FONTS: Record<Font, string> = { R: "Helvetica", B: "Helvetica-Bold", I: "Helvetica-Oblique", M: "Courier", MB: "Courier-Bold" };

// The PDF fonts' own encoding (WinAnsi): the typographic marks have their own codes; other
// characters outside Latin-1 fall back to a near spelling.
const WIN_ANSI: Record<string, number> = { "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "…": 0x85, "€": 0x80 };
const NEAR: Record<string, string> = { "→": "->", "←": "<-", "≤": "<=", "≥": ">=", " ": " " };

function encode(text: string) {
  let hex = "";
  for (const ch of text) {
    const code = WIN_ANSI[ch] ?? ch.codePointAt(0)!;
    if (code < 256 && !(code >= 0x7f && code < 0xa0 && !Object.values(WIN_ANSI).includes(code))) hex += code.toString(16).padStart(2, "0");
    else for (const c of NEAR[ch] ?? "?") hex += c.charCodeAt(0).toString(16).padStart(2, "0");
  }
  return `<${hex}>`;
}

// Text widths, measured once per font: Arial (or Liberation Sans, where it stands in) has
// Helvetica's metrics, and Courier is 0.6 of the size for every character.
let ruler: CanvasRenderingContext2D | null = null;
function width(text: string, font: Font, size: number) {
  if (font === "M" || font === "MB") return [...text].length * 0.6 * size;
  ruler ??= document.createElement("canvas").getContext("2d");
  if (!ruler) return text.length * 0.5 * size;
  ruler.font = `${font === "B" ? "bold " : font === "I" ? "italic " : ""}100px Helvetica, Arial, "Liberation Sans", sans-serif`;
  return (ruler.measureText(text).width / 100) * size;
}

// "**bold**" and "`code`" inside a line become runs in their own fonts.
function runs(text: string, base: Font): { text: string; font: Font }[] {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/)
    .filter(Boolean)
    .map((part) =>
      part.startsWith("**") && part.endsWith("**") && part.length > 4
        ? { text: part.slice(2, -2), font: "B" as Font }
        : part.startsWith("`") && part.endsWith("`") && part.length > 2
          ? { text: part.slice(1, -1), font: "M" as Font }
          : { text: part, font: base },
    );
}

type Para = { size?: number; font?: Font; color?: Rgb; bullet?: string; gap?: number };

class KtPdf {
  private pages: string[][] = [];
  private y = 0;
  constructor(private footer: string) {
    this.page();
  }

  private page() {
    this.pages.push([]);
    this.y = PAGE.h - PAGE.top;
  }

  private get ops() {
    return this.pages[this.pages.length - 1];
  }

  // Starts a new page unless `height` still fits on this one.
  private room(height: number) {
    if (this.y - height < PAGE.bottom) this.page();
  }

  private put(text: string, x: number, y: number, font: Font, size: number, color: Rgb) {
    this.ops.push(`BT /${font} ${size} Tf ${color.map((c) => c.toFixed(3)).join(" ")} rg ${x.toFixed(2)} ${y.toFixed(2)} Td ${encode(text)} Tj ET`);
  }

  private rect(x: number, y: number, w: number, h: number, color: Rgb) {
    this.ops.push(`${color.map((c) => c.toFixed(3)).join(" ")} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  }

  title(name: string, kind: string) {
    this.rect(PAGE.x, this.y - 2, 40, 4, ACCENT);
    this.y -= 30;
    this.put(kind.toUpperCase(), PAGE.x, this.y, "B", 10, ACCENT);
    this.y -= 34;
    for (const line of this.wrap(runs(name, "B"), 26, PAGE.w - 2 * PAGE.x)) {
      this.line(line, PAGE.x, 26, INK);
      this.y -= 32;
    }
    this.y += 10;
  }

  heading(text: string) {
    this.room(70);
    this.y -= 18;
    this.put(text, PAGE.x, this.y, "B", 15, ACCENT);
    this.y -= 8;
    this.rect(PAGE.x, this.y, PAGE.w - 2 * PAGE.x, 0.8, [0.85, 0.82, 0.78]);
    this.y -= 16;
  }

  subheading(text: string) {
    this.room(56);
    this.y -= 8;
    this.put(text, PAGE.x, this.y, "B", 12, INK);
    this.y -= 16;
  }

  // A file's path on a light band, so each file starts where the eye can find it.
  file(path: string) {
    this.room(52);
    this.y -= 6;
    const lines = this.wrap([{ text: path, font: "MB" }], 9.5, PAGE.w - 2 * PAGE.x - 16);
    const h = lines.length * 13 + 8;
    this.rect(PAGE.x, this.y - h + 11, PAGE.w - 2 * PAGE.x, h, [0.94, 0.92, 0.89]);
    for (const line of lines) {
      this.line(line, PAGE.x + 8, 9.5, CODE);
      this.y -= 13;
    }
    this.y -= 9;
  }

  para(text: string, { size = 10.5, font = "R", color = INK, bullet, gap = 6 }: Para = {}) {
    const indent = bullet ? 18 : 0;
    const leading = size * 1.45;
    const lines = this.wrap(runs(text, font), size, PAGE.w - 2 * PAGE.x - indent);
    lines.forEach((line, i) => {
      this.room(leading);
      if (bullet && i === 0) this.put(bullet, PAGE.x + 4, this.y, bullet === "•" ? "R" : "B", size, bullet === "•" ? ACCENT : MUTED);
      this.line(line, PAGE.x + indent, size, color);
      this.y -= leading;
    });
    this.y -= gap - (leading - size * 1.2);
  }

  private line(words: { text: string; font: Font; x: number }[], left: number, size: number, color: Rgb) {
    for (const w of words) {
      const mono = w.font === "M" || w.font === "MB";
      this.put(w.text, left + w.x, this.y, w.font, mono ? size * 0.92 : size, mono && w.font === "M" ? CODE : color);
    }
  }

  // Breaks runs into lines that fit `max`; a word too long for a line (a long path) is cut.
  private wrap(parts: { text: string; font: Font }[], size: number, max: number) {
    const lines: { text: string; font: Font; x: number }[][] = [[]];
    let x = 0;
    const space = width(" ", "R", size);
    for (const part of parts) {
      const mono = part.font === "M" || part.font === "MB";
      const fit = mono ? size * 0.92 : size;
      for (const token of part.text.split(/(\s+)/)) {
        if (!token) continue;
        if (/^\s+$/.test(token)) {
          if (x > 0) x += space;
          continue;
        }
        let rest = token;
        while (rest) {
          let piece = rest;
          let w = width(piece, part.font, fit);
          if (x + w > max && x > 0) {
            lines.push([]);
            x = 0;
          }
          while (w > max && piece.length > 1) {
            piece = piece.slice(0, Math.max(1, Math.floor((piece.length * max) / w)));
            w = width(piece, part.font, fit);
          }
          lines[lines.length - 1].push({ text: piece, font: part.font, x });
          x += w;
          rest = rest.slice(piece.length);
          if (rest) {
            lines.push([]);
            x = 0;
          }
        }
      }
    }
    return lines.filter((l) => l.length);
  }

  blob() {
    const total = this.pages.length;
    const objects: string[] = [];
    const fontIds: Record<string, number> = {};
    // 1: catalog, 2: pages, then the fonts, then a content stream and a page per page.
    Object.entries(FONTS).forEach(([key, name], i) => {
      fontIds[key] = 3 + i;
      objects[3 + i] = `<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`;
    });
    const fonts = Object.entries(fontIds)
      .map(([key, id]) => `/${key} ${id} 0 R`)
      .join(" ");
    const first = 3 + Object.keys(FONTS).length;
    const kids: string[] = [];
    this.pages.forEach((ops, i) => {
      const footer = [
        `${MUTED.join(" ")} rg`,
        `BT /R 8.5 Tf ${PAGE.x} 34 Td ${encode(this.footer)} Tj ET`,
        `BT /R 8.5 Tf ${(PAGE.w - PAGE.x - width(`${i + 1} / ${total}`, "R", 8.5)).toFixed(2)} 34 Td ${encode(`${i + 1} / ${total}`)} Tj ET`,
      ];
      const stream = [...ops, ...footer].join("\n");
      const content = first + i * 2;
      objects[content] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
      objects[content + 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.w} ${PAGE.h}] /Resources << /Font << ${fonts} >> >> /Contents ${content} 0 R >>`;
      kids.push(`${content + 1} 0 R`);
    });
    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${total} >>`;
    // Everything above is plain ASCII (text is hex), so string length is the byte count.
    let out = "%PDF-1.4\n";
    const offsets: number[] = [];
    for (let id = 1; id < objects.length; id++) {
      offsets[id] = out.length;
      out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }
    const xref = out.length;
    out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objects.length; id++) out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
    out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return new Blob([out], { type: "application/pdf" });
  }
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
