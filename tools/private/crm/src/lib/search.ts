import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { likePattern, phoneQuery, words } from "./companies.ts";
import type { Sql } from "./db.ts";
import { AppError } from "./errors.ts";
import { catalogue, isLocale } from "../i18n/index.ts";
import { clean, domainOf, freeMail, limits, optionalId } from "../shared/model.ts";
import { shownName } from "./seed-words.ts";

// One search box for companies, contacts and deals: the words of their
// names (and of an address, a phone, a website), accents and case aside,
// with names that are close enough ("Dupond" finds "Dupont").

export type Found = {
  companies: { id: string; name: string; detail: string }[];
  contacts: { id: string; name: string; detail: string }[];
  deals: { id: string; name: string; detail: string; value: number; currency: string; stageId: string }[];
};

export async function search(sql: Sql, actor: Member | null, query: unknown): Promise<Found> {
  if (!can(actor, "read")) throw new AppError("forbidden");
  const q = clean(query ?? "", limits.query, { optional: true });
  const tsq = words(q);
  const plain = q.replace(/[\\%_]/gu, "");
  if (!tsq && plain.trim().length < 2 && !phoneQuery(q)) return { companies: [], contacts: [], deals: [] };
  const like = likePattern(q);
  const digits = phoneQuery(q);
  const phoneMatch = (alias: string) => (digits ? sql`or ${sql(alias + ".phone_digits")} like ${"%" + digits + "%"}` : sql``);
  const match = (alias: string) => sql`(${tsq ? sql`${sql(alias + ".search")} @@ to_tsquery('crm', ${tsq}) or` : sql``} ${sql(alias + ".folded")} like '%' || crm_fold(${plain}) || '%' or word_similarity(crm_fold(${plain}), ${sql(alias + ".folded")}) > 0.5)`;
  const rank = (alias: string) => sql`(${tsq ? sql`ts_rank(${sql(alias + ".search")}, to_tsquery('crm', ${tsq})) +` : sql``} word_similarity(crm_fold(${plain}), ${sql(alias + ".folded")}))`;
  const t = catalogue(isLocale(actor!.language) ? actor!.language : "en");
  const companies = await sql<{ id: string; name: string; industry: string; website: string }[]>`
    select o.id, o.name, o.industry, o.website from companies o
    where ${match("o")} or o.website ilike ${like} or o.phone ilike ${like} ${phoneMatch("o")}
    order by ${rank("o")} desc, o.folded limit 20`;
  const contacts = await sql<{ id: string; name: string; detail: string }[]>`
    select c.id, c.name, concat_ws(' · ', nullif(c.title, ''), o.name, nullif(c.email, '')) as detail from contacts c left join companies o on o.id = c.company_id
    where ${match("c")} or c.email ilike ${like} or c.phone ilike ${like} or c.phone2 ilike ${like} ${phoneMatch("c")}
    order by ${rank("c")} desc, c.folded limit 20`;
  const deals = await sql<{ id: string; name: string; detail: string; value_cents: string; currency: string; stage_id: string }[]>`
    select d.id, d.title as name, coalesce(o.name, '') as detail, d.value_cents, d.currency, d.stage_id from deals d left join companies o on o.id = d.company_id
    where ${match("d")}
    order by ${rank("d")} desc, d.updated_at desc limit 20`;
  return {
    companies: companies.map(r => ({ id: String(r.id), name: r.name, detail: [r.industry ? shownName("industries", r.industry, t) : "", r.website].filter(Boolean).join(" · ") })),
    contacts: contacts.map(r => ({ id: String(r.id), name: r.name, detail: r.detail })),
    deals: deals.map(r => ({ id: String(r.id), name: r.name, detail: r.detail, value: Number(r.value_cents), currency: r.currency, stageId: String(r.stage_id) })),
  };
}

// lookalikes: the companies or contacts that may be the one being added —
// a name close enough, the same address, the same web domain (free mail
// aside). A warning, never a refusal: two "Martin" may be two people.
export type Lookalike = { id: string; name: string; detail: string; why: "name" | "email" | "domain" };
export async function lookalikes(sql: Sql, actor: Member | null, input: { kind: "company" | "contact"; name?: unknown; email?: unknown; website?: unknown; except?: unknown }): Promise<Lookalike[]> {
  if (!can(actor, "read")) throw new AppError("forbidden");
  const name = typeof input.name === "string" ? input.name.slice(0, limits.name).trim() : "";
  const email = typeof input.email === "string" ? input.email.slice(0, limits.email).trim().toLowerCase() : "";
  const site = typeof input.website === "string" ? input.website.slice(0, limits.website).trim() : "";
  const except = optionalId(input.except ?? null);
  const found = new Map<string, Lookalike>();
  if (input.kind === "company") {
    const domain = site ? domainOf(site) : email && !freeMail.has(domainOf(email)) ? domainOf(email) : "";
    if (name.length >= 2) {
      const rows = await sql<{ id: string; name: string; website: string }[]>`
        select id, name, website from companies where (folded = crm_fold(${name}) or similarity(folded, crm_fold(${name})) > 0.55) and id <> ${except ?? 0}
        order by similarity(folded, crm_fold(${name})) desc limit 3`;
      for (const r of rows) found.set(String(r.id), { id: String(r.id), name: r.name, detail: r.website, why: "name" });
    }
    if (domain.includes(".")) {
      const rows = await sql<{ id: string; name: string; website: string }[]>`
        select id, name, website from companies where website <> '' and (lower(website) like ${"%" + domain.replace(/[\\%_]/gu, "")} or lower(website) like ${"%" + domain.replace(/[\\%_]/gu, "") + "/%"}) and id <> ${except ?? 0} limit 3`;
      for (const r of rows) if (!found.has(String(r.id))) found.set(String(r.id), { id: String(r.id), name: r.name, detail: r.website, why: "domain" });
    }
  } else {
    if (email.includes("@")) {
      const rows = await sql<{ id: string; name: string; email: string }[]>`select id, name, email from contacts where lower(email) = ${email} and id <> ${except ?? 0} limit 3`;
      for (const r of rows) found.set(String(r.id), { id: String(r.id), name: r.name, detail: r.email, why: "email" });
    }
    if (name.length >= 3) {
      const rows = await sql<{ id: string; name: string; email: string }[]>`
        select id, name, email from contacts where (folded = crm_fold(${name}) or similarity(folded, crm_fold(${name})) > 0.6) and id <> ${except ?? 0}
        order by similarity(folded, crm_fold(${name})) desc limit 3`;
      for (const r of rows) if (!found.has(String(r.id))) found.set(String(r.id), { id: String(r.id), name: r.name, detail: r.email, why: "name" });
    }
  }
  return [...found.values()].slice(0, 5);
}
