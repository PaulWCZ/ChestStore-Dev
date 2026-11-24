import { useLive } from "@argentic/chest-app/client";

// A page others change, left open, follows them (SDK 0.7.0 realtime, never
// a timer): the Chest holds the page's connection to the "office" channel
// and tells it each row written to the tables it shows (chest.json
// "realtime" feeds: the rows' keys only, never what they hold); the page
// is then read again from the server, which decides what its reader may
// see (a visit, a leave), and a read with nothing new is a 304
// (src/lib/stamp.ts). The tool sleeps meanwhile. What follows the clock
// (the line of now, check-in windows) moves in the browser
// (components/clock.ts).
export function Live({ tables }: { tables: string[] }) {
  useLive("office", tables);
  return null;
}
