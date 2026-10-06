import * as events from "@argentic/chest-sdk/events";
import { syncEvent } from "./agenda.ts";
import type { Sql } from "./db.ts";
import { forgetGroups } from "./groups.ts";
import { promoted, proposalsWaiting, reconcile } from "./tell.ts";
import { today } from "./time.ts";
import { forgetViewer } from "./views.ts";
import { chestZone } from "./zone.ts";

// What News does when a member loses access, leaves or is erased (the Chest
// posts these to /chest-events, at least once; every handler may run twice).
//
// - Losing access or leaving: their answers to events still to come are
//   removed (nobody counts on them; the seat goes to the first waiting),
//   their last visit, weekly digest and choices are forgotten, their
//   posts still waiting for a publisher go. What they wrote and confirmed stays: it is the company's
//   record, and their name reads "(former member)".
// - Erasure: what they wrote stays for the company, unsigned ('erased'):
//   posts, comments, reactions (still counted), files they added; a welcome
//   post about them names nobody, a mention of them in a comment names
//   nobody. Their confirmations, answers, visits, the fingerprints of the posts
//   they opened (lib/views.ts), choices, the record of
//   the emails sent to them, of posts kept to them and their proposals are deleted. Then the erasure is
//   acknowledged. The words others wrote about them (a welcome text, a
//   photo) are not changed: a publisher deletes the post if it must go
//   (README, "On a Chest").
export async function leave(sql: Sql, memberId: string, day = today(chestZone())): Promise<void> {
  const events = await sql.begin(async tx => {
    const gone = await tx<{ post_id: string }[]>`delete from rsvps r using posts p where p.id = r.post_id and r.member = ${memberId} and coalesce(p.event_last_day, p.event_day) >= ${day} returning r.post_id`;
    await tx`delete from visits where member = ${memberId}`;
    await tx`delete from preferences where member = ${memberId}`;
    await tx`delete from digests where member = ${memberId}`;
    // Their posts still waiting for a publisher go: nobody could tell them
    // (a picture becomes an unused upload, purged).
    const proposed = await tx`delete from proposals where author = ${memberId} and declined_at is null returning id`;
    return { events: [...new Set(gone.map(g => String(g.post_id)))], proposed: proposed.length > 0 };
  });
  await freed(sql, events.events);
  if (events.proposed) await proposalsWaiting(sql);
}

// freed gives the seats of these events to the first waiting, and puts the
// events in the calendars again.
async function freed(sql: Sql, postIds: string[]): Promise<void> {
  for (const postId of postIds) {
    const moved = await sql<{ member: string; title: string }[]>`
      update rsvps r set answer = 'yes' from posts p
      where p.id = r.post_id and r.post_id = ${postId} and p.seats is not null and r.answer = 'wait'
        and r.member in (select member from rsvps where post_id = ${postId} and answer = 'wait' order by at, member
          limit greatest(0, (select seats from posts where id = ${postId}) - (select count(*) from rsvps where post_id = ${postId} and answer = 'yes')))
      returning r.member, p.title`;
    for (const m of moved) await promoted(m.member, { id: postId, title: m.title });
    await syncEvent(sql, postId);
  }
}

export async function erase(sql: Sql, memberId: string): Promise<void> {
  const events = await sql.begin(async tx => {
    await tx`update posts set author = 'erased' where author = ${memberId}`;
    await tx`update posts set welcome = 'erased' where welcome = ${memberId}`;
    await tx`update comments set author = 'erased' where author = ${memberId}`;
    await tx`update comments set body = replace(body, ${"@[" + memberId + "]"}, '@[erased]') where strpos(body, ${"@[" + memberId + "]"}) > 0`;
    await tx`update reactions set member = 'erased' where member = ${memberId}`;
    await tx`update files set added_by = 'erased' where added_by = ${memberId}`;
    await tx`update revisions set edited_by = 'erased' where edited_by = ${memberId}`;
    await tx`delete from confirmations where member = ${memberId}`;
    await forgetViewer(tx, memberId);
    const gone = await tx<{ post_id: string }[]>`delete from rsvps where member = ${memberId} returning post_id`;
    await tx`delete from visits where member = ${memberId}`;
    await tx`delete from preferences where member = ${memberId}`;
    await tx`delete from digests where member = ${memberId}`;
    await tx`delete from emails where member = ${memberId}`;
    await tx`delete from post_people where member = ${memberId}`;
    // Their proposals go (waiting or declined); one thanking them names
    // nobody.
    await tx`delete from proposals where author = ${memberId}`;
    await tx`update proposals set colleague = 'erased' where colleague = ${memberId}`;
    await tx`update proposals set declined_by = 'erased' where declined_by = ${memberId}`;
    await tx`update posts set approved_by = 'erased' where approved_by = ${memberId}`;
    return [...new Set(gone.map(g => String(g.post_id)))];
  });
  await freed(sql, events);
  await proposalsWaiting(sql);
}

export function handlers(sql: Sql): events.Handlers {
  return {
    "access.revoked": async event => {
      await leave(sql, event.data.id);
      await reconcile(sql, { member: event.data.id });
    },
    "member.removed": event => leave(sql, event.data.id),
    // Someone moved between groups: the Important posts no longer for them
    // leave their bell (and their number); those now for them show on the
    // front page and in their number.
    "member.updated": async event => {
      if (!event.data.changed.includes("groups")) return;
      forgetGroups();
      await reconcile(sql, { member: event.data.id });
    },
    // Groups (Proposal (studio), "groups": "read"): members left a group, or
    // the group is gone — its posts' bell items leave whoever they are no
    // longer for.
    "group.changed": async event => {
      forgetGroups();
      if (event.data.changed.includes("members")) await reconcile(sql, { group: event.data.id });
    },
    "group.removed": async event => {
      forgetGroups();
      await reconcile(sql, { group: event.data.id });
    },
    "member.erased": async event => {
      await erase(sql, event.data.id);
      await events.acknowledgeErasure(event.data.erasure);
    },
  };
}

// The ids of the events already handled, kept in the database: a delivery
// made again after a restart is recognised.
export function seen(sql: Sql): events.Seen {
  return {
    has: async id => (await sql`select 1 from chest_events where id = ${id}`).length > 0,
    add: async id => {
      await sql`insert into chest_events (id) values (${id}) on conflict do nothing`;
    },
  };
}
