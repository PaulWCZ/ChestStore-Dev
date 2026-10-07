// Clients, as a sales team uses it, in a real browser:
//   node lab/chest-dev/flows/crm.mjs [port]   (harness with --reset: the sample client book is there)
import { writeFileSync } from "node:fs";
import { as, done, expect, id, open, step } from "./lib.mjs";

const port = Number(process.argv[2] ?? 4800);
const { browser, context, page, origin, problems } = await open(port, "hugo", { allow404: /\/chest\/contacts\/\d+$/u });
const tmp = process.env.FLOW_TMP ?? process.env.TMPDIR ?? "/tmp";
let companyUrl = "", dealUrl = "";
const dev = async () => (await page.request.get(origin + "/_dev")).text();
// What the harness page says, read again until it says it (or 15 s pass):
// on a busy machine the page can be read before the action it follows is
// over.
const devSays = async (test, message) => {
  const until = Date.now() + 15_000;
  for (;;) {
    if (test(await dev())) return;
    if (Date.now() > until) throw new Error(message);
    await page.waitForTimeout(250);
  }
};
const boardLane = name => page.locator(".lane", { has: page.locator("h2", { hasText: name }) });
// The board is ready to be used once its drag and drop is live: each card's
// keyboard instructions (its aria-describedby) are rendered by the page's
// script, not by the server — before that, a key or a drag does nothing.
const boardReady = () => page.waitForFunction(() => {
  const handle = document.querySelector(".deal-handle[aria-describedby]");
  const hint = handle && document.getElementById(handle.getAttribute("aria-describedby"));
  return Boolean(hint && hint.textContent.trim());
}).catch(error => { throw new Error("the board's drag and drop never came alive: " + error.message); });
// A move is saved when the server answered its action (the island's call()
// to /chest/actions/moveDeal): only then may the page be read again.
const moveSaved = () => page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/chest/actions/moveDeal", { timeout: 60_000 });
// A dragged card has landed when the copy that follows the pointer is gone
// (the drop animation is over and the drag has let go of the page).
const landed = () => page.locator(".deal-card.overlay").waitFor({ state: "detached" });

await step("My day: Hugo sees his late and today's next steps first", async () => {
  await page.goto(origin + "/chest");
  const text = await page.locator("main").innerText();
  expect(text.includes("First call: understand the need"), "late step");
  expect(text.includes("Confirm delivery date with Julien"), "today's step");
  expect(text.indexOf("LATE") < text.indexOf("TODAY"), "late first: " + text.slice(0, 200));
});

await step("a new company warns of a look-alike, then opens its page", async () => {
  await page.goto(origin + "/chest/companies");
  await page.getByRole("button", { name: "New company" }).click();
  await page.getByLabel("Name").fill("Boulangerie Durand");
  await page.waitForSelector(".lookalikes");
  expect((await page.locator(".lookalikes").innerText()).includes("Boulangeries Durand"), "look-alike shown");
  await page.getByLabel("Name").fill("Pharmacie Centrale");
  await page.getByLabel("Website").fill("pharmacie-centrale.fr");
  await page.getByLabel("Phone").fill("02 31 44 55 66");
  await page.getByRole("button", { name: "Add the company" }).click();
  await page.waitForURL(/\/chest\/companies\/\d+$/u);
  companyUrl = page.url();
  expect((await page.locator("h1").innerText()) === "Pharmacie Centrale", "company page");
});

await step("add a person there, then a deal for her", async () => {
  await page.getByRole("button", { name: "Add a person" }).click();
  await page.getByLabel("Name").fill("Aurélie Masson");
  // An address the browser takes but mail does not (no dot in the domain):
  // the package's field.email refuses it in plain words, nothing is added.
  await page.getByLabel("Email").fill("a.masson@pharmacie-centrale");
  await page.getByLabel("Job title").fill("Pharmacist, owner");
  await page.getByRole("button", { name: "Add the contact" }).click();
  await page.getByText("This email address does not look right.").first().waitFor();
  expect(await page.locator(".mini-list a:has-text('Aurélie Masson')").count() === 0, "nothing added with a wrong address");
  await page.getByLabel("Email").fill("A.Masson@Pharmacie-Centrale.fr");
  await page.getByRole("button", { name: "Add the contact" }).click();
  await page.waitForSelector(".mini-list a:has-text('Aurélie Masson')");
  await page.getByRole("button", { name: "New deal" }).click();
  await page.getByLabel("What are you selling?").fill("Dispensary counter and shelving");
  expect((await page.locator("#dl-company").inputValue()) === "Pharmacie Centrale", "the company is already there");
  await page.locator("#dl-contact").fill("Auré");
  await page.locator(".combo-list li", { hasText: "Aurélie Masson" }).click();
  await page.getByLabel("Amount (€, excl. tax)").fill("14 800,50");
  await page.getByRole("button", { name: "Create the deal" }).click();
  await page.waitForURL(/\/chest\/deals\/\d+$/u);
  dealUrl = page.url();
  const head = await page.locator(".record-head").innerText();
  expect(head.includes("€14,800.50"), "value: " + head);
  expect(head.includes("Pharmacie Centrale") && head.includes("Aurélie Masson"), "links");
});

await step("log a call in one tap (a button that says “Log a call”); the history shows it; Undo takes it back", async () => {
  await page.getByRole("button", { name: "Log a call", exact: true }).click();
  await page.waitForSelector(".ck-toast:has-text('Call logged')");
  await page.waitForSelector(".timeline .event.k-call");
  await page.locator(".ck-toast-undo").click();
  await page.waitForSelector(".ck-toast:has-text('Undone.')");
  await page.reload();
  expect(await page.locator(".timeline .event.k-call").count() === 0, "undone");
  await page.getByRole("textbox", { name: "What was said" }).fill("Wants the counter before the winter season.");
  await page.getByRole("button", { name: "Log a meeting", exact: true }).click();
  await page.waitForSelector(".event-body:has-text('before the winter season')");
});

await step("plan a next step; Done logs it and asks what comes next", async () => {
  await page.getByRole("button", { name: "Plan the next step" }).click();
  await page.getByLabel("What", { exact: true }).fill("Send the quote");
  await page.getByRole("button", { name: "Today" }).click();
  await page.getByRole("button", { name: "Plan it" }).click();
  await page.waitForSelector(".step-box .step-text:has-text('Send the quote')");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.waitForSelector("text=What’s next?");
  await page.getByLabel("What", { exact: true }).fill("Call back about the quote");
  await page.getByRole("button", { name: "In a week" }).click();
  await page.getByRole("button", { name: "Plan it" }).click();
  await page.waitForSelector(".step-box .step-text:has-text('Call back about the quote')");
  expect(await page.locator(".event.k-step:has-text('Send the quote')").count() === 1, "done step in the history");
});

await step("several next steps on one deal, one with a time", async () => {
  await page.getByRole("button", { name: "Plan another step" }).click();
  await page.getByLabel("What", { exact: true }).fill("Send fabric samples");
  await page.getByRole("button", { name: "Tomorrow" }).click();
  await page.locator("select[id^=step-time]").selectOption({ label: "14:30" });
  // With a time, the form says where it goes (the Chest's calendar works in the harness).
  expect((await page.locator(".step-form").innerText()).includes("it goes into your Chest calendar"), "the calendar promised");
  await page.getByRole("button", { name: "Plan it" }).click();
  await page.waitForSelector(".step-item:has-text('Send fabric samples')");
  expect(await page.locator(".step-item").count() === 2, "two open steps");
  expect((await page.locator(".step-item", { hasText: "Send fabric samples" }).innerText()).includes("14:30"), "its time");
  // In Hugo's Chest calendar, titled with the deal; done, it leaves it.
  const events = await dev();
  expect(/<b>Send fabric samples · [^<]+<\/b> <code>step:\d+<\/code>/u.test(events), "in the calendar");
  const samples = page.locator(".step-item", { hasText: "Send fabric samples" });
  await samples.getByRole("button", { name: "Done" }).click();
  await page.waitForSelector(".ck-toast:has-text('Done and logged.')");
  // Done: the step leaves the list (the page shows the saved state) — only
  // then does its coming back mean the Undo was saved.
  await samples.waitFor({ state: "detached" });
  await devSays(text => !text.includes("<b>Send fabric samples"), "out of the calendar once done");
  await page.locator(".ck-toast-undo").click();
  await samples.waitFor();
  await devSays(text => text.includes("<b>Send fabric samples"), "back with Undo");
});

await step("a closing day that cannot be read is refused as typed: the deal keeps its day, nothing is sent; corrected, it is saved in one move", async () => {
  // Kit 0.2.4–0.2.5: a refused day stays as typed, says why, and never
  // passes for the day the field held (the bug class where Timesheets
  // saved "today" in place of refusing). The deal's dialog is a form: its
  // submit stops on the field.
  const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const edit = async () => {
    await page.goto(dealUrl);
    await page.locator(".deal-actions .ck-menu button").first().click();
    await page.getByRole("menuitem", { name: "Edit the deal" }).click();
    await page.getByRole("dialog", { name: "Edit the deal" }).waitFor();
  };
  const shown = async () => (await page.locator("dt", { hasText: "Expected close" }).locator("xpath=following-sibling::dd[1]").innerText()).trim();
  await edit();
  await page.locator("#dl-close").fill(day(40));
  await page.locator("#dl-close").press("Tab");
  await page.getByRole("dialog", { name: "Edit the deal" }).getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForSelector(".ck-toast:has-text('Saved.')");
  await page.reload();
  const held = await shown();
  expect(/\d{4}/u.test(held), "a day held: " + held);
  await edit();
  await page.locator("#dl-close").fill("31/02/2027");
  await page.locator("#dl-close").press("Tab");
  const field = page.locator(".ck-date", { has: page.locator("#dl-close") });
  await field.locator(".ck-error").waitFor();
  expect(await page.locator("#dl-close").getAttribute("aria-invalid") === "true", "the field says it is refused");
  let sent = 0;
  const count = r => { if (r.method() === "POST" && r.url().startsWith(origin + "/chest")) sent++; };
  page.on("request", count);
  await page.getByRole("dialog", { name: "Edit the deal" }).getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(800);
  page.off("request", count);
  expect(sent === 0, "nothing sent: " + sent);
  expect(await page.getByRole("dialog", { name: "Edit the deal" }).isVisible(), "the dialog stays open");
  expect(await page.locator("#dl-close").inputValue() === "31/02/2027", "the text stays as typed");
  // Corrected and saved in one move (no blur first): the sentence goes
  // while typing (kit 0.2.5), leaving the field moves nothing under the
  // pointer, and the new day is saved.
  const save = page.getByRole("dialog", { name: "Edit the deal" }).getByRole("button", { name: "Save", exact: true });
  await page.locator("#dl-close").fill(day(70));
  const typed = await save.boundingBox();
  await page.locator("#dl-close").evaluate(el => el.blur());
  const left = await save.boundingBox();
  expect(Math.abs(typed.y - left.y) < 1, `leaving the field does not move Save (${typed.y} → ${left.y})`);
  await page.locator("#dl-close").focus();
  await save.click();
  await page.waitForSelector(".ck-toast:has-text('Saved.')");
  await page.reload();
  const now = await shown();
  expect(now !== held && now.includes(String(new Date(Date.now() + 70 * 864e5).getUTCFullYear())), `the corrected day saved: ${held} → ${now}`);
});

await step("Forms tells of someone who filled in the contact form: a new contact, unassigned, with one line of history; told again, nothing doubles; a known phone finds its contact", async () => {
  // The harness plays Forms (/_dev → Deliver an event of another tool).
  const answer = (id, contact, message) => ({ v: 1, form: { id: "5", title: "Contact us" }, answer: { id, at: new Date(Date.now() - 60000).toISOString(), language: "en", path: "/chest/forms/5/answers/" + id }, contact, message, member: null });
  const deliver = data => page.request.post(origin + "/_dev/deliver", { form: { type: "forms.contact", data: JSON.stringify(data) }, maxRedirects: 0 });
  const nina = answer("flowanswer000001", { name: "Nina Roux", email: "Nina.Roux@example.com", phone: "+33 6 98 76 54 31", company: "Roux Menuiserie" }, "Six oak chairs, please.");
  await deliver(nina);
  await page.goto(origin + "/chest/contacts?q=nina.roux");
  await page.locator("a.row-link", { hasText: "Nina Roux" }).first().click();
  await page.waitForURL(/\/chest\/contacts\/\d+$/u);
  const line = page.locator(".timeline .event.k-form");
  await line.waitFor();
  const text = await line.innerText();
  expect(text.includes("Filled in the form “Contact us”") && text.includes("Six oak chairs, please."), "the line and the message: " + text);
  // The form's name links to the answer in Forms, at Forms' address as the
  // Chest gives it (the harness installs Forms: CHEST_TOOL_URLS).
  expect(await line.getByRole("link", { name: "Contact us" }).getAttribute("href") === "https://forms-chest.chest.test/chest/forms/5/answers/flowanswer000001", "the link back to the answer in Forms");
  expect((await page.locator(".timeline").innerText()).includes("Added from the form “Contact us”"), "added from the form");
  const main = await page.locator("main").innerText();
  // The address as she wrote it, its domain lower-cased (field.email).
  expect(main.includes("Nina.Roux@example.com") && main.includes("Roux Menuiserie"), "email and company");
  // The same answer published again (another event id): one line still.
  await deliver(nina);
  await page.reload();
  expect(await page.locator(".timeline .event.k-form").count() === 1, "one line");
  await page.goto(origin + "/chest/contacts?q=nina.roux");
  expect(await page.locator("a.row-link", { hasText: "Nina Roux" }).count() === 1, "one contact");
  // A phone only, written the international way, and her name (word order
  // aside): the sample's Claire Durand (06 12 34 56 78) — her contact, not
  // a new one. (Round 3: a phone alone no longer decides; the name must
  // agree — see the next step.)
  await page.goto(origin + "/chest/contacts?q=Claire");
  const claires = await page.locator("a.row-link").count();
  await deliver(answer("flowanswer000002", { name: "DURAND Claire", email: null, phone: "+33 6 12 34 56 78", company: null }, "Is the order ready?"));
  await page.reload();
  expect(await page.locator("a.row-link").count() === claires, "no new contact");
  await page.locator("a.row-link", { hasText: "Claire Durand" }).first().click();
  await page.locator(".timeline .event.k-form", { hasText: "Is the order ready?" }).waitFor();
});

await step("privacy (round 3 blocker): Forms' real event for Nina Roux, whose phone is Claire Durand's, makes Nina a contact of her own marked 'maybe the same person'; her second answer finds her; nothing lands in Claire's file", async () => {
  const deliver = data => page.request.post(origin + "/_dev/deliver", { form: { type: "forms.contact", data: JSON.stringify(data) }, maxRedirects: 0 });
  // The event Forms published in the critic's run (critique3/sfch/published1.json).
  const real = { v: 1, form: { id: "101", title: "Contactez-nous" }, answer: { id: "s54tfe3tahshinv1", at: new Date(Date.now() - 120000).toISOString(), language: "fr", path: "/chest/forms/101/answers/s54tfe3tahshinv1" }, contact: { name: "Nina Roux", email: "nina.roux@gmail.com", phone: "06 12 34 56 78", company: null }, message: "Bonjour, je voudrais un devis pour six chaises en chêne.\nMerci", member: null };
  await deliver(real);
  const second = { ...real, answer: { ...real.answer, id: "second0000000002", at: new Date(Date.now() - 60000).toISOString(), path: "/chest/forms/101/answers/second0000000002" }, contact: { ...real.contact, email: "n.roux@roux-menuiserie.fr", company: "Roux Menuiserie" }, message: "Finalement 8 chaises, livraison avant Noël ?" };
  await deliver(second);
  await page.goto(origin + "/chest/contacts?q=Claire");
  await page.locator("a.row-link", { hasText: "Claire Durand" }).first().click();
  await page.waitForURL(/\/chest\/contacts\/\d+$/u);
  const claire = await page.locator(".timeline").innerText();
  expect(!claire.includes("six chaises") && !claire.includes("8 chaises"), "nothing of Nina's in Claire's file");
  await page.goto(origin + "/chest/contacts?q=nina.roux%40gmail.com");
  await page.locator("a.row-link", { hasText: "Nina Roux" }).first().click();
  await page.waitForURL(/\/chest\/contacts\/\d+$/u);
  const notice = await page.locator(".maybe-same").innerText();
  expect(notice.includes("Maybe the same person as Claire Durand"), "marked: " + notice);
  const lines = page.locator(".timeline .event.k-form");
  expect(await lines.count() === 2, "both her answers on her own file");
  const who = await lines.first().locator(".event-who").innerText();
  expect(who.includes("Nina Roux") && who.includes("n.roux@roux-menuiserie.fr") && who.includes("06 12 34 56 78"), "the line shows who filled it in: " + who);
  expect(await lines.first().locator(".event-who a[href^='tel:']").count() === 1 && await lines.first().locator(".event-who a[href^='mailto:']").count() === 1, "tap to call or write");
});

await step("My day: new contacts from the forms wait in the leads inbox; Hugo takes one and plans what's next", async () => {
  await page.goto(origin + "/chest");
  const box = page.locator(".leads");
  await box.waitFor();
  const text = await box.innerText();
  expect(/new from your forms/iu.test(text) && text.includes("Nina Roux") && text.includes("Maybe the same person as Claire Durand"), "inbox: " + text.slice(0, 600));
  const row = box.locator(".lead-row", { hasText: "nina.roux@gmail.com" });
  await row.getByRole("button", { name: "Take Nina Roux" }).click();
  await page.waitForSelector("text=What’s next?");
  await page.getByLabel("What", { exact: true }).fill("Call Nina about the chairs");
  await page.getByRole("button", { name: "Plan it" }).click();
  await page.waitForSelector(".step-text:has-text('Call Nina about the chairs')");
  expect(await page.locator(".lead-row", { hasText: "nina.roux@gmail.com" }).count() === 0, "off the inbox");
  await page.goto(origin + "/chest/contacts?q=nina.roux%40gmail.com");
  await page.locator("a.row-link", { hasText: "Nina Roux" }).first().click();
  expect((await page.locator(".owner-line").innerText()).includes("Hugo Bernard"), "Hugo's now");
});

await step("the manager: 'not a lead' with Undo, 'give to' someone who is told; 'not the same person'; the form answers to check", async () => {
  await as(context, origin, "camille");
  await context.addCookies([{ name: "dev_locale", value: "en", url: origin }]);
  const deliver = data => page.request.post(origin + "/_dev/deliver", { form: { type: "forms.contact", data: JSON.stringify(data) }, maxRedirects: 0 });
  const lead = (id, name, email) => ({ v: 1, form: { id: "5", title: "Contact us" }, answer: { id, at: new Date(Date.now() - 30000).toISOString(), language: "en", path: "/chest/forms/5/answers/" + id }, contact: { name, email, phone: null, company: null }, message: "Hello", member: null });
  await deliver(lead("flowlead00000001", "Spam Bot", "spam@example.com"));
  await deliver(lead("flowlead00000002", "Paul Lemaire", "paul.lemaire@example.com"));
  await page.goto(origin + "/chest");
  await page.locator(".lead-row", { hasText: "Spam Bot" }).getByRole("button", { name: "Spam Bot is not a lead" }).click();
  await page.waitForSelector(".ck-toast:has-text('Spam Bot is off the list.')");
  await page.locator(".ck-toast-undo").click();
  await page.waitForSelector(".ck-toast:has-text('Undone.')");
  await page.reload();
  expect(await page.locator(".lead-row", { hasText: "Spam Bot" }).count() === 1, "back after Undo");
  await page.locator(".lead-row", { hasText: "Paul Lemaire" }).getByRole("button", { name: "Give to…" }).click();
  await page.locator("#lead-give").fill("Inès");
  await page.locator(".ck-option", { hasText: "Inès Moreau" }).click();
  await page.getByRole("button", { name: "Give", exact: true }).click();
  await page.waitForSelector(".ck-toast:has-text('Paul Lemaire given to Inès Moreau.')");
  await devSays(text => text.includes("Camille Martin vous a confié un nouveau contact venu d’un formulaire"), "Inès told in French");
  // Nina's first contact (example.com, the step before) is a lead with no
  // mark; Nina of gmail is marked: Camille keeps them apart.
  await page.goto(origin + "/chest/contacts?q=nina.roux%40gmail.com");
  await page.locator("a.row-link", { hasText: "Nina Roux" }).first().click();
  await page.getByRole("button", { name: "Not the same person" }).click();
  await page.waitForSelector(".ck-toast:has-text('Kept apart.')");
  await page.reload();
  expect(await page.locator(".maybe-same").count() === 0, "the mark is gone");
  // My day tells the manager there are answers to check; the check lists
  // Nina's second answer (another email than her contact's).
  await page.goto(origin + "/chest");
  await page.getByRole("link", { name: /form answers? to check/u }).click();
  await page.waitForURL(/\/chest\/settings\/forms$/u);
  const row = page.locator(".check-row", { hasText: "n.roux@roux-menuiserie.fr" });
  expect((await row.innerText()).includes("The form gave another email than this contact’s."), "why");
  expect(await row.getByRole("link", { name: "Open the answer" }).getAttribute("href") === "https://forms-chest.chest.test/chest/forms/101/answers/second0000000002", "the answer in Forms");
  await row.getByRole("button", { name: "Right person" }).click();
  await page.waitForSelector(".ck-toast:has-text('Kept on Nina Roux.')");
  await page.reload();
  expect(await page.locator(".check-row", { hasText: "n.roux@roux-menuiserie.fr" }).count() === 0, "checked");
  // Back to Hugo, in his own language, for the steps that follow.
  await context.clearCookies({ name: "dev_locale" });
  await as(context, origin, "hugo");
});

await step("a new deal from My day: a company found by typing, or added on the spot", async () => {
  await page.goto(origin + "/chest");
  await page.getByRole("button", { name: "New deal" }).click();
  await page.getByLabel("What are you selling?").fill("Canteen tables");
  await page.locator("#dl-company").fill("Lefev");
  await page.waitForSelector(".combo-list li:has-text('Cabinet Lefèvre Avocats')");
  await page.locator("#dl-company").fill("Cantine Scolaire Martel");
  await page.locator(".combo-create").click();
  await page.waitForSelector(".ck-toast:has-text('Cantine Scolaire Martel')");
  expect((await page.locator("#dl-company").inputValue()) === "Cantine Scolaire Martel", "chosen");
  await page.getByRole("button", { name: "Create the deal" }).click();
  await page.waitForURL(/\/chest\/deals\/\d+$/u);
  expect((await page.locator(".record-head").innerText()).includes("Cantine Scolaire Martel"), "on the deal");
});

await step("a step of my own from My day", async () => {
  await page.goto(origin + "/chest");
  await page.getByRole("button", { name: "A step for me" }).click();
  await page.getByLabel("What", { exact: true }).fill("Prepare the trade show stand");
  await page.getByRole("button", { name: "Today" }).click();
  await page.getByRole("button", { name: "Plan it" }).click();
  await page.waitForSelector(".step-row:has-text('Prepare the trade show stand')");
  expect((await page.locator(".step-row", { hasText: "Prepare the trade show stand" }).innerText()).includes("My own"), "no client");
});

await step("a phone number pasted from a caller ID finds the company", async () => {
  await page.goto(origin + "/chest/search?q=0478421690");
  expect((await page.locator("main").innerText()).includes("Boulangeries Durand"), "found without spaces");
  await page.goto(origin + "/chest/search?q=" + encodeURIComponent("+33 4 78 42 16 90"));
  expect((await page.locator("main").innerText()).includes("Boulangeries Durand"), "found with +33");
});

await step("the board: drag a deal to the next stage with the mouse", async () => {
  await page.goto(origin + "/chest/deals");
  await boardReady();
  const card = page.locator(".deal-card", { hasText: "Dispensary counter" });
  const target = boardLane("Qualified").locator(".lane-deals");
  const a = await card.boundingBox(), b = await target.boundingBox();
  const saved = moveSaved();
  await page.mouse.move(a.x + 20, a.y + 10);
  await page.mouse.down();
  await page.mouse.move(a.x + 40, a.y + 20, { steps: 5 });
  await page.mouse.move(b.x + 40, b.y + 20, { steps: 15 });
  await page.mouse.up();
  expect((await saved).ok(), "the move is saved");
  await page.reload();
  expect((await boardLane("Qualified").innerText()).includes("Dispensary counter"), "moved to Qualified");
});

await step("the board: move a deal with the keyboard, then to Won with a reason", async () => {
  // Under load (a busy machine), each wait is on what the page says, never
  // on time: the board live, the move saved, the card landed, the words in.
  await boardReady();
  await boardLane("Qualified").locator(".deal-handle", { hasText: "Dispensary counter" }).focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  const saved = moveSaved();
  await page.keyboard.press("Space");
  expect((await saved).ok(), "the move is saved");
  await page.reload();
  await boardReady();
  expect((await boardLane("Proposal").innerText()).includes("Dispensary counter"), "moved to Proposal");
  const card = page.locator(".deal-card", { hasText: "Dispensary counter" });
  const target = boardLane("Won").locator(".lane-deals");
  const a = await card.boundingBox(), b = await target.boundingBox();
  await page.mouse.move(a.x + 20, a.y + 10);
  await page.mouse.down();
  await page.mouse.move(a.x + 40, a.y + 20, { steps: 5 });
  await page.mouse.move(b.x + 40, b.y + 20, { steps: 20 });
  await page.mouse.up();
  await page.waitForSelector("dialog[open]");
  // Typing before the card landed would be undone: while a drag lasts (and
  // 50 ms after), dnd-kit clears any text selection, the one a fill makes
  // too. A person is never that fast; the dialog's field has the focus.
  await landed();
  expect(await page.evaluate(() => document.activeElement?.id === "reason"), "the dialog opens on its field");
  await page.getByLabel("A few words help the team next time.").fill("Fast delivery promised");
  await page.waitForFunction(() => document.querySelector("dialog[open] #reason")?.value === "Fast delivery promised")
    .catch(async error => { throw new Error(`the reason typed is not in its field (${JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("#reason")].map(r => r.value)))}): ` + error.message); });
  await page.locator("dialog[open]").getByRole("button", { name: "Won" }).click();
  await page.waitForSelector(".ck-toast:has-text('Won! Well done.')");
  await page.reload();
  expect((await boardLane("Won").innerText()).includes("Dispensary counter"), "won");
  await page.goto(dealUrl);
  const told = await dev();
  expect(told.includes("crm.deal.won") && told.includes("Dispensary counter and shelving") && told.includes("1480050"), "Quotes is told of the won deal");
  const note = await page.locator(".closed-note").innerText();
  expect(note.includes("Fast delivery promised"), "reason kept: " + note);
});

await step("Hugo cannot move Inès's deals; he sees them", async () => {
  await page.goto(origin + "/chest/deals");
  expect(await page.locator("li.locked", { hasText: "Head office fit-out" }).count() === 1, "locked card");
  await page.locator(".deal-card", { hasText: "Head office fit-out" }).click();
  await page.waitForURL(/\/chest\/deals\/\d+$/u);
  expect((await page.locator(".notice").innerText()).includes("Inès Moreau or a manager"), "read-only notice");
  expect(await page.getByRole("button", { name: "Won" }).count() === 0, "no Won button");
});

await step("the manager gives Inès a deal: she is told in French", async () => {
  await as(context, origin, "camille");
  await page.goto(dealUrl);
  await page.getByRole("button", { name: "Rouvrir" }).click();
  await page.waitForSelector(".ck-toast");
  expect((await dev()).includes("crm.deal.reopened"), "Quotes is told it was reopened");
  // The owner is the kit's people picker: type, choose, saved at once.
  await page.locator("#deal-owner").fill("Inès");
  await page.locator(".ck-option", { hasText: "Inès Moreau" }).click();
  await devSays(text => text.includes("Camille Martin vous a confié une affaire"), "French bell item");
});

await step("search with the / key, accents and case aside", async () => {
  await as(context, origin, "hugo");
  await page.goto(origin + "/chest/deals");
  // The "/" shortcut is bound once the page's script runs: wait for it, as a person would press again.
  await page.waitForLoadState("networkidle");
  const focused = () => page.evaluate(() => document.activeElement?.classList.contains("ck-search-input") && document.activeElement.closest(".ck-bar") !== null);
  for (let i = 0; i < 5 && !(await focused()); i++) { await page.keyboard.press("/"); await page.waitForTimeout(200); }
  expect(await page.evaluate(() => document.activeElement?.classList.contains("ck-search-input") && document.activeElement.closest(".ck-bar") !== null), "the header's search box is focused");
  await page.keyboard.type("cherif");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/chest\/search\?q=cherif/u);
  expect((await page.locator("main").innerText()).includes("Dr Nadia Chérif"), "found");
});

await step("import a HubSpot contacts export: columns matched, previewed, imported", async () => {
  const file = tmp + "/hubspot-contacts.csv";
  writeFileSync(file, "Record ID,First Name,Last Name,Email,Phone Number,Job Title,Company Name,Contact owner\n901,Gaëlle,Perrin,g.perrin@fromagerie-perrin.fr,04 50 11 22 33,Buyer,Fromagerie Perrin,Inès Moreau\n902,Claire,Durand,claire.durand@durand-boulangeries.fr,,,,\n");
  await page.goto(origin + "/chest/import");
  await page.locator(".source", { hasText: "Spreadsheet" }).locator("input[type=file]").setInputFiles(file);
  await page.waitForSelector(".mapping table");
  expect((await page.locator("#map-1").inputValue()) === "firstName", "first name guessed");
  expect((await page.locator(".preview table").innerText()).includes("g.perrin@fromagerie-perrin.fr"), "preview");
  await page.getByRole("button", { name: /^Import · 2 rows$/u }).click();
  await page.waitForSelector("text=Imported: 1 new, 1 already here.");
  await page.goto(origin + "/chest/contacts?q=perrin");
  expect((await page.locator(".rows").innerText()).includes("Gaëlle Perrin"), "imported");
});

await step("import a HubSpot file: unknown columns kept in the notes, unknown owners said, then Undo this import", async () => {
  const file = tmp + "/hubspot-more.csv";
  writeFileSync(file, "Record ID,First Name,Last Name,Email,Company Name,Contact owner,Lifecycle Stage,Create Date\n7001,Bastien,Roche,b.roche@roche-menuiserie.fr,Menuiserie Roche,Paul Witczak,Customer,2024-03-02\n7002,Emma,Vial,emma@vial-conseil.fr,Vial Conseil,Paul Witczak,Lead,2025-01-20\n");
  await page.goto(origin + "/chest/import");
  await page.locator(".source", { hasText: "Spreadsheet" }).locator("input[type=file]").setInputFiles(file);
  await page.waitForSelector(".mapping table");
  expect((await page.locator("#map-6").inputValue()) === "keep", "Lifecycle Stage goes to the notes");
  await page.waitForSelector(".owners-check:has-text('Paul Witczak')");
  await page.getByRole("button", { name: /^Import · 2 rows$/u }).click();
  await page.waitForSelector("text=Imported: 2 new, 0 already here.");
  const report = await page.locator(".report-panel").innerText();
  expect(report.includes("Kept in the notes: Record ID, Lifecycle Stage."), "kept: " + report);
  expect(report.includes("Paul Witczak (2 rows)"), "owners said");
  await page.goto(origin + "/chest/contacts?q=roche");
  await page.locator(".row-link", { hasText: "Bastien Roche" }).click();
  await page.waitForURL(/\/chest\/contacts\/\d+$/u);
  expect((await page.locator("main").innerText()).includes("Lifecycle Stage: Customer"), "in the notes");
  await page.goto(origin + "/chest/import");
  await page.locator(".mini-list li", { hasText: "hubspot-more.csv" }).getByRole("button", { name: "Undo this import" }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Undo this import" }).click();
  await page.waitForSelector(".ck-toast:has-text('Import undone')");
  await page.goto(origin + "/chest/contacts?q=roche");
  expect(await page.locator(".row-link", { hasText: "Bastien Roche" }).count() === 0, "taken back");
});

await step("an imported history with a to-do years ahead: the Chest refuses that one event, the others still reach the calendar (putMany per event, SDK studio.16)", async () => {
  const inDays = n => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const file = tmp + "/pipedrive-activities.csv";
  writeFileSync(file, `Subject,Due date,Done,Person email\nTaste the new cheeses,${inDays(2)} 10:00,Not done,g.perrin@fromagerie-perrin.fr\nVisit the cellar,${inDays(3)} 11:00,Not done,g.perrin@fromagerie-perrin.fr\nRenew the contract,${inDays(3 * 365 + 5)} 09:00,Not done,g.perrin@fromagerie-perrin.fr\n`);
  await page.goto(origin + "/chest/import");
  await page.locator("label.ck-segment", { hasText: "History" }).click();
  expect(await page.getByRole("radio", { name: "History" }).isChecked(), "History chosen");
  await page.locator(".source", { hasText: "Spreadsheet" }).locator("input[type=file]").setInputFiles(file);
  await page.waitForSelector(".mapping table");
  await page.getByRole("button", { name: /^Import · 3 rows$/u }).click();
  await page.waitForSelector(".report-panel");
  // All three are next steps of Gaëlle Perrin's; two in Hugo's calendar,
  // the one three years ahead not (the Chest's calendar holds two years).
  await devSays(text => text.includes("<b>Taste the new cheeses · Gaëlle Perrin</b>") && text.includes("<b>Visit the cellar · Gaëlle Perrin</b>"), "the two near to-dos in the calendar");
  expect(!(await dev()).includes("Renew the contract"), "the far one is not in the calendar");
  await page.goto(origin + "/chest/contacts?q=perrin");
  await page.locator(".row-link", { hasText: "Gaëlle Perrin" }).click();
  await page.waitForURL(/\/chest\/contacts\/\d+$/u);
  const main = await page.locator("main").innerText();
  expect(main.includes("Renew the contract") && main.includes("Visit the cellar"), "all three stand as next steps");
  // Taken back: the steps and their events go.
  await page.goto(origin + "/chest/import");
  await page.locator(".mini-list li", { hasText: "pipedrive-activities.csv" }).getByRole("button", { name: "Undo this import" }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Undo this import" }).click();
  await page.waitForSelector(".ck-toast:has-text('Import undone')");
  await devSays(text => !text.includes("Taste the new cheeses") && !text.includes("Visit the cellar"), "out of the calendar once undone");
});

await step("select contacts, tag them at once", async () => {
  await page.goto(origin + "/chest/contacts?q=durand");
  await page.getByLabel("Select this page").check();
  await page.waitForSelector(".bulk-bar");
  await page.locator(".bulk-bar").getByRole("button", { name: "Add a tag" }).click();
  await page.locator("#bulk-tag").fill("Salon 2026");
  await page.locator(".bulk-bar").getByRole("button", { name: "Apply" }).click();
  await page.waitForSelector(".ck-toast:has-text('changed')");
  await page.goto(origin + "/chest/contacts?tag=Salon%202026");
  expect((await page.locator(".rows").innerText()).includes("Claire Durand"), "tagged");
});

await step("a file on a deal: sent to the Chest, listed, opened", async () => {
  const file = tmp + "/signed-quote.pdf";
  writeFileSync(file, "%PDF-1.4\n% signed quote\n");
  await page.goto(dealUrl);
  await page.locator(".files-panel input[type=file]").setInputFiles(file);
  await page.waitForSelector(".file-list a:has-text('signed-quote.pdf')");
  const href = await page.locator(".file-main a", { hasText: "signed-quote.pdf" }).getAttribute("href");
  const opened = await page.request.get(origin + href, { maxRedirects: 0 });
  expect(opened.status() === 303, "a fresh link: " + opened.status());
});

await step("import an address book (vCard) and download one back", async () => {
  const file = tmp + "/phone.vcf";
  writeFileSync(file, "BEGIN:VCARD\r\nVERSION:3.0\r\nN:Lambert;Yves;;;\r\nFN:Yves Lambert\r\nORG:Menuiserie Lambert\r\nTEL;TYPE=CELL:06 70 80 90 10\r\nEND:VCARD\r\n");
  await page.goto(origin + "/chest/import");
  await page.locator(".source", { hasText: "Address book" }).locator("input[type=file]").setInputFiles(file);
  await page.getByRole("button", { name: /^Import · 1 contact$/u }).click();
  await page.waitForSelector("text=Imported: 1 new, 0 already here.");
  await page.goto(origin + "/chest/contacts?q=lambert");
  await page.locator(".row-link", { hasText: "Yves Lambert" }).click();
  await page.waitForURL(/\/chest\/contacts\/\d+$/u);
  const card = await (await page.request.get(page.url() + "/vcard")).text();
  expect(card.includes("FN:Yves Lambert") && card.includes("VERSION:4.0"), "vcard");
});

await step("exports: the deals list as CSV, formulas neutralised", async () => {
  await page.goto(origin + "/chest/deals?view=list&status=any");
  expect((await page.locator("table").innerText()).includes("Dispensary counter"), "list");
  const csv = await (await page.request.get(origin + "/chest/export/deals?status=any")).text();
  expect(csv.startsWith("﻿Title,Company,Contact,Value"), "headers");
  expect(csv.includes("Dispensary counter and shelving,Pharmacie Centrale,Aurélie Masson,14800.50"), "row: " + csv.split("\r\n")[1]);
});

await step("who may download the lists: a viewer may not by default; a manager lets everyone, then takes it back", async () => {
  // Camille reads French: the page in English for these labels.
  await context.addCookies([{ name: "dev_locale", value: "en", url: origin }]);
  await as(context, origin, "lea");
  expect((await page.request.get(origin + "/chest/export/companies")).status() === 403, "viewer refused");
  await as(context, origin, "camille");
  await page.goto(origin + "/chest/settings");
  await page.locator("#export-who").selectOption("everyone");
  await page.getByRole("button", { name: "Save", exact: true }).last().click();
  await page.waitForLoadState();
  expect((await page.locator("#export-who").inputValue()) === "everyone", "saved");
  await as(context, origin, "lea");
  await page.goto(origin + "/chest/companies");
  expect(await page.getByRole("link", { name: "Export CSV" }).first().isVisible(), "the viewer's export link");
  expect((await page.request.get(origin + "/chest/export/companies")).status() === 200, "viewer allowed");
  await as(context, origin, "camille");
  await page.goto(origin + "/chest/settings");
  await page.locator("#export-who").selectOption("sales");
  await page.getByRole("button", { name: "Save", exact: true }).last().click();
  await page.waitForLoadState();
  await context.clearCookies({ name: "dev_locale" });
  await as(context, origin, "hugo");
});

await step("GDPR: a person's data is exported, then deleted for good", async () => {
  await page.goto(origin + "/chest/contacts?q=masson");
  await page.locator(".row-link", { hasText: "Aurélie Masson" }).click();
  await page.waitForURL(/\/chest\/contacts\/\d+$/u);
  const contactUrl = page.url();
  const data = JSON.parse(await (await page.request.get(contactUrl + "/data")).text());
  expect(data.contact.email === "A.Masson@pharmacie-centrale.fr" && data.deals.length === 1, "export");
  expect(data.activities.some(a => a.text.includes("winter season")), "what was written about her");
  await page.getByRole("button", { name: "Erase this person" }).click();
  await page.getByRole("button", { name: "Erase", exact: true }).click();
  await page.waitForURL(/\/chest\/contacts$/u);
  const gone = await page.request.get(contactUrl);
  expect(gone.status() === 404, "gone: " + gone.status());
  await page.goto(dealUrl);
  expect(!(await page.locator("main").innerText()).includes("winter season"), "her notes are gone too");
});

await step("a viewer reads everything and changes nothing", async () => {
  await as(context, origin, "lea");
  await page.goto(origin + "/chest/deals");
  expect(await page.getByRole("button", { name: "Nouvelle affaire" }).count() === 0, "no new deal");
  expect(await page.locator("li.locked").count() > 0, "every card locked");
  await page.goto(dealUrl);
  expect(await page.locator(".composer").count() === 0, "no composer");
  await page.goto(origin + "/chest/settings");
  expect((await page.locator("main").innerText()).includes("Seuls les managers"), "stages read-only");
});

await step("a viewer's home is the team's pipeline, not a to-do list", async () => {
  await page.goto(origin + "/chest");
  const text = (await page.locator("main").innerText()).toLowerCase();
  expect(text.includes("affaires en cours") && text.includes("dernières affaires gagnées"), "team home");
  expect(!text.includes("préparez vos prochains appels"), "not told to do what she cannot");
});

await step("the manager adds a field, fills it, filters by it, exports it", async () => {
  await as(context, origin, "camille");
  await context.addCookies([{ name: "dev_locale", value: "en", url: origin }]);
  await page.goto(origin + "/chest/settings/fields");
  await page.locator("#new-companies").fill("Payment terms");
  await page.locator("#kind-companies").selectOption("choice");
  await page.locator("#opts-companies").fill("30 days\n45 days\n60 days");
  await page.locator("form.add-field").first().getByRole("button", { name: "Add the field" }).click();
  await page.waitForSelector(".ck-toast:has-text('Field added.')");
  await page.goto(companyUrl);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Payment terms").selectOption("45 days");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForSelector(".facts:has-text('45 days')");
  await page.goto(origin + "/chest/companies");
  await page.locator("#f-cf").selectOption({ label: "Payment terms" });
  await page.waitForSelector("#f-cv");
  await page.locator("#f-cv").selectOption("45 days");
  await page.waitForURL(/cv=45/u);
  const rows = await page.locator(".rows").innerText();
  expect(rows.includes("Pharmacie Centrale") && !rows.includes("Boulangeries Durand"), "filtered: " + rows);
  const csv = await (await page.request.get(origin + "/chest/export/companies")).text();
  expect(csv.split("\r\n")[0].includes("Payment terms") && csv.includes("45 days"), "exported");
});

await step("merge a duplicate company: its deals and history move", async () => {
  await page.goto(origin + "/chest/companies");
  await page.getByRole("button", { name: "New company" }).click();
  await page.getByLabel("Name").fill("Pharmacie Centrale SARL");
  await page.getByRole("button", { name: "Add the company" }).click();
  await page.waitForURL(/\/chest\/companies\/\d+$/u);
  await page.getByRole("button", { name: "Log a call", exact: true }).click();
  await page.waitForSelector(".timeline .event.k-call");
  await page.locator(".record-bar .ck-menu button").first().click();
  await page.getByRole("menuitem", { name: "Merge with a duplicate" }).click();
  await page.locator("#merge-into").fill("Pharmacie Centrale");
  await page.locator(".combo-list li", { hasText: /^Pharmacie Centrale/u }).first().click();
  await page.locator("dialog[open]").getByRole("button", { name: "Merge", exact: true }).click();
  await page.waitForURL(companyUrl);
  const text = await page.locator("main").innerText();
  expect(text.includes("merged “Pharmacie Centrale SARL” into it"), "said in the history");
});

await step("the Team page: pipeline by person, won and lost by month", async () => {
  await page.goto(origin + "/chest/team");
  const text = (await page.locator("main").innerText()).toLowerCase();
  expect(text.includes("open deals by person") && text.includes("hugo bernard") && text.includes("win rate"), "report: " + text.slice(0, 200));
});

await step("the Team page's Monday numbers: what each person logged this week, last week; stage to stage", async () => {
  // A call logged now counts in this week's line of its author.
  await as(context, origin, "hugo");
  await page.goto(dealUrl);
  await page.getByRole("button", { name: "Log a call", exact: true }).click();
  await page.waitForSelector(".ck-toast:has-text('Call logged')");
  await as(context, origin, "camille");
  await context.addCookies([{ name: "dev_locale", value: "en", url: origin }]);
  await page.goto(origin + "/chest/team");
  const week = page.locator("section", { has: page.locator("#r-week") });
  const text = await week.innerText();
  expect(/logged, week by week/iu.test(text) && /calls/iu.test(text) && /meetings/iu.test(text), "the week's table: " + text.slice(0, 300));
  const hugoRow = await week.locator("tr", { hasText: "Hugo Bernard" }).innerText();
  expect(/\b[1-9]\d*\b/u.test(hugoRow), "Hugo's calls this week: " + hugoRow);
  await week.getByRole("link", { name: "Last week" }).click();
  await page.waitForURL(/week=1$/u);
  expect((await page.locator("#r-week").count()) === 1, "last week shown");
  const conv = await page.locator("section", { has: page.locator("#r-conversion") }).innerText();
  expect(/from stage to stage/iu.test(conv) && /reached it/u.test(conv) && /went on/u.test(conv), "conversion: " + conv.slice(0, 300));
});

await step("the manager exports the whole client book as one ZIP", async () => {
  const zip = await page.request.get(origin + "/chest/export/all");
  expect(zip.status() === 200 && zip.headers()["content-type"] === "application/zip", "zip");
  const body = await zip.body();
  expect(body.includes(Buffer.from("activities.csv")) && body.includes(Buffer.from("Pharmacie Centrale")), "contents");
  await context.clearCookies({ name: "dev_locale" });
});

await step("the manager renames a stage: everyone reads the new name", async () => {
  await as(context, origin, "camille");
  await page.goto(origin + "/chest/settings");
  const field = page.locator(".stage-row").nth(1).locator("input").first();
  await field.fill("Rendez-vous fait");
  await field.blur();
  await page.waitForSelector(".ck-toast");
  await as(context, origin, "hugo");
  await page.goto(origin + "/chest/deals");
  expect((await page.locator(".lane h2").allTextContents()).join("|").includes("Rendez-vous fait"), "renamed");
});

await step("someone leaves: their deals go unassigned and the manager is told", async () => {
  await page.request.post(origin + "/_dev/event", { form: { type: "member.removed", member: id("sofia") } });
  await page.waitForTimeout(800);
  await page.goto(origin + "/chest/deals?view=list&owner=none");
  expect((await page.locator("table").innerText()).includes("Open space acoustic panels"), "unassigned");
  expect(/est parti[ \u202f\u00a0]: ses clients n’ont plus de responsable/u.test(await dev()), "managers told (Camille reads French)");
  await page.goto(origin + "/chest/deals");
  await page.locator(".deal-card", { hasText: "Open space acoustic panels" }).click();
  await page.getByRole("button", { name: "Take it" }).click();
  await page.waitForSelector(".ck-toast:has-text('It’s yours now.')");
});

await step("the weekday morning puts each person's due steps in their bell", async () => {
  await page.request.post(origin + "/_dev/schedule", { form: { name: "morning" } });
  await page.waitForTimeout(800);
  const text = await dev();
  expect(/prochaines? étapes? pour aujourd’hui/u.test(text), "Inès's digest in French");
});

await step("French: Inès's day and contacts in her language", async () => {
  await as(context, origin, "ines");
  await page.goto(origin + "/chest/contacts");
  const text = await page.locator("main").innerText();
  expect(text.includes("Nouveau contact") && text.includes("Exporter en vCard"), "French");
});

await step("phone width: My day first, labelled sections under the header, nothing overflows; the board scrolls sideways", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/chest", "/chest/deals", "/chest/contacts", "/chest/companies", dealUrl.replace(origin, ""), companyUrl.replace(origin, "")]) {
    await page.goto(origin + path);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width <= 392, `${path} overflows: ${width}`);
  }
  expect(await page.locator(".ck-bar-nav .ck-nav").isVisible(), "sections under the header");

  await page.goto(origin + "/chest");
  await page.locator(".ck-nav a", { hasText: "Affaires" }).click();
  await page.waitForURL(/\/chest\/deals$/u);
  // On a phone the stages are a list to choose from; Won is quiet at the first stage.
  await as(context, origin, "hugo");
  await page.goto(origin + "/chest/deals?view=list&status=any&owner=me");
  await page.locator("table a", { hasText: "Workshop office and lockers" }).click();
  await page.waitForURL(/\/chest\/deals\/\d+$/u);
  expect(await page.locator("#deal-stage").isVisible(), "stage list");
  expect(!(await page.locator(".stage-path").isVisible()), "no clipped path");
  expect((await page.locator(".deal-actions button", { hasText: "Won" }).getAttribute("class")).includes("quiet"), "Won is quiet at Lead");
  await page.goto(companyUrl);
  expect(await page.locator(".record-bar .danger-text").count() === 0, "no red Delete under the name");
});

await step("phone: the filters wait behind one button; the first company is near the top", async () => {
  await as(context, origin, "hugo");
  await context.addCookies([{ name: "dev_locale", value: "en", url: origin }]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/chest/companies");
  expect(!(await page.locator("#f-owner").isVisible()), "owner filter tucked away");
  expect(!(await page.getByRole("link", { name: "Export CSV" }).isVisible()), "export tucked away");
  const first = await page.locator(".rows li").first().boundingBox();
  expect(first && first.y < 480, "first company at " + first?.y);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.locator("#f-owner").selectOption("me");
  await page.waitForURL(/owner=me/u);
  expect(await page.getByRole("button", { name: "Filters (1)" }).isVisible(), "the button counts what is on");
});

await step("phone: back from a call, the page asks to log it", async () => {
  await page.goto(origin + "/chest/contacts?q=Claire");
  await page.locator(".rows a", { hasText: "Claire Durand" }).first().click();
  await page.waitForURL(/\/chest\/contacts\/\d+$/u);
  // The dialler opens outside the browser; here the tap is remembered, and
  // the prompt comes when the page is seen again.
  await page.evaluate(() => { document.querySelector("a[href^='tel:']")?.addEventListener("click", e => e.preventDefault(), { once: true }); });
  await page.locator("a[href^='tel:']").first().click();
  expect(await page.locator(".call-prompt").count() === 0, "not at once");
  await page.waitForTimeout(5300);
  await page.reload();
  await page.waitForSelector(".call-prompt");
  expect((await page.locator(".call-prompt").innerText()).includes("You called Claire Durand. Log the call?"), "asked");
  await page.getByPlaceholder("What was said? (optional)").fill("Agreed to see the 3D plan on Thursday");
  await page.getByRole("button", { name: "Log the call" }).click();
  await page.waitForSelector(".ck-toast:has-text('logged')");
  await page.reload();
  expect(await page.locator(".call-prompt").count() === 0, "asked once");
  expect((await page.locator(".timeline, main").first().innerText()).includes("Agreed to see the 3D plan on Thursday"), "in the history");
  // "Not now" forgets it.
  await page.evaluate(() => { document.querySelector("a[href^='tel:']")?.addEventListener("click", e => e.preventDefault(), { once: true }); });
  await page.locator("a[href^='tel:']").first().click();
  await page.waitForTimeout(5300);
  await page.reload();
  await page.getByRole("button", { name: "Not now" }).click();
  await page.reload();
  expect(await page.locator(".call-prompt").count() === 0, "dismissed for good");
});

await step("seeded names in the reader's language: the sample's fields, tags and industries read in French", async () => {
  await as(context, origin, "ines");
  await context.addCookies([{ name: "dev_locale", value: "fr", url: origin }]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(origin + "/chest/companies?q=Durand");
  const row = await page.locator(".rows li", { hasText: "Boulangeries Durand" }).innerText();
  expect(row.includes("Commerce alimentaire") && row.includes("grand compte"), "industry and tags in French: " + row);
  await page.goto(origin + "/chest/deals?view=list&status=any");
  await page.locator("table a", { hasText: "Head office fit-out" }).click();
  await page.waitForURL(/\/chest\/deals\/\d+$/u);
  await page.locator("dt", { hasText: "Concurrent" }).waitFor({ timeout: 8000 });
  expect(await page.locator("dt", { hasText: "Livraison souhaitée le" }).count() === 1, "own fields in French");
});

// Booking → Clients (booking.confirmed / booking.cancelled, Booking's
// README "With the other tools"): the harness plays Booking.
const booked = (booking, extra = {}) => {
  const start = extra.start ?? new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 1, 8, 0));
  return { v: 1, booking, status: "confirmed", at: new Date(Date.now() - 60000).toISOString(), host: "mbr_hugo" + "a".repeat(22), start: start.toISOString(), end: new Date(start.getTime() + 3600000).toISOString(), type: { id: "3", name: { en: "Project call", fr: "Appel projet" } }, kind: "video", contact: { name: "Sarah Klein", email: "Sarah.Klein@example.com", phone: null, company: null, language: "en" }, source: "page", moves: 0, path: "/chest/bookings/" + booking, ...extra };
};
const tellBooking = data => page.request.post(origin + "/_dev/deliver", { form: { type: data.status === "cancelled" ? "booking.cancelled" : "booking.confirmed", data: JSON.stringify(data) }, maxRedirects: 0 });

await step("Booking tells Clients a guest booked Hugo: a contact of Hugo's, the meeting in his My day and on her history, linking back to Booking; a move replaces its time, a repeat changes nothing", async () => {
  await as(context, origin, "hugo");
  await context.addCookies([{ name: "dev_locale", value: "en", url: origin }]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await tellBooking(booked("9001"));
  await page.goto(origin + "/chest");
  const meetings = page.locator("section.meetings");
  await meetings.waitFor();
  const row = meetings.locator("li", { hasText: "Sarah Klein" });
  const text = await row.innerText();
  expect(text.includes("Project call") && text.includes("10:00"), "in My day, at 10:00 Paris: " + text);
  expect(await row.getByRole("link", { name: "Open in Booking" }).getAttribute("href") === "https://booking-chest.chest.test/chest/bookings/9001", "Open in Booking");
  await row.getByRole("link", { name: "Sarah Klein" }).click();
  await page.waitForURL(/\/chest\/contacts\/\d+$/u);
  const line = page.locator(".timeline .event.k-booking");
  await line.waitFor();
  const said = await line.innerText();
  expect(said.includes("Booked a meeting: Project call") && said.includes("10:00") && said.includes("with you"), "the line: " + said);
  expect(await line.getByRole("link", { name: "Project call" }).getAttribute("href") === "https://booking-chest.chest.test/chest/bookings/9001", "the type links back to the booking");
  expect((await page.locator(".timeline").innerText()).includes("Added when they booked a meeting"), "added by the booking");
  expect((await page.locator("main").innerText()).includes("Sarah.Klein@example.com"), "her email as she wrote it (field.email)");
  // Moved to the day after, at 14:00 Paris; told twice; an older move late.
  const later = booked("9001", { moves: 1, start: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 2, 12, 0)) });
  await tellBooking(later);
  await tellBooking(later);
  await tellBooking(booked("9001"));
  await page.reload();
  expect(await page.locator(".timeline .event.k-booking").count() === 1, "one line");
  const moved = await page.locator(".timeline .event.k-booking").innerText();
  expect(moved.includes("14:00") && moved.includes("Moved once") && !moved.includes("10:00"), "its time replaced: " + moved);
});

await step("Booking cancels it: the line says so, My day drops it, and a confirmation after it is ignored", async () => {
  await tellBooking(booked("9001", { status: "cancelled", cancelledBy: "guest", moves: 1 }));
  await tellBooking(booked("9001", { moves: 2 }));
  await page.reload();
  const line = await page.locator(".timeline .event.k-booking").innerText();
  expect(line.includes("Meeting cancelled: Project call"), "cancelled: " + line);
  await page.goto(origin + "/chest");
  expect(await page.locator("section.meetings li", { hasText: "Sarah Klein" }).count() === 0, "not in My day");
});

await step("privacy: a guest with Claire Durand's phone under another name is a contact of her own, maybe the same person; nothing lands in Claire's file; version 2 is ignored", async () => {
  await tellBooking(booked("9002", { contact: { name: "Marie Leroy", email: "marie.leroy@example.com", phone: "+33 6 12 34 56 78", company: null, language: "fr" } }));
  await tellBooking(booked("9003", { v: 2, contact: { name: "Version Two", email: "v2@example.com", phone: null, company: null, language: "en" } }));
  await page.goto(origin + "/chest/contacts?q=Claire");
  await page.locator("a.row-link", { hasText: "Claire Durand" }).first().click();
  await page.waitForURL(/\/chest\/contacts\/\d+$/u);
  expect(await page.locator(".timeline .event.k-booking").count() === 0, "nothing in Claire's file");
  await page.goto(origin + "/chest/contacts?q=marie.leroy");
  await page.locator("a.row-link", { hasText: "Marie Leroy" }).first().click();
  await page.waitForURL(/\/chest\/contacts\/\d+$/u);
  expect((await page.locator(".maybe-same").innerText()).includes("Claire Durand"), "maybe the same person");
  expect(await page.locator(".timeline .event.k-booking").count() === 1, "her meeting on her own file");
  await page.goto(origin + "/chest/contacts?q=v2%40example.com");
  expect(await page.locator("a.row-link", { hasText: "Version Two" }).count() === 0, "version 2 ignored");
});

await browser.close();
done(problems);
