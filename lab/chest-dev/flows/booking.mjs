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

await step("a day before today in \"Block a time\" is refused as typed: nothing is blocked for the day the field held", async () => {
  // Kit 0.2.4: a day before `min` stays as typed, says why, and the
  // dialog's form stops on it — never the day the field held (today) in
  // its place (the bug class where Timesheets saved "today").
  await as(context, origin, "ines");
  await english();
  await page.goto(origin + "/chest");
  await page.getByRole("button", { name: "Block a time", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Block a time" });
  await dialog.waitFor();
  const held = await page.locator("#bl-day").inputValue();
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  await page.locator("#bl-day").fill(yesterday);
  await page.locator("#bl-day").press("Tab");
  const field = page.locator(".ck-date", { has: page.locator("#bl-day") });
  await field.locator(".ck-error", { hasText: /or later\.$/u }).waitFor();
  expect(await page.locator("#bl-day").getAttribute("aria-invalid") === "true", "the field says it is refused");
  await page.locator("#bl-note").fill("Refused day");
  let sent = 0;
  const count = r => { if (r.method() === "POST" && r.url().startsWith(origin + "/chest")) sent++; };
  page.on("request", count);
  await dialog.getByRole("button", { name: "Block this time" }).click();
  await page.waitForTimeout(800);
  page.off("request", count);
  expect(sent === 0, "nothing sent: " + sent);
  expect(await dialog.isVisible(), "the dialog stays open");
  expect(await page.locator("#bl-day").inputValue() === yesterday, "the day stays as typed (held: " + held + ")");
  expect(await page.locator(".ck-toast", { hasText: "Time blocked." }).count() === 0, "not blocked");
  // Corrected, then the button clicked in one move: the sentence goes
  // while typing (kit 0.2.5), so leaving the field moves nothing under the
  // pointer, and the day typed is the one blocked.
  const later = new Date(Date.now() + 45 * 864e5).toISOString().slice(0, 10);
  await page.locator("#bl-day").fill(later);
  const typed = await dialog.getByRole("button", { name: "Block this time" }).boundingBox();
  await page.locator("#bl-day").evaluate(el => el.blur());
  const left = await dialog.getByRole("button", { name: "Block this time" }).boundingBox();
  expect(Math.abs(typed.y - left.y) < 1, `leaving the field does not move the button (${typed.y} → ${left.y})`);
  await page.locator("#bl-day").focus();
  await dialog.getByRole("button", { name: "Block this time" }).click();
  await page.waitForSelector(".ck-toast >> text=Time blocked.");
  // On the agenda, then freed again (it was only a test).
  await page.goto(origin + "/chest");
  const blocked = page.locator(".meeting.blocked", { hasText: "Refused day" });
  await blocked.waitFor();
  await blocked.getByRole("button", { name: /^Unblock / }).click();
  await page.waitForSelector(".meeting.blocked >> text=Refused day", { state: "detached" });
  await page.reload();
  expect(await page.locator(".meeting.blocked", { hasText: "Refused day" }).count() === 0, "nothing left blocked");
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

// ——— Round 3: the host's truth, the visitor's language, the suite ———

// A time of Inès's clock (Paris) as the UTC minute an event carries.
const parisOffset = day => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", timeZoneName: "shortOffset" }).formatToParts(new Date(day + "T12:00:00Z")).find(p => p.type === "timeZoneName").value.replace("GMT", "") || 0);
const utcMinute = (day, minutes) => new Date(Date.parse(day + "T00:00:00Z") + (minutes - parisOffset(day) * 60) * 60000).toISOString().slice(0, 16) + "Z";
const minutesOf = text => Number(text.slice(0, 2)) * 60 + Number(text.slice(3, 5));
const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const devText = async () => (await page.request.get(origin + "/_dev")).text();

await step("one type, one name: Inès (French) reads « Visite du showroom » for every guest, an English guest tagged EN — agenda and CSV", async () => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await as(context, origin, "ines");
  await context.addCookies([{ name: "dev_locale", value: "fr", url: origin }]);
  await page.goto(origin + "/chest");
  const marie = page.locator(".meeting", { hasText: "Marie Leroy" });
  const lucas = page.locator(".meeting", { hasText: "Lucas Garnier" });
  expect((await marie.innerText()).includes("Visite du showroom"), "Marie's booking (made in English) in Inès's French");
  expect((await lucas.innerText()).includes("Visite du showroom"), "Lucas's booking (made in French)");
  expect((await marie.locator(".tag.lang [aria-hidden=true]").innerText()).trim() === "EN" && (await marie.locator(".tag.lang .visually-hidden").innerText()).includes("Réservé en anglais"), "the guest's language, small");
  expect(await lucas.locator(".tag.lang").count() === 0, "no tag when it is the reader's language");
  const agenda = await page.locator(".agenda").innerText();
  expect(!agenda.includes("Showroom visit") && !agenda.includes("Project call"), "never the English name beside the French one");
  const csv = await (await page.request.get(origin + "/chest/export")).text();
  expect(csv.includes("Visite du showroom") && !csv.includes("Showroom visit") && csv.includes("Langue de l’invité") && csv.includes("anglais"), "the CSV says the same");
  await marie.click();
  await page.waitForURL(/\/chest\/bookings\/\d+$/u);
  const detail = await page.locator("body").innerText();
  expect(detail.includes("Visite du showroom") && detail.includes("Réservé en anglais") && !detail.includes("Showroom visit"), "the booking's page too");
});

await step("a stretch busy in Inès's Google calendar reads « Occupé · Dans votre agenda Google », not a hole", async () => {
  await page.goto(origin + "/chest");
  const busy = page.locator(".meeting.elsewhere", { hasText: "Dans votre agenda Google" });
  expect(await busy.count() > 0, "a grey row for her Google calendar");
  const text = await busy.first().innerText();
  expect(text.includes("Occupé") && /\d\d:\d\d/u.test(text), "busy, with its times: " + text);
  expect(!(await busy.first().getAttribute("href")), "nothing to tap");
});

await step("Hiring tells Booking Inès has an interview: that hour is not offered, and her agenda says why", async () => {
  await page.goto(origin + "/chest");
  const section = page.locator(".day", { has: page.locator(".meeting.free") }).first();
  const day = (await section.getAttribute("aria-labelledby")).slice(2);
  const [startText, endText] = (await section.locator(".meeting.free .time").first().innerText()).split("\n").map(x => x.trim());
  const start = minutesOf(startText), end = Math.min(minutesOf(endText), start + 60);
  const data = { v: 1, member: "mbr_inesaaaaaaaaaaaaaaaaaaaaaa", at: new Date().toISOString(), from: new Date().toISOString().slice(0, 10) + "T00:00Z", to: new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10) + "T00:00Z", spans: [[utcMinute(day, start), utcMinute(day, end)]] };
  await page.request.post(origin + "/_dev/deliver", { form: { type: "hiring.busy", data: JSON.stringify(data) } });
  await page.goto(origin + "/chest");
  const interview = page.locator(`.day[aria-labelledby="d-${day}"] .meeting.elsewhere`, { hasText: "Un entretien dans Recrutement" });
  expect((await interview.innerText()).includes(hhmm(start)), "the interview's hour on her agenda");
  const slots = await (await page.request.get(origin + `/api/slots?host=ines-moreau&type=project-call&from=${day}&to=${day}`)).json();
  const from = Date.parse(data.spans[0][0]), to = Date.parse(data.spans[0][1]);
  expect(!slots.slots.some(s => Date.parse(s) < to && Date.parse(s) + 30 * 60000 > from), "no time offered across the interview");
  // Booking never tells Hiring back what Hiring told it.
  const dev = await devText();
  expect(!dev.includes(`"${data.spans[0][0]}"`), "no echo in what Booking publishes");
});

await step("Leave tells Booking Inès is off a whole day: no time is offered that day, her agenda reads « Absent »; « now free » gives the day back", async () => {
  await page.goto(origin + "/chest");
  const open = page.locator(".day", { has: page.locator(".meeting.free") });
  const day = (await open.nth((await open.count()) - 1).getAttribute("aria-labelledby")).slice(2);
  const next = new Date(Date.parse(day + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);
  const slotsThatDay = async () => (await (await page.request.get(origin + `/api/slots?host=ines-moreau&type=project-call&from=${day}&to=${day}`)).json()).slots;
  const before = await slotsThatDay();
  expect(before.length > 0, "the day is open before");
  // Leave's snapshot: times only (the whole day in Paris), never the kind of leave.
  const snapshot = (spans, at) => ({ v: 1, member: "mbr_inesaaaaaaaaaaaaaaaaaaaaaa", at: at.toISOString(), from: new Date().toISOString().slice(0, 10) + "T00:00Z", to: new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10) + "T00:00Z", spans });
  await page.request.post(origin + "/_dev/deliver", { form: { type: "leave.busy", data: JSON.stringify(snapshot([[utcMinute(day, 0), utcMinute(next, 0)]], new Date())) } });
  expect((await slotsThatDay()).length === 0, "no time offered on her day off");
  await page.goto(origin + "/chest");
  const row = page.locator(`.day[aria-labelledby="d-${day}"] .meeting.elsewhere`, { hasText: "Absent" });
  expect(await row.count() > 0, "« Absent » on her agenda that day");
  expect(await page.locator(`.day[aria-labelledby="d-${day}"] .meeting.free`).count() === 0, "no free stretch left that day");
  // Booking never tells Hiring back what Leave told it.
  const told = (await devText()).replaceAll("&quot;", '"');
  expect(!told.includes(`["${utcMinute(day, 0)}","${utcMinute(next, 0)}"]`), "no echo in what Booking publishes");
  // Her leave cancelled: Leave says she is free again; the day comes back as it was.
  await page.request.post(origin + "/_dev/deliver", { form: { type: "leave.busy", data: JSON.stringify(snapshot([], new Date(Date.now() + 1000))) } });
  expect(JSON.stringify(await slotsThatDay()) === JSON.stringify(before), "the same times offered again");
  await page.goto(origin + "/chest");
  expect(await page.locator(`.day[aria-labelledby="d-${day}"] .meeting.elsewhere`, { hasText: "Absent" }).count() === 0, "gone from her agenda");
});

await step("a visitor's booking is told to Clients (who, which type, when; never the note) and the host's busy times to Hiring", async () => {
  await context.clearCookies();
  await page.goto(origin + "/lang/en?back=/hugo-bernard/measurement");
  await pickFirstTime();
  await page.getByLabel("Your name").fill("Nadia Benali");
  await page.getByLabel("Your email address").fill("nadia@example.com");
  await page.getByLabel("Anything to prepare? (optional)").fill("Private: code 1234");
  await page.getByRole("button", { name: "Confirm the booking" }).click();
  await page.waitForURL(/\/b\/[A-Za-z0-9_-]{32}\?new=1/u);
  const dev = await devText();
  const confirmed = dev.split("<li>").find(li => li.includes("booking.confirmed") && li.includes("Nadia Benali"));
  expect(confirmed, "booking.confirmed published");
  expect(confirmed.includes("nadia@example.com") && confirmed.includes("&quot;company&quot;:null") && confirmed.includes("Measurement visit at your home") && !confirmed.includes("code 1234"), "the contact and the type, never the note");
  expect(dev.split("<li>").some(li => li.includes("booking.busy") && li.includes("mbr_hugo")), "Hugo's busy times told");
});

await step("four wrong calendar addresses, four plain answers; webcal:// is taken as the address it is", async () => {
  await as(context, origin, "ines");
  await english();
  await page.goto(origin + "/chest/hours");
  const others = page.locator("#calendars");
  await others.locator(":scope > summary").click();
  const answer = async address => {
    await page.getByLabel("Secret address (iCal)").fill(address);
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("#calendars .error") !== null && !document.querySelector("#calendars button[type=submit]")?.disabled);
    return page.locator("#calendars .error").innerText();
  };
  expect((await answer("https://calendar.google.com/calendar/u/0/r")).includes("This is the address of a Google Calendar page"), "Google's page");
  expect((await answer("https://calendar.google.com/calendar/embed?src=ines%40atelier-martin.fr&ctz=Europe%2FParis")).includes("Secret address in iCal format"), "Google's embed code");
  expect((await answer("https://outlook.office365.com/owa/calendar/0f3a9c@atelier-martin.fr/b7d2e4/calendar.html")).includes("This is Outlook’s HTML link"), "Outlook's HTML link");
  // webcal:// is read as https://: the address is accepted and read (the
  // studio has no network, so reading it is refused here — on a Chest it connects).
  const apple = await answer("webcal://p52-caldav.icloud.com/published/2/MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkw");
  expect(!apple.includes("Paste the secret iCal address") && !apple.includes("This is the address") && !apple.includes("HTML link"), "webcal accepted as an address: " + apple);
});

await step("a French visitor in Montréal reads French cities, « Toronto, Montréal » chosen, and « à l’arrivée d’Inès »", async () => {
  const montreal = await browser.newContext({ locale: "fr-CA", timezoneId: "America/Toronto", viewport: { width: 390, height: 844 } });
  const visitor = await montreal.newPage();
  visitor.on("pageerror", e => problems.push("page: " + e.message));
  await visitor.goto(origin + "/lang/fr?back=/ines-moreau/project-call");
  await visitor.waitForSelector(".calendar button.open");
  const zone = visitor.locator("select#zone");
  expect((await zone.locator("option:checked").innerText()).startsWith("Toronto, Montréal"), "Montréal named");
  const options = await zone.innerText();
  for (const city of ["Bruxelles", "Nouméa", "La Réunion", "São Paulo", "Londres"]) expect(options.includes(city), city);
  expect(!/Brussels|Noumea|Reunion \(|Sao Paulo/u.test(options), "no English city name");
  await visitor.locator(".time-button").first().click();
  await visitor.getByLabel("Votre nom").fill("Gabrielle Tremblay");
  await visitor.getByLabel("Votre adresse e-mail").fill("gabrielle@example.ca");
  await visitor.locator("fieldset", { hasText: "À quoi est-ce destiné" }).locator(".choice").first().click();
  await visitor.getByRole("button", { name: "Confirmer le rendez-vous" }).click();
  await visitor.waitForURL(/\/b\/[A-Za-z0-9_-]{32}\?new=1/u);
  const text = await visitor.locator("main").innerText();
  expect(text.includes("à l’arrivée d’Inès") && !text.includes("de Inès"), "elided: " + text.slice(0, 300));
  expect(text.includes("Toronto, Montréal"), "her zone named as she knows it");
  await montreal.close();
});

await step("the month grid is one Tab stop: the arrows move among the open days, Enter picks one", async () => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await context.clearCookies();
  await page.goto(origin + "/lang/en?back=/ines-moreau/project-call");
  await page.waitForSelector(".calendar button.open");
  await page.getByRole("button", { name: "Later dates" }).focus();
  await page.keyboard.press("Tab");
  const first = await page.evaluate(() => document.activeElement?.getAttribute("data-day"));
  expect(first, "Tab lands on a day");
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.id) === "zone", "the next Tab leaves the grid for the time zone");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("ArrowRight");
  const second = await page.evaluate(() => document.activeElement?.getAttribute("data-day"));
  expect(second && second > first, "the right arrow goes to the next open day");
  await page.keyboard.press("Enter");
  expect(await page.locator(`.calendar button[data-day="${second}"]`).getAttribute("aria-pressed") === "true", "Enter picks it");
  await page.waitForSelector(".times .time-button");
  const tabbable = await page.locator(".calendar button[tabindex='0']").count();
  expect(tabbable === 1, "one Tab stop in the grid, not " + tabbable);
});

await step("on a phone Inès's agenda shows her meetings; « Afficher les créneaux libres » brings the free and busy rows back", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await as(context, origin, "ines");
  await context.addCookies([{ name: "dev_locale", value: "fr", url: origin }]);
  await page.goto(origin + "/chest");
  const toggle = page.getByRole("switch", { name: "Afficher les créneaux libres" });
  expect(await toggle.isVisible(), "the toggle, on a phone");
  expect(!(await page.locator(".meeting.free").first().isVisible()), "free rows folded");
  expect(await page.locator("a.meeting").first().isVisible(), "meetings shown");
  await page.locator(".free-toggle label").click();
  expect(await page.locator(".meeting.free").first().isVisible(), "free rows back");
  await page.reload();
  // The choice is read from this phone's storage once the page hydrates.
  expect(await page.locator(".meeting.free").first().waitFor({ timeout: 5000 }).then(() => true, () => false), "remembered on this phone");
  await page.locator(".free-toggle label").click();
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(!wide, "no sideways scroll");
  await page.setViewportSize({ width: 1280, height: 860 });
  expect(!(await page.locator(".free-toggle").isVisible()) && await page.locator(".meeting.free").first().isVisible(), "a computer shows them all");
});

await step("email is promised only because this Chest sends it (SDK studio.16, mail.available): the public form, New booking and Settings say so, and no page says it cannot", async () => {
  await context.clearCookies();
  await page.goto(origin + "/ines-moreau/project-call");
  await page.waitForSelector(".calendar button.open");
  await pickFirstTime();
  expect((await page.locator("#email-hint").innerText()).trim() === "We send the confirmation there.", "the public form promises the confirmation");
  await as(context, origin, "ines");
  await english();
  await page.goto(origin + "/chest/new");
  expect((await page.locator("main").innerText()).includes("they get the confirmation and their link"), "New booking promises it");
  await page.waitForSelector(".calendar button.open");
  await pickFirstTime();
  expect((await page.locator("#g-email-hint").innerText()).includes("The confirmation goes there"), "the guest's email field too");
  await page.goto(origin + "/chest/settings");
  const text = await page.locator("main").innerText();
  expect(!/cannot send email|not connected email|paused email|all of today/u.test(text), "Settings warns of nothing: " + text.slice(0, 200));
});

await step("the company's page speaks the visitor's language, else the Chest's (English here)", async () => {
  const lang = async (headers) => {
    // A visitor without the harness's cookies.
    const html = await (await fetch(origin + "/", { headers })).text();
    return /<html[^>]* lang="([a-z]+)"/u.exec(html)?.[1];
  };
  expect((await lang({ "accept-language": "fr-FR,fr;q=0.9" })) === "fr", "a French browser reads French");
  expect((await lang({ "accept-language": "de-DE,de;q=0.9" })) === "en", "a German browser reads the Chest's language");
  expect((await lang({ "accept-language": "de-DE", cookie: "lang=fr" })) === "fr", "the switch wins");
});

await browser.close();
done(problems);
