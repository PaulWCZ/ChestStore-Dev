"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

// Short messages at the bottom of the screen, read by screen readers
// (role=status), with one optional action ("Undo"). Instead of "Are you
// sure?": do it, and offer to undo it. A toast may last longer (ms) and do
// something when its time is over without its action (onExpire): the
// "Undo" of a post about to be sent.
type Options = { ms?: number; onExpire?: () => void };
type Toast = { id: number; text: string; action?: { label: string; run: () => void }; options: Options };
const Context = createContext<(text: string, action?: Toast["action"], options?: Options) => void>(() => {});

export function useToast() {
  return useContext(Context);
}

export function Toasts({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const show = useCallback((text: string, action?: Toast["action"], options: Options = {}) => {
    const id = next.current++;
    setToasts(list => [...list.slice(-2), { id, text, ...(action ? { action } : {}), options }]);
  }, []);
  const close = useCallback((id: number) => setToasts(list => list.filter(t => t.id !== id)), []);
  // The page runs in the browser: its buttons answer (browser tests wait
  // for this rather than for a time).
  useEffect(() => { document.documentElement.dataset["hydrated"] = ""; }, []);
  return (
    <Context.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map(t => <ToastItem key={t.id} toast={t} close={close} />)}
      </div>
    </Context.Provider>
  );
}

function ToastItem({ toast, close }: { toast: Toast; close: (id: number) => void }) {
  const acted = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      close(toast.id);
      if (!acted.current) toast.options.onExpire?.();
    }, toast.options.ms ?? (toast.action ? 8000 : 4000));
    return () => clearTimeout(timer);
  }, [toast, close]);
  return (
    <div className="toast">
      <span>{toast.text}</span>
      {toast.action && <button type="button" className="button link" onClick={() => { acted.current = true; toast.action!.run(); close(toast.id); }}>{toast.action.label}</button>}
    </div>
  );
}
