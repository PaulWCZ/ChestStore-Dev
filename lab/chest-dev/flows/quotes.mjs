// Quotes & invoices, as people use it, in a real browser:
//   node lab/chest-dev/flows/quotes.mjs [port]
// (the harness runs the tool with --reset: the sample company is there).
// Hugo (sales, English) writes a quote on his phone and sends it; the
// client accepts; he makes a deposit invoice and hands it to billing. Sofia
// (billing, English) finalises it, sends it, records a payment. Camille
// (admin, French) makes a credit note, changes a setting, exports for the
// accountant. Léa (viewer, French) reads; Nora has no role. Then what
// switching from another tool needs: the Factur-X, the reminder first on a
// late invoice, a repeating invoice, the clients imported from an Axonaut
// export, the numbering continued, the reminders by themselves.
import { as, done, expect, open, step } from "./lib.mjs";

const port = Number(process.argv[2] ?? 5700);
const { browser, context, page, origin, problems } = await open(port, "hugo", { viewport: { width: 390, height: 844 }, locale: "en", allow404: /\/chest\/documents\/\d+$/u });
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

await step("a mistake is forgiven: delete a line, undo", async () => {
  await page.getByRole("button", { name: "Line 2: move, copy or delete" }).click();
  await page.getByRole("menuitem", { name: "Delete the line" }).click();
  expect((await page.locator(".totals").innerText()).replace(/\s/gu, " ").includes("1 950,00 €"), "total without line 2");
  await page.locator(".ck-toast-undo").click();
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

await step("Sofia sends it and records a partial payment, then deletes and restores it", async () => {
  await page.getByRole("button", { name: "Send to the client" }).click();
  await page.waitForSelector("#subject");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.waitForSelector("text=Sent to compta@garage-rossi.test, with the PDF.");
  await page.getByRole("button", { name: "Record a payment" }).click();
  await page.locator("#amount").fill("300");
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await page.waitForSelector("text=Recorded.");
  await page.waitForSelector(".stamp.big.partly_paid");
  await page.getByRole("button", { name: /Delete the payment of/u }).click();
  await page.locator(".ck-toast-undo").click();
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
  await page.waitForSelector("p.error[role=alert]");
  const alert = await page.locator("p.error[role=alert]").innerText();
  expect(alert.includes("SIREN"), "SIREN refused, in French: " + alert);
});

await step("the accountant's export: a French CSV, the accounting entries, a ZIP of everything", async () => {
  await as(context, origin, "lea");
  await french();
  await page.goto(origin + "/chest/export?" + new URLSearchParams({ from: "2000-01-01", to: "2100-12-31" }));
  const get = async name => page.request.get(origin + (await page.getByRole("link", { name }).getAttribute("href")));
  const csv = await (await get("Récapitulatif (CSV)")).text();
  expect(csv.includes("Journal;Date;Numéro;Type;Client") && /VE;\d\d\/\d\d\/\d{4};A-\d{4}-0002;Avoir;Garage Rossi SARL/u.test(csv), "CSV");
  const entries = await (await get("Écritures comptables (CSV)")).text();
  expect(entries.includes("JournalCode;JournalLib;EcritureNum") && /VE;Ventes;A-\d{4}-0002;\d{8};411000;Clients;C\d{5};Garage Rossi SARL/u.test(entries), "entries: " + entries.slice(0, 300));
  const zip = Buffer.from(await (await get("Tout (ZIP)")).body());
  expect(zip.subarray(0, 2).toString() === "PK" && zip.includes(Buffer.from("Avoir-A-")) && zip.includes(Buffer.from("clients.csv")) && zip.includes(Buffer.from("ecritures-ventes_")), "ZIP");
  const clients = await (await get("Clients (CSV)")).text();
  expect(clients.includes("Nom;Entreprise ou particulier;Personne à contacter"), "clients CSV");
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
  const before = await page.locator(".ck-table tbody tr").count();
  await page.locator(".ck-table tbody .doc-link").first().click();
  await page.getByRole("button", { name: /Supprimer le brouillon/u }).click();
  await page.waitForURL(/\/chest\/quotes$/u);
  await page.locator(".ck-toast-undo").click();
  await page.waitForURL(/\/chest\/documents\/\d+$/u);
  await page.goto(origin + "/chest/quotes?state=draft");
  expect(await page.locator(".ck-table tbody tr").count() === before, "draft back");
});

await step("a deal won in Clients becomes a draft quote for Hugo; reopened untouched, it goes", async () => {
  await as(context, origin, "hugo");
  await english();
  const deal = { deal: "flow-42", title: "Nouvelle vitrine", amount: 250000, currency: "EUR", owner: "mbr_hugo" + "a".repeat(22),
    company: { ref: "flow-co", name: "Fleurs Martinez SARL", address: "9 rue Mercière", postcode: "69002", city: "Lyon", country: "FR", siren: "520193848", vat: "FR63520193848", email: "bonjour@fleurs.test" },
    contact: { name: "Ana Martinez", email: "ana@fleurs.test" } };
  await page.request.post(origin + "/_dev/deliver", { form: { type: "crm.deal.won", data: JSON.stringify(deal) } });
  expect((await dev()).includes("Deal won in Clients: Nouvelle vitrine"), "Hugo told in the bell");
  await page.goto(origin + "/chest");
  await page.locator(".todo li", { hasText: "From Clients: Nouvelle vitrine" }).locator("a.main").click();
  await page.waitForURL(/\/chest\/documents\/\d+$/u);
  const url = page.url();
  expect((await page.locator(".party.buyer").innerText()).includes("Fleurs Martinez SARL"), "client made from the company");
  expect((await page.locator(".totals").innerText()).replace(/\s/gu, " ").includes("3 000,00 €"), "the deal's amount, VAT added");
  await page.request.post(origin + "/_dev/deliver", { form: { type: "crm.deal.won", data: JSON.stringify(deal) } });
  await page.goto(origin + "/chest/quotes?state=draft");
  expect(await page.locator(".ck-table tbody tr", { hasText: "Nouvelle vitrine" }).count() === 1, "once only");
  await page.request.post(origin + "/_dev/deliver", { form: { type: "crm.deal.reopened", data: JSON.stringify({ deal: "flow-42" }) } });
  const gone = await page.request.get(url);
  expect(gone.status() === 404, "untouched draft deleted: " + gone.status());
});

await step("an issued invoice is a Factur-X: its PDF carries factur-x.xml", async () => {
  await as(context, origin, "sofia");
  const r = await page.request.get(invoiceUrl + "/pdf?download");
  const body = Buffer.from(await r.body()).toString("latin1");
  expect(body.includes("/AFRelationship /Alternative") && body.includes("(factur-x.xml)") && body.includes("<fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>"), "Factur-X parts");
  await english();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(invoiceUrl);
  expect((await page.locator(".facts").innerText()).includes("Factur-X (EN 16931)"), "the margin says so");
});

await step("a late invoice's first action is the reminder; a unit reads in the plural", async () => {
  await page.goto(origin + "/chest/invoices?state=overdue");
  await page.locator(".ck-table tbody .doc-link").first().click();
  await page.waitForSelector(".stamp.big.overdue");
  expect(await page.locator(".wide-actions").getByRole("button", { name: "Send a reminder" }).count() === 1, "remind is the primary action");
  await page.goto(origin + "/chest/invoices");
  await page.locator(".ck-table tbody tr", { hasText: "Jardins" }).first().locator(".doc-link").click();
  const paper = await page.locator(".sheet").innerText();
  expect(/10 exemplaires/u.test(paper), "10 exemplaires on the paper");
});

await step("Sofia makes a paid invoice repeat every quarter, then stops it", async () => {
  await page.goto(origin + "/chest/invoices?state=paid");
  await page.locator(".ck-table tbody .doc-link").first().click();
  await page.getByRole("button", { name: "Repeat this invoice" }).click();
  await page.getByLabel("Every").selectOption("quarter");
  await page.getByRole("button", { name: "Repeat it" }).click();
  await page.waitForSelector("text=It repeats: the next draft comes on");
  await page.waitForSelector(".repeat-note");
  expect((await page.locator(".repeat-note").innerText()).includes("Repeats every quarter"), "repeat shown");
  await page.getByRole("button", { name: "Stop repeating" }).click();
  await page.waitForSelector("text=It no longer repeats.");
});

await step("Hugo brings his clients from Axonaut: columns matched, first rows shown, bad rows said", async () => {
  await as(context, origin, "hugo");
  await english();
  await page.goto(origin + "/chest/clients");
  await page.getByRole("link", { name: "Import a file" }).click();
  await page.waitForURL(/\/chest\/import\?kind=clients$/u);
  await page.locator('input[type=file]').setInputFiles(new URL("../../../tools/public-and-private/quotes/test/fixtures/axonaut-clients.csv", import.meta.url).pathname);
  await page.waitForSelector(".mapping table");
  expect(await page.getByLabel("Where column SIRET goes").inputValue() === "siret", "SIRET recognised");
  expect((await page.locator(".preview table").innerText()).includes("Boulangerie Dupain SAS"), "preview");
  await page.getByRole("button", { name: /^Import 6 rows$/u }).click();
  await page.waitForSelector("text=clients imported.");
  const report = await page.locator(".report").innerText();
  expect(report.includes("Line 5: A SIRET has 14 digits"), "bad SIRET said: " + report);
  expect(/1 was already here|already here/u.test(report), "Dupain already there: " + report);
});

await step("Camille continues the numbering of her previous tool, and turns reminders on", async () => {
  await as(context, origin, "camille");
  await french();
  await page.goto(origin + "/chest/settings");
  // Invoices were numbered here already this year: the sequence cannot move.
  expect((await page.locator(".sequences").innerText()).includes("plus de changement possible"), "started sequences are locked");
  await page.getByText("Sans l’année", { exact: true }).click();
  await page.waitForSelector("text=Les numéros seront de la forme F-0001.");
  await page.locator(".sequence", { hasText: "Factures" }).getByRole("button", { name: "Continuer depuis mon ancien outil" }).click();
  await page.locator("#next-seq").fill("348");
  await page.getByRole("button", { name: "Commencer à F-0348" }).click();
  // The toast (the dialog's own hint says the same words while typing).
  await page.locator(".ck-toast", { hasText: "Le prochain sera F-0348." }).waitFor();
  await page.locator("details.history summary").click();
  await page.locator("details.history", { hasText: "a fixé le prochain numéro à F-0348" }).waitFor({ timeout: 5000 }).catch(() => {});
  expect((await page.locator("details.history").innerText()).includes("a fixé le prochain numéro à F-0348"), "kept in the history");
  await page.getByText("Avec l’année", { exact: true }).click();
  await page.waitForSelector("text=Les numéros seront de la forme F-");
  await page.getByText("Relancer automatiquement les retards de paiement").click();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.waitForSelector("text=Enregistré.");
  await page.request.post(origin + "/_dev/schedule", { form: { name: "followup" } });
  expect(/Relance\s:\sfacture F-\d{4}-\d{4}/u.test(await dev()), "a late payer reminded by email");
});

await step("phone: every place with its words — five labelled tabs, the rest in More", async () => {
  await english();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/chest");
  const tabs = page.locator(".ck-nav");
  for (const name of ["Desk", "Quotes", "Invoices", "Clients", "Catalogue"]) expect(await tabs.getByRole("link", { name }).isVisible(), `tab ${name} shown with its word`);
  await tabs.getByRole("link", { name: "Catalogue" }).click();
  await page.waitForURL(/\/chest\/catalogue$/u);
  expect(await tabs.getByRole("link", { name: "Catalogue" }).getAttribute("aria-current") === "page", "Catalogue is the current tab");
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await page.waitForURL(/\/chest\/settings$/u);
});

await step("phone width: no page scrolls sideways", async () => {
  await as(context, origin, "camille");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/chest", "/chest/quotes", "/chest/invoices", "/chest/clients", "/chest/clients/1", "/chest/catalogue", "/chest/export", "/chest/settings", "/chest/import", "/chest/documents/7", "/chest/documents/11", new URL(invoiceUrl).pathname]) {
    await page.goto(origin + path);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(wide <= 0, `${path} scrolls sideways by ${wide}px`);
  }
});

await browser.close();
done(problems);
