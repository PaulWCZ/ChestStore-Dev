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
// ticket: the mark of the reader's row in post_live (lib/live.ts), which
// lets them join "post:<id>". When it went (the post's audience or their
// groups changed), the Chest took them out and the page read itself again:
// still allowed, a new mark — and the channel is joined again.
export function LivePost({ id, ticket, mine }: { id: string; ticket: string; mine: string | null }) {
  useLive("news", ["posts"]);
  useLive(mine ? `mine:${mine}` : "news", mine ? ["post.confirmed"] : []);
  return <FollowPost key={ticket} id={id} />;
}
function FollowPost({ id }: { id: string }) {
  useLive(`post:${id}`, ["comments", "reactions", "post.answered"], { focus: true });
  return null;
}
