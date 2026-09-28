import * as chest from "@argentic/chest-sdk/chest";
import type { Query } from "./db.ts";

// What the tool remembers about its Chest: the public address seen last
// (for links in emails sent outside a request, when the Chest does not
// say it — chest.publicUrl()), and whether the Chest could send email the
// last time it tried.

async function read<T>(sql: Query, key: string): Promise<T | null> {
  const [row] = await sql<{ value: T }[]>`select value from settings where key = ${key}`;
  return row ? row.value : null;
}

async function write(sql: Query, key: string, value: unknown): Promise<void> {
  await sql`insert into settings (key, value) values (${key}, ${sql.json(value as never)}) on conflict (key) do update set value = excluded.value`;
}

// The company's name, as the Chest gives it ("" when it has none).
export function company(): string {
  return chest.company();
}

export async function publicOrigin(sql: Query): Promise<string> {
  return chest.publicUrl() ?? (await read<string>(sql, "public_origin")) ?? "";
}

export async function rememberPublicOrigin(sql: Query, origin: string | null): Promise<void> {
  if (!origin || chest.publicUrl()) return;
  if ((await read<string>(sql, "public_origin")) !== origin) await write(sql, "public_origin", origin);
}

// Mail (Proposal (studio)). The SDK cannot say beforehand whether the Chest
// sends email (see README, "Needs from the SDK"): the tool learns it from
// its sends. "none" is tried again after a day, so a Chest that gains
// email shows the form again by itself.
export type MailState = "ok" | "none" | "unknown";
const retryAfter = 86400000;

export async function mailState(sql: Query, now = new Date()): Promise<MailState> {
  const saved = await read<{ state: MailState; at: string }>(sql, "mail_state");
  if (!saved) return "unknown";
  if (saved.state === "none" && now.getTime() - Date.parse(saved.at) > retryAfter) return "unknown";
  return saved.state;
}

export async function setMailState(sql: Query, state: "ok" | "none", now = new Date()): Promise<void> {
  const saved = await read<{ state: MailState; at: string }>(sql, "mail_state");
  if (saved?.state === state && state === "ok") return;
  await write(sql, "mail_state", { state, at: now.toISOString() });
}
