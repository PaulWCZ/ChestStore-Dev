"use client";

// Toasts: a short message after an action, at the bottom of the screen,
// read by screen readers — and, instead of "Are you sure?", an Undo that
// tells the truth (toast-state.ts has the rules). Wrap the page once:
//
//   <Toasts labels={kitWords[locale].toast}> … </Toasts>
//   const toast = useToast();
//   toast({ id: `delete-${note.id}`, text: t.deleted, undo: () => restore(note.id) });
//   toast({ id: `invite-${id}`, text: t.invitationSent, sent: true });   // never an Undo
//
// Ctrl+Z (⌘Z on a Mac), outside a text field, runs the newest Undo.
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactElement, type ReactNode } from "react";
import { CloseIcon, SentIcon, UndoIcon } from "./icons.js";
import { isEditable } from "./text.js";
import { latestUndo, settleUndo, toastReducer, type ToastInput, type ToastState } from "./toast-state.js";
import { en, type ToastWords } from "./words.js";

export type ShowToast = (input: ToastInput | string) => string;

const Context = createContext<{ show: ShowToast; dismiss: (id: string) => void } | null>(null);
const noop = { show: (input: ToastInput | string) => (typeof input === "string" ? "" : input.id ?? ""), dismiss: () => {} };

// useToast: the function that shows a toast (returns its id). Outside
// <Toasts> it does nothing (a component still renders in tests).
export function useToast(): ShowToast {
  return (useContext(Context) ?? noop).show;
}

export function useDismissToast(): (id: string) => void {
  return (useContext(Context) ?? noop).dismiss;
}

export function Toasts({ labels = en.toast, children }: { labels?: ToastWords; children?: ReactNode }): ReactElement {
  const [toasts, dispatch] = useReducer(toastReducer, []);
  const seq = useRef(0);
  const list = useRef<ToastState[]>(toasts);
  list.current = toasts;

  const show = useCallback<ShowToast>(input => {
    const spec: ToastInput = typeof input === "string" ? { text: input } : input;
    seq.current += 1;
    const id = spec.id ?? `toast-${seq.current}`;
    dispatch({ type: "show", input: { ...spec, id }, now: Date.now(), seq: seq.current });
    return id;
  }, []);
  const dismiss = useCallback((id: string) => dispatch({ type: "dismiss", id }), []);

  const runUndo = useCallback(async (id: string) => {
    const t = list.current.find(x => x.id === id);
    if (!t || !t.undo || t.phase !== "open") return;
    const undo = t.undo;
    dispatch({ type: "undoStart", id });
    let settled: { ok: boolean; note: string | null };
    try {
      settled = settleUndo(await undo());
    } catch {
      settled = { ok: false, note: null };
    }
    // The Undo button goes: whoever used it from the keyboard lands on the
    // toast's close button, not at the top of the page.
    const active = typeof document === "undefined" ? null : document.activeElement;
    const box = active?.closest?.(".ck-toast");
    if (box && box.getAttribute("data-toast-id") === id) box.querySelector<HTMLElement>(".ck-toast-close")?.focus();
    dispatch({ type: "undoEnd", id, ok: settled.ok, note: settled.note, now: Date.now() });
  }, []);

  // Ctrl+Z / ⌘Z outside a field: the newest Undo still on screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "z" || e.shiftKey || e.altKey || !(e.ctrlKey || e.metaKey) || isEditable(e.target)) return;
      const t = latestUndo(list.current);
      if (!t) return;
      e.preventDefault();
      void runUndo(t.id);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [runUndo]);

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  const polite = toasts.filter(t => t.tone !== "error");
  const urgent = toasts.filter(t => t.tone === "error");
  return (
    <Context.Provider value={value}>
      {children}
      <section className="ck-toasts" aria-label={labels.region}>
        {/* Both live regions exist from the first render, so screen readers announce what is added. */}
        <div role="status" aria-live="polite" className="ck-toast-stack">
          {polite.map(t => <Toast key={t.id} toast={t} labels={labels} dispatch={dispatch} runUndo={runUndo} />)}
        </div>
        <div role="alert" aria-live="assertive" className="ck-toast-stack">
          {urgent.map(t => <Toast key={t.id} toast={t} labels={labels} dispatch={dispatch} runUndo={runUndo} />)}
        </div>
      </section>
    </Context.Provider>
  );
}

function Toast({ toast, labels, dispatch, runUndo }: { toast: ToastState; labels: ToastWords; dispatch: (a: Parameters<typeof toastReducer>[1]) => void; runUndo: (id: string) => Promise<void> }): ReactElement {
  const { id, deadline } = toast;
  useEffect(() => {
    if (deadline === null) return;
    const timer = setTimeout(() => dispatch({ type: "expire", id, now: Date.now() }), Math.max(0, deadline - Date.now()));
    return () => clearTimeout(timer);
  }, [id, deadline, dispatch]);
  const text = toast.phase === "undone" ? labels.undone : toast.phase === "failed" ? toast.note ?? labels.undoFailed : toast.text;
  return (
    <div
      className={`ck-toast${toast.tone === "error" || toast.phase === "failed" ? " ck-toast-error" : ""}${toast.sent ? " ck-toast-sent" : ""}`}
      data-phase={toast.phase}
      data-toast-id={id}
      onMouseEnter={() => dispatch({ type: "hover", id, on: true, now: Date.now() })}
      onMouseLeave={() => dispatch({ type: "hover", id, on: false, now: Date.now() })}
      onFocus={() => dispatch({ type: "focus", id, on: true, now: Date.now() })}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) dispatch({ type: "focus", id, on: false, now: Date.now() }); }}
    >
      {toast.sent && <SentIcon />}
      <p className="ck-toast-text">{text}</p>
      {toast.undo && (toast.phase === "open" || toast.phase === "undoing") && (
        <button type="button" className="ck-toast-undo" aria-keyshortcuts="Control+Z Meta+Z" aria-disabled={toast.phase === "undoing" ? true : undefined} onClick={() => { if (toast.phase === "open") void runUndo(id); }}>
          <UndoIcon />{toast.phase === "undoing" ? labels.undoing : labels.undo}
        </button>
      )}
      <button type="button" className="ck-toast-close" onClick={() => dispatch({ type: "dismiss", id })}>
        <CloseIcon /><span className="ck-vh">{labels.dismiss}</span>
      </button>
    </div>
  );
}
