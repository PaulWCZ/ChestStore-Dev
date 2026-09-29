// Forms, as a creator builds one and people answer it, in a real browser:
//   node lab/chest-dev/flows/forms.mjs [port]   (harness with --reset: the sample forms are there)
import { as, done, expect, open, step } from "./lib.mjs";

const port = Number(process.argv[2] ?? 6800);
const { browser, context, page, origin, problems } = await open(port, "ines", { allow404: /\/(zzzzzzzz|chest\/forms\/2)$/u });
const english = async () => context.addCookies([{ name: "dev_locale", value: "en", url: origin }]);
const dev = async () => (await page.request.get(origin + "/_dev")).text();
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
let formUrl = "", link = "", formId = "";

async function add(hint, title) {
  await page.getByRole("button", { name: "Add a question" }).click();
  await page.locator(".type-item", { hasText: hint }).click();
  const card = page.locator(".qcard.open");
  await card.locator("input.field.big").fill(title);
  return card;
}

await step("a creator starts a blank form and builds it: five kinds, a required one, a condition", async () => {
  await english();
  await page.goto(origin + "/chest");
  await page.getByRole("link", { name: "New form" }).click();
  await page.waitForURL(/\/chest\/new$/u);
  await page.locator(".template-card", { hasText: "Blank form" }).click();
  await page.waitForURL(/\/chest\/forms\/\d+$/u);
  formUrl = page.url();
  formId = formUrl.split("/").pop();
  await page.locator("#form-title").fill("Team lunch on Friday");
  let card = await add("A name, a word, a line", "Your name");
  await card.locator("label.switch").click();
  await card.getByRole("button", { name: "Done" }).click();
  card = await add("Checked as an address", "Your email address");
  await card.getByRole("button", { name: "Done" }).click();
  card = await add("Two big buttons", "Will you stay for dessert?");
  await card.getByRole("button", { name: "Done" }).click();
  card = await add("A name, a word, a line", "Which dessert?");
  await card.getByRole("button", { name: "Show only if…" }).click();
  await card.locator(".logic.on select").nth(2).selectOption("yes");
  await card.getByRole("button", { name: "Done" }).click();
  card = await add("A CV, a photo, a PDF", "Your menu wishes (PDF)");
  await card.locator("select").first().selectOption("documents");
  await card.getByRole("button", { name: "Done" }).click();
  await page.waitForSelector(".save-state.saved", { timeout: 10000 });
  // The live preview shows the form as it is being written.
  expect((await page.locator(".preview-pane").innerText()).includes("Team lunch on Friday") || (await page.locator(".preview-pane .q-title").count()) > 0, "preview follows");
  expect((await page.locator(".qcard").count()) === 5, "five questions");
  expect((await page.locator(".card-badge").count()) === 1, "one with a condition");
});

await step("an unfinished question blocks publishing and says where; fixed, the form goes live", async () => {
  const card = await add("A name, a word, a line", "");
  await card.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Publish" }).click();
  await page.waitForSelector(".problems");
  expect((await page.locator(".problems").innerText()).includes("A question has no text."), "problem shown");
  await page.locator(".qcard.has-problem .card-summary").click();
  await page.locator(".qcard.open").getByRole("button", { name: "Delete" }).click();
  expect((await page.locator(".toast").innerText()).includes("Question deleted."), "undo toast");
  await page.waitForSelector(".save-state.saved", { timeout: 10000 });
  await page.getByRole("button", { name: "Publish" }).click();
  await page.waitForSelector("dialog[open]");
  link = (await page.locator("dialog[open] code").innerText()).trim();
  expect(/^http:\/\/localhost:\d+\/[a-z0-9]{8}$/u.test(link), "link: " + link);
});

await step("settings: a copy by email, the bell for the owner", async () => {
  await page.goto(formUrl + "/settings");
  await page.locator("label.switch", { hasText: "Email a copy" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForSelector(".toast");
  expect((await page.locator(".toast").innerText()).includes("Settings saved."), "saved");
});

// A visitor on a phone, in French.
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-FR", isMobile: true, hasTouch: true });
await phone.addCookies([{ name: "lang", value: "fr", url: origin }]);
const visitor = await phone.newPage();
visitor.on("pageerror", e => problems.push("visitor: " + e.message));

await step("on a phone, in French: one question at a time, the condition asked after Oui, a PDF sent", async () => {
  await visitor.goto(link);
  expect((await visitor.locator(".runner-title").innerText()) === "Team lunch on Friday", "title");
  await visitor.getByRole("button", { name: "Commencer", exact: true }).click();
  await visitor.locator("input.answer-input").fill("Nina");
  await visitor.keyboard.press("Enter");
  await visitor.locator("input.answer-input").fill("pas-une-adresse");
  await visitor.locator(".button.form-button", { hasText: "OK" }).click();
  expect((await visitor.locator(".q-error").innerText()).includes("Vérifiez l’adresse e-mail"), "email refused in French");
  await visitor.locator("input.answer-input").fill("nina@example.com");
  await visitor.keyboard.press("Enter");
  expect((await visitor.locator(".step-count").innerText()) === "3 sur 4", "4 questions before the condition: " + (await visitor.locator(".step-count").innerText()));
  await visitor.locator("label.pill", { hasText: "Oui" }).tap();
  await visitor.waitForSelector("text=Which dessert?");
  expect((await visitor.locator(".step-count").innerText()) === "4 sur 5", "the condition adds one");
  await visitor.locator("input.answer-input").fill("Tarte au citron");
  await visitor.keyboard.press("Enter");
  await visitor.locator("input[type=file]").setInputFiles({ name: "menu.pdf", mimeType: "application/pdf", buffer: pdf });
  await visitor.waitForSelector(".file-chosen, .q-error");
  expect(await visitor.locator(".file-chosen").count() === 1, "file: " + (await visitor.locator(".step").innerText()));
  await visitor.waitForTimeout(2200);
  await visitor.locator(".button.form-button", { hasText: "Envoyer" }).click();
  await visitor.waitForSelector(".runner-thanks", { timeout: 15000 });
  expect((await visitor.locator(".runner-thanks").innerText()).includes("Une copie arrive"), "copy said");
  expect((await dev()).includes("Vos réponses — Team lunch on Friday"), "copy in the outbox, in French");
  // The owner (who reads French) is told in the bell, once.
  const bell = (await dev()).split("1 nouvelle réponse à Team lunch on Friday").length - 1;
  expect(bell === 1, "one bell item: " + bell);
});

await step("another visitor answers Non: the condition is skipped, nothing about dessert is kept", async () => {
  const other = await phone.newPage();
  await other.goto(link + "?" + "zzz=1");
  await other.getByRole("button", { name: "Commencer", exact: true }).click();
  await other.locator("input.answer-input").fill("Tom");
  await other.keyboard.press("Enter");
  await other.keyboard.press("Enter");
  await other.locator("label.pill", { hasText: "Non" }).tap();
  await other.waitForTimeout(600);
  expect((await other.locator(".q-title").innerText()).startsWith("Your menu wishes"), "jumped over the condition");
  await other.waitForTimeout(2000);
  await other.locator(".button.form-button", { hasText: "Envoyer" }).click();
  await other.waitForSelector(".runner-thanks", { timeout: 15000 });
});

await step("the creator reads the answers, opens one, gets its file, and the summary", async () => {
  await page.goto(formUrl + "/answers");
  expect((await page.locator(".answers-count").innerText()) === "2 answers", "two answers");
  expect(!(await dev()).includes("réponse à Team lunch on Friday"), "opening the answers cleared the bell item");
  await page.locator("tr", { hasText: "nina@example.com" }).getByRole("link", { name: "Open" }).click();
  await page.waitForURL(/\/answers\/[a-z0-9]{16}$/u);
  expect((await page.locator(".answer-list").innerText()).includes("Tarte au citron"), "conditional answer kept");
  const href = await page.locator("a.file-link").getAttribute("href");
  const file = await page.request.get(origin + href);
  expect(file.status() === 200 && (await file.body()).subarray(0, 5).toString() === "%PDF-", "file served: " + file.status());
  await page.goto(formUrl + "/summary");
  const yesno = page.locator(".summary-card", { hasText: "Will you stay for dessert?" });
  expect((await yesno.innerText()).includes("50%"), "yes/no bars");
});

await step("the CSV opens in a spreadsheet: a byte-order mark, the questions, no formula", async () => {
  const csv = await page.request.get(formUrl.replace(/\/chest\/forms\/(\d+)$/u, "/chest/forms/$1/export"));
  const text = (await csv.body()).toString("utf8");
  expect(csv.headers()["content-type"].startsWith("text/csv") && text.startsWith("﻿"), "csv");
  expect(text.includes("Will you stay for dessert?") && text.includes("menu.pdf"), "columns");
});

await step("a team member answers the anonymous check-in once; a second visit says so", async () => {
  await as(context, origin, "sofia");
  await english();
  await page.goto(origin + "/chest");
  await page.locator(".to-answer li", { hasText: "How was your week?" }).getByRole("link", { name: "Answer" }).click();
  await page.waitForURL(/\/chest\/f\/w5c8ja3e$/u);
  expect((await page.locator(".runner-start").innerText()).includes("Anonymous"), "anonymity said");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.locator(".star").nth(3).click();
  await page.waitForTimeout(700);
  await page.locator(".cell", { hasText: "3" }).click();
  await page.waitForTimeout(700);
  await page.locator(".button.form-button", { hasText: "OK" }).click();
  await page.locator(".button.form-button", { hasText: "Send" }).click();
  await page.waitForSelector(".runner-thanks", { timeout: 15000 });
  await page.goto(origin + "/chest/f/w5c8ja3e");
  expect((await page.locator("main").innerText()).includes("You already answered"), "once");
});

await step("a closed form says so to visitors; a form not shared is not found", async () => {
  await as(context, origin, "ines");
  await english();
  await page.goto(formUrl + "/settings");
  await page.getByRole("button", { name: "Stop taking answers" }).click();
  await page.waitForSelector(".toast");
  await visitor.goto(link);
  expect((await visitor.locator("main").innerText()).includes("Ce formulaire est fermé"), "closed in French");
  const other = await page.request.get(origin + "/chest/forms/2");
  expect(other.status() === 404, "not shared: " + other.status());
  expect((await page.request.get(origin + "/zzzzzzzz")).status() === 404, "unknown form");
});

await phone.close();
await browser.close();
done(problems);
