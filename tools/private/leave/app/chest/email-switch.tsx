"use client";

import { Switch, useToast } from "@argentic/chest-ui/components";
import { useState, useTransition } from "react";
import { Mail } from "../../components/icons.tsx";
import type { ErrorCode } from "../../lib/app-error.ts";
import { format } from "../../lib/i18n/format.ts";
import { setEmail } from "./actions.ts";

// Email beside the bell (the kit's switch, saved at once; put back and
// explained if refused): on unless its owner turns it off.
export function EmailSwitch({ on, t }: { on: boolean; t: { label: string; errors: Record<ErrorCode, string> } }) {
  const [checked, setChecked] = useState(on);
  const [, start] = useTransition();
  const toast = useToast();
  return (
    <Switch className="email-switch" checked={checked} label={<><Mail /><span>{t.label}</span></>} onChange={next => {
      setChecked(next);
      start(async () => {
        const r = await setEmail(next);
        if (!r.ok) { setChecked(!next); toast({ text: format(t.errors[r.error], r.values ?? {}), tone: "error" }); }
      });
    }} />
  );
}
