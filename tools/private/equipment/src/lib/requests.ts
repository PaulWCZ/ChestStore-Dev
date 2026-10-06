import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "@argentic/chest-app";
import { category } from "./categories.ts";
import type { Query, Sql } from "./db.ts";
import { give, giveSeat, handOut, load, manager } from "./items.ts";
import { clean, id, limits, optional } from "../shared/model.ts";
import * as tell from "./tell.ts";

// Requests: "I need a charger", "my screen is dead, I need a new one". A
// member asks (a few words, and the kind of thing if they know it); every
// equipment manager hears it. A manager answers: gives something from the
// stock (the request is done, the item is theirs), approves it (it will be
// bought: it stays on the managers' list until given), or refuses it with a
// reason. The one who asked sees where it stands, and may cancel it.
export type RequestStatus = "open" | "approved" | "refused" | "done" | "cancelled";
export type Request = {
  id: string; member: string; body: string; categoryId: string | null; status: RequestStatus;
  answer: string | null; decidedBy: string | null; decidedAt: string | null; itemId: string | null; createdAt: string;
};

type Row = {
  id: string; member_id: string; body: string; category_id: string | null; status: RequestStatus;
  answer: string | null; decided_by: string | null; decided_at: Date | null; item_id: string | null; created_at: Date;
};
const shape = (r: Row): Request => ({
  id: String(r.id), member: r.member_id, body: r.body, categoryId: r.category_id === null ? null : String(r.category_id), status: r.status,
  answer: r.answer, decidedBy: r.decided_by, decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null,
  itemId: r.item_id === null ? null : String(r.item_id), createdAt: new Date(r.created_at).toISOString(),
});
const columns = (sql: Query) => sql`id, member_id, body, category_id, status, answer, decided_by, decided_at, item_id, created_at`;

function asker(actor: Member | null): Member {
  if (!actor || !can(actor, "request")) throw new AppError("forbidden");
  return actor;
}

export async function ask(sql: Sql, actor: Member | null, input: { body?: unknown; categoryId?: unknown }): Promise<Request> {
  const who = asker(actor);
  const body = clean(input.body, limits.request, { multiline: true });
  const cat = input.categoryId === undefined || input.categoryId === null || input.categoryId === "" ? null : await category(sql, input.categoryId);
  const request = await sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(hashtext('equipment.requests'), hashtext(${who.id}))`;
    const [open] = await tx<{ n: number }[]>`select count(*)::int as n from requests where member_id = ${who.id} and status in ('open', 'approved')`;
    if (open!.n >= limits.openRequests) throw new AppError("too_many", { max: limits.openRequests });
    const [row] = await tx<Row[]>`insert into requests (member_id, body, category_id) values (${who.id}, ${body}, ${cat?.id ?? null}) returning ${columns(tx)}`;
    return shape(row!);
  });
  await tell.requested(sql, who, request);
  return request;
}

// My requests: those waiting, and those answered in the last 30 days.
export async function myRequests(sql: Query, actor: Member | null): Promise<Request[]> {
  const who = asker(actor);
  const rows = await sql<Row[]>`select ${columns(sql)} from requests where member_id = ${who.id}
    and (status in ('open', 'approved') or updated_at > now() - interval '30 days') order by id desc limit 30`;
  return rows.map(shape);
}

// The managers' list: waiting for an answer, then approved (to give).
export async function waitingRequests(sql: Query, actor: Member | null): Promise<Request[]> {
  manager(actor);
  const rows = await sql<Row[]>`select ${columns(sql)} from requests where status in ('open', 'approved')
    order by case status when 'open' then 0 else 1 end, id limit 100`;
  return rows.map(shape);
}

async function decide(sql: Sql, who: Member, requestId: unknown, allowed: RequestStatus[], status: RequestStatus, answer: string | null, itemId: string | null = null): Promise<Request> {
  const key = id(requestId);
  const [row] = await sql<Row[]>`update requests set status = ${status}, answer = coalesce(${answer}, answer), decided_by = ${who.id}, decided_at = now(),
      item_id = coalesce(${itemId}, item_id), updated_at = now()
    where id = ${key} and status = any(${allowed}) returning ${columns(sql)}`;
  if (!row) {
    const exists = await sql`select 1 from requests where id = ${key}`;
    throw new AppError(exists.length > 0 ? "not_open" : "not_found");
  }
  return shape(row);
}

// Approved: it will be bought (a word for the person, optional).
export async function approve(sql: Sql, actor: Member | null, requestId: unknown, answerValue?: unknown): Promise<Request> {
  const who = manager(actor);
  const r = await decide(sql, who, requestId, ["open"], "approved", optional(answerValue, limits.request, { multiline: true }));
  await tell.answered(sql, who, { ...r, status: "approved" });
  return r;
}

// Refused, with a reason the person reads.
export async function refuse(sql: Sql, actor: Member | null, requestId: unknown, answerValue?: unknown): Promise<Request> {
  const who = manager(actor);
  const r = await decide(sql, who, requestId, ["open", "approved"], "refused", optional(answerValue, limits.request, { multiline: true }));
  await tell.answered(sql, who, { ...r, status: "refused" });
  return r;
}

// Fulfilled: an item of the stock is given to the person (a seat of a
// licence, one of a thing counted in bulk), and the request is done.
export async function fulfil(sql: Sql, actor: Member | null, requestId: unknown, itemIdValue: unknown): Promise<Request> {
  const who = manager(actor);
  const key = id(requestId);
  const [row] = await sql<Row[]>`select ${columns(sql)} from requests where id = ${key}`;
  if (!row) throw new AppError("not_found");
  const request = shape(row);
  if (request.status !== "open" && request.status !== "approved") throw new AppError("not_open");
  if (!request.member.startsWith("mbr_")) throw new AppError("not_member");
  const item = await load(sql, itemIdValue);
  // Each step says in the item's history what happened; the person's bell
  // tells them once, from the answer below.
  if (item.category.kind === "licence") await giveSeat(sql, who, item.id, request.member, { quiet: true });
  else if (item.category.kind === "consumable") await handOut(sql, who, item.id, { qty: 1, to: { member: request.member }, note: request.body });
  else await give(sql, who, item.id, { to: { member: request.member } }, { bell: false });
  const done = await decide(sql, who, key, ["open", "approved"], "done", null, item.id);
  await tell.answered(sql, who, { ...done, status: "done", item });
  return done;
}

// The person takes back their own request, while it waits.
export async function cancel(sql: Sql, actor: Member | null, requestId: unknown): Promise<Request> {
  const who = asker(actor);
  const key = id(requestId);
  const [row] = await sql<Row[]>`update requests set status = 'cancelled', updated_at = now()
    where id = ${key} and member_id = ${who.id} and status in ('open', 'approved') returning ${columns(sql)}`;
  if (!row) {
    const mine = await sql`select 1 from requests where id = ${key} and member_id = ${who.id}`;
    throw new AppError(mine.length > 0 ? "not_open" : "not_found");
  }
  const r = shape(row);
  await tell.answered(sql, who, { ...r, status: "cancelled" });
  return r;
}

// Lifecycle: someone leaves — what they asked for is no longer needed.
export async function cancelAllOf(sql: Sql, member: string): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`update requests set status = 'cancelled', updated_at = now() where member_id = ${member} and status in ('open', 'approved') returning id`;
  return rows.map(r => String(r.id));
}
