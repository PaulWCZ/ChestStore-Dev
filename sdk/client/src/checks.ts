import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { ask, json as answerOf, refusal } from "./api.js";
import { ChestError, Unavailable } from "./errors.js";

// Proposal (studio) — checks run by the Chest: a tool that watches a
// service (Status) cannot reach it — no outbound network, no process
// between requests. The Chest can: it probes the addresses a tool declares,
// from outside the tool, and posts each result to the tool.
//
//   // chest.json — a permission the owner approves:
//   // “Asks the Chest to check up to 10 web addresses of yours”
//   "checks": { "max": 10 }
//
//   // The addresses are the company's, so the tool's admin sets them, and
//   // the tool hands them to the Chest (each one shown to the owner):
//   await checks.configure([{ name: "website", url: "https://atelier-martin.fr/", every: 5,
//                             expect: { status: 200, maxMs: 3000 } }]);
//
//   // app/chest-checks/route.ts (Next.js): outside /chest, never behind a session
//   import * as checks from "@argentic/chest-sdk/checks";
//   export async function POST(request: Request) {
//     return new Response(null, { status: await checks.handle(request, result => record(result)) });
//   }
//
// The Chest probes with a GET (no cookie, no body, redirects not followed,
// its own user agent), from its own address, every `every` minutes (1 to
// 60), and posts {id, name, at, ok, status, ms, error} to POST /chest-checks
// through the tool's launcher, signed for this tool (Chest-Check, like
// Chest-Job). ok is the expectation met: the status (200 by default) within
// maxMs (10,000 by default). error, when not ok: "timeout", "dns", "tls",
// "refused", "status" or "slow". At least once; a result may come twice (the
// same id).
//
// Bounds (the Chest's): 10 checks per tool, at most every minute, https
// only (http on localhost for the harness), no private address.

export type CheckResult = {
  // "chk_…": the same on every delivery of this result.
  id: string;
  name: string;
  // When the probe started (ISO 8601, UTC).
  at: string;
  ok: boolean;
  // The HTTP status answered, null when there was no answer.
  status: number | null;
  // How long the answer took, in milliseconds (the timeout when none).
  ms: number;
  error: null | "timeout" | "dns" | "tls" | "refused" | "status" | "slow";
};
export type Check = { name: string; url: string; every: number; expect?: { status?: number; maxMs?: number } };

const label = "Chest-Check v1";
const claims = ["aud", "iat", "exp", "jti", "digest"] as const;
const skew = 5;
const maxSignature = 2048;
const maxBody = 4096;
const compact = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/u;
export const checkIdPattern = /^chk_[a-z2-7]{26}$/u;
export const checkPattern = /^[a-z][a-z0-9-]{0,31}$/u;
export const limits = { checks: 10, minimumMinutes: 1, maximumMinutes: 60, maxMs: 30000 } as const;
const errors = ["timeout", "dns", "tls", "refused", "status", "slow"] as const;

// checkManifest lists what is wrong with a manifest's "checks" (none: []).
export function checkManifest(value: unknown): string[] {
  const o = value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  if (!o || Object.keys(o).some(k => k !== "max")) return ['"checks" is {"max": 1 to 10}'];
  const max = o["max"];
  return typeof max === "number" && Number.isInteger(max) && max >= 1 && max <= limits.checks ? [] : ['"checks": max is 1 to 10'];
}

// checkChecks lists what is wrong with a list of checks (none: []).
export function checkChecks(value: unknown): string[] {
  if (!Array.isArray(value)) return ['"checks" is a list of {name, url, every, expect}'];
  const problems: string[] = [];
  if (value.length > limits.checks) problems.push(`at most ${limits.checks} checks`);
  const names = new Set<string>();
  for (const c of value as unknown[]) {
    const o = c !== null && typeof c === "object" && !Array.isArray(c) ? (c as Record<string, unknown>) : null;
    if (!o || Object.keys(o).some(k => !["name", "url", "every", "expect"].includes(k))) { problems.push("a check is {name, url, every, expect}"); continue; }
    const name = o["name"];
    if (typeof name !== "string" || !checkPattern.test(name)) problems.push(`check name ${JSON.stringify(name)}: a-z, 0-9, -`);
    else if (names.has(name)) problems.push(`two checks named ${name}`);
    else names.add(name);
    let url: URL | null = null;
    try { url = typeof o["url"] === "string" ? new URL(o["url"]) : null; } catch { url = null; }
    const local = url !== null && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (!url || !(url.protocol === "https:" || (url.protocol === "http:" && local)) || url.username || url.password) problems.push(`check ${String(name)}: an https address`);
    const every = o["every"];
    if (typeof every !== "number" || !Number.isInteger(every) || every < limits.minimumMinutes || every > limits.maximumMinutes) problems.push(`check ${String(name)}: every is 1 to 60 minutes`);
    const expect = o["expect"];
    if (expect !== undefined) {
      const e = expect !== null && typeof expect === "object" && !Array.isArray(expect) ? (expect as Record<string, unknown>) : null;
      if (!e || Object.keys(e).some(k => k !== "status" && k !== "maxMs")) problems.push(`check ${String(name)}: expect is {status, maxMs}`);
      else {
        if (e["status"] !== undefined && (typeof e["status"] !== "number" || !Number.isInteger(e["status"]) || e["status"] < 100 || e["status"] > 599)) problems.push(`check ${String(name)}: expect.status is an HTTP status`);
        if (e["maxMs"] !== undefined && (typeof e["maxMs"] !== "number" || !Number.isInteger(e["maxMs"]) || e["maxMs"] < 100 || e["maxMs"] > limits.maxMs)) problems.push(`check ${String(name)}: expect.maxMs is 100 to 30,000`);
      }
    }
  }
  return problems;
}

// configure hands the Chest the checks it runs for the tool, replacing the
// earlier list (an empty list stops them all). Refused: ChestError
// invalid_checks (the list), CapabilityNotGranted (not declared), and
// QuotaExceeded beyond the manifest's max.
export async function configure(list: Check[]): Promise<Check[]> {
  const problems = checkChecks(list);
  if (problems.length > 0) throw new ChestError("invalid_checks", 400, problems.join("; "));
  const response = await ask("checks", "PUT", "/checks", { body: JSON.stringify({ checks: list }), type: "application/json" });
  if (response.status !== 200) throw await refusal(response, "checks");
  const answer = (await answerOf(response)) as { checks?: unknown } | null;
  if (!answer || !Array.isArray(answer.checks) || checkChecks(answer.checks).length > 0) throw new Unavailable();
  return answer.checks as Check[];
}

// list is what the Chest runs for the tool now.
export async function list(): Promise<Check[]> {
  const response = await ask("checks", "GET", "/checks");
  if (response.status !== 200) throw await refusal(response, "checks");
  const answer = (await answerOf(response)) as { checks?: unknown } | null;
  if (!answer || !Array.isArray(answer.checks) || checkChecks(answer.checks).length > 0) throw new Unavailable();
  return answer.checks as Check[];
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function json(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
function headerOf(request: IncomingMessage | Request): string | null {
  const headers = request.headers as Headers | IncomingMessage["headers"];
  const value = typeof (headers as Headers).get === "function" ? (headers as Headers).get("chest-check") : (headers as IncomingMessage["headers"])["chest-check"];
  return typeof value === "string" && value.length <= maxSignature ? value : null;
}
function pathOf(request: IncomingMessage | Request): string {
  try {
    return new URL(request.url ?? "/", "http://tool").pathname;
  } catch {
    return "";
  }
}
async function bodyOf(request: IncomingMessage | Request): Promise<Buffer | null> {
  try {
    if (request instanceof Request) {
      if (request.bodyUsed || Number(request.headers.get("content-length") ?? "0") > maxBody) return null;
      const raw = Buffer.from(await request.arrayBuffer());
      return raw.length <= maxBody ? raw : null;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      size += (chunk as Buffer).length;
      if (size > maxBody) return null;
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

// verify returns the result a delivery carries, or null when it is not one
// the Chest made for this tool (signature, tool, time, body, path
// /chest-checks, POST). It reads the body and never throws for what a
// request carries.
export async function verify(request: IncomingMessage | Request): Promise<CheckResult | null> {
  const token = process.env["CHEST_TOKEN"];
  const tool = process.env["CHEST_TOOL"];
  if (!token || !/^[A-Za-z0-9_-]{43,512}$/u.test(token) || !tool || request.method !== "POST" || pathOf(request) !== "/chest-checks") return null;
  const signature = headerOf(request);
  const parts = signature === null ? null : compact.exec(signature);
  if (!parts) return null;
  const [, encodedHeader = "", encodedPayload = "", encodedSignature = ""] = parts;
  const header = object(json(Buffer.from(encodedHeader, "base64url").toString("utf8")));
  if (!header || Object.keys(header).length !== 2 || header["alg"] !== "HS256" || header["typ"] !== "JWT") return null;
  const key = createHmac("sha256", Buffer.from(token, "utf8")).update(label).digest();
  const expected = createHmac("sha256", key).update(encodedHeader + "." + encodedPayload).digest();
  const given = Buffer.from(encodedSignature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const payload = object(json(Buffer.from(encodedPayload, "base64url").toString("utf8")));
  if (!payload || Object.keys(payload).length !== claims.length || !claims.every(name => Object.hasOwn(payload, name))) return null;
  const { aud, iat, exp, jti, digest } = payload;
  if (aud !== tool || typeof jti !== "string" || !checkIdPattern.test(jti) || typeof digest !== "string") return null;
  if (typeof iat !== "number" || !Number.isSafeInteger(iat) || typeof exp !== "number" || !Number.isSafeInteger(exp) || exp <= iat) return null;
  const now = Math.floor(Date.now() / 1000);
  if (iat > now + skew || exp <= now - skew) return null;
  const body = await bodyOf(request);
  if (body === null) return null;
  const sum = createHash("sha256").update(body).digest();
  const told = Buffer.from(digest, "base64url");
  if (told.length !== sum.length || !timingSafeEqual(told, sum)) return null;
  const r = object(json(body.toString("utf8")));
  if (!r || Object.keys(r).sort().join(",") !== "at,error,id,ms,name,ok,status" || r["id"] !== jti) return null;
  const { name, at, ok, status, ms, error } = r;
  if (typeof name !== "string" || !checkPattern.test(name)) return null;
  if (typeof at !== "string" || at.length > 40 || Number.isNaN(Date.parse(at))) return null;
  if (typeof ok !== "boolean" || !(status === null || (typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599))) return null;
  if (typeof ms !== "number" || !Number.isInteger(ms) || ms < 0 || ms > 120000) return null;
  if (!(error === null || (typeof error === "string" && (errors as readonly string[]).includes(error))) || (ok && error !== null) || (!ok && error === null)) return null;
  return { id: jti, name, at, ok, status: status as number | null, ms, error: error as CheckResult["error"] };
}

// handle verifies one delivery and hands its result to the handler: the
// status to answer the Chest. 401 for a delivery that is not the Chest's,
// 204 once the handler returned. A handler that throws makes handle throw:
// answer 500, the Chest delivers the result again. Handlers must be
// idempotent (the same result.id may come twice).
export async function handle(request: IncomingMessage | Request, handler: (result: CheckResult) => void | Promise<void>): Promise<number> {
  const result = await verify(request);
  if (!result) return 401;
  await handler(result);
  return 204;
}
