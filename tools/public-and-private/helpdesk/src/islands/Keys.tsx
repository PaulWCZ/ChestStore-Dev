import { navigate } from "@argentic/chest-app/client";
import { Dialog } from "@argentic/chest-ui/components";
import type { DialogWords } from "@argentic/chest-ui/components/logic";
import { useEffect, useState } from "react";
import { isTyping } from "../components/keys.ts";

// The shortcuts every team page knows: ? shows the list (in the kit's
// dialog), c starts a new ticket. The inbox's (j, k, x) and a ticket's
// (r, n, e) are their islands'.
export type KeyWords = {
  keys: string;
  keysClose: string;
  keyList: Record<"next" | "previous" | "open" | "select" | "reply" | "note" | "close" | "create" | "search" | "help", string>;
  dialog: DialogWords;
};

export function Keys({ canCreate, t }: { canCreate: boolean; t: KeyWords }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      // A dialog of the page is open: its keys are its own.
      if (!open && document.querySelector("dialog[open]")) return;
      if (e.key === "?") {
        e.preventDefault();
        setOpen(o => !o);
      } else if (e.key === "c" && canCreate && !open) {
        e.preventDefault();
        void navigate("/chest/new");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canCreate, open]);
  const rows: [string, keyof KeyWords["keyList"]][] = [["j", "next"], ["k", "previous"], ["Enter", "open"], ["x", "select"], ["r", "reply"], ["n", "note"], ["e", "close"], ["c", "create"], ["/", "search"], ["?", "help"]];
  return (
    <Dialog open={open} title={t.keys} onClose={() => setOpen(false)} size="s" className="keys" labels={t.dialog}
      footer={<button type="button" className="ck-button ck-button-quiet" onClick={() => setOpen(false)}>{t.keysClose}</button>}>
      <dl>{rows.map(([key, what]) => <div key={key}><dt><kbd>{key}</kbd></dt><dd>{t.keyList[what]}</dd></div>)}</dl>
    </Dialog>
  );
}
