import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { atLeast, checkSources, checkWords } from "@argentic/chest-app/testing";
import { en } from "../src/i18n/en.ts";
import { fr } from "../src/i18n/fr.ts";

// The stack's rules, read in the sources without a server (Node runs .ts
// as is): what the policy and the browser's bundle forbid, the package's
// rules of the sources and the words.
atLeast(4);
const sources = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? sources(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));

test("the package's rules hold: no style={}, no server code in islands, no colour in CSS, known classes, capabilities used and declared", () => {
  checkSources();
});

test("every language says every text, with the same {placeholders}; French typography", () => {
  checkWords({ en, fr });
});

test("the browser never gets the SDK nor the server's code; HTML written as text only where the Chest cleaned it", () => {
  for (const file of sources("src").filter(f => /\.tsx?$/u.test(f))) {
    const text = readFileSync(file, "utf8");
    // A received email's HTML, as the Chest cleaned it, shown on demand.
    if (file !== "src/islands/FormattedBody.tsx") assert.doesNotMatch(text, /dangerouslySetInnerHTML/u, `${file}: no HTML written as text`);
    if (file.startsWith("src/islands/") || file === "src/entry.tsx" || file.startsWith("src/components/") || file.startsWith("src/shared/")) {
      assert.doesNotMatch(text, /^import (?!type)[^;]*from "@argentic\/chest-sdk/mu, `${file}: the SDK is for the server only`);
      assert.doesNotMatch(text, /^import (?!type)[^;]*from "\.\.\/(lib|actions|pages|theme|app|i18n)/mu, `${file}: server code in the browser`);
      assert.doesNotMatch(text, /^import (?!type)[^;]*from "@argentic\/chest-app(\/(db|members|testing|vite))?"/mu, `${file}: the package's server side in the browser`);
    }
  }
});

test("the look is a stylesheet: no <style> element, no inline script anywhere in the pages; no Next.js left", () => {
  for (const file of sources("src").filter(f => f.endsWith(".tsx"))) {
    const text = readFileSync(file, "utf8").replace(/^\s*\/\/.*$/gmu, "");
    assert.doesNotMatch(text, /<style[\s>]/u, file);
    assert.doesNotMatch(text, /<script/u, file);
    assert.doesNotMatch(text, /from "next[/"]/u, file);
  }
});
