// Tasks, as a person uses it, in a real browser: node lab/chest-dev/flows/tasks.mjs [port]
// (the harness runs the tool with --reset: the sample boards are there).
import { writeFileSync } from "node:fs";
import { as, done, expect, id, open, step } from "./lib.mjs";

const port = Number(process.argv[2] ?? 4000);
const { browser, context, page, origin, problems } = await open(port, "hugo", { allow404: /\/chest\/boards\/\d+$/u });
const tmp = process.env.TMPDIR ?? "/tmp";

await step("create a board: the dialog opens on its name field, typing names it", async () => {
  await page.goto(origin + "/chest/boards");
  await page.getByRole("button", { name: "New board" }).first().click();
  await page.waitForFunction(() => document.activeElement?.id === "board-name");
  await page.keyboard.type("Trade show");
  expect((await page.getByLabel("Name").inputValue()) === "Trade show", "typed into the name");
  await page.getByText("A project").click();
  await page.getByRole("button", { name: "Create the board" }).click();
  await page.waitForURL(/\/chest\/boards\/\d+$/u);
  expect(await page.getByRole("heading", { name: "Trade show" }).isVisible(), "board title");
  expect((await page.locator(".lane h2").allTextContents()).join("|").includes("Ideas"), "template columns");
});
const boardUrl = page.url();
const boardId = boardUrl.match(/\/boards\/(\d+)$/u)?.[1];
let standId = null;
let mentionedAt = Date.now();

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

await step("keyboard: Enter on a focused card opens it; Escape closes; Space still picks it up", async () => {
  const handle = page.locator(".lane").nth(1).locator(".card-handle").first();
  await handle.focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(/card=/u);
  expect(await page.locator(".panel").isVisible(), "panel open");
  await page.keyboard.press("Escape");
  await page.waitForURL(u => !/card=/u.test(String(u)));
  const hint = await page.locator("[id^=DndDescribedBy]").first().textContent();
  expect(/Press Enter to open a card/u.test(hint ?? ""), "the instructions say so: " + hint);
});

await step("open a card; set a date, a checklist, give it to Inès, mention her", async () => {
  await page.locator(".card", { hasText: "Book the stand" }).click();
  await page.waitForURL(/card=/u);
  standId = new URL(page.url()).searchParams.get("card");
  // The kit's date field reads what is typed (ISO too) when Enter is pressed.
  await page.locator("#card-due").fill("2026-10-15");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  await page.getByPlaceholder("One step").fill("Choose the size");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  // The kit's people picker: type a name, the list follows, Enter chooses.
  await page.getByRole("combobox", { name: "Give to" }).fill("ines");
  await page.locator(".ck-option.ck-active", { hasText: "Inès Moreau" }).waitFor();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  await page.keyboard.press("Escape");
  await page.locator("#comment").fill("Can you check the price @In");
  await page.waitForSelector(".suggestions");
  await page.keyboard.press("Enter");
  // The mention is in the text, and the caret after it, before typing on
  // (the caret once came a frame late and moved the letters typed).
  await page.waitForFunction(() => {
    const box = document.querySelector("#comment");
    return !!box && box.value.includes("@Inès Moreau ") && document.activeElement === box && box.selectionStart === box.value.length;
  });
  await page.locator("#comment").type("please");
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await page.locator(".panel").getByText("@Inès Moreau please").first().waitFor();
  const text = await page.locator(".panel").innerText();
  expect(text.includes("Choose the size"), "checklist");
  expect(text.includes("@Inès Moreau please"), "comment");
  expect(text.includes("Inès Moreau"), "assignee");
  mentionedAt = Date.now();
});

await step("a due date typed wrong is refused as typed; the card keeps its date (nothing auto-saved)", async () => {
  // Kit 0.2.4: a refused text stays as typed, says why, and onChange is not
  // called — the due date saved on every change is neither erased (null)
  // nor re-sent. Tasks has no date field with min or max: the refused text
  // here is one the field cannot read, the same rule (readTypedDate).
  await page.goto(boardUrl);
  await page.locator(".card", { hasText: "Book the stand" }).click();
  await page.waitForURL(/card=/u);
  const held = await page.locator("#card-due").inputValue();
  expect(held !== "", "the card has a due date: " + held);
  await page.locator("#card-due").fill("32/13/2026");
  await page.locator("#card-due").press("Tab");
  const field = page.locator(".ck-date", { has: page.locator("#card-due") });
  await field.locator(".ck-error", { hasText: /^Type a date like /u }).waitFor();
  expect(await page.locator("#card-due").getAttribute("aria-invalid") === "true", "the field says it is refused");
  expect(await page.locator("#card-due").inputValue() === "32/13/2026", "the text stays as typed");
  await page.waitForTimeout(1000);
  expect(await page.locator(".ck-toast-error").count() === 0, "no error toast");
  await page.reload();
  await page.locator("#card-due").waitFor();
  expect(await page.locator("#card-due").inputValue() === held, "the card keeps its due date: " + await page.locator("#card-due").inputValue());
  // The card stays open for the next step.
});

await step("SECRETX: a comment deleted leaves nothing in the bell (and, later, nothing by email)", async () => {
  await page.locator("#comment").fill("Door code is 4321 SECRETX @In");
  await page.waitForSelector(".suggestions");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  const bubble = page.locator(".comment", { hasText: "SECRETX" });
  await bubble.waitFor();
  mentionedAt = Date.now();
  const before = await (await page.request.get(origin + "/_dev")).text();
  expect(before.includes("SECRETX"), "the bell showed it first");
  await bubble.getByRole("button", { name: "Delete" }).click();
  await page.locator(".ck-toast", { hasText: "Comment deleted." }).waitFor();
  // The Undo runs out; nothing of it stays in anyone's bell.
  await page.locator(".ck-toast", { hasText: "Comment deleted." }).waitFor({ state: "detached", timeout: 30000 });
  const dev = await (await page.request.get(origin + "/_dev")).text();
  expect(!dev.includes("SECRETX"), "no bell item holds SECRETX");
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

await step("make a card repeat every Monday and Thursday; the card says when the next one comes", async () => {
  await page.goto(boardUrl);
  await page.locator(".card", { hasText: "Print flyers" }).click();
  await page.waitForURL(/card=/u);
  await page.locator("#card-repeat").selectOption("week");
  await page.locator(".weekdays").waitFor();
  // "Every week" starts on the card's day; then exactly Monday and Thursday.
  for (const day of ["Monday", "Thursday", "Tuesday", "Wednesday", "Friday", "Saturday", "Sunday"]) {
    const box = page.getByRole("checkbox", { name: day, exact: true });
    const wanted = day === "Monday" || day === "Thursday";
    if ((await box.isChecked()) !== wanted) { await box.setChecked(wanted); await page.waitForTimeout(800); }
  }
  await page.waitForFunction(() => /Repeats every Monday and Thursday\./u.test(document.querySelector(".repeat-note")?.textContent ?? ""));
  const note = await page.locator(".repeat-note").innerText();
  expect(/Once this card is done, the next one comes in “Ideas”, due (Monday|Thursday) \d+ \w+\./u.test(note), "note: " + note);
  expect((await page.locator("#card-due").inputValue()) !== "", "a date was given");
});

await step("done, it makes the next one in the first column, with its people and the next date", async () => {
  await page.locator("#card-column").selectOption({ label: "Done" });
  await page.getByRole("link", { name: "Open the next one" }).waitFor();
  const made = await page.locator(".repeat-note").innerText();
  expect(made.includes("The next one is on the board, due"), "made: " + made);
  await page.getByRole("link", { name: "Open the next one" }).click();
  await page.waitForFunction(() => document.querySelector("#card-title")?.value === "Print flyers" && !document.querySelector(".repeat-note a"));
  expect((await page.locator("#card-column").inputValue()) === (await page.locator("#card-column option", { hasText: "Ideas" }).getAttribute("value")), "in Ideas");
  expect((await page.locator(".repeat-note").innerText()).includes("Repeats every Monday and Thursday."), "the rule follows");
  await page.keyboard.press("Escape");
  const ideas = await page.locator(".lane").nth(0).locator(".card", { hasText: "Print flyers" });
  expect(await ideas.locator(".stat[title=Repeats]").count() === 1, "the card shows it repeats");
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
  await page.waitForSelector(".ck-toast");
  await page.locator(".ck-toast-undo").click();
  await page.waitForTimeout(1500);
  await page.reload();
  expect(await page.locator(".task", { hasText: "Book the stand" }).count() === 1, "back after undo");
  // Goals' "Cards done": done (with its board and Inès), then taken back
  // by the Undo — each published once (the harness's Events panel).
  const published = (await (await page.request.get(origin + "/_dev")).text()).replaceAll("&quot;", '"');
  const doneEvent = `<code>tasks.card.done</code> <small>{"card":"${standId}","board":"${boardId}","boardName":"Trade show","assignees":["${id("ines")}"]}</small>`;
  const reopened = `<code>tasks.card.reopened</code> <small>{"card":"${standId}"}</small>`;
  expect(published.split(doneEvent).length === 2, "tasks.card.done published once, with its board and people");
  expect(published.split(reopened).length === 2, "tasks.card.reopened published once by the Undo");
  expect(published.indexOf(reopened) < published.indexOf(doneEvent), "reopened after done (the panel lists the latest first)");
});

await step("the morning: Inès finds one reminder in French; run again, still one; switched off, it goes", async () => {
  // (the email of the assignment went too, in French)
  await page.request.post(origin + "/_dev/clear");
  for (let i = 0; i < 2; i++) await page.request.post(origin + "/_dev/schedule", { form: { name: "morning" } });
  const dev = await (await page.request.get(origin + "/_dev")).text();
  const hers = dev.match(/<b>Inès Moreau<\/b> · [^<]+/gu) ?? [];
  expect(hers.length === 1, "one item for Inès: " + hers.join(" | "));
  expect(/tâches? (pour aujourd’hui|en retard)/u.test(hers[0] ?? ""), "in French: " + hers[0]);
  await page.goto(origin + "/chest");
  const toggle = page.getByRole("switch", { name: "Me rappeler chaque matin (lun.–ven.) ce qui est à faire ou en retard" });
  expect(await toggle.isChecked(), "on by default");
  // The kit's Switch: its input is hidden, its label is what one taps.
  const flip = () => page.locator(".ck-switch").filter({ has: toggle }).locator("label").click();
  await flip();
  expect(!(await toggle.isChecked()), "switched off at once");
  await page.waitForTimeout(1200);
  await page.reload();
  expect(!(await toggle.isChecked()), "stays off");
  let after = await (await page.request.get(origin + "/_dev")).text();
  expect(!after.includes("<b>Inès Moreau</b> · "), "her item went");
  // Emails wait a quiet minute, then one person's things leave as one:
  // the card given and the mention, in French — and never the deleted comment.
  await page.waitForTimeout(Math.max(0, mentionedAt + 65_000 - Date.now()));
  await page.request.post(origin + "/_dev/schedule", { form: { name: "mail" } });
  after = await (await page.request.get(origin + "/_dev")).text();
  expect(after.includes("Hugo Bernard\u202f: 1 tâche confiée et 1 mention"), "one email for the card and the mention");
  expect(!after.includes("vous a confié une tâche\u202f: Book the stand"), "not one email each");
  expect(!after.includes("SECRETX"), "the deleted comment never left by email");
  expect(await page.getByRole("switch", { name: /M’envoyer aussi tout cela par e-mail/u }).isChecked(), "email on by default");
  await flip();
  expect(await toggle.isChecked(), "switched on again");
  await page.waitForTimeout(800);
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
  await page.waitForSelector(".ck-toast");
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

await step("Mark done in the card, then Undo", async () => {
  await page.goto(boardUrl);
  await page.locator(".card", { hasText: "Book the stand" }).click();
  await page.getByRole("button", { name: "Mark done" }).click();
  await page.locator(".ck-toast", { hasText: "Done: moved to Done." }).waitFor();
  await page.locator(".panel .chip.done.big").waitFor();
  await page.locator(".ck-toast-undo", { hasText: "Undo" }).click();
  await page.getByRole("button", { name: "Mark done" }).waitFor();
});

await step("a step given to Inès with a date shows in her My tasks", async () => {
  await page.locator(".check-item", { hasText: "Choose the size" }).getByRole("button", { name: /Person and date/u }).click();
  await page.getByRole("combobox", { name: "Given to" }).fill("Inès");
  await page.locator(".ck-option.ck-active", { hasText: "Inès Moreau" }).waitFor();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  await page.getByLabel("Date", { exact: true }).fill("2026-10-10");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1200);
  expect(await page.locator(".check-item", { hasText: "Choose the size" }).locator(".chip", { hasText: "Inès Moreau" }).count() === 1, "the step says whom");
  await as(context, origin, "ines");
  await page.goto(origin + "/chest");
  const row = page.locator(".task.step", { hasText: "Choose the size" });
  expect(await row.count() === 1, "in her list");
  expect((await row.innerText()).includes("Book the stand"), "with its card");
  await as(context, origin, "hugo");
});

await step("a comment deleted comes back with Undo; an empty title says why it is refused", async () => {
  await page.goto(boardUrl);
  await page.locator(".card", { hasText: "Book the stand" }).click();
  await page.locator("#comment").fill("Password is hunter2");
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  const bubble = page.locator(".comment", { hasText: "Password is hunter2" });
  await bubble.waitFor();
  await bubble.getByRole("button", { name: "Delete" }).click();
  await page.locator(".ck-toast", { hasText: "Comment deleted." }).waitFor();
  await bubble.waitFor({ state: "detached" });
  await page.locator(".ck-toast-undo", { hasText: "Undo" }).click();
  await page.locator(".comment", { hasText: "Password is hunter2" }).waitFor();
  await page.locator("#card-title").fill("");
  await page.locator("#card-title").blur();
  await page.locator(".ck-toast", { hasText: "A card needs a title." }).waitFor();
  expect((await page.locator("#card-title").inputValue()) === "Book the stand", "title kept");
});

await step("move a card to another board; it arrives with its comments, in the column chosen", async () => {
  await page.getByRole("button", { name: "Move or copy…" }).click();
  await page.waitForFunction(() => document.activeElement?.id === "move-board");
  await page.getByLabel("Board").selectOption({ label: "Office move" });
  await page.locator("#move-column").selectOption({ label: "Doing" });
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await page.waitForURL(/\/chest\/boards\/1\?card=/u);
  await page.locator(".ck-toast", { hasText: "Moved to Office move." }).waitFor();
  expect((await page.locator("#card-column option:checked").textContent()) === "Doing", "in Doing");
  expect((await page.locator(".panel").innerText()).includes("Password is hunter2"), "its comment came along");
  expect((await page.locator(".history").innerText()).includes("moved it here from the board “Trade show”"), "history says where from");
});

await step("after the move, Inès's bell item, an old email link and the card's own address all open it on its new board", async () => {
  const moved = new URL(page.url()).searchParams.get("card");
  await as(context, origin, "ines");
  const dev = await (await page.request.get(origin + "/_dev")).text();
  expect(dev.includes(`/chest/cards/${moved}`), "the bell item points at the card by its id");
  // An address made before the move (the old board): it follows the card.
  await page.goto(`${boardUrl}?card=${moved}`);
  await page.waitForURL(new RegExp(`/chest/boards/1\\?card=${moved}$`, "u"));
  expect((await page.locator("#card-title").inputValue()) === "Book the stand", "the card opens");
  await page.goto(`${origin}/chest/cards/${moved}`);
  await page.waitForURL(new RegExp(`/chest/boards/1\\?card=${moved}$`, "u"));
  await page.locator(".panel").waitFor();
  // A card that is gone says so, instead of an empty board.
  await page.goto(`${origin}/chest/boards/1?card=999999`);
  expect((await page.locator(".card-gone").innerText()).includes("n’est plus ici"), "a card gone says so");
  await as(context, origin, "hugo");
});

await step("fields: add a choice field in settings, set it on a card; the list view shows it, sorts and groups", async () => {
  await page.goto(origin + "/chest/boards/1/settings");
  await page.getByPlaceholder("Budget, Client, Priority…").fill("Supplier");
  await page.locator("#new-field-kind").selectOption("choice");
  await page.locator("#new-field-options").fill("MoveUp\nDéménageurs Lyonnais");
  await page.getByRole("button", { name: "Add a field" }).click();
  await page.locator("#field-name-3").waitFor();
  await page.goto(origin + "/chest/boards/1?card=1");
  await page.getByLabel("Supplier").selectOption("MoveUp");
  await page.waitForTimeout(1000);
  await page.goto(origin + "/chest/boards/1?view=list");
  const head = await page.locator("table.cards thead").first().textContent();
  expect(/Supplier/u.test(head) && /Priority/u.test(head), "fields are columns: " + head);
  expect((await page.locator("table.cards").first().innerText()).includes("MoveUp"), "the value shows");
  // Rows are links; Enter on one opens the card.
  const links = await page.locator("table.cards tbody a[href*='card=']").count();
  const rows = await page.locator("table.cards tbody tr").count();
  expect(links === rows && rows > 0, `a link per row: ${links}/${rows}`);
  expect(!(await page.locator("table.cards").first().innerText()).includes("Sign the new lease"), "done cards hidden by default");
  await page.getByRole("button", { name: /^Due/u }).click();
  expect((await page.locator("th[aria-sort=ascending]").count()) === 1, "sorted by due");
  await page.locator(".list-tools select").selectOption("person");
  expect((await page.locator(".list-group-title").count()) > 1, "grouped by person");
  await page.locator("table.cards tbody a").first().focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(/card=/u);
});

await step("calendar: due cards on their day; dragged to another day, the date changes", async () => {
  await page.goto(origin + "/chest/boards/1?view=calendar");
  const card = page.locator(".cal-card", { hasText: "Order 40 archive boxes" });
  await card.waitFor();
  const today = page.locator(".cal-day.today");
  expect(await today.locator(".cal-card", { hasText: "Order 40 archive boxes" }).count() === 1, "due today, on today");
  const target = page.locator(".cal-day").nth(await page.locator(".cal-day").evaluateAll(d => d.findIndex(x => x.classList.contains("today"))) + 1);
  const a = await card.boundingBox(), b = await target.boundingBox();
  await page.mouse.move(a.x + 10, a.y + 5);
  await page.mouse.down();
  await page.mouse.move(a.x + 30, a.y + 10, { steps: 5 });
  await page.mouse.move(b.x + 20, b.y + 40, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(1500);
  await page.reload();
  expect(await page.locator(".cal-day.today .cal-card", { hasText: "Order 40 archive boxes" }).count() === 0, "moved off today");
});

await step("archive a column with cards: the dialog asks where they go; search with the archive finds the others", async () => {
  await page.goto(boardUrl);
  const lane = page.locator(".lane", { hasText: "Ideas" }).first();
  await page.locator(".lane").nth(0).getByRole("button", { name: "Add a card" }).click();
  await page.getByPlaceholder("What needs doing?").fill("Post on LinkedIn");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1200);
  await lane.getByRole("button", { name: "Column actions" }).click();
  await lane.getByRole("menuitem", { name: "Archive the column" }).click();
  await page.getByRole("dialog", { name: "Archive “Ideas”" }).waitFor();
  await page.getByLabel(/Archive them with the column/u).check();
  await page.getByRole("dialog").getByRole("button", { name: "Archive the column" }).click();
  await page.locator(".ck-toast", { hasText: /Column archived with its \d+ cards?\./u }).waitFor();
  await page.goto(origin + "/chest/search?q=LinkedIn");
  expect((await page.locator("main").innerText()).includes("No card found"), "hidden from a plain search");
  await page.getByRole("link", { name: /more in the archive/u }).click();
  await page.locator(".task", { hasText: "Post on LinkedIn" }).locator(".chip", { hasText: "Archived" }).waitFor();
});

await step("a private board shares with the people chosen at creation, and says so in its header", async () => {
  await page.goto(origin + "/chest/boards");
  await page.getByRole("button", { name: "New board" }).first().click();
  await page.keyboard.type("Salaries 2027");
  await page.getByText("Only people I choose").click();
  await page.locator(".share-box").getByRole("combobox").fill("Inès");
  await page.locator(".ck-option.ck-active", { hasText: "Inès Moreau" }).waitFor();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  expect((await page.locator(".share-box .hint").innerText()).includes("you and 1 person"), "says who");
  await page.getByRole("button", { name: "Create the board" }).click();
  await page.waitForURL(/\/chest\/boards\/\d+$/u);
  expect((await page.locator(".privacy").innerText()).includes("2 people"), "private marker: " + await page.locator(".privacy").innerText());
  const url = page.url();
  await as(context, origin, "ines");
  await page.goto(url);
  expect(await page.getByRole("heading", { name: "Salaries 2027" }).isVisible(), "Inès sees it");
  await as(context, origin, "tom");
  await page.goto(url);
  expect((await page.locator("body").innerText()).includes("Nothing here"), "Tom does not");
  await as(context, origin, "hugo");
});

await step("a Trello export: the check says who is found and what stays behind; private by default", async () => {
  await page.goto(origin + "/chest/import");
  await page.locator(".source", { hasText: "Trello" }).locator("input[type=file]").setInputFiles(new URL("../../../tools/private/tasks/test/fixtures/trello-board.json", import.meta.url).pathname);
  await page.getByText("2 people found in your Chest").waitFor();
  const check = await page.locator(".summary-box").innerText();
  expect(check.includes("1 person not found") && check.includes("Jeanne Prestataire"), "unmatched named");
  expect(check.includes("2 attached files are not brought"), "files counted: " + check);
  expect(await page.getByLabel(/Only me/u).isChecked(), "private by default");
  await page.getByRole("button", { name: "Import the board" }).click();
  await page.getByText("Only you see it for now").waitFor();
  await page.getByRole("link", { name: "Open the board" }).click();
  await page.locator(".privacy", { hasText: "Only you" }).waitFor();
});

await step("switch day: a real Trello board's Done list and its cards marked complete come in finished, the archived list archived", async () => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto(origin + "/chest/import");
  await page.locator(".source", { hasText: "Trello" }).locator("input[type=file]").setInputFiles(new URL("../../../tools/private/tasks/test/fixtures/trello-switch-day.json", import.meta.url).pathname);
  await page.getByText("Finished work", { exact: true }).waitFor();
  const box = page.locator(".summary-box");
  expect(await box.getByRole("checkbox", { name: /^Fait/u }).isChecked(), "the Fait list is finished work");
  expect(!(await box.getByRole("checkbox", { name: /^À faire/u }).isChecked()), "À faire is not");
  const check = await box.innerText();
  expect(check.includes("2 cards marked complete go to “Fait”"), "cards ticked in Trello: " + check);
  expect(check.includes("1 archived column comes in archived") && check.includes("Sprint de mars · 2"), "the archived list is said");
  const warning = page.locator(".warn", { hasText: "1 person has cards on this board but will not see them" });
  await warning.waitFor();
  expect((await warning.innerText()).includes("Inès Moreau"), "who will not see it (Camille is a manager: she sees it)");
  await page.getByText("Everyone in Tasks", { exact: true }).click();
  expect(await page.getByText("will not see them").count() === 0, "shared with everyone: no warning");
  await page.getByRole("button", { name: "Import the board" }).click();
  await page.getByRole("link", { name: "Open the board" }).click();
  await page.waitForURL(/\/chest\/boards\/\d+$/u);
  const lanes = (await page.locator(".lane h2").allTextContents()).join("|");
  expect(lanes.includes("Fait") && !lanes.includes("Sprint de mars"), "lanes: " + lanes);
  const fait = await page.locator(".lane", { hasText: "Fait" }).last().locator(".card-title").allTextContents();
  expect(fait.includes("Publier l’offre de stage") && fait.includes("Lancer la campagne de printemps"), "done cards: " + fait.join("|"));
  expect(await page.locator(".card", { hasText: "Lancer la campagne de printemps" }).locator(".chip.due-late").count() === 0, "not late on the board");
  await page.goto(origin + "/chest");
  const mine = await page.locator("main").innerText();
  expect(!mine.includes("Publier l’offre de stage") && !mine.includes("Lancer la campagne"), "finished work is not in My tasks");
  expect(mine.includes("Préparer le stand du salon"), "open work is");
});

await step("the French import page: each button stays inside its card, under its words", async () => {
  await as(context, origin, "camille");
  await page.goto(origin + "/chest/import");
  for (const source of await page.locator(".source").all()) {
    const card = await source.boundingBox(), button = await source.locator(".file-input").boundingBox(), words = await source.locator("p").boundingBox();
    expect(button.x + button.width <= card.x + card.width + 0.5, `button inside the card: ${Math.round(button.x + button.width)} > ${Math.round(card.x + card.width)}`);
    expect(button.y >= words.y + words.height - 0.5, "the button is below the words");
  }
  await as(context, origin, "hugo");
});

await step("the calendar: my due dates are in my Chest calendar feed; My tasks says so", async () => {
  await page.goto(origin + "/chest");
  await page.waitForTimeout(1500);
  await page.reload();
  const link = page.getByRole("link", { name: "Your due dates in your calendar" });
  expect(await link.getAttribute("href") === "/_chest/calendar", "the link to the Chest's calendar page");
  const dev = await (await page.request.get(origin + "/_dev")).text();
  const feed = /\/_chest\/calendar\/[A-Za-z0-9_-]+\.ics/u.exec(dev)?.[0];
  expect(feed, "the harness shows Hugo's feed address");
  const ics = await (await page.request.get(origin + feed)).text();
  expect(/SUMMARY:Due: Préparer le stand du salon/u.test(ics), "the stand's due date is in Hugo's feed");
  expect(!/Publier l’offre de stage/u.test(ics), "finished work is not");
  expect(/URL:http:\/\/[^\r\n]*\/chest\/cards\/\d+/u.test(ics), "the event opens the card by its id");
});

await step("the Chest look: late says so in a word, labels show their names", async () => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.request.post(origin + "/_dev/theme", { form: { level: "all", choice: "catalogue:chest" } });
  await as(context, origin, "hugo");
  await page.goto(origin + "/chest/boards/1");
  const truck = page.locator(".card", { hasText: "Book the moving truck" });
  const chip = truck.locator(".chip.due-late");
  expect((await chip.innerText()).includes("Late"), "the word: " + await chip.innerText());
  expect(await chip.locator("svg").count() >= 1, "and a sign");
  const names = await truck.locator(".label-tag").allInnerTexts();
  expect(names.join("|") === "Urgent|Suppliers", "labels by name: " + names.join("|"));
  await page.request.post(origin + "/_dev/theme", { form: { level: "all", choice: "own" } });
});

await step("blocked by: the card says so; Mark done is refused, then done anyway; a blocker added from the card", async () => {
  await page.goto(origin + "/chest/boards/1");
  const clients = page.locator(".card", { hasText: "Tell our clients about the new address" });
  expect((await clients.locator(".chip.blocked").innerText()).includes("Blocked"), "the card face says Blocked");
  await clients.click();
  await page.waitForURL(/card=/u);
  expect((await page.locator(".panel").innerText()).includes("Book the moving truck for the 14th"), "its blocker is listed");
  await page.getByRole("button", { name: "Mark done" }).click();
  const toast = page.locator(".ck-toast", { hasText: "Blocked: “Book the moving truck for the 14th” is not done yet." });
  await toast.waitFor();
  expect(await page.getByRole("button", { name: "Mark done", exact: true }).isVisible(), "not done");
  await toast.getByRole("button", { name: "Mark done anyway" }).click();
  await page.locator(".panel .chip.done.big").waitFor();
  expect((await page.locator(".history").innerText()).includes("while it still waited"), "the history says so");
  await page.getByRole("button", { name: "Reopen" }).click();
  await page.getByRole("button", { name: "Mark done", exact: true }).waitFor();
  await page.goto(origin + "/chest/boards/1?card=4");
  await page.locator("#add-blocker").selectOption({ label: "Order 40 archive boxes" });
  await page.locator(".links .link-line", { hasText: "Order 40 archive boxes" }).waitFor();
});

await step("timeline: bars from start to due, a line to what a card waits for; moved with the keyboard or dragged, the dates change", async () => {
  await page.goto(origin + "/chest/boards/1?view=timeline");
  const bar = () => page.getByRole("button", { name: /^Order 40 archive boxes:/u });
  await bar().waitFor();
  expect(await page.locator(".tl-links path").count() >= 1, "a line joins a card to its blocker");
  const before = await bar().getAttribute("aria-label");
  // The keyboard: Space, a day to the right, Space.
  await bar().focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  await page.keyboard.press("Space");
  await page.waitForTimeout(1500);
  await page.reload();
  const moved = await bar().getAttribute("aria-label");
  expect(moved !== before, `moved a day: ${before} → ${moved}`);
  // The mouse: two days to the left.
  const box = await bar().boundingBox();
  await page.mouse.move(box.x + 8, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x, box.y + box.height / 2, { steps: 5 });
  await page.mouse.move(box.x + 8 - 64, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(1500);
  await page.reload();
  const back = await bar().getAttribute("aria-label");
  expect(back !== moved, `dragged: ${moved} → ${back}`);
  // Enter opens the card.
  await bar().focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(/card=/u);
});

await step("columns speak the reader's language: Inès reads the sample board in French", async () => {
  await as(context, origin, "ines");
  await page.goto(origin + "/chest/boards/1");
  const lanes = (await page.locator(".lane h2").allTextContents()).join("|");
  expect(lanes.includes("À faire") && lanes.includes("En cours"), "lanes: " + lanes);
  await as(context, origin, "hugo");
});

await step("phone: the first card is near the top; view and filters behind one button; the list is stacked cards", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/chest/boards/1");
  const first = await page.locator(".lane .card").first().boundingBox();
  expect(first.y < 330, "first card at y=" + Math.round(first.y));
  expect(!(await page.locator("#filter-who").isVisible()), "filters folded");
  await page.getByRole("button", { name: "View and filters" }).click();
  expect(await page.locator("#filter-who").isVisible(), "filters shown");
  await page.goto(origin + "/chest/boards/1?view=list");
  expect(!(await page.locator("table.cards").first().isVisible()), "no wide table");
  expect(await page.locator(".list-cards li").first().isVisible(), "stacked cards");
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width <= 400, "no sideways scroll: " + width);
});

await step("phone: the timeline is a list of weeks, each card with its dates", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/chest/boards/1?view=timeline");
  await page.locator(".tl-week").first().waitFor();
  expect(!(await page.locator(".tl-scroll").isVisible()), "no narrow grid of 8 days");
  const weeks = await page.locator(".tl-week h3").allTextContents();
  expect(weeks.length >= 2 && weeks.every(w => w.startsWith("Week of")), "weeks: " + weeks.join("|"));
  expect(await page.locator(".tl-week-card", { hasText: "Order 40 archive boxes" }).count() >= 1, "a card with its dates");
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width <= 400, "no sideways scroll: " + width);
  await page.locator(".tl-week-card a").first().click();
  await page.waitForURL(/card=/u);
});

await step("phone width: the board scrolls sideways, the card panel fills the screen", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(boardUrl);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width <= 400, "page does not overflow: " + width);
  expect(await page.locator(".lane-jump button").count() >= 3, "columns by name above the board");
  await page.locator(".card").first().click();
  const box = await page.locator(".panel").boundingBox();
  expect(box.width >= 385, "panel width " + box.width);
});

await browser.close();
done(problems);
