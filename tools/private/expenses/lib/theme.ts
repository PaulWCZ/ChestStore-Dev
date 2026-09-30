import { chest } from "@argentic/chest-sdk/chest";
import { defineTheme } from "@argentic/chest-ui";
import { resolveTheme, type Look } from "@argentic/chest-ui/runtime";
import { cache } from "react";

// The tool's own identity (DESIGN.md), "Receipt": thermal-paper off-white,
// ink black, one money green (also "approved"), one red for "refused",
// amounts in JetBrains Mono with tabular figures. It is a theme of the
// kit's contract, checked like the catalogue's (test/theme.test.ts), and
// the very same source as the catalogue's "receipt" theme (the test holds
// the two equal), so Expenses in its own look and another tool wearing
// "Receipt" look alike. Its fonts are the tool's own files in public/fonts/
// (served at /fonts). Every colour of the tool is here; its CSS names only
// the contract's tokens and the tool's tokens of app/tokens.css, defined
// from them.
export const identity = defineTheme({
  id: "receipt", tool: "expenses",
  name: { en: "Receipt", fr: "Ticket de caisse" },
  description: { en: "Precise and honest: thermal paper, ink black, money green, till-roll figures.", fr: "Précis et honnête : papier thermique, noir d’encre, vert argent, chiffres de caisse." },
  fonts: { display: "public-sans", body: "public-sans", mono: "jetbrains-mono" },
  display: { weight: 700, tracking: "-0.01em" },
  type: { xxl: 2.75 },
  radius: { s: 4, m: 8, l: 12 },
  motion: { slow: 220 },
  light: { bg: "#f5f2ea", surface: "#fffdf7", "surface-2": "#ebe7dc", ink: "#1a1a17", "ink-2": "#5b574c", line: "#d8d2c3", accent: "#0b7a43", "accent-ink": "#ffffff", "accent-soft": "#e2f2e7", ok: "#0b7a43", "ok-soft": "#e2f2e7", danger: "#b3261e", "danger-soft": "#fbe5e1", wait: "#8e3b00", "wait-soft": "#fff1d6", focus: "#2e3a8c", "shadow-1": "0px 1px 0px rgb(26 26 23 / 0.06), 0px 1px 3px rgb(26 26 23 / 0.08)", "shadow-2": "0px 2px 0px rgb(26 26 23 / 0.06), 0px 10px 28px rgb(26 26 23 / 0.14)" },
  dark: { bg: "#131412", surface: "#1c1d1a", "surface-2": "#252622", ink: "#ece8dc", "ink-2": "#a8a393", line: "#34352f", accent: "#4cc983", "accent-ink": "#131412", "accent-soft": "#142219", ok: "#4cc983", "ok-soft": "#142219", danger: "#ff7a70", "danger-soft": "#2a1716", wait: "#f3c76b", "wait-soft": "#2b2618", focus: "#9fb1ff", "shadow-1": "0px 1px 0px rgb(0 0 0 / 0.3)", "shadow-2": "0px 10px 30px rgb(0 0 0 / 0.5)" },
  palette: { chroma: 0.85 },
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
