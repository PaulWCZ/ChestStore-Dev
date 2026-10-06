import { call } from "@argentic/chest-app/client";
import { Switch } from "@argentic/chest-ui/components";
import { useState } from "react";
import { Mail } from "../components/icons.tsx";

// Email beside the bell (the kit's switch, saved at once; put back if
// refused — the refusal is a toast in the reader's words): on unless its
// owner turns it off.
export function EmailSwitch({ on, label }: { on: boolean; label: string }) {
  const [checked, setChecked] = useState(on);
  return (
    <Switch className="email-switch" checked={checked} label={<><Mail /><span>{label}</span></>} onChange={next => {
      setChecked(next);
      void call("setEmail", { on: next }, { refresh: false }).then(r => { if (!r.ok) setChecked(!next); });
    }} />
  );
}
