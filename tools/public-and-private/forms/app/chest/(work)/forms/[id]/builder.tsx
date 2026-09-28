"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { CopyButton } from "../../../../../components/copy-button.tsx";
import { Dialog } from "../../../../../components/dialog.tsx";
import { Branch, Close, Copy, Down, Eye, KindIcon, Pencil, Plus, Trash, Up } from "../../../../../components/icons.tsx";
import { Runner } from "../../../../../components/runner.tsx";
import { useToast } from "../../../../../components/toast.tsx";
import type { ErrorCode } from "../../../../../lib/app-error.ts";
import type { Catalogue } from "../../../../../lib/i18n/index.ts";
import { format, plural } from "../../../../../lib/i18n/format.ts";
import {
  END,
  copyQuestion,
  kinds,
  needsValue,
  newId,
  newQuestion,
  opsFor,
  problems,
  withOptions,
  type Accent,
  type Condition,
  type Definition,
  type Kind,
  type Layout,
  type Page,
  type Problem,
  type Question,
} from "../../../../../lib/model.ts";
import { discardDraft, publishForm, saveDraft } from "../../../actions.ts";

// The builder: the form's questions on the left, the form as respondents
// will see it on the right (the same component as the real page), updated
// as you type. Every change is saved by itself; Publish makes it the form
// people answer. A question is one card: click it to edit it.

type Words = { b: Catalogue["builder"]; respond: Catalogue["respond"]; errors: Catalogue["errors"]; share: Catalogue["share"] };
type Props = {
  id: string;
  slug: string;
  draft: Definition;
  revision: number;
  version: number;
  unpublished: boolean;
  status: "draft" | "published" | "closed";
  canEdit: boolean;
  layout: Layout;
  accent: Accent;
  anonymous: boolean;
  link: string;
  words: Words;
  locale: string;
};
type SaveState = "saved" | "saving" | "error" | "conflict";

export function Builder(props: Props) {
  const { b } = props.words;
  const toast = useToast();
  const [def, setDef] = useState<Definition>(props.draft);
  const [selected, setSelected] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>("saved");
  const [unpublished, setUnpublished] = useState(props.unpublished);
  const [status, setStatus] = useState(props.status);
  const [publishing, setPublishing] = useState(false);
  const [live, setLive] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const revision = useRef(props.revision);
  const pending = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(def);
  latest.current = def;
  const first = useRef(true);

  const flush = useCallback(async (): Promise<boolean> => {
    clearTimeout(timer.current);
    if (pending.current) await pending.current;
    const text = JSON.stringify(latest.current);
    setSave("saving");
    const run = saveDraft(props.id, text, revision.current).then(result => {
      if (result.ok) {
        revision.current = result.value.revision;
        setSave(JSON.stringify(latest.current) === text ? "saved" : "saving");
        return true;
      }
      setSave(result.error === "conflict" ? "conflict" : "error");
      return false;
    }).catch(() => {
      setSave("error");
      return false;
    });
    pending.current = run;
    const ok = await run;
    pending.current = null;
    return ok;
  }, [props.id]);

  // Save by itself, a moment after the last change.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!props.canEdit || save === "conflict") return;
    setUnpublished(true);
    setSave("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 700);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def]);

  // Leaving with a change not saved yet: the browser asks.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (save === "saving" || save === "error") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save]);

  const found = useMemo(() => problems(def), [def]);
  const allQs = useMemo(() => def.pages.flatMap(p => p.questions), [def]);

  const change = (fn: (d: Definition) => void) => {
    if (!props.canEdit) return;
    setDef(d => {
      const copy = structuredClone(d);
      fn(copy);
      return copy;
    });
  };
  const updateQuestion = (id: string, fn: (q: Question) => void) => change(d => {
    for (const p of d.pages) for (const q of p.questions) if (q.id === id) fn(q);
  });

  async function publish() {
    if (found.length > 0) {
      setShowProblems(true);
      return;
    }
    setPublishing(true);
    const saved = await flush();
    if (!saved) {
      setPublishing(false);
      return;
    }
    const result = await publishForm(props.id);
    setPublishing(false);
    if (!result.ok) {
      if (result.error === "incomplete") setShowProblems(true);
      else toast(errorText(props.words.errors, result.error, result.values));
      return;
    }
    setUnpublished(false);
    setStatus("published");
    setLive(true);
  }

  async function discard() {
    const result = await discardDraft(props.id);
    if (result.ok) {
      toast(b.discarded);
      window.location.reload();
    } else toast(errorText(props.words.errors, result.error, result.values));
  }

  function removeQuestion(id: string) {
    const before = def;
    change(d => {
      for (const p of d.pages) p.questions = p.questions.filter(q => q.id !== id);
    });
    setSelected(null);
    toast(b.removed, { label: b.undo, run: () => setDef(before) });
  }

  function addQuestion(pageId: string, kind: Kind) {
    const q = newQuestion(kind, { option: n => format(b.option, { n }) });
    change(d => d.pages.find(p => p.id === pageId)?.questions.push(q));
    setSelected(q.id);
  }

  function move(id: string, delta: -1 | 1) {
    change(d => {
      const flat = d.pages.flatMap((p, pi) => p.questions.map((q, qi) => ({ q, pi, qi })));
      const at = flat.findIndex(x => x.q.id === id);
      const here = flat[at]!;
      const page = d.pages[here.pi]!;
      const target = here.qi + delta;
      if (target >= 0 && target < page.questions.length) {
        [page.questions[here.qi], page.questions[target]] = [page.questions[target]!, page.questions[here.qi]!];
      } else if (delta === -1 && here.pi > 0) {
        page.questions.splice(here.qi, 1);
        d.pages[here.pi - 1]!.questions.push(here.q);
      } else if (delta === 1 && here.pi < d.pages.length - 1) {
        page.questions.splice(here.qi, 1);
        d.pages[here.pi + 1]!.questions.unshift(here.q);
      }
    });
  }

  function moveToPage(id: string, pageId: string) {
    change(d => {
      let found: Question | undefined;
      for (const p of d.pages) {
        const i = p.questions.findIndex(q => q.id === id);
        if (i >= 0) found = p.questions.splice(i, 1)[0];
      }
      if (found) d.pages.find(p => p.id === pageId)?.questions.push(found);
    });
  }

  function duplicate(id: string) {
    const copyId = { value: "" };
    change(d => {
      for (const p of d.pages) {
        const i = p.questions.findIndex(q => q.id === id);
        if (i >= 0) {
          const c = copyQuestion(p.questions[i]!);
          copyId.value = c.id;
          p.questions.splice(i + 1, 0, c);
        }
      }
    });
    setTimeout(() => setSelected(copyId.value), 0);
  }

  function addPage() {
    change(d => d.pages.push({ id: newId(), title: "", questions: [], jumps: [] }));
  }

  function removePage(pageId: string) {
    const before = def;
    change(d => {
      const i = d.pages.findIndex(p => p.id === pageId);
      if (i <= 0 && d.pages.length === 1) return;
      const [gone] = d.pages.splice(i, 1);
      d.pages[Math.max(0, i - 1)]!.questions.push(...(gone?.questions ?? []));
      for (const p of d.pages) p.jumps = p.jumps.filter(j => j.to !== pageId);
    });
    toast(b.pageRemoved, { label: b.undo, run: () => setDef(before) });
  }

  const saveLabel = save === "saving" ? b.saving : save === "saved" ? b.saved : save === "conflict" ? b.conflict : b.unsaved;
  const questionNumber = new Map(allQs.filter(q => q.kind !== "statement").map((q, i) => [q.id, i + 1]));
  const problemOf = (id: string) => found.filter(p => p.question === id);

  const preview = (
    <aside className="preview-pane" aria-label={b.previewLabel}>
      <div className="device">
        <Runner
          definition={def}
          version={0}
          layout={props.layout}
          accent={props.accent}
          mode="preview"
          slug={props.slug}
          anonymous={props.anonymous}
          initial={{}}
          thanks={{ title: "", body: "" }}
          redirectUrl={null}
          words={props.words.respond}
          errors={props.words.errors}
          locale={props.locale}
          focus={selected}
        />
      </div>
    </aside>
  );

  return (
    <div className={`builder view-${view}`}>
      <div className="builder-bar">
        <span className={`save-state ${save}`} role="status" aria-live="polite">{props.canEdit ? saveLabel : b.readOnly}</span>
        {save === "error" && <button type="button" className="button link" onClick={() => void flush()}>{b.retry}</button>}
        {save === "conflict" && <button type="button" className="button link" onClick={() => window.location.reload()}>{b.reload}</button>}
        <span className="spacer" />
        <div className="segmented phone-only" role="group">
          <button type="button" aria-pressed={view === "edit"} onClick={() => setView("edit")}><Pencil />{b.edit}</button>
          <button type="button" aria-pressed={view === "preview"} onClick={() => setView("preview")}><Eye />{b.preview}</button>
        </div>
        {props.canEdit && unpublished && props.version > 0 && <button type="button" className="button link desktop-only" onClick={() => void discard()}>{b.discard}</button>}
        {props.canEdit && (
          <button type="button" className={`button${unpublished ? "" : " quiet"}`} onClick={() => void publish()} disabled={publishing || (!unpublished && status === "published")}>
            {publishing ? b.publishing : !unpublished && status === "published" ? b.upToDate : props.version > 0 ? b.publishChanges : b.publish}
          </button>
        )}
      </div>
      {unpublished && props.version > 0 && props.canEdit && <p className="changes-note">{b.changes}</p>}

      {showProblems && found.length > 0 && (
        <div className="problems" role="alert">
          <div className="problems-head">
            <strong>{plural(b.problemsTitle, found.length, props.locale)}</strong>
            <button type="button" className="icon-button" onClick={() => setShowProblems(false)}><Close /><span className="visually-hidden">{b.close}</span></button>
          </div>
          <ul>
            {found.map((p, i) => (
              <li key={i}>
                {b.problems[p.code]}{" "}
                {p.question && <button type="button" className="button link" onClick={() => { setSelected(p.question!); setView("edit"); setTimeout(() => document.getElementById(`card-${p.question}`)?.scrollIntoView({ block: "center" }), 30); }}>{b.fix}</button>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="builder-grid">
        <div className="canvas">
          <div className="form-head-edit">
            <label className="visually-hidden" htmlFor="form-title">{b.titleLabel}</label>
            <input id="form-title" className="title-input" value={def.title} placeholder={b.titlePlaceholder} maxLength={200} readOnly={!props.canEdit} onChange={e => change(d => { d.title = e.target.value; })} />
            <label className="visually-hidden" htmlFor="form-intro">{b.introLabel}</label>
            <textarea id="form-intro" className="intro-input" value={def.intro} placeholder={b.introPlaceholder} maxLength={2000} rows={2} readOnly={!props.canEdit} onChange={e => change(d => { d.intro = e.target.value; })} />
          </div>

          {def.pages.map((page, pi) => (
            <section key={page.id} className="page-block" aria-labelledby={`page-${page.id}`}>
              {def.pages.length > 1 && (
                <div className="page-head">
                  <h2 id={`page-${page.id}`}>{format(b.page, { n: pi + 1 })}</h2>
                  <label className="visually-hidden" htmlFor={`page-title-${page.id}`}>{b.pageTitle}</label>
                  <input id={`page-title-${page.id}`} className="page-title-input" value={page.title} placeholder={b.pageTitle} maxLength={200} readOnly={!props.canEdit} onChange={e => change(d => { d.pages[pi]!.title = e.target.value; })} />
                  {props.canEdit && <button type="button" className="icon-button" onClick={() => removePage(page.id)}><Trash /><span className="visually-hidden">{b.removePage}</span></button>}
                </div>
              )}
              {def.pages.length === 1 && <h2 id={`page-${page.id}`} className="visually-hidden">{format(b.page, { n: 1 })}</h2>}
              {page.questions.length === 0 && <p className="page-empty">{b.noQuestions}</p>}
              <ol className="question-list">
                {page.questions.map(q => (
                  <li key={q.id}>
                    <QuestionCard
                      q={q}
                      number={questionNumber.get(q.id) ?? null}
                      open={selected === q.id}
                      onOpen={() => setSelected(selected === q.id ? null : q.id)}
                      onChange={fn => updateQuestion(q.id, fn)}
                      before={allQs.slice(0, allQs.findIndex(x => x.id === q.id))}
                      pages={def.pages}
                      pageIndex={pi}
                      canEdit={props.canEdit}
                      problems={problemOf(q.id)}
                      onRemove={() => removeQuestion(q.id)}
                      onDuplicate={() => duplicate(q.id)}
                      onMove={delta => move(q.id, delta)}
                      onMoveToPage={pid => moveToPage(q.id, pid)}
                      anonymous={props.anonymous}
                      b={b}
                    />
                  </li>
                ))}
              </ol>
              {props.canEdit && <AddQuestion b={b} onAdd={kind => addQuestion(page.id, kind)} anonymous={props.anonymous} />}
              {def.pages.length > 1 && (
                <Jumps page={page} pageIndex={pi} pages={def.pages} before={def.pages.slice(0, pi + 1).flatMap(p => p.questions)} canEdit={props.canEdit} b={b}
                  onChange={jumps => change(d => { d.pages[pi]!.jumps = jumps; })} />
              )}
            </section>
          ))}
          {props.canEdit && <button type="button" className="button quiet add-page" onClick={addPage}><Plus />{b.addPage}</button>}
        </div>
        {preview}
      </div>

      <Dialog open={live} title={b.live} closeLabel={b.close} onClose={() => setLive(false)}>
        <p>{b.liveBody}</p>
        <div className="link-box">
          <code>{props.link}</code>
        </div>
        <div className="dialog-actions">
          <CopyButton text={props.link} label={props.words.share.copy} done={props.words.share.copied} className="button" />
          <a className="button quiet" href={props.link} target="_blank" rel="noreferrer">{b.open}</a>
        </div>
      </Dialog>
    </div>
  );
}

export function errorText(errors: Catalogue["errors"], code: ErrorCode, values?: Record<string, number | string>): string {
  return format(errors[code] ?? errors.unknown, values ?? {});
}

// ---- Adding a question: a menu of the kinds, with their icons -----------------

function AddQuestion({ b, onAdd, anonymous }: { b: Catalogue["builder"]; onAdd: (k: Kind) => void; anonymous: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="add-question">
      <button type="button" className="button quiet add-button" aria-expanded={open} onClick={() => setOpen(!open)}><Plus />{b.addQuestion}</button>
      {open && (
        <div className="type-menu" role="group" aria-label={b.types}>
          {kinds.filter(k => !(anonymous && k === "file")).map(k => (
            <button key={k} type="button" className="type-item" onClick={() => { onAdd(k); setOpen(false); }}>
              <span className={`type-icon kind-${k}`}><KindIcon kind={k} /></span>
              <span className="type-text"><strong>{b.kinds[k]}</strong><small>{b.kindHints[k]}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- One question ------------------------------------------------------------------

type CardProps = {
  q: Question;
  number: number | null;
  open: boolean;
  onOpen: () => void;
  onChange: (fn: (q: Question) => void) => void;
  before: Question[];
  pages: Page[];
  pageIndex: number;
  canEdit: boolean;
  problems: Problem[];
  onRemove: () => void;
  onDuplicate: () => void;
  onMove: (delta: -1 | 1) => void;
  onMoveToPage: (pageId: string) => void;
  anonymous: boolean;
  b: Catalogue["builder"];
};

function QuestionCard(p: CardProps) {
  const { q, b } = p;
  const ro = !p.canEdit;
  const set = (fn: (q: Question) => void) => p.onChange(fn);
  const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
  const summary = (
    <button type="button" className="card-summary" aria-expanded={p.open} onClick={p.onOpen} aria-label={format(b.openQuestion, { n: p.number ?? "" }) + " — " + (q.title || b.kinds[q.kind])}>
      <span className={`type-icon kind-${q.kind}`}><KindIcon kind={q.kind} /></span>
      {p.number !== null && <span className="card-number">{format(b.numbered, { n: p.number })}</span>}
      <span className={`card-title${q.title ? "" : " placeholder"}`}>{q.title || (q.kind === "statement" ? b.statementPlaceholder : b.questionPlaceholder)}</span>
      {q.required && <span className="card-required" aria-hidden="true">*</span>}
      {q.showIf && <span className="card-badge" title={b.logicOn}><Branch /></span>}
      {p.problems.length > 0 && <span className="card-problem" aria-hidden="true">!</span>}
    </button>
  );
  if (!p.open) return <div className={`qcard${p.problems.length ? " has-problem" : ""}`} id={`card-${q.id}`}>{summary}</div>;
  const titleId = `title-${q.id}`, helpId = `help-${q.id}`;
  return (
    <div className="qcard open" id={`card-${q.id}`}>
      {summary}
      <div className="card-body">
        <label className="field-label" htmlFor={titleId}>{q.kind === "statement" ? b.statementPlaceholder : b.questionTitle}</label>
        {q.kind === "statement" ? (
          <textarea id={titleId} className="field big" rows={2} value={q.title} maxLength={300} readOnly={ro} autoFocus onChange={e => set(x => { x.title = e.target.value; })} />
        ) : (
          <input id={titleId} className="field big" value={q.title} placeholder={b.questionPlaceholder} maxLength={300} readOnly={ro} autoFocus onChange={e => set(x => { x.title = e.target.value; })} />
        )}
        <label className="field-label" htmlFor={helpId}>{b.help}</label>
        <input id={helpId} className="field" value={q.help} placeholder={b.helpPlaceholder} maxLength={1000} readOnly={ro} onChange={e => set(x => { x.help = e.target.value; })} />

        {withOptions(q.kind) && <Options q={q} set={set} ro={ro} b={b} />}

        {(q.kind === "short" || q.kind === "long") && (
          <div className="pair">
            <NumberField label={b.minLength} value={q.min} ro={ro} onChange={v => set(x => { x.min = num(v); })} />
            <NumberField label={b.maxLength} value={q.max} ro={ro} onChange={v => set(x => { x.max = num(v); })} />
          </div>
        )}
        {q.kind === "number" && (
          <div className="pair">
            <NumberField label={b.min} value={q.min} ro={ro} decimal onChange={v => set(x => { x.min = num(v); })} />
            <NumberField label={b.max} value={q.max} ro={ro} decimal onChange={v => set(x => { x.max = num(v); })} />
          </div>
        )}
        {q.kind === "choices" && (
          <div className="pair">
            <NumberField label={b.minPicks} value={q.min} ro={ro} onChange={v => set(x => { x.min = num(v); })} />
            <NumberField label={b.maxPicks} value={q.max} ro={ro} onChange={v => set(x => { x.max = num(v); })} />
          </div>
        )}
        {q.kind === "rating" && (
          <SelectField label={b.steps} value={String(q.steps ?? 5)} ro={ro} options={[3, 4, 5, 6, 7, 8, 9, 10].map(n => [String(n), String(n)])} onChange={v => set(x => { x.steps = Number(v); })} />
        )}
        {q.kind === "scale" && (
          <>
            <div className="pair">
              <SelectField label={b.from} value={String(q.from ?? 0)} ro={ro} options={[["0", "0"], ["1", "1"]]} onChange={v => set(x => { x.from = Number(v); })} />
              <SelectField label={b.to} value={String(q.to ?? 10)} ro={ro} options={[5, 6, 7, 8, 9, 10].map(n => [String(n), String(n)])} onChange={v => set(x => { x.to = Number(v); })} />
            </div>
            <div className="pair">
              <TextField label={b.left} value={q.left ?? ""} placeholder={b.leftPlaceholder} ro={ro} onChange={v => set(x => { x.left = v; })} />
              <TextField label={b.right} value={q.right ?? ""} placeholder={b.rightPlaceholder} ro={ro} onChange={v => set(x => { x.right = v; })} />
            </div>
          </>
        )}
        {q.kind === "file" && (
          <>
            <SelectField label={b.accept} value={q.accept ?? "any"} ro={ro} options={[["any", b.acceptAny], ["images", b.acceptImages], ["documents", b.acceptDocuments]]} onChange={v => set(x => { x.accept = v as Question["accept"]; })} />
            <p className="hint">{b.fileNote}</p>
          </>
        )}

        {q.kind !== "statement" && (
          <label className="switch">
            <input type="checkbox" role="switch" checked={q.required} disabled={ro} onChange={e => set(x => { x.required = e.target.checked; })} />
            <span className="switch-track" aria-hidden="true" />
            {b.required}
          </label>
        )}

        <ConditionEditor label={b.logic} condition={q.showIf} before={p.before} ro={ro} b={b}
          onChange={c => set(x => { if (c) x.showIf = c; else delete x.showIf; })} />

        {p.problems.map((pr, i) => <p key={i} className="problem-line">{b.problems[pr.code]}</p>)}

        <div className="card-actions">
          {!ro && (
            <>
              <SelectField label={b.questionTitle} hideLabel value={q.kind} ro={ro} options={kinds.filter(k => !(p.anonymous && k === "file")).map(k => [k, b.kinds[k]])} onChange={v => set(x => changeKind(x, v as Kind, b))} />
              <button type="button" className="icon-button" onClick={() => p.onMove(-1)}><Up /><span className="visually-hidden">{b.moveUp}</span></button>
              <button type="button" className="icon-button" onClick={() => p.onMove(1)}><Down /><span className="visually-hidden">{b.moveDown}</span></button>
              {p.pages.length > 1 && (
                <SelectField label={b.moveTo} value={p.pages[p.pageIndex]!.id} ro={ro} options={p.pages.map((pg, i) => [pg.id, format(b.pageOption, { n: i + 1 })])} onChange={v => p.onMoveToPage(v)} />
              )}
              <button type="button" className="icon-button" onClick={p.onDuplicate}><Copy /><span className="visually-hidden">{b.duplicate}</span></button>
              <button type="button" className="icon-button danger" onClick={p.onRemove}><Trash /><span className="visually-hidden">{b.remove}</span></button>
            </>
          )}
          <span className="spacer" />
          <button type="button" className="button quiet small" onClick={p.onOpen}>{b.close}</button>
        </div>
      </div>
    </div>
  );
}

// changeKind keeps what still makes sense when a question changes kind.
function changeKind(q: Question, kind: Kind, b: Catalogue["builder"]): void {
  const fresh = newQuestion(kind, { option: n => format(b.option, { n }) });
  const keep = { id: q.id, title: q.title, help: q.help, required: kind === "statement" ? false : q.required, showIf: q.showIf };
  const options = withOptions(q.kind) && withOptions(kind) ? q.options : fresh.options;
  for (const k of Object.keys(q)) delete (q as Record<string, unknown>)[k];
  Object.assign(q, fresh, keep, options ? { options } : {});
  if (!keep.showIf) delete q.showIf;
}

function Options({ q, set, ro, b }: { q: Question; set: (fn: (q: Question) => void) => void; ro: boolean; b: Catalogue["builder"] }) {
  const options = q.options ?? [];
  return (
    <fieldset className="options-edit">
      <legend className="field-label">{b.options}</legend>
      <ol>
        {options.map((o, i) => (
          <li key={o.id} className="option-row">
            <span className="option-key" aria-hidden="true">{String.fromCharCode(65 + i)}</span>
            <input className="field" value={o.label} aria-label={format(b.option, { n: i + 1 })} maxLength={200} readOnly={ro}
              onChange={e => set(x => { x.options![i]!.label = e.target.value; })}
              onKeyDown={e => {
                if (e.key === "Enter" && !ro) {
                  e.preventDefault();
                  set(x => { x.options!.splice(i + 1, 0, { id: newId(), label: "" }); });
                  setTimeout(() => (e.currentTarget.closest("ol")?.querySelectorAll("input")[i + 1] as HTMLInputElement | undefined)?.focus(), 30);
                }
              }} />
            {!ro && (
              <>
                <button type="button" className="icon-button" disabled={i === 0} onClick={() => set(x => { const o2 = x.options!; [o2[i - 1], o2[i]] = [o2[i]!, o2[i - 1]!]; })}><Up /><span className="visually-hidden">{b.moveOptionUp}</span></button>
                <button type="button" className="icon-button" disabled={i === options.length - 1} onClick={() => set(x => { const o2 = x.options!; [o2[i + 1], o2[i]] = [o2[i]!, o2[i + 1]!]; })}><Down /><span className="visually-hidden">{b.moveOptionDown}</span></button>
                <button type="button" className="icon-button" onClick={() => set(x => { x.options!.splice(i, 1); })}><Close /><span className="visually-hidden">{b.removeOption}</span></button>
              </>
            )}
          </li>
        ))}
        {q.other && (
          <li className="option-row other-row">
            <span className="option-key" aria-hidden="true">{String.fromCharCode(65 + options.length)}</span>
            <span className="other-label">{b.other}</span>
            {!ro && <button type="button" className="icon-button" onClick={() => set(x => { delete x.other; })}><Close /><span className="visually-hidden">{b.removeOption}</span></button>}
          </li>
        )}
      </ol>
      {!ro && (
        <div className="options-actions">
          <button type="button" className="button link" onClick={() => set(x => { x.options = [...(x.options ?? []), { id: newId(), label: "" }]; })}><Plus />{b.addOption}</button>
          {q.kind !== "dropdown" && !q.other && <button type="button" className="button link" onClick={() => set(x => { x.other = true; })}><Plus />{b.addOther}</button>}
        </div>
      )}
    </fieldset>
  );
}

// ---- Conditions and page rules -------------------------------------------------------

function ConditionEditor({ label, condition, before, ro, b, onChange }: { label: string; condition: Condition | undefined; before: Question[]; ro: boolean; b: Catalogue["builder"]; onChange: (c: Condition | undefined) => void }) {
  const usable = before.filter(q => opsFor(q.kind).length > 0);
  if (!condition) {
    if (ro) return null;
    return (
      <div className="logic">
        {usable.length === 0 ? <p className="hint">{b.logicNone}</p> : (
          <button type="button" className="button link" onClick={() => onChange({ question: usable.at(-1)!.id, op: opsFor(usable.at(-1)!.kind)[0]! })}><Branch />{label}</button>
        )}
      </div>
    );
  }
  return (
    <div className="logic on">
      <p className="field-label"><Branch /> {label}</p>
      <ConditionFields condition={condition} questions={usable} ro={ro} b={b} onChange={onChange} />
      {!ro && <button type="button" className="button link" onClick={() => onChange(undefined)}>{b.logicRemove}</button>}
    </div>
  );
}

function ConditionFields({ condition, questions, ro, b, onChange }: { condition: Condition; questions: Question[]; ro: boolean; b: Catalogue["builder"]; onChange: (c: Condition) => void }) {
  const target = questions.find(q => q.id === condition.question);
  const ops = target ? opsFor(target.kind) : [];
  const pickQuestion = (id: string) => {
    const q = questions.find(x => x.id === id)!;
    onChange({ question: id, op: opsFor(q.kind)[0]! });
  };
  let value: ReactNode = null;
  if (target && needsValue(condition.op)) {
    if (withOptions(target.kind)) {
      const options: [string, string][] = [["", b.choose], ...(target.options ?? []).map(o => [o.id, o.label || "…"] as [string, string]), ...(target.other ? [["other", b.other] as [string, string]] : [])];
      value = <SelectField label={b.valuePlaceholder} hideLabel value={String(condition.value ?? "")} ro={ro} options={options} onChange={v => onChange({ ...condition, value: v })} />;
    } else if (target.kind === "yesno") {
      value = <SelectField label={b.valuePlaceholder} hideLabel value={condition.value === false ? "no" : condition.value === true ? "yes" : ""} ro={ro} options={[["", b.choose], ["yes", b.valueYes], ["no", b.valueNo]]} onChange={v => onChange(v ? { ...condition, value: v === "yes" } : { question: condition.question, op: condition.op })} />;
    } else if (target.kind === "number" || target.kind === "rating" || target.kind === "scale") {
      value = <NumberField label={b.valuePlaceholder} hideLabel decimal value={typeof condition.value === "number" ? condition.value : undefined} ro={ro} onChange={v => onChange(v.trim() !== "" && Number.isFinite(Number(v)) ? { ...condition, value: Number(v) } : { question: condition.question, op: condition.op })} />;
    } else {
      value = <TextField label={b.valuePlaceholder} hideLabel value={typeof condition.value === "string" ? condition.value : ""} ro={ro} onChange={v => onChange({ ...condition, value: v })} />;
    }
  }
  return (
    <div className="condition">
      <SelectField label={b.questionTitle} hideLabel value={condition.question} ro={ro} options={[...(target ? [] : [["", b.choose] as [string, string]]), ...questions.map(q => [q.id, q.title || b.kinds[q.kind]] as [string, string])]} onChange={pickQuestion} />
      <SelectField label={b.ruleIf} hideLabel value={condition.op} ro={ro} options={ops.map(o => [o, b.ops[o]])} onChange={v => onChange({ question: condition.question, op: v as Condition["op"], ...(needsValue(v as Condition["op"]) && condition.value !== undefined ? { value: condition.value } : {}) })} />
      {value}
    </div>
  );
}

function Jumps({ page, pageIndex, pages, before, canEdit, b, onChange }: { page: Page; pageIndex: number; pages: Page[]; before: Question[]; canEdit: boolean; b: Catalogue["builder"]; onChange: (j: Page["jumps"]) => void }) {
  const usable = before.filter(q => opsFor(q.kind).length > 0);
  const later: [string, string][] = [...pages.slice(pageIndex + 1).map((p, i) => [p.id, format(b.pageOption, { n: pageIndex + i + 2 })] as [string, string]), [END, b.endOption]];
  const last = pageIndex === pages.length - 1;
  return (
    <div className="jumps">
      <p className="jumps-title"><Branch /> {b.after}: <span>{last ? b.goEnd : b.goNext}</span></p>
      {page.jumps.map((j, i) => (
        <div key={i} className="jump">
          <span className="jump-word">{b.ruleIf}</span>
          <ConditionFields condition={j.when} questions={usable} ro={!canEdit} b={b} onChange={c => onChange(page.jumps.map((x, k) => (k === i ? { ...x, when: c } : x)))} />
          <span className="jump-word">{b.ruleThen}</span>
          <SelectField label={b.ruleThen} hideLabel value={j.to} ro={!canEdit} options={later} onChange={v => onChange(page.jumps.map((x, k) => (k === i ? { ...x, to: v } : x)))} />
          {canEdit && <button type="button" className="icon-button" onClick={() => onChange(page.jumps.filter((_, k) => k !== i))}><Close /><span className="visually-hidden">{b.removeRule}</span></button>}
        </div>
      ))}
      {canEdit && usable.length > 0 && (
        <button type="button" className="button link" onClick={() => onChange([...page.jumps, { when: { question: usable.at(-1)!.id, op: opsFor(usable.at(-1)!.kind)[0]! }, to: later[0]![0] }])}><Plus />{b.addRule}</button>
      )}
    </div>
  );
}

// ---- Small fields ------------------------------------------------------------------------


function SelectField({ label, value, options, onChange, ro, hideLabel }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void; ro: boolean; hideLabel?: boolean }) {
  const id = useId();
  return (
    <span className="mini">
      <label htmlFor={id} className={hideLabel ? "visually-hidden" : "mini-label"}>{label}</label>
      <select id={id} className="field" value={value} disabled={ro} onChange={e => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </span>
  );
}

function NumberField({ label, value, onChange, ro, hideLabel, decimal }: { label: string; value: number | undefined; onChange: (v: string) => void; ro: boolean; hideLabel?: boolean; decimal?: boolean }) {
  const id = useId();
  const [text, setText] = useState(value === undefined ? "" : String(value));
  useEffect(() => {
    if (value === undefined ? text.trim() !== "" && Number.isFinite(Number(text)) : Number(text) !== value) setText(value === undefined ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <span className="mini">
      <label htmlFor={id} className={hideLabel ? "visually-hidden" : "mini-label"}>{label}</label>
      <input id={id} className="field number" inputMode={decimal ? "decimal" : "numeric"} value={text} readOnly={ro}
        onChange={e => {
          const v = e.target.value.replace(",", ".");
          if (v !== "" && !/^-?\d*(\.\d*)?$/u.test(v)) return;
          setText(v);
          if (v === "" || Number.isFinite(Number(v))) onChange(decimal ? v : v.split(".")[0] ?? "");
        }} />
    </span>
  );
}

function TextField({ label, value, onChange, ro, hideLabel, placeholder }: { label: string; value: string; onChange: (v: string) => void; ro: boolean; hideLabel?: boolean; placeholder?: string }) {
  const id = useId();
  return (
    <span className="mini">
      <label htmlFor={id} className={hideLabel ? "visually-hidden" : "mini-label"}>{label}</label>
      <input id={id} className="field" value={value} placeholder={placeholder} maxLength={200} readOnly={ro} onChange={e => onChange(e.target.value)} />
    </span>
  );
}
