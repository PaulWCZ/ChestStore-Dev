import { db } from "./db.ts";
import { settings } from "./tickets.ts";

// The websites an administrator allowed to show the public form in a frame
// (Settings, "On your website"), for the pages' frame-ancestors policy.
// Read at most every 30 seconds; a database that does not answer allows
// no one (the form still works on its own address).
let kept: { at: number; origins: string[] } | null = null;

export async function frameOrigins(now = Date.now()): Promise<string[]> {
  if (kept && now - kept.at < 30000) return kept.origins;
  try {
    kept = { at: now, origins: (await settings(db())).frameOrigins };
  } catch {
    kept = { at: now, origins: [] };
  }
  return kept.origins;
}

// forgetFrameOrigins: after a change in Settings, the next page reads it.
export function forgetFrameOrigins(): void {
  kept = null;
}
