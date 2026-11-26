import { chest } from "@argentic/chest-sdk/chest";
import { identityOf, type Theme } from "@argentic/chest-ui";
import { log, type Look as PageLook } from "@argentic/chest-app";
import { lookColors, lookCss, resolveTheme, type Look } from "@argentic/chest-ui/runtime";

// The tool's own identity (DESIGN.md), "Receipt": thermal-paper off-white,
// ink black, one money green (also "approved"), one red for "refused",
// amounts in JetBrains Mono with tabular figures. It is the catalogue's own
// "receipt" theme, imported from the kit rather than copied, so Expenses in
// its own look and another tool wearing "Receipt" look alike. Its fonts are
// the tool's own files in public/assets/fonts/ (served at /assets/fonts).
// Every colour of the tool is there; its CSS names only the contract's
// tokens and the tool's tokens of src/tokens.css, defined from them.
const receipt = identityOf("expenses");
if (!receipt) throw new Error("the UI kit has no identity for Expenses");
export const identity: Theme = receipt;
export const fontBase = "/assets/fonts";

// The look of a page: the company's choice as the Chest tells it (for all
// its tools, or for this one), else the identity above. Never throws: the
// Chest unreachable, or a choice the kit cannot honour, is the identity
// (and the reason goes to the log).
export async function currentLook(): Promise<Look> {
  return (await sheetOf(true)).look;
}
export const ownLook = (): Look => resolveTheme(null, identity, { ownFonts: fontBase });

// The look as createApp() serves it (/chest/look.css and /look.css, linked
// with the hash of the sheet; the browser bar's colours; in brand mode the
// company's logo, which the layout shows): a member's page wears the
// company's choice, a page outside /chest (Expenses has no public part:
// an error page, or the page that says where Expenses lives) the tool's own.
// chest.theme() keeps the Chest's answer a minute; the sheet of one answer
// is written once and kept beside it (not per page).
type Sheet = { look: Look; page: PageLook };
const written = new WeakMap<object, Sheet>();
let own: Sheet | undefined;

async function sheetOf(member: boolean): Promise<Sheet> {
  if (!member) return (own ??= sheet(ownLook()));
  const choice = await chest.theme();
  let found = written.get(choice);
  if (!found) {
    const look = resolveTheme(choice, identity, { ownFonts: fontBase });
    if (look.problem) log.warn("theme not usable, the tool's own look is used", { problem: look.problem });
    written.set(choice, (found = sheet(look)));
  }
  return found;
}
const sheet = (look: Look): Sheet => ({ look, page: { css: lookCss(look), colors: lookColors(look), logo: look.logo } });

export async function pageLook(member: boolean): Promise<PageLook> {
  return (await sheetOf(member)).page;
}
