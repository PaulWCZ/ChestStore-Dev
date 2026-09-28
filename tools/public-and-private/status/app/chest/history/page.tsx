import * as chest from "@argentic/chest-sdk/chest";
import { phaseOf, stepOf } from "../../../components/incident-card.tsx";
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
    <main className="narrow stack-l">
      <div className="page-head"><h1>{t.historyPrivate.title}</h1></div>
      <p className="lead">{t.historyPrivate.intro}</p>
      {list.length === 0 ? <div className="empty"><p>{t.historyPrivate.empty}</p></div> : (
        <ul className="rows card">
          {list.map(i => {
            const step = i.kind === "maintenance" ? phaseOf(i, now) : stepOf(i, now);
            return (
              <li key={i.id} className={`row-incident s-${i.kind === "maintenance" ? "maintenance" : impactOf(i, now)}${i.removedAt ? " removed" : ""}`}>
                <div className="row-head">
                  <a href={`/chest/incidents/${i.id}`}>{i.title}</a>
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
    </main>
  );
}
