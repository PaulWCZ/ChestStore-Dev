import assert from "node:assert/strict";
import { test } from "node:test";
import { chest, readToolUrls } from "../chest.js";
import { fakeChest } from "../testing.js";

// chest.tools: the addresses of the other tools of the Chest, in 0.4.1's
// chest.tool shape ({teamUrl, publicUrl}), from CHEST_TOOL_URLS.

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
  forms: { teamUrl: "https://forms-chest.atelier.argentic.work", publicUrl: "https://forms.atelier.argentic.work" },
  crm: { teamUrl: "https://crm-chest.atelier.argentic.work" },
  "time-sheets": { teamUrl: "https://time-sheets-chest.atelier.argentic.work:8443", publicUrl: null },
};
const url = (name: string, surface: "team" | "public" = "team") => {
  const found = chest.tools.get(name);
  return found === null ? null : surface === "team" ? found.teamUrl : found.publicUrl;
};

test("tools.get answers the addresses the Chest gives, in chest.tool's shape", () => {
  withEnv({ CHEST_TOOL: "helpdesk", CHEST_TOOL_URLS: JSON.stringify(map) }, () => {
    assert.deepEqual(chest.tools.get("forms"), { teamUrl: "https://forms-chest.atelier.argentic.work", publicUrl: "https://forms.atelier.argentic.work" });
    assert.deepEqual(chest.tools.get("crm"), { teamUrl: "https://crm-chest.atelier.argentic.work", publicUrl: null }, "no public part (or a closed one): no public address");
    assert.equal(url("time-sheets"), "https://time-sheets-chest.atelier.argentic.work:8443");
    assert.equal(chest.tools.get("wiki"), null, "not installed");
  });
});

test("tools.get is null outside a Chest, and for what is not a tool's name", () => {
  withEnv({}, () => {
    assert.equal(chest.tools.get("forms"), null);
    assert.equal(chest.tools.link("forms", "/chest"), null);
  });
  withEnv({ CHEST_TOOL_URLS: JSON.stringify(map) }, () => {
    for (const name of ["Forms", "forms ", "../forms", "forms/x", "-forms", "1forms", "", "x".repeat(49), "__proto__", "constructor"]) {
      assert.equal(chest.tools.get(name), null, name);
    }
    assert.equal(chest.tools.link("forms", "/chest", { surface: "admin" as "team" }), null);
  });
});

test("an address that is not an origin as 0.4.1 reads them is ignored, entry by entry", () => {
  const given = {
    plain: { teamUrl: "http://plain-chest.atelier.fr" },
    path: { teamUrl: "https://path-chest.atelier.fr/chest" },
    slash: { teamUrl: "https://slash-chest.atelier.fr/" },
    query: { teamUrl: "https://query-chest.atelier.fr/?x=1" },
    hash: { teamUrl: "https://hash-chest.atelier.fr#x" },
    user: { teamUrl: "https://me:pw@user-chest.atelier.fr" },
    upper: { teamUrl: "https://Upper-chest.atelier.fr" },
    js: { teamUrl: "javascript:alert(1)" },
    number: { teamUrl: 42 },
    list: ["https://list-chest.atelier.fr"],
    "Upper": { teamUrl: "https://upper-chest.atelier.fr" },
    old: { team: "https://old-chest.atelier.fr" },
    local: { teamUrl: "http://localhost:4100" },
    mixed: { teamUrl: "https://mixed-chest.atelier.fr", publicUrl: "ftp://mixed.atelier.fr" },
  };
  withEnv({ CHEST_TOOL_URLS: JSON.stringify(given) }, () => {
    for (const name of ["plain", "path", "slash", "query", "hash", "user", "upper", "js", "number", "list", "Upper", "old", "local"]) assert.equal(chest.tools.get(name), null, name);
    assert.deepEqual(chest.tools.get("mixed"), { teamUrl: "https://mixed-chest.atelier.fr", publicUrl: null }, "a public address that is not one reads as none");
  });
  for (const raw of ["not json", "[]", "null", "\"https://forms-chest.x\"", JSON.stringify({ forms: map.forms, pad: "x".repeat(70 * 1024) })]) {
    withEnv({ CHEST_TOOL_URLS: raw }, () => assert.equal(chest.tools.get("forms"), null, raw.slice(0, 20)));
  }
  assert.deepEqual([...readToolUrls(JSON.stringify(map)).keys()], ["forms", "crm", "time-sheets"]);
});

test("the tool's own name answers chest.tool", () => {
  withEnv({ CHEST_TOOL: "helpdesk", CHEST_TEAM_URL: "https://helpdesk-chest.atelier.fr", CHEST_PUBLIC_URL: "https://support.atelier.fr" }, () => {
    assert.deepEqual(chest.tools.get("helpdesk"), { teamUrl: "https://helpdesk-chest.atelier.fr", publicUrl: "https://support.atelier.fr" });
    assert.deepEqual(chest.tools.get("helpdesk"), chest.tool);
  });
  withEnv({ CHEST_TOOL: "helpdesk" }, () => assert.equal(chest.tools.get("helpdesk"), null, "outside a Chest: null, never a throw"));
});

test("tools.link joins an origin and a path the Chest's front accepts", () => {
  withEnv({ CHEST_TOOL: "crm", CHEST_TOOL_URLS: JSON.stringify(map) }, () => {
    assert.equal(chest.tools.link("forms", "/chest/forms/5/answers/k3abc"), "https://forms-chest.atelier.argentic.work/chest/forms/5/answers/k3abc");
    assert.equal(chest.tools.link("forms", "/chest"), "https://forms-chest.atelier.argentic.work/chest");
    assert.equal(chest.tools.link("forms", "/chest?tab=answers#last"), "https://forms-chest.atelier.argentic.work/chest?tab=answers#last");
    assert.equal(chest.tools.link("forms", "/f/contact", { surface: "public" }), "https://forms.atelier.argentic.work/f/contact");
    assert.equal(chest.tools.link("forms", "/", { surface: "public" }), "https://forms.atelier.argentic.work/");
    // Never another host, never a path the front refuses.
    for (const path of ["//evil.example/chest", "/\\evil.example", "https://evil.example/chest", "chest/forms", "", "/chest/../admin", "/chest/%2e%2e/x", "/chest/./x", "/chest/a%2Fb", "/chest/a%5cb", "/chest/%00", "/chest/a b", "/chest/é", "/chest/\n", "/chest//x", "/chest/" + "a".repeat(600)]) {
      assert.equal(chest.tools.link("forms", path), null, JSON.stringify(path));
      assert.equal(chest.tools.link("forms", path, { surface: "public" }), null, JSON.stringify(path));
    }
    // A member reaches a team host under /chest only; a public host's /chest
    // is the team host's.
    assert.equal(chest.tools.link("forms", "/f/contact"), null);
    assert.equal(chest.tools.link("forms", "/chestnut"), null);
    assert.equal(chest.tools.link("forms", "/chest/forms", { surface: "public" }), null);
    assert.equal(chest.tools.link("forms", "/CHEST/forms", { surface: "public" }), null);
    // No such tool, no such surface: no link.
    assert.equal(chest.tools.link("wiki", "/chest"), null);
    assert.equal(chest.tools.link("crm", "/", { surface: "public" }), null);
    assert.equal(chest.tools.link(null as unknown as string, "/chest"), null);
    assert.equal(chest.tools.link("forms", undefined as unknown as string), null);
  });
});

test("the map is read again when the Chest rewrites it", () => {
  withEnv({ CHEST_TOOL_URLS: JSON.stringify(map) }, () => {
    assert.equal(url("crm"), "https://crm-chest.atelier.argentic.work");
    process.env["CHEST_TOOL_URLS"] = JSON.stringify({ forms: map.forms });
    assert.equal(chest.tools.get("crm"), null, "removed");
  });
});

test("fakeChest installs the tools a test names, and plays installs and removals", async () => {
  const before = process.env["CHEST_TOOL_URLS"];
  const fake = await fakeChest({ chest: { publicUrl: "https://tool.chest.test" }, tools: { forms: { publicUrl: "https://forms.chest.test" }, crm: true, wiki: { teamUrl: "https://wiki.atelier.fr" } } });
  try {
    assert.deepEqual(chest.tools.get("forms"), { teamUrl: "https://forms-chest.chest.test", publicUrl: "https://forms.chest.test" });
    assert.deepEqual(chest.tools.get("crm"), { teamUrl: "https://crm-chest.chest.test", publicUrl: null });
    assert.equal(url("wiki"), "https://wiki.atelier.fr");
    assert.deepEqual(chest.tools.get(fake.tool), { teamUrl: "https://tool-chest.chest.test", publicUrl: "https://tool.chest.test" }, "this tool: chest.tool");
    assert.deepEqual(Object.keys(fake.tools), [fake.tool, "forms", "crm", "wiki"]);
    assert.equal(chest.tools.link("forms", "/chest/forms/5/answers/k3abc"), "https://forms-chest.chest.test/chest/forms/5/answers/k3abc");

    fake.removeTool("forms");
    assert.equal(chest.tools.get("forms"), null);
    assert.equal(chest.tools.link("forms", "/chest"), null);
    fake.installTool("helpdesk", { publicUrl: "https://support.chest.test" });
    assert.deepEqual(chest.tools.get("helpdesk"), { teamUrl: "https://helpdesk-chest.chest.test", publicUrl: "https://support.chest.test" });

    assert.throws(() => fake.installTool("Not A Tool"), /not a tool's name/u);
    assert.throws(() => fake.installTool(fake.tool), /already installed/u);
    assert.throws(() => fake.removeTool(fake.tool), /not this tool/u);
  } finally {
    await fake.close();
  }
  assert.equal(process.env["CHEST_TOOL_URLS"], before, "the environment is restored");
});

test("a fakeChest without tools knows only this tool", async () => {
  const fake = await fakeChest({ chest: { publicUrl: null } });
  try {
    assert.deepEqual(Object.keys(fake.tools), [fake.tool]);
    assert.equal(chest.tools.get("forms"), null);
    assert.deepEqual(chest.tools.get(fake.tool), { teamUrl: "https://tool-chest.chest.test", publicUrl: null });
  } finally {
    await fake.close();
  }
});
