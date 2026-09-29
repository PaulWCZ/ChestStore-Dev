import * as chest from "@argentic/chest-sdk/chest";
import { defineTheme } from "@argentic/chest-ui";
import { resolveTheme, type Look } from "@argentic/chest-ui/runtime";
import { cache } from "react";

// The tool's own identity (DESIGN.md), "Newsprint": newsprint paper, black
// rules, a headline serif, one press red. It is a theme of the kit's
// contract, checked like the catalogue's (test/theme.test.ts), and the very
// same source as the catalogue's "newsprint" theme (the test holds the two
// equal), so News in its own look and another tool wearing "Newsprint" look
// alike. Its fonts are the tool's own files in public/fonts/ (served at
// /fonts). Every colour of the tool is here; its CSS names only the
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

// The look of this request: the company's choice as the Chest tells it
// (for all its tools, or for this one), else the identity above. Never
// throws: the Chest unreachable, or a choice the kit cannot honour, is the
// identity. Asked once per request, however many components need it.
export const currentLook = cache(async (): Promise<Look> => {
  const look = resolveTheme(await chest.theme(), identity);
  if (look.problem) console.warn(`theme: ${look.problem}; the tool's own look is used`);
  return look;
});
