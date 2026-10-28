import type { PlacedWidget } from "../../api/types";

// Placing widgets on Home's grid: COLUMNS wide, rows ROW pixels tall with GAP between. A widget
// moved or resized onto others pushes them down, and then every widget floats up as far as it
// can, so the board never has holes and never overlaps.

export const COLUMNS = 12;
export const ROW = 52;
export const GAP = 16;
export const MAX_ROWS = 12;

type Box = Pick<PlacedWidget, "x" | "y" | "w" | "h">;

export function overlaps(a: Box, b: Box) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

// Top to bottom, then left to right: the order widgets settle in, and the reading order.
export function reading(widgets: PlacedWidget[]) {
  return [...widgets].sort((a, b) => a.y - b.y || a.x - b.x);
}

// Every widget floats up until it meets another; `fixed` stays where it was put.
export function compact(widgets: PlacedWidget[], fixed?: string): PlacedWidget[] {
  const settled: PlacedWidget[] = [];
  const pinned = widgets.find((w) => w.id === fixed);
  if (pinned) settled.push(pinned);
  for (const widget of reading(widgets)) {
    if (widget.id === fixed) continue;
    let y = widget.y;
    // Up while the row above is free.
    while (y > 0 && !settled.some((other) => overlaps({ ...widget, y: y - 1 }, other))) y--;
    // Down past anything it still overlaps (the pinned widget, or one that settled above).
    while (settled.some((other) => overlaps({ ...widget, y }, other))) y++;
    settled.push({ ...widget, y });
  }
  return widgets.map((w) => settled.find((s) => s.id === w.id)!);
}

// The widget put at a new place or size, kept on the grid, the others making room.
export function place(widgets: PlacedWidget[], id: string, box: Partial<Box>, min: { w: number; h: number }): PlacedWidget[] {
  const moved = widgets.map((w) => {
    if (w.id !== id) return w;
    const width = clamp(box.w ?? w.w, min.w, COLUMNS);
    return {
      ...w,
      w: width,
      h: clamp(box.h ?? w.h, min.h, MAX_ROWS),
      x: clamp(box.x ?? w.x, 0, COLUMNS - width),
      y: Math.max(0, box.y ?? w.y),
    };
  });
  return compact(moved, id);
}

// Where a new widget goes: the first spot from the top where it fits.
export function freeSpot(widgets: PlacedWidget[], w: number, h: number): { x: number; y: number } {
  for (let y = 0; y < 400; y++) {
    for (let x = 0; x + w <= COLUMNS; x++) {
      if (!widgets.some((other) => overlaps({ x, y, w, h }, other))) return { x, y };
    }
  }
  return { x: 0, y: bottom(widgets) };
}

export function bottom(widgets: PlacedWidget[]) {
  return widgets.reduce((most, w) => Math.max(most, w.y + w.h), 0);
}

export function clamp(value: number, low: number, high: number) {
  return Math.min(high, Math.max(low, Math.round(value)));
}
