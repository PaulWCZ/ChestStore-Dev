import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { chestLanguage, otherLanguage, writtenIn } from "./languages.ts";
import { clean, id, limits, optionalText } from "./model.ts";
import { pick } from "./texts.ts";

// Components and groups: what the status page lists, in the editors' order.
export type Component = {
  id: string;
  kind: "component" | "group";
  parentId: string | null;
  name: string;
  description: string;
  position: number;
  hidden: boolean;
  // For the team only: on the members' status page, never on the public one.
  teamOnly: boolean;
  createdAt: Date;
  // Name and description are written in `language`; nameSecond and
  // descriptionSecond (optional) in the tool's other language. `lang` is
  // the language of name and description as given (the reader's when
  // allComponents was asked for one and a version in it exists).
  language: string;
  nameSecond: string | null;
  descriptionSecond: string | null;
  lang: string;
};

type Row = { id: string; kind: "component" | "group"; parent_id: string | null; name: string; description: string; position: number; hidden: boolean; team_only: boolean; created_at: Date; language: string | null; name_second: string | null; description_second: string | null };
const shape = (r: Row): Component => {
  const language = r.language ?? chestLanguage();
  return { id: String(r.id), kind: r.kind, parentId: r.parent_id === null ? null : String(r.parent_id), name: r.name, description: r.description, position: r.position, hidden: r.hidden, teamOnly: r.team_only, createdAt: new Date(r.created_at), language, nameSecond: r.name_second, descriptionSecond: r.description_second, lang: language };
};
const fields = "id, kind, parent_id, name, description, position, hidden, team_only, created_at, language, name_second, description_second";

// The languages of a service's texts, for pick().
const languagesOf = (c: Pick<Component, "language" | "nameSecond" | "descriptionSecond">) => ({ language: c.language, secondLanguage: c.nameSecond || c.descriptionSecond ? otherLanguage(c.language) : null });

// inLocale gives a service's name and description in a reader's language
// when it has them, else as written (marked with their language).
export function inLocale<T extends Component>(c: T, locale: string): T {
  const name = pick(c.name, c.nameSecond, languagesOf(c), locale);
  const description = pick(c.description, c.descriptionSecond, languagesOf(c), locale).text;
  return { ...c, name: name.text, description, lang: name.lang };
}

// Every component and group, groups before their components, in order —
// as written, or in a reader's language (`locale`).
export async function allComponents(sql: Query, options: { locale?: string } = {}): Promise<Component[]> {
  const rows = await sql<Row[]>`select ${sql.unsafe(fields)} from components order by position, id`;
  const list = rows.map(shape);
  return options.locale ? list.map(c => inLocale(c, options.locale!)) : list;
}

// A tree as pages show it: top-level entries in order, each group with its
// components in order. shown: what visitors see (not hidden, not for the
// team only); team: what the team's page shows (not hidden).
export type Entry = Component & { children: Component[] };
export function tree(list: Component[], options: { shown?: boolean; team?: boolean } = {}): Entry[] {
  const visible = options.shown ? list.filter(c => !c.hidden && (options.team || !c.teamOnly)) : list;
  const top = visible.filter(c => c.parentId === null);
  return top.map(c => ({ ...c, children: visible.filter(k => k.parentId === c.id) })).filter(e => !(options.shown && e.kind === "group" && e.children.length === 0));
}

// The components a visitor sees: a hidden group hides its components; a
// service for the team only is never public (a group holding nothing else
// disappears with it). The team's page
// (team: true) shows those too.
export function shownComponents(list: Component[], options: { team?: boolean } = {}): Component[] {
  const off = (c: Component) => c.hidden || (!options.team && c.teamOnly);
  const hiddenGroups = new Set(list.filter(c => c.kind === "group" && off(c)).map(c => c.id));
  return list.filter(c => c.kind === "component" && !off(c) && !(c.parentId && hiddenGroups.has(c.parentId)));
}

function check(actor: Member | null): void {
  if (!can(actor, "components")) throw new AppError("forbidden");
}

async function one(sql: Query, componentId: string): Promise<Component> {
  const [row] = await sql<Row[]>`select ${sql.unsafe(fields)} from components where id = ${componentId}`;
  if (!row) throw new AppError("not_found");
  return shape(row);
}

async function groupOf(sql: Query, value: unknown): Promise<string | null> {
  if (value === null || value === undefined || value === "") return null;
  const parent = await one(sql, id(value));
  if (parent.kind !== "group") throw new AppError("invalid");
  return parent.id;
}

// language: the "Written in" of the form (the editor's own when not
// given); second: the name and description in the other language.
export type Second = { name?: unknown; description?: unknown } | null | undefined;
export type ComponentInput = { name: unknown; description?: unknown; parentId?: unknown; kind?: unknown; teamOnly?: unknown; language?: unknown; second?: Second };

export async function addComponent(sql: Sql, actor: Member | null, input: ComponentInput): Promise<Component> {
  check(actor);
  const kind = input.kind === "group" ? "group" : "component";
  const name = clean(input.name, limits.componentName);
  const description = clean(input.description ?? "", limits.componentDescription, { optional: true });
  const language = writtenIn(input.language, actor);
  const nameSecond = optionalText(input.second?.name, limits.componentName);
  const descriptionSecond = optionalText(input.second?.description, limits.componentDescription);
  return sql.begin(async tx => {
    const parentId = kind === "group" ? null : await groupOf(tx, input.parentId);
    const [{ count }] = (await tx<{ count: number }[]>`select count(*)::int as count from components`) as unknown as [{ count: number }];
    if (count >= limits.components) throw new AppError("too_many", { max: limits.components });
    const [{ next }] = (await tx<{ next: number }[]>`select coalesce(max(position), -1)::int + 1 as next from components where parent_id is not distinct from ${parentId}`) as unknown as [{ next: number }];
    const [row] = await tx<Row[]>`
      insert into components (kind, parent_id, name, description, position, team_only, language, name_second, description_second)
      values (${kind}, ${parentId}, ${name}, ${description}, ${next}, ${kind === "component" && input.teamOnly === true}, ${language}, ${nameSecond}, ${descriptionSecond})
      returning ${tx.unsafe(fields)}`;
    return shape(row!);
  });
}

// second: the other language's name and description (an empty one removes
// it); left out, they stay.
export async function updateComponent(sql: Sql, actor: Member | null, componentId: unknown, input: { name?: unknown; description?: unknown; parentId?: unknown; hidden?: unknown; teamOnly?: unknown; second?: Second }): Promise<Component> {
  check(actor);
  const key = id(componentId);
  return sql.begin(async tx => {
    const c = await one(tx, key);
    const name = input.name === undefined ? c.name : clean(input.name, limits.componentName);
    const description = input.description === undefined ? c.description : clean(input.description, limits.componentDescription, { optional: true });
    const hidden = input.hidden === undefined ? c.hidden : input.hidden === true;
    const nameSecond = input.second?.name === undefined ? c.nameSecond : optionalText(input.second.name, limits.componentName);
    const descriptionSecond = input.second?.description === undefined ? c.descriptionSecond : optionalText(input.second.description, limits.componentDescription);
    // Only a service is for the team only; a group follows its services.
    const teamOnly = c.kind === "component" && (input.teamOnly === undefined ? c.teamOnly : input.teamOnly === true);
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
      update components set name = ${name}, description = ${description}, hidden = ${hidden}, team_only = ${teamOnly}, parent_id = ${parentId}, position = ${position},
        language = ${c.language}, name_second = ${nameSecond}, description_second = ${descriptionSecond}
      where id = ${key} returning ${tx.unsafe(fields)}`;
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
// It gives back what it deleted, for the editor's Undo (putBack).
export async function removeComponent(sql: Sql, actor: Member | null, componentId: unknown): Promise<Component> {
  check(actor);
  const key = id(componentId);
  return sql.begin(async tx => {
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
    return c;
  });
}

// putBack undoes a deletion: the component or group again, with its name,
// description, group, place in the list, hidden and team-only marks (a new
// id: nothing referred to the old one but subscribers' choices, which do
// not come back — they follow everything or their other choices). Checked
// like addComponent: an editor could add it by hand.
export type Snapshot = { kind?: unknown; name: unknown; description?: unknown; parentId?: unknown; position?: unknown; hidden?: unknown; teamOnly?: unknown; language?: unknown; nameSecond?: unknown; descriptionSecond?: unknown };
export async function putBack(sql: Sql, actor: Member | null, snapshot: Snapshot): Promise<Component> {
  check(actor);
  const kind = snapshot.kind === "group" ? "group" : "component";
  const name = clean(snapshot.name, limits.componentName);
  const description = clean(snapshot.description ?? "", limits.componentDescription, { optional: true });
  const language = writtenIn(snapshot.language, actor);
  const nameSecond = optionalText(snapshot.nameSecond, limits.componentName);
  const descriptionSecond = optionalText(snapshot.descriptionSecond, limits.componentDescription);
  const position = typeof snapshot.position === "number" && Number.isInteger(snapshot.position) && snapshot.position >= 0 && snapshot.position < 100000 ? snapshot.position : null;
  return sql.begin(async tx => {
    const parentId = kind === "group" ? null : await groupOf(tx, snapshot.parentId);
    const [{ count }] = (await tx<{ count: number }[]>`select count(*)::int as count from components`) as unknown as [{ count: number }];
    if (count >= limits.components) throw new AppError("too_many", { max: limits.components });
    const [{ next }] = (await tx<{ next: number }[]>`select coalesce(max(position), -1)::int + 1 as next from components where parent_id is not distinct from ${parentId}`) as unknown as [{ next: number }];
    const [row] = await tx<Row[]>`
      insert into components (kind, parent_id, name, description, position, hidden, team_only, language, name_second, description_second)
      values (${kind}, ${parentId}, ${name}, ${description}, ${position ?? next}, ${snapshot.hidden === true}, ${kind === "component" && snapshot.teamOnly === true}, ${language}, ${nameSecond}, ${descriptionSecond})
      returning ${tx.unsafe(fields)}`;
    return shape(row!);
  });
}
