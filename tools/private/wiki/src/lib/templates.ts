import type { Member } from "@argentic/chest-sdk/member";
import type { Query, Sql } from "./db.ts";
import { normalize, type Doc } from "./doc.ts";
import { AppError } from "./errors.ts";
import type { Catalogue } from "../i18n/index.ts";
import { fromMarkdown } from "./markdown.ts";
import { isId, limits } from "./model.ts";
import { createPage, page } from "./pages.ts";
import { space } from "./spaces.ts";

// Templates: a new page may start blank, from a page its space's editors
// marked as a template, or from one of a few built-in models written in the
// editor's language (the catalogues' "templates.builtin"). Starting from a
// template copies its content once: the new page is then a page like any
// other, and changing the template later changes only pages made after.

export const builtins = ["meeting", "howto", "decision"] as const;
export type Builtin = (typeof builtins)[number];

// A choice of the "New page" dialog: "blank", "builtin:<key>" or a page's id.
export type Start = "blank" | `builtin:${Builtin}` | string;

// setTemplate marks a page as a template of its space, or not (editors).
export async function setTemplate(sql: Sql, actor: Member | null, pageId: unknown, on: unknown): Promise<boolean> {
  if (typeof on !== "boolean") throw new AppError("invalid");
  const p = await page(sql, actor, pageId, "write");
  await sql`update pages set template = ${on} where id = ${p.id}`;
  return on;
}

// The templates of a space, for an editor creating a page there.
export async function spaceTemplates(sql: Query, actor: Member | null, spaceId: unknown): Promise<{ id: string; title: string }[]> {
  const s = await space(sql, actor, spaceId, "write");
  const found = await sql<{ id: string; title: string }[]>`
    select id, title from pages where space_id = ${s.id} and template and deleted_at is null
    order by lower(title), id limit ${limits.templatesShown}`;
  return found.map(r => ({ id: String(r.id), title: r.title }));
}

// startingDoc is the document a new page starts with, checked: a template
// must be one of the very space the page goes in, and seen by the actor.
export async function startingDoc(sql: Query, actor: Member | null, spaceId: string, start: unknown, t: Catalogue): Promise<Doc | undefined> {
  if (start === undefined || start === null || start === "" || start === "blank") return undefined;
  if (typeof start !== "string") throw new AppError("invalid");
  const builtin = /^builtin:([a-z]+)$/u.exec(start)?.[1];
  if (builtin !== undefined) {
    if (!(builtins as readonly string[]).includes(builtin)) throw new AppError("invalid");
    return normalize(fromMarkdown(t.templates.builtin[builtin as Builtin].body));
  }
  if (!isId(start)) throw new AppError("invalid");
  const model = await page(sql, actor, start);
  if (!model.template || model.spaceId !== spaceId) throw new AppError("not_found");
  return model.doc;
}

// createFrom creates a page from a starting choice.
export async function createFrom(sql: Sql, actor: Member | null, input: { spaceId: unknown; parentId?: unknown; title: unknown; start?: unknown }, t: Catalogue): Promise<{ id: string }> {
  const s = await space(sql, actor, input.spaceId, "write");
  const doc = await startingDoc(sql, actor, s.id, input.start, t);
  return createPage(sql, actor, { spaceId: s.id, parentId: input.parentId, title: input.title, ...(doc ? { doc } : {}) });
}
