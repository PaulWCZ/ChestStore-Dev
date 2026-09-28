// Goals, as people use it, in a real browser: node lab/chest-dev/flows/goals.mjs [port]
// (the harness runs the tool with --reset: Atelier Martin's sample cycles are there).
import { as, done, expect, open, step } from "./lib.mjs";

const port = Number(process.argv[2] ?? 5600);
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

await step("Hugo sees his check-ins of the week and checks one in with a note", async () => {
  await page.goto(origin + "/chest");
  expect(await page.getByRole("heading", { name: "This week’s check-ins" }).isVisible(), "waiting section");
  const item = page.locator(".waiting-item", { hasText: "Shops signed" });
  await item.getByLabel("Value now").fill("6");
  await item.locator("label.segment", { hasText: "On track" }).click();
  await item.getByLabel("What happened?").fill("Signed Meubles Durand in Grenoble");
  await item.getByRole("button", { name: "Check in" }).click();
  await page.waitForSelector(".toast");
  expect((await page.locator(".toast").innerText()).includes("Checked in"), "toast");
  await page.waitForTimeout(800);
  expect(await page.locator(".waiting-item", { hasText: "Shops signed" }).count() === 0, "left the list");
});

await step("…takes it back with Undo, then checks in again", async () => {
  await page.locator(".toast button").click();
  await page.waitForTimeout(1500);
  await page.reload();
  const item = page.locator(".waiting-item", { hasText: "Shops signed" });
  expect(await item.count() === 1, "back in the list");
  await item.getByLabel("Value now").fill("6");
  await item.locator("label.segment", { hasText: "On track" }).click();
  await item.getByRole("button", { name: "Check in" }).click();
  await page.waitForSelector(".toast");
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
  await page.getByLabel("Supports").selectOption({ label: "Win 20 new customers in Lyon" });
  const rows = page.locator(".kr-row");
  await rows.nth(0).getByLabel("Key result", { exact: true }).fill("Showroom visits a month");
  await rows.nth(0).getByLabel("To", { exact: true }).fill("80");
  await rows.nth(0).getByLabel("Unit").fill("visits");
  await page.getByRole("button", { name: "Add a key result" }).click();
  await rows.nth(1).getByLabel("Key result", { exact: true }).fill("New showroom signage installed");
  await rows.nth(1).getByLabel("Measured as").selectOption("milestone");
  await rows.nth(1).getByLabel("Owner").selectOption({ label: "Inès Moreau" });
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
  await page.locator("select[id^=all-]").first().selectOption({ label: "Tom Walker" });
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
  await page.getByRole("button", { name: /Reporter sur Q4 2026/u }).click();
  await page.waitForSelector(".toast >> text=Reporté");
  await page.goto(origin + "/chest/cycles/1");
  expect((await page.locator("main").innerText()).includes("Une annonce plus précise"), "review shows the learning");
});

await step("Camille starts the next cycle", async () => {
  await page.goto(origin + "/chest/cycles");
  await page.getByRole("button", { name: "Nouveau cycle" }).click();
  await page.getByRole("button", { name: "Créer le cycle" }).click();
  await page.waitForSelector("text=Cycle créé.");
  await page.waitForFunction(() => document.querySelectorAll("ul.rows > li").length === 3, null, { timeout: 5000 });
  expect((await page.locator("ul.rows").innerText()).includes("Q1 2027"), "Q1 2027 suggested and created");
});

await step("Friday's reminder reaches whoever has key results waiting, in their language", async () => {
  await page.request.post(origin + "/_dev/schedule", { form: { name: "reminder" } });
  const bell = await dev();
  expect(/attendent votre point de la semaine|attend votre point de la semaine/u.test(bell), "French reminder");
  expect(/wait for your weekly check-in|waits for your weekly check-in/u.test(bell), "English reminder");
});

await step("someone leaves: the admins are told, their goals wait for a new owner", async () => {
  await page.request.post(origin + "/_dev/event", { form: { type: "member.removed", member: "mbr_sofiaaaaaaaaaaaaaaaaaaaaaa" } });
  await french("camille");
  await page.goto(origin + "/chest");
  expect((await page.locator(".banner").innerText()).includes("nouveau responsable"), "banner again");
  await page.goto(origin + "/chest/objectives/6");
  expect((await page.locator("main").innerText()).includes("Sofia Rossi (ancien membre)"), "former member");
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
