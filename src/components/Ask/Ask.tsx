import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import type { AiStatus, AskAnswer, AskTurn, KnowledgeTransfer } from "../../api/types";
import ClaudeSetup from "../ClaudeSignIn/ClaudeSetup";
import { clear, job, start, useJobs } from "../../lib/aiJobs";
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
  ask: (question: string, history: AskTurn[]) => Promise<AskAnswer>;
  onSignedIn: () => void;
  onOpenKt: () => void;
};

type Turn = AskTurn & { files?: string[]; read?: string[] };

const STARTERS = [
  "What does this project do, in plain words?",
  "How do the main parts fit together?",
  "Where should a new developer start reading?",
  "What happens, step by step, when someone uses the main feature?",
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

export default function Ask({ scope, project, ai, kt, ask, onSignedIn, onOpenKt }: Props) {
  useJobs();
  const [draft, setDraft] = useState("");
  const [, setVersion] = useState(0);
  const turns = load(scope);
  const key = `ask:${scope}`;
  const running = job(key);
  const busy = running?.state === "working";
  const failed = running?.state === "failed" ? running.error : null;
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const ready = !!ai?.available && ai.signed_in !== false;

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [turns.length, busy, failed]);

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

  const explained = kt?.explained ?? 0;
  const total = kt?.files.length ?? 0;

  return (
    <div className="qa">
      <header className="qa__head">
        <div>
          <span className="qa__eyebrow">Ask about {project}</span>
          <h2>Understand the project</h2>
          <p>
            Ask what a file or function is for, how the parts fit together, or where something happens.
            {ai ? ` ${ai.name} answers in plain words` : " Your AI answers in plain words"} and never writes code.
          </p>
        </div>
        {turns.length > 0 && (
          <button className="qa__restart" onClick={restart} disabled={busy}>
            New conversation
          </button>
        )}
      </header>

      {kt && total > 0 && explained < total && (
        <p className="qa__coverage">
          {explained === 0 ? "No file has KT notes yet" : `${explained} of ${total} files ${explained === 1 ? "has" : "have"} KT notes`}, so answers lean
          on the code of the files you name. Writing the Full KT in Summary gives better answers.{" "}
          <button className="qa__link" onClick={onOpenKt}>
            Open Summary
          </button>
        </p>
      )}

      <div className="qa__log card" aria-live="polite">
        {turns.length === 0 && !busy ? (
          <div className="qa__empty">
            <p>Try one of these, or ask your own:</p>
            <div className="qa__starters">
              {STARTERS.map((text) => (
                <button key={text} onClick={() => send(text)} disabled={!ready}>
                  {text}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((turn, i) => (
            <div key={i} className={`qa__turn qa__turn--${turn.role}`}>
              <span className="qa__who">{turn.role === "user" ? "You" : ai?.name ?? "AI"}</span>
              <div className="qa__bubble">{turn.role === "assistant" ? <Answer text={turn.text} /> : <p>{turn.text}</p>}</div>
              {turn.role === "assistant" && (turn.files?.length ?? 0) > 0 && (
                <div className="qa__files">
                  <span>About</span>
                  {turn.files!.map((path) => (
                    <button key={path} title={`Ask what ${path} is for`} onClick={() => send(`What is ${path} for, and how does it connect to the rest?`)} disabled={busy || !ready}>
                      {path}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
        {busy && (
          <div className="qa__turn qa__turn--assistant">
            <span className="qa__who">{ai?.name ?? "AI"}</span>
            <div className="qa__bubble qa__bubble--thinking">
              <i />
              <i />
              <i />
              <span>Reading the project…</span>
            </div>
          </div>
        )}
        {failed && (
          <div className="qa__failed" role="alert">
            <span>{failed}</span>
            <button onClick={retry}>Ask again</button>
          </div>
        )}
        <div ref={end} />
      </div>

      {ai && !ready ? (
        <div className="qa__setup card">
          <ClaudeSetup ai={ai} onRefresh={onSignedIn} />
        </div>
      ) : (
        <form className="qa__form card" onSubmit={submit}>
          <textarea
            ref={input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            placeholder="What does src/api/client.ts do? How does a change get recorded?"
            rows={2}
            maxLength={2000}
            aria-label="Your question"
          />
          <button type="submit" disabled={busy || !draft.trim() || !ai}>
            {busy ? "Answering…" : "Ask"}
          </button>
        </form>
      )}
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
