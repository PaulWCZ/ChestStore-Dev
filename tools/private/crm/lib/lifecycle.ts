import * as events from "@argentic/chest-sdk/events";
import type { Sql } from "./db.ts";
import { managers } from "./team.ts";
import { left } from "./tell.ts";

// What Clients does when a member loses access, leaves or is erased (the
// Chest posts these to /chest-events, at least once).
//
// - Losing access or leaving: what they owned — deals, companies, contacts,
//   open next steps — goes to "unassigned" (each deal's history says so),
//   and the managers are told, so that nothing waits on someone who is
//   gone. What they logged stays, signed with their name ("former member").
// - Erasure: the same, then their id disappears from everything — authors,
//   creators, the history's mentions of them — replaced by 'erased'; what
//   they wrote about clients stays for the team. Then the erasure is
//   acknowledged.
export async function leave(sql: Sql, memberId: string): Promise<{ deals: number; steps: number; records: number }> {
  return sql.begin(async tx => {
    const deals = await tx<{ id: string; company_id: string | null; contact_id: string | null }[]>`update deals set owner = null, updated_at = now() where owner = ${memberId} returning id, company_id, contact_id`;
    for (const d of deals) {
      await tx`insert into activities (kind, deal_id, company_id, contact_id, author, data) values ('unassigned', ${d.id}, ${d.company_id}, ${d.contact_id}, 'chest', ${tx.json({ member: memberId })})`;
    }
    const steps = await tx`update steps set owner = null where owner = ${memberId} and done_at is null returning id`;
    const companies = await tx`update companies set owner = null where owner = ${memberId} returning id`;
    const contacts = await tx`update contacts set owner = null where owner = ${memberId} returning id`;
    return { deals: deals.length, steps: steps.length, records: companies.length + contacts.length };
  });
}

export async function erase(sql: Sql, memberId: string): Promise<void> {
  await sql.begin(async tx => {
    await tx`update steps set owner = null where owner = ${memberId}`;
    await tx`update steps set created_by = 'erased' where created_by = ${memberId}`;
    for (const table of ["deals", "companies", "contacts"] as const) {
      await tx`update ${tx(table)} set owner = null where owner = ${memberId}`;
      await tx`update ${tx(table)} set created_by = 'erased' where created_by = ${memberId}`;
    }
    await tx`update activities set author = 'erased' where author = ${memberId}`;
    await tx`update activities set data = data - 'member' where data->>'member' = ${memberId}`;
    await tx`update activities set data = jsonb_set(data, '{from}', '"erased"') where data->>'from' = ${memberId}`;
    await tx`update activities set data = jsonb_set(data, '{to}', '"erased"') where data->>'to' = ${memberId}`;
  });
}

// Managers hear of it once (the notification is keyed by the person).
async function tellManagers(memberId: string, name: string, counts: { deals: number; steps: number; records: number }): Promise<void> {
  await left(await managers(), { id: memberId, name }, counts);
}

async function nameOf(memberId: string): Promise<string> {
  const { people } = await import("./people.ts");
  const person = (await people([memberId])).get(memberId);
  return person && (person.status === "member" || person.status === "former") ? person.name : "";
}

export function handlers(sql: Sql): events.Handlers {
  const gone = async (memberId: string) => {
    const counts = await leave(sql, memberId);
    await tellManagers(memberId, await nameOf(memberId), counts);
  };
  return {
    "access.revoked": event => gone(event.data.id),
    "member.removed": event => gone(event.data.id),
    "member.erased": async event => {
      const counts = await leave(sql, event.data.id);
      await erase(sql, event.data.id);
      await tellManagers(event.data.id, "", counts);
      await events.acknowledgeErasure(event.data.erasure);
    },
  };
}

// The ids of the events already handled, kept in the database.
export function seen(sql: Sql): events.Seen {
  return {
    has: async id => (await sql`select 1 from chest_events where id = ${id}`).length > 0,
    add: async id => {
      await sql`insert into chest_events (id) values (${id}) on conflict do nothing`;
    },
  };
}
