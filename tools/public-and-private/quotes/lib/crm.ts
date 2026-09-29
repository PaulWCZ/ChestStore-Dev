import { createHash } from "node:crypto";
import type { ToolEvent } from "@argentic/chest-sdk/events";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as members from "@argentic/chest-sdk/members";
import { can } from "./access.ts";
import { company } from "./company.ts";
import type { Query, Sql } from "./db.ts";
import { isLocale, format, type Locale } from "./i18n/index.ts";
import { addDays, country, email, limits, siren, vatNumber } from "./model.ts";
import { lineNet, totals } from "./totals.ts";
import { holders } from "./people.ts";
import { notify, withdraw } from "./notify.ts";
import { formatMoney } from "./money.ts";

// What Clients (the CRM tool) tells Quotes (Proposal (studio): events
// between tools, once an admin linked the two). A deal won there becomes a
// draft quote here — once per deal — for its client, with one line of the
// deal's amount, owned by the deal's owner when they may write quotes, and
// the owner (or else the sales people) told in the bell. A deal reopened
// takes its draft back if nobody touched it; otherwise the quote stays and
// says so in its history.
//
// Data, as Clients publishes it:
//   crm.deal.won      { deal, title, amount: cents | null, currency, company: {ref, name, address, postcode,
//                       city, country, siren, vat, email} | null, contact: {name, email} | null, owner: "mbr_…" | null }
//   crm.deal.reopened { deal }
// Anything of another shape is accepted and ignored.
//
// The client: found by the CRM's reference (clients.external_ref), else by
// SIREN (then linked), else created from the company. **The rule for an
// existing client: Clients only fills what is empty here.** A field a person
// wrote in Quotes is never overwritten — Quotes' card is what prints on
// legal documents, and someone may have corrected it on purpose.

type Company = { ref: string; name: string; address: string; postcode: string; city: string; country: string; siren: string; vat: string; email: string };
export type Won = { deal: string; title: string; amount: number | null; currency: string; company: Company | null; contact: { name: string; email: string } | null; owner: string | null };

const text = (value: unknown, max: number): string => {
  if (typeof value !== "string") return "";
  const t = value.replace(/\r\n?/gu, "\n").replace(/[^\P{Cc}\n]/gu, "").replace(/[‪-‮⁦-⁩]/gu, "").trim();
  return [...t].slice(0, max).join("");
};
const line = (value: unknown, max: number) => text(value, max).replace(/\s+/gu, " ");
const safe = <T>(read: () => T, fallback: T): T => {
  try {
    return read();
  } catch {
    return fallback;
  }
};
const refPattern = /^[A-Za-z0-9._:-]{1,64}$/u;

// The key of a deal's bell item (keys are lowercase: the deal's reference is
// hashed, so two references differing by case never share one).
export const crmKey = (deal: string) => "crm:" + createHash("sha256").update(deal).digest("hex").slice(0, 40);

export function readWon(data: Record<string, unknown>): Won | null {
  const { deal, title, amount, currency, owner } = data;
  if (typeof deal !== "string" || !refPattern.test(deal)) return null;
  const name = line(title, limits.title);
  if (!name) return null;
  if (amount !== null && amount !== undefined && (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0 || amount > limits.unitPrice)) return null;
  if (typeof currency !== "string" || !/^[A-Z]{3}$/u.test(currency)) return null;
  if (owner !== null && owner !== undefined && (typeof owner !== "string" || !/^mbr_[a-z2-7]{26}$/u.test(owner))) return null;
  let c: Company | null = null;
  const raw = data["company"];
  if (raw !== null && raw !== undefined) {
    if (typeof raw !== "object" || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    if (typeof r["ref"] !== "string" || !refPattern.test(r["ref"])) return null;
    const companyName = line(r["name"], limits.name);
    if (!companyName) return null;
    c = {
      ref: r["ref"], name: companyName, address: text(r["address"], limits.address), postcode: line(r["postcode"], limits.postcode), city: line(r["city"], limits.city),
      country: safe(() => country(r["country"] ?? ""), "FR"), siren: safe(() => siren(r["siren"] ?? ""), ""), vat: safe(() => vatNumber(r["vat"] ?? ""), ""), email: safe(() => email(r["email"] ?? ""), ""),
    };
  }
  let contact: Won["contact"] = null;
  const rc = data["contact"];
  if (rc !== null && rc !== undefined) {
    if (typeof rc !== "object" || Array.isArray(rc)) return null;
    const r = rc as Record<string, unknown>;
    const contactName = line(r["name"], limits.contact);
    if (contactName) contact = { name: contactName, email: safe(() => email(r["email"] ?? ""), "") };
  }
  return { deal, title: name, amount: typeof amount === "number" ? amount : null, currency, company: c, contact, owner: typeof owner === "string" ? owner : null };
}

type ClientRow = { id: number; name: string; contact: string; email: string; address: string; postcode: string; city: string; country: string; siren: string; vat_number: string; external_ref: string | null; archived_at: Date | null; language: string; reverse_charge: boolean };

// The client of a won deal: found, linked and completed, or made.
async function clientFor(tx: Query, won: Won, defaultLanguage: Locale): Promise<ClientRow | null> {
  const c = won.company;
  const ref = c ? "crm:" + c.ref : null;
  let row: ClientRow | undefined;
  if (c) {
    [row] = await tx<ClientRow[]>`select * from clients where external_ref = ${ref} for update`;
    if (!row && c.siren) [row] = await tx<ClientRow[]>`select * from clients where siren = ${c.siren} and external_ref is null order by archived_at nulls first, id limit 1 for update`;
  }
  if (row) {
    // Only what is empty here, never what a person wrote.
    const fill = (mine: string, theirs: string) => (mine === "" ? theirs : mine);
    const fields = {
      external_ref: row.external_ref ?? ref,
      contact: fill(row.contact, won.contact?.name ?? ""),
      email: fill(row.email, c?.email || won.contact?.email || ""),
      address: fill(row.address, c?.address ?? ""),
      postcode: fill(row.postcode, c?.postcode ?? ""),
      city: fill(row.city, c?.city ?? ""),
      siren: fill(row.siren, c?.siren ?? ""),
      vat_number: fill(row.vat_number, c?.vat ?? ""),
    };
    const [updated] = await tx<ClientRow[]>`update clients set ${tx(fields)}, updated_at = now() where id = ${row.id} returning *`;
    return updated!;
  }
  if (!c && !won.contact) return null;
  const [made] = await tx<ClientRow[]>`
    insert into clients ${tx(c ? {
      kind: "company", name: c.name, contact: won.contact?.name ?? "", email: c.email || won.contact?.email || "", address: c.address, postcode: c.postcode, city: c.city,
      country: c.country, siren: c.siren, vat_number: c.vat, language: c.country === "FR" ? "fr" : defaultLanguage, external_ref: ref, created_by: "tool:crm",
    } : {
      kind: "person", name: won.contact!.name, email: won.contact!.email, language: defaultLanguage, created_by: "tool:crm",
    })} returning *`;
  return made!;
}

// Whether the deal's owner may write quotes here (the Chest says their role).
async function mayQuote(owner: string | null): Promise<boolean> {
  if (!owner) return false;
  try {
    const m = await members.get(owner);
    return m !== null && can({ ...m, locale: m.locale ?? "en" } as Parameters<typeof can>[0], "quotes.write");
  } catch (error) {
    if (error instanceof ChestError) return false;
    throw error;
  }
}

export type Made = { documentId: string; created: boolean };

export async function dealWon(sql: Sql, event: ToolEvent, context: { today: string; locale: Locale; currency: string }): Promise<Made | null> {
  const won = readWon(event.data);
  if (!won) return null;
  const owner = (await mayQuote(won.owner)) ? won.owner : null;
  const made = await sql.begin(async tx => {
    const [existing] = await tx<{ id: number }[]>`select id from documents where crm_deal = ${won.deal}`;
    if (existing) {
      await tx`update documents set crm_reopened_at = null where id = ${existing.id}`;
      return { documentId: String(existing.id), created: false };
    }
    const c = await company(tx);
    const client = await clientFor(tx, won, context.locale);
    const lines = [{ kind: "line" as const, quantity: 1000, unitPrice: won.currency === context.currency ? won.amount ?? 0 : 0, discount: 0, vatRate: 2000 }];
    const noVat = c.franchise || Boolean(client?.reverse_charge);
    const t = totals(lines, { noVat });
    const [doc] = await tx<{ id: number }[]>`
      insert into documents ${tx({
        type: "quote", client_id: client && !client.archived_at ? client.id : null, title: won.title, language: client && isLocale(client.language) ? client.language : context.locale,
        currency: context.currency, valid_until: addDays(context.today, c.validityDays), payment_days: c.paymentDays, vat_treatment: client?.reverse_charge ? "reverse_charge" : "standard",
        franchise: c.franchise, created_by: owner ?? "tool:crm", net: t.net, vat: t.vat, gross: t.gross, crm_deal: won.deal, crm_title: won.title, rates: tx.json(t.rates as never),
      })}
      on conflict (crm_deal) where crm_deal is not null do nothing returning id`;
    if (!doc) {
      const [raced] = await tx<{ id: number }[]>`select id from documents where crm_deal = ${won.deal}`;
      return { documentId: String(raced!.id), created: false };
    }
    await tx`insert into lines (document_id, position, kind, description, quantity, unit, unit_price, discount, vat_rate, goods, net)
      values (${doc.id}, 1, 'line', ${won.title}, 1000, '', ${lines[0]!.unitPrice}, 0, 2000, false, ${lineNet(lines[0]!)})`;
    await tx`update documents set crm_made_at = updated_at where id = ${doc.id}`;
    return { documentId: String(doc.id), created: true, gross: t.gross, clientName: client?.name ?? "" };
  });
  if (made.created) {
    const to = owner ? [owner] : (await holders({ role: "sales" })).map(h => h.id);
    const { gross, clientName } = made as Made & { gross: number; clientName: string };
    await notify(to, (t, locale) => ({
      title: format(t.notifications.crmWonTitle, { title: won.title }),
      body: format(clientName ? t.notifications.crmWonBody : t.notifications.crmWonNoClient, { client: clientName, amount: formatMoney(gross, context.currency, locale) }),
    }), { path: `/chest/documents/${made.documentId}`, key: crmKey(won.deal) });
  }
  return { documentId: made.documentId, created: made.created };
}

// A deal reopened in Clients: its draft goes if nobody touched it (never
// saved since it was made, never sent); otherwise it stays, and its history
// says the deal was reopened.
export async function dealReopened(sql: Sql, event: ToolEvent): Promise<"deleted" | "kept" | null> {
  const deal = event.data["deal"];
  if (typeof deal !== "string" || !refPattern.test(deal)) return null;
  const result = await sql.begin(async tx => {
    const [doc] = await tx<{ id: number; status: string; number: string | null; sent_at: Date | null; updated_at: Date; crm_made_at: Date | null; deleted_at: Date | null }[]>`
      select id, status, number, sent_at, updated_at, crm_made_at, deleted_at from documents where crm_deal = ${deal} for update`;
    if (!doc) return null;
    const untouched = doc.status === "draft" && doc.number === null && doc.sent_at === null && doc.crm_made_at !== null && doc.updated_at.getTime() === doc.crm_made_at.getTime();
    if (untouched || doc.deleted_at) {
      await tx`delete from documents where id = ${doc.id} and status = 'draft' and not exists (select 1 from documents x where x.quote_id = ${doc.id})`;
      return "deleted" as const;
    }
    await tx`update documents set crm_reopened_at = now() where id = ${doc.id}`;
    return "kept" as const;
  });
  if (result === "deleted") await withdraw(crmKey(deal));
  return result;
}
