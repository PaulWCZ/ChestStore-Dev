import { ChestError } from "@argentic/chest-sdk/errors";
import * as realtime from "@argentic/chest-sdk/realtime";
import { log } from "@argentic/chest-app";
import type { Query } from "./db.ts";

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

// Who may join "page:<id>" is the Chest's to check, at every join, in the
// table page_live (chest.json: the channel's "join"; migration 0007): a
// page kept to HR, or someone's "My pages", is never heard of — who edits
// it, when it changes — by a member who may not read it. admit writes the
// row once the wiki has checked the member reads the page (pages.page),
// and answers its mark: a page let in again after its row went (below)
// gets a new one, and its live island joins again (islands/Page.tsx).
export async function admit(sql: Query, pageId: string, memberId: string): Promise<string> {
  const [row] = await sql<{ since: Date }[]>`
    with added as (insert into page_live (page_id, member_id) values (${pageId}, ${memberId}) on conflict do nothing returning since)
    select since from added union all select since from page_live where page_id = ${pageId} and member_id = ${memberId} limit 1`;
  return row ? String(row.since.getTime()) : "";
}

// forget takes the rows out wherever who reads a page may have changed:
// the Chest then takes those members out of the channels at once (their
// pages read themselves again, and are let in again if still allowed).
export async function forget(sql: Query, which: { space: string } | { pages: readonly string[] } | { member: string }): Promise<void> {
  if ("space" in which) await sql`delete from page_live where page_id in (select id from pages where space_id = ${which.space})`;
  else if ("pages" in which) {
    if (which.pages.length > 0) await sql`delete from page_live where page_id in ${sql(which.pages)}`;
  } else await sql`delete from page_live where member_id = ${which.member}`;
}

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
