import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import * as mail from "@argentic/chest-sdk/mail";
import type { Member } from "@argentic/chest-sdk/member";
import { catalogue, format, isLocale } from "../i18n/index.ts";
import { subjectTag } from "./model.ts";
import type { Bounce, Ticket } from "./tickets.ts";

// Email to customers — people outside the company — through the Chest's
// mail (Proposal (studio): the "mail" capability, chest.proposals.json),
// which the Chest sends through the company's own mail provider. The Chest
// receives no mail (owner's decision, 6 October 2026): the customer's
// request page is where the conversation continues, and every email says
// so, with its link. Reply-To is the company's reply address the owner set
// with the connector (the SDK's default): a customer who answers by email
// reaches the company's usual inbox, and the email says that too. On a
// Chest that cannot send, nothing is lost: the answer is on the request
// page, and the team's page says the email did not go.
export type Delivery = { delivery: "email"; mail: { id: string } } | { delivery: "page"; refused?: Bounce };

const wordsFor = (language: string) => catalogue(isLocale(language) ? language : "en");

// At most this many confirmations an hour to one address: past it, a robot
// is answering our robot — no more.
export const confirmationsPerHour = 3;

async function sendOrPage(message: mail.Message): Promise<Delivery> {
  try {
    const sent = await mail.send(message);
    return { delivery: "email", mail: { id: sent.id } };
  } catch (error) {
    if (error instanceof CapabilityNotGranted) return { delivery: "page" };
    // The Chest refuses an address that bounced or complained before: the
    // reply says so, the customer still reads it on their page.
    if (error instanceof ChestError && error.code === "suppressed") return { delivery: "page", refused: { permanent: true, reason: "suppressed", at: new Date().toISOString(), recipient: Array.isArray(message.to) ? String(message.to[0]) : String(message.to) } };
    // Not connected, paused, the day's quota, a refusal: on the page only.
    if (error instanceof ChestError) return { delivery: "page" };
    throw error;
  }
}

// confirm tells a customer their request arrived, with the link of their
// request page (the only time this link is given: its secret is not kept).
export async function confirm(ticket: Pick<Ticket, "number" | "subject" | "customerEmail" | "customerName" | "language">, link: string, company: string): Promise<Delivery> {
  const t = wordsFor(ticket.language).mail;
  const name = company || t.team;
  return sendOrPage({
    to: ticket.customerEmail,
    subject: `${format(t.receivedSubject, { subject: ticket.subject })} ${subjectTag(ticket.number)}`,
    text: format(t.receivedBody, { name: ticket.customerName || t.there, number: ticket.number, link, company: name }),
    ...(company ? { fromName: company.slice(0, 100) } : {}),
    // The recipient in the key (studio.16): after a restore from a backup,
    // a ticket number can name another customer's request.
    key: `confirm:${ticket.number}:${ticket.customerEmail}`,
  });
}

// answer sends an agent's reply with its files and the link of the
// request page (a new link: lib/tickets.ts newLink), where the customer
// answers (the Chest carries 10 MiB a message: a larger one is not sent,
// and the answer stays on the request page, files included).
export async function answer(ticket: Pick<Ticket, "number" | "subject" | "customerEmail" | "customerName" | "language">, body: string, agent: Member, company: string, link: string, messageId: string, files: { object: string; fileName: string }[] = []): Promise<Delivery> {
  const t = wordsFor(ticket.language).mail;
  const name = company || t.team;
  return sendOrPage({
    to: ticket.customerEmail,
    subject: `Re: ${ticket.subject} ${subjectTag(ticket.number)}`,
    text: `${body}\n\n—\n${format(t.signature, { agent: agent.firstName || agent.name, company: name })}\n\n${format(t.replyHint, { link, company: name })}`,
    fromName: (company ? `${agent.firstName || agent.name} — ${company}` : agent.firstName || agent.name).slice(0, 100),
    ...(files.length > 0 ? { attachments: files.map(f => ({ file: f.object, name: f.fileName })) } : {}),
    key: `reply:${messageId}:${ticket.customerEmail}`,
  });
}

// What Settings says about email to customers: whether the Chest sends it
// now (and why not), and where customers' email replies land.
export type MailState = { ok: boolean; reason: mail.MailAvailability["reason"] | "unknown"; replyTo: string | null };
export async function mailState(): Promise<MailState> {
  try {
    const a = await mail.available();
    return { ok: a.ok, reason: a.reason, replyTo: a.replyTo };
  } catch (error) {
    if (error instanceof ChestError) return { ok: false, reason: "unknown", replyTo: null };
    throw error;
  }
}
