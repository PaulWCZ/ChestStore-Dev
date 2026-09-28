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

await step("they pick a day and a time, fill three fields, and are booked (with an email)", async () => {
  await page.waitForSelector(".calendar button.open");
  const time = await pickFirstTime();
  await page.getByLabel("Your name").fill("Lucie Garnier");
  await page.getByLabel("Your email address").fill("lucie@example.com");
  await page.getByLabel("Anything to prepare? (optional)").fill("A kitchen island in oak.");
  await page.waitForTimeout(3200);
  await page.getByRole("button", { name: "Confirm the booking" }).click();
  await page.waitForURL(/\/b\/[A-Za-z0-9_-]{32}\?new=1/u);
  guestPage = page.url().split("?")[0];
  const text = await page.locator("main").innerText();
  expect(text.includes("You are booked"), "booked");
  expect(text.includes("A confirmation is on its way to lucie@example.com"), "mailed");
  expect(text.includes(time), "the time chosen");
  const dev = await (await page.request.get(origin + "/_dev")).text();
  expect(dev.includes("Booked: Project call with Inès Moreau"), "confirmation email in the outbox");
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
  expect(text.includes("Moved once"), "moves");
  const dev = await (await page.request.get(origin + "/_dev")).text();
  // Inès reads French: her bell says so in French.
  expect(dev.includes("Lucie Garnier a déplacé son rendez-vous"), "bell");
});

await step("the host cancels it with a word: the guest is emailed, the page says so", async () => {
  await page.getByRole("button", { name: "Cancel this meeting" }).click();
  await page.getByLabel("A word for Lucie Garnier (sent with the cancellation)").fill("I am ill, sorry. Book again next week?");
  await page.getByRole("button", { name: "Cancel the meeting" }).click();
  await page.waitForSelector(".toast");
  expect((await page.locator(".toast").innerText()).includes("Lucie Garnier has been told"), "toast");
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
  await page.getByLabel("Name").fill("Delivery question");
  await page.locator(".pills label", { hasText: /^15 min$/u }).click();
  await page.locator(".choices label", { hasText: "Phone call" }).click();
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForURL(origin + "/chest/types");
  expect((await page.locator(".types").innerText()).includes("Delivery question"), "listed");
  await page.goto(origin + "/ines-moreau/delivery-question");
  await pickFirstTime();
  expect(await page.getByLabel("Your phone number").isVisible(), "phone asked");
});

await step("a host sets a day off and changes Friday's hours", async () => {
  await page.goto(origin + "/chest/hours");
  await page.getByLabel("First day").fill(new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Add the days off" }).click();
  await page.waitForSelector(".toast");
  expect((await page.locator(".exceptions").innerText()).includes("Day off"), "day off listed");
  await page.getByLabel("friday To").last().selectOption("960");
  await page.getByRole("button", { name: "Save the hours" }).click();
  await page.waitForSelector(".toast >> text=Hours saved.");
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

await browser.close();
done(problems);
