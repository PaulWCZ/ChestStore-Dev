import { createHash, randomBytes } from "node:crypto";
import type { Received } from "@argentic/chest-sdk/mail";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import type { Stored } from "./attachments.ts";
import { defaultHours, parseHours, readHours, type Hours } from "./hours.ts";
import { clean, defaultLateHours, defaultSort, email, mergedEvent, readMerged, fillReply, id, isFolder, isPriority, isSort, isStatus, lateChoices, limits, numberInSubject, tagName, ticketNumber, type Folder, type Priority, type Sort, type Status } from "./model.ts";
import { catalogue, isLocale, locales } from "./i18n/index.ts";
import { allRules, decide } from "./rules.ts";
import { baseSubject } from "./text.ts";
import { readerWords, shownTag, storedTag } from "./seed-words.ts";

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
  channel: "form" | "email" | "team" | "forms";
  language: string;
  // A colleague's request (a team form of Forms): the member who asked
  // ('erased' once erased); the ticket then has no customer address.
  requester: string | null;
  // Opened by an answer to a form of Forms: which form, which answer.
  source: Source | null;
  priority: Priority;
  // Since when the customer waits for an answer (open tickets), or null.
  waitingSince: string | null;
  createdAt: string;
  updatedAt: string;
  // The ticket this one was merged into (its number), or null.
  mergedInto: number | null;
  // The last email about it that did not arrive.
  bounce: Bounce | null;
  rating: "good" | "bad" | null;
};
export type Bounce = { permanent: boolean; reason: string; at: string; recipient: string };
export type Source = { form: { id: string; title: string }; answer: { id: string; path: string | null } };
export type Tag = { id: string; name: string };
// A message: the customer's, the team's reply, a note, or an event (a
// merge: "merged:1005", said in the reader's words). Received by email: the
// sender's address, the Chest's cleaned HTML, whether the original is kept,
// the files the Chest did not keep, an automatic answer. Sent: its bounce.
export type Message = {
  id: string; kind: "customer" | "reply" | "note" | "event"; author: string | null; body: string; at: string;
  delivery: "email" | "page" | null; emailId: string | null;
  attachments: { id: string; fileName: string; type: string; size: number }[];
  mailFrom: string | null; html: string | null; original: boolean; dropped: { name: string; reason: string }[]; auto: boolean; bounce: Bounce | null;
};
export type TicketRow = Ticket & { last: string; lastKind: string; messages: number; tags: Tag[] };

type TicketDb = { id: string; number: number; subject: string; status: Status; customer_email: string; customer_name: string; assignee: string | null; channel: Ticket["channel"]; language: string; priority: Priority; waiting_since: Date | null; created_at: Date; updated_at: Date; merged_number: number | null; bounce: Bounce | null; rating: Ticket["rating"]; requester: string | null; source: unknown };
const toTicket = (r: TicketDb): Ticket => ({ id: String(r.id), number: r.number, subject: r.subject, status: r.status, customerEmail: r.customer_email, customerName: r.customer_name, assignee: r.assignee, channel: r.channel, language: r.language, requester: r.requester ?? null, source: readSource(r.source), priority: r.priority, waitingSince: r.status === "open" && r.waiting_since ? r.waiting_since.toISOString() : null, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(), mergedInto: r.merged_number ?? null, bounce: r.bounce ?? null, rating: r.rating ?? null });
const columns = (sql: Query) => sql`t.id, t.number, t.subject, t.status, t.customer_email, t.customer_name, t.assignee, t.channel, t.language, t.priority, t.waiting_since, t.created_at, t.updated_at, (select x.number from tickets x where x.id = t.merged_into) as merged_number, t.bounce, t.rating, t.requester, t.source`;
// A ticket's source as stored (read defensively: only its known shape).
function readSource(value: unknown): Source | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { form?: { id?: unknown; title?: unknown }; answer?: { id?: unknown; path?: unknown } };
  if (typeof v.form?.id !== "string" || typeof v.form.title !== "string" || typeof v.answer?.id !== "string") return null;
  return { form: { id: v.form.id, title: v.form.title }, answer: { id: v.answer.id, path: typeof v.answer.path === "string" ? v.answer.path : null } };
}
// The kinds a customer sees on their follow-up page.
export const publicKinds = ["customer", "reply"] as const;
// A ticket's tags, as JSON, sorted by name.
const tagsOf = (sql: Query) => sql`(select coalesce(json_agg(json_build_object('id', g.id::text, 'name', g.name) order by lower(g.name)), '[]'::json) from ticket_tags tt join tags g on g.id = tt.tag_id where tt.ticket_id = t.id)`;

export const hashSecret = (secret: string) => createHash("sha256").update(secret).digest("hex");
export const newSecret = () => randomBytes(24).toString("base64url");
const secretPattern = /^[A-Za-z0-9_-]{32}$/u;

async function refreshSearch(sql: Query, ticketId: string): Promise<void> {
  await sql`
    update tickets t set search =
      setweight(to_tsvector('simple', t.subject), 'A') ||
      setweight(to_tsvector('simple', t.customer_email || ' ' || t.customer_name), 'B') ||
      to_tsvector('simple', coalesce((select string_agg(body, ' ') from messages where ticket_id = t.id and kind in ('customer', 'reply')), ''))
    where t.id = ${ticketId}`;
}

// ---- Settings --------------------------------------------------------------

// lateHours: an open ticket whose customer has waited that long (in working
// hours) is highlighted (0: never). intros: the sentence above the public
// form, per language (English required, the others fall back on it).
// frameOrigins: the company's websites that may show the form in a frame.
// helpUrl: the company's help centre (the Wiki's public pages, or any),
// offered above the form.
export type Settings = { companyName: string; formOpen: boolean; intros: Record<string, string>; retentionMonths: number; lateHours: number; publicOrigin: string | null; hours: Hours; frameOrigins: string[]; helpUrl: string };
const defaults: Settings = { companyName: "", formOpen: true, intros: {}, retentionMonths: 24, lateHours: defaultLateHours, publicOrigin: null, hours: defaultHours, frameOrigins: [], helpUrl: "" };

export async function settings(sql: Query): Promise<Settings> {
  const rows = await sql<{ key: string; value: unknown }[]>`select key, value from settings`;
  const found = Object.fromEntries(rows.map(r => [r.key, r.value]));
  const intros: Record<string, string> = {};
  // Version 0.2 kept one sentence ("intro"): it is the English one.
  if (typeof found["intro"] === "string" && found["intro"]) intros["en"] = found["intro"];
  const stored = found["intros"];
  if (stored && typeof stored === "object") for (const [k, v] of Object.entries(stored)) if (/^[a-z]{2}$/u.test(k) && typeof v === "string") intros[k] = v;
  return {
    companyName: typeof found["company_name"] === "string" ? found["company_name"] : defaults.companyName,
    formOpen: typeof found["form_open"] === "boolean" ? found["form_open"] : defaults.formOpen,
    intros,
    retentionMonths: typeof found["retention_months"] === "number" ? found["retention_months"] : defaults.retentionMonths,
    lateHours: typeof found["late_hours"] === "number" ? found["late_hours"] : defaults.lateHours,
    publicOrigin: typeof found["public_origin"] === "string" ? found["public_origin"] : null,
    hours: found["hours"] === undefined ? defaults.hours : readHours(found["hours"]),
    frameOrigins: Array.isArray(found["frame_origins"]) ? found["frame_origins"].filter((o): o is string => typeof o === "string" && isFrameOrigin(o)) : [],
    helpUrl: typeof found["help_url"] === "string" ? found["help_url"] : "",
  };
}

// The sentence above the form in a language: its own, else English's.
export const introFor = (s: Pick<Settings, "intros">, locale: string) => s.intros[locale] || s.intros["en"] || "";

async function setSetting(sql: Query, key: string, value: unknown): Promise<void> {
  await sql`insert into settings (key, value) values (${key}, ${sql.json(value as never)}) on conflict (key) do update set value = excluded.value`;
}

// A website that may frame the form: https, a host, no path (or a local
// address, to try it). Ten at most.
export const isFrameOrigin = (value: string) => /^(https:\/\/[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+|http:\/\/(localhost|127\.0\.0\.1))(:[0-9]{1,5})?$/u.test(value);
export function frameOrigins(value: unknown): string[] {
  const list = (Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,]+/u) : null);
  if (!list) throw new AppError("invalid");
  const out = [...new Set(list.map(v => (typeof v === "string" ? v.trim().toLowerCase().replace(/\/+$/u, "") : "")).filter(Boolean))];
  if (out.length > 10) throw new AppError("too_many", { max: 10 });
  if (out.some(o => !isFrameOrigin(o))) throw new AppError("invalid_origin");
  return out;
}

export type SettingsInput = { companyName?: unknown; formOpen?: unknown; intros?: unknown; retentionMonths?: unknown; lateHours?: unknown; hours?: unknown; frameOrigins?: unknown; helpUrl?: unknown };
export async function saveSettings(sql: Sql, actor: Member | null, input: SettingsInput): Promise<void> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  if (input.companyName !== undefined) await setSetting(sql, "company_name", clean(input.companyName, 80, { optional: true }));
  if (input.intros !== undefined) {
    if (!input.intros || typeof input.intros !== "object") throw new AppError("invalid");
    const current = (await settings(sql)).intros;
    for (const [k, v] of Object.entries(input.intros as Record<string, unknown>)) {
      if (!/^[a-z]{2}$/u.test(k)) throw new AppError("invalid");
      current[k] = clean(v, 500, { multiline: true, optional: true });
    }
    await setSetting(sql, "intros", current);
    await sql`delete from settings where key = 'intro'`;
  }
  if (typeof input.formOpen === "boolean") await setSetting(sql, "form_open", input.formOpen);
  if (input.retentionMonths !== undefined) {
    const months = Number(input.retentionMonths);
    if (!Number.isInteger(months) || months < 0 || months > 120) throw new AppError("invalid");
    await setSetting(sql, "retention_months", months);
  }
  if (input.lateHours !== undefined) {
    const hours = Number(input.lateHours);
    if (!(lateChoices as readonly number[]).includes(hours)) throw new AppError("invalid");
    await setSetting(sql, "late_hours", hours);
  }
  if (input.hours !== undefined) {
    const hours = parseHours(input.hours);
    if (!hours) throw new AppError("invalid");
    await setSetting(sql, "hours", hours);
  }
  if (input.frameOrigins !== undefined) await setSetting(sql, "frame_origins", frameOrigins(input.frameOrigins));
  if (input.helpUrl !== undefined) {
    const url = clean(input.helpUrl, 300, { optional: true });
    if (url && !/^https:\/\/[^\s<>"]+$/u.test(url)) throw new AppError("invalid_url");
    await setSetting(sql, "help_url", url);
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

async function insertTicket(sql: Query, input: { subject: string; email: string; name: string; channel: Ticket["channel"]; language: string; status?: Status; requester?: string | null }): Promise<{ id: string; number: number; secret: string }> {
  const secret = newSecret();
  const [row] = await sql<{ id: string; number: number }[]>`
    insert into tickets (number, subject, customer_email, customer_name, channel, secret_hash, language, status, requester)
    values (nextval('ticket_numbers'), ${input.subject}, ${input.email}, ${input.name}, ${input.channel}, ${hashSecret(secret)}, ${input.language}, ${input.status ?? "open"}, ${input.requester ?? null})
    returning id, number`;
  return { id: String(row!.id), number: row!.number, secret };
}

// What a received email adds to its message.
type MailParts = { mailFrom?: string | null; html?: string | null; original?: string | null; dropped?: { name: string; reason: string }[]; auto?: boolean };

// insertMessage adds a message and its files. A customer's message starts
// the wait for an answer, unless they were already waiting (a closed
// ticket starts again) — an automatic answer (out of office) never does.
async function insertMessage(sql: Query, ticketId: string, input: { kind: Message["kind"]; author: string | null; body: string; emailId?: string | null; delivery?: Message["delivery"]; files?: Stored[] } & MailParts): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into messages (ticket_id, kind, author, body, email_id, delivery, mail_from, html, original, dropped, auto)
    values (${ticketId}, ${input.kind}, ${input.author}, ${input.body}, ${input.emailId ?? null}, ${input.delivery ?? null}, ${input.mailFrom ?? null}, ${input.html ?? null}, ${input.original ?? null}, ${sql.json((input.dropped ?? []) as never)}, ${input.auto ?? false})
    returning id`;
  const messageId = String(row!.id);
  for (const f of input.files ?? []) await sql`insert into attachments (message_id, object, file_name, type, size) values (${messageId}, ${f.object}, ${f.fileName}, ${f.type}, ${f.size})`;
  if (input.kind === "customer" && !input.auto) await sql`update tickets set waiting_since = case when status in ('closed', 'spam') then now() else coalesce(waiting_since, now()) end where id = ${ticketId}`;
  return messageId;
}

// arrive runs the rules on a new request (lib/rules.ts): its tags, its
// priority, who gets it. Says who, when a rule gave it to someone.
async function arrive(sql: Query, ticketId: string, request: { subject: string; body: string; from: string }): Promise<string | null> {
  const decided = decide(await allRules(sql), request);
  for (const name of decided.tags) {
    const tag = await tagFor(sql, name).catch(error => {
      if (error instanceof AppError && error.code === "too_many") return null;
      throw error;
    });
    if (tag) await sql`insert into ticket_tags (ticket_id, tag_id) values (${ticketId}, ${tag.id}) on conflict do nothing`;
  }
  if (decided.priority) await sql`update tickets set priority = ${decided.priority} where id = ${ticketId}`;
  if (decided.assignee) await sql`update tickets set assignee = ${decided.assignee} where id = ${ticketId} and assignee is null`;
  return decided.assignee;
}

// withFiles takes the files of a message (take: after the text was
// checked, so a refusal never spends them), runs the step, and deletes the
// files again if the step fails: nothing stays that no message holds.
type Take = () => Promise<Stored[]>;
async function withFiles<T>(take: Take | undefined, step: (stored: Stored[]) => Promise<T>, drop: (objects: string[]) => Promise<void>): Promise<T> {
  const stored = take ? await take() : [];
  try {
    return await step(stored);
  } catch (error) {
    if (stored.length > 0) await drop(stored.map(f => f.object));
    throw error;
  }
}

// The public form's guard: 5 requests an hour from one address (a hash of
// it), 100 an hour from everyone; a honeypot field; a form sent faster than
// a person can type is refused (under 1.5 s) or held until 3 s have passed
// (lib/form-token.ts). Files have their own counters: 20 an hour
// from one address, 300 from everyone (the Chest adds its own, per
// minute).
export const formLimits = { perVisitorHour: 5, perHour: 100, minimumSeconds: 3, refuseSeconds: 1.5, filesPerVisitorHour: 20, filesPerHour: 300 } as const;

export async function guard(sql: Query, visitor: string, what: "form" | "file" = "form"): Promise<void> {
  const hour = new Date(Math.floor(Date.now() / 3600000) * 3600000);
  const prefix = what === "form" ? "v:" : "f:";
  const everyone = what === "form" ? "all" : "files";
  const key = prefix + createHash("sha256").update(visitor).digest("hex").slice(0, 32);
  const counts = await sql<{ key: string; count: number }[]>`
    insert into form_counts (key, hour, count) values (${key}, ${hour}, 1), (${everyone}, ${hour}, 1)
    on conflict (key, hour) do update set count = form_counts.count + 1
    returning key, count`;
  const mine = counts.find(c => c.key === key)?.count ?? 0;
  const all = counts.find(c => c.key === everyone)?.count ?? 0;
  const [perVisitor, perHour] = what === "form" ? [formLimits.perVisitorHour, formLimits.perHour] : [formLimits.filesPerVisitorHour, formLimits.filesPerHour];
  if (mine > perVisitor || all > perHour) throw new AppError("too_many");
  await sql`delete from form_counts where hour < ${new Date(hour.getTime() - 86400000)}`;
}

export type PublicInput = { name: unknown; email: unknown; subject: unknown; message: unknown; language: string };
// How the files of a message are taken, and deleted if it is not saved
// (lib/attachments.ts: take and remove).
export type Files = { take?: Take; drop: (objects: string[]) => Promise<void> };
const noFiles: Files = { drop: async () => {} };

// fromForm opens a ticket from the public form, with the files the visitor
// sent; says its number and the follow-up link's secret (shown once, never
// stored).
export async function fromForm(sql: Sql, input: PublicInput, files: Files = noFiles): Promise<{ id: string; number: number; secret: string; files: number; assignee: string | null; repeated?: boolean }> {
  const s = await settings(sql);
  if (!s.formOpen) throw new AppError("closed_form");
  const name = clean(input.name, limits.name, { optional: true });
  const address = email(input.email);
  const subject = clean(input.subject, limits.subject);
  const body = clean(input.message, limits.publicBody, { multiline: true });
  // The same request again within ten minutes (a double tap, Back then
  // Send): the ticket already there, with a link of its own; nothing twice.
  const [again] = await sql<{ id: string; number: number; assignee: string | null }[]>`
    select t.id, t.number, t.assignee from tickets t
    where t.channel = 'form' and lower(t.customer_email) = lower(${address}) and t.subject = ${subject} and t.created_at > now() - interval '10 minutes'
      and t.status <> 'spam' and (select m.body from messages m where m.ticket_id = t.id order by m.created_at, m.id limit 1) = ${body}
    order by t.id desc limit 1`;
  if (again) {
    const secret = newSecret();
    await sql`insert into ticket_links (secret_hash, ticket_id) values (${hashSecret(secret)}, ${again.id})`;
    // Files sent the second time are not taken: the first sending has them.
    return { id: String(again.id), number: again.number, secret, files: 0, assignee: again.assignee, repeated: true };
  }
  return withFiles(files.take, stored => sql.begin(async tx => {
    const t = await insertTicket(tx, { subject, email: address, name, channel: "form", language: input.language });
    await insertMessage(tx, t.id, { kind: "customer", author: null, body, files: stored });
    const assignee = await arrive(tx, t.id, { subject, body, from: address });
    await refreshSearch(tx, t.id);
    return { ...t, files: stored.length, assignee };
  }), files.drop);
}

// fromTeam opens a ticket for a customer who called or came by: what they
// asked is written by an agent (who is recorded).
export async function fromTeam(sql: Sql, actor: Member | null, input: { name: unknown; email: unknown; subject: unknown; message: unknown; language?: unknown }): Promise<{ id: string; number: number; secret: string }> {
  if (!actor || !can(actor, "tickets.answer")) throw new AppError("forbidden");
  const name = clean(input.name, limits.name, { optional: true });
  const address = email(input.email);
  const subject = clean(input.subject, limits.subject);
  const body = clean(input.message, limits.body, { multiline: true });
  const language = isLocale(input.language) ? input.language : "en";
  return sql.begin(async tx => {
    const t = await insertTicket(tx, { subject, email: address, name, channel: "team", language });
    await insertMessage(tx, t.id, { kind: "customer", author: actor.id, body });
    await tx`update tickets set assignee = ${actor.id} where id = ${t.id}`;
    await refreshSearch(tx, t.id);
    return t;
  });
}

// fromForms opens a ticket for an answer to a form of Forms (the event
// "forms.request", read and bounded by lib/forms-in.ts): from a customer's
// address (a public form) or from a colleague (a team form: their member
// id only). The same event delivered again, or another event for the same
// answer, opens nothing: says the ticket already there (created: false).
// Otherwise as a request of the public form: the rules on arrival run, and
// the follow-up link's secret is said once (for the confirmation email).
export type FormsRequest = { event: string; source: Source; subject: string; body: string; email: string | null; name: string; member: string | null; language: string };
export type FromForms = { id: string; number: number; created: boolean; secret: string | null; assignee: string | null };

export async function fromForms(sql: Sql, r: FormsRequest): Promise<FromForms> {
  const known = async (): Promise<FromForms | null> => {
    const [row] = await sql<{ id: string; number: number }[]>`
      select id, number from tickets
      where source_event = ${r.event} or (source is not null and source -> 'form' ->> 'id' = ${r.source.form.id} and source -> 'answer' ->> 'id' = ${r.source.answer.id})
      limit 1`;
    return row ? { id: String(row.id), number: row.number, created: false, secret: null, assignee: null } : null;
  };
  const already = await known();
  if (already) return already;
  if (!r.member && !r.email) throw new AppError("invalid");
  try {
    return await sql.begin(async tx => {
      const t = await insertTicket(tx, { subject: r.subject, email: r.member ? "" : r.email!, name: r.member ? "" : r.name, channel: "forms", language: r.language, requester: r.member });
      await tx`update tickets set source = ${tx.json(r.source as never)}, source_event = ${r.event} where id = ${t.id}`;
      await insertMessage(tx, t.id, { kind: "customer", author: null, body: r.body });
      const assignee = await arrive(tx, t.id, { subject: r.subject, body: r.body, from: r.member ? "" : r.email! });
      await refreshSearch(tx, t.id);
      return { id: t.id, number: t.number, created: true, secret: t.secret, assignee };
    });
  } catch (error) {
    // Two deliveries at once: the other one opened it.
    if ((error as { code?: unknown }).code === "23505") {
      const other = await known();
      if (other) return other;
    }
    throw error;
  }
}

// fromEmail files an email received on the support mailbox (the Chest
// posts it, lib/mail-in via app/chest-mail). Where it belongs, most
// certain first:
//
// 1. its thread address (support+t1042-…@): the tag only this tool makes,
//    checked by the SDK — a reply to one of our emails, whoever sends it;
// 2. its In-Reply-To and References: one of the emails we sent about a
//    ticket (their ids are random: only who received them knows them), or
//    one the same customer sent before, if the Chest vouches for the sender;
// 3. last, only when the Chest vouches for the sender (authenticated): the
//    same customer's address and either "[#1042]" in the subject, or the
//    same subject on a ticket still open that moved in the last 14 days.
//
// Otherwise a new ticket: a stranger never lands in someone else's
// conversation. An automatic answer (out of office) is kept on the ticket
// it answers, quietly — it reopens nothing, starts no wait, tells no one —
// and opens no ticket at all. A merged ticket's mail goes to the ticket it
// was merged into. Spam scores 5 and above go to the spam folder (the
// Chest keeps 8 and above in its quarantine).
export type IncomingEmail = Pick<Received, "from" | "subject" | "text" | "html" | "original" | "messageId" | "inReplyTo" | "references" | "attachments" | "dropped" | "spam" | "thread" | "authenticated" | "auto">;
export type Filed = { id: string; number: number; created: boolean; secret: string | null; auto: boolean; spam: boolean; assignee: string | null };
export const spamFrom = 5;
const recentDays = 14;

async function followMerges(sql: Query, found: { id: string; number: number } | undefined): Promise<{ id: string; number: number } | undefined> {
  let current = found;
  for (let i = 0; current && i < 5; i++) {
    const [next] = await sql<{ id: string; number: number }[]>`select x.id, x.number from tickets t join tickets x on x.id = t.merged_into where t.id = ${current.id}`;
    if (!next) break;
    current = { id: String(next.id), number: next.number };
  }
  return current;
}

export async function fromEmail(sql: Sql, message: IncomingEmail, language: string): Promise<Filed | null> {
  const from = message.from.address;
  return sql.begin(async tx => {
    // Delivered twice: filed once.
    const [again] = await tx<{ ticket_id: string; number: number; status: Status }[]>`select m.ticket_id, t.number, t.status from messages m join tickets t on t.id = m.ticket_id where m.email_id = ${message.messageId} and m.kind = 'customer'`;
    if (again) return { id: String(again.ticket_id), number: again.number, created: false, secret: null, auto: message.auto, spam: again.status === "spam", assignee: null };
    let found: { id: string; number: number } | undefined;
    if (message.thread && /^[1-9][0-9]{0,8}$/u.test(message.thread)) [found] = await tx<{ id: string; number: number }[]>`select id, number from tickets where number = ${Number(message.thread)}`;
    const ids = [...new Set([message.inReplyTo, ...message.references].filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 998))].slice(-50);
    if (!found && ids.length > 0) {
      [found] = await tx<{ id: string; number: number }[]>`
        select t.id, t.number from messages m join tickets t on t.id = m.ticket_id
        where m.email_id in ${tx(ids)} and (m.kind = 'reply' or (${message.authenticated} and m.kind = 'customer' and lower(coalesce(m.mail_from, t.customer_email)) = lower(${from})))
        order by m.created_at desc limit 1`;
      if (!found) [found] = await tx<{ id: string; number: number }[]>`select id, number from tickets where confirm_email_id in ${tx(ids)} limit 1`;
    }
    if (!found && message.authenticated && !message.auto) {
      const number = numberInSubject(message.subject);
      if (number !== null) [found] = await tx<{ id: string; number: number }[]>`select id, number from tickets where number = ${number} and lower(customer_email) = lower(${from})`;
      const base = baseSubject(message.subject);
      if (!found && base) {
        const recent = await tx<{ id: string; number: number; subject: string }[]>`
          select id, number, subject from tickets where lower(customer_email) = lower(${from}) and status in ('open', 'waiting') and merged_into is null and updated_at > now() - ${recentDays + " days"}::interval
          order by updated_at desc limit 20`;
        found = recent.find(r => baseSubject(r.subject) === base);
      }
    }
    found = await followMerges(tx, found);
    const body = clean(message.text || "—", limits.body, { multiline: true });
    const parts: MailParts = { mailFrom: from, html: message.html && message.html.length <= 2 << 20 ? message.html : null, original: message.original, dropped: message.dropped.map(d => ({ name: fileNameOf(d.name), reason: d.reason })), auto: message.auto };
    if (message.auto) {
      if (!found) return null;
      const messageId = await insertMessage(tx, String(found.id), { kind: "customer", author: null, body, emailId: message.messageId, ...parts });
      await attach(tx, messageId, message.attachments);
      return { id: String(found.id), number: found.number, created: false, secret: null, auto: true, spam: false, assignee: null };
    }
    let ticketId: string, number: number, created = false, secret: string | null = null, spam = false, assignee: string | null = null;
    if (found) {
      ticketId = String(found.id);
      number = found.number;
      const [t] = await tx<{ status: Status; customer_email: string }[]>`
        update tickets set waiting_since = case when status in ('closed', 'spam') then now() else waiting_since end, status = case when status = 'spam' then 'spam' else 'open' end, closed_at = null, updated_at = now()
        where id = ${ticketId} returning status, customer_email`;
      spam = t?.status === "spam";
      // Their address works again: the old bounce no longer says anything.
      if (t && t.customer_email.toLowerCase() === from.toLowerCase()) await tx`update tickets set bounce = null where id = ${ticketId}`;
    } else {
      spam = message.spam >= spamFrom;
      const subject = clean(message.subject || "—", limits.subject);
      const t = await insertTicket(tx, { subject, email: from, name: clean(message.from.name ?? "", limits.name, { optional: true }), channel: "email", language, status: spam ? "spam" : "open" });
      [ticketId, number, created, secret] = [t.id, t.number, true, t.secret];
    }
    const messageId = await insertMessage(tx, ticketId, { kind: "customer", author: null, body, emailId: message.messageId, ...parts });
    await attach(tx, messageId, message.attachments);
    if (created && !spam) assignee = await arrive(tx, ticketId, { subject: message.subject, body, from });
    await refreshSearch(tx, ticketId);
    return { id: ticketId, number, created, secret, auto: false, spam, assignee };
  });
}

const fileNameOf = (name: string) => clean(name || "file", limits.fileName, { optional: true }).replace(/[/\\]/gu, "_") || "file";

// The files the Chest kept from an email (already in the tool's files).
async function attach(sql: Query, messageId: string, files: IncomingEmail["attachments"]): Promise<void> {
  for (const a of files.slice(0, limits.attachmentsPerMessage)) {
    await sql`insert into attachments (message_id, object, file_name, type, size) values (${messageId}, ${a.file}, ${fileNameOf(a.name)}, ${a.type.slice(0, 200)}, ${a.size}) on conflict (object) do nothing`;
  }
}

// confirmed records the confirmation email sent for a new ticket: its
// bounce says the address is wrong, a reply to it lands on the ticket.
export async function confirmed(sql: Query, ticketId: string, mail: { id: string; messageId: string }): Promise<void> {
  await sql`update tickets set confirm_mail_id = ${mail.id}, confirm_email_id = ${mail.messageId} where id = ${ticketId}`;
}

// confirmations counts the confirmations sent to an address in the last
// hour: past a few, none more (a robot answering robots).
export async function confirmations(sql: Query, address: string): Promise<number> {
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from tickets where lower(customer_email) = lower(${address}) and confirm_mail_id is not null and created_at > now() - interval '1 hour'`;
  return row?.n ?? 0;
}

// bounced records that an email we sent did not arrive: on the reply it
// was (or on the ticket, for a confirmation). Says whose ticket and reply,
// so the one who wrote it hears of it. Null for a message we do not know.
export async function bounced(sql: Sql, b: { message: string; recipient: string; permanent: boolean; reason: string; at: string }): Promise<{ ticketId: string; number: number; author: string | null; assignee: string | null } | null> {
  const bounce: Bounce = { permanent: b.permanent, reason: b.reason.slice(0, 500), at: b.at, recipient: b.recipient };
  return sql.begin(async tx => {
    const [reply] = await tx<{ ticket_id: string; author: string | null }[]>`update messages set bounce = ${tx.json(bounce as never)} where mail_id = ${b.message} returning ticket_id, author`;
    const [t] = reply
      ? await tx<{ id: string; number: number; assignee: string | null }[]>`update tickets set bounce = ${tx.json(bounce as never)} where id = ${reply.ticket_id} returning id, number, assignee`
      : await tx<{ id: string; number: number; assignee: string | null }[]>`update tickets set bounce = ${tx.json(bounce as never)} where confirm_mail_id = ${b.message} returning id, number, assignee`;
    return t ? { ticketId: String(t.id), number: t.number, author: reply?.author ?? null, assignee: t.assignee } : null;
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
      count(*) filter (where status = 'spam')::int as spam,
      count(*) filter (where status <> 'spam')::int as "all"
    from tickets`;
  return row!;
}

// The inbox's filters: one priority, one tag, and the order.
export type Filters = { priority?: unknown; tag?: unknown; sort?: unknown };

export async function listTickets(sql: Sql, actor: Member | null, folder: unknown, query?: unknown, filters: Filters = {}): Promise<TicketRow[]> {
  if (!actor || !can(actor, "tickets.read")) throw new AppError("forbidden");
  const f: Folder = isFolder(folder) ? folder : "unassigned";
  const priority: Priority | null = isPriority(filters.priority) ? filters.priority : null;
  let tag: string | null = null;
  try {
    tag = filters.tag === undefined || filters.tag === null || filters.tag === "" ? null : id(filters.tag);
  } catch {
    tag = "0";
  }
  const sort: Sort = isSort(filters.sort) ? filters.sort : defaultSort;
  const q = typeof query === "string" ? query.trim().slice(0, 100) : "";
  const words = q.split(/\s+/u).map(w => w.replace(/[^\p{L}\p{N}@._-]/gu, "")).filter(Boolean).slice(0, 8);
  const where = q
    ? sql`(t.search @@ to_tsquery('simple', ${words.map(w => w.replace(/[@._-]/gu, " ").trim().split(" ").map(x => x + ":*").join(" & ")).join(" & ") || "x"}) or t.subject ilike ${"%" + q.replace(/[\\%_]/gu, "\\$&") + "%"} or lower(t.customer_email) = lower(${q}) or t.number::text = ${q.replace(/^#/u, "")})`
    : f === "unassigned" ? sql`t.status = 'open' and t.assignee is null`
    : f === "mine" ? sql`t.status in ('open', 'waiting') and t.assignee = ${actor.id}`
    : f === "all" ? sql`t.status <> 'spam'`
    : sql`t.status = ${f}`;
  // The most urgent first, then who has waited longest (the customer's
  // first unanswered message, else the last change); a closed folder, a
  // search or everything: the latest first.
  const natural = f === "closed" || f === "all" || q ? sql`t.updated_at desc` : sql`coalesce(t.waiting_since, t.updated_at) asc`;
  const order = sort === "recent" ? sql`t.updated_at desc`
    : sort === "priority" ? sql`case t.priority when 'urgent' then 3 when 'high' then 2 when 'normal' then 1 else 0 end desc, ${natural}`
    : natural;
  const rows = await sql<(TicketDb & { last: string; last_kind: string; messages: number; tags: Tag[] })[]>`
    select ${columns(sql)},
      (select body from messages where ticket_id = t.id and kind in ('customer', 'reply') order by created_at desc, id desc limit 1) as last,
      (select kind from messages where ticket_id = t.id and kind <> 'event' order by created_at desc, id desc limit 1) as last_kind,
      (select count(*)::int from messages where ticket_id = t.id) as messages,
      ${tagsOf(sql)} as tags
    from tickets t
    where ${where}
      ${priority ? sql`and t.priority = ${priority}` : sql``}
      ${tag ? sql`and exists (select 1 from ticket_tags x where x.ticket_id = t.id and x.tag_id = ${tag})` : sql``}
    order by ${order}, t.id
    limit ${limits.page}`;
  const reader = readerWords(actor);
  return rows.map(r => ({ ...toTicket(r), last: (r.last ?? "").slice(0, 200), lastKind: r.last_kind, messages: r.messages, tags: (r.tags ?? []).map(g => ({ ...g, name: shownTag(g.name, reader) })) }));
}

async function byNumber(sql: Query, number: unknown): Promise<Ticket> {
  const [row] = await sql<TicketDb[]>`select ${columns(sql)} from tickets t where number = ${ticketNumber(number)}`;
  if (!row) throw new AppError("not_found");
  return toTicket(row);
}

async function messagesOf(sql: Query, ticketId: string, team: boolean): Promise<Message[]> {
  const rows = await sql<{ id: string; kind: Message["kind"]; author: string | null; body: string; created_at: Date; delivery: Message["delivery"]; email_id: string | null; mail_from: string | null; html: string | null; original: string | null; dropped: { name: string; reason: string }[] | null; auto: boolean; bounce: Bounce | null }[]>`
    select id, kind, author, body, created_at, delivery, email_id, mail_from, html, original, dropped, auto, bounce from messages
    where ticket_id = ${ticketId} ${team ? sql`` : sql`and kind in ${sql(publicKinds as unknown as string[])} and not auto`}
    order by created_at, id`;
  const ids = rows.map(r => String(r.id));
  const files = ids.length ? await sql<{ id: string; message_id: string; file_name: string; type: string; size: string }[]>`select id, message_id, file_name, type, size from attachments where message_id in ${sql(ids)} order by id` : [];
  return rows.map(r => ({
    id: String(r.id), kind: r.kind, author: r.author, body: r.body, at: r.created_at.toISOString(), delivery: r.delivery, emailId: r.email_id,
    attachments: files.filter(f => String(f.message_id) === String(r.id)).map(f => ({ id: String(f.id), fileName: f.file_name, type: f.type, size: Number(f.size) })),
    // The customer's page never learns more than the words and the files.
    mailFrom: team ? r.mail_from : null, html: team ? r.html : null, original: team && r.original !== null, dropped: team ? r.dropped ?? [] : [], auto: r.auto, bounce: team ? r.bounce : null,
  }));
}

export type TicketDetail = Ticket & { messages: Message[]; others: { number: number; subject: string; status: Status; updatedAt: string }[]; viewing: string[]; tags: Tag[] };

// ticket reads one ticket for the team, notes included; marks the actor as
// on it (for "Hugo is on this ticket").
export async function ticket(sql: Sql, actor: Member | null, number: unknown): Promise<TicketDetail> {
  if (!actor || !can(actor, "tickets.read")) throw new AppError("forbidden");
  const t = await byNumber(sql, number);
  await sql`insert into viewing (ticket_id, member_id, at) values (${t.id}, ${actor.id}, now()) on conflict (ticket_id, member_id) do update set at = now()`;
  const viewing = (await sql<{ member_id: string }[]>`select member_id from viewing where ticket_id = ${t.id} and member_id <> ${actor.id} and at > now() - interval '40 seconds'`).map(r => r.member_id);
  const others = await sql<{ number: number; subject: string; status: Status; updated_at: Date }[]>`
    select number, subject, status, updated_at from tickets
    where ${t.requester ? sql`requester = ${t.requester} and requester <> 'erased'` : sql`lower(customer_email) = lower(${t.customerEmail})`} and id <> ${t.id} and merged_into is null order by updated_at desc limit 10`;
  const [tagged] = await sql<{ tags: Tag[] }[]>`select ${tagsOf(sql)} as tags from tickets t where t.id = ${t.id}`;
  return { ...t, messages: await messagesOf(sql, t.id, true), others: others.map(o => ({ number: o.number, subject: o.subject, status: o.status, updatedAt: o.updated_at.toISOString() })), viewing, tags: (tagged?.tags ?? []).map(g => ({ ...g, name: shownTag(g.name, readerWords(actor)) })) };
}

// ---- Answering -------------------------------------------------------------

// reply adds the team's answer, with its files; the ticket then waits on
// the customer (or closes), who no longer waits on us. Says what the mail
// needs to send it.
// Threading: the email it answers (the customer's last) and the whole
// conversation's ids, the confirmation first.
export type Threading = { inReplyTo: string | null; references: string[] };

export async function reply(sql: Sql, actor: Member | null, number: unknown, body: unknown, options: { close?: boolean } = {}, files: Files = noFiles): Promise<{ ticket: Ticket; messageId: string; threading: Threading; files: Stored[] }> {
  if (!actor || !can(actor, "tickets.answer")) throw new AppError("forbidden");
  const text = clean(body, limits.body, { multiline: true });
  const t = await byNumber(sql, number);
  if (t.status === "spam") throw new AppError("forbidden");
  if (t.mergedInto !== null) throw new AppError("merged", { number: t.mergedInto });
  return withFiles(files.take, stored => sql.begin(async tx => {
    const messageId = await insertMessage(tx, t.id, { kind: "reply", author: actor.id, body: text, files: stored });
    const status: Status = options.close ? "closed" : "waiting";
    await tx`update tickets set status = ${status}, closed_at = ${options.close ? tx`now()` : null}, updated_at = now(), waiting_since = null, assignee = coalesce(assignee, ${actor.id}) where id = ${t.id}`;
    await refreshSearch(tx, t.id);
    const ids = await tx<{ email_id: string; kind: string }[]>`
      select email_id, kind from messages where ticket_id = ${t.id} and email_id is not null
      union all select confirm_email_id, 'confirm' from tickets where id = ${t.id} and confirm_email_id is not null`;
    const ordered = [...ids.filter(r => r.kind === "confirm"), ...ids.filter(r => r.kind !== "confirm")];
    const threading: Threading = { inReplyTo: ordered.filter(r => r.kind === "customer").at(-1)?.email_id ?? ordered.at(-1)?.email_id ?? null, references: ordered.map(r => r.email_id).slice(-20) };
    return { ticket: { ...t, status, waitingSince: null, assignee: t.assignee ?? actor.id }, messageId, threading, files: stored };
  }), files.drop);
}

// delivered records how a reply reached the customer: by email, or on the
// follow-up page only (no mail yet, or an address the Chest refuses since
// it bounced: said on the reply).
export async function delivered(sql: Query, messageId: string, delivery: "email" | "page", mail?: { id: string; messageId: string }, refused?: Bounce): Promise<void> {
  await sql`update messages set delivery = ${delivery}, mail_id = ${mail?.id ?? null}, email_id = ${mail?.messageId ?? null}, bounce = ${refused ? sql.json(refused as never) : null} where id = ${messageId}`;
}

export async function note(sql: Sql, actor: Member | null, number: unknown, body: unknown, files: Files = noFiles): Promise<Ticket> {
  if (!actor || !can(actor, "tickets.answer")) throw new AppError("forbidden");
  const text = clean(body, limits.body, { multiline: true });
  const t = await byNumber(sql, number);
  await withFiles(files.take, stored => sql.begin(async tx => {
    await insertMessage(tx, t.id, { kind: "note", author: actor.id, body: text, files: stored });
    await tx`update tickets set updated_at = now() where id = ${t.id}`;
  }), files.drop);
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

// setPriority: low, normal, high or urgent. Does not move the ticket in
// the inbox's default order (its wait does not change).
export async function setPriority(sql: Sql, actor: Member | null, number: unknown, priority: unknown): Promise<Ticket> {
  if (!actor || !can(actor, "tickets.manage")) throw new AppError("forbidden");
  if (!isPriority(priority)) throw new AppError("invalid");
  const t = await byNumber(sql, number);
  await sql`update tickets set priority = ${priority} where id = ${t.id}`;
  return { ...t, priority };
}

// ---- Tags ------------------------------------------------------------------

// tags lists the team's tags, with how many tickets carry each.
export async function tags(sql: Sql, actor: Member | null): Promise<(Tag & { tickets: number })[]> {
  if (!can(actor, "tickets.read")) throw new AppError("forbidden");
  const rows = await sql<{ id: string; name: string; tickets: number }[]>`
    select g.id, g.name, (select count(*)::int from ticket_tags x join tickets t on t.id = x.ticket_id where x.tag_id = g.id and t.status <> 'spam') as tickets
    from tags g order by lower(g.name)`;
  const words = readerWords(actor);
  return rows.map(r => ({ id: String(r.id), name: shownTag(r.name, words), tickets: r.tickets }));
}

// tagFor finds a tag by its name, whatever its case, or creates it.
async function tagFor(sql: Query, name: string): Promise<Tag> {
  // A seeded tag this desk has, named in any language ("Abîmé",
  // "Damaged"), is that tag; a new tag is the words typed.
  const seeded = storedTag(name);
  if (seeded !== name) {
    const [kept] = await sql<{ id: string; name: string }[]>`select id, name from tags where name = ${seeded}`;
    if (kept) return { id: String(kept.id), name: kept.name };
  }
  const [found] = await sql<{ id: string; name: string }[]>`select id, name from tags where lower(name) = lower(${name})`;
  if (found) return { id: String(found.id), name: found.name };
  const [count] = await sql<{ n: number }[]>`select count(*)::int as n from tags`;
  if ((count?.n ?? 0) >= limits.tags) throw new AppError("too_many", { max: limits.tags });
  const [made] = await sql<{ id: string; name: string }[]>`insert into tags (name) values (${name}) on conflict (lower(name)) do update set name = tags.name returning id, name`;
  return { id: String(made!.id), name: made!.name };
}

// addTag puts a tag on a ticket, creating it on the fly: those who answer
// build the list as they go. Ten tags a ticket at most.
export async function addTag(sql: Sql, actor: Member | null, number: unknown, name: unknown): Promise<Tag> {
  if (!actor || !can(actor, "tickets.manage")) throw new AppError("forbidden");
  const text = tagName(name);
  const t = await byNumber(sql, number);
  return sql.begin(async tx => {
    const tag = await tagFor(tx, text);
    const [count] = await tx<{ n: number }[]>`select count(*)::int as n from ticket_tags where ticket_id = ${t.id} and tag_id <> ${tag.id}`;
    if ((count?.n ?? 0) >= limits.tagsPerTicket) throw new AppError("too_many", { max: limits.tagsPerTicket });
    await tx`insert into ticket_tags (ticket_id, tag_id) values (${t.id}, ${tag.id}) on conflict do nothing`;
    return { ...tag, name: shownTag(tag.name, readerWords(actor)) };
  });
}

export async function removeTag(sql: Sql, actor: Member | null, number: unknown, tagId: unknown): Promise<void> {
  if (!actor || !can(actor, "tickets.manage")) throw new AppError("forbidden");
  const t = await byNumber(sql, number);
  await sql`delete from ticket_tags where ticket_id = ${t.id} and tag_id = ${id(tagId)}`;
}

// renameTag: for everyone, on every ticket. A name another tag has merges
// the two (their tickets keep one tag).
export async function renameTag(sql: Sql, actor: Member | null, tagId: unknown, name: unknown): Promise<Tag> {
  if (!can(actor, "tags.manage")) throw new AppError("forbidden");
  const key = id(tagId);
  const text = tagName(name);
  return sql.begin(async tx => {
    const [current] = await tx<{ id: string; name: string }[]>`select id, name from tags where id = ${key} for update`;
    if (!current) throw new AppError("not_found");
    // A seeded tag saved as a reader saw it (in any language) is not renamed.
    if (locales.some(l => shownTag(current.name, catalogue(l)) === text)) return { id: key, name: shownTag(current.name, readerWords(actor)) };
    const [other] = await tx<{ id: string; name: string }[]>`select id, name from tags where lower(name) = lower(${text}) and id <> ${key}`;
    if (!other) {
      await tx`update tags set name = ${text} where id = ${key}`;
      return { id: key, name: text };
    }
    await tx`insert into ticket_tags (ticket_id, tag_id) select ticket_id, ${other.id} from ticket_tags where tag_id = ${key} on conflict do nothing`;
    await tx`delete from tags where id = ${key}`;
    return { id: String(other.id), name: other.name };
  });
}

// deleteTag takes a tag off every ticket; says what undoing needs.
export async function deleteTag(sql: Sql, actor: Member | null, tagId: unknown): Promise<{ name: string; shown: string; tickets: string[] }> {
  if (!can(actor, "tags.manage")) throw new AppError("forbidden");
  const key = id(tagId);
  return sql.begin(async tx => {
    const tickets = (await tx<{ ticket_id: string }[]>`select ticket_id from ticket_tags where tag_id = ${key}`).map(r => String(r.ticket_id));
    const [tag] = await tx<{ name: string }[]>`delete from tags where id = ${key} returning name`;
    if (!tag) throw new AppError("not_found");
    // name: as kept (a seeded tag's key, for Undo); shown: as the reader reads it.
    return { name: tag.name, shown: shownTag(tag.name, readerWords(actor)), tickets };
  });
}

// restoreTag undoes deleteTag: the tag again, on the tickets it was on
// (those that still exist).
export async function restoreTag(sql: Sql, actor: Member | null, input: { name: unknown; tickets: unknown }): Promise<Tag> {
  if (!can(actor, "tags.manage")) throw new AppError("forbidden");
  const text = tagName(input.name);
  if (!Array.isArray(input.tickets) || input.tickets.length > 100000) throw new AppError("invalid");
  const ids = input.tickets.map(x => id(x));
  return sql.begin(async tx => {
    const tag = await tagFor(tx, text);
    for (let i = 0; i < ids.length; i += 1000) await tx`insert into ticket_tags (ticket_id, tag_id) select id, ${tag.id} from tickets where id in ${tx(ids.slice(i, i + 1000))} on conflict do nothing`;
    return { ...tag, name: shownTag(tag.name, readerWords(actor)) };
  });
}

export async function setStatus(sql: Sql, actor: Member | null, number: unknown, status: unknown): Promise<Ticket> {
  if (!actor || !can(actor, "tickets.manage")) throw new AppError("forbidden");
  if (!isStatus(status)) throw new AppError("invalid");
  const t = await byNumber(sql, number);
  await sql`update tickets set status = ${status}, closed_at = ${status === "closed" ? sql`now()` : null}, updated_at = now() where id = ${t.id}`;
  return { ...t, status };
}

// setCustomer corrects the customer's email address or name (a typo that
// makes emails bounce): their tickets' other requests follow the address.
export async function setCustomer(sql: Sql, actor: Member | null, number: unknown, input: { email: unknown; name: unknown }): Promise<Ticket> {
  if (!actor || !can(actor, "tickets.manage")) throw new AppError("forbidden");
  const address = email(input.email);
  const name = clean(input.name, limits.name, { optional: true });
  const t = await byNumber(sql, number);
  // A colleague is named by the Chest: Support keeps no address of theirs.
  if (t.requester) throw new AppError("forbidden");
  await sql.begin(async tx => {
    await tx`update tickets set customer_email = ${address}, customer_name = ${name}, bounce = case when lower(customer_email) = lower(${address}) then bounce else null end where id = ${t.id}`;
    await refreshSearch(tx, t.id);
  });
  return { ...t, customerEmail: address, customerName: name, bounce: t.customerEmail.toLowerCase() === address.toLowerCase() ? t.bounce : null };
}

// ---- Merging ---------------------------------------------------------------

// merge puts a ticket's conversation into another of the same customer
// (they wrote twice): its messages move, in time order, its tags follow,
// it closes and leads to the other (its link, its email thread). Only the
// same customer's: a merge never shows anyone another person's messages.
// Says what undoing needs.
export async function merge(sql: Sql, actor: Member | null, fromNumber: unknown, intoNumber: unknown): Promise<{ from: Ticket; into: Ticket; status: Status }> {
  if (!actor || !can(actor, "tickets.manage")) throw new AppError("forbidden");
  const from = await byNumber(sql, fromNumber);
  const into = await byNumber(sql, intoNumber);
  if (from.id === into.id) throw new AppError("merge_same");
  if (from.mergedInto !== null || into.mergedInto !== null) throw new AppError("merged", { number: from.mergedInto ?? into.mergedInto ?? 0 });
  // A colleague's request merges only with the same colleague's (never an
  // erased one's: nobody can tell whose it was).
  if (from.customerEmail.toLowerCase() !== into.customerEmail.toLowerCase() || from.requester !== into.requester || from.requester === "erased") throw new AppError("merge_other_customer");
  if (from.status === "spam" || into.status === "spam") throw new AppError("forbidden");
  await sql.begin(async tx => {
    await tx`update messages set merged_from = ${from.id}, ticket_id = ${into.id} where ticket_id = ${from.id}`;
    await tx`insert into ticket_tags (ticket_id, tag_id) select ${into.id}, tag_id from ticket_tags where ticket_id = ${from.id} on conflict do nothing`;
    await insertMessage(tx, into.id, { kind: "event", author: actor.id, body: mergedEvent(from.number, into.status) });
    // The wait is the earliest unanswered of the two; open if either waits on us.
    await tx`
      update tickets set
        status = case when ${from.status} = 'open' or status = 'open' then 'open' when status = 'closed' and ${from.status} = 'waiting' then 'waiting' else status end,
        waiting_since = case when ${from.waitingSince}::timestamptz is null then waiting_since when waiting_since is null then ${from.waitingSince}::timestamptz else least(waiting_since, ${from.waitingSince}::timestamptz) end,
        priority = case when ${priorityRank(from.priority)} > (case priority when 'urgent' then 3 when 'high' then 2 when 'normal' then 1 else 0 end) then ${from.priority} else priority end,
        assignee = coalesce(assignee, ${from.assignee}), closed_at = case when ${from.status} in ('open', 'waiting') then null else closed_at end, updated_at = now()
      where id = ${into.id}`;
    await tx`update tickets set status = 'closed', closed_at = now(), updated_at = now(), waiting_since = null, merged_into = ${into.id} where id = ${from.id}`;
    await refreshSearch(tx, from.id);
    await refreshSearch(tx, into.id);
  });
  return { from, into, status: from.status };
}
const priorityRank = (p: Priority) => ({ low: 0, normal: 1, high: 2, urgent: 3 })[p];

// unmerge undoes a merge: the messages that came from the ticket go back,
// it gets its state again.
export async function unmerge(sql: Sql, actor: Member | null, fromNumber: unknown, status: unknown): Promise<void> {
  if (!actor || !can(actor, "tickets.manage")) throw new AppError("forbidden");
  const from = await byNumber(sql, fromNumber);
  if (from.mergedInto === null) return;
  const back: Status = isStatus(status) && status !== "spam" ? status : "open";
  await sql.begin(async tx => {
    const [into] = await tx<{ id: string }[]>`select merged_into as id from tickets where id = ${from.id}`;
    await tx`update messages set ticket_id = ${from.id}, merged_from = null where merged_from = ${from.id}`;
    const [event] = await tx<{ body: string }[]>`delete from messages where ticket_id = ${into!.id} and kind = 'event' and body like ${"merged:" + from.number + ":%"} returning body`;
    const before = event ? readMerged(event.body)?.before : null;
    if (before) await tx`update tickets set status = ${before}, closed_at = case when ${before} = 'closed' then coalesce(closed_at, now()) else null end where id = ${into!.id}`;
    await tx`update tickets set merged_into = null, status = ${back}, closed_at = ${back === "closed" ? tx`now()` : null}, updated_at = now(),
      waiting_since = case when ${back} = 'open' then (select min(m.created_at) from messages m where m.ticket_id = ${from.id} and m.kind = 'customer' and not m.auto and m.created_at > coalesce((select max(r.created_at) from messages r where r.ticket_id = ${from.id} and r.kind = 'reply'), '-infinity')) else null end
      where id = ${from.id}`;
    await tx`update tickets set waiting_since = (select min(m.created_at) from messages m where m.ticket_id = ${into!.id} and m.kind = 'customer' and not m.auto and m.created_at > coalesce((select max(r.created_at) from messages r where r.ticket_id = ${into!.id} and r.kind = 'reply'), '-infinity')) where id = ${into!.id} and status = 'open'`;
    await refreshSearch(tx, from.id);
    await refreshSearch(tx, into!.id);
  });
}

// ---- Several tickets at once -------------------------------------------------

// bulk changes the tickets ticked in the inbox: give them to someone (or
// nobody), close them, mark them spam, reopen them, tag them. Says each
// one's state before, so Undo puts it back. 100 at once at most.
export type BulkAction = { kind: "assign"; assignee: string | null } | { kind: "status"; status: Status } | { kind: "tag"; name: string } | { kind: "priority"; priority: Priority };
export type Before = { id: string; number: number; status: Status; assignee: string | null; priority: Priority; closedAt: string | null; tagged: boolean };

export async function bulk(sql: Sql, actor: Member | null, numbers: unknown, action: BulkAction, answers: (memberId: string) => Promise<boolean>): Promise<{ before: Before[]; tag: Tag | null }> {
  if (!actor || !can(actor, "tickets.manage")) throw new AppError("forbidden");
  if (!Array.isArray(numbers) || numbers.length === 0 || numbers.length > 100) throw new AppError("invalid");
  const list = [...new Set(numbers.map(n => ticketNumber(n)))];
  if (action.kind === "assign" && action.assignee !== null && (!/^mbr_[a-z2-7]{26}$/u.test(action.assignee) || !(await answers(action.assignee)))) throw new AppError("invalid");
  if (action.kind === "status" && !isStatus(action.status)) throw new AppError("invalid");
  if (action.kind === "priority" && !isPriority(action.priority)) throw new AppError("invalid");
  const name = action.kind === "tag" ? tagName(action.name) : null;
  return sql.begin(async tx => {
    const rows = await tx<{ id: string; number: number; status: Status; assignee: string | null; priority: Priority; closed_at: Date | null; subject: string }[]>`
      select id, number, status, assignee, priority, closed_at, subject from tickets where number in ${tx(list)} and merged_into is null for update`;
    const tag = name ? await tagFor(tx, name) : null;
    const before: Before[] = [];
    for (const r of rows) {
      let tagged = false;
      if (tag) {
        tagged = (await tx`select 1 from ticket_tags where ticket_id = ${r.id} and tag_id = ${tag.id}`).length > 0;
        const [count] = await tx<{ n: number }[]>`select count(*)::int as n from ticket_tags where ticket_id = ${r.id}`;
        if (!tagged && (count?.n ?? 0) < limits.tagsPerTicket) await tx`insert into ticket_tags (ticket_id, tag_id) values (${r.id}, ${tag.id}) on conflict do nothing`;
      }
      before.push({ id: String(r.id), number: r.number, status: r.status, assignee: r.assignee, priority: r.priority, closedAt: r.closed_at?.toISOString() ?? null, tagged });
    }
    const ids = rows.map(r => String(r.id));
    if (ids.length === 0) throw new AppError("not_found");
    if (action.kind === "assign") await tx`update tickets set assignee = ${action.assignee}, updated_at = now() where id in ${tx(ids)}`;
    if (action.kind === "priority") await tx`update tickets set priority = ${action.priority} where id in ${tx(ids)}`;
    if (action.kind === "status") await tx`update tickets set status = ${action.status}, closed_at = ${action.status === "closed" ? tx`now()` : null}, updated_at = now() where id in ${tx(ids)} and status <> ${action.status}`;
    return { before, tag };
  });
}

// unbulk puts the tickets back as they were (bulk's before), and takes off
// the tag it added.
export async function unbulk(sql: Sql, actor: Member | null, before: unknown, tagId?: unknown): Promise<void> {
  if (!actor || !can(actor, "tickets.manage")) throw new AppError("forbidden");
  if (!Array.isArray(before) || before.length > 100) throw new AppError("invalid");
  const tag = tagId === undefined || tagId === null ? null : id(tagId);
  await sql.begin(async tx => {
    for (const b of before as Before[]) {
      const number = ticketNumber(b?.number);
      if (!isStatus(b.status) || !isPriority(b.priority) || (b.assignee !== null && !/^mbr_[a-z2-7]{26}$/u.test(String(b.assignee)))) throw new AppError("invalid");
      const closedAt = typeof b.closedAt === "string" && !Number.isNaN(Date.parse(b.closedAt)) ? new Date(b.closedAt) : null;
      await tx`update tickets set status = ${b.status}, assignee = ${b.assignee}, priority = ${b.priority}, closed_at = ${closedAt}, updated_at = now() where number = ${number} and merged_into is null`;
      if (tag && !b.tagged) await tx`delete from ticket_tags where tag_id = ${tag} and ticket_id = (select id from tickets where number = ${number})`;
    }
  });
}

// ---- The customer's side (the follow-up link) ------------------------------

// linked finds the ticket a follow-up link opens: its own, or the one it
// was merged into (the same customer's: merging never crosses customers).
async function linked(sql: Query, secret: unknown): Promise<TicketDb | null> {
  if (typeof secret !== "string" || !secretPattern.test(secret)) return null;
  const [row] = await sql<(TicketDb & { merged_into: string | null })[]>`select ${columns(sql)}, t.merged_into from tickets t
    where (t.secret_hash = ${hashSecret(secret)} or t.id = (select ticket_id from ticket_links where secret_hash = ${hashSecret(secret)})) and status <> 'spam'`;
  if (!row) return null;
  const into = await followMerges(sql, row.merged_into ? { id: String(row.id), number: row.number } : undefined);
  if (!into || into.id === String(row.id)) return row;
  const [target] = await sql<TicketDb[]>`select ${columns(sql)} from tickets t where id = ${into.id} and status <> 'spam'`;
  return target ?? null;
}

export async function byLink(sql: Query, secret: unknown): Promise<(Ticket & { messages: Message[] }) | null> {
  const row = await linked(sql, secret);
  if (!row) return null;
  const t = toTicket(row);
  return { ...t, messages: await messagesOf(sql, t.id, false) };
}

// customerReply adds the customer's message (and files) from the
// follow-up page; the ticket goes back to the team.
export async function customerReply(sql: Sql, secret: unknown, body: unknown, files: Files = noFiles): Promise<Ticket> {
  const t = await byLink(sql, secret);
  if (!t) throw new AppError("not_found");
  const text = clean(body, limits.publicBody, { multiline: true });
  await withFiles(files.take, stored => sql.begin(async tx => {
    await insertMessage(tx, t.id, { kind: "customer", author: null, body: text, files: stored });
    await tx`update tickets set status = 'open', closed_at = null, updated_at = now() where id = ${t.id}`;
    await refreshSearch(tx, t.id);
  }), files.drop);
  return { ...t, status: "open" };
}

// rate records the customer's opinion of a closed request (one click; they
// may change their mind). Says the ticket, for the team to hear of it.
export async function rate(sql: Sql, secret: unknown, value: unknown): Promise<Ticket> {
  const t = await byLink(sql, secret);
  if (!t) throw new AppError("not_found");
  if (value !== "good" && value !== "bad") throw new AppError("invalid");
  if (t.status !== "closed") throw new AppError("not_closed");
  await sql`update tickets set rating = ${value}, rated_at = now() where id = ${t.id}`;
  return { ...t, rating: value };
}

// linkFile finds a file a follow-up link may open: on that ticket, in a
// message the customer sees (never a note's). Null otherwise.
export async function linkFile(sql: Query, secret: unknown, fileId: unknown): Promise<{ object: string; fileName: string; type: string } | null> {
  const ticket = await linked(sql, secret);
  if (!ticket) return null;
  let key: string;
  try {
    key = id(fileId);
  } catch {
    return null;
  }
  const [row] = await sql<{ object: string; file_name: string; type: string }[]>`
    select a.object, a.file_name, a.type from attachments a
    join messages m on m.id = a.message_id join tickets t on t.id = m.ticket_id
    where a.id = ${key} and t.id = ${ticket.id} and m.kind in ('customer', 'reply') and not m.auto`;
  return row ? { object: row.object, fileName: row.file_name, type: row.type } : null;
}

// ---- A colleague's own requests ("My requests") -----------------------------

// Any member who reaches the tool — with a role or none, as most colleagues
// who send an IT request through a team form of Forms — reads and answers
// the tickets they asked (requester = their member id), and nothing else:
// never another person's ticket, never a note, never who else is on it.
// A ticket that is not theirs is "not_found", exactly like one that does
// not exist. Merged into another of theirs (merging never crosses
// requesters), it opens that one.
export type MyRequest = { number: number; subject: string; status: Status; updatedAt: string; answered: boolean };

export async function myRequests(sql: Query, actor: Member | null): Promise<MyRequest[]> {
  if (!actor) throw new AppError("forbidden");
  const rows = await sql<{ number: number; subject: string; status: Status; updated_at: Date; last_kind: string | null }[]>`
    select t.number, t.subject, t.status, t.updated_at,
      (select m.kind from messages m where m.ticket_id = t.id and m.kind in ('customer', 'reply') and not m.auto order by m.created_at desc, m.id desc limit 1) as last_kind
    from tickets t
    where t.requester = ${actor.id} and t.merged_into is null and t.status <> 'spam'
    order by t.status = 'closed', t.updated_at desc, t.id desc limit 100`;
  return rows.map(r => ({ number: r.number, subject: r.subject, status: r.status, updatedAt: r.updated_at.toISOString(), answered: r.last_kind === "reply" }));
}

// How many requests of the actor's are not closed (their tab's number).
export async function myOpenCount(sql: Query, actor: Member | null): Promise<number> {
  if (!actor) return 0;
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from tickets where requester = ${actor.id} and merged_into is null and status in ('open', 'waiting')`;
  return row?.n ?? 0;
}

export async function myRequest(sql: Query, actor: Member | null, number: unknown): Promise<Ticket & { messages: Message[] }> {
  if (!actor) throw new AppError("forbidden");
  let t = await byNumber(sql, number);
  if (t.requester !== actor.id || t.status === "spam") throw new AppError("not_found");
  if (t.mergedInto !== null) {
    const into = await followMerges(sql, { id: t.id, number: t.number });
    if (!into || into.id === t.id) throw new AppError("not_found");
    t = await byNumber(sql, into.number);
    if (t.requester !== actor.id || t.status === "spam") throw new AppError("not_found");
  }
  return { ...t, messages: await messagesOf(sql, t.id, false) };
}

// writeMine adds the colleague's message (and files) to their own request;
// it goes back to the team (reopened when it was closed).
export async function writeMine(sql: Sql, actor: Member | null, number: unknown, body: unknown, files: Files = noFiles): Promise<Ticket> {
  const t = await myRequest(sql, actor, number);
  const text = clean(body, limits.body, { multiline: true });
  await withFiles(files.take, stored => sql.begin(async tx => {
    await insertMessage(tx, t.id, { kind: "customer", author: null, body: text, files: stored });
    await tx`update tickets set status = 'open', closed_at = null, updated_at = now() where id = ${t.id}`;
    await refreshSearch(tx, t.id);
  }), files.drop);
  return { ...t, status: "open" };
}

// rateMine: "Did we solve your problem?" on the colleague's own closed request.
export async function rateMine(sql: Sql, actor: Member | null, number: unknown, value: unknown): Promise<Ticket> {
  const t = await myRequest(sql, actor, number);
  if (value !== "good" && value !== "bad") throw new AppError("invalid");
  if (t.status !== "closed") throw new AppError("not_closed");
  await sql`update tickets set rating = ${value}, rated_at = now() where id = ${t.id}`;
  return { ...t, rating: value };
}

// myFile finds a file of the colleague's own request they may open: in a
// message they see (theirs or an answer), never a note's. Null otherwise.
export async function myFile(sql: Query, actor: Member | null, number: unknown, fileId: unknown): Promise<{ object: string; fileName: string; type: string } | null> {
  let t: Ticket;
  let key: string;
  try {
    t = await myRequest(sql, actor, number);
    key = id(fileId);
  } catch (error) {
    if (error instanceof AppError) return null;
    throw error;
  }
  const [row] = await sql<{ object: string; file_name: string; type: string }[]>`
    select a.object, a.file_name, a.type from attachments a join messages m on m.id = a.message_id
    where a.id = ${key} and m.ticket_id = ${t.id} and m.kind in ('customer', 'reply') and not m.auto`;
  return row ? { object: row.object, fileName: row.file_name, type: row.type } : null;
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
    const objects = await objectsOf(tx, tx`lower(t.customer_email) = lower(${value})`);
    const gone = await tx`delete from tickets where lower(customer_email) = lower(${value})`;
    if (gone.count > 0) await tx`insert into erasures (by_member, tickets) values (${actor!.id}, ${gone.count})`;
    return { tickets: gone.count, objects };
  });
}

// The files of some tickets, to delete from the Chest with them: their
// attachments and the original emails.
async function objectsOf(sql: Query, where: ReturnType<Query>): Promise<string[]> {
  const rows = await sql<{ object: string }[]>`
    select a.object from attachments a join messages m on m.id = a.message_id join tickets t on t.id = m.ticket_id where ${where}
    union all select m.original from messages m join tickets t on t.id = m.ticket_id where m.original is not null and ${where}`;
  return rows.map(r => r.object);
}

// erasures: who erased a customer's data, when, how many tickets — never
// whose (the address is gone with them).
export async function erasures(sql: Query, actor: Member | null): Promise<{ by: string; tickets: number; at: string }[]> {
  if (!can(actor, "customers.erase")) throw new AppError("forbidden");
  return (await sql<{ by_member: string; tickets: number; at: Date }[]>`select by_member, tickets, at from erasures order by at desc limit 20`).map(r => ({ by: r.by_member, tickets: r.tickets, at: r.at.toISOString() }));
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
    const objects = await objectsOf(tx, tx`t.status in ('closed', 'spam') and t.updated_at < ${before}`);
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

// exportAll reads everything the tool holds about its tickets, for the
// export (lib/export.ts): every ticket (spam too), every message — the
// customer's, the replies, the notes, the events — with its files' names.
export type ExportTicket = Ticket & { tags: string[]; closedAt: string | null; ratedAt: string | null; messages: Message[] };
export async function exportAll(sql: Sql, actor: Member | null): Promise<ExportTicket[]> {
  if (!can(actor, "export")) throw new AppError("forbidden");
  const rows = await sql<(TicketDb & { tags: Tag[]; closed_at: Date | null; rated_at: Date | null })[]>`select ${columns(sql)}, ${tagsOf(sql)} as tags, t.closed_at, t.rated_at from tickets t order by number`;
  const out: ExportTicket[] = [];
  for (const r of rows) out.push({ ...toTicket(r), tags: (r.tags ?? []).map(g => shownTag(g.name, readerWords(actor))), closedAt: r.closed_at?.toISOString() ?? null, ratedAt: r.rated_at?.toISOString() ?? null, messages: await messagesOf(sql, String(r.id), true) });
  return out;
}
