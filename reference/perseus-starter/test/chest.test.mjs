import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeChest, withMember } from "@argentic/chest-sdk/testing";

// The server, built for the tests (npm test: dist/test, beside what the
// preview runs), asked as the Chest asks it.
const camille = { id: "mbr_k2qhx4mzc7v3b6nfp5r2t7w4ya", firstName: "Camille", lastName: "Martin", name: "Camille Martin", photo: null, role: "member", isAdmin: false, isBuilder: false, groups: [], language: "fr", timeZone: "Europe/Paris" };

test("/chest greets the member, under the tool's policy", async (t) => {
  const chest = await fakeChest({ members: [camille] });
  t.after(() => chest.close());
  const { app } = await import("../dist/test/app.js");
  const response = await app.fetch(withMember(new Request("http://tool.test/chest"), camille));
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Hello Camille/);
  assert.match(response.headers.get("content-security-policy") ?? "", /script-src 'self' 'nonce-/);
  assert.equal((await app.fetch(new Request("http://tool.test/chest"))).status, 401);
});
