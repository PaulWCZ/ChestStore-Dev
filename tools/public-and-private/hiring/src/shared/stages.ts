// Safe in the browser: no SDK here.
// A stage's name as its reader sees it: the team's own word once renamed,
// otherwise the default key ("screening") in the reader's language — so a
// French recruiter and an English interviewer each read their own words on
// the same board.
import type { StagePreset } from "./model.ts";

export type Named = { name: string | null; preset: StagePreset | null };
export type Defaults = { readonly [K in StagePreset]: string };

export function stageLabel(stage: Named | undefined | null, defaults: Defaults): string {
  if (!stage) return "";
  return stage.name ?? (stage.preset ? defaults[stage.preset] : "");
}

// The history keeps both: the name at the time (the team's word), or the
// key, read again in the reader's language.
export function labelOf(name: unknown, preset: unknown, defaults: Defaults): string {
  if (typeof name === "string" && name !== "") return name;
  return typeof preset === "string" && preset in defaults ? defaults[preset as StagePreset] : "";
}
