import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import * as mail from "@argentic/chest-sdk/mail";
import type { Member } from "@argentic/chest-sdk/member";
import { catalogue, format, isLocale } from "../i18n/index.ts";
import { subjectTag } from "./model.ts";
import type { Bounce, Threading, Ticket } from "./tickets.ts";

// Email to customers through the Chest's mail (Proposal (studio): the
// "mail" capability, chest.proposals.json). On a Chest without mail yet,
// nothing is sent and the tool says so: the customer reads the answer on
// the follow-up page, whose link they received when they wrote.
export type Delivery = { delivery: "email"; mail: { id: string; messageId: string } } | { delivery: "page"; refused?: Bounce };

const wordsFor = (language: string) => catalogue(isLocale(language) ? language : "en");

async function sendOrPage(message: mail.Message): Promise<Delivery> {
  try {
    const sent = await mail.send(message);
    return { delivery: "email", mail: { id: sent.id, messageId: sent.messageId } };
  } catch (error) {
    if (error instanceof CapabilityNotGranted) return { delivery: "page" };
    // The Chest refuses an address that bounced or complained before: the
    // reply says so, the customer still reads it on their page.
    if (error instanceof ChestError && error.code === "suppressed") return { delivery: "page", refused: { permanent: true, reason: "suppressed", at: new Date().toISOString(), recipient: Array.isArray(message.to) ? String(message.to[0]) : String(message.to) } };
    if (error instanceof ChestError) return { delivery: "page" };
    throw error;
  }
}

// Every email about a ticket is on its thread (support+t1042-…@): the
// customer's answer comes back to the ticket even when their mail program
// drops the headers, and nobody else can write into it.
const thread = (number: number) => String(number);

// confirm tells a customer their request arrived, with the follow-up link
// (the only time the link can be given: its secret is not kept); threaded
// under their email when they wrote one.
export async function confirm(ticket: Pick<Ticket, "number" | "subject" | "customerEmail" | "customerName" | "language">, link: string, company: string, answering?: string): Promise<Delivery> {
  const t = wordsFor(ticket.language).mail;
  return sendOrPage({
    to: ticket.customerEmail,
    subject: `${format(t.receivedSubject, { subject: ticket.subject })} ${subjectTag(ticket.number)}`,
    text: format(t.receivedBody, { name: ticket.customerName || t.there, number: ticket.number, link, company: company || t.team }),
    mailbox: "support",
    thread: thread(ticket.number),
    ...(company ? { fromName: company } : {}),
    ...(answering ? { inReplyTo: answering, references: [answering] } : {}),
    // The recipient in the key (studio.16): after a restore from a backup,
    // a ticket number can name another customer's request.
    key: `confirm:${ticket.number}:${ticket.customerEmail}`,
    // Their own request's receipt and its only link: it must arrive
    // whatever a customer who is also a member chose for email.
    transactional: true,
  });
}

// answer sends an agent's reply, threaded under the conversation, with its
// files (the Chest carries 10 MiB a message: a larger one is not sent, and
// the answer stays on the follow-up page, files included).
export async function answer(ticket: Pick<Ticket, "number" | "subject" | "customerEmail" | "customerName" | "language">, body: string, agent: Member, company: string, threading: Threading, messageId: string, files: { object: string; fileName: string }[] = []): Promise<Delivery> {
  const t = wordsFor(ticket.language).mail;
  return sendOrPage({
    to: ticket.customerEmail,
    subject: `Re: ${ticket.subject} ${subjectTag(ticket.number)}`,
    text: `${body}\n\n—\n${format(t.signature, { agent: agent.firstName || agent.name, company: company || t.team })}\n${t.replyHint}`,
    mailbox: "support",
    thread: thread(ticket.number),
    fromName: (company ? `${agent.firstName || agent.name} — ${company}` : agent.firstName || agent.name).slice(0, 100),
    ...(threading.inReplyTo ? { inReplyTo: threading.inReplyTo, references: threading.references } : {}),
    ...(files.length > 0 ? { attachments: files.map(f => ({ file: f.object, name: f.fileName })) } : {}),
    key: `reply:${messageId}:${ticket.customerEmail}`,
    // The answer to their own request (studio.15).
    transactional: true,
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
