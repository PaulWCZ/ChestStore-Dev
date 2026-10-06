import { ChestError, QuotaExceeded, RateLimited, Unavailable } from "@argentic/chest-sdk/errors";
import * as mail from "@argentic/chest-sdk/mail";
import { catalogue, format, isLocale, type Catalogue } from "../i18n/index.ts";

// Email to candidates through the Chest's mail (Proposal (studio): the
// "mail" capability with the "jobs" mailbox, chest.proposals.json). Every
// message leaves from jobs@<the company's domain> with the candidate's own
// thread address as Reply-To (jobs+tc42-…@): their answer comes back to
// the tool and lands in their history (lib/mail-in.ts), whatever their
// mail app does with the headers. On a Chest without mail yet
// (CapabilityNotGranted), or when the Chest refuses the message, nothing
// is sent and the tool says so.
//
// Every email to a candidate is transactional (SDK studio.15): it answers
// their own application — the confirmation, an interview's time or its
// cancellation, the link to choose a time, a recruiter's message, the
// answer. A candidate is usually an outside address, which no email
// preference touches, so the flag changes nothing for them; it matters
// for an employee who applies to an internal job with their work address
// and chose "no email" or "one a day" in their Chest: without it, the
// Chest would hold their interview's confirmation back.
// later: the Chest did not answer, or the day's quota is used: the
// outbox tries again (lib/outbox.ts).
export type Delivery = "email" | "none" | "later";
const retry = (error: unknown) => error instanceof Unavailable || error instanceof RateLimited || error instanceof QuotaExceeded;
export const mailbox = "jobs";

// A candidate's conversation: "c" and their id (a thread is 1 to 16 of
// a-z 0-9; its tag in the address makes it unguessable).
export const threadOf = (candidateId: string) => "c" + candidateId;
export const candidateOfThread = (thread: string | null): string | null => (thread && /^c[1-9][0-9]{0,14}$/u.test(thread) ? thread.slice(1) : null);

const wordsFor = (language: string): Catalogue => catalogue(isLocale(language) ? language : "en");

export type Sent = { delivery: Delivery; id?: string; messageId?: string };

// send sends one message to a candidate in their conversation. A Chest
// that does not know the jobs mailbox yet (no address given by the owner)
// still sends it, from its no-reply address: the candidate is told to
// answer nowhere — the text says the team will write.
export async function send(message: { to: string; subject: string; text: string; candidateId: string; fromName?: string; key: string; attachments?: mail.Attachment[]; inReplyTo?: string; references?: string[] }): Promise<Sent> {
  const base = {
    to: message.to,
    subject: message.subject,
    text: message.text,
    key: message.key,
    transactional: true,
    ...(message.fromName ? { fromName: message.fromName.slice(0, 100) } : {}),
    ...(message.attachments?.length ? { attachments: message.attachments } : {}),
    ...(message.inReplyTo ? { inReplyTo: message.inReplyTo } : {}),
    ...(message.references?.length ? { references: message.references } : {}),
  };
  try {
    const sent = await mail.send({ ...base, mailbox, thread: threadOf(message.candidateId) });
    return { delivery: "email", id: sent.id, messageId: sent.messageId };
  } catch (error) {
    if (error instanceof ChestError && (error.code === "invalid_mailbox" || error.code === "no_mailbox")) {
      try {
        const sent = await mail.send(base);
        return { delivery: "email", id: sent.id, messageId: sent.messageId };
      } catch (again) {
        if (retry(again)) return { delivery: "later" };
        if (again instanceof ChestError) return { delivery: "none" };
        throw again;
      }
    }
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
// the candidate applied on.
export function confirmation(c: { name: string; language: string }, job: { title: string }, company: string, careers: string | null): { subject: string; text: string } {
  const t = wordsFor(c.language).mail;
  const v = { ...values(c, job, company, ""), careers: careers ?? "" };
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
