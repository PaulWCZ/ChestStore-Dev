"use client";

import { DateField, FilePicker, type PickedFile } from "@argentic/chest-ui/components";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { ErrorCode } from "../lib/app-error.ts";
import type { Catalogue } from "../lib/i18n/index.ts";
import { format, plural } from "../lib/i18n/format.ts";
import { asked, has, isGrid, isPick, isRanking, read, walk, type AnswerError, type Answers, type FileRef, type Grid, type Pick } from "../lib/logic.ts";
import { limits, manyPicks, typesFor, withOptions, type Accent, type Definition, type Layout, type Question } from "../lib/model.ts";
import { uploadFile } from "../lib/upload-client.ts";
import { Arrow, Back, Check, Down, StarIcon, Up } from "./icons.tsx";

// The respondent's form: the same component on the public page, on a team
// form in the Chest, and as the builder's live preview. It runs the logic
// engine (lib/logic.ts) as the server will: questions shown or skipped,
// pages jumped, each answer read and checked before going on.
//
// Two layouts: one question at a time (Enter to go on, letters to choose,
// a single choice moves on by itself) or all the questions of a page.
// What is typed is kept on this device until sent (not in the preview).
//
// A date is the kit's DateField (typed in the form's language or chosen on
// a calendar, never the browser's date field), a file the kit's
// FilePicker (limits said first, progress, remove, retry). Both wear the
// form's colour (app/tokens.css).

// The respondent's words, and the kit's date and file words, all in the
// form's language.
export type RunnerWords = Catalogue["respond"] & { date: Catalogue["date"]; files: Catalogue["files"] };
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
  // The addresses of the form's pictures (by object), and its cover's.
  pictures?: Record<string, string>;
  cover?: string | null;
  // Today on the Chest's clock (a date question's "Today" and "Tomorrow").
  today: string;
  // The preview's own label, in the member's language (the respondent's
  // words follow the form's), and that language.
  previewTag?: { text: string; lang: string };
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
  // The date questions whose field refuses what was typed (a text it
  // cannot read): the field says why (kit 0.2.4) and does not call
  // onChange, so `raw` still holds the answer before. The form is sent
  // with noValidate, so the browser does not stop it: going on waits here
  // instead — never the previous day sent as if it were what was typed.
  // A field that leaves the page forgets its refusal (its text is gone).
  const refused = useRef<Record<string, true>>({});
  const refusedProblem = useCallback((id: string) => (problem: string | null) => {
    if (problem) {
      refused.current = { ...refused.current, [id]: true };
      return;
    }
    if (!refused.current[id]) return;
    const { [id]: _was, ...rest } = refused.current;
    refused.current = rest;
    setErrors(e => {
      if (e[id] !== "date") return e;
      const next = { ...e };
      delete next[id];
      return next;
    });
  }, []);
  const [stage, setStage] = useState<"start" | "form" | "thanks">(props.layout === "steps" && mode !== "preview" ? "start" : "form");
  const [index, setIndex] = useState(0);
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<ErrorCode | null>(null);
  // The classic page where "n answers need a look" was said: its line
  // keeps its height once the answers are fixed, so the Send button under
  // it never moves up between the press and the release of a click that
  // also ends a correction (a date read on blur).
  const [bannerAt, setBannerAt] = useState<number | null>(null);
  const [copy, setCopy] = useState(false);
  const [restored, setRestored] = useState(false);
  // Where the respondent was, one question at a time: a reload goes back there.
  const [resumeAt, setResumeAt] = useState(0);
  // The files chosen for each file question (the kit's picker: sending,
  // ready, failed); what is ready is the question's answer.
  const [picked, setPicked] = useState<Record<string, readonly PickedFile[]>>({});
  const uploading = Object.values(picked).some(list => list.some(f => f.status === "sending"));
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
      const at = Number(localStorage.getItem(storageKey + ":at") ?? "0");
      if (Number.isInteger(at) && at >= 1 && 500 >= at) setResumeAt(at);
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
        if (stage === "form" && props.layout === "steps") localStorage.setItem(storageKey + ":at", String(index));
      } catch {
        /* nothing kept */
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [raw, mode, stage, storageKey, index, props.layout]);

  // Shown inside a company's website (Share, "On your website"): the page
  // tells the frame its height, so the frame fits the form.
  useEffect(() => {
    if (mode !== "public" || typeof window === "undefined" || window.parent === window) return;
    const tell = () => window.parent.postMessage({ type: "chest-forms:height", slug: props.slug, height: document.documentElement.scrollHeight }, "*");
    const observer = new ResizeObserver(tell);
    observer.observe(document.body);
    tell();
    return () => observer.disconnect();
  }, [mode, props.slug]);

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

  // why: a question's problem, its field's refusal first.
  const why = (q: Question): AnswerError | null => (refused.current[q.id] ? "date" : problem(q, raw[q.id]));

  async function submit() {
    const all: Record<string, AnswerError> = {};
    for (const q of sequence) {
      const p = why(q);
      if (p) all[q.id] = p;
    }
    if (uploading) return;
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
        localStorage.removeItem(storageKey + ":at");
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
    else {
      const at = path.pages.findIndex(p => p.questions.includes(first));
      setIndex(at);
      setBannerAt(at);
    }
    setTimeout(() => document.getElementById(`q-${first.id}`)?.focus(), 30);
  }

  // One question at a time: go on when this one can be sent.
  function next() {
    const q = sequence[clampIndex];
    if (!q) return;
    const p = why(q);
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
  // The latest next(), for what runs after a render (a date just read).
  const nextRef = useRef(next);
  nextRef.current = next;

  // Classic layout: go on when every question of the page can be sent.
  function nextPage() {
    const page = path.pages[clampIndex];
    if (!page) return;
    const found: Record<string, AnswerError> = {};
    for (const q of page.questions) {
      const p = why(q);
      if (p) found[q.id] = p;
    }
    if (Object.keys(found).length > 0) return showErrors(found);
    if (clampIndex >= path.pages.length - 1) return void submit();
    setBannerAt(null);
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
    // The question's field, or its heading; a date question's field is
    // inside the kit's DateField.
    const target = headingRef.current?.querySelector<HTMLElement>("[data-autofocus]");
    (target?.matches("input, textarea, select, [tabindex]") ? target : target?.querySelector<HTMLElement>("input:not([type=hidden])"))?.focus({ preventScroll: false });
  }, [clampIndex, stage, mode]);

  // A file sent straight to the Chest (lib/upload-client.ts), with its
  // progress; the answer is what the Chest or the tool gave back for it.
  const upload = useCallback((q: Question) => async (file: File, options: { onProgress: (fraction: number) => void; signal: AbortSignal }) => {
    if (!props.grantUrl || mode === "preview") return { ok: false as const, error: props.errors.unavailable };
    const result = await uploadFile(file, props.grantUrl, { slug: props.slug, question: q.id, token: props.token ?? "" }, typesFor(q.accept ?? "any"), options);
    return result.ok ? { ok: true as const, ref: result.ref } : { ok: false as const, error: format(props.errors[result.error] ?? props.errors.unknown, { max: 0 }) };
  }, [props.grantUrl, props.slug, props.token, props.errors, mode]);
  // What is ready becomes the question's answer: its one file, or its files.
  useEffect(() => {
    for (const [id, list] of Object.entries(picked)) {
      const q = def.pages.flatMap(p => p.questions).find(x => x.id === id);
      if (!q) continue;
      const ready: FileRef[] = list.filter(f => f.status === "ready" && f.ref).map(f => ({ ref: f.ref!, name: f.name }));
      const value = (q.max ?? 1) > 1 ? (ready.length > 0 ? ready : undefined) : ready[0];
      if (JSON.stringify(value) !== JSON.stringify(raw[id])) set(id, value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked]);

  const field = (q: Question, number: number | null, autofocus: boolean) => (
    <QuestionField
      key={q.id}
      q={q}
      number={number}
      value={raw[q.id]}
      error={errors[q.id] ?? null}
      files={picked[q.id] ?? []}
      onFiles={update => setPicked(all => ({ ...all, [q.id]: update(all[q.id] ?? []) }))}
      upload={upload(q)}
      onChange={v => set(q.id, v)}
      {...(q.kind === "date" ? { onProblem: refusedProblem(q.id), refused: refused.current[q.id] === true } : {})}
      onPicked={props.layout === "steps" ? () => setTimeout(() => setIndex(i => (i === clampIndex && clampIndex < sequence.length - 1 ? i + 1 : i)), 380) : undefined}
      w={w}
      errorsWords={props.errors}
      locale={props.locale}
      autofocus={autofocus}
      steps={props.layout === "steps"}
      filesOff={props.filesOff === true}
      preview={mode === "preview"}
      pictures={props.pictures ?? {}}
      today={props.today}
    />
  );

  const shell = (children: ReactNode, progress: number | null) => (
    <div className={`runner layout-${props.layout} mode-${mode}`} data-accent={props.accent}>
      {progress !== null && (
        <div className="runner-progress" role="progressbar" aria-label={w.progressLabel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      {mode === "preview" && <p className="preview-tag" lang={props.previewTag?.lang}>{props.previewTag?.text ?? w.preview}</p>}
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

  const cover = props.cover ? <img className="runner-cover" src={props.cover} alt="" /> : null;

  if (stage === "start") {
    return shell(
      <section className="runner-start">
        {cover}
        <h1 className="runner-title">{def.title}</h1>
        {def.intro && <p className="runner-lede">{def.intro}</p>}
        {notes}
        <div className="runner-actions">
          {restored && resumeAt > 0 ? (
            <button type="button" className="button form-button big" onClick={() => { setIndex(resumeAt); setStage("form"); }}>{w.resume} <Arrow /></button>
          ) : (
            <button type="button" className="button form-button big" onClick={() => setStage("form")}>{w.start} <Arrow /></button>
          )}
          <span className="enter-hint" aria-hidden="true">{w.pressEnter}</span>
        </div>
        {restored && <p className="runner-note">{w.draftKept} <button type="button" className="button link" onClick={() => { setRaw({ ...props.initial }); setRestored(false); setResumeAt(0); setIndex(0); try { localStorage.removeItem(storageKey); localStorage.removeItem(storageKey + ":at"); } catch { /* nothing kept */ } }}>{w.startOver}</button></p>}
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
    // A later question that an answer could still bring (a condition, a
    // page a rule skipped): the button says OK, not Send, until none can.
    const shown = new Set(sequence.map(x => x.id));
    const all = def.pages.flatMap(p => p.questions);
    const more = q ? all.slice(all.findIndex(x => x.id === q.id) + 1).some(x => !shown.has(x.id) && x.kind !== "statement") : false;
    const percent = countable.length === 0 ? 0 : Math.round((Math.max(0, position) / countable.length) * 100);
    const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
      if (!q) return;
      // Enter in a date's field: the field reads the date first (and says
      // when it cannot); then, when it could, the form goes on.
      if (e.defaultPrevented && e.key === "Enter" && (e.target as HTMLElement).classList.contains("ck-date-input")) {
        const box = (e.target as HTMLElement).closest(".ck-date");
        setTimeout(() => { if (!box?.classList.contains("ck-invalid")) nextRef.current(); }, 0);
        return;
      }
      if (e.defaultPrevented) return;
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
        } else if ((q.kind === "choice" || q.kind === "choices" || q.kind === "picture") && letters.includes(key)) {
          const option = q.options?.[letters.indexOf(key)];
          if (option) {
            const current = isPick(raw[q.id]) ? (raw[q.id] as Pick) : { ids: [] };
            if (!manyPicks(q)) {
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
            <button type="button" className="button form-button" onClick={next} disabled={sending || uploading}>
              {last && !more ? (sending ? w.sending : w.submit) : q?.kind === "statement" ? w.continue : w.next} {!(last && !more) && <Check />}
            </button>
            <span className="enter-hint" aria-hidden="true">{q?.kind === "long" ? w.pressCtrlEnter : w.pressEnter}</span>
          </div>
          {clampIndex === 0 && notes}
        </div>
        <nav className="step-nav" aria-label={w.progressLabel}>
          <span className="step-count">{format(w.percent, { percent })}</span>
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
          {cover}
          <h1 className="runner-title">{def.title}</h1>
          {def.intro && <p className="runner-lede">{def.intro}</p>}
          {notes}
          {restored && <p className="runner-note">{w.draftKept} <button type="button" className="button link" onClick={() => { setRaw({ ...props.initial }); setRestored(false); try { localStorage.removeItem(storageKey); localStorage.removeItem(storageKey + ":at"); } catch { /* nothing kept */ } }}>{w.startOver}</button></p>}
        </header>
      )}
      {page?.page.title && <h2 className="page-heading">{page.page.title}</h2>}
      <form className="classic-page" noValidate onSubmit={e => { e.preventDefault(); nextPage(); }} ref={el => { headingRef.current = el as unknown as HTMLDivElement; }}>
        {page?.questions.map((q, i) => field(q, numbered.get(q.id) ?? null, i === 0 && clampIndex > 0))}
        {wrong > 0 ? <p className="runner-banner soft" role="alert">{plural(w.fixBelow, wrong, props.locale)}</p>
          : bannerAt === clampIndex && <p className="runner-banner soft spent" aria-hidden="true">{plural(w.fixBelow, 1, props.locale)}</p>}
        {banner}
        <div className="classic-actions">
          {clampIndex > 0 && <button type="button" className="button quiet" onClick={() => { setBannerAt(null); setIndex(clampIndex - 1); window.scrollTo({ top: 0 }); }}><Back /> {w.back}</button>}
          <button type="submit" className="button form-button" disabled={sending || uploading}>{lastPage ? (sending ? w.sending : w.submit) : w.continue}</button>
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
  files: readonly PickedFile[];
  onFiles: (update: (current: readonly PickedFile[]) => PickedFile[]) => void;
  upload: (file: File, options: { onProgress: (fraction: number) => void; signal: AbortSignal }) => Promise<{ ok: true; ref: string } | { ok: false; error: string }>;
  onChange: (v: unknown) => void;
  // A date question: its field's refusal, told to the runner; whether one
  // stands (the field then says why itself).
  onProblem?: (problem: string | null) => void;
  refused?: boolean;
  onPicked?: () => void;
  w: RunnerWords;
  errorsWords: Catalogue["errors"];
  locale: string;
  autofocus: boolean;
  steps: boolean;
  filesOff: boolean;
  preview: boolean;
  pictures: Record<string, string>;
  today: string;
};

function QuestionField(p: FieldProps) {
  const { q, w } = p;
  const base = useId();
  const inputId = `q-${q.id}`;
  const helpId = `${base}-help`;
  const errorId = `${base}-error`;
  const describedBy = [q.help ? helpId : "", p.error ? errorId : ""].filter(Boolean).join(" ") || undefined;
  const invalid = p.error ? true : undefined;
  const auto = p.autofocus ? { "data-autofocus": true } : {};
  // A pick with the mouse or a finger moves on by itself (one question at a
  // time); the keyboard's arrows only choose — Enter goes on.
  const pointer = useRef(false);
  // A date field that leaves the page (another question, another page)
  // forgets its refusal: its text is gone, the answer before stays shown.
  const forget = useRef(p.onProblem);
  useEffect(() => { forget.current = p.onProblem; });
  useEffect(() => () => forget.current?.(null), []);
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
  const errorText = p.error ? hint(q, p.error, w) : null;
  const error = errorText ? <p className="q-error" id={errorId} role="alert">{errorText}</p> : null;

  if (q.kind === "statement") {
    return (
      <section className="question statement" aria-labelledby={inputId}>
        <h2 className="q-heading" id={inputId} tabIndex={-1} {...auto}><span className="q-title">{q.title}</span></h2>
        {help}
      </section>
    );
  }

  // A date: the kit's DateField, the question as its heading. Its label
  // (the question's words, for screen readers) is hidden: the heading
  // shows them; its help and error are the field's own, so they are read
  // with it.
  if (q.kind === "date") {
    const value = typeof p.value === "string" && p.value ? p.value : null;
    return (
      <div className={`question kind-date${p.error ? " has-error" : ""}`} {...auto}>
        <p className="q-heading" aria-hidden="true">{heading}</p>
        <DateField id={inputId} hideLabel label={q.title + (q.required ? ` (${w.requiredMark})` : "")} value={value} onChange={d => p.onChange(d ?? undefined)} onProblem={p.onProblem} today={p.today} required={q.required} labels={w.date} {...(q.help ? { hint: q.help } : {})} error={p.refused ? null : errorText} />
      </div>
    );
  }

  // Text-like questions: a label and one field.
  if (["short", "long", "email", "phone", "number", "dropdown"].includes(q.kind)) {
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
      const type = q.kind === "email" ? "email" : q.kind === "phone" ? "tel" : "text";
      const inputMode = q.kind === "number" ? "decimal" : q.kind === "email" ? "email" : q.kind === "phone" ? "tel" : undefined;
      const autoComplete = q.kind === "email" ? "email" : q.kind === "phone" ? "tel" : undefined;
      control = <input className="answer-input" type={type} inputMode={inputMode} autoComplete={autoComplete} value={text} maxLength={q.kind === "short" ? (q.max ?? 500) : undefined} placeholder={!p.steps ? undefined : q.kind === "number" ? w.numberHere : w.typeHere} onChange={e => p.onChange(e.target.value)} {...common} />;
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

  if (q.kind === "picture") {
    const pick: Pick = isPick(p.value) ? p.value : { ids: [] };
    const multiple = manyPicks(q);
    const name = `${base}-${q.id}`;
    const toggle = (id: string) => p.onChange(multiple ? { ids: pick.ids.includes(id) ? pick.ids.filter(x => x !== id) : [...pick.ids, id] } : { ids: [id] });
    const pickHint = multiple ? (q.min && q.max ? format(w.chooseBetween, { min: q.min, max: q.max }) : q.max ? format(w.chooseUpTo, { max: q.max }) : q.min ? format(w.chooseAtLeast, { min: q.min }) : w.chooseMany) : null;
    return group(
      <div className="pictures">
        {q.options?.map((o, i) => {
          const on = pick.ids.includes(o.id);
          const src = o.image ? p.pictures[o.image.object] : undefined;
          return (
            <label key={o.id} className={`picture-card${on ? " on" : ""}`} {...press}>
              <input type={multiple ? "checkbox" : "radio"} name={name} checked={on} onChange={() => toggle(o.id)} onClick={() => { if (!multiple) picked(); else pointer.current = false; }} />
              <span className="picture-frame">{src ? <img src={src} alt={o.label ? "" : w.picture} loading="lazy" /> : null}</span>
              <span className="picture-caption"><span className="pill-key" aria-hidden="true">{letters[i] ?? ""}</span><span className="pill-label">{o.label}</span>{on && <Check />}</span>
            </label>
          );
        })}
      </div>,
      multiple ? "group" : "radiogroup",
      pickHint,
    );
  }

  if (q.kind === "ranking") {
    // Tap the items in the order you prefer: each gets its number; tap
    // again to take it back (the ones after move up).
    const order: string[] = isRanking(p.value) ? p.value : [];
    const tap = (id: string) => {
      const next = order.includes(id) ? order.filter(x => x !== id) : [...order, id];
      p.onChange(next.length ? next : undefined);
    };
    const move = (id: string, delta: -1 | 1) => {
      const i = order.indexOf(id), j = i + delta;
      if (i < 0 || j < 0 || j >= order.length) return;
      const next = [...order];
      [next[i], next[j]] = [next[j]!, next[i]!];
      p.onChange(next);
    };
    const items = [...(q.options ?? [])].sort((a, b) => {
      const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
      return (ia < 0 ? 1e3 : ia) - (ib < 0 ? 1e3 : ib);
    });
    return group(
      <ol className="ranking">
        {items.map(o => {
          const place = order.indexOf(o.id);
          return (
            <li key={o.id} className={`rank-item${place >= 0 ? " on" : ""}`}>
              <button type="button" className="rank-pick" aria-pressed={place >= 0} onClick={() => tap(o.id)}>
                <span className="rank-place" aria-hidden="true">{place >= 0 ? place + 1 : ""}</span>
                <span className="pill-label">{o.label}</span>
                <span className="visually-hidden">{place >= 0 ? format(w.rankPlace, { place: place + 1 }) : w.rankNot}</span>
              </button>
              {place >= 0 && (
                <span className="rank-moves">
                  <button type="button" className="icon-button" disabled={place === 0} onClick={() => move(o.id, -1)}><Up /><span className="visually-hidden">{format(w.rankUp, { item: o.label })}</span></button>
                  <button type="button" className="icon-button" disabled={place === order.length - 1} onClick={() => move(o.id, 1)}><Down /><span className="visually-hidden">{format(w.rankDown, { item: o.label })}</span></button>
                </span>
              )}
            </li>
          );
        })}
      </ol>,
      "group",
      w.rankHint,
    );
  }

  if (q.kind === "matrix") {
    const grid: Grid = isGrid(p.value) ? p.value : { rows: {} };
    const setCell = (row: string, column: string) => p.onChange({ rows: { ...grid.rows, [row]: column } });
    return group(
      <div className="matrix">
        <div className="matrix-head" aria-hidden="true" style={{ ["--cols" as string]: String(q.options?.length ?? 1) }}>
          <span />
          {q.options?.map(c => <span key={c.id}>{c.label}</span>)}
        </div>
        {q.rows?.map(r => (
          <div key={r.id} className="matrix-row" role="radiogroup" aria-label={r.label} style={{ ["--cols" as string]: String(q.options?.length ?? 1) }}>
            <span className="matrix-label">{r.label}</span>
            {q.options?.map(c => {
              const on = grid.rows[r.id] === c.id;
              return (
                <label key={c.id} className={`matrix-cell${on ? " on" : ""}`}>
                  <input type="radio" name={`${base}-${r.id}`} checked={on} onChange={() => setCell(r.id, c.id)} />
                  <span className="matrix-word">{c.label}</span>
                </label>
              );
            })}
          </div>
        ))}
      </div>,
      "group",
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

  // A file, or several (up to the question's number): the kit's picker,
  // the limits said before one tries, each file sent at once with its
  // progress, removable.
  const max = q.max ?? 1;
  return (
    <div className={`question kind-file${p.error ? " has-error" : ""}`}>
      <p className="q-heading"><span id={inputId} tabIndex={-1} className="q-focus" {...auto}>{heading}</span></p>
      {help}
      {p.filesOff ? (
        <p className="q-help">{w.file.off}</p>
      ) : (
        <>
          <FilePicker label={q.title} files={p.files} onChange={p.onFiles} upload={p.upload} accept={typesFor(q.accept ?? "any")} maxSize={limits.fileSize} maxFiles={max} disabled={p.preview} labels={w.files} />
          {/* The kit's picker says the limits and the kinds accepted:
              said once (store critique, round 2). */}
          {p.preview && <p className="q-help">{w.file.notInPreview}</p>}
        </>
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
