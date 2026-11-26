import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { affected, clean, id, isImpact, limits, optionalText, type Impact } from "./model.ts";

// Incident templates: wording prepared in calm times ("Payments are slow")
// so that, when it breaks, posting is choosing a template, reading it and
// pressing Post. A template is never posted by itself.

export type Template = { id: string; name: string; title: string; body: string; titleSecond: string | null; bodySecond: string | null; states: Record<string, Impact> };

export const maxTemplates = 50;

type Row = { id: string; name: string; title: string; body: string; title_second: string | null; body_second: string | null; states: Record<string, unknown> };

function editor(actor: Member | null): Member {
  if (!actor || !can(actor, "incidents")) throw new AppError("forbidden");
  return actor;
}

// The templates, by name; their services limited to those that still exist.
export async function listTemplates(sql: Query, actor: Member | null): Promise<Template[]> {
  editor(actor);
  const [rows, components] = await Promise.all([
    sql<Row[]>`select id, name, title, body, title_second, body_second, states from templates order by lower(name), id`,
    sql<{ id: string }[]>`select id from components where kind = 'component'`,
  ]);
  const exists = new Set(components.map(c => String(c.id)));
  return rows.map(r => ({
    id: String(r.id),
    name: r.name,
    title: r.title,
    body: r.body,
    titleSecond: r.title_second,
    bodySecond: r.body_second,
    states: Object.fromEntries(Object.entries(r.states ?? {}).filter(([c, s]) => exists.has(c) && isImpact(s))) as Record<string, Impact>,
  }));
}

export type TemplateInput = { name?: unknown; title: unknown; body: unknown; titleSecond?: unknown; bodySecond?: unknown; states?: unknown };

// saveTemplate keeps what an editor typed as a template, named after its
// title unless named; the same name replaces the older one.
export async function saveTemplate(sql: Sql, actor: Member | null, input: TemplateInput): Promise<Template> {
  const who = editor(actor);
  const title = clean(input.title, limits.title);
  const body = clean(input.body, limits.body, { multiline: true });
  const name = input.name === undefined || input.name === "" ? [...title].slice(0, 80).join("") : clean(input.name, 80);
  const titleSecond = optionalText(input.titleSecond, limits.title);
  const bodySecond = optionalText(input.bodySecond, limits.body, { multiline: true });
  const states = Object.fromEntries(affected(input.states ?? {}, { optional: true }));
  return sql.begin(async tx => {
    await tx`delete from templates where lower(name) = lower(${name})`;
    const [{ count }] = (await tx<{ count: number }[]>`select count(*)::int as count from templates`) as unknown as [{ count: number }];
    if (count >= maxTemplates) throw new AppError("too_many", { max: maxTemplates });
    const [row] = await tx<Row[]>`
      insert into templates (name, title, body, title_second, body_second, states, created_by)
      values (${name}, ${title}, ${body}, ${titleSecond}, ${bodySecond}, ${tx.json(states as never)}, ${who.id})
      returning id, name, title, body, title_second, body_second, states`;
    return { id: String(row!.id), name: row!.name, title: row!.title, body: row!.body, titleSecond: row!.title_second, bodySecond: row!.body_second, states: states as Record<string, Impact> };
  });
}

// removeTemplate deletes a template and gives it back as it was, so the
// editor's Undo saves it again (saveTemplate: same name, same words).
export async function removeTemplate(sql: Sql, actor: Member | null, templateId: unknown): Promise<Template> {
  editor(actor);
  const [row] = await sql<Row[]>`delete from templates where id = ${id(templateId)} returning id, name, title, body, title_second, body_second, states`;
  if (!row) throw new AppError("not_found");
  return { id: String(row.id), name: row.name, title: row.title, body: row.body, titleSecond: row.title_second, bodySecond: row.body_second, states: Object.fromEntries(Object.entries(row.states ?? {}).filter(([, s]) => isImpact(s))) as Record<string, Impact> };
}
