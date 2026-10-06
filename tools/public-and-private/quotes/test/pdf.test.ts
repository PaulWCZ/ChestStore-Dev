import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { test } from "node:test";
import type { Line } from "../src/lib/documents.ts";
import type { Buyer, Seller } from "../src/lib/parties.ts";
import { pdfFileName, renderPdf, type PdfInput } from "../src/lib/pdf/document.ts";
import { ImageError, readImage } from "../src/lib/pdf/image.ts";
import { textWidth, winAnsi, wrap } from "../src/lib/pdf/writer.ts";
import { crc32 } from "../src/lib/zip.ts";
import { pageCount, pdfText } from "./support/pdf.ts";

const seller: Seller = {
  legalName: "Atelier Martin SARL", tradeName: "", legalForm: "SARL", capital: 1_000_000, address: "12 rue des Tanneurs", postcode: "69002", city: "Lyon", country: "FR",
  siren: "853128940", siret: "85312894000014", rcsCity: "Lyon", vatNumber: "FR25853128940", franchise: false, vatOnDebits: false, email: "contact@atelier-martin.test",
  phone: "04 78 00 00 00", website: "", bank: "Crédit Lyonnais", iban: "FR76 3000 6000 0112 3456 7890 189", bic: "AGRIFRPP", logo: null, logoType: null, paymentDays: 30,
  penaltyRate: null, earlyDiscount: "", footer: "",
};
const buyer: Buyer = {
  kind: "company", name: "Boulangerie Dupain SAS", contact: "Marie Dupain", email: "marie@dupain.test", address: "3 place Bellecour", postcode: "69002", city: "Lyon", country: "FR",
  deliveryAddress: "", siren: "812345676", vatNumber: "FR19812345676",
};
const l = (description: string, quantity: number, unitPrice: number, vatRate = 2000, extra: Partial<Line> = {}): Line => ({ kind: "line", itemId: null, description, quantity, unit: "", unitPrice, discount: 0, vatRate, goods: false, net: Math.round((quantity * unitPrice) / 1000), ...extra });

function input(extra: Omit<Partial<PdfInput>, "doc"> & { doc?: Partial<PdfInput["doc"]> } = {}): PdfInput {
  return {
    lines: [{ kind: "section", itemId: null, description: "Conception", quantity: 0, unit: "", unitPrice: 0, discount: 0, vatRate: 0, goods: false, net: 0 }, l("Atelier de cadrage", 1000, 90000), l("Maquettes des pages d’accueil", 3000, 45000, 2000, { unit: "jour" }), l("Livre « Typographie »", 2000, 2500, 550, { goods: true })],
    seller,
    buyer,
    reference: null,
    logo: null,
    today: "2026-09-28",
    created: new Date("2026-09-28T10:00:00Z"),
    ...extra,
    doc: {
      type: "invoice", status: "final", number: "F-2026-0042", title: "Refonte du site vitrine", language: "fr", currency: "EUR", issueDate: "2026-09-28", deliveryDate: null,
      validUntil: null, dueDate: "2026-10-28", vatTreatment: "standard", franchise: false, notes: "", depositPercent: null, paymentDays: 30, ...extra.doc,
    },
  };
}

const has = (text: string, ...parts: string[]) => {
  for (const part of parts) assert.ok(text.includes(part), `missing: ${part}\n--- in: ${text.slice(0, 3000)}`);
};

test("an invoice's PDF carries every French mandatory mention, accents and euro sign intact", () => {
  const bytes = renderPdf(input());
  assert.equal(Buffer.from(bytes.subarray(0, 8)).toString("latin1"), "%PDF-1.7");
  assert.ok(Buffer.from(bytes).toString("latin1").trimEnd().endsWith("%%EOF"));
  const text = pdfText(bytes);
  has(text,
    "Facture", "N° F-2026-0042", "Date 28/09/2026", "Échéance 28/10/2026",
    // The seller: name, form and capital, address, SIRET, RCS, VAT number.
    "Atelier Martin SARL", "SARL au capital de 10 000,00 €", "12 rue des Tanneurs", "69002 Lyon", "SIRET 853 128 940 00014", "RCS Lyon 853 128 940", "N° TVA FR25853128940",
    // The buyer: name, address, SIREN (reform), VAT number.
    "FACTURÉ À", "Boulangerie Dupain SAS", "À l’attention de Marie Dupain", "3 place Bellecour", "SIREN 812 345 676", "N° TVA FR19812345676",
    "Objet : Refonte du site vitrine",
    // Lines, units, VAT per rate, totals.
    "Conception", "Atelier de cadrage", "Maquettes des pages d’accueil", "3 jour", "Livre « Typographie »", "5,5 %",
    "Total HT", "TVA 20 % sur 2 250,00", "450,00 €", "TVA 5,5 % sur 50,00", "2,75 €", "Total TTC", "2 752,75 €",
    // The kind of operation (reform), payment terms, penalties, €40, discount.
    "Opération : livraison de biens et prestation de services.",
    "À régler au plus tard le 28/10/2026.", "IBAN FR76 3000 6000 0112 3456 7890 189", "BIC AGRIFRPP",
    "Pénalités de retard : taux de refinancement de la Banque centrale européenne majoré de 10 points.",
    "Indemnité forfaitaire pour frais de recouvrement en cas de retard de paiement : 40 € (art. L441-10 et D441-5 du Code de commerce).",
    "Pas d’escompte pour paiement anticipé.",
    "Page 1 sur 1",
  );
  assert.ok(!text.includes("?"), "every character in WinAnsi");
  assert.ok(!text.includes("BROUILLON"));
});

test("the same document gives the same bytes", () => {
  assert.deepEqual(renderPdf(input()), renderPdf(input()));
});

test("franchise en base: no VAT anywhere, and art. 293 B", () => {
  const text = pdfText(renderPdf(input({ seller: { ...seller, franchise: true, vatNumber: "" }, doc: { franchise: true } })));
  has(text, "TVA non applicable, art. 293 B du CGI.", "Total HT", "Total 2 300,00 €");
  assert.ok(!text.includes("Total TTC"));
  assert.ok(!/TVA 20/u.test(text));
});

test("reverse charge: Autoliquidation, no VAT charged", () => {
  const text = pdfText(renderPdf(input({ buyer: { ...buyer, country: "BE", vatNumber: "BE0477472701" }, doc: { vatTreatment: "reverse_charge", language: "fr" } })));
  has(text, "Autoliquidation : TVA due par le preneur", "TVA (autoliquidation) 0,00 €", "Belgique", "N° TVA BE0477472701");
});

test("penalty rate, early discount, VAT on debits, delivery date and address when the company says so", () => {
  const text = pdfText(renderPdf(input({ seller: { ...seller, penaltyRate: 1215, earlyDiscount: "2 % à 10 jours", vatOnDebits: true }, buyer: { ...buyer, deliveryAddress: "Entrepôt\n8 rue du Port\n69007 Lyon" }, doc: { deliveryDate: "2026-09-20" } })));
  has(text, "Pénalités de retard : 12,15 % par an.", "Escompte pour paiement anticipé : 2 % à 10 jours.", "Option pour le paiement de la TVA d’après les débits.", "Livré / réalisé le 20/09/2026", "ADRESSE DE LIVRAISON", "8 rue du Port");
});

test("an invoice to an individual has no €40 indemnity (it applies between businesses)", () => {
  const text = pdfText(renderPdf(input({ buyer: { ...buyer, kind: "person", name: "Jeanne Roux", siren: "", vatNumber: "" } })));
  assert.ok(!text.includes("40 €"));
  has(text, "Pénalités de retard");
});

test("a quote: validity and acceptance; in English for an English client", () => {
  const fr = pdfText(renderPdf(input({ doc: { type: "quote", status: "sent", number: "D-2026-0007", validUntil: "2026-10-28", dueDate: null } })));
  has(fr, "Devis", "N° D-2026-0007", "DEVIS POUR", "Valable jusqu’au 28/10/2026", "Ce devis est valable jusqu’au 28/10/2026.", "Bon pour accord — date et signature");
  assert.ok(!fr.includes("Indemnité"));
  const en = pdfText(renderPdf(input({ doc: { type: "quote", status: "sent", number: "D-2026-0007", validUntil: "2026-10-28", dueDate: null, language: "en" } })));
  has(en, "Quote", "No. D-2026-0007", "QUOTE FOR", "Valid until 28/10/2026", "Total excl. VAT", "VAT 20% on 2,250.00", "Total incl. VAT", "€2,752.75", "Accepted — date and signature");
});

test("a credit note names the invoice it corrects; a deposit invoice its quote", () => {
  const credit = pdfText(renderPdf(input({ reference: { number: "F-2026-0042", issueDate: "2026-09-12" }, doc: { type: "credit", number: "A-2026-0003", dueDate: null } })));
  has(credit, "Avoir", "N° A-2026-0003", "Facture F-2026-0042", "Avoir sur la facture F-2026-0042 du 12/09/2026.", "Total avoir TTC");
  assert.ok(!credit.includes("À régler"));
  const deposit = pdfText(renderPdf(input({ reference: { number: "D-2026-0004", issueDate: "2026-09-01" }, doc: { depositPercent: 3000 } })));
  has(deposit, "Facture d’acompte", "Acompte de 30 % sur le devis D-2026-0004.");
});

test("a draft is marked on every page and says it is not numbered", () => {
  const many = Array.from({ length: 70 }, (_, i) => l(`Ligne ${i + 1} — une description assez longue pour occuper la place`, 1000, 1000 + i));
  const bytes = renderPdf(input({ lines: many, doc: { status: "draft", number: null, issueDate: null, dueDate: null } }));
  const text = pdfText(bytes);
  assert.ok(pageCount(bytes) >= 3, "several pages");
  assert.equal(text.match(/BROUILLON/gu)?.length, pageCount(bytes));
  has(text, "Brouillon", `Page 1 sur ${pageCount(bytes)}`, "DÉSIGNATION", "Ligne 70");
  assert.equal(text.match(/DÉSIGNATION/gu)?.length, pageCount(bytes), "the table's head on each page");
});

test("file names say what the document is", () => {
  assert.equal(pdfFileName({ type: "invoice", number: "F-2026-0042", language: "fr", depositPercent: null }), "Facture-F-2026-0042.pdf");
  assert.equal(pdfFileName({ type: "invoice", number: "F-2026-0043", language: "fr", depositPercent: 3000 }), "Facture-d-acompte-F-2026-0043.pdf");
  assert.equal(pdfFileName({ type: "quote", number: null, language: "en", depositPercent: null }), "Quote-draft.pdf");
});

// A small PNG: width × height, RGBA, filter "none" on each row.
function png(width: number, height: number, pixel: (x: number, y: number) => [number, number, number, number]): Uint8Array {
  const rows: number[] = [];
  for (let y = 0; y < height; y++) {
    rows.push(0);
    for (let x = 0; x < width; x++) rows.push(...pixel(x, y));
  }
  const chunk = (kind: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(kind, 4, "latin1");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(kind, "latin1"), data])), 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.from(rows))), chunk("IEND", Buffer.alloc(0))]));
}

test("the logo: a PNG with transparency is decoded and printed with its soft mask; a JPEG as it is", () => {
  const logo = readImage(png(4, 2, (x, y) => [x * 60, y * 100, 50, x === 0 ? 0 : 255]));
  assert.equal(logo.width, 4);
  assert.equal(logo.colorSpace, "DeviceRGB");
  assert.deepEqual([...logo.data.subarray(0, 6)], [0, 0, 50, 60, 0, 50]);
  assert.deepEqual([...logo.alpha!], [0, 255, 255, 255, 0, 255, 255, 255]);
  const raw = Buffer.from(renderPdf(input({ logo }))).toString("latin1");
  assert.ok(raw.includes("/Subtype /Image /Width 4 /Height 2 /ColorSpace /DeviceRGB"));
  assert.ok(raw.includes("/SMask"));
  assert.ok(raw.includes("/XObject << /Im0 "));
  // A JPEG's frame header is enough to place it.
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x20, 0x00, 0x40, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
  assert.deepEqual({ ...readImage(jpeg), data: null }, { format: "jpeg", width: 64, height: 32, colorSpace: "DeviceRGB", data: null, adobeInverted: false });
  assert.throws(() => readImage(new TextEncoder().encode("<svg/>")), ImageError);
  assert.throws(() => readImage(png(5000, 1, () => [0, 0, 0, 255])), ImageError);
});

test("text: WinAnsi codes, widths and wrapping", () => {
  assert.equal(winAnsi("€"), 0x80);
  assert.equal(winAnsi("é"), 0xe9);
  assert.equal(winAnsi("’"), 0x92);
  assert.equal(winAnsi(" "), 0xa0);
  assert.equal(winAnsi("→"), 63);
  assert.equal(textWidth("AAA", "Helvetica", 10), 20.01);
  assert.deepEqual(wrap("un deux trois quatre", "Helvetica", 10, 45), ["un deux", "trois", "quatre"]);
  assert.deepEqual(wrap("a\nb", "Helvetica", 10, 100), ["a", "b"]);
  assert.ok(wrap("x".repeat(200), "Helvetica", 10, 100).every(line => textWidth(line, "Helvetica", 10) <= 100));
});
