import { keptKeys } from "./seed-words.ts";
import type { Member } from "@argentic/chest-sdk/member";
import { can, canDeleteRecord, canEditDeal } from "./access.ts";
import { record } from "./activities.ts";
import { forget } from "./contacts.ts";
import type { Sql } from "./db.ts";
import { AppError } from "./errors.ts";
import { id, limits, owner as ownerOf, tags as checkTags } from "./model.ts";
import { checkAssignable } from "./team.ts";

// Changing many at once, after an import or when a territory changes:
// selected companies, contacts or deals given to someone, tagged, untagged
// or (companies and contacts) deleted. Each record is checked as if it were
// changed alone; what the actor may not change is left as it was and
// counted, never refused as a whole.

export type BulkAction = { kind: "assign"; owner: unknown } | { kind: "tag"; tag: unknown } | { kind: "untag"; tag: unknown } | { kind: "delete" };
export type BulkResult = { done: number; skipped: number; objects: string[]; steps: { id: string; owner: string | null }[]; given: { id: string; title: string; value: number; owner: string }[] };

function ids(value: unknown): string[] {
  if (!Array.isArray(value)) throw new AppError("invalid");
  if (value.length > limits.bulk) throw new AppError("too_many", { max: limits.bulk });
  return [...new Set(value.map(v => id(v)))];
}

function oneTag(value: unknown): string {
  const [tag] = checkTags(typeof value === "string" ? value.replace(/[,;]/gu, " ") : value);
  if (!tag) throw new AppError("empty");
  return tag;
}

export async function bulk(sql: Sql, actor: Member | null, table: "companies" | "contacts" | "deals", selected: unknown, action: BulkAction): Promise<BulkResult> {
  if (!can(actor, table === "deals" ? "deals.create" : "records.write")) throw new AppError("forbidden");
  const list = ids(selected);
  const result: BulkResult = { done: 0, skipped: 0, objects: [], steps: [], given: [] };
  if (list.length === 0) return result;

  if (action.kind === "assign") {
    const owner = ownerOf(action.owner);
    if (owner !== actor!.id && !can(actor, "assign")) throw new AppError("forbidden");
    await checkAssignable(owner, actor!.id);
    if (table === "deals") {
      const rows = await sql<{ id: string; title: string; value_cents: string; owner: string | null; company_id: string | null; contact_id: string | null }[]>`select id, title, value_cents, owner, company_id, contact_id from deals where id in ${sql(list)}`;
      await sql.begin(async tx => {
        for (const d of rows) {
          if (!canEditDeal(actor, d)) { result.skipped++; continue; }
          if (d.owner === owner) { result.done++; continue; }
          await tx`update deals set owner = ${owner}, updated_at = now() where id = ${d.id}`;
          await record(tx, "owner", actor!.id, { dealId: String(d.id), companyId: d.company_id ? String(d.company_id) : null, contactId: d.contact_id ? String(d.contact_id) : null }, "", { from: d.owner, to: owner });
          if (owner && owner !== actor!.id) result.given.push({ id: String(d.id), title: d.title, value: Number(d.value_cents), owner });
          result.done++;
        }
      });
      result.skipped += list.length - rows.length;
      return result;
    }
    const changed = await sql`update ${sql(table)} set owner = ${owner}, updated_at = now() where id in ${sql(list)} returning id`;
    result.done = changed.length;
    result.skipped = list.length - changed.length;
    return result;
  }

  if (action.kind === "tag" || action.kind === "untag") {
    if (table === "deals") throw new AppError("invalid");
    const tag = oneTag(action.tag);
    const rows = await sql<{ id: string; tags: string[] }[]>`select id, tags from ${sql(table)} where id in ${sql(list)}`;
    await sql.begin(async tx => {
      for (const r of rows) {
        // A seeded tag named in any language is that record's tag.
        const [own] = keptKeys("tags", r.tags, [tag]);
        const same = (t: string) => t.toLocaleLowerCase("en") === own!.toLocaleLowerCase("en");
        const has = r.tags.some(same);
        const next = action.kind === "tag" ? (has ? r.tags : [...r.tags, tag]) : r.tags.filter(t => !same(t));
        if (next.length > limits.tags) { result.skipped++; continue; }
        if (next !== r.tags) await tx`update ${tx(table)} set tags = ${next}, updated_at = now() where id = ${r.id}`;
        result.done++;
      }
    });
    result.skipped += list.length - rows.length;
    return result;
  }

  // Deleting: each record its owner's or a manager's decision, as alone.
  if (table === "deals") throw new AppError("invalid");
  const rows = await sql<{ id: string; owner: string | null }[]>`select id, owner from ${sql(table)} where id in ${sql(list)}`;
  await sql.begin(async tx => {
    for (const r of rows) {
      if (!canDeleteRecord(actor, r)) { result.skipped++; continue; }
      if (table === "contacts") {
        const gone = await forget(tx, String(r.id));
        result.steps.push(...gone.steps);
        result.objects.push(...gone.objects);
      } else {
        result.objects.push(...(await tx<{ object: string }[]>`select object from attachments where company_id = ${r.id}`).map(x => x.object));
        await tx`delete from activities where company_id = ${r.id} and deal_id is null and contact_id is null`;
        await tx`delete from companies where id = ${r.id}`;
      }
      result.done++;
    }
  });
  result.skipped += list.length - rows.length;
  return result;
}
