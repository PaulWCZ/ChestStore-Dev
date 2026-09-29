// themeCss: a theme as the CSS custom properties of the contract — light,
// dark by the system's choice (unless the theme is light only), no motion
// when the person asks for less, stronger lines when they ask for more
// contrast — and the @font-face rules of its fonts. What it writes is built
// only from values validateTheme accepted, and it can never close the
// <style> element it is put in.
import { schemeWithDefaults, validateTheme, type Scheme, type Theme } from "./contract.js";
import { fontFaces } from "./fonts.js";

// chipRadius: the corners of badges, chips and counters — the theme's own
// (radius.chip), else a pill in a theme with rounded corners and its small
// radius in a square one (the Chest's 0: no pill in a sheet of rectangles).
export const chipRadius = (theme: Pick<Theme, "radius">): number => theme.radius.chip ?? (theme.radius.m <= 4 ? theme.radius.s : 999);

const rem = (v: number) => `${Math.round(v * 10000) / 10000}rem`;

// staticDeclarations: the tokens that do not change with the mode.
export function staticDeclarations(theme: Theme): string {
  const t = theme.type;
  const decl: [string, string][] = [
    ["font-display", theme.fonts.display.stack],
    ["font-body", theme.fonts.body.stack],
    ["font-mono", theme.fonts.mono.stack],
    ["font-accent", theme.fonts.accent.stack],
    ["font-read", (theme.fonts.read ?? theme.fonts.body).stack],
    ["display-weight", String(theme.display.weight)],
    ["display-tracking", theme.display.tracking],
    ["weight-strong", String(theme.strong)],
    ["text-xs", rem(t.xs)], ["text-s", rem(t.s)], ["text-m", rem(t.m)], ["text-l", rem(t.l)], ["text-xl", rem(t.xl)], ["text-2xl", rem(t.xxl)],
    ["leading", String(t.leading)],
    ...theme.space.map((v, i): [string, string] => [`space-${i + 1}`, `${v}px`]),
    ["radius-s", `${theme.radius.s}px`], ["radius-m", `${theme.radius.m}px`], ["radius-l", `${theme.radius.l}px`], ["radius-pill", "999px"], ["radius-chip", `${chipRadius(theme)}px`],
    ["border-width", `${theme.border}px`],
    ["control-h", "44px"],
    ["field-pad-x", `${theme.fieldPad ?? theme.space[2]}px`],
    ["ease", theme.motion.ease], ["fast", `${theme.motion.fast}ms`], ["slow", `${theme.motion.slow}ms`],
  ];
  return decl.map(([k, v]) => `--${k}:${v}`).join(";");
}

// schemeDeclarations: the colours and effects of one mode.
// A token a hand-made theme of an older kit leaves out gets its default.
export function schemeDeclarations(scheme: Scheme): string {
  return Object.entries(schemeWithDefaults(scheme)).map(([k, v]) => `--${k}:${v}`).join(";");
}

export type CssOptions = {
  // Where registered fonts are served ("/fonts": the tool's own public
  // folder; "/_chest/theme/fonts": the Chest's).
  fontBase?: string;
  // The element the tokens are set on (":root" for a page; a class to show
  // several themes side by side).
  selector?: string;
  // "auto": light, and dark when the system asks; or one mode only.
  mode?: "auto" | "light" | "dark";
  // false: no @font-face (they are already on the page).
  faces?: boolean;
};

// themeCss writes the stylesheet of a theme. It throws a RangeError for a
// theme validateTheme refuses: nothing unchecked reaches a page.
export function themeCss(theme: Theme, options: CssOptions = {}): string {
  const problems = validateTheme(theme);
  if (problems.length > 0) throw new RangeError(`theme ${String(theme?.id)}: ${problems.join("; ")}`);
  const selector = options.selector ?? ":root";
  if (!/^(:root|[.#]?[a-z][a-z0-9_-]{0,60}( [.#]?[a-z][a-z0-9_-]{0,60}){0,2})$/u.test(selector)) throw new RangeError(`a selector of letters, dashes, dots: ${selector}`);
  const mode = options.mode ?? "auto";
  const lightOnly = theme.modes === "light";
  const scheme = mode === "dark" && !lightOnly ? theme.dark : theme.light;
  const colorScheme = lightOnly || mode === "light" ? "light" : mode === "dark" ? "dark" : "light dark";
  const parts: string[] = [];
  if (options.faces !== false) {
    const faces = fontFaces([theme.fonts.display, theme.fonts.body, theme.fonts.mono, theme.fonts.accent, ...(theme.fonts.read ? [theme.fonts.read] : [])], options.fontBase ?? "/fonts");
    if (faces) parts.push(faces);
  }
  parts.push(`${selector}{color-scheme:${colorScheme};${staticDeclarations(theme)};${schemeDeclarations(scheme)}${theme.synthesis ? "" : ";font-synthesis:none"}}`);
  if (mode === "auto" && !lightOnly) parts.push(`@media (prefers-color-scheme: dark){${selector}{${schemeDeclarations(theme.dark)}}}`);
  parts.push(`@media (prefers-reduced-motion: reduce){${selector}{--fast:0ms;--slow:0ms}}`);
  // More contrast when the system asks for it: secondary text as dark as
  // text, every line a line that is seen.
  parts.push(`@media (prefers-contrast: more){${selector}{--ink-2:var(--ink);--line:var(--line-strong)}}`);
  // Nothing written here holds "<"; if it ever did, it could not end the
  // <style> element around it.
  return parts.join("\n").replace(/</gu, "\\3c ");
}

// themeColors: the page's colour for the browser's own bar (<meta
// name="theme-color">, Next's viewport.themeColor), light and dark.
export function themeColors(theme: Theme): { media: string; color: string }[] {
  if (theme.modes === "light") return [{ media: "(prefers-color-scheme: light)", color: theme.light.bg }, { media: "(prefers-color-scheme: dark)", color: theme.light.bg }];
  return [{ media: "(prefers-color-scheme: light)", color: theme.light.bg }, { media: "(prefers-color-scheme: dark)", color: theme.dark.bg }];
}
