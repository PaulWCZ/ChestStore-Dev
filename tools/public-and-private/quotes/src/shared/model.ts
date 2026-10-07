import { AppError } from "./app-error.ts";

// Safe in the browser: no SDK here.
// The rules of what a person writes, and the bounds of everything. No
// framework, no database: tested alone.

export const limits = {
  name: 160,
  contact: 120,
  email: 254,
  phone: 40,
  address: 300,
  city: 80,
  postcode: 12,
  unit: 20,
  title: 200,
  description: 2000,
  notes: 4000,
  message: 4000,
  terms: 500,
  prefix: 8,
  // Lines of one document (sections included).
  lines: 300,
  clients: 20_000,
  items: 2_000,
  // A unit price: 99,999,999.99 at most (either sign).
  unitPrice: 9_999_999_999,
  // A quantity: 1,000,000 at most, three decimals.
  quantity: 1_000_000_000,
  // A document's total: 1,000,000,000.00 at most.
  total: 100_000_000_000,
  // Payment terms: 0 to 120 days.
  paymentDays: 120,
  // Validity of a quote: 1 to 365 days.
  validityDays: 365,
  // The logo: a PNG or JPEG of 1 MiB at most.
  logoSize: 1 << 20,
  // The terms and conditions of sale (a PDF): 5 MiB, under the size of a
  // file the Chest sends at once.
  termsSize: 5 << 20,
  // One export: this many documents (CSV) and PDFs (ZIP).
  exportRows: 20_000,
  exportFiles: 3_000,
} as const;

// clean trims a text and bounds it; line breaks are kept only where the
// text may have several lines; other control characters are dropped.
export function clean(value: unknown, max: number, options: { multiline?: boolean; optional?: boolean } = {}): string {
  if (value === undefined || value === null) {
    if (options.optional) return "";
    throw new AppError("empty");
  }
  if (typeof value !== "string") throw new AppError("invalid");
  let text = value.replace(/\r\n?/gu, "\n");
  text = options.multiline ? text.replace(/[^\P{Cc}\n\t]/gu, "").replace(/\n{3,}/gu, "\n\n") : text.replace(/\s+/gu, " ").replace(/\p{Cc}/gu, "");
  text = text.replace(/[‪-‮⁦-⁩]/gu, "").trim();
  if (text === "" && !options.optional) throw new AppError("empty");
  if ([...text].length > max) throw new AppError("too_long", { max });
  return text;
}

const idPattern = /^[1-9][0-9]{0,17}$/u;
// id reads an identifier of a row; anything else names nothing.
export function id(value: unknown): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value !== "string" || !idPattern.test(value)) throw new AppError("not_found");
  return value;
}

export const memberPattern = /^mbr_[a-z2-7]{26}$/u;

// A day (YYYY-MM-DD) that exists, between 2000 and 2100.
export function day(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new AppError("date_invalid");
  const date = new Date(value + "T00:00:00Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new AppError("date_invalid");
  const year = date.getUTCFullYear();
  if (year < 2000 || year > 2100) throw new AppError("date_invalid");
  return value;
}

export function addDays(value: string, days: number): string {
  return new Date(Date.parse(value + "T00:00:00Z") + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86_400_000);
}

// A whole number of days within bounds (payment terms, validity).
export function wholeDays(value: unknown, min: number, max: number, code: "terms_invalid" | "invalid" = "invalid"): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value.trim()) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) throw new AppError(code, { min, max });
  return n;
}

// A name for a file inside a ZIP or a download: ASCII letters, digits and
// dashes only ("Côte d'Azur" → "Cote-d-Azur").
export function slug(text: string, max = 40): string {
  return text.normalize("NFKD").replace(/[̀-ͯ]/gu, "").replace(/[^A-Za-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, max) || "x";
}

// --- French and European identifiers -------------------------------------

const digitsOnly = (value: string) => value.replace(/[\s.  -]/gu, "");

// Luhn's check, which SIREN and SIRET numbers pass.
export function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

// A SIREN: 9 digits passing Luhn ("732 829 320" → "732829320"); "" when
// optional and empty.
export function siren(value: unknown, optional = true): string {
  const text = typeof value === "string" ? digitsOnly(value) : "";
  if (text === "" && optional && (value === "" || value === undefined || value === null)) return "";
  if (!/^\d{9}$/u.test(text) || !luhn(text)) throw new AppError("siren_invalid");
  return text;
}

// A SIRET: 14 digits passing Luhn (La Poste's establishments, which follow
// another rule, are accepted by their SIREN 356000000).
export function siret(value: unknown, optional = true): string {
  const text = typeof value === "string" ? digitsOnly(value) : "";
  if (text === "" && optional && (value === "" || value === undefined || value === null)) return "";
  if (!/^\d{14}$/u.test(text)) throw new AppError("siret_invalid");
  if (!luhn(text) && !text.startsWith("356000000")) throw new AppError("siret_invalid");
  return text;
}

// The key of a French VAT number from its SIREN: (12 + 3 × (SIREN mod 97))
// mod 97, two digits.
export function frenchVatKey(sirenDigits: string): string {
  return String((12 + 3 * (Number(sirenDigits) % 97)) % 97).padStart(2, "0");
}

export function frenchVatNumber(sirenDigits: string): string {
  return "FR" + frenchVatKey(sirenDigits) + sirenDigits;
}

// An intra-EU VAT number: two letters and 2 to 12 letters or digits; a
// French one ("FR" + key + SIREN) has its key checked.
export function vatNumber(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new AppError("vat_number_invalid");
  const text = value.replace(/[\s.  -]/gu, "").toUpperCase();
  if (text === "") return "";
  if (!/^[A-Z]{2}[0-9A-Z]{2,12}$/u.test(text)) throw new AppError("vat_number_invalid");
  if (text.startsWith("FR")) {
    const m = /^FR([0-9A-Z]{2})(\d{9})$/u.exec(text);
    if (!m) throw new AppError("vat_number_invalid");
    if (/^\d{2}$/u.test(m[1]!) && m[1] !== frenchVatKey(m[2]!)) throw new AppError("vat_number_invalid");
  }
  return text;
}

// An IBAN, checked by its mod-97 key; kept in groups of four.
export function iban(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new AppError("iban_invalid");
  const text = value.replace(/[\s -]/gu, "").toUpperCase();
  if (text === "") return "";
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/u.test(text)) throw new AppError("iban_invalid");
  const moved = text.slice(4) + text.slice(0, 4);
  let rest = 0;
  for (const ch of moved) {
    const n = /\d/u.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of n) rest = (rest * 10 + Number(d)) % 97;
  }
  if (rest !== 1) throw new AppError("iban_invalid");
  return text.replace(/(.{4})/gu, "$1 ").trim();
}

export function bic(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new AppError("bic_invalid");
  const text = value.replace(/\s/gu, "").toUpperCase();
  if (text === "") return "";
  if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/u.test(text)) throw new AppError("bic_invalid");
  return text;
}


// A country as ISO 3166-1 alpha-2 ("FR").
export function country(value: unknown): string {
  if (value === undefined || value === null || value === "") return "FR";
  if (typeof value !== "string" || !/^[A-Za-z]{2}$/u.test(value.trim())) throw new AppError("country_invalid");
  return value.trim().toUpperCase();
}

// The countries of the European Union (for reverse charge within the EU).
export const euCountries = ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"] as const;

// A numbering prefix: 1 to 8 capital letters or digits ("F", "FAC", "D").
export function prefix(value: unknown): string {
  if (typeof value !== "string") throw new AppError("prefix_invalid");
  const text = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,8}$/u.test(text)) throw new AppError("prefix_invalid");
  return text;
}

// How documents are numbered: with the year, from 0001 each year
// ("F-2026-0042"), or without it, never restarting ("F-0042") — the way
// many companies number, and the one to continue from a tool that did so.
export const numberFormats = ["yearly", "continuous"] as const;
export type NumberFormat = (typeof numberFormats)[number];

// The period a sequence counts in: the year of the day, or 0 when the
// numbers never restart.
export function periodOf(numberFormat: NumberFormat, today: string): number {
  return numberFormat === "continuous" ? 0 : Number(today.slice(0, 4));
}

// A document's number: prefix, year (none in the period 0), and the
// sequence on four digits (more beyond 9,999): "F-2026-0042", "F-0042".
export function documentNumber(prefixText: string, period: number, seq: number): string {
  return period === 0 ? `${prefixText}-${String(seq).padStart(4, "0")}` : `${prefixText}-${period}-${String(seq).padStart(4, "0")}`;
}

// A quote's number as people read it: its version after the number once
// it was changed after being sent ("D-2026-0007 v2"); the first version is
// the number alone. The number itself never changes (the sequence, the
// search and the other tools keep it).
export function versioned(number: string | null, version: number): string | null {
  return number !== null && version > 1 ? `${number} v${version}` : number;
}

// A number this tool could have given (a sent quote's, in a message).
export const numberPattern = /^[A-Z0-9]{1,8}(-\d{4})?-\d{4,}$/u;

// The next number a person asks a sequence to continue from: a whole
// number from 1 to 99,999,999.
export function nextSeq(value: unknown): number {
  const n = typeof value === "string" && /^\s*\d{1,8}\s*$/u.test(value) ? Number(value.trim()) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 99_999_999) throw new AppError("next_number_invalid");
  return n;
}

// --- Documents ------------------------------------------------------------

export const documentTypes = ["quote", "invoice", "credit"] as const;
export type DocumentType = (typeof documentTypes)[number];

// Quotes: draft → sent → accepted | refused ("expired" is a sent quote
// past its validity date, computed). Invoices and credit notes: draft →
// final (numbered and frozen).
export const quoteStatuses = ["draft", "sent", "accepted", "refused"] as const;
export const issuedStatuses = ["draft", "final"] as const;
// An invoice imported from the previous tool (its own number, collected
// here, never finalised here).
export const importedStatus = "imported" as const;
export type Status = (typeof quoteStatuses)[number] | (typeof issuedStatuses)[number] | typeof importedStatus;

export const paymentMethods = ["transfer", "card", "cheque", "cash", "direct_debit", "other"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export const clientKinds = ["company", "person"] as const;
export type ClientKind = (typeof clientKinds)[number];

// The VAT treatment of a document: standard (VAT per line), or reverse
// charge (the buyer accounts for the VAT: "Autoliquidation"). A company
// under the VAT exemption for small businesses (franchise en base) prints
// no VAT at all, whatever the document says.
export const vatTreatments = ["standard", "reverse_charge"] as const;
export type VatTreatment = (typeof vatTreatments)[number];

export function oneOf<T extends string>(list: readonly T[], value: unknown): T {
  if (typeof value !== "string" || !(list as readonly string[]).includes(value)) throw new AppError("invalid");
  return value as T;
}

// A client's code in the company's books (its auxiliary account): 1 to 20
// letters or digits, as the accountant wrote it ("DUPAIN", "C00042").
export function accountCode(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new AppError("account_invalid");
  const text = value.trim().toUpperCase().replace(/[\s.-]/gu, "");
  if (text === "") return "";
  if (!/^[0-9A-Z]{1,20}$/u.test(text)) throw new AppError("account_invalid");
  return text;
}
