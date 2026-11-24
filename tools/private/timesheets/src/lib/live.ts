import { ChestError } from "@argentic/chest-sdk/errors";
import * as realtime from "@argentic/chest-sdk/realtime";

// Pages left open follow the Chest's realtime, never a timer (SDK 0.5+):
// every page joins its member's own channel `mine:<id>` (chest.json
// "realtime"; the layout's Live island), and a manager's pages also join
// `team`, where every write of the tables `entries` and `weeks` arrives
// (their keys only: a page reads the rest, as its reader may). live() tells
// these members' pages that their own time changed — a timer started on
// another device, a week approved or sent back by a manager — so each reads
// itself again; the Chest holds the connections, the tool sleeps meanwhile.
// A courtesy: when the Chest cannot take it, the page is right at its next
// reading.
export async function live(members: Iterable<string>): Promise<void> {
  for (const id of new Set(members)) {
    if (!id.startsWith("mbr_")) continue;
    try {
      await realtime.publish(`mine:${id}`, "time.changed");
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
    }
  }
}

// told: the answer of a write, once the members' pages were told.
export async function told<T>(members: string[], value: Promise<T>): Promise<T> {
  const out = await value;
  await live(members);
  return out;
}
