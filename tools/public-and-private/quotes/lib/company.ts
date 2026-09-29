import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { bic, clean, country, email, iban, limits, prefix, siren, siret, vatNumber, wholeDays, type NumberFormat } from "./model.ts";
import { parseAmount, parsePercent } from "./money.ts";
import type { Seller } from "./parties.ts";

// The seller: the company's legal details, which every document prints
// (French mandatory mentions), and the defaults of new documents. Only the
// admin changes them; a document keeps the details it was numbered with.

// The accounts of the accountant's entries (lib/journal.ts): the journal,
// the clients' account, sales of services and of goods, deposits received,
// and the VAT collected at each rate (hundredths of a percent → account).
export type Accounts = { journal: string; client: string; services: string; goods: string; deposits: string; vat: Record<string, string> };
export const defaultAccounts: Accounts = { journal: "VE", client: "411000", services: "706000", goods: "707000", deposits: "419100", vat: { "2000": "445710", "1000": "445710", "550": "445710", "210": "445710" } };

export type Company = Seller & {
  validityDays: number;
  quotePrefix: string;
  invoicePrefix: string;
  creditPrefix: string;
  numberFormat: NumberFormat;
  reminders: { on: boolean; days: number[]; email: boolean };
  accounts: Accounts;
  mailWorks: boolean | null;
  updatedBy: string | null;
  updatedAt: string | null;
  // The terms and conditions of sale (CGV), a PDF in the Chest's files
  // (lib/terms.ts), or null.
  terms: Terms | null;
};

export type Terms = { object: string; name: string; sha256: string; size: number };

type Row = {
  legal_name: string; trade_name: string; legal_form: string; capital: number | null; address: string; postcode: string; city: string; country: string;
  siren: string; siret: string; rcs_city: string; vat_number: string; vat_regime: string; vat_on_debits: boolean; email: string; phone: string; website: string;
  bank: string; iban: string; bic: string; logo_object: string | null; logo_type: string | null; payment_days: number; validity_days: number; penalty_rate: number | null;
  early_discount: string; quote_prefix: string; invoice_prefix: string; credit_prefix: string; footer: string; mail_works: boolean | null; updated_by: string | null; updated_at: Date | null;
  number_format: NumberFormat; payment_link: string; reminders_on: boolean; reminder_days: number[]; reminders_email: boolean; accounts: Partial<Accounts> | null;
  terms_object?: string | null; terms_name?: string | null; terms_sha256?: string | null; terms_size?: number | null;
};

const accountsOf = (value: Partial<Accounts> | null): Accounts => ({ ...defaultAccounts, ...(value ?? {}), vat: { ...defaultAccounts.vat, ...(value?.vat ?? {}) } });

const toCompany = (r: Row): Company => ({
  legalName: r.legal_name, tradeName: r.trade_name, legalForm: r.legal_form, capital: r.capital, address: r.address, postcode: r.postcode, city: r.city, country: r.country,
  siren: r.siren, siret: r.siret, rcsCity: r.rcs_city, vatNumber: r.vat_number, franchise: r.vat_regime === "franchise", vatOnDebits: r.vat_on_debits,
  email: r.email, phone: r.phone, website: r.website, bank: r.bank, iban: r.iban, bic: r.bic, logo: r.logo_object, logoType: r.logo_type,
  paymentDays: r.payment_days, penaltyRate: r.penalty_rate, earlyDiscount: r.early_discount, footer: r.footer, paymentLink: r.payment_link ?? "",
  validityDays: r.validity_days, quotePrefix: r.quote_prefix, invoicePrefix: r.invoice_prefix, creditPrefix: r.credit_prefix,
  numberFormat: r.number_format ?? "yearly",
  reminders: { on: r.reminders_on ?? false, days: [...(r.reminder_days ?? [7, 15, 30])].sort((a, b) => a - b), email: r.reminders_email ?? true },
  accounts: accountsOf(r.accounts ?? null),
  mailWorks: r.mail_works, updatedBy: r.updated_by, updatedAt: r.updated_at ? r.updated_at.toISOString() : null,
  terms: r.terms_object && r.terms_sha256 ? { object: r.terms_object, name: r.terms_name ?? "", sha256: r.terms_sha256, size: r.terms_size ?? 0 } : null,
});

export async function company(sql: Query): Promise<Company> {
  let [row] = await sql<Row[]>`select * from company where id = 1`;
  // The migration writes the one row; should it ever be missing, an empty
  // company comes back (every page asks for it), as on the first day.
  if (!row) [row] = await sql<Row[]>`insert into company (id) values (1) on conflict (id) do update set id = 1 returning *`;
  return toCompany(row!);
}

// What must be filled in before a document can carry the company's name:
// the mandatory identification of the seller (Code de commerce R123-237,
// CGI art. 242 nonies A). Field names, for the settings page to point at.
export function missing(c: Company): string[] {
  const out: string[] = [];
  if (!c.legalName) out.push("legalName");
  if (!c.legalForm) out.push("legalForm");
  if (!c.address) out.push("address");
  if (!c.postcode) out.push("postcode");
  if (!c.city) out.push("city");
  if (!c.siren) out.push("siren");
  if (!c.franchise && !c.vatNumber) out.push("vatNumber");
  return out;
}

export type CompanyInput = Partial<Record<
  | "legalName" | "tradeName" | "legalForm" | "capital" | "address" | "postcode" | "city" | "country" | "siren" | "siret" | "rcsCity" | "vatNumber"
  | "franchise" | "vatOnDebits" | "email" | "phone" | "website" | "bank" | "iban" | "bic" | "paymentDays" | "validityDays" | "penaltyRate"
  | "earlyDiscount" | "footer" | "quotePrefix" | "invoicePrefix" | "creditPrefix" | "paymentLink" | "remindersOn" | "reminderDays" | "remindersEmail" | "accounts", unknown>>;

// A web address clients open to pay: https only, 300 characters at most.
export function paymentLink(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new AppError("link_invalid");
  const text = value.trim();
  if (text === "") return "";
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new AppError("link_invalid");
  }
  if (url.protocol !== "https:" || text.length > 300 || /\s/u.test(text)) throw new AppError("link_invalid");
  return url.href;
}

// The days after the due date a late invoice is reminded: 1 to 5 steps,
// each 1 to 365 days, "7, 15, 30" as typed.
export function reminderDays(value: unknown): number[] {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,;]+/u).filter(Boolean) : null;
  if (!list || list.length === 0 || list.length > 5) throw new AppError("reminder_days_invalid");
  const days = list.map(v => (typeof v === "string" && /^\d{1,3}$/u.test(v) ? Number(v) : v));
  if (days.some(d => typeof d !== "number" || !Number.isInteger(d) || d < 1 || d > 365)) throw new AppError("reminder_days_invalid");
  return [...new Set(days as number[])].sort((a, b) => a - b);
}

// An account number of the books: 1 to 20 digits or capital letters.
function account(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9A-Z]{1,20}$/u.test(value.trim().toUpperCase())) throw new AppError("account_invalid");
  return value.trim().toUpperCase();
}

export function accounts(value: unknown, current: Accounts): Accounts {
  if (!value || typeof value !== "object") throw new AppError("invalid");
  const v = value as Record<string, unknown>;
  const pick = (key: "journal" | "client" | "services" | "goods" | "deposits") => (v[key] === undefined ? current[key] : account(v[key]));
  const vat = { ...current.vat };
  if (v["vat"] !== undefined) {
    if (!v["vat"] || typeof v["vat"] !== "object") throw new AppError("invalid");
    for (const [rate, number] of Object.entries(v["vat"] as Record<string, unknown>)) {
      if (!(rate in defaultAccounts.vat)) throw new AppError("invalid");
      vat[rate] = account(number);
    }
  }
  return { journal: pick("journal"), client: pick("client"), services: pick("services"), goods: pick("goods"), deposits: pick("deposits"), vat };
}

const bool = (value: unknown): boolean => {
  if (typeof value !== "boolean") throw new AppError("invalid");
  return value;
};

// updateCompany changes the fields given, checked; the rest stays.
export async function updateCompany(sql: Sql, actor: Member | null, input: CompanyInput): Promise<Company> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  const current = await company(sql);
  const text = (key: keyof CompanyInput, max: number, multiline = false) => (input[key] === undefined ? undefined : clean(input[key], max, { optional: true, multiline }));
  const sirenValue = input.siren === undefined ? current.siren : siren(input.siren);
  const siretValue = input.siret === undefined ? current.siret : siret(input.siret);
  if (siretValue && sirenValue && !siretValue.startsWith(sirenValue)) throw new AppError("siret_invalid");
  let capital = current.capital;
  if (input.capital !== undefined) {
    if (input.capital === null || input.capital === "") capital = null;
    else {
      const parsed = parseAmount(input.capital);
      if (parsed === null || parsed < 0 || parsed > limits.total) throw new AppError("capital_invalid");
      capital = parsed;
    }
  }
  let penalty = current.penaltyRate;
  if (input.penaltyRate !== undefined) {
    if (input.penaltyRate === null || input.penaltyRate === "") penalty = null;
    else {
      const parsed = typeof input.penaltyRate === "number" ? input.penaltyRate : parsePercent(input.penaltyRate);
      if (parsed === null || !Number.isInteger(parsed) || parsed < 0 || parsed > 10_000) throw new AppError("penalty_invalid");
      penalty = parsed;
    }
  }
  const next = {
    legal_name: text("legalName", limits.name) ?? current.legalName,
    trade_name: text("tradeName", limits.name) ?? current.tradeName,
    legal_form: text("legalForm", 60) ?? current.legalForm,
    capital,
    address: text("address", limits.address, true) ?? current.address,
    postcode: text("postcode", limits.postcode) ?? current.postcode,
    city: text("city", limits.city) ?? current.city,
    country: input.country === undefined ? current.country : country(input.country),
    siren: sirenValue,
    siret: siretValue,
    rcs_city: text("rcsCity", limits.city) ?? current.rcsCity,
    vat_number: input.vatNumber === undefined ? current.vatNumber : vatNumber(input.vatNumber),
    vat_regime: input.franchise === undefined ? (current.franchise ? "franchise" : "standard") : bool(input.franchise) ? "franchise" : "standard",
    vat_on_debits: input.vatOnDebits === undefined ? current.vatOnDebits : bool(input.vatOnDebits),
    email: input.email === undefined ? current.email : email(input.email),
    phone: text("phone", limits.phone) ?? current.phone,
    website: text("website", 120) ?? current.website,
    bank: text("bank", limits.name) ?? current.bank,
    iban: input.iban === undefined ? current.iban : iban(input.iban),
    bic: input.bic === undefined ? current.bic : bic(input.bic),
    payment_days: input.paymentDays === undefined ? current.paymentDays : wholeDays(input.paymentDays, 0, limits.paymentDays, "terms_invalid"),
    validity_days: input.validityDays === undefined ? current.validityDays : wholeDays(input.validityDays, 1, limits.validityDays),
    penalty_rate: penalty,
    early_discount: text("earlyDiscount", limits.terms) ?? current.earlyDiscount,
    footer: text("footer", limits.terms, true) ?? current.footer,
    quote_prefix: input.quotePrefix === undefined ? current.quotePrefix : prefix(input.quotePrefix),
    invoice_prefix: input.invoicePrefix === undefined ? current.invoicePrefix : prefix(input.invoicePrefix),
    credit_prefix: input.creditPrefix === undefined ? current.creditPrefix : prefix(input.creditPrefix),
    payment_link: input.paymentLink === undefined ? current.paymentLink ?? "" : paymentLink(input.paymentLink),
    reminders_on: input.remindersOn === undefined ? current.reminders.on : bool(input.remindersOn),
    reminder_days: sql.array(input.reminderDays === undefined ? current.reminders.days : reminderDays(input.reminderDays), 23) as never,
    reminders_email: input.remindersEmail === undefined ? current.reminders.email : bool(input.remindersEmail),
    accounts: sql.json((input.accounts === undefined ? current.accounts : accounts(input.accounts, current.accounts)) as never),
  };
  // Three sequences, three prefixes: a number never reads as another kind.
  if (new Set([next.quote_prefix, next.invoice_prefix, next.credit_prefix]).size !== 3) throw new AppError("prefix_invalid");
  const [row] = await sql<Row[]>`
    update company set ${sql(next)}, updated_by = ${actor!.id}, updated_at = now() where id = 1 returning *`;
  return toCompany(row!);
}

// The Chest said whether it can send email: remembered, so the next
// sending offers the right first action.
export async function rememberMail(sql: Query, works: boolean): Promise<void> {
  await sql`update company set mail_works = ${works} where id = 1 and mail_works is distinct from ${works}`;
}

// The logo: set once its upload is checked (lib/logo.ts), or removed.
export async function setLogo(sql: Sql, actor: Member | null, object: string | null, type: string | null): Promise<string | null> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  const [old] = await sql<{ logo_object: string | null }[]>`
    update company c set logo_object = ${object}, logo_type = ${type}, updated_by = ${actor!.id}, updated_at = now()
    from (select logo_object from company where id = 1 for update) previous
    where c.id = 1 returning previous.logo_object`;
  return old?.logo_object ?? null;
}
