import { db, type Query } from "./db.ts";
import { isFrameOrigin } from "./tickets.ts";

// The websites an administrator allowed to show the public form in a frame
// (Settings, "On your website"), for the pages' frame-ancestors policy
// (proxy.ts). Read from the database on every framed page, never kept in
// the process: Next.js runs proxy.ts in its own module instance, apart from
// the server actions, so a copy kept here could not be told of a change and
// a newly allowed website would be refused until it expired. One row by its
// key: as cheap as a query gets. A database that does not answer allows no
// one (the form still works on its own address).
export async function frameOrigins(sql: Query = db()): Promise<string[]> {
  try {
    const [row] = await sql<{ value: unknown }[]>`select value from settings where key = 'frame_origins'`;
    const value = row?.value;
    return Array.isArray(value) ? value.filter((o): o is string => typeof o === "string" && isFrameOrigin(o)) : [];
  } catch {
    return [];
  }
}
