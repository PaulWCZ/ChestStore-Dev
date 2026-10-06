// Goals, as people use it, in a real browser: node lab/chest-dev/flows/goals.mjs [port]
// (the harness runs the tool with --reset: Atelier Martin's sample cycles are there).
// With --empty, a new company's first visit instead (the harness runs with --reset --empty).
import { fileURLToPath } from "node:url";
import { as, control, done, expect, id, open, step } from "./lib.mjs";

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
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: process.env.CHEST_TIME_ZONE || "Europe/Paris" }).format(new Date());
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
    expect((await page.locator("main").innerText()).includes("Ask Camille Martin to start the first quarter"), "member told whom to ask, by name");
    await english("camille");
    await page.goto(origin + "/chest");
    const start = page.getByRole("button", { name: new RegExp(`^Start ${main} \\(`, "u") });
    expect(await start.isVisible(), "main button with its dates");
    expect(await page.getByRole("button", { name: `Start ${main} and import a spreadsheet` }).isVisible(), "a company leaving its OKR sheet can import from the first screen");
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
  expect(await page.getByRole("heading", { name: "This week’s updates" }).isVisible(), "waiting section");
  const item = page.locator(".waiting-item", { hasText: "Shops signed" });
  await item.getByLabel("Value now").fill("6");
  await item.locator("label.segment", { hasText: "On track" }).click();
  await item.getByLabel("What happened?").fill("Signed Meubles Durand in Grenoble");
  await item.getByRole("button", { name: "Save the update" }).click();
  await page.waitForSelector(".ck-toast");
  expect((await page.locator(".ck-toast").innerText()).includes("Updated."), "toast");
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
  await item.getByRole("button", { name: "Save the update" }).click();
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
  await item.getByRole("button", { name: "Save the update" }).click();
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
  // The unit in the plural only; the form for one is guessed, to correct.
  await rows.nth(0).getByLabel("Counted in").fill("visits");
  expect(await rows.nth(0).getByLabel("For 1, write").inputValue() === "visit", "the singular guessed");
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
  // The fold is the browser's own <details> (no script): its button says
  // what it shows, and whether it is open.
  const shown = () => page.locator(".tree .node:visible").count();
  const before = await shown();
  const fold = page.locator(".branch > summary", { hasText: "What supports “Win 20 new customers in Lyon”" });
  await fold.click();
  expect((await shown()) < before, "folded");
  await fold.click();
  expect((await shown()) === before, "unfolded");
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
  await page.getByRole("button", { name: /Reporter sur \S+ – \S+ \d{4}/u }).click();
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

await step("an end before the cycle's start is refused: said under the field, Save waits, the old end kept; a good end saved (kit 0.2.4)", async () => {
  // The dialog saves from its own state: before 0.2.4 the previous end
  // would have gone in place of the refused one.
  // The coming cycle (the tool names it from its dates: its name follows its end).
  const row = () => page.locator("ul.rows > li", { hasText: "À VENIR" });
  const edit = async () => {
    await page.goto(origin + "/chest/cycles");
    await row().getByRole("button", { name: /^Plus pour/u }).click();
    await page.getByRole("menuitem", { name: "Modifier" }).click();
    return page.locator("dialog[open]").getByLabel("Fin", { exact: true });
  };
  await page.goto(origin + "/chest/cycles");
  const shown = await row().innerText();
  let end = await edit();
  const before = await end.inputValue();
  await end.fill("01/01/2020");
  await end.press("Tab");
  const said = page.locator("dialog[open] .ck-date .ck-error");
  await said.waitFor();
  expect((await said.innerText()).includes("ou après"), "the field says why: " + (await said.innerText()));
  expect((await end.inputValue()) === "01/01/2020", "what was typed stays");
  expect(await page.locator("dialog[open]").getByRole("button", { name: "Enregistrer" }).isDisabled(), "Save waits while the end is refused");
  await page.locator("dialog[open]").getByLabel("Nom").press("Enter");
  await page.waitForTimeout(1000);
  expect(await page.locator(".ck-toast", { hasText: "Enregistré." }).count() === 0, "nothing sent");
  await page.goto(origin + "/chest/cycles");
  expect((await row().innerText()) === shown, "the stored end is untouched: " + (await row().innerText()));
  // A good end is saved; then the cycle's own end goes back.
  for (const day of ["30/04/2027", before]) {
    end = await edit();
    await end.fill(day);
    await end.press("Tab");
    await page.locator("dialog[open]").getByRole("button", { name: "Enregistrer" }).click();
    await page.locator("dialog[open]").waitFor({ state: "detached" }).catch(() => {});
    await page.waitForTimeout(800);
    end = await edit();
    expect((await end.inputValue()) === day, "saved: " + day + " / " + (await end.inputValue()));
    await page.keyboard.press("Escape");
  }
});

await step("Friday's reminder reaches whoever has key results waiting, in their language", async () => {
  await page.request.post(origin + "/_dev/schedule", { form: { name: "reminder" } });
  const bell = await dev();
  expect(/attendent votre point de la semaine|attend votre point de la semaine/u.test(bell), "French reminder");
  expect(/wait for your weekly update|waits for your weekly update/u.test(bell), "English reminder");
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

await step("Hugo chose one email a day in his Chest: My goals says so under the switch; back to every email, it says nothing", async () => {
  const note = "In your Chest settings you chose one email a day: they wait for it.";
  await control(page, origin, "member", { member: id("hugo"), mailPreference: "digest" });
  await page.goto(origin + "/chest");
  expect((await page.locator("main").innerText()).includes(note), "the digest is said");
  await control(page, origin, "member", { member: id("hugo"), mailPreference: "all" });
  await page.goto(origin + "/chest");
  expect(!(await page.locator("main").innerText()).includes(note), "nothing said for every email");
  expect(await page.getByRole("switch", { name: /Also email me/u }).isChecked(), "the tool's own switch unchanged");
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
  await page.waitForSelector(".ck-toast >> text=Tom Walker is reminded, in the bell and by email.");
  expect((await row.innerText()).includes("Reminded today"), "marked");
  const bell = await dev();
  expect(bell.includes("Camille Martin asks for your weekly update"), "bell and outbox");
});

await step("someone who turned the reminders' email off is reminded in the bell only, and the toast says so", async () => {
  // Another person still waiting for a check-in.
  const next = page.locator(".chase-rows > li", { has: page.getByRole("button", { name: /^Remind / }) }).first();
  const name = (await next.getByRole("button", { name: /^Remind / }).getAttribute("aria-label")).replace(/^Remind /u, "");
  const handle = name.split(" ")[0].normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  await english(handle);
  await page.goto(origin + "/chest");
  await page.getByRole("switch", { name: /Also email me/u }).uncheck();
  await page.waitForSelector(".ck-toast >> text=Reminders stay in the bell only.");
  await english("camille");
  await page.goto(origin + "/chest/company");
  await page.locator(".chase summary").click();
  // The newest message of the harness's outbox, before and after.
  const newest = async () => ((await dev()).split("<p>Outbox:</p><ul>")[1] ?? "").split("</li>")[0];
  const emailsBefore = await newest();
  const row = page.locator(".chase-rows > li", { hasText: name });
  await row.getByRole("button", { name: `Remind ${name}` }).click();
  await page.waitForSelector(`.ck-toast >> text=${name} is reminded in the bell.`);
  expect((await newest()) === emailsBefore, `no email to ${name}`);
  // Back on, as they had it.
  await english(handle);
  await page.goto(origin + "/chest");
  await page.getByRole("switch", { name: /Also email me/u }).check();
  await page.waitForSelector(".ck-toast >> text=Reminders will also come by email.");
  await english("camille");
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
  expect(await page.locator(".ck-filter-chip[aria-current=true]", { hasText: / – .* \d{4}/u }).count() === 1, "the cycle shown is a chosen chip");
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

await step("a cycle the tool named reads in each reader's language; the phone Company page shows the tree first", async () => {
  await english("hugo");
  await page.goto(origin + "/chest/company");
  const en = await page.locator(".cycle-chip strong").first().innerText();
  await french("lea");
  await page.goto(origin + "/chest/company");
  const fr = await page.locator(".cycle-chip strong").first().innerText();
  expect(en !== fr && / – /u.test(en) && / – /u.test(fr) && !/Autumn/u.test(fr), `cycle names per language: ${en} / ${fr}`);
  expect(!(await page.locator("main").innerText()).includes("En retard"), "off track is not Tasks' “late” in French");
  await page.setViewportSize({ width: 390, height: 844 });
  await french("camille");
  await page.goto(origin + "/chest/company");
  expect(await page.getByRole("button", { name: "Tableur" }).isVisible(), "import and download in one menu");
  expect(!(await page.getByRole("link", { name: "Importer depuis un tableur" }).isVisible()), "no import button on the page");
  const tree = await page.locator(".tree").first().boundingBox();
  const chase = (await page.locator(".chase").count()) ? await page.locator(".chase").boundingBox() : null;
  expect(!chase || tree.y < chase.y, "the tree before the waiting list");
  // Where a person sees it: the first objective starts within the first
  // screen (844 px), measured on the page — not only its order in the DOM.
  for (const [who, speak] of [["camille", french], ["hugo", english]]) {
    await speak(who);
    await page.goto(origin + "/chest/company");
    const top = await page.evaluate(() => { const a = document.querySelector('.tree a[href^="/chest/objectives/"]'); return a ? a.getBoundingClientRect().top + window.scrollY : null; });
    expect(top !== null && top < 844, `${who}: the first objective at y = ${top}, within the first screen`);
  }
  // The choices fold behind one button; one tap shows them.
  await french("camille");
  await page.goto(origin + "/chest/company");
  expect(!(await page.locator(".filters").isVisible()) && !(await page.locator(".tree-tools .foldable").isVisible()), "status, team, owner and cycle folded");
  await page.getByRole("button", { name: "Filtres" }).click();
  expect(await page.locator(".filters").isVisible(), "shown by the Filters button");
  expect(await page.locator(".overview .tally.compact").isVisible() && !(await page.locator(".overview .card + .card").isVisible()), "the confidence in one line under the progress");
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto(origin + "/chest/company");
  expect(await page.locator(".filters").isVisible() && !(await page.getByRole("button", { name: "Filtres" }).isVisible()), "on a large screen: all in sight, no button");
});

await step("key results fed by Support and Tasks: counted from what the tools told, per owner, per board", async () => {
  await english("hugo");
  await page.goto(origin + "/chest/objectives/8");
  const card = page.locator(".kr-card", { hasText: "Support tickets solved" });
  const text = await card.innerText();
  expect(text.includes("7 tickets") && text.includes("Fed by Support"), "Hugo's solved tickets, fed by Support: " + text.slice(0, 160));
  await english("camille");
  await page.goto(origin + "/chest/objectives/9");
  await page.getByRole("button", { name: "Add a key result" }).first().click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByLabel("What we’ll count").fill("Workshop cards done");
  await dialog.locator("summary", { hasText: "More options" }).click();
  await dialog.getByLabel("Its value").selectOption("tasks.done");
  await dialog.getByLabel("Board").selectOption({ label: "Workshop orders" });
  expect(await dialog.getByText("Only the cards its owner is on").isVisible(), "only theirs, where the tool names people");
  await dialog.getByLabel("To", { exact: true }).fill("30");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForSelector(".kr-card:has-text('Workshop cards done')");
  const fed = await page.locator(".kr-card", { hasText: "Workshop cards done" }).innerText();
  expect(fed.includes("Fed by Tasks") && /\b1\b/u.test(fed), "one card done on that board this cycle: " + fed.slice(0, 160));
});

await step("Tasks and Support tell Goals, in their exact shapes: a card done and a ticket solved move key results; reopened, they go back", async () => {
  // As Tasks (lib/card-events.ts) and Support (lib/ticket-events.ts) publish them.
  const deliver = (type, data) => page.request.post(origin + "/_dev/deliver", { form: { type, data: JSON.stringify(data) } });
  const value = async (objective, title) => {
    await page.goto(origin + `/chest/objectives/${objective}`);
    return page.locator(".kr-card", { hasText: title }).innerText();
  };
  await english("camille");
  expect(/\b1\b/u.test(await value(9, "Workshop cards done")), "one card before");
  await deliver("tasks.card.done", { card: "57", board: "3", boardName: "Workshop orders", assignees: ["mbr_hugoaaaaaaaaaaaaaaaaaaaaaa", "mbr_tomaaaaaaaaaaaaaaaaaaaaaaa"] });
  const done = await value(9, "Workshop cards done");
  expect(/\b2\b/u.test(done) && !/\b1 card\b/u.test(done), "two cards once Tasks told the second: " + done.slice(0, 160));
  expect((await value(8, "Support tickets solved")).includes("7 tickets"), "seven tickets before");
  await deliver("helpdesk.ticket.solved", { ticket: "1142", assignee: "mbr_hugoaaaaaaaaaaaaaaaaaaaaaa" });
  await deliver("helpdesk.ticket.solved", { ticket: "1143", assignee: null });
  expect((await value(8, "Support tickets solved")).includes("8 tickets"), "Hugo's ticket counted, not the one nobody had");
  await deliver("tasks.card.reopened", { card: "57" });
  await deliver("helpdesk.ticket.reopened", { ticket: "1142" });
  expect((await value(8, "Support tickets solved")).includes("7 tickets"), "the reopened ticket taken back");
  expect(/\b1\b/u.test(await value(9, "Workshop cards done")), "the reopened card taken back");
});

await step("teams: every group of the Chest is offered; a French unit reads by its own rule", async () => {
  await english("camille");
  await page.goto(origin + "/chest/settings");
  expect((await page.locator("main").innerText()).includes("Tech"), "a group not yet a team is offered");
  await french("camille");
  await page.goto(origin + "/chest/objectives/4");
  const main = await page.locator("main").innerText();
  expect(!/\b0 customer\b/u.test(main), "never “0 customer” (an English unit keeps English grammar)");
});

await step("the dark map band is the Trail map's own: another look gets the kit's normal header", async () => {
  await english("hugo");
  const band = async () => page.locator(".ck-bar").evaluate(e => { const [r, g, b] = getComputedStyle(e).backgroundColor.match(/\d+/gu).map(Number); return (r + g + b) / 3; });
  await page.goto(origin + "/chest");
  expect((await band()) < 90, "own look: the dark band");
  const set = async choice => page.request.post(origin + "/_dev/theme", { form: { level: "all", choice }, maxRedirects: 0 });
  await set("catalogue:chest");
  await page.goto(origin + "/chest");
  expect((await band()) > 200, "the Chest's look: a light header like Tasks and Wiki");
  await set("brand:sample");
  await page.goto(origin + "/chest");
  expect((await band()) > 150, "a brand: the kit's header");
  await set("own");
});

await browser.close();
done(problems);
