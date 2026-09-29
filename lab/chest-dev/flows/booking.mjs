// Booking, as visitors and hosts use it, in a real browser:
//   node lab/chest-dev/flows/booking.mjs [port]   (harness with --reset)
import { as, done, expect, open, step } from "./lib.mjs";

const port = Number(process.argv[2] ?? 5100);
const { browser, context, page, origin, problems } = await open(port, "ines", { allow404: /\/(nobody-here|chest\/bookings\/9999)$/u });
let guestPage = "";
// The team's pages speak each member's language (Inès and Camille: French
// in the cast): these steps read them in English.
const english = () => context.addCookies([{ name: "dev_locale", value: "en", url: origin }]);

async function pickFirstTime() {
  await page.waitForSelector(".time-button");
  const time = (await page.locator(".time-button").first().innerText()).trim();
  await page.locator(".time-button").first().click();
  return time;
}

await step("a visitor finds Inès on the company's page and opens a kind of meeting", async () => {
  await context.clearCookies();
  await page.goto(origin + "/");
  expect((await page.locator("h1").innerText()).includes("Atelier Martin"), "company");
  await page.locator(".host-card", { hasText: "Inès Moreau" }).click();
  await page.waitForURL(origin + "/ines-moreau");
  expect((await page.locator(".offers").innerText()).includes("Project call"), "types listed");
  await page.locator(".offer", { hasText: "Project call" }).click();
  await page.waitForURL(origin + "/ines-moreau/project-call");
});

await step("they pick a day and a time, fill three fields and the host's questions, and are booked (with an email)", async () => {
  await page.waitForSelector(".calendar button.open");
  const time = await pickFirstTime();
  await page.getByLabel("Your name").fill("Lucie Garnier");
  await page.getByLabel("Your email address").fill("lucie@example.com");
  // Inès's own questions: one choice (required), a short text (optional), yes or no (optional).
  await page.locator("fieldset", { hasText: "What is it for?" }).locator(".choice", { hasText: "A shop or an office" }).click();
  await page.getByLabel("Your budget, roughly (optional)").fill("About 12 000 €");
  await page.getByLabel("Anything to prepare? (optional)").fill("A kitchen island in oak.");
  // Sent at once, as a browser that fills the fields itself would: not
  // refused (the server waits the seconds left).
  await page.getByRole("button", { name: "Confirm the booking" }).click();
  await page.waitForURL(/\/b\/[A-Za-z0-9_-]{32}\?new=1/u);
  guestPage = page.url().split("?")[0];
  const text = await page.locator("main").innerText();
  expect(text.includes("You are booked"), "booked");
  expect(text.includes("A confirmation is on its way to lucie@example.com"), "mailed");
  expect(text.includes(time), "the time chosen");
  const dev = await (await page.request.get(origin + "/_dev")).text();
  expect(dev.includes("Booked: Project call with Inès Moreau"), "confirmation email in the outbox");
  expect(dev.includes("What is it for?: A shop or an office"), "the answers in the email and the bell");
  // A video room of its own, and the booking in Inès's Chest calendar.
  expect(/https:\/\/meet\.jit\.si\/atelier-martin-[a-z0-9x]{12}/u.test(text), "a room of its own");
  expect(/<code>booking:\d+<\/code>/u.test(dev) && dev.includes("Lucie Garnier"), "in the host's Chest calendar");
});

await step("the calendar file downloads", async () => {
  const response = await page.request.get(guestPage + "/ics");
  expect(response.status() === 200, "ics status");
  const body = await response.text();
  expect(body.startsWith("BEGIN:VCALENDAR") && body.includes("SUMMARY:Project call — Inès Moreau"), "ics body");
});

await step("the guest moves their booking to another time", async () => {
  await page.goto(guestPage);
  await page.getByRole("link", { name: "Change the time" }).click();
  await page.waitForURL(/\?move=1/u);
  await page.waitForSelector(".calendar button.open");
  const days = page.locator(".calendar button.open");
  await days.nth((await days.count()) - 1).click();
  await pickFirstTime();
  await page.getByRole("button", { name: "Change the time" }).click();
  await page.waitForURL(/\?moved=1/u);
  expect((await page.locator("main").innerText()).includes("Done: your booking has moved."), "moved");
  const dev = await (await page.request.get(origin + "/_dev")).text();
  expect(dev.includes("New time: Project call with Inès Moreau"), "moved email");
});

await step("the host sees it, with the guest's note, and a bell item", async () => {
  await as(context, origin, "ines");
  await english();
  await page.goto(origin + "/chest");
  await page.locator(".meeting", { hasText: "Lucie Garnier" }).click();
  await page.waitForURL(/\/chest\/bookings\/\d+/u);
  const text = await page.locator("main").innerText();
  expect(text.includes("A kitchen island in oak.") && text.includes("lucie@example.com"), "details");
  expect(text.includes("Their answers") && text.includes("A shop or an office") && text.includes("About 12 000 €"), "answers");
  expect(text.includes("Moved once"), "moves");
  const dev = await (await page.request.get(origin + "/_dev")).text();
  // Inès reads French: her bell says so in French.
  expect(dev.includes("Lucie Garnier a déplacé son rendez-vous"), "bell");
});

await step("the host cancels it with a word: the guest is emailed, the page says so", async () => {
  await page.getByRole("button", { name: "Cancel this meeting" }).click();
  await page.getByLabel("A word for Lucie Garnier (sent with the cancellation)").fill("I am ill, sorry. Book again next week?");
  await page.getByRole("button", { name: "Cancel the meeting" }).click();
  await page.waitForSelector(".ck-toast");
  expect((await page.locator(".ck-toast").innerText()).includes("Lucie Garnier has been told"), "toast");
  expect((await page.locator(".ck-toast-undo").count()) === 0, "no Undo once the guest was emailed");
  const dev = await (await page.request.get(origin + "/_dev")).text();
  expect(dev.includes("Cancelled: Project call with Inès Moreau"), "cancel email");
  await context.clearCookies();
  await page.goto(guestPage);
  const text = await page.locator("main").innerText();
  expect(text.includes("This booking is cancelled") && text.includes("Inès had to cancel it."), "guest sees it");
});

await step("a host creates a phone-call type; its page asks for the visitor's number", async () => {
  await as(context, origin, "ines");
  await english();
  await page.goto(origin + "/chest/types/new");
  await page.getByLabel("Name", { exact: true }).fill("Delivery question");
  await page.locator(".pills label", { hasText: /^15 min$/u }).click();
  await page.locator(".choices label", { hasText: "Phone call" }).click();
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForURL(origin + "/chest/types");
  expect((await page.locator(".types").innerText()).includes("Delivery question"), "listed");
  await page.goto(origin + "/ines-moreau/delivery-question");
  await pickFirstTime();
  expect(await page.getByLabel("Your phone number").isVisible(), "phone asked");
});

await step("deleting a type asks first, in the page (never the browser's box); Cancel keeps it", async () => {
  await as(context, origin, "ines");
  await english();
  let dialogs = 0;
  page.on("dialog", d => { dialogs += 1; void d.dismiss(); });
  await page.goto(origin + "/chest/types");
  await page.locator(".type", { hasText: "Delivery question" }).getByRole("link", { name: "Edit" }).click();
  await page.waitForURL(/\/chest\/types\/\d+/u);
  await page.getByRole("button", { name: "Delete this type" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Delete this type?" });
  await confirm.waitFor();
  expect((await confirm.innerText()).includes("Its past bookings are kept"), "says what stays");
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await confirm.waitFor({ state: "hidden" });
  expect(page.url().includes("/chest/types/"), "still on the type");
  await page.getByRole("button", { name: "Delete this type" }).click();
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await page.waitForURL(origin + "/chest/types");
  await page.waitForSelector(".ck-toast >> text=deleted");
  expect(!(await page.locator("main").innerText()).includes("Delivery question"), "gone from the list");
  expect(dialogs === 0, "no window.confirm");
  const gone = await page.request.get(origin + "/ines-moreau/delivery-question");
  expect(gone.status() === 404, "its page is gone");
});

await step("a host asks their own questions, reorders them, and limits a type to one booking a day", async () => {
  await as(context, origin, "ines");
  await english();
  await page.goto(origin + "/chest/types/new");
  await page.getByLabel("Name", { exact: true }).fill("Kitchen visit");
  await page.getByRole("button", { name: "Add a question" }).click();
  await page.getByLabel("Question 1", { exact: true }).fill("Is the kitchen empty?");
  await page.locator(".question").nth(0).getByLabel("Answer").selectOption("yesno");
  await page.locator(".question").nth(0).getByLabel("Required").check();
  await page.getByRole("button", { name: "Add a question" }).click();
  await page.getByLabel("Question 2", { exact: true }).fill("Which floor?");
  await page.getByRole("button", { name: "Move question 2 up" }).click();
  expect((await page.getByLabel("Question 1", { exact: true }).inputValue()) === "Which floor?", "moved up");
  await page.locator("summary", { hasText: "More options" }).click();
  await page.getByLabel("Bookings a day, at most").selectOption("1");
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForURL(origin + "/chest/types");
  const card = await page.locator(".type", { hasText: "Kitchen visit" }).innerText();
  expect(card.includes("2 questions") && card.includes("At most 1 a day"), "limits shown on the type");
  // A visitor books it: the questions in the host's order, then the day is full.
  await context.clearCookies();
  await page.goto(origin + "/ines-moreau/kitchen-visit");
  await page.waitForSelector(".calendar button.open");
  const day = await page.locator('.calendar button[aria-pressed="true"]').getAttribute("aria-label");
  await pickFirstTime();
  const labels = await page.locator(".guest-form .label").allInnerTexts();
  expect(labels.indexOf("Which floor? (optional)") >= 0 && labels.indexOf("Which floor? (optional)") < labels.indexOf("Is the kitchen empty?"), "order: " + labels.join(" | "));
  await page.getByLabel("Your name").fill("Marc Petit");
  await page.getByLabel("Your email address").fill("marc@example.com");
  await page.locator("fieldset", { hasText: "Is the kitchen empty?" }).locator(".choice", { hasText: "Yes" }).click();
  await page.waitForTimeout(3200);
  await page.getByRole("button", { name: "Confirm the booking" }).click();
  await page.waitForURL(/\/b\/[A-Za-z0-9_-]{32}\?new=1/u);
  await page.goto(origin + "/ines-moreau/kitchen-visit");
  await page.waitForSelector(".calendar button.open");
  const same = page.locator(`.calendar button[aria-label="${day}"]`);
  expect((await same.count()) === 0 || (await same.isDisabled()), "the full day is no longer offered");  await as(context, origin, "ines");
  await english();
});

await step("the time-zone list reads as cities with their offset, grouped by region, without old names", async () => {
  await context.clearCookies();
  await page.goto(origin + "/ines-moreau/project-call");
  const groups = await page.locator("#zone optgroup").evaluateAll(list => list.map(g => g.getAttribute("label")));
  expect(groups[0] === "Common" && groups.includes("Europe") && groups.includes("Americas"), "groups: " + groups.slice(0, 4).join(", "));
  const options = await page.locator("#zone option").allInnerTexts();
  expect(options.some(o => /^Paris \(UTC\+[12]\)$/u.test(o)), "Paris (UTC+…)");
  expect(!options.some(o => /Asmera|Calcutta|Saigon|Kiev/u.test(o)), "no old names");
});

await step("a host blocks a whole day from the agenda: visitors are no longer offered it", async () => {
  await context.clearCookies();
  await page.goto(origin + "/ines-moreau/project-call");
  await page.waitForSelector(".calendar button.open");
  const label = await page.locator(".calendar button.open").first().getAttribute("aria-label");
  const first = await page.locator(".calendar button.open").first();
  const dayNumber = Number((await first.innerText()).replace(/\D+/gu, ""));
  await as(context, origin, "ines");
  await english();
  // "Block a time" sits beside "New booking" on the agenda.
  await page.goto(origin + "/chest");
  await page.getByRole("button", { name: "Block a time", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Block a time" });
  await dialog.waitFor();
  // The day, as the date field wants it.
  const now = new Date();
  let date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  while (date.getUTCDate() !== dayNumber) date = new Date(date.getTime() + 864e5);
  await page.locator("#bl-day").fill(date.toISOString().slice(0, 10));
  // The kit's date field reads what was typed when it loses focus.
  await page.locator("#bl-day").press("Tab");
  await page.locator("#bl-from").selectOption("0");
  await page.locator("#bl-to").selectOption("1440");
  await page.locator("#bl-note").fill("Trade fair set-up");
  await dialog.getByRole("button", { name: "Block this time" }).click();
  await page.waitForSelector(".ck-toast >> text=Time blocked.");
  await page.waitForSelector(".meeting.blocked >> text=Trade fair set-up");
  const row = await page.locator(".meeting.blocked", { hasText: "Trade fair set-up" }).innerText();
  expect(row.includes("00:00") && row.includes("24:00"), "on the agenda: " + row.slice(0, 120));
  await context.clearCookies();
  await page.goto(origin + "/ines-moreau/project-call");
  await page.waitForSelector(".calendar button.open");
  const same = page.locator(`.calendar button[aria-label="${label}"]`);
  expect(await same.isDisabled(), "the blocked day is not offered");
});

await step("a host taps a free stretch of the agenda to block it, frees it again, and Undo blocks it back", async () => {
  await as(context, origin, "ines");
  await english();
  await page.goto(origin + "/chest");
  const free = page.locator("button.meeting.free").first();
  await free.waitFor();
  const from = (await free.locator(".time").innerText()).slice(0, 5);
  await free.click();
  const dialog = page.getByRole("dialog", { name: "Block a time" });
  await dialog.waitFor();
  const chosen = await page.locator("#bl-from").inputValue();
  expect(String(Number(from.slice(0, 2)) * 60 + Number(from.slice(3, 5))) === chosen, `starts at the stretch (${from} = ${chosen})`);
  await page.locator("#bl-note").fill("Supplier call");
  await dialog.getByRole("button", { name: "Block this time" }).click();
  await page.waitForSelector(".meeting.blocked >> text=Supplier call");
  const blocked = page.locator(".meeting.blocked", { hasText: "Supplier call" });
  await blocked.getByRole("button", { name: /^Unblock / }).click();
  await page.waitForSelector(".ck-toast >> text=Time unblocked.");
  await page.waitForSelector(".meeting.blocked >> text=Supplier call", { state: "detached" });
  await page.locator(".ck-toast", { hasText: "Time unblocked." }).getByRole("button", { name: "Undo" }).click();
  await page.waitForSelector(".meeting.blocked >> text=Supplier call");
});

await step("a host's other calendar: a wrong address is refused plainly, the one connected says when it was read", async () => {
  await as(context, origin, "ines");
  await english();
  await page.goto(origin + "/chest/hours");
  const others = page.locator("#calendars");
  // Folded: its line says what it holds; one tap opens it.
  expect((await others.locator(":scope > summary").innerText()).includes("1 calendar connected"), "folded with its count");
  await others.locator(":scope > summary").click();
  expect((await others.innerText()).includes("calendar.google.com") && /Read .* · 38 events/u.test(await others.innerText()), "connected calendar shown");
  expect(!(await others.innerText()).includes("private-5f1c"), "its secret part is never shown");
  await page.getByLabel("Secret address (iCal)").fill("https://example.com/my-calendar.ics");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.waitForSelector("#calendars .error");
  expect((await page.locator("#calendars .error").innerText()).includes("secret iCal address of a Google, Outlook or Apple calendar"), "refused plainly");
  // Hugo's calendar stopped answering: his agenda warns him.
  await as(context, origin, "hugo");
  await page.goto(origin + "/chest");
  expect((await page.locator(".notice").first().innerText()).includes("We could not read your calendar outlook.office365.com"), "stale warning");
});

await step("a host books for a customer on the phone, then moves the meeting; the guest is emailed each time", async () => {
  await as(context, origin, "ines");
  await english();
  await page.goto(origin + "/chest");
  await page.getByRole("link", { name: "New booking" }).click();
  await page.waitForURL(origin + "/chest/new");
  await page.getByLabel("Kind of meeting").selectOption({ label: "Showroom visit · 60 min" });
  await page.waitForURL(/type=/u);
  await page.waitForSelector(".calendar button.open");
  await pickFirstTime();
  await page.getByLabel("Their name").fill("Yves Martin");
  await page.getByLabel("Their email address").fill("yves@example.com");
  await page.getByRole("button", { name: "Book it" }).click();
  await page.waitForURL(/\/chest\/bookings\/\d+/u);
  expect((await page.locator("main").innerText()).includes("Booked by You"), "booked by the host");
  let dev = await (await page.request.get(origin + "/_dev")).text();
  expect(dev.includes("Booked: Showroom visit with Inès Moreau"), "confirmation to the guest");
  await page.getByRole("button", { name: "Move this meeting" }).click();
  await page.waitForSelector(".calendar button.open");
  const days = page.locator(".calendar button.open");
  await days.nth((await days.count()) - 1).click();
  await pickFirstTime();
  await page.getByRole("button", { name: "Move it to this time" }).click();
  await page.waitForSelector(".ck-toast >> text=Meeting moved.");
  dev = await (await page.request.get(origin + "/_dev")).text();
  expect(dev.includes("New time: Showroom visit with Inès Moreau"), "new time emailed");
});

await step("a team type offers the first of its hosts who is free", async () => {
  await context.clearCookies();
  await page.goto(origin + "/camille-martin/discovery");
  expect((await page.locator(".sheet-about").innerText()).includes("With Camille, Inès or Hugo"), "the team named");
  await page.waitForSelector(".calendar button.open");
});

await step("an administrator lets the company's website show the booking pages, at once", async () => {
  await as(context, origin, "camille");
  await english();
  const read = async () => (await page.request.get(origin + "/ines-moreau")).headers()["content-security-policy"] ?? "";
  // The public page has just been served (the policy read), then a site is
  // allowed: the very next request carries it — no waiting.
  expect(!(await read()).includes("https://www.atelier-martin.fr"), "not allowed yet");
  await page.goto(origin + "/chest/settings");
  await page.getByLabel("Websites allowed").fill("https://www.atelier-martin.fr");
  await page.locator("form", { has: page.getByLabel("Websites allowed") }).getByRole("button", { name: "Save" }).click();
  await page.waitForSelector(".ck-toast >> text=Saved.");
  const policy = await read();
  expect(policy.includes("frame-ancestors 'self' https://www.atelier-martin.fr"), "public pages framed by the site at once: " + policy);
  expect((await page.locator("#frame-code").inputValue()).startsWith("<iframe src="), "code to paste");
  const team = (await page.request.get(origin + "/chest")).headers()["content-security-policy"] ?? "";
  expect(team.includes("frame-ancestors 'none'"), "the team's pages never");
});

await step("a host imports the meetings booked in Calendly", async () => {
  await as(context, origin, "camille");
  await english();
  await page.goto(origin + "/chest/settings");
  await page.getByLabel("The exported file (.csv)").setInputFiles(new URL("../../../tools/public-and-private/booking/test/fixtures/calendly-scheduled-events.csv", import.meta.url).pathname);
  await page.getByRole("button", { name: "Import" }).click();
  await page.waitForSelector(".ck-toast");
  expect(/bookings? imported/u.test(await page.locator(".ck-toast").innerText()), "imported: " + await page.locator(".ck-toast").innerText());
  await page.goto(origin + "/chest");
  expect((await page.locator(".agenda").innerText()).includes("Marie Leroy"), "on the agenda");
});

await step("French dates keep their small letters in a sentence", async () => {
  await as(context, origin, "ines");
  await context.addCookies([{ name: "dev_locale", value: "fr", url: origin }]);
  await page.goto(origin + "/chest/hours");
  await page.locator("#exceptions > summary").click();
  const text = await page.locator("#exceptions").innerText();
  await english();
  expect(/ (janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre) /u.test(text) && !/ (Octobre|Novembre|Septembre|Décembre) /u.test(text), "lower-case months: " + text.slice(0, 80));
});

await step("a host sets a day off and changes Friday's hours", async () => {
  await page.goto(origin + "/chest/hours");
  await page.locator("#exceptions > summary").click();
  await page.getByLabel("First day").fill(new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Add the days off" }).click();
  await page.waitForSelector(".ck-toast");
  expect((await page.locator(".exceptions").innerText()).includes("Day off"), "day off listed");
  await page.getByLabel("friday To").last().selectOption("960");
  await page.getByRole("button", { name: "Save the hours" }).click();
  await page.waitForSelector(".ck-toast >> text=Hours saved.");
});

await step("an administrator sees everyone's bookings; a host does not", async () => {
  await as(context, origin, "camille");
  await english();
  await page.goto(origin + "/chest?who=all");
  const text = await page.locator(".agenda").innerText();
  expect(text.includes("Paul Bernard") && text.includes("Marie Leroy"), "everyone");
  await as(context, origin, "hugo");
  await page.goto(origin + "/chest?who=all");
  expect(!(await page.locator("main").innerText()).includes("Marie Leroy"), "hugo sees only his");
  const r = await page.request.get(origin + "/chest/bookings/1");
  expect(r.status() === 404, "another host's booking is not found");
});

await step("a wrong address shows a clear page, and the guest link is unguessable", async () => {
  await context.clearCookies();
  const r = await page.goto(origin + "/nobody-here");
  expect(r.status() === 404, "unknown host");
  await page.goto(origin + "/b/" + "x".repeat(32));
  expect((await page.locator("h1").innerText()).includes("This link does not work"), "unknown link");
});

await step("French, phone width: a visitor books without sideways scroll", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/lang/fr?back=/hugo-bernard/measurement");
  await page.waitForSelector(".calendar button.open");
  expect((await page.locator("h2").first().innerText()).includes("Choisissez une heure"), "French");
  await pickFirstTime();
  expect(await page.getByLabel("Votre nom").isVisible(), "form in French");
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(!wide, "no sideways scroll");
  await page.goto(origin + "/lang/en?back=/");
});

await step("a new host is not public until they connect a calendar or confirm their hours; the first screen asks for the calendar", async () => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await as(context, origin, "sofia");
  await page.goto(origin + "/chest");
  const first = page.locator(".first-run");
  expect((await first.innerText()).includes("Your page is not public yet"), "says it");
  expect(await page.getByLabel("Your calendar’s secret address (Google, Outlook or Apple)").isVisible(), "asks for the calendar first");
  expect((await page.getByRole("button", { name: "Copy the link" }).count()) === 0, "no link to share yet");
  await context.clearCookies();
  expect(!(await (await page.request.get(origin + "/")).text()).includes("Sofia Rossi"), "not on the company page");
  expect((await page.request.get(origin + "/sofia-rossi")).status() === 404, "no public page");
  expect((await page.request.get(origin + "/api/slots?host=sofia-rossi&type=meeting&from=2026-01-01&to=2026-01-10")).status() === 404, "no free times");
  await as(context, origin, "sofia");
  await page.goto(origin + "/chest/hours");
  expect((await page.locator(".notice").first().innerText()).includes("not public yet"), "Hours says it too");
  expect(await page.getByRole("button", { name: "Save the hours and make my page public" }).isVisible(), "the save button says what it does");
  await page.goto(origin + "/chest");
  await page.getByRole("button", { name: "My hours are right: make my page public" }).click();
  await page.waitForSelector(".ck-toast >> text=Your page is public.");
  await page.waitForSelector(".ticket");
  await context.clearCookies();
  expect((await (await page.request.get(origin + "/")).text()).includes("Sofia Rossi"), "now on the company page");
  expect((await page.request.get(origin + "/sofia-rossi")).status() === 200, "public page");
});

await step("a French visitor reads Inès's questions in French; the page never mixes languages", async () => {
  await context.clearCookies();
  await page.goto(origin + "/lang/fr?back=/ines-moreau/project-call");
  await page.waitForSelector(".calendar button.open");
  expect((await page.locator("h1").innerText()).includes("Appel projet"), "title in French");
  await pickFirstTime();
  const form = await page.locator(".guest-form").innerText();
  expect(form.includes("À quoi est-ce destiné") && form.includes("Un logement") && form.includes("Votre budget, à peu près (facultatif)"), "questions in French: " + form.slice(0, 200));
  expect(!/What is it for|A home|Your budget/u.test(form), "no English question");
  expect((await page.locator(".ck-languages .ck-language").count()) === 2, "Inès wrote both: both offered");
  await page.goto(origin + "/lang/en?back=/");
});

await step("a video type asks where its rooms are made, and says what meet.jit.si asks of the host", async () => {
  await as(context, origin, "ines");
  await english();
  await page.goto(origin + "/chest/types/new");
  await page.getByLabel("Name", { exact: true }).fill("Design review");
  await page.locator(".choices label", { hasText: "Video call" }).click();
  await page.getByLabel("A new room for each meeting").check();
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForSelector("p.error");
  expect((await page.locator("p.error").innerText()).includes("Choose where the rooms are made"), "no silent default");
  const jitsi = page.locator(".rooms .choice", { hasText: "Jitsi Meet" });
  expect((await jitsi.innerText()).includes("you sign in with Google, GitHub or Facebook"), "says the sign-in");
  await jitsi.click();
  // Inès writes in English with a French version: the French fields are there.
  await page.getByLabel("Name — in French").fill("Revue de projet");
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForURL(origin + "/chest/types");
  await context.clearCookies();
  await page.goto(origin + "/lang/fr?back=/ines-moreau/design-review");
  expect((await page.locator("h1").innerText()).includes("Revue de projet"), "the French name on the French page");
  await page.goto(origin + "/lang/en?back=/");
});

await step("a host who writes in one language only: every visitor reads the page in it, with no language switch", async () => {
  await as(context, origin, "hugo");
  await page.goto(origin + "/chest/settings");
  await page.getByLabel("Also in").selectOption("");
  await page.locator("form", { has: page.getByLabel("Also in") }).getByRole("button", { name: "Save" }).click();
  await page.waitForSelector(".ck-toast >> text=Saved.");
  await context.clearCookies();
  await page.goto(origin + "/lang/fr?back=/hugo-bernard/measurement");
  await page.waitForSelector(".calendar button.open");
  expect((await page.locator("h1").innerText()).includes("Measurement visit at your home"), "his English text");
  expect((await page.locator("h2").first().innerText()).includes("Pick a time"), "the page's words in the same language");
  expect((await page.locator(".ck-languages").count()) === 0, "no switch to a language he did not write");
  await page.goto(origin + "/lang/en?back=/");
});

await browser.close();
done(problems);
