import type { Doc, Line } from "../lib/documents.ts";
import { noVat, operationOf } from "../lib/documents.ts";
import { catalogue, countryName as nameOfCountry, format, formatDay, type Locale } from "../i18n/index.ts";
import { formatMoney, formatNumber, formatQuantity, formatRate } from "../shared/money.ts";
import { addressLines, spacedSiren, type Buyer, type Seller } from "../shared/parties.ts";
import { facturx } from "../lib/einvoice.ts";
import { totals } from "../shared/totals.ts";
import { unitText } from "../shared/units.ts";
import type { Image } from "./image.ts";
import type { FontName } from "./metrics.ts";
import { A4, Page, PdfWriter, textWidth, wrap, type Rgb } from "./writer.ts";

// The paper document: a quote, an invoice (or a deposit invoice) or a
// credit note, on A4, in the document's language, with every mention French
// law asks of an invoice between businesses (CGI art. 242 nonies A, Code de
// commerce L441-9, L441-10, D441-5, R123-237) and the new ones of the
// e-invoicing reform (the buyer's SIREN, the delivery address, the kind of
// operation, the option for VAT on debits). A draft is marked as such on
// every page: it is not an invoice.
//
// Letterpress stationery: ink blue-black on white, one oxblood accent, the
// document's name in a classic serif (Times), the figures in a sans
// (Helvetica) right-aligned.

export type PdfInput = {
  doc: Pick<Doc, "type" | "status" | "number" | "title" | "language" | "currency" | "issueDate" | "deliveryDate" | "validUntil" | "dueDate" | "vatTreatment" | "franchise" | "notes" | "depositPercent" | "paymentDays">;
  lines: readonly Line[];
  seller: Seller;
  buyer: Buyer | null;
  // The quote an invoice follows, the invoice a credit note corrects.
  reference: { number: string; issueDate: string | null } | null;
  logo: Image | null;
  // The date a draft is shown with (today); a numbered document has its own.
  today: string;
  created: Date;
  // An issued invoice's or credit note's structured data (lib/einvoice.ts),
  // attached as factur-x.xml: the PDF is then a Factur-X.
  facturx?: string;
};

const ink: Rgb = [0.086, 0.106, 0.18];
const grey: Rgb = [0.36, 0.38, 0.44];
const rule: Rgb = [0.8, 0.8, 0.82];
const accent: Rgb = [0.49, 0.122, 0.173];
const wash: Rgb = [0.965, 0.957, 0.945];
const mark: Rgb = [0.955, 0.925, 0.93];

const margin = 48;
const right = A4.width - margin;
const width = right - margin;
const bottom = A4.height - 74;

export function renderPdf(input: PdfInput): Uint8Array {
  const { doc, seller, buyer } = input;
  const locale: Locale = doc.language;
  const t = catalogue(locale).pdf;
  const countryName = (code: string) => nameOfCountry(code, locale);
  const money = (minor: number) => formatMoney(minor, doc.currency, locale);
  const figure = (minor: number) => formatNumber(minor, doc.currency, locale);
  const date = (d: string | null) => (d ? formatDay(d, locale, { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
  const draft = doc.status === "draft";
  const withoutVat = noVat(doc);
  const sums = totals(input.lines, { noVat: withoutVat });

  const pdf = new PdfWriter();
  const logo = input.logo ? pdf.addImage(input.logo) : null;
  let page = newPage();
  let y = margin;

  function newPage(): Page {
    const p = pdf.addPage();
    if (draft) p.rotated(150, 620, t.draftMark, "Helvetica-Bold", 96, mark, 35);
    return p;
  }

  // Room for h more points on this page, or a new page (with the table's
  // head again when inside the table).
  function room(h: number, again?: () => void): void {
    if (y + h <= bottom) return;
    page = newPage();
    y = margin;
    again?.();
  }

  const title = doc.type === "quote" ? t.quote : doc.type === "credit" ? t.credit : doc.depositPercent !== null ? t.deposit : t.invoice;

  // --- Letterhead: the seller, left; the document, right.
  let left = margin;
  if (logo !== null && input.logo) {
    const scale = Math.min(150 / input.logo.width, 56 / input.logo.height, 1);
    const w = input.logo.width * scale, h = input.logo.height * scale;
    page.image(logo, margin, left, w, h);
    left += h + 12;
  }
  page.text(margin, left + 12, seller.tradeName || seller.legalName, "Times-Bold", 14, ink);
  left += 20;
  if (seller.tradeName && seller.tradeName !== seller.legalName) {
    page.text(margin, left + 8, seller.legalName, "Helvetica", 8.5, grey);
    left += 11;
  }
  const sellerLines = [...addressLines(seller, countryName), ...[seller.phone, seller.email, seller.website].filter(Boolean)];
  for (const l of sellerLines) {
    page.text(margin, left + 8, l, "Helvetica", 8.5, grey);
    left += 11;
  }

  let r = margin + 22;
  page.text(right, r, title, "Times-Roman", 26, ink, { align: "right" });
  r += 18;
  if (draft) page.text(right, r, t.draftNote, "Helvetica-Bold", 9.5, accent, { align: "right" });
  else page.text(right, r, format(t.numbered, { number: doc.number ?? "" }), "Helvetica-Bold", 10.5, ink, { align: "right" });
  r += 8;
  page.line(right - 150, r, right, r, accent, 1.2);
  r += 6;
  const meta: [string, string][] = [[t.date, date(doc.issueDate ?? input.today)]];
  if (doc.type === "quote" && doc.validUntil) meta.push([t.validUntil, date(doc.validUntil)]);
  if (doc.type === "invoice") meta.push([t.dueDate, doc.dueDate ? date(doc.dueDate) : format(t.dueIn, { days: doc.paymentDays })]);
  if (doc.deliveryDate && doc.deliveryDate !== doc.issueDate) meta.push([t.deliveryDate, date(doc.deliveryDate)]);
  if (input.reference) meta.push([doc.type === "credit" ? t.invoiceRef : t.quoteRef, input.reference.number]);
  for (const [label, value] of meta) {
    r += 12;
    page.text(right - 96, r, label, "Helvetica", 8.5, grey, { align: "right" });
    page.text(right, r, value, "Helvetica", 9, ink, { align: "right" });
  }

  // --- The buyer, where a window envelope shows it.
  let b = Math.max(left, r) + 22;
  const boxX = 322;
  const boxW = right - boxX;
  const startB = b;
  page.text(boxX, b, doc.type === "quote" ? t.quoteFor : t.billTo, "Helvetica-Bold", 7, accent, { spacing: 1 });
  b += 14;
  if (buyer) {
    for (const l of wrap(buyer.name, "Helvetica-Bold", 10.5, boxW)) {
      page.text(boxX, b, l, "Helvetica-Bold", 10.5, ink);
      b += 13;
    }
    if (buyer.contact) {
      page.text(boxX, b, format(t.attention, { name: buyer.contact }), "Helvetica", 9, ink);
      b += 12;
    }
    for (const l of addressLines(buyer, countryName)) {
      for (const w of wrap(l, "Helvetica", 9, boxW)) {
        page.text(boxX, b, w, "Helvetica", 9, ink);
        b += 12;
      }
    }
    b += 3;
    if (buyer.siren) {
      page.text(boxX, b, format(t.siren, { value: spacedSiren(buyer.siren) }), "Helvetica", 8.5, grey);
      b += 11;
    }
    if (buyer.vatNumber) {
      page.text(boxX, b, format(t.vatNumber, { value: buyer.vatNumber }), "Helvetica", 8.5, grey);
      b += 11;
    }
    if (buyer.deliveryAddress) {
      b += 6;
      page.text(boxX, b, t.deliverTo, "Helvetica-Bold", 7, accent, { spacing: 1 });
      b += 12;
      for (const l of buyer.deliveryAddress.split("\n").filter(Boolean)) {
        page.text(boxX, b, l, "Helvetica", 9, ink);
        b += 12;
      }
    }
  } else {
    page.text(boxX, b, t.noClient, "Helvetica", 9, grey);
    b += 12;
  }
  // The seller's identification, left of the buyer: who issues it.
  let s = startB;
  page.text(margin, s, t.from, "Helvetica-Bold", 7, accent, { spacing: 1 });
  s += 14;
  const ids: string[] = [];
  if (seller.siret) ids.push(format(t.siret, { value: spacedSiren(seller.siret) }));
  else if (seller.siren) ids.push(format(t.siren, { value: spacedSiren(seller.siren) }));
  if (seller.vatNumber && !seller.franchise) ids.push(format(t.vatNumber, { value: seller.vatNumber }));
  if (seller.rcsCity && seller.siren) ids.push(format(t.rcs, { city: seller.rcsCity, siren: spacedSiren(seller.siren) }));
  for (const l of ids) {
    page.text(margin, s, l, "Helvetica", 8.5, ink);
    s += 11;
  }
  y = Math.max(b, s) + 14;

  // --- The subject.
  if (doc.title) {
    for (const l of wrap(format(t.subject, { title: doc.title }), "Times-Italic", 12, width)) {
      page.text(margin, y + 10, l, "Times-Italic", 12, ink);
      y += 15;
    }
    y += 8;
  }

  // --- The lines.
  const anyDiscount = input.lines.some(l => l.kind === "line" && l.discount > 0);
  type Column = { key: "qty" | "price" | "discount" | "vat" | "total"; label: string; w: number };
  // The quantity's column fits its widest cell ("10 exemplaires"), within
  // bounds.
  const qtyText = (line: Line) => formatQuantity(line.quantity, locale) + (line.unit ? " " + unitText(line.unit, line.quantity, t, locale) : "");
  const qtyWidth = Math.min(120, Math.max(64, ...input.lines.filter(x => x.kind === "line").map(x => textWidth(qtyText(x), "Helvetica", 9.5) + 8)));
  const columns: Column[] = [
    { key: "qty", label: t.quantity, w: qtyWidth },
    { key: "price", label: t.unitPrice, w: 72 },
    ...(anyDiscount ? [{ key: "discount" as const, label: t.discount, w: 42 }] : []),
    ...(withoutVat ? [] : [{ key: "vat" as const, label: t.vat, w: 40 }]),
    { key: "total", label: t.amount, w: 80 },
  ];
  const descW = width - columns.reduce((s2, c) => s2 + c.w, 0) - 10;
  const head = () => {
    page.text(margin, y + 9, t.description.toUpperCase(), "Helvetica-Bold", 7, grey, { spacing: 0.6 });
    let x = margin + descW + 10;
    for (const c of columns) {
      x += c.w;
      page.text(x, y + 9, c.label.toUpperCase(), "Helvetica-Bold", 7, grey, { align: "right", spacing: 0.6 });
    }
    y += 15;
    page.line(margin, y, right, y, ink, 0.9);
    y += 2;
  };
  head();
  const size = 9.5;
  for (const [index, line] of input.lines.entries()) {
    if (line.kind === "section") {
      const texts = wrap(line.description, "Times-Bold", 11.5, width);
      room(texts.length * 14 + 16, head);
      y += index === 0 ? 8 : 12;
      for (const l of texts) {
        page.text(margin, y + 9, l, "Times-Bold", 11.5, ink);
        y += 14;
      }
      y += 2;
      continue;
    }
    const texts = wrap(line.description || "—", "Helvetica", size, descW);
    const h = texts.length * 12 + 9;
    room(h, head);
    const top = y + 5;
    texts.forEach((l, i) => page.text(margin, top + 9 + i * 12, l, i === 0 ? "Helvetica" : "Helvetica", size, i === 0 ? ink : grey));
    let x = margin + descW + 10;
    const cells: Record<Column["key"], string> = {
      qty: qtyText(line),
      price: figure(line.unitPrice),
      discount: line.discount > 0 ? "−" + formatRate(line.discount, locale) : "",
      vat: formatRate(line.vatRate, locale),
      total: figure(line.net),
    };
    for (const c of columns) {
      x += c.w;
      const font: FontName = c.key === "total" ? "Helvetica-Bold" : "Helvetica";
      page.text(x, top + 9, fit(cells[c.key], font, size, c.w - 4), font, size, ink, { align: "right" });
    }
    y += h;
    page.line(margin, y, right, y, rule, 0.35);
  }
  page.line(margin, y, right, y, ink, 0.9);
  y += 16;

  // --- Totals, right; what the law says about VAT, left.
  const totalsRows: [string, string, "plain" | "strong"][] = [];
  if (!withoutVat) {
    totalsRows.push([t.net, money(sums.net), "plain"]);
    for (const rate of sums.rates) totalsRows.push([format(t.vatAt, { rate: formatRate(rate.rate, locale), base: figure(rate.base) }), money(rate.vat), "plain"]);
    totalsRows.push([doc.type === "credit" ? t.creditGross : t.gross, money(sums.gross), "strong"]);
  } else {
    totalsRows.push([t.net, money(sums.net), "plain"]);
    if (doc.vatTreatment === "reverse_charge" && !doc.franchise) totalsRows.push([t.vatReverse, money(0), "plain"]);
    totalsRows.push([doc.type === "credit" ? t.creditTotal : t.total, money(sums.gross), "strong"]);
  }
  const totalsH = totalsRows.length * 16 + 12;
  room(totalsH);
  const tx = 318;
  let ty = y;
  for (const [label, value, kind] of totalsRows) {
    if (kind === "strong") {
      page.rect(tx - 8, ty - 2, right - tx + 8, 24, { fill: wash });
      page.line(tx - 8, ty - 2, right, ty - 2, accent, 1.2);
      page.text(tx, ty + 15, label, "Times-Bold", 12, ink);
      page.text(right - 6, ty + 15, value, "Helvetica-Bold", 11.5, accent, { align: "right" });
      ty += 28;
    } else {
      page.text(tx, ty + 10, fit(label, "Helvetica", 8.5, 150), "Helvetica", 8.5, grey);
      page.text(right, ty + 10, value, "Helvetica", 9.5, ink, { align: "right" });
      ty += 16;
    }
  }
  // Left of the totals: the operation and the VAT mentions.
  const mentions: string[] = [format(t.operation, { kind: t.operations[operationOf(input.lines)] })];
  if (doc.franchise) mentions.push(t.franchise);
  else if (doc.vatTreatment === "reverse_charge") mentions.push(t.reverseCharge);
  if (seller.vatOnDebits && !doc.franchise && doc.type !== "quote") mentions.push(t.vatOnDebits);
  if (doc.type === "credit" && input.reference) mentions.push(format(t.creditOf, { number: input.reference.number, date: date(input.reference.issueDate) }));
  if (doc.type === "invoice" && input.reference) mentions.push(format(doc.depositPercent !== null ? t.depositOf : t.fromQuote, { number: input.reference.number, percent: doc.depositPercent !== null ? formatRate(doc.depositPercent, locale) : "" }));
  let my = y;
  for (const m of mentions) {
    for (const l of wrap(m, "Helvetica", 8, 250)) {
      page.text(margin, my + 9, l, "Helvetica", 8, ink);
      my += 10.5;
    }
    my += 3;
  }
  y = Math.max(ty, my) + 12;

  // --- Notes.
  if (doc.notes) {
    const texts = wrap(doc.notes, "Helvetica", 9, width);
    room(Math.min(texts.length, 6) * 12 + 18);
    page.text(margin, y + 8, t.notes.toUpperCase(), "Helvetica-Bold", 7, accent, { spacing: 1 });
    y += 14;
    for (const l of texts) {
      room(12);
      page.text(margin, y + 9, l, "Helvetica", 9, ink);
      y += 12;
    }
    y += 10;
  }

  // --- Payment terms (invoices), acceptance (quotes).
  if (doc.type === "invoice") {
    const terms: string[] = [];
    terms.push(doc.dueDate ? format(t.dueBy, { date: date(doc.dueDate) }) : doc.paymentDays === 0 ? t.dueOnReceipt : format(t.dueIn, { days: doc.paymentDays }));
    if (seller.iban) terms.push(format(t.transfer, { iban: seller.iban, bic: seller.bic ? format(t.bic, { bic: seller.bic }) : "", bank: seller.bank ? seller.bank + " — " : "" }).replace(/\s+$/u, ""));
    if (seller.paymentLink) terms.push(format(t.payOnline, { link: seller.paymentLink }));
    terms.push(seller.penaltyRate === null ? t.penaltiesLegal : format(t.penalties, { rate: formatRate(seller.penaltyRate, locale) }));
    if (!buyer || buyer.kind === "company") terms.push(t.indemnity);
    terms.push(seller.earlyDiscount ? format(t.earlyDiscount, { terms: seller.earlyDiscount }) : t.noDiscount);
    const texts = terms.flatMap(term => wrap(term, "Helvetica", 8, width));
    room(texts.length * 10.5 + 20);
    page.text(margin, y + 8, t.payment.toUpperCase(), "Helvetica-Bold", 7, accent, { spacing: 1 });
    y += 14;
    for (const l of texts) {
      page.text(margin, y + 9, l, "Helvetica", 8, ink);
      y += 10.5;
    }
    y += 8;
  }
  if (doc.type === "quote") {
    room(96);
    const lines = wrap(doc.validUntil ? format(t.validity, { date: date(doc.validUntil) }) : "", "Helvetica", 8.5, 250);
    lines.forEach((l, i) => page.text(margin, y + 9 + i * 11, l, "Helvetica", 8.5, ink));
    wrap(t.acceptanceNote, "Helvetica", 8, 250).forEach((l, i) => page.text(margin, y + 9 + (lines.length + i) * 11 + 4, l, "Helvetica", 8, grey));
    page.rect(tx - 8, y, right - tx + 8, 80, { stroke: ink, width: 0.6 });
    page.text(tx, y + 14, t.acceptance, "Helvetica-Bold", 8, ink);
    page.text(tx, y + 72, t.signature, "Helvetica", 7.5, grey);
    y += 92;
  }
  if (seller.footer) {
    const texts = wrap(seller.footer, "Helvetica", 7.5, width);
    room(texts.length * 10 + 6);
    for (const l of texts) {
      page.text(margin, y + 8, l, "Helvetica", 7.5, grey);
      y += 10;
    }
  }

  // --- The footer of every page: who the seller is, the page.
  const legal: string[] = [seller.legalName];
  if (seller.legalForm) legal.push(seller.capital !== null ? format(t.capital, { form: seller.legalForm, amount: money(seller.capital) }) : seller.legalForm);
  legal.push([seller.address.replace(/\n/gu, ", "), [seller.postcode, seller.city].filter(Boolean).join(" ")].filter(Boolean).join(", "));
  if (seller.siret) legal.push(format(t.siret, { value: spacedSiren(seller.siret) }));
  else if (seller.siren) legal.push(format(t.siren, { value: spacedSiren(seller.siren) }));
  if (seller.rcsCity && seller.siren) legal.push(format(t.rcs, { city: seller.rcsCity, siren: spacedSiren(seller.siren) }));
  if (seller.vatNumber && !seller.franchise) legal.push(format(t.vatNumber, { value: seller.vatNumber }));
  const footer = wrap(legal.filter(Boolean).join(" · "), "Helvetica", 7, width - 70);
  pdf.pages.forEach((p, i) => {
    const fy = A4.height - 50;
    p.line(margin, fy, right, fy, rule, 0.5);
    footer.slice(0, 3).forEach((l, k) => p.text(margin, fy + 11 + k * 9, l, "Helvetica", 7, grey));
    p.text(right, fy + 11, format(t.page, { page: i + 1, pages: pdf.pages.length }), "Helvetica", 7, grey, { align: "right" });
    if (i > 0) p.text(right, margin - 18, `${title} ${doc.number ?? t.draftNote}`, "Helvetica", 7.5, grey, { align: "right" });
  });

  return pdf.finish({
    title: `${title} ${doc.number ?? t.draftNote}`,
    author: seller.legalName,
    subject: doc.title || title,
    creator: catalogue(locale).meta.name,
    created: input.created,
    language: locale === "fr" ? "fr-FR" : "en-GB",
  }, input.facturx ? {
    name: facturx.fileName,
    data: new TextEncoder().encode(input.facturx),
    type: "text/xml",
    description: "Factur-X (EN 16931)",
    // The PDF and the data are the same invoice in two forms.
    relationship: "Alternative",
    facturx: { conformanceLevel: facturx.conformanceLevel, version: facturx.version },
  } : undefined);
}

// A cell's text cut to its column, with an ellipsis.
function fit(text: string, font: FontName, size: number, max: number): string {
  if (textWidth(text, font, size) <= max) return text;
  let cut = text;
  while (cut.length > 1 && textWidth(cut + "…", font, size) > max) cut = cut.slice(0, -1);
  return cut + "…";
}

// The file name of a document's PDF: "Facture-F-2026-0042.pdf".
// A quote's later version says so: "Devis-D-2026-0007-v2.pdf".
export function pdfFileName(doc: Pick<Doc, "type" | "number" | "language" | "depositPercent"> & { version?: number }): string {
  const t = catalogue(doc.language).pdf;
  const kind = doc.type === "quote" ? t.quote : doc.type === "credit" ? t.credit : doc.depositPercent !== null ? t.deposit : t.invoice;
  const version = doc.number && doc.version && doc.version > 1 ? `-v${doc.version}` : "";
  return `${kind.normalize("NFKD").replace(/[̀-ͯ]/gu, "").replace(/[^A-Za-z0-9]+/gu, "-")}-${doc.number ?? t.draftFile}${version}.pdf`;
}
