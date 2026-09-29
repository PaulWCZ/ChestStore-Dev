// Tasks on a new Chest (no sample data): node lab/chest-dev/flows/tasks-empty.mjs [port]
// (the harness runs the tool with --reset --empty). The first visit of each
// kind of person says what to do, or whom to ask.
import { as, done, expect, open, step } from "./lib.mjs";

const port = Number(process.argv[2] ?? 4000);
const { browser, context, page, origin, problems } = await open(port, "camille");

await step("a manager's first visit: create a board, or bring the Trello and Asana boards", async () => {
  await page.goto(origin + "/chest");
  const empty = page.locator(".ck-empty");
  expect((await empty.innerText()).includes("Commencez par un tableau"), "the first-time state, in French");
  expect(await empty.getByRole("button", { name: "Créer un tableau" }).isVisible(), "create a board");
  const bring = empty.getByRole("link", { name: "Apporter vos tableaux Trello ou Asana" });
  expect(await bring.getAttribute("href") === "/chest/import", "the import, one click away");
});

await step("a viewer's Boards page names who can share a board with them", async () => {
  await as(context, origin, "sofia");
  await page.goto(origin + "/chest/boards");
  const empty = page.locator(".ck-empty");
  const text = await empty.innerText();
  expect(text.includes("No board is shared with you yet"), "says why it is empty: " + text);
  expect(text.includes("Ask Camille Martin"), "and whom to ask: " + text);
  await page.goto(origin + "/chest");
  expect((await page.locator(".ck-empty").innerText()).includes("Ask Camille Martin"), "My tasks says the same");
});

await browser.close();
done(problems);
