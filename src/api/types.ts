// Mirrors the response models in devdash-be/src/devdash/api/app.py.

export type Repo = {
  id: number;
  name: string;
  path: string;
  exists: boolean;
  branch: string | null;
  claude: boolean;
  ai: AiToolId | null;
};

export type AiToolId = "claude" | "codex" | "antigravity";

export type AiTool = {
  id: string;
  name: string;
  available: boolean;
  description: string;
};

export type SetupStep = {
  id: string;
  title: string;
  detail: string;
  command: string | null;
  // null where DevDash can't check, such as restarting Claude Code.
  done: boolean | null;
};

export type BranchInfo = {
  name: string;
  // Already part of the base branch.
  merged: boolean;
  // Its upstream was deleted on the remote, usually after a merged pull request.
  gone: boolean;
};

export type Branches = {
  current: string | null;
  default_base: string | null;
  branches: string[];
  details: BranchInfo[];
};

export type Sync = {
  synced_at: string | null;
  error: string | null;
};

export type Commit = {
  sha: string;
  short_sha: string;
  author: string;
  authored_at: string;
  subject: string;
  ai: boolean;
};

export type Line = {
  kind: "add" | "delete" | "context";
  text: string;
  old: number | null;
  new: number | null;
};

export type Hunk = {
  old_start: number;
  old_lines: number;
  new_start: number;
  new_lines: number;
  context: string | null;
  lines: Line[];
};

export type FunctionChange = {
  name: string;
  change: "added" | "deleted" | "modified";
};

export type FileChange = {
  path: string;
  old_path: string | null;
  status: "added" | "deleted" | "modified" | "renamed";
  binary: boolean;
  generated: boolean;
  truncated: boolean;
  additions: number;
  deletions: number;
  functions: FunctionChange[];
  hunks: Hunk[];
  // Differs from the last commit; only set when uncommitted work is included.
  uncommitted: boolean;
};

export type Comparison = {
  base: string;
  // What was compared against: origin/Dev when it is newer than the local Dev.
  base_ref: string;
  head: string;
  merge_base: string;
  uncommitted: boolean;
  ahead: number;
  behind: number;
  commits: Commit[];
  files: FileChange[];
  totals: { files: number; additions: number; deletions: number };
};

export type FlowCommit = {
  sha: string;
  short_sha: string;
  parents: string[];
  author: string;
  authored_at: string;
  subject: string;
  ai: boolean;
  // Branches whose tip is this commit; remote ones as origin/name.
  branches: string[];
};

export type Flow = {
  current: string | null;
  base: string | null;
  // Newest first.
  commits: FlowCommit[];
  truncated: boolean;
};

export type MapArea = {
  // The folder, relative to the project root; "" for files at the root.
  id: string;
  name: string;
  path: string;
  // What the folder is usually for, guessed from its name.
  role: string | null;
  files: number;
  bytes: number;
  languages: { name: string; files: number }[];
  // Its biggest files, at most 150; files counts them all.
  file_list: { path: string; bytes: number }[];
};

export type ProjectMap = {
  revision: string;
  total_files: number;
  areas: MapArea[];
  // Code in source uses code in target.
  edges: { source: string; target: string; imports: number }[];
  // False when the project was too big to read every file for imports.
  complete: boolean;
};

// One side of a changed function: as it was, or as it is now.
export type UnitSide = {
  start: number;
  end: number;
  lines: number;
  code: string;
  signature: string;
  // The docstring or the comment right above it.
  doc: string | null;
  params: string[];
  returns: string | null;
  is_async: boolean;
  calls: string[];
  // Ifs, loops, catches and the like: the choices the code makes.
  decisions: number;
};

export type UnitFacts = {
  params_added: string[];
  params_removed: string[];
  calls_added: string[];
  calls_removed: string[];
  // Each pair is [before, after].
  lines: [number, number];
  decisions: [number, number];
  is_async: [boolean, boolean];
  returns: [string | null, string | null];
  doc_changed: boolean;
  signature_changed: boolean;
};

export type FunctionExplanation = {
  summary: string;
  change: string;
  improves: string[];
  tradeoffs: string[];
  check: string | null;
};

export type FunctionDetail = {
  name: string;
  kind: "function" | "method" | "component" | "class" | "type";
  change: "added" | "deleted" | "modified";
  before: UnitSide | null;
  after: UnitSide | null;
  facts: UnitFacts | null;
  used_by: { path: string; line: number; text: string }[];
  explanation: FunctionExplanation | null;
};

// An AI that can write explanations: Claude, ChatGPT Codex, a local model (Ollama) or Antigravity.
export type AiProvider = "claude" | "codex" | "ollama" | "antigravity";
export type AiModel = { id: string; label: string; note: string };

export type AiStatus = {
  provider: AiProvider;
  name: string;
  // How it signs in: a button here, a command run in a terminal, or no sign-in at all.
  login: "button" | "terminal" | "none" | null;
  login_command: string | null;
  // Cheapest first; empty when the tool can't list them (type one instead).
  models: AiModel[];
  default_model: string | null;
  tool: string;
  available: boolean;
  // null when Claude Code couldn't say.
  signed_in: boolean | null;
  // The signed-in account's email (or organization).
  account?: string | null;
  model: string;
  detail: string | null;
  // Claude Code's official installers for this computer, when it isn't installed.
  install?: { shell: string; command: string }[];
};

export type SignIn = { state: "idle" | "waiting" | "signed_in" | "failed"; url: string | null; detail: string | null };

export type ProjectExplanation = {
  overview: string;
  how_it_works: string[];
  parts: { name: string; what: string }[];
  state: string;
};

export type Summary = {
  revision: string;
  name: string;
  description: string | null;
  readme: { title: string | null; intro: string | null; first_sentence: string | null; sections: string[] } | null;
  license: string | null;
  tech: { name: string; what: string }[];
  other_dependencies: number;
  run: { where: string; name: string; command: string }[];
  entry_points: string[];
  files: number;
  bytes: number;
  languages: { name: string; files: number }[];
  parts: MapArea[];
  links: { source: string; target: string; imports: number }[];
  history: {
    commits: number;
    people: { name: string; commits: number }[];
    first: string | null;
    last: string | null;
    // Commits in each of the last 12 weeks, oldest first.
    weeks: number[];
    branches: number;
  };
  explanation: ProjectExplanation | null;
};

export type Todo = {
  id: number;
  text: string;
  // null: not tied to a project.
  repo_id: number | null;
  // null: the whole project.
  branch: string | null;
  created_at: string;
  // null while open.
  done_at: string | null;
};

export type CalendarEvent = {
  title: string;
  // A date for all-day events, otherwise a time with its offset.
  start: string;
  end: string;
  all_day: boolean;
  location: string | null;
};

export type Agenda = {
  connected: boolean;
  // The calendar's site, never its private address.
  source: string | null;
  events: CalendarEvent[];
  fetched_at: string | null;
  error: string | null;
};

export type ProjectCard = {
  id: number;
  name: string;
  path: string;
  exists: boolean;
  branch: string | null;
  base: string | null;
  // Commits on the branch that the base doesn't have; null on the base itself.
  ahead: number | null;
  // Files changed but not committed.
  uncommitted: number;
  last_commit: { subject: string; author: string; at: string } | null;
  commits_this_week: number;
  branches: number;
};

// How recording has gone lately, from the hook logs.
export type RecordingHealth = {
  errors: number;
  days: number;
  last_error: { at: string; event: string; detail: string } | null;
  // Event (user-prompt-submit, pre-tool-use, stop, post-commit) -> when a hook last called it.
  last_call: Record<string, string>;
  error_log: string;
  hook_log: string;
};

// A project found in a folder `devdash init` remembered, not added yet.
export type Candidate = { path: string; name: string; folder: string };

export type AuthStatus = { password_set: boolean; signed_in: boolean; username?: string };

// The dashboard's settings, kept by the backend so every browser gets them.
export type Preferences = {
  theme: "dark" | "light";
  // Show uncommitted work from the start; null until picked, so the dashboard asks once.
  uncommitted: boolean | null;
  // Action -> key. Actions: view:<screen>, theme, uncommitted, sync, next-file, previous-file.
  // An empty key means the shortcut is off.
  shortcuts: Record<string, string>;
  // Which AI writes explanations, and the model picked for each (missing: its cheapest).
  ai: { provider: AiProvider; models: Partial<Record<AiProvider, string>> };
};
// What a change sends: only the settings to change; for the AI, the provider and/or the
// models of the AIs to change ("" goes back to that AI's default).
export type PreferenceChange = Omit<Partial<Preferences>, "ai"> & {
  ai?: { provider?: AiProvider; models?: Partial<Record<AiProvider, string>> };
};

// The daily digest: what Claude changed on one day, prompt by prompt.
export type DigestFlag = {
  // auth, payments, database, tests, secret: worth a careful look; config, deleted, big: worth knowing.
  kind: string;
  label: string;
  reason: string;
  line: string | null;
};
export type DigestFile = {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  functions: { name: string; change: "added" | "deleted" | "modified" }[];
  flags: DigestFlag[];
  // Changed while the prompt ran, but not through Claude's Edit or Write: a shell command,
  // or possibly your own edit made at the same time.
  watched: boolean;
};
export type DigestChange = {
  id: string;
  repo: { id: number; name: string };
  branch: string | null;
  prompt: string | null;
  // False: an AI-co-authored commit with no recorded prompt; prompt is its message.
  prompt_recorded: boolean;
  // prompt: recorded by the Claude Code hooks. commit: an AI-co-authored commit made here.
  // cloud: a Claude co-authored commit found on a branch, made where no hook ran (a cloud session).
  origin: "prompt" | "commit" | "cloud";
  // The AI tool the prompt went to (Claude, Codex or Antigravity); null for commits.
  tool: string | null;
  at: string;
  commit: { sha: string; message: string; count: number } | null;
  files: DigestFile[];
  additions: number;
  deletions: number;
  flags: DigestFlag[];
  risky: boolean;
  // Undone from the digest and not put back since.
  undone_at: string | null;
};
export type Digest = {
  date: string;
  claude: { prompts: number; files: number; functions: number; additions: number; deletions: number; risky: number; uncommitted: number };
  you: { files: number; additions: number; deletions: number; commits: number };
  changes: DigestChange[];
};
