// News, as people use it, in a real browser: node lab/chest-dev/flows/news.mjs [port]
// (the harness runs the tool with --reset: the sample month is there —
// posts 1 to 10; 3 is the team dinner, 4 the Important office move (in
// English and French), 7 is scheduled, 8 for Sales, 9 the first-aid
// training with 3 places, 10 for three people, 11 Hugo's shout-out to Léa;
// one proposal by Léa waits for a publisher).
import { writeFileSync } from "node:fs";
import postgres from "postgres";
import { as, done, expect, open, step } from "./lib.mjs";

const port = Number(process.argv[2] ?? 4500);
const { browser, context, page, origin, problems } = await open(port, "camille", { locale: "en" });
const tmp = process.env.FLOW_TMP ?? process.env.TMPDIR ?? "/tmp";
const speak = locale => context.addCookies([{ name: "dev_locale", value: locale, url: origin }]);
const dev = async () => (await page.request.get(origin + "/_dev")).text();
// French puts a narrow no-break space before ":" (the bell may show it as
// a plain space): either is accepted.
const sp = "[ \u00a0\u202f]";
const has = (text, pattern) => new RegExp(pattern, "u").test(text);
// A page loaded is not yet a page that answers: wait until it runs in the
// browser (the tool marks <html data-hydrated>) before acting on it.
const load = page.goto.bind(page);
const again = page.reload.bind(page);
page.goto = async (url, options) => { const r = await load(url, options); if (url.startsWith(origin + "/chest")) await page.waitForSelector("html[data-hydrated]", { state: "attached" }); return r; };
page.reload = async options => { const r = await again(options); await page.waitForSelector("html[data-hydrated]", { state: "attached" }); return r; };
const arrive = page.waitForURL.bind(page);
page.waitForURL = async (url, options) => { await arrive(url, options); await page.waitForSelector("html[data-hydrated]", { state: "attached" }); };
// An action and the server's answer to it (a server action is a POST):
// the request this action sends — never the answer to an earlier one
// still on its way.
async function saved(action) {
  const sent = page.waitForRequest(r => r.method() === "POST" && r.url().startsWith(origin + "/chest"));
  await action();
  await (await sent).response();
}
// The composer, fresh: no draft left in this browser by an earlier step,
// and running (its draft read) before anything is typed.
async function compose(path = "/chest/new") {
  await page.goto(origin + "/chest");
  await page.evaluate(() => { try { localStorage.removeItem("news.draft"); } catch {} });
  await page.goto(origin + path);
  await page.waitForSelector(".composer[data-ready]", { state: "attached" });
}
// The text box shows formatting as it is typed: no marks to type.
async function type(text, { bold = null } = {}) {
  await page.locator("#body").click();
  await page.keyboard.type(text);
  if (bold) {
    await page.keyboard.press("Control+b");
    await page.keyboard.type(bold);
    await page.keyboard.press("Control+b");
  }
}

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
  await page.waitForSelector(".composer[data-ready]", { state: "attached" });
  await page.getByLabel("Headline").fill("New badges from Monday");
  await type("Your new badge opens ", { bold: "both doors" });
  await page.keyboard.type(".");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- Collect it at the desk");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Return the old one");
  expect(await page.locator("#body strong", { hasText: "both doors" }).isVisible(), "bold shows as it is typed");
  expect(await page.locator("#body ul li").count() === 2, "a list from the toolbar's rules");
  await page.locator(".side-card input[type=file]").first().setInputFiles(cover);
  await page.waitForSelector(".cover-preview img", { timeout: 8000 });
  await page.locator("label", { hasText: "Attach a file" }).locator("input").setInputFiles(tmp + "/badge-rules.txt");
  await page.waitForSelector(".file-list li:has-text('badge-rules.txt')", { timeout: 8000 });
  await page.getByLabel("Important").check();
  await page.getByRole("button", { name: "Publish and tell 6 people by bell and email" }).click();
  await page.waitForURL(/\/chest\/posts\/\d+$/u);
  expect(await page.locator(".ck-toast", { hasText: "Telling 6 people in 10 seconds" }).locator(".ck-toast-undo").isVisible(), "the Undo toast");
  expect(await page.locator(".prose strong", { hasText: "both doors" }).isVisible() && await page.locator(".prose li").count() >= 2, "kept as formatted");
  expect(await page.getByRole("heading", { name: "New badges from Monday" }).isVisible(), "the article");
  const width = await page.locator(".cover img").evaluate(img => img.naturalWidth);
  expect(width > 0, "the cover shows");
  const href = await page.getByRole("link", { name: "badge-rules.txt", exact: true }).getAttribute("href");
  expect((await (await page.request.get(origin + href)).text()).startsWith("Badges open"), "the file opens");
});
const badgesUrl = page.url();

await step("after 10 seconds, everyone is told in their bell and by email, in their language", async () => {
  expect(!(await dev()).includes("Important: New badges from Monday"), "nothing sent during the Undo seconds");
  await page.waitForSelector(".ck-toast.ck-toast-sent:has-text('Sent.')", { timeout: 15000 });
  expect(!(await page.locator(".ck-toast", { hasText: "Sent." }).locator(".ck-toast-undo").count()), "once sent, no Undo");
  const text = await dev();
  expect(has(text, `<b>Important${sp}: New badges from Monday</b>`) && text.includes("<b>Important: New badges from Monday</b>"), "emails in both languages");
  expect(has(text, `Important${sp}: New badges from Monday`), "French bell for Inès");
  expect(text.includes("Important: New badges from Monday"), "English bell for Hugo");
});

await step("a reader confirms from the front page; reacts and comments", async () => {
  await as(context, origin, "hugo");
  await page.goto(origin + "/chest");
  expect(!(await page.getByRole("link", { name: "Write a post" }).count()), "no Write button for a reader");
  await page.locator(".asks-you").getByRole("link", { name: "Read it" }).click();
  await page.waitForURL(/\/chest\/posts\/\d+$/u);
  await saved(() => page.getByRole("button", { name: "I have read it" }).click());
  await page.waitForSelector(".confirm-box.done");
  await saved(() => page.locator(".reaction", { hasText: "🎉" }).click());
  await page.getByLabel("Your comment").fill("Great, thanks!");
  await saved(() => page.getByRole("button", { name: "Comment", exact: true }).click());
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
  await page.waitForSelector(".ck-toast.ck-toast-sent:has-text('Reminder sent to 5 people')");
  const csv = await (await page.request.get(badgesUrl + "/confirmations")).text();
  expect(csv.includes("Hugo Bernard,Confirmed"), "csv confirmed row");
  expect(csv.includes("Not yet"), "csv pending rows");
  expect((await dev()).includes("Hugo Bernard a commenté"), "Camille is told of the comment, in French");
});

await step("events: a reader answers and takes it to their calendar", async () => {
  await as(context, origin, "ines");
  await speak("fr");
  await page.goto(origin + "/chest/posts/3");
  await saved(() => page.getByRole("button", { name: "Je viens", exact: true }).click());
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
  await page.waitForSelector(".composer[data-ready]", { state: "attached" });
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
  await page.locator(".ck-toast").getByRole("button", { name: "Undo" }).click();
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

let salesUrl = "";
await step("a publisher writes for one team only; nobody else sees it, is told or counted", async () => {
  await as(context, origin, "camille");
  await speak("en");
  await compose();
  await page.getByLabel("Headline").fill("Sales bonus: the new rules");
  await type("From October, the bonus is paid ", { bold: "every quarter" });
  await page.getByLabel("Some groups or people").check();
  await page.getByRole("button", { name: "Publish for 0 people" }).click();
  expect((await page.locator("#form-error").innerText()).includes("Choose at least one group"), "a group is needed");
  await page.locator(".audience-groups label", { hasText: "Sales" }).locator("input").check();
  expect((await page.locator("#audience-count").innerText()).includes("2 people can see it"), "the count follows");
  await page.getByLabel("Important").check();
  await page.getByRole("button", { name: "Publish and tell 2 people by bell and email" }).click();
  await page.waitForURL(/\/chest\/posts\/\d+$/u);
  salesUrl = page.url();
  await page.waitForSelector(".ck-toast.ck-toast-sent:has-text('Sent.')", { timeout: 15000 });
  await page.reload();
  expect((await page.locator(".notices").innerText()).includes("Only for Sales: nobody else sees this post."), "the audience is said");
  expect(/Read by 0 of 2/u.test(await page.locator(".readers h2").innerText()), "counted on Sales only");
  const bell = await dev();
  expect(bell.includes("Hugo Bernard</b> · Important: Sales bonus"), "Hugo (Sales) is told");
  expect(!has(bell, `Léa Dubois</b> · Important${sp}: Sales bonus`) && !bell.includes("Tom Walker</b> · Important: Sales bonus"), "Tech is not told");
  await as(context, origin, "lea");
  await page.goto(origin + "/chest");
  expect(!(await page.locator("main").innerText()).includes("Sales bonus"), "not on Léa's front page");
  expect((await page.request.get(salesUrl)).status() === 404, "not found for Léa");
  await as(context, origin, "hugo");
  await speak("en");
  await page.goto(origin + "/chest");
  expect((await page.locator(".story", { hasText: "Sales bonus" }).locator(".flag.audience").innerText()).toLowerCase().includes("for sales"), "Hugo sees it, marked For Sales");
});

await step("search: one box, accents and case aside, words marked, only what one may see", async () => {
  await as(context, origin, "hugo");
  await speak("en");
  await page.goto(origin + "/chest");
  await page.locator("#top-search").fill("bikes");
  await page.locator("#top-search").press("Enter");
  await page.waitForURL(/\/chest\/search\?q=bikes/u);
  expect((await page.locator(".result mark").allTextContents()).includes("bikes"), "the word is marked");
  expect((await page.locator(".result-comments").innerText()).includes("Inès Moreau"), "found in a comment, with its author");
  await page.locator(".result-comments a").first().click();
  await page.waitForURL(/\/chest\/posts\/4#comment-\d+$/u);
  await page.goto(origin + "/chest/search?q=objectifs+BONUS");
  expect((await page.locator("main").innerText()).includes("Nothing found"), "every word must be there");
  await page.goto(origin + "/chest/search?q=bonus");
  expect((await page.locator(".result .headline").allTextContents()).some(t => t.includes("Sales bonus")), "Hugo finds the Sales post");
  await as(context, origin, "lea");
  await speak("fr");
  await page.goto(origin + "/chest/search?q=DEMENAGEMENT");
  expect((await page.locator(".result mark").allTextContents()).includes("déménagement"), "accents and case aside");
  await page.goto(origin + "/chest/search?q=bonus");
  expect((await page.locator("main").innerText()).includes("Rien trouvé"), "Léa finds nothing of Sales");
  // A comment that mentions someone reads their name, never the stored token.
  await page.goto(origin + "/chest/search?q=plantes");
  const comments = page.locator(".result-comments");
  const said = await comments.innerText();
  expect(said.includes("@Sofia Rossi, qui s’occupe du déménagement des plantes"), "the mention reads as a name: " + said);
  expect(!/mbr_|@\[/u.test(await comments.innerHTML()), "no member id in the passage");
  expect((await comments.locator("mark").allTextContents()).includes("plantes"), "the word found still marked");
});

await step("the weekly digest: one item per person, in their language, never doubled, gone once they come", async () => {
  const count = text => (text.match(/Nora Petit<\/b> · Cette semaine[ \u00a0\u202f]: \d+ publications? que vous n’avez pas encore vues?/gu) ?? []).length;
  await page.request.post(origin + "/_dev/schedule", { form: { name: "digest" } });
  expect(count(await dev()) === 1, "Nora (French) has her digest");
  await page.request.post(origin + "/_dev/schedule", { form: { name: "digest" } });
  expect(count(await dev()) === 1, "delivered again: still one");
  expect(!(await dev()).includes("Tom Walker</b> · This week: 1 post you haven’t seen yet<br><small>Sales"), "no Sales post for Tech");
  await as(context, origin, "nora");
  await page.goto(origin + "/chest");
  expect(count(await dev()) === 0, "Nora came: it is withdrawn");
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
  // The confirm strip is right under the headline: in the first screen,
  // above the cover picture.
  const strip = await page.locator(".confirm-box").boundingBox();
  const cover = (await page.locator(".cover").count()) ? await page.locator(".cover").boundingBox() : null;
  expect(strip && strip.y + strip.height <= 844 && (!cover || strip.y < cover.y), "confirm strip in the first screen, above the picture: " + JSON.stringify(strip));
  await saved(() => page.getByRole("button", { name: "Je l’ai lue" }).click());
  await page.waitForSelector(".confirm-box.done");
  width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width <= 392, "article width " + width);
  // The header's search has a row of its own on a phone.
  await page.getByRole("searchbox", { name: "Rechercher dans les Actualités" }).fill("déménagement plantes");
  await page.getByRole("searchbox", { name: "Rechercher dans les Actualités" }).press("Enter");
  await page.waitForURL(/\/chest\/search\?q=/u);
  await page.waitForSelector(".result mark");
  width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width <= 392, "search width " + width);
  await as(context, origin, "camille");
  await compose("/chest/new?kind=event");
  width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width <= 392, "composer width " + width);
  // On a phone the actions follow the form: they never sit over the text.
  expect(await page.locator(".composer-bar").evaluate(e => getComputedStyle(e).position) === "static", "phone bar not sticky");
  await page.getByLabel("Titre").fill("Apéro sur la terrasse");
  await page.getByLabel("Lieu").fill("Terrasse, 3e étage");
  await page.getByLabel("Début").selectOption("18:30");
  await page.getByRole("button", { name: "Publier" }).click();
  await page.waitForURL(/\/chest\/posts\/\d+$/u);
  expect((await page.locator(".event-box").innerText()).includes("Terrasse"), "event published");
});

await step("Undo within 10 seconds: nothing leaves, the post is back in the composer", async () => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await as(context, origin, "sofia");
  await speak("en");
  const before = (await dev()).split("Oops: wrong date").length;
  await compose();
  await page.getByLabel("Headline").fill("Oops: wrong date");
  await type("The party is on the 32nd.");
  await page.getByLabel("Important").check();
  await page.getByRole("button", { name: /^Publish and tell \d+ people/u }).click();
  await page.waitForURL(/\/chest\/posts\/\d+$/u);
  await page.locator(".ck-toast").getByRole("button", { name: "Undo" }).click();
  await page.waitForURL(/\/chest\/new$/u);
  // The draft comes back from this browser once the composer is running.
  await page.locator(".notice", { hasText: "Your draft is back" }).waitFor();
  expect(await page.getByLabel("Headline").inputValue() === "Oops: wrong date", "the draft is back");
  await page.waitForTimeout(11000);
  expect((await dev()).split("Oops: wrong date").length === before, "no bell, no email");
  await page.getByRole("button", { name: "Start over" }).click();
});

await step("hand-picked people, and any group of the Chest", async () => {
  await as(context, origin, "camille");
  await compose();
  await page.getByLabel("Headline").fill("Client visit: who comes");
  await page.getByLabel("Some groups or people").check();
  // The kit's people picker: type the start of a name, choose in the list.
  await page.locator("#people-search").fill("lé");
  await page.getByRole("option", { name: /Léa Dubois/u }).click();
  await page.locator("#people-search").fill("Tom");
  await page.getByRole("option", { name: /Tom Walker/u }).click();
  expect((await page.locator(".people-picker").innerText()).includes("Léa Dubois"), "chosen people shown as chips");
  await page.getByRole("button", { name: "Publish for 2 people" }).click();
  await page.waitForURL(/\/chest\/posts\/\d+$/u);
  const url = page.url();
  expect((await page.locator(".notices").innerText()).includes("Only for 2 people"), "said on the post");
  await as(context, origin, "hugo");
  expect((await page.request.get(url)).status() === 404, "Hugo does not see it");
  await as(context, origin, "tom");
  expect((await page.request.get(url)).status() === 200, "Tom does");
  // Tech is a group of the Chest: offered even though News is open to all.
  await as(context, origin, "camille");
  await compose();
  await page.getByLabel("Some groups or people").check();
  expect(await page.locator(".audience-groups label", { hasText: "Tech" }).isVisible(), "every group offered");
});

await step("two languages: each reader sees theirs", async () => {
  await compose();
  await page.getByLabel("Headline").fill("Canteen closed on Friday");
  await type("Bring your lunch.");
  await page.getByRole("button", { name: "Add a version in French" }).click();
  await page.getByLabel("Headline").fill("Cantine fermée vendredi");
  await type("Apportez votre déjeuner.");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.waitForURL(/\/chest\/posts\/\d+$/u);
  const url = page.url();
  await as(context, origin, "ines");
  await speak("fr");
  await page.goto(url);
  expect((await page.locator("#headline").innerText()) === "Cantine fermée vendredi", "Inès reads French");
  await page.getByRole("link", { name: "Read in English" }).click();
  expect((await page.locator("#headline").innerText()) === "Canteen closed on Friday", "and may read the English one");
});

await step("an event with places: a waiting list, and the Chest's calendar", async () => {
  await as(context, origin, "hugo");
  await speak("en");
  await page.goto(origin + "/chest/posts/9");
  expect((await page.locator(".seats").innerText()).includes("3 of 3 places taken"), "full");
  await saved(() => page.getByRole("button", { name: "Join the waiting list" }).click());
  await page.waitForSelector(".ck-toast:has-text('waiting list')");
  await as(context, origin, "lea");
  await page.goto(origin + "/chest/posts/9");
  await saved(() => page.getByRole("button", { name: /I’m coming/u }).click());
  const panel = await dev();
  expect(panel.includes("event:9") && panel.includes("Nora Petit"), "Nora (first waiting) got the place and the calendar");
  expect(panel.includes("Une place est à vous"), "and was told");
  await as(context, origin, "camille");
  await page.goto(origin + "/chest/posts/3");
  expect(await page.getByRole("link", { name: "It’s in your Chest calendar" }).isVisible(), "the calendar link for those coming");
});

await step("replies and mentions", async () => {
  await as(context, origin, "hugo");
  await page.goto(origin + "/chest/posts/4");
  await page.locator(".comment", { hasText: "bikes" }).getByRole("button", { name: "Reply" }).click();
  const box = page.getByLabel("Reply to Inès Moreau");
  await box.fill("Thanks! @Sof");
  await page.locator(".suggestions button", { hasText: "Sofia Rossi" }).click();
  await box.pressSequentially("will you check?");
  await saved(() => page.locator(".reply-form").getByRole("button", { name: "Reply", exact: true }).click());
  // Wait for the saved reply itself, not a fixed time: then read it again from the server.
  await page.locator(".comment.reply", { hasText: "Thanks! @Sofia Rossi will you check?" }).waitFor();
  await page.reload();
  const mention = page.locator(".comment.reply .mention", { hasText: "@Sofia Rossi" });
  await mention.waitFor({ timeout: 10_000 }).catch(() => {});
  expect(await mention.isVisible(), "the mention shows as a name");
  const panel = await dev();
  expect(panel.includes("Hugo Bernard mentioned you"), "Sofia is told");
  expect(panel.includes("Hugo Bernard vous a répondu"), "Inès is told of the reply, in French");
});

await step("a changed Important text: its earlier version kept, everyone asked again", async () => {
  await as(context, origin, "camille");
  await page.goto(origin + "/chest/posts/4/edit");
  await page.waitForSelector(".composer[data-ready]", { state: "attached" });
  await page.locator("#body").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" Parking opens on 3 November.");
  await page.getByLabel("Ask everyone to confirm again").check();
  await page.getByRole("button", { name: /^Save and tell \d+ people/u }).click();
  await page.waitForURL(/\/chest\/posts\/4$/u);
  expect(/Read by 0 of 6/u.test(await page.locator(".readers h2").innerText()), "counted again");
  expect((await page.locator(".readers").innerText()).includes("confirmed an earlier version"), "earlier confirmations said");
  await page.locator(".history summary").click();
  expect((await page.locator(".history").innerText()).includes("Version 2"), "earlier versions kept");
  expect((await page.locator(".reach").innerText()).includes("Sent by email"), "reach, counts only");
});

await step("schedule from the bar, next to Publish", async () => {
  await compose();
  await page.getByLabel("Headline").fill("Monday meeting moved");
  await page.getByRole("button", { name: "Schedule…" }).click();
  await page.locator("#later-time").selectOption("08:30");
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await page.waitForURL(/\/chest\/posts\/\d+$/u);
  expect((await page.locator(".notices").innerText()).includes("Scheduled for"), "scheduled");
});

await step("a day before today is refused out loud: nothing is scheduled for the day it held before", async () => {
  // The kit's DateField (0.2.4): a day before `min` stays as typed, the
  // field says why, and Schedule waits — it once sent the previous day.
  const iso = offset => { const d = new Date(); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
  const past = iso(-3);
  const later = iso(5);
  await compose();
  await page.getByLabel("Headline").fill("Car park closed for works");
  await page.getByRole("button", { name: "Schedule…" }).click();
  await page.locator("#later-day").fill(past);
  let sent = 0;
  const count = r => { if (r.method() === "POST" && r.url().startsWith(origin + "/chest")) sent++; };
  page.on("request", count);
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await page.locator(".when-fields .ck-error", { hasText: /or later\./u }).waitFor();
  await page.locator("#form-error", { hasText: /or later\./u }).waitFor();
  await page.waitForTimeout(800);
  page.off("request", count);
  expect(sent === 0, "nothing sent: " + sent);
  expect(/\/chest\/new$/u.test(page.url()), "still writing: " + page.url());
  expect(await page.locator("#later-day").inputValue() === past, "the day stays as typed");
  expect(await page.locator("#later-day").getAttribute("aria-invalid") === "true", "the field is invalid");
  expect(await page.evaluate(() => document.activeElement?.id === "later-day"), "the day field has the focus");
  // Ctrl+Enter waits too.
  await page.locator("#later-day").press("Control+Enter");
  await page.waitForTimeout(800);
  expect(/\/chest\/new$/u.test(page.url()), "Ctrl+Enter sends nothing either");
  // A good day: scheduled for that day, not the one held before.
  await page.locator("#later-day").fill(later);
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await page.waitForURL(/\/chest\/posts\/\d+$/u);
  const notice = await page.locator(".notices").innerText();
  const said = new Date(later + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
  expect(notice.includes("Scheduled for") && notice.includes(said), `scheduled for ${said}: ${notice}`);
});

await step("import a Slack channel, take it back; download all posts", async () => {
  const fixture = new URL("../../../tools/private/news/test/fixtures/slack-export-viewer-testarchive.zip", import.meta.url).pathname;
  await page.goto(origin + "/chest/transfer");
  await page.locator(".transfer input[type=file]").setInputFiles(fixture);
  await page.waitForSelector(".channels");
  await page.getByLabel(/#enrique/u).check();
  await page.getByRole("button", { name: "Import 30 messages" }).click();
  await page.waitForSelector(".ck-toast:has-text('30 posts imported')");
  const found = async () => (await (await page.request.get(origin + "/chest/search?q=setup+installed")).text()).includes('class="result"');
  expect(await found(), "the imported messages are posts");
  await page.locator(".ck-toast").getByRole("button", { name: "Undo" }).click();
  await page.waitForSelector(".ck-toast[data-phase=undone]");
  expect(!(await found()), "taken back: none of them left");
  const zip = await page.request.get(origin + "/chest/transfer/export");
  expect(zip.status() === 200 && (zip.headers()["content-type"] ?? "").includes("zip") && (await zip.body()).length > 1000, "the ZIP");
});

await step("the weekly digest email can be turned off", async () => {
  await as(context, origin, "hugo");
  await page.goto(origin + "/chest");
  await page.getByRole("button", { name: "Stop the email" }).click();
  await page.waitForSelector(".ck-toast:has-text('No more weekly email')");
  await page.reload();
  expect(await page.getByRole("button", { name: "Also by email" }).isVisible(), "kept");
});

await step("views are a number only, from 5; events ask when and where under the headline; the bar never covers the side", async () => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await as(context, origin, "camille");
  await speak("en");
  await page.goto(origin + "/chest/posts/1");
  const reach = await page.locator(".reach").innerText();
  expect(/Opened by 6 of the 6 people it is for/u.test(reach) && reach.includes("Counted every hour"), "views of post 1: " + reach);
  expect(!/opened News since/u.test(reach), "the old line is gone");
  expect(!/Hugo|Inès|Léa|Nora|Tom|Sofia/u.test(reach), "never who");
  await page.goto(origin + "/chest/posts/6");
  expect((await page.locator(".reach").innerText()).includes("Fewer than 5"), "below the floor: not shown");
  // The drop cap only on a whole first word of 4 letters or more.
  await page.goto(origin + "/chest/posts/3");
  expect(await page.locator(".article .prose.drop-cap").count() === 0, "no drop cap on “Let’s”");
  await page.goto(origin + "/chest/posts/4");
  expect(await page.locator(".article .prose.drop-cap").count() === 1, "a drop cap on “After”");
  // The composer: an event's day, time and place right under the headline,
  // in the first screen; the sticky bar only under the text column.
  await compose("/chest/new?kind=event");
  const title = await page.locator("#title").boundingBox();
  const day = await page.locator("#event-day").boundingBox();
  const place = await page.locator("#event-place").boundingBox();
  const body = await page.locator("#body").boundingBox();
  expect(day.y > title.y && place.y < body.y, "when and where between headline and text");
  expect(place.y + place.height <= 860, "the place is in the first screen: " + place.y);
  const bar = await page.locator(".composer-bar").boundingBox();
  const side = await page.locator(".composer-side").boundingBox();
  expect(bar.x + bar.width <= side.x, "the bar stops before the right column");
});

await step("round 3: search in the reader's language; an empty search suggests the other language", async () => {
  await as(context, origin, "camille");
  await speak("fr");
  await page.goto(origin + "/chest/search?q=" + encodeURIComponent("déménager"));
  const first = await page.locator(".result .headline").first().innerText();
  expect(first === "Nous déménageons le 2 novembre", "the French headline for a French reader: " + first);
  expect((await page.locator(".result .headline mark").allTextContents()).includes("déménageons"), "the stem is marked");
  await page.goto(origin + "/chest/search?q=secourisme");
  const empty = await page.locator("main").innerText();
  expect(has(empty, `Certaines publications ne sont écrites qu’en anglais${sp}: essayez aussi le mot en anglais`), "suggests English: " + empty);
  await page.goto(origin + "/chest/search?q=" + encodeURIComponent("first aid"));
  expect((await page.locator(".result .headline").first().innerText()).includes("First-aid training"), "and the English word finds it");
});

await step("round 3: a reader shares a shout-out with a picture; only publishers see it until one publishes it; the author and the colleague are told", async () => {
  const photo = tmp + "/news-site.png";
  await picture(photo, 30);
  await as(context, origin, "hugo");
  await speak("en");
  await page.goto(origin + "/chest");
  await page.getByRole("link", { name: "Share something" }).first().click();
  await page.waitForURL(/\/chest\/propose$/u);
  expect(await page.getByLabel("Thank a colleague").isChecked(), "a shout-out first");
  await page.locator("#colleague").fill("Nor");
  await page.getByRole("option", { name: /Nora Petit/u }).click();
  expect((await page.getByLabel("Headline").inputValue()) === "Thank you, Nora!", "the headline follows the colleague");
  await page.getByLabel("A few words").fill("SITEPHOTO Nora redrew the whole wayfinding in one night.");
  await page.locator(".propose-form input[type=file]").setInputFiles(photo);
  await page.waitForSelector(".cover-preview img", { timeout: 8000 });
  await saved(() => page.getByRole("button", { name: "Send to the publishers" }).click());
  await page.waitForSelector(".ck-toast:has-text('A publisher will check it')");
  expect((await page.locator(".proposals-mine").innerText()).includes("Waiting for a publisher"), "listed as waiting");
  // Before a publisher: not a post — nobody's front page or search; Léa cannot open the list or the picture.
  const picture1 = await page.locator(".cover-preview img").count() === 0;
  expect(picture1, "the form is empty again");
  await as(context, origin, "lea");
  await speak("fr");
  expect((await page.request.get(origin + "/chest/proposals")).status() === 404, "the list is the publishers'");
  await page.goto(origin + "/chest/search?q=SITEPHOTO");
  expect((await page.locator("main").innerText()).includes("Rien trouvé"), "not found before approval");
  await speak("en");
  await as(context, origin, "sofia");
  await page.goto(origin + "/chest/search?q=SITEPHOTO");
  expect((await page.locator("main").innerText()).includes("Nothing found"), "not a post for publishers either");
  await page.goto(origin + "/chest");
  const strip = await page.locator(".asks-you.approve").innerText();
  expect(strip.includes("2 posts from colleagues wait for your approval"), strip);
  await page.locator(".asks-you.approve").getByRole("link", { name: "Review" }).click();
  await page.waitForURL(/\/chest\/proposals$/u);
  const card = page.locator(".proposal", { hasText: "Thank you, Nora!" });
  expect((await card.innerText()).includes("Thanks Nora Petit") && (await card.innerText()).includes("Proposed by Hugo Bernard"), "who and for whom");
  const cover = await card.locator(".proposal-cover").getAttribute("src");
  await as(context, origin, "lea");
  expect((await page.request.get(origin + cover)).status() === 404, "Léa cannot open the picture");
  await as(context, origin, "sofia");
  await saved(() => card.getByRole("button", { name: "Publish" }).click());
  await page.waitForSelector(".ck-toast:has-text('Published. Its author is told.')");
  await page.goto(origin + "/chest?kind=shoutout");
  expect((await page.locator(".story .headline").allTextContents()).includes("Thank you, Nora!"), "on the front page, under Shout-outs");
  const panel = await dev();
  expect(panel.includes("Your post is on News: “Thank you, Nora!”"), "Hugo is told");
  expect(panel.includes("Hugo Bernard vous remercie dans les Actualités"), "Nora is told, in French");
  // Léa's news is declined with a reason; she is told; Undo puts it back.
  await page.goto(origin + "/chest/proposals");
  const lea = page.locator(".proposal", { hasText: "Le chantier de Villeurbanne est livré" });
  await lea.getByRole("button", { name: "Decline" }).click();
  await page.getByLabel(/Why\? \(optional, Léa Dubois reads it\)/u).fill("Déjà dans la lettre de lundi.");
  await saved(() => lea.getByRole("button", { name: "Decline" }).click());
  await page.waitForSelector(".ck-toast:has-text('Declined. Its author is told.')");
  expect(has(await dev(), `Votre publication n’a pas été publiée${sp}:`), "Léa is told");
  await saved(() => page.locator(".ck-toast", { hasText: "Declined" }).locator(".ck-toast-undo").click());
  await page.waitForSelector(".proposal:has-text('Le chantier de Villeurbanne est livré')");
});

await step("round 3: “I’m coming” in one tap from the email of an Important event — for that person only, with Undo", async () => {
  await as(context, origin, "camille");
  await speak("en");
  await compose("/chest/new?kind=event");
  await page.getByLabel("Headline").fill("Farewell drinks for Tom");
  await page.getByLabel("Important").check();
  await page.getByRole("button", { name: /^Publish and tell \d+ people by bell and email$/u }).click();
  await page.waitForURL(/\/chest\/posts\/\d+$/u);
  const post = new URL(page.url()).pathname;
  await page.waitForSelector(".ck-toast.ck-toast-sent", { timeout: 15000 });
  const panel = await dev();
  const letter = panel.split("<li>").find(li => li.includes("Important: Farewell drinks for Tom") && li.includes("hugo@example.test")) ?? "";
  const link = /I’m coming: (\S+?)(?:\s|&lt;|<)/u.exec(letter)?.[1]?.replaceAll("&amp;", "&") ?? "";
  expect(new RegExp(`${post}/answer\\?a=yes&t=[A-Za-z0-9_-]{32}$`, "u").test(link), "the email carries the link: " + link);
  expect(letter.includes("Not coming: "), "and the other answer");
  const path = new URL(link).pathname + new URL(link).search;
  await as(context, origin, "hugo");
  await page.goto(origin + path);
  await page.waitForURL(u => u.pathname === post && u.search === "");
  await page.waitForSelector(".ck-toast:has-text('You’re coming.')");
  expect(await page.locator(".rsvp button[aria-pressed=true]", { hasText: "I’m coming" }).isVisible(), "answered");
  await saved(() => page.locator(".ck-toast", { hasText: "You’re coming." }).locator(".ck-toast-undo").click());
  await page.reload();
  expect(!(await page.locator(".rsvp button[aria-pressed=true]").count()), "Undo took the answer back");
  // Léa opens Hugo's link: nothing changes for anyone.
  await as(context, origin, "lea");
  await speak("fr");
  await page.goto(origin + path);
  await page.waitForSelector(".ck-toast:has-text('Ce lien n’a pas été écrit pour vous')");
  expect(!(await page.locator(".rsvp button[aria-pressed=true]", { hasText: "Je viens" }).count()), "Léa is not answered for");
});

await step("pass 4: a post published 19 days ago, made Important now, is told to its audience then, once", async () => {
  await as(context, origin, "camille");
  await speak("en");
  const subject = "Important: The Wi-Fi password changes on Monday";
  expect(!(await dev()).includes(subject), "nobody told before");
  await page.goto(origin + "/chest/posts/2/edit");
  await page.waitForSelector(".composer[data-ready]", { state: "attached" });
  await page.getByLabel("Important").check();
  await page.getByRole("button", { name: /^Save and tell \d+ people/u }).click();
  await page.waitForURL(/\/chest\/posts\/2$/u);
  // The next pass (the front page opened, or the publish schedule) tells.
  await page.goto(origin + "/chest");
  const panel = await dev();
  const letters = panel.split("<li>").filter(li => li.includes(subject) && li.includes("@example.test"));
  expect(letters.length > 0, "emailed now");
  expect(panel.includes("hugo@example.test") && letters.some(li => li.includes("hugo@example.test")), "Hugo emailed");
  // Once: another pass sends nothing more.
  await page.goto(origin + "/chest");
  const after = (await dev()).split("<li>").filter(li => li.includes(subject) && li.includes("@example.test"));
  expect(after.length === letters.length, `emailed once (${letters.length} then ${after.length})`);
  await page.goto(origin + "/chest/posts/2");
  expect(/Read by 0 of \d+/u.test(await page.locator(".readers h2").innerText()), "asked to confirm");
});

await step("round 3: an empty front page: no empty band, one import link; a reader is told whom to ask and may share something", async () => {
  // Every post out of sight for this step (the screenshots, taken after the flows, get them back).
  const sql = postgres("postgres://t_news:dev@127.0.0.1:5432/t_news", { max: 1, onnotice: () => {} });
  const hidden = (await sql`update posts set deleted_at = now() where deleted_at is null returning id`).map(r => r.id);
  await as(context, origin, "hugo");
  await speak("en");
  await page.goto(origin + "/chest");
  const body = await page.locator(".ck-empty").innerText();
  expect(body.includes("To publish one, ask Sofia Rossi or Camille Martin."), "names the publishers: " + body);
  expect(await page.locator(".ck-empty").getByRole("link", { name: "Share something" }).isVisible(), "and offers to share");
  const rule = await page.locator(".digest-switch").evaluate(el => getComputedStyle(el).borderTopStyle);
  expect(rule === "none", "no second rule under the empty state: " + rule);
  await as(context, origin, "sofia");
  await page.goto(origin + "/chest");
  expect(await page.getByRole("link", { name: /Import/u }).count() === 1, "one Slack import link");
  await sql`update posts set deleted_at = null where id in ${sql(hidden)}`;
  await sql.end();
});

await browser.close();
done(problems);
