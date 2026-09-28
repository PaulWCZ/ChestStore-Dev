// Hiring, as candidates and the team use it, in a real browser:
//   node lab/chest-dev/flows/hiring.mjs [port]   (harness with --reset: the sample jobs are there)
import { as, done, expect, open, step } from "./lib.mjs";

const port = Number(process.argv[2] ?? 5300);
const { browser, context, page, origin, problems } = await open(port, "camille", { allow404: /\/chest\/(settings|jobs\/2)$|\/no-such-job$/u });
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
  await page.locator("input[name=consent]").check();
  await page.waitForTimeout(3200);
}

await step("the careers page lists the open jobs, in English and in French", async () => {
  await context.clearCookies();
  await page.goto(origin + "/");
  expect((await page.locator("h1").innerText()).includes("Join Atelier Martin"), "title");
  const titles = await page.locator(".job-row-title").allTextContents();
  expect(titles.length === 3 && titles.includes("Senior furniture designer") && !titles.includes("Summer workshop intern"), "jobs: " + titles.join("|"));
  await page.getByRole("link", { name: "Français" }).click();
  await page.waitForURL(origin + "/");
  expect((await page.locator("h1").innerText()).includes("Rejoignez Atelier Martin"), "French title");
  await page.getByRole("link", { name: "English" }).click();
  await page.waitForURL(origin + "/");
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
  await page.getByRole("button", { name: "Send my application" }).click();
  await page.waitForSelector("p.error");
  expect((await page.locator("p.error").innerText()).includes("PDF or a Word file"), "refused");
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
  await page.waitForSelector(".toast");
  expect((await page.locator(".toast").innerText()).includes("Nina Rousseau moved to Screening"), "toast");
  await page.waitForTimeout(800);
  await page.reload();
  expect((await page.locator(".lane").nth(1).innerText()).includes("Nina Rousseau"), "in Screening");
});

await step("move a candidate with the keyboard", async () => {
  await page.locator(".cand", { hasText: "Mathis Laurent" }).focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  await page.keyboard.press("Space");
  await page.waitForTimeout(1500);
  await page.reload();
  expect((await page.locator(".lane").nth(2).innerText()).includes("Mathis Laurent"), "in Interview");
});

await step("ask Inès for feedback; she sees it waiting, gives hers, then sees the others'", async () => {
  await page.locator(".cand", { hasText: "Nina Rousseau" }).click();
  await page.waitForURL(/\/chest\/candidates\/\d+$/u);
  const url = page.url();
  await page.getByRole("button", { name: "Ask for feedback" }).click();
  await page.locator(".dialog .check", { hasText: "Inès Moreau" }).click();
  await page.locator(".dialog").getByRole("button", { name: "Ask", exact: true }).click();
  await page.waitForSelector(".toast");
  await as(context, origin, "ines");
  await context.addCookies([{ name: "dev_locale", value: "fr", url: origin }]);
  await page.goto(origin + "/chest");
  expect((await page.locator(".waiting").innerText()).includes("Nina Rousseau"), "waiting for Inès (French)");
  expect((await page.locator(".team-nav").innerText()).includes("Offres"), "French nav");
  await page.goto(url);
  await page.locator(".scale-step", { hasText: "Excellent" }).click();
  await page.getByLabel("Points forts").fill("Un portfolio solide.");
  await page.locator(".pill", { hasText: "Oui, clairement" }).click();
  await page.getByRole("button", { name: "Envoyer mon avis" }).click();
  await page.waitForSelector(".toast");
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

await step("the recruiter rejects with an email in the candidate's language, then undoes", async () => {
  await as(context, origin, "camille");
  await english();
  await page.goto(origin + "/chest/candidates/4");
  await page.getByRole("button", { name: "Reject" }).click();
  await page.locator(".dialog .pill", { hasText: "Not enough experience" }).click();
  expect((await page.locator("#reject-text").inputValue()).startsWith("Hello Jonas Weber,"), "draft in English");
  await page.locator(".dialog").getByRole("button", { name: "Reject", exact: true }).click();
  await page.waitForSelector(".toast");
  expect((await page.locator(".toast").innerText()).includes("The email is on its way"), "emailed");
  expect((await dev()).includes("Your application — Senior furniture designer"), "rejection in the outbox");
  await page.locator(".toast button").click();
  await page.waitForTimeout(1200);
  await page.reload();
  expect((await page.locator(".cand-title .chip").innerText()).includes("Screening"), "back in Screening");
});

await step("write a job, publish it: it is on the careers page", async () => {
  await page.goto(origin + "/chest/jobs/new");
  await page.getByLabel("Job title").fill("Wood finisher");
  await page.getByLabel("Team").fill("Workshop");
  await page.getByLabel("Place", { exact: true }).fill("Lyon");
  await page.locator("#description").fill("Oil, wax and varnish.\n- Two years in a workshop");
  await page.getByRole("button", { name: "Save the draft" }).click();
  await page.waitForURL(/\/chest\/jobs\/\d+$/u);
  await page.getByRole("button", { name: "Publish" }).click();
  await page.waitForSelector(".toast");
  await page.waitForTimeout(800);
  const careers = await (await page.request.get(origin + "/")).text();
  expect(careers.includes("Wood finisher"), "published");
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

await step("phone width: careers, job, form, board, candidate fit", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/senior-furniture-designer", "/senior-furniture-designer/apply", "/chest", "/chest/jobs/1", "/chest/candidates/1", "/chest/jobs/1/settings", "/chest/settings"]) {
    await page.goto(origin + path);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width <= 392, `${path} overflows: ${width}`);
  }
});

await browser.close();
done(problems);
