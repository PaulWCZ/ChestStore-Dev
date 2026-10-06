import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "../shared/app-error.ts";
import type { Query, Sql } from "./db.ts";
import { isLocale, type Locale } from "../i18n/index.ts";
import { accountCode, clean, clientKinds, country, email, id, limits, oneOf, siren, vatNumber, type ClientKind } from "../shared/model.ts";
import type { Buyer } from "../shared/parties.ts";

// The people and companies the company sells to. A client who has
// documents is never deleted (the documents are legal records that name
// them): they are archived, out of the lists, and come back in one click.
// The CRM tool (Clients) may later fill this list through events between
// tools: external_ref holds its reference (README, "Needs from the SDK").

export type Client = Buyer & {
  id: string;
  phone: string;
  language: Locale;
  reverseCharge: boolean;
  notes: string;
  // Its code in the company's books (the auxiliary account of 411), "" when
  // the accountant's entries make one (lib/journal.ts).
  account: string;
  externalRef: string | null;
  archived: boolean;
  documents: number;
};

type Row = {
  id: number; kind: ClientKind; name: string; contact: string; email: string; phone: string; address: string; postcode: string; city: string; country: string;
  delivery_address: string; siren: string; vat_number: string; language: string; reverse_charge: boolean; notes: string; account?: string; external_ref: string | null; archived_at: Date | null; documents?: number;
};

export const toClient = (r: Row): Client => ({
  id: String(r.id), kind: r.kind, name: r.name, contact: r.contact, email: r.email, phone: r.phone, address: r.address, postcode: r.postcode, city: r.city,
  country: r.country, deliveryAddress: r.delivery_address, siren: r.siren, vatNumber: r.vat_number, language: isLocale(r.language) ? r.language : "en",
  reverseCharge: r.reverse_charge, notes: r.notes, account: r.account ?? "", externalRef: r.external_ref, archived: r.archived_at !== null, documents: r.documents ?? 0,
});

export async function listClients(sql: Query, actor: Member | null, options: { q?: string; archived?: boolean } = {}): Promise<Client[]> {
  if (!can(actor, "read")) throw new AppError("forbidden");
  const q = typeof options.q === "string" ? options.q.trim().slice(0, 80) : "";
  const like = "%" + q.replace(/[\\%_]/gu, m => "\\" + m) + "%";
  const rows = await sql<Row[]>`
    select c.*, (select count(*) from documents d where d.client_id = c.id and d.deleted_at is null)::int as documents
    from clients c
    where ${options.archived ? sql`c.archived_at is not null` : sql`c.archived_at is null`}
      ${q ? sql`and (c.name ilike ${like} or c.contact ilike ${like} or c.email ilike ${like} or c.city ilike ${like} or c.siren like ${like.replace(/\s/gu, "")})` : sql``}
    order by lower(c.name), c.id
    limit 1000`;
  return rows.map(toClient);
}

// How many clients the list holds (archived ones aside): an empty list
// says so, a search that finds nothing says that instead.
export async function countClients(sql: Query): Promise<number> {
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from clients where archived_at is null`;
  return row?.n ?? 0;
}

export async function getClient(sql: Query, actor: Member | null, clientId: unknown): Promise<Client> {
  if (!can(actor, "read")) throw new AppError("forbidden");
  const [row] = await sql<Row[]>`
    select c.*, (select count(*) from documents d where d.client_id = c.id and d.deleted_at is null)::int as documents
    from clients c where c.id = ${id(clientId)}`;
  if (!row) throw new AppError("not_found");
  return toClient(row);
}

export type ClientInput = Partial<Record<"kind" | "name" | "contact" | "email" | "phone" | "address" | "postcode" | "city" | "country" | "deliveryAddress" | "siren" | "vatNumber" | "language" | "reverseCharge" | "notes" | "account", unknown>>;

function fields(input: ClientInput, current?: Client) {
  const text = (key: keyof ClientInput, max: number, fallback: string, multiline = false) => (input[key] === undefined ? fallback : clean(input[key], max, { optional: true, multiline }));
  const kind = input.kind === undefined ? current?.kind ?? "company" : oneOf(clientKinds, input.kind);
  const name = input.name === undefined ? current?.name ?? "" : clean(input.name, limits.name);
  if (!name) throw new AppError("empty");
  const language = input.language === undefined ? current?.language ?? "fr" : input.language;
  if (!isLocale(language)) throw new AppError("invalid");
  const reverseCharge = input.reverseCharge === undefined ? current?.reverseCharge ?? false : input.reverseCharge;
  if (typeof reverseCharge !== "boolean") throw new AppError("invalid");
  return {
    kind,
    name,
    contact: text("contact", limits.contact, current?.contact ?? ""),
    email: input.email === undefined ? current?.email ?? "" : email(input.email),
    phone: text("phone", limits.phone, current?.phone ?? ""),
    address: text("address", limits.address, current?.address ?? "", true),
    postcode: text("postcode", limits.postcode, current?.postcode ?? ""),
    city: text("city", limits.city, current?.city ?? ""),
    country: input.country === undefined ? current?.country ?? "FR" : country(input.country),
    delivery_address: text("deliveryAddress", limits.address, current?.deliveryAddress ?? "", true),
    siren: input.siren === undefined ? current?.siren ?? "" : siren(input.siren),
    vat_number: input.vatNumber === undefined ? current?.vatNumber ?? "" : vatNumber(input.vatNumber),
    language,
    reverse_charge: reverseCharge,
    notes: text("notes", limits.notes, current?.notes ?? "", true),
    account: input.account === undefined ? current?.account ?? "" : accountCode(input.account),
  };
}

export async function addClient(sql: Sql, actor: Member | null, input: ClientInput): Promise<Client> {
  if (!can(actor, "clients.write")) throw new AppError("forbidden");
  const f = fields(input);
  const [counted] = await sql<{ n: number }[]>`select count(*)::int as n from clients`;
  if ((counted?.n ?? 0) >= limits.clients) throw new AppError("too_many", { max: limits.clients });
  const [row] = await sql<Row[]>`insert into clients ${sql({ ...f, created_by: actor!.id })} returning *`;
  return toClient(row!);
}

export async function updateClient(sql: Sql, actor: Member | null, clientId: unknown, input: ClientInput): Promise<Client> {
  if (!can(actor, "clients.write")) throw new AppError("forbidden");
  const current = await getClient(sql, actor, clientId);
  const f = fields(input, current);
  const [row] = await sql<Row[]>`update clients set ${sql(f)}, updated_at = now() where id = ${current.id} returning *`;
  return toClient(row!);
}

// archiveClient takes a client out of the lists (undone by passing false).
// Their documents stay as they are.
export async function archiveClient(sql: Sql, actor: Member | null, clientId: unknown, archived: boolean): Promise<void> {
  if (!can(actor, "clients.write")) throw new AppError("forbidden");
  if (typeof archived !== "boolean") throw new AppError("invalid");
  const rows = await sql`update clients set archived_at = ${archived ? sql`coalesce(archived_at, now())` : null}, updated_at = now() where id = ${id(clientId)} returning id`;
  if (rows.length === 0) throw new AppError("not_found");
}

// What a document needs of its client before it is numbered: a name and an
// address to print (a buyer is identified by both; CGI art. 242 nonies A).
export function clientMissing(c: Pick<Buyer, "name" | "address" | "city">): string[] {
  const out: string[] = [];
  if (!c.name) out.push("name");
  if (!c.address) out.push("address");
  if (!c.city) out.push("city");
  return out;
}
