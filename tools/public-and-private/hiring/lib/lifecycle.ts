import * as events from "@argentic/chest-sdk/events";
import type { Sql } from "./db.ts";

// When a member loses access or leaves the Chest, they are taken off the
// jobs they interviewed for and no longer asked for feedback; what they
// wrote (notes, feedback) stays, their name then read "(former member)".
// On erasure, their id disappears everywhere: what they wrote stays,
// signed "Former member", then the erasure is acknowledged.
export async function leave(sql: Sql, memberId: string): Promise<void> {
  await sql.begin(async tx => {
    // Their interviews to come are rewritten in the others' calendars
    // (the Chest drops them from a feed they no longer have).
    await tx`update interviews set calendar = 'pending', updated_at = now() where calendar = 'done' and starts_at > now() and id in (select interview_id from interview_people where member_id = ${memberId})`;
    await tx`delete from interview_people p using interviews i where i.id = p.interview_id and p.member_id = ${memberId} and i.starts_at > now()`;
    await tx`delete from job_interviewers where member_id = ${memberId}`;
    await tx`delete from feedback_requests where member_id = ${memberId}`;
    await tx`delete from candidate_seen where member_id = ${memberId}`;
    // A link a candidate has not used yet no longer offers them.
    await tx`delete from interview_request_people p using interview_requests r where r.id = p.request_id and p.member_id = ${memberId} and r.booked_at is null`;
  });
}

export async function erase(sql: Sql, memberId: string): Promise<void> {
  await sql.begin(async tx => {
    await tx`delete from job_interviewers where member_id = ${memberId}`;
    await tx`delete from feedback_requests where member_id = ${memberId}`;
    await tx`delete from candidate_seen where member_id = ${memberId}`;
    await tx`update job_interviewers set added_by = 'erased' where added_by = ${memberId}`;
    await tx`update feedback_requests set requested_by = 'erased' where requested_by = ${memberId}`;
    await tx`update notes set author = 'erased' where author = ${memberId}`;
    await tx`update feedback set author = 'erased' where author = ${memberId}`;
    await tx`update activity set actor = 'erased' where actor = ${memberId}`;
    // "Asked Inès and Hugo for feedback": the list names members too.
    await tx`
      update activity set data = jsonb_set(data, '{members}', (
        select coalesce(jsonb_agg(case when m = to_jsonb(${memberId}::text) then to_jsonb('erased'::text) else m end), '[]'::jsonb)
        from jsonb_array_elements(data->'members') as m))
      where kind = 'asked' and data->'members' @> to_jsonb(array[${memberId}::text])`;
    await tx`update candidates set added_by = 'erased' where added_by = ${memberId}`;
    await tx`update interviews set calendar = 'pending', updated_at = now() where calendar = 'done' and id in (select interview_id from interview_people where member_id = ${memberId})`;
    await tx`delete from interview_people where member_id = ${memberId}`;
    await tx`update interviews set created_by = 'erased' where created_by = ${memberId}`;
    await tx`delete from interview_request_people where member_id = ${memberId}`;
    await tx`update interview_requests set created_by = 'erased' where created_by = ${memberId}`;
    await tx`update messages set author = 'erased' where author = ${memberId}`;
    await tx`update templates set created_by = 'erased' where created_by = ${memberId}`;
    await tx`
      update activity set data = jsonb_set(data, '{people}', (
        select coalesce(jsonb_agg(case when m = to_jsonb(${memberId}::text) then to_jsonb('erased'::text) else m end), '[]'::jsonb)
        from jsonb_array_elements(data->'people') as m))
      where kind in ('interview', 'interview_chosen', 'interview_link') and data->'people' @> to_jsonb(array[${memberId}::text])`;
    await tx`update jobs set created_by = 'erased' where created_by = ${memberId}`;
  });
}

export function handlers(sql: Sql): events.Handlers {
  return {
    "access.revoked": event => leave(sql, event.data.id),
    "member.removed": event => leave(sql, event.data.id),
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
