import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { chest as theChest, forgetTheme, readThemeChoice } from "../src/chest.js";

const theme = () => theChest.theme();
import { fakeChest } from "../src/testing.js";

const brand = { name: "Atelier Martin", primary: "#e4572e", secondary: "#17bebb", neutral: null, corners: "round", density: "compact", display: { id: "young-serif" }, body: { family: "Atelier Sans", files: [{ url: "/_chest/theme/brand/atelier-sans.woff2", weight: "400 700", style: "normal" }] }, logo: { url: "/_chest/theme/brand/logo.svg", alt: "Atelier Martin", dark: "/_chest/theme/brand/logo-dark.svg" } };

test("outside a Chest, and on a Chest that says nothing, a tool keeps its own look", async () => {
  const saved = process.env["CHEST_API"];
  delete process.env["CHEST_API"];
  try {
    assert.deepEqual(await theme(), { mode: "own", scope: "default" });
  } finally {
    if (saved !== undefined) process.env["CHEST_API"] = saved;
  }
  const chest = await fakeChest();
  try {
    assert.deepEqual(await theme(), { mode: "own", scope: "default" });
  } finally {
    await chest.close();
  }
});

test("the company's choice for all tools, and its override for this tool", async () => {
  const chest = await fakeChest({ theme: { all: { mode: "catalogue", theme: "library" }, tools: { wiki: { mode: "own" } } } });
  try {
    // For all tools: this tool ("tool") has no override.
    assert.deepEqual(await theme(), { mode: "catalogue", theme: "library", fonts: "/_chest/theme/fonts", faces: [], scope: "chest" });
    // The fake answers max-age=0: a change shows at the next call.
    chest.theme.tools["tool"] = { mode: "brand", brand };
    const got = await theme();
    assert.equal(got.mode, "brand");
    assert.equal(got.scope, "tool");
    if (got.mode === "brand") {
      assert.deepEqual(got.brand, { ...brand, corners: "round", density: "compact" });
      assert.equal(got.fonts, "/_chest/theme/fonts");
    }
    chest.theme.tools["tool"] = { mode: "own" };
    assert.deepEqual(await theme(), { mode: "own", scope: "tool" });
    delete chest.theme.tools["tool"];
    chest.theme.all = null;
    assert.deepEqual(await theme(), { mode: "own", scope: "default" });
  } finally {
    await chest.close();
  }
});

test("an answer that is not a choice keeps the tool's own look", async () => {
  const chest = await fakeChest();
  try {
    const refused: unknown[] = [
      { mode: "catalogue", theme: "Not An Id" },
      { mode: "catalogue", theme: "library", fonts: "https://fonts.example/" },
      { mode: "catalogue", theme: "library", fonts: "/_chest/theme/../../files" },
      { mode: "catalogue", theme: "library", faces: [{ family: "x'; } body { color: red", url: "/_chest/theme/fonts/x.woff2" }] },
      { mode: "brand", brand: { ...brand, primary: "red" } },
      { mode: "brand", brand: { ...brand, secondary: "#12345" } },
      { mode: "brand", brand: { ...brand, logo: { url: "https://evil.example/logo.svg" } } },
      { mode: "brand", brand: { ...brand, logo: { url: "/_chest/files/x.fake" } } },
      { mode: "brand", brand: { ...brand, logo: { url: "/_chest/theme/brand/logo.svg", dark: "javascript:alert(1)" } } },
      { mode: "brand", brand: { ...brand, body: { family: "Atelier", files: [{ url: "/_chest/theme/brand/a.woff2\"), url(https://evil.example/" }] } } },
      { mode: "paint" },
      "own",
    ];
    for (const answer of refused) {
      chest.theme.all = answer as Record<string, unknown>;
      assert.deepEqual(await theme(), { mode: "own", scope: "default" }, JSON.stringify(answer));
      assert.equal(readThemeChoice({ ...(answer as object), scope: "chest" }), null);
    }
  } finally {
    await chest.close();
  }
});

test("the answer is kept as long as the Chest says, and a Chest without themes means own", async () => {
  let calls = 0, status = 200;
  const server = createServer((request, response) => {
    calls++;
    if (request.url !== "/theme" || status !== 200) return void response.writeHead(status).end();
    response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "max-age=60" }).end(JSON.stringify({ mode: "catalogue", theme: "newsprint", scope: "chest" }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const saved = process.env["CHEST_API"];
  process.env["CHEST_API"] = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  forgetTheme();
  try {
    const [a, b] = await Promise.all([theme(), theme()]);
    assert.deepEqual(a, b);
    assert.equal((await theme()).mode, "catalogue");
    assert.equal(calls, 1, "one question for concurrent and repeated calls within max-age");
    forgetTheme();
    status = 404;
    assert.deepEqual(await theme(), { mode: "own", scope: "default" });
    assert.equal(calls, 2);
  } finally {
    if (saved === undefined) delete process.env["CHEST_API"];
    else process.env["CHEST_API"] = saved;
    forgetTheme();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("the fake Chest's front serves the look's files, and nothing else under /_chest/theme/", async () => {
  const chest = await fakeChest({ themeFiles: { "brand/logo.svg": { data: "<svg xmlns=\"http://www.w3.org/2000/svg\"/>", type: "image/svg+xml" } } });
  try {
    const logo = await fetch(chest.api + "/_chest/theme/brand/logo.svg");
    assert.equal(logo.status, 200);
    assert.equal(logo.headers.get("content-type"), "image/svg+xml");
    assert.match(await logo.text(), /<svg/u);
    const missing = await fetch(chest.api + "/_chest/theme/fonts/none.woff2");
    assert.equal(missing.status, 404);
    await missing.body?.cancel();
    const escape = await fetch(chest.api + "/_chest/theme/brand/..%2F..%2Ffiles");
    assert.equal(escape.status, 404);
    await escape.body?.cancel();
  } finally {
    await chest.close();
  }
});
