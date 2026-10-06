import { createHash } from "node:crypto";
import { chest } from "@argentic/chest-sdk/chest";
import { defineTheme } from "@argentic/chest-ui";
import { lookColors, lookCss, resolveTheme, type Look } from "@argentic/chest-ui/runtime";
import { log } from "@argentic/chest-app";

// Booking's own identity (DESIGN.md), "Appointment card": warm paper, plum
// ink, mint for what is free, apricot for today — a theme of the kit's
// contract, the same as the catalogue's "appointment" (test/theme.test.ts
// holds the two equal). Its fonts are the tool's own files in public/assets/fonts/
// (served at /assets/fonts). Every colour of the tool is here; its CSS names only
// the contract's tokens, so a company may give it any other look.
export const identity = defineTheme({
  id: "appointment", tool: "booking",
  name: { en: "Appointment card", fr: "Carte de rendez-vous" },
  description: { en: "Polite and warm: paper, plum ink, mint for what is free, apricot for today.", fr: "Poli et chaleureux : papier, encre prune, menthe pour le libre, abricot pour aujourd’hui." },
  fonts: { display: "young-serif", body: "figtree", accent: "young-serif" },
  display: { weight: 400 },
  type: { xxl: 2.4 },
  radius: { s: 8, m: 14, l: 22 },
  light: { bg: "#fbf7f1", surface: "#ffffff", "surface-2": "#f4ede3", ink: "#24172e", "ink-2": "#5f5268", line: "#e4d9cc", accent: "#5b2a86", "accent-ink": "#ffffff", "accent-soft": "#f0e7f8", ok: "#0b6e55", "ok-soft": "#ddf2ea", wait: "#974503", "wait-soft": "#fde9d6", danger: "#b3261e", "danger-soft": "#fbe4e2", focus: "#5b2a86", "shadow-1": "0px 1px 2px rgb(36 23 46 / 0.06), 0px 2px 6px rgb(36 23 46 / 0.04)", "shadow-2": "0px 12px 32px rgb(36 23 46 / 0.14)" },
  dark: { bg: "#17121b", surface: "#211a27", "surface-2": "#2b2332", ink: "#f4eef8", "ink-2": "#bcaec6", line: "#3b3144", accent: "#cfaef2", "accent-ink": "#22122f", "accent-soft": "#37284a", ok: "#7fdcbc", "ok-soft": "#173a30", wait: "#f5b271", "wait-soft": "#43301c", danger: "#ff8a80", "danger-soft": "#45201e", focus: "#cfaef2" },
  palette: {
    // The booking types' swatches and tints, in the contract's slots:
    // 1 sky, 2 leaf, 3 tomato, 4 grape, 5 berry, 6 sea, 7 sun, 8 slate.
    light: { 1: { solid: "#2f6fd0", soft: "#e2ecfb" }, 2: { solid: "#3b7d23", soft: "#e4f2dc" }, 3: { solid: "#c23b22", soft: "#fbe3dd" }, 4: { solid: "#6b3fb5", soft: "#ece4f8" }, 5: { solid: "#b0296a", soft: "#f9e0ec" }, 6: { solid: "#0f7c8c", soft: "#dcf1f3" }, 7: { solid: "#a86a00", soft: "#fbefd2" }, 8: { solid: "#4d5b6a", soft: "#e6eaee" } },
    dark: { 1: { solid: "#8db6f5", soft: "#1f2d44" }, 2: { solid: "#9bd87f", soft: "#22341b" }, 3: { solid: "#ff9a85", soft: "#45231c" }, 4: { solid: "#c3a4f5", soft: "#312546" }, 5: { solid: "#f58cbd", soft: "#43202f" }, 6: { solid: "#6fd0dc", soft: "#173539" }, 7: { solid: "#f0c15c", soft: "#3a2f14" }, 8: { solid: "#b3c0cd", soft: "#2a3038" } },
  },
});

// The look of a surface: the company's choice as the Chest tells it (for
// all its tools, or for this one), else the identity above. The public
// pages (a host's page, a guest's booking, the button a website pastes)
// wear the company's brand when it has one, else Booking's own identity —
// never a catalogue theme chosen for the team, never the Chest's sheet
// (kit surface "public"). Never throws: the Chest unreachable, or a choice
// the kit cannot honour, is the identity.
//
// The look is a stylesheet the tool serves itself — /chest/look.css for
// the team's pages, /look.css for the public ones (src/app.tsx) —, never
// an inline <style>: the strictest policy admits it, so Booking needs no
// "csp" permission. Its link carries the sheet's hash (?v=…), so a browser
// keeps it until the company chooses another look. chest.theme() keeps the
// Chest's answer a minute; the sheet of one answer is written once and
// kept beside it.
export type Sheet = { look: Look; css: string; etag: string; colors: { media: string; color: string }[] };
type Surface = "team" | "public";
const written = new WeakMap<object, Partial<Record<Surface, Sheet>>>();

export async function sheetOf(surface: Surface): Promise<Sheet> {
  const choice = await chest.theme();
  const kept = written.get(choice) ?? {};
  const found = kept[surface];
  if (found) return (latest[surface] = found);
  const look = resolveTheme(choice, identity, { surface, ownFonts: "/assets/fonts" });
  if (look.problem) log.warn("theme not usable: the tool's own look is used", { problem: look.problem });
  const css = lookCss(look);
  const sheet: Sheet = { look, css, etag: createHash("sha256").update(css).digest("base64url").slice(0, 16), colors: lookColors(look) };
  written.set(choice, { ...kept, [surface]: sheet });
  latest[surface] = sheet;
  return sheet;
}

// The sheet of a surface as last read: what the layout draws with (the
// company's logo in brand mode), within the request whose look was just
// read — createApp's look() runs before the page is rendered, with no wait
// between the two. The identity's own until a look was read.
const latest: Partial<Record<Surface, Sheet>> = {};
export function lookNow(surface: Surface): Look {
  return latest[surface]?.look ?? resolveTheme(null, identity, { surface, ownFonts: "/assets/fonts" });
}
