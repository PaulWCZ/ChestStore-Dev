import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import * as events from "../events.js";
import type { Member } from "../member.js";
import * as members from "../members.js";
import { fakeChest } from "../testing.js";

const person = (key: string): Member => ({ id: "mbr_" + key + "a".repeat(26 - key.length), firstName: key, lastName: "X", name: key + " X", photo: null, role: null, isAdmin: false, isBuilder: false, groups: [], language: "en", timeZone: "Europe/Paris" });

// What a tool's code does, unchanged from production: plain fetch() to the
// hosts its chest.json "network" declares (Equipment reads Intune).
async function readDevices(): Promise<string[]> {
  const token = await fetch("https://login.microsoftonline.com/contoso.onmicrosoft.com/oauth2/v2.0/token", { method: "POST", body: new URLSearchParams({ grant_type: "client_credentials" }) });
  const { access_token } = (await token.json()) as { access_token: string };
  const page = await fetch("https://graph.microsoft.com/v1.0/deviceManagement/managedDevices", { headers: { Authorization: `Bearer ${access_token}` } });
  return ((await page.json()) as { value: { serialNumber: string }[] }).value.map(d => d.serialNumber);
}

test("network: the tool's plain fetch() reaches the declared hosts' handlers, as through the Chest's proxy", async () => {
  const before = globalThis.fetch;
  const seen: string[] = [];
  const chest = await fakeChest({
    network: {
      "login.microsoftonline.com": async request => {
        seen.push(`${request.method} ${new URL(request.url).pathname} ${(await request.text()).includes("client_credentials")}`);
        return Response.json({ access_token: "t0k" });
      },
      "graph.microsoft.com": request => {
        seen.push(`${request.method} ${request.headers.get("authorization")}`);
        return Response.json({ value: [{ serialNumber: "C02X1" }] });
      },
      "*.icloud.com": () => new Response("BEGIN:VCALENDAR", { headers: { "Content-Type": "text/calendar" } }),
    },
  });
  try {
    assert.notEqual(globalThis.fetch, before);
    assert.deepEqual(await readDevices(), ["C02X1"]);
    assert.deepEqual(seen, ["POST /contoso.onmicrosoft.com/oauth2/v2.0/token true", "GET Bearer t0k"]);
    // A wildcard declares every name below it, not the name itself.
    assert.equal(await (await fetch("https://p42-caldav.icloud.com/published/2/abc")).text(), "BEGIN:VCALENDAR");
    await assert.rejects(fetch("https://icloud.com/"), TypeError);
    assert.deepEqual(chest.egress.map(e => [e.method, new URL(e.url).hostname, e.status, e.refused]), [
      ["POST", "login.microsoftonline.com", 200, undefined],
      ["GET", "graph.microsoft.com", 200, undefined],
      ["GET", "p42-caldav.icloud.com", 200, undefined],
      ["GET", "icloud.com", null, "undeclared"],
    ]);
  } finally {
    await chest.close();
  }
  assert.equal(globalThis.fetch, before, "close() gives fetch back");
});

test("network: what the proxy refuses is refused — undeclared host, IP literal, other port; the Chest's API and localhost go straight", async () => {
  const local = createServer((_, response) => response.end("local"));
  await new Promise<void>(resolve => local.listen(0, "127.0.0.1", resolve));
  const chest = await fakeChest({ members: [person("camille")], network: { "graph.microsoft.com": () => new Response("ok") } });
  try {
    // https: the tunnel is refused, fetch() rejects as it does behind a refusing proxy.
    await assert.rejects(fetch("https://evil.example.com/"), (e: unknown) => e instanceof TypeError && String((e as { cause?: unknown }).cause).includes("undeclared"));
    // http: the proxy's own answer.
    const refused = await fetch("http://evil.example.com/");
    assert.equal(refused.status, 403);
    assert.equal(refused.headers.get("chest-egress"), "refused; reason=undeclared");
    await assert.rejects(fetch("https://93.184.215.14/"), TypeError);
    await assert.rejects(fetch("https://graph.microsoft.com:8443/"), TypeError);
    assert.deepEqual(chest.egress.map(e => e.refused), ["undeclared", "undeclared", "ip-literal", "port"]);
    // The SDK's own calls to the fake Chest (127.0.0.1) and a test's local server are not the network.
    assert.equal((await members.list()).members.length, 1);
    assert.equal(await (await fetch(`http://127.0.0.1:${(local.address() as AddressInfo).port}/`)).text(), "local");
    assert.equal(chest.egress.length, 4);
  } finally {
    await chest.close();
    local.closeAllConnections();
    local.close();
  }
});

test("network: redirects are followed through declared hosts only; an abort stops a handler that hangs", async () => {
  const chest = await fakeChest({
    network: {
      "calendar.google.com": request => new URL(request.url).pathname === "/old" ? new Response(null, { status: 302, headers: { Location: "/calendar/ical/x/basic.ics" } }) : new Response("feed"),
      "outlook.office365.com": () => new Response(null, { status: 301, headers: { Location: "https://elsewhere.example.com/" } }),
      "slow.example.com": () => new Promise<Response>(() => {}),
    },
  });
  try {
    assert.equal(await (await fetch("https://calendar.google.com/old")).text(), "feed");
    assert.equal((await fetch("https://calendar.google.com/old", { redirect: "manual" })).status, 302);
    await assert.rejects(fetch("https://outlook.office365.com/x.ics"), TypeError);
    await assert.rejects(fetch("https://slow.example.com/", { signal: AbortSignal.timeout(50) }), (e: unknown) => (e as Error).name === "TimeoutError");
  } finally {
    await chest.close();
  }
  await assert.rejects(fakeChest({ network: { "Graph.Microsoft.com": () => new Response() } }), /not a host name/u);
});

test("tool: the fake runs as the tool a test names; clearCaches() forgets what lookup kept", async () => {
  const saved = process.env["CHEST_TOOL"];
  const camille = person("camille");
  const chest = await fakeChest({ tool: "leave", emits: ["leave.approved"], members: [camille] });
  try {
    assert.equal(process.env["CHEST_TOOL"], "leave");
    assert.equal(chest.tool, "leave");
    assert.equal((await events.publish("leave.approved", { request: 1 })).receivers, 0);
    assert.equal((await members.lookup([camille.id])).members.length, 1);
    // A test moves Camille out by hand: lookup still answers from its minute…
    chest.members.splice(0, 1);
    chest.former.push({ id: camille.id, name: "camille X", leftAt: "2026-09-30T17:00:00Z" });
    assert.equal((await members.lookup([camille.id])).members.length, 1);
    // …until the test says so.
    chest.clearCaches();
    assert.deepEqual((await members.lookup([camille.id])).former, [{ id: camille.id, name: "camille X", status: "former" }]);
    assert.equal((await members.leftAt([camille.id])).get(camille.id), "2026-09-30T17:00:00.000Z");
  } finally {
    await chest.close();
  }
  assert.equal(process.env["CHEST_TOOL"], saved);
  await assert.rejects(fakeChest({ tool: "Not A Tool" }), /not a tool's name/u);
});
