import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { organisation, type ChatChannel, type ChatMessage, type LinkStatus, type OrgPerson } from "../../api/team";
import "./Chat.css";

// Team chat, kept on the team server: one conversation for the whole organisation, one per
// team (yours; every team's for admins), and direct ones between two people. Text only. The
// open conversation is read again every few seconds, the list every few more.

const POLL_MESSAGES = 3_000;
const POLL_CHANNELS = 10_000;

function when(iso: string) {
  const date = new Date(iso);
  const today = new Date().toDateString() === date.toDateString();
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return today ? time : `${date.toLocaleDateString([], { day: "numeric", month: "short" })}, ${time}`;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("") || "?";
}

// Every few seconds while mounted; for the unread count in the side menu.
export function useChatUnread(enabled: boolean) {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let stale = false;
    const read = () => organisation.chats().then(
      (found) => !stale && setUnread(found.reduce((sum, c) => sum + c.unread, 0)),
      () => {},
    );
    read();
    const timer = window.setInterval(read, 20_000);
    return () => {
      stale = true;
      window.clearInterval(timer);
    };
  }, [enabled]);
  return enabled ? unread : 0;
}

export default function Chat({ link }: { link: LinkStatus }) {
  const [channels, setChannels] = useState<ChatChannel[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [people, setPeople] = useState<OrgPerson[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const me = link.person?.username;

  const loadChannels = useCallback(() => {
    organisation.chats().then((found) => {
      setChannels(found);
      setOpen((current) => current ?? found[0]?.id ?? null);
    }, (e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    loadChannels();
    const timer = window.setInterval(loadChannels, POLL_CHANNELS);
    return () => window.clearInterval(timer);
  }, [loadChannels]);

  // The open conversation: everything once, then only what's new.
  useEffect(() => {
    if (open === null) return;
    let stale = false;
    let last = 0;
    setMessages([]);
    const read = () => organisation.messages(open, last).then((found) => {
      if (stale || found.length === 0) return;
      last = found[found.length - 1]!.id;
      setMessages((current) => {
        const seen = new Set(current.map((m) => m.id));
        return [...current, ...found.filter((m) => !seen.has(m.id))];
      });
      organisation.read(open, last).catch(() => {});
    }, (e: Error) => !stale && setError(e.message));
    read();
    const timer = window.setInterval(read, POLL_MESSAGES);
    return () => {
      stale = true;
      window.clearInterval(timer);
    };
  }, [open]);

  // Stay at the newest message.
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages.length]);

  const send = () => {
    const body = text.trim();
    if (!body || open === null) return;
    setText("");
    organisation.send(open, body).then(
      (sent) => setMessages((current) => (current.some((m) => m.id === sent.id) ? current : [...current, sent])),
      (e: Error) => (setError(e.message), setText(body)),
    );
  };
  const keys = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };
  const startDirect = (personId: number) => {
    setPicking(false);
    organisation.direct(personId).then((made) => (loadChannels(), setOpen(made.id)), (e: Error) => setError(e.message));
  };
  const remove = (message: ChatMessage) => {
    if (open === null || !confirm("Delete this message for everyone?")) return;
    organisation.deleteMessage(open, message.id).then(
      () => setMessages((current) => current.map((m) => (m.id === message.id ? { ...m, deleted: true, text: "" } : m))),
      (e: Error) => setError(e.message),
    );
  };

  const current = channels?.find((c) => c.id === open) ?? null;
  const groups: [string, ChatChannel[]][] = [
    ["Organisation", (channels ?? []).filter((c) => c.kind === "org")],
    ["Teams", (channels ?? []).filter((c) => c.kind === "team")],
    ["Direct", (channels ?? []).filter((c) => c.kind === "direct")],
  ];
  return (
    <div className="chat card">
      <aside className="chat__side" aria-label="Conversations">
        {groups.map(([title, items]) => (
          <div key={title} className="chat__group">
            <div className="chat__group-head">
              <span>{title}</span>
              {title === "Direct" && (
                <button className="chat__new" aria-label="New direct message" title="New direct message" onClick={() => {
                  setPicking(!picking);
                  if (!people) organisation.people().then(setPeople, (e: Error) => setError(e.message));
                }}>+</button>
              )}
            </div>
            {title === "Direct" && picking && people && (
              <ul className="chat__people">
                {people.filter((p) => p.username !== me).map((p) => (
                  <li key={p.id}><button onClick={() => startDirect(p.id)}>{p.name}</button></li>
                ))}
              </ul>
            )}
            {items.map((c) => (
              <button key={c.id} className={`chat__channel${c.id === open ? " is-on" : ""}`} onClick={() => setOpen(c.id)}>
                <span className="chat__hash" aria-hidden="true">{c.kind === "direct" ? "@" : "#"}</span>
                <span className="chat__channel-name">{c.name}</span>
                {c.unread > 0 && c.id !== open && <span className="chat__badge">{c.unread > 99 ? "99+" : c.unread}</span>}
              </button>
            ))}
            {items.length === 0 && title !== "Organisation" && (
              <p className="chat__empty">{title === "Teams" ? "You're not in a team yet." : "None yet. Press + to start one."}</p>
            )}
          </div>
        ))}
      </aside>

      <section className="chat__main" aria-label={current ? `Chat: ${current.name}` : "Chat"}>
        <header className="chat__head">
          <strong>{current ? `${current.kind === "direct" ? "@" : "#"} ${current.name}` : "Chat"}</strong>
          <span className="settings__note">{current?.kind === "org" ? "Everyone in the organisation" : current?.kind === "team" ? "This team" : current ? "Just the two of you" : ""}</span>
        </header>
        <div className="chat__messages" ref={list}>
          {messages.length === 0 && <p className="chat__empty">No messages yet. Say hello.</p>}
          {messages.map((m, index) => {
            const previous = messages[index - 1];
            const joined = previous && previous.person_id === m.person_id
              && new Date(m.at).getTime() - new Date(previous.at).getTime() < 5 * 60_000;
            return (
              <article key={m.id} className={`chat__message${joined ? " chat__message--joined" : ""}`}>
                {!joined && <span className="chat__avatar" aria-hidden="true">{initials(m.person)}</span>}
                <div>
                  {!joined && (
                    <header>
                      <strong>{m.person}</strong> <span className="settings__note">{when(m.at)}</span>
                    </header>
                  )}
                  {m.deleted ? <p className="chat__deleted">Message deleted</p> : <p>{m.text}</p>}
                </div>
                {!m.deleted && m.person === link.person?.name && (
                  <button className="chat__delete" aria-label="Delete message" title="Delete" onClick={() => remove(m)}>×</button>
                )}
              </article>
            );
          })}
        </div>
        {error && <p className="settings__message settings__message--error">{error}</p>}
        <div className="chat__composer">
          <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={keys} maxLength={4000} rows={2}
                    placeholder={current ? `Message ${current.kind === "direct" ? current.name : `#${current.name}`}` : "Pick a conversation"}
                    disabled={!current} aria-label="Message" />
          <button className="settings__button" onClick={send} disabled={!current || !text.trim()}>Send</button>
        </div>
        <p className="chat__hint">Enter sends, Shift+Enter starts a new line. Text only.</p>
      </section>
    </div>
  );
}
