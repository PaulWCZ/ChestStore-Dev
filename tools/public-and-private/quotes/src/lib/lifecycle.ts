import * as events from "@argentic/chest-sdk/events";
import type { Sql } from "./db.ts";

// What the tool does when a member loses access, leaves, or is erased (the
// Chest posts these to /chest-events, at least once; every step is
// idempotent).
//
// - Losing access or leaving: nothing changes. Quotes, invoices, clients and
//   payments are the company's records, not the person's: they stay, and
//   pages name their author "Name (former member)".
// - Erasure: the documents stay too — a finalised invoice is a legal record
//   the company must keep ten years (Code de commerce L123-22; GDPR art.
//   17(3)(b)) — but the person's id is replaced by 'erased' wherever the
//   tool kept it (who created, sent, decided, finalised, recorded a
//   payment, changed the settings or the numbering, set an invoice to
//   repeat, made or turned off a quote's link, started or sent a quote's version,
//   downloaded an archive). The database's guard of finalised documents lets exactly this
//   change through. Then the erasure is acknowledged.
export async function erase(sql: Sql, memberId: string): Promise<void> {
  await sql.begin(async tx => {
    await tx`update documents set created_by = 'erased' where created_by = ${memberId}`;
    await tx`update documents set finalised_by = 'erased' where finalised_by = ${memberId}`;
    await tx`update documents set sent_by = 'erased' where sent_by = ${memberId}`;
    await tx`update documents set decided_by = 'erased' where decided_by = ${memberId}`;
    await tx`update payments set created_by = 'erased' where created_by = ${memberId}`;
    await tx`update clients set created_by = 'erased' where created_by = ${memberId}`;
    await tx`update items set created_by = 'erased' where created_by = ${memberId}`;
    await tx`update company set updated_by = 'erased' where updated_by = ${memberId}`;
    await tx`update numbering_changes set changed_by = 'erased' where changed_by = ${memberId}`;
    await tx`update repeats set created_by = 'erased' where created_by = ${memberId}`;
    await tx`update quote_links set created_by = 'erased' where created_by = ${memberId}`;
    await tx`update quote_links set revoked_by = 'erased' where revoked_by = ${memberId}`;
    await tx`update archives set downloaded_by = 'erased' where downloaded_by = ${memberId}`;
    await tx`update quote_versions set replaced_by = 'erased' where replaced_by = ${memberId}`;
    await tx`update quote_versions set sent_by = 'erased' where sent_by = ${memberId}`;
  });
}

export function handlers(sql: Sql): events.Handlers {
  return {
    "member.erased": async event => {
      await erase(sql, event.data.id);
      await events.acknowledgeErasure(event.data.erasure);
    },
  };
}

// The ids of what the Chest delivered already (events, schedule runs),
// kept in the database: a delivery made again after a restart is
// recognised. A row per delivery: forget() drops those older than the
// Chest's retries (30 days), each morning (the "followup" schedule).
export function seen(sql: Sql): events.Seen & { forget(days?: number): Promise<void> } {
  return {
    has: async id => (await sql`select 1 from chest_events where id = ${id}`).length > 0,
    add: async id => {
      await sql`insert into chest_events (id) values (${id}) on conflict do nothing`;
    },
    forget: async (days = 30) => {
      await sql`delete from chest_events where handled_at < now() - make_interval(days => ${days})`;
    },
  };
}
