import { chest } from "@argentic/chest-sdk/chest";
import type { Theme } from "@argentic/chest-ui";
import { identityOf } from "@argentic/chest-ui/themes";
import { log, type Look as PageLook } from "@argentic/chest-app";
import { lookColors, lookCss, resolveTheme, type Look } from "@argentic/chest-ui/runtime";

// The tool's own identity (DESIGN.md), "Portrait gallery": cream walls,
// terracotta, deep plum ink, and portraits set in arches of warm tints. It
// is the catalogue's own "gallery" theme, imported from the kit rather than
// copied (test/theme.test.ts holds the two equal): a company that picks
// "Portrait gallery" for all its tools gets exactly People's look. Every
// colour of the tool is there; its CSS names only the contract's tokens and
// the tool's own tokens of src/tokens.css, defined from them.
//
// The arches behind portraits are the categorical palette's soft grounds
// (slots 2 to 7: green, terracotta, violet, pink, teal, ochre), so a team
// keeps its family of colour in any theme. Its font (Outfit) is the tool's
// own file in public/assets/fonts/ (served at /assets/fonts).
const gallery = identityOf("people");
if (!gallery) throw new Error("the UI kit has no identity for People");
export const identity: Theme = gallery;
export const fontBase = "/assets/fonts";

// The look of a page: the company's choice as the Chest tells it (for all
// its tools, or for this one), else the identity above. Never throws: the
// Chest unreachable, or a choice the kit cannot honour, is the identity
// (and the reason goes to the log).
export async function currentLook(): Promise<Look> {
  const look = resolveTheme(await chest.theme(), identity, { ownFonts: fontBase });
  if (look.problem) log.warn("theme not usable, the tool's own look is used", { problem: look.problem });
  return look;
}
export const ownLook = (): Look => resolveTheme(null, identity, { ownFonts: fontBase });

// The look of a page as createApp() serves it (/chest/look.css and
// /look.css, linked with the hash of the sheet; the browser bar's colours;
// in brand mode the company's logo, which the layout shows): a member's
// page wears the company's choice, a page outside /chest the tool's own.
export async function pageLook(member: boolean): Promise<PageLook> {
  const look = member ? await currentLook() : ownLook();
  return { css: lookCss(look), colors: lookColors(look), logo: look.logo };
}
