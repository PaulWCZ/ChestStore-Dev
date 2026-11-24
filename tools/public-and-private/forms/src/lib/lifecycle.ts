import * as events from "@argentic/chest-sdk/events";
import { seen } from "@argentic/chest-app/db";
import type { Sql } from "./db.ts";
import { remove } from "./uploads.ts";
import { filesOf } from "./answers.ts";
import * as live from "./live.ts";
import type { Answers } from "../shared/logic.ts";

// What the tool does when a member changes, loses access, leaves or is
// erased (the Chest posts these to /chest-events). Idempotent: an event may
// come twice.
//
// - access.revoked / member.removed: the person is taken off the forms
//   shared with them and no longer told of answers. Forms they own stay
//   (names are resolved at render: "(former member)"); any manager opens
//   them and can hand them on by sharing.
// - member.erased: the same, plus their own answers to team forms are
//   deleted (with files), their mark in anonymous forms' participants
//   becomes "erased" (still counted, never named), and forms they owned
//   are owned by "erased" (managers keep them). Then acknowledged.
// - member.updated with their role: the forms they follow live are
//   checked again (a manager no longer opens every form; lib/live.ts).
// In each case they follow no form live any more until a page lets them
// in again.
export function handlers(sql: Sql): events.Handlers<"member.updated" | "access.revoked" | "member.removed" | "member.erased"> {
  const leave = async (id: string) => {
    await sql.begin(async tx => {
      await tx`delete from access where member = ${id}`;
      await tx`delete from watchers where member = ${id}`;
      await live.forget(tx, { member: id });
    });
  };
  return {
    "member.updated": async event => { if (event.data.changed.includes("role")) await live.forget(sql, { member: event.data.id }); },
    "access.revoked": async event => leave(event.data.id),
    "member.removed": async event => leave(event.data.id),
    "member.erased": async event => {
      const id = event.data.id;
      await leave(id);
      const gone = await sql.begin(async tx => {
        const rows = await tx<{ form_id: string; data: Answers; deleted_at: Date | null }[]>`delete from answers where respondent = ${id} returning form_id, data, deleted_at`;
        for (const r of rows) if (!r.deleted_at) await tx`update forms set answer_count = greatest(answer_count - 1, 0) where id = ${r.form_id}`;
        await tx`update participants set member = 'erased' where member = ${id}`;
        await tx`update forms set owner = 'erased' where owner = ${id}`;
        await tx`update form_hooks set created_by = 'erased' where created_by = ${id}`;
        await tx`delete from live_out where member_id = ${id}`;
        return rows.flatMap(r => filesOf(r.data));
      });
      await remove(gone);
      await events.acknowledgeErasure(event.data.erasure);
      // What the Chest delivered a month ago will not come again.
      await seen.forget();
    },
  };
}
