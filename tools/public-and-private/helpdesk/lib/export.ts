import * as chest from "@argentic/chest-sdk/chest";
import type { Member } from "@argentic/chest-sdk/member";
import { toCsv } from "./csv.ts";
import type { Sql } from "./db.ts";
import { stamp } from "./hours.ts";
import { format, type Catalogue, type Locale } from "./i18n/index.ts";
import { nameOf, people } from "./people.ts";
import { exportAll, type ExportTicket } from "./tickets.ts";
import { zip } from "./zip.ts";

// Everything leaves as easily as it came: one ZIP with
// - tickets.csv: one row per ticket (any spreadsheet; dates on the Chest's
//   clock, headers in the reader's language);
// - messages.csv: one row per message — the customer's words, the answers,
//   the notes — with who wrote it and its files' names;
// - tickets.json: all of it, dates in ISO 8601 (UTC), for another tool.
// The files themselves stay in the Chest (see README: not in the export
// yet). Formulas are neutralised by lib/csv.ts.

export async function exportZip(sql: Sql, actor: Member | null, t: Catalogue, locale: Locale, now = new Date()): Promise<Uint8Array> {
  const all = await exportAll(sql, actor);
  const zone = chest.timeZone();
  const ids = all.flatMap(x => [x.assignee, ...x.messages.map(m => m.author)]).filter((a): a is string => !!a && a.startsWith("mbr_"));
  const who = await people(ids);
  const person = (id: string | null) => (id === null ? "" : id === "erased" ? t.people.erased : nameOf(who.get(id), locale));
  const local = (iso: string | null) => (iso ? stamp(iso, zone) : "");
  const h = t.export.headers;
  const kind = (k: ExportTicket["messages"][number]["kind"]) => t.export.kinds[k];
  const author = (x: ExportTicket, m: ExportTicket["messages"][number]) =>
    m.kind === "customer" ? (m.mailFrom && m.mailFrom.toLowerCase() !== x.customerEmail.toLowerCase() ? m.mailFrom : x.customerName ? `${x.customerName} <${x.customerEmail}>` : x.customerEmail)
      : person(m.author);
  const body = (m: ExportTicket["messages"][number]) => (m.kind === "event" && m.body.startsWith("merged:") ? format(t.ticket.mergedEvent, { number: m.body.slice(7) }) : m.body);
  const ticketsCsv = toCsv([
    [h.number, h.subject, h.status, h.priority, h.tags, h.email, h.name, h.assignee, h.channel, h.created, h.updated, h.closed, h.messages, h.rating, h.mergedInto],
    ...all.map(x => [x.number, x.subject, t.ticket.statuses[x.status], t.priority[x.priority], x.tags.join(", "), x.customerEmail, x.customerName, person(x.assignee), t.ticket.channel[x.channel], local(x.createdAt), local(x.updatedAt), local(x.closedAt), x.messages.filter(m => m.kind !== "event").length, x.rating ? t.export.ratings[x.rating] : "", x.mergedInto ?? ""]),
  ]);
  const messagesCsv = toCsv([
    [h.number, h.subject, h.date, h.kind, h.author, h.body, h.files],
    ...all.flatMap(x => x.messages.map(m => [x.number, x.subject, local(m.at), kind(m.kind), author(x, m), body(m), m.attachments.map(a => a.fileName).join(", ")])),
  ]);
  const json = JSON.stringify({
    exportedAt: now.toISOString(),
    timeZone: zone,
    tickets: all.map(x => ({
      number: x.number, subject: x.subject, status: x.status, priority: x.priority, tags: x.tags, channel: x.channel, language: x.language,
      customer: { email: x.customerEmail, name: x.customerName }, assignee: x.assignee ? person(x.assignee) : null,
      createdAt: x.createdAt, updatedAt: x.updatedAt, closedAt: x.closedAt, mergedInto: x.mergedInto, rating: x.rating, ratedAt: x.ratedAt,
      messages: x.messages.map(m => ({
        kind: m.kind, at: m.at, author: author(x, m), body: body(m), automatic: m.auto || undefined,
        delivery: m.delivery ?? undefined, bounce: m.bounce ?? undefined,
        files: m.attachments.map(a => ({ name: a.fileName, type: a.type, size: a.size })),
      })),
    })),
  }, null, 2);
  return zip([{ name: "tickets.csv", text: ticketsCsv }, { name: "messages.csv", text: messagesCsv }, { name: "tickets.json", text: json }], now);
}
