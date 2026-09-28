// People, as the team uses it, in a real browser: node lab/chest-dev/flows/people.mjs [port]
// (the harness runs the tool with --reset: the sample company is there, Nora
// started six days ago and her welcome checklist is under way).
import { writeFileSync } from "node:fs";
import { as, done, expect, id, open, step } from "./lib.mjs";

const port = Number(process.argv[2] ?? 4700);
const { browser, context, page, origin, problems } = await open(port, "hugo", { locale: "en", allow404: /\/chest\/(checklists|people\/mbr_\w+\/edit)$/u });
const tmp = process.env.TMPDIR ?? "/tmp";
const cards = () => page.locator(".wall .person-name").allTextContents();

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
  expect((await page.locator(".tabs .count").innerText()) === "1", "count 1");
  await page.locator(".step", { hasText: "Show them the demo van" }).locator("label.tick").click();
  await page.waitForSelector(".toast");
  await page.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(1200);
  await page.reload();
  expect(await page.locator(".steps:not(.done) .step", { hasText: "demo van" }).count() === 1, "undone");
  await page.locator(".step", { hasText: "Show them the demo van" }).locator("label.tick").click();
  await page.waitForTimeout(1500);
  await page.reload();
  expect(await page.locator(".tabs .count").count() === 0, "count gone");
  expect(await page.locator(".steps.done .step", { hasText: "demo van" }).count() === 1, "done recently");
});

await step("a member cannot reach HR's pages nor edit others", async () => {
  const hr = await page.goto(origin + "/chest/checklists");
  expect(hr.status() === 404, "checklists " + hr.status());
  const edit = await page.goto(origin + "/chest/people/" + id("ines") + "/edit");
  expect(edit.status() === 404, "edit " + edit.status());
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
  const options = await page.getByLabel("Manager").locator("option").allTextContents();
  expect(!options.includes("Tom Walker") && !options.includes("Inès Moreau"), "people below Camille are not offered");
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
  await page.locator(".segmented").getByText("Departure").click();
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
  await page.getByLabel("Who is it for?").selectOption({ label: "Tom Walker" });
  await page.getByLabel("Last day").fill("2026-12-18");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.waitForURL(/\/chest\/checklists\/\d+$/u);
  const text = await page.locator("main").innerText();
  expect(text.includes("Tom Walker’s departure") && text.includes("Send the laptop back by courier") && text.includes("0 of 2 done"), "journey: " + text.slice(0, 200));
});

await step("HR gives a step to someone else, removes one and undoes it", async () => {
  await page.locator(".step", { hasText: "Close the accounts" }).getByRole("button").click();
  await page.locator(".step-edit select").selectOption({ label: "Sofia Rossi" });
  await page.waitForSelector(".toast");
  await page.reload();
  expect((await page.locator(".step", { hasText: "Close the accounts" }).innerText()).includes("Sofia Rossi"), "given to Sofia");
  await page.locator(".step", { hasText: "Close the accounts" }).getByRole("button").click();
  await page.getByRole("button", { name: "Remove" }).click();
  await page.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(1200);
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
  await page.waitForSelector(".toast");
  await page.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(1200);
  const after = await published();
  expect(after.length === 3 && after[1].includes("people.leaving_cancelled") && after[0].includes("people.leaving ") && after[0].includes("2026-12-18"), "stopped then restarted: " + after.join(" | "));
});

await step("HR imports a spreadsheet: sees the plan, imports", async () => {
  const file = tmp + "/people.csv";
  writeFileSync(file, "Employee Name,Job Title,Department,Location\nHugo Bernard,Senior account manager,Sales,Lyon\nJean Inconnu,Ghost,,\n");
  await page.goto(origin + "/chest/import");
  await page.locator("input[type=file]").setInputFiles(file);
  await page.waitForSelector("table.plan");
  const plan = await page.locator("table.plan").innerText();
  expect(plan.includes("Senior account manager") && plan.includes("Nobody by that name here"), "plan");
  await page.getByRole("button", { name: "Import 1 profile" }).click();
  await page.waitForURL(/\/chest$/u);
  await page.getByPlaceholder("A name, a job, a topic…").fill("senior");
  expect((await cards()).join("|") === "Hugo Bernard", "imported");
  const csv = await (await page.request.get(origin + "/chest/export")).text();
  expect(csv.includes("Senior account manager") && csv.startsWith("﻿Name,Job title"), "export");
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
  await page.getByLabel("Their manager").selectOption({ label: "Inès Moreau" });
  expect((await page.getByLabel("First day").inputValue()) === "2026-11-02", "first day from Hiring");
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
  await arrival.getByRole("button", { name: "Remove" }).click();
  await page.waitForSelector(".toast");
  await page.reload();
  expect(await page.locator(".arrival", { hasText: "Marc Lefort" }).count() === 0, "removed");
});

await step("a hire who already has access is offered to link on the directory, in one click", async () => {
  await deliver("hiring.hired", { candidate: "cand_8", name: "Nora Petit", email: null, job: "Sales assistant", team: "Sales", place: null, startDate: null, hiredBy: id("ines") });
  await page.goto(origin + "/chest");
  const offer = page.locator(".banner.suggest", { hasText: "Nora Petit now has access" });
  await offer.getByRole("button", { name: "Yes, link" }).click();
  await page.waitForSelector(".toast");
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
  expect(await page.locator(".wall .away").count() === 1, "only Léa is away");
  await card.getByRole("link").click();
  await page.waitForURL(/\/chest\/people\/mbr_/u);
  const note = (await page.locator(".profile-id .away").innerText()).trim();
  expect(note.startsWith("Away · back on") && !/holiday|sick|note/iu.test(await page.locator("main").innerText()), "profile: " + note);
  await deliver("leave.cancelled", { member: id("lea"), from: day(-1), to: day(2), fromHalf: "am", toHalf: "pm", request: "901" });
  await page.goto(origin + "/chest");
  expect(await page.locator(".wall .away").count() === 0, "gone once cancelled");
  // Away again for the screenshots and the audit.
  await deliver("leave.approved", { member: id("lea"), from: day(0), to: day(4), fromHalf: "am", toHalf: "pm", request: "902" });
  await deliver("leave.approved", { member: id("tom"), from: day(0), to: day(0), fromHalf: "pm", toHalf: "pm", request: "903" });
  await page.goto(origin + "/chest");
  expect((await page.locator(".wall li", { hasText: "Tom Walker" }).locator(".away").innerText()).trim().startsWith("Away this afternoon"), "half day");
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

await step("phone width: no sideways scroll; the org chart is a list", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/chest", "/chest/chart", "/chest/todo", "/chest/checklists", "/chest/people/" + id("ines")]) {
    await page.goto(origin + path);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width <= 392, path + " overflows: " + width);
  }
  await page.goto(origin + "/chest/chart");
  const box = await page.locator(".node-card").first().boundingBox();
  expect(box.width > 300, "list card width " + box.width);
});

await browser.close();
done(problems);
