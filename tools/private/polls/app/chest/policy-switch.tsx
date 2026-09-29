"use client";

import { Switch, useToast } from "@argentic/chest-ui/components";
import { useState } from "react";
import { format } from "../../lib/i18n/format.ts";
import type { en } from "../../lib/i18n/en.ts";
import { setMembersCreate } from "./actions.ts";

// An admin's one setting: may every member start a poll (the default), or
// organisers only?
type Words = { settings: Record<keyof typeof en.settings, string>; errors: Record<keyof typeof en.errors, string> };

export function PolicySwitch({ on, t }: { on: boolean; t: Words }) {
  const toast = useToast();
  const [value, setValue] = useState(on);
  const [busy, setBusy] = useState(false);
  async function change(next: boolean) {
    setValue(next);
    setBusy(true);
    const result = await setMembersCreate(next);
    setBusy(false);
    if (!result.ok) {
      setValue(!next);
      return toast({ text: format(t.errors[result.error], result.values ?? {}), tone: "error" });
    }
    toast({ id: "policy", text: t.settings.saved });
  }
  // Takes effect at once: the kit's Switch (a checkbox with the switch role).
  return <Switch className="policy-switch" label={<strong>{t.settings.membersCreate}</strong>} hint={t.settings.membersCreateHint} checked={value} disabled={busy} onChange={next => void change(next)} />;
}
