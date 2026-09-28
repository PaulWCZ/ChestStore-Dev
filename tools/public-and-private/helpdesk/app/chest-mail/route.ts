import * as mail from "@argentic/chest-sdk/mail";
import { db } from "../../lib/db.ts";
import { seen } from "../../lib/lifecycle.ts";
import * as mailer from "../../lib/mailer.ts";
import { numberInSubject } from "../../lib/model.ts";
import * as tell from "../../lib/tell.ts";
import * as tickets from "../../lib/tickets.ts";

// Email sent to the support mailbox (Proposal (studio): the Chest posts
// each received message here, signed). It continues its ticket or opens
// one; a new one gets the confirmation with its follow-up link.
export async function POST(request: Request): Promise<Response> {
  const sql = db();
  return new Response(null, {
    status: await mail.handle(request, async message => {
      const filed = await tickets.fromEmail(sql, message, numberInSubject(message.subject));
      const t = (await sql<{ id: string; number: number; subject: string; status: tickets.Ticket["status"]; assignee: string | null; customer_name: string; customer_email: string; language: string }[]>`select id, number, subject, status, assignee, customer_name, customer_email, language from tickets where id = ${filed.id}`)[0]!;
      if (t.status === "spam") return;
      const ticket = { id: String(t.id), number: t.number, subject: t.subject, assignee: t.assignee, customerName: t.customer_name, customerEmail: t.customer_email };
      if (filed.created && filed.secret) {
        const s = await tickets.settings(sql);
        await mailer.confirm({ ...ticket, language: t.language }, `${s.publicOrigin ?? ""}/t/${filed.secret}`, s.companyName);
        await tell.newTicket(ticket, message.text);
      } else await tell.customerWrote(ticket, message.text);
      await tell.refreshBadges(sql);
    }, { seen: seen(sql) }),
  });
}
