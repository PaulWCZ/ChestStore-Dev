"use client";

import { Switch, useToast } from "@argentic/chest-ui/components";
import { useState, useTransition, type ReactNode } from "react";
import { Clock, Mail } from "../../components/icons.tsx";
import { format } from "../../lib/i18n/format.ts";
import type { Catalogue } from "../../lib/i18n/index.ts";
import type { Result } from "../../lib/errors.ts";
import { setEmail, setReminder } from "./actions.ts";

type Words = { label: string; errors: Catalogue["errors"] };

// A personal switch (the kit's), saved at once (put back and explained if
// refused).
function Personal({ on, icon, save, t }: { on: boolean; icon: ReactNode; save: (on: boolean) => Promise<Result<null>>; t: Words }) {
  const [checked, setChecked] = useState(on);
  const [, start] = useTransition();
  const toast = useToast();
  return (
    <Switch className="reminder-switch" checked={checked} label={<>{icon}<span>{t.label}</span></>} onChange={next => {
      setChecked(next);
      start(async () => {
        const r = await save(next);
        if (!r.ok) { setChecked(!next); toast({ text: format(t.errors[r.error], r.values), tone: "error" }); }
      });
    }} />
  );
}

// The morning reminder's one switch: on unless its owner turns it off.
export function ReminderSwitch({ on, t }: { on: boolean; t: Words }) {
  return <Personal on={on} icon={<Clock />} save={setReminder} t={t} />;
}

// Email beside the bell: on unless its owner turns it off.
export function EmailSwitch({ on, t }: { on: boolean; t: Words }) {
  return <Personal on={on} icon={<Mail />} save={setEmail} t={t} />;
}
