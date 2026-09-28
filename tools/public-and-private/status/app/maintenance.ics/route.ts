import { feedHeaders, maintenanceCalendar } from "../../lib/feeds.ts";

// Planned maintenance as a calendar to subscribe to (public): the windows
// ahead and those of the last 30 days, cancelled ones marked so.
export async function GET(): Promise<Response> {
  return new Response(await maintenanceCalendar(), { headers: { ...feedHeaders("text/calendar; charset=utf-8"), "Content-Disposition": 'inline; filename="maintenance.ics"' } });
}
