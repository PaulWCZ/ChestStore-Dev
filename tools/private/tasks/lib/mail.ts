import * as chest from "@argentic/chest-sdk/chest";
import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import type { Locale, Member } from "@argentic/chest-sdk/member";
import * as mail from "@argentic/chest-sdk/mail";
import { roleOf } from "./access.ts";
import { purgeComments } from "./cards.ts";
import type { Query, Sql } from "./db.ts";
import { AppError } from "./errors.ts";
import { catalogue, format, intl, plural, type Catalogue } from "./i18n/index.ts";
import { nameOf, people } from "./people.ts";

// Email beside the bell (Proposal (studio): the "mail" capability,
// chest.proposals.json). Whoever is given a card or a step, is mentioned,
// or has something due that morning also gets an email, in their language,
// sent by the Chest to their address — the tool never knows it. One switch
// per person turns it off (on by default: the bell is only seen inside the
// Chest). On a Chest without mail yet, nothing is sent and nothing fails:
// the bell still says it.
//
// A card given, a step and a mention do not leave at once: they wait in
// mail_queue until the person has had nothing new for a minute (ten at
// most), then leave as ONE email — "Hugo Bernard: 1 task given to you,
// 1 step and 1 mention". What the email names is read again as it leaves:
// a card no longer theirs, a step ticked or taken back, is left out; a
// comment deleted meanwhile is never sent (held while its Undo lasts, gone
// with it). Nothing runs in the background: the queue is sent after each
// action and page of the tool (flushSoon), and by the "mail" schedule
// every quarter of an hour, for the quiet hours.

// How long a person's emails wait for more from the same moment, and at
// most.
export const quietSeconds = 60;
export const holdMinutes = 10;

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
async function wanting(sql: Query, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const off = new Set((await sql<{ member_id: string }[]>`select member_id from reminders where member_id in ${sql(ids)} and email_off`).map(r => r.member_id));
  return ids.filter(i => !off.has(i));
}

export type Letter = { subject: string; lines: string[] };

// letterText writes the body: what happened, the link to open it (when the
// Chest gives the tool's address), and why this email came.
export function letterText(t: Catalogue, letter: Letter, path: string | null, base: string | null): string {
  const link = base && path ? new URL(path, base).toString() : null;
  return [...letter.lines, ...(link ? ["", format(t.mail.open, { link })] : []), "", "—", t.mail.why].join("\n");
}

// email sends each recipient their letter now, in their language; the key
// (with the recipient) makes a retry send nothing twice. Says how many
// were sent (0 on a Chest without mail). The morning's reminder uses it;
// what people do to each other goes through queue().
export async function email(sql: Sql, recipients: Iterable<string>, letter: (t: Catalogue, locale: Locale) => Letter, options: { path: string; key: string }): Promise<number> {
  const ids = await wanting(sql, [...new Set(recipients)].filter(r => r.startsWith("mbr_")));
  if (ids.length === 0) return 0;
  const base = chest.teamUrl();
  let sent = 0;
  for (const person of (await people(ids)).values()) {
    if (person.status !== "member") continue;
    const t = catalogue(person.locale);
    const written = letter(t, person.locale);
    const result = await send(person.id, written.subject, letterText(t, written, options.path, base), `${options.key}:${person.id}`);
    if (result === "off") return sent;
    if (result === "sent") sent++;
  }
  return sent;
}

async function send(member: string, subject: string, text: string, key: string): Promise<"sent" | "skipped" | "off"> {
  try {
    await mail.send({ to: { member }, subject: subject.replace(/[\r\n]+/gu, " ").slice(0, 200), text, key: key.slice(0, 64) });
    return "sent";
  } catch (error) {
    // Not granted yet: nothing more can leave. The day's quota, an address
    // that bounced: the bell already told them.
    if (error instanceof CapabilityNotGranted) return "off";
    if (error instanceof ChestError) return "skipped";
    throw error;
  }
}

// What waits to be emailed: a card given, a step given (subtask), a
// mention in a comment.
export type Queued = { kind: "assigned" | "step" | "mention"; actor: string; cardId: string; stepId?: string; commentId?: string };

export async function queue(sql: Sql, recipients: Iterable<string>, item: Queued): Promise<void> {
  const ids = [...new Set(recipients)].filter(r => r.startsWith("mbr_") && r !== item.actor);
  if (ids.length === 0) return;
  await sql`insert into mail_queue ${sql(ids.map(member_id => ({ member_id, kind: item.kind, actor: item.actor, card_id: item.cardId, step_id: item.stepId ?? null, comment_id: item.commentId ?? null })), "member_id", "kind", "actor", "card_id", "step_id", "comment_id")}
    on conflict do nothing`;
}

type Row = { id: string; member_id: string; kind: Queued["kind"]; actor: string; card_id: string; card_title: string; board_id: string; step_text: string | null; body: string | null; held: boolean; live: boolean; created_at: Date };

// flushMail sends what waited long enough: per person, once a minute
// passed since their last item (or ten since their first). Says how many
// emails left. Safe to run twice at once: rows being sent are locked.
export async function flushMail(sql: Sql, now: Date = new Date()): Promise<number> {
  // A comment deleted more than its Undo ago goes for good, and its
  // mention with it (mail_queue follows comments).
  await purgeComments(sql);
  const waiting = await sql<{ member_id: string }[]>`
    select member_id from mail_queue group by member_id
    having max(created_at) <= ${new Date(now.getTime() - quietSeconds * 1000)} or min(created_at) <= ${new Date(now.getTime() - holdMinutes * 60_000)}`;
  let sent = 0;
  for (const { member_id: member } of waiting) {
    const outcome = await sql.begin(async tx => {
      const rows = await tx<Row[]>`
        select q.id, q.member_id, q.kind, q.actor, q.card_id, c.title as card_title, c.board_id, i.text as step_text, m.body, q.created_at,
          (m.removed_at is not null) as held,
          (case q.kind
            when 'assigned' then exists (select 1 from card_assignees a where a.card_id = q.card_id and a.member_id = q.member_id) and c.archived_at is null and not k.done
            when 'step' then coalesce(i.assignee = q.member_id and not i.done, false) and c.archived_at is null and not k.done
            else m.id is not null end) as live
        from mail_queue q join cards c on c.id = q.card_id join columns k on k.id = c.column_id
          left join checklist_items i on i.id = q.step_id left join comments m on m.id = q.comment_id
        where q.member_id = ${member}
        order by q.created_at, q.id
        for update of q skip locked`;
      // A mention whose comment is deleted (its Undo still open) waits.
      const going = rows.filter(r => !r.held);
      if (going.length === 0) return 0;
      await tx`delete from mail_queue where id in ${tx(going.map(r => r.id))}`;
      const live = going.filter(r => r.live);
      if (live.length === 0 || (await wanting(tx, [member])).length === 0) return 0;
      const who = await people([member, ...live.map(r => r.actor)]);
      const person = who.get(member);
      if (!person || person.status !== "member") return 0;
      const t = catalogue(person.locale);
      const written = letterOf(t, person.locale, live, id => nameOf(who.get(id), person.locale));
      const result = await send(member, written.subject, written.text, `q:${live[0]!.id}:${member}`);
      return result === "sent" ? 1 : 0;
    });
    sent += outcome;
  }
  return sent;
}

const cardPath = (boardId: string, cardId: string) => `/chest/boards/${boardId}?card=${cardId}`;

// letterOf writes one person's email: one thing as it always was, several
// as one letter — who, how many of each, then each with its link.
export function letterOf(t: Catalogue, locale: Locale, rows: Pick<Row, "kind" | "actor" | "card_id" | "card_title" | "board_id" | "step_text" | "body">[], name: (id: string) => string): { subject: string; text: string } {
  const base = chest.teamUrl();
  const cut = (s: string, n: number) => ([...s].length <= n ? s : [...s].slice(0, n - 1).join("") + "…");
  const part = (r: (typeof rows)[number]): Letter => {
    const who = name(r.actor);
    if (r.kind === "assigned") return { subject: format(t.mail.assigned, { name: who, card: cut(r.card_title, 80) }), lines: [format(t.mail.assignedLine, { name: who }), "", r.card_title] };
    if (r.kind === "step") return { subject: format(t.mail.stepAssigned, { name: who, card: cut(r.card_title, 80) }), lines: [format(t.mail.stepLine, { name: who, card: r.card_title }), "", r.step_text ?? ""] };
    return { subject: format(t.bell.mentioned, { name: who, card: cut(r.card_title, 80) }), lines: [format(t.mail.mentionLine, { name: who, card: r.card_title }), "", r.body ?? ""] };
  };
  if (rows.length === 1) {
    const only = rows[0]!;
    const letter = part(only);
    return { subject: letter.subject, text: letterText(t, letter, cardPath(only.board_id, only.card_id), base) };
  }
  const list = (items: string[]) => new Intl.ListFormat(intl(locale), { type: "conjunction" }).format(items);
  const count = (kind: Queued["kind"]) => rows.filter(r => r.kind === kind).length;
  const things = [
    ...(count("assigned") > 0 ? [plural(t.mail.digest.tasks, count("assigned"), locale)] : []),
    ...(count("step") > 0 ? [plural(t.mail.digest.steps, count("step"), locale)] : []),
    ...(count("mention") > 0 ? [plural(t.mail.digest.mentions, count("mention"), locale)] : []),
  ];
  const subject = format(t.mail.digest.subject, { names: list([...new Set(rows.map(r => name(r.actor)))]), things: list(things) });
  const lines: string[] = [];
  for (const r of rows) {
    const letter = part(r);
    const link = base ? new URL(cardPath(r.board_id, r.card_id), base).toString() : null;
    lines.push(...letter.lines, ...(link ? [format(t.mail.open, { link })] : []), "", "");
  }
  return { subject, text: [...lines.slice(0, -1), "—", t.mail.why].join("\n") };
}
