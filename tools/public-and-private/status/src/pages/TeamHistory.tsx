import { chest } from "@argentic/chest-sdk/chest";
import type { MemberContext, View } from "@argentic/chest-app";
import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import { localeOf, stamp } from "../i18n/index.ts";
import { db } from "../lib/db.ts";
import { allFor } from "../lib/incidents.ts";
import { impactOf } from "../lib/status-view.ts";
import { phaseOf, stepOf, titleIn } from "./parts/incident-card.tsx";
import { incidentTone, stepClass } from "../components/classes.ts";

// Every incident and maintenance, removed ones included, newest first —
// fifty a page.
export async function teamHistory({ member, locale: language, t }: MemberContext, before: string | undefined): Promise<View> {
  const locale = localeOf(language);
  const list = await allFor(db(), member, { limit: 50, before: before && /^\d{1,18}$/u.test(before) ? before : null });
  const zone = chest.timeZone;
  const now = new Date();
  return { title: t.historyPrivate.title, body: (
    <div className="narrow stack-l">
      <PageHeader size="m" title={t.historyPrivate.title} intro={t.historyPrivate.intro} />
      {list.length === 0 ? <EmptyState title={t.historyPrivate.emptyTitle} body={t.historyPrivate.empty} action={<a className="button" href="/chest/incidents/new">{t.overview.post}</a>} /> : (
        <ul className="rows card">
          {list.map(i => {
            const step = i.kind === "maintenance" ? phaseOf(i, now) : stepOf(i, now);
            const title = titleIn(i, locale);
            return (
              <li key={i.id} className={`row-incident ${incidentTone(i.kind, impactOf(i, now))}${i.removedAt ? " removed" : ""}`}>
                <div className="row-head">
                  <a href={`/chest/incidents/${i.id}`} lang={title.lang === locale ? undefined : title.lang}>{title.text}</a>
                  {i.kind === "maintenance" && <span className="tag">{t.public.maintenanceTag}</span>}
                  {i.removedAt && <span className="tag muted">{t.historyPrivate.removed}</span>}
                  <span className={`chip ${stepClass(step)}`}>{t.steps[step]}</span>
                </div>
                <p className="row-meta">{stamp(i.startedAt, zone, locale, now)}</p>
              </li>
            );
          })}
        </ul>
      )}
      {list.length === 50 && <p><a className="button quiet" href={`/chest/history?before=${list.at(-1)!.id}`}>{t.historyPrivate.more}</a></p>}
    </div>
  ) };
}
