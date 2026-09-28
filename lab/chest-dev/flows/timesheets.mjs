// Timesheets, as people use it, in a real browser: node lab/chest-dev/flows/timesheets.mjs [port]
// (the harness runs the tool with --reset: Atelier Martin's sample data is there).
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { as, done, expect, id, open, step } from "./lib.mjs";

const port = Number(process.argv[2] ?? 5200);
const { browser, context, page, origin, problems } = await open(port, "hugo", { locale: "en" });
const tmp = process.env.TMPDIR ?? "/tmp";
const db = postgres((process.env.DEV_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres").replace(/\/[^/]*$/u, "/t_timesheets"), { max: 1, onnotice: () => {} });
const toast = async text => {
  await page.locator(".toast", { hasText: text }).first().waitFor({ timeout: 5000 });
};

await step("start the timer on a project; it survives a reload; stop records it", async () => {
  await page.goto(origin + "/chest");
  await page.getByPlaceholder("What are you working on?").fill("Checkout page");
  await page.locator("#timer-work").selectOption({ label: "Site vitrine · Développement" });
  await page.getByRole("button", { name: "Start" }).click();
  await page.locator(".timer.running").waitFor();
  await page.waitForTimeout(1500);
  await page.reload();
  await page.locator(".timer.running").waitFor();
  expect(await page.locator("#timer-note").inputValue() === "Checkout page", "note kept");
  expect(/0:00:0\d|0:00:1\d/u.test(await page.locator(".timer-clock").innerText()), "clock ticks");
  await page.getByRole("button", { name: "Stop" }).click();
  await toast("Under a minute");
  await page.locator(".timer.idle").waitFor();
});

await step("a forgotten timer asks when it stopped, and records that time", async () => {
  await page.getByPlaceholder("What are you working on?").fill("Long session");
  await page.getByRole("button", { name: "Start" }).click();
  await page.locator(".timer.running").waitFor();
  await page.waitForTimeout(800);
  await db`update timers set started_at = now() - interval '11 hours' where member_id = ${id("hugo")}`;
  await page.reload();
  const dialog = page.getByRole("dialog", { name: "Is your timer still running?" });
  await dialog.waitFor();
  const options = await dialog.locator("select option").count();
  expect(options > 40, "quarter-hour choices: " + options);
  await dialog.locator("select").selectOption({ index: 16 });
  await dialog.getByRole("button", { name: "Save this time" }).click();
  await toast("recorded on Site vitrine");
  await page.locator(".timer.idle").waitFor();
});

await step("type hours in the week grid; a wrong entry is refused, a right one stays", async () => {
  await page.goto(origin + "/chest");
  const cell = page.locator("[data-cell='0:2']");
  await cell.fill("1h 30");
  await page.keyboard.press("Tab");
  await page.waitForTimeout(1200);
  await page.reload();
  expect(await page.locator("[data-cell='0:2']").inputValue() === "1:30", "saved as 1:30: " + await page.locator("[data-cell='0:2']").inputValue());
  await page.locator("[data-cell='0:3']").fill("lots");
  await page.keyboard.press("Enter");
  await toast("is not a duration");
  expect(await page.locator("[data-cell='0:3']").getAttribute("aria-invalid") === "true", "marked invalid");
});

await step("add a row, copy last week's rows, remove a row and undo", async () => {
  const before = await page.locator(".grid tbody tr").count();
  await page.getByRole("button", { name: "Add a row" }).click();
  await page.locator("#add-row").selectOption({ label: "Signalétique · Repérage" });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForTimeout(1200);
  const rows = await page.locator(".grid tbody tr").count();
  expect(rows >= before, `rows ${before} → ${rows}`);
  await page.getByRole("button", { name: "Copy last week’s rows" }).click();
  await page.locator(".toast").last().waitFor();
  const last = page.locator(".grid tbody tr").last();
  const name = await last.locator(".row-name .p").innerText();
  const count = await page.locator(".grid tbody tr").count();
  await last.locator("button[aria-label^='Remove the row']").click();
  await toast("Row removed.");
  await page.locator(".toast", { hasText: "Row removed." }).getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(1500);
  await page.reload();
  expect(await page.locator(".grid tbody tr").count() === count, "row back: " + name);
});

await step("the day list: add time, change it, delete it and undo", async () => {
  await page.locator(".day-head a").nth(1).click();
  await page.waitForURL(/day=/u);
  await page.getByRole("button", { name: "Add time" }).click();
  await page.locator("#new-work").selectOption({ label: "Identité visuelle" });
  await page.locator("#new-duration").fill("45m");
  await page.locator("#new-note").fill("Call with the garage");
  await page.getByRole("button", { name: "Save" }).click();
  await toast("0:45 added.");
  const entry = page.locator(".entry", { hasText: "Call with the garage" });
  await entry.waitFor();
  await entry.getByRole("button", { name: /^Change/u }).click();
  await page.locator(".entry.editing input[id$='-duration']").fill("1:15");
  await page.getByRole("button", { name: "Save" }).click();
  await toast("Saved.");
  await page.locator(".entry", { hasText: "Call with the garage" }).locator(".entry-time", { hasText: "1:15" }).waitFor();
  await page.locator(".entry", { hasText: "Call with the garage" }).getByRole("button", { name: /^Delete/u }).click();
  await toast("Entry deleted.");
  await page.locator(".toast", { hasText: "Entry deleted." }).getByRole("button", { name: "Undo" }).click();
  await page.locator(".entry", { hasText: "Call with the garage" }).waitFor();
});

await step("a member's reports show their own time, with a CSV; managers' pages are closed to them", async () => {
  await page.goto(origin + "/chest/reports?preset=month");
  await page.getByText("Your own time.").waitFor();
  expect(!(await page.getByRole("link", { name: "Projects" }).count()), "no projects tab");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download CSV" }).click()]);
  const path = join(tmp, "timesheets-flow.csv");
  await download.saveAs(path);
  const { readFileSync } = await import("node:fs");
  const csv = readFileSync(path, "utf8");
  expect(csv.includes("Date,Person,Client") && !csv.includes("Inès"), "own CSV");
  await page.goto(origin + "/chest/projects");
  await page.getByText("Your role does not allow this.").waitFor();
});

await step("a manager, in French: a new project with a new client, a rate and a budget", async () => {
  await as(context, origin, "camille");
  await context.addCookies([{ name: "dev_locale", value: "fr", url: origin }]);
  await page.goto(origin + "/chest/projects");
  await page.getByRole("link", { name: "Nouveau projet" }).first().click();
  await page.locator("#p-name").fill("Salon de l'auto");
  await page.locator("#p-client").selectOption({ label: "Nouveau client…" });
  await page.locator("#p-new-client").fill("Concession Arnaud");
  await page.locator("#p-rate").fill("90,50");
  await page.getByText("Heures", { exact: true }).click();
  await page.locator("#p-budget").fill("40");
  await page.getByRole("button", { name: "Créer le projet" }).click();
  await page.waitForURL(/\/chest\/projects$/u);
  const row = page.locator(".project-row", { hasText: "Salon de l'auto" });
  await row.waitFor();
  expect((await row.innerText()).includes("90,50"), "rate in French: " + await row.innerText());
});

await step("the manager's reports: everyone, amounts, grouped by person", async () => {
  await page.goto(origin + "/chest/reports?preset=lastWeek");
  await page.getByText("Montant").first().waitFor();
  await page.getByText("Personne", { exact: true }).first().click();
  await page.waitForURL(/group=person/u);
  const names = await page.locator(".lines tbody th .p").allInnerTexts();
  expect(names.length >= 5, "people: " + names.join("|"));
});

await step("lock a period: the week shows why nothing changes there", async () => {
  await page.goto(origin + "/chest/settings");
  await page.getByRole("button", { name: "Tout déverrouiller" }).click();
  await page.locator(".toast", { hasText: "Tout est déverrouillé." }).waitFor();
  const lastMonday = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7); return d.toISOString().slice(0, 10); });
  await page.locator("#lock-until").fill(lastMonday);
  await page.getByRole("button", { name: "Verrouiller", exact: true }).click();
  await page.locator(".toast", { hasText: "Verrouillé jusqu’au" }).waitFor();
  await page.goto(origin + `/chest?week=${lastMonday}`);
  await page.locator(".notice", { hasText: "verrouillé" }).first().waitFor();
  expect(await page.locator(".grid td.ro").count() > 0, "locked cells read-only");
  await page.goto(origin + "/chest/settings");
  await page.getByRole("button", { name: "Tout déverrouiller" }).click();
  await page.locator(".toast", { hasText: "Tout est déverrouillé." }).waitFor();
});

await step("import a Toggl export: check, then import", async () => {
  const file = join(tmp, "toggl-flow.csv");
  writeFileSync(file, [
    "User,Email,Client,Project,Task,Description,Billable,Start date,Start time,End date,End time,Duration,Tags",
    "Hugo Bernard,hugo@example.test,Boulangerie Dupain,Site vitrine,Développement,Old checkout,Yes,2026-06-02,09:00:00,2026-06-02,11:00:00,02:00:00,",
    "MOREAU Inès,ines@example.test,Studio Nuit,Affiches,,Poster,Yes,2026-06-03,14:00:00,2026-06-03,15:30:00,01:30:00,",
    "Paul Personne,paul@example.test,Studio Nuit,Affiches,,Poster,Yes,2026-06-03,14:00:00,2026-06-03,15:30:00,01:30:00,",
  ].join("\n"));
  await page.goto(origin + "/chest/import");
  await page.locator("input[type=file]").setInputFiles(file);
  await page.getByText("Vérifiez avant d’importer").waitFor();
  expect((await page.locator(".check-panel").innerText()).includes("2 saisies prêtes à importer"), await page.locator(".check-panel").innerText());
  expect(await page.locator(".import-people li.missing", { hasText: "Paul Personne" }).count() === 1, "unmatched listed");
  await page.getByRole("button", { name: "Importer 2 saisies" }).click();
  await page.getByText("2 saisies importées.").waitFor();
});

await step("on a phone, in French: the day replaces the grid; add time there", async () => {
  await as(context, origin, "ines");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/chest");
  expect(!(await page.locator(".grid-area").isVisible()), "grid hidden");
  expect(await page.locator(".day-strip").isVisible(), "day strip");
  await page.getByRole("button", { name: "Ajouter du temps" }).click();
  await page.locator("#new-work").selectOption({ label: "Site vitrine · Design" });
  await page.locator("#new-duration").fill("2,5");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.locator(".toast", { hasText: "2:30 ajoutées." }).waitFor();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width <= 390, "no horizontal scroll: " + width);
});

await db.end();
await browser.close();
done(problems);
