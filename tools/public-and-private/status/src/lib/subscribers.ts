import { createHash, randomBytes } from "node:crypto";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { componentIds, email, id, limits } from "./model.ts";

// The people who asked to be told by email. Double opt-in: a subscription
// counts only once its address confirmed it (the link of the first
// email). Nothing but the address, the language of the emails and the
// components followed is kept; unsubscribing deletes the row.

export type Subscriber = { id: string; email: string; language: string; components: string[] | null; token: string; createdAt: Date; confirmedAt: Date | null };
type Row = { id: string; email: string; language: string; components: string[] | null; token: string; created_at: Date; confirmed_at: Date | null; confirm_sent_at: Date | null; confirm_day_text?: string | null; confirm_sends: number };
const shape = (r: Row): Subscriber => ({ id: String(r.id), email: r.email, language: r.language, components: r.components === null ? null : r.components.map(String), token: r.token, createdAt: new Date(r.created_at), confirmedAt: r.confirmed_at ? new Date(r.confirmed_at) : null });

// An unconfirmed address is forgotten after 7 days; a confirmation email
// is not sent again to the same address within 10 minutes, nor more than
// three times a day (whoever asks: a robot cannot make Status write to an
// address over and over).
export const pendingDays = 7;
export const resendMinutes = 10;
export const mailsPerAddressDay = 3;

// The form's budgets a day (@argentic/chest-app's bound, src/actions.ts):
// a new address waiting for its confirmation, and a request about an
// address already known. The visitor is the address the Chest's front
// gives, else the browser's cookie; the day's total is what closes the
// form — a thousand new unconfirmed addresses a day is a table filling,
// not customers.
export const formBudgets = {
  new: { perVisitor: 5, perDay: 1000 },
  again: { perVisitor: 10, perDay: 5000 },
} as const;

const tokenPattern = /^[A-Za-z0-9_-]{32}$/u;
const newToken = () => randomBytes(24).toString("base64url");

// A visitor's choice of components: "all", or some of those shown.
export async function choice(sql: Query, value: unknown): Promise<string[] | null> {
  if (value === "all" || value === null || value === undefined) return null;
  const ids = componentIds(value);
  const found = await sql<{ id: string }[]>`select id from components where id = any(${ids}::bigint[]) and kind = 'component' and not hidden`;
  if (found.length !== ids.length) throw new AppError("invalid");
  return ids;
}

export type Subscribed = { subscriber: Subscriber; state: "new" | "pending" | "confirmed"; send: boolean };

// subscribe records an address (or finds it again). It says whether an
// email should go: a confirmation, or — for an address already confirmed —
// a reminder of its page; never twice within minutes, never more than
// three a day. The visitor is told the same thing whatever the case:
// nothing reveals who subscribed. charge(kind) spends the form's budget
// once the request is known good: "new" for an address not yet kept,
// "again" for one already known.
export async function subscribe(sql: Sql, input: { email: unknown; language: string; components: unknown }, now = new Date(), charge: (kind: "new" | "again") => Promise<void> = async () => {}): Promise<Subscribed> {
  const address = email(input.email);
  const language = /^[a-z]{2}$/u.test(input.language) ? input.language : "en";
  // The budget is spent before the transaction (it is counted on another
  // connection), from whether the address is known; a refusal after it
  // gives it back.
  const known = (await sql`select 1 from subscribers where lower(email) = lower(${address})`).length > 0;
  await charge(known ? "again" : "new");
  return sql.begin(async tx => {
    await tx`delete from subscribers where confirmed_at is null and created_at < ${new Date(now.getTime() - pendingDays * 86400000)}`;
    const components = await choice(tx, input.components);
    const [existing] = await tx<Row[]>`select *, confirm_day::text as confirm_day_text from subscribers where lower(email) = lower(${address}) for update`;
    const today = now.toISOString().slice(0, 10);
    const sendsToday = (r: Row) => (r.confirm_day_text === today ? r.confirm_sends : 0);
    const recently = (r: Row) => r.confirm_sent_at !== null && now.getTime() - new Date(r.confirm_sent_at).getTime() < resendMinutes * 60000;
    if (existing) {
      const send = !recently(existing) && sendsToday(existing) < mailsPerAddressDay;
      const sends = send ? sendsToday(existing) + 1 : sendsToday(existing);
      if (existing.confirmed_at === null) {
        const [row] = await tx<Row[]>`update subscribers set language = ${language}, components = ${components}::bigint[], confirm_sent_at = ${send ? now : existing.confirm_sent_at}, confirm_day = ${today}, confirm_sends = ${sends} where id = ${existing.id} returning *`;
        return { subscriber: shape(row!), state: "pending", send };
      }
      if (send) await tx`update subscribers set confirm_sent_at = ${now}, confirm_day = ${today}, confirm_sends = ${sends} where id = ${existing.id}`;
      return { subscriber: shape(existing), state: "confirmed", send };
    }
    const [{ count }] = (await tx<{ count: number }[]>`select count(*)::int as count from subscribers`) as unknown as [{ count: number }];
    if (count >= limits.subscribers) throw new AppError("too_many", { max: limits.subscribers });
    const [row] = await tx<Row[]>`
      insert into subscribers (email, language, components, token, created_at, confirm_sent_at, confirm_day, confirm_sends)
      values (${address}, ${language}, ${components}::bigint[], ${newToken()}, ${now}, ${now}, ${today}, 1) returning *`;
    return { subscriber: shape(row!), state: "new", send: true };
  });
}

// The subscriber a link names, or null: the token is the only key.
export async function byToken(sql: Query, token: unknown): Promise<Subscriber | null> {
  if (typeof token !== "string" || !tokenPattern.test(token)) return null;
  const [row] = await sql<Row[]>`select * from subscribers where token = ${token}`;
  return row ? shape(row) : null;
}

export async function confirm(sql: Sql, token: unknown, now = new Date()): Promise<Subscriber> {
  const s = await byToken(sql, token);
  if (!s) throw new AppError("not_found");
  if (s.confirmedAt) return s;
  const [row] = await sql<Row[]>`update subscribers set confirmed_at = ${now} where id = ${s.id} returning *`;
  return shape(row!);
}

export async function choose(sql: Sql, token: unknown, components: unknown): Promise<Subscriber> {
  const s = await byToken(sql, token);
  if (!s) throw new AppError("not_found");
  const picked = await choice(sql, components);
  const [row] = await sql<Row[]>`update subscribers set components = ${picked}::bigint[] where id = ${s.id} returning *`;
  return shape(row!);
}

// unsubscribe forgets the address entirely.
export async function unsubscribe(sql: Sql, token: unknown): Promise<void> {
  const s = await byToken(sql, token);
  if (!s) throw new AppError("not_found");
  await sql`delete from subscribers where id = ${s.id}`;
}

// ---- Editors ---------------------------------------------------------------

export async function listSubscribers(sql: Query, actor: Member | null): Promise<Subscriber[]> {
  if (!can(actor, "subscribers")) throw new AppError("forbidden");
  const rows = await sql<Row[]>`select * from subscribers order by confirmed_at is null, lower(email) limit ${limits.subscribers}`;
  return rows.map(shape);
}

export async function removeSubscriber(sql: Sql, actor: Member | null, subscriberId: unknown): Promise<void> {
  if (!can(actor, "subscribers")) throw new AppError("forbidden");
  const rows = await sql`delete from subscribers where id = ${id(subscriberId)} returning id`;
  if (rows.length === 0) throw new AppError("not_found");
}
