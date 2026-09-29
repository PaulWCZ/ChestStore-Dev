"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

// Short messages at the bottom of the screen, read by screen readers
// (role=status), with one optional action ("Undo"). Instead of "Are you
// sure?": do it, and offer to undo it.
type Toast = { id: number; text: string; action?: { label: string; run: () => void } };
const Context = createContext<(text: string, action?: Toast["action"]) => void>(() => {});

export function useToast() {
  return useContext(Context);
}

export function Toasts({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const show = useCallback((text: string, action?: Toast["action"]) => {
    const id = next.current++;
    setToasts(list => [...list.slice(-2), { id, text, ...(action ? { action } : {}) }]);
  }, []);
  const close = useCallback((id: number) => setToasts(list => list.filter(t => t.id !== id)), []);
  return (
    <Context.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map(t => <ToastItem key={t.id} toast={t} close={close} />)}
      </div>
    </Context.Provider>
  );
}

// A toast stays 4 seconds, or 10 with an action; the time stops while the
// pointer is on it or the keyboard is in it (WCAG 2.2.1): a keyboard or
// screen-reader user has time to reach "Undo".
function ToastItem({ toast, close }: { toast: Toast; close: (id: number) => void }) {
  const left = useRef(toast.action ? 10000 : 4000);
  const [held, setHeld] = useState(0);
  useEffect(() => {
    if (held > 0) return;
    const started = Date.now();
    const timer = setTimeout(() => close(toast.id), left.current);
    return () => {
      clearTimeout(timer);
      left.current = Math.max(1500, left.current - (Date.now() - started));
    };
  }, [toast, close, held]);
  const hold = (by: number) => setHeld(h => Math.max(0, h + by));
  return (
    <div className="toast" onPointerEnter={() => hold(1)} onPointerLeave={() => hold(-1)} onFocus={() => hold(1)} onBlur={() => hold(-1)}>
      <span>{toast.text}</span>
      {toast.action && <button type="button" className="button link" onClick={() => { toast.action!.run(); close(toast.id); }}>{toast.action.label}</button>}
    </div>
  );
}
