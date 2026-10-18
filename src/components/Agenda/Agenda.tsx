import { useCallback, useEffect, useState } from "react";
import { api } from "../../api/client";
import type { Agenda as AgendaData, CalendarEvent } from "../../api/types";
import "./Agenda.css";

// The week ahead from the user's calendar, read from its private iCal address. Read-only:
// events are added and changed in the calendar itself.

const REFRESH_MS = 5 * 60_000;

// `days`: how many days ahead to show, from today.
export default function Agenda({ days: dayCount = 7 }: { days?: number }) {
  const [agenda, setAgenda] = useState<AgendaData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback((refresh = false) => {
    api.calendar(dayCount, refresh).then(
      (result) => {
        setAgenda(result);
        setError(null);
      },
      (e: Error) => setError(e.message),
    );
  }, [dayCount]);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => {
      load();
      setNow(new Date());
    }, REFRESH_MS);
    // Keeps "now" and "in 20 minutes" right between fetches.
    const clock = window.setInterval(() => setNow(new Date()), 60_000);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(clock);
    };
  }, [load]);

  if (!agenda) {
    return (
      <section className="card agenda">
        <h2>Calendar</h2>
        <p className="agenda__muted">{error ?? "Reading your calendar…"}</p>
      </section>
    );
  }
  if (!agenda.connected) return <Connect onConnected={setAgenda} />;

  const disconnect = () => api.disconnectCalendar().then(() => load(), (e: Error) => setError(e.message));
  const days = byDay(agenda.events, now);
  const next = agenda.events.find((event) => !event.all_day && new Date(event.end) > now);

  return (
    <section className="card agenda">
      <header className="agenda__head">
        <div>
          <h2>Calendar</h2>
          <span className="agenda__muted">
            {dayCount === 1 ? "Today" : `Next ${dayCount} days`} from {agenda.source}
          </span>
        </div>
        <div className="agenda__actions">
          <button className="agenda__link" onClick={() => load(true)}>
            Refresh
          </button>
          <button className="agenda__link agenda__link--quiet" onClick={disconnect}>
            Disconnect
          </button>
        </div>
      </header>
      {(agenda.error || error) && <p className="agenda__error">{agenda.error ?? error}</p>}
      {next && <p className="agenda__next">{nextLine(next, now)}</p>}
      <div className="agenda__days">
        {days.length === 0 && !agenda.error && <p className="agenda__muted">Nothing on your calendar {dayCount === 1 ? "today" : `in the next ${dayCount} days`}.</p>}
        {days.map(([day, events]) => (
          <div key={day} className="agenda__day">
            <h3>{dayLabel(day, now)}</h3>
            <ul>
              {events.map((event, i) => {
                const live = !event.all_day && new Date(event.start) <= now && new Date(event.end) > now;
                const past = !event.all_day && new Date(event.end) <= now;
                return (
                  <li key={`${event.start}${event.title}${i}`} className={`event${live ? " event--now" : ""}${past ? " event--past" : ""}`}>
                    <span className="event__time">{event.all_day ? "All day" : `${clock(event.start)}–${clock(event.end)}`}</span>
                    <span className="event__title">
                      {event.title}
                      {event.location && <em>{event.location}</em>}
                    </span>
                    {live && <span className="event__badge">Now</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function Connect({ onConnected }: { onConnected: (agenda: AgendaData) => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    api
      .connectCalendar(url)
      .then(onConnected, (e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  };

  return (
    <section className="card agenda">
      <h2>Calendar</h2>
      <p className="agenda__muted">See the week ahead next to your work. DevDash only reads it; nothing is changed.</p>
      <ol className="agenda__steps">
        <li>
          Open <strong>Google Calendar</strong> on a computer, then <strong>Settings</strong>.
        </li>
        <li>Under “Settings for my calendars”, pick your calendar, then <strong>Integrate calendar</strong>.</li>
        <li>
          Copy <strong>Secret address in iCal format</strong> and paste it below.
        </li>
      </ol>
      <p className="agenda__muted">
        Outlook and Apple Calendar work too: use the calendar's published .ics or webcal link. Keep the address private;
        anyone with it can read your calendar.
      </p>
      <form className="agenda__connect" onSubmit={submit}>
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
          aria-label="Calendar address"
          spellCheck={false}
          autoComplete="off"
        />
        <button disabled={busy || !url.trim()}>{busy ? "Checking…" : "Connect"}</button>
      </form>
      {error && <p className="agenda__error">{error}</p>}
    </section>
  );
}

// Events grouped by their day, in order. All-day events cover each day they span.
function byDay(events: CalendarEvent[], now: Date): [string, CalendarEvent[]][] {
  const days = new Map<string, CalendarEvent[]>();
  const today = localDate(now);
  for (const event of events) {
    const first = event.all_day ? event.start : localDate(new Date(event.start));
    const last = event.all_day ? addDays(event.end, -1) : first;
    for (let day = first < today ? today : first; day <= last; day = addDays(day, 1)) {
      if (!days.has(day)) days.set(day, []);
      days.get(day)!.push(event);
    }
  }
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function localDate(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  return localDate(new Date(y, m - 1, d + n));
}

function dayLabel(day: string, now: Date) {
  const today = localDate(now);
  if (day === today) return "Today";
  if (day === addDays(today, 1)) return "Tomorrow";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
}

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function nextLine(event: CalendarEvent, now: Date) {
  const start = new Date(event.start);
  if (start <= now) return `Now: ${event.title}, until ${clock(event.end)}`;
  const minutes = Math.round((start.getTime() - now.getTime()) / 60_000);
  const day = localDate(start);
  const today = localDate(now);
  const when =
    minutes < 60
      ? `in ${minutes} minute${minutes === 1 ? "" : "s"}`
      : day === today
        ? `at ${clock(event.start)}`
        : `${day === addDays(today, 1) ? "tomorrow" : dayLabel(day, now)} at ${clock(event.start)}`;
  return `Next: ${event.title} ${when}`;
}
