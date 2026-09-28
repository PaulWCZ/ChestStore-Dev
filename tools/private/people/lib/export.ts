import { toCsv } from "./csv.ts";
import type { Entry } from "./directory.ts";

// The directory as a spreadsheet: one row per person, headers in the
// reader's language — the same columns the import reads, so a file
// exported, edited and imported again round-trips. Cells a spreadsheet
// would run as formulas are written behind a quote (lib/csv.ts).
export type ExportWords = { name: string; title: string; team: string; manager: string; phone: string; office: string; startDate: string; skills: string };

export function directoryCsv(entries: readonly Entry[], words: ExportWords): string {
  const names = new Map(entries.map(e => [e.id, e.name]));
  return toCsv([
    [words.name, words.title, words.team, words.manager, words.phone, words.office, words.startDate, words.skills],
    ...entries.map(e => [e.name, e.title, e.team, e.managerId ? names.get(e.managerId) ?? "" : "", e.phone, e.office, e.startDate ?? "", e.skills.join("; ")]),
  ]);
}
