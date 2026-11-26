import type { Member } from "@argentic/chest-sdk/member";
import { can, canDeleteRecord } from "./access.ts";
import { record } from "./activities.ts";
import type { Custom } from "../shared/custom.ts";
import type { Sql } from "./db.ts";
import { AppError } from "./errors.ts";
import { id, limits } from "../shared/model.ts";

// Merging two records that are the same client (an import plus someone's
// typing): one is kept; the other's deals, people, history, next steps and
// files move to it; what the kept one lacks (an email, a phone, a field
// left blank) is taken from the other, tags are joined, notes are put
// together; then the other is deleted. It says so in the kept one's
// history. Whoever may delete the one that goes may merge it.

const union = (a: string[], b: string[]) => {
  const seen = new Set(a.map(t => t.toLocaleLowerCase("en")));
  return [...a, ...b.filter(t => !seen.has(t.toLocaleLowerCase("en")))].slice(0, limits.tags);
};
const notes = (a: string, b: string) => (b.trim() === "" || a.includes(b) ? a : a.trim() === "" ? b : `${a}\n\n${b}`).slice(0, limits.notes);
const fill = (a: string, b: string) => (a.trim() === "" ? b : a);
const custom = (a: Custom, b: Custom): Custom => ({ ...b, ...a });

async function pair(sql: Sql, actor: Member | null, table: "contacts" | "companies", sourceId: unknown, targetId: unknown) {
  if (!can(actor, "records.write")) throw new AppError("forbidden");
  const source = id(sourceId), target = id(targetId);
  if (source === target) throw new AppError("same_record");
  const rows = await sql<Record<string, unknown>[]>`select * from ${sql(table)} where id in ${sql([source, target])}`;
  const from = rows.find(r => String(r["id"]) === source), into = rows.find(r => String(r["id"]) === target);
  if (!from || !into) throw new AppError("not_found");
  if (!canDeleteRecord(actor, { owner: from["owner"] as string | null })) throw new AppError("forbidden");
  return { from, into, source, target };
}

type ContactRow = { name: string; email: string; phone: string; phone2: string; url: string; title: string; company_id: string | null; notes: string; tags: string[]; custom: Custom; owner: string | null; last_contact_at: Date | null; created_at: Date };

export async function mergeContacts(sql: Sql, actor: Member | null, sourceId: unknown, targetId: unknown): Promise<{ id: string }> {
  const p = await pair(sql, actor, "contacts", sourceId, targetId);
  const a = p.into as unknown as ContactRow, b = p.from as unknown as ContactRow;
  // A second number: the other's, when the kept one already has one.
  const phone = fill(a.phone, b.phone);
  const phone2 = fill(a.phone2, b.phone && b.phone !== phone ? b.phone : b.phone2);
  const last = [a.last_contact_at, b.last_contact_at].filter((d): d is Date => d !== null).sort((x, y) => y.getTime() - x.getTime())[0] ?? null;
  await sql.begin(async tx => {
    await tx`update activities set contact_id = ${p.target} where contact_id = ${p.source}`;
    await tx`update steps set contact_id = ${p.target} where contact_id = ${p.source}`;
    await tx`update deals set contact_id = ${p.target} where contact_id = ${p.source}`;
    await tx`update attachments set contact_id = ${p.target} where contact_id = ${p.source}`;
    await tx`delete from contacts where id = ${p.source}`;
    await tx`
      update contacts set email = ${fill(a.email, b.email)}, phone = ${phone}, phone2 = ${phone2}, url = ${fill(a.url, b.url)}, title = ${fill(a.title, b.title)},
        company_id = ${a.company_id ?? b.company_id}, notes = ${notes(a.notes, b.notes)}, tags = ${union(a.tags, b.tags)}, custom = ${tx.json(custom(a.custom, b.custom))},
        owner = ${a.owner ?? b.owner}, last_contact_at = ${last}, created_at = least(created_at, ${b.created_at}), updated_at = now()
      where id = ${p.target}`;
    await record(tx, "merged", actor!.id, { contactId: p.target, companyId: a.company_id ?? b.company_id }, "", { name: b.name });
  });
  return { id: p.target };
}

type CompanyRow = { name: string; website: string; phone: string; email: string; address: string; postcode: string; city: string; country: string; siren: string; vat: string; industry: string; notes: string; tags: string[]; custom: Custom; owner: string | null; created_at: Date };

export async function mergeCompanies(sql: Sql, actor: Member | null, sourceId: unknown, targetId: unknown): Promise<{ id: string }> {
  const p = await pair(sql, actor, "companies", sourceId, targetId);
  const a = p.into as unknown as CompanyRow, b = p.from as unknown as CompanyRow;
  // An address goes whole: the kept one's if it has one, else the other's.
  const where = a.address.trim() !== "" || a.city.trim() !== "" ? a : b;
  await sql.begin(async tx => {
    await tx`update contacts set company_id = ${p.target} where company_id = ${p.source}`;
    await tx`update deals set company_id = ${p.target} where company_id = ${p.source}`;
    await tx`update activities set company_id = ${p.target} where company_id = ${p.source}`;
    await tx`update attachments set company_id = ${p.target} where company_id = ${p.source}`;
    await tx`delete from companies where id = ${p.source}`;
    await tx`
      update companies set website = ${fill(a.website, b.website)}, phone = ${fill(a.phone, b.phone)}, email = ${fill(a.email, b.email)},
        address = ${where.address}, postcode = ${where.postcode}, city = ${where.city}, country = ${fill(a.country, b.country)},
        siren = ${fill(a.siren, b.siren)}, vat = ${fill(a.vat, b.vat)}, industry = ${fill(a.industry, b.industry)}, notes = ${notes(a.notes, b.notes)},
        tags = ${union(a.tags, b.tags)}, custom = ${tx.json(custom(a.custom, b.custom))}, owner = ${a.owner ?? b.owner}, created_at = least(created_at, ${b.created_at}), updated_at = now()
      where id = ${p.target}`;
    await record(tx, "merged", actor!.id, { companyId: p.target }, "", { name: b.name });
  });
  return { id: p.target };
}
