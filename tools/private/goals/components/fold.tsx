"use client";

import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { Gear } from "./icons.tsx";

// On a phone, the Company page's choices (the cycle, how it goes, a team,
// an owner) fold behind one "Filters" button, so the tree shows first — as
// Tasks folds a board's view and filters. On a larger screen they are all
// in sight and the button is not there (app/globals.css, .fold-area).
// FoldArea holds the state; FoldButton, placed where the page wants it,
// opens and closes it; what folds carries the class "foldable".
const Fold = createContext<{ open: boolean; toggle: () => void; id: string } | null>(null);

export function FoldArea({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <Fold.Provider value={{ open, toggle: () => setOpen(o => !o), id }}>
      <div id={id} className={`fold-area${open ? " is-open" : ""}`}>{children}</div>
    </Fold.Provider>
  );
}

export function FoldButton({ label, on, onLabel }: { label: string; on: number; onLabel: string }) {
  const fold = useContext(Fold);
  if (!fold) return null;
  return (
    <button type="button" className="fold-toggle" aria-expanded={fold.open} aria-controls={fold.id} onClick={fold.toggle}>
      <Gear />{label}{on > 0 && <span className="count" aria-label={onLabel}>{on}</span>}
    </button>
  );
}
