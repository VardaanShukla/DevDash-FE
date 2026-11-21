import type { KtDetail, KtDetailFile, KtGuide, KtPart, Summary } from "../../api/types";

// The detailed KT as one document, the same on the screen, in the PDF and in the page to
// download: the facts read from the code (KtDetail), the brief KT's setup steps and pictures
// when it's written, and the project's summary. Each part has its own colour, used everywhere.

export type Ref = { path: string; label: string };
export type Source = "ai" | "file" | "none";

export type ModelFile = {
  path: string;
  label: string;
  anchor: string;
  part: string;
  role: KtDetailFile["role"];
  language: string;
  lines: number;
  what: string;
  source: Source;
  notes: string[];
  uses: Ref[];
  usedBy: Ref[];
  checks: Ref[];
};

export type ModelPart = KtPart & { color: string; files_list: ModelFile[] };

export type KtModel = {
  name: string;
  summary: string;
  audience: string;
  problem: string;
  source: string;
  date: string;
  tech: { name: string; what: string }[];
  size: KtDetail["size"];
  images: { src: string; caption: string }[];
  parts: ModelPart[];
  links: KtDetail["links"];
  reading: (Ref & { why: string; after: string | null })[];
  setup: { step: string; detail: string; command: string | null }[];
  run: { what: string; command: string }[];
  flows: { name: string; steps: (Ref & { what: string; link: string | null })[] }[];
  tables: KtDetail["tables"];
  settings: KtDetail["settings"];
  storage: KtDetail["storage"];
  routes: KtDetail["routes"];
  commands: KtDetail["commands"];
  glossary: KtDetail["glossary"];
  cautions: (Ref & { note: string })[];
  files: ModelFile[];
  complete: boolean;
  written: boolean;
  explained: number;
};

// Colours that read on light and dark pages alike; the checks are always grey.
const PALETTE = ["#5b5bd6", "#0f9d8a", "#d97706", "#e0457b", "#0284c7", "#8b5cf6", "#16a34a", "#ea580c", "#0891b2", "#a16207", "#be185d", "#4d7c0f"];
const CHECKS_COLOR = "#64748b";

export const ROLE_TEXT: Record<KtDetailFile["role"], string> = {
  "Starts the app": "Where the app starts",
  Screen: "Something you see on screen, or how it looks",
  Logic: "Does the work behind the scenes",
  Data: "Keeps or reads saved data",
  Helper: "Small tools many files share",
  Settings: "Settings for the project",
  Docs: "Text for people to read",
  Check: "An automated check (test)",
};

export const SOURCE_TEXT: Record<Source, string> = {
  ai: "Written by the AI from this file's code",
  file: "The file's own comment, word for word",
  none: "No note yet",
};

export function anchorOf(path: string) {
  return `kt-f-${path.replace(/[^\w]+/g, "-")}`;
}

// The shortest names that tell the files apart: the file name, or more of its folders when
// two files share a name (such as index.ts).
function labels(paths: string[]) {
  const result = new Map<string, string>();
  for (const path of paths) {
    const parts = path.split("/");
    let take = 1;
    while (take < parts.length && paths.some((other) => other !== path && other.split("/").slice(-take).join("/") === parts.slice(-take).join("/"))) take += 1;
    result.set(path, parts.slice(-take).join("/"));
  }
  return result;
}

export function buildModel(
  summary: Summary,
  detail: KtDetail,
  guide: KtGuide | null,
  imageUrl: (path: string) => string,
  notes: (file: KtDetailFile) => KtDetailFile["explanation"],
): KtModel {
  const names = labels(detail.files.map((f) => f.path));
  const ref = (path: string): Ref => ({ path, label: names.get(path) ?? path });
  const files: ModelFile[] = detail.files.map((f) => {
    const note = notes(f);
    return {
      path: f.path,
      label: names.get(f.path) ?? f.path,
      anchor: anchorOf(f.path),
      part: f.part,
      role: f.role,
      language: f.language,
      lines: f.lines,
      what: note?.purpose || f.own_note || "",
      source: note ? "ai" : f.own_note ? "file" : "none",
      notes: note?.notes ?? [],
      uses: f.depends_on.map(ref),
      usedBy: f.used_by.map(ref),
      checks: f.tests.map(ref),
    };
  });
  let color = 0;
  const parts: ModelPart[] = detail.parts.map((p) => ({
    ...p,
    color: p.id === "checks" ? CHECKS_COLOR : PALETTE[color++ % PALETTE.length],
    files_list: files.filter((f) => f.part === p.id),
  }));
  const source =
    detail.source.kind === "worktree"
      ? "Your working folder, with changes not committed yet"
      : `Branch ${detail.source.branch ?? "(detached)"}${detail.source.commit ? `, commit ${detail.source.commit}` : ""}`;
  const known = new Set(detail.files.map((f) => f.path));
  return {
    name: summary.name,
    summary: detail.summary || guide?.overview || summary.explanation?.overview || summary.description || summary.readme?.intro || "",
    audience: detail.audience,
    problem: detail.problem,
    source,
    date: new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }),
    tech: summary.tech.slice(0, 10),
    size: detail.size,
    images: (guide?.images ?? []).map((image) => ({ src: imageUrl(image.path), caption: image.caption })),
    parts,
    links: detail.links,
    reading: detail.reading.map((r) => ({ ...ref(r.path), why: r.why, after: r.after })),
    setup: guide?.setup ?? [],
    run: guide?.run.length ? guide.run : summary.run.map((r) => ({ what: `${r.name} (from ${r.where})`, command: r.command })),
    flows: detail.flows.map((flow) => ({ name: flow.name, steps: flow.steps.map((s) => ({ ...ref(s.path), what: s.what, link: s.link })) })),
    tables: detail.tables,
    settings: detail.settings,
    storage: detail.storage,
    routes: detail.routes,
    commands: detail.commands,
    glossary: detail.glossary,
    // From the notes on screen, which may be newer than the ones the server listed.
    cautions: cautions(files).filter((c) => known.has(c.path)),
    files,
    complete: detail.complete,
    written: detail.written,
    explained: files.filter((f) => f.source === "ai").length,
  };
}

function cautions(files: ModelFile[]) {
  return files
    .filter((f) => f.notes.length)
    .sort((a, b) => b.usedBy.length - a.usedBy.length || a.path.localeCompare(b.path))
    .map((f) => ({ path: f.path, label: f.label, note: f.notes.find((n) => !/\bunclear\b|\bempty\b/i.test(n)) ?? "" }))
    .filter((c) => c.note)
    .slice(0, 8);
}

// The map: the parts as boxes in rows, the parts that use others above the ones they use,
// and an arrow for each "uses". Parts with no links, and the checks, go in the last row.
export type MapBox = { id: string; x: number; y: number; w: number; h: number };
export type MapArrow = { source: string; target: string; imports: number; x1: number; y1: number; x2: number; y2: number };
export const MAP = { width: 660, box: { w: 148, h: 62 }, gapX: 22, gapY: 46, perRow: 4 };

export function mapLayout(parts: { id: string }[], links: KtDetail["links"]) {
  const ids = parts.map((p) => p.id);
  const linked = new Set(links.flatMap((l) => [l.source, l.target]));
  // Loops (two parts that use each other) are broken where they go against the flow: the
  // parts that use more than they are used come first, and a link back up is left out of
  // the layering (it's still drawn). Then each part sits one row below the lowest part using it.
  const score = new Map(ids.map((id) => [id, 0]));
  for (const l of links) {
    score.set(l.source, score.get(l.source)! + l.imports);
    score.set(l.target, score.get(l.target)! - l.imports);
  }
  const order = [...ids].sort((a, b) => score.get(b)! - score.get(a)!);
  const forward: KtDetail["links"] = [];
  const state = new Map<string, "open" | "done">();
  const visit = (id: string) => {
    state.set(id, "open");
    for (const l of links.filter((l) => l.source === id).sort((a, b) => score.get(b.target)! - score.get(a.target)!)) {
      if (state.get(l.target) === "open") continue;
      forward.push(l);
      if (!state.has(l.target)) visit(l.target);
    }
    state.set(id, "done");
  };
  for (const id of order) if (!state.has(id)) visit(id);
  const depth = new Map(ids.map((id) => [id, 0]));
  for (let round = 0; round < ids.length; round++) {
    let moved = false;
    for (const l of forward) {
      const next = depth.get(l.source)! + 1;
      if (next > depth.get(l.target)!) {
        depth.set(l.target, next);
        moved = true;
      }
    }
    if (!moved) break;
  }
  const rows: string[][] = [];
  const layers = [...new Set(ids.filter((id) => linked.has(id)).map((id) => depth.get(id)!))].sort((a, b) => a - b);
  for (const layer of layers) {
    const inLayer = ids.filter((id) => linked.has(id) && depth.get(id) === layer);
    for (let i = 0; i < inLayer.length; i += MAP.perRow) rows.push(inLayer.slice(i, i + MAP.perRow));
  }
  const loose = ids.filter((id) => !linked.has(id));
  for (let i = 0; i < loose.length; i += MAP.perRow) rows.push(loose.slice(i, i + MAP.perRow));
  const { w, h } = MAP.box;
  const boxes: MapBox[] = [];
  rows.forEach((row, r) => {
    const total = row.length * w + (row.length - 1) * MAP.gapX;
    row.forEach((id, i) => boxes.push({ id, x: (MAP.width - total) / 2 + i * (w + MAP.gapX), y: 8 + r * (h + MAP.gapY), w, h }));
  });
  const at = new Map(boxes.map((b) => [b.id, b]));
  const arrows: MapArrow[] = links.flatMap((l) => {
    const a = at.get(l.source);
    const b = at.get(l.target);
    if (!a || !b) return [];
    const [x1, y1] = edge(a, b.x + b.w / 2, b.y + b.h / 2);
    const [x2, y2] = edge(b, a.x + a.w / 2, a.y + a.h / 2);
    return [{ source: l.source, target: l.target, imports: l.imports, x1, y1, x2, y2 }];
  });
  return { width: MAP.width, height: 16 + rows.length * (h + MAP.gapY) - MAP.gapY, boxes, arrows };
}

// Where the line from the box's centre toward (x, y) leaves the box.
function edge(box: MapBox, x: number, y: number): [number, number] {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dx = x - cx;
  const dy = y - cy;
  if (!dx && !dy) return [cx, cy];
  const scale = Math.min(Math.abs(box.w / 2 / (dx || 1e-9)), Math.abs(box.h / 2 / (dy || 1e-9)));
  return [cx + dx * scale, cy + dy * scale];
}

// The document's sections, in order; a section with nothing to show is left out.
export type Section = { id: string; title: string };

export function sections(model: KtModel): Section[] {
  return [
    { id: "kt-minute", title: "The project in one minute" },
    { id: "kt-map", title: "The map" },
    ...(model.reading.length ? [{ id: "kt-read", title: "Understand it step by step" }] : []),
    ...(model.setup.length || model.run.length ? [{ id: "kt-run", title: "Set it up and run it" }] : []),
    ...(model.flows.length ? [{ id: "kt-flows", title: "How things flow" }] : []),
    ...(model.tables.length || model.settings.length || model.storage.length ? [{ id: "kt-data", title: "Where data lives" }] : []),
    ...(model.routes.length || model.commands.length ? [{ id: "kt-entry", title: "Ways in" }] : []),
    ...(model.glossary.length ? [{ id: "kt-words", title: "Words you will see" }] : []),
    ...(model.cautions.length ? [{ id: "kt-careful", title: "Careful here" }] : []),
    { id: "kt-files", title: "Every file" },
  ];
}
