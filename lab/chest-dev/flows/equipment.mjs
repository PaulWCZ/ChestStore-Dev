// Equipment, as people use it, in a real browser: node lab/chest-dev/flows/equipment.mjs [port]
// (the harness runs the tool with --reset: the sample equipment is there;
// Camille and Sofia manage it, Inès, Hugo, Léa and Tom use it).
import { writeFileSync } from "node:fs";
import { as, done, expect, id, open, step } from "./lib.mjs";

const port = Number(process.argv[2] ?? 5400);
const { browser, context, page, origin, problems } = await open(port, "sofia");
const tmp = process.env.FLOW_TMP ?? process.env.TMPDIR ?? "/tmp";
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
  // The warranty was typed in the kit's date field (never the browser's).
  expect((await page.locator(".facts").innerText()).includes("31 January 2029"), "warranty date");
  expect(await page.locator(".label-face svg.qr").count() === 1, "QR label");
});

await step("give it to Hugo with its condition; he finds it in his bell, in English", async () => {
  await page.getByRole("button", { name: "Give to someone" }).click();
  await page.getByPlaceholder("Find someone").fill("hug");
  await page.getByRole("option", { name: /Hugo Bernard/u }).click();
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
  await page.getByRole("option", { name: /Inès Moreau/u }).click();
  await page.getByRole("button", { name: "Give a seat to Inès Moreau" }).click();
  await page.getByText("Inès Moreau has a seat now.").waitFor();
  await page.waitForTimeout(800);
  expect((await page.locator(".holder-panel").innerText()).includes("4 of 5 seats used"), "seats: " + (await page.locator(".holder-panel").innerText()).slice(0, 60));
});

await step("search: a serial number finds it; a tag typed exactly opens the item", async () => {
  await page.goto(origin + "/chest/items?q=FLOW-SN");
  expect((await page.locator(".line-name").allTextContents()).join("|") === "MacBook Pro 16″ M4", "serial search");
  await page.locator("header .ck-search input").fill("eq-0002");
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
  // One refusal on every managers' page: 403 and the kit's NoAccess words.
  for (const path of ["/chest/people", "/chest/items/new", "/chest/import", "/chest/settings", "/chest/inventory", "/chest/labels", "/chest/people/" + id("ines"), "/chest/people/" + id("ines") + "/return"]) {
    const answer = await page.goto(origin + path);
    expect(answer.status() === 403, path + " answers " + answer.status());
    expect(await page.getByRole("heading", { name: "This page is for managers" }).isVisible(), path + ": the managers' words");
  }
  expect((await page.request.get(origin + "/chest/export")).status() === 403, "export 403");
  await page.getByRole("link", { name: "Go to My equipment" }).click();
  await page.waitForURL(/\/chest\/mine$/u);
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

await step("People tells that Tom leaves: the managers hear it once, see what to take back; taken back in People, the notice goes", async () => {
  const deliver = (type, data) => page.request.post(origin + "/_dev/deliver", { form: { type, data: JSON.stringify(data) } });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const lastDay = new Date(Date.parse(today + "T00:00:00Z") + 14 * 864e5).toISOString().slice(0, 10);
  await deliver("people.leaving", { member: id("tom"), lastDay });
  expect(/Tom Walker leaves on \d+ \S+ — \d+ items to take back/u.test(await dev()), "bell to Sofia");
  await page.goto(origin + "/chest");
  const panel = await page.locator("#leaving").innerText();
  expect(panel.includes("To take back") && panel.includes("Tom Walker") && panel.includes("last day"), "overview: " + panel.slice(0, 160));
  await page.locator("#leaving a", { hasText: "Tom Walker" }).click();
  await page.waitForURL(/\/chest\/people\/mbr_tom/u);
  expect((await page.locator(".notice").innerText()).startsWith("Last day:"), "person page");
  await page.goto(origin + "/chest/people");
  expect((await page.locator("main").innerText()).includes("last day"), "people list");
  await deliver("people.leaving_cancelled", { member: id("tom") });
  expect(!/Tom Walker leaves on/u.test(await dev()), "notice withdrawn");
  await page.goto(origin + "/chest");
  // Others may be leaving too (the sample data): only Tom's entry is checked.
  expect(await page.locator("#leaving", { hasText: "Tom Walker" }).count() === 0, "Tom gone from the panel");
  // Leaving again: then he leaves the Chest, and "left and holds" takes over.
  await deliver("people.leaving", { member: id("tom"), lastDay });
  expect(/Tom Walker leaves on/u.test(await dev()), "told again");
});

await step("Tom leaves: nothing comes back by itself, the managers are told; Camille takes everything back (in French), Undo, again", async () => {
  await page.request.post(origin + "/_dev/event", { form: { type: "member.removed", member: id("tom") } });
  expect((await dev()).includes("Tom Walker left and holds"), "bell to Sofia");
  expect(!(await dev()).includes("Tom Walker leaves on"), "the leaving notice gave way");
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
  await page.getByRole("button", { name: "Annuler l’action" }).click();
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
  const vehicles = page.locator(".cat-name input").nth(6);
  await vehicles.fill("Voitures de service");
  await page.locator("h1").click();
  await page.waitForTimeout(800);
  await page.getByPlaceholder("Mobilier, outillage").fill("Drones");
  await page.getByRole("button", { name: "Ajouter une catégorie" }).click();
  await page.getByText("Drones ajoutée.").waitFor();
  await page.reload();
  expect((await page.locator(".cat-name input").nth(6).inputValue()) === "Voitures de service", "renamed");
});

await step("the weekly run tells the managers what ends soon, in their language", async () => {
  await page.request.post(origin + "/_dev/schedule", { form: { name: "weekly" } });
  const text = await dev();
  expect(/garanties ou renouvellements arrivent à échéance/u.test(text), "French bell for Camille");
});

// ---- After the critique: receipts, sheets, requests, bulk add, fields,
// supplies, inventory, repairs, Snipe-IT's own export --------------------------

await step("Hugo confirms he received the keyboard, reading the rules, with a note; the managers hear the note", async () => {
  await as(context, origin, "hugo");
  await english();
  await page.goto(origin + "/chest");
  expect(/\d+ things? to confirm/u.test(await page.locator(".ck-page-head").innerText()), "count to confirm");
  const card = page.locator(".label-card.to-confirm", { hasText: "Logitech MX Keys" });
  await card.getByRole("button", { name: "I received it" }).click();
  expect(await page.getByRole("heading", { name: "The rules for company equipment" }).isVisible(), "rules shown");
  expect((await page.locator("dialog[open]").innerText()).includes("Given by Sofia Rossi on"), "who gave it");
  await page.getByLabel(/^Anything to note/u).fill("The Q key sticks a little");
  await page.getByRole("button", { name: "I received it and accept the rules" }).click();
  await page.getByText("Thank you. It’s confirmed.").waitFor();
  await page.waitForTimeout(800);
  await page.reload();
  expect(await page.locator(".label-card.to-confirm", { hasText: "Logitech MX Keys" }).count() === 0, "the keyboard is confirmed");
  expect(/Hugo received Logitech MX Keys.* EQ-0027, with a note/u.test(await dev()), "managers told of the note");
});

await step("the manager sees the receipt on the item and prints Hugo's handover sheet (serials, IMEI, receipt, rules, signatures) and return sheet", async () => {
  await as(context, origin, "sofia");
  await english();
  await page.goto(origin + "/chest/items?q=EQ-0027");
  await page.waitForURL(/\/chest\/items\/\d+$/u);
  const panel = await page.locator(".holder-panel").innerText();
  expect(panel.includes("Hugo Bernard confirmed receiving it on") && panel.includes("The Q key sticks a little"), "receipt: " + panel.slice(0, 200));
  await page.getByRole("link", { name: "Print the handover sheet" }).click();
  await page.waitForURL(/\/handover\?items=/u);
  const one = await page.locator(".paper").innerText();
  expect(one.includes("Equipment handover form") && one.includes("EQ-0027") && one.includes("Confirmed in Equipment on") && one.includes("Signature"), "one item's sheet");
  await page.goto(origin + "/chest/people/" + id("hugo"));
  await page.getByRole("link", { name: "Handover sheet" }).click();
  await page.waitForURL(/\/handover$/u);
  const sheet = await page.locator(".paper").innerText();
  expect(sheet.includes("Hugo Bernard") && sheet.includes("IMEI: 356938035643809") && sheet.includes("Rules for company equipment") && sheet.includes("The employee") && sheet.includes("For the company"), "full sheet: " + sheet.slice(0, 300));
  await page.goto(origin + "/chest/people/" + id("hugo") + "/return");
  const back = await page.locator(".paper").innerText();
  expect(back.includes("Equipment return form") && back.includes("Not returned"), "return sheet");
  // Read to screen readers as a term and its value, never a raw "{date}".
  expect(!(await page.locator(".paper").evaluate(el => el.textContent)).includes("{"), "no placeholder in the sheet");
  expect(await page.locator(".paper-who dt", { hasText: "Printed on" }).count() === 1, "Printed on, a term of its own");
});

await step("the overview: remind the holder of a receipt nobody confirmed (bell, email where the Chest sends it); once a day", async () => {
  await as(context, origin, "sofia");
  await english();
  await page.goto(origin + "/chest");
  const row = page.locator("#unconfirmed li").first();
  const who = await row.innerText();
  await row.getByRole("button", { name: /^Remind .+ about .+/u }).click();
  await page.locator(".ck-toast", { hasText: /Reminded in their bell/u }).waitFor();
  expect(await page.locator(".ck-toast", { hasText: /Reminded/u }).getByRole("button", { name: "Undo" }).count() === 0, "sent: no Undo");
  await page.reload();
  expect((await page.locator("#unconfirmed li").first().innerText()).includes("Reminded today"), "once a day: " + who.slice(0, 80));
  expect(/asks: did you receive|vous demande[\u202f\u00a0 ]?: avez-vous reçu/u.test(await dev()), "the holder's bell, in their language");
});

await step("Hugo asks for a privacy filter; Sofia gives one from the stock from the overview; Inès's request is refused with a reason", async () => {
  await as(context, origin, "hugo");
  await english();
  await page.goto(origin + "/chest");
  await page.getByRole("button", { name: "Ask for something" }).click();
  await page.getByLabel("What do you need?").fill("A privacy filter for trains");
  await page.getByLabel(/^Kind of thing/u).selectOption({ label: "Accessories" });
  await page.getByRole("button", { name: "Send the request" }).click();
  await page.getByText("Sent. The equipment managers will answer.").waitFor();
  await page.waitForTimeout(800);
  expect((await dev()).includes("Hugo asks for equipment"), "managers' bell");
  await as(context, origin, "sofia");
  await english();
  await page.goto(origin + "/chest");
  const request = page.locator("#requests .problem", { hasText: "A privacy filter for trains" });
  await request.getByRole("button", { name: "Give…" }).click();
  await page.getByPlaceholder("Find something in stock").fill("Dell P2422H");
  await page.locator("dialog[open] .pick-list button").first().click();
  await page.getByText("Given to Hugo Bernard.").waitFor();
  await page.waitForTimeout(800);
  expect(/Sofia gave you Dell P2422H for your request/u.test(await dev()), "Hugo told");
  await page.reload();
  const refuse = page.locator("#requests .problem", { hasText: "Un second écran" });
  await refuse.getByRole("button", { name: "Refuse" }).click();
  await page.getByLabel("Why? They will read it.").fill("We have spare 24-inch screens: pick one up at reception.");
  await page.locator("dialog[open]").getByRole("button", { name: "Refuse" }).click();
  await page.getByText("Refused. Inès Moreau is told.").waitFor();
  await page.waitForTimeout(800);
  expect((await dev()).includes("Sofia a refusé votre demande"), "Inès told, in French");
});

await step("three identical laptops at once, serials pasted from the delivery note; one more, added and given at once", async () => {
  await page.goto(origin + "/chest/items/new");
  await page.getByLabel("Name or model").fill("Lenovo ThinkPad T14 Gen 5");
  await page.getByLabel("How many?").fill("3");
  await page.getByLabel(/^Serial numbers/u).fill("PF5AA001\nPF5AA002\nPF5AA003");
  await page.getByRole("button", { name: "Add 3 items" }).click();
  await page.getByText(/3 items added: EQ-\d+ to EQ-\d+\./u).waitFor();
  await page.waitForURL(/sort=newest/u);
  expect((await page.locator(".line-name").allTextContents()).filter(n => n === "Lenovo ThinkPad T14 Gen 5").length === 3, "three in the list");
  expect((await page.locator(".lines").innerText()).includes("PF5AA003"), "serials kept");
  await page.goto(origin + "/chest/items/new");
  await page.getByLabel("Name or model").fill("Jabra Evolve2 55");
  await page.getByRole("button", { name: "Add and give to someone" }).click();
  await page.waitForURL(/\/chest\/items\/\d+/u);
  await page.getByPlaceholder("Find someone").fill("ine");
  await page.getByRole("option", { name: /Inès Moreau/u }).click();
  await page.getByRole("button", { name: "Give it to Inès Moreau" }).click();
  await page.getByText("Given to Inès Moreau.").waitFor();
});

await step("fields: phones carry an IMEI (searchable); a manager adds one to laptops, and fills it", async () => {
  await page.goto(origin + "/chest/items?q=356938035643817");
  expect((await page.locator(".line-name").allTextContents()).join("|") === "iPhone 15", "found by its IMEI");
  await page.locator(".line-main").first().click();
  await page.waitForURL(/\/chest\/items\/\d+$/u);
  expect((await page.locator(".facts").innerText()).includes("356938035643817"), "IMEI shown");
  await page.goto(origin + "/chest/settings");
  const laptops = page.locator(".cat-row").first();
  await laptops.locator(".fields-editor summary").click();
  await laptops.getByLabel("New field").fill("MDM ID");
  await laptops.getByRole("button", { name: "Add the field" }).click();
  await page.getByText("MDM ID added.").waitFor();
  await page.goto(origin + "/chest/items?q=EQ-0006");
  await page.waitForURL(/\/chest\/items\/\d+$/u);
  await page.locator(".holder-panel").getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await page.getByLabel(/^MDM ID/u).fill("INTUNE-7F3A-22");
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForURL(/\/chest\/items\/\d+$/u);
  expect((await page.locator(".facts").innerText()).includes("INTUNE-7F3A-22"), "field saved");
});

await step("supplies: two chargers left under a minimum of 3 — handed out, the managers hear it; restocked, the word goes", async () => {
  await page.goto(origin + "/chest");
  expect((await page.locator("#low").innerText()).includes("USB-C charger 65 W"), "running low on the overview");
  await page.locator("#low a", { hasText: "USB-C charger 65 W" }).click();
  await page.waitForURL(/\/chest\/items\/\d+$/u);
  await page.getByRole("button", { name: "Hand out" }).click();
  // The kit's segmented choice: the word is the target.
  await page.locator("dialog[open]").getByText("To a person", { exact: true }).click();
  expect(await page.getByRole("radio", { name: "To a person" }).isChecked(), "to a person");
  await page.getByPlaceholder("Find someone").fill("hug");
  await page.locator("dialog[open]").getByRole("option", { name: /Hugo Bernard/u }).click();
  await page.getByRole("button", { name: "Hand them out" }).click();
  await page.getByText("1 handed out.").waitFor();
  await page.waitForTimeout(800);
  expect((await dev()).includes("USB-C charger 65 W: 1 left"), "low-stock bell");
  await page.getByRole("button", { name: "Add stock" }).click();
  await page.getByLabel("How many came in").fill("10");
  await page.getByRole("button", { name: "Add to the stock" }).click();
  await page.getByText("10 added to the stock.").waitFor();
  await page.waitForTimeout(800);
  expect(!(await dev()).includes("USB-C charger 65 W: 1 left"), "bell withdrawn");
  expect((await page.locator(".holder-panel").innerText()).includes("11 in stock"), "count");
});

await step("a repair with its ticket and return day shows on the overview", async () => {
  await page.goto(origin + "/chest/items?q=EQ-0022");
  await page.waitForURL(/\/chest\/items\/\d+$/u);
  await page.locator(".holder-panel").getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Change the status" }).click();
  await page.locator("dialog[open] label.choice", { hasText: "In repair" }).click();
  await page.getByLabel(/^Repairer’s ticket/u).fill("RMA-88120");
  const due = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
  await page.getByLabel(/^Expected back/u).fill(due);
  await page.locator("dialog[open]").getByRole("button", { name: "Save" }).click();
  await page.waitForTimeout(1000);
  await page.reload();
  expect((await page.locator(".holder-panel").innerText()).includes("ticket RMA-88120"), "repair line");
  await page.goto(origin + "/chest");
  expect((await page.locator(".panel", { hasText: "Dell P2422H" }).last().innerText()).includes("expected back"), "overview");
});

await step("the inventory under way: a scanner types a tag or a label's link, a phone's camera opens a label and taps Seen; closed, the missing are listed", async () => {
  await page.goto(origin + "/chest");
  await page.getByRole("link", { name: "Inventory under way" }).click();
  await page.waitForURL(/\/chest\/inventory$/u);
  const seenBefore = Number((await page.locator(".scan-panel .holder-line").innerText()).split(" ")[0]);
  await page.getByLabel("Scan a label or type an asset tag").fill("eq-0002");
  await page.keyboard.press("Enter");
  await page.getByText(/EQ-0002 .*: seen\./u).waitFor();
  await page.getByLabel("Scan a label or type an asset tag").fill(origin + "/chest/items/4");
  await page.keyboard.press("Enter");
  await page.getByText(/EQ-0004 .*: seen\./u).waitFor();
  await page.goto(origin + "/chest/items/5");
  await page.getByRole("button", { name: "Seen", exact: true }).click();
  await page.getByText("Seen in this inventory.").waitFor();
  await page.goto(origin + "/chest/inventory");
  const seenAfter = Number((await page.locator(".scan-panel .holder-line").innerText()).split(" ")[0]);
  expect(seenAfter === seenBefore + 3, `progress ${seenBefore} → ${seenAfter}`);
  await page.getByRole("button", { name: "Close the inventory" }).click();
  await page.waitForURL(/\/chest\/inventory\/\d+$/u);
  expect((await page.locator("main").innerText()).includes("missing"), "report");
  // A new one can start.
  await page.goto(origin + "/chest/inventory");
  expect(await page.getByRole("button", { name: "Start an inventory" }).isVisible(), "start again");
});

await step("Snipe-IT's Custom Asset Report imports with its custom fields kept", async () => {
  await page.goto(origin + "/chest/import");
  await page.locator(".source").nth(0).locator("input[type=file]").setInputFiles("tools/private/equipment/test/fixtures/snipe-it-custom-asset-report.csv");
  await page.getByText("Check before importing").waitFor();
  const preview = await page.locator(".summary-box").innerText();
  expect(preview.includes("Keep these columns as fields") && preview.includes("IMEI") && preview.includes("New fields:"), "preview: " + preview.slice(0, 300));
  await page.getByRole("checkbox", { name: "MAC Address" }).uncheck();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Import 9 items" }).click();
  await page.getByText("9 items imported.").waitFor();
  await page.goto(origin + "/chest/items?q=ATL-0012");
  await page.waitForURL(/\/chest\/items\/\d+$/u);
  const facts = await page.locator(".facts").innerText();
  expect(facts.includes("macOS 15 Sequoia") && !facts.includes("A4:83"), "fields: " + facts.slice(0, 300));
});

await step("the initials of someone who left are theirs: TW for “Tom Walker (former member)”", async () => {
  await page.goto(origin + "/chest/people/" + id("tom"));
  expect((await page.locator(".person-head h1").innerText()).includes("(former member)"), "former");
  expect((await page.locator(".person-head .ck-avatar").innerText()).trim() === "TW", "initials");
  // A sheet kept as proof: his name alone, the day he left on its own line.
  await page.goto(origin + "/chest/people/" + id("tom") + "/return");
  const head = await page.locator(".paper-who").innerText();
  expect(head.includes("Tom Walker") && !head.includes("former member") && head.includes("Left on"), "return sheet head: " + head);
});

await step("phone, French: Inès reports a problem from her list; no horizontal scroll", async () => {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-FR" });
  await phone.addCookies([{ name: "dev_member", value: id("ines"), url: origin }, { name: "dev_locale", value: "fr", url: origin }]);
  const p = await phone.newPage();
  p.on("pageerror", e => problems.push("phone: " + e.message));
  await p.goto(origin + "/chest");
  expect(await p.getByRole("heading", { name: "Mon matériel" }).isVisible(), "mine fr");
  const text = await p.locator("main").innerText();
  expect(text.includes("1er février 2023") && text.includes("Licence attribuée le"), "French dates and words");
  const wide = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(!wide, "no horizontal scroll");
  await p.locator(".label-card", { hasText: "EQ-0011" }).getByRole("button", { name: "Signaler un problème" }).click();
  await p.getByLabel(/^Qu’est-ce qui ne va pas\u202f\?$/u).fill("L’écran est fissuré");
  await p.getByRole("button", { name: "Envoyer aux gestionnaires" }).click();
  await p.getByText("Envoyé. Les gestionnaires du matériel sont prévenus.").waitFor();
  // Her handover sheet's button says what it is, on the phone too.
  const sheetLink = p.getByRole("link", { name: "Ma fiche de remise" });
  expect(await sheetLink.isVisible() && (await sheetLink.innerText()).includes("Ma fiche de remise"), "labelled, not an icon alone");
  // "You confirmed it on…" only while it is news, not under every old item.
  expect(!(await p.locator("main").innerText()).includes("Vous avez confirmé l’avoir reçu le 3 janvier 2025"), "no old confirmation lines");
  for (const path of ["/chest/items", "/chest/items/2", "/chest/people/" + id("ines") + "/handover"]) {
    await p.goto(origin + path);
    expect(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), "no scroll on " + path);
  }
  await phone.close();
});

await step("the fields the tool proposed and its example rules read in French for Camille", async () => {
  await as(context, origin, "camille");
  await context.addCookies([{ name: "dev_locale", value: "fr", url: origin }]);
  await page.goto(origin + "/chest/settings");
  const text = await page.locator("main").innerText();
  expect(text.includes("Mémoire vive (Go)") && text.includes("Système d’exploitation"), "field names in French");
  expect((await page.locator("#rules-body").inputValue()).startsWith("Le matériel reste la propriété de l’entreprise"), "example rules in French");
  await page.goto(origin + "/chest/people/" + id("hugo") + "/handover");
  const sheet = await page.locator(".paper").innerText();
  expect(sheet.includes("Le matériel reste la propriété") && !sheet.includes("RAM (GB)"), "sheet in French");
  await english();
});

await step("a dialog never loses what was typed: Escape asks first; Keep editing, then Discard", async () => {
  await as(context, origin, "sofia");
  await english();
  await page.goto(itemUrl);
  await page.getByRole("button", { name: "Take back" }).first().click();
  await page.getByLabel(/^Condition/u).fill("Scratched lid");
  await page.keyboard.press("Escape");
  await page.getByText("Discard your changes?").waitFor();
  await page.getByRole("button", { name: "Keep editing" }).click();
  expect((await page.getByLabel(/^Condition/u).inputValue()) === "Scratched lid", "text kept");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Discard" }).click();
  expect(await page.locator("dialog[open]").count() === 0, "closed");
});

await browser.close();
done(problems);
