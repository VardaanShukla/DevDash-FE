import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import type { FileChange } from "../../api/types";

// Pieces both halves of the constellation use: colours, words and small helpers.

export type Point = { x: number; y: number };

export const STATUS_COLOR: Record<FileChange["status"], string> = {
  added: "#4ade80",
  deleted: "#f87171",
  modified: "#f5c76b",
  renamed: "#c084fc",
};
export const STATUS: Record<FileChange["status"], string> = { added: "New", deleted: "Gone", modified: "Edited", renamed: "Moved" };
// A file this branch didn't touch.
export const QUIET = "#5eead4";

export function useSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setSize((s) => (s.width === el.clientWidth && s.height === el.clientHeight ? s : { width: el.clientWidth, height: el.clientHeight }));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

export function useReducedMotion() {
  const query = "(prefers-reduced-motion: reduce)";
  const [still, setStill] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return;
    const onChange = () => setStill(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return still;
}

// The same sequence of "random" numbers every time, so the sky doesn't reshuffle on resize.
export function seeded(seed: number) {
  let value = seed;
  return () => ((value = (value * 16807) % 2147483647) - 1) / 2147483646;
}

export function trim(text: string, length: number) {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

export function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function fileName(path: string) {
  return path.split("/").pop() ?? path;
}
