// Rooms, as people use it, in a real browser: node lab/chest-dev/flows/rooms.mjs [port]
// (the harness runs the tool with --reset: the sample office and week are there).
import { as, done, expect, id, open, step } from "./lib.mjs";

const port = Number(process.argv[2] ?? 5000);
// With --empty (a harness run with --empty: a new company, no office), only
// the first visit is played: "Start with an example", then its Undo.
const empty = process.argv.includes("--empty");
const { browser, context, page, origin, problems } = await open(port, empty ? "camille" : "hugo");

if (empty) {
  await step("before any office exists, a member already says where they will be (Office, Remote); the week counts them", async () => {
    await as(context, origin, "hugo");
    await context.addCookies([{ name: "dev_locale", value: "en", url: origin }]);
    await page.goto(origin + "/chest");
    const main = await page.locator("main").innerText();
    expect(main.includes("No office yet") && main.includes("You can already say where you will be each day"), "said so: " + main.slice(0, 300));
    expect(!main.includes("Set up the office"), "a member is not offered to set it up");
    const card = page.locator(".day-card:not(.is-past)").first();
    const cardId = await card.getAttribute("id");
    await card.getByRole("radio", { name: "Office" }).click();
    await page.waitForTimeout(1200);
    await page.reload();
    const again = page.locator("#" + cardId);
    expect(await again.getByRole("radio", { name: "Office" }).getAttribute("aria-checked") === "true", "office saved without an office");
    expect((await again.innerText()).includes("1 person at the office"), "counted: " + (await again.innerText()));
    expect(!(await again.innerText()).includes("Choose a desk"), "no desk offered: there are none");
    await as(context, origin, "camille");
  });
  await step("a new company: the admin starts with an example office in one click, Undo or “Delete the example” takes it back", async () => {
    await context.addCookies([{ name: "dev_locale", value: "en", url: origin }]);
    await page.goto(origin + "/chest");
    expect(await page.getByRole("heading", { name: "No office yet" }).count() === 1, "empty");
    await page.getByRole("button", { name: "Start with an example" }).click();
    await page.waitForSelector(".ck-toast >> text=An example office is ready");
    // Undo: the example goes whole.
    await page.locator(".ck-toast", { hasText: "An example office" }).getByRole("button", { name: "Undo" }).click();
    await page.waitForSelector(".ck-toast >> text=Undone.");
    await page.reload();
    expect(await page.getByRole("heading", { name: "No office yet" }).count() === 1, "empty again after Undo");
    await page.getByRole("button", { name: "Start with an example" }).click();
    await page.waitForSelector(".ck-toast >> text=An example office is ready");
    await page.goto(origin + "/chest/places");
    const main = await page.locator("main").innerText();
    expect(main.includes("This is an example") && main.includes("Ground floor") && main.includes("Quiet zone"), "an example, said so: " + main.slice(0, 300));
    expect(await page.locator(".tile").count() === 12, "twelve desks");
    // French reader: the floors in French.
    await context.addCookies([{ name: "dev_locale", value: "fr", url: origin }]);
    await page.reload();
    const fr = await page.locator("main").innerText();
    expect(fr.includes("Rez-de-chaussée") && fr.includes("Zone calme"), "keys in the reader's language");
    await page.getByRole("button", { name: "Supprimer l’exemple" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer l’exemple" }).click();
    await page.waitForURL(/\/chest\/places$/u);
    await page.waitForSelector("text=Ajoutez votre site").catch(() => {});
    expect((await page.locator("main").innerText()).includes("Commencer avec un exemple"), "back to the empty state, with the example offered");
  });
  await browser.close();
  done(problems);
}

// Next week's Friday (Hugo said nothing for it in the sample).
const iso = d => d.toISOString().slice(0, 10);
const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
const monday = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)));
const friday = iso(new Date(monday.getTime() + 11 * 864e5));
const thursday = iso(new Date(monday.getTime() + 10 * 864e5));
const toastText = async () => (await page.locator(".ck-toast .ck-toast-text").last().innerText()).trim();
// A field of the booking form by its visible label (a select's name also
// holds its options, so getByLabel would match "To" in "October").
const field = (scope, label) => scope.locator("label", { has: page.locator(".label", { hasText: new RegExp(`^${label}$`, "u") }) }).locator("select, input").first();
const far = iso(new Date(monday.getTime() + 24 * 864e5));

await step("my week: say 'office' for a day in one tap; it stays", async () => {
  await page.goto(origin + "/chest");
  const card = page.locator("#day-" + friday);
  await card.getByRole("radio", { name: "Office" }).click();
  await page.waitForTimeout(1200);
  await page.reload();
  expect(await page.locator("#day-" + friday).getByRole("radio", { name: "Office" }).getAttribute("aria-checked") === "true", "office saved");
  expect((await page.locator("#day-" + friday).innerText()).includes("Choose a desk"), "offers a desk");
});

await step("book a desk on the plan with one tap; the week shows it", async () => {
  await page.goto(origin + `/chest/desks?day=${friday}`);
  await page.getByRole("button", { name: "D-06, free. Book it." }).click();
  await page.waitForSelector(".ck-toast");
  expect((await toastText()).startsWith("Desk D-06 booked"), "toast");
  await page.reload();
  expect(await page.getByRole("button", { name: "D-06, booked by you. Free it." }).count() === 1, "mine after reload");
  await page.goto(origin + "/chest");
  expect((await page.locator("#day-" + friday).innerText()).includes("Desk D-06"), "in my week");
});

await step("tap another desk: I change desks; undo puts me back", async () => {
  await page.goto(origin + `/chest/desks?day=${friday}`);
  await page.getByRole("button", { name: "D-07, free. Book it." }).click();
  await page.waitForSelector(".ck-toast");
  await page.waitForTimeout(800);
  await page.locator(".ck-toast-undo").last().click();
  await page.waitForTimeout(1500);
  await page.reload();
  expect(await page.getByRole("button", { name: "D-06, booked by you. Free it." }).count() === 1, "back on D-06");
});

await step("saying 'remote' frees the desk, with an undo", async () => {
  await page.goto(origin + "/chest");
  await page.locator("#day-" + friday).getByRole("radio", { name: "Remote" }).click();
  await page.waitForSelector(".ck-toast");
  expect((await toastText()).includes("Desk D-06 freed"), "freed: " + (await toastText()));
  await page.locator(".ck-toast-undo").last().click();
  await page.waitForTimeout(1800);
  await page.reload();
  expect((await page.locator("#day-" + friday).innerText()).includes("Desk D-06"), "desk back");
});

const nextTuesday = iso(new Date(monday.getTime() + 8 * 864e5));
await step("presence agrees with meetings: a guest who said nothing counts at the office; Remote while invited shows a hint, and one tap says Office", async () => {
  // Next Tuesday: Hugo said nothing, and he is a guest of the client workshop in Atlas at 10:00.
  await as(context, origin, "camille");
  await page.goto(origin + "/chest");
  expect((await page.locator("#day-" + nextTuesday + " .present").innerHTML()).includes("Hugo Bernard"), "the guest counts at the office");
  await as(context, origin, "hugo");
  await page.goto(origin + "/chest");
  const card = page.locator("#day-" + nextTuesday);
  await card.getByRole("radio", { name: "Remote" }).click();
  await card.locator(".meeting-hint").waitFor();
  expect(/Meeting in Atlas at 10:00: coming to the office\?/u.test(await card.locator(".meeting-hint").innerText()), "hint: " + (await card.innerText()));
  await as(context, origin, "camille");
  await page.goto(origin + "/chest");
  expect(!(await page.locator("#day-" + nextTuesday + " .present").innerHTML()).includes("Hugo Bernard"), "Remote: no longer counted");
  await as(context, origin, "hugo");
  await page.goto(origin + "/chest");
  await page.locator("#day-" + nextTuesday + " .meeting-hint").getByRole("button", { name: "Office" }).click();
  await page.waitForTimeout(1200);
  await page.reload();
  const after = page.locator("#day-" + nextTuesday);
  expect(await after.getByRole("radio", { name: "Office" }).getAttribute("aria-checked") === "true", "one tap: Office");
  expect(await after.locator(".meeting-hint").count() === 0, "the hint goes");
});

await step("book a room with a title and a guest; Inès hears it in French", async () => {
  await page.goto(origin + `/chest/rooms?day=${friday}`);
  await page.getByRole("button", { name: "Book a room" }).click();
  const dialog = page.locator("dialog[open]");
  await field(dialog, "Room").selectOption({ label: "Cabin · 2 seats" });
  await field(dialog, "From").selectOption({ label: "11:00" });
  await field(dialog, "To").selectOption({ label: "12:00" });
  await dialog.getByLabel("What for (optional)").fill("Quarterly numbers");
  await dialog.getByRole("combobox", { name: "Invite people (optional)" }).fill("ine");
  await dialog.getByRole("option", { name: /Inès/u }).click();
  expect(await dialog.locator(".ck-chip", { hasText: "Inès" }).count() === 1, "Inès chosen");
  await dialog.getByRole("button", { name: "Book", exact: true }).click();
  await page.waitForSelector(".ck-toast");
  expect((await toastText()).startsWith("Cabin booked"), "toast");
  await page.waitForTimeout(800);
  expect(await page.locator(".block", { hasText: "Quarterly numbers" }).count() === 1, "on the grid");
  const dev = await (await page.request.get(origin + "/_dev")).text();
  expect(/Hugo Bernard vous invite[ \u202f]: Quarterly numbers/u.test(dev), "bell in French");
});

await step("someone else cannot take the same slot: a clear message", async () => {
  await as(context, origin, "tom");
  await page.goto(origin + `/chest/rooms?day=${friday}`);
  await page.getByRole("button", { name: "Book a room" }).click();
  const dialog = page.locator("dialog[open]");
  await field(dialog, "Room").selectOption({ label: "Cabin · 2 seats" });
  await field(dialog, "From").selectOption({ label: "11:30" });
  await field(dialog, "To").selectOption({ label: "12:30" });
  await dialog.getByRole("button", { name: "Book", exact: true }).click();
  await dialog.locator(".error").waitFor();
  expect((await dialog.locator(".error").innerText()).includes("Someone just took it"), "taken");
  await page.keyboard.press("Escape");
  // Something was chosen: it asks first, and "Discard" closes it.
  await dialog.getByRole("button", { name: "Discard" }).click();
  await page.waitForTimeout(200);
  expect(await page.locator("dialog[open]").count() === 0, "closed after Discard");
  // Tom's booking is not his to change.
  await page.locator(".block", { hasText: "Quarterly numbers" }).click();
  expect(await page.locator("dialog[open]").getByRole("button", { name: "Cancel booking" }).count() === 0, "no cancel for others");
  await page.keyboard.press("Escape");
});

await step("drag on the grid to choose a slot; the form opens with it", async () => {
  const lane = page.locator(".lane").nth(1);
  await page.evaluate(() => window.scrollBy(0, 500));
  const box = await lane.boundingBox();
  const slots = await page.evaluate(() => getComputedStyle(document.querySelector(".room-grid")).getPropertyValue("--rows"));
  const per = box.height / Number(slots);
  // 07:00 is the top: 16:00 is 36 quarters down; drag one hour.
  await page.mouse.move(box.x + 20, box.y + per * 36 + 3);
  await page.mouse.down();
  await page.mouse.move(box.x + 20, box.y + per * 38 + 3, { steps: 4 });
  await page.mouse.move(box.x + 20, box.y + per * 39 + 3, { steps: 4 });
  await page.mouse.up();
  const dialog = page.locator("dialog[open]");
  await dialog.waitFor();
  expect(await field(dialog, "From").inputValue() === "960", "from 16:00");
  expect(await field(dialog, "To").inputValue() === "1020", "to 17:00");
  await dialog.getByRole("button", { name: "Book", exact: true }).click();
  await page.waitForSelector(".ck-toast");
});

await step("the organiser cancels, then undoes it", async () => {
  await as(context, origin, "hugo");
  await page.goto(origin + `/chest/rooms?day=${friday}`);
  await page.locator(".block", { hasText: "Quarterly numbers" }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Cancel booking" }).click();
  await page.waitForSelector(".ck-toast");
  await page.waitForTimeout(800);
  expect(await page.locator(".block", { hasText: "Quarterly numbers" }).count() === 0, "gone");
  // The French word for Undo is no longer the word for Cancel: in English here, the button says Undo.
  expect((await page.locator(".ck-toast-undo").last().innerText()).trim() === "Undo", "the toast's button says Undo");
  await page.locator(".ck-toast-undo").last().click();
  await page.waitForTimeout(1500);
  expect((await toastText()) === "Undone.", "the toast says it was undone: " + (await toastText()));
  await page.reload();
  expect(await page.locator(".block", { hasText: "Quarterly numbers" }).count() === 1, "back");
});

await step("changing a booking to a day already gone is refused as typed; the booking keeps its day", async () => {
  // Kit 0.2.4: a day before `min` stays as typed, says why, and nothing is
  // sent — never the day the form held before (the bug class where
  // Timesheets saved "today" in place of refusing).
  await page.goto(origin + `/chest/rooms?day=${friday}`);
  await page.locator(".block", { hasText: "Quarterly numbers" }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByRole("button", { name: "Change", exact: true }).click();
  const day = dialog.locator("#booking-day");
  await day.waitFor();
  const held = await day.inputValue();
  await day.fill("1/1/2020");
  await day.press("Tab");
  const box = dialog.locator(".ck-date", { has: page.locator("#booking-day") });
  await box.locator(".ck-error", { hasText: /^Choose .* or later\.$/u }).waitFor();
  expect(await day.getAttribute("aria-invalid") === "true", "the field says it is refused");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  // Even a submit forced past the browser's own check stops: the form
  // refuses while the day is refused, and puts the focus back on it.
  await dialog.locator("form").evaluate(form => { form.noValidate = true; form.requestSubmit(); });
  await page.waitForTimeout(1000);
  expect(await page.locator(".ck-toast").count() === 0, "nothing saved, no toast");
  expect(await page.locator("dialog[open]").count() === 1, "the form stays open");
  expect(await day.inputValue() === "1/1/2020", "the text stays as typed");
  expect(await page.evaluate(() => document.activeElement?.id) === "booking-day", "focus back on the day");
  // Corrected and saved in one move (kit 0.2.5): the click is not lost.
  await day.fill(held);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForSelector(".ck-toast");
  await page.goto(origin + `/chest/rooms?day=${friday}`);
  expect(await page.locator(".block", { hasText: "Quarterly numbers" }).count() === 1, "still on its day");
});

await step("a weekly booking: several occurrences at once", async () => {
  await page.goto(origin + `/chest/rooms?day=${thursday}`);
  await page.getByRole("button", { name: "Book a room" }).click();
  const dialog = page.locator("dialog[open]");
  await field(dialog, "Room").selectOption({ label: "Bora · 4 seats" });
  await field(dialog, "From").selectOption({ label: "17:00" });
  await field(dialog, "To").selectOption({ label: "17:30" });
  await dialog.getByLabel(/Every week on/u).check();
  await dialog.getByLabel("For how many weeks").fill("3");
  await dialog.getByRole("button", { name: "Book", exact: true }).click();
  await page.waitForSelector(".ck-toast");
  expect((await toastText()).startsWith("Bora booked for 3 weeks"), await toastText());
});

await step("where is Léa? search a person", async () => {
  await page.goto(origin + "/chest/people");
  await page.getByPlaceholder("Find someone").fill("lea");
  await page.keyboard.press("Enter");
  await page.waitForURL(/q=lea/u);
  const text = await page.locator("main").innerText();
  expect(text.includes("Léa Dubois"), "found");
  expect(await page.locator(".mini-week").count() === 1, "her coming days");
});

await step("a member has no Places; an admin adds desks, saves the rules, exports", async () => {
  expect(await page.getByRole("link", { name: "Places" }).count() === 0, "no Places tab");
  await as(context, origin, "camille");
  await page.goto(origin + "/chest/places");
  expect((await page.locator("h1").innerText()) === "Lieux", "French admin");
  // The sample's floors and areas are keys: Camille reads them in French.
  const text = await page.locator("main").innerText();
  expect(text.includes("Rez-de-chaussée") && text.includes("Zone calme") && !text.includes("Quiet zone"), "seeded names in French");
  const area = page.locator(".area-admin", { hasText: "Zone calme" });
  const before = await area.locator(".tile").count();
  await area.getByRole("button", { name: "Ajouter des postes" }).click();
  await page.waitForTimeout(1500);
  expect(await page.locator(".area-admin", { hasText: "Zone calme" }).locator(".tile").count() === before + 4, "4 desks added");
  const names = await page.locator(".area-admin", { hasText: "Zone calme" }).locator(".tile-name").allInnerTexts();
  expect(names.slice(-4).join(",") === "D-13,D-14,D-15,D-16", "new desks come last: " + names.join(","));
  await page.goto(origin + "/chest/places/rules");
  await page.getByLabel("Combien de jours à l’avance on peut réserver").fill("21");
  await page.getByRole("button", { name: "Enregistrer les règles" }).click();
  await page.waitForSelector(".ck-toast");
  await page.reload();
  expect(await page.getByLabel("Combien de jours à l’avance on peut réserver").inputValue() === "21", "rule saved");
  const csv = await (await page.request.get(origin + `/chest/export?kind=bookings&from=${iso(monday)}&to=${friday}`)).text();
  expect(csv.includes("Réservé par") && csv.includes("Quarterly numbers"), "csv: " + csv.slice(0, 200));
});

await step("someone without a role sees why", async () => {
  await as(context, origin, "nora");
  await page.goto(origin + "/chest");
  expect((await page.locator("main").innerText()).includes("pas encore utiliser"), "no access (French)");
});

await step("phone width, in French: free slots per room; one tap opens the form", async () => {
  await as(context, origin, "ines");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + `/chest/rooms?day=${friday}`);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width <= 392, "no sideways scroll: " + width);
  await page.locator(".room-card", { hasText: "Atlas" }).locator(".slot-chip").first().click();
  const dialog = page.locator("dialog[open]");
  await dialog.waitFor();
  await dialog.getByRole("button", { name: "Réserver", exact: true }).click();
  await page.waitForSelector(".ck-toast");
  expect((await toastText()).startsWith("Atlas réservée"), await toastText());
  await page.goto(origin + "/chest");
  const w2 = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(w2 <= 392, "week fits: " + w2);
});


await step("phone: a tap on a free stretch starts at 09:00 like “Find a free room”, not at 07:00; the equipment chips wrap, none cut", async () => {
  await as(context, origin, "hugo");
  await context.addCookies([{ name: "dev_locale", value: "en", url: origin }]);
  for (const width of [390, 461]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(origin + `/chest/rooms?day=${friday}`);
    const right = await page.locator(".finder .chip").evaluateAll(els => els.map(e => e.getBoundingClientRect().right));
    expect(right.length >= 3 && right.every(r => r <= width - 8), `every chip inside ${width} px: ` + right.map(Math.round).join(","));
  }
  const chip = page.locator(".room-card", { hasText: "Bora" }).locator(".slot-chip").first();
  expect((await chip.innerText()).startsWith("07:00"), "a stretch from 07:00: " + (await chip.innerText()));
  await chip.click();
  const dialog = page.locator("dialog[open]");
  await dialog.waitFor();
  expect(await field(dialog, "From").inputValue() === "540" && await field(dialog, "To").inputValue() === "600", "09:00–10:00, not 07:00: " + await field(dialog, "From").inputValue());
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  // "Find a free room" at 14:00: a tap on a stretch holding 14:00 starts there.
  await field(page.locator(".finder"), "At").selectOption({ label: "14:00" });
  await page.locator(".room-card", { hasText: "Bora" }).locator(".slot-chip").first().click();
  await dialog.waitFor();
  expect(await field(dialog, "From").inputValue() === "840", "the time the finder asks for: " + await field(dialog, "From").inputValue());
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1280, height: 860 });
});

await step("keyboard: “Go to the desks” comes before the day strip and the filters; the next Tab is a desk", async () => {
  await page.goto(origin + `/chest/desks?day=${friday}`);
  let stops = 0;
  let desk = false;
  for (; stops < 12; stops++) {
    await page.keyboard.press("Tab");
    const text = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
    if (text === "Go to the desks") {
      await page.keyboard.press("Enter");
      await page.keyboard.press("Tab");
      desk = await page.evaluate(() => Boolean(document.activeElement?.closest(".tile")));
      break;
    }
  }
  expect(desk && stops < 10, `the skip link at stop ${stops + 1}, then a desk: ${desk}`);
  // Back to each member's own language for the steps that follow.
  await context.clearCookies({ name: "dev_locale" });
});

await step("keyboard: the day strip is one Tab stop (kit 0.2.6) — the next Tab leaves it; the arrows move along it", async () => {
  await page.goto(origin + `/chest/desks?day=${friday}`);
  await page.locator(".ck-skip", { hasText: "Go to the desks" }).focus();
  await page.keyboard.press("Tab");
  const first = await page.evaluate(() => ({ inStrip: Boolean(document.activeElement?.closest(".ck-daystrip nav")), label: (document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent || "").trim() }));
  expect(first.inStrip, "the strip is the stop after the skip link: " + first.label);
  await page.keyboard.press("Tab");
  const next = await page.evaluate(() => Boolean(document.activeElement?.closest(".ck-daystrip nav")));
  expect(!next, "one Tab leaves the strip (it was one stop per day before 0.2.6)");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("ArrowRight");
  const moved = await page.evaluate(() => (document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent || "").trim());
  expect(moved !== first.label, `the arrow moves to the next day: ${first.label} → ${moved}`);
});

await step("a day beyond the booking window: desks shown as not open yet, with the day it opens", async () => {
  await as(context, origin, "hugo");
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto(origin + `/chest/desks?day=${far}`);
  const hint = await page.locator(".hint.is-locked").innerText();
  expect(/opens on/u.test(hint), "hint: " + hint);
  expect(await page.getByRole("button", { name: /free\. Book it/u }).count() === 0, "no bookable desk");
  expect(await page.locator(".tile.is-locked").count() > 0, "locked tiles");
  await page.goto(origin + `/chest/rooms?day=${far}`);
  expect(await page.getByRole("button", { name: "Book a room" }).isDisabled(), "no room booking");
});

await step("find a free room: 6 people at 14:00 for an hour; one tap opens the form with that slot", async () => {
  await page.goto(origin + `/chest/rooms?day=${thursday}`);
  const finder = page.locator(".finder");
  await field(finder, "People").selectOption({ label: "6 or more" });
  await field(finder, "At").selectOption({ label: "14:00" });
  await field(finder, "For").selectOption({ label: "1 h" });
  const text = await finder.innerText();
  expect(/too small/u.test(text), "says what is too small: " + text);
  const chips = await finder.locator(".room-chip").allInnerTexts();
  expect(chips.length >= 1 && chips.every(c => !/Cabin|Bora/u.test(c)), "only big enough rooms: " + chips.join(" | "));
  await finder.locator(".room-chip").first().click();
  const dialog = page.locator("dialog[open]");
  await dialog.waitFor();
  expect(await field(dialog, "From").inputValue() === "840" && await field(dialog, "To").inputValue() === "900", "14:00–15:00");
  // Moving the start keeps the hour.
  await field(dialog, "From").selectOption({ label: "16:00" });
  expect(await field(dialog, "To").inputValue() === "1020", "to 17:00 after moving the start");
  // A tap outside keeps what was typed.
  await dialog.getByLabel("What for (optional)").fill("Kick-off");
  await page.mouse.click(5, 5);
  await page.waitForTimeout(300);
  expect(await page.locator("dialog[open]").count() === 1, "still open after a tap outside");
  expect(await page.locator("dialog[open]").getByText("Discard your changes?").count() === 1, "asks before losing what was typed");
  await page.locator("dialog[open]").getByRole("button", { name: "Keep editing" }).click();
  expect(await page.locator("dialog[open]").getByLabel("What for (optional)").inputValue() === "Kick-off", "what was typed is kept");
});

await step("a booking goes into the organiser's and the guest's calendars, and downloads as .ics", async () => {
  await page.goto(origin + `/chest/rooms?day=${thursday}`);
  await page.getByRole("button", { name: "Book a room" }).click();
  const dialog = page.locator("dialog[open]");
  await field(dialog, "Room").selectOption({ label: "Atlas · 8 seats" });
  await field(dialog, "From").selectOption({ label: "18:00" });
  await field(dialog, "To").selectOption({ label: "19:00" });
  await dialog.getByLabel("What for (optional)").fill("Calendar check");
  await dialog.getByRole("combobox", { name: "Invite people (optional)" }).fill("léa");
  await dialog.getByRole("option", { name: /Léa/u }).click();
  await dialog.getByRole("button", { name: "Book", exact: true }).click();
  await page.waitForSelector(".ck-toast");
  await page.waitForTimeout(800);
  await page.locator(".block", { hasText: "Calendar check" }).click();
  const link = page.locator("dialog[open]").getByRole("link", { name: "Add to my calendar" });
  const ics = await (await page.request.get(origin + await link.getAttribute("href"))).text();
  expect(ics.startsWith("BEGIN:VCALENDAR") && ics.includes("SUMMARY:Calendar check"), "ics: " + ics.slice(0, 80));
  await page.keyboard.press("Escape");
  const dev = await (await page.request.get(origin + "/_dev")).text();
  const feed = /href="(https?:\/\/(?:localhost|127\.0\.0\.1):\d+\/_chest\/calendar\/[^"]+\.ics)"/u.exec(dev)?.[1];
  expect(feed, "Hugo's feed address");
  const hugoFeed = await (await page.request.get(feed)).text();
  expect(hugoFeed.includes("SUMMARY:Calendar check"), "in Hugo's feed");
  // Léa hears it in her bell: one notice, its French beside it; Rooms mails no member.
  expect(/invited you: Calendar check<br>.*?<small lang="fr">fr: Hugo Bernard vous invite\u202f: Calendar check/su.test(dev), "Léa's bell, English and French");
  expect(!dev.includes("Mail to people outside") || !/<b>[^<]*Calendar check[^<]*<\/b>/u.test(dev.slice(dev.indexOf("Mail to people outside"))), "no email to a member");
});

await step("a meeting with four guests: each guest finds it in their bell; none gets an email from Rooms", async () => {
  await as(context, origin, "hugo");
  await page.goto(origin + `/chest/rooms?day=${friday}`);
  await page.getByRole("button", { name: "Book a room" }).click();
  const dialog = page.locator("dialog[open]");
  await field(dialog, "Room").selectOption({ label: "Atlas · 8 seats" });
  await field(dialog, "From").selectOption({ label: "18:00" });
  await field(dialog, "To").selectOption({ label: "19:00" });
  await dialog.getByLabel("What for (optional)").fill("Four guests");
  for (const name of ["Inès", "Léa", "Sofia", "Tom"]) {
    await dialog.getByRole("combobox", { name: "Invite people (optional)" }).fill(name.slice(0, 3).toLowerCase());
    await dialog.getByRole("option", { name: new RegExp(name, "u") }).click();
  }
  await dialog.getByRole("button", { name: "Book", exact: true }).click();
  await page.waitForSelector(".ck-toast");
  await page.waitForTimeout(800);
  const dev = await (await page.request.get(origin + "/_dev")).text();
  const told = [...dev.matchAll(/<li><b>([^<]+)<\/b> · Hugo Bernard invited you: Four guests/gu)].map(m => m[1].trim());
  expect(told.length === 4 && new Set(told).size === 4, "four bell items, one per guest: " + told.join(" | "));
  const outbox = dev.includes("Mail to people outside") ? dev.slice(dev.indexOf("Mail to people outside")) : "";
  expect(!outbox.includes("Four guests"), "no email to the guests");
});

await step("my usual week: say it once; coming days are filled; a tap outside the form keeps it", async () => {
  await as(context, origin, "hugo");
  await page.goto(origin + "/chest");
  await page.getByRole("button", { name: "My usual week" }).click();
  const dialog = page.locator("dialog[open]");
  // The kit's Segmented (0.2.1+): the radio is hidden, its word is what one taps.
  const choose = async (day, name) => {
    const group = dialog.getByRole("group", { name: day });
    const radio = group.getByRole("radio", { name });
    await group.locator("label").filter({ has: page.getByRole("radio", { name }) }).click();
    expect(await radio.isChecked(), `${day}: ${name} chosen`);
  };
  for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday"]) await choose(day, "Office");
  await choose("Friday", "Remote");
  await page.mouse.click(5, 5);
  expect(await page.locator("dialog[open]").count() === 1, "kept open");
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await page.waitForSelector(".ck-toast");
  expect(/Usual week saved/u.test(await toastText()), await toastText());
  await page.reload();
  expect(/Usually at the office: Monday, Tuesday, Wednesday, Thursday/u.test(await page.locator(".usual-bar").innerText()), "summary");
});

await step("keyboard: one Tab stop per day, the arrows move between Office, Remote and Off", async () => {
  await page.goto(origin + "/chest");
  const group = page.locator("#day-" + friday + " .choice-row");
  await group.getByRole("radio").first().focus();
  const stops = await group.locator("[tabindex='0']").count();
  expect(stops === 1, "one tab stop: " + stops);
  await page.keyboard.press("ArrowRight");
  const focused = await page.evaluate(() => document.activeElement?.textContent);
  expect(/Remote|Off|Office/u.test(focused ?? ""), "arrow moved focus: " + focused);
});

await step("who's where by team: Sales shows only its people", async () => {
  await page.goto(origin + "/chest/people");
  await page.getByRole("navigation", { name: "Teams" }).getByRole("link", { name: /^Sales/u }).click();
  await page.waitForURL(/team=/u);
  const text = await page.locator("main").innerText();
  expect(text.includes("Inès Moreau") && text.includes("Hugo Bernard") && !text.includes("Tom Walker"), "only Sales");
});

await step("an admin moves in: rooms from Google Workspace's CSV; the office's week by day", async () => {
  await as(context, origin, "camille");
  await page.goto(origin + "/chest/places");
  const csv = "Resource ID,Calendar Resource Name,Resource Email,Type,Category,Capacity,Building ID,Floor Name,Floor Section,Internal Description,User Visible Description\r\n1,Everest,c_1@resource.calendar.google.com,Meeting room,CONFERENCE_ROOM,12,paris,Second floor,,,TV and Google Meet\r\n2,Projector,c_2@resource.calendar.google.com,Equipment,OTHER,,paris,,,,\r\n";
  await page.locator("input[type=file]").first().setInputFiles({ name: "resources.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.locator(".import-report").waitFor();
  const report = await page.locator(".import-report").innerText();
  expect(/1 salle ajoutée/u.test(report) && /Ligne 3/u.test(report), "report: " + report);
  await page.goto(origin + "/chest/places/export");
  expect(await page.locator("table.load tbody tr").count() >= 5, "a row per working day");
  // Averaged only since the first day someone came, and French plurals.
  const load = await page.locator("#load-title").locator("..").innerText();
  expect(/Moyenne depuis le/u.test(load), "since when: " + load);
  expect(!/0,5 personnes|1,5 personnes/u.test(load), "French plural below 2: " + load);
  expect(/[1-9][0-9]*(,[0-9])? personnes?/u.test(load), "people counted this week: " + load);
});

await step("an admin brings a room calendar's .ics: preview with conflicts line by line, weekly kept weekly, import, Undo", async () => {
  await as(context, origin, "camille");
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto(origin + "/chest/places");
  const stamp = (d, t) => d.replaceAll("-", "") + "T" + t + "00";
  const wednesday = iso(new Date(monday.getTime() + 9 * 864e5));
  // Bora is Hugo's every Thursday 17:00–17:30 for three weeks (step above):
  // a weekly 17:00–18:00 from that Thursday meets it three times.
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "X-WR-CALNAME:Paris-0-Bora (4)",
    "BEGIN:VEVENT", `DTSTART;TZID=Europe/Paris:${stamp(thursday, "1700")}`, `DTEND;TZID=Europe/Paris:${stamp(thursday, "1800")}`, "RRULE:FREQ=WEEKLY;COUNT=5", "UID:weekly-bora", "SUMMARY:Design review", "ORGANIZER;CN=Tom Walker:mailto:tom@example.com", "END:VEVENT",
    "BEGIN:VEVENT", `DTSTART;TZID=Europe/Paris:${stamp(wednesday, "1000")}`, `DTEND;TZID=Europe/Paris:${stamp(wednesday, "1100")}`, "UID:once-bora", "SUMMARY:Supplier call", "END:VEVENT",
    "BEGIN:VEVENT", `DTSTART;VALUE=DATE:${wednesday.replaceAll("-", "")}`, "UID:allday-bora", "SUMMARY:Painting", "END:VEVENT",
    "END:VCALENDAR"].join("\r\n");
  const panel = page.locator("section", { has: page.locator("#calendar-title") });
  await panel.locator("input[type=file]").setInputFiles({ name: "Paris-0-Bora (4).ics", mimeType: "text/calendar", buffer: Buffer.from(ics) });
  const report = panel.locator(".import-report");
  await report.waitFor();
  expect((await panel.getByLabel("Dans la salle").locator("option:checked").innerText()) === "Bora", "the room guessed from the calendar's name");
  const text = await report.innerText();
  expect(/3 réservations à ajouter à Bora/u.test(text), "preview: " + text);
  expect(/Ligne 4 · Design review · chaque jeudi/u.test(text) && /\(2 semaines\)/u.test(text), "weekly kept weekly: " + text);
  expect(/sauf le/u.test(text), "the Thursdays taken in Rooms, said: " + text);
  expect(/Painting.*toute la journée/u.test(text), "the all-day event, left out with its line: " + text);
  await report.getByRole("button", { name: "Importer 3 réservations" }).click();
  await page.waitForSelector(".ck-toast >> text=3 réservations importées dans Bora.");
  // Undo takes the whole import back.
  await page.locator(".ck-toast", { hasText: "importées" }).getByRole("button", { name: "Annuler l’action" }).click();
  await page.waitForSelector(".ck-toast >> text=Action annulée.");
  await page.goto(origin + `/chest/rooms?day=${wednesday}`);
  expect(await page.locator(".block", { hasText: "Supplier call" }).count() === 0, "gone after Undo");
  // Imported again, for good.
  await page.goto(origin + "/chest/places");
  await panel.locator("input[type=file]").setInputFiles({ name: "Paris-0-Bora (4).ics", mimeType: "text/calendar", buffer: Buffer.from(ics) });
  await report.getByRole("button", { name: "Importer 3 réservations" }).click();
  await page.waitForSelector(".ck-toast >> text=3 réservations importées dans Bora.");
  await page.goto(origin + `/chest/rooms?day=${wednesday}`);
  expect(await page.locator(".block", { hasText: "Supplier call" }).count() === 1, "on the grid");
  await page.goto(origin + "/chest/places");
  await panel.locator("input[type=file]").setInputFiles({ name: "Paris-0-Bora (4).ics", mimeType: "text/calendar", buffer: Buffer.from(ics) });
  await report.waitFor();
  expect(/Rien de nouveau/u.test(await report.innerText()), "the same file again adds nothing");
  await report.getByRole("button", { name: "Annuler", exact: true }).click();
  expect(await report.count() === 0, "Cancel closes the preview");
});

await step("an admin books a room: room and time first, the day in a date field, 09:00 on a coming day; for someone else is a link", async () => {
  await as(context, origin, "camille");
  await context.addCookies([{ name: "dev_locale", value: "en", url: origin }]);
  await page.goto(origin + `/chest/rooms?day=${far}`);
  await page.getByRole("button", { name: "Book a room" }).click();
  const dialog = page.locator("dialog[open]");
  const all = await dialog.innerText();
  const at = w => all.indexOf(w);
  expect(at("Room") >= 0 && at("Room") < at("Day") && at("Day") < at("From") && at("From") < at("Book it for someone else"), "room and time first: " + all.slice(0, 200));
  expect(!/\bFor\b\s*\n/u.test(all.slice(0, at("Book it for someone else"))), "no people picker before the booking");
  expect(await dialog.getByLabel("Day").count() > 0, "a date field");
  expect(await dialog.locator("select").filter({ hasText: /October|November/u }).count() === 0, "no long list of days");
  expect(await field(dialog, "From").inputValue() === "540", "09:00 on a coming day");
  await dialog.getByRole("button", { name: "Book it for someone else" }).click();
  expect(await dialog.getByRole("combobox", { name: "For" }).count() === 1, "the picker, when asked");
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: "Discard" }).click().catch(() => {});
});

await step("an Outlook export: “Martin, Camille” and a bare address find the people; the preview says how many bookings stay in the admin's name", async () => {
  await as(context, origin, "camille");
  await context.addCookies([{ name: "dev_locale", value: "en", url: origin }]);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto(origin + "/chest/places");
  const stamp = (d, t) => d.replaceAll("-", "") + "T" + t + "00";
  const nextFriday = iso(new Date(monday.getTime() + 11 * 864e5));
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:Microsoft Exchange Server 2010", "X-WR-CALNAME:Cabin",
    "BEGIN:VEVENT", `DTSTART;TZID=Romance Standard Time:${stamp(nextFriday, "0800")}`, `DTEND;TZID=Romance Standard Time:${stamp(nextFriday, "0830")}`, "UID:ex-1", "SUMMARY:Board prep",
    'ORGANIZER;CN="Martin, Camille":mailto:camille.martin@atelier.example', 'ATTENDEE;CN="Rossi, Sofia (Office)":mailto:s.rossi@atelier.example', "ATTENDEE:mailto:hugo@example.test", "END:VEVENT",
    "BEGIN:VEVENT", `DTSTART;TZID=Romance Standard Time:${stamp(nextFriday, "0900")}`, `DTEND;TZID=Romance Standard Time:${stamp(nextFriday, "0930")}`, "UID:ex-2", "SUMMARY:Supplier",
    "ORGANIZER:mailto:ines@example.test", "END:VEVENT",
    "BEGIN:VEVENT", `DTSTART;TZID=Romance Standard Time:${stamp(nextFriday, "1000")}`, `DTEND;TZID=Romance Standard Time:${stamp(nextFriday, "1030")}`, "UID:ex-3", "SUMMARY:Auditor",
    'ORGANIZER;CN="Durand, Paul":mailto:paul@auditor.example', "END:VEVENT",
    "END:VCALENDAR"].join("\r\n");
  const panel = page.locator("section", { has: page.locator("#calendar-title") });
  await panel.locator("input[type=file]").setInputFiles({ name: "Cabin.ics", mimeType: "text/calendar", buffer: Buffer.from(ics) });
  const report = panel.locator(".import-report");
  await report.waitFor();
  const text = await report.innerText();
  expect(/3 bookings to add to Cabin/u.test(text), "preview: " + text);
  expect(/1 of them will be in your name: its organiser is not found in Rooms\./u.test(text), "the count before import: " + text);
  expect(/Auditor.*in your name: Durand, Paul/u.test(text), "the line says whom: " + text);
  expect(!/Board prep[^\n]*in your name/u.test(text) && !/Supplier[^\n]*in your name/u.test(text), "“Martin, Camille” and ines@ matched: " + text);
  await report.getByRole("button", { name: "Import 3 bookings" }).click();
  await page.waitForSelector(".ck-toast >> text=3 bookings imported into Cabin.");
  await page.goto(origin + `/chest/rooms?day=${nextFriday}`);
  await page.locator(".block", { hasText: "Supplier" }).click();
  expect((await page.locator("dialog[open]").innerText()).includes("Inès Moreau"), "Inès organises it (matched by address)");
  await page.keyboard.press("Escape");
});

await step("visitors: Hugo announces his visitor, nobody else but the reception sees it; the office manager marks the arrival and Hugo hears it", async () => {
  await as(context, origin, "hugo");
  await context.addCookies([{ name: "dev_locale", value: "en", url: origin }]);
  await page.goto(origin + "/chest/visitors");
  expect((await page.locator("main").innerText()).includes("Nicolas Girard"), "his visitor of the sample");
  await page.getByRole("button", { name: "Announce a visitor" }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByLabel("Their name").fill("Paul Durand");
  await dialog.getByLabel("Company (optional)").fill("Client SA");
  expect(await dialog.getByRole("combobox", { name: "Coming to see" }).count() === 0, "a member is the host: no picker");
  // The visitor is outside the company: an invitation by email, replies to the company's address.
  expect((await dialog.innerText()).includes("Their replies go to "), "where replies land, said on the form");
  // An address the browser takes but mail does not (no dot in the domain):
  // the package's field.email refuses it in plain words, nothing is announced.
  await dialog.getByLabel("Their email (optional)").fill("paul.durand@client");
  await dialog.getByRole("button", { name: "Announce", exact: true }).click();
  await page.getByText("This email address does not look right.").first().waitFor();
  expect(await page.locator(".visit-row", { hasText: "Paul Durand" }).count() === 0, "nothing announced with a wrong address");
  await dialog.getByLabel("Their email (optional)").fill("paul.durand@client.example");
  await dialog.getByRole("button", { name: "Announce", exact: true }).click();
  await page.waitForSelector(".ck-toast >> text=Visit of Paul Durand announced");
  expect((await page.locator(".ck-toast").innerText()).includes("Invitation sent."), "the toast says the invitation went");
  expect(await page.locator(".visit-row", { hasText: "Paul Durand" }).count() === 1, "listed");
  expect((await page.locator(".visit-row", { hasText: "Paul Durand" }).innerText()).includes("invitation sent"), "the row says it");
  const sent = await (await page.request.get(origin + "/_dev")).text();
  const outbox = sent.slice(sent.indexOf("Mail to people outside"));
  expect(/<b>Your visit to [^<]+<\/b>.*?→ paul\.durand@client\.example<br>replies to <code>[^<]+@[^<]+<\/code>/su.test(outbox), "one invitation to the visitor, replies to the company: " + outbox.slice(0, 400));
  expect(!/→ [a-z]+@example\.test/u.test(outbox), "no member in the outbox");
  await as(context, origin, "lea");
  await page.goto(origin + "/chest/visitors");
  const lea = await page.locator("main").innerText();
  expect(!lea.includes("Paul Durand") && !lea.includes("Nicolas Girard"), "another member sees no one else's visitors");
  // Sofia is the office manager: every visitor, no Places.
  await as(context, origin, "sofia");
  await page.goto(origin + "/chest/visitors");
  expect(await page.getByRole("link", { name: "Places" }).count() === 0, "no Places for the office manager");
  const all = await page.locator("main").innerText();
  expect(all.includes("Paul Durand") && all.includes("Emma Schmitt") && all.includes("Nicolas Girard"), "the reception sees everyone's: " + all.slice(0, 300));
  await page.locator(".visit-row", { hasText: "Paul Durand" }).getByRole("button", { name: "Mark arrived" }).click();
  await page.waitForSelector(".ck-toast >> text=Paul Durand is here: message sent to Hugo Bernard.");
  await page.waitForTimeout(600);
  expect(/Here since \d\d:\d\d/iu.test(await page.locator(".visit-row", { hasText: "Paul Durand" }).innerText()), "marked");
  const dev = await (await page.request.get(origin + "/_dev")).text();
  expect(dev.includes("Paul Durand (Client SA) is here to see you"), "Hugo told in the bell");
  // The office manager books for someone else, like an admin.
  await page.goto(origin + `/chest/rooms?day=${thursday}`);
  await page.getByRole("button", { name: "Book a room" }).click();
  expect(await page.locator("dialog[open]").getByRole("button", { name: "Book it for someone else" }).count() === 1, "book for someone else");
  await page.keyboard.press("Escape");
});

await step("visitors and mail: a cancelled visit tells the visitor, its Undo invites them again; on a Chest that cannot send, the form says so and the visit stands", async () => {
  await as(context, origin, "hugo");
  await context.addCookies([{ name: "dev_locale", value: "en", url: origin }]);
  await page.goto(origin + "/chest/visitors");
  const outbox = async () => { const dev = await (await page.request.get(origin + "/_dev")).text(); return dev.slice(dev.indexOf("Mail to people outside")); };
  await page.getByRole("button", { name: "Announce a visitor" }).click();
  const form = page.locator("dialog[open]");
  await form.getByLabel("Their name").fill("Clara Petit");
  await form.getByLabel("Their email (optional)").fill("clara@client.example");
  await form.getByRole("button", { name: "Announce", exact: true }).click();
  await page.waitForSelector(".ck-toast >> text=Visit of Clara Petit announced");
  await page.waitForTimeout(600);
  const row = page.locator(".visit-row", { hasText: "Clara Petit" });
  await row.getByRole("button", { name: "Cancel the visit" }).click();
  await page.waitForSelector(".ck-toast >> text=Visit of Clara Petit cancelled. They get an email saying so.");
  await page.waitForTimeout(800);
  expect(/<b>Cancelled: your visit to [^<]+<\/b>.*?→ clara@client\.example/su.test(await outbox()), "the cancellation went to the visitor");
  await page.locator(".ck-toast", { hasText: "Clara Petit cancelled" }).getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(1200);
  const after = await outbox();
  expect((after.match(/<b>Your visit to [^<]+<\/b>(?:(?!<li>).)*?→ clara@client\.example/gsu) ?? []).length === 2, "invited again after the Undo");
  expect(await page.locator(".visit-row", { hasText: "Clara Petit" }).count() === 1, "back in the list");
  // The owner disconnected the company's mail: the form says so; the visit stands.
  await page.request.post(origin + "/_dev/delivery", { form: { mail: "not_connected" }, maxRedirects: 0 });
  try {
    await page.goto(origin + "/chest/visitors");
    await page.getByRole("button", { name: "Announce a visitor" }).click();
    const dialog = page.locator("dialog[open]");
    expect((await dialog.innerText()).includes("This Chest cannot send emails right now: tell them the time and the address yourself."), "said on the form");
    expect(await dialog.getByLabel("Their email (optional)").count() === 0, "no address asked");
    await dialog.getByLabel("Their name").fill("Alice Martin");
    await dialog.getByRole("button", { name: "Announce", exact: true }).click();
    await page.waitForSelector(".ck-toast >> text=Visit of Alice Martin announced");
    expect(!(await page.locator(".ck-toast").innerText()).includes("Invitation"), "no invitation promised");
    expect(await page.locator(".visit-row", { hasText: "Alice Martin" }).count() === 1, "the visit stands");
  } finally {
    await page.request.post(origin + "/_dev/delivery", { form: { mail: "ready" }, maxRedirects: 0 });
  }
});

await step("a desk's holder comes back on a day it was lent: whoever borrowed it hears it, and the holder is told they know", async () => {
  const nextWednesday = iso(new Date(monday.getTime() + 9 * 864e5));
  await as(context, origin, "sofia");
  await page.goto(origin + "/chest");
  await page.locator("#day-" + nextWednesday).getByRole("radio", { name: "Remote" }).click();
  await page.waitForTimeout(1200);
  await as(context, origin, "ines");
  await page.goto(origin + `/chest/desks?day=${nextWednesday}`);
  await page.getByRole("button", { name: /^D-12, Sofia Rossi’s desk, free that day\. Book it\./u }).click();
  await page.waitForSelector(".ck-toast");
  await as(context, origin, "sofia");
  await page.goto(origin + "/chest");
  await page.locator("#day-" + nextWednesday).getByRole("radio", { name: "Office" }).click();
  await page.waitForTimeout(1500);
  await page.reload();
  expect((await page.locator("#day-" + nextWednesday).innerText()).includes("Inès Moreau knows you are coming"), "Sofia: " + (await page.locator("#day-" + nextWednesday).innerText()));
  const dev = await (await page.request.get(origin + "/_dev")).text();
  expect(dev.includes("Sofia Rossi vient au bureau le"), "Inès told, in French");
});

await step("French words: a desk is a « poste » everywhere, the office stays « au bureau »", async () => {
  await as(context, origin, "camille");
  await context.addCookies([{ name: "dev_locale", value: "fr", url: origin }]);
  await page.goto(origin + "/chest");
  const week = await page.locator("main").innerText();
  expect(/Poste D-01/u.test(week) && !/Bureau D-\d/u.test(week), "Poste D-01 on My week");
  expect(await page.getByRole("link", { name: "Postes" }).count() === 1, "the Desks tab reads Postes");
  await page.goto(origin + "/chest/rooms");
  expect((await page.locator("h1").innerText()) === "Salles de réunion", "the title is not the button's words");
  await context.addCookies([{ name: "dev_locale", value: "en", url: origin }]);
});

// Leave shortens a leave by telling leave.cancelled, then leave.approved
// for the days that remain (tools/private/leave/README.md, "With the other
// tools"). Rooms keeps each request's latest word by occurredAt, an
// approval winning at the same moment; delivered in reverse, the remaining
// days stay too (test/away.test.ts, and the next step with /_dev/deliver's
// occurredAt). Here, as the Chest delivers it, through the tool's event
// route.
await step("a leave shortened in Leave: its remaining days stay Off in Sofia's week, the days cut open again", async () => {
  await as(context, origin, "sofia");
  const days = [7, 8, 9, 10].map(n => iso(new Date(monday.getTime() + n * 864e5)));
  const leave = { member: id("sofia"), from: days[0], to: days[3], fromHalf: "day", toHalf: "day", request: "flow-cut-1" };
  const deliver = async (type, data) => {
    const r = await page.request.post(origin + "/_dev/deliver", { form: { type, data: JSON.stringify(data) }, maxRedirects: 0 });
    expect(r.status() === 303, `${type} delivered: ${r.status()}`);
  };
  const off = async () => {
    await page.goto(origin + `/chest?day=${days[0]}`);
    return (await Promise.all(days.map(async d => (await page.locator("#day-" + d).getAttribute("class")) ?? ""))).map(c => c.split(" ").includes("is-off"));
  };
  await deliver("leave.approved", leave);
  expect((await off()).every(Boolean), "four days Off: " + (await off()).join(","));
  await deliver("leave.cancelled", leave);
  await deliver("leave.approved", { ...leave, to: days[1] });
  const after = await off();
  expect(after.join(",") === "true,true,false,false", "Monday and Tuesday still Off, Wednesday and Thursday open: " + after.join(","));
});

await step("told in reverse at the same moment: the approval of the remaining days, then the cancellation — the remaining days stay Off", async () => {
  await as(context, origin, "sofia");
  // Next week's Thursday and Friday: the week the home page shows.
  const days = [10, 11].map(n => iso(new Date(monday.getTime() + n * 864e5)));
  const leave = { member: id("sofia"), from: days[0], to: days[1], fromHalf: "day", toHalf: "day", request: "flow-cut-2" };
  const at = new Date(Date.now() - 60_000).toISOString();
  const deliver = async (type, data, occurredAt) => {
    const r = await page.request.post(origin + "/_dev/deliver", { form: { type, data: JSON.stringify(data), occurredAt }, maxRedirects: 0 });
    expect(r.status() === 303, `${type} delivered: ${r.status()}`);
  };
  await deliver("leave.approved", leave, new Date(Date.now() - 120_000).toISOString());
  await deliver("leave.approved", { ...leave, to: days[0] }, at);
  await deliver("leave.cancelled", leave, at);
  await page.goto(origin + `/chest?day=${days[0]}`);
  const off = (await Promise.all(days.map(async d => (await page.locator("#day-" + d).getAttribute("class")) ?? ""))).map(c => c.split(" ").includes("is-off"));
  expect(off.join(",") === "true,false", "Thursday still Off, Friday open: " + off.join(","));
});

await step("a room kept for Sales, a group that does not give Rooms: Hugo (Sales) may book it, Léa (Tech) may not", async () => {
  await as(context, origin, "camille");
  await context.addCookies([{ name: "dev_locale", value: "en", url: origin }]);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto(origin + "/chest/places");
  await page.locator("li", { has: page.locator("strong", { hasText: /^Bora$/u }) }).getByRole("button", { name: "Change" }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByLabel("Kept for").selectOption({ label: "Sales" });
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForSelector(".ck-toast");
  const bookable = async who => {
    await as(context, origin, who);
    await page.goto(origin + `/chest/rooms?day=${friday}`);
    await page.getByRole("button", { name: "Book a room" }).click();
    const form = page.locator("dialog[open]");
    const option = form.locator("option", { hasText: /^Bora/u });
    expect((await option.innerText()).includes("Sales only"), "the room says whom it is kept for");
    const enabled = await option.evaluate(o => !o.disabled);
    await page.keyboard.press("Escape");
    await form.getByRole("button", { name: "Discard" }).click().catch(() => {});
    return enabled;
  };
  expect(await bookable("hugo"), "Hugo, in Sales, may book it");
  expect(!(await bookable("lea")), "Léa, in Tech, may not");
  await as(context, origin, "camille");
  await page.goto(origin + "/chest/places");
  await page.locator("li", { has: page.locator("strong", { hasText: /^Bora$/u }) }).getByRole("button", { name: "Change" }).click();
  await page.locator("dialog[open]").getByLabel("Kept for").selectOption({ label: "Everyone" });
  await page.locator("dialog[open]").getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForSelector(".ck-toast");
});

await step("a weekly meeting changed from one week on: this one and the next ones move, the weeks before stay", async () => {
  await as(context, origin, "camille");
  await context.addCookies([{ name: "dev_locale", value: "en", url: origin }]);
  await page.setViewportSize({ width: 1440, height: 900 });
  // Next Monday's stand-up (a weekly booking of the sample).
  const nextMonday = iso(new Date(monday.getTime() + 7 * 864e5));
  await page.goto(origin + `/chest/rooms?day=${nextMonday}`);
  await page.locator(".block", { hasText: "Team stand-up" }).first().click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByRole("button", { name: "Change", exact: true }).click();
  await field(dialog, "What for \\(optional\\)").fill("Team stand-up (new time)");
  await dialog.getByRole("button", { name: "Save this and the next ones" }).click();
  await page.waitForSelector(".ck-toast >> text=/bookings? changed/");
  await page.reload();
  expect(await page.locator(".block", { hasText: "Team stand-up (new time)" }).count() === 1, "this week's changed");
  await page.goto(origin + `/chest/rooms?day=${iso(monday)}`);
  expect(await page.locator(".block", { hasText: "Team stand-up (new time)" }).count() === 0, "the week before stays");
});

await step("a phone says to tap, not to drag", async () => {
  await as(context, origin, "tom");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + `/chest/rooms?day=${friday}`);
  expect(await page.locator(".on-phone").isVisible() && !(await page.locator(".on-desktop").isVisible()), "phone hint");
  expect((await page.locator(".on-phone").innerText()).startsWith("Tap"), "tap");
});

await browser.close();
done(problems);
