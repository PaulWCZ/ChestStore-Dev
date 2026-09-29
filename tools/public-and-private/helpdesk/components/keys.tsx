"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Keyboard shortcuts for those who answer all day (as in Help Scout or
// Zendesk): j/k move in the inbox, Enter opens, r reply, n note, e close,
// c a new ticket, / search, ? this list. Never while typing in a field.
export function isTyping(e: KeyboardEvent): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return true;
  const el = e.target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

export function Keys({ canCreate, t }: { canCreate: boolean; t: { keys: string; keysClose: string; keyList: Record<"next" | "previous" | "open" | "select" | "reply" | "note" | "close" | "create" | "search" | "help", string> } }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      if (e.key === "?") {
        e.preventDefault();
        setOpen(o => !o);
      } else if (e.key === "/") {
        const search = document.getElementById("q") as HTMLInputElement | null;
        if (search) {
          e.preventDefault();
          search.focus();
        }
      } else if (e.key === "c" && canCreate) {
        e.preventDefault();
        router.push("/chest/new");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canCreate, router]);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const rows: [string, keyof typeof t.keyList][] = [["j", "next"], ["k", "previous"], ["Enter", "open"], ["x", "select"], ["r", "reply"], ["n", "note"], ["e", "close"], ["c", "create"], ["/", "search"], ["?", "help"]];
  return (
    <dialog ref={dialog} className="keys" aria-labelledby="keys-title" onClose={() => setOpen(false)}>
      <h2 id="keys-title">{t.keys}</h2>
      <dl>{rows.map(([key, what]) => <div key={key}><dt><kbd>{key}</kbd></dt><dd>{t.keyList[what]}</dd></div>)}</dl>
      <form method="dialog"><button className="button small quiet">{t.keysClose}</button></form>
    </dialog>
  );
}
