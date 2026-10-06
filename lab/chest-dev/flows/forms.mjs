// Forms, as a creator builds one and people answer it, in a real browser:
//   node lab/chest-dev/flows/forms.mjs [port]   (harness with --reset: the sample forms are there)
import { as, done, expect, open, step } from "./lib.mjs";

const port = Number(process.argv[2] ?? 6800);
const { browser, context, page, origin, problems } = await open(port, "ines", { allow404: /\/(zzzzzzzz|chest\/forms\/2)$/u });
const english = async () => context.addCookies([{ name: "dev_locale", value: "en", url: origin }]);
const dev = async () => (await page.request.get(origin + "/_dev")).text();
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
let formUrl = "", link = "", formId = "", datedLink = "", datedForm = "";

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
  await card.locator("label.ck-switch-label").click();
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
  expect(/^https?:\/\/(?:localhost|127\.0\.0\.1):\d+\/[a-z0-9]{8}$/u.test(link), "link: " + link);
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

await step("settings save by themselves (no Save button): a copy by email, the bell for the owner, other tools", async () => {
  await page.goto(formUrl + "/settings");
  expect((await page.getByRole("button", { name: "Save" }).count()) === 0, "no Save button");
  await page.locator("label.ck-switch-label", { hasText: "Email a copy" }).click();
  // The people told hear of answers in their Chest notifications; no
  // "email me" switch: each one chooses in the Chest.
  expect((await page.getByRole("switch", { name: /by email/u }).count()) === 0, "no email switch for the people told");
  expect((await page.locator("main").innerText()).includes("Each person chooses in the Chest whether these also come by email"), "the bell's hint says who chooses");
  await page.locator("label.ck-switch-label", { hasText: "The other tools of your Chest" }).click();
  await page.locator("input[placeholder='Thank you!']").fill("Thanks, see you Friday");
  // Straight to another tab: the change goes first.
  await page.getByRole("link", { name: "Answers", exact: true }).click();
  await page.waitForURL(/\/answers$/u);
  await page.goto(formUrl + "/settings");
  expect((await page.locator("input[placeholder='Thank you!']").inputValue()) === "Thanks, see you Friday", "thank-you title kept");
  expect((await page.locator(".settings-status").innerText()).includes("All changes saved"), "said saved");
});

await step("a closing day before today is refused as typed: nothing is saved while it stands, not even another setting; corrected, all of it is", async () => {
  // Kit 0.2.4: the settings save by themselves, from the page's state —
  // which still holds the day before. Saving waits (the status says why),
  // so neither the old day nor anything else goes out as if accepted.
  await page.goto(formUrl + "/settings");
  const input = page.locator(".closes-day .ck-date-input");
  const title = page.locator("input[placeholder='Thank you!']");
  const kept = await title.inputValue();
  const html = async () => (await page.request.get(formUrl + "/settings")).text();
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  await input.fill(yesterday);
  await input.press("Tab");
  await page.locator(".closes-day .ck-error", { hasText: /or later\.$/u }).waitFor();
  await page.locator(".save-state.held").waitFor();
  expect((await page.locator(".settings-status").innerText()).includes("Not saved until the closing day is corrected."), "the status says why");
  await title.fill("Held back");
  await page.waitForTimeout(1500);
  expect(await page.locator(".save-state.held").count() === 1, "still not saved");
  const before = await html();
  expect(!before.includes("Held back") && !before.includes("Stop taking answers on") , "nothing saved");
  // Leaving by a tab waits: the page stays.
  await page.getByRole("link", { name: "Answers", exact: true }).click();
  await page.waitForTimeout(800);
  expect(/\/settings$/u.test(page.url()), "the page stays: " + page.url());
  // Corrected (a whole date, no blur): the day and the title are saved.
  const later = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  await input.fill(later);
  await page.locator(".save-state.saved").waitFor({ timeout: 10000 });
  const after = await html();
  expect(after.includes("Held back"), "the title waited and is saved");
  // Back as it was: no end date, the title before.
  await page.getByRole("button", { name: "No end date" }).click();
  await title.fill(kept);
  await page.waitForTimeout(900);
  await page.locator(".save-state.saved").waitFor({ timeout: 10000 });
  expect((await input.inputValue()) === "", "no end date again");
});

// A visitor on a phone, in French.
const phone = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 }, locale: "fr-FR", isMobile: true, hasTouch: true });
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
  // A copy goes only when the visitor asks for it, under the email question.
  await visitor.getByLabel("Email me a copy of my answers").check();
  await visitor.locator(".button.form-button", { hasText: "OK" }).click();
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
  // The owner is told in the bell once (English, and French in the same
  // notice), never by an email of the tool.
  const told = (await dev()).split("fr: 1 nouvelle réponse à Team lunch on Friday").length - 1;
  expect(told === 1, "one bell item: " + told);
  expect(!(await dev()).includes("<b>1 nouvelle réponse"), "no email to the owner");
  // The visitor's copy: replies reach the company's address.
  expect(/Your answers — Team lunch on Friday<\/b>[\s\S]*?replies to <code>contact@atelier-martin\.test<\/code>/u.test(await dev()), "the copy's replies go to the company");
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
  const en = await browser.newContext({ ignoreHTTPSErrors: true, locale: "en-GB" });
  await en.addCookies([{ name: "lang", value: "en", url: origin }]);
  const g = await en.newPage();
  await g.goto(origin + "/p4x8vn2c");
  expect((await g.locator(".runner-title").innerText()).startsWith("Open day") && (await g.locator(".form-button").innerText()).includes("Send"), "English for an English visitor");
  expect((await g.locator(".ck-languages a").count()) === 2, "the switch offers the form's two languages");
  await en.close();
});

await step("the keyboard from the page: Enter on the start page starts (as it says); a page of questions sent empty says so in one alert, a link to each", async () => {
  const en = await browser.newContext({ ignoreHTTPSErrors: true, locale: "en-GB" });
  await en.addCookies([{ name: "lang", value: "en", url: origin }]);
  const v = await en.newPage();
  await v.goto(origin + "/k7m2fq9d");
  await v.waitForSelector(".runner-start");
  await v.keyboard.press("Enter");
  await v.waitForSelector(".step", { timeout: 5000 });
  expect(await v.locator(".step [role=heading][aria-level='1']").count() === 1, "the question is the page's heading");
  await v.goto(origin + "/p4x8vn2c");
  await v.locator(".classic-page button[type=submit]").click();
  await v.waitForSelector(".fix-list a");
  // (The kit's empty live regions — toasts, a file's problems — say nothing.)
  const said = v.locator("[role=alert]").filter({ hasText: /\S/u });
  expect(await said.count() === 1, "one alert: " + (await said.allInnerTexts()).join(" | "));
  expect(await v.locator(".fix-list a").count() >= 1, "a link to each question");
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
  await card.locator("label.ck-switch-label").click();
  await card.getByRole("button", { name: "Done" }).click();
  card = await add("A name, a word, a line", "Your name");
  await card.getByRole("button", { name: "Done" }).click();
  expect((await page.locator("input[type=date]").count()) === 0, "never the browser's date field");
  await page.waitForSelector(".save-state.saved", { timeout: 10000 });
  await page.getByRole("button", { name: "Publish" }).click();
  await page.waitForSelector("dialog[open]");
  const dated = (await page.locator("dialog[open] code").innerText()).trim();
  datedLink = dated;
  datedForm = page.url().replace(/\/chest\/forms\/(\d+).*$/u, "/chest/forms/$1");
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

await step("an answered date retyped as a date that cannot be read is refused: the form does not go on with the day it had; corrected, the new day is sent", async () => {
  // The runner's form is sent without the browser's checks (noValidate):
  // it waits for the field itself (kit 0.2.4 onProblem), never sending the
  // answer before in place of what was typed.
  const p = await phone.newPage();
  await p.goto(datedLink);
  await p.getByRole("button", { name: "Start", exact: true }).click();
  await p.locator(".ck-date-input").fill("tomorrow");
  await p.keyboard.press("Enter");
  await p.waitForFunction(() => document.querySelector(".q-title")?.textContent?.startsWith("Your name"));
  await p.getByRole("button", { name: "Previous" }).click();
  await p.locator(".ck-date-input").fill("31/02/2027");
  await p.locator(".ck-date-input").blur();
  await p.waitForSelector(".ck-date .ck-error");
  await p.locator(".runner-actions .form-button").click();
  await p.waitForTimeout(600);
  expect((await p.locator(".q-title").first().innerText()).startsWith("When can you start?"), "stays on the date");
  expect((await p.locator(".ck-date-input").inputValue()) === "31/02/2027", "the text stays as typed");
  // Corrected and sent on.
  await p.locator(".ck-date-input").fill("15/03/2031");
  await p.locator(".runner-actions .form-button").click();
  await p.waitForFunction(() => document.querySelector(".q-title")?.textContent?.startsWith("Your name"));
  await p.locator("input.answer-input").fill("Refused Then Right");
  await p.waitForTimeout(2200);
  await p.locator(".runner-actions .form-button").click();
  await p.waitForSelector(".runner-thanks, .runner-banner", { timeout: 15000 });
  expect(await p.locator(".runner-thanks").count() === 1, "sent: " + (await p.locator("main").innerText()).slice(0, 300));
  await p.close();
  await as(context, origin, "ines");
  await english();
  await page.goto(datedForm + "/answers");
  const text = await page.locator("main").innerText();
  expect(text.includes("Refused Then Right") && /15 Mar(ch)? 2031|2031-03-15|15\/03\/2031/u.test(text), "the corrected day is the one answered: " + text.slice(0, 400));
});

await step("Settings says the truth about where answers can go (SDK studio.16): Clients and Support are installed and linked to Forms by an admin (events.receivers), so both switches work, with no “not installed” or “not linked” sentence; this Chest sends to web addresses and email, so their forms and the visitor's copy are offered with no warning", async () => {
  await as(context, origin, "ines");
  await english();
  await page.goto(origin + "/chest/forms/5/settings");
  const text = await page.locator("main").innerText();
  expect(!text.includes("not installed in your Chest") && !text.includes("not linked to Forms yet"), "no false sentence about the links");
  expect(text.includes("becomes a contact in Clients") && text.includes("opens a ticket in Support"), "both links say what they do");
  expect(!(await page.getByRole("switch", { name: "Also create a contact in Clients" }).isDisabled()) && !(await page.getByRole("switch", { name: "Also open a ticket in Support" }).isDisabled()), "both switches usable");
  const hooks = await page.locator("fieldset.hooks").innerText();
  expect(!/cannot send answers|paused sending|did not answer/u.test(hooks), "no false warning about web addresses: " + hooks.slice(0, 200));
  expect(await page.locator("fieldset.hooks").getByLabel("Its address").count() === 1, "the form to add an address is offered");
  expect(!/cannot send emails|not connected email|paused email|all of today/u.test(text), "no warning about email");
});

await step("a contact form also makes a contact in Clients and opens a ticket in Support: the author maps the questions, each answer is published typed", async () => {
  await as(context, origin, "ines");
  await english();
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto(origin + "/chest/forms/5/settings");
  // The sample contact form routes already; turned off, then on again: the
  // only email question and the only phone question are guessed.
  expect((await page.locator(".route-fields").count()) === 2, "both routes shown");
  const toContact = page.locator("label.ck-switch-label", { hasText: "Also create a contact in Clients" });
  await toContact.click();
  await page.waitForFunction(() => document.querySelectorAll(".route-fields").length === 1);
  await toContact.click();
  const contact = page.locator(".route-fields").first();
  await contact.waitFor();
  expect((await contact.getByLabel("Their email").locator("option:checked").innerText()) === "Your email address", "email guessed");
  expect((await contact.getByLabel("Their phone").locator("option:checked").innerText()) === "Your phone number", "phone guessed");
  // Round 3: the message, a ticket's subject and details are guessed right
  // too (no mapping by hand any more: the first long text, the first
  // choice) — the ticket's switch turned off and on again.
  expect((await contact.getByLabel("Their message").locator("option:checked").innerText()) === "Your message", "message guessed");
  const toTicket = page.locator("label.ck-switch-label", { hasText: "Also open a ticket in Support" });
  await toTicket.click();
  await page.waitForFunction(() => document.querySelectorAll(".route-fields").length === 1);
  await toTicket.click();
  const ticket = page.locator(".route-fields").nth(1);
  await ticket.waitFor();
  expect((await ticket.getByLabel("Subject").locator("option:checked").innerText()) === "What is it about?", "subject guessed: a real question, not the form's title");
  expect((await ticket.getByLabel("Details").locator("option:checked").innerText()) === "Your message", "details guessed: the message");
  await page.waitForSelector(".save-state.saved", { timeout: 10000 });
  await page.goto(origin + "/chest/forms/5/settings");
  expect((await page.locator(".route-fields").nth(1).getByLabel("Subject").locator("option:checked").innerText()) === "What is it about?", "the mapping is kept");
  // Published, then answered by a visitor.
  await page.goto(origin + "/chest/forms/5");
  await page.getByRole("button", { name: "Publish" }).click();
  await page.waitForSelector("dialog[open]");
  const contactLink = (await page.locator("dialog[open] code").innerText()).trim();
  await page.keyboard.press("Escape");
  const v = await browser.newPage({ ignoreHTTPSErrors: true });
  await v.goto(contactLink);
  await v.getByLabel("Your name").fill("Nina Roux");
  await v.getByLabel("Your email address").fill("nina.roux@example.com");
  await v.locator("label", { hasText: "A quote" }).first().click();
  await v.getByLabel("Your message").fill("Six oak chairs, please.");
  await v.waitForTimeout(2200);
  await v.getByRole("button", { name: "Send" }).click();
  await v.waitForSelector(".runner-thanks", { timeout: 15000 });
  await v.close();
  const board = await dev();
  expect(board.includes("<code>forms.contact</code>") && board.includes("nina.roux@example.com"), "a contact for Clients");
  expect(board.includes("<code>forms.request</code>") && board.includes("A quote"), "a ticket for Support, its subject the answer");
});

await step("one message, one email: with a copy on, an answer Support took gets no copy from Forms (Support confirms it); the answer says where it went, and Support follows it up", async () => {
  await page.goto(origin + "/chest/forms/5/settings");
  await page.locator("label.ck-switch-label", { hasText: "Email a copy" }).click();
  expect((await page.locator("main").innerText()).includes("Support confirms each request by email"), "Settings says why no copy goes");
  await page.waitForSelector(".save-state.saved", { timeout: 10000 });
  const v = await browser.newPage({ ignoreHTTPSErrors: true });
  await v.goto(origin + "/c2n6yd8u");
  await v.getByLabel("Your name").fill("Marc Petit");
  await v.getByLabel("Your email address").fill("marc.petit@example.com");
  await v.locator("label", { hasText: "A question" }).first().click();
  await v.getByLabel("Your message").fill("Do you deliver to Lyon?");
  await v.waitForTimeout(2200);
  await v.getByRole("button", { name: "Send" }).click();
  await v.waitForSelector(".runner-thanks", { timeout: 15000 });
  await v.close();
  const board = await dev();
  const mail = board.slice(board.indexOf("Mail (proposal)"));
  expect(!mail.includes("→ marc.petit@example.com"), "no copy to the visitor: Support confirms");
  expect(board.includes("<code>forms.request</code>") && board.includes("marc.petit@example.com"), "the ticket event left");
  await page.goto(origin + "/chest/forms/5/answers");
  await page.locator("a", { hasText: "marc.petit@example.com" }).first().click();
  await page.waitForURL(/\/answers\/[a-z0-9]{16}/u);
  const sent = await page.locator(".answer-sent").innerText();
  expect(sent.includes("Clients (a contact)") && sent.includes("Support (a ticket)") && !sent.includes("a copy"), "where it went: " + sent);
  expect(await page.locator(".answer-sent a", { hasText: "Support (a ticket)" }).getAttribute("href") === "https://helpdesk-chest.chest.test/chest", "a link to Support");
  expect((await page.locator("main").innerText()).includes("Support follows this request up"), "no second follow-up here");
});

await step("a new form from the Contact template is linked right by default: Clients on, subject and details mapped, a company question", async () => {
  await page.goto(origin + "/chest/new");
  await page.locator("button.template-card", { hasText: "Let customers write to you" }).click();
  await page.waitForURL(/\/chest\/forms\/\d+$/u);
  const id = page.url().match(/forms\/(\d+)/u)[1];
  expect((await page.locator("main").innerText()).includes("Your company (if any)"), "a company question");
  await page.goto(origin + `/chest/forms/${id}/settings`);
  expect(await page.getByRole("switch", { name: "Also create a contact in Clients" }).isChecked(), "Clients on from the start");
  const contact = page.locator(".route-fields").first();
  expect((await contact.getByLabel("Their company").locator("option:checked").innerText()) === "Your company (if any)", "company mapped");
  expect(!(await page.getByRole("switch", { name: "Also open a ticket in Support" }).isChecked()), "Support stays the author's choice");
  await page.locator("label.ck-switch-label", { hasText: "Also open a ticket in Support" }).click();
  const ticket = page.locator(".route-fields").nth(1);
  await ticket.waitFor();
  expect((await ticket.getByLabel("Subject").locator("option:checked").innerText()) === "What is it about?", "subject: the topic question");
  expect((await ticket.getByLabel("Details").locator("option:checked").innerText()) === "Your message", "details: the message");
  expect((await page.locator("main").innerText()).includes("Support confirms each request by email"), "the copy switch says Support confirms");
  await page.waitForSelector(".save-state.saved", { timeout: 10000 });
});

await step("web addresses: a Slack channel added in Settings gets each new answer; one that fails is stopped, Settings says so, Try again", async () => {
  await page.goto(origin + "/chest/forms/5/settings");
  const box = page.locator("fieldset.hooks");
  await box.getByLabel("Where").selectOption("slack");
  await box.getByLabel("Its address").fill("https://hooks.slack.com/services/T0001/B0001/abcdefghijklmnopqrstuvwx");
  await box.getByLabel("Name").fill("Sales channel");
  await box.getByRole("button", { name: "Add an address" }).click();
  await page.waitForSelector(".ck-toast:has-text('Address added')");
  await page.waitForSelector(".hook strong:has-text('Sales channel')");
  expect(!(await box.innerText()).includes("abcdefghijklmnopqrstuvwx"), "the secret path is never shown");
  // A visitor answers the sample contact form (published in the step
  // before): the channel is told, in the Chest's words, with a link.
  const v = await browser.newPage({ ignoreHTTPSErrors: true });
  await v.goto(origin + "/c2n6yd8u");
  await v.getByLabel("Your name").fill("Paul Lemaire");
  await v.getByLabel("Your email address").fill("paul.lemaire@example.com");
  await v.locator("label", { hasText: "An order" }).first().click();
  await v.getByLabel("Your message").fill("Where is my order 1042?");
  await v.waitForTimeout(2200);
  await v.getByRole("button", { name: "Send" }).click();
  await v.waitForSelector(".runner-thanks", { timeout: 15000 });
  await v.close();
  const board = await dev();
  const journal = board.slice(board.indexOf("Webhooks (proposal)"));
  expect(/<code>form\.answered<\/code> → Sales channel: <b>delivered<\/b>/u.test(journal), "delivered to the channel: " + journal.slice(0, 400));
  expect(journal.includes("New answer to “Contact us”") && journal.includes("Where is my order 1042?"), "the form and the answers in the text");
  await page.goto(origin + "/chest/forms/5/settings");
  expect((await page.locator("fieldset.hooks").innerText()).includes("The last answer arrived."), "Settings says it arrived");
  // Removed: asked first (the Chest forgets the address).
  await page.locator(".hook", { hasText: "Sales channel" }).getByRole("button", { name: "Remove" }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Remove" }).click();
  await page.waitForSelector(".ck-toast:has-text('Address removed.')");
  await page.reload();
  expect(await page.locator(".hook", { hasText: "Sales channel" }).count() === 0, "gone");
});

await step("answers on a phone are cards; the filters wait behind one button; the columns control looks like one", async () => {
  await as(context, origin, "ines");
  await english();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/chest/forms/1/answers");
  const toggle = page.getByRole("button", { name: "Filter", exact: true });
  expect(await toggle.isVisible(), "one Filter button");
  expect(!(await page.locator(".answers-filters .ck-filters, .answers-filter").first().isVisible()), "filters folded");
  await toggle.click();
  expect(await page.locator(".answers-filter").first().isVisible(), "filters shown");
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(!wide, "no sideways scroll");
  const card = page.locator("table.ck-table-stack tbody tr").first();
  // Each line of the card is named by its question (the kit's stacked rows).
  const named = await card.locator("[data-label]").evaluateAll(cells => cells.filter(c => getComputedStyle(c).display !== "none").map(c => c.getAttribute("data-label")));
  expect(named.filter(l => /How would you rate|How likely|What did you like|What should we do better|May we contact|Your email/u.test(l ?? "")).length === 3, "the first three answers on the card: " + named.join(" | "));
  expect(named.some(l => /Where it stands|Follow/u.test(l ?? "")) || named.length >= 5, "its state too: " + named.join(" | "));
  const box = await card.boundingBox();
  expect(box.width <= 390, "a card within the screen");
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto(origin + "/chest/forms/1/answers");
  expect(!(await page.getByRole("button", { name: "Filter", exact: true }).isVisible()), "no Filter button on a wide screen");
  const summary = page.locator(".columns-pick > summary");
  if (await summary.count()) {
    const style = await summary.evaluate(el => getComputedStyle(el).borderTopStyle);
    expect(style !== "none", "Columns shown has a button's edge");
    expect(await summary.locator(".chevron").count() === 1, "and a chevron");
  }
});

await step("the builder's preview says 'Preview' in the member's language; the form keeps its own", async () => {
  await as(context, origin, "ines");
  await context.addCookies([{ name: "dev_locale", value: "fr", url: origin }]);
  await page.goto(origin + "/chest/forms/1");
  await page.waitForSelector(".preview-tag", { state: "attached" });
  const tag = (await page.locator(".preview-tag").textContent()) ?? "";
  expect(tag.startsWith("Aperçu"), "the member's language: " + tag);
  await english();
});

await step("pass 4: a manager lets everyone make forms: a member makes one, owns it, and keeps it once the switch is off", async () => {
  await english();
  await as(context, origin, "hugo");
  await page.goto(origin + "/chest");
  expect((await page.locator(".quiet-note").allInnerTexts()).some(x => x.includes("They can let everyone make forms")), "a member is told whom to ask");
  expect(!(await page.getByRole("switch", { name: "Everyone can make forms" }).count()), "only a manager sees the switch");
  await as(context, origin, "camille");
  await page.goto(origin + "/chest");
  const toggle = page.getByRole("switch", { name: "Everyone can make forms" });
  expect(!(await toggle.isChecked()), "off until a manager turns it on");
  await page.locator("label.ck-switch-label", { hasText: "Everyone can make forms" }).click();
  await page.waitForSelector(".ck-toast:has-text('Everyone can make forms now.')");
  await page.reload();
  expect(await page.getByRole("switch", { name: "Everyone can make forms" }).isChecked(), "kept");
  await as(context, origin, "hugo");
  await page.goto(origin + "/chest/new");
  await page.locator(".template-card", { hasText: "Blank form" }).click();
  await page.waitForURL(/\/chest\/forms\/\d+$/u);
  const hisForm = page.url();
  await page.locator("#form-title").fill("Hugo's team quiz");
  await page.waitForSelector(".save-state.saved", { timeout: 10000 });
  await page.goto(origin + "/chest");
  await page.waitForSelector(".form-card:has-text(\"Hugo's team quiz\")");
  // Off again: no new form, his own stays his.
  await as(context, origin, "camille");
  await page.goto(origin + "/chest");
  await page.locator("label.ck-switch-label", { hasText: "Everyone can make forms" }).click();
  await page.waitForSelector(".ck-toast:has-text('Only managers and creators make new forms now.')");
  await as(context, origin, "hugo");
  await page.goto(origin + "/chest/new");
  expect((await page.locator(".narrow").innerText()).includes("ask a manager"), "no new form");
  await page.goto(hisForm);
  expect(await page.locator("#form-title").inputValue() === "Hugo's team quiz", "his form is still his to edit");
});

await phone.close();
await browser.close();
done(problems);
