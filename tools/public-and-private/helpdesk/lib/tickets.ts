import { createHash, randomBytes } from "node:crypto";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { clean, email, fillReply, id, isFolder, isStatus, limits, ticketNumber, type Folder, type Status } from "./model.ts";

// Tickets and their messages. Team functions take (sql, actor, …) and check
// the rights first; public functions take what an anonymous visitor may
// hold: the follow-up link's secret. Codes, never sentences.

export type Ticket = {
  id: string;
  number: number;
  subject: string;
  status: Status;
  customerEmail: string;
  customerName: string;
  assignee: string | null;
  channel: "form" | "email" | "team";
  language: string;
  createdAt: string;
  updatedAt: string;
};
export type Message = { id: string; kind: "customer" | "reply" | "note"; author: string | null; body: string; at: string; delivery: "email" | "page" | null; emailId: string | null; attachments: { id: string; fileName: string; type: string; size: number }[] };
export type TicketRow = Ticket & { last: string; lastKind: string; messages: number };

type TicketDb = { id: string; number: number; subject: string; status: Status; customer_email: string; customer_name: string; assignee: string | null; channel: Ticket["channel"]; language: string; created_at: Date; updated_at: Date };
const toTicket = (r: TicketDb): Ticket => ({ id: String(r.id), number: r.number, subject: r.subject, status: r.status, customerEmail: r.customer_email, customerName: r.customer_name, assignee: r.assignee, channel: r.channel, language: r.language, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString() });
const columns = (sql: Query) => sql`t.id, t.number, t.subject, t.status, t.customer_email, t.customer_name, t.assignee, t.channel, t.language, t.created_at, t.updated_at`;

export const hashSecret = (secret: string) => createHash("sha256").update(secret).digest("hex");
export const newSecret = () => randomBytes(24).toString("base64url");
const secretPattern = /^[A-Za-z0-9_-]{32}$/u;

async function refreshSearch(sql: Query, ticketId: string): Promise<void> {
  await sql`
    update tickets t set search =
      setweight(to_tsvector('simple', t.subject), 'A') ||
      setweight(to_tsvector('simple', t.customer_email || ' ' || t.customer_name), 'B') ||
      to_tsvector('simple', coalesce((select string_agg(body, ' ') from messages where ticket_id = t.id and kind <> 'note'), ''))
    where t.id = ${ticketId}`;
}

// ---- Settings --------------------------------------------------------------

export type Settings = { companyName: string; formOpen: boolean; intro: string; retentionMonths: number; publicOrigin: string | null };
const defaults: Settings = { companyName: "", formOpen: true, intro: "", retentionMonths: 24, publicOrigin: null };

export async function settings(sql: Query): Promise<Settings> {
  const rows = await sql<{ key: string; value: unknown }[]>`select key, value from settings`;
  const found = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return {
    companyName: typeof found["company_name"] === "string" ? found["company_name"] : defaults.companyName,
    formOpen: typeof found["form_open"] === "boolean" ? found["form_open"] : defaults.formOpen,
    intro: typeof found["intro"] === "string" ? found["intro"] : defaults.intro,
    retentionMonths: typeof found["retention_months"] === "number" ? found["retention_months"] : defaults.retentionMonths,
    publicOrigin: typeof found["public_origin"] === "string" ? found["public_origin"] : null,
  };
}

async function setSetting(sql: Query, key: string, value: unknown): Promise<void> {
  await sql`insert into settings (key, value) values (${key}, ${sql.json(value as never)}) on conflict (key) do update set value = excluded.value`;
}

export async function saveSettings(sql: Sql, actor: Member | null, input: { companyName?: unknown; formOpen?: unknown; intro?: unknown; retentionMonths?: unknown }): Promise<void> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  if (input.companyName !== undefined) await setSetting(sql, "company_name", clean(input.companyName, 80, { optional: true }));
  if (input.intro !== undefined) await setSetting(sql, "intro", clean(input.intro, 500, { multiline: true, optional: true }));
  if (typeof input.formOpen === "boolean") await setSetting(sql, "form_open", input.formOpen);
  if (input.retentionMonths !== undefined) {
    const months = Number(input.retentionMonths);
    if (!Number.isInteger(months) || months < 0 || months > 120) throw new AppError("invalid");
    await setSetting(sql, "retention_months", months);
  }
}

// The public host's address, as last seen on a request (the Chest does not
// give it to the tool yet: see the SDK report). Used in emails.
export async function rememberPublicOrigin(sql: Query, origin: string | null): Promise<void> {
  if (!origin || !/^https?:\/\/[A-Za-z0-9.:-]{1,260}$/u.test(origin)) return;
  const current = await settings(sql);
  if (current.publicOrigin !== origin) await setSetting(sql, "public_origin", origin);
}

// ---- Creating tickets ------------------------------------------------------

async function insertTicket(sql: Query, input: { subject: string; email: string; name: string; channel: Ticket["channel"]; language: string; status?: Status }): Promise<{ id: string; number: number; secret: string }> {
  const secret = newSecret();
  const [row] = await sql<{ id: string; number: number }[]>`
    insert into tickets (number, subject, customer_email, customer_name, channel, secret_hash, language, status)
    values (nextval('ticket_numbers'), ${input.subject}, ${input.email}, ${input.name}, ${input.channel}, ${hashSecret(secret)}, ${input.language}, ${input.status ?? "open"})
    returning id, number`;
  return { id: String(row!.id), number: row!.number, secret };
}

async function insertMessage(sql: Query, ticketId: string, input: { kind: Message["kind"]; author: string | null; body: string; emailId?: string | null; delivery?: Message["delivery"] }): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into messages (ticket_id, kind, author, body, email_id, delivery)
    values (${ticketId}, ${input.kind}, ${input.author}, ${input.body}, ${input.emailId ?? null}, ${input.delivery ?? null})
    returning id`;
  return String(row!.id);
}

// The public form's guard: 5 requests an hour from one address (a hash of
// it), 100 an hour from everyone; a honeypot field; a form sent faster than
// a person can type is refused.
export const formLimits = { perVisitorHour: 5, perHour: 100, minimumSeconds: 3 } as const;

export async function guard(sql: Query, visitor: string): Promise<void> {
  const hour = new Date(Math.floor(Date.now() / 3600000) * 3600000);
  const key = "v:" + createHash("sha256").update(visitor).digest("hex").slice(0, 32);
  const counts = await sql<{ key: string; count: number }[]>`
    insert into form_counts (key, hour, count) values (${key}, ${hour}, 1), ('all', ${hour}, 1)
    on conflict (key, hour) do update set count = form_counts.count + 1
    returning key, count`;
  const mine = counts.find(c => c.key === key)?.count ?? 0;
  const all = counts.find(c => c.key === "all")?.count ?? 0;
  if (mine > formLimits.perVisitorHour || all > formLimits.perHour) throw new AppError("too_many");
  await sql`delete from form_counts where hour < ${new Date(hour.getTime() - 86400000)}`;
}

export type PublicInput = { name: unknown; email: unknown; subject: unknown; message: unknown; language: string };

// fromForm opens a ticket from the public form; says its number and the
// follow-up link's secret (shown once, never stored).
export async function fromForm(sql: Sql, input: PublicInput): Promise<{ id: string; number: number; secret: string }> {
  const s = await settings(sql);
  if (!s.formOpen) throw new AppError("closed_form");
  const name = clean(input.name, limits.name, { optional: true });
  const address = email(input.email);
  const subject = clean(input.subject, limits.subject);
  const body = clean(input.message, limits.publicBody, { multiline: true });
  return sql.begin(async tx => {
    const t = await insertTicket(tx, { subject, email: address, name, channel: "form", language: input.language });
    await insertMessage(tx, t.id, { kind: "customer", author: null, body });
    await refreshSearch(tx, t.id);
    return t;
  });
}

// fromTeam opens a ticket for a customer who called or came by: what they
// asked is written by an agent (who is recorded).
export async function fromTeam(sql: Sql, actor: Member | null, input: { name: unknown; email: unknown; subject: unknown; message: unknown; language?: unknown }): Promise<{ id: string; number: number; secret: string }> {
  if (!actor || !can(actor, "tickets.answer")) throw new AppError("forbidden");
  const name = clean(input.name, limits.name, { optional: true });
  const address = email(input.email);
  const subject = clean(input.subject, limits.subject);
  const body = clean(input.message, limits.body, { multiline: true });
  const language = input.language === "fr" ? "fr" : "en";
  return sql.begin(async tx => {
    const t = await insertTicket(tx, { subject, email: address, name, channel: "team", language });
    await insertMessage(tx, t.id, { kind: "customer", author: actor.id, body });
    await tx`update tickets set assignee = ${actor.id} where id = ${t.id}`;
    await refreshSearch(tx, t.id);
    return t;
  });
}

// fromEmail files a received email: in the ticket it answers (by its
// email headers, or "[#1042]" in the subject from the same customer), or a
// new ticket. A closed ticket reopens. Spam goes to the spam folder.
export type IncomingEmail = { id: string; from: { address: string; name: string | null }; subject: string; text: string; messageId: string; inReplyTo: string | null; references: string[]; attachments: { file: string; name: string; type: string; size: number }[]; spam: number };
export async function fromEmail(sql: Sql, message: IncomingEmail, numberFromSubject: number | null): Promise<{ id: string; number: number; created: boolean; secret: string | null }> {
  return sql.begin(async tx => {
    // Delivered twice: filed once.
    const [again] = await tx<{ ticket_id: string; number: number }[]>`select m.ticket_id, t.number from messages m join tickets t on t.id = m.ticket_id where m.email_id = ${message.messageId}`;
    if (again) return { id: String(again.ticket_id), number: again.number, created: false, secret: null };
    const ids = [message.inReplyTo, ...message.references].filter((x): x is string => typeof x === "string" && x.length > 0);
    let found: { id: string; number: number } | undefined;
    if (ids.length > 0) [found] = await tx<{ id: string; number: number }[]>`select t.id, t.number from messages m join tickets t on t.id = m.ticket_id where m.email_id in ${tx(ids)} order by m.created_at desc limit 1`;
    if (!found && numberFromSubject !== null) [found] = await tx<{ id: string; number: number }[]>`select id, number from tickets where number = ${numberFromSubject} and lower(customer_email) = lower(${message.from.address})`;
    const body = clean(message.text || "—", limits.body, { multiline: true });
    let ticketId: string, number: number, created = false, secret: string | null = null;
    if (found) {
      ticketId = String(found.id);
      number = found.number;
      await tx`update tickets set status = case when status = 'spam' then 'spam' else 'open' end, closed_at = null, updated_at = now() where id = ${ticketId}`;
    } else {
      const subject = clean(message.subject || "—", limits.subject);
      const t = await insertTicket(tx, { subject, email: message.from.address, name: clean(message.from.name ?? "", limits.name, { optional: true }), channel: "email", language: "en", status: message.spam >= 7 ? "spam" : "open" });
      [ticketId, number, created, secret] = [t.id, t.number, true, t.secret];
    }
    const messageId = await insertMessage(tx, ticketId, { kind: "customer", author: null, body, emailId: message.messageId });
    for (const a of message.attachments.slice(0, limits.attachmentsPerMessage)) {
      await tx`insert into attachments (message_id, object, file_name, type, size) values (${messageId}, ${a.file}, ${clean(a.name || "file", limits.fileName).replace(/[/\\]/gu, "_")}, ${a.type}, ${a.size}) on conflict (object) do nothing`;
    }
    await refreshSearch(tx, ticketId);
    return { id: ticketId, number, created, secret };
  });
}

// ---- The inbox -------------------------------------------------------------

export type FolderCounts = Record<Folder, number>;

export async function folderCounts(sql: Query, actor: Member): Promise<FolderCounts> {
  const [row] = await sql<FolderCounts[]>`
    select
      count(*) filter (where status = 'open' and assignee is null)::int as unassigned,
      count(*) filter (where status in ('open', 'waiting') and assignee = ${actor.id})::int as mine,
      count(*) filter (where status = 'open')::int as open,
      count(*) filter (where status = 'waiting')::int as waiting,
      count(*) filter (where status = 'closed')::int as closed,
      count(*) filter (where status = 'spam')::int as spam
    from tickets`;
  return row!;
}

export async function listTickets(sql: Sql, actor: Member | null, folder: unknown, query?: unknown): Promise<TicketRow[]> {
  if (!actor || !can(actor, "tickets.read")) throw new AppError("forbidden");
  const f: Folder = isFolder(folder) ? folder : "unassigned";
  const q = typeof query === "string" ? query.trim().slice(0, 100) : "";
  const words = q.split(/\s+/u).map(w => w.replace(/[^\p{L}\p{N}@._-]/gu, "")).filter(Boolean).slice(0, 8);
  const where = q
    ? sql`(t.search @@ to_tsquery('simple', ${words.map(w => w.replace(/[@._-]/gu, " ").trim().split(" ").map(x => x + ":*").join(" & ")).join(" & ") || "x"}) or t.subject ilike ${"%" + q.replace(/[\\%_]/gu, "\\$&") + "%"} or lower(t.customer_email) = lower(${q}) or t.number::text = ${q.replace(/^#/u, "")})`
    : f === "unassigned" ? sql`t.status = 'open' and t.assignee is null`
    : f === "mine" ? sql`t.status in ('open', 'waiting') and t.assignee = ${actor.id}`
    : sql`t.status = ${f}`;
  const rows = await sql<(TicketDb & { last: string; last_kind: string; messages: number })[]>`
    select ${columns(sql)},
      (select body from messages where ticket_id = t.id and kind <> 'note' order by created_at desc, id desc limit 1) as last,
      (select kind from messages where ticket_id = t.id order by created_at desc, id desc limit 1) as last_kind,
      (select count(*)::int from messages where ticket_id = t.id) as messages
    from tickets t
    where ${where}
    order by ${f === "closed" || q ? sql`t.updated_at desc` : sql`t.updated_at asc`}
    limit ${limits.page}`;
  return rows.map(r => ({ ...toTicket(r), last: (r.last ?? "").slice(0, 200), lastKind: r.last_kind, messages: r.messages }));
}

async function byNumber(sql: Query, number: unknown): Promise<Ticket> {
  const [row] = await sql<TicketDb[]>`select ${columns(sql)} from tickets t where number = ${ticketNumber(number)}`;
  if (!row) throw new AppError("not_found");
  return toTicket(row);
}

async function messagesOf(sql: Query, ticketId: string, withNotes: boolean): Promise<Message[]> {
  const rows = await sql<{ id: string; kind: Message["kind"]; author: string | null; body: string; created_at: Date; delivery: Message["delivery"]; email_id: string | null }[]>`
    select id, kind, author, body, created_at, delivery, email_id from messages
    where ticket_id = ${ticketId} ${withNotes ? sql`` : sql`and kind <> 'note'`}
    order by created_at, id`;
  const ids = rows.map(r => String(r.id));
  const files = ids.length ? await sql<{ id: string; message_id: string; file_name: string; type: string; size: string }[]>`select id, message_id, file_name, type, size from attachments where message_id in ${sql(ids)} order by id` : [];
  return rows.map(r => ({ id: String(r.id), kind: r.kind, author: r.author, body: r.body, at: r.created_at.toISOString(), delivery: r.delivery, emailId: r.email_id, attachments: files.filter(f => String(f.message_id) === String(r.id)).map(f => ({ id: String(f.id), fileName: f.file_name, type: f.type, size: Number(f.size) })) }));
}

export type TicketDetail = Ticket & { messages: Message[]; others: { number: number; subject: string; status: Status; updatedAt: string }[]; viewing: string[] };

// ticket reads one ticket for the team, notes included; marks the actor as
// on it (for "Hugo is on this ticket").
export async function ticket(sql: Sql, actor: Member | null, number: unknown): Promise<TicketDetail> {
  if (!actor || !can(actor, "tickets.read")) throw new AppError("forbidden");
  const t = await byNumber(sql, number);
  await sql`insert into viewing (ticket_id, member_id, at) values (${t.id}, ${actor.id}, now()) on conflict (ticket_id, member_id) do update set at = now()`;
  const viewing = (await sql<{ member_id: string }[]>`select member_id from viewing where ticket_id = ${t.id} and member_id <> ${actor.id} and at > now() - interval '40 seconds'`).map(r => r.member_id);
  const others = await sql<{ number: number; subject: string; status: Status; updated_at: Date }[]>`
    select number, subject, status, updated_at from tickets where lower(customer_email) = lower(${t.customerEmail}) and id <> ${t.id} order by updated_at desc limit 10`;
  return { ...t, messages: await messagesOf(sql, t.id, true), others: others.map(o => ({ number: o.number, subject: o.subject, status: o.status, updatedAt: o.updated_at.toISOString() })), viewing };
}

// ---- Answering -------------------------------------------------------------

// reply adds the team's answer; the ticket then waits on the customer (or
// closes). Says what the mail needs to send it.
export async function reply(sql: Sql, actor: Member | null, number: unknown, body: unknown, options: { close?: boolean } = {}): Promise<{ ticket: Ticket; messageId: string; threading: string[] }> {
  if (!actor || !can(actor, "tickets.answer")) throw new AppError("forbidden");
  const text = clean(body, limits.body, { multiline: true });
  const t = await byNumber(sql, number);
  if (t.status === "spam") throw new AppError("forbidden");
  return sql.begin(async tx => {
    const messageId = await insertMessage(tx, t.id, { kind: "reply", author: actor.id, body: text });
    const status: Status = options.close ? "closed" : "waiting";
    await tx`update tickets set status = ${status}, closed_at = ${options.close ? tx`now()` : null}, updated_at = now(), assignee = coalesce(assignee, ${actor.id}) where id = ${t.id}`;
    await refreshSearch(tx, t.id);
    const threading = (await tx<{ email_id: string }[]>`select email_id from messages where ticket_id = ${t.id} and email_id is not null order by created_at`).map(r => r.email_id);
    return { ticket: { ...t, status, assignee: t.assignee ?? actor.id }, messageId, threading };
  });
}

// delivered records how a reply reached the customer.
export async function delivered(sql: Query, messageId: string, delivery: "email" | "page", mail?: { id: string; messageId: string }): Promise<void> {
  await sql`update messages set delivery = ${delivery}, mail_id = ${mail?.id ?? null}, email_id = ${mail?.messageId ?? null} where id = ${messageId}`;
}

export async function note(sql: Sql, actor: Member | null, number: unknown, body: unknown): Promise<Ticket> {
  if (!actor || !can(actor, "tickets.answer")) throw new AppError("forbidden");
  const text = clean(body, limits.body, { multiline: true });
  const t = await byNumber(sql, number);
  await sql.begin(async tx => {
    await insertMessage(tx, t.id, { kind: "note", author: actor.id, body: text });
    await tx`update tickets set updated_at = now() where id = ${t.id}`;
  });
  return t;
}

// assign gives the ticket to someone who answers tickets (the page offers
// only them; the action checks their role with the Chest), or to nobody.
export async function assign(sql: Sql, actor: Member | null, number: unknown, assignee: string | null, answers: (memberId: string) => Promise<boolean>): Promise<{ ticket: Ticket; previous: string | null }> {
  if (!actor || !can(actor, "tickets.manage")) throw new AppError("forbidden");
  const t = await byNumber(sql, number);
  if (assignee !== null && (!/^mbr_[a-z2-7]{26}$/u.test(assignee) || !(await answers(assignee)))) throw new AppError("invalid");
  await sql`update tickets set assignee = ${assignee}, updated_at = now() where id = ${t.id}`;
  return { ticket: { ...t, assignee }, previous: t.assignee };
}

export async function setStatus(sql: Sql, actor: Member | null, number: unknown, status: unknown): Promise<Ticket> {
  if (!actor || !can(actor, "tickets.manage")) throw new AppError("forbidden");
  if (!isStatus(status)) throw new AppError("invalid");
  const t = await byNumber(sql, number);
  await sql`update tickets set status = ${status}, closed_at = ${status === "closed" ? sql`now()` : null}, updated_at = now() where id = ${t.id}`;
  return { ...t, status };
}

// ---- The customer's side (the follow-up link) ------------------------------

export async function byLink(sql: Query, secret: unknown): Promise<(Ticket & { messages: Message[] }) | null> {
  if (typeof secret !== "string" || !secretPattern.test(secret)) return null;
  const [row] = await sql<TicketDb[]>`select ${columns(sql)} from tickets t where secret_hash = ${hashSecret(secret)} and status <> 'spam'`;
  if (!row) return null;
  const t = toTicket(row);
  return { ...t, messages: await messagesOf(sql, t.id, false) };
}

// customerReply adds the customer's message from the follow-up page; the
// ticket goes back to the team.
export async function customerReply(sql: Sql, secret: unknown, body: unknown): Promise<Ticket> {
  const t = await byLink(sql, secret);
  if (!t) throw new AppError("not_found");
  const text = clean(body, limits.publicBody, { multiline: true });
  await sql.begin(async tx => {
    await insertMessage(tx, t.id, { kind: "customer", author: null, body: text });
    await tx`update tickets set status = 'open', closed_at = null, updated_at = now() where id = ${t.id}`;
    await refreshSearch(tx, t.id);
  });
  return { ...t, status: "open" };
}

// ---- Saved replies ---------------------------------------------------------

export type SavedReply = { id: string; title: string; body: string };
export async function savedReplies(sql: Sql, actor: Member | null): Promise<SavedReply[]> {
  if (!can(actor, "tickets.read")) throw new AppError("forbidden");
  const rows = await sql<{ id: string; title: string; body: string }[]>`select id, title, body from saved_replies order by lower(title)`;
  return rows.map(r => ({ id: String(r.id), title: r.title, body: r.body }));
}
export async function saveReply(sql: Sql, actor: Member | null, input: { id?: unknown; title: unknown; body: unknown }): Promise<SavedReply> {
  if (!actor || !can(actor, "replies.manage")) throw new AppError("forbidden");
  const title = clean(input.title, limits.savedTitle), body = clean(input.body, limits.savedBody, { multiline: true });
  if (input.id !== undefined && input.id !== null && input.id !== "") {
    const [row] = await sql<{ id: string }[]>`update saved_replies set title = ${title}, body = ${body} where id = ${id(input.id)} returning id`;
    if (!row) throw new AppError("not_found");
    return { id: String(row.id), title, body };
  }
  const [count] = await sql<{ n: number }[]>`select count(*)::int as n from saved_replies`;
  if ((count?.n ?? 0) >= 200) throw new AppError("too_many", { max: 200 });
  const [row] = await sql<{ id: string }[]>`insert into saved_replies (title, body, created_by) values (${title}, ${body}, ${actor.id}) returning id`;
  return { id: String(row!.id), title, body };
}
export async function removeReply(sql: Sql, actor: Member | null, replyId: unknown): Promise<void> {
  if (!can(actor, "replies.manage")) throw new AppError("forbidden");
  await sql`delete from saved_replies where id = ${id(replyId)}`;
}
export { fillReply };

// ---- Keeping and erasing ---------------------------------------------------

// eraseCustomer deletes everything of one customer (their right to erasure:
// they are not members, the company answers for them). Says how many
// tickets went, and their files to delete from the Chest.
export async function eraseCustomer(sql: Sql, actor: Member | null, address: unknown): Promise<{ tickets: number; objects: string[] }> {
  if (!can(actor, "customers.erase")) throw new AppError("forbidden");
  const value = email(address);
  return sql.begin(async tx => {
    const objects = (await tx<{ object: string }[]>`select a.object from attachments a join messages m on m.id = a.message_id join tickets t on t.id = m.ticket_id where lower(t.customer_email) = lower(${value})`).map(r => r.object);
    const gone = await tx`delete from tickets where lower(customer_email) = lower(${value})`;
    return { tickets: gone.count, objects };
  });
}

// cleanup deletes tickets closed longer than the retention (months; 0
// keeps everything), with their files. Run by the "cleanup" schedule and
// safe to run twice.
export async function cleanup(sql: Sql, now = new Date()): Promise<{ tickets: number; objects: string[] }> {
  const { retentionMonths } = await settings(sql);
  if (retentionMonths <= 0) return { tickets: 0, objects: [] };
  const before = new Date(now);
  before.setUTCMonth(before.getUTCMonth() - retentionMonths);
  return sql.begin(async tx => {
    const objects = (await tx<{ object: string }[]>`select a.object from attachments a join messages m on m.id = a.message_id join tickets t on t.id = m.ticket_id where t.status in ('closed', 'spam') and t.updated_at < ${before}`).map(r => r.object);
    const gone = await tx`delete from tickets where status in ('closed', 'spam') and updated_at < ${before}`;
    await tx`delete from viewing where at < now() - interval '1 day'`;
    return { tickets: gone.count, objects };
  });
}

// The tile's number for each person who answers: open tickets nobody took,
// and open ones given to them.
export async function waitingCounts(sql: Query, people: string[]): Promise<Map<string, number>> {
  const counts = new Map(people.map(p => [p, 0]));
  if (people.length === 0) return counts;
  const [unassigned] = await sql<{ n: number }[]>`select count(*)::int as n from tickets where status = 'open' and assignee is null`;
  const mine = await sql<{ assignee: string; n: number }[]>`select assignee, count(*)::int as n from tickets where status = 'open' and assignee in ${sql(people)} group by assignee`;
  for (const p of people) counts.set(p, (unassigned?.n ?? 0) + (mine.find(m => m.assignee === p)?.n ?? 0));
  return counts;
}

export async function exportRows(sql: Sql, actor: Member | null): Promise<{ number: number; subject: string; status: Status; customerEmail: string; customerName: string; assignee: string | null; channel: string; createdAt: string; updatedAt: string; messages: number }[]> {
  if (!can(actor, "export")) throw new AppError("forbidden");
  const rows = await sql<(TicketDb & { messages: number })[]>`select ${columns(sql)}, (select count(*)::int from messages where ticket_id = t.id) as messages from tickets t where status <> 'spam' order by number`;
  return rows.map(r => ({ ...toTicket(r), messages: r.messages }));
}
