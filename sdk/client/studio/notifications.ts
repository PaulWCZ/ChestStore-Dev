import { ask, json, refusal } from "../src/api.js";
import { ChestError, Unavailable } from "../src/errors.js";
import { memberIdPattern } from "../src/member.js";
import { locales, type Locale } from "./member.js";

// @argentic/chest-sdk/notifications as the studio publishes it: 0.4.1's
// module — notify, withdraw, badge, every type, the same values — and the
// studio's broadcast.
export * from "../src/notifications.js";

// ---- broadcast: everyone, each in their language (Studio proposal) ------------
//
// One item for everyone who has the tool (or those of some roles or
// groups), each in their language, in one call. The Chest resolves the
// members, picks each one's message by their language (member.language;
// English when the tool wrote none in it), and delivers in the background.
// Before: a tool listed its members page by page, grouped them by language,
// and hit the 1,000 recipients an hour after a thousand people (News,
// Polls, Status).
//
//   await notifications.broadcast({
//     messages: { en: { title: "Please read: we move on 2 November" }, fr: { title: "À lire : nous déménageons le 2 novembre" } },
//     path: "/chest/posts/4", key: "post:4",
//   });
//
// Quota: 30 broadcasts an hour per tool, not counted in the recipients an
// hour; each member still gets at most 100 items a day (a member at their
// limit is skipped). to: roles and groups (either matches); none: everyone
// with the tool; except: up to 500 members left out (the author, those who
// already answered). Answers how many members were told. The same bounds
// and words as notify: a title of 1 to 80 characters, a body of 280, a path
// under /chest, a key of 1 to 64 of a-z 0-9 . _ : -.
export type Message = { title: string; body?: string };
export type Broadcast = { messages: { en: Message } & Partial<Record<Locale, Message>>; path?: string; key?: string; to?: { roles?: string[]; groups?: string[] }; except?: string[] };

// 0.4.1's bounds of a notification (src/notifications.ts), and a role's and
// a group's grammars (chest.json "roles", member.ts).
const maxMembers = 500, maxTitle = 80, maxBody = 280, maxPath = 512;
const keyPattern = /^[a-z0-9._:-]{1,64}$/u;
const removed = /[\p{Cc}؜‎‏‪-‮⁦-⁩]/gu;
const rolePattern = /^[a-z][a-z0-9-]{0,47}$/u, groupPattern = /^grp_[a-z2-7]{26}$/u;
const length = (s: string): number => [...s].length;

function checkMessage(m: unknown): Message {
  const o = m !== null && typeof m === "object" && !Array.isArray(m) ? (m as Record<string, unknown>) : null;
  const title = o?.["title"], body = o?.["body"];
  if (!o || Object.keys(o).some(k => k !== "title" && k !== "body")) throw new ChestError("invalid_body", 400, "a message is {title, body}");
  if (typeof title !== "string" || length(title) < 1 || length(title) > maxTitle || title.replace(removed, "").trim() === "") throw new ChestError("invalid_title", 400, "a title is 1 to 80 characters");
  if (body !== undefined && (typeof body !== "string" || length(body) > maxBody)) throw new ChestError("invalid_text", 400, "a body is 280 characters at most");
  return { title, ...(body ? { body: body as string } : {}) };
}
function checkPath(path: unknown): string {
  if (typeof path !== "string" || path.length > maxPath || !/^\/chest([/?#][\x21-\x5b\x5d-\x7e]*)?$/u.test(path) || path.includes("//") || path.split(/[?#]/u)[0]!.split("/").some(s => /^(\.|%2e){1,2}$/iu.test(s))) throw new ChestError("invalid_path", 400, "a path is /chest or under it");
  return path;
}

export async function broadcast(b: Broadcast): Promise<{ delivered: number }> {
  const given = b?.messages as Record<string, unknown> | undefined;
  if (!given || typeof given !== "object" || !("en" in given) || Object.keys(given).some(k => !(locales as readonly string[]).includes(k))) throw new ChestError("invalid_body", 400, "messages: en, and other languages of the Chest");
  const messages = Object.fromEntries(Object.entries(given).map(([k, m]) => [k, checkMessage(m)]));
  const roles = b.to?.roles, groups = b.to?.groups;
  if (roles !== undefined && (!Array.isArray(roles) || roles.length > 16 || !roles.every(r => typeof r === "string" && rolePattern.test(r)))) throw new ChestError("invalid_body", 400, "roles: up to 16 role identifiers");
  if (groups !== undefined && (!Array.isArray(groups) || groups.length > 64 || !groups.every(g => typeof g === "string" && groupPattern.test(g)))) throw new ChestError("invalid_body", 400, "groups: up to 64 group identifiers");
  if (b.except !== undefined && (!Array.isArray(b.except) || b.except.length > maxMembers)) throw new ChestError("invalid_body", 400, "except: up to 500 member identifiers");
  const except = b.except?.map(id => {
    if (typeof id !== "string" || !memberIdPattern.test(id)) throw new ChestError("invalid_id", 400, "invalid member identifier");
    return id;
  });
  if (b.key !== undefined && (typeof b.key !== "string" || !keyPattern.test(b.key))) throw new ChestError("invalid_key", 400, "a key is 1 to 64 of a-z 0-9 . _ : -");
  const command = { messages, ...(except && except.length > 0 ? { except } : {}), ...(b.path !== undefined ? { path: checkPath(b.path) } : {}), ...(b.key !== undefined ? { key: b.key } : {}), ...(roles || groups ? { to: { ...(roles ? { roles } : {}), ...(groups ? { groups } : {}) } } : {}) };
  const response = await ask("notifications", "POST", "/notifications/broadcast", { body: JSON.stringify(command), type: "application/json" });
  if (response.status !== 200) {
    if (response.status < 400) {
      await response.body?.cancel();
      throw new Unavailable();
    }
    throw await refusal(response, "notifications");
  }
  const answer = (await json(response)) as { delivered?: unknown } | null;
  if (!answer || typeof answer.delivered !== "number" || !Number.isInteger(answer.delivered) || answer.delivered < 0) throw new Unavailable();
  return { delivered: answer.delivered };
}
