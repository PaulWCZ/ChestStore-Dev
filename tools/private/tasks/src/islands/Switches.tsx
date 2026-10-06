import { Switch } from "@argentic/chest-ui/components";
import { useState, type ReactNode } from "react";
import { Clock, Mail } from "../components/icons.tsx";
import { call } from "@argentic/chest-app/client";

// A personal switch (the kit's), saved at once (put back, and the refusal
// said, if the server refuses).
function Personal({ on, icon, label, save }: { on: boolean; icon: ReactNode; label: string; save: (on: boolean) => Promise<{ ok: boolean }> }) {
  const [checked, setChecked] = useState(on);
  return (
    <Switch className="reminder-switch" checked={checked} label={<>{icon}<span>{label}</span></>} onChange={next => {
      setChecked(next);
      void save(next).then(r => { if (!r.ok) setChecked(!next); });
    }} />
  );
}

// The morning reminder's one switch: on unless its owner turns it off.
export function ReminderSwitch({ on, label }: { on: boolean; label: string }) {
  return <Personal on={on} icon={<Clock />} label={label} save={next => call("setReminder", { on: next })} />;
}

// Email beside the bell: on unless its owner turns it off.
export function EmailSwitch({ on, label }: { on: boolean; label: string }) {
  return <Personal on={on} icon={<Mail />} label={label} save={next => call("setEmail", { on: next })} />;
}
