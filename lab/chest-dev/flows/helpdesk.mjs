// Support, as customers and the team use it, in a real browser:
//   node lab/chest-dev/flows/helpdesk.mjs [port]   (harness with --reset)
import { as, done, expect, open, step } from "./lib.mjs";

const port = Number(process.argv[2] ?? 4000);
const { browser, context, page, origin, problems } = await open(port, "hugo", { allow404: /\/chest\/tickets\/9999$/u });
let followUp = "";

await step("a customer writes through the public form and lands on their follow-up page", async () => {
  await context.clearCookies();
  await page.goto(origin + "/");
  expect((await page.locator("h1").innerText()).includes("Atelier Martin"), "company name");
  await page.getByLabel("Your name").fill("Lucie Garnier");
  await page.getByLabel("Your email address").fill("lucie@example.com");
  await page.getByLabel("Subject").fill("Missing screws for the bookcase");
  await page.getByLabel("Your message").fill("Hello, the bag of screws was missing from the box. Lucie");
  await page.waitForTimeout(3200);
  await page.getByRole("button", { name: "Send" }).click();
  await page.waitForURL(/\/t\/[A-Za-z0-9_-]{32}\?new=1/u);
  followUp = page.url().split("?")[0];
  const text = await page.locator("main").innerText();
  expect(text.includes("Thank you — we have your request"), "thanks");
  expect(text.includes("We also sent this link to lucie@example.com"), "emailed");
});

await step("a form sent too fast is refused, what was written stays", async () => {
  await page.goto(origin + "/");
  await page.getByLabel("Your email address").fill("bot@example.com");
  await page.getByLabel("Subject").fill("Fast");
  await page.getByLabel("Your message").fill("Too fast");
  await page.getByRole("button", { name: "Send" }).click();
  await page.waitForSelector("p.error");
  expect((await page.locator("p.error").innerText()).includes("very fast"), "too fast");
  expect((await page.getByLabel("Your message").inputValue()) === "Too fast", "kept");
});

await step("the public part in French, by its switch", async () => {
  await page.getByRole("link", { name: "Français" }).click();
  await page.waitForURL(origin + "/");
  expect((await page.locator("h1").innerText()).includes("Contacter Atelier Martin"), "French title");
  await page.getByRole("link", { name: "English" }).click();
});

await step("the customer writes again from their link", async () => {
  await page.goto(followUp);
  await page.getByPlaceholder("Add something, or answer our question.").fill("Also, one shelf is scratched.");
  await page.getByRole("button", { name: "Send" }).click();
  await page.waitForSelector("text=Sent. We will get back to you.");
  expect((await page.locator(".thread").innerText()).includes("one shelf is scratched"), "thread");
});

await step("an agent takes it, inserts a saved reply, sends it: the customer gets an email", async () => {
  await as(context, origin, "hugo");
  await page.goto(origin + "/chest");
  await page.locator(".ticket-row", { hasText: "Missing screws" }).first().click();
  await page.waitForURL(/\/chest\/tickets\/\d+/u);
  await page.getByRole("button", { name: "Take it" }).click();
  await page.waitForTimeout(800);
  await page.getByText("Saved replies").click();
  await page.locator(".menu-pop button", { hasText: "Damaged item" }).click();
  expect((await page.locator("#answer").inputValue()).includes("Hello Lucie"), "saved reply filled");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.waitForSelector(".toast");
  await page.waitForTimeout(800);
  expect((await page.locator(".thread").innerText()).includes("Sent by email"), "delivery");
  const dev = await (await page.request.get(origin + "/_dev")).text();
  expect(dev.includes("Re: Missing screws for the bookcase [#"), "reply email");
  expect(dev.includes("We received your request: Missing screws"), "confirmation email");
});

await step("an internal note stays inside; the customer's page does not show it", async () => {
  await page.getByRole("tab", { name: "Internal note" }).click();
  await page.locator("#answer").fill("Screws are in the drawer B2.");
  await page.getByRole("button", { name: "Add the note" }).click();
  await page.waitForTimeout(1200);
  expect((await page.locator(".thread").innerText()).includes("drawer B2"), "note shown to the team");
  const customer = await (await page.request.get(followUp)).text();
  expect(!customer.includes("drawer B2"), "note hidden from the customer");
});

await step("close with undo", async () => {
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.waitForSelector(".toast");
  await page.locator(".toast button").click();
  await page.waitForTimeout(1200);
  await page.reload();
  expect((await page.locator(".side-card").innerText()).includes("Waiting for the customer"), "status back");
});

await step("an email to the support mailbox opens a ticket, confirmed by email", async () => {
  await page.request.post(origin + "/_dev/receive", { form: { mailbox: "support", from: "tom.h@example.com", fromName: "Tom H", subject: "Gift card", text: "Do you sell gift cards?", back: "/_dev" } });
  await page.goto(origin + "/chest");
  expect((await page.locator(".tickets").innerText()).includes("Gift card"), "new ticket from email");
  const dev = await (await page.request.get(origin + "/_dev")).text();
  expect(dev.includes("We received your request: Gift card"), "confirmation");
});

await step("search by customer email and by number", async () => {
  await page.goto(origin + "/chest?q=lucie@example.com");
  expect((await page.locator(".tickets").innerText()).includes("Missing screws"), "by email");
  await page.goto(origin + "/chest?q=1003");
  expect((await page.locator(".tickets").innerText()).includes("table"), "by number");
});

await step("a viewer reads but cannot answer; French for Camille", async () => {
  await as(context, origin, "tom");
  await page.goto(origin + "/chest/tickets/1003");
  expect((await page.locator("main, #main").first().innerText()).includes("Your role lets you read tickets"), "read only");
  await as(context, origin, "camille");
  await page.goto(origin + "/chest");
  expect((await page.locator(".side").innerText()).includes("À attribuer"), "French folders");
});

await step("the admin closes the form; the public page says so; then reopens it", async () => {
  await page.goto(origin + "/chest/settings");
  await page.getByLabel("Le formulaire est ouvert").uncheck();
  await page.getByRole("button", { name: "Enregistrer" }).first().click();
  await page.waitForTimeout(1000);
  await context.clearCookies();
  await page.goto(origin + "/");
  expect((await page.locator("main").innerText()).includes("This form is closed"), "closed");
  await as(context, origin, "camille");
  await page.goto(origin + "/chest/settings");
  await page.getByLabel("Le formulaire est ouvert").check();
  await page.getByRole("button", { name: "Enregistrer" }).first().click();
  await page.waitForTimeout(800);
});

await step("phone width: public form, inbox and ticket fit", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", followUp.replace(origin, ""), "/chest", "/chest/tickets/1003"]) {
    await page.goto(origin + path);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width <= 392, `${path} overflows: ${width}`);
  }
});

await browser.close();
done(problems);
