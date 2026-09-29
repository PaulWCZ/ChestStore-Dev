import { ChestError } from "@argentic/chest-sdk/errors";
import type { Member } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import { answering } from "./access.ts";
import type { Sql } from "./db.ts";
import { format } from "./i18n/index.ts";
import { badges, cut, notify, withdraw } from "./notify.ts";
import { waitingCounts, type Ticket } from "./tickets.ts";

// The bell and the tile for the people who answer tickets, each in their
// own language. Keyed by the ticket, so a new item replaces the old one.

export async function answerers(): Promise<string[]> {
  const found: string[] = [];
  try {
    for (const role of answering) {
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
export async function newTicket(t: Pick<Ticket, "id" | "number" | "subject" | "customerName" | "customerEmail">, body: string, assignee: string | null = null): Promise<void> {
  const people = assignee ? [assignee] : await answerers();
  await notify(people, tr => ({ title: format(tr.bell.new, { customer: cut(t.customerName || t.customerEmail, 40) }), body: cut(`${t.subject} — ${body}`, 280) }), { path: path(t), key: `ticket:${t.id}:new` });
}

// The customer wrote again: the ticket's agent hears of it (everyone, if
// nobody has it).
export async function customerWrote(t: Pick<Ticket, "id" | "number" | "subject" | "assignee" | "customerName" | "customerEmail">, body: string): Promise<void> {
  if (!t.assignee) return newTicket(t, body);
  await notify([t.assignee], tr => ({ title: format(tr.bell.replied, { customer: cut(t.customerName || t.customerEmail, 40), number: t.number }), body: cut(body, 280) }), { path: path(t), key: `ticket:${t.id}:reply` });
}

export async function assigned(actor: Member, t: Pick<Ticket, "id" | "number" | "subject">, to: string | null): Promise<void> {
  await withdraw(`ticket:${t.id}:new`);
  if (!to || to === actor.id) return;
  await notify([to], tr => ({ title: format(tr.bell.assigned, { name: actor.name, number: t.number }), body: cut(t.subject, 280) }), { path: path(t), key: `ticket:${t.id}:assigned` });
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
export async function rated(t: Pick<Ticket, "id" | "number" | "assignee" | "customerName" | "customerEmail">, rating: "good" | "bad"): Promise<void> {
  if (!t.assignee) return;
  await notify([t.assignee], tr => ({ title: format(rating === "good" ? tr.bell.ratedGood : tr.bell.ratedBad, { customer: cut(t.customerName || t.customerEmail, 40), number: t.number }) }), { path: path(t), key: `ticket:${t.id}:rated` });
}

export async function refreshBadges(sql: Sql): Promise<void> {
  const people = await answerers();
  if (people.length > 0) await badges(await waitingCounts(sql, people));
}
