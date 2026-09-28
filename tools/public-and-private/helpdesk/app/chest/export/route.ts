import { db } from "../../../lib/db.ts";
import { AppError } from "../../../lib/errors.ts";
import { toCsv } from "../../../lib/csv.ts";
import { nameOf, people } from "../../../lib/people.ts";
import { viewer } from "../../../lib/session.ts";
import { exportRows } from "../../../lib/tickets.ts";

// Every ticket as a spreadsheet, headers in the reader's language.
export async function GET(): Promise<Response> {
  const v = await viewer();
  if (!v) return new Response(null, { status: 401 });
  try {
    const rows = await exportRows(db(), v.member);
    const who = await people(rows.map(r => r.assignee).filter((a): a is string => !!a));
    const h = v.t.export.headers;
    const csv = toCsv([
      [h.number, h.subject, h.status, h.priority, h.tags, h.email, h.name, h.assignee, h.channel, h.created, h.updated, h.messages],
      ...rows.map(r => [r.number, r.subject, v.t.ticket.statuses[r.status], v.t.priority[r.priority], r.tags.join(", "), r.customerEmail, r.customerName, r.assignee ? nameOf(who.get(r.assignee), v.locale) : "", v.t.ticket.channel[r.channel as "form"], r.createdAt, r.updatedAt, r.messages]),
    ]);
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="support-tickets.csv"', "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: 403 });
    throw error;
  }
}
