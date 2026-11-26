import { ChestError } from "@argentic/chest-sdk/errors";
import * as events from "@argentic/chest-sdk/events";
import type { Query } from "./db.ts";
import { numberFormat } from "../i18n/index.ts";
import type { Deal } from "./deals.ts";

// What Clients tells the other tools of the Chest (SDK 0.7.0 events between
// tools; chest.json "emits", each type with its schema), once the owner
// approved the link — Quotes starts a quote from a won deal. A courtesy:
// when the Chest cannot take it, the deal's move still stands.
//
// Flat, as the contract's kinds are (no object):
// crm.deal.won: { deal, title, amount (minor units of currency) | null,
//   currency, owner | null, companyRef, companyName, companyAddress,
//   companyPostcode, companyCity, companyCountry, companySiren, companyVat,
//   companyEmail, contactName, contactEmail } — a detail left blank is
//   absent, never guessed; companySiren is the 9 digits of a SIREN (the
//   first 9 of a SIRET).
// crm.deal.reopened: { deal } — a won deal left Won.
// Subject: the deal. No audience: every member with a role in Clients
// reads every deal.
async function emit(type: "crm.deal.won" | "crm.deal.reopened", data: Record<string, unknown>, deal: string, key: string): Promise<void> {
  try {
    await events.emit(type, data, { subject: `deal:${deal}`, key });
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
}

export type WonData = {
  deal: string;
  title: string;
  amount: number | null;
  currency: string;
  owner?: string;
} & Partial<Record<"companyRef" | "companyName" | "companyAddress" | "companyPostcode" | "companyCity" | "companyCountry" | "companySiren" | "companyVat" | "companyEmail" | "contactName" | "contactEmail", string>>;

// A deal's amount is kept in hundredths of its currency (value_cents); the
// event says it in the currency's own minor unit (a yen has none).
export function minorUnits(hundredths: number, currency: string): number {
  const decimals = numberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return Math.round(hundredths * 10 ** (decimals - 2));
}

// A text field of an event, as the Chest takes it: no format character
// (Unicode Cf — a zero-width joiner inside an emoji, a zero-width space, a
// BOM), which the Chest refuses. Only the event's copy: the names stay as
// people typed them.
export const eventText = (text: string): string => text.replace(/\p{Cf}/gu, "");

export async function wonData(sql: Query, deal: Deal): Promise<WonData> {
  const [company] = deal.company ? await sql<{ address: string; postcode: string; city: string; country: string; siren: string; vat: string; email: string }[]>`select address, postcode, city, country, siren, vat, email from companies where id = ${deal.company.id}` : [];
  const [contact] = deal.contact ? await sql<{ email: string }[]>`select email from contacts where id = ${deal.contact.id}` : [];
  const some = (entries: [string, string | undefined | null][]) => Object.fromEntries(entries.map(([k, v]) => [k, typeof v === "string" ? eventText(v) : v]).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== ""));
  return {
    deal: deal.id,
    title: eventText(deal.title),
    amount: deal.value === null ? null : minorUnits(deal.value, deal.currency),
    currency: deal.currency,
    // A field without a value is left out (the schema's "?").
    ...(deal.owner !== null && deal.owner.startsWith("mbr_") ? { owner: deal.owner } : {}),
    ...(deal.company ? some([
      ["companyRef", deal.company.id], ["companyName", deal.company.name], ["companyAddress", company?.address], ["companyPostcode", company?.postcode],
      ["companyCity", company?.city], ["companyCountry", company?.country && /^[A-Z]{2}$/u.test(company.country) ? company.country : null],
      ["companySiren", company?.siren.slice(0, 9)], ["companyVat", company?.vat], ["companyEmail", company?.email],
    ]) : {}),
    ...(deal.contact ? some([["contactName", deal.contact.name], ["contactEmail", contact?.email]]) : {}),
  };
}

// A deal moved: into Won (from elsewhere) tells "won"; out of Won tells
// "reopened". The key carries the time: won, reopened, won again is two
// events; a move delivered twice is one.
export async function moved(sql: Query, deal: Deal, from: { kind: string }, to: { kind: string }): Promise<void> {
  if (to.kind === "won" && from.kind !== "won") {
    await emit("crm.deal.won", await wonData(sql, deal), deal.id, `crm:${deal.id}:won:${Date.parse(deal.closedAt ?? new Date().toISOString())}`);
  } else if (from.kind === "won" && to.kind !== "won") {
    await emit("crm.deal.reopened", { deal: deal.id }, deal.id, `crm:${deal.id}:reopened:${Date.now()}`);
  }
}
