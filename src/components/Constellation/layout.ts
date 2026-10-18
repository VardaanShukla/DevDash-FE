import type { FileChange, ProjectMap as MapData } from "../../api/types";
import type { Part } from "../ProjectMap/ProjectMap";
import { QUIET, STATUS, STATUS_COLOR, fileName, type Point } from "./shared";

// Where everything sits in the sky: parts on a ring around the project, and each part's
// little tree of folders and files. Pure functions of the data and the sky's size.

export type Entry = { path: string; bytes: number; change?: FileChange };
// One dot in a part's tree: a folder inside the part, or a file (path set).
export type Twig = {
  key: string;
  x: number;
  y: number;
  from: Point;
  r: number;
  color: string;
  name: string;
  path?: string;
  count?: string;
  title: string;
  lit: boolean;
};
// twigs is the tree as drawn in the whole sky; openTwigs is the same tree spread wider
// for the close-up, so file names have room.
export type Node = Part & { x: number; y: number; r: number; angle: number; twigs: Twig[]; openTwigs: Twig[] };

// A part's tree shows at most this many branches, and a folder this many files.
const BRANCHES = 7;
const LEAVES = 4;

export function centre(width: number, height: number): Point {
  return { x: width / 2, y: height / 2 };
}

// Every file of a part DevDash knows about: its biggest files plus anything this branch
// changed, changed ones first.
export function partFiles(part: Part): Entry[] {
  const changed = new Map(part.changed.map((file) => [file.path, file]));
  const listed = new Set(part.file_list.map((file) => file.path));
  return [
    ...part.file_list.map((file) => ({ ...file, change: changed.get(file.path) })),
    ...part.changed.filter((file) => !listed.has(file.path)).map((file) => ({ path: file.path, bytes: 0, change: file })),
  ].sort(rank);
}

const rank = (a: Entry, b: Entry) => Number(!!b.change) - Number(!!a.change) || b.bytes - a.bytes;

// Parts around the project, linked parts next to each other so lines stay short.
export function layout(parts: Part[], map: MapData, width: number, height: number): Node[] {
  if (width === 0 || parts.length === 0) return [];
  const core = centre(width, height);
  const narrow = width < 560;
  const ry = Math.max(100, height / 2 - (narrow ? 70 : 95));
  const rx = Math.max(110, Math.min(width / 2 - (narrow ? 60 : 130), ry * 1.45));
  const links = (a: string, b: string) =>
    map.edges.filter((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a)).reduce((sum, e) => sum + e.imports, 0);
  const degree = (id: string) => map.edges.filter((e) => e.source === id || e.target === id).length;
  const left = [...parts].sort((a, b) => degree(b.id) - degree(a.id) || b.files - a.files);
  const order: Part[] = [left.shift()!];
  while (left.length) {
    const last = order[order.length - 1];
    left.sort((a, b) => links(last.id, b.id) - links(last.id, a.id) || degree(b.id) - degree(a.id) || b.files - a.files);
    order.push(left.shift()!);
  }
  const most = Math.max(1, ...parts.map((p) => p.files));
  return order.map((part, i) => {
    // Alternate a little in and out, so neighbours' trees don't collide.
    const wobble = order.length > 6 ? (i % 2 ? 0.84 : 1) : 1;
    const angle = -Math.PI / 2 + (i / order.length) * Math.PI * 2;
    const r = 9 + 14 * Math.sqrt(part.files / most);
    return {
      ...part,
      angle,
      r,
      x: core.x + Math.cos(angle) * rx * wobble,
      y: core.y + Math.sin(angle) * ry * wobble,
      twigs: grow(part, angle, r, narrow ? 0.7 : 1, 1),
      openTwigs: grow(part, angle, r, narrow ? 1.5 : 2, narrow ? 1.1 : 1.3),
    };
  });
}

// A part's tree: its folders as dots with their file count, each with a few of its files,
// and its loose files. Changed files always make it in, so the branch's work is visible.
function grow(part: Part, angle: number, r: number, scale: number, widen: number): Twig[] {
  const prefix = part.path ? part.path.length + 1 : 0;
  const folders = new Map<string, Entry[]>();
  const loose: Entry[] = [];
  for (const file of partFiles(part)) {
    const rest = file.path.slice(prefix);
    const slash = rest.indexOf("/");
    if (slash > 0) folders.set(rest.slice(0, slash), [...(folders.get(rest.slice(0, slash)) ?? []), file]);
    else loose.push(file);
  }
  const folderList = [...folders.entries()].sort(
    (a, b) => Number(b[1].some((f) => f.change)) - Number(a[1].some((f) => f.change)) || b[1].length - a[1].length,
  );
  const shownFolders = folderList.slice(0, 4);
  const shownLoose = loose.slice(0, BRANCHES - shownFolders.length);
  const order = interleave([
    ...shownFolders.map(([name, list]) => ({ kind: "folder" as const, name, list })),
    ...shownLoose.map((file) => ({ kind: "file" as const, file })),
  ]);
  const spread = Math.min(1.9 * widen, 0.42 * widen * order.length);
  const twigs: Twig[] = [];
  const fileTwig = (file: Entry, at: Point, from: Point, big: number, small: number): Twig => ({
    key: file.path,
    ...at,
    from,
    r: file.change ? big : small,
    color: file.change ? STATUS_COLOR[file.change.status] : QUIET,
    name: fileName(file.path),
    path: file.path,
    count: file.change ? `+${file.change.additions}` : undefined,
    title: `${file.path}${file.change ? ` (${STATUS[file.change.status].toLowerCase()})` : ""}`,
    lit: !!file.change,
  });
  order.forEach((branch, k) => {
    const a = angle + (order.length === 1 ? 0 : (k / (order.length - 1) - 0.5) * spread);
    const reach = (r + 30 + (k % 2) * 16) * scale + (1 - scale) * r;
    const point = { x: Math.cos(a) * reach, y: Math.sin(a) * reach };
    if (branch.kind === "file") {
      twigs.push(fileTwig(branch.file, point, { x: 0, y: 0 }, 3.4, 2.4));
      return;
    }
    const lit = branch.list.some((f) => f.change);
    twigs.push({
      key: `${part.id}/${branch.name}/`,
      ...point,
      from: { x: 0, y: 0 },
      r: 4.2,
      color: lit ? STATUS_COLOR.modified : "#8fd9cf",
      name: `${branch.name}/`,
      count: String(branch.list.length),
      title: `${part.path ? `${part.path}/` : ""}${branch.name}: ${branch.list.length} file${branch.list.length === 1 ? "" : "s"}`,
      lit,
    });
    const leaves = branch.list.slice(0, LEAVES);
    leaves.forEach((file, j) => {
      const b = a + (leaves.length === 1 ? 0 : (j / (leaves.length - 1) - 0.5) * 0.7 * widen);
      // Every other leaf reaches further, so neighbouring names don't sit on each other.
      const length = 24 * scale * (j % 2 ? 1.45 : 1);
      twigs.push(fileTwig(file, { x: point.x + Math.cos(b) * length, y: point.y + Math.sin(b) * length }, point, 3, 1.8));
    });
  });
  return twigs;
}

// Folders spread through the fan rather than bunched on one side.
function interleave<T extends { kind: string }>(list: T[]): T[] {
  const folders = list.filter((b) => b.kind === "folder");
  const files = list.filter((b) => b.kind !== "folder");
  const out: T[] = [];
  while (folders.length || files.length) {
    if (files.length) out.push(files.shift()!);
    if (folders.length) out.push(folders.shift()!);
  }
  return out;
}

// Lines between parts bow toward the project, like the strands of a web.
export function curve(from: Point, to: Point, core: Point) {
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const q = { x: mid.x + (core.x - mid.x) * 0.38, y: mid.y + (core.y - mid.y) * 0.38 };
  return `M ${from.x} ${from.y} Q ${q.x} ${q.y} ${to.x} ${to.y}`;
}
