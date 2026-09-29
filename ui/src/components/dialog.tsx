"use client";

// A modal dialog on the platform's <dialog>: the browser traps and restores
// focus and makes the page behind inert. What the kit adds:
// - it opens on its first field (whoever opens "New board" and types,
//   types the name), else its first control — never on the close button;
// - ids are unique (useId), so two dialogs on a page never share a title;
// - a click on the backdrop closes it only when nothing was typed: when
//   `dirty`, Escape, the close button and the backdrop ask first ("Discard
//   your changes?"), inside the dialog — never window.confirm;
// - `alert`: an alertdialog for an irreversible act (Erase): it opens on
//   the safe button, the backdrop does nothing, Escape is "Cancel".
import { useCallback, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import { AlertIcon, CloseIcon } from "./icons.js";
import { en, type DialogWords } from "./words.js";

const fieldSelector = "input:not([type=hidden]):not([type=radio]):not([type=checkbox]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly]), select:not([disabled])";
const controlSelector = "input:not([type=hidden]):not([disabled]), button:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export type DialogProps = {
  readonly open: boolean;
  readonly title: ReactNode;
  // Called when the person closes it (Escape, the close button, the
  // backdrop) — and, when dirty, only once they chose to discard.
  readonly onClose: () => void;
  readonly children?: ReactNode;
  // A line under the title.
  readonly description?: ReactNode;
  // The buttons at the bottom (the main one last).
  readonly footer?: ReactNode;
  // Something was typed: closing asks first.
  readonly dirty?: boolean;
  readonly labels?: DialogWords;
  readonly size?: "s" | "m" | "l";
  readonly className?: string;
};

export function Dialog({ open, title, onClose, children, description, footer, dirty = false, labels = en.dialog, size = "m", className }: DialogProps): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [asking, setAsking] = useState(false);
  const keep = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setAsking(false);
      d.showModal();
      const first = body.current?.querySelector<HTMLElement>(fieldSelector) ?? body.current?.querySelector<HTMLElement>(controlSelector) ?? d.querySelector<HTMLElement>("footer " + controlSelector);
      first?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);

  // Asking: focus on "Keep editing". Back to editing: focus on the field
  // (after the body is no longer inert — focusing it before would fail).
  const back = useRef(false);
  useEffect(() => {
    if (asking) keep.current?.focus();
    else if (back.current) body.current?.querySelector<HTMLElement>(fieldSelector)?.focus();
    back.current = false;
  }, [asking]);

  const request = useCallback(() => {
    if (dirty) setAsking(true);
    else onClose();
  }, [dirty, onClose]);

  return (
    <dialog
      ref={ref}
      className={`ck-dialog ck-dialog-${size}${className ? " " + className : ""}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      // Escape: the browser's "cancel". Refused while dirty (asks instead).
      // React passes a nested dialog's cancel and close events up to this
      // one (a Confirm opened from inside it): only this dialog's own count,
      // or closing the inner one closed this one too (0.2.2).
      onCancel={e => { if (e.target !== e.currentTarget) return; e.preventDefault(); if (asking) { back.current = true; setAsking(false); } else request(); }}
      onClose={e => { if (e.target === e.currentTarget && open) onClose(); }}
      onClick={e => { if (e.target === ref.current) request(); }}
    >
      <div className="ck-dialog-panel">
        <header className="ck-dialog-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="ck-icon-button" onClick={request}><CloseIcon /><span className="ck-vh">{labels.close}</span></button>
        </header>
        {description && <p id={descriptionId} className="ck-dialog-description">{description}</p>}
        <div className="ck-dialog-body" ref={body} inert={asking ? true : undefined}>{open ? children : null}</div>
        {footer && <footer className="ck-dialog-foot" inert={asking ? true : undefined}>{footer}</footer>}
        {asking && (
          <div className="ck-dialog-ask" role="alertdialog" aria-labelledby={titleId + "-ask"} aria-describedby={titleId + "-ask-body"}>
            <p id={titleId + "-ask"} className="ck-dialog-ask-title"><AlertIcon />{labels.discardTitle}</p>
            <p id={titleId + "-ask-body"}>{labels.discardBody}</p>
            <div className="ck-row">
              <button type="button" className="ck-button ck-button-quiet" onClick={() => { setAsking(false); onClose(); }}>{labels.discard}</button>
              <button type="button" ref={keep} className="ck-button" onClick={() => { back.current = true; setAsking(false); }}>{labels.keepEditing}</button>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}

export type ConfirmProps = {
  readonly open: boolean;
  readonly title: ReactNode;
  // What will happen, in plain words ("Léa’s answers are erased for good.
  // This cannot be undone.").
  readonly body: ReactNode;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  // "danger" (the default) paints the confirm button as destructive.
  readonly tone?: "danger" | "accent";
  readonly busy?: boolean;
  // Anything more (a field to type the name, a checkbox).
  readonly children?: ReactNode;
};

// Confirm: an alertdialog for an act that cannot be undone. Everything
// reversible uses a toast with Undo instead. Opens on Cancel; the backdrop
// does nothing; Escape cancels.
export function Confirm({ open, title, body, confirmLabel, cancelLabel, onConfirm, onCancel, tone = "danger", busy = false, children }: ConfirmProps): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      cancel.current?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} role="alertdialog" className="ck-dialog ck-dialog-s ck-confirm" aria-labelledby={titleId} aria-describedby={bodyId}
      onCancel={e => { if (e.target !== e.currentTarget) return; e.preventDefault(); if (!busy) onCancel(); }}
      onClose={e => { if (e.target === e.currentTarget && open) onCancel(); }}>
      <div className="ck-dialog-panel">
        <header className="ck-dialog-head">
          <h2 id={titleId}>{tone === "danger" && <AlertIcon />}{title}</h2>
        </header>
        <div id={bodyId} className="ck-dialog-body ck-confirm-body">{typeof body === "string" ? <p>{body}</p> : body}</div>
        {open && children ? <div className="ck-dialog-body">{children}</div> : null}
        <footer className="ck-dialog-foot">
          <button type="button" ref={cancel} className="ck-button ck-button-quiet" disabled={busy} onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className={`ck-button${tone === "danger" ? " ck-button-danger" : ""}`} disabled={busy} aria-busy={busy || undefined} onClick={onConfirm}>{confirmLabel}</button>
        </footer>
      </div>
    </dialog>
  );
}
