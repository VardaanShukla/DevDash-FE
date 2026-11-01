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
  linkProject: (repoId: number) => call<LinkStatus>(`/api/repos/${repoId}/team`, "POST"),
  unlinkProject: (repoId: number) => call<LinkStatus>(`/api/repos/${repoId}/team`, "DELETE"),
  share: (repoId: number, subject: string, ref: string, explanation: FunctionExplanation) =>
    call<{ id: number; project: string; url: string }>("/api/team/share", "POST", { repo_id: repoId, subject, ref, explanation }),
};
