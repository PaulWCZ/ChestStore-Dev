import { useState } from "react";
import { Alert, Check, Moved } from "../components/icons.tsx";
import { Picker, When, type PickerWords } from "../components/picker.tsx";
import { call, toast } from "@argentic/chest-app/client";
import { format } from "../i18n/format.ts";
import type { Catalogue } from "../i18n/index.ts";
import type { ZoneGroup } from "../shared/zones.ts";

type Words = PickerWords & { booking: Catalogue["booking"] };

// The host moves a meeting (the guest called): a free time of its type,
// the notice aside; the guest gets the new time by email.
export function MoveMeeting({ id, guest, zone, locale, zones, t }: { id: string; guest: string; zone: string; locale: string; zones: ZoneGroup[]; t: Words }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) return <button type="button" className="button quiet" onClick={() => setOpen(true)}><Moved />{t.booking.move}</button>;
  return (
    <div className="stack">
      <h2>{t.booking.moveTitle}</h2>
      <Picker hostName="" hostZone={zone} first={null} locale={locale} zones={zones} t={t} source={`/chest/api/slots?except=${id}`}
        chosen={(start, when, _zone, reset) => (
          <div className="stack-s">
            <p className="chosen"><When when={when} /></p>
            <div className="row">
              <button type="button" className="button" disabled={pending} onClick={async () => {
                setPending(true);
                const r = await call("moveMeeting", { id, start }, { quiet: true });
                setPending(false);
                if (!r.ok) {
                  if (r.error === "taken") reset();
                  return setError(r.message);
                }
                setOpen(false);
                toast({ id: `move-${id}`, text: format(r.value.delivery === "email" ? t.booking.movedToast : t.booking.movedToastPage, { name: guest }), sent: true });
              }}><Check />{t.booking.moveConfirm}</button>
              <button type="button" className="button quiet" onClick={() => setOpen(false)}>{t.booking.keepTime}</button>
            </div>
          </div>
        )} />
      {error && <p className="error" role="alert"><Alert />{error}</p>}
    </div>
  );
}

// Paid or not, for a type that asks for a payment: the host marks it.
export function PaidSwitch({ id, paid, t }: { id: string; paid: boolean; t: { booking: Catalogue["booking"] } }) {
  const [pending, setPending] = useState(false);
  return (
    <span className="row">
      <span className={paid ? "tag free" : "tag"}>{paid ? t.booking.paid : t.booking.unpaid}</span>
      <button type="button" className="link-button" disabled={pending} onClick={async () => {
        setPending(true);
        await call("markPaid", { id, paid: !paid });
        setPending(false);
      }}>{paid ? t.booking.markUnpaid : t.booking.markPaid}</button>
    </span>
  );
}
