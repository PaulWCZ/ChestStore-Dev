// The realtime channel and feeds the pages follow (chest.json's
// "realtime"; test/live.test.ts checks both agree).
//
// board:<id> — every member who has Tasks may join it (contract 0.7 has no
// rule for "whoever sees this board": a team board is everyone's, a
// private one its people's, its groups' and the managers'). So the feeds
// carry ids alone — a card's id and its board's —, never a title or a
// person: a private board's content never travels on it, and the page's
// read, which checks the member's access, decides what is shown. A change
// inside a card (a step, a comment, a person, a label, a file, a field's
// value, a blocker) touches its card (migration 0008: cards.changed_at),
// so the `cards` feed covers it.
//
// "My tasks" follows the boards its reader sees: a card or a step given to
// them on any of them touches that card. (A per-member channel cannot
// carry a feed in contract 0.7: `mine:{member}` with a feed is refused by
// chest check, and `mine:*` would let anyone follow anyone's.)
export const boardChannel = (id: string): string => `board:${id}`;
export const boardFeeds = ["cards", "columns", "labels", "fields", "boards"] as const;
export const followBoards = (ids: Iterable<string>): { channel: string; names: string[] }[] =>
  [...new Set(ids)].map(id => ({ channel: boardChannel(id), names: [...boardFeeds] }));
