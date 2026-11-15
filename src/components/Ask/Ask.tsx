import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import type { AiStatus, AskAnswer, AskTurn } from "../../api/types";
import ClaudeSetup from "../ClaudeSignIn/ClaudeSetup";
import Logo from "../Logo/Logo";
import { clear, job, start, useJobs } from "../../lib/aiJobs";
import "./Ask.css";

// Questions about the project, answered by the AI picked in Settings: what a file or a
// function is for, how the parts fit together, where to start reading. It explains only;
// it never writes code. Answers come from the project's description, any notes saved on a
// file and the code of the files a question names.
//
// The conversation lives outside the screen (and in this browser), so an answer under way
// keeps coming, and the conversation stays, when the page is left and opened again.

type Props = {
  // The project and branch: each has its own conversation.
  scope: string;
  project: string;
  ai: AiStatus | null;
  ask: (question: string, history: AskTurn[]) => Promise<AskAnswer>;
  onSignedIn: () => void;
};

type Turn = AskTurn & { files?: string[]; read?: string[]; follow_ups?: string[] };

// Questions to start with, shown while the conversation is empty.
const STARTERS = [
  "What does this project do, and who is it for?",
  "How do I set it up and run it?",
  "Which files should I read first?",
  "How does the main flow work, step by step?",
];

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

export default function Ask({ scope, project, ai, ask, onSignedIn }: Props) {
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
          save(scope, [...load(scope), { role: "assistant", text: answer.answer, files: answer.files, read: answer.read, follow_ups: answer.follow_ups }]);
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
          {turns.length > 0 && (
            <button className="qa__restart" onClick={restart} disabled={busy} title="Clear this conversation and start again">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 3v10M3 8h10" />
              </svg>
              New chat
            </button>
          )}
        </header>

        <div className="qa__stage">
          <div className="qa__watermark" aria-hidden="true">
            <Logo size={240} depth={10} />
          </div>

          <div className="qa__log" ref={log} aria-live="polite">
            {turns.length === 0 && !busy ? (
              <div className="qa__empty">
                <p>Ask anything about {project}: what a file is for, how the parts fit together, where something happens.</p>
                <div className="qa__starters">
                  {STARTERS.map((question) => (
                    <button key={question} onClick={() => send(question)} disabled={!ready}>
                      {question}
                    </button>
                  ))}
                </div>
              </div>
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
                        {(turn.read?.length ?? 0) > 0 && (
                          <span className="qa__read" title={turn.read!.join("\n")}>
                            Read {turn.read!.length === 1 ? turn.read![0] : `${turn.read!.length} files`}
                          </span>
                        )}
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
            {!busy && turns[turns.length - 1]?.role === "assistant" && (turns[turns.length - 1].follow_ups?.length ?? 0) > 0 && (
              <div className="qa__next">
                <span>Ask next</span>
                {turns[turns.length - 1].follow_ups!.map((question) => (
                  <button key={question} onClick={() => send(question)} disabled={!ready}>
                    {question}
                  </button>
                ))}
              </div>
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
          <form className="qa__composer" onSubmit={submit} data-tour="ask-box">
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

// The answer's own light formatting: paragraphs, "- " and "1. " lists and `names`. A list may
// follow its lead-in line in the same paragraph.
const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;

function Answer({ text }: { text: string }) {
  const groups: { list: boolean; numbered: boolean; lines: string[] }[] = [];
  for (const block of text.split(/\n\s*\n/)) {
    let current: (typeof groups)[number] | null = null;
    for (const line of block.split("\n").filter((l) => l.trim())) {
      const list = BULLET.test(line);
      if (!current || current.list !== list || !list) {
        if (current && !list && !current.list) {
          current.lines.push(line);
          continue;
        }
        current = { list, numbered: list && /^\s*\d/.test(line), lines: [] };
        groups.push(current);
      }
      current.lines.push(line);
    }
  }
  return (
    <>
      {groups.map((group, i) => {
        if (!group.list) return <p key={i}>{inline(group.lines.join(" "))}</p>;
        const items = group.lines.map((line, j) => <li key={j}>{inline(line.replace(BULLET, ""))}</li>);
        return group.numbered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>;
      })}
    </>
  );
}

function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`)/).map((part, i) =>
    part.startsWith("`") && part.endsWith("`") && part.length > 2 ? <code key={i}>{part.slice(1, -1)}</code> : part,
  );
}
