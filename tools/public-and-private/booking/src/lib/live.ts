import type { Query } from "./db.ts";

// Who may join "agenda:<host>" (chest.json: the channel's "join"; migration
// 0010) is the Chest's to check, at every join, in the table agenda_live:
// a host's meetings are never heard of — when one is booked, moved or
// cancelled — by another host. admit writes the rows once Booking has
// checked the member sees these agendas (booking.followedHosts: their own,
// or every host's for an administrator; booking.bookingFor), and answers
// each agenda's mark: one let in again after its row went (below) gets a
// new one, and the page's live island joins the channel again
// (islands/LiveAgenda.tsx).
export type Followed = { id: string; ticket: string };

export async function admit(sql: Query, hostIds: readonly string[], memberId: string): Promise<Followed[]> {
  const ids = [...new Set(hostIds.filter(id => id.startsWith("mbr_")))];
  if (ids.length === 0) return [];
  await sql`insert into agenda_live ${sql(ids.map(id => ({ host_id: id, member_id: memberId })))} on conflict do nothing`;
  const rows = await sql<{ host_id: string; since: Date }[]>`select host_id, since from agenda_live where member_id = ${memberId} and host_id in ${sql(ids)}`;
  const marks = new Map(rows.map(r => [r.host_id, String(r.since.getTime())]));
  return ids.flatMap(id => (marks.has(id) ? [{ id, ticket: marks.get(id)! }] : []));
}

// forget takes out what a member follows (their role changed, they lost
// access or left): the Chest then takes them out of the channels at once
// (their pages read themselves again, and are let in again if still
// allowed). An erased member is also taken out as a host: their id goes
// from the table.
export async function forget(sql: Query, memberId: string, options: { asHost?: boolean } = {}): Promise<void> {
  if (options.asHost) await sql`delete from agenda_live where member_id = ${memberId} or host_id = ${memberId}`;
  else await sql`delete from agenda_live where member_id = ${memberId}`;
}
