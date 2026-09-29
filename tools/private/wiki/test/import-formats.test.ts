import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { lines, references } from "../lib/doc.ts";
import { fileOf } from "../lib/files.ts";
import { importFiles } from "../lib/importer.ts";
import * as pages from "../lib/pages.ts";
import { search } from "../lib/search.ts";
import { writeZip } from "../lib/zip.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { everyone, hugo, ines } from "./support/members.ts";

// Imports from HTML, with files shaped as the competitors' own exports
// (test/fixtures, see THIRD_PARTY.md for the formats' documentation):
// - confluence/: a Confluence space exported as HTML (Space settings →
//   Export space → HTML): a folder named by the space's key, index.html
//   with "Available Pages" (each child in a list of its own), one file per
//   page ("Title_<id>.html", or "<id>.html"), its content in
//   #main-content, breadcrumbs, attachments/<page id>/<id>.<ext>, and the
//   export's styles and icons;
// - google-docs/: a Google Docs document downloaded as "Web page (.html,
//   zipped)": the document with its styles as classes, images/.

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
});
after(async () => {
  await chest.close();
  await database.close();
});

// A folder of fixtures as a zip, as the export comes.
function zipOf(folder: string, prefix = ""): Uint8Array {
  const root = join(import.meta.dirname, "fixtures", folder);
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(f => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
  return writeZip(walk(root).map(f => ({ name: prefix + relative(root, f), data: readFileSync(f) })));
}
const words = { untitled: "Untitled", attachments: "Attachments" };
const texts = (doc: Parameters<typeof lines>[0]) => lines(doc).join("\n");

test("a Confluence space export (HTML zip) becomes a space: its tree, titles, links by page id, macros, images and attachments", async () => {
  const { sql } = database;
  const result = await importFiles(sql, asMember(ines), { spaceName: "Handbook", files: [{ name: "Confluence-space-export-101010.html.zip", data: zipOf("confluence") }], words });
  assert.equal(result.pages, 5);
  assert.equal(result.files, 2); // the office map (shown) and the leave form (listed)
  // Styles, icons and the index are the export's furniture: not pages, not "left out".
  assert.deepEqual(result.skipped, { files: [], images: 0 });
  const nodes = await pages.tree(sql, asMember(hugo), [result.spaceId]);
  const by = new Map(nodes.map(n => [n.title, n]));
  assert.deepEqual([...by.keys()].sort(), ["Congés et absences", "Handbook home", "Holidays and time off", "IT setup", "Wi-Fi and printers"]);
  const home = by.get("Handbook home")!;
  assert.equal(home.parentId, null);
  // The tree of index.html, in the space's order.
  assert.deepEqual(nodes.filter(n => n.parentId === home.id).map(n => n.title), ["Holidays and time off", "IT setup", "Congés et absences"]);
  assert.equal(by.get("Wi-Fi and printers")!.parentId, by.get("IT setup")!.id);
  assert.equal(result.firstPageId, home.id);

  const page = await pages.page(sql, asMember(hugo), home.id);
  const text = texts(page.doc);
  // Links to other pages, by file and by Confluence's page id; a mention is a name; an emoticon its text; no script.
  assert.deepEqual(references(page.doc).pages.sort(), [by.get("Holidays and time off")!.id, by.get("IT setup")!.id].sort());
  assert.ok(text.includes("Ask Sofia Laurent."), text);
  assert.ok(text.includes("(smile)"));
  assert.ok(!text.includes("alert"));
  const types = page.doc.content.map(n => n.type);
  assert.deepEqual(types, ["paragraph", "callout", "heading", "taskList", "image", "table", "codeBlock"]);
  assert.deepEqual(page.doc.content[3]!.content!.map(i => i.attrs?.["checked"]), [false, true]);
  assert.equal(page.doc.content[6]!.attrs?.["language"], "bash");
  assert.equal(page.doc.content[6]!.content![0]!.text, "ssh you@office.lumen.fr\nls ~/shared");
  // The image is a file of the wiki, named as in Confluence.
  const image = await fileOf(sql, asMember(hugo), references(page.doc).files[0]!);
  assert.equal(image.image, true);
  assert.equal(image.fileName, "office-map.png");
  assert.ok(chest.files.has(image.object));

  // Note macro → a warning box with its title; expand → its words; the table of contents goes.
  const holidays = await pages.page(sql, asMember(hugo), by.get("Holidays and time off")!.id);
  assert.deepEqual(holidays.doc.content.map(n => n.type), ["paragraph", "heading", "orderedList", "callout", "paragraph", "paragraph", "heading", "bulletList"]);
  assert.equal(holidays.doc.content[3]!.attrs?.["tone"], "warning");
  const hText = texts(holidays.doc);
  assert.ok(hText.includes("Sick days") && hText.includes("What about public holidays?") && hText.includes("on top of the 25 days"), hText);
  // The form only listed in Confluence's attachments: linked at the end, a file of the page.
  assert.ok(hText.includes("Attachments") && hText.includes("Leave-request-form.pdf"));
  const form = await fileOf(sql, asMember(hugo), references(holidays.doc).files[0]!);
  assert.equal(form.fileName, "Leave-request-form.pdf");
  assert.equal(form.type, "application/pdf");

  // A panel is a note box; French words stay as they are; search finds them.
  const wifi = await pages.page(sql, asMember(hugo), by.get("Wi-Fi and printers")!.id);
  assert.ok(wifi.doc.content.some(n => n.type === "callout"));
  const conges = await pages.page(sql, asMember(hugo), by.get("Congés et absences")!.id);
  assert.deepEqual(conges.doc.content.map(n => n.type), ["paragraph", "blockquote"]);
  assert.equal((await search(sql, asMember(hugo), "conges absences"))[0]?.id, conges.id);
  assert.equal((await search(sql, asMember(hugo), "wifi"))[0]?.id, wifi.id);
});

test("a Confluence export without its index keeps its tree from the breadcrumbs", async () => {
  const { sql } = database;
  const root = join(import.meta.dirname, "fixtures", "confluence", "HB");
  const files = ["Handbook-home_65538.html", "IT-setup_65546.html", "Wi-Fi-and-printers_65544.html"].map(f => ({ name: f, data: readFileSync(join(root, f)) }));
  const result = await importFiles(sql, asMember(ines), { spaceName: "Loose", files, words });
  const nodes = await pages.tree(sql, asMember(hugo), [result.spaceId]);
  const by = new Map(nodes.map(n => [n.title, n]));
  assert.equal(by.get("IT setup")!.parentId, by.get("Handbook home")!.id);
  assert.equal(by.get("Wi-Fi and printers")!.parentId, by.get("IT setup")!.id);
  // Its image did not come with it: said, not broken.
  assert.equal(result.skipped.images, 1);
});

test("a Google Docs web page download: its title, bold and italics from its styles, lists, images, links without Google's redirect", async () => {
  const { sql } = database;
  const result = await importFiles(sql, asMember(ines), { spaceName: "Docs", files: [{ name: "Reglementinterieur.zip", data: zipOf("google-docs") }], words });
  assert.equal(result.pages, 1);
  assert.equal(result.files, 1);
  const page = await pages.page(sql, asMember(hugo), result.firstPageId!);
  assert.equal(page.title, "Règlement intérieur");
  assert.deepEqual(page.doc.content.map(n => n.type), ["paragraph", "heading", "paragraph", "bulletList", "heading", "image", "paragraph"]);
  const first = page.doc.content[0]!.content!;
  assert.deepEqual(first.find(n => n.text === "1er janvier 2026")?.marks, [{ type: "bold" }]);
  assert.deepEqual(page.doc.content[2]!.content!.find(n => n.text === "Le badge est obligatoire.")?.marks, [{ type: "italic" }]);
  const link = page.doc.content[6]!.content!.find(n => n.marks?.some(m => m.type === "link"));
  assert.equal(link?.marks?.[0]?.attrs?.["href"], "https://www.service-public.fr/particuliers/vosdroits/F1905");
});

test("hostile HTML keeps nothing active: scripts, event handlers, javascript: links and outside images go", async () => {
  const { sql } = database;
  const html = `<html><head><title>Bad</title><script>alert(1)</script></head><body><h1>Hello</h1><p onclick="alert(2)">Hi <a href="javascript:alert(3)">click</a> <img src="https://tracker.test/p.gif"><iframe src="https://x.test"></iframe></p><style>p{}</style></body></html>`;
  const result = await importFiles(sql, asMember(ines), { spaceName: "Bad", files: [{ name: "bad.html", data: new TextEncoder().encode(html) }], words });
  const page = await pages.page(sql, asMember(hugo), result.firstPageId!);
  assert.equal(page.title, "Hello");
  assert.equal(JSON.stringify(page.doc).includes("javascript"), false);
  assert.equal(JSON.stringify(page.doc).includes("alert"), false);
  assert.equal(result.skipped.images, 1);
  assert.equal(texts(page.doc), "Hi click");
});

test("a Word document (.docx) becomes a page: its title, headings, nested lists, table, picture, link, quote", async () => {
  const { sql } = database;
  const data = readFileSync(join(import.meta.dirname, "fixtures", "word", "Livret-accueil.docx"));
  const result = await importFiles(sql, asMember(ines), { spaceName: "Word", files: [{ name: "Livret-accueil.docx", data }], words });
  assert.equal(result.pages, 1);
  assert.equal(result.files, 1);
  assert.deepEqual(result.skipped, { files: [], images: 0 });
  const page = await pages.page(sql, asMember(hugo), result.firstPageId!);
  assert.equal(page.title, "Livret d’accueil");
  assert.deepEqual(page.doc.content.map(n => n.type), ["paragraph", "heading", "bulletList", "heading", "orderedList", "table", "paragraph", "image", "paragraph", "paragraph", "blockquote"]);
  // "List Bullet 2" sits inside the item before it.
  assert.equal(page.doc.content[2]!.content![1]!.content![1]!.type, "bulletList");
  assert.deepEqual(page.doc.content[0]!.content!.find(n => n.text === "Lumen & Co")?.marks, [{ type: "bold" }]);
  const image = await fileOf(sql, asMember(hugo), references(page.doc).files[0]!);
  assert.equal(image.image, true);
  assert.equal(texts(page.doc).includes("service-public.fr"), true);
  assert.equal(JSON.stringify(page.doc).includes("https://www.service-public.fr/"), true);
});

test("Word in French: headings are found by their style's inner name (Titre 1 is heading 1); a broken file is said, not fatal", async () => {
  const { sql } = database;
  const w = (body: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}</w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Titre1"><w:name w:val="heading 1"/></w:style><w:style w:type="paragraph" w:styleId="Titre"><w:name w:val="Title"/></w:style></w:styles>`;
  const doc = writeZip([
    { name: "word/document.xml", data: w(`<w:p><w:pPr><w:pStyle w:val="Titre"/></w:pPr><w:r><w:t>Charte informatique</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Titre1"/></w:pPr><w:r><w:t>Mots de passe</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b w:val="0"/></w:rPr><w:t xml:space="preserve">Jamais </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>partagés</w:t></w:r><w:del><w:r><w:delText>supprimé</w:delText></w:r></w:del></w:p>`) },
    { name: "word/styles.xml", data: styles },
  ]);
  const result = await importFiles(sql, asMember(ines), { spaceName: "Charte", files: [{ name: "charte.docx", data: doc }, { name: "cassé.docx", data: new TextEncoder().encode("not a zip") }], words });
  assert.equal(result.pages, 1);
  assert.deepEqual(result.skipped.files, ["cassé.docx"]);
  const page = await pages.page(sql, asMember(hugo), result.firstPageId!);
  assert.equal(page.title, "Charte informatique");
  assert.deepEqual(page.doc.content.map(n => n.type), ["heading", "paragraph"]);
  assert.equal(texts(page.doc), "Mots de passe\nJamais partagés");
  assert.deepEqual(page.doc.content[1]!.content!.map(n => n.marks ?? []), [[], [{ type: "bold" }]]);
});
