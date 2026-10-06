import { ask, json, refusal } from "../src/api.js";
import { ChestError, Unavailable } from "../src/errors.js";
import { groupIdPattern, languagePattern, memberIdPattern, timeZonePattern, type Member } from "../src/member.js";
import { forget as officialForget, type FormerMember, type Group, type Lookup, type MemberPage } from "../src/members.js";

// @argentic/chest-sdk/members as the studio publishes it: 0.4.1's module —
// every type and name, the same values but list, get, lookup, forget and
// groups, which read the Chest's answers without a count of groups (below)
// — and the studio's proposals: every group of the Chest (the capability
// "members.groups", groups.all), matching addresses (matchEmails), when
// former members left (leftAt).
export * from "../src/members.js";

const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;

function checkId(id: unknown): string {
  if (typeof id !== "string" || !memberIdPattern.test(id)) throw new ChestError("invalid_id", 400, "invalid member identifier");
  return id;
}

// ---- Members in any number of groups (studio.7; announced for 0.5) ----------
//
// 0.4.1's members API reader refuses (Unavailable) an answer in which a
// member is in more than 16 groups, groups.list() more than 16 groups, or a
// group more than 128 members — so with "members.groups" (every group a
// member is in) one member in 17 groups made members.list, get and lookup
// fail for the whole tool, and a group of 129 people made groups.list()
// fail. The contract caps none of them, and 0.5 announces no fixed cap. So
// list, get, lookup and groups.list are 0.4.1's — the same routes, query,
// checks of every field, 500 members a page, lookup 200 identifiers a call
// and its minute of cache — reading any number of groups and of members of
// a group. What bounds them is the size of an answer, as for every call of
// the SDK: 4 MiB (about 130,000 identifiers in groups.list()). As
// member(request), for every tool (the process does not know whether it
// holds "members.groups"): every answer 0.4.1 reads, these read the same.

const maxLimit = 500;
const lookupBatch = 200;
const cacheTime = 60_000;
const cacheSize = 5000;

// shown reads a member as the Chest answers it (0.4.1's, any number of
// groups); anything else is not the Chest's answer.
function shown(value: unknown): Member {
  const m = value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  if (!m || typeof m["id"] !== "string" || !memberIdPattern.test(m["id"]) || !text(m["first_name"], 256) || !text(m["last_name"], 256) || !text(m["name"], 520) || !(m["photo"] === null || text(m["photo"], 200)) || !(m["role"] === null || text(m["role"], 48)) || typeof m["admin"] !== "boolean" || typeof m["builder"] !== "boolean" || !Array.isArray(m["groups"]) || !m["groups"].every(g => typeof g === "string" && groupIdPattern.test(g)) || typeof m["language"] !== "string" || !languagePattern.test(m["language"]) || typeof m["time_zone"] !== "string" || !timeZonePattern.test(m["time_zone"]) || !(m["email"] === undefined || text(m["email"], 254))) throw new Unavailable();
  return { id: m["id"], firstName: m["first_name"], lastName: m["last_name"], name: m["name"], photo: m["photo"], role: m["role"], isAdmin: m["admin"], isBuilder: m["builder"], groups: [...m["groups"]] as string[], language: m["language"], timeZone: m["time_zone"], ...(m["email"] === undefined ? {} : { email: m["email"] }) };
}

// list says the members who have the tool, by name then identifier, limit
// at a time (100 by default, 500 at most), after the cursor of the previous
// page; q, role and group as 0.4.1's (group: with "members.groups", any
// group of the Chest).
export async function list(options: { after?: string; limit?: number; q?: string; role?: string; group?: string } = {}): Promise<MemberPage> {
  const query = new URLSearchParams();
  if (options.after !== undefined) query.set("after", options.after);
  if (options.limit !== undefined) {
    if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > maxLimit) throw new ChestError("invalid_query", 400, "limit is 1 to 500");
    query.set("limit", String(options.limit));
  }
  if (options.q !== undefined && options.q !== "") query.set("q", options.q);
  if (options.role !== undefined) query.set("role", options.role);
  if (options.group !== undefined) {
    if (!groupIdPattern.test(options.group)) throw new ChestError("invalid_query", 400, "invalid group identifier");
    query.set("group", options.group);
  }
  const response = await ask("members", "GET", "/members" + (query.size ? "?" + query.toString() : ""));
  if (response.status !== 200) throw await refusal(response, "members");
  const page = (await json(response)) as { members?: unknown; next?: unknown } | null;
  if (!page || !Array.isArray(page.members) || page.members.length > maxLimit || !(page.next === null || text(page.next, 1024))) throw new Unavailable();
  return { members: page.members.map(shown), next: page.next };
}

// get is the member of that identifier, or null when they do not have the
// tool (lookup names a former one or one without access).
export async function get(id: string): Promise<Member | null> {
  const response = await ask("members", "GET", "/members/" + checkId(id));
  if (response.status === 404) {
    await response.body?.cancel();
    return null;
  }
  if (response.status !== 200) throw await refusal(response, "members");
  return shown(await json(response));
}

// What lookup keeps in this process, as 0.4.1's: each identifier's answer
// for a minute, 5000 at most, the oldest forgotten first — and nothing once
// an event of the members' lifecycle or of a group comes (events.handle).
type Known = { at: number } & ({ member: Member } | { former: FormerMember } | { unknown: true });
const known = new Map<string, Known>();

// forget empties what lookup keeps (and 0.4.1's own lookup's): the next
// lookup asks the Chest again.
export function forget(): void {
  known.clear();
  officialForget();
}

function keep(id: string, answer: Omit<Known, "at">): void {
  known.delete(id);
  known.set(id, { ...answer, at: Date.now() } as Known);
  while (known.size > cacheSize) known.delete(known.keys().next().value as string);
}

// lookup resolves identifiers, each once, in the order given: the members
// who have the tool, those it had who no longer have it, and the identifiers
// it does not know. Any number: 200 a call, each answer kept a minute.
export async function lookup(ids: Iterable<string>): Promise<Lookup> {
  const wanted = [...new Set([...ids].map(checkId))];
  const now = Date.now();
  const missing = wanted.filter(id => {
    const k = known.get(id);
    return !k || now - k.at >= cacheTime;
  });
  for (let i = 0; i < missing.length; i += lookupBatch) {
    const batch = missing.slice(i, i + lookupBatch);
    const response = await ask("members", "POST", "/members/lookup", { body: JSON.stringify({ ids: batch }), type: "application/json" });
    if (response.status !== 200) throw await refusal(response, "members");
    const answer = (await json(response)) as { members?: unknown; former?: unknown; unknown?: unknown } | null;
    if (!answer || !Array.isArray(answer.members) || !Array.isArray(answer.former) || !Array.isArray(answer.unknown)) throw new Unavailable();
    const told = new Set<string>();
    for (const m of answer.members.map(shown)) {
      keep(m.id, { member: m });
      told.add(m.id);
    }
    for (const value of answer.former) {
      const f = value as { id?: unknown; name?: unknown; status?: unknown } | null;
      if (!f || typeof f.id !== "string" || !memberIdPattern.test(f.id) || !(f.status === "former" ? f.name === undefined || text(f.name, 520) : f.status === "no_access" ? text(f.name, 520) : f.status === "erased" && f.name === undefined)) throw new Unavailable();
      keep(f.id, { former: { id: f.id, name: (f.name as string | undefined) ?? null, status: f.status as FormerMember["status"] } });
      told.add(f.id);
    }
    for (const id of answer.unknown) {
      if (typeof id !== "string" || !memberIdPattern.test(id)) throw new Unavailable();
      keep(id, { unknown: true });
      told.add(id);
    }
    if (batch.some(id => !told.has(id))) throw new Unavailable();
  }
  const result: Lookup = { members: [], former: [], unknown: [] };
  for (const id of wanted) {
    const k = known.get(id);
    if (k && "member" in k) result.members.push(k.member);
    else if (k && "former" in k) result.former.push(k.former);
    else result.unknown.push(id);
  }
  return result;
}

// 0.4.1's groups.list(), any number of groups and of members: the groups
// that give the tool, each with the identifiers of its members.
async function listGroups(): Promise<Group[]> {
  const response = await ask("members", "GET", "/groups");
  if (response.status !== 200) throw await refusal(response, "members");
  const answer = (await json(response)) as { groups?: unknown } | null;
  if (!answer || !Array.isArray(answer.groups)) throw new Unavailable();
  return answer.groups.map(value => {
    const g = value as { id?: unknown; name?: unknown; members?: unknown } | null;
    if (!g || typeof g.id !== "string" || !groupIdPattern.test(g.id) || !text(g.name, 256) || !Array.isArray(g.members) || !g.members.every(m => typeof m === "string" && memberIdPattern.test(m))) throw new Unavailable();
    return { id: g.id, name: g.name, members: [...g.members] as string[] };
  });
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
// limit — the studio's member() and members.* read any number of them
// (above; 0.4.1's parsers refused 16 groups a member and 128 members a
// group). Errors:
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
  // 0.4.1's: the groups that give the tool, with their members (any
  // number of either, above).
  list: listGroups,
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
