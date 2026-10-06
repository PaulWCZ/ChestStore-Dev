import { fold } from "../shared/fold.ts";
import { regionNames } from "../i18n/format.ts";

// A company's country is kept as its ISO 3166 code ("FR"), named in each
// reader's language by Intl — so Quotes, which prints it on legal
// documents, receives a code it understands. A country written in a file
// that is not recognised is kept as written.

export const countryCodes = [
  "FR", "BE", "CH", "LU", "MC", "DE", "AT", "NL", "IT", "ES", "PT", "IE", "GB", "DK", "SE", "NO", "FI", "IS", "PL", "CZ", "SK", "HU", "SI", "HR", "RO", "BG", "GR", "CY", "MT", "EE", "LV", "LT",
  "US", "CA", "MX", "BR", "AR", "MA", "DZ", "TN", "SN", "CI", "CM", "MG", "RE", "GP", "MQ", "GF", "YT", "NC", "PF", "TR", "IL", "AE", "SA", "QA", "IN", "CN", "HK", "SG", "JP", "KR", "AU", "NZ", "ZA",
] as const;

export function countryName(code: string, locale: string): string {
  if (!/^[A-Z]{2}$/u.test(code)) return code;
  try {
    return regionNames(locale).of(code) ?? code;
  } catch {
    return code;
  }
}

// countryCode reads a country as a file writes it ("France", "FR", "fra",
// "Allemagne", "United Kingdom") into its code, or null.
export function countryCode(value: string): string | null {
  const text = value.trim();
  if (text === "") return null;
  if (/^[A-Za-z]{2}$/u.test(text)) {
    const code = text.toUpperCase() === "UK" ? "GB" : text.toUpperCase();
    return (countryCodes as readonly string[]).includes(code) ? code : null;
  }
  const k = fold(text);
  const aliases: Record<string, string> = { fra: "FR", uk: "GB", "united states of america": "US", usa: "US", "etats unis": "US", "grande bretagne": "GB", england: "GB", angleterre: "GB", holland: "NL", hollande: "NL", deu: "DE", bel: "BE", che: "CH", esp: "ES", ita: "IT" };
  if (aliases[k]) return aliases[k]!;
  for (const locale of ["en", "fr"]) for (const code of countryCodes) if (fold(countryName(code, locale)) === k) return code;
  return null;
}
