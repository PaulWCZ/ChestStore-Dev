import { chest } from "@argentic/chest-sdk/chest";
import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import type { Locale } from "@argentic/chest-sdk/member";
import * as mail from "@argentic/chest-sdk/mail";
import { catalogue, format, type Catalogue } from "../i18n/index.ts";
import { people } from "./people.ts";

// Email beside the bell (Proposal (studio): the "mail" capability,
// chest.proposals.json). Only what asks someone to act leaves by email —
// expenses sent to them to approve, a company card payment waiting for its
// receipt, the month-end reminder — because an approver who never opens
// the Chest never approves. Sent by the Chest to the member's address (the
// tool never knows it), in their language, with a link to the page. On a
// Chest without mail yet nothing is sent and nothing fails: the bell still
// says it.

export type Letter = { subject: string; lines: string[] };

// letterText writes the body: what it is, the link (when the Chest gives
// the tool's address), and why this email came.
export function letterText(t: Catalogue, letter: Letter, path: string, base: string | null): string {
  const link = base ? new URL(path, base).toString() : null;
  return [...letter.lines, ...(link ? ["", format(t.mail.open, { link })] : []), "", "—", t.mail.why].join("\n");
}

// The team host's address, to link to a page; null outside a Chest (the
// email then says no link).
function teamUrl(): string | null {
  try {
    return chest.tool.teamUrl;
  } catch {
    return null;
  }
}

// email sends each recipient their letter, in their language; the key (with
// the recipient) makes the same email within a day send nothing again.
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
