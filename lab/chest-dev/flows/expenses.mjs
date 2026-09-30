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
  // Nobody named yet: the form says it before the approver would.
  expect(await page.locator("#guest-missing").isVisible(), "the form warns that guests are not named");
  // Who was there: a colleague picked by name, a guest from outside typed.
  await page.locator("#guest").fill("Inès Moreau");
  await page.locator("#guest").press("Enter");
  await page.locator("#guest").fill("Mme Garnier (Garnier & Fils)");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  expect((await page.locator(".guests").innerText()).includes("3 people at the table · €13.67 each"), "per person: " + (await page.locator(".guests").innerText()));
  expect(await page.locator("#guest-missing").count() === 0, "guests named: no more warning");
  // The sticky Save bar never covers the field being typed in.
  for (const field of ["#merchant", "#guest"]) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator(field).focus();
    await page.waitForTimeout(500);
    const [fieldBottom, barTop] = await page.evaluate(f => [document.querySelector(f).getBoundingClientRect().bottom, document.querySelector(".save-bar").getBoundingClientRect().top], field);
    expect(fieldBottom <= barTop, `${field} (bottom ${fieldBottom}) is under the Save bar (top ${barTop})`);
  }
  await page.locator("#merchant").fill("Café Kitsuné");
  await page.getByText("VAT and note").click();
  await page.getByRole("button", { name: "10 %" }).click();
  expect((await page.locator("#vat").inputValue()) === "3.73", "VAT from the rate: " + (await page.locator("#vat").inputValue()));
  await page.locator("#note").fill("Lunch with Mme Garnier");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForURL(/\/chest$/u);
  await page.waitForSelector(".ck-toast");
  // The toast sits above the phone's dock (kit 0.2.6, data-ck-bottom-bar),
  // never over "Add an expense".
  await page.waitForTimeout(400);
  const [toastBottom, dockTop] = await page.evaluate(() => [document.querySelector(".ck-toast").getBoundingClientRect().bottom, document.querySelector(".dock[data-ck-bottom-bar]").getBoundingClientRect().top]);
  expect(toastBottom <= dockTop + 1, `the toast (bottom ${toastBottom}) is above the dock (top ${dockTop})`);
  const text = await page.locator("main").innerText();
  expect(text.includes("Café Kitsuné") && text.includes("€41.00"), "in the drafts");
  const thumb = page.locator(".row", { hasText: "Café Kitsuné" }).locator("img.thumb");
  expect(await thumb.count() === 1, "thumbnail shown");
  await page.waitForFunction(() => [...document.querySelectorAll("img.thumb")].some(img => img.complete && img.naturalWidth > 0), null, { timeout: 8000 });
});

await step("phone: the photo is read in the browser — amount, day and shop suggested, to check", async () => {
  await page.goto(origin + "/chest/new");
  await page.locator(".capture .shoot input[type=file]").setInputFiles(receipt);
  await page.waitForSelector(".reading.read", { timeout: 40000 });
  expect((await page.locator(".reading").innerText()).startsWith("Read from the photo: amount, VAT, date, where"), "status: " + (await page.locator(".reading").innerText()));
  expect((await page.locator("#amount").inputValue()) === "41.00", "amount " + (await page.locator("#amount").inputValue()));
  expect((await page.locator("#merchant").inputValue()) === "CAFÉ KITSUNÉ", "merchant " + (await page.locator("#merchant").inputValue()));
  // The kit's DateField: the day as typed in the reader's language, the ISO day in the form.
  expect((await page.locator("input[type=hidden][name=date]").inputValue()) === "2026-09-28", "date " + (await page.locator("input[type=hidden][name=date]").inputValue()));
  expect((await page.locator("#date").inputValue()) === "28/09/2026", "date as typed " + (await page.locator("#date").inputValue()));
  expect(await page.locator(".date-suggested").count() === 1, "the date is marked as read");
  expect(await page.locator(".money-input.suggested").count() === 1, "the amount is marked as read");
  await page.locator("#amount").fill("41.50");
  expect(await page.locator(".money-input.suggested").count() === 0, "typed over: no longer marked");
  await page.getByRole("link", { name: "Cancel" }).click();
  await page.waitForURL(/\/chest$/u);
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

await step("a day after today is refused: said under the field, Save waits, nothing saved — never today in its place (kit 0.2.4)", async () => {
  // The form is noValidate and saves from its own state: before 0.2.4 the
  // previous day (today) would have gone in place of the refused one.
  await page.goto(origin + "/chest");
  const drafts = await page.locator("main .row").count();
  await page.goto(origin + "/chest/new");
  await page.locator("#amount").fill("12,00");
  await page.locator("fieldset.chips label.chip").first().click();
  await page.locator("#merchant").fill("Refused day café");
  const later = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  await page.locator("#date").fill(later);
  await page.locator("#date").press("Tab");
  const said = page.locator(".ck-date .ck-error");
  await said.waitFor();
  expect((await said.innerText()).includes("or earlier"), "the field says why: " + (await said.innerText()));
  expect((await page.locator("#date").inputValue()) === later, "what was typed stays");
  expect((await page.locator("input[type=hidden][name=date]").inputValue()) === "", "no day in the form");
  const save = page.getByRole("button", { name: "Save", exact: true });
  expect(await save.isDisabled(), "Save waits while the day is refused");
  await page.locator("#merchant").press("Enter");
  await page.waitForTimeout(1000);
  expect(/\/chest\/new$/u.test(page.url()), "not sent: " + page.url());
  await page.goto(origin + "/chest");
  expect((await page.locator("main .row").count()) === drafts, "no draft added");
  expect(!(await page.locator("main").innerText()).includes("Refused day café"), "nothing saved with another day");
});

await step("delete a draft, then undo", async () => {
  await page.locator(".row", { hasText: "Chez Janou" }).locator("a.main").click();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.waitForURL(/\/chest$/u);
  expect(!(await page.locator("main").innerText()).includes("Chez Janou"), "gone");
  await page.locator(".ck-toast-undo").click();
  await page.locator(".ck-toast", { hasText: "Undone." }).waitFor();
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
  await hugo.getByPlaceholder(/^Pourquoi\s\? La personne lira ce message\.$/u).fill("Il manque le reçu du taxi : ajoutez une photo.");
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
  expect(/Renvoyée après un refus\s:\s«\sIl manque le reçu du taxi/u.test(await taxi.innerText()), "the line says it was refused before");
  expect(/1 a une alerte\s: regardez-la d’abord\./u.test(await hugo.innerText()), "says why it is left");
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
  await page.waitForSelector(".ck-toast");
  await page.locator(".ck-toast-undo").click();
  await page.locator(".ck-toast", { hasText: "Action annulée." }).waitFor();
  // The Undo tells the truth: Hugo's "Paid back" left his bell.
  expect(!(await (await page.request.get(origin + "/_dev")).text()).includes("Paid back:"), "Hugo's bell no longer says paid");
  await page.reload();
  await page.locator("section.paper", { hasText: "Hugo Bernard" }).getByRole("button", { name: "Marquer remboursé" }).click();
  await page.waitForSelector(".ck-toast");
  await page.waitForTimeout(1000);
  await page.reload();
  expect(await page.locator("section.paper", { hasText: "Hugo Bernard" }).count() === 0, "Hugo paid");
  const dev = await (await page.request.get(origin + "/_dev")).text();
  expect(dev.includes("Paid back:"), "Hugo told in English");
});

await step("Tom's account is British: his postal address, then the company's, are asked before he can be in the transfer file", async () => {
  await page.goto(origin + "/chest/pay");
  const tom = page.locator("section.paper", { hasText: "Tom Walker" });
  expect(/Compte au Royaume-Uni ou en Suisse\s: son adresse postale est d’abord nécessaire/u.test(await tom.innerText()), "Tom's missing address said: " + (await tom.innerText()));
  expect(await page.locator("section.by-file").getByRole("button", { name: /^Créer le fichier/u }).count() === 0, "nobody payable by file yet");
  await tom.getByRole("button", { name: /^Modifier/u }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByRole("button", { name: "Remplacer" }).click();
  expect((await dialog.innerText()).includes("la banque demande l’adresse postale du titulaire"), "why the address is asked");
  // The IBAN left empty keeps Tom's account; only the address is added.
  await page.locator("#person-bank-street").fill("12 King's Road");
  await page.locator("#person-bank-postcode").fill("SW3 4RP");
  await page.locator("#person-bank-town").fill("London");
  expect((await page.locator("#person-bank-country").inputValue()) === "GB", "the account's country by default");
  await page.getByRole("button", { name: "Enregistrer ses coordonnées" }).click();
  await page.waitForSelector("dialog[open]", { state: "detached", timeout: 5000 });
  await page.reload();
  const again = page.locator("section.paper", { hasText: "Tom Walker" });
  expect((await again.innerText()).includes("GB•• •••• 5432") && /l’adresse postale de l’entreprise est d’abord nécessaire/u.test(await again.innerText()), "same account; now the company's address: " + (await again.innerText()));
  await page.goto(origin + "/chest/settings/company#bank");
  const bank = page.locator("#bank");
  expect(/Ils liront\s:\s«\sNotes de frais E12 E13\s»/u.test(await bank.innerText()), "the bank text, in the company's language");
  await bank.getByRole("button", { name: "Remplacer" }).click();
  await page.locator("#company-bank-street").fill("8 rue de la Roquette");
  await page.locator("#company-bank-postcode").fill("75011");
  await page.locator("#company-bank-town").fill("Paris");
  await bank.getByRole("button", { name: "Enregistrer le compte de l’entreprise" }).click();
  await page.waitForTimeout(1200);
  await page.reload();
  expect((await page.locator("#bank").innerText()).includes("8 rue de la Roquette, 75011 Paris, France"), "the company's address kept: " + (await page.locator("#bank").innerText()));
});

await step("Camille pays the others by one transfer file (SEPA), then enters Léa's bank details", async () => {
  await page.goto(origin + "/chest/pay");
  const panel = page.locator("section.by-file");
  expect(/Leur relevé bancaire affichera\s«\sNotes de frais E12\s»\s\(Français\)/u.test(await panel.innerText()), "what the bank statement will read: " + (await panel.innerText()));
  const make = panel.getByRole("button", { name: /^Créer le fichier · 1 virement · 188,40\s€$/u });
  expect(await make.count() === 1, "one transfer: Tom's (Léa has no bank details) — " + (await panel.innerText()));
  const [download] = await Promise.all([page.waitForEvent("download"), make.click()]);
  const { readFileSync } = await import("node:fs");
  const xml = readFileSync(await download.path(), "utf8");
  expect(/^EXP-\d{8}-[0-9A-F]{8}\.xml$/u.test(download.suggestedFilename()), "file name " + download.suggestedFilename());
  expect(xml.includes('xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"') && xml.includes("<IBAN>GB82WEST12345698765432</IBAN>") && xml.includes('<InstdAmt Ccy="EUR">188.40</InstdAmt>') && xml.includes("<Nm>Atelier Roux SARL</Nm>") && xml.includes("<IBAN>FR1420041010050500013M02606</IBAN>"), "pain.001 content");
  expect(xml.includes("<Cdtr><Nm>Tom Walker</Nm><PstlAdr><StrtNm>12 King's Road</StrtNm><PstCd>SW3 4RP</PstCd><TwnNm>London</TwnNm><Ctry>GB</Ctry></PstlAdr></Cdtr>"), "Tom's address in the file");
  expect(xml.includes("<PstlAdr><StrtNm>8 rue de la Roquette</StrtNm><PstCd>75011</PstCd><TwnNm>Paris</TwnNm><Ctry>FR</Ctry></PstlAdr></Dbtr>"), "the company's address in the file");
  expect(/<Ustrd>Notes de frais E\d+ E\d+<\/Ustrd>/u.test(xml), "the bank text in French");
  if (process.env.SEPA_XSD) {
    const { execFileSync } = await import("node:child_process");
    execFileSync("xmllint", ["--noout", "--schema", process.env.SEPA_XSD, await download.path()], { stdio: "pipe" });
  }
  await page.waitForSelector("text=1 personne est laissée de côté");
  await page.waitForTimeout(800);
  await page.reload();
  expect(await page.locator("section.paper", { hasText: "Tom Walker" }).count() === 0, "Tom paid by the file");
  expect(/fichiers de virement/iu.test(await page.locator("main").innerText()), "the file is listed");
  const lea = page.locator("section.paper", { hasText: "Léa Dubois" });
  expect((await lea.innerText()).includes("Pas de coordonnées bancaires"), "Léa has none");
  await lea.getByRole("button", { name: /^Saisir ses coordonnées bancaires/u }).click();
  await page.locator("#person-bank-iban").fill("BE68 5390 0754 7035");
  await page.locator("#person-bank-bic").click();
  expect((await page.locator("dialog[open]").innerText()).includes("faute de frappe"), "the typo is caught while typing");
  await page.locator("#person-bank-iban").fill("BE68 5390 0754 7034");
  await page.getByRole("button", { name: "Enregistrer ses coordonnées" }).click();
  await page.waitForSelector("dialog[open]", { state: "detached", timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.reload();
  expect((await page.locator("section.paper", { hasText: "Léa Dubois" }).innerText()).includes("BE•• •••• 7034"), "masked account");
  const dev = await (await page.request.get(origin + "/_dev")).text();
  expect(dev.includes("Camille Martin a modifié vos coordonnées bancaires (compte finissant par 7034)"), "Léa told, in French");
});

await step("Camille: a half-typed IBAN is not lost by a stray Escape; erasing bank details asks first", async () => {
  await page.goto(origin + "/chest/pay");
  const lea = page.locator("section.paper", { hasText: "Léa Dubois" });
  await lea.getByRole("button", { name: /^Modifier/u }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByRole("button", { name: "Remplacer" }).click();
  await page.locator("#person-bank-iban").fill("FR76 3000");
  await page.keyboard.press("Escape");
  await dialog.getByText(/^Abandonner vos modifications\s\?$/u).waitFor();
  await dialog.getByRole("button", { name: "Continuer" }).click();
  expect((await page.locator("#person-bank-iban").inputValue()) === "FR76 3000", "the IBAN typed is kept");
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: "Abandonner" }).click();
  await page.waitForSelector("dialog[open]", { state: "detached", timeout: 5000 });
  await lea.getByRole("button", { name: /^Modifier/u }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Effacer" }).click();
  const confirm = page.locator("dialog[open][role=alertdialog]");
  expect(/Effacer ces coordonnées bancaires\s\?/u.test(await confirm.innerText()) && (await confirm.innerText()).includes("7034"), "asks first, naming the account");
  await confirm.getByRole("button", { name: "Annuler" }).click();
  expect(await page.locator("dialog[open][role=alertdialog]").count() === 0 && (await page.locator("dialog[open]").innerText()).includes("7034"), "cancelled: nothing erased, the bank details dialog still open");
  await page.locator("dialog[open]").getByRole("button", { name: "Effacer" }).click();
  await page.locator("dialog[open][role=alertdialog]").getByRole("button", { name: "Effacer" }).click();
  await page.locator(".ck-toast", { hasText: "Coordonnées bancaires effacées." }).waitFor();
  await page.waitForSelector("dialog[open]", { state: "detached", timeout: 5000 });
  await page.reload();
  expect((await page.locator("section.paper", { hasText: "Léa Dubois" }).innerText()).includes("Pas de coordonnées bancaires"), "erased");
});

await step("Camille imports the company card statement: one payment finds Hugo's paid expense (to check), one waits for its receipt, the refund is left out; Hugo is reminded", async () => {
  const { writeFileSync } = await import("node:fs");
  const statement = tmp + "/expenses-cards.csv";
  writeFileSync(statement, "\ufeffDate;Libellé;Montant;Devise\r\n29/09/2026;CB CAFE KITSUNE 29/09;-41,00;EUR\r\n27/09/2026;CB FNAC PARIS;-59,90;EUR\r\n26/09/2026;AVOIR SNCF;+12,00;EUR\r\n");
  await page.goto(origin + "/chest/pay");
  await page.getByRole("link", { name: "Cartes de l’entreprise" }).click();
  await page.waitForURL(/\/chest\/cards$/u);
  await page.locator("input[type=file]").setInputFiles(statement);
  await page.waitForSelector("#card-owner");
  expect((await page.locator("#card-map-date").inputValue()) === "0" && (await page.locator("#card-map-amount").inputValue()) === "2", "columns guessed");
  const status = () => page.locator("p[role=status]").last().innerText();
  expect((await status()).includes("2 paiements par carte.") && (await status()).includes("1 remboursement ou crédit laissé de côté."), "payments and refund told apart: " + (await status()));
  expect(await page.getByRole("button", { name: "Importer 2 paiements par carte" }).isDisabled(), "whose card first");
  await page.locator("#card-owner").selectOption({ label: "Hugo Bernard" });
  await page.getByRole("button", { name: "Importer 2 paiements par carte" }).click();
  await page.waitForSelector("text=1 a retrouvé sa dépense");
  await page.waitForTimeout(800);
  await page.reload();
  const waiting = await page.locator("section", { hasText: "En attente d’un justificatif" }).first().innerText();
  expect(waiting.includes("CB FNAC PARIS") && waiting.includes("3 paiements par carte"), "FNAC waits with Hugo's two others: " + waiting);
  const check = await page.locator("section", { hasText: "À vérifier" }).last().innerText();
  expect(check.includes("CB CAFE KITSUNE") && check.includes("ne pas le rembourser"), "paid back already: to check — " + check);
  await page.getByRole("button", { name: /^Relancer · Hugo Bernard$/u }).click();
  await page.locator(".ck-toast", { hasText: "Envoyé à 1 personne." }).waitFor();
  const dev = await (await page.request.get(origin + "/_dev")).text();
  expect(dev.includes("3 company card payments need their receipt"), "Hugo asked in his bell, in English");
  // A statement imported by mistake: Undo takes it back whole.
  const wrong = tmp + "/expenses-cards-wrong.csv";
  writeFileSync(wrong, "Date;Libellé;Montant\n20/09/2026;CB PAUL GARE DE LYON;-7,20\n");
  await page.locator("input[type=file]").setInputFiles(wrong);
  await page.locator("#card-owner").selectOption({ label: "Hugo Bernard" });
  await page.getByRole("button", { name: "Importer 1 paiement par carte" }).click();
  await page.locator(".ck-toast", { hasText: "1 paiement par carte importé." }).locator(".ck-toast-undo").click();
  await page.locator(".ck-toast", { hasText: "Action annulée." }).waitFor();
  await page.reload();
  expect(!(await page.locator("main").innerText()).includes("CB PAUL"), "the wrong statement is gone");
  // The paid-twice check, once looked at, leaves the list (Undo brings it back).
  await page.getByRole("button", { name: /^Vérifié\s?:\s?CB CAFE KITSUNE/u }).click();
  await page.locator(".ck-toast", { hasText: "Retiré de la liste." }).waitFor();
});

await step("Hugo, on his phone: the card payment asks for its receipt; he adds it, and it no longer waits", async () => {
  await as(context, origin, "hugo");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/chest");
  const fnac = page.locator(".row", { hasText: "FNAC PARIS" });
  expect((await fnac.innerText()).includes("Company card: receipt needed"), "said on the row: " + (await fnac.innerText()));
  expect(!(await fnac.locator("input.pick").isChecked()), "not ticked until its receipt is there");
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(wide <= 0, `home scrolls sideways by ${wide}px`);
  await fnac.getByRole("link", { name: /^Add the receipt/u }).click();
  await page.waitForURL(/\/edit$/u);
  await page.locator(".capture .pick-file input[type=file]").setInputFiles(receipt);
  await page.waitForSelector("text=Receipt added", { timeout: 8000 });
  await page.waitForSelector(".reading.read, .reading:not(.reading)", { timeout: 40000 }).catch(() => {});
  await page.locator("#amount").fill("59,90");
  await page.getByText("Supplies", { exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForURL(/\/chest$/u);
  const row = page.locator(".row", { hasText: "FNAC PARIS" });
  expect(!(await row.innerText()).includes("receipt needed") && (await row.locator("img.thumb").count()) === 1, "receipt there: " + (await row.innerText()));
  await as(context, origin, "camille");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(origin + "/chest/cards");
  expect(!(await page.locator("main").innerText()).includes("CB FNAC PARIS") && (await page.locator("main").innerText()).includes("2 paiements par carte"), "FNAC no longer waits");
});

await step("Hugo adds his registration certificate (the kit's file picker, straight to the Chest)", async () => {
  await as(context, origin, "hugo");
  await page.goto(origin + "/chest/settings");
  await page.locator("#vehicle input[type=file]:not(.ck-file-camera-input)").setInputFiles(receipt); // "Choose a file" (the kit's camera input is a phone's)
  await page.locator(".ck-toast", { hasText: "Certificate saved." }).waitFor({ timeout: 8000 });
  await page.reload();
  const vehicle = await page.locator("#vehicle").innerText();
  expect(vehicle.includes("expenses-receipt.png") && vehicle.includes("Not checked yet"), "the certificate is kept: " + vehicle);
  await as(context, origin, "camille");
});

await step("the accounting entries (FEC layout) and the export by month of payment", async () => {
  const entries = await (await page.request.get(origin + "/chest/export/journal?month=2026-09")).text();
  const lines = entries.split("\r\n");
  expect(lines[0] === "JournalCode\tJournalLib\tEcritureNum\tEcritureDate\tCompteNum\tCompteLib\tCompAuxNum\tCompAuxLib\tPieceRef\tPieceDate\tEcritureLib\tDebit\tCredit\tEcritureLet\tDateLet\tValidDate\tMontantdevise\tIdevise", "FEC header");
  expect(entries.includes("\t421BERNARD\tHugo Bernard\t"), "Hugo's own account");
  await page.goto(origin + "/chest/export?by=paid");
  expect(/remboursées en septembre 2026/iu.test(await page.locator("main").innerText()), "by month of payment");
  expect(await page.locator("a.download").count() === 3, "three downloads");
});

await step("Camille imports Expensify's history: columns guessed, the unknown person left out", async () => {
  await page.goto(origin + "/chest/settings/company#import");
  const { fileURLToPath } = await import("node:url");
  const file = fileURLToPath(new URL("../../../tools/private/expenses/test/fixtures/expensify-export.csv", import.meta.url));
  await page.locator("#import input[type=file]").setInputFiles(file);
  await page.waitForSelector("text=4 lignes sont prêtes.");
  expect((await page.locator("#import").innerText()).includes("Robert Smith"), "the unmatched name is shown");
  expect((await page.locator("#date-order").inputValue()) === "mdy", "US dates recognised");
  await page.getByRole("button", { name: "Importer 4 lignes" }).click();
  await page.waitForSelector("text=3 dépenses importées.");
  expect((await page.locator("#import").innerText()).includes("un remboursement"), "the refund is left out, and said");
  await as(context, origin, "hugo");
  await page.goto(origin + "/chest");
  const uber = page.locator(".row:not(.needs-receipt)", { hasText: "Uber" }); // not the card payment "UBER *TRIP" of the sample statement
  expect(/imported/iu.test(await uber.innerText()), "in Hugo's history, stamped");
  await as(context, origin, "camille");
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
  await page.goto(origin + "/chest/settings/company");
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

await step("Tom claims a flat rate: two meals away from home", async () => {
  await as(context, origin, "tom");
  await page.goto(origin + "/chest/new?allowance=1");
  await page.locator("label.chip", { hasText: "Meal away from home (URSSAF)" }).click();
  await page.locator("#units").fill("2");
  expect((await page.locator(".estimate").innerText()).includes("€42.80"), "live amount: " + (await page.locator(".estimate").innerText()));
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForURL(/\/chest$/u);
  expect((await page.locator(".row", { hasText: "Meal away from home" }).innerText()).includes("2 meals × €21.40"), "in the drafts");
});

await step("Inès sees Sofia's London expense in euros; Léa gives her kilometres driven before the tool", async () => {
  await as(context, origin, "ines");
  await page.goto(origin + "/chest/approve");
  expect((await page.locator(".row", { hasText: "Heathrow Express" }).innerText()).includes("Soit 44,86"), "converted at Sofia's rate");
  await as(context, origin, "lea");
  await page.goto(origin + "/chest/settings");
  await page.locator("#prior").fill("800");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.waitForSelector("text=Vos trajets de 2026 pas encore validés ont été mis à jour.");
});

// Round 3 of the critique.
await step("nobody approves their own: Camille's €250 meal waits for someone else, the page says so; once Inès is named, Inès approves it", async () => {
  await as(context, origin, "camille");
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto(origin + "/chest/new");
  await page.locator("#amount").fill("250");
  await page.locator("label.chip", { hasText: "Repas" }).click();
  await page.locator("#merchant").fill("Le Grand Véfour");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.waitForURL(/\/chest$/u);
  await page.locator(".ck-toast", { hasText: "Envoyer" }).getByRole("button", { name: /Envoyer/u }).click();
  await page.locator(".ck-toast", { hasText: "Personne ne peut encore la valider" }).waitFor();
  await page.reload();
  const home = await page.locator("main").innerText();
  expect(home.includes("personne d’autre ne peut encore valider les vôtres") && home.includes("En attente : personne ne peut encore la valider"), "the accountant is told nobody can approve hers: " + home.slice(0, 600));
  await page.goto(origin + "/chest/approve");
  expect(!(await page.locator("main").innerText()).includes("Le Grand Véfour"), "not in her own To approve");
  await page.goto(origin + "/chest/settings/company#approvers");
  expect((await page.locator("#approvers").innerText()).includes("Personne ne peut valider les propres dépenses de Camille Martin"), "Settings names the gap");
  await page.getByLabel(/Validé par.*Camille Martin/u).selectOption({ label: "Inès Moreau" });
  await page.waitForSelector("text=Enregistré. Ses dépenses en attente vont à Inès Moreau.");
  await page.goto(origin + "/chest");
  expect(!(await page.locator("main").innerText()).includes("personne d’autre ne peut encore valider"), "the notice goes once someone is named");
  await as(context, origin, "ines");
  await page.goto(origin + "/chest/approve");
  const row = page.locator(".row", { hasText: "Le Grand Véfour" });
  await row.getByRole("button", { name: /^Valider/u }).click();
  await page.locator(".ck-toast", { hasText: "1 dépense validée." }).waitFor();
});

await step("a former member's claim: To approve and To pay back say he left; he is kept out of the transfer file", async () => {
  await as(context, origin, "camille");
  await page.goto(origin + "/chest/approve");
  const paul = page.locator("section", { hasText: "Paul Lefèvre (ancien membre)" });
  // The Chest says when he left (leftAt): the day is written.
  expect(/A quitté l’entreprise le \d{1,2} \p{L}+\s: valider, c’est encore la rembourser/u.test(await paul.innerText()), "warned before approving, with the day he left: " + (await paul.innerText()));
  await paul.locator(".row", { hasText: "SNCF" }).getByRole("button", { name: /^Valider/u }).click();
  await page.locator(".ck-toast", { hasText: "1 dépense validée." }).waitFor();
  await page.goto(origin + "/chest/pay");
  const owed = page.locator("section", { hasText: "Paul Lefèvre (ancien membre)" });
  expect((await owed.innerText()).includes("solde de tout compte"), "To pay back says how he is paid: " + (await owed.innerText()));
});

await step("search: Camille finds by amount, shop, person and reference; Hugo only his own", async () => {
  await page.goto(origin + "/chest");
  await page.waitForLoadState("networkidle");
  await page.locator("main").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("/");
  expect(await page.evaluate(() => document.activeElement?.getAttribute("type") === "search" || document.activeElement?.closest("[role=search]") !== null), "/ focuses the search box");
  await page.keyboard.type("86,40");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/chest\/search\?q=86%2C40$/u);
  expect((await page.locator("main").innerText()).includes("Brasserie Georges"), "by amount");
  await page.goto(origin + "/chest/search?q=mercure");
  expect((await page.locator("main").innerText()).includes("Hôtel Mercure Lille"), "by shop");
  await page.goto(origin + "/chest/search?q=L%C3%A9a");
  const lea = await page.locator("main").innerText();
  expect(lea.includes("Léa Dubois") && lea.includes("Hôtel Mercure Lille"), "by person");
  const ref = (await page.locator(".row", { hasText: "Hôtel Mercure Lille" }).first().innerText()).match(/E\d+/u)?.[0];
  await page.goto(origin + "/chest/search?q=" + ref);
  expect((await page.locator(".row").count()) === 1, "by reference " + ref);
  await page.goto(origin + "/chest/search?q=zzzz");
  expect((await page.locator("main").innerText()).includes("Rien trouvé pour « zzzz »"), "nothing found, said");
  await as(context, origin, "hugo");
  await page.goto(origin + "/chest/search?q=mercure");
  expect(!(await page.locator("main").innerText()).includes("Hôtel Mercure Lille"), "Hugo never finds Léa's");
});

await step("card lines finish themselves: UBER becomes Travel, a word of the company's own is added; the holder is emailed", async () => {
  const { writeFileSync } = await import("node:fs");
  await as(context, origin, "camille");
  await page.goto(origin + "/chest/settings/company#card-words");
  await page.locator("#new-card-words").fill("monoprix");
  await page.locator("#new-card-category").selectOption({ label: "Fournitures" });
  await page.locator("#card-words").getByRole("button", { name: "Ajouter", exact: true }).click();
  await page.waitForTimeout(600);
  await page.reload();
  await page.locator("#card-words summary").click();
  expect((await page.locator("#card-words").innerText()).includes("MONOPRIX"), "the word is kept, in capitals");
  const statement = tmp + "/expenses-cards-2.csv";
  writeFileSync(statement, "Date;Libellé;Montant\n21/09/2026;UBER *TRIP;-23,40\n18/09/2026;MONOPRIX PARIS 11;-45,90\n");
  await page.goto(origin + "/chest/cards");
  await page.locator("input[type=file]").setInputFiles(statement);
  await page.locator("#card-owner").selectOption({ label: "Hugo Bernard" });
  await page.getByRole("button", { name: "Importer 2 paiements par carte" }).click();
  await page.waitForSelector("text=2 attendent leur justificatif");
  await page.waitForTimeout(800);
  const dev = await (await page.request.get(origin + "/_dev")).text();
  expect(dev.includes("3 company card payments need their receipt") || dev.includes("company card payments need their receipt"), "Hugo emailed");
  expect(dev.includes("UBER *TRIP · 23.40") || dev.includes("UBER *TRIP · €23.40"), "the email names each payment");
  await as(context, origin, "hugo");
  await page.goto(origin + "/chest");
  const uber = await page.locator(".row", { hasText: "UBER *TRIP" }).filter({ hasText: "21 Sept" }).innerText();
  expect(uber.includes("Train, plane, taxi"), "Uber is travel: " + uber);
  const monoprix = await page.locator(".row", { hasText: "MONOPRIX PARIS" }).filter({ hasText: "18 Sept" }).innerText();
  expect(monoprix.includes("Supplies"), "Monoprix is the company's supplies: " + monoprix);
});

await step("emails: the approver hears of what was sent to her; one date format; no line starts with a dot", async () => {
  const dev = await (await page.request.get(origin + "/_dev")).text();
  expect(dev.includes("Hugo Bernard a envoyé"), "Inès emailed in French when Hugo sent");
  await as(context, origin, "camille");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/chest/pay", "/chest/approve", "/chest"]) {
    await page.goto(origin + path);
    const bad = await page.evaluate(() => [...document.querySelectorAll(".row .sub > span")].filter(s => getComputedStyle(s, "::before").content.includes("·")).length);
    expect(bad === 0, `${path}: ${bad} parts start with a dot`);
    const dates = await page.locator(".row .sub .mono").allInnerTexts();
    expect(dates.every(d => /^\d{1,2} \p{L}+\.?$/u.test(d.trim()) && (d.includes(".") || /mai|juin|août|mars/u.test(d))), `${path}: dates ${dates.join(", ")}`);
  }
  const paid = await page.goto(origin + "/chest/pay").then(() => page.locator("section", { hasText: "Remboursées ces 90 derniers jours" }).innerText());
  expect(!/\d sept(?!\.)/u.test(paid), "the history writes sept. too: " + paid.slice(0, 200));
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
  for (const path of ["/chest", "/chest/new", "/chest/new?trip=1", "/chest/new?allowance=1", "/chest/approve", "/chest/pay", "/chest/cards", "/chest/export", "/chest/settings", "/chest/settings/company"]) {
    await page.goto(origin + path);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(wide <= 0, `${path} scrolls sideways by ${wide}px`);
  }
});

await browser.close();
done(problems);
