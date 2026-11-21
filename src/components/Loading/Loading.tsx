import type React from "react";
import "./Loading.css";

// A screen still loading: the shape of what's coming, drawn as faint placeholder blocks that a
// slow light passes over, with one line saying what Looma is reading. `shape` picks the
// placeholder: a document (Summary, KT), a graph of boxes (the project map) or a plain panel.

type Shape = "doc" | "graph" | "panel";

export default function Loading({ label, shape = "panel" }: { label: string; shape?: Shape }) {
  return (
    <section className={`card loading loading--${shape}`} role="status" aria-live="polite">
      <p className="loading__label">
        <span className="loading__spin" aria-hidden="true" />
        {label}
      </p>
      <div className="loading__shape" aria-hidden="true">
        {shape === "graph" ? (
          <>
            <div className="loading__nodes">
              {Array.from({ length: 4 }, (_, i) => (
                <span key={i} className="loading__node">
                  <b style={{ width: `${55 + ((i * 17) % 30)}%` }} />
                  <b style={{ width: "80%" }} />
                  <i />
                </span>
              ))}
            </div>
            <div className="loading__nodes loading__nodes--low">
              {Array.from({ length: 3 }, (_, i) => (
                <span key={i} className="loading__node">
                  <b style={{ width: `${45 + i * 12}%` }} />
                  <b style={{ width: "70%" }} />
                </span>
              ))}
            </div>
          </>
        ) : (
          <>
            <b className="loading__title" />
            {[96, 88, 92, 64].map((width, i) => (
              <b key={i} style={{ width: `${width}%` }} />
            ))}
            {shape === "doc" && (
              <div className="loading__cols">
                {[0, 1].map((col) => (
                  <span key={col}>
                    <b className="loading__head" />
                    <b style={{ width: "90%" }} />
                    <b style={{ width: "76%" }} />
                    <b style={{ width: "84%" }} />
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

// Long AI work (writing the KT): its steps as a short checklist, done, under way and still to
// come, over a thin bar of the whole, and one quiet line on how long it usually takes.
export type ProgressStep = { label: React.ReactNode; state: "done" | "now" | "todo" };

export function Progress({ steps, share, meta, note }: { steps: ProgressStep[]; share: number; meta: string; note: string }) {
  return (
    <section className="card progress" role="status" aria-live="polite">
      <ol className="progress__steps">
        {steps.map((step, i) => (
          <li key={i} className={`progress__step progress__step--${step.state}`}>
            <span className="progress__mark" aria-hidden="true">
              {step.state === "done" && (
                <svg viewBox="0 0 16 16">
                  <path d="M3.5 8.5l3 3 6-7" />
                </svg>
              )}
            </span>
            <span className="progress__label">{step.label}</span>
          </li>
        ))}
      </ol>
      <div className="progress__bar" aria-hidden="true">
        <i style={{ width: `${Math.min(100, share)}%` }} />
      </div>
      <p className="progress__foot">
        <span>{note}</span>
        <span className="progress__meta">{meta}</span>
      </p>
    </section>
  );
}
