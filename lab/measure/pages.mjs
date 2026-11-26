// The pages the bench requests for a tool, frozen in lab/measure/pages/<key>.json
// so that the same list is requested before and after a change of stack.
//
//   node lab/measure/pages.mjs <tool folder> [--key <key>] [--write]
//
// Taken once from the tool's docs/screens.json (the screens lab/chest-dev/screens.mjs
// shoots): every distinct path of a shot without actions, in order, the first
// shot's member and language, at most 20; a path outside /chest is a public
// page (requested without a member). Without docs/screens.json: /chest.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export function keyOf(folder) {
  const dir = resolve(folder);
  return (dir.split("/").includes("reference") ? "ref-" : "") + basename(dir);
}

export function pagesFromScreens(folder) {
  const file = join(folder, "docs", "screens.json");
  if (!existsSync(file)) return [{ path: "/chest", member: "camille" }];
  const seen = new Set();
  const pages = [];
  for (const shot of JSON.parse(readFileSync(file, "utf8"))) {
    if (shot.actions?.length) continue;
    const path = String(shot.path).split("#")[0];
    if (seen.has(path)) continue;
    seen.add(path);
    const language = shot.language ?? shot.locale;
    const isPublic = !/^\/chest(\/|\?|$)/u.test(path);
    pages.push({ path, ...(isPublic ? { public: true } : { member: shot.member ?? "camille" }), ...(language ? { language } : {}) });
    if (pages.length === 20) break;
  }
  return pages.length ? pages : [{ path: "/chest", member: "camille" }];
}

// The frozen list, written the first time.
export function pagesFor(folder, key = keyOf(folder)) {
  const file = join(here, "pages", `${key}.json`);
  if (existsSync(file)) return { pages: JSON.parse(readFileSync(file, "utf8")), source: `lab/measure/pages/${key}.json` };
  const pages = pagesFromScreens(folder);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(pages, null, 1) + "\n");
  return { pages, source: `lab/measure/pages/${key}.json (new, from docs/screens.json)` };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const folder = args.find((a) => !a.startsWith("--"));
  if (!folder) { console.error("usage: node lab/measure/pages.mjs <tool folder> [--key k] [--write]"); process.exit(2); }
  const k = args.includes("--key") ? args[args.indexOf("--key") + 1] : keyOf(folder);
  if (args.includes("--write")) console.log(JSON.stringify(pagesFor(folder, k), null, 1));
  else console.log(JSON.stringify(pagesFromScreens(folder), null, 1));
}
