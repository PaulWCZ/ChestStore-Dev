"use client";

import { useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Check, Clock, Moved } from "../../../../components/icons.tsx";
import { Picker } from "../../../../components/picker.tsx";
import { format } from "../../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import type { ZoneGroup } from "../../../../lib/zones.ts";
import { markPaid, moveMeeting } from "../../actions.ts";

type Words = { booking: Catalogue["booking"]; public: Catalogue["public"]; days: Catalogue["days"]; errors: Catalogue["errors"]; answers: Catalogue["answers"] };

// The host moves a meeting (the guest called): a free time of its type,
// the notice aside; the guest gets the new time by email.
export function MoveMeeting({ id, guest, zone, locale, zones, t }: { id: string; guest: string; zone: string; locale: string; zones: ZoneGroup[]; t: Words }) {
  const [open, setOpen] = useState(false);
  const [pending, run] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();
  if (!open) return <button type="button" className="button quiet" onClick={() => setOpen(true)}><Moved />{t.booking.move}</button>;
  return (
    <div className="stack">
      <h2>{t.booking.moveTitle}</h2>
      <Picker hostName="" hostZone={zone} first={null} locale={locale} zones={zones} t={t} source={`/chest/api/slots?except=${id}`}
        chosen={(start, when, _zone, reset) => (
          <div className="stack-s">
            <p style={{ margin: 0 }}><span className="tag free" style={{ fontSize: "var(--text-m)", padding: "6px 14px" }}><Clock />{when}</span></p>
            <div className="row">
              <button type="button" className="button" disabled={pending} onClick={() => run(async () => {
                const r = await moveMeeting(id, start);
                if (!r.ok) {
                  if (r.error === "taken") reset();
                  return setError(format(t.errors[r.error], r.values ?? {}));
                }
                setOpen(false);
                toast({ id: `move-${id}`, text: format(r.value.delivery === "email" ? t.booking.movedToast : t.booking.movedToastPage, { name: guest }), sent: true });
                router.refresh();
              })}><Check />{t.booking.moveConfirm}</button>
              <button type="button" className="button quiet" onClick={() => setOpen(false)}>{t.booking.keepTime}</button>
            </div>
          </div>
        )} />
      {error && <p className="error" role="alert"><Alert />{error}</p>}
    </div>
  );
}

// Paid or not, for a type that asks for a payment: the host marks it.
export function PaidSwitch({ id, paid, t }: { id: string; paid: boolean; t: Words }) {
  const [pending, run] = useTransition();
  const router = useRouter();
  return (
    <span className="row">
      <span className={paid ? "tag free" : "tag"}>{paid ? t.booking.paid : t.booking.unpaid}</span>
      <button type="button" className="link-button" disabled={pending} onClick={() => run(async () => {
        await markPaid(id, !paid);
        router.refresh();
      })}>{paid ? t.booking.markUnpaid : t.booking.markPaid}</button>
    </span>
  );
}
