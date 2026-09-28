// News, as people use it, in a real browser: node lab/chest-dev/flows/news.mjs [port]
// (the harness runs the tool with --reset: the sample month is there —
// posts 1 to 7; 3 is the team dinner, 4 the Important office move, 7 is
// scheduled).
import { writeFileSync } from "node:fs";
import { as, done, expect, open, step } from "./lib.mjs";

const port = Number(process.argv[2] ?? 4500);
const { browser, context, page, origin, problems } = await open(port, "camille", { locale: "en" });
const tmp = process.env.TMPDIR ?? "/tmp";
const speak = locale => context.addCookies([{ name: "dev_locale", value: locale, url: origin }]);
const dev = async () => (await page.request.get(origin + "/_dev")).text();

// A cover picture: an illustration drawn here, made a PNG by the browser.
async function picture(file, hue) {
  const p = await context.newPage();
  await p.setViewportSize({ width: 1200, height: 800 });
  await p.setContent(`<body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" width="1200" height="800">
    <rect width="1200" height="800" fill="hsl(${hue} 45% 86%)"/><circle cx="930" cy="190" r="110" fill="hsl(${hue + 20} 85% 62%)"/>
    <rect x="160" y="250" width="420" height="550" fill="hsl(${hue} 20% 28%)"/><rect x="600" y="360" width="360" height="440" fill="hsl(${hue} 18% 40%)"/>
    ${Array.from({ length: 12 }, (_, i) => `<rect x="${200 + (i % 3) * 120}" y="${290 + Math.floor(i / 3) * 110}" width="70" height="70" fill="hsl(45 90% 75%)"/>`).join("")}
    ${Array.from({ length: 6 }, (_, i) => `<rect x="${640 + (i % 2) * 150}" y="${400 + Math.floor(i / 2) * 120}" width="90" height="70" fill="hsl(45 80% 80%)"/>`).join("")}
    <rect x="0" y="740" width="1200" height="60" fill="hsl(${hue} 25% 20%)"/></svg></body>`);
  writeFileSync(file, await p.screenshot({ type: "png" }));
  await p.close();
}

await step("a publisher writes an Important post with a picture and a file", async () => {
  const cover = tmp + "/news-cover.png";
  await picture(cover, 200);
  writeFileSync(tmp + "/badge-rules.txt", "Badges open the main door from 7:00 to 21:00.");
  await page.goto(origin + "/chest");
  await page.getByRole("link", { name: "Write a post" }).first().click();
  await page.waitForURL(/\/chest\/new/u);
  await page.getByLabel("Headline").fill("New badges from Monday");
  await page.getByLabel("Text", { exact: true }).fill("Your new badge opens **both doors**.\n\n- Collect it at the desk\n- Return the old one");
  await page.locator(".side-card input[type=file]").first().setInputFiles(cover);
  await page.waitForSelector(".cover-preview img", { timeout: 8000 });
  await page.locator("label", { hasText: "Attach a file" }).locator("input").setInputFiles(tmp + "/badge-rules.txt");
  await page.waitForSelector(".file-list li:has-text('badge-rules.txt')", { timeout: 8000 });
  await page.getByRole("tab", { name: "Preview" }).click();
  expect(await page.locator(".preview strong", { hasText: "both doors" }).isVisible(), "preview renders bold");
  await page.getByLabel("Important").check();
  await page.getByRole("button", { name: "Publish" }).click();
  await page.waitForURL(/\/chest\/posts\/\d+$/u);
  expect(await page.getByRole("heading", { name: "New badges from Monday" }).isVisible(), "the article");
  const width = await page.locator(".cover img").evaluate(img => img.naturalWidth);
  expect(width > 0, "the cover shows");
  const href = await page.getByRole("link", { name: "badge-rules.txt", exact: true }).getAttribute("href");
  expect((await (await page.request.get(origin + href)).text()).startsWith("Badges open"), "the file opens");
});
const badgesUrl = page.url();

await step("everyone is told in their bell, in their language", async () => {
  const text = await dev();
  expect(text.includes("Important : New badges from Monday"), "French bell for Inès");
  expect(text.includes("Important: New badges from Monday"), "English bell for Hugo");
});

await step("a reader confirms from the front page; reacts and comments", async () => {
  await as(context, origin, "hugo");
  await page.goto(origin + "/chest");
  expect(!(await page.getByRole("link", { name: "Write a post" }).count()), "no Write button for a reader");
  await page.locator(".asks-you").getByRole("link", { name: "Read it" }).click();
  await page.waitForURL(/\/chest\/posts\/\d+$/u);
  await page.getByRole("button", { name: "I have read it" }).click();
  await page.waitForSelector(".confirm-box.done");
  await page.locator(".reaction", { hasText: "🎉" }).click();
  await page.locator("#comment").fill("Great, thanks!");
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await page.waitForTimeout(1200);
  await page.reload();
  expect(await page.locator(".confirm-box.done").isVisible(), "confirmation kept");
  expect(await page.locator(".reaction.mine", { hasText: "🎉" }).isVisible(), "reaction kept");
  expect((await page.locator(".thread").innerText()).includes("Great, thanks!"), "comment kept");
  const status = (await page.request.get(origin + "/chest/new")).status();
  expect(status === 404, "a reader cannot open the composer: " + status);
});

await step("the publisher sees who read it, reminds the others, downloads the list", async () => {
  await as(context, origin, "camille");
  await page.goto(badgesUrl);
  const readers = await page.locator(".readers").innerText();
  expect(/Read by 1 of 6/u.test(readers), "count: " + readers.split("\n")[0]);
  expect(readers.includes("Hugo Bernard"), "Hugo confirmed");
  expect(readers.includes("Nora Petit") && !readers.includes("Unknown member"), "those who have not, by name");
  await page.getByRole("button", { name: "Remind those who have not" }).click();
  await page.waitForSelector(".toast:has-text('Reminder sent to 5 people')");
  const csv = await (await page.request.get(badgesUrl + "/confirmations")).text();
  expect(csv.includes("Hugo Bernard,Confirmed"), "csv confirmed row");
  expect(csv.includes("Not yet"), "csv pending rows");
  expect((await dev()).includes("Hugo Bernard a commenté"), "Camille is told of the comment, in French");
});

await step("events: a reader answers and takes it to their calendar", async () => {
  await as(context, origin, "ines");
  await speak("fr");
  await page.goto(origin + "/chest/posts/3");
  await page.getByRole("button", { name: "Je viens", exact: true }).click();
  await page.waitForTimeout(1000);
  await page.reload();
  expect(await page.locator(".rsvp button[aria-pressed=true]", { hasText: "Je viens" }).isVisible(), "answer kept");
  expect((await page.locator(".attendees").innerText()).includes("Vous"), "listed as coming");
  const ics = await (await page.request.get(origin + "/chest/posts/3/calendar")).text();
  expect(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.includes("SUMMARY:Team dinner at Le Petit Zinc") && ics.includes("LOCATION:Le Petit Zinc\\, 11 rue"), "the .ics");
});

await step("a publisher adds a picture to the lead story, then deletes a post and undoes it", async () => {
  await as(context, origin, "sofia");
  await speak("en");
  await page.goto(origin + "/chest/posts/4/edit");
  const cover = tmp + "/news-move.png";
  await picture(cover, 20);
  await page.locator(".side-card input[type=file]").first().setInputFiles(cover);
  await page.waitForSelector(".cover-preview img", { timeout: 8000 });
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(/\/chest\/posts\/4$/u);
  expect(await page.locator(".cover img").isVisible(), "cover on the article");
  await page.goto(origin + "/chest/posts/2");
  await page.getByRole("button", { name: "Delete" }).click();
  await page.waitForURL(origin + "/chest");
  await page.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await page.waitForURL(/\/chest\/posts\/2$/u);
  expect(await page.getByRole("heading", { name: "The Wi-Fi password changes on Monday" }).isVisible(), "restored");
});

await step("a scheduled post waits: publishers see it on the side, readers not at all", async () => {
  await page.goto(origin + "/chest");
  expect((await page.locator(".side").innerText()).includes("Office closed for the holidays"), "scheduled listed");
  await as(context, origin, "tom");
  await page.goto(origin + "/chest");
  expect(!(await page.locator("main").innerText()).includes("Office closed for the holidays"), "hidden from readers");
  expect((await page.request.get(origin + "/chest/posts/7")).status() === 404, "not found for readers");
});

await step("filter by kind; a welcome shows the new colleague", async () => {
  await page.goto(origin + "/chest");
  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Welcome" }).click();
  await page.waitForURL(/kind=welcome/u);
  const titles = await page.locator(".story .headline").allTextContents();
  expect(titles.length === 1 && titles[0] === "Welcome to Nora, our new designer!", "welcome only: " + titles.join("|"));
  await page.locator(".story .headline a").first().click();
  expect((await page.locator(".welcome-card").innerText()).includes("Say hello to Nora Petit"), "the colleague");
});

await step("French, phone width: nothing overflows; confirm and write work", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await as(context, origin, "ines");
  await speak("fr");
  await page.goto(origin + "/chest");
  let width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width <= 392, "front page width " + width);
  expect((await page.locator(".asks-you").innerText()).includes("confirmer"), "French strip");
  await page.locator(".asks-you a").click();
  await page.getByRole("button", { name: "Je l’ai lue" }).click();
  await page.waitForSelector(".confirm-box.done");
  width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width <= 392, "article width " + width);
  await as(context, origin, "camille");
  await page.goto(origin + "/chest/new?kind=event");
  width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width <= 392, "composer width " + width);
  await page.getByLabel("Titre").fill("Apéro sur la terrasse");
  await page.getByLabel("Lieu").fill("Terrasse, 3e étage");
  await page.getByLabel("Début").fill("18:30");
  await page.getByRole("button", { name: "Publier" }).click();
  await page.waitForURL(/\/chest\/posts\/\d+$/u);
  expect((await page.locator(".event-box").innerText()).includes("Terrasse"), "event published");
});

await browser.close();
done(problems);
