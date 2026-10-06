import { databaseUrl } from "@argentic/chest-sdk/database";
import postgres from "postgres";
import { after } from "./tool.ts";

// The tool's PostgreSQL database, as the Chest gives it: one pool per
// process, opened on first use (never at build time or import). Queries
// are tagged templates — values are always parameters, never pasted:
//   await db()`select * from notes where id = ${id}`
// date columns come back as "YYYY-MM-DD" text (a calendar day has no time
// zone; f.day() writes it), bigint as text, timestamptz as Date.
// TEST_DATABASE_SCHEMA (set by testDatabase() of ./testing, never in
// service) puts the tests in a throwaway schema of the preview's database.
// DATABASE_POOL_MAX: connections (1 to 10, 4 by default); testDatabase()
// sets 1 on PGlite, which serves every connection from one session (two
// would mix their transactions: after()'s work and a page's).
let pool: postgres.Sql<{ date: string }> | undefined;
function poolMax(): number {
  const max = Number(process.env["DATABASE_POOL_MAX"]);
  return Number.isInteger(max) && max >= 1 && max <= 10 ? max : 4;
}
export function db(): postgres.Sql<{ date: string }> {
  const schema = process.env["TEST_DATABASE_SCHEMA"];
  const zone = /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/u.test(process.env["CHEST_TIME_ZONE"] ?? "") ? process.env["CHEST_TIME_ZONE"] : undefined;
  return (pool ??= postgres(databaseUrl(), {
    max: poolMax(),
    idle_timeout: 60,
    connect_timeout: 10,
    onnotice: () => {},
    types: { date: { to: 1082, from: [1082], serialize: (day: string) => day, parse: (day: string) => day } },
    // The Chest's zone on every session, as the Chest sets it (current_date
    // is the company's day) — so too in the tests' databases.
    connection: { ...(schema ? { search_path: schema } : {}), ...(zone ? { TimeZone: zone } : {}) },
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

// ---- changeStamp(): a page's version that is right under concurrency —
// page(render, { version: () => changeStamp() }) — from the tool's change
// log (sql/changes.sql of this package, copied into a migration, then
// select chest_watch('<table>') for each table the pages read). It is the
// number of transactions that changed watched rows: each adds one log row
// that becomes visible when it commits, so a write committed after a page
// was read always moves the stamp (also when transactions commit out of
// order), and a statement that changed nothing never does. page() reads
// the version before it renders: whatever the render read is at least as
// new as the stamp, never older.
export async function changeStamp(sql: postgres.Sql<{ date: string }> | postgres.TransactionSql<{ date: string }> = db()): Promise<string> {
  const [row] = await sql<{ n: string }[]>`select ((select folded from chest_changes_base) + (select count(*) from chest_changes))::text as n`;
  // Now and then, the log's old rows folded into its base (after the answer).
  if (Math.random() < 0.002) after("forget changes", () => forgetChanges());
  return row?.n ?? "0";
}
// forgetChanges(): the log's rows older than a day folded into one number
// (the stamp does not move). changeStamp() calls it now and then.
export async function forgetChanges(sql: postgres.Sql<{ date: string }> = db()): Promise<void> {
  await sql`with gone as (delete from chest_changes where at < now() - interval '1 day' returning 1)
    update chest_changes_base set folded = folded + (select count(*) from gone) where one`;
}