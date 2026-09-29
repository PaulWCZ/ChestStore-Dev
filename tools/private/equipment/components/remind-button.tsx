"use client";

import { useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { remindHolder } from "../app/chest/actions.ts";
import type { Catalogue } from "../lib/i18n/index.ts";
import { format } from "../lib/i18n/format.ts";
import { Bell } from "./icons.tsx";

type Words = { overview: Catalogue["overview"]; errors: Catalogue["errors"] };

// "Remind them", beside a receipt nobody confirmed: the holder hears it in
// the bell again (and by email where the Chest sends it). A reminder left
// is not taken back (no Undo: "sent"); once a day at most, then the button
// says it was done.
export function RemindButton({ id, name, item, done, t }: { id: string; name: string; item: string; done: boolean; t: Words }) {
  const [sent, setSent] = useState(done);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const w = t.overview;
  if (sent) return <span className="small muted reminded">{w.remindedToday}</span>;
  return (
    <button type="button" className="button quiet small" disabled={pending} aria-label={format(w.remindLabel, { name, item })} onClick={() => start(async () => {
      const r = await remindHolder(id);
      if (!r.ok) {
        toast({ text: format(t.errors[r.error], r.values), tone: "error" });
        if (r.error === "reminded_today") setSent(true);
        return;
      }
      setSent(true);
      toast({ text: r.value.mailed ? w.remindedMail : w.reminded, sent: true });
      router.refresh();
    })}><Bell /><span>{w.remind}</span></button>
  );
}
