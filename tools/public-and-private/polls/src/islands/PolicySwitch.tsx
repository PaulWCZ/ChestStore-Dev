import { Switch } from "@argentic/chest-ui/components";
import { useState } from "react";
import { call, toast } from "../core/client.tsx";

// An admin's settings: may every member start a poll (the default), or
// organisers only? May members start company surveys — a pulse that comes
// back, eNPS (off by default: organisers only)? Takes effect at once: the
// kit's Switch (a checkbox with the switch role).
export function PolicySwitch({ on, which, label, hint, saved }: { on: boolean; which: "create" | "surveys"; label: string; hint: string; saved: string }) {
  const [value, setValue] = useState(on);
  const [busy, setBusy] = useState(false);
  async function change(next: boolean) {
    setValue(next);
    setBusy(true);
    const result = await call("setPolicy", { which, on: next });
    setBusy(false);
    if (!result.ok) return setValue(!next);
    toast({ id: "policy-" + which, text: saved });
  }
  return <Switch className="policy-switch" label={<strong>{label}</strong>} hint={hint} checked={value} disabled={busy} onChange={next => void change(next)} />;
}
