"use client";

import { useState, useTransition } from "react";
import { Clock } from "../../components/icons.tsx";
import { useToast } from "../../components/toast.tsx";
import { format } from "../../lib/i18n/format.ts";
import type { Catalogue } from "../../lib/i18n/index.ts";
import { setReminder } from "./actions.ts";

// The morning reminder's one switch: on unless its owner turns it off.
export function ReminderSwitch({ on, t }: { on: boolean; t: { label: string; errors: Catalogue["errors"] } }) {
  const [checked, setChecked] = useState(on);
  const [, start] = useTransition();
  const toast = useToast();
  return (
    <label className="reminder-switch">
      <input type="checkbox" role="switch" checked={checked} onChange={e => {
        const next = e.target.checked;
        setChecked(next);
        start(async () => {
          const r = await setReminder(next);
          if (!r.ok) { setChecked(!next); toast(format(t.errors[r.error], r.values)); }
        });
      }} />
      <Clock />
      <span>{t.label}</span>
    </label>
  );
}
