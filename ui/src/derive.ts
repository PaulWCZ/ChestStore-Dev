// deriveTheme: a whole theme from a company's brand — its main colour, maybe
// a second one and a grey tint, its fonts, its corners and density, its
// logo — in light and dark, meeting every pair of the contract (WCAG AA).
// Colours are moved only as much as reading needs (lightness in OKLCH, hue
// kept), and every move is said in plain words, in English and French.
import { contrast, fit, hex, hueDistance, oklch, oklchHex, type Oklch } from "./color.js";
import { completeScheme, familyHues, type PaletteSource, type SchemeSource } from "./compose.js";
import { checkTheme, validateTheme, type Theme } from "./contract.js";
import { font, registry, uploadedFont, type FontCategory, type FontSource, type FontSpec } from "./fonts.js";
import { note, type Note } from "./notes.js";

export type Corners = "sharp" | "soft" | "round";
export type Density = "comfortable" | "compact";

// A font of the brand: one of the kit's (by id), or the company's own
// files, served by its Chest.
export type BrandFont = { id: string } | { family: string; files: FontSource[]; category?: FontCategory };

// A company's brand, as its owner gives it once in the Chest.
export type Brand = {
  name?: string;
  primary: string;
  secondary?: string;
  neutral?: string;
  display?: BrandFont;
  body?: BrandFont;
  corners?: Corners;
  density?: Density;
  logo?: { url: string; alt?: string } | null;
};

export type Derived = { theme: Theme; notes: Note[]; logo: { url: string; alt: string } | null };

export class BrandError extends Error {
  constructor(readonly code: "invalid_primary" | "invalid_secondary" | "invalid_neutral" | "invalid_font" | "invalid_logo" | "invalid_name" | "invalid_option", message: string) {
    super(message);
    this.name = "BrandError";
  }
}

export const logoUrlPattern = /^\/[A-Za-z0-9._~\-/]{1,200}\.(svg|png|webp|jpe?g)$/u;
const radii: Record<Corners, Theme["radius"]> = { sharp: { s: 2, m: 3, l: 4 }, soft: { s: 6, m: 10, l: 16 }, round: { s: 10, m: 16, l: 24 } };
const densities: Record<Density, { space: Theme["space"]; type: Theme["type"] }> = {
  comfortable: { space: [4, 8, 12, 16, 24, 32, 48, 72], type: { xs: 0.75, s: 0.875, m: 1, l: 1.25, xl: 1.75, xxl: 2.25, leading: 1.5 } },
  compact: { space: [4, 6, 8, 12, 16, 24, 32, 48], type: { xs: 0.75, s: 0.8125, m: 0.9375, l: 1.125, xl: 1.5, xxl: 2, leading: 1.45 } },
};

const at = (c: Oklch, l: number, chroma: number = c.c): string => oklchHex({ l, c: chroma, h: c.h });
const must = (value: string | null): string => {
  if (value === null) throw new Error("no lightness of this hue reaches the contrast asked");
  return value;
};

function brandFont(value: BrandFont | undefined, role: "display" | "body", notes: Note[]): FontSpec | null {
  if (!value) return null;
  if ("id" in value) {
    if (registry.has(value.id)) return font(value.id);
    notes.push(note("font_unknown", { font: String(value.id).slice(0, 64), fallback: role === "body" ? "Inter" : "Inter" }));
    return null;
  }
  try {
    return uploadedFont(value.family, value.files, value.category ?? "sans");
  } catch {
    throw new BrandError("invalid_font", `the ${role} font: a family name and files on the tool's origin`);
  }
}

// Remembered derivations: a page renders the same brand on every request.
const cache = new Map<string, Derived>();

// deriveTheme turns a brand into a theme with AA contrast in both modes,
// the notes of what was adjusted, and the logo to show. It throws
// BrandError for a brand it cannot read (a colour that is not one, a file
// that is not on the tool's origin).
export function deriveTheme(brand: Brand): Derived {
  const key = JSON.stringify(brand);
  const kept = cache.get(key);
  if (kept) return kept;
  const derived = derive(brand);
  if (cache.size >= 16) cache.delete(cache.keys().next().value!);
  cache.set(key, derived);
  return derived;
}

function derive(brand: Brand): Derived {
  const notes: Note[] = [];
  const primaryHex = typeof brand.primary === "string" ? hex(brand.primary) : null;
  if (!primaryHex) throw new BrandError("invalid_primary", "the main colour is not a colour");
  const p = oklch(primaryHex)!;
  const secondaryHex = brand.secondary === undefined || brand.secondary === "" ? null : hex(brand.secondary);
  if (brand.secondary && !secondaryHex) throw new BrandError("invalid_secondary", "the second colour is not a colour");
  const neutralHex = brand.neutral === undefined || brand.neutral === "" ? null : hex(brand.neutral);
  if (brand.neutral && !neutralHex) throw new BrandError("invalid_neutral", "the grey tint is not a colour");
  const corners = brand.corners ?? "soft";
  const density = brand.density ?? "comfortable";
  if (!(corners in radii) || !(density in densities)) throw new BrandError("invalid_option", "corners: sharp, soft or round; density: comfortable or compact");
  const name = (brand.name ?? "").replace(/\p{Cc}/gu, "").trim();
  if (name.length > 80) throw new BrandError("invalid_name", "a name of 80 characters at most");
  let logo: Derived["logo"] = null;
  if (brand.logo) {
    if (typeof brand.logo.url !== "string" || !logoUrlPattern.test(brand.logo.url) || brand.logo.url.includes("..")) throw new BrandError("invalid_logo", "the logo is an image on the tool's origin (svg, png, webp, jpg)");
    logo = { url: brand.logo.url, alt: (brand.logo.alt ?? name).replace(/\p{Cc}/gu, "").trim().slice(0, 120) };
  }

  // Greys: the brand's own tint if given, else a whisper of the main colour.
  const n = neutralHex ? oklch(neutralHex)! : p;
  const nc = neutralHex ? Math.min(n.c, 0.03) : Math.min(p.c * 0.12, 0.012);
  if (neutralHex && n.c >= 0.005) notes.push(note("neutral_used", { colour: neutralHex }));
  const grey = { l: 0, c: nc, h: n.h };
  const white = "#ffffff";

  const light: Partial<SchemeSource> & Record<string, string> = {};
  light.bg = at(grey, 0.975, nc * 0.8);
  light.surface = at(grey, 0.997, nc * 0.25);
  light["surface-2"] = at(grey, 0.945, nc);
  light.ink = at(grey, 0.21, Math.min(nc * 1.6, 0.03));
  light["ink-2"] = must(fit(at(grey, 0.47, nc * 1.4), [light.bg, light.surface, light["surface-2"]], 4.5, "darker"));
  light.line = at(grey, 0.9, nc);
  light["line-strong"] = must(fit(at(grey, 0.62, nc), [light.bg, light.surface, light["surface-2"]], 3, "darker"));

  const dark: Partial<SchemeSource> & Record<string, string> = {};
  dark.bg = at(grey, 0.165, nc * 1.1);
  dark.surface = at(grey, 0.205, nc * 1.1);
  dark["surface-2"] = at(grey, 0.255, nc * 1.1);
  dark.ink = at(grey, 0.955, nc * 0.6);
  dark["ink-2"] = must(fit(at(grey, 0.76, nc), [dark.bg, dark.surface, dark["surface-2"]], 4.5, "lighter"));
  dark.line = at(grey, 0.31, nc);
  dark["line-strong"] = must(fit(at(grey, 0.52, nc), [dark.bg, dark.surface, dark["surface-2"]], 3, "lighter"));

  // The accent, light: the brand colour itself when white text reads on it;
  // a light brand colour keeps its fill and takes dark text; otherwise it
  // is darkened just enough.
  if (p.c < 0.03) notes.push(note("primary_grey"));
  light["accent-soft"] = at(p, 0.95, Math.min(p.c * 0.35, 0.05));
  if (contrast(primaryHex, white) >= 4.5) {
    light.accent = primaryHex;
    light["accent-ink"] = white;
  } else if (p.l >= 0.68 && contrast(primaryHex, light.ink) >= 4.5) {
    light.accent = primaryHex;
    light["accent-ink"] = light.ink;
    notes.push(note("accent_dark_text", { colour: primaryHex }));
  } else {
    light.accent = must(fit(primaryHex, [white], 4.5, "darker"));
    light["accent-ink"] = white;
    notes.push(note("accent_darkened", { colour: primaryHex }));
  }
  if (contrast(light.accent, light.surface) < 3 || contrast(light.accent, light.bg) < 3) {
    light["accent-line"] = light.ink;
    notes.push(note("accent_edge"));
  } else light["accent-line"] = light.accent;
  light["accent-text"] = must(fit(light["accent-ink"] === white ? light.accent : primaryHex, [light.bg, light.surface, light["accent-soft"]], 4.5, "darker"));
  if (light["accent-ink"] !== white) notes.push(note("accent_text", { colour: primaryHex }));
  light.focus = light["accent-text"];

  // The accent, dark: light enough to read on the dark grounds, dark text on it.
  dark["accent-soft"] = at(p, 0.31, Math.min(p.c * 0.45, 0.06));
  dark.accent = must(fit(p.l < 0.72 ? at(p, 0.74) : primaryHex, [dark.bg, dark.surface, dark["accent-soft"]], 4.5, "lighter"));
  dark["accent-ink"] = dark.bg;
  dark["accent-text"] = dark.accent;
  dark.focus = dark.accent;
  if (dark.accent !== primaryHex) notes.push(note("dark_lighter", { colour: primaryHex }));

  // A second colour: the marker pen, and its family in the palette.
  const palette: PaletteSource = { hues: {}, chroma: Math.max(0.6, Math.min(1.25, p.c / 0.14)) };
  const nearest = (h: number, taken: number[]) => familyHues.slice(0, 7).map((fh, i) => ({ slot: i + 1, d: hueDistance(fh, h) })).filter(x => !taken.includes(x.slot)).sort((a, b) => a.d - b.d)[0]!.slot;
  const taken: number[] = [];
  if (p.c >= 0.05) {
    const slot = nearest(p.h, taken);
    palette.hues![slot] = p.h;
    taken.push(slot);
  }
  if (secondaryHex) {
    const s = oklch(secondaryHex)!;
    light.highlight = must(fit(at(s, 0.93, Math.min(s.c * 0.45, 0.09)), [light.ink], 4.5, "lighter"));
    dark.highlight = must(fit(at(s, 0.34, Math.min(s.c * 0.4, 0.07)), [dark.ink], 4.5, "darker"));
    if (s.c >= 0.05) palette.hues![nearest(s.h, taken)] = s.h;
    notes.push(note("secondary_used", { colour: secondaryHex }));
  }
  if (p.c >= 0.08 && hueDistance(p.h, 27) < 22) notes.push(note("accent_like_danger", { colour: primaryHex }));
  else if (p.c >= 0.08 && hueDistance(p.h, 150) < 22) notes.push(note("accent_like_ok", { colour: primaryHex }));

  const body = brandFont(brand.body, "body", notes) ?? font("inter");
  const display = brandFont(brand.display, "display", notes) ?? body;
  const inputs = { name, primary: primaryHex, secondary: secondaryHex, neutral: neutralHex };
  const theme: Theme = {
    id: "brand",
    name: { en: name || "Your brand", fr: name || "Votre marque" },
    description: { en: `Made from ${name || "your brand"}’s colours: ${[inputs.primary, inputs.secondary].filter(Boolean).join(", ")}.`, fr: `Fait des couleurs de ${name || "votre marque"}${" "}: ${[inputs.primary, inputs.secondary].filter(Boolean).join(", ")}.` },
    fonts: { display, body, mono: { family: "", stack: "ui-monospace, 'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace" }, accent: display },
    display: { weight: display.id === "young-serif" || display.id === "libre-caslon-text" ? 400 : 700, tracking: corners === "sharp" ? "-0.02em" : "-0.01em" },
    strong: 600,
    synthesis: true,
    modes: "both",
    type: densities[density].type,
    space: densities[density].space,
    radius: radii[corners],
    border: 1,
    motion: { ease: "cubic-bezier(0.2, 0.7, 0.2, 1)", fast: 120, slow: 240 },
    light: completeScheme(light as SchemeSource, "light", palette),
    dark: completeScheme(dark as SchemeSource, "dark", palette),
  };
  // The promise of the kit: a brand theme always passes. A failure here is
  // the kit's bug, never the company's.
  const problems = [...validateTheme(theme), ...checkTheme(theme).map(f => `${f.mode} ${f.fg} on ${f.on}: ${f.ratio}`)];
  if (problems.length > 0) throw new Error(`deriveTheme: ${problems.join("; ")}`);
  return { theme, notes, logo };
}
