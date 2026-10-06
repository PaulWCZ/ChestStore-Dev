import { chest } from "@argentic/chest-sdk/chest";
import type { Theme } from "@argentic/chest-ui/contract";
import { lookColors, lookCss, resolveTheme, type Look } from "@argentic/chest-ui/runtime";
import { identityOf } from "@argentic/chest-ui/themes";
import { log } from "@argentic/chest-app";

// The tool's own identity (DESIGN.md), "Instrument": ink green, cool paper,
// one electric lime signal, tabular figures in Martian Mono. It is the
// catalogue's theme of the same name — one source, so the tool's own look
// and the look a company picks from the catalogue are the same (checked
// against the contract in test/theme.test.ts). Its fonts are the tool's own
// files in public/assets/fonts/ (served at /assets/fonts). Every colour of
// the tool is there; its CSS names only the contract's tokens and the
// tool's tokens of src/tokens.css, defined from them.
const own = identityOf("timesheets");
if (!own) throw new Error("the UI kit's catalogue has no identity for timesheets");
export const identity: Theme = own;

// The look of a surface: the company's choice as the Chest tells it (for
// all its tools, or for this one), else the identity above. Never throws:
// the Chest unreachable, or a choice the kit cannot honour, is the
// identity. Timesheets has no public part: its host's root (reached only
// outside a Chest) wears the company's brand or the tool's own look (the
// kit's surface "public"), never a catalogue theme chosen for the team.
//
// The look is a stylesheet the tool serves itself — /chest/look.css for
// the team's pages, /look.css for the root (served by the package) —,
// never an inline <style>: the strictest policy admits it, so the tool
// needs no "csp" permission. Its link carries the sheet's hash (?v=…), so
// a browser keeps it until the company chooses another look.
// chest.theme() keeps the Chest's answer a minute; the sheet of one answer
// is written once and kept beside it.
export type Sheet = { look: Look; css: string; colors: { media: string; color: string }[] };
type Surface = "team" | "public";
const written = new WeakMap<object, Partial<Record<Surface, Sheet>>>();

export async function sheetOf(surface: Surface): Promise<Sheet> {
  const choice = await chest.theme();
  const kept = written.get(choice) ?? {};
  const found = kept[surface];
  if (found) return found;
  const look = resolveTheme(choice, identity, { surface, ownFonts: "/assets/fonts" });
  if (look.problem) log.warn("theme not usable: the tool's own look is used", { problem: look.problem });
  const sheet: Sheet = { look, css: lookCss(look), colors: lookColors(look) };
  written.set(choice, { ...kept, [surface]: sheet });
  return sheet;
}

// The look of this request's surface (the tests and the pages read it).
export const currentLook = async (surface: Surface = "team"): Promise<Look> => (await sheetOf(surface)).look;

// What createApp({ look }) asks for each page (src/app.tsx): the sheet of
// the page's surface, and the company's logo in brand mode (the layout
// shows it in place of the stopwatch).
export async function lookFor(viewer: { member: unknown }): Promise<{ css: string; colors: { media: string; color: string }[]; logo: Look["logo"] }> {
  const sheet = await sheetOf(viewer.member === null ? "public" : "team");
  return { css: sheet.css, colors: sheet.colors, logo: sheet.look.logo };
}
