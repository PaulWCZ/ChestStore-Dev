// Safe in the browser: no SDK here.
// The colour of the arch behind a portrait: one of six warm tints, the same
// for everyone in a team (or for a person without one), so a team reads as
// a family on the wall.
export function tint(key: string): number {
  let h = 0;
  for (const c of key) h = (h * 31 + c.codePointAt(0)!) >>> 0;
  return h % 6;
}
