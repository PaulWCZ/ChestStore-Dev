import * as chest from "@argentic/chest-sdk/chest";
import type { Bounce, Received } from "@argentic/chest-sdk/mail";
import type { Sql } from "./db.ts";
import * as mailer from "./mailer.ts";
import { publicBase } from "./public-origin.ts";
import * as tell from "./tell.ts";
import * as tickets from "./tickets.ts";
import { robotAddress } from "./text.ts";

// What the Chest posts to /chest-mail (Proposal (studio): mail): emails
// received on the support mailbox, and the bounces of what we sent.

// At most this many confirmations an hour to one address: past it, a
// robot is answering our robot — no more.
export const confirmationsPerHour = 3;

// received files the email (lib/tickets.ts fromEmail), confirms a new
// request by email (never to a robot's address, never in a loop), and
// tells those who answer. An automatic answer, or spam, tells no one.
export async function received(sql: Sql, message: Received): Promise<void> {
  if (message.mailbox !== "support") return;
  const filed = await tickets.fromEmail(sql, message, chest.locale());
  if (!filed || filed.auto || filed.spam) return;
  const [row] = await sql<{ subject: string; assignee: string | null; customer_name: string; customer_email: string; language: string }[]>`select subject, assignee, customer_name, customer_email, language from tickets where id = ${filed.id}`;
  const t = { id: filed.id, number: filed.number, subject: row!.subject, assignee: row!.assignee, customerName: row!.customer_name, customerEmail: row!.customer_email };
  if (filed.created && filed.secret) {
    const from = message.from.address;
    if (!robotAddress(from) && (await tickets.confirmations(sql, from)) < confirmationsPerHour) {
      const s = await tickets.settings(sql);
      const sent = await mailer.confirm({ ...t, language: row!.language }, `${publicBase(s.publicOrigin)}/t/${filed.secret}`, s.companyName || chest.company(), message.messageId);
      if (sent.delivery === "email") await tickets.confirmed(sql, filed.id, sent.mail);
    }
    await tell.newTicket(t, message.text, filed.assignee);
  } else await tell.customerWrote(t, message.text);
  await tell.refreshBadges(sql);
}

// bounced marks the email that did not arrive, and tells whoever wrote it
// (or has the ticket) when it will never arrive.
export async function bounced(sql: Sql, bounce: Bounce): Promise<void> {
  const hit = await tickets.bounced(sql, bounce);
  if (!hit || !bounce.permanent) return;
  const to = hit.author && hit.author.startsWith("mbr_") ? hit.author : hit.assignee;
  if (to) await tell.bounced({ id: hit.ticketId, number: hit.number }, to, bounce.recipient);
}
