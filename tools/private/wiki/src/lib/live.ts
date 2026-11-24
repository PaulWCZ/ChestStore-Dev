import { ChestError } from "@argentic/chest-sdk/errors";
import * as realtime from "@argentic/chest-sdk/realtime";
import { log } from "@argentic/chest-app";

// What the wiki tells the members' open pages through the Chest's realtime
// (SDK 0.7.0, chest.json's "realtime"). A page's own rows — its version,
// title and flags (pages), its comments (page_comments) — are the Chest's
// feeds, on "page:<id>", each with its id alone: a reader's page reads
// itself again (a 304 when what it shows did not change: pageStamp). The
// lock is not fed: an open editor writes it every few seconds (its draft,
// its heartbeat), which would make every reader's page read itself as
// often. Its changes that matter — taken, given back, taken over — are
// published once written: "page.lock", without payload. A reader's page
// then shows "Camille is editing" or no longer; an editor waiting behind
// the lock tries again at once; an editor whose lock was taken over learns
// it at once. Who has the editor open is the channel's presence (the
// editor tracks itself there; readers do not).
// Delivery is a courtesy: when the Chest cannot take it, the page catches
// up at its next read.
export const pageChannel = (pageId: string) => `page:${pageId}`;

export async function lockChanged(pageId: string): Promise<void> {
  try {
    await realtime.publish(pageChannel(pageId), "page.lock");
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    log.warn("live: not published", { note: error.code });
  }
}

// onScreen: of these members, those who have this page on screen now
// (realtime.online's watching) — they see a comment arrive and are not
// told of it again. Nobody when the Chest cannot say (a notification too
// many rather than one missing).
export async function onScreen(memberIds: readonly string[], pageId: string): Promise<Set<string>> {
  const ids = [...new Set(memberIds.filter(id => id.startsWith("mbr_")))];
  if (ids.length === 0) return new Set();
  try {
    return new Set((await realtime.online(ids, { channel: pageChannel(pageId) })).watching);
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return new Set();
  }
}
