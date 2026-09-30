import assert from "node:assert/strict";
import { test } from "node:test";
import { chest, readToolUrls } from "../src/chest.js";
import { fakeChest } from "../src/testing.js";

const names = ["CHEST_TOOL", "CHEST_TOOL_URLS", "CHEST_TEAM_URL", "CHEST_PUBLIC_URL"];
function withEnv(values: Record<string, string | undefined>, body: () => void): void {
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    for (const [name, value] of Object.entries(values)) if (value !== undefined) process.env[name] = value;
    body();
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

const map = {
  forms: { team: "https://forms-chest.atelier.argentic.work", public: "https://forms.atelier.argentic.work/" },
  crm: { team: "https://crm-chest.atelier.argentic.work" },
  "time-sheets": { team: "https://time-sheets-chest.atelier.argentic.work:8443", public: null },
};

test("toolUrl answers the origins the Chest gives, by surface", () => {
  withEnv({ CHEST_TOOL: "helpdesk", CHEST_TOOL_URLS: JSON.stringify(map) }, () => {
    assert.equal(chest.toolUrl("forms"), "https://forms-chest.atelier.argentic.work");
    assert.equal(chest.toolUrl("forms", { surface: "team" }), "https://forms-chest.atelier.argentic.work");
    assert.equal(chest.toolUrl("forms", { surface: "public" }), "https://forms.atelier.argentic.work", "a trailing slash is an origin still");
    assert.equal(chest.toolUrl("crm", { surface: "public" }), null, "no public part (or a closed one): no public address");
    assert.equal(chest.toolUrl("time-sheets"), "https://time-sheets-chest.atelier.argentic.work:8443");
    assert.equal(chest.toolUrl("wiki"), null, "not installed");
  });
});

test("toolUrl is null outside a Chest, and for what is not a tool's name", () => {
  withEnv({}, () => {
    assert.equal(chest.toolUrl("forms"), null);
    assert.equal(chest.toolLink("forms", "/chest"), null);
  });
  withEnv({ CHEST_TOOL_URLS: JSON.stringify(map) }, () => {
    for (const name of ["Forms", "forms ", "../forms", "forms/x", "-forms", "forms-", "a--b", "", "x".repeat(64), "__proto__", "constructor"]) {
      assert.equal(chest.toolUrl(name), null, name);
    }
    assert.equal(chest.toolUrl("forms", { surface: "admin" as "team" }), null);
  });
});

test("an address that is not an origin is ignored, entry by entry", () => {
  const given = {
    plain: { team: "http://plain-chest.atelier.fr" },
    path: { team: "https://path-chest.atelier.fr/chest" },
    query: { team: "https://query-chest.atelier.fr/?x=1" },
    empty: { team: "https://empty-chest.atelier.fr?" },
    hash: { team: "https://hash-chest.atelier.fr#x" },
    user: { team: "https://me:pw@user-chest.atelier.fr" },
    js: { team: "javascript:alert(1)" },
    data: { team: "data:text/html,<p>" },
    slashes: { team: "https:\\\\evil.example" },
    number: { team: 42 },
    list: ["https://list-chest.atelier.fr"],
    "Upper": { team: "https://upper-chest.atelier.fr" },
    mixed: { team: "https://mixed-chest.atelier.fr", public: "ftp://mixed.atelier.fr" },
    local: { team: "http://localhost:4100", public: "http://127.0.0.1:4200" },
  };
  withEnv({ CHEST_TOOL_URLS: JSON.stringify(given) }, () => {
    for (const name of ["plain", "path", "query", "empty", "hash", "user", "js", "data", "slashes", "number", "list", "Upper"]) assert.equal(chest.toolUrl(name), null, name);
    assert.equal(chest.toolUrl("mixed"), "https://mixed-chest.atelier.fr", "the good address of an entry stays");
    assert.equal(chest.toolUrl("mixed", { surface: "public" }), null);
    assert.equal(chest.toolUrl("local"), "http://localhost:4100", "http for a local harness only");
    assert.equal(chest.toolUrl("local", { surface: "public" }), "http://127.0.0.1:4200");
  });
  for (const raw of ["not json", "[]", "null", "\"https://forms-chest.x\"", JSON.stringify({ forms: map.forms, pad: "x".repeat(70 * 1024) })]) {
    withEnv({ CHEST_TOOL_URLS: raw }, () => assert.equal(chest.toolUrl("forms"), null, raw.slice(0, 20)));
  }
  assert.deepEqual([...readToolUrls(JSON.stringify(map)).keys()], ["forms", "crm", "time-sheets"]);
});

test("the tool's own name answers its own addresses", () => {
  withEnv({ CHEST_TOOL: "helpdesk", CHEST_TEAM_URL: "https://helpdesk-chest.atelier.fr", CHEST_PUBLIC_URL: "https://support.atelier.fr" }, () => {
    assert.equal(chest.toolUrl("helpdesk"), "https://helpdesk-chest.atelier.fr");
    assert.equal(chest.toolUrl("helpdesk", { surface: "public" }), "https://support.atelier.fr");
  });
});

test("toolLink joins an origin and a path the Chest's front accepts", () => {
  withEnv({ CHEST_TOOL: "crm", CHEST_TOOL_URLS: JSON.stringify(map) }, () => {
    assert.equal(chest.toolLink("forms", "/chest/forms/5/answers/k3abc"), "https://forms-chest.atelier.argentic.work/chest/forms/5/answers/k3abc");
    assert.equal(chest.toolLink("forms", "/chest"), "https://forms-chest.atelier.argentic.work/chest");
    assert.equal(chest.toolLink("forms", "/chest?tab=answers#last"), "https://forms-chest.atelier.argentic.work/chest?tab=answers#last");
    assert.equal(chest.toolLink("forms", "/f/contact", { surface: "public" }), "https://forms.atelier.argentic.work/f/contact");
    assert.equal(chest.toolLink("forms", "/", { surface: "public" }), "https://forms.atelier.argentic.work/");
    // Never another host, never a path the front refuses.
    for (const path of ["//evil.example/chest", "/\\evil.example", "https://evil.example/chest", "chest/forms", "", "/chest/../admin", "/chest/%2e%2e/x", "/chest/./x", "/chest/a%2Fb", "/chest/a%5cb", "/chest/%00", "/chest/a b", "/chest/é", "/chest/\n", "/chest//x", "/chest/" + "a".repeat(600)]) {
      assert.equal(chest.toolLink("forms", path), null, JSON.stringify(path));
      assert.equal(chest.toolLink("forms", path, { surface: "public" }), null, JSON.stringify(path));
    }
    // A member reaches a team host under /chest only; a public host's /chest
    // is the team host's.
    assert.equal(chest.toolLink("forms", "/f/contact"), null);
    assert.equal(chest.toolLink("forms", "/chestnut"), null);
    assert.equal(chest.toolLink("forms", "/chest/forms", { surface: "public" }), null);
    assert.equal(chest.toolLink("forms", "/CHEST/forms", { surface: "public" }), null);
    // No such tool, no such surface: no link.
    assert.equal(chest.toolLink("wiki", "/chest"), null);
    assert.equal(chest.toolLink("crm", "/", { surface: "public" }), null);
    assert.equal(chest.toolLink(null as unknown as string, "/chest"), null);
    assert.equal(chest.toolLink("forms", undefined as unknown as string), null);
  });
});

test("the map is read again when the Chest rewrites it", () => {
  withEnv({ CHEST_TOOL_URLS: JSON.stringify(map) }, () => {
    assert.equal(chest.toolUrl("crm"), "https://crm-chest.atelier.argentic.work");
    process.env["CHEST_TOOL_URLS"] = JSON.stringify({ forms: map.forms });
    assert.equal(chest.toolUrl("crm"), null, "removed");
  });
});

test("fakeChest installs the tools a test names, and plays installs and removals", async () => {
  const before = process.env["CHEST_TOOL_URLS"];
  const fake = await fakeChest({ chest: { publicUrl: "https://tool.chest.test" }, tools: { forms: { public: "https://forms.chest.test" }, crm: true, wiki: { team: "http://localhost:4100" } } });
  try {
    assert.equal(chest.toolUrl("forms"), "https://forms-chest.chest.test");
    assert.equal(chest.toolUrl("forms", { surface: "public" }), "https://forms.chest.test");
    assert.equal(chest.toolUrl("crm"), "https://crm-chest.chest.test");
    assert.equal(chest.toolUrl("crm", { surface: "public" }), null);
    assert.equal(chest.toolUrl("wiki"), "http://localhost:4100");
    assert.equal(chest.toolUrl(fake.tool), "https://tool-chest.chest.test", "this tool, at the fake's origin");
    assert.equal(chest.toolUrl(fake.tool, { surface: "public" }), "https://tool.chest.test");
    assert.deepEqual(Object.keys(fake.tools), [fake.tool, "forms", "crm", "wiki"]);
    assert.equal(chest.toolLink("forms", "/chest/forms/5/answers/k3abc"), "https://forms-chest.chest.test/chest/forms/5/answers/k3abc");

    fake.removeTool("forms");
    assert.equal(chest.toolUrl("forms"), null);
    assert.equal(chest.toolLink("forms", "/chest"), null);
    fake.installTool("helpdesk", { public: "https://support.chest.test" });
    assert.equal(chest.toolUrl("helpdesk"), "https://helpdesk-chest.chest.test");
    assert.equal(chest.toolUrl("helpdesk", { surface: "public" }), "https://support.chest.test");
    fake.installTool("status", { team: null, public: "https://status.chest.test" });
    assert.equal(chest.toolUrl("status"), null);
    assert.equal(chest.toolUrl("status", { surface: "public" }), "https://status.chest.test");

    assert.throws(() => fake.installTool("Not A Tool"), /not a tool's name/u);
    assert.throws(() => fake.installTool(fake.tool), /already installed/u);
    assert.throws(() => fake.removeTool(fake.tool), /not this tool/u);
  } finally {
    await fake.close();
  }
  assert.equal(process.env["CHEST_TOOL_URLS"], before, "the environment is restored");
});

test("a fakeChest without tools knows only this tool", async () => {
  const fake = await fakeChest();
  try {
    assert.deepEqual(Object.keys(fake.tools), [fake.tool]);
    assert.equal(chest.toolUrl("forms"), null);
    assert.equal(chest.toolUrl(fake.tool), "https://tool-chest.chest.test");
    assert.equal(chest.toolUrl(fake.tool, { surface: "public" }), null);
  } finally {
    await fake.close();
  }
});
