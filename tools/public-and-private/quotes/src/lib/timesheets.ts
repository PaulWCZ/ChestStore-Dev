import { chest } from "@argentic/chest-sdk/chest";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as events from "@argentic/chest-sdk/events";
import type { ToolEvent } from "@argentic/chest-sdk/events";
import { issuers } from "./access.ts";
import { company } from "./company.ts";
import type { Query, Sql } from "./db.ts";
import { fold } from "./fold.ts";
import { catalogue, format, formatDay, isLocale, type Locale } from "../i18n/index.ts";
import { limits } from "./model.ts";
import { formatMoney } from "./money.ts";
import { notify, withdraw } from "./notify.ts";
import { holders } from "./people.ts";
import { lineNet, totals } from "./totals.ts";

// What Timesheets tells Quotes (Proposal (studio): events between tools,
// once an admin linked the two): the billable time of a project and a
// period, handed over to be invoiced.
//
//   timesheets.billable {version: 1, handoff, project: {id, name}, client: {id, name} | null,
//     period: {from, to}, currency, minutes, amount, entries,
//     lines: [{label, task, minutes, rate: cents an hour | null, amount, entries}],
//     source: {tool: "timesheets", path}}
//   timesheets.billable_cancelled {version: 1, handoff}
//
// Quotes makes one **draft invoice** per hand-off — never two, whatever
// the deliveries (the `handoffs` row stays even when its draft is dropped)
// — for the client whose name is Timesheets' (accents, case and spaces
// aside; one match only), or with no client: the draft then asks to choose
// one (and says the name Timesheets gave). One line per `lines[]` item:
// its label, `minutes / 60` hours, the hourly rate as unit price, at the
// standard VAT rate (20 %; the company's exemption or the client's reverse
// charge apply as on any invoice). The draft is handed to billing (the
// bell, the desk), and links back to the project in Timesheets
// (`chest.tools.link`). Cancelled in Timesheets: the draft goes if it was
// not issued; issued, it stays (a legal record) and billing is told. When
// billing issues it, Quotes publishes `quotes.invoiced {handoff, invoice,
// path, by}` (key `quotes:invoiced:<handoff>`); a Chest that cannot
// publish now is tried again by the daily follow-up.
//
// Untrusted data: every field is bounded and checked; an event of another
// shape is accepted and ignored.

export type Billable = {
  handoff: string;
  project: string;
  client: string;
  from: string | null;
  to: string | null;
  currency: string;
  lines: { label: string; minutes: number; rate: number }[];
  path: string;
};

const handoffPattern = /^[1-9][0-9]{0,17}$/u;
const dayPattern = /^\d{4}-\d{2}-\d{2}$/u;
const text = (value: unknown, max: number): string => {
  if (typeof value !== "string") return "";
  const t = value.replace(/[\p{Cc}‪-‮⁦-⁩]/gu, " ").replace(/\s+/gu, " ").trim();
  return [...t].slice(0, max).join("");
};
const record = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null);
// A path in Timesheets: its team host's, as chest.tools.link accepts it.
const pathOf = (value: unknown): string => (typeof value === "string" && /^\/chest(\/[\x21-\x7e]*)?$/u.test(value) && !value.includes("\\") && value.length <= 300 ? value : "");

export function readBillable(data: Record<string, unknown>): Billable | null {
  if (data["version"] !== 1) return null;
  const handoff = data["handoff"];
  if (typeof handoff !== "string" || !handoffPattern.test(handoff)) return null;
  const project = text(record(data["project"])?.["name"], 120);
  if (!project) return null;
  const client = text(record(data["client"])?.["name"], limits.name);
  const period = record(data["period"]);
  const day = (v: unknown) => (typeof v === "string" && dayPattern.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z")) ? v : null);
  const currency = typeof data["currency"] === "string" && /^[A-Z]{3}$/u.test(data["currency"]) ? data["currency"] : null;
  if (!currency) return null;
  const raw = data["lines"];
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > limits.lines) return null;
  const lines: Billable["lines"] = [];
  for (const item of raw) {
    const l = record(item);
    if (!l) return null;
    const minutes = l["minutes"];
    const rate = l["rate"];
    if (typeof minutes !== "number" || !Number.isSafeInteger(minutes) || minutes < 0 || minutes > 60 * limits.quantity / 1000) return null;
    if (rate !== null && rate !== undefined && (typeof rate !== "number" || !Number.isSafeInteger(rate) || rate < 0 || rate > limits.unitPrice)) return null;
    lines.push({ label: text(l["label"], limits.description) || text(record(l["task"])?.["name"], limits.description) || project, minutes, rate: typeof rate === "number" ? rate : 0 });
  }
  return { handoff, project, client, from: day(period?.["from"]), to: day(period?.["to"]), currency, lines, path: pathOf(record(data["source"])?.["path"]) };
}

async function issuerIds(): Promise<string[]> {
  const found = await Promise.all(issuers.map(role => holders({ role })));
  return [...new Set(found.flat().map(h => h.id))];
}

// billableReceived: the draft invoice of a hand-off (made once).
export async function billableReceived(sql: Sql, event: ToolEvent, context: { locale: Locale; currency: string }): Promise<{ documentId: string | null; created: boolean } | null> {
  const b = readBillable(event.data);
  if (!b) return null;
  const made = await sql.begin(async tx => {
    const [seen] = await tx`insert into handoffs (handoff, project, period_from, period_to, source_path, client_name)
      values (${b.handoff}, ${b.project}, ${b.from}, ${b.to}, ${b.path}, ${b.client}) on conflict (handoff) do nothing returning handoff`;
    if (!seen) {
      const [row] = await tx<{ document_id: number | null }[]>`select document_id from handoffs where handoff = ${b.handoff}`;
      return { documentId: row?.document_id ? String(row.document_id) : null, created: false, gross: 0, clientName: "" };
    }
    const c = await company(tx);
    // The client, by its name as Timesheets wrote it: one match, or none.
    const wanted = fold(b.client);
    const candidates = wanted ? await tx<{ id: number; name: string; language: string; reverse_charge: boolean }[]>`
      select id, name, language, reverse_charge from clients where archived_at is null order by id limit 20000` : [];
    const matches = candidates.filter(x => fold(x.name) === wanted);
    const client = matches.length === 1 ? matches[0]! : null;
    const language: Locale = client && isLocale(client.language) ? client.language : context.locale;
    const w = catalogue(language);
    const sameCurrency = b.currency === context.currency;
    const lines = b.lines.map(l => ({ kind: "line" as const, quantity: Math.round((l.minutes * 1000) / 60), unitPrice: sameCurrency ? l.rate : 0, discount: 0, vatRate: 2000, description: l.label }));
    const noVat = c.franchise || Boolean(client?.reverse_charge);
    const t = totals(lines, { noVat });
    const day = (d: string | null) => (d ? formatDay(d, language, { day: "numeric", month: "long", year: "numeric" }) : "");
    const title = b.from && b.to ? format(w.lines.timesheetsTitle, { project: b.project, from: day(b.from), to: day(b.to) }) : b.project;
    const [doc] = await tx<{ id: number }[]>`
      insert into documents ${tx({
        type: "invoice", client_id: client ? client.id : null, title: [...title].slice(0, limits.title).join(""), language, currency: context.currency,
        payment_days: c.paymentDays, vat_treatment: client?.reverse_charge ? "reverse_charge" : "standard", franchise: c.franchise,
        created_by: "tool:timesheets", net: t.net, vat: t.vat, gross: t.gross, rates: tx.json(t.rates as never), ready_at: new Date(),
      })} returning id`;
    await tx`insert into lines ${tx(lines.map((l, i) => ({
      document_id: doc!.id, position: i + 1, kind: "line", description: l.description, quantity: l.quantity, unit: w.pdf.units.hour.one,
      unit_price: l.unitPrice, discount: 0, vat_rate: 2000, goods: false, net: lineNet(l),
    })))}`;
    await tx`update handoffs set document_id = ${doc!.id} where handoff = ${b.handoff}`;
    return { documentId: String(doc!.id), created: true, gross: t.gross, clientName: client?.name ?? "" };
  });
  if (made.created) {
    await notify(await issuerIds(), (t, locale) => ({
      title: format(t.notifications.timesheetsTitle, { project: b.project }),
      body: format(made.clientName ? t.notifications.timesheetsBody : t.notifications.timesheetsNoClient, { client: made.clientName || b.client, amount: formatMoney(made.gross, context.currency, locale) }),
    }), { path: `/chest/documents/${made.documentId}`, key: `ready:${made.documentId}` });
  }
  return { documentId: made.documentId, created: made.created };
}

// billableCancelled: the hand-off taken back in Timesheets. Its draft goes;
// an issued invoice stays, and billing hear of it.
export async function billableCancelled(sql: Sql, event: ToolEvent): Promise<"deleted" | "kept" | null> {
  if (event.data["version"] !== 1) return null;
  const handoff = event.data["handoff"];
  if (typeof handoff !== "string" || !handoffPattern.test(handoff)) return null;
  const result = await sql.begin(async tx => {
    const [h] = await tx<{ document_id: number | null; cancelled_at: Date | null }[]>`select document_id, cancelled_at from handoffs where handoff = ${handoff} for update`;
    if (!h || h.cancelled_at) return null;
    await tx`update handoffs set cancelled_at = now() where handoff = ${handoff}`;
    if (h.document_id === null) return { deleted: null };
    const [d] = await tx<{ id: number; status: string; number: string | null }[]>`select id, status, number from documents where id = ${h.document_id} for update`;
    if (!d) return { deleted: null };
    if (d.status === "draft") {
      await tx`update handoffs set document_id = null where handoff = ${handoff}`;
      await tx`delete from documents where id = ${d.id} and status = 'draft'`;
      return { deleted: String(d.id) };
    }
    return { kept: String(d.id), number: d.number ?? "" };
  });
  if (result === null) return null;
  if ("deleted" in result) {
    if (result.deleted) await withdraw(`ready:${result.deleted}`);
    return "deleted";
  }
  await notify(await issuerIds(), t => ({
    title: format(t.notifications.timesheetsCancelledTitle, { number: result.number }),
    body: t.notifications.timesheetsCancelledBody,
  }), { path: `/chest/documents/${result.kept}`, key: `timesheets:${handoff}:cancelled` });
  return "kept";
}

// When the invoice was issued, told to the Chest (events.publish's
// occurredAt, studio.16): a retry the next morning still says the day it
// was issued, not the day it was told. The Chest takes a time at most 24
// hours back; older (a Chest that refused for longer), the event goes
// without it, and the receiver reads the Chest's time. Five minutes of
// margin for the two clocks.
export const occurredMarginMs = 5 * 60_000;
export function occurredAtFor(at: Date | null, now = Date.now()): Date | undefined {
  if (!at) return undefined;
  const age = now - at.getTime();
  return age >= 0 && age < events.occurredLimits.behindMs - occurredMarginMs ? at : undefined;
}

// invoicedHandoff tells Timesheets the invoice of a hand-off is issued
// (once; a Chest that cannot publish now is tried again later).
export async function invoicedHandoff(sql: Query, documentId: string, by: string | null, now = Date.now()): Promise<boolean> {
  const [h] = await sql<{ handoff: string; number: string | null; status: string; finalised_by: string | null; finalised_at: Date | null }[]>`
    select h.handoff, d.number, d.status, d.finalised_by, d.finalised_at from handoffs h join documents d on d.id = h.document_id
    where h.document_id = ${documentId} and h.cancelled_at is null and h.published_at is null`;
  if (!h || h.status !== "final" || !h.number) return false;
  const who = by ?? h.finalised_by;
  const occurredAt = occurredAtFor(h.finalised_at, now);
  try {
    await events.publish("quotes.invoiced", {
      handoff: h.handoff, invoice: h.number, path: `/chest/documents/${documentId}`, ...(who && /^mbr_[a-z2-7]{26}$/u.test(who) ? { by: who } : {}),
    }, { key: `quotes:invoiced:${h.handoff}`, ...(occurredAt ? { occurredAt } : {}) });
  } catch (error) {
    if (error instanceof ChestError) return false;
    throw error;
  }
  await sql`update handoffs set published_at = now() where handoff = ${h.handoff}`;
  return true;
}

// The hand-offs issued but not told yet (the daily follow-up).
export async function publishPending(sql: Query, now = Date.now()): Promise<number> {
  const rows = await sql<{ document_id: number }[]>`
    select h.document_id from handoffs h join documents d on d.id = h.document_id
    where h.published_at is null and h.cancelled_at is null and d.status = 'final' limit 200`;
  let told = 0;
  for (const r of rows) if (await invoicedHandoff(sql, String(r.document_id), null, now)) told++;
  return told;
}

// Where a draft came from, for its page: the project and period, the
// client's name Timesheets gave, the link back (null when Timesheets is not
// installed, or the path is not one it serves).
export async function handoffOf(sql: Query, documentId: string): Promise<{ project: string; client: string; link: string | null } | null> {
  const [h] = await sql<{ project: string; client_name: string; source_path: string }[]>`select project, client_name, source_path from handoffs where document_id = ${documentId}`;
  if (!h) return null;
  return { project: h.project, client: h.client_name, link: h.source_path ? chest.tools.link("timesheets", h.source_path) : null };
}
