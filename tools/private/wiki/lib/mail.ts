import { chest } from "@argentic/chest-sdk/chest";
import { CapabilityNotGranted, ChestError, QuotaExceeded, Unavailable } from "@argentic/chest-sdk/errors";
import { localeOf } from "@argentic/chest-sdk/member";
import * as mail from "@argentic/chest-sdk/mail";
import { catalogue, format, type Catalogue } from "./i18n/index.ts";

// Email beside the bell (Proposal (studio): "mail": {"send": true}, as
// News, Tasks, Polls and Goals). The bell reaches only people who open
// their Chest: a page to read and confirm (the company's rules, a safety
// instruction), the reminder to those who have not confirmed yet, and a
// page due for its check also go by email — one message per person
// (nobody sees who else got it), in their language, sent by the Chest to
// their address: the wiki never knows it. On a Chest that cannot send
// email yet nothing fails: the bell has told them.

export type Letter = { subject: string; lines: string[] };
export type Recipient = { id: string; language: string };
// sent: the people it went to (now, or in their daily digest from the
// Chest — not those who turned Chest email off: mail.send applies each
// person's choice, these letters are never transactional); stop: why the
// rest was not sent — the day's quota, a Chest without email, or a Chest
// that did not answer.
export type Mailed = { sent: string[]; stop: "quota" | "off" | "unavailable" | null };

// letterText writes the body: the letter, the link to open the page (when
// the Chest gives the tool's address), and why this email came.
export function letterText(t: Catalogue, letter: Letter, path: string, why: string): string {
  const base = chest.teamUrl;
  const link = base ? new URL(path, base).toString() : null;
  return [...letter.lines, "", link ? format(t.mail.open, { link }) : t.mail.openChest, "", "—", why].join("\n");
}

// email sends each recipient their letter; key(person) makes a retry send
// nothing twice (the Chest keeps a key 24 hours). The key is passed whole:
// the SDK hashes one longer than the Chest keeps (studio.15), so two people
// never share one.
export async function email(people: Recipient[], write: (t: Catalogue) => { letter: Letter; path: string; why: string }, key: (person: Recipient) => string): Promise<Mailed> {
  const sent: string[] = [];
  for (const person of people) {
    if (!person.id.startsWith("mbr_")) continue;
    const t = catalogue(localeOf(person.language));
    const { letter, path, why } = write(t);
    try {
      const done = await mail.send({ to: { member: person.id }, subject: letter.subject.replace(/[\r\n]+/gu, " ").slice(0, 200), text: letterText(t, letter, path, why), key: key(person) });
      if (!done.skipped.includes(person.id)) sent.push(person.id);
    } catch (error) {
      if (error instanceof CapabilityNotGranted) return { sent, stop: "off" };
      if (error instanceof QuotaExceeded) return { sent, stop: "quota" };
      if (error instanceof Unavailable) return { sent, stop: "unavailable" };
      // An address that bounced before, a person the Chest no longer
      // knows: the bell told them.
      if (error instanceof ChestError) continue;
      throw error;
    }
  }
  return { sent, stop: null };
}

// mailNow: whether the Chest would send email now (mail.available(),
// studio.16), for a dialog that says before acting whether people are
// told "in the bell and by email" or in the bell only: not when the Chest
// has no mail, its owner has not connected it, it paused sending or the
// day's emails are used. A snapshot: a send can still fail. When the Chest
// does not answer, email is assumed, as before.
export async function mailNow(): Promise<boolean> {
  try {
    return (await mail.available()).ok;
  } catch (error) {
    if (!(error instanceof Unavailable)) throw error;
    return true;
  }
}
