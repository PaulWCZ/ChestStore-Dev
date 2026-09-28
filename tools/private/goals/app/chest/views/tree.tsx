"use client";

import Link from "next/link";
import { useState } from "react";
import { Chevron, Clock } from "../../../components/icons.tsx";
import { PersonLine } from "../../../components/person.tsx";
import { Confidence, Progress } from "../../../components/progress.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import type { ObjectiveView } from "../../../lib/views.ts";

export type TreeNode = { o: ObjectiveView; children: TreeNode[] };
type Words = { progress: Catalogue["progress"]; confidence: Catalogue["confidence"]; objective: Catalogue["objective"]; company: Catalogue["company"]; levels: Catalogue["levels"] };

// The trail: every objective a row (title, owner, progress, confidence);
// what supports it hangs beneath, shown or hidden with its button.
export function Tree({ roots, t, label }: { roots: TreeNode[]; t: Words; label: string }) {
  const [closed, setClosed] = useState<string[]>([]);
  const toggle = (id: string) => setClosed(c => (c.includes(id) ? c.filter(x => x !== id) : [...c, id]));
  return (
    <ul className="tree" aria-label={label}>
      {roots.map(n => <Node key={n.o.id} n={n} t={t} closed={closed} toggle={toggle} />)}
    </ul>
  );
}

function Node({ n, t, closed, toggle }: { n: TreeNode; t: Words; closed: string[]; toggle: (id: string) => void }) {
  const { o } = n;
  const open = !closed.includes(o.id);
  const has = n.children.length > 0;
  return (
    <li className={`node level-${o.level}`}>
      <div className="card node-row">
        {has ? (
          <button type="button" className="icon-button toggle" aria-expanded={open} aria-controls={`children-${o.id}`} onClick={() => toggle(o.id)}>
            <Chevron /><span className="visually-hidden">{format(open ? t.company.collapse : t.company.expand, { title: o.title })}</span>
          </button>
        ) : <span className="toggle-space" aria-hidden="true" />}
        <div className="titles">
          <span className="eyebrow">{o.teamName ?? o.levelText}</span>
          <Link className="objective-title" href={`/chest/objectives/${o.id}`}>{o.title}</Link>
          <span className="meta">
            <PersonLine person={o.owner} size={20} />
            {o.owner.gone && <span className="tag gone">{t.objective.ownerLeft}</span>}
            <span>{o.keyResultsText}</span>
          </span>
        </div>
        <div className="side">
          <Progress percent={o.percent} text={o.percentText} label={`${o.title}: ${o.percentText}`} />
          <span className="badges">
            <Confidence value={o.confidence} words={t.confidence} />
            {o.stale && <span className="tag stale"><Clock />{t.progress.staleShort}</span>}
          </span>
        </div>
      </div>
      {has && open && (
        <ul className="children" id={`children-${o.id}`}>
          {n.children.map(c => <Node key={c.o.id} n={c} t={t} closed={closed} toggle={toggle} />)}
        </ul>
      )}
    </li>
  );
}
