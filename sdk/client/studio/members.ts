import { ask, json, refusal } from "../src/api.js";
import { ChestError, Unavailable } from "../src/errors.js";
import { memberIdPattern } from "../src/member.js";

// @argentic/chest-sdk/members as the studio publishes it (0.7.0-studio.N):
// 0.7.0's module — list, get, lookup, forget, groups.list, every type, the
// same values — and the studio's proposals: matching addresses
// (matchEmails) and when former members left (leftAt).
//
// What 0.7.0 now gives, the studio dropped: its own list, get, lookup and
// groups.list (studio.7, any number of groups: 0.7.0 caps none), the
// capability "members.groups" and groups.all() (0.7.0: "members.groups" in
// chest.json, groups.list({after, limit}) paged, each {id, name, size};
// members.list({group}) pages a group's members). A tool that wants every
// group reads page after page.
export * from "../src/members.js";

function checkId(id: unknown): string {
  if (typeof id !== "string" || !memberIdPattern.test(id)) throw new ChestError("invalid_id", 400, "invalid member identifier");
  return id;
}

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
// spaces; the member's sign-in address only (no alias). What is not an
// address is never sent, and never matches. The Chest journals each call
// (count, not the addresses).
//
// Bounds: 200 addresses a call (the SDK sends any number), in the 600
// calls a minute of members. No daily number (0.7.0-studio.2): new
// addresses at full speed up to ten a member of the Chest a day (1,000 at
// least), then one call with new ones a minute (RateLimited) — matching is
// an oracle, and a list of guesses must not reveal what members.email
// guards (README, "matchEmails").
export const matchLimits = { perCall: 200, perMemberPerDay: 10, minimumPerDay: 1000 } as const;
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
// 0.7.0's lookup says who left ("former", with the name they had, or
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
// .leftAt), which the studio cannot add without changing 0.7.0's lookup:
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
