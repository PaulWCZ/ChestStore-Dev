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

await step("a closing day before today is refused out loud: neither Save draft nor Send keeps the day it held before", async () => {
  // The kit's DateField (0.2.4): a day before `min` stays as typed, the
  // field says why, and the poll waits — Save draft (a button, not the
  // form's submit) once kept the previous day.
  const dmy = offset => { const d = new Date(Date.now() + offset * 86400000); return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`; };
  await page.goto(origin + "/chest/new?kind=choice");
  await page.getByLabel("Your question").fill("Lunch spot on Friday?");
  await page.getByLabel("Answer 1").fill("Pizza");
  await page.getByLabel("Answer 2").fill("Sushi");
  await page.getByText("On a date").click();
  const before = await page.locator("#closes-day").inputValue();
  expect(before !== "", "a closing day to begin with: " + before);
  await page.locator("#closes-day").fill(dmy(-3));
  let sent = 0;
  const count = r => { if (r.method() === "POST" && r.url().startsWith(origin + "/chest")) sent++; };
  page.on("request", count);
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.locator(".closing .ck-error", { hasText: /or later\./u }).waitFor();
  await page.locator(".actions-bar .error", { hasText: /or later\./u }).waitFor();
  // The focus is state, not a moment: wait for it (a few seconds at most)
  // rather than reading it once the error shows.
  const focused = await page.waitForFunction(() => document.activeElement?.id === "closes-day", null, { timeout: 3000 }).then(() => true, () => false);
  expect(focused, "the day field has the focus");
  await page.getByRole("button", { name: "Send to the team" }).click();
  await page.waitForTimeout(800);
  page.off("request", count);
  expect(sent === 0, "nothing sent: " + sent);
  expect(/\/chest\/new\?kind=choice$/u.test(page.url()), "still writing: " + page.url());
  expect(await page.locator("#closes-day").inputValue() === dmy(-3), "the day stays as typed");
  // A good day: the draft keeps that one.
  await page.locator("#closes-day").fill(dmy(20));
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForURL(/\/chest\/polls\/\d+\/edit$/u);
  await page.locator(".ck-toast", { hasText: "Draft saved." }).waitFor();
  expect(await page.locator(".actions-bar .error").count() === 0, "no error left");
  await page.reload();
  const kept = await page.locator("#closes-day").inputValue();
  const good = new Date(Date.now() + 20 * 86400000);
  const padded = `${String(good.getUTCDate()).padStart(2, "0")}/${String(good.getUTCMonth() + 1).padStart(2, "0")}/${good.getUTCFullYear()}`;
  expect(kept === padded, `the draft closes on the day typed: ${kept} (${padded})`);
});

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
  // The chosen date is in each person's Chest calendar (Proposal (studio)), as News does.
  const dinnerId = dinnerUrl.split("/").pop();
  expect((await dev()).includes(`poll:${dinnerId}`), "the calendar event, in the harness");
  expect(await page.getByRole("link", { name: "Dans votre agenda" }).isVisible(), "Léa's link to her Chest calendar");
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

let pulseUrl = "";
await step("the team pulse: one tile, sent as it is, every week; the rounds before show over time", async () => {
  await who("camille", "fr");
  await page.goto(origin + "/chest");
  await page.getByRole("link", { name: /La météo de l’équipe/u }).click();
  expect(await page.getByLabel("Nom du questionnaire").inputValue() === "Météo de l’équipe", "ready to send");
  await page.getByRole("button", { name: "Envoyer à l’équipe" }).click();
  await page.waitForURL(/\/chest\/polls\/\d+$/u);
  expect((await page.locator(".poll-head").innerText()).includes("Édition 1 · Chaque semaine"), "round 1, every week");
  // The sample pulse runs under this name: the new one is told apart.
  expect(await page.getByRole("heading", { name: "Météo de l’équipe (2)" }).isVisible(), "a second pulse is named “(2)”");
  pulseUrl = page.url();
  await who("hugo", "en");
  await page.goto(origin + "/chest/polls/3");
  expect((await page.locator(".trend-card").innerText()).includes("Over time"), "the trend of the sample pulse");
  await page.locator(".scale-buttons.eleven label").nth(9).click();
  await page.locator("form.answer-card button[type=submit]").click();
  await page.waitForSelector(".thanks");
});

await step("a pulse or eNPS is for organisers unless an admin opens it; the sample pulse is in its asker's language", async () => {
  await who("hugo", "en");
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto(origin + "/chest");
  expect(!(await page.getByRole("link", { name: /A team pulse/u }).count()), "no pulse tile for a member");
  await page.goto(origin + "/chest/new?kind=survey&preset=pulse");
  expect(await page.getByLabel("Name of the survey").inputValue() === "", "the pulse is not prefilled for a member");
  expect(!(await page.locator("option[value=enps]").count()), "no eNPS question for a member");
  expect(!(await page.locator("fieldset.repeat").count()), "no repeat for a member");
  await who("camille", "en");
  await page.goto(origin + "/chest");
  await page.getByText("Everyone can start a team pulse or eNPS").click();
  await page.waitForSelector(".ck-toast:has-text('Saved.')");
  await who("hugo", "en");
  await page.goto(origin + "/chest");
  expect(await page.getByRole("link", { name: /A team pulse/u }).count() === 1, "opened by the admin: the tile shows");
  await who("camille", "en");
  await page.goto(origin + "/chest");
  await page.getByText("Everyone can start a team pulse or eNPS").click();
  await page.waitForSelector(".ck-toast:has-text('Saved.')");
  await who("lea", "fr");
  await page.goto(origin + "/chest/polls/3");
  expect(await page.getByRole("heading", { name: "Météo de l’équipe" }).isVisible(), "Camille's pulse, in French");
});

await step("the organiser's list: what she asked, its state and who answered — not mixed into To answer", async () => {
  await who("sofia", "en");
  await page.goto(origin + "/chest");
  const list = await page.locator(".asked-list").innerText();
  expect(list.includes("Where shall we have lunch on Friday?") && list.includes("Open") && /\d+ of \d+ answered/u.test(list), "asked by her: " + list.slice(0, 120));
  const toAnswer = await page.locator("section[aria-labelledby=to-answer]").innerText();
  expect(!toAnswer.includes("Where shall we have lunch on Friday?"), "her own poll is not in To answer");
});

await step("a sign-up sheet says places taken, and a phone says there are more dates to the side", async () => {
  await who("lea", "fr");
  await page.goto(origin + "/chest/polls/10");
  const foot = await page.locator(".grid-table tfoot").innerText();
  expect(foot.includes("Places prises") && foot.includes("2/2") && foot.includes("Complet") && !foot.includes("Disponibles"), "honest footer: " + foot);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  expect(await page.locator(".grid-more").isVisible(), "the swipe hint on a phone");
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.reload();
  expect(!(await page.locator(".grid-more").isVisible()), "no hint where every date shows");
});

await step("a closed anonymous round per team: groups too small or deducible stay hidden, and it says so", async () => {
  await who("hugo", "en");
  await page.goto(origin + "/chest/polls/9");
  const teams = await page.locator(".teams-card").innerText();
  expect(teams.includes("By team") && teams.includes("3 groups are not shown"), "the team card: " + teams);
  expect(!/Sales|Tech|Office/u.test(teams), "no group named with fewer than 5 answers");
});

// A browser of its own for someone (no cookie shared with the flow's page:
// a guest, or an author whose keys live in their browser only).
async function fresh(member = null, locale = "en", viewport = { width: 1280, height: 860 }) {
  const c = await browser.newContext({ viewport, locale: "en-GB" });
  if (member) await c.addCookies([{ name: "dev_member", value: "mbr_" + member + "a".repeat(26 - member.length), url: origin }, { name: "dev_locale", value: locale, url: origin }]);
  const p = await c.newPage();
  p.on("pageerror", e => problems.push("page: " + e.message));
  p.on("console", m => { if (m.type() === "error" && !/Failed to load resource/u.test(m.text())) problems.push("console: " + m.text()); });
  return { c, p };
}

await step("guests outside the Chest: the organiser turns the link off and on, a guest answers by name, the team sees “Guest”", async () => {
  await who("sofia", "en");
  await page.goto(origin + "/chest/polls/11");
  const old = await page.locator("#guest-url").inputValue();
  expect(old.endsWith("/p/maisonleroykickoffxyzabcde"), "the sample link: " + old);
  await page.getByText("Anyone with the link can answer").click();
  await page.waitForSelector(".ck-toast:has-text('The link no longer works.')");
  expect((await page.request.get(old)).status() === 404, "the old link opens nothing");
  await page.getByText("Anyone with the link can answer").click();
  await page.waitForSelector(".ck-toast:has-text('Guests can answer with the link.')");
  const link = await page.locator("#guest-url").inputValue();
  expect(link !== old && /\/p\/[a-z2-7]{26}$/u.test(link), "a new link: " + link);
  // The guest: no account, no cookie of the Chest.
  const guest = await fresh(null, "en", { width: 390, height: 844 });
  await guest.p.goto(link);
  const text = await guest.p.locator("main").innerText();
  expect(text.includes("Kick-off with Maison Leroy") && text.includes("Asked by Sofia Rossi"), "the poll's words and its organiser");
  // (The organiser's own words may name colleagues; the answers never show.)
  expect(!/Claire|Marc/u.test(text) && !(await guest.p.locator(".grid-table, .results-card, .participation").count()), "no other answer, no results on the public page");
  await guest.p.getByLabel("Your name").fill("Jean Martin");
  await guest.p.getByLabel("Your email (optional)").fill("jean@client.example");
  await guest.p.locator(".date-row").nth(0).locator("label.yes").click();
  await guest.p.locator(".date-row").nth(1).locator("label.maybe").click();
  await guest.p.getByRole("button", { name: "Send my answer" }).click();
  await guest.p.waitForSelector(".thanks:has-text('Thanks, Jean Martin!')");
  expect((await guest.p.locator(".thanks").innerText()).includes("jean@client.example"), "told the date will come by email");
  const width = await guest.p.evaluate(() => document.documentElement.scrollWidth);
  expect(width <= 390, "no horizontal scroll at 390 px: " + width);
  // Back later from the same browser: their answer, to change.
  await guest.p.goto(link);
  await guest.p.getByRole("button", { name: "Change my answer" }).click();
  await guest.p.locator(".date-row").nth(2).locator("label.yes").click();
  await guest.p.getByRole("button", { name: "Update my answer" }).click();
  await guest.p.waitForSelector(".thanks:has-text('Your answer is updated.')");
  await guest.c.close();
  // A robot filling the field people never see is refused, and nothing is kept.
  const robot = await fresh();
  await robot.p.goto(link);
  await robot.p.getByLabel("Your name").fill("Bot");
  await robot.p.locator(".date-row").nth(0).locator("label.yes").click();
  await robot.p.evaluate(() => { document.getElementById("website").value = "http://spam.example"; });
  await robot.p.getByRole("button", { name: "Send my answer" }).click();
  await robot.p.locator(".guest-form .error").waitFor();
  await robot.c.close();
  // The team's side: the guest in the grid, marked; counted apart.
  await page.reload();
  const grid = await page.locator(".grid-table").innerText();
  expect(grid.includes("Jean Martin") && grid.includes("Guest") && !grid.includes("Bot"), "the guest in the grid, marked: " + grid.slice(0, 200));
  expect((await page.locator(".participation").innerText()).includes("and 3 guests"), "counted apart from the members");
  expect((await page.locator(".guests-card").innerText()).includes("jean@client.example"), "the organiser sees the email the guest gave");
});

await step("a guest's answer removed after a confirmation; a member sees no guests card", async () => {
  await who("sofia", "en");
  await page.goto(origin + "/chest/polls/11");
  await page.getByRole("button", { name: "Remove Marc Petit’s answer" }).click();
  await page.locator(".ck-confirm").getByRole("button", { name: "Remove" }).click();
  await page.waitForSelector(".ck-toast:has-text('Answer removed.')");
  await page.reload();
  expect(!(await page.locator(".grid-table").innerText()).includes("Marc Petit"), "gone from the grid");
  await who("hugo", "en");
  await page.goto(origin + "/chest/polls/11");
  expect(!(await page.locator(".guests-card").count()), "no guests card for a member");
  expect((await page.locator(".grid-table").innerText()).includes("Claire Leroy"), "but the guests' answers, marked, in the results");
});

await step("the date chosen for a poll with guests: in the team's Chest calendars (putMany, answered per part), and by email to the guest who gave an address (its key names them)", async () => {
  await who("sofia", "en");
  await page.goto(origin + "/chest/polls/11");
  const link = await page.locator("#guest-url").inputValue();
  await page.getByRole("button", { name: "Close now" }).click();
  await page.waitForSelector(".ck-toast:has-text('Poll closed.')");
  await page.reload();
  await page.getByRole("button", { name: "Tell everyone" }).click();
  await page.waitForSelector(".final-card");
  const board = await dev();
  expect(board.includes("poll:11"), "the calendar event, in the harness");
  expect(board.split("<li>").some(li => li.includes("The date for “Kick-off with Maison Leroy”") && li.includes("jean@client.example")), "the guest's email, to their address");
  // Told again (the page reloaded, the choice the same): no second email.
  await page.reload();
  const toJean = (await dev()).split("<li>").filter(li => li.includes("The date for “Kick-off with Maison Leroy”") && li.includes("jean@client.example")).length;
  expect(toJean === 1, "one email for one choice: " + toJean);
  // The guest's page shows the date and its calendar file.
  const guest = await fresh(null, "en", { width: 390, height: 844 });
  await guest.p.goto(link);
  expect(await guest.p.locator(".final-card").isVisible(), "the chosen date on the guest's page");
  await guest.c.close();
  // Hugo, asked, has it in his Chest calendar: the Chest took the date.
  await who("hugo", "en");
  await page.goto(origin + "/chest/polls/11");
  expect(await page.getByRole("link", { name: "In your calendar" }).isVisible(), "Hugo's link to his Chest calendar");
});

await step("anonymous two-way feedback: the organiser replies under a free text; only the author's browser reads it and answers back", async () => {
  expect(pulseUrl !== "", "the new pulse of the step above");
  const authors = {};
  for (const [member, words] of [["hugo", "Too many meetings on Mondays."], ["ines", "Tout va bien."], ["lea", "Plus de formation."], ["tom", "The coffee machine is broken."], ["sofia", "Nice week."]]) {
    const a = await fresh(member, "en");
    await a.p.goto(pulseUrl);
    await a.p.locator(".scale-buttons:not(.eleven) label").nth(3).click();
    await a.p.locator("textarea").fill(words);
    await a.p.locator("form.answer-card button[type=submit]").click();
    await a.p.waitForSelector(".thanks");
    authors[member] = a;
  }
  await who("camille", "fr");
  await page.goto(pulseUrl);
  await page.getByRole("button", { name: "Terminer maintenant" }).click();
  await page.locator(".ck-confirm").getByRole("button", { name: "Clôturer définitivement" }).click();
  await page.waitForSelector(".ck-toast");
  await page.reload();
  const item = page.locator(".quotes li", { hasText: "Too many meetings on Mondays." });
  await item.getByRole("button", { name: "Répondre" }).click();
  await item.locator("textarea").fill("Merci — lesquelles pourraient disparaître ?");
  await item.getByRole("button", { name: "Envoyer" }).click();
  await page.waitForSelector(".ck-toast:has-text('Réponse envoyée.')");
  expect((await dev()).includes("Camille Martin replied to an anonymous comment"), "everyone asked hears a reply was written");
  // Hugo's browser holds the key: the reply is his to read.
  const hugo = authors.hugo.p;
  await hugo.goto(pulseUrl);
  const mine = hugo.locator(".my-replies");
  await mine.waitFor();
  expect((await mine.innerText()).includes("lesquelles pourraient disparaître"), "Hugo reads the reply");
  await mine.getByRole("button", { name: "Answer, still anonymous" }).click();
  await mine.locator("textarea").fill("The Monday status meeting.");
  await mine.getByRole("button", { name: "Send" }).click();
  await hugo.waitForSelector(".ck-toast:has-text('Reply sent.')");
  // Inès's browser holds no key to it.
  await authors.ines.p.goto(pulseUrl);
  await authors.ines.p.waitForTimeout(800);
  expect(!(await authors.ines.p.locator(".my-replies").count()), "nobody else reads it");
  for (const a of Object.values(authors)) await a.c.close();
  await page.reload();
  const thread = await page.locator(".quotes li", { hasText: "Too many meetings on Mondays." }).innerText();
  expect(thread.includes("L’auteur (anonyme)") && thread.includes("The Monday status meeting."), "the author's answer, unnamed");
});

await step("on a phone, a toast sits above the composer's bottom bar (data-ck-bottom-bar), never over its buttons", async () => {
  const phone = await fresh("sofia", "en", { width: 390, height: 844 });
  await phone.p.goto(origin + "/chest/new?kind=choice");
  await phone.p.getByLabel("Your question").fill("Team lunch on Thursday?");
  await phone.p.getByLabel("Answer 1").fill("Yes");
  await phone.p.getByLabel("Answer 2").fill("No");
  await phone.p.getByRole("button", { name: "Save draft" }).click();
  const toast = phone.p.locator(".ck-toast", { hasText: "Draft saved." });
  await toast.waitFor();
  await phone.p.waitForURL(/\/chest\/polls\/\d+\/edit$/u);
  await phone.p.waitForTimeout(400);
  const bar = await phone.p.locator("[data-ck-bottom-bar]").boundingBox();
  const box = await toast.boundingBox();
  expect(bar && box && Math.round(bar.y + bar.height) >= 843, "the bar touches the screen's bottom: " + JSON.stringify(bar));
  expect(box.y + box.height <= bar.y + 1, `the toast (${Math.round(box.y + box.height)}) ends above the bar (${Math.round(bar.y)})`);
  await phone.c.close();
});

await browser.close();
done(problems);
