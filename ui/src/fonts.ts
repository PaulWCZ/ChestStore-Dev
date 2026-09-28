// The fonts a theme may name: the catalogue's (open licences, OFL-1.1,
// self-hosted — a tool has no network), a system stack, or files a company
// uploaded to its Chest for its brand.
import { fontEntries } from "./fonts-data.js";

export type FontCategory = "sans" | "serif" | "mono" | "rounded" | "condensed";

// One file of a registered font (a subset, a style, a weight or a range of
// weights for a variable font).
export type FontFile = { file: string; weight: string; style: "normal" | "italic" | string; subset: "latin" | "latin-ext" | string; range: string };

// A registered font: its id (the kit's name for it), the family its files
// declare, what kind of letters it has, the stack used while it loads or
// when it cannot, its licence and where it came from.
export type FontEntry = { id: string; family: string; category: FontCategory | string; fallback: string; licence: string; source: string; files: FontFile[] };

// A face a theme declares from files it names itself (a company's upload):
// url is a path on the tool's own origin (the Chest serves it), never
// another site.
export type FontSource = { url: string; weight: string; style: "normal" | "italic" };

// What a theme says of one of its three fonts. id: a registered font;
// files: a company's own font; neither: a system stack only.
export type FontSpec = { family: string; stack: string; id?: string; files?: FontSource[] };

export const registry: ReadonlyMap<string, FontEntry> = new Map(fontEntries.map(entry => [entry.id, entry]));

// The stacks of the fonts every computer has, by kind.
export const systemStacks: Record<FontCategory, string> = {
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  serif: "'Iowan Old Style', 'Palatino Linotype', Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, 'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace",
  rounded: "ui-rounded, 'Arial Rounded MT Bold', system-ui, sans-serif",
  condensed: "'Arial Narrow', system-ui, sans-serif",
};

// A family name is written in CSS between quotes: letters, digits, spaces
// and a few signs only, so nothing a company types can break out of it.
export const familyPattern = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,63}$/u;
// A stack: family names (quoted or not) separated by commas, nothing else.
export const stackPattern = /^(\s*('[\p{L}\p{N} ._-]{1,64}'|[a-zA-Z][a-zA-Z0-9-]{0,40})\s*)(,\s*('[\p{L}\p{N} ._-]{1,64}'|[a-zA-Z][a-zA-Z0-9-]{0,40})\s*){0,12}$/u;
// A font file's address: a path on the tool's own origin (font-src 'self').
export const fontUrlPattern = /^\/[A-Za-z0-9._~\-/]{1,200}\.(woff2|woff|ttf|otf)$/u;
// The base path fonts are served under (the tool's /fonts, or the Chest's
// /_chest/theme/fonts).
export const fontBasePattern = /^\/[A-Za-z0-9._~\-/]{0,120}$/u;

// font is the spec of a registered font, with its own fallback stack.
export function font(id: string): FontSpec {
  const entry = registry.get(id);
  if (!entry) throw new RangeError(`no font "${id}" in the registry`);
  return { id, family: entry.family, stack: `'${entry.family}', ${entry.fallback}` };
}

// systemFont is a spec with no file: the computer's own letters.
export function systemFont(category: FontCategory): FontSpec {
  return { family: "", stack: systemStacks[category] };
}

// uploadedFont is a company's own font, served by its Chest: its family is
// renamed ("Brand <family>") so it can never be taken for an installed font
// of the same name with other metrics.
export function uploadedFont(family: string, files: FontSource[], category: FontCategory = "sans"): FontSpec {
  if (!familyPattern.test(family)) throw new RangeError("a font family is letters, digits, spaces, dots, dashes (64 at most)");
  for (const f of files) if (!fontUrlPattern.test(f.url) || f.url.includes("..") || f.url.startsWith("//")) throw new RangeError(`a font file is a path on the tool's own origin: ${f.url}`);
  const named = `Brand ${family}`.slice(0, 64);
  return { family: named, stack: `'${named}', ${systemStacks[category]}`, files };
}

const quote = (family: string) => `'${family}'`;

// fontFaces writes the @font-face rules of the fonts a theme names: a
// registered font's files under base (a tool's "/fonts", the Chest's
// "/_chest/theme/fonts"), a company's files at their own paths. Only what
// the page uses is downloaded (the browser fetches a face when text needs
// it), and every address stays on the tool's origin.
export function fontFaces(specs: FontSpec[], base: string): string {
  if (!fontBasePattern.test(base) || base.includes("..")) throw new RangeError(`a font base is a path on the tool's origin: ${base}`);
  const root = base.replace(/\/$/u, "");
  const rules: string[] = [];
  const seen = new Set<string>();
  for (const spec of specs) {
    if (!spec.family || seen.has(spec.family)) continue;
    seen.add(spec.family);
    if (spec.id) {
      const entry = registry.get(spec.id);
      if (!entry) continue;
      for (const f of entry.files) rules.push(`@font-face{font-family:${quote(entry.family)};font-style:${f.style};font-display:swap;font-weight:${f.weight};src:url(${root}/${f.file}) format('woff2');unicode-range:${f.range}}`);
    } else if (spec.files) {
      if (!familyPattern.test(spec.family)) continue;
      for (const f of spec.files) {
        if (!fontUrlPattern.test(f.url) || f.url.includes("..")) continue;
        const format = f.url.endsWith(".woff2") ? "woff2" : f.url.endsWith(".woff") ? "woff" : f.url.endsWith(".otf") ? "opentype" : "truetype";
        const weight = /^\d{3}( \d{3})?$/u.test(f.weight) ? f.weight : "400";
        rules.push(`@font-face{font-family:${quote(spec.family)};font-style:${f.style === "italic" ? "italic" : "normal"};font-display:swap;font-weight:${weight};src:url(${f.url}) format('${format}')}`);
      }
    }
  }
  return rules.join("\n");
}

// fontFiles lists the files a set of specs needs from the registry (to copy
// a tool's own fonts, or to check the Chest serves them all).
export function fontFiles(specs: FontSpec[]): string[] {
  return [...new Set(specs.flatMap(s => (s.id ? registry.get(s.id)?.files.map(f => f.file) ?? [] : [])))].sort();
}

// closestFont picks a registered font for a family name a brand file gives:
// the same family when the kit has it, otherwise one of the same kind.
export function closestFont(name: string): { id: string; exact: boolean } {
  const want = name.toLowerCase().replace(/\bvariable\b/gu, "").replace(/[^a-z0-9]/gu, "");
  for (const entry of registry.values()) {
    const have = entry.family.toLowerCase().replace(/\bvariable\b/gu, "").replace(/[^a-z0-9]/gu, "");
    if (have === want || entry.id.replace(/-/gu, "") === want) return { id: entry.id, exact: true };
  }
  const n = name.toLowerCase();
  if (/mono|code|courier|consol/u.test(n)) return { id: "jetbrains-mono", exact: false };
  if (/rounded|nunito|quicksand|comfortaa|varela/u.test(n)) return { id: "nunito", exact: false };
  if (/condensed|narrow|oswald|barlow|bebas/u.test(n)) return { id: "barlow-semi-condensed", exact: false };
  if (/(^|[^a-z])serif|garamond|times|georgia|caslon|baskerville|playfair|merriweather|lora|didot|bodoni|cormorant|libre baskerville|crimson/u.test(n) && !/sans/u.test(n)) return { id: "newsreader", exact: false };
  return { id: "inter", exact: false };
}
