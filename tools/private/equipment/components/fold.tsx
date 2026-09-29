import type { ReactNode } from "react";
import { Chevron } from "./icons.tsx";

// A long list of the overview folded to its first few lines, the rest one
// tap away ("See 6 more"): a manager on a phone sees every section, not
// the first two. The browser's own details element: no script, the
// keyboard and screen readers know it. A list only one longer than `keep`
// is shown whole (folding one line saves nothing).
export function Fold({ items, keep = 3, more, less }: { items: ReactNode[]; keep?: number; more: string; less: string }) {
  if (items.length <= keep + 1) return <ul className="plain">{items}</ul>;
  return (
    <>
      <ul className="plain">{items.slice(0, keep)}</ul>
      <details className="fold">
        <summary className="button link small"><Chevron /><span className="fold-more">{more}</span><span className="fold-less">{less}</span></summary>
        <ul className="plain">{items.slice(keep)}</ul>
      </details>
    </>
  );
}
