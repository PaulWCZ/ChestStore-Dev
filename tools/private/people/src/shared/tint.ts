// Safe in the browser: no SDK here.
// The colour of the arch behind a portrait: one of six warm families of
// the categorical palette (slots 3 terracotta, 7 ochre, 2 green, 4 violet,
// 5 pink, 6 teal), the same for everyone in a team (or for a person
// without one), so a team reads as a family on the wall — in any theme.
const slots = [3, 7, 2, 4, 5, 6] as const;
export type Slot = (typeof slots)[number];

export function tint(key: string): Slot {
  let h = 0;
  for (const c of key) h = (h * 31 + c.codePointAt(0)!) >>> 0;
  return slots[h % slots.length]!;
}
