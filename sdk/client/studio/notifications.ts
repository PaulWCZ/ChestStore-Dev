import { ask, json, refusal } from "../src/api.js";
import { ChestError, Unavailable } from "../src/errors.js";
import { groupIdPattern, memberIdPattern } from "../src/member.js";
import { notify as officialNotify, type Delivery, type Notice as OfficialNotice } from "../src/notifications.js";
import { locales, type Locale } from "./member.js";

// @argentic/chest-sdk/notifications as the studio publishes it: 0.4.1's
// module — withdraw, badge, every type, the same values — with two studio
// proposals (announced for the official 0.5): a notice's translations,
// which notify accepts, and broadcast.
//
// Notifications are how a tool tells a member (owner's decision, 6 October
// 2026): never a mail. The Chest itself mails members their notifications,
// by each member's choice (each one, once or twice a day, or off; off per
// tool) — a tool builds no digest, no reminder mail, no "email me"
// setting.
export * from "../src/notifications.js";

// ---- Translations on a notice (Studio proposal, announced for 0.5) ----------
//
// title and body are English: the fallback. translations gives the same
// words in the other languages the store speaks (fr today); the Chest shows
// each member their language (member.language), English when the tool
// wrote none in it. A tool no longer looks up each member's language to
// write a notice: one call, every member in their words.
//
//   await notifications.notify([assignee], {
//     title: "Camille assigned you “Order oak”", path: "/chest/tasks/42", key: "task:42:assigned",
//     translations: { fr: { title: "Camille vous a confié « Commander le chêne »" } },
//   });
//
// The same bounds per language as the English words: a title of 1 to 80
// characters, a body of 280 at most. A language left out shows the English.
export type Words = { title: string; body?: string };
export type Translations = Partial<Record<Exclude<Locale, "en">, Words>>;
export type Notice = OfficialNotice & { translations?: Translations };
export type { Delivery };

// 0.4.1's bounds of a notification (src/notifications.ts), and a role's
// grammar (chest.json "roles").
const maxMembers = 500, maxTitle = 80, maxBody = 280, maxPath = 512;
const keyPattern = /^[a-z0-9._:-]{1,64}$/u;
const removed = /[\p{Cc}؜‎‏‪-‮⁦-⁩]/gu;
const rolePattern = /^[a-z][a-z0-9-]{0,47}$/u;
const length = (s: string): number => [...s].length;
const translated = locales.filter(l => l !== "en") as readonly string[];

function checkTitle(title: unknown): string {
  if (typeof title !== "string" || length(title) < 1 || length(title) > maxTitle || title.replace(removed, "").trim() === "") throw new ChestError("invalid_title", 400, "a title is 1 to 80 characters");
  return title;
}
function checkBody(body: unknown): string | undefined {
  if (body !== undefined && (typeof body !== "string" || length(body) > maxBody)) throw new ChestError("invalid_text", 400, "a body is 280 characters at most");
  return body ? body as string : undefined;
}
function checkPath(path: unknown): string {
  if (typeof path !== "string" || path.length > maxPath || !/^\/chest([/?#][\x21-\x5b\x5d-\x7e]*)?$/u.test(path) || path.includes("//") || path.split(/[?#]/u)[0]!.split("/").some(s => /^(\.|%2e){1,2}$/iu.test(s))) throw new ChestError("invalid_path", 400, "a path is /chest or under it");
  return path;
}
function checkKey(key: unknown): string {
  if (typeof key !== "string" || !keyPattern.test(key)) throw new ChestError("invalid_key", 400, "a key is 1 to 64 of a-z 0-9 . _ : -");
  return key;
}
function checkId(id: unknown): string {
  if (typeof id !== "string" || !memberIdPattern.test(id)) throw new ChestError("invalid_id", 400, "invalid member identifier");
  return id;
}
const plain = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;

// checkTranslations reads {fr: {title, body?}}: languages the store speaks
// other than English, each with a title.
function checkTranslations(value: unknown): Translations {
  const given = plain(value);
  if (!given) throw new ChestError("invalid_body", 400, `translations is {${translated.join(", ")}: {title, body?}}`);
  const out: Record<string, Words> = {};
  for (const [language, words] of Object.entries(given)) {
    if (!translated.includes(language)) throw new ChestError("invalid_body", 400, `translations: ${translated.join(", ")} (English is the notice's own title and body)`);
    const w = plain(words);
    if (!w || Object.keys(w).some(k => k !== "title" && k !== "body")) throw new ChestError("invalid_body", 400, "a translation is {title, body?}");
    const title = checkTitle(w["title"]), body = checkBody(w["body"]);
    out[language] = { title, ...(body ? { body } : {}) };
  }
  return out as Translations;
}

// wire is a notice as the Chest receives it: its English words, its path
// and key, and its translations when there are any.
function wire(notice: Notice): Record<string, unknown> {
  const n = plain(notice);
  if (!n) throw new ChestError("invalid_body", 400, "a notice is {title, body?, path?, key?, translations?}");
  const title = checkTitle(n["title"]), body = checkBody(n["body"]);
  const translations = n["translations"] === undefined ? undefined : checkTranslations(n["translations"]);
  return {
    title, ...(body ? { body } : {}),
    ...(n["path"] !== undefined ? { path: checkPath(n["path"]) } : {}),
    ...(n["key"] !== undefined ? { key: checkKey(n["key"]) } : {}),
    ...(translations && Object.keys(translations).length > 0 ? { translations } : {}),
  };
}

// expect lets through the one answer expected (as 0.4.1's).
async function expect(response: Response, status: number): Promise<void> {
  if (response.status === status) return;
  if (response.status < 400) {
    await response.body?.cancel();
    throw new Unavailable();
  }
  throw await refusal(response, "notifications");
}

// notify is 0.4.1's (one item in the inbox of each member who has the
// tool, among 1 to 500 identifiers; a key replaces that member's item of
// the key), and takes a notice's translations. Without translations it is
// 0.4.1's notify itself, the same request.
export async function notify(memberIds: Iterable<string>, notice: Notice): Promise<Delivery> {
  if (notice === null || typeof notice !== "object" || notice.translations === undefined) return officialNotify(memberIds, notice);
  const members = [...memberIds];
  if (members.length < 1 || members.length > maxMembers) throw new ChestError("invalid_body", 400, "1 to 500 member identifiers");
  members.forEach(checkId);
  const response = await ask("notifications", "POST", "/notifications", { body: JSON.stringify({ members, ...wire(notice) }), type: "application/json" });
  await expect(response, 200);
  // The answer splits the identifiers asked, each once, in their order (as
  // 0.4.1 checks it).
  const answer = plain(await json(response));
  const delivered = answer?.["delivered"], skipped = answer?.["skipped"];
  if (!Array.isArray(delivered) || !Array.isArray(skipped) || ![...delivered, ...skipped].every(id => typeof id === "string")) throw new Unavailable();
  const wanted = [...new Set(members)];
  const inOrder = (l: string[]) => l.every((id, i) => wanted.indexOf(id) > (i === 0 ? -1 : wanted.indexOf(l[i - 1]!)));
  if (delivered.length + skipped.length !== wanted.length || !inOrder(delivered as string[]) || !inOrder(skipped as string[]) || delivered.some(id => skipped.includes(id))) throw new Unavailable();
  return { delivered: [...delivered] as string[], skipped: [...skipped] as string[] };
}

// ---- broadcast: everyone, each in their language (Studio proposal, announced for 0.5) ----
//
// One notice for everyone who has the tool — or those of some roles or
// groups — in one call. The Chest resolves the members, shows each one
// their language (the notice's translations), and delivers in the
// background. Before: a tool listed its members page by page and hit the
// 1,000 recipients an hour of notify after a thousand people (News,
// Polls, Status).
//
//   await notifications.broadcast(
//     { title: "Please read: we move on 2 November", path: "/chest/posts/4", key: "post:4",
//       translations: { fr: { title: "À lire : nous déménageons le 2 novembre" } } },
//     { to: { groups: ["grp_…"] }, except: [author] },
//   );
//
// to: roles (the tool's, chest.json "roles") and groups (grp_…: any group
// of the Chest the tool knows — those that give it, or every group with
// the capability "members.groups"; another group tells nobody); a member
// of any of them is told; to left out: everyone with the tool. A to that
// names neither roles nor groups (to: {}) is refused, never "everyone". except: members left out (the author, those who
// already answered). No fixed cap on members or groups — the server's
// capacity is the only limit; the request itself is bounded by its size
// (1 MiB: about 30,000 identifiers in except). Quota: 30 broadcasts an
// hour per tool, not counted in notify's recipients an hour; each member
// still gets at most 100 items a day (a member at their limit is skipped).
// Answers how many members were told. The same words as notify: a title
// of 1 to 80 characters, a body of 280, a path under /chest, a key of 1 to
// 64 of a-z 0-9 . _ : - (a later notice of the key replaces it; withdraw
// removes it). Errors: CapabilityNotGranted ("notifications"),
// QuotaExceeded, Unavailable, ChestError (invalid_title, invalid_text,
// invalid_path, invalid_key, invalid_id, invalid_body; not_found from a
// Chest without broadcast).
export type Audience = { to?: { roles?: string[]; groups?: string[] }; except?: Iterable<string> };
const noticeKeys = new Set(["title", "body", "path", "key", "translations"]);
const maxRequest = 1 << 20;

export async function broadcast(notice: Notice, audience: Audience = {}): Promise<{ delivered: number }> {
  const n = plain(notice);
  if (n && "messages" in n) throw new ChestError("invalid_body", 400, "broadcast(notice, {to, except}) replaced broadcast({messages, …}): English title and body, the other languages in translations");
  if (!n || Object.keys(n).some(k => !noticeKeys.has(k))) throw new ChestError("invalid_body", 400, "a notice is {title, body?, path?, key?, translations?}; to and except are broadcast's second argument");
  const a = plain(audience);
  if (!a || Object.keys(a).some(k => k !== "to" && k !== "except")) throw new ChestError("invalid_body", 400, "the audience is {to?: {roles?, groups?}, except?}");
  const to = a["to"] === undefined ? undefined : plain(a["to"]);
  if (a["to"] !== undefined && (!to || Object.keys(to).some(k => k !== "roles" && k !== "groups"))) throw new ChestError("invalid_body", 400, "to is {roles?, groups?}");
  const roles = to?.["roles"], groups = to?.["groups"];
  // to names someone: a to without roles and groups (to: {}, or a setting
  // left undefined) is refused, never read as "everyone" — leave to out
  // for everyone with the tool.
  if (to && roles === undefined && groups === undefined) throw new ChestError("invalid_body", 400, "to names roles or groups; leave to out to tell everyone with the tool");
  if (roles !== undefined && (!Array.isArray(roles) || !roles.every(r => typeof r === "string" && rolePattern.test(r)))) throw new ChestError("invalid_body", 400, "roles: role identifiers (chest.json roles)");
  if (groups !== undefined && (!Array.isArray(groups) || !groups.every(g => typeof g === "string" && groupIdPattern.test(g)))) throw new ChestError("invalid_body", 400, "groups: group identifiers (grp_…)");
  const given = a["except"];
  if (given !== undefined && (given === null || typeof given !== "object" || typeof (given as Iterable<unknown>)[Symbol.iterator] !== "function")) throw new ChestError("invalid_body", 400, "except: member identifiers");
  const except = given === undefined ? [] : [...new Set([...(given as Iterable<unknown>)].map(checkId))];
  const command = {
    ...wire(notice),
    ...(roles || groups ? { to: { ...(roles ? { roles: [...new Set(roles as string[])] } : {}), ...(groups ? { groups: [...new Set(groups as string[])] } : {}) } } : {}),
    ...(except.length > 0 ? { except } : {}),
  };
  const body = JSON.stringify(command);
  if (Buffer.byteLength(body) > maxRequest) throw new ChestError("invalid_body", 400, "the broadcast is larger than 1 MiB: leave fewer members out, or name a group");
  const response = await ask("notifications", "POST", "/notifications/broadcast", { body, type: "application/json" });
  await expect(response, 200);
  const answer = (await json(response)) as { delivered?: unknown } | null;
  if (!answer || typeof answer.delivered !== "number" || !Number.isInteger(answer.delivered) || answer.delivered < 0) throw new Unavailable();
  return { delivered: answer.delivered };
}
