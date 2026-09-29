// Status, as customers and editors use it, in a real browser:
//   node lab/chest-dev/flows/status.mjs [port]   (harness with --reset: the sample shop is there)
import { join } from "node:path";
import { as, done, expect, open, step } from "./lib.mjs";

const port = Number(process.argv[2] ?? 5800);
const { browser, context, page, origin, problems } = await open(port, "tom", { allow404: /\/incidents\/9999$/u });
// Tom reads English; Camille and Léa French. The team's steps below read English.
const english = () => context.addCookies([{ name: "dev_locale", value: "en", url: origin }, { name: "lang", value: "en", url: origin }]);
const devText = async () => (await page.request.get(origin + "/_dev")).text();
let subscriberLink = "";
let incidentUrl = "";

await step("a visitor sees the state in one line, what is happening, and each service with 90 days", async () => {
  await context.clearCookies();
  await english();
  await page.goto(origin + "/");
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
  await page.goto(origin + "/");
  const legends = await page.locator(".history-legend .uptime").allInnerTexts();
  expect(legends.some(l => /days? slower than usual/u.test(l)), "slower days said beside the uptime");
  expect((await page.locator("main").innerText()).includes("the rule of Atlassian Statuspage"), "the rule is written on the page");
  await page.goto(origin + "/lang/fr?back=/");
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
  const summary = await page.request.get(origin + "/api/v2/summary.json", { headers: { Origin: "https://dashboard.example.com" } });
  expect(summary.headers()["access-control-allow-origin"] === "*", "CORS");
  const body = await summary.json();
  expect(body.page.name === "Atelier Martin" && body.status.indicator === "minor", "page and indicator");
  expect(body.components.some(c => c.group === true && Array.isArray(c.components)), "groups list their components");
  expect(body.incidents.some(i => i.name === "Delivery dates shown late" && i.incident_updates.length === 3), "unresolved incidents with their updates");
  expect(body.scheduled_maintenances.some(m => m.name === "Payment provider upgrade" && m.scheduled_for), "maintenance ahead");
  expect(!JSON.stringify(body).includes("Back office"), "no team-only service");
  for (const path of ["status.json", "components.json", "incidents.json", "incidents/unresolved.json", "scheduled-maintenances.json", "scheduled-maintenances/upcoming.json", "scheduled-maintenances/active.json"]) {
    const r = await page.request.get(`${origin}/api/v2/${path}`);
    expect(r.status() === 200 && (await r.json()).page.id === body.page.id, path);
  }
  const badge = await page.request.get(origin + "/badge.svg?lang=fr");
  expect(badge.headers()["content-type"].startsWith("image/svg+xml") && (await badge.text()).includes("Performances dégradées"), "badge in French");
  const embed = await page.request.get(origin + "/embed");
  expect(embed.headers()["content-security-policy"].includes("frame-ancestors https://www.atelier-martin.fr"), "frame-ancestors from the settings");
  expect((await embed.text()).includes("Delivery dates shown late"), "the banner says what is happening");
});

await step("with the company's brand in the Chest, the public page wears its logo and colour, with its website and support", async () => {
  await page.request.post(origin + "/_dev/theme", { form: { level: "all", choice: "brand:sample" } });
  try {
    await page.goto(origin + "/?fresh=brand");
    expect(await page.locator(".public.branded").count() === 1, "brand colours applied");
    expect((await page.locator(".public-head img").getAttribute("alt")) === "Atelier Martin", "the logo");
    expect(await page.getByRole("link", { name: "Back to atelier-martin.fr" }).count() === 1, "back to the website");
    expect(await page.getByRole("link", { name: "Contact support" }).count() === 1, "support");
  } finally {
    await page.request.post(origin + "/_dev/theme", { form: { level: "all", choice: "own" } });
  }
});

await step("a visitor opens an incident's own page, the history, and the feeds", async () => {
  await page.locator(".tick a").first().click();
  await page.waitForURL(/\/incidents\/\d+$/u);
  expect((await page.locator("h1").innerText()).length > 3, "incident page");
  await page.goto(origin + "/history");
  expect((await page.locator("main").innerText()).includes("Card payments failing"), "history");
  const atom = await page.request.get(origin + "/feed.atom");
  expect(atom.status() === 200 && (await atom.text()).includes("<feed xmlns=\"http://www.w3.org/2005/Atom\">"), "atom");
  const rss = await page.request.get(origin + "/feed.rss");
  expect(rss.status() === 200 && (await rss.text()).includes("<rss version=\"2.0\""), "rss");
  const ics = await page.request.get(origin + "/maintenance.ics");
  expect(ics.status() === 200 && (await ics.text()).includes("SUMMARY:Maintenance — Payment provider upgrade"), "ics");
  const missing = await page.goto(origin + "/incidents/9999");
  expect(missing.status() === 404, "unknown incident");
});

await step("a visitor subscribes by email: a confirmation link, then their own page", async () => {
  await page.goto(origin + "/");
  await page.getByRole("link", { name: "Get updates" }).first().click();
  await page.waitForURL(origin + "/subscribe");
  await page.getByLabel("Your email address").fill("lucie@example.com");
  await page.getByLabel("Only these:").check();
  await page.getByLabel("Online shop — Checkout").check();
  await page.waitForTimeout(2200);
  await page.getByRole("button", { name: "Subscribe" }).click();
  await page.waitForURL(/\/subscribe\?sent=1/u);
  expect((await page.locator("h1").innerText()).includes("Check your inbox"), "sent");
  const dev = await devText();
  expect(dev.includes("Confirm your subscription to Atelier Martin status updates"), "confirmation email");
  subscriberLink = /http:\/\/localhost:\d+\/s\/[A-Za-z0-9_-]{32}/u.exec(dev)?.[0] ?? "";
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
  await page.goto(origin + "/?fresh=1");
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
  await page.goto(`${origin}/incidents/${id}?fresh=pm`);
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
  await page.goto(origin + "/?fresh=2");
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
  await page.goto(origin + "/?fresh=3");
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
  await page.goto(origin + "/?fresh=4");
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
  const banner = async () => (await page.request.get(origin + "/embed")).headers()["content-security-policy"] ?? "";
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
  await page.goto(origin + "/history?page=1&fresh=import");
  const older = await page.locator("main").innerText();
  await page.goto(origin + "/history?fresh=import");
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
  expect(main.includes("Back office") && main.includes("Équipe seulement"), "the team-only service, marked");
  const r = await page.goto(origin + "/chest/subscribers");
  expect((await r.text()).includes("État de nos services") && !(await page.locator("main").innerText()).includes("lucie@example.com"), "no subscribers shown");
  await context.clearCookies();
  await page.goto(origin + "/?fresh=nora");
  expect(!(await page.locator("main").innerText()).includes("Back office"), "never on the public page");
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
  await page.goto(origin + "/?fresh=written-in");
  const card = page.locator(".incident", { hasText: "Paiement indisponible" });
  expect(await card.locator("[lang=fr]").count() > 0, "her French text is marked French for an English visitor");
});

await step("French, phone width: the page reads without sideways scroll; the subscriber unsubscribes", async () => {
  await context.clearCookies();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/lang/fr?back=/");
  expect((await page.locator("h1").innerText()).length > 5, "banner");
  expect((await page.locator(".history-legend .narrow").first().innerText()).includes("Il y a 30 jours"), "30 days on a phone, in French");
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(!wide, "no sideways scroll");
  await page.goto(subscriberLink);
  await page.getByRole("button", { name: "Me désabonner" }).click();
  await page.waitForURL(origin + "/unsubscribed");
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
});

await browser.close();
done(problems);
