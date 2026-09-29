"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Back, Cross, Down, KindIcon, Mask, Next, Plus, Repeat as RepeatIcon, Send, Trash, Up } from "../../components/icons.tsx";
import { useToast } from "../../components/toast.tsx";
import { format, plural } from "../../lib/i18n/format.ts";
import type { Catalogue } from "../../lib/i18n/index.ts";
import { editPoll, savePoll, searchPeople } from "./actions.ts";
import type { ComposerValue, Slot, SurveyQuestion } from "../../lib/composer-value.ts";

// Writing a poll: its kind, its question, the answers (or days, or survey
// questions), who is asked, anonymous or not, when results show, when it
// closes. A new poll's words are kept in this browser until it is saved: a
// closed tab loses nothing.
type QKind = "choice" | "scale" | "text" | "enps";
type Question = SurveyQuestion & { key: number };

type Words = Pick<Catalogue, "composer" | "kinds" | "errors" | "repeat">;

const times = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
const storageKey = "polls:new";
// The half hours, and a time kept from before that is not one of them.
const timesWith = (value: string) => (value && !times.includes(value) ? [...times, value].sort() : times);

function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: offset }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  return cells;
}

export function Composer({ mode, pollId, initial, groups, today, monthNames, weekdayNames, locale, round, t }: {
  mode: "new" | "draft" | "open";
  // An open round of a pulse survey: its closing time is the series'.
  round?: boolean;
  pollId: string | null;
  initial: ComposerValue;
  groups: { id: string; name: string; size: number }[] | null;
  today: string;
  monthNames: string[];
  weekdayNames: string[];
  locale: string;
  t: Words;
}) {
  const router = useRouter();
  const toast = useToast();
  const c = t.composer;
  const nextKey = useRef(100);
  const withKeys = (qs: Omit<Question, "key">[]): Question[] => qs.map(q => ({ ...q, key: nextKey.current++ }));
  const [value, setValue] = useState<ComposerValue>(initial);
  const [questions, setQuestions] = useState<Question[]>(() => initial.questions.map((q, i) => ({ ...q, key: i })));
  const [month, setMonth] = useState(() => {
    const start = initial.days[0]?.day ?? today;
    return { year: Number(start.slice(0, 4)), month: Number(start.slice(5, 7)) - 1 };
  });
  const [busy, setBusy] = useState<"send" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const restored = useRef(false);
  const locked = mode === "open";

  // A new poll's words survive a closed tab (this browser only).
  useEffect(() => {
    if (mode !== "new" || restored.current) return;
    restored.current = true;
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as { value: ComposerValue } | null;
      if (saved?.value && saved.value.kind === initial.kind && (saved.value.title || saved.value.details)) {
        setValue(saved.value);
        setQuestions(withKeys(saved.value.questions));
      }
    } catch {
      // Nothing kept, or unreadable: start afresh.
    }
  }, []);
  useEffect(() => {
    if (mode !== "new" || !restored.current) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ value: { ...value, questions: questions.map(({ key: _key, ...q }) => q) } }));
    } catch {
      // Storage full or refused: the form still works.
    }
  }, [mode, value, questions]);

  const set = (change: Partial<ComposerValue>) => setValue(v => ({ ...v, ...change }));
  const setQuestion = (key: number, change: Partial<Question>) => setQuestions(qs => qs.map(q => (q.key === key ? { ...q, ...change } : q)));

  function dayLabel(day: string): string {
    const d = new Date(day + "T12:00:00Z");
    return `${weekdayNames[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()} ${monthNames[d.getUTCMonth()]}`;
  }
  function toggleDay(day: string) {
    const has = value.days.some(d => d.day === day);
    set({ days: has ? value.days.filter(d => d.day !== day) : [...value.days, { day, slots: [] }].sort((a, b) => a.day.localeCompare(b.day)) });
  }
  const setSlots = (day: string, slots: Slot[]) => set({ days: value.days.map(d => (d.day === day ? { ...d, slots } : d)) });
  // The times of the first day that has some, on every chosen day.
  const copyTimes = () => {
    const from = value.days.find(d => d.slots.length > 0);
    if (from) set({ days: value.days.map(d => ({ ...d, slots: from.slots.map(x => ({ ...x })) })) });
  };

  // People picked by name: the Chest finds them as one types.
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ id: string; name: string }[] | null>(null);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) { setFound(null); return; }
    let live = true;
    const timer = window.setTimeout(async () => {
      const result = await searchPeople(q);
      if (live) setFound(result.ok ? result.value : []);
    }, 250);
    return () => { live = false; window.clearTimeout(timer); };
  }, [query]);
  const addPerson = (p: { id: string; name: string }) => {
    if (!value.people.some(x => x.id === p.id)) set({ people: [...value.people, p] });
    setQuery("");
    setFound(null);
  };
  const hasGroups = groups !== null && groups.length > 0;

  function input(open: boolean) {
    return {
      kind: value.kind,
      title: value.title,
      details: value.details,
      ...(value.kind === "choice" ? { options: value.options, multiple: value.multiple, other: value.other } : {}),
      ...(value.kind === "date" ? { dates: value.days.flatMap(d => (d.slots.length === 0 ? [{ day: d.day }] : d.slots.map(s => ({ day: d.day, start: s.start, end: s.end || null })))) } : {}),
      ...(value.kind === "survey" ? { questions: questions.map(q => ({ kind: q.kind, text: q.text, ...(q.kind === "choice" ? { options: q.options, multiple: q.multiple } : {}), ...(q.kind === "scale" ? { low: q.low, high: q.high } : {}) })) } : {}),
      anonymous: value.anonymous,
      results: value.anonymous ? "closed" : value.results,
      audience: value.everyone ? { everyone: true } : { everyone: false, groups: value.groups, people: value.people.map(p => p.id) },
      closes: value.kind === "survey" && value.repeat ? null : value.closes,
      ...(value.kind !== "survey" && value.slots !== null && !value.anonymous ? { slots: value.slots } : {}),
      ...(value.kind === "survey" && value.repeat ? { repeat: value.repeat } : {}),
      open,
    };
  }

  async function submit(open: boolean) {
    setBusy(open ? "send" : "save");
    setError(null);
    const result = locked
      ? await editPoll(pollId!, { title: value.title, details: value.details, closes: round ? null : value.closes })
      : await savePoll(pollId, input(open));
    setBusy(null);
    if (!result.ok) {
      const message = format(t.errors[result.error], result.values ?? {});
      setError(message);
      toast(message);
      return;
    }
    if (mode === "new") {
      try { window.localStorage.removeItem(storageKey); } catch { /* nothing kept */ }
    }
    const id = result.value.id;
    if (locked) {
      toast(c.saved);
      router.push(`/chest/polls/${id}`);
    } else if (open) {
      toast(c.sent);
      router.push(`/chest/polls/${id}`);
    } else {
      toast(c.draftSaved);
      if (mode === "new") router.replace(`/chest/polls/${id}/edit`);
      else router.refresh();
    }
  }
  const onSubmit = (e: FormEvent) => { e.preventDefault(); void submit(!locked); };

  const grid = monthGrid(month.year, month.month);
  const thisMonth = Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7)) - 1;
  const shownMonth = month.year * 12 + month.month;
  const moveMonth = (step: number) => setMonth(m => {
    const n = m.year * 12 + m.month + step;
    return { year: Math.floor(n / 12), month: n % 12 };
  });

  return (
    <form className="composer" onSubmit={onSubmit} noValidate>
      <a className="back" href="/chest"><Back />{c.cancel}</a>
      <h1 className="visually-hidden">{mode === "new" ? c.newTitle : mode === "draft" ? c.draftTitle : c.editTitle}</h1>

      {!locked && (
        <fieldset className="kind-switch">
          <legend className="visually-hidden">{c.kind}</legend>
          {(["choice", "date", "survey"] as const).map(k => (
            <label key={k} className={k}>
              <input type="radio" name="kind" checked={value.kind === k} onChange={() => set({ kind: k })} />
              <span className="kind-icon"><KindIcon kind={k} /></span>
              {t.kinds[k].name}
            </label>
          ))}
        </fieldset>
      )}

      <section className="card">
        <div>
          <label className="label" htmlFor="title">{c.title[value.kind]}</label>
          <input id="title" className="field title-field" value={value.title} maxLength={140} placeholder={c.titlePlaceholder[value.kind]} onChange={e => set({ title: e.target.value })} autoFocus={mode === "new"} />
        </div>
        <div>
          <label className="label" htmlFor="details">{c.details}</label>
          <textarea id="details" className="field" rows={2} value={value.details} maxLength={1000} placeholder={c.detailsPlaceholder} onChange={e => set({ details: e.target.value })} />
        </div>
      </section>

      {locked && <p className="note warn"><Mask />{c.locked}</p>}

      {!locked && value.kind === "choice" && (
        <section className="card" aria-labelledby="choices">
          <h2 id="choices">{c.choices}</h2>
          <div className="list-edit">
            {value.options.map((o, i) => (
              <div key={i} className="item">
                <span className="bullet" aria-hidden="true">{i + 1}</span>
                <input className="field" value={o} maxLength={120} aria-label={format(c.choice, { n: i + 1 })} placeholder={format(c.choice, { n: i + 1 })}
                  onChange={e => set({ options: value.options.map((x, j) => (j === i ? e.target.value : x)) })}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (i === value.options.length - 1 && value.options.length < 20) set({ options: [...value.options, ""] }); } }} />
                <button type="button" className="icon-button" disabled={value.options.length <= 2} onClick={() => set({ options: value.options.filter((_, j) => j !== i) })}><Cross /><span className="visually-hidden">{format(c.removeChoice, { n: i + 1 })}</span></button>
              </div>
            ))}
          </div>
          {value.options.length < 20 && <button type="button" className="button small add-line" onClick={() => set({ options: [...value.options, ""] })}><Plus />{c.addChoice}</button>}
          <label className="switch"><input type="checkbox" checked={value.multiple} onChange={e => set({ multiple: e.target.checked })} /><span className="switch-text"><strong>{c.multiple}</strong></span></label>
          <label className="switch"><input type="checkbox" checked={value.other} onChange={e => set({ other: e.target.checked })} /><span className="switch-text"><strong>{c.other}</strong></span></label>
        </section>
      )}

      {!locked && value.kind === "date" && (
        <section className="card" aria-labelledby="days">
          <h2 id="days">{c.dates}</h2>
          <p className="hint">{c.datesHint}</p>
          <div className="cal">
            <div className="cal-head">
              <button type="button" className="icon-button" disabled={shownMonth <= thisMonth} onClick={() => moveMonth(-1)}><Back /><span className="visually-hidden">{c.previousMonth}</span></button>
              <strong aria-live="polite">{monthNames[month.month]} {month.year}</strong>
              <button type="button" className="icon-button" disabled={shownMonth >= thisMonth + 12} onClick={() => moveMonth(1)}><Next /><span className="visually-hidden">{c.nextMonth}</span></button>
            </div>
            <div className="cal-grid">
              {weekdayNames.map(w => <span key={w} className="wd" aria-hidden="true">{w}</span>)}
              {grid.map((day, i) => day === null ? <span key={"x" + i} /> : (
                <button key={day} type="button" className={"cal-day" + (day === today ? " today" : "")} disabled={day < today} aria-pressed={value.days.some(d => d.day === day)} aria-label={dayLabel(day)} onClick={() => toggleDay(day)}>
                  {Number(day.slice(8))}
                </button>
              ))}
            </div>
          </div>
          {value.days.length === 0 ? <p className="hint">{c.noDays}</p> : (
            <div className="chosen-days">
              {value.days.map(d => (
                <div key={d.day} className="chosen-day">
                  <div className="top">
                    <strong>{dayLabel(d.day)}</strong>
                    {d.slots.length === 0 && <span className="chip">{c.allDay}</span>}
                    <button type="button" className="icon-button" onClick={() => toggleDay(d.day)}><Trash /><span className="visually-hidden">{format(c.removeDay, { day: dayLabel(d.day) })}</span></button>
                  </div>
                  <div className="slots">
                    {d.slots.map((s, i) => (
                      <div key={i} className="slot">
                        <select className="field" aria-label={c.from} value={s.start} onChange={e => setSlots(d.day, d.slots.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))}>
                          {timesWith(s.start).map(time => <option key={time} value={time}>{time}</option>)}
                        </select>
                        <span className="sep" aria-hidden="true">–</span>
                        <select className="field" aria-label={c.to} value={s.end} onChange={e => setSlots(d.day, d.slots.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))}>
                          <option value="">{c.noEnd}</option>
                          {timesWith(s.end).map(time => <option key={time} value={time}>{time}</option>)}
                        </select>
                        <button type="button" className="icon-button" onClick={() => setSlots(d.day, d.slots.filter((_, j) => j !== i))}><Cross /><span className="visually-hidden">{c.removeTime}</span></button>
                      </div>
                    ))}
                    <button type="button" className="button link add-line" onClick={() => setSlots(d.day, [...d.slots, d.slots.length > 0 ? { ...d.slots[d.slots.length - 1]! } : { start: "12:00", end: "14:00" }])}><Plus />{c.addTime}</button>
                  </div>
                </div>
              ))}
              {value.days.length > 1 && value.days.some(d => d.slots.length > 0) && (
                <button type="button" className="button small add-line" onClick={copyTimes}>{c.copyTimes}</button>
              )}
            </div>
          )}
        </section>
      )}

      {!locked && value.kind !== "survey" && !value.anonymous && (
        <section className="card" aria-labelledby="slots-title">
          <label className="switch">
            <input type="checkbox" checked={value.slots !== null} onChange={e => set({ slots: e.target.checked ? 3 : null })} />
            <span className="switch-text"><strong id="slots-title">{c.slots}</strong><span className="hint">{value.kind === "date" ? c.slotsDateHint : c.slotsHint}</span></span>
          </label>
          {value.slots !== null && (
            <div className="slots-count">
              <label className="label" htmlFor="slots">{c.slotsCount}</label>
              <input id="slots" className="field" type="number" inputMode="numeric" min={1} max={999} value={value.slots} onChange={e => set({ slots: Math.max(1, Math.min(999, Math.floor(Number(e.target.value) || 1))) })} />
            </div>
          )}
        </section>
      )}

      {!locked && value.kind === "survey" && (
        <section className="card" aria-labelledby="questions">
          <h2 id="questions">{c.questions}</h2>
          {questions.map((q, i) => (
            <fieldset key={q.key} className="question-edit">
              <legend className="visually-hidden">{format(c.question, { n: i + 1 })}</legend>
              <div className="head">
                <strong aria-hidden="true">{format(c.question, { n: i + 1 })}</strong>
                <button type="button" className="icon-button" disabled={i === 0} onClick={() => setQuestions(qs => { const n = [...qs]; [n[i - 1], n[i]] = [n[i]!, n[i - 1]!]; return n; })}><Up /><span className="visually-hidden">{format(c.moveUp, { n: i + 1 })}</span></button>
                <button type="button" className="icon-button" disabled={i === questions.length - 1} onClick={() => setQuestions(qs => { const n = [...qs]; [n[i + 1], n[i]] = [n[i]!, n[i + 1]!]; return n; })}><Down /><span className="visually-hidden">{format(c.moveDown, { n: i + 1 })}</span></button>
                <button type="button" className="icon-button" disabled={questions.length <= 1} onClick={() => setQuestions(qs => qs.filter(x => x.key !== q.key))}><Trash /><span className="visually-hidden">{format(c.removeQuestion, { n: i + 1 })}</span></button>
              </div>
              <input className="field" value={q.text} maxLength={200} aria-label={format(c.question, { n: i + 1 })} placeholder={c.questionPlaceholder} onChange={e => setQuestion(q.key, { text: e.target.value })} />
              <div>
                <label className="label" htmlFor={"kind-" + q.key}>{c.answerWith}</label>
                <select id={"kind-" + q.key} className="field" value={q.kind} onChange={e => {
                  const kind = e.target.value as QKind;
                  setQuestion(q.key, { kind, ...(kind === "enps" && q.text.trim() === "" ? { text: c.enpsDefault } : {}) });
                }}>
                  {(["choice", "scale", "text", "enps"] as const).map(k => <option key={k} value={k}>{c.questionKinds[k]}</option>)}
                </select>
              </div>
              {q.kind === "enps" && <p className="hint">{c.enpsHint}</p>}
              {q.kind === "choice" && (
                <>
                  <div className="list-edit">
                    {q.options.map((o, j) => (
                      <div key={j} className="item">
                        <span className="bullet" aria-hidden="true">{j + 1}</span>
                        <input className="field" value={o} maxLength={120} aria-label={format(c.choice, { n: j + 1 })} placeholder={format(c.choice, { n: j + 1 })} onChange={e => setQuestion(q.key, { options: q.options.map((x, k) => (k === j ? e.target.value : x)) })} />
                        <button type="button" className="icon-button" disabled={q.options.length <= 2} onClick={() => setQuestion(q.key, { options: q.options.filter((_, k) => k !== j) })}><Cross /><span className="visually-hidden">{format(c.removeChoice, { n: j + 1 })}</span></button>
                      </div>
                    ))}
                  </div>
                  {q.options.length < 12 && <button type="button" className="button small add-line" onClick={() => setQuestion(q.key, { options: [...q.options, ""] })}><Plus />{c.addChoice}</button>}
                  <label className="switch"><input type="checkbox" checked={q.multiple} onChange={e => setQuestion(q.key, { multiple: e.target.checked })} /><span className="switch-text"><strong>{c.multiple}</strong></span></label>
                </>
              )}
              {q.kind === "scale" && (
                <div className="two">
                  <div><label className="label" htmlFor={"low-" + q.key}>{c.low}</label><input id={"low-" + q.key} className="field" value={q.low} maxLength={40} placeholder={c.lowPlaceholder} onChange={e => setQuestion(q.key, { low: e.target.value })} /></div>
                  <div><label className="label" htmlFor={"high-" + q.key}>{c.high}</label><input id={"high-" + q.key} className="field" value={q.high} maxLength={40} placeholder={c.highPlaceholder} onChange={e => setQuestion(q.key, { high: e.target.value })} /></div>
                </div>
              )}
            </fieldset>
          ))}
          {questions.length < 10 && <button type="button" className="button small add-line" onClick={() => setQuestions(qs => [...qs, { key: nextKey.current++, kind: "choice", text: "", options: ["", ""], multiple: false, low: "", high: "" }])}><Plus />{c.addQuestion}</button>}
          <fieldset className="repeat">
            <legend className="label"><RepeatIcon />{c.repeat}</legend>
            <label className="radio-line"><input type="radio" name="repeat" checked={value.repeat === null} onChange={() => set({ repeat: null })} />{c.once}</label>
            <label className="radio-line"><input type="radio" name="repeat" checked={value.repeat === "week"} onChange={() => set({ repeat: "week" })} />{t.repeat.week}</label>
            <label className="radio-line"><input type="radio" name="repeat" checked={value.repeat === "month"} onChange={() => set({ repeat: "month" })} />{t.repeat.month}</label>
            {value.repeat && <p className="hint">{c.repeatHint}</p>}
          </fieldset>
        </section>
      )}

      <section className="card" aria-labelledby="settings">
        <h2 id="settings">{c.settings}</h2>
        {!locked && (
          <fieldset>
            <legend className="label">{c.who}</legend>
            <label className="radio-line"><input type="radio" name="who" checked={value.everyone} onChange={() => set({ everyone: true })} />{c.everyone}</label>
            <label className="radio-line"><input type="radio" name="who" checked={!value.everyone} onChange={() => set({ everyone: false })} />{c.chosen}</label>
            {!value.everyone && (
              <div className="audience">
                {hasGroups ? (
                  <div className="group-list" role="group" aria-label={c.groupsLabel}>
                    {groups!.map(g => (
                      <label key={g.id}>
                        <input type="checkbox" checked={value.groups.includes(g.id)} onChange={e => set({ groups: e.target.checked ? [...value.groups, g.id] : value.groups.filter(x => x !== g.id) })} />
                        <span>{g.name} <small>{plural(c.groupSize, g.size, locale)}</small></span>
                      </label>
                    ))}
                  </div>
                ) : <p className="hint">{c.noGroups}</p>}
                <div className="people-pick">
                  <label className="label" htmlFor="find-people">{c.peopleLabel}</label>
                  {value.people.length > 0 && (
                    <ul className="picked">
                      {value.people.map(p => (
                        <li key={p.id} className="chip">
                          {p.name}
                          <button type="button" className="chip-x" onClick={() => set({ people: value.people.filter(x => x.id !== p.id) })}><Cross /><span className="visually-hidden">{format(c.removePerson, { name: p.name })}</span></button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <input id="find-people" className="field" type="search" autoComplete="off" value={query} placeholder={c.findPeople} onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); const first = found?.find(p => !value.people.some(x => x.id === p.id)); if (first) addPerson(first); } }} />
                  {found !== null && (
                    found.length === 0 ? <p className="hint" role="status">{c.noMatch}</p> : (
                      <ul className="found" aria-label={c.findPeople}>
                        {found.filter(p => !value.people.some(x => x.id === p.id)).map(p => (
                          <li key={p.id}><button type="button" className="button small" onClick={() => addPerson(p)}><Plus />{p.name}</button></li>
                        ))}
                      </ul>
                    )
                  )}
                </div>
              </div>
            )}
          </fieldset>
        )}
        {!locked && (value.kind === "survey" || value.slots === null) && (
          <label className="switch">
            <input type="checkbox" checked={value.anonymous} onChange={e => set({ anonymous: e.target.checked, ...(e.target.checked ? { results: "closed" as const } : {}) })} />
            <span className="switch-text"><strong>{c.anonymous}</strong><span className="hint">{c.anonymousHint}</span></span>
          </label>
        )}
        {!locked && (value.anonymous ? (
          <p className="note anon"><Mask />{c.anonymousResults}</p>
        ) : (
          <fieldset>
            <legend className="label">{c.results}</legend>
            <label className="radio-line"><input type="radio" name="results" checked={value.results === "live"} onChange={() => set({ results: "live" })} />{c.live}</label>
            <label className="radio-line"><input type="radio" name="results" checked={value.results === "closed"} onChange={() => set({ results: "closed" })} />{c.afterClose}</label>
            <p className="hint">{c.resultsHint}</p>
          </fieldset>
        ))}
        {(value.kind === "survey" && value.repeat) || round ? <p className="hint"><RepeatIcon /> {c.repeatHint}</p> : (
        <fieldset>
          <legend className="label">{c.closes}</legend>
          <label className="radio-line"><input type="radio" name="closes" checked={value.closes === null} onChange={() => set({ closes: null })} />{c.never}</label>
          <label className="radio-line"><input type="radio" name="closes" checked={value.closes !== null} onChange={() => set({ closes: value.closes ?? { day: nextDay(today, 3), time: "18:00" } })} />{c.onDate}</label>
          {value.closes && (
            <div className="closing">
              <input className="field" type="date" aria-label={c.day} min={today} value={value.closes.day} onChange={e => set({ closes: { ...value.closes!, day: e.target.value } })} />
              <select className="field" aria-label={c.time} value={value.closes.time} onChange={e => set({ closes: { ...value.closes!, time: e.target.value } })}>
                {timesWith(value.closes.time).map(time => <option key={time} value={time}>{time}</option>)}
              </select>
            </div>
          )}
        </fieldset>
        )}
      </section>

      <div className="actions-bar">
        {error && <p className="error" role="alert">{error}</p>}
        {locked ? (
          <button type="submit" className="button primary big" disabled={busy !== null}>{busy ? c.saving : c.save}</button>
        ) : (
          <>
            <button type="button" className="button" disabled={busy !== null} onClick={() => void submit(false)}>{busy === "save" ? c.saving : c.saveDraft}</button>
            <button type="submit" className="button primary big" disabled={busy !== null}><Send />{busy === "send" ? c.sending : c.send}</button>
          </>
        )}
      </div>
    </form>
  );
}

function nextDay(day: string, n: number): string {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
