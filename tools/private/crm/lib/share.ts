import { ChestError } from "@argentic/chest-sdk/errors";
import * as events from "@argentic/chest-sdk/events";
import type { Query } from "./db.ts";
import type { Deal } from "./deals.ts";

// What Clients tells the other tools of the Chest (Proposal (studio): events
// between tools; chest.proposals.json "emits"), once an admin linked them —
// Quotes starts a quote from a won deal. A courtesy: when the Chest cannot
// take it, the deal's move still stands.
//
// crm.deal.won: { deal, title, amount (cents), currency, company: { ref,
// name, address, postcode, city, country, siren, vat, email } | null,
// contact: { name, email } | null, owner } — a company's detail left blank
// is null, never guessed; siren is the 9 digits of a SIREN (the first 9 of
// a SIRET).
// crm.deal.reopened: { deal } — a won deal left Won.
async function publish(type: "crm.deal.won" | "crm.deal.reopened", data: Record<string, unknown>, key: string): Promise<void> {
  try {
    await events.publish(type, data, { key });
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
}

export type WonData = {
  deal: string;
  title: string;
  amount: number | null;
  currency: string;
  company: { ref: string; name: string; address: string | null; postcode: string | null; city: string | null; country: string | null; siren: string | null; vat: string | null; email: string | null } | null;
  contact: { name: string; email: string | null } | null;
  owner: string | null;
};

export async function wonData(sql: Query, deal: Deal): Promise<WonData> {
  const [company] = deal.company ? await sql<{ address: string; postcode: string; city: string; country: string; siren: string; vat: string; email: string }[]>`select address, postcode, city, country, siren, vat, email from companies where id = ${deal.company.id}` : [];
  const or = (value: string | undefined) => (value ? value : null);
  const [contact] = deal.contact ? await sql<{ email: string }[]>`select email from contacts where id = ${deal.contact.id}` : [];
  return {
    deal: deal.id,
    title: deal.title,
    amount: deal.value,
    currency: deal.currency,
    company: deal.company ? { ref: deal.company.id, name: deal.company.name, address: or(company?.address), postcode: or(company?.postcode), city: or(company?.city), country: company?.country && /^[A-Z]{2}$/u.test(company.country) ? company.country : null, siren: or(company?.siren.slice(0, 9)), vat: or(company?.vat), email: or(company?.email) } : null,
    contact: deal.contact ? { name: deal.contact.name, email: contact?.email ? contact.email : null } : null,
    owner: deal.owner !== null && deal.owner.startsWith("mbr_") ? deal.owner : null,
  };
}

// A deal moved: into Won (from elsewhere) tells "won"; out of Won tells
// "reopened". The key carries the time: won, reopened, won again is two
// events; a move delivered twice is one.
export async function moved(sql: Query, deal: Deal, from: { kind: string }, to: { kind: string }): Promise<void> {
  if (to.kind === "won" && from.kind !== "won") {
    await publish("crm.deal.won", await wonData(sql, deal), `crm:${deal.id}:won:${Date.parse(deal.closedAt ?? new Date().toISOString())}`);
  } else if (from.kind === "won" && to.kind !== "won") {
    await publish("crm.deal.reopened", { deal: deal.id }, `crm:${deal.id}:reopened:${Date.now()}`);
  }
}
