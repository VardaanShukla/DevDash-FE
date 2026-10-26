import { useEffect, useState } from "react";
import ClaudeSetup from "../ClaudeSignIn/ClaudeSetup";
import type { AiStatus, FunctionDetail, FunctionExplanation, UnitSide } from "../../api/types";
import "./FunctionChanges.css";

// A file's change told function by function: what each one looked like before, what it
// looks like now, the facts git can show (new inputs, new calls, more decisions), what
// its author wrote about it, and, on request, an AI's take on what the change improves
// and what it costs.

type Props = {
  // Changes whenever the file's change does, so the functions are read again.
  version: string;
  load: () => Promise<FunctionDetail[]>;
  explain: (name: string) => Promise<FunctionExplanation>;
  ai: AiStatus | null;
  onSignedIn: () => void;
  sideBySide: boolean;
  onShowLines: () => void;
};

const BADGE = {
  added: { label: "New", tone: "add" },
  deleted: { label: "Removed", tone: "del" },
  modified: { label: "Changed", tone: "mod" },
} as const;

// What each kind is, in words a non-developer knows.
const KIND = {
  function: "Function",
  method: "Function in a class",
  component: "Piece of a screen",
  class: "Class",
  type: "Shape of data",
  style: "Style rule",
  section: "Section of the doc",
  file: "Whole file",
} as const;

// Kinds with no inputs or calls to count.
const NO_FACTS = new Set<FunctionDetail["kind"]>(["type", "class", "style", "section", "file"]);

// Short code shows at once; longer code waits for a click.
const OPEN_LINES = 40;

export default function FunctionChanges({ version, load, explain, ai, onSignedIn, sideBySide, onShowLines }: Props) {
  const [functions, setFunctions] = useState<FunctionDetail[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);

  useEffect(() => {
    let stale = false;
    setFunctions(null);
    setError(null);
    load()
      .then((result) => !stale && setFunctions(result))
      .catch((e: Error) => !stale && setError(e.message));
    return () => {
      stale = true;
    };
    // load is a new function each render; version says when the file changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const setExplanation = (name: string, explanation: FunctionExplanation) =>
    setFunctions((list) => list && list.map((item) => (item.name === name ? { ...item, explanation } : item)));

  if (error) return <p className="view__note">{error}</p>;
  if (!functions) return <p className="view__note">Reading the functions…</p>;
  if (functions.length === 0) {
    return (
      <div className="fns__empty">
        <p>Nothing in this file's text changed: only its name, its permissions, or blank space.</p>
        <button className="fns__link" onClick={onShowLines}>
          Show the changed lines
        </button>
      </div>
    );
  }

  const unexplained = functions.filter((item) => !item.explanation);
  const explainAll = async () => {
    setExplaining(true);
    // One at a time: each is a separate AI run, and the first answers show sooner.
    for (const item of unexplained) {
      try {
        setExplanation(item.name, await explain(item.name));
      } catch {
        break;
      }
    }
    setExplaining(false);
  };

  return (
    <div className="fns">
      <div className="fns__bar">
        <ul className="fns__index">
          {functions.map((item) => (
            <li key={item.name}>
              <a href={`#fn-${item.name}`} className={`fns__chip fns__chip--${BADGE[item.change].tone}`}>
                {item.name}
              </a>
            </li>
          ))}
        </ul>
        {ai?.available && ai.signed_in !== false && unexplained.length > 1 && (
          <button className="fns__explain-all" onClick={explainAll} disabled={explaining}>
            {explaining ? `${ai.name} is explaining…` : `Explain all ${unexplained.length} with ${ai.name}`}
          </button>
        )}
      </div>
      {functions.map((item) => (
        <FunctionCard
          key={item.name}
          item={item}
          ai={ai}
          onSignedIn={onSignedIn}
          sideBySide={sideBySide}
          explain={() => explain(item.name).then((result) => setExplanation(item.name, result))}
          busy={explaining && !item.explanation}
        />
      ))}
    </div>
  );
}

function FunctionCard(props: {
  item: FunctionDetail;
  ai: AiStatus | null;
  onSignedIn: () => void;
  sideBySide: boolean;
  explain: () => Promise<void>;
  busy: boolean;
}) {
  const { item } = props;
  const now = item.after ?? item.before!;
  const badge = BADGE[item.change];
  const longest = item.diff ? item.diff.split("\n").length : Math.max(item.before?.lines ?? 0, item.after?.lines ?? 0);
  const [showCode, setShowCode] = useState(longest <= OPEN_LINES);

  return (
    <article className={`fn fn--${item.change}`} id={`fn-${item.name}`}>
      <header className="fn__header">
        <span className={`fn__badge fn__badge--${badge.tone}`}>{badge.label}</span>
        <span className="fn__kind">{KIND[item.kind]}</span>
        <h4 className="fn__name">{item.name}</h4>
        <span className="fn__where">
          {item.kind === "file" ? `${now.lines} line${now.lines === 1 ? "" : "s"}` : `lines ${now.start}–${now.end}`}
        </span>
      </header>

      <p className="fn__lead">{lead(item)}</p>

      {now.doc && (
        <blockquote className="fn__doc">
          <span>What the code says about itself</span>
          {now.doc}
        </blockquote>
      )}

      <Facts item={item} />

      <Explanation item={item} ai={props.ai} onSignedIn={props.onSignedIn} explain={props.explain} busy={props.busy} />

      <div className="fn__code-head">
        <button className="fns__link" onClick={() => setShowCode((open) => !open)}>
          {showCode ? "Hide the code" : item.diff ? "Show the changed lines" : `Show the code (${longest} lines)`}
        </button>
      </div>
      {showCode && <Code item={item} sideBySide={props.sideBySide} />}

      {item.used_by.length > 0 && (
        <div className="fn__uses">
          <h5>Used in</h5>
          <ul>
            {item.used_by.map((use) => (
              <li key={`${use.path}:${use.line}`}>
                <span className="fn__use-path">
                  {use.path}:{use.line}
                </span>
                <code>{use.text}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

// One or two plain sentences on what kind of change this is, from the facts alone.
function lead(item: FunctionDetail) {
  const lines = (n: number) => `${n} line${n === 1 ? "" : "s"}`;
  if (item.kind === "file" || item.kind === "section" || item.kind === "style") {
    const what = item.kind === "file" ? "file" : item.kind === "section" ? "section" : "style rule";
    if (item.change === "added") return `New ${what}, ${lines(item.after!.lines)} long.`;
    if (item.change === "deleted") return `Removed. The ${what} was ${lines(item.before!.lines)} long.`;
    const [a, b] = [item.before!.lines, item.after!.lines];
    const changed = item.diff ? item.diff.split("\n").filter((l) => /^[+-]/.test(l)).length : null;
    return `${changed !== null ? `${lines(changed)} changed. ` : ""}The ${what} ${a === b ? `is still ${lines(b)}` : `went from ${lines(a)} to ${lines(b)}`}.`;
  }
  if (item.change === "added") {
    const after = item.after!;
    const inputs = after.params.length ? ` It takes ${list(after.params)}.` : "";
    const used = item.used_by.length
      ? ` It is used in ${item.used_by.length} place${item.used_by.length === 1 ? "" : "s"}.`
      : " Nothing else uses it yet.";
    return `New ${KIND[item.kind].toLowerCase()}, ${lines(after.lines)} long.${inputs}${item.kind === "type" ? "" : used}`;
  }
  if (item.change === "deleted") return `Removed. It was ${lines(item.before!.lines)} long.`;
  const f = item.facts!;
  const parts: string[] = [];
  if (f.params_added.length) parts.push(`takes ${plural(f.params_added, "a new input", "new inputs")} ${list(f.params_added)}`);
  if (f.params_removed.length) parts.push(`no longer takes ${list(f.params_removed)}`);
  if (f.calls_added.length) parts.push(`now also calls ${list(f.calls_added.slice(0, 4))}${f.calls_added.length > 4 ? " and more" : ""}`);
  if (f.calls_removed.length) parts.push(`no longer calls ${list(f.calls_removed.slice(0, 4))}`);
  const [d0, d1] = f.decisions;
  if (d1 > d0) parts.push(`makes ${d1 - d0} more decision${d1 - d0 === 1 ? "" : "s"} (checks, loops or branches)`);
  if (d1 < d0) parts.push(`makes ${d0 - d1} fewer decision${d0 - d1 === 1 ? "" : "s"}, so it is simpler`);
  if (!f.is_async[0] && f.is_async[1]) parts.push("now waits for slow work such as the network");
  if (f.is_async[0] && !f.is_async[1]) parts.push("no longer waits for slow work");
  if (parts.length === 0) {
    return f.lines[0] === f.lines[1]
      ? `Same size as before (${lines(f.lines[1])}); the way it works inside changed.`
      : `Its inside changed and it went from ${lines(f.lines[0])} to ${lines(f.lines[1])}.`;
  }
  const size = f.lines[0] === f.lines[1] ? "" : ` It went from ${lines(f.lines[0])} to ${lines(f.lines[1])}.`;
  return `${parts.map((part) => part[0].toUpperCase() + part.slice(1)).join(". ")}.${size}`;
}

function Facts({ item }: { item: FunctionDetail }) {
  const now = item.after ?? item.before!;
  if (NO_FACTS.has(item.kind)) return null;
  const f = item.facts;
  return (
    <dl className="fn__facts">
      <div>
        <dt>Inputs</dt>
        <dd>
          {now.params.length === 0 && !f?.params_removed.length ? (
            <span className="fn__none">None</span>
          ) : (
            <>
              {now.params.map((p) => (
                <code key={p} className={f?.params_added.includes(p) ? "fn__new" : undefined}>
                  {p}
                </code>
              ))}
              {f?.params_removed.map((p) => (
                <code key={`-${p}`} className="fn__gone">
                  {p}
                </code>
              ))}
            </>
          )}
        </dd>
      </div>
      <div>
        <dt>Calls</dt>
        <dd>
          {now.calls.length === 0 && !f?.calls_removed.length ? (
            <span className="fn__none">Nothing else</span>
          ) : (
            <>
              {now.calls.slice(0, 8).map((c) => (
                <code key={c} className={f?.calls_added.includes(c) ? "fn__new" : undefined}>
                  {c}
                </code>
              ))}
              {now.calls.length > 8 && <span className="fn__none">+{now.calls.length - 8} more</span>}
              {f?.calls_removed.map((c) => (
                <code key={`-${c}`} className="fn__gone">
                  {c}
                </code>
              ))}
            </>
          )}
        </dd>
      </div>
      <div>
        <dt>Decisions</dt>
        <dd>{f ? <Change from={f.decisions[0]} to={f.decisions[1]} /> : now.decisions}</dd>
      </div>
      <div>
        <dt>Size</dt>
        <dd>{f ? <Change from={f.lines[0]} to={f.lines[1]} unit="lines" /> : `${now.lines} lines`}</dd>
      </div>
    </dl>
  );
}

function Change({ from, to, unit }: { from: number; to: number; unit?: string }) {
  if (from === to) return <>{`${to}${unit ? ` ${unit}` : ""}`}</>;
  return (
    <>
      {from} → <strong className={to > from ? "fn__up" : "fn__down"}>{to}</strong>
      {unit ? ` ${unit}` : ""}
    </>
  );
}

function Explanation(props: {
  item: FunctionDetail;
  ai: AiStatus | null;
  onSignedIn: () => void;
  explain: () => Promise<void>;
  busy: boolean;
}) {
  const [state, setState] = useState<"idle" | "working" | string>("idle");
  const explanation = props.item.explanation;
  if (explanation) {
    return (
      <section className="fn__ai">
        <span className="fn__ai-label">In plain English</span>
        <p className="fn__ai-summary">{explanation.summary}</p>
        <p>{explanation.change}</p>
        <div className="fn__ai-lists">
          {explanation.improves.length > 0 && (
            <div className="fn__ai-improves">
              <h5>What it improves</h5>
              <ul>
                {explanation.improves.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </div>
          )}
          {explanation.tradeoffs.length > 0 && (
            <div className="fn__ai-tradeoffs">
              <h5>Trade-offs and risks</h5>
              <ul>
                {explanation.tradeoffs.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {explanation.check && (
          <p className="fn__ai-check">
            <strong>To test:</strong> {explanation.check}
          </p>
        )}
      </section>
    );
  }
  if (!props.ai) return null;
  // Not ready (not installed, not running, signed out): how to get it ready, right here.
  if (!props.ai.available || props.ai.signed_in === false) return <ClaudeSetup ai={props.ai} onRefresh={props.onSignedIn} />;
  const working = state === "working" || props.busy;
  const run = () => {
    setState("working");
    props.explain().then(
      () => setState("idle"),
      (e: Error) => setState(e.message),
    );
  };
  return (
    <div className="fn__ai-ask">
      <button onClick={run} disabled={working}>
        {working ? `${props.ai.name} is reading the code…` : `Explain with ${props.ai.name}`}
      </button>
      <span>
        {state !== "idle" && state !== "working"
          ? state
          : "What it does, what the change improves, and its trade-offs, in plain words."}
      </span>
    </div>
  );
}

// Before and after, with the lines that differ marked.
function Code({ item, sideBySide }: { item: FunctionDetail; sideBySide: boolean }) {
  if (item.diff) return <DiffBlock diff={item.diff} />;
  if (!item.before || !item.after) {
    const side = (item.after ?? item.before)!;
    return (
      <div className="fn__code">
        <CodeBlock title={item.after ? "The code" : "The code that was removed"} side={side} marks={null} tone={item.after ? "add" : "del"} />
      </div>
    );
  }
  const { before, after } = lineMarks(item.before.code, item.after.code);
  return (
    <div className={`fn__code${sideBySide ? " fn__code--split" : ""}`}>
      <CodeBlock title="Before" side={item.before} marks={before} tone="del" />
      <CodeBlock title="After" side={item.after} marks={after} tone="add" />
    </div>
  );
}

function CodeBlock({ title, side, marks, tone }: { title: string; side: UnitSide; marks: boolean[] | null; tone: "add" | "del" }) {
  const lines = side.code.split("\n");
  return (
    <figure className="fn__block">
      <figcaption>{title}</figcaption>
      <pre>
        {lines.map((line, i) => (
          <div key={i} className={marks === null || marks[i] ? `fn__line fn__line--${marks === null ? "plain" : tone}` : "fn__line"}>
            <span className="fn__num">{side.start + i}</span>
            <span>{line || " "}</span>
          </div>
        ))}
      </pre>
    </figure>
  );
}

// A whole file's change: only the lines that changed, with a little around them.
function DiffBlock({ diff }: { diff: string }) {
  return (
    <div className="fn__code">
      <figure className="fn__block">
        <figcaption>The lines that changed</figcaption>
        <pre>
          {diff.split("\n").map((line, i) => {
            const tone = line.startsWith("@@") ? "plain" : line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : null;
            return (
              <div key={i} className={tone ? `fn__line fn__line--${tone}` : "fn__line"}>
                <span>{line || " "}</span>
              </div>
            );
          })}
        </pre>
      </figure>
    </div>
  );
}

// Which lines of each side are not in the other, by longest common subsequence.
function lineMarks(beforeCode: string, afterCode: string) {
  const a = beforeCode.split("\n").map((l) => l.trim());
  const b = afterCode.split("\n").map((l) => l.trim());
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const before = new Array<boolean>(a.length).fill(true);
  const after = new Array<boolean>(b.length).fill(true);
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      before[i++] = false;
      after[j++] = false;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return { before, after };
}

function list(items: string[]) {
  const quoted = items.map((item) => `“${item}”`);
  return quoted.length > 1 ? `${quoted.slice(0, -1).join(", ")} and ${quoted[quoted.length - 1]}` : quoted[0] ?? "";
}

function plural(items: string[], one: string, many: string) {
  return items.length === 1 ? one : many;
}
