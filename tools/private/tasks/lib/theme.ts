import * as chest from "@argentic/chest-sdk/chest";
import { identityOf, type Theme } from "@argentic/chest-ui";
import { resolveTheme, type Look } from "@argentic/chest-ui/runtime";
import { cache } from "react";

// The tool's own identity (DESIGN.md), "Workshop": warm paper, ink
// outlines, sun yellow, hard shadows. It is the catalogue's own "workshop"
// theme, imported from the kit rather than copied (a copy drifted when the
// kit fixed the palette's families in 0.2.1), so Tasks in its own look and
// another tool wearing "Workshop" look alike. Its fonts are the tool's own
// files in public/fonts/ (served at /fonts). Every colour of the tool is
// there; its CSS names only the contract's tokens. The board and label
// colours are the palette's slots (the same families in every theme):
// 1 sky, 2 leaf, 3 tomato, 4 grape, 5 berry, 6 sea, 7 sun, 8 slate (and
// sand: app/tokens.css).
const workshop = identityOf("tasks");
if (!workshop) throw new Error("the UI kit has no identity for Tasks");
export const identity: Theme = workshop;

// The look of this request: the company's choice as the Chest tells it
// (for all its tools, or for this one), else the identity above. Never
// throws: the Chest unreachable, or a choice the kit cannot honour, is the
// identity. Asked once per request, however many components need it.
export const currentLook = cache(async (): Promise<Look> => {
  const look = resolveTheme(await chest.theme(), identity);
  if (look.problem) console.warn(`theme: ${look.problem}; the tool's own look is used`);
  return look;
});
