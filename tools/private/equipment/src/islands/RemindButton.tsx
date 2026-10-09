import { call, navigate, toast } from "@argentic/chest-app/client";
import { useState, useTransition } from "react";
import type { Catalogue } from "../i18n/index.ts";
import { format } from "../i18n/format.ts";
import { Bell } from "../components/icons.tsx";

type Words = { overview: Catalogue["overview"] };

// "Remind them", beside a receipt nobody confirmed: the holder hears it in
// the bell again (the Chest mails it to them if they chose so). A reminder left
// is not taken back (no Undo: "sent"); once a day at most, then the button
// says it was done.
export function RemindButton({ id, name, item, done, t }: { id: string; name: string; item: string; done: boolean; t: Words }) {
  const [sent, setSent] = useState(done);
  const [pending, start] = useTransition();
  const w = t.overview;
  if (sent) return <span className="small muted reminded">{w.remindedToday}</span>;
  return (
    <button type="button" className="button quiet small" disabled={pending} aria-label={format(w.remindLabel, { name, item })} onClick={() => start(async () => {
      const r = await call("remindHolder", { id });
      if (!r.ok) {
        if (r.error === "reminded_today") setSent(true);
        return;
      }
      setSent(true);
      toast({ text: w.reminded, sent: true });
    })}><Bell /><span>{w.remind}</span></button>
  );
}
