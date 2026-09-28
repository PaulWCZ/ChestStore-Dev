import { AppError } from "./app-error.ts";
import { parseCsv } from "./csv.ts";
import { limits } from "./model.ts";

// Opening balances from a spreadsheet, to switch from Lucca, Factorial or
// Excel: one line per person, their full name in the first column, then one
// column per leave type (its name in any of the tool's languages), the days
// left. Names are matched to the people who have the tool — accents, case
// and order ("Martin Camille") aside; nobody's address is needed or kept.
// Pure: the caller gives the people and the types' names.

export type ImportColumn = { index: number; header: string; typeId: string | null };
export type ImportRow = { line: number; name: string; memberId: string | null; problem: "unknown" | "ambiguous" | "bad_number" | null; values: { typeId: string; days: number }[] };
export type ImportPlan = { columns: ImportColumn[]; rows: ImportRow[] };

export const normalize = (text: string): string =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function planImport(
  text: string,
  typeNames: readonly { typeId: string; names: readonly string[] }[],
  people: readonly { id: string; name: string; firstName: string; lastName: string }[],
): ImportPlan {
  if (typeof text !== "string" || text.length > limits.importBytes) throw new AppError("import_invalid");
  const table = parseCsv(text, limits.importRows + 1);
  const [header, ...lines] = table;
  if (!header || header.length < 2 || lines.length > limits.importRows) throw new AppError("import_invalid");
  const byName = new Map<string, string>();
  for (const t of typeNames) for (const n of t.names) if (normalize(n)) byName.set(normalize(n), t.typeId);
  const columns: ImportColumn[] = header.map((h, index) => ({ index, header: h.trim(), typeId: index === 0 ? null : byName.get(normalize(h)) ?? null }));
  if (!columns.some(c => c.typeId !== null)) throw new AppError("import_invalid");
  const found = new Map<string, Set<string>>();
  const add = (key: string, id: string) => {
    if (!key) return;
    found.set(key, (found.get(key) ?? new Set()).add(id));
  };
  for (const p of people) {
    add(normalize(p.name), p.id);
    add(normalize(`${p.firstName} ${p.lastName}`), p.id);
    add(normalize(`${p.lastName} ${p.firstName}`), p.id);
  }
  const rows: ImportRow[] = [];
  lines.forEach((cells, i) => {
    const name = (cells[0] ?? "").trim();
    if (!name && cells.every(c => !c.trim())) return;
    const ids = found.get(normalize(name));
    const values: ImportRow["values"] = [];
    let problem: ImportRow["problem"] = !ids ? "unknown" : ids.size > 1 ? "ambiguous" : null;
    for (const c of columns) {
      if (c.typeId === null) continue;
      const cell = (cells[c.index] ?? "").trim().replace(/\s/gu, "").replace(",", ".");
      if (cell === "") continue;
      const days = Number(cell);
      if (!Number.isFinite(days) || Math.abs(days) > limits.adjustment) {
        problem ??= "bad_number";
        continue;
      }
      values.push({ typeId: c.typeId, days: Math.round(days * 100) / 100 });
    }
    rows.push({ line: i + 2, name, memberId: ids && ids.size === 1 ? [...ids][0]! : null, problem, values });
  });
  return { columns, rows };
}
