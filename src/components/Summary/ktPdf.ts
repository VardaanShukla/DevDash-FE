import type { KtGuide, Summary } from "../../api/types";

// The KT as a PDF, to keep or hand to another developer. Written by hand with the PDF's own
// fonts (Helvetica and Courier), so it needs no library and no print dialog. The project's
// pictures go in as JPEGs, whatever they were, written as hex so the file stays plain text.

export type Font = "R" | "B" | "I" | "M" | "MB";
export type Rgb = [number, number, number];
export type Picture = { hex: string; w: number; h: number };
export type Word = { text: string; font: Font; x: number };

export const INK: Rgb = [0.1, 0.11, 0.17];
export const MUTED: Rgb = [0.42, 0.44, 0.52];
export const NAVY: Rgb = [0.05, 0.06, 0.13];
export const INDIGO: Rgb = [0.31, 0.33, 0.86];
export const SOFT: Rgb = [0.95, 0.955, 0.985];
export const LINE: Rgb = [0.87, 0.88, 0.93];
export const WHITE: Rgb = [1, 1, 1];
const PALE: Rgb = [0.72, 0.75, 0.9];
const COMMAND: Rgb = [0.93, 0.95, 1];
export const PAGE = { w: 595.28, h: 841.89, x: 50, top: 58, bottom: 62 };
export const FULL = PAGE.w - 2 * PAGE.x;
const COVER = 172;
const FONTS: Record<Font, string> = { R: "Helvetica", B: "Helvetica-Bold", I: "Helvetica-Oblique", M: "Courier", MB: "Courier-Bold" };
const MAX_PICTURE_PIXELS = 1400;
const MAX_PICTURE_HEIGHT = 300;

// The PDF fonts' own encoding (WinAnsi): the typographic marks have their own codes; other
// characters outside Latin-1 fall back to a near spelling.
const WIN_ANSI: Record<string, number> = { "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "…": 0x85, "€": 0x80 };
const NEAR: Record<string, string> = { "→": "->", "←": "<-", "≤": "<=", "≥": ">=", " ": " " };

function encode(text: string) {
  let hex = "";
  for (const ch of text) {
    const code = WIN_ANSI[ch] ?? ch.codePointAt(0)!;
    if (code < 256 && !(code >= 0x7f && code < 0xa0 && !Object.values(WIN_ANSI).includes(code))) hex += code.toString(16).padStart(2, "0");
    else for (const c of NEAR[ch] ?? "?") hex += c.charCodeAt(0).toString(16).padStart(2, "0");
  }
  return `<${hex}>`;
}

// Text widths, measured once per font: Arial (or Liberation Sans, where it stands in) has
// Helvetica's metrics, and Courier is 0.6 of the size for every character.
let ruler: CanvasRenderingContext2D | null = null;
export function width(text: string, font: Font, size: number) {
  if (font === "M" || font === "MB") return [...text].length * 0.6 * size;
  ruler ??= document.createElement("canvas").getContext("2d");
  if (!ruler) return text.length * 0.5 * size;
  ruler.font = `${font === "B" ? "bold " : font === "I" ? "italic " : ""}100px Helvetica, Arial, "Liberation Sans", sans-serif`;
  return (ruler.measureText(text).width / 100) * size;
}

// "**bold**" and "`code`" inside a line become runs in their own fonts.
export function runs(text: string, base: Font): { text: string; font: Font }[] {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/)
    .filter(Boolean)
    .map((part) =>
      part.startsWith("**") && part.endsWith("**") && part.length > 4
        ? { text: part.slice(2, -2), font: "B" as Font }
        : part.startsWith("`") && part.endsWith("`") && part.length > 2
          ? { text: part.slice(1, -1), font: "M" as Font }
          : { text: part, font: base },
    );
}

// A picture's size on the page.
function fitted(image: Picture) {
  const scale = Math.min(FULL / image.w, MAX_PICTURE_HEIGHT / image.h);
  return [image.w * scale, image.h * scale];
}

const rgb = (c: Rgb) => c.map((v) => v.toFixed(3)).join(" ");

// One picture as a JPEG, on white in case it has see-through parts; null if it can't be read.
export function picture(url: string): Promise<Picture | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onerror = () => resolve(null);
    image.onload = () => {
      const scale = Math.min(1, MAX_PICTURE_PIXELS / image.naturalWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const draw = canvas.getContext("2d");
      if (!draw) return resolve(null);
      draw.fillStyle = "#fff";
      draw.fillRect(0, 0, canvas.width, canvas.height);
      draw.drawImage(image, 0, 0, canvas.width, canvas.height);
      const binary = atob(canvas.toDataURL("image/jpeg", 0.85).split(",")[1]);
      let hex = "";
      for (let i = 0; i < binary.length; i++) hex += binary.charCodeAt(i).toString(16).padStart(2, "0");
      resolve({ hex, w: canvas.width, h: canvas.height });
    };
    image.src = url;
  });
}

export async function downloadGuide(summary: Summary, guide: KtGuide, imageUrl: (path: string) => string) {
  const pictures = await Promise.all(guide.images.map(async (image) => ({ ...image, found: await picture(imageUrl(image.path)) })));
  const shown = pictures.filter((p) => p.found);
  const pdf = new KtPdf(`${summary.name}  ·  Knowledge transfer`);
  const date = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  pdf.cover(summary.name, `Written by DevDash on ${date}`, summary.tech.map((t) => t.name).slice(0, 8));
  pdf.section("What it is");
  pdf.para(guide.overview, { size: 11 });
  if (guide.needs.length) {
    pdf.section("What you need");
    for (const need of guide.needs) {
      pdf.para(need.why ? `**${need.name}:** ${need.why}` : `**${need.name}**`, { bullet: "•", gap: need.check ? 2 : 6 });
      if (need.check) pdf.para(`Check with \`${need.check}\``, { color: MUTED, size: 9.5, bullet: " " });
    }
  }
  if (guide.setup.length) {
    pdf.section("Set it up");
    guide.setup.forEach((item, i) => {
      if (item.detail) pdf.para(`**${i + 1}.  ${item.step}**`, { gap: 2 });
      if (item.detail && !item.command) pdf.para(item.detail, { color: MUTED, gap: 10 });
      else if (item.command) pdf.command(item.detail || `${i + 1}.  ${item.step}`, item.command, item.detail ? MUTED : INK);
      else pdf.para(`${i + 1}.  ${item.step}`, { gap: 10 });
    });
  }
  if (guide.run.length) {
    pdf.section("Run it");
    for (const item of guide.run) pdf.command(item.what, item.command);
  }
  if (guide.how_to_use.length) {
    pdf.section("How to use it");
    guide.how_to_use.forEach((step, i) => pdf.para(step, { bullet: `${i + 1}.` }));
  }
  if (shown.length) {
    pdf.section("What it looks like", fitted(shown[0].found!)[1] + 34);
    for (const item of shown) pdf.picture(item.found!, item.caption);
  }
  if (guide.settings.length) {
    pdf.section("Settings to fill in");
    for (const item of guide.settings) pdf.row(item.name, item.what);
  }
  if (guide.functions.length) {
    pdf.section("Major functions", 150);
    pdf.para("The functions a developer meets first, and when to reach for each.", { color: MUTED, gap: 10 });
    for (const item of guide.functions) pdf.fn(item);
  }
  if (guide.start_here.length) {
    pdf.section("Read these first");
    for (const item of guide.start_here) pdf.row(item.path, item.why);
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(pdf.blob());
  link.download = `${summary.name.replace(/[^\w.-]+/g, "-")}-KT.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

type Para = { size?: number; font?: Font; color?: Rgb; bullet?: string; gap?: number };

export class KtPdf {
  protected pages: string[][] = [];
  private pictures: Picture[] = [];
  protected y = 0;
  // Bookmarks for the PDF's side panel, and places on a page that jump to another: both point
  // at a page and a height on it. Only the detailed KT adds them.
  protected bookmarks: { title: string; page: number; y: number }[] = [];
  protected jumps: { page: number; rect: [number, number, number, number]; to: { page: number; y: number } }[] = [];
  private sections = 0;
  constructor(private footer: string) {
    this.page();
  }

  protected page() {
    this.pages.push([]);
    this.y = PAGE.h - PAGE.top;
  }

  protected get ops() {
    return this.pages[this.pages.length - 1];
  }

  // Starts a new page unless `height` still fits on this one.
  protected room(height: number) {
    if (this.y - height < PAGE.bottom) this.page();
  }

  protected put(text: string, x: number, y: number, font: Font, size: number, color: Rgb) {
    this.ops.push(`BT /${font} ${size} Tf ${rgb(color)} rg ${x.toFixed(2)} ${y.toFixed(2)} Td ${encode(text)} Tj ET`);
  }

  protected rect(x: number, y: number, w: number, h: number, color: Rgb) {
    this.ops.push(`${rgb(color)} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  }

  // A filled box with round corners, drawn with four curves.
  protected box(x: number, y: number, w: number, h: number, r: number, color: Rgb) {
    const k = r * 0.45;
    const [l, b, t, e] = [x, y, y + h, x + w].map((v) => v.toFixed(2));
    const n = (v: number) => v.toFixed(2);
    this.ops.push(
      `${rgb(color)} rg ${n(x + r)} ${b} m ${n(x + w - r)} ${b} l ` +
        `${n(x + w - k)} ${b} ${e} ${n(y + k)} ${e} ${n(y + r)} c ${e} ${n(y + h - r)} l ` +
        `${e} ${n(y + h - k)} ${n(x + w - k)} ${t} ${n(x + w - r)} ${t} c ${n(x + r)} ${t} l ` +
        `${n(x + k)} ${t} ${l} ${n(y + h - k)} ${l} ${n(y + h - r)} c ${l} ${n(y + r)} l ` +
        `${l} ${n(y + k)} ${n(x + k)} ${b} ${n(x + r)} ${b} c f`,
    );
  }

  cover(name: string, written: string, tech: string[]) {
    const bottom = PAGE.h - COVER;
    this.rect(0, bottom, PAGE.w, COVER, NAVY);
    this.rect(0, bottom - 3, PAGE.w, 3, INDIGO);
    this.put("KNOWLEDGE TRANSFER", PAGE.x, PAGE.h - 54, "B", 10, PALE);
    const lines = this.wrap(runs(name, "B"), 30, FULL).slice(0, 2);
    let y = PAGE.h - 92;
    for (const line of lines) {
      this.line(line, PAGE.x, y, 30, WHITE);
      y -= 34;
    }
    this.put(written, PAGE.x, bottom + 24, "R", 10, PALE);
    this.y = bottom - 34;
    if (!tech.length) return;
    let x = PAGE.x;
    for (const name of tech) {
      const w = width(name, "B", 8.5) + 16;
      if (x + w > PAGE.w - PAGE.x) {
        x = PAGE.x;
        this.y -= 24;
      }
      this.box(x, this.y - 6, w, 19, 9.5, SOFT);
      this.put(name, x + 8, this.y, "B", 8.5, INDIGO);
      x += w + 6;
    }
    this.y -= 22;
  }

  // A numbered heading, kept on a page with the `keep` points that follow it.
  section(text: string, keep = 40) {
    this.room(46 + keep);
    this.sections += 1;
    this.y -= 16;
    const number = String(this.sections);
    this.box(PAGE.x, this.y - 6, 22, 22, 6, INDIGO);
    this.put(number, PAGE.x + 11 - width(number, "B", 11) / 2, this.y + 1, "B", 11, WHITE);
    this.put(text, PAGE.x + 32, this.y, "B", 15, INK);
    this.y -= 30;
  }

  para(text: string, { size = 10.5, font = "R", color = INK, bullet, gap = 6 }: Para = {}) {
    const indent = bullet ? 20 : 0;
    const leading = size * 1.5;
    this.wrap(runs(text, font), size, FULL - indent).forEach((line, i) => {
      this.room(leading);
      if (bullet && i === 0) this.put(bullet, PAGE.x + 3, this.y, "B", size, INDIGO);
      this.line(line, PAGE.x + indent, this.y, size, color);
      this.y -= leading;
    });
    this.y -= gap - (leading - size * 1.2);
  }

  // A command in a dark panel, kept together with the words above it.
  command(label: string, command: string, color: Rgb = INK) {
    const size = 10.5;
    const lines = this.wrap([{ text: command, font: "M" }], size, FULL - 28);
    const words = this.wrap(runs(label, "R"), 10.5, FULL);
    const height = lines.length * 13 + 15;
    this.room(height + 20 + words.length * 15);
    words.forEach((line, i) => this.line(line, PAGE.x, this.y - i * 15, 10.5, color));
    this.y -= 9 + (words.length - 1) * 15;
    this.box(PAGE.x, this.y - height, FULL, height, 6, NAVY);
    lines.forEach((line, i) => this.line(line, PAGE.x + 14, this.y - 18 - i * 13, size, COMMAND, COMMAND));
    this.y -= height + 19;
  }

  // A name and what it's for, side by side, with a line under them.
  row(name: string, text: string) {
    const left = 190;
    const names = this.wrap([{ text: name, font: "M" }], 9.5, left - 14);
    const words = this.wrap(runs(text, "R"), 10, FULL - left);
    const height = Math.max(names.length, words.length) * 14 + 7;
    this.room(height);
    names.forEach((line, i) => this.line(line, PAGE.x, this.y - i * 14, 9.5, INK));
    words.forEach((line, i) => this.line(line, PAGE.x + left, this.y - i * 14, 10, INK));
    this.y -= height;
    this.rect(PAGE.x, this.y + 11, FULL, 0.6, LINE);
    this.y -= 4;
  }

  // One function in a card: its name and file, its signature, what it does, when to use it.
  fn(item: KtGuide["functions"][number]) {
    const pad = 14;
    const inner = FULL - 2 * pad - 3;
    const signature = item.signature ? this.wrap([{ text: item.signature, font: "M" }], 8.5, inner).slice(0, 3) : [];
    const what = this.wrap(runs(item.what, "R"), 10, inner);
    const use = item.use ? this.wrap(runs(`**When to use it:** ${item.use}`, "R"), 10, inner) : [];
    const height = pad * 2 + 13 + 13 + signature.length * 11.5 + (signature.length ? 6 : 0) + what.length * 14 + (use.length ? 4 + use.length * 14 : 0) - 4;
    this.room(height + 10);
    const top = this.y + 10;
    this.box(PAGE.x, top - height, FULL, height, 7, SOFT);
    this.rect(PAGE.x, top - height + 8, 3, height - 16, INDIGO);
    const x = PAGE.x + pad + 3;
    let y = top - pad - 9;
    this.line(this.wrap([{ text: item.name, font: "MB" }], 11, inner)[0], x, y, 11, INDIGO);
    y -= 13;
    this.put(item.path, x, y, "M", 8.5, MUTED);
    y -= 13;
    signature.forEach((line) => {
      this.line(line, x, y - 2, 8.5, INK, INK);
      y -= 11.5;
    });
    if (signature.length) y -= 6;
    what.forEach((line) => {
      this.line(line, x, y, 10, INK);
      y -= 14;
    });
    if (use.length) y -= 4;
    use.forEach((line) => {
      this.line(line, x, y, 10, INK);
      y -= 14;
    });
    this.y = top - height - 22;
  }

  picture(image: Picture, caption: string) {
    const [w, h] = fitted(image);
    this.room(h + 34);
    this.pictures.push(image);
    const bottom = this.y - h;
    this.rect(PAGE.x - 0.6, bottom - 0.6, w + 1.2, h + 1.2, LINE);
    this.ops.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${PAGE.x} ${bottom.toFixed(2)} cm /Im${this.pictures.length - 1} Do Q`);
    this.put(caption, PAGE.x, bottom - 14, "I", 9, MUTED);
    this.y = bottom - 36;
  }

  protected line(words: Word[], left: number, y: number, size: number, color: Rgb, code: Rgb = INDIGO) {
    for (const w of words) {
      const mono = w.font === "M" || w.font === "MB";
      this.put(w.text, left + w.x, y, w.font, mono ? size * 0.92 : size, mono && w.font === "M" ? code : color);
    }
  }

  // Breaks runs into lines that fit `max`; a word too long for a line (a long path) is cut.
  protected wrap(parts: { text: string; font: Font }[], size: number, max: number) {
    const lines: Word[][] = [[]];
    let x = 0;
    const space = width(" ", "R", size);
    for (const part of parts) {
      const mono = part.font === "M" || part.font === "MB";
      const fit = mono ? size * 0.92 : size;
      for (const token of part.text.split(/(\s+)/)) {
        if (!token) continue;
        if (/^\s+$/.test(token)) {
          if (x > 0) x += space;
          continue;
        }
        let rest = token;
        while (rest) {
          let piece = rest;
          let w = width(piece, part.font, fit);
          if (x + w > max && x > 0) {
            lines.push([]);
            x = 0;
          }
          while (w > max && piece.length > 1) {
            piece = piece.slice(0, Math.max(1, Math.floor((piece.length * max) / w)));
            w = width(piece, part.font, fit);
          }
          lines[lines.length - 1].push({ text: piece, font: part.font, x });
          x += w;
          rest = rest.slice(piece.length);
          if (rest) {
            lines.push([]);
            x = 0;
          }
        }
      }
    }
    return lines.filter((l) => l.length);
  }

  blob() {
    const total = this.pages.length;
    const objects: string[] = [];
    const fontIds: Record<string, number> = {};
    // 1: catalog, 2: pages, then the fonts, then a content stream and a page per page, then pictures.
    Object.entries(FONTS).forEach(([key, name], i) => {
      fontIds[key] = 3 + i;
      objects[3 + i] = `<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`;
    });
    const fonts = Object.entries(fontIds)
      .map(([key, id]) => `/${key} ${id} 0 R`)
      .join(" ");
    const first = 3 + Object.keys(FONTS).length;
    const firstPicture = first + total * 2;
    const firstJump = firstPicture + this.pictures.length;
    const firstMark = firstJump + this.jumps.length;
    const pageId = (i: number) => first + i * 2 + 1;
    const at = (to: { page: number; y: number }) => `[${pageId(to.page)} 0 R /XYZ 0 ${Math.min(PAGE.h, to.y + 30).toFixed(2)} null]`;
    const images = this.pictures.map((_, i) => `/Im${i} ${firstPicture + i} 0 R`).join(" ");
    const resources = `/Font << ${fonts} >>${images ? ` /XObject << ${images} >>` : ""}`;
    const kids: string[] = [];
    this.pages.forEach((ops, i) => {
      const number = `${i + 1} / ${total}`;
      const frame = [
        ...(i > 0 ? [`${rgb(NAVY)} rg 0 ${(PAGE.h - 10).toFixed(2)} ${PAGE.w} 10 re f`, `${rgb(INDIGO)} rg 0 ${(PAGE.h - 12).toFixed(2)} ${PAGE.w} 2 re f`] : []),
        `${rgb(LINE)} rg ${PAGE.x} 46 ${FULL} 0.6 re f`,
        `${rgb(MUTED)} rg`,
        `BT /R 8.5 Tf ${PAGE.x} 32 Td ${encode(this.footer)} Tj ET`,
        `BT /R 8.5 Tf ${(PAGE.w - PAGE.x - width(number, "R", 8.5)).toFixed(2)} 32 Td ${encode(number)} Tj ET`,
      ];
      const stream = [...ops, ...frame].join("\n");
      const content = first + i * 2;
      objects[content] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
      const annots = this.jumps.map((jump, k) => (jump.page === i ? `${firstJump + k} 0 R` : "")).filter(Boolean);
      objects[content + 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.w} ${PAGE.h}] /Resources << ${resources} >> /Contents ${content} 0 R${annots.length ? ` /Annots [${annots.join(" ")}]` : ""} >>`;
      kids.push(`${content + 1} 0 R`);
    });
    this.pictures.forEach((image, i) => {
      const data = `${image.hex}>`;
      objects[firstPicture + i] = `<< /Type /XObject /Subtype /Image /Width ${image.w} /Height ${image.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${data.length} >>\nstream\n${data}\nendstream`;
    });
    this.jumps.forEach((jump, k) => {
      objects[firstJump + k] = `<< /Type /Annot /Subtype /Link /Rect [${jump.rect.map((v) => v.toFixed(2)).join(" ")}] /Border [0 0 0] /Dest ${at(jump.to)} >>`;
    });
    const marks = this.bookmarks.length;
    this.bookmarks.forEach((mark, k) => {
      const id = firstMark + 1 + k;
      objects[id] = `<< /Title ${encode(mark.title)} /Parent ${firstMark} 0 R${k ? ` /Prev ${id - 1} 0 R` : ""}${k < marks - 1 ? ` /Next ${id + 1} 0 R` : ""} /Dest ${at(mark)} >>`;
    });
    if (marks) objects[firstMark] = `<< /Type /Outlines /First ${firstMark + 1} 0 R /Last ${firstMark + marks} 0 R /Count ${marks} >>`;
    objects[1] = `<< /Type /Catalog /Pages 2 0 R${marks ? ` /Outlines ${firstMark} 0 R /PageMode /UseOutlines` : ""} >>`;
    objects[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${total} >>`;
    // Everything above is plain ASCII (text and pictures are hex), so string length is the byte count.
    let out = "%PDF-1.4\n";
    const offsets: number[] = [];
    for (let id = 1; id < objects.length; id++) {
      offsets[id] = out.length;
      out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }
    const xref = out.length;
    out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objects.length; id++) out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
    out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return new Blob([out], { type: "application/pdf" });
  }
}
