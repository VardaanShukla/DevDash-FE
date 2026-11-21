import type { CSSProperties } from "react";
import { LightTile } from "../Splash/LoomaTile";
import "./Logo.css";

// The Looma mark: the dark glass tile with an "L" drawn in light, the one the splash ends on.
// It tips toward the pointer in the menu. public/looma.svg is the same tile, flat, for the
// favicon, app icons and exports.

type Props = {
  // Edge length in pixels.
  size?: number;
  // Show the name beside the mark.
  wordmark?: boolean;
  className?: string;
};

export default function Logo({ size = 32, wordmark = false, className = "" }: Props) {
  const style = { "--logo-size": `${size}px` } as CSSProperties;
  return (
    <span className={`logo ${className}`} style={style} aria-label="Looma" role="img">
      <span className="logo__key" aria-hidden="true">
        {/* Below 80px the strokes are drawn heavier, so the L still reads in the menu. */}
        <LightTile className="logo__face" weight={size < 80 ? 2.4 : 1} />
      </span>
      {wordmark && (
        <span className="logo__word" aria-hidden="true">
          LOOMA
        </span>
      )}
    </span>
  );
}
