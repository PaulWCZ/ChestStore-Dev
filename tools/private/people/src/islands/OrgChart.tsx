import { fill, plural } from "@argentic/chest-app/client";
import { useState } from "react";
import { ChevronDown } from "../components/icons.tsx";
import { Portrait } from "../components/portrait.tsx";

// The trees themselves: nested lists (a screen reader reads who reports to
// whom), each manager's team folding open and shut with a button. A large
// company starts folded below the second level.
// left: a manager who left, kept above their reports until HR names
// someone else (no profile to open).
// offline: someone without the Chest (an HR record), marked; href is
// where their card leads (their record for HR, nothing for anyone else).
export type ChartNode = { id: string; name: string; photo: string | null; title: string; team: string; size: number; left: boolean; href: string | null; offline: boolean; reports: ChartNode[] };
type Words = { reports: { one: string; other: string }; hide: string; show: string; left: string; leftHr: string; offline: string };

export function OrgChart({ roots, me, hr, locale, t }: { roots: ChartNode[]; me: string; hr: boolean; locale: string; t: Words }) {
  const total = roots.reduce((n, r) => n + r.size, 0);
  const [closed, setClosed] = useState<Set<string>>(() => {
    const start = new Set<string>();
    if (total > 40) {
      const fold = (n: ChartNode, depth: number) => {
        if (depth >= 1 && n.reports.length > 0) start.add(n.id);
        n.reports.forEach(r => fold(r, depth + 1));
      };
      roots.forEach(r => fold(r, 0));
    }
    return start;
  });
  const toggle = (id: string) => setClosed(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const node = (n: ChartNode) => {
    const open = !closed.has(n.id);
    return (
      <li key={n.id} className="node">
        <div className={n.left ? "node-card left" : n.offline ? "node-card offline" : n.id === me ? "node-card me" : "node-card"}>
          {n.left ? (
            <div className="node-link">
              <Portrait name={n.name} photo={null} size={56} />
              <span className="node-name">{n.name}</span>
              <span className="node-title left-tag">{t.left}</span>
              {hr && <a className="node-fix" href="/chest/table">{t.leftHr}</a>}
            </div>
          ) : n.href ? (
            <a href={n.href} className="node-link">
              <Portrait name={n.name} photo={n.photo} size={56} team={n.team} />
              <span className="node-name">{n.name}</span>
              {n.title && <span className="node-title">{n.title}</span>}
              {n.offline && <span className="offline-tag">{t.offline}</span>}
            </a>
          ) : (
            <div className="node-link">
              <Portrait name={n.name} photo={n.photo} size={56} team={n.team} />
              <span className="node-name">{n.name}</span>
              {n.title && <span className="node-title">{n.title}</span>}
              {n.offline && <span className="offline-tag">{t.offline}</span>}
            </div>
          )}
          {n.reports.length > 0 && (
            <button type="button" className="node-toggle" aria-expanded={open} aria-controls={"team-" + n.id} onClick={() => toggle(n.id)} aria-label={fill(open ? t.hide : t.show, { name: n.name })}>
              <span aria-hidden="true">{plural(locale, t.reports, n.size - 1)}</span>
              <ChevronDown />
            </button>
          )}
        </div>
        {n.reports.length > 0 && <ul id={"team-" + n.id} className="branch" hidden={!open}>{n.reports.map(node)}</ul>}
      </li>
    );
  };
  return (
    <div className="chart-frame">
      {roots.map(r => <ul key={r.id} className="org">{node(r)}</ul>)}
    </div>
  );
}
