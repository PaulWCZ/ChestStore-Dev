"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Dialog } from "../../../components/dialog.tsx";
import { Gift } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import type { ErrorCode } from "../../../lib/app-error.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format, plural } from "../../../lib/i18n/format.ts";
import { giveEveryone, setApprover } from "../actions.ts";

// Who answers a person's requests: HR (empty) or one of the people whose
// role answers requests. Saved as soon as it changes.
export function ApproverSelect({ memberId, value, options, label, t }: { memberId: string; value: string; options: { id: string; name: string }[]; label: string; t: { team: Catalogue["team"]; errors: Catalogue["errors"] } }) {
  const router = useRouter();
  const toast = useToast();
  const [current, setCurrent] = useState(value);
  const [pending, start] = useTransition();
  return (
    <select className="field compact" aria-label={label} value={current} disabled={pending} onChange={e => {
      const next = e.target.value;
      const before = current;
      setCurrent(next);
      start(async () => {
        const result = await setApprover(memberId, next || null);
        if (!result.ok) {
          setCurrent(before);
          toast(format(t.errors[result.error as ErrorCode], result.values));
        } else toast(t.team.saved);
        router.refresh();
      });
    }}>
      <option value="">{t.team.approverHr}</option>
      {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );
}

// The same days for everyone shown (this year's RTT, a day the company
// offers).
export function GiveEveryone({ types, count, t }: { types: { id: string; name: string }[]; count: number; t: { team: Catalogue["team"]; errors: Catalogue["errors"]; home: Catalogue["home"] } }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [days, setDays] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (types.length === 0 || count === 0) return null;
  return (
    <>
      <button type="button" className="button quiet" onClick={() => setOpen(true)}><Gift />{t.team.give}</button>
      <Dialog open={open} title={t.team.giveTitle} closeLabel={t.home.cancel} onClose={() => setOpen(false)}>
        <form className="stack" onSubmit={e => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const result = await giveEveryone({ typeId, days, reason });
            if (!result.ok) {
              setError(format(t.errors[result.error as ErrorCode], result.values));
              return;
            }
            setOpen(false);
            setDays("");
            setReason("");
            toast(plural(t.team.given, result.value, document.documentElement.lang || "en"));
            router.refresh();
          });
        }}>
          <p className="muted">{t.team.giveHint}</p>
          <label htmlFor="give-type">{t.team.type}</label>
          <select id="give-type" className="field" value={typeId} onChange={e => setTypeId(e.target.value)}>
            {types.map(ty => <option key={ty.id} value={ty.id}>{ty.name}</option>)}
          </select>
          <label htmlFor="give-days">{t.team.days}</label>
          <input id="give-days" className="field" inputMode="decimal" required value={days} onChange={e => setDays(e.target.value)} />
          <label htmlFor="give-reason">{t.team.reason}</label>
          <input id="give-reason" className="field" required maxLength={300} placeholder={t.team.reasonPlaceholder} value={reason} onChange={e => setReason(e.target.value)} />
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" className="button" disabled={pending}>{t.team.add}</button>
        </form>
      </Dialog>
    </>
  );
}
