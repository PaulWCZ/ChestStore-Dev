// Support, as customers and the team use it, in a real browser:
//   node lab/chest-dev/flows/helpdesk.mjs [port]   (harness with --reset)
import { as, done, expect, open, step } from "./lib.mjs";

const port = Number(process.argv[2] ?? 4000);
const { browser, context, page, origin, problems } = await open(port, "hugo", { allow404: /\/chest\/tickets\/9999$/u });
let followUp = "";
let lucie = 0;
// Small files as a browser would pick them.
const png = { name: "box.png", mimeType: "image/png", buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]) };
const pdf = (name) => ({ name, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\n% sample\n") });
const settled = async (scope) => page.waitForFunction(s => !document.querySelector(s + " .picked")?.textContent?.match(/Adding|Ajout/u), scope);

await step("a customer writes through the public form and lands on their follow-up page", async () => {
  await context.clearCookies();
  await page.goto(origin + "/");
  expect((await page.locator("h1").innerText()).includes("Atelier Martin"), "company name");
  await page.getByLabel("Your name").fill("Lucie Garnier");
  await page.getByLabel("Your email address").fill("lucie@example.com");
  await page.getByLabel("Subject").fill("Missing screws for the bookcase");
  await page.getByLabel("Your message").fill("Hello, the bag of screws was missing from the box. Lucie");
  await page.locator("input[type=file]").setInputFiles(png);
  await page.waitForSelector(".picked li");
  await settled("form");
  expect((await page.locator(".picked").innerText()).includes("box.png"), "file listed");
  await page.waitForTimeout(3200);
  await page.getByRole("button", { name: "Send" }).click();
  await page.waitForURL(/\/t\/[A-Za-z0-9_-]{32}\?new=1/u);
  followUp = page.url().split("?")[0];
  const text = await page.locator("main").innerText();
  expect(text.includes("Thank you — we have your request"), "thanks");
  expect(text.includes("We also sent this link to lucie@example.com"), "emailed");
  const link = page.locator(".thread .files a", { hasText: "box.png" });
  expect(await link.count() === 1, "the customer sees their file");
  const file = await page.request.get(origin + await link.getAttribute("href"));
  expect(file.status() === 200 && (file.headers()["content-disposition"] ?? "").startsWith("attachment"), "their file downloads");
});

await step("a file of a kind not allowed is refused in plain words, nothing is sent", async () => {
  await page.goto(origin + "/");
  await page.locator("input[type=file]").setInputFiles({ name: "run.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ") });
  await page.waitForSelector(".picker .error");
  expect((await page.locator(".picker .error").innerText()).includes("cannot be added"), "type refused");
  expect(await page.locator(".picked li").count() === 0, "not listed");
});

await step("a customer adds a photo to a request with their link; another request's file stays out of reach", async () => {
  // Jean wrote in French: his page speaks French unless he switches.
  await page.goto(origin + "/t/demoLampFollowUpLinkForScreens00?lang=en");
  await page.getByPlaceholder("Add something, or answer our question.").fill("Here is the photo of the cracked base.");
  await page.locator("input[type=file]").setInputFiles(pdf("cracked-base.pdf"));
  await settled("form");
  await page.getByRole("button", { name: "Send" }).click();
  await page.waitForSelector("text=Sent. We will get back to you.");
  await page.waitForSelector(".thread .files a:has-text('cracked-base.pdf')");
  const href = await page.locator(".thread .files a", { hasText: "cracked-base.pdf" }).getAttribute("href");
  const id = href.split("/").pop();
  const other = await page.request.get(followUp + "/files/" + id);
  expect(other.status() === 404, "another link cannot open it");
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

await step("a customer who fixes a field and sends again at once is not taken for a robot (critique bug 1)", async () => {
  await page.goto(origin + "/");
  await page.waitForTimeout(1700);
  await page.getByLabel("Your email address").fill("marc.lenoir@gmail");
  await page.getByLabel("Subject").fill("Quick fix");
  await page.getByLabel("Your message").fill("Hello, a question about my order.");
  await page.getByRole("button", { name: "Send" }).click();
  await page.waitForSelector("p.error");
  expect((await page.locator("p.error").innerText()).includes("Check the email address"), "the real mistake is said, not 'too fast'");
  await page.getByLabel("Your email address").fill("marc.lenoir@gmail.com");
  await page.getByRole("button", { name: "Send" }).click();
  await page.waitForURL(/\/t\/[A-Za-z0-9_-]{32}\?new=1/u);
});

await step("the public part in French, by its switch", async () => {
  await page.goto(origin + "/");
  await page.getByRole("link", { name: "Français" }).click();
  await page.waitForURL(/\/\?lang=fr$/u);
  expect((await page.locator("h1").innerText()).includes("Contacter Atelier Martin"), "French title");
  expect((await page.locator("main").innerText()).includes("nous répondons sous un jour ouvré"), "the sentence in French");
  await page.getByRole("link", { name: "English" }).click();
});

await step("the customer writes again from their link", async () => {
  await page.goto(followUp);
  await page.getByPlaceholder("Add something, or answer our question.").fill("Also, one shelf is scratched.");
  await page.getByRole("button", { name: "Send" }).click();
  await page.waitForSelector("text=Sent. We will get back to you.");
  await page.waitForSelector(".thread :text('one shelf is scratched')", { timeout: 5000 }).catch(() => {});
  expect((await page.locator(".thread").innerText()).includes("one shelf is scratched"), "thread");
});

await step("an agent takes it, inserts a saved reply, sends it: the customer gets an email", async () => {
  await as(context, origin, "hugo");
  await page.goto(origin + "/chest");
  await page.locator(".ticket-row", { hasText: "Missing screws" }).first().click();
  await page.waitForURL(/\/chest\/tickets\/\d+/u);
  lucie = Number(page.url().split("/").pop());
  expect((await page.locator(".thread .files").first().innerText()).includes("box.png"), "the agent sees the customer's file");
  const opened = await page.request.get(origin + await page.locator(".thread .files a", { hasText: "box.png" }).getAttribute("href"));
  expect(opened.status() === 200, "the agent opens it (signed link)");
  await page.getByRole("button", { name: "Take it" }).click();
  await page.waitForTimeout(800);
  await page.getByText("Saved replies").click();
  await page.locator(".menu-pop button", { hasText: "Damaged item" }).click();
  expect((await page.locator("#answer").inputValue()).includes("Hello Lucie"), "saved reply filled");
  await page.locator(".composer input[type=file]").setInputFiles(pdf("return-label.pdf"));
  await settled(".composer");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.waitForSelector(".toast");
  await page.waitForTimeout(800);
  expect((await page.locator(".thread").innerText()).includes("Sent by email"), "delivery");
  expect((await page.locator(".thread .msg.team").last().innerText()).includes("return-label.pdf"), "the reply carries its file");
  const customer = await (await page.request.get(followUp)).text();
  expect(customer.includes("return-label.pdf"), "the customer sees the team's file");
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

await step("priority and tags: urgent in words, a tag made on the fly, the inbox filtered by both", async () => {
  await page.goto(origin + `/chest/tickets/${lucie}`);
  await page.getByLabel("Priority").selectOption("urgent");
  await page.waitForSelector(".toast:has-text('Priority: Urgent.')");
  expect((await page.locator(".ticket-head").innerText()).includes("Urgent"), "said in the head");
  await page.getByLabel("Add a tag").fill("Missing parts");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForSelector(".tag-list a:has-text('Missing parts')");
  await page.waitForTimeout(800);
  await page.goto(origin + "/chest?folder=mine");
  const row = page.locator(".ticket-row", { hasText: "Missing screws" });
  expect((await row.innerText()).includes("Urgent") && (await row.innerText()).includes("Missing parts"), "row shows priority and tag");
  await page.goto(origin + "/chest?folder=open");
  await page.locator(".filters select").first().selectOption("urgent");
  await page.waitForURL(/priority=urgent/u);
  const urgent = await page.locator(".tickets").innerText();
  expect(urgent.includes("Wrong address") && !urgent.includes("Invoice for order 4471"), "filtered by priority");
  await page.getByRole("link", { name: "Show all" }).click();
  await page.waitForURL(u => !u.search.includes("priority"));
  await page.goto(origin + `/chest/tickets/${lucie}`);
  await page.getByRole("link", { name: "Tickets tagged Missing parts" }).click();
  await page.waitForURL(/\/chest\?tag=/u);
  expect((await page.locator("h1").innerText()).includes("Missing parts"), "a tag's tickets");
  expect((await page.locator(".tickets").innerText()).includes("Missing screws"), "listed");
});

await step("waiting since: the invoice waiting over a day stands out", async () => {
  await page.goto(origin + "/chest?folder=open");
  const late = page.locator(".ticket-row", { hasText: "Invoice for order 4471" }).locator(".wait.late");
  expect(await late.count() === 1, "late highlighted");
  expect((await late.innerText()).includes("Waiting"), "in plain words");
  await page.goto(origin + `/chest/tickets/${lucie}`);
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

await step("the admin sets the waiting threshold, renames a tag and deletes one with undo (in French)", async () => {
  await page.goto(origin + "/chest/settings");
  await page.getByLabel("Signaler un client qui attend une réponse depuis plus de").selectOption("48");
  await page.waitForSelector(".toast:has-text('Enregistré.')");
  await page.goto(origin + "/chest?folder=open");
  expect(await page.locator(".ticket-row", { hasText: "Invoice for order 4471" }).locator(".wait.late").count() === 0, "not late at 48 h");
  await page.goto(origin + "/chest/settings");
  const field = page.locator("input[value='Missing parts']");
  await field.fill("Missing part");
  await field.locator("xpath=..").getByRole("button", { name: "Enregistrer" }).click();
  await page.waitForSelector(".toast:has-text('Enregistré.')");
  await page.waitForTimeout(600);
  const invoice = page.locator("input[value='Invoice']").locator("xpath=..");
  await invoice.getByRole("button", { name: "Supprimer" }).click();
  await page.waitForSelector(".toast:has-text('Étiquette « Invoice » supprimée.')");
  await page.locator(".toast button", { hasText: "Annuler" }).click();
  await page.waitForTimeout(1200);
  await page.reload();
  expect(await page.locator("input[value='Invoice']").count() === 1, "undo brought it back");
  expect(await page.locator("input[value='Missing part']").count() === 1, "renamed");
  await page.getByLabel("Signaler un client qui attend une réponse depuis plus de").selectOption("24");
  await page.waitForTimeout(800);
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

const devPage = async () => (await page.request.get(origin + "/_dev")).text();
const lastOption = (html, subject) => [...html.matchAll(/<option value="(msg_[a-z2-7]{26})">Reply to “([^”]*)”/gu)].find(m => m[2].includes(subject))?.[1];
let gift = 0;

await step("email: the customer answers the confirmation; it lands on the ticket; the agent's reply goes back on its thread", async () => {
  await as(context, origin, "hugo");
  await page.request.post(origin + "/_dev/receive", { form: { mailbox: "support", from: "tom.h@example.com", subject: "x", text: "Also: do you gift-wrap?", reply: lastOption(await devPage(), "Gift card"), back: "/_dev" } });
  await page.goto(origin + "/chest?q=tom.h@example.com");
  expect(await page.locator(".ticket-row", { hasText: "Gift card" }).count() === 1, "one ticket, not two");
  await page.locator(".ticket-row", { hasText: "Gift card" }).click();
  await page.waitForURL(/\/chest\/tickets\/\d+/u);
  gift = Number(page.url().split("/").pop());
  expect((await page.locator(".thread").innerText()).includes("do you gift-wrap"), "the answer is on the ticket");
  await page.locator("#answer").fill("Yes, and gift cards from 20 €.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.waitForSelector(".toast");
  const dev = await devPage();
  expect(new RegExp(`replies to <code>support\\+t${gift}-[a-z2-7]{10}@`, "u").test(dev), "the reply's address is the ticket's thread");
});

await step("email: an out-of-office answer is kept quietly and reopens nothing", async () => {
  await page.request.post(origin + "/_dev/receive", { form: { mailbox: "support", from: "tom.h@example.com", subject: "x", text: "I am away until Monday.", auto: "1", reply: lastOption(await devPage(), "Gift card"), back: "/_dev" } });
  await page.goto(origin + `/chest/tickets/${gift}`);
  expect((await page.locator(".side-card").innerText()).includes("Waiting for the customer"), "still waiting for the customer");
  expect(await page.locator(".msg.auto").count() === 1, "shown as an automatic reply");
});

await step("email: a bounce shows on the reply and the ticket; fixing the address clears it", async () => {
  const dev = await devPage();
  const sent = [...dev.matchAll(/<li><b>([^<]*)<\/b>(?:(?!<li>)[\s\S])*?name="message" value="(msg_[a-z2-7]{26})"/gu)].find(m => m[1].includes("Gift card") && m[1].startsWith("Re:"));
  await page.request.post(origin + "/_dev/bounce", { form: { message: sent[2], permanent: "1", back: "/_dev" } });
  await page.goto(origin + `/chest/tickets/${gift}`);
  expect((await page.locator(".notice.danger").innerText()).includes("do not arrive"), "the ticket says it");
  expect((await page.locator(".delivery.bounced").innerText()).includes("Not delivered"), "the reply says it");
  await page.getByRole("button", { name: "Change" }).click();
  await page.getByLabel("Customer’s email").fill("tom.hardy@example.com");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForSelector(".toast:has-text('Saved.')");
  await page.reload();
  expect(await page.locator(".notice.danger").count() === 0, "cleared");
});

await step("email: HTML shown on demand, the quoted history folded, links clickable", async () => {
  await page.goto(origin + "/chest/tickets/1002");
  expect(await page.locator(".bubble .quoted").count() === 1, "quoted text folded");
  expect(await page.locator(".bubble .body a[href^='https://pay.lumiere']").count() === 1, "link");
  await page.getByRole("button", { name: "Show formatting" }).click();
  expect(await page.locator(".bubble .body.html b").count() >= 1, "formatting shown");
});

await step("merge: the same customer's second request goes into the first; Undo splits them", async () => {
  await page.request.post(origin + "/_dev/receive", { form: { mailbox: "support", from: "tom.hardy@example.com", fromName: "Tom H", subject: "Gift wrap price", text: "How much is the gift wrap?", back: "/_dev" } });
  await page.goto(origin + "/chest?q=Gift wrap price");
  await page.locator(".ticket-row", { hasText: "Gift wrap price" }).click();
  await page.waitForURL(/\/chest\/tickets\/\d+/u);
  const second = Number(page.url().split("/").pop());
  await page.locator("summary", { hasText: "Merge" }).click();
  await page.getByLabel("Merge into ticket number").fill(String(gift));
  await page.getByRole("button", { name: "Merge", exact: true }).click();
  await page.waitForURL(new RegExp(`/chest/tickets/${gift}$`, "u"));
  await page.waitForSelector(`.thread .event:has-text('Ticket ${second} was merged')`);
  expect((await page.locator(".thread").innerText()).includes("How much is the gift wrap"), "messages combined");
  await page.locator(".toast button", { hasText: "Undo" }).click();
  await page.waitForURL(new RegExp(`/chest/tickets/${second}$`, "u"));
  await page.waitForTimeout(800);
  await page.reload();
  expect((await page.locator(".thread").innerText()).includes("How much is the gift wrap"), "split again");
});

await step("bulk: tick two tickets, close them, undo", async () => {
  await page.goto(origin + "/chest?folder=open");
  const rows = page.locator(".tickets li");
  const before = await rows.count();
  await rows.nth(0).locator(".row-check input").check();
  await rows.nth(1).locator(".row-check input").check();
  await page.waitForSelector(".bulk-bar:has-text('2 selected')");
  await page.locator(".bulk-bar").getByRole("button", { name: "Close" }).click();
  await page.waitForSelector(".toast:has-text('2 tickets changed.')");
  await page.waitForTimeout(800);
  expect(await page.locator(".tickets li").count() === before - 2, "closed");
  await page.locator(".toast button", { hasText: "Undo" }).click();
  await page.waitForTimeout(1200);
  await page.reload();
  expect(await page.locator(".tickets li").count() === before, "back");
});

await step("a saved view: filters kept under a name in the side column, for everyone", async () => {
  await page.goto(origin + "/chest?folder=open&priority=urgent");
  await page.locator("summary", { hasText: "Save this view" }).click();
  await page.getByLabel("Name of the view").fill("Urgent open");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForSelector(".toast:has-text('View saved.')");
  await page.waitForTimeout(800);
  await page.reload();
  await page.locator(".side nav a", { hasText: "Urgent open" }).click();
  await page.waitForURL(/priority=urgent/u);
  expect((await page.locator(".side nav a[aria-current=page]").innerText()).includes("Urgent open"), "current");
});

await step("keyboard: ? shows the shortcuts, j moves, c opens a new ticket", async () => {
  await page.goto(origin + "/chest?folder=open");
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("?");
  await page.waitForSelector("dialog.keys[open]");
  await page.keyboard.press("Escape");
  await page.keyboard.press("j");
  expect(await page.evaluate(() => document.activeElement?.classList.contains("ticket-row")), "focus on the first ticket");
  await page.keyboard.press("c");
  await page.waitForURL(/\/chest\/new$/u);
});

await step("an admin sets working hours and a rule on arrival; a new request follows the rule", async () => {
  await as(context, origin, "camille");
  await context.addCookies([{ name: "dev_locale", value: "en", url: origin }]);
  await page.goto(origin + "/chest/settings");
  await page.getByLabel("Open on Saturday").check();
  await page.getByRole("button", { name: "Save the hours" }).click();
  await page.waitForSelector(".toast:has-text('Saved.')");
  await page.getByRole("button", { name: /Add France’s public holidays/u }).click();
  await page.waitForTimeout(800);
  await page.getByLabel("Words, address or domain").fill("gift card");
  await page.getByLabel("Tag it").fill("Gift");
  await page.getByLabel("Priority", { exact: true }).selectOption("high");
  await page.getByRole("button", { name: "Add the rule" }).click();
  await page.waitForSelector(".rules li:has-text('Contains “gift card”')");
  await page.reload();
  expect(await page.locator(".holiday").count() >= 11, "holidays added");
  await page.request.post(origin + "/_dev/receive", { form: { mailbox: "support", from: "zoe@example.com", subject: "Gift card for my mother", text: "Can I buy a gift card online?", back: "/_dev" } });
  await page.goto(origin + "/chest?q=zoe@example.com");
  const row = await page.locator(".ticket-row").first().innerText();
  expect(row.includes("Gift") && row.includes("High"), "tag and priority from the rule");
});

await step("an admin allows the company's website to show the form; the code to paste is a plain frame", async () => {
  await page.goto(origin + "/chest/settings");
  await page.getByLabel("Websites allowed to show the form (one per line)").fill("https://www.atelier-martin.fr");
  await page.locator("form:has(#origins)").getByRole("button", { name: "Save" }).click();
  await page.waitForSelector(".toast:has-text('Saved.')");
  await page.reload();
  const code = await page.locator("#embed-code").inputValue();
  expect(code.startsWith("<iframe") && !code.includes("<script"), "a frame, no script");
  const headers = (await page.request.get(origin + "/?embed=1")).headers();
  expect(headers["content-security-policy"].includes("frame-ancestors https://www.atelier-martin.fr"), "the form may be framed there");
  expect((await page.request.get(origin + "/chest")).headers()["content-security-policy"].includes("frame-ancestors 'none'"), "never the team's pages");
});

await step("reports and the export for the admin", async () => {
  await page.goto(origin + "/chest/reports");
  expect((await page.locator("main, #main").first().innerText()).includes("New requests"), "reports");
  const zip = await page.request.get(origin + "/chest/export");
  expect(zip.status() === 200 && zip.headers()["content-type"] === "application/zip", "zip export");
  const body = (await zip.body()).toString("utf8");
  expect(body.includes("messages.csv") && body.includes("do you gift-wrap"), "the words of the messages are exported");
});

await step("the customer rates a closed request; the follow-up page speaks the request's language", async () => {
  await context.clearCookies();
  await page.goto(origin + "/t/demoLampFollowUpLinkForScreens00");
  expect((await page.locator("h1").innerText()).includes("Demande"), "French: the request was written in French");
  await as(context, origin, "hugo");
  await page.goto(origin + "/chest/tickets/1003");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.waitForTimeout(1000);
  await context.clearCookies();
  await page.goto(origin + "/t/demoFollowUpLinkForTheScreens000");
  await page.getByRole("button", { name: "Yes, thank you" }).click();
  await page.waitForSelector("text=Thank you for telling us.");
  await as(context, origin, "hugo");
});

await step("phone width: public form, inbox and ticket fit", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", followUp.replace(origin, ""), "/chest", "/chest/tickets/1003", "/chest/tickets/1002", "/chest/settings"]) {
    await page.goto(origin + path);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width <= 392, `${path} overflows: ${width}`);
  }
});

await browser.close();
done(problems);
