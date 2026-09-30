import * as chest from "@argentic/chest-sdk/chest";
import { CapabilityNotGranted, ChestError, QuotaExceeded, Unavailable } from "@argentic/chest-sdk/errors";
import type { Locale } from "@argentic/chest-sdk/member";
import * as mail from "@argentic/chest-sdk/mail";
import type { Sql } from "./db.ts";
import { catalogue, format, type Catalogue } from "./i18n/index.ts";
import { learn } from "./state.ts";

// Email beside the bell (Proposal (studio): "mail": {"send": true}). The
// bell reaches only people who open their Chest; an Important post, its
// reminders and the weekly digest also go by email — one message per
// person (nobody sees who else got it), in their language, sent by the
// Chest to their address: News never knows it. On a Chest that cannot send
// email yet nothing fails: the bell has told them, and News remembers it
// (lib/state.ts) so the composer says so.

export type Letter = { subject: string; lines: string[] };
export type Recipient = { id: string; locale: Locale };
// sent: the people it went to; stop: why the rest was not sent — the day's
// quota, a Chest without email, or a Chest that did not answer (try again).
export type Mailed = { sent: string[]; stop: "quota" | "off" | "unavailable" | null };

// link is a page of News as an address outside the Chest (null when the
// Chest does not give the tool's address).
export function link(path: string): string | null {
  const base = chest.teamUrl();
  return base ? new URL(path, base).toString() : null;
}

// letterText writes the body: the letter, the link to open it, and why
// this email came.
export function letterText(t: Catalogue, letter: Letter, path: string, why: string): string {
  const address = link(path);
  return [...letter.lines, "", address ? format(t.mail.open, { link: address }) : t.mail.openChest, "", "—", why].join("\n");
}

// email sends each recipient their letter; key(person) makes a retry send
// nothing twice (the Chest keeps a key 24 hours; the SDK sends a long one
// as its SHA-256, so it is never cut). The Chest applies each person's
// email preference (member.mailPreference, Proposal (studio.15)): who chose
// none is skipped — not counted as sent; who chose one email a day gets it
// in the Chest's daily email — counted. Nothing News sends is
// transactional: an announcement, its reminders and the digest are all
// things a person may choose to read in their Chest instead.
export async function email(sql: Sql, people: Recipient[], write: (t: Catalogue, person: Recipient) => { letter: Letter; path: string; why: string }, key: (person: Recipient) => string): Promise<Mailed> {
  const sent: string[] = [];
  for (const person of people) {
    const t = catalogue(person.locale);
    const { letter, path, why } = write(t, person);
    try {
      const result = await mail.send({ to: { member: person.id }, subject: letter.subject.replace(/[\r\n]+/gu, " ").slice(0, 200), text: letterText(t, letter, path, why), key: key(person) });
      if (!result.skipped.includes(person.id)) sent.push(person.id);
    } catch (error) {
      if (error instanceof CapabilityNotGranted) {
        await learn(sql, "mail", "off");
        return { sent, stop: "off" };
      }
      if (error instanceof QuotaExceeded) return { sent, stop: "quota" };
      if (error instanceof Unavailable) return { sent, stop: "unavailable" };
      // An address that bounced before, a person the Chest no longer knows:
      // the bell told them.
      if (error instanceof ChestError) continue;
      throw error;
    }
  }
  if (sent.length > 0) await learn(sql, "mail", "on");
  return { sent, stop: null };
}
