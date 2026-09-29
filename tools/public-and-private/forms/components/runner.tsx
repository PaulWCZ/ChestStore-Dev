"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { ErrorCode } from "../lib/app-error.ts";
import type { Catalogue } from "../lib/i18n/index.ts";
import { format, plural } from "../lib/i18n/format.ts";
import { asked, has, isPick, read, walk, type AnswerError, type Answers, type FileRef, type Pick } from "../lib/logic.ts";
import { typesFor, withOptions, type Accent, type Definition, type Layout, type Question } from "../lib/model.ts";
import { uploadFile } from "../lib/upload-client.ts";
import { Arrow, Back, Check, Close, Down, Paperclip, StarIcon, Up } from "./icons.tsx";

// The respondent's form: the same component on the public page, on a team
// form in the Chest, and as the builder's live preview. It runs the logic
// engine (lib/logic.ts) as the server will: questions shown or skipped,
// pages jumped, each answer read and checked before going on.
//
// Two layouts: one question at a time (Enter to go on, letters to choose,
// a single choice moves on by itself) or all the questions of a page.
// What is typed is kept on this device until sent (not in the preview).

export type RunnerWords = Catalogue["respond"];
export type SendResult = { ok: true; copy: boolean } | { ok: false; error: ErrorCode; fields?: Record<string, AnswerError> };
type Raw = Record<string, unknown>;

export type RunnerProps = {
  definition: Definition;
  version: number;
  layout: Layout;
  accent: Accent;
  mode: "public" | "team" | "preview";
  slug: string;
  anonymous: boolean;
  initial: Answers;
  thanks: { title: string; body: string };
  redirectUrl: string | null;
  words: RunnerWords;
  errors: Catalogue["errors"];
  locale: string;
  // Public forms: the signed "shown at" token, sent back with the answer.
  token?: string;
  grantUrl?: string;
  filesOff?: boolean;
  send?: (payload: string) => Promise<SendResult>;
  after?: ReactNode;
  // The builder's preview follows the question being edited.
  focus?: string | null;
};

const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const isTyping = (el: EventTarget | null) => el instanceof HTMLElement && (el.tagName === "TEXTAREA" || el.tagName === "SELECT" || (el.tagName === "INPUT" && !["radio", "checkbox", "button", "submit"].includes((el as HTMLInputElement).type)));

// readAll: the answers as the logic engine reads them (numbers as numbers),
// leaving out what is not valid yet.
function readAll(def: Definition, raw: Raw): Answers {
  const out: Answers = {};
  for (const q of def.pages.flatMap(p => p.questions)) {
    const { value } = read(q, raw[q.id]);
    if (value !== undefined) out[q.id] = value;
  }
  return out;
}

// problem: why a question's current answer cannot be sent, if it cannot.
function problem(q: Question, raw: unknown): AnswerError | null {
  if (q.kind === "statement") return null;
  const { value, error } = read(q, raw);
  if (error) return error;
  if (q.required && (value === undefined || !has(value))) return "required";
  return null;
}

export function Runner(props: RunnerProps) {
  const { definition: def, words: w, mode } = props;
  const storageKey = `forms:${props.slug}:${props.version}`;
  const [raw, setRaw] = useState<Raw>(() => ({ ...props.initial }));
  const [errors, setErrors] = useState<Record<string, AnswerError>>({});
  const [stage, setStage] = useState<"start" | "form" | "thanks">(props.layout === "steps" && mode !== "preview" ? "start" : "form");
  const [index, setIndex] = useState(0);
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<ErrorCode | null>(null);
  const [copy, setCopy] = useState(false);
  const [restored, setRestored] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const headingRef = useRef<HTMLDivElement>(null);

  // Restore what was typed on this device (after the first render: the
  // server knows nothing of it).
  useEffect(() => {
    if (mode === "preview") return;
    try {
      const kept = JSON.parse(localStorage.getItem(storageKey) ?? "null") as Raw | null;
      if (kept && typeof kept === "object") {
        setRaw(r => ({ ...kept, ...props.initial, ...r }));
        if (Object.keys(kept).length > 0) setRestored(true);
      }
    } catch {
      /* private mode or blocked storage: nothing kept */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (mode === "preview" || stage === "thanks") return;
    const timer = setTimeout(() => {
      try {
        const kept = Object.fromEntries(Object.entries(raw).filter(([, v]) => !(v && typeof v === "object" && "ref" in (v as object))));
        localStorage.setItem(storageKey, JSON.stringify(kept));
      } catch {
        /* nothing kept */
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [raw, mode, stage, storageKey]);

  const answers = useMemo(() => readAll(def, raw), [def, raw]);
  const path = useMemo(() => walk(def, answers), [def, answers]);
  const sequence = useMemo(() => asked(path), [path]);
  const countable = sequence.filter(q => q.kind !== "statement");

  const set = useCallback((id: string, value: unknown) => {
    setRaw(r => ({ ...r, [id]: value }));
    setErrors(e => {
      if (!e[id]) return e;
      const next = { ...e };
      delete next[id];
      return next;
    });
  }, []);

  // The builder's preview jumps to the question being edited.
  useEffect(() => {
    if (!props.focus) return;
    if (props.layout === "steps") {
      const i = sequence.findIndex(q => q.id === props.focus);
      if (i >= 0) setIndex(i);
    } else {
      const i = path.pages.findIndex(p => p.questions.some(q => q.id === props.focus));
      if (i >= 0) setIndex(i);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.focus]);

  const clampIndex = Math.min(index, Math.max(0, (props.layout === "steps" ? sequence.length : path.pages.length) - 1));

  async function submit() {
    const all: Record<string, AnswerError> = {};
    for (const q of sequence) {
      const p = problem(q, raw[q.id]);
      if (p) all[q.id] = p;
    }
    if (Object.values(uploading).some(Boolean)) return;
    if (Object.keys(all).length > 0) return showErrors(all);
    if (mode === "preview" || !props.send) {
      setStage("thanks");
      return;
    }
    setSending(true);
    setFormError(null);
    const payload = JSON.stringify({ slug: props.slug, version: props.version, answers: Object.fromEntries(sequence.filter(q => raw[q.id] !== undefined).map(q => [q.id, raw[q.id]])), token: props.token ?? "" });
    const result = await props.send(payload).catch((): SendResult => ({ ok: false, error: "unavailable" }));
    setSending(false);
    if (result.ok) {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* nothing kept */
      }
      setCopy(result.copy);
      setStage("thanks");
      window.scrollTo({ top: 0 });
      if (props.redirectUrl) setTimeout(() => window.location.assign(props.redirectUrl!), 1600);
      return;
    }
    if (result.error === "answers" && result.fields) return showErrors(result.fields);
    setFormError(result.error);
  }

  function showErrors(found: Record<string, AnswerError>) {
    setErrors(found);
    const first = sequence.find(q => found[q.id]);
    if (!first) return;
    if (props.layout === "steps") setIndex(sequence.indexOf(first));
    else setIndex(path.pages.findIndex(p => p.questions.includes(first)));
    setTimeout(() => document.getElementById(`q-${first.id}`)?.focus(), 30);
  }

  // One question at a time: go on when this one can be sent.
  function next() {
    const q = sequence[clampIndex];
    if (!q) return;
    const p = problem(q, raw[q.id]);
    if (p) {
      setErrors(e => ({ ...e, [q.id]: p }));
      document.getElementById(`q-${q.id}`)?.focus();
      return;
    }
    if (clampIndex >= sequence.length - 1) return void submit();
    setIndex(clampIndex + 1);
  }
  function previous() {
    setIndex(Math.max(0, clampIndex - 1));
  }

  // Classic layout: go on when every question of the page can be sent.
  function nextPage() {
    const page = path.pages[clampIndex];
    if (!page) return;
    const found: Record<string, AnswerError> = {};
    for (const q of page.questions) {
      const p = problem(q, raw[q.id]);
      if (p) found[q.id] = p;
    }
    if (Object.keys(found).length > 0) return showErrors(found);
    if (clampIndex >= path.pages.length - 1) return void submit();
    setIndex(clampIndex + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Move focus to the new question (steps) or page (classic).
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (stage !== "form" || mode === "preview") return;
    headingRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: false });
  }, [clampIndex, stage, mode]);

  const upload = useCallback(async (q: Question, file: File) => {
    if (!props.grantUrl || mode === "preview") return;
    setUploading(u => ({ ...u, [q.id]: true }));
    const result = await uploadFile(file, props.grantUrl, { slug: props.slug, question: q.id, token: props.token ?? "" }, typesFor(q.accept ?? "any"));
    setUploading(u => ({ ...u, [q.id]: false }));
    if (result.ok) set(q.id, { ref: result.ref, name: file.name } satisfies FileRef);
    else setFileError(q.id, result.error);
  }, [props.grantUrl, props.slug, props.token, mode, set]);
  const [fileErrors, setFileErrors] = useState<Record<string, ErrorCode>>({});
  const setFileError = (id: string, e: ErrorCode | null) => setFileErrors(f => ({ ...f, [id]: e ?? undefined } as Record<string, ErrorCode>));

  const field = (q: Question, number: number | null, autofocus: boolean) => (
    <QuestionField
      key={q.id}
      q={q}
      number={number}
      value={raw[q.id]}
      error={errors[q.id] ?? null}
      fileError={fileErrors[q.id] ?? null}
      uploading={uploading[q.id] === true}
      onChange={v => set(q.id, v)}
      onUpload={file => { setFileError(q.id, null); void upload(q, file); }}
      onPicked={props.layout === "steps" ? () => setTimeout(() => setIndex(i => (i === clampIndex && clampIndex < sequence.length - 1 ? i + 1 : i)), 380) : undefined}
      w={w}
      errorsWords={props.errors}
      locale={props.locale}
      autofocus={autofocus}
      steps={props.layout === "steps"}
      filesOff={props.filesOff === true}
      preview={mode === "preview"}
    />
  );

  const shell = (children: ReactNode, progress: number | null) => (
    <div className={`runner layout-${props.layout} mode-${mode}`} data-accent={props.accent}>
      {progress !== null && (
        <div className="runner-progress" role="progressbar" aria-label={w.progressLabel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      {mode === "preview" && <p className="preview-tag">{w.preview}</p>}
      {children}
      {props.after}
    </div>
  );

  if (stage === "thanks") {
    return shell(
      <section className="runner-thanks" aria-live="polite">
        <div className="thanks-seal" aria-hidden="true"><Check /></div>
        <h1 className="runner-title">{props.thanks.title || w.thanks.title}</h1>
        <p className="runner-lede">{props.thanks.body || w.thanks.body}</p>
        {copy && <p className="runner-note">{w.thanks.copy}</p>}
        {props.redirectUrl && mode !== "preview" && (
          <p className="runner-note">{w.thanks.redirecting} <a href={props.redirectUrl}>{w.thanks.continue}</a></p>
        )}
        {mode === "preview" && <button type="button" className="button quiet" onClick={() => { setStage("form"); setIndex(0); }}>{w.startOver}</button>}
      </section>,
      1,
    );
  }

  const notes = (
    <>
      {props.anonymous && <p className="runner-note privacy-note">{w.anonymousNote}</p>}
      {!props.anonymous && mode === "team" && <p className="runner-note">{w.teamNote}</p>}
    </>
  );

  if (stage === "start") {
    return shell(
      <section className="runner-start">
        <h1 className="runner-title">{def.title}</h1>
        {def.intro && <p className="runner-lede">{def.intro}</p>}
        {notes}
        <div className="runner-actions">
          <button type="button" className="button form-button big" onClick={() => setStage("form")}>{w.start} <Arrow /></button>
          <span className="enter-hint" aria-hidden="true">{w.pressEnter}</span>
        </div>
        {restored && <p className="runner-note">{w.draftKept} <button type="button" className="button link" onClick={() => { setRaw({ ...props.initial }); setRestored(false); try { localStorage.removeItem(storageKey); } catch { /* nothing kept */ } }}>{w.startOver}</button></p>}
      </section>,
      null,
    );
  }

  const banner = formError && (
    <div className="runner-banner" role="alert">
      <strong>{w.formError}</strong> {format(props.errors[formError] ?? props.errors.unknown, { max: 0 })}
    </div>
  );

  if (props.layout === "steps") {
    const q = sequence[clampIndex];
    const position = q ? countable.indexOf(q) : -1;
    const last = clampIndex >= sequence.length - 1;
    const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
      if (!q || e.defaultPrevented) return;
      if (e.key === "Enter" && !e.shiftKey && (e.target as HTMLElement).tagName !== "TEXTAREA" && (e.target as HTMLElement).tagName !== "BUTTON" && (e.target as HTMLElement).tagName !== "A") {
        e.preventDefault();
        next();
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        next();
      } else if (!isTyping(e.target) && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1) {
        const key = e.key.toUpperCase();
        if (q.kind === "yesno" && (key === "Y" || key === "N" || key === w.yes[0]!.toUpperCase() || key === w.no[0]!.toUpperCase())) {
          set(q.id, key === "Y" || key === w.yes[0]!.toUpperCase());
          setTimeout(() => setIndex(i => (i === clampIndex && !last ? i + 1 : i)), 380);
        } else if ((q.kind === "choice" || q.kind === "choices") && letters.includes(key)) {
          const option = q.options?.[letters.indexOf(key)];
          if (option) {
            const current = isPick(raw[q.id]) ? (raw[q.id] as Pick) : { ids: [] };
            if (q.kind === "choice") {
              set(q.id, { ids: [option.id] });
              setTimeout(() => setIndex(i => (i === clampIndex && !last ? i + 1 : i)), 380);
            } else set(q.id, { ...current, ids: current.ids.includes(option.id) ? current.ids.filter(x => x !== option.id) : [...current.ids, option.id] });
          }
        } else if ((q.kind === "rating" || q.kind === "scale") && /^[0-9]$/u.test(key)) {
          const n = Number(key);
          const low = q.kind === "rating" ? 1 : (q.from ?? 0), high = q.kind === "rating" ? (q.steps ?? 5) : (q.to ?? 10);
          if (n >= low && n <= high) set(q.id, n);
        }
      }
    };
    return shell(
      <div className="steps" onKeyDown={onKey}>
        {banner}
        <div className="step" key={q?.id ?? "none"} ref={headingRef}>
          {q && field(q, q.kind === "statement" ? null : position + 1, true)}
          <div className="runner-actions">
            <button type="button" className="button form-button" onClick={next} disabled={sending || Object.values(uploading).some(Boolean)}>
              {last ? (sending ? w.sending : w.submit) : q?.kind === "statement" ? w.continue : w.next} {!last && <Check />}
            </button>
            <span className="enter-hint" aria-hidden="true">{w.pressEnter}</span>
          </div>
          {clampIndex === 0 && notes}
        </div>
        <nav className="step-nav" aria-label={w.progressLabel}>
          <span className="step-count">{position >= 0 ? format(w.progress, { done: position + 1, total: countable.length }) : ""}</span>
          <button type="button" className="icon-button form-nav" onClick={previous} disabled={clampIndex === 0}><Up /><span className="visually-hidden">{w.back}</span></button>
          <button type="button" className="icon-button form-nav" onClick={next} disabled={sending}><Down /><span className="visually-hidden">{last ? w.submit : w.continue}</span></button>
        </nav>
      </div>,
      countable.length === 0 ? 0 : Math.max(0, position) / countable.length,
    );
  }

  // All the questions of a page.
  const page = path.pages[clampIndex];
  const lastPage = clampIndex >= path.pages.length - 1;
  const numbered = new Map(countable.map((q, i) => [q.id, i + 1]));
  const wrong = Object.keys(errors).filter(id => page?.questions.some(q => q.id === id)).length;
  return shell(
    <div className="classic">
      {clampIndex === 0 && (
        <header className="classic-head">
          <h1 className="runner-title">{def.title}</h1>
          {def.intro && <p className="runner-lede">{def.intro}</p>}
          {notes}
          {restored && <p className="runner-note">{w.draftKept} <button type="button" className="button link" onClick={() => { setRaw({ ...props.initial }); setRestored(false); try { localStorage.removeItem(storageKey); } catch { /* nothing kept */ } }}>{w.startOver}</button></p>}
        </header>
      )}
      {page?.page.title && <h2 className="page-heading">{page.page.title}</h2>}
      <form className="classic-page" noValidate onSubmit={e => { e.preventDefault(); nextPage(); }} ref={el => { headingRef.current = el as unknown as HTMLDivElement; }}>
        {page?.questions.map((q, i) => field(q, numbered.get(q.id) ?? null, i === 0 && clampIndex > 0))}
        {wrong > 0 && <p className="runner-banner soft" role="alert">{plural(w.fixBelow, wrong, props.locale)}</p>}
        {banner}
        <div className="classic-actions">
          {clampIndex > 0 && <button type="button" className="button quiet" onClick={() => { setIndex(clampIndex - 1); window.scrollTo({ top: 0 }); }}><Back /> {w.back}</button>}
          <button type="submit" className="button form-button" disabled={sending || Object.values(uploading).some(Boolean)}>{lastPage ? (sending ? w.sending : w.submit) : w.continue}</button>
          {path.pages.length > 1 && <span className="step-count">{format(w.progress, { done: clampIndex + 1, total: path.pages.length })}</span>}
        </div>
      </form>
    </div>,
    path.pages.length > 1 ? clampIndex / path.pages.length : null,
  );
}

// ---- One question ----------------------------------------------------------------

type FieldProps = {
  q: Question;
  number: number | null;
  value: unknown;
  error: AnswerError | null;
  fileError: ErrorCode | null;
  uploading: boolean;
  onChange: (v: unknown) => void;
  onUpload: (file: File) => void;
  onPicked?: () => void;
  w: RunnerWords;
  errorsWords: Catalogue["errors"];
  locale: string;
  autofocus: boolean;
  steps: boolean;
  filesOff: boolean;
  preview: boolean;
};

function QuestionField(p: FieldProps) {
  const { q, w } = p;
  const base = useId();
  const inputId = `q-${q.id}`;
  const helpId = `${base}-help`;
  const errorId = `${base}-error`;
  const describedBy = [q.help ? helpId : "", p.error || p.fileError ? errorId : ""].filter(Boolean).join(" ") || undefined;
  const invalid = p.error ? true : undefined;
  const auto = p.autofocus ? { "data-autofocus": true } : {};
  // A pick with the mouse or a finger moves on by itself (one question at a
  // time); the keyboard's arrows only choose — Enter goes on.
  const pointer = useRef(false);
  const press = { onPointerDown: () => { pointer.current = true; } };
  const picked = () => {
    if (pointer.current) p.onPicked?.();
    pointer.current = false;
  };

  const heading = (
    <>
      {p.number !== null && <span className="q-number" aria-hidden="true">{p.number}<Arrow /></span>}
      <span className="q-title">{q.title}{q.required && <span className="q-required"><span aria-hidden="true"> *</span><span className="visually-hidden">{w.requiredMark}</span></span>}</span>
    </>
  );
  const help = q.help ? <p className="q-help" id={helpId}>{q.help}</p> : null;
  const errorText = p.error ? hint(q, p.error, w) : p.fileError ? format(p.errorsWords[p.fileError] ?? p.errorsWords.unknown, { max: 0 }) : null;
  const error = errorText ? <p className="q-error" id={errorId} role="alert">{errorText}</p> : null;

  if (q.kind === "statement") {
    return (
      <section className="question statement" aria-labelledby={inputId}>
        <h2 className="q-heading" id={inputId} tabIndex={-1} {...auto}><span className="q-title">{q.title}</span></h2>
        {help}
      </section>
    );
  }

  // Text-like questions: a label and one field.
  if (["short", "long", "email", "phone", "number", "date", "dropdown"].includes(q.kind)) {
    const text = typeof p.value === "string" ? p.value : typeof p.value === "number" ? String(p.value) : "";
    const common = { id: inputId, "aria-describedby": describedBy, "aria-invalid": invalid, "aria-required": q.required || undefined, ...auto };
    let control: ReactNode;
    if (q.kind === "long") {
      control = <textarea className="answer-input long" rows={p.steps ? 3 : 4} value={text} maxLength={q.max ?? 5000} placeholder={p.steps ? w.typeHere : undefined} onChange={e => p.onChange(e.target.value)} {...common} />;
    } else if (q.kind === "dropdown") {
      const picked = isPick(p.value) ? p.value.ids[0] ?? "" : "";
      control = (
        <select className="answer-input select" value={picked} onChange={e => p.onChange(e.target.value ? { ids: [e.target.value] } : undefined)} {...common}>
          <option value="">{w.choose}</option>
          {q.options?.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      );
    } else {
      const type = q.kind === "email" ? "email" : q.kind === "phone" ? "tel" : q.kind === "date" ? "date" : "text";
      const inputMode = q.kind === "number" ? "decimal" : q.kind === "email" ? "email" : q.kind === "phone" ? "tel" : undefined;
      const autoComplete = q.kind === "email" ? "email" : q.kind === "phone" ? "tel" : undefined;
      control = <input className="answer-input" type={type} inputMode={inputMode} autoComplete={autoComplete} value={text} maxLength={q.kind === "short" ? (q.max ?? 500) : undefined} placeholder={!p.steps || q.kind === "date" ? undefined : q.kind === "number" ? w.numberHere : w.typeHere} onChange={e => p.onChange(e.target.value)} {...common} />;
    }
    const bounds = q.kind === "number" ? rangeText(q, w) : null;
    return (
      <div className={`question kind-${q.kind}${p.error ? " has-error" : ""}`}>
        <label className="q-heading" htmlFor={inputId}>{heading}</label>
        {help}
        {bounds && <p className="q-help">{bounds}</p>}
        {control}
        {q.kind === "long" && q.max && <p className="q-count" aria-hidden="true">{format(w.lengthMax, { count: [...text].length, max: q.max })}</p>}
        {error}
      </div>
    );
  }

  // Choices, yes/no, stars, scales: a group of radios or checkboxes, big
  // targets, a letter or a number to press.
  const legendId = `${base}-legend`;
  const group = (children: ReactNode, role: "radiogroup" | "group", extraHint?: string | null) => (
    <fieldset className={`question kind-${q.kind}${p.error ? " has-error" : ""}`} aria-describedby={describedBy} aria-invalid={invalid}>
      <legend className="q-heading" id={legendId}>
        <span id={inputId} tabIndex={-1} className="q-focus" {...auto}>{heading}</span>
      </legend>
      {help}
      {extraHint && <p className={q.kind === "scale" ? "visually-hidden" : "q-help"}>{extraHint}</p>}
      <div className={`answer-group group-${q.kind}`} role={role === "radiogroup" ? "radiogroup" : undefined} aria-labelledby={legendId}>{children}</div>
      {error}
    </fieldset>
  );

  if (q.kind === "choice" || q.kind === "choices") {
    const pick: Pick = isPick(p.value) ? p.value : { ids: [] };
    const multiple = q.kind === "choices";
    const otherOn = pick.other !== undefined;
    const toggle = (id: string) => {
      if (!multiple) return p.onChange({ ids: [id] });
      p.onChange({ ...pick, ids: pick.ids.includes(id) ? pick.ids.filter(x => x !== id) : [...pick.ids, id] });
    };
    const name = `${base}-${q.id}`;
    const pickHint = multiple ? (q.min && q.max ? format(w.chooseBetween, { min: q.min, max: q.max }) : q.max ? format(w.chooseUpTo, { max: q.max }) : q.min ? format(w.chooseAtLeast, { min: q.min }) : w.chooseMany) : null;
    return group(
      <>
        {q.options?.map((o, i) => {
          const on = pick.ids.includes(o.id);
          return (
            <label key={o.id} className={`pill${on ? " on" : ""}`} {...press}>
              <input type={multiple ? "checkbox" : "radio"} name={name} checked={on} onChange={() => toggle(o.id)} onClick={() => { if (!multiple) picked(); else pointer.current = false; }} />
              <span className="pill-key" aria-hidden="true">{letters[i] ?? ""}</span>
              <span className="pill-label">{o.label}</span>
              {on && <Check />}
            </label>
          );
        })}
        {q.other && (
          <div className={`pill other${otherOn ? " on" : ""}`}>
            <label className="other-toggle">
              <input type={multiple ? "checkbox" : "radio"} name={name} checked={otherOn} onChange={() => p.onChange(otherOn ? { ids: pick.ids } : { ids: multiple ? pick.ids : [], other: "" })} />
              <span className="pill-key" aria-hidden="true">{letters[q.options?.length ?? 0] ?? ""}</span>
              <span className="pill-label">{w.other}</span>
            </label>
            {otherOn && <input className="other-input" aria-label={w.other} placeholder={w.otherPlaceholder} value={pick.other ?? ""} maxLength={200} autoFocus onChange={e => p.onChange({ ids: multiple ? pick.ids : [], other: e.target.value })} />}
          </div>
        )}
      </>,
      multiple ? "group" : "radiogroup",
      pickHint,
    );
  }

  if (q.kind === "yesno") {
    const name = `${base}-${q.id}`;
    return group(
      <>
        {[true, false].map(v => (
          <label key={String(v)} className={`pill yesno${p.value === v ? " on" : ""}`} {...press}>
            <input type="radio" name={name} checked={p.value === v} onChange={() => p.onChange(v)} onClick={picked} />
            <span className="pill-key" aria-hidden="true">{(v ? w.yes : w.no)[0]}</span>
            <span className="pill-label">{v ? w.yes : w.no}</span>
          </label>
        ))}
      </>,
      "radiogroup",
    );
  }

  if (q.kind === "rating") {
    const n = typeof p.value === "number" ? p.value : 0;
    const name = `${base}-${q.id}`;
    return group(
      <div className="stars">
        {Array.from({ length: q.steps ?? 5 }, (_, i) => i + 1).map(v => (
          <label key={v} className={`star${v <= n ? " on" : ""}`} {...press}>
            <input type="radio" name={name} checked={n === v} onChange={() => p.onChange(v)} onClick={picked} />
            <StarIcon filled={v <= n} />
            <span className="visually-hidden">{plural(w.stars, v, p.locale)}</span>
          </label>
        ))}
      </div>,
      "radiogroup",
    );
  }

  if (q.kind === "scale") {
    const from = q.from ?? 0, to = q.to ?? 10;
    const name = `${base}-${q.id}`;
    return group(
      <>
        <div className="scale" style={{ ["--cells" as string]: String(to - from + 1) }}>
          {Array.from({ length: to - from + 1 }, (_, i) => from + i).map(v => (
            <label key={v} className={`cell${p.value === v ? " on" : ""}`} {...press}>
              <input type="radio" name={name} checked={p.value === v} onChange={() => p.onChange(v)} onClick={picked} />
              <span>{v}</span>
            </label>
          ))}
        </div>
        {(q.left || q.right) && (
          <div className="scale-ends" aria-hidden="true"><span>{q.left}</span><span>{q.right}</span></div>
        )}
      </>,
      "radiogroup",
      q.left || q.right ? `${from} — ${q.left ?? ""} · ${to} — ${q.right ?? ""}` : null,
    );
  }

  // A file.
  const file = p.value && typeof p.value === "object" && "ref" in (p.value as object) ? (p.value as FileRef) : null;
  const accept = typesFor(q.accept ?? "any").join(",");
  const kinds = q.accept === "images" ? w.file.images : q.accept === "documents" ? w.file.documents : w.file.any;
  return (
    <div className={`question kind-file${p.error ? " has-error" : ""}`}>
      <label className="q-heading" htmlFor={inputId}>{heading}</label>
      {help}
      {p.filesOff ? (
        <p className="q-help">{w.file.off}</p>
      ) : file ? (
        <div className="file-chosen">
          <Paperclip /><span className="file-name">{file.name}</span>
          <button type="button" className="icon-button" onClick={() => p.onChange(undefined)}><Close /><span className="visually-hidden">{w.file.remove}</span></button>
        </div>
      ) : (
        <div className={`dropzone${p.uploading ? " busy" : ""}`}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) p.onUpload(f); }}>
          <input id={inputId} type="file" className="file-input" accept={accept} disabled={p.uploading || p.preview} aria-describedby={describedBy} aria-invalid={invalid} onChange={e => { const f = e.target.files?.[0]; if (f) p.onUpload(f); e.target.value = ""; }} {...auto} />
          <span className="dropzone-text" aria-hidden="true"><Paperclip /> {p.uploading ? w.file.uploading : <><strong>{w.file.choose}</strong> {w.file.drop}</>}</span>
          <span className="dropzone-hint">{p.preview ? w.file.notInPreview : `${kinds} · ${w.file.max}`}</span>
        </div>
      )}
      {error}
    </div>
  );
}

function rangeText(q: Question, w: RunnerWords): string | null {
  if (q.min !== undefined && q.max !== undefined) return format(w.between, { min: q.min, max: q.max });
  if (q.min !== undefined) return format(w.atLeast, { min: q.min });
  if (q.max !== undefined) return format(w.atMost, { max: q.max });
  return null;
}

// hint: the error's words, with the bound that was missed when it helps.
function hint(q: Question, error: AnswerError, w: RunnerWords): string {
  if ((error === "too_small" || error === "too_large") && rangeText(q, w)) return `${w.errors[error]} ${rangeText(q, w)}.`;
  if ((error === "too_short" || error === "too_long") && q.kind !== "number") {
    if (error === "too_short" && q.min) return `${w.errors[error]} ${format(w.atLeast, { min: q.min })}.`;
    if (error === "too_long" && q.max) return `${w.errors[error]} ${format(w.atMost, { max: q.max })}.`;
  }
  if ((error === "too_few" || error === "too_many") && withOptions(q.kind)) {
    const r = rangeText(q, w);
    if (r) return `${w.errors[error]} ${r}.`;
  }
  return w.errors[error];
}
