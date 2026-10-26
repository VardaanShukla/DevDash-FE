import { useEffect, useMemo, useRef, useState } from "react";
import type { AiStatus, FileExplanation, KnowledgeTransfer, KtFile, ProjectExplanation, Summary as SummaryData } from "../../api/types";
import { languageColor } from "../ProjectMap/ProjectMap";
import ClaudeSetup from "../ClaudeSignIn/ClaudeSetup";
import "./Summary.css";

// The whole project on one screen: what it is, how it works, what it's built with, its
// parts, how to run it and who has worked on it. The facts come from the project's own
// files and git history; the plain-English description is the picked AI's (Settings), on request.
// The Full KT tab is the knowledge transfer: every file explained, function by function.

type Props = {
  summary: SummaryData;
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
  // Shared by both tabs, so a description written on one shows on the other.
  const [explanation, setExplanation] = useState(props.summary.explanation?.overview?.trim() ? props.summary.explanation : null);
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
        <Overview {...props} explanation={explanation} setExplanation={setExplanation} onOpenKt={() => setTab("kt")} />
      ) : (
        <FullKt {...props} explanation={explanation} setExplanation={setExplanation} />
      )}
    </div>
  );
}

type Shared = Props & {
  explanation: ProjectExplanation | null;
  setExplanation: (explanation: ProjectExplanation) => void;
};

function Overview({ summary, ai, explain, onSignedIn, onOpenMap, explanation, setExplanation, onOpenKt }: Shared & { onOpenKt: () => void }) {
  const [state, setState] = useState<"idle" | "working" | string>("idle");
  const history = summary.history;
  const languageFiles = summary.languages.reduce((sum, l) => sum + l.files, 0);
  const names = new Map(summary.parts.map((part) => [part.id, part.name]));
  const partWhat = new Map((explanation?.parts ?? []).map((part) => [part.name, part.what]));

  const run = () => {
    setState("working");
    explain().then(
      (result) => {
        // An answer with no overview would leave the box empty: treated as no answer, so it can be asked again.
        if (result.overview?.trim()) {
          setExplanation(result);
          setState("idle");
        } else setState("The AI's answer left out the description. Try again, or pick another model in Settings.");
      },
      (e: Error) => setState(e.message),
    );
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
function FullKt({ summary, ai, explain, loadKt, explainFile, onSignedIn, explanation, setExplanation }: Shared) {
  const [kt, setKt] = useState<KnowledgeTransfer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<"files" | "overview" | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const stop = useRef(false);

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

  const setFile = (path: string, note: FileExplanation) =>
    setKt((list) =>
      list && {
        files: list.files.map((f) => (f.path === path ? { ...f, explanation: note } : f)),
        explained: list.explained + (list.files.find((f) => f.path === path)?.explanation ? 0 : 1),
      },
    );

  const groups = useMemo(() => {
    const words = filter.trim().toLowerCase();
    const shown = (kt?.files ?? []).filter(
      (f) => !words || f.path.toLowerCase().includes(words) || f.explanation?.purpose.toLowerCase().includes(words),
    );
    const byPart = new Map<string, KtFile[]>();
    for (const file of shown) byPart.set(file.part, [...(byPart.get(file.part) ?? []), file]);
    return [...byPart.entries()];
  }, [kt, filter]);

  if (error) return <p className="summary__muted">{error}</p>;
  if (!kt) return <p className="summary__muted">Listing the project's files…</p>;

  const ready = ai?.available && ai.signed_in !== false;
  const left = kt.files.filter((f) => !f.explanation);

  const explainOne = async (path: string) => {
    setCurrent(path);
    setError(null);
    try {
      setFile(path, await explainFile(path));
      return true;
    } catch (e) {
      setError(`${path}: ${(e as Error).message}`);
      return false;
    } finally {
      setCurrent(null);
    }
  };

  const explainAll = async () => {
    stop.current = false;
    setRunning("files");
    // One file at a time: each is its own AI run, and notes show as they come.
    for (const file of left) {
      if (stop.current || !(await explainOne(file.path))) break;
    }
    setRunning(null);
    // The overview is rewritten from the notes once the files are done.
    if (!stop.current) await rewriteOverview();
  };

  const rewriteOverview = async () => {
    setRunning("overview");
    try {
      const result = await explain(true);
      if (result.overview?.trim()) setExplanation(result);
    } catch (e) {
      setError((e as Error).message);
    }
    setRunning(null);
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
          {ready && running === "files" && (
            <button className="kt__button kt__button--quiet" onClick={() => (stop.current = true)}>
              Stop after this file
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
        {error && <p className="kt__error">{error}</p>}
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
