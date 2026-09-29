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
// export, the numbering continued, the reminders by themselves. The client
// answers online (the public part, /q/<secret>): accepts one quote with
// "Bon pour accord"; a link turned off stops working. Sofia imports the
// invoices still to collect from the previous tool, and keeps a copy of the
// monthly archive.
import { as, done, expect, open, step } from "./lib.mjs";

const port = Number(process.argv[2] ?? 5700);
const { browser, context, page, origin, problems } = await open(port, "hugo", { viewport: { width: 390, height: 844 }, locale: "en", allow404: /\/chest\/documents\/\d+$/u });
const english = async () => context.addCookies([{ name: "dev_locale", value: "en", url: origin }]);
const french = async () => context.addCookies([{ name: "dev_locale", value: "fr", url: origin }]);
const dev = async () => (await page.request.get(origin + "/_dev")).text();
const saved = () => page.waitForSelector("text=All changes saved", { timeout: 8000 });
let quoteUrl = "";
let invoiceUrl = "";
let answerPath = "";
// A visitor of the public host: no member, their own phone.
async function visitor(locale = "fr-FR") {
  const other = await browser.newContext({ viewport: { width: 390, height: 844 }, locale, hasTouch: true });
  const p = await other.newPage();
  p.on("pageerror", e => problems.push("visitor page: " + e.message));
  p.on("console", m => { if (m.type() === "error" && !/Failed to load resource/u.test(m.text())) problems.push("visitor console: " + m.text()); });
  return { other, p };
}

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
  // Round 3: the online answer is the email's first line, shown fixed in
  // the dialog; nobody is asked to reply to accept.
  const fixed = await page.locator(".fixed-line").innerText();
  expect(/Lisez le devis D-\d{4}-0007 et acceptez-le en ligne/u.test(fixed), "the answer line shown in the dialog: " + fixed);
  expect(!/répondre à cet e-mail/u.test(await page.locator("#text").inputValue()), "no 'reply to accept'");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.waitForSelector("text=Sent to compta@garage-rossi.test, with the PDF.");
  await page.waitForSelector(".stamp.big.sent");
  expect((await dev()).includes(subject.replace("—", "&mdash;")) || (await dev()).includes(subject), "in the outbox");
  // The email carries the link to answer online, in the client's French.
  const found = /Lisez le devis D-\d{4}-0007 et acceptez-le en ligne\s:\s\S*?(\/q\/[A-Za-z0-9_-]{32})/u.exec(await dev());
  expect(found, "the answer link in the email");
  answerPath = found[1];
  expect((await page.locator(".card.online").innerText()).includes("Copy the link"), "the margin gives the link to copy");
});

await step("the client, on their phone: reads the quote, opens the PDF, accepts it with Bon pour accord", async () => {
  const { other, p } = await visitor();
  await p.goto(origin + answerPath);
  expect((await p.locator("h1").innerText()).startsWith("Devis D-"), "the quote's page, in the visitor's French");
  const sheet = await p.locator(".sheet").innerText();
  expect(sheet.includes("Photos de l’atelier") && sheet.includes("Garage Rossi SARL"), "the quote as a page");
  const pdf = await p.request.get(origin + answerPath + "/pdf");
  expect(pdf.status() === 200 && Buffer.from(await pdf.body()).subarray(0, 5).toString() === "%PDF-", "its PDF");
  expect(await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0, "no sideways scroll on the phone");
  expect((await p.locator(".public-foot").innerText()).includes("pas une signature électronique certifiée (eIDAS)"), "says it is not an eIDAS signature");
  await p.getByLabel("Vos prénom et nom").fill("Luca Rossi");
  await p.getByText("Bon pour accord", { exact: true }).click();
  await p.waitForTimeout(3200);
  await p.getByRole("button", { name: "Accepter le devis" }).click();
  await p.waitForSelector(".answer-state.accepted");
  expect((await p.locator(".answer-state").innerText()).includes("Accepté par Luca Rossi le"), "the page says who accepted, when");
  // Round 3 (N1): the whole page, every word filled — never "{company}".
  const whole = await p.locator("body").innerText();
  expect(whole.includes("Votre réponse a été transmise à Atelier Martin"), "the company is named: " + whole.slice(0, 400));
  expect(!/\{\w+\}/u.test(whole), "no placeholder left on the page: " + (/.{0,40}\{\w+\}.{0,40}/u.exec(whole)?.[0] ?? ""));
  // A second answer is not offered.
  expect(await p.getByRole("button", { name: /Refuser/u }).count() === 0, "answered once");
  await other.close();
});

await step("Hugo hears it in the bell; the quote is accepted, with the proof; he invoices a 30 % deposit and hands it to billing", async () => {
  expect((await dev()).includes("Luca Rossi accepted quote D-"), "Hugo told in the bell (English)");
  await page.goto(quoteUrl);
  await page.waitForSelector(".stamp.big.accepted");
  expect((await page.locator(".timeline").innerText()).includes("Accepted online by Luca Rossi"), "history");
  await page.locator(".proof summary").click();
  const proof = await page.locator(".proof").innerText();
  expect(proof.includes("PDF fingerprint (SHA-256)") && /[0-9a-f]{64}/u.test(proof), "the proof: " + proof.slice(0, 200));
  const kept = await page.request.get(origin + (await page.locator(".proof a").getAttribute("href")));
  expect(kept.status() === 200 && Buffer.from(await kept.body()).subarray(0, 5).toString() === "%PDF-", "the PDF they accepted");
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

await step("round 3: a sent quote changes only through its version 2; the client reading it sees the new price in place, what changed, and accepts exactly v2", async () => {
  await page.goto(origin + "/chest");
  expect(await page.locator(".revenue").count() === 0, "a salesperson sees no revenue card");
  await page.getByRole("button", { name: "New quote" }).first().click();
  await page.waitForURL(/\/chest\/documents\/\d+$/u);
  const url = page.url();
  await page.getByRole("button", { name: "Choose the client" }).click();
  await page.getByPlaceholder("Name, city, email…").fill("rossi");
  await page.getByRole("button", { name: /Garage Rossi SARL/u }).click();
  await page.getByRole("button", { name: "Add a line" }).click();
  await page.getByLabel("Description of line 1").fill("Enseigne lumineuse");
  await page.getByLabel("Unit price excluding VAT of line 1").fill("100");
  await saved();
  await page.getByRole("button", { name: "Send the quote" }).click();
  await page.waitForSelector("#subject");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.waitForSelector(".stamp.big.sent");
  const link = new URL(await page.locator(".copy-link input").inputValue()).pathname;
  expect(await page.locator("textarea.ink").count() === 0, "a sent quote is not edited in place");

  // The client opens it and starts answering.
  const { other, p } = await visitor();
  await p.goto(origin + link);
  await p.getByLabel("Vos prénom et nom").fill("Luca Rossi");
  await p.getByText("Bon pour accord", { exact: true }).click();

  // Hugo starts version 2, takes it back (Undo), starts it again.
  await page.getByRole("button", { name: "Change the quote" }).click();
  await page.locator(".ck-toast", { hasText: "Version 2 started" }).waitFor();
  await page.locator(".ck-toast-undo").click();
  await page.waitForSelector(".stamp.big.sent");
  await page.getByRole("button", { name: "Change the quote" }).click();
  await page.locator(".ck-toast", { hasText: "Version 2 started" }).waitFor();
  await page.getByLabel("Unit price excluding VAT of line 1").waitFor();
  // Meanwhile the link says a new version is coming, and takes no answer.
  const { other: other2, p: p2 } = await visitor();
  await p2.goto(origin + link);
  expect((await p2.locator("h1").innerText()).includes("en cours de mise à jour"), "revising: " + await p2.locator("h1").innerText());
  expect(await p2.locator("form").count() === 0, "no answer while it is rewritten");
  await other2.close();
  await page.getByLabel("Unit price excluding VAT of line 1").fill("120");
  await saved();
  // The toast (with its Undo) sits above the phone's action bar (kit
  // 0.2.6, data-ck-bottom-bar), never over it, and goes by itself: nobody
  // closes it.
  const bar = page.locator(".phone-action[data-ck-bottom-bar]");
  expect(await bar.count() === 1, "the phone's action bar is marked for the toasts");
  const shown = page.locator(".ck-toast").first();
  if (await shown.isVisible()) {
    const [toastBox, barBox] = [await shown.boundingBox(), await bar.boundingBox()];
    expect(!toastBox || (barBox && toastBox.y + toastBox.height <= barBox.y + 1), `the toast above the bar: ${JSON.stringify({ toastBox, barBox })}`);
  }
  await page.locator(".ck-toast").waitFor({ state: "detached", timeout: 20000 });
  await page.getByRole("button", { name: "Send version 2" }).first().click();
  await page.waitForSelector("#subject");
  expect(/^Devis D-\d{4}-\d{4} v2 — Atelier Martin$/u.test(await page.locator("#subject").inputValue()), "subject names v2");
  expect((await page.locator("#text").inputValue()).includes("la version 2 de notre devis"), "the email says it replaces the version sent");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.waitForSelector(".stamp.big.sent");
  expect((await page.locator(".card.versions").innerText()).includes("Version 1"), "earlier version listed");
  const v1 = await page.request.get(origin + (await page.locator(".card.versions a").first().getAttribute("href")));
  expect(v1.status() === 200 && Buffer.from(await v1.body()).subarray(0, 5).toString() === "%PDF-", "version 1's PDF kept");

  // The client, still on version 1, answers: refused, and the page now
  // shows version 2 in place, saying what changed.
  await p.waitForTimeout(3200);
  await p.getByRole("button", { name: "Accepter le devis" }).click();
  await p.locator(".answer-changes").waitFor();
  const changes = (await p.locator(".answer-changes").innerText()).replace(/\s/gu, " ");
  expect(changes.includes("Total TTC : 120,00 € → 144,00 €") && changes.includes("100,00 € → 120,00 € HT"), "what changed: " + changes);
  expect((await p.locator("h1").innerText()).includes("v2"), "the page shows version 2 without a reload");
  expect((await p.locator(".answer-state .lead").innerText()).replace(/\s/gu, " ").includes("144,00 €"), "the new price, in place");
  expect((await p.locator(".replaces").innerText()).includes("remplace la version 1"), "says what it replaces");
  const earlier = await p.request.get(origin + (await p.locator(".earlier a").first().getAttribute("href")));
  expect(earlier.status() === 200, "the client reads version 1 too");
  expect(await p.getByLabel("Vos prénom et nom").inputValue() === "Luca Rossi", "their name kept");
  await p.getByText("Bon pour accord", { exact: true }).click();
  await p.waitForTimeout(3200);
  await p.getByRole("button", { name: "Accepter le devis" }).click();
  await p.waitForSelector(".answer-state.accepted");
  expect((await p.locator("h1").innerText()).includes("v2"), "accepted: version 2");
  await other.close();
  await page.goto(url);
  await page.waitForSelector(".stamp.big.accepted");
  await page.locator(".proof summary").click();
  expect(/Version\s*D-\d{4}-\d{4} v2/u.test(await page.locator(".proof").innerText()), "the proof names the version");
});

await step("Sofia (billing) finalises it: the next number, frozen", async () => {
  await as(context, origin, "sofia");
  await english();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(origin + "/chest");
  expect((await page.locator(".todo").innerText()).includes("Ready to finalise — prepared by Hugo Bernard"), "on Sofia's desk");
  // Round 3: revenue at a glance, for whoever reads the books.
  const revenue = await page.locator(".revenue").innerText();
  expect(revenue.includes("Revenue, excl. VAT") && revenue.includes("By client, since 1 January") && revenue.includes("By salesperson"), "revenue card: " + revenue.slice(0, 200));
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

await step("Timesheets hands over billable time: one draft invoice, linked back, finalised by Sofia, and Timesheets hears it once", async () => {
  const data = { version: 1, handoff: "901", project: { id: "3", name: "Site vitrine" }, client: { id: "2", name: "garage ROSSI sarl" },
    period: { from: "2026-09-01", to: "2026-09-30" }, currency: "EUR", minutes: 450, amount: 67500, entries: 12,
    lines: [{ label: "Design", task: { id: "7", name: "Design" }, minutes: 450, rate: 9000, amount: 67500, entries: 12 }],
    source: { tool: "timesheets", path: "/chest/projects/3" } };
  await page.request.post(origin + "/_dev/deliver", { form: { type: "timesheets.billable", data: JSON.stringify(data) } });
  await page.request.post(origin + "/_dev/deliver", { form: { type: "timesheets.billable", data: JSON.stringify(data) } });
  expect((await dev()).includes("Time to invoice from Timesheets: Site vitrine"), "billing told in the bell");
  await page.goto(origin + "/chest");
  const item = page.locator(".todo li", { hasText: "prepared by Timesheets" });
  expect(await item.count() === 1, "one draft, on Sofia's desk, whatever the deliveries");
  await item.locator("a.main").click();
  await page.waitForURL(/\/chest\/documents\/\d+$/u);
  const note = await page.locator(".from-timesheets").innerText();
  expect(note.includes("From Timesheets: Site vitrine") && note.includes("Open in Timesheets"), "linked back: " + note);
  expect((await page.locator(".party.buyer").innerText()).includes("Garage Rossi SARL"), "the client found by its name");
  expect(await page.getByLabel("Quantity of line 1").inputValue() === "7,5", "7.5 hours: " + await page.getByLabel("Quantity of line 1").inputValue());
  await page.getByRole("button", { name: "Finalise the invoice" }).click();
  await page.getByRole("button", { name: /^Finalise as F-\d{4}-\d{4}$/u }).click();
  await page.waitForSelector(".stamp.big.unpaid");
  const published = await dev();
  expect(/quotes\.invoiced<\/code> <small>\{&quot;handoff&quot;:&quot;901&quot;,&quot;invoice&quot;:&quot;F-\d{4}-\d{4}&quot;/u.test(published) || /quotes\.invoiced/u.test(published), "quotes.invoiced published");
  expect((published.match(/quotes\.invoiced/gu) ?? []).length === 1, "published once");
});

await step("a payment dated after today is refused out loud: it is not recorded for today in its place", async () => {
  // The kit's DateField (0.2.4): a day after `max` stays as typed, the
  // field says why, and Record waits — the dialog reads the day from its
  // state, which still held today.
  await page.goto(invoiceUrl);
  const later = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  await page.getByRole("button", { name: "Record a payment" }).click();
  await page.locator("#paid-on").fill(later);
  let sent = 0;
  const count = r => { if (r.method() === "POST" && r.url().startsWith(origin + "/chest")) sent++; };
  page.on("request", count);
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await page.locator(".ck-dialog .ck-date .ck-error", { hasText: /or earlier\./u }).waitFor();
  await page.locator(".ck-dialog p.error", { hasText: /or earlier\./u }).waitFor();
  await page.waitForTimeout(800);
  page.off("request", count);
  expect(sent === 0, "nothing sent: " + sent);
  expect(await page.locator("#paid-on").inputValue() === later, "the day stays as typed");
  expect(await page.evaluate(() => document.activeElement?.id === "paid-on"), "the day field has the focus");
  expect(await page.locator("text=Recorded.").count() === 0, "not recorded");
  // Today again: the sentence goes; the dialog closes untouched.
  await page.locator(".ck-dialog").getByRole("button", { name: "Today", exact: true }).click();
  await page.locator(".ck-dialog .ck-error").waitFor({ state: "detached", timeout: 5000 });
  await page.locator(".ck-dialog p.error").waitFor({ state: "detached", timeout: 5000 });
  expect(await page.locator("#paid-on").getAttribute("aria-invalid") === null, "the field holds today again");
  await page.locator(".ck-dialog").getByRole("button", { name: "Cancel" }).click();
  await page.reload();
  expect(await page.locator(".payments li").count() === 1, "still one payment");
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
  // Round 3: the terms and conditions of sale, a PDF sent with every quote.
  await page.locator(".terms-row input[type=file]").setInputFiles(new URL("../../../tools/public-and-private/quotes/test/fixtures/terms-sample.pdf", import.meta.url).pathname);
  await page.locator(".ck-toast", { hasText: "Conditions générales de vente enregistrées" }).waitFor();
  await page.waitForSelector(".terms-file a");
  const terms = await page.request.get(origin + "/chest/terms");
  expect(terms.status() === 200 && Buffer.from(await terms.body()).subarray(0, 5).toString() === "%PDF-", "the terms kept");
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

await step("a link turned off stops working; a new one works", async () => {
  await as(context, origin, "ines");
  await english();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(origin + "/chest/quotes?state=sent");
  await page.locator(".ck-table tbody tr", { hasText: "Jeanne Roux" }).locator(".doc-link").click();
  await page.waitForSelector(".card.online");
  const { other, p } = await visitor("en-GB");
  const secretPath = "/q/SampleAnswerLinkQuoteD0006Roux01";
  await p.goto(origin + secretPath);
  expect((await p.locator("h1").innerText()).startsWith("Quote D-"), "open, in English");
  // The terms and conditions of sale, linked; accepting accepts them too.
  const termsLink = p.getByRole("link", { name: "Terms and conditions of sale (PDF)" });
  const termsPdf = await p.request.get(origin + (await termsLink.getAttribute("href")));
  expect(termsPdf.status() === 200 && Buffer.from(await termsPdf.body()).subarray(0, 5).toString() === "%PDF-", "the client reads the terms");
  expect((await p.locator(".agree").innerText()).includes("and the terms and conditions of sale"), "accepting names the terms");
  await page.getByRole("button", { name: "Turn the link off" }).click();
  await page.locator(".ck-toast", { hasText: "The link no longer works." }).waitFor();
  await p.reload();
  expect((await p.locator("h1").innerText()) === "This link no longer works", "the visitor is told");
  expect(await p.locator(".sheet").count() === 0, "and shown nothing of the quote");
  await page.getByRole("button", { name: "Make a new link" }).click();
  await page.locator(".ck-toast", { hasText: "New link made" }).waitFor();
  const url = await page.locator(".copy-link input").inputValue();
  await p.goto(origin + new URL(url).pathname);
  expect((await p.locator("h1").innerText()).startsWith("Quote D-"), "the new link works");
  const bad = await p.goto(origin + "/q/" + "x".repeat(32));
  expect(bad.status() === 200 && (await p.locator("h1").innerText()) === "This link does not work", "a wrong link says so");
  await other.close();
});

await step("Sofia imports the invoices still to collect: numbers kept, paid ones left out, undo, again", async () => {
  await as(context, origin, "sofia");
  await english();
  await page.goto(origin + "/chest/invoices");
  // Round 3 (N5): switching day's import waits in "More"; the header's
  // quiet action is the weekly one, the bank statement.
  expect(await page.locator(".ck-page-actions").getByRole("link", { name: "Import invoices to collect" }).count() === 0, "import not in the header");
  expect(await page.locator(".ck-page-actions").getByRole("link", { name: "Bank statement" }).count() === 1, "bank statement in the header");
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Import invoices to collect" }).click();
  await page.waitForURL(/\/chest\/import\?kind=invoices$/u);
  const file = new URL("../../../tools/public-and-private/quotes/test/fixtures/open-invoices.csv", import.meta.url).pathname;
  await page.locator('input[type=file]').setInputFiles(file);
  await page.waitForSelector(".mapping table");
  expect(await page.getByLabel("Where column Total TTC goes").inputValue() === "gross", "Total TTC recognised");
  await page.getByRole("button", { name: /^Import 6 rows$/u }).click();
  await page.waitForSelector("text=3 invoices to collect imported.");
  const report = await page.locator(".report").innerText();
  expect(report.includes("1 invoice was already paid in full") && report.includes("Line 6: This date is not valid."), "said: " + report);
  await page.getByRole("button", { name: "Undo this import" }).click();
  await page.waitForSelector("text=Import undone: 3 invoices removed.");
  await page.getByRole("button", { name: "Import another file" }).click();
  await page.getByText("Invoices to collect", { exact: true }).click();
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole("button", { name: /^Import 6 rows$/u }).click();
  await page.waitForSelector("text=3 invoices to collect imported.");
  await page.getByRole("link", { name: "See the invoices to collect" }).click();
  await page.locator(".ck-table tbody tr", { hasText: "F-2026-0344" }).locator(".doc-link").click();
  await page.waitForSelector(".imported-note");
  expect((await page.locator(".imported-note").innerText()).includes("from your previous tool"), "said imported");
  expect(await page.locator(".wide-actions").getByRole("button", { name: "Send a reminder" }).count() === 1, "late: the reminder first");
  expect(await page.getByRole("link", { name: /PDF/u }).count() === 0, "no PDF of ours for it");
});

await step("round 3: Sofia matches her bank's statement — each payment received with its invoice, one tap, Undo, never twice", async () => {
  const statement = new URL("../../../tools/public-and-private/quotes/test/fixtures/bank-statement-fr.csv", import.meta.url).pathname;
  await page.goto(origin + "/chest/invoices");
  await page.locator(".ck-page-actions").getByRole("link", { name: "Bank statement" }).click();
  await page.waitForURL(/\/chest\/bank$/u);
  await page.locator('input[type=file]').setInputFiles(statement);
  await page.waitForSelector(".bank-lines");
  expect((await page.locator("#bank-found").innerText()) === "3 payments received to record", "found: " + await page.locator("#bank-found").innerText());
  expect((await page.locator(".bank").innerText()).includes("1 line of money out: left aside."), "money out left aside");
  const first = page.locator(".bank-line").filter({ has: page.locator(".bank-words", { hasText: "VIR SEPA LIBRAIRIE DES MOTS" }) });
  expect((await first.innerText()).includes("Pays F-2026-0344 · Librairie Des Mots") && (await first.innerText()).includes("Its number is in the bank’s words"), "matched by number: " + await first.innerText());
  await first.getByRole("button", { name: "Record" }).click();
  await page.locator(".ck-toast", { hasText: "recorded on F-2026-0344" }).waitFor();
  await page.locator(".ck-toast-undo").click();
  await page.waitForFunction(() => !document.querySelector(".bank-line.done"));
  await first.getByRole("button", { name: "Record" }).click();
  await first.locator(".ok-line").waitFor();
  const second = page.locator(".bank-line").filter({ has: page.locator(".bank-words", { hasText: "VIR NOUVEAU CLIENT" }) });
  expect((await second.innerText()).includes("Same amount, same client"), "amount and client: " + await second.innerText());
  await second.getByRole("button", { name: "Record" }).click();
  await second.locator(".ok-line").waitFor();
  expect((await page.locator(".bank-line").filter({ has: page.locator(".bank-words", { hasText: "VIR M DUPONT" }) }).innerText()).includes("No invoice found for it."), "no guess");
  // The same statement again: what was recorded is not offered twice.
  await page.getByRole("button", { name: "Read another statement" }).click();
  await page.locator('input[type=file]').setInputFiles(statement);
  await page.waitForSelector(".bank-lines");
  expect((await page.locator("#bank-found").innerText()) === "1 payment received to record", "only the unknown one left");
  expect((await page.locator(".bank").innerText()).includes("2 lines already recorded: left out."), "recorded ones said");
  await page.goto(origin + "/chest/invoices?q=F-2026-0344");
  await page.locator(".ck-table tbody tr", { hasText: "F-2026-0344" }).locator(".doc-link").click();
  expect((await page.locator(".payments").innerText()).includes("VIR SEPA LIBRAIRIE DES MOTS"), "the payment carries the bank's words");
});

await step("the monthly archive: the desk asks for a copy, the export page lists it", async () => {
  await page.goto(origin + "/chest");
  const note = page.locator(".callout", { hasText: "is ready" });
  expect(/The archive of \w+ \d{4} is ready/u.test(await note.innerText()), "the desk asks");
  const zip = await page.request.get(origin + (await note.getByRole("link", { name: "Download it" }).getAttribute("href")));
  expect(zip.status() === 200 && Buffer.from(await zip.body()).subarray(0, 2).toString() === "PK", "a ZIP");
  await page.goto(origin + "/chest/export");
  expect((await page.locator(".archives").innerText()).includes("a copy was downloaded"), "the export page lists it");
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

await step("round 3: a new client from its SIREN — the public directory, or an honest word when it cannot be reached", async () => {
  await as(context, origin, "hugo");
  await english();
  await page.goto(origin + "/chest/clients");
  await page.getByRole("button", { name: "New client" }).first().click();
  await page.getByLabel("SIREN").fill("385 290 309");
  await page.getByRole("button", { name: "Fill in from the SIREN" }).click();
  // The studio's harness has no route to the directory (the SDK's fake
  // egress, fakeChest({ network }), replaces fetch in the harness's own
  // process, not in the tool's): the tool says so and fills nothing. The
  // successful lookup through the fake egress is test/registry.test.ts.
  const said = page.locator("form p.error[role=alert], form .filled");
  await said.first().waitFor();
  const text = await said.first().innerText();
  expect(/could not be reached|Filled from the public directory/u.test(text), "an honest answer: " + text);
  if (/could not be reached/u.test(text)) expect(await page.getByLabel("Company name").inputValue() === "", "nothing invented");
  await page.getByLabel("SIREN").fill("385 290 308");
  expect(await page.getByRole("button", { name: "Fill in from the SIREN" }).isEnabled(), "nine digits: asked");
  await page.getByRole("button", { name: "Fill in from the SIREN" }).click();
  await page.locator("form p.error[role=alert]", { hasText: "SIREN" }).waitFor();
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
  for (const path of ["/chest", "/chest/bank", "/chest/quotes", "/chest/invoices", "/chest/clients", "/chest/clients/1", "/chest/catalogue", "/chest/export", "/chest/settings", "/chest/import", "/chest/import?kind=invoices", "/chest/documents/7", "/chest/documents/11", new URL(invoiceUrl).pathname, new URL(quoteUrl).pathname, answerPath, "/q/SampleAnswerLinkQuoteD0006Roux01", "/"]) {
    await page.goto(origin + path);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(wide <= 0, `${path} scrolls sideways by ${wide}px`);
  }
});

await browser.close();
done(problems);
