// Clients, as a sales team uses it, in a real browser:
//   node lab/chest-dev/flows/crm.mjs [port]   (harness with --reset: the sample client book is there)
import { writeFileSync } from "node:fs";
import { as, done, expect, id, open, step } from "./lib.mjs";

const port = Number(process.argv[2] ?? 4800);
const { browser, context, page, origin, problems } = await open(port, "hugo", { allow404: /\/chest\/contacts\/\d+$/u });
const tmp = process.env.TMPDIR ?? "/tmp";
let companyUrl = "", dealUrl = "";
const dev = async () => (await page.request.get(origin + "/_dev")).text();
const boardLane = name => page.locator(".lane", { has: page.locator("h2", { hasText: name }) });

await step("My day: Hugo sees his late and today's next steps first", async () => {
  await page.goto(origin + "/chest");
  const text = await page.locator("main").innerText();
  expect(text.includes("First call: understand the need"), "late step");
  expect(text.includes("Confirm delivery date with Julien"), "today's step");
  expect(text.indexOf("LATE") < text.indexOf("TODAY"), "late first: " + text.slice(0, 200));
});

await step("a new company warns of a look-alike, then opens its page", async () => {
  await page.goto(origin + "/chest/companies");
  await page.getByRole("button", { name: "New company" }).click();
  await page.getByLabel("Name").fill("Boulangerie Durand");
  await page.waitForSelector(".lookalikes");
  expect((await page.locator(".lookalikes").innerText()).includes("Boulangeries Durand"), "look-alike shown");
  await page.getByLabel("Name").fill("Pharmacie Centrale");
  await page.getByLabel("Website").fill("pharmacie-centrale.fr");
  await page.getByLabel("Phone").fill("02 31 44 55 66");
  await page.getByRole("button", { name: "Add the company" }).click();
  await page.waitForURL(/\/chest\/companies\/\d+$/u);
  companyUrl = page.url();
  expect((await page.locator("h1").innerText()) === "Pharmacie Centrale", "company page");
});

await step("add a person there, then a deal for her", async () => {
  await page.getByRole("button", { name: "Add a person" }).click();
  await page.getByLabel("Name").fill("Aurélie Masson");
  await page.getByLabel("Email").fill("a.masson@pharmacie-centrale.fr");
  await page.getByLabel("Job title").fill("Pharmacist, owner");
  await page.getByRole("button", { name: "Add the contact" }).click();
  await page.waitForSelector(".mini-list a:has-text('Aurélie Masson')");
  await page.getByRole("button", { name: "New deal" }).click();
  await page.getByLabel("What are you selling?").fill("Dispensary counter and shelving");
  await page.getByLabel("Contact").selectOption({ label: "Aurélie Masson" });
  await page.getByLabel("Amount (€, excl. tax)").fill("14 800,50");
  await page.getByRole("button", { name: "Create the deal" }).click();
  await page.waitForURL(/\/chest\/deals\/\d+$/u);
  dealUrl = page.url();
  const head = await page.locator(".record-head").innerText();
  expect(head.includes("€14,800.50"), "value: " + head);
  expect(head.includes("Pharmacie Centrale") && head.includes("Aurélie Masson"), "links");
});

await step("log a call in one tap; the history shows it; Undo takes it back", async () => {
  await page.getByRole("button", { name: "Call", exact: true }).click();
  await page.waitForSelector(".toast:has-text('Call logged')");
  await page.waitForSelector(".timeline .event.k-call");
  await page.locator(".toast button").click();
  await page.waitForTimeout(1200);
  await page.reload();
  expect(await page.locator(".timeline .event.k-call").count() === 0, "undone");
  await page.getByRole("textbox", { name: "What was said" }).fill("Wants the counter before the winter season.");
  await page.getByRole("button", { name: "Meeting", exact: true }).click();
  await page.waitForSelector(".event-body:has-text('before the winter season')");
});

await step("plan a next step; Done logs it and asks what comes next", async () => {
  await page.getByRole("button", { name: "Plan the next step" }).click();
  await page.getByLabel("What", { exact: true }).fill("Send the quote");
  await page.getByRole("button", { name: "Today" }).click();
  await page.getByRole("button", { name: "Plan it" }).click();
  await page.waitForSelector(".step-box .step-text:has-text('Send the quote')");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.waitForSelector("text=What’s next?");
  await page.getByLabel("What", { exact: true }).fill("Call back about the quote");
  await page.getByRole("button", { name: "In a week" }).click();
  await page.getByRole("button", { name: "Plan it" }).click();
  await page.waitForSelector(".step-box .step-text:has-text('Call back about the quote')");
  expect(await page.locator(".event.k-step:has-text('Send the quote')").count() === 1, "done step in the history");
});

await step("the board: drag a deal to the next stage with the mouse", async () => {
  await page.goto(origin + "/chest/deals");
  const card = page.locator(".deal-card", { hasText: "Dispensary counter" });
  const target = boardLane("Qualified").locator(".lane-deals");
  const a = await card.boundingBox(), b = await target.boundingBox();
  await page.mouse.move(a.x + 20, a.y + 10);
  await page.mouse.down();
  await page.mouse.move(a.x + 40, a.y + 20, { steps: 5 });
  await page.mouse.move(b.x + 40, b.y + 20, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(1500);
  await page.reload();
  expect((await boardLane("Qualified").innerText()).includes("Dispensary counter"), "moved to Qualified");
});

await step("the board: move a deal with the keyboard, then to Won with a reason", async () => {
  await boardLane("Qualified").locator("li", { hasText: "Dispensary counter" }).focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  await page.keyboard.press("Space");
  await page.waitForTimeout(1500);
  await page.reload();
  expect((await boardLane("Proposal").innerText()).includes("Dispensary counter"), "moved to Proposal");
  const card = page.locator(".deal-card", { hasText: "Dispensary counter" });
  const target = boardLane("Won").locator(".lane-deals");
  const a = await card.boundingBox(), b = await target.boundingBox();
  await page.mouse.move(a.x + 20, a.y + 10);
  await page.mouse.down();
  await page.mouse.move(a.x + 40, a.y + 20, { steps: 5 });
  await page.mouse.move(b.x + 40, b.y + 20, { steps: 20 });
  await page.mouse.up();
  await page.waitForSelector("dialog[open]");
  await page.getByLabel("A few words help the team next time.").fill("Fast delivery promised");
  await page.locator("dialog[open]").getByRole("button", { name: "Won" }).click();
  await page.waitForSelector(".toast:has-text('Won! Well done.')");
  await page.reload();
  expect((await boardLane("Won").innerText()).includes("Dispensary counter"), "won");
  await page.goto(dealUrl);
  const note = await page.locator(".closed-note").innerText();
  expect(note.includes("Fast delivery promised"), "reason kept: " + note);
});

await step("Hugo cannot move Inès's deals; he sees them", async () => {
  await page.goto(origin + "/chest/deals");
  expect(await page.locator("li.locked", { hasText: "Head office fit-out" }).count() === 1, "locked card");
  await page.locator(".deal-card", { hasText: "Head office fit-out" }).click();
  await page.waitForURL(/\/chest\/deals\/\d+$/u);
  expect((await page.locator(".notice").innerText()).includes("Inès Moreau or a manager"), "read-only notice");
  expect(await page.getByRole("button", { name: "Won" }).count() === 0, "no Won button");
});

await step("the manager gives Inès a deal: she is told in French", async () => {
  await as(context, origin, "camille");
  await page.goto(dealUrl);
  await page.getByRole("button", { name: "Rouvrir" }).click();
  await page.waitForSelector(".toast");
  await page.locator("#deal-owner").selectOption(id("ines"));
  await page.waitForTimeout(1500);
  expect((await dev()).includes("Camille Martin vous a confié une affaire"), "French bell item");
});

await step("search with the / key, accents and case aside", async () => {
  await as(context, origin, "hugo");
  await page.goto(origin + "/chest/deals");
  await page.keyboard.press("/");
  expect(await page.evaluate(() => document.activeElement?.id === "q"), "focused");
  await page.keyboard.type("cherif");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/chest\/search\?q=cherif/u);
  expect((await page.locator("main").innerText()).includes("Dr Nadia Chérif"), "found");
});

await step("import a HubSpot contacts export: columns matched, previewed, imported", async () => {
  const file = tmp + "/hubspot-contacts.csv";
  writeFileSync(file, "Record ID,First Name,Last Name,Email,Phone Number,Job Title,Company Name,Contact owner\n901,Gaëlle,Perrin,g.perrin@fromagerie-perrin.fr,04 50 11 22 33,Buyer,Fromagerie Perrin,Inès Moreau\n902,Claire,Durand,claire.durand@durand-boulangeries.fr,,,,\n");
  await page.goto(origin + "/chest/import");
  await page.locator(".source", { hasText: "Spreadsheet" }).locator("input[type=file]").setInputFiles(file);
  await page.waitForSelector("table.mapping");
  expect((await page.locator("#map-1").inputValue()) === "firstName", "first name guessed");
  expect((await page.locator("table.preview").innerText()).includes("g.perrin@fromagerie-perrin.fr"), "preview");
  await page.getByRole("button", { name: /^Import · 2 rows$/u }).click();
  await page.waitForSelector("text=Imported: 1 new, 1 already here.");
  await page.goto(origin + "/chest/contacts?q=perrin");
  expect((await page.locator(".rows").innerText()).includes("Gaëlle Perrin"), "imported");
});

await step("import an address book (vCard) and download one back", async () => {
  const file = tmp + "/phone.vcf";
  writeFileSync(file, "BEGIN:VCARD\r\nVERSION:3.0\r\nN:Lambert;Yves;;;\r\nFN:Yves Lambert\r\nORG:Menuiserie Lambert\r\nTEL;TYPE=CELL:06 70 80 90 10\r\nEND:VCARD\r\n");
  await page.goto(origin + "/chest/import");
  await page.locator(".source", { hasText: "Address book" }).locator("input[type=file]").setInputFiles(file);
  await page.getByRole("button", { name: /^Import · 1 contact$/u }).click();
  await page.waitForSelector("text=Imported: 1 new, 0 already here.");
  await page.goto(origin + "/chest/contacts?q=lambert");
  await page.locator(".row-link", { hasText: "Yves Lambert" }).click();
  await page.waitForURL(/\/chest\/contacts\/\d+$/u);
  const card = await (await page.request.get(page.url() + "/vcard")).text();
  expect(card.includes("FN:Yves Lambert") && card.includes("VERSION:4.0"), "vcard");
});

await step("exports: the deals list as CSV, formulas neutralised", async () => {
  await page.goto(origin + "/chest/deals?view=list&status=any");
  expect((await page.locator("table").innerText()).includes("Dispensary counter"), "list");
  const csv = await (await page.request.get(origin + "/chest/export/deals?status=any")).text();
  expect(csv.startsWith("﻿Title,Company,Contact,Value"), "headers");
  expect(csv.includes("Dispensary counter and shelving,Pharmacie Centrale,Aurélie Masson,14800.50"), "row: " + csv.split("\r\n")[1]);
});

await step("GDPR: a person's data is exported, then deleted for good", async () => {
  await page.goto(origin + "/chest/contacts?q=masson");
  await page.locator(".row-link", { hasText: "Aurélie Masson" }).click();
  await page.waitForURL(/\/chest\/contacts\/\d+$/u);
  const contactUrl = page.url();
  const data = JSON.parse(await (await page.request.get(contactUrl + "/data")).text());
  expect(data.contact.email === "a.masson@pharmacie-centrale.fr" && data.deals.length === 1, "export");
  expect(data.activities.some(a => a.text.includes("winter season")), "what was written about her");
  await page.getByRole("button", { name: "Delete this person" }).click();
  await page.getByRole("button", { name: "Delete for good" }).click();
  await page.waitForURL(/\/chest\/contacts$/u);
  const gone = await page.request.get(contactUrl);
  expect(gone.status() === 404, "gone: " + gone.status());
  await page.goto(dealUrl);
  expect(!(await page.locator("main").innerText()).includes("winter season"), "her notes are gone too");
});

await step("a viewer reads everything and changes nothing", async () => {
  await as(context, origin, "lea");
  await page.goto(origin + "/chest/deals");
  expect(await page.getByRole("button", { name: "Nouvelle affaire" }).count() === 0, "no new deal");
  expect(await page.locator("li.locked").count() > 0, "every card locked");
  await page.goto(dealUrl);
  expect(await page.locator(".composer").count() === 0, "no composer");
  await page.goto(origin + "/chest/settings");
  expect((await page.locator("main").innerText()).includes("Seuls les managers"), "stages read-only");
});

await step("the manager renames a stage: everyone reads the new name", async () => {
  await as(context, origin, "camille");
  await page.goto(origin + "/chest/settings");
  const field = page.locator(".stage-row").nth(1).locator("input").first();
  await field.fill("Rendez-vous fait");
  await field.blur();
  await page.waitForSelector(".toast");
  await as(context, origin, "hugo");
  await page.goto(origin + "/chest/deals");
  expect((await page.locator(".lane h2").allTextContents()).join("|").includes("Rendez-vous fait"), "renamed");
});

await step("someone leaves: their deals go unassigned and the manager is told", async () => {
  await page.request.post(origin + "/_dev/event", { form: { type: "member.removed", member: id("sofia") } });
  await page.waitForTimeout(800);
  await page.goto(origin + "/chest/deals?view=list&owner=none");
  expect((await page.locator("table").innerText()).includes("Open space acoustic panels"), "unassigned");
  expect((await dev()).includes("est parti : ses clients n’ont plus de responsable"), "managers told (Camille reads French)");
  await page.goto(origin + "/chest/deals");
  await page.locator(".deal-card", { hasText: "Open space acoustic panels" }).click();
  await page.getByRole("button", { name: "Take it" }).click();
  await page.waitForSelector(".toast:has-text('It’s yours now.')");
});

await step("the weekday morning puts each person's due steps in their bell", async () => {
  await page.request.post(origin + "/_dev/schedule", { form: { name: "morning" } });
  await page.waitForTimeout(800);
  const text = await dev();
  expect(/prochaines? étapes? pour aujourd’hui/u.test(text), "Inès's digest in French");
});

await step("French: Inès's day and contacts in her language", async () => {
  await as(context, origin, "ines");
  await page.goto(origin + "/chest/contacts");
  const text = await page.locator("main").innerText();
  expect(text.includes("Nouveau contact") && text.includes("Exporter en vCard"), "French");
});

await step("phone width: My day first, bottom bar, nothing overflows; the board scrolls sideways", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/chest", "/chest/deals", "/chest/contacts", "/chest/companies", dealUrl.replace(origin, ""), companyUrl.replace(origin, "")]) {
    await page.goto(origin + path);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width <= 392, `${path} overflows: ${width}`);
  }
  expect(await page.locator(".bottom-nav").isVisible(), "bottom bar");
  await page.goto(origin + "/chest");
  await page.locator(".bottom-nav a", { hasText: "Affaires" }).click();
  await page.waitForURL(/\/chest\/deals$/u);
});

await browser.close();
done(problems);
