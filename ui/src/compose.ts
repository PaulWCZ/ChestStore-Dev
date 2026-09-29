// defineTheme: a whole theme from what an identity says of itself. A tool's
// designer names the colours that make the identity (grounds, ink, the
// accent…); what they leave out is derived from those, in OKLCH, with the
// contrast the contract asks (contract.ts): the states' soft grounds and
// inks, the lines that must be seen, the categorical palette. Values given
// are kept as given — if one fails the contract, checkTheme says so; the
// kit never changes an identity behind its designer's back.
import { contrast, fit, luminance, mix, oklch, oklchHex, parseColor, toHex } from "./color.js";
import { categories, categoryFamilies, checkTheme, validateTheme, type ColorToken, type EffectToken, type Scheme, type Theme, type Words } from "./contract.js";
import { font, systemFont, type FontSpec } from "./fonts.js";
import { inverseSignal } from "./signal.js";

// What a scheme must give; everything else may be derived.
export type SchemeSource = Partial<Scheme> & Pick<Scheme, "bg" | "surface" | "ink" | "ink-2" | "line" | "accent" | "accent-ink">;

// A slot of the categorical palette a theme sets itself: its colour (for
// dots and bars), its soft ground and the text on that ground.
export type CategorySource = { solid?: string; soft?: string; ink?: string };

// The categorical palette: eight families in a fixed order in every theme,
// so a tool that maps "holiday" to cat-1 gets a blue in any theme —
// 1 blue, 2 green, 3 orange, 4 violet, 5 pink, 6 teal, 7 ochre, 8 slate.
// A theme may turn a family's hue a little (hues, OKLCH degrees), make the
// whole palette calmer or louder (chroma, a factor), or set slots itself.
export type PaletteSource = { chroma?: number; hues?: Partial<Record<number, number>>; light?: Record<number, CategorySource>; dark?: Record<number, CategorySource> };

export const familyHues: readonly number[] = categoryFamilies.map(f => f.hue);
const familyChroma: readonly number[] = [0.14, 0.14, 0.15, 0.14, 0.15, 0.11, 0.13, 0.035];

export type ThemeSource = {
  id: string;
  name: Words;
  description: Words;
  tool?: string;
  // read: the face for long text (the body's unless said) (0.2.2).
  fonts: { display: string | FontSpec; body: string | FontSpec; mono?: string | FontSpec; accent?: string | FontSpec; read?: string | FontSpec };
  display?: Partial<Theme["display"]>;
  strong?: number;
  synthesis?: boolean;
  modes?: Theme["modes"];
  type?: Partial<Theme["type"]>;
  space?: Theme["space"];
  radius: Theme["radius"];
  border?: number;
  fieldPad?: number;
  motion?: Partial<Theme["motion"]>;
  light: SchemeSource;
  // Omitted for a light-only theme (modes: "light").
  dark?: SchemeSource;
  palette?: PaletteSource;
};

export const defaultType: Theme["type"] = { xs: 0.75, s: 0.875, m: 1, l: 1.25, xl: 1.75, xxl: 2.25, leading: 1.5 };
export const defaultSpace: Theme["space"] = [4, 8, 12, 16, 24, 32, 48, 72];
export const defaultMotion: Theme["motion"] = { ease: "cubic-bezier(0.2, 0.7, 0.2, 1)", fast: 120, slow: 240 };

const statusHue = { ok: 150, wait: 75, danger: 27 } as const;

const must = (value: string | null, what: string): string => {
  if (value === null) throw new RangeError(`no colour of this hue reaches the contrast asked for ${what}`);
  return value;
};

const rgbOf = (hexValue: string): string => {
  const rgb = parseColor(hexValue)!;
  return [rgb.r, rgb.g, rgb.b].map(v => Math.round(v * 255)).join(" ");
};

// category derives one slot of the palette for a mode, against the
// scheme's surfaces: a colour seen at 3:1, a soft ground, an ink at 4.5:1.
export function category(slot: number, mode: "light" | "dark", surfaces: { bg: string; surface: string }, palette: PaletteSource = {}, given: CategorySource = {}): { solid: string; soft: string; ink: string } {
  const i = slot - 1;
  const h = palette.hues?.[slot] ?? familyHues[i]!;
  const c = familyChroma[i]! * (palette.chroma ?? 1);
  const grounds = [surfaces.surface, surfaces.bg];
  const light = mode === "light";
  const solid = given.solid ?? must(fit(oklchHex({ l: light ? 0.6 : 0.74, c, h }), grounds, 3, light ? "darker" : "lighter"), `cat-${slot}`);
  const soft = given.soft ?? oklchHex({ l: light ? 0.945 : 0.31, c: light ? Math.min(0.045, c * 0.35) : Math.min(0.06, c * 0.45), h });
  let ink = given.ink;
  if (!ink) {
    const own = oklch(solid)!;
    const tryFirst = contrast(solid, soft) >= 4.5 && contrast(solid, surfaces.surface) >= 4.5 ? solid : null;
    ink = tryFirst ?? must(fit(oklchHex({ l: light ? 0.42 : 0.88, c: Math.min(own.c, light ? 0.12 : 0.08), h: own.h }), [soft, surfaces.surface], 4.5, light ? "darker" : "lighter"), `cat-${slot}-ink`);
  }
  return { solid, soft, ink };
}

// completeScheme fills what a scheme leaves out.
export function completeScheme(source: SchemeSource, mode: "light" | "dark", palette: PaletteSource = {}): Scheme {
  const light = mode === "light";
  const s: Partial<Record<ColorToken | EffectToken, string>> = { ...source };
  const { bg, surface, ink, accent } = source;
  s["surface-2"] ??= mix(surface, ink, light ? 0.95 : 0.93);
  s["line-strong"] ??= must(fit(source.line, [bg, surface, s["surface-2"]!].filter(x => luminance(x) !== luminance(ink)), 3, light ? "darker" : "lighter"), "line-strong");
  s["accent-line"] ??= contrast(accent, bg) >= 3 && contrast(accent, surface) >= 3 ? toHex(parseColor(accent)!) : s["line-strong"]!;
  s["accent-soft"] ??= mix(accent, surface, light ? 0.14 : 0.24);
  s["accent-text"] ??= must(fit(accent, [bg, surface, s["accent-soft"]!], 4.5, light ? "darker" : "lighter"), "accent-text");
  for (const state of ["ok", "wait", "danger"] as const) {
    const h = statusHue[state];
    s[state] ??= must(fit(oklchHex({ l: light ? 0.52 : 0.8, c: state === "wait" ? 0.12 : 0.14, h }), [bg, surface], 4.5, light ? "darker" : "lighter"), state);
    const own = oklch(s[state]!)!;
    s[`${state}-soft`] ??= oklchHex({ l: light ? 0.95 : 0.29, c: light ? 0.04 : 0.05, h: own.h });
    s[`${state}-ink`] ??= contrast(s[state]!, s[`${state}-soft`]!) >= 4.5 ? s[state]! : must(fit(oklchHex({ l: light ? 0.4 : 0.88, c: Math.min(own.c, 0.12), h: own.h }), [s[`${state}-soft`]!], 4.5, light ? "darker" : "lighter"), `${state}-ink`);
  }
  s.focus ??= s["accent-text"]!;
  // The region of its own colour (0.2.2): by default the ink as a ground in
  // light mode (the inverse pair), and a band darker than the page in dark
  // mode (the page's text on it) — it stays dark in both, as a steel bar or
  // an instrument panel does. A theme sets its own (Tool crib's steel).
  if (!s.inverse) {
    if (light) s.inverse = ink;
    else {
      const g = oklch(bg)!;
      s.inverse = g.l > 0.16 ? oklchHex({ l: g.l - 0.06, c: g.c, h: g.h }) : mix(bg, ink, 0.9);
    }
  }
  const onInverse = s.inverse!;
  const away = luminance(onInverse) > 0.18 ? "darker" : "lighter";
  s["inverse-ink"] ??= must(fit(light ? bg : ink, [onInverse], 4.5, away), "inverse-ink");
  s["inverse-ink-2"] ??= must(fit(mix(s["inverse-ink"]!, onInverse, 0.72), [onInverse], 4.5, away), "inverse-ink-2");
  if (!s["inverse-line"]) {
    let line = mix(onInverse, s["inverse-ink"]!, 0.86);
    for (let p = 0.88; contrast(s["inverse-ink"]!, line) < 4.5 && p <= 1; p += 0.02) line = mix(onInverse, s["inverse-ink"]!, p);
    s["inverse-line"] = line;
  }
  s.highlight ??= must(fit(oklchHex({ l: light ? 0.93 : 0.36, c: light ? 0.08 : 0.06, h: 95 }), [ink], 4.5, light ? "lighter" : "darker"), "highlight");
  // The signal on the region (0.2.3): the marker pen where it reads on the
  // band, else its hue as light as the band needs; the band as its text.
  s["inverse-signal"] ??= inverseSignal({ inverse: s.inverse!, "inverse-line": s["inverse-line"]!, highlight: s.highlight! });
  s["inverse-signal-ink"] ??= s.inverse!;
  for (let slot = 1; slot <= categories; slot++) {
    const got = category(slot, mode, { bg, surface }, palette, { ...(source[`cat-${slot}` as ColorToken] ? { solid: source[`cat-${slot}` as ColorToken]! } : {}), ...(source[`cat-${slot}-soft` as ColorToken] ? { soft: source[`cat-${slot}-soft` as ColorToken]! } : {}), ...(source[`cat-${slot}-ink` as ColorToken] ? { ink: source[`cat-${slot}-ink` as ColorToken]! } : {}), ...palette[mode]?.[slot] });
    s[`cat-${slot}` as ColorToken] = got.solid;
    s[`cat-${slot}-soft` as ColorToken] = got.soft;
    s[`cat-${slot}-ink` as ColorToken] = got.ink;
  }
  s.overlay ??= light ? `rgb(${rgbOf(ink)} / 0.45)` : "rgb(0 0 0 / 0.6)";
  s["shadow-1"] ??= light ? `0px 1px 2px rgb(${rgbOf(ink)} / 0.08), 0px 1px 1px rgb(${rgbOf(ink)} / 0.05)` : "none";
  s["shadow-2"] ??= light ? `0px 10px 28px rgb(${rgbOf(ink)} / 0.16)` : "0px 12px 32px rgb(0 0 0 / 0.55)";
  // Colours as the contract writes them: #rrggbb.
  for (const key of Object.keys(s) as (ColorToken | EffectToken)[]) if (!["overlay", "shadow-1", "shadow-2"].includes(key)) s[key] = toHex(parseColor(s[key]!)!);
  return s as Scheme;
}

// What 0.2.2 added to five of the store's identities: a band of their own
// colour (--inverse: Equipment's steel bar, Timesheets' instrument panel,
// Goals' dark map margin, from their tokens.css before the kit) and a face
// for long text (--font-read: Wiki's Newsreader, Quotes' Libre Caslon
// Text). 0.2.3: Timesheets' lime as the signal on its panel in both modes
// (--inverse-signal), and Clients' square badges (radius.chip 3: the
// identity's own look, which CRM forced in its CSS in every theme). Each tool keeps its identity as a copy of the catalogue's source
// and its tests hold the two equal: defineTheme applies these to a source
// of that id *and* tool, where the source does not say otherwise, so the
// catalogue and the tools' copies stay one — with no change in the tools.
type Addition = { readonly tool: string; readonly read?: string; readonly chip?: number; readonly light?: Partial<SchemeSource>; readonly dark?: Partial<SchemeSource> };
export const identityAdditions: Readonly<Record<string, Addition>> = {
  labels: {
    tool: "equipment",
    light: { inverse: "#2e3d48", "inverse-ink": "#ffffff", "inverse-ink-2": "#c9d3db", "inverse-line": "#43535f" },
    dark: { inverse: "#222b32", "inverse-ink": "#ffffff", "inverse-ink-2": "#b7c3cc", "inverse-line": "#36424c" },
  },
  instrument: {
    tool: "timesheets",
    light: { inverse: "#0c231b", "inverse-ink": "#e9f3ed", "inverse-ink-2": "#a9c2b6", "inverse-line": "#2a5646", "inverse-signal": "#c6ff3a", "inverse-signal-ink": "#0d1f19" },
    dark: { inverse: "#050d0a", "inverse-ink": "#e9f3ed", "inverse-ink-2": "#a9c2b6", "inverse-line": "#1f4032", "inverse-signal": "#c6ff3a", "inverse-signal-ink": "#0d1f19" },
  },
  trail: {
    tool: "goals",
    light: { inverse: "#17302a", "inverse-ink": "#f3eee2", "inverse-ink-2": "#c5d0c8", "inverse-line": "#2a463e" },
    dark: { inverse: "#0b1210", "inverse-ink": "#efe8d8", "inverse-ink-2": "#a7b3ac", "inverse-line": "#1a2724" },
  },
  "sales-desk": { tool: "crm", chip: 3 },
  library: { tool: "wiki", read: "newsreader" },
  letterpress: { tool: "quotes", read: "libre-caslon-text" },
};

const fontOf = (value: string | FontSpec | undefined, fallback: FontSpec): FontSpec => (value === undefined ? fallback : typeof value === "string" ? font(value) : value);

// defineTheme completes a source into a theme, and refuses one that is not
// valid (validateTheme). Contrast is not enforced here: checkTheme lists the
// pairs below AA, and the kit's tests hold every catalogue theme to zero.
export function defineTheme(source: ThemeSource): Theme {
  const body = fontOf(source.fonts.body, systemFont("sans"));
  const display = fontOf(source.fonts.display, body);
  const added = source.tool !== undefined && identityAdditions[source.id]?.tool === source.tool ? identityAdditions[source.id] : undefined;
  const read = fontOf(source.fonts.read ?? added?.read, body);
  const modes = source.modes ?? "both";
  if ((modes === "both") !== (source.dark !== undefined)) throw new RangeError(`theme ${source.id}: a dark scheme exactly when modes is "both"`);
  const light = completeScheme({ ...added?.light, ...source.light }, "light", source.palette);
  const theme: Theme = {
    id: source.id,
    name: source.name,
    description: source.description,
    ...(source.tool ? { tool: source.tool } : {}),
    fonts: { display, body, mono: fontOf(source.fonts.mono, systemFont("mono")), accent: fontOf(source.fonts.accent, display), read },
    display: { weight: 700, tracking: "0em", ...source.display },
    strong: source.strong ?? 600,
    synthesis: source.synthesis ?? true,
    modes,
    type: { ...defaultType, ...source.type },
    space: source.space ?? defaultSpace,
    radius: source.radius.chip === undefined && added?.chip !== undefined ? { ...source.radius, chip: added.chip } : source.radius,
    border: source.border ?? 1,
    ...(source.fieldPad !== undefined ? { fieldPad: source.fieldPad } : {}),
    motion: { ...defaultMotion, ...source.motion },
    light,
    dark: source.dark ? completeScheme({ ...added?.dark, ...source.dark }, "dark", source.palette) : light,
  };
  const problems = validateTheme(theme);
  if (problems.length > 0) throw new RangeError(`theme ${source.id}: ${problems.join("; ")}`);
  return theme;
}

// passes says whether a theme meets every pair of the contract.
export const passes = (theme: Theme): boolean => checkTheme(theme).length === 0;
