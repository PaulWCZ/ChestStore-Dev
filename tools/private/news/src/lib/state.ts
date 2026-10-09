import type { Sql } from "./db.ts";

// What News learned of the Chest from its last attempts: whether it can
// put events in its calendar ("calendar"). A post's page says what
// happened with it from this.
export type Learned = "on" | "off" | "unknown";

export async function learned(sql: Sql, key: "calendar"): Promise<Learned> {
  const [row] = await sql<{ value: string }[]>`select value from chest_state where key = ${key}`;
  return row?.value === "on" || row?.value === "off" ? row.value : "unknown";
}

export async function learn(sql: Sql, key: "calendar", value: "on" | "off"): Promise<void> {
  await sql`insert into chest_state (key, value, at) values (${key}, ${value}, now())
    on conflict (key) do update set value = excluded.value, at = excluded.at where chest_state.value <> excluded.value`;
}
