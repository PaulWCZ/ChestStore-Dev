import { useLive } from "@argentic/chest-app/client";

// Pages others change, read again when the Chest says they changed — never
// on a timer (SDK 0.7.0's realtime: the channels and feeds of chest.json).
// The Chest holds the page's connection: News sleeps while a page stays
// open and wakes only when someone writes. refresh() keeps what is typed
// (a comment being written), the scroll and each island's state. Events
// carry an id at most: the page reads what it shows from News, which
// checks who may see it.

// The front page: a post published, edited, pinned, deleted ("news": the
// posts table's feed).
export function LiveFront() {
  useLive("news", ["posts"]);
  return null;
}

// A post's page: the post itself (its feed, on "news"), its comments and
// reactions (their feeds, on "post:<id>"), the event's answers (published
// by News, lib/live.ts); for its author, the readers who confirm it (on
// their own channel). focus: the reader has it on screen — someone
// watching is not notified of a comment they see arrive.
export function LivePost({ id, mine }: { id: string; mine: string | null }) {
  useLive("news", ["posts"]);
  useLive(`post:${id}`, ["comments", "reactions", "post.answered"], { focus: true });
  useLive(mine ? `mine:${mine}` : "news", mine ? ["post.confirmed"] : []);
  return null;
}
