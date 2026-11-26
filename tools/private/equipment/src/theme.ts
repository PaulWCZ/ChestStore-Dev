import { chest } from "@argentic/chest-sdk/chest";
import { identityOf, type Theme } from "@argentic/chest-ui";
import { log, type Look as PageLook } from "@argentic/chest-app";
import { lookColors, lookCss, resolveTheme, type Look } from "@argentic/chest-ui/runtime";

// The tool's own identity (DESIGN.md), "Tool crib": steel shelves, utility
// orange tags, printed labels. It is the catalogue's own "labels" theme,
// imported from the kit rather than copied, so Equipment in its own look
// and another tool wearing "Tool crib" look alike (test/theme.test.ts).
// Its fonts are the tool's own files in public/assets/fonts/ (served at
// /assets/fonts). Every colour of the tool is there; its CSS names only
// the contract's tokens (and its own tokens defined from them,
// src/tokens.css).
const crib = identityOf("equipment");
if (!crib) throw new Error("the UI kit has no identity for Equipment");
export const identity: Theme = crib;
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
