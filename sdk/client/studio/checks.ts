import type { IncomingMessage } from "node:http";
import { ask, json as answerOf, refusal } from "../src/api.js";
import { ChestError, Unavailable } from "../src/errors.js";
import { delivery, json, memorySeen, object, type Seen } from "../src/signed.js";
import { checkChannel } from "./signed.js";
import { checkChecks, checkPattern } from "./checks-rules.js";

// Studio proposal (not in 0.4.1) — checks run by the Chest. A tool that
// watches a service (Status) has no process between requests (a schedule
// runs every 15 minutes at best), and probing the company's own addresses,
// unknown when the manifest is written, would take "network": ["*"] — a
// permission to reach anything. The Chest can: it probes the addresses the
// tool configures, from outside the tool, and posts each result to it.
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
// through the tool's launcher, signed for this tool (Chest-Check: 0.4.1's
// signed deliveries, as Chest-Event and Chest-Schedule). ok is the
// expectation met: the status (200 by default) within maxMs (10,000 by
// default). error, when not ok: "timeout", "dns", "tls", "refused",
// "status" or "slow". At least once; a result may come twice (the same id).
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

export const checkIdPattern = /^chk_[a-z2-7]{26}$/u;
export { checkPattern, limits } from "./checks-rules.js";
const errors = ["timeout", "dns", "tls", "refused", "status", "slow"] as const;

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

// verify returns the result a delivery carries, or null when it is not one
// the Chest made for this tool: not a POST, no or another signature (the
// header Chest-Check), another tool, expired, a body other than the one
// signed or not of a result's shape. It reads the body (4 KiB at most) and
// never throws for what a request carries.
export async function verify(request: IncomingMessage | Request): Promise<CheckResult | null> {
  const signed = await delivery(request, checkChannel);
  if (!signed) return null;
  const { id: jti, body } = signed;
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

const remembered = memorySeen();

// handle verifies one delivery and hands its result to the handler, once:
// the status to answer the Chest. 401 for a delivery that is not the
// Chest's, 204 once the handler returned or for a result already handled
// (seen.has, as in 0.4.1's events and schedules). A handler that throws
// leaves the result unseen and handle throws: answer 500, the Chest
// delivers it again. seen is memorySeen by default; events' durable store
// serves here too (the ids never meet).
export async function handle(request: IncomingMessage | Request, handler: (result: CheckResult) => void | Promise<void>, options: { seen?: Seen } = {}): Promise<number> {
  const result = await verify(request);
  if (!result) return 401;
  const seen = options.seen ?? remembered;
  if (await seen.has(result.id)) return 204;
  await handler(result);
  await seen.add(result.id);
  return 204;
}
