import { useEffect, useRef, useState } from "react";
import type { AiStatus, FileExplanation, KtDetail, KtDetailFile, KtGuide, Summary as SummaryData } from "../../api/types";
import ClaudeSetup from "../ClaudeSignIn/ClaudeSetup";
import { batch, result, startBatch, stopBatch, useJobs } from "../../lib/aiJobs";
import type { Step } from "../../lib/aiJobs";
import KtDocument from "./KtDocument";
import { attachKt } from "./ktInteract";
import { buildModel } from "./ktModel";
import "./ktDoc.css";

// The detailed KT: the project explained for someone who has never coded, with a map of its
// parts, a reading path, how things flow, where data lives and every file. The facts are read
// from the code; the words are the AI's (a note per file, then the project's words from those
// notes), checked against the code on the server. Downloads as a PDF or as one page that works
// offline with the same search, map and jumps.

type Props = {
  summary: SummaryData;
  scope: string;
  ai: AiStatus | null;
  loadGuide: () => Promise<{ guide: KtGuide | null }>;
  imageUrl: (path: string) => string;
  loadDetail: (worktree?: boolean) => Promise<KtDetail>;
  writeDetail: (worktree: boolean, fresh?: boolean) => Promise<KtDetail>;
  explainFile: (path: string, fresh?: boolean, worktree?: boolean) => Promise<FileExplanation>;
  onSignedIn: () => void;
};

export default function DetailedKt({ summary, scope, ai, loadGuide, imageUrl, loadDetail, writeDetail, explainFile, onSignedIn }: Props) {
  useJobs();
  const [detail, setDetail] = useState<KtDetail | null>(null);
  const [savedGuide, setSavedGuide] = useState<KtGuide | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // Asking before writing it all again, and the steps of the run under way, for its progress.
  const [confirming, setConfirming] = useState(false);
  const [order, setOrder] = useState<string[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const page = useRef<HTMLDivElement>(null);
  const batchKey = `kt-detail:${scope}`;
  const explaining = batch(batchKey);
  const ready = ai?.available && ai.signed_in !== false;
  // The brief KT, when written, gives the setup steps and the project's pictures.
  const guide = result<KtGuide>(`kt-guide:${scope}`) ?? savedGuide;

  useEffect(() => {
    let stale = false;
    setDetail(null);
    setProblem(null);
    load(undefined, () => stale);
    loadGuide().then(
      (found) => !stale && setSavedGuide(found.guide),
      () => {},
    );
    return () => {
      stale = true;
    };
    // Read again for each project and branch; the loaders change on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  function load(worktree?: boolean, stale: () => boolean = () => false) {
    loadDetail(worktree).then(
      (found) => !stale() && setDetail(found),
      (e: unknown) => !stale() && setProblem(e instanceof Error ? e.message : String(e)),
    );
  }

  const mode = detail?.worktree ? "w" : "b";
  const keyOf = (path: string) => `file:${scope}:${mode}:${path}`;
  // Notes written since the KT was read win over the saved ones; a note asked again that
  // failed keeps the one saved before.
  const notes = (f: KtDetailFile) => result<FileExplanation>(keyOf(f.path)) ?? f.explanation;
  const model = detail ? buildModel(summary, detail, guide, imageUrl, notes) : null;

  // Wired once the document is on screen; React leaves alone what the search and filters hide.
  const shown = model !== null;
  useEffect(() => {
    if (!page.current || !shown) return;
    return attachKt(page.current);
  }, [shown]);

  if (!detail || !model) {
    return (
      <section className="card kt__card">
        {problem ? <p className="kt__error" role="alert">{problem}</p> : <p className="summary__muted">Reading every file…</p>}
      </section>
    );
  }

  const missing = detail.files.filter((f) => !notes(f));
  const worktree = detail.worktree;
  // Notes for each file first (one request each), then the project's words, written from them.
  const write = (fresh: boolean) => {
    setConfirming(false);
    const files = fresh ? detail.files : missing;
    const steps: Step[] = files.map((f) => ({ key: keyOf(f.path), label: f.path, run: () => explainFile(f.path, fresh, worktree), again: fresh }));
    steps.push({ key: `kt-words:${scope}:${mode}`, label: "the project's map, flows and words", run: () => writeDetail(worktree, true).then(setDetail), again: true });
    setOrder(steps.map((s) => s.label));
    startBatch(batchKey, steps).then(() => load(worktree));
  };
  const position = explaining?.label ? order.indexOf(explaining.label) : -1;
  const progress = position >= 0 ? position : 0;
  const pdf = async () => {
    setSaving("PDF");
    try {
      const { downloadDetail } = await import("./ktDetailPdf");
      await downloadDetail(model);
    } finally {
      setSaving(null);
    }
  };
  const html = async () => {
    setSaving("page");
    try {
      const { downloadPage } = await import("./ktHtml");
      await downloadPage(model);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="kt kt--detail">
      <header className="card kt__head">
        <div>
          <h3>Detailed KT</h3>
          <p className="summary__muted">
            {detail.files.length} files · {model.explained} explained by the AI
            {detail.written ? "" : " · the map's names, flows and words aren't written yet"}
          </p>
          {(detail.has_changes || worktree) && (
            <label className="kt-detail__worktree">
              <input type="checkbox" checked={worktree} disabled={explaining?.running} onChange={(e) => { setDetail(null); load(e.target.checked); }} />
              Include changes I have not committed yet
            </label>
          )}
        </div>
        <div className="kt__actions">
          <button className="kt__button" onClick={pdf} disabled={saving !== null}>{saving === "PDF" ? "Making the PDF…" : "Download PDF"}</button>
          <button className="kt__button kt__button--quiet" onClick={html} disabled={saving !== null}>
            {saving === "page" ? "Making the page…" : "Download interactive page"}
          </button>
          {ready && !explaining?.running && (missing.length > 0 || !detail.written) && (
            <button className="kt__button kt__button--quiet" onClick={() => write(false)}>
              {missing.length ? `Write it with ${ai!.name} (${missing.length} files)` : `Write the words with ${ai!.name}`}
            </button>
          )}
          {ready && !explaining?.running && !confirming && (model.explained > 0 || detail.written) && (
            <button className="kt__button kt__button--quiet" onClick={() => setConfirming(true)}>Write it again</button>
          )}
          {explaining?.running && (
            <button className="kt__button kt__button--quiet" onClick={() => stopBatch(batchKey)} disabled={explaining.stopping}>
              {explaining.stopping ? "Stopping…" : "Stop"}
            </button>
          )}
        </div>
      </header>
      {confirming && !explaining?.running && (
        <div className="card kt__card kt-detail__confirm" role="alertdialog" aria-label="Write the detailed KT again">
          <p>
            This asks {ai?.name ?? "the AI"} about all {detail.files.length} files again, then rewrites the map, flows and words, and
            replaces what you have. It can take a while and uses your AI account. Each note is only replaced once its new one is written.
          </p>
          <div className="kt__actions">
            <button className="kt__button" onClick={() => write(true)}>Write it all again</button>
            <button className="kt__button kt__button--quiet" onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        </div>
      )}
      {ai && !ready && <ClaudeSetup ai={ai} onRefresh={onSignedIn} />}
      {explaining?.running && (
        <div className="card kt__progress" role="status">
          <div className="kt__progress-top">
            <span>Writing about <code>{explaining.label}</code>…</span>
            <span>{progress} of {order.length}</span>
          </div>
          <div className="kt__bar" aria-hidden="true">
            <i style={{ width: `${(progress / Math.max(1, order.length)) * 100}%` }} />
          </div>
          <p>One request per file, then one for the whole project. You can leave this page; it keeps going.</p>
        </div>
      )}
      {explaining?.error && <p className="kt__error" role="alert">{explaining.error}</p>}
      <div ref={page}>
        <KtDocument model={model} />
      </div>
    </div>
  );
}
