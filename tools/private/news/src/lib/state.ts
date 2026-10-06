import { Unavailable } from "@argentic/chest-sdk/errors";
import * as mail from "@argentic/chest-sdk/mail";
import type { Sql } from "./db.ts";

// What News learned of the Chest from its last attempts: whether it can
// send email ("mail") and put events in its calendar ("calendar"). A post's
// page says what happened with it from this. The composer asks the Chest
// first (mailNow).
export type Learned = "on" | "off" | "unknown";

export async function learned(sql: Sql, key: "mail" | "calendar"): Promise<Learned> {
  const [row] = await sql<{ value: string }[]>`select value from chest_state where key = ${key}`;
  return row?.value === "on" || row?.value === "off" ? row.value : "unknown";
}

export async function learn(sql: Sql, key: "mail" | "calendar", value: "on" | "off"): Promise<void> {
  await sql`insert into chest_state (key, value, at) values (${key}, ${value}, now())
    on conflict (key) do update set value = excluded.value, at = excluded.at where chest_state.value <> excluded.value`;
}

// mailNow: whether the Chest would send email now (mail.available(),
// studio.16), for the composer, which says before publishing whether an
// important post also goes by email: "off" when the Chest has no mail, its
// owner has not connected it, it paused sending or the day's emails are
// used. A snapshot: a send can still fail. When the Chest does not answer,
// what the last send taught.
export async function mailNow(sql: Sql): Promise<Learned> {
  try {
    return (await mail.available()).ok ? "on" : "off";
  } catch (error) {
    if (!(error instanceof Unavailable)) throw error;
    return learned(sql, "mail");
  }
}

// mailConnected: whether the Chest sends email at all — not when it has no
// mail or its owner has not connected it (a paused Chest or a spent day
// still counts: the weekly digest goes another day). For the digest's
// switch, which offers "by email too" only then.
export async function mailConnected(sql: Sql): Promise<boolean> {
  try {
    const answer = await mail.available();
    return answer.ok || (answer.reason !== "not_granted" && answer.reason !== "not_connected");
  } catch (error) {
    if (!(error instanceof Unavailable)) throw error;
    return (await learned(sql, "mail")) !== "off";
  }
}
