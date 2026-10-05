import { ask, json, refusal } from "../src/api.js";
import { ChestError, Unavailable } from "../src/errors.js";
import { groupIdPattern, memberIdPattern } from "../src/member.js";
import { groups as officialGroups, type Group } from "../src/members.js";

// @argentic/chest-sdk/members as the studio publishes it: 0.4.1's module —
// list, get, lookup, forget, groups.list, every type, the same values — and
// the studio's proposals: every group of the Chest (groups.all, members,
// of), matching addresses (matchEmails), when former members left
// (leftAt).
export * from "../src/members.js";

const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;

function checkId(id: unknown): string {
  if (typeof id !== "string" || !memberIdPattern.test(id)) throw new ChestError("invalid_id", 400, "invalid member identifier");
  return id;
}

function checkGroup(id: unknown): string {
  if (typeof id !== "string" || !groupIdPattern.test(id)) throw new ChestError("invalid_id", 400, "invalid group identifier");
  return id;
}

// ---- Every group of the Chest (Studio proposal) --------------------------------
//
// 0.4.1's groups.list() says only the groups that give the tool. A tool open
// to everyone — News, Polls, Wiki, Tasks, the usual case — has none, so it
// cannot offer "post to the Sales team" or "ask only Tech". With
// "groups": "read" in chest.proposals.json (approved: “Sees your Chest's
// groups and who is in them”), all() says every group of the Chest,
// members(id) who is in one (among the members who have the tool: a member
// without access stays unknown) and of(id) every group a member is in.
// member(request).groups and members.* keep 0.4.1's meaning — the groups
// that give the tool, 16 at most — whatever "groups" says: a tool that asks
// "is this member in Sales?" of a group that does not give it asks of(id).
// With "receives": ["group.*"] (chest.proposals.json), the Chest tells the
// tool when a group is renamed, changes members or is deleted (events).
// Errors: CapabilityNotGranted (403: not declared or not approved),
// RateLimited (shared with members: 600 calls a minute), Unavailable.

// A group of the Chest as a tool with "groups": "read" sees it: its
// identifier, its name, and how many of its members have the tool.
export type ChestGroup = { id: string; name: string; size: number };
// A page of a group's members: the identifiers of those who have the tool.
export type GroupMembers = { members: string[]; next: string | null };

export const groups: {
  list(): Promise<Group[]>;
  all(): Promise<ChestGroup[]>;
  members(id: string, options?: { after?: string; limit?: number }): Promise<GroupMembers | null>;
  of(id: string): Promise<string[] | null>;
} = {
  // 0.4.1's: the groups that give the tool, with their members.
  list: officialGroups.list,
  // all is every group of the Chest (500 at most), by name: its id, its
  // name and how many of its members have the tool.
  async all(): Promise<ChestGroup[]> {
    const response = await ask("groups", "GET", "/groups/all");
    if (response.status !== 200) throw await refusal(response, "groups");
    const answer = (await json(response)) as { groups?: unknown } | null;
    if (!answer || !Array.isArray(answer.groups) || answer.groups.length > 500) throw new Unavailable();
    return answer.groups.map(value => {
      const g = value as { id?: unknown; name?: unknown; size?: unknown } | null;
      if (!g || typeof g.id !== "string" || !groupIdPattern.test(g.id) || !text(g.name, 256) || typeof g.size !== "number" || !Number.isInteger(g.size) || g.size < 0) throw new Unavailable();
      return { id: g.id, name: g.name, size: g.size };
    });
  },
  // members says who is in a group, among the members who have the tool,
  // limit at a time (500 by default, 1,000 at most), by identifier; null
  // for a group the Chest does not have (never was, or deleted).
  async members(id: string, options: { after?: string; limit?: number } = {}): Promise<GroupMembers | null> {
    checkGroup(id);
    const query = new URLSearchParams();
    if (options.after !== undefined) query.set("after", checkId(options.after));
    if (options.limit !== undefined) {
      if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 1000) throw new ChestError("invalid_query", 400, "limit is 1 to 1000");
      query.set("limit", String(options.limit));
    }
    const response = await ask("groups", "GET", `/groups/${id}/members` + (query.size ? "?" + query.toString() : ""));
    if (response.status === 404) {
      const code = ((await json(response).catch(() => null)) as { error?: unknown } | null)?.error;
      if (code === "group_not_found") return null;
      throw new Unavailable();
    }
    if (response.status !== 200) throw await refusal(response, "groups");
    const answer = (await json(response)) as { members?: unknown; next?: unknown } | null;
    if (!answer || !Array.isArray(answer.members) || answer.members.length > 1000 || !answer.members.every(m => typeof m === "string" && memberIdPattern.test(m)) || !(answer.next === null || (typeof answer.next === "string" && memberIdPattern.test(answer.next)))) throw new Unavailable();
    return { members: [...answer.members] as string[], next: answer.next };
  },
  // of says every group of the Chest a member who has the tool is in (64 at
  // most), by identifier — those that give the tool and the others; null for
  // a member the tool does not have (never was, left, or without access).
  async of(id: string): Promise<string[] | null> {
    checkId(id);
    const response = await ask("groups", "GET", `/groups/of/${id}`);
    if (response.status === 404) {
      const code = ((await json(response).catch(() => null)) as { error?: unknown } | null)?.error;
      if (code === "member_not_found") return null;
      throw new Unavailable();
    }
    if (response.status !== 200) throw await refusal(response, "groups");
    const answer = (await json(response)) as { groups?: unknown } | null;
    if (!answer || !Array.isArray(answer.groups) || answer.groups.length > 64 || !answer.groups.every(g => typeof g === "string" && groupIdPattern.test(g))) throw new Unavailable();
    return [...answer.groups] as string[];
  },
};

// ---- Matching email addresses (Studio proposal, studio.15) ---------------------
//
// A tool that holds addresses from elsewhere — Intune's devices (their
// user's sign-in address), an imported spreadsheet, a calendar — needs to
// know which member each one is, without reading every member's address
// (members.email is a permission of its own, for good reason). The Chest
// matches: the tool sends addresses it already has and learns, for those
// of members who have the tool, their member id — nothing else. An address
// of nobody, of a former member or of a member without the tool is simply
// not in the answer: the three are indistinguishable, so the answer never
// says whether an address exists in the Chest outside a match. No
// capability beyond "members".
//
//   const ids = await members.matchEmails(devices.map(d => d.user));
//   for (const d of devices) d.member = ids[d.user] ?? null;
//
// Matching is on the whole address, whatever its case, after trimming
// spaces; the member's sign-in address only (no alias). Bounds: 200
// addresses a call (the SDK sends any number, 200 at a time), counted in
// the 600 calls a minute of members (RateLimited), and 5,000 distinct
// addresses a day per tool (QuotaExceeded: a tool cannot walk a directory
// of guesses; the same address again the same day is free). The Chest
// journals each call (count, not the addresses). What is not an address
// is never sent, and never matches.
export const matchLimits = { perCall: 200, perDay: 5000 } as const;
const looseAddress = /^[^\s@]{1,64}@[^\s@]{1,253}$/u;

// matchEmails says which of these addresses are members who have the tool:
// each address as given → its member id; the others are left out.
export async function matchEmails(emails: Iterable<string>): Promise<Record<string, string>> {
  const asked = new Map<string, string[]>();
  for (const given of emails) {
    if (typeof given !== "string") throw new ChestError("invalid_query", 400, "emails are strings");
    const address = given.trim().toLowerCase();
    if (address.length > 254 || !looseAddress.test(address)) continue;
    asked.set(address, [...(asked.get(address) ?? []), given]);
  }
  const wanted = [...asked.keys()];
  const found: Record<string, string> = {};
  for (let i = 0; i < wanted.length; i += matchLimits.perCall) {
    const batch = wanted.slice(i, i + matchLimits.perCall);
    const response = await ask("members", "POST", "/members/match", { body: JSON.stringify({ emails: batch }), type: "application/json" });
    if (response.status !== 200) throw await refusal(response, "members");
    const answer = (await json(response)) as { matches?: unknown } | null;
    if (!answer || !Array.isArray(answer.matches) || answer.matches.length > batch.length) throw new Unavailable();
    const sent = new Set(batch);
    for (const value of answer.matches) {
      const m = value as { email?: unknown; id?: unknown } | null;
      if (!m || typeof m.email !== "string" || !sent.has(m.email) || typeof m.id !== "string" || !memberIdPattern.test(m.id)) throw new Unavailable();
      for (const given of asked.get(m.email)!) found[given] = m.id;
    }
  }
  return found;
}

// ---- When former members left (Studio proposal, studio.15) ---------------------
//
// 0.4.1's lookup says who left ("former", with the name they had, or
// "erased") but not when. A final pay, a last day on a receipt, "Camille
// Martin (left on 30 Sept.)" need the date. leftAt asks it, for
// identifiers lookup answered former or erased (the date names nobody: it
// is kept after an erasure too). The answer has an entry for each of them
// whose departure the Chest knows; nothing for a member who has the tool,
// one without access (still in the Chest), or an identifier the tool does
// not know. Any number of identifiers: 200 a call. Errors as lookup's.
//
//   const left = await members.leftAt(found.former.map(f => f.id));
//   left.get("mbr_…");                         // "2026-09-30T16:00:00.000Z"
//
// Asked of the Chest as POST /members/left {ids} → {left: [{id, left_at}]}.
// It belongs in lookup's former entries (a field left_at, FormerMember
// .leftAt), which the studio cannot add without changing 0.4.1's lookup:
// it is a call of its own until the Chest's members API carries it.
export async function leftAt(ids: Iterable<string>): Promise<Map<string, string>> {
  const wanted = [...new Set([...ids].map(checkId))];
  const left = new Map<string, string>();
  for (let i = 0; i < wanted.length; i += 200) {
    const batch = wanted.slice(i, i + 200);
    const response = await ask("members", "POST", "/members/left", { body: JSON.stringify({ ids: batch }), type: "application/json" });
    if (response.status !== 200) throw await refusal(response, "members");
    const answer = (await json(response)) as { left?: unknown } | null;
    if (!answer || !Array.isArray(answer.left) || answer.left.length > batch.length) throw new Unavailable();
    const sent = new Set(batch);
    for (const value of answer.left) {
      const l = value as { id?: unknown; left_at?: unknown } | null;
      if (!l || typeof l.id !== "string" || !sent.has(l.id) || typeof l.left_at !== "string" || l.left_at.length > 40 || Number.isNaN(Date.parse(l.left_at))) throw new Unavailable();
      left.set(l.id, new Date(l.left_at).toISOString());
    }
  }
  return left;
}
