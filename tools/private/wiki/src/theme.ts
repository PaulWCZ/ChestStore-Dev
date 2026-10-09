import { createHash } from "node:crypto";
import { chest } from "@argentic/chest-sdk/chest";
import { defineTheme } from "@argentic/chest-ui";
import { lookColors, lookCss, resolveTheme, type Look } from "@argentic/chest-ui/runtime";
import { log } from "@argentic/chest-app";

// The wiki's own identity (DESIGN.md), "Library": warm paper, ink, one deep
// green, a reading serif (Newsreader) for titles and pages and a sober sans
// (Source Sans 3) for the interface around them. It is a theme of the kit's
// contract, checked like the catalogue's (test/theme.test.ts), and the same
// as the catalogue's "library" (the test holds them equal): a company that
// picks Library for all its tools gets exactly this. Every colour of the
// tool is here; its CSS names only the contract's tokens (app/tokens.css).
//
// The spaces' colours are the categorical slots (green 2, blue 1, plum 4,
// rust 3, ochre 7, slate 8), tuned here to the spines the wiki always had.
// Its fonts are the tool's own files in public/assets/fonts/ (served at
// /assets/fonts).
export const identity = defineTheme({
  id: "library", tool: "wiki",
  name: { en: "Library", fr: "Bibliothèque" },
  description: { en: "Calm and literate: warm paper, a reading serif, one deep green.", fr: "Calme et lettré : papier chaud, un sérif de lecture, un vert profond." },
  fonts: { display: "newsreader", body: "source-sans-3", accent: "newsreader" },
  display: { weight: 600, tracking: "-0.01em" },
  type: { xs: 0.8125, s: 0.9375, m: 1.0625, l: 1.3125, xl: 1.75, xxl: 2.5 },
  radius: { s: 5, m: 8, l: 14 },
  light: { bg: "#faf6ee", surface: "#fffdf8", "surface-2": "#f3eee2", ink: "#23201a", "ink-2": "#5d574b", line: "#e2d9c7", accent: "#1d5b43", "accent-ink": "#ffffff", "accent-soft": "#e3ede5", danger: "#a93226", "danger-soft": "#f8e1dc", ok: "#1d6b3a", "ok-soft": "#e3f0e2", focus: "#1d5b43", highlight: "#f6e3a1", "shadow-1": "0px 1px 0px rgb(60 45 20 / 0.06)", "shadow-2": "0px 10px 30px rgb(60 45 20 / 0.14), 0px 2px 6px rgb(60 45 20 / 0.06)" },
  dark: { bg: "#16140f", surface: "#211e18", "surface-2": "#2a261e", ink: "#ece5d6", "ink-2": "#b3aa98", line: "#343026", accent: "#8fcfae", "accent-ink": "#0d2419", "accent-soft": "#22362b", danger: "#ff9b8a", "danger-soft": "#3d201b", ok: "#9fdcad", "ok-soft": "#1f3524", focus: "#8fcfae", highlight: "#5c4a14" },
  palette: {
    chroma: 0.8,
    // The spaces' spines.
    light: { 1: { solid: "#2d5b8a" }, 2: { solid: "#2f6e4f" }, 3: { solid: "#a2502c" }, 4: { solid: "#7a3f6b" }, 7: { solid: "#a0700f" }, 8: { solid: "#55616c" } },
    dark: { 1: { solid: "#7fa9d6" }, 2: { solid: "#74b793" }, 3: { solid: "#df8e68" }, 4: { solid: "#c690b8" }, 7: { solid: "#d9ad55" }, 8: { solid: "#9aa8b4" } },
  },
});

// The look of a surface: the company's choice as the Chest tells it (for
// all its tools, or for this one), else the identity above. Never throws:
// the Chest unreachable, or a choice the kit cannot honour, is the
// identity. The wiki has no public part: its host's root ("/", reached
// only outside a Chest) wears the company's brand or the wiki's own look
// (the kit's surface "public"), never a catalogue theme chosen for the
// team.
//
// The look is a stylesheet the tool serves itself — /chest/look.css for
// the team's pages, /look.css for the root (served by the package) —,
// never an inline <style>: the strictest policy admits it. Its link
// carries the sheet's hash (?v=…), so a browser keeps it until the company
// chooses another look. chest.theme() keeps the Chest's answer a minute;
// the sheet of one answer is written once and kept beside it.
export type Sheet = { look: Look; css: string; etag: string; colors: { media: string; color: string }[] };
type Surface = "team" | "public";
const written = new WeakMap<object, Partial<Record<Surface, Sheet>>>();

export async function sheetOf(surface: Surface): Promise<Sheet> {
  const choice = await chest.theme();
  const kept = written.get(choice) ?? {};
  const found = kept[surface];
  if (found) return found;
  const look = resolveTheme(choice, identity, { surface, ownFonts: "/assets/fonts" });
  if (look.problem) log.warn("theme not usable: the tool's own look is used", { problem: look.problem });
  const css = lookCss(look);
  const sheet: Sheet = { look, css, etag: createHash("sha256").update(css).digest("base64url").slice(0, 16), colors: lookColors(look) };
  written.set(choice, { ...kept, [surface]: sheet });
  return sheet;
}

// The look of the team's pages (tests and the exports read it).
export async function currentLook(): Promise<Look> {
  return (await sheetOf("team")).look;
}

// What createApp({ look }) asks for each page (src/app.tsx): the sheet of
// the page's surface, and the company's logo in brand mode (the layout
// shows it where the book mark is).
export async function lookFor(viewer: { member: unknown }): Promise<{ css: string; colors: { media: string; color: string }[]; logo: Look["logo"] }> {
  const sheet = await sheetOf(viewer.member === null ? "public" : "team");
  return { css: sheet.css, colors: sheet.colors, logo: sheet.look.logo };
}
