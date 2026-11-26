import { ChestError } from "@argentic/chest-sdk/errors";
import * as mail from "@argentic/chest-sdk/mail";
import { activity, touch } from "./candidates.ts";
import type { Sql } from "./db.ts";
import { flushCalendars } from "./interviews.ts";
import { settings } from "./jobs.ts";
import * as mailer from "./mailer.ts";
import { people } from "./people.ts";
import * as tell from "./tell.ts";

// The outbox: emails to candidates wait in the messages table until due,
// then leave through the Chest's mail. A rejection waits until its Undo is
// over (messages.undoSeconds): Undo cancels it before anything left —
// never "Undo" after an email is gone. The tool has no background
// process: the outbox is flushed after each action, on each team page
// (and its 30-second refresh), and by the "outbox" schedule every 15
// minutes (Proposal (studio)) for when nobody has the tool open.
//
// Two instances may flush at once: a message is claimed by pushing its
// time five minutes ahead (for update skip locked), and sent with the key
// message:<id>:<address>, so the Chest sends it once even when sent twice.
// The key is whole (SDK studio.15 hashes a long one, never cut) and names
// its recipient: the Chest refuses a key reused for other recipients
// (key_conflict), which an id alone could be after a restored database or
// a corrected address.

type Due = {
  id: string; candidate_id: string; kind: string; author: string | null; subject: string; body: string; calendar: string | null; attachments: { file: string; name: string }[] | null;
  email: string; language: string; title: string; status: string;
};

export async function flush(sql: Sql, limit = 20): Promise<number> {
  const due = await sql.begin(async tx => tx<Due[]>`
    update messages m set send_after = now() + interval '5 minutes'
    from candidates c, jobs j
    where m.id in (select id from messages where status = 'waiting' and send_after <= now() order by send_after, id limit ${limit} for update skip locked)
      and c.id = m.candidate_id and j.id = c.job_id
    returning m.id, m.candidate_id, m.kind, m.author, m.subject, m.body, m.calendar, m.attachments, c.email, c.language, j.title, c.status`);
  let sent = 0;
  if (due.length > 0) {
    const s = await settings(sql);
    const who = await people(due.map(d => d.author ?? "").filter(Boolean));
    for (const d of due) {
      const sender = (d.author ? who.get(d.author)?.name : "") || "";
      const result = await mailer.send({
        to: d.email,
        subject: d.subject,
        text: d.body,
        language: d.language,
        company: s.companyName,
        ...(sender || s.companyName ? { fromName: sender ? mailer.fromName(sender, s.companyName) : s.companyName } : {}),
        key: `message:${d.id}:${d.email.toLowerCase()}`,
        // The invitation's calendar file, and the files the recruiter sent
        // (the tool's own files: the Chest reads them itself).
        attachments: [
          ...(d.calendar ? [{ name: d.kind === "interview_cancelled" ? "cancelled.ics" : "invitation.ics", type: `text/calendar; charset=utf-8; method=${d.kind === "interview_cancelled" ? "CANCEL" : "PUBLISH"}`, content: d.calendar }] : []),
          ...(Array.isArray(d.attachments) ? d.attachments.filter(a => typeof a.file === "string").map(a => ({ file: a.file, name: a.name })) : []),
        ],
      });
      if (result.delivery === "later") {
        await sql`update messages set send_after = now() + interval '2 minutes' where id = ${d.id} and status = 'waiting'`;
        continue;
      }
      await sql.begin(async tx => {
        const done = await tx`
          update messages set status = ${result.delivery === "email" ? "sent" : "none"}, sent_at = now(), mail_id = ${result.id ?? null}
          where id = ${d.id} and status = 'waiting'`;
        if (done.count === 0) return;
        if (result.id) await tx`insert into mail_checks (mail_id) values (${result.id}) on conflict do nothing`;
        if (result.delivery === "email") {
          // A link to choose a time has its own line already ("sent a link
          // to choose…"): one action, one line.
          if (d.kind !== "interview_request") await activity(tx, String(d.candidate_id), d.author, d.kind === "rejection" || d.kind === "confirmation" ? "emailed" : "wrote", { kind: d.kind, message: String(d.id) });
          await touch(tx, String(d.candidate_id));
          sent++;
        }
      });
    }
  }
  await flushCalendars(sql);
  return sent;
}

// sendNow sends one message at once (a recruiter pressed Send): says what
// became of it.
export async function sendNow(sql: Sql, messageId: string): Promise<"sent" | "none" | "waiting"> {
  await flush(sql);
  const [row] = await sql<{ status: string }[]>`select status from messages where id = ${messageId}`;
  return row?.status === "sent" ? "sent" : row?.status === "none" ? "none" : "waiting";
}

// checkSent asks the Chest whether the emails sent lately arrived: it
// posts nothing to the tool (no inbound mail, bounces included), and
// mail.status(id) is the only way to learn that an address is wrong. Run by
// the "outbox" schedule: each email still on its way is asked about less
// and less often as it ages (a quarter of its age, ten minutes apart at
// least; three days at most), 200 at most a run. bounced, complained or
// failed: the conversation says "Not delivered" and the recruiters hear of
// it in the bell, to correct the address.
const failed = new Set(["bounced", "complained", "failed"]);
export async function checkSent(sql: Sql, now = new Date()): Promise<{ asked: number; bounced: number }> {
  const due = await sql<{ mail_id: string }[]>`
    select mail_id from mail_checks
    where not done and sent_at > ${new Date(now.getTime() - 3 * 86_400_000)}
      and (checked_at is null or ${now}::timestamptz - checked_at > greatest(interval '10 minutes', (${now}::timestamptz - sent_at) / 4))
    order by sent_at limit 200`;
  let bounced = 0;
  for (const { mail_id: id } of due) {
    let status: mail.Status | null;
    try {
      status = await mail.status(id);
    } catch (error) {
      if (error instanceof ChestError) break;
      throw error;
    }
    const settled = status === null || status.status === "delivered" || failed.has(status.status);
    await sql`update mail_checks set checked_at = ${now}, done = ${settled} where mail_id = ${id}`;
    if (!status || !failed.has(status.status)) continue;
    const [row] = await sql<{ candidate_id: string | null }[]>`update messages set status = 'bounced' where mail_id = ${id} and direction = 'out' and status = 'sent' returning candidate_id`;
    if (!row?.candidate_id) continue;
    bounced++;
    const [c] = await sql<{ name: string }[]>`select name from candidates where id = ${row.candidate_id}`;
    if (c) await tell.bounced({ id: String(row.candidate_id), name: c.name });
  }
  await sql`delete from mail_checks where sent_at < ${new Date(now.getTime() - 7 * 86_400_000)}`;
  return { asked: due.length, bounced };
}
