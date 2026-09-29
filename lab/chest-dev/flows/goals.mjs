// Goals, as people use it, in a real browser: node lab/chest-dev/flows/goals.mjs [port]
// (the harness runs the tool with --reset: Atelier Martin's sample cycles are there).
// With --empty, a new company's first visit instead (the harness runs with --reset --empty).
import { fileURLToPath } from "node:url";
import { as, done, expect, open, step } from "./lib.mjs";

const port = Number(process.argv[2] ?? 5600);
const fixtures = fileURLToPath(new URL("../../../tools/private/goals/test/fixtures/", import.meta.url));
const { browser, context, page, origin, problems } = await open(port, "hugo", { locale: "en" });
const english = async member => {
  await as(context, origin, member);
  await context.addCookies([{ name: "dev_locale", value: "en", url: origin }]);
};
const french = async member => {
  await as(context, origin, member);
  await context.addCookies([{ name: "dev_locale", value: "fr", url: origin }]);
};
const dev = async () => (await (await page.request.get(origin + "/_dev")).text());

if (process.argv.includes("--empty")) {
  // A new company's first visit: the quarter offered is chosen on the
  // Chest's calendar (Europe/Paris in the harness); in the last 14 days of a
  // quarter, the next one comes first.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);
  const q = Math.floor((m - 1) / 3);
  const end = new Date(Date.UTC(y, q * 3 + 3, 0));
  const left = Math.round((end.getTime() - Date.UTC(y, m - 1, d)) / 864e5);
  const late = left < 14;
  const next = q === 3 ? `Q1 ${y + 1}` : `Q${q + 2} ${y}`;
  const main = late ? next : `Q${q + 1} ${y}`;

  await step(`a member of an empty Chest is told an admin starts; the admin is offered ${main}${late ? " first, the current quarter second" : ""}`, async () => {
    await english("hugo");
    await page.goto(origin + "/chest");
    expect((await page.locator("main").innerText()).includes("An admin starts the first cycle"), "member told");
    await english("camille");
    await page.goto(origin + "/chest");
    const start = page.getByRole("button", { name: new RegExp(`^Start ${main} \\(`, "u") });
    expect(await start.isVisible(), "main button with its dates");
    if (late) expect(await page.getByRole("button", { name: new RegExp(`^Or start Q${q + 1} ${y} now`, "u") }).isVisible(), "the current quarter as a second choice");
    await start.click();
    await page.waitForURL(/\/chest\/company/u);
    const text = await page.locator("main").innerText();
    expect(text.includes(main), "cycle chip");
    expect(!/1 day left/u.test(text), "never a cycle with one day left");
    expect(await page.getByRole("link", { name: "Import from a spreadsheet" }).first().isVisible(), "import offered on the empty company");
  });
  await browser.close();
  done(problems);
}

await step("Hugo sees his check-ins of the week and checks one in with a note", async () => {
  await page.goto(origin + "/chest");
  expect(await page.getByRole("heading", { name: "This week’s check-ins" }).isVisible(), "waiting section");
  const item = page.locator(".waiting-item", { hasText: "Shops signed" });
  await item.getByLabel("Value now").fill("6");
  await item.locator("label.segment", { hasText: "On track" }).click();
  await item.getByLabel("What happened?").fill("Signed Meubles Durand in Grenoble");
  await item.getByRole("button", { name: "Check in" }).click();
  await page.waitForSelector(".ck-toast");
  expect((await page.locator(".ck-toast").innerText()).includes("Checked in"), "toast");
  await page.waitForTimeout(800);
  expect(await page.locator(".waiting-item", { hasText: "Shops signed" }).count() === 0, "left the list");
});

await step("…takes it back with Undo, then checks in again", async () => {
  await page.locator(".ck-toast-undo").click();
  await page.waitForSelector(".ck-toast >> text=Undone.");
  await page.waitForTimeout(500);
  await page.reload();
  const item = page.locator(".waiting-item", { hasText: "Shops signed" });
  expect(await item.count() === 1, "back in the list");
  await item.getByLabel("Value now").fill("6");
  await item.locator("label.segment", { hasText: "On track" }).click();
  await item.getByRole("button", { name: "Check in" }).click();
  await page.waitForSelector(".ck-toast");
  await page.goto(origin + "/chest/objectives/7");
  const card = page.locator(".kr-card", { hasText: "Shops signed" });
  expect((await card.innerText()).includes("6 shops"), "new value on the objective");
  expect((await card.innerText()).includes("Signed Meubles Durand") === false, "the undone note is gone");
});

await step("a check-in without a confidence is refused on the spot", async () => {
  await page.goto(origin + "/chest");
  const item = page.locator(".waiting-item", { hasText: "Customers lost" });
  await item.getByLabel("Value now").fill("abc");
  await item.getByRole("button", { name: "Check in" }).click();
  await page.waitForSelector(".waiting-item .error");
  expect((await item.locator(".error").innerText()).length > 0, "error shown");
});

let created = "";
await step("Hugo writes a Sales objective with two key results, supporting a company one", async () => {
  await page.goto(origin + "/chest/objectives/new");
  await page.getByLabel("Team", { exact: true }).selectOption({ label: "Sales" });
  await page.getByLabel("Objective", { exact: true }).fill("Double the showroom visits");
  await page.getByLabel("Why it matters").fill("Visitors who see the furniture buy twice as often.");
  await page.getByLabel("Helps a bigger goal").selectOption({ label: "Win 20 new customers in Lyon" });
  // The hint under an empty target never reads as a value.
  expect(!(await page.locator(".kr-row").first().innerText()).includes("From 0 to 20"), "no example value");
  const rows = page.locator(".kr-row");
  await rows.nth(0).getByLabel("What we’ll count", { exact: true }).fill("Showroom visits a month");
  await rows.nth(0).getByLabel("To", { exact: true }).fill("80");
  await rows.nth(0).getByLabel("Unit").fill("visit/visits");
  expect((await rows.nth(0).locator(".summary-line").innerText()).includes("From 0 to 80 visits"), "the sentence says the measure back");
  await page.getByRole("button", { name: "Add a key result" }).click();
  await rows.nth(1).getByLabel("What we’ll count", { exact: true }).fill("New showroom signage installed");
  await rows.nth(1).getByLabel("Measured as").selectOption("milestone");
  await rows.nth(1).getByRole("combobox", { name: "Owner" }).fill("Inès");
  await page.getByRole("option", { name: /Inès Moreau/u }).click();
  await page.getByRole("button", { name: "Create the objective" }).click();
  await page.waitForURL(/\/chest\/objectives\/\d+$/u);
  created = page.url();
  const text = await page.locator("main").innerText();
  expect(text.includes("Double the showroom visits"), "title");
  expect(text.includes("Showroom visits a month") && text.includes("New showroom signage installed"), "key results");
  expect(text.includes("Win 20 new customers in Lyon"), "supports");
});

await step("…comments on it; Inès hears of the key result and the comment in French", async () => {
  await page.getByLabel("Write a comment").fill("Inès, can you order the signs?");
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await page.waitForSelector(".comment .body");
  const bell = await dev();
  expect(bell.includes("Hugo Bernard vous a confié un résultat clé"), "given, in French");
  expect(bell.includes("Hugo Bernard a commenté"), "comment, in French");
});

await step("a member cannot write a company objective; Nora, without a role, sees why", async () => {
  await page.goto(origin + "/chest/objectives/new?level=company");
  expect(await page.locator("input[value=company]").count() === 0, "no company choice for a member");
  await english("nora");
  await page.goto(origin + "/chest");
  expect((await page.locator("main").innerText()).includes("You can’t use Goals yet"), "no access");
});

await step("the company tree folds and unfolds; the cycle downloads as a spreadsheet", async () => {
  await english("sofia");
  await page.goto(origin + "/chest/company");
  const before = await page.locator(".tree .node").count();
  await page.getByRole("button", { name: /Hide what supports “Win 20 new customers in Lyon”/u }).click();
  expect(await page.locator(".tree .node").count() < before, "folded");
  await page.getByRole("button", { name: /Show what supports “Win 20 new customers in Lyon”/u }).click();
  expect(await page.locator(".tree .node").count() === before, "unfolded");
  const csv = await (await page.request.get(origin + "/chest/cycles/2/export")).text();
  expect(csv.startsWith("﻿Level,Team,Objective"), "csv headers");
  expect(csv.includes("Double the showroom visits"), "new objective exported");
});

await step("Camille (admin, French) hands Paul's key result to Tom; the banner goes", async () => {
  await french("camille");
  await page.goto(origin + "/chest");
  expect((await page.locator(".banner").innerText()).includes("nouveau responsable"), "banner");
  await page.goto(origin + "/chest/settings");
  await page.locator(".orphans").first().getByRole("combobox").first().fill("Tom");
  await page.getByRole("option", { name: /Tom Walker/u }).click();
  await page.getByRole("button", { name: "Confier", exact: true }).first().click();
  await page.waitForSelector("text=Chaque objectif a un responsable.");
  await page.goto(origin + "/chest");
  expect(await page.locator(".banner").count() === 0, "no banner");
});

await step("Camille adds the Chest's Tech group as a team, and turns personal objectives on", async () => {
  await page.goto(origin + "/chest/settings");
  await page.getByRole("button", { name: /Ajouter 1 groupe/u }).click();
  await page.waitForSelector(".rows a:has-text('Tech')");
  await page.getByLabel("Autoriser les objectifs personnels").check();
  await page.waitForSelector("text=Les objectifs personnels sont activés.");
  await page.goto(origin + "/chest/teams");
  expect((await page.locator(".team-grid").innerText()).includes("Tech"), "Tech team");
});

await step("Camille writes the retrospective of a closed cycle's objective, and carries it over", async () => {
  await page.goto(origin + "/chest/objectives/2");
  await page.getByLabel("Note", { exact: true }).fill("50");
  await page.getByLabel("Ce que nous avons appris").fill("Une annonce plus précise sur nos machines.");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.waitForSelector("text=Rétrospective enregistrée.");
  await page.getByRole("button", { name: /Reporter sur Autumn 2026/u }).click();
  await page.waitForSelector(".ck-toast >> text=Reporté");
  await page.goto(origin + "/chest/cycles/1");
  expect((await page.locator("main").innerText()).includes("Une annonce plus précise"), "review shows the learning");
});

await step("Camille starts the next cycle", async () => {
  await page.goto(origin + "/chest/cycles");
  await page.getByRole("button", { name: "Nouveau cycle" }).click();
  await page.getByRole("button", { name: "Créer le cycle" }).click();
  await page.waitForSelector("text=Cycle créé.");
  await page.waitForFunction(() => document.querySelectorAll("ul.rows > li").length === 3, null, { timeout: 5000 });
  expect((await page.locator("ul.rows").innerText()).includes("T1 2027"), "T1 2027 (Camille reads French) suggested and created");
});

await step("Friday's reminder reaches whoever has key results waiting, in their language", async () => {
  await page.request.post(origin + "/_dev/schedule", { form: { name: "reminder" } });
  const bell = await dev();
  expect(/attendent votre point de la semaine|attend votre point de la semaine/u.test(bell), "French reminder");
  expect(/wait for your weekly check-in|waits for your weekly check-in/u.test(bell), "English reminder");
});

await step("a quiet week: Hugo checks in \"Same as last week\" in one click", async () => {
  await english("hugo");
  await page.goto(origin + "/chest");
  const item = page.locator(".waiting-item", { hasText: "Customers lost" });
  await item.getByRole("button", { name: /Same as last week/u }).click();
  await page.waitForSelector(".ck-toast");
  await page.waitForTimeout(800);
  expect(await page.locator(".waiting-item", { hasText: "Customers lost" }).count() === 0, "left the list");
  expect((await page.locator("main").innerText()).includes("1 customer") && !(await page.locator("main").innerText()).includes("1 customers"), "one customer, not customers");
});

await step("Hugo turns the reminders' email off (and on again)", async () => {
  const toggle = page.getByRole("switch", { name: /Also email me/u });
  await toggle.uncheck();
  await page.waitForSelector(".ck-toast >> text=Reminders stay in the bell only.");
  await toggle.check();
  await page.waitForSelector(".ck-toast >> text=Reminders will also come by email.");
});

await step("the company tree filters by status and owner, kept in the address", async () => {
  await english("sofia");
  await page.goto(origin + "/chest/company");
  await page.locator(".ck-filter-chip", { hasText: "At risk" }).click();
  await page.waitForURL(/status=at_risk/u);
  const title = await page.locator("#found").innerText();
  expect(/objectives? match/u.test(title), "matches: " + title);
  expect(!(await page.locator("main").innerText()).includes("Halve the time we spend on paperwork"), "on-track objective hidden");
  await page.locator(".owner-filter").getByRole("combobox", { name: "Owner" }).fill("Tom");
  await page.getByRole("option", { name: /Tom Walker/u }).click();
  await page.waitForURL(/owner=mbr_tom/u);
  expect((await page.locator("main").innerText()).includes("Deliver every order on time"), "Tom's at risk objective");
  await page.getByRole("link", { name: "Clear filters" }).click();
  await page.waitForURL(u => !/status=/u.test(String(u)) && !/owner=/u.test(String(u)));
});

await step("a confidential objective: Tom (chosen) sees it, Sofia does not", async () => {
  expect(!(await page.locator("main").innerText()).includes("Keep payroll within the new budget"), "hidden from Sofia");
  const hidden = await page.request.get(origin + "/chest/objectives/11");
  expect(hidden.status() === 404, "its page is not found for Sofia: " + hidden.status());
  await english("tom");
  await page.goto(origin + "/chest/company");
  expect((await page.locator("main").innerText()).includes("Keep payroll within the new budget"), "Tom sees it");
  await page.goto(origin + "/chest/objectives/11");
  expect((await page.locator(".facts").innerText()).includes("Tom Walker, its owners and the admins"), "who sees it");
});

await step("a lowered target is in the key result's history, with who lowered it", async () => {
  await page.goto(origin + "/chest/objectives/4");
  const card = page.locator(".kr-card", { hasText: "New customers signed" });
  expect((await card.locator(".changes").innerText()).includes("Target changed from 25 customers to 20 customers · by Camille Martin"), "change shown");
});

await step("Camille sees who has not checked in and reminds Tom: the bell and an email", async () => {
  await english("camille");
  await page.goto(origin + "/chest/company");
  await page.locator(".chase summary").click();
  const row = page.locator(".chase-rows > li", { hasText: "Tom Walker" });
  await row.getByRole("button", { name: "Remind Tom Walker" }).click();
  await page.waitForSelector(".ck-toast >> text=Tom Walker is reminded");
  expect((await row.innerText()).includes("Reminded today"), "marked");
  const bell = await dev();
  expect(bell.includes("Camille Martin asks for your weekly check-in"), "bell and outbox");
});

await step("Camille imports Lattice's goals file: columns guessed, an unknown owner given to Sofia, then Undo", async () => {
  await page.goto(origin + "/chest/import");
  await page.getByLabel("Choose a CSV file").setInputFiles(fixtures + "lattice-goals.csv");
  await page.waitForSelector(".import-list");
  expect((await page.locator("main").innerText()).includes("2 objectives and 5 key results will be added"), "summary");
  const pick = page.locator(".owner-pick", { hasText: "jean.dupont@atelier-martin.fr" });
  await pick.getByRole("combobox").fill("Sofia");
  await page.getByRole("option", { name: /Sofia Rossi/u }).click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Import 2 objectives" }).click();
  await page.waitForURL(/\/chest\/company/u);
  await page.waitForSelector("text=Grow revenue in the Lyon region");
  expect((await page.locator(".ck-toast").innerText()).includes("Imported"), "toast");
  await page.locator(".ck-toast-undo").click();
  await page.waitForSelector(".ck-toast >> text=Undone.");
  await page.reload();
  expect(!(await page.locator("main").innerText()).includes("Grow revenue in the Lyon region"), "undone");
});

await step("a key result fed by Clients (the CRM) follows the deals won", async () => {
  await page.goto(origin + "/chest/objectives/4");
  await page.getByRole("button", { name: "Add a key result" }).first().click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByLabel("What we’ll count").fill("Amount won with new customers");
  await dialog.locator("summary", { hasText: "More options" }).click();
  await dialog.getByLabel("Its value").selectOption("crm.won_amount");
  await dialog.getByLabel("To", { exact: true }).fill("40000");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForSelector(".kr-card:has-text('Amount won with new customers')");
  await page.request.post(origin + "/_dev/deliver", { form: { type: "crm.deal.won", data: JSON.stringify({ deal: "D-42", title: "Maison Rivière", amount: 1250000, currency: "EUR", company: null, contact: null, owner: null }) } });
  await page.reload();
  const card = page.locator(".kr-card", { hasText: "Amount won with new customers" });
  expect((await card.innerText()).includes("€12,500"), "value from the CRM: " + (await card.innerText()).slice(0, 200));
  expect((await card.innerText()).includes("Fed by Clients (the CRM)"), "tag");
});

await step("every check-in downloads as a spreadsheet (the trend a company keeps when it leaves)", async () => {
  const csv = await (await page.request.get(origin + "/chest/cycles/2/export?what=check-ins")).text();
  expect(csv.startsWith("\uFEFFDate,Objective,Key result,Value,Unit,Confidence,Note,By"), "headers: " + csv.slice(0, 80));
  expect(csv.includes("Signed Meubles Durand") === false && csv.includes("The trade show brought eleven good leads."), "notes");
});

await step("someone leaves: the admins are told, their goals wait for a new owner", async () => {
  await page.request.post(origin + "/_dev/event", { form: { type: "member.removed", member: "mbr_sofiaaaaaaaaaaaaaaaaaaaaaa" } });
  await french("camille");
  await page.goto(origin + "/chest");
  expect((await page.locator(".banner").innerText()).includes("nouveau responsable"), "banner again");
  await page.goto(origin + "/chest/objectives/6");
  expect((await page.locator("main").innerText()).includes("Sofia Rossi (ancien membre)"), "former member");
});

await step("the tree shows at risk and off track together; the cycle is always one of the chips", async () => {
  await english("sofia");
  await page.goto(origin + "/chest/company");
  await page.locator(".ck-filter-chip", { hasText: "At risk" }).click();
  await page.waitForURL(/status=at_risk/u);
  await page.locator(".ck-filter-chip", { hasText: "Off track" }).click();
  await page.waitForURL(/status=at_risk(%2C|,)off_track/u);
  const text = await page.locator("main").innerText();
  expect(text.includes("Deliver every order on time"), "an at-risk objective");
  expect(!text.includes("Halve the time we spend on paperwork"), "on-track objective hidden");
  expect(await page.locator(".ck-filter-chip[aria-current=true]", { hasText: "Autumn 2026" }).count() === 1, "the cycle shown is a chosen chip");
});

await step("a key result's dialog never loses what was typed: Escape asks first", async () => {
  await english("camille");
  await page.goto(origin + "/chest/objectives/4");
  await page.getByRole("button", { name: "Add a key result" }).first().click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByLabel("What we’ll count").fill("Visits to the new showroom");
  await page.keyboard.press("Escape");
  await dialog.getByText("Discard your changes?").waitFor();
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  expect(await dialog.getByLabel("What we’ll count").inputValue() === "Visits to the new showroom", "text kept");
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: "Discard" }).click();
  expect(await page.locator("dialog[open]").count() === 0, "closed once discarded");
});

await step("phone width: My goals, the tree and an objective fit the screen", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/chest", "/chest/company", "/chest/objectives/4", created.replace(origin, ""), "/chest/settings"]) {
    await page.goto(origin + path);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width <= 392, `${path} overflows: ${width}`);
  }
});

await browser.close();
done(problems);
