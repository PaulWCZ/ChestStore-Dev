import { chest } from "@argentic/chest-sdk/chest";
import { Unavailable } from "@argentic/chest-sdk/errors";
import * as mail from "@argentic/chest-sdk/mail";
import type { Query } from "./db.ts";
import { chestPublicUrl } from "./public-origin.ts";

// What the tool remembers about its Chest: the public address seen last
// (for links in emails sent outside a request, only where the Chest does
// not say it — outside a Chest: chest.tool.publicUrl, SDK 0.4, is the
// address, the company's own domain included), and whether the Chest could
// send email the last time it tried.

async function read<T>(sql: Query, key: string): Promise<T | null> {
  const [row] = await sql<{ value: T }[]>`select value from settings where key = ${key}`;
  return row ? row.value : null;
}

async function write(sql: Query, key: string, value: unknown): Promise<void> {
  await sql`insert into settings (key, value) values (${key}, ${sql.json(value as never)}) on conflict (key) do update set value = excluded.value`;
}

// The company's name, as the Chest gives it (chest.organization.name).
export function company(): string {
  return chest.organization.name;
}

export async function publicOrigin(sql: Query): Promise<string> {
  return chestPublicUrl() ?? (await read<string>(sql, "public_origin")) ?? "";
}

export async function rememberPublicOrigin(sql: Query, origin: string | null): Promise<void> {
  if (!origin || chestPublicUrl()) return;
  if ((await read<string>(sql, "public_origin")) !== origin) await write(sql, "public_origin", origin);
}

// Mail (Proposal (studio)). What the last send taught: "none" is tried
// again after a day, so a Chest that gains email shows the form again by
// itself. Pages ask the Chest first (mailDelivery, below); this is what
// they fall back on when the Chest does not answer.
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

// Whether the Chest would send email now (mail.available(), studio.16),
// asked before a page offers it: "ok"; "none" — no mail on this Chest, or
// its owner has not connected it (reason says which); "paused" — the Chest
// stopped sending for now, or the day's messages are used ("suspended",
// "quota"); "unknown" when the Chest does not answer and no send has told.
// A snapshot: a send can still fail, and says so.
export type MailDelivery = { state: MailState | "paused"; reason: "not_granted" | "not_connected" | "suspended" | "quota" | null };

export async function mailDelivery(sql: Query, now = new Date()): Promise<MailDelivery> {
  try {
    const answer = await mail.available();
    if (answer.ok) return { state: "ok", reason: null };
    return { state: answer.reason === "suspended" || answer.reason === "quota" ? "paused" : "none", reason: answer.reason };
  } catch (error) {
    if (!(error instanceof Unavailable)) throw error;
    return { state: await mailState(sql, now), reason: null };
  }
}

// Checks (Proposal (studio)): whether the Chest took the list the last time
// it was saved.
export async function checksState(sql: Query): Promise<"running" | "unavailable" | "unknown"> {
  return (await read<"running" | "unavailable">(sql, "checks_state")) ?? "unknown";
}

export async function setChecksState(sql: Query, state: "running" | "unavailable"): Promise<void> {
  await write(sql, "checks_state", state);
}
