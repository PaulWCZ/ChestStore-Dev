import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { clean, id, isPriority, limits, tagName, type Priority } from "./model.ts";

// Rules on arrival: "when a new request contains 'invoice', tag it Invoice
// and give it to Sofia"; "when it comes from @bigclient.com, make it
// urgent". An administrator writes them; each new request (form, email)
// goes through all of them, in order: tags add up, the first rule that sets
// a priority or a person wins. A ticket someone already has keeps them.

export type Rule = { id: string; field: "text" | "from"; value: string; tag: string | null; priority: Priority | null; assignee: string | null };
export const maxRules = 30;

type RuleDb = { id: string; field: Rule["field"]; value: string; tag: string | null; priority: Priority | null; assignee: string | null };
const toRule = (r: RuleDb): Rule => ({ id: String(r.id), field: r.field, value: r.value, tag: r.tag, priority: r.priority, assignee: r.assignee });

export async function listRules(sql: Query, actor: Member | null): Promise<Rule[]> {
  if (!can(actor, "tickets.read")) throw new AppError("forbidden");
  return allRules(sql);
}
// What the arrival of a request reads (no member: the Chest or a visitor
// brought it).
export async function allRules(sql: Query): Promise<Rule[]> {
  return (await sql<RuleDb[]>`select id, field, value, tag, priority, assignee from rules order by id`).map(toRule);
}

// A sender to match: an address ("anna@client.fr") or a domain
// ("client.fr", "@client.fr"), lower case.
function sender(value: unknown): string {
  const text = clean(value, 100).toLowerCase().replace(/^@/u, "");
  if (!/^([^\s@<>()[\]\\,;:"]{1,64}@)?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/u.test(text)) throw new AppError("invalid_rule");
  return text;
}

type Checked = { field: Rule["field"]; value: string; tag: string | null; priority: Priority | null; assignee: string | null };
async function checkRule(input: { field: unknown; value: unknown; tag?: unknown; priority?: unknown; assignee?: unknown }, answers: (memberId: string) => Promise<boolean>): Promise<Checked> {
  if (input.field !== "text" && input.field !== "from") throw new AppError("invalid");
  const value = input.field === "from" ? sender(input.value) : clean(input.value, 100);
  const tag = input.tag === undefined || input.tag === null || input.tag === "" ? null : tagName(input.tag);
  const priority = input.priority === undefined || input.priority === null || input.priority === "" ? null : isPriority(input.priority) ? input.priority : null;
  if (input.priority && !priority) throw new AppError("invalid");
  const assignee = typeof input.assignee === "string" && input.assignee !== "" ? input.assignee : null;
  if (assignee !== null && (!/^mbr_[a-z2-7]{26}$/u.test(assignee) || !(await answers(assignee)))) throw new AppError("invalid");
  if (!tag && !priority && !assignee) throw new AppError("rule_empty");
  return { field: input.field, value, tag, priority, assignee };
}

async function roomForOne(sql: Sql): Promise<void> {
  const [count] = await sql<{ n: number }[]>`select count(*)::int as n from rules`;
  if ((count?.n ?? 0) >= maxRules) throw new AppError("too_many", { max: maxRules });
}

// saveRule adds a rule (or changes one): a condition, and at least one of a
// tag, a priority, someone who answers.
export async function saveRule(sql: Sql, actor: Member | null, input: { id?: unknown; field: unknown; value: unknown; tag?: unknown; priority?: unknown; assignee?: unknown }, answers: (memberId: string) => Promise<boolean>): Promise<Rule> {
  if (!actor || !can(actor, "settings")) throw new AppError("forbidden");
  const r = await checkRule(input, answers);
  if (input.id !== undefined && input.id !== null && input.id !== "") {
    const [row] = await sql<RuleDb[]>`update rules set field = ${r.field}, value = ${r.value}, tag = ${r.tag}, priority = ${r.priority}, assignee = ${r.assignee} where id = ${id(input.id)} returning id, field, value, tag, priority, assignee`;
    if (!row) throw new AppError("not_found");
    return toRule(row);
  }
  await roomForOne(sql);
  const [row] = await sql<RuleDb[]>`insert into rules (field, value, tag, priority, assignee, created_by) values (${r.field}, ${r.value}, ${r.tag}, ${r.priority}, ${r.assignee}, ${actor.id}) returning id, field, value, tag, priority, assignee`;
  return toRule(row!);
}

// removeRule deletes a rule, and says what it was (for Undo).
export async function removeRule(sql: Sql, actor: Member | null, ruleId: unknown): Promise<Rule> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  const [row] = await sql<RuleDb[]>`delete from rules where id = ${id(ruleId)} returning id, field, value, tag, priority, assignee`;
  if (!row) throw new AppError("not_found");
  return toRule(row);
}

// restoreRule puts a deleted rule back in its place: rules run in order,
// so it keeps its id (and the order). Its person may have left since: the
// rule comes back without them, or not at all when nothing is left to do.
export async function restoreRule(sql: Sql, actor: Member | null, rule: { id?: unknown; field: unknown; value: unknown; tag?: unknown; priority?: unknown; assignee?: unknown }, answers: (memberId: string) => Promise<boolean>): Promise<Rule> {
  if (!actor || !can(actor, "settings")) throw new AppError("forbidden");
  const ruleId = id(rule.id);
  const assignee = typeof rule.assignee === "string" && rule.assignee !== "" && (await answers(rule.assignee)) ? rule.assignee : null;
  const r = await checkRule({ ...rule, assignee }, answers);
  await roomForOne(sql);
  const [row] = await sql<RuleDb[]>`
    insert into rules (id, field, value, tag, priority, assignee, created_by) overriding system value
    values (${ruleId}, ${r.field}, ${r.value}, ${r.tag}, ${r.priority}, ${r.assignee}, ${actor.id})
    on conflict (id) do nothing
    returning id, field, value, tag, priority, assignee`;
  if (!row) throw new AppError("invalid");
  return toRule(row);
}

// Someone who left answers nothing any more: their rules lose them (and a
// rule left with nothing to do goes).
export async function forget(sql: Query, memberId: string): Promise<void> {
  await sql`update rules set assignee = null where assignee = ${memberId}`;
  await sql`delete from rules where tag is null and priority is null and assignee is null`;
  await sql`update rules set created_by = 'erased' where created_by = ${memberId}`;
}

// Matching ignores case and accents ("facture" finds "Facturé").
const fold = (s: string) => s.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();

export function matches(rule: Pick<Rule, "field" | "value">, request: { subject: string; body: string; from: string }): boolean {
  if (rule.field === "text") return fold(`${request.subject}\n${request.body}`).includes(fold(rule.value));
  const from = request.from.toLowerCase();
  if (rule.value.includes("@")) return from === rule.value;
  const domain = from.slice(from.lastIndexOf("@") + 1);
  return domain === rule.value || domain.endsWith("." + rule.value);
}

// decide says what the rules do to a new request.
export function decide(rules: Rule[], request: { subject: string; body: string; from: string }): { tags: string[]; priority: Priority | null; assignee: string | null } {
  const out: { tags: string[]; priority: Priority | null; assignee: string | null } = { tags: [], priority: null, assignee: null };
  for (const rule of rules) {
    if (!matches(rule, request)) continue;
    if (rule.tag && !out.tags.some(t => t.toLowerCase() === rule.tag!.toLowerCase()) && out.tags.length < limits.tagsPerTicket) out.tags.push(rule.tag);
    out.priority ??= rule.priority;
    out.assignee ??= rule.assignee;
  }
  return out;
}
