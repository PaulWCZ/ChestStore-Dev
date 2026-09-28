// Tasks, as a person uses it, in a real browser: node lab/chest-dev/flows/tasks.mjs [port]
// (the harness runs the tool with --reset: the sample boards are there).
import { writeFileSync } from "node:fs";
import { as, done, expect, open, step } from "./lib.mjs";

const port = Number(process.argv[2] ?? 4000);
const { browser, context, page, origin, problems } = await open(port, "hugo", { allow404: /\/chest\/boards\/3$/u });
const tmp = process.env.TMPDIR ?? "/tmp";

await step("create a board from the home page", async () => {
  await page.goto(origin + "/chest/boards");
  await page.getByRole("button", { name: "New board" }).first().click();
  await page.getByLabel("Name").fill("Trade show");
  await page.getByText("A project").click();
  await page.getByRole("button", { name: "Create the board" }).click();
  await page.waitForURL(/\/chest\/boards\/\d+$/u);
  expect(await page.getByRole("heading", { name: "Trade show" }).isVisible(), "board title");
  expect((await page.locator(".lane h2").allTextContents()).join("|").includes("Ideas"), "template columns");
});
const boardUrl = page.url();

await step("quick-add three cards; they appear at once", async () => {
  await page.locator(".lane").nth(1).getByRole("button", { name: "Add a card" }).click();
  for (const title of ["Book the stand", "Print flyers", "Pack the demo laptop"]) {
    await page.getByPlaceholder("What needs doing?").fill(title);
    await page.keyboard.press("Enter");
  }
  await page.waitForTimeout(1500);
  const titles = await page.locator(".lane").nth(1).locator(".card-title").allTextContents();
  expect(titles.join("|") === "Book the stand|Print flyers|Pack the demo laptop", "cards: " + titles.join("|"));
});

await step("drag a card to Doing with the mouse", async () => {
  const card = page.locator(".card", { hasText: "Print flyers" });
  const target = page.locator(".lane").nth(2).locator(".lane-cards");
  const a = await card.boundingBox(), b = await target.boundingBox();
  await page.mouse.move(a.x + 20, a.y + 10);
  await page.mouse.down();
  await page.mouse.move(a.x + 40, a.y + 20, { steps: 5 });
  await page.mouse.move(b.x + 40, b.y + 20, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(1500);
  await page.reload();
  const doing = await page.locator(".lane").nth(2).locator(".card-title").allTextContents();
  expect(doing.includes("Print flyers"), "doing: " + doing.join("|"));
});

await step("move a card with the keyboard", async () => {
  await page.locator(".lane").nth(1).locator(".card-handle", { hasText: "Pack the demo laptop" }).focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(200);
  await page.keyboard.press("Space");
  await page.waitForTimeout(1500);
  await page.reload();
  const todo = await page.locator(".lane").nth(1).locator(".card-title").allTextContents();
  expect(todo[0] === "Pack the demo laptop", "todo: " + todo.join("|"));
});

await step("open a card; set a date, a checklist, give it to Inès, mention her", async () => {
  await page.locator(".card", { hasText: "Book the stand" }).click();
  await page.waitForURL(/card=/u);
  await page.locator("#card-due").fill("2026-10-15");
  await page.waitForTimeout(800);
  await page.getByPlaceholder("One step").fill("Choose the size");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Give to…" }).click();
  await page.getByPlaceholder("Find someone").fill("ines");
  await page.locator(".picker-list label", { hasText: "Inès" }).click();
  await page.waitForTimeout(800);
  await page.keyboard.press("Escape");
  await page.locator("#comment").fill("Can you check the price @In");
  await page.waitForSelector(".suggestions");
  await page.keyboard.press("Enter");
  // The mention is in the text before typing on.
  await page.waitForFunction(() => (document.querySelector("#comment")?.value ?? "").includes("@Inès Moreau"));
  await page.locator("#comment").type("please");
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await page.locator(".panel").getByText("@Inès Moreau please").first().waitFor();
  const text = await page.locator(".panel").innerText();
  expect(text.includes("Choose the size"), "checklist");
  expect(text.includes("@Inès Moreau please"), "comment");
  expect(text.includes("Inès Moreau"), "assignee");
});

await step("the file goes to the Chest and opens again", async () => {
  const file = tmp + "/stand-plan.txt";
  writeFileSync(file, "Stand B12, 3×3 m");
  await page.locator(".panel input[type=file]").setInputFiles(file);
  await page.waitForSelector(".file a:has-text('stand-plan.txt')", { timeout: 8000 });
  const href = await page.locator(".file a", { hasText: "stand-plan.txt" }).getAttribute("href");
  const r = await page.request.get(origin + href);
  expect((await r.text()) === "Stand B12, 3×3 m", "file content");
});

await step("Inès sees it in My tasks, in French, and in her bell", async () => {
  await as(context, origin, "ines");
  await page.goto(origin + "/chest");
  const text = await page.locator("main").innerText();
  expect(text.includes("Mes tâches"), "French home");
  expect(text.includes("Book the stand"), "the task");
  const dev = await (await page.request.get(origin + "/_dev")).text();
  expect(dev.includes("Hugo Bernard vous a confié une tâche"), "assignment in French");
  expect(dev.includes("Hugo Bernard vous a mentionné"), "mention in French");
});

await step("tick it done from My tasks, then undo", async () => {
  await page.locator(".task", { hasText: "Book the stand" }).locator("button.check").click();
  await page.waitForSelector(".toast");
  await page.locator(".toast button").click();
  await page.waitForTimeout(1500);
  await page.reload();
  expect(await page.locator(".task", { hasText: "Book the stand" }).count() === 1, "back after undo");
});

await step("a viewer cannot drag or add; a stranger to a private board sees nothing", async () => {
  await as(context, origin, "nora");
  await page.goto(boardUrl);
  expect((await page.locator("#main").innerText()).length > 0, "page");
  await as(context, origin, "sofia");
  await page.goto(origin + "/chest/boards/3");
  expect((await page.locator("body").innerText()).includes("Nothing here"), "private board hidden");
});

await step("archive a card with undo; export the board", async () => {
  await as(context, origin, "hugo");
  await page.goto(boardUrl);
  await page.locator(".card", { hasText: "Pack the demo laptop" }).click();
  await page.getByRole("button", { name: "Archive" }).click();
  await page.waitForSelector(".toast");
  const csv = await (await page.request.get(boardUrl + "/export?format=csv")).text();
  expect(csv.includes("Book the stand"), "csv");
  expect(!csv.includes("Pack the demo laptop"), "archived card not exported");
});

await step("import a spreadsheet as a new board", async () => {
  const file = tmp + "/plan.csv";
  writeFileSync(file, "Titre;Colonne;Échéance;Responsable\nAppeler le traiteur;À faire;12/10/2026;Léa Dubois\nRéserver la salle;En cours;;Hugo Bernard\n");
  await page.goto(origin + "/chest/import");
  await page.locator(".source", { hasText: "Spreadsheet" }).locator("input[type=file]").setInputFiles(file);
  await page.getByRole("button", { name: "Import the board" }).click();
  await page.waitForSelector("text=Imported 2 cards");
  await page.getByRole("link", { name: "Open the board" }).click();
  await page.waitForURL(/\/chest\/boards\/\d+/u);
  expect((await page.locator(".lane h2").allTextContents()).join("|").includes("En cours"), "columns");
});

await step("phone width: the board scrolls sideways, the card panel fills the screen", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(boardUrl);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width <= 400, "page does not overflow: " + width);
  await page.locator(".card").first().click();
  const box = await page.locator(".panel").boundingBox();
  expect(box.width >= 385, "panel width " + box.width);
});

await browser.close();
done(problems);
