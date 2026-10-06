// The Chest's routing in front of a tool, as contract 0.4 states it
// (reference/contract/application-contract.md, "Front", "Public host",
// "Team host"; reference/sdk/contract/README.md, `build.static` and the CSP
// table). Pure functions: dev.mjs applies them, test/routing.test.mjs
// checks them.
//
// Team host (the members' origin):
//   /_chest/…                 the Chest's own (the fake Chest's front)
//   /chest, /chest/…          to the tool, with the Chest-Member assertion;
//                             a method other than GET/HEAD needs
//                             Sec-Fetch-Site: same-origin and the host's
//                             Origin (403 otherwise)
//   GET/HEAD under a prefix   to the tool, to anyone, no member
//   of build.static
//   anything else             302 to the public host, same path and query
// Public host:
//   /chest…                   302 to the team host, same path and query
//   GET/HEAD under a prefix   to the tool (static files: both hosts)
//   of build.static
//   no public part            404 "Page not found"
//   anything else             to the tool, without identity
// Both: a path not in its simple form → 400; Upgrade → 501.

export const defaultStatic = ["/_next/static/"];

// The CSP the Chest adds (contract/README.md, "The CSP the Chest adds").
export const DefaultCSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
export const FloorCSP = "frame-ancestors 'none'; base-uri 'self'; object-src 'none'";
export const TeamCSP = "frame-ancestors 'none'";

export function staticPrefixes(manifest) {
  const given = manifest?.build?.static;
  return Array.isArray(given) && given.length ? given : defaultStatic;
}

// A path in its simple form: no "//", no "." or ".." segment, no "\", and
// none of %2F %5C %2E %00 (any case).
export function simplePath(rawPath) {
  const path = rawPath.split("?")[0];
  if (!path.startsWith("/") || path.includes("//") || path.includes("\\")) return false;
  if (/%(2f|5c|2e|00)/iu.test(path)) return false;
  return !path.split("/").some((segment) => segment === "." || segment === "..");
}

const firstSegment = (path) => path.split("?")[0].split("/")[1] ?? "";
const isChest = (path) => firstSegment(path).toLowerCase() === "chest";
const underStatic = (manifest, path) => staticPrefixes(manifest).some((prefix) => path.split("?")[0].startsWith(prefix));
const reading = (method) => method === "GET" || method === "HEAD";

// Where a request goes. request: {method, url (path and query), headers
// (lower-case names)}; teamOrigin, publicOrigin: the two hosts' origins.
// Answers {to: "tool", member: bool} | {to: "chest"} (the Chest's own
// /_chest/) | {status, location?, reason}.
export function route(host, request, manifest, { teamOrigin, publicOrigin }) {
  const { method, url, headers = {} } = request;
  if (headers.upgrade) return { status: 501, reason: "the Chest refuses Upgrade (no WebSocket)" };
  if (!simplePath(url)) return { status: 400, reason: "a path not in its simple form (//, . or .., \\, %2F, %5C, %2E, %00)" };
  const path = url.split("?")[0];
  if (host === "team") {
    if (path.startsWith("/_chest/")) return { to: "chest" };
    if (isChest(url)) {
      if (!reading(method)) {
        const site = headers["sec-fetch-site"];
        if (site !== "same-origin" || headers.origin !== teamOrigin) {
          return { status: 403, reason: `a ${method} to /chest needs Sec-Fetch-Site: same-origin and Origin: ${teamOrigin} (got ${site ?? "no Sec-Fetch-Site"}, ${headers.origin ?? "no Origin"})` };
        }
      }
      return { to: "tool", member: true };
    }
    if (reading(method) && underStatic(manifest, path)) return { to: "tool", member: false, static: true };
    return { status: 302, location: publicOrigin + url, reason: `outside /chest and build.static ${JSON.stringify(staticPrefixes(manifest))}: sent to the public host` };
  }
  if (isChest(url)) return { status: 302, location: teamOrigin + url, reason: "/chest belongs to the team host" };
  if (reading(method) && underStatic(manifest, path)) return { to: "tool", member: false, static: true };
  if (!manifest.public) return { status: 404, reason: `the tool has no public part ("public": true), and ${path} is not under build.static ${JSON.stringify(staticPrefixes(manifest))}` };
  return { to: "tool", member: false };
}

// The policies the Chest adds to a relayed answer: the values to append to
// its Content-Security-Policy header(s). headerValue: what the tool sent
// (a string, an array or undefined).
export function addedPolicies(host, manifest, headerValue) {
  const own = (Array.isArray(headerValue) ? headerValue : headerValue === undefined ? [] : [headerValue]).filter((v) => String(v).trim() !== "");
  if (host === "team") return own.length ? [] : [TeamCSP];
  if (manifest.csp === "tool" && own.length) return [FloorCSP];
  return [DefaultCSP];
}

// Set-Cookie values the Chest lets through: never __Host-chest, never one
// with a Domain attribute, never an unreadable one.
export function allowedCookies(values) {
  const list = Array.isArray(values) ? values : values === undefined ? [] : [values];
  return list.filter((cookie) => {
    const [pair, ...attributes] = String(cookie).split(";");
    const name = pair.split("=")[0]?.trim();
    if (!name || !pair.includes("=")) return false;
    if (name === "__Host-chest") return false;
    return !attributes.some((a) => a.trim().toLowerCase().startsWith("domain"));
  });
}

// The Chest's "Waking up <title>…" page (toolfront.Waking): 503,
// Retry-After: 2, a refresh in 2 s, no script, a hairline that moves unless
// reduced motion is asked.
export function wakingPage(title) {
  const t = String(title).replace(/[&<>"']/gu, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="2"><title>Waking up ${t}…</title><style>body{font:16px/1.5 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#fafafa;color:#222}main{text-align:center}.line{height:2px;width:160px;margin:16px auto 0;background:linear-gradient(90deg,transparent,#222,transparent);background-size:50% 100%;background-repeat:no-repeat;animation:m 1.2s linear infinite}@keyframes m{from{background-position:-100% 0}to{background-position:200% 0}}@media (prefers-reduced-motion:reduce){.line{animation:none;background:#ccc}}@media (prefers-color-scheme:dark){body{background:#111;color:#eee}.line{background-color:transparent}}</style></head><body><main><p>Waking up ${t}…</p><div class="line"></div></main></body></html>`;
}

// A browser opening a page (toolfront Visit.Navigation): a GET in mode
// navigate, or with no mode and accepting HTML.
export function isNavigation(method, headers) {
  if (method !== "GET") return false;
  const mode = headers["sec-fetch-mode"];
  return mode === "navigate" || (!mode && String(headers.accept ?? "").includes("text/html"));
}
