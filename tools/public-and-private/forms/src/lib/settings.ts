import type { Query } from "./db.ts";

// The tool's own settings (table settings): a few values the whole tool
// shares — the websites allowed to show the public forms in a frame, and
// what the tool last learnt of the Chest's mail.
export async function getSetting<T>(sql: Query, key: string): Promise<T | undefined> {
  const [row] = await sql<{ value: T }[]>`select value from settings where key = ${key}`;
  return row?.value;
}

export async function putSetting(sql: Query, key: string, value: unknown): Promise<void> {
  await sql`insert into settings (key, value) values (${key}, ${sql.json(value as never)})
    on conflict (key) do update set value = excluded.value where settings.value is distinct from excluded.value`;
}
