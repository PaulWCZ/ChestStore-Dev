import { useAutoRefresh } from "@argentic/chest-app/client";

// EXAMPLE (Notes). The team's notes read again while someone looks at the
// page: when the tab comes back, and every minute while they are active
// (never all day: an idle tool may sleep). The page's version (src/app.tsx)
// makes a read with nothing new cost almost nothing.
export function AutoRefresh({ seconds }: { seconds: number }) {
  useAutoRefresh(seconds);
  return null;
}
