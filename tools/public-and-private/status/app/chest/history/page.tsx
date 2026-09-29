import * as chest from "@argentic/chest-sdk/chest";
import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import { phaseOf, stepOf, titleIn } from "../../../components/incident-card.tsx";
import { db } from "../../../lib/db.ts";
import { stamp } from "../../../lib/i18n/index.ts";
import { allFor } from "../../../lib/incidents.ts";
import { viewer } from "../../../lib/session.ts";
import { impactOf } from "../../../lib/status-view.ts";

// Every incident and maintenance, removed ones included, newest first —
// fifty a page.
export default async function TeamHistory({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const before = (await searchParams).before;
  const list = await allFor(db(), member, { limit: 50, before: before && /^\d{1,18}$/u.test(before) ? before : null });
  const zone = chest.timeZone();
  const now = new Date();
  return (
    <div className="narrow stack-l">
      <PageHeader size="m" title={t.historyPrivate.title} intro={t.historyPrivate.intro} />
      {list.length === 0 ? <EmptyState title={t.historyPrivate.emptyTitle} body={t.historyPrivate.empty} action={<a className="button" href="/chest/incidents/new">{t.overview.post}</a>} /> : (
        <ul className="rows card">
          {list.map(i => {
            const step = i.kind === "maintenance" ? phaseOf(i, now) : stepOf(i, now);
            const title = titleIn(i, locale);
            return (
              <li key={i.id} className={`row-incident s-${i.kind === "maintenance" ? "maintenance" : impactOf(i, now)}${i.removedAt ? " removed" : ""}`}>
                <div className="row-head">
                  <a href={`/chest/incidents/${i.id}`} lang={title.lang === locale ? undefined : title.lang}>{title.text}</a>
                  {i.kind === "maintenance" && <span className="tag">{t.public.maintenanceTag}</span>}
                  {i.removedAt && <span className="tag muted">{t.historyPrivate.removed}</span>}
                  <span className={`chip step-${step}`}>{t.steps[step]}</span>
                </div>
                <p className="row-meta">{stamp(i.startedAt, zone, locale, now)}</p>
              </li>
            );
          })}
        </ul>
      )}
      {list.length === 50 && <p><a className="button quiet" href={`/chest/history?before=${list.at(-1)!.id}`}>{t.historyPrivate.more}</a></p>}
    </div>
  );
}
