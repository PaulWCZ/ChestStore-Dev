import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { carriesFacturx, pdfOf } from "../src/lib/archive.ts";
import { finalise, getDocument, invoiceFromQuote, decideQuote, sendQuote, startCreditNote, saveDraft } from "../src/lib/documents.ts";
import type { Line } from "../src/lib/documents.ts";
import { einvoiceXml, type EInvoiceInput } from "../src/lib/einvoice.ts";
import type { Buyer, Seller } from "../src/shared/parties.ts";
import { renderPdf } from "../src/pdf/document.ts";
import { loadFont } from "../src/pdf/fonts.ts";
import { srgbProfile } from "../src/pdf/icc.ts";
import { TrueType } from "../src/pdf/truetype.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { client, company, draft, line, today } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { everyone, ines, lea, sofia } from "./support/members.ts";
import { pdfText } from "./support/pdf.ts";

// Every issued invoice and credit note is a Factur-X: a PDF/A-3 carrying
// its EN 16931 data as factur-x.xml. These tests check what the tool
// writes; the files were also checked by the official validators (the
// Factur-X 1.09.2 XSD and schematrons, veraPDF) — see README, "Factur-X",
// and FACTURX_XSD below to run the XSD check here.

const seller: Seller = {
  legalName: "Atelier Martin SARL", tradeName: "Atelier Martin", legalForm: "SARL", capital: 1_000_000, address: "12 rue des Tanneurs", postcode: "69002", city: "Lyon", country: "FR",
  siren: "853128940", siret: "85312894000014", rcsCity: "Lyon", vatNumber: "FR25853128940", franchise: false, vatOnDebits: false, email: "contact@atelier-martin.test",
  phone: "04 78 00 00 00", website: "", bank: "", iban: "FR76 3000 6000 0112 3456 7890 189", bic: "AGRIFRPP", logo: null, logoType: null, paymentDays: 30,
  penaltyRate: null, earlyDiscount: "", footer: "", paymentLink: "https://pay.example.test/atelier",
};
const buyer: Buyer = {
  kind: "company", name: "Boulangerie Dupain & Fils", contact: "Marie Dupain", email: "marie@dupain.test", address: "3 place Bellecour", postcode: "69002", city: "Lyon", country: "FR",
  deliveryAddress: "Entrepôt\n8 rue du Port\n69007 Lyon", siren: "812345676", vatNumber: "FR19812345676",
};
const l = (description: string, quantity: number, unitPrice: number, vatRate = 2000, extra: Partial<Line> = {}): Line => ({ kind: "line", itemId: null, description, quantity, unit: "", unitPrice, discount: 0, vatRate, goods: false, net: 0, ...extra });
const doc: EInvoiceInput["doc"] = {
  type: "invoice", number: "F-2026-0042", issueDate: "2026-09-28", dueDate: "2026-10-28", deliveryDate: "2026-09-20", currency: "EUR", title: "Refonte du site", notes: "",
  vatTreatment: "standard", franchise: false, depositPercent: null, paymentDays: 30, language: "fr",
};
const lines: Line[] = [
  { kind: "section", itemId: null, description: "Conception", quantity: 0, unit: "", unitPrice: 0, discount: 0, vatRate: 0, goods: false, net: 0 },
  l("Maquettes des pages\nDeux allers-retours", 3000, 45000, 2000, { unit: "jour", discount: 1250 }),
  l("Petit manuel de typographie", 10000, 2400, 550, { goods: true, unit: "exemplaire" }),
  l("Déduction de la facture d’acompte F-2026-0001", 1000, -30000, 2000, { depositOf: "7" }),
];
const tag = (xml: string, name: string) => [...xml.matchAll(new RegExp(`<${name}(?: [^>]*)?>([^<]*)</${name}>`, "gu"))].map(m => m[1]!);

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  chest = await fakeChest({ members: everyone, capabilities: ["members", "files", "notifications"] });
  database = await testDatabase();
  await company(database.sql);
});
after(async () => {
  await chest.close();
  await database.close();
});

test("the CII data says what the invoice says, as EN 16931 wants it", () => {
  const xml = einvoiceXml({ doc, lines, seller, buyer, reference: null });
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<rsm:CrossIndustryInvoice'));
  assert.deepEqual(tag(xml, "ram:ID").slice(0, 3), ["M4", "urn:cen.eu:en16931:2017", "F-2026-0042"]);
  assert.deepEqual(tag(xml, "ram:TypeCode")[0], "380");
  // The French mandatory mentions as coded notes, and how a PA treats it.
  assert.deepEqual(tag(xml, "ram:SubjectCode"), ["AAI", "PMT", "PMD", "AAB", "BAR"]);
  assert.ok(xml.includes("<ram:Content>B2B</ram:Content>"));
  // 3 days at 450.00 less 12.5 %: net price 393.75, line 1,181.25.
  assert.ok(xml.includes("<ram:GrossPriceProductTradePrice><ram:ChargeAmount>450.00</ram:ChargeAmount><ram:AppliedTradeAllowanceCharge><ram:ChargeIndicator><udt:Indicator>false</udt:Indicator></ram:ChargeIndicator><ram:ActualAmount>56.25</ram:ActualAmount>"));
  assert.ok(xml.includes("<ram:NetPriceProductTradePrice><ram:ChargeAmount>393.75</ram:ChargeAmount>"));
  assert.ok(xml.includes('<ram:BilledQuantity unitCode="DAY">3</ram:BilledQuantity>'));
  assert.ok(xml.includes('<ram:BilledQuantity unitCode="H87">10</ram:BilledQuantity>'));
  // A negative price is a negative quantity at a positive price.
  assert.ok(xml.includes('<ram:NetPriceProductTradePrice><ram:ChargeAmount>300.00</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement><ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="C62">-1</ram:BilledQuantity>'));
  assert.deepEqual(tag(xml, "ram:LineTotalAmount"), ["1181.25", "240.00", "-300.00", "1121.25"]);
  // VAT per rate, rounded once; totals as printed.
  assert.deepEqual(tag(xml, "ram:BasisAmount"), ["881.25", "240.00"]);
  assert.deepEqual(tag(xml, "ram:CalculatedAmount"), ["176.25", "13.20"]);
  assert.deepEqual(tag(xml, "ram:GrandTotalAmount"), ["1310.70"]);
  assert.deepEqual(tag(xml, "ram:DuePayableAmount"), ["1310.70"]);
  // Parties: SIREN and SIRET, the French directory's electronic address,
  // the VAT numbers; escaping.
  assert.ok(xml.includes('<ram:GlobalID schemeID="0009">85312894000014</ram:GlobalID>'));
  assert.ok(xml.includes('<ram:URIID schemeID="0225">853128940</ram:URIID>'));
  assert.ok(xml.includes('<ram:URIID schemeID="0225">812345676</ram:URIID>'));
  assert.ok(xml.includes("<ram:Name>Boulangerie Dupain &amp; Fils</ram:Name>"));
  assert.match(xml, /<ram:Description>SARL au capital de 10\s000,00\s€ · RCS Lyon 853\s128\s940<\/ram:Description>/u);
  // Delivery: the address's last line gives postcode and city; the date.
  assert.ok(xml.includes("<ram:ShipToTradeParty><ram:Name>Boulangerie Dupain &amp; Fils</ram:Name><ram:PostalTradeAddress><ram:PostcodeCode>69007</ram:PostcodeCode><ram:LineOne>Entrepôt</ram:LineOne><ram:LineTwo>8 rue du Port</ram:LineTwo><ram:CityName>Lyon</ram:CityName>"));
  assert.ok(xml.includes('<ram:OccurrenceDateTime><udt:DateTimeString format="102">20260920</udt:DateTimeString>'));
  // Payment: SEPA transfer, due date, the online link in the terms.
  assert.ok(xml.includes("<ram:TypeCode>58</ram:TypeCode><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>FR7630006000011234567890189</ram:IBANID>"));
  assert.ok(xml.includes('<ram:DueDateDateTime><udt:DateTimeString format="102">20261028</udt:DateTimeString>'));
  assert.ok(xml.includes("https://pay.example.test/atelier"));
  // The same document, the same bytes.
  assert.equal(einvoiceXml({ doc, lines, seller, buyer, reference: null }), xml);
});

test("deposit invoices, credit notes, reverse charge, the VAT exemption, individuals", () => {
  const deposit = einvoiceXml({ doc: { ...doc, depositPercent: 3000 }, lines: [l("Acompte de 30 %", 1000, 159000)], seller, buyer, reference: null });
  assert.equal(tag(deposit, "ram:TypeCode")[0], "386");
  assert.equal(tag(deposit, "ram:ID")[0], "S1");
  const credit = einvoiceXml({ doc: { ...doc, type: "credit", number: "A-2026-0003", dueDate: null }, lines: [l("Maquettes", 1000, 45000)], seller, buyer, reference: { number: "F-2026-0042", issueDate: "2026-09-12" } });
  assert.equal(tag(credit, "ram:TypeCode")[0], "381");
  assert.ok(credit.includes('<ram:InvoiceReferencedDocument><ram:IssuerAssignedID>F-2026-0042</ram:IssuerAssignedID><ram:FormattedIssueDateTime><qdt:DateTimeString format="102">20260912</qdt:DateTimeString>'));
  assert.ok(!credit.includes("SpecifiedTradeSettlementPaymentMeans"));
  const eu = { ...buyer, country: "BE", siren: "", vatNumber: "BE0765432146", deliveryAddress: "" };
  const reverse = einvoiceXml({ doc: { ...doc, vatTreatment: "reverse_charge", language: "en" }, lines: [l("Workshop", 1000, 65000)], seller, buyer: eu, reference: null });
  assert.deepEqual(tag(reverse, "ram:CategoryCode"), ["AE", "AE"]);
  assert.deepEqual(tag(reverse, "ram:ExemptionReasonCode"), ["VATEX-EU-AE"]);
  assert.ok(reverse.includes("<ram:Content>B2BINT</ram:Content>"));
  const domestic = einvoiceXml({ doc: { ...doc, vatTreatment: "reverse_charge" }, lines: [l("Pose", 1000, 65000)], seller, buyer, reference: null });
  assert.deepEqual(tag(domestic, "ram:ExemptionReasonCode"), ["VATEX-FR-AE"]);
  const franchise = einvoiceXml({ doc: { ...doc, franchise: true }, lines: [l("Cours", 2000, 4000, 0)], seller: { ...seller, franchise: true, vatNumber: "" }, buyer, reference: null });
  assert.deepEqual(tag(franchise, "ram:ExemptionReasonCode"), ["VATEX-FR-FRANCHISE"]);
  // No VAT number: the SIREN as tax registration (EN 16931 BR-E-02).
  assert.ok(franchise.includes('<ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">853128940</ram:ID>'));
  const person = einvoiceXml({ doc, lines: [l("Faire-part", 120000, 350, 2000, { goods: true })], seller: { ...seller, vatOnDebits: true }, buyer: { ...buyer, kind: "person", siren: "", vatNumber: "" }, reference: null });
  assert.ok(person.includes("<ram:Content>B2C</ram:Content>"));
  assert.ok(!person.includes("<ram:SubjectCode>PMT</ram:SubjectCode>")); // the €40 indemnity is between businesses
  assert.ok(person.includes("<ram:DueDateTypeCode>5</ram:DueDateTypeCode>")); // VAT on debits
  assert.equal(tag(person, "ram:ID")[0], "B1");
  assert.throws(() => einvoiceXml({ doc: { ...doc, number: null }, lines, seller, buyer, reference: null }));
});

test("outside the euro: the VAT also in euros at the rate given (BT-6, BT-111); three decimals cannot travel in a Factur-X", async () => {
  const xml = einvoiceXml({ doc: { ...doc, currency: "USD", eurRate: 1_082_300 }, lines: [l("Maquettes", 1000, 100000)], seller, buyer, reference: null });
  assert.deepEqual(tag(xml, "ram:TaxCurrencyCode"), ["EUR"]);
  assert.deepEqual(tag(xml, "ram:InvoiceCurrencyCode"), ["USD"]);
  // 200.00 USD of VAT at 1 € = 1.0823 USD: 184.79 €.
  assert.match(xml, /<ram:TaxTotalAmount currencyID="USD">200\.00<\/ram:TaxTotalAmount><ram:TaxTotalAmount currencyID="EUR">184\.79<\/ram:TaxTotalAmount>/u);
  assert.equal(tag(einvoiceXml({ doc, lines, seller, buyer, reference: null }), "ram:TaxCurrencyCode").length, 0, "in euros, nothing more");
  assert.throws(() => einvoiceXml({ doc: { ...doc, currency: "USD" }, lines, seller, buyer, reference: null }), /rate is missing/u);
  assert.throws(() => einvoiceXml({ doc: { ...doc, currency: "KWD", eurRate: 330_000 }, lines, seller, buyer, reference: null }), /three decimals/u);
  assert.equal(carriesFacturx({ type: "invoice", currency: "KWD", eurRate: 330_000 }), false);
  assert.equal(carriesFacturx({ type: "invoice", currency: "USD", eurRate: null }), false, "issued before the rate was asked");
  assert.equal(carriesFacturx({ type: "credit", currency: "USD", eurRate: 1_082_300 }), true);
  // The PDF says it too.
  const pdf = renderPdf({ doc: { ...doc, status: "final", validUntil: null, currency: "USD", eurRate: 1_082_300 }, lines: [l("Maquettes", 1000, 100000)], seller, buyer, reference: null, logo: null, today: "2026-09-28", created: new Date("2026-09-28T10:00:00Z") });
  assert.match(pdfText(pdf).replace(/\s+/gu, " "), /TVA en euros\s?: 184,79\s€ \(taux de change 1\s€ = 1,0823 USD\)/u);
});

test("an invoice outside the euro asks its exchange rate before it is issued; its credit note keeps it", async () => {
  const { sql } = database;
  const c = await client(sql, { name: "Dollar Inc" });
  const d = await draft(sql, "invoice", c.id, [line("Conseil", 1000, 100000)]);
  await sql`update documents set currency = 'USD' where id = ${d.id}`;
  await assert.rejects(finalise(sql, asMember(sofia), d.id, today), (e: unknown) => (e as { code?: string }).code === "eur_rate_missing");
  await assert.rejects(saveDraft(sql, asMember(sofia), d.id, { eurRate: "abc" }), (e: unknown) => (e as { code?: string }).code === "eur_rate_invalid");
  await assert.rejects(saveDraft(sql, asMember(sofia), d.id, { eurRate: "0" }), (e: unknown) => (e as { code?: string }).code === "eur_rate_invalid");
  await saveDraft(sql, asMember(sofia), d.id, { eurRate: "1,0823" });
  const f = await finalise(sql, asMember(sofia), d.id, today);
  assert.equal(f.eurRate, 1_082_300);
  const credit = await startCreditNote(sql, asMember(sofia), d.id);
  assert.equal(credit.eurRate, 1_082_300, "the VAT taken back at the rate it was charged");
  // In euros, no rate.
  const e = await draft(sql, "invoice", c.id, [line("Conseil", 1000, 100000)]);
  await assert.rejects(saveDraft(sql, asMember(sofia), e.id, { eurRate: "1,1" }), (x: unknown) => (x as { code?: string }).code === "invalid");
});

// The official schema check, when the Factur-X 1.09.2 EN 16931 XSD is at
// hand (FACTURX_XSD=/path/to/Factur-X_EN16931.xsd, from the factur-x
// package on PyPI) and xmllint is installed.
test("the data validates against the Factur-X EN 16931 schema", { skip: !process.env["FACTURX_XSD"] }, () => {
  const dir = mkdtempSync(join(tmpdir(), "facturx-"));
  const samples = {
    invoice: einvoiceXml({ doc, lines, seller, buyer, reference: null }),
    credit: einvoiceXml({ doc: { ...doc, type: "credit", number: "A-2026-0003", dueDate: null }, lines: [l("Maquettes", 1000, 45000)], seller, buyer, reference: { number: "F-2026-0042", issueDate: "2026-09-12" } }),
    dollars: einvoiceXml({ doc: { ...doc, currency: "USD", eurRate: 1_082_300 }, lines, seller, buyer, reference: null }),
    yen: einvoiceXml({ doc: { ...doc, currency: "JPY", eurRate: 162_430_000 }, lines: [l("Maquettes", 1000, 45000)], seller, buyer, reference: null }),
  };
  for (const [name, xml] of Object.entries(samples)) {
    const file = join(dir, name + ".xml");
    writeFileSync(file, xml);
    execFileSync("xmllint", ["--noout", "--schema", process.env["FACTURX_XSD"]!, file], { stdio: "pipe" });
  }
});

// The streams of a PDF, inflated when compressed, with their dictionaries
// (each object "n 0 obj\n<< … >>\nstream\n…").
function streams(bytes: Uint8Array): { dict: string; data: Buffer }[] {
  const raw = Buffer.from(bytes).toString("latin1");
  const out: { dict: string; data: Buffer }[] = [];
  for (const m of raw.matchAll(/ 0 obj\n<<([^]*?)>>\nstream\n/gu)) {
    const length = Number(/\/Length (\d+) >>$/u.exec(m[1]! + " >>")?.[1] ?? /\/Length (\d+)/u.exec(m[1]!)?.[1]);
    const start = m.index! + m[0].length;
    const data = Buffer.from(raw.slice(start, start + length), "latin1");
    out.push({ dict: m[1]!, data: m[1]!.includes("/FlateDecode") ? inflateSync(data) : data });
  }
  return out;
}

test("the PDF is a PDF/A-3 with its fonts embedded and, for an invoice, factur-x.xml attached", () => {
  const xml = einvoiceXml({ doc, lines, seller, buyer, reference: null });
  const bytes = renderPdf({ doc: { ...doc, status: "final", validUntil: null }, lines, seller, buyer, reference: null, logo: null, today, created: new Date("2026-09-28T10:00:00Z"), facturx: xml });
  const raw = Buffer.from(bytes).toString("latin1");
  const all = streams(bytes);
  // The metadata: PDF/A-3B, the Factur-X schema and values.
  const xmp = all.find(s => s.dict.includes("/Type /Metadata"))!.data.toString("utf8");
  for (const part of ["<pdfaid:part>3</pdfaid:part>", "<pdfaid:conformance>B</pdfaid:conformance>", "<fx:DocumentType>INVOICE</fx:DocumentType>", "<fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>",
    "<fx:Version>1.0</fx:Version>", "<fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>", "urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#", "<xmp:CreateDate>2026-09-28T10:00:00+00:00</xmp:CreateDate>"]) {
    assert.ok(xmp.includes(part), part);
  }
  assert.ok(raw.includes("/CreationDate (D:20260928100000+00'00')"));
  // The attached data: the very XML, marked as the invoice's alternative.
  const file = all.find(s => s.dict.includes("/Type /EmbeddedFile"))!;
  assert.ok(file.dict.includes("/Subtype /text#2Fxml"));
  assert.equal(file.data.toString("utf8"), xml);
  assert.ok(/\/Type \/Filespec \/F \(factur-x\.xml\) \/UF <[0-9A-F]+> \/Desc <[0-9A-F]+> \/AFRelationship \/Alternative/u.test(raw));
  assert.ok(/\/AF \[\d+ 0 R\]/u.test(raw));
  // sRGB output intent, fonts embedded (no font left to the reader), an id.
  assert.ok(raw.includes("/OutputIntents [<< /Type /OutputIntent /S /GTS_PDFA1 /OutputConditionIdentifier (sRGB IEC61966-2.1)"));
  assert.ok(!/\/Subtype \/Type1/u.test(raw));
  const fonts = [...raw.matchAll(/\/Subtype \/TrueType \/BaseFont \/([A-Z]{6})\+(\S+)/gu)].map(m => m[2]);
  assert.deepEqual(fonts.sort(), ["LiberationSans", "LiberationSans-Bold", "LiberationSerif", "LiberationSerif-Bold", "LiberationSerif-Italic"]);
  assert.equal(raw.match(/\/FontFile2 \d+ 0 R/gu)?.length, 5);
  assert.ok(/\/ID \[<[0-9a-f]{32}> <[0-9a-f]{32}>\]/u.test(raw));
  // Still the same text for a reader, and the same bytes each time.
  assert.ok(pdfText(bytes).includes("Payer en ligne : https://pay.example.test/atelier"));
  assert.ok(pdfText(bytes).includes("10 exemplaires"));
  assert.deepEqual(renderPdf({ doc: { ...doc, status: "final", validUntil: null }, lines, seller, buyer, reference: null, logo: null, today, created: new Date("2026-09-28T10:00:00Z"), facturx: xml }), bytes);
  // A quote or a draft is a PDF/A too, with nothing attached.
  const quote = Buffer.from(renderPdf({ doc: { ...doc, type: "quote", status: "sent", validUntil: "2026-10-28" }, lines, seller, buyer, reference: null, logo: null, today, created: new Date() })).toString("latin1");
  assert.ok(quote.includes("/OutputIntents") && !quote.includes("/EmbeddedFiles"));
});

test("the embedded fonts: a valid subset holding the glyphs shown, with the font's own widths", () => {
  const sans = loadFont("Helvetica");
  const used = [..."Facture €éàç"].map(ch => sans.font.glyphOf(ch.codePointAt(0)!));
  const subset = sans.font.subset(used);
  assert.ok(subset.length < sans.font.data.length / 2, `${subset.length} of ${sans.font.data.length}`);
  const again = new TrueType(subset);
  assert.equal(again.glyphCount, sans.font.glyphCount);
  assert.equal(again.glyphOf(0x20ac), sans.font.glyphOf(0x20ac));
  assert.equal(again.metrics.postScriptName, "LiberationSans");
  // Metric-compatible with Helvetica: "A" is 667/1000 in both.
  assert.equal(sans.widths["A".charCodeAt(0) - 32], 667);
  // The sRGB profile: an ICC v2 display profile of RGB to XYZ.
  const icc = srgbProfile();
  assert.equal(icc.readUInt32BE(0), icc.length);
  assert.equal(icc.toString("latin1", 12, 24), "mntrRGB XYZ ");
  assert.equal(icc.toString("latin1", 36, 40), "acsp");
});

test("finalised, an invoice's copy of record is its Factur-X; a credit note's too", async () => {
  const { sql } = database;
  const c = await client(sql, { deliveryAddress: "" });
  const q = await draft(sql, "quote", c.id, [line("Refonte", 1000, 500000)], ines);
  await sendQuote(sql, asMember(ines), q.id, null, today);
  await decideQuote(sql, asMember(ines), q.id, "accepted");
  const dep = await invoiceFromQuote(sql, asMember(ines), q.id, 3000);
  const depFinal = await finalise(sql, asMember(sofia), dep.id, today);
  const whole = await invoiceFromQuote(sql, asMember(ines), q.id, null);
  // The deduction line knows its deposit invoice, and keeps it through the
  // editor's saving.
  const before = await getDocument(sql, asMember(lea), whole.id, today);
  assert.equal(before.lines.at(-1)!.depositOf, depFinal.id);
  await saveDraft(sql, asMember(ines), whole.id, { lines: before.lines.map(x => ({ ...x })) });
  assert.equal((await getDocument(sql, asMember(lea), whole.id, today)).lines.at(-1)!.depositOf, depFinal.id);
  // A forged mark is dropped.
  await saveDraft(sql, asMember(ines), whole.id, { lines: [...before.lines.map(x => ({ ...x })), { ...line("Autre", 1000, -100), depositOf: q.id }] });
  assert.equal((await getDocument(sql, asMember(lea), whole.id, today)).lines.at(-1)!.depositOf, null);
  await saveDraft(sql, asMember(ines), whole.id, { lines: before.lines.map(x => ({ ...x })) });
  const final = await finalise(sql, asMember(sofia), whole.id, today);
  const pdf = await pdfOf(sql, asMember(lea), final.id, today);
  const xml = streams(pdf.bytes).find(s => s.dict.includes("/Type /EmbeddedFile"))!.data.toString("utf8");
  assert.equal(tag(xml, "ram:ID")[2], final.number);
  assert.equal(tag(xml, "ram:ID")[0], "S4");
  const [row] = await sql<{ pdf_format: string }[]>`select pdf_format from documents where id = ${final.id}`;
  assert.equal(row!.pdf_format, "factur-x");
  // A credit note of it.
  const credit = await startCreditNote(sql, asMember(sofia), depFinal.id);
  const creditFinal = await finalise(sql, asMember(sofia), credit.id, today);
  const creditPdf = await pdfOf(sql, asMember(lea), creditFinal.id, today);
  const creditXml = streams(creditPdf.bytes).find(s => s.dict.includes("/Type /EmbeddedFile"))!.data.toString("utf8");
  assert.equal(tag(creditXml, "ram:TypeCode")[0], "381");
  assert.equal(tag(creditXml, "ram:IssuerAssignedID")[0], depFinal.number);
  // A reverse-charge invoice cannot be numbered without the buyer's VAT
  // number or SIREN.
  const bare = await client(sql, { name: "Sans numéro", siren: "", vatNumber: "", reverseCharge: true });
  const d = await draft(sql, "invoice", bare.id, [line("Pose", 1000, 10000)]);
  await assert.rejects(finalise(sql, asMember(sofia), d.id, today), (e: unknown) => e instanceof Error && (e as { code?: string }).code === "client_incomplete");
});

test("the fonts are read from the tool's own folder", () => {
  assert.ok(existsSync(join(import.meta.dirname, "..", "src", "pdf", "fonts", "LiberationSans-Regular.ttf")));
  assert.ok(readFileSync(join(import.meta.dirname, "..", "src", "pdf", "fonts", "LICENSE-liberation.txt"), "utf8").includes("SIL OPEN FONT LICENSE Version 1.1"));
});
