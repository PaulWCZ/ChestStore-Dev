import { changeStamp } from "@argentic/chest-app/db";
import type { Query } from "./db.ts";

// What the desk and the lists show changing, in one short mark: the
// package's change stamp of Quotes' tables (migrations/0016: one log row
// per transaction that changed rows, seen at its commit — never a
// max(updated_at), which a late commit can leave unmoved) and the day
// (what is overdue or expired moves with it). A refresh (the package's
// useAutoRefresh) whose page has this mark gets a 304 before anything is
// rendered (page(…, { version })): one small query in place of a page.
export async function listStamp(sql: Query, today: string): Promise<string> {
  return `${today}|${await changeStamp(sql as Parameters<typeof changeStamp>[0])}`;
}
