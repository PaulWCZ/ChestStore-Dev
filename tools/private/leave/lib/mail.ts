import * as chest from "@argentic/chest-sdk/chest";
import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import type { Member } from "@argentic/chest-sdk/member";
import * as mail from "@argentic/chest-sdk/mail";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query } from "./db.ts";
import { catalogue, format, type Catalogue, type Locale } from "./i18n/index.ts";
import { people } from "./people.ts";

// Email beside the bell (Proposal (studio): the "mail" capability,
// chest.proposals.json). An approver who never opens the Chest still hears
// of a request ("Hugo Bernard asks for time off", with the link to answer
// it), and the requester of the answer — each in their language, sent by
// the Chest to their address (the tool never knows it). One switch per
// person turns them off (on by default: the bell is only seen inside the
// Chest). On a Chest without mail yet nothing is sent and nothing fails:
// the bell still says it.
export type Letter = { subject: string; lines: string[] };

// Whether this person gets emails (their own switch).
export async function emailOn(sql: Query, actor: Member | null): Promise<boolean> {
  if (!can(actor, "request")) throw new AppError("forbidden");
  const [row] = await sql<{ email_off: boolean }[]>`select email_off from staff where member_id = ${actor!.id}`;
  return !row?.email_off;
}

// What the home says of email next to the switch (studio.16:
// mail.available()), so it never promises an email the Chest would not
// send: "none" — this Chest has no email: no switch at all; "off" — not
// connected by the owner yet, or paused: the switch stays (it is the
// person's choice) with a sentence saying nothing leaves for now; "quota" —
// the day's emails are used: they go again tomorrow; null — ready, or the
// Chest did not answer (unknown is not "off").
export type MailNotice = "none" | "off" | "quota" | null;
export async function mailNotice(): Promise<MailNotice> {
  try {
    const a = await mail.available();
    if (a.ok) return null;
    return a.reason === "not_granted" ? "none" : a.reason === "quota" ? "quota" : "off";
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return null;
  }
}

export async function setEmail(sql: Query, actor: Member | null, on: unknown): Promise<void> {
  if (!can(actor, "request")) throw new AppError("forbidden");
  if (typeof on !== "boolean") throw new AppError("invalid");
  await sql`
    insert into staff (member_id, email_off) values (${actor!.id}, ${!on})
    on conflict (member_id) do update set email_off = excluded.email_off, updated_at = now()`;
}

// letterText writes the body: what happened, the link to open it (when the
// Chest gives the tool's address), and why this email came.
export function letterText(t: Catalogue, letter: Letter, path: string, base: string | null): string {
  const link = base ? new URL(path, base).toString() : null;
  return [...letter.lines, ...(link ? ["", format(t.mail.open, { link })] : []), "", "—", t.mail.why].join("\n");
}

// email sends each recipient their letter now, in their language; the key
// (with the recipient, whole: the SDK sends a long one as its digest) makes
// a retry send nothing twice. Says how many the Chest took (0 on a Chest
// without mail, or when everyone turned it off here).
//
// Two choices apply: the person's switch here (Leave's own emails), and
// the one they made once in the Chest for every tool (member.mailPreference:
// all, one a day, none), which mail.send applies — "held" is not an error.
// transactional: the answer to the person's own request (approved,
// refused, their cancellation settled), which they get whatever they chose
// in the Chest; everything else (a request to answer, leave recorded for
// them) follows their choice.
export async function email(sql: Query, recipients: Iterable<string>, letter: (t: Catalogue, locale: Locale) => Letter, options: { path: string; key: string; transactional?: boolean }): Promise<number> {
  const ids = [...new Set(recipients)].filter(r => r.startsWith("mbr_"));
  if (ids.length === 0) return 0;
  const off = new Set((await sql<{ member_id: string }[]>`select member_id from staff where member_id in ${sql(ids)} and email_off`).map(r => r.member_id));
  const wanted = ids.filter(i => !off.has(i));
  if (wanted.length === 0) return 0;
  const base = chest.teamUrl();
  let sent = 0;
  for (const person of (await people(wanted)).values()) {
    if (person.status !== "member") continue;
    const t = catalogue(person.locale);
    const written = letter(t, person.locale);
    try {
      await mail.send({
        to: { member: person.id },
        subject: written.subject.replace(/[\r\n]+/gu, " ").slice(0, 200),
        text: letterText(t, written, options.path, base),
        key: `${options.key}:${person.id}`,
        ...(options.transactional ? { transactional: true } : {}),
      });
      sent++;
    } catch (error) {
      // Not granted yet: nothing more can leave. The day's quota, an
      // address that bounced: the bell already told them.
      if (error instanceof CapabilityNotGranted) return sent;
      if (!(error instanceof ChestError)) throw error;
    }
  }
  return sent;
}
