import assert from "node:assert/strict";
import { test } from "node:test";
import { inline, markdown } from "../lib/markdown.ts";

test("the description's Markdown: headings, lists, bold, italic, code, links", () => {
  const blocks = markdown("# Plan\nCall **the client** at *3pm*.\nSee https://example.com/a.\n\n- one\n- two with `code`\n1. first\n2. second");
  assert.deepEqual(blocks.map(b => b.type), ["heading", "paragraph", "list", "list"]);
  const p = blocks[1]!;
  assert.ok(p.type === "paragraph");
  assert.deepEqual(p.lines[0], [{ type: "text", text: "Call " }, { type: "strong", children: [{ type: "text", text: "the client" }] }, { type: "text", text: " at " }, { type: "em", children: [{ type: "text", text: "3pm" }] }, { type: "text", text: "." }]);
  assert.deepEqual(p.lines[1], [{ type: "text", text: "See " }, { type: "link", href: "https://example.com/a", children: [{ type: "text", text: "https://example.com/a" }] }, { type: "text", text: "." }]);
  const [ul, ol] = [blocks[2]!, blocks[3]!];
  assert.ok(ul.type === "list" && !ul.ordered && ul.items.length === 2);
  assert.ok(ol.type === "list" && ol.ordered && ol.items.length === 2);
});

test("nothing typed becomes a script: only http and https links, HTML stays text", () => {
  assert.deepEqual(inline("[click](javascript:alert(1))"), [{ type: "text", text: "[click](javascript:alert(1))" }]);
  assert.deepEqual(inline("<img src=x onerror=alert(1)>"), [{ type: "text", text: "<img src=x onerror=alert(1)>" }]);
  assert.deepEqual(inline("[site](https://example.com)"), [{ type: "link", href: "https://example.com/", children: [{ type: "text", text: "site" }] }]);
  // A lone star, snake_case and 2*3*4 stay as they are.
  assert.deepEqual(inline("a * b, snake_case_name"), [{ type: "text", text: "a * b, snake_case_name" }]);
});
