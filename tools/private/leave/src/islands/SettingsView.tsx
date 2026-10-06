import type { Outcome } from "@argentic/chest-app/client";
import { call, toast } from "@argentic/chest-app/client";
import { Checkbox, StatusBadge, Switch } from "@argentic/chest-ui/components";
import { useRef, useState } from "react";
import { Plus } from "../components/icons.tsx";
import { format } from "../i18n/format.ts";
import type { Catalogue } from "../i18n/index.ts";

type Words = { settings: Catalogue["settings"] };
type Rules = { counting: "ouvres" | "ouvrables"; alsace: boolean; workedHolidays: readonly string[]; periodStartMonth: number };

// Saves one after the other, in the order they were made: call() sends at
// once, and two changes of one switch in a row must land in that order.
function useQueue() {
  const last = useRef<Promise<unknown>>(Promise.resolve());
  return <T,>(step: () => Promise<T>): Promise<T> => {
    const next = last.current.then(step, step);
    last.current = next.catch(() => undefined);
    return next;
  };
}
export type TypeRow = {
  id: string; key: string | null; name: string; builtIn: string; color: string; balance: boolean; perYear: number; halfDays: boolean; counting: "company" | "worked" | "calendar";
  approval: boolean; notes: boolean; archived: boolean; period: "running" | "acquired" | "yearly"; periodMonth: number | null; unused: "carry" | "lose"; overdraw: boolean; away: boolean; payrollCode: string;
};

export function SettingsView(props: { settings: Rules; holidays: readonly { key: string; name: string; day: string; alsace: boolean }[]; months: readonly { value: number; name: string }[]; types: readonly TypeRow[]; colors: readonly { key: string; name: string }[]; t: Words }) {
  const { t } = props;
  const [rules, setRules] = useState(props.settings);
  const [adding, setAdding] = useState(false);
  const queue = useQueue();
  const companyMonth = format(t.settings.companyMonth, { month: props.months.find(m => m.value === rules.periodStartMonth)?.name ?? "" });

  // A rule changes at once, and only it is sent; refused, it is put back
  // (the toast says why).
  async function save(patch: { counting?: Rules["counting"]; alsace?: boolean; workedHolidays?: string[]; periodStartMonth?: number }) {
    const before = rules;
    setRules({ ...rules, ...patch });
    const result = await queue(() => call("saveSettings", patch));
    if (!result.ok) setRules(before);
    else toast({ id: "settings", text: t.settings.saved });
  }

  return (
    <div className="settings">
      <section className="panel">
        <h2>{t.settings.counting}</h2>
        <div className="choices">
          {(["ouvres", "ouvrables"] as const).map(c => (
            <label key={c} className={`choice${rules.counting === c ? " chosen" : ""}`}>
              <input type="radio" name="counting" checked={rules.counting === c} onChange={() => void save({ counting: c })} />
              <span><strong>{t.settings[c]}</strong><span className="muted small">{c === "ouvres" ? t.settings.ouvresHint : t.settings.ouvrablesHint}</span></span>
            </label>
          ))}
        </div>
        <p className="hint">{t.settings.countingWarning}</p>
      </section>

      <section className="panel">
        <h2>{t.settings.holidays}</h2>
        <Switch label={t.settings.alsace} checked={rules.alsace} onChange={on => void save({ alsace: on })} />
        <p className="muted small">{t.settings.workedHint}</p>
        <ul className="holiday-list">
          {props.holidays.filter(h => rules.alsace || !h.alsace).map(h => (
            <li key={h.key}>
              <span><strong>{h.name}</strong> <span className="muted small">{h.day}</span></span>
              <Switch className="small" label={<>{t.settings.worked}<span className="visually-hidden"> ({h.name})</span></>} checked={rules.workedHolidays.includes(h.key)} onChange={on => void save({ workedHolidays: on ? [...rules.workedHolidays, h.key] : rules.workedHolidays.filter(k => k !== h.key) })} />
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2><label htmlFor="period">{t.settings.period}</label></h2>
        <select id="period" className="field compact" value={rules.periodStartMonth} onChange={e => void save({ periodStartMonth: Number(e.target.value) })}>
          {props.months.map(m => <option key={m.value} value={m.value}>{m.name}</option>)}
        </select>
        <p className="muted small">{t.settings.periodHint}</p>
      </section>

      <section className="panel">
        <h2>{t.settings.types}</h2>
        <ul className="type-list">
          {props.types.map(ty => <TypeEditor key={ty.id} row={ty} colors={props.colors} months={props.months} companyMonth={companyMonth} t={t} />)}
          {adding && (
            <TypeEditor
              row={{ id: "", key: null, name: "", builtIn: "", color: "lilac", balance: false, perYear: 0, halfDays: true, counting: "company", approval: true, notes: true, archived: false, period: "running", periodMonth: null, unused: "carry", overdraw: true, away: true, payrollCode: "" }}
              colors={props.colors} months={props.months} companyMonth={companyMonth} t={t} onDone={() => setAdding(false)}
            />
          )}
        </ul>
        {!adding && <button type="button" className="button quiet" onClick={() => setAdding(true)}><Plus />{t.settings.addType}</button>}
      </section>
    </div>
  );
}

// A kind of leave. An existing one is saved as each field changes (a text
// when it is left), with a toast: nothing waits for a button, nothing is
// lost when the page is left. A new one is added with its button.
function TypeEditor({ row, colors, months, companyMonth, t, onDone }: { row: TypeRow; colors: readonly { key: string; name: string }[]; months: readonly { value: number; name: string }[]; companyMonth: string; t: Words; onDone?: () => void }) {
  const [v, setV] = useState(row);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const queue = useQueue();
  const idp = row.id || "new";
  const fresh = !row.id;
  // A step, then its toast (with an Undo when it can be reversed); a
  // refusal is said under the kind, and what changed is put back.
  const run = async (step: () => Promise<Outcome<unknown>>, undo?: () => void, done: string = t.settings.saved, reverse?: () => Promise<Outcome<unknown>>) => {
    setError(null);
    setPending(true);
    const result = await queue(step);
    setPending(false);
    if (!result.ok) {
      undo?.();
      setError(result.message);
      return;
    }
    toast({
      id: `type-${idp}`,
      text: done,
      ...(reverse ? {
        undo: async () => {
          const back = await reverse();
          return back.ok ? true : back.message;
        },
      } : {}),
    });
    onDone?.();
  };
  // What the server reads of a kind: the whole of a new one; of a saved
  // one, only what changed.
  const input = (x: Partial<TypeRow>) => ({
    ...(x.name !== undefined ? { name: x.name } : {}), ...(x.color !== undefined ? { color: x.color } : {}), ...(x.balance !== undefined ? { balance: x.balance } : {}),
    ...(x.perYear !== undefined ? { perYear: String(x.perYear) } : {}), ...(x.halfDays !== undefined ? { halfDays: x.halfDays } : {}), ...(x.counting !== undefined ? { counting: x.counting } : {}),
    ...(x.approval !== undefined ? { approval: x.approval } : {}), ...(x.notes !== undefined ? { notes: x.notes } : {}), ...(x.period !== undefined ? { period: x.period } : {}),
    ...(x.periodMonth !== undefined ? { periodMonth: x.periodMonth } : {}), ...(x.unused !== undefined ? { unused: x.unused } : {}), ...(x.overdraw !== undefined ? { overdraw: x.overdraw } : {}),
    ...(x.away !== undefined ? { away: x.away } : {}), ...(x.payrollCode !== undefined ? { payrollCode: x.payrollCode } : {}),
  });
  const whole = (x: TypeRow) => input({ ...x, perYear: x.balance ? x.perYear : 0, period: x.balance ? x.period : "running" });
  // change: the new value at once; saved now for an existing kind.
  const change = (patch: Partial<TypeRow>, now = true) => {
    const before = v;
    setV({ ...v, ...patch });
    if (!fresh && now) void run(() => call("saveType", { typeId: row.id, input: input(patch) }, { quiet: true }), () => setV(before));
  };
  // A text is saved when it is left, if it changed.
  const leave = () => {
    const patch: Partial<TypeRow> = { ...(v.name !== row.name ? { name: v.name } : {}), ...(v.perYear !== row.perYear ? { perYear: v.perYear } : {}), ...(v.payrollCode !== row.payrollCode ? { payrollCode: v.payrollCode } : {}) };
    if (!fresh && Object.keys(patch).length > 0) void run(() => call("saveType", { typeId: row.id, input: input(patch) }, { quiet: true }));
  };
  // A saved kind changes at once: a switch. A new one waits for its Add
  // button: the kit's Checkbox (the kit's rule for Switch).
  const flag = (key: "balance" | "halfDays" | "approval" | "notes" | "overdraw" | "away", label: string) => fresh ? (
    <Checkbox className="small" label={label} checked={v[key]} disabled={pending} onChange={on => change({ [key]: on })} />
  ) : (
    <Switch className="small" label={label} checked={v[key]} disabled={pending} onChange={on => change({ [key]: on })} />
  );
  return (
    <li className={`type-editor${row.archived ? " archived" : ""}`}>
      <form onSubmit={e => {
        e.preventDefault();
        if (fresh) void run(() => call("saveType", { typeId: null, input: whole(v) }, { quiet: true }));
        else leave();
      }}>
        <div className="form-row">
          <span className={`dot k-${v.color}`} aria-hidden="true" />
          <div className="field-group grow">
            <label className="field-label" htmlFor={`name-${idp}`}>{t.settings.name}</label>
            <input id={`name-${idp}`} className="field" maxLength={40} required={!row.key} placeholder={row.builtIn || undefined} value={v.name} onChange={e => change({ name: e.target.value }, false)} onBlur={leave} />
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor={`color-${idp}`}>{t.settings.color}</label>
            <select id={`color-${idp}`} className="field" value={v.color} disabled={pending} onChange={e => change({ color: e.target.value })}>
              {colors.map(c => <option key={c.key} value={c.key}>{c.name}</option>)}
            </select>
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor={`counting-${idp}`}>{t.settings.countedIn}</label>
            <select id={`counting-${idp}`} className="field" value={v.counting} disabled={pending} onChange={e => change({ counting: e.target.value === "calendar" ? "calendar" : e.target.value === "worked" ? "worked" : "company" })}>
              <option value="company">{t.settings.company}</option>
              <option value="worked">{t.settings.worked_}</option>
              <option value="calendar">{t.settings.calendar}</option>
            </select>
          </div>
        </div>
        <div className="flags">
          {flag("balance", t.settings.balance)}
          {v.balance && (
            <span className="per-year">
              <label htmlFor={`per-${idp}`}>{t.settings.perYear}</label>
              <input id={`per-${idp}`} className="field compact" inputMode="decimal" value={String(v.perYear)} onChange={e => change({ perYear: Number(e.target.value.replace(",", ".")) || 0 }, false)} onBlur={leave} />
            </span>
          )}
          {flag("halfDays", t.settings.halfDays)}
          {flag("approval", t.settings.approval)}
          {flag("notes", t.settings.notes)}
          {flag("away", t.settings.away)}
          {v.balance && flag("overdraw", t.settings.overdraw)}
        </div>
        {v.away && (
          <div className="form-row code-row">
            <div className="field-group">
              <label className="field-label" htmlFor={`code-${idp}`}>{t.settings.payrollCode}</label>
              <input id={`code-${idp}`} className="field compact code-field" maxLength={12} autoCapitalize="characters" spellCheck={false} aria-describedby={`code-hint-${idp}`} value={v.payrollCode} onChange={e => change({ payrollCode: e.target.value.toUpperCase() }, false)} onBlur={leave} />
            </div>
            <p id={`code-hint-${idp}`} className="muted small">{t.settings.payrollCodeHint}</p>
          </div>
        )}
        {v.balance && (
          <div className="form-row year-row">
            <div className="field-group">
              <label className="field-label" htmlFor={`period-${idp}`}>{t.settings.year}</label>
              <select id={`period-${idp}`} className="field" value={v.period} disabled={pending} onChange={e => change({ period: e.target.value === "acquired" ? "acquired" : e.target.value === "yearly" ? "yearly" : "running" })}>
                <option value="acquired">{t.settings.periodAcquired}</option>
                <option value="yearly">{t.settings.periodYearly}</option>
                <option value="running">{t.settings.periodRunning}</option>
              </select>
            </div>
            {v.period !== "running" && (
              <>
                <div className="field-group">
                  <label className="field-label" htmlFor={`month-${idp}`}>{t.settings.yearStarts}</label>
                  <select id={`month-${idp}`} className="field" value={v.periodMonth ?? 0} disabled={pending} onChange={e => change({ periodMonth: Number(e.target.value) || null })}>
                    <option value={0}>{companyMonth}</option>
                    {months.map(m => <option key={m.value} value={m.value}>{m.name}</option>)}
                  </select>
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor={`unused-${idp}`}>{t.settings.unused}</label>
                  <select id={`unused-${idp}`} className="field" value={v.unused} disabled={pending} onChange={e => change({ unused: e.target.value === "lose" ? "lose" : "carry" })}>
                    <option value="carry">{t.settings.carry}</option>
                    <option value="lose">{t.settings.lose}</option>
                  </select>
                </div>
              </>
            )}
          </div>
        )}
        {v.balance && v.period !== "running" && <p className="muted small">{v.period === "acquired" ? t.settings.periodAcquiredHint : t.settings.periodYearlyHint} {v.unused === "lose" ? t.settings.loseHint : t.settings.carryHint}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="card-actions">
          {fresh && <button type="submit" className="button small" disabled={pending}>{t.settings.add}</button>}
          {!fresh && <button type="button" className="button quiet small" disabled={pending} onClick={() => void run(() => call("archiveType", { id: row.id, archived: !row.archived }, { quiet: true }), undefined, row.archived ? t.settings.shownDone : t.settings.hiddenDone, () => call("archiveType", { id: row.id, archived: row.archived }, { quiet: true }))}>{row.archived ? t.settings.restore : t.settings.archive}</button>}
          {row.archived && <StatusBadge tone="neutral" label={t.settings.archived} size="s" />}
        </div>
      </form>
    </li>
  );
}
