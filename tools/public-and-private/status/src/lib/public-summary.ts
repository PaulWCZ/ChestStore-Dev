import { db } from "./db.ts";
import { pageZone } from "./page-settings.ts";
import type { Incident } from "./incidents.ts";
import type { State } from "./model.ts";
import { statusView } from "./status-view.ts";

// What the badge and the widget say: the page's overall state (or that it
// is being set up), and what is happening now.
export async function publicSummary(now = new Date()): Promise<{ state: State | "none"; open: Incident[] }> {
  const sql = db();
  const view = await statusView(sql, await pageZone(sql), now);
  if (view.entries.length === 0) return { state: "none", open: [] };
  return { state: view.overall, open: [...view.open, ...view.maintenanceNow] };
}
