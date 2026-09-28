// Polls, as people use it, in a real browser: node lab/chest-dev/flows/polls.mjs [port]
// (the harness runs the tool with --reset: the sample polls are there — 1
// lunch, 2 the Christmas party (closed, date chosen), 3 the anonymous
// pulse, 4 the office plants, 5 Camille's draft).
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
  expect(text.includes("Sofia Rossi demande : Coffee or tea at the offsite?"), "French bell for Inès");
});
const coffeeUrl = page.url();

await step("a member answers in one tap, then changes their mind; they cannot create polls", async () => {
  await who("hugo", "en");
  await page.goto(origin + "/chest");
  expect(!(await page.getByRole("link", { name: "New poll" }).count()), "no New poll for a member");
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
  expect((await page.request.get(origin + "/chest/new")).status() === 404, "no composer for a member");
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
  await page.waitForSelector(".toast:has-text('Poll closed.')");
  await page.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(1200);
  await page.reload();
  expect(await page.getByRole("button", { name: "Close now" }).isVisible(), "reopened by undo");
});

await step("find a date: tap days, add a time, send", async () => {
  await page.goto(origin + "/chest/new?kind=date");
  await page.getByLabel("What is it for?").fill("Team dinner");
  await page.getByRole("button", { name: "Next month" }).click();
  await page.locator(".cal-day", { hasText: /^12$/u }).click();
  await page.locator(".cal-day", { hasText: /^13$/u }).click();
  await page.locator(".chosen-day").first().getByRole("button", { name: "Add a time" }).click();
  await page.getByRole("button", { name: "Send to the team" }).click();
  await page.waitForURL(/\/chest\/polls\/\d+$/u);
  expect((await page.locator(".date-row").count()) === 2, "two dates to answer");
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
  await page.getByRole("button", { name: "Close now" }).click();
  await page.waitForSelector(".toast:has-text('Poll closed.')");
  await page.reload();
  await page.getByRole("button", { name: "Tell everyone" }).click();
  await page.waitForSelector(".final-card");
  await who("lea", "fr");
  await page.goto(dinnerUrl);
  expect((await page.locator(".final-card").innerText()).includes("12:00"), "the date shows");
  const ics = await (await page.request.get(dinnerUrl + "/calendar")).text();
  expect(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.includes("SUMMARY:Team dinner"), "the .ics");
  expect((await dev()).includes("Date choisie : Team dinner"), "the date told in French");
});

await step("an anonymous survey: results wait for five answers, an answer is final", async () => {
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
  expect(await page.locator(".threshold").isVisible(), "hidden under five answers");
});

await step("deleting a poll can be undone", async () => {
  await who("sofia", "en");
  await page.goto(coffeeUrl);
  await page.getByRole("button", { name: "Delete" }).click();
  await page.waitForURL(origin + "/chest");
  await page.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await page.waitForURL(coffeeUrl);
  expect(await page.getByRole("heading", { name: "Coffee or tea at the offsite?" }).isVisible(), "restored");
});

await step("the sample polls read well: a draft continues in the composer, the pulse in French", async () => {
  await who("camille", "en");
  await page.goto(origin + "/chest/polls/5");
  await page.waitForURL(/\/chest\/polls\/5\/edit$/u);
  expect((await page.getByLabel("Your question").inputValue()).includes("Summer offsite"), "the draft");
  await who("lea", "fr");
  await page.goto(origin + "/chest/polls/3");
  expect((await page.locator(".results-card").innerText()).includes("Affichées dans un ordre au hasard"), "shuffled texts");
});

await browser.close();
done(problems);
