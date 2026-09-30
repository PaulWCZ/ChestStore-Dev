import { chest } from "@argentic/chest-sdk/chest";
import type { Theme } from "@argentic/chest-ui/contract";
import { resolveTheme, type Look } from "@argentic/chest-ui/runtime";
import { identityOf } from "@argentic/chest-ui/themes";
import { cache } from "react";

// The tool's own identity (DESIGN.md), "Instrument": ink green, cool paper,
// one electric lime signal, tabular figures in Martian Mono. It is the
// catalogue's theme of the same name — one source, so the tool's own look
// and the look a company picks from the catalogue are the same (checked
// against the contract in test/theme.test.ts). Its fonts are the tool's own
// files in public/fonts/ (served at /fonts). Every colour of the tool is
// there; its CSS names only the contract's tokens and the tool's tokens of
// app/tokens.css, defined from them.
const own = identityOf("timesheets");
if (!own) throw new Error("the UI kit's catalogue has no identity for timesheets");
export const identity: Theme = own;

// The look of this request: the company's choice as the Chest tells it
// (for all its tools, or for this one), else the identity above. Never
// throws: the Chest unreachable, or a choice the kit cannot honour, is the
// identity. Asked once per request, however many components need it.
export const currentLook = cache(async (): Promise<Look> => {
  const look = resolveTheme(await chest.theme(), identity);
  if (look.problem) console.warn(`theme: ${look.problem}; the tool's own look is used`);
  return look;
});
