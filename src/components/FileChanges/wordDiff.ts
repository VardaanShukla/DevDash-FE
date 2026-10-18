// Marks the words that differ between a line before and after an edit, so a one-word
// change doesn't read as a whole new line.

export type Segment = { text: string; changed: boolean };

const MAX_CELLS = 40_000;

function tokens(text: string) {
  return text.match(/\w+|\s+|[^\w\s]/g) ?? [];
}

export function wordDiff(before: string, after: string): { before: Segment[]; after: Segment[] } | null {
  const a = tokens(before);
  const b = tokens(after);
  if (a.length * b.length > MAX_CELLS) return null;

  // Longest common subsequence of tokens.
  const table = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const keptA = new Array<boolean>(a.length).fill(false);
  const keptB = new Array<boolean>(b.length).fill(false);
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i] === b[j]) {
      keptA[i++] = true;
      keptB[j++] = true;
    } else if (table[i + 1][j] >= table[i][j + 1]) i++;
    else j++;
  }

  // Lines that share little are a rewrite: marking every word would only be noise.
  const shared = keptA.reduce((n, kept, i) => n + (kept && a[i].trim() ? 1 : 0), 0);
  const words = Math.max(a.filter((t) => t.trim()).length, b.filter((t) => t.trim()).length);
  if (words > 0 && shared / words < 0.4) return null;

  return { before: merge(a, keptA), after: merge(b, keptB) };
}

function merge(parts: string[], kept: boolean[]): Segment[] {
  const result: Segment[] = [];
  parts.forEach((text, i) => {
    // Whitespace between two changed words joins them into one mark.
    const changed = !kept[i] || (/^\s+$/.test(text) && !kept[i - 1] && !kept[i + 1] && i > 0);
    const last = result[result.length - 1];
    if (last && last.changed === changed) last.text += text;
    else result.push({ text, changed });
  });
  return result;
}
