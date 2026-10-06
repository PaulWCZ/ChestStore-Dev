import { useEffect } from "react";
import { stamp, zoneName } from "../i18n/format.ts";

// Times are written by the server in the Chest's time zone, with its short
// name ("14:05 CEST"): readable without JavaScript. Once the page is in the
// browser, this rewrites each of them in the visitor's own zone, and the
// note that says which zone the page speaks.
export function LocalTimes({ locale, note }: { locale: string; note: string }) {
  useEffect(() => {
    let zone = "";
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!zone) return;
    const now = new Date();
    for (const el of document.querySelectorAll<HTMLTimeElement>("time[data-local]")) {
      const at = new Date(el.dateTime);
      if (Number.isNaN(at.getTime())) continue;
      el.textContent = stamp(at, zone, locale, now);
    }
    for (const el of document.querySelectorAll<HTMLElement>("[data-zone-note]")) el.textContent = note.replace("{zone}", zoneName(zone));
  }, [locale, note]);
  return null;
}
