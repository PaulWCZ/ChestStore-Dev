// Equipment, as people use it, in a real browser: node lab/chest-dev/flows/equipment.mjs [port]
// (the harness runs the tool with --reset: the sample equipment is there;
// Camille and Sofia manage it, Inès, Hugo, Léa and Tom use it).
import { writeFileSync } from "node:fs";
import { as, done, expect, id, open, step } from "./lib.mjs";

const port = Number(process.argv[2] ?? 5400);
const { browser, context, page, origin, problems } = await open(port, "sofia", { allow404: /\/chest\/people$/u });
const tmp = process.env.TMPDIR ?? "/tmp";
const english = () => context.addCookies([{ name: "dev_locale", value: "en", url: origin }]);
const dev = async () => (await page.request.get(origin + "/_dev")).text();
await english();
let itemUrl = "";

await step("a manager adds a laptop: the next tag is given, the item page opens", async () => {
  await page.goto(origin + "/chest");
  await page.getByRole("link", { name: "Add equipment" }).click();
  await page.waitForURL(/\/chest\/items\/new$/u);
  await page.getByLabel("Name or model").fill("MacBook Pro 16″ M4");
  await page.getByLabel("Serial number").fill("FLOW-SN-0001");
  await page.getByLabel(/^Price/u).fill("2 899,00");
  await page.getByLabel("Warranty until").fill("2029-01-31");
  await page.getByRole("button", { name: "Add it" }).click();
  await page.waitForURL(/\/chest\/items\/\d+$/u);
  itemUrl = page.url();
  expect(await page.getByRole("heading", { name: "MacBook Pro 16″ M4" }).isVisible(), "title");
  expect((await page.locator(".item-head .asset-tag").textContent()) === "EQ-0042", "tag EQ-0042");
  expect((await page.locator(".facts").innerText()).includes("€2,899"), "price");
  expect(await page.locator(".label-face svg.qr").count() === 1, "QR label");
});

await step("give it to Hugo with its condition; he finds it in his bell, in English", async () => {
  await page.getByRole("button", { name: "Give to someone" }).click();
  await page.getByPlaceholder("Find someone").fill("hug");
  await page.locator(".pick-list button", { hasText: "Hugo Bernard" }).click();
  await page.getByLabel(/^Condition/u).fill("New, in its box");
  await page.getByRole("button", { name: "Give it to Hugo Bernard" }).click();
  await page.getByText("Given to Hugo Bernard.").waitFor();
  await page.waitForTimeout(800);
  expect((await page.locator(".holder-panel").innerText()).includes("Hugo Bernard"), "holder shown");
  expect((await page.locator(".timeline").innerText()).includes("gave it to Hugo Bernard"), "history");
  expect((await dev()).includes("Sofia gave you MacBook Pro 16″ M4 EQ-0042"), "Hugo's bell");
});

await step("take it back, then Undo: it is with Hugo again", async () => {
  await page.getByRole("button", { name: "Take back" }).first().click();
  await page.getByLabel(/^Condition/u).fill("Fine");
  await page.getByRole("button", { name: "Take it back" }).click();
  await page.getByText("is back in stock").waitFor();
  await page.getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(1500);
  await page.reload();
  expect((await page.locator(".holder-panel").innerText()).includes("Hugo Bernard"), "back with Hugo");
});

await step("a licence: give a seat to Inès; the count follows", async () => {
  await page.goto(origin + "/chest/items?q=Figma");
  await page.locator(".line-main", { hasText: "Figma" }).click();
  await page.waitForURL(/\/chest\/items\/\d+$/u);
  await page.getByRole("button", { name: "Give a seat" }).click();
  await page.getByPlaceholder("Find someone").fill("ines");
  await page.locator(".pick-list button", { hasText: "Inès Moreau" }).click();
  await page.getByText("Inès Moreau has a seat now.").waitFor();
  await page.waitForTimeout(800);
  expect((await page.locator(".holder-panel").innerText()).includes("4 of 5 seats used"), "seats: " + (await page.locator(".holder-panel").innerText()).slice(0, 60));
});

await step("search: a serial number finds it; a tag typed exactly opens the item", async () => {
  await page.goto(origin + "/chest/items?q=FLOW-SN");
  expect((await page.locator(".line-name").allTextContents()).join("|") === "MacBook Pro 16″ M4", "serial search");
  await page.locator("header .search input").fill("eq-0002");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/chest\/items\/2$/u);
  await page.goto(origin + "/chest/items?status=in_repair");
  expect((await page.locator(".line-name").allTextContents()).join("|") === "MacBook Pro 13″ (2020)", "status filter");
});

await step("labels: tick two items, print their sheet", async () => {
  await page.goto(origin + "/chest/items?category=1");
  await page.getByLabel("Select EQ-0001").check();
  await page.getByLabel("Select EQ-0004").check();
  await page.getByRole("link", { name: "Print their labels" }).click();
  await page.waitForURL(/\/chest\/labels\?ids=/u);
  expect(await page.locator(".sticker").count() === 2, "two stickers");
  expect((await page.locator(".sheet").innerText()).includes("EQ-0004"), "tag on the sticker");
});

await step("export CSV, then import a spreadsheet with a preview", async () => {
  const csv = await page.request.get(origin + "/chest/export?category=1");
  expect(csv.status() === 200 && (await csv.text()).includes("MacBook Pro 16″ M4"), "export");
  const file = `${tmp}/equipment-flow.csv`;
  writeFileSync(file, "Name,Category,Serial number,Assigned to,Purchase date,Price\nMagic Keyboard,Accessories,MK-1,Tom Walker,2025-05-02,149\nStanding desk,Furniture,,,,\n");
  await page.goto(origin + "/chest/import");
  await page.locator(".source").nth(1).locator("input[type=file]").setInputFiles(file);
  await page.getByText("Check before importing").waitFor();
  const preview = await page.locator(".summary-box").innerText();
  expect(preview.includes("2 items · 1 given to people") && preview.includes("New categories: Furniture"), "preview: " + preview.slice(0, 160));
  await page.getByRole("button", { name: "Import 2 items" }).click();
  await page.getByText("2 items imported.").waitFor();
});

await step("a member (Hugo) sees his equipment and reports a problem; managers are told", async () => {
  await as(context, origin, "hugo");
  await english();
  await page.goto(origin + "/chest");
  expect(await page.getByRole("heading", { name: "My equipment" }).isVisible(), "mine");
  const card = page.locator(".label-card", { hasText: "MacBook Pro 16″ M4" });
  await card.getByRole("button", { name: "Report a problem" }).click();
  await page.getByLabel("What’s wrong?").fill("The fan is very loud");
  await page.getByRole("button", { name: "Send to the managers" }).click();
  await page.getByText("Sent. The equipment managers have been told.").waitFor();
  await page.waitForTimeout(800);
  expect((await dev()).includes("Hugo reported a problem: MacBook Pro 16″ M4 EQ-0042"), "manager's bell");
  // The catalogue, read-only: no money, no giving.
  await page.goto(itemUrl.replace(/\/\d+$/u, "/2"));
  expect(!(await page.locator("body").innerText()).includes("€"), "no price for a member");
  expect(await page.getByRole("button", { name: "Take back" }).count() === 0, "no take back");
  const people = await page.goto(origin + "/chest/people");
  expect(people.status() === 404, "people page closed to members");
});

await step("the manager solves the problem from the overview", async () => {
  await as(context, origin, "sofia");
  await english();
  await page.goto(origin + "/chest");
  const problem = page.locator(".problem", { hasText: "The fan is very loud" });
  await problem.getByRole("button", { name: "Solved" }).click();
  await page.getByText("Marked as solved.").waitFor();
  await page.reload();
  expect(await page.locator(".problem", { hasText: "The fan is very loud" }).count() === 0, "gone");
});

await step("Tom leaves: nothing comes back by itself, the managers are told; Camille takes everything back (in French), Undo, again", async () => {
  await page.request.post(origin + "/_dev/event", { form: { type: "member.removed", member: id("tom") } });
  expect((await dev()).includes("Tom Walker left and holds"), "bell to Sofia");
  await as(context, origin, "camille");
  await context.addCookies([{ name: "dev_locale", value: "fr", url: origin }]);
  await page.goto(origin + "/chest");
  const leavers = await page.locator(".panel.warn").last().innerText();
  expect(leavers.includes("Tom Walker (ancien membre)"), "overview: " + leavers.slice(0, 120));
  await page.locator(".panel.warn a", { hasText: "Tom Walker" }).click();
  await page.waitForURL(/\/chest\/people\/mbr_tom/u);
  expect((await page.locator(".notice").innerText()).includes("A quitté l’entreprise"), "left notice");
  await page.getByRole("button", { name: "Tout reprendre" }).click();
  await page.getByText(/éléments repris/u).waitFor();
  await page.getByRole("button", { name: "Annuler" }).click();
  await page.waitForTimeout(1500);
  await page.reload();
  expect(await page.locator(".checklist .line").count() >= 5, "all back with Tom after Undo");
  await page.getByRole("button", { name: "Tout reprendre" }).click();
  await page.getByText(/éléments repris/u).waitFor();
  await page.waitForTimeout(800);
  await page.reload();
  expect(await page.locator(".checklist .line").count() === 0, "nothing left");
});

await step("categories: rename one and add one", async () => {
  await page.goto(origin + "/chest/settings");
  const vehicles = page.locator(".cat-row input").nth(6);
  await vehicles.fill("Voitures de service");
  await page.locator("h1").click();
  await page.waitForTimeout(800);
  await page.getByPlaceholder("Mobilier, outillage").fill("Drones");
  await page.getByRole("button", { name: "Ajouter une catégorie" }).click();
  await page.getByText("Drones ajoutée.").waitFor();
  await page.reload();
  expect((await page.locator(".cat-row input").nth(6).inputValue()) === "Voitures de service", "renamed");
});

await step("the weekly run tells the managers what ends soon, in their language", async () => {
  await page.request.post(origin + "/_dev/schedule", { form: { name: "weekly" } });
  const text = await dev();
  expect(/garanties ou renouvellements arrivent à échéance/u.test(text), "French bell for Camille");
});

await step("phone, French: Inès reports a problem from her list; no horizontal scroll", async () => {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-FR" });
  await phone.addCookies([{ name: "dev_member", value: id("ines"), url: origin }, { name: "dev_locale", value: "fr", url: origin }]);
  const p = await phone.newPage();
  p.on("pageerror", e => problems.push("phone: " + e.message));
  await p.goto(origin + "/chest");
  expect(await p.getByRole("heading", { name: "Mon matériel" }).isVisible(), "mine fr");
  const wide = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(!wide, "no horizontal scroll");
  await p.locator(".label-card", { hasText: "iPhone 15" }).getByRole("button", { name: "Signaler un problème" }).click();
  await p.getByLabel("Qu’est-ce qui ne va pas ?").fill("L’écran est fissuré");
  await p.getByRole("button", { name: "Envoyer aux gestionnaires" }).click();
  await p.getByText("Envoyé. Les gestionnaires du matériel sont prévenus.").waitFor();
  for (const path of ["/chest/items", "/chest/items/2"]) {
    await p.goto(origin + path);
    expect(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), "no scroll on " + path);
  }
  await phone.close();
});

await browser.close();
done(problems);
