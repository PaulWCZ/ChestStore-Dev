import assert from "node:assert/strict";
import { test } from "node:test";
import { lines, normalize, plainText, references, safeHref, slug } from "../src/lib/doc.ts";
import { fromMarkdown, takeTitle, toMarkdown } from "../src/lib/markdown.ts";
import { render } from "../src/lib/render.ts";

const words = { title: (id: string) => (id === "7" ? "Holidays" : undefined), missing: "Page removed" };

test("links: the web, mail and the wiki's own pages and files; nothing else", () => {
  assert.equal(safeHref("https://example.com/a?b=1"), "https://example.com/a?b=1");
  assert.equal(safeHref("mailto:hr@example.com"), "mailto:hr@example.com");
  // Quotes cannot leave the attribute: the address is written encoded.
  assert.equal(safeHref('https://a.test/"onmouseover="x'), "https://a.test/%22onmouseover=%22x");
  assert.equal(safeHref("/chest/pages/12#leave"), "/chest/pages/12#leave");
  assert.equal(safeHref("/chest/files/3?download"), "/chest/files/3?download");
  for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<b>", "vbscript:x", "//evil.test", "/chest/pages/1/../../x", "https://user:pw@x.test", "ftp://x.test", "http://", "\u0000javascript:x", "javascript://%0aalert(1)"]) {
    assert.equal(safeHref(bad), null, bad);
  }
});

test("normalize keeps the known nodes and drops everything else", () => {
  const doc = normalize({
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 9 }, content: [{ type: "text", text: "Title" }] },
      { type: "script", content: [{ type: "text", text: "alert(1)" }] },
      { type: "paragraph", attrs: { onclick: "x" }, content: [
        { type: "text", text: "a", marks: [{ type: "bold" }, { type: "bold" }, { type: "evil" }] },
        { type: "text", text: "b", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] },
        { type: "pageRef", attrs: { id: "7" } },
        { type: "pageRef", attrs: { id: "x" } },
      ] },
      { type: "image", attrs: { src: "https://tracker.test/pixel.gif" } },
      { type: "image", attrs: { src: "/chest/files/4", alt: "Plan", onerror: "x" } },
      { type: "text", text: "loose text" },
      { type: "bulletList", content: [{ type: "paragraph", content: [{ type: "text", text: "not in an item" }] }] },
      { type: "table", content: [{ type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "A" }] }] }, { type: "tableHeader" }] }, { type: "tableRow", content: [{ type: "tableCell" }] }] },
    ],
  });
  assert.deepEqual(doc.content.map(n => n.type), ["heading", "paragraph", "image", "paragraph", "bulletList", "table"]);
  assert.equal(doc.content[0]!.attrs!["level"], 3);
  assert.deepEqual(doc.content[1]!.content, [{ type: "text", text: "a", marks: [{ type: "bold" }] }, { type: "text", text: "b" }, { type: "pageRef", attrs: { id: "7" } }]);
  assert.deepEqual(doc.content[2]!.attrs, { src: "/chest/files/4", alt: "Plan" });
  assert.equal(doc.content[4]!.content![0]!.type, "listItem");
  // The short row is filled to the table's width.
  assert.equal(doc.content[5]!.content![1]!.content!.length, 2);
  assert.throws(() => normalize({ type: "paragraph" }), /invalid/u);
  assert.throws(() => normalize("{not json"), /invalid/u);
  assert.deepEqual(normalize({ type: "doc" }), { type: "doc", content: [{ type: "paragraph" }] });
});

test("normalize bounds size and depth", () => {
  let deep: object = { type: "paragraph", content: [{ type: "text", text: "x" }] };
  for (let i = 0; i < 40; i++) deep = { type: "blockquote", content: [deep] };
  assert.throws(() => normalize({ type: "doc", content: [deep] }), /too_long/u);
  const big = { type: "doc", content: Array.from({ length: 50 }, () => ({ type: "paragraph", content: [{ type: "text", text: "x".repeat(10000) }] })) };
  assert.throws(() => normalize(big), /too_long/u);
});

test("render escapes every word and writes only its own elements", () => {
  const doc = normalize({ type: "doc", content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Leave <policy>" }] },
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Leave <policy>" }] },
    { type: "paragraph", content: [{ type: "text", text: "<img src=x onerror=alert(1)>", marks: [{ type: "link", attrs: { href: "https://example.com/?a=\"b\"" } }] }] },
    { type: "paragraph", content: [{ type: "pageRef", attrs: { id: "7" } }, { type: "text", text: " and " }, { type: "pageRef", attrs: { id: "8" } }] },
    { type: "callout", attrs: { tone: "warning\" onclick=\"x" }, content: [{ type: "paragraph", content: [{ type: "text", text: "Careful" }] }] },
    { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "Done" }] }] }] },
  ] });
  const { html, headings } = render(doc, words);
  assert.ok(!html.includes("<img src=x"), html);
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.ok(html.includes('href="https://example.com/?a=%22b%22"'));
  assert.ok(html.includes('<a class="page-ref" href="/chest/pages/7">Holidays</a>'));
  assert.ok(html.includes("Page removed"));
  assert.ok(html.includes('<aside class="callout info" role="note">'));
  assert.ok(html.includes("<input type=\"checkbox\" disabled checked>"));
  assert.deepEqual(headings.map(h => h.id), ["leave-policy", "leave-policy-2"]);
  assert.ok(!/on\w+=/u.test(html.replace(/onerror=alert\(1\)&gt;/u, "")));
});

test("Markdown in: headings, lists, checklists, tables, code, quotes, Notion's callouts", () => {
  const md = "# Holidays\n\nYou have **25 days** a year, see [the form](Form%20abc.md).\n\n## How\n\n1. Ask\n2. Wait\n\n- [ ] one\n- [x] two\n\n| Who | Days |\n|---|---|\n| Staff | 25 |\n\n```\ncode here\n```\n\n> quoted\n\n<aside>\n💡 Ask early!\n</aside>\n\n![Map](map.png)\n";
  const { title, doc } = takeTitle(fromMarkdown(md));
  assert.equal(title, "Holidays");
  assert.deepEqual(doc.content.map(n => n.type), ["paragraph", "heading", "orderedList", "taskList", "table", "codeBlock", "blockquote", "callout", "image"]);
  assert.equal(doc.content[3]!.content![1]!.attrs!["checked"], true);
  assert.equal(doc.content[7]!.content![0]!.content![0]!.text, "Ask early!");
  const link = doc.content[0]!.content!.find(n => n.marks?.some(m => m.type === "link"));
  assert.equal(link?.marks?.[0]?.attrs?.["href"], "Form%20abc.md");
});

test("Markdown out, and back in, keeps the page", () => {
  const doc = normalize(fromMarkdown("Intro with *style* and `code`.\n\n## Part\n\n- a\n- b\n  - nested\n\n> [!WARNING]\n> Careful\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n"));
  const out = toMarkdown(doc, { title: () => undefined, pageHref: i => `${i}.md`, fileHref: i => `files/${i}`, missing: "gone" });
  assert.ok(out.includes("Intro with *style* and `code`."), out);
  assert.ok(out.includes("> [!WARNING]\n> Careful"), out);
  assert.deepEqual(lines(normalize(fromMarkdown(out))), lines(doc));
});

test("plain text and references for search, history and links", () => {
  const doc = normalize(fromMarkdown("## Title\n\nSee [x](/chest/pages/12) and ![i](/chest/files/3)\n\n- one\n"));
  assert.equal(plainText(doc), "Title\nSee x and\ni\none");
  assert.deepEqual(references(doc), { pages: ["12"], files: ["3"] });
  assert.equal(slug("Congés d'été 2026"), "conges-d-ete-2026");
});
