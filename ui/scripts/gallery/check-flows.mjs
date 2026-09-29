// Drives gallery/components.html with the keyboard and the mouse: the toast's
// Undo (Ctrl+Z, hover pause, sent, one per id, failure), the dialog's dirty
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
await en.getByRole("button", { name: "Erase Léa’s data" }).click();
const conf = page.getByRole("alertdialog", { name: /Erase Léa Moreau/ });
await conf.waitFor(); await page.waitForTimeout(200);
assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Cancel", "opens on the safe button");
await page.mouse.click(5, 5);
assert.ok(await conf.isVisible(), "backdrop does nothing");
await page.keyboard.press("Escape");
assert.ok(!(await conf.isVisible()));
step("Confirm: alertdialog on Cancel; backdrop inert; Escape cancels");

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

// Date field typing + calendar
const due = en.getByRole("textbox", { name: "Due" });
await due.fill("tomorrow"); await due.press("Enter");
assert.match(await due.inputValue(), /^\d\d\/\d\d\/\d{4}$/);
await due.fill("31/02/2026"); await due.press("Tab");
await en.getByText("Type a date like").waitFor();
step("date: words parsed, a wrong date explained");
await due.fill("15/10/2026"); await due.press("Enter");
await en.getByRole("button", { name: "Choose on a calendar" }).click();
assert.equal(await page.evaluate(() => document.activeElement?.dataset.day), "2026-10-15");
await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowRight"); await page.keyboard.press("PageDown");
assert.equal(await page.evaluate(() => document.activeElement?.dataset.day), "2026-11-23");
await page.screenshot({ path: `${out}/flow-calendar.png` });
await page.keyboard.press("Enter");
assert.equal(await due.inputValue(), "23/11/2026");
step("calendar: opens on the day, arrows and Page Down, Enter picks");

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

// Tabs roving
await en.getByRole("tab", { name: /Upcoming/ }).focus();
await page.keyboard.press("ArrowRight");
assert.equal(await en.getByRole("tab", { name: "Past" }).getAttribute("aria-selected"), "true");
step("tabs: arrows move and select");
assert.deepEqual(errors, [], "no error in the page");
console.log("all flows passed");
await browser.close();
