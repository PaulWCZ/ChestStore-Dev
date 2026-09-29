// Fetches the fonts of the theme catalogue from Fontsource (npm) into
// fonts/ — latin and latin-ext WOFF2 files and each font's licence — and
// writes src/fonts-data.ts, the registry the kit reads (family, category,
// files, unicode ranges, licence, source). Run it when the list changes:
//
//   npm run fonts            (node scripts/fetch-fonts.mjs)
//
// The files are the ones the studio's tools already self-host (same
// packages, same versions): a tool's own identity keeps working from its
// own public/fonts/, and the Chest serves these to every tool of a company
// that chose a catalogue theme (README, "Fonts").
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = "5.3.0";
// [id, package, category, fallback stack, weights (static packages), italic]
const list = [
  ["albert-sans", "@fontsource-variable/albert-sans", "sans", "system-ui, -apple-system, 'Segoe UI', sans-serif"],
  ["atkinson-hyperlegible", "@fontsource/atkinson-hyperlegible", "sans", "system-ui, -apple-system, 'Segoe UI', sans-serif", ["400", "700"], true],
  ["barlow-semi-condensed", "@fontsource/barlow-semi-condensed", "condensed", "'Arial Narrow', system-ui, sans-serif", ["400", "600"]],
  ["bricolage-grotesque", "@fontsource-variable/bricolage-grotesque", "sans", "system-ui, -apple-system, 'Segoe UI', sans-serif"],
  ["dm-mono", "@fontsource/dm-mono", "mono", "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace", ["400", "500"]],
  ["dm-sans", "@fontsource-variable/dm-sans", "sans", "system-ui, -apple-system, 'Segoe UI', sans-serif"],
  ["dm-serif-display", "@fontsource/dm-serif-display", "serif", "Georgia, 'Times New Roman', serif", ["400"], true],
  ["figtree", "@fontsource-variable/figtree", "sans", "system-ui, -apple-system, 'Segoe UI', sans-serif"],
  ["fraunces", "@fontsource-variable/fraunces", "serif", "Georgia, 'Times New Roman', serif", null, true],
  ["fredoka", "@fontsource-variable/fredoka", "rounded", "ui-rounded, 'Arial Rounded MT Bold', system-ui, sans-serif"],
  ["hanken-grotesk", "@fontsource-variable/hanken-grotesk", "sans", "system-ui, -apple-system, 'Segoe UI', sans-serif"],
  ["ibm-plex-mono", "@fontsource/ibm-plex-mono", "mono", "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace", ["400", "500", "600"]],
  ["ibm-plex-sans", "@fontsource-variable/ibm-plex-sans", "sans", "system-ui, -apple-system, 'Segoe UI', sans-serif"],
  ["instrument-sans", "@fontsource-variable/instrument-sans", "sans", "system-ui, -apple-system, 'Segoe UI', sans-serif"],
  ["inter", "@fontsource-variable/inter", "sans", "system-ui, -apple-system, 'Segoe UI', sans-serif"],
  ["jetbrains-mono", "@fontsource-variable/jetbrains-mono", "mono", "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace"],
  ["libre-caslon-text", "@fontsource/libre-caslon-text", "serif", "'Iowan Old Style', Georgia, serif", ["400", "700"], true],
  ["libre-franklin", "@fontsource-variable/libre-franklin", "sans", "system-ui, -apple-system, 'Segoe UI', sans-serif", null, true],
  ["manrope", "@fontsource-variable/manrope", "sans", "system-ui, -apple-system, 'Segoe UI', sans-serif"],
  ["martian-mono", "@fontsource-variable/martian-mono", "mono", "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace"],
  ["newsreader", "@fontsource-variable/newsreader", "serif", "'Iowan Old Style', Georgia, 'Times New Roman', serif", null, true],
  ["nunito", "@fontsource-variable/nunito", "rounded", "ui-rounded, system-ui, -apple-system, 'Segoe UI', sans-serif"],
  ["nunito-sans", "@fontsource-variable/nunito-sans", "sans", "system-ui, -apple-system, 'Segoe UI', sans-serif"],
  ["outfit", "@fontsource-variable/outfit", "sans", "system-ui, -apple-system, 'Segoe UI', sans-serif"],
  ["plus-jakarta-sans", "@fontsource-variable/plus-jakarta-sans", "sans", "system-ui, -apple-system, 'Segoe UI', sans-serif"],
  ["public-sans", "@fontsource-variable/public-sans", "sans", "system-ui, -apple-system, 'Segoe UI', sans-serif"],
  ["red-hat-mono", "@fontsource-variable/red-hat-mono", "mono", "ui-monospace, 'SF Mono', Menlo, monospace"],
  ["red-hat-text", "@fontsource-variable/red-hat-text", "sans", "'Segoe UI', system-ui, sans-serif"],
  ["source-sans-3", "@fontsource-variable/source-sans-3", "sans", "system-ui, -apple-system, 'Segoe UI', sans-serif"],
  ["space-grotesk", "@fontsource-variable/space-grotesk", "sans", "system-ui, sans-serif"],
  ["work-sans", "@fontsource-variable/work-sans", "sans", "system-ui, -apple-system, 'Segoe UI', sans-serif"],
  ["young-serif", "@fontsource/young-serif", "serif", "Georgia, 'Times New Roman', serif", ["400"]],
];

const out = join(root, "fonts");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const work = mkdtempSync(join(tmpdir(), "chest-ui-fonts-"));
const entries = [];
try {
  for (const [id, pkg, category, fallback, weights, italic] of list) {
    const spec = `${pkg}@${version}`;
    const dir = join(work, id);
    mkdirSync(dir);
    execFileSync("npm", ["pack", spec, "--pack-destination", dir], { stdio: ["ignore", "ignore", "inherit"] });
    const tarball = readdirSync(dir).find(f => f.endsWith(".tgz"));
    execFileSync("tar", ["xzf", join(dir, tarball), "-C", dir]);
    const pack = join(dir, "package");
    const meta = JSON.parse(readFileSync(join(pack, "package.json"), "utf8"));
    const variable = pkg.startsWith("@fontsource-variable/");
    const css = [];
    if (variable) {
      css.push(join(pack, "index.css"));
      if (italic && existsSync(join(pack, "wght-italic.css"))) css.push(join(pack, "wght-italic.css"));
    } else {
      for (const w of weights ?? ["400"]) for (const style of italic ? ["", "-italic"] : [""]) {
        const f = join(pack, `${w}${style}.css`);
        if (existsSync(f)) css.push(f);
      }
    }
    const blocks = [...new Set(css.flatMap(f => readFileSync(f, "utf8").split(/(?=\/\* )/u)).filter(b => /@font-face/u.test(b) && /-(latin|latin-ext)-/u.test(b)))];
    const files = [];
    let family = "";
    for (const block of blocks) {
      const file = /url\(\.\/files\/([^)]+\.woff2)\)/u.exec(block)?.[1];
      if (!file) continue;
      family = /font-family: '([^']+)'/u.exec(block)?.[1] ?? family;
      copyFileSync(join(pack, "files", file), join(out, file));
      files.push({
        file,
        weight: /font-weight: ([^;]+);/u.exec(block)?.[1]?.trim() ?? "400",
        style: /font-style: (normal|italic);/u.exec(block)?.[1] ?? "normal",
        subset: /-latin-ext-/u.test(file) ? "latin-ext" : "latin",
        range: /unicode-range: ([^;]+);/u.exec(block)?.[1]?.trim() ?? "",
      });
    }
    const licence = readdirSync(pack).find(f => /^LICEN[CS]E/u.test(f));
    if (!licence) throw new Error(`${spec}: no licence file`);
    copyFileSync(join(pack, licence), join(out, `LICENSE-${id}.txt`));
    files.sort((a, b) => a.file.localeCompare(b.file));
    entries.push({ id, family, category, fallback, licence: meta.license, source: spec, files });
    console.log(`${id}: ${family} (${meta.license}), ${files.length} files`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

const ts = `// Generated by scripts/fetch-fonts.mjs — do not edit by hand. The fonts of
// the theme catalogue: Fontsource packages ${version}, latin and latin-ext
// subsets, WOFF2 only; the files and each licence are in fonts/ of the kit's
// repository (served to tools by the Chest, not shipped in the npm package).
import type { FontEntry } from "./fonts.js";

export const fontEntries: readonly FontEntry[] = ${JSON.stringify(entries, null, 2)};
`;
writeFileSync(join(root, "src", "fonts-data.ts"), ts);
console.log(`${entries.length} fonts → fonts/, src/fonts-data.ts`);
