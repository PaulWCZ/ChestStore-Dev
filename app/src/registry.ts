import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// The islands the tool registers (src/islands/index.ts:
//   import { A, B as C } from "./a.tsx"; import D from "../d.tsx";
//   export const islands = { ToastHost, A, C, Other: D };
// ), each with the file it comes from and its name there — the very list
// the server renders from, so the browser's map misses none (a file in a
// folder, a default export, a re-export). An island of a package
// (ToastHost) is not listed: start()'s own. One defined in index.ts itself
// cannot be loaded apart: an error. A wrapper around the list
// (allLive({ … })) is read through, but the browser's loader takes each
// file's own export: a tool that wraps its islands keeps start(islands).
export type IslandSource = { name: string; file: string; exported: string };
export function islandRegistry(root = process.cwd()): IslandSource[] {
  const index = join(root, "src", "islands", "index.ts");
  if (!existsSync(index)) return [];
  const text = readFileSync(index, "utf8").replace(/\/\*[\s\S]*?\*\//gu, "").replace(/(^|[^:"'`])\/\/.*$/gmu, "$1");
  const imported = new Map<string, { from: string; exported: string }>();
  for (const m of text.matchAll(/\bimport\s+(?!type\b)([\s\S]*?)\s+from\s+["']([^"']+)["']/gu)) {
    const [, clause = "", from = ""] = m;
    const named = /\{([\s\S]*)\}/u.exec(clause)?.[1] ?? "";
    const plain = clause.replace(/\{[\s\S]*\}/u, "").replace(/,/gu, " ").trim();
    if (plain && /^[A-Za-z_$][\w$]*$/u.test(plain)) imported.set(plain, { from, exported: "default" });
    for (const part of named.split(",").map(x => x.trim()).filter(x => x && !x.startsWith("type "))) {
      const [exported = "", local = exported] = part.split(/\s+as\s+/u).map(x => x.trim());
      imported.set(local, { from, exported });
    }
  }
  // { … }, or a wrapper's call around it (allLive({ … })): the names inside.
  const body = /\bexport\s+const\s+islands\s*(?::[^=]+)?=\s*(?:[\w$.]+\s*\(\s*)?\{([\s\S]*?)\}/u.exec(text)?.[1];
  if (body === undefined) throw new Error("src/islands/index.ts: no `export const islands = { … }` — the registry chestConfig reads");
  const sources: IslandSource[] = [];
  for (const entry of body.split(",").map(x => x.trim()).filter(Boolean)) {
    const m = /^([A-Za-z_$][\w$]*)(?:\s*:\s*([A-Za-z_$][\w$]*))?$/u.exec(entry);
    if (!m) throw new Error(`src/islands/index.ts: "${entry}" — list each island by name (Name, or Name: Imported)`);
    const name = m[1]!;
    const local = m[2] ?? name;
    const from = imported.get(local);
    if (!from) throw new Error(`src/islands/index.ts: the island ${name} is not imported from a file — put it in a file of its own and import it`);
    if (!from.from.startsWith(".")) continue; // a package's (ToastHost)
    sources.push({ name, file: resolveSource(resolve(dirname(index), from.from)), exported: from.exported });
  }
  return sources;
}
function resolveSource(path: string): string {
  for (const candidate of [path, `${path}.tsx`, `${path}.ts`, join(path, "index.tsx"), join(path, "index.ts")]) if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  throw new Error(`src/islands/index.ts: ${path} not found`);
}
