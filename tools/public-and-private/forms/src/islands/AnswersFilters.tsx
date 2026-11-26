import { DateField, Filters, SearchBox } from "@argentic/chest-ui/components";
import type { DateWords, FilterWords, SearchWords } from "@argentic/chest-ui/components/logic";
import { navigate } from "@argentic/chest-app/client";
import { useEffect, useId, useRef, useState } from "react";
import { Down } from "../components/icons.tsx";

type Choice = { value: string; label: string };
export type FilterQuestion = { id: string; title: string; options: Choice[] };

// The answers' search and filters, all in the address (it can be shared
// or reloaded): the kit's search box ("/" focuses it), where an answer
// stands as chips with their counts, an answer to a choice (one group per
// question), the days. Each applies as soon as it changes. On a phone they
// sit behind one "Filter" button (the list comes first), open from the
// start when a filter is on — what filters the list is never hidden.
export function AnswersFilters({ base, keep, q, where, from, to, today, active, states, questions, t }: {
  base: string;
  // The address's other values (the columns, the order), kept.
  keep: Record<string, string>;
  q: string;
  where: string;
  from: string;
  to: string;
  today: string;
  active: number;
  states: { label: string; options: (Choice & { count: number })[] };
  questions: FilterQuestion[];
  t: { search: string; searchWords: SearchWords; filterButton: string; filterLabel: string; filter: string; filterAll: string; from: string; to: string; date: DateWords; filters: FilterWords };
}) {
  const [open, setOpen] = useState(active > 0);
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const [days, setDays] = useState({ from: from || null, to: to || null });
  const changed = useRef(false);
  // A day chosen: the filter applies at once, like the others.
  useEffect(() => {
    if (!changed.current) return;
    changed.current = false;
    form.current?.requestSubmit();
  }, [days]);
  const setDay = (key: "from" | "to") => (value: string | null) => {
    changed.current = true;
    setDays(d => ({ ...d, [key]: value }));
  };
  const all = new URLSearchParams({ ...keep, ...(q ? { q } : {}), ...(where ? { where } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) });
  const others = Object.entries(keep).filter(([k]) => !["where", "from", "to", "status"].includes(k));
  return (
    <>
      <SearchBox action={base} value={q} maxLength={100} keep={Object.fromEntries([...all].filter(([k]) => k !== "q"))} labels={{ ...t.searchWords, label: t.search, placeholder: t.search }} />
      <div className={`filter-fold${open ? " open" : ""}`}>
        <button type="button" className="button quiet small filter-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}>
          {t.filterButton}{active > 0 && <span className="filter-count">{active}</span>}<span className="chevron" aria-hidden="true"><Down /></span>
        </button>
        <div id={id} className="filter-body">
          <Filters path={base} params={all.toString()} labels={t.filters} groups={[{ key: "status", label: states.label, all: true, options: states.options }]} />
          <form ref={form} className="answers-filter" method="get" action={base} role="search" aria-label={t.filterLabel}
            onSubmit={e => {
              // In place, as a link of the page would.
              e.preventDefault();
              const data = new URLSearchParams();
              for (const [k, v] of new FormData(e.currentTarget)) if (typeof v === "string" && v !== "") data.append(k, v);
              void navigate(`${base}${data.size ? "?" + data : ""}`, { top: false });
            }}
            onChange={e => { if ((e.target as HTMLElement).tagName === "SELECT") form.current?.requestSubmit(); }}>
            {[...others, ...(q ? [["q", q] as [string, string]] : [])].map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            {keep["status"] && <input type="hidden" name="status" value={keep["status"]} />}
            {questions.length > 0 && (
              <label className="mini">
                <span className="mini-label">{t.filter}</span>
                <select className="field" name="where" defaultValue={where}>
                  <option value="">{t.filterAll}</option>
                  {questions.map(c => (
                    <optgroup key={c.id} label={c.title}>
                      {c.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
            )}
            <div className="filter-dates">
              <DateField label={t.from} value={days.from} onChange={setDay("from")} today={today} max={days.to} chips={false} name="from" labels={t.date} />
              <DateField label={t.to} value={days.to} onChange={setDay("to")} today={today} min={days.from} chips={false} name="to" labels={t.date} />
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
