import { VIEWS } from "./components/SideMenu/SideMenu";

// Keyboard shortcuts: what each can do, and how a key press is matched. The keys
// themselves are settings (Preferences.shortcuts), changed on the Settings screen.

export type Shortcut = { id: string; label: string; group: string };

export const SHORTCUTS: Shortcut[] = [
  ...VIEWS.map((view) => ({ id: `view:${view.id}`, label: `Go to ${view.label}`, group: "Screens" })),
  { id: "theme", label: "Switch between dark and light", group: "Anywhere" },
  { id: "uncommitted", label: "Show or hide uncommitted work", group: "Anywhere" },
  { id: "sync", label: "Sync with GitHub now", group: "Anywhere" },
  { id: "next-file", label: "Next file", group: "Changes" },
  { id: "previous-file", label: "Previous file", group: "Changes" },
];

// Keys that always do the same thing, shown for reference.
export const FIXED: { keys: string; label: string }[] = [
  { keys: "Esc", label: "Close a dialog" },
  { keys: "Enter", label: "Open what's focused" },
];

// Keys that can't be shortcuts: they move focus, close things or type into fields.
const RESERVED = new Set(["Escape", "Tab", "Enter", " ", "Shift", "Control", "Alt", "Meta", "CapsLock", "Backspace"]);

// The name stored for a key press, or null when it can't be a shortcut.
export function keyName(event: KeyboardEvent): string | null {
  if (event.metaKey || event.ctrlKey || event.altKey || RESERVED.has(event.key)) return null;
  return event.key.length === 1 ? event.key.toLowerCase() : event.key;
}

// How a stored key reads on screen.
export function keyLabel(key: string): string {
  const names: Record<string, string> = { ",": ",", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };
  return names[key] ?? (key.length === 1 ? key.toUpperCase() : key);
}

// Whether a key press should be left alone: typing into a field, or a modifier held.
export function typing(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement;
  return event.metaKey || event.ctrlKey || event.altKey || /INPUT|SELECT|TEXTAREA/.test(target.tagName) || target.isContentEditable;
}
