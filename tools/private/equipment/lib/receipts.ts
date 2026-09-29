import * as chest from "@argentic/chest-sdk/chest";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { allFields, valuesOf, type Field } from "./fields.ts";
import { browser, load, manager, record, receiptShape, type Item, type Receipt } from "./items.ts";
import { addDays, clean, id, limits, memberId, optional } from "./model.ts";
import * as tell from "./tell.ts";
import { withdraw } from "./notify.ts";

// "I received it": when an item is given to a person, it waits in their
// "My equipment" until they confirm — when, in what condition (a remark),
// having read the company's rules if a manager set them. The receipt and
// the history keep it; the managers read it, and print it on the handover
// sheet (what a French company keeps as its "fiche de remise de matériel",
// the proof it relies on when a laptop is not returned). A return sheet
// says what came back, and what did not.

// ---- The rules (charter) ---------------------------------------------------

export type Charter = { id: string; body: string; createdAt: string; createdBy: string };

// The rules in force: the newest version, unless it is empty (no rules).
export async function currentCharter(sql: Query): Promise<Charter | null> {
  const [row] = await sql<{ id: string; body: string; created_at: Date; created_by: string }[]>`select id, body, created_at, created_by from charters order by id desc limit 1`;
  if (!row || row.body.trim() === "") return null;
  return { id: String(row.id), body: row.body, createdAt: new Date(row.created_at).toISOString(), createdBy: row.created_by };
}

export async function charterById(sql: Query, charterId: string): Promise<Charter | null> {
  const [row] = await sql<{ id: string; body: string; created_at: Date; created_by: string }[]>`select id, body, created_at, created_by from charters where id = ${charterId}`;
  return row ? { id: String(row.id), body: row.body, createdAt: new Date(row.created_at).toISOString(), createdBy: row.created_by } : null;
}

// A manager writes the rules (or clears them): a new version, the old ones
// stay for the receipts that name them.
export async function setCharter(sql: Sql, actor: Member | null, bodyValue: unknown): Promise<Charter | null> {
  const who = manager(actor);
  const body = clean(bodyValue, limits.charter, { multiline: true, optional: true });
  const current = await currentCharter(sql);
  if ((current?.body ?? "") === body) return current;
  await sql`insert into charters (body, created_by) values (${body}, ${who.id})`;
  return currentCharter(sql);
}

// ---- Confirming --------------------------------------------------------------

// confirm: the holder says they received the item. With rules in force,
// they must have seen that very version (charterId); a remark ("scratch on
// the lid") goes to the managers.
export async function confirm(sql: Sql, actor: Member | null, itemId: unknown, input: { remark?: unknown; charterId?: unknown } = {}): Promise<Receipt> {
  const who = browser(actor);
  const remark = optional(input.remark, limits.remark, { multiline: true });
  const result = await sql.begin(async tx => {
    const item = await load(tx, itemId, { lock: true });
    if (item.holder !== who.id) throw new AppError(can(who, "items.manage") ? "not_yours" : "not_found");
    const [open] = await tx<{ id: string; confirmed_at: Date | null }[]>`
      select id, confirmed_at from receipts where item_id = ${item.id} and member_id = ${who.id} and closed_at is null order by id desc limit 1 for update`;
    if (open?.confirmed_at) throw new AppError("already_confirmed");
    const charter = await currentCharter(tx);
    if (charter && String(input.charterId ?? "") !== charter.id) throw new AppError("charter_changed");
    let receiptId = open?.id;
    // Held without a receipt (imported, or given before receipts existed):
    // one is made now, from what the history says.
    if (!receiptId) {
      const [row] = await tx<{ id: string }[]>`
        insert into receipts (item_id, member_id, given_by, given_on, condition)
        values (${item.id}, ${who.id}, (select coalesce((select actor from history where item_id = ${item.id} and kind = 'given' order by id desc limit 1), 'chest')),
          ${item.heldSince ?? chest.today()}, (select note from history where item_id = ${item.id} and kind = 'given' order by id desc limit 1))
        returning id`;
      receiptId = row!.id;
    }
    await tx`update receipts set confirmed_at = now(), remark = ${remark}, charter_id = ${charter?.id ?? null} where id = ${receiptId}`;
    await record(tx, { item: item.id, actor: who.id, kind: "received", member: who.id, note: remark, ref: charter ? `charter:${charter.id}` : null });
    const [row] = await tx<Parameters<typeof receiptShape>[0][]>`
      select id, member_id, given_by, to_char(given_on, 'YYYY-MM-DD') as given_on, condition, confirmed_at, remark, charter_id from receipts where id = ${receiptId}`;
    return { item, receipt: receiptShape(row!) };
  });
  await withdraw(`item:${result.item.id}:given`, [who.id]);
  if (remark) await tell.receivedWithRemark(who, result.item, remark);
  await tell.refreshBadges(sql, [who.id]);
  return result.receipt;
}

// ---- The sheets ---------------------------------------------------------------

export type SheetLine = {
  item: Pick<Item, "id" | "tag" | "name" | "serial" | "category">;
  fields: { name: string; value: string }[];
  givenOn: string | null;
  givenBy: string | null;
  condition: string | null;
  confirmedAt: string | null;
  remark: string | null;
};
export type ReturnLine = Omit<SheetLine, "confirmedAt" | "remark"> & { returnedOn: string | null; returnedTo: string | null; returnCondition: string | null; status: string | null };

function mayRead(actor: Member | null, member: string): Member {
  const who = browser(actor);
  if (who.id !== member && !can(who, "items.manage")) throw new AppError("not_found");
  return who;
}

const fieldsFor = (all: Field[], item: Item) => valuesOf(all.filter(f => f.categoryId === item.category.id), item.extra).map(v => ({ name: v.field.name, value: v.value }));

// The handover sheet: what a person holds (or only the items named), each
// with when and by whom it was given, its condition, and their receipt;
// the rules they accepted. Licences are listed apart, without receipts.
export async function handoverSheet(sql: Query, actor: Member | null, holder: unknown, only?: string[]): Promise<{ lines: SheetLine[]; licences: string[]; charter: Charter | null }> {
  const h = memberId(holder);
  mayRead(actor, h);
  const ids = only?.map(x => id(x)).slice(0, 200);
  const rows = await sql<{ id: string }[]>`
    select id from items where holder = ${h} and deleted_at is null ${ids && ids.length > 0 ? sql`and id = any(${ids})` : sql``} order by held_since, id limit 200`;
  const all = await allFields(sql);
  const lines: SheetLine[] = [];
  let charterId: string | null = null;
  for (const { id: itemId } of rows) {
    const item = await load(sql, itemId);
    const [r] = await sql<{ given_on: string; given_by: string; condition: string | null; confirmed_at: Date | null; remark: string | null; charter_id: string | null }[]>`
      select to_char(given_on, 'YYYY-MM-DD') as given_on, given_by, condition, confirmed_at, remark, charter_id from receipts
      where item_id = ${item.id} and member_id = ${h} and closed_at is null order by id desc limit 1`;
    if (r?.charter_id) charterId = String(r.charter_id);
    lines.push({
      item, fields: fieldsFor(all, item), givenOn: r?.given_on ?? item.heldSince, givenBy: r?.given_by ?? null, condition: r?.condition ?? null,
      confirmedAt: r?.confirmed_at ? new Date(r.confirmed_at).toISOString() : null, remark: r?.remark ?? null,
    });
  }
  const licences = ids && ids.length > 0 ? [] : (await sql<{ name: string }[]>`
    select i.name from seats s join items i on i.id = s.item_id where s.member_id = ${h} and i.deleted_at is null order by lower(i.name)`).map(r => r.name);
  // The rules printed are those the person accepted, or those in force.
  const charter = charterId ? await charterById(sql, charterId) : await currentCharter(sql);
  return { lines, licences, charter: charter && charter.body.trim() ? charter : null };
}

// The return sheet: what came back from a person in the last days (90 by
// default), with its condition, and what they still hold — "not returned".
export async function returnSheet(sql: Query, actor: Member | null, holder: unknown, days = 90): Promise<{ returned: ReturnLine[]; kept: SheetLine[] }> {
  const h = memberId(holder);
  mayRead(actor, h);
  const since = addDays(chest.today(), -Math.min(Math.max(days, 1), 3660));
  const rows = await sql<{ item_id: string; day: string | null; at: Date; actor: string; note: string | null; status: string | null }[]>`
    select distinct on (h.item_id) h.item_id, to_char(h.day, 'YYYY-MM-DD') as day, h.at, h.actor, h.note, h.status
    from history h join items i on i.id = h.item_id
    where h.kind = 'returned' and h.member = ${h} and coalesce(h.day, h.at::date) >= ${since} and i.deleted_at is null
      and (i.holder is distinct from ${h})
    order by h.item_id, h.id desc limit 200`;
  const all = await allFields(sql);
  const returned: ReturnLine[] = [];
  for (const r of rows) {
    const item = await load(sql, r.item_id);
    const [given] = await sql<{ given_on: string; given_by: string; condition: string | null }[]>`
      select to_char(given_on, 'YYYY-MM-DD') as given_on, given_by, condition from receipts where item_id = ${item.id} and member_id = ${h} order by id desc limit 1`;
    returned.push({
      item, fields: fieldsFor(all, item), givenOn: given?.given_on ?? null, givenBy: given?.given_by ?? null, condition: given?.condition ?? null,
      returnedOn: r.day ?? new Date(r.at).toISOString().slice(0, 10), returnedTo: r.actor, returnCondition: r.note, status: r.status,
    });
  }
  returned.sort((a, b) => (a.returnedOn ?? "").localeCompare(b.returnedOn ?? "") || a.item.tag.localeCompare(b.item.tag));
  const kept = (await handoverSheet(sql, actor, h)).lines;
  return { returned, kept };
}

// The receipts still waiting, for the managers (a person's page, the item).
export async function waitingCount(sql: Query, actor: Member | null, holder: string): Promise<number> {
  manager(actor);
  const [row] = await sql<{ n: number }[]>`
    select count(*)::int as n from receipts r join items i on i.id = r.item_id
    where r.member_id = ${holder} and r.confirmed_at is null and r.closed_at is null and i.holder = ${holder} and i.deleted_at is null`;
  return row?.n ?? 0;
}

// Used by the lifecycle: an erased person's receipts keep only "erased".
export async function eraseReceipts(sql: Query, member: string): Promise<void> {
  await sql`update receipts set member_id = 'erased' where member_id = ${member}`;
  await sql`update receipts set given_by = 'erased' where given_by = ${member}`;
  await sql`update charters set created_by = 'erased' where created_by = ${member}`;
}
