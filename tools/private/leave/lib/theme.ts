import * as chest from "@argentic/chest-sdk/chest";
import { defineTheme } from "@argentic/chest-ui";
import { resolveTheme, type Look } from "@argentic/chest-ui/runtime";
import { cache } from "react";

// The tool's own identity (DESIGN.md), "Seaside": soft and friendly — a
// pastel sky, peach and mint, big rounded cards, Nunito. It is a theme of
// the kit's contract, checked like the catalogue's (test/theme.test.ts),
// and the same as the catalogue's "seaside" (the test holds them equal): a
// company that picks Seaside for all its tools gets exactly this. Every
// colour of the tool is here; its CSS names only the contract's tokens
// (app/tokens.css).
//
// The kinds of leave are the categorical palette, one slot per colour a
// kind may wear (lib/model.ts `colors`): sky 1, mint 2, peach 3, lilac 4,
// rose 5, sea 6, sun 7, sand 8 — the slots' families (blue, green, orange,
// violet, pink, teal, ochre, slate) in every theme, so a kind keeps its
// colour's family whatever the look. Here the slots are exactly Leave's
// soft fills and the inks that read on them. Its fonts are the tool's own
// files in public/fonts/ (served at /fonts).
export const identity = defineTheme({
  id: "seaside",
  tool: "leave",
  name: { en: "Seaside", fr: "Bord de mer" },
  description: { en: "Soft and friendly: a pastel sky, peach and mint, big rounded cards.", fr: "Doux et accueillant : ciel pastel, pêche et menthe, grandes cartes arrondies." },
  fonts: { display: "nunito", body: "nunito-sans" },
  display: { weight: 800 },
  type: { xs: 0.8125, xxl: 2.75 },
  radius: { s: 10, m: 14, l: 20 },
  motion: { ease: "cubic-bezier(0.2, 0.8, 0.2, 1)", fast: 140, slow: 260 },
  light: { bg: "#f3f7fb", surface: "#ffffff", "surface-2": "#eaf1f8", ink: "#1d2b3a", "ink-2": "#4b5b6e", line: "#d7e2ee", accent: "#2366a8", "accent-ink": "#ffffff", "accent-soft": "#dcebfa", danger: "#b42318", "danger-soft": "#fde4e1", ok: "#1b7a4b", "ok-soft": "#d8f3e5", wait: "#7a5600", "wait-soft": "#fdf0c7", focus: "#2366a8", "shadow-1": "0px 1px 2px rgb(29 43 58 / 0.05), 0px 2px 8px rgb(29 43 58 / 0.05)", "shadow-2": "0px 12px 32px rgb(29 43 58 / 0.14)" },
  dark: { bg: "#0f1720", surface: "#17212c", "surface-2": "#1f2b38", ink: "#eaf1f8", "ink-2": "#a9b8c8", line: "#2c3a4a", accent: "#8cc4f5", "accent-ink": "#0b2540", "accent-soft": "#1d3550", danger: "#ff9b8f", "danger-soft": "#3d1c1a", ok: "#7fdcaa", "ok-soft": "#173a2a", wait: "#f5d77a", "wait-soft": "#3a3014", focus: "#8cc4f5" },
  palette: {
    // The leave kinds: a soft fill and the ink that reads on it.
    light: { 1: { soft: "#d6e9fb", ink: "#174a7c" }, 2: { soft: "#cff0e0", ink: "#125c3e" }, 3: { soft: "#ffe0cf", ink: "#8a3a10" }, 4: { soft: "#e6e0fb", ink: "#4a3a8f" }, 5: { soft: "#fbd9e3", ink: "#8c2346" }, 6: { soft: "#cdeff0", ink: "#0f5a5e" }, 7: { soft: "#fdefb8", ink: "#6e5200" }, 8: { soft: "#efe7da", ink: "#5b4b34" } },
    dark: { 1: { soft: "#1e3a56", ink: "#bfe0ff" }, 2: { soft: "#183f31", ink: "#b6f0d4" }, 3: { soft: "#4a2c1e", ink: "#ffd2ba" }, 4: { soft: "#2e2850", ink: "#d9d0ff" }, 5: { soft: "#45202e", ink: "#ffc7d8" }, 6: { soft: "#173e40", ink: "#b8eef0" }, 7: { soft: "#3f3413", ink: "#fbe7a1" }, 8: { soft: "#3a3228", ink: "#eadfcc" } },
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
