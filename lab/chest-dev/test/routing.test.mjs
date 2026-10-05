// The Chest's routing as routing.mjs plays it (contract 0.4).
//   node --test lab/chest-dev/test/
import assert from "node:assert/strict";
import { test } from "node:test";
import { DefaultCSP, FloorCSP, TeamCSP, addedPolicies, allowedCookies, isNavigation, route, simplePath, staticPrefixes } from "../routing.mjs";

const origins = { teamOrigin: "http://localhost:4000", publicOrigin: "http://localhost:4002" };
const privateTool = { name: "tasks", build: { static: ["/assets/"] } };
const nextTool = { name: "wiki" };
const publicTool = { name: "status", public: true, build: { static: ["/assets/"] } };
const get = (url, headers = {}) => ({ method: "GET", url, headers });

test("build.static defaults to /_next/static/", () => {
  assert.deepEqual(staticPrefixes(nextTool), ["/_next/static/"]);
  assert.deepEqual(staticPrefixes(privateTool), ["/assets/"]);
});

test("team host: /chest carries the member, in any case", () => {
  assert.deepEqual(route("team", get("/chest"), privateTool, origins), { to: "tool", member: true });
  assert.deepEqual(route("team", get("/CHEST/boards?x=1"), privateTool, origins), { to: "tool", member: true });
  assert.deepEqual(route("team", get("/_chest/members/x/photo"), privateTool, origins), { to: "chest" });
});

test("team host: a write needs same-origin fetch metadata and the host's Origin", () => {
  const post = (headers) => route("team", { method: "POST", url: "/chest/boards", headers }, privateTool, origins);
  assert.equal(post({}).status, 403);
  assert.equal(post({ "sec-fetch-site": "same-origin" }).status, 403);
  assert.equal(post({ "sec-fetch-site": "cross-site", origin: origins.teamOrigin }).status, 403);
  assert.equal(post({ "sec-fetch-site": "same-origin", origin: origins.publicOrigin }).status, 403);
  assert.deepEqual(post({ "sec-fetch-site": "same-origin", origin: origins.teamOrigin }), { to: "tool", member: true });
});

test("team host: static files to anyone in GET/HEAD only, the rest to the public host", () => {
  assert.deepEqual(route("team", get("/assets/client.js"), privateTool, origins), { to: "tool", member: false, static: true });
  assert.deepEqual(route("team", { method: "HEAD", url: "/assets/client.css", headers: {} }, privateTool, origins), { to: "tool", member: false, static: true });
  assert.equal(route("team", { method: "POST", url: "/assets/x", headers: {} }, privateTool, origins).status, 302);
  // A Next.js file outside the declared prefix: sent away.
  const moved = route("team", get("/_next/static/chunks/a.js?v=1"), privateTool, origins);
  assert.equal(moved.status, 302);
  assert.equal(moved.location, "http://localhost:4002/_next/static/chunks/a.js?v=1");
  assert.deepEqual(route("team", get("/_next/static/chunks/a.js"), nextTool, origins), { to: "tool", member: false, static: true });
  assert.equal(route("team", get("/"), privateTool, origins).status, 302);
  assert.equal(route("team", get("/chest-schedules"), privateTool, origins).status, 302);
});

test("public host: /chest goes to the team host; without a public part, 404 but static files", () => {
  const back = route("public", get("/chest/x?y=1"), publicTool, origins);
  assert.equal(back.status, 302);
  assert.equal(back.location, "http://localhost:4000/chest/x?y=1");
  assert.equal(route("public", get("/chest"), privateTool, origins).status, 302);
  assert.equal(route("public", get("/"), privateTool, origins).status, 404);
  assert.deepEqual(route("public", get("/assets/client.js"), privateTool, origins), { to: "tool", member: false, static: true });
  assert.deepEqual(route("public", get("/"), publicTool, origins), { to: "tool", member: false });
  assert.deepEqual(route("public", { method: "POST", url: "/subscribe", headers: {} }, publicTool, origins), { to: "tool", member: false });
  // chest-schedules is not /chest: relayed (the SDK checks the signature).
  assert.deepEqual(route("public", { method: "POST", url: "/chest-schedules", headers: {} }, publicTool, origins), { to: "tool", member: false });
});

test("a path not in its simple form is 400 on both hosts; Upgrade is 501", () => {
  for (const url of ["//chest", "/chest/../x", "/chest/./x", "/a%2Fb", "/a%2fb", "/a%5Cb", "/%2e%2e/x", "/a%00", "/a\\b"]) {
    assert.equal(simplePath(url), false, url);
    assert.equal(route("team", get(url), publicTool, origins).status, 400, url);
    assert.equal(route("public", get(url), publicTool, origins).status, 400, url);
  }
  assert.equal(simplePath("/chest/a.b/c?q=../x"), true);
  assert.equal(route("team", get("/chest", { upgrade: "websocket" }), publicTool, origins).status, 501);
});

test("the CSP the Chest adds", () => {
  assert.deepEqual(addedPolicies("team", privateTool, undefined), [TeamCSP]);
  assert.deepEqual(addedPolicies("team", privateTool, "default-src 'self'"), []);
  assert.deepEqual(addedPolicies("team", privateTool, " "), [TeamCSP]);
  assert.deepEqual(addedPolicies("public", publicTool, undefined), [DefaultCSP]);
  assert.deepEqual(addedPolicies("public", publicTool, "script-src 'nonce-x'"), [DefaultCSP]);
  assert.deepEqual(addedPolicies("public", { ...publicTool, csp: "tool" }, "script-src 'nonce-x'"), [FloorCSP]);
  assert.deepEqual(addedPolicies("public", { ...publicTool, csp: "tool" }, undefined), [DefaultCSP]);
  assert.deepEqual(addedPolicies("public", { ...publicTool, csp: "tool" }, ""), [DefaultCSP]);
});

test("cookies: never __Host-chest, never Domain, never unreadable", () => {
  assert.deepEqual(allowedCookies(["a=1; Path=/", "__Host-chest=x; Path=/", "b=2; Domain=example.com", "garbage", "c=3; HttpOnly"]), ["a=1; Path=/", "c=3; HttpOnly"]);
});

test("navigation: a GET in mode navigate, or accepting HTML without a mode", () => {
  assert.equal(isNavigation("GET", { "sec-fetch-mode": "navigate" }), true);
  assert.equal(isNavigation("GET", { accept: "text/html,*/*" }), true);
  assert.equal(isNavigation("GET", { "sec-fetch-mode": "cors", accept: "text/html" }), false);
  assert.equal(isNavigation("POST", { "sec-fetch-mode": "navigate" }), false);
});
