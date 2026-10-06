import type { Doc, Line } from "./documents.ts";
import { noVat, operationOf } from "./documents.ts";
import { catalogue, format, locales, type Locale } from "../i18n/index.ts";
import { formatMoney, formatRate, minorDigits } from "./money.ts";
import { spacedSiren, type Buyer, type Seller } from "./parties.ts";
import { lineNet, totals } from "./totals.ts";
import { unitCodes, unitKey } from "./units.ts";

// The structured invoice: an issued invoice, deposit invoice or credit note
// as UN/CEFACT Cross Industry Invoice (CII D16B) XML, profile EN 16931
// (Factur-X 1.0, conformance level "EN 16931", guideline
// urn:cen.eu:en16931:2017) — the file a Factur-X PDF carries
// (factur-x.xml) and the one an approved platform (PA) reads.
//
// Written from the Factur-X 1.09.2 schemas and business rules (FNFE-MPE /
// FeRD, released 2026-08-04, effective 2026-09-01, as distributed in the
// factur-x 7.0 package on PyPI, https://pypi.org/project/factur-x/, read
// 2026-09-29) and the French CTC rules ("BR-FR", Flux 2) of the same
// package. Every element in the order the schema asks. Pure: the same
// document gives the same bytes.
//
// What goes where (EN 16931 terms):
// - BT-1 number, BT-2 date, BT-3 type: 380 invoice, 386 deposit invoice
//   (prepayment), 381 credit note; BT-25/26 the invoice a credit note
//   corrects.
// - BT-23 (the French "cadre de facturation"): B1 goods, S1 services, M1
//   both; B4/S4/M4 for the final invoice after deposits.
// - Notes (BT-21/22): PMT (the €40 recovery indemnity, between
//   businesses), PMD (late-payment penalties), AAB (early-payment
//   discount or its absence) — mandatory in France —, TXD (the VAT
//   mention: franchise, reverse charge, VAT on debits), BAR (B2B, B2BINT,
//   B2C: how the French platforms treat it), AAI (subject and notes).
// - Seller: name, SIRET (BT-29, scheme 0009), SIREN (BT-30, scheme 0002),
//   legal form and capital (BT-33), address, electronic address (BT-34:
//   the SIREN, scheme 0225, the French directory's), VAT number (BT-31) —
//   or, under the VAT exemption without one, the SIREN as tax
//   registration (BT-32, "FC"), which EN 16931 requires for exempt lines.
// - Buyer: name, SIREN, contact, address, electronic address (the SIREN,
//   0225), VAT number. Delivery address and date when known.
// - Lines: a negative price becomes a negative quantity (EN 16931 forbids
//   negative prices); a discount is the price's own allowance, so the net
//   price is exact (up to six decimals) and quantity × net price is the
//   line's amount, rounded once — the tool's own rule (lib/totals.ts).
// - VAT: S (standard, per rate), E (exempt: 0 % lines, "VAT exempt", or
//   the franchise, VATEX-FR-FRANCHISE), AE (reverse charge,
//   VATEX-EU-AE between EU countries, VATEX-FR-AE in France); VAT on debits
//   as due date code 5 (invoice date).
// - Totals exactly as printed; payment means 58 (SEPA transfer) with the
//   IBAN and BIC; due date and terms.

export type EInvoiceInput = {
  doc: Pick<Doc, "type" | "number" | "issueDate" | "dueDate" | "deliveryDate" | "currency" | "title" | "notes" | "vatTreatment" | "franchise" | "depositPercent" | "paymentDays" | "language">;
  lines: readonly Line[];
  seller: Seller;
  buyer: Buyer;
  // The invoice a credit note corrects.
  reference: { number: string; issueDate: string | null } | null;
};

export const facturx = { fileName: "factur-x.xml", version: "1.0", conformanceLevel: "EN 16931", guideline: "urn:cen.eu:en16931:2017" } as const;

const esc = (text: string) =>
  text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/gu, "").replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
const day102 = (d: string) => d.replaceAll("-", "");
const oneLine = (text: string) => text.replace(/\s+/gu, " ").trim();

// A decimal of `digits` places from an integer of 10^-scale units, exact:
// decimal(12345, 2) = "123.45", decimal(-5, 2) = "-0.05".
function decimal(value: bigint | number, scale: number, digits = scale): string {
  const v = BigInt(value);
  const negative = v < 0n;
  const all = (negative ? -v : v).toString().padStart(scale + 1, "0");
  const whole = scale > 0 ? all.slice(0, -scale) : all;
  let fraction = scale > 0 ? all.slice(-scale) : "";
  // Fewer places when they are zeros (never below `digits`).
  while (fraction.length > digits && fraction.endsWith("0")) fraction = fraction.slice(0, -1);
  const text = fraction ? `${whole}.${fraction}` : whole;
  return (negative && /[1-9]/u.test(text) ? "-" : "") + text;
}

// The VAT category of a document's lines at a rate.
type Category = { code: "S" | "E" | "AE"; rate: number; reason: string | null; reasonCode: string | null };

function categoryOf(input: EInvoiceInput, rate: number, words: ReturnType<typeof catalogue>["pdf"]): Category {
  const { doc, buyer } = input;
  if (doc.franchise) return { code: "E", rate: 0, reason: words.franchise, reasonCode: "VATEX-FR-FRANCHISE" };
  if (doc.vatTreatment === "reverse_charge") return { code: "AE", rate: 0, reason: words.reverseCharge, reasonCode: buyer.country === "FR" ? "VATEX-FR-AE" : "VATEX-EU-AE" };
  if (rate > 0) return { code: "S", rate, reason: null, reasonCode: null };
  return { code: "E", rate: 0, reason: words.exempt, reasonCode: null };
}

function address(tag: string, p: { address: string; postcode: string; city: string; country: string }): string {
  const lines = p.address.split("\n").map(oneLine).filter(Boolean);
  const three = lines.length > 3 ? [...lines.slice(0, 2), lines.slice(2).join(", ")] : lines;
  return `<ram:${tag}>` +
    (p.postcode ? `<ram:PostcodeCode>${esc(p.postcode)}</ram:PostcodeCode>` : "") +
    three.map((l, i) => `<ram:Line${["One", "Two", "Three"][i]}>${esc(l)}</ram:Line${["One", "Two", "Three"][i]}>`).join("") +
    (p.city ? `<ram:CityName>${esc(p.city)}</ram:CityName>` : "") +
    `<ram:CountryID>${esc(p.country || "FR")}</ram:CountryID></ram:${tag}>`;
}

// A delivery address typed as free lines: the last "69100 Villeurbanne"
// gives the postcode and city.
function deliveryAddress(text: string, country: string): { address: string; postcode: string; city: string; country: string } {
  const lines = text.split("\n").map(oneLine).filter(Boolean);
  const last = lines.at(-1) ?? "";
  const m = /^(\d{4,5})\s+(.+)$/u.exec(last);
  return m ? { address: lines.slice(0, -1).join("\n"), postcode: m[1]!, city: m[2]!, country } : { address: lines.join("\n"), postcode: "", city: "", country };
}

export function einvoiceXml(input: EInvoiceInput): string {
  const { doc, seller, buyer } = input;
  if (!doc.number || !doc.issueDate) throw new Error("an e-invoice is made of an issued document");
  const locale: Locale = doc.language;
  const t = catalogue(locale).pdf;
  const digits = minorDigits(doc.currency);
  const amount = (minor: number) => decimal(minor, digits, digits);
  const withoutVat = noVat(doc);
  const lines = input.lines.filter(l => l.kind === "line");
  const sums = totals(lines, { noVat: withoutVat });
  const money = (minor: number) => formatMoney(minor, doc.currency, locale);

  // BT-23: the billing framework of the French reform.
  const operation = operationOf(lines);
  const letter = operation === "goods" ? "B" : operation === "services" ? "S" : "M";
  const afterDeposits = doc.type === "invoice" && doc.depositPercent === null && lines.some(l => l.depositOf);
  const framework = letter + (afterDeposits ? "4" : "1");
  const typeCode = doc.type === "credit" ? "381" : doc.depositPercent !== null ? "386" : "380";
  const business = buyer.kind === "person" ? "B2C" : buyer.country === "FR" ? "B2B" : "B2BINT";

  // --- Notes.
  const notes: [string, string][] = [];
  const subject = [doc.title ? format(t.subject, { title: doc.title }) : "", doc.notes].filter(Boolean).join("\n");
  if (subject) notes.push([subject, "AAI"]);
  if (buyer.kind === "company") notes.push([t.indemnity, "PMT"]);
  notes.push([seller.penaltyRate === null ? t.penaltiesLegal : format(t.penalties, { rate: formatRate(seller.penaltyRate, locale) }), "PMD"]);
  notes.push([seller.earlyDiscount ? format(t.earlyDiscount, { terms: seller.earlyDiscount }) : t.noDiscount, "AAB"]);
  const vatMention = doc.franchise ? t.franchise : doc.vatTreatment === "reverse_charge" ? t.reverseCharge : seller.vatOnDebits ? t.vatOnDebits : "";
  if (vatMention) notes.push([vatMention, "TXD"]);
  notes.push([business, "BAR"]);

  // --- Lines.
  const items = lines.map((l, i) => {
    const flip = l.unitPrice < 0;
    const price = BigInt(Math.abs(l.unitPrice));
    const quantity = BigInt(flip ? -l.quantity : l.quantity);
    // Prices in 10^-(digits+4) units: the discount is exact on them.
    const gross = price * 10_000n;
    const allowance = price * BigInt(l.discount);
    const net = gross - allowance;
    const [name = "", ...rest] = l.description.split("\n");
    const description = rest.map(oneLine).filter(Boolean).join(" ");
    const cat = categoryOf(input, l.vatRate, t);
    const code = unitCodes[unitKey(l.unit, locales.map(x => catalogue(x).pdf)) ?? ""] ?? "C62";
    const lineTotal = flip ? -lineNet({ quantity: l.quantity, unitPrice: Math.abs(l.unitPrice), discount: l.discount }) : lineNet(l);
    return `<ram:IncludedSupplyChainTradeLineItem>` +
      `<ram:AssociatedDocumentLineDocument><ram:LineID>${i + 1}</ram:LineID></ram:AssociatedDocumentLineDocument>` +
      `<ram:SpecifiedTradeProduct><ram:Name>${esc(oneLine(name) || "—")}</ram:Name>${description ? `<ram:Description>${esc(description)}</ram:Description>` : ""}</ram:SpecifiedTradeProduct>` +
      `<ram:SpecifiedLineTradeAgreement>` +
      (l.discount > 0 ? `<ram:GrossPriceProductTradePrice><ram:ChargeAmount>${decimal(gross, digits + 4, digits)}</ram:ChargeAmount><ram:AppliedTradeAllowanceCharge><ram:ChargeIndicator><udt:Indicator>false</udt:Indicator></ram:ChargeIndicator><ram:ActualAmount>${decimal(allowance, digits + 4, digits)}</ram:ActualAmount></ram:AppliedTradeAllowanceCharge></ram:GrossPriceProductTradePrice>` : "") +
      `<ram:NetPriceProductTradePrice><ram:ChargeAmount>${decimal(net, digits + 4, digits)}</ram:ChargeAmount></ram:NetPriceProductTradePrice>` +
      `</ram:SpecifiedLineTradeAgreement>` +
      `<ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="${code}">${decimal(quantity, 3, 0)}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>` +
      `<ram:SpecifiedLineTradeSettlement>` +
      `<ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${cat.code}</ram:CategoryCode><ram:RateApplicablePercent>${decimal(cat.rate, 2, 2)}</ram:RateApplicablePercent></ram:ApplicableTradeTax>` +
      `<ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${amount(lineTotal)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>` +
      `</ram:SpecifiedLineTradeSettlement>` +
      `</ram:IncludedSupplyChainTradeLineItem>`;
  });

  // --- The parties.
  const legal = [seller.legalForm && (seller.capital !== null ? format(t.capital, { form: seller.legalForm, amount: money(seller.capital) }) : seller.legalForm),
    seller.rcsCity && seller.siren ? format(t.rcs, { city: seller.rcsCity, siren: spacedSiren(seller.siren) }) : ""].filter(Boolean).join(" · ");
  const sellerContact = seller.phone || seller.email
    ? `<ram:DefinedTradeContact>${seller.phone ? `<ram:TelephoneUniversalCommunication><ram:CompleteNumber>${esc(seller.phone)}</ram:CompleteNumber></ram:TelephoneUniversalCommunication>` : ""}${seller.email ? `<ram:EmailURIUniversalCommunication><ram:URIID>${esc(seller.email)}</ram:URIID></ram:EmailURIUniversalCommunication>` : ""}</ram:DefinedTradeContact>`
    : "";
  const sellerTax = seller.vatNumber
    ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(seller.vatNumber)}</ram:ID></ram:SpecifiedTaxRegistration>`
    : seller.siren ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${esc(seller.siren)}</ram:ID></ram:SpecifiedTaxRegistration>` : "";
  const sellerParty = `<ram:SellerTradeParty>` +
    (seller.siret ? `<ram:GlobalID schemeID="0009">${esc(seller.siret)}</ram:GlobalID>` : "") +
    `<ram:Name>${esc(seller.legalName)}</ram:Name>` +
    (legal ? `<ram:Description>${esc(legal)}</ram:Description>` : "") +
    `<ram:SpecifiedLegalOrganization>${seller.siren ? `<ram:ID schemeID="0002">${esc(seller.siren)}</ram:ID>` : ""}${seller.tradeName && seller.tradeName !== seller.legalName ? `<ram:TradingBusinessName>${esc(seller.tradeName)}</ram:TradingBusinessName>` : ""}</ram:SpecifiedLegalOrganization>` +
    sellerContact +
    address("PostalTradeAddress", seller) +
    (seller.siren ? `<ram:URIUniversalCommunication><ram:URIID schemeID="0225">${esc(seller.siren)}</ram:URIID></ram:URIUniversalCommunication>` : "") +
    sellerTax +
    `</ram:SellerTradeParty>`;
  const buyerContact = buyer.contact || buyer.email
    ? `<ram:DefinedTradeContact>${buyer.contact ? `<ram:PersonName>${esc(buyer.contact)}</ram:PersonName>` : ""}${buyer.email ? `<ram:EmailURIUniversalCommunication><ram:URIID>${esc(buyer.email)}</ram:URIID></ram:EmailURIUniversalCommunication>` : ""}</ram:DefinedTradeContact>`
    : "";
  const buyerParty = `<ram:BuyerTradeParty>` +
    `<ram:Name>${esc(buyer.name)}</ram:Name>` +
    (buyer.siren ? `<ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${esc(buyer.siren)}</ram:ID></ram:SpecifiedLegalOrganization>` : "") +
    buyerContact +
    address("PostalTradeAddress", buyer) +
    (buyer.siren ? `<ram:URIUniversalCommunication><ram:URIID schemeID="0225">${esc(buyer.siren)}</ram:URIID></ram:URIUniversalCommunication>` : "") +
    (buyer.vatNumber ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(buyer.vatNumber)}</ram:ID></ram:SpecifiedTaxRegistration>` : "") +
    `</ram:BuyerTradeParty>`;

  const delivery = `<ram:ApplicableHeaderTradeDelivery>` +
    (buyer.deliveryAddress ? `<ram:ShipToTradeParty><ram:Name>${esc(buyer.name)}</ram:Name>${address("PostalTradeAddress", deliveryAddress(buyer.deliveryAddress, buyer.country || "FR"))}</ram:ShipToTradeParty>` : "") +
    (doc.deliveryDate ? `<ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime><udt:DateTimeString format="102">${day102(doc.deliveryDate)}</udt:DateTimeString></ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent>` : "") +
    `</ram:ApplicableHeaderTradeDelivery>`;

  // --- Settlement.
  const payment = doc.type !== "credit" && seller.iban
    ? `<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>58</ram:TypeCode><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${esc(seller.iban.replace(/\s/gu, ""))}</ram:IBANID></ram:PayeePartyCreditorFinancialAccount>${seller.bic ? `<ram:PayeeSpecifiedCreditorFinancialInstitution><ram:BICID>${esc(seller.bic)}</ram:BICID></ram:PayeeSpecifiedCreditorFinancialInstitution>` : ""}</ram:SpecifiedTradeSettlementPaymentMeans>`
    : "";
  const debits = seller.vatOnDebits && !doc.franchise && doc.vatTreatment !== "reverse_charge";
  const taxes = sums.rates.map(r => {
    const cat = categoryOf(input, r.rate, t);
    return `<ram:ApplicableTradeTax>` +
      `<ram:CalculatedAmount>${amount(r.vat)}</ram:CalculatedAmount>` +
      `<ram:TypeCode>VAT</ram:TypeCode>` +
      (cat.reason ? `<ram:ExemptionReason>${esc(cat.reason)}</ram:ExemptionReason>` : "") +
      `<ram:BasisAmount>${amount(r.base)}</ram:BasisAmount>` +
      `<ram:CategoryCode>${cat.code}</ram:CategoryCode>` +
      (cat.reasonCode ? `<ram:ExemptionReasonCode>${cat.reasonCode}</ram:ExemptionReasonCode>` : "") +
      (debits ? `<ram:DueDateTypeCode>5</ram:DueDateTypeCode>` : "") +
      `<ram:RateApplicablePercent>${decimal(cat.rate, 2, 2)}</ram:RateApplicablePercent>` +
      `</ram:ApplicableTradeTax>`;
  }).join("");
  const termsText = doc.type === "credit" ? t.creditTerms
    : [doc.dueDate ? format(t.dueBy, { date: doc.dueDate.split("-").reverse().join("/") }) : doc.paymentDays === 0 ? t.dueOnReceipt : format(t.dueIn, { days: doc.paymentDays }),
      seller.paymentLink ? format(t.payOnline, { link: seller.paymentLink }) : ""].filter(Boolean).join(" ");
  const terms = `<ram:SpecifiedTradePaymentTerms><ram:Description>${esc(termsText)}</ram:Description>` +
    (doc.type !== "credit" && doc.dueDate ? `<ram:DueDateDateTime><udt:DateTimeString format="102">${day102(doc.dueDate)}</udt:DateTimeString></ram:DueDateDateTime>` : "") +
    `</ram:SpecifiedTradePaymentTerms>`;
  const summation = `<ram:SpecifiedTradeSettlementHeaderMonetarySummation>` +
    `<ram:LineTotalAmount>${amount(sums.net)}</ram:LineTotalAmount>` +
    `<ram:TaxBasisTotalAmount>${amount(sums.net)}</ram:TaxBasisTotalAmount>` +
    `<ram:TaxTotalAmount currencyID="${esc(doc.currency)}">${amount(sums.vat)}</ram:TaxTotalAmount>` +
    `<ram:GrandTotalAmount>${amount(sums.gross)}</ram:GrandTotalAmount>` +
    `<ram:DuePayableAmount>${amount(sums.gross)}</ram:DuePayableAmount>` +
    `</ram:SpecifiedTradeSettlementHeaderMonetarySummation>`;
  const corrected = doc.type === "credit" && input.reference
    ? `<ram:InvoiceReferencedDocument><ram:IssuerAssignedID>${esc(input.reference.number)}</ram:IssuerAssignedID>${input.reference.issueDate ? `<ram:FormattedIssueDateTime><qdt:DateTimeString format="102">${day102(input.reference.issueDate)}</qdt:DateTimeString></ram:FormattedIssueDateTime>` : ""}</ram:InvoiceReferencedDocument>`
    : "";
  const settlement = `<ram:ApplicableHeaderTradeSettlement>` +
    (doc.type !== "credit" ? `<ram:PaymentReference>${esc(doc.number)}</ram:PaymentReference>` : "") +
    `<ram:InvoiceCurrencyCode>${esc(doc.currency)}</ram:InvoiceCurrencyCode>` +
    payment + taxes + terms + summation + corrected +
    `</ram:ApplicableHeaderTradeSettlement>`;

  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">` +
    `<rsm:ExchangedDocumentContext>` +
    `<ram:BusinessProcessSpecifiedDocumentContextParameter><ram:ID>${framework}</ram:ID></ram:BusinessProcessSpecifiedDocumentContextParameter>` +
    `<ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>${facturx.guideline}</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter>` +
    `</rsm:ExchangedDocumentContext>` +
    `<rsm:ExchangedDocument>` +
    `<ram:ID>${esc(doc.number)}</ram:ID>` +
    `<ram:TypeCode>${typeCode}</ram:TypeCode>` +
    `<ram:IssueDateTime><udt:DateTimeString format="102">${day102(doc.issueDate)}</udt:DateTimeString></ram:IssueDateTime>` +
    notes.map(([content, code]) => `<ram:IncludedNote><ram:Content>${esc(content)}</ram:Content><ram:SubjectCode>${code}</ram:SubjectCode></ram:IncludedNote>`).join("") +
    `</rsm:ExchangedDocument>` +
    `<rsm:SupplyChainTradeTransaction>` +
    items.join("") +
    `<ram:ApplicableHeaderTradeAgreement>${sellerParty}${buyerParty}</ram:ApplicableHeaderTradeAgreement>` +
    delivery +
    settlement +
    `</rsm:SupplyChainTradeTransaction>` +
    `</rsm:CrossIndustryInvoice>\n`;
}
