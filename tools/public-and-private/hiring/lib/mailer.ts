import { ChestError } from "@argentic/chest-sdk/errors";
import * as mail from "@argentic/chest-sdk/mail";
import { catalogue, format, isLocale } from "./i18n/index.ts";

// Email to candidates through the Chest's mail (Proposal (studio): the
// "mail" capability, chest.proposals.json). On a Chest without mail yet
// (CapabilityNotGranted), or when the Chest refuses the message, nothing
// is sent and the tool says so: the thank-you page tells the candidate
// the team will write; a rejection is recorded without its email.
export type Delivery = "email" | "none";

const wordsFor = (language: string) => catalogue(isLocale(language) ? language : "en");

async function send(message: mail.Message): Promise<Delivery> {
  try {
    await mail.send(message);
    return "email";
  } catch (error) {
    if (error instanceof ChestError) return "none";
    throw error;
  }
}

// confirm tells a candidate their application arrived, in the language of
// the careers page they applied on.
export async function confirm(c: { id: string; name: string; email: string; language: string }, job: { title: string }, company: string, careers: string | null): Promise<Delivery> {
  const t = wordsFor(c.language).mail;
  const values = { name: c.name, job: job.title, company: company || t.team, careers: careers ?? "" };
  return send({
    to: c.email,
    subject: format(t.confirmSubject, values),
    text: format(careers ? t.confirmBody : t.confirmBodyNoLink, values),
    ...(company ? { fromName: company } : {}),
    key: `applied:${c.id}`,
  });
}

// The rejection email a recruiter starts from, in the candidate's language.
export function rejectionDraft(c: { name: string; language: string }, job: { title: string }, company: string, sender: string): { subject: string; text: string } {
  const t = wordsFor(c.language).mail;
  const values = { name: c.name, job: job.title, company: company || t.team, sender };
  return { subject: format(t.rejectSubject, values), text: format(t.rejectBody, values) };
}

// reject sends the rejection as the recruiter wrote it (from the draft).
export async function reject(c: { id: string; email: string; language: string }, job: { title: string }, company: string, sender: string, text: string): Promise<Delivery> {
  const t = wordsFor(c.language).mail;
  return send({
    to: c.email,
    subject: format(t.rejectSubject, { job: job.title, company: company || t.team }),
    text,
    fromName: company ? `${sender} — ${company}` : sender,
    key: `rejected:${c.id}`,
  });
}
