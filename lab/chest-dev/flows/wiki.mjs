// The wiki, as people use it, in a real browser: node lab/chest-dev/flows/wiki.mjs [port]
// (the harness runs the tool with --reset: the sample handbook is there —
// seed/sample.sql of tools/private/wiki).
import { writeFileSync } from "node:fs";
import postgres from "postgres";
import { as, done, expect, open, step } from "./lib.mjs";

const port = Number(process.argv[2] ?? 4300);
const { browser, context, page, origin, problems } = await open(port, "tom", { allow404: /\/chest\/(pages\/(16|999)|pages\/\d+\/edit)$/u });
const tmp = process.env.TMPDIR ?? "/tmp";
// A 1×1 PNG: the fake Chest checks that an image is what it says.
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
let created = "";

await step("an editor writes a new page from its space: title, heading, list; saved as a version", async () => {
  await page.goto(origin + "/chest/spaces/1");
  await page.locator(".space-head").getByRole("button", { name: "New page" }).click();
  await page.getByLabel("Title").fill("Parking and bikes");
  await page.getByRole("button", { name: "Create and write" }).click();
  await page.waitForURL(/\/chest\/pages\/\d+\/edit$/u);
  created = page.url().replace(/\/edit$/u, "");
  const body = page.locator(".ProseMirror");
  await body.waitFor();
  await body.click();
  await page.keyboard.type("There are six parking spaces behind the workshop.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("# Bikes");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- Racks in the courtyard");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Showers on the first floor");
  await page.waitForSelector(".save-status:has-text('Draft saved')", { timeout: 8000 });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForURL(u => u.href === created + "?saved=2" || u.href === created, { timeout: 8000 });
  await page.waitForSelector(".prose h2");
  const text = await page.locator(".prose").innerText();
  expect(text.includes("six parking spaces") && text.includes("Showers on the first floor"), "text: " + text);
  expect((await page.locator(".prose h2").innerText()) === "Bikes", "heading");
  expect(await page.locator(".sidebar").getByRole("link", { name: "Parking and bikes" }).isVisible(), "in the sidebar");
});

await step("links to another page by picking it; the link shows its title", async () => {
  await page.goto(created + "/edit");
  await page.locator(".ProseMirror").waitFor();
  await page.locator(".ProseMirror").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Questions: ");
  await page.getByRole("button", { name: "Link to a page" }).click();
  await page.getByPlaceholder("Find a page").fill("who to");
  await page.locator(".pick-list button", { hasText: "Who to ask" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForURL(/\/chest\/pages\/\d+(\?saved=\d+)?$/u);
  const link = page.locator(".prose a.page-ref");
  expect((await link.innerText()) === "Who to ask", "page link");
  expect((await link.getAttribute("href")) === "/chest/pages/7", "href");
});

await step("an image goes to the Chest and shows in the page", async () => {
  const file = tmp + "/courtyard.png";
  writeFileSync(file, png);
  await page.goto(created + "/edit");
  await page.locator(".ProseMirror").waitFor();
  await page.locator(".ProseMirror").click();
  await page.locator("input[type=file]").setInputFiles(file);
  await page.waitForSelector(".ProseMirror img", { timeout: 8000 });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForURL(/\/chest\/pages\/\d+(\?saved=\d+)?$/u);
  const src = await page.locator(".prose img").getAttribute("src");
  const r = await page.request.get(origin + src);
  expect(r.ok() && (await r.body()).equals(png), "image served: " + src);
});

await step("while Tom edits, Camille finds the page taken and reads it meanwhile", async () => {
  await page.goto(created + "/edit");
  await page.locator(".ProseMirror").waitFor();
  await as(context, origin, "camille");
  await page.goto(created + "/edit");
  await page.waitForSelector("text=Quelqu’un d’autre modifie cette page");
  expect(!(await page.getByRole("button", { name: "Prendre la main" }).isVisible()), "no take-over while active");
  await page.goto(created);
  expect((await page.locator(".notice").innerText()).includes("Tom Walker modifie cette page"), "banner on the page");
  await as(context, origin, "tom");
  await page.goto(created + "/edit");
  await page.locator(".ProseMirror").waitFor();
  await page.getByRole("button", { name: "Stop editing" }).click();
  await page.waitForURL(created);
});

await step("unsaved changes come back after the tab is closed", async () => {
  await page.goto(origin + "/chest/pages/3/edit");
  await page.locator(".ProseMirror").waitFor();
  await page.locator(".ProseMirror").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" Bring the receipt within a week.");
  await page.waitForSelector(".save-status:has-text('Draft saved')", { timeout: 8000 });
  await page.goto(origin + "/chest");
  expect((await page.locator(".drafts").innerText()).includes("Expense policy"), "draft on the home page");
  await page.locator(".drafts").getByRole("link", { name: "Continue" }).click();
  await page.waitForSelector(".toast:has-text('are back')");
  expect((await page.locator(".ProseMirror").innerText()).includes("Bring the receipt within a week."), "draft text");
  await page.getByRole("button", { name: "Stop editing" }).click();
  await page.waitForSelector(".toast:has-text('Changes discarded')");
  expect(!(await page.locator(".prose").innerText()).includes("within a week"), "discarded");
});

await step("history: the changes in words, and restoring the version before", async () => {
  await page.goto(created + "/history");
  expect((await page.locator(".versions li").count()) >= 4, "versions");
  await page.locator(".versions a").nth(1).click();
  await page.waitForURL(/v=\d/u);
  expect(await page.locator(".rows ins").count() > 0, "added words shown");
  await page.getByRole("tab", { name: "As it was" }).click();
  await page.waitForSelector(".past .prose");
  await page.getByRole("button", { name: "Restore this version" }).click();
  await page.waitForURL(/restored=/u);
  await page.waitForSelector(".toast:has-text('restored')");
  expect(await page.locator(".prose img").count() === 0, "the image version is gone again");
});

await step("move a page inside another with the dialog, then delete it and undo", async () => {
  await page.goto(created);
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: "Move" }).click();
  await page.getByLabel("Inside “Who to ask”").check();
  await page.getByRole("button", { name: "Move here" }).click();
  await page.waitForSelector(".toast:has-text('Page moved')");
  await page.reload();
  expect((await page.locator(".crumbs").innerText()).includes("Who to ask"), "breadcrumb");
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.waitForURL(/\/chest\/pages\/7$/u);
  await page.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await page.waitForURL(created);
  await page.waitForSelector("h1:has-text('Parking and bikes')");
  await page.waitForSelector(".toast:has-text('Page restored')");
});

await step("a reader searches (accents aside), reads, downloads; cannot edit", async () => {
  await as(context, origin, "hugo");
  await page.goto(origin + "/chest");
  await page.getByPlaceholder("Holidays, expenses, Wi-Fi password…").fill("receipts refund");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/chest\/search\?q=/u);
  expect((await page.locator(".results li").first().innerText()).includes("Expense policy"), "found");
  expect(await page.locator(".results mark").count() > 0, "marked words");
  await page.locator(".result-title").first().click();
  await page.waitForURL(/\/chest\/pages\/3$/u);
  expect(await page.getByRole("link", { name: "Edit" }).count() === 0, "no edit for readers");
  const md = await (await page.request.get(origin + "/chest/pages/3/export?format=md")).text();
  expect(md.startsWith("# Expense policy"), "markdown export");
  const html = await (await page.request.get(origin + "/chest/pages/3/export?format=html")).text();
  expect(html.includes("<title>Expense policy</title>"), "html export");
  const edit = await page.request.get(origin + "/chest/pages/3/edit");
  expect(edit.status() === 404, "edit refused: " + edit.status());
  const hidden = await page.request.get(origin + "/chest/pages/16");
  expect(hidden.status() === 404, "a page kept to the office group");
});

await step("import Markdown files into a new space", async () => {
  await as(context, origin, "ines");
  const file = tmp + "/Accueil client.md";
  writeFileSync(file, "# Accueil client\n\nOffrir un café, toujours.\n\n- [ ] Préparer la salle\n- [x] Imprimer l’ordre du jour\n");
  await page.goto(origin + "/chest/import");
  await page.locator(".dropzone input[type=file]").setInputFiles(file);
  await page.getByLabel("Nom du nouvel espace").fill("Accueil");
  await page.getByRole("button", { name: "Importer" }).click();
  await page.waitForSelector("text=1 page importée.");
  await page.getByRole("link", { name: "Ouvrir les pages" }).click();
  await page.waitForURL(/\/chest\/pages\/\d+$/u);
  expect((await page.locator("h1").innerText()) === "Accueil client", "title from the file");
  expect(await page.locator(".prose ul.tasks input[checked]").count() === 1, "checklist");
});

await step("French for a French reader; phone width: no sideways scroll, the pages in a drawer", async () => {
  await as(context, origin, "lea");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/chest");
  expect((await page.locator("h1").innerText()).includes("Que cherchez-vous"), "French home");
  for (const path of ["/chest", "/chest/pages/2", "/chest/pages/2/history", "/chest/spaces/1", "/chest/search?q=wifi"]) {
    await page.goto(origin + path);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width <= 392, `${path} overflows: ${width}`);
  }
  await page.goto(origin + "/chest/pages/2");
  await page.getByRole("button", { name: "Pages" }).click();
  await page.locator(".sidebar").getByRole("link", { name: "Charte télétravail" }).click();
  await page.waitForURL(/\/chest\/pages\/9$/u);
  await page.waitForSelector("h1:has-text('Charte télétravail')");
  await page.waitForTimeout(400);
  expect(!(await page.locator(".sidebar").isVisible()), "drawer closed after choosing");
});

await step("the trash in the editor's language; an unknown page is not found", async () => {
  await as(context, origin, "camille");
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto(origin + "/chest/trash");
  expect((await page.locator("h1").innerText()) === "Corbeille", "trash in French");
  const r = await page.request.get(origin + "/chest/pages/999");
  expect(r.status() === 404, "unknown page");
});

await step("idle for 15 minutes, a lock can be taken over; the first editor keeps their draft", async () => {
  await as(context, origin, "tom");
  await page.goto(origin + "/chest/pages/5/edit");
  await page.locator(".ProseMirror").waitFor();
  // Tom walks away: his lock grows old (the harness's database, as the tool's role).
  const sql = postgres("postgres://t_wiki:dev@127.0.0.1:5432/t_wiki", { max: 1, onnotice: () => {} });
  await sql`update page_locks set active_at = now() - interval '20 minutes' where page_id = 5`;
  await sql.end();
  await as(context, origin, "sofia");
  await page.goto(origin + "/chest/pages/5/edit");
  await page.waitForSelector("text=has not typed for 20 minutes");
  await page.getByRole("button", { name: "Take over" }).click();
  await page.locator(".ProseMirror").waitFor();
  await page.getByRole("button", { name: "Stop editing" }).click();
  await page.waitForURL(/\/chest\/pages\/5$/u);
});

await step("an editor drags a page in the sidebar to put it inside another", async () => {
  await as(context, origin, "sofia");
  await page.goto(origin + "/chest/pages/15");
  const moving = page.locator(".sidebar .row", { hasText: "When something breaks" });
  const target = page.locator(".sidebar .row", { hasText: "Onboarding for engineers" });
  await moving.dragTo(target, { targetPosition: { x: 60, y: 17 } });
  await page.waitForSelector(".toast:has-text('Page moved')");
  await page.reload();
  expect((await page.locator(".crumbs").innerText()).includes("Onboarding for engineers"), "moved inside");
  await page.locator(".toast").first().waitFor({ state: "detached" }).catch(() => {});
});

await step("a space kept to the office group: set in its settings, gone for the others", async () => {
  await as(context, origin, "camille");
  await page.goto(origin + "/chest/spaces/2/settings");
  await page.getByText("Seulement certains groupes").click();
  await page.getByLabel("Office").check();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.waitForURL(/\/chest\/spaces\/2$/u);
  await page.waitForSelector(".space-head .restricted:has-text('Réservé à certains groupes')", { timeout: 8000 });
  await as(context, origin, "hugo");
  const r = await page.request.get(origin + "/chest/pages/10");
  expect(r.status() === 404, "hidden from sales now: " + r.status());
  await page.goto(origin + "/chest");
  expect(!(await page.locator(".sidebar").innerText()).includes("Sales playbook"), "not in the sidebar");
  const zip = await page.request.get(origin + "/chest/spaces/1/export");
  expect(zip.ok() && (await zip.body()).subarray(0, 2).toString() === "PK", "space export is a zip");
});

await browser.close();
done(problems);
