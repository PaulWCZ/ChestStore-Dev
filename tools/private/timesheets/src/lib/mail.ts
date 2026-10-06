import { chest } from "@argentic/chest-sdk/chest";
import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import type { Locale } from "@argentic/chest-sdk/member";
import * as mail from "@argentic/chest-sdk/mail";
import { catalogue, format, type Catalogue } from "../i18n/index.ts";
import { people } from "./people.ts";

// Email beside the bell (Proposal (studio): the "mail" capability,
// chest.proposals.json). Only what asks someone to act leaves by email —
// a week to fill in (a manager's Remind, the Friday reminder), a week sent
// to them to approve — because someone who never opens the Chest never
// sees the bell. Sent by the Chest to the member's address (the
// tool never knows it), in their language, with a link to the page. On a
// Chest without mail yet nothing is sent and nothing fails: the bell still
// says it.
//
// None is transactional: each asks someone to act, so the choice the person
// made once in the Chest (mail.preference: all, one a day, none) always
// holds — mail.send applies it ("held" is not an error).

// The team host's address, for the link in the email; null outside a Chest
// (chest.tool throws there): the email then says no link.
function teamUrl(): string | null {
  try {
    return chest.tool.teamUrl;
  } catch (error) {
    if (error instanceof ChestError) return null;
    throw error;
  }
}

export type Letter = { subject: string; lines: string[] };

// letterText writes the body: what it is, the link (when the Chest gives
// the tool's address), and why this email came.
export function letterText(t: Catalogue, letter: Letter, path: string, base: string | null): string {
  const link = base ? new URL(path, base).toString() : null;
  return [...letter.lines, ...(link ? ["", format(t.mail.open, { link })] : []), "", "—", t.mail.why].join("\n");
}

// email sends each recipient their letter, in their language; the key (with
// the recipient, whole: the SDK sends a long one as its digest) makes the
// same email within a day send nothing again.
// Says how many left (0 on a Chest without mail).
export async function email(recipients: Iterable<string>, letter: (t: Catalogue, locale: Locale) => Letter | null, options: { path: string; key: string }): Promise<number> {
  const ids = [...new Set(recipients)].filter(r => r.startsWith("mbr_"));
  if (ids.length === 0) return 0;
  const base = teamUrl();
  let sent = 0;
  for (const person of (await people(ids)).values()) {
    if (person.status !== "member") continue;
    const t = catalogue(person.locale);
    const written = letter(t, person.locale);
    if (!written) continue;
    try {
      await mail.send({ to: { member: person.id }, subject: written.subject.replace(/[\r\n]+/gu, " ").slice(0, 200), text: letterText(t, written, options.path, base), key: `${options.key}:${person.id}` });
      sent++;
    } catch (error) {
      // Not granted (a Chest without mail yet): nothing more can leave.
      // The day's quota, an address that bounced: the bell already said it.
      if (error instanceof CapabilityNotGranted) return sent;
      if (!(error instanceof ChestError)) throw error;
    }
  }
  return sent;
}
