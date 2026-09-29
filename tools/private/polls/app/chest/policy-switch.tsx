"use client";

import { Switch, useToast } from "@argentic/chest-ui/components";
import { useState } from "react";
import { format } from "../../lib/i18n/format.ts";
import type { en } from "../../lib/i18n/en.ts";
import { setMembersCreate, setMembersSurveys } from "./actions.ts";

// An admin's settings: may every member start a poll (the default), or
// organisers only? May members start company surveys — a pulse that comes
// back, eNPS (off by default: organisers only)?
type Words = { settings: Record<keyof typeof en.settings, string>; errors: Record<keyof typeof en.errors, string> };

export function PolicySwitch({ on, which = "create", t }: { on: boolean; which?: "create" | "surveys"; t: Words }) {
  const toast = useToast();
  const [value, setValue] = useState(on);
  const [busy, setBusy] = useState(false);
  async function change(next: boolean) {
    setValue(next);
    setBusy(true);
    const result = which === "create" ? await setMembersCreate(next) : await setMembersSurveys(next);
    setBusy(false);
    if (!result.ok) {
      setValue(!next);
      return toast({ text: format(t.errors[result.error], result.values ?? {}), tone: "error" });
    }
    toast({ id: "policy-" + which, text: t.settings.saved });
  }
  // Takes effect at once: the kit's Switch (a checkbox with the switch role).
  return <Switch className="policy-switch" label={<strong>{which === "create" ? t.settings.membersCreate : t.settings.membersSurveys}</strong>} hint={which === "create" ? t.settings.membersCreateHint : t.settings.membersSurveysHint} checked={value} disabled={busy} onChange={next => void change(next)} />;
}
