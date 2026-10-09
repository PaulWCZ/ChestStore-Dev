// The rules of checks, as the Chest applies them: the manifest's
// permission and a list's grammar. Not a published module: checks.ts
// exports the grammars and limits; configure() and list() use checkChecks;
// scripts/check-manifest.mjs imports checkManifest from here.

export const checkPattern = /^[a-z][a-z0-9-]{0,31}$/u;
export const limits = { checks: 10, minimumMinutes: 1, maximumMinutes: 60, maxMs: 30000 } as const;

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

