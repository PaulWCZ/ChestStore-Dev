import { PeoplePicker } from "@argentic/chest-ui/components";
import { localSearch, type PeoplePickerWords } from "@argentic/chest-ui/components/logic";
import { useId } from "react";
import type { Catalogue } from "../i18n/index.ts";
import { format, pluralRules } from "../shared/format.ts";
import { singularOf, unitOf, unitParts, valueText } from "../shared/values.ts";

// Where the value comes from (lib/sources.ts): its owner, or another tool.
const sources = ["manual", "crm.won_amount", "crm.won_count", "tasks.done", "helpdesk.solved", "hiring.hired"] as const;
type Source = (typeof sources)[number];
const sourceWord = (s: Source) => s.replace(".", "_") as keyof Catalogue["form"]["sources"];
const toolOf = (s: Source) => s.split(".")[0] as keyof Catalogue["tools"];
const counts = (s: Source) => s === "tasks.done" || s === "helpdesk.solved" || s === "hiring.hired";
// mine: only what names the key result's owner; scope: a board of Tasks ("" every board).
export type KrDraft = { title: string; kind: "number" | "percent" | "money" | "milestone"; start: string; target: string; unit: string; owner: string; weight: string; source: Source; mine: boolean; scope: string };
export type FieldWords = { form: Catalogue["form"]; kinds: Catalogue["kinds"]; kindHints: Catalogue["kindHints"]; tools: Catalogue["tools"]; peoplePicker: PeoplePickerWords };
// A board of Tasks Goals has heard of (lib/sources.ts, knownBoards).
export type Board = { id: string; name: string };
// Someone who may own a key result (everyone who has the tool).
export type Owner = { id: string; name: string; photo: string | null };

export const emptyDraft = (owner: string): KrDraft => ({ title: "", kind: "number", start: "0", target: "", unit: "", owner, weight: "1", source: "manual", mine: false, scope: "" });

// Whether a draft is still as it was (a dialog asks before closing only
// when something changed).
export const sameDraft = (a: KrDraft, b: KrDraft): boolean => (Object.keys(a) as (keyof KrDraft)[]).every(k => a[k] === b[k]);

// A number typed in either convention ("12,5" or "12.5"), for the sentence
// under the fields only: the server reads and checks the real value.
const typed = (text: string): number | null => {
  const n = Number(text.replace(/[\s  ]/gu, "").replace(",", "."));
  return text.trim() === "" || !Number.isFinite(n) ? null : n;
};

// The fields of one key result: what we count, how (from… to…, in what),
// who owns it; how much it counts and where its value comes from wait
// under "More options". Once the target is typed, a sentence says it back
// ("From 0 to 20 customers") — never before, so no example reads as a value.
export function KeyResultFields({ draft, onChange, owners, t, locale = "en", currency = null, boards = [] }: { draft: KrDraft; onChange: (d: KrDraft) => void; owners: Owner[]; t: FieldWords; locale?: string; currency?: string | null; boards?: Board[] }) {
  const uid = useId();
  const set = (patch: Partial<KrDraft>) => onChange({ ...draft, ...patch });
  const f = t.form;
  const fed = draft.source !== "manual";
  const start = typed(draft.start) ?? 0, target = typed(draft.target);
  const measured = { kind: draft.kind === "milestone" ? "number" as const : draft.kind, unit: draft.kind === "number" ? draft.unit.trim() : "", currency, unitLocale: locale };
  // "From 0 to 20 customers": the unit once, after the target; a
  // percentage or an amount carries its sign on both.
  const plain = (n: number) => valueText({ kind: "number", unit: "", currency: null }, n, locale);
  // The unit: asked in the plural ("customers"); the form for one is
  // guessed ("customer") and shown to correct only when the value may be 1
  // (in French, 0 too). Stored as "customer/customers".
  const parts = unitParts(draft.unit);
  const setPlural = (plural: string) => {
    const guessedBefore = singularOf(parts.plural, locale) ?? "";
    const one = parts.one === "" || parts.one === guessedBefore ? singularOf(plural, locale) ?? "" : parts.one;
    set({ unit: unitOf(plural, one) });
  };
  const low = Math.min(start, target ?? start), high = Math.max(start, target ?? start);
  const mayBeOne = draft.kind === "number" && parts.plural.trim() !== "" && low <= 1 && high >= (pluralRules(locale).select(0) === "one" ? 0 : 1);
  const summary = draft.kind !== "milestone" && target !== null && target !== start ? format(f.summary, { start: draft.kind === "number" ? plain(start) : valueText(measured, start, locale), target: valueText(measured, target, locale) }) : null;
  return (
    <>
      <div>
        <label className="label" htmlFor={`${uid}-title`}>{f.krName}</label>
        <input id={`${uid}-title`} className="field" maxLength={200} value={draft.title} placeholder={f.krTitlePlaceholder} onChange={e => set({ title: e.target.value })} />
      </div>
      <div className="grid-2">
        <div>
          <label className="label" htmlFor={`${uid}-kind`}>{f.kind}</label>
          <select id={`${uid}-kind`} className="select" value={draft.kind} disabled={fed} onChange={e => set({ kind: e.target.value as KrDraft["kind"], ...(e.target.value === "percent" && draft.target === "" ? { start: "0", target: "100" } : {}) })} aria-describedby={`${uid}-kind-hint`}>
            {(["number", "percent", "money", "milestone"] as const).map(k => <option key={k} value={k}>{t.kinds[k]}</option>)}
          </select>
          <p id={`${uid}-kind-hint`} className="hint">{t.kindHints[draft.kind]}</p>
        </div>
        {owners.length > 0 && (
          <PeoplePicker label={f.krOwner} value={owners.filter(o => o.id === draft.owner)} onChange={v => set({ owner: v[0]?.id ?? "" })} search={localSearch(owners)} labels={t.peoplePicker} lang={locale} />
        )}
      </div>
      {draft.kind !== "milestone" && (
        <div className="stack-s">
          <div className="measure">
            <div>
              <label className="label" htmlFor={`${uid}-start`}>{f.start}</label>
              <input id={`${uid}-start`} className="field" inputMode="decimal" autoComplete="off" value={draft.start} onChange={e => set({ start: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor={`${uid}-target`}>{f.target}</label>
              <input id={`${uid}-target`} className="field" inputMode="decimal" autoComplete="off" value={draft.target} onChange={e => set({ target: e.target.value })} aria-describedby={`${uid}-summary`} />
            </div>
            {draft.kind === "number" && (
              <div className="unit">
                <label className="label" htmlFor={`${uid}-unit`}>{f.unit}</label>
                <input id={`${uid}-unit`} className="field" maxLength={20} value={parts.plural} placeholder={f.unitPlaceholder} onChange={e => setPlural(e.target.value)} />
              </div>
            )}
          </div>
          {mayBeOne && (
            <div className="unit-one">
              <label className="label" htmlFor={`${uid}-unit-one`}>{f.unitOne}</label>
              <input id={`${uid}-unit-one`} className="field" maxLength={20} value={parts.one} placeholder={parts.plural} onChange={e => set({ unit: unitOf(parts.plural, e.target.value) })} />
            </div>
          )}
          <p id={`${uid}-summary`} className="summary-line" aria-live="polite">{summary}</p>
        </div>
      )}
      <details className="more">
        <summary>{f.more}</summary>
        <div className="grid-2">
          <div>
            <label className="label" htmlFor={`${uid}-weight`}>{f.weight}</label>
            <select id={`${uid}-weight`} className="select weight" value={draft.weight} onChange={e => set({ weight: e.target.value })}>
              {(["1", "2", "3"] as const).map(w => <option key={w} value={w}>{f.weights[w]}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor={`${uid}-source`}>{f.source}</label>
            <select id={`${uid}-source`} className="select" value={draft.source} aria-describedby={`${uid}-source-hint`} onChange={e => {
              const source = e.target.value as Source;
              set({ source, mine: counts(source) && draft.mine, scope: source === "tasks.done" ? draft.scope : "", ...(source === "crm.won_amount" ? { kind: "money" as const } : source !== "manual" ? { kind: "number" as const, unit: draft.unit || "" } : {}) });
            }}>
              {sources.map(s => <option key={s} value={s}>{f.sources[sourceWord(s)]}</option>)}
            </select>
            {fed && <p id={`${uid}-source-hint`} className="hint">{format(f.sourceHint, { tool: t.tools[toolOf(draft.source)] })}</p>}
          </div>
        </div>
        {draft.source === "tasks.done" && (
          <div>
            <label className="label" htmlFor={`${uid}-board`}>{f.board}</label>
            <select id={`${uid}-board`} className="select" value={draft.scope} aria-describedby={`${uid}-board-hint`} onChange={e => set({ scope: e.target.value })}>
              <option value="">{f.everyBoard}</option>
              {boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <p id={`${uid}-board-hint`} className="hint">{f.boardHint}</p>
          </div>
        )}
        {counts(draft.source) && (
          <label className="check">
            <input type="checkbox" checked={draft.mine} onChange={e => set({ mine: e.target.checked })} />
            {f.mine[sourceWord(draft.source) as keyof typeof f.mine]}
          </label>
        )}
      </details>
    </>
  );
}

// What an action receives for a draft (src/actions.ts reads each part):
// the numbers as typed, read on the server in either convention.
export type KeyResultSent = { title: string; kind: KrDraft["kind"]; start: string; target: string; unit: string; owner: string; weight: string; source: Source; mine: boolean; scope: string };
export function krInput(d: KrDraft): KeyResultSent {
  return { title: d.title, kind: d.kind, start: d.start, target: d.target, unit: d.unit, owner: d.owner, weight: d.weight, source: d.source, mine: d.mine, scope: d.scope };
}
