import * as chest from "@argentic/chest-sdk/chest";
import type { Theme } from "@argentic/chest-ui/contract";
import { resolveTheme, type Look } from "@argentic/chest-ui/runtime";
import { identityOf } from "@argentic/chest-ui/themes";
import { cache } from "react";

// Forms' own identity (DESIGN.md), "Invitation": a conversation on paper —
// lavender mist, aubergine ink, one berry that says "this is the one thing
// to do", a marigold dot of warmth, a generous serif for the questions. It
// is the catalogue's theme of the same name (the kit's 20th, 0.2.2) — one
// source, so the tool's own look and the look a company picks from the
// catalogue are the same (checked against the contract in
// test/theme.test.ts). Its fonts, DM Serif Display and DM Sans, are in the
// kit's registry; the files are the tool's own in public/fonts/ (served at
// /fonts), the kit writes their @font-face (with a unicode-range, so the
// latin and latin-ext files of one face no longer hide each other).
//
// The six colours a form may take (Settings → How it looks) are slots of
// the categorical palette (lib/model.ts formSlots): the catalogue sets them
// to the exact colours Forms always had — berry is the pink family, indigo
// the blue, teal the teal, tangerine the orange, forest the green, ink
// the slate — so a form keeps its colour in any theme, in that theme's
// own shade of the family. Every colour of the tool is there; its CSS
// names only the contract's tokens and its own tokens made of them
// (app/tokens.css).
const own = identityOf("forms");
if (!own) throw new Error("the UI kit's catalogue has no identity for forms");
export const identity: Theme = own;

// The look of a surface: the company's choice as the Chest tells it (for
// all its tools, or for this one), else the identity above. The public
// pages (a public form, the button a website pastes) wear the company's
// brand when it has one, else Forms' own identity — never a catalogue
// theme chosen for the team, never the Chest's sheet (kit 0.2.3, surface
// "public"). A team form in the Chest is the team's surface. Never throws:
// the Chest unreachable, or a choice the kit cannot honour, is the
// identity. Asked once per request (lib/look.ts picks by the member).
async function lookOf(surface: "team" | "public"): Promise<Look> {
  const look = resolveTheme(await chest.theme(), identity, { surface });
  if (look.problem) console.warn(`theme: ${look.problem}; the tool's own look is used`);
  return look;
}
export const publicLook = cache(() => lookOf("public"));
export const teamLook = cache(() => lookOf("team"));

// Whether the page wears Forms' own identity (its own look, or Invitation
// chosen from the catalogue: one and the same): a form's default colour is then its berry;
// in any other look, the look's own action colour (lib/model.ts shownAccent).
export const ownLook = (look: Look): boolean => look.theme.id === identity.id;
