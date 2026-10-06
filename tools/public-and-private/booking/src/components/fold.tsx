import type { ReactNode } from "react";
import { Down } from "./icons.tsx";

// A section that folds (Hours on a phone: the week first, the rest one tap
// away): its title and a line saying what is inside, then its content.
export function Fold({ id, title, status, open = false, icon, children }: { id: string; title: string; status: string; open?: boolean; icon?: ReactNode; children: ReactNode }) {
  return (
    <details className="card fold" id={id} open={open}>
      <summary>
        <span className="fold-head">
          <h2 id={`${id}-title`}>{icon}{title}</h2>
          <span className="hint">{status}</span>
        </span>
        <span className="fold-chevron" aria-hidden="true"><Down /></span>
      </summary>
      <div className="stack fold-body">{children}</div>
    </details>
  );
}
