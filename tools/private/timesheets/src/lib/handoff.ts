import { chest } from "@argentic/chest-sdk/chest";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as events from "@argentic/chest-sdk/events";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import { currency } from "./clock.ts";
import type { Query, Sql } from "./db.ts";
import { daysBetween, isDay } from "../shared/days.ts";
import { clean, id, limits, memberPattern, numeric } from "../shared/model.ts";
import { billRateOf, costRateOf, entryAmount, revenueOf } from "./rates.ts";
import { transaction } from "./tx.ts";

// Billable time handed to the Quotes tool as the lines of a draft invoice,
// through events between tools (Proposal (studio): "emits" in
// chest.proposals.json). A manager picks a project and a period in the
// report "Billable, not invoiced" and presses "Draft invoice in Quotes":
// its billable entries not invoiced (and not already handed over) become
// one hand-off, published once as `timesheets.billable` (version 1, the
// contract below and in README.md "With the other tools"). Quotes makes a
// draft invoice of it and answers `quotes.invoiced` with the hand-off's id
// once the invoice is issued: its entries are then invoiced here (they lock
// and keep their rates). Before that a manager may take the hand-off back:
// its entries are free again and Quotes hears `timesheets.billable_cancelled`.
//
// Idempotent both ways: a hand-off is published under the key
// `timesheets:billable:<id>` (the Chest keeps one event per key for a day;
// Quotes keeps one draft per hand-off id), and a `quotes.invoiced` for a
// hand-off already invoiced changes nothing.

export const eventVersion = 1;
// The lines of one draft invoice: an event is 16 KiB at most.
export const maxLines = 60;

export type BillableLine = { label: string; task: { id: string; name: string } | null; minutes: number; rate: number | null; amount: number | null; entries: number };
export type Billable = {
  version: 1;
  handoff: string;
  project: { id: string; name: string };
  client: { id: string; name: string } | null;
  period: { from: string; to: string };
  currency: string;
  minutes: number;
  amount: number | null;
  entries: number;
  lines: BillableLine[];
  // Where the time is, in Timesheets (chest.tools.link("timesheets", path)).
  source: { tool: "timesheets"; path: string };
};

export type Handoff = {
  id: string; projectId: string; projectName: string; clientName: string | null; from: string; to: string; minutes: number; cents: number | null; currency: string; entries: number;
  sentBy: string; sentAt: string; published: boolean; cancelled: boolean; invoiced: boolean; invoiceRef: string; invoiceLink: string | null;
};

function period(from: unknown, to: unknown): { from: string; to: string } {
  if (!isDay(from) || !isDay(to) || from > to || daysBetween(from, to) >= limits.reportDays) throw new AppError("bad_period");
  return { from, to };
}

type EntryRow = { id: string; minutes: number; task_id: string | null; task_name: string | null; rate: string | null };

// The project's billable time of the period that is neither invoiced nor
// handed over yet, as invoice lines: one per task and rate.
async function billableEntries(tx: Query, projectId: string, p: { from: string; to: string }, lock: boolean): Promise<EntryRow[]> {
  return tx<EntryRow[]>`
    select e.id::text, e.minutes, e.task_id::text, t.name as task_name, ${billRateOf(tx)}::text as rate
    from entries e left join tasks t on t.id = e.task_id
    where e.project_id = ${projectId} and e.deleted_at is null and e.billable and e.invoiced_at is null and e.handoff_id is null
      and e.day between ${p.from} and ${p.to}
    order by e.day, e.id
    ${lock ? tx`for update of e` : tx``}`;
}

export function linesOf(rows: EntryRow[], projectName: string): BillableLine[] {
  const byKey = new Map<string, BillableLine>();
  for (const r of rows) {
    const rate = r.rate === null ? null : Number(r.rate);
    const key = `${r.task_id ?? ""}:${rate ?? ""}`;
    const line = byKey.get(key) ?? { label: r.task_name ?? projectName, task: r.task_id && r.task_name ? { id: r.task_id, name: r.task_name } : null, minutes: 0, rate, amount: null, entries: 0 };
    line.minutes += r.minutes;
    line.entries += 1;
    // Each entry rounded to the cent, then added (src/lib/rates.ts).
    if (rate !== null) line.amount = (line.amount ?? 0) + entryAmount(r.minutes, rate);
    byKey.set(key, line);
  }
  const lines = [...byKey.values()];
  return lines.sort((a, b) => b.minutes - a.minutes || a.label.localeCompare(b.label));
}

// What a hand-off of that project and period would hold (the report's
// button says it before it is pressed).
export async function preview(sql: Query, actor: Member | null, projectId: unknown, from: unknown, to: unknown): Promise<{ entries: number; minutes: number; lines: number }> {
  if (!can(actor, "invoice")) throw new AppError("forbidden");
  const p = period(from, to);
  const pid = id(projectId);
  const [project] = await sql<{ name: string }[]>`select name from projects where id = ${pid}`;
  if (!project) throw new AppError("not_found");
  const rows = await billableEntries(sql, pid, p, false);
  return { entries: rows.length, minutes: rows.reduce((n, r) => n + r.minutes, 0), lines: linesOf(rows, project.name).length };
}

// A hand-off's key: its id and the moment it was made (milliseconds).
export const handoffKey = (handoff: string, at: Date): string => `timesheets:billable:${handoff}:${at.getTime()}`;

// occurredAt (events.publish, studio.16): the moment the database wrote,
// when the Chest would take it — 24 hours back at most, less five minutes
// for the clocks. A moment ahead of this server's clock (the database's
// running fast) goes without it rather than risk a refusal. Published
// right after the change today, so given; kept exact for a retry.
export function occurred(at: Date, now = Date.now()): { occurredAt?: Date } {
  const age = now - at.getTime();
  return age >= 0 && age < events.occurredLimits.behindMs - 5 * 60_000 ? { occurredAt: at } : {};
}

// release frees the entries of a hand-off that did not go (not taken, or
// taken back): no longer waiting, and the rates the hand-off wrote on them
// forgotten (the rates in force apply again, as before it).
async function release(tx: Query, handoff: string): Promise<void> {
  await tx`
    update entries set handoff_id = null,
      rates_fixed = case when handoff_fixed then false else rates_fixed end,
      bill_rate_cents = case when handoff_fixed then null else bill_rate_cents end,
      cost_rate_cents = case when handoff_fixed then null else cost_rate_cents end,
      handoff_fixed = false
    where handoff_id = ${handoff} and invoiced_at is null`;
}

// undo: a hand-off nobody received never happened.
async function undo(sql: Sql, handoff: string): Promise<void> {
  await transaction(sql, async tx => {
    await release(tx, handoff);
    await tx`delete from handoffs where id = ${handoff}`;
  });
}

// linked: whether some tool receives the hand-off now — Quotes installed
// AND linked to Timesheets by an admin (chest.tools.get only says it is
// installed). False on a Chest without events between tools.
export async function linked(): Promise<boolean> {
  try {
    return (await events.receivers("timesheets.billable")).length > 0;
  } catch (error) {
    if (error instanceof ChestError) return false;
    throw error;
  }
}

// sendBillable makes the hand-off and publishes it. Nothing is kept when
// no tool would receive it, when the Chest does not take the event, or
// when it reached no one: the time stays "billable, not invoiced", and the
// answer says so (quotes_unavailable).
export async function sendBillable(sql: Sql, actor: Member | null, input: { projectId?: unknown; from?: unknown; to?: unknown }): Promise<{ handoff: string; entries: number; minutes: number; receivers: number }> {
  if (!actor || !can(actor, "invoice")) throw new AppError("forbidden");
  const p = period(input.from, input.to);
  const pid = id(input.projectId);
  // Nobody would receive it: nothing is locked, the page says why.
  if (!(await linked())) throw new AppError("quotes_unavailable");
  const made = await transaction(sql, async tx => {
    const [project] = await tx<{ name: string; client_id: string | null; client_name: string | null }[]>`
      select p.name, p.client_id::text, c.name as client_name from projects p left join clients c on c.id = p.client_id where p.id = ${pid} for update of p`;
    if (!project) throw new AppError("not_found");
    const rows = await billableEntries(tx, pid, p, true);
    if (rows.length === 0) throw new AppError("nothing_to_send");
    const lines = linesOf(rows, project.name);
    if (lines.length > maxLines) throw new AppError("too_many", { max: maxLines });
    const minutes = rows.reduce((n, r) => n + r.minutes, 0);
    const amount = lines.every(l => l.amount !== null) ? lines.reduce((n, l) => n + (l.amount ?? 0), 0) : null;
    const code = currency();
    const [h] = await tx<{ id: string; sent_at: Date }[]>`
      insert into handoffs (project_id, from_day, to_day, minutes, cents, currency, entries, sent_by)
      values (${pid}, ${p.from}, ${p.to}, ${minutes}, ${amount}, ${code}, ${rows.length}, ${actor.id}) returning id::text, sent_at`;
    // Their rates written on them now (handoff_fixed: by this hand-off), so
    // the invoice Quotes makes and the amounts Timesheets shows never drift
    // apart, whatever rate changes later; taken back, they are freed again.
    await tx`
      update entries e set handoff_id = ${h!.id},
        handoff_fixed = not e.rates_fixed, rates_fixed = true,
        bill_rate_cents = ${billRateOf(tx)}, cost_rate_cents = ${costRateOf(tx)}
      where e.id = any(${rows.map(r => r.id)}::bigint[])`;
    const data: Billable = {
      version: eventVersion, handoff: h!.id,
      project: { id: pid, name: project.name },
      client: project.client_id && project.client_name ? { id: project.client_id, name: project.client_name } : null,
      period: p, currency: code, minutes, amount, entries: rows.length, lines,
      source: { tool: "timesheets", path: `/chest/projects/${pid}` },
    };
    return { handoff: h!.id, at: new Date(h!.sent_at), data, entries: rows.length, minutes };
  });
  let receivers = 0;
  try {
    // The key carries the moment it was made: after a restore from a
    // backup, a hand-off id may be given again to other time (sdk/README,
    // "Put the recipient in the key" — what the event is about), which the
    // Chest would refuse as another event under the same key.
    // occurredAt (studio.16): when it was made, as the row says.
    receivers = (await events.publish("timesheets.billable", made.data as unknown as Record<string, unknown>, { key: handoffKey(made.handoff, made.at), ...occurred(made.at) })).receivers;
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    // Not taken: the hand-off never happened.
    await undo(sql, made.handoff);
    // Not granted (no events between tools yet), not declared or not
    // linked: in every case Quotes cannot be told now.
    throw new AppError("quotes_unavailable");
  }
  if (receivers === 0) {
    // Unlinked meanwhile: taken by the Chest, delivered to no one.
    await undo(sql, made.handoff);
    throw new AppError("quotes_unavailable");
  }
  await sql`update handoffs set published_at = now() where id = ${made.handoff}`;
  return { handoff: made.handoff, entries: made.entries, minutes: made.minutes, receivers };
}

// cancelHandoff takes a hand-off back while its invoice is not issued: its
// entries may be changed and sent again; Quotes is told (best effort: a
// Chest that no longer takes the event does not keep the time locked).
export async function cancelHandoff(sql: Sql, actor: Member | null, handoffValue: unknown): Promise<void> {
  if (!actor || !can(actor, "invoice")) throw new AppError("forbidden");
  const hid = id(handoffValue);
  const done = await transaction(sql, async tx => {
    const [h] = await tx<{ cancelled: boolean; invoiced: boolean; sent_at: Date }[]>`
      select cancelled_at is not null as cancelled, invoiced_at is not null as invoiced, sent_at from handoffs where id = ${hid} for update`;
    if (!h) throw new AppError("not_found");
    if (h.cancelled || h.invoiced) throw new AppError("handoff_state");
    await release(tx, hid);
    const [c] = await tx<{ cancelled_at: Date }[]>`update handoffs set cancelled_at = now(), cancelled_by = ${actor.id} where id = ${hid} returning cancelled_at`;
    return { sent: new Date(h.sent_at), cancelled: new Date(c!.cancelled_at) };
  });
  try {
    await events.publish("timesheets.billable_cancelled", { version: eventVersion, handoff: hid }, { key: `${handoffKey(hid, done.sent)}:cancelled`, ...occurred(done.cancelled) });
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
}

// invoiced: Quotes' answer (`quotes.invoiced`, delivered to /chest-events):
// the hand-off's entries are invoiced, their rates written on them for good.
// `by` is the member who issued the invoice (else whoever sent the time).
// Says whether anything changed (a second delivery changes nothing).
export async function invoiced(sql: Sql, data: unknown): Promise<boolean> {
  const d = (data ?? {}) as { handoff?: unknown; invoice?: unknown; path?: unknown; by?: unknown };
  if (typeof d.handoff !== "string" || !/^[1-9][0-9]{0,17}$/u.test(d.handoff)) return false;
  const ref = typeof d.invoice === "string" ? clean(d.invoice.slice(0, 60), 60, { optional: true }) : "";
  const path = typeof d.path === "string" && d.path.startsWith("/") && !d.path.startsWith("//") && d.path.length <= 300 ? d.path : "";
  return transaction(sql, async tx => {
    const [h] = await tx<{ sent_by: string; cancelled: boolean; invoiced: boolean }[]>`
      select sent_by, cancelled_at is not null as cancelled, invoiced_at is not null as invoiced from handoffs where id = ${d.handoff as string} for update`;
    if (!h || h.cancelled || h.invoiced) return false;
    const by = typeof d.by === "string" && memberPattern.test(d.by) ? d.by : h.sent_by;
    await tx`
      update entries e set invoiced_at = now(), invoiced_by = ${by}, rates_fixed = true, handoff_fixed = false,
        bill_rate_cents = case when e.rates_fixed then e.bill_rate_cents else bill_rate(e.member_id, e.project_id, e.day) end,
        cost_rate_cents = case when e.rates_fixed then e.cost_rate_cents else cost_rate(e.member_id, e.day) end
      where e.handoff_id = ${d.handoff as string} and e.invoiced_at is null and e.deleted_at is null`;
    await tx`update handoffs set invoiced_at = now(), invoice_ref = ${ref}, invoice_path = ${path} where id = ${d.handoff as string}`;
    return true;
  });
}

// The hand-offs of the last 120 days (the Reports page lists them).
export async function recentHandoffs(sql: Query, actor: Member | null): Promise<Handoff[]> {
  if (!can(actor, "invoice")) throw new AppError("forbidden");
  const rows = await sql<{ id: string; project_id: string; project_name: string; client_name: string | null; from_day: string; to_day: string; minutes: number; cents: string | null; currency: string; entries: number; sent_by: string; sent_at: Date; published: boolean; cancelled: boolean; invoiced: boolean; invoice_ref: string; invoice_path: string }[]>`
    select h.id::text, h.project_id::text, p.name as project_name, c.name as client_name, to_char(h.from_day, 'YYYY-MM-DD') as from_day, to_char(h.to_day, 'YYYY-MM-DD') as to_day,
      h.minutes, h.cents::text, h.currency, h.entries, h.sent_by, h.sent_at, h.published_at is not null as published, h.cancelled_at is not null as cancelled,
      h.invoiced_at is not null as invoiced, h.invoice_ref, h.invoice_path
    from handoffs h join projects p on p.id = h.project_id left join clients c on c.id = p.client_id
    where h.sent_at > now() - interval '120 days' order by h.sent_at desc, h.id desc limit 50`;
  return rows.map(r => ({
    id: r.id, projectId: r.project_id, projectName: r.project_name, clientName: r.client_name, from: r.from_day, to: r.to_day, minutes: r.minutes,
    cents: r.cents === null ? null : numeric(r.cents), currency: r.currency, entries: r.entries, sentBy: r.sent_by, sentAt: new Date(r.sent_at).toISOString(),
    published: r.published, cancelled: r.cancelled, invoiced: r.invoiced, invoiceRef: r.invoice_ref, invoiceLink: r.invoice_path ? chest.tools.link("quotes", r.invoice_path) : null,
  }));
}

// What may be handed over for a period: each project's billable time not
// invoiced nor handed over yet, largest first.
export type Sendable = { projectId: string; projectName: string; clientName: string | null; color: string; minutes: number; cents: number; entries: number };

export async function sendable(sql: Query, actor: Member | null, from: unknown, to: unknown): Promise<Sendable[]> {
  if (!can(actor, "invoice")) throw new AppError("forbidden");
  const p = period(from, to);
  const rows = await sql<{ project_id: string; project_name: string; client_name: string | null; color: string; minutes: string; cents: string; entries: number }[]>`
    select e.project_id::text, min(pr.name) as project_name, min(c.name) as client_name, min(pr.color) as color, sum(e.minutes)::text as minutes, ${revenueOf(sql)} as cents, count(*)::int as entries
    from entries e join projects pr on pr.id = e.project_id left join clients c on c.id = pr.client_id
    where e.deleted_at is null and e.billable and e.invoiced_at is null and e.handoff_id is null and e.day between ${p.from} and ${p.to}
    group by e.project_id order by sum(e.minutes) desc limit 200`;
  return rows.map(r => ({ projectId: r.project_id, projectName: r.project_name, clientName: r.client_name, color: r.color, minutes: numeric(r.minutes), cents: Math.round(numeric(r.cents)), entries: r.entries }));
}
