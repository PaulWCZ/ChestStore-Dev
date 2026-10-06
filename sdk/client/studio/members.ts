import { ask, json, refusal } from "../src/api.js";
import { ChestError, Unavailable } from "../src/errors.js";
import { groupIdPattern, memberIdPattern } from "../src/member.js";
import { groups as officialGroups, type Group } from "../src/members.js";

// @argentic/chest-sdk/members as the studio publishes it: 0.4.1's module —
// list, get, lookup, forget, groups.list, every type, the same values — and
// the studio's proposals: every group of the Chest (the capability
// "members.groups", groups.all), matching addresses (matchEmails), when
// former members left (leftAt).
export * from "../src/members.js";

const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;

function checkId(id: unknown): string {
  if (typeof id !== "string" || !memberIdPattern.test(id)) throw new ChestError("invalid_id", 400, "invalid member identifier");
  return id;
}

// ---- Every group of the Chest (Studio proposal, announced for 0.5) -------------
//
// 0.4.1's groups.list() says only the groups that give the tool. A tool open
// to everyone — News, Polls, Wiki, Tasks, the usual case — has none, so it
// cannot offer "post to the Sales team" or "ask only Tech". The capability
// "members.groups" (the name announced for the official 0.5; until then in
// chest.proposals.json: "capabilities": ["members.groups"], approved:
// “Sees your Chest's groups and who is in them”) widens what the tool
// sees, with 0.4.1's own names:
// - member(request).groups and members.get/list/lookup's groups: every
//   group of the Chest the member is in (without it: the groups that give
//   the tool);
// - members.list({ group }): the members who have the tool in any group of
//   the Chest (without it: a group that gives the tool);
// - groups.all(): every group of the Chest, by name.
// With "receives": ["group.*"] (chest.proposals.json), the Chest tells the
// tool when a group is renamed, changes members or is deleted (events).
// No fixed cap on members or groups: the server's capacity is the only
// limit. (0.4.1's own parsers still refuse a member listed in more than 16
// groups and a groups.list() group of more than 128 members — official
// code the studio does not change; 0.5 lifts them.) Errors:
// CapabilityNotGranted (403: not declared or not approved), RateLimited
// (shared with members: 600 calls a minute), Unavailable.
//
// Until 0.4.1-studio.5 the proposal was "groups": "read" with
// groups.members(id) (now members.list({group})) and groups.of(id) (now
// member.groups, or members.get(id)'s groups).

// A group of the Chest as a tool with "members.groups" sees it: its
// identifier, its name, and how many of its members have the tool.
export type ChestGroup = { id: string; name: string; size: number };

export const groups: {
  list(): Promise<Group[]>;
  all(): Promise<ChestGroup[]>;
} = {
  // 0.4.1's: the groups that give the tool, with their members.
  list: officialGroups.list,
  // all is every group of the Chest, by name: its id, its name and how
  // many of its members have the tool.
  async all(): Promise<ChestGroup[]> {
    const response = await ask("members.groups", "GET", "/groups/all");
    if (response.status !== 200) throw await refusal(response, "members.groups");
    const answer = (await json(response)) as { groups?: unknown } | null;
    if (!answer || !Array.isArray(answer.groups)) throw new Unavailable();
    return answer.groups.map(value => {
      const g = value as { id?: unknown; name?: unknown; size?: unknown } | null;
      if (!g || typeof g.id !== "string" || !groupIdPattern.test(g.id) || !text(g.name, 256) || typeof g.size !== "number" || !Number.isInteger(g.size) || g.size < 0) throw new Unavailable();
      return { id: g.id, name: g.name, size: g.size };
    });
  },
};

// ---- Matching email addresses (Studio proposal, 0.3.0-studio.15) ---------------------
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

// ---- When former members left (Studio proposal, 0.3.0-studio.15) ---------------------
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
