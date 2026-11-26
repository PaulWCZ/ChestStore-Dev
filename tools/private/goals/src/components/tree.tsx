import type { Catalogue } from "../i18n/index.ts";
import type { ObjectiveView } from "../lib/views.ts";
import { format } from "../shared/format.ts";
import { Chevron, Clock, Lock } from "./icons.tsx";
import { PersonLine } from "./person.tsx";
import { Confidence, Progress } from "./progress.tsx";

export type TreeNode = { o: ObjectiveView; children: TreeNode[] };
type Words = { progress: Catalogue["progress"]; confidence: Catalogue["confidence"]; objective: Catalogue["objective"]; company: Catalogue["company"]; levels: Catalogue["levels"] };

// The trail: every objective a row (title, owner, progress, confidence);
// what supports it hangs beneath, shown or hidden with its button. Drawn on
// the server: the fold is the browser's own <details> (open by default,
// kept as the person left it when the page reads itself again), so a
// company of hundreds of objectives sends no script for it.
export function Tree({ roots, t, label }: { roots: TreeNode[]; t: Words; label: string }) {
  return (
    <ul className="tree" aria-label={label}>
      {roots.map(n => <Node key={n.o.id} n={n} t={t} />)}
    </ul>
  );
}

function Node({ n, t }: { n: TreeNode; t: Words }) {
  const { o } = n;
  return (
    <li className={`node level-${o.level}`} id={`node-${o.id}`}>
      <div className="card node-row">
        <span className="toggle-space" aria-hidden="true" />
        <div className="titles">
          <span className="eyebrow">{o.teamName ?? o.levelText}</span>
          <a className="objective-title" href={`/chest/objectives/${o.id}`}>{o.title}</a>
          <span className="meta">
            <PersonLine person={o.owner} />
            {o.owner.gone && <span className="tag gone">{t.objective.ownerLeft}</span>}
            {o.visibility !== "everyone" && <span className="tag confidential"><Lock />{t.objective.confidential}</span>}
            <span>{o.keyResultsText}</span>
          </span>
        </div>
        <div className="side">
          <Progress percent={o.percent} text={o.percentText} label={`${o.title}: ${o.percentText}`} confidence={o.confidence} />
          <span className="badges">
            <Confidence value={o.confidence} words={t.confidence} />
            {o.stale && <span className="tag stale"><Clock />{t.progress.staleShort}</span>}
          </span>
        </div>
      </div>
      {n.children.length > 0 && (
        <details className="branch" open>
          <summary className="icon-button toggle"><Chevron /><span className="visually-hidden">{format(t.company.branch, { title: o.title })}</span></summary>
          <ul className="children">
            {n.children.map(c => <Node key={c.o.id} n={c} t={t} />)}
          </ul>
        </details>
      )}
    </li>
  );
}
