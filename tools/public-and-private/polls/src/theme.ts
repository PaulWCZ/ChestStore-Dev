import { createHash } from "node:crypto";
import { chest } from "@argentic/chest-sdk/chest";
import { defineTheme } from "@argentic/chest-ui";
import { lookColors, lookCss, resolveTheme, type Look } from "@argentic/chest-ui/runtime";
import { log } from "./core/log.ts";

// The tool's own identity (DESIGN.md), "Confetti": playful and quick —
// coral, deep navy and mint on warm paper, chunky rounded shapes that press
// down like real buttons, Fredoka and Plus Jakarta Sans. It is a theme of
// the kit's contract, checked like the catalogue's (test/theme.test.ts),
// and the same as the catalogue's "confetti" (the test holds them equal): a
// company that picks Confetti for all its tools gets exactly this. Every
// colour of the tool is here; its CSS names only the contract's tokens
// (src/tokens.css).
//
// Where the colours went: coral is the accent (its ledge `accent-line`,
// coral as text `accent-text`); the mint of "yes" and the sun of "if need
// be" are the states ok and wait (their soft grounds and inks are exactly
// Polls' mint-soft/mint-ink and sun-soft/sun-ink); the kinds of poll and
// the charts use the categorical palette — question 3 (orange, next to
// coral), date 6 (teal, tuned here to mint's hue, 175°), survey 7 (ochre,
// the sun), and slot 1 (blue) for the confetti's sky. Its fonts are the
// tool's own files in public/assets/fonts/ (served at /assets/fonts).
export const identity = defineTheme({
  id: "confetti",
  tool: "polls",
  name: { en: "Confetti", fr: "Confettis" },
  description: { en: "Playful and quick: coral, deep navy and mint on warm paper, chunky rounded shapes.", fr: "Joueur et rapide : corail, marine profond et menthe sur papier chaud, formes rondes et dodues." },
  fonts: { display: "fredoka", body: "plus-jakarta-sans" },
  display: { weight: 600 },
  type: { xs: 0.8125, xl: 1.625, xxl: 2.5 },
  radius: { s: 10, m: 16, l: 24 },
  motion: { ease: "cubic-bezier(0.2, 0.8, 0.2, 1)", fast: 140, slow: 320 },
  light: { bg: "#fff7ef", surface: "#ffffff", "surface-2": "#fff0e4", ink: "#1b2440", "ink-2": "#4a5270", line: "#ecdccf", "line-strong": "#1b2440", accent: "#ff7a63", "accent-ink": "#1b2440", "accent-line": "#d9533d", "accent-text": "#b8321f", "accent-soft": "#ffe2da", ok: "#0b6b4f", "ok-soft": "#d8f7ec", wait: "#7a5300", "wait-soft": "#fff1c7", danger: "#b3261e", focus: "#2f55e0", "shadow-1": "0px 1px 0px rgb(27 36 64 / 0.04), 0px 8px 24px -12px rgb(27 36 64 / 0.18)" },
  dark: { bg: "#111829", surface: "#1a2338", "surface-2": "#222d47", ink: "#f4eee8", "ink-2": "#b7bcd0", line: "#2e3a57", accent: "#ff8a76", "accent-ink": "#111829", "accent-soft": "#3a2530", "accent-text": "#ff8a76", ok: "#7ff0c9", "ok-soft": "#173a36", wait: "#ffd98a", "wait-soft": "#3a3222", danger: "#ff8a80", focus: "#9db4ff", "shadow-1": "0px 1px 0px rgb(0 0 0 / 0.2), 0px 10px 28px -14px rgb(0 0 0 / 0.6)" },
  palette: { chroma: 1.25, hues: { 6: 175 } },
});

// The look of a surface: the company's choice as the Chest tells it (for
// all its tools, or for this one), else the identity above. The public
// pages (the guest page of a date poll, the host's root) wear the
// company's brand when it has one, else Polls' own identity — never a
// catalogue theme chosen for the team, never the Chest's sheet (kit
// surface "public"; the store's rule for public pages, as Forms and
// Booking). Never throws: the Chest unreachable, or a choice the kit
// cannot honour, is the identity.
//
// The look is a stylesheet the tool serves itself — /chest/look.css for
// the team's pages, /look.css for the public ones (src/app.tsx) —, never
// an inline <style>: the strictest policy admits it. Its link carries the
// sheet's hash (?v=…), so a browser keeps it until the company chooses
// another look. chest.theme() keeps the Chest's answer a minute; the
// sheet of one answer is written once and kept beside it.
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
