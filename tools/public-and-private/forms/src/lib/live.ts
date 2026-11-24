import { log } from "@argentic/chest-app";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as realtime from "@argentic/chest-sdk/realtime";
import type { Query } from "./db.ts";

// What the members' open pages follow (SDK 0.7.0's realtime, chest.json's
// "realtime"), never a timer:
//
// - form:<id> — a form's own rows, the Chest's feeds (forms, answers; an id
//   alone): joined only by who may open the form, through the table
//   form_live (the channel's "join", migration 0007). admit writes the
//   rows once the tool has checked the member opens these forms
//   (forms.open, forms.list) and answers each form's mark; forget takes
//   them out wherever that may have changed, and the Chest takes those
//   members out of the channel at once (their page reads itself again and
//   is let in again if still allowed, with a new mark: its live island
//   joins again).
// - What a page shows besides the forms it may open is told by the tool,
//   without an id: "forms.changed" on "team" (every member) when a team
//   form — one every member is offered to answer — opens, closes or
//   changes; on "managers" when a form is made, put aside or brought back
//   (a manager's home lists every form); on "mine:<member>" when a form is
//   shared with them or taken back, or their answer's follow-up changes.
// Delivery is a courtesy: when the Chest cannot take it, the page catches
// up at its next read.
export type Followed = { id: string; ticket: string };
export const formChannel = (id: string): string => `form:${id}`;
export const lane = (member: string): string => `mine:${member}`;

export async function admit(sql: Query, formIds: readonly string[], memberId: string): Promise<Followed[]> {
  const ids = [...new Set(formIds)];
  if (ids.length === 0) return [];
  await sql`insert into form_live ${sql(ids.map(id => ({ form_id: id, member_id: memberId })))} on conflict do nothing`;
  const rows = await sql<{ form_id: string; since: Date }[]>`select form_id, since from form_live where member_id = ${memberId} and form_id in ${sql(ids)}`;
  const marks = new Map(rows.map(r => [String(r.form_id), String(r.since.getTime())]));
  return ids.flatMap(id => (marks.has(id) ? [{ id, ticket: marks.get(id)! }] : []));
}

export async function forget(sql: Query, which: { form: string; member?: string } | { member: string }): Promise<void> {
  if ("form" in which) {
    if (which.member) await sql`delete from form_live where form_id = ${which.form} and member_id = ${which.member}`;
    else await sql`delete from form_live where form_id = ${which.form}`;
  } else await sql`delete from form_live where member_id = ${which.member}`;
}

async function hint(channel: string): Promise<void> {
  try {
    await realtime.publish(channel, "forms.changed");
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    log.warn("live: not published", { note: error.code });
  }
}

// A team form every member is offered (published, or just closed or put
// aside) changed: their homes read themselves again.
export async function teamChanged(...forms: ({ audience: string; version: number } | null | undefined)[]): Promise<void> {
  if (forms.some(f => f && f.audience === "team" && f.version > 0)) await hint("team");
}
export const managersChanged = (): Promise<void> => hint("managers");
export const memberChanged = (member: string): Promise<void> => (member.startsWith("mbr_") ? hint(lane(member)) : Promise.resolve());
