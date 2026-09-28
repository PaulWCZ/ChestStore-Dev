import { addClient, type Client } from "../../lib/clients.ts";
import { updateCompany } from "../../lib/company.ts";
import type { Sql } from "../../lib/db.ts";
import { createDocument, saveDraft, type Defaults, type Doc, type LineInput } from "../../lib/documents.ts";
import { asMember } from "./member.ts";
import { camille, sofia } from "./members.ts";

// A small French company, as the tests need it: its legal details, a client
// or two, and documents with lines.
export const today = "2026-09-28";
export const defaults: Defaults = { today, locale: "fr", currency: "EUR" };

export async function company(sql: Sql, extra: Record<string, unknown> = {}): Promise<void> {
  await updateCompany(sql, asMember(camille), {
    legalName: "Atelier Martin SARL", legalForm: "SARL", capital: "10000", address: "12 rue des Tanneurs", postcode: "69002", city: "Lyon",
    siren: "853 128 940", siret: "853 128 940 00014", rcsCity: "Lyon", vatNumber: "FR25853128940", iban: "FR76 3000 6000 0112 3456 7890 189", bic: "AGRIFRPP",
    email: "contact@atelier-martin.test", ...extra,
  });
}

export async function client(sql: Sql, extra: Record<string, unknown> = {}): Promise<Client> {
  return addClient(sql, asMember(sofia), {
    kind: "company", name: "Boulangerie Dupain SAS", contact: "Marie Dupain", email: "marie@dupain.test", address: "3 place Bellecour", postcode: "69002", city: "Lyon",
    siren: "812345676", vatNumber: "FR19812345676", language: "fr", ...extra,
  });
}

export const line = (description: string, quantity: number, unitPrice: number, vatRate = 2000, extra: LineInput = {}): LineInput => ({ kind: "line", description, quantity, unitPrice, vatRate, discount: 0, unit: "", ...extra });

export async function draft(sql: Sql, type: "quote" | "invoice", clientId: string, lines: LineInput[], as = sofia): Promise<Doc> {
  const d = await createDocument(sql, asMember(as), type, clientId, defaults);
  return saveDraft(sql, asMember(as), d.id, { lines });
}
