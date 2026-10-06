// Hiring, as candidates and the team use it, in a real browser:
//   node lab/chest-dev/flows/hiring.mjs [port]   (harness with --reset: the sample jobs are there)
import { as, done, expect, open, step } from "./lib.mjs";

const port = Number(process.argv[2] ?? 5300);
const { browser, context, page, origin, publicOrigin, problems } = await open(port, "camille", { allow404: /\/chest\/(settings|jobs\/2)$|\/no-such-job$/u });
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
page.on("pageerror", e => console.log("  [pageerror at " + page.url() + "] " + e.message.slice(0, 40)));
const english = async () => context.addCookies([{ name: "dev_locale", value: "en", url: origin }]);
const dev = async () => (await page.request.get(origin + "/_dev")).text();

async function fillApplication(name, email, file) {
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel(/LinkedIn or portfolio/u).fill("linkedin.com/in/" + name.split(" ")[0].toLowerCase());
  if (file) await page.locator("input[type=file]").setInputFiles(file);
  await page.getByLabel(/A few words to the team/u).fill("I build furniture on weekends and would love to do it every day.");
  // No consent to tick to apply: an optional box for the talent pool.
  expect(await page.locator("input[name=consent]").count() === 0, "no forced consent");
  await page.locator("input[name=pool]").check();
  await page.waitForTimeout(3200);
}

// With --empty (a harness run with --empty: a new company), only the
// first visit: the careers page speaks for nobody.
if (process.argv.includes("--empty")) {
  await step("a new company's careers page says only its name and that nothing is open — never an intro it did not write", async () => {
    await context.clearCookies();
    await page.goto(origin + "/");
    expect(await page.locator(".hero .lede").count() === 0, "no invented intro");
    expect(!(await page.locator("main").innerText()).includes("small team that cares"), "no sentence about the company");
  });
  await step("a new company's first screen: one filled button, and jobs to start from", async () => {
    await as(context, origin, "camille");
    await english();
    await page.goto(origin + "/chest");
    const filled = await page.locator("main a.button:not(.quiet), main button.button:not(.quiet)").count();
    expect(filled === 1, "one primary action, not " + filled);
    expect(await page.getByRole("link", { name: "Write a job" }).isVisible(), "Write a job");
    const templates = page.locator(".job-templates a");
    expect(await templates.count() === 3, "three jobs to start from");
    await templates.filter({ hasText: "Office manager" }).click();
    await page.waitForURL(/\/chest\/jobs\/new\?template=officeManager$/u);
    expect(await page.locator("#title").inputValue() === "Office manager", "the title filled");
    expect((await page.locator(".job-form").innerText()).includes("Welcome visitors and answer the phone"), "a description to adapt");
    await page.getByRole("button", { name: /Save/u }).first().click();
    await page.waitForURL(/\/chest\/jobs\/\d+$/u);
    expect((await page.locator("h1").innerText()).includes("Office manager"), "saved as a draft to publish");
  });
  await browser.close();
  done(problems);
}

await step("the careers page lists the open jobs, in English and in French", async () => {
  await context.clearCookies();
  await page.goto(origin + "/");
  expect((await page.locator("h1").innerText()).includes("Join Atelier Martin"), "title");
  const titles = await page.locator(".job-row-title").allTextContents();
  expect(titles.length === 3 && titles.includes("Senior furniture designer") && !titles.includes("Summer workshop intern"), "jobs: " + titles.join("|"));
  await page.getByRole("link", { name: "Français" }).click();
  await page.waitForURL(publicOrigin + "/");
  expect((await page.locator("h1").innerText()).includes("Rejoignez Atelier Martin"), "French title");
  expect((await page.locator(".lede").innerText()).startsWith("Nous dessinons"), "French intro on the French page");
  await page.getByRole("link", { name: "English" }).click();
  await page.waitForURL(publicOrigin + "/");
});

await step("a candidate applies with a PDF CV and lands on the thank-you page; a confirmation email leaves", async () => {
  await page.locator(".job-row", { hasText: "Senior furniture designer" }).click();
  await page.waitForURL(/senior-furniture-designer$/u);
  expect((await page.locator(".facts").innerText()).includes("€48,000 – €58,000 per year"), "salary");
  await page.locator(".apply-card").getByRole("link", { name: "Apply" }).click();
  await page.waitForURL(/\/apply$/u);
  await fillApplication("Nina Rousseau", "nina.rousseau@example.com", { name: "Nina Rousseau CV.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.getByRole("button", { name: "Send my application" }).click();
  await page.waitForURL(/\/thanks\?mailed=1$/u, { timeout: 15000 });
  expect((await page.locator("main").innerText()).includes("We also sent you a confirmation by email."), "mailed");
  expect((await dev()).includes("We received your application — Senior furniture designer"), "confirmation in the outbox");
});

await step("a file that says PDF but is not one is refused; what was typed stays", async () => {
  await page.goto(origin + "/sales-associate-lyon-showroom/apply");
  await fillApplication("Bot Faker", "bot@example.com", { name: "cv.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a pdf at all") });
  // The showroom job asks its questions on the form.
  expect((await page.locator(".questions").innerText()).includes("Can you work on Saturdays?"), "the job's question");
  await page.locator(".questions .pill", { hasText: "Yes" }).first().click();
  await page.getByRole("button", { name: "Send my application" }).click();
  await page.waitForSelector("p.error");
  expect((await page.locator("p.error").innerText()).includes("must be a PDF, a Word file"), "refused");
  expect((await page.getByLabel("Full name").inputValue()) === "Bot Faker", "kept");
});

await step("a draft or unknown job is not public", async () => {
  const r = await page.request.get(origin + "/no-such-job");
  expect(r.status() === 404, "unknown job: " + r.status());
});

await step("a recruiter sees the new application, with its CV", async () => {
  await as(context, origin, "camille");
  await english();
  await page.goto(origin + "/chest");
  expect((await page.locator(".job-card", { hasText: "Senior furniture designer" }).innerText()).includes("3 new"), "3 new");
  await page.locator(".job-card", { hasText: "Senior furniture designer" }).click();
  await page.waitForURL(/\/chest\/jobs\/1$/u);
  expect((await page.locator(".lane").first().innerText()).includes("Nina Rousseau"), "in New");
  await page.locator(".cand", { hasText: "Nina Rousseau" }).click();
  await page.waitForURL(/\/chest\/candidates\/\d+$/u);
  expect(await page.locator("iframe.cv-frame").count() === 1, "CV preview");
  const cv = await page.request.get(page.url() + "/cv");
  expect(cv.status() === 200 && (await cv.body()).subarray(0, 5).toString() === "%PDF-", "CV served: " + cv.status());
  await page.goBack();
});

await step("drag a candidate to the next stage with the mouse, and back with Undo", async () => {
  await page.goto(origin + "/chest/jobs/1");
  const card = page.locator(".cand", { hasText: "Nina Rousseau" });
  const target = page.locator(".lane").nth(1).locator(".lane-cards");
  const a = await card.boundingBox(), b = await target.boundingBox();
  await page.mouse.move(a.x + 20, a.y + 10);
  await page.mouse.down();
  await page.mouse.move(a.x + 40, a.y + 20, { steps: 5 });
  await page.mouse.move(b.x + 40, b.y + 30, { steps: 15 });
  await page.mouse.up();
  await page.waitForSelector(".ck-toast");
  expect((await page.locator(".ck-toast").innerText()).includes("Nina Rousseau moved to Screening"), "toast");
  await page.waitForTimeout(800);
  await page.reload();
  expect((await page.locator(".lane").nth(1).innerText()).includes("Nina Rousseau"), "in Screening");
});

await step("move a candidate with the keyboard: one toast, no second announcement", async () => {
  await page.locator(".cand", { hasText: "Mathis Laurent" }).focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  await page.keyboard.press("Space");
  await page.waitForTimeout(1500);
  expect(await page.locator(".ck-toast").count() === 1, "one toast: " + await page.locator(".ck-toast").count());
  expect(!(await page.locator("[id^=DndLiveRegion]").innerText()).includes("dropped"), "the drop is said once, by the toast");
  await page.reload();
  expect((await page.locator(".lane").nth(2).innerText()).includes("Mathis Laurent"), "in Interview");
});

await step("every card's keyboard instructions exist, on the second page served too (a stable id, not the server's counter)", async () => {
  // dnd-kit's own id comes from a counter that grows in the server's
  // process: from the second page on, each card's aria-describedby named
  // instructions that were not in the page. Two loads, then each card.
  for (let load = 0; load < 2; load++) {
    await page.goto(origin + "/chest/jobs/1");
    await page.waitForFunction(() => {
      const cards = [...document.querySelectorAll(".cand[aria-describedby]")];
      return cards.length > 0 && cards.every(c => document.getElementById(c.getAttribute("aria-describedby"))?.textContent.trim());
    }, null, { timeout: 15_000 }).catch(async () => {
      const found = await page.evaluate(() => [...document.querySelectorAll(".cand[aria-describedby]")].map(c => c.getAttribute("aria-describedby") + (document.getElementById(c.getAttribute("aria-describedby")) ? "" : " (missing)")));
      throw new Error(`load ${load + 1}: cards' instructions: ${found.join(", ") || "no card with aria-describedby"}`);
    });
  }
  const ids = await page.evaluate(() => [...new Set([...document.querySelectorAll(".cand[aria-describedby]")].map(c => c.getAttribute("aria-describedby")))]);
  expect(ids.length === 1 && !/^DndDescribedBy-\d+$/u.test(ids[0]), "one stable id: " + ids.join(", "));
});

await step("ask Inès for feedback; she sees it waiting, gives hers, then sees the others'", async () => {
  await page.locator(".cand", { hasText: "Nina Rousseau" }).click();
  await page.waitForURL(/\/chest\/candidates\/\d+$/u);
  const url = page.url();
  await page.locator(".cand-actions .menu summary").click();
  await page.getByRole("button", { name: "Ask for feedback" }).click();
  await page.locator("dialog[open] .check", { hasText: "Inès Moreau" }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Ask", exact: true }).click();
  await page.waitForSelector(".ck-toast");
  await as(context, origin, "ines");
  await context.addCookies([{ name: "dev_locale", value: "fr", url: origin }]);
  await page.goto(origin + "/chest");
  expect((await page.locator(".waiting").innerText()).includes("Nina Rousseau"), "waiting for Inès (French)");
  expect((await page.locator(".ck-nav").innerText()).includes("Offres"), "French nav");
  await page.goto(url);
  await page.locator(".scale-step", { hasText: "Excellent" }).click();
  await page.getByLabel("Points forts").fill("Un portfolio solide.");
  await page.locator(".pill", { hasText: "Oui, clairement" }).click();
  await page.getByRole("button", { name: "Envoyer mon avis" }).click();
  await page.waitForSelector(".ck-toast");
  await page.reload();
  expect((await page.locator(".feedback-list").innerText()).includes("Un portfolio solide."), "her feedback shown");
});

await step("an interviewer cannot move, sees only her jobs, has no settings", async () => {
  expect(await page.getByRole("button", { name: /Refuser/u }).count() === 0, "no reject");
  const other = await page.request.get(origin + "/chest/jobs/2");
  expect(other.status() === 404, "sales job hidden: " + other.status());
  const settings = await page.request.get(origin + "/chest/settings");
  expect(settings.status() === 404, "no settings: " + settings.status());
  await page.goto(origin + "/chest");
  const jobs = await page.locator(".job-card-title").allTextContents();
  expect(!jobs.includes("Sales associate — Lyon showroom"), "only her jobs: " + jobs.join("|"));
});

await step("reject: no reason chosen for you; Undo keeps the email from ever leaving; without Undo it leaves after 15 s and the toast says it was sent", async () => {
  await as(context, origin, "camille");
  await english();
  await page.goto(origin + "/chest/candidates/4");
  await page.getByRole("button", { name: "Reject" }).click();
  expect(await page.locator("dialog[open] .pill.on").count() === 0, "no reason pre-selected");
  expect(await page.locator("dialog[open]").getByRole("button", { name: "Reject", exact: true }).isDisabled(), "Reject waits for a reason");
  await page.locator("dialog[open] .pill", { hasText: "Not enough experience" }).click();
  expect((await page.locator("#reject-text").inputValue()).startsWith("Hello Jonas Weber,"), "draft in English");
  // Mail is on in the harness: the email is offered, never the sentence
  // for a Chest without mail (mail.available(), SDK studio.16).
  expect(await page.locator("dialog[open] [data-mail=off]").count() === 0, "no « cannot send » with mail on");
  await page.locator("dialog[open]").getByRole("button", { name: "Reject", exact: true }).click();
  await page.waitForSelector(".ck-toast");
  expect((await page.locator(".ck-toast").innerText()).includes("Undo keeps it"), "toast says it waits");
  expect(!(await dev()).includes("Your application — Senior furniture designer"), "nothing left yet");
  await page.locator(".ck-toast-undo").click();
  await page.waitForTimeout(16000);
  await page.reload();
  expect((await page.locator(".cand-title .ck-badge").first().innerText()).includes("Screening"), "back in Screening");
  expect(!(await dev()).includes("Your application — Senior furniture designer"), "the undone rejection never left");
  await page.getByRole("button", { name: "Reject" }).click();
  await page.locator("dialog[open] .pill", { hasText: "Not enough experience" }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Reject", exact: true }).click();
  await page.waitForSelector(".ck-toast");
  await page.waitForTimeout(17500);
  // Once the email left, the same toast says so, and offers no Undo.
  expect((await page.locator(".ck-toast").innerText()).includes("Rejection email sent to Jonas Weber"), "the toast says the email left: " + await page.locator(".ck-toast").innerText());
  expect(await page.locator(".ck-toast-undo").count() === 0, "no Undo once sent");
  await page.reload();
  expect((await dev()).includes("Your application — Senior furniture designer"), "rejection in the outbox once Undo is over");
  await page.getByRole("button", { name: "Bring back" }).click();
  await page.waitForTimeout(800);
});

await step("a candidate who withdrew is closed, not rejected by email", async () => {
  await page.goto(origin + "/chest/candidates/9");
  await page.getByRole("button", { name: "Reject" }).click();
  await page.locator("dialog[open] .pill", { hasText: "They withdrew" }).click();
  expect(await page.locator("#reject-text").count() === 0, "no email for a withdrawal");
  await page.locator("dialog[open]").getByRole("button", { name: "Close their application" }).click();
  await page.waitForSelector(".ck-toast");
  expect((await page.locator(".ck-toast").innerText()).includes("application closed"), "closed");
});

await step("hire someone with a first day: People is told; Undo takes the hire back", async () => {
  await page.goto(origin + "/chest/candidates/5");
  await page.getByRole("button", { name: "Move to Hired" }).click();
  // Kit 0.2.4: a first day already gone stays as typed, says why, and the
  // hire waits — never recorded with the day the dialog held before (none),
  // the bug class where Timesheets saved "today" in place of refusing.
  const hiredBefore = (await dev()).split("hiring.hired").length;
  const first = page.locator("#start-date");
  await first.fill("1/1/2020");
  await first.press("Tab");
  await page.locator(".ck-date", { has: first }).locator(".ck-error", { hasText: /^Choose .* or later\.$/u }).waitFor();
  expect(await first.getAttribute("aria-invalid") === "true", "the first day says it is refused");
  await page.getByRole("button", { name: "Confirm the hire" }).click();
  // Even a submit forced past the browser's own check stops on the field.
  await page.locator("dialog[open] form").evaluate(form => { form.noValidate = true; form.requestSubmit(); });
  await page.waitForTimeout(1000);
  expect(await page.locator(".ck-toast").count() === 0, "no hire, no toast");
  expect(await page.locator("dialog[open]").count() === 1, "the dialog stays open");
  expect(await first.inputValue() === "1/1/2020", "the text stays as typed");
  expect(await page.evaluate(() => document.activeElement?.id) === "start-date", "focus back on the first day");
  expect((await dev()).split("hiring.hired").length === hiredBefore, "nothing published");
  // Corrected and confirmed in one move (kit 0.2.5): the click is not lost.
  await page.getByLabel(/First day/u).fill("2026-11-02");
  await page.getByRole("button", { name: "Confirm the hire" }).click();
  await page.waitForSelector(".ck-toast");
  let log = await dev();
  expect(log.includes("hiring.hired") && log.includes("Clara Fontaine"), "hired published");
  await page.reload();
  expect((await page.locator(".cand-head").innerText()).includes("Starts on 2 November 2026"), "start date shown");
  await page.getByRole("button", { name: "Move to Hired" }).count();
  await page.locator(".cand-actions .menu summary").click();
  await page.getByRole("button", { name: "Move to…" }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Offer", exact: true }).click();
  await page.waitForSelector(".ck-toast");
  await page.waitForTimeout(800);
  log = await dev();
  expect(log.includes("hiring.hire_cancelled"), "cancel published");
});

await step("reach: the job page carries JobPosting data (a data block: no script runs), the feeds and sitemap list the open jobs", async () => {
  const html = await (await page.request.get(origin + "/senior-furniture-designer")).text();
  const m = /<script type="application\/ld\+json">([^<]+)<\/script>/u.exec(html);
  expect(m, "JSON-LD");
  const data = JSON.parse(m[1]);
  for (const key of ["title", "description", "datePosted", "hiringOrganization", "jobLocation"]) expect(data[key], "JobPosting " + key);
  expect(/index, follow/u.test(html), "indexable");
  const indeed = await (await page.request.get(origin + "/jobs.xml")).text();
  expect(indeed.startsWith("<?xml") && indeed.includes("<referencenumber><![CDATA[1]]></referencenumber>"), "Indeed feed");
  const rss = await (await page.request.get(origin + "/feed.xml")).text();
  expect(rss.includes("<rss version=\"2.0\"") && rss.includes("/senior-furniture-designer</link>"), "RSS");
  expect((await (await page.request.get(origin + "/sitemap.xml")).text()).includes("/office-manager</loc>"), "sitemap");
  expect((await (await page.request.get(origin + "/robots.txt")).text()).includes("Disallow: /chest"), "robots");
});

await step("write to a candidate from a template; her answer lands on her page", async () => {
  await page.goto(origin + "/chest/candidates/7");
  await page.getByRole("button", { name: "Write" }).click();
  await page.locator("#write-template").selectOption({ label: "Ask when they are free" });
  expect((await page.locator("#write-text").inputValue()).startsWith("Hello Emma,"), "template filled");
  await page.locator("dialog[open]").getByRole("button", { name: "Send" }).click();
  await page.waitForSelector(".ck-toast");
  expect((await page.locator(".ck-toast").innerText()).includes("Sent to Emma Lefort"), "sent");
  const log = await dev();
  expect(log.includes("jobs+tc7-"), "reply address is the candidate's thread");
  const id = /<option value="(msg_[a-z2-7]+)">Reply to “Your application — Senior furniture designer” \(emma\.lefort@example\.com\)/u.exec(log)?.[1];
  expect(id, "the message in the outbox");
  const r = await page.request.post(origin + "/_dev/receive", { form: { mailbox: "jobs", reply: id, from: "emma.lefort@example.com", fromName: "Emma Lefort", subject: "x", text: "Thursday at 10 works for me. Emma", back: "/_dev" }, maxRedirects: 0 });
  expect(r.status() === 303, "delivered");
  await page.reload();
  expect((await page.locator(".mails").innerText()).includes("Thursday at 10 works for me"), "her answer in the conversation");
  expect((await page.locator(".timeline").innerText()).includes("They answered by email"), "in the history");
});

await step("invite to an interview: busy times shown, .ics emailed, interviewers' calendars have it", async () => {
  await page.goto(origin + "/chest/candidates/7");
  await page.getByRole("button", { name: "Interview", exact: true }).click();
  // The candidate chooses by default; the recruiter may choose the time.
  expect(await page.locator("dialog[open]").getByLabel(/Emma chooses/u).isChecked(), "they choose, by default");
  await page.locator("dialog[open]").getByText("I choose the time").click();
  // The day of Hugo's seeded interview (seed: the Chest's midnight + 2 days
  // 14:00 — the database session is in the Chest's zone, Paris here).
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
  const day = new Date(Date.parse(today + "T12:00:00Z") + 2 * 86400000).toISOString().slice(0, 10);
  // The kit's DateField: the day typed in the member's language (ISO is read too).
  await page.locator("#iv-day").fill(day);
  await page.locator("#iv-day").press("Tab");
  // The job's interviewers are ticked at first (Hugo is one): he stays on it.
  await page.locator("dialog[open] .check", { hasText: "Hugo Bernard" }).locator("input").check();
  await page.waitForTimeout(800);
  expect((await page.locator("dialog[open]").innerText()).includes("Hugo Bernard: 14:00–15:00"), "Hugo's other interview is shown");
  await page.locator("#iv-time").selectOption("14:00");
  expect((await page.locator(".busy").getAttribute("class")).includes("clash"), "clash said");
  await page.locator("#iv-time").selectOption("10:00");
  await page.locator("#iv-place").fill("Atelier Martin, Lyon");
  await page.locator("dialog[open]").getByRole("button", { name: "Send the invitation" }).click();
  await page.waitForSelector(".ck-toast");
  const log = await dev();
  expect(log.includes("Interview on ") && log.includes("Senior furniture designer"), "invitation in the outbox");
  expect(log.includes("Interview: Emma Lefort"), "in the calendars");
  await page.reload();
  expect((await page.locator(".meetings").innerText()).includes("10:00"), "on her page");
});

await step("the candidate chooses her own interview time from a link: free times only, one tap, confirmed by email with an .ics; the team hears it", async () => {
  await as(context, origin, "camille");
  await english();
  await page.goto(origin + "/chest/candidates/1");
  await page.getByRole("button", { name: "Interview", exact: true }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.locator(".check", { hasText: "Hugo Bernard" }).locator("input").check();
  await dialog.getByRole("button", { name: "Send the link" }).click();
  await page.waitForSelector(".ck-toast >> text=/Link sent to Lucie Garnier/");
  await page.reload();
  expect((await page.locator(".meetings").first().innerText()).includes("Waiting for them to choose"), "the link waits on her page");
  const link = /https?:\/\/[^\s"<]*\/interview\/[A-Za-z0-9_-]{43}/u.exec(await dev())?.[0];
  expect(link, "the link is in the email");
  // The candidate, not signed in, in her browser.
  await context.clearCookies();
  await english();
  await page.goto(link.replace(/^https?:\/\/[^/]+/u, origin));
  expect((await page.locator("h1").innerText()).includes("Lucie, choose a time"), "her page");
  const times = page.locator(".pick-time");
  expect(await times.count() > 3, "free times offered");
  await times.nth(1).click();
  const confirm = page.getByRole("button", { name: /^Confirm /u });
  const said = await confirm.innerText();
  await confirm.click();
  await page.waitForSelector("h1 >> text=Your interview is booked");
  expect((await page.locator(".lede").innerText()).includes("Senior furniture designer"), "booked, said with the job");
  const log = await dev();
  expect(log.includes("Interview on ") && log.includes("chose their interview"), "the confirmation email and the team's bell");
  await page.goto(link.replace(/^https?:\/\/[^/]+/u, origin));
  expect((await page.locator("h1").innerText()).includes("booked"), "the link now says it is booked: " + said);
  await as(context, origin, "camille");
  await english();
  await page.goto(origin + "/chest/candidates/1");
  const history = await page.locator("main").innerText();
  expect(history.includes("Chose the interview time"), "in her history");
  expect(!history.includes("Waiting for them to choose"), "no longer waiting");
});

await step("one place for the careers brand: with the Chest's brand, Hiring's colour and logo step aside and Settings says where it comes from; a team theme never dresses the careers page", async () => {
  await as(context, origin, "camille");
  await english();
  await page.request.post(origin + "/_dev/theme", { form: { level: "all", choice: "brand:sample" } });
  try {
    await page.goto(origin + "/chest/settings");
    const text = await page.locator("main").innerText();
    expect(text.includes("wears your company’s brand") && !text.includes("Colour"), "the brand's place said; no colour picker");
    expect(await page.getByRole("button", { name: /Add|Replace/u }).filter({ hasText: /logo/iu }).count() === 0, "no logo of Hiring's own");
  } finally {
    await page.request.post(origin + "/_dev/theme", { form: { level: "all", choice: "catalogue:confetti" } });
  }
  try {
    await context.clearCookies();
    await page.goto(origin + "/?fresh=theme");
    expect((await page.locator("[data-look]").first().getAttribute("data-look")) === "own", "candidates see Hiring's own look");
    await as(context, origin, "camille");
    await english();
    await page.goto(origin + "/chest/settings");
    expect((await page.locator("[data-look]").first().getAttribute("data-look")) === "catalogue", "the team wears the company's theme");
    expect((await page.locator("main").innerText()).includes("Colour"), "without a brand, Hiring's colour is the careers page's");
  } finally {
    await page.request.post(origin + "/_dev/theme", { form: { level: "all", choice: "own" } });
    await as(context, origin, "camille");
    await english();
  }
});

await step("search finds Hélène without the accent; the talent pool lists who agreed", async () => {
  await page.locator("#top-q").fill("helene");
  await page.locator("#top-q").press("Enter");
  await page.waitForURL(/\/chest\/search\?q=helene/u);
  expect((await page.locator(".found-list").innerText()).includes("Hélène Vasseur"), "found");
  await page.goto(origin + "/chest/pool");
  const pool = await page.locator(".found-list").innerText();
  expect(pool.includes("Nina Rousseau") && pool.includes("Lucie Garnier"), "pool: " + pool.slice(0, 80));
});

await step("select two candidates on the board and move them together, with Undo", async () => {
  await page.goto(origin + "/chest/jobs/3");
  await page.getByRole("button", { name: "Select" }).click();
  await page.locator(".cand.pick", { hasText: "Manon Girard" }).click();
  await page.locator(".cand.pick", { hasText: "Hélène Vasseur" }).click();
  expect((await page.locator(".bulk-count").innerText()).includes("2 selected"), "2 selected");
  await page.locator("#bulk-move").selectOption({ label: "Offer" });
  await page.waitForSelector(".ck-toast");
  expect((await page.locator(".ck-toast").innerText()).includes("2 candidates moved to Offer"), "moved");
  await page.waitForTimeout(800);
  await page.reload();
  expect((await page.locator(".lane").nth(3).innerText()).includes("Manon Girard"), "in Offer");
});

await step("French screens: default stages in French, never mixed", async () => {
  await context.addCookies([{ name: "dev_locale", value: "fr", url: origin }]);
  await page.goto(origin + "/chest/jobs/1");
  const lanes = await page.locator(".lane-head h2").allTextContents();
  expect(lanes.join("|") === "Nouveaux|Présélection|Entretien|Proposition|Embauché", "French stages: " + lanes.join("|"));
  await english();
});

await step("import candidates from a Teamtailor-style CSV, then Undo", async () => {
  await page.goto(origin + "/chest/jobs/2/import");
  const csv = "First name,Last name,Email,Phone,Job,Stage,Created at,LinkedIn URL\nPaul,Martin,paul.martin@example.com,+33 6 00 00 00 01,Sales associate,Phone call,2026-09-01 10:12,linkedin.com/in/paulmartin\nIris,Dupuis,iris.dupuis@example.com,,Sales associate,New,2026-09-10,\nBad,Row,not-an-email,,,,2026-09-10,\n";
  await page.locator("input[type=file]").setInputFiles({ name: "teamtailor-candidates.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.waitForSelector(".preview-table");
  expect(await page.locator("#origin").inputValue() === "Teamtailor", "origin guessed");
  await page.getByRole("button", { name: /Import 3 candidates/u }).click();
  await page.waitForSelector("#step-cvs");
  const done = await page.locator("#step-cvs").locator("..").innerText();
  expect(done.includes("2 candidates imported") && done.includes("Row 4"), "imported, one skipped: " + done.slice(0, 120));
  await page.goto(origin + "/chest/jobs/2");
  expect((await page.locator(".lanes").innerText()).includes("Paul Martin"), "on the board");
});

await step("duplicate a job into a new draft", async () => {
  await page.goto(origin + "/chest/jobs/3");
  await page.locator(".job-actions .menu summary").click();
  await page.getByRole("button", { name: "Duplicate" }).click();
  await page.waitForURL(/\/chest\/jobs\/\d+\/edit$/u);
  expect((await page.getByLabel("Job title").inputValue()) === "Office manager", "copied");
});

await step("export everything as a ZIP; a candidate's own data", async () => {
  const zip = await page.request.get(origin + "/chest/export");
  expect(zip.status() === 200 && (await zip.body()).subarray(0, 2).toString() === "PK", "zip");
  const theirs = await page.request.get(origin + "/chest/candidates/1/data");
  expect(theirs.status() === 200 && (await theirs.body()).subarray(0, 2).toString() === "PK", "their data");
});

await step("write a job, publish it: it is on the careers page", async () => {
  await page.goto(origin + "/chest/jobs/new");
  await page.getByLabel("Job title").fill("Wood finisher");
  await page.getByLabel("Team").fill("Workshop");
  await page.getByLabel("Place", { exact: true }).fill("Lyon");
  // A real editor: nobody types a mark; the buttons have their words.
  expect(!(await page.locator("main").innerText()).includes("##"), "no raw marks on the page");
  const editor = page.getByRole("textbox", { name: "Description" });
  await editor.click();
  await page.getByRole("button", { name: "Heading", exact: true }).click();
  await page.keyboard.type("What you will do");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Oil, wax and varnish.");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.keyboard.type("Two years in a workshop");
  expect(await editor.locator("h3").count() === 1 && await editor.locator("li").count() === 1, "a heading and a list, as they will look");
  await page.getByRole("button", { name: "Save the draft" }).click();
  await page.waitForURL(/\/chest\/jobs\/\d+$/u);
  await page.getByRole("button", { name: "Publish" }).click();
  await page.waitForSelector(".ck-toast");
  await page.waitForTimeout(800);
  const careers = await (await page.request.get(origin + "/")).text();
  expect(careers.includes("Wood finisher"), "published");
  const jobPage = await (await page.request.get(origin + "/wood-finisher")).text();
  expect(/<h2[^>]*>(<span>)?What you will do/u.test(jobPage) && /<li[^>]*>(<span>)?Two years in a workshop(<\/span>)?<\/li>/u.test(jobPage) && /<p[^>]*>(<span>)*Oil, wax and varnish\./u.test(jobPage), "the job page shows the heading, the paragraph and the list");
});

await step("add a referral by hand with a CV", async () => {
  await page.goto(origin + "/chest/jobs/2/add");
  await page.getByLabel("Full name").fill("Yanis Brunet");
  await page.getByLabel("Email address").fill("yanis@example.com");
  await page.locator("input[type=file]").setInputFiles({ name: "Yanis.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.getByRole("button", { name: "Add the candidate" }).click();
  await page.waitForURL(/\/chest\/candidates\/\d+$/u, { timeout: 15000 });
  expect((await page.locator(".cand-head").innerText()).includes("Added by Camille Martin"), "added by");
  expect(await page.locator("iframe.cv-frame").count() === 1, "CV");
});

await step("a note, then erase the candidate", async () => {
  await page.locator("#note").fill("Met him at the Lyon furniture fair.");
  await page.getByRole("button", { name: "Add the note" }).click();
  await page.waitForTimeout(1000);
  expect((await page.locator(".note-list").innerText()).includes("furniture fair"), "note");
  await page.locator(".cand-actions .menu summary").click();
  await page.getByRole("button", { name: "Erase this candidate" }).click();
  await page.getByRole("button", { name: "Erase for good" }).click();
  await page.waitForTimeout(1500);
  await page.goto(origin + "/chest/jobs/2");
  expect(!(await page.locator(".lanes").innerText()).includes("Yanis Brunet"), "erased");
});

await step("export a job's candidates as CSV", async () => {
  const csv = await (await page.request.get(origin + "/chest/jobs/1/export")).text();
  expect(csv.includes("Name,Email,Phone") && csv.includes("Nina Rousseau"), "csv");
});

await step("the nightly cleanup runs", async () => {
  const r = await page.request.post(origin + "/_dev/schedule", { form: { name: "cleanup", back: "/_dev" }, maxRedirects: 0 });
  expect(r.status() === 303, "schedule: " + r.status());
});


// ——— Round 3: real calendars, lunch, files, photos, the candidate's language ———

// The next weekday at least two days ahead, as the Chest's zone writes it.
function weekdayAhead() {
  for (let n = 2; n < 9; n++) {
    const d = new Date(Date.now() + n * 86400000);
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(d);
    const wd = new Date(day + "T12:00:00Z").getUTCDay();
    if (wd !== 0 && wd !== 6) return day;
  }
}
const parisOffset = day => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", timeZoneName: "shortOffset" }).formatToParts(new Date(day + "T12:00:00Z")).find(p => p.type === "timeZoneName").value.replace("GMT", "") || 0);
const utcMinute = (day, hhmm) => new Date(Date.parse(`${day}T${hhmm}:00Z`) - parisOffset(day) * 3600000).toISOString().slice(0, 16) + "Z";

await step("Booking says Inès is at a showroom visit: Mathis is never offered that hour, nor lunch; the recruiter sees it as Booking's", async () => {
  await page.setViewportSize({ width: 1280, height: 860 });
  const day = weekdayAhead();
  const from = new Date().toISOString().slice(0, 10) + "T00:00Z";
  const data = { v: 1, member: "mbr_inesaaaaaaaaaaaaaaaaaaaaaa", at: new Date().toISOString(), from, to: new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10) + "T00:00Z", spans: [[utcMinute(day, "10:00"), utcMinute(day, "11:00")]] };
  await page.request.post(origin + "/_dev/deliver", { form: { type: "booking.busy", data: JSON.stringify(data) } });
  await as(context, origin, "camille");
  await english();
  await page.goto(origin + "/chest/candidates/2");
  await page.getByRole("button", { name: "Interview", exact: true }).click();
  const dialog = page.locator("dialog[open]");
  // The job's interviewers are ticked, the recruiter is not: the button says who.
  expect(!(await dialog.locator(".check", { hasText: "Camille Martin" }).locator("input").isChecked()), "the recruiter is not ticked silently");
  await dialog.locator(".check", { hasText: "Hugo Bernard" }).locator("input").uncheck();
  expect(await dialog.getByLabel("Not over lunch (12:00–14:00)").isChecked(), "lunch left out by default");
  // By hand, that day: Inès's visit, marked as Booking's.
  await dialog.getByText("I choose the time").click();
  await page.locator("#iv-day").fill(day);
  await page.locator("#iv-day").press("Tab");
  await page.waitForSelector("dialog[open] .busy");
  expect((await dialog.locator(".busy").innerText()).includes("Inès Moreau: 10:00–11:00 (Booking)"), "Booking's busy time shown");
  await dialog.getByText("Mathis chooses").click();
  const send = dialog.getByRole("button", { name: "Send the link (Inès)" });
  expect(await send.isVisible(), "the button names who meets them");
  await send.click();
  await page.waitForSelector(".ck-toast >> text=/Link sent to Mathis Laurent/");
  // One action, one line in the history.
  await page.reload();
  const history = await page.locator(".timeline").innerText();
  expect(history.split("\n").filter(l => /link to choose/u.test(l)).length === 1, "one history line: " + history.slice(0, 300));
  const link = /https?:\/\/[^\s"<]*\/interview\/[A-Za-z0-9_-]{43}\?lang=fr/u.exec(await dev())?.[0];
  expect(link, "the link carries Mathis's language");
  // Mathis, in an English browser: his page speaks French, as his emails.
  await context.clearCookies();
  await page.goto(link.replace(/^https?:\/\/[^/]+/u, origin));
  expect((await page.locator("h1").innerText()).includes("Mathis, choisissez"), "in French");
  const label = new Intl.DateTimeFormat("fr", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(day + "T12:00:00Z"));
  const that = page.locator(".pick-day", { hasText: label });
  const times = (await that.locator(".pick-time").allInnerTexts()).map(x => x.trim());
  expect(times.includes("09:00") && times.includes("11:00") && times.includes("14:00"), "free times: " + times.join(" "));
  expect(!["09:30", "10:00", "10:30", "12:00", "12:30", "13:00", "13:30"].some(t => times.includes(t)), "never across the visit or lunch: " + times.join(" "));
});

// The weekday after a day (a day as the Chest's zone writes it).
const weekdayAfter = day => {
  let d = day;
  do d = new Date(Date.parse(d + "T12:00:00Z") + 86400000).toISOString().slice(0, 10); while ([0, 6].includes(new Date(d + "T12:00:00Z").getUTCDay()));
  return d;
};

await step("Leave says Inès is off a whole day: Mathis is offered no time that day, the recruiter reads « off all day »; « now free » gives the day back", async () => {
  await page.setViewportSize({ width: 1280, height: 860 });
  const off = weekdayAfter(weekdayAhead());
  const next = new Date(Date.parse(off + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);
  // Leave's snapshot: times only (the whole day in Paris), never the kind of leave.
  const snapshot = (spans, at) => ({ v: 1, member: "mbr_inesaaaaaaaaaaaaaaaaaaaaaa", at: at.toISOString(), from: new Date().toISOString().slice(0, 10) + "T00:00Z", to: new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10) + "T00:00Z", spans });
  await page.request.post(origin + "/_dev/deliver", { form: { type: "leave.busy", data: JSON.stringify(snapshot([[utcMinute(off, "00:00"), utcMinute(next, "00:00")]], new Date())) } });
  // Mathis's link (sent in the step before): that day offers nothing.
  const link = /https?:\/\/[^\s"<]*\/interview\/[A-Za-z0-9_-]{43}\?lang=fr/u.exec(await dev())?.[0];
  expect(link, "Mathis's link");
  const label = new Intl.DateTimeFormat("fr", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(off + "T12:00:00Z"));
  const timesThatDay = async () => {
    await context.clearCookies();
    await page.goto(link.replace(/^https?:\/\/[^/]+/u, origin));
    await page.waitForSelector(".pick-day");
    // Every day, the folded ones too.
    const more = page.getByRole("button", { name: "Plus de jours" });
    if (await more.count() && await more.isVisible()) await more.click();
    return (await page.locator(".pick-day", { hasText: label }).locator(".pick-time").allInnerTexts()).map(x => x.trim());
  };
  expect((await timesThatDay()).length === 0, "no time on Inès's day off");
  // The recruiter choosing by hand reads it: off, never why.
  await as(context, origin, "camille");
  await english();
  await page.goto(origin + "/chest/candidates/2");
  await page.getByRole("button", { name: "Interview", exact: true }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByText("I choose the time").click();
  await page.locator("#iv-day").fill(off);
  await page.locator("#iv-day").press("Tab");
  await page.waitForSelector("dialog[open] .busy");
  const busy = await dialog.locator(".busy").innerText();
  expect(busy.includes("Inès Moreau: off all day"), "her day off shown: " + busy);
  await page.keyboard.press("Escape");
  // Her leave cancelled: Leave says she is free again; the day comes back.
  await page.request.post(origin + "/_dev/deliver", { form: { type: "leave.busy", data: JSON.stringify(snapshot([], new Date(Date.now() + 1000))) } });
  const back = await timesThatDay();
  expect(back.length > 0 && !["12:00", "12:30", "13:00", "13:30"].some(t => back.includes(t)), "the day offered again (never over lunch): " + back.join(" "));
});

await step("on a phone the candidate sees three days first, then « Plus de jours »", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const visible = await page.locator(".pick-day:visible").count();
  expect(visible === 3, "three days first, not " + visible);
  await page.getByRole("button", { name: "Plus de jours" }).click();
  expect(await page.locator(".pick-day:visible").count() > 3, "then the others");
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(!wide, "no sideways scroll");
  await page.setViewportSize({ width: 1280, height: 860 });
});

await step("an offer letter: a template carries it, the email sends it, the conversation keeps it", async () => {
  await as(context, origin, "camille");
  await english();
  await page.goto(origin + "/chest/settings");
  await page.getByRole("button", { name: "Add a template" }).click();
  await page.locator("#tpl-name").fill("Offer with the letter");
  await page.locator("#tpl-subject").fill("Our offer, {firstName}");
  await page.locator("#tpl-body").fill("Hello {firstName},\n\nPlease find our offer letter attached.\n\n{sender}");
  await page.locator(".template-form input[type=file]").setInputFiles({ name: "Offer letter.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.waitForSelector(".template-form .ck-file-ready, .template-form .ck-file:not(.ck-file-sending)");
  await page.locator(".template-form").getByRole("button", { name: "Save" }).click();
  await page.waitForSelector("text=Offer with the letter");
  expect((await page.locator(".people-list").innerText()).includes("1 file"), "the template says it has a file");
  await page.goto(origin + "/chest/candidates/3");
  await page.getByRole("button", { name: "Write" }).click();
  await page.locator("#write-template").selectOption({ label: "Offer with the letter" });
  const dialog = page.locator("dialog[open]");
  expect((await dialog.locator(".ck-file-list").innerText()).includes("Offer letter.pdf"), "the template's file is there");
  // And one more, added here.
  await dialog.locator("input[type=file]").setInputFiles({ name: "Contract.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.waitForFunction(() => document.querySelectorAll("dialog[open] .ck-file-sending").length === 0);
  await dialog.getByRole("button", { name: "Send" }).click();
  await page.waitForSelector(".ck-toast >> text=/Sent to Aïcha Benali/");
  await page.reload();
  const files = page.locator(".mails .mail-files a");
  const names = await files.allInnerTexts();
  expect(names.some(n => n.includes("Offer letter.pdf")) && names.some(n => n.includes("Contract.pdf")), "kept in the conversation: " + names.join(", "));
  const body = await (await page.request.get(origin + (await files.first().getAttribute("href")))).body();
  expect(body.subarray(0, 5).toString() === "%PDF-", "the file downloads");
});

await step("a candidate's own data carries the files sent to her (the offer letter), and the full export too (round 3 limit)", async () => {
  // Aïcha (3) was sent the offer letter and a contract in the step above.
  const theirs = await page.request.get(origin + "/chest/candidates/3/data");
  const zip = await theirs.body();
  expect(theirs.status() === 200 && zip.subarray(0, 2).toString() === "PK", "their data");
  const names = zip.toString("latin1");
  expect(/emails\/\d+\/Offer letter\.pdf/u.test(names) && /emails\/\d+\/Contract\.pdf/u.test(names), "both files in her archive, under their email");
  const all = (await (await page.request.get(origin + "/chest/export")).body()).toString("latin1");
  expect(/emails\/\d+\/Offer letter\.pdf/u.test(all) && /emails\/\d+\/Contract\.pdf/u.test(all), "and in the full export");
});

await step("the morning schedule: each interviewer gets the day's interviews by email, in their language (their email choice applied by the Chest)", async () => {
  // The sample has Karim Haddad's interview at 09:00 this morning, Paris
  // time, with Hugo and Inès — seeded relative to Paris's day, so this
  // step holds at any hour.
  const r = await page.request.post(origin + "/_dev/schedule", { form: { name: "morning", back: "/_dev" }, maxRedirects: 0 });
  expect(r.status() === 303, "schedule: " + r.status());
  const log = await dev();
  const mail = log.split("<li>").find(item => item.includes("<b>Your interviews today</b>"));
  expect(Boolean(mail) && mail.includes("hugo@example.test") && mail.includes("09:00 — Karim Haddad") && mail.includes("/chest/candidates/8"), "Hugo's morning email, with the time, the name and the link");
  // Run again (a retry): still one email for him today.
  await page.request.post(origin + "/_dev/schedule", { form: { name: "morning", back: "/_dev" }, maxRedirects: 0 });
  const again = await dev();
  expect(again.split("<b>Your interviews today</b>").length - 1 === 1, "one a day");
  // Every interviewer on it gets theirs in their own language: Inès reads French.
  const ines = again.split("<li>").find(item => item.includes("<b>Vos entretiens aujourd’hui</b>"));
  expect(Boolean(ines) && ines.includes("ines@example.test") && ines.includes("Bonjour Inès") && ines.includes("09:00 — Karim Haddad"), "Inès's, in French");
  expect(again.split("<b>Vos entretiens aujourd’hui</b>").length - 1 === 1, "one for her too");
});

await step("a candidate applies from a phone with a photo of her CV; the team sees it on her page", async () => {
  await context.clearCookies();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/lang/en?back=/senior-furniture-designer/apply");
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);
  await fillApplication("Nadia Photo", "nadia.photo@example.com", { name: "IMG_2041.jpg", mimeType: "image/jpeg", buffer: jpeg });
  await page.waitForFunction(() => document.querySelectorAll(".ck-file-sending").length === 0);
  expect(!(await page.locator(".ck-file-problems").innerText()).includes("not accepted"), "a photo is accepted");
  await page.getByRole("button", { name: "Send my application" }).click();
  await page.waitForURL(/\/thanks/u);
  await page.setViewportSize({ width: 1280, height: 860 });
  await as(context, origin, "camille");
  await english();
  await page.goto(origin + "/chest/search?q=Nadia");
  await page.getByRole("link", { name: /Nadia Photo/u }).first().click();
  await page.waitForSelector("img.cv-picture");
  const cv = await page.request.get(origin + (await page.locator("img.cv-picture").getAttribute("src")));
  expect(cv.status() === 200 && cv.headers()["content-type"] === "image/jpeg", "the photo is served");
});

await step("French for Camille: « Nous vous préviendrons », the jury, a quiet « Ajouter un candidat »", async () => {
  await as(context, origin, "camille");
  await context.addCookies([{ name: "dev_locale", value: "fr", url: origin }]);
  await page.goto(origin + "/chest/jobs/1");
  const add = page.getByRole("link", { name: "Ajouter un candidat" });
  expect((await add.getAttribute("class")).includes("quiet"), "adding by hand is not the page's main button");
  await page.goto(origin + "/chest/jobs/1/settings");
  expect((await page.locator("main").innerText()).includes("Jury"), "the jury");
  await page.goto(origin + "/chest/candidates/3");
  await page.getByRole("button", { name: "Entretien", exact: true }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByRole("button", { name: /^Envoyer le lien/u }).click();
  await page.waitForSelector(".ck-toast");
  expect((await page.locator(".ck-toast").innerText()).includes("Nous vous préviendrons"), "no « prévenu » said to Camille");
  await english();
});

await step("phone width: careers, job, form, board, candidate fit", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/senior-furniture-designer", "/senior-furniture-designer/apply", "/chest", "/chest/jobs/1", "/chest/candidates/1", "/chest/jobs/1/settings", "/chest/settings", "/chest/reports?job=1", "/chest/pool", "/chest/search?q=lu", "/chest/jobs/2/import", "/sales-associate-lyon-showroom/apply"]) {
    await page.goto(origin + path);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width <= 392, `${path} overflows: ${width}`);
  }
  // The board: one stage at a time under its tabs, which are never cut.
  await page.goto(origin + "/chest/jobs/1");
  expect(await page.locator(".lane:visible").count() === 1, "one stage shown");
  const lanes = await page.evaluate(() => { const l = document.querySelector(".lanes"); return l ? l.scrollWidth - l.clientWidth : -1; });
  expect(lanes <= 1, "no sideways scroll in the board: " + lanes);
  const tabs = await page.locator(".stage-tabs button").evaluateAll(els => els.every(e => e.getBoundingClientRect().right <= window.innerWidth + 1));
  expect(tabs, "every stage tab fits the screen");
  await page.locator(".stage-tabs button", { hasText: "Interview" }).click();
  expect((await page.locator(".lane:visible h2").innerText()).includes("Interview"), "the tab shows its stage");
});

await browser.close();
done(problems);
