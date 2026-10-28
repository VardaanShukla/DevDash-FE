import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import type { AiStatus, AskAnswer, AskTurn, FileExplanation, KnowledgeTransfer, ProjectExplanation, Summary } from "../../api/types";
import ClaudeSetup from "../ClaudeSignIn/ClaudeSetup";
import Logo from "../Logo/Logo";
import { downloadKt, ktKeys, withNewNotes, writeKt } from "../Summary/Summary";
import { batch, clear, job, result, start, stopBatch, useJobs } from "../../lib/aiJobs";
import "./Ask.css";

// Questions about the project, answered by the AI picked in Settings: what a file or a
// function is for, how the parts fit together, where to start reading. It explains only;
// it never writes code. Answers come from the project's description, the Full KT's notes on
// each file and the code of the files a question names, so the more of the KT is written,
// the better they get.
//
// The conversation lives outside the screen (and in this browser), so an answer under way
// keeps coming, and the conversation stays, when the page is left and opened again.

type Props = {
  // The project and branch: each has its own conversation.
  scope: string;
  project: string;
  ai: AiStatus | null;
  kt: KnowledgeTransfer | null;
  summary: SummaryData | null;
  ask: (question: string, history: AskTurn[]) => Promise<AskAnswer>;
  // Writing the KT from here: the same runs as Summary's Full KT, so either shows the other's progress.
  explain: (fresh?: boolean) => Promise<ProjectExplanation>;
  explainFile: (path: string) => Promise<FileExplanation>;
  loadKt: () => Promise<KnowledgeTransfer>;
  onSignedIn: () => void;
};

type SummaryData = Summary;

type Turn = AskTurn & { files?: string[]; read?: string[] };

// Turns kept per conversation, in memory and in this browser.
const KEPT = 40;
const STORAGE = "devdash:ask:";

const chats = new Map<string, Turn[]>();

function load(scope: string): Turn[] {
  const found = chats.get(scope);
  if (found) return found;
  let saved: Turn[] = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE + scope) ?? "[]");
    if (Array.isArray(parsed)) saved = parsed.filter((t) => (t?.role === "user" || t?.role === "assistant") && typeof t.text === "string");
  } catch {
    /* storage unavailable: the conversation starts empty */
  }
  chats.set(scope, saved);
  return saved;
}

function save(scope: string, turns: Turn[]) {
  const kept = turns.slice(-KEPT);
  chats.set(scope, kept);
  try {
    localStorage.setItem(STORAGE + scope, JSON.stringify(kept));
  } catch {
    /* storage unavailable: kept until the page reloads */
  }
}

export default function Ask({ scope, project, ai, kt: saved, summary, ask, explain, explainFile, loadKt, onSignedIn }: Props) {
  useJobs();
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState<number | null>(null);
  const [, setVersion] = useState(0);
  const turns = load(scope);
  const key = `ask:${scope}`;
  const running = job(key);
  const busy = running?.state === "working";
  const failed = running?.state === "failed" ? running.error : null;
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const ready = !!ai?.available && ai.signed_in !== false;
  const name = ai?.name ?? "AI";

  // Keep the newest turn in view, inside the conversation only (the page itself stays put).
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [turns.length, busy, failed]);

  // The question box grows with what is typed, up to a few lines, then scrolls.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [draft]);

  const send = (text: string) => {
    const question = text.trim();
    if (!question || busy || !ready) return;
    const current = load(scope);
    const history: AskTurn[] = current.map(({ role, text }) => ({ role, text }));
    save(scope, [...current, { role: "user", text: question }]);
    setDraft("");
    setVersion((v) => v + 1);
    clear(key);
    // The answer is added to the conversation here, not by the screen, so it lands even
    // when the screen was left while the AI was answering. Each question is its own run.
    start(
      key,
      () =>
        ask(question, history).then((answer) => {
          save(scope, [...load(scope), { role: "assistant", text: answer.answer, files: answer.files, read: answer.read }]);
          return answer;
        }),
      true,
    ).catch(() => {});
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    send(draft);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter starts a new line.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(draft);
    }
  };

  const retry = () => {
    const last = turns[turns.length - 1];
    if (last?.role !== "user") return;
    save(scope, turns.slice(0, -1));
    send(last.text);
  };

  const restart = () => {
    save(scope, []);
    clear(key);
    setVersion((v) => v + 1);
    input.current?.focus();
  };

  const copy = (i: number, text: string) => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(i);
        setTimeout(() => setCopied((c) => (c === i ? null : c)), 1600);
      })
      .catch(() => {});
  };

  // The KT: notes written since the page read them count too.
  const keys = ktKeys(scope);
  const kt = saved ? withNewNotes(scope, saved) : null;
  const writing = batch(keys.batch);
  const ktBusy = !!writing?.running || job(keys.fresh)?.state === "working";
  const explained = kt?.explained ?? 0;
  const total = kt?.files.length ?? 0;
  const [ktError, setKtError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Reads the KT fresh from disk (the overview included) and saves it as a PDF.
  const downloadPdf = () => {
    if (!summary) return;
    setKtError(null);
    setDownloading(true);
    loadKt()
      .then((fresh) => {
        const overview = result<ProjectExplanation>(keys.fresh) ?? (summary.explanation?.overview?.trim() ? summary.explanation : null);
        downloadKt(summary, overview, withNewNotes(scope, fresh));
      })
      .catch((e: Error) => setKtError(e.message))
      .finally(() => setDownloading(false));
  };

  // Explains every file still without notes, rewrites the overview, then hands over the PDF.
  const writeAndDownload = () => {
    if (!kt || !ready) return;
    setKtError(null);
    writeKt(scope, kt, explain, explainFile).then(() => {
      const after = batch(keys.batch);
      if (after?.error) setKtError(after.error);
      else downloadPdf();
    });
  };
  const missing = total - explained;
  const status = !ai ? "Checking your AI…" : !ready ? `${name} needs signing in` : busy ? `${name} is answering…` : `Answered by ${name}`;

  return (
    <div className="qa">
      <section className="qa__panel card">
        <header className="qa__bar">
          <Logo size={34} depth={4} className="qa__brand" />
          <div className="qa__title">
            <h2>Ask DevDash</h2>
            <span className={`qa__status${ready ? (busy ? " qa__status--busy" : " qa__status--on") : ""}`}>
              <i aria-hidden="true" />
              {project} · {status}
            </span>
          </div>
          {summary && kt && total > 0 && (
            <button
              className="qa__restart"
              onClick={missing > 0 && ready ? writeAndDownload : downloadPdf}
              disabled={ktBusy || downloading}
              title={missing > 0 ? "Explain the files still without notes, then download the KT as a PDF" : "Download the KT as a PDF"}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" />
              </svg>
              {ktBusy ? "Writing KT…" : downloading ? "Preparing PDF…" : missing > 0 && ready ? "Write KT (PDF)" : "Download KT (PDF)"}
            </button>
          )}
          {turns.length > 0 && (
            <button className="qa__restart" onClick={restart} disabled={busy} title="Clear this conversation and start again">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 3v10M3 8h10" />
              </svg>
              New chat
            </button>
          )}
        </header>

        {kt && total > 0 && (ktBusy || ktError || explained < total) && (
          <div className={`qa__coverage${ktError ? " qa__coverage--failed" : ""}`} role={ktError ? "alert" : undefined}>
            {ktBusy ? (
              <>
                <span>
                  Writing the KT: {explained} of {total} files explained
                  {writing?.label ? `. ${writing.current === keys.fresh ? "Writing the overview" : `Reading ${writing.label}`}…` : "…"} The PDF downloads when it's done.
                </span>
                {writing?.running && (
                  <button className="qa__link" onClick={() => stopBatch(keys.batch)} disabled={writing.stopping}>
                    {writing.stopping ? "Stopping…" : "Stop"}
                  </button>
                )}
              </>
            ) : ktError ? (
              <>
                <span>The KT couldn't be finished. {ktError}</span>
                <button className="qa__link" onClick={ready ? writeAndDownload : downloadPdf}>
                  Try again
                </button>
              </>
            ) : (
              <>
                <span>
                  {explained === 0 ? "No file has KT notes yet" : `${explained} of ${total} files ${explained === 1 ? "has" : "have"} KT notes`}, so answers
                  lean on the code of the files you name.
                </span>
                {ready && summary && (
                  <button className="qa__link" onClick={writeAndDownload}>
                    Write the KT and download it as a PDF
                  </button>
                )}
              </>
            )}
            {ktBusy && (
              <span className="qa__meter" aria-hidden="true">
                <i style={{ width: `${(explained / total) * 100}%` }} />
              </span>
            )}
          </div>
        )}

        <div className="qa__stage">
          <div className="qa__watermark" aria-hidden="true">
            <Logo size={240} depth={10} />
          </div>

          <div className="qa__log" ref={log} aria-live="polite">
            {turns.length === 0 && !busy ? (
              <p className="qa__empty">Ask anything about {project}: what a file is for, how the parts fit together, where something happens.</p>
            ) : (
              turns.map((turn, i) => (
                <div key={i} className={`qa__turn qa__turn--${turn.role}`}>
                  {turn.role === "assistant" ? (
                    <Logo size={26} depth={3} className="qa__avatar" />
                  ) : (
                    <span className="qa__avatar qa__avatar--user" aria-hidden="true">
                      You
                    </span>
                  )}
                  <div className="qa__body">
                    <span className="qa__who">{turn.role === "user" ? "You" : name}</span>
                    <div className="qa__bubble">{turn.role === "assistant" ? <Answer text={turn.text} /> : <p>{turn.text}</p>}</div>
                    {turn.role === "assistant" && (
                      <div className="qa__tools">
                        <button className="qa__tool" onClick={() => copy(i, turn.text)}>
                          {copied === i ? "Copied" : "Copy"}
                        </button>
                        {(turn.files?.length ?? 0) > 0 && (
                          <div className="qa__files">
                            <span>Ask about</span>
                            {turn.files!.map((path) => (
                              <button
                                key={path}
                                title={`Ask what ${path} is for`}
                                onClick={() => send(`What is ${path} for, and how does it connect to the rest?`)}
                                disabled={busy || !ready}
                              >
                                {path}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {busy && (
              <div className="qa__turn qa__turn--assistant">
                <Logo size={26} depth={3} className="qa__avatar" />
                <div className="qa__body">
                  <span className="qa__who">{name}</span>
                  <div className="qa__bubble qa__bubble--thinking">
                    <i />
                    <i />
                    <i />
                    <span>Reading the project…</span>
                  </div>
                </div>
              </div>
            )}
            {failed && (
              <div className="qa__failed" role="alert">
                <span>{failed}</span>
                <button onClick={retry}>Ask again</button>
              </div>
            )}
          </div>
        </div>

        {ai && !ready ? (
          <div className="qa__setup">
            <ClaudeSetup ai={ai} onRefresh={onSignedIn} />
          </div>
        ) : (
          <form className="qa__composer" onSubmit={submit}>
            <div className="qa__field">
              <textarea
                ref={input}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKey}
                placeholder={`Ask anything about ${project}…`}
                rows={1}
                maxLength={2000}
                aria-label="Your question"
              />
              <button type="submit" className="qa__send" disabled={busy || !draft.trim() || !ready} aria-label={busy ? "Answering" : "Send"} title="Send">
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M10 16V4M4.5 9.5 10 4l5.5 5.5" />
                </svg>
              </button>
            </div>
            <p className="qa__hint">
              <span>
                <kbd>Enter</kbd> to send, <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line
              </span>
              {draft.length > 1600 && <span>{2000 - draft.length} characters left</span>}
            </p>
          </form>
        )}
      </section>
    </div>
  );
}

// The answer's own light formatting: paragraphs, "- " lists and `names`.
function Answer({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/);
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split("\n").filter((line) => line.trim());
        if (lines.length > 0 && lines.every((line) => /^\s*[-*•]\s+/.test(line))) {
          return (
            <ul key={i}>
              {lines.map((line, j) => (
                <li key={j}>{inline(line.replace(/^\s*[-*•]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{inline(lines.join(" "))}</p>;
      })}
    </>
  );
}

function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`)/).map((part, i) =>
    part.startsWith("`") && part.endsWith("`") && part.length > 2 ? <code key={i}>{part.slice(1, -1)}</code> : part,
  );
}
