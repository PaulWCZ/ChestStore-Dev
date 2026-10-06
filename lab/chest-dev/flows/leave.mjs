// Leave, as people use it, in a real browser: node lab/chest-dev/flows/leave.mjs [port]
// (the harness runs the tool with --reset: the sample company is there).
import { writeFileSync } from "node:fs";
import postgres from "postgres";
import { as, control, done, expect, id, open, step, toolDatabase } from "./lib.mjs";

const port = Number(process.argv[2] ?? 4400);
const { browser, context, page, origin, problems } = await open(port, "hugo", { locale: "en", allow404: /\/chest\/(approvals|settings|people)$/u });
const tmp = process.env.TMPDIR ?? "/tmp";
const db = postgres(toolDatabase("leave", port), { max: 1, onnotice: () => {} });
const speak = locale => context.addCookies([{ name: "dev_locale", value: locale, url: origin }]);
const day = d => d.toISOString().slice(0, 10);
const plus = (d, n) => new Date(d.getTime() + n * 864e5);
const toast = () => page.locator(".ck-toast .ck-toast-text").last().innerText();
// A day typed in the kit's date field (ISO is read in every language), then
// Enter, which commits it as leaving the field would.
// The kit's switch and segments hide their input (the label is the
// target): a person clicks the label; the check reads the input's state.
const flip = async (scope, name, on) => {
  const input = scope.getByRole("switch", { name });
  if ((await input.isChecked()) !== on) await scope.locator(".ck-switch").filter({ has: page.getByRole("switch", { name }) }).locator("label").click();
  await page.waitForFunction(([id, want]) => document.getElementById(id)?.checked === want, [await input.getAttribute("id"), on]);
};
const typeDay = async (selector, value) => {
  await page.locator(selector).fill(value);
  await page.locator(selector).press("Enter");
};

// A Monday about seven weeks ahead; the flow moves a week on if a public
// holiday makes the week cost less than 5 days. Seven, so that the week
// stays inside the 90 days of busy times told to Booking even when the
// weeks around Christmas are skipped.
let monday = plus(new Date(), 49);
while (monday.getUTCDay() !== 1) monday = plus(monday, 1);

async function ask(start, end, options = {}) {
  await page.goto(origin + "/chest/new");
  if (options.kind) await page.locator(".kind-option", { hasText: options.kind }).click();
  if (options.event) await page.locator("#event").selectOption({ index: 1 });
  await typeDay("#start", start);
  await typeDay("#end", end);
  if (options.half) {
    const radio = page.getByRole("radio", { name: options.half });
    await page.locator("label.ck-segment").filter({ has: radio }).click();
    expect(await radio.isChecked(), options.half + " chosen");
  }
  if (options.note) await page.locator("#note").fill(options.note);
  // The cost is worked out after the last change: read it once it has settled.
  let last = "", same = 0;
  for (let i = 0; i < 40 && same < 3; i++) {
    await page.waitForTimeout(150);
    const now = await page.locator(".quote-days").innerText();
    same = now === last ? same + 1 : 0;
    last = now;
  }
  return last;
}

// The fake Chest's outbox (mail proposal), as the harness's /_dev shows it:
// the latest first, "subject … → address".
async function outbox() {
  const back = page.url();
  await page.goto(origin + "/_dev");
  // The text of each email too (folded under "text" on the page).
  const mails = await page.locator("section", { hasText: "Mail (proposal)" }).locator("ul > li").evaluateAll(items => items.map(li => li.textContent ?? ""));
  if (back.startsWith(origin + "/chest")) await page.goto(back);
  return mails;
}

// The harness's /_dev as text: the signed-in member's calendar feed
// address, and the events published to other tools (latest first).
async function devPage() {
  return (await (await page.request.get(origin + "/_dev")).text()).replaceAll("&quot;", '"').replaceAll("&amp;", "&");
}
async function feedOf() {
  const path = /\/_chest\/calendar\/[A-Za-z0-9_-]+\.ics/u.exec(await devPage())?.[0];
  expect(path, "the harness shows the feed's address");
  return (await (await page.request.get(origin + path)).text()).replace(/\r\n[ \t]/gu, "");
}
// The latest leave.busy told of someone (the Events panel, latest first).
async function busyOf(member) {
  // The panel cuts a long snapshot at 600 characters: only whole ones read.
  const read = text => { try { return JSON.parse(text); } catch { return null; } };
  return [...(await devPage()).matchAll(/<code>leave\.busy<\/code> <small>([^<]*)<\/small>/gu)].map(m => read(m[1])).find(d => d?.member === member) ?? null;
}
const compact = d => day(d).replaceAll("-", "");

// What Rooms and People were told of a request (leave.approved /
// leave.cancelled in the harness's Events panel, latest first); asked again
// for a few seconds, as actions publish once their answer is sent.
async function toldOf(request, until = told => told.length > 0) {
  const read = text => { try { return JSON.parse(text); } catch { return null; } };
  let told = [];
  for (let i = 0; i < 12; i++) {
    told = [...(await devPage()).matchAll(/<code>(leave\.(?:approved|cancelled))<\/code> <small>([^<]*)<\/small>/gu)]
      .map(m => ({ type: m[1], data: read(m[2]) })).filter(e => e.data && e.data.request === String(request));
    if (until(told)) break;
    await page.waitForTimeout(500);
  }
  return told;
}
let noraWeek = null;
const leaveKeys = "from,fromHalf,member,request,to,toHalf";

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

await step("the approver is emailed too (the mail proposal), in her language, with the link to answer", async () => {
  const mails = await outbox();
  const toInes = mails.find(m => m.includes("ines@example.test"));
  expect(toInes && toInes.startsWith("Hugo Bernard demande un congé") && /\/chest\/requests\/\d+/u.test(toInes), "email to Inès: " + mails.join(" | "));
});

await step("a half day costs half a day; a week-end costs nothing and cannot be sent", async () => {
  // A Friday that is not a public holiday (25 December and 1 January can be).
  let friday = "", half = "";
  for (let n = 11; n < 40 && half !== "0.5 days"; n += 7) {
    friday = day(plus(monday, n));
    half = await ask(friday, friday, { half: "Morning" });
  }
  expect(half === "0.5 days", "morning: " + half + " on " + friday);
  const saturday = day(plus(monday, 12));
  await ask(saturday, day(plus(monday, 13)));
  expect(await page.getByRole("button", { name: "Send the request" }).isDisabled(), "disabled on a week-end");
  expect(await page.getByText("week-ends, public holidays or days not worked").isVisible(), "why");
});

await step("a first day before the earliest one may ask for is refused as typed; the day the field held is not sent", async () => {
  // Kit 0.2.4: a day before `min` stays as typed, says why, and the
  // request waits — never the first day the field held before (the bug
  // class where Timesheets saved "today" in place of refusing).
  const count = async () => Number((await db`select count(*)::int as n from requests where member_id = ${id("hugo")}`)[0].n);
  const before = await count();
  await page.goto(origin + "/chest/new");
  const held = await page.locator("#start").inputValue();
  expect(held !== "", "the first day holds a day: " + held);
  const tooEarly = day(plus(new Date(), -400));
  await page.locator("#start").fill(tooEarly);
  await page.locator("#start").press("Tab");
  const field = page.locator(".ck-date", { has: page.locator("#start") });
  await field.locator(".ck-error", { hasText: /^Choose .* or later\.$/u }).waitFor();
  expect(await page.locator("#start").getAttribute("aria-invalid") === "true", "the field says it is refused");
  expect(await page.locator("#start").inputValue() === tooEarly, "the text stays as typed");
  const sendButton = page.getByRole("button", { name: "Send the request" });
  // The field tells the form after it shows its sentence: wait a moment for it.
  await sendButton.evaluate(b => new Promise(ok => { const t0 = Date.now(); const tick = () => (b.disabled || Date.now() - t0 > 3000 ? ok() : requestAnimationFrame(tick)); tick(); }));
  expect(await sendButton.isDisabled(), "Send waits while the day is refused");
  // Even a submit forced past the button stops on the field.
  await page.locator("form.ask").evaluate(form => form.requestSubmit());
  await page.waitForTimeout(1000);
  expect(new URL(page.url()).pathname === "/chest/new", "still on the form: " + page.url());
  expect((await count()) === before, "no request saved");
  // A good day then clears the refusal.
  await page.locator("#start").fill(held);
  await page.locator("#start").press("Tab");
  await page.waitForFunction(() => document.getElementById("start")?.getAttribute("aria-invalid") !== "true");
  expect(await field.locator(".ck-error").count() === 0, "the sentence is gone");
});

await step("cancel a waiting request, then undo", async () => {
  const tuesday = day(plus(monday, 8));
  await ask(tuesday, tuesday);
  await send();
  const row = page.locator(".request", { hasText: "1 day" }).filter({ hasText: "Waiting" }).first();
  await row.getByRole("button", { name: "Cancel" }).click();
  await page.waitForSelector(".ck-toast");
  expect((await toast()).includes("Request cancelled"), "toast");
  await page.locator(".ck-toast").getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(1500);
  expect((await toast()) === "Undone.", "the toast says it was undone: " + (await toast()));
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
  await page.waitForSelector(".ck-toast");
  expect((await toast()).includes("Validé. Hugo est prévenu."), "toast: " + (await toast()));
  await page.locator(".ck-toast").getByRole("button", { name: "Annuler l’action" }).click();
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

await step("the requester is emailed the answers too", async () => {
  const mails = (await outbox()).filter(m => m.includes("hugo@example.test"));
  expect(mails.some(m => m.startsWith("Your time off is approved")) && mails.some(m => m.startsWith("Your time off is refused") && m.includes("Inventaire ce jour-là")), "emails to Hugo: " + mails.join(" | "));
});

await step("approved: the week is in Hugo's own calendar feed as 'Off', private — never why; his home says so", async () => {
  await page.goto(origin + "/chest");
  const link = page.getByRole("link", { name: "Your approved leave is in your calendar" });
  for (let i = 0; i < 10 && !(await link.isVisible()); i++) { await page.waitForTimeout(500); await page.reload(); }
  expect(await link.getAttribute("href") === "/_chest/calendar", "the link to the Chest's calendar page");
  const ics = await feedOf();
  const event = ics.split("BEGIN:VEVENT").find(e => e.includes(`DTSTART;VALUE=DATE:${compact(monday)}`));
  expect(event, "the week is in the feed");
  expect(/SUMMARY:Off\r\n/u.test(event) && /CLASS:PRIVATE/u.test(event) && event.includes(`DTEND;VALUE=DATE:${compact(plus(monday, 5))}`), "Off, private, Monday to Friday: " + event);
  expect(/URL:https?:\/\/[^\r\n]*\/chest\/requests\/\d+/u.test(event), "it opens the request");
  expect(!/Lisbon|Paid leave|Congés payés/u.test(ics), "never the note nor the kind");
});

await step("Booking is told Hugo's busy times: his week as UTC minutes, times only", async () => {
  const busy = await busyOf(id("hugo"));
  expect(busy && busy.v === 1, "leave.busy published for Hugo");
  expect(Object.keys(busy).sort().join(",") === "at,from,member,spans,to,v", "times only: " + Object.keys(busy).join(","));
  // Monday 00:00 to Saturday 00:00 where Hugo works — the Chest's zone in
  // the harness, which is the database sessions' too (Paris: 22:00 or 23:00
  // UTC the day before).
  const [edges] = await db`select ${day(monday)}::date::timestamptz as a, (${day(monday)}::date + 5)::timestamptz as b`;
  const minute = d => d.toISOString().slice(0, 16) + "Z";
  const week = busy.spans.find(([start]) => start === minute(edges.a));
  expect(week && week[1] === minute(edges.b), `Monday 00:00 to Saturday 00:00 in the Chest's zone (${minute(edges.a)} → ${minute(edges.b)}): ` + JSON.stringify(busy.spans));
});

await step("Rooms and People are told Hugo's approved week: who and which days — never the kind nor the note", async () => {
  const [r] = await db`select id from requests where member_id = ${id("hugo")} and start_date = ${day(monday)} and status = 'approved'`;
  expect(r, "the approved week");
  const [latest] = await toldOf(r.id);
  expect(latest?.type === "leave.approved", "leave.approved published: " + JSON.stringify(latest));
  expect(Object.keys(latest.data).sort().join(",") === leaveKeys, "who and which days only: " + Object.keys(latest.data).join(","));
  expect(latest.data.member === id("hugo") && latest.data.from === day(monday) && latest.data.to === day(plus(monday, 4)) && latest.data.fromHalf === "am" && latest.data.toHalf === "pm", "the week: " + JSON.stringify(latest.data));
});

await step("a last day before the first day: the field refuses it, and the form shows no day and counts nothing until it is fixed", async () => {
  await page.goto(origin + "/chest/new");
  const first = day(plus(monday, 9));
  await typeDay("#start", first);
  await page.locator("#end").fill(day(plus(monday, 2)));
  await page.locator("#end").press("Tab");
  const field = page.locator(".ck-date", { has: page.locator("#end") });
  await field.locator(".ck-error").waitFor();
  await page.waitForFunction(() => document.querySelector(".quote-days")?.textContent === "–");
  expect((await page.locator(".quote").innerText()).includes("Fix the date above"), "the cost waits: " + (await page.locator(".quote").innerText()));
  expect(!(await field.locator(".ck-date-read").isVisible()), "no other day shown in words under the refused one");
  expect(await page.getByRole("button", { name: "Send the request" }).isDisabled(), "cannot be sent");
  await page.goto(origin + "/chest");
});

await step("he asks to cancel the approved week; she confirms; the days come back", async () => {
  const before = await page.locator(".balance", { hasText: "Paid leave" }).locator("strong").innerText();
  await page.locator(".request", { hasText: "5 days" }).filter({ hasText: "Approved" }).first().getByRole("button", { name: "Ask to cancel" }).click();
  await page.waitForSelector(".ck-toast");
  expect((await toast()).includes("Your approver will confirm"), "asked");
  expect(await page.locator(".ck-toast-undo").count() === 0, "no Undo once the approver is told");
  await as(context, origin, "ines");
  await page.goto(origin + "/chest/approvals");
  await page.locator(".card", { hasText: "Asks to cancel" }).getByRole("button", { name: "Cancel the leave" }).click();
  await page.waitForTimeout(1500);
  await as(context, origin, "hugo");
  await page.goto(origin + "/chest");
  const after = await page.locator(".balance", { hasText: "Paid leave" }).locator("strong").innerText();
  expect(Number(after) === Number(before) + 5, `balance ${before} → ${after}`);
});

await step("cancelled: the week leaves Hugo's feed, and Booking hears he is free again", async () => {
  // The week the step before cancelled (the first approved week of his list).
  const [gone] = await db`select id, to_char(start_date, 'YYYY-MM-DD') as start from requests r
    where member_id = ${id("hugo")} and status = 'cancelled' and exists (select 1 from request_events e where e.request_id = r.id and e.kind = 'cancelled')
    order by (select max(e.at) from request_events e where e.request_id = r.id) desc limit 1`;
  expect(gone, "a cancelled week");
  const first = new Date(gone.start + "T00:00:00Z");
  await page.goto(origin + "/chest");
  let ics = "";
  for (let i = 0; i < 10; i++) {
    ics = await feedOf();
    if (!ics.includes(`DTSTART;VALUE=DATE:${compact(first)}`)) break;
    await page.waitForTimeout(500);
  }
  expect(!ics.includes(`DTSTART;VALUE=DATE:${compact(first)}`) && !ics.includes(`/chest/requests/${gone.id}\r\n`), "the week of " + gone.start + " is gone from the feed");
  const busy = await busyOf(id("hugo"));
  expect(busy && !busy.spans.some(([start]) => start.startsWith(day(plus(first, -1)))), "no longer busy that week: " + JSON.stringify(busy?.spans));
});

await step("the cancelled week is told to Rooms and People as cancelled", async () => {
  const [gone] = await db`select id, to_char(start_date, 'YYYY-MM-DD') as start from requests r
    where member_id = ${id("hugo")} and status = 'cancelled' and exists (select 1 from request_events e where e.request_id = r.id and e.kind = 'cancelled')
    order by (select max(e.at) from request_events e where e.request_id = r.id) desc limit 1`;
  const [latest] = await toldOf(gone.id, told => told[0]?.type === "leave.cancelled");
  expect(latest?.type === "leave.cancelled" && latest.data.member === id("hugo") && latest.data.from === gone.start, "leave.cancelled published: " + JSON.stringify(latest));
});

await step("sick leave is recorded at once, without a note", async () => {
  await as(context, origin, "sofia");
  const wednesday = day(plus(monday, 16));
  await page.goto(origin + "/chest/new");
  await page.locator(".kind-option", { hasText: "Sick leave" }).click();
  expect(await page.locator("#note").count() === 0, "no note field");
  await typeDay("#start", wednesday);
  await typeDay("#end", day(plus(monday, 17)));
  await send("Record it");
  expect((await page.locator(".request", { hasText: "Sick leave" }).first().innerText()).includes("Recorded"), "recorded");
});

await step("sick leave is told to Rooms and People as an absence (never as sick); remote work is not an absence and is not told", async () => {
  const wednesday = day(plus(monday, 16));
  const [sick] = await db`select id from requests where member_id = ${id("sofia")} and start_date = ${wednesday} and status = 'approved'`;
  const [told] = await toldOf(sick.id);
  expect(told?.type === "leave.approved" && Object.keys(told.data).sort().join(",") === leaveKeys && told.data.to === day(plus(monday, 17)), "sick leave told as days only: " + JSON.stringify(told));
  // A working day that is not a public holiday, beside her sick leave.
  let homeDay = "", cost = "";
  for (const n of [15, 22, 24, 29, 31]) {
    homeDay = day(plus(monday, n));
    cost = await ask(homeDay, homeDay, { kind: "Remote work" });
    if (cost === "1 day") break;
  }
  expect(cost === "1 day", "remote work: " + cost + " on " + homeDay);
  await send("Record it");
  const [home] = await db`select r.id, r.status from requests r join leave_types t on t.id = r.type_id where r.member_id = ${id("sofia")} and r.start_date = ${homeDay} and t.key = 'remote'`;
  expect(home?.status === "approved", "remote work recorded: " + JSON.stringify(home));
  // Wait for what the action publishes (her busy times do not change): the
  // Events panel settles, then nothing of that day was told.
  await page.waitForTimeout(2000);
  expect((await toldOf(home.id, () => false)).length === 0, "remote work is not told as leave");
  expect((await toldOf(sick.id))[0]?.type === "leave.approved", "the sick leave still stands");
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

await step("who is away, by team: the Chest's groups are offered though none gives Leave, and Sales shows its two people", async () => {
  await page.goto(origin + "/chest/calendar");
  const text = await page.locator("main").innerText();
  expect(["Office", "Sales", "Tech"].every(g => text.includes(g)), "the Chest's groups offered");
  await page.goto(origin + "/chest/calendar?show=" + "grp_sales" + "a".repeat(21));
  const names = await page.locator(".grid tbody tr th").allInnerTexts();
  expect(names.length === 2 && names.some(n => n.includes("Inès Moreau")) && names.some(n => n.includes("Hugo Bernard")), "Sales: " + names.join(" | "));
});

await step("HR: sets an approver, adds a day with a reason, sees it in the history", async () => {
  await as(context, origin, "camille");
  await page.goto(origin + "/chest/people");
  await page.getByRole("link", { name: "Nora Petit" }).click();
  await page.waitForURL(/\/chest\/people\/mbr_/u);
  // The approver: typed in the kit's people picker, saved when chosen.
  await page.getByRole("combobox", { name: "Approver" }).fill("ine");
  await page.getByRole("option", { name: /Inès Moreau/u }).click();
  await page.waitForSelector(".ck-toast");
  expect((await toast()) === "Saved.", "saved: " + (await toast()));
  await page.goto(origin + "/chest/people");
  expect((await page.locator("tr", { hasText: "Nora Petit" }).innerText()).includes("Inès Moreau"), "Nora's approver in the table");
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
  await page.waitForSelector("text=Nobody of that name has access to Leave");
  await page.getByRole("button", { name: "Import 1 person" }).click();
  await page.waitForURL(/\/chest\/people$/u);
  expect((await page.locator("tr", { hasText: "Tom Walker" }).innerText()).includes("11.5"), "Tom's balance");
});

await step("HR downloads the month's payroll export", async () => {
  const response = await page.request.get(origin + "/chest/people/export?month=" + day(monday).slice(0, 7));
  expect(response.status() === 200, "status " + response.status());
  const text = await response.text();
  expect(text.includes("Employee number,Person,Kind,Payroll code,First day"), "header: " + text.slice(0, 80));
  writeFileSync(tmp + "/leave-export.csv", text);
});

await step("HR switches the company to Alsace-Moselle", async () => {
  await page.goto(origin + "/chest/settings");
  await flip(page, "Alsace-Moselle (Good Friday and 26 December too)", true);
  await page.waitForSelector(".ck-toast");
  await page.reload();
  expect(await page.getByText("Good Friday", { exact: true }).isVisible(), "Good Friday listed");
});

await step("coming up: the soonest first", async () => {
  await as(context, origin, "hugo");
  await speak("en");
  await page.goto(origin + "/chest");
  const list = page.locator("h3", { hasText: "Coming up" }).locator("xpath=following-sibling::ul[1]");
  const starts = await list.locator("li.request").evaluateAll(rows => rows.map(r => r.getAttribute("data-start")));
  expect(starts.length >= 2, "at least two coming up: " + starts.join(" "));
  expect(starts.every((d, i) => i === 0 || starts[i - 1] <= d), "soonest first: " + starts.join(" "));
});

await step("the home and the form say the same 'left'; the approver's balance counts the earlier waiting request", async () => {
  const cardLeft = (await page.locator(".balance", { hasText: "Paid leave" }).locator("strong").innerText()).trim();
  await page.goto(origin + "/chest/new");
  const formLeft = await page.locator(".kind-option", { hasText: "Paid leave" }).locator(".kind-left").innerText();
  expect(formLeft.startsWith(cardLeft + " left"), `home ${cardLeft} / form ${formLeft}`);
  // A second waiting request, after the one already waiting.
  const later = day(plus(monday, 21));
  await ask(later, later);
  await send();
  await as(context, origin, "ines");
  await page.goto(origin + "/chest/approvals");
  expect(await page.getByText(/counting 1 earlier request still waiting/u).count() >= 1, "counts the earlier one");
});

await step("HR imports Lucca's balances (Nom, Prénom, CP N-1, CP N) and sees both parts", async () => {
  await as(context, origin, "camille");
  await speak("en");
  await page.goto(origin + "/chest/people/import");
  await page.locator("#csv").fill("Matricule;Nom;Prénom;Date d'entrée;CP N-1;CP N;RTT\n0015;BERNARD;Hugo;15/01/2024;10;6,25;3\n");
  await page.getByRole("button", { name: "Check" }).click();
  await page.waitForSelector("text=Paid leave 10 + 6.25 being earned");
  await page.getByRole("button", { name: "Import 1 person" }).click();
  await page.waitForURL(/\/chest\/people$/u);
  await page.goto(origin + "/chest/people/" + id("hugo"));
  const card = await page.locator(".balance", { hasText: "Paid leave" }).innerText();
  expect(card.includes("10 to take now (N-1)") && card.includes("6.25 being earned (N)"), card);
});

await step("HR says what an unknown column is, then imports it", async () => {
  await page.goto(origin + "/chest/people/import");
  await page.locator("#csv").fill("Salarié;Solde congés annuels\nSofia Rossi;7,5\n");
  await page.getByRole("button", { name: "Check" }).click();
  await page.waitForSelector(".mapping");
  await page.locator(".mapping select").selectOption({ label: "Paid leave · earned, to take now (N-1)" });
  await page.waitForSelector("text=Paid leave 7.5");
  await page.getByRole("button", { name: "Import 1 person" }).click();
  await page.waitForURL(/\/chest\/people$/u);
});

await step("HR imports the leave already approved in Lucca", async () => {
  await page.goto(origin + "/chest/people/import?what=leave");
  const from = plus(monday, 35);
  const fr = d => d.toISOString().slice(0, 10).split("-").reverse().join("/");
  await page.locator("#csv").fill(`employeeNumber;lastName;firstName;accountId;startDate;flagStartDate;endDate;flagEndDate;isApproved\n0015;Bernard;Hugo;Congés payés 2025-2026;${fr(from)};AM;${fr(plus(from, 4))};PM;true\n`);
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByRole("button", { name: "Import 1 leave" }).click();
  await page.waitForURL(/\/chest\/people$/u);
  await page.goto(origin + "/chest/people/" + id("hugo"));
  expect((await page.locator(".requests").innerText()).includes("Approved"), "imported and approved");
});

await step("HR records a sick day phoned in, for Nora", async () => {
  await page.goto(origin + "/chest/people/" + id("nora"));
  await page.getByRole("link", { name: "Record leave" }).click();
  await page.waitForURL(/\/chest\/new\?for=/u);
  expect(await page.getByRole("heading", { name: "Leave for Nora Petit" }).isVisible(), "title");
  await page.locator(".kind-option", { hasText: "Sick leave" }).click();
  const tuesday = day(plus(monday, 29));
  await typeDay("#start", tuesday);
  await typeDay("#end", tuesday);
  await page.getByRole("button", { name: "Record it" }).click();
  await page.waitForURL(/done=recorded/u);
  expect((await page.locator(".requests").innerText()).includes("Sick leave"), "recorded");
});

await step("a four-day week: Tom, off on Fridays, away Monday to Thursday is charged the Friday too", async () => {
  await as(context, origin, "tom");
  const cost = await ask(day(plus(monday, 42)), day(plus(monday, 45)));
  expect(cost === "5 days", "cost: " + cost);
});

await step("paid leave never goes below zero by default: Tom asking far more than he has is told so and cannot send", async () => {
  const cost = await ask(day(plus(monday, 100)), day(plus(monday, 158)));
  expect(Number(cost.replace(/[^\d.]/gu, "")) > 20, "a long leave: " + cost);
  expect((await page.locator(".quote").innerText()).includes("cannot go below zero"), "said: " + (await page.locator(".quote").innerText()));
  expect(await page.getByRole("button", { name: "Send the request" }).isDisabled(), "cannot be sent");
});

await step("email is offered as the Chest can send it (mail.available): the switch, and no sentence saying none leaves", async () => {
  await as(context, origin, "tom");
  await page.goto(origin + "/chest");
  expect(await page.getByRole("switch", { name: "Also send me these by email: requests to answer, answers, cancellations" }).count() === 1, "the switch");
  expect(await page.getByText("Emails are not sent for now").count() === 0 && await page.getByText("Today's emails are used up").count() === 0, "no sentence: this Chest sends");
});

await step("what Tom chose in the Chest (one email a day) and a pause of the Chest's email: his home says each, in plain words", async () => {
  await control(page, origin, "member", { member: id("tom"), mailPreference: "digest" });
  try {
    await page.goto(origin + "/chest");
    expect(await page.getByText("In your Chest settings you chose one email a day").count() === 1, "one a day, said");
    await control(page, origin, "delivery", { mail: "suspended" });
    await page.goto(origin + "/chest");
    expect(await page.getByText("Emails are not sent for now").count() === 1, "paused, said");
    expect(await page.getByRole("switch", { name: "Also send me these by email: requests to answer, answers, cancellations" }).count() === 1, "his own switch stays");
  } finally {
    await control(page, origin, "delivery", { mail: "ready" });
    await control(page, origin, "member", { member: id("tom"), mailPreference: "all" });
  }
  await page.goto(origin + "/chest");
  expect(await page.getByText("In your Chest settings you chose").count() === 0, "all: nothing to say");
});

await step("Tom turns his emails off: the next answer reaches his bell only", async () => {
  await page.goto(origin + "/chest");
  await flip(page, "Also send me these by email: requests to answer, answers, cancellations", false);
  await page.reload();
  expect(!(await page.getByRole("switch", { name: "Also send me these by email: requests to answer, answers, cancellations" }).isChecked()), "saved");
  const tuesday = day(plus(monday, 50));
  await ask(tuesday, tuesday);
  await send();
  const before = (await outbox()).filter(m => m.includes("tom@example.test")).length;
  await as(context, origin, "lea");
  await speak("en");
  await page.goto(origin + "/chest/approvals");
  await page.locator(".card", { hasText: "Tom Walker" }).first().getByRole("button", { name: "Approve" }).click();
  await page.waitForTimeout(1500);
  expect((await outbox()).filter(m => m.includes("tom@example.test")).length === before, "no email to Tom");
  await as(context, origin, "tom");
  await page.goto(origin + "/chest");
  await flip(page, "Also send me these by email: requests to answer, answers, cancellations", true);
});

await step("HR changes a kind in place: saved at once, nothing to forget", async () => {
  await as(context, origin, "camille");
  await page.goto(origin + "/chest/settings");
  const rtt = page.locator(".type-editor").filter({ has: page.locator('input[placeholder="RTT"]') });
  await flip(rtt, "May go below zero", false);
  await page.waitForSelector(".ck-toast");
  await page.reload();
  expect(!(await page.locator(".type-editor").filter({ has: page.locator('input[placeholder="RTT"]') }).getByLabel("May go below zero").isChecked()), "saved");
});

await step("someone leaves: their last day is set; HR finds them under Former, with their balance", async () => {
  await page.request.post(origin + "/_dev/event", { form: { type: "member.removed", member: id("sofia") } });
  await page.goto(origin + "/chest/people");
  await page.getByRole("link", { name: /Former \(\d+\)/u }).click();
  await page.waitForURL(/show=former/u);
  expect(await page.locator("tr", { hasText: "Sofia Rossi" }).count() === 1, "Sofia listed");
  const csv = await page.request.get(origin + "/chest/people/balances");
  const text = await csv.text();
  expect(csv.status() === 200 && text.split("\r\n").some(l => l.split(",")[1] === "Sofia Rossi"), "balances CSV: her name as it is");
  expect(!/former member|ancien membre/iu.test(text), "never '(former member)' in a payroll file");
});

await step("payroll's balances file on the last day of next month: a projection, named so; later is refused", async () => {
  // The Chest's today: its database's current_date (the sessions are in
  // its zone), not UTC's day.
  const [{ today }] = await db`select current_date::text as today`;
  const [y, m] = today.split("-").map(Number);
  const end = new Date(Date.UTC(y, m + 1, 0));
  const ok = await page.request.get(origin + "/chest/people/balances?on=" + day(end));
  expect(ok.status() === 200 && (ok.headers()["content-disposition"] ?? "").includes("-projected.csv"), "projected: " + ok.status() + " " + ok.headers()["content-disposition"]);
  const late = await page.request.get(origin + "/chest/people/balances?on=" + day(plus(end, 1)));
  expect(late.status() === 400, "the day after is refused: " + late.status());
  await page.goto(origin + "/chest/people/payroll");
  await page.locator("#on").fill(day(end));
  await page.locator("#on").press("Tab");
  expect(await page.locator(".ck-date", { has: page.locator("#on") }).locator(".ck-error").count() === 0, "the field takes it");
});

await step("People tells Leave of Tom's record: his number and working week follow it, and HR sees where they come from", async () => {
  await deliver("people.record", { member: id("tom"), employeeNumber: "T-0019", startDate: "2025-11-03", lastDay: null, workDays: [1, 2, 3, 4], weeklyHours: 28 });
  await page.goto(origin + "/chest/people/" + id("tom"));
  expect((await page.locator("main").innerText()).includes("Kept up to date from their HR record in People"), "said where it comes from");
  expect((await page.getByLabel("Employee number").inputValue()) === "T-0019", "number from People");
});

await step("People tells Leave that Hugo leaves: his last day is set, the leave after it cancelled, HR told; stopped in People, the day goes", async () => {
  const last = day(plus(monday, 30));
  await deliver("people.leaving", { member: id("hugo"), lastDay: last });
  await page.goto(origin + "/chest/people/" + id("hugo"));
  expect((await page.locator("main").innerText()).includes("Last day:"), "last day shown");
  expect(await page.locator(".ledger tr", { hasText: "After their last day" }).count() >= 1, "the leave after it came back");
  await deliver("people.leaving_cancelled", { member: id("hugo") });
  await page.goto(origin + "/chest/people/" + id("hugo"));
  expect(!(await page.locator("main").innerText()).includes("Last day:"), "cleared");
});

await step("the leave People's last day cancelled is told to Rooms and People as cancelled", async () => {
  const gone = await db`select distinct r.id from requests r join request_events e on e.request_id = r.id
    where r.member_id = ${id("hugo")} and e.kind = 'after_last_day' and r.decided_at is not null`;
  expect(gone.length >= 1, "leave cancelled by the last day");
  for (const r of gone) {
    const [latest] = await toldOf(r.id, told => told[0]?.type === "leave.cancelled");
    expect(latest?.type === "leave.cancelled" && latest.data.member === id("hugo"), "leave.cancelled for " + r.id + ": " + JSON.stringify(latest));
  }
});

await step("a last day People sets in the middle of Nora's approved week: told as cancelled, then approved up to that day", async () => {
  const [week] = await db`select r.id, to_char(r.start_date, 'YYYY-MM-DD') as start, to_char(r.end_date, 'YYYY-MM-DD') as end from requests r join leave_types t on t.id = r.type_id
    where r.member_id = ${id("nora")} and r.status = 'approved' and t.away and r.start_date > current_date + 2 and r.end_date - r.start_date = 4 order by r.start_date limit 1`;
  expect(week, "Nora's approved week");
  noraWeek = week.id;
  const last = day(plus(new Date(week.start + "T00:00:00Z"), 2));
  await deliver("people.leaving", { member: id("nora"), lastDay: last });
  const told = await toldOf(week.id, t => t.length >= 2 && t[0].type === "leave.approved" && t[0].data.to === last);
  expect(told[0]?.type === "leave.approved" && told[0].data.from === week.start && told[0].data.to === last && told[0].data.toHalf === "pm", "approved up to the last day: " + JSON.stringify(told[0]));
  expect(told[1]?.type === "leave.cancelled" && told[1].data.to === week.end, "the whole week taken back first: " + JSON.stringify(told[1]));
  await deliver("people.leaving_cancelled", { member: id("nora") });
});

await step("the shortened week's approval is told with the time of the change, strictly after its cancellation (occurredAt, SDK studio.16)", async () => {
  const words = await db`select type, at, published_at from leave_outbox where data->>'request' = ${String(noraWeek)} order by id`;
  const cut = words.findLastIndex(w => w.type === "leave.cancelled");
  const [cancelled, approved] = [words[cut], words[cut + 1]];
  expect(cancelled && approved?.type === "leave.approved", "a cancellation then an approval: " + words.map(w => w.type).join(","));
  expect(approved.at.getTime() > cancelled.at.getTime(), `the approval after the cancellation: ${cancelled.at.toISOString()} < ${approved.at.toISOString()}`);
  expect(cancelled.published_at && approved.published_at, "both published");
  expect(Date.now() - cancelled.at.getTime() < 3_600_000, "both of the last hour: well within the Chest's 24 hours");
});

await step("a family event for Tom (off on Fridays), Monday to Friday, counts only the 4 days he works", async () => {
  await as(context, origin, "tom");
  const cost = await ask(day(plus(monday, 56)), day(plus(monday, 60)), { kind: "Family event", event: true });
  expect(cost === "4 days", "cost: " + cost);
});

await step("the payroll code: CP in Settings, a column of the month's CSV", async () => {
  await as(context, origin, "camille");
  await speak("en");
  await page.goto(origin + "/chest/settings");
  const paid = page.locator(".type-editor").filter({ has: page.locator('input[placeholder="Paid leave"]') });
  expect((await paid.getByLabel("Payroll code").inputValue()) === "CP", "CP by default");
  await paid.getByLabel("Payroll code").fill("CP1");
  await paid.getByLabel("Payroll code").blur();
  await page.waitForSelector(".ck-toast");
  const month = new Date().toISOString().slice(0, 7);
  const csv = await (await page.request.get(origin + "/chest/people/export?month=" + month)).text();
  expect(csv.split("\r\n")[0].includes("Payroll code") && csv.includes(",CP1,"), "code in the CSV: " + csv.split("\r\n").slice(0, 2).join(" / "));
  const balances = await (await page.request.get(origin + "/chest/people/balances")).text();
  expect(balances.includes("Paid leave (CP1) left"), "code in the balances CSV");
  await paid.getByLabel("Payroll code").fill("CP");
  await paid.getByLabel("Payroll code").blur();
  await page.waitForTimeout(500);
});

await step("Inès leaves: her approved leave after the last day is cancelled, the days come back with the reason, HR is told", async () => {
  await as(context, origin, "camille");
  await speak("en");
  await page.goto(origin + "/chest/people/" + id("ines"));
  const before = await page.locator(".balance", { hasText: "Paid leave" }).locator(".balance-figure strong").innerText();
  await page.request.post(origin + "/_dev/event", { form: { type: "member.removed", member: id("ines") } });
  await page.goto(origin + "/chest/people/" + id("ines"));
  const after = await page.locator(".balance", { hasText: "Paid leave" }).locator(".balance-figure strong").innerText();
  expect(Number(after) === Number(before) + 0.5, "the half day comes back: " + before + " → " + after);
  // The paid half day's line (her RTT day after the last day, when the
  // seed's dates put one there, has its own).
  expect(await page.locator(".ledger tr", { hasText: "After their last day" }).filter({ hasText: "Paid leave" }).count() === 1, "the ledger says why");
  expect((await page.locator(".requests").innerText()).includes("Cancelled"), "the leave is cancelled");
});

await step("the leave cancelled when Inès left the Chest is told to Rooms and People as cancelled", async () => {
  const gone = await db`select distinct r.id from requests r join request_events e on e.request_id = r.id
    where r.member_id = ${id("ines")} and e.kind = 'after_last_day' and r.decided_at is not null`;
  expect(gone.length >= 1, "leave cancelled by her last day");
  for (const r of gone) {
    const [latest] = await toldOf(r.id, told => told[0]?.type === "leave.cancelled");
    expect(latest?.type === "leave.cancelled" && latest.data.member === id("ines"), "leave.cancelled for " + r.id + ": " + JSON.stringify(latest));
  }
});

await step("phone, this week: an absence that starts after the month's end is still listed", async () => {
  await as(context, origin, "camille");
  await speak("en");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/chest/calendar");
  const first = page.locator(".week-group").first();
  // Léa's seeded Thursday–Friday of this week (past by Friday evening).
  if (new Date().getUTCDay() >= 1 && new Date().getUTCDay() <= 4) expect((await first.innerText()).includes("Léa Dubois"), "Léa's Thursday–Friday in this week's card: " + (await first.innerText()).slice(0, 200));
  await page.setViewportSize({ width: 1280, height: 860 });
});

await step("phone width, in French: the month as a list of days, labelled tabs under the header, no sideways scroll", async () => {
  await as(context, origin, "lea");
  await speak("fr");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/chest", "/chest/calendar", "/chest/new", "/chest/approvals"]) {
    await page.goto(origin + path);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width <= 392, path + " overflows: " + width);
  }
  await page.goto(origin + "/chest/calendar?month=" + day(monday).slice(0, 7));
  expect(await page.locator(".day-list").isVisible(), "list by week");
  const cards = await page.locator(".week-group li:not(.holiday-row)").count();
  const people = new Set(await page.locator(".week-group li:not(.holiday-row) .day-who strong").allInnerTexts());
  expect(cards >= 1 && cards <= 40, "one card per absence: " + cards + " for " + people.size + " people");
  expect(!(await page.locator(".grid-wrap").isVisible()), "grid hidden");
  // The store's one phone rule (the kit's AppShell): the sections are
  // labelled tabs in a row of their own under the header, never hidden.
  const tabs = await page.locator(".ck-nav").boundingBox();
  expect(tabs && tabs.y < 200 && tabs.width >= 380, "tab row under the header: " + JSON.stringify(tabs));
  const labels = await page.locator(".ck-nav .ck-nav-label").evaluateAll(els => els.filter(e => e.getBoundingClientRect().height > 0).map(e => e.textContent));
  expect(labels.includes("Mes congés") && labels.includes("Qui est absent") && labels.includes("À valider"), "labelled tabs: " + labels.join(", "));
});

async function deliver(type, data) {
  await page.goto(origin + "/_dev");
  const form = page.locator('form[action="/_dev/deliver"]');
  await form.locator("select[name=type]").selectOption(type);
  await form.locator("textarea[name=data]").fill(JSON.stringify(data));
  await form.getByRole("button", { name: "Deliver" }).click();
  await page.waitForLoadState("load");
}

await db.end();
await browser.close();
done(problems);
