import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import * as mail from "@argentic/chest-sdk/mail";
import type { Member } from "@argentic/chest-sdk/member";
import { catalogue, format, isLocale } from "./i18n/index.ts";
import { subjectTag } from "./model.ts";
import type { Ticket } from "./tickets.ts";

// Email to customers through the Chest's mail (Proposal (studio): the
// "mail" capability, chest.proposals.json). On a Chest without mail yet,
// nothing is sent and the tool says so: the customer reads the answer on
// the follow-up page, whose link they received when they wrote.
export type Delivery = { delivery: "email"; mail: { id: string; messageId: string } } | { delivery: "page" };

const wordsFor = (language: string) => catalogue(isLocale(language) ? language : "en");

async function sendOrPage(message: mail.Message): Promise<Delivery> {
  try {
    const sent = await mail.send(message);
    return { delivery: "email", mail: { id: sent.id, messageId: sent.messageId } };
  } catch (error) {
    if (error instanceof CapabilityNotGranted) return { delivery: "page" };
    if (error instanceof ChestError) return { delivery: "page" };
    throw error;
  }
}

// confirm tells a customer their request arrived, with the follow-up link
// (the only time the link can be given: its secret is not kept).
export async function confirm(ticket: Pick<Ticket, "number" | "subject" | "customerEmail" | "customerName" | "language">, link: string, company: string): Promise<Delivery> {
  const t = wordsFor(ticket.language).mail;
  return sendOrPage({
    to: ticket.customerEmail,
    subject: `${format(t.receivedSubject, { subject: ticket.subject })} ${subjectTag(ticket.number)}`,
    text: format(t.receivedBody, { name: ticket.customerName || t.there, number: ticket.number, link, company: company || t.team }),
    mailbox: "support",
    ...(company ? { fromName: company } : {}),
    key: `confirm:${ticket.number}`,
  });
}

// answer sends an agent's reply, threaded under the customer's emails.
export async function answer(ticket: Pick<Ticket, "number" | "subject" | "customerEmail" | "customerName" | "language">, body: string, agent: Member, company: string, threading: string[], messageId: string): Promise<Delivery> {
  const t = wordsFor(ticket.language).mail;
  const last = threading.at(-1);
  return sendOrPage({
    to: ticket.customerEmail,
    subject: `Re: ${ticket.subject} ${subjectTag(ticket.number)}`,
    text: `${body}\n\n—\n${format(t.signature, { agent: agent.firstName || agent.name, company: company || t.team })}\n${t.replyHint}`,
    mailbox: "support",
    fromName: company ? `${agent.firstName || agent.name} — ${company}` : agent.firstName || agent.name,
    ...(last ? { inReplyTo: last, references: threading.slice(-20) } : {}),
    key: `reply:${messageId}`,
  });
}

// The address customers may write to, when the owner gave the tool one.
export async function supportAddress(): Promise<string | null> {
  try {
    return await mail.mailboxAddress("support");
  } catch {
    return null;
  }
}
