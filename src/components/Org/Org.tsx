import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api } from "../../api/client";
import { organisation, team, type HostStatus, type LinkStatus, type OrgInfo, type OrgPerson, type OrgProject,
  type OrgProjectDetail, type OrgTeam } from "../../api/team";
import type { Repo } from "../../api/types";
import { Hosting, Linking } from "../Team/TeamServer";
import "./Org.css";

// How DevDash is used: on its own, or in an organisation (joined, or made here). Joining and
// making one happen right in DevDash: find the team server (and trust its certificate on a
// company network), make an account or sign in, and this DevDash is linked. Admins then set
// the organisation up here: its code and link, teams, people, and who gets which project.

type Mode = LinkStatus["mode"];

export function OrgChooser({ onDone, compact }: { onDone: (link: LinkStatus) => void; compact?: boolean }) {
  const [flow, setFlow] = useState<"join" | "create" | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (flow === "join") return <JoinOrg onBack={() => setFlow(null)} onDone={onDone} />;
  if (flow === "create") return <CreateOrg onBack={() => setFlow(null)} onDone={onDone} />;
  const individual = () => team.setMode("individual").then(onDone, (e: Error) => setError(e.message));
  return (
    <section className={`card org${compact ? " org--compact" : ""}`}>
      <header className="org__intro">
        <h1>How will you use DevDash?</h1>
        <p>Your code always stays on this computer. An organisation adds a team: shared explanations of changes, who works on what, and chat.</p>
      </header>
      <div className="org__choices">
        <Choice icon={<JoinIcon />} title="Join an organisation" onClick={() => setFlow("join")}>
          Your admin sent you an organisation link or code. You'll see the projects they gave you.
        </Choice>
        <Choice icon={<CreateIcon />} title="Create an organisation" onClick={() => setFlow("create")}>
          Set one up for your company: teams, people and projects. You'll be its admin.
        </Choice>
        <Choice icon={<SoloIcon />} title="Just me" onClick={individual}>
          Use DevDash on your own. You can join or create an organisation later in Settings.
        </Choice>
      </div>
      {error && <p className="settings__message settings__message--error">{error}</p>}
    </section>
  );
}

function Choice({ icon, title, children, onClick }: { icon: ReactNode; title: string; children: ReactNode; onClick: () => void }) {
  return (
    <button className="org__choice" onClick={onClick}>
      <span className="org__choice-icon">{icon}</span>
      <strong>{title}</strong>
      <span>{children}</span>
    </button>
  );
}

// ---------------------------------------------------------------- the wizards

function Steps({ steps, at }: { steps: string[]; at: number }) {
  return (
    <ol className="org__steps" aria-label="Steps">
      {steps.map((label, index) => (
        <li key={label} className={index < at ? "is-done" : index === at ? "is-on" : ""}>
          <span>{index < at ? "✓" : index + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}

function Wizard({ title, steps, at, onBack, children }: {
  title: string; steps: string[]; at: number; onBack: () => void; children: ReactNode;
}) {
  return (
    <section className="card org org--wizard">
      <button className="org__back" onClick={onBack}>‹ Back</button>
      <h1>{title}</h1>
      <Steps steps={steps} at={at} />
      <div className="org__body">{children}</div>
    </section>
  );
}

// An organisation link (https://server/#join-org=CODE), or a server address and a code.
function parseOrgLink(text: string): { url: string; code: string } | null {
  const match = text.trim().match(/^(https?:\/\/[^/#\s]+)\/?#join-org=([A-Za-z0-9-]+)/);
  return match ? { url: match[1], code: decodeURIComponent(match[2]) } : null;
}

function JoinOrg({ onBack, onDone }: { onBack: () => void; onDone: (link: LinkStatus) => void }) {
  const [where, setWhere] = useState<{ url: string; code: string } | null>(null);
  const [server, setServer] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [code, setCode] = useState("");
  const parsed = parseOrgLink(address);
  const at = !where ? 0 : !server ? 1 : 2;
  return (
    <Wizard title="Join an organisation" steps={["Organisation link", "Reach the server", "Your account"]} at={at} onBack={onBack}>
      {at === 0 && (
        <form className="org__form" onSubmit={(event: FormEvent) => {
          event.preventDefault();
          setWhere(parsed ?? { url: address.trim(), code: code.trim() });
        }}>
          <p>Paste the organisation link your admin sent you. It looks like <code>https://10.0.0.5:8443/#join-org=ABCD-EFGH</code>.</p>
          <label>
            <span>Organisation link, or the server's address</span>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="https://devdash.corp:8443/#join-org=…" autoFocus
                   autoComplete="off" spellCheck={false} />
          </label>
          {!parsed && (
            <label>
              <span>Organisation code</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD-EFGH" autoComplete="off" spellCheck={false} />
            </label>
          )}
          {parsed && <p className="settings__note">Server {parsed.url}, code {parsed.code}.</p>}
          <button className="settings__button" type="submit" disabled={!address.trim() || (!parsed && !code.trim())}>Next</button>
        </form>
      )}
      {at === 1 && where && <ReachServer url={where.url} onReady={setServer} />}
      {at === 2 && where && server && (
        <AccountStep url={server} orgCode={where.code} onLinked={onDone} />
      )}
    </Wizard>
  );
}

function CreateOrg({ onBack, onDone }: { onBack: () => void; onDone: (link: LinkStatus) => void }) {
  const [place, setPlace] = useState<"here" | "elsewhere" | null>(null);
  const [host, setHost] = useState<HostStatus | null>(null);
  const [address, setAddress] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [server, setServer] = useState<string | null>(null);
  const [linked, setLinked] = useState<LinkStatus | null>(null);

  useEffect(() => {
    if (place === "here") team.status().then((found) => setHost(found.host), () => {});
  }, [place]);
  const at = !url ? 0 : !server ? 1 : !linked ? 2 : 3;
  return (
    <Wizard title="Create an organisation" steps={["Its server", "Reach it", "Organisation and your account", "Set it up"]}
            at={at} onBack={onBack}>
      {at === 0 && (
        <div className="org__form">
          <p>DevDash Teams runs on one server that everyone opens: your company's, or this computer.</p>
          <div className="org__options">
            <button className={`org__option${place === "here" ? " is-on" : ""}`} onClick={() => setPlace("here")}>
              <strong>Host it on this computer</strong>
              <span>This computer runs the team server. Good for trying it out, or when this is the server.</span>
            </button>
            <button className={`org__option${place === "elsewhere" ? " is-on" : ""}`} onClick={() => setPlace("elsewhere")}>
              <strong>Our server already runs it</strong>
              <span>Someone started DevDash Teams on the company server. You need its address.</span>
            </button>
          </div>
          {place === "here" && host && (
            <>
              <Hosting host={host} onHost={setHost} />
              {host.running && host.url && (
                <button className="settings__button" onClick={() => setUrl(host.url)}>Next: use {host.url}</button>
              )}
            </>
          )}
          {place === "elsewhere" && (
            <form className="org__form" onSubmit={(event: FormEvent) => (event.preventDefault(), setUrl(address.trim()))}>
              <label>
                <span>The team server's address</span>
                <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="https://devdash.corp:8443"
                       autoComplete="off" spellCheck={false} />
              </label>
              <button className="settings__button" type="submit" disabled={!address.trim()}>Next</button>
            </form>
          )}
        </div>
      )}
      {at === 1 && url && <ReachServer url={url} onReady={setServer} />}
      {at === 2 && server && <AccountStep url={server} create onLinked={setLinked} />}
      {at === 3 && linked && (
        <>
          <p className="org__lead">
            <strong>{linked.org}</strong> is ready, and this DevDash is linked as its admin. Add teams, invite people and give
            them projects. You can come back to this any time in Settings → Organisation.
          </p>
          <OrgSetup link={linked} />
          <button className="settings__button org__finish" onClick={() => onDone(linked)}>Finish</button>
        </>
      )}
    </Wizard>
  );
}

// Checks the team server answers and is trusted; on a company network, offers to trust its
// certificate after comparing fingerprints.
function ReachServer({ url, onReady }: { url: string; onReady: (url: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [offered, setOffered] = useState<{ pem: string; fingerprint: string } | null>(null);
  const [busy, setBusy] = useState(true);

  const check = useCallback(() => {
    setBusy(true);
    setError(null);
    team.check(url).then((found) => onReady(found.url), (e: Error) => setError(e.message)).finally(() => setBusy(false));
  }, [url, onReady]);
  useEffect(check, [check]);

  const untrusted = !!error && error.includes("doesn't trust");
  if (busy) return <p className="settings__note">Reaching {url}…</p>;
  return (
    <div className="org__form">
      {error && <p className="settings__message settings__message--error">{error}</p>}
      {untrusted && !offered && (
        <>
          <p>This server uses its own certificate (a company network). Get it, and check its fingerprint with your admin.</p>
          <button className="settings__button" onClick={() => team.fetchRootCertificate(url).then(setOffered, (e: Error) => setError(e.message))}>
            Get its certificate
          </button>
        </>
      )}
      {offered && (
        <div className="team__code">
          <p>Does this match the fingerprint in the host's Settings → Organisation? Ask whoever runs the server.</p>
          <code className="team__fingerprint">{offered.fingerprint}</code>
          <div className="team__actions">
            <button className="settings__button" onClick={() => team.addRootCertificate(offered.pem).then(() => (setOffered(null), check()),
              (e: Error) => setError(e.message))}>It matches: trust it</button>
            <button className="settings__button settings__button--quiet" onClick={() => setOffered(null)}>Cancel</button>
          </div>
        </div>
      )}
      {!untrusted && error && <button className="settings__button" onClick={check}>Try again</button>}
    </div>
  );
}

// A new account (making or joining the organisation), or signing in with one that exists.
function AccountStep({ url, create, orgCode, onLinked }: {
  url: string; create?: boolean; orgCode?: string; onLinked: (link: LinkStatus) => void;
}) {
  const [fresh, setFresh] = useState(true);
  const [values, setValues] = useState({ org_name: "", name: "", username: "", password: "" });
  const [orgs, setOrgs] = useState<{ id: number; name: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof values) => (event: { target: { value: string } }) => setValues({ ...values, [key]: event.target.value });

  const submit = (orgId?: number) => {
    setBusy(true);
    setError(null);
    fetch("/api/team/account", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url, new: fresh, username: values.username, password: values.password, name: values.name || null,
        org_name: create && fresh ? values.org_name : null, org_code: orgCode ?? null, org_id: orgId ?? null,
      }),
    }).then(async (response) => {
      const found = await response.json().catch(() => null);
      if (response.ok) return onLinked(found as LinkStatus);
      if (found?.orgs) setOrgs(found.orgs);
      setError(typeof found?.detail === "string" ? found.detail : "Something went wrong.");
    }, () => setError("Can't reach the DevDash backend.")).finally(() => setBusy(false));
  };

  return (
    <form className="org__form" onSubmit={(event: FormEvent) => (event.preventDefault(), submit())}>
      <div className="org__tabs" role="tablist">
        <button type="button" role="tab" aria-selected={fresh} className={fresh ? "is-on" : ""} onClick={() => setFresh(true)}>
          {create ? "New account" : "I'm new here"}
        </button>
        <button type="button" role="tab" aria-selected={!fresh} className={!fresh ? "is-on" : ""} onClick={() => setFresh(false)}>
          I have an account
        </button>
      </div>
      {create && fresh && (
        <label>
          <span>Organisation name</span>
          <input value={values.org_name} onChange={set("org_name")} placeholder="Acme Inc" maxLength={60} required autoFocus />
        </label>
      )}
      {fresh && (
        <label>
          <span>Your name</span>
          <input value={values.name} onChange={set("name")} maxLength={60} autoComplete="name" />
        </label>
      )}
      <label>
        <span>Username</span>
        <input value={values.username} onChange={set("username")} minLength={2} maxLength={32} required autoComplete="username"
               autoCapitalize="off" spellCheck={false} />
      </label>
      <label>
        <span>{fresh ? "Password (10 or more characters)" : "Password"}</span>
        <input type="password" value={values.password} onChange={set("password")} minLength={fresh ? 10 : 1} required
               autoComplete={fresh ? "new-password" : "current-password"} />
      </label>
      <p className="settings__note">
        Your password goes to the team server at {url} only. DevDash keeps a link token, never the password.
      </p>
      {orgs && (
        <div className="org__pick">
          <p>You're in several organisations. Link this DevDash to:</p>
          {orgs.map((o) => (
            <button key={o.id} type="button" className="settings__button settings__button--quiet" onClick={() => submit(o.id)}>{o.name}</button>
          ))}
        </div>
      )}
      {error && !orgs && <p className="settings__message settings__message--error">{error}</p>}
      <button className="settings__button" type="submit" disabled={busy}>
        {busy ? "One moment…" : create && fresh ? "Create organisation" : fresh ? "Join" : "Sign in and join"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------- setting the organisation up

export function OrgSetup({ link, actions }: { link: LinkStatus; actions?: ReactNode }) {
  const [info, setInfo] = useState<OrgInfo | null>(null);
  const [teams, setTeams] = useState<OrgTeam[]>([]);
  const [people, setPeople] = useState<OrgPerson[]>([]);
  const [projects, setProjects] = useState<OrgProject[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    Promise.all([organisation.get(), organisation.teams(), organisation.people(), organisation.projects()]).then(
      ([i, t, p, r]) => (setInfo(i), setTeams(t), setPeople(p), setProjects(r), setError(null)),
      (e: Error) => setError(e.message),
    );
  }, []);
  useEffect(reload, [reload]);
  // Every change shows its result, or what went wrong.
  const run = (action: Promise<unknown>) => action.then(reload, (e: Error) => setError(e.message));

  if (!info) return error ? <p className="settings__message settings__message--error">{error}</p> : <p className="settings__note">Reading the organisation…</p>;
  const admin = info.role !== "member";
  if (!admin) {
    return (
      <section className="card settings__section">
        <div className="settings__head"><h2>{info.name}</h2>{actions}</div>
        <p className="settings__note">
          Linked at <code>{link.url}</code> as {link.person?.name}. You're a member: your admins add teams, people and projects,
          and you see the projects they give you.
        </p>
      </section>
    );
  }
  const orgLink = info.code && link.url ? `${link.url}/#join-org=${encodeURIComponent(info.code)}` : null;
  return (
    <div className="org__setup">
      {error && <p className="settings__message settings__message--error">{error}</p>}
      <section className="card settings__section">
        <div className="settings__head"><h2>{info.name}</h2>{actions}</div>
        <p className="settings__note">
          Linked at <code>{link.url}</code> as {link.person?.name}. Send people the link, or the address and the code: they join
          as members and see no project until you give them one.
        </p>
        <div className="org__code">
          <code>{info.code}</code>
          {orgLink && (
            <button className="settings__button" onClick={() => navigator.clipboard.writeText(orgLink)}>Copy organisation link</button>
          )}
          <button className="settings__button settings__button--quiet" onClick={() => {
            if (confirm("Make a new code? The old code and link stop working.")) run(organisation.newCode());
          }}>New code</button>
        </div>
        {orgLink && <p className="settings__note"><code>{orgLink}</code></p>}
      </section>

      <TeamsCard teams={teams} people={people} run={run} />
      <PeopleCard people={people} teams={teams} role={info.role} me={link.person?.username} run={run} />
      <ProjectsCard projects={projects} teams={teams} people={people} link={link} run={run} />
    </div>
  );
}

function TeamsCard({ teams, people, run }: { teams: OrgTeam[]; people: OrgPerson[]; run: (action: Promise<unknown>) => void }) {
  const [name, setName] = useState("");
  return (
    <section className="card settings__section">
      <div className="settings__head"><h2>Teams</h2></div>
      <form className="org__inline" onSubmit={(event: FormEvent) => {
        event.preventDefault();
        run(organisation.newTeam(name.trim()));
        setName("");
      }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New team, like Mobile app" maxLength={60} />
        <button className="settings__button" type="submit" disabled={!name.trim()}>Add team</button>
      </form>
      {teams.length === 0 && <p className="settings__note">No teams yet.</p>}
      <ul className="org__list">
        {teams.map((t) => {
          const outside = people.filter((p) => !t.people.some((m) => m.id === p.id));
          return (
            <li key={t.id}>
              <div className="org__row">
                <strong>{t.name}</strong>
                <button className="settings__button settings__button--quiet" onClick={() => {
                  if (confirm(`Delete ${t.name}? Its people stay in the organisation.`)) run(organisation.deleteTeam(t.id));
                }}>Delete</button>
              </div>
              <Chips items={t.people} empty="Nobody yet." onRemove={(p) => run(organisation.removeFromTeam(t.id, p.id))} />
              {outside.length > 0 && (
                <Picker label="Add person" options={outside} onPick={(id) => run(organisation.addToTeam(t.id, id))} />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PeopleCard({ people, teams, role, me, run }: {
  people: OrgPerson[]; teams: OrgTeam[]; role: OrgInfo["role"]; me?: string; run: (action: Promise<unknown>) => void;
}) {
  const [invite, setInvite] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [team, setTeam] = useState("");
  const make = () => organisation.invite(inviteRole, team ? Number(team) : null).then(
    (made) => fetchServer().then((url) => setInvite(`${url}/#join=${encodeURIComponent(made.invite)}`)),
  );
  return (
    <section className="card settings__section">
      <div className="settings__head"><h2>People</h2></div>
      <div className="org__inline">
        <select className="select" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as "member" | "admin")} aria-label="Role">
          <option value="member">Member</option>
          {role === "owner" && <option value="admin">Admin</option>}
        </select>
        <select className="select" value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Team">
          <option value="">No team yet</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button className="settings__button" onClick={make}>Make an invite link</button>
      </div>
      {invite && (
        <p className="settings__note">
          For one person, for 7 days: <code>{invite}</code>{" "}
          <button className="github__alt" onClick={() => navigator.clipboard.writeText(invite)}>Copy</button>
        </p>
      )}
      <ul className="org__list">
        {people.map((p) => (
          <li key={p.id} className="org__row">
            <span><strong>{p.name}</strong> <span className="settings__note">@{p.username} · {p.role}</span></span>
            {p.role !== "owner" && p.username !== me && (
              <span className="org__row-actions">
                {(role === "owner" || p.role === "member") && (
                  <button className="settings__button settings__button--quiet" onClick={() => run(organisation.setRole(p.id, p.role === "admin" ? "member" : "admin"))}>
                    {p.role === "admin" ? "Make member" : "Make admin"}
                  </button>
                )}
                {(role === "owner" || p.role === "member") && (
                  <button className="settings__button settings__button--quiet" onClick={() => {
                    if (confirm(`Remove ${p.name}? Their linked DevDash and what they shared go too.`)) run(organisation.removePerson(p.id));
                  }}>Remove</button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProjectsCard({ projects, teams, people, link, run }: {
  projects: OrgProject[]; teams: OrgTeam[]; people: OrgPerson[]; link: LinkStatus; run: (action: Promise<unknown>) => void;
}) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [name, setName] = useState("");
  const [repo, setRepo] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    api.repos().then(setRepos, () => {});
  }, []);
  const linked = new Set(Object.values(link.projects ?? {}).map((p) => p.id));
  const local = repos.filter((r) => !link.projects?.[String(r.id)]);
  return (
    <section className="card settings__section org__wide">
      <div className="settings__head"><h2>Projects</h2></div>
      <p className="settings__note">Add a project, then give it to teams or people. Only they (and admins) see it.</p>
      {local.length > 0 && (
        <Picker label="Add from this computer" options={local.map((r) => ({ id: r.id, name: r.name }))}
                onPick={(id) => run(team.linkProject(id))} />
      )}
      <Importer existing={projects} run={run} />
      <form className="org__inline" onSubmit={(event: FormEvent) => {
        event.preventDefault();
        run(organisation.newProject(name.trim(), repo.trim() || null));
        setName("");
        setRepo("");
      }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Or by name, like shop-app" maxLength={80} />
        <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="Repo (optional): github:acme/shop-app" maxLength={200} />
        <button className="settings__button" type="submit" disabled={!name.trim()}>Add</button>
      </form>
      <ul className="org__list">
        {projects.map((p) => (
          <li key={p.id}>
            <div className="org__row">
              <span><strong>{p.name}</strong> {p.repo && <span className="settings__note">{p.repo}</span>}
                {linked.has(p.id) && <span className="settings__note"> · on this computer</span>}</span>
              <button className="settings__button settings__button--quiet" onClick={() => setOpen(open === p.id ? null : p.id)}>
                {open === p.id ? "Close" : "Who has it"}
              </button>
            </div>
            {open === p.id && <ProjectAccess id={p.id} teams={teams} people={people} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

// Imports repos as projects, listed through this DevDash's own GitHub or CodeCommit
// connection (Settings → GitHub / CodeCommit): only their names go to the team server, never a
// key. Teammates then clone them with their own login.
function Importer({ existing, run }: { existing: OrgProject[]; run: (action: Promise<unknown>) => void }) {
  const [source, setSource] = useState<"github" | "codecommit" | null>(null);
  const [found, setFound] = useState<{ repo: string; name: string; note: string | null }[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const have = new Set(existing.map((p) => p.repo).filter(Boolean));

  const open = (from: "github" | "codecommit") => {
    setSource(from);
    setFound(null);
    setPicked(new Set());
    setError(null);
    const list = from === "github"
      ? api.githubRepos().then((repos) => repos.map((r) => ({
          repo: `github:${r.full_name.toLowerCase()}`, name: r.full_name.split("/")[1] ?? r.full_name, note: r.description })))
      : api.codecommitRepos().then((repos) => repos.map((r) => ({ repo: `codecommit:${r.name}`, name: r.name, note: r.description })));
    list.then(setFound, (e: Error) => setError(e.message));
  };
  const add = () => {
    if (!found) return;
    setBusy(true);
    const chosen = found.filter((r) => picked.has(r.repo));
    Promise.all(chosen.map((r) => organisation.newProject(r.name, r.repo).catch(() => null)))
      .then(() => (setSource(null), run(Promise.resolve())))
      .finally(() => setBusy(false));
  };
  const shown = (found ?? []).filter((r) => !filter || r.repo.includes(filter.toLowerCase()));
  return (
    <div className="org__import">
      <div className="org__inline">
        <span className="settings__note">Import repos:</span>
        <button className="settings__button settings__button--quiet" onClick={() => open("github")}>From GitHub</button>
        <button className="settings__button settings__button--quiet" onClick={() => open("codecommit")}>From CodeCommit</button>
      </div>
      {source && (
        <div className="org__picklist">
          {error && <p className="settings__message settings__message--error">{error}</p>}
          {!found && !error && <p className="settings__note">Reading your repositories…</p>}
          {found && (
            <>
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter" aria-label="Filter repositories" />
              <ul>
                {shown.map((r) => (
                  <li key={r.repo}>
                    <label>
                      <input type="checkbox" disabled={have.has(r.repo)} checked={picked.has(r.repo) || have.has(r.repo)}
                             onChange={(e) => {
                               const next = new Set(picked);
                               if (e.target.checked) next.add(r.repo);
                               else next.delete(r.repo);
                               setPicked(next);
                             }} />
                      <span><strong>{r.name}</strong> <span className="settings__note">{r.repo}{have.has(r.repo) ? " · already a project" : ""}</span></span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="org__inline">
                <button className="settings__button" onClick={add} disabled={busy || picked.size === 0}>
                  {busy ? "Adding…" : `Add ${picked.size || ""} as projects`}
                </button>
                <button className="settings__button settings__button--quiet" onClick={() => setSource(null)}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ProjectAccess({ id, teams, people }: { id: number; teams: OrgTeam[]; people: OrgPerson[] }) {
  const [project, setProject] = useState<OrgProjectDetail | null>(null);
  const reload = useCallback(() => {
    organisation.project(id).then(setProject, () => {});
  }, [id]);
  useEffect(reload, [reload]);
  if (!project) return null;
  const act = (action: Promise<unknown>) => action.then(reload, (e: Error) => alert(e.message));
  const freeTeams = teams.filter((t) => !project.teams.some((p) => p.id === t.id));
  const freePeople = people.filter((p) => p.role === "member" && !project.people.some((q) => q.id === p.id));
  return (
    <div className="org__access">
      <span className="settings__note">Teams</span>
      <Chips items={project.teams} empty="No team yet." onRemove={(t) => act(organisation.takeTeam(id, t.id))} />
      {freeTeams.length > 0 && <Picker label="Give to team" options={freeTeams} onPick={(t) => act(organisation.giveTeam(id, t))} />}
      <span className="settings__note">People on their own</span>
      <Chips items={project.people} empty="Nobody on their own." onRemove={(p) => act(organisation.takePerson(id, p.id))} />
      {freePeople.length > 0 && <Picker label="Give to person" options={freePeople} onPick={(p) => act(organisation.givePerson(id, p))} />}
      <button className="settings__button settings__button--quiet org__danger" onClick={() => {
        if (confirm(`Remove ${project.name} and what was shared to it from the team server? Nothing on anyone's computer changes.`)) {
          organisation.deleteProject(id).then(() => location.reload(), (e: Error) => alert(e.message));
        }
      }}>Remove project</button>
    </div>
  );
}

function Chips({ items, empty, onRemove }: { items: { id: number; name: string }[]; empty: string; onRemove: (item: { id: number; name: string }) => void }) {
  if (items.length === 0) return <p className="settings__note">{empty}</p>;
  return (
    <div className="org__chips">
      {items.map((item) => (
        <span key={item.id} className="org__chip">
          {item.name}
          <button aria-label={`Remove ${item.name}`} onClick={() => onRemove(item)}>×</button>
        </span>
      ))}
    </div>
  );
}

function Picker({ label, options, onPick }: { label: string; options: { id: number; name: string }[]; onPick: (id: number) => void }) {
  const [value, setValue] = useState(String(options[0]?.id ?? ""));
  return (
    <div className="org__inline">
      <select className="select" value={value} onChange={(e) => setValue(e.target.value)} aria-label={label}>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <button className="settings__button settings__button--quiet" onClick={() => value && onPick(Number(value))}>{label}</button>
    </div>
  );
}

function fetchServer(): Promise<string> {
  return team.status().then((found) => found.link.url ?? "");
}

// ---------------------------------------------------------------- Settings → Organisation

export function OrgSettings({ onMode }: { onMode?: (mode: Mode) => void }) {
  const [link, setLink] = useState<LinkStatus | null>(null);
  const [host, setHost] = useState<HostStatus | null>(null);
  const [choosing, setChoosing] = useState(false);
  const reload = useCallback(() => {
    team.status().then((found) => (setLink(found.link), setHost(found.host)), () => {});
  }, []);
  useEffect(reload, [reload]);
  if (!link || !host) return <section className="card settings__section"><p className="settings__note">Checking…</p></section>;
  const done = (found: LinkStatus) => {
    setChoosing(false);
    setLink(found);
    onMode?.(found.mode);
    reload();
  };
  if (choosing || link.mode === null) return <OrgChooser compact onDone={done} />;
  const leave = () => {
    if (!confirm("Stop using DevDash with this organisation? This DevDash is unlinked; your projects here stay.")) return;
    team.unlink().then(() => team.setMode(null)).then(done);
  };
  return (
    <>
      {link.mode === "org" && link.connected ? (
        <>
          <OrgSetup link={link} actions={
            <button className="settings__button settings__button--quiet" onClick={leave}>Leave on this computer</button>
          } />
          <Linking link={link} onLink={setLink} suggested={null} />
        </>
      ) : (
        <section className="card settings__section">
          <div className="settings__head"><h2>Organisation</h2></div>
          <p className="settings__note">You use DevDash on your own. Join your company's organisation, or create one, to work as a team.</p>
          <div>
            <button className="settings__button" onClick={() => setChoosing(true)}>Join or create an organisation</button>
          </div>
        </section>
      )}
      <Hosting host={host} onHost={setHost} />
    </>
  );
}

const iconProps = { viewBox: "0 0 24 24", width: 26, height: 26, fill: "none", stroke: "currentColor", strokeWidth: 1.7,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

function JoinIcon() {
  return (
    <svg {...iconProps}>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
    </svg>
  );
}

function CreateIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M9 21v-6h6v6" />
      <path d="M12 8v4M10 10h4" />
    </svg>
  );
}

function SoloIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}
