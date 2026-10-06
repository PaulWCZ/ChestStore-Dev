import { Confirm } from "@argentic/chest-ui/components";
import { useState } from "react";
import { Alert, Bin, Close, Down, kindIcon, Plus, Up } from "../components/icons.tsx";
import { call, navigate, toast } from "../core/client.tsx";
import { format, plural } from "../i18n/format.ts";
import type { Catalogue } from "../i18n/index.ts";
import { colors, durations, locationKinds, slugify, type Color, type LocationKind } from "../lib/model.ts";
import { newQuestionId, questionKinds, questionLimits, type Question, type QuestionKind } from "../lib/questions.ts";

export type TypeValues = {
  title: string; slug: string; description: string; duration: number; interval: number; locationKind: LocationKind; location: string;
  bufferBefore: number; bufferAfter: number; noticeMinutes: number; windowDays: number; dailyLimit: number; questions: Question[]; color: Color; active: boolean;
  videoRooms: boolean; paymentLink: string; pool: string[];
  // The texts in the host's second language ("title", "description", a
  // question's id, "<question id>.<n>" for its n-th choice).
  alt: Record<string, string>;
};
// The host's second language, when they gave one (Settings).
export type Second = { code: string; name: string } | null;

// A choice's texts in the second language, one per line, from the alt keys.
const altChoices = (alt: Record<string, string>, q: Question) => q.options.map((_, i) => alt[`${q.id}.${i}`] ?? "").join("\n");

type Words = Pick<Catalogue, "types" | "kinds" | "colors" | "minutes">;
const steps = [5, 10, 15, 20, 30, 45, 60, 90, 120];
// Jitsi's public server (lib/booking.ts defaultRooms).
const jitsi = "https://meet.jit.si/";
const buffers = [0, 5, 10, 15, 30, 45, 60];
const perDay = [0, 1, 2, 3, 4, 5, 6, 8, 10, 15, 20];

// Creating or editing a booking type: the name, how long, where — the rest
// behind "More options", with sensible defaults.
// team: the other hosts an administrator may share the type with (null:
// the viewer cannot choose).
export function TypeForm({ id, initial, base, locale, team, second = null, t }: { id: string | null; initial: TypeValues; base: string; locale: string; team: { id: string; name: string }[] | null; second?: Second; t: Words }) {
  const [v, setV] = useState(initial);
  const [slugTouched, setSlugTouched] = useState(id !== null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  // "Our own server" chosen for rooms (its address may still be empty).
  const [ownRooms, setOwnRooms] = useState(initial.videoRooms && initial.location !== "" && initial.location !== jitsi);
  const [pending, setPending] = useState(false);
  const f = t.types.form;
  const set = <K extends keyof TypeValues>(key: K, value: TypeValues[K]) => setV(old => ({ ...old, [key]: value }));
  const setAlt = (patch: Record<string, string>, drop?: (key: string) => boolean) => setV(old => {
    const alt = Object.fromEntries(Object.entries(old.alt).filter(([k]) => !drop?.(k)));
    return { ...old, alt: { ...alt, ...patch } };
  });
  const inSecond = (label: string) => second ? format(f.inLanguage, { label, language: second.name }) : label;
  const minutes = (n: number) => plural(t.minutes, n, locale);
  const durationChoices = [...new Set([...durations, v.duration])].sort((a, b) => a - b);

  const submit = async () => {
    // Choices are typed one per line; blank lines are dropped here (the
    // server checks everything again).
    // Choices lose their blank lines; their second-language texts follow
    // them (by position), the others are left out.
    const alt: Record<string, string> = {};
    if (second) {
      for (const key of ["title", "description"]) if (v.alt[key]?.trim()) alt[key] = v.alt[key]!;
      for (const q of v.questions) {
        if (v.alt[q.id]?.trim()) alt[q.id] = v.alt[q.id]!;
        if (q.kind !== "choice") continue;
        let n = 0;
        q.options.forEach((o, i) => {
          if (o.trim() === "") return;
          const text = v.alt[`${q.id}.${i}`]?.trim();
          if (text) alt[`${q.id}.${n}`] = text;
          n++;
        });
      }
    }
    const input = { ...v, alt, questions: v.questions.map(q => ({ ...q, options: q.kind === "choice" ? q.options.map(o => o.trim()).filter(o => o !== "") : [] })), ...(team === null ? { pool: undefined } : {}) };
    setPending(true);
    const r = id ? await call("updateType", { id, input }, { quiet: true, refresh: false }) : await call("createType", { input }, { quiet: true, refresh: false });
    setPending(false);
    if (!r.ok) return setError(r.message);
    setError(null);
    toast(f.saved);
    await navigate("/chest/types");
  };

  return (
    <form className="card stack" onSubmit={e => { e.preventDefault(); void submit(); }} noValidate>
      <div>
        <label className="label" htmlFor="title">{f.name}</label>
        <input id="title" className="field" maxLength={80} required placeholder={f.namePlaceholder} value={v.title} onChange={e => { set("title", e.target.value); if (!slugTouched) set("slug", slugify(e.target.value)); }} autoFocus={id === null} />
      </div>
      {second && (
        <div className="second">
          <label className="label" htmlFor="title-alt">{inSecond(f.name)}</label>
          <input id="title-alt" className="field" maxLength={80} lang={second.code} value={v.alt["title"] ?? ""} onChange={e => setAlt({ title: e.target.value })} aria-describedby="second-hint" />
          <p id="second-hint" className="hint">{format(f.secondHint, { language: second.name })}</p>
        </div>
      )}
      <fieldset className="stack-s bare">
        <legend className="label">{f.duration}</legend>
        <div className="pills">
          {durationChoices.map(n => (
            <label key={n} className="choice"><input type="radio" name="duration" checked={v.duration === n} onChange={() => setV(old => ({ ...old, duration: n, interval: old.interval === old.duration ? n : old.interval }))} /><span>{minutes(n)}</span></label>
          ))}
        </div>
      </fieldset>
      <fieldset className="stack-s bare">
        <legend className="label">{f.where}</legend>
        <div className="choices">
          {locationKinds.map(k => {
            const Icon = kindIcon[k];
            return <label key={k} className="choice"><input type="radio" name="kind" checked={v.locationKind === k} onChange={() => set("locationKind", k)} /><span><Icon />{t.kinds[k]}</span></label>;
          })}
        </div>
        {v.locationKind === "place" && <div><label className="label" htmlFor="location">{f.place}</label><input id="location" className="field" maxLength={300} placeholder={f.placePlaceholder} value={v.location} onChange={e => set("location", e.target.value)} /></div>}
        {v.locationKind === "video" && (
          <>
            <label className="switch"><input type="checkbox" checked={v.videoRooms} onChange={e => { setOwnRooms(false); setV(old => ({ ...old, videoRooms: e.target.checked, location: "" })); }} />{f.videoRooms}</label>
            {v.videoRooms ? (
              // Where rooms are made: the host chooses, told what each asks
              // (meet.jit.si: whoever opens a room signs in, since 2023).
              <fieldset className="stack-s bare rooms">
                <legend className="label">{f.roomsWhere}</legend>
                <label className="choice wide"><input type="radio" name="rooms" checked={v.location === jitsi} onChange={() => set("location", jitsi)} />
                  <span><strong>{f.roomsJitsi}</strong><small>{f.roomsJitsiHint}</small></span></label>
                <label className="choice wide"><input type="radio" name="rooms" checked={v.location !== jitsi && ownRooms} onChange={() => { setOwnRooms(true); set("location", v.location === jitsi ? "" : v.location); }} />
                  <span><strong>{f.roomsOwn}</strong><small>{f.roomsOwnHint}</small></span></label>
                {v.location !== jitsi && ownRooms && (
                  <div>
                    <label className="label" htmlFor="location">{f.roomsBase}</label>
                    <input id="location" className="field" type="url" inputMode="url" maxLength={300} placeholder={f.roomsPlaceholder} value={v.location} onChange={e => set("location", e.target.value)} />
                  </div>
                )}
              </fieldset>
            ) : (
              <div>
                <label className="label" htmlFor="location">{f.video}</label>
                <input id="location" className="field" type="url" inputMode="url" maxLength={300} value={v.location} onChange={e => set("location", e.target.value)} aria-describedby="video-hint" />
                <p id="video-hint" className="hint">{v.location ? f.sameLink : f.videoHint}</p>
              </div>
            )}
          </>
        )}
        {v.locationKind === "phone" && <p className="hint">{f.phoneHint}</p>}
        {v.locationKind === "other" && <div><label className="label" htmlFor="location">{f.other}</label><input id="location" className="field" maxLength={300} value={v.location} onChange={e => set("location", e.target.value)} /></div>}
      </fieldset>
      <div>
        <label className="label" htmlFor="description">{f.description}</label>
        <textarea id="description" className="field" rows={3} maxLength={1000} placeholder={f.descriptionPlaceholder} value={v.description} onChange={e => set("description", e.target.value)} />
      </div>
      {second && (
        <div className="second">
          <label className="label" htmlFor="description-alt">{inSecond(f.description)}</label>
          <textarea id="description-alt" className="field" rows={3} maxLength={1000} lang={second.code} value={v.alt["description"] ?? ""} onChange={e => setAlt({ description: e.target.value })} />
        </div>
      )}
      <Questions questions={v.questions} onChange={q => set("questions", q)} alt={v.alt} setAlt={setAlt} second={second} t={t} />
      <fieldset className="stack-s bare">
        <legend className="label">{f.color}</legend>
        <div className="swatches">
          {colors.map(c => <label key={c} title={t.colors[c]}><input type="radio" name="color" checked={v.color === c} onChange={() => set("color", c)} aria-label={t.colors[c]} /><span className={`sw-${c}`} /></label>)}
        </div>
      </fieldset>
      <details className="more">
        <summary>{f.more}</summary>
        <div className="stack">
          <div>
            <label className="label" htmlFor="slug">{f.address}</label>
            <div className="inline"><span className="muted">{base}/</span><input id="slug" className="field slug" maxLength={40} value={v.slug} onChange={e => { setSlugTouched(true); set("slug", e.target.value.toLowerCase()); }} /></div>
          </div>
          <div className="grid-2">
            <Select id="interval" label={f.interval} value={v.interval} options={steps} show={minutes} onChange={n => set("interval", n)} />
            <Select id="before" label={f.bufferBefore} value={v.bufferBefore} options={buffers} show={minutes} onChange={n => set("bufferBefore", n)} />
            <Select id="after" label={f.bufferAfter} value={v.bufferAfter} options={buffers} show={minutes} onChange={n => set("bufferAfter", n)} />
            <div>
              <label className="label" htmlFor="notice">{f.notice}</label>
              <div className="inline"><input id="notice" className="field short" type="number" min={0} max={336} value={Math.round(v.noticeMinutes / 60)} onChange={e => set("noticeMinutes", Math.max(0, Math.min(336, Number(e.target.value) || 0)) * 60)} /><span className="muted">{f.noticeUnit}</span></div>
            </div>
            <Select id="daily" label={f.dailyLimit} value={v.dailyLimit} options={perDay} show={n => (n === 0 ? f.noLimit : plural(f.perDay, n, locale))} onChange={n => set("dailyLimit", n)} />
            <div>
              <label className="label" htmlFor="window">{f.window}</label>
              <div className="inline"><input id="window" className="field short" type="number" min={1} max={365} value={v.windowDays} onChange={e => set("windowDays", Math.max(1, Math.min(365, Number(e.target.value) || 1)))} /><span className="muted">{f.windowUnit}</span></div>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="payment">{f.payment}</label>
            <input id="payment" className="field" type="url" inputMode="url" maxLength={300} placeholder={f.paymentPlaceholder} value={v.paymentLink} onChange={e => set("paymentLink", e.target.value)} aria-describedby="payment-hint" />
            <p id="payment-hint" className="hint">{f.paymentHint}</p>
          </div>
          {team !== null && team.length > 0 && (
            <fieldset className="stack-s bare">
              <legend className="label">{f.team}</legend>
              <p className="hint">{f.teamHint}</p>
              <div className="choices">
                {team.map(m => <label key={m.id} className="choice"><input type="checkbox" checked={v.pool.includes(m.id)} onChange={e => set("pool", e.target.checked ? [...v.pool, m.id] : v.pool.filter(x => x !== m.id))} /><span>{m.name}</span></label>)}
              </div>
            </fieldset>
          )}
          {team === null && v.pool.length > 0 && <p className="hint">{f.teamAdmins}</p>}
          <label className="switch"><input type="checkbox" checked={v.active} onChange={e => set("active", e.target.checked)} />{f.active}</label>
        </div>
      </details>
      {error && <p className="error" role="alert"><Alert />{error}</p>}
      <div className="spread">
        <button type="submit" className="button" disabled={pending}>{id ? f.save : f.create}</button>
        {id && (
          <button type="button" className="link-button danger" disabled={pending} onClick={() => setAsking(true)}><Bin />{f.remove}</button>
        )}
      </div>
      {id && (
        // Deleting a type cannot be undone (its page goes; its past
        // bookings stay): the kit's Confirm, never the browser's box.
        <Confirm open={asking} title={f.removeTitle} body={f.removeConfirm} confirmLabel={f.removeButton} cancelLabel={f.keepType} busy={pending}
          onCancel={() => setAsking(false)}
          onConfirm={async () => {
            setPending(true);
            const r = await call("removeType", { id }, { quiet: true, refresh: false });
            setPending(false);
            setAsking(false);
            if (!r.ok) return setError(r.message);
            toast(format(f.removed, { name: v.title }));
            await navigate("/chest/types");
          }} />
      )}
    </form>
  );
}

// The host's own questions: up to five, each a label, the kind of answer,
// required or not; moved up and down with two buttons. Nothing is saved
// until the form is.
function Questions({ questions, onChange, alt, setAlt, second, t }: { questions: Question[]; onChange: (q: Question[]) => void; alt: Record<string, string>; setAlt: (patch: Record<string, string>, drop?: (key: string) => boolean) => void; second: Second; t: Words }) {
  const f = t.types.form;
  const inSecond = (label: string) => second ? format(f.inLanguage, { label, language: second.name }) : label;
  const change = (i: number, patch: Partial<Question>) => onChange(questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const swap = (i: number, j: number) => {
    const next = [...questions];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  return (
    <fieldset className="stack-s bare">
      <legend className="label">{f.questions}</legend>
      <p className="hint">{format(f.questionsHint, { max: questionLimits.perType })}</p>
      {questions.length > 0 && (
        <ol className="questions">
          {questions.map((q, i) => {
            const n = i + 1;
            return (
              <li key={q.id} className="question">
                <div className="question-head">
                  <label className="label" htmlFor={`q-${q.id}`}>{format(f.question, { n })}</label>
                  <button type="button" className="icon-button" aria-label={format(f.moveUp, { n })} disabled={i === 0} onClick={() => swap(i, i - 1)}><Up /></button>
                  <button type="button" className="icon-button" aria-label={format(f.moveDown, { n })} disabled={i === questions.length - 1} onClick={() => swap(i, i + 1)}><Down /></button>
                  <button type="button" className="icon-button" aria-label={format(f.removeQuestion, { n })} onClick={() => onChange(questions.filter((_, j) => j !== i))}><Close /></button>
                </div>
                <input id={`q-${q.id}`} className="field" maxLength={questionLimits.label} placeholder={f.questionPlaceholder} value={q.label} onChange={e => change(i, { label: e.target.value })} />
                {second && (
                  <div className="second">
                    <label className="label" htmlFor={`qa-${q.id}`}>{inSecond(format(f.question, { n }))}</label>
                    <input id={`qa-${q.id}`} className="field" maxLength={questionLimits.label} lang={second.code} value={alt[q.id] ?? ""} onChange={e => setAlt({ [q.id]: e.target.value })} />
                  </div>
                )}
                <div className="question-foot">
                  <div className="inline">
                    <label className="hint" htmlFor={`k-${q.id}`}>{f.answerKind}</label>
                    <select id={`k-${q.id}`} className="field" value={q.kind} onChange={e => change(i, { kind: e.target.value as QuestionKind })}>
                      {questionKinds.map(k => <option key={k} value={k}>{f.kinds[k]}</option>)}
                    </select>
                  </div>
                  <label className="switch"><input type="checkbox" checked={q.required} onChange={e => change(i, { required: e.target.checked })} />{f.required}</label>
                </div>
                {q.kind === "choice" && (
                  <div>
                    <label className="label" htmlFor={`o-${q.id}`}>{f.choices}</label>
                    <textarea id={`o-${q.id}`} className="field" rows={3} value={q.options.join("\n")} onChange={e => change(i, { options: e.target.value.split("\n").slice(0, questionLimits.options + 5) })} />
                  </div>
                )}
                {q.kind === "choice" && second && (
                  <div className="second">
                    <label className="label" htmlFor={`oa-${q.id}`}>{inSecond(f.choices)}</label>
                    <textarea id={`oa-${q.id}`} className="field" rows={3} lang={second.code} value={altChoices(alt, q)} aria-describedby={`oa-${q.id}-hint`}
                      onChange={e => setAlt(Object.fromEntries(e.target.value.split("\n").slice(0, questionLimits.options + 5).map((line, j) => [`${q.id}.${j}`, line])), key => key.startsWith(`${q.id}.`))} />
                    <p id={`oa-${q.id}-hint`} className="hint">{f.choicesAltHint}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {questions.length < questionLimits.perType && (
        <div><button type="button" className="button quiet small" onClick={() => onChange([...questions, { id: newQuestionId(), label: "", kind: "short", required: false, options: [] }])}><Plus />{f.addQuestion}</button></div>
      )}
    </fieldset>
  );
}

function Select({ id, label, value, options, show, onChange }: { id: string; label: string; value: number; options: number[]; show: (n: number) => string; onChange: (n: number) => void }) {
  const all = [...new Set([...options, value])].sort((a, b) => a - b);
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <select id={id} className="field" value={value} onChange={e => onChange(Number(e.target.value))}>
        {all.map(n => <option key={n} value={n}>{show(n)}</option>)}
      </select>
    </div>
  );
}
