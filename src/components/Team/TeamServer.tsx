import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../../api/client";
import { team, type HostStatus, type LinkStatus, type Tunnel } from "../../api/team";
import type { Repo } from "../../api/types";
import { forgetTeamLink } from "./ShareWithTeam";
import "./Team.css";

// Settings → Team server: host a team server anyone can open over HTTPS (on your own domain,
// or a Cloudflare address from this computer), and link this DevDash to a team server, here
// or someone else's, then link projects to it. Organisations and teams are made on the
// server's own page.

const TUNNELS: { id: Tunnel; label: string; note: string }[] = [
  { id: "network", label: "Company network", note: "A company server people reach by its IP or an internal name, on the office wifi or VPN. No domain or internet needed. Caddy gives it HTTPS." },
  { id: "cloudflare", label: "Cloudflare address", note: "A public https address from this computer, new each time it starts. Nothing to set up: good for trying it on your phone." },
  { id: "domain", label: "Your domain", note: "For a server that stays up: a domain you own, pointed at a machine the internet can reach, with ports 80 and 443 open. A laptop at home usually isn't. Caddy gets the HTTPS certificate." },
  { id: "none", label: "This computer only", note: "No other device can reach it. For trying it out." },
];

export default function TeamServer() {
  const [host, setHost] = useState<HostStatus | null>(null);
  const [link, setLink] = useState<LinkStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    team.status().then(
      (found) => (setHost(found.host), setLink(found.link), setError(null)),
      (e: Error) => setError(e.message),
    );
  }, []);
  useEffect(reload, [reload]);
  useEffect(forgetTeamLink, [link]);

  if (error && !host) return <section className="card settings__section"><p className="settings__message settings__message--error">{error}</p></section>;
  if (!host || !link) return <section className="card settings__section"><p className="settings__note">Checking…</p></section>;
  return (
    <>
      <Hosting host={host} onHost={setHost} />
      <Linking link={link} onLink={setLink} suggested={host.running ? host.url : null} />
    </>
  );
}

export function Hosting({ host, onHost }: { host: HostStatus; onHost: (host: HostStatus) => void }) {
  const [tunnel, setTunnel] = useState<Tunnel>(host.tools.caddy ? "network" : host.tools.cloudflare ? "cloudflare" : "none");
  const [domain, setDomain] = useState("");
  const [addresses, setAddresses] = useState(host.tools.addresses.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const run = (action: () => Promise<HostStatus>) => {
    setBusy(true);
    setError(null);
    action().then(onHost, (e: Error) => setError(e.message)).finally(() => setBusy(false));
  };
  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => setCopied(text));
  const missing = (id: Tunnel) => ((id === "domain" || id === "network") && !host.tools.caddy) || (id === "cloudflare" && !host.tools.cloudflare);

  return (
    <section className="card settings__section">
      <div className="settings__head">
        <h2>Host a team server</h2>
        {host.running && (
          <button className="settings__button settings__button--quiet" onClick={() => run(team.stopHosting)} disabled={busy}>
            {busy ? "Stopping…" : "Stop hosting"}
          </button>
        )}
      </div>
      {host.running ? (
        <>
          <p className="settings__note">
            Your team server is running{host.tunnel === "network" ? " on the company network: only devices on the office wifi or VPN can open it" : host.tunnel === "domain" ? " on your domain" : host.tunnel === "cloudflare" ? " on a public Cloudflare address, which changes each time it starts" : " on this computer only"}.
            Anyone with the address can sign up, make an organisation and invite their team. It keeps running until you
            stop it here or turn this computer off.
          </p>
          <div className="team__address">
            <code>{host.url}</code>
            <button className="settings__button settings__button--quiet" onClick={() => copy(host.url!)}>
              {copied === host.url ? "Copied" : "Copy"}
            </button>
            <a className="settings__button" href={host.url!} target="_blank" rel="noreferrer">
              Open
            </a>
          </div>
          {host.root_certificate && (
            <p className="settings__note">
              Its certificate comes from Caddy's own authority, so each device's browser warns until it trusts this root
              certificate once (phones: Settings → Security → Install a certificate).{" "}
              <a href="/api/team/host/root-certificate" download>Download the root certificate</a>. It's at{" "}
              <code>{host.root_certificate}</code>. Phones and browsers can also get it at{" "}
              <code>{host.url}/root.crt</code>.
            </p>
          )}
          {host.root_fingerprint && (
            <p className="settings__note">
              Its fingerprint, for teammates' DevDash to compare when they press Trust this server:{" "}
              <code className="team__fingerprint">{host.root_fingerprint}</code>
            </p>
          )}
          {host.setup_code && (
            <div className="team__code">
              <p>
                <strong>Setup code</strong> Open the address (your phone works), make an account, and enter this code
                under You → Server to become the server's admin: you can then close sign-ups. It works once, and only
                this screen and the terminal show it.
              </p>
              <code aria-label="Setup code">{host.setup_code}</code>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="settings__note">
            Run a team server people open in their browser: they sign up, make an organisation and teams, and see the
            explanations of changes their team chose to share. It keeps accounts, teams and shared explanations only:
            never code, diffs, file paths or prompts.
          </p>
          <fieldset className="team__tunnels">
            <legend>How other devices reach it</legend>
            {TUNNELS.map((option) => (
              <label key={option.id} className={`team__tunnel${tunnel === option.id ? " is-on" : ""}${missing(option.id) ? " is-off" : ""}`}>
                <input type="radio" name="tunnel" value={option.id} checked={tunnel === option.id} disabled={missing(option.id)}
                       onChange={() => setTunnel(option.id)} />
                <span>
                  <strong>{option.label}</strong>
                  <span>
                    {option.note}
                    {missing(option.id) && (option.id === "cloudflare"
                      ? " Needs cloudflared, which isn't installed here."
                      : ` Needs Caddy, which isn't installed here: the installer's 5 Team server → Host → ${option.label} installs it (it asks first).`)}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          {tunnel === "network" && (
            <label className="team__domain">
              <span>This computer's IP (the one hosting), and any internal names for it, comma-separated</span>
              <input value={addresses} onChange={(event) => setAddresses(event.target.value)} placeholder="10.0.0.5, devdash.corp"
                     autoComplete="off" spellCheck={false} />
            </label>
          )}
          {tunnel === "domain" && (
            <label className="team__domain">
              <span>Domain</span>
              <input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="teams.example.com"
                     autoComplete="off" spellCheck={false} />
            </label>
          )}
          <div>
            <button className="settings__button" onClick={() => run(() => team.host(tunnel, domain, addresses))}
                    disabled={busy || (tunnel === "domain" && !domain.trim()) || (tunnel === "network" && !addresses.trim())}>
              {busy ? "Starting… (up to half a minute)" : "Start hosting"}
            </button>
          </div>
          <p className="settings__note">
            Or from a terminal: <code>devdash host --tunnel {tunnel}{tunnel === "domain" ? ` --domain ${domain.trim() || "teams.example.com"}` : tunnel === "network" ? ` --address ${addresses.replace(/\s+/g, "") || "10.0.0.5,devdash.corp"}` : ""}</code>
          </p>
        </>
      )}
      {error && <p className="settings__message settings__message--error">{error}</p>}
    </section>
  );
}

export function Linking({ link, onLink, suggested }: { link: LinkStatus; onLink: (link: LinkStatus) => void; suggested: string | null }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [projectError, setProjectError] = useState<{ id: number; message: string } | null>(null);
  // A company network server's root certificate fetched for the person to check before trusting.
  const [offered, setOffered] = useState<{ pem: string; fingerprint: string } | null>(null);
  const untrusted = !!error && error.includes("doesn't trust the team server's certificate");
  const address = url || suggested || "";

  useEffect(() => {
    if (link.connected) api.repos().then(setRepos, () => setRepos([]));
  }, [link.connected]);

  // While a code waits to be approved on the server, ask every three seconds.
  const waiting = !!link.pending;
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => {
      team.poll().then(onLink, (e: Error) => {
        setError(e.message);
        team.status().then((found) => onLink(found.link), () => {});
      });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [waiting, onLink]);

  const run = (action: () => Promise<LinkStatus>) => {
    setBusy(true);
    setError(null);
    action().then(onLink, (e: Error) => setError(e.message)).finally(() => setBusy(false));
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setOffered(null);
    run(() => team.link(address));
  };
  const fetchRoot = () => {
    setBusy(true);
    team.fetchRootCertificate(address).then((found) => (setOffered(found), setError(null)), (e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  };
  // Trusts it, then links straight away.
  const trust = () => {
    if (!offered) return;
    setOffered(null);
    run(() => team.addRootCertificate(offered.pem).then(() => team.link(address)));
  };
  const toggle = (repo: Repo, linked: boolean) => {
    setProjectError(null);
    (linked ? team.unlinkProject(repo.id) : team.linkProject(repo.id)).then(onLink, (e: Error) =>
      setProjectError({ id: repo.id, message: e.message }),
    );
  };

  return (
    <section className="card settings__section">
      <div className="settings__head">
        <h2>Team server</h2>
        {(link.connected || link.pending) && (
          <button className="settings__button settings__button--quiet" onClick={() => run(team.unlink)} disabled={busy}>
            {link.connected ? "Unlink" : "Cancel"}
          </button>
        )}
      </div>
      {link.connected ? (
        <>
          <p className="settings__note">
            Linked to <strong>{link.org}</strong> as {link.person?.name}.{" "}
            <a href={link.url} target="_blank" rel="noreferrer">Open it</a> to make teams and add them to a project.
          </p>
          <h3 className="team__subhead">Projects on the team server</h3>
          <p className="settings__note">
            Link a project to share its explanations: press Share with team under an explanation of a change. Only that
            explanation goes, with the function's name.
          </p>
          {repos === null ? (
            <p className="settings__note">Reading your projects…</p>
          ) : (
            <ul className="team__projects">
              {repos.map((repo) => {
                const linked = !!link.projects?.[String(repo.id)];
                return (
                  <li key={repo.id}>
                    <span>
                      <strong>{repo.name}</strong>
                      <span className="settings__note">{linked ? "Linked" : "Not on the team server"}</span>
                      {projectError?.id === repo.id && <span className="settings__message settings__message--error">{projectError.message}</span>}
                    </span>
                    <button className={`settings__button${linked ? " settings__button--quiet" : ""}`} onClick={() => toggle(repo, linked)}>
                      {linked ? "Unlink" : "Link"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : link.pending ? (
        <div className="team__code">
          <p>Approve this DevDash on the team server, signed in as you. The page that opens asks you to check this code:</p>
          <code aria-label="Linking code">{link.pending.user_code}</code>
          <div>
            <a className="settings__button" href={link.pending.link} target="_blank" rel="noreferrer">
              Open the team server
            </a>
          </div>
          <p className="settings__note">Waiting for you to approve it… The code works for 10 minutes.</p>
        </div>
      ) : (
        <form className="team__link" onSubmit={submit}>
          <p className="settings__note">
            Link DevDash to a team server, yours or your team's, to share explanations of changes with a team. You approve
            it on the server's page (and pick the organisation), so no password is typed here.
          </p>
          <label>
            <span>Team server address</span>
            <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder={suggested ?? "https://teams.example.com"}
                   autoComplete="off" spellCheck={false} />
          </label>
          <button className="settings__button" type="submit" disabled={busy || !(url.trim() || suggested)}>
            {busy ? "Linking…" : "Link"}
          </button>
          <label className="team__root">
            <span>
              {link.root_certificate ? "Root certificate added. " : "Server on a company network? "}
              Add its root certificate (the .crt its host downloads from their Settings → Team server), so this computer
              trusts it.
            </span>
            <input type="file" accept=".crt,.pem,.cer" onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              file.text().then((pem) => run(() => team.addRootCertificate(pem)));
            }} />
          </label>
        </form>
      )}
      {error && <p className="settings__message settings__message--error">{error}</p>}
      {untrusted && !offered && (
        <div>
          <button className="settings__button" onClick={fetchRoot} disabled={busy}>
            {busy ? "Getting it…" : "Trust this server"}
          </button>
        </div>
      )}
      {offered && (
        <div className="team__code">
          <p>
            Check this fingerprint matches the one on the host's Settings → Team server (ask whoever runs the server). If it
            does, trust it.
          </p>
          <code className="team__fingerprint" aria-label="Fingerprint">{offered.fingerprint}</code>
          <div className="team__actions">
            <button className="settings__button" onClick={trust} disabled={busy}>It matches: trust and link</button>
            <button className="settings__button settings__button--quiet" onClick={() => setOffered(null)}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
