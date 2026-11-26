import { chest } from "@argentic/chest-sdk/chest";
import { defineTheme } from "@argentic/chest-ui";
import { lookColors, lookCss, resolveTheme, type Look } from "@argentic/chest-ui/runtime";
import { log } from "@argentic/chest-app";

// The tool's own identity (DESIGN.md), "Blueprint": pale blue-white
// drafting paper, navy ink, thin lines, and one signal orange for what is
// yours or taken. It is a theme of the kit's contract, checked like the
// catalogue's (test/theme.test.ts), and the same as the catalogue's
// "blueprint" (the test holds them equal): a company that picks Blueprint
// for all its tools gets exactly this. Every colour of the tool is here;
// its CSS names only the contract's tokens (src/tokens.css).
//
// Navy is the one action colour (buttons, the chosen day); orange is
// categorical slot 3 ("yours, or taken"), so it stays an orange in every
// theme. Its fonts are the tool's own files in public/assets/fonts/ (served
// at /assets/fonts).
export const identity = defineTheme({
  id: "blueprint",
  tool: "rooms",
  name: { en: "Blueprint", fr: "Plan d’architecte" },
  description: { en: "Calm and precise: drafting paper, navy ink, thin lines, one signal orange.", fr: "Calme et précis : papier à dessin, encre marine, traits fins, un orange signal." },
  fonts: { display: "albert-sans", body: "albert-sans", mono: "dm-mono" },
  display: { weight: 700, tracking: "-0.01em" },
  type: { xl: 1.625, xxl: 2.125 },
  radius: { s: 4, m: 6, l: 10 },
  motion: { ease: "cubic-bezier(0.2, 0.8, 0.2, 1)", slow: 220 },
  light: { bg: "#f3f7fc", surface: "#ffffff", "surface-2": "#e8f0f9", ink: "#0f2447", "ink-2": "#4a5d7e", line: "#c3d3e8", "line-strong": "#0f2447", accent: "#0f2447", "accent-ink": "#ffffff", "accent-soft": "#e8f0f9", "accent-text": "#1f5fbf", danger: "#b3261e", focus: "#1f5fbf", overlay: "rgb(15 36 71 / 0.4)", "shadow-1": "0px 1px 0px rgb(15 36 71 / 0.06)", "shadow-2": "0px 1px 0px rgb(15 36 71 / 0.06), 0px 8px 24px -12px rgb(15 36 71 / 0.25)" },
  dark: { bg: "#0b1a30", surface: "#102440", "surface-2": "#16304f", ink: "#e8f0fb", "ink-2": "#a9bcd8", line: "#2b4668", "line-strong": "#e8f0fb", accent: "#e8f0fb", "accent-ink": "#0b1a30", "accent-soft": "#16304f", "accent-text": "#8cb8ff", danger: "#ff8a80", focus: "#8cb8ff", "shadow-1": "0px 1px 0px rgb(0 0 0 / 0.3)", "shadow-2": "0px 1px 0px rgb(0 0 0 / 0.3), 0px 8px 24px -12px rgb(0 0 0 / 0.6)" },
  palette: {
    chroma: 0.9,
    // Signal orange: yours, or taken.
    light: { 3: { solid: "#c2410c", soft: "#fdebe0", ink: "#b93d0b" } },
    dark: { 3: { solid: "#ff8a4c", soft: "#3a2a26", ink: "#ff8a4c" } },
  },
});

// The look of a surface: the company's choice as the Chest tells it (for
// all its tools, or for this one), else the identity above. Never throws:
// the Chest unreachable, or a choice the kit cannot honour, is the
// identity. Rooms has no public part: its host's root (reached only
// outside a Chest) wears the company's brand or Rooms' own look (the kit's
// surface "public"), never a catalogue theme chosen for the team.
//
// The look is a stylesheet the tool serves itself — /chest/look.css for
// the team's pages, /look.css for the root (served by the package) —,
// never an inline <style>: the strictest policy admits it, so Rooms needs
// no "csp" permission. Its link carries the sheet's hash (?v=…), so a
// browser keeps it until the company chooses another look. chest.theme()
// keeps the Chest's answer a minute; the sheet of one answer is written
// once and kept beside it.
export type Sheet = { look: Look; css: string; colors: { media: string; color: string }[] };
type Surface = "team" | "public";
const written = new WeakMap<object, Partial<Record<Surface, Sheet>>>();

export async function sheetOf(surface: Surface): Promise<Sheet> {
  const choice = await chest.theme();
  const kept = written.get(choice) ?? {};
  const found = kept[surface];
  if (found) return found;
  const look = resolveTheme(choice, identity, { surface, ownFonts: "/assets/fonts" });
  if (look.problem) log.warn("theme not usable: the tool's own look is used", { problem: look.problem });
  const sheet: Sheet = { look, css: lookCss(look), colors: lookColors(look) };
  written.set(choice, { ...kept, [surface]: sheet });
  return sheet;
}

// What createApp({ look }) asks for each page (src/app.tsx): the sheet of
// the page's surface, and the company's logo in brand mode (the layout
// shows it beside the name).
export async function lookFor(viewer: { member: unknown }): Promise<{ css: string; colors: { media: string; color: string }[]; logo: Look["logo"] }> {
  const sheet = await sheetOf(viewer.member === null ? "public" : "team");
  return { css: sheet.css, colors: sheet.colors, logo: sheet.look.logo };
}
