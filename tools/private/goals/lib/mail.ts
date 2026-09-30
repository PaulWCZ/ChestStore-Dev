import { chest } from "@argentic/chest-sdk/chest";
import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import type { Locale, Member } from "@argentic/chest-sdk/member";
import * as mail from "@argentic/chest-sdk/mail";
import * as members from "@argentic/chest-sdk/members";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { catalogue, format, type Catalogue } from "./i18n/index.ts";
import { people } from "./people.ts";

// Email beside the bell (Proposal (studio): the "mail" capability,
// chest.proposals.json): the Friday reminder and a manager's "Remind" also
// reach people by email, in their language, sent by the Chest to their
// address — the tool never knows it. One switch per person turns it off
// (on by default: the bell is only seen inside the Chest). Above it, the
// person's choice in the Chest for every tool (`mailPreference`,
// studio.15): mail.send applies it — "none" sends nothing, "digest" waits
// for the Chest's one email a day — and My goals says so under the switch.
// Reminders are never transactional. On a Chest without mail yet, nothing
// is sent and nothing fails: the bell says it.

// mailState: whether the Chest would send an email now (Proposal
// (studio.16): mail.available(), asked without sending) — "off" when it
// cannot (mail not granted, the company's mail not connected, sending
// suspended): My goals then says reminders stay in the bell rather than
// offering email. The day's quota used comes back tomorrow: "on". A Chest
// that does not answer: "unknown", never read as "off".
export type MailState = "on" | "off" | "unknown";

// The person's choice in the Chest for every tool's email (studio.15):
// the members API says it — never the assertion member(request) reads —
// and says nothing for "all". "all" too when the Chest cannot be asked:
// My goals then simply says nothing under the switch.
export async function mailPreferenceOf(memberId: string): Promise<NonNullable<Member["mailPreference"]>> {
  try {
    return (await members.get(memberId))?.mailPreference ?? "all";
  } catch (error) {
    if (error instanceof ChestError) return "all";
    throw error;
  }
}
export async function mailState(): Promise<MailState> {
  try {
    const state = await mail.available();
    return state.ok || state.reason === "quota" ? "on" : "off";
  } catch (error) {
    if (error instanceof ChestError) return "unknown";
    throw error;
  }
}

export async function emailOn(sql: Query, actor: Member | null): Promise<boolean> {
  if (!actor || !can(actor, "read")) throw new AppError("forbidden");
  const [row] = await sql<{ email_off: boolean }[]>`select email_off from preferences where member_id = ${actor.id}`;
  return !row?.email_off;
}

export async function setEmail(sql: Sql, actor: Member | null, on: unknown): Promise<void> {
  if (!actor || !can(actor, "read")) throw new AppError("forbidden");
  if (typeof on !== "boolean") throw new AppError("invalid");
  await sql`insert into preferences (member_id, email_off) values (${actor.id}, ${!on}) on conflict (member_id) do update set email_off = excluded.email_off, updated_at = now()`;
}

async function wanting(sql: Query, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const off = new Set((await sql<{ member_id: string }[]>`select member_id from preferences where member_id in ${sql(ids)} and email_off`).map(r => r.member_id));
  return ids.filter(i => !off.has(i));
}

export type Letter = { subject: string; lines: string[] };

// letterText writes the body: what it is about, the link to open Goals
// (when the Chest gives the tool's address), and why this email came.
export function letterText(t: Catalogue, letter: Letter, path: string, base: string | null): string {
  const link = base ? new URL(path, base).toString() : null;
  return [...letter.lines, ...(link ? ["", format(t.mail.open, { link })] : []), "", "—", t.mail.why].join("\n");
}

// email sends each recipient their letter, in their language; the key
// (with the recipient, taken whole: the SDK hashes a long one) makes a
// retry send nothing twice. Says how many went out now (0 on a Chest
// without mail; one the Chest holds for the person's digest, or not at
// all by their choice, is not counted).
export async function email(sql: Query, recipients: Iterable<string>, letter: (t: Catalogue, locale: Locale) => Letter, options: { path: string; key: string }): Promise<number> {
  const ids = await wanting(sql, [...new Set(recipients)].filter(r => r.startsWith("mbr_")));
  if (ids.length === 0) return 0;
  const base = chest.teamUrl;
  let sent = 0;
  for (const person of (await people(ids)).values()) {
    if (person.status !== "member") continue;
    const t = catalogue(person.locale);
    const written = letter(t, person.locale);
    try {
      const result = await mail.send({ to: { member: person.id }, subject: written.subject.replace(/[\r\n]+/gu, " ").slice(0, 200), text: letterText(t, written, options.path, base), key: `${options.key}:${person.id}` });
      if (result.status === "queued") sent++;
    } catch (error) {
      // Not granted yet, the day's quota, an address that bounced: the bell
      // already told them.
      if (error instanceof CapabilityNotGranted) return sent;
      // A key reused for another message is a bug in Goals: heard, not hidden.
      if (error instanceof ChestError && error.code !== "key_conflict") continue;
      throw error;
    }
  }
  return sent;
}
