import type { Incident, Update } from "../lib/incidents.ts";
import type { Catalogue } from "../lib/i18n/index.ts";
import { duration, format } from "../lib/i18n/format.ts";
import type { State } from "../lib/model.ts";
import { maintenancePhase } from "../lib/timeline.ts";
import { RichText } from "./rich-text.tsx";
import { When } from "./when.tsx";

// An incident or a maintenance as customers read it: what, what it
// touches, where it stands, and its timeline — newest first.
export type CardWords = { public: Catalogue["public"]; steps: Catalogue["steps"]; states: Catalogue["states"]; time: Catalogue["time"]; maintenance: Catalogue["maintenance"] };

export function phaseOf(i: Incident, now: Date): "scheduled" | "in_progress" | "completed" | "cancelled" {
  return maintenancePhase({ status: i.status, startedAt: i.startedAt.getTime(), endsAt: i.endsAt?.getTime() ?? null, resolvedAt: i.resolvedAt?.getTime() ?? null }, now.getTime());
}

// The step shown on an incident's chip.
export function stepOf(i: Incident, now: Date): keyof Catalogue["steps"] {
  if (i.kind === "incident") return i.status as keyof Catalogue["steps"];
  return phaseOf(i, now);
}

export function Timeline({ updates, zone, locale, t, now }: { updates: Update[]; zone: string; locale: string; t: CardWords; now: Date }) {
  return (
    <ol className="timeline">
      {updates.filter(u => u.removedAt === null && u.postedAt.getTime() <= now.getTime()).map(u => (
        <li key={u.id} className={`step step-${u.status}`}>
          <div className="step-head">
            <strong>{t.steps[u.status]}</strong>
            <When at={u.postedAt} zone={zone} locale={locale} now={now} />
          </div>
          <RichText text={u.body} />
        </li>
      ))}
    </ol>
  );
}

export function IncidentCard({ incident: i, impact, affected, zone, locale, t, now, heading = "h3", link = true }: { incident: Incident; impact: State; affected: string[]; zone: string; locale: string; t: CardWords; now: Date; heading?: "h1" | "h2" | "h3"; link?: boolean }) {
  const H = heading;
  const step = stepOf(i, now);
  const title = link ? <a href={`/incidents/${i.id}`}>{i.title}</a> : i.title;
  return (
    <article className={`card incident s-${i.kind === "maintenance" ? "maintenance" : impact}`}>
      <header className="incident-head">
        <H className="incident-title">{title}</H>
        <span className={`chip step-${step}`}>{t.steps[step]}</span>
      </header>
      <p className="incident-meta">
        {i.kind === "maintenance" && i.endsAt ? (
          <span className="window"><When at={i.startedAt} zone={zone} locale={locale} now={now} /> – <When at={i.endsAt} zone={zone} locale={locale} now={now} /></span>
        ) : null}
        {affected.length > 0 && <span>{format(t.public.affected, { list: affected.join(", ") })}</span>}
      </p>
      <Timeline updates={i.updates} zone={zone} locale={locale} t={t} now={now} />
    </article>
  );
}

// One line of a list of past incidents: title, how long it lasted, when.
export function IncidentRow({ incident: i, impact, zone, locale, t, now }: { incident: Incident; impact: State; zone: string; locale: string; t: CardWords; now: Date }) {
  const step = stepOf(i, now);
  const end = i.kind === "maintenance" ? (i.status === "completed" && i.resolvedAt ? i.resolvedAt : i.endsAt) : i.resolvedAt;
  const last = i.updates.find(u => u.removedAt === null && u.postedAt.getTime() <= now.getTime());
  return (
    <li className={`row-incident s-${i.kind === "maintenance" ? "maintenance" : impact}`}>
      <div className="row-head">
        <a href={`/incidents/${i.id}`}>{i.title}</a>
        {i.kind === "maintenance" && <span className="tag">{t.public.maintenanceTag}</span>}
        <span className={`chip step-${step}`}>{t.steps[step]}</span>
      </div>
      {last && <p className="row-text">{last.body.length > 240 ? last.body.slice(0, 239) + "…" : last.body}</p>}
      <p className="row-meta">
        <When at={i.startedAt} zone={zone} locale={locale} now={now} />
        {end && step !== "cancelled" && <span> · {format(t.public.lasted, { duration: duration(end.getTime() - i.startedAt.getTime(), t.time) })}</span>}
      </p>
    </li>
  );
}
