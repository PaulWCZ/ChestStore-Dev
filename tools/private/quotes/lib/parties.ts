// Safe in the browser: no SDK here.
// The two parties of a document, as the document prints them. A numbered
// document keeps a copy of both as they were that day (documents.seller,
// documents.buyer): changing the company's address or a client's name later
// never changes an invoice already issued.

export type Seller = {
  legalName: string;
  tradeName: string;
  legalForm: string;
  // Share capital in minor units; null when the form has none (EI).
  capital: number | null;
  address: string;
  postcode: string;
  city: string;
  country: string;
  siren: string;
  siret: string;
  rcsCity: string;
  vatNumber: string;
  // Franchise en base de TVA (CGI art. 293 B): no VAT on any document.
  franchise: boolean;
  // Option pour le paiement de la TVA d'après les débits.
  vatOnDebits: boolean;
  email: string;
  phone: string;
  website: string;
  bank: string;
  iban: string;
  bic: string;
  logo: string | null;
  logoType: string | null;
  paymentDays: number;
  // Hundredths of a percent a year; null: the legal default (ECB + 10 points).
  penaltyRate: number | null;
  earlyDiscount: string;
  footer: string;
};

export type Buyer = {
  kind: "company" | "person";
  name: string;
  contact: string;
  email: string;
  address: string;
  postcode: string;
  city: string;
  country: string;
  deliveryAddress: string;
  siren: string;
  vatNumber: string;
};

const sellerKeys: (keyof Seller)[] = ["legalName", "tradeName", "legalForm", "capital", "address", "postcode", "city", "country", "siren", "siret", "rcsCity", "vatNumber", "franchise", "vatOnDebits", "email", "phone", "website", "bank", "iban", "bic", "logo", "logoType", "paymentDays", "penaltyRate", "earlyDiscount", "footer"];
const buyerKeys: (keyof Buyer)[] = ["kind", "name", "contact", "email", "address", "postcode", "city", "country", "deliveryAddress", "siren", "vatNumber"];

export function sellerOf(source: Seller): Seller {
  return Object.fromEntries(sellerKeys.map(k => [k, source[k]])) as Seller;
}

export function buyerOf(source: Buyer): Buyer {
  return Object.fromEntries(buyerKeys.map(k => [k, source[k]])) as Buyer;
}

// The address block of a party, line by line.
export function addressLines(p: { address: string; postcode: string; city: string; country: string }, countryName: (code: string) => string, home = "FR"): string[] {
  const lines = p.address.split("\n").map(l => l.trim()).filter(Boolean);
  const town = [p.postcode, p.city].filter(Boolean).join(" ");
  if (town) lines.push(town);
  if (p.country && p.country !== home) lines.push(countryName(p.country));
  return lines;
}

// "732 829 320": a SIREN as people read it; a SIRET "732 829 320 00074".
export function spacedSiren(value: string): string {
  if (/^\d{9}$/u.test(value)) return `${value.slice(0, 3)} ${value.slice(3, 6)} ${value.slice(6)}`;
  if (/^\d{14}$/u.test(value)) return `${value.slice(0, 3)} ${value.slice(3, 6)} ${value.slice(6, 9)} ${value.slice(9)}`;
  return value;
}
