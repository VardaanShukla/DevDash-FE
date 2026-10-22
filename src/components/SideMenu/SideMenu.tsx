import type { ReactNode } from "react";
import "./SideMenu.css";

// The menu down the left side: the brand, the project, then one item per view, with
// Settings and Help at the bottom. Each item's shortcut key (set in Settings) shows in its
// tooltip; App listens for the keys. On a phone it turns into a bar along the bottom.

export type View = "home" | "digest" | "summary" | "overview" | "flow" | "map" | "changes" | "commits" | "project" | "settings" | "help";

// Screens marked inMenu: false are sections of Home; Home's links open their full screen.
export const VIEWS: { id: View; label: string; hint: string; icon: ReactNode; inMenu?: false }[] = [
  { id: "home", label: "Home", hint: "Your dashboard: AI changes today, projects, the branch and more. Customise it to show what you need", icon: <HomeIcon /> },
  { id: "digest", label: "AI changes", hint: "What your AI coding tool changed each day, and what to check", icon: <DigestIcon /> },
  { id: "summary", label: "Summary", hint: "The whole project: what it is and how it works", icon: <SummaryIcon /> },
  { id: "overview", label: "This branch", hint: "The branch on screen at a glance", icon: <GaugeIcon />, inMenu: false },
  { id: "flow", label: "Branch flow", hint: "How branches split off and merge back", icon: <FlowIcon />, inMenu: false },
  { id: "map", label: "Project map", hint: "The parts of the project and what uses what", icon: <MapIcon />, inMenu: false },
  { id: "changes", label: "Changes", hint: "Every changed file and function, before and after", icon: <DiffIcon /> },
  { id: "commits", label: "Commits", hint: "Each saved step on this branch", icon: <CommitIcon /> },
  { id: "project", label: "Projects", hint: "Add, switch or remove projects", icon: <FolderIcon /> },
  { id: "settings", label: "Settings", hint: "Theme, uncommitted work, your account and shortcut keys", icon: <SettingsIcon /> },
  { id: "help", label: "Help", hint: "Set DevDash up and learn what each screen shows", icon: <HelpIcon /> },
];
// Settings and Help sit apart, at the bottom of the menu.
const BOTTOM = 2;
const MENU = VIEWS.filter((view) => view.inMenu !== false);

type Props = {
  view: View;
  onView: (view: View) => void;
  // Counts shown on an item, such as how many files changed.
  badges?: Partial<Record<View, number>>;
  // The project switcher, shown under the brand.
  project?: ReactNode;
  // Each screen's shortcut key, for its tooltip.
  keys?: Partial<Record<View, string>>;
};

export default function SideMenu({ view, onView, badges = {}, project, keys = {} }: Props) {
  // A Home section's full screen lights Home in the menu.
  const lit = VIEWS.find((entry) => entry.id === view)?.inMenu === false ? "home" : view;
  const item = (entry: (typeof VIEWS)[number]) => (
    <button
      key={entry.id}
      className={`menu__item${lit === entry.id ? " menu__item--active" : ""}`}
      onClick={() => onView(entry.id)}
      aria-current={view === entry.id ? "page" : undefined}
      title={`${entry.label}: ${entry.hint}${keys[entry.id] ? ` (key ${keys[entry.id]})` : ""}`}
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
        {MENU.slice(0, -BOTTOM).map(item)}
        <span className="menu__spacer" />
        {MENU.slice(-BOTTOM).map(item)}
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

function SettingsIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
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

function SummaryIcon() {
  return (
    <svg {...iconProps}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}
