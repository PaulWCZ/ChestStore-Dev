// Polls, as people use it, in a real browser: node lab/chest-dev/flows/polls.mjs [port]
// (the harness runs the tool with --reset: the sample polls are there — 1
// lunch, 2 the Christmas party (closed, date chosen), 3 the weekly pulse's
// open round (6-9 its closed rounds), 4 the office plants, 5 Camille's
// draft, 10 the open-day sign-up sheet).
import { as, done, expect, open, step } from "./lib.mjs";

const port = Number(process.argv[2] ?? 5500);
const { browser, context, page, origin, problems } = await open(port, "sofia", { locale: "en" });
const speak = locale => context.addCookies([{ name: "dev_locale", value: locale, url: origin }]);
const dev = async () => (await page.request.get(origin + "/_dev")).text();
const who = async (member, locale) => {
  await as(context, origin, member);
  await speak(locale);
};

await step("an organiser asks a question from the home page; the team hears of it in its language", async () => {
  await page.goto(origin + "/chest");
  await page.getByRole("link", { name: /A question/u }).click();
  await page.waitForURL(/\/chest\/new\?kind=choice/u);
  await page.getByLabel("Your question").fill("Coffee or tea at the offsite?");
  await page.getByLabel("Answer 1").fill("Coffee");
  await page.getByLabel("Answer 2").fill("Tea");
  await page.getByRole("button", { name: "Add an answer" }).click();
  await page.getByLabel("Answer 3").fill("Hot chocolate");
  await page.getByText("Allow “Other”, in their own words").click();
  await page.getByRole("button", { name: "Send to the team" }).click();
  await page.waitForURL(/\/chest\/polls\/\d+$/u);
  expect(await page.getByRole("heading", { name: "Coffee or tea at the offsite?" }).isVisible(), "the poll page");
  const text = await dev();
  expect(text.includes("Sofia Rossi asks: Coffee or tea at the offsite?"), "English bell for Hugo");
  expect(/Sofia Rossi demande[ \u00a0\u202f]: Coffee or tea at the offsite\?/u.test(text), "French bell for Inès");
});
const coffeeUrl = page.url();

await step("a member answers in one tap, then changes their mind", async () => {
  await who("hugo", "en");
  await page.goto(origin + "/chest");
  await page.locator(".poll-card.ask", { hasText: "Coffee or tea" }).getByRole("link").first().click();
  await page.waitForURL(coffeeUrl);
  await page.locator(".pick-option", { hasText: "Coffee" }).click();
  await page.getByRole("button", { name: "Send my answer" }).click();
  await page.waitForSelector(".thanks .said:has-text('Coffee')");
  await page.getByRole("button", { name: "Change my answer" }).click();
  await page.locator(".pick-option", { hasText: "Tea" }).first().click();
  await page.getByRole("button", { name: "Update my answer" }).click();
  await page.waitForSelector(".thanks");
  await page.reload();
  expect((await page.locator(".thanks").innerText()).includes("Tea"), "the change kept");
  const results = await page.locator(".results-card").innerText();
  expect(/Tea[\s\S]*100%/u.test(results) && results.includes("You"), "live results with names");
});

await step("in French, on a phone, a member writes their own answer", async () => {
  await who("ines", "fr");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(coffeeUrl);
  await page.getByPlaceholder("Avec vos mots").fill("Un jus d’orange");
  await page.getByRole("button", { name: "Envoyer ma réponse" }).click();
  await page.waitForSelector(".thanks");
  expect((await page.locator(".thanks").innerText()).includes("Merci"), "thanks in French");
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width <= 390, "no horizontal scroll at 390 px: " + width);
  await page.setViewportSize({ width: 1280, height: 860 });
});

await step("the organiser sees who answered, downloads the answers, closes and undoes it", async () => {
  await who("sofia", "en");
  await page.goto(coffeeUrl);
  expect((await page.locator(".participation").innerText()).includes("of 7 answered"), "participation");
  const csv = await (await page.request.get(coffeeUrl + "/export")).text();
  expect(csv.includes("Hugo Bernard,Tea") && csv.includes("Other: Un jus d’orange"), "the CSV");
  await page.getByRole("button", { name: "Close now" }).click();
  await page.waitForSelector(".ck-toast:has-text('Poll closed.')");
  await page.locator(".ck-toast-undo").click();
  await page.waitForSelector(".ck-toast:has-text('Undone.')");
  await page.reload();
  expect(await page.getByRole("button", { name: "Close now" }).isVisible(), "reopened by undo");
});

await step("find a date: tap days, add a time, send", async () => {
  await page.goto(origin + "/chest/new?kind=date");
  await page.getByLabel("What is it for?").fill("Team dinner");
  await page.getByRole("button", { name: "Next month" }).click();
  await page.locator(".cal .ck-day:not(.ck-day-out)", { hasText: /^12$/u }).click();
  await page.locator(".cal .ck-day:not(.ck-day-out)", { hasText: /^13$/u }).click();
  await page.locator(".chosen-day").first().getByRole("button", { name: "Add a time" }).click();
  // The start moves: the end follows, the slot keeps its two hours (12:00–14:00 → 18:00–20:00).
  await page.getByLabel("From", { exact: true }).first().selectOption({ label: "18:00" });
  expect(await page.getByLabel("To", { exact: true }).first().evaluate(e => e.selectedOptions[0].textContent) === "20:00", "the end follows the start");
  await page.getByLabel("From", { exact: true }).first().selectOption({ label: "12:00" });
  // It closes on a date typed in words of the page's language (the kit's DateField, no browser date field).
  expect(!(await page.locator("input[type=date]").count()), "no browser date field");
  await page.getByText("On a date").click();
  const soon = new Date(Date.now() + 40 * 86400000);
  await page.locator("#closes-day").fill(`${soon.getUTCDate()}/${soon.getUTCMonth() + 1}/${soon.getUTCFullYear()}`);
  await page.locator("#closes-day").press("Tab");
  await page.getByRole("button", { name: "Send to the team" }).click();
  await page.waitForURL(/\/chest\/polls\/\d+$/u);
  expect((await page.locator(".date-row").count()) === 2, "two dates to answer");
  expect((await page.locator(".poll-head").innerText()).includes("Closes "), "the closing date said");
});
const dinnerUrl = page.url();

await step("a member says yes and if need be; the organiser closes, picks the date, everyone is told", async () => {
  await who("hugo", "en");
  await page.goto(dinnerUrl);
  await page.locator(".date-row").nth(0).locator("label.yes").click();
  await page.locator(".date-row").nth(1).locator("label.maybe").click();
  await page.getByRole("button", { name: "Send my answer" }).click();
  await page.waitForSelector(".thanks");
  await who("sofia", "en");
  await page.goto(dinnerUrl);
  expect(await page.locator(".grid-table").isVisible(), "the grid of people and dates");
  expect((await page.locator(".best-line").innerText()).includes("Best date"), "the best date in words");
  await page.getByRole("button", { name: "Close now" }).click();
  await page.waitForSelector(".ck-toast:has-text('Poll closed.')");
  await page.reload();
  await page.getByRole("button", { name: "Tell everyone" }).click();
  await page.waitForSelector(".final-card");
  await who("lea", "fr");
  await page.goto(dinnerUrl);
  expect((await page.locator(".final-card").innerText()).includes("12:00"), "the date shows");
  const ics = await (await page.request.get(dinnerUrl + "/calendar")).text();
  expect(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.includes("SUMMARY:Team dinner"), "the .ics");
  expect(/Date choisie[ \u00a0\u202f]: Team dinner/u.test(await dev()), "the date told in French");
});

await step("an anonymous survey: results wait for the close, an answer is final", async () => {
  await who("camille", "fr");
  await page.goto(origin + "/chest/new?kind=survey");
  await page.getByLabel("Nom du questionnaire").fill("Notre semaine");
  await page.getByLabel("Question 1").fill("Comment était la semaine ?");
  await page.getByText("Anonyme", { exact: true }).click();
  await page.getByRole("button", { name: "Envoyer à l’équipe" }).click();
  await page.waitForURL(/\/chest\/polls\/\d+$/u);
  const surveyUrl = page.url();
  await who("hugo", "en");
  await page.goto(surveyUrl);
  expect((await page.locator(".note.anon").first().innerText()).includes("Anonymous"), "said anonymous");
  await page.locator(".scale-buttons label").nth(3).click();
  await page.getByRole("button", { name: "Send my answer" }).click();
  await page.waitForSelector(".thanks");
  expect(!(await page.getByRole("button", { name: "Change my answer" }).count()), "no change for an anonymous answer");
  expect((await page.locator(".results-card").innerText()).includes("results show to everyone once the poll closes"), "hidden while open");
});

await step("deleting a poll can be undone", async () => {
  await who("sofia", "en");
  await page.goto(coffeeUrl);
  await page.getByRole("button", { name: "Delete" }).click();
  await page.waitForURL(origin + "/chest");
  await page.locator(".ck-toast-undo").click();
  await page.waitForURL(coffeeUrl);
  expect(await page.getByRole("heading", { name: "Coffee or tea at the offsite?" }).isVisible(), "restored");
});

await step("the sample polls read well: a draft continues in the composer, a closed pulse round in French", async () => {
  await who("camille", "en");
  await page.goto(origin + "/chest/polls/5");
  await page.waitForURL(/\/chest\/polls\/5\/edit$/u);
  expect((await page.getByLabel("Your question").inputValue()).includes("Summer offsite"), "the draft");
  await who("lea", "fr");
  await page.goto(origin + "/chest/polls/9");
  expect((await page.locator(".results-card").innerText()).includes("Affichées dans un ordre au hasard"), "shuffled texts");
});

await step("a plain member asks the team too, to people picked by name; an admin can keep that to organisers", async () => {
  await who("hugo", "en");
  await page.goto(origin + "/chest");
  await page.getByRole("link", { name: /A question/u }).click();
  await page.getByLabel("Your question").fill("Pizza or sushi tonight?");
  await page.getByLabel("Answer 1").fill("Pizza");
  await page.getByLabel("Answer 2").fill("Sushi");
  await page.getByText("Chosen groups or people").click();
  await page.getByPlaceholder("Add someone by name").fill("Lé");
  await page.getByRole("option", { name: /Léa Dubois/u }).click();
  expect(await page.locator(".ck-chip", { hasText: "Léa Dubois" }).isVisible(), "Léa picked");
  await page.getByRole("button", { name: "Send to the team" }).click();
  await page.waitForURL(/\/chest\/polls\/\d+$/u);
  const pizzaUrl = page.url();
  expect(/Hugo Bernard demande[ \u00a0\u202f]: Pizza or sushi tonight\?/u.test(await dev()), "Léa told");
  await who("tom", "en");
  expect((await page.request.get(pizzaUrl)).status() === 404, "not put to Tom: not even seen");
  await who("camille", "en");
  await page.goto(origin + "/chest");
  await page.getByText("Everyone can start a poll").click();
  await page.waitForSelector(".ck-toast:has-text('Saved.')");
  await who("hugo", "en");
  await page.goto(origin + "/chest");
  expect(!(await page.getByRole("link", { name: "New poll" }).count()), "restricted: no New poll for a member");
  expect((await page.request.get(origin + "/chest/new")).status() === 404, "restricted: no composer");
  await who("camille", "en");
  await page.goto(origin + "/chest");
  await page.getByText("Everyone can start a poll").click();
  await page.waitForSelector(".ck-toast:has-text('Saved.')");
});

await step("on a phone, the date grid scrolls inside its frame: the page stays 390 px", async () => {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "en-GB" });
  await phone.addCookies([{ name: "dev_member", value: "mbr_sofiaaaaaaaaaaaaaaaaaaaaaa", url: origin }, { name: "dev_locale", value: "en", url: origin }]);
  const p = await phone.newPage();
  for (const path of ["/chest/polls/2", dinnerUrl.replace(origin, ""), "/chest/polls/10", "/chest/polls/3", "/chest/polls/9", "/chest", "/chest/new?kind=date"]) {
    await p.goto(origin + path);
    const [scroll, inner] = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(scroll <= 390 && inner <= 390, `${path}: ${scroll}/${inner} px wide`);
  }
  await p.goto(origin + "/chest/polls/2");
  expect(await p.locator(".grid-table tbody th").first().evaluate(e => getComputedStyle(e).position === "sticky"), "the names stay while the dates scroll");
  await phone.close();
});

await step("an anonymous survey shows nothing while open — not to its organiser, not to an admin — and closes for good", async () => {
  await who("sofia", "en");
  await page.goto(origin + "/chest/new?kind=survey");
  await page.getByLabel("Name of the survey").fill("Is the workload fair?");
  await page.getByLabel("Question 1").fill("This month, your workload?");
  await page.getByText("Anonymous", { exact: true }).click();
  expect(!(await page.getByText("Show them as answers come in").count()), "no live results for an anonymous poll");
  await page.getByRole("button", { name: "Send to the team" }).click();
  await page.waitForURL(/\/chest\/polls\/\d+$/u);
  const url = page.url();
  for (const [member, locale] of [["hugo", "en"], ["ines", "fr"], ["lea", "fr"], ["tom", "en"], ["nora", "fr"], ["camille", "fr"]]) {
    await who(member, locale);
    await page.goto(url);
    await page.locator(".scale-buttons label").nth(member === "camille" ? 1 : 3).click();
    await page.locator("form.answer-card button[type=submit]").click();
    await page.waitForSelector(".thanks");
  }
  for (const [member, locale] of [["sofia", "en"], ["camille", "en"], ["hugo", "en"]]) {
    await who(member, locale);
    await page.goto(url);
    const text = await page.locator(".results-card").innerText();
    expect(text.includes("results show to everyone once the poll closes") && !text.includes("/ 5"), member + " sees no result while open");
    expect((await page.request.get(url + "/export")).status() === 403, member + ": no download while open");
  }
  await who("sofia", "en");
  await page.goto(url);
  await page.getByRole("button", { name: "Close now" }).click();
  // Irreversible: the kit's Confirm asks first, and Cancel keeps it open.
  await page.getByRole("alertdialog").getByRole("button", { name: "Keep it open" }).click();
  expect(await page.getByRole("button", { name: "Close now" }).isVisible(), "still open after Keep it open");
  await page.getByRole("button", { name: "Close now" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Close for good" }).click();
  await page.waitForSelector(".ck-toast:has-text('Poll closed.')");
  expect(!(await page.locator(".ck-toast-undo").count()), "no Undo for an anonymous poll closed for good");
  await page.reload();
  expect((await page.locator(".results-card").innerText()).includes("/ 5"), "results once closed");
  expect(!(await page.getByRole("button", { name: "Reopen" }).count()), "never reopened");
});

await step("comments on a date poll; the organiser hears of them", async () => {
  await who("hugo", "en");
  await page.goto(dinnerUrl);
  await page.getByLabel("Your comment").fill("I can do the 12th, but only after 8 pm");
  await page.getByRole("button", { name: "Post" }).click();
  await page.waitForSelector(".comments li:has-text('only after 8 pm')");
  expect((await dev()).includes("Hugo Bernard commented: Team dinner"), "Sofia's bell");
  await page.getByRole("button", { name: "Delete this comment" }).click();
  await page.locator(".ck-toast-undo").click();
  await page.waitForSelector(".ck-toast:has-text('Undone.')");
  await page.reload();
  expect(await page.locator(".comments li:has-text('only after 8 pm')").isVisible(), "undone");
});

await step("a sign-up sheet: a full slot cannot be taken, a free one can", async () => {
  await who("lea", "fr");
  await page.goto(origin + "/chest/polls/10");
  const full = page.locator(".date-row").nth(0);
  expect((await full.innerText()).includes("Complet") && await full.locator("label.yes input").isDisabled(), "10:00 is full");
  expect(!(await page.locator(".date-row label.maybe").count()), "no “if need be” on a sign-up sheet");
  await page.locator(".date-row").nth(3).locator("label.yes").click();
  await page.getByRole("button", { name: "Envoyer ma réponse" }).click();
  await page.waitForSelector(".thanks");
});

await step("the organiser reminds those who have not answered, once per 12 hours", async () => {
  await who("sofia", "en");
  await page.goto(origin + "/chest/polls/4");
  await page.getByRole("button", { name: "Remind those who haven’t answered" }).click();
  await page.waitForSelector(".ck-toast:has-text('Reminder sent')");
  expect(!(await page.locator(".ck-toast-undo").count()), "a reminder that left offers no Undo");
  const told = await dev();
  expect(told.includes("Reminder: Which plants for the office?"), "the reminder in the bell");
  expect(told.includes("→ tom@example.test"), "and by email to Tom, who has not answered");
  await page.getByRole("button", { name: "Remind those who haven’t answered" }).click();
  await page.waitForSelector(".ck-toast:has-text('less than 12 hours')");
});

await step("the team pulse: one tile, sent as it is, every week; the rounds before show over time", async () => {
  await who("camille", "fr");
  await page.goto(origin + "/chest");
  await page.getByRole("link", { name: /La météo de l’équipe/u }).click();
  expect(await page.getByLabel("Nom du questionnaire").inputValue() === "Météo de l’équipe", "ready to send");
  await page.getByRole("button", { name: "Envoyer à l’équipe" }).click();
  await page.waitForURL(/\/chest\/polls\/\d+$/u);
  expect((await page.locator(".poll-head").innerText()).includes("Édition 1 · Chaque semaine"), "round 1, every week");
  await who("hugo", "en");
  await page.goto(origin + "/chest/polls/3");
  expect((await page.locator(".trend-card").innerText()).includes("Over time"), "the trend of the sample pulse");
  await page.locator(".scale-buttons.eleven label").nth(9).click();
  await page.locator("form.answer-card button[type=submit]").click();
  await page.waitForSelector(".thanks");
});

await browser.close();
done(problems);
