import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import * as mail from "@argentic/chest-sdk/mail";
import { log } from "@argentic/chest-app";
import * as notifications from "@argentic/chest-sdk/notifications";
import { catalogue, format, isLocale, plural, type Locale } from "../i18n/index.ts";
import { notice } from "./notify.ts";
import { answerText, isPick, recall, type Answers } from "../shared/logic.ts";
import type { Query } from "./db.ts";
import type { Definition } from "../shared/model.ts";

// The copy of a public form's answer, emailed to the visitor who asked for
// it — someone outside the company — through the Chest's mail connector
// (Proposal (studio): "mail" in chest.proposals.json, backed by the
// company's own mail provider; not built yet). Sent in the language the
// respondent read the form in; the questions as the form's author wrote
// them; Reply-To the company's address (the connector's default): a reply
// reaches the company's inbox, never Forms. On a Chest without mail, its
// connector not connected, or a message refused, nothing is sent and the
// thank-you page says nothing about a copy. A member's copy of a team
// form is a notification (copyNotice), never a mail.
export type Delivery = "email" | "none" | "off";

// The kinds whose answer is made of the form's own words (options, yes or
// no, a number of stars…): what a copy to a typed address may repeat.
const ownWords = new Set(["choice", "choices", "dropdown", "picture", "yesno", "rating", "scale", "matrix", "ranking", "date", "number"]);

// copyText: the email's words (tested alone). It goes to an address a
// visitor typed, so it repeats only the form's own words: the questions
// answered with them (options, yes or no, a number of stars…), an
// option's "Other" without what was typed, a title that repeats an answer
// ({name}) without it, and a line saying the written answers are not
// repeated — no text a visitor typed, so no link and no message of theirs
// goes out in the company's name to whoever they named.
export function copyText(def: Definition, answers: Answers, language: string, company: string): { subject: string; text: string } {
  const t = catalogue(isLocale(language) ? language : "en");
  const words = { yes: t.respond.yes, no: t.respond.no, other: t.respond.other };
  const lines: string[] = [];
  let left = 0;
  for (const q of def.pages.flatMap(p => p.questions)) {
    if (q.kind === "statement" || answers[q.id] === undefined) continue;
    if (!ownWords.has(q.kind)) {
      left++;
      continue;
    }
    let value = answers[q.id];
    if (isPick(value) && value.other) value = { ids: value.ids, other: "…" };
    lines.push(recall(q.title, def, {}, words), "  " + answerText(q, value, words).replace(/\n/gu, "\n  "), "");
  }
  if (left > 0) lines.push(plural(t.mail.copyWritten, left, isLocale(language) ? language : "en"), "");
  const values = { form: def.title, company: company || t.mail.team };
  return { subject: format(t.mail.copySubject, values), text: [format(t.mail.copyIntro, values), "", ...lines, format(t.mail.copyFoot, values)].join("\n") };
}

// A public form's copies: at most perHour a form an hour (a flood of
// answers sends no flood of emails), one an address a day for a form
// (nobody's inbox filled by someone typing their address). Counted on the
// answers that say a copy went (answers.sent).
export const copyLimits = { perHour: 20 } as const;
export async function copyAllowed(sql: Query, formId: string, to: string, answerId: string): Promise<boolean> {
  const [row] = await sql<{ hour: number; address: number }[]>`
    select count(*) filter (where created_at > now() - interval '1 hour')::int as hour,
           count(*) filter (where email = ${to.toLowerCase()})::int as address
    from answers
    where form_id = ${formId} and id <> ${answerId} and 'copy' = any(sent) and created_at > now() - interval '1 day'`;
  if ((row?.hour ?? 0) < copyLimits.perHour && (row?.address ?? 0) === 0) return true;
  log.warn("copy by email held back", { form: formId, reason: (row?.address ?? 0) > 0 ? "address" : "hour" });
  return false;
}

export async function sendCopy(to: string, def: Definition, answers: Answers, language: string, company: string, answerId: string): Promise<Delivery> {
  const { subject, text } = copyText(def, answers, language, company);
  try {
    await mail.send({ to, subject, text, ...(company ? { fromName: company } : {}), key: `copy:${answerId}:${to}` });
    return "email";
  } catch (error) {
    // "off": a Chest without mail (what the pages remember); "none": not
    // sent this time (not connected, paused, the day's quota, an address
    // that bounced) — nothing to remember from one address.
    if (error instanceof CapabilityNotGranted) return "off";
    if (error instanceof ChestError) return "none";
    throw error;
  }
}

// copyNotice: a member's copy of their answer to a team form — an item in
// their Chest notifications (English and French in one notice) opening
// what they sent (/chest/sent/<answer>), where they also see where it
// stands. The Chest mails it to them by their own choice.
export async function copyNotice(member: string, title: (language: Locale) => string, answerId: string): Promise<boolean> {
  try {
    const { delivered } = await notifications.notify([member], notice((t, l) => ({ title: format(t.bell.copy, { form: title(l) || t.builder.untitled }), body: t.bell.copyBody }), { path: `/chest/sent/${answerId}`, key: `copy:${answerId}` }));
    return delivered.length > 0;
  } catch (error) {
    if (error instanceof ChestError) return false;
    throw error;
  }
}
