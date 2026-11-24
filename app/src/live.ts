import { connect, type Channel, type Live } from "@argentic/chest-sdk/realtime/client";

// ---- useLive(channel, names): a page others change (a board, a queue, a
// list of notes), read again when the Chest says it changed — never on a
// timer. The Chest holds the page's connection (SDK 0.7.0's realtime: the
// "realtime" capability, the channel and the feeds in chest.json); the
// tool sleeps while the page stays open, and wakes only when someone
// writes. names: a feed's table ("notes": its .insert, .update and .delete)
// or an event the tool publishes ("rooms.changed", with a dot).
//
// The page is read again (refresh(): what is typed, the scroll and each
// island's state stay; a page served with page(render, { version }) is a
// 304 when nothing changed):
// - at each event of those names, several within a moment read once;
// - when the channel is joined and what the page missed did not come
//   again (the first join included: a write between the render and the
//   join), and at a resync (the Chest kept too little to replay);
// - when the member is taken out of the channel or the connection is
//   closed for good (signed out, access removed: the page then says so);
// - while the tab is hidden, never: once, when it comes back.
// One connection for the page, shared by every island that asks; a channel
// left when the last island that follows it goes (a navigation).
// (The hook is use-live.ts: this module is what it does, without React nor
// the page's runtime — the unit tests run it in Node.)

// The connection, made by the first island that follows a channel and
// closed a moment after the last one stops (a navigation between two live
// pages keeps it).
let live: Live | null = null;
let users = 0;
let closing: ReturnType<typeof setTimeout> | undefined;
export function shared(): Live {
  clearTimeout(closing);
  if (!live) {
    const made = connect();
    made.on("closed", () => {
      if (live === made) live = null;
      later();
    });
    live = made;
  }
  return live;
}
function release(): void {
  if (--users > 0) return;
  clearTimeout(closing);
  closing = setTimeout(() => {
    if (users > 0 || !live) return;
    live.close();
    live = null;
  }, 1000);
}

// One read for a burst of events, none while hidden (once on return), and
// one more after a read that was on its way when an event came.
const quiet = 150;
let wanted = false;
let reading = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let watching = false;
function later(): void {
  wanted = true;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") {
    if (!watching) {
      watching = true;
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && wanted) later();
      });
    }
    return;
  }
  if (reading || timer) return;
  timer = setTimeout(() => {
    timer = undefined;
    void read();
  }, quiet);
}
async function read(): Promise<void> {
  wanted = false;
  reading = true;
  try {
    await reader();
  } finally {
    reading = false;
    if (wanted) later();
  }
}
// What a read does: the page's refresh(), set by use-live.ts.
let reader: () => Promise<unknown> = async () => {};
export function readWith(fn: () => Promise<unknown>): void {
  reader = fn;
}

// follow: what useLive does, given the connection — the unit tests give
// a fake one. Answers what stops following.
export function follow(connection: Pick<Live, "channel" | "focus">, name: string, names: readonly string[], options: { focus: boolean }): () => void {
  users += 1;
  const ch: Channel = connection.channel(name);
  const events = names.flatMap(n => (n.includes(".") ? [n] : [`${n}.insert`, `${n}.update`, `${n}.delete`]));
  const stops = [
    ...events.map(e => ch.on(e, later)),
    ch.onJoined(({ replayed }) => { if (!replayed) later(); }),
    ch.onResync(later),
    ch.onKicked(later),
  ];
  followed.set(name, (followed.get(name) ?? 0) + 1);
  if (options.focus) connection.focus(name);
  return () => {
    for (const stop of stops) stop();
    const left = (followed.get(name) ?? 1) - 1;
    if (left > 0) followed.set(name, left);
    else {
      followed.delete(name);
      ch.leave();
    }
    // The island that had it on screen went: nothing is (the next page's
    // island says its own).
    if (options.focus) connection.focus(null);
    if (connection === live) release();
    else users -= 1;
  };
}
const followed = new Map<string, number>();

// The pause that gathers a burst of events into one read (ms).
export const liveQuiet = quiet;
