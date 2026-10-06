import { chest } from "@argentic/chest-sdk/chest";
import { Island, type MemberContext, type View } from "@argentic/chest-app";
import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import { Back } from "../components/icons.tsx";
import { day, format, localeOf, plural } from "../i18n/index.ts";
import { allComponents } from "../lib/components.ts";
import { db } from "../lib/db.ts";
import { hooksDelivery, hooksQueued, listHooks } from "../lib/hooks.ts";
import { queued } from "../lib/mailer.ts";
import { mailDelivery } from "../lib/settings.ts";
import { listSubscribers } from "../lib/subscribers.ts";
import { wall } from "../lib/zone.ts";

// Who asked to be told by email or in a chat, whether the Chest sends
// each now (asked of it: mail.available(), webhooks.available()), and
// what is still waiting to be sent.
export async function subscribersPage({ member, locale: language, t }: MemberContext): Promise<View> {
  const locale = localeOf(language);
  const sql = db();
  const zone = chest.timeZone;
  const [list, names, mailing, waiting, chats, chatsWaiting, delivering] = await Promise.all([listSubscribers(sql, member), allComponents(sql, { locale }), mailDelivery(sql), queued(sql), listHooks(sql, member), hooksQueued(sql), hooksDelivery(sql)]);
  const nameOf = new Map(names.map(c => [c.id, c.name]));
  const confirmed = list.filter(s => s.confirmedAt);
  const rows = list.map(s => ({
    id: s.id,
    email: s.email,
    pending: s.confirmedAt === null,
    follows: s.components === null ? t.subscribers.everything : s.components.map(c => nameOf.get(c) ?? "").filter(Boolean).join(", "),
    since: format(t.subscribers.since, { date: day(wall(s.confirmedAt ?? s.createdAt, zone).date, locale, { day: "numeric", month: "long", year: "numeric" }) }),
  }));
  const w = t.subscribers;
  const mailLine = mailing.state === "ok" ? w.mailOk
    : mailing.reason === "not_connected" ? w.mailNotConnected
    : mailing.reason === "quota" ? w.mailQuota
    : mailing.state === "paused" ? w.mailPaused
    : mailing.state === "none" ? w.mailNone : w.mailUnknown;
  const hooksLine = delivering.state === "ok" && delivering.targets !== null && delivering.max !== null ? format(w.hooksOk, { count: delivering.targets, max: delivering.max })
    : delivering.state === "paused" ? w.hooksPaused
    : delivering.state === "none" ? w.hooksOff : null;
  return { title: t.subscribers.title, body: (
    <div className="narrow stack-l">
      <p className="crumb"><a href="/chest/settings"><Back />{t.subscribers.back}</a></p>
      <PageHeader size="m" title={t.subscribers.title} intro={t.subscribers.intro} secondary={<span className="count">{plural(t.subscribers.count, confirmed.length, locale)}</span>} />
      <p className={`note${mailing.state === "none" || mailing.state === "paused" ? " warn" : ""}`}>{mailLine}</p>
      {waiting > 0 && <p className="hint">{plural(t.subscribers.queue, waiting, locale)}</p>}
      {rows.length === 0 ? <EmptyState title={t.subscribers.emptyTitle} body={t.subscribers.empty} /> : <Island name="SubscriberList" props={{ rows, t: { subscribers: { follows: t.subscribers.follows, pending: t.subscribers.pending, removed: t.subscribers.removed, remove: t.subscribers.remove, erase: t.subscribers.erase, eraseTitle: t.subscribers.eraseTitle, eraseBody: t.subscribers.eraseBody, cancel: t.subscribers.cancel }, errors: t.errors } }} />}
      <section aria-labelledby="chats" className="stack">
        <h2 id="chats" className="section-title">{t.subscribers.hooksTitle}</h2>
        {hooksLine && <p className={`note${delivering.state === "ok" ? "" : " warn"}`}>{hooksLine}</p>}
        {chatsWaiting > 0 && <p className="hint">{plural(t.subscribers.hooksQueue, chatsWaiting, locale)}</p>}
        {chats.length === 0 ? <p className="quiet-line">{t.subscribers.hooksNone}</p> : (
          <Island name="HookList" props={{
            rows: chats.map(h => ({
              id: h.id,
              shown: h.shown,
              line: format(t.subscribers.hookFollows, { kind: t.hooks.kinds[h.kind], language: t.languages[h.language as "en"] ?? h.language, list: h.components === null ? t.subscribers.everything : h.components.map(c => nameOf.get(c) ?? "").filter(Boolean).join(", ") }),
              state: h.disabledAt ? format(t.subscribers.hookStopped, { reason: h.lastError ?? "—" }) : t.subscribers.hookActive,
              stopped: h.disabledAt !== null,
            })),
            t: { subscribers: { hookRemove: t.subscribers.hookRemove, hookRemoveLabel: t.subscribers.hookRemoveLabel, hookRemoved: t.subscribers.hookRemoved, cancel: t.subscribers.cancel }, errors: t.errors },
          }} />
        )}
      </section>
    </div>
  ) };
}
