import { useLive } from "@argentic/chest-app/client";

// EXAMPLE (Notes). The team's notes read again when one is written,
// pinned or deleted: the Chest tells the page (realtime: the "notes"
// channel and its feed in chest.json), the tool asleep meanwhile — never a
// timer. A read with nothing new is a 304 (the page's version, src/app.tsx).
export function LiveNotes() {
  useLive("notes", ["notes"]);
  return null;
}
