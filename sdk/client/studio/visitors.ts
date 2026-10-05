import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { ask as chest, json, refusal } from "../src/api.js";
import { chest as theChest } from "../src/chest.js";
import { ChestError, Unavailable } from "../src/errors.js";
import { locales, localeOf, type Locale } from "./member.js";

// Studio proposal (not in 0.4.1): the anonymous visitors of a tool's public host — a
// contact form, a booking page, a job application, a status subscription.
// There is no captcha without a third party, so every public tool built the
// same guard; here it is once:
//
//   const token = visitors.formToken();                   // in the form, hidden
//   visitors.checkForm(data.get("started"))               // "ok" | "too_fast" | "invalid"
//   await visitors.count(request, "apply", { perVisitor: 5, perHour: 100 }) // { allowed, retryAfter }
//   visitors.language(request)                            // "fr": the switch's cookie, the browser's, the Chest's
//
// A form sent faster than a person types (or never shown) is refused by its
// token, signed with a key derived from the tool's CHEST_TOKEN. Counting is
// the Chest's: it counts across the tools of the Chest, so a robot that
// tries every tool meets one limit.
//
// The visitor's address. The Chest's front adds no X-Forwarded-For toward a
// tool: it removes every Chest-* header the client sent and sets only
// X-Forwarded-Proto and X-Forwarded-Host
// (reference/contract/application-contract.md, "Front", toward the tool),
// so an X-Forwarded-For a tool receives is whatever the visitor wrote — a
// robot changes it at every request and is a new visitor each time. The
// proposal: the front sets Chest-Visitor-Address, the address of the TCP
// connection it accepted (after its own trusted proxies), on requests of
// the public host; being a Chest-* header, the client cannot send it (the
// front removes those first). address() reads that header only; without it
// (a Chest that does not set it yet), it is null, visitor() is "unknown",
// and count() counts every such visitor together — the per-hour ceiling
// for everyone still holds, the per-visitor one becomes a global one.
export const addressHeader = "chest-visitor-address";

type Headers_ = Headers | { get(name: string): string | null };
// Headers themselves (anything with get(), like Next's headers()), or a
// Request's. Next's headers object has a field named "headers" of its own:
// get() is what tells them apart.
const headersOf = (r: Request | Headers_): Headers_ => (typeof (r as Headers_).get === "function" ? (r as Headers_) : (r as Request).headers);

function key(): Buffer {
  const token = process.env["CHEST_TOKEN"], tool = process.env["CHEST_TOOL"] ?? "";
  if (!token) throw new ChestError("no_token", 500, "CHEST_TOKEN is not set");
  return createHmac("sha256", Buffer.from(token, "utf8")).update("studio visitors form token 1 " + tool).digest();
}
const sign = (value: string) => createHmac("sha256", key()).update(value).digest("base64url");

// formToken is the time the form was shown, signed: "<ms>.<signature>".
export function formToken(now: number = Date.now()): string {
  const value = String(Math.floor(now));
  return `${value}.${sign(value)}`;
}

// checkForm reads a form's token: "invalid" when not ours or older than a
// day, "too_fast" when sent within minimumSeconds (3 by default) of showing.
export function checkForm(token: unknown, options: { minimumSeconds?: number; maximumHours?: number; now?: number } = {}): "ok" | "too_fast" | "invalid" {
  const [value = "", signature = ""] = typeof token === "string" && token.length <= 128 ? token.split(".") : [];
  if (!/^\d{13}$/u.test(value)) return "invalid";
  const expected = sign(value);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return "invalid";
  const age = (options.now ?? Date.now()) - Number(value);
  if (age < 0 || age > (options.maximumHours ?? 24) * 3600000) return "invalid";
  if (age < (options.minimumSeconds ?? 3) * 1000) return "too_fast";
  return "ok";
}

// address is the visitor's address as the Chest's front gave it
// (Chest-Visitor-Address), or null — never X-Forwarded-For, which the
// visitor writes.
export function address(request: Request | Headers_): string | null {
  const given = (headersOf(request).get(addressHeader) ?? "").trim();
  return /^[0-9a-fA-F:.]{2,45}$/u.test(given) && /[.:]/u.test(given) ? given : null;
}

// visitor is an opaque key for a visitor of this tool (a hash of their
// address and the tool), for a tool's own records — never the address.
export function visitor(request: Request | Headers_): string {
  const a = address(request);
  return a === null ? "unknown" : createHash("sha256").update((process.env["CHEST_TOOL"] ?? "") + "|" + a).digest("base64url").slice(0, 22);
}

const namePattern = /^[a-z][a-z0-9-]{0,31}$/u;

// count counts one action of a visitor (a form sent, a booking) under a name
// of the tool's, and says whether it is allowed: at most perVisitor an hour
// for one visitor, perHour for everyone; the Chest adds its own ceiling per
// address across its tools (60 an hour). retryAfter in seconds when not.
export async function count(request: Request | Headers_, name: string, limits: { perVisitor: number; perHour: number }): Promise<{ allowed: boolean; retryAfter: number }> {
  if (!namePattern.test(name)) throw new ChestError("invalid_name", 400, "a name is a-z 0-9 -");
  const within = (n: number, max: number) => Number.isInteger(n) && n >= 1 && n <= max;
  if (!within(limits.perVisitor, 1000) || !within(limits.perHour, 100000)) throw new ChestError("invalid_limits", 400, "perVisitor 1 to 1,000, perHour 1 to 100,000");
  const response = await chest("visitors", "POST", "/visitors/count", { body: JSON.stringify({ name, address: address(request), per_visitor: limits.perVisitor, per_hour: limits.perHour }), type: "application/json" });
  if (response.status !== 200) throw await refusal(response, "visitors");
  const answer = (await json(response)) as { allowed?: unknown; retry_after?: unknown } | null;
  if (!answer || typeof answer.allowed !== "boolean" || typeof answer.retry_after !== "number") throw new Unavailable();
  return { allowed: answer.allowed, retryAfter: Math.max(0, Math.floor(answer.retry_after)) };
}

// language is the visitor's language among the Chest's: the public switch's
// cookie ("lang"), then Accept-Language, then the Chest's default.
export function language(request: Request | Headers_, cookieName = "lang"): Locale {
  const h = headersOf(request);
  const cookie = (h.get("cookie") ?? "").split(";").map(c => c.trim().split("=")).find(([k]) => k === cookieName)?.[1];
  if (cookie && (locales as readonly string[]).includes(cookie)) return cookie as Locale;
  const ranked = (h.get("accept-language") ?? "").split(",").slice(0, 32).map((part, index) => {
    const [tag = "", ...params] = part.split(";").map(p => p.trim());
    const q = params.find(p => p.startsWith("q="));
    const weight = q === undefined ? 1 : Number(q.slice(2));
    return { language: tag.toLowerCase().split("-")[0] ?? "", weight: Number.isFinite(weight) ? weight : 0, index };
  }).filter(r => r.weight > 0).sort((a, b) => b.weight - a.weight || a.index - b.index);
  const found = ranked.map(r => r.language).find(l => (locales as readonly string[]).includes(l));
  return found ? localeOf(found) : chestLanguage();
}

// chestLanguage is the Chest's own language (chest.language) among the
// store's; English outside a Chest, where a public page must still answer.
function chestLanguage(): Locale {
  try {
    return localeOf(theChest.language);
  } catch {
    return locales[0];
  }
}
