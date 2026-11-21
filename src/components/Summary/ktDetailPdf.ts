import { FULL, INDIGO, INK, KtPdf, LINE, MUTED, PAGE, SOFT, WHITE, picture, runs, width } from "./ktPdf";
import type { Font, Picture, Rgb, Word } from "./ktPdf";
import { ROLE_TEXT, SOURCE_TEXT, mapLayout, sections } from "./ktModel";
import type { KtModel, ModelFile, ModelPart, Ref, Source } from "./ktModel";

// The detailed KT as a PDF: the same sections as on screen, with the map and the flows drawn
// as pictures, each part in its own colour, and a table of every file whose header repeats on
// each page. Written twice: the first pass finds where each section and file lands, so the
// contents can give page numbers and every file name can jump to that file's row.

const AMBER: Rgb = [0.71, 0.45, 0.04];
const COLUMNS = [
  { title: "File", w: 118 },
  { title: "What it does", w: 189 },
  { title: "Uses", w: 94 },
  { title: "Used by", w: 94 },
];
const PAD = 5;
const LEADING = 10.5;
const HEADER = 17;
const DOT: Record<Source, Rgb> = { ai: INDIGO, file: AMBER, none: [0.75, 0.77, 0.82] };

type Place = { page: number; y: number };
type Line = { words: Word[]; size: number; color: Rgb; jump?: string; dot?: Rgb };

function hex(color: string): Rgb {
  const n = parseInt(color.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// The colour mixed with white: t of 1 is the colour itself.
function tint(color: Rgb, t: number): Rgb {
  return color.map((v) => 1 - (1 - v) * t) as Rgb;
}

export async function downloadDetail(model: KtModel) {
  const pictures = await Promise.all(model.images.map(async (image) => ({ caption: image.caption, found: await picture(image.src) })));
  const shown = pictures.filter((p): p is { caption: string; found: Picture } => p.found !== null);
  const first = write(model, shown, new Map());
  const pdf = write(model, shown, first.places);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(pdf.blob());
  link.download = `${model.name.replace(/[^\w.-]+/g, "-")}-KT-detailed.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function write(model: KtModel, pictures: { caption: string; found: Picture }[], known: Map<string, Place>) {
  const pdf = new KtDocPdf(`${model.name}  ·  Detailed knowledge transfer`, known);
  const color = new Map(model.parts.map((p) => [p.id, hex(p.color)]));
  const partOf = new Map(model.files.map((f) => [f.path, f.part]));
  const colorOf = (path: string) => color.get(partOf.get(path) ?? "") ?? INDIGO;
  const list = sections(model);

  pdf.cover(model.name, `Detailed knowledge transfer  ·  ${model.date}`, model.tech.map((t) => t.name).slice(0, 8));
  if (model.summary) pdf.para(model.summary, { size: 12.5 });
  pdf.para(`Read from: ${model.source}.`, { color: MUTED, size: 9.5, gap: 14 });
  pdf.contents(list);

  pdf.heading("kt-minute", "The project in one minute");
  if (model.summary) pdf.fact("What it does", model.summary);
  if (model.audience) pdf.fact("Who it's for", model.audience);
  if (model.problem) pdf.fact("The problem it solves", model.problem);
  const languages = model.size.languages.slice(0, 3).map((l) => l.name).join(", ");
  pdf.fact("How big it is", `${model.size.files} files, ${model.size.lines.toLocaleString()} lines${languages ? `, mostly ${languages}` : ""}.`);
  if (model.tech.length) {
    pdf.sub("What it's built with");
    for (const t of model.tech) pdf.row(t.name, t.what);
  }
  for (const item of pictures) pdf.picture(item.found, item.caption);

  pdf.heading("kt-map", "The map", 200);
  pdf.para("The project's parts. An arrow means one part uses code from the other.", { color: MUTED, gap: 10 });
  pdf.map(model);
  for (const p of model.parts) pdf.legend(p);

  if (model.reading.length) {
    pdf.heading("kt-read", "Understand it step by step", 90);
    pdf.para("Read these files in this order. Each one makes the next easier.", { color: MUTED, gap: 10 });
    model.reading.forEach((r, i) => pdf.reading(i + 1, r, colorOf(r.path)));
  }

  if (model.setup.length || model.run.length) {
    pdf.heading("kt-run", "Set it up and run it");
    model.setup.forEach((s, i) => {
      const text = `**${i + 1}.  ${s.step}**${s.detail ? `  ${s.detail}` : ""}`;
      if (s.command) pdf.command(text, s.command);
      else pdf.para(text, { gap: 10 });
    });
    if (model.run.length) {
      pdf.sub("Run it");
      for (const r of model.run) pdf.command(r.what, r.command);
    }
  }

  if (model.flows.length) {
    pdf.heading("kt-flows", "How things flow", 160);
    pdf.para("What happens, file by file, when you use the project. Every arrow is a real link in the code.", { color: MUTED, gap: 10 });
    for (const flow of model.flows) pdf.flow(flow, colorOf);
  }

  if (model.tables.length || model.settings.length || model.storage.length) {
    pdf.heading("kt-data", "Where data lives");
    pdf.para("Found in the code: where the project keeps what it remembers.", { color: MUTED, gap: 8 });
    const found = (title: string, hint: string, items: { name: string; files: string[] }[]) => {
      if (!items.length) return;
      pdf.sub(title, hint);
      for (const item of items) pdf.row(item.name, item.files.map((f) => f.split("/").pop()).join(", "));
    };
    found("Database tables", "Like spreadsheets the app saves to.", model.tables);
    found("Settings from the computer", "Environment variables the code reads.", model.settings);
    found("Kept in the browser", "Small notes the page saves on your computer.", model.storage);
  }

  if (model.routes.length || model.commands.length) {
    pdf.heading("kt-entry", "Ways in");
    pdf.para("Found in the code: the commands you can run and the web addresses the project answers.", { color: MUTED, gap: 8 });
    if (model.commands.length) {
      pdf.sub("Commands");
      for (const c of model.commands) pdf.row(c.name, `${c.does}  (in ${c.file})`);
    }
    if (model.routes.length) {
      pdf.sub(`Web addresses (${model.routes.length})`);
      for (const r of model.routes) pdf.route(r.method, r.path, r.file.split("/").pop()!);
    }
  }

  if (model.glossary.length) {
    pdf.heading("kt-words", "Words you will see");
    for (const g of model.glossary) pdf.para(`**${g.term}:** ${g.meaning}`, { bullet: "•", gap: 5 });
  }

  if (model.cautions.length) {
    pdf.heading("kt-careful", "Careful here");
    pdf.para("Things to keep in mind before changing these files.", { color: MUTED, gap: 8 });
    for (const c of model.cautions) pdf.para(`**${c.label}:** ${c.note}`, { bullet: "!", gap: 6 });
  }

  pdf.heading("kt-files", "Every file", 160);
  pdf.key();
  for (const part of model.parts) pdf.part(part, colorOf);
  if (!model.complete) pdf.para("The project is too big to read every file, so some links are missing.", { color: AMBER });
  return pdf;
}

class KtDocPdf extends KtPdf {
  // Where each section and file landed in this pass, and in the one before (for the jumps).
  places = new Map<string, Place>();

  constructor(footer: string, private known: Map<string, Place>) {
    super(footer);
  }

  private get here(): Place {
    return { page: this.pages.length - 1, y: this.y };
  }

  private stroke(x1: number, y1: number, x2: number, y2: number, color: Rgb, w = 1) {
    this.ops.push(`${color.map((v) => v.toFixed(3)).join(" ")} RG ${w} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }

  // An arrowhead at (x2, y2), pointing away from (x1, y1).
  private head(x1: number, y1: number, x2: number, y2: number, color: Rgb, size = 6) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const point = (a: number) => `${(x2 - size * Math.cos(angle + a)).toFixed(2)} ${(y2 - size * Math.sin(angle + a)).toFixed(2)}`;
    this.ops.push(`${color.map((v) => v.toFixed(3)).join(" ")} rg ${x2.toFixed(2)} ${y2.toFixed(2)} m ${point(0.45)} l ${point(-0.45)} l f`);
  }

  private jump(rect: [number, number, number, number], to: string) {
    const target = this.known.get(to);
    if (target) this.jumps.push({ page: this.pages.length - 1, rect, to: target });
  }

  private text(value: string, font: Font, size: number, max: number) {
    return this.wrap(runs(value, font), size, max);
  }

  contents(list: { id: string; title: string }[]) {
    this.room(40 + list.length * 18);
    this.put("Contents", PAGE.x, this.y, "B", 13, INK);
    this.y -= 22;
    list.forEach((s, i) => {
      const at = this.known.get(s.id);
      this.put(`${i + 1}`, PAGE.x, this.y, "B", 10.5, INDIGO);
      this.put(s.title, PAGE.x + 22, this.y, "R", 10.5, INK);
      if (at) {
        const number = String(at.page + 1);
        this.put(number, PAGE.x + FULL - width(number, "R", 10.5), this.y, "R", 10.5, MUTED);
        this.jump([PAGE.x, this.y - 4, PAGE.x + FULL, this.y + 12], s.id);
      }
      this.rect(PAGE.x + 22, this.y - 5, FULL - 22, 0.5, LINE);
      this.y -= 18;
    });
    this.y -= 8;
  }

  heading(id: string, title: string, keep = 40) {
    this.section(title, keep);
    const place = { page: this.pages.length - 1, y: this.y + 46 };
    this.places.set(id, place);
    this.bookmarks.push({ title, ...place });
  }

  sub(title: string, hint?: string) {
    this.room(hint ? 44 : 30);
    this.y -= 4;
    this.put(title, PAGE.x, this.y, "B", 11.5, INK);
    this.y -= hint ? 14 : 18;
    if (hint) {
      this.put(hint, PAGE.x, this.y, "I", 9, MUTED);
      this.y -= 16;
    }
  }

  fact(label: string, text: string) {
    const lines = this.text(text, "R", 10.5, FULL - 28);
    const height = 22 + lines.length * 14;
    this.room(height + 8);
    this.box(PAGE.x, this.y - height + 12, FULL, height, 8, SOFT);
    this.put(label.toUpperCase(), PAGE.x + 14, this.y - 2, "B", 8, INDIGO);
    lines.forEach((line, i) => this.line(line, PAGE.x + 14, this.y - 17 - i * 14, 10.5, INK));
    this.y -= height + 8;
  }

  map(model: KtModel) {
    const layout = mapLayout(model.parts, model.links);
    const scale = FULL / layout.width;
    const height = layout.height * scale;
    this.room(height + 16);
    const top = this.y + 6;
    const X = (x: number) => PAGE.x + x * scale;
    const Y = (y: number) => top - y * scale;
    for (const a of layout.arrows) {
      this.stroke(X(a.x1), Y(a.y1), X(a.x2), Y(a.y2), MUTED, 0.9);
      this.head(X(a.x1), Y(a.y1), X(a.x2), Y(a.y2), MUTED);
    }
    const part = new Map(model.parts.map((p) => [p.id, p]));
    for (const b of layout.boxes) {
      const p = part.get(b.id)!;
      const x = X(b.x);
      const y = Y(b.y + b.h);
      const w = b.w * scale;
      const h = b.h * scale;
      this.box(x, y, w, h, 7, hex(p.color));
      const name = this.text(p.name, "B", 9.5, w - 26)[0] ?? [];
      this.line(name, x + 8, y + h - 14, 9.5, WHITE);
      const count = String(p.files);
      this.put(count, x + w - 8 - width(count, "B", 8.5), y + h - 14, "B", 8.5, WHITE);
      const what = this.text(p.what, "R", 7, w - 16);
      if (what.length > 2) what[1] = this.text(`${what[1].map((word) => word.text).join(" ")}…`, "R", 7, w - 16)[0];
      what.slice(0, 2).forEach((line, i) => this.line(line, x + 8, y + h - 27 - i * 9, 7, WHITE));
      this.jump([x, y, x + w, y + h], `part:${p.id}`);
    }
    this.y = top - height - 16;
  }

  legend(p: ModelPart) {
    const lines = this.text(`**${p.name}** (${p.files} file${p.files === 1 ? "" : "s"})${p.what ? `: ${p.what}` : ""}`, "R", 10, FULL - 22);
    this.room(lines.length * 14 + 4);
    this.box(PAGE.x, this.y - 1, 10, 10, 2.5, hex(p.color));
    lines.forEach((line, i) => this.line(line, PAGE.x + 20, this.y - i * 14, 10, INK));
    this.y -= lines.length * 14 + 4;
  }

  reading(n: number, r: Ref & { why: string; after: string | null }, color: Rgb) {
    const why = this.text(r.why, "R", 10, FULL - 34);
    const after = r.after ? this.text(r.after, "I", 9.5, FULL - 34) : [];
    const height = 16 + why.length * 14 + after.length * 13 + 8;
    this.room(height);
    this.box(PAGE.x, this.y - 6, 22, 22, 11, INDIGO);
    const number = String(n);
    this.put(number, PAGE.x + 11 - width(number, "B", 10) / 2, this.y + 1, "B", 10, WHITE);
    this.put(r.label, PAGE.x + 34, this.y + 1, "MB", 10, color);
    this.jump([PAGE.x + 34, this.y - 3, PAGE.x + 34 + width(r.label, "MB", 9.2), this.y + 10], `file:${r.path}`);
    let y = this.y - 15;
    why.forEach((line) => {
      this.line(line, PAGE.x + 34, y, 10, INK);
      y -= 14;
    });
    after.forEach((line) => {
      this.line(line, PAGE.x + 34, y, 9.5, MUTED);
      y -= 13;
    });
    this.y = y - 8;
  }

  // A flow: numbered boxes, each a file and what it does there, joined by arrows that say how.
  flow(flow: KtModel["flows"][number], colorOf: (path: string) => Rgb) {
    const inner = FULL - 52;
    const boxes = flow.steps.map((s) => this.text(s.what, "R", 9.5, inner));
    const heightOf = (i: number) => 26 + boxes[i].length * 12.5;
    this.room(30 + heightOf(0) + 10);
    this.y -= 2;
    this.put(flow.name, PAGE.x, this.y, "B", 11.5, INK);
    this.y -= 18;
    flow.steps.forEach((step, i) => {
      if (i > 0) {
        this.room(22 + heightOf(i));
        const x = PAGE.x + 22;
        this.stroke(x, this.y + 12, x, this.y - 8, MUTED, 1);
        this.head(x, this.y + 12, x, this.y - 9, MUTED, 5);
        this.put(step.link === "used by" ? "which is used by" : "which uses", x + 10, this.y - 2, "I", 8.5, MUTED);
        this.y -= 20;
      }
      const color = colorOf(step.path);
      const h = heightOf(i);
      const bottom = this.y - h + 12;
      this.box(PAGE.x, bottom, FULL, h, 7, tint(color, 0.1));
      this.rect(PAGE.x, bottom + 4, 3.5, h - 8, color);
      this.box(PAGE.x + 12, this.y - 8, 20, 20, 10, color);
      const number = String(i + 1);
      this.put(number, PAGE.x + 22 - width(number, "B", 9.5) / 2, this.y - 1.5, "B", 9.5, WHITE);
      this.put(step.label, PAGE.x + 42, this.y, "MB", 9.5, color);
      this.jump([PAGE.x + 42, this.y - 3, PAGE.x + 42 + width(step.label, "MB", 8.74), this.y + 10], `file:${step.path}`);
      boxes[i].forEach((line, k) => this.line(line, PAGE.x + 42, this.y - 14 - k * 12.5, 9.5, INK));
      this.y = bottom - 4;
    });
    this.y -= 14;
  }

  route(method: string, path: string, file: string) {
    this.room(13);
    this.put(method, PAGE.x, this.y, "B", 8, method.startsWith("GET") ? [0.06, 0.55, 0.48] : AMBER);
    const where = this.text(path, "M", 8.5, FULL - 170)[0] ?? [];
    this.line(where, PAGE.x + 56, this.y, 8.5, INK, INK);
    this.put(file, PAGE.x + FULL - width(file, "R", 8.5), this.y, "R", 8.5, MUTED);
    this.y -= 13;
  }

  // What the three kinds of note look like in the tables.
  key() {
    this.room(30);
    let x = PAGE.x;
    for (const s of ["ai", "file", "none"] as Source[]) {
      this.box(x, this.y - 1, 7, 7, 3.5, DOT[s]);
      this.put(SOURCE_TEXT[s], x + 11, this.y, "R", 9, MUTED);
      x += width(SOURCE_TEXT[s], "R", 9) + 30;
    }
    this.y -= 22;
  }

  part(part: ModelPart, colorOf: (path: string) => Rgb) {
    const color = hex(part.color);
    const what = this.text(part.what || " ", "R", 9.5, FULL - 24);
    const height = 24 + what.length * 12;
    this.room(height + HEADER + LEADING * 4);
    this.places.set(`part:${part.id}`, this.here);
    this.rect(PAGE.x, this.y - height + 14, FULL, height, tint(color, 0.14));
    this.rect(PAGE.x, this.y - height + 14, 5, height, color);
    this.put(part.name, PAGE.x + 14, this.y, "B", 12.5, INK);
    const count = `${part.files} file${part.files === 1 ? "" : "s"}${part.folder ? `  ·  ${part.folder}/` : ""}`;
    this.put(count, PAGE.x + FULL - 8 - width(count, "R", 8.5), this.y, "R", 8.5, MUTED);
    what.forEach((line, i) => this.line(line, PAGE.x + 14, this.y - 15 - i * 12, 9.5, MUTED));
    this.y -= height + 2;
    this.header(color);
    part.files_list.forEach((f, i) => this.tableRow(this.cells(f, colorOf), i % 2 === 1, color, f.path));
    this.y -= 10;
  }

  private header(color: Rgb) {
    this.room(HEADER + LEADING * 3);
    this.rect(PAGE.x, this.y - HEADER + 12, FULL, HEADER, tint(color, 0.85));
    let x = PAGE.x;
    for (const column of COLUMNS) {
      this.put(column.title, x + PAD, this.y, "B", 8, WHITE);
      x += column.w;
    }
    this.y -= HEADER;
  }

  // A row's lines column by column; when the page is full, the rest of each column goes on
  // the next page, under the header again.
  private tableRow(cells: Line[][], shaded: boolean, color: Rgb, path: string) {
    const done = cells.map(() => 0);
    let first = true;
    for (;;) {
      const left = Math.max(...cells.map((cell, i) => cell.length - done[i]));
      if (left <= 0) break;
      let fits = Math.floor((this.y - PAGE.bottom - 4) / LEADING);
      if (fits < Math.min(left, 3)) {
        this.page();
        this.header(color);
        fits = Math.floor((this.y - PAGE.bottom - 4) / LEADING);
      }
      if (first) this.places.set(`file:${path}`, this.here);
      first = false;
      const take = Math.min(left, fits);
      const height = take * LEADING + 6;
      const top = this.y + 11;
      if (shaded) this.rect(PAGE.x, top - height, FULL, height, SOFT);
      let x = PAGE.x;
      cells.forEach((cell, i) => {
        cell.slice(done[i], done[i] + take).forEach((line, j) => {
          const y = this.y - j * LEADING;
          let left = x + PAD;
          if (line.dot) {
            this.box(left, y - 0.5, 6, 6, 3, line.dot);
            left += 10;
          }
          this.line(line.words, left, y, line.size, line.color, line.color);
          if (line.jump) {
            const last = line.words[line.words.length - 1];
            const end = last ? last.x + width(last.text, last.font, line.size * (last.font.startsWith("M") ? 0.92 : 1)) : 0;
            this.jump([left, y - 2.5, left + end, y + line.size], `file:${line.jump}`);
          }
        });
        done[i] = Math.min(cell.length, done[i] + take);
        x += COLUMNS[i].w;
      });
      this.y -= height;
      this.rect(PAGE.x, this.y + 11, FULL, 0.6, LINE);
      this.y -= 3;
    }
  }

  private cells(file: ModelFile, colorOf: (path: string) => Rgb): Line[][] {
    const inner = (i: number) => COLUMNS[i].w - 2 * PAD;
    const text = (value: string, font: Font, size: number, color: Rgb, i: number, less = 0): Line[] =>
      this.text(value, font, size, inner(i) - less).map((words) => ({ words, size, color }));
    const refs = (list: Ref[], i: number): Line[] =>
      list.flatMap((ref) => this.path(ref.label, 7.5, inner(i)).map((words) => ({ words, size: 7.5, color: colorOf(ref.path), jump: ref.path })));

    const name = this.path(file.label, 8.5, inner(0) - 10, "MB").map((words, k) => ({ words, size: 8.5, color: INK, ...(k === 0 ? { dot: DOT[file.source] } : {}) }));
    const facts = [
      ...name,
      ...text(file.role, "B", 7.5, colorOf(file.path), 0),
      ...text(`${file.language === "Other" ? "" : `${file.language} · `}${file.lines.toLocaleString()} lines`, "R", 7.5, MUTED, 0),
    ];
    const what = [
      ...(file.what ? text(file.what, "R", 8.5, INK, 1) : text(`No note yet. ${ROLE_TEXT[file.role]}.`, "I", 8.5, MUTED, 1)),
      ...file.notes.flatMap((note) => text(`Careful: ${note}`, "R", 7.5, AMBER, 1)),
    ];
    const used = [
      ...refs(file.usedBy, 3),
      ...(file.checks.length ? [...text("Checked by:", "B", 7, MUTED, 3), ...refs(file.checks, 3)] : []),
    ];
    return [facts, what, refs(file.uses, 2), used];
  }

  // A file name on as few lines as fit, broken after a slash where it must break.
  private path(path: string, size: number, max: number, font: Font = "M"): Word[][] {
    const fit = size * 0.92;
    const lines: Word[][] = [];
    let current = "";
    for (const piece of path.split(/(?<=\/)/)) {
      if (current && width(current + piece, font, fit) > max) {
        lines.push(...this.wrap([{ text: current, font }], size, max));
        current = "";
      }
      current += piece;
    }
    if (current) lines.push(...this.wrap([{ text: current, font }], size, max));
    return lines;
  }
}
