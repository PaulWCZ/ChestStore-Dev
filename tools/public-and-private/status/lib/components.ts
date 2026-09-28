import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { clean, id, limits } from "./model.ts";

// Components and groups: what the status page lists, in the editors' order.
export type Component = {
  id: string;
  kind: "component" | "group";
  parentId: string | null;
  name: string;
  description: string;
  position: number;
  hidden: boolean;
  createdAt: Date;
};

type Row = { id: string; kind: "component" | "group"; parent_id: string | null; name: string; description: string; position: number; hidden: boolean; created_at: Date };
const shape = (r: Row): Component => ({ id: String(r.id), kind: r.kind, parentId: r.parent_id === null ? null : String(r.parent_id), name: r.name, description: r.description, position: r.position, hidden: r.hidden, createdAt: new Date(r.created_at) });

// Every component and group, groups before their components, in order.
export async function allComponents(sql: Query): Promise<Component[]> {
  const rows = await sql<Row[]>`select id, kind, parent_id, name, description, position, hidden, created_at from components order by position, id`;
  return rows.map(shape);
}

// A tree as pages show it: top-level entries in order, each group with its
// components in order.
export type Entry = Component & { children: Component[] };
export function tree(list: Component[], options: { shown?: boolean } = {}): Entry[] {
  const visible = options.shown ? list.filter(c => !c.hidden) : list;
  const top = visible.filter(c => c.parentId === null);
  return top.map(c => ({ ...c, children: visible.filter(k => k.parentId === c.id) })).filter(e => !(options.shown && e.kind === "group" && e.children.length === 0));
}

// The components a visitor sees: a hidden group hides its components.
export function shownComponents(list: Component[]): Component[] {
  const hiddenGroups = new Set(list.filter(c => c.kind === "group" && c.hidden).map(c => c.id));
  return list.filter(c => c.kind === "component" && !c.hidden && !(c.parentId && hiddenGroups.has(c.parentId)));
}

function check(actor: Member | null): void {
  if (!can(actor, "components")) throw new AppError("forbidden");
}

async function one(sql: Query, componentId: string): Promise<Component> {
  const [row] = await sql<Row[]>`select id, kind, parent_id, name, description, position, hidden, created_at from components where id = ${componentId}`;
  if (!row) throw new AppError("not_found");
  return shape(row);
}

async function groupOf(sql: Query, value: unknown): Promise<string | null> {
  if (value === null || value === undefined || value === "") return null;
  const parent = await one(sql, id(value));
  if (parent.kind !== "group") throw new AppError("invalid");
  return parent.id;
}

export type ComponentInput = { name: unknown; description?: unknown; parentId?: unknown; kind?: unknown };

export async function addComponent(sql: Sql, actor: Member | null, input: ComponentInput): Promise<Component> {
  check(actor);
  const kind = input.kind === "group" ? "group" : "component";
  const name = clean(input.name, limits.componentName);
  const description = clean(input.description ?? "", limits.componentDescription, { optional: true });
  return sql.begin(async tx => {
    const parentId = kind === "group" ? null : await groupOf(tx, input.parentId);
    const [{ count }] = (await tx<{ count: number }[]>`select count(*)::int as count from components`) as unknown as [{ count: number }];
    if (count >= limits.components) throw new AppError("too_many", { max: limits.components });
    const [{ next }] = (await tx<{ next: number }[]>`select coalesce(max(position), -1)::int + 1 as next from components where parent_id is not distinct from ${parentId}`) as unknown as [{ next: number }];
    const [row] = await tx<Row[]>`
      insert into components (kind, parent_id, name, description, position)
      values (${kind}, ${parentId}, ${name}, ${description}, ${next})
      returning id, kind, parent_id, name, description, position, hidden, created_at`;
    return shape(row!);
  });
}

export async function updateComponent(sql: Sql, actor: Member | null, componentId: unknown, input: { name?: unknown; description?: unknown; parentId?: unknown; hidden?: unknown }): Promise<Component> {
  check(actor);
  const key = id(componentId);
  return sql.begin(async tx => {
    const c = await one(tx, key);
    const name = input.name === undefined ? c.name : clean(input.name, limits.componentName);
    const description = input.description === undefined ? c.description : clean(input.description, limits.componentDescription, { optional: true });
    const hidden = input.hidden === undefined ? c.hidden : input.hidden === true;
    let parentId = c.parentId;
    let position = c.position;
    if (input.parentId !== undefined && c.kind === "component") {
      parentId = await groupOf(tx, input.parentId);
      if (parentId !== c.parentId) {
        const [{ next }] = (await tx<{ next: number }[]>`select coalesce(max(position), -1)::int + 1 as next from components where parent_id is not distinct from ${parentId}`) as unknown as [{ next: number }];
        position = next;
      }
    }
    const [row] = await tx<Row[]>`
      update components set name = ${name}, description = ${description}, hidden = ${hidden}, parent_id = ${parentId}, position = ${position}
      where id = ${key} returning id, kind, parent_id, name, description, position, hidden, created_at`;
    return shape(row!);
  });
}

// move swaps a component with its neighbour among its siblings.
export async function moveComponent(sql: Sql, actor: Member | null, componentId: unknown, direction: unknown): Promise<void> {
  check(actor);
  if (direction !== "up" && direction !== "down") throw new AppError("invalid");
  const key = id(componentId);
  await sql.begin(async tx => {
    const c = await one(tx, key);
    const siblings = (await tx<{ id: string }[]>`select id from components where parent_id is not distinct from ${c.parentId} order by position, id`).map(r => String(r.id));
    const at = siblings.indexOf(c.id);
    const to = direction === "up" ? at - 1 : at + 1;
    if (at < 0 || to < 0 || to >= siblings.length) return;
    [siblings[at], siblings[to]] = [siblings[to]!, siblings[at]!];
    for (const [position, sibling] of siblings.entries()) await tx`update components set position = ${position} where id = ${sibling}`;
  });
}

// removeComponent deletes a component nobody reported on yet; one with a
// history is hidden instead (its past stays true), a group must be empty.
export async function removeComponent(sql: Sql, actor: Member | null, componentId: unknown): Promise<void> {
  check(actor);
  const key = id(componentId);
  await sql.begin(async tx => {
    const c = await one(tx, key);
    if (c.kind === "group") {
      const [child] = await tx`select 1 from components where parent_id = ${key} limit 1`;
      if (child) throw new AppError("has_children");
    } else {
      const [used] = await tx`select 1 from update_states where component_id = ${key} union all select 1 from maintenance_components where component_id = ${key} limit 1`;
      if (used) throw new AppError("in_use");
    }
    await tx`update subscribers set components = array_remove(components, ${key}::bigint) where ${key}::bigint = any(components)`;
    await tx`delete from components where id = ${key}`;
  });
}
