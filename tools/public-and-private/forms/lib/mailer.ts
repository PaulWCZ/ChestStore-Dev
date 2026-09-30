import { ChestError } from "@argentic/chest-sdk/errors";
import * as mail from "@argentic/chest-sdk/mail";
import { catalogue, format, isLocale } from "./i18n/index.ts";
import { answerText, type Answers } from "./logic.ts";
import type { Definition } from "./model.ts";

// The copy of an answer, emailed to the person who gave it, through the
// Chest's mail (Proposal (studio): the "mail" capability,
// chest.proposals.json). Sent in the language the respondent read the form
// in; the questions as the form's author wrote them. On a Chest without
// mail yet (CapabilityNotGranted), or when the Chest refuses the message,
// nothing is sent and the thank-you page says nothing about a copy.
// A copy is the person's own answer, sent because they gave it: it is
// transactional (Proposal (studio.15)), sent whatever email preference a
// member chose in their Chest. The owner's alerts (lib/alerts.ts) are not:
// the Chest applies the owner's preference to them.
export type Delivery = "email" | "none";

// copyText: the email's words (tested alone).
export function copyText(def: Definition, answers: Answers, language: string, company: string): { subject: string; text: string } {
  const t = catalogue(isLocale(language) ? language : "en");
  const words = { yes: t.respond.yes, no: t.respond.no, other: t.respond.other };
  const lines: string[] = [];
  for (const q of def.pages.flatMap(p => p.questions)) {
    if (q.kind === "statement" || answers[q.id] === undefined) continue;
    lines.push(q.title, "  " + answerText(q, answers[q.id], words).replace(/\n/gu, "\n  "), "");
  }
  const values = { form: def.title, company: company || t.mail.team };
  return { subject: format(t.mail.copySubject, values), text: [format(t.mail.copyIntro, values), "", ...lines, t.mail.copyFoot].join("\n") };
}

export async function sendCopy(to: string | { member: string }, def: Definition, answers: Answers, language: string, company: string, answerId: string): Promise<Delivery> {
  const { subject, text } = copyText(def, answers, language, company);
  try {
    await mail.send({ to: typeof to === "string" ? to : { member: to.member }, subject, text, ...(company ? { fromName: company } : {}), key: `copy:${answerId}`, transactional: true });
    return "email";
  } catch (error) {
    if (error instanceof ChestError) return "none";
    throw error;
  }
}
