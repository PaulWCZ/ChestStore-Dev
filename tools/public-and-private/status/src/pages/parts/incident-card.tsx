import type { Incident, Update } from "../../lib/incidents.ts";
import type { Catalogue } from "../../i18n/index.ts";
import { duration, format } from "../../i18n/format.ts";
import type { State } from "../../lib/model.ts";
import { pick } from "../../lib/texts.ts";
import { maintenancePhase } from "../../lib/timeline.ts";
import { RichText } from "./rich-text.tsx";
import { When } from "./when.tsx";
import { incidentTone, stepClass } from "../../components/classes.ts";

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

type Languages = Pick<Incident, "language" | "secondLanguage">;

// The title of an incident in the visitor's language when it has one.
export function titleIn(i: Incident, locale: string) {
  return pick(i.title, i.titleSecond, i, locale);
}

// A text as the visitor reads it: their language when written in it,
// otherwise the first version, marked with its own language.
export function TextIn({ update, languages, locale, className }: { update: Pick<Update, "body" | "bodySecond">; languages: Languages; locale: string; className?: string }) {
  const { text, lang } = pick(update.body, update.bodySecond, languages, locale);
  return <RichText text={text} lang={lang === locale ? undefined : lang} {...(className ? { className } : {})} />;
}

export function Timeline({ incident, zone, locale, t, now }: { incident: Incident; zone: string; locale: string; t: CardWords; now: Date }) {
  return (
    <ol className="timeline">
      {incident.updates.filter(u => u.removedAt === null && u.status !== "postmortem" && u.postedAt.getTime() <= now.getTime()).map(u => (
        <li key={u.id} className={`step ${stepClass(u.status)}`}>
          <div className="step-head">
            <strong>{t.steps[u.status]}</strong>
            <When at={u.postedAt} zone={zone} locale={locale} now={now} />
          </div>
          <TextIn update={u} languages={incident} locale={locale} />
        </li>
      ))}
    </ol>
  );
}

// The post-mortem of a resolved incident, under its timeline: what
// happened and what was changed — the part an SLA claim refers to.
export function Postmortem({ incident, zone, locale, t, now }: { incident: Incident; zone: string; locale: string; t: CardWords; now: Date }) {
  const found = incident.updates.find(u => u.status === "postmortem" && u.removedAt === null);
  if (!found) return null;
  return (
    <section className="card postmortem" id="postmortem" aria-labelledby="postmortem-title">
      <h2 id="postmortem-title">{t.public.postmortem}</h2>
      <p className="fine"><When at={found.postedAt} zone={zone} locale={locale} now={now} /></p>
      <TextIn update={found} languages={incident} locale={locale} />
    </section>
  );
}

export function IncidentCard({ incident: i, impact, affected, zone, locale, t, now, heading = "h3", link = true }: { incident: Incident; impact: State; affected: string[]; zone: string; locale: string; t: CardWords; now: Date; heading?: "h1" | "h2" | "h3"; link?: boolean }) {
  const H = heading;
  const step = stepOf(i, now);
  const named = titleIn(i, locale);
  const lang = named.lang === locale ? undefined : named.lang;
  const title = link ? <a href={`/incidents/${i.id}`} lang={lang}>{named.text}</a> : <span lang={lang}>{named.text}</span>;
  return (
    <article className={`card incident ${incidentTone(i.kind, impact)}`}>
      <header className="incident-head">
        <H className="incident-title">{title}</H>
        <span className={`chip ${stepClass(step)}`}>{t.steps[step]}</span>
      </header>
      <p className="incident-meta">
        {i.kind === "maintenance" && i.endsAt ? (
          <span className="window"><When at={i.startedAt} zone={zone} locale={locale} now={now} /> – <When at={i.endsAt} zone={zone} locale={locale} now={now} /></span>
        ) : null}
        {affected.length > 0 && <span>{format(t.public.affected, { list: affected.join(", ") })}</span>}
      </p>
      <Timeline incident={i} zone={zone} locale={locale} t={t} now={now} />
    </article>
  );
}

// One line of a list of past incidents: title, how long it lasted, when.
export function IncidentRow({ incident: i, impact, zone, locale, t, now }: { incident: Incident; impact: State; zone: string; locale: string; t: CardWords; now: Date }) {
  const step = stepOf(i, now);
  const end = i.kind === "maintenance" ? (i.status === "completed" && i.resolvedAt ? i.resolvedAt : i.endsAt) : i.resolvedAt;
  const last = i.updates.find(u => u.removedAt === null && u.status !== "postmortem" && u.postedAt.getTime() <= now.getTime());
  const named = titleIn(i, locale);
  const text = last ? pick(last.body, last.bodySecond, i, locale) : null;
  const hasPostmortem = i.updates.some(u => u.status === "postmortem" && u.removedAt === null);
  return (
    <li className={`row-incident ${incidentTone(i.kind, impact)}`}>
      <div className="row-head">
        <a href={`/incidents/${i.id}`} lang={named.lang === locale ? undefined : named.lang}>{named.text}</a>
        {i.kind === "maintenance" && <span className="tag">{t.public.maintenanceTag}</span>}
        <span className={`chip ${stepClass(step)}`}>{t.steps[step]}</span>
      </div>
      {text && <p className="row-text" lang={text.lang === locale ? undefined : text.lang}>{text.text.length > 240 ? text.text.slice(0, 239) + "…" : text.text}</p>}
      {hasPostmortem && <p className="row-meta"><a href={`/incidents/${i.id}#postmortem`}>{t.public.readPostmortem}</a></p>}
      <p className="row-meta">
        <When at={i.startedAt} zone={zone} locale={locale} now={now} />
        {end && step !== "cancelled" && <span> · {format(t.public.lasted, { duration: duration(end.getTime() - i.startedAt.getTime(), t.time) })}</span>}
      </p>
    </li>
  );
}
