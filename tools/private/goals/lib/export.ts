import type { Member } from "@argentic/chest-sdk/member";
import { toCsv } from "./csv.ts";
import { readCycle } from "./cycles.ts";
import type { Sql } from "./db.ts";
import { formatDate, intl, type Catalogue, type Locale } from "./i18n/index.ts";
import { percent } from "./model.ts";
import { nameOf, people } from "./people.ts";
import { cycleObjectives, type KeyResult } from "./read.ts";
import { teams } from "./teams.ts";

// A cycle as a spreadsheet: one row per key result (an objective without
// any has a row of its own), the headers and words in the reader's
// language. Values are plain numbers a spreadsheet can add up.
export async function cycleCsv(sql: Sql, actor: Member | null, cycleId: unknown, t: Catalogue, locale: Locale, zone: string, now: Date = new Date()): Promise<{ name: string; csv: string }> {
  const cycle = await readCycle(sql, actor, cycleId);
  const objectives = await cycleObjectives(sql, cycle.id, { now, weekStart: now });
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

// fileName makes a cycle's name safe in a download.
export function fileName(name: string, extension: string): string {
  const base = name.normalize("NFD").replace(/\p{Mn}/gu, "").replace(/[^A-Za-z0-9 _-]/gu, "").trim().replace(/\s+/gu, "-").slice(0, 60) || "goals";
  return `${base}.${extension}`;
}
