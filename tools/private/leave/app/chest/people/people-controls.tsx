"use client";

import { Dialog, PeoplePicker, useToast } from "@argentic/chest-ui/components";
import { localSearch } from "@argentic/chest-ui/components/logic";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Gift } from "../../../components/icons.tsx";
import type { ErrorCode } from "../../../lib/app-error.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format, plural } from "../../../lib/i18n/format.ts";
import { giveEveryone, setApprover } from "../actions.ts";

// The choice that means "no approver: HR answers" (never a member id).
const hrChoice = "hr";

// Who answers a person's requests: HR, or one of the people whose role
// answers requests — typed and chosen in the kit's people picker, saved as
// soon as it is chosen. Emptying the field changes nothing (the name comes
// back when the field is left): HR is a choice of the list.
export function ApproverPicker({ memberId, value, options, label, locale, t }: {
  memberId: string;
  locale: string;
  value: string | null;
  options: { id: string; name: string; photo: string | null }[];
  label: string;
  t: { team: Catalogue["team"]; errors: Catalogue["errors"]; peoplePicker: Catalogue["peoplePicker"] };
}) {
  const router = useRouter();
  const toast = useToast();
  const hr = { id: hrChoice, name: t.team.approverHr, photo: null };
  const choices = [hr, ...options];
  const [current, setCurrent] = useState(value ?? hrChoice);
  const [pending, start] = useTransition();
  const chosen = choices.filter(c => c.id === current);
  return (
    <PeoplePicker
      label={label}
      value={chosen}
      search={localSearch(choices)}
      suggestions={choices.slice(0, 8)}
      disabled={pending}
      labels={t.peoplePicker}
      lang={locale}
      onChange={next => {
        const pick = next[0];
        if (!pick || pick.id === current) return;
        const before = current;
        setCurrent(pick.id);
        start(async () => {
          const result = await setApprover(memberId, pick.id === hrChoice ? null : pick.id);
          if (!result.ok) {
            setCurrent(before);
            toast({ text: format(t.errors[result.error as ErrorCode], result.values), tone: "error" });
          } else toast({ id: `approver-${memberId}`, text: t.team.saved });
          router.refresh();
        });
      }}
    />
  );
}

// The same days for everyone shown (this year's RTT, a day the company
// offers), in the kit's dialog: what was typed is not lost to a stray tap
// outside it.
export function GiveEveryone({ types, count, t }: { types: { id: string; name: string }[]; count: number; t: { team: Catalogue["team"]; errors: Catalogue["errors"]; home: Catalogue["home"]; dialog: Catalogue["dialog"] } }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [days, setDays] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (types.length === 0 || count === 0) return null;
  const close = () => {
    setOpen(false);
    setDays("");
    setReason("");
    setError(null);
  };
  return (
    <>
      <button type="button" className="button quiet" onClick={() => setOpen(true)}><Gift />{t.team.give}</button>
      <Dialog
        open={open}
        title={t.team.giveTitle}
        description={t.team.giveHint}
        onClose={close}
        dirty={days !== "" || reason !== ""}
        labels={t.dialog}
        size="s"
        footer={(
          <>
            <button type="button" className="button quiet" onClick={close}>{t.home.cancel}</button>
            <button type="submit" form="give-form" className="button" disabled={pending}>{t.team.add}</button>
          </>
        )}
      >
        <form id="give-form" className="stack" onSubmit={e => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const result = await giveEveryone({ typeId, days, reason });
            if (!result.ok) {
              setError(format(t.errors[result.error as ErrorCode], result.values));
              return;
            }
            close();
            toast({ text: plural(t.team.given, result.value, document.documentElement.lang || "en") });
            router.refresh();
          });
        }}>
          <div className="field-group">
            <label className="field-label" htmlFor="give-type">{t.team.type}</label>
            <select id="give-type" className="field" value={typeId} onChange={e => setTypeId(e.target.value)}>
              {types.map(ty => <option key={ty.id} value={ty.id}>{ty.name}</option>)}
            </select>
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="give-days">{t.team.days}</label>
            <input id="give-days" className="field" inputMode="decimal" required value={days} onChange={e => setDays(e.target.value)} />
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="give-reason">{t.team.reason}</label>
            <input id="give-reason" className="field" required maxLength={300} placeholder={t.team.reasonPlaceholder} value={reason} onChange={e => setReason(e.target.value)} />
          </div>
          {error && <p className="error" role="alert">{error}</p>}
        </form>
      </Dialog>
    </>
  );
}
