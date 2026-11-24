import * as members from "../../../packages/chest-client/src/members.js";
import * as notifications from "../../../packages/chest-client/src/notifications.js";
import type { GroupPage, Lookup, MemberPage } from "../../../packages/chest-client/src/members.js";
import type { Member } from "../../../packages/chest-client/src/member.js";
import type { Audience, Delivery, Notice } from "../../../packages/chest-client/src/notifications.js";

// Who has the tool — the capability members of its manifest —, read from
// its Chest through the SDK (members.ts) at each call: the members' page
// and the routes the laboratory's proof reads, every group of the Chest
// (members.groups); and what the tool tells them — the capability
// notifications (notifications.ts) —: an item in their inbox, to some or to
// a whole group, withdrawn by its key, the counter of its tile.
export interface Team {
  list(options: { after?: string; q?: string }): Promise<MemberPage>;
  get(id: string): Promise<Member | null>;
  lookup(ids: string[]): Promise<Lookup>;
  groups(after?: string): Promise<GroupPage>;
  notify(ids: string[], notice: Notice): Promise<Delivery>;
  broadcast(notice: Notice, audience: Audience): Promise<void>;
  withdraw(key: string, ids?: string[]): Promise<void>;
  badge(id: string, count: number): Promise<boolean>;
}

export class ChestTeam implements Team {
  list(options: { after?: string; q?: string }): Promise<MemberPage> { return members.list(options); }
  get(id: string): Promise<Member | null> { return members.get(id); }
  lookup(ids: string[]): Promise<Lookup> { return members.lookup(ids); }
  groups(after?: string): Promise<GroupPage> { return members.groups.list(after === undefined ? {} : { after }); }
  notify(ids: string[], notice: Notice): Promise<Delivery> { return notifications.notify(ids, notice); }
  broadcast(notice: Notice, audience: Audience): Promise<void> { return notifications.broadcast(notice, audience); }
  withdraw(key: string, ids?: string[]): Promise<void> { return notifications.withdraw(key, ids); }
  badge(id: string, count: number): Promise<boolean> { return notifications.badge.set(id, count); }
}
