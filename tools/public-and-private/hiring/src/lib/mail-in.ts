import type { Bounce, Received } from "@argentic/chest-sdk/mail";
import { activity, touch } from "./candidates.ts";
import type { Sql } from "./db.ts";
import { candidateOfThread, mailbox } from "./mailer.ts";
import * as tell from "./tell.ts";

// What the Chest posts to /chest-mail (Proposal (studio): mail, the jobs
// mailbox): a candidate's answer, lands in their conversation; a bounce
// marks the email that did not arrive.
//
// Which candidate: the thread of the address they answered (jobs+tc42-…@,
// its tag checked by the SDK: nobody can write into a candidate's history
// by guessing it), else the email it answers (In-Reply-To, References,
// against what the tool sent), else — only when the sender's domain
// vouches for it — the most recent application from that address. Anything
// else waits in "Emails to file" for a recruiter. An automatic answer (out
// of office) is kept, tells nobody, and never gets an answer.

const cap = (text: string, max: number) => (text.length > max ? text.slice(0, max) : text);

export async function received(sql: Sql, m: Received): Promise<{ candidate: string | null; created: boolean }> {
  if (m.mailbox !== mailbox) return { candidate: null, created: false };
  const [exists] = await sql<{ candidate_id: string | null }[]>`select candidate_id from messages where received_id = ${m.id}`;
  if (exists) return { candidate: exists.candidate_id === null ? null : String(exists.candidate_id), created: false };
  const candidate = await match(sql, m);
  const attachments = m.attachments.map(a => ({ file: a.file, name: cap(a.name, 200), type: cap(a.type, 100), size: a.size }));
  const inserted = await sql.begin(async tx => {
    const rows = await tx<{ id: string }[]>`
      insert into messages (candidate_id, direction, kind, subject, body, html, from_address, from_name, status, message_id, received_id, in_reply_to, attachments, original, authenticated, created_at)
      values (${candidate}, 'in', 'message', ${cap(m.subject || "", 998)}, ${cap(m.text ?? "", 100000)}, ${m.html ? cap(m.html, 200000) : null}, ${cap(m.from.address, 254)}, ${m.from.name ? cap(m.from.name, 200) : null},
        'received', ${cap(m.messageId, 998)}, ${m.id}, ${m.inReplyTo ? cap(m.inReplyTo, 998) : null}, ${tx.json(attachments as never)}, ${m.original}, ${m.authenticated}, ${new Date(m.receivedAt)})
      on conflict (received_id) do nothing returning id`;
    if (rows.length === 0) return false;
    if (candidate) {
      await activity(tx, candidate, null, "replied", { auto: m.auto });
      // An answer is news: the retention counts from it.
      await touch(tx, candidate);
    }
    return true;
  });
  if (inserted && !m.auto) {
    if (candidate) {
      const [c] = await sql<{ name: string; title: string }[]>`select c.name, j.title from candidates c join jobs j on j.id = c.job_id where c.id = ${candidate}`;
      if (c) await tell.replied({ id: candidate, name: c.name }, { title: c.title });
    } else await tell.unmatched(m.from.name || m.from.address);
  }
  return { candidate, created: inserted };
}

async function match(sql: Sql, m: Received): Promise<string | null> {
  const byThread = candidateOfThread(m.thread);
  if (byThread) {
    const [c] = await sql<{ id: string }[]>`select id from candidates where id = ${byThread}`;
    if (c) return String(c.id);
  }
  const ids = [m.inReplyTo, ...m.references].filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 998).slice(-20);
  if (ids.length > 0) {
    const [c] = await sql<{ candidate_id: string }[]>`select candidate_id from messages where message_id in ${sql(ids)} and candidate_id is not null order by created_at desc limit 1`;
    if (c) return String(c.candidate_id);
  }
  // The From address alone is proof only when the sender's domain vouches
  // for it (the Chest checked DMARC, or SPF/DKIM aligned).
  if (m.authenticated) {
    const [c] = await sql<{ id: string }[]>`select id from candidates where lower(email) = lower(${m.from.address}) order by (status = 'active') desc, created_at desc limit 1`;
    if (c) return String(c.id);
  }
  return null;
}

// bounced: the email the tool sent did not arrive; the conversation says
// so (the recruiter sees "Not delivered" and corrects the address).
export async function bounced(sql: Sql, b: Bounce): Promise<void> {
  const [row] = await sql<{ candidate_id: string | null }[]>`update messages set status = 'bounced' where mail_id = ${b.message} and direction = 'out' returning candidate_id`;
  if (row?.candidate_id && b.permanent) {
    const [c] = await sql<{ name: string }[]>`select name from candidates where id = ${row.candidate_id}`;
    if (c) await tell.bounced({ id: String(row.candidate_id), name: c.name });
  }
}
