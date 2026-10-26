import type { CSSProperties } from "react";
import "./Logo.css";

// The DevDash mark: a keycap whose face is a "D" drawn as a dashboard dial, its red needle
// swinging up. It is built from real layers in 3D (the face on top, the keycap's sides
// stacked under it), so it can turn in space on the splash and tip toward the pointer in
// the menu. The favicon in index.html is the same face, flat.

type Props = {
  // Edge length in pixels.
  size?: number;
  // How many layers make the keycap's sides; more is a deeper key.
  depth?: number;
  // Turns slowly in 3D (the splash); otherwise it sits still, a little tipped back.
  spin?: boolean;
  // Show the name beside the mark.
  wordmark?: boolean;
  className?: string;
};

export default function Logo({ size = 32, depth = 6, spin = false, wordmark = false, className = "" }: Props) {
  const style = { "--logo-size": `${size}px`, "--logo-depth": depth } as CSSProperties;
  return (
    <span className={`logo${spin ? " logo--spin" : ""} ${className}`} style={style} aria-label="DevDash" role="img">
      <span className="logo__key" aria-hidden="true">
        {Array.from({ length: depth }, (_, i) => (
          <span key={i} className="logo__side" style={{ "--z": i + 1 } as CSSProperties} />
        ))}
        <svg className="logo__face" viewBox="0 0 64 64">
          <defs>
            <linearGradient id="logo-face" x1="0" y1="0" x2="0.4" y2="1">
              <stop offset="0" stopColor="#7dd8ff" />
              <stop offset="0.5" stopColor="#1ea2e6" />
              <stop offset="1" stopColor="#0768a8" />
            </linearGradient>
            <radialGradient id="logo-sheen" cx="0.3" cy="0.15" r="0.75">
              <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
              <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#logo-face)" />
          <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#logo-sheen)" />
          <rect x="2.75" y="2.75" width="58.5" height="58.5" rx="15.25" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.5" />
          {/* The D: a stem and a dial's bowl, with ticks along the bowl. */}
          <path d="M19 16v32h9a16 16 0 0 0 0-32z" fill="none" stroke="#fff" strokeWidth="5.5" strokeLinejoin="round" />
          <path d="M33 22.5l1.6-2.6M38.4 28l2.8-1.3M39.5 35h3" stroke="#fff" strokeOpacity="0.7" strokeWidth="2" strokeLinecap="round" />
          {/* The needle, pinned at the bottom of the stem's bowl. */}
          <path d="M26 40L36.5 25.5" stroke="#ff4d4d" strokeWidth="4" strokeLinecap="round" />
          <circle cx="26" cy="40" r="4.2" fill="#fff" />
        </svg>
      </span>
      {wordmark && (
        <span className="logo__word" aria-hidden="true">
          <span className="logo__dev">Dev</span>
          <span className="logo__dash">Dash</span>
        </span>
      )}
    </span>
  );
}
