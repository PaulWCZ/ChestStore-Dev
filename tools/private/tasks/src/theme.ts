import { chest } from "@argentic/chest-sdk/chest";
import { identityOf, type Theme } from "@argentic/chest-ui";
import { log, type Look as PageLook } from "@argentic/chest-app";
import { lookColors, lookCss, resolveTheme, type Look } from "@argentic/chest-ui/runtime";

// The tool's own identity (DESIGN.md), "Workshop": warm paper, ink
// outlines, sun yellow, hard shadows. It is the catalogue's own "workshop"
// theme, imported from the kit rather than copied (a copy drifted when the
// kit fixed the palette's families in 0.2.1), so Tasks in its own look and
// another tool wearing "Workshop" look alike. Its fonts are the tool's own
// files in public/assets/fonts/ (served at /assets/fonts). Every colour of
// the tool is there; its CSS names only the contract's tokens. The board
// and label colours are the palette's slots (the same families in every
// theme): 1 sky, 2 leaf, 3 tomato, 4 grape, 5 berry, 6 sea, 7 sun, 8 slate
// (and sand: src/tokens.css).
const workshop = identityOf("tasks");
if (!workshop) throw new Error("the UI kit has no identity for Tasks");
export const identity: Theme = workshop;
export const fontBase = "/assets/fonts";

// The look of a page: the company's choice as the Chest tells it (for all
// its tools, or for this one), else the identity above. Never throws: the
// Chest unreachable, or a choice the kit cannot honour, is the identity
// (and the reason goes to the log). A page outside /chest (the error page
// of a path the Chest never routes) wears the identity.
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
