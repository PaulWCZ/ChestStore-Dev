import type { Member } from "@argentic/chest-sdk/member";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { listItems, load, manager, type Item } from "./items.ts";
import { id, limits } from "./model.ts";

// The inventory (Snipe-IT's "audit"): a manager opens one, walks the office
// and ticks each thing they see — by scanning its label (a barcode scanner
// types the tag, or the label's link; a phone's camera opens the item's
// page, which offers "Seen"), by typing the tag, or by ticking it in the
// list. What is not seen when it closes is what is missing; each item keeps
// the day it was last seen. One inventory is open at a time. It covers the
// things counted one by one that should be somewhere: not licences, not
// things counted in bulk, not what is lost or retired.
export type Inventory = { id: string; startedBy: string; startedAt: string; closedBy: string | null; closedAt: string | null; total: number | null; seen: number | null };
export type Sighting = { itemId: string; seenBy: string; seenAt: string };

type Row = { id: string; started_by: string; started_at: Date; closed_by: string | null; closed_at: Date | null; total: number | null; seen: number | null };
const shape = (r: Row): Inventory => ({
  id: String(r.id), startedBy: r.started_by, startedAt: new Date(r.started_at).toISOString(), closedBy: r.closed_by,
  closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null, total: r.total, seen: r.seen,
});

// The items an inventory covers now.
const inScope = (sql: Query) => sql`i.deleted_at is null and i.status not in ('retired', 'lost') and c.kind = 'asset'`;

export async function openInventory(sql: Query): Promise<Inventory | null> {
  const [row] = await sql<Row[]>`select * from inventories where closed_at is null limit 1`;
  return row ? shape(row) : null;
}

export async function startInventory(sql: Sql, actor: Member | null): Promise<Inventory> {
  const who = manager(actor);
  return sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(hashtext('equipment.inventory'))`;
    if (await openInventory(tx)) throw new AppError("inventory_open");
    const [row] = await tx<Row[]>`insert into inventories (started_by) values (${who.id}) returning *`;
    return shape(row!);
  });
}

// What an open inventory has seen and not seen yet, in the list's order
// (by tag).
export async function progress(sql: Query, actor: Member | null): Promise<{ inventory: Inventory; seen: (Item & { sighting: Sighting })[]; notSeen: Item[] } | null> {
  const who = manager(actor);
  const inventory = await openInventory(sql);
  if (!inventory) return null;
  const covered = await sql<{ id: string }[]>`select i.id from items i join categories c on c.id = i.category_id where ${inScope(sql)}`;
  const ids = new Set(covered.map(r => String(r.id)));
  const sightings = await sql<{ item_id: string; seen_by: string; seen_at: Date }[]>`select item_id, seen_by, seen_at from sightings where inventory_id = ${inventory.id}`;
  const byItem = new Map(sightings.map(s => [String(s.item_id), { itemId: String(s.item_id), seenBy: s.seen_by, seenAt: new Date(s.seen_at).toISOString() }]));
  const items = ids.size === 0 ? [] : await listItemsById(sql, who, [...ids]);
  const seen = items.filter(i => byItem.has(i.id)).map(i => ({ ...i, sighting: byItem.get(i.id)! })).sort((a, b) => b.sighting.seenAt.localeCompare(a.sighting.seenAt));
  const notSeen = items.filter(i => !byItem.has(i.id));
  return { inventory, seen, notSeen };
}

async function listItemsById(sql: Query, actor: Member, ids: string[]): Promise<Item[]> {
  const out: Item[] = [];
  for (let k = 0; k < ids.length; k += limits.labels) out.push(...(await listItems(sql, actor, { ids: ids.slice(k, k + limits.labels) }, limits.labels)));
  return out.sort((a, b) => a.tag.toLowerCase().localeCompare(b.tag.toLowerCase()));
}

// What a scan or a person typed: a tag ("EQ-0012"), or the link of a label
// (".../chest/items/12").
async function findItem(sql: Query, text: unknown): Promise<Item> {
  if (typeof text !== "string" || text.trim() === "" || text.length > 400) throw new AppError("no_such_tag");
  const value = text.trim();
  const link = /\/chest\/items\/([1-9][0-9]{0,17})(?:[/?#]|$)/u.exec(value);
  if (link) {
    try {
      return await load(sql, link[1]);
    } catch {
      throw new AppError("no_such_tag", { tag: value.slice(0, 40) });
    }
  }
  const [row] = await sql<{ id: string }[]>`select id from items where lower(tag) = lower(${value.slice(0, 40)}) and deleted_at is null`;
  if (!row) throw new AppError("no_such_tag", { tag: value.slice(0, 40) });
  return load(sql, row.id);
}

// Seen: by its tag, its label's link, or its id (a tick, the item's page).
// Seen twice is still seen once (already: true).
export async function markSeen(sql: Sql, actor: Member | null, input: { text?: unknown; itemId?: unknown }): Promise<{ item: Item; already: boolean; outOfScope: boolean }> {
  const who = manager(actor);
  const item = input.itemId !== undefined ? await load(sql, input.itemId) : await findItem(sql, input.text);
  return sql.begin(async tx => {
    const inventory = await openInventory(tx);
    if (!inventory) throw new AppError("no_inventory");
    const added = await tx`insert into sightings (inventory_id, item_id, seen_by) values (${inventory.id}, ${item.id}, ${who.id}) on conflict do nothing returning item_id`;
    const outOfScope = item.category.kind !== "asset" || item.status === "retired" || item.status === "lost";
    return { item, already: added.length === 0, outOfScope };
  });
}

// Undo of a tick.
export async function unmarkSeen(sql: Sql, actor: Member | null, itemId: unknown): Promise<void> {
  manager(actor);
  const key = id(itemId);
  const inventory = await openInventory(sql);
  if (!inventory) throw new AppError("no_inventory");
  await sql`delete from sightings where inventory_id = ${inventory.id} and item_id = ${key}`;
}

// Closing: what was not seen is written down as missing (the list stays
// true after things move on).
export async function closeInventory(sql: Sql, actor: Member | null): Promise<Inventory> {
  const who = manager(actor);
  return sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(hashtext('equipment.inventory'))`;
    const inventory = await openInventory(tx);
    if (!inventory) throw new AppError("no_inventory");
    await tx`insert into inventory_missing (inventory_id, item_id)
      select ${inventory.id}, i.id from items i join categories c on c.id = i.category_id
      where ${inScope(tx)} and not exists (select 1 from sightings s where s.inventory_id = ${inventory.id} and s.item_id = i.id)`;
    const [counts] = await tx<{ total: number; seen: number }[]>`
      select (select count(*) from inventory_missing where inventory_id = ${inventory.id})::int
        + (select count(*) from sightings s join items i on i.id = s.item_id join categories c on c.id = i.category_id where s.inventory_id = ${inventory.id} and ${inScope(tx)})::int as total,
        (select count(*) from sightings s join items i on i.id = s.item_id join categories c on c.id = i.category_id where s.inventory_id = ${inventory.id} and ${inScope(tx)})::int as seen`;
    const [row] = await tx<Row[]>`update inventories set closed_at = now(), closed_by = ${who.id}, total = ${counts!.total}, seen = ${counts!.seen} where id = ${inventory.id} returning *`;
    return shape(row!);
  });
}

// Undo of a close, soon after: the inventory goes on.
export async function reopenInventory(sql: Sql, actor: Member | null, inventoryId: unknown): Promise<Inventory> {
  manager(actor);
  const key = id(inventoryId);
  return sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(hashtext('equipment.inventory'))`;
    if (await openInventory(tx)) throw new AppError("inventory_open");
    const [latest] = await tx<{ id: string }[]>`select id from inventories order by id desc limit 1`;
    if (!latest || String(latest.id) !== key) throw new AppError("not_found");
    await tx`delete from inventory_missing where inventory_id = ${key}`;
    const [row] = await tx<Row[]>`update inventories set closed_at = null, closed_by = null, total = null, seen = null where id = ${key} returning *`;
    return shape(row!);
  });
}

export async function pastInventories(sql: Query, actor: Member | null): Promise<Inventory[]> {
  manager(actor);
  return (await sql<Row[]>`select * from inventories where closed_at is not null order by id desc limit 20`).map(shape);
}

// A closed inventory: what it missed, as the items are now.
export async function report(sql: Query, actor: Member | null, inventoryId: unknown): Promise<{ inventory: Inventory; missing: Item[] }> {
  const who = manager(actor);
  const [row] = await sql<Row[]>`select * from inventories where id = ${id(inventoryId)} and closed_at is not null`;
  if (!row) throw new AppError("not_found");
  const missing = await sql<{ item_id: string }[]>`select m.item_id from inventory_missing m join items i on i.id = m.item_id where m.inventory_id = ${row.id} and i.deleted_at is null`;
  return { inventory: shape(row), missing: missing.length === 0 ? [] : await listItemsById(sql, who, missing.map(m => String(m.item_id))) };
}

// When an item was last seen in an inventory, and whether the last one
// closed missed it.
export async function lastSeen(sql: Query, itemId: string): Promise<{ seenAt: string | null; seenBy: string | null; missedIn: string | null; openSeen: boolean }> {
  const [seen] = await sql<{ seen_at: Date; seen_by: string }[]>`select seen_at, seen_by from sightings where item_id = ${itemId} order by seen_at desc limit 1`;
  const [last] = await sql<{ id: string; closed_at: Date }[]>`select id, closed_at from inventories where closed_at is not null order by id desc limit 1`;
  const missed = last ? (await sql`select 1 from inventory_missing where inventory_id = ${last.id} and item_id = ${itemId}`).length > 0 : false;
  const open = await openInventory(sql);
  const openSeen = open ? (await sql`select 1 from sightings where inventory_id = ${open.id} and item_id = ${itemId}`).length > 0 : false;
  return {
    seenAt: seen ? new Date(seen.seen_at).toISOString() : null, seenBy: seen?.seen_by ?? null,
    missedIn: missed && last ? new Date(last.closed_at).toISOString() : null, openSeen,
  };
}

// Lifecycle: an erased manager's ticks keep only "erased".
export async function eraseSightings(sql: Query, member: string): Promise<void> {
  await sql`update sightings set seen_by = 'erased' where seen_by = ${member}`;
  await sql`update inventories set started_by = 'erased' where started_by = ${member}`;
  await sql`update inventories set closed_by = 'erased' where closed_by = ${member}`;
}
