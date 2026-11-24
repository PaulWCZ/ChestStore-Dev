// The realtime channel and feeds the pages follow (chest.json's
// "realtime"; test/live.test.ts checks both agree).
//
// board:<id> — joined only by who sees the board: the Chest checks the
// table board_live at every join (chest.json's "join", lib/live.ts), where
// Tasks writes a row once it has checked the member sees the board, and
// takes it out wherever that may have changed. The feeds still carry ids
// alone — a card's id and its board's —, never a title or a person: the
// page's read, which checks the member's access, decides what is shown. A change
// inside a card (a step, a comment, a person, a label, a file, a field's
// value, a blocker) touches its card (migration 0008: cards.changed_at),
// so the `cards` feed covers it.
//
// "My tasks" follows the boards its reader sees: a card or a step given to
// them on any of them touches that card. (A per-member channel cannot
// carry a feed in contract 0.7: `mine:{member}` with a feed is refused by
// chest check.)
//
// followBoards takes each board's mark (lib/live.ts: admit): when a
// member's row went and came back, the mark changes, and the island that
// follows the board joins its channel again (the Chest took them out).
export const boardChannel = (id: string): string => `board:${id}`;
export const boardFeeds = ["cards", "columns", "labels", "fields", "boards"] as const;
export const followBoards = (tickets: ReadonlyMap<string, string>): { channel: string; names: string[]; ticket: string }[] =>
  [...tickets].map(([id, ticket]) => ({ channel: boardChannel(id), names: [...boardFeeds], ticket }));
