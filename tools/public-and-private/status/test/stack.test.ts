import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { atLeast } from "@argentic/chest-app/testing";

// The stack's rules, checked on the sources without a server (the
// package's own checks — classes, capabilities, words — run in
// test/app.test.mjs): what the policy forbids, what the browser must never
// get, and where a visitor's address comes from.
atLeast(3);
const sources = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? sources(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
const code = sources("src").filter(f => /\.tsx?$/u.test(f)).map(file => ({ file, text: readFileSync(file, "utf8").replace(/^\s*\/\/.*$/gmu, "") }));

test("no style attribute, no <style> element, no HTML written as text: the look and the state colours are stylesheets", () => {
  for (const { file, text } of code) {
    assert.doesNotMatch(text, /\sstyle=\{/u, file);
    assert.doesNotMatch(text, /dangerouslySetInnerHTML/u, file);
    if (file.endsWith(".tsx")) assert.doesNotMatch(text, /<style[\s>]/u, file);
  }
});

test("the browser gets no server code: islands and shared components import no rule, no SDK, no database", () => {
  for (const { file, text } of code.filter(c => c.file.startsWith("src/islands/") || c.file.startsWith("src/components/"))) {
    assert.doesNotMatch(text, /^import (?!type)[^;]*from "@argentic\/chest-sdk/mu, file);
    assert.doesNotMatch(text, /^import (?!type)[^;]*from "\.\.\/(lib|actions|pages|app|layout)/mu, file);
    assert.doesNotMatch(text, /^import [^;]*from "node:/mu, file);
  }
});

test("a visitor's address only from the Chest's front (visitors.address()), never X-Forwarded-For", () => {
  for (const { file, text } of code) assert.doesNotMatch(text, /x-forwarded-for/iu, file);
});
