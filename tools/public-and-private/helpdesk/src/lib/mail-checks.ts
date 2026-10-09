import { ChestError } from "@argentic/chest-sdk/errors";
import * as mail from "@argentic/chest-sdk/mail";
import type { Sql } from "./db.ts";
import * as tell from "./tell.ts";
import * as tickets from "./tickets.ts";

// Whether the emails Support sent arrived. The Chest posts nothing to the
// tool (it receives no mail, bounces included: owner's decision, 6 October
// 2026); mail.status(id) is the only way to learn that an address does not
// exist. Every email sent (a confirmation, a reply) is listed in
// mail_checks; the "late" schedule (every 15 minutes) asks the Chest about
// those still on their way, less and less often as they age — at about a
// quarter of their age, ten minutes apart at least: some 20 questions in
// the three days a message is followed — and 200 at most a pass.
//
// bounced, complained (the customer marked it as spam) and failed (their
// provider gave up): the reply shows it, the ticket says "Emails to … do
// not arrive", and whoever wrote it (or has the ticket) is told in the
// bell. delivered: done; a later email that arrives clears the ticket's
// warning (the address works again).

const followDays = 3;
const perPass = 200;
const failed = new Set(["bounced", "complained", "failed"]);

export async function checkMail(sql: Sql, now = new Date()): Promise<{ asked: number; bounced: number }> {
  const due = await sql<{ mail_id: string }[]>`
    select mail_id from mail_checks
    where not done and sent_at > ${new Date(now.getTime() - followDays * 86_400_000)}
      and (checked_at is null or ${now}::timestamptz - checked_at > greatest(interval '10 minutes', (${now}::timestamptz - sent_at) / 4))
    order by sent_at limit ${perPass}`;
  let bounced = 0;
  for (const { mail_id: id } of due) {
    let status: mail.Status | null;
    try {
      status = await mail.status(id);
    } catch (error) {
      // The Chest did not answer (or has no mail any more): next pass.
      if (error instanceof ChestError) break;
      throw error;
    }
    if (status === null || status.status === "delivered") {
      await sql`update mail_checks set done = true, checked_at = ${now} where mail_id = ${id}`;
      if (status) await tickets.arrived(sql, id);
      continue;
    }
    if (!failed.has(status.status)) {
      await sql`update mail_checks set checked_at = ${now} where mail_id = ${id}`;
      continue;
    }
    await sql`update mail_checks set done = true, checked_at = ${now} where mail_id = ${id}`;
    const hit = await tickets.bounced(sql, { message: id, permanent: true, reason: status.status, at: status.at });
    if (!hit) continue;
    bounced++;
    const to = hit.author && hit.author.startsWith("mbr_") ? hit.author : hit.assignee;
    if (to) await tell.bounced({ id: hit.ticketId, number: hit.number }, to, hit.recipient);
  }
  // What is followed no longer: forgotten after a week.
  await sql`delete from mail_checks where sent_at < ${new Date(now.getTime() - 7 * 86_400_000)}`;
  return { asked: due.length, bounced };
}
