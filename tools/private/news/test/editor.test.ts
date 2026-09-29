import assert from "node:assert/strict";
import { test } from "node:test";
import { fromDoc, toDoc, type DocNode } from "../lib/editor-doc.ts";
import { parse, plain } from "../lib/markdown.ts";
import { imageRefs, pick, pieces, withNames } from "../lib/model.ts";

// The composer's editor shows the text formatted; News keeps the text with
// its few marks. What the editor writes back must read the same.
const again = (text: string) => fromDoc(toDoc(text));

test("the marks come back as they were written", () => {
  for (const text of [
    "Plain words.",
    "**Bold** and _italic_ and a [link](https://example.com/a).",
    "## A subheading",
    "- one\n- two\n- three",
    "3. third\n4. fourth",
    "> A quote\n> on two lines",
    "Line one\nline two",
    "![The team](image:12)",
    "A first paragraph.\n\nA second one.",
  ]) assert.equal(again(text), text, text);
});

test("what people type in the editor reads back the same", () => {
  const doc = (content: DocNode[]): DocNode => ({ type: "doc", content });
  const p = (...content: DocNode[]): DocNode => ({ type: "paragraph", content });
  const text = (value: string, ...marks: ("bold" | "italic")[]): DocNode => ({ type: "text", text: value, ...(marks.length ? { marks: marks.map(type => ({ type })) } : {}) });
  // Bold and italic on the same words: "_**both**_", never "***both***".
  const both = fromDoc(doc([p(text("say "), text("both", "bold", "italic"), text(" now"))]));
  assert.equal(both, "say _**both**_ now");
  assert.deepEqual(parse(both), [{ t: "p", c: [{ t: "text", v: "say " }, { t: "i", c: [{ t: "b", c: [{ t: "text", v: "both" }] }] }, { t: "text", v: " now" }] }]);
  // A space at the edge of a mark goes outside it.
  assert.equal(fromDoc(doc([p(text("bold ", "bold"), text("then"))])), "**bold** then");
  // Bold, then bold and italic inside it.
  const nested = fromDoc(doc([p(text("very ", "bold"), text("very", "bold", "italic"), text(" much", "bold"))]));
  assert.equal(plain(nested), "very very much");
  assert.equal(parse(nested)[0]!.t, "p");
  // Characters that would be marks are kept as characters.
  for (const typed of ["2 * 3 = 6", "file_name_here", "[not a link](nope)", "# not a subheading", "- not a list", "> not a quote", "1. not a list", "• not a list", "a \\ backslash"]) {
    const written = fromDoc(doc([p(text(typed))]));
    assert.equal(plain(written), typed, typed);
    assert.deepEqual(parse(written).map(b => b.t), ["p"], typed);
  }
  // A link's address with a parenthesis stays whole.
  const link = fromDoc(doc([p({ type: "text", text: "the page", marks: [{ type: "link", attrs: { href: "https://en.wikipedia.org/wiki/Paris_(France)" } }] })]));
  const read = parse(link)[0]!;
  assert.ok(read.t === "p" && read.c[0]!.t === "a" && read.c[0]!.href === "https://en.wikipedia.org/wiki/Paris_%28France%29");
  // A list inside a list is flattened: the text has one level.
  const lists = fromDoc(doc([{ type: "bulletList", content: [{ type: "listItem", content: [p(text("a")), { type: "bulletList", content: [{ type: "listItem", content: [p(text("b"))] }] }] }] }]));
  assert.equal(lists, "- a\n- b");
  // A picture from the post's files only; any other address is dropped.
  assert.equal(fromDoc(doc([{ type: "image", attrs: { src: "/chest/files/7?size=1024", alt: "Lunch [1]" } }, { type: "image", attrs: { src: "https://tracker.example/p.gif" } }])), "![Lunch 1](image:7)");
  // An empty editor is an empty text.
  assert.equal(fromDoc(toDoc("")), "");
});

test("pictures in a text are named by their file; a post's languages; mentions", () => {
  assert.deepEqual(imageRefs("![a](image:3)\n\ntext ![b](image:4)", "![c](image:3)"), ["3", "4"]);
  assert.equal(plain("Before\n\n![a](image:3)\n\nAfter"), "Before\n\nAfter");
  const post = { locale: "en", title: "Office move", body: "We move.", versions: [{ locale: "fr", title: "Déménagement", body: "Nous déménageons." }] };
  assert.equal(pick(post, "fr").title, "Déménagement");
  assert.equal(pick(post, "en").title, "Office move");
  assert.equal(pick({ ...post, versions: [] }, "fr").title, "Office move", "the post's own words when there is no version");
  const text = "Thanks @[mbr_hugoaaaaaaaaaaaaaaaaaaaaaa] and @[erased]!";
  assert.equal(withNames(text, id => (id === "erased" ? "Former member" : "Hugo")), "Thanks @Hugo and @Former member!");
  assert.deepEqual(pieces(text, () => "Hugo"), [{ t: "text", v: "Thanks " }, { t: "mention", name: "Hugo" }, { t: "text", v: " and " }, { t: "mention", name: "Hugo" }, { t: "text", v: "!" }]);
});
