// Quotes & invoices, as people use it, in a real browser:
//   node lab/chest-dev/flows/quotes.mjs [port]
// (the harness runs the tool with --reset: the sample company is there).
// Hugo (sales, English) writes a quote on his phone and sends it; the
// client accepts; he makes a deposit invoice and hands it to billing. Sofia
// (billing, English) finalises it, sends it, records a payment. Camille
// (admin, French) makes a credit note, changes a setting, exports for the
// accountant. Léa (viewer, French) reads; Nora has no role.
import { as, done, expect, open, step } from "./lib.mjs";

const port = Number(process.argv[2] ?? 5700);
const { browser, context, page, origin, problems } = await open(port, "hugo", { viewport: { width: 390, height: 844 }, locale: "en" });
const english = async () => context.addCookies([{ name: "dev_locale", value: "en", url: origin }]);
const french = async () => context.addCookies([{ name: "dev_locale", value: "fr", url: origin }]);
const dev = async () => (await page.request.get(origin + "/_dev")).text();
const saved = () => page.waitForSelector("text=All changes saved", { timeout: 8000 });
let quoteUrl = "";
let invoiceUrl = "";

await step("phone: Hugo starts a quote from the desk, picks the client and two lines", async () => {
  await page.goto(origin + "/chest");
  await page.getByRole("button", { name: "New quote" }).first().click();
  await page.waitForURL(/\/chest\/documents\/\d+$/u);
  quoteUrl = page.url();
  await page.getByRole("button", { name: "Choose the client" }).click();
  await page.getByPlaceholder("Name, city, email…").fill("rossi");
  await page.getByRole("button", { name: /Garage Rossi SARL/u }).click();
  expect((await page.locator(".party.buyer").innerText()).includes("45 avenue Jean Jaurès"), "client printed");
  await page.getByRole("button", { name: "From the catalogue" }).click();
  await page.getByPlaceholder("Search the catalogue…").fill("design");
  await page.getByRole("button", { name: /Journée de design/u }).click();
  await page.getByLabel("Quantity of line 1").fill("2,5");
  await page.getByRole("button", { name: "Add a line" }).click();
  await page.getByLabel("Description of line 2").fill("Photos de l’atelier");
  await page.getByLabel("Unit price excluding VAT of line 2").fill("300");
  await page.getByLabel("Subject:").fill("Nouveau site");
  await saved();
  // 2.5 × 650 + 300 = 1,925.00 excl. VAT; 2,310.00 incl.
  const totals = await page.locator(".totals").innerText();
  expect(totals.replace(/\s/gu, " ").includes("2 310,00 €"), "total in the document's French: " + totals);
});

await step("a mistake is forgiven: remove a line, undo", async () => {
  await page.locator('summary[aria-label="Line 2: move, copy or remove"]').click();
  await page.getByRole("button", { name: "Remove the line" }).click();
  expect((await page.locator(".totals").innerText()).replace(/\s/gu, " ").includes("1 950,00 €"), "total without line 2");
  await page.locator(".toast button").click();
  await saved();
  expect((await page.locator(".totals").innerText()).replace(/\s/gu, " ").includes("2 310,00 €"), "line back");
});

await step("Hugo sends it: numbered, emailed in French with the PDF", async () => {
  await page.getByRole("button", { name: "Send the quote" }).click();
  await page.waitForSelector("#subject");
  const subject = await page.locator("#subject").inputValue();
  expect(/^Devis D-\d{4}-0007 — Atelier Martin$/u.test(subject), "subject " + subject);
  expect((await page.locator("#text").inputValue()).startsWith("Bonjour Luca Rossi,"), "French message");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.waitForSelector("text=Sent to compta@garage-rossi.test, with the PDF.");
  await page.waitForSelector(".stamp.big.sent");
  expect((await dev()).includes(subject.replace("—", "&mdash;")) || (await dev()).includes(subject), "in the outbox");
});

await step("the client accepts; Hugo invoices a 30 % deposit and hands it to billing", async () => {
  await page.getByRole("button", { name: "The client accepted" }).click();
  await page.waitForSelector(".stamp.big.accepted");
  await page.getByRole("button", { name: "Make the invoice" }).click();
  await page.getByText("A deposit", { exact: true }).click();
  await page.locator("#percent").fill("30");
  await page.getByRole("button", { name: "Make the invoice" }).last().click();
  await page.waitForURL(u => u.toString() !== quoteUrl && /\/chest\/documents\/\d+$/u.test(u.toString()));
  invoiceUrl = page.url();
  const line = await page.getByLabel("Description of line 1").inputValue();
  expect(/Acompte de 30\s%\ssur le devis D-\d{4}-0007/u.test(line), "deposit line: " + line);
  expect(await page.getByRole("button", { name: /Finalise/u }).count() === 0, "sales cannot finalise");
  await page.getByRole("button", { name: "Hand to billing" }).click();
  await page.waitForSelector("text=Billing was told: they finalise it.");
  expect((await dev()).includes("Invoice ready to finalise: Garage Rossi SARL"), "billing told in the bell");
});

await step("Sofia (billing) finalises it: the next number, frozen", async () => {
  await as(context, origin, "sofia");
  await english();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(origin + "/chest");
  expect((await page.locator(".todo").innerText()).includes("Ready to finalise — prepared by Hugo Bernard"), "on Sofia's desk");
  await page.goto(invoiceUrl);
  await page.getByRole("button", { name: "Finalise the invoice" }).click();
  const confirm = page.getByRole("button", { name: /^Finalise as F-\d{4}-0007$/u });
  await confirm.click();
  await page.waitForSelector(".stamp.big.unpaid");
  expect((await page.locator(".letterhead").innerText()).includes("F-"), "numbered on the paper");
  expect(await page.locator("textarea.ink").count() === 0, "nothing editable any more");
});

await step("Sofia sends it and records a partial payment, then removes and restores it", async () => {
  await page.getByRole("button", { name: "Send to the client" }).click();
  await page.waitForSelector("#subject");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.waitForSelector("text=Sent to compta@garage-rossi.test, with the PDF.");
  await page.getByRole("button", { name: "Record a payment" }).click();
  await page.locator("#amount").fill("300");
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await page.waitForSelector("text=Recorded.");
  await page.waitForSelector(".stamp.big.partly_paid");
  await page.getByRole("button", { name: /Remove the payment of/u }).click();
  await page.locator(".toast button").click();
  await page.waitForTimeout(800);
  await page.reload();
  expect(await page.locator(".payments li").count() === 1, "payment restored");
});

await step("the PDF downloads: a real PDF", async () => {
  const r = await page.request.get(invoiceUrl + "/pdf?download");
  const body = Buffer.from(await r.body());
  expect(r.status() === 200 && body.subarray(0, 5).toString() === "%PDF-", "pdf bytes");
  expect(/attachment; filename="Facture-d-acompte-F-\d{4}-0007.pdf"/u.test(r.headers()["content-disposition"] ?? ""), "file name " + r.headers()["content-disposition"]);
});

await step("Camille, in French: a credit note for the deposit, finalised with its own number", async () => {
  await as(context, origin, "camille");
  await french();
  await page.goto(invoiceUrl);
  await page.getByRole("button", { name: "Faire un avoir" }).click();
  await page.waitForURL(u => u.toString() !== invoiceUrl);
  await page.getByLabel("Prix unitaire HT de la ligne 1").fill("100");
  await page.waitForSelector("text=Tout est enregistré", { timeout: 8000 });
  await page.getByRole("button", { name: "Finaliser l’avoir" }).click();
  await page.getByRole("button", { name: /^Finaliser sous le n° A-\d{4}-0002$/u }).click();
  await page.waitForSelector(".stamp.big.final");
});

await step("Camille changes the payment terms in Settings", async () => {
  await page.goto(origin + "/chest/settings");
  await page.getByLabel("Délai de paiement (jours)").fill("45");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.waitForSelector("text=Enregistré. Vos documents sont prêts à partir.");
  await page.getByLabel("SIREN", { exact: true }).fill("123");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.waitForSelector("[role=alert]");
  const alert = await page.locator("[role=alert]").first().innerText();
  expect(alert.includes("SIREN"), "SIREN refused, in French: " + alert);
});

await step("the accountant's export: a French CSV and a ZIP of PDFs", async () => {
  await as(context, origin, "lea");
  await french();
  await page.goto(origin + "/chest/export?" + new URLSearchParams({ from: "2000-01-01", to: "2100-12-31" }));
  const csv = await (await page.request.get(origin + (await page.locator("a.download").first().getAttribute("href")))).text();
  expect(csv.includes("Journal;Date;Numéro;Type;Client") && /VE;\d\d\/\d\d\/\d{4};A-\d{4}-0002;Avoir;Garage Rossi SARL/u.test(csv), "CSV");
  const zip = Buffer.from(await (await page.request.get(origin + (await page.locator("a.download").nth(1).getAttribute("href")))).body());
  expect(zip.subarray(0, 2).toString() === "PK" && zip.includes(Buffer.from("Avoir-A-")), "ZIP");
});

await step("rights: a viewer reads but writes nothing; no role, no tool", async () => {
  await page.goto(quoteUrl);
  expect(await page.getByRole("button", { name: /Envoyer|Le client/u }).count() === 0, "viewer has no actions");
  await page.goto(origin + "/chest/quotes");
  expect(await page.getByRole("button", { name: "Nouveau devis" }).count() === 0, "no new quote");
  await as(context, origin, "nora");
  await page.goto(origin + "/chest");
  expect((await page.locator("main").innerText()).includes("pas encore utiliser"), "no role");
});

await step("drafts are forgiving: delete one, undo", async () => {
  await as(context, origin, "ines");
  await french();
  await page.goto(origin + "/chest/quotes?state=draft");
  const before = await page.locator(".ledger-row").count();
  await page.locator(".ledger-row a.main").first().click();
  await page.getByRole("button", { name: /Supprimer le brouillon/u }).click();
  await page.waitForURL(/\/chest\/quotes$/u);
  await page.locator(".toast button").click();
  await page.waitForURL(/\/chest\/documents\/\d+$/u);
  await page.goto(origin + "/chest/quotes?state=draft");
  expect(await page.locator(".ledger-row").count() === before, "draft back");
});

await step("phone width: no page scrolls sideways", async () => {
  await as(context, origin, "camille");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/chest", "/chest/quotes", "/chest/invoices", "/chest/clients", "/chest/clients/1", "/chest/catalogue", "/chest/export", "/chest/settings", "/chest/documents/7", "/chest/documents/11", new URL(invoiceUrl).pathname]) {
    await page.goto(origin + path);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(wide <= 0, `${path} scrolls sideways by ${wide}px`);
  }
});

await browser.close();
done(problems);
