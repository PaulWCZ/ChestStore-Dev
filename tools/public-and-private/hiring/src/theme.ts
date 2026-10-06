import { chest } from "@argentic/chest-sdk/chest";
import { defineTheme, identityOf, themeCss, type Theme, type ThemeSource } from "@argentic/chest-ui";
import { lookColors, lookCss, resolveTheme, type Look } from "@argentic/chest-ui/runtime";
import { log } from "@argentic/chest-app";
import { accents, type Accent } from "./lib/jobs.ts";

// Hiring's own identity (DESIGN.md), "Magazine": an editorial careers
// magazine — warm cream paper, deep cobalt ink, one tomato accent, a
// characterful grotesque for the big words. The identity is the
// catalogue's own "magazine" theme, imported from the kit (identityOf);
// the source below is kept only to make the careers page's other accents
// (Settings → Colour) and must stay the catalogue's source
// (test/theme.test.ts holds defineTheme(source) equal to the identity: a
// copy had kept a plum dark slot 3 that kit 0.2.1 made an orange). Every
// colour of the tool is here; its CSS names only the contract's tokens.
export const source: ThemeSource = {
  id: "magazine", tool: "hiring",
  name: { en: "Magazine", fr: "Magazine" },
  description: { en: "Confident and editorial: cream paper, deep cobalt, a tomato accent, big characterful words.", fr: "Assuré et éditorial : papier crème, cobalt profond, touche tomate, grands mots de caractère." },
  fonts: { display: "bricolage-grotesque", body: "instrument-sans" },
  display: { weight: 700, tracking: "-0.02em" },
  type: { xs: 0.8125, l: 1.1875, xl: 1.625, xxl: 2.75 },
  radius: { s: 6, m: 10, l: 18 },
  light: { bg: "#f6f0e4", surface: "#fffaf1", "surface-2": "#efe6d4", ink: "#1a1a2e", "ink-2": "#5b5a6e", line: "#e2d7c1", "line-strong": "#8d8474", accent: "#1c2b8f", "accent-ink": "#f6f0e4", "accent-soft": "#e4e7fb", ok: "#1d6b43", "ok-soft": "#dcefe2", danger: "#b0281a", focus: "#1c2b8f", "shadow-1": "0px 1px 0px rgb(26 26 46 / 0.06), 0px 1px 3px rgb(26 26 46 / 0.06)", "shadow-2": "0px 12px 32px rgb(26 26 46 / 0.16)" },
  dark: { bg: "#10133a", surface: "#181c4a", "surface-2": "#141840", ink: "#f6f0e4", "ink-2": "#a9a8bf", line: "#2a2f66", "line-strong": "#6d72a8", accent: "#9fb0ff", "accent-ink": "#10133a", "accent-soft": "#252b6b", ok: "#7fd6a2", "ok-soft": "#173a36", danger: "#ff9a8a", focus: "#ffcf70" },
  palette: {
    // Tomato (slot 3, the orange family): kickers, "new", the index numbers.
    light: { 3: { solid: "#c93a1e", soft: "#fde3da", ink: "#7a2410" } },
    dark: { 3: { solid: "#ff8a6b", soft: "#422115", ink: "#ffc2b1" } },
  },
};

const magazine = identityOf("hiring");
if (!magazine) throw new Error("the UI kit has no identity for Hiring");
export const identity: Theme = magazine;

// The careers page's colour (Settings → Colour), when Hiring wears its own
// look: the identity with another accent, light and dark — each a whole
// theme, checked against the contract like the identity. With a theme of
// the catalogue or the company's brand chosen in the Chest, the Chest's
// look wins and this choice waits (lib/careers.ts).
type AccentColours = { accent: string; "accent-ink": string; "accent-soft": string; focus?: string };
const accentColours: Record<Exclude<Accent, "cobalt">, { light: AccentColours; dark: AccentColours }> = {
  forest: { light: { accent: "#1f5c3a", "accent-ink": "#f6f0e4", "accent-soft": "#dcece2", focus: "#1f5c3a" }, dark: { accent: "#86d6a6", "accent-ink": "#10133a", "accent-soft": "#173a2a" } },
  plum: { light: { accent: "#6b2a5e", "accent-ink": "#f6f0e4", "accent-soft": "#f1dfec", focus: "#6b2a5e" }, dark: { accent: "#e3a6d6", "accent-ink": "#10133a", "accent-soft": "#3a1d38" } },
  tomato: { light: { accent: "#a8321b", "accent-ink": "#ffffff", "accent-soft": "#fde3da", focus: "#a8321b" }, dark: { accent: "#ff9a80", "accent-ink": "#10133a", "accent-soft": "#3d1f25" } },
  ocean: { light: { accent: "#0b5a73", "accent-ink": "#f6f0e4", "accent-soft": "#d8ecf2", focus: "#0b5a73" }, dark: { accent: "#7fcbe3", "accent-ink": "#10133a", "accent-soft": "#123448" } },
  graphite: { light: { accent: "#2b2b2b", "accent-ink": "#f6f0e4", "accent-soft": "#e6e2da", focus: "#2b2b2b" }, dark: { accent: "#e6e2da", "accent-ink": "#10133a", "accent-soft": "#2a2d45" } },
};

export const accentThemes: Record<Accent, Theme> = {
  cobalt: identity,
  ...(Object.fromEntries(Object.entries(accentColours).map(([name, c]) => [name, defineTheme({ ...source, id: `magazine-${name}`, light: { ...source.light, ...c.light }, dark: { ...source.dark!, ...c.dark } })])) as Record<Exclude<Accent, "cobalt">, Theme>),
};

// accentCss: the stylesheet that gives the elements of one class the
// accent's theme (no font faces: the page's style already has them). A
// class selector, so the careers page and the settings' swatches only.
export function accentCss(accent: Accent, selector: string): string {
  return themeCss(accentThemes[accent], { selector, faces: false });
}

// The look of a surface: the team's pages wear what the company chose
// (for all its tools, or for Hiring), else the identity; the public pages
// (the careers page, a job, the form, a candidate's link) wear the
// company's brand when it has one, else Hiring's own look in the accent
// chosen in Settings — never a catalogue theme chosen for the team's tools
// (kit surface "public"). Never throws: the Chest unreachable, or a
// choice the kit cannot honour, is the identity.
//
// The look is a stylesheet the tool serves itself — /chest/look.css for
// the team's pages, /look.css for the public ones (createApp's look,
// src/app.tsx) —, never an inline <style>: the strict policy admits it.
// Its link carries the sheet's hash, so a browser keeps it until the look
// changes. chest.theme() keeps the Chest's answer a minute (never a call
// per public request); the sheet of one answer is written once and kept
// beside it. The team's sheet also carries each accent's swatch (Settings
// → Colour), scoped to its class.
export type Sheet = { look: Look; css: string; colors: { media: string; color: string }[] };
const written = new WeakMap<object, Map<string, Sheet>>();

export async function sheetOf(surface: "team" | "public", accent: Accent = "cobalt"): Promise<Sheet> {
  const choice = await chest.theme();
  const kept = written.get(choice) ?? new Map<string, Sheet>();
  const key = surface === "team" ? "team" : `public:${accent}`;
  const found = kept.get(key);
  if (found) return found;
  const look = resolveTheme(choice, surface === "team" ? identity : accentThemes[accent], { surface, ownFonts: "/assets/fonts" });
  if (look.problem) log.warn("theme not usable: the tool's own look is used", { problem: look.problem });
  const swatches = surface === "team" ? "\n" + accents.map(a => accentCss(a, `.swatch-${a}`)).join("\n") : "";
  const sheet: Sheet = { look, css: lookCss(look) + swatches, colors: lookColors(look) };
  kept.set(key, sheet);
  written.set(choice, kept);
  return sheet;
}

export async function lookOf(surface: "team" | "public", accent: Accent = "cobalt"): Promise<Look> {
  return (await sheetOf(surface, accent)).look;
}
