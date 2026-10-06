import { chest } from "@argentic/chest-sdk/chest";
import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import type { Locale } from "@argentic/chest-sdk/member";
import * as mail from "@argentic/chest-sdk/mail";
import type { Sql } from "./db.ts";
import { catalogue, format, formatDate, plural } from "../i18n/index.ts";
import { answerText, type Answers } from "../shared/logic.ts";
import type { Definition } from "../shared/model.ts";
import { people } from "./people.ts";
import { putSetting } from "./settings.ts";
import { teamOrigin } from "./public-origin.ts";

// New answers by email (Proposal (studio): mail), for the people told of a
// form's answers when its "also by email" is on. Sent in the bell's own
// batches (lib/tell.ts): at most one email per form and person every ten
// minutes, holding every answer since the last one — the answer itself,
// question by question, so a contact request is read in the inbox and
// answered with Reply (to the respondent's address when the batch holds one
// answer that gave one). An anonymous form's email says only how many came.
export const perEmail = 10;

type Pending = { id: string; version: number; email: string | null; data: Answers; created_at: Date };

export type Batch = { formId: string; title: string; anonymous: boolean; answers: { at: string; email: string | null; lines: { question: string; answer: string }[] }[]; more: number; replyTo: string | null };

// batch: the answers a form's email carries now, and the time up to which
// they go (mailed_at after sending).
export async function batch(sql: Sql, formId: string, language: Locale = "en"): Promise<{ batch: Batch; until: Date; ids: string[] } | null> {
  const [form] = await sql<{ title: string; anonymous: boolean; notify_email: boolean }[]>`
    select draft->>'title' as title, anonymous, notify_email from forms where id = ${formId} and deleted_at is null`;
  if (!form || !form.notify_email) return null;
  // An anonymous answer keeps no time finer than its month: the email says
  // how many came, as the bell does, never what.
  if (form.anonymous) return { batch: { formId, title: form.title, anonymous: true, answers: [], more: 0, replyTo: null }, until: new Date(), ids: [] };
  // The first batch of a form holds its last day of answers at most. The
  // comparison stays in the database (its stamps are finer than a date's).
  const fresh = await sql<Pending[]>`
    select id, version, email, data, created_at from answers
    where form_id = ${formId} and deleted_at is null
      and created_at > (select coalesce(mailed_at, now() - interval '1 day') from forms where id = ${formId})
    order by created_at asc limit 200`;
  if (fresh.length === 0) return null;
  const defs = new Map<number, Definition>();
  for (const v of new Set(fresh.map(a => a.version))) {
    const [row] = await sql<{ definition: Definition }[]>`select definition from versions where form_id = ${formId} and version = ${v}`;
    if (row) defs.set(v, row.definition);
  }
  const t = catalogue(language);
  const words = { yes: t.respond.yes, no: t.respond.no, other: t.respond.other };
  const shown = fresh.slice(-perEmail);
  const answers = shown.map(a => ({
    at: a.created_at.toISOString(),
    email: a.email,
    lines: (defs.get(a.version)?.pages.flatMap(p => p.questions) ?? []).filter(q => q.kind !== "statement" && a.data[q.id] !== undefined).map(q => ({ question: q.title, answer: answerText(q, a.data[q.id], words) })),
  }));
  const emails = fresh.map(a => a.email).filter(Boolean);
  return {
    batch: { formId, title: form.title, anonymous: false, answers, more: fresh.length - shown.length, replyTo: fresh.length === 1 && emails.length === 1 ? emails[0]! : null },
    until: fresh.at(-1)!.created_at,
    ids: fresh.map(a => a.id),
  };
}

// alertText: the email's words, in the reader's language (tested alone).
export function alertText(b: Batch, count: number, language: Locale, link: string | null, zone: string): { subject: string; text: string } {
  const t = catalogue(language);
  const form = b.title || t.builder.untitled;
  const subject = plural(t.bell.answers, count, language, { form });
  const lines: string[] = [plural(t.alerts.intro, count, language, { form }), ""];
  if (b.anonymous) lines.push(t.alerts.anonymous, "");
  for (const a of b.answers) {
    lines.push(`— ${formatDate(a.at, language, zone, { dateStyle: "medium", timeStyle: "short" })}${a.email ? ` · ${a.email}` : ""}`);
    for (const l of a.lines) lines.push(l.question, "  " + l.answer.replace(/\n/gu, "\n  "));
    lines.push("");
  }
  if (b.more > 0) lines.push(plural(t.alerts.more, b.more, language), "");
  if (link) lines.push(format(t.alerts.open, { link }), "");
  if (b.replyTo) lines.push(t.alerts.reply, "");
  lines.push(t.alerts.foot);
  return { subject, text: lines.join("\n") };
}

// send: one email per watcher (the member's own address, which the tool
// never learns), each in their language. A Chest without mail sends
// nothing: the bell still tells, and Settings says emails wait for it.
export async function send(sql: Sql, formId: string, recipients: { member: string; count: number }[]): Promise<number> {
  if (recipients.length === 0) return 0;
  const names = await people(recipients.map(r => r.member));
  const zone = chest.timeZone;
  const base = teamOrigin();
  const link = base ? `${base}/chest/forms/${formId}/answers` : null;
  let sent = 0;
  let ids: string[] = [];
  const made = new Map<Locale, Awaited<ReturnType<typeof batch>>>();
  for (const r of recipients) {
    const person = names.get(r.member);
    if (!person || person.status !== "member") continue;
    if (!made.has(person.locale)) made.set(person.locale, await batch(sql, formId, person.locale));
    const found = made.get(person.locale);
    if (!found) continue;
    ids = found.ids;
    const { subject, text } = alertText(found.batch, found.batch.anonymous ? r.count : Math.max(r.count, found.batch.answers.length + found.batch.more), person.locale, link, zone);
    try {
      await mail.send({ to: { member: r.member }, subject, text, ...(found.batch.replyTo ? { replyTo: found.batch.replyTo } : {}), key: `answers:${formId}:${r.member}:${found.until.getTime()}` });
      sent++;
      await putSetting(sql, "mail_works", true);
    } catch (error) {
      if (error instanceof CapabilityNotGranted) {
        await putSetting(sql, "mail_works", false);
        break;
      }
      if (!(error instanceof ChestError)) throw error;
    }
  }
  // Up to the last answer carried, as the database stamped it (to the
  // microsecond, which a JavaScript date would round down).
  if (ids.length) await sql`update forms set mailed_at = greatest(mailed_at, (select max(created_at) from answers where id = any(${ids}))) where id = ${formId}`;
  return sent;
}
