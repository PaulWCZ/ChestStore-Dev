import * as chest from "@argentic/chest-sdk/chest";
import { allComponents } from "../../../lib/components.ts";
import { db } from "../../../lib/db.ts";
import { day, format, plural } from "../../../lib/i18n/index.ts";
import { queued } from "../../../lib/mailer.ts";
import { viewer } from "../../../lib/session.ts";
import { mailState } from "../../../lib/settings.ts";
import { listSubscribers } from "../../../lib/subscribers.ts";
import { wall } from "../../../lib/zone.ts";
import { SubscriberList } from "./subscriber-list.tsx";

// Who asked to be told by email, whether email works on this Chest, and
// what is still waiting to be sent.
export default async function SubscribersPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const zone = chest.timeZone();
  const [list, names, state, waiting] = await Promise.all([listSubscribers(sql, member), allComponents(sql), mailState(sql), queued(sql)]);
  const nameOf = new Map(names.map(c => [c.id, c.name]));
  const confirmed = list.filter(s => s.confirmedAt);
  const rows = list.map(s => ({
    id: s.id,
    email: s.email,
    pending: s.confirmedAt === null,
    follows: s.components === null ? t.subscribers.everything : s.components.map(c => nameOf.get(c) ?? "").filter(Boolean).join(", "),
    since: format(t.subscribers.since, { date: day(wall(s.confirmedAt ?? s.createdAt, zone).date, locale, { day: "numeric", month: "long", year: "numeric" }) }),
  }));
  return (
    <main className="narrow stack-l">
      <div className="page-head">
        <h1>{t.subscribers.title}</h1>
        <span className="count">{plural(t.subscribers.count, confirmed.length, locale)}</span>
      </div>
      <p className="lead">{t.subscribers.intro}</p>
      <p className={`note${state === "none" ? " warn" : ""}`}>{state === "ok" ? t.subscribers.mailOk : state === "none" ? t.subscribers.mailNone : t.subscribers.mailUnknown}</p>
      {waiting > 0 && <p className="hint">{plural(t.subscribers.queue, waiting, locale)}</p>}
      {rows.length === 0 ? <div className="empty"><p>{t.subscribers.empty}</p></div> : <SubscriberList rows={rows} t={{ subscribers: { follows: t.subscribers.follows, pending: t.subscribers.pending, removed: t.subscribers.removed, remove: t.subscribers.remove }, errors: t.errors }} />}
    </main>
  );
}
