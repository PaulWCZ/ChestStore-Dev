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
  expect((await page.locator(".ck-toast").innerText()).includes("Question deleted.") && (await page.locator(".ck-toast-undo").count()) === 1, "undo toast");
  await page.waitForSelector(".save-state.saved", { timeout: 10000 });
  await page.getByRole("button", { name: "Publish" }).click();
  await page.waitForSelector("dialog[open]");
  link = (await page.locator("dialog[open] code").innerText()).trim();
  expect(/^http:\/\/localhost:\d+\/[a-z0-9]{8}$/u.test(link), "link: " + link);
});

await step("options: Enter goes to the next option and the cursor follows (no words glued into one option)", async () => {
  await page.keyboard.press("Escape");
  const card = await add(/^One choice/u, "Main course");
  const first = card.locator("input.option-input").first();
  await first.click();
  await page.keyboard.type("Fish");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Veggie");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Meat");
  const labels = await card.locator("input.option-input").evaluateAll(els => els.map(e => e.value));
  expect(JSON.stringify(labels) === JSON.stringify(["Fish", "Veggie", "Meat"]), "options: " + JSON.stringify(labels));
  await card.getByRole("button", { name: "Done" }).click();
});

await step("an edit made just before switching tab is kept (the tab waits for the save)", async () => {
  await page.locator("#form-intro").fill("Tell us before Thursday noon.");
  await page.getByRole("link", { name: "Share", exact: true }).click();
  await page.waitForURL(/\/share$/u);
  await page.goto(formUrl);
  expect((await page.locator("#form-intro").inputValue()) === "Tell us before Thursday noon.", "intro kept");
  await page.locator(".qcard", { hasText: "Main course" }).locator(".card-summary").click();
  const kept = await page.locator(".qcard.open input.option-input").evaluateAll(els => els.map(e => e.value));
  expect(kept.includes("Meat"), "the last option kept: " + kept.join(","));
  await page.getByRole("button", { name: "Publish changes" }).click();
  await page.waitForSelector("dialog[open]");
  await page.keyboard.press("Escape");
});

await step("a manager allows the company's website on the Share tab: the public form may be framed there at once", async () => {
  await as(context, origin, "camille");
  await english();
  const policy = async () => (await page.request.get(link)).headers()["content-security-policy"] ?? "";
  const sites = page.getByLabel("Websites allowed to show it (one per line)");
  const save = async () => {
    for (const close of await page.locator(".ck-toast-close").all()) await close.click().catch(() => {});
    await page.getByRole("button", { name: "Save the websites" }).click();
    await page.locator(".ck-toast", { hasText: "Websites saved." }).waitFor();
  };
  await page.goto(formUrl + "/share");
  // The public form has just been served (the policy read), then a site is
  // allowed: the very next request carries it — no waiting.
  expect((await policy()).includes("frame-ancestors 'none'"), "nobody frames it yet");
  await sites.fill("https://www.atelier-martin.fr");
  await save();
  expect((await policy()).includes("frame-ancestors 'self' https://www.atelier-martin.fr"), "framed by the site at once");
  expect((await page.request.get(origin + "/chest")).headers()["content-security-policy"].includes("frame-ancestors 'none'"), "never the team's pages");
  await sites.fill("");
  await save();
  expect((await policy()).includes("frame-ancestors 'none'"), "a site removed is refused at once");
  await as(context, origin, "ines");
  await english();
});

await step("settings save by themselves (no Save button): a copy by email, the bell and email for the owner, other tools", async () => {
  await page.goto(formUrl + "/settings");
  expect((await page.getByRole("button", { name: "Save" }).count()) === 0, "no Save button");
  await page.locator("label.switch", { hasText: "Email a copy" }).click();
  await page.locator("label.switch", { hasText: "Also send them each batch by email" }).click();
  await page.locator("label.switch", { hasText: "The other tools of your Chest" }).click();
  await page.locator("input[placeholder='Thank you!']").fill("Thanks, see you Friday");
  // Straight to another tab: the change goes first.
  await page.getByRole("link", { name: "Answers", exact: true }).click();
  await page.waitForURL(/\/answers$/u);
  await page.goto(formUrl + "/settings");
  expect((await page.locator("input[placeholder='Thank you!']").inputValue()) === "Thanks, see you Friday", "thank-you title kept");
  expect((await page.locator(".settings-status").innerText()).includes("All changes saved"), "said saved");
});

// A visitor on a phone, in French.
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-FR", isMobile: true, hasTouch: true });
await phone.addCookies([{ name: "lang", value: "fr", url: origin }]);
const visitor = await phone.newPage();
visitor.on("pageerror", e => problems.push("visitor: " + e.message));

await step("on a phone, a French visitor: the English form speaks English, one question at a time, the condition after Yes, a PDF sent", async () => {
  await visitor.goto(link);
  expect((await visitor.locator(".runner-title").innerText()) === "Team lunch on Friday", "title");
  // The form is written in English: its page speaks English, even to a French visitor.
  expect(await visitor.getByRole("button", { name: "Start", exact: true }).count() === 1, "tool words pinned to the form's language");
  expect(!(await visitor.locator(".enter-hint").first().isVisible()), "no 'press Enter' on a phone");
  await visitor.getByRole("button", { name: "Start", exact: true }).click();
  await visitor.locator("input.answer-input").fill("Nina");
  await visitor.keyboard.press("Enter");
  await visitor.locator("input.answer-input").fill("pas-une-adresse");
  await visitor.locator(".button.form-button", { hasText: "OK" }).click();
  expect((await visitor.locator(".q-error").innerText()).includes("Check the email address"), "email refused");
  await visitor.locator("input.answer-input").fill("nina@example.com");
  await visitor.keyboard.press("Enter");
  expect(/^\d+% done$/u.test(await visitor.locator(".step-count").innerText()), "a percentage, not a total that changes");
  await visitor.locator("label.pill", { hasText: "Yes" }).tap();
  await visitor.waitForSelector("text=Which dessert?");
  await visitor.locator("input.answer-input").fill("Tarte au citron");
  await visitor.keyboard.press("Enter");
  await visitor.locator("input[type=file]").setInputFiles({ name: "menu.pdf", mimeType: "application/pdf", buffer: pdf });
  await visitor.waitForSelector(".ck-file-ready, .ck-file-failed, .ck-file-problems .ck-error, .q-error", { timeout: 10000 });
  expect(await visitor.locator(".ck-file-ready").count() === 1, "file: " + (await visitor.locator(".step").innerText()));
  await visitor.waitForTimeout(2200);
  await visitor.locator(".button.form-button", { hasText: "OK" }).click();
  await visitor.locator("label.pill", { hasText: "Fish" }).tap();
  await visitor.waitForTimeout(600);
  await visitor.locator(".button.form-button", { hasText: "Send" }).click();
  await visitor.waitForSelector(".runner-thanks", { timeout: 15000 });
  expect((await visitor.locator(".runner-thanks").innerText()).includes("Thanks, see you Friday"), "own thank-you title");
  expect((await dev()).includes("Your answers — Team lunch on Friday"), "copy in the outbox, in the form's language");
  // The owner (who reads French) is told in the bell once, and by email with the answer.
  const told = (await dev()).split("1 nouvelle réponse à Team lunch on Friday").length - 1;
  expect(told === 2, "one bell item and one email: " + told);
  expect((await dev()).includes("replies to <code>nina@example.com</code>"), "Reply writes to Nina");
  expect((await dev()).includes("<code>forms.answered</code>"), "told to the other tools");
});

await step("another visitor answers No (it moves on by itself): the condition is skipped, nothing about dessert is kept", async () => {
  const other = await phone.newPage();
  await other.goto(link + "?" + "zzz=1");
  await other.getByRole("button", { name: "Start", exact: true }).click();
  await other.locator("input.answer-input").fill("Tom");
  await other.keyboard.press("Enter");
  await other.keyboard.press("Enter");
  await other.locator("label.pill", { hasText: "No" }).tap();
  await other.waitForTimeout(600);
  expect((await other.locator(".q-title").innerText()).startsWith("Your menu wishes"), "Yes/No moves on by itself: jumped over the condition");
  await other.keyboard.press("Enter");
  await other.locator("label.pill", { hasText: "Meat" }).tap();
  await other.waitForTimeout(2000);
  await other.locator(".button.form-button", { hasText: "Send" }).click();
  await other.waitForSelector(".runner-thanks", { timeout: 15000 });
});

await step("the creator reads the answers, opens one, gets its file, and the summary", async () => {
  await page.goto(formUrl + "/answers");
  expect((await page.locator(".answers-count").innerText()) === "2 answers", "two answers");
  const bell = (await dev()).split("<h2>Bell")[1]?.split("</section>")[0] ?? "";
  expect(!bell.includes("réponse à Team lunch on Friday"), "opening the answers cleared the bell item");
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
  const zip = await page.request.get(formUrl + "/archive");
  const body = await zip.body();
  expect(zip.headers()["content-type"] === "application/zip" && body.subarray(0, 2).toString() === "PK" && body.includes(Buffer.from("menu.pdf")) && body.includes(Buffer.from("%PDF-")), "the ZIP holds the CSV and the file");
});

await step("the answer is followed up; the person who sent a team request sees where it stands", async () => {
  await as(context, origin, "camille");
  await english();
  await page.goto(origin + "/chest/forms/3/answers");
  await page.locator("tr", { hasText: "Sofia Rossi" }).getByRole("link", { name: "Open" }).click();
  await page.locator(".follow-states label", { hasText: "Done" }).click();
  await page.waitForSelector(".ck-toast");
  await page.locator("textarea").fill("The printer was fixed this morning.");
  await page.locator("h2", { hasText: "Follow-up" }).click();
  await page.waitForSelector("text=Note saved.");
  expect((await dev()).includes("Your request “IT request” is done"), "Sofia is told in the bell");
  await as(context, origin, "sofia");
  await english();
  await page.goto(origin + "/chest");
  await page.locator(".sent li", { hasText: "IT request" }).first().click();
  expect((await page.locator(".follow-up").innerText()).includes("The printer was fixed this morning."), "Sofia reads the note");
});

await step("an anonymous form never lists one person's answers; the summary shows", async () => {
  await as(context, origin, "camille");
  await english();
  await page.goto(origin + "/chest/forms/4/answers");
  expect((await page.locator("table.answers-table").count()) === 0, "no table");
  expect((await page.locator(".notice").innerText()).includes("never shown one by one"), "said why");
  expect((await page.request.get(origin + "/chest/forms/4/answers/seed00000000001a")).status() === 404, "no single answer page");
});

await step("a team survey with a matrix and a ranking, in the classic layout: titles inside their cards", async () => {
  await as(context, origin, "ines");
  await english();
  await page.goto(origin + "/chest/f/v6m3tq8r");
  const card = await page.locator(".classic-page > .question").first().boundingBox();
  const legend = await page.locator(".classic-page > .question legend").first().boundingBox();
  expect(legend.y >= card.y + 8, `the title sits inside its card (${legend.y} vs ${card.y})`);
  for (const row of ["Light", "Noise", "Space at the bench", "Tools at hand"]) await page.getByRole("radiogroup", { name: row }).locator(".matrix-cell").nth(2).click();
  for (const item of ["Better light", "Bigger benches", "A quieter finishing room", "A coffee corner"]) await page.locator(".rank-pick", { hasText: item }).click();
  expect((await page.locator(".rank-item.on").first().innerText()).includes("Better light"), "ranked in the tapped order");
  await page.getByRole("button", { name: "Send" }).click();
  await page.waitForSelector(".runner-thanks", { timeout: 15000 });
  await page.goto(origin + "/chest/forms/7/summary");
  expect((await page.locator(".grid-table").count()) === 1 && (await page.locator(".ranks li").count()) === 4, "summarised");
});

await step("a form in two languages: French visitors read the French version, others the English one — never a mix", async () => {
  const fr = await phone.newPage();
  await fr.goto(origin + "/p4x8vn2c");
  expect((await fr.locator(".runner-title").innerText()).startsWith("Portes ouvertes"), "French version");
  expect((await fr.locator(".form-button").innerText()).includes("Envoyer"), "French words");
  const en = await browser.newContext({ locale: "en-GB" });
  await en.addCookies([{ name: "lang", value: "en", url: origin }]);
  const g = await en.newPage();
  await g.goto(origin + "/p4x8vn2c");
  expect((await g.locator(".runner-title").innerText()).startsWith("Open day") && (await g.locator(".form-button").innerText()).includes("Send"), "English for an English visitor");
  expect((await g.locator(".ck-languages a").count()) === 2, "the switch offers the form's two languages");
  await en.close();
});

await step("on a phone: the builder of a form with page rules never scrolls sideways; the four tabs fit", async () => {
  const p = await phone.newPage();
  await phone.addCookies([{ name: "dev_member", value: "mbr_inesaaaaaaaaaaaaaaaaaaaaaa", url: origin }]);
  await p.goto(origin + "/chest/forms/1");
  const width = await p.evaluate(() => document.documentElement.scrollWidth);
  expect(width <= 390, "page width " + width);
  const tabs = await p.locator(".form-top .ck-tabs a").evaluateAll(els => els.map(e => e.getBoundingClientRect().right));
  expect(tabs.length === 4 && tabs.every(r => r <= 390), "tabs fit: " + tabs.join(","));
  await p.close();
});

await step("forms are found by title; a deleted form waits in Deleted forms and comes back", async () => {
  await page.goto(origin + "/chest?q=lunch");
  expect((await page.locator(".form-card").count()) === 1, "search");
  await page.goto(formUrl + "/settings");
  // Deleting asks nothing: the toast says what went and where it waits, with Undo.
  await page.getByRole("button", { name: "Delete this form" }).click();
  await page.waitForURL(/\/chest(\?deleted=\d+)?$/u);
  await page.waitForSelector(".ck-toast");
  const said = await page.locator(".ck-toast").innerText();
  expect(said.includes("with its answers") && said.includes("Deleted forms") && (await page.locator(".ck-toast-undo").count()) === 1, "the toast says what goes, with Undo: " + said);
  await page.getByRole("link", { name: "1 deleted form" }).click();
  await page.getByRole("button", { name: "Bring it back" }).click();
  await page.waitForURL(/\/chest\/forms\/\d+$/u);
});

await step("a form comes from Google Forms: its file becomes a draft, and the builder says what did not come", async () => {
  await page.goto(origin + "/chest/new");
  await page.locator(".import-box summary").click();
  await page.locator(".import-box input[type=file]").setInputFiles(new URL("../../../tools/public-and-private/forms/test/fixtures/google-form.json", import.meta.url).pathname);
  await page.waitForURL(/\/chest\/forms\/\d+\?imported=/u, { timeout: 15000 });
  expect((await page.locator(".notice").innerText()).includes("logic rules"), "says what did not come");
  expect((await page.locator(".qcard").count()) === 11, "11 questions: " + (await page.locator(".qcard").count()));
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
  await page.goto(formUrl);
  await page.getByRole("button", { name: "Stop taking answers" }).click();
  await page.waitForSelector(".ck-toast");
  await visitor.goto(link);
  expect((await visitor.locator("main").innerText()).includes("This form is closed"), "closed, in the form's language");
  const other = await page.request.get(origin + "/chest/forms/2");
  expect(other.status() === 404, "not shared: " + other.status());
  expect((await page.request.get(origin + "/zzzzzzzz")).status() === 404, "unknown form");
});

await step("a date question: the kit's date field, typed in words, Enter reads it then goes on; a wrong date says why", async () => {
  await as(context, origin, "ines");
  await english();
  await page.goto(origin + "/chest/new");
  await page.locator(".template-card", { hasText: "Blank form" }).click();
  await page.waitForURL(/\/chest\/forms\/\d+$/u);
  await page.locator("#form-title").fill("Start date");
  let card = await add("A day", "When can you start?");
  await card.locator("label.switch").click();
  await card.getByRole("button", { name: "Done" }).click();
  card = await add("A name, a word, a line", "Your name");
  await card.getByRole("button", { name: "Done" }).click();
  expect((await page.locator("input[type=date]").count()) === 0, "never the browser's date field");
  await page.waitForSelector(".save-state.saved", { timeout: 10000 });
  await page.getByRole("button", { name: "Publish" }).click();
  await page.waitForSelector("dialog[open]");
  const dated = (await page.locator("dialog[open] code").innerText()).trim();
  await page.keyboard.press("Escape");
  const p = await phone.newPage();
  await p.goto(dated);
  await p.getByRole("button", { name: "Start", exact: true }).click();
  await p.locator(".ck-date-input").fill("31/02/2027");
  await p.keyboard.press("Enter");
  await p.waitForSelector(".ck-date .ck-error");
  expect((await p.locator(".q-title").first().innerText()).startsWith("When can you start?"), "a wrong date stays on its question");
  await p.locator(".ck-date-input").fill("tomorrow");
  await p.keyboard.press("Enter");
  await p.waitForFunction(() => document.querySelector(".q-title")?.textContent?.startsWith("Your name"));
  await p.getByRole("button", { name: "Previous" }).click();
  expect(/Tomorrow/u.test(await p.locator(".ck-date-read").innerText()), "the day in words under the field");
  await p.close();
});

await phone.close();
await browser.close();
done(problems);
