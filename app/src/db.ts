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
// skip one they see again. seen keeps them in chest_seen (the tool's
// migrations/0001_chest.sql); seenIn("my_table") in a table of the tool's
// own (columns id text primary key, at timestamptz default now()). A
// durable store grows one row per delivery (~96 a day for a 15-minute
// schedule): forget() what is older than the Chest's retries (30 days by
// default) — in a schedule, or after handling an event.
export function seenIn(table: string) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/u.test(table)) throw new TypeError("seenIn() takes a table name");
  const name = (sql: postgres.Sql<{ date: string }>) => sql(table);
  const forget = async (days = 30) => { await db()`delete from ${name(db())} where at < now() - make_interval(days => ${days})`; };
  return {
    has: async (id: string) => (await db()`select 1 from ${name(db())} where id = ${id}`).length > 0,
    add: async (id: string) => { await db()`insert into ${name(db())} (id) values (${id}) on conflict do nothing`; },
    forget,
    // The same as forget() (0.1.0-studio.1's name).
    purge: () => forget(),
  };
}
export const seen = seenIn("chest_seen");
