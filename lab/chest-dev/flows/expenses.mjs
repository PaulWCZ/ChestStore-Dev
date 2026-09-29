// Expenses, as people use it, in a real browser: node lab/chest-dev/flows/expenses.mjs [port]
// (the harness runs the tool with --reset: the sample month is there).
// Hugo (employee, English) on a phone after lunch; Inès (approver, French);
// Camille (accountant, French) pays and exports; Tom and Nora are refused.
import { as, done, expect, open, step } from "./lib.mjs";

const port = Number(process.argv[2] ?? 4900);
const { browser, context, page, origin, problems } = await open(port, "hugo", { viewport: { width: 390, height: 844 }, allow404: /\/chest\/expenses\/1$|\/chest\/receipts\/\d+\?size=256$/u });
const tmp = process.env.TMPDIR ?? "/tmp";

// A photo of a till receipt, drawn by the browser itself.
const receipt = tmp + "/expenses-receipt.png";
{
  const p = await context.newPage();
  await p.setViewportSize({ width: 360, height: 560 });
  await p.setContent(`<body style="margin:0;background:#8a8d91;display:grid;place-items:center;height:560px"><div style="width:280px;background:#fbfaf6;padding:22px;font:15px/1.5 monospace;color:#222;transform:rotate(-2deg);box-shadow:0 8px 24px #0005">
    <div style="text-align:center;font-weight:bold;font-size:18px">CAFÉ KITSUNÉ</div><div style="text-align:center">51 Galerie de Montpensier<br>75001 Paris</div><hr style="border:0;border-top:2px dashed #999">
    <div>28/09/2026 13:42 · Table 4</div><div>2 x Plat du jour ..... 36,00</div><div>2 x Café ............ 5,00</div><hr style="border:0;border-top:2px dashed #999">
    <div style="font-weight:bold;font-size:18px">TOTAL TTC ....... 41,00 €</div><div>dont TVA 10% ....... 3,73</div><div style="text-align:center;margin-top:10px">MERCI !</div></div></body>`);
  await p.screenshot({ path: receipt });
  await p.close();
}

await step("phone: Hugo snaps the receipt, types the amount, picks Meals, saves", async () => {
  await page.goto(origin + "/chest");
  await page.locator(".dock").getByRole("link", { name: "Add an expense" }).click();
  await page.waitForURL(/\/chest\/new$/u);
  await page.locator(".capture .shoot input[type=file]").setInputFiles(receipt);
  await page.waitForSelector("text=Receipt added", { timeout: 8000 });
  // The receipt card fits the phone: nothing pushed off-screen.
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(wide <= 0, `the page scrolls sideways by ${wide}px once the receipt is added`);
  expect(await page.getByText("Remove", { exact: true }).isVisible(), "Remove visible");
  await page.waitForFunction(() => document.activeElement?.id === "amount", null, { timeout: 3000 }); // the amount, next
  await page.locator("#amount").fill("41,00");
  await page.getByText("Meals", { exact: true }).click();
  await page.locator("#merchant").fill("Café Kitsuné");
  await page.getByText("VAT and note").click();
  await page.getByRole("button", { name: "10 %" }).click();
  expect((await page.locator("#vat").inputValue()) === "3.73", "VAT from the rate: " + (await page.locator("#vat").inputValue()));
  await page.locator("#note").fill("Lunch with Mme Garnier");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForURL(/\/chest$/u);
  await page.waitForSelector(".toast");
  const text = await page.locator("main").innerText();
  expect(text.includes("Café Kitsuné") && text.includes("€41.00"), "in the drafts");
  const thumb = page.locator(".row", { hasText: "Café Kitsuné" }).locator("img.thumb");
  expect(await thumb.count() === 1, "thumbnail shown");
  await page.waitForFunction(() => [...document.querySelectorAll("img.thumb")].some(img => img.complete && img.naturalWidth > 0), null, { timeout: 8000 });
});

await step("the receipt opens, byte for byte, through a fresh link", async () => {
  await page.locator(".row", { hasText: "Café Kitsuné" }).locator("a.main").click();
  await page.waitForURL(/\/chest\/expenses\/\d+$/u);
  const href = await page.getByRole("link", { name: "Download" }).getAttribute("href");
  const r = await page.request.get(origin + href);
  const { readFileSync } = await import("node:fs");
  expect(Buffer.compare(Buffer.from(await r.body()), readFileSync(receipt)) === 0, "same bytes");
});

await step("a car trip: the scale's amount shows live, round trip doubles it", async () => {
  await page.goto(origin + "/chest/new?trip=1");
  await page.locator("#from").fill("Office, Paris");
  await page.locator("#to").fill("Versailles, client");
  await page.locator("#distance").fill("21");
  await page.getByText("Return trip").click();
  await page.waitForTimeout(200);
  const estimate = await page.locator(".estimate .amount").innerText();
  // 5 CV car, 350 + 180 km earlier this year: 42 km × 0.636.
  expect(estimate === "€26.71", "estimate " + estimate);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForURL(/\/chest$/u);
  expect((await page.locator("main").innerText()).includes("Office, Paris → Versailles, client"), "trip in the drafts");
});

await step("delete a draft, then undo", async () => {
  await page.locator(".row", { hasText: "Chez Janou" }).locator("a.main").click();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.waitForURL(/\/chest$/u);
  expect(!(await page.locator("main").innerText()).includes("Chez Janou"), "gone");
  await page.locator(".toast button").click();
  await page.waitForTimeout(1200);
  await page.reload();
  expect((await page.locator("main").innerText()).includes("Chez Janou"), "back after undo");
});

await step("send the drafts to Inès in one tap", async () => {
  await page.locator(".row", { hasText: "Chez Janou" }).locator("input.pick").uncheck();
  await page.getByRole("button", { name: /^Send 3 expenses$/u }).click();
  await page.waitForSelector("text=3 expenses sent to Inès Moreau.");
  await page.reload();
  const text = await page.locator("main").innerText();
  expect(text.includes("Waiting for Inès Moreau"), "waiting");
  expect(text.includes("Chez Janou"), "the unticked one stays a draft");
});

await step("Inès, in French: refuses the taxi without receipt, approves the rest of Hugo's", async () => {
  await as(context, origin, "ines");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(origin + "/chest/approve");
  const hugo = page.locator("section.paper", { hasText: "Hugo Bernard" });
  expect((await hugo.innerText()).includes("Pas de justificatif"), "warning in French");
  await hugo.getByRole("button", { name: /^Refuser.*G7 Taxi/u }).click();
  await hugo.getByPlaceholder("Pourquoi ? La personne lira ce message.").fill("Il manque le reçu du taxi : ajoutez une photo.");
  await hugo.getByRole("button", { name: "Refuser et renvoyer" }).click();
  await page.waitForSelector("text=Renvoyée à Hugo Bernard, avec votre motif.");
  await page.waitForTimeout(800);
  await page.locator("section.paper", { hasText: "Hugo Bernard" }).getByRole("button", { name: /^Tout valider/u }).click();
  await page.waitForTimeout(1500);
  await page.reload();
  expect(await page.locator("section.paper", { hasText: "Hugo Bernard" }).count() === 0, "nothing of Hugo waits");
  const dev = await (await page.request.get(origin + "/_dev")).text();
  expect(dev.includes("Inès Moreau refused an expense: G7 Taxi"), "refusal in Hugo's English");
  expect(/Inès Moreau approved 4 expenses/u.test(dev), "approval in English");
});

await step("Hugo: the refused taxi is not ticked and cannot go back as it was", async () => {
  await as(context, origin, "hugo");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/chest");
  const taxi = page.locator(".row", { hasText: "G7 Taxi" });
  expect((await taxi.innerText()).includes("Refused: Il manque le reçu du taxi"), "reason shown");
  expect(await taxi.locator("input.pick").count() === 0, "no tick on the refused taxi");
  expect((await taxi.innerText()).includes("Change it before sending it again"), "says what to do");
  expect(await page.getByRole("button", { name: /^Send 1 expense$/u }).count() === 1, "only Chez Janou would be sent");
});

await step("Hugo fixes the taxi (a photo of the receipt and a note), then sends it with Chez Janou", async () => {
  await page.locator(".row", { hasText: "G7 Taxi" }).getByRole("link", { name: /^Fix it/u }).click();
  await page.waitForURL(/\/edit$/u);
  await page.locator(".capture .pick-file input[type=file]").setInputFiles(receipt);
  await page.waitForSelector("text=Receipt added", { timeout: 8000 });
  if (!(await page.locator("#note").isVisible())) await page.getByText("VAT and note").click();
  await page.locator("#note").fill("Found the receipt in my coat");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForURL(/\/chest$/u);
  const taxi = page.locator(".row", { hasText: "G7 Taxi" });
  expect((await taxi.innerText()).includes("Changed: ready to send again"), "marked changed");
  expect(await taxi.locator("input.pick").isChecked(), "ticked again once changed");
  await page.getByRole("button", { name: /^Send 2 expenses$/u }).click();
  await page.waitForSelector("text=2 expenses sent to Inès Moreau.");
});

await step("Inès: “Approve all” leaves the taxi sent again after its refusal for a look of its own", async () => {
  await as(context, origin, "ines");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(origin + "/chest/approve");
  const hugo = page.locator("section.paper", { hasText: "Hugo Bernard" });
  const taxi = hugo.locator(".row", { hasText: "G7 Taxi" });
  expect((await taxi.innerText()).includes("Renvoyée après un refus : « Il manque le reçu du taxi"), "the line says it was refused before");
  expect((await hugo.innerText()).includes("1 a une alerte : regardez-la d’abord."), "says why it is left");
  await hugo.getByRole("button", { name: "Valider celle sans alerte" }).click();
  await page.waitForSelector("text=1 dépense validée.");
  await page.waitForTimeout(800);
  await page.reload();
  const left = page.locator("section.paper", { hasText: "Hugo Bernard" });
  expect((await left.innerText()).includes("G7 Taxi") && !(await left.innerText()).includes("Chez Janou"), "only the taxi waits");
  // Its receipt opens large from the list.
  await left.locator(".row", { hasText: "G7 Taxi" }).getByRole("button", { name: /^Justificatif de G7 Taxi/u }).click();
  await page.waitForSelector("dialog[open] img.lightbox");
  await page.waitForFunction(() => { const img = document.querySelector("dialog[open] img.lightbox"); return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0; }, null, { timeout: 8000 });
  await page.keyboard.press("Escape");
  await left.locator(".row", { hasText: "G7 Taxi" }).getByRole("button", { name: /^Valider/u }).click();
  await page.waitForSelector("text=1 dépense validée.");
});

await step("Camille pays Hugo back, undoes it, pays again", async () => {
  await as(context, origin, "camille");
  await page.goto(origin + "/chest/pay");
  const hugo = page.locator("section.paper", { hasText: "Hugo Bernard" });
  await hugo.getByRole("button", { name: "Marquer remboursé" }).click();
  await page.waitForSelector(".toast");
  await page.locator(".toast button").click();
  await page.waitForSelector("text=De retour dans « à rembourser ».");
  await page.reload();
  await page.locator("section.paper", { hasText: "Hugo Bernard" }).getByRole("button", { name: "Marquer remboursé" }).click();
  await page.waitForSelector(".toast");
  await page.waitForTimeout(1000);
  await page.reload();
  expect(await page.locator("section.paper", { hasText: "Hugo Bernard" }).count() === 0, "Hugo paid");
  const dev = await (await page.request.get(origin + "/_dev")).text();
  expect(dev.includes("Paid back:"), "Hugo told in English");
});

await step("the export: a French CSV and a ZIP of the receipts", async () => {
  await page.goto(origin + "/chest/export");
  const csvHref = await page.locator("a.download").first().getAttribute("href");
  const zipHref = await page.locator("a.download").nth(1).getAttribute("href");
  const csv = await (await page.request.get(origin + csvHref)).text();
  expect(csv.includes("Date;Personne;Catégorie") && csv.includes("Café Kitsuné;Lunch with Mme Garnier;37,27;3,73;3,73;41,00;EUR"), "CSV line");
  const zip = Buffer.from(await (await page.request.get(origin + zipHref)).body());
  expect(zip.subarray(0, 2).toString() === "PK" && zip.includes(Buffer.from("_Hugo-Bernard_41-00EUR_E")), "ZIP with Hugo's receipt");
});

await step("Camille names Inès as Léa's approver; Léa's trip waiting moves to her", async () => {
  await page.goto(origin + "/chest/settings");
  await page.getByLabel(/Validé par.*Léa Dubois/u).selectOption({ label: "Inès Moreau" });
  await page.waitForSelector("text=Enregistré. Ses dépenses en attente vont à Inès Moreau.");
  await as(context, origin, "ines");
  await page.goto(origin + "/chest/approve");
  expect((await page.locator("main").innerText()).includes("Léa Dubois"), "Léa's trip waits for Inès");
});

await step("the 25th: a reminder to those with drafts, in their language", async () => {
  await page.request.post(origin + "/_dev/schedule", { form: { name: "reminder" } });
  const dev = await (await page.request.get(origin + "/_dev")).text();
  expect(dev.includes("Send your expenses before the end of the month") && dev.includes("Envoyez vos notes de frais avant la fin du mois"), "reminders in English and French");
});

await step("rights: an employee cannot pay or see another's expense; no role, no tool", async () => {
  await as(context, origin, "tom");
  await page.goto(origin + "/chest/pay");
  expect((await page.locator("main").innerText()).includes("Your role does not allow this."), "pay refused");
  const r = await page.request.get(origin + "/chest/export/csv?month=2026-09");
  expect(r.status() === 403, "export refused " + r.status());
  await page.goto(origin + "/chest/expenses/1");
  expect((await page.locator("body").innerText()).includes("Nothing here"), "Hugo's expense hidden");
  await as(context, origin, "nora");
  await page.goto(origin + "/chest");
  expect((await page.locator("main").innerText()).includes("Tu ne peux") || (await page.locator("main").innerText()).includes("pas encore accès"), "no role");
});

await step("phone width: no page scrolls sideways", async () => {
  await as(context, origin, "camille");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/chest", "/chest/new", "/chest/new?trip=1", "/chest/approve", "/chest/pay", "/chest/export", "/chest/settings"]) {
    await page.goto(origin + path);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(wide <= 0, `${path} scrolls sideways by ${wide}px`);
  }
});

await browser.close();
done(problems);
