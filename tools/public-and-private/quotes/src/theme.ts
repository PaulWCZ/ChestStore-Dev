import { createHash } from "node:crypto";
import { chest } from "@argentic/chest-sdk/chest";
import { defineTheme } from "@argentic/chest-ui";
import { lookColors, lookCss, resolveTheme, type Look } from "@argentic/chest-ui/runtime";
import { log } from "@argentic/chest-app";

// The tool's own identity (DESIGN.md), "Letterpress": exact and formal —
// crisp paper on a quiet desk, blue-black ink, an oxblood seal, a Caslon
// for what is printed and a clean grotesque for the controls. It is a theme
// of the kit's contract, checked like the catalogue's (test/theme.test.ts),
// and the very same source as the catalogue's "letterpress" theme (the test
// holds the two equal), so Quotes in its own look and another tool wearing
// "Letterpress" look alike. Its fonts are the tool's own files in
// public/assets/fonts/ (served at /assets/fonts). Every colour of the
// tool's screens is here; its CSS names only the contract's tokens (and
// src/tokens.css, defined from them).
//
// The PDF is not the screen: an issued invoice is a legal document, drawn
// by src/lib/pdf/ in its own neutral print design (black on white,
// Liberation fonts) whatever the look the company chose.
export const identity = defineTheme({
  id: "letterpress", tool: "quotes",
  name: { en: "Letterpress", fr: "Typographie" },
  description: { en: "Exact and formal: crisp paper on a quiet desk, blue-black ink, an oxblood seal, a Caslon.", fr: "Exact et formel : papier net sur un bureau calme, encre bleu-noir, un sceau bordeaux, une Caslon." },
  fonts: { display: "libre-caslon-text", body: "hanken-grotesk", accent: "libre-caslon-text" },
  display: { weight: 400 },
  type: { xl: 1.875, xxl: 2.5 },
  radius: { s: 3, m: 6, l: 10 },
  light: { bg: "#f3f1ec", surface: "#ffffff", "surface-2": "#f7f5f1", ink: "#161b2e", "ink-2": "#4f5468", line: "#dcd8cf", "line-strong": "#8e8a80", accent: "#8a1f30", "accent-ink": "#ffffff", "accent-soft": "#f7e8ea", ok: "#1c6a47", "ok-soft": "#e6f1ea", focus: "#2346a8", "shadow-1": "0px 1px 2px rgb(22 27 46 / 0.1)", "shadow-2": "0px 10px 30px rgb(22 27 46 / 0.18)" },
  dark: { bg: "#12151f", surface: "#1a1e2b", "surface-2": "#222736", ink: "#e8e4db", "ink-2": "#a9adbd", line: "#333a4d", "line-strong": "#6b7186", accent: "#f08f9c", "accent-ink": "#1a0d10", "accent-soft": "#2a1c22", ok: "#7fd1a6", "ok-soft": "#16271f", focus: "#8fb3ff", "shadow-1": "0px 1px 2px rgb(0 0 0 / 0.4)", "shadow-2": "0px 10px 30px rgb(0 0 0 / 0.5)" },
  palette: { chroma: 0.75 },
});

// The look of a surface: the company's choice as the Chest tells it (for
// all its tools, or for this one), else the identity above. The public
// pages (a client's quote) wear the company's brand when it has one, else
// Quotes' own identity — never a catalogue theme chosen for the team, never
// the Chest's sheet (kit surface "public"). Never throws: the Chest
// unreachable, or a choice the kit cannot honour, is the identity.
//
// The look is a stylesheet the tool serves itself — /chest/look.css for
// the team's pages, /look.css for the public ones (createApp's look,
// src/app.tsx) —, never an inline <style>: the strictest policy admits it,
// so Quotes needs no "csp" permission. Its link carries the sheet's hash
// (?v=…), so a browser keeps it until the company chooses another look.
// chest.theme() keeps the Chest's answer a minute (a public page never
// asks the Chest per request); the sheet of one answer is written once and
// kept beside it.
export type Sheet = { look: Look; css: string; etag: string; colors: { media: string; color: string }[] };
export type Surface = "team" | "public";
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
