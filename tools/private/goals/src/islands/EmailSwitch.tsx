import { call, toast } from "@argentic/chest-app/client";
import { useState } from "react";
import { Mail } from "../components/icons.tsx";

// Reminders by email too: on unless its owner turns it off, saved at once
// (put back and explained if refused). The Chest has the last word: what
// the person chose there for every tool (mail.preference(), applied by
// mail.send) is said under the switch when it holds emails back.
export function EmailSwitch({ on, note, t }: { on: boolean; note: string | null; t: { label: string; on: string; off: string } }) {
  const [checked, setChecked] = useState(on);
  async function change(next: boolean) {
    setChecked(next);
    const r = await call("setEmail", { on: next }, { quiet: true });
    if (!r.ok) {
      setChecked(!next);
      return toast({ id: "email", text: r.message, tone: "error" });
    }
    toast({ id: "email", text: next ? t.on : t.off });
  }
  return (
    <>
      <label className="email-switch">
        <input type="checkbox" role="switch" checked={checked} onChange={e => void change(e.target.checked)} />
        <Mail />
        <span>{t.label}</span>
      </label>
      {note && checked && <p className="email-note">{note}</p>}
    </>
  );
}
