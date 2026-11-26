import { toCsv } from "./csv.ts";
import type { Entry } from "./directory.ts";
import type { Extra } from "./fields.ts";

// The directory as a spreadsheet: one row per person, headers in the
// reader's language — the same columns the import reads (HR's extra fields
// under their own names), so a file exported, edited and imported again
// round-trips. Cells a spreadsheet would run as formulas are written behind
// a quote (lib/csv.ts); phone numbers stay as they are.
export type ExportWords = { name: string; email: string; title: string; team: string; manager: string; phone: string; office: string; startDate: string; skills: string };

export function directoryCsv(entries: readonly Entry[], words: ExportWords, extras: readonly Extra[] = []): string {
  const names = new Map(entries.map(e => [e.id, e.name]));
  return toCsv([
    [words.name, words.email, words.title, words.team, words.manager, words.phone, words.office, words.startDate, words.skills, ...extras.map(x => x.label)],
    ...entries.map(e => [
      e.name, e.email, e.title, e.team, e.managerId && !e.managerLeft ? names.get(e.managerId) ?? "" : "", e.phone, e.office, e.startDate ?? "", e.skills.join("; "),
      ...extras.map(x => e.extras[x.id] ?? ""),
    ]),
  ]);
}
