import * as chest from "@argentic/chest-sdk/chest";
import { CapabilityNotGranted, ChestError, QuotaExceeded } from "@argentic/chest-sdk/errors";
import type { Member } from "@argentic/chest-sdk/member";
import * as webhooks from "@argentic/chest-sdk/webhooks";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { workMinutes } from "./hours.ts";
import { catalogue, format, isLocale, type Catalogue, type Locale } from "./i18n/index.ts";
import { clean, lateAfter } from "./model.ts";
import { nameOf, people } from "./people.ts";
import { settings } from "./tickets.ts";

// Notices to the team's chat (Proposal (studio): webhooks, sdk/README.md):
// an administrator gives the address of a Slack or Teams channel — or of
// any receiver (Zapier, Make, the company's server: "generic", JSON signed
// by the Chest) — and what to tell it: a new request, a customer writing
// again, a request waiting past the threshold. The tool never connects to
// it: it hands the Chest a target and a message; the Chest checks the
// address (https, public, the provider's shape; a generic receiver must
// answer a signed ping), keeps it encrypted, signs, delivers, retries,
// disables what keeps failing and tells the tool (webhook.disabled).
//
// What leaves the Chest: the request's number, its subject, who asked (the
// customer's name, else their address; a colleague's name), how long it
// waited, and a link to the ticket on the team's address — never the
// messages, never a note. In the Chest's language (a channel is shared).

export const noticeEvents = ["new", "replied", "late"] as const;
export type NoticeEvent = (typeof noticeEvents)[number];
export const noticeKinds = ["slack", "teams", "generic"] as const;
export type NoticeKind = (typeof noticeKinds)[number];
export const noticeLimits = { targets: 10, label: 80 } as const;

export type Target = {
  id: string;
  kind: NoticeKind;
  label: string;
  // The address as the Chest shows it: without its secret part.
  shown: string;
  events: NoticeEvent[];
  createdBy: string;
  // Stopped by the Chest (10 failures in a row, or the channel is gone).
  disabled: boolean;
  lastError: string | null;
  // The last delivery's outcome, as the Chest tells it (null: none yet, or
  // the Chest could not be asked).
  status: "delivered" | "failed" | "disabled" | null;
};

type Row = { id: string; kind: NoticeKind; label: string; shown: string; events: NoticeEvent[]; created_by: string; disabled_at: Date | null; last_error: string | null };

function admin(actor: Member | null): Member {
  if (!actor || !can(actor, "settings")) throw new AppError("forbidden");
  return actor;
}

const isKind = (value: unknown): value is NoticeKind => typeof value === "string" && (noticeKinds as readonly string[]).includes(value);
function eventsOf(value: unknown): NoticeEvent[] {
  if (!Array.isArray(value)) throw new AppError("invalid");
  const chosen = noticeEvents.filter(e => value.includes(e));
  if (chosen.length === 0 || value.some(v => !(noticeEvents as readonly unknown[]).includes(v))) throw new AppError("notice_events");
  return chosen;
}

// targets lists the addresses, with what the Chest says of each; and
// whether this Chest delivers notices at all (without it, Settings says so
// and hides the form).
export async function targets(sql: Query, actor: Member | null): Promise<{ available: boolean; targets: Target[] }> {
  admin(actor);
  const rows = await sql<Row[]>`select id, kind, label, shown, events, created_by, disabled_at, last_error from notice_targets order by created_at, id`;
  let remote = new Map<string, webhooks.WebhookTarget>();
  let available = true;
  try {
    remote = new Map((await webhooks.list()).map(w => [w.id, w]));
  } catch (error) {
    if (error instanceof CapabilityNotGranted) available = false;
    else if (!(error instanceof ChestError)) throw error;
  }
  return {
    available,
    targets: rows.map(r => {
      const w = remote.get(r.id);
      return {
        id: r.id, kind: r.kind, label: r.label, shown: w?.url ?? r.shown, events: r.events, createdBy: r.created_by,
        disabled: w ? w.state === "disabled" : r.disabled_at !== null,
        lastError: w ? w.lastError : r.last_error,
        status: w?.status ?? null,
      };
    }),
  };
}

// addTarget asks the Chest to deliver to an address. A generic receiver's
// secret is said once (to paste in the receiver, to check the signature);
// the tool keeps only the target's id.
export async function addTarget(sql: Sql, actor: Member | null, input: { url: unknown; kind: unknown; label: unknown; events: unknown }): Promise<{ target: Target; secret: string | null }> {
  const who = admin(actor);
  if (!isKind(input.kind)) throw new AppError("invalid");
  const kind = input.kind;
  const label = clean(input.label, noticeLimits.label);
  const events = eventsOf(input.events);
  const url = typeof input.url === "string" ? input.url.trim() : "";
  if (webhooks.checkUrl(url, kind).length > 0) throw new AppError(kind === "slack" ? "webhook_slack" : kind === "teams" ? "webhook_teams" : "webhook_address");
  const [{ n }] = (await sql<{ n: number }[]>`select count(*)::int as n from notice_targets`) as unknown as [{ n: number }];
  if (n >= noticeLimits.targets) throw new AppError("too_many_targets", { max: noticeLimits.targets });
  let added: Awaited<ReturnType<typeof webhooks.add>>;
  try {
    added = await webhooks.add({ url, kind, label, owner: who.id });
  } catch (error) {
    if (error instanceof CapabilityNotGranted) throw new AppError("webhooks_unavailable");
    if (error instanceof QuotaExceeded) throw new AppError("too_many_targets", { max: noticeLimits.targets });
    if (error instanceof ChestError && error.code === "verification_failed") throw new AppError("webhook_no_answer");
    if (error instanceof ChestError && (error.code === "invalid_target" || error.code === "address_refused")) throw new AppError(kind === "slack" ? "webhook_slack" : kind === "teams" ? "webhook_teams" : "webhook_address");
    throw error;
  }
  await sql`insert into notice_targets (id, kind, label, shown, events, created_by) values (${added.id}, ${kind}, ${label}, ${added.target.url.slice(0, 300)}, ${events}, ${who.id})`;
  return { target: { id: added.id, kind, label, shown: added.target.url, events, createdBy: who.id, disabled: false, lastError: null, status: null }, secret: added.secret };
}

const targetId = (value: unknown): string => {
  if (typeof value !== "string" || !webhooks.targetIdPattern.test(value)) throw new AppError("not_found");
  return value;
};

// setEvents changes what an address is told.
export async function setEvents(sql: Sql, actor: Member | null, id: unknown, events: unknown): Promise<void> {
  admin(actor);
  const rows = await sql`update notice_targets set events = ${eventsOf(events)} where id = ${targetId(id)} returning id`;
  if (rows.length === 0) throw new AppError("not_found");
}

// removeTarget stops the notices to an address for good: the Chest forgets
// it (it cannot come back without pasting it again).
export async function removeTarget(sql: Sql, actor: Member | null, id: unknown): Promise<void> {
  admin(actor);
  const key = targetId(id);
  const [row] = await sql<{ id: string }[]>`select id from notice_targets where id = ${key}`;
  if (!row) throw new AppError("not_found");
  try {
    await webhooks.remove(key);
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    if (!(error instanceof CapabilityNotGranted) && error.code !== "target_not_found" && error.code !== "not_found") throw error;
  }
  await sql`delete from notice_targets where id = ${key}`;
}

// enableTarget tries a stopped address again (the Chest pings it first).
export async function enableTarget(sql: Sql, actor: Member | null, id: unknown): Promise<void> {
  admin(actor);
  const key = targetId(id);
  try {
    await webhooks.enable(key);
  } catch (error) {
    if (error instanceof CapabilityNotGranted) throw new AppError("webhooks_unavailable");
    if (error instanceof ChestError && (error.code === "target_not_found" || error.code === "not_found")) {
      await sql`delete from notice_targets where id = ${key}`;
      throw new AppError("not_found");
    }
    if (error instanceof ChestError && error.code === "verification_failed") throw new AppError("webhook_no_answer");
    throw error;
  }
  await sql`update notice_targets set disabled_at = null, last_error = null where id = ${key}`;
}

// disabled: the Chest stopped delivering to an address (webhook.disabled).
// Says its label, for the administrators' bell; null for an address the
// tool does not know (removed since).
export async function disabled(sql: Query, event: webhooks.WebhookEvent): Promise<{ id: string; label: string } | null> {
  const [row] = await sql<{ id: string; label: string }[]>`
    update notice_targets set disabled_at = coalesce(disabled_at, ${new Date(event.at)}), last_error = ${(event.lastError ?? event.reason).slice(0, 200)}
    where id = ${event.target} returning id, label`;
  return row ?? null;
}

// ---- Sending ---------------------------------------------------------------

export type NoticeTicket = { id: string; number: number; subject: string; customerName: string; customerEmail: string; requester?: string | null; channel: string; priority: string; status: string };

// The words of a channel: the Chest's language (English when the tool does
// not speak it).
function channelWords(): { t: Catalogue; locale: Locale } {
  const given = chest.locale();
  const locale: Locale = isLocale(given) ? given : "en";
  return { t: catalogue(locale), locale };
}

async function whoAsked(t: NoticeTicket, words: Catalogue, locale: Locale): Promise<string> {
  if (t.requester === "erased") return words.people.erased;
  if (t.requester) {
    const person = (await people([t.requester])).get(t.requester);
    return !person || person.status === "unknown" ? words.ticket.colleague : nameOf(person, locale);
  }
  return t.customerName || t.customerEmail;
}

const link = (number: number): string | null => {
  const team = chest.teamUrl();
  return team ? `${team}/chest/tickets/${number}` : null;
};

// notice tells every address that asked for this event. A courtesy: the
// request is kept whatever happens here; an address the Chest stopped or
// forgot is marked (or dropped); the Chest's refusals are logged without a
// word of the request.
export async function notice(sql: Query, event: NoticeEvent, t: NoticeTicket, key: string, extra: { hours?: number } = {}): Promise<number> {
  const rows = await sql<{ id: string }[]>`select id from notice_targets where ${event} = any(events) and disabled_at is null order by id`;
  if (rows.length === 0) return 0;
  const { t: words, locale } = channelWords();
  const w = words.notices;
  const customer = await whoAsked(t, words, locale);
  const url = link(t.number);
  const line = format(event === "new" ? w.newTicket : event === "replied" ? w.replied : w.late, { number: t.number, customer, subject: t.subject, hours: extra.hours ?? 0 });
  const text = [line, url].filter(Boolean).join("\n").slice(0, 4000);
  try {
    const sent = await webhooks.send(rows.map(r => r.id), {
      event: `ticket.${event}`,
      text,
      data: { ticket: { number: t.number, subject: t.subject, channel: t.channel, priority: t.priority, status: t.status, url }, customer: { name: customer }, ...(extra.hours ? { waited_hours: extra.hours } : {}) },
      // Whole: the SDK sends a long key as its SHA-256 (studio.15).
      key,
    });
    for (const s of sent.skipped) {
      if (s.reason === "not_found") await sql`delete from notice_targets where id = ${s.target}`;
      else await sql`update notice_targets set disabled_at = coalesce(disabled_at, now()) where id = ${s.target}`;
    }
    return sent.deliveries.length;
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    console.warn(`notice ${event} not sent: ${error.code}`);
    return 0;
  }
}

// late tells the addresses that asked for it about each open request
// waiting past the threshold (in working hours) — once per wait: a reply
// ends the wait, the customer's next message may be noticed again. Run by
// the "late" schedule (every 15 minutes); a Chest without schedules sends
// none (Settings says so).
export async function late(sql: Sql, now = new Date()): Promise<number> {
  const [wanted] = await sql<{ n: number }[]>`select count(*)::int as n from notice_targets where 'late' = any(events) and disabled_at is null`;
  if (!wanted?.n) return 0;
  const s = await settings(sql);
  if (s.lateHours <= 0) return 0;
  const zone = chest.timeZone();
  // Working minutes never outrun the clock: the clock's wait is a first sieve.
  const rows = await sql<{ id: string; number: number; subject: string; customer_email: string; customer_name: string; requester: string | null; channel: string; priority: string; status: string; waiting_since: Date }[]>`
    select id, number, subject, customer_email, customer_name, requester, channel, priority, status, waiting_since from tickets
    where status = 'open' and merged_into is null and waiting_since is not null and waiting_since < ${new Date(now.getTime() - s.lateHours * 3600000)}
      and (late_noticed_for is null or late_noticed_for <> waiting_since)
    order by waiting_since limit 200`;
  let told = 0;
  for (const r of rows) {
    const minutes = workMinutes(r.waiting_since, now, s.hours, zone);
    if (!lateAfter(minutes, s.lateHours)) continue;
    // Marked first: a failure never tells the channel twice about one wait.
    // (Timestamps are compared in the database: JavaScript keeps milliseconds only.)
    const marked = await sql`update tickets set late_noticed_for = waiting_since where id = ${r.id} and status = 'open' and waiting_since is not null and (late_noticed_for is null or late_noticed_for <> waiting_since) returning id`;
    if (marked.length === 0) continue;
    await notice(sql, "late", { id: String(r.id), number: r.number, subject: r.subject, customerName: r.customer_name, customerEmail: r.customer_email, requester: r.requester, channel: r.channel, priority: r.priority, status: r.status }, `late:${r.id}:${r.waiting_since.getTime()}`, { hours: s.lateHours });
    told++;
  }
  return told;
}

// about: notice of one ticket, read by its id (the paths that open or
// reopen a request call it after the request is saved).
export async function about(sql: Query, event: "new" | "replied", ticketId: string, key: string): Promise<void> {
  const [r] = await sql<{ id: string; number: number; subject: string; customer_email: string; customer_name: string; requester: string | null; channel: string; priority: string; status: string }[]>`
    select id, number, subject, customer_email, customer_name, requester, channel, priority, status from tickets where id = ${ticketId}`;
  if (!r) return;
  await notice(sql, event, { id: String(r.id), number: r.number, subject: r.subject, customerName: r.customer_name, customerEmail: r.customer_email, requester: r.requester, channel: r.channel, priority: r.priority, status: r.status }, key);
}

// The key of a customer's new message: one notice per message.
export async function lastMessageKey(sql: Query, ticketId: string): Promise<string> {
  const [m] = await sql<{ id: string }[]>`select id from messages where ticket_id = ${ticketId} and kind = 'customer' order by created_at desc, id desc limit 1`;
  return `replied:${m?.id ?? ticketId}`;
}
