import postgres, { type Sql } from "postgres";

// What the laboratory's proofs read of the tool's database, through the
// tool itself: the migrations the Chest recorded as played and the columns
// of the notes (a later version adds one), and tries at reaching what the
// tool must never reach. The targets are fixed, never an address given.
export type Schema = { migrations: string[]; columns: string[] };
export const probeTargets = ["keycloak", "other", "cluster", "admin"] as const;
export type ProbeTarget = typeof probeTargets[number];
export type Probe = { target: ProbeTarget; outcome: "connected" | "refused"; code: string | null };

export interface Database {
  schema(): Promise<Schema>;
  probe(target: ProbeTarget): Promise<Probe>;
}

// PostgresDatabase reads the tool's own database, and tries the others
// with what the Chest gave the tool (PG*): the identity provider's
// PostgreSQL on its usual port, the database of another tool (the lab's
// second one, webdb) and the cluster's own, and the Chest's superuser.
export class PostgresDatabase implements Database {
  readonly #sql: Sql;
  constructor(sql: Sql) { this.#sql = sql; }
  async schema(): Promise<Schema> {
    const migrations = await this.#sql<{ name: string }[]>`SELECT name FROM chest_migrations ORDER BY name`;
    const columns = await this.#sql<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notes' ORDER BY ordinal_position`;
    return { migrations: migrations.map(row => row.name), columns: columns.map(row => row.column_name) };
  }
  async probe(target: ProbeTarget): Promise<Probe> {
    const own = { host: process.env["PGHOST"] ?? "", port: Number(process.env["PGPORT"]), user: process.env["PGUSER"] ?? "", password: process.env["PGPASSWORD"] ?? "" };
    const options = {
      keycloak: { host: "127.0.0.1", port: 5432, user: "chest_keycloak", password: own.password, database: "keycloak" },
      other: { ...own, database: "t_webdb" },
      cluster: { ...own, database: "postgres" },
      admin: { ...own, user: "chest_admin", database: "postgres" },
    }[target];
    const sql = postgres({ ...options, max: 1, connect_timeout: 5, idle_timeout: 1, onnotice: () => undefined });
    try {
      await sql`SELECT 1`;
      return { target, outcome: "connected", code: null };
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      return { target, outcome: "refused", code: typeof code === "string" ? code : null };
    } finally {
      await sql.end({ timeout: 1 });
    }
  }
}
