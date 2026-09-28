import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { bic, clean, country, email, iban, limits, prefix, siren, siret, vatNumber, wholeDays } from "./model.ts";
import { parseAmount, parsePercent } from "./money.ts";
import type { Seller } from "./parties.ts";

// The seller: the company's legal details, which every document prints
// (French mandatory mentions), and the defaults of new documents. Only the
// admin changes them; a document keeps the details it was numbered with.

export type Company = Seller & {
  validityDays: number;
  quotePrefix: string;
  invoicePrefix: string;
  creditPrefix: string;
  mailWorks: boolean | null;
  updatedBy: string | null;
  updatedAt: string | null;
};

type Row = {
  legal_name: string; trade_name: string; legal_form: string; capital: number | null; address: string; postcode: string; city: string; country: string;
  siren: string; siret: string; rcs_city: string; vat_number: string; vat_regime: string; vat_on_debits: boolean; email: string; phone: string; website: string;
  bank: string; iban: string; bic: string; logo_object: string | null; logo_type: string | null; payment_days: number; validity_days: number; penalty_rate: number | null;
  early_discount: string; quote_prefix: string; invoice_prefix: string; credit_prefix: string; footer: string; mail_works: boolean | null; updated_by: string | null; updated_at: Date | null;
};

const toCompany = (r: Row): Company => ({
  legalName: r.legal_name, tradeName: r.trade_name, legalForm: r.legal_form, capital: r.capital, address: r.address, postcode: r.postcode, city: r.city, country: r.country,
  siren: r.siren, siret: r.siret, rcsCity: r.rcs_city, vatNumber: r.vat_number, franchise: r.vat_regime === "franchise", vatOnDebits: r.vat_on_debits,
  email: r.email, phone: r.phone, website: r.website, bank: r.bank, iban: r.iban, bic: r.bic, logo: r.logo_object, logoType: r.logo_type,
  paymentDays: r.payment_days, penaltyRate: r.penalty_rate, earlyDiscount: r.early_discount, footer: r.footer,
  validityDays: r.validity_days, quotePrefix: r.quote_prefix, invoicePrefix: r.invoice_prefix, creditPrefix: r.credit_prefix,
  mailWorks: r.mail_works, updatedBy: r.updated_by, updatedAt: r.updated_at ? r.updated_at.toISOString() : null,
});

export async function company(sql: Query): Promise<Company> {
  const [row] = await sql<Row[]>`select * from company where id = 1`;
  if (!row) throw new AppError("not_found");
  return toCompany(row);
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
  | "earlyDiscount" | "footer" | "quotePrefix" | "invoicePrefix" | "creditPrefix", unknown>>;

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
