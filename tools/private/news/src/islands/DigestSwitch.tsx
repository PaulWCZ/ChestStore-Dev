import { useOptimistic, useTransition } from "react";
import { Mail } from "../components/icons.tsx";
import { call, toast } from "@argentic/chest-app/client";
import type { Catalogue } from "../i18n/index.ts";

// The weekly digest by email too, or only in the bell: one switch, at the
// foot of the front page (and named in every digest email). No switch on a
// Chest that sends no email (mail.available(), studio.16): the line says so.
export function DigestSwitch({ on, mail, t }: { on: boolean; mail: boolean; t: Catalogue["front"] }) {
  const [, start] = useTransition();
  const [shown, set] = useOptimistic(on);
  if (!mail) return <p className="digest-switch"><Mail /><span>{t.digestNoMail}</span></p>;
  return (
    <p className="digest-switch">
      <Mail />
      <span>{shown ? t.digestOn : t.digestOff}</span>
      <button type="button" className="link-button" onClick={() => start(async () => {
        set(!shown);
        const r = await call("digestByEmail", { on: !shown });
        if (r.ok) toast({ id: "digest", text: shown ? t.digestStopped : t.digestStarted });
      })}>{shown ? t.digestTurnOff : t.digestTurnOn}</button>
    </p>
  );
}
