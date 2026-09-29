import type { Member } from "@argentic/chest-sdk/member";
import { readerOf } from "./access.ts";
import { toCsv } from "./csv.ts";
import { readCycle } from "./cycles.ts";
import type { Sql } from "./db.ts";
import { formatDate, intl, type Catalogue, type Locale } from "./i18n/index.ts";
import { percent } from "./model.ts";
import { nameOf, people } from "./people.ts";
import { checkIns, cycleObjectives, type KeyResult } from "./read.ts";
import { teams } from "./teams.ts";

// A cycle as a spreadsheet: one row per key result (an objective without
// any has a row of its own), the headers and words in the reader's
// language. Values are plain numbers a spreadsheet can add up.
export async function cycleCsv(sql: Sql, actor: Member | null, cycleId: unknown, t: Catalogue, locale: Locale, zone: string, now: Date = new Date()): Promise<{ name: string; csv: string }> {
  const cycle = await readCycle(sql, actor, cycleId);
  const objectives = await cycleObjectives(sql, cycle.id, { now, weekStart: now }, readerOf(actor!));
  const teamNames = new Map((await teams(sql, { archived: true })).map(x => [x.id, x.name]));
  const who = await people(objectives.flatMap(o => [o.owner, ...o.keyResults.map(k => k.owner)]));
  const byId = new Map(objectives.map(o => [o.id, o]));
  const h = t.export.headers;
  const rows: unknown[][] = [[h.level, h.team, h.objective, h.alignedTo, h.objectiveOwner, h.objectiveProgress, h.keyResult, h.keyResultOwner, h.type, h.start, h.target, h.current, h.unit, h.keyResultProgress, h.confidence, h.lastCheckIn, h.score, h.learned]];
  const pct = (p: number | null) => (p === null ? "" : `${percent(p)}`);
  // Numbers as the reader's spreadsheet reads them ("12,5" in French), no
  // thousands separator.
  const numbers = new Intl.NumberFormat(intl(locale), { useGrouping: false, maximumFractionDigits: 4 });
  const n = (v: number) => numbers.format(v);
  for (const o of objectives) {
    const head = [
      t.levels[o.level],
      o.teamId ? teamNames.get(o.teamId) ?? "" : "",
      o.title,
      o.parentId ? byId.get(o.parentId)?.title ?? "" : "",
      nameOf(who.get(o.owner), locale),
      pct(o.progress),
    ];
    const tail = [o.score === null ? "" : `${percent(o.score)}`, o.learned];
    const line = (k: KeyResult | null) => k
      ? [
          k.title,
          nameOf(who.get(k.owner), locale),
          t.kinds[k.kind],
          k.kind === "milestone" ? "" : n(k.start),
          k.kind === "milestone" ? "" : n(k.target),
          k.kind === "milestone" ? (k.current >= 1 ? t.export.done : t.export.notDone) : n(k.current),
          k.kind === "money" ? k.currency ?? "" : k.kind === "percent" ? "%" : k.unit,
          pct(k.progress),
          k.confidence ? t.confidence[k.confidence] : "",
          k.lastCheckIn ? formatDate(k.lastCheckIn, locale, zone, { year: "numeric", month: "2-digit", day: "2-digit" }) : "",
        ]
      : ["", "", "", "", "", "", "", "", "", ""];
    if (o.keyResults.length === 0) rows.push([...head, ...line(null), ...tail]);
    for (const k of o.keyResults) rows.push([...head, ...line(k), ...tail]);
  }
  return { name: cycle.name, csv: toCsv(rows, t.export.separator) };
}

// Every check-in of a cycle, one row each, oldest first: the trend a
// company keeps when it leaves (the cycle's CSV has only the values now).
export async function checkInsCsv(sql: Sql, actor: Member | null, cycleId: unknown, t: Catalogue, locale: Locale, zone: string, now: Date = new Date()): Promise<{ name: string; csv: string }> {
  const cycle = await readCycle(sql, actor, cycleId);
  const objectives = await cycleObjectives(sql, cycle.id, { now, weekStart: now }, readerOf(actor!));
  const krs = objectives.flatMap(o => o.keyResults.map(k => ({ o, k })));
  const history = await checkIns(sql, krs.map(x => x.k.id), 1000);
  const who = await people([...history.values()].flat().map(c => c.author));
  const h = t.export.checkInHeaders;
  const rows: unknown[][] = [[h.date, h.objective, h.keyResult, h.value, h.unit, h.confidence, h.note, h.by]];
  const numbers = new Intl.NumberFormat(intl(locale), { useGrouping: false, maximumFractionDigits: 4 });
  const all = krs.flatMap(({ o, k }) => (history.get(k.id) ?? []).map(c => ({ o, k, c }))).sort((a, b) => a.c.at.localeCompare(b.c.at) || Number(a.c.id) - Number(b.c.id));
  for (const { o, k, c } of all) {
    rows.push([
      formatDate(c.at, locale, zone, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }),
      o.title,
      k.title,
      k.kind === "milestone" ? (c.value >= 1 ? t.export.done : t.export.notDone) : numbers.format(c.value),
      k.kind === "money" ? k.currency ?? "" : k.kind === "percent" ? "%" : k.unit,
      t.confidence[c.confidence],
      c.note,
      nameOf(who.get(c.author), locale),
    ]);
  }
  return { name: `${cycle.name} ${t.export.checkInsFile}`, csv: toCsv(rows, t.export.separator) };
}

// fileName makes a cycle's name safe in a download.
export function fileName(name: string, extension: string): string {
  const base = name.normalize("NFD").replace(/\p{Mn}/gu, "").replace(/[^A-Za-z0-9 _-]/gu, "").trim().replace(/\s+/gu, "-").slice(0, 60) || "goals";
  return `${base}.${extension}`;
}
