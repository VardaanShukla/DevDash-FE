import { useEffect, type ReactNode } from "react";
import "./SideMenu.css";

// The menu down the left side: the brand, the project, then one item per view. Keys 1 to 9
// switch to the first nine. On a phone it turns into a bar along the bottom.

export type View = "home" | "digest" | "summary" | "overview" | "flow" | "map" | "constellation" | "changes" | "commits" | "planner" | "project" | "help";

export const VIEWS: { id: View; label: string; hint: string; icon: ReactNode }[] = [
  { id: "home", label: "Home", hint: "All your projects, to-dos and calendar", icon: <HomeIcon /> },
  { id: "digest", label: "Claude's changes", hint: "What Claude changed each day, and what to check", icon: <DigestIcon /> },
  { id: "summary", label: "Summary", hint: "The whole project: what it is and how it works", icon: <SummaryIcon /> },
  { id: "overview", label: "This branch", hint: "The branch on screen at a glance", icon: <GaugeIcon /> },
  { id: "flow", label: "Branch flow", hint: "How branches split off and merge back", icon: <FlowIcon /> },
  { id: "map", label: "Project map", hint: "The parts of the project and what uses what", icon: <MapIcon /> },
  { id: "constellation", label: "Constellation", hint: "The project as a sky of parts: pick one to look inside", icon: <ConstellationIcon /> },
  { id: "changes", label: "Changes", hint: "Every changed file and function, before and after", icon: <DiffIcon /> },
  { id: "commits", label: "Commits", hint: "Each saved step on this branch", icon: <CommitIcon /> },
  { id: "planner", label: "My day", hint: "Your to-dos and the week on your calendar", icon: <DayIcon /> },
  { id: "project", label: "Projects", hint: "Add, switch or remove projects", icon: <FolderIcon /> },
  { id: "help", label: "Help", hint: "Set DevDash up and learn what each screen shows", icon: <HelpIcon /> },
];

type Props = {
  view: View;
  onView: (view: View) => void;
  // Counts shown on an item, such as how many files changed.
  badges?: Partial<Record<View, number>>;
  // The project switcher, shown under the brand.
  project?: ReactNode;
};

export default function SideMenu({ view, onView, badges = {}, project }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.metaKey || event.ctrlKey || event.altKey || /INPUT|SELECT|TEXTAREA/.test(target.tagName)) return;
      const item = VIEWS[Number(event.key) - 1];
      if (item) onView(item.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onView]);

  const item = (entry: (typeof VIEWS)[number], i: number) => (
    <button
      key={entry.id}
      className={`menu__item${view === entry.id ? " menu__item--active" : ""}`}
      onClick={() => onView(entry.id)}
      aria-current={view === entry.id ? "page" : undefined}
      title={`${entry.label}: ${entry.hint} (key ${i + 1})`}
    >
      <span className="menu__icon">{entry.icon}</span>
      <span className="menu__label">{entry.label}</span>
      {badges[entry.id] ? <span className="menu__badge">{badges[entry.id]}</span> : null}
    </button>
  );

  return (
    <aside className="menu">
      <span className="menu__brand" aria-label="DevDash">
        <span className="brand__dev">Dev</span>
        <span className="brand__tag">&lt;/&gt;</span>
        <span className="brand__dash">Dash</span>
      </span>
      {project && <div className="menu__project">{project}</div>}
      <nav className="menu__nav" aria-label="Views">
        {VIEWS.slice(0, -1).map(item)}
        <span className="menu__spacer" />
        {item(VIEWS[VIEWS.length - 1], VIEWS.length - 1)}
      </nav>
    </aside>
  );
}

const iconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function GaugeIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4.5 17a8.5 8.5 0 1 1 15 0" />
      <path d="M12 13l4-4" />
      <circle cx="12" cy="13" r="1.2" />
    </svg>
  );
}

function FlowIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="5" cy="6" r="2" />
      <circle cx="5" cy="18" r="2" />
      <circle cx="19" cy="12" r="2" />
      <path d="M5 8v8M7 6h3a5 5 0 0 1 5 5v1h2" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="3" width="7" height="6" rx="1.5" />
      <rect x="14" y="15" width="7" height="6" rx="1.5" />
      <rect x="14" y="3" width="7" height="6" rx="1.5" />
      <path d="M10 6h4M17.5 9v6M10 7.5l4.5 7" />
    </svg>
  );
}

function DiffIcon() {
  return (
    <svg {...iconProps}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M9 12h6M12 9v6M9 17h6" />
    </svg>
  );
}

function CommitIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M2 12h6.5M15.5 12H22" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4" />
      <circle cx="12" cy="16.8" r="0.6" fill="currentColor" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}

function DigestIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z" />
      <path d="M5 17h14M5 21h9" />
    </svg>
  );
}

function ConstellationIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="2.5" />
      <circle cx="5" cy="6" r="1.5" />
      <circle cx="19" cy="5" r="1.5" />
      <circle cx="18" cy="18" r="1.5" />
      <circle cx="5" cy="18" r="1.5" />
      <path d="M10.2 10.5 6.2 7M13.8 10.6l4-4.4M13.9 13.8l3 3M10.2 13.7l-4 3.4" />
    </svg>
  );
}

function DayIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="M8.5 15l2 2 4-4" />
    </svg>
  );
}

function SummaryIcon() {
  return (
    <svg {...iconProps}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}
