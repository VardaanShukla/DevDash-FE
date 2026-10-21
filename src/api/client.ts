import type {
  Agenda,
  AiStatus,
  AiProvider,
  AuthStatus,
  Candidate,
  RecordingHealth,
  PreferenceChange,
  Preferences,
  AiTool,
  AiToolId,
  Branches,
  Comparison,
  Digest,
  Flow,
  FunctionDetail,
  FunctionExplanation,
  ProjectExplanation,
  ProjectCard,
  ProjectMap,
  Repo,
  SetupStep,
  SignIn,
  Summary,
  Sync,
  Todo,
} from "./types";

// In dev, Vite forwards /api to `devdash serve` (see vite.config.ts).

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

// Sent on window when the API turns this browser away for not being signed in.
export const SIGNED_OUT = "devdash:signed-out";

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Can't reach the DevDash backend. Start it with `devdash serve`.", 0);
  }
  if (!response.ok) {
    // The dashboard's sign-in ran out or was ended elsewhere: show the login again.
    if (response.status === 401 && !path.startsWith("/api/auth")) window.dispatchEvent(new Event(SIGNED_OUT));
    const body = await response.json().catch(() => null);
    const detail = typeof body?.detail === "string" ? body.detail : response.statusText;
    // The dev proxy answers 5xx when nothing is listening on the backend's port.
    if (response.status >= 500 && !body) {
      throw new ApiError("Can't reach the DevDash backend. Start it with `devdash serve`.", 0);
    }
    // A route the running backend doesn't know: it was started before an update.
    if (response.status === 405) {
      throw new ApiError("The running backend is older than this page. Stop `devdash serve` and start it again.", 405);
    }
    throw new ApiError(detail, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const get = <T>(path: string) => request<T>(path);

export const api = {
  auth: () => get<AuthStatus>("/api/auth"),
  logIn: (username: string, password: string) =>
    request<AuthStatus>("/api/auth/login", "POST", { username, password }),
  logOut: () => request<AuthStatus>("/api/auth/logout", "POST", {}),
  // Leave the username out to keep the current one.
  setPassword: (username: string | undefined, password: string, current?: string) =>
    request<AuthStatus>("/api/auth/password", "PUT", { username, password, current }),
  preferences: () => get<Preferences>("/api/preferences"),
  setPreferences: (changes: PreferenceChange) => request<Preferences>("/api/preferences", "PUT", changes),
  resetShortcuts: () => request<Preferences>("/api/preferences/reset-shortcuts", "POST", {}),
  repos: () => get<Repo[]>("/api/repos"),
  addRepo: (path: string, ai: AiToolId | null) => request<Repo>("/api/repos", "POST", { path, ai }),
  // The server only takes JSON for changes, so even a delete sends an empty object.
  removeRepo: (repoId: number) => request<void>(`/api/repos/${repoId}`, "DELETE", {}),
  setAi: (repoId: number, ai: AiToolId | null) => request<Repo>(`/api/repos/${repoId}/ai`, "PUT", { ai }),
  setup: (repoId: number) => get<{ steps: SetupStep[] }>(`/api/repos/${repoId}/setup`).then((r) => r.steps),
  aiTools: () => get<AiTool[]>("/api/ai-tools"),
  candidates: () => get<Candidate[]>("/api/repos/candidates"),
  recordingHealth: () => get<RecordingHealth>("/api/recording/health"),
  branches: (repoId: number) => get<Branches>(`/api/repos/${repoId}/branches`),
  sync: (repoId: number) => request<Sync>(`/api/repos/${repoId}/sync`, "POST", {}),
  state: (repoId: number, uncommitted: boolean) =>
    get<{ signature: string }>(`/api/repos/${repoId}/state?uncommitted=${uncommitted}`).then((r) => r.signature),
  flow: (repoId: number) => get<Flow>(`/api/repos/${repoId}/flow`),
  map: (repoId: number, head: string) =>
    get<ProjectMap>(`/api/repos/${repoId}/map?${new URLSearchParams({ head })}`),
  compare: (repoId: number, options: CompareOptions) => {
    const params = new URLSearchParams();
    if (options.base) params.set("base", options.base);
    if (options.head) params.set("head", options.head);
    if (options.uncommitted) params.set("uncommitted", "true");
    return get<Comparison>(`/api/repos/${repoId}/compare?${params}`);
  },
  // The functions one file's change touched, before and after.
  functions: (repoId: number, file: { path: string; old_path: string | null }, options: CompareOptions) => {
    const params = new URLSearchParams({ path: file.path });
    if (file.old_path) params.set("old_path", file.old_path);
    if (options.base) params.set("base", options.base);
    if (options.head) params.set("head", options.head);
    if (options.uncommitted) params.set("uncommitted", "true");
    return get<{ path: string; functions: FunctionDetail[] }>(`/api/repos/${repoId}/functions?${params}`).then(
      (r) => r.functions,
    );
  },
  explainFunction: (repoId: number, file: { path: string; old_path: string | null }, name: string, options: CompareOptions) =>
    request<FunctionExplanation>(`/api/repos/${repoId}/explain/function`, "POST", {
      path: file.path,
      old_path: file.old_path,
      name,
      ...options,
    }),
  ai: () => get<AiStatus>("/api/ai"),
  aiProviders: () => get<AiStatus[]>("/api/ai/providers"),
  signIn: (provider: AiProvider = "claude") => request<SignIn>("/api/ai/sign-in", "POST", { provider }),
  signInStatus: () => get<SignIn>("/api/ai/sign-in"),
  signInCode: (code: string) => request<SignIn>("/api/ai/sign-in/code", "POST", { code }),
  summary: (repoId: number, head: string) =>
    get<Summary>(`/api/repos/${repoId}/summary?${new URLSearchParams({ head })}`),
  explainProject: (repoId: number, head: string) =>
    request<ProjectExplanation>(`/api/repos/${repoId}/explain/project`, "POST", { head }),
  home: () => get<ProjectCard[]>("/api/home"),
  digest: (day?: string) => get<Digest>(`/api/digest${day ? `?day=${day}` : ""}`),
  undoChange: (change: string) =>
    request<{ change: string; undone_at: string | null }>("/api/digest/undo", "POST", { change }),
  putBackChange: (change: string) =>
    request<{ change: string; undone_at: string | null }>("/api/digest/put-back", "POST", { change }),
  todos: () => get<Todo[]>("/api/todos"),
  addTodo: (text: string, repoId: number | null, branch: string | null) =>
    request<Todo>("/api/todos", "POST", { text, repo_id: repoId, branch }),
  changeTodo: (id: number, change: { text?: string; done?: boolean }) => request<Todo>(`/api/todos/${id}`, "PATCH", change),
  removeTodo: (id: number) => request<void>(`/api/todos/${id}`, "DELETE", {}),
  calendar: (days: number, refresh = false) => get<Agenda>(`/api/calendar?days=${days}${refresh ? "&refresh=true" : ""}`),
  connectCalendar: (url: string) => request<Agenda>("/api/calendar", "PUT", { url }),
  disconnectCalendar: () => request<void>("/api/calendar", "DELETE", {}),
};

export type CompareOptions = { base?: string; head?: string; uncommitted?: boolean };
