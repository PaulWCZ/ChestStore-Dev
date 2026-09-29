import { ChestError } from "@argentic/chest-sdk/errors";
import type { Member } from "@argentic/chest-sdk/member";
import type { Query } from "./db.ts";
import { everyone, type DirectoryPerson } from "./directory.ts";
import { format, plural, spanText } from "./i18n/index.ts";
import { badges, notify, withdraw } from "./notify.ts";
import { people } from "./people.ts";
import { openRequests, type LeaveRequest } from "./requests.ts";
import { answerers, counts } from "./routing.ts";
import { leaveType } from "./rules.ts";
import { staffRow } from "./staff.ts";
import { typeName } from "./type-name.ts";
import { canBeApprover } from "./access.ts";

// What Leave tells people through the Chest's bell, each in their own
// language, and the number on approvers' tiles (requests waiting for them).
// A request's item for its answerers is keyed by the request and withdrawn
// once it is answered; the requester's answer has a key of its own.
const path = (r: { id: string }) => `/chest/requests/${r.id}`;
const key = (r: { id: string }) => `req:${r.id}`;

type Directory = Pick<DirectoryPerson, "id" | "role">[];

async function directory(): Promise<Directory | null> {
  try {
    return await everyone();
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return null;
  }
}

async function describe(sql: Query, r: LeaveRequest) {
  const type = await leaveType(sql, r.typeId);
  return (t: Parameters<Parameters<typeof notify>[1]>[0], locale: string) =>
    `${typeName(type, t.types)} · ${spanText(r, locale, t.span)} · ${plural(t.units.days, r.days, locale)}`;
}

async function answerersOf(sql: Query, r: LeaveRequest, dir: Directory): Promise<string[]> {
  return answerers({ memberId: r.memberId, approverId: (await staffRow(sql, r.memberId)).approverId }, dir);
}

// A new request (or a declared absence) goes to those who answer it.
export async function asked(sql: Query, actor: Member, r: LeaveRequest): Promise<void> {
  const dir = await directory();
  if (!dir) return;
  const type = await leaveType(sql, r.typeId);
  const body = await describe(sql, r);
  const to = (await answerersOf(sql, r, dir)).filter(a => a !== actor.id);
  const declared = r.status === "approved";
  await notify(to, (t, locale) => ({ title: format(declared ? (type.key === "sick" ? t.bell.declared : t.bell.declaredOther) : t.bell.asked, { name: actor.name }), body: body(t, locale) }), { path: path(r), key: key(r) });
  await refreshBadges(sql, dir);
}

// Leave recorded for someone by HR or their approver: the person is told,
// in their language.
export async function recorded(sql: Query, actor: Member, r: LeaveRequest): Promise<void> {
  const body = await describe(sql, r);
  await notify([r.memberId], (t, locale) => ({ title: format(t.bell.recorded, { name: actor.name }), body: body(t, locale) }), { path: path(r), key: key(r) + ":answer" });
  await refreshBadges(sql);
}

// The requester hears the answer; the answerers' item goes.
export async function answered(sql: Query, actor: Member, r: LeaveRequest): Promise<void> {
  await withdraw(key(r));
  const body = await describe(sql, r);
  if (r.memberId !== actor.id) {
    await notify([r.memberId], (t, locale) => ({
      title: r.status === "approved" ? t.bell.approved : t.bell.refused,
      body: body(t, locale) + (r.reason ? "\n" + r.reason : "") + "\n" + format(t.bell.by, { name: actor.name }),
    }), { path: path(r), key: key(r) + ":answer" });
  }
  await refreshBadges(sql);
}

// An answer taken back: the requester's item goes, the request waits again.
export async function reopened(sql: Query, actor: Member, r: LeaveRequest): Promise<void> {
  await withdraw(key(r) + ":answer");
  const dir = await directory();
  if (!dir) return;
  const name = (await people([r.memberId])).get(r.memberId)?.name ?? "";
  const body = await describe(sql, r);
  await notify((await answerersOf(sql, r, dir)).filter(a => a !== actor.id && a !== r.memberId), (t, locale) => ({ title: format(t.bell.asked, { name }), body: body(t, locale) }), { path: path(r), key: key(r) });
  await refreshBadges(sql, dir);
}

// A pending request cancelled by its person: nobody needs to answer it.
export async function withdrawn(sql: Query, r: { id: string }): Promise<void> {
  await withdraw(key(r));
  await refreshBadges(sql);
}

export async function cancelAsked(sql: Query, actor: Member, r: LeaveRequest): Promise<void> {
  const dir = await directory();
  if (!dir) return;
  const body = await describe(sql, r);
  await notify((await answerersOf(sql, r, dir)).filter(a => a !== actor.id), (t, locale) => ({ title: format(t.bell.cancelAsked, { name: actor.name }), body: body(t, locale) }), { path: path(r), key: key(r) });
  await refreshBadges(sql, dir);
}

export async function cancelSettled(sql: Query, actor: Member, r: LeaveRequest): Promise<void> {
  await withdraw(key(r));
  const body = await describe(sql, r);
  if (r.memberId !== actor.id) {
    await notify([r.memberId], (t, locale) => ({
      title: r.status === "cancelled" ? t.bell.cancelled : t.bell.kept,
      body: body(t, locale) + (r.reason ? "\n" + r.reason : "") + "\n" + format(t.bell.by, { name: actor.name }),
    }), { path: path(r), key: key(r) + ":answer" });
  }
  await refreshBadges(sql);
}

// refreshBadges sets each approver's tile to the number of requests waiting
// for them (0 clears it).
export async function refreshBadges(sql: Query, known?: Directory): Promise<Map<string, number>> {
  const dir = known ?? (await directory());
  if (!dir) return new Map();
  const found = counts(await openRequests(sql), dir);
  const all = new Map<string, number>();
  for (const p of dir) if (canBeApprover(p.role)) all.set(p.id, found.get(p.id) ?? 0);
  await badges(all);
  return all;
}
