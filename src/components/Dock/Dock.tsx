import { useEffect, type ReactNode } from "react";
import "./Dock.css";

// The menu: a dock along the bottom of the screen, like a car's. Keys 1 to 6 switch views.

export type View = "overview" | "flow" | "map" | "changes" | "commits" | "project";

export const VIEWS: { id: View; label: string; icon: ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <GaugeIcon /> },
  { id: "flow", label: "Branch flow", icon: <FlowIcon /> },
  { id: "map", label: "Project map", icon: <MapIcon /> },
  { id: "changes", label: "Changes", icon: <DiffIcon /> },
  { id: "commits", label: "Commits", icon: <CommitIcon /> },
  { id: "project", label: "Projects", icon: <FolderIcon /> },
];

type Props = {
  view: View;
  onView: (view: View) => void;
  // Counts shown on an item, such as how many files changed.
  badges?: Partial<Record<View, number>>;
  children?: ReactNode;
};

export default function Dock({ view, onView, badges = {}, children }: Props) {
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

  return (
    <nav className="dock" aria-label="Views">
      {VIEWS.map((item, i) => (
        <button
          key={item.id}
          className={`dock__item${view === item.id ? " dock__item--active" : ""}`}
          onClick={() => onView(item.id)}
          aria-current={view === item.id ? "page" : undefined}
          title={`${item.label} (${i + 1})`}
        >
          <span className="dock__icon">{item.icon}</span>
          <span className="dock__label">{item.label}</span>
          {badges[item.id] ? <span className="dock__badge">{badges[item.id]}</span> : null}
        </button>
      ))}
      {children && <span className="dock__divider" aria-hidden="true" />}
      {children}
    </nav>
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
