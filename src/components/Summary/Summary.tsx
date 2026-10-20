import { useState } from "react";
import type { AiStatus, ProjectExplanation, Summary as SummaryData } from "../../api/types";
import { languageColor } from "../ProjectMap/ProjectMap";
import ClaudeSetup from "../ClaudeSignIn/ClaudeSetup";
import "./Summary.css";

// The whole project on one screen: what it is, how it works, what it's built with, its
// parts, how to run it and who has worked on it. The facts come from the project's own
// files and git history; the plain-English description is the picked AI's (Settings), on request.

type Props = {
  summary: SummaryData;
  ai: AiStatus | null;
  explain: () => Promise<ProjectExplanation>;
  onSignedIn: () => void;
  onOpenMap: () => void;
};

export default function Summary({ summary, ai, explain, onSignedIn, onOpenMap }: Props) {
  const [explanation, setExplanation] = useState(summary.explanation);
  const [state, setState] = useState<"idle" | "working" | string>("idle");
  const history = summary.history;
  const languageFiles = summary.languages.reduce((sum, l) => sum + l.files, 0);
  const names = new Map(summary.parts.map((part) => [part.id, part.name]));
  const partWhat = new Map((explanation?.parts ?? []).map((part) => [part.name, part.what]));

  const run = () => {
    setState("working");
    explain().then(
      (result) => {
        setExplanation(result);
        setState("idle");
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
            </>
          ) : summary.readme?.intro ? (
            <>
              <span className="summary__ai-label summary__ai-label--plain">From the readme</span>
              <p className="summary__overview">{summary.readme.intro}</p>
            </>
          ) : (
            <p className="summary__muted">This project has no readme that says what it is.</p>
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
