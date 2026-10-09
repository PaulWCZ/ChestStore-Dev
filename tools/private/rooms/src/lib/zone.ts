import { chest } from "@argentic/chest-sdk/chest";

// The Chest's time zone (chest.timeZone, which its owner sets in Settings →
// General): every office of this Chest lives in it. A day, "the morning",
// 9:00 in the rooms' grid are read in it; the database stores instants
// (timestamptz), and its sessions are in this zone too (current_date).
export function zone(): string {
  return chest.timeZone;
}

// The team host's origin (https://rooms-….example), null outside a Chest
// (chest.tool throws there: a unit test without a fake Chest).
export function teamOrigin(): string | null {
  try {
    return chest.tool.teamUrl;
  } catch {
    return null;
  }
}
