// People, as the team uses it, in a real browser: node lab/chest-dev/flows/people.mjs [port]
// (the harness runs the tool with --reset: the sample company is there, Nora
// started six days ago and her welcome checklist is under way).
import { readFileSync, writeFileSync } from "node:fs";
import { as, done, expect, id, open, step } from "./lib.mjs";

const port = Number(process.argv[2] ?? 4700);
const { browser, context, page, origin, problems } = await open(port, "hugo", { locale: "en", allow404: /\/chest\/(checklists|records(\/\d+)?|people\/mbr_\w+\/edit)$/u });
const tmp = process.env.TMPDIR ?? "/tmp";
const cards = () => page.locator(".wall .person-name").allTextContents();
let noraRecord = "";

await step("a member finds people by name (accents aside), by topic, by team", async () => {
  await page.goto(origin + "/chest");
  expect((await page.locator(".hello-card").innerText()).includes("Say hello to Nora"), "newcomer greeted");
  await page.getByPlaceholder("A name, a job, a topic…").fill("ines");
  expect((await cards()).join("|") === "Inès Moreau", "accent-insensitive: " + (await cards()).join("|"));
  await page.getByPlaceholder("A name, a job, a topic…").fill("printers");
  expect((await cards()).join("|") === "Léa Dubois", "by topic");
  await page.getByRole("button", { name: "Clear" }).click();
  await page.locator(".filter select").first().selectOption("Tech");
  expect((await cards()).join("|") === "Léa Dubois|Tom Walker", "by team: " + (await cards()).join("|"));
  expect(page.url().includes("team=Tech"), "filter kept in the address");
});

await step("a profile shows the manager and the team, and calls in one tap", async () => {
  await page.goto(origin + "/chest/people/" + id("ines"));
  const text = await page.locator("main").innerText();
  expect(text.includes("Head of sales") && text.includes("Camille Martin") && text.includes("Nora Petit"), "manager and reports");
  expect(await page.locator('a[href^="tel:+33612457890"]').count() === 1, "tel link");
  expect(await page.getByRole("link", { name: "Edit" }).count() === 0, "a member cannot edit someone else");
});

await step("a member ticks their to-do, undoes it, ticks it again; the tab's count follows", async () => {
  await page.goto(origin + "/chest/todo");
  expect((await page.locator(".ck-nav .ck-count").innerText()) === "1", "count 1");
  await page.locator(".step", { hasText: "Show them the demo van" }).locator("label.tick").click();
  await page.waitForSelector(".ck-toast");
  await page.locator(".ck-toast .ck-toast-undo").click();
  await page.locator(".ck-toast", { hasText: "Undone." }).waitFor();
  await page.reload();
  expect(await page.locator(".steps:not(.done) .step", { hasText: "demo van" }).count() === 1, "undone");
  await page.locator(".step", { hasText: "Show them the demo van" }).locator("label.tick").click();
  await page.waitForTimeout(1500);
  await page.reload();
  expect(await page.locator(".ck-nav .ck-count").count() === 0, "count gone");
  expect(await page.locator(".steps.done .step", { hasText: "demo van" }).count() === 1, "done recently");
});

await step("a member cannot reach HR's pages nor edit others", async () => {
  const hr = await page.goto(origin + "/chest/checklists");
  expect(hr.status() === 404, "checklists " + hr.status());
  const edit = await page.goto(origin + "/chest/people/" + id("ines") + "/edit");
  expect(edit.status() === 404, "edit " + edit.status());
});

await step("HR's date field (Medical visit) is HR's and the person's only: a colleague never sees it, not even through the search", async () => {
  // Hugo, a member, on Nora's profile: no Medical visit.
  await page.goto(origin + "/chest/people/" + id("nora"));
  expect(!(await page.locator("main").innerText()).includes("Medical visit"), "a colleague sees Nora's medical visit");
  // Its value (a day twenty days ahead) finds nobody for him.
  const visit = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);
  await page.goto(origin + "/chest");
  await page.getByPlaceholder("A name, a job, a topic…").fill(visit);
  expect((await cards()).length === 0, "the search leaks it: " + (await cards()).join("|"));
  // Nora sees her own, marked as HR's and hers only; HR sees it.
  await as(context, origin, "nora");
  await page.goto(origin + "/chest/people/" + id("nora"));
  const mine = page.locator(".extras div", { hasText: "Medical visit" });
  expect(await mine.count() === 1 && (await mine.locator(".seen-lock").count()) === 1, "Nora reads her own, marked private");
  await as(context, origin, "camille");
  await page.goto(origin + "/chest/people/" + id("nora"));
  expect((await page.locator("main").innerText()).includes("Medical visit"), "HR reads it");
  await as(context, origin, "hugo");
});

await step("the newcomer fills in her profile: phone, topics, birthday", async () => {
  await as(context, origin, "nora");
  await page.goto(origin + "/chest/people/" + id("nora") + "/edit");
  await page.getByLabel("Work phone").fill("06 11 22 33 44");
  await page.getByLabel("Ask me about").fill("Quotes");
  await page.keyboard.press("Enter");
  await page.getByLabel("Ask me about").fill("Italian");
  await page.keyboard.press("Enter");
  await page.getByLabel("A few words about you").fill("Just arrived in Lyon. I prepare quotes and follow orders.");
  await page.getByText("Show my birthday to the team").click();
  await page.getByLabel("Day", { exact: true }).selectOption("14");
  await page.getByLabel("Month", { exact: true }).selectOption({ label: "March" });
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForURL(new RegExp(`/chest/people/${id("nora")}$`, "u"));
  const text = await page.locator("main").innerText();
  expect(text.includes("Quotes") && text.includes("Italian") && text.includes("Birthday: 14 March") && text.includes("06 11 22 33 44"), "saved: " + text.slice(0, 300));
  // Her "fill in your profile" step ticked itself.
  await page.goto(origin + "/chest/todo");
  expect(await page.locator(".steps:not(.done) .step", { hasText: "Fill in your profile" }).count() === 0, "profile step still open");
  expect(await page.locator(".steps.done .step", { hasText: "Fill in your profile" }).count() === 1, "profile step done");
});

await step("a wrong phone is refused, what was typed stays", async () => {
  await page.goto(origin + "/chest/people/" + id("nora") + "/edit");
  await page.getByLabel("Work phone").fill("call me");
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForSelector(".error[role=alert]");
  expect((await page.locator(".error[role=alert]").innerText()).includes("Check what you wrote"), "error said");
  expect((await page.getByLabel("Work phone").inputValue()) === "call me", "kept");
});

await step("HR sets a job; nobody below a person is offered as their manager", async () => {
  await as(context, origin, "camille");
  await page.goto(origin + "/chest/people/" + id("tom") + "/edit");
  await page.getByLabel("Job title").fill("Data engineer");
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForURL(new RegExp(`/chest/people/${id("tom")}$`, "u"));
  expect((await page.locator("h1 + p, .profile-title").first().innerText()).includes("Data engineer") || (await page.locator("main").innerText()).includes("Data engineer"), "title saved");
  await page.goto(origin + "/chest/people/" + id("camille") + "/edit");
  // The manager is a person picker: nobody below Camille is found.
  for (const name of ["Tom", "Inès"]) {
    await page.getByRole("combobox", { name: "Manager" }).fill(name);
    await page.locator(".ck-list-empty", { hasText: "No one by that name" }).waitFor();
    expect(await page.locator("[role=listbox] [role=option]").count() === 0, name + " offered as Camille's manager");
  }
});

await step("a start date before the field's first day is refused: nothing saved, the old date kept, then a good one saved (kit 0.2.4)", async () => {
  // The profile form is noValidate and saves from its own state: before
  // 0.2.4 the previous date would have gone in place of the refused one.
  const edit = origin + "/chest/people/" + id("tom") + "/edit";
  await page.goto(edit);
  const field = page.getByLabel("Start date", { exact: true });
  const before = await field.inputValue();
  expect(before !== "", "Tom has a start date");
  await field.fill("01/01/1900");
  await field.press("Tab");
  const said = page.locator(".ck-date .ck-error");
  await said.waitFor();
  expect((await said.innerText()).includes("1950 or later"), "the field says why: " + (await said.innerText()));
  expect((await field.getAttribute("aria-invalid")) === "true", "field invalid");
  expect((await field.inputValue()) === "01/01/1900", "what was typed stays");
  const save = page.getByRole("button", { name: "Save" });
  expect(await save.isDisabled(), "Save waits while the date is refused");
  // Enter in another field (implicit submission) sends nothing either.
  await page.getByLabel("Job title").press("Enter");
  await page.waitForTimeout(800);
  expect(page.url() === edit, "not sent: " + page.url());
  await page.goto(edit);
  expect((await page.getByLabel("Start date", { exact: true }).inputValue()) === before, "the stored date is untouched");
  // A good day is saved; then Tom's own date goes back.
  for (const day of ["03/02/2020", before]) {
    await page.goto(edit);
    await page.getByLabel("Start date", { exact: true }).fill(day);
    await page.getByLabel("Start date", { exact: true }).press("Tab");
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForURL(new RegExp(`/chest/people/${id("tom")}$`, "u"));
    await page.goto(edit);
    expect((await page.getByLabel("Start date", { exact: true }).inputValue()) === day, "saved: " + day);
  }
});

await step("the org chart folds a team away and back", async () => {
  await page.goto(origin + "/chest/chart");
  expect(await page.locator(".node-name", { hasText: "Tom Walker" }).isVisible(), "tom visible");
  await page.getByRole("button", { name: "Hide Léa Dubois’s team" }).click();
  expect(!(await page.locator(".node-name", { hasText: "Tom Walker" }).isVisible()), "tom folded");
  await page.getByRole("button", { name: "Show Léa Dubois’s team" }).click();
  expect(await page.locator(".node-name", { hasText: "Tom Walker" }).isVisible(), "tom back");
});

await step("HR writes a template and starts a departure checklist", async () => {
  await page.goto(origin + "/chest/checklists");
  await page.getByRole("button", { name: "New template" }).click();
  await page.getByLabel("Name of the template").fill("Remote leaver");
  await page.locator(".ck-segmented").getByText("Departure").click();
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForURL(/\/chest\/checklists\/templates\/\d+$/u);
  await page.getByPlaceholder("What needs doing?").fill("Send the laptop back by courier");
  await page.locator(".add-step select[name=who]").selectOption("person");
  await page.locator(".add-step select[name=when]").selectOption("-3");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForSelector(".template-step");
  await page.getByPlaceholder("What needs doing?").fill("Close the accounts");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll(".template-step").length === 2);
  await page.getByRole("link", { name: "Start a checklist from it" }).click();
  await page.waitForURL(/\/chest\/checklists\/new/u);
  await page.getByRole("combobox", { name: "Who is it for?" }).fill("Tom");
  await page.getByRole("option", { name: "Tom Walker" }).click();
  await page.getByLabel("Last day").fill("18/12/2026");
  await page.getByLabel("Last day").press("Tab");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.waitForURL(/\/chest\/checklists\/\d+$/u);
  const text = await page.locator("main").innerText();
  expect(text.includes("Tom Walker’s departure") && text.includes("Send the laptop back by courier") && text.includes("0 of 2 done"), "journey: " + text.slice(0, 200));
});

await step("HR gives a step to someone else, removes one and undoes it", async () => {
  await page.locator(".step", { hasText: "Close the accounts" }).getByRole("button").click();
  await page.locator(".step-edit").getByRole("combobox", { name: "Give to" }).fill("Sofia");
  await page.getByRole("option", { name: "Sofia Rossi" }).click();
  await page.locator(".ck-toast", { hasText: "Saved." }).waitFor();
  await page.reload();
  expect((await page.locator(".step", { hasText: "Close the accounts" }).innerText()).includes("Sofia Rossi"), "given to Sofia");
  await page.locator(".step", { hasText: "Close the accounts" }).getByRole("button").click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.locator(".ck-toast", { hasText: "Step deleted." }).locator(".ck-toast-undo").click();
  await page.locator(".ck-toast", { hasText: "Undone." }).waitFor();
  await page.reload();
  expect(await page.locator(".step", { hasText: "Close the accounts" }).count() === 1, "back");
});

await step("a departure is told to the other tools; stopped, it is taken back; Undo tells it again", async () => {
  const journey = page.url();
  const published = async () => {
    await page.goto(origin + "/_dev");
    return page.locator("li", { has: page.locator("code", { hasText: /^people\./u }) }).allInnerTexts();
  };
  const first = await published();
  expect(first.length === 1 && first[0].includes("people.leaving") && first[0].includes(id("tom")) && first[0].includes("2026-12-18"), "leaving told: " + first.join(" | "));
  await page.goto(journey);
  await page.getByRole("button", { name: "Stop this checklist" }).click();
  await page.locator(".ck-toast", { hasText: "Checklist stopped." }).locator(".ck-toast-undo").click();
  await page.locator(".ck-toast", { hasText: "Undone." }).waitFor();
  const after = await published();
  expect(after.length === 3 && after[1].includes("people.leaving_cancelled") && after[0].includes("people.leaving ") && after[0].includes("2026-12-18"), "stopped then restarted: " + after.join(" | "));
});

await step("HR imports a spreadsheet: sees the plan, imports", async () => {
  const file = tmp + "/people.csv";
  writeFileSync(file, "Employee Name,Job Title,Department,Location\nHugo Bernard,Senior account manager,Sales,Lyon\nJean Inconnu,Ghost,,\n");
  await page.goto(origin + "/chest/import");
  await page.locator("input[type=file]").setInputFiles(file);
  await page.waitForSelector(".plan table");
  const plan = await page.locator(".plan table").innerText();
  expect(plan.includes("Senior account manager") && plan.includes("Nobody by that name here"), "plan");
  await page.getByRole("button", { name: "Import 1 profile" }).click();
  await page.waitForURL(/\/chest$/u);
  await page.getByPlaceholder("A name, a job, a topic…").fill("senior");
  expect((await cards()).join("|") === "Hugo Bernard", "imported");
  const csv = await (await page.request.get(origin + "/chest/export")).text();
  expect(csv.includes("Senior account manager") && csv.startsWith("﻿Name,Work email,Job title"), "export: " + csv.slice(0, 80));
  // Phones leave as they are (no quote in front of "+33").
  expect(csv.includes(",+33 6 12 45 78 90,") && !csv.includes("'+33"), "phones untouched");
});

await step("HR imports BambooHR's report: 'Employee #' left out, columns shown, the date order asked", async () => {
  const file = tmp + "/bamboohr.csv";
  writeFileSync(file, readFileSync(new URL("../../../tools/private/people/test/fixtures/bamboohr-employee-report.csv", import.meta.url)));
  await page.goto(origin + "/chest/import");
  await page.locator("input[type=file]").setInputFiles(file);
  await page.waitForSelector(".plan table");
  expect((await page.locator(".mapping summary").innerText()).startsWith("Columns found: First name, Last name, Job title"), "columns: " + await page.locator(".mapping summary").innerText());
  const order = page.locator(".date-order");
  expect(await order.isVisible(), "date order asked");
  expect(await order.getByLabel("Dates read as month/day/year.").isChecked(), "US guess for BambooHR");
  expect((await page.locator(".plan table").innerText()).includes("3 Oct 2023") || (await page.locator(".plan table").innerText()).includes("2023-10-03"), "Hugo's date month-first");
  await order.getByText("Dates read as day/month/year.").click();
  // Dates in the reader's words, never ISO.
  await page.waitForFunction(() => document.querySelector(".plan table")?.textContent?.includes("10 Mar 2023"));
  // Nothing dropped without a word: the columns left out are named, the
  // mapping step is open, and one becomes a field of HR's own.
  const unread = await page.locator(".banner.warn", { hasText: "left out" }).innerText();
  expect(unread.includes("Division") && unread.includes("Employment Status"), "columns left out named: " + unread);
  expect(await page.locator(".mapping").evaluate(d => d.open), "mapping open");
  await page.locator(".mapping-list li", { hasText: "Employment Status" }).getByRole("button", { name: "Keep as a new field" }).click();
  await page.locator(".ck-toast", { hasText: "Employment Status" }).waitFor();
  await page.waitForFunction(() => document.querySelector(".plan table")?.textContent?.includes("Full-Time"));
  // The mapping step: the mobile phone instead of the work phone.
  await page.getByLabel(/^Work Phone/u).selectOption("skip");
  await page.getByLabel(/^Mobile Phone/u).selectOption("phone");
  await page.waitForFunction(() => document.querySelector(".plan table")?.textContent?.includes("+33 6 98 76 54 32"));
  expect((await page.locator(".plan table").innerText()).includes("Nobody by that name here"), "Jean left out");
});

await step("HR writes an expected arrival by hand (a weekend is questioned) and corrects it", async () => {
  await page.goto(origin + "/chest/checklists");
  await page.getByRole("button", { name: "Expected arrival" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Paul Mercier");
  await page.getByLabel("Job title").fill("Sales associate");
  await page.getByLabel("First day").fill("07/11/2026");
  await page.getByLabel("First day").press("Tab");
  expect((await page.locator(".arrival-form .warn-hint").innerText()).includes("Saturday"), "weekend questioned");
  await page.getByLabel("First day").fill("9 November 2026");
  await page.getByLabel("First day").press("Tab");
  expect((await page.locator(".arrival-form .warn-hint").innerText()).trim() === "", "weekday fine");
  await page.getByRole("combobox", { name: "Their manager" }).fill("Inès");
  await page.getByRole("option", { name: "Inès Moreau" }).click();
  await page.getByLabel("Their work email (if known)").fill("paul.mercier@example.test");
  await page.getByRole("button", { name: "Save" }).click();
  await page.locator(".ck-toast", { hasText: "Arrival added." }).waitFor();
  const card = page.locator(".arrival", { hasText: "Paul Mercier" });
  expect((await card.innerText()).includes("Added by HR") && (await card.innerText()).includes("9 November"), "arrival: " + await card.innerText());
  await card.getByRole("button", { name: "Change" }).click();
  await card.getByLabel("Job title").fill("Senior sales associate");
  await card.getByRole("button", { name: "Save" }).click();
  await page.locator(".ck-toast", { hasText: "Arrival saved." }).waitFor();
  await page.locator(".arrival", { hasText: "Senior sales associate" }).waitFor({ timeout: 5000 });
});

await step("HR edits as a table: a cell saves on leaving it, Undo puts it back; a field of HR's own", async () => {
  await page.goto(origin + "/chest/table");
  const cell = page.getByLabel("Team of Hugo Bernard");
  await cell.fill("Key accounts");
  await cell.press("Enter");
  await page.locator(".ck-toast", { hasText: "Saved." }).waitFor();
  await page.goto(origin + "/chest/people/" + id("hugo"));
  expect((await page.locator("main").innerText()).includes("Key accounts"), "saved");
  await page.goto(origin + "/chest/table");
  await page.getByLabel("Team of Hugo Bernard").fill("Export");
  await page.getByLabel("Team of Hugo Bernard").press("Tab");
  await page.locator(".ck-toast", { hasText: "Saved." }).locator(".ck-toast-undo").click();
  await page.locator(".ck-toast", { hasText: "Undone." }).waitFor();
  await page.reload();
  expect((await page.getByLabel("Team of Hugo Bernard").inputValue()) === "Key accounts", "undone");
  // A loop of managers is refused and the cell comes back.
  await page.getByLabel("Manager of Camille Martin").selectOption({ label: "Hugo Bernard" });
  await page.locator(".ck-toast", { hasText: "loop" }).waitFor();
  expect((await page.getByLabel("Manager of Camille Martin").inputValue()) === "", "refused loop comes back");
  await page.getByRole("button", { name: "Add a field" }).click();
  await page.getByLabel("Name of the field").fill("T-shirt");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel("T-shirt of Tom Walker").waitFor();
  await page.getByLabel("T-shirt of Tom Walker").fill("M");
  await page.getByLabel("T-shirt of Tom Walker").press("Enter");
  await page.locator(".ck-toast", { hasText: "Saved." }).waitFor();
  // A date field that reminds HR, and a choice field.
  await page.getByRole("button", { name: "Add a field" }).click();
  await page.getByLabel("Name of the field").fill("Badge expires");
  await page.locator("label.ck-segment", { hasText: "Date" }).click();
  await page.getByLabel("Remind HR this many days before (optional)").fill("30");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel("Badge expires of Tom Walker").waitFor();
  await page.getByLabel("Badge expires of Tom Walker").fill("15/12/2026");
  await page.getByLabel("Badge expires of Tom Walker").press("Enter");
  await page.locator('.ck-toast[data-toast-id^="cell-mbr_tom"]').nth(1).waitFor();
  await page.getByRole("button", { name: "Add a field" }).click();
  await page.getByLabel("Name of the field").fill("Size");
  await page.locator("label.ck-segment", { hasText: "Choice from a list" }).click();
  await page.getByLabel("The choices, one per line").fill("S\nM\nL");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel("Size of Tom Walker").selectOption("L");
  await page.locator('.ck-toast[data-toast-id^="cell-mbr_tom"]').nth(2).waitFor();
  await page.goto(origin + "/chest/people/" + id("tom"));
  const extras = await page.locator(".extras").innerText();
  expect(extras.includes("T-shirt") && extras.includes("15 December 2026") && extras.includes("L"), "shown on the profile: " + extras);
});

await step("a new date field is HR's and the person's by default; HR opens one to everyone from the table", async () => {
  await page.goto(origin + "/chest/table");
  expect((await page.getByLabel("Who sees Badge expires").inputValue()) === "private", "a date field starts private");
  expect((await page.getByLabel("Who sees T-shirt").inputValue()) === "everyone", "a text field starts seen by everyone");
  await as(context, origin, "hugo");
  await page.goto(origin + "/chest/people/" + id("tom"));
  let extras = await page.locator("main").innerText();
  expect(!extras.includes("Badge expires") && extras.includes("T-shirt"), "Hugo sees the T-shirt, not the badge: " + extras.slice(0, 200));
  await as(context, origin, "camille");
  await page.goto(origin + "/chest/table");
  await page.getByLabel("Who sees Badge expires").selectOption("everyone");
  await page.locator(".ck-toast", { hasText: "Saved." }).last().waitFor();
  await as(context, origin, "hugo");
  await page.goto(origin + "/chest/people/" + id("tom"));
  extras = await page.locator("main").innerText();
  expect(extras.includes("Badge expires") && extras.includes("15 December 2026"), "opened to everyone");
  await as(context, origin, "camille");
});

await step("the register never leaves anyone out silently: Hugo, without a record, is named on screen, in print and in the CSV; Numbers count the same people", async () => {
  await page.goto(origin + "/chest/records/register");
  const banner = await page.locator(".banner.warn", { hasText: "missing from this register" }).innerText();
  expect(banner.startsWith("1 person"), "banner: " + banner);
  const gaps = page.locator(".register-gaps");
  expect((await gaps.innerText()).includes("Hugo Bernard") && (await gaps.innerText()).includes("No HR record"), "Hugo named");
  expect(await gaps.getByRole("button", { name: "Create the record" }).isVisible(), "offered to create it");
  await page.emulateMedia({ media: "print" });
  expect(await gaps.isVisible(), "printed too");
  expect(!(await gaps.getByRole("button", { name: "Create the record" }).isVisible()), "without its button on paper");
  await page.emulateMedia({ media: "screen" });
  // The intern's tutor is written as a name, never "(former member)".
  expect(!(await page.locator("main").innerText()).includes("(former member)"), "no app suffix on the register");
  const csv = await (await page.request.get(origin + "/chest/records/register/csv")).text();
  expect(csv.includes("Not in this register") && /Hugo Bernard,No HR record/u.test(csv), "CSV names him");
  await page.goto(origin + "/chest/numbers");
  const head = Number((await page.locator(".stat-value").first().innerText()).replace(/\D/gu, ""));
  const sums = await page.locator(".card-block").evaluateAll(blocks => blocks.filter(b => b.querySelector(".bars")).map(b => [...b.querySelectorAll(".bar-value")].reduce((x, v) => x + Number(v.textContent.replace(/\D/gu, "")), 0)));
  expect(sums.length === 3 && sums.every(n => n === head), "one population: headcount " + head + ", by team/office/contract " + sums.join("/"));
});

await step("HR records: everyone without one in a click; a record changed and noted; a document added; the register", async () => {
  await page.goto(origin + "/chest/records");
  expect((await page.locator("main").innerText()).includes("Trial period ends"), "trial period coming up");
  await page.getByRole("button", { name: /^Create their/u }).click();
  await page.locator(".ck-toast", { hasText: /created/u }).waitFor();
  await page.locator(".journey-card", { hasText: "Nora Petit" }).click();
  await page.waitForURL(/\/chest\/records\/\d+$/u);
  await page.getByLabel(/^Nationality/u).fill("Française et italienne");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.locator(".ck-toast", { hasText: "Record saved." }).waitFor();
  await page.reload();
  expect((await page.locator(".journal").innerText()).includes("Changed: Nationality"), "journal names the field");
  expect(!(await page.locator(".journal").innerText()).includes("italienne"), "never the value");
  const pdf = tmp + "/contrat.pdf";
  writeFileSync(pdf, "%PDF-1.4\n% Contrat de travail\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n");
  await page.locator(".doc-upload input[type=file]").setInputFiles({ name: "Contrat Nora.pdf", mimeType: "application/pdf", buffer: readFileSync(pdf) });
  await page.locator(".ck-toast", { hasText: "Document added." }).waitFor();
  await page.waitForSelector(".doc-list .doc");
  const link = await page.locator(".doc-list .doc").first().getAttribute("href");
  const opened = await page.request.get(origin + link, { maxRedirects: 0 });
  expect(opened.status() === 303 && /_chest\/files/u.test(opened.headers()["location"] ?? ""), "document opens through a signed link: " + opened.status());
  noraRecord = page.url();
  await page.goto(origin + "/chest/records/register");
  const register = await page.locator("main").innerText();
  expect(register.includes("Staff register") && register.includes("NGUYEN Linh") && register.includes("Temporary") === false, "register: " + register.slice(0, 200));
  expect(register.includes("Seconded (Bristol Data Ltd"), "seconded mention with the employer");
  const csv = await (await page.request.get(origin + "/chest/records/register/csv")).text();
  expect(csv.includes("Staff register — employees") && csv.includes("Staff register — interns"), "register CSV");
  await page.goto(origin + "/chest/numbers");
  expect((await page.locator(".stat").first().innerText()).includes("People"), "numbers");
});

await step("a record is its person's to read, and nobody else's (not even their manager)", async () => {
  await as(context, origin, "nora");
  await page.context().addCookies([{ name: "dev_locale", value: "en", url: origin }]);
  await page.goto(origin + "/chest/people/" + id("nora"));
  await page.getByRole("link", { name: "My HR record" }).click();
  await page.waitForURL(/\/chest\/records\/\d+$/u);
  const text = await page.locator("main").innerText();
  expect(text.includes("Only HR changes it") && text.includes("Française et italienne") && await page.locator("form").count() === 0, "read-only");
  await as(context, origin, "ines");
  const manager = await page.goto(noraRecord);
  expect(manager.status() === 404, "manager sees nothing: " + manager.status());
  const list = await page.goto(origin + "/chest/records");
  expect(list.status() === 404, "list is HR's");
  await as(context, origin, "camille");
});

await step("a record keeps the employee number, the work permit's end and the days worked; the permit is 'coming up' 60 days ahead", async () => {
  await page.goto(origin + "/chest/records");
  const soon = page.locator(".moment-list li", { hasText: "DIALLO Aminata" }).filter({ hasText: "Work permit" });
  expect(await soon.count() === 1 && (await soon.innerText()).includes("Work permit runs out"), "permit coming up: " + (await page.locator("main").innerText()).slice(0, 300));
  await soon.getByRole("link").click();
  await page.waitForURL(/\/chest\/records\/\d+$/u);
  expect((await page.getByLabel("Employee number").inputValue()) === "0017", "matricule");
  expect((await page.getByLabel("Work permit valid until").inputValue()) !== "", "permit end");
  const days = page.locator(".week-days");
  expect(await days.getByLabel("Mon").isChecked() && await days.getByLabel("Wed").isChecked() && !(await days.getByLabel("Thu").isChecked()), "Mon–Wed worked");
  // Two records never share a number.
  await page.getByLabel("Employee number").fill("0019");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect((await page.locator(".error[role=alert]").innerText()).includes("already has this employee number"), "number taken said");
});

await step("People tells Leave what a record says of Tom: his number, first day and days worked (events between tools)", async () => {
  await page.goto(origin + "/chest/people/" + id("tom"));
  await page.getByRole("link", { name: "HR record" }).click();
  await page.waitForURL(/\/chest\/records\/\d+$/u);
  await page.getByLabel("Employee number").fill("T-0019");
  await page.locator(".week-days").getByLabel("Fri").check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.locator(".ck-toast", { hasText: "Record saved." }).waitFor();
  await page.goto(origin + "/_dev");
  const told = await page.locator("li", { has: page.locator("code", { hasText: "people.record" }) }).allInnerTexts();
  expect(told.some(x => x.includes(id("tom")) && x.includes("T-0019") && x.includes("[1,2,3,4,5]")), "people.record told: " + told.join(" | "));
});

await step("HR imports HR records from Lucca's export: the plan, a column left out named, a new record for someone without the Chest", async () => {
  const file = tmp + "/lucca-records.csv";
  writeFileSync(file, "Matricule;Nom;Prénom;Date d'entrée;Type de contrat;Nationalité;Mutuelle\n0031;GARNIER;Lucie;02/11/2026;CDI;Française;Harmonie\n0024;Petit;Nora;;;Française et italienne;\n");
  await page.goto(origin + "/chest/records");
  await page.getByRole("link", { name: "Import", exact: true }).click();
  await page.waitForURL(/\/chest\/records\/import$/u);
  await page.locator("input[type=file]").setInputFiles(file);
  await page.waitForSelector(".plan table");
  const plan = await page.locator(".plan table").innerText();
  expect(plan.includes("New record · not in the Chest") && plan.includes("GARNIER Lucie") && plan.includes("Updates their record"), "plan: " + plan);
  expect((await page.locator(".banner.warn", { hasText: "left out" }).innerText()).includes("Mutuelle"), "Mutuelle named");
  await page.getByRole("button", { name: "Import 2 records" }).click();
  await page.waitForURL(/\/chest\/records$/u);
  expect((await page.locator(".journey-card", { hasText: "GARNIER Lucie" }).innerText()).includes("Not in the Chest"), "Lucie's record, not in the Chest");
});

await step("a letter from a template: HR prints Nora's certificate of employment; what the record lacks is said; the journal notes it", async () => {
  await page.goto(noraRecord);
  await page.locator("section", { hasText: "Print a letter" }).getByRole("link", { name: "Certificate of employment" }).click();
  await page.waitForURL(/\/letters\/\d+$/u);
  const sheet = await page.locator(".letter-sheet").innerText();
  expect(sheet.startsWith("CERTIFICATE OF EMPLOYMENT") && sheet.includes("PETIT Nora") && sheet.includes("Camille Martin"), "filled: " + sheet.slice(0, 200));
  expect((await page.locator(".banner.warn").innerText()).includes("Last day"), "her last day is missing, and said");
  expect(await page.getByRole("button", { name: "Print or save as PDF" }).isVisible(), "print");
  await page.emulateMedia({ media: "print" });
  expect(!(await page.locator(".banner.warn").isVisible()), "the missing note is not printed");
  await page.emulateMedia({ media: "screen" });
  await page.goto(noraRecord);
  expect((await page.locator(".journal").innerText()).includes("Printed a letter (Certificate of employment)"), "journal");
});

await step("HR rewords a letter once (the company's address); deleting one has Undo", async () => {
  await page.goto(origin + "/chest/records/letters");
  await page.getByRole("button", { name: "Edit Certificate of employment" }).click();
  const body = page.getByLabel("Text", { exact: true });
  await body.fill((await body.inputValue()).replace("[Company address]", "12 rue des Tanneurs, 69007 Lyon"));
  await page.getByRole("button", { name: "Save" }).click();
  await page.locator(".ck-toast", { hasText: "Letter saved." }).waitFor();
  await page.getByRole("button", { name: "Delete Employment letter" }).click();
  await page.locator(".ck-toast", { hasText: "Letter deleted." }).locator(".ck-toast-undo").click();
  await page.locator(".ck-toast", { hasText: "Undone." }).waitFor();
  await page.reload();
  expect(await page.locator(".letter-card", { hasText: "Employment letter" }).count() === 1, "back");
  await page.goto(noraRecord);
  await page.locator("section", { hasText: "Print a letter" }).getByRole("link", { name: "Certificate of employment" }).click();
  expect((await page.locator(".letter-sheet").innerText()).includes("12 rue des Tanneurs, 69007 Lyon"), "the address is in every letter now");
});

await step("Nora asks HR to change her address from her record; HR accepts it; Inès's asked change is declined with a word", async () => {
  await as(context, origin, "nora");
  await page.goto(noraRecord);
  await page.getByRole("button", { name: "Request a change" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Home address").fill("8 quai Rambaud\n69002 Lyon");
  await dialog.getByLabel("A word for HR (optional)").fill("I moved on the 1st.");
  await dialog.getByRole("button", { name: "Send to HR" }).click();
  await page.locator(".ck-toast", { hasText: "Sent to HR." }).waitFor();
  expect((await page.locator(".change-waiting").innerText()).includes("8 quai Rambaud"), "waiting, with what was asked");
  await as(context, origin, "camille");
  await page.goto(origin + "/chest/records");
  const asked = page.locator("section", { hasText: "Changes asked" });
  expect((await asked.innerText()).includes("Nora Petit") && (await asked.innerText()).includes("Inès Moreau"), "HR sees both: " + (await asked.innerText()));
  await asked.getByRole("link", { name: /Nora Petit/u }).click();
  await page.waitForURL(/\/chest\/records\/\d+$/u);
  await page.getByRole("button", { name: "Accept and update the record" }).click();
  await page.locator(".ck-toast", { hasText: "Record updated." }).waitFor();
  await page.reload();
  expect((await page.getByLabel("Home address").inputValue()).startsWith("8 quai Rambaud"), "the record changed");
  expect((await page.locator(".journal").innerText()).includes("Made the change asked: Home address"), "journal names the field");
  await page.goto(origin + "/chest/records");
  await page.locator("section", { hasText: "Changes asked" }).getByRole("link", { name: /Inès Moreau/u }).click();
  await page.getByLabel("A word if you decline (optional)").fill("Envoyez-moi le nouveau numéro par écrit.");
  await page.getByRole("button", { name: "Decline", exact: true }).click();
  await page.locator(".ck-toast", { hasText: "Declined." }).waitFor();
  await page.reload();
  expect(await page.locator(".change-asked").count() === 0, "answered");
  await as(context, origin, "nora");
  await page.goto(noraRecord);
  expect(await page.locator(".change-waiting").count() === 0 && (await page.locator("main").innerText()).includes("8 quai Rambaud"), "Nora reads her new address");
  await as(context, origin, "camille");
});

await step("Numbers: interns are left out of the turnover, and the page says so", async () => {
  await page.goto(origin + "/chest/numbers");
  expect((await page.locator("main").innerText()).includes("Interns are left out"), "said");
});

async function deliver(type, data) {
  await page.goto(origin + "/_dev");
  const form = page.locator('form[action="/_dev/deliver"]');
  await form.locator("select[name=type]").selectOption(type);
  await form.locator("textarea[name=data]").fill(JSON.stringify(data));
  await form.getByRole("button", { name: "Deliver" }).click();
  await page.waitForLoadState("load");
}

await step("Hiring tells of a hire: HR sees the arrival and prepares it before he has access", async () => {
  await as(context, origin, "camille");
  await deliver("hiring.hired", { candidate: "cand_7", name: "Marc Lefort", email: "lucie@example.com", job: "Sales associate", team: "Sales", place: "Lyon", startDate: "2026-11-02", hiredBy: id("ines") });
  await page.goto(origin + "/chest/checklists");
  const arrival = page.locator(".arrival", { hasText: "Marc Lefort" });
  expect((await arrival.innerText()).includes("Sales associate") && (await arrival.innerText()).includes("2 November"), "arrival shown");
  await arrival.getByRole("link", { name: "Start the arrival checklist" }).click();
  await page.waitForURL(/\/chest\/checklists\/new\?arrival=/u);
  await page.getByRole("combobox", { name: "Their manager" }).fill("Inès");
  await page.getByRole("option", { name: "Inès Moreau" }).click();
  expect((await page.getByLabel("First day").inputValue()) === "02/11/2026", "first day from Hiring: " + await page.getByLabel("First day").inputValue());
  // Hiring's personal address is never kept: the form says, before
  // starting, that no welcome email will leave (and why).
  const noWelcome = await page.locator("[data-welcome]").innerText();
  expect(noWelcome === "Marc Lefort gets no welcome email: add their work email to their arrival first.", "no welcome promised: " + noWelcome);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.waitForURL(/\/chest\/checklists\/\d+$/u);
  const text = await page.locator("main").innerText();
  expect(text.includes("Welcome Marc Lefort") && text.includes("the newcomer, once they have access") && text.includes("Inès Moreau"), "journey: " + text.slice(0, 300));
});

await step("a hire cancelled after the checklist started: marked cancelled, HR removes it", async () => {
  await deliver("hiring.hire_cancelled", { candidate: "cand_7" });
  await page.goto(origin + "/chest/checklists");
  const arrival = page.locator(".arrival", { hasText: "Marc Lefort" });
  expect((await arrival.innerText()).includes("Hire cancelled"), "cancelled");
  await arrival.getByRole("button", { name: "Delete" }).click();
  await page.locator(".ck-toast", { hasText: "Arrival deleted." }).waitFor();
  await page.reload();
  expect(await page.locator(".arrival", { hasText: "Marc Lefort" }).count() === 0, "removed");
});

await step("a hire who already has access is offered to link on the directory, in one click", async () => {
  await deliver("hiring.hired", { candidate: "cand_8", name: "Nora Petit", email: null, job: "Sales assistant", team: "Sales", place: null, startDate: null, hiredBy: id("ines") });
  await page.goto(origin + "/chest");
  const offer = page.locator(".banner.suggest", { hasText: "Nora Petit now has access" });
  await offer.getByRole("button", { name: "Yes, link" }).click();
  await page.waitForSelector(".ck-toast");
  await page.reload();
  expect(await page.locator(".banner.suggest").count() === 0, "linked");
});

await step("Leave tells of an approved leave: the card and the profile say “Away · back on …”, never why; cancelled, it goes", async () => {
  // Days in the Chest's time zone (the harness's: Europe/Paris).
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const day = n => new Date(Date.parse(today + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
  await deliver("leave.approved", { member: id("lea"), from: day(-1), to: day(2), fromHalf: "am", toHalf: "pm", request: "901" });
  await page.context().addCookies([{ name: "dev_locale", value: "en", url: origin }]);
  await page.goto(origin + "/chest");
  const card = page.locator(".wall li", { hasText: "Léa Dubois" });
  const badge = (await card.locator(".away").innerText()).trim();
  expect(/^Away · back on \S+ \d+ \S+$/u.test(badge), "card: " + badge);
  // Others may be away too (the sample data): only Léa's card is checked.
  await card.getByRole("link").click();
  await page.waitForURL(/\/chest\/people\/mbr_/u);
  const note = (await page.locator(".profile-id .away").innerText()).trim();
  expect(note.startsWith("Away · back on") && !/holiday|sick|note/iu.test(await page.locator("main").innerText()), "profile: " + note);
  await deliver("leave.cancelled", { member: id("lea"), from: day(-1), to: day(2), fromHalf: "am", toHalf: "pm", request: "901" });
  await page.goto(origin + "/chest");
  expect(await page.locator(".wall li", { hasText: "Léa Dubois" }).locator(".away").count() === 0, "gone once cancelled");
  // Away again for the screenshots and the audit.
  await deliver("leave.approved", { member: id("lea"), from: day(0), to: day(4), fromHalf: "am", toHalf: "pm", request: "902" });
  await deliver("leave.approved", { member: id("tom"), from: day(0), to: day(0), fromHalf: "pm", toHalf: "pm", request: "903" });
  await page.goto(origin + "/chest");
  expect((await page.locator(".wall li", { hasText: "Tom Walker" }).locator(".away").innerText()).trim().startsWith("Away this afternoon"), "half day");
});

await step("pass 4: HR starts Marc's welcome checklist: he gets a short welcome email at his work address, signed by HR, who is the reply address", async () => {
  await as(context, origin, "camille");
  await page.goto(origin + "/chest/checklists");
  const arrival = page.locator(".arrival", { hasText: "Marc Lefèvre" });
  await arrival.getByRole("link", { name: "Start the arrival checklist" }).click();
  await page.waitForURL(/\/chest\/checklists\/new\?arrival=/u);
  await page.getByRole("combobox", { name: "Their manager" }).fill("Inès");
  await page.getByRole("option", { name: "Inès Moreau" }).click();
  // Mail is on (mail.available(), SDK studio.16): the form promises the
  // welcome before starting, and only then.
  expect(await page.locator("[data-welcome=yes]", { hasText: "Marc Lefèvre gets a short welcome email." }).count() === 1, "welcome promised: " + await page.locator("[data-welcome]").allInnerTexts());
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.waitForURL(/\/chest\/checklists\/\d+$/u);
  await page.locator(".ck-toast", { hasText: "Started. Marc Lefèvre gets a short welcome email." }).waitFor();
  await page.goto(origin + "/_dev");
  const letter = page.locator("li", { has: page.locator("b", { hasText: "Welcome to Atelier Martin, Marc" }) });
  expect(await letter.count() === 1, "one welcome email");
  const text = await letter.innerText();
  expect(text.includes("marc.lefevre@example.test") && text.includes("replies to camille@example.test") && text.includes("Camille Martin"), "to his work address, from HR: " + text.slice(0, 300));
  await letter.locator("summary").click();
  const body = await letter.locator("pre").innerText();
  expect(body.startsWith("Hello Marc,") && body.includes("Your first day is") && body.includes("Inès Moreau will be your manager.") && body.includes("You will get access to the company’s Chest") && body.trim().endsWith("Camille Martin"), "the letter: " + body);
});

await step("pass 4: staff without the Chest are in the directory and the org chart, marked; a colleague's card opens nothing; HR places them from the record", async () => {
  await as(context, origin, "hugo");
  await page.goto(origin + "/chest");
  await page.getByPlaceholder("A name, a job, a topic…").fill("aminata");
  expect((await cards()).join("|") === "DIALLO Aminata", "found: " + (await cards()).join("|"));
  const card = page.locator(".wall li", { hasText: "DIALLO Aminata" });
  const words = (await card.innerText()).split("\n").map(w => w.trim()).filter(Boolean);
  expect(words.join("|") === "D|Not in the Chest|DIALLO Aminata|Warehouse operator|Office" || (words.includes("Not in the Chest") && words.includes("Warehouse operator") && words.includes("Office") && words.length <= 5), "name, job, team, marked — nothing else: " + words.join("|"));
  expect(await card.locator("a").count() === 0, "a colleague's card opens nothing");
  await page.goto(origin + "/chest/chart");
  const underCamille = page.locator(".node", { has: page.locator(".node-card", { hasText: "Camille Martin" }) }).first();
  expect(await underCamille.locator(".node-card.offline", { hasText: "DIALLO Aminata" }).count() === 1, "in the chart under Camille");
  expect((await page.locator(".node-card.offline", { hasText: "NGUYEN Linh" }).innerText()).includes("Not in the Chest"), "Linh marked");
  await as(context, origin, "camille");
  await page.goto(origin + "/chest");
  await page.locator(".wall a.person", { hasText: "DIALLO Aminata" }).click();
  await page.waitForURL(/\/chest\/records\/\d+$/u);
  const place = page.locator("section", { has: page.getByRole("heading", { name: "In the directory" }) });
  await place.getByLabel("Team").fill("Warehouse");
  await place.getByRole("button", { name: "Update the directory" }).click();
  await page.locator(".ck-toast", { hasText: "Saved." }).waitFor();
  await page.goto(origin + "/chest?team=Warehouse");
  expect((await cards()).join("|") === "DIALLO Aminata", "placed in Warehouse: " + (await cards()).join("|"));
});

await step("pass 4: Equipment tells that everything is back: the leaving checklist's return step ticks itself, marked", async () => {
  await as(context, origin, "camille");
  await page.goto(origin + "/chest/checklists/new");
  await page.getByRole("combobox", { name: "Who is it for?" }).fill("Sofia");
  await page.getByRole("option", { name: "Sofia Rossi" }).click();
  await page.locator(".choice", { hasText: "Leaving" }).click();
  await page.getByLabel("Last day").fill("15/01/2027");
  await page.getByLabel("Last day").press("Tab");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.waitForURL(/\/chest\/checklists\/\d+$/u);
  const journey = page.url();
  const step = () => page.locator(".step", { hasText: "Return the laptop, badge and keys" });
  expect(!(await step().innerText()).includes("Ticked by Equipment"), "open before");
  await deliver("equipment.returned", { member: id("sofia") });
  await page.goto(journey);
  const text = await step().innerText();
  expect(text.includes("Ticked by Equipment: everything is back"), "ticked by Equipment: " + text);
  expect((await page.locator("main").innerText()).includes("1 of 5 done"), "one step done");
});

await step("in French: the directory and a checklist speak French", async () => {
  const fr = await open(port, "lea", { locale: "fr" });
  await fr.page.goto(fr.origin + "/chest");
  expect((await fr.page.locator("h1").innerText()) === "Toute l’équipe", "french title");
  expect((await fr.page.locator(".hello-card").innerText()).includes("Dites bonjour à Nora"), "french hello");
  await fr.page.goto(fr.origin + "/chest/chart");
  expect((await fr.page.locator("h1").innerText()) === "Organigramme", "chart");
  problems.push(...fr.problems);
  await fr.browser.close();
});

await step("a manager leaves: her report keeps his place under her card, marked; her steps go to HR", async () => {
  await as(context, origin, "camille");
  await page.request.post(origin + "/_dev/event", { form: { type: "member.removed", member: id("lea"), back: "/_dev" } });
  await page.goto(origin + "/chest/chart");
  const card = page.locator(".node-card.left", { hasText: "Léa Dubois" });
  expect((await card.innerText()).includes("Has left"), "Léa's place kept");
  expect(await page.locator(".node-card", { hasText: "Tom Walker" }).isVisible(), "Tom still in the chart");
  expect(await page.locator(".alone", { hasText: "Tom Walker" }).count() === 0, "not set aside");
  await page.goto(origin + "/chest/people/" + id("tom"));
  expect((await page.locator("main").innerText()).includes("Léa Dubois has left"), "profile says so");
});

await step("phone width: no sideways scroll; the org chart is a list", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/chest", "/chest/chart", "/chest/todo", "/chest/checklists", "/chest/people/" + id("ines"), "/chest/records", "/chest/records/register", "/chest/numbers", noraRecord.replace(origin, ""), "/chest/records/import", "/chest/records/letters", noraRecord.replace(origin, "") + "/letters/1"]) {
    await page.goto(origin + path);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width <= 392, path + " overflows: " + width);
  }
  await page.goto(origin + "/chest/chart");
  const box = await page.locator(".node-card").first().boundingBox();
  expect(box.width > 300, "list card width " + box.width);
  // The sections, each with its word under its icon, in a row of their own (the kit's rule).
  const labels = await page.locator(".ck-nav-link .ck-nav-label").evaluateAll(ls => ls.map(l => l.getBoundingClientRect().width > 10 ? l.textContent : ""));
  expect(labels.join("|") === "Directory|Org chart|My to-dos|Checklists|Records", "labels: " + labels.join("|"));
});

await browser.close();
done(problems);
