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
  expect(await page.locator("td[data-noted] .note-button.has").count() >= 1, "note shown on the cell");
  expect((await page.locator("[data-cell='0:2']").getAttribute("aria-label"))?.includes("Checkout page, second pass"), "the note is read with the cell");
});

// Before Friday, the week is not over: "Send it early", never "Done?".
// The Chest's day: its database's current_date (the sessions are in its
// zone), not the machine's.
const [chestDay] = await db`select extract(isodow from current_date)::int as dow, to_char(date_trunc('week', current_date)::date - 7, 'YYYY-MM-DD') as last_monday`;
const early = chestDay.dow >= 1 && chestDay.dow <= 4;
const sendName = early ? "Send it early" : "Send my week";
await step("send my week: it becomes read-only, and can be taken back; before Friday it is offered early, not as done", async () => {
  const standing = await page.locator(".standing").innerText();
  expect(early ? standing.includes("Away at the end of the week? You can send it early.") && !standing.includes("Done with this week") : standing.includes("Done with this week"), "the wording follows the day: " + standing);
  await page.getByRole("button", { name: sendName }).click();
  await toast("Week sent.");
  await page.locator(".standing.submitted").waitFor();
  expect(await page.locator(".grid .cell-input").count() === 0, "no cell can be typed in");
  await page.getByRole("button", { name: "Take it back" }).first().click();
  await toast("Week taken back");
  await page.locator(".grid .cell-input").first().waitFor();
  await page.getByRole("button", { name: sendName }).click();
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
  const lastMonday = chestDay.last_monday;
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

await step("his week sent again reaches both managers by email, each their own (keys given whole, SDK studio.15)", async () => {
  // The harness's outbox (its Mail section; the bell's items are elsewhere).
  const dev = (await (await page.request.get(origin + "/_dev")).text()).replaceAll("&amp;", "&").split("<h2>Mail (proposal)</h2>")[1] ?? "";
  const sent = dev.split("<li>").filter(li => /Hugo Bernard (sent their week|a envoyé sa semaine)/u.test(li)).slice(0, 2);
  const to = sent.map(li => /→ ([^<\s]+@[^<\s]+)/u.exec(li)?.[1]).sort();
  expect(to.join(",") === "camille@example.test,sofia@example.test", "the latest two: " + to.join(","));
});

// Round 3 of the critique.
await step("a project lead: Camille names Sofia lead of Site vitrine; Sofia sees Hugo's week as her project's", async () => {
  await as(context, origin, "camille");
  await context.addCookies([{ name: "dev_locale", value: "fr", url: origin }]);
  await page.goto(origin + "/chest/projects");
  await page.getByRole("link", { name: "Site vitrine" }).first().click();
  await page.locator("#p-lead").selectOption({ label: "Sofia Rossi" });
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.waitForURL(/\/chest\/projects$/u);
  await as(context, origin, "sofia");
  await context.addCookies([{ name: "dev_locale", value: "en", url: origin }]);
  await page.goto(origin + "/chest/team");
  const row = page.locator(".waiting-row", { hasText: "Hugo Bernard" }).first();
  expect((await row.innerText()).includes("Your project"), "Hugo's week holds Sofia's project: " + (await row.innerText()));
});

await step("nobody approves their own week: Sofia sends hers, her own line has no Approve; Camille approves it", async () => {
  await page.goto(origin + "/chest");
  await page.getByRole("button", { name: sendName }).click();
  await toast("Week sent.");
  await page.goto(origin + "/chest/team");
  const mine = page.locator(".waiting-row", { hasText: "Sofia Rossi" });
  expect((await mine.innerText()).includes("Your week: another manager approves it."), "said on her line: " + (await mine.innerText()));
  expect(await mine.getByRole("button", { name: /^Approve/u }).count() === 0, "no Approve on one's own week");
  await as(context, origin, "camille");
  await context.addCookies([{ name: "dev_locale", value: "fr", url: origin }]);
  await page.goto(origin + "/chest/team");
  const hers = page.locator(".waiting-row", { hasText: "Sofia Rossi" });
  await hers.getByRole("button", { name: "Valider", exact: true }).click();
  const ask = page.getByRole("button", { name: "Valider quand même" });
  if (await ask.isVisible().catch(() => false)) await ask.click();
  await page.locator(".ck-toast", { hasText: "La semaine de Sofia Rossi est validée." }).waitFor();
});

await step("Remind never counts the manager who presses it; Camille's own short week is said apart; the email leaves", async () => {
  await page.goto(origin + "/chest/team");
  const bar = await page.locator(".remind-bar").innerText();
  const button = page.getByRole("button", { name: /^Rappeler/u });
  if (await button.count()) {
    const n = Number((await button.innerText()).match(/\d+/u)?.[0] ?? "1");
    await button.click();
    await page.locator(".ck-toast", { hasText: new RegExp(`${n}`, "u") }).waitFor();
    const dev = await (await page.request.get(origin + "/_dev")).text();
    expect(/Votre semaine du|Your week of/u.test(dev), "the reminder is emailed too");
  }
  const cell = await page.locator("tr", { hasText: "Camille Martin" }).locator(".week-cell").last().innerText();
  expect(!/incompl/u.test(cell) || /Votre propre semaine est incomplète aussi|sauf vous/u.test(bar), "Camille's own short week is said apart: " + bar);
});

await step("search the notes: the report and the entries found follow the words", async () => {
  await page.goto(origin + "/chest/reports?preset=month");
  await page.getByRole("searchbox").fill("Feyssine");
  await page.keyboard.press("Enter");
  await page.waitForURL(/q=Feyssine/u);
  const found = await page.locator("#found").innerText();
  expect(/entrées? dont la note contient « Feyssine »/u.test(found) && found.includes("Repérage au parc de la Feyssine") && found.includes("Hugo Bernard"), "found: " + found.slice(0, 300));
  expect((await page.locator(".found-list li").count()) >= 1, "entries listed");
  const csv = await page.request.get(origin + "/chest/reports/export?" + new URL(page.url()).searchParams.toString());
  const text = await csv.text();
  expect(text.includes("Feyssine") && !text.includes("Formulaire de commande"), "the CSV follows the words");
});

await step("billable time to Quotes: a draft invoice per project, sent once; Quotes' answer marks it invoiced", async () => {
  await page.goto(origin + "/chest/reports?preset=month&kind=uninvoiced");
  const panel = page.locator(".quotes");
  const line = panel.locator("li", { hasText: "Identité visuelle" });
  await line.getByRole("button", { name: /^Brouillon de facture dans Devis/u }).click();
  await page.locator(".ck-toast", { hasText: /envoyées? à Devis en brouillon de facture/u }).waitFor();
  await page.reload();
  expect(await panel.locator("li", { hasText: "Identité visuelle" }).getByRole("button").count() === 0 || !(await panel.locator("ul.quotes-list").first().innerText()).includes("Identité visuelle"), "not offered twice");
  const recent = await panel.locator("#quotes-recent").innerText();
  expect(recent.includes("Identité visuelle") && recent.includes("En attente de sa facture"), "waiting for its invoice: " + recent);
  const dev = await (await page.request.get(origin + "/_dev")).text();
  const handoff = dev.match(/timesheets\.billable<\/code> <small>\{&quot;version&quot;:1,&quot;handoff&quot;:&quot;(\d+)&quot;/u)?.[1];
  expect(handoff, "published timesheets.billable version 1");
  await page.request.post(origin + "/_dev/deliver", { form: { type: "quotes.invoiced", data: JSON.stringify({ handoff, invoice: "F2026-014", path: "/chest/invoices/14" }) } });
  await page.reload();
  const after = await panel.locator("#quotes-recent").innerText();
  expect(after.includes("Facturé : F2026-014"), "invoiced by Quotes' answer: " + after);
});

await step("taken back and sent again, the same project's time reaches Quotes each time: Quotes is told of the take-back, and the new hand-off is not refused as the old one", async () => {
  await page.goto(origin + "/chest/reports?preset=month&kind=uninvoiced");
  const panel = page.locator(".quotes");
  const offered = panel.locator("ul.quotes-list:not(#quotes-recent) li").filter({ has: page.getByRole("button", { name: /^Brouillon de facture dans Devis/u }) }).first();
  expect(await offered.count() === 1, "another project's time to send");
  const project = await offered.locator(".quotes-what strong").innerText();
  const published = async (type) => ((await (await page.request.get(origin + "/_dev")).text()).match(new RegExp(`${type.replace(".", "\\.")}</code>`, "gu")) ?? []).length;
  const billable = await published("timesheets.billable");
  await offered.getByRole("button", { name: `Brouillon de facture dans Devis : ${project}` }).click();
  await page.locator(".ck-toast", { hasText: /envoyées? à Devis en brouillon de facture/u }).waitFor();
  await page.reload();
  await panel.locator("#quotes-recent li", { hasText: project }).first().getByRole("button", { name: /^Reprendre/u }).click();
  await page.locator(".ck-toast", { hasText: "Devis a été prévenu" }).waitFor();
  expect(await published("timesheets.billable_cancelled") >= 1, "Quotes told of the take-back");
  await page.reload();
  await panel.locator("ul.quotes-list:not(#quotes-recent) li", { hasText: project }).getByRole("button", { name: `Brouillon de facture dans Devis : ${project}` }).click();
  await page.locator(".ck-toast", { hasText: /envoyées? à Devis en brouillon de facture/u }).waitFor();
  expect(await published("timesheets.billable") >= Math.min(billable + 2, 8), "both hand-offs published");
  await page.reload();
  const recent = await panel.locator("#quotes-recent").innerText();
  expect(recent.includes(project) && recent.includes("Repris") && recent.includes("En attente de sa facture"), "one taken back, one waiting: " + recent);
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
  // Change and delete say so in words on a phone, not only with an icon.
  // The entry just added (today's other Site vitrine time was handed to
  // Quotes this month: locked, without these buttons).
  const entry = page.locator(".entry", { hasText: "Site vitrine" }).filter({ hasText: "2:30" });
  await entry.waitFor();
  expect(await entry.getByRole("button", { name: /^Modifier/u }).isVisible() && (await entry.locator(".entry-actions").innerText()).includes("Modifier") && (await entry.locator(".entry-actions").innerText()).includes("Supprimer"), "labelled buttons");
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width <= 390, "no horizontal scroll: " + width);
});

await db.end();
await browser.close();
done(problems);
