import { chest } from "@argentic/chest-sdk/chest";
import type { Member } from "@argentic/chest-sdk/member";
import { AppError } from "./app-error.ts";
import { can } from "./access.ts";
import { toCsv } from "./csv.ts";
import type { Sql } from "./db.ts";
import { stamp } from "../shared/hours.ts";
import { format, type Catalogue, type Locale } from "../i18n/index.ts";
import { nameOf, people, type Person } from "./people.ts";
import { colleagueName } from "./tell.ts";
import { readMerged } from "./model.ts";
import { exportBatches, type ExportTicket } from "./tickets.ts";
import { zipStream } from "./zip.ts";

// Everything leaves as easily as it came: one ZIP with
// - tickets.csv: one row per ticket (any spreadsheet; dates on the Chest's
//   clock, headers in the reader's language);
// - messages.csv: one row per message — the customer's words, the answers,
//   the notes — with who wrote it and its files' names;
// - tickets.json: all of it, dates in ISO 8601 (UTC), for another tool.
// The files themselves stay in the Chest (see README: not in the export
// yet). Formulas are neutralised by lib/csv.ts.
//
// The archive is written as it is read (lib/zip.ts): tickets come a batch
// at a time (lib/tickets.ts, exportBatches), each batch becomes rows, the
// rows are deflated and sent. Memory stays flat with the size of the desk.
// Each file reads the tickets anew: a ticket that arrives during the
// export may be in one file and not yet in the one before.

type Row = ExportTicket;
type Said = ExportTicket["messages"][number];

export async function exportZip(sql: Sql, actor: Member | null, t: Catalogue, locale: Locale, now = new Date()): Promise<AsyncGenerator<Uint8Array>> {
  if (!can(actor, "export")) throw new AppError("forbidden");
  const zone = chest.timeZone;
  // Names are asked of the Chest once per person, whatever the batches.
  const who = new Map<string, Person>();
  const named = async (batch: Row[]) => {
    const ids = batch.flatMap(x => [x.assignee, x.requester, ...x.messages.map(m => m.author)]).filter((a): a is string => !!a && a.startsWith("mbr_") && !who.has(a));
    for (const [id, p] of await people(ids)) who.set(id, p);
  };
  const person = (id: string | null) => (id === null ? "" : id === "erased" ? t.people.erased : nameOf(who.get(id), locale));
  const local = (iso: string | null) => (iso ? stamp(iso, zone) : "");
  const h = t.export.headers;
  const kind = (k: Said["kind"]) => t.export.kinds[k];
  // A colleague's request (a team form of Forms): named as the Chest does.
  const colleague = (x: Row) => (x.requester === "erased" ? t.people.erased : x.requester ? colleagueName(who.get(x.requester), t, locale) : "");
  const author = (x: Row, m: Said) =>
    x.requester && m.kind === "customer" ? colleague(x) : m.kind === "customer" ? (x.customerName ? `${x.customerName} <${x.customerEmail}>` : x.customerEmail)
      : person(m.author);
  const body = (m: Said) => (m.kind === "event" && readMerged(m.body) ? format(t.ticket.mergedEvent, { number: readMerged(m.body)!.number }) : m.body);
  // A CSV file: its header (with the byte-order mark), then each batch's
  // rows, without the mark again.
  const csv = (header: unknown[], withMessages: boolean, rows: (batch: Row[]) => unknown[][]) =>
    (async function* () {
      yield toCsv([header]);
      for await (const batch of exportBatches(sql, actor, withMessages)) {
        await named(batch);
        const lines = rows(batch);
        if (lines.length) yield toCsv(lines).slice(1);
      }
    })();
  const ticketsCsv = csv([h.number, h.subject, h.status, h.priority, h.tags, h.email, h.name, h.assignee, h.channel, h.created, h.updated, h.closed, h.messages, h.rating, h.mergedInto], false, batch =>
    batch.map(x => [x.number, x.subject, t.ticket.statuses[x.status], t.priority[x.priority], x.tags.join(", "), x.customerEmail, x.requester ? colleague(x) : x.customerName, person(x.assignee), t.ticket.channel[x.channel], local(x.createdAt), local(x.updatedAt), local(x.closedAt), x.said, x.rating ? t.export.ratings[x.rating] : "", x.mergedInto ?? ""]));
  const messagesCsv = csv([h.number, h.subject, h.date, h.kind, h.author, h.body, h.files], true, batch =>
    batch.flatMap(x => x.messages.map(m => [x.number, x.subject, local(m.at), kind(m.kind), author(x, m), body(m), m.attachments.map(a => a.fileName).join(", ")])));
  const ticketJson = (x: Row) => ({
    number: x.number, subject: x.subject, status: x.status, priority: x.priority, tags: x.tags, channel: x.channel, language: x.language,
    customer: x.requester ? { email: null, name: colleague(x), member: x.requester } : { email: x.customerEmail, name: x.customerName },
    source: x.source ?? undefined, assignee: x.assignee ? person(x.assignee) : null,
    createdAt: x.createdAt, updatedAt: x.updatedAt, closedAt: x.closedAt, mergedInto: x.mergedInto, rating: x.rating, ratedAt: x.ratedAt,
    messages: x.messages.map(m => ({
      kind: m.kind, at: m.at, author: author(x, m), body: body(m),
      delivery: m.delivery ?? undefined, bounce: m.bounce ?? undefined,
      files: m.attachments.map(a => ({ name: a.fileName, type: a.type, size: a.size })),
    })),
  });
  // The JSON file, indented as JSON.stringify(…, null, 2) would write it
  // whole, one ticket at a time.
  const json = (async function* () {
    yield `{\n  "exportedAt": ${JSON.stringify(now.toISOString())},\n  "timeZone": ${JSON.stringify(zone)},\n  "tickets": [`;
    let first = true;
    for await (const batch of exportBatches(sql, actor, true)) {
      await named(batch);
      const items = batch.map(x => `\n    ${JSON.stringify(ticketJson(x), null, 2).replace(/\n/gu, "\n    ")}`);
      if (items.length === 0) continue;
      yield (first ? "" : ",") + items.join(",");
      first = false;
    }
    yield first ? "]\n}" : "\n  ]\n}";
  })();
  return zipStream([{ name: "tickets.csv", text: ticketsCsv }, { name: "messages.csv", text: messagesCsv }, { name: "tickets.json", text: json }], now);
}
