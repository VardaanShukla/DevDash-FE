import { ApiError, SIGNED_OUT } from "./client";
import type { FunctionExplanation } from "./types";

// Team mode, from this DevDash's side: hosting a team server here, linking to one, and
// sharing an explanation. See devdash.team in DevDash-BE.

export type Tunnel = "network" | "domain" | "cloudflare" | "none";

export type HostStatus = {
  running: boolean;
  url: string | null;
  tunnel: Tunnel | null;
  started: string | null;
  // Shown here until someone claims the server with it.
  setup_code: string | null;
  // On the company network with Caddy's own certificate: the root certificate devices trust once.
  root_certificate: string | null;
  // Its fingerprint, for people linking to compare with what their DevDash shows.
  root_fingerprint: string | null;
  // addresses: this machine's own network addresses, to suggest.
  tools: { caddy: boolean; cloudflare: boolean; addresses: string[] };
};

export type LinkStatus = {
  connected: boolean;
  url?: string;
  // The organisation this DevDash is linked to.
  org?: string | null;
  person?: { name: string; username: string; role: string } | null;
  // This DevDash's project id → the team server's project.
  projects?: Record<string, { id: number; name: string }>;
  // While linking: the code to approve on the server, and the link that opens it.
  pending: { user_code: string; link: string } | null;
  // Whether a company network server's root certificate was added here.
  root_certificate?: boolean;
  // How this DevDash is used: on its own, in an organisation, or not picked yet.
  mode: "individual" | "org" | null;
};

// The organisation as its people and admins see it (the team server's /api/orgs/{id} routes).
export type OrgInfo = { id: number; name: string; role: "owner" | "admin" | "member"; code: string | null };
export type OrgTeam = { id: number; name: string; people: { id: number; name: string }[] };
export type OrgPerson = { id: number; username: string; name: string; role: "owner" | "admin" | "member" };
export type OrgProject = { id: number; name: string; repo: string | null; shared: number; last_shared: string | null };
export type OrgProjectDetail = OrgProject & {
  manage: boolean;
  teams: { id: number; name: string }[];
  people: { id: number; name: string }[];
  shared: { id: number; subject: string; shared_at: string; person: string; explanation: FunctionExplanation; mine: boolean }[];
};

// The team as one person sees it: their teams, the projects they can see and who has each,
// and what was shared lately.
export type TeamOverview = {
  org: { id: number; name: string; role: "owner" | "admin" | "member" };
  me: { id: number; name: string };
  teams: { id: number; name: string; mine: boolean; people: { id: number; name: string; role: string }[] }[];
  projects: { id: number; name: string; repo: string | null; key: string | null;
    teams: { id: number; name: string }[]; people: { id: number; name: string }[] }[];
  shared: { id: number; project_id: number; subject: string; shared_at: string; person: string; mine: boolean;
    explanation: FunctionExplanation }[];
};

export type ChatChannel = {
  id: number;
  kind: "org" | "team" | "direct";
  name: string;
  unread: number;
  last: ChatMessage | null;
};
export type ChatMessage = { id: number; person_id: number | null; person: string; text: string; deleted: boolean; at: string };

export type AccountForm = {
  url: string;
  username: string;
  password: string;
  name?: string;
  org_name?: string;
  org_code?: string;
  org_id?: number;
  // True: a new account; false: one that exists.
  new: boolean;
};

export type TeamStatus = { host: HostStatus; link: LinkStatus };

async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: method === "GET" ? undefined : { "content-type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    });
  } catch {
    throw new ApiError("Can't reach the DevDash backend. Start it with `devdash serve`.", 0);
  }
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event(SIGNED_OUT));
    const found = await response.json().catch(() => null);
    throw new ApiError(typeof found?.detail === "string" ? found.detail : response.statusText, response.status);
  }
  return response.json() as Promise<T>;
}

export const team = {
  status: () => call<TeamStatus>("/api/team"),
  host: (tunnel: Tunnel, domain?: string, addresses?: string) =>
    call<HostStatus>("/api/team/host", "POST", { tunnel, domain: domain || null, addresses: addresses || null }),
  stopHosting: () => call<HostStatus>("/api/team/host", "DELETE"),
  link: (url: string) => call<LinkStatus>("/api/team/link", "POST", { url }),
  poll: () => call<LinkStatus>("/api/team/link/poll", "POST"),
  unlink: () => call<LinkStatus>("/api/team/link", "DELETE"),
  fetchRootCertificate: (url: string) =>
    call<{ pem: string; fingerprint: string }>("/api/team/root-certificate/fetch", "POST", { url }),
  addRootCertificate: (pem: string) => call<LinkStatus>("/api/team/root-certificate", "POST", { pem }),
  check: (url: string) => call<{ url: string; server: string; signup: boolean }>("/api/team/check", "POST", { url }),
  account: (form: AccountForm) => call<LinkStatus>("/api/team/account", "POST", form),
  setMode: (mode: LinkStatus["mode"]) => call<LinkStatus>("/api/team/mode", "PUT", { mode }),
  linkProject: (repoId: number) => call<LinkStatus>(`/api/repos/${repoId}/team`, "POST"),
  unlinkProject: (repoId: number) => call<LinkStatus>(`/api/repos/${repoId}/team`, "DELETE"),
  share: (repoId: number, subject: string, ref: string, explanation: FunctionExplanation) =>
    call<{ id: number; project: string; url: string }>("/api/team/share", "POST", { repo_id: repoId, subject, ref, explanation }),
};

// The linked organisation, managed from DevDash as the person who linked it.
const org = <T>(path: string, method = "GET", body?: unknown) => call<T>(`/api/team/org${path}`, method, body);
export const organisation = {
  get: () => org<OrgInfo>(""),
  overview: () => org<TeamOverview>("/overview"),
  chats: () => org<ChatChannel[]>("/chat"),
  direct: (personId: number) => org<{ id: number }>("/chat/direct", "POST", { person_id: personId }),
  messages: (channelId: number, after = 0) => org<ChatMessage[]>(`/chat/${channelId}/messages${after ? `?after=${after}` : ""}`),
  send: (channelId: number, text: string) => org<ChatMessage>(`/chat/${channelId}/messages`, "POST", { text }),
  read: (channelId: number, lastId: number) => org<unknown>(`/chat/${channelId}/read`, "POST", { last_id: lastId }),
  deleteMessage: (channelId: number, messageId: number) => org<unknown>(`/chat/${channelId}/messages/${messageId}`, "DELETE"),
  newCode: () => org<{ code: string }>("/code", "POST", {}),
  teams: () => org<OrgTeam[]>("/teams"),
  newTeam: (name: string) => org<OrgTeam>("/teams", "POST", { name }),
  deleteTeam: (id: number) => org<unknown>(`/teams/${id}`, "DELETE"),
  addToTeam: (teamId: number, personId: number) => org<unknown>(`/teams/${teamId}/people`, "POST", { person_id: personId }),
  removeFromTeam: (teamId: number, personId: number) => org<unknown>(`/teams/${teamId}/people/${personId}`, "DELETE"),
  people: () => org<OrgPerson[]>("/people"),
  setRole: (personId: number, role: "admin" | "member") => org<unknown>(`/people/${personId}/role`, "PUT", { role }),
  removePerson: (personId: number) => org<unknown>(`/people/${personId}`, "DELETE"),
  invite: (role: "admin" | "member", teamId: number | null) =>
    org<{ invite: string; expires_in_days: number }>("/invites", "POST", { role, team_id: teamId }),
  projects: () => org<OrgProject[]>("/projects"),
  project: (id: number) => org<OrgProjectDetail>(`/projects/${id}`),
  newProject: (name: string, repo: string | null) => org<OrgProject>("/projects", "POST", { name, repo }),
  deleteProject: (id: number) => org<unknown>(`/projects/${id}`, "DELETE"),
  giveTeam: (projectId: number, teamId: number) => org<unknown>(`/projects/${projectId}/teams`, "POST", { team_id: teamId }),
  takeTeam: (projectId: number, teamId: number) => org<unknown>(`/projects/${projectId}/teams/${teamId}`, "DELETE"),
  givePerson: (projectId: number, personId: number) => org<unknown>(`/projects/${projectId}/people`, "POST", { person_id: personId }),
  takePerson: (projectId: number, personId: number) => org<unknown>(`/projects/${projectId}/people/${personId}`, "DELETE"),
};
