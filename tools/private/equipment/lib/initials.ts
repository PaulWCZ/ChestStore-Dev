// Safe in the browser: no SDK here.
// initials for an avatar without a photo: the first letters of the first
// and last names. A note the tool adds after a name — "Hugo Bernard
// (former member)", "(ancien membre)" — is not part of it: HB, never HM.
export function initials(name: string): string {
  const words = name.replace(/\s*\([^)]*\)\s*$/u, "").trim().split(/\s+/u).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words.length > 1 ? words.at(-1)![0] ?? "" : "")).toUpperCase() || "·";
}
