import type { ReactNode } from "react";

// A small coloured label: green for added, red for removed, blue for changed.
export default function Pill({ tone, children }: { tone: "add" | "del" | "mod"; children: ReactNode }) {
  return <span className={`pill pill--${tone}`}>{children}</span>;
}
