import assert from "node:assert/strict";
import { test } from "node:test";
import { fromEditor, parse, toHtml, type EditorNode } from "../src/shared/rich-text.ts";

// A small DOM, as the browser's editor gives it.
const text = (value: string): EditorNode => ({ nodeType: 3, nodeName: "#text", textContent: value, childNodes: [] });
const el = (name: string, ...kids: EditorNode[]): EditorNode => ({ nodeType: 1, nodeName: name, textContent: kids.map(k => k.textContent ?? "").join(""), childNodes: kids });
const root = (...kids: EditorNode[]) => el("DIV", ...kids);

test("the job editor starts from the marks, every text escaped — no HTML ever comes from the stored text", () => {
  const html = toHtml("## What you will do\n- Build **chairs**\n- Sand <things>\n\nA paragraph\nwith two lines");
  assert.equal(html, "<h3>What you will do</h3><ul><li>Build <strong>chairs</strong></li><li>Sand &lt;things&gt;</li></ul><p>A paragraph<br>with two lines</p>");
  assert.ok(!toHtml('<script>alert("x")</script>').includes("<script"));
});

test("what the editor holds is read back into the same marks: headings, bold, lists, paragraphs, line breaks", () => {
  const dom = root(
    el("H3", text("What you will do")),
    el("UL", el("LI", text("Build "), el("B", text("chairs"))), el("LI", text("Sand wood"))),
    el("P", text("A paragraph"), el("BR"), text("with two lines")),
    el("OL", el("LI", text("One")), el("LI", text("Two"))),
    el("DIV", text("A browser's "), el("STRONG", text("bold ")), text("line")),
  );
  const source = fromEditor(dom);
  assert.equal(source, "## What you will do\n\n- Build **chairs**\n- Sand wood\n\nA paragraph\nwith two lines\n\n1. One\n2. Two\n\nA browser's **bold** line");
  // Round trip: the marks give the same blocks again.
  assert.deepEqual(parse(fromEditor(root(el("P", text("x"))))), parse("x"));
  assert.deepEqual(parse(source), parse(fromEditor({ ...root(), childNodes: [] }) + source));
  // Loose text at the top (a first line typed before any paragraph) is kept.
  assert.equal(fromEditor(root(text("First line"), el("P", text("Second")))), "First line\n\nSecond");
  assert.equal(fromEditor(root()), "");
});
