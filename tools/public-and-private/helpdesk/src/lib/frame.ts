import { db, type Query } from "./db.ts";
import { isFrameOrigin } from "./tickets.ts";

// The websites an administrator allowed to show the public form in a frame
// (Settings, "On your website"), for the public pages' frame-ancestors
// (src/app.tsx). Read from the database on every framed page, never kept in
// the process: the tool sleeps, and a newly allowed website must work on
// the next request. One row by its key: as cheap as a query gets. A
// database that does not answer allows no one (the form still works on its
// own address).
export async function frameOrigins(sql: Query = db()): Promise<string[]> {
  try {
    const [row] = await sql<{ value: unknown }[]>`select value from settings where key = 'frame_origins'`;
    const value = row?.value;
    return Array.isArray(value) ? value.filter((o): o is string => typeof o === "string" && isFrameOrigin(o)) : [];
  } catch {
    return [];
  }
}
