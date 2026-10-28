import { useEffect, useRef } from "react";
import type { PlacedWidget, WidgetAccent, WidgetStyle, WidgetType } from "../../api/types";
import { CATALOG, option, spec } from "./catalog";
import { COLUMNS, MAX_ROWS } from "./layout";

// The panel beside Home while it's being edited: every widget there is to add, or the
// settings of the one picked (its title, style, accent, size and its own options).

export const STYLES: { id: WidgetStyle; label: string; hint: string }[] = [
  { id: "glass", label: "Glass", hint: "Smoked glass, raised off the page" },
  { id: "solid", label: "Solid", hint: "An opaque panel" },
  { id: "outline", label: "Outline", hint: "Just a line around it" },
  { id: "tinted", label: "Tinted", hint: "Washed in its accent colour" },
  { id: "bare", label: "Bare", hint: "No panel at all" },
];
export const ACCENTS: { id: WidgetAccent; label: string }[] = [
  { id: "", label: "Theme" },
  { id: "blue", label: "Blue" },
  { id: "teal", label: "Teal" },
  { id: "green", label: "Green" },
  { id: "amber", label: "Amber" },
  { id: "red", label: "Red" },
  { id: "violet", label: "Violet" },
  { id: "pink", label: "Pink" },
];

export function AddWidget({ onAdd, onClose }: { onAdd: (type: WidgetType) => void; onClose: () => void }) {
  return (
    <aside className="editor" aria-label="Add a widget">
      <header className="editor__head">
        <h2>Add a widget</h2>
        <button className="editor__close" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>
      </header>
      <p className="editor__note">Each goes in the first free spot from the top. Add one more than once to show it twice, set up differently.</p>
      <ul className="editor__catalog">
        {CATALOG.map((about) => (
          <li key={about.type}>
            <button onClick={() => onAdd(about.type)}>
              <strong>{about.name}</strong>
              <span>{about.description}</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function WidgetSettings({ widget, onChange, onDuplicate, onRemove, onClose }: {
  widget: PlacedWidget;
  onChange: (widget: PlacedWidget) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const about = spec(widget.type);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), [widget.id]);
  const set = (changes: Partial<PlacedWidget>) => onChange({ ...widget, ...changes });
  const setOption = (key: string, value: string | number | boolean) => set({ options: { ...widget.options, [key]: value } });
  return (
    <aside className="editor" aria-label={`Settings for ${widget.title || about.name}`}>
      <header className="editor__head">
        <h2>{widget.title || about.name}</h2>
        <button className="editor__close" onClick={onClose} aria-label="Close settings">
          <CloseIcon />
        </button>
      </header>
      <p className="editor__note">{about.description}</p>

      <label className="editor__field">
        <span>Title</span>
        <input ref={first} className="input" value={widget.title} maxLength={60} placeholder={about.name}
               onChange={(event) => set({ title: event.target.value })} />
      </label>

      <fieldset className="editor__field">
        <legend>Style</legend>
        <div className="editor__styles">
          {STYLES.map((style) => (
            <button key={style.id} className={`editor__style editor__style--${style.id}${widget.style === style.id ? " is-on" : ""}`}
                    aria-pressed={widget.style === style.id} title={style.hint} onClick={() => set({ style: style.id })}>
              <i aria-hidden="true" />
              {style.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="editor__field">
        <legend>Accent</legend>
        <div className="editor__accents">
          {ACCENTS.map((accent) => (
            <button key={accent.id || "theme"} className={`editor__accent wf--accent-${accent.id || "theme"}${widget.accent === accent.id ? " is-on" : ""}`}
                    aria-pressed={widget.accent === accent.id} aria-label={accent.label} title={accent.label} onClick={() => set({ accent: accent.id })}>
              <i aria-hidden="true" />
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="editor__field">
        <legend>Size</legend>
        <div className="editor__size">
          <label>
            <span>Columns</span>
            <input className="input" type="number" min={about.min.w} max={COLUMNS - widget.x} value={widget.w}
                   onChange={(event) => set({ w: Number(event.target.value) })} />
          </label>
          <label>
            <span>Rows</span>
            <input className="input" type="number" min={about.min.h} max={MAX_ROWS} value={widget.h}
                   onChange={(event) => set({ h: Number(event.target.value) })} />
          </label>
        </div>
      </fieldset>

      {about.options.length > 0 && (
        <fieldset className="editor__field">
          <legend>Shows</legend>
          {about.options.map((spec) => {
            const value = option(widget, spec.key);
            if (spec.kind === "toggle") {
              return (
                <label key={spec.key} className="editor__check">
                  <input type="checkbox" checked={Boolean(value)} onChange={(event) => setOption(spec.key, event.target.checked)} />
                  {spec.label}
                </label>
              );
            }
            if (spec.kind === "choice") {
              return (
                <label key={spec.key} className="editor__line">
                  <span>{spec.label}</span>
                  <select className="select" value={String(value)} onChange={(event) => setOption(spec.key, event.target.value)}>
                    {spec.choices!.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
              );
            }
            if (spec.kind === "number") {
              return (
                <label key={spec.key} className="editor__line">
                  <span>{spec.label}</span>
                  <input className="input editor__number" type="number" min={spec.min} max={spec.max} value={Number(value)}
                         onChange={(event) => setOption(spec.key, Math.min(spec.max ?? 99, Math.max(spec.min ?? 0, Number(event.target.value) || 0)))} />
                </label>
              );
            }
            return (
              <label key={spec.key} className="editor__field">
                <span>{spec.label}</span>
                <textarea className="input editor__text" value={String(value)} maxLength={2000} rows={6}
                          onChange={(event) => setOption(spec.key, event.target.value)} />
              </label>
            );
          })}
        </fieldset>
      )}

      <div className="editor__actions">
        <button className="wf__button" onClick={onDuplicate}>
          Duplicate
        </button>
        <button className="wf__button wf__button--danger" onClick={onRemove}>
          Remove from Home
        </button>
      </div>
    </aside>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}
