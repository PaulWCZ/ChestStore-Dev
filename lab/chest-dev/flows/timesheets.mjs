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
// The kit's Segmented (0.2.1+): the radio is hidden, its word is what one
// taps; the radio then says it is chosen.
const choose = async (name, exact = false) => {
  const radio = page.getByRole("radio", { name, exact });
  await page.locator("label.ck-segment").filter({ has: page.getByRole("radio", { name, exact }) }).click();
  expect(await radio.isChecked(), `${name} chosen`);
};
const toast = async text => {
  await page.locator(".ck-toast", { hasText: text }).first().waitFor({ timeout: 5000 });
};
// The project picker is a combobox: type a few words, Enter takes the first.
const pick = async (selector, words) => {
  await page.locator(selector).click();
  await page.locator(selector).fill(words);
  await page.locator(".picker-option").first().waitFor();
  await page.keyboard.press("Enter");
};

await step("start the timer on a project; it survives a reload; stop records it", async () => {
  await page.goto(origin + "/chest");
  await page.getByPlaceholder("What are you working on?").fill("Checkout page");
  await pick("#timer-work", "vitrine dévelop");
  expect(await page.locator("#timer-work").inputValue() === "Site vitrine · Développement", "picked by typing: " + await page.locator("#timer-work").inputValue());
  await page.getByRole("button", { name: "Start" }).click();
  await page.locator(".timer.running").waitFor();
  await page.waitForTimeout(1500);
  await page.reload();
  await page.locator(".timer.running").waitFor();
  expect(await page.locator("#timer-note").inputValue() === "Checkout page", "note kept");
  expect(/0:00:0\d|0:00:1\d/u.test(await page.locator(".timer-clock").innerText()), "clock ticks");
  await page.getByRole("button", { name: "Stop" }).click();
  await toast("Under a minute");
  // Offered, on the timer's line: keep one minute rather than nothing.
  await page.locator(".timer").getByRole("button", { name: "Keep 1 min" }).click();
  await toast("0:01 recorded on Site vitrine");
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
  await pick("#add-row", "signal repérage");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForTimeout(1200);
  const rows = await page.locator(".grid tbody tr").count();
  expect(rows >= before, `rows ${before} → ${rows}`);
  await page.getByRole("button", { name: "Copy last week’s rows" }).click();
  await page.locator(".ck-toast").last().waitFor();
  const last = page.locator(".grid tbody tr").last();
  const name = await last.locator(".row-name .p").innerText();
  const count = await page.locator(".grid tbody tr").count();
  await last.locator("button[aria-label^='Remove the row']").click();
  await toast("Row removed.");
  await page.locator(".ck-toast", { hasText: "Row removed." }).getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(1500);
  await page.reload();
  expect(await page.locator(".grid tbody tr").count() === count, "row back: " + name);
});

await step("the day list: add time, change it, delete it and undo", async () => {
  await page.locator(".day-head a").nth(1).click();
  await page.waitForURL(/day=/u);
  await page.getByRole("button", { name: "Add time" }).click();
  await pick("#new-work", "identité");
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
  await page.locator(".ck-toast", { hasText: "Entry deleted." }).getByRole("button", { name: "Undo" }).click();
  await page.locator(".entry", { hasText: "Call with the garage" }).waitFor();
});

await step("a note in a grid cell: Shift+Enter, write, Enter", async () => {
  await page.goto(origin + "/chest");
  await page.locator("[data-cell='0:2']").focus();
  await page.keyboard.press("Shift+Enter");
  const box = page.getByRole("dialog", { name: /^Note of/u });
  await box.waitFor();
  await box.locator("textarea").fill("Checkout page, second pass");
  await page.keyboard.press("Enter");
  await toast("Note saved.");
  await page.reload();
  expect(await page.locator("td.noted .note-button.has").count() >= 1, "note shown on the cell");
  expect((await page.locator("[data-cell='0:2']").getAttribute("aria-label"))?.includes("Checkout page, second pass"), "the note is read with the cell");
});

await step("send my week: it becomes read-only, and can be taken back", async () => {
  await page.getByRole("button", { name: "Send my week" }).click();
  await toast("Week sent.");
  await page.locator(".standing.submitted").waitFor();
  expect(await page.locator(".grid .cell-input").count() === 0, "no cell can be typed in");
  await page.getByRole("button", { name: "Take it back" }).first().click();
  await toast("Week taken back");
  await page.locator(".grid .cell-input").first().waitFor();
  await page.getByRole("button", { name: "Send my week" }).click();
  await toast("Week sent.");
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
  const answer = await page.goto(origin + "/chest/projects");
  await page.getByText("This page is for managers").waitFor();
  expect(answer?.status() === 403, "manager page answers 403: " + answer?.status());
  expect(!(await page.getByText("You can’t use this tool yet").count()), "no 'can't use the tool' for a member");
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
  await choose("Heures", true);
  await page.locator("#p-budget").fill("40");
  await page.getByRole("button", { name: "Créer le projet" }).click();
  await page.waitForURL(/\/chest\/projects$/u);
  const row = page.locator(".project-row", { hasText: "Salon de l'auto" });
  await row.waitFor();
  expect((await row.innerText()).includes("90,50"), "rate in French: " + await row.innerText());
});

await step("the team: approve last week, send this one back with a word, remind who is short", async () => {
  await page.goto(origin + "/chest/team");
  const rows = page.locator(".waiting-row", { hasText: "Hugo Bernard" });
  expect(await rows.count() === 2, "Hugo's two weeks wait: " + await rows.count());
  // Neither is complete (last week under 35:00, this one not over): no bulk
  // approval, and each line says why.
  expect(await page.getByRole("button", { name: /^Valider (les|la|toutes)/u }).count() === 0, "no bulk approval of short or unfinished weeks");
  expect(/semaine pas finie/u.test(await rows.last().innerText()) && /30:15 sur 35:00/u.test(await rows.first().innerText()), "shortness said: " + (await page.locator(".waiting").innerText()));
  // Weeks before a person's start in the tool are "—", never "short".
  const camille = page.locator("tr", { hasText: "Camille Martin" });
  expect((await camille.getByRole("link", { name: /avant son arrivée/u }).count()) === 1, "Camille's first week shown as before her start: " + (await camille.innerText()));
  // This week's (the newest) goes back with a word.
  await rows.last().getByRole("button", { name: "Renvoyer…" }).click();
  await page.getByPlaceholder("Que faut-il corriger\u202f?").fill("Il manque la réunion de mardi");
  await page.getByRole("button", { name: "Renvoyer", exact: true }).click();
  await page.locator(".ck-toast", { hasText: "Semaine renvoyée à Hugo Bernard." }).waitFor();
  // A short week: approving asks first, saying what it holds.
  await page.locator(".waiting-row", { hasText: "Hugo Bernard" }).first().getByRole("button", { name: "Valider" }).click();
  await page.getByText(/30:15 sur 35:00\. La valider telle quelle\s\?/u).waitFor();
  await page.getByRole("button", { name: "Valider quand même" }).click();
  await page.locator(".ck-toast", { hasText: "La semaine de Hugo Bernard est validée." }).waitFor();
  await page.getByText("Aucune semaine ne vous attend.").waitFor();
  await page.getByRole("button", { name: /^Rappeler/u }).click();
  await page.locator(".ck-toast", { hasText: /rappelées? dans/u }).waitFor();
});

await step("rates: Hugo's goes up from today; the past keeps its amount", async () => {
  await page.goto(origin + "/chest/people");
  const hugo = page.locator(".person", { hasText: "Hugo Bernard" });
  await hugo.getByRole("button", { name: "Modifier" }).click();
  await hugo.locator("input[id^='bill-']").fill("80");
  await hugo.locator("input[id^='from-']").waitFor();
  await hugo.getByRole("button", { name: "Enregistrer" }).click();
  await page.locator(".ck-toast", { hasText: "Enregistré." }).waitFor();
  await page.locator(".person", { hasText: "Hugo Bernard" }).getByText(/à partir du/u).waitFor();
  const text = await page.locator(".person", { hasText: "Hugo Bernard" }).innerText();
  expect(/70,00\s€ depuis le début/u.test(text) && /80,00\s€ à partir du/u.test(text), "history: " + text);
});

await step("the manager's reports: everyone, amounts, grouped by person", async () => {
  await page.goto(origin + "/chest/reports?preset=lastWeek");
  await page.getByText("Montant").first().waitFor();
  await choose("Personne", true);
  await page.waitForURL(/group=person/u);
  const names = await page.locator(".breakdown tbody th .p").allInnerTexts();
  expect(names.length >= 5, "people: " + names.join("|"));
  await page.getByText("Marge", { exact: true }).first().waitFor();
  expect(await page.getByText("Coût", { exact: true }).count() >= 1, "cost shown to managers");
});

await step("mark the billable time of the week as invoiced, and undo", async () => {
  await page.goto(origin + "/chest/reports?preset=week&kind=uninvoiced");
  await page.getByRole("button", { name: /^Marquer .* comme facturées?$/u }).click();
  await page.locator(".ck-toast", { hasText: /marquées? comme facturées?/u }).waitFor();
  await page.getByText("Aucun temps noté sur cette période.").waitFor();
  await page.locator(".ck-toast", { hasText: /marquées? comme facturées?/u }).getByRole("button", { name: "Annuler l’action" }).click();
  await page.getByRole("button", { name: /^Marquer/u }).waitFor();
});

await step("lock a period: the week shows why nothing changes there", async () => {
  await page.goto(origin + "/chest/settings");
  await page.getByRole("button", { name: "Tout déverrouiller" }).click();
  await page.locator(".ck-toast", { hasText: "Tout est déverrouillé." }).waitFor();
  const lastMonday = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7); return d.toISOString().slice(0, 10); });
  // The kit's DateField: typed (an ISO date is read too), read on leaving it.
  await page.locator("#lock-until").fill(lastMonday);
  await page.locator("#lock-until").press("Enter");
  await page.getByRole("button", { name: "Verrouiller", exact: true }).click();
  await page.locator(".ck-toast", { hasText: "Verrouillé jusqu’au" }).waitFor();
  await page.goto(origin + `/chest?week=${lastMonday}`);
  await page.locator(".notice", { hasText: "verrouillé" }).first().waitFor();
  expect(await page.locator(".grid td.ro").count() > 0, "locked cells read-only");
  // A rate typed from a day in the locked period: refused with a sentence,
  // nothing saved (critique N1: it was saved from today, "Enregistré.").
  await page.goto(origin + "/chest/people");
  const hugo = page.locator(".person", { hasText: "Hugo Bernard" });
  const before = await hugo.innerText();
  expect(/Pas utilisé en ce moment\s: ses \d projets ont chacun leur propre taux/u.test(before), "where his usual rate applies: " + before);
  await hugo.getByRole("button", { name: "Modifier" }).click();
  await hugo.locator("input[id^='bill-']").fill("50");
  await hugo.locator("input[id^='from-']").fill(lastMonday);
  await hugo.locator("input[id^='from-']").press("Enter");
  await hugo.getByRole("button", { name: "Enregistrer" }).click();
  await hugo.locator(".ck-error", { hasText: /Verrouillé jusqu’au .*: un nouveau taux commence au plus tôt le/u }).waitFor();
  expect(await page.evaluate(() => document.activeElement?.id?.startsWith("from-")), "the day field has the focus");
  await page.waitForTimeout(800);
  expect(await page.locator(".ck-toast", { hasText: "Enregistré." }).count() === 0, "nothing saved");
  await hugo.getByRole("button", { name: "Annuler" }).click();
  await page.reload();
  expect(!/50,00\s€/u.test(await page.locator(".person", { hasText: "Hugo Bernard" }).innerText()), "no €50 rate anywhere");
  await page.goto(origin + "/chest/settings");
  await page.getByRole("button", { name: "Tout déverrouiller" }).click();
  await page.locator(".ck-toast", { hasText: "Tout est déverrouillé." }).waitFor();
});

await step("a lock day after today is refused as typed; the day the field held is not locked", async () => {
  // Kit 0.2.4: a day after `max` stays as typed, says why, and Save waits.
  // Before, the field kept its previous day (last month's end) and
  // "Lock" sent it — the bug class where Timesheets saved "today".
  await page.goto(origin + "/chest/settings");
  const was = await db`select locked_until from settings`;
  expect(was.length === 0 || was[0].locked_until === null, "nothing locked before: " + JSON.stringify(was));
  const held = await page.locator("#lock-until").inputValue();
  expect(held !== "", "the field holds a day before: " + held);
  // Three days ahead: after today in any time zone the Chest may use.
  const later = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 3); return d.toISOString().slice(0, 10); });
  await page.locator("#lock-until").fill(later);
  await page.locator("#lock-until").press("Tab");
  const field = page.locator(".ck-date", { has: page.locator("#lock-until") });
  await field.locator(".ck-error", { hasText: /or earlier\.|ou avant\./u }).waitFor();
  expect(await page.locator("#lock-until").getAttribute("aria-invalid") === "true", "the field says it is refused");
  expect(await page.locator("#lock-until").inputValue() === later, "the text stays as typed");
  const lockButton = page.locator(".date-form button[type=submit]");
  // The field tells the form after it shows its sentence: wait a moment for it.
  await lockButton.evaluate(b => new Promise(ok => { const t0 = Date.now(); const tick = () => (b.disabled || Date.now() - t0 > 3000 ? ok() : requestAnimationFrame(tick)); tick(); }));
  expect(await lockButton.isDisabled(), "Lock waits while the day is refused");
  // Even a submit forced past the button stops on the field.
  await page.locator(".date-form").evaluate(form => form.requestSubmit());
  await page.waitForTimeout(800);
  expect(await page.locator(".ck-toast", { hasText: /Verrouillé jusqu’au|Locked up to/u }).count() === 0, "no lock toast");
  const rows = await db`select locked_until from settings`;
  expect(rows.length === 0 || rows[0].locked_until === null, "nothing locked in the database: " + JSON.stringify(rows));
  // A good day then locks, as before.
  await page.locator("#lock-until").fill(held);
  await page.locator("#lock-until").press("Tab");
  await page.waitForFunction(() => document.getElementById("lock-until")?.getAttribute("aria-invalid") !== "true");
  await lockButton.evaluate(b => new Promise(ok => { const t0 = Date.now(); const tick = () => (!b.disabled || Date.now() - t0 > 3000 ? ok() : requestAnimationFrame(tick)); tick(); }));
  expect(!(await lockButton.isDisabled()), "Lock is back");
  await lockButton.click();
  await page.locator(".ck-toast", { hasText: /Verrouillé jusqu’au|Locked up to/u }).waitFor();
  const after = await db`select locked_until::text as d from settings`;
  expect(after[0]?.d !== null && after[0].d < later, "locked up to the good day: " + JSON.stringify(after));
  await page.getByRole("button", { name: /^(Tout déverrouiller|Unlock everything)$/u }).click();
  await page.locator(".ck-toast", { hasText: /Tout est déverrouillé|Everything is unlocked/u }).waitFor();
});

await step("import a Toggl export: check, then import", async () => {
  const file = join(tmp, "toggl-flow.csv");
  writeFileSync(file, [
    "User,Email,Client,Project,Task,Description,Billable,Start date,Start time,End date,End time,Duration,Tags",
    "Hugo Bernard,hugo@example.test,Boulangerie Dupain,Site vitrine,Développement,Old checkout,Yes,2026-06-02,09:00:00,2026-06-02,11:00:00,02:00:00,",
    "MOREAU Inès,ines@example.test,Studio Nuit,Affiches,,Poster,Yes,2026-06-03,14:00:00,2026-06-03,15:30:00,01:30:00,",
    "Paul Personne,paul@example.test,Studio Nuit,Affiches,,Poster,Yes,2026-06-03,14:00:00,2026-06-03,15:30:00,01:30:00,",
  ].join("\n"));
  // Last month invoiced again: locked (the step before unlocked everything).
  await page.goto(origin + "/chest/settings");
  await page.getByRole("button", { name: /^Verrouiller jusqu’au/u }).click();
  await page.locator(".ck-toast", { hasText: "Verrouillé jusqu’au" }).waitFor();
  await page.goto(origin + "/chest/import");
  await page.locator("input[type=file]").setInputFiles(file);
  await page.getByText("Vérifiez avant d’importer").waitFor();
  // Paul left before the Chest: kept as a former member. June is locked: the page asks.
  expect(await page.locator(".import-people li.former", { hasText: "Paul Personne" }).count() === 1, "former member kept");
  await page.getByText(/3 lignes tombent dans la période verrouillée/u).waitFor();
  expect(!(await page.getByRole("button", { name: /^Importer/u }).count()), "nothing to import before the answer");
  await choose("Oui, c’est l’historique");
  await page.getByRole("button", { name: "Importer 3 saisies" }).click();
  await page.getByText("3 saisies importées.").waitFor();
});

await step("Hugo reads why his week came back and sends it again", async () => {
  await as(context, origin, "hugo");
  await context.addCookies([{ name: "dev_locale", value: "en", url: origin }]);
  await page.goto(origin + "/chest");
  await page.locator(".standing.returned", { hasText: "Il manque la réunion de mardi" }).waitFor();
  await page.getByRole("button", { name: "Send it again" }).click();
  await toast("Week sent.");
});

await step("on a phone, in French: the day replaces the grid; add time there", async () => {
  await as(context, origin, "ines");
  await context.addCookies([{ name: "dev_locale", value: "fr", url: origin }]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/chest");
  expect(!(await page.locator(".grid-area").isVisible()), "grid hidden");
  expect(await page.locator(".day-strip").isVisible(), "day strip");
  await page.getByRole("button", { name: "Ajouter du temps" }).click();
  await pick("#new-work", "vitrine design");
  await page.locator("#new-duration").fill("2,5");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.locator(".ck-toast", { hasText: "2:30 ajoutées." }).waitFor();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width <= 390, "no horizontal scroll: " + width);
});

await db.end();
await browser.close();
done(problems);
