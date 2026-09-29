// Safe in the browser: no SDK here.
// initials for an avatar without a photo: the first letters of the first
// and last names. A note after the name — "Léa Dubois (former member)",
// "(ancien membre)" — is not part of it: LD, never LM.
export function initials(name: string): string {
  const words = name.replace(/\s*\([^)]*\)\s*$/u, "").trim().split(/\s+/u).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words.length > 1 ? words.at(-1)![0] ?? "" : "")).toUpperCase() || "·";
}
