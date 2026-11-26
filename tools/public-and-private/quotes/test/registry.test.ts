import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../src/shared/app-error.ts";
import { lookupSiren, registered, registryHost, streetOf } from "../src/lib/registry.ts";
import { asMember } from "./support/member.ts";
import { everyone, hugo, lea } from "./support/members.ts";

// A new client filled from its SIREN through France's public directory of
// companies — the tool's one declared network host — and an honest "could
// not be reached" when it cannot be. The tool calls it with plain fetch();
// the SDK's fake Chest answers the declared host as the Chest's egress
// proxy would (fakeChest({ network })), with the shape the directory's own
// site's tests hold (fixtures/registry-*.json; README).

const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
const answer = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "registry-search.json"), "utf8"));

// What the directory answers next; the requests it received.
let respond: (request: Request) => Response | Promise<Response> = () => Response.json(answer);
const asked: string[] = [];
let chest: FakeChest;

before(async () => {
  chest = await fakeChest({
    members: everyone,
    network: { [registryHost]: request => { asked.push(request.url); return respond(request); } },
  });
});
after(async () => { await chest.close(); });

function directory(answer: (request: Request) => Response | Promise<Response>): void {
  respond = answer;
  asked.length = 0;
}

test("the manifest declares the directory, and only it", () => {
  const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "..", "chest.json"), "utf8"));
  assert.deepEqual(manifest.network, [registryHost]);
});

test("a SIREN fills the name, the head office's address and the VAT number, through the Chest's egress", async () => {
  directory(() => Response.json(answer));
  const before = chest.egress.length;
  const found = await lookupSiren(asMember(hugo), "385 290 309");
  assert.deepEqual(asked, ["https://recherche-entreprises.api.gouv.fr/search?q=385290309&page=1&per_page=1"]);
  assert.deepEqual(chest.egress.slice(before).map(e => ({ method: e.method, url: e.url, status: e.status, refused: e.refused ?? null })), [
    { method: "GET", url: "https://recherche-entreprises.api.gouv.fr/search?q=385290309&page=1&per_page=1", status: 200, refused: null },
  ]);
  assert.deepEqual(found, {
    siren: "385290309", name: "AGENCE DE L ENVIRONNEMENT ET DE LA MAITRISE DE L ENERGIE", address: "20 AVENUE DU GRESILLE", postcode: "49000", city: "ANGERS",
    country: "FR", vatNumber: "FR24385290309", closed: false,
  });
});

test("refused before asking: a wrong SIREN, a role that adds no client", async () => {
  directory(() => Response.json(answer));
  await assert.rejects(lookupSiren(asMember(hugo), "385290308"), refused("siren_invalid"));
  await assert.rejects(lookupSiren(asMember(lea), "385290309"), refused("forbidden"));
  assert.deepEqual(asked, []);
});

test("honest failures: unreachable, refused, slow, not JSON — and a SIREN it does not know", async () => {
  const fail = (answer: () => Response | Promise<Response>) => { directory(answer); return lookupSiren(asMember(hugo), "385290309"); };
  await assert.rejects(fail(() => { throw new TypeError("fetch failed"); }), refused("registry_unreachable"));
  await assert.rejects(fail(() => new Response("", { status: 403, headers: { "Chest-Egress": "refused; reason=undeclared" } })), refused("registry_unreachable"));
  await assert.rejects(fail(() => new Response("too many", { status: 429 })), refused("registry_unreachable"));
  await assert.rejects(fail(() => { throw new DOMException("timeout", "TimeoutError"); }), refused("registry_unreachable"));
  await assert.rejects(fail(() => new Response("<html>")), refused("registry_unreachable"));
  await assert.rejects(fail(() => Response.json({ nothing: true })), refused("registry_unreachable"));
  await assert.rejects(fail(() => Response.json({ results: [], total_results: 0 })), refused("registry_not_found"));
});

test("a Chest whose egress does not let the directory through: said, never invented", async () => {
  await chest.close();
  chest = await fakeChest({ members: everyone, network: { "example.org": () => new Response("") } });
  await assert.rejects(lookupSiren(asMember(hugo), "385290309"), refused("registry_unreachable"));
  assert.equal(chest.egress.at(-1)?.url.startsWith(`https://${registryHost}/`), true);
  assert.ok(chest.egress.at(-1)?.refused);
});

test("a ceased company is said; the street is read without the town", () => {
  const closed = registered({ results: [{ ...answer.results[0], etat_administratif: "C" }] }, "385290309");
  assert.equal(closed?.closed, true);
  assert.equal(registered({ results: [{ siren: "999999999" }] }, "385290309"), null);
  assert.equal(streetOf("20 AVENUE DU GRESILLE 49000 ANGERS", "49000", "ANGERS"), "20 AVENUE DU GRESILLE");
  assert.equal(streetOf("LIEU-DIT LES CHAMPS", "12000", "RODEZ"), "LIEU-DIT LES CHAMPS");
});
