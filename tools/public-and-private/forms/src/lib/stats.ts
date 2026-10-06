import type { Query } from "./db.ts";
import { allQuestions, type Definition, type Kind } from "../shared/model.ts";
import { emptyQuestion, type QuestionStats, type Stats } from "../shared/summary.ts";

// What a form's answers say, counted by the database (the summary page,
// an anonymous form's export): never every answer read into the tool's
// memory — a form of 10,000 answers costs a few queries and a few
// kilobytes (test/scale.test.ts). Each query walks the answers' JSON once
// (jsonb_each), for the questions of the kinds it counts; the summary
// (src/shared/summary.ts) turns the counts into bars, averages, NPS…
//
// The same rules as the answers' (src/shared/logic.ts has()): a question
// is answered when its value holds something — a text with a letter, a
// list with an item, a pick with an option or an "Other" text, a matrix
// with a row.

const kindsOf = (versions: Map<number, Definition>) => {
  const kinds = new Map<string, Kind>();
  for (const [, d] of [...versions.entries()].sort((a, b) => b[0] - a[0])) for (const q of allQuestions(d)) if (!kinds.has(q.id)) kinds.set(q.id, q.kind);
  return kinds;
};
const idsOf = (kinds: Map<string, Kind>, wanted: readonly Kind[]) => [...kinds].filter(([, k]) => wanted.includes(k)).map(([id]) => id);

// The answers counted: a form's, not put aside.
const live = (sql: Query, formId: string) => sql`a.form_id = ${formId} and a.deleted_at is null`;
const has = (sql: Query) => sql`(case jsonb_typeof(e.value)
  when 'null' then false
  when 'string' then (e.value #>> '{}') ~ '[^[:space:]]'
  when 'array' then jsonb_array_length(e.value) > 0
  when 'object' then case
    when jsonb_typeof(e.value -> 'ids') = 'array' then jsonb_array_length(e.value -> 'ids') > 0 or coalesce(e.value ->> 'other', '') ~ '[^[:space:]]'
    when jsonb_typeof(e.value -> 'rows') = 'object' then e.value -> 'rows' <> '{}'::jsonb
    else true end
  else true end)`;

export async function answerStats(sql: Query, formId: string, versions: Map<number, Definition>): Promise<Stats> {
  const kinds = kindsOf(versions);
  const pickIds = idsOf(kinds, ["choice", "choices", "dropdown", "picture"]);
  const numberIds = idsOf(kinds, ["rating", "scale"]);
  const rankIds = idsOf(kinds, ["ranking"]);
  const gridIds = idsOf(kinds, ["matrix"]);
  const dateIds = idsOf(kinds, ["date"]);
  const fileIds = idsOf(kinds, ["file"]);
  const textIds = idsOf(kinds, ["short", "long", "email", "phone"]);
  const numeric = sql`case when jsonb_typeof(e.value) = 'number' then (e.value)::text::float8 end`;

  const [total, perQuestion, picks, numbers, ranks, grids, otherTexts, latest] = await Promise.all([
    sql<{ n: number }[]>`select count(*)::int as n from answers a where ${live(sql, formId)}`,
    sql<{ key: string; answered: number; yes: number; no: number; others: number; average: number | null; min: number | null; max: number | null; first: string | null; last: string | null; with_files: number; files: number }[]>`
      select e.key,
        count(*) filter (where ${has(sql)})::int as answered,
        count(*) filter (where e.value = 'true'::jsonb)::int as yes,
        count(*) filter (where e.value = 'false'::jsonb)::int as no,
        count(*) filter (where e.key = any(${pickIds}) and jsonb_typeof(e.value) = 'object' and coalesce(e.value ->> 'other', '') <> '')::int as others,
        avg(${numeric}) as average, min(${numeric}) as min, max(${numeric}) as max,
        min(case when e.key = any(${dateIds}) and jsonb_typeof(e.value) = 'string' then e.value #>> '{}' end collate "C") as first,
        max(case when e.key = any(${dateIds}) and jsonb_typeof(e.value) = 'string' then e.value #>> '{}' end collate "C") as last,
        count(*) filter (where e.key = any(${fileIds}) and jsonb_array_length(jsonb_path_query_array(e.value, 'lax $.file')) > 0)::int as with_files,
        coalesce(sum(case when e.key = any(${fileIds}) then jsonb_array_length(jsonb_path_query_array(e.value, 'lax $.file')) end), 0)::int as files
      from answers a cross join lateral jsonb_each(a.data) e
      where ${live(sql, formId)}
      group by e.key`,
    pickIds.length === 0 ? [] : sql<{ key: string; option: string; n: number }[]>`
      select e.key, o.id as option, count(*)::int as n
      from answers a cross join lateral jsonb_each(a.data) e
        cross join lateral jsonb_array_elements_text(case when jsonb_typeof(e.value) = 'object' and jsonb_typeof(e.value -> 'ids') = 'array' then e.value -> 'ids' else '[]'::jsonb end) o(id)
      where ${live(sql, formId)} and e.key = any(${pickIds})
      group by e.key, o.id`,
    numberIds.length === 0 ? [] : sql<{ key: string; value: string; n: number }[]>`
      select e.key, (e.value)::text as value, count(*)::int as n
      from answers a cross join lateral jsonb_each(a.data) e
      where ${live(sql, formId)} and e.key = any(${numberIds}) and jsonb_typeof(e.value) = 'number'
      group by e.key, (e.value)::text`,
    rankIds.length === 0 ? [] : sql<{ key: string; item: string; sum: number; count: number; firsts: number }[]>`
      select e.key, o.id as item, sum(o.place)::int as sum, count(*)::int as count, count(*) filter (where o.place = 1)::int as firsts
      from answers a cross join lateral jsonb_each(a.data) e
        cross join lateral jsonb_array_elements_text(case when jsonb_typeof(e.value) = 'array' then e.value else '[]'::jsonb end) with ordinality o(id, place)
      where ${live(sql, formId)} and e.key = any(${rankIds})
      group by e.key, o.id`,
    gridIds.length === 0 ? [] : sql<{ key: string; row: string; col: string; n: number }[]>`
      select e.key, r.key as row, r.value as col, count(*)::int as n
      from answers a cross join lateral jsonb_each(a.data) e
        cross join lateral jsonb_each_text(case when jsonb_typeof(e.value -> 'rows') = 'object' then e.value -> 'rows' else '{}'::jsonb end) r
      where ${live(sql, formId)} and e.key = any(${gridIds}) and jsonb_typeof(e.value) = 'object'
      group by e.key, r.key, r.value`,
    pickIds.length === 0 ? [] : sql<{ key: string; text: string }[]>`
      select key, text from (
        select e.key, e.value ->> 'other' as text, row_number() over (partition by e.key order by a.created_at desc nulls last, a.id) as place
        from answers a cross join lateral jsonb_each(a.data) e
        where ${live(sql, formId)} and e.key = any(${pickIds}) and jsonb_typeof(e.value) = 'object' and coalesce(e.value ->> 'other', '') <> ''
      ) x where place <= 50 order by key, place`,
    textIds.length === 0 ? [] : sql<{ key: string; text: string }[]>`
      select key, text from (
        select e.key, e.value #>> '{}' as text, row_number() over (partition by e.key order by a.created_at desc nulls last, a.id) as place
        from answers a cross join lateral jsonb_each(a.data) e
        where ${live(sql, formId)} and e.key = any(${textIds}) and jsonb_typeof(e.value) = 'string' and (e.value #>> '{}') ~ '[^[:space:]]'
      ) x where place <= 5 order by key, place`,
  ]);

  const stats: Stats = { total: total[0]?.n ?? 0, questions: {}, picks: {}, numbers: {}, ranks: {}, grids: {}, otherTexts: {}, latest: {} };
  for (const r of perQuestion) {
    const q: QuestionStats = { ...emptyQuestion, answered: r.answered, yes: r.yes, no: r.no, others: r.others, average: r.average === null ? null : Number(r.average), min: r.min === null ? null : Number(r.min), max: r.max === null ? null : Number(r.max), first: r.first, last: r.last, withFiles: r.with_files, files: r.files };
    stats.questions[r.key] = q;
  }
  for (const r of picks) (stats.picks[r.key] ??= {})[r.option] = r.n;
  for (const r of numbers) (stats.numbers[r.key] ??= {})[String(Number(r.value))] = r.n;
  for (const r of ranks) (stats.ranks[r.key] ??= {})[r.item] = { sum: r.sum, count: r.count, firsts: r.firsts };
  for (const r of grids) ((stats.grids[r.key] ??= {})[r.row] ??= {})[r.col] = r.n;
  for (const r of otherTexts) (stats.otherTexts[r.key] ??= []).push(r.text);
  for (const r of latest) (stats.latest[r.key] ??= []).push(r.text);
  return stats;
}

// An anonymous form's written answers, question by question, each list in
// a random order of its own (so no text is ever shown next to anything
// else its author answered), `cap` of each at most on a page — the
// export (src/lib/export.ts) has them all.
export async function shuffledTexts(sql: Query, formId: string, ids: string[], cap: number): Promise<Map<string, { count: number; texts: string[] }>> {
  const found = new Map<string, { count: number; texts: string[] }>();
  if (ids.length === 0) return found;
  const rows = await sql<{ key: string; text: string; count: number }[]>`
    select key, text, count from (
      select e.key, e.value #>> '{}' as text, count(*) over (partition by e.key)::int as count, row_number() over (partition by e.key order by gen_random_uuid()) as place
      from answers a cross join lateral jsonb_each(a.data) e
      where ${live(sql, formId)} and e.key = any(${ids}) and jsonb_typeof(e.value) = 'string' and (e.value #>> '{}') ~ '[^[:space:]]'
    ) x where place <= ${cap}`;
  for (const r of rows) {
    const entry = found.get(r.key) ?? { count: r.count, texts: [] };
    entry.texts.push(r.text);
    found.set(r.key, entry);
  }
  return found;
}
