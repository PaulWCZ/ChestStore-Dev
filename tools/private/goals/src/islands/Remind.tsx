import { call, toast } from "@argentic/chest-app/client";
import { useState } from "react";
import { Bell, Check } from "../components/icons.tsx";
import type { Catalogue } from "../i18n/index.ts";
import { format, plural } from "../shared/format.ts";

type Words = Pick<Catalogue["chase"], "remind" | "remindName" | "reminded" | "remindedToast" | "remindedBell">;

// "Remind" beside one person of the waiting list (src/pages/chase-list.tsx):
// one bell item and one email, once a day whoever asks; never an Undo (it
// left). Its props are one person's: the list itself is the server's.
export function Remind({ owner, name, reminded, t }: { owner: string; name: string; reminded: boolean; t: Words }) {
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  if (done || reminded) return <span className="tag done-tag"><Check />{t.reminded}</span>;
  async function remind() {
    if (pending) return;
    setPending(true);
    const r = await call("remind", { owner }, { quiet: true, refresh: false });
    setPending(false);
    if (!r.ok && r.error !== "already_reminded") return toast({ text: r.message, tone: "error" });
    setDone(true);
    // "By email" only when one left.
    toast({ id: `remind-${owner}`, text: r.ok ? format(r.value.emailed ? t.remindedToast : t.remindedBell, { name }) : r.message, sent: true });
  }
  return <button type="button" className="button quiet small" disabled={pending} aria-busy={pending} aria-label={format(t.remindName, { name })} onClick={() => void remind()}><Bell />{t.remind}</button>;
}

// "Remind all" (admins): everyone still waiting at once, those reminded
// today skipped; the page then reads itself again.
export function RemindAll({ count, locale, t }: { count: number; locale: string; t: Pick<Catalogue["chase"], "remindAll" | "remindedAll"> }) {
  const [pending, setPending] = useState(false);
  async function remindAll() {
    if (pending) return;
    setPending(true);
    const r = await call("remindAll", {}, { quiet: true });
    setPending(false);
    if (!r.ok) return toast({ text: r.message, tone: "error" });
    toast({ id: "remind-all", text: plural(t.remindedAll, r.value, locale), sent: true });
  }
  return <button type="button" className="button quiet" disabled={pending} aria-busy={pending} onClick={() => void remindAll()}><Bell />{plural(t.remindAll, count, locale)}</button>;
}
