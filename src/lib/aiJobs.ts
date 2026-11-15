import { useSyncExternalStore } from "react";

// AI explanations run here, outside any screen, so one that is under way keeps going and
// keeps its answer when the user moves to another page and back. Each run has a key that
// says what is explained (a function of a branch, a file of the KT, a part of a prompt);
// asking for a key that is already running joins that run instead of starting another.
// A batch ("Explain all") is a list of runs done one at a time, also kept here.

export type Job<T = unknown> =
  | { state: "working" }
  | { state: "done"; result: T }
  | { state: "failed"; error: string };

export type Batch = {
  running: boolean;
  // The key being explained now, and the label shown for it.
  current: string | null;
  label: string | null;
  // Asked to stop after the run under way.
  stopping: boolean;
  error: string | null;
};

const jobs = new Map<string, Job>();
// When each run under way began, for progress shown by time.
const began = new Map<string, number>();
const running = new Map<string, Promise<unknown>>();
const batches = new Map<string, Batch>();
const listeners = new Set<() => void>();
// Bumped on every change, so screens re-render with the new state.
let version = 0;

function changed() {
  version += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function job<T>(key: string): Job<T> | undefined {
  return jobs.get(key) as Job<T> | undefined;
}

// The answer for a key, once there is one.
export function result<T>(key: string): T | undefined {
  const found = jobs.get(key);
  return found?.state === "done" ? (found.result as T) : undefined;
}

export function batch(key: string): Batch | undefined {
  return batches.get(key);
}

// Runs `run` for `key`, or joins the run under way. again: ask once more even when an
// answer is kept, as when the overview is rewritten.
export function start<T>(key: string, run: () => Promise<T>, again = false): Promise<T> {
  const under = running.get(key);
  if (under) return under as Promise<T>;
  const kept = jobs.get(key);
  if (kept?.state === "done" && !again) return Promise.resolve(kept.result as T);
  jobs.set(key, { state: "working" });
  began.set(key, Date.now());
  changed();
  const promise = run().then(
    (value) => {
      jobs.set(key, { state: "done", result: value });
      return value;
    },
    (e: unknown) => {
      jobs.set(key, { state: "failed", error: e instanceof Error ? e.message : String(e) });
      throw e;
    },
  );
  running.set(key, promise);
  promise
    .finally(() => {
      running.delete(key);
      changed();
    })
    .catch(() => {});
  return promise;
}

// Forgets a failure, so the button offers the run again.
// When the run for `key` began, while it's under way.
export function since(key: string): number | undefined {
  return running.has(key) ? began.get(key) : undefined;
}

export function clear(key: string) {
  if (jobs.get(key)?.state === "failed") {
    jobs.delete(key);
    changed();
  }
}

export type Step = { key: string; label: string; run: () => Promise<unknown>; again?: boolean };

// Runs the steps one at a time (each is its own AI run, and the first answers show
// sooner), stopping at the first failure or when asked to. A batch already running is left.
export async function startBatch(key: string, steps: Step[]): Promise<void> {
  if (batches.get(key)?.running) return;
  const state: Batch = { running: true, current: null, label: null, stopping: false, error: null };
  batches.set(key, state);
  changed();
  for (const step of steps) {
    if (batches.get(key)?.stopping) break;
    batches.set(key, { ...batches.get(key)!, current: step.key, label: step.label });
    changed();
    try {
      await start(step.key, step.run, step.again);
    } catch (e) {
      batches.set(key, { ...batches.get(key)!, error: `${step.label}: ${e instanceof Error ? e.message : String(e)}` });
      break;
    }
  }
  batches.set(key, { ...batches.get(key)!, running: false, current: null, label: null, stopping: false });
  changed();
}

export function stopBatch(key: string) {
  const found = batches.get(key);
  if (found?.running) {
    batches.set(key, { ...found, stopping: true });
    changed();
  }
}

// Re-renders the screen whenever any run starts, finishes or fails.
export function useJobs() {
  useSyncExternalStore(subscribe, () => version);
}
