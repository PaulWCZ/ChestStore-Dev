import type { Sql } from "./db.ts";

// What News learned of the Chest from its last attempts: whether it can
// send email ("mail") and put events in its calendar ("calendar"). The
// Chest has no question to ask it beforehand; News remembers the answer to
// its last try, so the composer says before publishing whether email will
// go ("unknown" until News has tried).
export type Learned = "on" | "off" | "unknown";

export async function learned(sql: Sql, key: "mail" | "calendar"): Promise<Learned> {
  const [row] = await sql<{ value: string }[]>`select value from chest_state where key = ${key}`;
  return row?.value === "on" || row?.value === "off" ? row.value : "unknown";
}

export async function learn(sql: Sql, key: "mail" | "calendar", value: "on" | "off"): Promise<void> {
  await sql`insert into chest_state (key, value, at) values (${key}, ${value}, now())
    on conflict (key) do update set value = excluded.value, at = excluded.at where chest_state.value <> excluded.value`;
}
