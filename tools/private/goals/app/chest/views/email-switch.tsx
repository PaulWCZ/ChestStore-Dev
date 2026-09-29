"use client";

import { useState, useTransition } from "react";
import { Mail } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { setEmail } from "../actions.ts";

// Reminders by email too: on unless its owner turns it off, saved at once
// (put back and explained if refused).
export function EmailSwitch({ on, t }: { on: boolean; t: { label: string; on: string; off: string; errors: Catalogue["errors"] } }) {
  const [checked, setChecked] = useState(on);
  const [, start] = useTransition();
  const toast = useToast();
  return (
    <label className="email-switch">
      <input type="checkbox" role="switch" checked={checked} onChange={e => {
        const next = e.target.checked;
        setChecked(next);
        start(async () => {
          const r = await setEmail(next);
          if (!r.ok) { setChecked(!next); return toast(format(t.errors[r.error], r.values ?? {})); }
          toast(next ? t.on : t.off);
        });
      }} />
      <Mail />
      <span>{t.label}</span>
    </label>
  );
}
