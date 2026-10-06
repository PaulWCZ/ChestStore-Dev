import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import { frenchVatNumber, siren as checkSiren } from "./model.ts";

// Filling a new client from its SIREN, through France's free public
// directory of companies, the "API Recherche d'entreprises" of the State
// (DINUM, data from INSEE's Sirene register): no key, no account.
//
//   GET https://recherche-entreprises.api.gouv.fr/search?q=<siren>&page=1&per_page=1
//
// The tool reaches it through the Chest's declared network egress
// (chest.json "network": the one host below — a permission the owner or an
// admin approves; nothing else is reachable) with plain fetch(), which
// Node sends through the Chest's egress proxy (NODE_USE_ENV_PROXY); tests
// answer the host with the SDK's fakeChest({ network }). The fields read are the ones of the
// API's answers as its own site's tests hold them (README, "Filling a
// client from its SIREN": sources and what could not be verified): per
// result `siren`, `nom_raison_sociale`, `nom_complet`, `etat_administratif`
// ("A" active, "C" ceased) and `siege` { `adresse`, `code_postal`,
// `libelle_commune`, `siret` }. The French VAT number is computed from the
// SIREN (its key), as the tax administration does.
//
// Honest failure: when the directory cannot be reached, answers something
// else, or too slowly, the person is told and types the details
// themselves; nothing is invented. A SIREN the directory does not know is
// said too. Only what the person has not typed is filled (the form does).

export const registryHost = "recherche-entreprises.api.gouv.fr";
export const registryLimits = { timeoutMs: 6000, bytes: 1 << 20 } as const;

export type Registered = { siren: string; name: string; address: string; postcode: string; city: string; country: "FR"; vatNumber: string; closed: boolean };

type Result = { siren?: unknown; nom_raison_sociale?: unknown; nom_complet?: unknown; etat_administratif?: unknown; siege?: { adresse?: unknown; code_postal?: unknown; libelle_commune?: unknown } | null };

const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/gu, " ").trim().slice(0, max) : "");

// The street of the head office: the directory's one-line address without
// its postcode and town at the end ("20 AVENUE DU GRESILLE 49000 ANGERS").
export function streetOf(address: string, postcode: string, city: string): string {
  const tail = `${postcode} ${city}`.trim();
  const at = tail && address.toUpperCase().endsWith(tail.toUpperCase()) ? address.length - tail.length : -1;
  return (at >= 0 ? address.slice(0, at) : address).trim().replace(/,$/u, "");
}

export function registered(body: unknown, siren: string): Registered | null {
  const results = body && typeof body === "object" && Array.isArray((body as { results?: unknown }).results) ? (body as { results: Result[] }).results : null;
  if (!results) throw new AppError("registry_unreachable");
  const found = results.find(r => r && r.siren === siren);
  if (!found) return null;
  const postcode = text(found.siege?.code_postal, 12);
  const city = text(found.siege?.libelle_commune, 80);
  return {
    siren,
    name: text(found.nom_raison_sociale, 160) || text(found.nom_complet, 160),
    address: streetOf(text(found.siege?.adresse, 300), postcode, city),
    postcode,
    city,
    country: "FR",
    vatNumber: frenchVatNumber(siren),
    closed: found.etat_administratif === "C",
  };
}

// lookupSiren asks the directory for a company by its SIREN (checked first:
// nine digits and their key). Who may add clients may ask.
export async function lookupSiren(actor: Member | null, input: unknown): Promise<Registered> {
  if (!can(actor, "clients.write")) throw new AppError("forbidden");
  const siren = checkSiren(input, false);
  let response: Response;
  try {
    response = await fetch(`https://${registryHost}/search?q=${siren}&page=1&per_page=1`, {
      method: "GET", redirect: "error", signal: AbortSignal.timeout(registryLimits.timeoutMs), headers: { Accept: "application/json" },
    });
  } catch {
    throw new AppError("registry_unreachable");
  }
  if (!response.ok) throw new AppError("registry_unreachable");
  const raw = await response.text().catch(() => "");
  if (raw.length === 0 || raw.length > registryLimits.bytes) throw new AppError("registry_unreachable");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new AppError("registry_unreachable");
  }
  const found = registered(body, siren);
  if (!found || !found.name) throw new AppError("registry_not_found");
  return found;
}
