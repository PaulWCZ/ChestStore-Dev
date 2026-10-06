import type { Full } from "../lib/documents.ts";
import { format, formatDay, type Catalogue, type Locale } from "../i18n/index.ts";
import { formatMoney, formatQuantity, formatRate } from "../lib/money.ts";
import { addressLines, spacedSiren } from "../lib/parties.ts";
import { countryName } from "../lib/rows.ts";
import { unitText } from "../lib/units.ts";

// The quote as a page, for the client who opens the link: the same
// content as its PDF (seller, buyer, lines, VAT per rate, totals, validity,
// notes), written in the document's language like the PDF — the page
// around it speaks the visitor's. Read only; the PDF stays the document
// of record. On a phone each line becomes a small card (no sideways
// scroll).
export function QuoteSheet({ full, words, language }: { full: Full; words: Catalogue["pdf"]; language: Locale }) {
  const money = (minor: number) => formatMoney(minor, full.currency, language);
  const day = (d: string | null) => (d ? formatDay(d, language, { day: "numeric", month: "long", year: "numeric" }) : "");
  const seller = full.seller;
  const buyer = full.buyer ?? full.client;
  const place = (code: string) => countryName(code, language);
  const noVat = full.franchise || full.vatTreatment === "reverse_charge";
  const sellerName = seller ? seller.tradeName || seller.legalName : "";
  return (
    <article className="sheet" lang={language} aria-label={`${words.quote} ${full.number ?? ""}`}>
      <header className="sheet-head">
        <div>
          <p className="sheet-kind">{words.quote}</p>
          <p className="sheet-number">{full.number ? format(words.numbered, { number: full.number }) : ""}</p>
        </div>
        <dl className="sheet-dates">
          <div><dt>{words.date}</dt><dd>{day(full.issueDate)}</dd></div>
          {full.validUntil && <div><dt>{words.validUntil}</dt><dd>{day(full.validUntil)}</dd></div>}
        </dl>
      </header>
      <div className="sheet-parties">
        {seller && (
          <section>
            <h2>{words.from}</h2>
            <p><strong>{sellerName}</strong>{seller.tradeName && seller.legalName && seller.tradeName !== seller.legalName ? <><br />{seller.legalName}</> : null}</p>
            <p>{addressLines(seller, place).map((l, i) => <span key={i}>{l}<br /></span>)}</p>
            {seller.siren && <p className="fine">{format(words.siren, { value: spacedSiren(seller.siren) })}{seller.vatNumber ? " · " + format(words.vatNumber, { value: seller.vatNumber }) : ""}</p>}
          </section>
        )}
        {buyer && (
          <section>
            <h2>{words.quoteFor}</h2>
            <p><strong>{buyer.name}</strong>{buyer.contact ? <><br />{format(words.attention, { name: buyer.contact })}</> : null}</p>
            <p>{addressLines(buyer, place).map((l, i) => <span key={i}>{l}<br /></span>)}</p>
            {buyer.siren && <p className="fine">{format(words.siren, { value: spacedSiren(buyer.siren) })}</p>}
          </section>
        )}
      </div>
      {full.title && <p className="sheet-subject">{format(words.subject, { title: full.title })}</p>}
      <table className="sheet-lines">
        <thead>
          <tr>
            <th scope="col">{words.description}</th>
            <th scope="col" className="n">{words.quantity}</th>
            <th scope="col" className="n">{words.unitPrice}</th>
            {!noVat && <th scope="col" className="n">{words.vat}</th>}
            <th scope="col" className="n">{words.amount}</th>
          </tr>
        </thead>
        <tbody>
          {full.lines.map((l, i) => l.kind === "section" ? (
            <tr key={i} className="section-row"><th scope="rowgroup" colSpan={noVat ? 4 : 5}>{l.description}</th></tr>
          ) : (
            <tr key={i}>
              <td className="what">{l.description.split("\n").map((p, j) => <span key={j} className={j === 0 ? undefined : "more"}>{p}</span>)}</td>
              <td className="n" data-label={words.quantity}>{formatQuantity(l.quantity, language)}{l.unit ? " " + unitText(l.unit, l.quantity, words, language) : ""}</td>
              <td className="n" data-label={words.unitPrice}>{money(l.unitPrice)}{l.discount > 0 ? <small>{words.discount} {formatRate(l.discount, language)}</small> : null}</td>
              {!noVat && <td className="n" data-label={words.vat}>{formatRate(l.vatRate, language)}</td>}
              <td className="n strong" data-label={words.amount}>{money(l.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="sheet-totals">
        <div><dt>{words.net}</dt><dd>{money(full.net)}</dd></div>
        {!noVat && full.rates.filter(r => r.rate > 0).map(r => (
          <div key={r.rate}><dt>{format(words.vatAt, { rate: formatRate(r.rate, language), base: money(r.base) })}</dt><dd>{money(r.vat)}</dd></div>
        ))}
        <div className="grand"><dt>{noVat ? words.total : words.gross}</dt><dd>{money(full.gross)}</dd></div>
      </dl>
      {full.franchise && <p className="fine">{words.franchise}</p>}
      {full.vatTreatment === "reverse_charge" && !full.franchise && <p className="fine">{words.reverseCharge}</p>}
      {full.validUntil && <p className="fine">{format(words.validity, { date: day(full.validUntil) })}</p>}
      {full.notes && (
        <section className="sheet-notes">
          <h2>{words.notes}</h2>
          {full.notes.split("\n").map((p, i) => <p key={i}>{p}</p>)}
        </section>
      )}
    </article>
  );
}
