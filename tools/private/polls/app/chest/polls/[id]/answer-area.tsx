"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { Check, Cross, Maybe, Mask, Party } from "../../../../components/icons.tsx";
import { useToast } from "../../../../components/toast.tsx";
import { format } from "../../../../lib/i18n/format.ts";
import type { en } from "../../../../lib/i18n/en.ts";
import { answerPoll } from "../../actions.ts";

// Answering a poll: big tappable choices, yes / if need be / no per date,
// a 1–5 scale, free text. After sending: thanks (and, for a named poll,
// "change my answer" until it closes).
type Words = { poll: Record<keyof typeof en.poll, string>; errors: Record<keyof typeof en.errors, string> };
export type AnswerQuestion = {
  id: string;
  kind: "choice" | "date" | "scale" | "text";
  text: string;
  multiple: boolean;
  other: boolean;
  low: string;
  high: string;
  options: { id: string; label: string; date: { month: string; day: string; weekday: string; text: string; hours: string } | null }[];
};
export type Mine = Record<string, { options: string[]; other: string; value: number | null; text: string; dates: Record<string, number> }>;

type State = Record<string, { options: string[]; other: string; value: number | null; text: string; dates: Record<string, number> }>;

const blank = (questions: AnswerQuestion[]): State => Object.fromEntries(questions.map(q => [q.id, { options: [], other: "", value: null, text: "", dates: {} }]));

export function AnswerArea({ pollId, questions, single, anonymous, answered, mine, changeNote, said, t }: {
  pollId: string;
  questions: AnswerQuestion[];
  single: boolean;
  anonymous: boolean;
  answered: boolean;
  mine: Mine | null;
  changeNote: string;
  said: string[];
  t: Words;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(!answered);
  const [state, setState] = useState<State>(() => ({ ...blank(questions), ...(mine ?? {}) }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cheer, setCheer] = useState(0);

  const set = (id: string, change: Partial<State[string]>) => setState(s => ({ ...s, [id]: { ...s[id]!, ...change } }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const input: Record<string, unknown> = {};
    for (const q of questions) {
      const a = state[q.id]!;
      if (q.kind === "choice") input[q.id] = { options: a.options, ...(q.other ? { other: a.other } : {}) };
      else if (q.kind === "date") input[q.id] = { dates: a.dates };
      else if (q.kind === "scale") { if (a.value !== null) input[q.id] = { value: a.value }; }
      else if (a.text.trim()) input[q.id] = { text: a.text };
    }
    const result = await answerPoll(pollId, input);
    setBusy(false);
    if (!result.ok) {
      const message = format(t.errors[result.error], result.values ?? {});
      setError(message);
      toast(message);
      return;
    }
    setEditing(false);
    setCheer(c => c + 1);
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="thanks" role="status">
        {cheer > 0 && <Burst key={cheer} />}
        <h2><Party /> {anonymous ? t.poll.thanksAnonymous : t.poll.thanks}</h2>
        {said.length > 0 && (
          <div className="said" aria-label={t.poll.youSaid}>
            {said.map((s, i) => <span key={i} className="chip">{s}</span>)}
          </div>
        )}
        {!anonymous && <p>{changeNote}</p>}
        {!anonymous && <button type="button" className="button small" onClick={() => setEditing(true)}>{t.poll.change}</button>}
      </div>
    );
  }

  return (
    <form className="card answer-card" onSubmit={submit} noValidate>
      <h2>{t.poll.yourAnswer}</h2>
      {questions.map(q => {
        const a = state[q.id]!;
        const title = single ? null : <legend>{q.text}</legend>;
        if (q.kind === "choice") {
          const type = q.multiple ? "checkbox" : "radio";
          const toggle = (optionId: string, on: boolean) => {
            if (q.multiple) set(q.id, { options: on ? [...a.options, optionId] : a.options.filter(o => o !== optionId) });
            else set(q.id, { options: on ? [optionId] : [], other: on ? "" : a.other });
          };
          return (
            <fieldset key={q.id} className="q">
              {title}
              <p className="hint">{q.multiple ? t.poll.pickSeveral : t.poll.pickOne}</p>
              <div className="pick">
                {q.options.map(o => (
                  <label key={o.id} className="pick-option">
                    <input type={type} name={"q" + q.id} checked={a.options.includes(o.id)} onChange={e => toggle(o.id, e.target.checked)} />
                    <span className="grow">{o.label}</span>
                  </label>
                ))}
                {q.other && (
                  <label className="pick-option">
                    <input type={type} name={"q" + q.id} checked={a.other.trim() !== "" || (a.options.length === 0 && a.other !== "")} onChange={e => {
                      if (!e.target.checked) set(q.id, { other: "" });
                      else {
                        if (!q.multiple) set(q.id, { options: [] });
                        document.getElementById("other-" + q.id)?.focus();
                      }
                    }} aria-label={t.poll.other} />
                    <span className="grow">
                      <input id={"other-" + q.id} className="field" type="text" value={a.other} maxLength={200} placeholder={t.poll.otherPlaceholder} aria-label={t.poll.other}
                        onChange={e => set(q.id, { other: e.target.value, ...(q.multiple ? {} : { options: [] }) })} />
                    </span>
                  </label>
                )}
              </div>
            </fieldset>
          );
        }
        if (q.kind === "date") {
          return (
            <fieldset key={q.id} className="q">
              <legend className="visually-hidden">{t.poll.yourAnswer}</legend>
              <p className="hint">{t.poll.dateHint}</p>
              <div className="date-rows">
                {q.options.map(o => {
                  const value = a.dates[o.id] ?? null;
                  const choose = (v: number) => set(q.id, { dates: { ...a.dates, [o.id]: v } });
                  const cls = value === 2 ? " yes" : value === 1 ? " maybe" : "";
                  return (
                    <div key={o.id} className={"date-row" + cls} role="radiogroup" aria-label={o.date!.text + (o.date!.hours ? ", " + o.date!.hours : "")}>
                      <div className="when">
                        <span className="day-badge" aria-hidden="true"><span className="m">{o.date!.month}</span><span className="d">{o.date!.day}</span><span className="w">{o.date!.weekday}</span></span>
                        <span className="when-text"><strong>{o.date!.text}</strong>{o.date!.hours && <span>{o.date!.hours}</span>}</span>
                      </div>
                      <div className="tri">
                        <label className="yes"><input type="radio" name={`d${o.id}`} checked={value === 2} onChange={() => choose(2)} /><span><Check />{t.poll.yes}</span></label>
                        <label className="maybe"><input type="radio" name={`d${o.id}`} checked={value === 1} onChange={() => choose(1)} /><span><Maybe />{t.poll.maybe}</span></label>
                        <label className="no"><input type="radio" name={`d${o.id}`} checked={value === 0} onChange={() => choose(0)} /><span><Cross />{t.poll.no}</span></label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </fieldset>
          );
        }
        if (q.kind === "scale") {
          return (
            <fieldset key={q.id} className="q scale">
              {title}
              <div className="scale-buttons">
                {[1, 2, 3, 4, 5].map(n => (
                  <label key={n}>
                    <input type="radio" name={"q" + q.id} checked={a.value === n} onChange={() => set(q.id, { value: n })} aria-label={String(n) + (n === 1 && q.low ? " · " + q.low : n === 5 && q.high ? " · " + q.high : "")} />
                    <span>{n}</span>
                  </label>
                ))}
              </div>
              {(q.low || q.high) && <div className="scale-ends"><span>{q.low}</span><span>{q.high}</span></div>}
            </fieldset>
          );
        }
        return (
          <fieldset key={q.id} className="q">
            {title}
            <textarea className="field" value={a.text} maxLength={1000} rows={3} placeholder={t.poll.textPlaceholder} aria-label={q.text} onChange={e => set(q.id, { text: e.target.value })} />
          </fieldset>
        );
      })}
      {!single && <p className="hint">{t.poll.skip}</p>}
      {anonymous && <p className="note anon"><Mask />{t.poll.anonymousOnce}</p>}
      <div className="submit-row">
        <button type="submit" className="button primary big" disabled={busy}>{busy ? t.poll.sending : answered ? t.poll.update : t.poll.send}</button>
        {answered && <button type="button" className="button link" onClick={() => { setState({ ...blank(questions), ...(mine ?? {}) }); setEditing(false); }}>{t.poll.cancelChange}</button>}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </form>
  );
}

// Confetti, once, when an answer is sent (none with reduced motion: CSS).
function Burst() {
  const pieces = useMemo(() => {
    const colours = ["var(--coral)", "var(--mint)", "var(--sun)", "var(--sky)", "var(--ink)"];
    return Array.from({ length: 26 }, (_, i) => {
      const angle = (i / 26) * Math.PI * 2;
      const distance = 90 + (i % 5) * 28;
      return { x: Math.round(Math.cos(angle) * distance * 1.6), y: Math.round(Math.sin(angle) * distance - 40), r: (i * 47) % 360, c: colours[i % colours.length]!, d: (i % 4) * 40 };
    });
  }, []);
  return (
    <span className="burst" aria-hidden="true">
      {pieces.map((p, i) => <i key={i} style={{ background: p.c, animationDelay: p.d + "ms", ["--x" as string]: p.x + "px", ["--y" as string]: p.y + "px", ["--r" as string]: p.r + "deg" }} />)}
    </span>
  );
}
