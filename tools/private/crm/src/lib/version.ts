import { chest } from "@argentic/chest-sdk/chest";
import type { Query } from "./db.ts";
import { dateFormat } from "../i18n/index.ts";

// What a page of Clients shows, in a few characters: the client book's
// version (migrations/0007_book_version.sql: it grows with every change),
// and the hour in the Chest's zone (what is late, "today", the greeting
// and "3 hours ago" move with the clock). The package keys it by reader,
// language and address: a refresh that already has it is a 304, the page
// not even rendered.
export async function bookVersion(sql: Query, now = new Date()): Promise<string> {
  const [row] = await sql<{ n: string }[]>`select n::text from book_version where id = 1`;
  const hour = dateFormat("en", { timeZone: chest.timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).format(now);
  return `${row?.n ?? "0"}@${hour}`;
}
