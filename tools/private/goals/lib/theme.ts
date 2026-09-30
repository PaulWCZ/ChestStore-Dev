import { chest } from "@argentic/chest-sdk/chest";
import { defineTheme } from "@argentic/chest-ui";
import { resolveTheme, type Look } from "@argentic/chest-ui/runtime";
import { cache } from "react";

// The tool's own identity (DESIGN.md), "Trail map": sand paper, deep forest
// ink, one sunrise orange for progress and the check-in. It is a theme of
// the kit's contract, checked like the catalogue's (test/theme.test.ts),
// and the very same source as the catalogue's "trail" theme (the test holds
// the two equal): a company that picks "Trail map" for all its tools gets
// exactly Goals' look. Every colour of the tool is here; its CSS names only
// the contract's tokens and the tool's own tokens of app/tokens.css,
// defined from them.
//
// Where Goals' old tokens went: on track / at risk / off track are the
// contract's ok / wait / danger states; the sunrise orange is the
// categorical palette's slot 3 (orange in every theme) and the marker pen
// (--highlight, its soft ground); the dark header is the contract's
// --inverse band (the forest, dark in both modes: the kit's catalogue adds it
// to this source, identityAdditions "trail"); the contour lines are a
// color-mix of lines.
// Its fonts (Barlow Semi Condensed, Work Sans) are the tool's own files in
// public/fonts/ (served at /fonts).
export const identity = defineTheme({
  id: "trail", tool: "goals",
  name: { en: "Trail map", fr: "Carte de randonnée" },
  description: { en: "Calm and outdoorsy: sand paper, deep forest ink, a sunrise orange for progress.", fr: "Calme et de plein air : papier sable, encre forêt, un orange lever de soleil pour les progrès." },
  fonts: { display: "barlow-semi-condensed", body: "work-sans" },
  display: { weight: 600, tracking: "0.01em" },
  type: { xs: 0.8125 },
  radius: { s: 6, m: 10, l: 14 },
  motion: { slow: 260 },
  light: { bg: "#f3eee2", surface: "#fbf9f3", "surface-2": "#e8e0cf", ink: "#17302a", "ink-2": "#4c5f58", line: "#d6ccb8", accent: "#1f4a3f", "accent-ink": "#f7f3e8", ok: "#2e6b45", "ok-soft": "#e0eee3", wait: "#8a5a00", "wait-soft": "#f6e8c8", danger: "#a8321f", "danger-soft": "#f7ddd6", focus: "#bf4f1d", highlight: "#f6dfcd", "shadow-1": "0px 1px 2px rgb(23 48 42 / 0.07), 0px 2px 6px rgb(23 48 42 / 0.05)", "shadow-2": "0px 10px 30px rgb(23 48 42 / 0.18)" },
  dark: { bg: "#0f1715", surface: "#16211e", "surface-2": "#26332f", ink: "#efe8d8", "ink-2": "#a7b3ac", line: "#2d3b37", accent: "#e6dcc4", "accent-ink": "#16211e", ok: "#6fc48e", "ok-soft": "#183124", wait: "#e2b04a", "wait-soft": "#33290f", danger: "#f0806a", "danger-soft": "#3a1c16", focus: "#f08a4b", highlight: "#3a2519" },
  palette: {
    chroma: 0.85,
    // Sunrise: progress and the check-in.
    light: { 3: { solid: "#bf4f1d", soft: "#f6dfcd" } },
    dark: { 3: { solid: "#f08a4b", soft: "#3a2519" } },
  },
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
