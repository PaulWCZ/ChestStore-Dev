import type { Member } from "@argentic/chest-sdk/member";
import { can, seesJourney, ticks } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { addDays, clean, day, id, isItemRole, isKind, limits, memberId, offset, type ItemRole, type Kind } from "./model.ts";
import { today } from "./zone.ts";
import { present } from "./people.ts";
import { sameName, samePhrase } from "./examples.ts";

// Checklists: templates HR writes once ("Office newcomer", "Leaving"), and
// the onboardings and offboardings started from them for one person — a
// copy of the template's items, each given to someone, due on a day counted
// from the start date (or the last day).

// Templates.
// phrase: the key of an example step's words (lib/examples.ts), shown in
// each reader's language until HR rewords it.
export type TemplateItem = { id: string; text: string; phrase: string | null; role: ItemRole; memberId: string | null; offset: number };
export type Template = { id: string; kind: Kind; name: string; phrase: Kind | null; archived: boolean; items: TemplateItem[] };

// first is the one row a count or an aggregate always answers.
function first<T>(rows: readonly T[]): T {
  return rows[0]!;
}

function manager(actor: Member | null): Member {
  if (!actor || !can(actor, "checklists.manage")) throw new AppError("forbidden");
  return actor;
}

type TemplateRow = { id: string; kind: Kind; name: string; phrase: Kind | null; archived_at: Date | null };
type TemplateItemRow = { id: string; template_id: string; text: string; phrase: string | null; role: ItemRole; member_id: string | null; offset_days: number };
const toItem = (r: TemplateItemRow): TemplateItem => ({ id: String(r.id), text: r.text, phrase: r.phrase, role: r.role, memberId: r.member_id, offset: r.offset_days });

export async function listTemplates(sql: Query, actor: Member | null, options: { archived?: boolean } = {}): Promise<Template[]> {
  manager(actor);
  const rows = await sql<TemplateRow[]>`
    select id, kind, name, phrase, archived_at from templates
    where (archived_at is null) = ${!options.archived}
    order by kind, lower(name), id`;
  if (rows.length === 0) return [];
  const items = await sql<TemplateItemRow[]>`
    select id, template_id, text, phrase, role, member_id, offset_days from template_items
    where template_id in ${sql(rows.map(r => r.id))} order by offset_days, position, id`;
  return rows.map(r => ({
    id: String(r.id), kind: r.kind, name: r.name, phrase: r.phrase, archived: r.archived_at !== null,
    items: items.filter(i => String(i.template_id) === String(r.id)).map(toItem),
  }));
}

export async function template(sql: Query, actor: Member | null, templateId: unknown): Promise<Template> {
  manager(actor);
  const [row] = await sql<TemplateRow[]>`select id, kind, name, phrase, archived_at from templates where id = ${id(templateId)}`;
  if (!row) throw new AppError("not_found");
  const items = await sql<TemplateItemRow[]>`select id, template_id, text, phrase, role, member_id, offset_days from template_items where template_id = ${row.id} order by offset_days, position, id`;
  return { id: String(row.id), kind: row.kind, name: row.name, phrase: row.phrase, archived: row.archived_at !== null, items: items.map(toItem) };
}

export async function createTemplate(sql: Sql, actor: Member | null, input: { kind?: unknown; name?: unknown }): Promise<{ id: string }> {
  const who = manager(actor);
  if (!isKind(input?.kind)) throw new AppError("invalid");
  const name = clean(input.name, limits.templateName);
  const [c] = await sql<{ count: number }[]>`select count(*)::int as count from templates where archived_at is null`;
  if (c!.count >= limits.templates) throw new AppError("too_many", { max: limits.templates });
  const [row] = await sql<{ id: string }[]>`insert into templates (kind, name, created_by) values (${input.kind}, ${name}, ${who.id}) returning id`;
  return { id: String(row!.id) };
}

export async function renameTemplate(sql: Sql, actor: Member | null, templateId: unknown, name: unknown): Promise<void> {
  manager(actor);
  const text = clean(name, limits.templateName);
  // Saved as an example's own name (in any language): it keeps speaking
  // each reader's language; reworded, it is HR's.
  const [row] = await sql<{ kind: Kind; phrase: Kind | null }[]>`select kind, phrase from templates where id = ${id(templateId)}`;
  if (!row) throw new AppError("not_found");
  const phrase = row.phrase && sameName(row.kind, text) ? row.phrase : null;
  const done = await sql`update templates set name = ${text}, phrase = ${phrase} where id = ${id(templateId)}`;
  if (done.count === 0) throw new AppError("not_found");
}

// Archived, not deleted: a click is undone. Checklists already started keep
// their items.
export async function archiveTemplate(sql: Sql, actor: Member | null, templateId: unknown, archived: boolean): Promise<void> {
  manager(actor);
  const done = await sql`update templates set archived_at = ${archived ? new Date() : null} where id = ${id(templateId)}`;
  if (done.count === 0) throw new AppError("not_found");
}

type ItemInput = { text?: unknown; role?: unknown; memberId?: unknown; offset?: unknown };

async function itemFields(input: ItemInput): Promise<{ text: string; role: ItemRole; memberId: string | null; offset: number }> {
  if (!input || typeof input !== "object") throw new AppError("invalid");
  const text = clean(input.text, limits.itemText);
  if (!isItemRole(input.role)) throw new AppError("invalid");
  const who = input.role === "member" ? memberId(input.memberId) : null;
  if (who && !(await present([who])).has(who)) throw new AppError("not_member");
  return { text, role: input.role, memberId: who, offset: offset(input.offset ?? 0) };
}

export async function addTemplateItem(sql: Sql, actor: Member | null, templateId: unknown, input: ItemInput): Promise<TemplateItem> {
  manager(actor);
  const t = id(templateId);
  const fields = await itemFields(input);
  return sql.begin(async tx => {
    const [owner] = await tx`select id from templates where id = ${t} for update`;
    if (!owner) throw new AppError("not_found");
    const { count, last } = first(await tx<{ count: number; last: number }[]>`select count(*)::int as count, coalesce(max(position), 0)::int as last from template_items where template_id = ${t}`);
    if (count >= limits.itemsPerTemplate) throw new AppError("too_many", { max: limits.itemsPerTemplate });
    const [row] = await tx<TemplateItemRow[]>`
      insert into template_items (template_id, position, text, role, member_id, offset_days)
      values (${t}, ${last + 1}, ${fields.text}, ${fields.role}, ${fields.memberId}, ${fields.offset})
      returning id, template_id, text, phrase, role, member_id, offset_days`;
    return toItem(row!);
  });
}

export async function updateTemplateItem(sql: Sql, actor: Member | null, itemId: unknown, input: ItemInput): Promise<TemplateItem> {
  manager(actor);
  const fields = await itemFields(input);
  const key = id(itemId);
  // Reworded, an example step keeps HR's words in every language; saved
  // with its own words (in any language), it keeps its phrase.
  const [current] = await sql<{ text: string; phrase: string | null }[]>`select text, phrase from template_items where id = ${key}`;
  if (!current) throw new AppError("not_found");
  const phrase = current.text === fields.text || samePhrase(current.phrase, fields.text) ? current.phrase : null;
  const text = phrase ? current.text : fields.text;
  const [row] = await sql<TemplateItemRow[]>`
    update template_items set text = ${text}, phrase = ${phrase}, role = ${fields.role}, member_id = ${fields.memberId}, offset_days = ${fields.offset}
    where id = ${key} returning id, template_id, text, phrase, role, member_id, offset_days`;
  if (!row) throw new AppError("not_found");
  return toItem(row);
}

export async function removeTemplateItem(sql: Sql, actor: Member | null, itemId: unknown): Promise<TemplateItem> {
  manager(actor);
  const [row] = await sql<TemplateItemRow[]>`delete from template_items where id = ${id(itemId)} returning id, template_id, text, phrase, role, member_id, offset_days`;
  if (!row) throw new AppError("not_found");
  return toItem(row);
}

// The example templates, in the words of the language HR reads: one click
// on an empty page gives something real to start from.
type ExampleItem = { text: string; phrase: string; role: ItemRole; offset: number };
export type Examples = { onboarding: { name: string; items: readonly ExampleItem[] }; offboarding: { name: string; items: readonly ExampleItem[] } };

export async function addExamples(sql: Sql, actor: Member | null, examples: Examples): Promise<string[]> {
  const who = manager(actor);
  return sql.begin(async tx => {
    const ids: string[] = [];
    for (const kind of ["onboarding", "offboarding"] as const) {
      const e = examples[kind];
      const [row] = await tx<{ id: string }[]>`insert into templates (kind, name, phrase, created_by) values (${kind}, ${e.name}, ${kind}, ${who.id}) returning id`;
      let position = 0;
      for (const item of e.items) {
        await tx`insert into template_items (template_id, position, text, phrase, role, offset_days) values (${row!.id}, ${++position}, ${item.text}, ${item.phrase}, ${item.role}, ${item.offset})`;
      }
      ids.push(String(row!.id));
    }
    return ids;
  });
}

// Checklists started for one person.
export type JourneyItem = { id: string; text: string; phrase: string | null; role: ItemRole; assignee: string | null; due: string; done: boolean; doneAt: string | null; doneBy: string | null };
export type Journey = {
  id: string; kind: Kind;
  // The member it is about; null while it is about an arrival told by
  // another tool (arrivalId, arrivalName) not linked to a member yet.
  personId: string | null; arrivalId: string | null; arrivalName: string | null;
  name: string; phrase: Kind | null; anchor: string; createdBy: string; createdAt: string;
  stopped: boolean; completedAt: string | null; managerId: string | null; items: JourneyItem[];
};
export type JourneySummary = Omit<Journey, "items"> & { total: number; done: number; next: string | null; late: number };

type JourneyRow = { id: string; kind: Kind; person_id: string | null; arrival_id: string | null; arrival_name: string | null; name: string; phrase: Kind | null; anchor: string; created_by: string; created_at: Date; stopped_at: Date | null; completed_at: Date | null; manager_id: string | null };
type ItemRow = { id: string; journey_id: string; text: string; phrase: string | null; role: ItemRole; assignee: string | null; due_on: string; done_at: Date | null; done_by: string | null };
// A checklist's manager is the person's (or, for an arrival, the one HR
// chose when starting it).
const journeyColumns = "j.id, j.kind, j.person_id, j.arrival_id, a.name as arrival_name, j.name, j.phrase, to_char(j.anchor, 'YYYY-MM-DD') as anchor, j.created_by, j.created_at, j.stopped_at, j.completed_at, coalesce(p.manager_id, a.manager_id) as manager_id";
const journeyFrom = "journeys j left join profiles p on p.member_id = j.person_id left join arrivals a on a.id = j.arrival_id";
const toJourney = (r: JourneyRow) => ({
  id: String(r.id), kind: r.kind, personId: r.person_id, arrivalId: r.arrival_id === null ? null : String(r.arrival_id), arrivalName: r.arrival_name, name: r.name, phrase: r.phrase, anchor: r.anchor, createdBy: r.created_by, createdAt: r.created_at.toISOString(),
  stopped: r.stopped_at !== null, completedAt: r.completed_at?.toISOString() ?? null, managerId: r.manager_id,
});
const toJourneyItem = (r: ItemRow): JourneyItem => ({ id: String(r.id), text: r.text, phrase: r.phrase, role: r.role, assignee: r.assignee, due: r.due_on, done: r.done_at !== null, doneAt: r.done_at?.toISOString() ?? null, doneBy: r.done_by });

async function itemsOf(sql: Query, journeyIds: string[]): Promise<ItemRow[]> {
  if (journeyIds.length === 0) return [];
  return sql<ItemRow[]>`
    select id, journey_id, text, phrase, role, assignee, to_char(due_on, 'YYYY-MM-DD') as due_on, done_at, done_by from journey_items
    where journey_id in ${sql(journeyIds)} and removed_at is null order by due_on, position, id`;
}

// Starting a checklist: the template's items are copied, each given to
// whom its role names now — the person, their manager, whoever starts it
// (HR), or the member named. A manager or a named member who is not here
// (none yet, or gone) leaves the step to HR, never to nobody.
export type Started = { id: string; personId: string | null; kind: Kind; assignees: Map<string, string[]> };

export async function startJourney(sql: Sql, actor: Member | null, input: { personId?: unknown; arrivalId?: unknown; managerId?: unknown; templateId?: unknown; anchor?: unknown }): Promise<Started> {
  const who = manager(actor);
  if (!input || typeof input !== "object") throw new AppError("invalid");
  // For a member, or for an arrival told by another tool (not a member yet:
  // their own steps wait until the arrival is linked to them).
  const arrival = input.arrivalId !== undefined && input.arrivalId !== null && input.arrivalId !== "" ? id(input.arrivalId) : null;
  const person = arrival ? null : memberId(input.personId);
  const anchor = day(input.anchor)!;
  const t = await template(sql, who, input.templateId);
  if (t.archived) throw new AppError("not_found");
  if (t.items.length === 0) throw new AppError("empty");
  let managerId: string | null = null;
  if (arrival) {
    const [a] = await sql<{ status: string; manager_id: string | null }[]>`select status, manager_id from arrivals where id = ${arrival}`;
    if (!a || a.status !== "expected") throw new AppError("not_found");
    managerId = input.managerId === undefined ? a.manager_id : input.managerId === null || input.managerId === "" ? null : memberId(input.managerId);
  } else {
    const [managerRow] = await sql<{ manager_id: string | null }[]>`select manager_id from profiles where member_id = ${person}`;
    managerId = managerRow?.manager_id ?? null;
  }
  const named = t.items.flatMap(i => (i.memberId ? [i.memberId] : []));
  const here = await present([...(person ? [person] : []), ...named, ...(managerId ? [managerId] : [])]);
  if (person && !here.has(person)) throw new AppError("not_member");
  if (arrival && managerId && !here.has(managerId)) throw new AppError("not_member");
  const assigneeOf = (item: TemplateItem): string | null => {
    if (item.role === "person") return person;
    if (item.role === "hr") return who.id;
    if (item.role === "manager") return managerId && here.has(managerId) ? managerId : who.id;
    return item.memberId && here.has(item.memberId) ? item.memberId : who.id;
  };
  return sql.begin(async tx => {
    if (arrival) await tx`update arrivals set manager_id = ${managerId} where id = ${arrival}`;
    const [row] = await tx<{ id: string }[]>`
      insert into journeys (kind, person_id, arrival_id, template_id, name, phrase, anchor, created_by)
      values (${t.kind}, ${person}, ${arrival}, ${t.id}, ${t.name}, ${t.phrase}, ${anchor}, ${who.id}) returning id`;
    const journeyId = String(row!.id);
    const assignees = new Map<string, string[]>();
    let position = 0;
    for (const item of t.items) {
      const assignee = assigneeOf(item);
      await tx`
        insert into journey_items (journey_id, position, text, phrase, role, assignee, due_on)
        values (${journeyId}, ${++position}, ${item.text}, ${item.phrase}, ${item.role}, ${assignee}, ${addDays(anchor, item.offset)})`;
      if (assignee) assignees.set(assignee, [...(assignees.get(assignee) ?? []), item.text]);
    }
    return { id: journeyId, personId: person, kind: t.kind, assignees };
  });
}

// Whom a checklist is about, for the bell: a member, or an arrival's name.
export async function about(sql: Query, journeyId: string): Promise<{ personId: string | null; arrivalName: string | null; kind: Kind; createdBy: string }> {
  const [r] = await sql<{ person_id: string | null; arrival_name: string | null; kind: Kind; created_by: string }[]>`
    select j.person_id, a.name as arrival_name, j.kind, j.created_by from journeys j left join arrivals a on a.id = j.arrival_id where j.id = ${journeyId}`;
  if (!r) throw new AppError("not_found");
  return { personId: r.person_id, arrivalName: r.arrival_name, kind: r.kind, createdBy: r.created_by };
}

async function loadJourney(sql: Query, journeyId: string): Promise<Journey | null> {
  const [row] = await sql.unsafe<JourneyRow[]>(`select ${journeyColumns} from ${journeyFrom} where j.id = $1`, [journeyId]);
  if (!row) return null;
  return { ...toJourney(row), items: (await itemsOf(sql, [journeyId])).map(toJourneyItem) };
}

export async function journey(sql: Query, actor: Member | null, journeyId: unknown): Promise<Journey> {
  const j = await loadJourney(sql, id(journeyId));
  if (!j || !seesJourney(actor, { personId: j.personId, managerId: j.managerId, assignees: j.items.map(i => i.assignee ?? "") })) throw new AppError("not_found");
  return j;
}

function summarize(j: Omit<Journey, "items">, items: ItemRow[], now: string): JourneySummary {
  const open = items.filter(i => i.done_at === null);
  return { ...j, total: items.length, done: items.length - open.length, next: open[0]?.due_on ?? null, late: open.filter(i => i.due_on < now).length };
}

// HR's list: every checklist running (stopped ones too, to undo), and those
// completed in the last 60 days.
export async function listJourneys(sql: Query, actor: Member | null, now = today()): Promise<JourneySummary[]> {
  manager(actor);
  const rows = await sql.unsafe<JourneyRow[]>(`
    select ${journeyColumns} from ${journeyFrom}
    where j.completed_at is null or j.completed_at > now() - interval '60 days'
    order by j.completed_at is not null, j.stopped_at is not null, j.anchor, j.id limit 500`);
  const items = await itemsOf(sql, rows.map(r => String(r.id)));
  return rows.map(r => summarize(toJourney(r), items.filter(i => String(i.journey_id) === String(r.id)), now));
}

// The checklists about this person (their own welcome), running.
export async function journeysAbout(sql: Query, actor: Member | null, personId: string, now = today()): Promise<JourneySummary[]> {
  if (!actor) throw new AppError("forbidden");
  const rows = await sql.unsafe<JourneyRow[]>(`
    select ${journeyColumns} from ${journeyFrom}
    where j.person_id = $1 and j.stopped_at is null and (j.completed_at is null or j.completed_at > now() - interval '14 days')
    order by j.anchor, j.id`, [personId]);
  const visible = [];
  const items = await itemsOf(sql, rows.map(r => String(r.id)));
  for (const r of rows) {
    const mine = items.filter(i => String(i.journey_id) === String(r.id));
    if (seesJourney(actor, { personId: r.person_id, managerId: r.manager_id, assignees: mine.map(i => i.assignee ?? "") })) visible.push(summarize(toJourney(r), mine, now));
  }
  return visible;
}

// My to-dos: the open items given to me in running checklists, and what I
// ticked in the last 7 days (to undo), grouped by checklist.
export type MyGroup = { journey: Omit<Journey, "items">; items: JourneyItem[] };

export async function myItems(sql: Query, actor: Member | null): Promise<MyGroup[]> {
  if (!actor || !can(actor, "directory.read")) throw new AppError("forbidden");
  const rows = await sql<(ItemRow & { j_id: string })[]>`
    select i.id, i.journey_id, i.text, i.phrase, i.role, i.assignee, to_char(i.due_on, 'YYYY-MM-DD') as due_on, i.done_at, i.done_by
    from journey_items i join journeys j on j.id = i.journey_id
    where i.assignee = ${actor.id} and i.removed_at is null and j.stopped_at is null
      and (i.done_at is null or i.done_at > now() - interval '7 days')
    order by i.due_on, i.position, i.id limit 500`;
  const ids = [...new Set(rows.map(r => String(r.journey_id)))];
  if (ids.length === 0) return [];
  const journeys = await sql.unsafe<JourneyRow[]>(`select ${journeyColumns} from ${journeyFrom} where j.id = any($1::bigint[])`, [ids]);
  const byId = new Map(journeys.map(j => [String(j.id), toJourney(j)]));
  return ids.flatMap(jid => {
    const j = byId.get(jid);
    return j ? [{ journey: j, items: rows.filter(r => String(r.journey_id) === jid).map(toJourneyItem) }] : [];
  });
}

// The number on each person's tile: their open items in running checklists.
export async function openCounts(sql: Query, ids: string[]): Promise<Map<string, number>> {
  const counts = new Map(ids.map(i => [i, 0]));
  if (ids.length === 0) return counts;
  const rows = await sql<{ assignee: string; n: number }[]>`
    select i.assignee, count(*)::int as n from journey_items i join journeys j on j.id = i.journey_id
    where i.assignee in ${sql(ids)} and i.done_at is null and i.removed_at is null and j.stopped_at is null
    group by i.assignee`;
  for (const r of rows) counts.set(r.assignee, r.n);
  return counts;
}

// Ticking an item (or unticking it). Says what changed for the bell: the
// item's person has nothing left in this checklist, the checklist is
// complete (or no longer).
export type Ticked = { journeyId: string; personId: string | null; kind: Kind; createdBy: string; assignee: string | null; assigneeDone: boolean; completed: boolean; reopened: boolean };

export async function tick(sql: Sql, actor: Member | null, itemId: unknown, done: unknown): Promise<Ticked> {
  if (typeof done !== "boolean") throw new AppError("invalid");
  const itemKey = id(itemId);
  return sql.begin(async tx => {
    const [row] = await tx<{ journey_id: string; assignee: string | null; done_at: Date | null }[]>`
      select i.journey_id, i.assignee, i.done_at from journey_items i join journeys j on j.id = i.journey_id
      where i.id = ${itemKey} and i.removed_at is null and j.stopped_at is null for update of i, j`;
    if (!row) throw new AppError("not_found");
    const j = (await loadJourney(tx, String(row.journey_id)))!;
    if (!seesJourney(actor, { personId: j.personId, managerId: j.managerId, assignees: j.items.map(i => i.assignee ?? "") })) throw new AppError("not_found");
    if (!ticks(actor, row)) throw new AppError("forbidden");
    if ((row.done_at !== null) !== done) {
      await tx`update journey_items set done_at = ${done ? new Date() : null}, done_by = ${done ? actor!.id : null} where id = ${itemKey}`;
    }
    return settle(tx, String(row.journey_id), row.assignee);
  });
}

// settle marks a checklist complete when its last item is done (and not
// when one is unticked), and says who has nothing left.
async function settle(tx: Query, journeyId: string, assignee: string | null): Promise<Ticked> {
  const [j] = await tx<{ person_id: string | null; kind: Kind; created_by: string; completed_at: Date | null }[]>`select person_id, kind, created_by, completed_at from journeys where id = ${journeyId}`;
  const { open, mine, total } = first(await tx<{ open: number; mine: number; total: number }[]>`
    select count(*) filter (where done_at is null)::int as open, count(*) filter (where done_at is null and assignee = ${assignee ?? ""})::int as mine, count(*)::int as total
    from journey_items where journey_id = ${journeyId} and removed_at is null`);
  const complete = open === 0 && total > 0;
  let completed = false, reopened = false;
  if (complete && j!.completed_at === null) {
    await tx`update journeys set completed_at = now() where id = ${journeyId}`;
    completed = true;
  } else if (!complete && j!.completed_at !== null) {
    await tx`update journeys set completed_at = null where id = ${journeyId}`;
    reopened = true;
  }
  return { journeyId, personId: j!.person_id, kind: j!.kind, createdBy: j!.created_by, assignee, assigneeDone: mine === 0, completed, reopened };
}

// HR adds an item to a running checklist, gives one to someone else, moves
// its day, rewords it, removes it (with undo), stops the whole checklist
// (with undo) or deletes a stopped one.
export async function addJourneyItem(sql: Sql, actor: Member | null, journeyId: unknown, input: { text?: unknown; assignee?: unknown; due?: unknown }): Promise<{ item: JourneyItem; ticked: Ticked }> {
  manager(actor);
  const jid = id(journeyId);
  const text = clean(input?.text, limits.itemText);
  const assignee = input?.assignee === null || input?.assignee === "" || input?.assignee === undefined ? null : memberId(input.assignee);
  if (assignee && !(await present([assignee])).has(assignee)) throw new AppError("not_member");
  return sql.begin(async tx => {
    const [j] = await tx<{ anchor: string }[]>`select to_char(anchor, 'YYYY-MM-DD') as anchor from journeys where id = ${jid} and stopped_at is null for update`;
    if (!j) throw new AppError("not_found");
    const due = input?.due === undefined || input.due === "" ? j.anchor : day(input.due)!;
    const { count, last } = first(await tx<{ count: number; last: number }[]>`select count(*)::int as count, coalesce(max(position), 0)::int as last from journey_items where journey_id = ${jid} and removed_at is null`);
    if (count >= limits.itemsPerJourney) throw new AppError("too_many", { max: limits.itemsPerJourney });
    const [row] = await tx<ItemRow[]>`
      insert into journey_items (journey_id, position, text, role, assignee, due_on)
      values (${jid}, ${last + 1}, ${text}, ${assignee ? "member" : "hr"}, ${assignee}, ${due})
      returning id, journey_id, text, phrase, role, assignee, to_char(due_on, 'YYYY-MM-DD') as due_on, done_at, done_by`;
    return { item: toJourneyItem(row!), ticked: await settle(tx, jid, assignee) };
  });
}

export async function updateJourneyItem(sql: Sql, actor: Member | null, itemId: unknown, input: { text?: unknown; assignee?: unknown; due?: unknown }): Promise<{ item: JourneyItem; before: string | null; journeyId: string }> {
  manager(actor);
  const key = id(itemId);
  if (!input || typeof input !== "object") throw new AppError("invalid");
  const text = "text" in input ? clean(input.text, limits.itemText) : undefined;
  const due = "due" in input ? day(input.due)! : undefined;
  let assignee: string | null | undefined;
  if ("assignee" in input) {
    assignee = input.assignee === null || input.assignee === "" ? null : memberId(input.assignee);
    if (assignee && !(await present([assignee])).has(assignee)) throw new AppError("not_member");
  }
  return sql.begin(async tx => {
    const [current] = await tx<{ assignee: string | null; journey_id: string; role: ItemRole; text: string; phrase: string | null }[]>`
      select i.assignee, i.journey_id, i.role, i.text, i.phrase from journey_items i join journeys j on j.id = i.journey_id
      where i.id = ${key} and i.removed_at is null and j.stopped_at is null for update of i`;
    if (!current) throw new AppError("not_found");
    const nextAssignee = assignee === undefined ? current.assignee : assignee;
    // Given to someone by name, the item's role says so; its role is kept
    // while it stays with the same person.
    const role: ItemRole = assignee === undefined || assignee === current.assignee ? current.role : assignee === null ? "hr" : "member";
    // Reworded, a step keeps HR's words in every language.
    const keep = text === undefined || text === current.text || samePhrase(current.phrase, text);
    const [row] = await tx<ItemRow[]>`
      update journey_items set
        text = ${keep ? current.text : text!},
        phrase = ${keep ? current.phrase : null},
        due_on = coalesce(${due ?? null}::date, due_on),
        assignee = ${nextAssignee},
        role = ${role}
      where id = ${key}
      returning id, journey_id, text, phrase, role, assignee, to_char(due_on, 'YYYY-MM-DD') as due_on, done_at, done_by`;
    return { item: toJourneyItem(row!), before: current.assignee, journeyId: String(current.journey_id) };
  });
}

export async function removeJourneyItem(sql: Sql, actor: Member | null, itemId: unknown, removed: boolean): Promise<Ticked> {
  manager(actor);
  const key = id(itemId);
  return sql.begin(async tx => {
    const [row] = await tx<{ journey_id: string; assignee: string | null }[]>`
      update journey_items set removed_at = ${removed ? new Date() : null}
      where id = ${key} and (removed_at is null) = ${removed} returning journey_id, assignee`;
    if (!row) throw new AppError("not_found");
    return settle(tx, String(row.journey_id), row.assignee);
  });
}

export async function stopJourney(sql: Sql, actor: Member | null, journeyId: unknown, stopped: boolean): Promise<{ assignees: string[] }> {
  manager(actor);
  const jid = id(journeyId);
  const done = await sql`update journeys set stopped_at = ${stopped ? new Date() : null} where id = ${jid} and (stopped_at is null) = ${stopped}`;
  if (done.count === 0) throw new AppError("not_found");
  const rows = await sql<{ assignee: string }[]>`select distinct assignee from journey_items where journey_id = ${jid} and assignee like 'mbr_%'`;
  return { assignees: rows.map(r => r.assignee) };
}

export async function deleteJourney(sql: Sql, actor: Member | null, journeyId: unknown): Promise<{ assignees: string[] }> {
  manager(actor);
  const jid = id(journeyId);
  const rows = await sql<{ assignee: string }[]>`select distinct assignee from journey_items where journey_id = ${jid} and assignee like 'mbr_%'`;
  const done = await sql`delete from journeys where id = ${jid} and stopped_at is not null`;
  if (done.count === 0) throw new AppError("not_found");
  return { assignees: rows.map(r => r.assignee) };
}

// The open items given to each of these people in one checklist (for the
// bell's "2 to-dos for you").
export async function openIn(sql: Query, journeyId: string, assignee: string): Promise<{ text: string; phrase: string | null }[]> {
  return sql<{ text: string; phrase: string | null }[]>`
    select text, phrase from journey_items where journey_id = ${journeyId} and assignee = ${assignee} and done_at is null and removed_at is null
    order by due_on, position`;
}

// A leaving checklist's step ticked by another tool: "Return the laptop,
// badge and keys" once Equipment says everything is back (lib/returns.ts).
// Every open step of that phrase in the running leaving checklists about
// this person, whoever it is given to; `by` names the tool ("equipment").
export async function tickAbout(sql: Sql, person: string, phrase: string, by: string): Promise<Ticked[]> {
  return sql.begin(async tx => {
    const rows = await tx<{ journey_id: string; assignee: string | null }[]>`
      update journey_items i set done_at = now(), done_by = ${by}
      from journeys j where j.id = i.journey_id and j.stopped_at is null and j.kind = 'offboarding' and j.person_id = ${person}
        and i.phrase = ${phrase} and i.done_at is null and i.removed_at is null
      returning i.journey_id, i.assignee`;
    const ticked: Ticked[] = [];
    for (const r of rows) ticked.push(await settle(tx, String(r.journey_id), r.assignee));
    return ticked;
  });
}

// A step that ticks itself: the newcomer's "fill in your profile" once they
// did. Says what changed, for the bell, like a tick.
export async function autoTick(sql: Sql, member: string, phrase: string): Promise<Ticked[]> {
  return sql.begin(async tx => {
    const rows = await tx<{ journey_id: string }[]>`
      update journey_items i set done_at = now(), done_by = ${member}
      from journeys j where j.id = i.journey_id and j.stopped_at is null
        and i.assignee = ${member} and i.phrase = ${phrase} and i.done_at is null and i.removed_at is null
      returning i.journey_id`;
    const ticked: Ticked[] = [];
    for (const jid of new Set(rows.map(r => String(r.journey_id)))) ticked.push(await settle(tx, jid, member));
    return ticked;
  });
}
