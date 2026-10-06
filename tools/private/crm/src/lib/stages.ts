import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import type { Query, Sql } from "./db.ts";
import { AppError } from "./errors.ts";
import { clean, id, limits, type Stage, type StageKey } from "../shared/model.ts";
import { between } from "../shared/position.ts";

// The pipeline's stages: the open ones in order, then Won and Lost (the end
// stages, always there, one of each). A manager renames them, sets their
// probability, adds, orders and removes open ones — a stage that still
// holds deals is not removed.

type Row = { id: string; key: string | null; name: string | null; kind: Stage["kind"]; probability: number; position: string };
const toStage = (r: Row): Stage => ({ id: String(r.id), key: r.key as StageKey | null, name: r.name, kind: r.kind, probability: r.probability, position: r.position });

export async function listStages(sql: Query): Promise<Stage[]> {
  const rows = await sql<Row[]>`
    select id, key, name, kind, probability, position from stages where archived_at is null
    order by case kind when 'open' then 0 when 'won' then 1 else 2 end, position, id`;
  return rows.map(toStage);
}

export async function stage(sql: Query, stageId: unknown): Promise<Stage> {
  const [row] = await sql<Row[]>`select id, key, name, kind, probability, position from stages where id = ${id(stageId)} and archived_at is null`;
  if (!row) throw new AppError("not_found");
  return toStage(row);
}

export async function endStage(sql: Query, kind: "won" | "lost"): Promise<Stage> {
  const [row] = await sql<Row[]>`select id, key, name, kind, probability, position from stages where kind = ${kind}`;
  if (!row) throw new AppError("not_found");
  return toStage(row);
}

function probability(value: unknown): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 100) throw new AppError("invalid");
  return n;
}

function allowed(actor: Member | null): void {
  if (!can(actor, "stages")) throw new AppError("forbidden");
}

export async function addStage(sql: Sql, actor: Member | null, input: { name: unknown; probability?: unknown }): Promise<Stage> {
  allowed(actor);
  const name = clean(input.name, limits.stageName);
  const p = input.probability === undefined ? 50 : probability(input.probability);
  const open = (await listStages(sql)).filter(s => s.kind === "open");
  if (open.length >= limits.stages) throw new AppError("too_many", { max: limits.stages });
  const position = between(open.at(-1)?.position ?? null, "w");
  const [row] = await sql<Row[]>`insert into stages (name, kind, probability, position) values (${name}, 'open', ${p}, ${position}) returning id, key, name, kind, probability, position`;
  return toStage(row!);
}

// updateStage renames (an empty name gives a default stage its own words
// back) and sets the probability of an open stage (Won is 100, Lost 0).
export async function updateStage(sql: Sql, actor: Member | null, stageId: unknown, input: { name?: unknown; probability?: unknown }): Promise<void> {
  allowed(actor);
  const s = await stage(sql, stageId);
  let name = s.name;
  if (input.name !== undefined) {
    const text = clean(input.name, limits.stageName, { optional: true });
    if (text === "" && !s.key) throw new AppError("empty");
    name = text === "" ? null : text;
  }
  const p = input.probability === undefined || s.kind !== "open" ? s.probability : probability(input.probability);
  await sql`update stages set name = ${name}, probability = ${p} where id = ${s.id}`;
}

// moveStage puts an open stage one place earlier or later.
export async function moveStage(sql: Sql, actor: Member | null, stageId: unknown, direction: "up" | "down"): Promise<void> {
  allowed(actor);
  const s = await stage(sql, stageId);
  if (s.kind !== "open") throw new AppError("invalid");
  const open = (await listStages(sql)).filter(x => x.kind === "open");
  const at = open.findIndex(x => x.id === s.id);
  const target = direction === "up" ? at - 1 : at + 1;
  if (target < 0 || target >= open.length) return;
  const rest = open.filter(x => x.id !== s.id);
  const low = direction === "up" ? rest[target - 1]?.position ?? null : rest[target - 1]?.position ?? null;
  const high = direction === "up" ? rest[target]?.position ?? "w" : rest[target]?.position ?? "w";
  await sql`update stages set position = ${between(low, high)} where id = ${s.id}`;
}

// removeStage removes an open stage that holds no deal; the last open
// stage stays.
export async function removeStage(sql: Sql, actor: Member | null, stageId: unknown): Promise<void> {
  allowed(actor);
  const s = await stage(sql, stageId);
  if (s.kind !== "open") throw new AppError("invalid");
  const open = (await listStages(sql)).filter(x => x.kind === "open");
  if (open.length <= 1) throw new AppError("last_stage");
  const [used] = await sql<{ n: number }[]>`select count(*)::int as n from deals where stage_id = ${s.id}`;
  if ((used?.n ?? 0) > 0) throw new AppError("stage_in_use", { count: used!.n });
  await sql`delete from stages where id = ${s.id}`;
}
