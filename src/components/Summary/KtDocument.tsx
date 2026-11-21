import type { KtModel, ModelFile, Ref } from "./ktModel";
import { ROLE_TEXT, SOURCE_TEXT, anchorOf, mapLayout, sections } from "./ktModel";
import type { Section } from "./ktModel";

// The detailed KT, drawn from its model. It only draws: what you can do on it (search, the
// map's filter, jumping to a file, copying a command) is wired by attachKt (ktInteract.ts),
// so the same markup works on the KT tab and in the page to download, which has no React.

export default function KtDocument({ model }: { model: KtModel }) {
  const color = new Map(model.parts.map((p) => [p.id, p.color]));
  const partOf = new Map(model.files.map((f) => [f.path, f.part]));
  const chip = (ref: Ref) => <Chip key={ref.path} item={ref} color={color.get(partOf.get(ref.path) ?? "") ?? "#888"} />;
  const list = sections(model);
  return (
    <div className="ktdoc">
      <nav className="ktdoc__nav" aria-label="Contents">
        <strong>Contents</strong>
        <ol>
          {list.map((s, i) => (
            <li key={s.id}><a href={`#${s.id}`}><span>{i + 1}</span>{s.title}</a></li>
          ))}
        </ol>
      </nav>
      <div className="ktdoc__main">
        <header className="ktdoc__cover">
          <span className="ktdoc__eyebrow">Detailed knowledge transfer</span>
          <h2>{model.name}</h2>
          {model.summary && <p className="ktdoc__lead">{model.summary}</p>}
          <p className="ktdoc__meta">Read from: {model.source} · {model.date}</p>
        </header>

        <Block id="kt-minute" n={1} title="The project in one minute">
          <div className="ktdoc__facts">
            {model.summary && <Fact label="What it does" text={model.summary} />}
            {model.audience && <Fact label="Who it's for" text={model.audience} />}
            {model.problem && <Fact label="The problem it solves" text={model.problem} />}
            <Fact
              label="How big it is"
              text={`${model.size.files} files, ${model.size.lines.toLocaleString()} lines${model.size.languages.length ? `, mostly ${model.size.languages.slice(0, 3).map((l) => l.name).join(", ")}` : ""}.`}
            />
          </div>
          {model.tech.length > 0 && (
            <>
              <h4>What it's built with</h4>
              <ul className="ktdoc__tech">
                {model.tech.map((t) => (
                  <li key={t.name}><strong>{t.name}</strong><span>{t.what}</span></li>
                ))}
              </ul>
            </>
          )}
          {model.images.map((image) => (
            <figure key={image.src} className="ktdoc__picture">
              <img src={image.src} alt={image.caption} loading="lazy" />
              <figcaption>{image.caption}</figcaption>
            </figure>
          ))}
        </Block>

        <Block id="kt-map" n={2} title="The map" intro="The project's parts. An arrow means one part uses code from the other. Click a part to see its files.">
          <PartMap model={model} />
          <ul className="ktdoc__legend">
            {model.parts.map((p) => (
              <li key={p.id}>
                <button type="button" data-part-filter={p.id} style={{ ["--part" as string]: p.color }}>
                  <i aria-hidden="true" />
                  <strong>{p.name}</strong>
                  <span>{p.what}</span>
                  <small>{p.files} file{p.files === 1 ? "" : "s"}</small>
                </button>
              </li>
            ))}
          </ul>
        </Block>

        {model.reading.length > 0 && (
          <Block id="kt-read" n={num(list, "kt-read")} title="Understand it step by step" intro="Read these files in this order. Each one makes the next easier.">
            <ol className="ktdoc__steps">
              {model.reading.map((r) => (
                <li key={r.path}>
                  <div>{chip(r)}</div>
                  <p>{r.why}</p>
                  {r.after && <p className="ktdoc__after">{r.after}</p>}
                </li>
              ))}
            </ol>
          </Block>
        )}

        {(model.setup.length > 0 || model.run.length > 0) && (
          <Block id="kt-run" n={num(list, "kt-run")} title="Set it up and run it">
            {model.setup.length > 0 && (
              <ol className="ktdoc__setup">
                {model.setup.map((s) => (
                  <li key={s.step}>
                    <strong>{s.step}</strong>
                    {s.detail && <p>{s.detail}</p>}
                    {s.command && <Command command={s.command} />}
                  </li>
                ))}
              </ol>
            )}
            {model.run.length > 0 && (
              <>
                <h4>Run it</h4>
                {model.run.map((r) => (
                  <div key={r.command} className="ktdoc__run"><p>{r.what}</p><Command command={r.command} /></div>
                ))}
              </>
            )}
          </Block>
        )}

        {model.flows.length > 0 && (
          <Block id="kt-flows" n={num(list, "kt-flows")} title="How things flow" intro="What happens, file by file, when you use the project. Every arrow is a real link in the code. Click a file to see it.">
            <div className="ktdoc__flows">
              {model.flows.map((flow) => (
                <section key={flow.name} className="ktdoc__flow">
                  <h4>{flow.name}</h4>
                  <ol>
                    {flow.steps.map((step, i) => (
                      <li key={step.path}>
                        {i > 0 && <span className="ktdoc__arrow">{step.link === "used by" ? "which is used by" : "which uses"}</span>}
                        <div className="ktdoc__step" style={{ ["--part" as string]: color.get(partOf.get(step.path) ?? "") }}>
                          <b>{i + 1}</b>
                          <div>
                            {chip(step)}
                            <p>{step.what}</p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          </Block>
        )}

        {(model.tables.length > 0 || model.settings.length > 0 || model.storage.length > 0) && (
          <Block id="kt-data" n={num(list, "kt-data")} title="Where data lives" intro="Found in the code: where the project keeps what it remembers.">
            <div className="ktdoc__found">
              {model.tables.length > 0 && <Found title="Database tables" hint="Like spreadsheets the app saves to" items={model.tables} chip={chip} />}
              {model.settings.length > 0 && <Found title="Settings from the computer" hint="Environment variables the code reads" items={model.settings} chip={chip} />}
              {model.storage.length > 0 && <Found title="Kept in the browser" hint="Small notes the page saves on your computer" items={model.storage} chip={chip} />}
            </div>
          </Block>
        )}

        {(model.routes.length > 0 || model.commands.length > 0) && (
          <Block id="kt-entry" n={num(list, "kt-entry")} title="Ways in" intro="Found in the code: the commands you can run and the web addresses the project answers.">
            {model.commands.length > 0 && (
              <>
                <h4>Commands</h4>
                <ul className="ktdoc__commands">
                  {model.commands.map((c) => (
                    <li key={c.name}><code>{c.name}</code><span>{c.does}</span>{chip({ path: c.file, label: c.file })}</li>
                  ))}
                </ul>
              </>
            )}
            {model.routes.length > 0 && (
              <details className="ktdoc__routes" open={model.routes.length <= 15}>
                <summary>Web addresses ({model.routes.length})</summary>
                <table>
                  <thead><tr><th>Kind</th><th>Address</th><th>In</th></tr></thead>
                  <tbody>
                    {model.routes.map((r) => (
                      <tr key={`${r.method} ${r.path} ${r.file}`}><td><span className={`ktdoc__method ktdoc__method--${r.method.split(",")[0].toLowerCase()}`}>{r.method}</span></td><td><code>{r.path}</code></td><td>{chip({ path: r.file, label: r.file.split("/").pop()! })}</td></tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </Block>
        )}

        {model.glossary.length > 0 && (
          <Block id="kt-words" n={num(list, "kt-words")} title="Words you will see">
            <dl className="ktdoc__words">
              {model.glossary.map((g) => <div key={g.term}><dt>{g.term}</dt><dd>{g.meaning}</dd></div>)}
            </dl>
          </Block>
        )}

        {model.cautions.length > 0 && (
          <Block id="kt-careful" n={num(list, "kt-careful")} title="Careful here" intro="Things to keep in mind before changing these files.">
            <ul className="ktdoc__careful">
              {model.cautions.map((c) => <li key={c.path}>{chip(c)}<span>{c.note}</span></li>)}
            </ul>
          </Block>
        )}

        <Block id="kt-files" n={list.length} title="Every file">
          <div className="ktdoc__toolbar">
            <input type="search" data-kt-search placeholder="Find a file by name or what it does" aria-label="Find a file" />
            <div className="ktdoc__filters" role="group" aria-label="Show part">
              <button type="button" data-part-filter="" aria-pressed="true">All</button>
              {model.parts.map((p) => (
                <button key={p.id} type="button" data-part-filter={p.id} aria-pressed="false" style={{ ["--part" as string]: p.color }}>{p.name}</button>
              ))}
            </div>
            <p className="ktdoc__key">
              {(["ai", "file", "none"] as const).map((s) => <span key={s}><i className={`ktdoc__dot ktdoc__dot--${s}`} />{SOURCE_TEXT[s]}</span>)}
            </p>
            <p className="ktdoc__count" data-kt-count aria-live="polite" />
          </div>
          {model.parts.map((p) => (
            <details key={p.id} open className="ktdoc__part" data-partblock={p.id} style={{ ["--part" as string]: p.color }}>
              <summary>
                <strong>{p.name}</strong>
                <span>{p.what}</span>
                <small>{p.files} file{p.files === 1 ? "" : "s"}{p.folder ? ` · ${p.folder}/` : ""}</small>
              </summary>
              <div className="ktdoc__scroll">
                <table className="ktdoc__table">
                  <thead><tr><th>File</th><th>What it does</th><th>Uses</th><th>Used by</th></tr></thead>
                  <tbody>{p.files_list.map((f) => <FileRow key={f.path} file={f} chip={chip} />)}</tbody>
                </table>
              </div>
            </details>
          ))}
          {!model.complete && <p className="ktdoc__note">The project is too big to read every file, so some links are missing.</p>}
        </Block>
      </div>
    </div>
  );
}

function num(list: Section[], id: string) {
  return list.findIndex((s) => s.id === id) + 1;
}

function Block({ id, n, title, intro, children }: { id: string; n: number; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="ktdoc__block">
      <h3><span>{n}</span>{title}</h3>
      {intro && <p className="ktdoc__intro">{intro}</p>}
      {children}
    </section>
  );
}

function Fact({ label, text }: { label: string; text: string }) {
  return <div className="ktdoc__fact"><span>{label}</span><p>{text}</p></div>;
}

function Chip({ item, color }: { item: Ref; color: string }) {
  return (
    <a className="ktdoc__chip" href={`#${anchorOf(item.path)}`} data-jump={item.path} title={item.path} style={{ ["--part" as string]: color }}>
      {item.label}
    </a>
  );
}

function Command({ command }: { command: string }) {
  return (
    <div className="ktdoc__command">
      <code>{command}</code>
      <button type="button" data-copy={command}>Copy</button>
    </div>
  );
}

function Found({ title, hint, items, chip }: { title: string; hint: string; items: { name: string; files: string[] }[]; chip: (ref: Ref) => React.ReactNode }) {
  return (
    <div className="ktdoc__card">
      <h4>{title}</h4>
      <p className="ktdoc__hint">{hint} · found in the code</p>
      <ul>
        {items.map((item) => (
          <li key={item.name}><code>{item.name}</code><span>{item.files.map((path) => chip({ path, label: path.split("/").pop()! }))}</span></li>
        ))}
      </ul>
    </div>
  );
}

function FileRow({ file, chip }: { file: ModelFile; chip: (ref: Ref) => React.ReactNode }) {
  const search = `${file.path} ${file.what} ${file.role}`.toLowerCase();
  return (
    <tr id={file.anchor} data-file={file.path} data-part={file.part} data-search={search}>
      <td>
        <span className="ktdoc__name" title={file.path}>
          <i className={`ktdoc__dot ktdoc__dot--${file.source}`} title={SOURCE_TEXT[file.source]} />
          {file.label}
        </span>
        <span className="ktdoc__role" title={ROLE_TEXT[file.role]}>{file.role}</span>
        <small>{file.language === "Other" ? "" : `${file.language} · `}{file.lines.toLocaleString()} lines</small>
      </td>
      <td>
        {file.what ? <p>{file.what}</p> : <p className="ktdoc__empty">No note yet.</p>}
        {file.notes.map((note) => <p key={note} className="ktdoc__warn">Careful: {note}</p>)}
      </td>
      <td>{file.uses.map(chip)}</td>
      <td>
        {file.usedBy.map(chip)}
        {file.checks.length > 0 && (
          <span className="ktdoc__checked">Checked by {file.checks.map(chip)}</span>
        )}
      </td>
    </tr>
  );
}

function PartMap({ model }: { model: KtModel }) {
  const layout = mapLayout(model.parts, model.links);
  const part = new Map(model.parts.map((p) => [p.id, p]));
  return (
    <div className="ktdoc__map">
      <svg viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label="Map of the project's parts">
        <defs>
          <marker id="ktdoc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="ktdoc__arrowhead" />
          </marker>
        </defs>
        {layout.arrows.map((a) => (
          <line key={`${a.source}>${a.target}`} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} className="ktdoc__link" markerEnd="url(#ktdoc-arrow)">
            <title>{`${part.get(a.source)?.name} uses ${part.get(a.target)?.name} (${a.imports} import${a.imports === 1 ? "" : "s"})`}</title>
          </line>
        ))}
        {layout.boxes.map((b) => {
          const p = part.get(b.id)!;
          const words = wrapWords(p.what, 26).slice(0, 2);
          return (
            <g key={b.id} data-map-part={b.id} className="ktdoc__node" tabIndex={0} role="button" aria-label={`${p.name}: show its files`}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="10" style={{ fill: p.color }} className="ktdoc__nodebox" />
              <text x={b.x + 10} y={b.y + 19} className="ktdoc__nodename">{clip(p.name, 20)}</text>
              {words.map((line, i) => (
                <text key={i} x={b.x + 10} y={b.y + 34 + i * 11} className="ktdoc__nodewhat">{line}</text>
              ))}
              <text x={b.x + b.w - 10} y={b.y + 19} textAnchor="end" className="ktdoc__nodecount">{p.files}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function wrapWords(text: string, max: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && (line + " " + word).length > max) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  if (lines.length > 2) lines[1] = clip(`${lines[1]} ${lines.slice(2).join(" ")}`, max);
  return lines;
}

function clip(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
