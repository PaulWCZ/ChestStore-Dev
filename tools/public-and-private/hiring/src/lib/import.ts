import { chest } from "@argentic/chest-sdk/chest";
import type { Member } from "@argentic/chest-sdk/member";
import { can, jobAccess } from "./access.ts";
import { AppError } from "../shared/app-error.ts";
import { activity, email } from "./candidates.ts";
import type { Sql } from "./db.ts";
import { settings, stagesOf } from "./jobs.ts";
import { dateOf } from "../shared/import-map.ts";
import { clean, id, isLanguage, limits, link, phone, type Language } from "../shared/model.ts";

// Importing candidates another tool exported (lib/import-map.ts read the
// file in the browser; the recruiter checked the columns): each row lands
// in the job, in the stage the recruiter matched to its own, with its
// original application date — the retention counts from there: a row
// older than the retention is skipped, the company may not keep it — and
// "imported from <tool>" in its history. A row the tool cannot read is
// skipped and said; an address already in the job is skipped (no
// duplicates when the same file is imported twice).

export type ImportInput = { rows: unknown; stages: unknown; origin: unknown; language: unknown };
export type Skipped = { line: number; reason: "email" | "name" | "duplicate" | "invalid" | "old" };

export async function importRows(sql: Sql, actor: Member | null, jobId: unknown, input: ImportInput, today = new Date()): Promise<{ added: { id: string; email: string }[]; skipped: Skipped[] }> {
  if (!actor || !can(actor, "candidates.manage")) throw new AppError("forbidden");
  const key = id(jobId);
  if ((await jobAccess(sql, actor, key)) !== "manage") throw new AppError("not_found");
  if (!Array.isArray(input.rows) || input.rows.length === 0 || input.rows.length > limits.importRows) throw new AppError("import_invalid");
  const origin = clean(input.origin, 80, { optional: true });
  const language: Language = isLanguage(input.language) ? input.language : "en";
  const stageFor = typeof input.stages === "object" && input.stages !== null ? input.stages as Record<string, unknown> : {};
  const list = await stagesOf(sql, key);
  const first = list[0];
  if (!first) throw new AppError("invalid");
  const { retentionMonths } = await settings(sql);
  const oldest = new Date(today);
  oldest.setUTCMonth(oldest.getUTCMonth() - retentionMonths);
  const skipped: Skipped[] = [];
  const added: { id: string; email: string }[] = [];
  await sql.begin(async tx => {
    await tx`select id from jobs where id = ${key} for update`;
    const known = new Set((await tx<{ e: string }[]>`select lower(email) as e from candidates where job_id = ${key}`).map(r => r.e));
    for (const raw of input.rows as unknown[]) {
      const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
      const line = Number.isInteger(r["line"]) ? Number(r["line"]) : 0;
      let row;
      let name: string | undefined;
      try {
        name = clean(r["name"], limits.name);
        const address = email(r["email"]);
        row = { name, address, tel: safe(() => phone(r["phone"]), ""), url: safe(() => link(r["link"]), ""), letter: clean(r["coverLetter"], limits.coverLetter, { multiline: true, optional: true }) };
      } catch (error) {
        const code = error instanceof AppError ? error.code : "invalid";
        // The name read, what failed is the address (missing, too long or
        // not one); else the name, missing or not one.
        skipped.push({ line, reason: name !== undefined ? (code === "invalid_email" || code === "empty" || code === "too_long" ? "email" : "invalid") : code === "empty" && !r["name"] ? "name" : "invalid" });
        continue;
      }
      const applied = typeof r["appliedAt"] === "string" ? dateOf(r["appliedAt"]) : null;
      // Never in the future (the Chest's today).
      const at = applied && applied <= chest.today(today) ? new Date(applied + "T12:00:00Z") : today;
      if (at < oldest) {
        skipped.push({ line, reason: "old" });
        continue;
      }
      if (known.has(row.address.toLowerCase())) {
        skipped.push({ line, reason: "duplicate" });
        continue;
      }
      known.add(row.address.toLowerCase());
      const wanted = typeof r["stage"] === "string" ? stageFor[r["stage"]] : undefined;
      const stage = list.find(s => s.id === String(wanted ?? "")) ?? first;
      const [c] = await tx<{ id: string }[]>`
        insert into candidates (job_id, stage_id, name, email, phone, link, cover_letter, source, added_by, language, origin, created_at, stage_entered_at, last_activity_at)
        values (${key}, ${stage.id}, ${row.name}, ${row.address}, ${row.tel}, ${row.url}, ${row.letter}, 'import', ${actor.id}, ${language}, ${origin}, ${at}, ${today}, ${at})
        returning id`;
      const candidateId = String(c!.id);
      await activity(tx, candidateId, actor.id, "imported", { origin, stage: stage.name, preset: stage.preset });
      await tx`insert into candidate_seen (candidate_id, member_id) values (${candidateId}, ${actor.id}) on conflict do nothing`;
      added.push({ id: candidateId, email: row.address.toLowerCase() });
    }
  });
  return { added, skipped };
}

const safe = <T>(read: () => T, fallback: T): T => {
  try {
    return read();
  } catch {
    return fallback;
  }
};

// undoImport takes an import back (its Undo): the candidates it added, as
// long as nobody worked on them since (only their CV was added). Says the
// CV files, for the caller to delete.
export async function undoImport(sql: Sql, actor: Member | null, ids: unknown): Promise<string[]> {
  if (!can(actor, "candidates.manage")) throw new AppError("forbidden");
  if (!Array.isArray(ids) || ids.length > limits.importRows) throw new AppError("invalid");
  const keys = ids.map(id);
  if (keys.length === 0) return [];
  const gone = await sql<{ cv_object: string | null }[]>`
    delete from candidates c where c.id in ${sql(keys)} and c.source = 'import'
      and not exists (select 1 from activity a where a.candidate_id = c.id and a.kind not in ('imported', 'cv'))
      and not exists (select 1 from notes n where n.candidate_id = c.id)
      and not exists (select 1 from feedback f where f.candidate_id = c.id)
      and not exists (select 1 from messages m where m.candidate_id = c.id)
      and not exists (select 1 from interviews i where i.candidate_id = c.id)
    returning cv_object`;
  return gone.map(g => g.cv_object).filter((o): o is string => o !== null);
}
