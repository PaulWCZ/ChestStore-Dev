import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { groupIdPattern, languagePattern, memberIdPattern, timeZonePattern, type Member } from "../src/member.js";

// @argentic/chest-sdk/member as the studio publishes it: 0.4.1's module —
// every name the same value but member() — with member() reading the
// assertion of a member in any number of groups (below), and the studio's
// languages helper.
export * from "../src/member.js";

// ---- A member in any number of groups (studio.7; announced for 0.5) ---------
//
// 0.4.1's member() refuses an assertion whose groups list more than 16
// groups: it answers null, and the tool shows "Sign in" to a member the
// Chest signed in. The contract sets no such cap (the assertion's groups are
// "the groups that give the tool to the member"), and with the proposal
// "members.groups" they are every group of the Chest the member is in —
// 17 is an ordinary company. 0.5 announces no fixed cap on members or
// groups. So the studio's member() reads exactly what 0.4.1's reads, by the
// same rules — the key, the header, the signature in constant time, aud,
// iat/exp within 5 s, the shape of every claim, each group a grp_
// identifier — with two differences only:
// - groups: any number (0.4.1: 16 at most);
// - the assertion: maxAssertionLength characters at most (0.4.1: 8,192),
//   which is the size of all the request's headers a Node server takes by
//   default (http.maxHeaderSize, 16 KiB, answered 431 beyond): a longer
//   one cannot reach the tool anyway. About 300 groups fit, fewer with long
//   names and big cookies; the SDK report asks 0.5 how the Chest carries a
//   member beyond that.
// It does so for every tool, with "members.groups" or without: a tool's
// process does not know what it was approved (no variable says it), and it
// needs not — every assertion 0.4.1 accepts reads the same (the same
// Member), and the ones it accepts besides are signed by the Chest like any
// other: a request cannot add a group to its member. Without the proposal
// the groups are those that give the tool, which a real Chest does not cap
// at 16 either.
export const maxAssertionLength = 16384;

// The key's label and the claims, as 0.4.1's member.ts derives and requires
// them (a test checks both read the Chest's vector alike).
const label = "Chest-Member v2";
const claims = ["iss", "aud", "iat", "exp", "sub", "given_name", "family_name", "name", "picture", "role", "admin", "builder", "groups", "language", "time_zone"] as const;
const skew = 5;
const compact = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/u;

function assertionOf(request: IncomingMessage | Request): string | null {
  const headers = request.headers as Headers | IncomingMessage["headers"];
  // Repeated headers: joined with ", " by a Web Request, an array on a Node
  // request — both refused, as 0.4.1 refuses them.
  const value = typeof (headers as Headers).get === "function" ? (headers as Headers).get("chest-member") : (headers as IncomingMessage["headers"])["chest-member"];
  return typeof value === "string" && value.length <= maxAssertionLength ? value : null;
}

function claimsOf(part: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as unknown;
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

// member returns who the Chest says is making this request, or null — as
// 0.4.1's: absent, malformed, signed with another key or for another shape,
// for another tool, expired or not yet valid, longer than
// maxAssertionLength, or CHEST_TOKEN or CHEST_TOOL missing. Never throws for
// what a request carries.
export function member(request: IncomingMessage | Request): Member | null {
  const token = process.env["CHEST_TOKEN"];
  const tool = process.env["CHEST_TOOL"];
  if (!token || !/^[A-Za-z0-9_-]{43,512}$/u.test(token) || !tool) return null;
  const assertion = assertionOf(request);
  const parts = assertion === null ? null : compact.exec(assertion);
  if (!parts) return null;
  const [, encodedHeader = "", encodedPayload = "", encodedSignature = ""] = parts;
  const header = claimsOf(encodedHeader);
  if (!header || Object.keys(header).length !== 2 || header["alg"] !== "HS256" || header["typ"] !== "JWT") return null;
  const key = createHmac("sha256", Buffer.from(token, "utf8")).update(label).digest();
  const expected = createHmac("sha256", key).update(encodedHeader + "." + encodedPayload).digest();
  const signature = Buffer.from(encodedSignature, "base64url");
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return null;
  const payload = claimsOf(encodedPayload);
  if (!payload || !claims.every(name => Object.hasOwn(payload, name))) return null;
  const { iss, aud, iat, exp, sub, given_name, family_name, name, email, picture, role, admin, builder, groups, language, time_zone } = payload;
  if (typeof iss !== "string" || iss === "" || aud !== tool || typeof sub !== "string" || !memberIdPattern.test(sub)) return null;
  if (typeof iat !== "number" || !Number.isSafeInteger(iat) || typeof exp !== "number" || !Number.isSafeInteger(exp) || exp <= iat) return null;
  const now = Math.floor(Date.now() / 1000);
  if (iat > now + skew || exp <= now - skew) return null;
  if (typeof given_name !== "string" || typeof family_name !== "string" || typeof name !== "string" || typeof picture !== "string" || typeof role !== "string" || typeof admin !== "boolean" || typeof builder !== "boolean") return null;
  // The one rule that differs from 0.4.1's: no count of groups.
  if (!Array.isArray(groups) || !groups.every(g => typeof g === "string" && groupIdPattern.test(g)) || (email !== undefined && typeof email !== "string")) return null;
  if (typeof language !== "string" || !languagePattern.test(language) || typeof time_zone !== "string" || !timeZonePattern.test(time_zone)) return null;
  return { id: sub, firstName: given_name, lastName: family_name, name, photo: picture === "" ? null : picture, role: role === "" ? null : role, isAdmin: admin, isBuilder: builder, groups: [...groups] as string[], language, timeZone: time_zone, ...(email === undefined ? {} : { email }) };
}

// ---- Studio proposal (not in 0.4.1) -----------------------------------------
//
// The languages the store's tools speak today, the first one the default and
// fallback. member.language is any language the Chest speaks — a tool
// narrows it to one of its catalogues with localeOf, so that a language
// added to the Chest before the tool translates it reads as English rather
// than as nothing (0.4.1's README: "a tool that does not speak it uses its
// own default"). The studio's modules that take words in several languages
// (notifications.broadcast, calendar, visitors.language) are typed on them.
export const locales = ["en", "fr"] as const;
export type Locale = (typeof locales)[number];

// localeOf is the store's language for a language tag ("fr", "fr-FR", "FR"):
// its primary subtag when the store speaks it, English otherwise — also for
// anything that is not a tag.
//
//   const t = catalogue[localeOf(who.language)];
export function localeOf(tag: unknown): Locale {
  if (typeof tag !== "string" || tag.length > 35) return locales[0];
  const primary = tag.split(/[-_]/u)[0]!.toLowerCase();
  return (locales as readonly string[]).includes(primary) ? primary as Locale : locales[0];
}
