// Safe in the browser: no SDK here.
// Bank account numbers: IBAN (ISO 13616) and BIC (ISO 9362). An IBAN is
// checked by its country's length and its two check digits (mod 97); the
// transfer file only takes accounts of the SEPA zone.

// Lengths of the IBANs of the SEPA zone's countries (the EU, the EEA,
// Switzerland, the United Kingdom, Monaco, San Marino, Andorra, the Vatican,
// Gibraltar), as the SWIFT IBAN registry gives them.
const sepaLengths: Record<string, number> = {
  AD: 24, AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18, EE: 20, ES: 24, FI: 18, FR: 27, GB: 22, GI: 23, GR: 27,
  HR: 21, HU: 28, IE: 22, IS: 26, IT: 27, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MT: 31, NL: 18, NO: 15, PL: 28, PT: 25, RO: 24,
  SE: 24, SI: 19, SK: 24, SM: 27, VA: 22,
};

// What a person types, as the IBAN itself: no spaces, capitals.
export function compactIban(text: string): string {
  return text.replace(/[\s\-.]/gu, "").toUpperCase();
}

// The check of ISO 13616: the first four characters moved to the end,
// letters as numbers (A = 10 … Z = 35), the whole number modulo 97 is 1.
export function mod97(iban: string): boolean {
  const moved = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const char of moved) {
    const code = char.charCodeAt(0);
    const value = code >= 65 && code <= 90 ? String(code - 55) : char;
    for (const digit of value) rest = (rest * 10 + Number(digit)) % 97;
  }
  return rest === 1;
}

export type IbanCheck = { ok: true; iban: string; country: string; sepa: boolean } | { ok: false; reason: "format" | "length" | "checksum" };

// checkIban reads an IBAN as typed ("FR76 3000 6000 0112 3456 7890 189").
export function checkIban(text: unknown): IbanCheck {
  if (typeof text !== "string") return { ok: false, reason: "format" };
  const iban = compactIban(text);
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/u.test(iban)) return { ok: false, reason: "format" };
  const country = iban.slice(0, 2);
  const expected = sepaLengths[country];
  if (expected !== undefined && iban.length !== expected) return { ok: false, reason: "length" };
  if (!mod97(iban)) return { ok: false, reason: "checksum" };
  return { ok: true, iban, country, sepa: expected !== undefined };
}

// A BIC: bank (4 letters), country (2), place (2), branch (3, optional).
export function checkBic(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const bic = text.replace(/\s/gu, "").toUpperCase();
  return /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/u.test(bic) ? bic : null;
}

// In groups of four, as banks print it.
export function groupIban(iban: string): string {
  return iban.replace(/(.{4})/gu, "$1 ").trim();
}

// What a page shows of an account: the country, and the last four
// characters ("FR•• •••• 0189").
export function maskIban(country: string, last4: string): string {
  return `${country}•• •••• ${last4}`;
}

// A country of the SEPA zone (its accounts can be in the transfer file).
export function sepaCountry(country: string): boolean {
  return Object.hasOwn(sepaLengths, country);
}

// The SEPA countries outside the European Economic Area. A transfer to an
// account there carries the payee's postal address (and the payer's): the
// EPC's rules since its 2023 rulebooks, after Regulation (EU) 2023/1113
// (sources in THIRD_PARTY.md). Gibraltar left the EEA with the United
// Kingdom; Jersey, Guernsey and the Isle of Man use GB account numbers.
const outsideEea = new Set(["AD", "CH", "GB", "GI", "MC", "SM", "VA"]);

export function needsAddress(country: string): boolean {
  return sepaCountry(country) && outsideEea.has(country);
}

// A country code of ISO 3166 as a person types it ("gb", " FR ").
export function countryCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{2}$/u.test(code) ? code : null;
}
