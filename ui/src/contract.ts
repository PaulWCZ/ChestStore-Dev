// The token contract: the CSS custom properties every theme defines, in
// light and dark, and that every tool styles itself with. A tool that uses
// only these (and its own tokens derived from them) wears any theme — its
// own identity, one of the catalogue, or a company's brand — and stays
// readable in all of them, because each theme is checked against the pairs
// below. tokens/CONTRACT.md explains each one; this file is the list the
// code checks.
import { contrast, parseColor } from "./color.js";
import { familyPattern, stackPattern, type FontSpec } from "./fonts.js";

// Words a person reads, in the tool's languages: English first (the source
// and the fallback), French second.
export type Words = { en: string; fr: string };

export const categories = 8;
const cat = (suffix: string) => Array.from({ length: categories }, (_, i) => `cat-${i + 1}${suffix}`);

// The colours, defined per mode.
export const colorTokens = [
  // Grounds
  "bg", "surface", "surface-2",
  // Text
  "ink", "ink-2",
  // Lines: decorative hairlines, and the lines that must be seen (fields, dividers that carry meaning)
  "line", "line-strong",
  // The one action colour
  "accent", "accent-ink", "accent-line", "accent-soft", "accent-text",
  // States: a colour for text and icons, a soft ground, the text on that ground
  "ok", "ok-soft", "ok-ink",
  "wait", "wait-soft", "wait-ink",
  "danger", "danger-soft", "danger-ink",
  // Keyboard focus, and the marker pen (search hits, what asks for you)
  "focus", "highlight",
  // The categorical palette: labels, kinds, stages, charts
  ...cat(""), ...cat("-soft"), ...cat("-ink"),
] as const;
export type ColorToken = (typeof colorTokens)[number];

// Effects, defined per mode (a shadow on a dark ground is not the same).
export const effectTokens = ["overlay", "shadow-1", "shadow-2"] as const;
export type EffectToken = (typeof effectTokens)[number];

// What one mode (light or dark) of a theme defines.
export type Scheme = Record<ColorToken | EffectToken, string>;

// The rest of the contract: the same in both modes.
export const staticTokens = [
  "font-display", "font-body", "font-mono", "display-weight", "display-tracking",
  "text-xs", "text-s", "text-m", "text-l", "text-xl", "text-2xl", "leading",
  "space-1", "space-2", "space-3", "space-4", "space-5", "space-6", "space-7", "space-8",
  "radius-s", "radius-m", "radius-l", "radius-pill", "border-width", "control-h",
  "ease", "fast", "slow",
] as const;
export type StaticToken = (typeof staticTokens)[number];

// Every token of the contract, as a tool names it in CSS (var(--accent)).
export const allTokens: readonly string[] = [...colorTokens, ...effectTokens, ...staticTokens].map(t => `--${t}`);

// A theme: its identity (id, names, one line), its three fonts, its type
// scale, spacing, shape and motion, and its two colour schemes.
export type Theme = {
  id: string;
  name: Words;
  description: Words;
  // The tool whose identity it is (a catalogue theme), if any.
  tool?: string;
  fonts: { display: FontSpec; body: FontSpec; mono: FontSpec };
  display: { weight: number; tracking: string };
  // rem sizes, xs to 2xl, and the body's line height.
  type: { xs: number; s: number; m: number; l: number; xl: number; xxl: number; leading: number };
  // px, space-1 to space-8.
  space: readonly [number, number, number, number, number, number, number, number];
  // px corner radii (pill is always 999px), and the width of lines.
  radius: { s: number; m: number; l: number };
  border: number;
  motion: { ease: string; fast: number; slow: number };
  light: Scheme;
  dark: Scheme;
};

// The minimum target a person can hit (brief/05: 44 px): no theme changes it.
export const controlHeight = 44;

export type Pair = { fg: ColorToken; on: ColorToken[]; min: number; why: string };

// The pairs a theme must pass, in each mode (WCAG 2.2 AA): 4.5:1 for text,
// 3:1 for what must be seen without being text (1.4.11: field borders,
// focus rings, a button's edge, chart colours).
export const pairs: readonly Pair[] = [
  { fg: "ink", on: ["bg", "surface", "surface-2", "accent-soft", "highlight"], min: 4.5, why: "text" },
  { fg: "ink-2", on: ["bg", "surface", "surface-2"], min: 4.5, why: "secondary text" },
  { fg: "accent-ink", on: ["accent"], min: 4.5, why: "text on the main button" },
  { fg: "accent-text", on: ["bg", "surface", "accent-soft"], min: 4.5, why: "links and accent-coloured text" },
  { fg: "accent-line", on: ["bg", "surface"], min: 3, why: "the edge of the main button" },
  { fg: "line-strong", on: ["bg", "surface"], min: 3, why: "field borders, meaningful lines" },
  { fg: "focus", on: ["bg", "surface"], min: 3, why: "the keyboard focus ring" },
  { fg: "ok", on: ["bg", "surface"], min: 4.5, why: "success text and icons (and surface text on an ok fill)" },
  { fg: "ok-ink", on: ["ok-soft"], min: 4.5, why: "text on a success banner" },
  { fg: "wait", on: ["bg", "surface"], min: 4.5, why: "waiting/warning text and icons" },
  { fg: "wait-ink", on: ["wait-soft"], min: 4.5, why: "text on a warning banner" },
  { fg: "danger", on: ["bg", "surface"], min: 4.5, why: "error text and icons (and surface text on a danger fill)" },
  { fg: "danger-ink", on: ["danger-soft"], min: 4.5, why: "text on an error banner" },
  ...Array.from({ length: categories }, (_, i): Pair[] => [
    { fg: `cat-${i + 1}` as ColorToken, on: ["surface", "bg"], min: 3, why: "a category's colour (dot, bar, spine)" },
    { fg: `cat-${i + 1}-ink` as ColorToken, on: [`cat-${i + 1}-soft` as ColorToken, "surface"], min: 4.5, why: "a category's label" },
  ]).flat(),
];

export type Failure = { mode: "light" | "dark"; fg: ColorToken; on: ColorToken; ratio: number; min: number; why: string };

// checkTheme measures every pair of the contract in both modes and returns
// those below their minimum (none: the theme passes WCAG AA).
export function checkTheme(theme: Pick<Theme, "light" | "dark">): Failure[] {
  const failures: Failure[] = [];
  for (const mode of ["light", "dark"] as const) {
    const scheme = theme[mode];
    for (const pair of pairs) {
      for (const on of pair.on) {
        const ratio = contrast(scheme[pair.fg], scheme[on]);
        if (ratio < pair.min) failures.push({ mode, fg: pair.fg, on, ratio: Math.round(ratio * 100) / 100, min: pair.min, why: pair.why });
      }
    }
  }
  return failures;
}

// ratios lists every pair's ratio (for a theme's documentation).
export function ratios(scheme: Scheme): { fg: ColorToken; on: ColorToken; ratio: number; min: number }[] {
  return pairs.flatMap(p => p.on.map(on => ({ fg: p.fg, on, ratio: Math.round(contrast(scheme[p.fg], scheme[on]) * 100) / 100, min: p.min })));
}

const hexPattern = /^#[0-9a-f]{6}$/u;
const rgbaPattern = /^rgb\(\d{1,3} \d{1,3} \d{1,3}( \/ (0|1|0?\.\d{1,3}))?\)$/u;
const shadowPattern = /^(none|(-?\d{1,2}(\.\d)?px ){2,4}(rgb\(\d{1,3} \d{1,3} \d{1,3}( \/ (0|1|0?\.\d{1,3}))?\)|#[0-9a-f]{6})(, (-?\d{1,2}(\.\d)?px ){2,4}(rgb\(\d{1,3} \d{1,3} \d{1,3}( \/ (0|1|0?\.\d{1,3}))?\)|#[0-9a-f]{6})){0,2})$/u;
const easePattern = /^cubic-bezier\((-?\d(\.\d{1,3})?, ){3}-?\d(\.\d{1,3})?\)$/u;
const idPattern = /^[a-z][a-z0-9-]{1,39}$/u;
export const themeIdPattern = idPattern;

// validateTheme checks a theme's shape and every value's grammar — what
// themeCss writes into a page must be exactly what it looks like — and
// lists what is wrong (none: valid). Contrast is checkTheme's.
export function validateTheme(theme: Theme): string[] {
  const problems: string[] = [];
  const t = theme as Partial<Theme>;
  if (!t || typeof t !== "object") return ["not a theme"];
  if (typeof t.id !== "string" || !idPattern.test(t.id)) problems.push("id: lowercase letters, digits and dashes, 2 to 40");
  for (const key of ["name", "description"] as const) {
    const w = t[key];
    if (!w || typeof w.en !== "string" || typeof w.fr !== "string" || !w.en.trim() || !w.fr.trim() || w.en.length > 160 || w.fr.length > 160) problems.push(`${key}: English and French, 160 characters at most`);
  }
  for (const which of ["display", "body", "mono"] as const) {
    const f = t.fonts?.[which];
    if (!f || typeof f.stack !== "string" || !stackPattern.test(f.stack)) problems.push(`fonts.${which}: a stack of family names`);
    else if (f.family && !familyPattern.test(f.family)) problems.push(`fonts.${which}.family: letters, digits, spaces`);
  }
  const d = t.display;
  if (!d || !Number.isInteger(d.weight) || d.weight < 300 || d.weight > 900 || !/^-?0(\.\d{1,3})?em$/u.test(d.tracking)) problems.push("display: a weight 300 to 900 and a tracking in em (-0.05em to 0.05em)");
  const ty = t.type;
  if (!ty || !["xs", "s", "m", "l", "xl", "xxl"].every(k => { const v = (ty as Record<string, number>)[k]; return typeof v === "number" && v >= 0.6 && v <= 6; }) || !(ty.leading >= 1.2 && ty.leading <= 2) || ty.m < 0.9375 || ty.xs < 0.6875) problems.push("type: rem sizes (body at least 0.9375rem, the smallest at least 0.6875rem) and a leading of 1.2 to 2");
  if (!Array.isArray(t.space) || t.space.length !== 8 || !t.space.every((v, i, a) => Number.isFinite(v) && v >= 0 && v <= 160 && (i === 0 || v >= a[i - 1]!))) problems.push("space: eight growing px values");
  if (!t.radius || !["s", "m", "l"].every(k => { const v = (t.radius as Record<string, number>)[k]; return Number.isFinite(v) && v >= 0 && v <= 48; })) problems.push("radius: s, m, l in px (0 to 48)");
  if (!Number.isFinite(t.border) || t.border! < 1 || t.border! > 4) problems.push("border: 1 to 4 px");
  const mo = t.motion;
  if (!mo || !easePattern.test(mo.ease) || !Number.isInteger(mo.fast) || !Number.isInteger(mo.slow) || mo.fast < 0 || mo.slow < mo.fast || mo.slow > 1000) problems.push("motion: a cubic-bezier and two durations in ms (fast ≤ slow ≤ 1000)");
  for (const mode of ["light", "dark"] as const) {
    const s = t[mode];
    if (!s) { problems.push(`${mode}: missing`); continue; }
    for (const token of colorTokens) if (typeof s[token] !== "string" || !hexPattern.test(s[token]) || !parseColor(s[token])) problems.push(`${mode}.${token}: a colour #rrggbb`);
    if (typeof s.overlay !== "string" || !rgbaPattern.test(s.overlay)) problems.push(`${mode}.overlay: rgb(r g b / a)`);
    for (const token of ["shadow-1", "shadow-2"] as const) if (typeof s[token] !== "string" || !shadowPattern.test(s[token])) problems.push(`${mode}.${token}: none, or up to three px shadows`);
  }
  return problems;
}
