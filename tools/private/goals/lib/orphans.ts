import { ChestError } from "@argentic/chest-sdk/errors";
import type { Member } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { cycleName } from "./cycle-names.ts";
import type { Locale } from "./i18n/index.ts";
import { memberId } from "./model.ts";
import { activeMember } from "./objectives.ts";

// What needs a new owner: objectives and key results of cycles still open
// whose owner left, lost access or was erased. The Chest's answer is the
// truth (members.lookup); the departures the Chest told us of count too,
// when it cannot be asked.

export type Orphan = { kind: "objective" | "key_result"; id: string; title: string; owner: string; objectiveId: string; objectiveTitle: string; cycle: string };

// locale: the reader's language, for the names of cycles the tool wrote.
export async function orphans(sql: Query, locale: Locale | null = null): Promise<Orphan[]> {
  const rows = await sql<{ kind: "objective" | "key_result"; id: string; title: string; owner: string; objective_id: string; objective_title: string; cycle: string; generated: boolean; starts_on: string; ends_on: string }[]>`
    select 'objective' as kind, o.id, o.title, o.owner, o.id as objective_id, o.title as objective_title, y.name as cycle, y.generated, to_char(y.starts_on, 'YYYY-MM-DD') as starts_on, to_char(y.ends_on, 'YYYY-MM-DD') as ends_on
    from objectives o join cycles y on y.id = o.cycle_id
    where o.archived_at is null and y.closed_at is null
    union all
    select 'key_result' as kind, k.id, k.title, k.owner, o.id as objective_id, o.title as objective_title, y.name as cycle, y.generated, to_char(y.starts_on, 'YYYY-MM-DD') as starts_on, to_char(y.ends_on, 'YYYY-MM-DD') as ends_on
    from key_results k join objectives o on o.id = k.objective_id join cycles y on y.id = o.cycle_id
    where k.archived_at is null and o.archived_at is null and y.closed_at is null
    order by cycle, objective_id, kind desc, id`;
  const departed = new Set((await sql<{ member_id: string }[]>`select member_id from departed`).map(r => r.member_id));
  const owners = [...new Set(rows.map(r => r.owner).filter(o => o.startsWith("mbr_")))];
  const gone = new Set<string>();
  const here = new Set<string>();
  let asked = false;
  try {
    for (let i = 0; i < owners.length; i += 500) {
      const answer = await members.lookup(owners.slice(i, i + 500));
      for (const f of answer.former) gone.add(f.id);
      for (const u of answer.unknown) gone.add(u);
      for (const m of answer.members) here.add(m.id);
    }
    asked = true;
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
  // Someone who came back is nobody's orphan.
  const back = [...departed].filter(d => here.has(d));
  if (back.length > 0) await sql`delete from departed where member_id in ${sql(back)}`;
  const orphaned = (owner: string) => owner === "erased" || (asked ? gone.has(owner) : departed.has(owner));
  return rows.filter(r => orphaned(r.owner)).map(r => ({ kind: r.kind, id: String(r.id), title: r.title, owner: r.owner, objectiveId: String(r.objective_id), objectiveTitle: r.objective_title, cycle: locale ? cycleName({ name: r.cycle, generated: r.generated, startsOn: r.starts_on, endsOn: r.ends_on }, locale) : r.cycle }));
}

// An admin gives one thing, or everything a person owned in open cycles,
// to someone who is here.
export async function reassign(sql: Sql, actor: Member | null, input: { kind?: unknown; id?: unknown; from?: unknown; to?: unknown }): Promise<{ count: number; to: string }> {
  if (!can(actor, "any.write")) throw new AppError("forbidden");
  const to = await activeMember(input.to);
  if (input.kind === "all") {
    const from = input.from === "erased" ? "erased" : memberId(input.from);
    return sql.begin(async tx => {
      const a = await tx`update objectives o set owner = ${to} from cycles y where y.id = o.cycle_id and y.closed_at is null and o.archived_at is null and o.owner = ${from} returning o.id`;
      const b = await tx`update key_results k set owner = ${to} from objectives o, cycles y where o.id = k.objective_id and y.id = o.cycle_id and y.closed_at is null and k.archived_at is null and k.owner = ${from} returning k.id`;
      return { count: a.length + b.length, to };
    });
  }
  if (typeof input.id !== "string" || !/^[1-9][0-9]{0,17}$/u.test(input.id)) throw new AppError("not_found");
  const rows = input.kind === "objective"
    ? await sql`update objectives o set owner = ${to} from cycles y where y.id = o.cycle_id and y.closed_at is null and o.archived_at is null and o.id = ${input.id} returning o.id`
    : input.kind === "key_result"
      ? await sql`update key_results k set owner = ${to} from objectives o, cycles y where o.id = k.objective_id and y.id = o.cycle_id and y.closed_at is null and k.archived_at is null and k.id = ${input.id} returning k.id`
      : [];
  if (rows.length === 0) throw new AppError("not_found");
  return { count: 1, to };
}
