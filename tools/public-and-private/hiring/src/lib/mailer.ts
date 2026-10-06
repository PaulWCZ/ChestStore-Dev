import { chest } from "@argentic/chest-sdk/chest";
import { ChestError, QuotaExceeded, RateLimited, Unavailable } from "@argentic/chest-sdk/errors";
import * as mail from "@argentic/chest-sdk/mail";
import { catalogue, format, isLocale, type Catalogue } from "../i18n/index.ts";

// Email to candidates — people outside the company — through the Chest's
// mail (Proposal (studio): the "mail" capability, chest.proposals.json),
// which the Chest sends through the company's own mail provider. The Chest
// receives no mail (owner's decision, 6 October 2026): Reply-To is the
// company's reply address the owner set with the connector (the SDK's
// default), so a candidate's answer reaches the company's usual inbox, not
// Hiring — and every email says so in its last line. On a Chest without
// mail (CapabilityNotGranted), with the company's mail not connected, or
// when the Chest refuses the message, nothing is sent and the tool says so.
// later: the Chest is paused or the day's quota is used: the outbox tries
// again (lib/outbox.ts).
export type Delivery = "email" | "none" | "later";
const retry = (error: unknown) => error instanceof Unavailable || error instanceof RateLimited || error instanceof QuotaExceeded;

// send throws the same Unavailable when the Chest did not answer and when
// the owner has not connected the company's mail: asked again, so that an
// email that cannot leave for weeks says "not sent" instead of "leaving
// soon" (an SDK obstacle, in the README).
async function notConnected(): Promise<boolean> {
  try {
    const a = await mail.available();
    return a.reason === "not_connected" || a.reason === "not_granted";
  } catch {
    return false;
  }
}

// The company's name as the Chest says it (none outside a Chest).
const organization = (): string => {
  try {
    return chest.organization.name;
  } catch {
    return "";
  }
};

const wordsFor = (language: string): Catalogue => catalogue(isLocale(language) ? language : "en");

export type Sent = { delivery: Delivery; id?: string };

// send sends one message to a candidate, with the line that says where a
// reply goes (in the candidate's language).
export async function send(message: { to: string; subject: string; text: string; language: string; company: string; fromName?: string; key: string; attachments?: mail.Attachment[] }): Promise<Sent> {
  const t = wordsFor(message.language).mail;
  try {
    const sent = await mail.send({
      to: message.to,
      subject: message.subject,
      text: `${message.text}\n\n—\n${format(t.replyLine, { company: message.company || organization() || t.team })}`,
      key: message.key,
      ...(message.fromName ? { fromName: message.fromName.slice(0, 100) } : {}),
      ...(message.attachments?.length ? { attachments: message.attachments } : {}),
    });
    return { delivery: "email", id: sent.id };
  } catch (error) {
    if (error instanceof Unavailable && await notConnected()) return { delivery: "none" };
    if (retry(error)) return { delivery: "later" };
    if (error instanceof ChestError) return { delivery: "none" };
    throw error;
  }
}

// The values a template's {placeholders} take for a candidate.
export function values(c: { name: string; language: string }, job: { title: string }, company: string, sender: string): Record<string, string> {
  const t = wordsFor(c.language).mail;
  return { name: c.name, firstName: c.name.split(/\s+/u)[0] ?? c.name, job: job.title, company: company || t.team, sender };
}

// confirm: the application arrived, in the language of the careers page
// the candidate applied on. Anyone may type any name and any address on
// the form: the email greets with the first word of the name only, and
// only when it reads as a name (letters, an apostrophe or a hyphen, 30 at
// most), and never for a name holding a link or an address, so the company's mail cannot carry
// a stranger's message to someone else.
export function greeted(name: string): string | null {
  // A name that holds a link or an address anywhere is no name.
  if (/@|:\/\/|www\.|\.\p{L}{2,}/iu.test(name)) return null;
  const first = name.trim().split(/\s+/u)[0] ?? "";
  return /^\p{L}[\p{L}\p{M}'’-]{0,29}$/u.test(first) ? first : null;
}

export function confirmation(c: { name: string; language: string }, job: { title: string }, company: string, careers: string | null): { subject: string; text: string } {
  const t = wordsFor(c.language).mail;
  const first = greeted(c.name);
  const hello = first ? format(t.confirmHello, { firstName: first }) : t.confirmHelloBare;
  const v = { ...values(c, job, company, ""), name: "", firstName: first ?? "", hello, careers: careers ?? "" };
  return { subject: format(t.confirmSubject, v), text: format(careers ? t.confirmBody : t.confirmBodyNoLink, v) };
}

// The rejection email a recruiter starts from, in the candidate's language.
export function rejectionDraft(c: { name: string; language: string }, job: { title: string }, company: string, sender: string): { subject: string; text: string } {
  const t = wordsFor(c.language).mail;
  const v = values(c, job, company, sender);
  return { subject: format(t.rejectSubject, v), text: format(t.rejectBody, v) };
}

// The sender's name on a recruiter's email: "Camille — Atelier Martin".
export const fromName = (sender: string, company: string) => (company ? `${sender} — ${company}` : sender);
