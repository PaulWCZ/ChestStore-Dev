import { ChestError } from "@argentic/chest-sdk/errors";
import type { Locale, Member } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import { answering } from "./access.ts";
import type { Sql } from "./db.ts";
import { format, type Catalogue } from "../i18n/index.ts";
import { badges, broadcast, cut, notify, withdraw } from "./notify.ts";
import { nameOf, people, type Person } from "./people.ts";
import { waitingCounts, type Ticket } from "./tickets.ts";

// The bell and the tile for the people who answer tickets, each in their
// own language (one notice, its translations). Keyed by the ticket, so a
// new item replaces the old one. The Chest mails members their
// notifications by each one's choice: Support sends members no email.

export async function answerers(roles: readonly string[] = answering): Promise<string[]> {
  const found: string[] = [];
  try {
    for (const role of roles) {
      let after: string | undefined;
      for (let page = 0; page < 4; page++) {
        const answer = await members.list({ role, limit: 500, ...(after ? { after } : {}) });
        found.push(...answer.members.map(m => m.id));
        if (!answer.next) break;
        after = answer.next;
      }
    }
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
  return [...new Set(found)];
}

const path = (t: Pick<Ticket, "number">) => `/chest/tickets/${t.number}`;

// A new ticket nobody has: everyone who answers hears of it, until someone
// takes it or answers it. One a rule gave to someone: they alone.
// A colleague's request (a team form) names them as the Chest does, in
// each reader's language ("a colleague" when Support does not know them).
export async function newTicket(t: Pick<Ticket, "id" | "number" | "subject" | "customerName" | "customerEmail"> & { requester?: string | null }, body: string, assignee: string | null = null): Promise<void> {
  const colleague = t.requester ? (await people([t.requester])).get(t.requester) : undefined;
  const customer = (tr: Catalogue, locale: Locale) => (t.requester ? colleagueName(colleague, tr, locale) : t.customerName || t.customerEmail);
  const words = (tr: Catalogue, locale: Locale) => ({ title: format(tr.bell.new, { customer: cut(customer(tr, locale), 40) }), body: cut(`${t.subject} — ${body}`, 280) });
  const options = { path: path(t), key: `ticket:${t.id}:new` };
  if (assignee) await notify([assignee], words, options);
  else await broadcast(answering, () => answerers(), words, options);
}

// How a colleague who asked is written: their name, or "a colleague" when
// Support does not know them (they do not have Support), "Former member"
// once erased.
export function colleagueName(person: Person | undefined, tr: Catalogue, locale: Locale): string {
  if (!person || person.status === "unknown") return tr.ticket.colleague;
  return nameOf(person, locale);
}

// The customer wrote again: the ticket's agent hears of it (everyone, if
// nobody has it).
// A colleague who wrote again from My requests is named as the Chest names
// them, in each reader's language.
export async function customerWrote(t: Pick<Ticket, "id" | "number" | "subject" | "assignee" | "customerName" | "customerEmail"> & { requester?: string | null }, body: string): Promise<void> {
  if (!t.assignee) return newTicket(t, body);
  const colleague = t.requester ? (await people([t.requester])).get(t.requester) : undefined;
  const customer = (tr: Catalogue, locale: Locale) => (t.requester ? colleagueName(colleague, tr, locale) : t.customerName || t.customerEmail);
  await notify([t.assignee], (tr, locale) => ({ title: format(tr.bell.replied, { customer: cut(customer(tr, locale), 40), number: t.number }), body: cut(body, 280) }), { path: path(t), key: `ticket:${t.id}:reply` });
}

export async function assigned(actor: Member, t: Pick<Ticket, "id" | "number" | "subject">, to: string | null): Promise<void> {
  await withdraw(`ticket:${t.id}:new`);
  if (!to || to === actor.id) return;
  await notify([to], tr => ({ title: format(tr.bell.assigned, { name: actor.name, number: t.number }), body: cut(t.subject, 280) }), { path: path(t), key: `ticket:${t.id}:assigned` });
}

// A colleague's request was answered: they hear of it in the bell, in
// their language, and the item opens their own request (My requests,
// /chest/mine/<number>) — which any member who has Support may read,
// with a role or none. A colleague who does not have Support at all is
// not told by the Chest (it tells only members who have the tool).
const minePath = (t: Pick<Ticket, "number">) => `/chest/mine/${t.number}`;
export async function colleagueAnswered(t: Pick<Ticket, "id" | "number" | "subject" | "requester">, actor: Member): Promise<void> {
  if (!t.requester || t.requester === "erased" || t.requester === actor.id) return;
  await notify([t.requester], tr => ({ title: format(tr.bell.colleagueAnswered, { name: actor.name, number: t.number }), body: cut(t.subject, 280) }), { path: minePath(t), key: `ticket:${t.id}:answered` });
}

// Answered or closed: nothing waits on the team any more.
export async function answered(t: Pick<Ticket, "id">): Promise<void> {
  for (const reason of ["new", "reply", "assigned"]) await withdraw(`ticket:${t.id}:${reason}`);
}

// An email about a ticket will never arrive (the address does not exist):
// whoever wrote it hears of it, to call the customer or fix the address.
export async function bounced(t: Pick<Ticket, "id" | "number">, to: string, recipient: string): Promise<void> {
  await notify([to], tr => ({ title: format(tr.bell.bounced, { number: t.number }), body: cut(recipient, 280) }), { path: path(t), key: `ticket:${t.id}:bounced` });
}

// The customer rated a closed request: its agent hears of it.
export async function rated(t: Pick<Ticket, "id" | "number" | "assignee" | "customerName" | "customerEmail"> & { requester?: string | null }, rating: "good" | "bad"): Promise<void> {
  if (!t.assignee) return;
  const colleague = t.requester ? (await people([t.requester])).get(t.requester) : undefined;
  const customer = (tr: Catalogue, locale: Locale) => (t.requester ? colleagueName(colleague, tr, locale) : t.customerName || t.customerEmail);
  await notify([t.assignee], (tr, locale) => ({ title: format(rating === "good" ? tr.bell.ratedGood : tr.bell.ratedBad, { customer: cut(customer(tr, locale), 40), number: t.number }) }), { path: path(t), key: `ticket:${t.id}:rated` });
}

export async function refreshBadges(sql: Sql): Promise<void> {
  const people = await answerers();
  if (people.length > 0) await badges(await waitingCounts(sql, people));
}

// The Chest stopped the notices to a channel (Settings, "Slack and
// Teams"): the administrators hear of it, to fix the address.
export async function noticeStopped(target: { id: string; label: string }): Promise<void> {
  await broadcast(["admin"], () => answerers(["admin"]), tr => ({ title: format(tr.bell.noticeStopped, { label: cut(target.label, 40) }) }), { path: "/chest/settings#notices", key: `notices:stopped:${target.id}` });
}
