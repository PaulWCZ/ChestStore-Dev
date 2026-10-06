import { ChestError } from "@argentic/chest-sdk/errors";
import * as notifications from "@argentic/chest-sdk/notifications";
import type { Sql } from "./db.ts";
import { catalogue, format, locales, plural, type Locale } from "../i18n/index.ts";
import * as alerts from "./alerts.ts";
import { badges, cut, notify, withdraw } from "./notify.ts";
import { people } from "./people.ts";

// The bell and the tile. The people chosen for a form (watchers) hear of
// its new answers — batched: at most one item per form and person every
// ten minutes, and each replaces the one before (key answers:<form>), so
// a busy form never floods anyone. The schedule "bell" sends what waited.
// The tile counts, for each person, the answers they have not seen.
export const quietMinutes = 10;
const key = (formId: string) => `answers:${formId}`;

// afterAnswer: tell now, unless the form's last batch is recent; then the
// answer waits for the next run of the schedule.
export async function afterAnswer(sql: Sql, formId: string, now = new Date()): Promise<boolean> {
  const [row] = await sql<{ id: string }[]>`
    update forms set bell_at = ${now}, bell_pending = false
    where id = ${formId} and bell_pending and (bell_at is null or bell_at <= ${now}::timestamptz - make_interval(mins => ${quietMinutes}))
    returning id`;
  if (!row) return false;
  await ring(sql, formId);
  return true;
}

// pending: the schedule's run — every form whose answers wait.
export async function pending(sql: Sql, now = new Date()): Promise<number> {
  const rows = await sql<{ id: string }[]>`update forms set bell_at = ${now}, bell_pending = false where bell_pending and deleted_at is null returning id`;
  for (const r of rows) await ring(sql, String(r.id));
  return rows.length;
}

// ring tells each watcher how many answers they have not seen, in their
// language — and, when the form says so, emails them the new answers
// (lib/alerts.ts), in the same batch.
async function ring(sql: Sql, formId: string): Promise<void> {
  const [form] = await sql<{ title: string; notify_email: boolean }[]>`select draft->>'title' as title, notify_email from forms where id = ${formId} and deleted_at is null`;
  if (!form) return;
  const watchers = await sql<{ member: string; unseen: number }[]>`select member, unseen from watchers where form_id = ${formId} and unseen > 0`;
  const byCount = new Map<number, string[]>();
  for (const w of watchers) byCount.set(w.unseen, [...(byCount.get(w.unseen) ?? []), w.member]);
  for (const [count, ids] of byCount) {
    await notify(ids, (t, locale) => ({ title: plural(t.bell.answers, count, locale, { form: form.title || t.builder.untitled }), body: t.bell.body }), { path: `/chest/forms/${formId}/answers`, key: key(formId) });
  }
  await refreshBadges(sql, watchers.map(w => w.member));
  if (form.notify_email) await alerts.send(sql, formId, watchers.map(w => ({ member: w.member, count: w.unseen })));
}

// seen: the member opened the answers; their item goes, their count too.
export async function seen(sql: Sql, formId: string, member: string): Promise<void> {
  const [row] = await sql<{ unseen: number }[]>`select unseen from watchers where form_id = ${formId} and member = ${member}`;
  if (!row || row.unseen === 0) return;
  await sql`update watchers set unseen = 0 where form_id = ${formId} and member = ${member}`;
  await withdraw(key(formId), [member]);
  await refreshBadges(sql, [member]);
}

// refreshBadges sets each member's tile count: the answers they have not
// seen, over every form they watch.
export async function refreshBadges(sql: Sql, members?: string[]): Promise<void> {
  const rows = members
    ? await sql<{ member: string; total: number }[]>`select member, coalesce(sum(w.unseen) filter (where f.deleted_at is null), 0)::int as total from watchers w join forms f on f.id = w.form_id where member = any(${members}) group by member`
    : await sql<{ member: string; total: number }[]>`select member, coalesce(sum(w.unseen) filter (where f.deleted_at is null), 0)::int as total from watchers w join forms f on f.id = w.form_id group by member`;
  const counts = new Map(rows.map(r => [r.member, r.total]));
  for (const m of members ?? []) if (!counts.has(m)) counts.set(m, 0);
  await badges(counts);
}

// opened: a team form was published; everyone who has the tool may be
// told once, in their language (Proposal (studio): notifications.broadcast).
// Without it, the form's page link is shared by hand — nothing breaks.
export async function opened(formId: string, slug: string, title: string, except: string): Promise<boolean> {
  const messages = Object.fromEntries(locales.map(l => [l, { title: cut(format(catalogue(l).bell.open, { form: title }), 80), body: catalogue(l).bell.openBody }])) as Record<Locale, { title: string; body: string }>;
  try {
    await notifications.broadcast({
      messages,
      path: `/chest/f/${slug}`,
      key: `ask:${formId}`,
      except: [except],
    });
    return true;
  } catch (error) {
    if (error instanceof ChestError) return false;
    throw error;
  }
}

// closed: the invitation to answer goes once the form stops taking answers.
export async function closed(formId: string): Promise<void> {
  await withdraw(`ask:${formId}`);
}

// The names of watchers, for a page (their status: still here or not).
export { people };
