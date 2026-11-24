import { chest } from "@argentic/chest-sdk/chest";
import type { Query } from "./db.ts";

// The company's zone (chest.timeZone, SDK 0.7.0: the Chest's reference
// zone, taken once from its owner's browser and set on no screen): the
// zone of every office that has none of its own, of the database's
// sessions (current_date), of "today" for what is not one office's (the
// purge, a leave's days). An office in another city keeps its own clock
// (offices.time_zone, chosen in Places, migrations/0013): its rooms'
// hours, its desks' mornings, its visitors' times are read there. The
// database stores instants (timestamptz).
export function zone(): string {
  return chest.timeZone;
}

// The zone an office lives in: its own, else the Chest's (fallback).
export async function officeZone(sql: Query, officeId: string | null, fallback = zone()): Promise<string> {
  if (officeId === null) return fallback;
  const [row] = await sql<{ zone: string | null }[]>`select time_zone as zone from offices where id = ${officeId}`;
  return row?.zone ?? fallback;
}

// The zone of a room's office (the fallback when the room is not found:
// the caller refuses it next).
export async function roomZone(sql: Query, roomId: string, fallback = zone()): Promise<string> {
  const [row] = await sql<{ zone: string }[]>`select rooms_floor_zone(floor_id, ${fallback}) as zone from rooms where id = ${roomId}`;
  return row?.zone ?? fallback;
}

// The zone of a desk's office (the fallback when the desk is not found).
export async function deskZone(sql: Query, deskId: string, fallback = zone()): Promise<string> {
  const [row] = await sql<{ zone: string }[]>`select rooms_floor_zone(a.floor_id, ${fallback}) as zone from desks d join areas a on a.id = d.area_id where d.id = ${deskId}`;
  return row?.zone ?? fallback;
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
