// Safe in the browser: no SDK here.
// initials for an avatar without a photo.
export function initials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words.length > 1 ? words.at(-1)![0] ?? "" : "")).toUpperCase() || "·";
}
