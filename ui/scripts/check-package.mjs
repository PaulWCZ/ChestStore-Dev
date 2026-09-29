// Check the package as a tool receives it: npm pack, install the tarball
// into a throwaway project, import every subpath from Node and through a
// bundler (esbuild, as Next.js consumes it), type-check a TypeScript
// consumer under moduleResolution bundler and nodenext — and make sure the
// fonts stay out of it (the Chest serves them; a tool vendors the kit).
//
//   npm run check:package        (node scripts/check-package.mjs)
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const name = manifest.name;
const subpaths = Object.keys(manifest.exports).filter(key => key !== "./package.json" && !key.endsWith(".css"));
const expected = {
  color: ["colourWord", "contrast", "fit", "hex", "hueDistance", "inGamut", "luminance", "mix", "oklch", "oklchHex", "oklchToRgb", "parseColor", "rgbToOklch", "toHex"],
  contract: ["allTokens", "categories", "checkTheme", "colorTokens", "controlHeight", "effectTokens", "pairs", "ratios", "staticTokens", "themeIdPattern", "validateTheme"],
  fonts: ["closestFont", "familyPattern", "font", "fontBasePattern", "fontFaces", "fontFiles", "fontUrlPattern", "registry", "stackPattern", "systemFont", "systemStacks", "uploadedFont"],
  themes: ["catalogue", "catalogueFonts", "identityOf", "themeOf", "themes"],
  derive: ["BrandError", "deriveTheme", "logoUrlPattern"],
  import: ["importBrand", "maxImportSize"],
  runtime: ["lookColors", "lookCss", "lookNotes", "nonceOf", "resolveTheme", "themeStyle"],
  react: ["ThemeStyle"],
  components: ["AppShell", "AutoRefresh", "Avatar", "AvatarStack", "BrandMark", "Calendar", "Confirm", "DataTable", "DateField", "DayStrip", "Dialog", "EmptyState", "FilePicker", "Filters", "LanguageSwitch", "MemberChip", "Menu", "Nav", "NavLink", "NoAccess", "PageHeader", "PeoplePicker", "SearchBox", "Segmented", "StatusBadge", "Tabs", "TimeSelect", "Toasts", "filesReady", "storeLanguages", "useAutoRefresh", "useDismissToast", "useToast"],
  "components/logic": ["acceptText", "accepts", "activeFilters", "addDays", "addMonths", "ariaSort", "calendarKey", "checkFiles", "clampDate", "clearHref", "compareText", "compareValues", "cx", "daysBetween", "daysInMonth", "durations", "en", "endOfDay", "fileSize", "fill", "filterHref", "fold", "formatDate", "fr", "initials", "isCurrent", "isEditable", "isIsoDate", "isoOf", "kitWords", "latestUndo", "listKey", "localSearch", "matches", "menuKey", "monthGrid", "moveEnd", "moveStart", "nextSort", "paramOf", "parseDate", "parseTime", "partsOf", "plural", "putWithProgress", "refusalText", "relativeDay", "rememberRecent", "searchChoices", "settleUndo", "sortRows", "startOfWeek", "tabKey", "timeOptions", "timeText", "toastReducer", "weekday", "weekdayHeads", "wordsFor"],
};
// Subpaths the root must not re-export (React, or the components' own helpers).
const notInRoot = new Set(["react", "components", "components/logic"]);
assert.deepEqual(subpaths.sort(), [".", ...Object.keys(expected).map(s => "./" + s)].sort(), "the exports map and this check name the same subpaths");

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "npm_config_dry_run"));
const run = (command, args, cwd) => execFileSync(command, args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
const step = title => console.log(`\n== ${title}`);

const work = mkdtempSync(join(tmpdir(), "chest-ui-check-"));
try {
  step("npm pack");
  const [packed] = JSON.parse(run(npm, ["pack", "--json", "--pack-destination", work], root).replace(/^[^[]*/su, ""));
  const shipped = packed.files.map(f => f.path).sort();
  console.log(`${packed.filename}: ${shipped.length} files, ${packed.size} bytes packed`);
  for (const path of shipped) assert.ok(/^(package\.json|README\.md|LICENSE|tokens\/CONTRACT\.md|css\/components\.css|dist\/(components\/)?[a-z-]+\.(js|d\.ts)(\.map)?|src\/(components\/)?[a-z-]+\.tsx?)$/u.test(path), `unexpected file in the package: ${path}`);
  // Every client module of the components says so (Next.js needs the directive in the file it imports).
  for (const file of ["index", "toast", "dialog", "people-picker", "date-field", "file-picker", "data-table", "menu", "filters", "bits", "shell"]) assert.ok(readFileSync(join(root, "dist", "components", file + ".js"), "utf8").startsWith('"use client";'), `dist/components/${file}.js starts with "use client"`);
  for (const file of ["logic", "words", "text", "dates", "time", "people", "keys", "toast-state", "files", "lists"]) assert.ok(!/^\s*["']use client["']/u.test(readFileSync(join(root, "dist", "components", file + ".js"), "utf8")), `dist/components/${file}.js is server-safe`);
  assert.ok(!shipped.some(p => p.endsWith(".woff2")), "no font file in the package");
  assert.ok(packed.size < 300_000, `the package stays small (${packed.size} bytes)`);
  for (const target of Object.values(manifest.exports).filter(e => typeof e !== "string" || !e.endsWith(".css")).flatMap(e => (typeof e === "string" ? [e] : Object.values(e)))) assert.ok(shipped.includes(target.slice(2)), `export target missing: ${target}`);

  const cssTarget = manifest.exports["./components.css"];
  assert.ok(shipped.includes(cssTarget.slice(2)), "the components' stylesheet is in the package");

  step("install the tarball into a throwaway project");
  const consumer = join(work, "consumer");
  mkdirSync(consumer);
  writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "consumer", private: true, type: "module" }) + "\n");
  run(npm, ["install", "--no-audit", "--no-fund", "--ignore-scripts", "--no-package-lock", join(work, packed.filename)], consumer);
  // React is an optional peer: the consumer borrows the kit's own copy.
  for (const dep of ["react", "react-dom", "@types/react"]) {
    mkdirSync(join(consumer, "node_modules", ...dep.split("/").slice(0, -1)), { recursive: true });
    symlinkSync(join(root, "node_modules", dep), join(consumer, "node_modules", dep), "dir");
  }

  const specifiers = subpaths.map(s => (s === "." ? name : name + s.slice(1)));
  const probe = [
    ...specifiers.map((s, i) => `import * as m${i} from ${JSON.stringify(s)};`),
    `const modules = { ${specifiers.map((s, i) => `${JSON.stringify(s)}: m${i}`).join(", ")} };`,
    `const names = Object.fromEntries(Object.entries(modules).map(([s, m]) => [s, Object.keys(m).sort()]));`,
    `const rt = modules[${JSON.stringify(name + "/runtime")}], th = modules[${JSON.stringify(name + "/themes")}];`,
    `const look = rt.resolveTheme({ mode: "catalogue", theme: "library" }, th.themeOf("workshop"));`,
    `const style = rt.themeStyle(look, "abcdefgh12345678");`,
    `const derived = modules[${JSON.stringify(name + "/derive")}].deriveTheme({ primary: "#e4572e" });`,
    `const imported = modules[${JSON.stringify(name + "/import")}].importBrand("Primary: #0E7C66");`,
    `const { renderToString } = await import("react-dom/server");`,
    `const { createElement } = await import("react");`,
    `const ui = modules[${JSON.stringify(name + "/components")}], logic = modules[${JSON.stringify(name + "/components/logic")}];`,
    `const rendered = renderToString(createElement(ui.Toasts, { labels: logic.fr.toast }, createElement(ui.DateField, { label: "Date", value: "2026-09-29", onChange() {}, today: "2026-09-29", labels: logic.fr.date })));`,
    `console.log(JSON.stringify({ rendered: rendered.includes("29/09/2026") && rendered.includes("mardi 29 septembre 2026"), names, id: look.theme.id, style: style.slice(0, 60), same: modules[${JSON.stringify(name)}].catalogue === th.catalogue, notes: derived.notes.length, primary: imported.brand.primary, count: th.catalogue.length }));`,
  ].join("\n") + "\n";
  function verify(output, how) {
    const r = JSON.parse(output);
    for (const [sub, list] of Object.entries(expected)) assert.deepEqual(r.names[`${name}/${sub}`], list, `${how}: ${name}/${sub}`);
    const rootNames = r.names[name];
    for (const [sub, list] of Object.entries(expected)) if (!notInRoot.has(sub)) for (const n of list) assert.ok(rootNames.includes(n), `${how}: the root gives ${n}`);
    for (const n of ["ThemeStyle", "Toasts", "Dialog"]) assert.ok(!rootNames.includes(n), `${how}: the root does not pull React (${n})`);
    assert.equal(r.id, "library");
    assert.match(r.style, /^<style nonce="abcdefgh12345678" data-chest-theme="library">/u);
    assert.equal(r.same, true, `${how}: one catalogue for the root and /themes`);
    assert.ok(r.notes > 0);
    assert.equal(r.primary, "#0e7c66");
    assert.equal(r.count, 19);
    assert.equal(r.rendered, true, `${how}: the components render on the server`);
    for (const s of specifiers) console.log(`  ${s}: ${r.names[s].length} exports`);
  }

  step("import every subpath from Node");
  writeFileSync(join(consumer, "probe.mjs"), probe);
  verify(run(process.execPath, ["probe.mjs"], consumer), "Node");

  step("bundle every subpath with esbuild");
  const esbuild = await import(pathToFileURL(join(root, "node_modules", "esbuild", "lib", "main.js")).href);
  const bundled = await esbuild.build({ absWorkingDir: consumer, entryPoints: ["probe.mjs"], outfile: "bundle.mjs", bundle: true, platform: "node", format: "esm", metafile: true, external: ["react", "react/*", "react-dom", "react-dom/*"], logLevel: "warning", preserveSymlinks: true });
  const inputs = Object.keys(bundled.metafile.inputs).filter(i => i.includes(name));
  assert.ok(inputs.length > 0 && inputs.every(i => /\/dist\/(components\/)?[a-z-]+\.js$/u.test(i)), `the bundle resolves compiled JavaScript only: ${inputs.join(", ")}`);
  verify(run(process.execPath, ["bundle.mjs"], consumer), "esbuild bundle");

  step("type-check a TypeScript consumer");
  writeFileSync(join(consumer, "consumer.ts"), `import { catalogue, checkTheme, type Theme } from "${name}";
import { deriveTheme, type Brand, BrandError } from "${name}/derive";
import { importBrand, type Imported } from "${name}/import";
import { resolveTheme, themeStyle, type Look, type ThemeChoice } from "${name}/runtime";
import { ThemeStyle } from "${name}/react";
import { themeOf } from "${name}/themes";
import { Toasts, Dialog, PeoplePicker, DataTable, type Column, type PickedFile } from "${name}/components";
import { fr, parseDate, moveStart, type KitWords, type Choice } from "${name}/components/logic";
const own: Theme = themeOf("workshop")!;
const choice: ThemeChoice = { mode: "brand", brand: { primary: "#0e7c66", secondary: null, neutral: null, corners: "soft", density: "comfortable", display: { id: "fraunces" }, body: null, logo: null }, fonts: "/_chest/theme/fonts", scope: "chest" };
const look: Look = resolveTheme(choice, own);
const html: string = themeStyle(look, "abcdefgh12345678");
const brand: Brand = { primary: "#123456", corners: "round" };
const imported: Imported = importBrand("#123456");
const failures: number = checkTheme(deriveTheme(brand).theme).length + catalogue.length;
const element = ThemeStyle({ look, nonce: null });
const words: KitWords = fr;
const day: string | null = parseDate("29/09/2026", words.date, "2026-09-01");
const slot: { start: number; end: number } = moveStart({ start: 540, end: 600 }, 840);
const columns: Column<{ id: string; total: number }>[] = [{ key: "total", label: "Total", value: r => r.total, align: "end" }];
const people: Choice[] = [{ id: "mbr_a", name: "Léa Moreau" }];
const files: PickedFile[] = [];
export { html, imported, failures, element, BrandError, day, slot, columns, people, files, Toasts, Dialog, PeoplePicker, DataTable };
`);
  const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
  for (const resolution of ["bundler", "nodenext"]) {
    const module = resolution === "bundler" ? "esnext" : "nodenext";
    run(process.execPath, [tsc, "--noEmit", "--strict", "--skipLibCheck", "false", "--target", "es2022", "--module", module, "--moduleResolution", resolution, "--types", "", "--lib", "es2022,dom", "consumer.ts"], consumer);
    console.log(`  moduleResolution ${resolution}: no error`);
  }
  console.log(`\n${name}@${manifest.version}: package check passed`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
