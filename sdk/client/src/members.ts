import { ask, json, refusal } from "./api.js";
import { ChestError, Unavailable } from "./errors.js";
import { groupIdPattern, languagePattern, mailPreferenceOf, memberIdPattern, timeZonePattern, type Member } from "./member.js";

// Who has the tool, for a server tool whose chest.json declares
// "capabilities": ["members"] (and "members.email" for their addresses):
// exactly the members who have access to it at the time of the call — by a
// grant, a group, open to all, or because they run it. A member without
// access is indistinguishable from an identifier that does not exist.
//
//   import * as members from "@argentic/chest-sdk/members";
//   const { members: page, next } = await members.list({ q: "cam" });
//   const one = await members.get("mbr_…");            // null: no such member here
//   const { members: found, former, unknown } = await members.lookup(ids);
//   const all = await members.groups.list();          // groups that give the tool
//
// Store member identifiers in your data, never names or addresses: resolve
// them when rendering, with lookup. Errors: CapabilityNotGranted (403),
// RateLimited (429, 600 calls a minute), Unavailable (503, or the Chest not
// reached), ChestError otherwise (invalid_id, invalid_query 400).

// A page of the list, and the cursor of the next one (null after the last).
export type MemberPage = { members: Member[]; next: string | null };
// A member who left the Chest after having the tool: "former" with the name
// they had, or "erased" without any once the owner had their data erased —
// render “Former member”. leftAt (Proposal (studio.15)) is when they left
// the Chest, an ISO 8601 instant, only when the Chest says it (0.3.0 does
// not): a final pay, a last day on a receipt — "Camille Martin (left on 30
// Sept.)". Kept after an erasure too: a date alone names nobody.
export type FormerMember = { id: string; name: string | null; status: "former" | "erased"; leftAt?: string };
// What a lookup found: members who have the tool, former members, and
// identifiers the tool does not know.
export type Lookup = { members: Member[]; former: FormerMember[]; unknown: string[] };
// A group that gives the tool, with the identifiers of its members.
export type Group = { id: string; name: string; members: string[] };

const maxLimit = 500;
const lookupBatch = 200;
const cacheTime = 60_000;
const cacheSize = 5000;

function checkId(id: unknown): string {
  if (typeof id !== "string" || !memberIdPattern.test(id)) throw new ChestError("invalid_id", 400, "invalid member identifier");
  return id;
}

const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;

// shown reads a member as the Chest answers it; anything else is not the
// Chest's answer.
function shown(value: unknown): Member {
  const m = value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  if (!m || typeof m["id"] !== "string" || !memberIdPattern.test(m["id"]) || !text(m["first_name"], 256) || !text(m["last_name"], 256) || !text(m["name"], 520) || !(m["photo"] === null || text(m["photo"], 200)) || !(m["role"] === null || text(m["role"], 48)) || typeof m["admin"] !== "boolean" || typeof m["builder"] !== "boolean" || !Array.isArray(m["groups"]) || m["groups"].length > 16 || !m["groups"].every(g => typeof g === "string" && groupIdPattern.test(g)) || typeof m["language"] !== "string" || !languagePattern.test(m["language"]) || typeof m["time_zone"] !== "string" || !timeZonePattern.test(m["time_zone"]) || !(m["email"] === undefined || text(m["email"], 254))) throw new Unavailable();
  return { id: m["id"], firstName: m["first_name"], lastName: m["last_name"], name: m["name"], photo: m["photo"], role: m["role"], isAdmin: m["admin"], isBuilder: m["builder"], groups: [...m["groups"]] as string[], language: m["language"], timeZone: m["time_zone"], ...(m["email"] === undefined ? {} : { email: m["email"] }), ...(mailPreferenceOf(m["mail_pref"]) ? { mailPreference: mailPreferenceOf(m["mail_pref"])! } : {}) };
}

// list says the members who have the tool, by name then identifier, limit
// at a time (100 by default, 500 at most), after the cursor of the previous
// page. q finds the start of a first name, a last name or a name (and of an
// address with members.email), whatever its case and accents; role and group
// keep the members of that role, or of that group.
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

// get is the member of that identifier, or null when the tool does not know
// them: never a member, a former one, or one without access.
export async function get(id: string): Promise<Member | null> {
  const response = await ask("members", "GET", "/members/" + checkId(id));
  if (response.status === 404) {
    await response.body?.cancel();
    return null;
  }
  if (response.status !== 200) throw await refusal(response, "members");
  return shown(await json(response));
}

// What lookup keeps in this process: each identifier's answer for a minute,
// 5000 of them at most, the oldest forgotten first — and nothing once an
// event of the members' lifecycle comes (events.handle).
type Known = { at: number } & ({ member: Member } | { former: FormerMember } | { unknown: true });
const known = new Map<string, Known>();

// forget empties what lookup keeps: the next lookup asks the Chest again.
export function forget(): void {
  known.clear();
}

function keep(id: string, answer: Omit<Known, "at">): void {
  known.delete(id);
  known.set(id, { ...answer, at: Date.now() } as Known);
  while (known.size > cacheSize) known.delete(known.keys().next().value as string);
}

// lookup resolves identifiers, each once, in the order given: the members
// who have the tool, the former members who had it, and the identifiers it
// does not know. Any number of them: the SDK asks 200 at a time, and keeps
// each answer a minute.
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
      const f = value as { id?: unknown; name?: unknown; status?: unknown; left_at?: unknown } | null;
      if (!f || typeof f.id !== "string" || !memberIdPattern.test(f.id) || !(f.status === "former" ? f.name === undefined || text(f.name, 520) : f.status === "erased" && f.name === undefined)) throw new Unavailable();
      // Proposal (studio.15): when they left, only when the Chest says it.
      if (!(f.left_at === undefined || f.left_at === null || (typeof f.left_at === "string" && f.left_at.length <= 40 && !Number.isNaN(Date.parse(f.left_at))))) throw new Unavailable();
      keep(f.id, { former: { id: f.id, name: (f.name as string | undefined) ?? null, status: f.status as FormerMember["status"], ...(typeof f.left_at === "string" ? { leftAt: new Date(f.left_at).toISOString() } : {}) } });
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

// ---- Studio proposals (not in 0.3.0) ---------------------------------------

// ---- Matching email addresses (Proposal (studio.15)) -----------------------
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

// A group of the Chest as a tool with "groups": "read" sees it: its
// identifier, its name, and how many of its members have the tool
// (Proposal (studio)).
export type ChestGroup = { id: string; name: string; size: number };
// A page of a group's members: the identifiers of those who have the tool.
export type GroupMembers = { members: string[]; next: string | null };

function checkGroup(id: unknown): string {
  if (typeof id !== "string" || !groupIdPattern.test(id)) throw new ChestError("invalid_id", 400, "invalid group identifier");
  return id;
}

// groups are the groups of the Chest that give the tool, each with the
// identifiers of its members; nothing of the others.
//
// Proposal (studio) — the "groups" capability. A tool open to everyone
// (News, Polls, Wiki) has no group that gives it, so list() is empty and
// it cannot offer "the Sales team". With "groups": "read" in chest.json
// (approved: “Sees your Chest's groups and who is in them”), all() says
// every group of the Chest and members(id) who is in one (among the members
// who have the tool: a member without access stays unknown); the Chest may
// then put a member's other groups in member(request).groups and members.*
// too, within the 16 that 0.3.0 reads — members(id) is the complete answer.
// With "receives": ["group.*"], the Chest tells the tool when a group is
// renamed, changes members or is deleted (events.ts). Errors:
// CapabilityNotGranted (403: not declared or not approved), RateLimited,
// Unavailable.
export const groups = {
  async list(): Promise<Group[]> {
    const response = await ask("members", "GET", "/groups");
    if (response.status !== 200) throw await refusal(response, "members");
    const answer = (await json(response)) as { groups?: unknown } | null;
    if (!answer || !Array.isArray(answer.groups) || answer.groups.length > 16) throw new Unavailable();
    return answer.groups.map(value => {
      const g = value as { id?: unknown; name?: unknown; members?: unknown } | null;
      if (!g || typeof g.id !== "string" || !groupIdPattern.test(g.id) || !text(g.name, 256) || !Array.isArray(g.members) || g.members.length > 128 || !g.members.every(m => typeof m === "string" && memberIdPattern.test(m))) throw new Unavailable();
      return { id: g.id, name: g.name, members: [...g.members] as string[] };
    });
  },
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
};
