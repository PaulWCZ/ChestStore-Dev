import type { Member } from "@argentic/chest-sdk/member";
import { listCompanies, type OwnerFilter } from "./companies.ts";
import { exportContact, listContacts } from "./contacts.ts";
import { toCsv } from "./csv.ts";
import type { Sql } from "./db.ts";
import { listDeals, type DealFilter } from "./deals.ts";
import { amountInput } from "./amount.ts";
import type { Catalogue, Locale } from "./i18n/index.ts";
import { stageName } from "./model.ts";
import { nameOf, people } from "./people.ts";
import { listStages } from "./stages.ts";
import { toVcard } from "./vcard.ts";

// Everything leaves as easily as it came: each list as a CSV any
// spreadsheet opens (headers in the reader's language, formulas
// neutralised by lib/csv.ts), contacts as vCards, one person's whole file
// as JSON (their right of access). Reversibility is part of the promise.

const all = 100_000;

async function owners(ids: (string | null)[], locale: Locale, t: Catalogue): Promise<(id: string | null) => string> {
  const found = await people(ids.filter((x): x is string => x !== null));
  return id => (id === null ? t.people.unassigned : nameOf(found.get(id), locale));
}

export async function companiesCsv(sql: Sql, actor: Member | null, filter: { q?: unknown; owner?: OwnerFilter; tag?: unknown }, t: Catalogue, locale: Locale): Promise<string> {
  const { rows } = await listCompanies(sql, actor, filter, all);
  const detail = new Map((await sql<{ id: string; address: string; notes: string }[]>`select id, address, notes from companies`).map(r => [String(r.id), r]));
  const owner = await owners(rows.map(r => r.owner), locale, t);
  const h = t.export.companies;
  return toCsv([
    [h.name, h.website, h.phone, h.address, h.industry, h.tags, h.owner, h.contacts, h.openDeals, h.openValue, h.notes],
    ...rows.map(r => [r.name, r.website, r.phone, detail.get(r.id)?.address ?? "", r.industry, r.tags.join(", "), owner(r.owner), r.contacts, r.openDeals, amountInput(r.openValue), detail.get(r.id)?.notes ?? ""]),
  ]);
}

export async function contactsCsv(sql: Sql, actor: Member | null, filter: { q?: unknown; owner?: OwnerFilter; tag?: unknown; stale?: boolean }, t: Catalogue, locale: Locale): Promise<string> {
  const { rows } = await listContacts(sql, actor, filter, all);
  const notes = new Map((await sql<{ id: string; notes: string }[]>`select id, notes from contacts`).map(r => [String(r.id), r.notes]));
  const owner = await owners(rows.map(r => r.owner), locale, t);
  const h = t.export.contacts;
  return toCsv([
    [h.name, h.email, h.phone, h.title, h.company, h.tags, h.owner, h.lastContact, h.nextStep, h.nextStepDate, h.notes],
    ...rows.map(r => [r.name, r.email, r.phone, r.title, r.company?.name ?? "", r.tags.join(", "), owner(r.owner), r.lastContact?.slice(0, 10) ?? "", r.step?.text ?? "", r.step?.due ?? "", notes.get(r.id) ?? ""]),
  ]);
}

export async function dealsCsv(sql: Sql, actor: Member | null, filter: DealFilter, t: Catalogue, locale: Locale): Promise<string> {
  const { rows } = await listDeals(sql, actor, filter, all);
  const stages = new Map((await listStages(sql)).map(s => [s.id, s]));
  const owner = await owners(rows.map(r => r.owner), locale, t);
  const h = t.export.deals;
  return toCsv([
    [h.title, h.company, h.contact, h.value, h.currency, h.stage, h.probability, h.closeDate, h.owner, h.status, h.reason, h.nextStep, h.nextStepDate, h.created],
    ...rows.map(r => {
      const s = stages.get(r.stageId);
      return [r.title, r.company?.name ?? "", r.contact?.name ?? "", amountInput(r.value), r.currency, s ? stageName(s, t.stages) : "", s?.probability ?? "", r.expectedClose ?? "", owner(r.owner), s ? t.export.status[s.kind] : "", r.reason, r.step?.text ?? "", r.step?.due ?? "", r.createdAt.slice(0, 10)];
    }),
  ]);
}

// Contacts as one .vcf file (vCard 4.0).
export async function contactsVcf(sql: Sql, actor: Member | null, filter: { q?: unknown; owner?: OwnerFilter; tag?: unknown; company?: unknown } = {}): Promise<string> {
  const { rows } = await listContacts(sql, actor, filter, all);
  const notes = new Map((await sql<{ id: string; notes: string; updated_at: Date }[]>`select id, notes, updated_at from contacts`).map(r => [String(r.id), r]));
  return rows.map(r => toVcard({ name: r.name, email: r.email, phone: r.phone, title: r.title, company: r.company?.name ?? "", notes: notes.get(r.id)?.notes ?? "", tags: r.tags, revised: notes.get(r.id)?.updated_at.toISOString() })).join("");
}

// One person's whole file, for their right of access: what the company
// holds about them, with the team's names.
export async function contactJson(sql: Sql, actor: Member | null, contactId: unknown, locale: Locale, t: Catalogue): Promise<{ name: string; json: string }> {
  const data = await exportContact(sql, actor, contactId);
  const ids = [data.contact.owner, ...data.activities.map(a => a.author), ...data.steps.map(s => s.owner)].filter((x): x is string => typeof x === "string");
  const who = await people(ids);
  const name = (id: string | null) => (id === null ? null : id === "chest" ? null : nameOf(who.get(id), locale));
  const c = data.contact;
  return {
    name: c.name,
    json: JSON.stringify({
      format: "chest-clients-contact/1",
      exportedAt: new Date().toISOString(),
      contact: { name: c.name, email: c.email, phone: c.phone, title: c.title, company: c.company?.name ?? null, tags: c.tags, notes: c.notes, owner: name(c.owner), createdAt: c.createdAt, updatedAt: c.updatedAt, lastContact: c.lastContact },
      deals: data.deals.map(d => ({ title: d.title, value: amountInput(d.valueCents), stage: d.stage, createdAt: d.createdAt })),
      activities: data.activities.map(a => ({ kind: t.timeline.kinds[a.kind], text: a.body, by: name(a.author), at: a.at, deal: a.deal?.title ?? null })),
      nextSteps: data.steps.map(s => ({ text: s.text, due: s.due, owner: name(s.owner), doneAt: s.doneAt })),
    }, null, 2),
  };
}

// fileName makes a name safe in a download.
export function fileName(name: string, extension: string): string {
  const base = name.normalize("NFD").replace(/\p{Mn}/gu, "").replace(/[^A-Za-z0-9 _-]/gu, "").trim().replace(/\s+/gu, "-").slice(0, 60) || "export";
  return `${base}.${extension}`;
}
