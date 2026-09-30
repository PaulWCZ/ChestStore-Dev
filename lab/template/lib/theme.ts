import { chest } from "@argentic/chest-sdk/chest";
import { defineTheme } from "@argentic/chest-ui";
import { resolveTheme, type Look } from "@argentic/chest-ui/runtime";
import { cache } from "react";

// The tool's own identity (DESIGN.md): a theme of the kit's contract,
// checked like the catalogue's (test/theme.test.ts). Its fonts are the
// tool's own files in public/fonts/ (served at /fonts). Every colour of the
// tool is here; its CSS names only the contract's tokens.
export const identity = defineTheme({
  id: "notes",
  name: { en: "Notes", fr: "Notes" },
  description: { en: "Calm, plain, friendly: warm paper white and one blue.", fr: "Calme, simple, amical : blanc papier chaud et un seul bleu." },
  fonts: { display: "figtree", body: "figtree" },
  display: { weight: 700 },
  radius: { s: 6, m: 10, l: 16 },
  light: { bg: "#f7f6f2", surface: "#ffffff", "surface-2": "#efede6", ink: "#1c1b18", "ink-2": "#57544c", line: "#dedbd1", accent: "#2b59c3", "accent-ink": "#ffffff", "accent-soft": "#e3eaf9", danger: "#b3261e", ok: "#1e7a45", focus: "#2b59c3", "shadow-1": "0px 1px 2px rgb(0 0 0 / 0.06), 0px 1px 1px rgb(0 0 0 / 0.04)", "shadow-2": "0px 8px 24px rgb(0 0 0 / 0.12)" },
  dark: { bg: "#161614", surface: "#201f1c", "surface-2": "#2a2925", ink: "#f2f0ea", "ink-2": "#b5b1a6", line: "#3a3833", accent: "#8fb0ff", "accent-ink": "#0f1a33", "accent-soft": "#24304d", danger: "#ff8a80", ok: "#6fd39a", focus: "#8fb0ff", "shadow-1": "none", "shadow-2": "0px 8px 24px rgb(0 0 0 / 0.5)" },
});

// The look of this request: the company's choice as the Chest tells it
// (for all its tools, or for this one), else the identity above. Never
// throws: the Chest unreachable, or a choice the kit cannot honour, is the
// identity.
// Asked once per request, however many components need it.
export const currentLook = cache(async (): Promise<Look> => {
  const look = resolveTheme(await chest.theme(), identity);
  if (look.problem) console.warn(`theme: ${look.problem}; the tool's own look is used`);
  return look;
});
