// Leave, as people use it, in a real browser: node lab/chest-dev/flows/leave.mjs [port]
// (the harness runs the tool with --reset: the sample company is there).
import { writeFileSync } from "node:fs";
import { as, done, expect, open, step } from "./lib.mjs";

const port = Number(process.argv[2] ?? 4400);
const { browser, context, page, origin, problems } = await open(port, "hugo", { locale: "en", allow404: /\/chest\/(approvals|settings|people)$/u });
const tmp = process.env.TMPDIR ?? "/tmp";
const speak = locale => context.addCookies([{ name: "dev_locale", value: locale, url: origin }]);
const day = d => d.toISOString().slice(0, 10);
const plus = (d, n) => new Date(d.getTime() + n * 864e5);
const toast = () => page.locator(".toast").last().innerText();

// A Monday about ten weeks ahead; the flow moves a week on if a public
// holiday makes the week cost less than 5 days.
let monday = plus(new Date(), 70);
while (monday.getUTCDay() !== 1) monday = plus(monday, 1);

async function ask(start, end, options = {}) {
  await page.goto(origin + "/chest/new");
  if (options.kind) await page.locator(".kind-option", { hasText: options.kind }).click();
  await page.locator("#start").fill(start);
  await page.locator("#end").fill(end);
  if (options.half) await page.getByRole("radio", { name: options.half }).click();
  if (options.note) await page.locator("#note").fill(options.note);
  return page.locator(".quote-days").innerText();
}

async function send(label = "Send the request") {
  await page.getByRole("button", { name: label }).click();
  await page.waitForURL(/\/chest\?done=/u);
}

await step("an employee asks for a week of paid leave: the cost shows as he picks the days", async () => {
  let cost = "";
  for (let i = 0; i < 4; i++) {
    cost = await ask(day(monday), day(plus(monday, 4)), { note: "Trip to Lisbon" });
    if (cost === "5 days") break;
    monday = plus(monday, 7);
  }
  expect(cost === "5 days", "cost: " + cost);
  expect(/left after/u.test(await page.locator(".quote").innerText()), "balance after");
  await send();
  expect(await page.locator(".notice.ok").isVisible(), "sent notice");
  expect((await page.locator(".request", { hasText: "Waiting" }).allInnerTexts()).some(t => t.includes("5 days")), "listed as waiting");
});

await step("a half day costs half a day; a week-end costs nothing and cannot be sent", async () => {
  const friday = day(plus(monday, 11));
  expect((await ask(friday, friday, { half: "Morning" })) === "0.5 days", "morning");
  const saturday = day(plus(monday, 12));
  await ask(saturday, day(plus(monday, 13)));
  expect(await page.getByRole("button", { name: "Send the request" }).isDisabled(), "disabled on a week-end");
  expect(await page.getByText("they are week-ends or public holidays").isVisible(), "why");
});

await step("cancel a waiting request, then undo", async () => {
  const tuesday = day(plus(monday, 8));
  await ask(tuesday, tuesday);
  await send();
  const row = page.locator(".request", { hasText: "1 day" }).filter({ hasText: "Waiting" }).first();
  await row.getByRole("button", { name: "Cancel" }).click();
  await page.waitForSelector(".toast");
  expect((await toast()).includes("Request cancelled"), "toast");
  await page.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(1500);
  await page.reload();
  expect(await page.locator(".request", { hasText: "1 day" }).filter({ hasText: "Waiting" }).count() >= 1, "back to waiting");
});

await step("the manager, in French, approves from the list — undoes — approves again", async () => {
  await as(context, origin, "ines");
  await speak("fr");
  await page.goto(origin + "/chest/approvals");
  expect(await page.getByRole("heading", { name: "À valider" }).isVisible(), "French title");
  const card = page.locator(".card", { hasText: "Trip to Lisbon" });
  expect((await card.innerText()).includes("Solde ensuite"), "balance after");
  await card.getByRole("button", { name: "Valider" }).click();
  await page.waitForSelector(".toast");
  expect((await toast()).includes("Validé. Hugo est prévenu."), "toast: " + (await toast()));
  await page.locator(".toast").getByRole("button", { name: "Annuler l’action" }).click();
  await page.waitForTimeout(1500);
  await page.reload();
  await page.locator(".card", { hasText: "Trip to Lisbon" }).getByRole("button", { name: "Valider" }).click();
  await page.waitForTimeout(1500);
  await page.reload();
  expect(await page.locator(".card", { hasText: "Trip to Lisbon" }).count() === 0, "answered");
});

await step("she refuses another with a word; he reads it", async () => {
  const card = page.locator(".card", { hasText: "Hugo Bernard" }).first();
  await card.getByRole("button", { name: "Refuser" }).click();
  await card.getByLabel("Motif").fill("Inventaire ce jour-là");
  await card.getByRole("button", { name: "Refuser la demande" }).click();
  await page.waitForTimeout(1500);
  await as(context, origin, "hugo");
  await speak("en");
  await page.goto(origin + "/chest");
  const refused = page.locator(".request", { hasText: "Refused" }).first();
  expect((await refused.innerText()).includes("Inventaire ce jour-là"), "reason shown");
  expect(await page.locator(".request", { hasText: "5 days" }).filter({ hasText: "Approved" }).count() >= 1, "the week approved");
});

await step("he asks to cancel the approved week; she confirms; the days come back", async () => {
  const before = await page.locator(".balance", { hasText: "Paid leave" }).locator("strong").innerText();
  await page.locator(".request", { hasText: "5 days" }).filter({ hasText: "Approved" }).first().getByRole("button", { name: "Ask to cancel" }).click();
  await page.waitForSelector(".toast");
  expect((await toast()).includes("Your approver will confirm"), "asked");
  await as(context, origin, "ines");
  await page.goto(origin + "/chest/approvals");
  await page.locator(".card", { hasText: "Asks to cancel" }).getByRole("button", { name: "Cancel the leave" }).click();
  await page.waitForTimeout(1500);
  await as(context, origin, "hugo");
  await page.goto(origin + "/chest");
  const after = await page.locator(".balance", { hasText: "Paid leave" }).locator("strong").innerText();
  expect(Number(after) === Number(before) + 5, `balance ${before} → ${after}`);
});

await step("sick leave is recorded at once, without a note", async () => {
  await as(context, origin, "sofia");
  const wednesday = day(plus(monday, 16));
  await page.goto(origin + "/chest/new");
  await page.locator(".kind-option", { hasText: "Sick leave" }).click();
  expect(await page.locator("#note").count() === 0, "no note field");
  await page.locator("#start").fill(wednesday);
  await page.locator("#end").fill(day(plus(monday, 17)));
  await send("Record it");
  expect((await page.locator(".request", { hasText: "Sick leave" }).first().innerText()).includes("Recorded"), "recorded");
});

await step("a colleague sees who is away, not why; she cannot open HR's pages", async () => {
  await page.goto(origin + "/chest/calendar");
  expect(await page.locator(".grid tbody tr").count() >= 7, "everyone listed");
  const titles = await page.locator(".grid .bar").evaluateAll(bars => bars.map(b => b.getAttribute("title") ?? ""));
  expect(titles.some(t => t.startsWith("Tom Walker: Away")), "Tom away without kind");
  expect(!titles.some(t => t.startsWith("Tom Walker: Paid leave")), "no kind for colleagues");
  for (const path of ["/chest/approvals", "/chest/settings", "/chest/people"]) {
    const response = await page.goto(origin + path);
    expect(response.status() === 404, path + " → " + response.status());
  }
});

await step("HR: sets an approver, adds a day with a reason, sees it in the history", async () => {
  await as(context, origin, "camille");
  await page.goto(origin + "/chest/people");
  await page.getByLabel("Approver · Nora Petit").selectOption({ label: "Inès Moreau" });
  await page.waitForSelector(".toast");
  await page.getByRole("link", { name: "Nora Petit" }).click();
  await page.waitForURL(/\/chest\/people\/mbr_/u);
  await page.locator("#bf-days").fill("1");
  await page.locator("#bf-reason").fill("Moving day offered");
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForTimeout(1500);
  expect((await page.locator(".ledger").innerText()).includes("Moving day offered"), "ledger line");
});

await step("HR imports opening balances from a spreadsheet", async () => {
  await page.goto(origin + "/chest/people/import");
  await page.locator("#csv").fill("Name;Paid leave;RTT\nTOM walker;11,5;4\nNobody Here;3;1\n");
  await page.getByRole("button", { name: "Check" }).click();
  await page.waitForSelector("text=Nobody of that name has Leave");
  await page.getByRole("button", { name: "Set 2 balances" }).click();
  await page.waitForURL(/\/chest\/people$/u);
  expect((await page.locator("tr", { hasText: "Tom Walker" }).innerText()).includes("11.5"), "Tom's balance");
});

await step("HR downloads the month's payroll export", async () => {
  const response = await page.request.get(origin + "/chest/people/export?month=" + day(monday).slice(0, 7));
  expect(response.status() === 200, "status " + response.status());
  const text = await response.text();
  expect(text.includes("Person,Kind,First day"), "header: " + text.slice(0, 80));
  writeFileSync(tmp + "/leave-export.csv", text);
});

await step("HR switches the company to Alsace-Moselle", async () => {
  await page.goto(origin + "/chest/settings");
  await page.getByLabel("Alsace-Moselle (Good Friday and 26 December too)").check();
  await page.waitForSelector(".toast");
  await page.reload();
  expect(await page.getByText("Good Friday", { exact: true }).isVisible(), "Good Friday listed");
});

await step("phone width, in French: the month as a list of days, tabs under the thumb, no sideways scroll", async () => {
  await as(context, origin, "lea");
  await speak("fr");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/chest", "/chest/calendar", "/chest/new", "/chest/approvals"]) {
    await page.goto(origin + path);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width <= 392, path + " overflows: " + width);
  }
  await page.goto(origin + "/chest/calendar?month=" + day(monday).slice(0, 7));
  expect(await page.locator(".day-list").isVisible(), "list of days");
  expect(!(await page.locator(".grid-wrap").isVisible()), "grid hidden");
  const tabs = await page.locator(".tabs").boundingBox();
  expect(tabs.y > 700, "tab bar at the bottom: " + tabs.y);
});

await browser.close();
done(problems);
