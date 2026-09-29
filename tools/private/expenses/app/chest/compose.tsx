"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { Camera, Car, Check, Close, FileIcon, Receipt } from "../../components/icons.tsx";
import { useToast } from "../../components/toast.tsx";
import type { ComposeData, Initial } from "../../lib/compose.ts";
import type { Catalogue } from "../../lib/i18n/index.ts";
import { format, intl, plural } from "../../lib/i18n/format.ts";
import { convert, formatMoney, inputAmount, parseAmount, parseRate, rateText, vatInside, vatRates } from "../../lib/money.ts";
import { limits, receiptTypes } from "../../lib/model.ts";
import { tripCents } from "../../lib/scale.ts";
import { km } from "../../lib/words.ts";
import { saveExpense, saveTrip, sendExpenses } from "./actions.ts";

export type ComposeWords = Pick<Catalogue, "form" | "receipt" | "trip" | "errors"> & { saved: string; send: string; sent: Catalogue["home"]["sent"] };
type ErrorKey = keyof Catalogue["errors"];

// Once saved: back to the list, with "Send it now" in the toast.
function useSaved(t: ComposeWords, locale: string) {
  const router = useRouter();
  const toast = useToast();
  return (id: string) => {
    toast(t.saved, {
      label: t.send,
      run: () => void sendExpenses([id]).then(r => {
        toast(r.ok ? plural(t.sent, r.value.count, locale, { name: r.value.to }) : format(t.errors[r.error], r.values ?? {}));
        router.refresh();
      }),
    });
    router.push("/chest");
    router.refresh();
  };
}

function symbolOf(currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(intl(locale), { style: "currency", currency }).formatToParts(0).find(p => p.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}

// A phone's HEIC photo sometimes comes without a type: its name tells.
function typeOf(file: File): string {
  if (file.type) return file.type === "image/jpg" ? "image/jpeg" : file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ({ heic: "image/heic", heif: "image/heif", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" } as Record<string, string>)[ext] ?? "";
}

// The receipt: straight from the phone's camera, or a file (a photo, a PDF
// from an email). It goes to the Chest while the person types the amount.
function ReceiptPicker({ t, initial, onChange, onBusy, onError }: {
  t: ComposeWords;
  initial: Initial["receipt"];
  onChange: (object: string | null | undefined, name?: string) => void;
  onBusy: (busy: boolean) => void;
  onError: (code: ErrorKey, values?: Record<string, string | number>) => void;
}) {
  const [shown, setShown] = useState<{ image: string | null; pdf: boolean; name: string } | null>(initial ? { image: initial.thumb, pdf: initial.pdf, name: initial.name } : null);
  const [sending, setSending] = useState(false);
  const [ready, setReady] = useState(false);
  const local = useRef<string | null>(null);
  useEffect(() => () => { if (local.current) URL.revokeObjectURL(local.current); }, []);

  async function pick(file: File | undefined) {
    if (!file) return;
    const type = typeOf(file);
    if (!(receiptTypes as readonly string[]).includes(type)) return onError("file_type");
    if (file.size > limits.receiptSize) return onError("file_too_large", { max: limits.receiptSize >> 20 });
    if (local.current) URL.revokeObjectURL(local.current);
    const viewable = type.startsWith("image/") && type !== "image/heic" && type !== "image/heif";
    local.current = viewable ? URL.createObjectURL(file) : null;
    setShown({ image: local.current, pdf: type === "application/pdf", name: file.name });
    setSending(true);
    setReady(false);
    onBusy(true);
    try {
      const grant = await fetch("/chest/api/receipts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, size: file.size }) });
      const up = (await grant.json()) as { url?: string; object?: string; error?: ErrorKey; values?: Record<string, number> };
      if (!grant.ok || !up.url || !up.object) {
        setShown(null);
        return onError(up.error ?? "unavailable", up.values);
      }
      const put = await fetch(up.url, { method: "PUT", body: file, headers: { "Content-Type": type } });
      if (!put.ok) {
        setShown(null);
        return onError(put.status === 413 ? "file_too_large" : put.status === 415 || put.status === 400 ? "file_type" : "file_missing", { max: limits.receiptSize >> 20 });
      }
      onChange(up.object, file.name);
      setReady(true);
    } catch {
      setShown(null);
      onError("unavailable");
    } finally {
      setSending(false);
      onBusy(false);
    }
  }

  const input = (capture: boolean) => (
    <input type="file" accept={capture ? "image/*" : [...receiptTypes, ".heic", ".pdf"].join(",")} {...(capture ? { capture: "environment" as const } : {})} onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; void pick(f); }} />
  );

  if (!shown) {
    return (
      <div className="capture">
        <label className="shoot">
          <Camera />
          <span>{t.receipt.take}<small>{t.receipt.hint}</small></span>
          {input(true)}
        </label>
        <label className="pick-file">
          <FileIcon />
          <span>{t.receipt.choose}</span>
          {input(false)}
        </label>
      </div>
    );
  }
  return (
    <div className="attached">
      {shown.image ? <img className="preview" src={shown.image} alt={format(t.receipt.preview, { what: shown.name })} /> : <span className="preview">{shown.pdf ? <FileIcon /> : <Receipt />}</span>}
      <div className="state" role="status">
        {sending ? <><span>{t.receipt.sending}</span><span className="progress"><i /></span></> : <><strong>{(ready || initial) && <Check />}{ready || !initial ? t.receipt.ready : shown.pdf ? t.receipt.pdf : t.receipt.title}</strong><span className="hint">{t.receipt.kept}</span></>}
      </div>
      <div className="actions">
        <label className="link-button file-label">{t.receipt.replace}{input(false)}</label>
        <button type="button" className="link-button danger" onClick={() => { setShown(null); setReady(false); onChange(null); }} disabled={sending}>{t.receipt.remove}</button>
      </div>
    </div>
  );
}

type Guests = { members: { id: string; name: string }[]; names: string[] };

// Who was at a meal: colleagues picked by name from the team, people from
// outside typed as they are ("Jean Dupont (Acme)"). Enter or "Add" adds
// what is typed: a colleague's exact name becomes that colleague.
function GuestsField({ team, value, onChange, perPerson, t }: { team: ComposeData["team"]; value: Guests; onChange: (g: Guests) => void; perPerson: string | null; t: ComposeWords }) {
  const [text, setText] = useState("");
  function add() {
    const typed = text.trim().replace(/\s+/gu, " ");
    if (!typed) return;
    const colleague = team.find(m => m.name.toLocaleLowerCase() === typed.toLocaleLowerCase());
    if (colleague) {
      if (!value.members.some(m => m.id === colleague.id)) onChange({ ...value, members: [...value.members, colleague] });
    } else if (!value.names.includes(typed)) onChange({ ...value, names: [...value.names, typed.slice(0, limits.guestName)] });
    setText("");
  }
  const chips = [...value.members.map(m => ({ key: m.id, name: m.name, drop: () => onChange({ ...value, members: value.members.filter(x => x.id !== m.id) }) })),
    ...value.names.map(n => ({ key: "n:" + n, name: n, drop: () => onChange({ ...value, names: value.names.filter(x => x !== n) }) }))];
  return (
    <div className="field-row guests">
      <label htmlFor="guest">{t.form.guests}</label>
      {chips.length > 0 && (
        <ul className="guest-list">
          {chips.map(c => <li key={c.key} className="chip small-name">{c.name}<button type="button" className="chip-x" onClick={c.drop} aria-label={format(t.form.guestRemove, { name: c.name })}><Close /></button></li>)}
        </ul>
      )}
      <div className="guest-add">
        <input id="guest" className="field" list="team" value={text} maxLength={limits.guestName} placeholder={t.form.guestsPlaceholder} autoComplete="off" aria-describedby="guest-hint"
          onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <button type="button" className="button quiet" onClick={add} disabled={!text.trim()}>{t.form.guestsAdd}</button>
      </div>
      <datalist id="team">{team.map(m => <option key={m.id} value={m.name} />)}</datalist>
      <span id="guest-hint" className="hint">{perPerson ?? t.form.guestsHint}</span>
    </div>
  );
}

export function ExpenseForm({ data, initial, locale, t }: { data: ComposeData; initial: Initial | null; locale: string; t: ComposeWords }) {
  const saved = useSaved(t, locale);
  const [pending, start] = useTransition();
  const [receipt, setReceipt] = useState<string | null | undefined>(undefined);
  const [receiptName, setReceiptName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState(initial?.currency ?? data.currency);
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [vat, setVat] = useState(initial?.vat ?? "");
  const [rate, setRate] = useState(initial?.rate ?? "");
  const [paidBy, setPaidBy] = useState<"me" | "company">(initial?.paidBy ?? "me");
  const [category, setCategory] = useState(initial?.categoryId ?? "");
  const [guests, setGuests] = useState<Guests>(initial?.guests ?? { members: [], names: [] });
  const amountRef = useRef<HTMLInputElement>(null);
  const parsed = parseAmount(amount, currency);
  // Another currency than the company's: the rate typed, else the company's.
  const foreign = currency !== data.currency;
  const companyRate = data.rates[currency] ?? null;
  const rateUsed = foreign ? (rate.trim() ? parseRate(rate) : companyRate) : null;
  const converted = foreign && rateUsed !== null && parsed !== null && parsed > 0 ? format(t.form.converted, { amount: formatMoney(convert(parsed, currency, rateUsed, data.currency), data.currency, locale) }) : null;
  const asksGuests = data.categories.find(c => c.id === category)?.guests ?? false;
  const atTable = 1 + guests.members.length + guests.names.length;
  const perPerson = atTable > 1 && parsed !== null && parsed > 0 ? plural(t.form.perPerson, atTable, locale, { amount: formatMoney(Math.round(parsed / atTable), currency, locale) }) : null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (parsed === null || parsed <= 0) {
      setError(t.errors.amount_invalid);
      amountRef.current?.focus();
      return;
    }
    if (!category) return setError(t.errors.category_invalid);
    setError(null);
    const input = { spentOn: String(form.get("date") ?? ""), amount, currency, vat, rate: foreign ? rate : "", categoryId: category, merchant: String(form.get("merchant") ?? ""), note: String(form.get("note") ?? ""), paidBy, receiptName,
      guestMembers: asksGuests ? guests.members.map(m => m.id) : [], guestNames: asksGuests ? guests.names : [] };
    start(async () => {
      const result = await saveExpense(initial?.id ?? null, input, receipt);
      if (!result.ok) return setError(format(t.errors[result.error], result.values ?? {}));
      saved(result.value.id);
    });
  }

  return (
    <form className="compose" onSubmit={submit} noValidate>
      <ReceiptPicker t={t} initial={initial?.receipt ?? null} onBusy={setBusy} onChange={(object, name) => { setReceipt(object); setReceiptName(name ?? ""); if (object && !amount) setTimeout(() => amountRef.current?.focus(), 50); }} onError={(code, values) => setError(format(t.errors[code], values ?? {}))} />

      <div className="field-row">
        <label htmlFor="amount">{t.form.amount}</label>
        <div className="money-input">
          <input id="amount" ref={amountRef} name="amount" inputMode="decimal" autoComplete="off" placeholder={inputAmount(0, currency, locale)} value={amount} onChange={e => setAmount(e.target.value)} aria-invalid={error === t.errors.amount_invalid} aria-describedby="amount-hint" />
          <span className="unit" aria-hidden="true">{symbolOf(currency, locale)}</span>
        </div>
        <span id="amount-hint" className="hint">{converted ?? t.form.amountHint}</span>
      </div>

      <fieldset className="chips" role="radiogroup">
        <legend>{t.form.category}</legend>
        {data.categories.map(c => (
          <label key={c.id} className="chip">
            <input type="radio" name="category" value={c.id} checked={category === c.id} onChange={() => setCategory(c.id)} />
            {c.name}
          </label>
        ))}
      </fieldset>

      {asksGuests && <GuestsField team={data.team} value={guests} onChange={setGuests} perPerson={perPerson} t={t} />}

      <div className="two stack">
        <div className="field-row">
          <label htmlFor="merchant">{t.form.merchant}</label>
          <input id="merchant" name="merchant" className="field" list="merchants" maxLength={limits.merchant} placeholder={t.form.merchantPlaceholder} defaultValue={initial?.merchant ?? ""} autoComplete="off" />
          <datalist id="merchants">{data.merchants.map(m => <option key={m} value={m} />)}</datalist>
        </div>
        <div className="field-row">
          <label htmlFor="date">{t.form.date}</label>
          <input id="date" name="date" type="date" className="field mono" max={data.today} defaultValue={initial?.spentOn ?? data.today} required />
        </div>
      </div>

      <fieldset className="segmented">
        <legend>{t.form.paidBy}</legend>
        <label className="segment">
          <input type="radio" name="paidBy" value="me" checked={paidBy === "me"} onChange={() => setPaidBy("me")} />
          <strong>{t.form.paidByMe}</strong>
          <span>{t.form.paidByMeHint}</span>
        </label>
        <label className="segment">
          <input type="radio" name="paidBy" value="company" checked={paidBy === "company"} onChange={() => setPaidBy("company")} />
          <strong>{t.form.paidByCompany}</strong>
          <span>{t.form.paidByCompanyHint}</span>
        </label>
      </fieldset>

      <details className="more" open={Boolean(initial?.vat || initial?.note || (initial && initial.currency !== data.currency))}>
        <summary>{t.form.more}</summary>
        <div className="inside">
          <div className="field-row">
            <label htmlFor="vat">{t.form.vat}</label>
            <input id="vat" name="vat" className="field mono" inputMode="decimal" autoComplete="off" value={vat} onChange={e => setVat(e.target.value)} aria-describedby="vat-hint" />
            <span id="vat-hint" className="hint">{t.form.vatHint}</span>
            <div className="chips" role="group" aria-label={t.form.vatRates}>
              {vatRates.map(r => (
                <button key={r} type="button" className="chip small" disabled={parsed === null} onClick={() => parsed !== null && setVat(inputAmount(vatInside(parsed, r), currency, locale))}>
                  {format(t.form.vatRate, { rate: new Intl.NumberFormat(intl(locale)).format(r / 10) })}
                </button>
              ))}
            </div>
          </div>
          <div className="field-row">
            <label htmlFor="currency">{t.form.currency}</label>
            <select id="currency" className="field" value={currency} onChange={e => setCurrency(e.target.value)}>
              {data.currencies.map(c => <option key={c} value={c}>{c} · {symbolOf(c, locale)}</option>)}
            </select>
          </div>
          {foreign && (
            <div className="field-row">
              <label htmlFor="rate">{format(t.form.rate, { from: currency, to: data.currency })}</label>
              <input id="rate" className="field mono" inputMode="decimal" autoComplete="off" value={rate} onChange={e => setRate(e.target.value)}
                placeholder={companyRate !== null ? rateText(companyRate, locale) : ""} aria-describedby="rate-hint" aria-invalid={rate.trim() !== "" && parseRate(rate) === null} />
              <span id="rate-hint" className="hint">{(companyRate !== null ? [format(t.form.rateCompany, { rate: rateText(companyRate, locale) }), t.form.rateHint] : [t.form.rateNone]).join(" · ")}</span>
            </div>
          )}
          <div className="field-row">
            <label htmlFor="note">{t.form.note}</label>
            <textarea id="note" name="note" className="field" maxLength={limits.note} placeholder={t.form.notePlaceholder} defaultValue={initial?.note ?? ""} />
          </div>
        </div>
      </details>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="save-bar">
        <button type="submit" className="button" disabled={pending || busy}>{pending ? t.form.saving : t.form.save}</button>
        <a className="button quiet" href={initial ? `/chest/expenses/${initial.id}` : "/chest"}>{t.form.cancel}</a>
      </div>
    </form>
  );
}

// A trip with one's own vehicle: the amount is the scale's, shown live.
export function TripForm({ data, initial, locale, t }: { data: ComposeData; initial: Initial | null; locale: string; t: ComposeWords }) {
  const saved = useSaved(t, locale);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState(initial?.spentOn ?? data.today);
  const [distance, setDistance] = useState(initial?.distance ?? "");
  const [round, setRound] = useState(false);

  const estimate = useMemo(() => {
    const v = data.vehicle;
    const text = distance.trim().replace(",", ".");
    if (!v || !/^\d{1,5}(\.\d)?$/u.test(text) || !/^\d{4}-\d{2}-\d{2}$/u.test(day)) return null;
    const tenths = Math.round(Number(text) * 10) * (round ? 2 : 1);
    if (tenths < 1 || tenths > limits.distanceTenths) return null;
    const year = Number(day.slice(0, 4));
    const sorted = [...data.scales].sort((a, b) => (a.year <= year) === (b.year <= year) ? (a.year <= year ? b.year - a.year : a.year - b.year) : a.year <= year ? -1 : 1);
    const scale = sorted[0];
    if (!scale) return null;
    const before = data.trips.filter(tr => tr.id !== initial?.id && tr.kind === v.kind && tr.day.slice(0, 4) === day.slice(0, 4) && tr.day <= day).reduce((s, tr) => s + tr.tenths, 0);
    try {
      return { amount: formatMoney(Math.max(1, tripCents(scale.data, v.kind, v.power, v.electric, before, tenths)), "EUR", locale), year: scale.year, before: km(before, locale) };
    } catch {
      return null;
    }
  }, [data, day, distance, round, initial, locale]);

  if (!data.vehicle) {
    return (
      <div className="paper flat empty">
        <span className="glyph"><Car /></span>
        <h2>{t.trip.noVehicle}</h2>
        <p>{t.trip.noVehicleBody}</p>
        <a className="button" href="/chest/settings#vehicle">{t.trip.setVehicle}</a>
      </div>
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = { spentOn: day, from: String(form.get("from") ?? ""), to: String(form.get("to") ?? ""), distance, roundTrip: round, note: String(form.get("note") ?? "") };
    start(async () => {
      const result = await saveTrip(initial?.id ?? null, input);
      if (!result.ok) return setError(format(t.errors[result.error], result.values ?? {}));
      saved(result.value.id);
    });
  }

  return (
    <form className="compose" onSubmit={submit} noValidate>
      <div className="two stack">
        <div className="field-row">
          <label htmlFor="from">{t.trip.from}</label>
          <input id="from" name="from" className="field" maxLength={limits.place} placeholder={t.trip.fromPlaceholder} defaultValue={initial?.from ?? ""} required />
        </div>
        <div className="field-row">
          <label htmlFor="to">{t.trip.to}</label>
          <input id="to" name="to" className="field" maxLength={limits.place} placeholder={t.trip.toPlaceholder} defaultValue={initial?.to ?? ""} required />
        </div>
      </div>
      <div className="field-row">
        <label htmlFor="distance">{t.trip.distance}</label>
        <div className="money-input">
          <input id="distance" name="distance" inputMode="decimal" autoComplete="off" placeholder="0" value={distance} onChange={e => setDistance(e.target.value)} />
          <span className="unit" aria-hidden="true">{t.trip.unit}</span>
        </div>
        <label className="check"><input type="checkbox" checked={round} onChange={e => setRound(e.target.checked)} />{t.trip.roundTrip}</label>
      </div>
      <div className="field-row">
        <label htmlFor="date">{t.form.date}</label>
        <input id="date" name="date" type="date" className="field mono" max={data.today} value={day} onChange={e => setDay(e.target.value)} required />
      </div>
      <div className="paper flat" aria-live="polite">
        <div className="estimate">
          <span className="label">{estimate ? format(t.trip.estimateHint, { year: estimate.year, km: estimate.before }) : format(t.trip.scaleNote, { year: data.scales[0]?.year ?? "" })}</span>
          <span className="amount">{estimate ? estimate.amount : "—"}</span>
        </div>
        <div className="vehicle-line"><Car />{data.vehicle.label}<a className="link-button" href="/chest/settings#vehicle">{t.trip.changeVehicle}</a></div>
      </div>
      <details className="more" open={Boolean(initial?.note)}>
        <summary>{t.form.note}</summary>
        <div className="inside">
          <label htmlFor="note" className="visually-hidden">{t.form.note}</label>
          <textarea id="note" name="note" className="field" maxLength={limits.note} placeholder={t.form.notePlaceholder} defaultValue={initial?.note ?? ""} />
        </div>
      </details>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="save-bar">
        <button type="submit" className="button" disabled={pending}>{pending ? t.form.saving : t.form.save}</button>
        <a className="button quiet" href={initial ? `/chest/expenses/${initial.id}` : "/chest"}>{t.form.cancel}</a>
      </div>
    </form>
  );
}
