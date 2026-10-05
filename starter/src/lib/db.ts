import { databaseUrl } from "@argentic/chest-sdk/database";
import postgres from "postgres";

// The tool's PostgreSQL database, as the Chest gives it: one pool per
// process, opened on first use (never at build time or import). Queries
// are tagged templates — values are always parameters, never pasted:
//   await db()`select * from notes where id = ${id}`
// Tables change only by a new file in migrations/ (the Chest runs them).
let pool: postgres.Sql | undefined;
export const db = (): postgres.Sql => (pool ??= postgres(databaseUrl(), { max: 4, idle_timeout: 60, connect_timeout: 10, onnotice: () => {} }));

// The ids the Chest delivered already (events, schedule runs): handle()
// skips one it sees again. Kept 30 days (src/app.tsx, schedule "purge").
export const seen = {
  has: async (id: string) => (await db()`select 1 from chest_seen where id = ${id}`).length > 0,
  add: async (id: string) => { await db()`insert into chest_seen (id) values (${id}) on conflict do nothing`; },
};
