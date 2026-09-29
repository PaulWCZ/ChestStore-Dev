import type { Look } from "@argentic/chest-ui/runtime";
import { cache } from "react";
import { currentMember } from "./session.ts";
import { publicLook, teamLook } from "./theme.ts";

// The look of this request: the team's pages come with the Chest's member
// assertion; everything else is the public host (lib/theme.ts). Asked once
// per request, however many components need it.
export const currentLook = cache(async (): Promise<Look> => ((await currentMember().catch(() => null)) ? teamLook() : publicLook()));
