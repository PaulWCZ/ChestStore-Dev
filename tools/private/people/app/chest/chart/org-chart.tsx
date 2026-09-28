"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown } from "../../../components/icons.tsx";
import { Portrait } from "../../../components/portrait.tsx";
import { format, plural } from "../../../lib/i18n/format.ts";

// The trees themselves: nested lists (a screen reader reads who reports to
// whom), each manager's team folding open and shut with a button. A large
// company starts folded below the second level.
export type ChartNode = { id: string; name: string; photo: string | null; title: string; team: string; size: number; reports: ChartNode[] };
type Words = { reports: { one: string; other: string }; hide: string; show: string };

export function OrgChart({ roots, me, locale, t }: { roots: ChartNode[]; me: string; locale: string; t: Words }) {
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
        <div className={n.id === me ? "node-card me" : "node-card"}>
          <Link href={`/chest/people/${n.id}`} className="node-link">
            <Portrait name={n.name} photo={n.photo} size={56} team={n.team} arch />
            <span className="node-name">{n.name}</span>
            {n.title && <span className="node-title">{n.title}</span>}
          </Link>
          {n.reports.length > 0 && (
            <button type="button" className="node-toggle" aria-expanded={open} aria-controls={"team-" + n.id} onClick={() => toggle(n.id)} aria-label={format(open ? t.hide : t.show, { name: n.name })}>
              <span aria-hidden="true">{plural(t.reports, n.size - 1, locale)}</span>
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
