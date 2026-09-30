"use client";

import { useState, useTransition } from "react";
import { useToast } from "@argentic/chest-ui/components";
import { Mail } from "../../../components/icons.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { setEmail } from "../actions.ts";

// Reminders by email too: on unless its owner turns it off, saved at once
// (put back and explained if refused). The Chest has the last word: what
// the person chose there for every tool (`mailPreference`, studio.15,
// applied by mail.send) is said under the switch when it holds emails back.
export function EmailSwitch({ on, note, t }: { on: boolean; note?: string | null; t: { label: string; on: string; off: string; errors: Catalogue["errors"] } }) {
  const [checked, setChecked] = useState(on);
  const [, start] = useTransition();
  const toast = useToast();
  return (
    <>
    <label className="email-switch">
      <input type="checkbox" role="switch" checked={checked} onChange={e => {
        const next = e.target.checked;
        setChecked(next);
        start(async () => {
          const r = await setEmail(next);
          if (!r.ok) { setChecked(!next); return void toast({ id: "email", text: format(t.errors[r.error], r.values ?? {}), tone: "error" }); }
          toast({ id: "email", text: next ? t.on : t.off });
        });
      }} />
      <Mail />
      <span>{t.label}</span>
    </label>
    {note && checked && <p className="email-note">{note}</p>}
    </>
  );
}
