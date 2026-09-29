import { activity, touch } from "./candidates.ts";
import type { Sql } from "./db.ts";
import { flushCalendars } from "./interviews.ts";
import { settings } from "./jobs.ts";
import * as mailer from "./mailer.ts";
import { people } from "./people.ts";

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
// message:<id>, so the Chest sends it once even when sent twice.

type Due = {
  id: string; candidate_id: string; kind: string; author: string | null; subject: string; body: string; calendar: string | null; attachments: { file: string; name: string }[] | null;
  email: string; language: string; title: string; status: string; reply_to: string | null;
};

export async function flush(sql: Sql, limit = 20): Promise<number> {
  const due = await sql.begin(async tx => tx<Due[]>`
    update messages m set send_after = now() + interval '5 minutes'
    from candidates c, jobs j
    where m.id in (select id from messages where status = 'waiting' and send_after <= now() order by send_after, id limit ${limit} for update skip locked)
      and c.id = m.candidate_id and j.id = c.job_id
    returning m.id, m.candidate_id, m.kind, m.author, m.subject, m.body, m.calendar, m.attachments, c.email, c.language, j.title, c.status,
      (select r.message_id from messages r where r.candidate_id = m.candidate_id and r.direction = 'in' and r.message_id is not null order by r.created_at desc limit 1) as reply_to`);
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
        candidateId: String(d.candidate_id),
        fromName: sender ? mailer.fromName(sender, s.companyName) : s.companyName || undefined,
        key: `message:${d.id}`,
        // The invitation's calendar file, and the files the recruiter sent
        // (the tool's own files: the Chest reads them itself).
        attachments: [
          ...(d.calendar ? [{ name: d.kind === "interview_cancelled" ? "cancelled.ics" : "invitation.ics", type: `text/calendar; charset=utf-8; method=${d.kind === "interview_cancelled" ? "CANCEL" : "PUBLISH"}`, content: d.calendar }] : []),
          ...(Array.isArray(d.attachments) ? d.attachments.filter(a => typeof a.file === "string").map(a => ({ file: a.file, name: a.name })) : []),
        ],
        // A message answers the candidate's last email: their mail app
        // shows one conversation.
        ...(d.reply_to && d.kind === "message" ? { inReplyTo: d.reply_to, references: [d.reply_to] } : {}),
      });
      if (result.delivery === "later") {
        await sql`update messages set send_after = now() + interval '2 minutes' where id = ${d.id} and status = 'waiting'`;
        continue;
      }
      await sql.begin(async tx => {
        const done = await tx`
          update messages set status = ${result.delivery === "email" ? "sent" : "none"}, sent_at = now(), mail_id = ${result.id ?? null}, message_id = ${result.messageId ?? null}
          where id = ${d.id} and status = 'waiting'`;
        if (done.count === 0) return;
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
