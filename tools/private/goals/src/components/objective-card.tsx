import type { Catalogue } from "../i18n/index.ts";
import type { KeyResultView, ObjectiveView } from "../lib/views.ts";
import { Clock, Lock } from "./icons.tsx";
import { PersonLine } from "./person.tsx";
import { Confidence, Progress } from "./progress.tsx";

export type CardWords = { progress: Catalogue["progress"]; confidence: Catalogue["confidence"]; objective: Catalogue["objective"]; checkIn: Catalogue["checkIn"]; levels: Catalogue["levels"] };

// An objective as a card: its title, level, owner, progress and
// confidence, then its key results — each with its number written out.
export function ObjectiveCard({ o, t, mine }: { o: ObjectiveView; t: CardWords; mine?: string }) {
  return (
    <article className="card objective" aria-labelledby={`o-${o.id}`}>
      <div className="objective-head">
        <div className="titles">
          <span className="eyebrow">{o.teamName ?? o.levelText}</span>
          <a id={`o-${o.id}`} className="objective-title" href={`/chest/objectives/${o.id}`}>{o.title}</a>
          <div className="meta">
            <PersonLine person={o.owner} />
            {o.owner.gone && <span className="tag gone">{t.objective.ownerLeft}</span>}
            <Confidence value={o.confidence} words={t.confidence} />
            {o.stale && <span className="tag stale"><Clock />{t.progress.staleShort}</span>}
            {o.visibility !== "everyone" && <span className="tag confidential"><Lock />{t.objective.confidential}</span>}
          </div>
        </div>
      </div>
      <Progress percent={o.percent} text={o.percentText} label={`${t.progress.label}: ${o.percentText}`} confidence={o.confidence} big />
      {o.keyResults.length > 0 && (
        <ul className="krs">
          {o.keyResults.map(k => <KeyResultRow key={k.id} k={k} t={t} mine={mine} />)}
        </ul>
      )}
    </article>
  );
}

export function KeyResultRow({ k, t, mine }: { k: KeyResultView; t: CardWords; mine?: string | undefined }) {
  return (
    <li className="kr" id={`kr-${k.id}`}>
      <div className="kr-text">
        <span className="kr-title">{k.title}</span>
        <span className="kr-meta">
          <PersonLine person={k.owner} />
          <Confidence value={k.confidence} words={t.confidence} />
          {k.stale && <span className="tag stale"><Clock />{t.progress.staleShort}</span>}
          {k.canCheckIn && k.owner.id === mine && !k.done && <a className="link-button" href={`/chest/objectives/${k.objectiveId}?checkin=${k.id}#kr-${k.id}`}>{t.checkIn.open}</a>}
        </span>
      </div>
      <div className="kr-value">
        <Progress percent={k.percent} text={k.percentText} label={`${k.title}: ${k.percentText}`} confidence={k.confidence} />
        <span className="value">{k.kind === "milestone" ? <strong>{k.current}</strong> : <><strong>{k.current}</strong> / {k.target}</>}</span>
      </div>
    </li>
  );
}
