import { chest } from "@argentic/chest-sdk/chest";
import { defineTheme } from "@argentic/chest-ui";
import { resolveTheme, type Look } from "@argentic/chest-ui/runtime";
import { cache } from "react";

// The tool's own identity (DESIGN.md), "Letterpress": exact and formal —
// crisp paper on a quiet desk, blue-black ink, an oxblood seal, a Caslon
// for what is printed and a clean grotesque for the controls. It is a theme
// of the kit's contract, checked like the catalogue's (test/theme.test.ts),
// and the very same source as the catalogue's "letterpress" theme (the test
// holds the two equal), so Quotes in its own look and another tool wearing
// "Letterpress" look alike. Its fonts are the tool's own files in
// public/fonts/ (served at /fonts). Every colour of the tool's screens is
// here; its CSS names only the contract's tokens (and app/tokens.css,
// defined from them).
//
// The PDF is not the screen: an issued invoice is a legal document, drawn
// by lib/pdf/ in its own neutral print design (black on white, Liberation
// fonts) whatever the look the company chose.
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

// The look of this request: the company's choice as the Chest tells it
// (for all its tools, or for this one), else the identity above. Never
// throws: the Chest unreachable, or a choice the kit cannot honour, is the
// identity. Asked once per request, however many components need it.
export const currentLook = cache(async (): Promise<Look> => {
  const look = resolveTheme(await chest.theme(), identity);
  if (look.problem) console.warn(`theme: ${look.problem}; the tool's own look is used`);
  return look;
});

// The look of a public page (a client's quote): the company's brand when it
// has one, else the tool's own identity — never a catalogue theme chosen
// for the team, never the Chest's sheet (kit 0.2.3, surface "public").
export const publicLook = cache(async (): Promise<Look> => resolveTheme(await chest.theme(), identity, { surface: "public" }));
