// Drives gallery/components.html with the keyboard and the mouse: the toast's
// Undo (Ctrl+Z, hover pause, sent, one per id, failure; 0.2.6: gone by
// itself after a click or a tap, above a phone's bottom bar), the day
// strip's one Tab stop (0.2.6), the dialog's dirty
// guard, Confirm, the people picker, the date field and calendar, times,
// table sort, '/' search, the row menu, tabs. Fails on the first broken step.
//   npm run gallery && node scripts/gallery/check-flows.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(new URL("../../../lab/chest-dev/package.json", import.meta.url));
const { chromium } = require("playwright-core");
const out = (await import("node:fs")).mkdtempSync((await import("node:os")).tmpdir() + "/chest-ui-gallery-");
console.log("screenshots in", out);
const browser = await chromium.launch((await import("node:fs")).existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? { executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = []; page.on("pageerror", e => errors.push(e.message)); page.on("console", m => m.type() === "error" && errors.push(m.text()));
await page.goto(new URL("../../gallery/components.html", import.meta.url).href);
await page.evaluate(() => localStorage.clear()); await page.reload();
const en = page.locator("#bench-en");
const step = (s) => console.log("ok -", s);

// Toast: undo via button, then Ctrl+Z; sent has no undo; failing undo says so.
await en.getByRole("button", { name: "Delete a note" }).click();
const toast = en.locator(".ck-toast", { hasText: "Note deleted." });
await toast.waitFor();
await page.keyboard.press("Control+z");
await en.locator(".ck-toast", { hasText: "Undone." }).waitFor();
step("Ctrl+Z runs the newest Undo, the toast says Undone");
await en.getByRole("button", { name: "Send the invitation" }).click();
const sent = en.locator(".ck-toast", { hasText: "Invitation sent" });
await sent.waitFor();
assert.equal(await sent.locator(".ck-toast-undo").count(), 0);
step("a sent toast offers no Undo");
await en.getByRole("button", { name: "Move a card" }).click();
await en.getByRole("button", { name: "Move a card" }).click();
assert.equal(await en.locator(".ck-toast", { hasText: "Card moved" }).count(), 1);
step("one toast per action id");
await en.getByRole("button", { name: "Stop the timer" }).click();
const timer = en.locator(".ck-toast", { hasText: "Timer stopped" });
await timer.getByRole("button", { name: "Keep 1 min" }).click();
await en.locator(".ck-toast", { hasText: "Kept: 1 min." }).waitFor();
assert.equal(await timer.count(), 0, "the toast goes once its action ran");
step("a toast's own action runs once, then the toast goes");
// A short toast keeps its close button on its line (Wiki, 0.2.2).
await en.getByRole("button", { name: "Move a card" }).click();
const short = en.locator(".ck-toast", { hasText: "Card moved" });
const line = await short.evaluate(t => { const a = t.querySelector(".ck-toast-text").getBoundingClientRect(), b = t.querySelector(".ck-toast-close").getBoundingClientRect(); return { text: a.top + a.height / 2, close: b.top + b.height / 2, height: t.getBoundingClientRect().height }; });
assert.ok(Math.abs(line.text - line.close) <= 2 && line.height <= 56, `the close button sits on the text's line (${JSON.stringify(line)})`);
step("a short toast keeps its close button on its line");
await en.getByRole("button", { name: "Undo that fails" }).click();
const failing = en.locator(".ck-toast", { hasText: "Board archived." });
await failing.hover();
await page.waitForTimeout(11000);
assert.equal(await failing.count(), 1, "hovered toast still there after 11 s");
step("hover pauses the toast beyond its 10 s");
await failing.locator(".ck-toast-undo").focus();
await page.keyboard.press("Enter");
await en.locator(".ck-toast", { hasText: "Someone changed the board" }).waitFor();
const focusedClose = await page.evaluate(() => document.activeElement?.className);
assert.equal(focusedClose, "ck-toast-close");
step("a failed Undo says why, and focus lands on the toast's close button");
await page.mouse.move(0, 0);

// A toast goes by itself (0.2.6; Quotes' flow had to close one): it waited
// for ever when it appeared under a pointer that did not move (the bar's
// button just clicked), when a click on its Undo left the focus in it,
// and after a tap on a phone (a tap is not a hover).
{
  const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  desk.on("pageerror", e => errors.push(e.message));
  await desk.goto(page.url());
  const bench = desk.locator("#bench-en");
  const gone = async (locator, ms, what) => {
    const t0 = Date.now();
    await locator.waitFor({ state: "detached", timeout: ms }).catch(() => {});
    assert.equal(await locator.count(), 0, `${what}: still there after ${ms} ms`);
    return Date.now() - t0;
  };
  // Under a still pointer: the toast is shown by the keyboard with the mouse resting where it appears.
  await bench.getByRole("button", { name: "Send the invitation" }).focus();
  await desk.mouse.move(640, 900 - 16 - 26);
  await desk.keyboard.press("Enter");
  const under = bench.locator(".ck-toast", { hasText: "Invitation sent" });
  await under.waitFor();
  const box = await under.boundingBox();
  assert.ok(box.y <= 900 - 16 - 26 && box.y + box.height >= 900 - 16 - 26, "the pointer rests on the toast");
  await gone(under, 6000 + 2500, "a toast under a still pointer");
  // A click on Undo: "Undone." goes in its 4 s, the focus left where the click put it.
  await bench.getByRole("button", { name: "Move a card" }).click();
  await bench.locator(".ck-toast", { hasText: "Card moved" }).locator(".ck-toast-undo").click();
  const undone = bench.locator(".ck-toast", { hasText: "Undone." });
  await undone.waitFor();
  await desk.mouse.move(5, 5);
  assert.notEqual(await desk.evaluate(() => document.activeElement?.className), "ck-toast-close", "a click does not put the focus in the toast");
  await gone(undone, 4000 + 2500, "Undone. after a click on Undo");
  // A mouse that moves onto it still holds it (WCAG 2.2.1), and lets it go when it leaves.
  await bench.getByRole("button", { name: "Move a card" }).click();
  const held = bench.locator(".ck-toast", { hasText: "Card moved" });
  await held.hover();
  await desk.waitForTimeout(11000);
  assert.equal(await held.count(), 1, "a pointed toast waits beyond its 10 s");
  await desk.mouse.move(5, 5);
  await gone(held, 10000 + 2500, "a toast the pointer left (its time left, 10 s at most)");
  await desk.close();
  // A phone: tap Undo, then nothing — "Undone." goes by itself.
  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
  const phone = await phoneCtx.newPage();
  phone.on("pageerror", e => errors.push(e.message));
  await phone.goto(page.url());
  const pbench = phone.locator("#bench-en");
  await pbench.getByRole("button", { name: "Move a card" }).tap();
  await pbench.locator(".ck-toast", { hasText: "Card moved" }).locator(".ck-toast-undo").tap();
  const tapped = pbench.locator(".ck-toast", { hasText: "Undone." });
  await tapped.waitFor();
  await gone(tapped, 4000 + 2500, "Undone. after a tap on Undo");
  // Above a phone's bottom bar (Quotes' "Send" bar): a bar marked
  // data-ck-bottom-bar lifts the toasts by its height; without it, as before.
  await pbench.getByRole("button", { name: "Move a card" }).tap();
  const plain = await pbench.locator(".ck-toast").last().boundingBox();
  assert.ok(plain.y + plain.height >= 800 - 16 - 20, `without a bar the toast sits at the bottom (${plain.y + plain.height})`);
  await pbench.locator(".ck-toast-close").last().tap();
  await phone.evaluate(() => { const bar = document.createElement("div"); bar.setAttribute("data-ck-bottom-bar", ""); bar.style.cssText = "position:fixed;left:0;right:0;bottom:0;height:72px;z-index:50;background:var(--surface)"; bar.innerHTML = "<button type='button' style='width:100%;height:72px'>Send</button>"; document.body.append(bar); });
  await pbench.getByRole("button", { name: "Move a card" }).tap();
  const lifted = pbench.locator(".ck-toast", { hasText: "Card moved" });
  await lifted.waitFor(); await phone.waitForTimeout(400);
  const t = await lifted.boundingBox();
  assert.ok(t.y + t.height <= 800 - 72, `the toast is above the bar (its bottom at ${t.y + t.height}, the bar's top at ${800 - 72})`);
  assert.equal(await phone.evaluate(() => document.elementFromPoint(195, 800 - 36)?.textContent), "Send", "the bar's button is not covered");
  await phoneCtx.close();
}
step("toasts go by themselves (a still pointer, a click or a tap on Undo), wait for a moving pointer, and sit above a phone's bottom bar (0.2.6)");

// Dialog dirty guard
await en.getByRole("button", { name: "New board" }).click();
const dlg = page.getByRole("dialog", { name: "New board" }).first(); await page.waitForTimeout(200);
assert.equal(await page.evaluate(() => document.activeElement?.id), "en-board-name", "opens on its first field");
await page.keyboard.type("Marketing");
await page.keyboard.press("Escape");
await page.getByText("Discard your changes?").first().waitFor();
assert.ok(await dlg.isVisible(), "still open while asking");
await page.screenshot({ path: `${out}/flow-dialog-ask.png` });
await page.keyboard.press("Enter"); await page.waitForTimeout(100);
assert.equal(await page.evaluate(() => document.activeElement?.id), "en-board-name");
await page.mouse.click(5, 5); // backdrop
await page.getByText("Discard your changes?").first().waitFor();
await page.getByRole("button", { name: "Discard" }).first().click();
assert.ok(!(await dlg.isVisible()));
step("dirty dialog asks on Escape and on the backdrop, inside the dialog");
// A list and a calendar inside a dialog are shown whole, over its edge.
await en.getByRole("button", { name: "New board" }).click(); await page.waitForTimeout(200);
const dialogBox = await dlg.boundingBox();
const owner = dlg.getByRole("combobox", { name: "Owner" });
await owner.click();
const ownerList = dlg.getByRole("listbox", { name: "Owner" });
await ownerList.waitFor();
assert.equal(await ownerList.locator(".ck-list-head").textContent(), "Suggested", "suggestions have their own heading");
const listBox = await ownerList.boundingBox();
assert.ok(listBox.y + listBox.height > dialogBox.y + dialogBox.height, `the list goes past the dialog's edge (${listBox.y + listBox.height} > ${dialogBox.y + dialogBox.height})`);
const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("[role=listbox]") !== null, { x: listBox.x + listBox.width / 2, y: listBox.y + listBox.height - 6 });
assert.ok(hit, "the bottom of the list is seen and reachable, not cut by the dialog");
await page.screenshot({ path: `${out}/flow-dialog-list.png` });
await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
assert.equal(await owner.inputValue(), "Camille Martin");
await dlg.getByRole("button", { name: "Choose on a calendar" }).click();
const cal = dlg.locator(".ck-calendar");
const calBox = await cal.boundingBox();
const calHit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest(".ck-calendar") !== null, { x: calBox.x + calBox.width / 2, y: calBox.y + calBox.height - 6 });
assert.ok(calHit, "the calendar is whole, over the dialog's edge");
await page.keyboard.press("Enter");
assert.match(await dlg.getByRole("textbox", { name: "Starts on" }).inputValue(), /^\d\d\/\d\d\/\d{4}$/u);
await page.keyboard.press("Escape");
assert.ok(!(await dlg.isVisible()));
step("dialog: a picker's list and a calendar escape the dialog's edge");
await en.getByRole("button", { name: "Erase Léa’s data" }).click();
const conf = page.getByRole("alertdialog", { name: /Erase Léa Moreau/ });
await conf.waitFor(); await page.waitForTimeout(200);
assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Cancel", "opens on the safe button");
await page.mouse.click(5, 5);
assert.ok(await conf.isVisible(), "backdrop does nothing");
await page.keyboard.press("Escape");
assert.ok(!(await conf.isVisible()));
step("Confirm: alertdialog on Cancel; backdrop inert; Escape cancels");
// A Confirm opened from a Dialog closes alone: by its Cancel, by Escape,
// and by its action — the Dialog stays open (Expenses, 0.2.2).
await en.getByRole("button", { name: "New board" }).click(); await page.waitForTimeout(200);
const nested = () => page.getByRole("alertdialog", { name: /Delete the “Sprint” template/ });
await dlg.getByRole("button", { name: "Delete the template" }).click();
await nested().waitFor();
await nested().getByRole("button", { name: "Cancel" }).click();
await page.waitForTimeout(150);
assert.ok(!(await nested().isVisible()), "the Confirm closed");
assert.ok(await dlg.isVisible(), "its Cancel left the Dialog open");
await dlg.getByRole("button", { name: "Delete the template" }).click();
await nested().waitFor(); await page.waitForTimeout(150);
await page.keyboard.press("Escape"); await page.waitForTimeout(150);
assert.ok(!(await nested().isVisible()), "Escape closed the Confirm");
assert.ok(await dlg.isVisible(), "Escape on the Confirm left the Dialog open");
await dlg.getByRole("button", { name: "Delete the template" }).click();
await nested().waitFor();
await nested().getByRole("button", { name: "Delete the template" }).click();
await en.locator(".ck-toast", { hasText: "Template deleted." }).waitFor();
assert.ok(await dlg.isVisible(), "its action left the Dialog open");
await page.keyboard.press("Escape"); await page.waitForTimeout(150);
assert.ok(!(await dlg.isVisible()), "Escape then closes the Dialog itself");
step("a Confirm opened from a Dialog closes alone (Cancel, Escape, its action)");

// People picker
const guests = en.getByRole("combobox", { name: "Guests" });
await guests.click();
await page.keyboard.type("lé");
await page.waitForTimeout(500);
await page.keyboard.press("ArrowDown");
const active = await guests.getAttribute("aria-activedescendant");
assert.ok(active);
await page.screenshot({ path: `${out}/flow-picker.png` });
await page.keyboard.press("ArrowUp");
await page.keyboard.press("Enter");
const chips = await en.locator(".ck-picker").nth(1).locator(".ck-chip").allTextContents();
assert.ok(chips.some(c => c.includes("Léa Moreau")), chips.join("|"));
await page.keyboard.press("Backspace");
assert.equal(await en.locator(".ck-picker").nth(1).locator(".ck-chip").count(), 2);
step("picker: type, arrows (activedescendant), Enter adds a chip, Backspace removes it");
// Enter while the answer is on its way: nothing chosen, the form not sent.
const guestChips = () => en.locator(".ck-picker").nth(1).locator(".ck-chip").count();
const formSent = en.getByText(/^Form sent/u);
await guests.focus();
await page.keyboard.type("to"); await page.keyboard.press("Enter");
assert.equal(await guestChips(), 2, "nothing chosen while searching");
assert.equal(await en.locator(".ck-picker").nth(1).getByRole("listbox").getAttribute("aria-busy"), "true", "the list says it is busy");
await page.waitForTimeout(500);
assert.equal(await guests.getAttribute("aria-activedescendant") !== null, true, "the answer came: its first option is active");
await page.keyboard.press("Enter");
assert.equal(await guestChips(), 3, "Enter after the answer picks the active option");
await page.keyboard.type("hu"); await page.waitForTimeout(500);
await page.keyboard.type("x"); await page.keyboard.press("Enter");
assert.equal(await guestChips(), 3, "an earlier answer is not chosen while the new one is on its way");
await page.waitForTimeout(500); await page.keyboard.press("Enter");
assert.equal(await formSent.count(), 0, "Enter in the picker never sent the form");
await page.keyboard.press("Escape");
await guests.fill(""); await page.keyboard.press("Backspace");
assert.equal(await guestChips(), 2);
step("picker: Enter never chooses an old answer nor sends the form while searching");
// A single picker that may be left empty: its visible button (People, Support, 0.2.2).
const ownerBox = en.locator(".ck-picker").first();
await ownerBox.getByRole("button", { name: "Remove Léa Moreau" }).click();
assert.equal(await en.getByRole("combobox", { name: "Owner" }).first().inputValue(), "");
assert.equal(await ownerBox.locator(".ck-picker-clear").count(), 0, "nothing chosen: no button");
assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("role")), "combobox", "focus back in the field");
await page.keyboard.press("Escape");
step("picker: clearable empties a single choice");

// Date field: the line of the date in words is kept while it is empty, so
// the button right under the field does not move between press and release
// (the blur that writes the date happens on the press).
const due = en.getByRole("textbox", { name: "Due" });
await due.fill(""); await due.press("Tab");
assert.equal(await en.locator(".ck-date-read").first().textContent(), "", "no date: the line is empty");
const saveDue = en.getByRole("button", { name: "Save the date" });
await saveDue.scrollIntoViewIfNeeded();
const gapBelow = async () => (await saveDue.boundingBox()).y - (await due.boundingBox()).y;
const before = await gapBelow();
await due.fill("tomorrow");
await saveDue.click();
await en.getByText(/^Saved: \w+day \d+ \w+ \d{4}\.$/u).waitFor({ timeout: 2000 });
assert.equal(await gapBelow(), before, "the button did not move when the date was written in words");
assert.match(await en.locator(".ck-date-read").first().textContent(), /^Tomorrow · /u);
step("date: a click right after typing lands (the words' line is reserved)");

// Date field typing + calendar
await due.fill("tomorrow"); await due.press("Enter");
assert.match(await due.inputValue(), /^\d\d\/\d\d\/\d{4}$/);
await due.fill("31/02/2026"); await due.press("Tab");
await en.getByText("Type a date like").waitFor();
step("date: words parsed, a wrong date explained");
await due.fill("15/10/2026"); await due.press("Enter");
await en.getByRole("button", { name: "Choose on a calendar" }).first().click();
assert.equal(await page.evaluate(() => document.activeElement?.dataset.day), "2026-10-15");
await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowRight"); await page.keyboard.press("PageDown");
assert.equal(await page.evaluate(() => document.activeElement?.dataset.day), "2026-11-23");
await page.screenshot({ path: `${out}/flow-calendar.png` });
await page.keyboard.press("Enter");
assert.equal(await due.inputValue(), "23/11/2026");
step("calendar: opens on the day, arrows and Page Down, Enter picks");

// A date before `min` (0.2.4, Timesheets saved "today" in place of
// refusing): the typed text stays, the field says why and is invalid,
// onChange is not called, and the form's submit stops on the field (its
// Save would have sent the previous day, 23 November).
const savedNote = en.getByText(/^Saved: /u).first();
const savedBefore = await savedNote.textContent();
await due.fill("01/01/2020"); await due.press("Tab");
await en.getByText(/^Choose .+ or later\.$/u).waitFor({ timeout: 2000 });
assert.equal(await due.inputValue(), "01/01/2020", "the typed text is kept");
assert.equal(await due.getAttribute("aria-invalid"), "true");
const errorId = await en.locator(".ck-date .ck-error").first().getAttribute("id");
assert.ok((await due.getAttribute("aria-describedby")).split(" ").includes(errorId), "the problem is read with the field");
assert.match(await due.evaluate(e => e.validationMessage), /^Choose .+ or later\.$/u, "the browser knows the field is refused");
await saveDue.click();
await page.waitForTimeout(200);
assert.equal(await savedNote.textContent(), savedBefore, "the submit stopped: the previous day was not saved");
assert.equal(await due.evaluate(e => document.activeElement === e), true, "the browser points at the field");
assert.equal(await due.inputValue(), "01/01/2020");
await due.fill("tomorrow"); await due.press("Tab");
assert.equal(await due.getAttribute("aria-invalid"), null);
assert.equal(await due.evaluate(e => e.validity.valid), true);
await saveDue.click();
await en.getByText(/^Saved: \w+day \d+ \w+ \d{4}\.$/u).waitFor({ timeout: 2000 });
step("date: a day before min keeps its text, says why, is invalid, and its form never sends the previous day");

// A corrected date, then Save in one move (0.2.5; Support's "day off",
// Quotes' payment dialog): the refused date's sentence stood under the
// field; 0.2.4 read the corrected text only on the press's blur, the
// sentence went, the Save button moved up between press and release, and
// the click was lost. Now the sentence goes as the good date is typed:
// leaving the field moves nothing, the click lands, the new date is saved.
const { formatDate, addDays, en: kitEn } = await import(new URL("../../dist/components/logic.js", import.meta.url).href);
const today = await page.evaluate(() => document.body.dataset.today);
const dmy = iso => `${iso.slice(8)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const savedAs = iso => `Saved: ${formatDate(iso, kitEn.date, "long")}.`;
const tooEarly = en.getByText(/^Choose .+ or later\.$/u);
const refuse = async () => { await due.fill("01/01/2020"); await due.press("Tab"); await tooEarly.waitFor({ timeout: 2000 }); };
const dueBox = en.locator(".ck-date").filter({ has: page.getByRole("textbox", { name: "Due", exact: true }) });
const dueRead = () => dueBox.locator(".ck-date-read");
await due.fill(""); await due.press("Tab");
const restGap = await gapBelow();
const later = addDays(today, 40);
await refuse();
await due.fill(dmy(later));
await saveDue.click();
await page.waitForTimeout(200);
assert.equal(await savedNote.textContent(), savedAs(later), "the click right after correcting the date saved the new date");
assert.equal(await tooEarly.count(), 0);
assert.equal(await gapBelow(), restGap, "the Save button is where it was before the refusal");
assert.equal(await due.inputValue(), dmy(later));
// A date without its year ("29/10") is read on blur: while it is typed the
// sentence goes, the value waits (more digits could make it another day).
await refuse();
await due.fill(dmy(today).slice(0, 5));
await page.waitForTimeout(100);
assert.equal(await tooEarly.count(), 0, "an accepted text clears the sentence while it is typed");
// (0.2.6: while the problem stands the day in words is not shown: the line is kept, empty.)
assert.equal(await dueRead().textContent(), "", "not committed while it could still grow: no day in words yet");
await saveDue.click();
await page.waitForTimeout(200);
assert.equal(await savedNote.textContent(), savedAs(today), "committed on the press's blur, the click kept");
// Half a year is never a date: "1/1/2" is not year 2, nor "1/1/20" 2020
// accepted; the sentence stays until the text reads as an accepted date.
await refuse();
await due.fill("1/1/2");
await page.waitForTimeout(100);
assert.equal(await tooEarly.count(), 1, "a half-typed text keeps the sentence (no new problem, no flicker)");
await due.fill(dmy(later)); await due.press("Tab");
assert.match(await dueRead().textContent(), new RegExp(formatDate(later, kitEn.date, "long")), "the corrected day");
step("date: a corrected date and Save in one move — the sentence goes while typing, the click lands (0.2.5)");

// A refused text never shows the last accepted day in words under it
// (0.2.6; Leave hid the line with a rule of its own): the sentence takes
// the line's place — so saying it on blur moves nothing below — and a
// text that reads well but is not whole yet leaves the line empty.
await due.fill(dmy(today)); await due.press("Tab");
assert.match(await dueRead().textContent(), /^Today · /u);
await refuse();
assert.equal(await dueBox.locator(".ck-date-read").count(), 0, "no day in words under a refused text");
assert.ok(Math.abs(await gapBelow() - restGap) <= 1, `the sentence took the words' line: the Save below did not move (${await gapBelow()} vs ${restGap})`);
await due.fill(dmy(later).slice(0, 5));
await page.waitForTimeout(100);
assert.equal(await tooEarly.count(), 0);
assert.equal(await dueRead().textContent(), "", "a text not whole yet: the line kept, empty — not the last accepted day");
assert.ok(Math.abs(await gapBelow() - restGap) <= 1, "and nothing moved");
await due.fill(dmy(later)); await due.press("Tab");
assert.match(await dueRead().textContent(), new RegExp(`^${formatDate(later, kitEn.date, "long")}$|· ${formatDate(later, kitEn.date, "long")}$`), "the new day, in words");
step("date: a refused text shows no day in words; its sentence takes that line (0.2.6)");

// MonthField: the next month by its button, a month by the list.
const month = en.getByRole("combobox", { name: "Month" });
const thisMonth = await month.inputValue();
await en.getByRole("button", { name: "Next month" }).first().click();
assert.notEqual(await month.inputValue(), thisMonth);
assert.match(await month.locator("option:checked").textContent(), /^[A-Z][a-z]+ \d{4}$/u);
step("month field: next month, the month in words");

// time keeps duration
await en.getByLabel("Starts").selectOption("840");
assert.equal(await en.getByLabel("Ends").inputValue(), "900");
step("moving the start keeps the duration");

// table sort + menu keyboard + "/" search
await en.getByRole("button", { name: /^Amount/ }).click();
assert.equal(await en.locator("th[aria-sort]").getAttribute("aria-sort"), "ascending");
await page.locator("body").click({ position: { x: 3, y: 400 } });
await page.keyboard.press("/");
assert.equal(await page.evaluate(() => document.activeElement?.type), "search");
await page.keyboard.type("garage");
assert.equal(await en.locator(".ck-table tbody tr").count(), 1);
step("sort sets aria-sort, '/' focuses search, filtering works");
const menuBtn = en.getByRole("button", { name: /Actions for Q-2026-016/ });
await menuBtn.focus(); await page.keyboard.press("ArrowDown");
assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("role")), "menuitem");
await page.keyboard.press("End"); await page.keyboard.press("Escape");
assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-haspopup")), "menu");
step("menu keyboard: opens on arrow, End, Escape gives focus back");
// The (only) row's menu is whole, over the table's scrolling frame.
await menuBtn.click();
const menuList = en.getByRole("menu");
const menuBox = await menuList.boundingBox();
const wrapBox = await en.locator(".ck-table-wrap").boundingBox();
assert.ok(menuBox.y + menuBox.height > wrapBox.y + wrapBox.height, "the menu goes past the table's frame");
assert.ok(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("[role=menu]") !== null, { x: menuBox.x + menuBox.width / 2, y: menuBox.y + menuBox.height - 6 }), "its last item is seen and reachable");
await page.keyboard.press("Escape");
step("a row's menu is not cut by the table's scrolling frame");

// Filters with several values: two chips on, then one let go.
await page.locator("body").click({ position: { x: 3, y: 400 } });
await page.keyboard.press("/"); await page.keyboard.press("Control+a"); await page.keyboard.press("Backspace");
const chip = name => en.locator(".ck-filter-chip", { hasText: name });
await chip("Sent").click(); await chip("Late").click();
assert.equal(await en.locator(".ck-table tbody tr").count(), 3, "sent (2) and late (1)");
assert.equal(await en.locator('.ck-filter-chip[aria-current="true"]').count(), 2);
await chip("Sent").click();
assert.equal(await en.locator(".ck-table tbody tr").count(), 1);
await en.locator(".ck-filter-clear").click();
assert.equal(await en.locator(".ck-table tbody tr").count(), 5);
step("filters: several states at once, one let go, Clear");
// A sortable header reads as the tool's headers (small caps, tracking, case).
const th = en.locator("th[aria-sort]").first();
await th.evaluate(el => { el.style.textTransform = "uppercase"; el.style.letterSpacing = "0.08em"; el.style.fontVariantCaps = "small-caps"; });
const typo = await th.evaluate(el => { const b = el.querySelector(".ck-sort"), a = getComputedStyle(el), c = getComputedStyle(b); return [a.textTransform, a.letterSpacing, a.fontVariantCaps].join() === [c.textTransform, c.letterSpacing, c.fontVariantCaps].join(); });
assert.ok(typo, "the sort button inherits the header's typography");
step("a sortable header's button inherits the header's typography");

// Segmented: a click on the word chooses (the hidden radio does not cover it); a disabled option cannot be chosen.
await en.getByText("Morning", { exact: true }).click();
assert.ok(await en.getByRole("radio", { name: "Morning" }).isChecked());
assert.ok(await en.getByRole("radio", { name: "Afternoon" }).isDisabled());
await en.getByText("Afternoon", { exact: true }).click({ force: true });
assert.ok(await en.getByRole("radio", { name: "Morning" }).isChecked(), "a disabled option stays unchosen");
assert.ok(await en.getByRole("radio", { name: "List" }).nth(1).isDisabled(), "a disabled Segmented");
await en.getByRole("radio", { name: "Morning" }).focus(); await page.keyboard.press("ArrowRight");
assert.ok(await en.getByRole("radio", { name: "All day" }).isChecked(), "arrows skip the disabled option");
step("segmented: the word is the target, disabled options and groups");

// Menu items: a second line, two items of one label, a download link (Support, Equipment, Wiki, 0.2.2).
await en.getByRole("button", { name: "Give to" }).click();
const giveTo = en.getByRole("menu");
assert.equal(await giveTo.getByRole("menuitem").count(), 2, "two items of the same name, both there");
assert.match(await giveTo.getByRole("menuitem").nth(1).textContent(), /Léa Moreau.*Sales, Lyon/u);
await page.keyboard.press("ArrowDown");
assert.match(await page.evaluate(() => document.activeElement?.textContent), /Sales, Lyon/u, "arrows move between items of one label");
await page.keyboard.press("Escape");
await en.getByRole("button", { name: "Export" }).click();
const csv = en.getByRole("menuitem", { name: /Download CSV/ });
assert.equal(await csv.getAttribute("download"), "quotes.csv");
assert.equal(await en.getByRole("menuitem", { name: /Open the board/ }).getAttribute("download"), null);
const exportBox = await en.getByRole("button", { name: "Export" }).boundingBox();
assert.ok(exportBox.height >= 44, "a shown label's button is 44 px");
await page.keyboard.press("Escape");
step("menu: a second line, items of one label, a download");
// Segmented link variant: a link per view, the current one marked (CRM).
await en.getByRole("link", { name: "List", exact: true }).click();
assert.equal(await en.getByRole("link", { name: "List", exact: true }).getAttribute("aria-current"), "page");
assert.ok(await en.getByRole("radio", { name: "List" }).first().isChecked(), "the same state, as links");
await en.getByRole("link", { name: "Board", exact: true }).click();
step("segmented links: a view in the address");
// Switch (Forms).
const sw = en.getByRole("switch", { name: "Email me when someone answers" });
assert.ok(await sw.isChecked());
await en.getByText("Email me when someone answers").click();
assert.ok(!(await sw.isChecked()), "a click on the words turns it off");
await sw.focus(); await page.keyboard.press("Space");
assert.ok(await sw.isChecked(), "Space turns it on");
step("switch: words and Space");
// Calendar, several days (People).
const daysOff = en.getByRole("group", { name: "Days off" });
const chosenBefore = await daysOff.locator('[aria-selected="true"]').count();
await daysOff.locator("button.ck-day:not(.ck-day-chosen):not(.ck-day-out)").first().click();
assert.equal(await daysOff.locator('[aria-selected="true"]').count(), chosenBefore + 1, "a day added");
await page.keyboard.press("Enter");
assert.equal(await daysOff.locator('[aria-selected="true"]').count(), chosenBefore, "Enter takes it away again; the calendar stays");
assert.equal(await daysOff.getByRole("grid").getAttribute("aria-multiselectable"), "true");
step("calendar: several days, added and taken away");
// A range of days: moving its start keeps its length (0.2.2).
const trip = en.getByRole("group", { name: "Trip" });
const tripFrom = trip.getByRole("textbox", { name: "From" }), tripTo = trip.getByRole("textbox", { name: "To" });
// (0.2.3: the other field's text is written in the same render — no wait.)
await tripFrom.fill("20/11/2026"); await tripFrom.press("Enter");
assert.equal(await tripTo.inputValue(), "22/11/2026", "three days stay three days");
assert.equal(await trip.locator(".ck-range-length").textContent(), "3 days");
await tripTo.fill("18/11/2026"); await tripTo.press("Enter");
assert.match(await trip.locator(".ck-error").first().textContent(), /Choose .* or later/u, "an end before the start is refused, in words");
await tripTo.fill("25/11/2026");
// (0.2.5: the corrected end clears the sentence and counts as it is typed.)
assert.equal(await trip.locator(".ck-error").count(), 0, "the sentence goes as the good end is typed, before any blur");
assert.equal(await trip.locator(".ck-range-length").textContent(), "6 days", "the range holds the typed end at once");
await tripTo.press("Enter");
assert.equal(await trip.locator(".ck-range-length").textContent(), "6 days");
step("date range: the length kept, the end never before the start");
// The Leave race (0.2.3): a value changed from outside reaches the field's
// text in the very commit that carries it — 0.2.2 copied it in an effect,
// later, and a person typing in between got both texts mixed
// ("25/01/20272027-01-28"). The demo writes the text it finds when React
// commits the new value (a layout effect runs before any effect).
const probe = en.locator('[data-probe="back"]');
const backField = probe.getByRole("textbox", { name: "Back on" });
const firstWant = await probe.getAttribute("data-commit-want");
await probe.getByRole("button", { name: "A week later" }).click();
await page.waitForFunction(w => document.querySelector('#bench-en [data-probe="back"]').dataset.commitWant !== w, firstWant, { timeout: 2000 });
assert.equal(await probe.getAttribute("data-commit-text"), await probe.getAttribute("data-commit-want"), "the new value's text is there when React commits it");
// Then, at once, the same field is typed into: what is typed is what stays.
await probe.getByRole("button", { name: "A week later" }).click();
await backField.fill("24/12/2026"); await backField.press("Tab");
assert.equal(await backField.inputValue(), "24/12/2026", "typed right after an outside change: kept whole");
await page.waitForTimeout(300);
assert.equal(await backField.inputValue(), "24/12/2026", "and nothing lands on it later");
// A leave: the first day moved (the last day follows, from outside), the
// last day typed at once — no waiting, no mixed text.
const leave = en.getByRole("group", { name: "Leave" });
const leaveFrom = leave.getByRole("textbox", { name: "From" }), leaveTo = leave.getByRole("textbox", { name: "To" });
assert.equal(await leaveFrom.getAttribute("id"), "en-leave-from", "the fields' own ids");
await leaveFrom.fill("04/01/2027");
await leaveTo.fill("08/01/2027"); await leaveTo.press("Tab");
assert.equal(await leaveTo.inputValue(), "08/01/2027", "the last day typed right after the first moved it");
assert.equal(await leaveFrom.inputValue(), "04/01/2027");
assert.equal(await leave.locator(".ck-range-length").textContent(), "Days off: 5");
await leave.getByText("From noon", { exact: true }).click();
assert.equal(await leave.locator(".ck-range-length").textContent(), "Days off: 4.5", "a slot under each end, the tool's own count");
await leave.getByRole("button", { name: "Tomorrow" }).click();
assert.equal(await leave.getByRole("button", { name: "Tomorrow" }).getAttribute("aria-pressed"), "true", "the first day's chips");
// A filter's period: moving its start leaves its end (keepLength={false}).
const period = en.getByRole("group", { name: "Period" });
const periodTo = await period.getByRole("textbox", { name: "To" }).inputValue();
await period.getByRole("textbox", { name: "From" }).fill("01/01/2026"); await period.getByRole("textbox", { name: "From" }).press("Enter");
assert.equal(await period.getByRole("textbox", { name: "To" }).inputValue(), periodTo, "the end stays");
step("date: an outside change is the text at once; typing right after it is kept (the Leave race)");
// DayStrip, one Tab stop (0.2.6; Rooms had 27 Tab stops before its first
// desk): the chosen day is the strip's only Tab stop, Left/Right move a
// day, Home/End the ends, Enter or Space chooses; Tab leaves the strip.
// Buttons are a listbox of options; links stay links (Rooms' pages).
{
  const strip = en.getByRole("listbox", { name: "Day" });
  const options = strip.getByRole("option");
  const n = await options.count();
  assert.ok(n >= 10, `ten days (${n})`);
  assert.equal(await strip.locator('[tabindex="0"]').count(), 1, "one Tab stop");
  assert.equal(await strip.locator('[tabindex="-1"]').count(), n - 1, "the other days are reached by the arrows");
  const chosen = strip.locator('[aria-selected="true"]');
  assert.equal(await chosen.getAttribute("tabindex"), "0", "the Tab stop is the chosen day");
  const focusedIndex = () => page.evaluate(() => { const all = [...document.querySelectorAll('#bench-en [role=listbox][aria-label="Day"] [role=option]')]; return all.indexOf(document.activeElement); });
  // Reached by Tab from the control before it.
  await chosen.focus(); await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab");
  assert.equal(await focusedIndex(), 0, "Tab lands on the chosen day (today)");
  await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight");
  assert.equal(await focusedIndex(), 2, "Right: a day later, twice");
  assert.equal(await options.nth(2).getAttribute("aria-selected"), "false", "moving is not choosing");
  await page.keyboard.press("Enter");
  assert.equal(await options.nth(2).getAttribute("aria-selected"), "true", "Enter chooses");
  await page.keyboard.press("End");
  assert.equal(await focusedIndex(), n - 1, "End: the last day");
  await page.keyboard.press("ArrowRight");
  assert.equal(await focusedIndex(), n - 1, "no wrapping past the last day");
  await page.keyboard.press("Home");
  assert.equal(await focusedIndex(), 0, "Home: the first day");
  await page.keyboard.press("ArrowLeft");
  assert.equal(await focusedIndex(), 0);
  await page.keyboard.press("ArrowRight"); await page.keyboard.press(" ");
  assert.equal(await options.nth(1).getAttribute("aria-selected"), "true", "Space chooses");
  assert.equal(await options.nth(1).getAttribute("tabindex"), "0", "the Tab stop follows");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.closest("[role=listbox][aria-label=Day]") === null), true, "one Tab leaves the strip");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await focusedIndex(), 1, "Shift+Tab comes back to the chosen day");
  // Links (Rooms): the same keys, Enter or Space follows the link.
  const links = en.locator('[data-probe="day-links"]');
  const nav = links.getByRole("navigation", { name: "Desks for the day" });
  const tiles = nav.getByRole("link");
  const m = await tiles.count();
  assert.equal(await nav.locator('[tabindex="0"]').count(), 1, "links: one Tab stop");
  const current = nav.locator('[aria-current="date"]');
  assert.equal(await current.getAttribute("tabindex"), "0", "the current day's link");
  const linkIndex = () => page.evaluate(() => { const all = [...document.querySelectorAll('#bench-en [data-probe="day-links"] .ck-daytile')]; return all.indexOf(document.activeElement); });
  await current.focus();
  const start = await linkIndex();
  await page.keyboard.press("ArrowRight");
  assert.equal(await linkIndex(), start + 1);
  const status = links.getByRole("status");
  const before = await status.textContent();
  await page.keyboard.press("Enter");
  assert.notEqual(await status.textContent(), before, "Enter follows the link");
  assert.equal(await nav.locator('[aria-current="date"]').getAttribute("tabindex"), "0", "the new current day is the Tab stop");
  await page.keyboard.press("End");
  assert.equal(await linkIndex(), m - 1);
  await page.keyboard.press(" ");
  assert.match(await status.textContent(), new RegExp(formatDate(addDays(today, m - 1), kitEn.date, "long")), "Space follows the link");
  assert.equal(page.url().includes("#"), false, "the tool's link did the navigating");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.closest('[data-probe="day-links"]') === null), true, "one Tab leaves the strip");
}
step("day strip: one Tab stop, arrows, Home/End, Enter or Space — buttons (a listbox) and links (0.2.6)");

// Filters kept in the page, on a coloured band (0.2.3).
const band = en.locator(".demo-cat-band");
const kind = band.getByRole("combobox", { name: "Item" });
assert.deepEqual(await kind.locator("optgroup").evaluateAll(g => g.map(x => x.label)), ["Hardware", "Software"], "a select's sections");
assert.equal(await kind.locator("option").first().textContent(), "Every category");
assert.equal(await band.locator(".ck-filter-clear").count(), 0);
await kind.selectOption({ label: "Screen" });
assert.match(await band.getByRole("status").textContent(), /^1 shown: Screen$/u);
assert.equal(await band.locator(".ck-filter-clear").count(), 0, "one select on: its own choice lets it go, no Clear");
await band.getByRole("button", { name: "Tom Petit" }).click();
assert.equal(await band.getByRole("button", { name: "Tom Petit" }).getAttribute("aria-pressed"), "true");
assert.match(await band.getByRole("status").textContent(), /^1 shown: Screen$/u);
await band.getByRole("button", { name: "Clear filters" }).click();
assert.match(await band.getByRole("status").textContent(), /^5 shown/u);
assert.equal(await band.getByRole("button", { name: "Anyone" }).getAttribute("aria-pressed"), "true");
assert.equal(page.url().includes("?"), false, "the address untouched");
step("filters in the page: sections, their own All words, Clear only when needed");
// A checkbox that waits for the form's Save.
const billable = en.getByRole("checkbox", { name: "Billable" });
assert.ok(await billable.isChecked());
await en.getByText("Billable", { exact: true }).click();
assert.ok(!(await billable.isChecked()), "its words are the target");
step("checkbox: the words toggle it");
// A filter of many options as a list (Equipment).
await en.getByRole("combobox", { name: "Category" }).selectOption({ label: "Training" });
assert.equal(await en.getByRole("combobox", { name: "Category" }).inputValue(), "c3");
await en.getByRole("combobox", { name: "Category" }).selectOption({ label: "All" });
step("filters: a select group");

// Tabs roving
await en.getByRole("tab", { name: /Upcoming/ }).focus();
await page.keyboard.press("ArrowRight");
assert.equal(await en.getByRole("tab", { name: "Past" }).getAttribute("aria-selected"), "true");
step("tabs: arrows move and select");
assert.deepEqual(errors, [], "no error in the page");
console.log("all flows passed");
await browser.close();
