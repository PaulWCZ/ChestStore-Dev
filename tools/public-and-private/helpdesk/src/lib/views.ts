import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Sql } from "./db.ts";
import { clean, id, isFolder, isPriority, isSort } from "./model.ts";

// Views the team saves: a name for what the inbox shows ("Urgent
// deliveries": the Open folder, tag Delivery, most urgent first), in the
// side column for everyone who answers. The inbox's address parameters,
// checked: folder, words, priority, tag, order.

export type ViewParams = { folder?: string; q?: string; priority?: string; tag?: string; sort?: string };
export type View = { id: string; name: string; params: ViewParams; createdBy: string };
export const maxViews = 20;

export function viewParams(value: unknown): ViewParams {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const out: ViewParams = {};
  if (isFolder(v["folder"])) out.folder = v["folder"];
  if (typeof v["q"] === "string" && v["q"].trim()) out.q = v["q"].trim().slice(0, 100);
  if (isPriority(v["priority"])) out.priority = v["priority"];
  if (typeof v["tag"] === "string" && /^[1-9][0-9]{0,17}$/u.test(v["tag"])) out.tag = v["tag"];
  if (isSort(v["sort"])) out.sort = v["sort"];
  return out;
}

// The address of a view: /chest?… (the inbox reads the same parameters).
export function viewHref(params: ViewParams): string {
  const search = new URLSearchParams(Object.entries(params).filter(([, v]) => typeof v === "string" && v !== "") as [string, string][]);
  return `/chest?${search.toString()}`;
}

export async function listViews(sql: Sql, actor: Member | null): Promise<View[]> {
  if (!can(actor, "tickets.read")) throw new AppError("forbidden");
  const rows = await sql<{ id: string; name: string; params: unknown; created_by: string }[]>`select id, name, params, created_by from saved_views order by lower(name), id`;
  return rows.map(r => ({ id: String(r.id), name: r.name, params: viewParams(r.params), createdBy: r.created_by }));
}

// saveView keeps what the inbox shows under a name (something must be
// chosen: a view of the default inbox says nothing).
export async function saveView(sql: Sql, actor: Member | null, name: unknown, params: unknown): Promise<View> {
  if (!actor || !can(actor, "tickets.answer")) throw new AppError("forbidden");
  const text = clean(name, 40);
  const checked = viewParams(params);
  if (Object.keys(checked).length === 0) throw new AppError("invalid");
  const [count] = await sql<{ n: number }[]>`select count(*)::int as n from saved_views`;
  if ((count?.n ?? 0) >= maxViews) throw new AppError("too_many", { max: maxViews });
  const [row] = await sql<{ id: string }[]>`insert into saved_views (name, params, created_by) values (${text}, ${sql.json(checked as never)}, ${actor.id}) returning id`;
  return { id: String(row!.id), name: text, params: checked, createdBy: actor.id };
}

// removeView: whoever made it, or an administrator. Says what undoing needs.
export async function removeView(sql: Sql, actor: Member | null, viewId: unknown): Promise<{ name: string; params: ViewParams }> {
  if (!actor || !can(actor, "tickets.answer")) throw new AppError("forbidden");
  const [row] = await sql<{ name: string; params: unknown; created_by: string }[]>`select name, params, created_by from saved_views where id = ${id(viewId)}`;
  if (!row) throw new AppError("not_found");
  if (row.created_by !== actor.id && !can(actor, "settings")) throw new AppError("forbidden");
  await sql`delete from saved_views where id = ${id(viewId)}`;
  return { name: row.name, params: viewParams(row.params) };
}
