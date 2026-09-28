// The look of a page, on the server: which theme applies (the company's
// choice, told by the Chest, or the tool's own identity) and the <style>
// element that applies it. No script runs in the browser for theming: the
// page arrives with its colours, fonts and dark mode already set.
//
//   import * as chest from "@argentic/chest-sdk/chest";
//   import { resolveTheme, themeStyle } from "@argentic/chest-ui/runtime";
//   const look = resolveTheme(await chest.theme(), ownTheme);
//   html = `<head>${themeStyle(look, nonce)}…`;
//
// The kit does not import the SDK: resolveTheme reads the SDK's answer by
// its shape (ThemeChoice below mirrors chest.theme()'s).
import type { Theme } from "./contract.js";
import { themeColors, themeCss } from "./css.js";
import { deriveTheme, type Brand, type BrandFont } from "./derive.js";
import { familyPattern, fontBasePattern, fontUrlPattern, type FontSource, type FontSpec } from "./fonts.js";
import type { Note } from "./notes.js";
import { themeOf } from "./themes.js";

type FontFile = { url: string; weight: string; style: "normal" | "italic" };
type ChoiceFont = { id: string } | { family: string; files: FontFile[] } | null;
// What chest.theme() answers (Proposal (studio), SDK 0.3.0-studio.11).
export type ThemeChoice =
  | { mode: "own"; scope?: string }
  | { mode: "catalogue"; theme: string; fonts?: string; faces?: ({ family: string } & FontFile)[]; scope?: string }
  | { mode: "brand"; brand: { name?: string; primary: string; secondary?: string | null; neutral?: string | null; corners?: "sharp" | "soft" | "round"; density?: "comfortable" | "compact"; display?: ChoiceFont; body?: ChoiceFont; logo?: { url: string; alt?: string } | null }; fonts?: string; scope?: string };

// A page's look: the theme, where it came from, where its registered fonts
// are served, the company's logo (brand only), and what the kit had to do
// (a catalogue theme it does not know, a brand it could not read).
export type Look = { theme: Theme; source: "own" | "catalogue" | "brand"; fontBase: string; logo: { url: string; alt: string } | null; notes: Note[]; problem: string | null };

export type ResolveOptions = {
  // Where the tool serves its own identity's fonts ("/fonts" by default).
  ownFonts?: string;
};

const chestFonts = "/_chest/theme/fonts";

const brandFont = (value: ChoiceFont | undefined): BrandFont | undefined => {
  if (!value) return undefined;
  if ("id" in value) return { id: value.id };
  return { family: value.family, files: value.files.map((f): FontSource => ({ url: f.url, weight: f.weight, style: f.style })) };
};

// resolveTheme: the Chest's choice first, the tool's own identity otherwise.
// Never throws: a choice the kit cannot honour (a theme id it does not
// know, a brand it cannot read) falls back to the tool's own look, and
// says why in problem (for the tool's logs, never the page).
export function resolveTheme(choice: ThemeChoice | null | undefined, own: Theme, options: ResolveOptions = {}): Look {
  const ownFonts = options.ownFonts ?? "/fonts";
  const mine: Look = { theme: own, source: "own", fontBase: ownFonts, logo: null, notes: [], problem: null };
  if (!choice || choice.mode === "own") return mine;
  const base = choice.fonts && fontBasePattern.test(choice.fonts) && !choice.fonts.includes("..") ? choice.fonts : chestFonts;
  if (choice.mode === "catalogue") {
    const found = themeOf(choice.theme);
    if (!found) return { ...mine, problem: `unknown catalogue theme "${choice.theme}"` };
    // Fonts the theme names without files (the portal's Suisse), which the
    // Chest serves: their faces join the theme's.
    const faces = (choice.faces ?? []).filter(f => familyPattern.test(f.family) && fontUrlPattern.test(f.url));
    const withFaces = (spec: FontSpec): FontSpec => {
      if (spec.id || !spec.family) return spec;
      const files = faces.filter(f => f.family === spec.family).map((f): FontSource => ({ url: f.url, weight: f.weight, style: f.style }));
      return files.length > 0 ? { ...spec, files } : spec;
    };
    const theme = faces.length === 0 ? found : { ...found, fonts: { display: withFaces(found.fonts.display), body: withFaces(found.fonts.body), mono: withFaces(found.fonts.mono), accent: withFaces(found.fonts.accent) } };
    return { theme, source: "catalogue", fontBase: base, logo: null, notes: [], problem: null };
  }
  if (choice.mode === "brand") {
    const b = choice.brand;
    const display = brandFont(b.display), body = brandFont(b.body);
    const brand: Brand = {
      primary: b.primary,
      ...(b.name ? { name: b.name } : {}),
      ...(b.secondary ? { secondary: b.secondary } : {}),
      ...(b.neutral ? { neutral: b.neutral } : {}),
      ...(display ? { display } : {}),
      ...(body ? { body } : {}),
      ...(b.corners ? { corners: b.corners } : {}),
      ...(b.density ? { density: b.density } : {}),
      logo: b.logo ?? null,
    };
    try {
      const derived = deriveTheme(brand);
      return { theme: derived.theme, source: "brand", fontBase: base, logo: derived.logo, notes: derived.notes, problem: null };
    } catch (error) {
      return { ...mine, problem: `brand not usable: ${(error as Error).message}` };
    }
  }
  return { ...mine, problem: "unknown choice" };
}

const noncePattern = /^[A-Za-z0-9+/_=-]{8,128}$/u;

// themeStyle writes the <style> element of a look (or of a theme, with its
// fonts under /fonts), carrying the page's nonce so a strict
// Content-Security-Policy (style-src 'nonce-…') admits it. A nonce that
// is not one is refused rather than written into the page.
export function themeStyle(look: Look | Theme, nonce?: string | null): string {
  if (nonce != null && !noncePattern.test(nonce)) throw new RangeError("a nonce is 8 to 128 base64 characters");
  const css = "theme" in look ? themeCss(look.theme, { fontBase: look.fontBase }) : themeCss(look, {});
  return `<style${nonce ? ` nonce="${nonce}"` : ""} data-chest-theme="${"theme" in look ? look.theme.id : look.id}">${css}</style>`;
}

// lookCss: the stylesheet of a look (for a framework that writes the
// element itself, such as React: see @argentic/chest-ui/react).
export function lookCss(look: Look): string {
  return themeCss(look.theme, { fontBase: look.fontBase });
}

// lookColors: the browser bar's colours of a look.
export const lookColors = (look: Look): { media: string; color: string }[] => themeColors(look.theme);

// nonceOf reads the nonce of a Content-Security-Policy value (the header a
// tool's proxy set on the request), or null.
export function nonceOf(policy: string | null | undefined): string | null {
  const found = /'nonce-([A-Za-z0-9+/_=-]{8,128})'/u.exec(policy ?? "");
  return found ? found[1]! : null;
}

// A note for the owner when a brand's font or colour was changed (the
// Chest's admin shows them as the owner edits the brand).
export const lookNotes = (look: Look, locale: "en" | "fr"): string[] => look.notes.map(n => n[locale]);

