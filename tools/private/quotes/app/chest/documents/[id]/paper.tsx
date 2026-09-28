"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { ClientPicker } from "../../../../components/client-picker.tsx";
import { Down, More, Plus, Section, Trash, Up, Box, Copy } from "../../../../components/icons.tsx";
import { ItemPicker } from "../../../../components/item-picker.tsx";
import { useToast } from "../../../../components/toast.tsx";
import type { Line } from "../../../../lib/documents.ts";
import { format, formatDay, languageNames } from "../../../../lib/i18n/format.ts";
import type { Catalogue, Locale } from "../../../../lib/i18n/index.ts";
import { formatMoney, formatNumber, formatQuantity, formatRate, inputAmount, inputPercent, parseAmount, parsePercent, parseQuantity, vatRates } from "../../../../lib/money.ts";
import { addressLines, spacedSiren } from "../../../../lib/parties.ts";
import { lineNet, totals } from "../../../../lib/totals.ts";
import type { ClientOption, DocView, ItemOption } from "../../../../lib/views.ts";
import { saveDraft } from "../../actions.ts";

// The paper: the document as the client will read it — and, while it may
// change, the form itself. Every field is written on the sheet where it
// prints; what is typed is saved a moment later (drafts are never lost),
// and the totals follow each keystroke, computed by the same code as the
// server's (lib/totals.ts).

type EditLine = { key: string; kind: "line" | "section"; itemId: string | null; description: string; quantity: string; unit: string; unitPrice: string; discount: string; vatRate: number; goods: boolean };
type Header = { clientId: string | null; title: string; language: Locale; deliveryDate: string; validUntil: string; paymentDays: string; vatTreatment: "standard" | "reverse_charge"; notes: string };
export type SaveState = "saved" | "pending" | "saving" | "invalid" | "error";

let counter = 0;
const newKey = () => `l${++counter}`;

function editLine(l: Line, currency: string, locale: Locale): EditLine {
  return {
    key: newKey(), kind: l.kind, itemId: l.itemId, description: l.description, unit: l.unit, vatRate: l.vatRate, goods: l.goods,
    quantity: l.kind === "line" ? formatQuantity(l.quantity, locale, false) : "",
    unitPrice: l.kind === "line" ? inputAmount(l.unitPrice, currency, locale) : "",
    discount: l.discount > 0 ? inputPercent(l.discount, locale) : "",
  };
}

type Parsed = { quantity: number | null; unitPrice: number | null; discount: number | null };
function parse(l: EditLine, currency: string): Parsed {
  if (l.kind === "section") return { quantity: 0, unitPrice: 0, discount: 0 };
  const quantity = l.quantity.trim() === "" ? null : parseQuantity(l.quantity);
  const unitPrice = l.unitPrice.trim() === "" ? 0 : parseAmount(l.unitPrice, currency, { negative: true });
  const discount = l.discount.trim() === "" ? 0 : parsePercent(l.discount);
  return {
    quantity: quantity !== null && quantity <= 1_000_000_000 ? quantity : null,
    unitPrice: unitPrice !== null && Math.abs(unitPrice) <= 9_999_999_999 ? unitPrice : null,
    discount: discount !== null && discount <= 10_000 ? discount : null,
  };
}

export type PaperProps = {
  doc: DocView;
  t: Catalogue;
  words: Record<Locale, Catalogue["pdf"]>;
  locale: Locale;
  editing: boolean;
  clients: ClientOption[];
  items: ItemOption[];
  canAddClient: boolean;
  logo: string | null;
  dates: { issue: string; due: string; valid: string; delivery: string; reference: string };
  flushRef: MutableRefObject<() => Promise<boolean>>;
  onState: (state: SaveState) => void;
  onTotals: (gross: number) => void;
};

export function Paper(props: PaperProps) {
  const { doc, t, words, locale, editing, dates } = props;
  const toast = useToast();
  const [header, setHeader] = useState<Header>({
    clientId: doc.clientId, title: doc.title, language: doc.language, deliveryDate: doc.deliveryDate ?? "", validUntil: doc.validUntil ?? "",
    paymentDays: String(doc.paymentDays), vatTreatment: doc.vatTreatment, notes: doc.notes,
  });
  const [lines, setLines] = useState<EditLine[]>(() => doc.lines.map(l => editLine(l, doc.currency, locale)));
  const [clients, setClients] = useState(props.clients);
  const [picking, setPicking] = useState<"client" | "item" | null>(null);
  const latest = useRef({ header, lines });
  latest.current = { header, lines };
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const focusNext = useRef<string | null>(null);
  const w = words[header.language] ?? words.en;
  const client = clients.find(c => c.id === header.clientId) ?? null;
  const buyer = editing ? client : doc.buyer;
  const noVat = doc.franchise || header.vatTreatment === "reverse_charge";
  const parsed = useMemo(() => lines.map(l => parse(l, doc.currency)), [lines, doc.currency]);
  const invalid = parsed.some(p => p.quantity === null || p.unitPrice === null || p.discount === null) || (doc.type === "invoice" && !/^\d{1,3}$/u.test(header.paymentDays.trim())) || (doc.type === "quote" && editing && header.validUntil === "");
  const sums = useMemo(() => totals(lines.map((l, i) => ({ kind: l.kind, quantity: parsed[i]!.quantity ?? 0, unitPrice: parsed[i]!.unitPrice ?? 0, discount: parsed[i]!.discount ?? 0, vatRate: l.vatRate })), { noVat }), [lines, parsed, noVat]);
  const money = (minor: number) => formatMoney(minor, doc.currency, header.language);
  const figure = (minor: number) => formatNumber(minor, doc.currency, header.language);
  const { onTotals, onState } = props;
  useEffect(() => onTotals(sums.gross), [sums.gross, onTotals]);

  // Saving: a moment after the last change, and before any action.
  async function flush(): Promise<boolean> {
    clearTimeout(timer.current);
    if (!editing || !dirty.current) return true;
    const { header: h, lines: ls } = latest.current;
    const values = ls.map(l => parse(l, doc.currency));
    if (values.some(p => p.quantity === null || p.unitPrice === null || p.discount === null)) {
      onState("invalid");
      return false;
    }
    dirty.current = false;
    onState("saving");
    const result = await saveDraft(doc.id, {
      ...(doc.type !== "credit" ? { clientId: h.clientId, vatTreatment: h.vatTreatment } : {}),
      title: h.title, language: h.language, notes: h.notes, deliveryDate: h.deliveryDate || null,
      ...(doc.type === "quote" && h.validUntil ? { validUntil: h.validUntil } : {}),
      ...(doc.type === "invoice" ? { paymentDays: Number(h.paymentDays) } : {}),
      lines: ls.map((l, i) => ({ kind: l.kind, itemId: l.itemId, description: l.description, unit: l.unit, vatRate: l.vatRate, goods: l.goods, quantity: values[i]!.quantity ?? 0, unitPrice: values[i]!.unitPrice ?? 0, discount: values[i]!.discount ?? 0 })),
    });
    if (!result.ok) {
      dirty.current = true;
      onState("error");
      toast(format(t.errors[result.error], result.values ?? {}));
      return false;
    }
    onState(dirty.current ? "pending" : "saved");
    return true;
  }
  props.flushRef.current = flush;

  function changed() {
    dirty.current = true;
    onState("pending");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 700);
  }
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  useEffect(() => {
    if (!focusNext.current) return;
    document.getElementById(focusNext.current)?.focus();
    focusNext.current = null;
  });
  useEffect(() => { if (invalid) onState("invalid"); }, [invalid, onState]);

  const setH = (patch: Partial<Header>) => { setHeader(h => ({ ...h, ...patch })); changed(); };
  const setLine = (key: string, patch: Partial<EditLine>) => { setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l))); changed(); };
  const addLine = (line: Partial<EditLine> = {}) => {
    const l: EditLine = { key: newKey(), kind: "line", itemId: null, description: "", quantity: "1", unit: "", unitPrice: "", discount: "", vatRate: doc.franchise ? 0 : 2000, goods: false, ...line };
    setLines(ls => [...ls, l]);
    focusNext.current = `desc-${l.key}`;
    changed();
  };
  const move = (key: string, by: number) => {
    setLines(ls => {
      const i = ls.findIndex(l => l.key === key);
      const j = i + by;
      if (i < 0 || j < 0 || j >= ls.length) return ls;
      const next = [...ls];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
    changed();
  };
  const remove = (key: string) => {
    const at = lines.findIndex(l => l.key === key);
    const gone = lines[at];
    if (!gone) return;
    setLines(ls => ls.filter(l => l.key !== key));
    changed();
    toast(t.editor.lineRemoved, { label: t.common.undo, run: () => { setLines(ls => [...ls.slice(0, at), gone, ...ls.slice(at)]); changed(); } });
  };

  const readOnlyDescription = (text: string) => {
    const [first, ...rest] = text.split("\n");
    return <><span className="first">{first}</span>{rest.length > 0 && <span className="muted">{"\n" + rest.join("\n")}</span>}</>;
  };
  const e = t.editor;
  const lineCells = (l: EditLine, i: number) => {
    const p = parsed[i]!;
    const net = p.quantity !== null && p.unitPrice !== null && p.discount !== null ? lineNet({ quantity: p.quantity, unitPrice: p.unitPrice, discount: p.discount }) : null;
    if (!editing) {
      return (
        <>
          <div className="desc desc-read">{readOnlyDescription(l.description)}</div>
          <div className="cell"><span className="phone-label">{w.quantity}</span>{formatQuantity(p.quantity ?? 0, header.language)}{l.unit ? " " + l.unit : ""}</div>
          <div className="cell"><span className="phone-label">{w.unitPrice}</span>{figure(p.unitPrice ?? 0)}</div>
          <div className="cell"><span className="phone-label">{w.discount}</span>{(p.discount ?? 0) > 0 ? "−" + formatRate(p.discount ?? 0, header.language) : ""}</div>
          {!noVat && <div className="cell"><span className="phone-label">{w.vat}</span>{formatRate(l.vatRate, header.language)}</div>}
          <div className="total">{figure(net ?? 0)}</div>
        </>
      );
    }
    return (
      <>
        <div className="desc">
          <label className="visually-hidden" htmlFor={`desc-${l.key}`}>{format(e.description, { n: i + 1 })}</label>
          <textarea id={`desc-${l.key}`} className="ink" rows={Math.max(1, l.description.split("\n").length)} value={l.description} placeholder={e.descriptionPlaceholder}
            onChange={ev => setLine(l.key, { description: ev.target.value })} maxLength={2000} />
        </div>
        <div>
          <label className="phone-label" htmlFor={`qty-${l.key}`}>{w.quantity}</label>
          <input id={`qty-${l.key}`} className="ink num" inputMode="decimal" value={l.quantity} aria-invalid={p.quantity === null ? true : undefined}
            aria-label={format(e.quantity, { n: i + 1 })} onChange={ev => setLine(l.key, { quantity: ev.target.value })} />
        </div>
        <div>
          <label className="phone-label" htmlFor={`unit-${l.key}`}>{e.unit}</label>
          <input id={`unit-${l.key}`} className="ink" list="units" value={l.unit} maxLength={20} placeholder={e.unitPlaceholder} aria-label={format(e.unitOf, { n: i + 1 })}
            onChange={ev => setLine(l.key, { unit: ev.target.value })} />
        </div>
        <div>
          <label className="phone-label" htmlFor={`price-${l.key}`}>{w.unitPrice}</label>
          <input id={`price-${l.key}`} className="ink num" inputMode="decimal" value={l.unitPrice} placeholder="0" aria-invalid={p.unitPrice === null ? true : undefined}
            aria-label={format(e.unitPrice, { n: i + 1 })} onChange={ev => setLine(l.key, { unitPrice: ev.target.value })} />
        </div>
        <div>
          <label className="phone-label" htmlFor={`disc-${l.key}`}>{w.discount}</label>
          <input id={`disc-${l.key}`} className="ink num" inputMode="decimal" value={l.discount} placeholder="—" aria-invalid={p.discount === null ? true : undefined}
            aria-label={format(e.discount, { n: i + 1 })} onChange={ev => setLine(l.key, { discount: ev.target.value })} />
        </div>
        {!noVat && (
          <div>
            <label className="phone-label" htmlFor={`vat-${l.key}`}>{w.vat}</label>
            <select id={`vat-${l.key}`} className="ink num" value={l.vatRate} aria-label={format(e.vatRate, { n: i + 1 })} onChange={ev => setLine(l.key, { vatRate: Number(ev.target.value) })}>
              {vatRates.map(r => <option key={r} value={r}>{formatRate(r, locale)}</option>)}
            </select>
          </div>
        )}
        <div className="total" aria-live="off" suppressHydrationWarning>{net === null ? "—" : figure(net)}</div>
      </>
    );
  };

  const lineMenu = (l: EditLine, i: number) => (
    <div className="grip">
      <details className="menu">
        <summary className="icon-button" aria-label={format(e.lineMenu, { n: i + 1 })} title={e.lineMenuShort}><More /></summary>
        <div className="menu-list">
          <button type="button" disabled={i === 0} onClick={ev => { move(l.key, -1); (ev.currentTarget.closest("details") as HTMLDetailsElement).open = false; }}><Up />{e.moveUp}</button>
          <button type="button" disabled={i === lines.length - 1} onClick={ev => { move(l.key, 1); (ev.currentTarget.closest("details") as HTMLDetailsElement).open = false; }}><Down />{e.moveDown}</button>
          {l.kind === "line" && <button type="button" onClick={ev => { setLines(ls => [...ls.slice(0, i + 1), { ...l, key: newKey() }, ...ls.slice(i + 1)]); changed(); (ev.currentTarget.closest("details") as HTMLDetailsElement).open = false; }}><Copy />{e.duplicateLine}</button>}
          <button type="button" onClick={() => remove(l.key)}><Trash />{e.removeLine}</button>
        </div>
      </details>
    </div>
  );

  const unitWords = Object.values(t.units);
  const lang = header.language;
  const titleWord = doc.type === "quote" ? w.quote : doc.type === "credit" ? w.credit : doc.depositPercent !== null ? w.deposit : w.invoice;
  const operation = (() => {
    const kinds = new Set(lines.filter(l => l.kind === "line").map(l => l.goods));
    return kinds.size === 2 ? w.operations.mixed : kinds.has(true) ? w.operations.goods : w.operations.services;
  })();
  const seller = doc.seller;
  const sellerId = seller.siret ? format(w.siret, { value: spacedSiren(seller.siret) }) : seller.siren ? format(w.siren, { value: spacedSiren(seller.siren) }) : "";
  const dueText = doc.type === "invoice" ? (doc.dueDate ? dates.due : format(w.dueIn, { days: header.paymentDays })) : "";

  return (
    <article className={doc.status === "draft" ? "sheet draft-sheet" : "sheet"} data-mark={w.draftMark} lang={lang} aria-label={titleWord}>
      <datalist id="units">{unitWords.map(u => <option key={u} value={u} />)}</datalist>
      <header className="letterhead">
        <div className="seller">
          {props.logo && <img src={props.logo} alt="" />}
          <strong>{seller.tradeName || seller.legalName || t.editor.noCompany}</strong>
          {addressLines(seller, c => c).map(l => <span key={l}>{l}</span>)}
          {[seller.phone, seller.email].filter(Boolean).map(l => <span key={l}>{l}</span>)}
        </div>
        <div className="title">
          <h1>{titleWord}</h1>
          <span className={doc.number ? "number" : "number none"}>{doc.number ? format(w.numbered, { number: doc.number }) : doc.status === "draft" && doc.type !== "quote" ? t.editor.numberAtFinalise : t.editor.numberAtSend}</span>
          <dl className="meta">
            <dt>{w.date}</dt>
            <dd>{doc.issueDate ? dates.issue : t.editor.dateAtNumbering}</dd>
            {doc.type === "quote" && (
              <>
                <dt>{editing ? <label htmlFor="valid">{w.validUntil}</label> : w.validUntil}</dt>
                <dd>{editing ? <input id="valid" type="date" className="ink num" value={header.validUntil} required onChange={ev => setH({ validUntil: ev.target.value })} /> : dates.valid}</dd>
              </>
            )}
            {doc.type === "invoice" && (
              <>
                <dt>{editing ? <label htmlFor="terms">{t.editor.paymentTerms}</label> : w.dueDate}</dt>
                <dd>{editing ? (
                  <select id="terms" className="ink num" value={header.paymentDays} onChange={ev => setH({ paymentDays: ev.target.value })}>
                    {[...new Set([0, 15, 30, 45, 60, Number(header.paymentDays)])].filter(n => Number.isFinite(n)).sort((a, b) => a - b).map(n => <option key={n} value={n}>{n === 0 ? t.editor.onReceipt : format(t.editor.days, { days: n })}</option>)}
                  </select>
                ) : dueText}</dd>
              </>
            )}
            {(editing || doc.deliveryDate) && doc.type !== "credit" && (
              <>
                <dt>{editing ? <label htmlFor="delivery">{t.editor.deliveryDate}</label> : w.deliveryDate}</dt>
                <dd>{editing ? <input id="delivery" type="date" className="ink num" value={header.deliveryDate} onChange={ev => setH({ deliveryDate: ev.target.value })} /> : dates.delivery}</dd>
              </>
            )}
            {doc.reference && (
              <>
                <dt>{doc.type === "credit" ? w.invoiceRef : w.quoteRef}</dt>
                <dd><a href={`/chest/documents/${doc.reference.id}`}>{doc.reference.number}</a></dd>
              </>
            )}
            {editing && doc.type !== "credit" && (
              <>
                <dt><label htmlFor="language">{t.editor.language}</label></dt>
                <dd>
                  <select id="language" className="ink" value={header.language} onChange={ev => setH({ language: ev.target.value as Locale })}>
                    {(Object.keys(words) as Locale[]).map(code => <option key={code} value={code} lang={code}>{languageNames[code] ?? code}</option>)}
                  </select>
                </dd>
              </>
            )}
          </dl>
        </div>
      </header>

      <div className="parties">
        <div className="party">
          <span className="caps">{w.from}</span>
          {sellerId && <span>{sellerId}</span>}
          {seller.vatNumber && !seller.franchise && <span>{format(w.vatNumber, { value: seller.vatNumber })}</span>}
          {seller.rcsCity && seller.siren && <span>{format(w.rcs, { city: seller.rcsCity, siren: spacedSiren(seller.siren) })}</span>}
        </div>
        <div className="party buyer">
          <span className="caps">{doc.type === "quote" ? w.quoteFor : w.billTo}</span>
          {buyer ? (
            <>
              <span className="name">{buyer.name}</span>
              {buyer.contact && <span>{format(w.attention, { name: buyer.contact })}</span>}
              {addressLines(buyer, () => buyer.countryName).map(l => <span key={l}>{l}</span>)}
              {buyer.siren && <span className="grey">{format(w.siren, { value: spacedSiren(buyer.siren) })}</span>}
              {buyer.vatNumber && <span className="grey">{format(w.vatNumber, { value: buyer.vatNumber })}</span>}
              {buyer.deliveryAddress && <><span className="caps">{w.deliverTo}</span><span className="grey">{buyer.deliveryAddress}</span></>}
              {editing && doc.type !== "credit" && <button type="button" className="link-button" onClick={() => setPicking("client")}>{t.editor.changeClient}</button>}
            </>
          ) : editing ? (
            <button type="button" className="button quiet" onClick={() => setPicking("client")}><Plus />{t.editor.chooseClient}</button>
          ) : (
            <span className="grey">{w.noClient}</span>
          )}
        </div>
      </div>

      <div className="subject">
        {editing ? (
          <>
            <label htmlFor="title">{t.editor.subject}</label>
            <input id="title" className="ink serif" value={header.title} maxLength={200} placeholder={t.editor.subjectPlaceholder} onChange={ev => setH({ title: ev.target.value })} />
          </>
        ) : header.title ? <span>{format(w.subject, { title: header.title })}</span> : null}
      </div>

      <div className={`lines${noVat ? " no-vat" : ""}${editing ? "" : " read"}`}>
        <div className="lines-head" aria-hidden="true">
          <span>{w.description}</span>
          <span className="r">{w.quantity}</span>
          {editing && <span>{e.unit}</span>}
          <span className="r">{w.unitPrice}</span>
          <span className="r">{w.discount}</span>
          {!noVat && <span className="r">{w.vat}</span>}
          <span className="r">{w.amount}</span>
          {editing && <span />}
        </div>
        {lines.length === 0 && editing && <p className="muted small" style={{ padding: "12px 0" }}>{e.noLines}</p>}
        {lines.map((l, i) => l.kind === "section" ? (
          <div key={l.key} className="line section">
            {editing ? (
              <>
                <div className="desc">
                  <label className="visually-hidden" htmlFor={`desc-${l.key}`}>{format(e.sectionTitle, { n: i + 1 })}</label>
                  <input id={`desc-${l.key}`} className="ink" value={l.description} maxLength={200} placeholder={e.sectionPlaceholder} onChange={ev => setLine(l.key, { description: ev.target.value })} />
                </div>
                {lineMenu(l, i)}
              </>
            ) : <div className="desc-read">{l.description}</div>}
          </div>
        ) : (
          <div key={l.key} className="line">
            {lineCells(l, i)}
            {editing && lineMenu(l, i)}
          </div>
        ))}
      </div>

      {editing && (
        <div className="add-lines">
          <button type="button" className="button quiet small" onClick={() => addLine()}><Plus />{e.addLine}</button>
          <button type="button" className="button quiet small" onClick={() => setPicking("item")}><Box />{e.fromCatalogue}</button>
          <button type="button" className="button ghost small" onClick={() => { const key = newKey(); setLines(ls => [...ls, { key, kind: "section", itemId: null, description: "", quantity: "", unit: "", unitPrice: "", discount: "", vatRate: 0, goods: false }]); focusNext.current = `desc-${key}`; changed(); }}><Section />{e.addSection}</button>
        </div>
      )}

      <div className="bottom">
        <div className="mentions">
          <span>{format(w.operation, { kind: operation })}</span>
          {doc.franchise ? <span>{w.franchise}</span> : header.vatTreatment === "reverse_charge" ? <span>{w.reverseCharge}</span> : null}
          {editing && !doc.franchise && doc.type !== "credit" && (
            <label className="check small">
              <input type="checkbox" checked={header.vatTreatment === "reverse_charge"} onChange={ev => setH({ vatTreatment: ev.target.checked ? "reverse_charge" : "standard" })} />
              <span>{e.reverseCharge}</span>
            </label>
          )}
        </div>
        <div className="totals" aria-live="polite">
          <div className="row"><span>{w.net}</span><b suppressHydrationWarning>{money(sums.net)}</b></div>
          {!noVat && sums.rates.map(r => <div key={r.rate} className="row"><span suppressHydrationWarning>{format(w.vatAt, { rate: formatRate(r.rate, lang), base: figure(r.base) })}</span><b suppressHydrationWarning>{money(r.vat)}</b></div>)}
          {noVat && header.vatTreatment === "reverse_charge" && !doc.franchise && <div className="row"><span>{w.vatReverse}</span><b suppressHydrationWarning>{money(0)}</b></div>}
          <div className="grand"><span>{noVat ? (doc.type === "credit" ? w.creditTotal : w.total) : doc.type === "credit" ? w.creditGross : w.gross}</span><b suppressHydrationWarning>{money(sums.gross)}</b></div>
        </div>
      </div>

      <div className="notes">
        {editing ? (
          <>
            <label className="caps" htmlFor="notes">{w.notes}</label>
            <textarea id="notes" className="ink" rows={Math.max(2, header.notes.split("\n").length)} value={header.notes} maxLength={4000} placeholder={e.notesPlaceholder} onChange={ev => setH({ notes: ev.target.value })} />
          </>
        ) : header.notes ? (
          <>
            <span className="caps">{w.notes}</span>
            <p className="desc-read" style={{ whiteSpace: "pre-wrap" }}>{header.notes}</p>
          </>
        ) : null}
      </div>

      <footer className="fineprint">
        {doc.type === "invoice" && <span>{doc.dueDate ? format(w.dueBy, { date: dates.due }) : Number(header.paymentDays) === 0 ? w.dueOnReceipt : format(w.dueIn, { days: header.paymentDays })} {seller.iban ? format(w.transfer, { iban: seller.iban, bic: seller.bic ? format(w.bic, { bic: seller.bic }) : "", bank: seller.bank ? seller.bank + " — " : "" }) : ""}</span>}
        {doc.type === "invoice" && <span>{seller.penaltyRate === null ? w.penaltiesLegal : format(w.penalties, { rate: formatRate(seller.penaltyRate, lang) })} {buyer?.kind !== "person" ? w.indemnity : ""}</span>}
        {doc.type === "invoice" && <span>{seller.earlyDiscount ? format(w.earlyDiscount, { terms: seller.earlyDiscount }) : w.noDiscount}</span>}
        {doc.type === "quote" && header.validUntil && <span>{format(w.validity, { date: formatDay(header.validUntil, lang, { day: "2-digit", month: "2-digit", year: "numeric" }) })}</span>}
        {seller.footer && <span>{seller.footer}</span>}
      </footer>

      {picking === "client" && (
        <ClientPicker t={t} clients={clients.filter(c => !c.archived)} canAdd={props.canAddClient} onClose={() => setPicking(null)}
          onPick={picked => {
            setClients(list => (list.some(c => c.id === picked.id) ? list : [...list, picked]));
            setH({ clientId: picked.id, language: picked.language, vatTreatment: picked.reverseCharge ? "reverse_charge" : "standard" });
            setPicking(null);
          }} />
      )}
      {picking === "item" && (
        <ItemPicker t={t} items={props.items} currency={doc.currency} locale={locale} onClose={() => setPicking(null)}
          onPick={item => {
            addLine({ itemId: item.id, description: item.description ? `${item.name}\n${item.description}` : item.name, unit: item.unit, unitPrice: inputAmount(item.unitPrice, doc.currency, locale), vatRate: doc.franchise ? 0 : item.vatRate, goods: item.goods });
            focusNext.current = null;
            setPicking(null);
            toast(format(t.editor.itemAdded, { name: item.name }));
          }} />
      )}
    </article>
  );
}
