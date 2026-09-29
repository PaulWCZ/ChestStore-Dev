import * as chest from "@argentic/chest-sdk/chest";
import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import type { Locale, Member } from "@argentic/chest-sdk/member";
import * as mail from "@argentic/chest-sdk/mail";
import { roleOf } from "./access.ts";
import type { Sql } from "./db.ts";
import { AppError } from "./errors.ts";
import { catalogue, format, type Catalogue } from "./i18n/index.ts";
import { people } from "./people.ts";

// Email beside the bell (Proposal (studio): the "mail" capability,
// chest.proposals.json). Whoever is given a card or a step, is mentioned,
// or has something due that morning also gets an email, in their language,
// sent by the Chest to their address — the tool never knows it. One switch
// per person turns it off (on by default: the bell is only seen inside the
// Chest). On a Chest without mail yet, nothing is sent and nothing fails:
// the bell still says it.

export async function emailOn(sql: Sql, actor: Member | null): Promise<boolean> {
  if (!actor || roleOf(actor) === null) throw new AppError("forbidden");
  const [row] = await sql<{ email_off: boolean }[]>`select email_off from reminders where member_id = ${actor.id}`;
  return !row?.email_off;
}

export async function setEmail(sql: Sql, actor: Member | null, on: unknown): Promise<void> {
  if (!actor || roleOf(actor) === null) throw new AppError("forbidden");
  if (typeof on !== "boolean") throw new AppError("invalid");
  await sql`insert into reminders (member_id, email_off) values (${actor.id}, ${!on}) on conflict (member_id) do update set email_off = excluded.email_off`;
}

// The people of this list who want email.
async function wanting(sql: Sql, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const off = new Set((await sql<{ member_id: string }[]>`select member_id from reminders where member_id in ${sql(ids)} and email_off`).map(r => r.member_id));
  return ids.filter(i => !off.has(i));
}

export type Letter = { subject: string; lines: string[] };

// letterText writes the body: what happened, the link to open it (when the
// Chest gives the tool's address), and why this email came.
export function letterText(t: Catalogue, letter: Letter, path: string, base: string | null): string {
  const link = base ? new URL(path, base).toString() : null;
  return [...letter.lines, ...(link ? ["", format(t.mail.open, { link })] : []), "", "—", t.mail.why].join("\n");
}

// email sends each recipient their letter, in their language; the key
// (with the recipient) makes a retry send nothing twice. Says how many
// were sent (0 on a Chest without mail).
export async function email(sql: Sql, recipients: Iterable<string>, letter: (t: Catalogue, locale: Locale) => Letter, options: { path: string; key: string }): Promise<number> {
  const ids = await wanting(sql, [...new Set(recipients)].filter(r => r.startsWith("mbr_")));
  if (ids.length === 0) return 0;
  const base = chest.teamUrl();
  let sent = 0;
  for (const person of (await people(ids)).values()) {
    if (person.status !== "member") continue;
    const t = catalogue(person.locale);
    const written = letter(t, person.locale);
    try {
      await mail.send({ to: { member: person.id }, subject: written.subject.replace(/[\r\n]+/gu, " ").slice(0, 200), text: letterText(t, written, options.path, base), key: `${options.key}:${person.id}`.slice(0, 64) });
      sent++;
    } catch (error) {
      // Not granted yet, the day's quota, an address that bounced: the bell
      // already told them.
      if (error instanceof CapabilityNotGranted) return sent;
      if (error instanceof ChestError) continue;
      throw error;
    }
  }
  return sent;
}
