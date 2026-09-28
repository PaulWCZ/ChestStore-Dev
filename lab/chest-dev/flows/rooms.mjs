// Rooms, as people use it, in a real browser: node lab/chest-dev/flows/rooms.mjs [port]
// (the harness runs the tool with --reset: the sample office and week are there).
import { as, done, expect, open, step } from "./lib.mjs";

const port = Number(process.argv[2] ?? 5000);
const { browser, context, page, origin, problems } = await open(port, "hugo");

// Next week's Friday (Hugo said nothing for it in the sample).
const iso = d => d.toISOString().slice(0, 10);
const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
const monday = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)));
const friday = iso(new Date(monday.getTime() + 11 * 864e5));
const thursday = iso(new Date(monday.getTime() + 10 * 864e5));
const toastText = async () => (await page.locator(".toast").last().innerText()).trim();

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
  await page.waitForSelector(".toast");
  expect((await toastText()).startsWith("Desk D-06 booked"), "toast");
  await page.reload();
  expect(await page.getByRole("button", { name: "D-06, booked by you. Free it." }).count() === 1, "mine after reload");
  await page.goto(origin + "/chest");
  expect((await page.locator("#day-" + friday).innerText()).includes("Desk D-06"), "in my week");
});

await step("tap another desk: I change desks; undo puts me back", async () => {
  await page.goto(origin + `/chest/desks?day=${friday}`);
  await page.getByRole("button", { name: "D-07, free. Book it." }).click();
  await page.waitForSelector(".toast");
  await page.waitForTimeout(800);
  await page.locator(".toast button").last().click();
  await page.waitForTimeout(1500);
  await page.reload();
  expect(await page.getByRole("button", { name: "D-06, booked by you. Free it." }).count() === 1, "back on D-06");
});

await step("saying 'remote' frees the desk, with an undo", async () => {
  await page.goto(origin + "/chest");
  await page.locator("#day-" + friday).getByRole("radio", { name: "Remote" }).click();
  await page.waitForSelector(".toast");
  expect((await toastText()).includes("Desk D-06 freed"), "freed: " + (await toastText()));
  await page.locator(".toast button").last().click();
  await page.waitForTimeout(1800);
  await page.reload();
  expect((await page.locator("#day-" + friday).innerText()).includes("Desk D-06"), "desk back");
});

await step("book a room with a title and a guest; Inès hears it in French", async () => {
  await page.goto(origin + `/chest/rooms?day=${friday}`);
  await page.getByRole("button", { name: "Book a room" }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByLabel("Room").selectOption({ label: "Cabin · 2 seats" });
  await dialog.getByLabel("From").selectOption({ label: "11:00" });
  await dialog.getByLabel("To").selectOption({ label: "12:00" });
  await dialog.getByLabel("What for (optional)").fill("Quarterly numbers");
  await dialog.getByPlaceholder("Find someone").fill("ine");
  await dialog.locator(".suggestion", { hasText: "Inès" }).click();
  await dialog.getByRole("button", { name: "Book", exact: true }).click();
  await page.waitForSelector(".toast");
  expect((await toastText()).startsWith("Cabin booked"), "toast");
  await page.waitForTimeout(800);
  expect(await page.locator(".block", { hasText: "Quarterly numbers" }).count() === 1, "on the grid");
  const dev = await (await page.request.get(origin + "/_dev")).text();
  expect(dev.includes("Hugo Bernard vous invite : Quarterly numbers"), "bell in French");
});

await step("someone else cannot take the same slot: a clear message", async () => {
  await as(context, origin, "tom");
  await page.goto(origin + `/chest/rooms?day=${friday}`);
  await page.getByRole("button", { name: "Book a room" }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByLabel("Room").selectOption({ label: "Cabin · 2 seats" });
  await dialog.getByLabel("From").selectOption({ label: "11:30" });
  await dialog.getByLabel("To").selectOption({ label: "12:30" });
  await dialog.getByRole("button", { name: "Book", exact: true }).click();
  await dialog.locator(".error").waitFor();
  expect((await dialog.locator(".error").innerText()).includes("Someone just took it"), "taken");
  await page.keyboard.press("Escape");
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
  expect(await dialog.getByLabel("From").inputValue() === "960", "from 16:00");
  expect(await dialog.getByLabel("To").inputValue() === "1020", "to 17:00");
  await dialog.getByRole("button", { name: "Book", exact: true }).click();
  await page.waitForSelector(".toast");
});

await step("the organiser cancels, then undoes it", async () => {
  await as(context, origin, "hugo");
  await page.goto(origin + `/chest/rooms?day=${friday}`);
  await page.locator(".block", { hasText: "Quarterly numbers" }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Cancel booking" }).click();
  await page.waitForSelector(".toast");
  await page.waitForTimeout(800);
  expect(await page.locator(".block", { hasText: "Quarterly numbers" }).count() === 0, "gone");
  await page.locator(".toast button").last().click();
  await page.waitForTimeout(1500);
  await page.reload();
  expect(await page.locator(".block", { hasText: "Quarterly numbers" }).count() === 1, "back");
});

await step("a weekly booking: several occurrences at once", async () => {
  await page.goto(origin + `/chest/rooms?day=${thursday}`);
  await page.getByRole("button", { name: "Book a room" }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByLabel("Room").selectOption({ label: "Bora · 4 seats" });
  await dialog.getByLabel("From").selectOption({ label: "17:00" });
  await dialog.getByLabel("To").selectOption({ label: "17:30" });
  await dialog.getByLabel(/Every week on/u).check();
  await dialog.getByLabel("For how many weeks").fill("3");
  await dialog.getByRole("button", { name: "Book", exact: true }).click();
  await page.waitForSelector(".toast");
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
  const area = page.locator(".area-admin", { hasText: "Quiet zone" });
  const before = await area.locator(".tile").count();
  await area.getByRole("button", { name: "Ajouter des bureaux" }).click();
  await page.waitForTimeout(1500);
  expect(await page.locator(".area-admin", { hasText: "Quiet zone" }).locator(".tile").count() === before + 4, "4 desks added");
  await page.goto(origin + "/chest/places/rules");
  await page.getByLabel("Réserver jusqu’à … jours à l’avance").fill("21");
  await page.getByRole("button", { name: "Enregistrer les règles" }).click();
  await page.waitForSelector(".toast");
  await page.reload();
  expect(await page.getByLabel("Réserver jusqu’à … jours à l’avance").inputValue() === "21", "rule saved");
  const csv = await (await page.request.get(origin + `/chest/export?kind=bookings&from=${iso(monday)}&to=${friday}`)).text();
  expect(csv.includes("Réservé par") && csv.includes("Quarterly numbers"), "csv");
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
  await page.waitForSelector(".toast");
  expect((await toastText()).startsWith("Atlas réservée"), await toastText());
  await page.goto(origin + "/chest");
  const w2 = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(w2 <= 392, "week fits: " + w2);
});

await browser.close();
done(problems);
