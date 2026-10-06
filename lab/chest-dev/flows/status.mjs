// Status, as customers and editors use it, in a real browser:
//   node lab/chest-dev/flows/status.mjs [port]   (harness with --reset: the sample shop is there)
import { join } from "node:path";
import { as, done, expect, open, step } from "./lib.mjs";

const port = Number(process.argv[2] ?? 5800);
const { browser, context, page, origin, publicOrigin, problems } = await open(port, "tom", { allow404: /\/incidents\/9999$/u });
// Tom reads English; Camille and Léa French. The team's steps below read English.
const english = () => context.addCookies([{ name: "dev_locale", value: "en", url: origin }, { name: "lang", value: "en", url: publicOrigin }]);
const devText = async () => (await page.request.get(origin + "/_dev")).text();
let subscriberLink = "";
let incidentUrl = "";

await step("a visitor sees the state in one line, what is happening, and each service with 90 days", async () => {
  await context.clearCookies();
  await english();
  await page.goto(publicOrigin + "/");
  expect((await page.locator("h1").innerText()).includes("Degraded performance"), "banner");
  expect((await page.locator(".company-name").innerText()) === "Atelier Martin", "company");
  const main = await page.locator("main").innerText();
  expect(main.includes("Delivery dates shown late") && main.includes("Monitoring"), "active incident");
  expect(main.includes("Payment provider upgrade"), "planned maintenance");
  expect((await page.locator(".entry-component").first().locator(".tick").count()) === 90, "90 ticks");
  expect(main.includes("uptime"), "uptime");
  const payments = page.locator(".history-table").nth(3);
  await payments.locator("summary").click();
  expect((await payments.locator("table").innerText()).includes("Card payments failing"), "table alternative");
});

await step("uptime follows Statuspage's rule and says slower days beside it; a French visitor reads the French text, the rest marked English", async () => {
  await page.goto(publicOrigin + "/");
  const legends = await page.locator(".history-legend .uptime").allInnerTexts();
  expect(legends.some(l => /days? slower than usual/u.test(l)), "slower days said beside the uptime");
  expect((await page.locator("main").innerText()).includes("the rule of Atlassian Statuspage"), "the rule is written on the page");
  await page.goto(publicOrigin + "/lang/fr?back=/");
  const main = await page.locator("main").innerText();
  expect(main.includes("Dates de livraison affichées en retard") && main.includes("Un calendrier des jours fériés"), "French text for a French visitor");
  const card = page.locator(".incident", { hasText: "Dates de livraison" });
  const other = page.locator(".incident", { hasText: "Payment provider upgrade" });
  const [inFrench, inEnglish] = [await card.locator("[lang=en]").count(), await other.locator("[lang=en]").count()];
  await context.clearCookies();
  await english();
  expect(inFrench === 0, "every text of that incident exists in French: nothing marked English");
  expect(inEnglish > 0, "a text only in English is marked English");
});

await step("the JSON API speaks Statuspage's shape to any site; the badge is a picture; the banner may be framed only by listed sites", async () => {
  const summary = await page.request.get(publicOrigin + "/api/v2/summary.json", { headers: { Origin: "https://dashboard.example.com" } });
  expect(summary.headers()["access-control-allow-origin"] === "*", "CORS");
  const body = await summary.json();
  expect(body.page.name === "Atelier Martin" && body.status.indicator === "minor", "page and indicator");
  expect(body.components.some(c => c.group === true && Array.isArray(c.components)), "groups list their components");
  expect(body.incidents.some(i => i.name === "Delivery dates shown late" && i.incident_updates.length === 3), "unresolved incidents with their updates");
  expect(body.scheduled_maintenances.some(m => m.name === "Payment provider upgrade" && m.scheduled_for), "maintenance ahead");
  expect(!JSON.stringify(body).includes("Back office"), "no team-only service");
  for (const path of ["status.json", "components.json", "incidents.json", "incidents/unresolved.json", "scheduled-maintenances.json", "scheduled-maintenances/upcoming.json", "scheduled-maintenances/active.json"]) {
    const r = await page.request.get(`${publicOrigin}/api/v2/${path}`);
    expect(r.status() === 200 && (await r.json()).page.id === body.page.id, path);
  }
  const badge = await page.request.get(publicOrigin + "/badge.svg?lang=fr");
  expect(badge.headers()["content-type"].startsWith("image/svg+xml") && (await badge.text()).includes("Performances dégradées"), "badge in French");
  const embed = await page.request.get(publicOrigin + "/embed");
  expect(embed.headers()["content-security-policy"].includes("frame-ancestors https://www.atelier-martin.fr"), "frame-ancestors from the settings");
  expect((await embed.text()).includes("Delivery dates shown late"), "the banner says what is happening");
});

await step("with the company's brand in the Chest, the public page wears its logo and colour, with its website and support", async () => {
  await page.request.post(origin + "/_dev/theme", { form: { level: "all", choice: "brand:sample" } });
  try {
    await page.goto(publicOrigin + "/?fresh=brand");
    expect(await page.locator(".public.branded").count() === 1, "brand colours applied");
    expect((await page.locator(".public-head img").getAttribute("alt")) === "Atelier Martin", "the logo");
    expect(await page.getByRole("link", { name: "Back to atelier-martin.fr" }).count() === 1, "back to the website");
    expect(await page.getByRole("link", { name: "Contact support" }).count() === 1, "support");
  } finally {
    await page.request.post(origin + "/_dev/theme", { form: { level: "all", choice: "own" } });
  }
});

await step("a theme the company chose for its team's tools never dresses the public page; the team's pages wear it", async () => {
  await page.request.post(origin + "/_dev/theme", { form: { level: "all", choice: "catalogue:confetti" } });
  try {
    await page.goto(publicOrigin + "/?fresh=theme");
    expect((await page.locator("[data-look]").first().getAttribute("data-look")) === "own", "customers see Status's own look");
    await as(context, origin, "tom");
    await english();
    await page.goto(origin + "/chest");
    expect((await page.locator("[data-look]").first().getAttribute("data-look")) === "catalogue", "the team sees the company's choice");
  } finally {
    await page.request.post(origin + "/_dev/theme", { form: { level: "all", choice: "own" } });
    await context.clearCookies();
    await english();
    await page.goto(publicOrigin + "/?fresh=after-theme");
  }
});

await step("a visitor opens an incident's own page, the history, and the feeds", async () => {
  await page.locator(".tick a").first().click();
  await page.waitForURL(/\/incidents\/\d+$/u);
  expect((await page.locator("h1").innerText()).length > 3, "incident page");
  // Three months a page: 78 days ago is on the first or the second.
  await page.goto(publicOrigin + "/history");
  let history = await page.locator("main").innerText();
  if (!history.includes("Card payments failing")) {
    await page.getByRole("link", { name: "Older" }).click();
    await page.waitForURL(/\/history\?page=1$/u);
    history = await page.locator("main").innerText();
  }
  expect(history.includes("Card payments failing"), "history");
  const atom = await page.request.get(publicOrigin + "/feed.atom");
  expect(atom.status() === 200 && (await atom.text()).includes("<feed xmlns=\"http://www.w3.org/2005/Atom\">"), "atom");
  const rss = await page.request.get(publicOrigin + "/feed.rss");
  expect(rss.status() === 200 && (await rss.text()).includes("<rss version=\"2.0\""), "rss");
  const ics = await page.request.get(publicOrigin + "/maintenance.ics");
  expect(ics.status() === 200 && (await ics.text()).includes("SUMMARY:Maintenance — Payment provider upgrade"), "ics");
  const missing = await page.goto(publicOrigin + "/incidents/9999");
  expect(missing.status() === 404, "unknown incident");
});

await step("a visitor subscribes by email: a confirmation link, then their own page", async () => {
  await page.goto(publicOrigin + "/");
  await page.getByRole("link", { name: "Get updates" }).first().click();
  await page.waitForURL(publicOrigin + "/subscribe");
  await page.getByLabel("Your email address").fill("lucie@example.com");
  await page.getByLabel("Only these:").check();
  await page.getByLabel("Online shop — Checkout").check();
  await page.waitForTimeout(2200);
  await page.getByRole("button", { name: "Subscribe" }).click();
  await page.waitForURL(/\/subscribe\?sent=1/u);
  expect((await page.locator("h1").innerText()).includes("Check your inbox"), "sent");
  const dev = await devText();
  expect(dev.includes("Confirm your subscription to Atelier Martin status updates"), "confirmation email");
  subscriberLink = /https?:\/\/(?:localhost|127\.0\.0\.1):\d+\/s\/[A-Za-z0-9_-]{32}/u.exec(dev)?.[0] ?? "";
  expect(subscriberLink, "link in the email");
  await page.goto(subscriberLink);
  await page.getByRole("button", { name: "Confirm" }).click();
  await page.waitForURL(/done=confirmed/u);
  expect((await page.locator("main").innerText()).includes("You are subscribed"), "confirmed");
});

await step("an editor posts an incident in one screen; customers, the team and the subscriber are told", async () => {
  await as(context, origin, "tom");
  await english();
  await page.goto(origin + "/chest");
  await page.getByRole("link", { name: "Post an incident" }).click();
  await page.waitForURL(origin + "/chest/incidents/new");
  await page.getByLabel("What is wrong?").fill("Checkout errors");
  await page.getByLabel("Checkout").check();
  await page.getByLabel("Impact on Checkout").selectOption("major");
  await page.getByLabel("What do you tell your customers?").fill("Some orders fail at the last step. We are on it.");
  await page.getByRole("button", { name: "Post the incident" }).click();
  await page.waitForURL(/\/chest\/incidents\/\d+$/u);
  incidentUrl = page.url();
  expect((await page.locator("h1").innerText()).includes("Checkout errors"), "incident page");
  const dev = await devText();
  // French puts a narrow no-break space before ":" (the harness's bell may show a plain one).
  expect(/Incident[\u202f\u00a0 ]: Checkout errors/u.test(dev), "Camille's bell, in French");
  expect(dev.includes("Incident: Checkout errors"), "Tom's bell, in English");
  expect(dev.includes("[Atelier Martin] Investigating: Checkout errors"), "the subscriber's email");
  await context.clearCookies();
  await english();
  // Browsers keep the public page 30 seconds: a fresh address.
  await page.goto(publicOrigin + "/?fresh=1");
  expect((await page.locator("h1").innerText()).includes("Major outage"), "public banner");
});

await step("the editor posts an update, then resolves (confirmed in a dialog)", async () => {
  await as(context, origin, "tom");
  await english();
  await page.goto(incidentUrl);
  await page.locator("#update").getByLabel("Identified").check();
  await page.locator("#update").getByLabel("What is new?").fill("A bad release. Rolling back.");
  await page.getByRole("button", { name: "Post the update" }).click();
  await page.waitForSelector(".ck-toast >> text=Update posted.");
  await page.waitForSelector(".team-timeline >> text=A bad release. Rolling back.");
  await page.getByRole("button", { name: "Resolve", exact: true }).click();
  expect((await page.locator("dialog[open]").innerText()).includes("Checkout will show “Operational” again"), "dialog says what changes");
  await page.getByRole("button", { name: "Resolve the incident" }).click();
  await page.waitForSelector(".ck-toast >> text=Resolved.");
  await page.waitForSelector(".chip.step-resolved");
  expect(await page.locator("#update-body").count() === 0, "no update form once resolved: nothing reopens it by a slip");
});

await step("a resolved incident gets its post-mortem, shown on its public page; reopening asks first", async () => {
  await page.getByRole("textbox", { name: "What happened and what we changed" }).fill("A bad release reached checkout. We now release in two steps.");
  await page.getByRole("button", { name: "Publish" }).click();
  await page.waitForSelector(".ck-toast >> text=Published on the incident’s page.");
  await page.getByRole("button", { name: "Reopen", exact: true }).click();
  expect((await page.locator("dialog[open]").innerText()).includes("subscribers are emailed"), "the dialog says what reopening does");
  await page.locator("dialog[open]").getByRole("button", { name: "Cancel" }).click();
  expect(await page.locator(".chip.step-resolved").count() > 0, "still resolved after Cancel");
  const id = incidentUrl.split("/").pop();
  await context.clearCookies();
  await english();
  await page.goto(`${publicOrigin}/incidents/${id}?fresh=pm`);
  expect((await page.locator("#postmortem").innerText()).includes("We now release in two steps."), "post-mortem on the public page");
  await as(context, origin, "tom");
  await english();
  await page.goto(incidentUrl);
});

await step("a mistake is corrected and logged; a removed update comes back with Undo", async () => {
  await page.locator(".team-timeline .step").last().getByRole("button", { name: "Edit" }).click();
  await page.locator(".team-timeline textarea").first().fill("Some orders failed at the last step.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForSelector(".ck-toast >> text=Update corrected.");
  await page.waitForSelector(".team-timeline >> text=Corrected by You");
  await page.locator(".team-timeline .step").nth(1).getByRole("button", { name: "Remove" }).click();
  await page.waitForSelector(".team-timeline .step.removed");
  await page.locator(".ck-toast").getByRole("button", { name: "Undo" }).click();
  await page.waitForSelector(".ck-toast >> text=Undone.");
  await page.waitForFunction(() => document.querySelectorAll(".team-timeline .step.removed").length === 0);
});

await step("a form left empty says so in the tool's words; a template fills the incident; wording can be kept as a template", async () => {
  await page.goto(origin + "/chest/incidents/new");
  await page.getByRole("button", { name: "Post the incident" }).click();
  expect((await page.locator("#title-missing").innerText()) === "Fill this in first.", "inline error, in English");
  expect(page.url().endsWith("/chest/incidents/new"), "nothing posted");
  await page.getByLabel("Start from a template").selectOption({ label: "Payments are slow" });
  expect((await page.getByLabel("What is wrong?").inputValue()) === "Payments are slow", "title from the template");
  expect(await page.getByRole("checkbox", { name: "Payments" }).isChecked(), "service from the template");
  expect((await page.getByLabel("Title in French").inputValue()) === "Paiements lents", "its French version too");
  await page.getByLabel("What is wrong?").fill("Search is down");
  await page.getByRole("button", { name: "Save as a template" }).click();
  await page.waitForSelector(".ck-toast >> text=Saved as the template “Search is down”. It will be offered here next time.");
});

await step("an editor plans a maintenance; the page shows it as planned", async () => {
  await page.goto(origin + "/chest/maintenance/new");
  await page.getByLabel("What will you do?").fill("Search engine upgrade");
  await page.getByLabel("Catalogue").check();
  await page.getByLabel("What do you tell your customers?").fill("Searching may be slow for an hour.");
  await page.getByRole("button", { name: "Plan it" }).click();
  await page.waitForURL(/\/chest\/incidents\/\d+$/u);
  expect((await page.locator(".chip").first().innerText()).toLowerCase().includes("planned"), "planned");
  await context.clearCookies();
  await english();
  await page.goto(publicOrigin + "/?fresh=2");
  expect((await page.locator("main").innerText()).includes("Search engine upgrade"), "public");
});

await step("an editor adds a service, hides it, and the public page follows", async () => {
  await as(context, origin, "tom");
  await english();
  await page.goto(origin + "/chest/components");
  await page.locator("#add-component-name").fill("Gift cards");
  await page.getByRole("button", { name: "Add a service" }).click();
  await page.waitForSelector(".component-line >> text=Gift cards");
  await page.getByRole("button", { name: "More actions for Gift cards" }).click();
  await page.getByRole("menuitem", { name: "Hide from the page" }).click();
  await page.waitForSelector(".component-line.is-hidden >> text=Gift cards");
  await context.clearCookies();
  await english();
  await page.goto(publicOrigin + "/?fresh=3");
  expect(!(await page.locator("main").innerText()).includes("Gift cards"), "hidden from customers");
});

await step("an editor has the Chest check a service; three failures ring the bell and propose an incident; it answers again", async () => {
  await as(context, origin, "tom");
  await english();
  await page.goto(origin + "/chest/checks");
  const field = page.getByLabel("Address to check for Checkout");
  const componentId = ((await field.getAttribute("id")) ?? "").replace("url-", "");
  await field.fill("https://shop.atelier-martin.test/checkout");
  await page.getByLabel("Every").first().selectOption("1");
  await page.getByRole("button", { name: "Save the checks" }).click();
  await page.waitForSelector(".ck-toast >> text=Saved. Your Chest checks these addresses.");
  expect((await devText()).includes("https://shop.atelier-martin.test/checkout"), "the Chest has the check");
  for (let i = 0; i < 3; i++) await page.request.post(origin + "/_dev/check", { form: { name: `c-${componentId}`, ok: "0" } });
  const dev = await devText();
  expect(dev.includes("Checkout is not answering"), "Tom's bell");
  expect(dev.includes("Checkout ne répond plus"), "Camille's bell, in French");
  await page.goto(origin + "/chest");
  const alert = page.locator(".alert");
  expect((await alert.innerText()).includes("Checkout has not answered since"), "the proposal on Now");
  await alert.getByRole("link", { name: "Open an incident" }).click();
  await page.waitForURL(/\/chest\/incidents\/new\?component=/u);
  expect((await page.getByLabel("What is wrong?").inputValue()) === "Checkout is unavailable", "prefilled title");
  expect(await page.getByRole("checkbox", { name: "Checkout" }).isChecked(), "prefilled service");
  expect((await page.getByLabel("Impact on Checkout").inputValue()) === "major", "prefilled impact");
  await page.request.post(origin + "/_dev/check", { form: { name: `c-${componentId}`, ok: "1" } });
  expect((await devText()).includes("Checkout answers again"), "told once it answers");
  await page.goto(origin + "/chest");
  expect((await page.locator(".alert").count()) === 0, "the proposal is gone");
  await context.clearCookies();
  await english();
  await page.goto(publicOrigin + "/?fresh=4");
  // Four checks, one failed: too few to publish a figure ("25 %" would be
  // false) — the page says since when the service is checked.
  const checkoutText = (await page.locator(".measured").allInnerTexts()).filter(t => t.includes("Automatic checks since"));
  expect(checkoutText.length === 1 && !checkoutText[0].includes("%"), "no measured figure before a full day of checks");
  expect((await page.locator("main").innerText()).includes("Measured by automatic checks"), "a service checked for weeks shows its measured uptime");
  expect(!(await page.locator("h1").innerText()).includes("Major outage"), "nothing posted by itself");
});

await step("an editor creates a heartbeat for a nightly job; the job's call is recorded", async () => {
  await as(context, origin, "tom");
  await english();
  await page.goto(origin + "/chest/checks");
  await page.getByLabel("Service", { exact: true }).selectOption({ label: "Back office" });
  await page.getByLabel("How often does it run?").selectOption({ label: "Every day" });
  await page.getByRole("button", { name: "Create the address" }).click();
  await page.waitForSelector("#heartbeat-url");
  const url = await page.locator("#heartbeat-url").inputValue();
  expect(/\/heartbeat\/[A-Za-z0-9_-]{43}$/u.test(url), "a secret address");
  expect((await page.request.post(url)).status() === 204, "the job's call is received");
  expect((await page.request.get(url.replace(/.{4}$/u, "abcd"))).status() === 404, "a wrong address names nothing");
  await page.reload();
  expect((await page.locator("#heartbeat-" + (await page.locator("#heartbeat-service option", { hasText: "Back office" }).getAttribute("value"))).innerText()).includes("Last call"), "last call shown");
});

await step("deleting a service offers Undo; deleting a heartbeat, which cannot be undone, asks first in the page", async () => {
  await page.goto(origin + "/chest/components");
  await page.locator("#add-component-name").fill("Temporary service");
  await page.getByRole("button", { name: "Add a service" }).click();
  await page.waitForSelector(".component-line >> text=Temporary service");
  await page.getByRole("button", { name: "More actions for Temporary service" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.waitForFunction(() => !document.querySelector("main")?.textContent?.includes("Temporary service"));
  await page.locator(".ck-toast").getByRole("button", { name: "Undo" }).click();
  await page.waitForSelector(".ck-toast >> text=Undone.");
  await page.waitForSelector(".component-line >> text=Temporary service");
  await page.goto(origin + "/chest/checks");
  let asked = false;
  page.once("dialog", d => { asked = true; void d.dismiss(); });
  await page.getByRole("button", { name: "Delete the heartbeat of Back office" }).click();
  const confirm = page.getByRole("alertdialog");
  expect((await confirm.innerText()).includes("Its address stops working at once"), "the Confirm says what happens");
  await confirm.getByRole("button", { name: "Cancel" }).click();
  expect(await page.locator("[id^=heartbeat-]").filter({ hasText: "Back office" }).count() > 0, "still there after Cancel");
  await page.getByRole("button", { name: "Delete the heartbeat of Back office" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await page.waitForSelector(".ck-toast >> text=Heartbeat deleted: its address no longer works.");
  expect(!asked, "never the browser's confirm");
});

await step("an incident of the past: its days typed in the editor's words, its times on a 24-hour list", async () => {
  await page.goto(origin + "/chest/incidents/new");
  await page.getByLabel("What is wrong?").fill("Search was down");
  await page.getByLabel("Catalogue").check();
  await page.getByLabel("It already happened: add it to the history").check();
  await page.getByLabel("Started on").fill("yesterday");
  await page.getByLabel("Started on").blur();
  await page.locator("#start-time").selectOption({ label: "14:05" });
  await page.getByLabel("Resolved on").fill("yesterday");
  await page.getByLabel("Resolved on").blur();
  await page.locator("#end-time").selectOption({ label: "15:30" });
  expect((await page.getByLabel("at", { exact: true }).count()) === 2, "each time has its label");
  await page.getByLabel("What do you tell your customers?").fill("Search did not answer for an hour and a half.");
  // Kit 0.2.4: a day after `max` (tomorrow, for an incident of the past)
  // stays as typed and says why; the form (noValidate: its own messages)
  // waits — never adds the incident with the day the field held before
  // (the bug class where Timesheets saved "today" in place of refusing).
  const history = async () => (await (await page.request.get(origin + "/chest/history")).text()).split("Search was down").length;
  const before = await history();
  const resolved = page.locator("#end-day");
  await resolved.fill("tomorrow");
  await resolved.press("Tab");
  await page.locator(".ck-date", { has: resolved }).locator(".ck-error", { hasText: /^Choose .* or earlier\.$/u }).waitFor();
  expect(await resolved.getAttribute("aria-invalid") === "true", "the day says it is refused");
  await page.getByRole("button", { name: "Add to the history" }).click();
  await page.waitForTimeout(1200);
  expect(new URL(page.url()).pathname === "/chest/incidents/new", "still on the form: " + page.url());
  expect(await resolved.inputValue() === "tomorrow", "the text stays as typed");
  expect(await page.evaluate(() => document.activeElement?.id) === "end-day", "focus back on the refused day");
  expect((await history()) === before, "nothing added to the history");
  // Corrected and sent in one move (kit 0.2.5): the click is not lost.
  await resolved.fill("yesterday");
  await page.getByRole("button", { name: "Add to the history" }).click();
  await page.waitForURL(/\/chest\/incidents\/\d+$/u);
  expect((await page.locator(".chip").first().innerText()).toLowerCase().includes("resolved"), "resolved, in the history");
});

await step("settings: the company's links; import from Statuspage; download everything", async () => {
  await page.goto(origin + "/chest/settings");
  await page.getByLabel("Your website").fill("https://www.atelier-martin.fr");
  await page.locator("#links-title").locator("..").getByRole("button", { name: "Save" }).click();
  await page.waitForSelector(".ck-toast >> text=Saved.");
  // A site added to those that may show the banner frames it at once.
  const banner = async () => (await page.request.get(publicOrigin + "/embed")).headers()["content-security-policy"] ?? "";
  const saveSites = async (text) => {
    await page.locator("#embed-sites").fill(text);
    for (const close of await page.locator(".ck-toast-close").all()) await close.click().catch(() => {});
    await page.locator("#embed-sites").locator("xpath=ancestor::form").getByRole("button", { name: "Save" }).click();
    await page.waitForSelector(".ck-toast >> text=Saved.");
  };
  const listed = await page.locator("#embed-sites").inputValue();
  expect(!(await banner()).includes("https://news.atelier-martin.fr"), "not allowed yet");
  await saveSites(listed + "\nhttps://news.atelier-martin.fr");
  expect((await banner()).includes("https://news.atelier-martin.fr"), "the banner may be framed there at once");
  await saveSites(listed);
  expect(!(await banner()).includes("https://news.atelier-martin.fr"), "a site removed is refused at once");
  const fixtures = join(import.meta.dirname, "..", "..", "..", "tools", "public-and-private", "status", "test", "fixtures");
  await page.setInputFiles("section[aria-labelledby=import-title] input[type=file]", [join(fixtures, "statuspage-components.json"), join(fixtures, "statuspage-incidents.json"), join(fixtures, "statuspage-maintenances.json")]);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.waitForSelector(".ck-toast >> text=/Imported: 2 incidents, 1 maintenances/");
  const all = await page.request.get(origin + "/chest/export");
  const data = await all.json();
  expect(data.format === "chest-status-export" && data.incidents.some(i => i.sourceId === "statuspage:yq8hg1dmw0v3"), "the export holds the imported history");
  const csv = await (await page.request.get(origin + "/chest/export/subscribers.csv")).text();
  expect(csv.includes("email,language,follows") && csv.includes("marie.leroy@example.com"), "subscribers as CSV");
  await context.clearCookies();
  await english();
  await page.goto(publicOrigin + "/history?page=1&fresh=import");
  const older = await page.locator("main").innerText();
  await page.goto(publicOrigin + "/history?fresh=import");
  expect((older + await page.locator("main").innerText()).includes("Website unreachable for some visitors"), "imported history is public");
  await as(context, origin, "tom");
  await english();
});

await step("someone with the tool but no role sees the team's status page, services for the team only included — never the settings or subscribers", async () => {
  await as(context, origin, "nora");
  await context.addCookies([{ name: "dev_locale", value: "fr", url: origin }]);
  await page.goto(origin + "/chest");
  expect((await page.locator("h1").innerText()).includes("État de nos services"), "the team's page, in French");
  const main = await page.locator("main").innerText();
  // Named in her language (critique 3, N2): the back office's French name.
  expect(main.includes("Gestion interne") && main.includes("Équipe seulement"), "the team-only service, marked");
  const r = await page.goto(origin + "/chest/subscribers");
  expect((await r.text()).includes("État de nos services") && !(await page.locator("main").innerText()).includes("lucie@example.com"), "no subscribers shown");
  await context.clearCookies();
  await page.goto(publicOrigin + "/?fresh=nora");
  const outside = await page.locator("main").innerText();
  expect(!outside.includes("Back office") && !outside.includes("Gestion interne"), "never on the public page");
});

await step("a French editor on this English Chest writes in French: the form says so, the public page marks her text French", async () => {
  await as(context, origin, "camille");
  await context.addCookies([{ name: "dev_locale", value: "fr", url: origin }]);
  await page.goto(origin + "/chest/incidents/new");
  expect((await page.getByLabel("Écrit en").inputValue()) === "fr", "written in her language by default");
  expect(await page.getByRole("checkbox", { name: "Rédiger aussi en anglais" }).count() === 1, "the second version offered is English");
  await page.getByLabel("Écrit en").selectOption("en");
  expect(await page.getByRole("checkbox", { name: "Rédiger aussi en français" }).count() === 1, "choosing English moves the second version to French");
  await page.getByLabel("Écrit en").selectOption("fr");
  await page.getByLabel(/Qu’est-ce qui ne va pas/u).fill("Paiement indisponible");
  await page.getByRole("checkbox", { name: "Catalogue" }).check();
  await page.getByLabel(/Que dites-vous à vos clients/u).fill("Nous analysons le problème.");
  await page.getByRole("button", { name: /Publier l’incident/u }).click();
  await page.waitForURL(/\/chest\/incidents\/\d+$/u);
  incidentUrl = page.url();
  await context.clearCookies();
  await english();
  await page.goto(publicOrigin + "/?fresh=written-in");
  const card = page.locator(".incident", { hasText: "Paiement indisponible" });
  expect(await card.locator("[lang=fr]").count() > 0, "her French text is marked French for an English visitor");
});

// ---- Round 3 of the critique ------------------------------------------------

await step("services in two languages: an English visitor reads “Payments”, a French one “Paiement”; the team's Now speaks the member's language (critique 3, N2, N4)", async () => {
  await context.clearCookies();
  await english();
  await page.goto(publicOrigin + "/?fresh=31");
  const en = await page.locator(".components").innerText();
  expect(en.includes("Payments") && en.includes("Delivery tracking") && !en.includes("Paiement"), "English names");
  await page.goto(publicOrigin + "/lang/fr?back=/");
  const fr = await page.locator(".components").innerText();
  expect(fr.includes("Paiement") && fr.includes("Suivi de livraison") && !fr.includes("Delivery tracking"), "French names");
  expect(await page.locator(".components h4[lang]", { hasText: "Paiement" }).count() === 0, "a name in the reader's language is not marked as another");
  await as(context, origin, "camille");
  await context.addCookies([{ name: "dev_locale", value: "fr", url: origin }]);
  await page.goto(origin + "/chest");
  const now = await page.locator(".open-list").innerText();
  expect(now.includes("Dates de livraison affichées en retard") && !now.includes("Delivery dates shown late"), "the incident's French title for Camille: " + now.slice(0, 80));
  expect(now.includes("Suivi de livraison"), "the service's French name");
});

await step("a service added today has no 90 days of 100 %: empty days, “since” today (critique 3, N1)", async () => {
  await as(context, origin, "tom");
  await english();
  await page.goto(origin + "/chest/components");
  await page.locator("#add-component-name").fill("Loyalty card");
  await page.getByRole("checkbox", { name: "Also in French" }).first().check();
  await page.locator("#add-component-name2").fill("Carte de fidélité");
  await page.getByRole("button", { name: "Add a service" }).click();
  await page.waitForSelector(".component-line >> text=Loyalty card");
  expect((await page.locator(".component-list").innerText()).includes("Also in French: Carte de fidélité"), "its French name");
  await context.clearCookies();
  await english();
  await page.goto(publicOrigin + "/?fresh=32");
  const entry = page.locator(".entry", { hasText: "Loyalty card" });
  const legend = await entry.locator(".uptime").innerText();
  expect(/100\.00% since \d{1,2} \w+/u.test(legend), "uptime since today: " + legend);
  const summary = await entry.locator(".history .visually-hidden").first().innerText();
  expect(summary.includes("since") && !summary.includes("last 90 days"), "said to screen readers: " + summary);
  expect(await entry.locator(".tick.s-none").count() >= 29, "the days before are empty");
});

await step("a customer's team gets updates in Slack: connected on “Get updates”, told of the next incident, stopped from its own page (critique 3, top 1)", async () => {
  await context.clearCookies();
  await english();
  await page.goto(publicOrigin + "/subscribe");
  await page.getByRole("link", { name: "Or in Slack, Teams or your own tool" }).click();
  await page.waitForURL(publicOrigin + "/subscribe/chat");
  await page.waitForTimeout(2200);
  await page.getByLabel("Slack").check();
  await page.locator("#url").fill("https://example.com/not-a-slack-hook");
  await page.getByRole("button", { name: "Connect" }).click();
  // With JavaScript the refusal is a toast and the form keeps what was
  // typed (without it, the page comes back filled in, the reason beside).
  const said = page.locator(".ck-toast", { hasText: "Paste the address Slack gave you" });
  await said.waitFor();
  expect(await said.count() === 1, "a wrong address is said");
  expect((await page.locator("#url").inputValue()) === "https://example.com/not-a-slack-hook", "what was typed stays");
  await page.waitForTimeout(2200);
  await page.getByLabel("Slack").check();
  await page.locator("#url").fill("https://hooks.slack.com/services/T0CUST/B0CUST/customerSecret0123456789");
  await page.getByRole("button", { name: "Connect" }).click();
  await page.waitForURL(/\/w\/[A-Za-z0-9_-]{32}\?new=1$/u);
  const hookPage = page.url().split("?")[0];
  const text = await page.locator("main").innerText();
  expect(text.includes("Updates go to your channel") && text.includes("hooks.slack.com") && !text.includes("customerSecret0123456789"), "its page, the address without its secret");
  // The next incident on a public service is posted to the channel.
  await as(context, origin, "tom");
  await english();
  await page.goto(origin + "/chest/incidents/new");
  await page.getByLabel("What is wrong?").fill("Search is slow");
  await page.getByLabel("Catalogue").check();
  await page.getByLabel("What do you tell your customers?").fill("Searching takes a few seconds longer. We are on it.");
  await page.getByRole("button", { name: "Post the incident" }).click();
  await page.waitForURL(/\/chest\/incidents\/\d+$/u);
  const dev = (await devText()).replace(/<[^>]*>/gu, " ");
  expect(/incident\.update\s+→\s+Status subscriber \(slack\)[^:]*:\s+delivered[^{]*\{[^}]*Atelier Martin — Investigating: Search is slow/u.test(dev), "posted to Slack");
  // Editors see the subscription (never its secret part).
  await page.goto(origin + "/chest/subscribers");
  const subs = await page.locator("main").innerText();
  expect(/in a chat or at a web address/iu.test(subs) && subs.includes("hooks.slack.com") && !subs.includes("customerSecret0123456789"), "on Subscribers");
  // Studio.16: the page asks the Chest whether it delivers (webhooks.available,
  // mail.available) and says so, with the addresses used of its maximum.
  expect(/Your Chest delivers these updates: 1 of \d+ addresses used\./u.test(subs), "chats: the Chest delivers, 1 address used: " + subs);
  expect(subs.includes("Emails are sent through your Chest."), "email: the Chest sends");
  // Stopped from its own page: the Chest forgets it.
  await context.clearCookies();
  await english();
  await page.goto(hookPage);
  await page.getByRole("button", { name: "Stop the updates" }).click();
  await page.waitForURL(/\/w\/gone/u);
  expect((await page.locator("h1").innerText()).includes("The updates are stopped"), "stopped");
  await page.goto(hookPage);
  expect((await page.locator("h1").innerText()).includes("This link does not work"), "the link is dead");
});

await step("French, phone width: the page reads without sideways scroll; the subscriber unsubscribes", async () => {
  await context.clearCookies();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(publicOrigin + "/lang/fr?back=/");
  expect((await page.locator("h1").innerText()).length > 5, "banner");
  expect((await page.locator(".history-legend .narrow").first().innerText()).includes("Il y a 30 jours"), "30 days on a phone, in French");
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(!wide, "no sideways scroll");
  await page.goto(subscriberLink);
  await page.getByRole("button", { name: "Me désabonner" }).click();
  await page.waitForURL(publicOrigin + "/unsubscribed");
  expect((await page.locator("h1").innerText()).includes("Vous êtes désabonné"), "gone");
  await page.goto(subscriberLink);
  expect((await page.locator("h1").innerText()).includes("Ce lien ne fonctionne pas"), "the link is dead");
  await as(context, origin, "camille");
  await context.addCookies([{ name: "dev_locale", value: "fr", url: origin }]);
  await page.goto(origin + "/chest");
  const wideTeam = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(!wideTeam, "team part: no sideways scroll");
  expect((await page.locator("h1").innerText()).includes("En ce moment"), "team part in French");
  const post = await page.getByRole("link", { name: "Signaler un incident" }).boundingBox();
  const plan = await page.getByRole("link", { name: "Prévoir une maintenance" }).boundingBox();
  expect(post && plan && post.y < plan.y, "on a phone, the main action comes first");
  // The header stays one row above the sections: "Page publique" beside
  // the tool's name, never on a row of its own (round-2 critique).
  const brand = await page.locator(".ck-bar .ck-brand").boundingBox();
  const publicPage = await page.locator(".ck-bar .public-link").boundingBox();
  expect(brand && publicPage && Math.abs(publicPage.y - brand.y) < 8 && publicPage.x > brand.x + brand.width - 1, `the public link beside the name: ${JSON.stringify({ brand, publicPage })}`);
  expect((await page.locator(".ck-bar .public-link").innerText()).trim() === "Page publique", "its words whole");
  // Round 3 (N7): "En ce moment" wrapped onto two lines at 390 px; each
  // section's name is on one line, whole (kit 0.2.6 phone tabs).
  const tabs = await page.locator(".ck-nav-link .ck-nav-label").evaluateAll(labels => labels.map(l => ({ text: l.textContent, lines: Math.round(l.getBoundingClientRect().height / parseFloat(getComputedStyle(l).lineHeight)), cut: l.scrollWidth > l.clientWidth + 1 })));
  expect(tabs.length === 5 && tabs.every(t => t.lines === 1 && !t.cut), `five section names, each on one line: ${JSON.stringify(tabs)}`);
  expect(tabs[0].text === "En ce moment", "the first one is \"En ce moment\"");
});

await step("the public page speaks the visitor's language, else the Chest's (English here)", async () => {
  const lang = async (headers) => {
    // A visitor without the harness's cookies.
    const html = await (await fetch(publicOrigin + "/", { headers })).text();
    return /<html[^>]* lang="([a-z]+)"/u.exec(html)?.[1];
  };
  expect((await lang({ "accept-language": "fr-FR,fr;q=0.9" })) === "fr", "a French browser reads French");
  expect((await lang({ "accept-language": "de-DE,de;q=0.9" })) === "en", "a German browser reads the Chest's language");
  expect((await lang({ "accept-language": "de-DE", cookie: "lang=fr" })) === "fr", "the switch wins");
});

await browser.close();
done(problems);
