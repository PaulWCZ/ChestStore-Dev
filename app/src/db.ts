import { databaseUrl } from "@argentic/chest-sdk/database";
import postgres from "postgres";

// The tool's PostgreSQL database, as the Chest gives it: one pool per
// process, opened on first use (never at build time or import). Queries
// are tagged templates — values are always parameters, never pasted:
//   await db()`select * from notes where id = ${id}`
// date columns come back as "YYYY-MM-DD" text (a calendar day has no time
// zone; f.day() writes it), bigint as text, timestamptz as Date.
// TEST_DATABASE_SCHEMA (set by testDatabase() of ./testing, never in
// service) puts the tests in a throwaway schema of the preview's database.
let pool: postgres.Sql<{ date: string }> | undefined;
export function db(): postgres.Sql<{ date: string }> {
  const schema = process.env["TEST_DATABASE_SCHEMA"];
  return (pool ??= postgres(databaseUrl(), {
    max: 4,
    idle_timeout: 60,
    connect_timeout: 10,
    onnotice: () => {},
    types: { date: { to: 1082, from: [1082], serialize: (day: string) => day, parse: (day: string) => day } },
    ...(schema ? { connection: { search_path: schema } } : {}),
  }));
}

// The ids the Chest delivered already (events and schedule runs come at
// least once): events.handle(…, { seen }) and schedules.handle(…, { seen })
// skip one they see again. The table is the tool's migrations/0001_chest.sql.
export const seen = {
  has: async (id: string) => (await db()`select 1 from chest_seen where id = ${id}`).length > 0,
  add: async (id: string) => { await db()`insert into chest_seen (id) values (${id}) on conflict do nothing`; },
  // Ids older than 30 days, forgotten (the Chest stops delivering long before).
  purge: async () => { await db()`delete from chest_seen where at < now() - interval '30 days'`; },
};
