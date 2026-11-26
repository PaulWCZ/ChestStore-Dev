import { Switch } from "@argentic/chest-ui/components";
import { useEffect, useState } from "react";
import { call } from "@argentic/chest-app/client";

// On or off, in one click (the kit's Switch; it shows the new state at
// once, and the old one again if the server refuses): an off type keeps
// its page but takes no booking.
export function TypeSwitch({ id, active, label, name }: { id: string; active: boolean; label: { on: string; off: string }; name: string }) {
  const [shown, show] = useState(active);
  const [pending, setPending] = useState(false);
  useEffect(() => show(active), [active]);
  return (
    <Switch className="type-switch" checked={shown} disabled={pending} label={<><span className="visually-hidden">{name}: </span>{shown ? label.on : label.off}</>} onChange={async on => {
      show(on);
      setPending(true);
      const r = await call("setTypeActive", { id, active: on });
      setPending(false);
      if (!r.ok) show(!on);
    }} />
  );
}
