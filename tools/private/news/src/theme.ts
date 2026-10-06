import { createHash } from "node:crypto";
import { chest } from "@argentic/chest-sdk/chest";
import { defineTheme } from "@argentic/chest-ui";
import { lookColors, lookCss, resolveTheme, type Look } from "@argentic/chest-ui/runtime";
import { log } from "@argentic/chest-app";

// The tool's own identity (DESIGN.md), "Newsprint": newsprint paper, black
// rules, a headline serif, one press red. It is a theme of the kit's
// contract, checked like the catalogue's (test/theme.test.ts), and the very
// same source as the catalogue's "newsprint" theme (the test holds the two
// equal), so News in its own look and another tool wearing "Newsprint" look
// alike. Its fonts are the tool's own files in public/assets/fonts/ (served at
// /assets/fonts). Every colour of the tool is here; its CSS names only the
// contract's tokens.
export const identity = defineTheme({
  id: "newsprint", tool: "news",
  name: { en: "Newsprint", fr: "Papier journal" },
  description: { en: "Editorial and warm: newsprint, black rules, a headline serif, press red.", fr: "Éditorial et chaleureux : papier journal, filets noirs, sérif de titre, rouge presse." },
  fonts: { display: "fraunces", body: "libre-franklin", accent: "fraunces" },
  display: { weight: 700, tracking: "-0.015em" },
  type: { l: 1.1875, xl: 1.625, xxl: 2.25 },
  radius: { s: 2, m: 4, l: 6 },
  light: { bg: "#f7f3ea", surface: "#fffdf8", ink: "#16130f", "ink-2": "#5c554b", line: "#d9d0bf", "line-strong": "#16130f", accent: "#c4121a", "accent-ink": "#ffffff", "accent-soft": "#f6ddd5", highlight: "#f2e3b8", ok: "#1d6b3a", focus: "#c4121a", "shadow-1": "0px 1px 0px rgb(22 19 15 / 0.08)", "shadow-2": "0px 10px 30px rgb(22 19 15 / 0.16)" },
  dark: { bg: "#121110", surface: "#1c1a17", ink: "#f3ede2", "ink-2": "#b8ae9e", line: "#3a352e", "line-strong": "#f3ede2", accent: "#ff6f61", "accent-ink": "#16130f", "accent-soft": "#3a1f1b", highlight: "#3b331c", ok: "#6fcf8f", focus: "#ff6f61" },
  palette: { chroma: 0.9 },
});

// The look of a surface: the company's choice as the Chest tells it (for
// all its tools, or for this one), else the identity above. Never throws:
// the Chest unreachable, or a choice the kit cannot honour, is the
// identity. News has no public part: its host's root ("/", reached only
// outside a Chest) wears the company's brand or News's own look (the kit's
// surface "public"), never a catalogue theme chosen for the team.
//
// The look is a stylesheet the tool serves itself — /chest/look.css for
// the team's pages, /look.css for the root (served by the package) —, never an
// inline <style>: the strictest policy admits it. Its link carries the
// sheet's hash (?v=…), so a browser keeps it until the company chooses
// another look. chest.theme() keeps the Chest's answer a minute; the sheet
// of one answer is written once and kept beside it.
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

// What createApp({ look }) asks for each page (src/app.tsx): the sheet of
// the page's surface. The layout shows the company's logo in brand mode:
// the look of the page it renders is kept here, by its viewer, for it
// (the package gives a layout no look of its own).
const shown = new WeakMap<object, Look>();
export async function lookFor(viewer: { member: unknown }): Promise<{ css: string; colors: { media: string; color: string }[] }> {
  const sheet = await sheetOf(viewer.member === null ? "public" : "team");
  shown.set(viewer, sheet.look);
  return { css: sheet.css, colors: sheet.colors };
}
export const logoOf = (viewer: object): Look["logo"] => shown.get(viewer)?.logo ?? null;
